import mongoose, { Schema } from 'mongoose';
import ApiError from '../utils/ApiError.js';
import { messageType } from '../constant.js';

const reactionSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    reaction: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    _id: false,
    timestamps: true,
  },
);

const attachmentSchema = new Schema(
  {
    url: {
      type: String,
      required: true,
      trim: true,
    },
    fileName: {
      type: String,
      trim: true,
      default: '',
    },
    mimeType: {
      type: String,
      trim: true,
      default: '',
    },
    size: {
      type: Number,
      default: 0,
    },
  },
  {
    _id: false,
  },
);

const messageSchema = new Schema(
  {
    chat: {
      type: Schema.Types.ObjectId,
      ref: 'Chat',
      required: true,
      index: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(messageType),
      default: messageType.TEXT,
    },
    text: {
      type: String,
      trim: true,
      default: '',
    },
    attachments: [attachmentSchema],
    reactions: [reactionSchema],

    replyTo: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
    },

    seenBy: [
      {
        user: {
          type: Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },

        seenAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    deliveredTo: [
      {
        user: {
          type: Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },

        deliveredAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    editedAt: Date,

    deletedForEveryone: {
      type: Boolean,
      default: false,
    },

    deletedBy: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
  },
  {
    timestamps: true,
  },
);

/**
 * Message must contain either:
 * - text
 * - attachments
 */
messageSchema.pre('save', function (next) {
  const hasText = this.text && this.text.trim().length > 0;

  const hasAttachments = this.attachments && this.attachments.length > 0;

  if (!hasText && !hasAttachments) {
    return next(new ApiError(400, 'Message must contain text or attachments'));
  }

  // duplicate reactions by same user not allowed
  const uniqueReactionUsers = new Set(this.reactions.map((reaction) => reaction.user.toString()));

  if (uniqueReactionUsers.size !== this.reactions.length) {
    return next(new ApiError(400, 'User can react only once per message'));
  }

  next();
});

/**
 * Common chat queries:
 * fetch chat messages
 */
messageSchema.index({
  chat: 1,
  createdAt: -1,
});

/**
 * Message document model.
 *
 * @typedef {import('mongoose').InferSchemaType<typeof messageSchema>} MessageDocument
 * @type {mongoose.Model<MessageDocument>}
 */
const Message = mongoose.model('Message', messageSchema);

export default Message;
