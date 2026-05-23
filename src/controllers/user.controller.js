import { isValidObjectId } from 'mongoose';
import { uploadToCloudinary } from '../config/cloudnaryConnect.js';
import { friendshipStatus } from '../constant.js';
import Friendship from '../models/friendship.model.js';
import User from '../models/user.model.js';
import { onlineUsers } from '../socket/onlineUsers.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sanitizeUser } from '../utils/utils.js';

/**
 * Update the authenticated user's profile details.
 *
 * Accepts optional `name`, `bio`, and avatar upload fields. At least one field
 * must be provided. Avatar files are validated against `AVATAR_MAX_SIZE_B` and
 * uploaded to Cloudinary before persisting the resulting URL on the user.
 *
 * @route PATCH /api/v1/users/update-user-details
 * @access Private
 * @param {import('express').Request & { user: { _id: string, id: string }, file?: Express.Multer.File }} req
 * @param {import('express').Response} res
 * @returns {Promise<void>} Sends the sanitized updated user in an ApiResponse.
 * @throws {ApiError} When no update fields are provided, name is invalid, or avatar is too large.
 */
export const updateUserDetails = asyncHandler(async (req, res) => {
  let name = req.body?.name;
  let bio = req.body?.bio;
  let avBuffer = req.file;
  name = name?.trim()?.toLowerCase();
  bio = bio?.trim();

  if (!(name || bio || avBuffer)) {
    throw new ApiError(400, 'Update fields are missing!');
  }

  if (name && name.length < 2) {
    throw new ApiError(400, 'Name is required!');
  }

  let avatarUrl = '';

  if (avBuffer) {
    if (avBuffer.size > process.env.AVATAR_MAX_SIZE_B) {
      throw new ApiError(400, `Please upload a image less than ${process.env.AVATAR_MAX_SIZE_B / 1024} KB`);
    }
    const avatarType = avBuffer.mimetype.split('/')[1];
    const fileName = `av_${req.user.id}.${avatarType}`;

    const img = await uploadToCloudinary({ file: avBuffer, fileName, folder: process.env.AVATAR_FOLDER_NAME, quality: 75 });
    avatarUrl = img.secure_url;
  }

  const updateFields = {
    ...(name && { name }),
    ...(bio != undefined && { bio }),
    ...(avatarUrl && { avatarUrl }),
  };

  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: updateFields,
    },
    { returnDocument: 'after' },
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        user: sanitizeUser(user),
      },
      'Fields updated successfully.',
    ),
  );
});

/**
 * Search verified users by username or name, excluding the authenticated user.
 *
 * @route POST /api/v1/users/search-users
 * @access Private
 * @param {import('express').Request & { user: { _id: string } }} req
 * @param {import('express').Response} res
 * @returns {Promise<void>} Sends up to 20 sanitized matching users in an ApiResponse.
 * @throws {ApiError} When search text is missing or too short.
 */
export const searchUsers = asyncHandler(async (req, res) => {
  const searchText = req.body?.searchText?.trim()?.toLowerCase();

  if (!searchText) {
    throw new ApiError(400, 'Search text is required');
  }

  if (searchText.length < 3) {
    throw new ApiError(400, 'Search text should have at least 2 chars');
  }

  // change all occurrence of special chars - "sunny.k" -> "sunny\\.k""
  const escapedSearchText = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const searchRegex = new RegExp(escapedSearchText, 'i');

  const users = await User.find({
    _id: { $ne: req.user._id },
    isEmailVerified: true,
    $or: [{ username: searchRegex }, { name: searchRegex }],
  })
    .select('name username avatarUrl bio')
    .limit(20)
    .lean();

  const sanitizedUser = users.map((user) => sanitizeUser(user));

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        users: sanitizedUser,
      },
      'Users fetched successfully',
    ),
  );
});

/**
 * Fetch a verified user's public details and friendship status for the authenticated user.
 *
 * Includes contact and presence details only when the users are friends.
 *
 * @route POST /api/v1/users/get-user-details
 * @access Private
 * @param {import('express').Request & { user: { _id: string } }} req
 * @param {import('express').Response} res
 * @returns {Promise<void>} Sends the sanitized user details in an ApiResponse.
 * @throws {ApiError} When username is missing or the user cannot be found.
 */
export const getUserDetails = asyncHandler(async (req, res) => {
  const username = req.body?.username?.trim()?.toLowerCase();

  if (!username) {
    throw new ApiError(400, 'Username is required');
  }

  const user = await User.findOne({ username, isEmailVerified: true }).select('name username avatarUrl bio email phone lastSeenAt').lean();

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const userId = user._id.toString();
  const sanitizedUser = sanitizeUser(user);
  const friendship = await Friendship.findOne({
    $or: [
      { sender: req.user._id, receiver: userId },
      { sender: userId, receiver: req.user._id },
    ],
  }).lean();

  const isFriend = friendship?.status === friendshipStatus.ACCEPTED;
  if (isFriend) {
    sanitizedUser.isOnline = onlineUsers.isOnline(userId);
  } else {
    delete sanitizedUser.email;
    delete sanitizedUser.phone;
    delete sanitizedUser.lastSeenAt;
  }

  // check status of both users
  const currentUserId = req.user._id.toString();
  const isPendingRequest = friendship?.status === friendshipStatus.PENDING;
  const reqSent = isPendingRequest && friendship.sender.toString() === currentUserId;
  const reqReceived = isPendingRequest && friendship.receiver.toString() === currentUserId;

  if (isFriend || reqSent) {
    sanitizedUser.status = friendship.status;
  } else if (reqReceived) {
    sanitizedUser.status = friendshipStatus.REQUESTED;
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        user: sanitizedUser,
      },
      'User fetched successfully',
    ),
  );
});

/**
 * Send a friend request from the authenticated user to another verified user.
 *
 * Reuses a previously rejected friendship record by resetting it to pending.
 *
 * @route POST /api/v1/users/send-friend-request
 * @access Private
 * @param {import('express').Request & { user: { _id: import('mongoose').Types.ObjectId } }} req
 * @param {import('express').Response} res
 * @returns {Promise<void>} Sends the created or updated friendship in an ApiResponse.
 * @throws {ApiError} When username is missing, invalid, self-targeted, already connected, pending, or blocked.
 */
export const sendFriendRequest = asyncHandler(async (req, res) => {
  const username = req.body?.username?.trim()?.toLowerCase();

  if (!username) {
    throw new ApiError(400, 'Username is required');
  }

  const receiver = await User.findOne({ username, isEmailVerified: true }).select('_id').lean();

  if (!receiver) {
    throw new ApiError(404, 'User not found');
  }

  if (req.user._id.equals(receiver._id)) {
    throw new ApiError(400, 'You cannot send friend request to yourself');
  }

  const existingFriendship = await Friendship.findOne({
    $or: [
      { sender: req.user._id, receiver: receiver._id },
      { sender: receiver._id, receiver: req.user._id },
    ],
  });

  if (existingFriendship) {
    if (existingFriendship.status === friendshipStatus.ACCEPTED) {
      throw new ApiError(409, 'User is already your friend');
    }

    if (existingFriendship.status === friendshipStatus.PENDING) {
      const requestSentByUser = existingFriendship.sender.equals(req.user._id);
      throw new ApiError(409, requestSentByUser ? 'Friend request already sent' : 'You already have a friend request from this user');
    }

    if (existingFriendship.status === friendshipStatus.BLOCKED) {
      throw new ApiError(403, 'Friend request cannot be sent');
    }

    existingFriendship.sender = req.user._id;
    existingFriendship.receiver = receiver._id;
    existingFriendship.status = friendshipStatus.PENDING;
    existingFriendship.respondedAt = null;
    await existingFriendship.save();

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          friendship: existingFriendship,
        },
        'Friend request sent successfully',
      ),
    );
  }

  const friendship = await Friendship.create({
    sender: req.user._id,
    receiver: receiver._id,
  });

  return res.status(201).json(
    new ApiResponse(
      201,
      {
        friendship,
      },
      'Friend request sent successfully',
    ),
  );
});

/**
 * Accept a pending friend request sent by the supplied verified username.
 *
 * @route PATCH /api/v1/users/accept-friend-request
 * @access Private
 * @param {import('express').Request & { user: { _id: import('mongoose').Types.ObjectId } }} req
 * @param {import('express').Response} res
 * @returns {Promise<void>} Sends the accepted friendship in an ApiResponse.
 * @throws {ApiError} When username is missing, the sender is not found, or no pending request exists.
 */
export const acceptFriendRequest = asyncHandler(async (req, res) => {
  const username = req.body?.username?.trim()?.toLowerCase();

  if (!username) {
    throw new ApiError(400, 'Username is required');
  }

  const sender = await User.findOne({ username, isEmailVerified: true });

  if (!sender) {
    throw new ApiError(404, 'User not found');
  }

  const friendship = await Friendship.findOneAndUpdate(
    {
      sender: sender._id,
      receiver: req.user._id,
      status: friendshipStatus.PENDING,
    },
    {
      $set: {
        status: friendshipStatus.ACCEPTED,
        respondedAt: new Date(),
      },
    },
    { returnDocument: 'after' },
  );

  if (!friendship) {
    throw new ApiError(404, 'Friend request not found');
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        friendship,
      },
      'Friend request accepted successfully',
    ),
  );
});

/**
 * Reject a pending friend request sent by the supplied verified username.
 *
 * @route PATCH /api/v1/users/reject-friend-request
 * @access Private
 * @param {import('express').Request & { user: { _id: import('mongoose').Types.ObjectId } }} req
 * @param {import('express').Response} res
 * @returns {Promise<void>} Sends the rejected friendship in an ApiResponse.
 * @throws {ApiError} When username is missing, the sender is not found, or no pending request exists.
 */
export const rejectFriendRequest = asyncHandler(async (req, res) => {
  const username = req.body?.username?.trim()?.toLowerCase();

  if (!username) {
    throw new ApiError(400, 'Username is required');
  }

  const sender = await User.findOne({ username, isEmailVerified: true });

  if (!sender) {
    throw new ApiError(404, 'User not found');
  }

  const friendship = await Friendship.findOneAndUpdate(
    {
      sender: sender._id,
      receiver: req.user._id,
      status: friendshipStatus.PENDING,
    },
    {
      $set: {
        status: friendshipStatus.REJECTED,
        respondedAt: new Date(),
      },
    },
    { returnDocument: 'after' },
  );

  if (!friendship) {
    throw new ApiError(404, 'Friend request not found');
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        friendship,
      },
      'Friend request rejected successfully',
    ),
  );
});

/**
 * Fetch pending friend requests received by the authenticated user.
 *
 * @route GET /api/v1/users/received-friend-requests
 * @access Private
 * @param {import('express').Request & { user: { _id: import('mongoose').Types.ObjectId } }} req
 * @param {import('express').Response} res
 * @returns {Promise<void>} Sends received friend requests with sanitized sender details in an ApiResponse.
 */
export const fetchReceivedFriendRequest = asyncHandler(async (req, res) => {
  let friendRequests = await Friendship.find({
    receiver: req.user._id,
    status: friendshipStatus.PENDING,
  })
    .select('-receiver -updatedAt')
    .populate('sender', 'name username avatarUrl bio')
    .sort({ createdAt: -1 })
    .lean();

  friendRequests = friendRequests.map((fReq) => ({
    ...fReq,
    id: fReq._id,
    _id: undefined,
    respondedAt: undefined,
    sender: { ...fReq.sender, id: fReq.sender._id, _id: undefined },
  }));

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        friendRequests,
      },
      'Fetched received friend request successfully',
    ),
  );
});

/**
 * Fetch pending friend requests sent by the authenticated user.
 *
 * @route GET /api/v1/users/sent-friend-requests
 * @access Private
 * @param {import('express').Request & { user: { _id: import('mongoose').Types.ObjectId } }} req
 * @param {import('express').Response} res
 * @returns {Promise<void>} Sends sent friend requests with sanitized receiver details in an ApiResponse.
 */
export const fetchSentFriendRequest = asyncHandler(async (req, res) => {
  let friendRequests = await Friendship.find({
    sender: req.user._id,
    status: friendshipStatus.PENDING,
  })
    .select('-sender -updatedAt')
    .populate('receiver', 'name username avatarUrl bio')
    .sort({ createdAt: -1 })
    .lean();

  friendRequests = friendRequests.map((fReq) => ({
    ...fReq,
    id: fReq._id,
    _id: undefined,
    respondedAt: undefined,
    receiver: { ...fReq.receiver, id: fReq.receiver._id, _id: undefined },
  }));

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        friendRequests,
      },
      'Fetched sent friend request successfully',
    ),
  );
});

/**
 * Cancel a pending friend request sent by the authenticated user.
 *
 * @route PATCH /api/v1/users/cancel-friend-request
 * @access Private
 * @param {import('express').Request & { user: { _id: import('mongoose').Types.ObjectId } }} req
 * @param {import('express').Response} res
 * @returns {Promise<void>} Sends the cancelled friendship in an ApiResponse.
 * @throws {ApiError} When username is missing, the receiver is not found, or no pending request exists.
 */
export const cancelFriendRequest = asyncHandler(async (req, res) => {
  const username = req.body?.username?.trim()?.toLowerCase();

  if (!username) {
    throw new ApiError(400, 'Username is required');
  }

  const receiver = await User.findOne({ username, isEmailVerified: true }).select('_id').lean();

  if (!receiver) {
    throw new ApiError(404, 'User not found');
  }

  const friendship = await Friendship.findOneAndUpdate(
    {
      sender: req.user._id,
      receiver: receiver._id,
      status: friendshipStatus.PENDING,
    },
    {
      $set: {
        status: friendshipStatus.REJECTED,
        respondedAt: new Date(),
      },
    },
    { returnDocument: 'after' },
  );

  if (!friendship) {
    throw new ApiError(404, 'Friend request not found');
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        friendship,
      },
      'Friend request cancelled successfully',
    ),
  );
});
