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
import { CHAT_EVENTS, GROUP_EVENTS, MESSAGE_EVENTS } from '../socket/socketEvents.js';

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

  let chats = await Chat.find({ 'members.user': userId })
    .select('+members -admins -createdBy -createdAt -updatedAt')
    .populate('activeMembers', 'name username avatarUrl')
    .exec();

  chats = (
    await Promise.all(
      chats.map(async (chat) => {
        const latestMembership = chat.getLatestMembershipForUser(userId);
        const visibleMessageQuery = chat.buildVisibleMessageQueryForMembership(
          userId,
          latestMembership,
          { chat: chat._id },
        );

        if (!visibleMessageQuery) return null; // when membership don't have joinedAt

        const lastMessage = await Message.findOne(visibleMessageQuery)
          .select('sender type text attachments createdAt chat')
          .sort({ createdAt: -1, _id: -1 })
          .populate('sender', 'name username')
          .lean();

        // if user has left chat and deleted chat and there is no chat message, then we don't need to show that chat to user
        if (
          !lastMessage &&
          latestMembership?.deletedAt &&
          (chat.type !== ChatType.GROUP || latestMembership.leftAt)
        ) {
          return null;
        }

        const chatData = chat.toObject();
        const userIdStr = userId.toString();
        chatData.unreadCount = chat.unreadCounts?.get(userIdStr) || 0;
        chatData.lastMessage = lastMessage || undefined;

        if (chatData.type === ChatType.PERSONAL) {
          let friend = chatData.activeMembers.filter((mem) => mem._id.toString() !== userIdStr)[0];
          if (friend) {
            // update name chat details in case of personal chat
            chatData.isOnline = onlineUsers.isOnline(friend._id.toString());
            chatData.lastSeenAt = friend.lastSeenAt;
            chatData.name = friend.name;
            chatData.avatarUrl = friend.avatarUrl;
          }
        }

        return sanitizeChat(chatData);
      }),
    )
  )
    .filter(Boolean)
    .sort((a, b) => {
      const aTime = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const bTime = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return bTime - aTime;
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

  const chat = await Chat.findOne({ _id: chatId, 'members.user': userId })
    .select('+members')
    .populate('activeMembers', 'name username avatarUrl lastSeenAt bio email phone username');

  if (!chat) {
    throw new ApiError(400, 'Chat not found');
  }

  const msgQuery = chat.buildVisibleMessageQuery(userId, { chat: chatId });
  if (!msgQuery) {
    throw new ApiError(403, 'You are not allowed to view this chat');
  }

  chat.unreadCounts.set(userId.toString(), 0);
  await chat.save({ validateBeforeSave: false });
  const chatData = { ...chat.toObject(), unreadCount: 0 };

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
  chatData.lastMessage = messages.length ? messages[0] : undefined;

  if (messages.length) {
    messages.reverse();
    messages = messages.map((msg) => {
      return sanitizeMessage(msg);
    });
  }

  chatData.messages = messages;
  chatData.nextCursor = nextCursor;

  const isCurrentUserActiveMember = chatData.activeMembers.some(
    (mem) => mem._id.toString() === userId.toString(),
  );

  if (isCurrentUserActiveMember) {
    chatData.activeMembers.forEach((mem) => {
      mem.isOnline = onlineUsers.isOnline(mem._id.toString());
    });
  }

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

/**
 * Create a new group chat for the authenticated user.
 *
 * Expects multipart form data with a required group avatar file, a group name,
 * and members provided as an array, JSON string, or comma-separated user ids.
 * Members must be friends of the authenticated user.
 *
 * @route POST /api/v1/chats/groups
 * @access Private
 * @param {import('express').Request} req - Express request with authenticated user, body, file, and app socket instance.
 * @param {import('express').Response} res - Express response.
 * @returns {Promise<import('express').Response>} Created group chat response.
 */
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
    members: Chat.createMemberships(memberIds),
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

/**
 * Updates an existing group chat's details for an active member, optionally
 * uploading a new avatar and notifying group members through sockets.
 *
 * @route PATCH /api/v1/chats/group
 * @param {import('express').Request & { body: { chatId?: string, name?: string, description?: string }, file?: Express.Multer.File, user: { _id: mongoose.Types.ObjectId, name: string } }} req Express request with group update fields and authenticated user.
 * @param {import('express').Response} res Express response.
 * @returns {Promise<void>} Sends the updated group id in the response body.
 */
export const updateGroupDetails = asyncHandler(async (req, res) => {
  const chatId = req.body?.chatId?.trim();
  const name = req.body?.name?.trim();
  const description = req.body?.description?.trim();

  if (!chatId) {
    throw new ApiError(400, 'Group id is required');
  }

  if (!isValidObjectId(chatId)) {
    throw new ApiError(400, 'Invalid group id');
  }

  if (!(name || description !== undefined || req.file)) {
    throw new ApiError(400, 'Update fields are missing');
  }

  if (name && name.length < 2) {
    throw new ApiError(400, 'Group name is required');
  }

  const updateFields = {
    ...(name && { name }),
    ...(description !== undefined && { description }),
  };

  if (req.file) {
    if (req.file.size > process.env.AVATAR_MAX_SIZE_B) {
      throw new ApiError(
        400,
        `Please upload a image less than ${process.env.AVATAR_MAX_SIZE_B / 1024} KB`,
      );
    }

    const img = await uploadToCloudinary({
      file: req.file,
      fileName: `grp_${req.user._id.toString()}_${Date.now()}`,
      folder: process.env.AVATAR_FOLDER_NAME,
      quality: 75,
    });

    updateFields.avatarUrl = img.secure_url;
  }

  const group = await Chat.findOneAndUpdate(
    {
      _id: chatId,
      type: ChatType.GROUP,
      activeMembers: req.user._id,
    },
    { $set: updateFields },
    { returnDocument: 'after', runValidators: true },
  );

  if (!group) {
    throw new ApiError(404, 'Group not found or you are not allowed to update it');
  }

  const updateFieldsText = Object.keys(updateFields)
    .map((key) => (key === 'avatarUrl' ? 'avatar' : key))
    .join(', ');

  // create notification
  const notification = await Message.create({
    chat: group._id,
    sender: req.user._id.toString(),
    type: messageType.NOTIFICATION,
    text: `${capitalizeWords(req.user.name)} updated this group ${updateFieldsText}`,
  });

  group.lastMessage = notification._id;
  group.lastMessageAt = notification.createdAt;
  await group.save();

  const populatedMessage = sanitizeMessage(
    await Message.findById(notification._id).populate('sender', 'name username avatarUrl').lean(),
  );

  const groupUpdatedPayload = {
    id: group._id.toString(),
    type: group.type,
    name: group.name,
    description: group.description,
    avatarUrl: group.avatarUrl,
    lastMessage: populatedMessage,
    lastMessageAt: populatedMessage.createdAt,
  };

  // notify others
  const io = req.app.get('io');
  group.activeMembers.forEach((mem) => {
    io.to(`user:${mem._id.toString()}`).emit(GROUP_EVENTS.UPDATED, groupUpdatedPayload);
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        groupId: group._id.toString(),
      },
      'Group details updated successfully',
    ),
  );
});

// todo add js docs for this controller
export const deleteChatForCurrentUser = asyncHandler(async (req, res) => {
  const chatId = req.body?.chatId?.trim();
  const userId = req.user._id;

  if (!chatId) {
    throw new ApiError(400, 'Chat id is required');
  }

  if (!isValidObjectId(chatId)) {
    throw new ApiError(400, 'Invalid chat id');
  }

  const chat = await Chat.findOne({ _id: chatId, 'members.user': userId }).select('+members');
  if (!chat) {
    throw new ApiError(404, 'Chat not found');
  }

  const membership =
    chat.getCurrentActiveMembershipForUser(userId) || chat.getLatestMembershipForUser(userId);
  if (!membership) {
    throw new ApiError(403, 'You are not a member of this chat');
  }

  membership.deletedAt = new Date();
  chat.unreadCounts.set(userId.toString(), 0);
  await chat.save({ validateBeforeSave: false });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        chatId: chat._id.toString(),
      },
      'Chat deleted for you successfully',
    ),
  );
});

// todo add js docs for this controller
export const leaveGroup = asyncHandler(async (req, res) => {
  const chatId = req.body?.chatId?.trim();
  const userId = req.user._id;
  const userIdStr = userId.toString();

  if (!chatId) {
    throw new ApiError(400, 'Group id is required');
  }

  const group = await Chat.findOne({
    _id: chatId,
    type: ChatType.GROUP,
    activeMembers: userId,
  }).select('+members');

  if (!group) {
    throw new ApiError(404, 'Group not found or you are not an active member');
  }

  if (group.activeMembers.length <= 1) {
    throw new ApiError(400, 'Last active member cannot leave the group');
  }

  const membership = group.getCurrentActiveMembershipForUser(userId);
  if (!membership) {
    throw new ApiError(403, 'Active membership not found');
  }

  // leave group first then send notification to others
  membership.leftAt = new Date();

  const notification = await Message.create({
    chat: group._id,
    sender: userId,
    type: messageType.NOTIFICATION,
    text: `${capitalizeWords(req.user.name)} left the group`,
  });

  const populatedMessage = sanitizeMessage(
    await Message.findById(notification._id).populate('sender', 'name username avatarUrl').lean(),
  );

  const remainingMemberIds = group.activeMembers
    .map((memberId) => memberId.toString())
    .filter((memberId) => memberId !== userIdStr);

  group.activeMembers = remainingMemberIds;
  group.admins = group.admins.filter((adminId) => adminId.toString() !== userIdStr);

  if (!group.admins.length && remainingMemberIds.length) {
    group.admins.push(remainingMemberIds[0]);
    group.createdBy = remainingMemberIds[0];
  }

  group.unreadCounts.set(userIdStr, 0);
  remainingMemberIds.forEach((memberId) => {
    group.unreadCounts.set(memberId, (group.unreadCounts?.get(memberId) || 0) + 1);
  });
  await group.save();

  const io = req.app.get('io');

  const socketIds = onlineUsers.getSockets(userIdStr);
  socketIds?.forEach((socketId) => {
    const socket = io.sockets.sockets.get(socketId);
    socket?.leave(`chat:${chatId}`);
  });

  io.to(`chat:${chatId}`).emit(MESSAGE_EVENTS.RECEIVED, populatedMessage);

  remainingMemberIds.forEach((memberId) => {
    io.to(`user:${memberId}`).emit(CHAT_EVENTS.UPDATED, {
      id: group._id.toString(),
      lastMessage: populatedMessage,
      lastMessageAt: populatedMessage.createdAt,
      unreadCount: group.unreadCounts?.get(memberId) || 0,
    });
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        groupId: group._id.toString(),
      },
      'Group left successfully',
    ),
  );
});

// todo add js docs for this controller
export const addMemberToGroup = asyncHandler(async (req, res) => {
  const chatId = req.body?.chatId?.trim();
  const memberId = req.body?.memberId?.trim();
  const adminId = req.user._id;
  const adminIdStr = adminId.toString();

  if (!chatId) {
    throw new ApiError(400, 'Group id is required');
  }

  if (!memberId) {
    throw new ApiError(400, 'Member id is required');
  }

  if (!isValidObjectId(chatId) || !isValidObjectId(memberId)) {
    throw new ApiError(400, 'Invalid group or member id');
  }

  if (memberId === adminIdStr) {
    throw new ApiError(400, 'You are already a member of this group');
  }

  const memberIsNotFriend = !req.user.friends.some((friendId) => friendId.toString() === memberId);
  if (memberIsNotFriend) {
    throw new ApiError(400, 'Member must be your friend');
  }

  const member = await User.findOne({
    _id: memberId,
    isEmailVerified: true,
  }).select('name username avatarUrl');

  if (!member) {
    throw new ApiError(404, 'Member not found');
  }

  const group = await Chat.findOne({
    _id: chatId,
    type: ChatType.GROUP,
    activeMembers: adminId,
  }).select('+members');

  if (!group) {
    throw new ApiError(404, 'Group not found');
  }

  if (!group.admins.some((groupAdminId) => groupAdminId.toString() === adminIdStr)) {
    throw new ApiError(403, 'Only group admins can add members');
  }

  if (group.activeMembers.some((activeMemberId) => activeMemberId.toString() === memberId)) {
    throw new ApiError(400, 'Member is already active member in this group');
  }

  if (group.activeMembers.length >= 50) {
    throw new ApiError(400, 'Group already has maximum active members');
  }

  const joinedAt = new Date();
  group.members.push({
    user: memberId,
    joinedAt,
    leftAt: null,
    deletedAt: null,
  });
  group.activeMembers.push(memberId);
  group.unreadCounts.set(memberId, 0);

  const notification = await Message.create({
    chat: group._id,
    sender: adminId,
    type: messageType.NOTIFICATION,
    text: `${capitalizeWords(req.user.name)} added ${capitalizeWords(member.name)} to the group`,
  });

  const populatedMessage = sanitizeMessage(
    await Message.findById(notification._id).populate('sender', 'name username avatarUrl').lean(),
  );

  group.activeMembers.forEach((memberId) => {
    const memberIdStr = memberId.toString();
    if (memberIdStr === adminIdStr) return;
    group.unreadCounts.set(memberIdStr, (group.unreadCounts?.get(memberIdStr) || 0) + 1);
  });
  await group.save();

  const io = req.app.get('io');

  io.to(`chat:${chatId}`).emit(MESSAGE_EVENTS.RECEIVED, populatedMessage);

  group.activeMembers.forEach((memberId) => {
    io.to(`user:${memberId}`).emit(CHAT_EVENTS.UPDATED, {
      id: group._id.toString(),
      type: group.type,
      name: group.name,
      avatarUrl: group.avatarUrl,
      lastMessage: populatedMessage,
      lastMessageAt: populatedMessage.createdAt,
      unreadCount: group.unreadCounts?.get(member._id.toString()) || 0,
    });
  });

  // TODO - do we need to send separate notification to new user also ?

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        groupId: group._id.toString(),
        memberId: member._id.toString(),
      },
      'Member added successfully',
    ),
  );
});
