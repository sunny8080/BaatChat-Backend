import ApiError from '../utils/ApiError.js';
import SocketError from '../utils/SocketError.js';
import { getCookie } from '../utils/utils.js';
import jwt from 'jsonwebtoken';
import User from '../models/user.model.js';
import { PRESENCE_EVENTS, SOCKET_EVENTS } from './socketEvents.js';
import { onlineUsers } from './onlineUsers.js';
import { registerChatListeners } from './chat.socket.js';
import logger from '../logger/winston.logger.js';
import { registerGroupListeners } from './group.socket.js';

/**
 * Initializes Socket.IO event handlers.
 *
 * @param {import("socket.io").Server} io - Socket.IO server instance.
 * @returns {void}
 */
export const initializeSocketIO = (io) => {
  // Socket Middleware to authenticates incoming socket connections using the access token cookie.
  io.use(async (socket, next) => {
    try {
      const token = getCookie(socket.handshake.headers.cookie, 'accessToken');

      if (!token) {
        return next(
          new SocketError('Unauthorized, token is missing!', { code: 404, type: 'TOKEN_MISSING' }),
        );
      }

      const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
      const user = await User.findById(decodedToken?._id);
      if (!user) {
        return next(new SocketError('Invalid token', { code: 401, type: 'INVALID_TOKEN' }));
      }
      socket.user = user;
      next();
    } catch (error) {
      return next(
        new SocketError('Invalid or expired token', {
          code: 401,
          type: 'INVALID_OR_EXPIRED_TOKEN',
        }),
      );
    }
  });

  /**
   * Handles a newly authenticated socket connection.
   *
   * @param {import("socket.io").Socket} socket - Connected client socket with authenticated user data.
   * @returns {Promise<void>}
   */
  const onConnection = async (socket) => {
    const userId = socket.user.id;
    logger.info(`Socket connected: ${socket.id} user=${userId}`);

    // Each user joins their own room having room id as "user:{userId}"
    socket.join(`user:${userId}`);

    // mark user as online user, add this socket id to this user
    onlineUsers.add(userId, socket.id);

    // notify friends about online presence
    socket.user.friends.forEach((friendId) => {
      io.to(`user:${friendId}`).emit(PRESENCE_EVENTS.ONLINE, { userId });
    });

    // Register socket event listener for each socket
    // every socket will have its own event listener, as these are not global event listener
    registerChatListeners(io, socket);
    registerGroupListeners(io, socket);

    // socket event listener when user disconnect
    socket.on(SOCKET_EVENTS.DISCONNECT, async () => {
      // remove this socket from current users active sockets
      onlineUsers.remove(userId, socket.id);

      // add current timestamps as last seen
      await User.findByIdAndUpdate(userId, { lastSeenAt: new Date() });

      // emit offline presence if users don't have any active socket
      if (!onlineUsers.isOnline(userId)) {
        // notify friends about offline presence
        socket.user.friends.forEach((friendId) => {
          io.to(`user:${friendId}`).emit(PRESENCE_EVENTS.OFFLINE, { userId });
        });
      }
      logger.info(`Socket disconnected: ${socket.id} user=${userId}`);
    });
  };

  // event triggered when user wants to connect
  io.on(SOCKET_EVENTS.CONNECTION, onConnection);
};
