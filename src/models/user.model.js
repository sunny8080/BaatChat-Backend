import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import mongoose, { Schema } from 'mongoose';
import { UserLoginTypes } from '../constant.js';

const userSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
      match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Enter valid email!'],
    },
    phone: {
      type: String,
      trim: true,
      minLength: [10, 'Phone number must have at least 10 digits'],
      maxLength: [10, 'Phone number must have at most 10 digits'],
      match: [
        /^.*\d.*\d.*\d.*\d.*\d.*\d.*\d.*\d.*\d.*\d.*$/,
        'Phone number must have at least 10 digits.',
      ],
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    username: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
      unique: true,
      minlength: 3,
      maxlength: 30,
    },
    googleId: {
      type: String,
      trim: true,
      unique: true,
      required() {
        return this.loginType === UserLoginTypes.GOOGLE;
      },
      select: false,
    },
    avatarUrl: {
      type: String,
      trim: true,
      default: '',
    },
    password: {
      type: String,
      required() {
        return this.loginType === UserLoginTypes.EMAIL_PASSWORD;
      },
      minlength: 8,
      select: false,
    },
    bio: {
      type: String,
      default: '',
      maxlength: 200,
    },
    loginType: {
      type: String,
      enum: Object.values(UserLoginTypes),
      default: UserLoginTypes.EMAIL_PASSWORD,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    refreshToken: {
      type: String,
      select: false,
    },
    forgotPasswordToken: {
      type: String,
      select: false,
    },
    forgotPasswordExpiry: {
      type: Date,
      select: false,
    },
    emailVerificationOTP: {
      type: String,
      select: false,
    },
    emailVerificationOTPExpiry: {
      type: Date,
      select: false,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
    friends: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    blockedUsers: [
      // TODO - future scope, for now won't be user for now
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
  },
  { timestamps: true },
);

// User middlewares to update password
userSchema.pre('save', async function () {
  if (!this.isModified('password') || !this.password) {
    return;
  }

  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.pre('findOneAndUpdate', async function () {
  const update = this.getUpdate();
  const password = update?.$set?.password ?? update?.password;

  if (!password) {
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  if (update.$set?.password) {
    update.$set.password = hashedPassword;
  } else {
    update.password = hashedPassword;
  }
});

userSchema.pre('save', async function () {
  if (!this.avatarUrl) {
    this.avatarUrl = `https://api.dicebear.com/9.x/initials/svg?seed=${this.name}`;
  }
});

// User methods

/**
 * Checks whether a plain-text password matches the user's hashed password.
 *
 * @param {string} password - Plain-text password to compare.
 * @returns {Promise<boolean>} True when the password matches, otherwise false.
 */
userSchema.methods.isPasswordCorrect = async function (password) {
  return await bcrypt.compare(password, this.password);
};

/**
 * Generates a signed JWT access token for the user.
 *
 * @returns {string} Signed access token.
 */
userSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      _id: this._id,
      email: this.email,
      name: this.name,
      username: this.username,
    },
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRY || '15m',
    },
  );
};

/**
 * Generates a signed JWT refresh token for the user.
 *
 * @returns {string} Signed refresh token.
 */
userSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    {
      _id: this._id,
    },
    process.env.REFRESH_TOKEN_SECRET,
    {
      expiresIn: process.env.REFRESH_TOKEN_EXPIRY || '7d',
    },
  );
};

/**
 * Generates a temporary token pair for email verification or password reset.
 *
 * @returns {{unHashedToken: string, hashedToken: string, tokenExpiry: number}} Token payload.
 */
userSchema.methods.generateTemporaryToken = function () {
  // we'll send unHashedToken to client and store hashedToken in DB, which can be later used for verification
  const unHashedToken = crypto.randomBytes(20).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(unHashedToken).digest('hex');
  const tokenExpiry = Date.now() + process.env.USER_TEMPORARY_TOKEN_EXPIRY;

  return { unHashedToken, hashedToken, tokenExpiry };
};

/**
 * User document model.
 *
 * @typedef {import('mongoose').InferSchemaType<typeof userSchema>} userDocument
 * @type {mongoose.Model<userDocument>}
 */
const User = mongoose.model('User', userSchema);
export default User;
