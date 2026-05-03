import morgan from "morgan";
import logger from "./winston.logger.js";

// use the http severity
const stream = {
  write: (message) => logger.http(message.trim())
}

// skip logging if not env is not development
const skip = () => {
  return process.env.NODE_ENV != 'development';
}

/**
 * Morgan middleware that forwards HTTP request logs to the Winston HTTP logger.
 *
 * Logs the remote address, method, URL, response status, and response time in
 * development only.
 *
 * @type {import("morgan").Handler}
 */
const morganLogger = morgan(
  ":remote-addr :method :url :status - :response-time ms",
  { stream, skip }
)


export default morganLogger;
