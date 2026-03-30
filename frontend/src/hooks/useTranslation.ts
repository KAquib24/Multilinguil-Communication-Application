import { useEffect, useRef, useCallback, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useSocket } from "../context/SocketContext";
import {
  useGetSupportedLanguagesQuery,
  useTranslateTextMutation,
  useSpeechToTextMutation,
  useTextToSpeechMutation,
  useCreateTranslationSessionMutation,
} from "../features/translation/translationApi";
import {
  setSupportedLanguages,
  setSourceLanguage,
  setTargetLanguage,
  swapLanguages,
  addToHistory,
  setError,
  addToAudioQueue,
} from "../features/translation/translationSlice";
import { RootState } from "../app/store";
import toast from "react-hot-toast";
import {
  selectSupportedLanguages,
  selectSourceLanguage,
  selectTargetLanguage,
  selectTranslationEnabled,
} from "../features/translation/translationSelectors";

interface TranslationOptions {
  sourceLanguage?: string;
  targetLanguage?: string;
  saveToHistory?: boolean;
  sessionId?: string;
}

export const useTranslation = () => {
  const dispatch = useDispatch();
  const { socket, translationSocket } = useSocket(); // ✅ FIXED: Added translationSocket

  // Selectors
  const supportedLanguages = useSelector(selectSupportedLanguages);
  const sourceLanguage = useSelector(selectSourceLanguage);
  const targetLanguage = useSelector(selectTargetLanguage);
  const translationEnabled = useSelector(selectTranslationEnabled);
  const currentUser = useSelector((state: RootState) => state.auth.user);

  // API hooks
  const { data: languagesData } = useGetSupportedLanguagesQuery();
  const [translateTextApi] = useTranslateTextMutation();
  const [speechToTextApi] = useSpeechToTextMutation();
  const [textToSpeechApi] = useTextToSpeechMutation();
  const [createSessionApi] = useCreateTranslationSessionMutation();

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // Initialize languages
  useEffect(() => {
    if (languagesData?.languages && supportedLanguages.length === 0) {
      dispatch(setSupportedLanguages(languagesData.languages));
    }
  }, [languagesData, supportedLanguages, dispatch]);

  // Socket event listeners
  // useEffect(() => {
  //   if (!socket) return;

  //   // Translation results
  //   socket.on('translation:result', (data: any) => {
  //     console.log('Translation result:', data);
  //     handleTranslationResult(data);
  //   });

  //   // Translation errors
  //   socket.on('translation:error', (data: any) => {
  //     console.error('Translation error:', data);
  //     toast.error(data.message || 'Translation error');
  //   });

  //   // Session events
  //   socket.on('translation:started', (data: any) => {
  //     console.log('Translation session started:', data);
  //     setCurrentSessionId(data.sessionId);
  //   });

  //   socket.on('translation:stopped', (data: any) => {
  //     console.log('Translation session stopped:', data);
  //     if (currentSessionId === data.sessionId) {
  //       setCurrentSessionId(null);
  //     }
  //   });

  //   return () => {
  //     socket.off('translation:result');
  //     socket.off('translation:error');
  //     socket.off('translation:started');
  //     socket.off('translation:stopped');
  //   };
  // }, [socket, currentSessionId]);

  // Handle incoming translation results
  const handleTranslationResult = useCallback(
    (data: any) => {
      const { translation, userId, sessionId } = data;

      // Add to history
      dispatch(
        addToHistory({
          original: translation.originalText,
          translated: translation.translatedText,
          sourceLang: sourceLanguage,
          targetLang: targetLanguage,
          confidence: translation.confidence,
        }),
      );

      // If audio is available, add to queue
      if (translation.translatedAudio) {
        dispatch(
          addToAudioQueue({
            text: translation.translatedText,
            audioUrl: translation.translatedAudio,
            language: targetLanguage,
          }),
        );
      }

      // Show notification
      if (userId !== currentUser?._id) {
        toast(`New translation from user`, {
          icon: "🔊",
        });
      }
    },
    [dispatch, sourceLanguage, targetLanguage, currentUser],
  );

  // Translate text
  const translateText = useCallback(
    async (text: string, options?: TranslationOptions) => {
      try {
        const result = await translateTextApi({
          text,
          targetLanguage: options?.targetLanguage || targetLanguage,
          sourceLanguage: options?.sourceLanguage || sourceLanguage,
        }).unwrap();

        if (options?.saveToHistory !== false) {
          dispatch(
            addToHistory({
              original: text,
              translated: result.translation.translatedText,
              sourceLang: result.translation.sourceLanguage,
              targetLang: result.translation.targetLanguage,
              confidence: result.translation.confidence,
            }),
          );
        }

        return result.translation;
      } catch (error: any) {
        console.error("Translation error:", error);
        dispatch(setError("Translation failed"));
        toast.error("Translation failed");
        throw error;
      }
    },
    [translateTextApi, sourceLanguage, targetLanguage, dispatch],
  );

  // Convert speech to text
  const speechToText = useCallback(
    async (audioBlob: Blob, language: string = sourceLanguage) => {
      try {
        const formData = new FormData();
        formData.append("audio", audioBlob, "recording.webm");
        formData.append("language", language);

        const result = await speechToTextApi(formData).unwrap();
        return result.transcription;
      } catch (error: any) {
        console.error("Speech to text error:", error);
        toast.error("Speech recognition failed");
        throw error;
      }
    },
    [speechToTextApi, sourceLanguage],
  );

  // Convert text to speech
  const textToSpeech = useCallback(
    async (text: string, language: string = targetLanguage, voice?: string) => {
      try {
        const result = await textToSpeechApi({
          text,
          language,
          voice,
        }).unwrap();

        dispatch(
          addToAudioQueue({
            text,
            audioUrl: result.synthesis.audioUrl,
            language,
          }),
        );

        return result.synthesis;
      } catch (error: any) {
        console.error("Text to speech error:", error);
        toast.error("Speech synthesis failed");
        throw error;
      }
    },
    [textToSpeechApi, targetLanguage, dispatch],
  );

  // Play audio
  const playAudio = useCallback((audioUrl: string) => {
    const audio = new Audio(audioUrl);
    audio.play().catch((error) => {
      console.error("Audio playback error:", error);
      toast.error("Failed to play audio");
    });
    return audio;
  }, []);

  // Start real-time translation recording
  const startRealTimeTranslation = useCallback(
    async (sessionId: string, callId?: string) => {
      try {
        if (!socket) {
          throw new Error("Socket not connected");
        }

        // Request microphone access
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: 16000,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });

        streamRef.current = stream;

        // Create media recorder
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: "audio/webm",
          audioBitsPerSecond: 16000,
        });

        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        // Handle data available
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);

            // Convert blob to base64 for sending
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64Audio = reader.result?.toString().split(",")[1];

              if (base64Audio && socket) {
                socket.emit("translation:stream", {
                  audioChunk: base64Audio,
                  sessionId,
                  sourceLanguage,
                  targetLanguage,
                  isFinal: false, // Streaming chunks
                  callId,
                });
              }
            };
            reader.readAsDataURL(event.data);
          }
        };

        // Start recording
        mediaRecorder.start(1000); // Collect data every second
        setIsRecording(true);
        setCurrentSessionId(sessionId);

        // Join translation session
        socket.emit("translation:join", sessionId);

        return mediaRecorder;
      } catch (error: any) {
        console.error("Failed to start recording:", error);
        toast.error("Failed to access microphone");
        throw error;
      }
    },
    [socket, sourceLanguage, targetLanguage],
  );

  // Stop real-time translation
  const stopRealTimeTranslation = useCallback(async () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      // Send final chunk if any
      if (audioChunksRef.current.length > 0 && socket && currentSessionId) {
        const finalBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
        const reader = new FileReader();

        reader.onloadend = () => {
          const base64Audio = reader.result?.toString().split(",")[1];

          if (base64Audio) {
            socket.emit("translation:stream", {
              audioChunk: base64Audio,
              sessionId: currentSessionId,
              sourceLanguage,
              targetLanguage,
              isFinal: true, // Final chunk
            });
          }
        };
        reader.readAsDataURL(finalBlob);
      }

      // Clean up
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      audioChunksRef.current = [];

      // Leave session
      if (socket && currentSessionId) {
        socket.emit("translation:leave", currentSessionId);
      }

      setCurrentSessionId(null);
    }
  }, [socket, isRecording, currentSessionId, sourceLanguage, targetLanguage]);

  // Create translation session
  const createTranslationSession = useCallback(
    async (participants: string[], callId?: string, chatId?: string) => {
      try {
        const result = await createSessionApi({
          participants,
          sourceLanguage,
          targetLanguage,
          callId,
          chatId,
        }).unwrap();

        return result.session;
      } catch (error: any) {
        console.error("Create session error:", error);
        toast.error("Failed to create translation session");
        throw error;
      }
    },
    [createSessionApi, sourceLanguage, targetLanguage],
  );

  // Join existing session
  const joinTranslationSession = useCallback(
    (sessionId: string) => {
      if (socket) {
        socket.emit("translation:join", sessionId);
        setCurrentSessionId(sessionId);
      }
    },
    [socket],
  );

  // Leave session
  const leaveTranslationSession = useCallback(() => {
    if (socket && currentSessionId) {
      socket.emit("translation:leave", currentSessionId);
      setCurrentSessionId(null);
    }
  }, [socket, currentSessionId]);

  // Get language info
  const getLanguageName = useCallback(
    (code: string): string => {
      const lang = supportedLanguages.find((l) => l.code === code);
      return lang?.name || code;
    },
    [supportedLanguages],
  );

  const getLanguageNativeName = useCallback(
    (code: string): string => {
      const lang = supportedLanguages.find((l) => l.code === code);
      return lang?.nativeName || code;
    },
    [supportedLanguages],
  );

  // Swap languages
  const swapLanguages = useCallback(() => {
    const currentSource = sourceLanguage;
    const currentTarget = targetLanguage;

    dispatch(setSourceLanguage(currentTarget));
    dispatch(setTargetLanguage(currentSource));
  }, [sourceLanguage, targetLanguage, dispatch]);

  // Start translation (real-time)
  const startTranslation = useCallback(
    async (participants: string[], callId?: string, chatId?: string) => {
      try {
        const session = await createTranslationSession(
          participants,
          callId,
          chatId,
        );
        await startRealTimeTranslation(session._id, callId);
        return session;
      } catch (error) {
        console.error("Failed to start translation:", error);
        toast.error("Failed to start translation");
        throw error;
      }
    },
    [createTranslationSession, startRealTimeTranslation],
  );

  // Stop translation (real-time)
  const stopTranslation = useCallback(async () => {
    if (isRecording && currentSessionId) {
      await stopRealTimeTranslation();
    }
  }, [isRecording, currentSessionId, stopRealTimeTranslation]);

  // ==================== LIVE TRANSLATION METHODS ====================

  /**
   * Start live translation for a call (using socket directly)
   */
  const startLiveTranslation = useCallback(
    (callId: string) => {
      if (translationSocket) {
        translationSocket.startTranslation(
          callId,
          targetLanguage,
          sourceLanguage,
        );
      } else {
        console.warn("Translation socket not available");
      }
    },
    [translationSocket, targetLanguage, sourceLanguage],
  );

  /**
   * Stop live translation for a call
   */
  const stopLiveTranslation = useCallback(
    (callId: string) => {
      if (translationSocket) {
        translationSocket.stopTranslation(callId);
      }
    },
    [translationSocket],
  );

  /**
   * Send audio chunk for live translation
   */
  const sendAudioChunk = useCallback(
    (callId: string, audioChunk: string | Buffer) => {
      if (translationSocket) {
        translationSocket.sendAudioChunk(callId, audioChunk);
      }
    },
    [translationSocket],
  );

  /**
   * Change target language during live translation
   */
  const changeLiveTranslationLanguage = useCallback(
    (callId: string, newTargetLanguage: string) => {
      if (translationSocket) {
        translationSocket.changeLanguage(callId, newTargetLanguage);
        dispatch(setTargetLanguage(newTargetLanguage));
      }
    },
    [translationSocket, dispatch],
  );

  // ==================== END OF LIVE TRANSLATION METHODS ====================

  // Clean up
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && isRecording) {
        stopRealTimeTranslation();
      }
    };
  }, [isRecording, stopRealTimeTranslation]);

  return {
    // State
    supportedLanguages,
    sourceLanguage,
    targetLanguage,
    translationEnabled,
    isRecording,
    currentSessionId,

    // Actions
    setSourceLanguage: (lang: string) => dispatch(setSourceLanguage(lang)),
    setTargetLanguage: (lang: string) => dispatch(setTargetLanguage(lang)),
    swapLanguages,

    // Core functions
    translateText,
    speechToText,
    textToSpeech,
    playAudio,

    // Real-time translation
    startRealTimeTranslation,
    stopRealTimeTranslation,
    startTranslation,
    stopTranslation,

    // ==================== LIVE TRANSLATION METHODS ====================
    startLiveTranslation,
    stopLiveTranslation,
    sendAudioChunk,
    changeLiveTranslationLanguage,
    // ==================== END ====================

    // Session management
    createTranslationSession,
    joinTranslationSession,
    leaveTranslationSession,

    // Utilities
    getLanguageName,
    getLanguageNativeName,

    // Status
    isTranslationActive: !!currentSessionId && translationEnabled,
  };
};
