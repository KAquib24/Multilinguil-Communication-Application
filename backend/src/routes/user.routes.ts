import { Router } from 'express';
import { UserController } from '../controllers/user.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// User routes
router.get('/search', UserController.searchUsers);
router.get('/all', UserController.getAllUsers);
router.get('/contacts', UserController.getContacts);
router.get('/:userId', UserController.getUserById);

// Contact management
router.post('/contacts/add', UserController.addContact);
router.delete('/contacts/remove/:targetUserId', UserController.removeContact);

export default router;