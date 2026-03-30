import React, { useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { useGetContactsQuery } from '../../features/users/userApi.js';
import { useCreateGroupMutation } from '../../features/chat/chatApi.js';
import { useDispatch } from 'react-redux';
import { setActiveChat } from '../../features/chat/chatSlice.js';
import { XMarkIcon, UserGroupIcon, UserCircleIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { User } from '../../features/auth/authApi.js';

interface NewGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const NewGroupModal: React.FC<NewGroupModalProps> = ({ isOpen, onClose }) => {
  const [groupName, setGroupName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  
  const { data: contactsData, isLoading } = useGetContactsQuery();
  const [createGroup] = useCreateGroupMutation();
  const dispatch = useDispatch();
  
  const filteredContacts = contactsData?.data?.contacts?.filter((contact: User) =>
    contact?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    contact?.email?.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];
  
  const toggleUserSelection = (userId: string) => {
    setSelectedUsers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };
  
  const handleCreateGroup = async () => {
  if (!groupName.trim()) {
    toast.error('Please enter a group name');
    return;
  }
  
  if (selectedUsers.length === 0) {
    toast.error('Please select at least one user');
    return;
  }
  
  try {
    const result = await createGroup({
      name: groupName,
      participants: selectedUsers,
    }).unwrap();
    
    // FIX: Access result.chat directly, not result.data.chat
    dispatch(setActiveChat(result.chat));
    onClose();
    toast.success('Group created successfully');
    
  } catch (error: any) {
    const errorMessage = error?.data?.message || 'Failed to create group';
    toast.error(errorMessage);
  }
};
  
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
                  <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900 dark:text-white">
                    Create New Group
                  </Dialog.Title>
                  <button
                    onClick={onClose}
                    className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>
                
                {/* Group Name Input */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Group Name
                  </label>
                  <input
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="Enter group name"
                    className="w-full px-4 py-3 rounded-lg bg-gray-100 dark:bg-gray-700 border-none focus:ring-2 focus:ring-whatsapp-green-light focus:border-transparent"
                  />
                </div>
                
                {/* Search Contacts */}
                <div className="mb-4">
                  <div className="relative">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search contacts..."
                      className="w-full pl-10 pr-4 py-3 rounded-lg bg-gray-100 dark:bg-gray-700 border-none focus:outline-none focus:ring-2 focus:ring-whatsapp-green-light focus:border-transparent"
                    />
                  </div>
                </div>
                
                {/* Selected Users Preview */}
                {selectedUsers.length > 0 && (
                  <div className="mb-4">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Selected ({selectedUsers.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {selectedUsers.map(userId => {
                        const contact = contactsData?.data?.contacts?.find((c: User) => c._id === userId);
                        return contact ? (
                          <div
                            key={userId}
                            className="flex items-center bg-whatsapp-green-light/10 text-whatsapp-green-light px-3 py-1 rounded-full"
                          >
                            <span className="text-sm">{contact.name}</span>
                            <button
                              onClick={() => toggleUserSelection(userId)}
                              className="ml-2 text-whatsapp-green-light hover:text-whatsapp-green-dark"
                            >
                              ×
                            </button>
                          </div>
                        ) : null;
                      })}
                    </div>
                  </div>
                )}
                
                {/* Contacts List */}
                <div className="max-h-64 overflow-y-auto mb-6">
                  {isLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-whatsapp-green-light"></div>
                    </div>
                  ) : filteredContacts.length === 0 ? (
                    <div className="text-center py-8">
                      <UserGroupIcon className="h-12 w-12 mx-auto text-gray-400 mb-3" />
                      <p className="text-gray-500 dark:text-gray-400">
                        {searchQuery ? 'No contacts found' : 'No contacts available'}
                      </p>
                      <p className="text-sm text-gray-400 mt-1">
                        Add users to your contacts first
                      </p>
                    </div>
                  ) : (
                    filteredContacts.map((contact: User) => (
                      <div
                        key={contact._id}
                        className="flex items-center p-3 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      >
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
                        <div className="ml-3 flex-1">
                          <p className="font-medium text-gray-900 dark:text-white">{contact.name}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">{contact.email}</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={selectedUsers.includes(contact._id)}
                          onChange={() => toggleUserSelection(contact._id)}
                          className="h-5 w-5 rounded border-gray-300 text-whatsapp-green-light focus:ring-whatsapp-green-light cursor-pointer"
                        />
                      </div>
                    ))
                  )}
                </div>
                
                {/* Action Buttons */}
                <div className="flex space-x-3">
                  <button
                    onClick={onClose}
                    className="flex-1 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateGroup}
                    disabled={!groupName.trim() || selectedUsers.length === 0}
                    className={`flex-1 py-3 rounded-lg transition-colors ${
                      groupName.trim() && selectedUsers.length > 0
                        ? 'bg-whatsapp-green-light hover:bg-whatsapp-green-dark text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    Create Group
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default NewGroupModal;