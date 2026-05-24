import { Router } from 'express';
import { authenticateUser } from '../middlewares/auth.middleware.js';
import { updateUserDetails, searchUsers, getUserDetails, sendFriendRequest, acceptFriendRequest, fetchReceivedFriendRequest, fetchSentFriendRequest, rejectFriendRequest, cancelFriendRequest, fetchFriends } from '../controllers/user.controller.js';
import { upload, uploadImage } from '../middlewares/multer.middleware.js';

const router = Router();

router.route('/update-user-details').patch(authenticateUser, uploadImage.single('avatar'), updateUserDetails);
router.route('/search-users').post(authenticateUser, searchUsers);
router.route('/get-user-details').post(authenticateUser, getUserDetails);
router.route('/send-friend-request').post(authenticateUser, sendFriendRequest);
router.route('/accept-friend-request').post(authenticateUser, acceptFriendRequest);
router.route('/reject-friend-request').post(authenticateUser, rejectFriendRequest);
router.route('/cancel-friend-request').post(authenticateUser, cancelFriendRequest);
router.route('/fetch-received-friend-requests').get(authenticateUser, fetchReceivedFriendRequest);
router.route('/fetch-sent-friend-requests').get(authenticateUser, fetchSentFriendRequest);
router.route('/fetch-friends').get(authenticateUser, fetchFriends);

export default router;
