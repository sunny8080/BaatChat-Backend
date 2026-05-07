import jwt from 'jsonwebtoken';
import User from '../models/user.model.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

/**
 * Express middleware that authenticates a user with a JWT access token.
 *
 * Reads the token from the `accessToken` cookie or `Authorization: Bearer <token>`
 * header, verifies it, loads the matching user, and attaches it to `req.user`.
 *
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @param {import('express').NextFunction} next - Express next middleware callback.
 * @throws {ApiError} Throws 401 when the token is missing, invalid, expired, or user is not found.
 */
export const authenticateUser = asyncHandler(async (req, res, next) => {
  const token = req.cookies?.accessToken || req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    throw new ApiError(401, 'Unauthorized request');
  }

  try {
    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    const user = await User.findById(decodedToken?._id);
    if (!user) {
      throw new ApiError(401, 'Invalid access token');
    }
    req.user = user;
    next();
  } catch (error) {
    // if accessToken is expired and client has refreshToken in their cookie
    // then client must make a request to '/api/v1/auth/refresh-token' to get
    // new  accessToken and refreshToken without logging out the user
    throw new ApiError(401, 'Invalid access token');
  }
});
