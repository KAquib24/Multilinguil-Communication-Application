import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Language, TranslationSession } from './translationApi';

interface TranslationState {
  supportedLanguages: Language[];
  currentSession: TranslationSession | null;
  sessions: TranslationSession[];
  isTranslating: boolean;
  translationEnabled: boolean;
  sourceLanguage: string;
  targetLanguage: string;
  translationHistory: Array<{
    id: string;
    original: string;
    translated: string;
    sourceLang: string;
    targetLang: string;
    timestamp: string;
    confidence: number;
  }>;
  isLoading: boolean;
  error: string | null;
  audioQueue: Array<{
    id: string;
    text: string;
    audioUrl: string;
    language: string;
  }>;
  isPlayingAudio: boolean;
}

// features/translation/translationSlice.ts
const initialState: TranslationState = {
  supportedLanguages: [],
  currentSession: null,
  sessions: [],
  isTranslating: false,
  translationEnabled: false,
  sourceLanguage: 'auto', // ✅ CHANGE from 'en' to 'auto'
  targetLanguage: 'es',   // Keep default as Spanish or change to 'en'
  translationHistory: [],
  isLoading: false,
  error: null,
  audioQueue: [],
  isPlayingAudio: false,
};
const translationSlice = createSlice({
  name: 'translation',
  initialState,
  reducers: {
    // Language management
    setSupportedLanguages: (state, action: PayloadAction<Language[]>) => {
      state.supportedLanguages = action.payload;
    },
    
    setSourceLanguage: (state, action: PayloadAction<string>) => {
      state.sourceLanguage = action.payload;
    },
    
    setTargetLanguage: (state, action: PayloadAction<string>) => {
      state.targetLanguage = action.payload;
    },
    
    swapLanguages: (state) => {
      const temp = state.sourceLanguage;
      state.sourceLanguage = state.targetLanguage;
      state.targetLanguage = temp;
    },
    
    // Session management
    setCurrentSession: (state, action: PayloadAction<TranslationSession | null>) => {
      state.currentSession = action.payload;
    },
    
    setSessions: (state, action: PayloadAction<TranslationSession[]>) => {
      state.sessions = action.payload;
    },
    
    addSession: (state, action: PayloadAction<TranslationSession>) => {
      state.sessions.unshift(action.payload);
    },
    
    updateSession: (state, action: PayloadAction<{ sessionId: string; updates: Partial<TranslationSession> }>) => {
      const index = state.sessions.findIndex(s => s.sessionId === action.payload.sessionId);
      if (index !== -1) {
        state.sessions[index] = { ...state.sessions[index], ...action.payload.updates };
      }
      
      if (state.currentSession?.sessionId === action.payload.sessionId) {
        state.currentSession = { ...state.currentSession, ...action.payload.updates };
      }
    },
    
    addTranslationSegment: (state, action: PayloadAction<{ sessionId: string; segment: any }>) => {
      const { sessionId, segment } = action.payload;
      
      if (state.currentSession?.sessionId === sessionId) {
        state.currentSession.segments.push(segment);
      }
      
      const sessionIndex = state.sessions.findIndex(s => s.sessionId === sessionId);
      if (sessionIndex !== -1) {
        state.sessions[sessionIndex].segments.push(segment);
      }
    },
    
    // Translation status
    setIsTranslating: (state, action: PayloadAction<boolean>) => {
      state.isTranslating = action.payload;
    },
    
    setTranslationEnabled: (state, action: PayloadAction<boolean>) => {
      state.translationEnabled = action.payload;
    },
    
    toggleTranslation: (state) => {
      state.translationEnabled = !state.translationEnabled;
    },
    
    // History management
    addToHistory: (state, action: PayloadAction<{
      original: string;
      translated: string;
      sourceLang: string;
      targetLang: string;
      confidence: number;
    }>) => {
      state.translationHistory.unshift({
        id: Date.now().toString(),
        ...action.payload,
        timestamp: new Date().toISOString(),
      });
      
      // Keep only last 100 items
      if (state.translationHistory.length > 100) {
        state.translationHistory.pop();
      }
    },
    
    clearHistory: (state) => {
      state.translationHistory = [];
    },
    
    // Audio management
    addToAudioQueue: (state, action: PayloadAction<{
      text: string;
      audioUrl: string;
      language: string;
    }>) => {
      state.audioQueue.push({
        id: Date.now().toString(),
        ...action.payload,
      });
    },
    
    removeFromAudioQueue: (state, action: PayloadAction<string>) => {
      state.audioQueue = state.audioQueue.filter(item => item.id !== action.payload);
    },
    
    clearAudioQueue: (state) => {
      state.audioQueue = [];
    },
    
    setIsPlayingAudio: (state, action: PayloadAction<boolean>) => {
      state.isPlayingAudio = action.payload;
    },
    
    // Loading & error
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    
    // Reset
    resetTranslationState: (state) => {
      state.currentSession = null;
      state.isTranslating = false;
      state.translationEnabled = false;
      state.isLoading = false;
      state.error = null;
      state.audioQueue = [];
      state.isPlayingAudio = false;
    },
  },
});

export const {
  setSupportedLanguages,
  setSourceLanguage,
  setTargetLanguage,
  swapLanguages,
  setCurrentSession,
  setSessions,
  addSession,
  updateSession,
  addTranslationSegment,
  setIsTranslating,
  setTranslationEnabled,
  toggleTranslation,
  addToHistory,
  clearHistory,
  addToAudioQueue,
  removeFromAudioQueue,
  clearAudioQueue,
  setIsPlayingAudio,
  setLoading,
  setError,
  resetTranslationState,
} = translationSlice.actions;

export default translationSlice.reducer;

// Selectors
export const selectSupportedLanguages = (state: { translation: TranslationState }) => 
  state.translation.supportedLanguages;
export const selectSourceLanguage = (state: { translation: TranslationState }) => 
  state.translation.sourceLanguage;
export const selectTargetLanguage = (state: { translation: TranslationState }) => 
  state.translation.targetLanguage;
export const selectCurrentSession = (state: { translation: TranslationState }) => 
  state.translation.currentSession;
export const selectTranslationSessions = (state: { translation: TranslationState }) => 
  state.translation.sessions;
export const selectIsTranslating = (state: { translation: TranslationState }) => 
  state.translation.isTranslating;
export const selectTranslationEnabled = (state: { translation: TranslationState }) => 
  state.translation.translationEnabled;
export const selectTranslationHistory = (state: { translation: TranslationState }) => 
  state.translation.translationHistory;
export const selectAudioQueue = (state: { translation: TranslationState }) => 
  state.translation.audioQueue;
export const selectIsPlayingAudio = (state: { translation: TranslationState }) => 
  state.translation.isPlayingAudio;
export const selectIsLoading = (state: { translation: TranslationState }) => 
  state.translation.isLoading;
export const selectTranslationError = (state: { translation: TranslationState }) => 
  state.translation.error;