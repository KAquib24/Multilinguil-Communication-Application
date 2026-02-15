import React, { useEffect, useRef, useState } from 'react';
import { useLiveTranslation } from '../../hooks/useLiveTranslation';
import { useSelector } from 'react-redux';
import { selectCurrentUser } from '../../features/auth/authSlice';
import {
  MicrophoneIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  LanguageIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

interface LiveTranslationOverlayProps {
  callId: string; // This should be the MongoDB _id, not callId
  participants: Array<{
    userId: string;
    name: string;
    picture?: string;
  }>;
  onClose?: () => void;
}

const LiveTranslationOverlay: React.FC<LiveTranslationOverlayProps> = ({
  callId,
  participants,
  onClose,
}) => {
  const currentUser = useSelector(selectCurrentUser);
  const {
    isTranslating,
    activeSpeakers,
    subtitles,
    startTranslation,
    stopTranslation,
    changeLanguage,
  } = useLiveTranslation(callId);

  const [targetLang, setTargetLang] = useState('en');
  const [showLanguageSelector, setShowLanguageSelector] = useState(false);
  const subtitlesRef = useRef<HTMLDivElement>(null);

  const languages = [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'zh', name: 'Chinese' },
    { code: 'hi', name: 'Hindi' },
    { code: 'ar', name: 'Arabic' },
    { code: 'ru', name: 'Russian' },
    { code: 'pt', name: 'Portuguese' },
    { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' },
    { code: 'it', name: 'Italian' },
  ];

  const handleToggleTranslation = () => {
    if (isTranslating) {
      stopTranslation();
    } else {
      startTranslation();
    }
  };

  const handleLanguageChange = (langCode: string) => {
    setTargetLang(langCode);
    changeLanguage(langCode);
    setShowLanguageSelector(false);
  };

  const getSpeakerName = (speakerId: string) => {
    if (speakerId === currentUser?._id) return 'You';
    const participant = participants.find(p => p.userId === speakerId);
    return participant?.name || 'Unknown';
  };

  // Auto-scroll subtitles
  useEffect(() => {
    if (subtitlesRef.current) {
      subtitlesRef.current.scrollTop = subtitlesRef.current.scrollHeight;
    }
  }, [subtitles]);

  return (
    <div className="fixed bottom-24 right-4 w-80 bg-gray-900 bg-opacity-95 backdrop-blur-sm rounded-xl shadow-2xl border border-gray-700 overflow-hidden z-50">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-700">
        <div className="flex items-center space-x-2">
          <LanguageIcon className="h-5 w-5 text-blue-400" />
          <h3 className="text-white font-medium">Live Translation</h3>
          {isTranslating && (
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-xs text-red-400">LIVE</span>
            </div>
          )}
        </div>
        <div className="flex items-center space-x-2">
          {/* Language selector */}
          <div className="relative">
            <button
              onClick={() => setShowLanguageSelector(!showLanguageSelector)}
              className="px-2 py-1 bg-gray-800 rounded text-sm text-white hover:bg-gray-700"
            >
              {targetLang.toUpperCase()}
            </button>
            
            {showLanguageSelector && (
              <div className="absolute bottom-full right-0 mb-2 w-48 max-h-60 overflow-y-auto bg-gray-800 rounded-lg shadow-xl border border-gray-700">
                {languages.map(lang => (
                  <button
                    key={lang.code}
                    onClick={() => handleLanguageChange(lang.code)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-700 ${
                      targetLang === lang.code ? 'bg-blue-600 text-white' : 'text-gray-300'
                    }`}
                  >
                    {lang.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          
          {/* Close button */}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-gray-700"
            >
              <XMarkIcon className="h-4 w-4 text-gray-400" />
            </button>
          )}
        </div>
      </div>

      {/* Active speakers */}
      {activeSpeakers.length > 0 && (
        <div className="px-3 py-2 border-b border-gray-700 bg-gray-800 bg-opacity-50">
          <div className="text-xs text-gray-400 mb-1">Speaking now:</div>
          <div className="flex flex-wrap gap-2">
            {activeSpeakers.map(speakerId => {
              const speaker = participants.find(p => p.userId === speakerId);
              return (
                <div
                  key={speakerId}
                  className="flex items-center space-x-1 px-2 py-1 bg-green-900 bg-opacity-50 rounded-full"
                >
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-xs text-green-300">
                    {speaker?.name || 'Unknown'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Subtitles area */}
      <div
        ref={subtitlesRef}
        className="h-64 overflow-y-auto p-3 space-y-3"
      >
        {subtitles.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-500">
            <LanguageIcon className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">No translations yet</p>
            <p className="text-xs text-center mt-1">
              {isTranslating
                ? 'Speak to see live translations'
                : 'Click Start to enable translation'}
            </p>
          </div>
        ) : (
          subtitles.map((sub, index) => (
            <div
              key={`${sub.speakerId}-${index}`}
              className={`p-2 rounded-lg ${
                sub.isFinal
                  ? 'bg-gray-800'
                  : 'bg-gray-800 bg-opacity-50 border border-blue-500 border-opacity-30'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-blue-400">
                  {getSpeakerName(sub.speakerId)}
                </span>
                {!sub.isFinal && (
                  <span className="text-xs text-yellow-500">...</span>
                )}
              </div>
              <p className="text-sm text-white mb-1">{sub.original}</p>
              <p className="text-sm text-green-400">{sub.translated}</p>
            </div>
          ))
        )}
      </div>

      {/* Controls */}
      <div className="p-3 border-t border-gray-700 bg-gray-800">
        <div className="flex items-center justify-between">
          <button
            onClick={handleToggleTranslation}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
              isTranslating
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {isTranslating ? (
              <>
                <SpeakerXMarkIcon className="h-4 w-4" />
                <span>Stop</span>
              </>
            ) : (
              <>
                <MicrophoneIcon className="h-4 w-4" />
                <span>Start</span>
              </>
            )}
          </button>

          <div className="flex items-center space-x-2 text-xs text-gray-400">
            <SpeakerWaveIcon className="h-4 w-4" />
            <span>Auto-play</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveTranslationOverlay;