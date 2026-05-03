import ApiResponse from "../utils/ApiResponse.js";

/**
 * Handles unmatched Express routes by returning a standardized 404 response.
 *
 * @param {import("express").Request} req - Express request object.
 * @param {import("express").Response} res - Express response object.
 * @returns {import("express").Response} JSON response describing the missing route.
 */
const notFoundMiddleware = (req, res) => {
  const errRes = new ApiResponse(
    404,
    null,
    `Route not found: ${req.method} ${req.originalUrl}`
  );
  return res.status(errRes.statusCode).json(errRes);
}

export default notFoundMiddleware;
