import { apiSlice } from "../../app/apiSlice";

export interface Message {
  _id: string;
  sender: {
    _id: string;
    name: string;
    picture: string;
    email: string;
  };
  content: string;
  type: "text" | "image" | "file" | "audio" | "video" | "location";
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  thumbnail?: string;
  duration?: number;
  latitude?: number;
  longitude?: number;
  locationName?: string;
  readBy: string[];
  deleted: boolean;
  deletedAt?: string;
  forwarded: boolean;
  forwardedFrom?: any;
  replyTo?: Message;
  reactions: Array<{
    userId: string;
    emoji: string;
    user?: {
      name: string;
      picture: string;
    };
  }>;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface Chat {
  _id: string;
  participants: Array<{
    _id: string;
    name: string;
    picture: string;
    email: string;
    isOnline?: boolean;
    lastSeen?: string;
  }>;
  isGroup: boolean;
  groupName?: string;
  groupPhoto?: string;
  groupDescription?: string;
  groupAdmins: string[];
  lastMessage?: Message;
  lastMessageAt: string;
  pinned: boolean;
  mutedBy: string[];
  archivedBy: string[];
  typing: Array<{
    userId: string;
    startedAt: string;
    user?: {
      name: string;
      picture: string;
    };
  }>;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SendMessageRequest {
  content?: string;
  type?: Message["type"];
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

export interface MessagesResponse {
  messages: Message[];
  total: number;
  page: number;
  totalPages: number;
  hasMore: boolean;
}

export interface ChatsResponse {
  chats: Chat[];
  total: number;
  page: number;
  totalPages: number;
}

export const chatApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // Get all chats
    getChats: builder.query<{data : ChatsResponse}, { page?: number; limit?: number }>({
      query: ({ page = 1, limit = 50 }) => ({
        url: `/chats?page=${page}&limit=${limit}`,
        method: "GET",
      }),
      providesTags: ["Chat"],
    }),

    // Get or create chat with user
    getOrCreateChat: builder.mutation<{ data: { chat: Chat } }, string>({
      query: (targetUserId) => ({
        url: `/chats/user/${targetUserId}`,
        method: "GET",
      }),
      invalidatesTags: ["Chat"],
    }),

    // Get chat by ID
    getChat: builder.query<{ chat: Chat }, string>({
      query: (chatId) => `/chat/${chatId}`,
      providesTags: (result, error, chatId) => [{ type: "Chat", id: chatId }],
    }),

    // Create group chat
    createGroup: builder.mutation<
      { chat: Chat },
      {
        name: string;
        participants: string[];
        photo?: string;
        description?: string;
      }
    >({
      query: (groupData) => ({
        url: "/chat/group",
        method: "POST",
        body: groupData,
      }),
      invalidatesTags: ["Chat"],
    }),

    // Get chat messages
    getMessages: builder.query<{
      data: MessagesResponse},
      {
        chatId: string;
        page?: number;
        limit?: number;
      }
    >({
      query: ({ chatId, page = 1, limit = 50 }) => ({
        url: `/chats/${chatId}/messages?page=${page}&limit=${limit}`,
        method: "GET",
      }),
    }),

    // Send message
    sendMessage: builder.mutation<
      { data: { message: Message } },
      {
        chatId: string;
        data: SendMessageRequest;
      }
    >({
      query: ({ chatId, data }) => ({
        url: `/chats/${chatId}/messages`,
        method: "POST",
        body: data,
      }),
      invalidatesTags: ["Chat", "Message"],
    }),

    // Mark messages as read
    markAsRead: builder.mutation<
      { readCount: number },
      {
        chatId: string;
        messageIds?: string[];
      }
    >({
      query: ({ chatId, messageIds }) => ({
        url: `/chat/${chatId}/messages/read`,
        method: "POST",
        body: { messageIds },
      }),
      invalidatesTags: (result, error, { chatId }) => [
        { type: "Message", id: chatId },
        { type: "Chat" },
      ],
    }),

    // Delete message
    deleteMessage: builder.mutation<{ message: Message }, string>({
      query: (messageId) => ({
        url: `/chat/messages/${messageId}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Message", "Chat"],
    }),

    // Add reaction
    addReaction: builder.mutation<
      { message: Message },
      {
        messageId: string;
        emoji: string;
      }
    >({
      query: ({ messageId, emoji }) => ({
        url: `/chat/messages/${messageId}/reactions`,
        method: "POST",
        body: { emoji },
      }),
      invalidatesTags: ["Message"],
    }),

    // Remove reaction
    removeReaction: builder.mutation<{ message: Message }, string>({
      query: (messageId) => ({
        url: `/chat/messages/${messageId}/reactions`,
        method: "DELETE",
      }),
      invalidatesTags: ["Message"],
    }),

    // Update typing status
    updateTyping: builder.mutation<
      void,
      {
        chatId: string;
        isTyping: boolean;
      }
    >({
      query: ({ chatId, isTyping }) => ({
        url: `/chat/${chatId}/typing`,
        method: "POST",
        body: { isTyping },
      }),
    }),

    // Get chat stats
    getChatStats: builder.query<any, string>({
      query: (chatId) => `/chat/${chatId}/stats`,
    }),

    // Search messages
    searchMessages: builder.query<
      MessagesResponse,
      {
        chatId: string;
        query: string;
        page?: number;
        limit?: number;
      }
    >({
      query: ({ chatId, query, page = 1, limit = 20 }) => ({
        url: `/chat/${chatId}/search?q=${query}&page=${page}&limit=${limit}`,
        method: "GET",
      }),
    }),
  }),
});

export const {
  useGetChatsQuery,
  useGetOrCreateChatMutation,
  useGetChatQuery,
  useCreateGroupMutation,
  useGetMessagesQuery,
  useSendMessageMutation,
  useMarkAsReadMutation,
  useDeleteMessageMutation,
  useAddReactionMutation,
  useRemoveReactionMutation,
  useUpdateTypingMutation,
  useGetChatStatsQuery,
  useSearchMessagesQuery,
} = chatApi;
