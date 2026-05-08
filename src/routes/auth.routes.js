import { Router } from 'express';
import { changePassword, forgotPassword, getCurrentUser, loginUser, logoutUser, getAccessToken, registerUser, resendVerificationOTP, resetPassword, verifyEmail } from '../controllers/auth.controller.js';
import { authenticateUser } from '../middlewares/auth.middleware.js';

const router = Router();

router.route('/register-user').post(registerUser);
router.route('/verify-email').post(verifyEmail);
router.route('/login').post(loginUser);
router.route('/logout').get(authenticateUser, logoutUser);
router.route('/get-access-token').get(getAccessToken);
router.route('/resend-verification-otp').post(resendVerificationOTP);

router.route('/forgot-password').post(forgotPassword);
router.route('/reset-password').post(resetPassword);
router.route('/change-password').post(authenticateUser, changePassword);

router.route('/me').get(authenticateUser, getCurrentUser);

export default router;
