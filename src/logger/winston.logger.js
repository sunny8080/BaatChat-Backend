import winston from 'winston';

/**
 * set the current severity based on the current NODE_ENV
 * show all the log levels if the server is running in development mode
 * o/w it it's running on production, show only warn and error
*/
const level = process.env.NODE_ENV === 'development' ? 'debug' : 'warn';

/**
 * set severity levels for logs
 */
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// TODO - check different logger format in Private FED 
/**
 * Customize log format -
 * logs should follow preferred time format
 * logs must be colored
 * define message format
 */
const format = winston.format.combine(
  winston.format.timestamp({ format: 'DD MM, YYYY - HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => `[${info.timestamp}] ${info.level}: ${info.message}`)
);

/**
 * Define which transports the logger must use to print out messages
 * also allow console print messages
 */
const transports = [
  new winston.transports.Console(),
  new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
  new winston.transports.File({ filename: 'logs/info.log', level: 'info' }),
  new winston.transports.File({ filename: 'logs/http.log', level: 'http' }),
];



/**
 * Define different colors for each severity level 
 */
const colors = {
  error: "red",
  warn: "yellow",
  info: "blue",
  http: "magenta",
  debug: "white",
};

// link the colors with to the severity levels.
winston.addColors(colors);

/**
 * Application winston logger configured with custom severity levels, formatting,
 * colors, and console/file transports.
 *
 * @type {winston.Logger}
 */
const logger = winston.createLogger({
  level,
  levels,
  format,
  transports
});

export default logger;
