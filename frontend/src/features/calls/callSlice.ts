import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Call } from './callApi';

interface CallState {
  activeCall: Call | null;
  incomingCall: Call | null;
  callHistory: Call[];
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isCalling: boolean;
  isRinging: boolean;
  isInCall: boolean;
  isMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
  isRecording: boolean;
  iceServers: RTCIceServer[];
  isLoading: boolean;
  error: string | null;
}

const initialState: CallState = {
  activeCall: null,
  incomingCall: null,
  callHistory: [],
  localStream: null,
  remoteStream: null,
  isCalling: false,
  isRinging: false,
  isInCall: false,
  isMuted: false,
  isVideoOff: false,
  isScreenSharing: false,
  isRecording: false,
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
      state.localStream = null;
      state.remoteStream = null;
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
  setRemoteStream,
  setIsCalling,
  setIsRinging,
  setIsInCall,
  toggleMute,
  toggleVideo,
  toggleScreenSharing,
  toggleRecording,
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
export const selectRemoteStream = (state: { call: CallState }) => state.call.remoteStream;
export const selectIsCalling = (state: { call: CallState }) => state.call.isCalling;
export const selectIsRinging = (state: { call: CallState }) => state.call.isRinging;
export const selectIsInCall = (state: { call: CallState }) => state.call.isInCall;
export const selectIsMuted = (state: { call: CallState }) => state.call.isMuted;
export const selectIsVideoOff = (state: { call: CallState }) => state.call.isVideoOff;
export const selectIsScreenSharing = (state: { call: CallState }) => state.call.isScreenSharing;
export const selectIsRecording = (state: { call: CallState }) => state.call.isRecording;
export const selectIceServers = (state: { call: CallState }) => state.call.iceServers;
export const selectIsLoading = (state: { call: CallState }) => state.call.isLoading;
export const selectCallError = (state: { call: CallState }) => state.call.error;