import mongoose, { Schema } from 'mongoose';
import ApiError from '../utils/ApiError.js';
import { callStatus, callType } from '../constant.js';

// TODO - future scoep, we can add ended by or rejected by, also we can track each user when they joined and left call

const callSchema = new Schema(
  {
    roomId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    caller: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(callType),
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(callStatus),
      default: callStatus.INITIATED,
      index: true,
    },
    members: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
    startedAt: Date,
    endedAt: Date,
    duration: {
      // total call duration in seconds
      type: Number,
      default: 0,
    },
    isGroupCall: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

/**
 * Call validations
 */
callSchema.pre('save', function (next) {
  // at least 2 members required
  if (!this.members || this.members.length < 2) {
    return next(new ApiError(400, 'Call must contain at least 2 members'));
  }

  // duplicate members not allowed
  const uniqueMembers = new Set(this.members.map((member) => member.user.toString()));
  if (uniqueMembers.size !== this.members.length) {
    return next(new ApiError(400, 'Duplicate call members are not allowed'));
  }

  // endedAt must be after startedAt
  if (this.startedAt && this.endedAt && this.endedAt < this.startedAt) {
    return next(new ApiError(400, 'endedAt cannot be before startedAt'));
  }

  next();
});

/**
 * Fetch user call history
 */
callSchema.index({
  caller: 1,
  createdAt: -1,
});

/**
 * Fetch active calls
 */
callSchema.index({
  status: 1,
});

/**
 * Call document model.
 *
 * @typedef {import('mongoose').InferSchemaType<typeof callSchema>} CallDocument
 * @type {mongoose.Model<CallDocument>}
 */
const Call = mongoose.model('Call', callSchema);

export default Call;
