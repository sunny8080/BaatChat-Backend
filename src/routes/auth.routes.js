import { Router } from 'express';
import { loginUser, registerUser, verifyEmail } from '../controllers/auth.controller.js';

const router = Router();

router.route('/register-user').post(registerUser);
router.route('/verify-email').post(verifyEmail);
router.route('/login').post(loginUser);

export default router;
