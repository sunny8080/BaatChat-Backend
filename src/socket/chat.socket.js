import { ChatType, DELETE_FOR_EVERYONE_WINDOW, messageType } from '../constant.js';
import Chat from '../models/chat.model.js';
import Message from '../models/message.model.js';
import User from '../models/user.model.js';
import ApiError from '../utils/ApiError.js';
import { sanitizeChat, sanitizeMessage, sanitizeUser } from '../utils/utils.js';
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
    let newChatCreated = false;

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
            members: Chat.createMemberships(activeMembers),
            createdBy: senderId,
          });
        }
        chatId = chat.id;
        newChatCreated = true;

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

      const ackData = {
        ok: true,
        message: populatedMessage,
      };

      if (newChatCreated) {
        // send new chat details
        const newChat = await Chat.findById(chatId)
          .sort({ lastMessageAt: -1, updatedAt: -1 })
          .populate('activeMembers', 'name username avatarUrl lastSeenAt bio email phone username')
          .populate({
            path: 'lastMessage',
            select: 'sender type text attachments createdAt',
            populate: {
              path: 'sender',
              select: 'name username',
            },
          })
          .lean();
        newChat.activeMembers.forEach((mem) => {
          mem.isOnline = onlineUsers.isOnline(mem._id.toString());
        });
        let friend =
          newChat.activeMembers[0]._id.toString() === senderId.toString()
            ? newChat.activeMembers[1]
            : newChat.activeMembers[0];

        newChat.friend = sanitizeUser(friend);
        newChat.name = friend.name;
        newChat.avatarUrl = friend.avatarUrl;

        ackData.newChat = sanitizeChat(newChat);
      }

      if (typeof ack === 'function') {
        // if acknowledgement function is sent then call that function
        ack(ackData);
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
    const senderId = socket.user.id;

    try {
      if (!chatId) {
        throw new Error('Chat id is missing');
      }
      const chat = await Chat.findOne({ _id: chatId, activeMembers: senderId });
      if (chat) {
        socket.join(`chat:${chatId}`);
      }
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

  socket.on(MESSAGE_EVENTS.DELETE, async (payload = {}, ack) => {
    let { chatId, msgId, forEveryone = false } = payload;
    chatId = chatId?.trim();
    msgId = msgId?.trim();
    const currentUser = socket.user;
    const currentUserId = currentUser._id.toString();

    try {
      if (!chatId || !msgId) {
        throw new Error('Chat id or message id is missing');
      }

      const chat = await Chat.findOne({
        _id: chatId,
        activeMembers: currentUserId,
      }).select('+members');

      if (!chat) {
        throw new Error('Unauthorized');
      }

      const message = await Message.findOne({
        _id: msgId,
        chat: chatId,
      }).select('+deletedBy');

      if (!message) {
        throw new Error('Message not found');
      }

      if (!forEveryone) {
        if (!message.deletedBy.some((userId) => userId.toString() === currentUserId)) {
          message.deletedBy.push(currentUserId);
          await message.save({ validateBeforeSave: false });
        }
      } else {
        // delete this message for everyone
        if (message.sender.toString() !== currentUserId) {
          throw new Error('Only sender can delete message for everyone');
        }
        if (Date.now() > message.createdAt.getTime() + DELETE_FOR_EVERYONE_WINDOW) {
          throw new Error('Delete for everyone window has expired');
        }
        await message.deleteOne();

        // notify each member about their last message and unread count
        const chatUpdatedEvents = [];
        const activeMemberIds = chat.activeMembers.map((memberId) => memberId.toString());
        const seenByIds = new Set(message.seenBy.map(({ user }) => user.toString()));
        const senderId = message.sender.toString();

        const lastMessages = (
          await Promise.all(
            activeMemberIds.map(async (memberId) => {
              const visibleMessageQuery = chat.buildVisibleMessageQuery(memberId, {
                chat: chat._id,
              });
              if (!visibleMessageQuery) return null;

              const lastMessage = await Message.findOne(visibleMessageQuery)
                .sort({ createdAt: -1, _id: -1 })
                .populate('sender', 'name username avatarUrl')
                .lean();

              return lastMessage ? { ...lastMessage, visibleTo: memberId } : null;
            }),
          )
        ).filter(Boolean);

        const lastMessageByMemberId = new Map(
          lastMessages.map((msg) => [msg.visibleTo.toString(), sanitizeMessage(msg)]),
        );

        activeMemberIds.forEach((memberId) => {
          if (memberId !== senderId && !seenByIds.has(memberId)) {
            const unreadCount = Math.max((chat.unreadCounts?.get(memberId) || 0) - 1, 0);
            chat.unreadCounts.set(memberId, unreadCount);
          }

          const lastMessage = lastMessageByMemberId.get(memberId) || undefined;
          const chatUpdatedPayload = {
            id: chat.id,
            lastMessage,
            lastMessageAt: lastMessage?.createdAt,
            unreadCount: chat.unreadCounts?.get(memberId) || 0,
          };

          chatUpdatedEvents.push({ memberId, chatUpdatedPayload });
        });

        await chat.save();

        chatUpdatedEvents.forEach(({ memberId, chatUpdatedPayload }) => {
          io.to(`user:${memberId}`).emit(CHAT_EVENTS.UPDATED, chatUpdatedPayload);
        });
        socket.to(`chat:${chatId}`).emit(MESSAGE_EVENTS.DELETED, { chatId, msgId });
      }

      const deletedPayload = { chatId, msgId };
      if (typeof ack === 'function') {
        ack({ ok: true, ...deletedPayload });
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
};
