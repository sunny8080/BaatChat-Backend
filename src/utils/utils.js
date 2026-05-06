import crypto from 'crypto';
import nodemailer from 'nodemailer';
import './ApiError.js';
import User from '../models/user.model.js';

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
  return crypto.createHash('sha256').update(`${email}:${otp}:${process.env.OTP_SECRET}`).digest('hex');
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
    auth: {
      user: process.env.SMTP_EMAIL,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  const mailOptions = {
    from: `"BaatChat" <${process.env.ADMIN_EMAIL}>`,
    to: toEmail,
    subject: subject,
    html,
    text,
  };

  // Send email
  try {
    await transporter.sendMail(mailOptions);
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
