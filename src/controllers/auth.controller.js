import { UserLoginTypes } from '../constant.js';
import jwt from 'jsonwebtoken';
import User from '../models/user.model.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import OTPMail from '../mails/OTPMail.js';
import {
  mailSender,
  generateOTP,
  hashOTP,
  generateAccessAndRefreshTokens,
  generateTempToken,
  hashTempToken,
  sanitizeUser,
} from '../utils/utils.js';
import ForgotPasswordMail from '../mails/ForgotPasswordMail.js';
import { OAuth2Client } from 'google-auth-library';
import { uploadToCloudinaryFromUrl } from '../config/cloudnaryConnect.js';

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

  if (password.length < 6) {
    throw new ApiError(400, 'Password must have at least 6 chars');
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

  return res
    .status(201)
    .json(new ApiResponse(201, { email }, 'Signup OTP sent successfully on your email.'));
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

  const isOtpValid =
    user.emailVerificationOTP === hashOTP(email, otp) &&
    user.emailVerificationOTPExpiry?.getTime() > Date.now();

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
  const { accessToken, refreshToken, cookieOptions } = await generateAccessAndRefreshTokens(
    user._id,
  );

  let createdUser = await User.findById(user._id);

  // sending access adn refresh token in response, so client can store if req
  return res
    .status(200)
    .cookie('accessToken', accessToken, cookieOptions)
    .cookie('refreshToken', refreshToken, cookieOptions)
    .json(
      new ApiResponse(
        200,
        {
          user: sanitizeUser(createdUser),
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
  let { emailOrUsername, password } = req.body;
  emailOrUsername = emailOrUsername?.trim()?.toLowerCase();

  if (!emailOrUsername) {
    throw new ApiError(400, 'Username or email is required!');
  }

  if (!password) {
    throw new ApiError(400, 'Password is required!');
  }

  const loginCred = emailOrUsername.includes('@')
    ? { email: emailOrUsername }
    : { username: emailOrUsername };
  let user = await User.findOne(loginCred).select('+password');

  if (!user) {
    throw new ApiError(401, 'Invalid email or password!');
  }

  // check if user has used another method for signed up
  if (user.loginType !== UserLoginTypes.EMAIL_PASSWORD) {
    throw new ApiError(
      400,
      `You have registered using ${user.loginType?.toLowerCase()}. Please use the ${user.loginType?.toLowerCase()} login option to access your account.`,
    );
  }

  if (!(await user.isPasswordCorrect(password))) {
    throw new ApiError(401, 'Invalid email or password!');
  }

  const { accessToken, refreshToken, cookieOptions } = await generateAccessAndRefreshTokens(
    user._id,
  );

  user = await User.findById(user._id);

  return res
    .status(200)
    .cookie('accessToken', accessToken, cookieOptions)
    .cookie('refreshToken', refreshToken, cookieOptions)
    .json(
      new ApiResponse(
        200,
        {
          user: sanitizeUser(user),
          accessToken,
          refreshToken,
        },
        'User logged in successfully',
      ),
    );
});

/**
 * Logs out the authenticated user by clearing their stored refresh token,
 * removing auth cookies, and returning a success response.
 *
 * @route GET /api/v1/auth/logout
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
 * Get the current user's access token using a valid refresh token.
 *
 * @route GET /api/v1/auth/refresh-access-token
 * @param {import("express").Request} req - Express request with refresh token in cookies or body.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>} Sends newly generated access and refresh tokens.
 */
export const getAccessToken = asyncHandler(async (req, res) => {
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

  const { accessToken, refreshToken, cookieOptions } = await generateAccessAndRefreshTokens(
    user._id,
  );

  // update user's refresh token
  user.refreshToken = refreshToken;
  await user.save();

  return res
    .status(200)
    .cookie('accessToken', accessToken, cookieOptions)
    .cookie('refreshToken', refreshToken, cookieOptions)
    .json(
      new ApiResponse(200, { accessToken, refreshToken }, 'Access token refreshed successfully'),
    );
});

/**
 * Resend the signup email verification OTP to an unverified user.
 *
 * @route POST /api/v1/auth/resend-verification-otp
 * @param {import("express").Request} req - Express request with email in the body.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>} Sends the normalized email and OTP delivery status.
 */
export const resendVerificationOTP = asyncHandler(async (req, res) => {
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

  return res
    .status(200)
    .json(new ApiResponse(200, { email }, 'Signup OTP sent successfully on your email.'));
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
    throw new ApiError(
      400,
      `You have registered using ${user.loginType?.toLowerCase()}. Please use the ${user.loginType?.toLowerCase()} login option to access your account.`,
    );
  }

  if (!user.isEmailVerified) {
    throw new ApiError(404, 'Email is not verified, signup first!');
  }

  const resetToken = generateTempToken();
  const hashedResetToken = hashTempToken(resetToken);
  const resetURL = `${process.env.FED_URL}/reset-password/${resetToken}?te=${Date.now() + parseInt(process.env.USER_TEMPORARY_TOKEN_EXPIRY)}`; // te is token creation time, used by FED

  user.forgotPasswordToken = hashedResetToken;
  user.forgotPasswordExpiry = new Date(
    Date.now() + parseInt(process.env.USER_TEMPORARY_TOKEN_EXPIRY),
  );
  await user.save({ validateBeforeSave: false });

  // send reset link email
  const { html, text } = ForgotPasswordMail(
    user.name,
    resetURL,
    parseInt(process.env.OTP_EXPIRY_MS / (60 * 1000)),
  );
  await mailSender(email, 'Reset your BaatChat password 🔑', html, text);

  return res
    .status(200)
    .json(new ApiResponse(200, {}, 'Password reset link sent successfully on your email.'));
});

// TODO -need to validate this controller
/**
 * Reset a user's password using a valid password reset token.
 *
 * @route POST /api/v1/auth/reset-password
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
    throw new ApiError(
      400,
      `You have registered using ${user.loginType?.toLowerCase()}. Password change is not available for this account.`,
    );
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

/**
 * Fetch the authenticated user's profile from the current request.
 *
 * @route GET /api/v1/auth/me
 * @param {import("express").Request} req - Express request with the authenticated user attached by auth middleware.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>} Sends the current user with MongoDB metadata normalized out.
 */
export const getCurrentUser = asyncHandler(async (req, res) => {
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        user: sanitizeUser(req.user),
      },
      'Current user fetched successfully',
    ),
  );
});

/**
 * Check whether a username is available for registration.
 *
 * @route GET /api/v1/auth/check-username
 * @param {import("express").Request} req - Express request with username in the query string.
 * @param {import("express").Response} res - Express response.
 * @returns {Promise<void>} Sends the normalized username and availability status.
 */
export const checkUsernameAvailability = asyncHandler(async (req, res) => {
  const username = req.query.username?.trim()?.toLowerCase();

  if (!username) {
    throw new ApiError(400, 'Username is required');
  }

  const usernameExists = await User.exists({ username });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        username,
        isAvailable: !usernameExists,
      },
      usernameExists ? 'Username is not available' : 'Username is available',
    ),
  );
});

// todo add js docs for this controller
export const googleCallBack = asyncHandler(async (req, res) => {
  const { code, credential } = req.body;

  // code - google login auth-code flow
  // credential - google login one tap flow
  if (!(code || credential)) {
    throw new ApiError(400, 'Invalid Credentials');
  }

  /**
   * Cases -
   * 1. user exists (check email) -
   * 1A -> having different login method
   * 1B -> having login method as Google, but google id not matching -> rare but can happen
   * 1B -> having login method as Google, then log in send access token and refresh token
   *
   * 2. User doesn't exist -
   * 2A. since we'll get name, avatar, email from google login, so send them temp token so they can login
   * but can't access any route. mark this user as un-verified (isEmailVerified = false)
   * later using provided temp token, and username and phone, create user and send accessToken dn refreshToken for login
   */

  const client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'postmessage',
  );

  let payload = {};
  try {
    let idToken = credential;
    if (code) {
      const { tokens } = await client.getToken(code);
      idToken = tokens.id_token;
    }

    // verify token using google token verifier
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    payload = ticket.getPayload();

    if (!payload) {
      throw new ApiError(400, 'Invalid Google credentials!');
    }

    if (!payload.email_verified) {
      throw new ApiError(401, 'Google email is not verified');
    }

    if (!payload.sub) {
      throw new ApiError(401, 'Invalid Google account');
    }
  } catch (error) {
    throw new ApiError(400, 'Invalid Google authorization');
  }

  const googleData = {
    googleId: payload.sub,
    email: payload.email,
    name: payload.name,
    avatarUrl: payload.picture,
  };

  // check if user exist
  const user = await User.findOne({ email: googleData.email, isEmailVerified: true }).select(
    '+googleId',
  );
  if (user) {
    // 1. user exist
    if (user.loginType !== UserLoginTypes.GOOGLE) {
      // 1A
      throw new ApiError(400, 'User already exists. Please use a different login method.');
    } else if (user.googleId !== googleData.googleId) {
      throw new ApiError(400, 'Unable to verify your Google account.');
      // 1B
    } else {
      // 1C
      const { accessToken, refreshToken, cookieOptions } = await generateAccessAndRefreshTokens(
        user._id,
      );

      return res
        .status(200)
        .cookie('accessToken', accessToken, cookieOptions)
        .cookie('refreshToken', refreshToken, cookieOptions)
        .json(
          new ApiResponse(
            200,
            {
              user: sanitizeUser(user),
              accessToken,
              refreshToken,
            },
            'User logged in successfully',
          ),
        );
    }

    return res.status(200).json(new ApiResponse(200, {}, 'User created Successfully'));
  } else {
    // case 2 - user doesn't exist, create user but assign temp token, username, phone
    let tempUsername = googleData.email.split('@')[0] + '_' + Date.now();
    tempUsername = tempUsername.slice(0, 30);
    const tempPhone = googleData.googleId.slice(0, 10);
    const signUpGoogleToken = jwt.sign(
      {
        type: 'signup',
        googleId: googleData.googleId,
        email: googleData.email,
      },
      process.env.ACCESS_TOKEN_SECRET,
      {
        expiresIn: process.env.ACCESS_TOKEN_EXPIRY || '15m',
      },
    );

    // upload profile picture to own cloudinary
    const img = await uploadToCloudinaryFromUrl({
      fileUrl: googleData.avatarUrl,
      fileName: `av_google_${googleData.googleId}_${Date.now()}`,
      folder: process.env.AVATAR_FOLDER_NAME,
      quality: 75,
      width: 400,
      height: 400,
      type: 'image',
    });
    const avatarUrl = img.secure_url;

    let createdUser = await User.findOneAndUpdate(
      { email: googleData.email, isEmailVerified: false },
      {
        $set: {
          name: googleData.name,
          email: googleData.email,
          avatarUrl,
          googleId: googleData.googleId,
          username: tempUsername,
          phone: tempPhone,
          loginType: UserLoginTypes.GOOGLE,
          isEmailVerified: false,
        },
      },
      {
        returnDocument: 'after',
        upsert: true,
      },
    );

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          isNewUser: true,
          signUpGoogleToken,
          user: {
            ...googleData,
            username: tempUsername,
            loginType: UserLoginTypes.GOOGLE,
          },
        },
        'User created Successfully',
      ),
    );
  }
});

// todo add js docs for this controller
export const completeSocialSignup = asyncHandler(async (req, res) => {
  const username = req.body?.username?.trim();
  const phone = req.body?.phone?.trim();
  const email = req.body?.email?.trim();
  const authHeader = req.headers.authorization;
  let signUpGoogleToken = '';

  if (authHeader && authHeader.startsWith('Bearer')) {
    signUpGoogleToken = authHeader?.replace('Bearer ', '');
  }

  if (!signUpGoogleToken) {
    throw new ApiError(401, 'Not authorized');
  }

  if (!(username && phone && email)) {
    throw new ApiError(400, 'Username and Phone is required');
  }

  try {
    const decoded = jwt.verify(signUpGoogleToken, process.env.ACCESS_TOKEN_SECRET);

    const userNameExist = await User.findOne({
      username,
      email: { $ne: email },
    });
    if (userNameExist) {
      throw new ApiError(400, 'Username already exists, try other username!');
    }

    const userExist = await User.findOne({
      email,
      isEmailVerified: true,
    });
    if (userExist) {
      throw new ApiError(400, 'User already exists, try to login!');
    }

    let user = await User.findOneAndUpdate(
      { email: decoded.email, isEmailVerified: false },
      {
        $set: {
          username,
          phone,
          isEmailVerified: true,
        },
      },
      {
        returnDocument: 'after',
        upsert: true,
      },
    );

    if (!user) {
      throw new ApiError(404, 'User not found!!');
    }
    const { accessToken, refreshToken, cookieOptions } = await generateAccessAndRefreshTokens(
      user._id,
    );

    return res
      .status(200)
      .cookie('accessToken', accessToken, cookieOptions)
      .cookie('refreshToken', refreshToken, cookieOptions)
      .json(
        new ApiResponse(
          200,
          {
            user: sanitizeUser(user),
            accessToken,
            refreshToken,
          },
          'User signed up successfully',
        ),
      );
  } catch (error) {
    throw new ApiError(401, 'Invalid access token or token expired');
  }
});
