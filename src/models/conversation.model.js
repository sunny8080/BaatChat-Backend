import mongoose, { Schema } from 'mongoose';
import ApiError from '../utils/ApiError.js';
import { conversationType } from '../constant';

const conversationSchema = new Schema(
  {
    type: {
      type: String,
      enum: Object.values(conversationType),
      default: conversationType.PERSONAL,
    },
    name: {
      type: String,
      trim: true,
      default: '',
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    avatarUrl: {
      type: String,
      trim: true,
      default: '',
    },
    activeMembers: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
    members: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
    personalConversationKey: {
      // sort key before saving, u1_u2
      type: String,
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
    deletedBy: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    lastMessage: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
    },
    lastMessageAt: Date,
  },
  {
    timestamps: true,
  },
);

conversationSchema.pre('save', function (next) {
  // duplicate activeMembers not allowed
  const uniqueMembers = [...new Set(this.activeMembers.map(String))];

  if (uniqueMembers.length !== this.activeMembers.length) {
    return next(new ApiError(400, 'Duplicate members are not allowed'));
  }

  // activeMembers required
  if (!this.activeMembers || this.activeMembers.length === 0) {
    return next(new ApiError(400, 'Conversation must have members'));
  }

  // personal chat validation
  if (this.type === conversationType.PERSONAL) {
    if (this.activeMembers.length !== 2) {
      return next(new ApiError(400, 'Personal conversation must contain exactly 2 members'));
    }

    if (this.isModified('activeMembers')) {
      // generate deterministic key
      const sortedMembers = this.activeMembers.map(String).sort();
      this.personalConversationKey = sortedMembers.join('_');
    }
  }

  // group validation
  if (this.type === conversationType.GROUP) {
    if (this.activeMembers.length < 2 || this.activeMembers.length > 50) {
      return next(new ApiError(400, 'Group must contain 2-50 members'));
    }

    if (this.isModified('activeMembers')) {
      // group should not have personal key
      this.personalConversationKey = undefined;
    }
  }
  next();
});

conversationSchema.index({ activeMembers: 1 });
conversationSchema.index({ lastMessageAt: -1 });

// personalConversationKey will avoid creating duplicate personal chat for same set of users
// like userA and userB can have only one personal chat
// it's value will be [u1_u2] and u1<u2
conversationSchema.index(
  {
    personalConversationKey: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      type: 'personal',
    },
  },
);

/**
 * Conversation document model.
 *
 * @typedef {import('mongoose').InferSchemaType<typeof conversationSchema>} ConversationDocument
 * @type {mongoose.Model<ConversationDocument>}
 */
const Conversation = mongoose.model('Conversation', conversationSchema);
export default Conversation;
