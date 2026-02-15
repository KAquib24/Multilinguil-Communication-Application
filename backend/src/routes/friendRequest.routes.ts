import { Router } from 'express';
import { FriendRequestController } from '../controllers/friendRequest.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// Friend request management
router.post('/send', FriendRequestController.sendRequest);
router.post('/:requestId/accept', FriendRequestController.acceptRequest);
router.post('/:requestId/reject', FriendRequestController.rejectRequest);
router.delete('/:requestId/cancel', FriendRequestController.cancelRequest);

// Get requests
router.get('/sent', FriendRequestController.getSentRequests);
router.get('/received', FriendRequestController.getReceivedRequests);

// Friendship status
router.get('/status/:targetUserId', FriendRequestController.getFriendshipStatus);

// Remove friend
router.delete('/friend/:friendId', FriendRequestController.removeFriend);

export default router;