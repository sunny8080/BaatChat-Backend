import dotenv from 'dotenv';
import { httpServer } from './app.js';
import connectDB from './config/connectDB.js';
import logger from './logger/winston.logger.js';

dotenv.config({
  path: './.env'
});

const startServer = async () => {
  try {
    await connectDB();

    const PORT = process.env.PORT || 5000;
    httpServer.listen(PORT, () => {
      logger.info(`⚙️ Server is running at : http://localhost:${PORT}`);
    })
  } catch (error) {
    logger.error("Failed to start server : ", error);
    process.exit();
  }
}

const shutdown = () => {
  logger.info("Shutting down BaatChat backend");
  server.close(() => process.exit(0));
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

startServer();