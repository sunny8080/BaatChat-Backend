import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import ApiError from '../utils/ApiError.js';

/**
 * Global API rate limiter.
 *
 * Limits each authenticated user, or IP address when no user is available,
 * to 100 requests per 15-minute window.
 * @desc add api rate limit based on user id, if available, or IP address (req.ip)
 */
export const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per IP/userId per window which is 15m here
  standardHeaders: true, // returns new rate limit headers in response
  legacyHeaders: false,
  keyGenerator: (req, res) => {
    // TODO - currently we are not using global auth middleware so, req.user.id will be always undefined
    // we can use global auth middleware in future, so we can have rate limit based on user id also
    return req.user?.id ? `user:${req.user.id}` : ipKeyGenerator(req.ip);
  },
  handler: (_, _2, next, options) => {
    next(
      new ApiError(
        options.statusCode || 429,
        `You've made too many requests. Please try again after ${options.windowMs / 60000} minutes.`,
      ),
    );
  },
});

/**
 * Login API rate limiter.
 *
 * Limits each authenticated user, or IP address when no user is available,
 * to 5 login attempts per 15-minute window.
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 requests per IP/userId per window which is 15m here
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => {
    return req.user?.id ? `user:${req.user.id}` : ipKeyGenerator(req.ip);
  },
  handler: (_, _2, next, options) => {
    next(
      new ApiError(
        options.statusCode || 429,
        `You've made too many login attempts. Please try again after ${options.windowMs / 60000} minutes.`,
      ),
    );
  },
});

/**
 * Authenticated user API rate limiter.
 *
 * Limits each authenticated user to 50 requests per 15-minute window.
 * This limiter should only be used after authentication middleware has
 * populated `req.user`.
 */
export const userLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => {
    return req.user?.id ? `user:${req.user.id}` : ipKeyGenerator(req.ip);
  },
  handler: (_, _2, next, options) => {
    next(
      new ApiError(
        options.statusCode || 429,
        `You've made too many requests. Please try again after ${options.windowMs / 60000} minutes.`,
      ),
    );
  },
});
