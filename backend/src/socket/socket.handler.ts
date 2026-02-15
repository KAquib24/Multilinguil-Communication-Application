import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { WebRTCService } from "../services/webrtc.service.js";
import { LiveTranslationService } from "../services/liveTranslation.service.js";
import { setupTranslationHandlers } from "./translation.handler.js";

interface UserSocket extends Socket {
  userId?: string;
  user?: any;
}

interface OnlineUser {
  userId: string;
  socketId: string;
  lastSeen: Date;
}

// Store online users in memory (in production, use Redis)
const onlineUsers = new Map<string, OnlineUser>();

export const initializeSocket = (io: Server) => {
  // Make io available globally for translation service
  (global as any).io = io;

  // Setup translation callbacks
  // setupTranslationCallbacks(io);

  // Middleware for authentication
  io.use(async (socket: UserSocket, next) => {
    try {
      const token =
        socket.handshake.auth.token ||
        socket.handshake.headers.authorization?.replace("Bearer ", "");

      if (!token) {
        return next(new Error("Authentication error"));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
        userId: string;
      };

      const user = await User.findById(decoded.userId)
        .select("-password -refreshToken")
        .lean();

      if (!user) {
        return next(new Error("User not found"));
      }

      socket.userId = user._id.toString();
      socket.user = user;
      socket.data.userId = user._id.toString(); // For translation handler

      // Store user as online
      onlineUsers.set(user._id.toString(), {
        userId: user._id.toString(),
        socketId: socket.id,
        lastSeen: new Date(),
      });

      next();
    } catch (error) {
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket: UserSocket) => {
    const userId = socket.userId;

    if (!userId) {
      socket.disconnect();
      return;
    }

    console.log(`🔌 User connected: ${userId} (${socket.id})`);

    // Join user to their personal room
    socket.join(`user:${userId}`);

    // Notify friends that user is online
    socket.broadcast.emit("user:online", { userId });

    // ====================
    // 📨 MESSAGES
    // ====================

    socket.on("message:send", async (data) => {
      try {
        const { chatId, content, type, replyTo, attachments } = data;

        // Emit to all participants in the chat
        io.to(`chat:${chatId}`).emit("message:new", {
          chatId,
          message: {
            _id: Date.now().toString(), // Temporary ID
            sender: socket.user,
            content,
            type,
            replyTo,
            attachments,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });

        // Notify typing stop
        socket.to(`chat:${chatId}`).emit("typing:stop", {
          chatId,
          userId,
        });
      } catch (error) {
        socket.emit("error", { message: "Failed to send message" });
      }
    });

    socket.on("message:typing", (data) => {
      const { chatId } = data;
      socket.to(`chat:${chatId}`).emit("typing:start", {
        chatId,
        userId,
        user: socket.user,
      });
    });

    socket.on("message:stop-typing", (data) => {
      const { chatId } = data;
      socket.to(`chat:${chatId}`).emit("typing:stop", {
        chatId,
        userId,
      });
    });

    socket.on("message:delivered", (data) => {
      const { messageId, chatId } = data;
      socket.to(`chat:${chatId}`).emit("message:delivery-update", {
        messageId,
        status: "delivered",
        updatedAt: new Date(),
      });
    });

    socket.on("message:read", (data) => {
      const { messageId, chatId } = data;
      socket.to(`chat:${chatId}`).emit("message:read-update", {
        messageId,
        status: "read",
        readBy: userId,
        readAt: new Date(),
      });
    });

    socket.on("message:delete", (data) => {
      const { messageId, chatId } = data;
      io.to(`chat:${chatId}`).emit("message:deleted", {
        messageId,
        deletedBy: userId,
        deletedAt: new Date(),
      });
    });

    socket.on("message:edit", (data) => {
      const { messageId, chatId, content } = data;
      io.to(`chat:${chatId}`).emit("message:edited", {
        messageId,
        content,
        editedAt: new Date(),
      });
    });

    socket.on("message:react", (data) => {
      const { messageId, chatId, reaction } = data;
      io.to(`chat:${chatId}`).emit("message:reacted", {
        messageId,
        reaction,
        userId,
        reactedAt: new Date(),
      });
    });

    // ====================
    // 📞 CALLS
    // ====================

    socket.on("call:initiate", async ({ callId }) => {
      socket.join(`call:${callId}`);
      console.log(`📞 Initiator joined call room call:${callId}`);
    });

    socket.on("call:join", (data) => {
      const { callId } = data;
      socket.join(`call:${callId}`);

      io.to(`call:${callId}`).emit("call:participant-joined", {
        callId,
        participant: socket.user,
        timestamp: new Date(),
      });
    });

    socket.on("call:leave", (data) => {
      const { callId } = data;
      socket.leave(`call:${callId}`);

      io.to(`call:${callId}`).emit("call:participant-left", {
        callId,
        participantId: userId,
        timestamp: new Date(),
      });
    });

    socket.on("call:join-room", ({ callId }) => {
      socket.join(`call:${callId}`);
      console.log(`✅ ${userId} joined call room call:${callId}`);
    });

    socket.on("call:end", async ({ callId }) => {
      const room = `call:${callId}`;

      const call = await WebRTCService.endCall(callId, userId);

      // Stop all translation sessions for this call
      LiveTranslationService.stopAllSessions(callId);

      io.to(room).emit("call:ended", { call });
      console.log("📴 call:ended emitted to", room);
    });

    // WebRTC signaling
    socket.on("webrtc:offer", ({ targetUserId, offer }) => {
      io.to(`user:${targetUserId}`).emit("webrtc:offer", {
        fromUserId: userId,
        offer,
      });
    });

    socket.on("webrtc:answer", ({ targetUserId, answer }) => {
      io.to(`user:${targetUserId}`).emit("webrtc:answer", {
        fromUserId: userId,
        answer,
      });
    });

    socket.on("webrtc:ice-candidate", ({ targetUserId, candidate }) => {
      io.to(`user:${targetUserId}`).emit("webrtc:ice-candidate", {
        fromUserId: userId,
        candidate,
      });
    });

    // ====================
    // 🔤 TRANSLATION HANDLERS
    // ====================
    setupTranslationHandlers(io, socket);
     

    // ====================
    // 👤 PRESENCE
    // ====================

    socket.on("presence:update", (data) => {
      const { status, lastSeen } = data;

      // Update online users map
      if (onlineUsers.has(userId)) {
        onlineUsers.set(userId, {
          ...onlineUsers.get(userId)!,
          lastSeen: new Date(),
        });
      }

      // Notify contacts
      socket.broadcast.emit("presence:changed", {
        userId,
        status,
        lastSeen,
      });
    });

    // ====================
    // 💬 CHAT MANAGEMENT
    // ====================

    socket.on("chat:join", (data) => {
      const { chatId } = data;
      socket.join(`chat:${chatId}`);
    });

    socket.on("chat:leave", (data) => {
      const { chatId } = data;
      socket.leave(`chat:${chatId}`);
    });

    socket.on("chat:created", (data) => {
      const { chat, participants } = data;

      participants.forEach((participantId: string) => {
        if (participantId !== userId) {
          io.to(`user:${participantId}`).emit("chat:new", {
            chat,
            createdBy: socket.user,
          });
        }
      });
    });

    socket.on("chat:updated", (data) => {
      const { chatId, updates } = data;
      io.to(`chat:${chatId}`).emit("chat:modified", {
        chatId,
        updates,
        updatedBy: userId,
      });
    });

    // ====================
    // 📸 STORIES & STATUS
    // ====================

    socket.on("story:created", (data) => {
      const { story } = data;

      // Notify followers
      socket.broadcast.emit("story:new", {
        story,
        userId,
      });
    });

    socket.on("status:updated", (data) => {
      const { status } = data;
      socket.broadcast.emit("status:changed", {
        userId,
        status,
        updatedAt: new Date(),
      });
    });

    // ====================
    // 🔔 NOTIFICATIONS
    // ====================

    socket.on("notification:send", (data) => {
      const { userId: targetUserId, notification } = data;
      io.to(`user:${targetUserId}`).emit("notification:new", notification);
    });

    // ====================
    // 📍 LOCATION SHARING
    // ====================

    socket.on("location:share", (data) => {
      const { chatId, location } = data;
      io.to(`chat:${chatId}`).emit("location:shared", {
        userId,
        location,
        timestamp: new Date(),
      });
    });

    // ====================
    // ❤️ REACTIONS
    // ====================

    socket.on("reaction:send", (data) => {
      const { targetId, targetType, reaction } = data;

      let room = "";
      if (targetType === "message") {
        room = `message:${targetId}`;
      } else if (targetType === "story") {
        room = `story:${targetId}`;
      }

      if (room) {
        socket.to(room).emit("reaction:received", {
          targetId,
          targetType,
          reaction,
          userId,
          timestamp: new Date(),
        });
      }
    });

    // ====================
    // 🎯 DISCONNECTION
    // ====================

    socket.on("disconnect", () => {
      console.log(`🔌 User disconnected: ${userId} (${socket.id})`);

      // Clean up any active translation sessions for this user
      // Note: This would require iterating through all calls
      // For now, we rely on the cleanup interval in the service

      // Remove from online users
      onlineUsers.delete(userId);

      // Notify friends that user is offline
      socket.broadcast.emit("user:offline", { userId });
    });

    // ====================
    // 🛠️ UTILITY EVENTS
    // ====================

    socket.on("ping", (callback) => {
      if (typeof callback === "function") {
        callback({ pong: Date.now() });
      }
    });

    // Error handling
    socket.on("error", (error) => {
      console.error(`🔌 Socket error for ${userId}:`, error);
      socket.emit("error", { message: "Socket error occurred" });
    });
  });

  // Broadcast online users count periodically
  setInterval(() => {
    io.emit("online:users", {
      count: onlineUsers.size,
      users: Array.from(onlineUsers.values()),
    });
  }, 30000); // Every 30 seconds

  // Log translation service status
  console.log(
    "🔤 Translation service ready - Google Cloud clients initialized",
  );
};

// Helper functions
export const getUserSocket = (userId: string): string | undefined => {
  const user = onlineUsers.get(userId);
  return user?.socketId;
};

export const isUserOnline = (userId: string): boolean => {
  return onlineUsers.has(userId);
};

export const getOnlineUsers = (): OnlineUser[] => {
  return Array.from(onlineUsers.values());
};

export default initializeSocket;
