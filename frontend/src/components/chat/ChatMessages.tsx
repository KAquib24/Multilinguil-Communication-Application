// components/chat/ChatMessages.tsx
import React, { useEffect, useRef, useState } from 'react';
import { useChat } from '../../hooks/useChat';
import MessageItem from './MessageItem';
import { useGetMessagesQuery } from '../../features/chat/chatApi';

interface ChatMessagesProps {
  chatId: string;
}

const ChatMessages: React.FC<ChatMessagesProps> = ({ chatId }) => {
  const { messages, isLoading } = useChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMessagesLengthRef = useRef(messages.length);
  const lastMessageIdRef = useRef<string | null>(null);
  
  // Use RTK Query hook for polling - with skip: false to actually fetch
  const { refetch, data: polledData } = useGetMessagesQuery(
    { chatId, page: 1, limit: 50 },
    { 
      pollingInterval: 1000, // Auto-poll every 2 seconds
      refetchOnMountOrArgChange: true,
      refetchOnFocus: true,
      refetchOnReconnect: true
    }
  );

  // Debug: Log when messages change
  useEffect(() => {
    console.log('🔄 ChatMessages - messages updated, count:', messages.length);
    
    // Check if new message arrived
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessageIdRef.current !== lastMessage._id) {
        console.log('✨ New message detected!', lastMessage);
        lastMessageIdRef.current = lastMessage._id;
        // Force scroll
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    }
  }, [messages]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > prevMessagesLengthRef.current) {
      console.log('📜 New message detected, scrolling to bottom');
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages.length]);

  // Initial scroll to bottom
  useEffect(() => {
    console.log('🏁 Initial scroll for chat:', chatId);
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView();
    }, 100);
  }, [chatId]);

  // Force refetch when chatId changes
  useEffect(() => {
    if (chatId) {
      refetch();
    }
  }, [chatId, refetch]);

  if (isLoading && messages.length === 0) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          No messages yet
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Send a message to start the conversation!
        </p>
      </div>
    );
  }

  // Group messages by date
  const groupedMessages: { [key: string]: typeof messages } = {};
  messages.forEach((message) => {
    const date = new Date(message.createdAt).toDateString();
    if (!groupedMessages[date]) {
      groupedMessages[date] = [];
    }
    groupedMessages[date].push(message);
  });

  return (
    <div className="flex flex-col space-y-4">
      {Object.entries(groupedMessages).map(([date, dateMessages]) => (
        <div key={date}>
          <div className="flex justify-center my-4">
            <div className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded-full text-xs text-gray-600 dark:text-gray-300">
              {new Date(date).toLocaleDateString(undefined, { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </div>
          </div>
          {dateMessages.map((message, index) => (
            <MessageItem
              key={`${message._id}-${index}`}
              message={message}
              showDate={false}
            />
          ))}
        </div>
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default ChatMessages;