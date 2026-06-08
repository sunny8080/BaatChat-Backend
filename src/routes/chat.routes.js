import { Router } from 'express';
import { getCurrentUserChats, getChatDetails, createGroup } from '../controllers/chat.controller.js';
import { authenticateUser } from '../middlewares/auth.middleware.js';
import { uploadImage } from '../middlewares/multer.middleware.js';

const router = Router();

router.route('/get-chats').get(authenticateUser, getCurrentUserChats);
router.route('/get-chat-details').post(authenticateUser, getChatDetails);
router.route('/create-group').post(authenticateUser, uploadImage.single('avatar'), createGroup);

export default router;
