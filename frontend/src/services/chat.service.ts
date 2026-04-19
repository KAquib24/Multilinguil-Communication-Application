// services/chat.service.ts
import { Socket } from "socket.io-client";
import { store } from "../app/store";
import {
  addMessage,
  updateMessage,
  deleteMessage,
  addTypingUser,
  removeTypingUser,
  updateChat,
  addChat,
} from "../features/chat/chatSlice";
import { Message } from "../features/chat/chatApi";
import toast from "react-hot-toast";

// Extended interface to ensure conversation property exists
interface ExtendedMessage extends Message {
  conversation: string;
  tempId?: string;
}

export class ChatSocketService {
  private socket: Socket | null = null;

  constructor(socket: Socket) {
    console.log("🔌 ChatSocketService initializing with socket:", !!socket);
    this.socket = socket;
    this.setupListeners();
  }

  private setupListeners() {
    if (!this.socket) {
      console.error("❌ No socket available for setupListeners");
      return;
    }

    console.log("🎧 Setting up socket event listeners");

    // Message events
    this.socket.on("message:sent", this.handleMessageSent.bind(this));
    this.socket.on("message:received", this.handleMessageReceived.bind(this));
    // Also listen for message:new as fallback
    this.socket.on("message:new", this.handleMessageReceived.bind(this));
    this.socket.on("message:updated", this.handleMessageUpdated.bind(this));
    this.socket.on("message:deleted", this.handleMessageDeleted.bind(this));
    this.socket.on("message:read", this.handleMessageRead.bind(this));

    // Typing events
    this.socket.on("typing:started", this.handleTypingStarted.bind(this));
    this.socket.on("typing:stopped", this.handleTypingStopped.bind(this));

    // Chat events
    this.socket.on("chat:created", this.handleChatCreated.bind(this));
    this.socket.on("chat:updated", this.handleChatUpdated.bind(this));
    this.socket.on("chat:user:joined", this.handleUserJoined.bind(this));
    this.socket.on("chat:user:left", this.handleUserLeft.bind(this));

    // Reaction events
    this.socket.on("reaction:added", this.handleReactionAdded.bind(this));
    this.socket.on("reaction:removed", this.handleReactionRemoved.bind(this));

    // User events
    this.socket.on("user:online", this.handleUserOnline.bind(this));
    this.socket.on("user:offline", this.handleUserOffline.bind(this));

    // Connection events for debugging
    this.socket.on("connect", () => {
      console.log("✅ Socket connected in ChatSocketService");
    });

    this.socket.on("disconnect", () => {
      console.log("❌ Socket disconnected in ChatSocketService");
    });

    this.socket.on("connect_error", (error) => {
      console.error("❌ Socket connection error:", error);
    });
  }

  // Emitters with logging
  joinChat(chatId: string) {
    console.log(`📡 Emitting chat:join for ${chatId}`);
    this.socket?.emit("chat:join", { chatId });
  }

  leaveChat(chatId: string) {
    console.log(`📡 Emitting chat:leave for ${chatId}`);
    this.socket?.emit("chat:leave", { chatId });
  }

  sendMessage(chatId: string, message: Partial<Message>) {
    console.log(`📡 Emitting message:send for chat ${chatId}`, message);
    this.socket?.emit("message:send", { chatId, message });
  }

  startTyping(chatId: string) {
    console.log(`📡 Emitting typing:start for chat ${chatId}`);
    this.socket?.emit("typing:start", { chatId });
  }

  stopTyping(chatId: string) {
    console.log(`📡 Emitting typing:stop for chat ${chatId}`);
    this.socket?.emit("typing:stop", { chatId });
  }

  markAsRead(chatId: string, messageIds: string[]) {
    console.log(`📡 Emitting message:read for chat ${chatId}`, messageIds);
    this.socket?.emit("message:read", { chatId, messageIds });
  }

  addReaction(messageId: string, emoji: string) {
    console.log(`📡 Emitting reaction:add for message ${messageId}`, emoji);
    this.socket?.emit("reaction:add", { messageId, emoji });
  }

  removeReaction(messageId: string) {
    console.log(`📡 Emitting reaction:remove for message ${messageId}`);
    this.socket?.emit("reaction:remove", { messageId });
  }

  // Event handlers with extensive logging
  private handleMessageSent(data: { message: ExtendedMessage }) {
  console.log('📨 Received message:sent event:', data);
  const { message } = data;
  
  // Ensure message has conversation field
  if (!message.conversation) {
    const state = store.getState();
    const activeChat = state.chat.activeChat;
    if (activeChat) {
      message.conversation = activeChat._id;
    }
  }
  
  // Check if this is a temp message and remove it
  if (message.tempId) {
    console.log(`🔄 Removing temp message ${message.tempId}`);
    store.dispatch(deleteMessage(message.tempId));
  }
  
  // Check for duplicate messages
  const state = store.getState();
  const exists = state.chat.messages.some((msg: Message) => msg._id === message._id);
  
  if (exists) {
    console.log(`⚠️ Message ${message._id} already exists, skipping`);
    return;
  }
  
  store.dispatch(addMessage(message));
  console.log(`✅ Added message ${message._id} to store`);

  // Update chat's last message
  if (message.conversation) {
    console.log(`📝 Updating chat ${message.conversation} last message`);
    store.dispatch(
      updateChat({
        chatId: message.conversation,
        updates: { lastMessage: message, lastMessageAt: message.createdAt },
      }),
    );
  }
}

  private handleMessageReceived(data: { message: ExtendedMessage }) {
  console.log('📨 Received message:received event:', data);
  const { message } = data;
  
  // Ensure message has conversation field
  if (!message.conversation) {
    console.warn('⚠️ Message missing conversation field:', message);
    // Try to get chatId from the data if available
    const state = store.getState();
    const activeChat = state.chat.activeChat;
    if (activeChat) {
      message.conversation = activeChat._id;
    }
  }
  
  // Check for duplicate messages
  const state = store.getState();
  const exists = state.chat.messages.some((msg: Message) => msg._id === message._id);
  
  if (exists) {
    console.log(`⚠️ Message ${message._id} already exists, skipping`);
    return;
  }
  
  store.dispatch(addMessage(message));
  console.log(`✅ Added received message ${message._id} to store`);

  // Show notification if not in active chat
  const activeChat = state.chat.activeChat;

  if (!activeChat || activeChat._id !== message.conversation) {
    console.log(`🔔 Showing notification for message from ${message.sender?.name || 'Unknown'}`);
    toast(`New message from ${message.sender?.name || 'Someone'}`, {
      icon: "💬",
      duration: 4000,
    });
  } else {
    console.log(`📱 In active chat, no notification needed`);
  }
  
  // Update chat's last message
  if (message.conversation) {
    console.log(`📝 Updating chat ${message.conversation} last message`);
    store.dispatch(
      updateChat({
        chatId: message.conversation,
        updates: { lastMessage: message, lastMessageAt: message.createdAt },
      }),
    );
  }
}

  private handleMessageUpdated(data: { message: ExtendedMessage }) {
    console.log("📨 Received message:updated event:", data);
    store.dispatch(
      updateMessage({
        messageId: data.message._id,
        updates: data.message,
      }),
    );
  }

  private handleMessageDeleted(data: { messageId: string }) {
    console.log("📨 Received message:deleted event:", data);
    store.dispatch(deleteMessage(data.messageId));
  }

  private handleMessageRead(data: {
    chatId: string;
    userId: string;
    messageIds: string[];
  }) {
    console.log("📨 Received message:read event:", data);
    const state = store.getState();
    const { messages } = state.chat;

    // Update read status for messages
    data.messageIds.forEach((messageId) => {
      const message = messages.find(
        (msg: Message) => msg._id === messageId,
      ) as ExtendedMessage;
      if (message && !message.readBy.includes(data.userId)) {
        console.log(
          `📖 Marking message ${messageId} as read by ${data.userId}`,
        );
        store.dispatch(
          updateMessage({
            messageId,
            updates: {
              readBy: [...message.readBy, data.userId],
            },
          }),
        );
      }
    });
  }

  private handleTypingStarted(data: { chatId: string; userId: string }) {
    console.log("📨 Received typing:started event:", data);
    store.dispatch(addTypingUser(data.userId));
  }

  private handleTypingStopped(data: { chatId: string; userId: string }) {
    console.log("📨 Received typing:stopped event:", data);
    store.dispatch(removeTypingUser(data.userId));
  }

  private handleChatCreated(data: { chat: any }) {
    console.log("📨 Received chat:created event:", data);
    store.dispatch(addChat(data.chat));
  }

  private handleChatUpdated(data: { chatId: string; updates: any }) {
    console.log("📨 Received chat:updated event:", data);
    store.dispatch(
      updateChat({
        chatId: data.chatId,
        updates: data.updates,
      }),
    );
  }

  private handleUserJoined(data: {
    chatId: string;
    userId: string;
    user: any;
  }) {
    console.log("📨 Received chat:user:joined event:", data);
    const state = store.getState();
    const chat = state.chat.chats.find((c: any) => c._id === data.chatId);

    if (chat) {
      store.dispatch(
        updateChat({
          chatId: data.chatId,
          updates: {
            participants: [...chat.participants, data.user],
          },
        }),
      );
    }
  }

  private handleUserLeft(data: { chatId: string; userId: string }) {
    console.log("📨 Received chat:user:left event:", data);
    const state = store.getState();
    const chat = state.chat.chats.find((c: any) => c._id === data.chatId);

    if (chat) {
      store.dispatch(
        updateChat({
          chatId: data.chatId,
          updates: {
            participants: chat.participants.filter(
              (p: any) => p._id !== data.userId,
            ),
          },
        }),
      );
    }
  }

  private handleReactionAdded(data: {
    messageId: string;
    userId: string;
    emoji: string;
  }) {
    console.log("📨 Received reaction:added event:", data);
    const state = store.getState();
    const message = state.chat.messages.find(
      (msg: Message) => msg._id === data.messageId,
    ) as ExtendedMessage;

    if (message) {
      const reactions = message.reactions.filter(
        (r) => r.userId !== data.userId,
      );
      reactions.push({ userId: data.userId, emoji: data.emoji });

      store.dispatch(
        updateMessage({
          messageId: data.messageId,
          updates: { reactions },
        }),
      );
    }
  }

  private handleReactionRemoved(data: { messageId: string; userId: string }) {
    console.log("📨 Received reaction:removed event:", data);
    const state = store.getState();
    const message = state.chat.messages.find(
      (msg: Message) => msg._id === data.messageId,
    ) as ExtendedMessage;

    if (message) {
      const reactions = message.reactions.filter(
        (r) => r.userId !== data.userId,
      );

      store.dispatch(
        updateMessage({
          messageId: data.messageId,
          updates: { reactions },
        }),
      );
    }
  }

  private handleUserOnline(data: { userId: string }) {
    console.log("📨 Received user:online event:", data);
    const state = store.getState();
    const { chats } = state.chat;

    // Update user online status in all chats
    chats.forEach((chat: any) => {
      const participant = chat.participants.find(
        (p: any) => p._id === data.userId,
      );
      if (participant) {
        store.dispatch(
          updateChat({
            chatId: chat._id,
            updates: {
              participants: chat.participants.map((p: any) =>
                p._id === data.userId ? { ...p, isOnline: true } : p,
              ),
            },
          }),
        );
      }
    });
  }

  private handleUserOffline(data: { userId: string; lastSeen: string }) {
    console.log("📨 Received user:offline event:", data);
    const state = store.getState();
    const { chats } = state.chat;

    // Update user offline status in all chats
    chats.forEach((chat: any) => {
      const participant = chat.participants.find(
        (p: any) => p._id === data.userId,
      );
      if (participant) {
        store.dispatch(
          updateChat({
            chatId: chat._id,
            updates: {
              participants: chat.participants.map((p: any) =>
                p._id === data.userId
                  ? { ...p, isOnline: false, lastSeen: data.lastSeen }
                  : p,
              ),
            },
          }),
        );
      }
    });
  }

  // Cleanup
  disconnect() {
    console.log("🔌 Disconnecting ChatSocketService");
    if (this.socket) {
      this.socket.off("message:sent");
      this.socket.off("message:received");
      this.socket.off("message:updated");
      this.socket.off("message:deleted");
      this.socket.off("message:read");
      this.socket.off("typing:started");
      this.socket.off("typing:stopped");
      this.socket.off("chat:created");
      this.socket.off("chat:updated");
      this.socket.off("chat:user:joined");
      this.socket.off("chat:user:left");
      this.socket.off("reaction:added");
      this.socket.off("reaction:removed");
      this.socket.off("user:online");
      this.socket.off("user:offline");
      this.socket.off("connect");
      this.socket.off("disconnect");
      this.socket.off("connect_error");
    }
  }
}
