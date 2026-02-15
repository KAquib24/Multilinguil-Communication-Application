import { Socket } from 'socket.io-client';
import { store } from '../app/store';
import {
  addMessage,
  updateMessage,
  deleteMessage,
  addTypingUser,
  removeTypingUser,
  updateChat,
  addChat,
} from '../features/chat/chatSlice';
import { Message } from '../features/chat/chatApi';
import toast from 'react-hot-toast';

// Extended interface to ensure conversation property exists
interface ExtendedMessage extends Message {
  conversation: string;
}

export class ChatSocketService {
  private socket: Socket | null = null;
  
  constructor(socket: Socket) {
    this.socket = socket;
    this.setupListeners();
  }
  
  private setupListeners() {
    if (!this.socket) return;
    
    // Message events
    this.socket.on('message:sent', this.handleMessageSent.bind(this));
    this.socket.on('message:received', this.handleMessageReceived.bind(this));
    this.socket.on('message:updated', this.handleMessageUpdated.bind(this));
    this.socket.on('message:deleted', this.handleMessageDeleted.bind(this));
    this.socket.on('message:read', this.handleMessageRead.bind(this));
    
    // Typing events
    this.socket.on('typing:started', this.handleTypingStarted.bind(this));
    this.socket.on('typing:stopped', this.handleTypingStopped.bind(this));
    
    // Chat events
    this.socket.on('chat:created', this.handleChatCreated.bind(this));
    this.socket.on('chat:updated', this.handleChatUpdated.bind(this));
    this.socket.on('chat:user:joined', this.handleUserJoined.bind(this));
    this.socket.on('chat:user:left', this.handleUserLeft.bind(this));
    
    // Reaction events
    this.socket.on('reaction:added', this.handleReactionAdded.bind(this));
    this.socket.on('reaction:removed', this.handleReactionRemoved.bind(this));
    
    // User events
    this.socket.on('user:online', this.handleUserOnline.bind(this));
    this.socket.on('user:offline', this.handleUserOffline.bind(this));
  }
  
  // Emitters
  joinChat(chatId: string) {
    this.socket?.emit('chat:join', { chatId });
  }
  
  leaveChat(chatId: string) {
    this.socket?.emit('chat:leave', { chatId });
  }
  
  sendMessage(chatId: string, message: Partial<Message>) {
    this.socket?.emit('message:send', { chatId, message });
  }
  
  startTyping(chatId: string) {
    this.socket?.emit('typing:start', { chatId });
  }
  
  stopTyping(chatId: string) {
    this.socket?.emit('typing:stop', { chatId });
  }
  
  markAsRead(chatId: string, messageIds: string[]) {
    this.socket?.emit('message:read', { chatId, messageIds });
  }
  
  addReaction(messageId: string, emoji: string) {
    this.socket?.emit('reaction:add', { messageId, emoji });
  }
  
  removeReaction(messageId: string) {
    this.socket?.emit('reaction:remove', { messageId });
  }
  
  // Event handlers - FIXED WITH TYPE SAFETY
  private handleMessageSent(data: { message: ExtendedMessage }) {
    const { message } = data;
    store.dispatch(addMessage(message));
    
    // Update chat's last message - NOW TYPE SAFE
    if (message.conversation) {
      store.dispatch(updateChat({
        chatId: message.conversation,
        updates: { lastMessage: message },
      }));
    }
  }
  
  private handleMessageReceived(data: { message: ExtendedMessage }) {
    const { message } = data;
    store.dispatch(addMessage(message));
    
    // Show notification if not in active chat
    const state = store.getState();
    const activeChat = state.chat.activeChat;
    
    if (!activeChat || activeChat._id !== message.conversation) {
      toast(`New message from ${message.sender.name}`, {
        icon: '💬',
      });
    }
  }
  
  private handleMessageUpdated(data: { message: ExtendedMessage }) {
    store.dispatch(updateMessage({
      messageId: data.message._id,
      updates: data.message,
    }));
  }
  
  private handleMessageDeleted(data: { messageId: string }) {
    store.dispatch(deleteMessage(data.messageId));
  }
  
  private handleMessageRead(data: { chatId: string; userId: string; messageIds: string[] }) {
    const state = store.getState();
    const { messages } = state.chat;
    
    // Update read status for messages
    data.messageIds.forEach(messageId => {
      const message = messages.find(msg => msg._id === messageId) as ExtendedMessage;
      if (message && !message.readBy.includes(data.userId)) {
        store.dispatch(updateMessage({
          messageId,
          updates: {
            readBy: [...message.readBy, data.userId],
          },
        }));
      }
    });
  }
  
  private handleTypingStarted(data: { chatId: string; userId: string }) {
    store.dispatch(addTypingUser(data.userId));
  }
  
  private handleTypingStopped(data: { chatId: string; userId: string }) {
    store.dispatch(removeTypingUser(data.userId));
  }
  
  private handleChatCreated(data: { chat: any }) {
    store.dispatch(addChat(data.chat));
  }
  
  private handleChatUpdated(data: { chatId: string; updates: any }) {
    store.dispatch(updateChat({
      chatId: data.chatId,
      updates: data.updates,
    }));
  }
  
  private handleUserJoined(data: { chatId: string; userId: string; user: any }) {
    // Update chat participants
    const state = store.getState();
    const chat = state.chat.chats.find(c => c._id === data.chatId);
    
    if (chat) {
      store.dispatch(updateChat({
        chatId: data.chatId,
        updates: {
          participants: [...chat.participants, data.user],
        },
      }));
    }
  }
  
  private handleUserLeft(data: { chatId: string; userId: string }) {
    // Update chat participants
    const state = store.getState();
    const chat = state.chat.chats.find(c => c._id === data.chatId);
    
    if (chat) {
      store.dispatch(updateChat({
        chatId: data.chatId,
        updates: {
          participants: chat.participants.filter(p => p._id !== data.userId),
        },
      }));
    }
  }
  
  private handleReactionAdded(data: { messageId: string; userId: string; emoji: string }) {
    const state = store.getState();
    const message = state.chat.messages.find(msg => msg._id === data.messageId) as ExtendedMessage;
    
    if (message) {
      const reactions = message.reactions.filter(r => r.userId !== data.userId);
      reactions.push({ userId: data.userId, emoji: data.emoji });
      
      store.dispatch(updateMessage({
        messageId: data.messageId,
        updates: { reactions },
      }));
    }
  }
  
  private handleReactionRemoved(data: { messageId: string; userId: string }) {
    const state = store.getState();
    const message = state.chat.messages.find(msg => msg._id === data.messageId) as ExtendedMessage;
    
    if (message) {
      const reactions = message.reactions.filter(r => r.userId !== data.userId);
      
      store.dispatch(updateMessage({
        messageId: data.messageId,
        updates: { reactions },
      }));
    }
  }
  
  private handleUserOnline(data: { userId: string }) {
    const state = store.getState();
    const { chats } = state.chat;
    
    // Update user online status in all chats
    chats.forEach(chat => {
      const participant = chat.participants.find(p => p._id === data.userId);
      if (participant) {
        store.dispatch(updateChat({
          chatId: chat._id,
          updates: {
            participants: chat.participants.map(p =>
              p._id === data.userId ? { ...p, isOnline: true } : p
            ),
          },
        }));
      }
    });
  }
  
  private handleUserOffline(data: { userId: string; lastSeen: string }) {
    const state = store.getState();
    const { chats } = state.chat;
    
    // Update user offline status in all chats
    chats.forEach(chat => {
      const participant = chat.participants.find(p => p._id === data.userId);
      if (participant) {
        store.dispatch(updateChat({
          chatId: chat._id,
          updates: {
            participants: chat.participants.map(p =>
              p._id === data.userId
                ? { ...p, isOnline: false, lastSeen: data.lastSeen }
                : p
            ),
          },
        }));
      }
    });
  }
  
  // Cleanup
  disconnect() {
    if (this.socket) {
      this.socket.off('message:sent');
      this.socket.off('message:received');
      this.socket.off('message:updated');
      this.socket.off('message:deleted');
      this.socket.off('message:read');
      this.socket.off('typing:started');
      this.socket.off('typing:stopped');
      this.socket.off('chat:created');
      this.socket.off('chat:updated');
      this.socket.off('chat:user:joined');
      this.socket.off('chat:user:left');
      this.socket.off('reaction:added');
      this.socket.off('reaction:removed');
      this.socket.off('user:online');
      this.socket.off('user:offline');
    }
  }
}