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
  
  // Send to all participants EXCEPT the speaker
  io.to(`call:${callId}`).emit('translation:result', {
    speakerId: userId,
    ...result
  });
};

LiveTranslationService.emitAudioResult = (callId, userId, audioBuffer) => {
  const io = global.io;
  if (!io) {
    console.error('❌ Socket.io instance not found in global scope');
    return;
  }
  
  // Convert buffer to base64 for transmission
  const audioBase64 = audioBuffer.toString('base64');
  
  // Send to all participants EXCEPT the speaker
  io.to(`call:${callId}`).emit('translation:audio', {
    speakerId: userId,
    audio: audioBase64,
    timestamp: new Date()
  });
};

export const setupTranslationHandlers = (io: Server, socket: Socket) => {
  const userId = socket.data.userId as string;
  
  /**
   * Start translation for a call
   */
  // In backend/src/socket/translation.handler.ts
// Around line 70-80, update the error handling:

socket.on('translation:start', async (data) => {
  try {
    const { callId, targetLanguage, sourceLanguage } = data;
    
    if (!userId) {
      socket.emit('translation:error', { 
        message: 'User not authenticated' 
      });
      return;
    }
    
    // Verify user is in the call
    const call = await Call.findOne({ 
      callId,
      'participants.userId': userId 
    });
    
    if (!call) {
      socket.emit('translation:error', { 
        message: 'Not a participant in this call' 
      });
      return;
    }
    
    try {
      // Start translation session
      LiveTranslationService.startSession(
        callId,
        userId,
        targetLanguage,
        sourceLanguage
      );
      
      // Notify user
      socket.emit('translation:started', {
        callId,
        targetLanguage,
        sourceLanguage: sourceLanguage || 'auto',
        message: 'Translation enabled'
      });
      
      // Notify other participants
      socket.to(`call:${callId}`).emit('translation:user-enabled', {
        userId,
        targetLanguage
      });
      
      console.log(`🔤 Translation started for user ${userId} in call ${callId}`);
    } catch (serviceError: any) {
      console.error('Translation service error:', serviceError);
      socket.emit('translation:error', { 
        message: serviceError.message || 'Translation service unavailable'
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
      
      if (!userId || !callId) return;
      
      // Convert base64 back to buffer if needed
      const audioBuffer = typeof audioChunk === 'string'
        ? Buffer.from(audioChunk, 'base64')
        : audioChunk;
      
      // Process the chunk
      const processed = LiveTranslationService.processAudioChunk(
        callId,
        userId,
        audioBuffer
      );
      console.log("🎧 chunk received", audioBuffer.length);
      
      if (!processed) {
        // Session might not exist - auto-start with default language?
        console.log(`No active session for user ${userId} in call ${callId}`);
      }
      
    } catch (error: any) {
      console.error('Audio chunk processing error:', error);
    }
  });
  
  /**
   * Stop translation
   */
  socket.on('translation:stop', (data) => {
    try {
      const { callId } = data;
      
      if (!userId || !callId) return;
      
      LiveTranslationService.stopSession(callId, userId);
      
      // Notify user
      socket.emit('translation:stopped', {
        callId,
        message: 'Translation disabled'
      });
      
      // Notify other participants
      socket.to(`call:${callId}`).emit('translation:user-disabled', {
        userId
      });
      
      console.log(`🔤 Translation stopped for user ${userId} in call ${callId}`);
      
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
      
      if (!userId || !callId) return;
      
      // Stop current session
      LiveTranslationService.stopSession(callId, userId);
      
      // Start new session with new language
      LiveTranslationService.startSession(
        callId,
        userId,
        targetLanguage
      );
      
      // Notify user
      socket.emit('translation:language-changed', {
        callId,
        targetLanguage,
        message: `Language changed to ${targetLanguage}`
      });
      
      // Notify other participants
      socket.to(`call:${callId}`).emit('translation:user-language-changed', {
        userId,
        targetLanguage
      });
      
    } catch (error: any) {
      console.error('Language change error:', error);
      socket.emit('translation:error', { 
        message: error.message || 'Failed to change language' 
      });
    }
  });
  
  /**
   * Get available languages
   */
  socket.on('translation:get-languages', () => {
    const languages = [
      { code: 'en', name: 'English', nativeName: 'English' },
      { code: 'es', name: 'Spanish', nativeName: 'Español' },
      { code: 'fr', name: 'French', nativeName: 'Français' },
      { code: 'de', name: 'German', nativeName: 'Deutsch' },
      { code: 'zh', name: 'Chinese', nativeName: '中文' },
      { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
      { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
      { code: 'ru', name: 'Russian', nativeName: 'Русский' },
      { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
      { code: 'ja', name: 'Japanese', nativeName: '日本語' },
      { code: 'ko', name: 'Korean', nativeName: '한국어' },
    ];
    
    socket.emit('translation:languages', { languages });
  });
  
  /**
   * Handle user disconnect - cleanup sessions
   */
  socket.on('disconnect', () => {
    if (userId) {
      console.log(`🧹 Cleaning up translation sessions for disconnected user ${userId}`);
      // Note: We don't have callId here, so cleanup will happen via timeout
    }
  });
};