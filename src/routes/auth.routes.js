import { Router } from 'express';
import { registerUser, verifyEmail } from '../controllers/auth.controller.js';

const router = Router();

router.route('/register-user').post(registerUser);
router.route('/verify-email').post(verifyEmail);

export default router;
