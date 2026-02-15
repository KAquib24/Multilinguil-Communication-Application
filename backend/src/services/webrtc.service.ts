import { v4 as uuidv4 } from "uuid";
import createHttpError from "http-errors";
import Call, { CallType, CallStatus, ICall } from "../models/Call.js";
import User from "../models/User.js";
import { Chat } from "../models/Chat.js";

// WebRTC type declaration (if @types/webrtc not installed)
interface RTCIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

// STUN/TURN server configuration
const STUN_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
];

// TURN servers (configure these in production)
const TURN_SERVERS: any[] = process.env.TURN_SERVERS
  ? JSON.parse(process.env.TURN_SERVERS)
  : [];

export class WebRTCService {
  // Generate unique call ID
  static generateCallId(): string {
    return `call_${uuidv4().replace(/-/g, "")}`;
  }

  // Initiate a call
  static async initiateCall(
    initiatorId: string,
    participantIds: string[],
    type: CallType = CallType.VOICE,
    chatId?: string,
    metadata?: any,
  ): Promise<ICall> {
    try {
      const initiator = await User.findById(initiatorId);
      if (!initiator) {
        throw createHttpError(404, "Initiator not found");
      }

      const participants = await User.find({
        _id: { $in: participantIds },
      });

      if (participants.length === 0) {
        throw createHttpError(400, "At least one participant is required");
      }

      if (chatId) {
        const chat = await Chat.findById(chatId);
        if (!chat) {
          throw createHttpError(404, "Chat not found");
        }
      }

      const call = new Call({
        callId: this.generateCallId(),
        initiator: initiatorId,
        participants: [
          {
            userId: initiatorId,
            joinedAt: new Date(),
            isActive: true,
          },
          ...participants.map((p) => ({
            userId: p._id,
            joinedAt: null,
            isActive: false,
          })),
        ],
        type,
        status: CallStatus.INITIATED,
        chat: chatId,
        startTime: new Date(),
        turnServers: TURN_SERVERS,
        metadata: {
          isRecording: false,
          isScreenSharing: false,
          translationEnabled: metadata?.translationEnabled || false,
          sourceLanguage: metadata?.sourceLanguage || "en",
          targetLanguage: metadata?.targetLanguage || "en",
          maxParticipants: Math.max(10, participantIds.length + 1),
          ...metadata,
        },
      });

      await call.save();

      const populatedCall = await Call.findById(call._id)
        .populate("initiator", "name picture email")
        .populate("participants.userId", "name picture email");

      return populatedCall!;
    } catch (error) {
      throw error;
    }
  }

  // Get call by ID
  static async getCall(callId: string, userId?: string): Promise<ICall> {
    try {
      const query: any = { callId };

      if (userId) {
        query["participants.userId"] = userId;
      }

      const call = await Call.findOne(query)
        .populate("initiator", "name picture email")
        .populate("participants.userId", "name picture email")
        .populate("chat");

      if (!call) {
        throw createHttpError(404, "Call not found");
      }

      return call;
    } catch (error) {
      throw error;
    }
  }

  // Get user's active calls
  static async getActiveCalls(userId: string): Promise<ICall[]> {
    try {
      const calls = await Call.find({
        "participants.userId": userId,
        status: {
          $in: [CallStatus.INITIATED, CallStatus.RINGING, CallStatus.ANSWERED],
        },
      })
        .populate("initiator", "name picture email")
        .populate("participants.userId", "name picture email")
        .sort({ startTime: -1 })
        .limit(20);

      return calls;
    } catch (error) {
      throw error;
    }
  }

  // Get user's call history
  static async getCallHistory(
    userId: string,
    page = 1,
    limit = 50,
  ): Promise<{
    calls: ICall[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const skip = (page - 1) * limit;

      const [calls, total] = await Promise.all([
        Call.find({
          "participants.userId": userId,
          status: {
            $in: [CallStatus.ENDED, CallStatus.REJECTED, CallStatus.MISSED],
          },
        })
          .populate("initiator", "name picture email")
          .populate("participants.userId", "name picture email")
          .sort({ startTime: -1 })
          .skip(skip)
          .limit(limit),
        Call.countDocuments({
          "participants.userId": userId,
          status: {
            $in: [CallStatus.ENDED, CallStatus.REJECTED, CallStatus.MISSED],
          },
        }),
      ]);

      return {
        calls,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      throw error;
    }
  }

  // Answer a call - USING METHODS
  static async answerCall(callId: string, userId: string): Promise<ICall> {
    try {
      const call = await Call.findOne({ callId });

      if (!call) {
        throw createHttpError(404, "Call not found");
      }

      const isParticipant = call.participants.some(
        (p) => p.userId.toString() === userId,
      );

      if (!isParticipant) {
        throw createHttpError(403, "You are not a participant in this call");
      }

      // Using the method
      call.updateStatus(CallStatus.ANSWERED);
      call.addParticipant(userId);

      await call.save();

      const populatedCall = await Call.findById(call._id)
        .populate("initiator", "name picture email")
        .populate("participants.userId", "name picture email");

      return populatedCall!;
    } catch (error) {
      throw error;
    }
  }

  // Reject a call - USING METHODS
  static async rejectCall(
    callId: string,
    userId: string,
    reason?: string,
  ): Promise<ICall> {
    try {
      const call = await Call.findOne({ callId });

      if (!call) {
        throw createHttpError(404, "Call not found");
      }

      const isParticipant = call.participants.some(
        (p) => p.userId.toString() === userId,
      );

      if (!isParticipant) {
        throw createHttpError(403, "You are not a participant in this call");
      }

      // Using the method
      call.updateStatus(CallStatus.REJECTED);

      await call.save();

      return call;
    } catch (error) {
      throw error;
    }
  }

  // End a call - USING METHODS
  static async endCall(callId: string, userId: string): Promise<ICall> {
    try {
      const call = await Call.findOne({ callId });

      if (!call) {
        throw createHttpError(404, "Call not found");
      }

      const isParticipant = call.participants.some(
        (p) => p.userId.toString() === userId,
      );

      if (!isParticipant) {
        throw createHttpError(403, "You are not a participant in this call");
      }

      // Using the method
      call.updateStatus(CallStatus.ENDED);

      call.participants.forEach((p) => {
        p.isActive = false;
      });

      await call.save();

      const populatedCall = await Call.findById(call._id)
        .populate("initiator", "name picture email")
        .populate("participants.userId", "name picture email");

      return populatedCall!;
    } catch (error) {
      throw error;
    }
  }

  // Join a call - USING METHODS
  static async joinCall(
    callId: string,
    userId: string,
    streamId?: string,
  ): Promise<ICall> {
    try {
      const call = await Call.findOne({ callId });

      if (!call) {
        throw createHttpError(404, "Call not found");
      }

      // Using the virtual property
      if (!call.isActive) {
        throw createHttpError(400, "Call is not active");
      }

      const isParticipant = call.participants.some(
        (p) => p.userId.toString() === userId,
      );

      if (!isParticipant) {
        throw createHttpError(403, "You are not a participant in this call");
      }

      // Using the method
      call.addParticipant(userId, streamId);

      await call.save();

      const populatedCall = await Call.findById(call._id)
        .populate("initiator", "name picture email")
        .populate("participants.userId", "name picture email");

      return populatedCall!;
    } catch (error) {
      throw error;
    }
  }

  // Leave a call - USING METHODS
  static async leaveCall(callId: string, userId: string): Promise<ICall> {
    try {
      const call = await Call.findOne({ callId });

      if (!call) {
        throw createHttpError(404, "Call not found");
      }

      // Using the method
      call.removeParticipant(userId);

      // If no active participants left, end the call
      const activeParticipants = call.participants.filter((p) => p.isActive);
      if (activeParticipants.length === 0) {
        call.updateStatus(CallStatus.ENDED);
      }

      await call.save();

      return call;
    } catch (error) {
      throw error;
    }
  }

  // Update call metadata
  static async updateCallMetadata(
    callId: string,
    userId: string,
    updates: any,
  ): Promise<ICall> {
    try {
      const call = await Call.findOne({ callId });

      if (!call) {
        throw createHttpError(404, "Call not found");
      }

      const isInitiator = call.initiator.toString() === userId;
      const isParticipant = call.participants.some(
        (p) => p.userId.toString() === userId && p.isActive,
      );

      if (!isInitiator && !isParticipant) {
        throw createHttpError(403, "Not authorized to update call");
      }

      call.metadata = {
        ...call.metadata,
        ...updates,
      };

      await call.save();

      return call;
    } catch (error) {
      throw error;
    }
  }

  // Get ICE servers configuration
  static getIceServers(): RTCIceServer[] {
    const iceServers: RTCIceServer[] = [...STUN_SERVERS];

    if (TURN_SERVERS.length > 0) {
      TURN_SERVERS.forEach((server: any) => {
        iceServers.push({
          urls: server.urls,
          username: server.username,
          credential: server.credential,
        });
      });
    }

    return iceServers;
  }

  // Generate TURN credentials
  static generateTurnCredentials(): { username: string; credential: string } {
    const username = uuidv4();
    const credential = uuidv4();
    return { username, credential };
  }

  // Get call statistics
  static async getCallStats(callId: string): Promise<any> {
    try {
      const call = await Call.findOne({ callId });

      if (!call) {
        throw createHttpError(404, "Call not found");
      }

      // Using the virtual property
      const duration = call.duration;

      const stats = {
        callId: call.callId,
        type: call.type,
        status: call.status,
        startTime: call.startTime,
        duration,
        participantCount: call.participants.length,
        activeParticipants: call.participants.filter((p) => p.isActive).length,
        isRecording: call.metadata?.isRecording || false,
        isScreenSharing: call.metadata?.isScreenSharing || false,
        translationEnabled: call.metadata?.translationEnabled || false,
        sourceLanguage: call.metadata?.sourceLanguage || "en",
        targetLanguage: call.metadata?.targetLanguage || "en",
      };

      return stats;
    } catch (error) {
      throw error;
    }
  }
}
