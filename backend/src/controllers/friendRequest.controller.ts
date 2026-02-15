import { Request, Response, NextFunction } from 'express';
import { FriendRequestService } from '../services/friendRequest.service.js';
import createHttpError from 'http-errors';
import mongoose from 'mongoose';

export class FriendRequestController {
  
  // Send friend request
  static async sendRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user._id.toString();
      const { toUserId } = req.body;
      
      if (!mongoose.Types.ObjectId.isValid(toUserId)) {
        throw createHttpError(400, 'Invalid user ID');
      }
      
      const request = await FriendRequestService.sendFriendRequest(userId, toUserId);
      
      res.status(201).json({
        success: true,
        message: 'Friend request sent',
        data: { request },
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Accept friend request
  static async acceptRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user._id.toString();
      const { requestId } = req.params;
      
      if (!mongoose.Types.ObjectId.isValid(requestId)) {
        throw createHttpError(400, 'Invalid request ID');
      }
      
      const request = await FriendRequestService.acceptFriendRequest(requestId, userId);
      
      res.status(200).json({
        success: true,
        message: 'Friend request accepted',
        data: { request },
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Reject friend request
  static async rejectRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user._id.toString();
      const { requestId } = req.params;
      
      if (!mongoose.Types.ObjectId.isValid(requestId)) {
        throw createHttpError(400, 'Invalid request ID');
      }
      
      const request = await FriendRequestService.rejectFriendRequest(requestId, userId);
      
      res.status(200).json({
        success: true,
        message: 'Friend request rejected',
        data: { request },
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Cancel friend request
  static async cancelRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user._id.toString();
      const { requestId } = req.params;
      
      if (!mongoose.Types.ObjectId.isValid(requestId)) {
        throw createHttpError(400, 'Invalid request ID');
      }
      
      const request = await FriendRequestService.cancelFriendRequest(requestId, userId);
      
      res.status(200).json({
        success: true,
        message: 'Friend request cancelled',
        data: { request },
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Get sent requests
  static async getSentRequests(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user._id.toString();
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      
      const result = await FriendRequestService.getSentRequests(userId, page, limit);
      
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Get received requests
  static async getReceivedRequests(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user._id.toString();
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      
      const result = await FriendRequestService.getReceivedRequests(userId, page, limit);
      
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Check friendship status
  static async getFriendshipStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user._id.toString();
      const { targetUserId } = req.params;
      
      if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
        throw createHttpError(400, 'Invalid user ID');
      }
      
      const status = await FriendRequestService.getFriendshipStatus(userId, targetUserId);
      
      res.status(200).json({
        success: true,
        data: { status },
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Remove friend
  static async removeFriend(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user._id.toString();
      const { friendId } = req.params;
      
      if (!mongoose.Types.ObjectId.isValid(friendId)) {
        throw createHttpError(400, 'Invalid friend ID');
      }
      
      await FriendRequestService.removeFriend(userId, friendId);
      
      res.status(200).json({
        success: true,
        message: 'Friend removed',
      });
    } catch (error) {
      next(error);
    }
  }
}