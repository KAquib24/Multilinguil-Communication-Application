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
  const dispatch = useDispatch();
  const { socket, translationSocket } = useSocket();

  const sourceLanguage = useSelector(selectSourceLanguage);
  const targetLanguage = useSelector(selectTargetLanguage);
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const token = useSelector((state: RootState) => state.auth.accessToken); // ✅ ADD

  const participants = useSelector((state: RootState) => {
    // Get participants from active call
    return state.call.activeCall?.participants || [];
  });

  const [isTranslating, setIsTranslating] = useState(false);
  const translatingRef = useRef(false); // ✅ FIX: Use ref to avoid stale state
  const [activeSpeakers, setActiveSpeakers] = useState<Set<string>>(new Set());
  const [liveSubtitles, setLiveSubtitles] = useState<
    Map<string, TranslationResult>
  >(new Map());

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<HTMLAudioElement[]>([]);

  // ==================== EVENT LISTENERS ====================

  useEffect(() => {
    if (!translationSocket) return;

    const handleTranslationResult = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { speakerId, original, translated, isFinal } = customEvent.detail;

      console.log("📝 translation result", original, translated); // ✅ DEBUG

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

    const handleTranslationAudio = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { speakerId, audio } = customEvent.detail;

      // Create audio element and play
      const audioElement = new Audio(`data:audio/webm;base64,${audio}`);
      audioElement.play().catch(console.error);

      // Add to queue for tracking
      audioQueueRef.current.push(audioElement);

      // Clean up after playing
      audioElement.onended = () => {
        audioQueueRef.current = audioQueueRef.current.filter(
          (a) => a !== audioElement,
        );
      };
    };

    // Add event listeners
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

  const startTranslation = useCallback(async () => {
    if (!translationSocket || !callId) return;

    try {
      console.log("🔤 Starting translation for call:", callId);

      // First, create a translation session via API
      // const token = useSelector((state: RootState) => state.auth.accessToken);
      const response = await fetch(
        `${process.env.REACT_APP_API_URL}/translation/sessions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },

          body: JSON.stringify({
            participants: [
              currentUser?._id,
              ...participants.map((p: any) => p.userId?._id || p.userId),
            ],
            sourceLanguage,
            targetLanguage,
            callId,
          }),
        },
      );

      const sessionData = await response.json();
      const sessionId =
        sessionData.session?._id || sessionData.data?.session?._id;

      // const sessionData = await response.json();
      // const sessionId =
      //   sessionData.session?._id || sessionData.data?.session?._id;

      // if (!sessionId) {
      //   throw new Error("Failed to create translation session");
      // }

      // console.log("✅ Translation session created:", sessionId);

      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1,
        },
      });

      streamRef.current = stream;

      // Create audio context for monitoring
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      // Create media recorder for streaming - FIXED MIME TYPE
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm", // ✅ FIXED: Removed codecs=opus
        audioBitsPerSecond: 64000, // ✅ FIXED: Higher bitrate
      });

      mediaRecorderRef.current = mediaRecorder;

      // Handle data available
      mediaRecorder.ondataavailable = (event) => {
        // ✅ FIX: Use ref instead of state
        if (event.data.size > 0 && translatingRef.current) {
          console.log("🎤 sending audio chunk"); // ✅ DEBUG

          // Convert blob to base64
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = reader.result?.toString().split(",")[1];
            if (base64) {
              translationSocket.sendAudioChunk(callId, base64);
            }
          };
          reader.readAsDataURL(event.data);
        }
      };

      // Start recording - send chunks every 500ms
      mediaRecorder.start(500);

      // Start translation session
      translationSocket.startTranslation(
        callId,
        targetLanguage,
        sourceLanguage,
      );

      setIsTranslating(true);
      translatingRef.current = true; // ✅ FIX: Update ref

      console.log("🔤 Live translation started");
    } catch (error: any) {
      console.error("Failed to start translation:", error);
      dispatch(setError(error.message || "Failed to start translation"));
      throw error;
    }
  }, [
    translationSocket,
    callId,
    targetLanguage,
    sourceLanguage,
    currentUser,
    participants,
    dispatch,
  ]);

  // ==================== STOP TRANSLATION ====================

  const stopTranslation = useCallback(() => {
    if (!translationSocket || !callId) return;

    console.log("🛑 Stopping translation");

    // Stop media recorder
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }

    // Stop all tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Stop all playing audio
    audioQueueRef.current.forEach((audio) => {
      audio.pause();
      audio.src = "";
    });
    audioQueueRef.current = [];

    // Stop translation session
    translationSocket.stopTranslation(callId);

    setIsTranslating(false);
    translatingRef.current = false; // ✅ FIX: Update ref
    setLiveSubtitles(new Map());
    setActiveSpeakers(new Set());

    console.log("🔤 Live translation stopped");
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

  // ❌ REMOVED: Auto-start effect - translation starts only when user clicks Start

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isTranslating) {
        stopTranslation();
      }
    };
  }, []);

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
