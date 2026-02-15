import { apiSlice } from '../../app/apiSlice';

export interface Language {
  code: string;
  name: string;
  nativeName: string;
}

export interface TranslationResult {
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  confidence: number;
}

export interface BatchTranslationResult {
  original: string;
  translated: string;
  sourceLanguage: string;
  confidence: number;
}

export interface TranscriptionResult {
  text: string;
  confidence: number;
  language: string;
  duration: number;
}

export interface SynthesisResult {
  audioUrl: string;
  duration: number;
  fileSize: number;
  language: string;
}

export interface TranslationSegment {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
  translatedText: string;
  confidence: number;
  timestamp: string;
  duration?: number;
  speakerId?: string;
}

export interface TranslationSession {
  _id: string;
  sessionId: string;
  callId?: string;
  chatId?: string;
  participants: string[];
  sourceLanguage: string;
  targetLanguage: string;
  isActive: boolean;
  segments: TranslationSegment[];
  translatedCount?: number;
  totalDuration?: number;
  createdAt: string;
  updatedAt: string;
}

export interface RealTimeTranslationResult {
  originalText: string;
  translatedText: string;
  translatedAudio?: string;
  confidence: number;
  duration: number;
}

export const translationApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // Get supported languages
    getSupportedLanguages: builder.query<{ languages: Language[] }, void>({
      query: () => '/translation/languages',
      providesTags: ['Translation'],
    }),

    // Detect language
    detectLanguage: builder.mutation<{ detection: any }, { text: string }>({
      query: ({ text }) => ({
        url: '/translation/detect',
        method: 'POST',
        body: { text },
      }),
    }),

    // Translate text
    translateText: builder.mutation<
      { translation: TranslationResult },
      { text: string; targetLanguage: string; sourceLanguage?: string }
    >({
      query: (data) => ({
        url: '/translation/translate',
        method: 'POST',
        body: data,
      }),
    }),

    // Batch translate
    batchTranslate: builder.mutation<
      { translations: BatchTranslationResult[] },
      { texts: string[]; targetLanguage: string; sourceLanguage?: string }
    >({
      query: (data) => ({
        url: '/translation/batch',
        method: 'POST',
        body: data,
      }),
    }),

    // Speech to text
    speechToText: builder.mutation<
      { transcription: TranscriptionResult },
      FormData
    >({
      query: (formData) => ({
        url: '/translation/speech-to-text',
        method: 'POST',
        body: formData,
      }),
    }),

    // Text to speech
    textToSpeech: builder.mutation<
      { synthesis: SynthesisResult },
      {
        text: string;
        language?: string;
        voice?: string;
        speakingRate?: number;
      }
    >({
      query: (data) => ({
        url: '/translation/text-to-speech',
        method: 'POST',
        body: data,
      }),
    }),

    // Real-time translation
    realTimeTranslation: builder.mutation<
      { translation: RealTimeTranslationResult },
      FormData
    >({
      query: (formData) => ({
        url: '/translation/real-time',
        method: 'POST',
        body: formData,
      }),
    }),

    // Create translation session
    createTranslationSession: builder.mutation<
      { session: TranslationSession },
      {
        participants: string[];
        sourceLanguage: string;
        targetLanguage: string;
        callId?: string;
        chatId?: string;
      }
    >({
      query: (data) => ({
        url: '/translation/sessions',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['Translation'],
    }),

    // Get translation session
    getTranslationSession: builder.query<
      { session: TranslationSession },
      string
    >({
      query: (sessionId) => `/translation/sessions/${sessionId}`,
      providesTags: (_result, _error, sessionId) => [
        { type: 'Translation', id: sessionId },
      ],
    }),

    // Get user sessions
    getUserTranslationSessions: builder.query<
      {
        sessions: TranslationSession[];
        total: number;
        page: number;
        totalPages: number;
      },
      { page?: number; limit?: number }
    >({
      query: ({ page = 1, limit = 50 }) =>
        `/translation/sessions?page=${page}&limit=${limit}`,
      providesTags: ['Translation'],
    }),

    // Add segment
    addTranslationSegment: builder.mutation<
      { session: TranslationSession },
      { sessionId: string; segment: Omit<TranslationSegment, 'timestamp'> }
    >({
      query: ({ sessionId, segment }) => ({
        url: `/translation/sessions/${sessionId}/segments`,
        method: 'POST',
        body: segment,
      }),
      invalidatesTags: ['Translation'],
    }),

    // End session
    endTranslationSession: builder.mutation<
      { session: TranslationSession },
      string
    >({
      query: (sessionId) => ({
        url: `/translation/sessions/${sessionId}/end`,
        method: 'POST',
      }),
      invalidatesTags: ['Translation'],
    }),

    // Stats
    getTranslationSessionStats: builder.query<any, string>({
      query: (sessionId) =>
        `/translation/sessions/${sessionId}/stats`,
    }),
  }),
});

export const {
  useGetSupportedLanguagesQuery,
  useDetectLanguageMutation,
  useTranslateTextMutation,
  useBatchTranslateMutation,
  useSpeechToTextMutation,
  useTextToSpeechMutation,
  useRealTimeTranslationMutation,
  useCreateTranslationSessionMutation,
  useGetTranslationSessionQuery,
  useGetUserTranslationSessionsQuery,
  useAddTranslationSegmentMutation,
  useEndTranslationSessionMutation,
  useGetTranslationSessionStatsQuery,
} = translationApi;
