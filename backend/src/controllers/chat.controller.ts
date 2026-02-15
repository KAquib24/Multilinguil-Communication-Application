import { Request, Response, NextFunction } from 'express';
import { ChatService } from '../services/chat_service'; // ✅ Remove .js extension
import createHttpError from 'http-errors'; // ✅ Correct import
import mongoose from 'mongoose';

export class ChatController {
  
  // Get all user chats
  static async getUserChats(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user._id.toString();
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      
      const result = await ChatService.getUserChats(userId, page, limit);
      
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Get or create one-on-one chat
  static async getOrCreateChat(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user._id.toString();
      const { targetUserId } = req.params;
      
      if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
        throw createHttpError(400, 'Invalid user ID'); // ✅ Use createHttpError directly
      }
      
      const chat = await ChatService.findOrCreateOneOnOne(userId, targetUserId);
      
      res.status(200).json({
        success: true,
        data: { chat },
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Create group chat
  static async createGroup(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user._id.toString();
      const { name, participants, photo, description } = req.body;
      
      if (!name || !participants || !Array.isArray(participants)) {
        throw createHttpError(400, 'Group name and participants are required');
      }
      
      const chat = await ChatService.createGroup(
        userId,
        name,
        participants,
        photo,
        description
      );
      
      res.status(201).json({
        success: true,
        message: 'Group created successfully',
        data: { chat },
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Get chat by ID
  static async getChat(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user._id.toString();
      const { chatId } = req.params;
      
      if (!mongoose.Types.ObjectId.isValid(chatId)) {
        throw createHttpError(400, 'Invalid chat ID');
      }
      
      const chat = await ChatService.getChatById(chatId, userId);
      
      res.status(200).json({
        success: true,
        data: { chat },
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Get chat messages
  static async getMessages(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user._id.toString();
      const { chatId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const before = req.query.before ? new Date(req.query.before as string) : undefined;
      
      if (!mongoose.Types.ObjectId.isValid(chatId)) {
        throw createHttpError(400, 'Invalid chat ID');
      }
      
      const result = await ChatService.getChatMessages(
        chatId,
        userId,
        page,
        limit,
        before
      );
      
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Send message
  static async sendMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user._id.toString();
      const { chatId } = req.params;
      const {
        content,
        type = 'text',
        fileUrl,
        fileName,
        fileSize,
        mimeType,
        thumbnail,
        duration,
        latitude,
        longitude,
        locationName,
        replyTo,
        forwarded,
        forwardedFrom,
      } = req.body;
      
      if (!mongoose.Types.ObjectId.isValid(chatId)) {
        throw createHttpError(400, 'Invalid chat ID');
      }
      
      if (type === 'text' && !content?.trim()) {
        throw createHttpError(400, 'Message content is required');
      }
      
      const message = await ChatService.sendMessage(
        chatId,
        userId,
        content || '',
        type,
        {
          fileUrl,
          fileName,
          fileSize,
          mimeType,
          thumbnail,
          duration,
          latitude,
          longitude,
          locationName,
          replyTo,
          forwarded,
          forwardedFrom,
        }
      );
      
      res.status(201).json({
        success: true,
        message: 'Message sent successfully',
        data: { message },
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Mark messages as read
  static async markAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user._id.toString();
      const { chatId } = req.params;
      const { messageIds } = req.body;
      
      if (!mongoose.Types.ObjectId.isValid(chatId)) {
        throw createHttpError(400, 'Invalid chat ID');
      }
      
      const result = await ChatService.markAsRead(chatId, userId, messageIds);
      
      res.status(200).json({
        success: true,
        message: 'Messages marked as read',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Delete message
  static async deleteMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user._id.toString();
      const { messageId } = req.params;
      
      if (!mongoose.Types.ObjectId.isValid(messageId)) {
        throw createHttpError(400, 'Invalid message ID');
      }
      
      const message = await ChatService.deleteMessage(messageId, userId);
      
      res.status(200).json({
        success: true,
        message: 'Message deleted successfully',
        data: { message },
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Add reaction
  static async addReaction(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user._id.toString();
      const { messageId } = req.params;
      const { emoji } = req.body;
      
      if (!mongoose.Types.ObjectId.isValid(messageId)) {
        throw createHttpError(400, 'Invalid message ID');
      }
      
      if (!emoji) {
        throw createHttpError(400, 'Emoji is required');
      }
      
      const message = await ChatService.addReaction(messageId, userId, emoji);
      
      res.status(200).json({
        success: true,
        message: 'Reaction added',
        data: { message },
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Remove reaction
  static async removeReaction(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user._id.toString();
      const { messageId } = req.params;
      
      if (!mongoose.Types.ObjectId.isValid(messageId)) {
        throw createHttpError(400, 'Invalid message ID');
      }
      
      const message = await ChatService.removeReaction(messageId, userId);
      
      res.status(200).json({
        success: true,
        message: 'Reaction removed',
        data: { message },
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Update typing status
  static async updateTyping(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user._id.toString();
      const { chatId } = req.params;
      const { isTyping } = req.body;
      
      if (!mongoose.Types.ObjectId.isValid(chatId)) {
        throw createHttpError(400, 'Invalid chat ID');
      }
      
      if (typeof isTyping !== 'boolean') {
        throw createHttpError(400, 'isTyping must be a boolean');
      }
      
      await ChatService.updateTypingStatus(chatId, userId, isTyping);
      
      res.status(200).json({
        success: true,
        message: isTyping ? 'Typing status updated' : 'Typing stopped',
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Get chat stats
  static async getChatStats(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user._id.toString();
      const { chatId } = req.params;
      
      if (!mongoose.Types.ObjectId.isValid(chatId)) {
        throw createHttpError(400, 'Invalid chat ID');
      }
      
      const stats = await ChatService.getChatStats(chatId, userId);
      
      res.status(200).json({
        success: true,
        data: { stats },
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Search messages
  static async searchMessages(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user._id.toString();
      const { chatId } = req.params;
      const { q: query } = req.query;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      
      if (!mongoose.Types.ObjectId.isValid(chatId)) {
        throw createHttpError(400, 'Invalid chat ID');
      }
      
      if (!query || typeof query !== 'string') {
        throw createHttpError(400, 'Search query is required');
      }
      
      const result = await ChatService.searchMessages(
        chatId,
        userId,
        query,
        page,
        limit
      );
      
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}