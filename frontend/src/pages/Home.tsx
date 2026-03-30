import React from 'react';
import { useSelector } from 'react-redux';
import { useChat } from '../hooks/useChat';
import MessageItem from '../components/chat/MessageItem';
import { selectCurrentUser } from '../features/auth/authSlice';
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';

const Home: React.FC = () => {
  const { messages, activeChat, isLoading } = useChat();
  // const currentUser = useSelector(selectCurrentUser);

  // Group messages by date for display
  const groupMessagesByDate = () => {
    const grouped: { [key: string]: any[] } = {};
    
    messages.forEach((message) => {
      const date = new Date(message.createdAt).toDateString();
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(message);
    });
    
    return grouped;
  };

  const groupedMessages = groupMessagesByDate();

  if (!activeChat) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center">
        <ChatBubbleLeftRightIcon className="h-24 w-24 text-gray-300 mb-4" />
        <h3 className="text-xl font-semibold text-gray-600 mb-2">
          No chat selected
        </h3>
        <p className="text-gray-500 text-center">
          Select a conversation from the sidebar to start messaging
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-whatsapp-green-light"></div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-whatsapp-green-light/10 rounded-full flex items-center justify-center">
            <ChatBubbleLeftRightIcon className="h-8 w-8 text-whatsapp-green-light" />
          </div>
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
            No messages yet
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            Say hello to start the conversation!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {Object.entries(groupedMessages).map(([date, dateMessages]) => (
          <div key={date}>
            <div className="flex justify-center my-4">
              <div className="px-3 py-1 bg-whatsapp-gray-200 dark:bg-whatsapp-gray-700 rounded-full text-xs text-gray-600 dark:text-gray-300">
                {new Date(date).toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </div>
            </div>
            
            {dateMessages.map((message, index) => {
              const showDate = index === 0 || 
                new Date(message.createdAt).toDateString() !== 
                new Date(dateMessages[index - 1].createdAt).toDateString();
              
              return (
                <MessageItem
                  key={message._id || index}
                  message={message}
                  showDate={showDate}
                />
              );
            })}
          </div>
        ))}
        
        {/* Typing indicator */}
        <div className="flex justify-start">
          <div className="bg-gray-200 dark:bg-gray-800 rounded-2xl px-4 py-2 rounded-tl-none">
            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;