import { Router } from 'express';
import { TranslationController } from '../controllers/translation.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();
const translationController = new TranslationController();

// Apply authentication to all routes except public endpoints
router.use(authenticate);

// Public endpoints (could be made public if needed)
router.get('/languages', translationController.getSupportedLanguages);

// Translation endpoints
router.post('/detect', translationController.detectLanguage);
router.post('/translate', translationController.translateText);
router.post('/batch', translationController.batchTranslate);

// Speech endpoints
router.post('/speech-to-text', ...translationController.speechToText);
router.post('/text-to-speech', translationController.textToSpeech);
router.post('/real-time', ...translationController.realTimeTranslation);

// Translation sessions
router.post('/sessions', translationController.createSession);
router.get('/sessions', translationController.getUserSessions);
router.get('/sessions/:sessionId', translationController.getSession);
router.post('/sessions/:sessionId/segments', translationController.addSegment);
router.post('/sessions/:sessionId/end', translationController.endSession);
router.get('/sessions/:sessionId/stats', translationController.getSessionStats);

export default router;