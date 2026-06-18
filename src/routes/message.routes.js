import { Router } from 'express';
import { sendAudioMessage } from '../controllers/message.controller.js';
import { authenticateUser } from '../middlewares/auth.middleware.js';
import { uploadAudio } from '../middlewares/multer.middleware.js';

const router = Router();

router
  .route('/send-audio-message')
  .post(authenticateUser, uploadAudio.single('audioBlob'), sendAudioMessage);

export default router;
