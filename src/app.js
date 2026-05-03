import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morganLogger from './logger/morgan.logger.js';
import errorMiddleware from './middlewares/error.middleware.js';
import path from 'path';
import { fileURLToPath } from 'url';
import notFoundMiddleware from './middlewares/notFound.middleware.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || process.env.FED_URL,
    credentials: true
  }
});

// Mount io instance on global, so we can directly use it anywhere
app.set('io', io);

// Global Middlewares
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || process.env.FED_URL,
    credentials: true
  })
);
app.use(cookieParser());
app.use(morganLogger);
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(express.static(path.join(__dirname, 'public')));

// Mount routers

app.get('/', (req, res) => {
  res.send('Hello from BaatChat backend');
});

app.use(notFoundMiddleware);
app.use(errorMiddleware);

export { httpServer };
