import React from 'react';
import { useSelector } from 'react-redux';
import { useChat } from '../../hooks/useChat.js';
import { selectChats } from '../../features/chat/chatSlice.js';
import { Chat } from '../../features/chat/chatApi.js';
import {
  UserGroupIcon,
  UserCircleIcon,
  ChatBubbleLeftIcon,
  CheckIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { formatDistanceToNow } from 'date-fns';

interface ChatListProps {
  onSelectChat: (chat: Chat) => void;
  searchQuery?: string;
}

const ChatList: React.FC<ChatListProps> = ({ onSelectChat, searchQuery = '' }) => {
  const { chats } = useChat();
  const { getUnreadCount } = useChat();
  
  const filteredChats = chats.filter(chat => {
    if (!searchQuery.trim()) return true;
    
    const searchLower = searchQuery.toLowerCase();
    
    if (chat.isGroup) {
      return chat.groupName?.toLowerCase().includes(searchLower) ||
        chat.groupDescription?.toLowerCase().includes(searchLower);
    } else {
      const otherParticipant = chat.participants.find(p => 
        p._id !== localStorage.getItem('userId')
      );
      return otherParticipant?.name.toLowerCase().includes(searchLower) ||
        otherParticipant?.email.toLowerCase().includes(searchLower);
    }
  });
  
  const getChatName = (chat: Chat): string => {
    if (chat.isGroup) {
      return chat.groupName || 'Group Chat';
    }
    
    const otherParticipant = chat.participants.find(p => 
      p._id !== localStorage.getItem('userId')
    );
    return otherParticipant?.name || 'Unknown User';
  };
  
  const getChatPhoto = (chat: Chat): string => {
    if (chat.isGroup) {
      return chat.groupPhoto || '';
    }
    
    const otherParticipant = chat.participants.find(p => 
      p._id !== localStorage.getItem('userId')
    );
    return otherParticipant?.picture || '';
  };
  
  const getLastMessagePreview = (chat: Chat): string => {
    if (!chat.lastMessage) return 'No messages yet';
    
    if (chat.lastMessage.deleted) {
      return 'This message was deleted';
    }
    
    if (chat.lastMessage.type === 'image') {
      return '📷 Photo';
    } else if (chat.lastMessage.type === 'video') {
      return '🎥 Video';
    } else if (chat.lastMessage.type === 'audio') {
      return '🎵 Audio';
    } else if (chat.lastMessage.type === 'file') {
      return '📎 File';
    } else if (chat.lastMessage.type === 'location') {
      return '📍 Location';
    }
    
    return chat.lastMessage.content || '';
  };
  
  const getLastMessageTime = (chat: Chat): string => {
    if (!chat.lastMessageAt) return '';
    return formatDistanceToNow(new Date(chat.lastMessageAt), { addSuffix: true });
  };
  
  const getMessageStatus = (chat: Chat, userId: string) => {
    if (!chat.lastMessage) return null;
    
    if (chat.lastMessage.sender._id === userId) {
      const allRead = chat.participants
        .filter(p => p._id !== userId)
        .every(p => chat.lastMessage?.readBy.includes(p._id));
      
      if (allRead) {
        return <CheckIcon className="h-4 w-4 text-blue-500" />;
      }
      
      const someRead = chat.participants
        .filter(p => p._id !== userId)
        .some(p => chat.lastMessage?.readBy.includes(p._id));
      
      if (someRead) {
        return <CheckIcon className="h-4 w-4 text-gray-400" />;
      }
      
      return <ClockIcon className="h-4 w-4 text-gray-400" />;
    }
    
    return null;
  };
  
  return (
    <div className="h-full overflow-y-auto">
      {filteredChats.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
          <ChatBubbleLeftIcon className="h-16 w-16 text-gray-300 dark:text-gray-600 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
            No chats yet
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Start a conversation by searching for users or creating a group.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {filteredChats.map((chat) => {
            const userId = localStorage.getItem('userId');
            const unreadCount = getUnreadCount(chat._id);
            const isUnread = unreadCount > 0;
            
            return (
              <div
                key={chat._id}
                onClick={() => onSelectChat(chat)}
                className={`
                  flex items-center p-4 cursor-pointer transition-colors duration-150
                  hover:bg-gray-50 dark:hover:bg-gray-800
                  ${isUnread ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
                `}
              >
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-300 dark:bg-gray-700">
                    {getChatPhoto(chat) ? (
                      <img
                        src={getChatPhoto(chat)}
                        alt={getChatName(chat)}
                        className="w-full h-full object-cover"
                      />
                    ) : chat.isGroup ? (
                      <div className="w-full h-full flex items-center justify-center">
                        <UserGroupIcon className="h-6 w-6 text-gray-500 dark:text-gray-400" />
                      </div>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <UserCircleIcon className="h-6 w-6 text-gray-500 dark:text-gray-400" />
                      </div>
                    )}
                  </div>
                  
                  {/* Online indicator */}
                  {!chat.isGroup && chat.participants.some(p => 
                    p._id !== userId && p.isOnline
                  ) && (
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-gray-800" />
                  )}
                </div>
                
                {/* Chat info */}
                <div className="ml-4 flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className={`
                      text-sm font-medium truncate
                      ${isUnread 
                        ? 'text-gray-900 dark:text-gray-100' 
                        : 'text-gray-700 dark:text-gray-300'
                      }
                    `}>
                      {getChatName(chat)}
                    </h3>
                    <div className="flex items-center space-x-1">
                      {getMessageStatus(chat, userId || '')}
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {getLastMessageTime(chat)}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between mt-1">
                    <p className={`
                      text-sm truncate
                      ${isUnread 
                        ? 'text-gray-900 dark:text-gray-100 font-medium' 
                        : 'text-gray-500 dark:text-gray-400'
                      }
                    `}>
                      {getLastMessagePreview(chat)}
                    </p>
                    
                    {unreadCount > 0 && (
                      <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-blue-600 rounded-full">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </div>
                  
                  {/* Typing indicator */}
                  {chat.typing && chat.typing.length > 0 && (
                    <div className="mt-1">
                      <div className="flex items-center">
                        <div className="flex space-x-1">
                          <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                          <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                          <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                        </div>
                        <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                          {chat.typing[0].user?.name || 'Someone'} is typing...
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ChatList;