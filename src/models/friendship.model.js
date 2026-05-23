import mongoose, { Schema } from 'mongoose';
import { friendshipStatus } from '../constant.js';

const friendshipSchema = new Schema(
  {
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    receiver: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(friendshipStatus),
      default: friendshipStatus.PENDING,
    },
    respondedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

friendshipSchema.index({ sender: 1, receiver: 1 }, { unique: true });
friendshipSchema.index({ receiver: 1, status: 1 });
friendshipSchema.index({ sender: 1, status: 1 });

friendshipSchema.pre('save', function () {
  if (this.sender.equals(this.receiver)) {
    throw new ApiError(400, 'Users cannot send request to themselves');
  }
});

friendshipSchema.pre('save', async function () {
  if (!this.isNew && !this.isModified('sender') && !this.isModified('receiver')) {
    return;
  }

  // sender may already have friend request from receiver
  const existingFriendship = await this.constructor.exists({
    $or: [
      { sender: this.sender, receiver: this.receiver },
      { sender: this.receiver, receiver: this.sender },
    ],
    _id: { $ne: this._id },
  });

  if (existingFriendship) {
    throw new ApiError(400, 'Friendship request already exists for this receiver');
  }
});

/**
 * Friendship document model.
 *
 * @typedef {import('mongoose').InferSchemaType<typeof friendshipSchema>} friendshipDocument
 * @type {mongoose.Model<friendshipDocument>}
 */
const Friendship = mongoose.model('Friendship', friendshipSchema);
export default Friendship;
