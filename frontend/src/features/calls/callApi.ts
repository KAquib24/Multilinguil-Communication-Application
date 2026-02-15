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
