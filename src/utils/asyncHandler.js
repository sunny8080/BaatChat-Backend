/**
 * Wraps an async Express route handler and forwards rejected promises to `next`.
 *
 * @param {import('express').RequestHandler} reqHandler - Express request handler.
 * @returns {import('express').RequestHandler} Error-forwarding request handler.
 */
const asyncHandler = (reqHandler) => {
  return (req, res, next) => {
    Promise.resolve(reqHandler(req, res, next)).catch((err) => next(err));
  }
}

export default asyncHandler;
