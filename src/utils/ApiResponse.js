
/**
 * @description Standard API response wrapper class, for error scenarios.
 */
class ApiResponse {

  /**
   * Creates a standardized API response payload, for error scenarios also.
   * 
   * @param {number} [statusCode=200] - HTTP status code for the response.
   * @param {*} data - Response payload.
   * @param {string} [message="Success"] - response message.
   * @param {boolean} [success] - Explicit success flag. Defaults to true for status codes below 400.
   * @param {*} [errors] - Optional error details to include in the response.
   * @param {string} [stack] - Optional stack trace, included only in development.
   * 
   * @returns {ApiResponse} API response instance.
   */
  constructor(statusCode = 200, data, message = "Success", success, errors, stack) {
    this.statusCode = statusCode;
    this.data = data;
    this.message = message;
    this.success = (success instanceof Boolean) ? success : (statusCode < 400);

    // Error scenarios
    if (errors) {
      this.errors = errors;
    }

    // Error stack must be visible for development env
    if (stack && process.env.NODE_ENV === 'development') {
      this.stack = stack;
    }
  }
}

export default ApiResponse;
