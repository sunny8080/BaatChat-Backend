import mongoose, { Schema } from 'mongoose';
import ApiError from '../utils/ApiError.js';
import { ChatType } from '../constant.js';

const membershipSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    leftAt: {
      type: Date,
      default: null,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    _id: false,
  },
);

const chatSchema = new Schema(
  {
    type: {
      type: String,
      enum: Object.values(ChatType),
      default: ChatType.PERSONAL,
    },
    name: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    avatarUrl: {
      type: String,
      trim: true,
    },
    activeMembers: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
    unreadCounts: {
      // store unread message count for each user in this chat
      // Map -> unreadCounts[userIdStr] = unreadCount
      type: Map,
      of: Number,
      default: {},
    },
    members: {
      // this contains history of each member when he joined or rejoined, deleted chat, left chat
      type: [membershipSchema],
      select: false,
    },
    personalChatKey: {
      // sort key before saving, u1_u2 , for personal chat only
      type: String,
      select: false,
    },
    admins: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    // TODO - since for every member last message can be different, so we can't trust on this
    // in future we'll be removing all of its' use and replica
    lastMessage: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
    },
    lastMessageAt: Date,
  },
  {
    timestamps: true,
    minimize: false, // so that we can store empty unreadCounts map
  },
);

// TODO - add default avatar url

chatSchema.pre('save', function () {
  // duplicate activeMembers not allowed
  const uniqueMembers = [...new Set(this.activeMembers.map((m) => m.toString()))];

  if (uniqueMembers.length !== this.activeMembers.length) {
    throw new ApiError(400, 'Duplicate members are not allowed');
  }

  // activeMembers required
  if (!Array.isArray(this.activeMembers) || this.activeMembers.length === 0) {
    throw new ApiError(400, 'Chat must have members');
  }

  // personal chat validation
  if (this.type === ChatType.PERSONAL) {
    if (this.activeMembers.length !== 2) {
      throw new ApiError(400, 'Personal chat must contain exactly 2 members');
    }

    if (this.isModified('activeMembers')) {
      // generate deterministic key
      const sortedMembers = this.activeMembers.map((m) => m.toString()).sort();
      this.personalChatKey = sortedMembers.join('_');
    }
  }

  // group validation
  if (this.type === ChatType.GROUP) {
    if (this.activeMembers.length < 1 || this.activeMembers.length > 50) {
      throw new ApiError(400, 'Group must contain 1-50 active members');
    }

    if (this.isModified('activeMembers')) {
      // group should not have personal key
      this.personalChatKey = undefined;
    }
  }
});

chatSchema.index({
  activeMembers: 1,
  lastMessageAt: -1,
});

chatSchema.index({
  'members.user': 1,
});

// personalChatKey will avoid creating duplicate personal chat for same set of users
// like userA and userB can have only one personal chat
// it's value will be [u1_u2] and u1<u2
chatSchema.index(
  {
    personalChatKey: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      type: 'personal',
    },
  },
);

// create new memberships for all users when we create a new chat
chatSchema.statics.createMemberships = function (userIds, joinedAt = new Date()) {
  return userIds.map((userId) => ({
    user: userId,
    joinedAt,
    leftAt: null,
    deletedAt: null,
  }));
};

// fetch all memberships for a user in current chat, sorted by joining date, so current will be last
chatSchema.methods.getMembershipsForUser = function (userId) {
  const userIdStr = userId.toString();

  return (this.members || [])
    .filter((membership) => membership.user?.toString() === userIdStr)
    .sort((a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime());
};

// fetch current active membership for user
chatSchema.methods.getCurrentActiveMembershipForUser = function (userId) {
  return this.getMembershipsForUser(userId)
    .filter((membership) => !membership.leftAt)
    .at(-1);
};

// fetch current membership for user, so it may be that user has left the chat
chatSchema.methods.getLatestMembershipForUser = function (userId) {
  return this.getMembershipsForUser(userId).at(-1);
};

// build message query to fetch all message in a period which can be found in membership
chatSchema.methods.buildVisibleMessageQueryForMembership = function (
  userId,
  membership,
  baseQuery = {},
) {
  if (!membership) return null;

  // for a particular membership/period, message will in range of (start, end)
  // if user deleted chat then - start > deletedAt otherwise start will >= joinedAt
  // if user left the chat - end <= leftAt otherwise

  const createdAt = {};

  if (membership.deletedAt) {
    createdAt.$gt = membership.deletedAt;
  } else if (membership.joinedAt) {
    createdAt.$gte = membership.joinedAt;
  }

  if (membership.leftAt) {
    createdAt.$lte = membership.leftAt;
  }

  if (!Object.keys(createdAt).length) return null;

  return {
    ...baseQuery,
    createdAt,
  };
};

// build message query to fetch all message for a user, it may happen that user left group and joined again
// so he will have message for different periods i.e., memberships
chatSchema.methods.buildVisibleMessageQuery = function (userId, baseQuery = {}) {
  const userIdStr = userId.toString();
  const windows = this.getMembershipsForUser(userIdStr)
    .map((membership) => this.buildVisibleMessageQueryForMembership(userIdStr, membership))
    .map((query) => (query ? { createdAt: query.createdAt } : null))
    .filter(Boolean);

  if (!windows.length) {
    return null;
  }

  return {
    ...baseQuery,
    $or: windows,
  };
};

/**
 * Chat document model.
 *
 * @typedef {import('mongoose').InferSchemaType<typeof chatSchema>} ChatDocument
 * @type {mongoose.Model<ChatDocument>}
 */
const Chat = mongoose.model('Chat', chatSchema);
export default Chat;
