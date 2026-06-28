import { Router } from 'express';
import {
  getCurrentUserChats,
  getChatDetails,
  createGroup,
  updateGroupDetails,
  deleteChatForCurrentUser,
  leaveGroup,
  addMembersToGroup,
} from '../controllers/chat.controller.js';
import { authenticateUser } from '../middlewares/auth.middleware.js';
import { uploadImage } from '../middlewares/multer.middleware.js';
import { userLimiter } from '../middlewares/limiter.middleware.js';

const router = Router();

router.route('/get-chats').get(authenticateUser, getCurrentUserChats);
router.route('/get-chat-details').post(authenticateUser, userLimiter, getChatDetails);
router.route('/create-group').post(authenticateUser, uploadImage.single('avatar'), createGroup);
router.route('/delete-chat').delete(authenticateUser, deleteChatForCurrentUser);
router.route('/leave-group').patch(authenticateUser, leaveGroup);
router.route('/add-members').patch(authenticateUser, addMembersToGroup);
router
  .route('/update-group-details')
  .patch(authenticateUser, uploadImage.single('avatar'), updateGroupDetails);

export default router;
