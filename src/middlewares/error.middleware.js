import mongoose from "mongoose";
import ApiError from "../utils/ApiError.js";
import logger from "../logger/winston.logger.js";
import ApiResponse from "../utils/ApiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";

/**
 * Express error-handling middleware.
 * 
 * @description Express error-handling middleware.This middleware is responsible to catch the errors from any request handler wrapped inside the {@link asyncHandler}. 
 * It'll also log the final error message, and sends a consistent ApiResponse JSON payload to the client.
 *
 * @param {Error|ApiError} err - Error passed by Express or thrown by a route/controller.
 * @param {import("express").Request} req - Express request object.
 * @param {import("express").Response} res - Express response object.
 * @param {import("express").NextFunction} next - Express next callback.
 * @returns {import("express").Response} JSON error response.
 */
const errorMiddleware = (err, req, res, next) => {
  let apiError = undefined;

  // check if the error is an instance of an ApiError class 
  if (!(err instanceof ApiError)) {
    // create a new ApiError instance
    const statusCode = err.statusCode || (err instanceof mongoose.Error ? 400 : 500);
    const msg = err.message || 'Something went wrong!';
    const errors = err?.errors || [];
    apiError = new ApiError(statusCode, msg, errors, err.stack);
  } else {
    apiError = err;
  }

  // TODO - remove local files if uploaded

  // log error msg and send error response
  logger.error(apiError.message);
  return res.status(apiError.statusCode).json(new ApiResponse(...apiError));
}

export default errorMiddleware;
