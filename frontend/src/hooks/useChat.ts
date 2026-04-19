// hooks/useChat.ts
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
  deleteMessage as deleteMessageAction,
  addTypingUser,
  removeTypingUser,
  setLoading,
  setError,
} from '../features/chat/chatSlice';
import { ChatSocketService } from '../services/chat.service';
import { Message, SendMessageRequest } from '../features/chat/chatApi';
import toast from 'react-hot-toast';

const prepareMessageData = (
  content: string, 
  options: Partial<Message> = {}
): SendMessageRequest => {
  const { replyTo, ...otherOptions } = options;
  
  const messageData: SendMessageRequest = {
    content: content.trim(),
    type: 'text',
    ...otherOptions as any,
  };
  
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
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitializedRef = useRef(false);
  
  const { data: chatsData, isLoading: isLoadingChats, error: chatsError, refetch: refetchChats } = useGetChatsQuery({});
  const { data: messagesData, isLoading: isLoadingMessages, error: messagesError, refetch: refetchMessages } = useGetMessagesQuery(
    { chatId: activeChat?._id || '', page: 1, limit: 50 },
    { skip: !activeChat?._id }
  );
  
  const [sendMessageApi] = useSendMessageMutation();
  const [markAsReadApi] = useMarkAsReadMutation();
  const [updateTypingApi] = useUpdateTypingMutation();
  const [addReactionApi] = useAddReactionMutation();
  const [removeReactionApi] = useRemoveReactionMutation();
  const [deleteMessageApi] = useDeleteMessageMutation();
  
  // Initialize socket service ONCE
  useEffect(() => {
    if (!socket || !isConnected) return;
    
    if (!isInitializedRef.current) {
      console.log('✅ Initializing ChatSocketService (once)');
      chatSocketRef.current = new ChatSocketService(socket);
      isInitializedRef.current = true;
    }
  }, [socket, isConnected]);
  
  // Join/leave chat rooms
  useEffect(() => {
    if (!chatSocketRef.current || !activeChat) return;
    
    console.log(`📢 Joining chat room: ${activeChat._id}`);
    chatSocketRef.current.joinChat(activeChat._id);
    
    return () => {
      console.log(`👋 Leaving chat room: ${activeChat._id}`);
      chatSocketRef.current?.leaveChat(activeChat._id);
    };
  }, [activeChat?._id]);
  
  // Load messages when active chat changes
  useEffect(() => {
    if (messagesData && activeChat) {
      console.log(`📨 Loading ${messagesData.data?.messages?.length || 0} messages`);
      dispatch(setMessages(messagesData.data?.messages || []));
    }
  }, [messagesData, activeChat, dispatch]);
  
  // Handle errors
  useEffect(() => {
    if (chatsError) {
      console.error('❌ Chats error:', chatsError);
      dispatch(setError('Failed to load chats'));
      toast.error('Failed to load chats');
    }
    if (messagesError) {
      console.error('❌ Messages error:', messagesError);
      dispatch(setError('Failed to load messages'));
      toast.error('Failed to load messages');
    }
  }, [chatsError, messagesError, dispatch]);
  
  const selectChat = useCallback((chat: any) => {
    console.log('💬 Selecting chat:', chat._id);
    dispatch(setActiveChat(chat));
    dispatch(setLoading(true));
    
    if (chat.unreadCount > 0) {
      markAsReadApi({ chatId: chat._id });
    }
  }, [dispatch, markAsReadApi]);
  
  const sendMessage = useCallback(async (content: string, options: Partial<Message> = {}) => {
  if (!activeChat) {
    toast.error('No chat selected');
    return;
  }
  
  if (!content.trim()) return;
  
  try {
    const messageData = prepareMessageData(content, options);
    
    // Send via socket for real-time
    if (chatSocketRef.current) {
      const socketMessage: Partial<Message> = {
        content: content.trim(),
        type: 'text' as const,
        ...options,
      };
      chatSocketRef.current.sendMessage(activeChat._id, socketMessage);
    }
    
    // Send via API for persistence
    await sendMessageApi({
      chatId: activeChat._id,
      data: messageData,
    }).unwrap();
    
    // Force refetch messages immediately after sending
    await refetchMessages();
    refetchChats();
    
  } catch (error) {
    console.error('❌ Send message error:', error);
    toast.error('Failed to send message');
  }
}, [activeChat, sendMessageApi, refetchChats, refetchMessages]);
  
  const sendFile = useCallback(async (file: File, type: Message['type']) => {
    if (!activeChat || !file) return;
    
    try {
      const messageData: SendMessageRequest = {
        type,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        content: `${type} file: ${file.name}`,
      };
      
      if (chatSocketRef.current) {
        chatSocketRef.current.sendMessage(activeChat._id, messageData as Partial<Message>);
      }
      
      await sendMessageApi({
        chatId: activeChat._id,
        data: messageData,
      }).unwrap();
      
    } catch (error) {
      console.error('❌ Send file error:', error);
      toast.error('Failed to send file');
    }
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
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    typingTimeoutRef.current = setTimeout(() => {
      updateTypingApi({ chatId: activeChat._id, isTyping: true }).catch(err => {
        console.warn('⚠️ Typing API error:', err);
      });
    }, 300);
  }, [activeChat, updateTypingApi]);
  
  const stopTyping = useCallback(() => {
    if (!activeChat) return;
    
    if (chatSocketRef.current) {
      chatSocketRef.current.stopTyping(activeChat._id);
    }
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    updateTypingApi({ chatId: activeChat._id, isTyping: false }).catch(err => {
      console.warn('⚠️ Typing API error:', err);
    });
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
    dispatch(deleteMessageAction(messageId));
    deleteMessageApi(messageId).catch(error => {
      console.error('❌ Failed to delete message:', error);
      toast.error('Failed to delete message');
      refetchMessages();
    });
  }, [deleteMessageApi, dispatch, refetchMessages]);
  
  const getCurrentUserId = useCallback(() => {
    return localStorage.getItem('userId');
  }, []);
  
  return {
    chats: chatsData?.data?.chats || [],
    activeChat,
    messages,
    typingUsers,
    isLoading: isLoadingChats || isLoadingMessages,
    
    selectChat,
    sendMessage,
    sendFile,
    markAsRead,
    startTyping,
    stopTyping,
    addReaction,
    removeReaction,
    refetchMessages,
    deleteMessage,
    
    getOtherParticipant: () => {
      if (!activeChat || activeChat.isGroup) return null;
      const userId = getCurrentUserId();
      return activeChat.participants.find(p => p._id !== userId) || null;
    },
    
    isUserTyping: (userId: string) => typingUsers.includes(userId),
    getUnreadCount: (chatId: string) => {
      const chat = chatsData?.data?.chats.find((c: any) => c._id === chatId);
      return chat?.unreadCount || 0;
    },
    getCurrentUserId,
  };
};