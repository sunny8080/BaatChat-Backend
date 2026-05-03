import mongoose from "mongoose";
import logger from '../logger/winston.logger.js';

/** 
 * MongoDB instance.
 * @type {mongoose.Mongoose | undefined}
 */
export let dbInstance = undefined;

/**
 * Connects to MongoDB using the configured connection URI.
 *
 * Stores the active mongoose connection in {@link dbInstance}. If the
 * connection fails, logs the error and exits the process.
 *
 * @async
 * @returns {Promise<void>}
 */
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    dbInstance = conn;
    logger.info("☘️ MongoDB Connected !");
  } catch (error) {
    logger.error("MongoDB connection error : ", error);
    process.exit(1);
  }
}

export default connectDB;
