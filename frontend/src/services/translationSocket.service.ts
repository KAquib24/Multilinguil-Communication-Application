import { Socket } from "socket.io-client";
import { store } from "../app/store";
import {
  addToHistory,
  addToAudioQueue,
  setCurrentSession,
  updateSession,
  setIsTranslating,
  setError,
} from "../features/translation/translationSlice";

export class TranslationSocketService {
  private socket: Socket | null = null;

  constructor(socket: Socket) {
  this.socket = socket;

  // ✅ ADD THIS
  this.socket.on("translation:audio", (data) => {
    console.log("🔊 Received translation audio from backend:", data);

    window.dispatchEvent(
      new CustomEvent("translation:audio", {
        detail: data,
      })
    );
  });
}

  private setupListeners() {
  if (!this.socket) return;

  // Translation results
  this.socket.on("translation:result", this.handleTranslationResult.bind(this));
  
  // Audio results
  this.socket.on("translation:audio", this.handleTranslationAudio.bind(this));
  
  // Session events - ADD DEBUG
  this.socket.on("translation:started", (data) => {
    console.log("✅ Translation session started", data); // ✅ DEBUG
    this.handleSessionStarted(data);
  });
  
  this.socket.on("translation:stopped", (data) => {
    console.log("🛑 Translation session stopped", data); // ✅ DEBUG
    this.handleSessionStopped(data);
  });
  
  this.socket.on("translation:user-enabled", this.handleUserEnabled.bind(this));
  this.socket.on("translation:user-disabled", this.handleUserDisabled.bind(this));
  this.socket.on("translation:user-language-changed", this.handleUserLanguageChanged.bind(this));
  
  // Languages
  this.socket.on("translation:languages", this.handleLanguages.bind(this));
  
  // Errors
  this.socket.on("translation:error", this.handleTranslationError.bind(this));
}

  // ==================== EMITTERS ====================

  /**
   * Start translation for a call
   */
  // services/translationSocket.service.ts
startTranslation(callId: string, targetLanguage: string, sourceLanguage?: string) {
  // If sourceLanguage is 'auto' or undefined, don't send it (backend will auto-detect)
  const payload: any = {
    callId,
    targetLanguage,
  };
  
  // Only send sourceLanguage if it's a specific language (not auto)
  if (sourceLanguage && sourceLanguage !== 'auto') {
    payload.sourceLanguage = sourceLanguage;
  }
  
  this.socket?.emit("translation:start", payload);
  store.dispatch(setIsTranslating(true));
}

  /**
   * Send audio chunk for translation
   */
  sendAudioChunk(callId: string, audioChunk: string | Buffer) {
    this.socket?.emit("translation:audio", {
      callId,
      audioChunk,
    });
  }

  /**
   * Stop translation
   */
  stopTranslation(callId: string) {
    this.socket?.emit("translation:stop", { callId });
    store.dispatch(setIsTranslating(false));
  }

  /**
   * Change target language
   */
  changeLanguage(callId: string, targetLanguage: string) {
    this.socket?.emit("translation:change-language", {
      callId,
      targetLanguage,
    });
  }

  /**
   * Get available languages
   */
  getLanguages() {
    this.socket?.emit("translation:get-languages");
  }

  // ==================== HANDLERS ====================

  private handleTranslationResult(data: any) {
    const { speakerId, original, translated, sourceLanguage, targetLanguage, isFinal, timestamp } = data;
    
    // Add to history
    store.dispatch(addToHistory({
      original,
      translated,
      sourceLang: sourceLanguage,
      targetLang: targetLanguage,
      confidence: 0.95,
    }));
    
    // Dispatch custom event for UI components
    window.dispatchEvent(new CustomEvent('translation:result', { 
      detail: { speakerId, original, translated, isFinal } 
    }));
  }

  private handleTranslationAudio(data: any) {
    const { speakerId, audio, timestamp } = data;
    
    // Add to audio queue
    store.dispatch(addToAudioQueue({
      text: '',
      audioUrl: `data:audio/webm;base64,${audio}`,
      language: '',
    }));
    
    // Dispatch custom event
    window.dispatchEvent(new CustomEvent('translation:audio', { 
      detail: { speakerId, audio, timestamp } 
    }));
  }

  // In translationSocket.service.ts, line 131-141:

private handleSessionStarted(data: any) {
  const { callId, targetLanguage, sourceLanguage, message } = data;
  
  store.dispatch(setCurrentSession({
    _id: `session_${Date.now()}`, // ✅ ADD THIS
    sessionId: `session_${Date.now()}`,
    callId,
    sourceLanguage: sourceLanguage || 'auto',
    targetLanguage,
    isActive: true,
    segments: [],
    participants: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
  
  console.log(`✅ Translation session started for call ${callId}`);
}



  private handleSessionStopped(data: any) {
    const { callId, message } = data;
    
    store.dispatch(setCurrentSession(null));
    store.dispatch(setIsTranslating(false));
    
    console.log(`🛑 Translation session stopped for call ${callId}`);
  }

  private handleUserEnabled(data: any) {
    const { userId, targetLanguage } = data;
    
    window.dispatchEvent(new CustomEvent('translation:user-enabled', { 
      detail: { userId, targetLanguage } 
    }));
  }

  private handleUserDisabled(data: any) {
    const { userId } = data;
    
    window.dispatchEvent(new CustomEvent('translation:user-disabled', { 
      detail: { userId } 
    }));
  }

  private handleUserLanguageChanged(data: any) {
    const { userId, targetLanguage } = data;
    
    window.dispatchEvent(new CustomEvent('translation:user-language-changed', { 
      detail: { userId, targetLanguage } 
    }));
  }

  private handleLanguages(data: any) {
    const { languages } = data;
    
    // Store languages if needed
    console.log('Available languages:', languages);
  }

  private handleTranslationError(data: any) {
    const { message } = data;
    
    store.dispatch(setError(message));
    console.error('Translation error:', message);
  }

  // Cleanup
  disconnect() {
    if (this.socket) {
      this.socket.off("translation:result");
      this.socket.off("translation:audio");
      this.socket.off("translation:started");
      this.socket.off("translation:stopped");
      this.socket.off("translation:user-enabled");
      this.socket.off("translation:user-disabled");
      this.socket.off("translation:user-language-changed");
      this.socket.off("translation:languages");
      this.socket.off("translation:error");
    }
  }
}