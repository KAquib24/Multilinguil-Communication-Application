import { Router } from 'express';
import { ChatController } from '../controllers/chat.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { apiLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);
router.use(apiLimiter);

// Chat management
router.get('/', ChatController.getUserChats);
router.get('/user/:targetUserId', ChatController.getOrCreateChat);
router.get('/:chatId', ChatController.getChat);
router.post('/group', ChatController.createGroup);

// Messages
router.get('/:chatId/messages', ChatController.getMessages);
router.post('/:chatId/messages', ChatController.sendMessage);
router.post('/:chatId/messages/read', ChatController.markAsRead);
router.get('/:chatId/search', ChatController.searchMessages);

// Message actions
router.delete('/messages/:messageId', ChatController.deleteMessage);
router.post('/messages/:messageId/reactions', ChatController.addReaction);
router.delete('/messages/:messageId/reactions', ChatController.removeReaction);

// Typing
router.post('/:chatId/typing', ChatController.updateTyping);

// Stats
router.get('/:chatId/stats', ChatController.getChatStats);

export default router;