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
import { initializeSocketIO } from './socket/socket.js';

export const __filename = fileURLToPath(import.meta.url);
export const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || process.env.FED_URL,
    credentials: true,
  },
});

// Mount io instance on global, so we can directly use it anywhere
app.set('io', io);
initializeSocketIO(io);

// Global Middlewares
app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(morganLogger);
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Mount routers
import authRouter from './routes/auth.routes.js';
import userRouter from './routes/user.routes.js';
import { generateUsers } from './seeds/user.seeds.js';

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/users', userRouter);

// Mount Seeds Routes
app.get('/api/v1/seeds/users', generateUsers);

app.get('/', (req, res) => {
  res.send('Hello from BaatChat backend');
});

app.use(notFoundMiddleware);
app.use(errorMiddleware);

export { httpServer };
