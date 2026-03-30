import React, { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../../app/store";
import { useCall } from "../../hooks/useCall";
import { useStreams } from "../../context/StreamContext";
import { useSocket } from "../../context/SocketContext";
import type { Call, CallParticipant } from "../../features/calls/callApi";
import { selectCurrentUser } from "../../features/auth/authSlice";
import {
  MicrophoneIcon,
  VideoCameraIcon,
  VideoCameraSlashIcon,
  PhoneIcon,
  ComputerDesktopIcon,
  StopCircleIcon,
  LanguageIcon,
  UserGroupIcon,
  EllipsisHorizontalIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { formatDuration } from "../../utils/date";
import { format } from "date-fns";
// import RealTimeTranslation from "../translation/RealTimeTranslation";
// ✅ FIXED: Import from translationSlice, not callSlice
import { toggleTranslation, setTargetLanguage } from "../../features/translation/translationSlice";
import { selectTranslationEnabled } from "../../features/translation/translationSelectors";
import AudioMonitor from "../../utils/AudioMonitor";
import LiveTranslationOverlay from "../translation/LiveTranslationOverlay";
import TranslationErrorBoundary from "../translation/TranslationErrorBoundary";

interface TranslationSegment {
  timestamp: string;
  text: string;
  translatedText: string;
  confidence: number;
}

interface TranslationSession {
  segments: TranslationSegment[];
}

const CallScreen: React.FC = () => {
  const dispatch = useDispatch();
  const [callDuration, setCallDuration] = useState(0);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showTranslationOverlay, setShowTranslationOverlay] = useState(false);
  const [currentTranslationSession, setCurrentTranslationSession] =
    useState<TranslationSession | null>(null);
  // Add language modal states
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [selectedTargetLang, setSelectedTargetLang] = useState('es');

  const LANGUAGES = [
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'es', name: 'Spanish', flag: '🇪🇸' },
    { code: 'fr', name: 'French', flag: '🇫🇷' },
    { code: 'de', name: 'German', flag: '🇩🇪' },
    { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
    { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
    { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
    { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
    { code: 'ko', name: 'Korean', flag: '🇰🇷' },
    { code: 'ru', name: 'Russian', flag: '🇷🇺' },
    { code: 'pt', name: 'Portuguese', flag: '🇧🇷' },
    { code: 'it', name: 'Italian', flag: '🇮🇹' },
  ];

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const currentUser = useSelector(selectCurrentUser);
  const { endCall, toggleMute, toggleVideo, toggleScreenShare } = useCall();
  const {
    localStreamRef,
    remoteStreamRef,
    localStreamVersion,
    remoteStreamVersion,
  } = useStreams();
  const { socket } = useSocket();

  // Get remote stream from Redux - only non-stream state
  const activeCall: Call | null = useSelector(
    (state: RootState) => state.call?.activeCall || null,
  );
  const isMuted = useSelector(
    (state: RootState) => state.call?.isMuted || false,
  );
  const isVideoOff = useSelector(
    (state: RootState) => state.call?.isVideoOff || false,
  );
  const isScreenSharing = useSelector(
    (state: RootState) => state.call?.isScreenSharing || false,
  );
  const isRecording = useSelector(
    (state: RootState) => state.call?.isRecording || false,
  );
  // ✅ FIXED: Get translationEnabled from translationSlice
  const translationEnabled = useSelector(selectTranslationEnabled);

  // ✅ Listen for translation results
  useEffect(() => {
    if (!socket) return;

    socket.on('translation:result', (data: any) => {
      console.log('📝 Translation received in CallScreen:', data);
      
      setCurrentTranslationSession(prev => ({
        segments: [
          ...(prev?.segments || []).slice(-10), // keep last 10
          {
            timestamp: new Date().toISOString(),
            text: data.original,
            translatedText: data.translated,
            confidence: data.confidence || 0.95,
          }
        ]
      }));
    });

    return () => {
      socket.off('translation:result');
    };
  }, [socket]);

  // ✅ NEW: Remote stream effect using version
  useEffect(() => {
    const stream = remoteStreamRef.current;
    if (!stream) return;

    console.log("🔊 Attaching remote stream, version:", remoteStreamVersion);

    const audio = remoteAudioRef.current;
    if (!audio) return;

    audio.srcObject = stream;
    audio.muted = false;
    audio.volume = 1.0;

    stream.getAudioTracks().forEach(track => {
      track.enabled = true;
      console.log("🔊 Track:", track.id, "enabled:", track.enabled, "muted:", track.muted);

      // ✅ Key fix: listen for unmute on the track
      track.onunmute = () => {
        console.log("🔊 Track unmuted! Starting playback");
        audio.muted = false;
        audio.play().catch(console.warn);
      };
    });

    const tryPlay = async () => {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          if (ctx.state === 'suspended') await ctx.resume();
          ctx.close();
        }
        await audio.play();
        console.log("✅ Remote audio playing");
      } catch (err) {
        console.warn("⚠️ Autoplay blocked, waiting for interaction");
        const unlock = async () => {
          audio.muted = false;
          await audio.play().catch(console.warn);
          ['click','touchstart','keydown'].forEach(e => 
            document.removeEventListener(e, unlock)
          );
        };
        ['click','touchstart','keydown'].forEach(e => 
          document.addEventListener(e, unlock)
        );
      }
    };

    tryPlay();

  }, [remoteStreamVersion]);

  // ✅ NEW: Local stream effect using version
  useEffect(() => {
    const stream = localStreamRef.current;
    if (!stream || !localVideoRef.current) return;

    console.log("📷 Attaching local stream, version:", localStreamVersion);
    localVideoRef.current.srcObject = stream;
  }, [localStreamVersion]);

  // Clear video when call ends
  useEffect(() => {
    if (!activeCall) {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
    }
  }, [activeCall]);

  // Update call duration
  useEffect(() => {
    if (!activeCall) return;

    const startTime = new Date(activeCall.startTime).getTime();
    const timer = setInterval(() => {
      const now = Date.now();
      setCallDuration(Math.floor((now - startTime) / 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, [activeCall]);

  // Debug logging
  useEffect(() => {
    if (!activeCall) return;

    console.log("🧠 activeCall:", activeCall);
    console.log("👤 currentUser:", currentUser);
    console.log("👥 participants:", activeCall.participants);

    const others = activeCall.participants.filter(
      (p: CallParticipant) => p.userId._id !== currentUser?._id,
    );

    console.log("➡️ otherParticipants:", others);
  }, [activeCall, currentUser]);

  if (!activeCall) return null;

  const { type, initiator, participants } = activeCall;

  const activeParticipants =
    participants?.filter((p: CallParticipant) => p.isActive) || [];

  const isGroupCall = activeParticipants.length > 2;

  const otherParticipants = participants.filter(
    (p: CallParticipant) => p.userId._id !== currentUser?._id,
  );

  const displayUser =
    otherParticipants.length === 1 ? otherParticipants[0].userId : null;

  const handleEndCall = () => {
    endCall();
  };

  const handleToggleMute = () => {
    toggleMute();
  };

  const handleToggleVideo = () => {
    toggleVideo();
  };

  const handleToggleScreenShare = () => {
    toggleScreenShare();
  };

  const handleToggleTranslation = () => {
    if (!translationEnabled) {
      // Show language picker BEFORE enabling translation
      setShowLanguageModal(true);
    } else {
      dispatch(toggleTranslation());
      setShowTranslationOverlay(false);
    }
  };

  const handleStartTranslationWithLang = (targetLang: string) => {
    setSelectedTargetLang(targetLang);
    setShowLanguageModal(false);
    dispatch(setTargetLanguage(targetLang)); // from translationSlice
    dispatch(toggleTranslation());
    setShowTranslationOverlay(true);
  };

  return (
    <div className="fixed inset-0 z-50 bg-gray-900">
      <audio 
        ref={remoteAudioRef} 
        autoPlay 
        playsInline
        onCanPlay={() => {
          if (remoteAudioRef.current) {
            remoteAudioRef.current.muted = false;
            remoteAudioRef.current.volume = 1.0;
            remoteAudioRef.current.play().catch(console.warn);
          }
        }}
      />

      <div className="h-full flex flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between p-4 bg-black bg-opacity-50">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2 text-white">
              <AudioMonitor showVisualizer={true} />
              {type === "video" ? (
                <VideoCameraIcon className="h-5 w-5" />
              ) : (
                <PhoneIcon className="h-5 w-5" />
              )}
              <span className="font-medium">
                {type === "video" ? "Video Call" : "Voice Call"}
              </span>
            </div>

            <div className="text-sm text-gray-300">
              {formatDuration(callDuration)}
            </div>

            {isRecording && (
              <div className="flex items-center space-x-1 text-red-400">
                <StopCircleIcon className="h-4 w-4" />
                <span className="text-xs">Recording</span>
              </div>
            )}

            {translationEnabled && (
              <div className="flex items-center space-x-1 text-blue-400">
                <LanguageIcon className="h-4 w-4" />
                <span className="text-xs">Translation</span>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {isGroupCall && (
              <button
                onClick={() => setShowParticipants(!showParticipants)}
                className="flex items-center space-x-1 px-3 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-white"
              >
                <UserGroupIcon className="h-4 w-4" />
                <span className="text-sm">{activeParticipants.length}</span>
              </button>
            )}

            <button className="p-2 rounded-full hover:bg-gray-800">
              <EllipsisHorizontalIcon className="h-5 w-5 text-white" />
            </button>
          </div>
        </div>

        {/* Video content */}
        <div className="flex-1 relative">
          {/* Voice call view */}
          {type === "voice" && (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="mb-6">
                  {displayUser?.picture ? (
                    <img
                      src={displayUser.picture}
                      alt={displayUser.name || "Remote"}
                      className="mx-auto h-32 w-32 rounded-full object-cover"
                    />
                  ) : (
                    <div className="mx-auto h-32 w-32 rounded-full bg-gray-800 flex items-center justify-center">
                      <UserGroupIcon className="h-20 w-20 text-gray-600" />
                    </div>
                  )}
                </div>

                <h3 className="text-2xl font-bold text-white mb-2">
                  {isGroupCall
                    ? "Group Voice Call"
                    : displayUser?.name || "Unknown"}
                </h3>

                <p className="text-gray-300 mb-6">
                  {formatDuration(callDuration)}
                </p>
              </div>
            </div>
          )}

          {/* Video call view */}
          {type === "video" && (
            <div className="h-full grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
              {/* Remote video (main) */}
              <div className="relative w-full h-full bg-black rounded-lg overflow-hidden">
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
                {/* Fallback if no remote video */}
                {!remoteStreamRef.current && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                    <div className="text-center">
                      <UserGroupIcon className="h-20 w-20 text-gray-600 mx-auto mb-4" />
                      <p className="text-gray-400">
                        Waiting for participant...
                      </p>
                    </div>
                  </div>
                )}
                {remoteStreamRef.current && (
                  <div className="absolute bottom-2 left-2 text-white bg-black bg-opacity-50 px-2 py-1 rounded text-sm">
                    {displayUser?.name || "Remote"}
                  </div>
                )}
              </div>

              {/* Local video (pip) */}
              <div className="relative w-full h-64 md:h-full md:w-64 md:absolute md:bottom-4 md:right-4 bg-black rounded-lg overflow-hidden">
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
                {isVideoOff && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                    <VideoCameraSlashIcon className="h-12 w-12 text-gray-600" />
                  </div>
                )}
                <div className="absolute bottom-2 left-2 text-white bg-black bg-opacity-50 px-2 py-1 rounded text-sm">
                  You {isVideoOff && "(Video Off)"}
                </div>
              </div>
            </div>
          )}

          {/* Participants sidebar */}
          {showParticipants && (
            <div className="absolute top-0 right-0 h-full w-80 bg-gray-900 bg-opacity-95 backdrop-blur-sm border-l border-gray-800 p-4 overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-lg font-semibold text-white">
                  Participants
                </h4>
                <button
                  onClick={() => setShowParticipants(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-3">
                {activeParticipants.map((participant: CallParticipant) => {
                  const user = participant.userId;

                  return (
                    <div
                      key={participant.userId._id}
                      className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-800"
                    >
                      <div className="relative">
                        {user.picture ? (
                          <img
                            src={user.picture}
                            alt={user.name}
                            className="h-10 w-10 rounded-full"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-gray-700 flex items-center justify-center">
                            <UserGroupIcon className="h-5 w-5 text-gray-400" />
                          </div>
                        )}

                        <div className="absolute -bottom-1 -right-1 h-3 w-3 bg-green-500 rounded-full border-2 border-gray-900" />
                      </div>

                      <div className="flex-1">
                        <div className="text-white font-medium">
                          {user.name}
                          {user._id === initiator._id && (
                            <span className="ml-2 text-xs text-blue-400">
                              Host
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-gray-400">
                          {participant.isActive ? "Active" : "Inactive"}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Translation sidebar */}
          {translationEnabled && (
            <div className="absolute top-0 left-0 h-full w-80 bg-gray-900 bg-opacity-95 backdrop-blur-sm border-r border-gray-800 p-4 overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-lg font-semibold text-white">
                  Live Translation
                </h4>
                <button
                  onClick={handleToggleTranslation}
                  className="text-gray-400 hover:text-white"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>

              {/* Translation log */}
              <div className="mt-6">
                <h5 className="text-sm font-medium text-gray-300 mb-2">
                  Recent Translations
                </h5>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {currentTranslationSession?.segments
                    ?.slice(-5)
                    .map((segment, index) => (
                      <div key={index} className="p-2 bg-gray-800 rounded-lg">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-400">
                            {format(new Date(segment.timestamp), "HH:mm:ss")}
                          </span>
                          <span className="text-xs text-blue-400">
                            {Math.round(segment.confidence * 100)}%
                          </span>
                        </div>
                        <div className="text-sm text-white mb-1">
                          {segment.text}
                        </div>
                        <div className="text-sm text-green-400">
                          {segment.translatedText}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Call controls */}
        <div className="p-6 bg-black bg-opacity-50">
          <div className="flex items-center justify-center space-x-6">
            {/* Mute toggle */}
            <button
              onClick={handleToggleMute}
              className={`flex flex-col items-center ${isMuted ? "text-red-400" : "text-white"}`}
            >
              <div
                className={`h-14 w-14 rounded-full flex items-center justify-center mb-2 ${
                  isMuted
                    ? "bg-red-500 hover:bg-red-600"
                    : "bg-gray-700 hover:bg-gray-600"
                }`}
              >
                <MicrophoneIcon className="h-6 w-6" />
              </div>
              <span className="text-xs">{isMuted ? "Unmute" : "Mute"}</span>
            </button>

            {/* Video toggle */}
            {type === "video" && (
              <button
                onClick={handleToggleVideo}
                className={`flex flex-col items-center ${isVideoOff ? "text-red-400" : "text-white"}`}
              >
                <div
                  className={`h-14 w-14 rounded-full flex items-center justify-center mb-2 ${
                    isVideoOff
                      ? "bg-red-500 hover:bg-red-600"
                      : "bg-gray-700 hover:bg-gray-600"
                  }`}
                >
                  {isVideoOff ? (
                    <VideoCameraSlashIcon className="h-6 w-6" />
                  ) : (
                    <VideoCameraIcon className="h-6 w-6" />
                  )}
                </div>
                <span className="text-xs">
                  {isVideoOff ? "Turn On" : "Turn Off"}
                </span>
              </button>
            )}

            {/* Translation button */}
            <button
              onClick={handleToggleTranslation}
              className={`flex flex-col items-center ${
                translationEnabled ? "text-blue-400" : "text-white"
              }`}
            >
              <div
                className={`h-14 w-14 rounded-full flex items-center justify-center mb-2 ${
                  translationEnabled
                    ? "bg-blue-500 hover:bg-blue-600"
                    : "bg-gray-700 hover:bg-gray-600"
                }`}
              >
                <LanguageIcon className="h-6 w-6" />
              </div>
              <span className="text-xs">
                {translationEnabled ? "Translation ON" : "Translate"}
              </span>
            </button>

            {/* Screen share toggle */}
            <button
              onClick={handleToggleScreenShare}
              className={`flex flex-col items-center ${isScreenSharing ? "text-blue-400" : "text-white"}`}
            >
              <div
                className={`h-14 w-14 rounded-full flex items-center justify-center mb-2 ${
                  isScreenSharing
                    ? "bg-blue-500 hover:bg-blue-600"
                    : "bg-gray-700 hover:bg-gray-600"
                }`}
              >
                <ComputerDesktopIcon className="h-6 w-6" />
              </div>
              <span className="text-xs">
                {isScreenSharing ? "Stop Share" : "Share"}
              </span>
            </button>

            {/* End call button */}
            <button
              onClick={handleEndCall}
              className="flex flex-col items-center text-white"
            >
              <div className="h-14 w-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center mb-2">
                <PhoneIcon className="h-6 w-6 transform rotate-135" />
              </div>
              <span className="text-xs">End Call</span>
            </button>
          </div>
        </div>
      </div>

      {/* Language Selection Modal */}
      {showLanguageModal && (
        <div className="fixed inset-0 z-[60] bg-black bg-opacity-70 flex items-center justify-center">
          <div className="bg-gray-800 rounded-2xl p-6 w-80 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white text-lg font-semibold">Translate to...</h3>
              <button onClick={() => setShowLanguageModal(false)}>
                <XMarkIcon className="h-5 w-5 text-gray-400" />
              </button>
            </div>
            <p className="text-gray-400 text-sm mb-4">
              Your speech will be auto-detected and translated to the language you choose.
            </p>
            <div className="space-y-2">
              {LANGUAGES.map(lang => (
                <button
                  key={lang.code}
                  onClick={() => handleStartTranslationWithLang(lang.code)}
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl hover:bg-gray-700 transition-colors ${
                    selectedTargetLang === lang.code ? 'bg-blue-600' : 'bg-gray-700'
                  }`}
                >
                  <span className="text-2xl">{lang.flag}</span>
                  <span className="text-white font-medium">{lang.name}</span>
                  {selectedTargetLang === lang.code && (
                    <span className="ml-auto text-blue-300 text-xs">Selected</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Translation Overlay */}
      {showTranslationOverlay && activeCall && (
        <TranslationErrorBoundary>
          <LiveTranslationOverlay
            callId={activeCall.callId}
            participants={participants.map((p: CallParticipant) => ({
              userId: p.userId._id,
              name: p.userId.name,
              picture: p.userId.picture,
            }))}
            onClose={() => {
              setShowTranslationOverlay(false);
              dispatch(toggleTranslation());
            }}
          />
        </TranslationErrorBoundary>
      )}
    </div>
  );
};

export default CallScreen;