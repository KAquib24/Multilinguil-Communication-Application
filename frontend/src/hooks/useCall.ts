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
  setIceServers,
  resetCallState,
} from "../features/calls/callSlice";

// ✅ FIXED: Import translation stuff from correct locations
import {
  selectTranslationEnabled,
  selectSourceLanguage,
  selectTargetLanguage,
} from "../features/translation/translationSelectors";

import {
  toggleTranslation,
  setSourceLanguage,
  setTargetLanguage,
} from "../features/translation/translationSlice";

import { selectCurrentUser } from "../features/auth/authSlice";
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
  
  // ✅ FIXED: These now come from translationSlice
  const translationEnabled = useSelector(selectTranslationEnabled);
  const sourceLanguage = useSelector(selectSourceLanguage);
  const targetLanguage = useSelector(selectTargetLanguage);
  
  const iceServers = useSelector(selectIceServers);
  const currentUser = useSelector(selectCurrentUser);

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

          (window as any).remoteStream = stream;

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

        (window as any).remoteStream = stream;

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

  // Start a call
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
      localStream,
    ],
  );

  // Answer incoming call
  const answerCall = useCallback(async () => {
    if (!incomingCall) return;

    try {
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

      await answerCallApi(incomingCall.callId).unwrap();

      if (callSocketRef.current) {
        callSocketRef.current.answerCall(incomingCall.callId);
      }

      dispatch(setActiveCall(incomingCall));
      dispatch(setIncomingCall(null));
      dispatch(setIsRinging(false));
      dispatch(setIsInCall(true));

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
  const endCall = useCallback(async () => {
    if (!activeCall) return;

    try {
      console.log("🔴 Ending call:", activeCall.callId);

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
      await endCall();

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
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop());
        screenStreamRef.current = null;
      }

      dispatch(toggleScreenSharing(false));

      if (activeCall) {
        await updateCallMetadataApi({
          callId: activeCall._id,
          updates: { isScreenSharing: false },
        });
      }

      toast.success("Screen sharing stopped");
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            frameRate: { ideal: 30 },
          },
          audio: true,
        });

        screenStreamRef.current = screenStream;
        dispatch(toggleScreenSharing(true));

        if (activeCall) {
          await updateCallMetadataApi({
            callId: activeCall._id,
            updates: { isScreenSharing: true },
          });
        }

        toast.success("Screen sharing started");

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

    if (activeCall) {
      await updateCallMetadataApi({
        callId: activeCall._id,
        updates: { isRecording: !isRecording },
      });
    }

    toast.success(isRecording ? "Recording stopped" : "Recording started");
  }, [isRecording, activeCall, updateCallMetadataApi, dispatch]);

  // Toggle translation - ✅ FIXED: dispatch from translationSlice
  const toggleCallTranslation = useCallback(() => {
    dispatch(toggleTranslation());

    if (activeCall) {
      updateCallMetadataApi({
        callId: activeCall._id,
        updates: { translationEnabled: !translationEnabled },
      });
    }

    toast.success(translationEnabled ? "Translation off" : "Translation on");
  }, [translationEnabled, activeCall, updateCallMetadataApi, dispatch]);

  // Update translation languages - ✅ FIXED: dispatch from translationSlice
  const updateTranslationLanguages = useCallback(
    (source: string, target: string) => {
      dispatch(setSourceLanguage(source));
      dispatch(setTargetLanguage(target));

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