import React, { ReactNode, useEffect, useState } from "react";
import CallScreen from "../calls/CallScreen";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useLocation } from "react-router-dom";
import {
  selectCurrentUser,
  selectIsAuthenticated,
  logout,
} from "../../features/auth/authSlice";
import { useLogoutMutation } from "../../features/auth/authApi";
import IncomingCallModal from "../calls/IncomingCallModel";
import { useChat } from "../../hooks/useChat";
import ChatMessages from "../chat/ChatMessages";
import {
  Bars3Icon,
  ChatBubbleLeftRightIcon,
  PhoneIcon,
  VideoCameraIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  UserCircleIcon,
  MagnifyingGlassIcon,
  PaperClipIcon,
  FaceSmileIcon,
  LanguageIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import TranslationSettings from "../translation/TranslationSettings";
import { RootState } from "../../app/store";
// Import new chat modals
import NewChatModal from "../chat/NewChatModel";
import NewGroupModal from "../chat/NewGroupModel";
import { apiSlice } from "../../app/apiSlice";
import MessageInput from "../chat/MessageInput";
import { useCall } from "../../hooks/useCall";

interface MainLayoutProps {
  children: ReactNode;
}

// Define translation settings type
// interface TranslationSettingsType {
//   enabled: boolean;
//   sourceLanguage: string;
//   targetLanguage: string;
//   autoDetect: boolean;
//   autoPlayAudio: boolean;
// }

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const user = useSelector(selectCurrentUser);
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const { startCall } = useCall();

  // Use a default translation settings object since the selector doesn't exist
  const translationSettings = useSelector((state: RootState) => ({
    enabled: state.translation.translationEnabled,
    sourceLanguage: state.translation.sourceLanguage,
    targetLanguage: state.translation.targetLanguage,
    autoDetect: state.translation.sourceLanguage === "auto",
    autoPlayAudio: false, // keep default or wire later
  }));

  const [logoutMutation] = useLogoutMutation();

  const { chats, activeChat, selectChat, isLoading } = useChat();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [showTranslationSettings, setShowTranslationSettings] = useState(false);
  const [selectedChatIndex, setSelectedChatIndex] = useState<number | null>(
    null,
  );

  // New chat modal states
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [showNewGroupModal, setShowNewGroupModal] = useState(false);

  const activeCall = useSelector((state: RootState) => state.call.activeCall);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login", {
        replace: true,
        state: { from: location.pathname },
      });
    }
  }, [isAuthenticated, navigate, location]);

  const handleLogout = async () => {
    try {
      await logoutMutation().unwrap();
    } catch {}

    dispatch(logout()); // clears redux auth
    dispatch(apiSlice.util.resetApiState()); // clears cache

    navigate("/login", { replace: true });
  };

  const getOtherParticipant = (chat: any) => {
    if (!chat || !user || !chat.participants) return null;
    return chat.participants.find((p: any) => p._id !== user._id);
  };

  const getLastMessagePreview = (chat: any) => {
    if (!chat.lastMessage) return "No messages yet";

    if (chat.lastMessage.deleted) {
      return "Message deleted";
    }

    if (chat.lastMessage.type === "image") {
      return "📷 Photo";
    } else if (chat.lastMessage.type === "video") {
      return "🎬 Video";
    } else if (chat.lastMessage.type === "audio") {
      return "🎵 Audio";
    } else if (chat.lastMessage.type === "file") {
      return "📎 File";
    } else if (chat.lastMessage.type === "location") {
      return "📍 Location";
    }

    return chat.lastMessage.content || "Message";
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else if (diffDays === 1) {
      return "Yesterday";
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: "short" });
    } else {
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }
  };

  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-whatsapp-green-light"></div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-whatsapp-bg-light dark:bg-whatsapp-bg-dark">
      {/* Top Navigation Bar */}
      <header className="bg-whatsapp-green-dark text-white shadow-lg">
        <div className="px-4 py-3 flex items-center justify-between">
          {/* Left side - Logo and Menu */}
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg hover:bg-whatsapp-green-light/20 transition-colors duration-200"
            >
              <Bars3Icon className="h-6 w-6" />
            </button>

            <div className="flex items-center space-x-2">
              <div className="w-8 h-8">
                <svg
                  className="w-full h-full"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.012-.57-.012-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.87.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                </svg>
              </div>
              <span className="text-xl font-semibold">WhatsApp</span>
            </div>
          </div>

          {/* Center - Search */}
          <div className="flex-1 max-w-2xl mx-4 hidden md:block">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search messages..."
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-transparent"
              />
            </div>
          </div>

          {/* Right side - User menu */}
          <div className="flex items-center space-x-2">
            {/* Desktop icons */}
            <div className="hidden md:flex items-center space-x-2">
              <button
                onClick={() => navigate("/chats")}
                className="p-2 rounded-lg hover:bg-whatsapp-green-light/20 transition-colors duration-200"
              >
                <ChatBubbleLeftRightIcon className="h-6 w-6" />
              </button>

              {/* Translation Toggle */}
              <button
                onClick={() => setShowTranslationSettings(true)}
                className={`p-2 rounded-lg hover:bg-whatsapp-green-light/20 transition-colors duration-200 relative ${
                  translationSettings.enabled ? "text-green-400" : ""
                }`}
                title="Translation Settings"
              >
                <LanguageIcon className="h-6 w-6" />
                {translationSettings.enabled && (
                  <div className="absolute top-1 right-1 w-2 h-2 bg-green-500 rounded-full"></div>
                )}
              </button>

              <button className="p-2 rounded-lg hover:bg-whatsapp-green-light/20 transition-colors duration-200">
                <PhoneIcon className="h-6 w-6" />
              </button>
              <button className="p-2 rounded-lg hover:bg-whatsapp-green-light/20 transition-colors duration-200">
                <VideoCameraIcon className="h-6 w-6" />
              </button>
            </div>

            {/* User menu */}
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center space-x-2 p-2 rounded-lg hover:bg-whatsapp-green-light/20 transition-colors duration-200"
              >
                <div className="w-8 h-8 rounded-full overflow-hidden">
                  {user.picture ? (
                    <img
                      src={user.picture}
                      alt={user.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <UserCircleIcon className="w-full h-full text-white/80" />
                  )}
                </div>
                <span className="hidden md:inline font-medium">
                  {user.name}
                </span>
                <svg
                  className={`h-5 w-5 transition-transform duration-200 ${
                    userMenuOpen ? "rotate-180" : ""
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {/* Dropdown menu */}
              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-whatsapp-gray-800 rounded-lg shadow-lg py-1 z-50 border border-whatsapp-gray-200 dark:border-whatsapp-gray-700">
                  <div className="px-4 py-2 border-b border-whatsapp-gray-200 dark:border-whatsapp-gray-700">
                    <p className="text-sm font-medium text-whatsapp-gray-900 dark:text-white">
                      {user.name}
                    </p>
                    <p className="text-xs text-whatsapp-gray-500 dark:text-whatsapp-gray-400">
                      {user.email}
                    </p>
                    <p className="text-xs text-green-500 dark:text-green-400 mt-1">
                      ● Online
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                    }}
                    className="flex items-center w-full px-4 py-2 text-sm text-whatsapp-gray-700 dark:text-whatsapp-gray-300 hover:bg-whatsapp-gray-100 dark:hover:bg-whatsapp-gray-700"
                  >
                    <UserCircleIcon className="h-5 w-5 mr-2" />
                    Profile
                  </button>

                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                    }}
                    className="flex items-center w-full px-4 py-2 text-sm text-whatsapp-gray-700 dark:text-whatsapp-gray-300 hover:bg-whatsapp-gray-100 dark:hover:bg-whatsapp-gray-700"
                  >
                    <Cog6ToothIcon className="h-5 w-5 mr-2" />
                    Settings
                  </button>

                  <div className="border-t border-whatsapp-gray-200 dark:border-whatsapp-gray-700">
                    <button
                      onClick={handleLogout}
                      className="flex items-center w-full px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-whatsapp-gray-100 dark:hover:bg-whatsapp-gray-700"
                    >
                      <ArrowRightOnRectangleIcon className="h-5 w-5 mr-2" />
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside
          className={`
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          md:translate-x-0
          absolute md:relative
          w-64 md:w-80
          bg-white dark:bg-whatsapp-gray-800
          border-r border-whatsapp-gray-200 dark:border-whatsapp-border-dark
          transition-transform duration-300 ease-in-out
          z-40
          flex flex-col
          h-full
        `}
        >
          {/* Sidebar Header - Updated with New Chat button */}
          <div className="p-4 border-b border-whatsapp-gray-200 dark:border-whatsapp-border-dark">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-whatsapp-text-light dark:text-whatsapp-text-dark">
                Chats
              </h2>
              <button
                onClick={() => setShowNewChatModal(true)}
                className="p-2 rounded-lg hover:bg-whatsapp-gray-100 dark:hover:bg-whatsapp-gray-700"
                title="Start new chat"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                  />
                </svg>
              </button>
            </div>

            {/* Search in sidebar */}
            <div className="mt-4">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-whatsapp-gray-400" />
                <input
                  type="text"
                  placeholder="Search or start new chat"
                  className="w-full pl-10 pr-4 py-2 rounded-lg bg-whatsapp-gray-100 dark:bg-whatsapp-gray-700 border border-transparent focus:outline-none focus:ring-2 focus:ring-whatsapp-green-light focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Chat List */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-whatsapp-green-light"></div>
              </div>
            ) : chats.length === 0 ? (
              <div className="text-center py-8">
                <ChatBubbleLeftRightIcon className="h-12 w-12 mx-auto text-whatsapp-gray-400" />
                <p className="mt-2 text-whatsapp-gray-500">No chats yet</p>
                <button
                  onClick={() => setShowNewChatModal(true)}
                  className="mt-4 px-4 py-2 bg-whatsapp-green-light text-white rounded-lg hover:bg-whatsapp-green-dark"
                >
                  Start New Chat
                </button>
              </div>
            ) : (
              chats.map((chat: any, index: number) => {
                const otherUser = getOtherParticipant(chat);
                const isActive =
                  activeChat?._id === chat._id || selectedChatIndex === index;

                return (
                  <div
                    key={chat._id || index}
                    onClick={() => {
                      selectChat(chat);
                      setSelectedChatIndex(index);
                      setSidebarOpen(false);
                    }}
                    className={`
                      p-4 border-b border-whatsapp-gray-100 dark:border-whatsapp-gray-700 
                      hover:bg-whatsapp-gray-50 dark:hover:bg-whatsapp-gray-700 
                      cursor-pointer transition-colors duration-200
                      ${isActive ? "bg-whatsapp-gray-100 dark:bg-whatsapp-gray-700" : ""}
                    `}
                  >
                    <div className="flex items-center space-x-3">
                      <div className="relative">
                        <div className="w-12 h-12 rounded-full overflow-hidden bg-whatsapp-gray-300 dark:bg-whatsapp-gray-600">
                          {otherUser?.picture ? (
                            <img
                              src={otherUser.picture}
                              alt={otherUser.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <UserCircleIcon className="h-8 w-8 text-whatsapp-gray-500 dark:text-whatsapp-gray-400" />
                            </div>
                          )}
                        </div>
                        <div
                          className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white dark:border-whatsapp-gray-800
                          ${otherUser?.isOnline ? "bg-green-500" : "bg-gray-400"}
                        `}
                        ></div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center">
                          <p className="text-sm font-medium text-whatsapp-text-light dark:text-whatsapp-text-dark truncate">
                            {otherUser?.name || `Chat ${index + 1}`}
                            {chat.isGroup && " (Group)"}
                          </p>
                          {chat.lastMessageAt && (
                            <span className="text-xs text-whatsapp-gray-500 dark:text-whatsapp-gray-400">
                              {formatTime(chat.lastMessageAt)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-whatsapp-gray-600 dark:text-whatsapp-gray-400 truncate">
                            {getLastMessagePreview(chat)}
                          </p>
                          {chat.unreadCount > 0 && (
                            <span className="bg-whatsapp-green-light text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                              {chat.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Sidebar Footer */}
          <div className="p-4 border-t border-whatsapp-gray-200 dark:border-whatsapp-border-dark">
            <div className="flex items-center justify-between text-sm text-whatsapp-gray-600 dark:text-whatsapp-gray-400">
              <div className="flex items-center space-x-2">
                <UserCircleIcon className="h-5 w-5" />
                <span>{user.name}</span>
              </div>
              <span className="text-green-500">●</span>
            </div>
          </div>
        </aside>

        {/* Overlay for mobile sidebar */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {activeChat ? (
            <>
              {/* Chat Header */}
              <div className="border-b border-whatsapp-gray-200 dark:border-whatsapp-border-dark p-4 bg-white dark:bg-whatsapp-gray-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="md:hidden">
                      <button
                        onClick={() => setSidebarOpen(true)}
                        className="p-2 rounded-lg hover:bg-whatsapp-gray-100 dark:hover:bg-whatsapp-gray-700"
                      >
                        <Bars3Icon className="h-6 w-6" />
                      </button>
                    </div>

                    <div className="relative">
                      <div className="w-10 h-10 rounded-full overflow-hidden">
                        {getOtherParticipant(activeChat)?.picture ? (
                          <img
                            src={getOtherParticipant(activeChat)?.picture}
                            alt={getOtherParticipant(activeChat)?.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-whatsapp-gray-300 dark:bg-whatsapp-gray-600 flex items-center justify-center">
                            <UserCircleIcon className="h-6 w-6 text-whatsapp-gray-500 dark:text-whatsapp-gray-400" />
                          </div>
                        )}
                      </div>
                      <div
                        className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white dark:border-whatsapp-gray-800
                        ${getOtherParticipant(activeChat)?.isOnline ? "bg-green-500" : "bg-gray-400"}
                      `}
                      ></div>
                    </div>

                    <div>
                      <h3 className="font-semibold text-whatsapp-text-light dark:text-whatsapp-text-dark">
                        {getOtherParticipant(activeChat)?.name ||
                          "Unknown User"}
                      </h3>
                      <p className="text-xs text-whatsapp-gray-600 dark:text-whatsapp-gray-400">
                        {getOtherParticipant(activeChat)?.isOnline
                          ? "Online"
                          : "Offline"}
                        {getOtherParticipant(activeChat)?.lastSeen &&
                          !getOtherParticipant(activeChat)?.isOnline &&
                          ` • Last seen ${formatTime(getOtherParticipant(activeChat)?.lastSeen)}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {/* Voice Call */}
                    <button
                      onClick={() => {
                        const otherUser = getOtherParticipant(activeChat);
                        if (!otherUser) return;
                        startCall([otherUser._id], "voice", activeChat._id);
                      }}
                      className="p-2 rounded-lg hover:bg-whatsapp-gray-100 dark:hover:bg-whatsapp-gray-700"
                    >
                      <PhoneIcon className="h-6 w-6" />
                    </button>

                    {/* Video Call */}
                    <button
                      onClick={() => {
                        const otherUser = getOtherParticipant(activeChat);
                        if (!otherUser) return;
                        startCall([otherUser._id], "video", activeChat._id);
                      }}
                      className="p-2 rounded-lg hover:bg-whatsapp-gray-100 dark:hover:bg-whatsapp-gray-700"
                    >
                      <VideoCameraIcon className="h-6 w-6" />
                    </button>

                    <button className="p-2 rounded-lg hover:bg-whatsapp-gray-100 dark:hover:bg-whatsapp-gray-700">
                      <MagnifyingGlassIcon className="h-6 w-6" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Chat Messages Area */}
              <div className="flex-1 overflow-y-auto p-4 bg-whatsapp-bg-light dark:bg-whatsapp-bg-dark">
                <div className="max-w-3xl mx-auto">
                  <ChatMessages chatId={activeChat._id} />
                </div>
              </div>

              {/* Message Input */}
              <div className="border-t border-whatsapp-gray-200 dark:border-whatsapp-border-dark p-4 bg-white dark:bg-whatsapp-gray-800">
                <div className="max-w-3xl mx-auto">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => toast("Emoji picker coming soon!")}
                      className="p-2 rounded-lg hover:bg-whatsapp-gray-100 dark:hover:bg-whatsapp-gray-700"
                    >
                      <FaceSmileIcon className="h-6 w-6" />
                    </button>
                    <button
                      onClick={() => toast("Attachment feature coming soon!")}
                      className="p-2 rounded-lg hover:bg-whatsapp-gray-100 dark:hover:bg-whatsapp-gray-700"
                    >
                      <PaperClipIcon className="h-6 w-6" />
                    </button>

                    <div className="flex-1">
                      <MessageInput chatId={activeChat._id} />
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center bg-whatsapp-bg-light dark:bg-whatsapp-bg-dark">
              <div className="text-center max-w-md">
                <div className="w-24 h-24 mx-auto mb-6 bg-whatsapp-green-light/10 rounded-full flex items-center justify-center">
                  <ChatBubbleLeftRightIcon className="h-12 w-12 text-whatsapp-green-light" />
                </div>
                <h2 className="text-2xl font-semibold text-whatsapp-text-light dark:text-whatsapp-text-dark mb-2">
                  Welcome to WhatsApp Clone
                </h2>
                <p className="text-whatsapp-gray-600 dark:text-whatsapp-gray-400 mb-6">
                  Select a chat from the sidebar to start messaging, or create a
                  new chat.
                </p>
                <div className="space-y-3">
                  <button
                    onClick={() => setShowNewChatModal(true)}
                    className="w-full py-3 bg-whatsapp-green-light text-white rounded-lg hover:bg-whatsapp-green-dark transition-colors"
                  >
                    Start New Chat
                  </button>
                  <button
                    onClick={() => setShowNewGroupModal(true)}
                    className="w-full py-3 border border-whatsapp-green-light text-whatsapp-green-light rounded-lg hover:bg-whatsapp-green-light/10 transition-colors"
                  >
                    Create Group
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Incoming Call Modal */}
      <IncomingCallModal />
      {/* {incomingCall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-white p-6 rounded-xl w-80 text-center">
            <h3 className="text-lg font-semibold mb-2">
              Incoming {incomingCall.type} call
            </h3>
            <p className="mb-4">{incomingCall.initiator.name}</p>

            <div className="flex justify-between">
              <button
                onClick={() => rejectCall()}
                className="px-4 py-2 bg-red-500 text-white rounded"
              >
                Reject
              </button>

              <button
                onClick={() => answerCall()}
                className="px-4 py-2 bg-green-500 text-white rounded"
              >
                Accept
              </button>
            </div>
          </div>
        </div>
      )} */}

      {/* Translation Settings Modal */}
      <TranslationSettings
        isOpen={showTranslationSettings}
        onClose={() => setShowTranslationSettings(false)}
      />

      {/* New Chat Modal */}
      <NewChatModal
        isOpen={showNewChatModal}
        onClose={() => setShowNewChatModal(false)}
      />

      {/* New Group Modal */}
      <NewGroupModal
        isOpen={showNewGroupModal}
        onClose={() => setShowNewGroupModal(false)}
      />

      {/* Global Call Screen */}
      {activeCall && <CallScreen />}
    </div>
  );
};

export default MainLayout;
