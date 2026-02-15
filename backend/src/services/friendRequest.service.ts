import mongoose from "mongoose";
import User from "../models/User.js";
import FriendRequest, { IFriendRequest } from "../models/FriendRequest.js";
import createHttpError from "http-errors";

export class FriendRequestService {
  // Send friend request
  static async sendFriendRequest(
    fromUserId: string,
    toUserId: string,
  ): Promise<IFriendRequest> {
    try {
      // Check if users exist
      const [fromUser, toUser] = await Promise.all([
        User.findById(fromUserId),
        User.findById(toUserId),
      ]);

      if (!fromUser || !toUser) {
        throw createHttpError(404, "User not found");
      }

      if (fromUser.contacts.some((id) => id.toString() === toUserId)) {
        throw createHttpError(400, "Already friends");
      }

      // Check if already friends
      if (fromUser.contacts.includes(new mongoose.Types.ObjectId(toUserId))) {
        throw createHttpError(400, "Already friends");
      }

      // Check if request already exists
      const existingRequest = await FriendRequest.findOne({
        $or: [
          { from: fromUserId, to: toUserId },
          { from: toUserId, to: fromUserId },
        ],
      });

      if (existingRequest) {
        if (existingRequest.status === "pending") {
          throw createHttpError(400, "Friend request already sent");
        }
        if (existingRequest.status === "accepted") {
          throw createHttpError(400, "Already friends");
        }
      }

      // Create friend request
      const friendRequest = new FriendRequest({
        from: fromUserId,
        to: toUserId,
        status: "pending",
      });

      await friendRequest.save();

      // Add to user's sent/received requests
      await Promise.all([
        User.findByIdAndUpdate(fromUserId, {
          $push: { sentFriendRequests: friendRequest._id },
        }),
        User.findByIdAndUpdate(toUserId, {
          $push: { receivedFriendRequests: friendRequest._id },
        }),
      ]);

      // Populate user data
      const populatedRequest = await FriendRequest.findById(friendRequest._id)
        .populate("from", "name picture email isOnline")
        .populate("to", "name picture email isOnline");

      return populatedRequest!;
    } catch (error) {
      throw error;
    }
  }

  // Accept friend request
  static async acceptFriendRequest(
    requestId: string,
    userId: string,
  ): Promise<IFriendRequest> {
    try {
      const friendRequest = await FriendRequest.findById(requestId)
        .populate("from", "name picture email")
        .populate("to", "name picture email");

      if (!friendRequest) {
        throw createHttpError(404, "Friend request not found");
      }

      // Check if user is the recipient
      if (friendRequest.to._id.toString() !== userId) {
        throw createHttpError(403, "Not authorized to accept this request");
      }

      if (friendRequest.status !== "pending") {
        throw createHttpError(
          400,
          `Friend request already ${friendRequest.status}`,
        );
      }

      // Update request status
      friendRequest.status = "accepted";
      await FriendRequest.findByIdAndDelete(requestId);

      // Add to contacts
      await Promise.all([
        User.findByIdAndUpdate(friendRequest.from._id, {
          $push: { contacts: friendRequest.to._id },
          $pull: { sentFriendRequests: friendRequest._id },
        }),
        User.findByIdAndUpdate(friendRequest.to._id, {
          $push: { contacts: friendRequest.from._id },
          $pull: { receivedFriendRequests: friendRequest._id },
        }),
      ]);

      return friendRequest;
    } catch (error) {
      throw error;
    }
  }

  // Reject friend request
  static async rejectFriendRequest(
    requestId: string,
    userId: string,
  ): Promise<IFriendRequest> {
    try {
      const friendRequest = await FriendRequest.findById(requestId);

      if (!friendRequest) {
        throw createHttpError(404, "Friend request not found");
      }

      // Check if user is the recipient
      if (friendRequest.to.toString() !== userId) {
        throw createHttpError(403, "Not authorized to reject this request");
      }

      if (friendRequest.status !== "pending") {
        throw createHttpError(
          400,
          `Friend request already ${friendRequest.status}`,
        );
      }

      // Update request status
      friendRequest.status = "rejected";
      await friendRequest.save();

      // Remove from user's requests
      await Promise.all([
        User.findByIdAndUpdate(friendRequest.from, {
          $pull: { sentFriendRequests: friendRequest._id },
        }),
        User.findByIdAndUpdate(friendRequest.to, {
          $pull: { receivedFriendRequests: friendRequest._id },
        }),
      ]);

      return friendRequest;
    } catch (error) {
      throw error;
    }
  }

  // Cancel friend request
  static async cancelFriendRequest(
    requestId: string,
    userId: string,
  ): Promise<IFriendRequest> {
    try {
      const friendRequest = await FriendRequest.findById(requestId);

      if (!friendRequest) {
        throw createHttpError(404, "Friend request not found");
      }

      // Check if user is the sender
      if (friendRequest.from.toString() !== userId) {
        throw createHttpError(403, "Not authorized to cancel this request");
      }

      if (friendRequest.status !== "pending") {
        throw createHttpError(
          400,
          `Cannot cancel ${friendRequest.status} request`,
        );
      }

      // Remove request
      await Promise.all([
        User.findByIdAndUpdate(friendRequest.from, {
          $pull: { sentFriendRequests: friendRequest._id },
        }),
        User.findByIdAndUpdate(friendRequest.to, {
          $pull: { receivedFriendRequests: friendRequest._id },
        }),
      ]);

      await friendRequest.deleteOne();

      return friendRequest;
    } catch (error) {
      throw error;
    }
  }

  // Get sent friend requests
  static async getSentRequests(
    userId: string,
    page = 1,
    limit = 50,
  ): Promise<{
    requests: IFriendRequest[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const skip = (page - 1) * limit;

      const [requests, total] = await Promise.all([
        FriendRequest.find({ from: userId, status: "pending" })
          .populate("to", "name picture email isOnline")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        FriendRequest.countDocuments({ from: userId, status: "pending" }),
      ]);

      return {
        requests,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      throw error;
    }
  }

  // Get received friend requests
  static async getReceivedRequests(
    userId: string,
    page = 1,
    limit = 50,
  ): Promise<{
    requests: IFriendRequest[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const skip = (page - 1) * limit;

      const [requests, total] = await Promise.all([
        FriendRequest.find({ to: userId, status: "pending" })
          .populate("from", "name picture email isOnline")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        FriendRequest.countDocuments({ to: userId, status: "pending" }),
      ]);

      return {
        requests,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      throw error;
    }
  }

  // Check friendship status
  static async getFriendshipStatus(
    userId1: string,
    userId2: string,
  ): Promise<{
    status:
      | "friends"
      | "pending_sent"
      | "pending_received"
      | "rejected"
      | "none";
    requestId?: string;
  }> {
    try {
      // Check if already friends
      const user1 = await User.findById(userId1);
      if (user1?.contacts.includes(new mongoose.Types.ObjectId(userId2))) {
        return { status: "friends" };
      }

      // Check for friend requests
      const request = await FriendRequest.findOne({
        $or: [
          { from: userId1, to: userId2 },
          { from: userId2, to: userId1 },
        ],
      });

      if (!request) {
        return { status: "none" };
      }

      if (request.status === "pending") {
        if (request.from.toString() === userId1) {
          return { status: "pending_sent", requestId: request._id.toString() };
        } else {
          return {
            status: "pending_received",
            requestId: request._id.toString(),
          };
        }
      }

      if (request.status === "accepted") {
        return { status: "friends" };
      }

      if (request.status === "rejected") {
        return { status: "none" };
      }

      return { status: "none" };
    } catch (error) {
      return { status: "none" };
    }
  }

  // Remove friend
  static async removeFriend(userId: string, friendId: string): Promise<void> {
    try {
      // Remove from contacts
      await Promise.all([
        User.findByIdAndUpdate(userId, {
          $pull: { contacts: friendId },
        }),
        User.findByIdAndUpdate(friendId, {
          $pull: { contacts: userId },
        }),
      ]);

      // Delete any existing friend request
      await FriendRequest.deleteOne({
        $or: [
          { from: userId, to: friendId },
          { from: friendId, to: userId },
        ],
      });
    } catch (error) {
      throw error;
    }
  }
}
