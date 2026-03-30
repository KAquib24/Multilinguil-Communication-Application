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
  
  console.log(`📤 Translation result emitted for call ${callId} from user ${userId}`);
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
  
  console.log(`📤 Audio translation emitted for call ${callId} from user ${userId}, size: ${audioBuffer.length} bytes`);
};

export const setupTranslationHandlers = (io: Server, socket: Socket) => {
  const userId = socket.data.userId as string;
  
  console.log(`🔊 Setting up translation handlers for user ${userId}, socket ID: ${socket.id}`);

  /**
   * Start translation for a call
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
        socket.emit('translation:error', { 
          message: 'User not authenticated' 
        });
        return;
      }
      
      if (!callId) {
        socket.emit('translation:error', { 
          message: 'Call ID is required' 
        });
        return;
      }
      
      if (!targetLanguage) {
        socket.emit('translation:error', { 
          message: 'Target language is required' 
        });
        return;
      }
      
      // Verify user is in the call
      const call = await Call.findOne({ 
        callId,
        'participants.userId': userId 
      });
      
      if (!call) {
        console.error(`User ${userId} not in call ${callId}`);
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
          sourceLanguage || 'auto'
        );
        
        console.log(`✅ Translation session started for user ${userId} in call ${callId}`);
        
        // Notify user
        socket.emit('translation:started', {
          callId,
          targetLanguage,
          sourceLanguage: sourceLanguage || 'auto',
          message: 'Translation enabled',
          timestamp: new Date().toISOString()
        });
        
        // Notify other participants
        socket.to(`call:${callId}`).emit('translation:user-enabled', {
          userId,
          targetLanguage,
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
      
      console.log("🎧 Audio chunk received:", {
        callId,
        userId,
        chunkType: typeof audioChunk,
        chunkLength: audioChunk?.length || 0,
        timestamp: new Date().toISOString()
      });
      
      // Convert base64 back to buffer if needed
      const audioBuffer = typeof audioChunk === 'string'
        ? Buffer.from(audioChunk, 'base64')
        : audioChunk;
      
      console.log("🎧 Buffer created:", {
        bufferLength: audioBuffer.length,
        isBuffer: Buffer.isBuffer(audioBuffer),
        firstFewBytes: audioBuffer.slice(0, 10).toString('hex')
      });
      
      // ✅ RETRY LOGIC: Try up to 3 times if session not ready
      let processed = false;
      for (let i = 0; i < 3; i++) {
        processed = LiveTranslationService.processAudioChunk(
          callId,
          userId,
          audioBuffer
        );
        
        if (processed) {
          if (i > 0) {
            console.log(`✅ Processed on retry #${i + 1}`);
          }
          break;
        }
        
        console.log(`⏳ Session not ready, retry #${i + 1} in 200ms...`);
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      console.log("🎧 Chunk processing result:", {
        callId,
        userId,
        processed: processed,
        bufferSize: audioBuffer.length,
        timestamp: new Date().toISOString()
      });
      
      if (!processed) {
        // Session might not exist - auto-start with default language
        console.log(`⚠️ No active session for user ${userId} in call ${callId} after retries, attempting to auto-start...`);
        
        // Try to auto-start with default language (English)
        try {
          LiveTranslationService.startSession(
            callId,
            userId,
            'en', // Default target language
            'auto' // Auto-detect source
          );
          
          console.log(`✅ Auto-started translation for user ${userId} in call ${callId}`);
          
          // Wait a bit for session to initialize
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Try processing again
          const retryProcessed = LiveTranslationService.processAudioChunk(
            callId,
            userId,
            audioBuffer
          );
          
          console.log(`🎧 Retry processing result after auto-start:`, retryProcessed);
          
          if (retryProcessed) {
            socket.emit('translation:started', {
              callId,
              targetLanguage: 'en',
              sourceLanguage: 'auto',
              message: 'Translation auto-started',
              timestamp: new Date().toISOString()
            });
          }
          
        } catch (startError: any) {
          console.error('❌ Auto-start failed:', startError);
        }
      }
      
    } catch (error: any) {
      console.error('❌ Audio chunk processing error:', error);
      console.error('Error stack:', error.stack);
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
      
      // Notify user
      socket.emit('translation:stopped', {
        callId,
        message: 'Translation disabled',
        timestamp: new Date().toISOString()
      });
      
      // Notify other participants
      socket.to(`call:${callId}`).emit('translation:user-disabled', {
        userId,
        timestamp: new Date().toISOString()
      });
      
      console.log(`✅ Translation stopped for user ${userId} in call ${callId}`);
      
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
        console.error('❌ Missing targetLanguage for translation:change-language');
        return;
      }
      
      console.log(`🔄 Changing language for user ${userId} in call ${callId} to ${targetLanguage}`);
      
      // Stop current session
      LiveTranslationService.stopSession(callId, userId);
      
      // Wait a bit for cleanup
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Start new session with new language
      LiveTranslationService.startSession(
        callId,
        userId,
        targetLanguage,
        'auto'
      );
      
      // Notify user
      socket.emit('translation:language-changed', {
        callId,
        targetLanguage,
        message: `Language changed to ${targetLanguage}`,
        timestamp: new Date().toISOString()
      });
      
      // Notify other participants
      socket.to(`call:${callId}`).emit('translation:user-language-changed', {
        userId,
        targetLanguage,
        timestamp: new Date().toISOString()
      });
      
      console.log(`✅ Language changed for user ${userId} in call ${callId} to ${targetLanguage}`);
      
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
    console.log(`📋 Sending available languages to user ${userId}`);
    
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
   * Debug endpoint to get session info
   */
  socket.on('translation:debug', () => {
    const info = LiveTranslationService.getSessionInfo();
    socket.emit('translation:debug-info', info);
    console.log('📊 Debug info sent:', info);
  });
  
  /**
   * Handle user disconnect - cleanup sessions
   */
  socket.on('disconnect', () => {
    if (userId) {
      console.log(`🧹 User ${userId} disconnected, cleaning up translation sessions`);
      // Note: We don't have callId here, so cleanup will happen via timeout
    }
  });
  
  console.log(`✅ Translation handlers setup for user ${userId}`);
};