import { Router } from 'express';
import { getCurrentUserChats, getChatDetails } from '../controllers/chat.controller.js';
import { authenticateUser } from '../middlewares/auth.middleware.js';

const router = Router();

router.route('/get-chats').get(authenticateUser, getCurrentUserChats);
router.route('/get-chat-details').post(authenticateUser, getChatDetails);

export default router;
