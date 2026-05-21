
/**
 * Error type used to send structured error details through socket responses.
 *
 * @extends Error
 */
class SocketError extends Error {
  /**
   * Creates an error payload for socket responses.
   *
   * @param {string} [message='Something went wrong, try later!'] - Error message sent to the client.
   * @param {*} [data=null] - Optional additional error details.
   * @param {string} [stack=''] - Optional stack trace to preserve.
   */
  constructor(message = 'Something went wrong, try later!', data = null, stack = '') {
    super(message);
    this.data = data;
    this.message = message;

    // this.stack = stack if provided, or use default stack trace
    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export default SocketError;
