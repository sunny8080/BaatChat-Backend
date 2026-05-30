import mongoose, { Schema } from 'mongoose';
import ApiError from '../utils/ApiError.js';
import { ChatType } from '../constant.js';

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
      // Map -> unreadCounts[userId] = unreadCnt
      type: Map,
      of: Number,
      default: {},
    },
    members: {
      type: [
        {
          type: Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
      ],
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
    deletedBy: {
      type: [
        {
          type: Schema.Types.ObjectId,
          ref: 'User',
        },
      ],
      select: false,
    },
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
    if (this.activeMembers.length < 2 || this.activeMembers.length > 50) {
      throw new ApiError(400, 'Group must contain 2-50 members');
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

/**
 * Chat document model.
 *
 * @typedef {import('mongoose').InferSchemaType<typeof chatSchema>} ChatDocument
 * @type {mongoose.Model<ChatDocument>}
 */
const Chat = mongoose.model('Chat', chatSchema);
export default Chat;
