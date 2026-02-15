import React, { useState, useEffect } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { Fragment } from "react";
import { useGetAllUsersQuery } from "../../features/users/userApi";
import { useGetContactsQuery } from "../../features/users/userApi";
import { useGetOrCreateChatMutation } from "../../features/chat/chatApi";
import {
  useGetFriendshipStatusQuery,
  useSendFriendRequestMutation,
  useAcceptFriendRequestMutation,
  useRejectFriendRequestMutation,
  useGetSentRequestsQuery,
  useGetReceivedRequestsQuery,
} from "../../features/users/friendRequestApi";

import { useDispatch, useSelector } from "react-redux"; // ADD useSelector
import { setActiveChat, addChat } from "../../features/chat/chatSlice";
import { selectCurrentUser } from "../../features/auth/authSlice"; // ADD this import
import {
  UserPlusIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  UserCircleIcon,
  CheckIcon,
  XMarkIcon as XIcon,
  ClockIcon,
  EnvelopeIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { User } from "../../features/auth/authApi";

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface FriendRequest {
  _id: string;
  from: User;
  to: User;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
  updatedAt: string;
}

const NewChatModal: React.FC<NewChatModalProps> = ({ isOpen, onClose }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTab, setSelectedTab] = useState<
    "users" | "contacts" | "requests"
  >("users");

  // Get current user from Redux
  const user = useSelector(selectCurrentUser); // ADD THIS LINE

  // Get all users - FIXED: using correct query
  const {
    data: usersData,
    isLoading: isLoadingUsers,
    refetch: refetchUsers,
  } = useGetAllUsersQuery({});
  const {
    data: contactsData,
    isLoading: isLoadingContacts,
    refetch: refetchContacts,
  } = useGetContactsQuery();

  // Friend request queries
  const {
    data: sentRequestsData,
    isLoading: isLoadingSentRequests,
    refetch: refetchSentRequests,
  } = useGetSentRequestsQuery();
  const {
    data: receivedRequestsData,
    isLoading: isLoadingReceivedRequests,
    refetch: refetchReceivedRequests,
  } = useGetReceivedRequestsQuery();

  // Friend request mutations
  const [sendFriendRequest] = useSendFriendRequestMutation();
  // const [cancelFriendRequest] = useCancelFriendRequestMutation();
  const [acceptFriendRequest] = useAcceptFriendRequestMutation();
  const [rejectFriendRequest] = useRejectFriendRequestMutation();
  const [getOrCreateChat] = useGetOrCreateChatMutation();

  const dispatch = useDispatch();

  // Debug logging
  useEffect(() => {
    if (isOpen) {
      console.log("Users Data:", usersData);
      console.log("Contacts Data:", contactsData);
      console.log("Current User:", user); // ADD THIS
    }
  }, [isOpen, usersData, contactsData, user]);

  // Refresh data when modal opens
  useEffect(() => {
    if (isOpen) {
      refetchUsers();
      refetchContacts();
      refetchSentRequests();
      refetchReceivedRequests();
    }
  }, [
    isOpen,
    refetchUsers,
    refetchContacts,
    refetchSentRequests,
    refetchReceivedRequests,
  ]);

  // Filter users - FIXED: using correct data structure
  const usersList = usersData?.data?.users || [];
  const filteredUsers = usersList.filter(
    (userItem: User) =>
      userItem?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      userItem?.email?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Filter contacts
  const contactsList = contactsData?.data?.contacts || [];
  const filteredContacts = contactsList.filter(
    (contact: User) =>
      contact?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact?.email?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Extract requests from responses
  const sentRequests = sentRequestsData?.data?.requests || [];
  const receivedRequests = receivedRequestsData?.data?.requests || [];

  // Filter sent requests based on search
  const filteredSentRequests = sentRequests.filter(
    (request: FriendRequest) =>
      request.to?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      request.to?.email?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Filter received requests based on search
  const filteredReceivedRequests = receivedRequests.filter(
    (request: FriendRequest) =>
      request.from?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      request.from?.email?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleSendFriendRequest = async (toUserId: string) => {
    if (toUserId === user?._id) {
      toast.error("You cannot send friend request to yourself");
      return;
    }

    try {
      await sendFriendRequest({ toUserId }).unwrap();
      toast.success("Friend request sent!");
      refetchSentRequests();
    } catch (error: any) {
      toast.error(error?.data?.message || "Failed to send friend request");
    }
  };

  const handleAcceptFriendRequest = async (requestId: string) => {
    try {
      const result = await acceptFriendRequest(requestId).unwrap();
      if (result.success) {
        toast.success("Friend request accepted!");
        refetchReceivedRequests();
        refetchContacts();
      } else {
        toast.error("Failed to accept friend request");
      }
    } catch (error: any) {
      toast.error(error?.data?.message || "Failed to accept friend request");
    }
  };

  const handleRejectFriendRequest = async (requestId: string) => {
    try {
      const result = await rejectFriendRequest(requestId).unwrap();
      if (result.success) {
        toast.success("Friend request rejected");
        refetchReceivedRequests();
      } else {
        toast.error("Failed to reject friend request");
      }
    } catch (error: any) {
      toast.error(error?.data?.message || "Failed to reject friend request");
    }
  };

  const handleStartChat = async (userId: string) => {
    try {
      const result = await getOrCreateChat(userId).unwrap();
      dispatch(addChat(result.data.chat));
dispatch(setActiveChat(result.data.chat));

      onClose();
      toast.success("Chat started!");
    } catch (error: any) {
      const errorMessage = error?.data?.message || "Failed to start chat";
      toast.error(errorMessage);
    }
  };

  // Friendship status component for each user
  const FriendshipStatus = ({ userId }: { userId: string }) => {
    const { data, isLoading } = useGetFriendshipStatusQuery(userId, {
      skip: !userId,
    });

    if (isLoading) {
      return <div className="h-8 w-24 bg-gray-200 rounded animate-pulse" />;
    }

    const friendship = data?.data?.status;

    // No relationship
    if (!friendship || friendship.status === "none") {
      return (
        <button
          onClick={() => handleSendFriendRequest(userId)}
          className="px-3 py-1 bg-whatsapp-green-light text-white text-sm rounded-lg hover:bg-whatsapp-green-dark"
        >
          Add Friend
        </button>
      );
    }

    switch (friendship.status) {
      case "friends":
        return (
          <button
            onClick={() => handleStartChat(userId)}
            className="px-3 py-1 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600"
          >
            Message
          </button>
        );

      case "pending_sent":
        return (
          <button className="px-3 py-1 bg-yellow-100 text-yellow-700 text-sm rounded-lg">
            Request Sent
          </button>
        );

      case "pending_received":
        return (
          <div className="flex gap-2">
            <button
              onClick={() =>
                friendship.requestId &&
                handleAcceptFriendRequest(friendship.requestId)
              }
              className="px-3 py-1 bg-green-500 text-white text-sm rounded-lg"
            >
              Accept
            </button>

            <button
              onClick={() =>
                friendship.requestId &&
                handleRejectFriendRequest(friendship.requestId)
              }
              className="px-3 py-1 bg-red-500 text-white text-sm rounded-lg"
            >
              Reject
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  const renderUserItem = (userItem: User) => (
    <div
      key={userItem._id}
      className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg"
    >
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-300 dark:bg-gray-600">
          {userItem.picture ? (
            <img
              src={userItem.picture}
              alt={userItem.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <UserCircleIcon className="h-6 w-6 text-gray-500 dark:text-gray-400" />
            </div>
          )}
        </div>
        <div>
          <p className="font-medium text-gray-900 dark:text-white">
            {userItem.name}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {userItem.email}
          </p>
          <p className="text-xs">
            {userItem.isOnline ? (
              <span className="text-green-500">Online</span>
            ) : (
              <span className="text-gray-400">Offline</span>
            )}
          </p>
        </div>
      </div>
      <FriendshipStatus userId={userItem._id} />
    </div>
  );

  const renderContactItem = (contact: User) => (
    <div
      key={contact._id}
      className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg cursor-pointer"
      onClick={() => handleStartChat(contact._id)}
    >
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-300 dark:bg-gray-600">
          {contact.picture ? (
            <img
              src={contact.picture}
              alt={contact.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <UserCircleIcon className="h-6 w-6 text-gray-500 dark:text-gray-400" />
            </div>
          )}
        </div>
        <div>
          <p className="font-medium text-gray-900 dark:text-white">
            {contact.name}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {contact.email}
          </p>
          <p className="text-xs">
            {contact.isOnline ? (
              <span className="text-green-500">Online</span>
            ) : (
              <span className="text-gray-400">Offline</span>
            )}
          </p>
        </div>
      </div>
      <button
        className="px-3 py-1 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600"
        onClick={(e) => {
          e.stopPropagation();
          handleStartChat(contact._id);
        }}
      >
        Message
      </button>
    </div>
  );

  const renderSentRequestItem = (request: FriendRequest) => (
    <div
      key={request._id}
      className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg"
    >
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-300 dark:bg-gray-600">
          {request.to?.picture ? (
            <img
              src={request.to.picture}
              alt={request.to.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <UserCircleIcon className="h-6 w-6 text-gray-500 dark:text-gray-400" />
            </div>
          )}
        </div>
        <div>
          <p className="font-medium text-gray-900 dark:text-white">
            {request.to?.name}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {request.to?.email}
          </p>
          <p className="text-xs text-yellow-600">
            Sent {new Date(request.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>
      <button
        // onClick={() => handleCancelFriendRequest(request._id)}
        className="px-3 py-1 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300"
      >
        Cancel
      </button>
    </div>
  );

  const renderReceivedRequestItem = (request: FriendRequest) => (
    <div
      key={request._id}
      className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg"
    >
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-300 dark:bg-gray-600">
          {request.from?.picture ? (
            <img
              src={request.from.picture}
              alt={request.from.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <UserCircleIcon className="h-6 w-6 text-gray-500 dark:text-gray-400" />
            </div>
          )}
        </div>
        <div>
          <p className="font-medium text-gray-900 dark:text-white">
            {request.from?.name}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {request.from?.email}
          </p>
          <p className="text-xs text-gray-400">
            Received {new Date(request.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>
      <div className="flex items-center space-x-2">
        <button
          onClick={() => handleAcceptFriendRequest(request._id)}
          className="px-3 py-1 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600"
        >
          Accept
        </button>
        <button
          onClick={() => handleRejectFriendRequest(request._id)}
          className="px-3 py-1 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600"
        >
          Reject
        </button>
      </div>
    </div>
  );

  const renderEmptyState = (message: string, subMessage?: string) => (
    <div className="text-center py-8">
      <UserCircleIcon className="h-12 w-12 mx-auto text-gray-400 mb-3" />
      <p className="text-gray-500 dark:text-gray-400">{message}</p>
      {subMessage && <p className="text-sm text-gray-400 mt-1">{subMessage}</p>}
    </div>
  );

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-50" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white dark:bg-whatsapp-gray-800 p-6 text-left align-middle shadow-xl transition-all">
                <div className="flex justify-between items-center mb-6">
                  <Dialog.Title
                    as="h3"
                    className="text-lg font-medium leading-6 text-gray-900 dark:text-white"
                  >
                    New Chat
                  </Dialog.Title>
                  <button
                    onClick={onClose}
                    className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                {/* Search Bar */}
                <div className="mb-6">
                  <div className="relative">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search users..."
                      className="w-full pl-10 pr-4 py-3 rounded-lg bg-gray-100 dark:bg-gray-700 border-none focus:ring-2 focus:ring-whatsapp-green-light focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4">
                  <button
                    onClick={() => setSelectedTab("users")}
                    className={`flex-1 py-2 text-center font-medium ${
                      selectedTab === "users"
                        ? "text-whatsapp-green-light border-b-2 border-whatsapp-green-light"
                        : "text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    Discover ({filteredUsers.length})
                  </button>
                  <button
                    onClick={() => setSelectedTab("contacts")}
                    className={`flex-1 py-2 text-center font-medium ${
                      selectedTab === "contacts"
                        ? "text-whatsapp-green-light border-b-2 border-whatsapp-green-light"
                        : "text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    Contacts ({filteredContacts.length})
                  </button>
                  <button
                    onClick={() => setSelectedTab("requests")}
                    className={`flex-1 py-2 text-center font-medium ${
                      selectedTab === "requests"
                        ? "text-whatsapp-green-light border-b-2 border-whatsapp-green-light"
                        : "text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    Requests (
                    {filteredReceivedRequests.length +
                      filteredSentRequests.length}
                    )
                  </button>
                </div>

                {/* Content based on selected tab */}
                <div className="max-h-96 overflow-y-auto">
                  {selectedTab === "users" &&
                    (isLoadingUsers ? (
                      <div className="flex justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-whatsapp-green-light"></div>
                      </div>
                    ) : filteredUsers.length === 0 ? (
                      renderEmptyState(
                        searchQuery ? "No users found" : "No users available",
                        searchQuery
                          ? "Try a different search term"
                          : "All users are already your contacts",
                      )
                    ) : (
                      filteredUsers.map(renderUserItem)
                    ))}

                  {selectedTab === "contacts" &&
                    (isLoadingContacts ? (
                      <div className="flex justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-whatsapp-green-light"></div>
                      </div>
                    ) : filteredContacts.length === 0 ? (
                      renderEmptyState(
                        "No contacts yet",
                        "Add friends from the Discover tab",
                      )
                    ) : (
                      filteredContacts.map(renderContactItem)
                    ))}

                  {selectedTab === "requests" && (
                    <div>
                      {/* Received Requests Section */}
                      <div className="mb-6">
                        <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center">
                          <EnvelopeIcon className="h-5 w-5 mr-2 text-blue-500" />
                          Received Requests ({filteredReceivedRequests.length})
                        </h4>
                        {isLoadingReceivedRequests ? (
                          <div className="flex justify-center py-4">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-whatsapp-green-light"></div>
                          </div>
                        ) : filteredReceivedRequests.length === 0 ? (
                          <div className="text-center py-4 border rounded-lg bg-gray-50 dark:bg-gray-700">
                            <p className="text-gray-500 dark:text-gray-400">
                              No pending requests
                            </p>
                          </div>
                        ) : (
                          filteredReceivedRequests.map(
                            renderReceivedRequestItem,
                          )
                        )}
                      </div>

                      {/* Sent Requests Section */}
                      <div>
                        <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center">
                          <ClockIcon className="h-5 w-5 mr-2 text-yellow-500" />
                          Sent Requests ({filteredSentRequests.length})
                        </h4>
                        {isLoadingSentRequests ? (
                          <div className="flex justify-center py-4">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-whatsapp-green-light"></div>
                          </div>
                        ) : filteredSentRequests.length === 0 ? (
                          <div className="text-center py-4 border rounded-lg bg-gray-50 dark:bg-gray-700">
                            <p className="text-gray-500 dark:text-gray-400">
                              No sent requests
                            </p>
                          </div>
                        ) : (
                          filteredSentRequests.map(renderSentRequestItem)
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                    {selectedTab === "users"
                      ? "Add friends to start chatting"
                      : selectedTab === "contacts"
                        ? "Click on a contact to start chatting"
                        : "Manage your friend requests"}
                  </p>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default NewChatModal;
