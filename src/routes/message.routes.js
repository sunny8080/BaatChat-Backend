import { Router } from 'express';
import { sendAudioMessage, sendFile } from '../controllers/message.controller.js';
import { authenticateUser } from '../middlewares/auth.middleware.js';
import { uploadAudio, uploadFile } from '../middlewares/multer.middleware.js';

const router = Router();

router
  .route('/send-audio-message')
  .post(authenticateUser, uploadAudio.single('audioBlob'), sendAudioMessage);
router.route('/send-file').post(authenticateUser, uploadFile.single('fileBlob'), sendFile);

export default router;
