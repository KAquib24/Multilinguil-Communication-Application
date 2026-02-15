import { useEffect, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useSocket } from '../context/SocketContext';
import {
  useGetChatsQuery,
  useGetMessagesQuery,
  useSendMessageMutation,
  useMarkAsReadMutation,
  useUpdateTypingMutation,
  useAddReactionMutation,
  useRemoveReactionMutation,
  useDeleteMessageMutation,
} from '../features/chat/chatApi';
import {
  selectActiveChat,
  selectMessages,
  selectTypingUsers,
  setActiveChat,
  setMessages,
  addMessage,
  updateMessage,
  deleteMessage,
  addTypingUser,
  removeTypingUser,
  setLoading,
  setError,
} from '../features/chat/chatSlice';
import { ChatSocketService } from '../services/chat.service';
import { Message, SendMessageRequest } from '../features/chat/chatApi';
import toast from 'react-hot-toast';

// Helper to convert Message options to SendMessageRequest
const prepareMessageData = (
  content: string, 
  options: Partial<Message> = {}
): SendMessageRequest => {
  const { replyTo, ...otherOptions } = options;
  
  const messageData: SendMessageRequest = {
    content: content.trim(),
    type: 'text',
    ...otherOptions as any, // Type assertion for other properties
  };
  
  // Handle replyTo conversion
  if (replyTo) {
    if (typeof replyTo === 'object' && replyTo._id) {
      messageData.replyTo = replyTo._id;
    } else if (typeof replyTo === 'string') {
      messageData.replyTo = replyTo;
    }
  }
  
  return messageData;
};

export const useChat = () => {
  const dispatch = useDispatch();
  const { socket, isConnected } = useSocket();
  
  const activeChat = useSelector(selectActiveChat);
  const messages = useSelector(selectMessages);
  const typingUsers = useSelector(selectTypingUsers);
  
  const chatSocketRef = useRef<ChatSocketService | null>(null);
  
  // API hooks
  const { data: chatsData, isLoading: isLoadingChats, error: chatsError } = useGetChatsQuery({});
  const { data: messagesData, isLoading: isLoadingMessages, error: messagesError } = useGetMessagesQuery(
    { chatId: activeChat?._id || '', page: 1, limit: 50 },
    { skip: !activeChat?._id }
  );
  
  const [sendMessageApi] = useSendMessageMutation();
  const [markAsReadApi] = useMarkAsReadMutation();
  const [updateTypingApi] = useUpdateTypingMutation();
  const [addReactionApi] = useAddReactionMutation();
  const [removeReactionApi] = useRemoveReactionMutation();
  const [deleteMessageApi] = useDeleteMessageMutation();
  
  // Initialize socket service
  useEffect(() => {
    if (socket && isConnected) {
      chatSocketRef.current = new ChatSocketService(socket);
      
      return () => {
        if (chatSocketRef.current) {
          chatSocketRef.current.disconnect();
          chatSocketRef.current = null;
        }
      };
    }
  }, [socket, isConnected]);
  
  // Join/leave chat rooms
  useEffect(() => {
    if (chatSocketRef.current && activeChat) {
      chatSocketRef.current.joinChat(activeChat._id);
      
      return () => {
        chatSocketRef.current?.leaveChat(activeChat._id);
      };
    }
  }, [activeChat]);
  
  // Load messages when active chat changes
  useEffect(() => {
    if (messagesData && activeChat) {
      dispatch(setMessages(messagesData?.data?.messages || []));
    }
  }, [messagesData, activeChat, dispatch]);
  
  // Handle errors
  useEffect(() => {
    if (chatsError) {
      dispatch(setError('Failed to load chats'));
      toast.error('Failed to load chats');
    }
    if (messagesError) {
      dispatch(setError('Failed to load messages'));
      toast.error('Failed to load messages');
    }
  }, [chatsError, messagesError, dispatch]);
  
  // Chat management
  const selectChat = useCallback((chat: any) => {
    dispatch(setActiveChat(chat));
    dispatch(setLoading(true));
    
    // Mark messages as read
    if (chat.unreadCount > 0) {
      markAsReadApi({ chatId: chat._id });
    }
  }, [dispatch, markAsReadApi]);
  
  const sendMessage = useCallback(async (content: string, options: Partial<Message> = {}) => {
    if (!activeChat || !content.trim()) return;
    
    try {
      // Prepare message data for API
      const messageData = prepareMessageData(content, options);
      
      // Send via socket (socket might accept different format)
      if (chatSocketRef.current) {
        // For socket, we can send the original options
        chatSocketRef.current.sendMessage(activeChat._id, {
          content: content.trim(),
          type: 'text',
          ...options,
        } as Partial<Message>);
      }
      
      // Send via API for persistence
      await sendMessageApi({
        chatId: activeChat._id,
        data: messageData,
      }).unwrap();
      
    } catch (error) {
      toast.error('Failed to send message');
      console.error('Send message error:', error);
    }
  }, [activeChat, sendMessageApi]);
  
  const sendFile = useCallback(async (file: File, type: Message['type']) => {
    if (!activeChat || !file) return;
    
    // In a real app, upload file to storage service first
    // For now, create a mock file message
    const messageData: SendMessageRequest = {
      type,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      content: `${type} file: ${file.name}`,
    };
    
    // Send via socket
    if (chatSocketRef.current) {
      chatSocketRef.current.sendMessage(activeChat._id, messageData as Partial<Message>);
    }
    
    // Send via API
    await sendMessageApi({
      chatId: activeChat._id,
      data: messageData,
    }).unwrap();
  }, [activeChat, sendMessageApi]);
  
  const markAsRead = useCallback((messageIds: string[]) => {
    if (!activeChat || messageIds.length === 0) return;
    
    if (chatSocketRef.current) {
      chatSocketRef.current.markAsRead(activeChat._id, messageIds);
    }
    
    markAsReadApi({ chatId: activeChat._id, messageIds });
  }, [activeChat, markAsReadApi]);
  
  const startTyping = useCallback(() => {
    if (!activeChat) return;
    
    if (chatSocketRef.current) {
      chatSocketRef.current.startTyping(activeChat._id);
    }
    
    updateTypingApi({ chatId: activeChat._id, isTyping: true });
  }, [activeChat, updateTypingApi]);
  
  const stopTyping = useCallback(() => {
    if (!activeChat) return;
    
    if (chatSocketRef.current) {
      chatSocketRef.current.stopTyping(activeChat._id);
    }
    
    updateTypingApi({ chatId: activeChat._id, isTyping: false });
  }, [activeChat, updateTypingApi]);
  
  const addReaction = useCallback((messageId: string, emoji: string) => {
    if (chatSocketRef.current) {
      chatSocketRef.current.addReaction(messageId, emoji);
    }
    
    addReactionApi({ messageId, emoji });
  }, [addReactionApi]);
  
  const removeReaction = useCallback((messageId: string) => {
    if (chatSocketRef.current) {
      chatSocketRef.current.removeReaction(messageId);
    }
    
    removeReactionApi(messageId);
  }, [removeReactionApi]);
  
  const deleteMessage = useCallback((messageId: string) => {
    if (chatSocketRef.current) {
      // Note: Should be deleteMessage, not removeReaction
      // But ChatSocketService doesn't have deleteMessage emitter
      // chatSocketRef.current.deleteMessage(messageId);
    }
    
    deleteMessageApi(messageId);
  }, [deleteMessageApi]);
  
  // Get current user ID from auth state or localStorage
  const getCurrentUserId = useCallback(() => {
    // TODO: Get from Redux auth state instead of localStorage
    return localStorage.getItem('userId');
  }, []);
  
  return {
    // State
    chats: chatsData?.data?.chats || [],
    activeChat,
    messages,
    typingUsers,
    isLoading: isLoadingChats || isLoadingMessages,
    
    // Actions
    selectChat,
    sendMessage,
    sendFile,
    markAsRead,
    startTyping,
    stopTyping,
    addReaction,
    removeReaction,
    deleteMessage,
    
    // Helpers
    getOtherParticipant: () => {
      if (!activeChat || activeChat.isGroup) return null;
      const userId = getCurrentUserId();
      return activeChat.participants.find(p => p._id !== userId);
    },
    
    isUserTyping: (userId: string) => {
      return typingUsers.includes(userId);
    },
    
    getUnreadCount: (chatId: string) => {
  const chat = chatsData?.data?.chats.find(
    (c: any) => c._id === chatId
  );
  return chat?.unreadCount || 0;
},
    
    // New helper for getting current user ID
    getCurrentUserId,
  };
};