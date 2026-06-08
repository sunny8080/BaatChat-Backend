import { ChatType, messageType } from '../constant.js';
import Chat from '../models/chat.model.js';
import Message from '../models/message.model.js';
import User from '../models/user.model.js';
import ApiError from '../utils/ApiError.js';
import { sanitizeMessage, sanitizeUser } from '../utils/utils.js';
import { onlineUsers } from './onlineUsers.js';
import { CHAT_EVENTS, MESSAGE_EVENTS, TYPING_EVENTS } from './socketEvents.js';

/**
 * Registers chat-related Socket.IO event listeners for a connected socket.
 *
 * @param {import("socket.io").Server} io - The Socket.IO server instance.
 * @param {import("socket.io").Socket} socket - The connected client socket.
 * @returns {void}
 */
export const registerChatListeners = (io, socket) => {
  // event listener when user send a message
  socket.on(MESSAGE_EVENTS.SEND, async (payload = {}, ack) => {
    let { chatId, text, receiverId } = payload;
    chatId = chatId?.trim();
    text = text?.trim();
    receiverId = receiverId?.trim();
    const senderId = socket.user.id;

    try {
      if (!chatId && !receiverId) {
        throw new Error('Chat id or receiver id is missing');
      }
      if (!text) {
        throw new Error('Message cannot be empty');
      }
      if (receiverId === senderId) {
        throw new Error('Cannot send message to yourself');
      }

      /**
       * @type Chat
       */
      let chat;

      if (chatId) {
        // chat document exist
        chat = await Chat.findOne({ _id: chatId, activeMembers: senderId });
      } else {
        // chat is personal type and chat may exist or not
        // it may happen, that chat exist on receiver side but not on sender side
        const activeMembers = [senderId, receiverId].sort();
        chat = await Chat.findOne({
          type: ChatType.PERSONAL,
          personalChatKey: activeMembers.join('_'),
        });

        if (!chat) {
          // no chat exist between both members
          const receiver = await User.findById(receiverId);
          if (!receiver) {
            throw new Error('Receiver not found!');
          }

          chat = await Chat.create({
            type: ChatType.PERSONAL,
            name: receiver.name,
            avatarUrl: receiver.avatarUrl,
            activeMembers,
            members: activeMembers,
            createdBy: senderId,
          });
        }
        chatId = chat.id;

        // join current chat room
        socket.join(`chat:${chatId}`);
      }

      if (!chat) {
        throw new Error('Chat not found!');
      }

      const message = await Message.create({
        chat: chat._id,
        sender: senderId,
        type: messageType.TEXT,
        text,
      });

      chat.lastMessage = message._id;
      chat.lastMessageAt = message.createdAt;

      // populated message will be used to update active chat
      const populatedMessage = sanitizeMessage(
        await Message.findById(message._id).populate('sender', 'name username avatarUrl').lean(),
      );

      // receivers may not have opened this chat, so send chat updated events to all active members
      const chatUpdatedEvents = [];
      chat.activeMembers.forEach((memberId) => {
        const memberIdStr = memberId.toString();
        if (memberIdStr === senderId) {
          chat.unreadCounts.set(memberIdStr, 0);
          return;
        }

        // update unread message count
        const unreadCount = (chat.unreadCounts?.get(memberIdStr) || 0) + 1;
        chat.unreadCounts.set(memberIdStr, unreadCount);

        const chatUpdatedPayload = {
          id: chat.id,
          type: chat.type,
          name: chat.name,
          avatarUrl: chat.avatarUrl,
          lastMessage: populatedMessage,
          lastMessageAt: populatedMessage.createdAt,
          unreadCount,
        };

        if (chat.type === ChatType.PERSONAL) {
          chatUpdatedPayload.name = socket.user.name;
          chatUpdatedPayload.isOnline = onlineUsers.isOnline(senderId.toString);
          chatUpdatedPayload.lastSeenAt = socket.user.lastSeenAt;
        }

        chatUpdatedEvents.push({ memberId, chatUpdatedPayload });
      });

      await chat.save();

      // emit event to individual user so if they are online then chat list can be updated
      // save into database first then emit event to make all thing sync
      chatUpdatedEvents.forEach(({ memberId, chatUpdatedPayload }) => {
        io.to(`user:${memberId}`).emit(CHAT_EVENTS.UPDATED, chatUpdatedPayload);
      });

      // receiver may have open this chat, so emit event to all users in that room
      socket.to(`chat:${chatId}`).emit(MESSAGE_EVENTS.RECEIVED, populatedMessage);

      // if acknowledgement function is sent then call that function
      if (typeof ack === 'function') {
        ack({ ok: true, message: populatedMessage });
      }
    } catch (error) {
      console.log(error);
      if (typeof ack === 'function') {
        ack({ ok: false, error: error.message });
      } else {
        socket.emit(MESSAGE_EVENTS.ERROR, { error: error.message });
      }
    }
  });

  // event listener when user joins a chat
  socket.on(CHAT_EVENTS.JOIN, async (payload = {}) => {
    let { chatId } = payload;
    chatId = chatId?.trim();

    try {
      if (!chatId) {
        throw new Error('Chat id is missing');
      }
      socket.join(`chat:${chatId}`);
    } catch (error) {
      console.log(error);
    }
  });

  // event listener when user leaves a chat
  socket.on(CHAT_EVENTS.LEAVE, async (payload = {}) => {
    let { chatId } = payload;
    chatId = chatId?.trim();

    try {
      if (!chatId) {
        throw new Error('Chat id is missing');
      }
      socket.leave(`chat:${chatId}`);
    } catch (error) {
      console.log(error);
    }
  });

  // event listener when a message got delivered
  socket.on(MESSAGE_EVENTS.DELIVERED, async (payload = {}) => {
    let { chatId, msgId } = payload;
    chatId = chatId?.trim();
    msgId = msgId?.trim();
    const currentUser = socket.user;
    const deliveredAt = new Date();

    try {
      if (!chatId || !msgId) {
        throw new Error('Chat id or message id is missing');
      }

      const chat = await Chat.findOne({
        _id: chatId,
        activeMembers: currentUser.id,
      });

      if (!chat) {
        throw new Error('Unauthorized');
      }

      const msg = await Message.findOneAndUpdate(
        {
          _id: msgId,
          chat: chatId,
          'deliveredTo.user': { $ne: currentUser.id },
        },
        {
          $push: {
            deliveredTo: {
              user: currentUser.id,
              deliveredAt,
            },
          },
        },
        {
          returnDocument: 'after',
        },
      );

      if (!msg) {
        throw new Error('Unable to update message status');
      }

      // notify sender that message has been delivered
      io.to(`user:${msg.sender.toString()}`).emit(MESSAGE_EVENTS.DELIVERED, {
        chatId,
        msgId,
        deliveredTo: {
          id: socket.user._id.toString(),
          name: socket.user.name,
          avatarUrl: socket.user.avatarUrl,
        },
        deliveredAt,
      });
    } catch (error) {
      console.log(error);
    }
  });

  // event listener when a message got seen
  socket.on(MESSAGE_EVENTS.SEEN, async (payload = {}) => {
    let { chatId, msgId } = payload;
    chatId = chatId?.trim();
    msgId = msgId?.trim();
    const currentUser = socket.user;
    const seenAt = new Date();
    const currentUserId = currentUser._id.toString();

    try {
      if (!chatId || !msgId) {
        throw new Error('Chat id or message id is missing');
      }

      const chat = await Chat.findOne({
        _id: chatId,
        activeMembers: currentUserId,
      });

      if (!chat) {
        throw new Error('Unauthorized');
      }

      const msg = await Message.findOneAndUpdate(
        {
          _id: msgId,
          chat: chatId,
          'seenBy.user': { $ne: currentUserId },
        },
        {
          $push: {
            seenBy: {
              user: currentUserId,
              seenAt,
            },
          },
        },
        {
          returnDocument: 'after',
        },
      );

      if (!msg) {
        throw new Error('Unable to update message status');
      }

      // reduce unread count by 1
      const unreadCount = Math.max((chat.unreadCounts?.get(currentUserId) || 0) - 1, 0);
      chat.unreadCounts.set(currentUserId, unreadCount);
      await chat.save();

      // notify sender that message has been seen
      io.to(`user:${msg.sender.toString()}`).emit(MESSAGE_EVENTS.SEEN, {
        chatId,
        msgId,
        seenBy: {
          id: currentUser._id.toString(),
          name: currentUser.name,
          avatarUrl: currentUser.avatarUrl,
        },
        seenAt,
      });
    } catch (error) {
      console.log(error);
    }
  });

  // event listener when a user starts typing
  socket.on(TYPING_EVENTS.START, async (payload = {}) => {
    let { chatId } = payload;
    chatId = chatId?.trim();
    const currentUser = socket.user;

    socket.to(`chat:${chatId}`).emit(TYPING_EVENTS.USER_STARTED, {
      chatId,
      user: {
        id: currentUser._id.toString(),
        name: currentUser.name,
        avatarUrl: currentUser.avatarUrl,
      },
    });
  });
};
