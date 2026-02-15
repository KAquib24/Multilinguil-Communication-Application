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