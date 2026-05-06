import { UserLoginTypes } from '../constant.js';
import User from '../models/user.model.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import OTPMail from '../mails/OTPMail.js';
import { mailSender, generateOTP, hashOTP, generateAccessAndRefreshTokens } from '../utils/utils.js';

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
