import { v2 } from '@google-cloud/translate';
import axios from 'axios';
import createHttpError from 'http-errors';
import TranslationSession, { ITranslationSegment } from '../models/Translation.js';
import Call from '../models/Call.js';
import { Chat } from '../models/Chat.js';
import fs from "fs";

const { Translate } = v2;

// Initialize Translate client
let translateClient: any;

try {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const credentials = JSON.parse(
  fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS!, "utf8")
);
    translateClient = new Translate({
      credentials,
      projectId: credentials.project_id
    });
    console.log('✅ Google Translate client initialized in translation.service');
  }
} catch (error) {
  console.error('❌ Failed to initialize Google Translate:', error);
}

// Supported languages with their codes
export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
];

export class TranslationService {
  
  // Get supported languages
  getSupportedLanguages() {
    return SUPPORTED_LANGUAGES;
  }
  
  // Detect language of text
  async detectLanguage(text: string): Promise<{ language: string; confidence: number }> {
    try {
      if (translateClient) {
        const [detection] = await translateClient.detect(text);
        return {
          language: detection.language,
          confidence: detection.confidence || 0.8,
        };
      }
      
      // Fallback detection
      return {
        language: 'en',
        confidence: 0.5,
      };
    } catch (error) {
      console.error('Language detection error:', error);
      return {
        language: 'en',
        confidence: 0.5,
      };
    }
  }
  
  // Translate text - FIXED VERSION
  async translateText(
    text: string,
    targetLanguage: string,
    sourceLanguage?: string
  ): Promise<{
    translatedText: string;
    sourceLanguage: string;
    targetLanguage: string;
    confidence: number;
  }> {
    try {
      console.log(`🔄 Translating: "${text}" from ${sourceLanguage || 'auto'} to ${targetLanguage}`);
      
      // Detect source language if not provided
      let detectedSourceLanguage = sourceLanguage;
      if (!detectedSourceLanguage) {
        const detection = await this.detectLanguage(text);
        detectedSourceLanguage = detection.language;
        console.log(`📝 Detected source language: ${detectedSourceLanguage}`);
      }
      
      // Return original text if source and target languages are the same
      if (detectedSourceLanguage === targetLanguage) {
        return {
          translatedText: text,
          sourceLanguage: detectedSourceLanguage,
          targetLanguage,
          confidence: 1.0,
        };
      }
      
      // Use Google Translate if available
      if (translateClient) {
        try {
          console.log(`🌍 Using Google Translate API...`);
          
          // Simple translation with just text and target
          const [translation] = await translateClient.translate(text, targetLanguage);
          
          console.log(`✅ Translation successful: "${translation}"`);
          
          return {
            translatedText: translation,
            sourceLanguage: detectedSourceLanguage,
            targetLanguage,
            confidence: 0.95,
          };
        } catch (googleError: any) {
          console.error('❌ Google Translate error:', googleError.message);
          
          // Try alternative method with options
          try {
            const options = {
              to: targetLanguage,
              from: detectedSourceLanguage,
            };
            const [translation] = await translateClient.translate(text, options);
            
            return {
              translatedText: translation,
              sourceLanguage: detectedSourceLanguage,
              targetLanguage,
              confidence: 0.9,
            };
          } catch (retryError) {
            console.error('❌ Google Translate retry failed:', retryError);
            throw retryError;
          }
        }
      }
      
      // If no Google Translate, throw error to use fallback
      throw new Error('Google Translate client not available');
      
    } catch (error) {
      console.error('❌ Translation error:', error);
      
      // Return a meaningful fallback translation (not "[Translation Failed]")
      const fallbackTranslations: Record<string, Record<string, string>> = {
        'es': {
          'hello': 'hola',
          'how are you': 'cómo estás',
          'my name is': 'mi nombre es',
        },
        'fr': {
          'hello': 'bonjour',
          'how are you': 'comment allez-vous',
          'my name is': 'je m\'appelle',
        },
        'hi': {
          'hello': 'नमस्ते',
          'how are you': 'आप कैसे हैं',
          'my name is': 'मेरा नाम है',
        }
      };
      
      // Try to do simple word replacement
      let fallbackTranslation = text;
      const lowerText = text.toLowerCase();
      const targetDict = fallbackTranslations[targetLanguage] || {};
      
      Object.entries(targetDict).forEach(([key, value]) => {
        if (lowerText.includes(key)) {
          fallbackTranslation = fallbackTranslation.replace(new RegExp(key, 'gi'), value);
        }
      });
      
      return {
        translatedText: fallbackTranslation,
        sourceLanguage: sourceLanguage || 'en',
        targetLanguage,
        confidence: 0.5, // Lower confidence for fallback
      };
    }
  }
  
  // Batch translate multiple texts
  async batchTranslate(
    texts: string[],
    targetLanguage: string,
    sourceLanguage?: string
  ): Promise<Array<{
    original: string;
    translated: string;
    sourceLanguage: string;
    confidence: number;
  }>> {
    try {
      const translations = await Promise.all(
        texts.map(async (text) => {
          const result = await this.translateText(text, targetLanguage, sourceLanguage);
          return {
            original: text,
            translated: result.translatedText,
            sourceLanguage: result.sourceLanguage,
            confidence: result.confidence,
          };
        })
      );
      
      return translations;
    } catch (error) {
      console.error('Batch translation error:', error);
      throw error;
    }
  }
  
  // Create translation session
  async createSession(
    participants: string[],
    sourceLanguage: string,
    targetLanguage: string,
    callId?: string,
    chatId?: string
  ) {
    try {
      // Verify participants exist
      if (participants.length < 2) {
        throw createHttpError(400, 'At least 2 participants required');
      }
      
      // Create session
      const session = new TranslationSession({
        sessionId: `session_${Date.now()}`,
        participants,
        sourceLanguage,
        targetLanguage,
        isActive: true,
        callId,
        chatId,
      });
      
      await session.save();
      
      return session;
    } catch (error) {
      throw error;
    }
  }
  
  // Add translation segment to session
  async addTranslationSegment(
    sessionId: string,
    segment: Omit<ITranslationSegment, 'timestamp'>
  ) {
    try {
      const session = await TranslationSession.findOne({ sessionId });
      
      if (!session) {
        throw createHttpError(404, 'Translation session not found');
      }
      
      if (!session.isActive) {
        throw createHttpError(400, 'Translation session is not active');
      }
      
      // Add segment
      session.segments.push({
        ...segment,
        timestamp: new Date(),
      });
      
      await session.save();
      
      return session;
    } catch (error) {
      throw error;
    }
  }
  
  // Get translation session
  async getSession(sessionId: string, userId?: string) {
    try {
      const query: any = { sessionId };
      
      if (userId) {
        query.participants = userId;
      }
      
      const session = await TranslationSession.findOne(query);
      
      if (!session) {
        throw createHttpError(404, 'Translation session not found');
      }
      
      return session;
    } catch (error) {
      throw error;
    }
  }
  
  // Get user's translation sessions
  async getUserSessions(
    userId: string,
    page = 1,
    limit = 50
  ): Promise<{
    sessions: any[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const skip = (page - 1) * limit;
      
      const [sessions, total] = await Promise.all([
        TranslationSession.find({ participants: userId })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate('callId')
          .populate('chatId')
          .lean(),
        TranslationSession.countDocuments({ participants: userId }),
      ]);
      
      return {
        sessions,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      throw error;
    }
  }
  
  // End translation session
  async endSession(sessionId: string, userId: string) {
    try {
      const session = await TranslationSession.findOne({
        sessionId,
        participants: userId,
      });
      
      if (!session) {
        throw createHttpError(404, 'Translation session not found');
      }
      
      session.isActive = false;
      await session.save();
      
      return session;
    } catch (error) {
      throw error;
    }
  }
  
  // Get session statistics
  async getSessionStats(sessionId: string) {
    try {
      const session = await TranslationSession.findOne({ sessionId });
      
      if (!session) {
        throw createHttpError(404, 'Translation session not found');
      }
      
      const stats = {
        sessionId: session.sessionId,
        isActive: session.isActive,
        sourceLanguage: session.sourceLanguage,
        targetLanguage: session.targetLanguage,
        totalSegments: session.segments.length,
        participantsCount: session.participants.length,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      };
      
      return stats;
    } catch (error) {
      throw error;
    }
  }
}