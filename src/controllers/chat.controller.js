import mongoose from 'mongoose';
import { ChatType, messageType } from '../constant.js';
import Chat from '../models/chat.model.js';
import Message from '../models/message.model.js';
import { onlineUsers } from '../socket/onlineUsers.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sanitizeChat, sanitizeMessage, sanitizeUser, capitalizeWords } from '../utils/utils.js';
import ApiError from '../utils/ApiError.js';
import { isValidObjectId } from 'mongoose';
import User from '../models/user.model.js';
import { uploadToCloudinary } from '../config/cloudnaryConnect.js';
import { CHAT_EVENTS } from '../socket/socketEvents.js';

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

// todo add js docs
export const createGroup = asyncHandler(async (req, res) => {
  const name = req.body?.name?.trim();
  const description = req.body?.description?.trim() ?? '';
  let members = req.body?.members;
  const user = req.user;

  if (!name || name.length < 2) {
    throw new ApiError(400, 'Group name is required');
  }

  if (!req.file) {
    throw new ApiError(400, 'Group avatar is required');
  }

  if (!members) {
    throw new ApiError(400, 'Members are required');
  }

  // validate members
  if (typeof members === 'string') {
    try {
      members = JSON.parse(members);
    } catch {
      members = members.split(',');
    }
  }

  if (!Array.isArray(members)) {
    throw new ApiError(400, 'Members must be an array of user ids');
  }

  const memberIsNotFriend = members.some((memId) => !user.friends.includes(memId));
  if (memberIsNotFriend) {
    throw new ApiError(400, 'Members must be friends');
  }

  const memberIds = [
    ...new Set(
      [req.user._id.toString(), ...members.map((memberId) => memberId?.toString().trim())].filter(
        Boolean,
      ),
    ),
  ];

  if (memberIds.length < 2 || memberIds.length > 50) {
    throw new ApiError(400, 'Group must contain 2-50 members');
  }

  if (memberIds.some((memberId) => !isValidObjectId(memberId))) {
    throw new ApiError(400, 'Invalid member id');
  }

  const existingMembersCount = await User.countDocuments({
    _id: { $in: memberIds },
    isEmailVerified: true,
  });

  if (existingMembersCount !== memberIds.length) {
    throw new ApiError(400, 'One or more members are invalid');
  }

  // validate file
  if (req.file.size > process.env.AVATAR_MAX_SIZE_B) {
    throw new ApiError(
      400,
      `Please upload a image less than ${process.env.AVATAR_MAX_SIZE_B / 1024} KB`,
    );
  }

  // const avatarType = req.file.mimetype.split('/')[1];
  const img = await uploadToCloudinary({
    file: req.file,
    fileName: `grp_${req.user.id}_${Date.now()}`,
    folder: process.env.AVATAR_FOLDER_NAME,
    quality: 75,
  });

  const unreadCounts = memberIds.reduce((counts, memberId) => {
    counts[memberId] = memberId === req.user._id.toString() ? 0 : 1;
    return counts;
  }, {});

  let group = await Chat.create({
    type: ChatType.GROUP,
    name,
    description,
    avatarUrl: img.secure_url,
    activeMembers: memberIds,
    members: memberIds,
    admins: [req.user._id],
    createdBy: req.user._id,
    unreadCounts,
  });

  const notification = await Message.create({
    chat: group._id,
    sender: req.user._id.toString(),
    type: messageType.NOTIFICATION,
    text: `${capitalizeWords(req.user.name)} created this group`,
  });

  group.lastMessage = notification._id;
  group.lastMessageAt = notification.createdAt;
  await group.save();

  const populatedMessage = sanitizeMessage(
    await Message.findById(notification._id).populate('sender', 'name username avatarUrl').lean(),
  );

  group = await Chat.findById(group._id)
    .populate('activeMembers', 'name username avatarUrl bio email phone lastSeenAt')
    .populate({
      path: 'lastMessage',
      select: 'sender type text attachments createdAt',
      populate: {
        path: 'sender',
        select: 'name username',
      },
    })
    .lean();

  group.messages = [populatedMessage];
  group.activeMembers.forEach((mem) => {
    mem.isOnline = onlineUsers.isOnline(mem._id.toString());
  });

  // notify to all other members using socket
  const io = req.app.get('io');
  const chatUpdatedPayload = {
    id: group._id.toString(),
    type: group.type,
    name: group.name,
    avatarUrl: group.avatarUrl,
    lastMessage: populatedMessage,
    lastMessageAt: populatedMessage.createdAt,
    unreadCount: 1,
  };

  group.activeMembers.forEach((mem) => {
    if (mem._id.toString() === req.user._id.toString()) return;
    io.to(`user:${mem._id.toString()}`).emit(CHAT_EVENTS.UPDATED, chatUpdatedPayload);
  });

  return res.status(201).json(
    new ApiResponse(
      201,
      {
        group: sanitizeChat(group),
      },
      'Group created successfully',
    ),
  );
});
