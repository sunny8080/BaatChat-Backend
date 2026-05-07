import { Router } from 'express';
import { authenticateUser } from '../middlewares/auth.middleware.js';
import { updateUserDetails } from '../controllers/user.controller.js';
import { upload, uploadImage } from '../middlewares/multer.middleware.js';

const router = Router();

router.route('/update-user-details').patch(authenticateUser, uploadImage.single('avatar'), updateUserDetails);

export default router;
