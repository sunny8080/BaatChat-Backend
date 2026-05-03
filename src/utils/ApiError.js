import errorMiddleware from '../middlewares/error.middleware.js';

/**
 * @description Common Error class to throw throw structured API error responses from anywhere
 *  The {@link errorMiddleware} middleware will catch this error at the central place and it will return an appropriate response to the client
 * @extends Error
 */
class ApiError extends Error {

  /**
   * Creates a structured API error.
   *
   * @param {number} statusCode - HTTP status code for the error response.
   * @param {string} [message="Something went wrong, try later!"] - Error message.
   * @param {Array<unknown>} [errors=[]] - Additional validation or processing errors.
   * @param {string} [stack=""] - Optional stack trace override.
   */
  constructor(statusCode, message = "Something went wrong, try later!", errors = [], stack = "") {
    super(message);
    this.statusCode = statusCode;
    this.data = null;
    this.message = message;
    this.success = false;
    this.errors = errors;

    // this.stack = stack if provided, or use default stack trace
    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export default ApiError;
