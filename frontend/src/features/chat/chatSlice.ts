// features/chat/chatSlice.ts
import { createSlice, PayloadAction, createSelector } from "@reduxjs/toolkit";
import { Chat, Message } from "./chatApi";

interface ChatState {
  chats: Chat[];
  activeChat: Chat | null;
  messages: Message[];
  typingUsers: string[];
  selectedMessages: string[];
  searchQuery: string;
  isLoading: boolean;
  error: string | null;
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

const initialState: ChatState = {
  chats: [],
  activeChat: null,
  messages: [],
  typingUsers: [],
  selectedMessages: [],
  searchQuery: "",
  isLoading: false,
  error: null,
  pagination: {
    page: 1,
    limit: 50,
    total: 0,
    hasMore: true,
  },
};

const chatSlice = createSlice({
  name: "chat",
  initialState,
  reducers: {
    // Chat actions
    setChats: (state, action: PayloadAction<Chat[]>) => {
      state.chats = action.payload;
    },

    addChat: (state, action: PayloadAction<Chat>) => {
      state.chats = state.chats.filter(
        (chat) => chat._id !== action.payload._id,
      );
      state.chats.unshift(action.payload);
    },

    updateChat: (
      state,
      action: PayloadAction<{ chatId: string; updates: Partial<Chat> }>,
    ) => {
      const index = state.chats.findIndex(
        (chat) => chat._id === action.payload.chatId,
      );
      if (index !== -1) {
        state.chats[index] = {
          ...state.chats[index],
          ...action.payload.updates,
        };

        if (state.activeChat?._id === action.payload.chatId) {
          state.activeChat = { ...state.activeChat, ...action.payload.updates };
        }
      }
    },

    removeChat: (state, action: PayloadAction<string>) => {
      state.chats = state.chats.filter((chat) => chat._id !== action.payload);
      if (state.activeChat?._id === action.payload) {
        state.activeChat = null;
      }
    },

    setActiveChat: (state, action: PayloadAction<Chat | null>) => {
      state.activeChat = action.payload;
      state.selectedMessages = [];
    },

    // Message actions
    setMessages: (state, action: PayloadAction<Message[]>) => {
      console.log('📝 setMessages called with:', action.payload.length, 'messages');
      state.messages = action.payload;
    },

    addMessage: (state, action: PayloadAction<Message>) => {
      console.log('📝 addMessage called with:', action.payload._id, action.payload.content);
      
      // Check if message already exists
      const exists = state.messages.some(
        (msg) => msg._id === action.payload._id,
      );
      
      if (!exists) {
        // Create new array reference to force re-render
        state.messages = [...state.messages, action.payload];
        // Sort by date
        state.messages.sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
        console.log('✅ Message added, new count:', state.messages.length);
      } else {
        console.log('⚠️ Message already exists, skipping');
      }
    },

    prependMessages: (state, action: PayloadAction<Message[]>) => {
      const newMessages = action.payload.filter(
        (newMsg) =>
          !state.messages.some((existing) => existing._id === newMsg._id),
      );
      state.messages = [...newMessages, ...state.messages];
    },

    updateMessage: (
      state,
      action: PayloadAction<{ messageId: string; updates: Partial<Message> }>,
    ) => {
      const index = state.messages.findIndex(
        (msg) => msg._id === action.payload.messageId,
      );
      if (index !== -1) {
        state.messages[index] = {
          ...state.messages[index],
          ...action.payload.updates,
        };
      }
    },

    deleteMessage: (state, action: PayloadAction<string>) => {
      state.messages = state.messages.filter(
        (msg) => msg._id !== action.payload,
      );
    },

    // Typing actions
    setTypingUsers: (state, action: PayloadAction<string[]>) => {
      state.typingUsers = action.payload;
    },

    addTypingUser: (state, action: PayloadAction<string>) => {
      if (!state.typingUsers.includes(action.payload)) {
        state.typingUsers.push(action.payload);
      }
    },

    removeTypingUser: (state, action: PayloadAction<string>) => {
      state.typingUsers = state.typingUsers.filter(
        (userId) => userId !== action.payload,
      );
    },

    // Selection actions
    toggleMessageSelection: (state, action: PayloadAction<string>) => {
      const index = state.selectedMessages.indexOf(action.payload);
      if (index === -1) {
        state.selectedMessages.push(action.payload);
      } else {
        state.selectedMessages.splice(index, 1);
      }
    },

    clearSelectedMessages: (state) => {
      state.selectedMessages = [];
    },

    // Search actions
    setSearchQuery: (state, action: PayloadAction<string>) => {
      state.searchQuery = action.payload;
    },

    // Loading & error
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },

    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },

    // Pagination
    setPagination: (
      state,
      action: PayloadAction<Partial<ChatState["pagination"]>>,
    ) => {
      state.pagination = { ...state.pagination, ...action.payload };
    },

    incrementPage: (state) => {
      state.pagination.page += 1;
    },

    resetPage: (state) => {
      state.pagination.page = 1;
      state.pagination.hasMore = true;
    },

    // Clear all
    clearChatState: (state) => {
      state.activeChat = null;
      state.messages = [];
      state.typingUsers = [];
      state.selectedMessages = [];
      state.searchQuery = "";
    },

    // Reset
    resetChatState: () => initialState,
  },
});

export const {
  setChats,
  addChat,
  updateChat,
  removeChat,
  setActiveChat,
  setMessages,
  addMessage,
  prependMessages,
  updateMessage,
  deleteMessage,
  setTypingUsers,
  addTypingUser,
  removeTypingUser,
  toggleMessageSelection,
  clearSelectedMessages,
  setSearchQuery,
  setLoading,
  setError,
  setPagination,
  incrementPage,
  resetPage,
  clearChatState,
  resetChatState,
} = chatSlice.actions;

export default chatSlice.reducer;

// ========== SELECTORS ==========
export const selectChats = (state: { chat: ChatState }) => state.chat.chats;
export const selectActiveChat = (state: { chat: ChatState }) => state.chat.activeChat;
export const selectMessages = (state: { chat: ChatState }) => state.chat.messages;
export const selectTypingUsers = (state: { chat: ChatState }) => state.chat.typingUsers;
export const selectSelectedMessages = (state: { chat: ChatState }) => state.chat.selectedMessages;
export const selectSearchQuery = (state: { chat: ChatState }) => state.chat.searchQuery;
export const selectIsLoading = (state: { chat: ChatState }) => state.chat.isLoading;
export const selectChatError = (state: { chat: ChatState }) => state.chat.error;
export const selectPagination = (state: { chat: ChatState }) => state.chat.pagination;

// Memoized selectors
export const selectMessagesForActiveChat = createSelector(
  [selectMessages, selectActiveChat],
  (messages, activeChat) => {
    if (!activeChat) return [];
    return messages;
  }
);

export const selectUnreadCountForChat = createSelector(
  [selectChats, (_state: { chat: ChatState }, chatId: string) => chatId],
  (chats, chatId) => {
    const chat = chats.find(c => c._id === chatId);
    return chat?.unreadCount || 0;
  }
);