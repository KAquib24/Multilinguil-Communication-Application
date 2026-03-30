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
  ChevronDownIcon,
} from '@heroicons/react/24/outline';

interface LiveTranslationOverlayProps {
  callId: string;
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
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const subtitlesRef = useRef<HTMLDivElement>(null);

  const languages = [
    { code: 'en', name: 'English', flag: '🇺🇸', nativeName: 'English' },
    { code: 'es', name: 'Spanish', flag: '🇪🇸', nativeName: 'Español' },
    { code: 'fr', name: 'French', flag: '🇫🇷', nativeName: 'Français' },
    { code: 'de', name: 'German', flag: '🇩🇪', nativeName: 'Deutsch' },
    { code: 'zh', name: 'Chinese', flag: '🇨🇳', nativeName: '中文' },
    { code: 'hi', name: 'Hindi', flag: '🇮🇳', nativeName: 'हिन्दी' },
    { code: 'ar', name: 'Arabic', flag: '🇸🇦', nativeName: 'العربية' },
    { code: 'ru', name: 'Russian', flag: '🇷🇺', nativeName: 'Русский' },
    { code: 'pt', name: 'Portuguese', flag: '🇧🇷', nativeName: 'Português' },
    { code: 'ja', name: 'Japanese', flag: '🇯🇵', nativeName: '日本語' },
    { code: 'ko', name: 'Korean', flag: '🇰🇷', nativeName: '한국어' },
    { code: 'it', name: 'Italian', flag: '🇮🇹', nativeName: 'Italiano' },
    { code: 'nl', name: 'Dutch', flag: '🇳🇱', nativeName: 'Nederlands' },
    { code: 'pl', name: 'Polish', flag: '🇵🇱', nativeName: 'Polski' },
    { code: 'tr', name: 'Turkish', flag: '🇹🇷', nativeName: 'Türkçe' },
    { code: 'vi', name: 'Vietnamese', flag: '🇻🇳', nativeName: 'Tiếng Việt' },
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
    setShowLanguageModal(false);
  };

  const getSpeakerName = (speakerId: string) => {
    if (speakerId === currentUser?._id) return 'You';
    const participant = participants.find(p => p.userId === speakerId);
    return participant?.name || 'Unknown';
  };

  const getCurrentLanguage = () => {
    return languages.find(l => l.code === targetLang) || languages[0];
  };

  // Auto-scroll subtitles
  useEffect(() => {
    if (subtitlesRef.current) {
      subtitlesRef.current.scrollTop = subtitlesRef.current.scrollHeight;
    }
  }, [subtitles]);

  return (
    <>
      {/* Main Overlay */}
      <div className="fixed bottom-24 right-4 w-96 bg-gray-900 bg-opacity-95 backdrop-blur-sm rounded-xl shadow-2xl border border-gray-700 overflow-hidden z-50">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
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
            {/* Language selector button - now opens modal */}
            <button
              onClick={() => setShowLanguageModal(true)}
              className="flex items-center space-x-1 px-3 py-1.5 bg-gray-800 rounded-lg text-sm text-white hover:bg-gray-700"
            >
              <span className="text-lg mr-1">{getCurrentLanguage().flag}</span>
              <span>{getCurrentLanguage().code.toUpperCase()}</span>
              <ChevronDownIcon className="h-4 w-4 ml-1 text-gray-400" />
            </button>
            
            {/* Close button */}
            {onClose && (
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-gray-700"
              >
                <XMarkIcon className="h-4 w-4 text-gray-400" />
              </button>
            )}
          </div>
        </div>

        {/* Active speakers */}
        {activeSpeakers.length > 0 && (
          <div className="px-4 py-2 border-b border-gray-700 bg-gray-800 bg-opacity-50">
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
          className="h-72 overflow-y-auto p-4 space-y-3"
        >
          {subtitles.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-500">
              <LanguageIcon className="h-12 w-12 mb-3 opacity-50" />
              <p className="text-sm font-medium">No translations yet</p>
              <p className="text-xs text-center mt-2 text-gray-400">
                {isTranslating
                  ? 'Speak to see live translations'
                  : 'Click Start to enable translation'}
              </p>
            </div>
          ) : (
            subtitles.map((sub, index) => (
              <div
                key={`${sub.speakerId}-${index}`}
                className={`p-3 rounded-lg ${
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
        <div className="p-4 border-t border-gray-700 bg-gray-800">
          <div className="flex items-center justify-between">
            <button
              onClick={handleToggleTranslation}
              className={`flex items-center space-x-2 px-5 py-2.5 rounded-lg transition-colors font-medium ${
                isTranslating
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {isTranslating ? (
                <>
                  <SpeakerXMarkIcon className="h-5 w-5" />
                  <span>Stop</span>
                </>
              ) : (
                <>
                  <MicrophoneIcon className="h-5 w-5" />
                  <span>Start</span>
                </>
              )}
            </button>

            <div className="flex items-center space-x-2 text-sm text-gray-400">
              <SpeakerWaveIcon className="h-5 w-5" />
              <span>Auto-play</span>
            </div>
          </div>
        </div>
      </div>

      {/* Language Selection Modal - Full screen overlay */}
      {showLanguageModal && (
        <div className="fixed inset-0 z-[70] bg-black bg-opacity-90 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-2xl w-full max-w-md max-h-[80vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <h3 className="text-white text-lg font-semibold">Select Language</h3>
              <button
                onClick={() => setShowLanguageModal(false)}
                className="p-2 rounded-lg hover:bg-gray-700"
              >
                <XMarkIcon className="h-5 w-5 text-gray-400" />
              </button>
            </div>

            {/* Language List */}
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              <div className="grid grid-cols-1 gap-2">
                {languages.map(lang => (
                  <button
                    key={lang.code}
                    onClick={() => handleLanguageChange(lang.code)}
                    className={`flex items-center space-x-4 p-4 rounded-xl transition-all ${
                      targetLang === lang.code
                        ? 'bg-blue-600 ring-2 ring-blue-400'
                        : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                  >
                    <span className="text-3xl">{lang.flag}</span>
                    <div className="flex-1 text-left">
                      <div className="text-white font-medium">{lang.name}</div>
                      <div className="text-sm text-gray-400">{lang.nativeName}</div>
                    </div>
                    {targetLang === lang.code && (
                      <div className="w-2 h-2 bg-white rounded-full" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-700">
              <button
                onClick={() => setShowLanguageModal(false)}
                className="w-full py-3 bg-gray-700 hover:bg-gray-600 rounded-xl text-white font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default LiveTranslationOverlay;