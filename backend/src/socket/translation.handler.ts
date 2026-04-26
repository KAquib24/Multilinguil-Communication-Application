// backend/src/socket/translation.handler.ts
import { Server, Socket } from 'socket.io';
import { LiveTranslationService } from '../services/liveTranslation.service.js';
import Call from '../models/Call.js';

// Extend global type to include io
declare global {
  var io: Server | undefined;
}

// Set up emission callbacks
LiveTranslationService.emitTranslationResult = (callId, userId, result) => {
  const io = global.io;
  if (!io) {
    console.error('❌ Socket.io instance not found in global scope');
    return;
  }
  
  io.to(`call:${callId}`).emit('translation:result', {
    speakerId: userId,
    ...result
  });
  
  console.log(`📤 Translation result emitted for call ${callId} from user ${userId}`);
};

LiveTranslationService.emitAudioResult = (callId, userId, audioBuffer) => {
  const io = global.io;
  if (!io) {
    console.error('❌ Socket.io instance not found in global scope');
    return;
  }
  
  const audioBase64 = audioBuffer.toString('base64');
  
  io.to(`call:${callId}`).emit('translation:audio', {
    speakerId: userId,
    audio: audioBase64,
    timestamp: new Date()
  });
  
  console.log(`📤 Audio translation emitted for call ${callId} from user ${userId}, size: ${audioBuffer.length} bytes`);
};

export const setupTranslationHandlers = (io: Server, socket: Socket) => {
  const userId = socket.data.userId as string;
  
  console.log(`🔊 Setting up translation handlers for user ${userId}, socket ID: ${socket.id}`);

  /**
   * Start translation for a call with auto-detection support
   */
  socket.on('translation:start', async (data) => {
    try {
      const { callId, targetLanguage, sourceLanguage } = data;
      
      console.log(`🔤 Translation start requested:`, {
        userId,
        callId,
        targetLanguage,
        sourceLanguage,
        timestamp: new Date().toISOString()
      });
      
      if (!userId) {
        socket.emit('translation:error', { message: 'User not authenticated' });
        return;
      }
      
      if (!callId) {
        socket.emit('translation:error', { message: 'Call ID is required' });
        return;
      }
      
      if (!targetLanguage) {
        socket.emit('translation:error', { message: 'Target language is required' });
        return;
      }
      
      // Verify user is in the call
      const call = await Call.findOne({ 
        callId,
        'participants.userId': userId 
      });
      
      if (!call) {
        console.error(`User ${userId} not in call ${callId}`);
        socket.emit('translation:error', { message: 'Not a participant in this call' });
        return;
      }
      
      // If sourceLanguage is 'auto' or not provided, use undefined for auto-detection
      const effectiveSourceLanguage = (sourceLanguage === 'auto' || !sourceLanguage) 
        ? undefined 
        : sourceLanguage;
      
      try {
        LiveTranslationService.startSession(
          callId,
          userId,
          targetLanguage,
          effectiveSourceLanguage
        );
        
        console.log(`✅ Translation session started for user ${userId} in call ${callId}`);
        
        socket.emit('translation:started', {
          callId,
          targetLanguage,
          sourceLanguage: effectiveSourceLanguage || 'auto',
          message: 'Translation enabled with auto-detection',
          timestamp: new Date().toISOString()
        });
        
        socket.to(`call:${callId}`).emit('translation:user-enabled', {
          userId,
          targetLanguage,
          sourceLanguage: effectiveSourceLanguage || 'auto',
          timestamp: new Date().toISOString()
        });
        
      } catch (serviceError: any) {
        console.error('Translation service error:', serviceError);
        socket.emit('translation:error', { 
          message: serviceError.message || 'Translation service unavailable',
          details: serviceError.toString()
        });
      }
      
    } catch (error: any) {
      console.error('Translation start error:', error);
      socket.emit('translation:error', { 
        message: error.message || 'Failed to start translation' 
      });
    }
  });
  
  /**
   * Receive audio chunk for translation
   */
  socket.on('translation:audio', async (data) => {
    try {
      const { callId, audioChunk } = data;
      
      if (!userId) {
        console.error('❌ No userId in socket data');
        return;
      }
      
      if (!callId) {
        console.error('❌ No callId in audio chunk data');
        return;
      }
      
      if (!audioChunk) {
        console.error('❌ No audioChunk in data');
        return;
      }
      
      // Convert base64 back to buffer if needed
      const audioBuffer = typeof audioChunk === 'string'
        ? Buffer.from(audioChunk, 'base64')
        : audioChunk;
      
      let processed = false;
      for (let i = 0; i < 3; i++) {
        processed = LiveTranslationService.processAudioChunk(callId, userId, audioBuffer);
        if (processed) break;
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      if (!processed) {
        console.log(`⚠️ No active session for user ${userId} in call ${callId}, auto-starting...`);
        try {
          LiveTranslationService.startSession(callId, userId, 'en', undefined);
          await new Promise(resolve => setTimeout(resolve, 500));
          LiveTranslationService.processAudioChunk(callId, userId, audioBuffer);
          
          socket.emit('translation:started', {
            callId,
            targetLanguage: 'en',
            sourceLanguage: 'auto',
            message: 'Translation auto-started',
            timestamp: new Date().toISOString()
          });
        } catch (startError: any) {
          console.error('❌ Auto-start failed:', startError);
        }
      }
      
    } catch (error: any) {
      console.error('❌ Audio chunk processing error:', error);
    }
  });
  
  /**
   * Stop translation
   */
  socket.on('translation:stop', (data) => {
    try {
      const { callId } = data;
      
      if (!userId || !callId) {
        console.error('❌ Missing userId or callId for translation:stop');
        return;
      }
      
      console.log(`🛑 Stopping translation for user ${userId} in call ${callId}`);
      
      LiveTranslationService.stopSession(callId, userId);
      
      socket.emit('translation:stopped', {
        callId,
        message: 'Translation disabled',
        timestamp: new Date().toISOString()
      });
      
      socket.to(`call:${callId}`).emit('translation:user-disabled', {
        userId,
        timestamp: new Date().toISOString()
      });
      
    } catch (error: any) {
      console.error('Translation stop error:', error);
      socket.emit('translation:error', { 
        message: error.message || 'Failed to stop translation' 
      });
    }
  });
  
  /**
   * Change target language during call
   */
  socket.on('translation:change-language', async (data) => {
    try {
      const { callId, targetLanguage } = data;
      
      if (!userId || !callId) {
        console.error('❌ Missing userId or callId for translation:change-language');
        return;
      }
      
      if (!targetLanguage) {
        console.error('❌ Missing targetLanguage');
        return;
      }
      
      console.log(`🔄 Changing language for user ${userId} in call ${callId} to ${targetLanguage}`);
      
      LiveTranslationService.stopSession(callId, userId);
      await new Promise(resolve => setTimeout(resolve, 100));
      LiveTranslationService.startSession(callId, userId, targetLanguage, undefined);
      
      socket.emit('translation:language-changed', {
        callId,
        targetLanguage,
        message: `Language changed to ${targetLanguage}`,
        timestamp: new Date().toISOString()
      });
      
      socket.to(`call:${callId}`).emit('translation:user-language-changed', {
        userId,
        targetLanguage,
        timestamp: new Date().toISOString()
      });
      
    } catch (error: any) {
      console.error('Language change error:', error);
      socket.emit('translation:error', { 
        message: error.message || 'Failed to change language' 
      });
    }
  });
  
  /**
   * Get available languages (Complete list with Indian languages)
   */
  socket.on('translation:get-languages', () => {
    const languages = [
      // Indian Languages
      { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
      { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
      { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
      { code: 'mr', name: 'Marathi', nativeName: 'मराठी' },
      { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
      { code: 'ur', name: 'Urdu', nativeName: 'اردو' },
      { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
      { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
      { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം' },
      { code: 'or', name: 'Odia', nativeName: 'ଓଡ଼ିଆ' },
      { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' },
      { code: 'as', name: 'Assamese', nativeName: 'অসমীয়া' },
      { code: 'mai', name: 'Maithili', nativeName: 'मैथिली' },
      { code: 'sat', name: 'Santali', nativeName: 'ᱥᱟᱱᱛᱟᱲᱤ' },
      { code: 'ks', name: 'Kashmiri', nativeName: 'कॉशुर' },
      { code: 'ne', name: 'Nepali', nativeName: 'नेपाली' },
      { code: 'sd', name: 'Sindhi', nativeName: 'سنڌي' },
      { code: 'kok', name: 'Konkani', nativeName: 'कोंकणी' },
      { code: 'doi', name: 'Dogri', nativeName: 'डोगरी' },
      { code: 'mni', name: 'Manipuri', nativeName: 'মৈতৈলোন্' },
      
      // International Languages
      { code: 'en', name: 'English', nativeName: 'English' },
      { code: 'es', name: 'Spanish', nativeName: 'Español' },
      { code: 'fr', name: 'French', nativeName: 'Français' },
      { code: 'de', name: 'German', nativeName: 'Deutsch' },
      { code: 'zh', name: 'Chinese', nativeName: '中文' },
      { code: 'ja', name: 'Japanese', nativeName: '日本語' },
      { code: 'ko', name: 'Korean', nativeName: '한국어' },
      { code: 'ru', name: 'Russian', nativeName: 'Русский' },
      { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
      { code: 'it', name: 'Italian', nativeName: 'Italiano' },
      { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
      { code: 'nl', name: 'Dutch', nativeName: 'Nederlands' },
      { code: 'pl', name: 'Polish', nativeName: 'Polski' },
      { code: 'tr', name: 'Turkish', nativeName: 'Türkçe' },
      { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
      { code: 'th', name: 'Thai', nativeName: 'ไทย' },
      { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia' },
      { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu' },
      { code: 'fa', name: 'Persian', nativeName: 'فارسی' },
      { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili' },
      { code: 'el', name: 'Greek', nativeName: 'Ελληνικά' },
      { code: 'cs', name: 'Czech', nativeName: 'Čeština' },
      { code: 'sv', name: 'Swedish', nativeName: 'Svenska' },
      { code: 'da', name: 'Danish', nativeName: 'Dansk' },
      { code: 'no', name: 'Norwegian', nativeName: 'Norsk' },
      { code: 'fi', name: 'Finnish', nativeName: 'Suomi' },
      { code: 'ro', name: 'Romanian', nativeName: 'Română' },
      { code: 'hu', name: 'Hungarian', nativeName: 'Magyar' },
      { code: 'uk', name: 'Ukrainian', nativeName: 'Українська' },
    ];
    socket.emit('translation:languages', { languages });
  });
  
  socket.on('translation:debug', () => {
    const info = LiveTranslationService.getSessionInfo();
    socket.emit('translation:debug-info', info);
  });
  
  socket.on('disconnect', () => {
    if (userId) {
      console.log(`🧹 User ${userId} disconnected, cleaning up translation sessions`);
    }
  });
  
  console.log(`✅ Translation handlers setup for user ${userId}`);
};