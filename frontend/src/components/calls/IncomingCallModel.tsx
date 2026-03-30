import React from 'react';
import { useSelector } from 'react-redux';
import { useCall } from '../../hooks/useCall.js';
import { selectIncomingCall } from '../../features/calls/callSlice.js';
import {
  PhoneIcon,
  PhoneXMarkIcon,
  VideoCameraIcon,
} from '@heroicons/react/24/outline';

const IncomingCallModal: React.FC = () => {
  const incomingCall = useSelector(selectIncomingCall);
  const { answerCall, rejectCall } = useCall();

  // 🔴 VERY IMPORTANT: modal renders ONLY when there is an incoming call
  if (!incomingCall) return null;

  const { initiator, type } = incomingCall;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 w-full max-w-sm shadow-2xl">
        <div className="text-center">
          {/* Caller Avatar */}
          <div className="mb-6">
            {initiator?.picture ? (
              <img
                src={initiator.picture}
                alt={initiator.name}
                className="w-24 h-24 rounded-full mx-auto mb-4 border-4 border-green-200"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-gray-200 mx-auto mb-4 flex items-center justify-center">
                <VideoCameraIcon className="h-12 w-12 text-gray-600" />
              </div>
            )}

            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
              {initiator?.name || 'Unknown User'}
            </h3>

            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {type === 'video'
                ? 'Incoming video call'
                : 'Incoming voice call'}
            </p>
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-center gap-10">
            {/* Reject */}
            <button
              onClick={() => rejectCall()}
              className="flex flex-col items-center"
            >
              <div className="h-16 w-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center mb-2">
                <PhoneXMarkIcon className="h-8 w-8 text-white" />
              </div>
              <span className="text-sm text-red-500 font-medium">
                Decline
              </span>
            </button>

            {/* Accept */}
            <button
              onClick={() => answerCall()}
              className="flex flex-col items-center"
            >
              <div className="h-16 w-16 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center mb-2">
                <PhoneIcon className="h-8 w-8 text-white" />
              </div>
              <span className="text-sm text-green-500 font-medium">
                Accept
              </span>
            </button>
          </div>

          {/* Call Type */}
          <div className="mt-6 flex items-center justify-center gap-2 text-gray-500 dark:text-gray-400">
            {type === 'video' ? (
              <VideoCameraIcon className="h-5 w-5" />
            ) : (
              <PhoneIcon className="h-5 w-5" />
            )}
            <span className="text-sm">
              {type === 'video' ? 'Video Call' : 'Voice Call'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IncomingCallModal;
