import React, { useState, useRef, useEffect } from 'react';
import { useChat } from '../../hooks/useChat';
import {
  PaperClipIcon,
  PhotoIcon,
  VideoCameraIcon,
  MicrophoneIcon,
  MapPinIcon,
  FaceSmileIcon,
  PaperAirplaneIcon,
} from '@heroicons/react/24/outline';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';

interface MessageInputProps {
  chatId: string;
  onSend?: (message: string) => void;
}

const MessageInput: React.FC<MessageInputProps> = ({ chatId, onSend }) => {
  const { sendMessage, startTyping, stopTyping } = useChat();
  
  const [message, setMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  
  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);
  
  // Typing indicators
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    
    // Start typing indicator
    startTyping();
    
    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Stop typing after 2 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      stopTyping();
    }, 2000);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };
  
  const handleSend = () => {
    if (message.trim()) {
      sendMessage(message.trim());
      setMessage('');
      stopTyping();
      
      if (onSend) {
        onSend(message.trim());
      }
    }
  };
  
  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setMessage(prev => prev + emojiData.emoji);
    setShowEmojiPicker(false);
  };
  
  const handleFileSelect = (type: 'image' | 'video' | 'audio' | 'file') => {
    if (fileInputRef.current) {
      fileInputRef.current.accept = type === 'image' 
        ? 'image/*' 
        : type === 'video' 
          ? 'video/*'
          : type === 'audio'
            ? 'audio/*'
            : '*';
      fileInputRef.current.click();
    }
    setShowAttachmentMenu(false);
  };
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Determine file type
      let type: 'image' | 'video' | 'audio' | 'file' = 'file';
      
      if (file.type.startsWith('image/')) {
        type = 'image';
      } else if (file.type.startsWith('video/')) {
        type = 'video';
      } else if (file.type.startsWith('audio/')) {
        type = 'audio';
      }
      
      // In a real app, upload file here
      // For now, just send as text with file info
      sendMessage(`Sent a ${type}: ${file.name}`, {
        type,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      });
    }
    
    // Clear input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  const startVoiceRecording = () => {
    // Implement voice recording
    setIsRecording(true);
  };
  
  const stopVoiceRecording = () => {
    setIsRecording(false);
    // Send recorded audio
  };
  
  const sendLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          sendMessage('', {
            type: 'location',
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            locationName: 'My Location',
          });
        },
        (error) => {
          console.error('Error getting location:', error);
        }
      );
    }
  };
  
  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      {/* Attachment menu */}
      {showAttachmentMenu && (
        <div className="absolute bottom-full left-4 mb-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-2">
          <div className="grid grid-cols-4 gap-2">
            <button
              onClick={() => handleFileSelect('image')}
              className="flex flex-col items-center p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mb-2">
                <PhotoIcon className="h-5 w-5 text-blue-600 dark:text-blue-300" />
              </div>
              <span className="text-xs">Photo</span>
            </button>
            
            <button
              onClick={() => handleFileSelect('video')}
              className="flex flex-col items-center p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center mb-2">
                <VideoCameraIcon className="h-5 w-5 text-purple-600 dark:text-purple-300" />
              </div>
              <span className="text-xs">Video</span>
            </button>
            
            <button
              onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
              className="flex flex-col items-center p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <div className={`
                w-10 h-10 rounded-full flex items-center justify-center mb-2
                ${isRecording 
                  ? 'bg-red-100 dark:bg-red-900 animate-pulse' 
                  : 'bg-green-100 dark:bg-green-900'
                }
              `}>
                <MicrophoneIcon className={`h-5 w-5 ${
                  isRecording 
                    ? 'text-red-600 dark:text-red-300' 
                    : 'text-green-600 dark:text-green-300'
                }`} />
              </div>
              <span className="text-xs">{isRecording ? 'Stop' : 'Audio'}</span>
            </button>
            
            <button
              onClick={sendLocation}
              className="flex flex-col items-center p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <div className="w-10 h-10 bg-yellow-100 dark:bg-yellow-900 rounded-full flex items-center justify-center mb-2">
                <MapPinIcon className="h-5 w-5 text-yellow-600 dark:text-yellow-300" />
              </div>
              <span className="text-xs">Location</span>
            </button>
            
            <button
              onClick={() => handleFileSelect('file')}
              className="flex flex-col items-center p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-2">
                <PaperClipIcon className="h-5 w-5 text-gray-600 dark:text-gray-300" />
              </div>
              <span className="text-xs">File</span>
            </button>
          </div>
        </div>
      )}
      
      {/* Emoji picker */}
      {showEmojiPicker && (
        <div className="absolute bottom-full right-4 mb-2">
          <EmojiPicker
            onEmojiClick={handleEmojiClick}
            autoFocusSearch={false}
            height={350}
            width={300}
          />
        </div>
      )}
      
      <div className="flex items-end space-x-2">
        {/* Attachment button */}
        <div className="relative">
          <button
            onClick={() => setShowAttachmentMenu(!showAttachmentMenu)}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <PaperClipIcon className="h-6 w-6 text-gray-500 dark:text-gray-400" />
          </button>
        </div>
        
        {/* Message input */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            className="
              w-full px-4 py-3 pr-12
              bg-gray-100 dark:bg-gray-700
              border border-transparent
              rounded-full
              focus:outline-none focus:ring-2 focus:ring-blue-500
              resize-none overflow-hidden
              placeholder-gray-500 dark:placeholder-gray-400
            "
            style={{ maxHeight: '120px' }}
          />
          
          {/* Emoji button inside input */}
          <button
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="absolute right-4 top-1/2 transform -translate-y-1/2 p-1"
          >
            <FaceSmileIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>
        
        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!message.trim()}
          className={`
            p-3 rounded-full transition-colors duration-200
            ${message.trim()
              ? 'bg-blue-500 hover:bg-blue-600 text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
            }
          `}
        >
          <PaperAirplaneIcon className="h-5 w-5" />
        </button>
      </div>
      
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileChange}
      />
      
      {/* Close menus when clicking outside */}
      {(showAttachmentMenu || showEmojiPicker) && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => {
            setShowAttachmentMenu(false);
            setShowEmojiPicker(false);
          }}
        />
      )}
    </div>
  );
};

export default MessageInput;