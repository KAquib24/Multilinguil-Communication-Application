import { useState, useEffect, useRef, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useSocket } from "../context/SocketContext";
import {
  selectSourceLanguage,
  selectTargetLanguage,
  addToHistory,
  addToAudioQueue,
  setError,
} from "../features/translation/translationSlice";
import { RootState } from "../app/store";

interface TranslationResult {
  speakerId: string;
  original: string;
  translated: string;
  isFinal: boolean;
  timestamp: Date;
}

interface TranslationAudio {
  speakerId: string;
  audio: string;
  timestamp: Date;
}

export const useLiveTranslation = (callId: string) => {
  // 🔥 ADD THIS HERE (top inside hook)
  const audioQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef(false);
  const dispatch = useDispatch();
  const { socket, translationSocket } = useSocket();

  const sourceLanguage = useSelector(selectSourceLanguage);
  const targetLanguage = useSelector(selectTargetLanguage);
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const token = useSelector((state: RootState) => state.auth.accessToken);

  const participants = useSelector((state: RootState) => {
    return state.call.activeCall?.participants || [];
  });

  const [isTranslating, setIsTranslating] = useState(false);
  const translatingRef = useRef(false);
  const [activeSpeakers, setActiveSpeakers] = useState<Set<string>>(new Set());
  const [liveSubtitles, setLiveSubtitles] = useState<
    Map<string, TranslationResult>
  >(new Map());

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // 🔥 ADD THIS
  const playNext = () => {
    const queue = audioQueueRef.current;

    if (queue.length === 0) {
      isPlayingRef.current = false;
      return;
    }

    isPlayingRef.current = true;

    const audioBase64 = queue.shift()!;
    const audioElement = new Audio(`data:audio/ogg;base64,${audioBase64}`);

    audioElement.onended = () => {
      playNext();
    };

    audioElement.play().catch((err) => {
      console.error("Audio play failed:", err);
      playNext();
    });
  };

  // ==================== EVENT LISTENERS ====================

  useEffect(() => {
    if (!translationSocket) return;

    const handleTranslationResult = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { speakerId, original, translated, isFinal } = customEvent.detail;

      console.log("📝 translation result", original, translated);

      // Update live subtitles
      setLiveSubtitles((prev) => {
        const newMap = new Map(prev);
        newMap.set(speakerId, {
          speakerId,
          original,
          translated,
          isFinal,
          timestamp: new Date(),
        });
        return newMap;
      });

      // Update active speakers
      setActiveSpeakers((prev) => {
        const newSet = new Set(prev);
        newSet.add(speakerId);
        return newSet;
      });

      // Add to history if final
      if (isFinal) {
        dispatch(
          addToHistory({
            original,
            translated,
            sourceLang: "auto",
            targetLang: targetLanguage,
            confidence: 0.95,
          }),
        );
      }
    };

    const handleTranslationAudio = (event: any) => {
      const data = event.detail;

      console.log("🔊 Queueing audio...");

      audioQueueRef.current.push(data.audio);

      if (!isPlayingRef.current) {
        playNext();
      }
    };

    window.addEventListener("translation:result", handleTranslationResult);
    window.addEventListener("translation:audio", handleTranslationAudio);

    return () => {
      window.removeEventListener("translation:result", handleTranslationResult);
      window.removeEventListener("translation:audio", handleTranslationAudio);
    };
  }, [translationSocket, dispatch, targetLanguage]);

  // ==================== CLEANUP INACTIVE SPEAKERS ====================

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setLiveSubtitles((prev) => {
        const newMap = new Map(prev);
        let changed = false;

        prev.forEach((value, key) => {
          // Remove subtitles older than 3 seconds
          if (now - value.timestamp.getTime() > 3000) {
            newMap.delete(key);
            changed = true;
          }
        });

        return changed ? newMap : prev;
      });

      setActiveSpeakers((prev) => {
        const newSet = new Set(prev);
        let changed = false;

        prev.forEach((speakerId) => {
          if (!liveSubtitles.has(speakerId)) {
            newSet.delete(speakerId);
            changed = true;
          }
        });

        return changed ? newSet : prev;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [liveSubtitles]);

  // ==================== START TRANSLATION ====================

  const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;

    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      for (let j = 0; j < chunk.length; j++) {
        binary += String.fromCharCode(chunk[j]);
      }
    }

    return btoa(binary);
  };

  // hooks/useLiveTranslation.ts
const startTranslation = useCallback(async () => {
  if (!translationSocket || !callId) return;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 16000,
        channelCount: 1,
      },
    });

    streamRef.current = stream;

    const audioContext = new AudioContext({ sampleRate: 16000 });
    audioContextRef.current = audioContext;

    const source = audioContext.createMediaStreamSource(stream);
    
    const processor = audioContext.createScriptProcessor(4096, 1, 1);

    processor.onaudioprocess = (event) => {
      if (!translatingRef.current) return;

      const inputData = event.inputBuffer.getChannelData(0);
      const int16Data = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      const base64 = arrayBufferToBase64(int16Data.buffer);
      translationSocket.sendAudioChunk(callId, base64);
    };

    source.connect(processor);
    
    // Don't connect to destination to avoid echo
    processor.connect(audioContext.destination);
    
    (streamRef as any).processor = processor;

    // ✅ Start translation with sourceLanguage = 'auto'
    translationSocket.startTranslation(
      callId,
      targetLanguage,
      'auto'  // Always use auto-detection for source
    );

    setIsTranslating(true);
    translatingRef.current = true;

    console.log("🎤 Real-time streaming translation started with auto-detection");
  } catch (error: any) {
    console.error("❌ Failed to start translation:", error);
    throw error;
  }
}, [translationSocket, callId, targetLanguage]);

  const stopTranslation = useCallback(() => {
    if (!translationSocket || !callId) return;

    // Cleanup AudioContext processor
    const processor = (streamRef as any).processor;
    if (processor) {
      processor.disconnect();
      processor.onaudioprocess = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    const source = (streamRef as any).source;
    if (source) {
      source.disconnect();
    }

    translationSocket.stopTranslation(callId);
    setIsTranslating(false);
    translatingRef.current = false;
    setLiveSubtitles(new Map());
  }, [translationSocket, callId]);

  // ==================== CHANGE LANGUAGE ====================

  const changeLanguage = useCallback(
    (newTargetLanguage: string) => {
      if (!translationSocket || !callId || !isTranslating) return;

      translationSocket.changeLanguage(callId, newTargetLanguage);
    },
    [translationSocket, callId, isTranslating],
  );

  // ==================== GET SUBTITLES FOR SPEAKER ====================

  const getSubtitlesForSpeaker = useCallback(
    (speakerId: string) => {
      return liveSubtitles.get(speakerId);
    },
    [liveSubtitles],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isTranslating) {
        stopTranslation();
      }
    };
  }, [isTranslating, stopTranslation]);

  return {
    isTranslating,
    activeSpeakers: Array.from(activeSpeakers),
    subtitles: Array.from(liveSubtitles.values()),
    startTranslation,
    stopTranslation,
    changeLanguage,
    getSubtitlesForSpeaker,
  };
};
