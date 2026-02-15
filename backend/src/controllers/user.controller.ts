import { Request, Response, NextFunction } from "express";
import User from "../models/User.js";
import createHttpError from "http-errors";
import mongoose from "mongoose";

export class UserController {
  // Search users by name or email
  static async searchUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user._id.toString();
      const { query, page = 1, limit = 20 } = req.query;

      if (!query || typeof query !== "string") {
        throw createHttpError(400, "Search query is required");
      }

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      // Search users excluding current user
      const searchQuery = {
        _id: { $ne: userId },
        $or: [
          { name: { $regex: query, $options: "i" } },
          { email: { $regex: query, $options: "i" } },
        ],
      };

      const [users, total] = await Promise.all([
        User.find(searchQuery)
          .select("-password")
          .skip(skip)
          .limit(limitNum)
          .lean(),
        User.countDocuments(searchQuery),
      ]);

      res.status(200).json({
        success: true,
        data: {
          users,
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get user by ID
  static async getUserById(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw createHttpError(400, "Invalid user ID");
      }

      const user = await User.findById(userId).select("-password");

      if (!user) {
        throw createHttpError(404, "User not found");
      }

      res.status(200).json({
        success: true,
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get all users (excluding current user and contacts)
  // Get all users (excluding current user and contacts)
  static async getAllUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user._id.toString();
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const skip = (page - 1) * limit;

      // Get current user to exclude contacts
      const currentUser = await User.findById(userId);

      // Build query to exclude current user and existing contacts
      const query: any = {
        _id: { $ne: userId },
      };

      if (currentUser?.contacts && currentUser.contacts.length > 0) {
        query._id.$nin = currentUser.contacts;
      }

      const [users, total] = await Promise.all([
        User.find(query)
          .select(
            "-password -sentFriendRequests -receivedFriendRequests -blockedUsers",
          )
          .skip(skip)
          .limit(limit)
          .lean(),
        User.countDocuments(query),
      ]);

      res.status(200).json({
        success: true,
        data: {
          users,
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Add user to contacts
  static async addContact(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user._id.toString();
      const { targetUserId } = req.body;

      if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
        throw createHttpError(400, "Invalid user ID");
      }

      if (userId === targetUserId) {
        throw createHttpError(400, "Cannot add yourself as a contact");
      }

      const [user, targetUser] = await Promise.all([
        User.findById(userId),
        User.findById(targetUserId),
      ]);

      if (!user || !targetUser) {
        throw createHttpError(404, "User not found");
      }

      // Check if already in contacts
      if (user.contacts.includes(new mongoose.Types.ObjectId(targetUserId))) {
        throw createHttpError(409, "User already in contacts");
      }

      // Add to contacts
      user.contacts.push(new mongoose.Types.ObjectId(targetUserId));
      await user.save();

      res.status(200).json({
        success: true,
        message: "Contact added successfully",
        data: { user: targetUser },
      });
    } catch (error) {
      next(error);
    }
  }

  // Remove user from contacts
  static async removeContact(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user._id.toString();
      const { targetUserId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
        throw createHttpError(400, "Invalid user ID");
      }

      const user = await User.findById(userId);

      if (!user) {
        throw createHttpError(404, "User not found");
      }

      // Remove from contacts
      user.contacts = user.contacts.filter(
        (contactId) => contactId.toString() !== targetUserId,
      );

      await user.save();

      res.status(200).json({
        success: true,
        message: "Contact removed successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  // Get user's contacts
  static async getContacts(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user._id.toString();

      const user = await User.findById(userId).select("contacts").populate({
        path: "contacts",
        select: "-password",
      });

      if (!user) {
        throw createHttpError(404, "User not found");
      }

      res.status(200).json({
        success: true,
        data: {
          contacts: user.contacts || [],
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
