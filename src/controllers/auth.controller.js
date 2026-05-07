import { UserLoginTypes } from '../constant.js';
import jwt from 'jsonwebtoken';
import User from '../models/user.model.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import OTPMail from '../mails/OTPMail.js';
import { mailSender, generateOTP, hashOTP, generateAccessAndRefreshTokens, generateTempToken, hashTempToken } from '../utils/utils.js';
import ForgotPasswordMail from '../mails/ForgotPasswordMail.js';

/**
 * Register a new user and send a signup OTP to their email.
 *
 * @route POST /api/v1/auth/register-user
 * @param {import("express").Request} req - Express request with name, username, email, phone, and password in the body.
 * @param {import("express").Response} res - Express response.
 * @param {import("express").NextFunction} next - Express next middleware callback.
 * @returns {Promise<void>} Sends the normalized email and OTP delivery status.
 */
export const registerUser = asyncHandler(async (req, res, next) => {
  if (!req.body) throw new ApiError(404, 'No data found!');
  let { name, username, email, phone, password } = req.body;
  name = name?.trim()?.toLowerCase();
  username = username?.trim()?.toLowerCase();
  email = email?.trim()?.toLowerCase();
  phone = phone?.trim();
  password = password?.trim();

  if (!(name && username && email && phone && password)) {
    throw new ApiError(400, 'Some data are missing!');
  }

  // check if username already exist and not having same email
  const userNameExist = await User.findOne({
    username,
    email: { $ne: email },
  });
  if (userNameExist) {
    throw new ApiError(400, 'Username already exists, try other username!');
  }

  // check if any email verified user exist, having given email or username
  // check if email is already verified
  const userExist = await User.findOne({
    email,
    isEmailVerified: true,
  });

  if (userExist) {
    throw new ApiError(400, 'User already exists, try to login!');
  }

  // send email to user about OTP and save hashed OTP to database for later email verification
  const { OTP, hashedOTP } = generateOTP(email);
  const { html, text } = OTPMail(name, OTP, parseInt(process.env.OTP_EXPIRY_MS) / (60 * 1000));
  await mailSender(email, 'Your BaatChat signup OTP', html, text);

  // update user if exist, or create new user with updating username and other details
  let createdUser = await User.findOneAndUpdate(
    { email, isEmailVerified: false },
    {
      $set: {
        name,
        username,
        email,
        phone,
        password,
        isEmailVerified: false,
        emailVerificationOTP: hashedOTP,
        emailVerificationOTPExpiry: new Date(Date.now() + parseInt(process.env.OTP_EXPIRY_MS)),
      },
    },
    {
      returnDocument: 'after',
      upsert: true,
    },
  );

  if (!createdUser) {
    throw new ApiError(500, 'Something went wrong while registering the user!');
  }

  return res.status(201).json(new ApiResponse(201, { email }, 'Signup OTP sent successfully on your email.'));
});

/**
 * Verify a user's signup email with an OTP, mark the account as email-password authenticated, and issue auth tokens.
 *
 * @route POST /api/v1/auth/verify-email
 * @param {import("express").Request} req - Express request with email and otp in the body.
 * @param {import("express").Response} res - Express response.
 * @param {import("express").NextFunction} next - Express next middleware callback.
 * @returns {Promise<void>} Sends the verified user and generated access and refresh tokens.
 */
export const verifyEmail = asyncHandler(async (req, res, next) => {
  let { otp, email } = req.body;
  otp = otp?.trim();
  email = email?.trim().toLowerCase();
  if (!(otp && email)) {
    throw new ApiError(400, 'Some data are missing!');
  }

  const user = await User.findOne({
    email,
  }).select('+emailVerificationOTP +emailVerificationOTPExpiry');

  if (!user) {
    throw new ApiError(404, "Email and OTP didn't matched!");
  }

  if (user.isEmailVerified) {
    throw new ApiError(409, 'User with this email already exists');
  }

  const isOtpValid = user.emailVerificationOTP === hashOTP(email, otp) && user.emailVerificationOTPExpiry?.getTime() > Date.now();

  if (!isOtpValid) {
    throw new ApiError(400, 'Invalid or expired OTP');
  }

  // verify user and save data
  user.isEmailVerified = true;
  user.emailVerificationOTP = undefined;
  user.emailVerificationOTPExpiry = undefined;
  user.loginType = UserLoginTypes.EMAIL_PASSWORD;
  await user.save({ validateBeforeSave: false });

  // generate access token and refresh token and send it in http cookie as httpOnly
  const { accessToken, refreshToken, cookieOptions } = await generateAccessAndRefreshTokens(user._id);

  let createdUser = await User.findById(user._id).lean();
  createdUser.id = createdUser._id;
  delete createdUser._id;
  delete createdUser.__v;

  // sending access adn refresh token in response, so client can store if req
  return res
    .status(201)
    .cookie('accessToken', accessToken, cookieOptions)
    .cookie('refreshToken', refreshToken, cookieOptions)
    .json(
      new ApiResponse(
        201,
        {
          user: createdUser,
          accessToken,
          refreshToken,
        },
        'User signed up successfully',
      ),
    );
});

/**
 * Authenticates a user with email or username and password.
 *
 * Sets signed access and refresh tokens as HTTP-only cookies and returns the
 * sanitized user payload with both tokens in the response body.
 *
 * @route POST /api/v1/auth/login
 * @param {import('express').Request} req - Express request containing `email` or `username`, and `password` in the body.
 * @param {import('express').Response} res - Express response used to set auth cookies and send the login payload.
 * @param {import('express').NextFunction} next - Express next middleware callback.
 * @returns {Promise<import('express').Response>} Login response with user data, access token, and refresh token.
 * @throws {ApiError} If credentials are missing, invalid, or the user registered with a different login method.
 */
export const loginUser = asyncHandler(async (req, res, next) => {
  let { email, username, password } = req.body;
  email = email?.trim()?.toLowerCase();
  username = username?.trim()?.toLowerCase();

  if (!(email || username)) {
    throw new ApiError(400, 'Username or email is required!');
  }

  if (!password) {
    throw new ApiError(400, 'Password is required!');
  }

  const loginCred = email ? { email } : { username };
  const user = await User.findOne(loginCred).select('+password');

  if (!user) {
    throw new ApiError(401, 'Invalid email or password!');
  }

  // check if user has used another method for signed up
  if (user.loginType !== UserLoginTypes.EMAIL_PASSWORD) {
    throw new ApiError(400, `You have registered using ${user.loginType?.toLowerCase()}. Please use the ${user.loginType?.toLowerCase()} login option to access your account.`);
  }

  if (!(await user.isPasswordCorrect(password))) {
    throw new ApiError(401, 'Invalid email or password!');
  }

  const { accessToken, refreshToken, cookieOptions } = await generateAccessAndRefreshTokens(user._id);

  let createdUser = await User.findById(user._id).lean();
  createdUser.id = createdUser._id;
  delete createdUser._id;
  delete createdUser.__v;

  return res
    .status(201)
    .cookie('accessToken', accessToken, cookieOptions)
    .cookie('refreshToken', refreshToken, cookieOptions)
    .json(
      new ApiResponse(
        201,
        {
          user: createdUser,
          accessToken,
          refreshToken,
        },
        'User logged up successfully',
      ),
    );
});

/**
 * Logs out the authenticated user by clearing their stored refresh token,
 * removing auth cookies, and returning a success response.
 *
 * @route POST /api/v1/auth/logout
 * @access Private
 */
export const logoutUser = asyncHandler(async (req, res, next) => {
  await User.findByIdAndUpdate(req.user._id, {
    $set: {
      refreshToken: '',
    },
  });

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  };

  return res
    .status(200)
    .clearCookie('accessToken', cookieOptions)
    .clearCookie('refreshToken', cookieOptions)
    .json(new ApiResponse(200, {}, 'User logged out successfully'));
});

/**
 * Refresh the current user's access token using a valid refresh token.
 *
 * @route POST /api/v1/auth/refresh-token
 * @param {import("express").Request} req - Express request with refresh token in cookies or body.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>} Sends newly generated access and refresh tokens.
 */
export const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, 'Refresh token is required');
  }

  let decodedToken;

  try {
    decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET);
  } catch {
    throw new ApiError(401, 'Invalid refresh token');
  }

  const user = await User.findById(decodedToken?._id).select('+refreshToken');

  // check if incoming refresh token is same as refresh token saved in user document
  // so this allows user to use refresh token only once
  // once it is used, we have to generate and save new refresh token in user document
  if (!user || user.refreshToken !== incomingRefreshToken) {
    throw new ApiError(401, 'Refresh token is expired or used');
  }

  const { accessToken, refreshToken, cookieOptions } = await generateAccessAndRefreshTokens(user._id);

  // update user's refresh token
  user.refreshToken = refreshToken;
  await user.save();

  return res
    .status(200)
    .cookie('accessToken', accessToken, cookieOptions)
    .cookie('refreshToken', refreshToken, cookieOptions)
    .json(new ApiResponse(200, { accessToken, refreshToken }, 'Access token refreshed successfully'));
});

/**
 * Resend the signup email verification OTP to an unverified user.
 *
 * @route POST /api/v1/auth/resend-email-verification-otp
 * @param {import("express").Request} req - Express request with email in the body.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>} Sends the normalized email and OTP delivery status.
 */
export const resendEmailVerificationOTP = asyncHandler(async (req, res) => {
  let { email } = req.body;
  email = email?.trim().toLowerCase();

  const user = await User.findOne({ email });
  if (!user) {
    throw new ApiError(404, 'User does not exists');
  }

  if (user.isEmailVerified) {
    throw new ApiError(404, 'Email is already verified, try logging in!');
  }

  // send email to user about OTP and save hashed OTP to database for later email verification
  const { OTP, hashedOTP } = generateOTP(email);
  const { html, text } = OTPMail(user.name, OTP, parseInt(process.env.OTP_EXPIRY_MS) / (60 * 1000));
  await mailSender(email, 'Your BaatChat signup OTP', html, text);

  user.emailVerificationOTP = hashedOTP;
  user.emailVerificationOTPExpiry = new Date(Date.now() + parseInt(process.env.OTP_EXPIRY_MS));
  await user.save();

  return res.status(201).json(new ApiResponse(201, { email }, 'Signup OTP sent successfully on your email.'));
});

/**
 * Send a password reset link to an email-password user.
 *
 * @route POST /api/v1/auth/forgot-password
 * @param {import("express").Request} req - Express request with email in the body.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>} Sends the password reset email delivery status.
 */
export const forgotPassword = asyncHandler(async (req, res) => {
  let { email } = req.body;
  email = email?.trim()?.toLowerCase();

  if (!email) {
    throw new ApiError(400, 'Email is required');
  }

  const user = await User.findOne({ email });
  if (!user) {
    throw new ApiError(404, 'User does not exists');
  }

  if (user.loginType !== UserLoginTypes.EMAIL_PASSWORD) {
    throw new ApiError(400, `You have registered using ${user.loginType?.toLowerCase()}. Please use the ${user.loginType?.toLowerCase()} login option to access your account.`);
  }

  if (!user.isEmailVerified) {
    throw new ApiError(404, 'Email is not verified, signup first!');
  }

  const resetToken = generateTempToken();
  const hashedResetToken = hashTempToken(resetToken);
  const resetURL = `${process.env.FED_URL}/reset-password/${resetToken}`;

  user.forgotPasswordToken = hashedResetToken;
  user.forgotPasswordExpiry = new Date(Date.now() + process.env.USER_TEMPORARY_TOKEN_EXPIRY);
  await user.save({ validateBeforeSave: false });

  // send reset link email
  const { html, text } = ForgotPasswordMail(user.name, resetURL, parseInt(process.env.OTP_EXPIRY_MS / (60 * 1000)));
  await mailSender(email, 'Reset your BaatChat password 🔑', html, text);

  return res.status(200).json(new ApiResponse(200, {}, 'Password reset link sent successfully on your email.'));
});

/**
 * Reset a user's password using a valid password reset token.
 *
 * @param {import("express").Request} req - Express request with the reset token in params or body and the new password details in the body.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>} Sends the password reset status.
 */
export const resetPassword = asyncHandler(async (req, res) => {
  let { resetToken, password, confirmPassword } = req.body;
  password = password?.trim();
  confirmPassword = confirmPassword?.trim();

  if (!(resetToken && password && confirmPassword)) {
    throw new ApiError(400, 'Reset token, password and confirm password are required');
  }

  if (password !== confirmPassword) {
    throw new ApiError(400, 'Password and confirm password do not match');
  }

  const hashedResetToken = hashTempToken(resetToken);
  const user = await User.findOne({
    forgotPasswordToken: hashedResetToken,
    forgotPasswordExpiry: { $gt: new Date() },
  }).select('+forgotPasswordToken +forgotPasswordExpiry');

  if (!user) {
    throw new ApiError(400, 'Invalid or expired password reset token');
  }

  user.password = password;
  user.forgotPasswordToken = undefined;
  user.forgotPasswordExpiry = undefined;
  user.refreshToken = '';
  await user.save();

  return res.status(200).json(new ApiResponse(200, {}, 'Password reset successfully'));
});

/**
 * Change the authenticated email-password user's password and clear auth cookies.
 *
 * @route POST /api/v1/auth/change-password
 * @access Private
 * @param {import("express").Request} req - Express request with oldPassword, newPassword, and confirmPassword in the body.
 * @param {import("express").Response} res - Express response used to clear auth cookies and send the success response.
 * @returns {Promise<void>} Sends a password changed success response.
 */
export const changePassword = asyncHandler(async (req, res) => {
  let { oldPassword, newPassword, confirmPassword } = req.body;
  oldPassword = oldPassword?.trim();
  newPassword = newPassword?.trim();
  confirmPassword = confirmPassword?.trim();

  if (!(oldPassword && newPassword && confirmPassword)) {
    throw new ApiError(400, 'Old password, new password and confirm password are required');
  }

  if (newPassword !== confirmPassword) {
    throw new ApiError(400, 'New password and confirm password do not match');
  }

  const user = await User.findById(req.user?._id).select('+password');
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  if (user.loginType !== UserLoginTypes.EMAIL_PASSWORD) {
    throw new ApiError(400, `You have registered using ${user.loginType?.toLowerCase()}. Password change is not available for this account.`);
  }

  if (!(await user.isPasswordCorrect(oldPassword))) {
    throw new ApiError(401, 'Old password is incorrect');
  }

  user.password = newPassword;
  user.refreshToken = '';
  await user.save();

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  };

  return res
    .status(200)
    .clearCookie('accessToken', cookieOptions)
    .clearCookie('refreshToken', cookieOptions)
    .json(new ApiResponse(200, {}, 'Password changed successfully'));
});
