# 1 - apiSlice

// src/app/apiSlice.ts
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { RootState } from './store';
import { setAccessToken, logout } from '../features/auth/authSlice';

const baseQuery = fetchBaseQuery({
  baseUrl: process.env.REACT_APP_API_URL || 'http://localhost:5000/api/v1',
  credentials: 'include',
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState).auth.accessToken;

    if (token) {
      headers.set('authorization', `Bearer ${token}`);
    }

    return headers;
  },
});

const baseQueryWithReauth = async (
  args: any,
  api: any,
  extraOptions: any
) => {
  let result = await baseQuery(args, api, extraOptions);

  if (result.error && result.error.status === 401) {
    // 🔁 Try refresh token
    const refreshResult = await baseQuery(
      { url: '/auth/refresh-token', method: 'POST' },
      api,
      extraOptions
    );

    if (refreshResult.data) {
      const { accessToken } = refreshResult.data as { accessToken: string };

      api.dispatch(setAccessToken(accessToken));

      // 🔁 Retry original request
      result = await baseQuery(args, api, extraOptions);
    } else {
      api.dispatch(logout());
    }
  }

  return result;
};

export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  tagTypes: [
    'User',
    'FriendRequest',
    'Chat',
    'Message',
    'Call',
    'Translation',
  ],
  endpoints: () => ({}),
});

# 2 - store.ts

// src/app/store.ts
import { configureStore, combineReducers } from '@reduxjs/toolkit';
import {
  persistStore,
  persistReducer,
  FLUSH,
  REHYDRATE,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
} from 'redux-persist';
import storage from 'redux-persist/lib/storage';

import authReducer from '../features/auth/authSlice';
import chatReducer from '../features/chat/chatSlice';
import callReducer from '../features/calls/callSlice';
import translationReducer from '../features/translation/translationSlice';
import { apiSlice } from './apiSlice';

// ✅ Persist only auth slice
const authPersistConfig = {
  key: 'auth',
  storage,
  whitelist: ['user', 'accessToken'],
};

const rootReducer = combineReducers({
  auth: persistReducer(authPersistConfig, authReducer),
  chat: chatReducer,
  call: callReducer,
  translation: translationReducer,
  [apiSlice.reducerPath]: apiSlice.reducer,
});

export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // ✅ ignore redux-persist actions
        ignoredActions: [
          FLUSH,
          REHYDRATE,
          PAUSE,
          PERSIST,
          PURGE,
          REGISTER,
        ],

        // ✅ ignore WebRTC-related state paths
        ignoredPaths: [
          'call.localStream',
          'call.remoteStreams',
          'call.peerConnections',
          'call.remoteStream',
        ],
      },
    }).concat(apiSlice.middleware),

  devTools: process.env.NODE_ENV !== 'production',
});

export const persistor = persistStore(store);

// Types
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

# 3 -AuthInput

import React, { forwardRef } from 'react';
import { ExclamationCircleIcon } from '@heroicons/react/24/outline';

interface AuthInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  icon?: React.ReactNode;
}

const AuthInput = forwardRef<HTMLInputElement, AuthInputProps>(
  ({ label, error, icon, className = '', ...props }, ref) => {
    return (
      <div className="space-y-2">
        <label className="block text-sm font-medium text-whatsapp-gray-700 dark:text-whatsapp-gray-300">
          {label}
        </label>
        <div className="relative">
          {icon && (
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <span className="text-whatsapp-gray-400">{icon}</span>
            </div>
          )}
          <input
            ref={ref}
            className={`
              w-full px-4 py-3 rounded-lg border transition-colors duration-200
              ${icon ? 'pl-10' : ''}
              ${
                error
                  ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
                  : 'border-whatsapp-gray-300 dark:border-whatsapp-gray-600 focus:ring-whatsapp-green-light focus:border-whatsapp-green-light'
              }
              bg-white dark:bg-whatsapp-gray-800
              text-whatsapp-text-light dark:text-whatsapp-text-dark
              focus:outline-none focus:ring-2
              ${className}
            `}
            {...props}
          />
          {error && (
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
              <ExclamationCircleIcon className="h-5 w-5 text-red-500" />
            </div>
          )}
        </div>
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>
    );
  }
);

AuthInput.displayName = 'AuthInput';

export default AuthInput;

# 5 - CallScreen

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
import { toggleTranslation } from "../../features/calls/callSlice";
import AudioMonitor from "../../utils/AudioMonitor";

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
  const [currentTranslationSession, setCurrentTranslationSession] =
    useState<TranslationSession | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const currentUser = useSelector(selectCurrentUser);
  const { endCall, toggleMute, toggleVideo, toggleScreenShare } = useCall();

  // ✅ Get remote stream from Redux
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
  const translationEnabled = useSelector(
    (state: RootState) => state.call?.translationEnabled || false,
  );

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

    // ✅ Correct: Use userId for comparison
    const others = activeCall.participants.filter(
      (p: CallParticipant) => p.userId._id !== currentUser?._id,
    );

    console.log("➡️ otherParticipants:", others);
  }, [activeCall, currentUser]);

  // ✅ Attach remote stream to video element
  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // ✅ Clear video when call ends
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

  // ✅ Set up local video stream
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

  // ✅ CORRECT: Filter using CallParticipant type
  const activeParticipants =
    participants?.filter((p: CallParticipant) => p.isActive) || [];

  const isGroupCall = activeParticipants.length > 2;

  // ✅ CORRECT: Compare userId (string) with currentUser._id (string)
  const otherParticipants = participants.filter(
    (p: CallParticipant) => p.userId._id !== currentUser?._id,
  );

  // ✅ CORRECT: Get display user from participant.user, NOT userId
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
    dispatch(toggleTranslation());
  };
  // Helper to safely get user display info
  // const getUserDisplayInfo = (participant: CallParticipant) => {
  //   // ✅ Use participant.user for display data
  //   if (participant.user) {
  //     return {
  //       id: participant.userId, // string ID for keys
  //       name: participant.user.name || "Unknown User",
  //       picture: participant.user.picture,
  //       isInitiator: participant.userId === initiator._id,
  //     };
  //   }

  // Fallback if user object not populated
  //   return {
  //     id: participant.userId,
  //     name: "Unknown User",
  //     picture: undefined,
  //     isInitiator: participant.userId._id === initiator._id,
  //   };
  // };

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
                      key={participant.userId._id} // ✅ Use userId (string) for key
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

              <RealTimeTranslation callId={activeCall._id} compact={false} />

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
                className={`h-14 w-14 rounded-full flex items-center justify-center mb-2 ${isMuted ? "bg-red-500 hover:bg-red-600" : "bg-gray-700 hover:bg-gray-600"}`}
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
                  className={`h-14 w-14 rounded-full flex items-center justify-center mb-2 ${isVideoOff ? "bg-red-500 hover:bg-red-600" : "bg-gray-700 hover:bg-gray-600"}`}
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

            {/* Screen share toggle */}
            <button
              onClick={handleToggleScreenShare}
              className={`flex flex-col items-center ${isScreenSharing ? "text-blue-400" : "text-white"}`}
            >
              <div
                className={`h-14 w-14 rounded-full flex items-center justify-center mb-2 ${isScreenSharing ? "bg-blue-500 hover:bg-blue-600" : "bg-gray-700 hover:bg-gray-600"}`}
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
    </div>
  );
};

export default CallScreen;


# 6 - IncomingCallModel

import React from 'react';
import { useSelector } from 'react-redux';
import { useCall } from '../../hooks/useCall';
import { selectIncomingCall } from '../../features/calls/callSlice';
import {
  PhoneIcon,
  PhoneXMarkIcon,
  VideoCameraIcon,
} from '@heroicons/react/24/outline';

const IncomingCallModal: React.FC = () => {
  const incomingCall = useSelector(selectIncomingCall);
  const { answerCall, rejectCall } = useCall();

  // 🔴 VERY IMPORTANT: modal renders ONLY when there is an incoming call
  if (!incomingCall) return null;

  const { initiator, type } = incomingCall;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 w-full max-w-sm shadow-2xl">
        <div className="text-center">
          {/* Caller Avatar */}
          <div className="mb-6">
            {initiator?.picture ? (
              <img
                src={initiator.picture}
                alt={initiator.name}
                className="w-24 h-24 rounded-full mx-auto mb-4 border-4 border-green-200"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-gray-200 mx-auto mb-4 flex items-center justify-center">
                <VideoCameraIcon className="h-12 w-12 text-gray-600" />
              </div>
            )}

            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
              {initiator?.name || 'Unknown User'}
            </h3>

            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {type === 'video'
                ? 'Incoming video call'
                : 'Incoming voice call'}
            </p>
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-center gap-10">
            {/* Reject */}
            <button
              onClick={() => rejectCall()}
              className="flex flex-col items-center"
            >
              <div className="h-16 w-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center mb-2">
                <PhoneXMarkIcon className="h-8 w-8 text-white" />
              </div>
              <span className="text-sm text-red-500 font-medium">
                Decline
              </span>
            </button>

            {/* Accept */}
            <button
              onClick={() => answerCall()}
              className="flex flex-col items-center"
            >
              <div className="h-16 w-16 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center mb-2">
                <PhoneIcon className="h-8 w-8 text-white" />
              </div>
              <span className="text-sm text-green-500 font-medium">
                Accept
              </span>
            </button>
          </div>

          {/* Call Type */}
          <div className="mt-6 flex items-center justify-center gap-2 text-gray-500 dark:text-gray-400">
            {type === 'video' ? (
              <VideoCameraIcon className="h-5 w-5" />
            ) : (
              <PhoneIcon className="h-5 w-5" />
            )}
            <span className="text-sm">
              {type === 'video' ? 'Video Call' : 'Voice Call'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IncomingCallModal;

# 7 - TranslationSetting

import React, { useState } from 'react';
import { useCall } from '../../hooks/useCall';
import {
  LanguageIcon,
  ArrowRightIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';

const SUPPORTED_LANGUAGES = [
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
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
];

interface TranslationSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

const TranslationSettings: React.FC<TranslationSettingsProps> = ({ isOpen, onClose }) => {
  const {
    translationEnabled,
    sourceLanguage,
    targetLanguage,
    toggleTranslation,
    updateTranslationLanguages,
  } = useCall();
  
  const [localSource, setLocalSource] = useState(sourceLanguage);
  const [localTarget, setLocalTarget] = useState(targetLanguage);
  
  if (!isOpen) return null;
  
  const handleSave = () => {
    updateTranslationLanguages(localSource, localTarget);
    onClose();
  };
  
  const getLanguageName = (code: string) => {
    const lang = SUPPORTED_LANGUAGES.find(l => l.code === code);
    return lang ? `${lang.name} (${lang.nativeName})` : code;
  };
  
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />
      
      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div 
          className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-3">
              <LanguageIcon className="h-6 w-6 text-blue-500" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Translation Settings
              </h3>
            </div>
            
            {/* Toggle switch */}
            <div className="flex items-center">
              <span className="mr-3 text-sm text-gray-600 dark:text-gray-400">
                {translationEnabled ? 'On' : 'Off'}
              </span>
              <button
                onClick={toggleTranslation}
                className={`
                  relative inline-flex h-6 w-11 items-center rounded-full
                  ${translationEnabled ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}
                `}
              >
                <span className={`
                  inline-block h-4 w-4 transform rounded-full bg-white transition
                  ${translationEnabled ? 'translate-x-6' : 'translate-x-1'}
                `} />
              </button>
            </div>
          </div>
          
          {/* Content */}
          <div className="p-6">
            {translationEnabled ? (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Translate From
                  </label>
                  <div className="space-y-2">
                    {SUPPORTED_LANGUAGES.map((language) => (
                      <button
                        key={`source-${language.code}`}
                        onClick={() => setLocalSource(language.code)}
                        className={`
                          flex items-center justify-between w-full px-4 py-3 rounded-lg
                          transition-colors duration-200
                          ${localSource === language.code
                            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300'
                            : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                          }
                        `}
                      >
                        <div className="text-left">
                          <div className="font-medium">{language.name}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {language.nativeName}
                          </div>
                        </div>
                        {localSource === language.code && (
                          <CheckIcon className="h-5 w-5 text-blue-500" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Translate To
                  </label>
                  <div className="space-y-2">
                    {SUPPORTED_LANGUAGES.map((language) => (
                      <button
                        key={`target-${language.code}`}
                        onClick={() => setLocalTarget(language.code)}
                        className={`
                          flex items-center justify-between w-full px-4 py-3 rounded-lg
                          transition-colors duration-200
                          ${localTarget === language.code
                            ? 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-300'
                            : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                          }
                        `}
                      >
                        <div className="text-left">
                          <div className="font-medium">{language.name}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {language.nativeName}
                          </div>
                        </div>
                        {localTarget === language.code && (
                          <CheckIcon className="h-5 w-5 text-green-500" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                
                {/* Preview */}
                <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    Translation Preview
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm text-gray-900 dark:text-gray-100">
                      <span className="font-medium">Original:</span> Hello, how are you?
                    </div>
                    <div className="flex items-center text-gray-500">
                      <ArrowRightIcon className="h-4 w-4 mr-2" />
                      <span className="text-sm">
                        {getLanguageName(localSource)} → {getLanguageName(localTarget)}
                      </span>
                    </div>
                    <div className="text-sm text-gray-900 dark:text-gray-100">
                      <span className="font-medium">Translated:</span> Hola, ¿cómo estás?
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <LanguageIcon className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  Translation is Off
                </h4>
                <p className="text-gray-600 dark:text-gray-400">
                  Enable translation to automatically translate speech during calls.
                  This feature supports real-time translation between multiple languages.
                </p>
              </div>
            )}
          </div>
          
          {/* Footer */}
          <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            
            <div className="flex items-center space-x-3">
              {translationEnabled && (
                <button
                  onClick={handleSave}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                >
                  Save Settings
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TranslationSettings;

# 8 - ChatList

import React from 'react';
import { useSelector } from 'react-redux';
import { useChat } from '../../hooks/useChat';
import { selectChats } from '../../features/chat/chatSlice';
import { Chat } from '../../features/chat/chatApi';
import {
  UserGroupIcon,
  UserCircleIcon,
  ChatBubbleLeftIcon,
  CheckIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { formatDistanceToNow } from 'date-fns';

interface ChatListProps {
  onSelectChat: (chat: Chat) => void;
  searchQuery?: string;
}

const ChatList: React.FC<ChatListProps> = ({ onSelectChat, searchQuery = '' }) => {
  const { chats } = useChat();
  const { getUnreadCount } = useChat();
  
  const filteredChats = chats.filter(chat => {
    if (!searchQuery.trim()) return true;
    
    const searchLower = searchQuery.toLowerCase();
    
    if (chat.isGroup) {
      return chat.groupName?.toLowerCase().includes(searchLower) ||
        chat.groupDescription?.toLowerCase().includes(searchLower);
    } else {
      const otherParticipant = chat.participants.find(p => 
        p._id !== localStorage.getItem('userId')
      );
      return otherParticipant?.name.toLowerCase().includes(searchLower) ||
        otherParticipant?.email.toLowerCase().includes(searchLower);
    }
  });
  
  const getChatName = (chat: Chat): string => {
    if (chat.isGroup) {
      return chat.groupName || 'Group Chat';
    }
    
    const otherParticipant = chat.participants.find(p => 
      p._id !== localStorage.getItem('userId')
    );
    return otherParticipant?.name || 'Unknown User';
  };
  
  const getChatPhoto = (chat: Chat): string => {
    if (chat.isGroup) {
      return chat.groupPhoto || '';
    }
    
    const otherParticipant = chat.participants.find(p => 
      p._id !== localStorage.getItem('userId')
    );
    return otherParticipant?.picture || '';
  };
  
  const getLastMessagePreview = (chat: Chat): string => {
    if (!chat.lastMessage) return 'No messages yet';
    
    if (chat.lastMessage.deleted) {
      return 'This message was deleted';
    }
    
    if (chat.lastMessage.type === 'image') {
      return '📷 Photo';
    } else if (chat.lastMessage.type === 'video') {
      return '🎥 Video';
    } else if (chat.lastMessage.type === 'audio') {
      return '🎵 Audio';
    } else if (chat.lastMessage.type === 'file') {
      return '📎 File';
    } else if (chat.lastMessage.type === 'location') {
      return '📍 Location';
    }
    
    return chat.lastMessage.content || '';
  };
  
  const getLastMessageTime = (chat: Chat): string => {
    if (!chat.lastMessageAt) return '';
    return formatDistanceToNow(new Date(chat.lastMessageAt), { addSuffix: true });
  };
  
  const getMessageStatus = (chat: Chat, userId: string) => {
    if (!chat.lastMessage) return null;
    
    if (chat.lastMessage.sender._id === userId) {
      const allRead = chat.participants
        .filter(p => p._id !== userId)
        .every(p => chat.lastMessage?.readBy.includes(p._id));
      
      if (allRead) {
        return <CheckIcon className="h-4 w-4 text-blue-500" />;
      }
      
      const someRead = chat.participants
        .filter(p => p._id !== userId)
        .some(p => chat.lastMessage?.readBy.includes(p._id));
      
      if (someRead) {
        return <CheckIcon className="h-4 w-4 text-gray-400" />;
      }
      
      return <ClockIcon className="h-4 w-4 text-gray-400" />;
    }
    
    return null;
  };
  
  return (
    <div className="h-full overflow-y-auto">
      {filteredChats.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
          <ChatBubbleLeftIcon className="h-16 w-16 text-gray-300 dark:text-gray-600 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
            No chats yet
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Start a conversation by searching for users or creating a group.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {filteredChats.map((chat) => {
            const userId = localStorage.getItem('userId');
            const unreadCount = getUnreadCount(chat._id);
            const isUnread = unreadCount > 0;
            
            return (
              <div
                key={chat._id}
                onClick={() => onSelectChat(chat)}
                className={`
                  flex items-center p-4 cursor-pointer transition-colors duration-150
                  hover:bg-gray-50 dark:hover:bg-gray-800
                  ${isUnread ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
                `}
              >
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-300 dark:bg-gray-700">
                    {getChatPhoto(chat) ? (
                      <img
                        src={getChatPhoto(chat)}
                        alt={getChatName(chat)}
                        className="w-full h-full object-cover"
                      />
                    ) : chat.isGroup ? (
                      <div className="w-full h-full flex items-center justify-center">
                        <UserGroupIcon className="h-6 w-6 text-gray-500 dark:text-gray-400" />
                      </div>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <UserCircleIcon className="h-6 w-6 text-gray-500 dark:text-gray-400" />
                      </div>
                    )}
                  </div>
                  
                  {/* Online indicator */}
                  {!chat.isGroup && chat.participants.some(p => 
                    p._id !== userId && p.isOnline
                  ) && (
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-gray-800" />
                  )}
                </div>
                
                {/* Chat info */}
                <div className="ml-4 flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className={`
                      text-sm font-medium truncate
                      ${isUnread 
                        ? 'text-gray-900 dark:text-gray-100' 
                        : 'text-gray-700 dark:text-gray-300'
                      }
                    `}>
                      {getChatName(chat)}
                    </h3>
                    <div className="flex items-center space-x-1">
                      {getMessageStatus(chat, userId || '')}
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {getLastMessageTime(chat)}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between mt-1">
                    <p className={`
                      text-sm truncate
                      ${isUnread 
                        ? 'text-gray-900 dark:text-gray-100 font-medium' 
                        : 'text-gray-500 dark:text-gray-400'
                      }
                    `}>
                      {getLastMessagePreview(chat)}
                    </p>
                    
                    {unreadCount > 0 && (
                      <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-blue-600 rounded-full">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </div>
                  
                  {/* Typing indicator */}
                  {chat.typing && chat.typing.length > 0 && (
                    <div className="mt-1">
                      <div className="flex items-center">
                        <div className="flex space-x-1">
                          <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                          <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                          <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                        </div>
                        <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                          {chat.typing[0].user?.name || 'Someone'} is typing...
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ChatList;

# 9 - MessageInput

import React, { useState, useRef, useEffect } from 'react';
import { useChat } from '../../hooks/useChat';
import {
  PaperClipIcon,
  PhotoIcon,
  VideoCameraIcon,
  MicrophoneIcon,
  MapPinIcon,
  FaceSmileIcon,
  PaperAirplaneIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';

interface MessageInputProps {
  chatId: string;
  onSend?: (message: string) => void;
}

const MessageInput: React.FC<MessageInputProps> = ({ chatId, onSend }) => {
  const { sendMessage, startTyping, stopTyping } = useChat();
  
  const [message, setMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  
  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);
  
  // Typing indicators
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    
    // Start typing indicator
    startTyping();
    
    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Stop typing after 2 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      stopTyping();
    }, 2000);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };
  
  const handleSend = () => {
    if (message.trim()) {
      sendMessage(message.trim());
      setMessage('');
      stopTyping();
      
      if (onSend) {
        onSend(message.trim());
      }
    }
  };
  
  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setMessage(prev => prev + emojiData.emoji);
    setShowEmojiPicker(false);
  };
  
  const handleFileSelect = (type: 'image' | 'video' | 'audio' | 'file') => {
    if (fileInputRef.current) {
      fileInputRef.current.accept = type === 'image' 
        ? 'image/*' 
        : type === 'video' 
          ? 'video/*'
          : type === 'audio'
            ? 'audio/*'
            : '*';
      fileInputRef.current.click();
    }
    setShowAttachmentMenu(false);
  };
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Determine file type
      let type: 'image' | 'video' | 'audio' | 'file' = 'file';
      
      if (file.type.startsWith('image/')) {
        type = 'image';
      } else if (file.type.startsWith('video/')) {
        type = 'video';
      } else if (file.type.startsWith('audio/')) {
        type = 'audio';
      }
      
      // In a real app, upload file here
      // For now, just send as text with file info
      sendMessage(`Sent a ${type}: ${file.name}`, {
        type,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      });
    }
    
    // Clear input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  const startVoiceRecording = () => {
    // Implement voice recording
    setIsRecording(true);
  };
  
  const stopVoiceRecording = () => {
    setIsRecording(false);
    // Send recorded audio
  };
  
  const sendLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          sendMessage('', {
            type: 'location',
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            locationName: 'My Location',
          });
        },
        (error) => {
          console.error('Error getting location:', error);
        }
      );
    }
  };
  
  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      {/* Attachment menu */}
      {showAttachmentMenu && (
        <div className="absolute bottom-full left-4 mb-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-2">
          <div className="grid grid-cols-4 gap-2">
            <button
              onClick={() => handleFileSelect('image')}
              className="flex flex-col items-center p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mb-2">
                <PhotoIcon className="h-5 w-5 text-blue-600 dark:text-blue-300" />
              </div>
              <span className="text-xs">Photo</span>
            </button>
            
            <button
              onClick={() => handleFileSelect('video')}
              className="flex flex-col items-center p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center mb-2">
                <VideoCameraIcon className="h-5 w-5 text-purple-600 dark:text-purple-300" />
              </div>
              <span className="text-xs">Video</span>
            </button>
            
            <button
              onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
              className="flex flex-col items-center p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <div className={`
                w-10 h-10 rounded-full flex items-center justify-center mb-2
                ${isRecording 
                  ? 'bg-red-100 dark:bg-red-900 animate-pulse' 
                  : 'bg-green-100 dark:bg-green-900'
                }
              `}>
                <MicrophoneIcon className={`h-5 w-5 ${
                  isRecording 
                    ? 'text-red-600 dark:text-red-300' 
                    : 'text-green-600 dark:text-green-300'
                }`} />
              </div>
              <span className="text-xs">{isRecording ? 'Stop' : 'Audio'}</span>
            </button>
            
            <button
              onClick={sendLocation}
              className="flex flex-col items-center p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <div className="w-10 h-10 bg-yellow-100 dark:bg-yellow-900 rounded-full flex items-center justify-center mb-2">
                <MapPinIcon className="h-5 w-5 text-yellow-600 dark:text-yellow-300" />
              </div>
              <span className="text-xs">Location</span>
            </button>
            
            <button
              onClick={() => handleFileSelect('file')}
              className="flex flex-col items-center p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-2">
                <PaperClipIcon className="h-5 w-5 text-gray-600 dark:text-gray-300" />
              </div>
              <span className="text-xs">File</span>
            </button>
          </div>
        </div>
      )}
      
      {/* Emoji picker */}
      {showEmojiPicker && (
        <div className="absolute bottom-full right-4 mb-2">
          <EmojiPicker
            onEmojiClick={handleEmojiClick}
            autoFocusSearch={false}
            height={350}
            width={300}
          />
        </div>
      )}
      
      <div className="flex items-end space-x-2">
        {/* Attachment button */}
        <div className="relative">
          <button
            onClick={() => setShowAttachmentMenu(!showAttachmentMenu)}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <PaperClipIcon className="h-6 w-6 text-gray-500 dark:text-gray-400" />
          </button>
        </div>
        
        {/* Message input */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            className="
              w-full px-4 py-3 pr-12
              bg-gray-100 dark:bg-gray-700
              border border-transparent
              rounded-full
              focus:outline-none focus:ring-2 focus:ring-blue-500
              resize-none overflow-hidden
              placeholder-gray-500 dark:placeholder-gray-400
            "
            style={{ maxHeight: '120px' }}
          />
          
          {/* Emoji button inside input */}
          <button
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="absolute right-4 top-1/2 transform -translate-y-1/2 p-1"
          >
            <FaceSmileIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>
        
        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!message.trim()}
          className={`
            p-3 rounded-full transition-colors duration-200
            ${message.trim()
              ? 'bg-blue-500 hover:bg-blue-600 text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
            }
          `}
        >
          <PaperAirplaneIcon className="h-5 w-5" />
        </button>
      </div>
      
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileChange}
      />
      
      {/* Close menus when clicking outside */}
      {(showAttachmentMenu || showEmojiPicker) && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => {
            setShowAttachmentMenu(false);
            setShowEmojiPicker(false);
          }}
        />
      )}
    </div>
  );
};

export default MessageInput;

# 10 - MessageItem

import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { Message } from '../../features/chat/chatApi';
import { selectCurrentUser } from '../../features/auth/authSlice';
import { useChat } from '../../hooks/useChat';
import {
  CheckIcon,
  CheckCircleIcon,
  PaperClipIcon,
  PhotoIcon,
  VideoCameraIcon,
  MicrophoneIcon,
  MapPinIcon,
  TrashIcon,
  ArrowUturnLeftIcon,
  ArrowUpTrayIcon,
  FaceSmileIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';

interface MessageItemProps {
  message: Message;
  showDate?: boolean;
}

const MessageItem: React.FC<MessageItemProps> = ({
  message,
  showDate = false,
}) => {
  const currentUser = useSelector(selectCurrentUser);
  const { addReaction, removeReaction, deleteMessage } = useChat();

  const [showReactions, setShowReactions] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const isSentByMe = message.sender._id === currentUser?._id;
  const isDeleted = message.deleted;
  const hasReactions = message.reactions && message.reactions.length > 0;

  const commonReactions = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

  const handleReactionClick = (emoji: string) => {
    const existingReaction = message.reactions.find(
      (r) => r.userId === currentUser?._id && r.emoji === emoji,
    );

    if (existingReaction) {
      removeReaction(message._id);
    } else {
      addReaction(message._id, emoji);
    }

    setShowReactions(false);
  };

  const handleDelete = () => {
    if (window.confirm("Are you sure you want to delete this message?")) {
      deleteMessage(message._id);
    }
    setShowMenu(false);
  };

  const handleReply = () => {
    // Implement reply logic
    setShowMenu(false);
  };

  const handleForward = () => {
    // Implement forward logic
    setShowMenu(false);
  };

  const renderMessageContent = () => {
    if (isDeleted) {
      return (
        <div className="italic text-gray-500 dark:text-gray-400">
          This message was deleted
        </div>
      );
    }

    switch (message.type) {
      case "image":
        return (
          <div className="space-y-2">
            <div className="relative rounded-lg overflow-hidden">
              <img
                src={message.fileUrl || message.thumbnail}
                alt={message.fileName || "Image"}
                className="max-w-xs md:max-w-sm lg:max-w-md rounded-lg"
              />
              {message.content && (
                <div className="mt-2 text-sm">{message.content}</div>
              )}
            </div>
          </div>
        );

      case "video":
        return (
          <div className="space-y-2">
            <div className="relative rounded-lg overflow-hidden">
              <video
                src={message.fileUrl}
                controls
                className="max-w-xs md:max-w-sm lg:max-w-md rounded-lg"
              />
              {message.content && (
                <div className="mt-2 text-sm">{message.content}</div>
              )}
            </div>
          </div>
        );

      case "audio":
        return (
          <div className="space-y-2">
            <div className="flex items-center space-x-2 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
              <MicrophoneIcon className="h-5 w-5 text-gray-500" />
              <audio src={message.fileUrl} controls className="flex-1" />
            </div>
            {message.content && (
              <div className="mt-2 text-sm">{message.content}</div>
            )}
          </div>
        );

      case "file":
        return (
          <div className="space-y-2">
            <a
              href={message.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-3 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              <PaperClipIcon className="h-6 w-6 text-gray-500" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {message.fileName}
                </p>
                {message.fileSize && (
                  <p className="text-xs text-gray-500">
                    {(message.fileSize / 1024 / 1024).toFixed(2)} MB
                  </p>
                )}
              </div>
            </a>
            {message.content && (
              <div className="mt-2 text-sm">{message.content}</div>
            )}
          </div>
        );

      case "location":
        return (
          <div className="space-y-2">
            <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <MapPinIcon className="h-5 w-5 text-gray-500" />
                <span className="font-medium">
                  {message.locationName || "Location"}
                </span>
              </div>
              {message.latitude && message.longitude && (
                <a
                  href={`https://maps.google.com/?q=${message.latitude},${message.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-500 hover:text-blue-600"
                >
                  View on Google Maps
                </a>
              )}
            </div>
            {message.content && (
              <div className="mt-2 text-sm">{message.content}</div>
            )}
          </div>
        );

      default: // text
        return (
          <div className="text-sm whitespace-pre-wrap break-words">
            {message.content}
          </div>
        );
    }
  };

  const renderMessageStatus = () => {
    if (!isSentByMe) return null;

    const allRead = message.readBy.length > 1;
    const delivered = true;

    return (
      <div className="flex items-center space-x-1 ml-2">
        {allRead ? (
          <CheckCircleIcon className="h-4 w-4 text-blue-500" />
        ) : delivered ? (
          <CheckIcon className="h-4 w-4 text-gray-400" />
        ) : (
          <ClockIcon className="h-4 w-4 text-gray-400" />
        )}
      </div>
    );
  };

  const renderReactions = () => {
    if (!hasReactions) return null;

    const reactionGroups: Record<string, number> = {};
    message.reactions.forEach((reaction) => {
      reactionGroups[reaction.emoji] =
        (reactionGroups[reaction.emoji] || 0) + 1;
    });

    return (
      <div className="flex flex-wrap gap-1 mt-2">
        {Object.entries(reactionGroups).map(([emoji, count]) => (
          <button
            key={emoji}
            onClick={() => handleReactionClick(emoji)}
            className={`
              flex items-center space-x-1 px-2 py-1 rounded-full text-xs
              ${
                message.reactions.some(
                  (r) => r.userId === currentUser?._id && r.emoji === emoji,
                )
                  ? "bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
              }
            `}
          >
            <span>{emoji}</span>
            <span>{count}</span>
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="group relative">
      {/* Date separator */}
      {showDate && message.createdAt && (
        <div className="flex justify-center my-4">
          <div className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded-full text-xs text-gray-600 dark:text-gray-300">
            {format(new Date(message.createdAt), "MMMM d, yyyy")}
          </div>
        </div>
      )}

      <div className={`flex ${isSentByMe ? "justify-end" : "justify-start"}`}>
        <div className="max-w-[70%] md:max-w-[60%]">
          {/* Reply to message */}
          {message.replyTo && !message.replyTo.deleted && (
            <div
              className={`
              mb-2 p-2 rounded-lg border-l-4
              ${
                isSentByMe
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                  : "border-gray-400 bg-gray-100 dark:bg-gray-800"
              }
            `}
            >
              <div className="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400">
                <ArrowUturnLeftIcon className="h-3 w-3" />
                <span className="font-medium">
                  {message.replyTo.sender._id === currentUser?._id
                    ? "You"
                    : message.replyTo.sender.name}
                </span>
              </div>
              <p className="text-sm truncate">
                {message.replyTo.type === "text"
                  ? message.replyTo.content
                  : `Sent a ${message.replyTo.type}`}
              </p>
            </div>
          )}

          {/* Forwarded indicator */}
          {message.forwarded && (
            <div className="flex items-center space-x-1 mb-1 text-xs text-gray-500 dark:text-gray-400">
              <ArrowUpTrayIcon className="h-3 w-3" />
              <span>Forwarded</span>
            </div>
          )}

          {/* Message bubble */}
          <div className="relative">
            <div
              className={`
                rounded-2xl px-4 py-2
                ${
                  isSentByMe
                    ? "bg-blue-500 text-white rounded-tr-none"
                    : "bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-tl-none"
                }
                ${isDeleted ? "opacity-75" : ""}
              `}
              onContextMenu={(e) => {
                e.preventDefault();
                setShowMenu(true);
              }}
            >
              {/* Sender name for group chats */}
              {!isSentByMe && message.sender && (
                <div className="mb-1">
                  <span className="text-xs font-medium">
                    {message.sender.name}
                  </span>
                </div>
              )}

              {/* Message content */}
              {renderMessageContent()}

              {/* Message metadata */}
              <div
                className={`
                flex items-center justify-end mt-1 text-xs
                ${isSentByMe ? "text-blue-200" : "text-gray-500 dark:text-gray-400"}
              `}
              >
                <span>{format(new Date(message.createdAt), "HH:mm")}</span>
                {renderMessageStatus()}
              </div>
            </div>

            {/* Message actions menu */}
            {showMenu && (
              <div className="absolute z-10 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
                <div className="py-1">
                  <button
                    onClick={handleReply}
                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <ArrowUturnLeftIcon className="h-4 w-4 mr-2" />
                    Reply
                  </button>
                  <button
                    onClick={handleForward}
                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <ArrowUpTrayIcon className="h-4 w-4 mr-2" />
                    Forward
                  </button>
                  {isSentByMe && (
                    <button
                      onClick={handleDelete}
                      className="flex items-center w-full px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <TrashIcon className="h-4 w-4 mr-2" />
                      Delete
                    </button>
                  )}
                  <button
                    onClick={() => setShowReactions(!showReactions)}
                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <FaceSmileIcon className="h-4 w-4 mr-2" />
                    React
                  </button>
                </div>
              </div>
            )}

            {/* Reaction picker */}
            {showReactions && (
              <div className="absolute bottom-full left-0 mb-2 bg-white dark:bg-gray-800 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 p-2">
                <div className="flex space-x-2">
                  {commonReactions.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => handleReactionClick(emoji)}
                      className="text-xl hover:scale-125 transition-transform"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Reactions below message */}
          {renderReactions()}
        </div>
      </div>

      {/* Close menus when clicking outside */}
      {(showMenu || showReactions) && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => {
            setShowMenu(false);
            setShowReactions(false);
          }}
        />
      )}
    </div>
  );
};

export default MessageItem;

# 11 - NewChatModel

import React, { useState, useEffect } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { Fragment } from "react";
import { useGetAllUsersQuery } from "../../features/users/userApi";
import { useGetContactsQuery } from "../../features/users/userApi";
import { useGetOrCreateChatMutation } from "../../features/chat/chatApi";
import {
  useGetFriendshipStatusQuery,
  useSendFriendRequestMutation,
  useAcceptFriendRequestMutation,
  useRejectFriendRequestMutation,
  useGetSentRequestsQuery,
  useGetReceivedRequestsQuery,
} from "../../features/users/friendRequestApi";

import { useDispatch, useSelector } from "react-redux"; // ADD useSelector
import { setActiveChat, addChat } from "../../features/chat/chatSlice";
import { selectCurrentUser } from "../../features/auth/authSlice"; // ADD this import
import {
  UserPlusIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  UserCircleIcon,
  CheckIcon,
  XMarkIcon as XIcon,
  ClockIcon,
  EnvelopeIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { User } from "../../features/auth/authApi";

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface FriendRequest {
  _id: string;
  from: User;
  to: User;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
  updatedAt: string;
}

const NewChatModal: React.FC<NewChatModalProps> = ({ isOpen, onClose }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTab, setSelectedTab] = useState<
    "users" | "contacts" | "requests"
  >("users");

  // Get current user from Redux
  const user = useSelector(selectCurrentUser); // ADD THIS LINE

  // Get all users - FIXED: using correct query
  const {
    data: usersData,
    isLoading: isLoadingUsers,
    refetch: refetchUsers,
  } = useGetAllUsersQuery({});
  const {
    data: contactsData,
    isLoading: isLoadingContacts,
    refetch: refetchContacts,
  } = useGetContactsQuery();

  // Friend request queries
  const {
    data: sentRequestsData,
    isLoading: isLoadingSentRequests,
    refetch: refetchSentRequests,
  } = useGetSentRequestsQuery();
  const {
    data: receivedRequestsData,
    isLoading: isLoadingReceivedRequests,
    refetch: refetchReceivedRequests,
  } = useGetReceivedRequestsQuery();

  // Friend request mutations
  const [sendFriendRequest] = useSendFriendRequestMutation();
  // const [cancelFriendRequest] = useCancelFriendRequestMutation();
  const [acceptFriendRequest] = useAcceptFriendRequestMutation();
  const [rejectFriendRequest] = useRejectFriendRequestMutation();
  const [getOrCreateChat] = useGetOrCreateChatMutation();

  const dispatch = useDispatch();

  // Debug logging
  useEffect(() => {
    if (isOpen) {
      console.log("Users Data:", usersData);
      console.log("Contacts Data:", contactsData);
      console.log("Current User:", user); // ADD THIS
    }
  }, [isOpen, usersData, contactsData, user]);

  // Refresh data when modal opens
  useEffect(() => {
    if (isOpen) {
      refetchUsers();
      refetchContacts();
      refetchSentRequests();
      refetchReceivedRequests();
    }
  }, [
    isOpen,
    refetchUsers,
    refetchContacts,
    refetchSentRequests,
    refetchReceivedRequests,
  ]);

  // Filter users - FIXED: using correct data structure
  const usersList = usersData?.data?.users || [];
  const filteredUsers = usersList.filter(
    (userItem: User) =>
      userItem?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      userItem?.email?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Filter contacts
  const contactsList = contactsData?.data?.contacts || [];
  const filteredContacts = contactsList.filter(
    (contact: User) =>
      contact?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact?.email?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Extract requests from responses
  const sentRequests = sentRequestsData?.data?.requests || [];
  const receivedRequests = receivedRequestsData?.data?.requests || [];

  // Filter sent requests based on search
  const filteredSentRequests = sentRequests.filter(
    (request: FriendRequest) =>
      request.to?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      request.to?.email?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Filter received requests based on search
  const filteredReceivedRequests = receivedRequests.filter(
    (request: FriendRequest) =>
      request.from?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      request.from?.email?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleSendFriendRequest = async (toUserId: string) => {
    if (toUserId === user?._id) {
      toast.error("You cannot send friend request to yourself");
      return;
    }

    try {
      await sendFriendRequest({ toUserId }).unwrap();
      toast.success("Friend request sent!");
      refetchSentRequests();
    } catch (error: any) {
      toast.error(error?.data?.message || "Failed to send friend request");
    }
  };

  const handleAcceptFriendRequest = async (requestId: string) => {
    try {
      const result = await acceptFriendRequest(requestId).unwrap();
      if (result.success) {
        toast.success("Friend request accepted!");
        refetchReceivedRequests();
        refetchContacts();
      } else {
        toast.error("Failed to accept friend request");
      }
    } catch (error: any) {
      toast.error(error?.data?.message || "Failed to accept friend request");
    }
  };

  const handleRejectFriendRequest = async (requestId: string) => {
    try {
      const result = await rejectFriendRequest(requestId).unwrap();
      if (result.success) {
        toast.success("Friend request rejected");
        refetchReceivedRequests();
      } else {
        toast.error("Failed to reject friend request");
      }
    } catch (error: any) {
      toast.error(error?.data?.message || "Failed to reject friend request");
    }
  };

  const handleStartChat = async (userId: string) => {
    try {
      const result = await getOrCreateChat(userId).unwrap();
      dispatch(addChat(result.data.chat));
dispatch(setActiveChat(result.data.chat));

      onClose();
      toast.success("Chat started!");
    } catch (error: any) {
      const errorMessage = error?.data?.message || "Failed to start chat";
      toast.error(errorMessage);
    }
  };

  // Friendship status component for each user
  const FriendshipStatus = ({ userId }: { userId: string }) => {
    const { data, isLoading } = useGetFriendshipStatusQuery(userId, {
      skip: !userId,
    });

    if (isLoading) {
      return <div className="h-8 w-24 bg-gray-200 rounded animate-pulse" />;
    }

    const friendship = data?.data?.status;

    // No relationship
    if (!friendship || friendship.status === "none") {
      return (
        <button
          onClick={() => handleSendFriendRequest(userId)}
          className="px-3 py-1 bg-whatsapp-green-light text-white text-sm rounded-lg hover:bg-whatsapp-green-dark"
        >
          Add Friend
        </button>
      );
    }

    switch (friendship.status) {
      case "friends":
        return (
          <button
            onClick={() => handleStartChat(userId)}
            className="px-3 py-1 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600"
          >
            Message
          </button>
        );

      case "pending_sent":
        return (
          <button className="px-3 py-1 bg-yellow-100 text-yellow-700 text-sm rounded-lg">
            Request Sent
          </button>
        );

      case "pending_received":
        return (
          <div className="flex gap-2">
            <button
              onClick={() =>
                friendship.requestId &&
                handleAcceptFriendRequest(friendship.requestId)
              }
              className="px-3 py-1 bg-green-500 text-white text-sm rounded-lg"
            >
              Accept
            </button>

            <button
              onClick={() =>
                friendship.requestId &&
                handleRejectFriendRequest(friendship.requestId)
              }
              className="px-3 py-1 bg-red-500 text-white text-sm rounded-lg"
            >
              Reject
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  const renderUserItem = (userItem: User) => (
    <div
      key={userItem._id}
      className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg"
    >
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-300 dark:bg-gray-600">
          {userItem.picture ? (
            <img
              src={userItem.picture}
              alt={userItem.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <UserCircleIcon className="h-6 w-6 text-gray-500 dark:text-gray-400" />
            </div>
          )}
        </div>
        <div>
          <p className="font-medium text-gray-900 dark:text-white">
            {userItem.name}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {userItem.email}
          </p>
          <p className="text-xs">
            {userItem.isOnline ? (
              <span className="text-green-500">Online</span>
            ) : (
              <span className="text-gray-400">Offline</span>
            )}
          </p>
        </div>
      </div>
      <FriendshipStatus userId={userItem._id} />
    </div>
  );

  const renderContactItem = (contact: User) => (
    <div
      key={contact._id}
      className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg cursor-pointer"
      onClick={() => handleStartChat(contact._id)}
    >
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-300 dark:bg-gray-600">
          {contact.picture ? (
            <img
              src={contact.picture}
              alt={contact.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <UserCircleIcon className="h-6 w-6 text-gray-500 dark:text-gray-400" />
            </div>
          )}
        </div>
        <div>
          <p className="font-medium text-gray-900 dark:text-white">
            {contact.name}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {contact.email}
          </p>
          <p className="text-xs">
            {contact.isOnline ? (
              <span className="text-green-500">Online</span>
            ) : (
              <span className="text-gray-400">Offline</span>
            )}
          </p>
        </div>
      </div>
      <button
        className="px-3 py-1 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600"
        onClick={(e) => {
          e.stopPropagation();
          handleStartChat(contact._id);
        }}
      >
        Message
      </button>
    </div>
  );

  const renderSentRequestItem = (request: FriendRequest) => (
    <div
      key={request._id}
      className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg"
    >
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-300 dark:bg-gray-600">
          {request.to?.picture ? (
            <img
              src={request.to.picture}
              alt={request.to.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <UserCircleIcon className="h-6 w-6 text-gray-500 dark:text-gray-400" />
            </div>
          )}
        </div>
        <div>
          <p className="font-medium text-gray-900 dark:text-white">
            {request.to?.name}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {request.to?.email}
          </p>
          <p className="text-xs text-yellow-600">
            Sent {new Date(request.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>
      <button
        // onClick={() => handleCancelFriendRequest(request._id)}
        className="px-3 py-1 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300"
      >
        Cancel
      </button>
    </div>
  );

  const renderReceivedRequestItem = (request: FriendRequest) => (
    <div
      key={request._id}
      className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg"
    >
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-300 dark:bg-gray-600">
          {request.from?.picture ? (
            <img
              src={request.from.picture}
              alt={request.from.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <UserCircleIcon className="h-6 w-6 text-gray-500 dark:text-gray-400" />
            </div>
          )}
        </div>
        <div>
          <p className="font-medium text-gray-900 dark:text-white">
            {request.from?.name}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {request.from?.email}
          </p>
          <p className="text-xs text-gray-400">
            Received {new Date(request.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>
      <div className="flex items-center space-x-2">
        <button
          onClick={() => handleAcceptFriendRequest(request._id)}
          className="px-3 py-1 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600"
        >
          Accept
        </button>
        <button
          onClick={() => handleRejectFriendRequest(request._id)}
          className="px-3 py-1 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600"
        >
          Reject
        </button>
      </div>
    </div>
  );

  const renderEmptyState = (message: string, subMessage?: string) => (
    <div className="text-center py-8">
      <UserCircleIcon className="h-12 w-12 mx-auto text-gray-400 mb-3" />
      <p className="text-gray-500 dark:text-gray-400">{message}</p>
      {subMessage && <p className="text-sm text-gray-400 mt-1">{subMessage}</p>}
    </div>
  );

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-50" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white dark:bg-whatsapp-gray-800 p-6 text-left align-middle shadow-xl transition-all">
                <div className="flex justify-between items-center mb-6">
                  <Dialog.Title
                    as="h3"
                    className="text-lg font-medium leading-6 text-gray-900 dark:text-white"
                  >
                    New Chat
                  </Dialog.Title>
                  <button
                    onClick={onClose}
                    className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                {/* Search Bar */}
                <div className="mb-6">
                  <div className="relative">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search users..."
                      className="w-full pl-10 pr-4 py-3 rounded-lg bg-gray-100 dark:bg-gray-700 border-none focus:ring-2 focus:ring-whatsapp-green-light focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4">
                  <button
                    onClick={() => setSelectedTab("users")}
                    className={`flex-1 py-2 text-center font-medium ${
                      selectedTab === "users"
                        ? "text-whatsapp-green-light border-b-2 border-whatsapp-green-light"
                        : "text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    Discover ({filteredUsers.length})
                  </button>
                  <button
                    onClick={() => setSelectedTab("contacts")}
                    className={`flex-1 py-2 text-center font-medium ${
                      selectedTab === "contacts"
                        ? "text-whatsapp-green-light border-b-2 border-whatsapp-green-light"
                        : "text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    Contacts ({filteredContacts.length})
                  </button>
                  <button
                    onClick={() => setSelectedTab("requests")}
                    className={`flex-1 py-2 text-center font-medium ${
                      selectedTab === "requests"
                        ? "text-whatsapp-green-light border-b-2 border-whatsapp-green-light"
                        : "text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    Requests (
                    {filteredReceivedRequests.length +
                      filteredSentRequests.length}
                    )
                  </button>
                </div>

                {/* Content based on selected tab */}
                <div className="max-h-96 overflow-y-auto">
                  {selectedTab === "users" &&
                    (isLoadingUsers ? (
                      <div className="flex justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-whatsapp-green-light"></div>
                      </div>
                    ) : filteredUsers.length === 0 ? (
                      renderEmptyState(
                        searchQuery ? "No users found" : "No users available",
                        searchQuery
                          ? "Try a different search term"
                          : "All users are already your contacts",
                      )
                    ) : (
                      filteredUsers.map(renderUserItem)
                    ))}

                  {selectedTab === "contacts" &&
                    (isLoadingContacts ? (
                      <div className="flex justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-whatsapp-green-light"></div>
                      </div>
                    ) : filteredContacts.length === 0 ? (
                      renderEmptyState(
                        "No contacts yet",
                        "Add friends from the Discover tab",
                      )
                    ) : (
                      filteredContacts.map(renderContactItem)
                    ))}

                  {selectedTab === "requests" && (
                    <div>
                      {/* Received Requests Section */}
                      <div className="mb-6">
                        <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center">
                          <EnvelopeIcon className="h-5 w-5 mr-2 text-blue-500" />
                          Received Requests ({filteredReceivedRequests.length})
                        </h4>
                        {isLoadingReceivedRequests ? (
                          <div className="flex justify-center py-4">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-whatsapp-green-light"></div>
                          </div>
                        ) : filteredReceivedRequests.length === 0 ? (
                          <div className="text-center py-4 border rounded-lg bg-gray-50 dark:bg-gray-700">
                            <p className="text-gray-500 dark:text-gray-400">
                              No pending requests
                            </p>
                          </div>
                        ) : (
                          filteredReceivedRequests.map(
                            renderReceivedRequestItem,
                          )
                        )}
                      </div>

                      {/* Sent Requests Section */}
                      <div>
                        <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center">
                          <ClockIcon className="h-5 w-5 mr-2 text-yellow-500" />
                          Sent Requests ({filteredSentRequests.length})
                        </h4>
                        {isLoadingSentRequests ? (
                          <div className="flex justify-center py-4">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-whatsapp-green-light"></div>
                          </div>
                        ) : filteredSentRequests.length === 0 ? (
                          <div className="text-center py-4 border rounded-lg bg-gray-50 dark:bg-gray-700">
                            <p className="text-gray-500 dark:text-gray-400">
                              No sent requests
                            </p>
                          </div>
                        ) : (
                          filteredSentRequests.map(renderSentRequestItem)
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                    {selectedTab === "users"
                      ? "Add friends to start chatting"
                      : selectedTab === "contacts"
                        ? "Click on a contact to start chatting"
                        : "Manage your friend requests"}
                  </p>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default NewChatModal;


# 12 - NewGroupModel

import React, { useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { useGetContactsQuery } from '../../features/users/userApi';
import { useCreateGroupMutation } from '../../features/chat/chatApi';
import { useDispatch } from 'react-redux';
import { setActiveChat } from '../../features/chat/chatSlice';
import { XMarkIcon, UserGroupIcon, UserCircleIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { User } from '../../features/auth/authApi';

interface NewGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const NewGroupModal: React.FC<NewGroupModalProps> = ({ isOpen, onClose }) => {
  const [groupName, setGroupName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  
  const { data: contactsData, isLoading } = useGetContactsQuery();
  const [createGroup] = useCreateGroupMutation();
  const dispatch = useDispatch();
  
  const filteredContacts = contactsData?.data?.contacts?.filter((contact: User) =>
    contact?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    contact?.email?.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];
  
  const toggleUserSelection = (userId: string) => {
    setSelectedUsers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };
  
  const handleCreateGroup = async () => {
  if (!groupName.trim()) {
    toast.error('Please enter a group name');
    return;
  }
  
  if (selectedUsers.length === 0) {
    toast.error('Please select at least one user');
    return;
  }
  
  try {
    const result = await createGroup({
      name: groupName,
      participants: selectedUsers,
    }).unwrap();
    
    // FIX: Access result.chat directly, not result.data.chat
    dispatch(setActiveChat(result.chat));
    onClose();
    toast.success('Group created successfully');
    
  } catch (error: any) {
    const errorMessage = error?.data?.message || 'Failed to create group';
    toast.error(errorMessage);
  }
};
  
  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-50" />
        </Transition.Child>
        
        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white dark:bg-whatsapp-gray-800 p-6 text-left align-middle shadow-xl transition-all">
                <div className="flex justify-between items-center mb-6">
                  <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900 dark:text-white">
                    Create New Group
                  </Dialog.Title>
                  <button
                    onClick={onClose}
                    className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>
                
                {/* Group Name Input */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Group Name
                  </label>
                  <input
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="Enter group name"
                    className="w-full px-4 py-3 rounded-lg bg-gray-100 dark:bg-gray-700 border-none focus:ring-2 focus:ring-whatsapp-green-light focus:border-transparent"
                  />
                </div>
                
                {/* Search Contacts */}
                <div className="mb-4">
                  <div className="relative">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search contacts..."
                      className="w-full pl-10 pr-4 py-3 rounded-lg bg-gray-100 dark:bg-gray-700 border-none focus:outline-none focus:ring-2 focus:ring-whatsapp-green-light focus:border-transparent"
                    />
                  </div>
                </div>
                
                {/* Selected Users Preview */}
                {selectedUsers.length > 0 && (
                  <div className="mb-4">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Selected ({selectedUsers.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {selectedUsers.map(userId => {
                        const contact = contactsData?.data?.contacts?.find((c: User) => c._id === userId);
                        return contact ? (
                          <div
                            key={userId}
                            className="flex items-center bg-whatsapp-green-light/10 text-whatsapp-green-light px-3 py-1 rounded-full"
                          >
                            <span className="text-sm">{contact.name}</span>
                            <button
                              onClick={() => toggleUserSelection(userId)}
                              className="ml-2 text-whatsapp-green-light hover:text-whatsapp-green-dark"
                            >
                              ×
                            </button>
                          </div>
                        ) : null;
                      })}
                    </div>
                  </div>
                )}
                
                {/* Contacts List */}
                <div className="max-h-64 overflow-y-auto mb-6">
                  {isLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-whatsapp-green-light"></div>
                    </div>
                  ) : filteredContacts.length === 0 ? (
                    <div className="text-center py-8">
                      <UserGroupIcon className="h-12 w-12 mx-auto text-gray-400 mb-3" />
                      <p className="text-gray-500 dark:text-gray-400">
                        {searchQuery ? 'No contacts found' : 'No contacts available'}
                      </p>
                      <p className="text-sm text-gray-400 mt-1">
                        Add users to your contacts first
                      </p>
                    </div>
                  ) : (
                    filteredContacts.map((contact: User) => (
                      <div
                        key={contact._id}
                        className="flex items-center p-3 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      >
                        <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-300 dark:bg-gray-600">
                          {contact.picture ? (
                            <img
                              src={contact.picture}
                              alt={contact.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <UserCircleIcon className="h-6 w-6 text-gray-500 dark:text-gray-400" />
                            </div>
                          )}
                        </div>
                        <div className="ml-3 flex-1">
                          <p className="font-medium text-gray-900 dark:text-white">{contact.name}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">{contact.email}</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={selectedUsers.includes(contact._id)}
                          onChange={() => toggleUserSelection(contact._id)}
                          className="h-5 w-5 rounded border-gray-300 text-whatsapp-green-light focus:ring-whatsapp-green-light cursor-pointer"
                        />
                      </div>
                    ))
                  )}
                </div>
                
                {/* Action Buttons */}
                <div className="flex space-x-3">
                  <button
                    onClick={onClose}
                    className="flex-1 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateGroup}
                    disabled={!groupName.trim() || selectedUsers.length === 0}
                    className={`flex-1 py-3 rounded-lg transition-colors ${
                      groupName.trim() && selectedUsers.length > 0
                        ? 'bg-whatsapp-green-light hover:bg-whatsapp-green-dark text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    Create Group
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default NewGroupModal;

# 13 - ProtectedRoute

import React, { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectIsAuthenticated } from '../../features/auth/authSlice';

interface ProtectedRouteProps {
  children: ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const location = useLocation();
  
  if (!isAuthenticated) {
    // Redirect to login page with return url
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  return <>{children}</>;
};

export default ProtectedRoute;

# 14 - AuthLayout
import React, { ReactNode, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectIsAuthenticated } from '../../features/auth/authSlice';

interface AuthLayoutProps {
  children: ReactNode;
  type: 'auth' | 'protected';
}

const AuthLayout: React.FC<AuthLayoutProps> = ({ children, type }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthenticated = useSelector(selectIsAuthenticated);
  
  useEffect(() => {
    if (type === 'auth' && isAuthenticated) {
      // Redirect to home if already authenticated
      navigate('/', { replace: true });
    } else if (type === 'protected' && !isAuthenticated) {
      // Redirect to login if not authenticated
      navigate('/login', { 
        replace: true,
        state: { from: location.pathname }
      });
    }
  }, [isAuthenticated, navigate, type, location]);
  
  // Show loading while checking authentication
  if (type === 'protected' && !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-whatsapp-bg-light dark:bg-whatsapp-bg-dark">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-whatsapp-green-light mx-auto"></div>
          <p className="mt-4 text-whatsapp-gray-600 dark:text-whatsapp-gray-400">
            Checking authentication...
          </p>
        </div>
      </div>
    );
  }
  
  if (type === 'auth' && isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-whatsapp-bg-light dark:bg-whatsapp-bg-dark">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-whatsapp-green-light mx-auto"></div>
          <p className="mt-4 text-whatsapp-gray-600 dark:text-whatsapp-gray-400">
            Redirecting...
          </p>
        </div>
      </div>
    );
  }
  
  return <>{children}</>;
};

export default AuthLayout;

# 15 - MainLayout

import React, { ReactNode, useEffect, useState } from "react";
import CallScreen from "../calls/CallScreen";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useLocation } from "react-router-dom";
import {
  selectCurrentUser,
  selectIsAuthenticated,
  logout,
} from "../../features/auth/authSlice";
import { useLogoutMutation } from "../../features/auth/authApi";
import IncomingCallModal from "../calls/IncomingCallModel";
import { useChat } from "../../hooks/useChat";
import {
  Bars3Icon,
  ChatBubbleLeftRightIcon,
  PhoneIcon,
  VideoCameraIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  UserCircleIcon,
  MagnifyingGlassIcon,
  PaperClipIcon,
  FaceSmileIcon,
  LanguageIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import TranslationSettings from "../translation/TranslationSettings";
import { RootState } from "../../app/store";
// Import new chat modals
import NewChatModal from "../chat/NewChatModel";
import NewGroupModal from "../chat/NewGroupModel";
import { apiSlice } from "../../app/apiSlice";
import MessageInput from "../chat/MessageInput";
import { useCall } from "../../hooks/useCall";

interface MainLayoutProps {
  children: ReactNode;
}

// Define translation settings type
interface TranslationSettingsType {
  enabled: boolean;
  sourceLanguage: string;
  targetLanguage: string;
  autoDetect: boolean;
  autoPlayAudio: boolean;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const user = useSelector(selectCurrentUser);
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const { startCall, incomingCall, answerCall, rejectCall } = useCall();

  // Use a default translation settings object since the selector doesn't exist
  const translationSettings = useSelector((state: RootState) => ({
    enabled: state.translation.translationEnabled,
    sourceLanguage: state.translation.sourceLanguage,
    targetLanguage: state.translation.targetLanguage,
    autoDetect: state.translation.sourceLanguage === "auto",
    autoPlayAudio: false, // keep default or wire later
  }));

  const [logoutMutation] = useLogoutMutation();

  const { chats, activeChat, selectChat, sendMessage, isLoading } = useChat();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [showTranslationSettings, setShowTranslationSettings] = useState(false);
  const [selectedChatIndex, setSelectedChatIndex] = useState<number | null>(
    null,
  );

  // New chat modal states
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [showNewGroupModal, setShowNewGroupModal] = useState(false);

  const activeCall = useSelector((state: RootState) => state.call.activeCall);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login", {
        replace: true,
        state: { from: location.pathname },
      });
    }
  }, [isAuthenticated, navigate, location]);

  const handleLogout = async () => {
    try {
      await logoutMutation().unwrap();
    } catch {}

    dispatch(logout()); // clears redux auth
    dispatch(apiSlice.util.resetApiState()); // clears cache

    navigate("/login", { replace: true });
  };

  const getOtherParticipant = (chat: any) => {
    if (!chat || !user || !chat.participants) return null;
    return chat.participants.find((p: any) => p._id !== user._id);
  };

  const getLastMessagePreview = (chat: any) => {
    if (!chat.lastMessage) return "No messages yet";

    if (chat.lastMessage.deleted) {
      return "Message deleted";
    }

    if (chat.lastMessage.type === "image") {
      return "📷 Photo";
    } else if (chat.lastMessage.type === "video") {
      return "🎬 Video";
    } else if (chat.lastMessage.type === "audio") {
      return "🎵 Audio";
    } else if (chat.lastMessage.type === "file") {
      return "📎 File";
    } else if (chat.lastMessage.type === "location") {
      return "📍 Location";
    }

    return chat.lastMessage.content || "Message";
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else if (diffDays === 1) {
      return "Yesterday";
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: "short" });
    } else {
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }
  };

  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-whatsapp-green-light"></div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-whatsapp-bg-light dark:bg-whatsapp-bg-dark">
      {/* Top Navigation Bar */}
      <header className="bg-whatsapp-green-dark text-white shadow-lg">
        <div className="px-4 py-3 flex items-center justify-between">
          {/* Left side - Logo and Menu */}
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg hover:bg-whatsapp-green-light/20 transition-colors duration-200"
            >
              <Bars3Icon className="h-6 w-6" />
            </button>

            <div className="flex items-center space-x-2">
              <div className="w-8 h-8">
                <svg
                  className="w-full h-full"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.012-.57-.012-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.87.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                </svg>
              </div>
              <span className="text-xl font-semibold">WhatsApp</span>
            </div>
          </div>

          {/* Center - Search */}
          <div className="flex-1 max-w-2xl mx-4 hidden md:block">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search messages..."
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-transparent"
              />
            </div>
          </div>

          {/* Right side - User menu */}
          <div className="flex items-center space-x-2">
            {/* Desktop icons */}
            <div className="hidden md:flex items-center space-x-2">
              <button
                onClick={() => navigate("/chats")}
                className="p-2 rounded-lg hover:bg-whatsapp-green-light/20 transition-colors duration-200"
              >
                <ChatBubbleLeftRightIcon className="h-6 w-6" />
              </button>

              {/* Translation Toggle */}
              <button
                onClick={() => setShowTranslationSettings(true)}
                className={`p-2 rounded-lg hover:bg-whatsapp-green-light/20 transition-colors duration-200 relative ${
                  translationSettings.enabled ? "text-green-400" : ""
                }`}
                title="Translation Settings"
              >
                <LanguageIcon className="h-6 w-6" />
                {translationSettings.enabled && (
                  <div className="absolute top-1 right-1 w-2 h-2 bg-green-500 rounded-full"></div>
                )}
              </button>

              <button className="p-2 rounded-lg hover:bg-whatsapp-green-light/20 transition-colors duration-200">
                <PhoneIcon className="h-6 w-6" />
              </button>
              <button className="p-2 rounded-lg hover:bg-whatsapp-green-light/20 transition-colors duration-200">
                <VideoCameraIcon className="h-6 w-6" />
              </button>
            </div>

            {/* User menu */}
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center space-x-2 p-2 rounded-lg hover:bg-whatsapp-green-light/20 transition-colors duration-200"
              >
                <div className="w-8 h-8 rounded-full overflow-hidden">
                  {user.picture ? (
                    <img
                      src={user.picture}
                      alt={user.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <UserCircleIcon className="w-full h-full text-white/80" />
                  )}
                </div>
                <span className="hidden md:inline font-medium">
                  {user.name}
                </span>
                <svg
                  className={`h-5 w-5 transition-transform duration-200 ${
                    userMenuOpen ? "rotate-180" : ""
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {/* Dropdown menu */}
              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-whatsapp-gray-800 rounded-lg shadow-lg py-1 z-50 border border-whatsapp-gray-200 dark:border-whatsapp-gray-700">
                  <div className="px-4 py-2 border-b border-whatsapp-gray-200 dark:border-whatsapp-gray-700">
                    <p className="text-sm font-medium text-whatsapp-gray-900 dark:text-white">
                      {user.name}
                    </p>
                    <p className="text-xs text-whatsapp-gray-500 dark:text-whatsapp-gray-400">
                      {user.email}
                    </p>
                    <p className="text-xs text-green-500 dark:text-green-400 mt-1">
                      ● Online
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                    }}
                    className="flex items-center w-full px-4 py-2 text-sm text-whatsapp-gray-700 dark:text-whatsapp-gray-300 hover:bg-whatsapp-gray-100 dark:hover:bg-whatsapp-gray-700"
                  >
                    <UserCircleIcon className="h-5 w-5 mr-2" />
                    Profile
                  </button>

                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                    }}
                    className="flex items-center w-full px-4 py-2 text-sm text-whatsapp-gray-700 dark:text-whatsapp-gray-300 hover:bg-whatsapp-gray-100 dark:hover:bg-whatsapp-gray-700"
                  >
                    <Cog6ToothIcon className="h-5 w-5 mr-2" />
                    Settings
                  </button>

                  <div className="border-t border-whatsapp-gray-200 dark:border-whatsapp-gray-700">
                    <button
                      onClick={handleLogout}
                      className="flex items-center w-full px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-whatsapp-gray-100 dark:hover:bg-whatsapp-gray-700"
                    >
                      <ArrowRightOnRectangleIcon className="h-5 w-5 mr-2" />
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside
          className={`
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          md:translate-x-0
          absolute md:relative
          w-64 md:w-80
          bg-white dark:bg-whatsapp-gray-800
          border-r border-whatsapp-gray-200 dark:border-whatsapp-border-dark
          transition-transform duration-300 ease-in-out
          z-40
          flex flex-col
          h-full
        `}
        >
          {/* Sidebar Header - Updated with New Chat button */}
          <div className="p-4 border-b border-whatsapp-gray-200 dark:border-whatsapp-border-dark">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-whatsapp-text-light dark:text-whatsapp-text-dark">
                Chats
              </h2>
              <button
                onClick={() => setShowNewChatModal(true)}
                className="p-2 rounded-lg hover:bg-whatsapp-gray-100 dark:hover:bg-whatsapp-gray-700"
                title="Start new chat"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                  />
                </svg>
              </button>
            </div>

            {/* Search in sidebar */}
            <div className="mt-4">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-whatsapp-gray-400" />
                <input
                  type="text"
                  placeholder="Search or start new chat"
                  className="w-full pl-10 pr-4 py-2 rounded-lg bg-whatsapp-gray-100 dark:bg-whatsapp-gray-700 border border-transparent focus:outline-none focus:ring-2 focus:ring-whatsapp-green-light focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Chat List */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-whatsapp-green-light"></div>
              </div>
            ) : chats.length === 0 ? (
              <div className="text-center py-8">
                <ChatBubbleLeftRightIcon className="h-12 w-12 mx-auto text-whatsapp-gray-400" />
                <p className="mt-2 text-whatsapp-gray-500">No chats yet</p>
                <button
                  onClick={() => setShowNewChatModal(true)}
                  className="mt-4 px-4 py-2 bg-whatsapp-green-light text-white rounded-lg hover:bg-whatsapp-green-dark"
                >
                  Start New Chat
                </button>
              </div>
            ) : (
              chats.map((chat: any, index: number) => {
                const otherUser = getOtherParticipant(chat);
                const isActive =
                  activeChat?._id === chat._id || selectedChatIndex === index;

                return (
                  <div
                    key={chat._id || index}
                    onClick={() => {
                      selectChat(chat);
                      setSelectedChatIndex(index);
                      setSidebarOpen(false);
                    }}
                    className={`
                      p-4 border-b border-whatsapp-gray-100 dark:border-whatsapp-gray-700 
                      hover:bg-whatsapp-gray-50 dark:hover:bg-whatsapp-gray-700 
                      cursor-pointer transition-colors duration-200
                      ${isActive ? "bg-whatsapp-gray-100 dark:bg-whatsapp-gray-700" : ""}
                    `}
                  >
                    <div className="flex items-center space-x-3">
                      <div className="relative">
                        <div className="w-12 h-12 rounded-full overflow-hidden bg-whatsapp-gray-300 dark:bg-whatsapp-gray-600">
                          {otherUser?.picture ? (
                            <img
                              src={otherUser.picture}
                              alt={otherUser.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <UserCircleIcon className="h-8 w-8 text-whatsapp-gray-500 dark:text-whatsapp-gray-400" />
                            </div>
                          )}
                        </div>
                        <div
                          className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white dark:border-whatsapp-gray-800
                          ${otherUser?.isOnline ? "bg-green-500" : "bg-gray-400"}
                        `}
                        ></div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center">
                          <p className="text-sm font-medium text-whatsapp-text-light dark:text-whatsapp-text-dark truncate">
                            {otherUser?.name || `Chat ${index + 1}`}
                            {chat.isGroup && " (Group)"}
                          </p>
                          {chat.lastMessageAt && (
                            <span className="text-xs text-whatsapp-gray-500 dark:text-whatsapp-gray-400">
                              {formatTime(chat.lastMessageAt)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-whatsapp-gray-600 dark:text-whatsapp-gray-400 truncate">
                            {getLastMessagePreview(chat)}
                          </p>
                          {chat.unreadCount > 0 && (
                            <span className="bg-whatsapp-green-light text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                              {chat.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Sidebar Footer */}
          <div className="p-4 border-t border-whatsapp-gray-200 dark:border-whatsapp-border-dark">
            <div className="flex items-center justify-between text-sm text-whatsapp-gray-600 dark:text-whatsapp-gray-400">
              <div className="flex items-center space-x-2">
                <UserCircleIcon className="h-5 w-5" />
                <span>{user.name}</span>
              </div>
              <span className="text-green-500">●</span>
            </div>
          </div>
        </aside>

        {/* Overlay for mobile sidebar */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {activeChat ? (
            <>
              {/* Chat Header */}
              <div className="border-b border-whatsapp-gray-200 dark:border-whatsapp-border-dark p-4 bg-white dark:bg-whatsapp-gray-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="md:hidden">
                      <button
                        onClick={() => setSidebarOpen(true)}
                        className="p-2 rounded-lg hover:bg-whatsapp-gray-100 dark:hover:bg-whatsapp-gray-700"
                      >
                        <Bars3Icon className="h-6 w-6" />
                      </button>
                    </div>

                    <div className="relative">
                      <div className="w-10 h-10 rounded-full overflow-hidden">
                        {getOtherParticipant(activeChat)?.picture ? (
                          <img
                            src={getOtherParticipant(activeChat)?.picture}
                            alt={getOtherParticipant(activeChat)?.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-whatsapp-gray-300 dark:bg-whatsapp-gray-600 flex items-center justify-center">
                            <UserCircleIcon className="h-6 w-6 text-whatsapp-gray-500 dark:text-whatsapp-gray-400" />
                          </div>
                        )}
                      </div>
                      <div
                        className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white dark:border-whatsapp-gray-800
                        ${getOtherParticipant(activeChat)?.isOnline ? "bg-green-500" : "bg-gray-400"}
                      `}
                      ></div>
                    </div>

                    <div>
                      <h3 className="font-semibold text-whatsapp-text-light dark:text-whatsapp-text-dark">
                        {getOtherParticipant(activeChat)?.name ||
                          "Unknown User"}
                      </h3>
                      <p className="text-xs text-whatsapp-gray-600 dark:text-whatsapp-gray-400">
                        {getOtherParticipant(activeChat)?.isOnline
                          ? "Online"
                          : "Offline"}
                        {getOtherParticipant(activeChat)?.lastSeen &&
                          !getOtherParticipant(activeChat)?.isOnline &&
                          ` • Last seen ${formatTime(getOtherParticipant(activeChat)?.lastSeen)}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {/* Voice Call */}
                    <button
                      onClick={() => {
                        const otherUser = getOtherParticipant(activeChat);
                        if (!otherUser) return;
                        startCall([otherUser._id], "voice", activeChat._id);
                      }}
                      className="p-2 rounded-lg hover:bg-whatsapp-gray-100 dark:hover:bg-whatsapp-gray-700"
                    >
                      <PhoneIcon className="h-6 w-6" />
                    </button>

                    {/* Video Call */}
                    <button
                      onClick={() => {
                        const otherUser = getOtherParticipant(activeChat);
                        if (!otherUser) return;
                        startCall([otherUser._id], "video", activeChat._id);
                      }}
                      className="p-2 rounded-lg hover:bg-whatsapp-gray-100 dark:hover:bg-whatsapp-gray-700"
                    >
                      <VideoCameraIcon className="h-6 w-6" />
                    </button>

                    <button className="p-2 rounded-lg hover:bg-whatsapp-gray-100 dark:hover:bg-whatsapp-gray-700">
                      <MagnifyingGlassIcon className="h-6 w-6" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Chat Messages Area */}
              <div className="flex-1 overflow-y-auto p-4 bg-whatsapp-bg-light dark:bg-whatsapp-bg-dark">
                <div className="max-w-3xl mx-auto space-y-4">{children}</div>
              </div>

              {/* Message Input */}
              <div className="border-t border-whatsapp-gray-200 dark:border-whatsapp-border-dark p-4 bg-white dark:bg-whatsapp-gray-800">
                <div className="max-w-3xl mx-auto">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => toast("Emoji picker coming soon!")}
                      className="p-2 rounded-lg hover:bg-whatsapp-gray-100 dark:hover:bg-whatsapp-gray-700"
                    >
                      <FaceSmileIcon className="h-6 w-6" />
                    </button>
                    <button
                      onClick={() => toast("Attachment feature coming soon!")}
                      className="p-2 rounded-lg hover:bg-whatsapp-gray-100 dark:hover:bg-whatsapp-gray-700"
                    >
                      <PaperClipIcon className="h-6 w-6" />
                    </button>

                    <div className="flex-1">
                      <MessageInput chatId={activeChat._id} />
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center bg-whatsapp-bg-light dark:bg-whatsapp-bg-dark">
              <div className="text-center max-w-md">
                <div className="w-24 h-24 mx-auto mb-6 bg-whatsapp-green-light/10 rounded-full flex items-center justify-center">
                  <ChatBubbleLeftRightIcon className="h-12 w-12 text-whatsapp-green-light" />
                </div>
                <h2 className="text-2xl font-semibold text-whatsapp-text-light dark:text-whatsapp-text-dark mb-2">
                  Welcome to WhatsApp Clone
                </h2>
                <p className="text-whatsapp-gray-600 dark:text-whatsapp-gray-400 mb-6">
                  Select a chat from the sidebar to start messaging, or create a
                  new chat.
                </p>
                <div className="space-y-3">
                  <button
                    onClick={() => setShowNewChatModal(true)}
                    className="w-full py-3 bg-whatsapp-green-light text-white rounded-lg hover:bg-whatsapp-green-dark transition-colors"
                  >
                    Start New Chat
                  </button>
                  <button
                    onClick={() => setShowNewGroupModal(true)}
                    className="w-full py-3 border border-whatsapp-green-light text-whatsapp-green-light rounded-lg hover:bg-whatsapp-green-light/10 transition-colors"
                  >
                    Create Group
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Incoming Call Modal */}
      <IncomingCallModal />
      {/* {incomingCall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-white p-6 rounded-xl w-80 text-center">
            <h3 className="text-lg font-semibold mb-2">
              Incoming {incomingCall.type} call
            </h3>
            <p className="mb-4">{incomingCall.initiator.name}</p>

            <div className="flex justify-between">
              <button
                onClick={() => rejectCall()}
                className="px-4 py-2 bg-red-500 text-white rounded"
              >
                Reject
              </button>

              <button
                onClick={() => answerCall()}
                className="px-4 py-2 bg-green-500 text-white rounded"
              >
                Accept
              </button>
            </div>
          </div>
        </div>
      )} */}

      {/* Translation Settings Modal */}
      <TranslationSettings
        isOpen={showTranslationSettings}
        onClose={() => setShowTranslationSettings(false)}
      />

      {/* New Chat Modal */}
      <NewChatModal
        isOpen={showNewChatModal}
        onClose={() => setShowNewChatModal(false)}
      />

      {/* New Group Modal */}
      <NewGroupModal
        isOpen={showNewGroupModal}
        onClose={() => setShowNewGroupModal(false)}
      />

      {/* Global Call Screen */}
      {activeCall && <CallScreen />}
    </div>
  );
};

export default MainLayout;

# 16 - RealTimeTranslation

import React, { useState, useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { useTranslation } from '../../hooks/useTranslation';
import { useSocket } from '../../context/SocketContext';
import {
  selectTranslationEnabled,
  selectSourceLanguage,
  selectTargetLanguage,
} from '../../features/translation/translationSlice';
import {
  MicrophoneIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  LanguageIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  XMarkIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';

interface RealTimeTranslationProps {
  callId?: string;
  chatId?: string;
  participants?: string[];
  compact?: boolean;
  onClose?: () => void;
}

interface TranslationSegment {
  id: string;
  text: string;
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  confidence: number;
  timestamp: string;
  userId?: string;
}

const RealTimeTranslation: React.FC<RealTimeTranslationProps> = ({
  callId,
  chatId,
  participants = [],
  compact = false,
  onClose,
}) => {
  const {
    sourceLanguage,
    targetLanguage,
    translationEnabled,
    isRecording,
    currentSessionId,
    setSourceLanguage,
    setTargetLanguage,
    swapLanguages,
    getLanguageName,
    startRealTimeTranslation,
    stopRealTimeTranslation,
    createTranslationSession,
    playAudio,
    isTranslationActive,
  } = useTranslation();
  
  const { socket } = useSocket();
  
  const [availableLanguages, setAvailableLanguages] = useState<any[]>([]);
  const [segments, setSegments] = useState<TranslationSegment[]>([]);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [audioQueue, setAudioQueue] = useState<any[]>([]);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  
  const segmentsRef = useRef<HTMLDivElement>(null);
  
  // Load available languages
  useEffect(() => {
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
      { code: 'it', name: 'Italian', nativeName: 'Italiano' },
      { code: 'nl', name: 'Dutch', nativeName: 'Nederlands' },
      { code: 'pl', name: 'Polish', nativeName: 'Polski' },
    ];
    
    setAvailableLanguages(languages);
  }, []);
  
  // Initialize session
  useEffect(() => {
    const initializeSession = async () => {
      if (callId && participants.length > 0 && !currentSessionId) {
        try {
          const session = await createTranslationSession(participants, callId, chatId);
          
          if (socket && session) {
            socket.emit('translation:start', {
              sessionId: session.sessionId,
              callId,
              sourceLanguage,
              targetLanguage,
            });
            
            setIsSessionActive(true);
          }
        } catch (error) {
          console.error('Failed to initialize session:', error);
        }
      }
    };
    
    if (translationEnabled) {
      initializeSession();
    }
    
    return () => {
      if (socket && currentSessionId) {
        socket.emit('translation:stop', {
          sessionId: currentSessionId,
          callId,
        });
      }
    };
  }, [callId, participants, translationEnabled, socket, currentSessionId, createTranslationSession, sourceLanguage, targetLanguage, chatId]);
  
  // Socket listeners
  useEffect(() => {
    if (!socket) return;
    
    // Translation results
    socket.on('translation:result', (data: any) => {
      const { translation, userId, timestamp, sessionId } = data;
      
      if (sessionId !== currentSessionId) return;
      
      const newSegment: TranslationSegment = {
        id: Date.now().toString(),
        text: translation.originalText,
        translatedText: translation.translatedText,
        sourceLanguage: translation.sourceLanguage || sourceLanguage,
        targetLanguage: translation.targetLanguage || targetLanguage,
        confidence: translation.confidence,
        timestamp: timestamp || new Date().toISOString(),
        userId,
      };
      
      setSegments(prev => [...prev, newSegment]);
      
      // Add to audio queue if audio is available
      if (translation.translatedAudio) {
        setAudioQueue(prev => [...prev, {
          id: newSegment.id,
          text: translation.translatedText,
          audioUrl: translation.translatedAudio,
          language: targetLanguage,
        }]);
      }
    });
    
    // Session events
    socket.on('translation:started', (data: any) => {
      if (data.sessionId === currentSessionId) {
        setIsSessionActive(true);
      }
    });
    
    socket.on('translation:stopped', (data: any) => {
      if (data.sessionId === currentSessionId) {
        setIsSessionActive(false);
      }
    });
    
    return () => {
      socket.off('translation:result');
      socket.off('translation:started');
      socket.off('translation:stopped');
    };
  }, [socket, currentSessionId, sourceLanguage, targetLanguage]);
  
  // Auto-scroll segments
  useEffect(() => {
    if (segmentsRef.current) {
      segmentsRef.current.scrollTop = segmentsRef.current.scrollHeight;
    }
  }, [segments]);
  
  // Handle recording toggle
  const handleRecordingToggle = async () => {
    if (isRecording) {
      await stopRealTimeTranslation();
    } else if (currentSessionId) {
      await startRealTimeTranslation(currentSessionId, callId);
    }
  };
  
  // Play audio from queue
  const playNextAudio = async () => {
    if (audioQueue.length > 0 && !isPlayingAudio) {
      const nextAudio = audioQueue[0];
      setIsPlayingAudio(true);
      
      try {
        const audio = playAudio(nextAudio.audioUrl);
        audio.onended = () => {
          setIsPlayingAudio(false);
          setAudioQueue(prev => prev.slice(1));
        };
        audio.onerror = () => {
          setIsPlayingAudio(false);
          setAudioQueue(prev => prev.slice(1));
        };
      } catch (error) {
        console.error('Failed to play audio:', error);
        setIsPlayingAudio(false);
        setAudioQueue(prev => prev.slice(1));
      }
    }
  };
  
  // Clear segments
  const clearSegments = () => {
    setSegments([]);
    setAudioQueue([]);
  };
  
  // Copy text to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };
  
  // Compact view for call screen
  if (compact) {
    return (
      <div className="flex items-center space-x-2">
        {/* Status indicator */}
        {isRecording && (
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-xs text-red-500">Translating</span>
          </div>
        )}
        
        {isPlayingAudio && (
          <div className="flex items-center space-x-1">
            <SpeakerWaveIcon className="h-3 w-3 text-green-500 animate-pulse" />
            <span className="text-xs text-green-500">Playing</span>
          </div>
        )}
        
        {/* Language display */}
        <div className="flex items-center space-x-1 text-sm">
          <span className="font-medium">{sourceLanguage.toUpperCase()}</span>
          <ArrowPathIcon className="h-3 w-3" />
          <span className="font-medium">{targetLanguage.toUpperCase()}</span>
        </div>
        
        {/* Recording toggle */}
        <button
          onClick={handleRecordingToggle}
          disabled={!currentSessionId}
          className={`p-2 rounded-full ${
            isRecording
              ? 'bg-red-100 text-red-600 hover:bg-red-200'
              : currentSessionId
                ? 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          {isRecording ? (
            <MicrophoneIcon className="h-4 w-4" />
          ) : (
            <MicrophoneIcon className="h-4 w-4" />
          )}
        </button>
        
        {/* Close button */}
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }
  
  // Full view
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <LanguageIcon className="h-6 w-6 text-blue-500" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Live Translation
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {isSessionActive ? 'Session active' : 'Session not active'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            {/* Session status */}
            <div className={`px-2 py-1 rounded text-xs font-medium ${
              isSessionActive 
                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
            }`}>
              {isSessionActive ? 'Active' : 'Inactive'}
            </div>
            
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      </div>
      
      {/* Content */}
      <div className="p-4">
        {/* Language selection */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                From
              </label>
              <div className="relative">
                <select
                  value={sourceLanguage}
                  onChange={(e) => setSourceLanguage(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={isRecording}
                >
                  {availableLanguages.map((lang) => (
                    <option key={`source-${lang.code}`} value={lang.code}>
                      {lang.name} ({lang.nativeName})
                    </option>
                  ))}
                </select>
                <ChevronDownIcon className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              </div>
            </div>
            
            {/* Swap button */}
            <div className="mx-4 pt-6">
              <button
                onClick={swapLanguages}
                disabled={isRecording}
                className="p-2 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
              >
                <ArrowPathIcon className="h-5 w-5 text-gray-600 dark:text-gray-300" />
              </button>
            </div>
            
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                To
              </label>
              <div className="relative">
                <select
                  value={targetLanguage}
                  onChange={(e) => setTargetLanguage(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={isRecording}
                >
                  {availableLanguages.map((lang) => (
                    <option key={`target-${lang.code}`} value={lang.code}>
                      {lang.name} ({lang.nativeName})
                    </option>
                  ))}
                </select>
                <ChevronDownIcon className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              </div>
            </div>
          </div>
          
          {/* Language preview */}
          <div className="text-center text-sm text-gray-600 dark:text-gray-400">
            {getLanguageName(sourceLanguage)} → {getLanguageName(targetLanguage)}
          </div>
        </div>
        
        {/* Controls */}
        <div className="flex items-center justify-center space-x-6 mb-6">
          {/* Record button */}
          <button
            onClick={handleRecordingToggle}
            disabled={!currentSessionId}
            className={`flex flex-col items-center ${
              isRecording 
                ? 'text-red-600' 
                : currentSessionId 
                  ? 'text-blue-600 dark:text-blue-400' 
                  : 'text-gray-400'
            }`}
          >
            <div className={`
              h-14 w-14 rounded-full flex items-center justify-center mb-2
              ${isRecording
                ? 'bg-red-100 dark:bg-red-900/30 animate-pulse'
                : currentSessionId
                  ? 'bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-800/30'
                  : 'bg-gray-100 dark:bg-gray-700'
              }
            `}>
              {isRecording ? (
                <MicrophoneIcon className="h-6 w-6" />
              ) : (
                <MicrophoneIcon className="h-6 w-6" />
              )}
            </div>
            <span className="text-sm font-medium">
              {isRecording ? 'Stop' : 'Start'} Translating
            </span>
          </button>
          
          {/* Play audio button */}
          <button
            onClick={playNextAudio}
            disabled={audioQueue.length === 0 || isPlayingAudio}
            className={`flex flex-col items-center ${
              audioQueue.length > 0 && !isPlayingAudio
                ? 'text-green-600 dark:text-green-400'
                : 'text-gray-400'
            }`}
          >
            <div className={`
              h-14 w-14 rounded-full flex items-center justify-center mb-2
              ${audioQueue.length > 0 && !isPlayingAudio
                ? 'bg-green-100 dark:bg-green-900/30 hover:bg-green-200 dark:hover:bg-green-800/30'
                : 'bg-gray-100 dark:bg-gray-700'
              }
            `}>
              {isPlayingAudio ? (
                <SpeakerWaveIcon className="h-6 w-6 animate-pulse" />
              ) : (
                <SpeakerXMarkIcon className="h-6 w-6" />
              )}
            </div>
            <span className="text-sm font-medium">
              {audioQueue.length > 0 ? `Play (${audioQueue.length})` : 'Play'}
            </span>
          </button>
        </div>
        
        {/* Translation segments */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Translation Log
            </h4>
            {segments.length > 0 && (
              <button
                onClick={clearSegments}
                className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                Clear
              </button>
            )}
          </div>
          
          <div 
            ref={segmentsRef}
            className="h-64 overflow-y-auto bg-gray-50 dark:bg-gray-900 rounded-lg p-3 space-y-3"
          >
            {segments.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400">
                <ClockIcon className="h-8 w-8 mb-2" />
                <p className="text-sm">No translations yet</p>
                <p className="text-xs">Start speaking to see translations here</p>
              </div>
            ) : (
              segments.slice().reverse().map((segment) => (
                <div
                  key={segment.id}
                  className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 rounded">
                        {segment.sourceLanguage.toUpperCase()}
                      </span>
                      <span className="text-gray-400">→</span>
                      <span className="text-xs px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-300 rounded">
                        {segment.targetLanguage.toUpperCase()}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500">
                      {format(new Date(segment.timestamp), 'HH:mm:ss')}
                    </span>
                  </div>
                  
                  <div className="mb-2">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                      {segment.text}
                    </p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {segment.translatedText}
                    </p>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">
                      Confidence: {(segment.confidence * 100).toFixed(1)}%
                    </span>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => copyToClipboard(segment.translatedText)}
                        className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        
        {/* Status bar */}
        <div className="flex items-center justify-between text-sm">
          <div className="text-gray-600 dark:text-gray-400">
            {segments.length} translations
          </div>
          <div className="flex items-center space-x-2">
            {isRecording && (
              <div className="flex items-center space-x-1 text-red-500">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span>Recording</span>
              </div>
            )}
            {isPlayingAudio && (
              <div className="flex items-center space-x-1 text-green-500">
                <SpeakerWaveIcon className="h-3 w-3 animate-pulse" />
                <span>Playing</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RealTimeTranslation;

# 17 - TranslationHistory

import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { useTranslation } from '../../hooks/useTranslation';
import { selectTranslationHistory } from '../../features/translation/translationSlice';
import {
  ClockIcon,
  DocumentDuplicateIcon,
  TrashIcon,
  SpeakerWaveIcon,
  LanguageIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';

interface TranslationHistoryProps {
  maxItems?: number;
  showHeader?: boolean;
}

const TranslationHistory: React.FC<TranslationHistoryProps> = ({ 
  maxItems = 10, 
  showHeader = true 
}) => {
  const translationHistory = useSelector(selectTranslationHistory);
  const { getLanguageName, textToSpeech, playAudio } = useTranslation();
  
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [filterLanguage, setFilterLanguage] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Get unique languages from history
  const uniqueLanguages = Array.from(
    new Set(translationHistory.map(item => item.sourceLang).concat(
      translationHistory.map(item => item.targetLang)
    ))
  );
  
  // Filter history
  const filteredHistory = translationHistory
    .filter(item => {
      if (filterLanguage !== 'all' && item.sourceLang !== filterLanguage && item.targetLang !== filterLanguage) {
        return false;
      }
      
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return item.original.toLowerCase().includes(query) || 
               item.translated.toLowerCase().includes(query);
      }
      
      return true;
    })
    .slice(0, maxItems);
  
  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    // You could add a toast notification here
  };
  
  const handlePlayAudio = async (text: string, language: string) => {
    try {
      const result = await textToSpeech(text, language);
      if (result.audioUrl) {
        playAudio(result.audioUrl);
      }
    } catch (error) {
      console.error('Failed to play audio:', error);
    }
  };
  
  const toggleExpand = (id: string) => {
    setExpandedItem(expandedItem === id ? null : id);
  };
  
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return 'text-green-500';
    if (confidence >= 0.7) return 'text-yellow-500';
    return 'text-red-500';
  };
  
  const getConfidenceText = (confidence: number) => {
    if (confidence >= 0.9) return 'High';
    if (confidence >= 0.7) return 'Medium';
    return 'Low';
  };
  
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg">
      {/* Header */}
      {showHeader && (
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <ClockIcon className="h-5 w-5 text-gray-500" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Translation History
              </h3>
              <span className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded-full">
                {translationHistory.length}
              </span>
            </div>
          </div>
          
          {/* Filters */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Search */}
            <div>
              <input
                type="text"
                placeholder="Search translations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            {/* Language filter */}
            <div className="relative">
              <select
                value={filterLanguage}
                onChange={(e) => setFilterLanguage(e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
              >
                <option value="all">All Languages</option>
                {uniqueLanguages.map(lang => (
                  <option key={lang} value={lang}>
                    {getLanguageName(lang)}
                  </option>
                ))}
              </select>
              <ChevronDownIcon className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>
      )}
      
      {/* History list */}
      <div className="divide-y divide-gray-200 dark:divide-gray-700 max-h-96 overflow-y-auto">
        {filteredHistory.length === 0 ? (
          <div className="p-8 text-center">
            <LanguageIcon className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">
              No translation history yet
            </p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
              Your translations will appear here
            </p>
          </div>
        ) : (
          filteredHistory.map((item) => (
            <div key={item.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50">
              {/* Header */}
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="text-xs font-medium px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 rounded">
                      {item.sourceLang.toUpperCase()}
                    </span>
                    <span className="text-gray-400">→</span>
                    <span className="text-xs font-medium px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-300 rounded">
                      {item.targetLang.toUpperCase()}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded ${getConfidenceColor(item.confidence)} bg-opacity-20`}>
                      {getConfidenceText(item.confidence)} ({Math.round(item.confidence * 100)}%)
                    </span>
                  </div>
                  
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {format(new Date(item.timestamp), 'MMM d, h:mm a')}
                  </div>
                </div>
                
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => toggleExpand(item.id)}
                    className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {expandedItem === item.id ? (
                      <ChevronUpIcon className="h-4 w-4" />
                    ) : (
                      <ChevronDownIcon className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
              
              {/* Original text (collapsed view) */}
              <div className="mb-2">
                <p className="text-gray-700 dark:text-gray-300 line-clamp-2">
                  {item.original}
                </p>
              </div>
              
              {/* Expanded view */}
              {expandedItem === item.id && (
                <div className="mt-3 space-y-3">
                  {/* Original text with actions */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        Original ({getLanguageName(item.sourceLang)})
                      </span>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleCopyText(item.original)}
                          className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                        >
                          <DocumentDuplicateIcon className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => handlePlayAudio(item.original, item.sourceLang)}
                          className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                        >
                          <SpeakerWaveIcon className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                      <p className="text-gray-900 dark:text-white">{item.original}</p>
                    </div>
                  </div>
                  
                  {/* Translated text with actions */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        Translated ({getLanguageName(item.targetLang)})
                      </span>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleCopyText(item.translated)}
                          className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                        >
                          <DocumentDuplicateIcon className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => handlePlayAudio(item.translated, item.targetLang)}
                          className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                        >
                          <SpeakerWaveIcon className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <p className="text-gray-900 dark:text-white">{item.translated}</p>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Action buttons (collapsed view) */}
              {expandedItem !== item.id && (
                <div className="flex items-center justify-end space-x-2 mt-2">
                  <button
                    onClick={() => handleCopyText(item.translated)}
                    className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center space-x-1"
                  >
                    <DocumentDuplicateIcon className="h-3 w-3" />
                    <span>Copy</span>
                  </button>
                  <button
                    onClick={() => handlePlayAudio(item.translated, item.targetLang)}
                    className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center space-x-1"
                  >
                    <SpeakerWaveIcon className="h-3 w-3" />
                    <span>Listen</span>
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
      
      {/* Footer */}
      {showHeader && filteredHistory.length > 0 && (
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
            <span>
              Showing {filteredHistory.length} of {translationHistory.length} translations
            </span>
            {translationHistory.length > maxItems && (
              <button className="text-blue-500 hover:text-blue-600">
                View all
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TranslationHistory;

# 18 - TranslationOverlay

import React, { useState, useRef, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useTranslation } from '../../hooks/useTranslation';
import {
  selectSourceLanguage,
  selectTargetLanguage,
  selectTranslationEnabled,
} from '../../features/translation/translationSlice';
import {
  LanguageIcon,
  SpeakerWaveIcon,
  ArrowPathIcon,
  XMarkIcon,
  ClipboardIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface TranslationOverlayProps {
  text?: string;
  onTranslate?: (translatedText: string) => void;
  onClose?: () => void;
  position?: { x: number; y: number };
}

const TranslationOverlay: React.FC<TranslationOverlayProps> = ({
  text = '',
  onTranslate,
  onClose,
  position = { x: 0, y: 0 },
}) => {
  const { 
    supportedLanguages, 
    getLanguageName,
    translateText: translateTextHook
  } = useTranslation();
  
  const reduxSourceLanguage = useSelector(selectSourceLanguage);
  const reduxTargetLanguage = useSelector(selectTargetLanguage);
  const translationEnabledRedux = useSelector(selectTranslationEnabled);
  
  const [isTranslating, setIsTranslating] = useState(false);
  const [translatedText, setTranslatedText] = useState('');
  const [detectedSourceLanguage, setDetectedSourceLanguage] = useState('');
  const [copied, setCopied] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  useEffect(() => {
    if (text) {
      handleTranslate();
    }
  }, [text]);
  
  const handleTranslate = async () => {
    if (!text || !translationEnabledRedux) return;
    
    setIsTranslating(true);
    try {
      // Use the hook's translateText function
      if (translateTextHook) {
        const result = await translateTextHook(text, {
          sourceLanguage: reduxSourceLanguage,
          targetLanguage: reduxTargetLanguage,
          saveToHistory: true
        });
        
        setTranslatedText(result.translatedText);
        setDetectedSourceLanguage(result.sourceLanguage);
        
        if (onTranslate) {
          onTranslate(result.translatedText);
        }
      } else {
        // Fallback mock translation
        const mockTranslation = text.split('').reverse().join('');
        setTranslatedText(mockTranslation);
        setDetectedSourceLanguage('en');
        
        if (onTranslate) {
          onTranslate(mockTranslation);
        }
      }
      
      setIsTranslating(false);
    } catch (error) {
      console.error('Translation failed:', error);
      toast.error('Translation failed');
      setIsTranslating(false);
    }
  };
  
  const handlePlayAudio = async () => {
    if (!translatedText || isPlaying) return;
    
    try {
      setIsPlaying(true);
      // In a real implementation, this would call text-to-speech API
      // For now, simulate with a timeout
      setTimeout(() => {
        setIsPlaying(false);
        toast.success('Audio played');
      }, 2000);
      
    } catch (error) {
      setIsPlaying(false);
      toast.error('Could not generate speech');
    }
  };
  
  const handleCopy = () => {
    navigator.clipboard.writeText(translatedText);
    setCopied(true);
    toast.success('Copied to clipboard');
    
    setTimeout(() => setCopied(false), 2000);
  };
  
  const handleSwap = () => {
    // Note: We can't directly swap languages here because setSourceLanguage
    // and setTargetLanguage aren't exposed. You'll need to either:
    // 1. Import and use the Redux actions directly
    // 2. Add these functions to the useTranslation hook
    // 3. Handle swap differently
    
    // For now, just swap the translation text and trigger re-translation
    const temp = translatedText;
    setTranslatedText(text);
    setDetectedSourceLanguage('');
    
    // Re-translate the original text
    if (text) {
      setTimeout(() => handleTranslate(), 100);
    }
  };
  
  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    }
  };
  
  const formatLanguagePair = () => {
    const sourceName = detectedSourceLanguage ? getLanguageName(detectedSourceLanguage) : 'Auto-detect';
    const targetName = getLanguageName(reduxTargetLanguage);
    return `${sourceName} → ${targetName}`;
  };
  
  // Import Redux actions directly if needed
  const { setSourceLanguage, setTargetLanguage } = useTranslation();
  
  const handleLanguageSwap = () => {
    // Swap languages using Redux actions
    const temp = reduxSourceLanguage;
    setSourceLanguage(reduxTargetLanguage);
    setTargetLanguage(temp);
    
    // Swap text display
    if (translatedText) {
      const tempText = translatedText;
      setTranslatedText(text);
      setDetectedSourceLanguage(reduxTargetLanguage);
      
      // Re-translate if there's original text
      if (text) {
        setTimeout(() => handleTranslate(), 100);
      }
    }
  };
  
  useEffect(() => {
    return () => {
      stopAudio();
    };
  }, []);
  
  if (!translationEnabledRedux) return null;
  
  return (
    <div
      className="absolute z-50 w-96 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700"
      style={{
        left: `${Math.min(position.x, window.innerWidth - 400)}px`,
        top: `${Math.min(position.y, window.innerHeight - 500)}px`,
      }}
    >
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <LanguageIcon className="h-5 w-5 text-blue-500" />
            <span className="font-medium text-gray-900 dark:text-white">
              Translation
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleLanguageSwap}
              className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              title="Swap languages"
            >
              <ArrowPathIcon className="h-4 w-4" />
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          {formatLanguagePair()}
        </div>
      </div>
      
      {/* Content */}
      <div className="p-4">
        {/* Original Text */}
        {text && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Original
              </span>
              {detectedSourceLanguage && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {getLanguageName(detectedSourceLanguage)}
                </span>
              )}
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <p className="text-gray-900 dark:text-white">{text}</p>
            </div>
          </div>
        )}
        
        {/* Translated Text */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
              Translation
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {getLanguageName(reduxTargetLanguage)}
            </span>
          </div>
          
          {isTranslating ? (
            <div className="p-8 text-center">
              <div className="inline-flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  Translating...
                </span>
              </div>
            </div>
          ) : translatedText ? (
            <div className="space-y-3">
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-gray-900 dark:text-white">{translatedText}</p>
              </div>
              
              {/* Actions */}
              <div className="flex items-center justify-between">
                <div className="flex space-x-2">
                  <button
                    onClick={handlePlayAudio}
                    disabled={isPlaying}
                    className={`
                      p-2 rounded-lg flex items-center space-x-1 text-sm font-medium
                      ${isPlaying
                        ? 'bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-300'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }
                    `}
                  >
                    <SpeakerWaveIcon className="h-4 w-4" />
                    <span>{isPlaying ? 'Playing...' : 'Listen'}</span>
                  </button>
                  
                  <button
                    onClick={handleCopy}
                    className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center space-x-1 text-sm font-medium"
                  >
                    {copied ? (
                      <>
                        <CheckIcon className="h-4 w-4 text-green-500" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <ClipboardIcon className="h-4 w-4" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                
                <button
                  onClick={handleTranslate}
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                >
                  Re-translate
                </button>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center">
              <LanguageIcon className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No translation available
              </p>
              <button
                onClick={handleTranslate}
                className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
              >
                Translate Now
              </button>
            </div>
          )}
        </div>
      </div>
      
      {/* Language Settings */}
      <div className="border-t border-gray-200 dark:border-gray-700 p-3">
        <div className="flex items-center justify-between">
          <select
            value={reduxSourceLanguage}
            onChange={(e) => setSourceLanguage(e.target.value)}
            className="text-xs bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1"
          >
            <option value="auto">Auto-detect</option>
            {supportedLanguages.map((lang: any) => (
              <option key={lang.code} value={lang.code}>
                {getLanguageName(lang.code)}
              </option>
            ))}
          </select>
          
          <ArrowPathIcon className="h-4 w-4 text-gray-400" />
          
          <select
            value={reduxTargetLanguage}
            onChange={(e) => setTargetLanguage(e.target.value)}
            className="text-xs bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1"
          >
            {supportedLanguages.map((lang: any) => (
              <option key={lang.code} value={lang.code}>
                {getLanguageName(lang.code)}
              </option>
            ))}
          </select>
        </div>
      </div>
      
      {/* Footer */}
      <div className="border-t border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-900">
        <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
          Translation feature
        </div>
      </div>
    </div>
  );
};

export default TranslationOverlay;

# 19 - TranslationSetting

import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from '../../hooks/useTranslation';
import {
  setSourceLanguage,
  setTargetLanguage,
  swapLanguages,
  setTranslationEnabled,
  setSupportedLanguages,
  selectSupportedLanguages,
  selectSourceLanguage,
  selectTargetLanguage,
  selectTranslationEnabled,
} from '../../features/translation/translationSlice';
import {
  ArrowPathIcon,
  LanguageIcon,
  MicrophoneIcon,
  SpeakerWaveIcon,
  Cog6ToothIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';

interface TranslationSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

const TranslationSettings: React.FC<TranslationSettingsProps> = ({ isOpen, onClose }) => {
  const dispatch = useDispatch();
  const { getLanguageName, getLanguageNativeName } = useTranslation();
  
  const supportedLanguages = useSelector(selectSupportedLanguages);
  const sourceLanguage = useSelector(selectSourceLanguage);
  const targetLanguage = useSelector(selectTargetLanguage);
  const translationEnabled = useSelector(selectTranslationEnabled);
  
  const [selectedTab, setSelectedTab] = useState<'general' | 'languages' | 'voice'>('general');
  const [autoDetect, setAutoDetect] = useState(true);
  
  if (!isOpen) return null;
  
  const handleResetToDefaults = () => {
    dispatch(setTranslationEnabled(true));
    setAutoDetect(true);
    dispatch(setSourceLanguage('auto'));
    dispatch(setTargetLanguage(navigator.language.split('-')[0] || 'en'));
  };
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="border-b border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <LanguageIcon className="h-8 w-8 text-blue-500" />
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  Translation Settings
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Configure real-time translation preferences
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <span className="sr-only">Close</span>
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Tabs */}
          <div className="flex space-x-4 mt-6">
            <button
              onClick={() => setSelectedTab('general')}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                selectedTab === 'general'
                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300'
              }`}
            >
              <Cog6ToothIcon className="h-4 w-4 inline mr-2" />
              General
            </button>
            <button
              onClick={() => setSelectedTab('languages')}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                selectedTab === 'languages'
                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300'
              }`}
            >
              <LanguageIcon className="h-4 w-4 inline mr-2" />
              Languages
            </button>
            <button
              onClick={() => setSelectedTab('voice')}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                selectedTab === 'voice'
                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300'
              }`}
            >
              <SpeakerWaveIcon className="h-4 w-4 inline mr-2" />
              Voice
            </button>
          </div>
        </div>
        
        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {selectedTab === 'general' && (
            <div className="space-y-6">
              {/* Enable/Disable */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                    Enable Translation
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Turn translation features on or off
                  </p>
                </div>
                <button
                  onClick={() => dispatch(setTranslationEnabled(!translationEnabled))}
                  className={`
                    relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                    ${translationEnabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-700'}
                  `}
                >
                  <span className="sr-only">Enable translation</span>
                  <span
                    className={`
                      inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                      ${translationEnabled ? 'translate-x-6' : 'translate-x-1'}
                    `}
                  />
                </button>
              </div>
              
              {/* Auto-detect */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                    Auto-detect Language
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Automatically detect source language
                  </p>
                </div>
                <button
                  onClick={() => setAutoDetect(!autoDetect)}
                  className={`
                    relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                    ${autoDetect ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-700'}
                  `}
                >
                  <span className="sr-only">Auto-detect language</span>
                  <span
                    className={`
                      inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                      ${autoDetect ? 'translate-x-6' : 'translate-x-1'}
                    `}
                  />
                </button>
              </div>
              
              {/* Language Swap */}
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                    Language Direction
                  </h3>
                  <button
                    onClick={() => dispatch(swapLanguages())}
                    className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800"
                    title="Swap languages"
                  >
                    <ArrowPathIcon className="h-5 w-5" />
                  </button>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Source Language
                    </label>
                    <select
                      value={sourceLanguage}
                      onChange={(e) => dispatch(setSourceLanguage(e.target.value))}
                      disabled={autoDetect}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
                    >
                      <option value="auto">Auto-detect</option>
                      {supportedLanguages.map((lang: any) => (
                        <option key={lang.code} value={lang.code}>
                          {getLanguageName(lang.code)}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Target Language
                    </label>
                    <select
                      value={targetLanguage}
                      onChange={(e) => dispatch(setTargetLanguage(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {supportedLanguages.map((lang: any) => (
                        <option key={lang.code} value={lang.code}>
                          {getLanguageName(lang.code)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                
                <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    Current: {sourceLanguage === 'auto' ? 'Auto-detect' : getLanguageName(sourceLanguage)} → {getLanguageName(targetLanguage)}
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {selectedTab === 'languages' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  Supported Languages
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {supportedLanguages.map((lang: any) => (
                    <div
                      key={lang.code}
                      className={`
                        p-3 rounded-lg border cursor-pointer transition-colors
                        ${targetLanguage === lang.code
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                        }
                      `}
                      onClick={() => dispatch(setTargetLanguage(lang.code))}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {lang.name}
                          </p>
                          {lang.nativeName && (
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              {lang.nativeName}
                            </p>
                          )}
                        </div>
                        {targetLanguage === lang.code && (
                          <CheckIcon className="h-5 w-5 text-blue-500" />
                        )}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {lang.code}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          
          {selectedTab === 'voice' && (
            <div className="space-y-6">
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  Voice Settings
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Speech Recognition Language
                    </label>
                    <select
                      value={sourceLanguage === 'auto' ? 'en-US' : sourceLanguage}
                      onChange={(e) => dispatch(setSourceLanguage(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
                    >
                      <option value="en-US">English (US)</option>
                      <option value="en-GB">English (UK)</option>
                      <option value="es-ES">Spanish</option>
                      <option value="fr-FR">French</option>
                      <option value="de-DE">German</option>
                      <option value="ja-JP">Japanese</option>
                      <option value="ko-KR">Korean</option>
                      <option value="zh-CN">Chinese</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Speech Synthesis Language
                    </label>
                    <select
                      value={targetLanguage}
                      onChange={(e) => dispatch(setTargetLanguage(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
                    >
                      <option value="en-US">English (US)</option>
                      <option value="en-GB">English (UK)</option>
                      <option value="es-ES">Spanish</option>
                      <option value="fr-FR">French</option>
                      <option value="de-DE">German</option>
                      <option value="ja-JP">Japanese</option>
                      <option value="ko-KR">Korean</option>
                      <option value="zh-CN">Chinese</option>
                    </select>
                  </div>
                </div>
              </div>
              
              <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                <h4 className="font-medium text-gray-900 dark:text-white mb-3">
                  Voice Preview
                </h4>
                <div className="flex items-center space-x-4">
                  <button className="p-3 bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 rounded-full hover:bg-blue-200 dark:hover:bg-blue-800">
                    <MicrophoneIcon className="h-6 w-6" />
                  </button>
                  <div className="flex-1">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Click to test microphone and speech recognition
                    </p>
                  </div>
                  <button className="p-3 bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-300 rounded-full hover:bg-green-200 dark:hover:bg-green-800">
                    <SpeakerWaveIcon className="h-6 w-6" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-6 bg-gray-50 dark:bg-gray-900">
          <div className="flex justify-between">
            <button
              onClick={handleResetToDefaults}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
            >
              Reset to Defaults
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TranslationSettings;

# 20 - SocketContext

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import io, { Socket } from 'socket.io-client';
import { useSelector } from 'react-redux';
import { selectAccessToken, selectCurrentUser } from '../features/auth/authSlice';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
});

export const useSocket = () => useContext(SocketContext);

interface SocketProviderProps {
  children: ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  
  const accessToken = useSelector(selectAccessToken);
  const user = useSelector(selectCurrentUser);

  useEffect(() => {
    if (!accessToken || !user) return;

    const socketInstance = io(process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000', {
      auth: {
        token: accessToken,
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketInstance.on('connect', () => {
      console.log('Socket connected:', socketInstance.id);
      setIsConnected(true);
      
      // Authenticate with user ID
      socketInstance.emit('authenticate', user._id);
    });

    socketInstance.on('disconnect', () => {
      console.log('Socket disconnected');
      setIsConnected(false);
    });

    socketInstance.on('connect_error', (error: any) => {
      console.error('Socket connection error:', error.message);
    });

    socketInstance.on('user-online', (data: any) => {
      console.log('User online:', data);
    });

    socketInstance.on('user-offline', (data: any) => {
      console.log('User offline:', data);
    });
    

    setSocket(socketInstance);

    return () => {
      if (socketInstance) {
        socketInstance.disconnect();
      }
    };
  }, [accessToken, user]);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
};

# 21 - authApi.ts

import { apiSlice } from '../../app/apiSlice';

export interface User {
  _id: string;
  name: string;
  email: string;
  picture: string;
  status: string;
  isOnline: boolean;
  lastSeen: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  picture?: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  data: {
    user: User;
    accessToken: string;
  };
}

export interface ProfileResponse {
  success: boolean;
  data: {
    user: User;
  };
}

export const authApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation<AuthResponse, LoginRequest>({
      query: (credentials) => ({
        url: '/auth/login',
        method: 'POST',
        body: credentials,
      }),
    }),
    
    register: builder.mutation<AuthResponse, RegisterRequest>({
      query: (userData) => ({
        url: '/auth/register',
        method: 'POST',
        body: userData,
      }),
    }),
    
    logout: builder.mutation<void, void>({
      query: () => ({
        url: '/auth/logout',
        method: 'POST',
      }),
    }),
    
    getProfile: builder.query<ProfileResponse, void>({
      query: () => '/auth/profile',
      providesTags: ['User'],
    }),
    
    updateProfile: builder.mutation<ProfileResponse, Partial<User>>({
      query: (userData) => ({
        url: '/auth/profile',
        method: 'PUT',
        body: userData,
      }),
      invalidatesTags: ['User'],
    }),
  }),
});

export const {
  useLoginMutation,
  useRegisterMutation,
  useLogoutMutation,
  useGetProfileQuery,
  useUpdateProfileMutation,
} = authApi;

# 22 - authSlice

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { RootState } from '../../app/store';

export interface User {
  _id: string;
  name: string;
  email: string;
  picture: string;
  status: string;
  isOnline: boolean;
  lastSeen: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;
  error: string | null;
}

const initialState: AuthState = {
  user: null,
  accessToken: null,
  isLoading: false,
  error: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials: (
      state,
      action: PayloadAction<{ user: User; accessToken: string }>
    ) => {
      state.user = action.payload.user;
      state.accessToken = action.payload.accessToken;
      state.error = null;
    },

    setAccessToken: (state, action: PayloadAction<string>) => {
      state.accessToken = action.payload;
    },

    logout: (state) => {
      state.user = null;
      state.accessToken = null;
      state.error = null;
    },

    setError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
    },

    clearError: (state) => {
      state.error = null;
    },
  },
});

export const {
  setCredentials,
  setAccessToken,
  logout,
  setError,
  clearError,
} = authSlice.actions;

export default authSlice.reducer;

/* ✅ SELECTORS */
export const selectCurrentUser = (state: RootState) => state.auth.user;
export const selectAccessToken = (state: RootState) => state.auth.accessToken;
export const selectIsAuthenticated = (state: RootState) =>
  Boolean(state.auth.accessToken);
export const selectAuthError = (state: RootState) => state.auth.error;

# 23 - callApi

import { apiSlice } from "../../app/apiSlice";

export enum CallType {
  VOICE = "voice",
  VIDEO = "video",
}

export enum CallStatus {
  INITIATED = "initiated",
  RINGING = "ringing",
  ANSWERED = "answered",
  REJECTED = "rejected",
  MISSED = "missed",
  ENDED = "ended",
  BUSY = "busy",
  FAILED = "failed",
}

export interface CallParticipant {
  userId: {
    _id: string;
    name: string;
    email: string;
    picture?: string;
  };
  joinedAt: string | null;
  isActive: boolean;
  streamId?: string;
}

export interface InitiateCallPayload {
  participantIds: string[];
  type: CallType;
  chatId?: string;
  metadata?: {
    translationEnabled?: boolean;
    sourceLanguage?: string;
    targetLanguage?: string;
  };
}

export interface CallRecording {
  url: string;
  duration: number;
  fileSize: number;
  createdAt: string;
}

export interface Call {
  _id: string;
  callId: string;
  initiator: {
    _id: string;
    name: string;
    picture: string;
    email: string;
  };
  participants: CallParticipant[];
  type: CallType;
  status: CallStatus;
  chat?: string;
  startTime: string;
  endTime?: string;
  duration?: number;
  recording?: CallRecording;
  sfuServer?: string;
  turnServers: Array<{
    urls: string[];
    username?: string;
    credential?: string;
  }>;
  metadata: {
    isRecording: boolean;
    isScreenSharing: boolean;
    translationEnabled: boolean;
    sourceLanguage?: string;
    targetLanguage?: string;
    maxParticipants?: number;
  };
  isActive?: boolean;
  isGroupCall?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CallHistoryResponse {
  calls: Call[];
  total: number;
  page: number;
  totalPages: number;
}

interface InitiateCallResponse {
  success: boolean;
  message: string;
  data: {
    call: Call;
  };
}

export const callApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // Initiate a call
    initiateCall: builder.mutation<InitiateCallResponse, InitiateCallPayload>({
      query: (data) => ({
        url: "/calls/initiate",
        method: "POST",
        body: data,
      }),
    }),

    // Get call by ID
    getCall: builder.query<{ call: Call }, string>({
      query: (callId) => `/calls/${callId}`,
      providesTags: (result, error, callId) => [{ type: "Call", id: callId }],
    }),

    // Get active calls
    getActiveCalls: builder.query<{ calls: Call[] }, void>({
      query: () => "/calls/active",
      providesTags: ["Call"],
    }),

    // Get call history
    getCallHistory: builder.query<
      CallHistoryResponse,
      { page?: number; limit?: number }
    >({
      query: ({ page = 1, limit = 50 }) => ({
        url: `/calls/history?page=${page}&limit=${limit}`,
        method: "GET",
      }),
      providesTags: ["Call"],
    }),

    // Answer a call
    answerCall: builder.mutation<{ call: Call }, string>({
      query: (callId) => ({
        url: `/calls/${callId}/answer`,
        method: "POST",
      }),
      invalidatesTags: ["Call"],
    }),

    // Reject a call
    rejectCall: builder.mutation<
      { call: Call },
      { callId: string; reason?: string }
    >({
      query: ({ callId, reason }) => ({
        url: `/calls/${callId}/reject`,
        method: "POST",
        body: { reason },
      }),
      invalidatesTags: ["Call"],
    }),

    // End a call
    endCall: builder.mutation({
      query: (callId: string) => ({
        url: `/calls/${callId}/end`,
        method: "PATCH",
      }),
    }),

    // Join a call
    joinCall: builder.mutation<
      { call: Call },
      { callId: string; streamId?: string }
    >({
      query: ({ callId, streamId }) => ({
        url: `/calls/${callId}/join`,
        method: "POST",
        body: { streamId },
      }),
      invalidatesTags: ["Call"],
    }),

    // Leave a call
    leaveCall: builder.mutation<{ call: Call }, string>({
      query: (callId) => ({
        url: `/calls/${callId}/leave`,
        method: "POST",
      }),
      invalidatesTags: ["Call"],
    }),

    // Update call metadata
    updateCallMetadata: builder.mutation<
      { call: Call },
      { callId: string; updates: any }
    >({
      query: ({ callId, updates }) => ({
        url: `/calls/${callId}/metadata`,
        method: "PATCH",
        body: updates,
      }),
      invalidatesTags: ["Call"],
    }),

    // Get ICE servers
    getIceServers: builder.query<{ iceServers: RTCIceServer[] }, void>({
      query: () => "/calls/ice-servers",
    }),

    // Get call stats
    getCallStats: builder.query<any, string>({
      query: (callId) => `/calls/${callId}/stats`,
    }),
  }),
});

export const {
  useInitiateCallMutation,
  useGetCallQuery,
  useGetActiveCallsQuery,
  useGetCallHistoryQuery,
  useAnswerCallMutation,
  useRejectCallMutation,
  useEndCallMutation,
  useJoinCallMutation,
  useLeaveCallMutation,
  useUpdateCallMetadataMutation,
  useGetIceServersQuery,
  useGetCallStatsQuery,
} = callApi;

# 24 - callSlice

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Call } from './callApi';

interface CallState {
  activeCall: Call | null;
  incomingCall: Call | null;
  callHistory: Call[];
  localStream: MediaStream | null;
  remoteStream: MediaStream | null; // ✅ ADD THIS
  isCalling: boolean;
  isRinging: boolean;
  isInCall: boolean;
  isMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
  isRecording: boolean;
  translationEnabled: boolean;
  sourceLanguage: string;
  targetLanguage: string;
  iceServers: RTCIceServer[];
  isLoading: boolean;
  error: string | null;
}

const initialState: CallState = {
  activeCall: null,
  incomingCall: null,
  callHistory: [],
  localStream: null,
  remoteStream: null, // ✅ ADD THIS
  isCalling: false,
  isRinging: false,
  isInCall: false,
  isMuted: false,
  isVideoOff: false,
  isScreenSharing: false,
  isRecording: false,
  translationEnabled: false,
  sourceLanguage: 'en',
  targetLanguage: 'en',
  iceServers: [],
  isLoading: false,
  error: null,
};

const callSlice = createSlice({
  name: 'call',
  initialState,
  reducers: {
    // Call management
    setActiveCall: (state, action: PayloadAction<Call | null>) => {
      state.activeCall = action.payload;
      state.isInCall = !!action.payload;
    },
    
    setIncomingCall: (state, action: PayloadAction<Call | null>) => {
      state.incomingCall = action.payload;
      state.isRinging = !!action.payload;
    },
    
    setCallHistory: (state, action: PayloadAction<Call[]>) => {
      state.callHistory = action.payload;
    },
    
    addCallToHistory: (state, action: PayloadAction<Call>) => {
      state.callHistory.unshift(action.payload);
    },
    
    // Stream management
    setLocalStream: (state, action: PayloadAction<MediaStream | null>) => {
      state.localStream = action.payload;
    },
    
    // ✅ ADD THIS: Remote stream management
    setRemoteStream: (state, action: PayloadAction<MediaStream | null>) => {
      state.remoteStream = action.payload;
    },
    
    // Call status
    setIsCalling: (state, action: PayloadAction<boolean>) => {
      state.isCalling = action.payload;
    },
    
    setIsRinging: (state, action: PayloadAction<boolean>) => {
      state.isRinging = action.payload;
    },
    
    setIsInCall: (state, action: PayloadAction<boolean>) => {
      state.isInCall = action.payload;
    },
    
    // Media controls
    toggleMute: (state) => {
      state.isMuted = !state.isMuted;
      if (state.localStream) {
        const audioTracks = state.localStream.getAudioTracks();
        audioTracks.forEach(track => {
          track.enabled = !state.isMuted;
        });
      }
    },

    
    
    toggleVideo: (state) => {
      state.isVideoOff = !state.isVideoOff;
      if (state.localStream) {
        const videoTracks = state.localStream.getVideoTracks();
        videoTracks.forEach(track => {
          track.enabled = !state.isVideoOff;
        });
      }
    },
    
    toggleScreenSharing: (state, action: PayloadAction<boolean>) => {
      state.isScreenSharing = action.payload;
    },
    
    toggleRecording: (state, action: PayloadAction<boolean>) => {
      state.isRecording = action.payload;
    },
    
    // Translation
    toggleTranslation: (state) => {
      state.translationEnabled = !state.translationEnabled;
    },
    
    setSourceLanguage: (state, action: PayloadAction<string>) => {
      state.sourceLanguage = action.payload;
    },
    
    setTargetLanguage: (state, action: PayloadAction<string>) => {
      state.targetLanguage = action.payload;
    },
    
    // ICE servers
    setIceServers: (state, action: PayloadAction<RTCIceServer[]>) => {
      state.iceServers = action.payload;
    },
    
    // Loading & error
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    
    // Reset call state
    resetCallState: (state) => {
      state.activeCall = null;
      state.incomingCall = null;
      state.isCalling = false;
      state.isRinging = false;
      state.isInCall = false;
      state.isMuted = false;
      state.isVideoOff = false;
      state.isScreenSharing = false;
      state.isRecording = false;
      state.translationEnabled = false;
      state.localStream = null;
      state.remoteStream = null; // ✅ CLEAR REMOTE STREAM
      state.error = null;
    },
    
    // Full reset
    resetAll: () => initialState,
  },
});

export const {
  setActiveCall,
  setIncomingCall,
  setCallHistory,
  addCallToHistory,
  setLocalStream,
  setRemoteStream, // ✅ EXPORT THIS
  setIsCalling,
  setIsRinging,
  setIsInCall,
  toggleMute,
  toggleVideo,
  toggleScreenSharing,
  toggleRecording,
  toggleTranslation,
  setSourceLanguage,
  setTargetLanguage,
  setIceServers,
  setLoading,
  setError,
  resetCallState,
  resetAll,
} = callSlice.actions;

export default callSlice.reducer;

// Selectors
export const selectActiveCall = (state: { call: CallState }) => state.call.activeCall;
export const selectIncomingCall = (state: { call: CallState }) => state.call.incomingCall;
export const selectCallHistory = (state: { call: CallState }) => state.call.callHistory;
export const selectLocalStream = (state: { call: CallState }) => state.call.localStream;
export const selectRemoteStream = (state: { call: CallState }) => state.call.remoteStream; // ✅ ADD THIS
export const selectIsCalling = (state: { call: CallState }) => state.call.isCalling;
export const selectIsRinging = (state: { call: CallState }) => state.call.isRinging;
export const selectIsInCall = (state: { call: CallState }) => state.call.isInCall;
export const selectIsMuted = (state: { call: CallState }) => state.call.isMuted;
export const selectIsVideoOff = (state: { call: CallState }) => state.call.isVideoOff;
export const selectIsScreenSharing = (state: { call: CallState }) => state.call.isScreenSharing;
export const selectIsRecording = (state: { call: CallState }) => state.call.isRecording;
export const selectTranslationEnabled = (state: { call: CallState }) => state.call.translationEnabled;
export const selectSourceLanguage = (state: { call: CallState }) => state.call.sourceLanguage;
export const selectTargetLanguage = (state: { call: CallState }) => state.call.targetLanguage;
export const selectIceServers = (state: { call: CallState }) => state.call.iceServers;
export const selectIsLoading = (state: { call: CallState }) => state.call.isLoading;
export const selectCallError = (state: { call: CallState }) => state.call.error;

# 25 - chatApi

import { apiSlice } from "../../app/apiSlice";

export interface Message {
  _id: string;
  sender: {
    _id: string;
    name: string;
    picture: string;
    email: string;
  };
  content: string;
  type: "text" | "image" | "file" | "audio" | "video" | "location";
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  thumbnail?: string;
  duration?: number;
  latitude?: number;
  longitude?: number;
  locationName?: string;
  readBy: string[];
  deleted: boolean;
  deletedAt?: string;
  forwarded: boolean;
  forwardedFrom?: any;
  replyTo?: Message;
  reactions: Array<{
    userId: string;
    emoji: string;
    user?: {
      name: string;
      picture: string;
    };
  }>;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface Chat {
  _id: string;
  participants: Array<{
    _id: string;
    name: string;
    picture: string;
    email: string;
    isOnline?: boolean;
    lastSeen?: string;
  }>;
  isGroup: boolean;
  groupName?: string;
  groupPhoto?: string;
  groupDescription?: string;
  groupAdmins: string[];
  lastMessage?: Message;
  lastMessageAt: string;
  pinned: boolean;
  mutedBy: string[];
  archivedBy: string[];
  typing: Array<{
    userId: string;
    startedAt: string;
    user?: {
      name: string;
      picture: string;
    };
  }>;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SendMessageRequest {
  content?: string;
  type?: Message["type"];
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  thumbnail?: string;
  duration?: number;
  latitude?: number;
  longitude?: number;
  locationName?: string;
  replyTo?: string;
  forwarded?: boolean;
  forwardedFrom?: string;
}

export interface MessagesResponse {
  messages: Message[];
  total: number;
  page: number;
  totalPages: number;
  hasMore: boolean;
}

export interface ChatsResponse {
  chats: Chat[];
  total: number;
  page: number;
  totalPages: number;
}

export const chatApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // Get all chats
    getChats: builder.query<{data : ChatsResponse}, { page?: number; limit?: number }>({
      query: ({ page = 1, limit = 50 }) => ({
        url: `/chats?page=${page}&limit=${limit}`,
        method: "GET",
      }),
      providesTags: ["Chat"],
    }),

    // Get or create chat with user
    getOrCreateChat: builder.mutation<{ data: { chat: Chat } }, string>({
      query: (targetUserId) => ({
        url: `/chats/user/${targetUserId}`,
        method: "GET",
      }),
      invalidatesTags: ["Chat"],
    }),

    // Get chat by ID
    getChat: builder.query<{ chat: Chat }, string>({
      query: (chatId) => `/chat/${chatId}`,
      providesTags: (result, error, chatId) => [{ type: "Chat", id: chatId }],
    }),

    // Create group chat
    createGroup: builder.mutation<
      { chat: Chat },
      {
        name: string;
        participants: string[];
        photo?: string;
        description?: string;
      }
    >({
      query: (groupData) => ({
        url: "/chat/group",
        method: "POST",
        body: groupData,
      }),
      invalidatesTags: ["Chat"],
    }),

    // Get chat messages
    getMessages: builder.query<{
      data: MessagesResponse},
      {
        chatId: string;
        page?: number;
        limit?: number;
      }
    >({
      query: ({ chatId, page = 1, limit = 50 }) => ({
        url: `/chats/${chatId}/messages?page=${page}&limit=${limit}`,
        method: "GET",
      }),
    }),

    // Send message
    sendMessage: builder.mutation<
      { data: { message: Message } },
      {
        chatId: string;
        data: SendMessageRequest;
      }
    >({
      query: ({ chatId, data }) => ({
        url: `/chats/${chatId}/messages`,
        method: "POST",
        body: data,
      }),
      invalidatesTags: ["Chat", "Message"],
    }),

    // Mark messages as read
    markAsRead: builder.mutation<
      { readCount: number },
      {
        chatId: string;
        messageIds?: string[];
      }
    >({
      query: ({ chatId, messageIds }) => ({
        url: `/chat/${chatId}/messages/read`,
        method: "POST",
        body: { messageIds },
      }),
      invalidatesTags: (result, error, { chatId }) => [
        { type: "Message", id: chatId },
        { type: "Chat" },
      ],
    }),

    // Delete message
    deleteMessage: builder.mutation<{ message: Message }, string>({
      query: (messageId) => ({
        url: `/chat/messages/${messageId}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Message", "Chat"],
    }),

    // Add reaction
    addReaction: builder.mutation<
      { message: Message },
      {
        messageId: string;
        emoji: string;
      }
    >({
      query: ({ messageId, emoji }) => ({
        url: `/chat/messages/${messageId}/reactions`,
        method: "POST",
        body: { emoji },
      }),
      invalidatesTags: ["Message"],
    }),

    // Remove reaction
    removeReaction: builder.mutation<{ message: Message }, string>({
      query: (messageId) => ({
        url: `/chat/messages/${messageId}/reactions`,
        method: "DELETE",
      }),
      invalidatesTags: ["Message"],
    }),

    // Update typing status
    updateTyping: builder.mutation<
      void,
      {
        chatId: string;
        isTyping: boolean;
      }
    >({
      query: ({ chatId, isTyping }) => ({
        url: `/chat/${chatId}/typing`,
        method: "POST",
        body: { isTyping },
      }),
    }),

    // Get chat stats
    getChatStats: builder.query<any, string>({
      query: (chatId) => `/chat/${chatId}/stats`,
    }),

    // Search messages
    searchMessages: builder.query<
      MessagesResponse,
      {
        chatId: string;
        query: string;
        page?: number;
        limit?: number;
      }
    >({
      query: ({ chatId, query, page = 1, limit = 20 }) => ({
        url: `/chat/${chatId}/search?q=${query}&page=${page}&limit=${limit}`,
        method: "GET",
      }),
    }),
  }),
});

export const {
  useGetChatsQuery,
  useGetOrCreateChatMutation,
  useGetChatQuery,
  useCreateGroupMutation,
  useGetMessagesQuery,
  useSendMessageMutation,
  useMarkAsReadMutation,
  useDeleteMessageMutation,
  useAddReactionMutation,
  useRemoveReactionMutation,
  useUpdateTypingMutation,
  useGetChatStatsQuery,
  useSearchMessagesQuery,
} = chatApi;


# 26 - chatSlice

import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Chat, Message } from "./chatApi";

interface ChatState {
  chats: Chat[];
  activeChat: Chat | null;
  messages: Message[];
  typingUsers: string[];
  selectedMessages: string[];
  searchQuery: string;
  isLoading: boolean;
  error: string | null;
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

const initialState: ChatState = {
  chats: [],
  activeChat: null,
  messages: [],
  typingUsers: [],
  selectedMessages: [],
  searchQuery: "",
  isLoading: false,
  error: null,
  pagination: {
    page: 1,
    limit: 50,
    total: 0,
    hasMore: true,
  },
};

const chatSlice = createSlice({
  name: "chat",
  initialState,
  reducers: {
    // Chat actions
    setChats: (state, action: PayloadAction<Chat[]>) => {
      state.chats = action.payload;
    },

    addChat: (state, action: PayloadAction<Chat>) => {
      // Remove if exists (to update)
      state.chats = state.chats.filter(
        (chat) => chat._id !== action.payload._id,
      );
      // Add to beginning
      state.chats.unshift(action.payload);
    },


    updateChat: (
      state,
      action: PayloadAction<{ chatId: string; updates: Partial<Chat> }>,
    ) => {
      const index = state.chats.findIndex(
        (chat) => chat._id === action.payload.chatId,
      );
      if (index !== -1) {
        state.chats[index] = {
          ...state.chats[index],
          ...action.payload.updates,
        };

        // Update active chat if it's the same
        if (state.activeChat?._id === action.payload.chatId) {
          state.activeChat = { ...state.activeChat, ...action.payload.updates };
        }
      }
    },

    removeChat: (state, action: PayloadAction<string>) => {
      state.chats = state.chats.filter((chat) => chat._id !== action.payload);
      if (state.activeChat?._id === action.payload) {
        state.activeChat = null;
      }
    },

    setActiveChat: (state, action: PayloadAction<Chat | null>) => {
      state.activeChat = action.payload;
      state.selectedMessages = [];
    },

    // Message actions
    setMessages: (state, action: PayloadAction<Message[]>) => {
      state.messages = action.payload;
    },

    addMessage: (state, action: PayloadAction<Message>) => {
      // Check if message already exists
      const exists = state.messages.some(
        (msg) => msg._id === action.payload._id,
      );
      if (!exists) {
        state.messages.push(action.payload);
        state.messages.sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
      }
    },

    prependMessages: (state, action: PayloadAction<Message[]>) => {
      const newMessages = action.payload.filter(
        (newMsg) =>
          !state.messages.some((existing) => existing._id === newMsg._id),
      );
      state.messages = [...newMessages, ...state.messages];
    },

    updateMessage: (
      state,
      action: PayloadAction<{ messageId: string; updates: Partial<Message> }>,
    ) => {
      const index = state.messages.findIndex(
        (msg) => msg._id === action.payload.messageId,
      );
      if (index !== -1) {
        state.messages[index] = {
          ...state.messages[index],
          ...action.payload.updates,
        };
      }
    },

    deleteMessage: (state, action: PayloadAction<string>) => {
      state.messages = state.messages.filter(
        (msg) => msg._id !== action.payload,
      );
    },

    // Typing actions
    setTypingUsers: (state, action: PayloadAction<string[]>) => {
      state.typingUsers = action.payload;
    },

    addTypingUser: (state, action: PayloadAction<string>) => {
      if (!state.typingUsers.includes(action.payload)) {
        state.typingUsers.push(action.payload);
      }
    },

    removeTypingUser: (state, action: PayloadAction<string>) => {
      state.typingUsers = state.typingUsers.filter(
        (userId) => userId !== action.payload,
      );
    },

    // Selection actions
    toggleMessageSelection: (state, action: PayloadAction<string>) => {
      const index = state.selectedMessages.indexOf(action.payload);
      if (index === -1) {
        state.selectedMessages.push(action.payload);
      } else {
        state.selectedMessages.splice(index, 1);
      }
    },

    clearSelectedMessages: (state) => {
      state.selectedMessages = [];
    },

    // Search actions
    setSearchQuery: (state, action: PayloadAction<string>) => {
      state.searchQuery = action.payload;
    },

    // Loading & error
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },

    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },

    // Pagination
    setPagination: (
      state,
      action: PayloadAction<Partial<ChatState["pagination"]>>,
    ) => {
      state.pagination = { ...state.pagination, ...action.payload };
    },

    incrementPage: (state) => {
      state.pagination.page += 1;
    },

    resetPage: (state) => {
      state.pagination.page = 1;
      state.pagination.hasMore = true;
    },

    // Clear all
    clearChatState: (state) => {
      state.activeChat = null;
      state.messages = [];
      state.typingUsers = [];
      state.selectedMessages = [];
      state.searchQuery = "";
    },

    // Reset
    resetChatState: () => initialState,
  },
});

export const {
  setChats,
  addChat,
  updateChat,
  removeChat,
  setActiveChat,
  setMessages,
  addMessage,
  prependMessages,
  updateMessage,
  deleteMessage,
  setTypingUsers,
  addTypingUser,
  removeTypingUser,
  toggleMessageSelection,
  clearSelectedMessages,
  setSearchQuery,
  setLoading,
  setError,
  setPagination,
  incrementPage,
  resetPage,
  clearChatState,
  resetChatState,
} = chatSlice.actions;

export default chatSlice.reducer;

// Selectors
export const selectChats = (state: { chat: ChatState }) => state.chat.chats;
export const selectActiveChat = (state: { chat: ChatState }) =>
  state.chat.activeChat;
export const selectMessages = (state: { chat: ChatState }) =>
  state.chat.messages;
export const selectTypingUsers = (state: { chat: ChatState }) =>
  state.chat.typingUsers;
export const selectedMessages = (state: { chat: ChatState }) =>
  state.chat.selectedMessages;
export const selectSearchQuery = (state: { chat: ChatState }) =>
  state.chat.searchQuery;
export const selectIsLoading = (state: { chat: ChatState }) =>
  state.chat.isLoading;
export const selectChatError = (state: { chat: ChatState }) => state.chat.error;
export const selectPagination = (state: { chat: ChatState }) =>
  state.chat.pagination;

# 27 - translationSlice

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

const initialState: TranslationState = {
  supportedLanguages: [],
  currentSession: null,
  sessions: [],
  isTranslating: false,
  translationEnabled: false,
  sourceLanguage: 'en',
  targetLanguage: 'es',
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

# 28 - translationApi

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

# 29 - friendRequestApi

import { apiSlice } from '../../app/apiSlice';

export const friendRequestApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({

    sendFriendRequest: builder.mutation<any, { toUserId: string }>({
      query: (body) => ({
        url: '/friend-requests/send',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['FriendRequest'],
    }),

    getSentRequests: builder.query<any, void>({
      query: () => '/friend-requests/sent',
      providesTags: ['FriendRequest'],
    }),

    getReceivedRequests: builder.query<any, void>({
      query: () => '/friend-requests/received',
      providesTags: ['FriendRequest'],
    }),

    acceptFriendRequest: builder.mutation<any, string>({
      query: (requestId) => ({
        url: `/friend-requests/${requestId}/accept`,
        method: 'POST',
      }),
      invalidatesTags: ['FriendRequest'],
    }),

    rejectFriendRequest: builder.mutation<any, string>({
      query: (requestId) => ({
        url: `/friend-requests/${requestId}/reject`,
        method: 'POST',
      }),
      invalidatesTags: ['FriendRequest'],
    }),

    getFriendshipStatus: builder.query<any, string>({
      query: (userId) => `/friend-requests/status/${userId}`,
      providesTags: ['FriendRequest'],
    }),
  }),
});

export const {
  useSendFriendRequestMutation,
  useGetSentRequestsQuery,
  useGetReceivedRequestsQuery,
  useAcceptFriendRequestMutation,
  useRejectFriendRequestMutation,
  useGetFriendshipStatusQuery,
} = friendRequestApi;


# 30 - userApi

import { apiSlice } from '../../app/apiSlice';
import { User } from '../auth/authApi';

export interface UserResponse {
  success: boolean;
  data: {
    users: User[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ContactResponse {
  success: boolean;
  data: {
    contacts: User[];
  };
}

export const userApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // Search users
    searchUsers: builder.query<UserResponse, { 
      query: string; 
      page?: number; 
      limit?: number 
    }>({
      query: ({ query, page = 1, limit = 20 }) => ({
        url: `/users/search?query=${query}&page=${page}&limit=${limit}`,
        method: 'GET',
      }),
    }),
    
    // Get all users (excluding current user and contacts)
    getAllUsers: builder.query<UserResponse, { 
      page?: number; 
      limit?: number 
    }>({
      query: ({ page = 1, limit = 50 } = {}) => ({
        url: `/users/all?page=${page}&limit=${limit}`,
        method: 'GET',
      }),
      providesTags: ['User'],
    }),
    
    // Get user by ID
    getUserById: builder.query<{ success: boolean; data: { user: User } }, string>({
      query: (userId) => `/users/${userId}`,
    }),
    
    // Get user's contacts
    getContacts: builder.query<ContactResponse, void>({
      query: () => '/users/contacts',
      providesTags: ['User'],
    }),
    
    // Add contact
    addContact: builder.mutation<{ success: boolean; message: string; data: { user: User } }, string>({
      query: (targetUserId) => ({
        url: '/users/contacts/add',
        method: 'POST',
        body: { targetUserId },
      }),
      invalidatesTags: ['User'],
    }),
    
    // Remove contact
    removeContact: builder.mutation<{ success: boolean; message: string }, string>({
      query: (targetUserId) => ({
        url: `/users/contacts/remove/${targetUserId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['User'],
    }),
  }),
});

export const {
  useSearchUsersQuery,
  useGetAllUsersQuery,
  useGetUserByIdQuery,
  useGetContactsQuery,
  useAddContactMutation,
  useRemoveContactMutation,
} = userApi;

# 31 - useCall

import { useEffect, useRef, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useSocket } from "../context/SocketContext";
import {
  useInitiateCallMutation,
  useAnswerCallMutation,
  useRejectCallMutation,
  useEndCallMutation,
  useGetIceServersQuery,
  useUpdateCallMetadataMutation,
} from "../features/calls/callApi";
import {
  selectActiveCall,
  selectIncomingCall,
  selectLocalStream,
  selectRemoteStream,
  selectIsMuted,
  selectIsVideoOff,
  selectIsScreenSharing,
  selectIsRecording,
  selectTranslationEnabled,
  selectSourceLanguage,
  selectTargetLanguage,
  selectIceServers,
  setActiveCall,
  setIncomingCall,
  setLocalStream,
  setRemoteStream,
  setIsCalling,
  setIsRinging,
  setIsInCall,
  toggleMute,
  toggleVideo,
  toggleScreenSharing,
  toggleRecording,
  toggleTranslation,
  setSourceLanguage,
  setTargetLanguage,
  setIceServers,
  resetCallState,
} from "../features/calls/callSlice";
import { selectCurrentUser } from "../features/auth/authSlice"; // ✅ ADD THIS IMPORT
import WebRTCService from "../services/WebRTCService";
import { CallSocketService } from "../services/callSocket";
import toast from "react-hot-toast";

// Define CallType enum to match the API
enum CallType {
  VOICE = "voice",
  VIDEO = "video",
}

export const useCall = () => {
  const dispatch = useDispatch();
  const { socket, isConnected } = useSocket();

  // Selectors
  const activeCall = useSelector(selectActiveCall);
  const incomingCall = useSelector(selectIncomingCall);
  const localStream = useSelector(selectLocalStream);
  const remoteStream = useSelector(selectRemoteStream);
  const isMuted = useSelector(selectIsMuted);
  const isVideoOff = useSelector(selectIsVideoOff);
  const isScreenSharing = useSelector(selectIsScreenSharing);
  const isRecording = useSelector(selectIsRecording);
  const translationEnabled = useSelector(selectTranslationEnabled);
  const sourceLanguage = useSelector(selectSourceLanguage);
  const targetLanguage = useSelector(selectTargetLanguage);
  const iceServers = useSelector(selectIceServers);
  const currentUser = useSelector(selectCurrentUser); // ✅ ADD THIS SELECTOR

  // API hooks
  const [initiateCallApi] = useInitiateCallMutation();
  const [answerCallApi] = useAnswerCallMutation();
  const [rejectCallApi] = useRejectCallMutation();
  const [endCallApi] = useEndCallMutation();
  const [updateCallMetadataApi] = useUpdateCallMetadataMutation();
  const { data: iceServersData } = useGetIceServersQuery();

  // Refs
  const webrtcServiceRef = useRef<WebRTCService | null>(null);
  const callSocketRef = useRef<CallSocketService | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!webrtcServiceRef.current && socket) {
      webrtcServiceRef.current = new WebRTCService(
        [{ urls: "stun:stun.l.google.com:19302" }],
        socket,
      );

      (window as any).webrtc = webrtcServiceRef.current;
      console.log("✅ WebRTC force-created");
    }
  }, []);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    // Handle call answered
    socket.on("call:answered", ({ call }) => {
      dispatch(setActiveCall(call));
      dispatch(setIsCalling(false));
      dispatch(setIsInCall(true));
    });

    return () => {
      socket.off("call:answered");
    };
  }, [socket, dispatch]);

  // useCall.ts mein line 95 ke aas-paas isse badal dein:
  useEffect(() => {
    if (!socket) return;

    const handleCallEndedEvent = () => {
      console.log(
        "📴 Global Call End Signal Received - Cleaning up all streams",
      );

      // 1. Camera/Mic band karo
      if (localStream) {
        localStream.getTracks().forEach((track) => {
          track.stop();
          console.log("Stopped track:", track.kind);
        });
        dispatch(setLocalStream(null));
      }

      // 2. Screen share band karo
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop());
        screenStreamRef.current = null;
      }

      // 3. WebRTC band karo
      if (webrtcServiceRef.current) {
        webrtcServiceRef.current.cleanupAll();
      }

      // 4. Sab reset karo
      dispatch(setRemoteStream(null));
      dispatch(resetCallState());
    };

    socket.on("call:ended", handleCallEndedEvent);

    return () => {
      socket.off("call:ended", handleCallEndedEvent);
    };
  }, [socket, localStream, dispatch]);

  useEffect(() => {
    if (!socket) return;

    // Handle incoming call
    socket.on("call:incoming", ({ call }) => {
      dispatch(setIncomingCall(call));
      dispatch(setIsRinging(true));
      toast("📞 Incoming call");
    });

    return () => {
      socket.off("call:incoming");
    };
  }, [socket, dispatch]);

  // Initialize WebRTC service with ICE servers
  useEffect(() => {
    if (iceServersData?.iceServers && iceServers.length === 0) {
      dispatch(setIceServers(iceServersData.iceServers));

      if (!webrtcServiceRef.current) {
        webrtcServiceRef.current = new WebRTCService(
          iceServersData.iceServers,
          socket!,
        );

        (window as any).webrtc = webrtcServiceRef.current;
        console.log("✅ WebRTC exposed to window");

        // ✅ Set up remote stream callback immediately after creating service
        webrtcServiceRef.current.setOnRemoteStream((peerId, stream) => {
          console.log("🎥 Remote stream received from peer:", peerId);

          (window as any).remoteStream = stream; // 👈 ADD THIS

          dispatch(setRemoteStream(stream));
        });

        webrtcServiceRef.current.setOnStreamEnded((peerId) => {
          console.log("🎥 Remote stream ended from peer:", peerId);
          dispatch(setRemoteStream(null));
        });
      }
    }
  }, [iceServersData, iceServers, dispatch]);

  // ✅ Set up WebRTC callbacks (alternative approach if service already exists)
  useEffect(() => {
    if (webrtcServiceRef.current) {
      webrtcServiceRef.current.setOnRemoteStream((peerId, stream) => {
        console.log("🎥 Remote stream received from peer:", peerId);

        (window as any).remoteStream = stream; // 👈 ADD THIS

        dispatch(setRemoteStream(stream));
      });

      webrtcServiceRef.current.setOnStreamEnded((peerId) => {
        console.log("🎥 Remote stream ended from peer:", peerId);
        dispatch(setRemoteStream(null));
      });
    }
  }, [dispatch]);

  // Initialize socket service
  useEffect(() => {
  if (socket && isConnected && webrtcServiceRef.current) {

    if (callSocketRef.current) {
      callSocketRef.current.disconnect();
    }

    callSocketRef.current = new CallSocketService(
      socket,
      webrtcServiceRef.current
    );

    console.log("⚡ CallSocketService CREATED FRESH");

    return () => {
      callSocketRef.current?.disconnect();
      callSocketRef.current = null;
    };
  }
}, [socket, isConnected, webrtcServiceRef.current]);


  // Get local media stream
  const getLocalMedia = useCallback(
    async (constraints: MediaStreamConstraints) => {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      console.log("NEW STREAM CREATED");
      console.log(stream.getAudioTracks()[0].readyState);

      // Stop old stream safely BEFORE replacing
      if (localStream) {
        localStream.getTracks().forEach((track) => {
          if (track.readyState === "live") {
            track.stop();
          }
        });
      }

      dispatch(setLocalStream(stream));

      (window as any).localStream = stream;

      // 🔥 ADD LOCAL TRACKS TO ALL PEERS
      if (webrtcServiceRef.current) {
        webrtcServiceRef.current.addLocalStreamToAll(stream);
      }

      return stream;
    },
    [dispatch, localStream],
  );

  // ✅ REMOVED: remoteStreamsRef - Now handled by Redux

  // Start a call
  // useCall hook ke andar startCall function ko replace karein:

  const startCall = useCallback(
    async (
      participantIds: string[],
      type: "voice" | "video",
      chatId?: string,
    ) => {
      try {
        // 1. Get local media based on call type
        const constraints: MediaStreamConstraints = {
          audio: true,
          video:
            type === "video"
              ? {
                  width: { ideal: 1280 },
                  height: { ideal: 720 },
                  frameRate: { ideal: 30 },
                }
              : false,
        };

        const stream = await getLocalMedia(constraints);

        // 2. Initiate call via API
        const response = await initiateCallApi({
          participantIds,
          type: type === "voice" ? CallType.VOICE : CallType.VIDEO,
          chatId,
          metadata: {
            translationEnabled,
            sourceLanguage,
            targetLanguage,
          },
        }).unwrap();

        console.log("🔥 RAW API RESPONSE:", JSON.stringify(response, null, 2));

        // ✅ CRITICAL FIX: Response structure check
        // Agar backend response { call: { callId: ... } } hai toh yahi use hoga
        // Correct extraction based on backend structure
        const callData = response?.data?.call;

        if (!callData?.callId) {
          console.error("Invalid backend structure:", response);
          throw new Error("Invalid server response structure");
        }

        // 3. Socket ke through inform karein
        if (callSocketRef.current) {
          callSocketRef.current.initiateCall({
            participantIds,
            type,
            chatId,
            metadata: { callId: callData.callId },
          });
        }

        // 4. Update Redux State
        dispatch(setActiveCall(callData));
        dispatch(setIsCalling(false));
        dispatch(setIsInCall(true));

        toast.success(`${type === "video" ? "Video" : "Voice"} call started`);

        return callData;
      } catch (error: any) {
        console.error("Start call error:", error);
        // Agar error aa jaye toh local stream band karo
        if (localStream) {
          localStream.getTracks().forEach((track) => track.stop());
        }
        toast.error(error.data?.message || "Failed to start call");
        throw error;
      }
    },
    [
      initiateCallApi,
      getLocalMedia,
      translationEnabled,
      sourceLanguage,
      targetLanguage,
      dispatch,
      localStream, // Add this to dependencies
    ],
  );

  // Answer incoming call
  const answerCall = useCallback(async () => {
    if (!incomingCall) return;

    try {
      // Get local media based on call type
      const constraints: MediaStreamConstraints = {
        audio: true,
        video:
          incomingCall.type === "video"
            ? {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 },
              }
            : false,
      };

      await getLocalMedia(constraints);

      // Answer call via API
      await answerCallApi(incomingCall.callId).unwrap();

      // Also answer via socket
      if (callSocketRef.current) {
        callSocketRef.current.answerCall(incomingCall.callId);
      }

      dispatch(setActiveCall(incomingCall));
      dispatch(setIncomingCall(null));
      dispatch(setIsRinging(false));
      dispatch(setIsInCall(true));

      // ✅ JOIN CALL ROOM (RECEIVER)
      socket?.emit("call:join-room", {
        callId: incomingCall.callId,
      });

      console.log("📡 Receiver joined call room:", incomingCall.callId);

      toast.success("Call answered");
    } catch (error: any) {
      console.error("Answer call error:", error);
      toast.error(error.data?.message || "Failed to answer call");
      throw error;
    }
  }, [incomingCall, answerCallApi, getLocalMedia, dispatch]);

  // Reject incoming call
  const rejectCall = useCallback(
    async (reason?: string) => {
      if (!incomingCall) return;

      try {
        await rejectCallApi({
          callId: incomingCall.callId,
          reason,
        }).unwrap();

        if (callSocketRef.current) {
          callSocketRef.current.rejectCall(incomingCall.callId, reason);
        }

        dispatch(setIncomingCall(null));
        dispatch(setIsRinging(false));

        toast.success("Call rejected");
      } catch (error: any) {
        console.error("Reject call error:", error);
        toast.error("Failed to reject call");
      }
    },
    [incomingCall, rejectCallApi, dispatch],
  );

  // End active call
  // frontend/src/hooks/useCall.ts mein endCall function badlo:

  const endCall = useCallback(async () => {
  if (!activeCall) return;

  try {
    console.log("🔴 Ending call:", activeCall.callId);

    // Only inform server
    socket?.emit("call:end", { callId: activeCall.callId });

  } catch (error) {
    console.error("❌ End call error:", error);
  }
}, [activeCall, socket]);




  // Add this to useCall hook for debugging
  const checkCallStatus = useCallback(() => {
    console.log("📞 Current Call Status:", {
      activeCall: !!activeCall,
      activeCallId: activeCall?._id,
      localStream: localStream
        ? {
            audioTracks: localStream.getAudioTracks().length,
            videoTracks: localStream.getVideoTracks().length,
            active: localStream.active,
          }
        : "No local stream",
      remoteStream: remoteStream
        ? {
            audioTracks: remoteStream.getAudioTracks().length,
            videoTracks: remoteStream.getVideoTracks().length,
            active: remoteStream.active,
          }
        : "No remote stream",
      isMuted,
      isVideoOff,
      webrtcService: !!webrtcServiceRef.current,
      peerConnections: webrtcServiceRef.current
        ? Array.from(webrtcServiceRef.current["peerConnections"]?.keys() || [])
        : [],
    });
  }, [activeCall, localStream, remoteStream, isMuted, isVideoOff]);

  // Add this function to force terminate call on both ends
  const forceTerminateCall = useCallback(async () => {
    if (!activeCall) return;

    try {
      // 1. End call normally
      await endCall();

      // 2. Force socket emission if needed
      if (socket) {
        socket.emit("call:force-terminate", {
          callId: activeCall._id,
          userId: currentUser?._id,
        });
      }

      toast.success("Call force terminated");
    } catch (error) {
      console.error("Force terminate error:", error);
    }
  }, [activeCall, endCall, socket, currentUser]);

  // Toggle mute
  const toggleMuteCall = useCallback(() => {
    dispatch(toggleMute());
    toast.success(isMuted ? "Microphone on" : "Microphone off");
  }, [dispatch, isMuted]);

  // Toggle video
  const toggleVideoCall = useCallback(() => {
    dispatch(toggleVideo());
    toast.success(isVideoOff ? "Camera on" : "Camera off");
  }, [dispatch, isVideoOff]);

  // Toggle screen sharing
  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      // Stop screen sharing
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop());
        screenStreamRef.current = null;
      }

      dispatch(toggleScreenSharing(false));

      // Update call metadata
      if (activeCall) {
        await updateCallMetadataApi({
          callId: activeCall._id,
          updates: { isScreenSharing: false },
        });
      }

      toast.success("Screen sharing stopped");
    } else {
      try {
        // Start screen sharing
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            frameRate: { ideal: 30 },
          },
          audio: true,
        });

        screenStreamRef.current = screenStream;
        dispatch(toggleScreenSharing(true));

        // Update call metadata
        if (activeCall) {
          await updateCallMetadataApi({
            callId: activeCall._id,
            updates: { isScreenSharing: true },
          });
        }

        toast.success("Screen sharing started");

        // Handle screen sharing stop
        screenStream.getVideoTracks()[0].onended = () => {
          dispatch(toggleScreenSharing(false));

          if (activeCall) {
            updateCallMetadataApi({
              callId: activeCall._id,
              updates: { isScreenSharing: false },
            });
          }
        };
      } catch (error) {
        console.error("Screen share error:", error);
        toast.error("Failed to start screen sharing");
      }
    }
  }, [isScreenSharing, activeCall, updateCallMetadataApi, dispatch]);

  // Toggle recording
  const toggleCallRecording = useCallback(async () => {
    dispatch(toggleRecording(!isRecording));

    // Update call metadata
    if (activeCall) {
      await updateCallMetadataApi({
        callId: activeCall._id,
        updates: { isRecording: !isRecording },
      });
    }

    toast.success(isRecording ? "Recording stopped" : "Recording started");
  }, [isRecording, activeCall, updateCallMetadataApi, dispatch]);

  // Toggle translation
  const toggleCallTranslation = useCallback(() => {
    dispatch(toggleTranslation());

    // Update call metadata
    if (activeCall) {
      updateCallMetadataApi({
        callId: activeCall._id,
        updates: { translationEnabled: !translationEnabled },
      });
    }

    toast.success(translationEnabled ? "Translation off" : "Translation on");
  }, [translationEnabled, activeCall, updateCallMetadataApi, dispatch]);

  // Update translation languages
  const updateTranslationLanguages = useCallback(
    (source: string, target: string) => {
      dispatch(setSourceLanguage(source));
      dispatch(setTargetLanguage(target));

      // Update call metadata
      if (activeCall) {
        updateCallMetadataApi({
          callId: activeCall._id,
          updates: {
            sourceLanguage: source,
            targetLanguage: target,
          },
        });
      }
    },
    [activeCall, updateCallMetadataApi, dispatch],
  );

  // Clean up on unmount
  // useEffect(() => {
  //   return () => {
  //     if (localStream) {
  //       localStream.getTracks().forEach((track) => track.stop());
  //     }

  //     if (screenStreamRef.current) {
  //       screenStreamRef.current.getTracks().forEach((track) => track.stop());
  //     }

  //     if (webrtcServiceRef.current) {
  //       webrtcServiceRef.current.cleanupAll();
  //     }
  //   };
  // }, [localStream]);

  return {
    // State
    activeCall,
    incomingCall,
    localStream,
    remoteStream,
    isMuted,
    isVideoOff,
    isScreenSharing,
    isRecording,
    translationEnabled,
    sourceLanguage,
    targetLanguage,
    iceServers,

    // Actions
    startCall,
    answerCall,
    rejectCall,
    endCall,
    toggleMute: toggleMuteCall,
    toggleVideo: toggleVideoCall,
    toggleScreenShare,
    toggleRecording: toggleCallRecording,
    toggleTranslation: toggleCallTranslation,
    updateTranslationLanguages,

    // Debug/Utility functions
    checkCallStatus,
    forceTerminateCall,

    // Helpers
    getOtherParticipants: () => {
      if (!activeCall) return [];
      const userId = localStorage.getItem("userId") || currentUser?._id;
      return activeCall.participants.filter((p) => p.userId._id !== userId);
    },

    getActiveParticipants: () => {
      if (!activeCall) return [];
      return activeCall.participants.filter((p) => p.isActive);
    },

    isCallActive: () => {
      return activeCall !== null;
    },

    isIncomingCall: () => {
      return incomingCall !== null;
    },
  };
};

# 32 - useChat

import { useEffect, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useSocket } from '../context/SocketContext';
import {
  useGetChatsQuery,
  useGetMessagesQuery,
  useSendMessageMutation,
  useMarkAsReadMutation,
  useUpdateTypingMutation,
  useAddReactionMutation,
  useRemoveReactionMutation,
  useDeleteMessageMutation,
} from '../features/chat/chatApi';
import {
  selectActiveChat,
  selectMessages,
  selectTypingUsers,
  setActiveChat,
  setMessages,
  addMessage,
  updateMessage,
  deleteMessage,
  addTypingUser,
  removeTypingUser,
  setLoading,
  setError,
} from '../features/chat/chatSlice';
import { ChatSocketService } from '../services/chat.service';
import { Message, SendMessageRequest } from '../features/chat/chatApi';
import toast from 'react-hot-toast';

// Helper to convert Message options to SendMessageRequest
const prepareMessageData = (
  content: string, 
  options: Partial<Message> = {}
): SendMessageRequest => {
  const { replyTo, ...otherOptions } = options;
  
  const messageData: SendMessageRequest = {
    content: content.trim(),
    type: 'text',
    ...otherOptions as any, // Type assertion for other properties
  };
  
  // Handle replyTo conversion
  if (replyTo) {
    if (typeof replyTo === 'object' && replyTo._id) {
      messageData.replyTo = replyTo._id;
    } else if (typeof replyTo === 'string') {
      messageData.replyTo = replyTo;
    }
  }
  
  return messageData;
};

export const useChat = () => {
  const dispatch = useDispatch();
  const { socket, isConnected } = useSocket();
  
  const activeChat = useSelector(selectActiveChat);
  const messages = useSelector(selectMessages);
  const typingUsers = useSelector(selectTypingUsers);
  
  const chatSocketRef = useRef<ChatSocketService | null>(null);
  
  // API hooks
  const { data: chatsData, isLoading: isLoadingChats, error: chatsError } = useGetChatsQuery({});
  const { data: messagesData, isLoading: isLoadingMessages, error: messagesError } = useGetMessagesQuery(
    { chatId: activeChat?._id || '', page: 1, limit: 50 },
    { skip: !activeChat?._id }
  );
  
  const [sendMessageApi] = useSendMessageMutation();
  const [markAsReadApi] = useMarkAsReadMutation();
  const [updateTypingApi] = useUpdateTypingMutation();
  const [addReactionApi] = useAddReactionMutation();
  const [removeReactionApi] = useRemoveReactionMutation();
  const [deleteMessageApi] = useDeleteMessageMutation();
  
  // Initialize socket service
  useEffect(() => {
    if (socket && isConnected) {
      chatSocketRef.current = new ChatSocketService(socket);
      
      return () => {
        if (chatSocketRef.current) {
          chatSocketRef.current.disconnect();
          chatSocketRef.current = null;
        }
      };
    }
  }, [socket, isConnected]);
  
  // Join/leave chat rooms
  useEffect(() => {
    if (chatSocketRef.current && activeChat) {
      chatSocketRef.current.joinChat(activeChat._id);
      
      return () => {
        chatSocketRef.current?.leaveChat(activeChat._id);
      };
    }
  }, [activeChat]);
  
  // Load messages when active chat changes
  useEffect(() => {
    if (messagesData && activeChat) {
      dispatch(setMessages(messagesData?.data?.messages || []));
    }
  }, [messagesData, activeChat, dispatch]);
  
  // Handle errors
  useEffect(() => {
    if (chatsError) {
      dispatch(setError('Failed to load chats'));
      toast.error('Failed to load chats');
    }
    if (messagesError) {
      dispatch(setError('Failed to load messages'));
      toast.error('Failed to load messages');
    }
  }, [chatsError, messagesError, dispatch]);
  
  // Chat management
  const selectChat = useCallback((chat: any) => {
    dispatch(setActiveChat(chat));
    dispatch(setLoading(true));
    
    // Mark messages as read
    if (chat.unreadCount > 0) {
      markAsReadApi({ chatId: chat._id });
    }
  }, [dispatch, markAsReadApi]);
  
  const sendMessage = useCallback(async (content: string, options: Partial<Message> = {}) => {
    if (!activeChat || !content.trim()) return;
    
    try {
      // Prepare message data for API
      const messageData = prepareMessageData(content, options);
      
      // Send via socket (socket might accept different format)
      if (chatSocketRef.current) {
        // For socket, we can send the original options
        chatSocketRef.current.sendMessage(activeChat._id, {
          content: content.trim(),
          type: 'text',
          ...options,
        } as Partial<Message>);
      }
      
      // Send via API for persistence
      await sendMessageApi({
        chatId: activeChat._id,
        data: messageData,
      }).unwrap();
      
    } catch (error) {
      toast.error('Failed to send message');
      console.error('Send message error:', error);
    }
  }, [activeChat, sendMessageApi]);
  
  const sendFile = useCallback(async (file: File, type: Message['type']) => {
    if (!activeChat || !file) return;
    
    // In a real app, upload file to storage service first
    // For now, create a mock file message
    const messageData: SendMessageRequest = {
      type,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      content: `${type} file: ${file.name}`,
    };
    
    // Send via socket
    if (chatSocketRef.current) {
      chatSocketRef.current.sendMessage(activeChat._id, messageData as Partial<Message>);
    }
    
    // Send via API
    await sendMessageApi({
      chatId: activeChat._id,
      data: messageData,
    }).unwrap();
  }, [activeChat, sendMessageApi]);
  
  const markAsRead = useCallback((messageIds: string[]) => {
    if (!activeChat || messageIds.length === 0) return;
    
    if (chatSocketRef.current) {
      chatSocketRef.current.markAsRead(activeChat._id, messageIds);
    }
    
    markAsReadApi({ chatId: activeChat._id, messageIds });
  }, [activeChat, markAsReadApi]);
  
  const startTyping = useCallback(() => {
    if (!activeChat) return;
    
    if (chatSocketRef.current) {
      chatSocketRef.current.startTyping(activeChat._id);
    }
    
    updateTypingApi({ chatId: activeChat._id, isTyping: true });
  }, [activeChat, updateTypingApi]);
  
  const stopTyping = useCallback(() => {
    if (!activeChat) return;
    
    if (chatSocketRef.current) {
      chatSocketRef.current.stopTyping(activeChat._id);
    }
    
    updateTypingApi({ chatId: activeChat._id, isTyping: false });
  }, [activeChat, updateTypingApi]);
  
  const addReaction = useCallback((messageId: string, emoji: string) => {
    if (chatSocketRef.current) {
      chatSocketRef.current.addReaction(messageId, emoji);
    }
    
    addReactionApi({ messageId, emoji });
  }, [addReactionApi]);
  
  const removeReaction = useCallback((messageId: string) => {
    if (chatSocketRef.current) {
      chatSocketRef.current.removeReaction(messageId);
    }
    
    removeReactionApi(messageId);
  }, [removeReactionApi]);
  
  const deleteMessage = useCallback((messageId: string) => {
    if (chatSocketRef.current) {
      // Note: Should be deleteMessage, not removeReaction
      // But ChatSocketService doesn't have deleteMessage emitter
      // chatSocketRef.current.deleteMessage(messageId);
    }
    
    deleteMessageApi(messageId);
  }, [deleteMessageApi]);
  
  // Get current user ID from auth state or localStorage
  const getCurrentUserId = useCallback(() => {
    // TODO: Get from Redux auth state instead of localStorage
    return localStorage.getItem('userId');
  }, []);
  
  return {
    // State
    chats: chatsData?.data?.chats || [],
    activeChat,
    messages,
    typingUsers,
    isLoading: isLoadingChats || isLoadingMessages,
    
    // Actions
    selectChat,
    sendMessage,
    sendFile,
    markAsRead,
    startTyping,
    stopTyping,
    addReaction,
    removeReaction,
    deleteMessage,
    
    // Helpers
    getOtherParticipant: () => {
      if (!activeChat || activeChat.isGroup) return null;
      const userId = getCurrentUserId();
      return activeChat.participants.find(p => p._id !== userId);
    },
    
    isUserTyping: (userId: string) => {
      return typingUsers.includes(userId);
    },
    
    getUnreadCount: (chatId: string) => {
  const chat = chatsData?.data?.chats.find(
    (c: any) => c._id === chatId
  );
  return chat?.unreadCount || 0;
},
    
    // New helper for getting current user ID
    getCurrentUserId,
  };
};

# 33 - useTranslation

import { useEffect, useRef, useCallback, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useSocket } from '../context/SocketContext';
import {
  useGetSupportedLanguagesQuery,
  useTranslateTextMutation,
  useSpeechToTextMutation,
  useTextToSpeechMutation,
  useCreateTranslationSessionMutation,
} from '../features/translation/translationApi';
import {
  selectSupportedLanguages,
  selectSourceLanguage,
  selectTargetLanguage,
  selectTranslationEnabled,
  setSupportedLanguages,
  setSourceLanguage,
  setTargetLanguage,
  swapLanguages,
  addToHistory,
  setError,
  addToAudioQueue,
} from '../features/translation/translationSlice';
import { RootState } from '../app/store';
import toast from 'react-hot-toast';

interface TranslationOptions {
  sourceLanguage?: string;
  targetLanguage?: string;
  saveToHistory?: boolean;
  sessionId?: string;
}

export const useTranslation = () => {
  const dispatch = useDispatch();
  const { socket } = useSocket();
  
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
  useEffect(() => {
    if (!socket) return;
    
    // Translation results
    socket.on('translation:result', (data: any) => {
      console.log('Translation result:', data);
      handleTranslationResult(data);
    });
    
    // Translation errors
    socket.on('translation:error', (data: any) => {
      console.error('Translation error:', data);
      toast.error(data.message || 'Translation error');
    });
    
    // Session events
    socket.on('translation:started', (data: any) => {
      console.log('Translation session started:', data);
      setCurrentSessionId(data.sessionId);
    });
    
    socket.on('translation:stopped', (data: any) => {
      console.log('Translation session stopped:', data);
      if (currentSessionId === data.sessionId) {
        setCurrentSessionId(null);
      }
    });
    
    return () => {
      socket.off('translation:result');
      socket.off('translation:error');
      socket.off('translation:started');
      socket.off('translation:stopped');
    };
  }, [socket, currentSessionId]);
  
  // Handle incoming translation results
  const handleTranslationResult = useCallback((data: any) => {
    const { translation, userId, sessionId } = data;
    
    // Add to history
    dispatch(addToHistory({
      original: translation.originalText,
      translated: translation.translatedText,
      sourceLang: sourceLanguage,
      targetLang: targetLanguage,
      confidence: translation.confidence,
    }));
    
    // If audio is available, add to queue
    if (translation.translatedAudio) {
      dispatch(addToAudioQueue({
        text: translation.translatedText,
        audioUrl: translation.translatedAudio,
        language: targetLanguage,
      }));
    }
    
    // Show notification
    if (userId !== currentUser?._id) {
      toast(`New translation from user`, {
        icon: '🔊',
      });
    }
  }, [dispatch, sourceLanguage, targetLanguage, currentUser]);
  
  // Translate text
  const translateText = useCallback(async (
    text: string,
    options?: TranslationOptions
  ) => {
    try {
      const result = await translateTextApi({
        text,
        targetLanguage: options?.targetLanguage || targetLanguage,
        sourceLanguage: options?.sourceLanguage || sourceLanguage,
      }).unwrap();
      
      if (options?.saveToHistory !== false) {
        dispatch(addToHistory({
          original: text,
          translated: result.translation.translatedText,
          sourceLang: result.translation.sourceLanguage,
          targetLang: result.translation.targetLanguage,
          confidence: result.translation.confidence,
        }));
      }
      
      return result.translation;
    } catch (error: any) {
      console.error('Translation error:', error);
      dispatch(setError('Translation failed'));
      toast.error('Translation failed');
      throw error;
    }
  }, [translateTextApi, sourceLanguage, targetLanguage, dispatch]);
  
  // Convert speech to text
  const speechToText = useCallback(async (
    audioBlob: Blob,
    language: string = sourceLanguage
  ) => {
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      formData.append('language', language);
      
      const result = await speechToTextApi(formData).unwrap();
      return result.transcription;
    } catch (error: any) {
      console.error('Speech to text error:', error);
      toast.error('Speech recognition failed');
      throw error;
    }
  }, [speechToTextApi, sourceLanguage]);
  
  // Convert text to speech
  const textToSpeech = useCallback(async (
    text: string,
    language: string = targetLanguage,
    voice?: string
  ) => {
    try {
      const result = await textToSpeechApi({
        text,
        language,
        voice,
      }).unwrap();
      
      dispatch(addToAudioQueue({
        text,
        audioUrl: result.synthesis.audioUrl,
        language,
      }));
      
      return result.synthesis;
    } catch (error: any) {
      console.error('Text to speech error:', error);
      toast.error('Speech synthesis failed');
      throw error;
    }
  }, [textToSpeechApi, targetLanguage, dispatch]);
  
  // Play audio
  const playAudio = useCallback((audioUrl: string) => {
    const audio = new Audio(audioUrl);
    audio.play().catch(error => {
      console.error('Audio playback error:', error);
      toast.error('Failed to play audio');
    });
    return audio;
  }, []);
  
  // Start real-time translation recording
  const startRealTimeTranslation = useCallback(async (
    sessionId: string,
    callId?: string
  ) => {
    try {
      if (!socket) {
        throw new Error('Socket not connected');
      }
      
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });
      
      streamRef.current = stream;
      
      // Create media recorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
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
            const base64Audio = reader.result?.toString().split(',')[1];
            
            if (base64Audio && socket) {
              socket.emit('translation:stream', {
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
      socket.emit('translation:join', sessionId);
      
      return mediaRecorder;
    } catch (error: any) {
      console.error('Failed to start recording:', error);
      toast.error('Failed to access microphone');
      throw error;
    }
  }, [socket, sourceLanguage, targetLanguage]);
  
  // Stop real-time translation
  const stopRealTimeTranslation = useCallback(async () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      // Send final chunk if any
      if (audioChunksRef.current.length > 0 && socket && currentSessionId) {
        const finalBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        
        reader.onloadend = () => {
          const base64Audio = reader.result?.toString().split(',')[1];
          
          if (base64Audio) {
            socket.emit('translation:stream', {
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
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      
      audioChunksRef.current = [];
      
      // Leave session
      if (socket && currentSessionId) {
        socket.emit('translation:leave', currentSessionId);
      }
      
      setCurrentSessionId(null);
    }
  }, [socket, isRecording, currentSessionId, sourceLanguage, targetLanguage]);
  
  // Create translation session
  const createTranslationSession = useCallback(async (
    participants: string[],
    callId?: string,
    chatId?: string
  ) => {
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
      console.error('Create session error:', error);
      toast.error('Failed to create translation session');
      throw error;
    }
  }, [createSessionApi, sourceLanguage, targetLanguage]);
  
  // Join existing session
  const joinTranslationSession = useCallback((sessionId: string) => {
    if (socket) {
      socket.emit('translation:join', sessionId);
      setCurrentSessionId(sessionId);
    }
  }, [socket]);
  
  // Leave session
  const leaveTranslationSession = useCallback(() => {
    if (socket && currentSessionId) {
      socket.emit('translation:leave', currentSessionId);
      setCurrentSessionId(null);
    }
  }, [socket, currentSessionId]);
  
  // Get language info
  const getLanguageName = useCallback((code: string): string => {
    const lang = supportedLanguages.find(l => l.code === code);
    return lang?.name || code;
  }, [supportedLanguages]);
  
  const getLanguageNativeName = useCallback((code: string): string => {
    const lang = supportedLanguages.find(l => l.code === code);
    return lang?.nativeName || code;
  }, [supportedLanguages]);
  
  // Swap languages
  const swapLanguages = useCallback(() => {
    const currentSource = sourceLanguage;
    const currentTarget = targetLanguage;
    
    dispatch(setSourceLanguage(currentTarget));
    dispatch(setTargetLanguage(currentSource));
  }, [sourceLanguage, targetLanguage, dispatch]);
  
  // Start translation (real-time)
  const startTranslation = useCallback(async (
    participants: string[],
    callId?: string,
    chatId?: string
  ) => {
    try {
      const session = await createTranslationSession(participants, callId, chatId);
      await startRealTimeTranslation(session._id, callId);
      return session;
    } catch (error) {
      console.error('Failed to start translation:', error);
      toast.error('Failed to start translation');
      throw error;
    }
  }, [createTranslationSession, startRealTimeTranslation]);
  
  // Stop translation (real-time)
  const stopTranslation = useCallback(async () => {
    if (isRecording && currentSessionId) {
      await stopRealTimeTranslation();
    }
  }, [isRecording, currentSessionId, stopRealTimeTranslation]);
  
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

# 34 - i18n/index.ts

// Simple i18n setup - can be empty for now
const i18n = {
  // Empty configuration
};

export default i18n;

# 35 - Home.tsx

import React, { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useChat } from '../hooks/useChat';
import MessageItem from '../components/chat/MessageItem';
import { selectCurrentUser } from '../features/auth/authSlice';
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';

const Home: React.FC = () => {
  const { messages, activeChat, isLoading } = useChat();
  const currentUser = useSelector(selectCurrentUser);

  // Group messages by date for display
  const groupMessagesByDate = () => {
    const grouped: { [key: string]: any[] } = {};
    
    messages.forEach((message) => {
      const date = new Date(message.createdAt).toDateString();
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(message);
    });
    
    return grouped;
  };

  const groupedMessages = groupMessagesByDate();

  if (!activeChat) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center">
        <ChatBubbleLeftRightIcon className="h-24 w-24 text-gray-300 mb-4" />
        <h3 className="text-xl font-semibold text-gray-600 mb-2">
          No chat selected
        </h3>
        <p className="text-gray-500 text-center">
          Select a conversation from the sidebar to start messaging
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-whatsapp-green-light"></div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-whatsapp-green-light/10 rounded-full flex items-center justify-center">
            <ChatBubbleLeftRightIcon className="h-8 w-8 text-whatsapp-green-light" />
          </div>
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
            No messages yet
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            Say hello to start the conversation!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {Object.entries(groupedMessages).map(([date, dateMessages]) => (
          <div key={date}>
            <div className="flex justify-center my-4">
              <div className="px-3 py-1 bg-whatsapp-gray-200 dark:bg-whatsapp-gray-700 rounded-full text-xs text-gray-600 dark:text-gray-300">
                {new Date(date).toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </div>
            </div>
            
            {dateMessages.map((message, index) => {
              const showDate = index === 0 || 
                new Date(message.createdAt).toDateString() !== 
                new Date(dateMessages[index - 1].createdAt).toDateString();
              
              return (
                <MessageItem
                  key={message._id || index}
                  message={message}
                  showDate={showDate}
                />
              );
            })}
          </div>
        ))}
        
        {/* Typing indicator */}
        <div className="flex justify-start">
          <div className="bg-gray-200 dark:bg-gray-800 rounded-2xl px-4 py-2 rounded-tl-none">
            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;

# 36 - Login
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useLoginMutation } from '../features/auth/authApi';
import {
  setCredentials,
  setError,
  clearError,
  selectAuthError,
} from '../features/auth/authSlice';
import AuthLayout from '../components/layout/AuthLayout';
import AuthInput from '../components/auth/AuthInput';
import { EnvelopeIcon, LockClosedIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

/* ============================
   TYPES
============================ */
interface LoginFormData {
  email: string;
  password: string;
}

/* ============================
   VALIDATION SCHEMA
============================ */
const loginSchema = yup.object({
  email: yup
    .string()
    .email('Please enter a valid email address')
    .required('Email is required'),
  password: yup
    .string()
    .min(6, 'Password must be at least 6 characters')
    .required('Password is required'),
});

/* ============================
   COMPONENT
============================ */
const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();

  const [login, { isLoading }] = useLoginMutation();
  const authError = useSelector(selectAuthError);

  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: yupResolver(loginSchema),
  });

  // Redirect path after login
  const from = (location.state as any)?.from?.pathname || '/';

  /* ============================
     SUBMIT HANDLER
  ============================ */
  const onSubmit = async (data: LoginFormData) => {
    dispatch(clearError());

    try {
      const response = await login(data).unwrap();

      // ✅ Save user + token
      dispatch(
        setCredentials({
          user: response.data.user,
          accessToken: response.data.accessToken,
        })
      );

      toast.success('Login successful');
      navigate(from, { replace: true });
    } catch (error: any) {
      const errorMessage =
        error?.data?.message || 'Login failed. Please try again.';
      dispatch(setError(errorMessage));
      toast.error(errorMessage);
    }
  };

  /* ============================
     UI
  ============================ */
  return (
    <AuthLayout type="auth">
      <div className="min-h-screen flex items-center justify-center bg-whatsapp-bg-light dark:bg-whatsapp-bg-dark p-4">
        <div className="max-w-md w-full space-y-8">
          {/* Header */}
          <div className="text-center">
            <div className="flex justify-center">
              <div className="w-16 h-16 bg-whatsapp-green-light rounded-full flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-white"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.012-.57-.012-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.87.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                </svg>
              </div>
            </div>

            <h2 className="mt-6 text-3xl font-bold text-whatsapp-text-light dark:text-whatsapp-text-dark">
              Welcome back
            </h2>
            <p className="mt-2 text-sm text-whatsapp-gray-600 dark:text-whatsapp-gray-400">
              Sign in to your account
            </p>
          </div>

          {/* Error */}
          {authError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <p className="text-sm text-red-600 dark:text-red-400">
                {authError}
              </p>
            </div>
          )}

          {/* Form */}
          <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
            <AuthInput
              label="Email address"
              type="email"
              autoComplete="email"
              icon={<EnvelopeIcon className="h-5 w-5" />}
              error={errors.email?.message}
              {...register('email')}
            />

            <div>
              <AuthInput
                label="Password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                icon={<LockClosedIcon className="h-5 w-5" />}
                error={errors.password?.message}
                {...register('password')}
              />

              <div className="flex items-center justify-between mt-2">
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-sm text-whatsapp-green-light hover:text-whatsapp-green-dark"
                >
                  {showPassword ? 'Hide password' : 'Show password'}
                </button>

                <Link
                  to="/forgot-password"
                  className="text-sm text-whatsapp-green-light hover:text-whatsapp-green-dark"
                >
                  Forgot password?
                </Link>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center py-3 px-4 rounded-lg text-white bg-whatsapp-green-light hover:bg-whatsapp-green-dark disabled:opacity-50"
            >
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          {/* Footer */}
          <div className="text-center">
            <p className="text-sm text-whatsapp-gray-600 dark:text-whatsapp-gray-400">
              Don&apos;t have an account?{' '}
              <Link
                to="/register"
                className="font-medium text-whatsapp-green-light hover:text-whatsapp-green-dark"
              >
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </div>
    </AuthLayout>
  );
};

export default Login;

# 37 - Register

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { useRegisterMutation } from '../features/auth/authApi';
import { setCredentials, setError, clearError } from '../features/auth/authSlice';
import AuthLayout from '../components/layout/AuthLayout';
import AuthInput from '../components/auth/AuthInput';
import { 
  UserIcon, 
  EnvelopeIcon, 
  LockClosedIcon, 
  PhotoIcon 
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
// import http from '../services/http';

interface RegisterFormData {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  picture?: string;
}

const registerSchema = yup.object({
  name: yup
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(50, 'Name cannot exceed 50 characters')
    .required('Name is required'),
  email: yup
    .string()
    .email('Please enter a valid email address')
    .required('Email is required'),
  password: yup
    .string()
    .min(6, 'Password must be at least 6 characters')
    .matches(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    )
    .required('Password is required'),
  confirmPassword: yup
    .string()
    .oneOf([yup.ref('password')], 'Passwords must match')
    .required('Please confirm your password'),
});

const Register: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [register, { isLoading }] = useRegisterMutation();
  
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [profilePicture, setProfilePicture] = useState<File | null>(null);
  const [picturePreview, setPicturePreview] = useState<string>('');
  const [uploadingPicture, setUploadingPicture] = useState(false);
  
  const {
    register: registerForm,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<RegisterFormData>({
    resolver: yupResolver(registerSchema),
  });
  
  const password = watch('password');
  
  const handlePictureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!validTypes.includes(file.type)) {
        toast.error('Please upload a valid image file (JPEG, PNG, GIF, WebP)');
        return;
      }
      
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image size must be less than 5MB');
        return;
      }
      
      setProfilePicture(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setPicturePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };
  
  const uploadProfilePicture = async (file: File): Promise<string | undefined> => {
    try {
      setUploadingPicture(true);
      
      // In a real app, you would upload to Cloudinary or similar service
      // For now, we'll use a mock upload
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Return a mock URL or use the actual upload response
      return picturePreview;
    } catch (error) {
      console.error('Failed to upload picture:', error);
      toast.error('Failed to upload profile picture');
      return undefined;
    } finally {
      setUploadingPicture(false);
    }
  };
  
  const removeProfilePicture = () => {
    setProfilePicture(null);
    setPicturePreview('');
  };
  
  const onSubmit = async (data: RegisterFormData) => {
    dispatch(clearError());
    
    try {
      let pictureUrl = '';
      
      // Upload profile picture if selected
      if (profilePicture) {
        const uploadedUrl = await uploadProfilePicture(profilePicture);
        if (uploadedUrl) {
          pictureUrl = uploadedUrl;
        }
      }
      
      // Prepare registration data
      const registrationData = {
        name: data.name,
        email: data.email,
        password: data.password,
        ...(pictureUrl && { picture: pictureUrl }),
      };
      
      // Register user
      const response = await register(registrationData).unwrap();
      
      if (response.success) {
        dispatch(setCredentials({
          user: response.data.user,
          accessToken: response.data.accessToken,
        }));
        
        toast.success('Registration successful!');
        navigate('/', { replace: true });
      }
    } catch (error: any) {
      const errorMessage = error.data?.message || 'Registration failed. Please try again.';
      dispatch(setError(errorMessage));
      toast.error(errorMessage);
    }
  };
  
  return (
    <AuthLayout type="auth">
      <div className="min-h-screen flex items-center justify-center bg-whatsapp-bg-light dark:bg-whatsapp-bg-dark p-4">
        <div className="max-w-md w-full space-y-8">
          {/* Header */}
          <div className="text-center">
            <div className="flex justify-center">
              <div className="w-16 h-16 bg-whatsapp-green-light rounded-full flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-white"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.012-.57-.012-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.87.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                </svg>
              </div>
            </div>
            <h2 className="mt-6 text-3xl font-bold text-whatsapp-text-light dark:text-whatsapp-text-dark">
              Create your account
            </h2>
            <p className="mt-2 text-sm text-whatsapp-gray-600 dark:text-whatsapp-gray-400">
              Join WhatsApp Clone today
            </p>
          </div>
          
          {/* Profile Picture Upload */}
          <div className="flex justify-center">
            <div className="relative">
              <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-white dark:border-whatsapp-gray-800 shadow-lg">
                {picturePreview ? (
                  <img
                    src={picturePreview}
                    alt="Profile preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-whatsapp-gray-200 dark:bg-whatsapp-gray-700 flex items-center justify-center">
                    <UserIcon className="w-16 h-16 text-whatsapp-gray-400" />
                  </div>
                )}
              </div>
              
              <label className="absolute bottom-0 right-0 bg-whatsapp-green-light text-white p-2 rounded-full cursor-pointer hover:bg-whatsapp-green-dark transition-colors duration-200">
                <PhotoIcon className="w-5 h-5" />
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={handlePictureChange}
                  disabled={uploadingPicture}
                />
              </label>
              
              {picturePreview && (
                <button
                  type="button"
                  onClick={removeProfilePicture}
                  className="absolute top-0 right-0 bg-red-500 text-white p-1 rounded-full hover:bg-red-600 transition-colors duration-200"
                >
                  <span className="sr-only">Remove picture</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          
          {uploadingPicture && (
            <div className="text-center">
              <div className="inline-flex items-center space-x-2 text-sm text-whatsapp-gray-600 dark:text-whatsapp-gray-400">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-whatsapp-green-light"></div>
                <span>Uploading picture...</span>
              </div>
            </div>
          )}
          
          {/* Form */}
          <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
            <div className="space-y-4">
              <AuthInput
                label="Full Name"
                type="text"
                autoComplete="name"
                icon={<UserIcon className="h-5 w-5" />}
                error={errors.name?.message}
                {...registerForm('name')}
              />
              
              <AuthInput
                label="Email address"
                type="email"
                autoComplete="email"
                icon={<EnvelopeIcon className="h-5 w-5" />}
                error={errors.email?.message}
                {...registerForm('email')}
              />
              
              <div className="space-y-2">
                <AuthInput
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  icon={<LockClosedIcon className="h-5 w-5" />}
                  error={errors.password?.message}
                  {...registerForm('password')}
                />
                
                {password && (
                  <div className="space-y-1">
                    <div className="text-xs text-whatsapp-gray-600 dark:text-whatsapp-gray-400">
                      Password strength:
                    </div>
                    <div className="h-1 bg-whatsapp-gray-200 dark:bg-whatsapp-gray-700 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-300 ${
                          password.length >= 8 ? 
                          (password.match(/[A-Z]/) && password.match(/[a-z]/) && password.match(/\d/) ?
                            'bg-green-500' : 'bg-yellow-500') :
                          'bg-red-500'
                        }`}
                        style={{ 
                          width: `${Math.min((password.length / 12) * 100, 100)}%` 
                        }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>
              
              <AuthInput
                label="Confirm Password"
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                icon={<LockClosedIcon className="h-5 w-5" />}
                error={errors.confirmPassword?.message}
                {...registerForm('confirmPassword')}
              />
              
              <div className="flex items-center space-x-4">
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-sm text-whatsapp-green-light hover:text-whatsapp-green-dark"
                >
                  {showPassword ? 'Hide password' : 'Show password'}
                </button>
                
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="text-sm text-whatsapp-green-light hover:text-whatsapp-green-dark"
                >
                  {showConfirmPassword ? 'Hide confirm' : 'Show confirm'}
                </button>
              </div>
            </div>
            
            {/* Terms and Conditions */}
            <div className="flex items-center">
              <input
                id="terms"
                name="terms"
                type="checkbox"
                required
                className="h-4 w-4 text-whatsapp-green-light focus:ring-whatsapp-green-light border-whatsapp-gray-300 dark:border-whatsapp-gray-600 rounded"
              />
              <label htmlFor="terms" className="ml-2 block text-sm text-whatsapp-gray-700 dark:text-whatsapp-gray-300">
                I agree to the{' '}
                <Link to="/terms" className="text-whatsapp-green-light hover:text-whatsapp-green-dark">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link to="/privacy" className="text-whatsapp-green-light hover:text-whatsapp-green-dark">
                  Privacy Policy
                </Link>
              </label>
            </div>
            
            <div>
              <button
                type="submit"
                disabled={isLoading || uploadingPicture}
                className="group relative w-full flex justify-center py-3 px-4 border border-transparent rounded-lg text-sm font-medium text-white bg-whatsapp-green-light hover:bg-whatsapp-green-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-whatsapp-green-light disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Creating account...
                  </>
                ) : (
                  'Create Account'
                )}
              </button>
            </div>
          </form>
          
          {/* Footer */}
          <div className="mt-6 text-center">
            <p className="text-sm text-whatsapp-gray-600 dark:text-whatsapp-gray-400">
              Already have an account?{' '}
              <Link
                to="/login"
                className="font-medium text-whatsapp-green-light hover:text-whatsapp-green-dark"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </AuthLayout>
  );
};

export default Register;

# 38 - callSocket

import { Socket } from "socket.io-client";
import { store } from "../app/store";
import {
  setActiveCall,
  setIncomingCall,
  setIsRinging,
  setIsCalling,
  setIsInCall,
  addCallToHistory,
  setError,
  resetCallState, // ✅ ADDED THIS IMPORT
} from "../features/calls/callSlice";
import { Call } from "../features/calls/callApi";
import { RootState } from "../app/store";

export class CallSocketService {
  private socket: Socket | null = null;
  private webrtcService: any = null;

  constructor(socket: Socket, webrtcService: any) {
    this.socket = socket;
    this.webrtcService = webrtcService;

    // 🔥 DEBUG: Log every incoming socket event
    if (this.socket) {
      this.socket.onAny((event, ...args) => {
        console.log("📡 SOCKET EVENT RECEIVED:", event, args);
      });
    }

    this.setupListeners();
  }

  private setupListeners() {
    if (!this.socket) return;

    // Call initiation
    this.socket.on("call:initiated", this.handleCallInitiated.bind(this));

    // ✅ IMPORTANT: KEEP THIS LISTENER for incoming calls
    this.socket.on("call:incoming", this.handleIncomingCall.bind(this));

    // Call status updates
    this.socket.on("call:answered", this.handleCallAnswered.bind(this));
    this.socket.on("call:rejected", this.handleCallRejected.bind(this));
    this.socket.on("call:ended", this.handleCallEnded.bind(this));
    this.socket.on("call:missed", this.handleCallMissed.bind(this));

    // Participant updates
    this.socket.on(
      "call:participant:joined",
      this.handleParticipantJoined.bind(this),
    );
    this.socket.on(
      "call:participant:left",
      this.handleParticipantLeft.bind(this),
    );

    // WebRTC signaling
    this.socket.on("webrtc:offer", this.handleWebRTCOffer.bind(this));
    this.socket.on("webrtc:answer", this.handleWebRTCAnswer.bind(this));
    this.socket.on(
      "webrtc:ice-candidate",
      this.handleWebRTCIceCandidate.bind(this),
    );

    // Call metadata updates
    this.socket.on(
      "call:metadata:updated",
      this.handleMetadataUpdated.bind(this),
    );

    // Error handling
    this.socket.on("call:error", this.handleCallError.bind(this));
  }

  // Emitters
  initiateCall(data: {
    participantIds: string[];
    type: "voice" | "video";
    chatId?: string;
    metadata?: any;
  }) {
    this.socket?.emit("call:initiate", data);
    store.dispatch(setIsCalling(true));
  }

  answerCall(callId: string) {
    this.socket?.emit("call:answer", { callId });
    store.dispatch(setIsRinging(false));
  }

  rejectCall(callId: string, reason?: string) {
    this.socket?.emit("call:reject", { callId, reason });
    store.dispatch(setIsRinging(false));
    store.dispatch(setIncomingCall(null));
  }

  // ✅ CRITICAL FIX: End call should only notify server
  endCall(callId: string) {
    this.socket?.emit("call:end", { callId });
    // ⚠️ DO NOT reset local state here - server will broadcast to all
    console.log("📞 Emitting call:end to server", callId);
  }

  joinCall(callId: string, streamId?: string) {
    this.socket?.emit("call:join", { callId, streamId });
  }

  leaveCall(callId: string) {
    this.socket?.emit("call:leave", { callId });
  }

  updateCallMetadata(callId: string, updates: any) {
    this.socket?.emit("call:metadata:update", { callId, updates });
  }

  sendWebRTCOffer(targetUserId: string, offer: RTCSessionDescriptionInit) {
    this.socket?.emit("webrtc:offer", { targetUserId, offer });
  }

  sendWebRTCAnswer(targetUserId: string, answer: RTCSessionDescriptionInit) {
    this.socket?.emit("webrtc:answer", { targetUserId, answer });
  }

  sendWebRTCIceCandidate(targetUserId: string, candidate: RTCIceCandidate) {
    this.socket?.emit("webrtc:ice-candidate", { targetUserId, candidate });
  }

  // Event handlers
  private handleCallInitiated(data: { call: Call }) {
    store.dispatch(setActiveCall(data.call));
    store.dispatch(setIsCalling(false));
    store.dispatch(setIsInCall(true));

    console.log("Call initiated");
  }

  private handleIncomingCall(data: { call: Call }) {
    store.dispatch(setIncomingCall(data.call));
    store.dispatch(setIsRinging(true));

    // Play ringtone
    this.playRingtone();

    console.log(
      `Incoming ${data.call.type} call from ${data.call.initiator.name}`,
    );
  }

  private handleCallAnswered(data: { call: Call }) {
    store.dispatch(setActiveCall(data.call));
    store.dispatch(setIsInCall(true));
    this.socket?.emit('call:join-room', { callId: data.call.callId });

    const currentUserId = store.getState().auth.user?._id;

    const otherParticipants = data.call.participants.filter(
      (p) => p.userId._id !== currentUserId,
    );

    otherParticipants.forEach((p) => {
      const peerId = p.userId._id;

      if (!this.webrtcService.hasConnection(peerId)) {
        const pc = this.webrtcService.createPeerConnection(peerId);

        const localStream = store.getState().call.localStream;
        if (localStream) {
          this.webrtcService.addLocalStream(peerId, localStream);
        }

        this.webrtcService.createAndSendOffer(peerId);
      }
    });

    this.stopRingtone();
    console.log("Call answered - Peer connection created");
  }

  private handleCallRejected(data: { call: Call; reason?: string }) {
    const state: RootState = store.getState();
    const activeCall = state.call?.activeCall;

    if (activeCall?.callId === data.call.callId) {
      store.dispatch(setActiveCall(null));
      store.dispatch(setIsInCall(false));

      console.log(data.reason || "Call rejected");
    }
  }

  private handleCallMissed(data: { call: Call }) {
    store.dispatch(setIncomingCall(null));
    store.dispatch(setIsRinging(false));
    store.dispatch(addCallToHistory(data.call));
    this.stopRingtone();
    console.log("Missed call");
  }

  // ✅ CRITICAL FIX: Handle call ended from server
  // callSocket.ts mein niche wala handleCallEnded replace kar:
  private handleCallEnded(data: { call: any }) {
  console.log("📡 Call ended received from server");

  const stateBefore = store.getState().call;
  console.log("🧠 BEFORE RESET:", stateBefore);

  const localStream = store.getState().call.localStream;

  if (localStream) {
    localStream.getTracks().forEach(track => {
      if (track.readyState === "live") {
        track.stop();
      }
    });
  }

  if (this.webrtcService) {
    this.webrtcService.cleanupAll();
  }

  store.dispatch(resetCallState());

  const stateAfter = store.getState().call;
  console.log("🧠 AFTER RESET:", stateAfter);

  this.stopRingtone();
}


  private handleParticipantJoined(data: { callId: string; participant: any }) {
    const state: RootState = store.getState();
    const activeCall = state.call?.activeCall;

    if (activeCall?.callId === data.callId) {
      // Update active call with new participant
      const updatedCall = {
        ...activeCall,
        participants: [...activeCall.participants, data.participant],
      };

      store.dispatch(setActiveCall(updatedCall));

      console.log(`${data.participant.user?.name} joined the call`);
    }
  }

  private handleParticipantLeft(data: { callId: string; userId: string }) {
    const state: RootState = store.getState();
    const activeCall = state.call?.activeCall;

    if (activeCall?.callId === data.callId) {
      // Update active call by removing participant
      const updatedParticipants = activeCall.participants.filter(
        (p: any) => p.userId !== data.userId,
      );

      const updatedCall = {
        ...activeCall,
        participants: updatedParticipants,
      };

      store.dispatch(setActiveCall(updatedCall));
    }
  }

  private async handleWebRTCOffer(data: any) {
    console.log("🔥 OFFER RECEIVED DATA:", data);

    if (this.webrtcService) {
      await this.webrtcService.handleOffer(data.fromUserId, data.offer);
    }
  }

  private async handleWebRTCAnswer(data: {
    fromUserId: string;
    answer: RTCSessionDescriptionInit;
  }) {
    if (this.webrtcService) {
      await this.webrtcService.handleAnswer(data.fromUserId, data.answer);
    }
  }

  private async handleWebRTCIceCandidate(data: {
    fromUserId: string;
    candidate: RTCIceCandidateInit;
  }) {
    if (this.webrtcService) {
      await this.webrtcService.handleIceCandidate(
        data.fromUserId,
        data.candidate,
      );
    }
  }

  private handleMetadataUpdated(data: { callId: string; updates: any }) {
    const state: RootState = store.getState();
    const activeCall = state.call?.activeCall;

    if (activeCall?.callId === data.callId) {
      const updatedCall = {
        ...activeCall,
        metadata: {
          ...activeCall.metadata,
          ...data.updates,
        },
      };

      store.dispatch(setActiveCall(updatedCall));
    }
  }

  private handleCallError(data: { message: string; callId?: string }) {
    store.dispatch(setError(data.message));

    // Reset call state if it's an active call error
    if (data.callId) {
      const state: RootState = store.getState();
      const activeCall = state.call?.activeCall;
      const incomingCall = state.call?.incomingCall;

      if (activeCall?.callId === data.callId) {
        store.dispatch(setActiveCall(null));
        store.dispatch(setIsInCall(false));
      }

      if (incomingCall?.callId === data.callId) {
        store.dispatch(setIncomingCall(null));
        store.dispatch(setIsRinging(false));
      }
    }

    console.error(data.message);
  }

  private playRingtone() {
    // Implement ringtone playback
    console.log("Playing ringtone...");
  }

  private stopRingtone() {
    // Stop ringtone playback
    console.log("Stopping ringtone...");
  }

  // Cleanup
  disconnect() {
    if (this.socket) {
      this.socket.off("call:initiated");
      this.socket.off("call:incoming");
      this.socket.off("call:answered");
      this.socket.off("call:rejected");
      this.socket.off("call:ended");
      this.socket.off("call:missed");
      this.socket.off("call:participant:joined");
      this.socket.off("call:participant:left");
      this.socket.off("webrtc:offer");
      this.socket.off("webrtc:answer");
      this.socket.off("webrtc:ice-candidate");
      this.socket.off("call:metadata:updated");
      this.socket.off("call:error");
    }
  }
}

# 39 - chat.service

import { Socket } from 'socket.io-client';
import { store } from '../app/store';
import {
  addMessage,
  updateMessage,
  deleteMessage,
  addTypingUser,
  removeTypingUser,
  updateChat,
  addChat,
} from '../features/chat/chatSlice';
import { Message } from '../features/chat/chatApi';
import toast from 'react-hot-toast';

// Extended interface to ensure conversation property exists
interface ExtendedMessage extends Message {
  conversation: string;
}

export class ChatSocketService {
  private socket: Socket | null = null;
  
  constructor(socket: Socket) {
    this.socket = socket;
    this.setupListeners();
  }
  
  private setupListeners() {
    if (!this.socket) return;
    
    // Message events
    this.socket.on('message:sent', this.handleMessageSent.bind(this));
    this.socket.on('message:received', this.handleMessageReceived.bind(this));
    this.socket.on('message:updated', this.handleMessageUpdated.bind(this));
    this.socket.on('message:deleted', this.handleMessageDeleted.bind(this));
    this.socket.on('message:read', this.handleMessageRead.bind(this));
    
    // Typing events
    this.socket.on('typing:started', this.handleTypingStarted.bind(this));
    this.socket.on('typing:stopped', this.handleTypingStopped.bind(this));
    
    // Chat events
    this.socket.on('chat:created', this.handleChatCreated.bind(this));
    this.socket.on('chat:updated', this.handleChatUpdated.bind(this));
    this.socket.on('chat:user:joined', this.handleUserJoined.bind(this));
    this.socket.on('chat:user:left', this.handleUserLeft.bind(this));
    
    // Reaction events
    this.socket.on('reaction:added', this.handleReactionAdded.bind(this));
    this.socket.on('reaction:removed', this.handleReactionRemoved.bind(this));
    
    // User events
    this.socket.on('user:online', this.handleUserOnline.bind(this));
    this.socket.on('user:offline', this.handleUserOffline.bind(this));
  }
  
  // Emitters
  joinChat(chatId: string) {
    this.socket?.emit('chat:join', { chatId });
  }
  
  leaveChat(chatId: string) {
    this.socket?.emit('chat:leave', { chatId });
  }
  
  sendMessage(chatId: string, message: Partial<Message>) {
    this.socket?.emit('message:send', { chatId, message });
  }
  
  startTyping(chatId: string) {
    this.socket?.emit('typing:start', { chatId });
  }
  
  stopTyping(chatId: string) {
    this.socket?.emit('typing:stop', { chatId });
  }
  
  markAsRead(chatId: string, messageIds: string[]) {
    this.socket?.emit('message:read', { chatId, messageIds });
  }
  
  addReaction(messageId: string, emoji: string) {
    this.socket?.emit('reaction:add', { messageId, emoji });
  }
  
  removeReaction(messageId: string) {
    this.socket?.emit('reaction:remove', { messageId });
  }
  
  // Event handlers - FIXED WITH TYPE SAFETY
  private handleMessageSent(data: { message: ExtendedMessage }) {
    const { message } = data;
    store.dispatch(addMessage(message));
    
    // Update chat's last message - NOW TYPE SAFE
    if (message.conversation) {
      store.dispatch(updateChat({
        chatId: message.conversation,
        updates: { lastMessage: message },
      }));
    }
  }
  
  private handleMessageReceived(data: { message: ExtendedMessage }) {
    const { message } = data;
    store.dispatch(addMessage(message));
    
    // Show notification if not in active chat
    const state = store.getState();
    const activeChat = state.chat.activeChat;
    
    if (!activeChat || activeChat._id !== message.conversation) {
      toast(`New message from ${message.sender.name}`, {
        icon: '💬',
      });
    }
  }
  
  private handleMessageUpdated(data: { message: ExtendedMessage }) {
    store.dispatch(updateMessage({
      messageId: data.message._id,
      updates: data.message,
    }));
  }
  
  private handleMessageDeleted(data: { messageId: string }) {
    store.dispatch(deleteMessage(data.messageId));
  }
  
  private handleMessageRead(data: { chatId: string; userId: string; messageIds: string[] }) {
    const state = store.getState();
    const { messages } = state.chat;
    
    // Update read status for messages
    data.messageIds.forEach(messageId => {
      const message = messages.find(msg => msg._id === messageId) as ExtendedMessage;
      if (message && !message.readBy.includes(data.userId)) {
        store.dispatch(updateMessage({
          messageId,
          updates: {
            readBy: [...message.readBy, data.userId],
          },
        }));
      }
    });
  }
  
  private handleTypingStarted(data: { chatId: string; userId: string }) {
    store.dispatch(addTypingUser(data.userId));
  }
  
  private handleTypingStopped(data: { chatId: string; userId: string }) {
    store.dispatch(removeTypingUser(data.userId));
  }
  
  private handleChatCreated(data: { chat: any }) {
    store.dispatch(addChat(data.chat));
  }
  
  private handleChatUpdated(data: { chatId: string; updates: any }) {
    store.dispatch(updateChat({
      chatId: data.chatId,
      updates: data.updates,
    }));
  }
  
  private handleUserJoined(data: { chatId: string; userId: string; user: any }) {
    // Update chat participants
    const state = store.getState();
    const chat = state.chat.chats.find(c => c._id === data.chatId);
    
    if (chat) {
      store.dispatch(updateChat({
        chatId: data.chatId,
        updates: {
          participants: [...chat.participants, data.user],
        },
      }));
    }
  }
  
  private handleUserLeft(data: { chatId: string; userId: string }) {
    // Update chat participants
    const state = store.getState();
    const chat = state.chat.chats.find(c => c._id === data.chatId);
    
    if (chat) {
      store.dispatch(updateChat({
        chatId: data.chatId,
        updates: {
          participants: chat.participants.filter(p => p._id !== data.userId),
        },
      }));
    }
  }
  
  private handleReactionAdded(data: { messageId: string; userId: string; emoji: string }) {
    const state = store.getState();
    const message = state.chat.messages.find(msg => msg._id === data.messageId) as ExtendedMessage;
    
    if (message) {
      const reactions = message.reactions.filter(r => r.userId !== data.userId);
      reactions.push({ userId: data.userId, emoji: data.emoji });
      
      store.dispatch(updateMessage({
        messageId: data.messageId,
        updates: { reactions },
      }));
    }
  }
  
  private handleReactionRemoved(data: { messageId: string; userId: string }) {
    const state = store.getState();
    const message = state.chat.messages.find(msg => msg._id === data.messageId) as ExtendedMessage;
    
    if (message) {
      const reactions = message.reactions.filter(r => r.userId !== data.userId);
      
      store.dispatch(updateMessage({
        messageId: data.messageId,
        updates: { reactions },
      }));
    }
  }
  
  private handleUserOnline(data: { userId: string }) {
    const state = store.getState();
    const { chats } = state.chat;
    
    // Update user online status in all chats
    chats.forEach(chat => {
      const participant = chat.participants.find(p => p._id === data.userId);
      if (participant) {
        store.dispatch(updateChat({
          chatId: chat._id,
          updates: {
            participants: chat.participants.map(p =>
              p._id === data.userId ? { ...p, isOnline: true } : p
            ),
          },
        }));
      }
    });
  }
  
  private handleUserOffline(data: { userId: string; lastSeen: string }) {
    const state = store.getState();
    const { chats } = state.chat;
    
    // Update user offline status in all chats
    chats.forEach(chat => {
      const participant = chat.participants.find(p => p._id === data.userId);
      if (participant) {
        store.dispatch(updateChat({
          chatId: chat._id,
          updates: {
            participants: chat.participants.map(p =>
              p._id === data.userId
                ? { ...p, isOnline: false, lastSeen: data.lastSeen }
                : p
            ),
          },
        }));
      }
    });
  }
  
  // Cleanup
  disconnect() {
    if (this.socket) {
      this.socket.off('message:sent');
      this.socket.off('message:received');
      this.socket.off('message:updated');
      this.socket.off('message:deleted');
      this.socket.off('message:read');
      this.socket.off('typing:started');
      this.socket.off('typing:stopped');
      this.socket.off('chat:created');
      this.socket.off('chat:updated');
      this.socket.off('chat:user:joined');
      this.socket.off('chat:user:left');
      this.socket.off('reaction:added');
      this.socket.off('reaction:removed');
      this.socket.off('user:online');
      this.socket.off('user:offline');
    }
  }
}

# 40 - http.ts

import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { store } from '../app/store';
import { logout, setAccessToken } from '../features/auth/authSlice';

class HttpService {
  private axiosInstance: AxiosInstance;
  
  constructor() {
    this.axiosInstance = axios.create({
      baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api/v1',
      withCredentials: true,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    this.setupInterceptors();
  }
  
  private setupInterceptors() {
    // Request interceptor
    this.axiosInstance.interceptors.request.use(
      (config) => {
        const state = store.getState();
        const token = (state as any).auth?.accessToken;
        
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );
    
    // Response interceptor
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as any;
        
        // Handle token expiration
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          
          try {
            // Try to refresh token
            const refreshResponse = await axios.post(
              `${process.env.REACT_APP_API_URL}/auth/refresh-token`,
              {},
              { withCredentials: true }
            );
            
            const { accessToken } = refreshResponse.data.data;
            
            // Update store with new token
            store.dispatch(setAccessToken(accessToken));
            
            // Update the failed request with new token
            originalRequest.headers.Authorization = `Bearer ${accessToken}`;
            
            // Retry the original request
            return this.axiosInstance(originalRequest);
          } catch (refreshError) {
            // Refresh failed, logout user
            store.dispatch(logout());
            window.location.href = '/login';
            return Promise.reject(refreshError);
          }
        }
        
        return Promise.reject(error);
      }
    );
  }
  
  // HTTP methods
  get<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.axiosInstance.get<T>(url, config);
  }
  
  post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.axiosInstance.post<T>(url, data, config);
  }
  
  put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.axiosInstance.put<T>(url, data, config);
  }
  
  delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.axiosInstance.delete<T>(url, config);
  }
  
  patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.axiosInstance.patch<T>(url, data, config);
  }
}

export default new HttpService();

# 41 - WebRtcService

import { store } from '../app/store';
import {
  setRemoteStream
} from '../features/calls/callSlice';
import { Socket } from "socket.io-client";

export class WebRTCService {
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  private iceServers: RTCIceServer[] = [];
  private socket: Socket; // ✅ Added socket property
  
  // ✅ Callbacks for remote stream handling
  private onRemoteStreamCallback: ((peerId: string, stream: MediaStream) => void) | null = null;
  private onStreamEndedCallback: ((peerId: string) => void) | null = null;

  // ✅ Updated constructor to accept socket
  constructor(iceServers: RTCIceServer[], socket: Socket) {
    this.iceServers = iceServers;
    this.socket = socket;
  }

  // ✅ Add local stream to all peer connections
  addLocalStreamToAll(stream: MediaStream) {
    this.peerConnections.forEach((pc) => {
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });
    });
  }
  
  // ✅ Set callback for remote stream
  setOnRemoteStream(callback: (peerId: string, stream: MediaStream) => void) {
    this.onRemoteStreamCallback = callback;
  }

  // ✅ Set callback for stream ended
  setOnStreamEnded(callback: (peerId: string) => void) {
    this.onStreamEndedCallback = callback;
  }

  // ✅ Handle track event (remote stream)
  private handleTrackEvent(event: RTCTrackEvent, peerId: string) {
    if (event.streams && event.streams[0]) {
      const stream = event.streams[0];
      console.log("📹 Track received from peer:", peerId);
      
      if (this.onRemoteStreamCallback) {
        this.onRemoteStreamCallback(peerId, stream);
      }
    }
  }
  
  // Create a new peer connection
  createPeerConnection(peerId: string): RTCPeerConnection {
    const configuration: RTCConfiguration = {
      iceServers: this.iceServers,
      iceTransportPolicy: 'all',
    };
    
    const peerConnection = new RTCPeerConnection(configuration);
    
    // Store the connection
    this.peerConnections.set(peerId, peerConnection);
    
    // Set up event handlers
    this.setupConnectionHandlers(peerId, peerConnection);
    
    return peerConnection;
  }
  
  private setupConnectionHandlers(peerId: string, peerConnection: RTCPeerConnection) {
    // ICE candidate handler
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        // Send ICE candidate to signaling server
        this.sendIceCandidate(peerId, event.candidate);
      }
    };
    
    // Track handler for remote streams
    peerConnection.ontrack = (event) => {
      this.handleTrackEvent(event, peerId);
    };
    
    // Connection state change
    peerConnection.onconnectionstatechange = () => {
      console.log(`Connection state for ${peerId}:`, peerConnection.connectionState);
      
      if (peerConnection.connectionState === 'failed' || 
          peerConnection.connectionState === 'disconnected' ||
          peerConnection.connectionState === 'closed') {
        this.cleanupPeerConnection(peerId);
      }
    };
    
    // ICE connection state change
    peerConnection.oniceconnectionstatechange = () => {
      console.log(`ICE connection state for ${peerId}:`, peerConnection.iceConnectionState);
    };
    
    // ICE gathering state change
    peerConnection.onicegatheringstatechange = () => {
      console.log(`ICE gathering state for ${peerId}:`, peerConnection.iceGatheringState);
    };
    
    // Signaling state change
    peerConnection.onsignalingstatechange = () => {
      console.log(`Signaling state for ${peerId}:`, peerConnection.signalingState);
    };
    
    // Negotiation needed
    peerConnection.onnegotiationneeded = async () => {
      try {
        await this.createAndSendOffer(peerId);
      } catch (error) {
        console.error('Negotiation error:', error);
      }
    };
  }
  
  // Create and send offer
  async createAndSendOffer(peerId: string): Promise<void> {
    const peerConnection = this.peerConnections.get(peerId);
    if (!peerConnection) return;
    
    try {
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      
      await peerConnection.setLocalDescription(offer);
      
      // Send offer to signaling server
      this.sendOffer(peerId, offer);
      console.log("🟢 Creating offer for:", peerId);
    } catch (error) {
      console.error('Create offer error:', error);
    }
  }
  
  // Handle incoming offer
  async handleOffer(peerId: string, offer: RTCSessionDescriptionInit): Promise<void> {
    let peerConnection = this.peerConnections.get(peerId);
    
    if (!peerConnection) {
      peerConnection = this.createPeerConnection(peerId);
    }
    
    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      
      // Send answer to signaling server
      this.sendAnswer(peerId, answer);
      console.log("📥 Offer received from:", peerId);
    } catch (error) {
      console.error('Handle offer error:', error);
    }
  }
  
  // Handle incoming answer
  async handleAnswer(peerId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    const peerConnection = this.peerConnections.get(peerId);
    if (!peerConnection) return;
    
    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
      console.error('Handle answer error:', error);
    }
  }
  
  // Handle ICE candidate
  async handleIceCandidate(peerId: string, candidate: RTCIceCandidateInit): Promise<void> {
    const peerConnection = this.peerConnections.get(peerId);
    if (!peerConnection) return;
    
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('Add ICE candidate error:', error);
    }
  }
  
  // Add local stream to connection
  addLocalStream(peerId: string, stream: MediaStream): void {
    const peerConnection = this.peerConnections.get(peerId);
    if (!peerConnection) return;
    
    // Add all tracks from local stream
    stream.getTracks().forEach(track => {
      peerConnection.addTrack(track, stream);
    });
  }
  
  // Create data channel
  createDataChannel(peerId: string, channelName: string): RTCDataChannel | null {
    const peerConnection = this.peerConnections.get(peerId);
    if (!peerConnection) return null;
    
    const dataChannel = peerConnection.createDataChannel(channelName);
    this.dataChannels.set(`${peerId}_${channelName}`, dataChannel);
    
    this.setupDataChannelHandlers(peerId, channelName, dataChannel);
    
    return dataChannel;
  }
  
  // Handle incoming data channel
  handleDataChannel(peerId: string, dataChannel: RTCDataChannel): void {
    const channelName = dataChannel.label;
    this.dataChannels.set(`${peerId}_${channelName}`, dataChannel);
    
    this.setupDataChannelHandlers(peerId, channelName, dataChannel);
  }
  
  private setupDataChannelHandlers(
    peerId: string,
    channelName: string,
    dataChannel: RTCDataChannel
  ) {
    dataChannel.onopen = () => {
      console.log(`Data channel ${channelName} opened for ${peerId}`);
    };
    
    dataChannel.onclose = () => {
      console.log(`Data channel ${channelName} closed for ${peerId}`);
      this.dataChannels.delete(`${peerId}_${channelName}`);
    };
    
    dataChannel.onerror = (error) => {
      console.error(`Data channel ${channelName} error for ${peerId}:`, error);
    };
    
    dataChannel.onmessage = (event) => {
      this.handleDataChannelMessage(peerId, channelName, event.data);
    };
  }
  
  private handleDataChannelMessage(peerId: string, channelName: string, data: any) {
    try {
      const message = JSON.parse(data);
      
      // Handle different message types
      switch (message.type) {
        case 'chat':
          // Handle chat messages during call
          break;
        case 'translation':
          // Handle translation data
          break;
        case 'control':
          // Handle call control messages
          break;
        default:
          console.log('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Parse data channel message error:', error);
    }
  }
  
  // Send data via data channel
  sendData(peerId: string, channelName: string, data: any): boolean {
    const dataChannel = this.dataChannels.get(`${peerId}_${channelName}`);
    if (!dataChannel || dataChannel.readyState !== 'open') {
      return false;
    }
    
    try {
      dataChannel.send(JSON.stringify(data));
      return true;
    } catch (error) {
      console.error('Send data error:', error);
      return false;
    }
  }
  
  // ✅ CRITICAL FIX: Clean up peer connection - AB ERROR-FREE
  cleanupPeerConnection(peerId: string): void {
    const peerConnection = this.peerConnections.get(peerId);
    if (peerConnection) {
      peerConnection.close();
    }

    this.peerConnections.delete(peerId);
    store.dispatch(setRemoteStream(null));

    if (this.onStreamEndedCallback) {
      this.onStreamEndedCallback(peerId);
    }
  }
  
  // Clean up all connections
  cleanupAll(): void {
    Array.from(this.peerConnections.keys()).forEach(peerId => {
      this.cleanupPeerConnection(peerId);
    });
    
    this.peerConnections.clear();
    this.dataChannels.clear();
  }
  
  // Get peer connection stats
  async getStats(peerId: string): Promise<any> {
    const peerConnection = this.peerConnections.get(peerId);
    if (!peerConnection) return null;
    
    try {
      const stats = await peerConnection.getStats();
      const result: any = {};
      
      stats.forEach(report => {
        result[report.type] = {
          ...Object.fromEntries(
            Object.entries(report).filter(([key]) => !['type', 'id', 'timestamp'].includes(key))
          ),
          timestamp: report.timestamp,
        };
      });
      
      return result;
    } catch (error) {
      console.error('Get stats error:', error);
      return null;
    }
  }
  
  // Get all peer IDs
  getPeerIds(): string[] {
    return Array.from(this.peerConnections.keys());
  }
  
  // Check if has connection for peer
  hasConnection(peerId: string): boolean {
    return this.peerConnections.has(peerId);
  }
  
  // ✅ FIXED: Send methods with socket
  private sendOffer(peerId: string, offer: RTCSessionDescriptionInit) {
    console.log("📤 Sending offer to", peerId);
    this.socket.emit("webrtc:offer", {
      targetUserId: peerId,
      offer,
    });
  }

  private sendAnswer(peerId: string, answer: RTCSessionDescriptionInit) {
    console.log("📤 Sending answer to", peerId);
    this.socket.emit("webrtc:answer", {
      targetUserId: peerId,
      answer,
    });
  }

  private sendIceCandidate(peerId: string, candidate: RTCIceCandidate) {
    console.log("📤 Sending ICE candidate to", peerId);
    this.socket.emit("webrtc:ice-candidate", {
      targetUserId: peerId,
      candidate,
    });
  }
}

export default WebRTCService;

# 42 - socket.d.ts

import 'socket.io';

declare module 'socket.io' {
  interface Socket {
    userId?: string;
  }
}

# 43 - AudioMonitor

// src/utils/AudioMonitor.tsx
import React, { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../app/store'; // ✅ CORRECT IMPORT PATH

interface AudioMonitorProps {
  showVisualizer?: boolean;
}

const AudioMonitor: React.FC<AudioMonitorProps> = ({ showVisualizer = true }) => {
  const localStream = useSelector((state: RootState) => state.call.localStream);
  const remoteStream = useSelector((state: RootState) => state.call.remoteStream);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  // Monitor local audio
  useEffect(() => {
    if (!localStream || !showVisualizer) return;

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(localStream);
    
    source.connect(analyser);
    analyser.fftSize = 256;
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      
      analyser.getByteFrequencyData(dataArray);
      
      // Check if audio is being transmitted
      const average = dataArray.reduce((a, b) => a + b) / bufferLength;
      const isAudioActive = average > 10; // Threshold
      
      // if (isAudioActive) {
      //   console.log('🎤 Local audio active - level:', average.toFixed(2));
      // }
      
      // Visualize if canvas exists
      if (canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const barWidth = (canvas.width / bufferLength) * 2.5;
        let barHeight;
        let x = 0;
        
        for (let i = 0; i < bufferLength; i++) {
          barHeight = dataArray[i];
          
          ctx.fillStyle = `rgb(${barHeight + 100}, 50, 50)`;
          ctx.fillRect(x, canvas.height - barHeight / 2, barWidth, barHeight / 2);
          
          x += barWidth + 1;
        }
      }
    };
    
    draw();
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      audioContext.close();
    };
  }, [localStream, showVisualizer]);

  // Monitor remote audio
  useEffect(() => {
    if (!remoteStream) return;
    
    // Check if remote stream has audio tracks
    const audioTracks = remoteStream.getAudioTracks();
    console.log('🔊 Remote audio tracks:', audioTracks.length);
    
    if (audioTracks.length > 0) {
      const track = audioTracks[0];
      console.log('🎧 Remote audio track state:', {
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState,
        kind: track.kind
      });
      
      // Listen for remote audio activity
      const audioElement = new Audio();
      audioElement.srcObject = remoteStream;
      
      // Set up audio level monitoring for remote
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(remoteStream);
      
      source.connect(analyser);
      analyser.fftSize = 256;
      
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      const checkRemoteAudio = () => {
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / bufferLength;
        
        if (average > 5) {
          console.log('🎧 Remote audio received - level:', average.toFixed(2));
        }
      };
      
      const interval = setInterval(checkRemoteAudio, 2000);
      
      return () => {
        clearInterval(interval);
        audioContext.close();
      };
    }
  }, [remoteStream]);

  

  return showVisualizer ? (
    <div className="fixed bottom-20 left-4 bg-gray-800 bg-opacity-80 p-2 rounded-lg z-50">
      <div className="text-white text-xs mb-1">Audio Monitor</div>
      <canvas 
        ref={canvasRef} 
        width="200" 
        height="50"
        className="border border-gray-600 rounded"
      />
      <div className="text-xs text-gray-300 mt-1">
        Local: {localStream ? 'Connected' : 'No audio'}
        <br />
        Remote: {remoteStream ? 'Connected' : 'No audio'}
      </div>
    </div>
  ) : null;
};

export default AudioMonitor;

# 44 - date.ts

// Format duration in seconds to MM:SS or HH:MM:SS
export const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

// Format date
export const formatDate = (date: Date | string): string => {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

// Format time
export const formatTime = (date: Date | string): string => {
  const d = new Date(date);
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
};

// Get relative time
export const getRelativeTime = (date: Date | string): string => {
  const now = new Date();
  const past = new Date(date);
  const diffInSeconds = Math.floor((now.getTime() - past.getTime()) / 1000);
  
  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  return formatDate(past);
};

# 45 - App.tsx

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { Toaster } from 'react-hot-toast';

import { store, persistor } from './app/store';
import './i18n';

/* Pages */
import Login from './pages/Login';
import Register from './pages/Register';
import Home from './pages/Home';

/* Components */
import ProtectedRoute from './components/common/ProtectedRoute';
import MainLayout from './components/layout/MainLayout';
// import IncomingCallModal from './components/calls/IncomingCallModel';
import CallScreen from './components/calls/CallScreen';

/* Contexts */
import { SocketProvider } from './context/SocketContext';

function App() {
  return (
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <SocketProvider>
          <Router>
            <div className="App">
              {/* Toast Notifications */}
              <Toaster
                position="top-right"
                toastOptions={{
                  duration: 3000,
                  style: {
                    background: '#363636',
                    color: '#fff',
                  },
                  success: {
                    style: {
                      background: '#10B981',
                    },
                  },
                  error: {
                    style: {
                      background: '#EF4444',
                    },
                  },
                }}
              />

              {/* Call components (global) */}
              {/* <IncomingCallModal /> */}
              <CallScreen />

              {/* Routes */}
              <Routes>
                {/* Auth Routes */}
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />

                {/* Protected Routes */}
                <Route
                  path="/"
                  element={
                    <ProtectedRoute>
                      <MainLayout>
                        <Home />
                      </MainLayout>
                    </ProtectedRoute>
                  }
                />

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
          </Router>
        </SocketProvider>
      </PersistGate>
    </Provider>
  );
}

export default App;


# 46 - frontend/.env

REACT_APP_API_URL=http://localhost:5000/api/v1
REACT_APP_SOCKET_URL=http://localhost:5000
REACT_APP_NODE_ENV=development

REACT_APP_TRANSLATION_ENABLED=true
REACT_APP_DEFAULT_SOURCE_LANG=en
REACT_APP_DEFAULT_TARGET_LANG=es

# 47 - backend/.env

# ================= SERVER =================
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# ================= DATABASE =================
MONGODB_URI=mongodb://localhost:27017/whatsapp-clone

# ================= JWT =================
JWT_SECRET=SUPER_SECRET_TOKEN
JWT_REFRESH_SECRET=CHANGE_THIS_SECRET
ACCESS_TOKEN_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d

# ================= GOOGLE CLOUD =================
GOOGLE_APPLICATION_CREDENTIALS=./google-credentials.json

# ================= CLOUDINARY (optional for media) =================
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# ================= DEFAULT APP VALUES =================
DEFAULT_PROFILE_PIC=https://res.cloudinary.com/dmhcnhtng/image/upload/v1647354372/avatars/default_pic_jeaybr.png
DEFAULT_STATUS=Hey there! I am using WhatsApp
DEFAULT_GROUP_PIC=https://res.cloudinary.com/dmhcnhtng/image/upload/v1647354372/avatars/default_group_pic_jeaybr.png

# 48 - directory for frontend 

📦src
 ┣ 📂app
 ┃ ┣ 📜apiSlice.ts
 ┃ ┗ 📜store.ts
 ┣ 📂assets
 ┃ ┣ 📂icons
 ┃ ┗ 📂images
 ┣ 📂components
 ┃ ┣ 📂auth
 ┃ ┃ ┗ 📜AuthInput.tsx
 ┃ ┣ 📂calls
 ┃ ┃ ┣ 📜CallScreen.tsx
 ┃ ┃ ┣ 📜IncomingCallModel.tsx
 ┃ ┃ ┗ 📜TranslationSettings.tsx
 ┃ ┣ 📂chat
 ┃ ┃ ┣ 📜ChatList.tsx
 ┃ ┃ ┣ 📜MessageInput.tsx
 ┃ ┃ ┣ 📜MessageItem.tsx
 ┃ ┃ ┣ 📜NewChatModel.tsx
 ┃ ┃ ┗ 📜NewGroupModel.tsx
 ┃ ┣ 📂common
 ┃ ┃ ┗ 📜ProtectedRoute.tsx
 ┃ ┣ 📂layout
 ┃ ┃ ┣ 📜AuthLayout.tsx
 ┃ ┃ ┗ 📜MainLayout.tsx
 ┃ ┗ 📂translation
 ┃ ┃ ┣ 📜RealTimeTranslation.tsx
 ┃ ┃ ┣ 📜TranslationHistory.tsx
 ┃ ┃ ┣ 📜TranslationOverlay.tsx
 ┃ ┃ ┗ 📜TranslationSettings.tsx
 ┣ 📂context
 ┃ ┗ 📜SocketContext.tsx
 ┣ 📂features
 ┃ ┣ 📂auth
 ┃ ┃ ┣ 📜authApi.ts
 ┃ ┃ ┗ 📜authSlice.ts
 ┃ ┣ 📂calls
 ┃ ┃ ┣ 📜callApi.ts
 ┃ ┃ ┗ 📜callSlice.ts
 ┃ ┣ 📂chat
 ┃ ┃ ┣ 📜chatApi.ts
 ┃ ┃ ┣ 📜chatSlice.ts
 ┃ ┃ ┗ 📜translationSlice.ts
 ┃ ┣ 📂translation
 ┃ ┃ ┣ 📜translationApi.ts
 ┃ ┃ ┗ 📜translationSlice.ts
 ┃ ┗ 📂users
 ┃ ┃ ┣ 📜friendRequestApi.ts
 ┃ ┃ ┗ 📜userApi.ts
 ┣ 📂hooks
 ┃ ┣ 📜useCall.ts
 ┃ ┣ 📜useChat.ts
 ┃ ┗ 📜useTranslation.ts
 ┣ 📂i18n
 ┃ ┗ 📜index.ts
 ┣ 📂pages
 ┃ ┣ 📜Home.tsx
 ┃ ┣ 📜Login.tsx
 ┃ ┗ 📜Register.tsx
 ┣ 📂services
 ┃ ┣ 📜callSocket.ts
 ┃ ┣ 📜chat.service.ts
 ┃ ┣ 📜http.ts
 ┃ ┗ 📜WebRTCService.ts
 ┣ 📂styles
 ┣ 📂types
 ┃ ┗ 📜socket.d.ts
 ┣ 📂utils
 ┃ ┣ 📜AudioMonitor.tsx
 ┃ ┗ 📜date.ts
 ┣ 📜App.css
 ┣ 📜App.test.tsx
 ┣ 📜App.tsx
 ┣ 📜index.css
 ┣ 📜index.tsx
 ┣ 📜logo.svg
 ┣ 📜react-app-env.d.ts
 ┣ 📜reportWebVitals.ts
 ┗ 📜setupTests.ts

# 48 - directory for backend

📦src
 ┣ 📂config
 ┃ ┗ 📜database.ts
 ┣ 📂controllers
 ┃ ┣ 📜auth.controller.ts
 ┃ ┣ 📜call.controller.ts
 ┃ ┣ 📜chat.controller.ts
 ┃ ┣ 📜friendRequest.controller.ts
 ┃ ┣ 📜translation.controller.ts
 ┃ ┗ 📜user.controller.ts
 ┣ 📂middleware
 ┃ ┣ 📜auth.middleware.ts
 ┃ ┣ 📜errorHandler.ts
 ┃ ┗ 📜rateLimiter.ts
 ┣ 📂models
 ┃ ┣ 📜Call.ts
 ┃ ┣ 📜Chat.ts
 ┃ ┣ 📜FriendRequest.ts
 ┃ ┣ 📜Translation.ts
 ┃ ┗ 📜User.ts
 ┣ 📂routes
 ┃ ┣ 📜auth.routes.ts
 ┃ ┣ 📜call.routes.ts
 ┃ ┣ 📜chat.routes.ts
 ┃ ┣ 📜friendRequest.routes.ts
 ┃ ┣ 📜translation.routes.ts
 ┃ ┗ 📜user.routes.ts
 ┣ 📂services
 ┃ ┣ 📜auth.service.ts
 ┃ ┣ 📜chat_service.ts
 ┃ ┣ 📜friendRequest.service.ts
 ┃ ┣ 📜liveTranslation.service.ts
 ┃ ┣ 📜speech.service.ts
 ┃ ┣ 📜translation.service.ts
 ┃ ┗ 📜webrtc.service.ts
 ┣ 📂socket
 ┃ ┣ 📜socket.handler.ts
 ┃ ┗ 📜translation.handler.ts
 ┣ 📂types
 ┃ ┣ 📜express.d.ts
 ┃ ┗ 📜validation.d.ts
 ┣ 📂utils
 ┗ 📜server.ts
 tell if any file is unnecssary and is not needed so i can delete them 


 Keep Backend files 

 backend/src/
├── config/
│   └── database.ts                 ✅ KEEP - Database connection
├── controllers/
│   ├── auth.controller.ts          ✅ KEEP - Authentication
│   ├── call.controller.ts          ✅ KEEP - Call management
│   ├── chat.controller.ts           ✅ KEEP - Chat operations
│   ├── friendRequest.controller.ts  ✅ KEEP - Friend requests
│   ├── translation.controller.ts    ✅ KEEP - Translation API
│   └── user.controller.ts           ✅ KEEP - User operations
├── middleware/
│   ├── auth.middleware.ts          ✅ KEEP - JWT auth
│   ├── errorHandler.ts             ✅ KEEP - Error handling
│   └── rateLimiter.ts              ✅ KEEP - Rate limiting
├── models/
│   ├── Call.ts                     ✅ KEEP - Call schema
│   ├── Chat.ts                     ✅ KEEP - Chat schema
│   ├── FriendRequest.ts            ✅ KEEP - Friend request schema
│   ├── Translation.ts              ✅ KEEP - Translation schema
│   └── User.ts                     ✅ KEEP - User schema
├── routes/
│   ├── auth.routes.ts              ✅ KEEP - Auth endpoints
│   ├── call.routes.ts              ✅ KEEP - Call endpoints
│   ├── chat.routes.ts              ✅ KEEP - Chat endpoints
│   ├── friendRequest.routes.ts     ✅ KEEP - Friend request endpoints
│   ├── translation.routes.ts       ✅ KEEP - Translation endpoints
│   └── user.routes.ts              ✅ KEEP - User endpoints
├── services/
│   ├── auth.service.ts             ✅ KEEP - Auth logic
│   ├── chat_service.ts             ✅ KEEP - Chat logic
│   ├── friendRequest.service.ts    ✅ KEEP - Friend request logic
│   ├── liveTranslation.service.ts  ✅ KEEP - Real-time translation
│   ├── speech.service.ts           ✅ KEEP - Speech-to-text
│   ├── translation.service.ts      ✅ KEEP - Translation logic
│   └── webrtc.service.ts           ✅ KEEP - WebRTC signaling
├── socket/
│   ├── socket.handler.ts           ✅ KEEP - Main socket handler
│   └── translation.handler.ts      ✅ KEEP - Translation socket handlers
├── types/
│   ├── express.d.ts                ✅ KEEP - Type declarations
│   └── validation.d.ts             ✅ KEEP - Validator types
└── server.ts                       ✅ KEEP - Main server file

keep frotnend files 

frontend/src/
├── app/
│   ├── apiSlice.ts                 ✅ KEEP - RTK Query setup
│   └── store.ts                    ✅ KEEP - Redux store
├── components/
│   ├── auth/
│   │   └── AuthInput.tsx           ✅ KEEP - Auth form input
│   ├── calls/
│   │   ├── CallScreen.tsx          ✅ KEEP - Call UI
│   │   ├── IncomingCallModel.tsx   ✅ KEEP - Incoming call modal
│   │   └── TranslationSettings.tsx ✅ KEEP - Translation settings
│   ├── chat/
│   │   ├── ChatList.tsx            ✅ KEEP - Chat list
│   │   ├── MessageInput.tsx        ✅ KEEP - Message input
│   │   ├── MessageItem.tsx         ✅ KEEP - Message display
│   │   ├── NewChatModel.tsx        ✅ KEEP - New chat modal
│   │   └── NewGroupModel.tsx       ✅ KEEP - New group modal
│   ├── common/
│   │   └── ProtectedRoute.tsx      ✅ KEEP - Route protection
│   ├── layout/
│   │   ├── AuthLayout.tsx          ✅ KEEP - Auth page layout
│   │   └── MainLayout.tsx          ✅ KEEP - Main app layout
│   └── translation/
│       ├── RealTimeTranslation.tsx ✅ KEEP - Live translation UI
│       ├── TranslationHistory.tsx  ✅ KEEP - Translation history
│       ├── TranslationOverlay.tsx  ✅ KEEP - Overlay translation
│       └── TranslationSettings.tsx ✅ KEEP - Translation settings
├── context/
│   └── SocketContext.tsx           ✅ KEEP - Socket provider
├── features/
│   ├── auth/
│   │   ├── authApi.ts              ✅ KEEP - Auth API
│   │   └── authSlice.ts            ✅ KEEP - Auth state
│   ├── calls/
│   │   ├── callApi.ts              ✅ KEEP - Call API
│   │   └── callSlice.ts            ✅ KEEP - Call state
│   ├── chat/
│   │   ├── chatApi.ts              ✅ KEEP - Chat API
│   │   └── chatSlice.ts            ✅ KEEP - Chat state
│   ├── translation/
│   │   ├── translationApi.ts       ✅ KEEP - Translation API
│   │   └── translationSlice.ts     ✅ KEEP - Translation state
│   └── users/
│       ├── friendRequestApi.ts     ✅ KEEP - Friend request API
│       └── userApi.ts              ✅ KEEP - User API
├── hooks/
│   ├── useCall.ts                  ✅ KEEP - Call hook
│   ├── useChat.ts                  ✅ KEEP - Chat hook
│   └── useTranslation.ts           ✅ KEEP - Translation hook
├── i18n/
│   └── index.ts                    ✅ KEEP - i18n setup
├── pages/
│   ├── Home.tsx                    ✅ KEEP - Home page
│   ├── Login.tsx                   ✅ KEEP - Login page
│   └── Register.tsx                ✅ KEEP - Register page
├── services/
│   ├── callSocket.ts               ✅ KEEP - Call socket service
│   ├── chat.service.ts             ✅ KEEP - Chat socket service
│   ├── http.ts                     ✅ KEEP - HTTP client
│   └── WebRTCService.ts            ✅ KEEP - WebRTC service
├── types/
│   └── socket.d.ts                 ✅ KEEP - Socket types
├── utils/
│   ├── AudioMonitor.tsx            ✅ KEEP - Audio debugging
│   └── date.ts                     ✅ KEEP - Date utilities
└── App.tsx                         ✅ KEEP - Main app component


Delete 

frontend/src/
├── App.css                         ❌ DELETE - Not used (using Tailwind)
├── App.test.tsx                    ❌ DELETE - No tests written
├── index.css                       ❌ DELETE - Using Tailwind
├── logo.svg                        ❌ DELETE - Not used
├── react-app-env.d.ts              ❌ DELETE - Auto-generated, not needed
├── reportWebVitals.ts              ❌ DELETE - Not using analytics
├── setupTests.ts                   ❌ DELETE - No tests written
├── features/chat/translationSlice.ts ❌ DELETE - DUPLICATE (already in features/translation/)
├── styles/                         ❌ DELETE - Empty folder (no files inside)
├── assets/icons/                   ❌ DELETE - Empty folder
└── assets/images/                  ❌ DELETE - Empty folder

backend final

backend/src/
├── config/
│   └── database.ts
├── controllers/
│   ├── auth.controller.ts
│   ├── call.controller.ts
│   ├── chat.controller.ts
│   ├── friendRequest.controller.ts
│   ├── translation.controller.ts
│   └── user.controller.ts
├── middleware/
│   ├── auth.middleware.ts
│   ├── errorHandler.ts
│   └── rateLimiter.ts
├── models/
│   ├── Call.ts
│   ├── Chat.ts
│   ├── FriendRequest.ts
│   ├── Translation.ts
│   └── User.ts
├── routes/
│   ├── auth.routes.ts
│   ├── call.routes.ts
│   ├── chat.routes.ts
│   ├── friendRequest.routes.ts
│   ├── translation.routes.ts
│   └── user.routes.ts
├── services/
│   ├── auth.service.ts
│   ├── chat_service.ts
│   ├── friendRequest.service.ts
│   ├── liveTranslation.service.ts
│   ├── speech.service.ts
│   ├── translation.service.ts
│   └── webrtc.service.ts
├── socket/
│   ├── socket.handler.ts
│   └── translation.handler.ts
├── types/
│   ├── express.d.ts
│   └── validation.d.ts
└── server.ts

frontend final 

frontend/src/
├── app/
│   ├── apiSlice.ts
│   └── store.ts
├── components/
│   ├── auth/
│   │   └── AuthInput.tsx
│   ├── calls/
│   │   ├── CallScreen.tsx
│   │   ├── IncomingCallModel.tsx
│   │   └── TranslationSettings.tsx
│   ├── chat/
│   │   ├── ChatList.tsx
│   │   ├── MessageInput.tsx
│   │   ├── MessageItem.tsx
│   │   ├── NewChatModel.tsx
│   │   └── NewGroupModel.tsx
│   ├── common/
│   │   └── ProtectedRoute.tsx
│   ├── layout/
│   │   ├── AuthLayout.tsx
│   │   └── MainLayout.tsx
│   └── translation/
│       ├── RealTimeTranslation.tsx
│       ├── TranslationHistory.tsx
│       ├── TranslationOverlay.tsx
│       └── TranslationSettings.tsx
├── context/
│   └── SocketContext.tsx
├── features/
│   ├── auth/
│   │   ├── authApi.ts
│   │   └── authSlice.ts
│   ├── calls/
│   │   ├── callApi.ts
│   │   └── callSlice.ts
│   ├── chat/
│   │   ├── chatApi.ts
│   │   └── chatSlice.ts
│   ├── translation/
│   │   ├── translationApi.ts
│   │   └── translationSlice.ts
│   └── users/
│       ├── friendRequestApi.ts
│       └── userApi.ts
├── hooks/
│   ├── useCall.ts
│   ├── useChat.ts
│   └── useTranslation.ts
├── i18n/
│   └── index.ts
├── pages/
│   ├── Home.tsx
│   ├── Login.tsx
│   └── Register.tsx
├── services/
│   ├── callSocket.ts
│   ├── chat.service.ts
│   ├── http.ts
│   └── WebRTCService.ts
├── types/
│   └── socket.d.ts
├── utils/
│   ├── AudioMonitor.tsx
│   └── date.ts
└── App.tsx