import crypto from 'crypto';
import nodemailer from 'nodemailer';
import ApiError from './ApiError.js';
import User from '../models/user.model.js';
import mongoose from 'mongoose';

/**
 * Generates a six-digit OTP and a deterministic SHA-256 hash tied to the email
 * and OTP secret for verification storage.
 *
 * @param {string} email - Email address the OTP is generated for.
 * @returns {{ OTP: string, hashedOTP: string }} Plain OTP for delivery and hashed OTP for persistence.
 */
export const generateOTP = (email) => {
  const OTP = crypto.randomInt(100000, 1000000).toString();
  const hashedOTP = hashOTP(email, OTP);
  return { OTP, hashedOTP };
};

/**
 * Creates a deterministic SHA-256 hash from an email, OTP, and server-side OTP secret.
 *
 * @param {string} email - Email address associated with the OTP.
 * @param {string} otp - One-time password to hash.
 * @returns {string} Hex-encoded SHA-256 hash used for OTP verification.
 */
export const hashOTP = (email, otp) => {
  return crypto
    .createHash('sha256')
    .update(`${email}:${otp}:${process.env.OTP_SECRET}`)
    .digest('hex');
};

/**
 * Generates a cryptographically secure temporary token for one-time flows.
 *
 * @returns {string} Hex-encoded random token.
 */
export const generateTempToken = function () {
  return crypto.randomBytes(20).toString('hex');
};

/**
 * Creates a deterministic SHA-256 hash of a temporary token for persistence.
 *
 * @param {string} token - Temporary token to hash.
 * @returns {string} Hex-encoded SHA-256 hash.
 */
export const hashTempToken = function (token) {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Sends an email through the configured SMTP transport.
 *
 * @param {string} toEmail - Recipient email address.
 * @param {string} subject - Email subject line.
 * @param {string} html - HTML email body.
 * @param {string} text - Plain-text email body.
 * @returns {Promise<void>} Resolves when the email is accepted by the SMTP transport.
 * @throws {ApiError} When the email cannot be sent.
 */
export const mailSender = async (toEmail, subject, html, text) => {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_EMAIL,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  // await transporter.verify();
  // console.log('SMTP server is ready');

  const mailOptions = {
    from: `"BaatChat" <${process.env.SITE_EMAIL}>`,
    to: toEmail,
    subject: subject,
    html,
    text,
  };

  // Send email
  try {
    const res = await transporter.sendMail(mailOptions);
  } catch (error) {
    throw new ApiError(500, 'Unable to send mail, try again after some time!');
  }
};

/**
 * Generates and persists a fresh access token and refresh token for a user.
 *
 * @param {string} userId - MongoDB identifier of the user to issue tokens for.
 * @returns {Promise<{ accessToken: string, refreshToken: string, cookieOptions: object }>} Signed tokens and cookie settings for client authentication.
 * @throws {ApiError} When no user exists for the provided identifier.
 */
export const generateAccessAndRefreshTokens = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  };

  // save refresh token in User DB
  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  return { accessToken, refreshToken, cookieOptions };
};

/**
 * Normalizes a user document or plain object for API responses.
 *
 * @param {mongoose.Document|object} user - User document or plain user object to sanitize.
 * @returns {object} User object with `id` mapped from `_id` and internal fields removed.
 */
export const sanitizeUser = (user) => {
  const userObj = user instanceof mongoose.Document ? user.toObject() : user;
  const { _id, __v, googleId, ...rest } = userObj;
  const sanitizedUser = {
    ...rest,
    id: _id.toString(),
  };

  return sanitizedUser;
};

/**
 * Normalizes a chat object for API responses.
 *
 * @param {object} chat - Chat object to sanitize.
 * @returns {object} Chat object with `id` mapped from `_id`, populated members sanitized, and internal fields removed.
 */
export const sanitizeChat = (chat) => {
  const { _id, __v, unreadCounts, members, lastMessage, activeMembers, ...rest } = chat;
  const sanitizedChat = {
    ...rest,
    id: _id.toString(),
    activeMembers: activeMembers?.map((mem) => sanitizeUser(mem)) || [],
    lastMessage: lastMessage
      ? {
          ...lastMessage,
          id: lastMessage._id.toString(),
          _id: undefined,
          sender: lastMessage.sender ? sanitizeUser(lastMessage.sender) : null,
        }
      : null,
  };

  return sanitizedChat;
};

/**
 * Normalizes a message object for API responses.
 *
 * @param {object} msg - Message object to sanitize.
 * @returns {object} Message object with `id` mapped from `_id`, sanitized sender, and internal fields removed.
 */
export const sanitizeMessage = (msg) => {
  const { _id, __v, sender, deliveredTo, seenBy, ...rest } = msg;
  const sanitizedMsg = {
    ...rest,
    id: _id.toString(),
    sender: sanitizeUser(sender),
    deliveredTo: deliveredTo?.map((del) => ({
      ...del,
      user: del.user.toString(),
      id: del._id,
      _id: undefined,
    })),
    seenBy: seenBy?.map((seen) => ({
      ...seen,
      user: seen.user.toString(),
      id: seen._id,
      _id: undefined,
    })),
  };
  return sanitizedMsg;
};

/**
 * Retrieves a cookie value by name from a Cookie header string.
 *
 * @param {string} cookies - Raw Cookie header string containing semicolon-delimited cookies.
 * @param {string} [cookieName=''] - Name of the cookie to retrieve.
 * @returns {string|null} Cookie value when found, otherwise `null`.
 */
export const getCookie = (cookies, cookieName = '') => {
  const cookiesObj = cookies.split(';');
  for (let cookie of cookiesObj) {
    const [key, val] = cookie.trim().split('=');
    if (key === cookieName) return val;
  }
  return null;
};

/**
 * Capitalizes the first letter of each space-delimited word and lowercases the rest.
 *
 * @param {string} str - String to convert to title-style capitalization.
 * @returns {string} String with each word capitalized.
 */
export const capitalizeWords = (str) => {
  return str
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};
