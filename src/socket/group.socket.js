import { ChatType, messageType } from '../constant.js';
import Chat from '../models/chat.model.js';
import Message from '../models/message.model.js';
import User from '../models/user.model.js';
import ApiError from '../utils/ApiError.js';
import { sanitizeUser } from '../utils/utils.js';
import { onlineUsers } from './onlineUsers.js';
import { CHAT_EVENTS, GROUP_EVENTS, MESSAGE_EVENTS, TYPING_EVENTS } from './socketEvents.js';

/**
 * Registers chat-related Socket.IO event listeners for a connected socket.
 *
 * @param {import("socket.io").Server} io - The Socket.IO server instance.
 * @param {import("socket.io").Socket} socket - The connected client socket.
 * @returns {void}
 */
export const registerGroupListeners = (io, socket) => {
  // socket.on(GROUP_EVENTS.CREATE, async (payload = {}, ack) => {
    
  // });
};
