import mongoose from 'mongoose';
import { Chat, Message, IChat, IMessage } from '../models/Chat.js';
import User from '../models/User.js';
import createHttpError from 'http-errors';

export class ChatService {
  
  // Create or get one-on-one chat
  static async findOrCreateOneOnOne(userId1: string, userId2: string): Promise<IChat> {
  if (userId1 === userId2) {
    throw createHttpError(400, 'Cannot create chat with yourself');
  }

  // Ensure unique & valid
  const participants = [userId1, userId2];
  if (new Set(participants).size !== 2) {
    throw createHttpError(400, 'Invalid participants');
  }

  let chat = await Chat.findOne({
    isGroup: false,
    participants: { $all: participants, $size: 2 },
  }).populate('participants', '-password');

  if (!chat) {
    chat = new Chat({
      participants,
      isGroup: false,
    });
    await chat.save();

    chat = await Chat.findById(chat._id).populate('participants', '-password');
  }

  return chat!;
}

  
  // Create group chat
  static async createGroup(
    creatorId: string,
    groupName: string,
    participantIds: string[],
    groupPhoto?: string,
    description?: string
  ): Promise<IChat> {
    try {
      // Verify creator exists
      const creator = await User.findById(creatorId);
      if (!creator) {
        throw createHttpError(404, 'Creator not found');
      }
      
      // Verify all participants exist
      const participants = await User.find({
        _id: { $in: [...new Set([creatorId, ...participantIds])] },
      });
      
      if (participants.length < 2) {
        throw createHttpError(400, 'Group must have at least 2 participants');
      }
      
      // Create group chat
      const chat = new Chat({
        participants: participants.map(p => p._id),
        isGroup: true,
        groupName,
        groupPhoto: groupPhoto || process.env.DEFAULT_GROUP_PIC,
        groupDescription: description,
        groupAdmins: [creatorId],
      });
      
      await chat.save();
      
      // Populate data
      const populatedChat = await Chat.findById(chat._id)
        .populate('participants', '-password')
        .populate('groupAdmins', '-password');
      
      return populatedChat!;
    } catch (error) {
      throw error;
    }
  }
  
  // Get user's chats
  static async getUserChats(userId: string, page = 1, limit = 50): Promise<{
    chats: IChat[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const skip = (page - 1) * limit;
      
      // Find chats where user is a participant
      const query = Chat.find({
        participants: userId,
        archivedBy: { $ne: userId },
      })
        .populate('participants', '-password')
        .populate('lastMessage')
        .sort({ lastMessageAt: -1, pinned: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      
      const [chats, total] = await Promise.all([
        query.exec(),
        Chat.countDocuments({
          participants: userId,
          archivedBy: { $ne: userId },
        }),
      ]);
      
      // Calculate unread counts for each chat
      const chatsWithUnread = await Promise.all(
        chats.map(async (chat) => {
          const unreadCount = await Message.countDocuments({
            _id: { $in: chat.messages },
            readBy: { $ne: userId },
            sender: { $ne: userId },
          });
          
          return {
            ...chat,
            unreadCount,
          };
        })
      );
      
      return {
        chats: chatsWithUnread,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      throw error;
    }
  }
  
  // Get chat by ID
  static async getChatById(chatId: string, userId: string): Promise<IChat> {
    try {
      const chat = await Chat.findOne({
        _id: chatId,
        participants: userId,
      })
        .populate('participants', '-password')
        .populate('groupAdmins', '-password')
        .populate('lastMessage');
      
      if (!chat) {
        throw createHttpError(404, 'Chat not found or access denied');
      }
      
      return chat;
    } catch (error) {
      throw error;
    }
  }
  
  // Send message
  static async sendMessage(
    chatId: string,
    senderId: string,
    content: string,
    type: IMessage['type'] = 'text',
    options?: {
      fileUrl?: string;
      fileName?: string;
      fileSize?: number;
      mimeType?: string;
      thumbnail?: string;
      duration?: number;
      latitude?: number;
      longitude?: number;
      locationName?: string;
      replyTo?: string;
      forwarded?: boolean;
      forwardedFrom?: string;
    }
  ): Promise<IMessage> {
    try {
      // Verify chat exists and user is participant
      const chat = await Chat.findOne({
        _id: chatId,
        participants: senderId,
      });
      
      if (!chat) {
        throw createHttpError(404, 'Chat not found or access denied');
      }
      
      // Create message
      const messageData: any = {
        sender: senderId,
        content: type === 'text' ? content : '',
        type,
        readBy: [senderId], // Sender has read their own message
      };
      
      // Add optional fields
      if (options) {
        if (options.fileUrl) messageData.fileUrl = options.fileUrl;
        if (options.fileName) messageData.fileName = options.fileName;
        if (options.fileSize) messageData.fileSize = options.fileSize;
        if (options.mimeType) messageData.mimeType = options.mimeType;
        if (options.thumbnail) messageData.thumbnail = options.thumbnail;
        if (options.duration) messageData.duration = options.duration;
        if (options.latitude) messageData.latitude = options.latitude;
        if (options.longitude) messageData.longitude = options.longitude;
        if (options.locationName) messageData.locationName = options.locationName;
        if (options.replyTo) messageData.replyTo = options.replyTo;
        if (options.forwarded) messageData.forwarded = options.forwarded;
        if (options.forwardedFrom) messageData.forwardedFrom = options.forwardedFrom;
      }
      
      const message = new Message(messageData);
      
      // Add message to chat
      chat.messages.push(message);
      chat.lastMessage = message._id;
      chat.lastMessageAt = new Date();
      
      // Save both chat and message
      await Promise.all([
        chat.save(),
        message.save(),
      ]);
      
      // Populate message with sender info
      const populatedMessage = await Message.findById(message._id)
        .populate('sender', '-password')
        .populate('replyTo')
        .populate('forwardedFrom', '-password');
      
      return populatedMessage!;
    } catch (error) {
      throw error;
    }
  }
  
  // Get chat messages with pagination
  static async getChatMessages(
    chatId: string,
    userId: string,
    page = 1,
    limit = 50,
    before?: Date
  ): Promise<{
    messages: IMessage[];
    total: number;
    page: number;
    totalPages: number;
    hasMore: boolean;
  }> {
    try {
      // Verify chat exists and user is participant
      const chat = await Chat.findOne({
        _id: chatId,
        participants: userId,
      });
      
      if (!chat) {
        throw createHttpError(404, 'Chat not found or access denied');
      }
      
      const skip = (page - 1) * limit;
      
      // Build query
      const query: any = {
        _id: { $in: chat.messages },
        deleted: false,
      };
      
      if (before) {
        query.createdAt = { $lt: before };
      }
      
      const [messages, total] = await Promise.all([
        Message.find(query)
          .populate('sender', '-password')
          .populate('replyTo')
          .populate('forwardedFrom', '-password')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Message.countDocuments(query),
      ]);
      
      // Mark messages as read for this user
      const unreadMessageIds = messages
        .filter(msg => 
          !msg.readBy.includes(new mongoose.Types.ObjectId(userId)) &&
          msg.sender._id.toString() !== userId
        )
        .map(msg => msg._id);
      
      if (unreadMessageIds.length > 0) {
        await Message.updateMany(
          { _id: { $in: unreadMessageIds } },
          { $addToSet: { readBy: userId } }
        );
      }
      
      return {
        messages: messages.reverse(), // Return in chronological order
        total,
        page,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + messages.length < total,
      };
    } catch (error) {
      throw error;
    }
  }
  
  // Mark messages as read
  static async markAsRead(
    chatId: string,
    userId: string,
    messageIds?: string[]
  ): Promise<{ readCount: number }> {
    try {
      // Verify chat exists and user is participant
      const chat = await Chat.findOne({
        _id: chatId,
        participants: userId,
      });
      
      if (!chat) {
        throw createHttpError(404, 'Chat not found or access denied');
      }
      
      // Build query
      const query: any = {
        _id: { $in: chat.messages },
        readBy: { $ne: userId },
        sender: { $ne: userId },
      };
      
      if (messageIds && messageIds.length > 0) {
        query._id = { $in: messageIds };
      }
      
      // Update messages
      const result = await Message.updateMany(
        query,
        { $addToSet: { readBy: userId } }
      );
      
      return { readCount: result.modifiedCount };
    } catch (error) {
      throw error;
    }
  }
  
  // Delete message (soft delete)
  static async deleteMessage(
    messageId: string,
    userId: string
  ): Promise<IMessage> {
    try {
      const message = await Message.findById(messageId);
      
      if (!message) {
        throw createHttpError(404, 'Message not found');
      }
      
      // Check if user is sender
      if (message.sender.toString() !== userId) {
        throw createHttpError(403, 'You can only delete your own messages');
      }
      
      // Soft delete
      message.deleted = true;
      message.deletedAt = new Date();
      message.content = 'This message was deleted';
      message.fileUrl = undefined;
      message.fileName = undefined;
      
      await message.save();
      
      return message;
    } catch (error) {
      throw error;
    }
  }
  
  // Add reaction to message
  static async addReaction(
    messageId: string,
    userId: string,
    emoji: string
  ): Promise<IMessage> {
    try {
      const message = await Message.findById(messageId);
      
      if (!message) {
        throw createHttpError(404, 'Message not found');
      }
      
      // Remove existing reaction from this user
      message.reactions = message.reactions.filter(
        reaction => reaction.userId.toString() !== userId
      );
      
      // Add new reaction
      message.reactions.push({
        userId: new mongoose.Types.ObjectId(userId),
        emoji,
      });
      
      await message.save();
      
      // Populate reactions
      const populatedMessage = await Message.findById(messageId)
        .populate('reactions.userId', 'name picture');
      
      return populatedMessage!;
    } catch (error) {
      throw error;
    }
  }
  
  // Remove reaction
  static async removeReaction(
    messageId: string,
    userId: string
  ): Promise<IMessage> {
    try {
      const message = await Message.findById(messageId);
      
      if (!message) {
        throw createHttpError(404, 'Message not found');
      }
      
      // Remove user's reaction
      message.reactions = message.reactions.filter(
        reaction => reaction.userId.toString() !== userId
      );
      
      await message.save();
      
      return message;
    } catch (error) {
      throw error;
    }
  }
  
  // Update typing status
  static async updateTypingStatus(
    chatId: string,
    userId: string,
    isTyping: boolean
  ): Promise<void> {
    try {
      const chat = await Chat.findById(chatId);
      
      if (!chat) {
        throw createHttpError(404, 'Chat not found');
      }
      
      if (isTyping) {
        // Add typing user
        const existingTypingIndex = chat.typing.findIndex(
          t => t.userId.toString() === userId
        );
        
        if (existingTypingIndex === -1) {
          chat.typing.push({
            userId: new mongoose.Types.ObjectId(userId),
            startedAt: new Date(),
          });
        } else {
          chat.typing[existingTypingIndex].startedAt = new Date();
        }
      } else {
        // Remove typing user
        chat.typing = chat.typing.filter(
          t => t.userId.toString() !== userId
        );
      }
      
      await chat.save();
    } catch (error) {
      throw error;
    }
  }
  
  // Get typing users in chat
  static async getTypingUsers(chatId: string): Promise<any[]> {
    try {
      const chat = await Chat.findById(chatId)
        .populate('typing.userId', 'name picture');
      
      if (!chat) {
        return [];
      }
      
      // Filter out users who haven't typed in last 10 seconds
      const tenSecondsAgo = new Date(Date.now() - 10000);
      
      return chat.typing
        .filter(t => t.startedAt > tenSecondsAgo)
        .map(t => ({
          userId: t.userId,
          startedAt: t.startedAt,
        }));
    } catch (error) {
      return [];
    }
  }
  
  // Search messages in chat
  static async searchMessages(
    chatId: string,
    userId: string,
    query: string,
    page = 1,
    limit = 20
  ): Promise<{
    messages: IMessage[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      // Verify chat exists and user is participant
      const chat = await Chat.findOne({
        _id: chatId,
        participants: userId,
      });
      
      if (!chat) {
        throw createHttpError(404, 'Chat not found or access denied');
      }
      
      const skip = (page - 1) * limit;
      
      const [messages, total] = await Promise.all([
        Message.find({
          _id: { $in: chat.messages },
          content: { $regex: query, $options: 'i' },
          deleted: false,
        })
          .populate('sender', '-password')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Message.countDocuments({
          _id: { $in: chat.messages },
          content: { $regex: query, $options: 'i' },
          deleted: false,
        }),
      ]);
      
      return {
        messages,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      throw error;
    }
  }
  
  // Get chat statistics
  static async getChatStats(chatId: string, userId: string): Promise<any> {
    try {
      // Verify chat exists and user is participant
      const chat = await Chat.findOne({
        _id: chatId,
        participants: userId,
      });
      
      if (!chat) {
        throw createHttpError(404, 'Chat not found or access denied');
      }
      
      const stats = {
        totalMessages: chat.messages.length,
        totalParticipants: chat.participants.length,
        createdAt: chat.createdAt,
        lastMessageAt: chat.lastMessageAt,
        isGroup: chat.isGroup,
        groupName: chat.groupName,
        unreadCount: 0,
        mediaCount: 0,
      };
      
      // Calculate unread count
      stats.unreadCount = await Message.countDocuments({
        _id: { $in: chat.messages },
        readBy: { $ne: userId },
        sender: { $ne: userId },
      });
      
      // Calculate media count
      stats.mediaCount = await Message.countDocuments({
        _id: { $in: chat.messages },
        type: { $in: ['image', 'video', 'audio', 'file'] },
        deleted: false,
      });
      
      return stats;
    } catch (error) {
      throw error;
    }
  }
}