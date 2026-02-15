import React, { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../../app/store";
import { useCall } from "../../hooks/useCall";
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
import RealTimeTranslation from "../translation/RealTimeTranslation";
// ✅ FIXED: Import from translationSlice, not callSlice
import { toggleTranslation } from "../../features/translation/translationSlice";
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

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const currentUser = useSelector(selectCurrentUser);
  const { endCall, toggleMute, toggleVideo, toggleScreenShare } = useCall();

  // Get remote stream from Redux
  const activeCall: Call | null = useSelector(
    (state: RootState) => state.call?.activeCall || null,
  );
  const localStream = useSelector(
    (state: RootState) => state.call?.localStream || null,
  );
  const remoteStream = useSelector(
    (state: RootState) => state.call?.remoteStream || null,
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

  useEffect(() => {
    if (remoteStream && remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteStream;
      remoteAudioRef.current.muted = false;
      remoteAudioRef.current.volume = 1;

      remoteAudioRef.current.play().catch((err) => {
        console.error("Audio play failed:", err);
      });
    }
  }, [remoteStream]);

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

  // Attach remote stream to video element
  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

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

  // Set up local video stream
  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

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
    const newState = !translationEnabled;
    // ✅ FIXED: dispatch from translationSlice
    dispatch(toggleTranslation());

    if (newState) {
      setShowTranslationOverlay(true);
    } else {
      setShowTranslationOverlay(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-gray-900">
      <audio ref={remoteAudioRef} autoPlay playsInline />

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
                {!remoteStream && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                    <div className="text-center">
                      <UserGroupIcon className="h-20 w-20 text-gray-600 mx-auto mb-4" />
                      <p className="text-gray-400">
                        Waiting for participant...
                      </p>
                    </div>
                  </div>
                )}
                {remoteStream && (
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

              {/* <TranslationErrorBoundary>
                <RealTimeTranslation callId={activeCall._id} compact={false} />
              </TranslationErrorBoundary> */}

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
                  isMuted ? "bg-red-500 hover:bg-red-600" : "bg-gray-700 hover:bg-gray-600"
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
                    isVideoOff ? "bg-red-500 hover:bg-red-600" : "bg-gray-700 hover:bg-gray-600"
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
                  isScreenSharing ? "bg-blue-500 hover:bg-blue-600" : "bg-gray-700 hover:bg-gray-600"
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