import { Request, Response, NextFunction } from 'express';
import { TranslationService } from '../services/translation.service.js';
import { SpeechService } from '../services/speech.service.js';
import createHttpError from 'http-errors';
import multer from 'multer';
import path from 'path';

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['audio/wav', 'audio/mpeg', 'audio/webm', 'audio/ogg'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only audio files are allowed.'));
    }
  },
});

export class TranslationController {
  private translationService: TranslationService;
  private speechService: SpeechService;
  
  constructor() {
    this.translationService = new TranslationService();
    this.speechService = new SpeechService();
  }
  
  // Get supported languages
  getSupportedLanguages = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const languages = this.translationService.getSupportedLanguages();
      
      res.status(200).json({
        success: true,
        data: { languages },
      });
    } catch (error) {
      next(error);
    }
  };
  
  // Detect language
  detectLanguage = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { text } = req.body;
      
      if (!text) {
        throw createHttpError(400, 'Text is required');
      }
      
      const result = await this.translationService.detectLanguage(text);
      
      res.status(200).json({
        success: true,
        data: { detection: result },
      });
    } catch (error) {
      next(error);
    }
  };
  
  // Translate text
  translateText = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { text, targetLanguage, sourceLanguage } = req.body;
      
      if (!text || !targetLanguage) {
        throw createHttpError(400, 'Text and target language are required');
      }
      
      const result = await this.translationService.translateText(
        text,
        targetLanguage,
        sourceLanguage
      );
      
      res.status(200).json({
        success: true,
        data: { translation: result },
      });
    } catch (error) {
      next(error);
    }
  };
  
  // Batch translate
  batchTranslate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { texts, targetLanguage, sourceLanguage } = req.body;
      
      if (!texts || !Array.isArray(texts) || !targetLanguage) {
        throw createHttpError(400, 'Texts array and target language are required');
      }
      
      const results = await this.translationService.batchTranslate(
        texts,
        targetLanguage,
        sourceLanguage
      );
      
      res.status(200).json({
        success: true,
        data: { translations: results },
      });
    } catch (error) {
      next(error);
    }
  };
  
  // Speech to text
  speechToText = [
    upload.single('audio'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.file) {
          throw createHttpError(400, 'Audio file is required');
        }
        
        const { language = 'en-US', audioFormat = 'webm' } = req.body;
        
        const result = await this.speechService.speechToText(
          req.file.buffer,
          language,
          audioFormat
        );
        
        res.status(200).json({
          success: true,
          data: { transcription: result },
        });
      } catch (error) {
        next(error);
      }
    },
  ];
  
  // Text to speech
  textToSpeech = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { text, language = 'en-US', voice, speakingRate = 1.0 } = req.body;
      
      if (!text) {
        throw createHttpError(400, 'Text is required');
      }
      
      const result = await this.speechService.textToSpeech(
        text,
        language,
        voice,
        speakingRate
      );
      
      res.status(200).json({
        success: true,
        data: { synthesis: result },
      });
    } catch (error) {
      next(error);
    }
  };
  
  // Real-time translation pipeline
  realTimeTranslation = [
    upload.single('audio'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.file) {
          throw createHttpError(400, 'Audio file is required');
        }
        
        const { 
          sourceLanguage = 'en-US', 
          targetLanguage = 'es-ES',
          userId 
        } = req.body;
        
        const result = await this.speechService.realTimeTranslationPipeline(
          req.file.buffer,
          sourceLanguage,
          targetLanguage,
          userId
        );
        
        res.status(200).json({
          success: true,
          data: { translation: result },
        });
      } catch (error) {
        next(error);
      }
    },
  ];
  
  // Create translation session
  createSession = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user._id.toString();
      const { participants, sourceLanguage, targetLanguage, callId, chatId } = req.body;
      
      if (!participants || !Array.isArray(participants) || participants.length < 2) {
        throw createHttpError(400, 'At least 2 participants are required');
      }
      
      if (!sourceLanguage || !targetLanguage) {
        throw createHttpError(400, 'Source and target languages are required');
      }
      
      // Ensure current user is included
      const allParticipants = [...new Set([userId, ...participants])];
      
      const session = await this.translationService.createSession(
        allParticipants,
        sourceLanguage,
        targetLanguage,
        callId,
        chatId
      );
      
      res.status(201).json({
        success: true,
        message: 'Translation session created',
        data: { session },
      });
    } catch (error) {
      next(error);
    }
  };
  
  // Get translation session
  getSession = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user._id.toString();
      const { sessionId } = req.params;
      
      const session = await this.translationService.getSession(sessionId, userId);
      
      res.status(200).json({
        success: true,
        data: { session },
      });
    } catch (error) {
      next(error);
    }
  };
  
  // Get user's translation sessions
  getUserSessions = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user._id.toString();
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      
      const result = await this.translationService.getUserSessions(
        userId,
        page,
        limit
      );
      
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
  
  // Add translation segment
  addSegment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sessionId } = req.params;
      const segment = req.body;
      
      const session = await this.translationService.addTranslationSegment(
        sessionId,
        segment
      );
      
      res.status(200).json({
        success: true,
        message: 'Translation segment added',
        data: { session },
      });
    } catch (error) {
      next(error);
    }
  };
  
  // End translation session
  endSession = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user._id.toString();
      const { sessionId } = req.params;
      
      const session = await this.translationService.endSession(sessionId, userId);
      
      res.status(200).json({
        success: true,
        message: 'Translation session ended',
        data: { session },
      });
    } catch (error) {
      next(error);
    }
  };
  
  // Get session statistics
  getSessionStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sessionId } = req.params;
      
      const stats = await this.translationService.getSessionStats(sessionId);
      
      res.status(200).json({
        success: true,
        data: { stats },
      });
    } catch (error) {
      next(error);
    }
  };
}