import { Router } from 'express';
import { changePassword, forgotPassword, getCurrentUser, loginUser, logoutUser, refreshAccessToken, registerUser, resendEmailVerificationOTP, resetPassword, verifyEmail } from '../controllers/auth.controller.js';
import { authenticateUser } from '../middlewares/auth.middleware.js';

const router = Router();

router.route('/register-user').post(registerUser);
router.route('/verify-email').post(verifyEmail);
router.route('/login').post(loginUser);
router.route('/logout').post(authenticateUser, logoutUser);
router.route('/refresh-token').post(refreshAccessToken);
router.route('/resend-email-verification-otp').post(resendEmailVerificationOTP);

router.route('/forgot-password').post(forgotPassword);
router.route('/reset-password').post(resetPassword);
router.route('/change-password').post(authenticateUser, changePassword);

router.route('/me').get(authenticateUser, getCurrentUser);

export default router;
