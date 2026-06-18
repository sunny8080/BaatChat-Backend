import { isValidObjectId } from 'mongoose';
import { uploadToCloudinary } from '../config/cloudnaryConnect.js';
import { ChatType, messageType } from '../constant.js';
import Chat from '../models/chat.model.js';
import Message from '../models/message.model.js';
import { CHAT_EVENTS, MESSAGE_EVENTS } from '../socket/socketEvents.js';
import { onlineUsers } from '../socket/onlineUsers.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sanitizeChat, sanitizeMessage, sanitizeUser } from '../utils/utils.js';
import User from '../models/user.model.js';

// todo add js docs
export const sendAudioMessage = asyncHandler(async (req, res) => {
  let chatId = req.body?.chatId?.trim();
  const receiverId = req.body?.receiverId?.trim();
  const duration = req.body?.duration?.trim();
  const waveform = req.body?.waveform;
  const audioBlob = req.file;
  const senderId = req.user._id;

  if (!audioBlob) {
    throw new ApiError(400, 'Audio file is required');
  }

  let { chat, newChatCreated } = await getOrCreateChat(chatId, senderId, receiverId, req);
  if (newChatCreated) {
    chatId = chat._id.toString();
  }

  if (!chat) {
    throw new ApiError(404, 'Chat not found');
  }

  const audio = await uploadToCloudinary({
    file: audioBlob,
    fileName: `audio_${senderId.toString()}_${Date.now()}`,
    folder: process.env.AUDIO_MESSAGE_FOLDER_NAME,
  });

  const message = await Message.create({
    chat: chat._id,
    sender: senderId,
    type: messageType.AUDIO,
    text: `Voice message (${Math.floor(duration / 60)
      .toString()
      .padStart(2, '0')}:${Math.ceil(duration % 60)
      .toString()
      .padStart(2, '0')})`,
    attachments: [
      {
        url: audio.secure_url,
        fileName: audioBlob.originalname ?? '',
        mimeType: audioBlob.mimetype || '',
        size: audio.bytes || audioBlob.size || 0,
        duration: duration || 0,
        waveform: parseWaveform(waveform),
      },
    ],
  });

  chat.lastMessage = message._id;
  chat.lastMessageAt = message.createdAt;

  const populatedMessage = sanitizeMessage(
    await Message.findById(message._id).populate('sender', 'name username avatarUrl').lean(),
  );

  const chatUpdatedEvents = [];
  chat.activeMembers.forEach((memberId) => {
    const memberIdStr = memberId.toString();

    if (memberIdStr === senderId.toString()) {
      chat.unreadCounts.set(memberIdStr, 0);
      return;
    }

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
      chatUpdatedPayload.name = req.user.name;
      chatUpdatedPayload.avatarUrl = req.user.avatarUrl;
      chatUpdatedPayload.isOnline = onlineUsers.isOnline(senderId.toString());
      chatUpdatedPayload.lastSeenAt = req.user.lastSeenAt;
    }

    chatUpdatedEvents.push({ memberId: memberIdStr, chatUpdatedPayload });
  });

  await chat.save();

  const io = req.app.get('io');
  chatUpdatedEvents.forEach(({ memberId, chatUpdatedPayload }) => {
    io.to(`user:${memberId}`).emit(CHAT_EVENTS.UPDATED, chatUpdatedPayload);
  });
  io.to(`chat:${chatId}`)
    .except(`user:${senderId.toString()}`)
    .emit(MESSAGE_EVENTS.RECEIVED, populatedMessage);

  const responseData = { message: populatedMessage };

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

    responseData.newChat = sanitizeChat(newChat);
  }

  return res
    .status(201)
    .json(new ApiResponse(201, responseData, 'Audio message sent successfully'));
});

// todo add js docs
const getOrCreateChat = async (chatId, senderId, receiverId, req) => {
  let newChatCreated = false;
  if (!chatId && !receiverId) {
    throw new Error('Chat id or receiver id is missing');
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
    newChatCreated = true;

    // join current chat room
    const io = req.app.get('io');
    const socketIds = onlineUsers.getSockets(senderId);
    socketIds?.forEach((socketId) => {
      const socket = io.sockets.sockets.get(socketId);
      socket?.join(`chat:${chatId}`);
    });
  }

  return {
    chat,
    newChatCreated,
  };
};

const parseWaveform = (waveform) => {
  if (!waveform) return [];
  if (Array.isArray(waveform)) return waveform.map(Number).filter(Number.isFinite);

  try {
    const parsed = JSON.parse(waveform);
    return Array.isArray(parsed) ? parsed.map(Number).filter(Number.isFinite) : [];
  } catch {
    return waveform.split(',').map(Number).filter(Number.isFinite);
  }
};
