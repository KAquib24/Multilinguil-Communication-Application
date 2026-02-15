import { Request, Response, NextFunction } from "express";
import { WebRTCService } from "../services/webrtc.service.js";
import { CallType, CallStatus } from "../models/Call.js";
import createHttpError from "http-errors";
import mongoose from "mongoose";

export class CallController {
  // Initiate a call
  static async initiateCall(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user._id.toString();
      const {
        participantIds,
        type = CallType.VIDEO,
        chatId,
        metadata,
        translationEnabled = false, // ADDED
        sourceLanguage = "en",       // ADDED
        targetLanguage = "en",       // ADDED
      } = req.body;

      if (!participantIds || !Array.isArray(participantIds)) {
        throw createHttpError(
          400,
          "Participant IDs are required and must be an array",
        );
      }

      // Filter out duplicate IDs and the initiator
      const uniqueParticipantIds = [...new Set(participantIds)].filter(
        (id) => id !== userId && mongoose.Types.ObjectId.isValid(id),
      );

      if (uniqueParticipantIds.length === 0) {
        throw createHttpError(
          400,
          "At least one valid participant is required",
        );
      }

      // Merge translation settings into metadata
      const callMetadata = {
        ...metadata,
        translationEnabled,
        sourceLanguage,
        targetLanguage,
      };

      const call = await WebRTCService.initiateCall(
        userId,
        uniqueParticipantIds,
        type,
        chatId,
        callMetadata, // UPDATED
      );

      const io = req.app.get("io");

      uniqueParticipantIds.forEach((receiverId: string) => {
        io.to(`user:${receiverId}`).emit("call:incoming", {
          call,
        });
      });

      res.status(201).json({
        success: true,
        message: "Call initiated",
        data: { call },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get call by ID
  static async getCall(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user._id.toString();
      const { callId } = req.params;

      const call = await WebRTCService.getCall(callId, userId);

      res.status(200).json({
        success: true,
        data: { call },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get active calls
  static async getActiveCalls(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user._id.toString();
      const calls = await WebRTCService.getActiveCalls(userId);

      res.status(200).json({
        success: true,
        data: { calls },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get call history
  static async getCallHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user._id.toString();
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;

      const result = await WebRTCService.getCallHistory(userId, page, limit);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  // Answer a call
  static async answerCall(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user._id.toString();
      const { callId } = req.params;

      const call = await WebRTCService.answerCall(callId, userId);

      const io = req.app.get("io");

      // notify CALLER (initiator)
      io.to(`user:${call.initiator._id.toString()}`).emit("call:answered", {
        call,
      });

      res.status(200).json({
        success: true,
        message: "Call answered",
        data: { call },
      });
    } catch (error) {
      next(error);
    }
  }

  // Reject a call
  static async rejectCall(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user._id.toString();
      const { callId } = req.params;
      const { reason } = req.body;

      const call = await WebRTCService.rejectCall(callId, userId, reason);

      res.status(200).json({
        success: true,
        message: "Call rejected",
        data: { call },
      });
    } catch (error) {
      next(error);
    }
  }

  // End a call
  static async endCall(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user._id.toString();
      const { callId } = req.params;

      const call = await WebRTCService.endCall(callId, userId);

      const io = req.app.get("io");

      // notify ALL participants
      call.participants.forEach((p: any) => {
        io.to(`user:${p.userId.toString()}`).emit("call:ended", {
          call,
        });
      });

      res.status(200).json({
        success: true,
        message: "Call ended",
        data: { call },
      });
    } catch (error) {
      next(error);
    }
  }

  // Join a call
  static async joinCall(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user._id.toString();
      const { callId } = req.params;
      const { streamId } = req.body;

      const call = await WebRTCService.joinCall(callId, userId, streamId);

      res.status(200).json({
        success: true,
        message: "Joined call",
        data: { call },
      });
    } catch (error) {
      next(error);
    }
  }

  // Leave a call
  static async leaveCall(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user._id.toString();
      const { callId } = req.params;

      const call = await WebRTCService.leaveCall(callId, userId);

      res.status(200).json({
        success: true,
        message: "Left call",
        data: { call },
      });
    } catch (error) {
      next(error);
    }
  }

  // Update call metadata
  static async updateCallMetadata(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const userId = (req as any).user._id.toString();
      const { callId } = req.params;
      const updates = req.body;

      const call = await WebRTCService.updateCallMetadata(
        callId,
        userId,
        updates,
      );

      res.status(200).json({
        success: true,
        message: "Call metadata updated",
        data: { call },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get ICE servers configuration
  static async getIceServers(req: Request, res: Response, next: NextFunction) {
    try {
      const iceServers = WebRTCService.getIceServers();

      res.status(200).json({
        success: true,
        data: { iceServers },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get call statistics
  static async getCallStats(req: Request, res: Response, next: NextFunction) {
    try {
      const { callId } = req.params;

      const stats = await WebRTCService.getCallStats(callId);

      res.status(200).json({
        success: true,
        data: { stats },
      });
    } catch (error) {
      next(error);
    }
  }
}