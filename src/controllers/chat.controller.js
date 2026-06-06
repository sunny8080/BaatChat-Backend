import mongoose from 'mongoose';
import { ChatType } from '../constant.js';
import Chat from '../models/chat.model.js';
import Message from '../models/message.model.js';
import { onlineUsers } from '../socket/onlineUsers.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sanitizeChat, sanitizeMessage, sanitizeUser } from '../utils/utils.js';
import ApiError from '../utils/ApiError.js';

/**
 * Fetches all chats for the authenticated user, including unread counts,
 * populated member and last-message details, and personal-chat presence data.
 *
 * @route GET /api/v1/chats
 * @param {import('express').Request & { user: { _id: mongoose.Types.ObjectId } }} req Express request with authenticated user.
 * @param {import('express').Response} res Express response.
 * @returns {Promise<void>} Sends the sanitized chat list in the response body.
 */
export const getCurrentUserChats = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  let chats = await Chat.find({ members: userId, deletedBy: { $ne: userId } })
    .select('-admins -createdBy -createdAt -updatedAt"')
    .sort({ lastMessageAt: -1, updatedAt: -1 })
    .populate('activeMembers', 'name username avatarUrl')
    .populate({
      path: 'lastMessage',
      select: 'sender type text attachments createdAt',
      populate: {
        path: 'sender',
        select: 'name username',
      },
    })
    .lean();

  chats = chats.map((chat) => {
    chat.unreadCount = chat.unreadCounts?.[userId] || 0;

    if (chat.type === ChatType.PERSONAL) {
      // update name chat details in case of personal chat
      let friend =
        chat.activeMembers[0]._id.toString() === userId.toString()
          ? chat.activeMembers[1]
          : chat.activeMembers[0];

      chat.isOnline = onlineUsers.isOnline(friend._id.toString());
      chat.lastSeenAt = friend.lastSeenAt;
      chat.name = friend.name;
      chat.avatarUrl = friend.avatarUrl;
    }
    return sanitizeChat(chat);
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        chats,
      },
      'Chats fetched successfully',
    ),
  );
});

/**
 * Fetches a chat's details for the authenticated user, marks it as read,
 * and returns the latest visible messages with populated sender details.
 *
 * @route POST /api/v1/chats/details
 * @param {import('express').Request & { body: { chatId?: string }, user: { _id: mongoose.Types.ObjectId } }} req Express request with chat id and authenticated user.
 * @param {import('express').Response} res Express response.
 * @returns {Promise<void>} Sends the sanitized chat details and latest messages in the response body.
 */
export const getChatDetails = asyncHandler(async (req, res) => {
  let chatId = req.body?.chatId?.trim() ?? '';
  let nextCursor = req.body?.nextCursor?.trim() ?? '';
  const userId = req.user._id;

  if (!chatId) {
    throw new ApiError(400, 'Chat id is required');
  }

  const chat = await Chat.findById(chatId)
    .sort({ lastMessageAt: -1, updatedAt: -1 })
    .populate('activeMembers', 'name username avatarUrl lastSeenAt bio email phone username')
    .populate({
      path: 'lastMessage',
      select: 'sender type text attachments createdAt',
      populate: {
        path: 'sender',
        select: 'name username',
      },
    });

  if (!chat) {
    throw new ApiError(400, 'Chat not found');
  }

  chat.unreadCounts.set(userId, 0);
  await chat.save({ validateBeforeSave: false });
  const chatData = { ...chat.toObject(), unreadCount: 0 };

  const msgQuery = {
    chat: chatId,
    deletedBy: { $ne: userId },
  };

  if (nextCursor) {
    // to find previous messages, id are sorted in mongodb,
    // so find document which has lower id than nextCursor
    msgQuery._id = { $lt: nextCursor };
  }

  let messages = await Message.find(msgQuery)
    .populate('sender', 'name username avatarUrl')
    .sort({ _id: -1 })
    .limit(30)
    .lean();

  // if message are in count of limit then it may happen that more message are there
  // send next cursor as last message, which will be used later for pagination
  nextCursor = messages.length == 30 ? messages.at(-1)._id.toString() : '';

  if (messages.length) {
    messages.reverse();
    messages = messages.map((msg) => {
      return sanitizeMessage(msg);
    });
  }

  chatData.messages = messages;
  chatData.nextCursor = nextCursor;

  chatData.activeMembers.forEach((mem) => {
    mem.isOnline = onlineUsers.isOnline(mem._id.toString());
  });

  if (chatData.type === ChatType.PERSONAL) {
    // update name chat details in case of personal chat
    let friend =
      chatData.activeMembers[0]._id.toString() === userId.toString()
        ? chatData.activeMembers[1]
        : chatData.activeMembers[0];

    chatData.friend = sanitizeUser(friend);
    chatData.name = friend.name;
    chatData.avatarUrl = friend.avatarUrl;
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        chat: sanitizeChat(chatData),
      },
      'Chats fetched successfully',
    ),
  );
});
