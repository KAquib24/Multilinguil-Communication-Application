import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { Message } from '../../features/chat/chatApi';
import { selectCurrentUser } from '../../features/auth/authSlice';
import { useChat } from '../../hooks/useChat';
import {
  CheckIcon,
  CheckCircleIcon,
  PaperClipIcon,
  // PhotoIcon,
  // VideoCameraIcon,
  MicrophoneIcon,
  MapPinIcon,
  TrashIcon,
  ArrowUturnLeftIcon,
  ArrowUpTrayIcon,
  FaceSmileIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';

interface MessageItemProps {
  message: Message;
  showDate?: boolean;
}

const MessageItem: React.FC<MessageItemProps> = ({
  message,
  showDate = false,
}) => {
  const currentUser = useSelector(selectCurrentUser);
  const { addReaction, removeReaction, deleteMessage } = useChat();

  const [showReactions, setShowReactions] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const isSentByMe = message.sender._id === currentUser?._id;
  const isDeleted = message.deleted;
  const hasReactions = message.reactions && message.reactions.length > 0;

  const commonReactions = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

  const handleReactionClick = (emoji: string) => {
    const existingReaction = message.reactions.find(
      (r) => r.userId === currentUser?._id && r.emoji === emoji,
    );

    if (existingReaction) {
      removeReaction(message._id);
    } else {
      addReaction(message._id, emoji);
    }

    setShowReactions(false);
  };

  const handleDelete = () => {
    if (window.confirm("Are you sure you want to delete this message?")) {
      deleteMessage(message._id);
    }
    setShowMenu(false);
  };

  const handleReply = () => {
    // Implement reply logic
    setShowMenu(false);
  };

  const handleForward = () => {
    // Implement forward logic
    setShowMenu(false);
  };

  const renderMessageContent = () => {
    if (isDeleted) {
      return (
        <div className="italic text-gray-500 dark:text-gray-400">
          This message was deleted
        </div>
      );
    }

    switch (message.type) {
      case "image":
        return (
          <div className="space-y-2">
            <div className="relative rounded-lg overflow-hidden">
              <img
                src={message.fileUrl || message.thumbnail}
                alt={message.fileName || "Image"}
                className="max-w-xs md:max-w-sm lg:max-w-md rounded-lg"
              />
              {message.content && (
                <div className="mt-2 text-sm">{message.content}</div>
              )}
            </div>
          </div>
        );

      case "video":
        return (
          <div className="space-y-2">
            <div className="relative rounded-lg overflow-hidden">
              <video
                src={message.fileUrl}
                controls
                className="max-w-xs md:max-w-sm lg:max-w-md rounded-lg"
              />
              {message.content && (
                <div className="mt-2 text-sm">{message.content}</div>
              )}
            </div>
          </div>
        );

      case "audio":
        return (
          <div className="space-y-2">
            <div className="flex items-center space-x-2 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
              <MicrophoneIcon className="h-5 w-5 text-gray-500" />
              <audio src={message.fileUrl} controls className="flex-1" />
            </div>
            {message.content && (
              <div className="mt-2 text-sm">{message.content}</div>
            )}
          </div>
        );

      case "file":
        return (
          <div className="space-y-2">
            <a
              href={message.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-3 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              <PaperClipIcon className="h-6 w-6 text-gray-500" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {message.fileName}
                </p>
                {message.fileSize && (
                  <p className="text-xs text-gray-500">
                    {(message.fileSize / 1024 / 1024).toFixed(2)} MB
                  </p>
                )}
              </div>
            </a>
            {message.content && (
              <div className="mt-2 text-sm">{message.content}</div>
            )}
          </div>
        );

      case "location":
        return (
          <div className="space-y-2">
            <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <MapPinIcon className="h-5 w-5 text-gray-500" />
                <span className="font-medium">
                  {message.locationName || "Location"}
                </span>
              </div>
              {message.latitude && message.longitude && (
                <a
                  href={`https://maps.google.com/?q=${message.latitude},${message.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-500 hover:text-blue-600"
                >
                  View on Google Maps
                </a>
              )}
            </div>
            {message.content && (
              <div className="mt-2 text-sm">{message.content}</div>
            )}
          </div>
        );

      default: // text
        return (
          <div className="text-sm whitespace-pre-wrap break-words">
            {message.content}
          </div>
        );
    }
  };

  const renderMessageStatus = () => {
    if (!isSentByMe) return null;

    const allRead = message.readBy.length > 1;
    const delivered = true;

    return (
      <div className="flex items-center space-x-1 ml-2">
        {allRead ? (
          <CheckCircleIcon className="h-4 w-4 text-blue-500" />
        ) : delivered ? (
          <CheckIcon className="h-4 w-4 text-gray-400" />
        ) : (
          <ClockIcon className="h-4 w-4 text-gray-400" />
        )}
      </div>
    );
  };

  const renderReactions = () => {
    if (!hasReactions) return null;

    const reactionGroups: Record<string, number> = {};
    message.reactions.forEach((reaction) => {
      reactionGroups[reaction.emoji] =
        (reactionGroups[reaction.emoji] || 0) + 1;
    });

    return (
      <div className="flex flex-wrap gap-1 mt-2">
        {Object.entries(reactionGroups).map(([emoji, count]) => (
          <button
            key={emoji}
            onClick={() => handleReactionClick(emoji)}
            className={`
              flex items-center space-x-1 px-2 py-1 rounded-full text-xs
              ${
                message.reactions.some(
                  (r) => r.userId === currentUser?._id && r.emoji === emoji,
                )
                  ? "bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
              }
            `}
          >
            <span>{emoji}</span>
            <span>{count}</span>
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="group relative">
      {/* Date separator */}
      {showDate && message.createdAt && (
        <div className="flex justify-center my-4">
          <div className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded-full text-xs text-gray-600 dark:text-gray-300">
            {format(new Date(message.createdAt), "MMMM d, yyyy")}
          </div>
        </div>
      )}

      <div className={`flex ${isSentByMe ? "justify-end" : "justify-start"}`}>
        <div className="max-w-[70%] md:max-w-[60%]">
          {/* Reply to message */}
          {message.replyTo && !message.replyTo.deleted && (
            <div
              className={`
              mb-2 p-2 rounded-lg border-l-4
              ${
                isSentByMe
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                  : "border-gray-400 bg-gray-100 dark:bg-gray-800"
              }
            `}
            >
              <div className="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400">
                <ArrowUturnLeftIcon className="h-3 w-3" />
                <span className="font-medium">
                  {message.replyTo.sender._id === currentUser?._id
                    ? "You"
                    : message.replyTo.sender.name}
                </span>
              </div>
              <p className="text-sm truncate">
                {message.replyTo.type === "text"
                  ? message.replyTo.content
                  : `Sent a ${message.replyTo.type}`}
              </p>
            </div>
          )}

          {/* Forwarded indicator */}
          {message.forwarded && (
            <div className="flex items-center space-x-1 mb-1 text-xs text-gray-500 dark:text-gray-400">
              <ArrowUpTrayIcon className="h-3 w-3" />
              <span>Forwarded</span>
            </div>
          )}

          {/* Message bubble */}
          <div className="relative">
            <div
              className={`
                rounded-2xl px-4 py-2
                ${
                  isSentByMe
                    ? "bg-blue-500 text-white rounded-tr-none"
                    : "bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-tl-none"
                }
                ${isDeleted ? "opacity-75" : ""}
              `}
              onContextMenu={(e) => {
                e.preventDefault();
                setShowMenu(true);
              }}
            >
              {/* Sender name for group chats */}
              {!isSentByMe && message.sender && (
                <div className="mb-1">
                  <span className="text-xs font-medium">
                    {message.sender.name}
                  </span>
                </div>
              )}

              {/* Message content */}
              {renderMessageContent()}

              {/* Message metadata */}
              <div
                className={`
                flex items-center justify-end mt-1 text-xs
                ${isSentByMe ? "text-blue-200" : "text-gray-500 dark:text-gray-400"}
              `}
              >
                <span>{format(new Date(message.createdAt), "HH:mm")}</span>
                {renderMessageStatus()}
              </div>
            </div>

            {/* Message actions menu */}
            {showMenu && (
              <div className="absolute z-10 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
                <div className="py-1">
                  <button
                    onClick={handleReply}
                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <ArrowUturnLeftIcon className="h-4 w-4 mr-2" />
                    Reply
                  </button>
                  <button
                    onClick={handleForward}
                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <ArrowUpTrayIcon className="h-4 w-4 mr-2" />
                    Forward
                  </button>
                  {isSentByMe && (
                    <button
                      onClick={handleDelete}
                      className="flex items-center w-full px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <TrashIcon className="h-4 w-4 mr-2" />
                      Delete
                    </button>
                  )}
                  <button
                    onClick={() => setShowReactions(!showReactions)}
                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <FaceSmileIcon className="h-4 w-4 mr-2" />
                    React
                  </button>
                </div>
              </div>
            )}

            {/* Reaction picker */}
            {showReactions && (
              <div className="absolute bottom-full left-0 mb-2 bg-white dark:bg-gray-800 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 p-2">
                <div className="flex space-x-2">
                  {commonReactions.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => handleReactionClick(emoji)}
                      className="text-xl hover:scale-125 transition-transform"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Reactions below message */}
          {renderReactions()}
        </div>
      </div>

      {/* Close menus when clicking outside */}
      {(showMenu || showReactions) && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => {
            setShowMenu(false);
            setShowReactions(false);
          }}
        />
      )}
    </div>
  );
};

export default MessageItem;