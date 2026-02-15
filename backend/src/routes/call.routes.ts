import { Router } from 'express';
import { CallController } from '../controllers/call.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// Call management
router.post('/initiate', CallController.initiateCall);
router.get('/active', CallController.getActiveCalls);
router.get('/history', CallController.getCallHistory);
router.get('/ice-servers', CallController.getIceServers);

// Call actions
router.get('/:callId', CallController.getCall);
router.post('/:callId/answer', CallController.answerCall);
router.post('/:callId/reject', CallController.rejectCall);
router.post('/:callId/end', CallController.endCall);
router.post('/:callId/join', CallController.joinCall);
router.post('/:callId/leave', CallController.leaveCall);
router.patch('/:callId/metadata', CallController.updateCallMetadata);
router.get('/:callId/stats', CallController.getCallStats);

export default router;