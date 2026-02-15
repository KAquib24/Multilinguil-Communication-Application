import React, { useState, useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { useTranslation } from '../../hooks/useTranslation';
import { useSocket } from '../../context/SocketContext';
import {
  selectTranslationEnabled,
  selectSourceLanguage,
  selectTargetLanguage,
} from '../../features/translation/translationSlice';
import {
  MicrophoneIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  LanguageIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  XMarkIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';

interface RealTimeTranslationProps {
  callId?: string;
  chatId?: string;
  participants?: string[];
  compact?: boolean;
  onClose?: () => void;
}

interface TranslationSegment {
  id: string;
  text: string;
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  confidence: number;
  timestamp: string;
  userId?: string;
}

const RealTimeTranslation: React.FC<RealTimeTranslationProps> = ({
  callId,
  chatId,
  participants = [],
  compact = false,
  onClose,
}) => {
  const {
    sourceLanguage,
    targetLanguage,
    translationEnabled,
    isRecording,
    currentSessionId,
    setSourceLanguage,
    setTargetLanguage,
    swapLanguages,
    getLanguageName,
    startRealTimeTranslation,
    stopRealTimeTranslation,
    createTranslationSession,
    playAudio,
    isTranslationActive,
  } = useTranslation();
  
  const { socket } = useSocket();
  
  const [availableLanguages, setAvailableLanguages] = useState<any[]>([]);
  const [segments, setSegments] = useState<TranslationSegment[]>([]);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [audioQueue, setAudioQueue] = useState<any[]>([]);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  
  const segmentsRef = useRef<HTMLDivElement>(null);
  
  // Load available languages
  useEffect(() => {
    const languages = [
      { code: 'en', name: 'English', nativeName: 'English' },
      { code: 'es', name: 'Spanish', nativeName: 'Español' },
      { code: 'fr', name: 'French', nativeName: 'Français' },
      { code: 'de', name: 'German', nativeName: 'Deutsch' },
      { code: 'zh', name: 'Chinese', nativeName: '中文' },
      { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
      { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
      { code: 'ru', name: 'Russian', nativeName: 'Русский' },
      { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
      { code: 'ja', name: 'Japanese', nativeName: '日本語' },
      { code: 'ko', name: 'Korean', nativeName: '한국어' },
      { code: 'it', name: 'Italian', nativeName: 'Italiano' },
      { code: 'nl', name: 'Dutch', nativeName: 'Nederlands' },
      { code: 'pl', name: 'Polish', nativeName: 'Polski' },
    ];
    
    setAvailableLanguages(languages);
  }, []);
  
  // Initialize session
  useEffect(() => {
    const initializeSession = async () => {
      if (callId && participants.length > 0 && !currentSessionId) {
        try {
          const session = await createTranslationSession(participants, callId, chatId);
          
          if (socket && session) {
            socket.emit('translation:start', {
              sessionId: session.sessionId,
              callId,
              sourceLanguage,
              targetLanguage,
            });
            
            setIsSessionActive(true);
          }
        } catch (error) {
          console.error('Failed to initialize session:', error);
        }
      }
    };
    
    if (translationEnabled) {
      initializeSession();
    }
    
    return () => {
      if (socket && currentSessionId) {
        socket.emit('translation:stop', {
          sessionId: currentSessionId,
          callId,
        });
      }
    };
  }, [callId, participants, translationEnabled, socket, currentSessionId, createTranslationSession, sourceLanguage, targetLanguage, chatId]);
  
  // Socket listeners
  useEffect(() => {
    if (!socket) return;
    
    // Translation results
    socket.on('translation:result', (data: any) => {
      const { translation, userId, timestamp, sessionId } = data;
      
      if (sessionId !== currentSessionId) return;
      
      const newSegment: TranslationSegment = {
        id: Date.now().toString(),
        text: translation.originalText,
        translatedText: translation.translatedText,
        sourceLanguage: translation.sourceLanguage || sourceLanguage,
        targetLanguage: translation.targetLanguage || targetLanguage,
        confidence: translation.confidence,
        timestamp: timestamp || new Date().toISOString(),
        userId,
      };
      
      setSegments(prev => [...prev, newSegment]);
      
      // Add to audio queue if audio is available
      if (translation.translatedAudio) {
        setAudioQueue(prev => [...prev, {
          id: newSegment.id,
          text: translation.translatedText,
          audioUrl: translation.translatedAudio,
          language: targetLanguage,
        }]);
      }
    });
    
    // Session events
    socket.on('translation:started', (data: any) => {
      if (data.sessionId === currentSessionId) {
        setIsSessionActive(true);
      }
    });
    
    socket.on('translation:stopped', (data: any) => {
      if (data.sessionId === currentSessionId) {
        setIsSessionActive(false);
      }
    });
    
    return () => {
      socket.off('translation:result');
      socket.off('translation:started');
      socket.off('translation:stopped');
    };
  }, [socket, currentSessionId, sourceLanguage, targetLanguage]);
  
  // Auto-scroll segments
  useEffect(() => {
    if (segmentsRef.current) {
      segmentsRef.current.scrollTop = segmentsRef.current.scrollHeight;
    }
  }, [segments]);
  
  // Handle recording toggle
  const handleRecordingToggle = async () => {
    if (isRecording) {
      await stopRealTimeTranslation();
    } else if (currentSessionId) {
      await startRealTimeTranslation(currentSessionId, callId);
    }
  };
  
  // Play audio from queue
  const playNextAudio = async () => {
    if (audioQueue.length > 0 && !isPlayingAudio) {
      const nextAudio = audioQueue[0];
      setIsPlayingAudio(true);
      
      try {
        const audio = playAudio(nextAudio.audioUrl);
        audio.onended = () => {
          setIsPlayingAudio(false);
          setAudioQueue(prev => prev.slice(1));
        };
        audio.onerror = () => {
          setIsPlayingAudio(false);
          setAudioQueue(prev => prev.slice(1));
        };
      } catch (error) {
        console.error('Failed to play audio:', error);
        setIsPlayingAudio(false);
        setAudioQueue(prev => prev.slice(1));
      }
    }
  };
  
  // Clear segments
  const clearSegments = () => {
    setSegments([]);
    setAudioQueue([]);
  };
  
  // Copy text to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };
  
  // Compact view for call screen
  if (compact) {
    return (
      <div className="flex items-center space-x-2">
        {/* Status indicator */}
        {isRecording && (
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-xs text-red-500">Translating</span>
          </div>
        )}
        
        {isPlayingAudio && (
          <div className="flex items-center space-x-1">
            <SpeakerWaveIcon className="h-3 w-3 text-green-500 animate-pulse" />
            <span className="text-xs text-green-500">Playing</span>
          </div>
        )}
        
        {/* Language display */}
        <div className="flex items-center space-x-1 text-sm">
          <span className="font-medium">{sourceLanguage.toUpperCase()}</span>
          <ArrowPathIcon className="h-3 w-3" />
          <span className="font-medium">{targetLanguage.toUpperCase()}</span>
        </div>
        
        {/* Recording toggle */}
        <button
          onClick={handleRecordingToggle}
          disabled={!currentSessionId}
          className={`p-2 rounded-full ${
            isRecording
              ? 'bg-red-100 text-red-600 hover:bg-red-200'
              : currentSessionId
                ? 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          {isRecording ? (
            <MicrophoneIcon className="h-4 w-4" />
          ) : (
            <MicrophoneIcon className="h-4 w-4" />
          )}
        </button>
        
        {/* Close button */}
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }
  
  // Full view
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <LanguageIcon className="h-6 w-6 text-blue-500" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Live Translation
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {isSessionActive ? 'Session active' : 'Session not active'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            {/* Session status */}
            <div className={`px-2 py-1 rounded text-xs font-medium ${
              isSessionActive 
                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
            }`}>
              {isSessionActive ? 'Active' : 'Inactive'}
            </div>
            
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      </div>
      
      {/* Content */}
      <div className="p-4">
        {/* Language selection */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                From
              </label>
              <div className="relative">
                <select
                  value={sourceLanguage}
                  onChange={(e) => setSourceLanguage(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={isRecording}
                >
                  {availableLanguages.map((lang) => (
                    <option key={`source-${lang.code}`} value={lang.code}>
                      {lang.name} ({lang.nativeName})
                    </option>
                  ))}
                </select>
                <ChevronDownIcon className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              </div>
            </div>
            
            {/* Swap button */}
            <div className="mx-4 pt-6">
              <button
                onClick={swapLanguages}
                disabled={isRecording}
                className="p-2 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
              >
                <ArrowPathIcon className="h-5 w-5 text-gray-600 dark:text-gray-300" />
              </button>
            </div>
            
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                To
              </label>
              <div className="relative">
                <select
                  value={targetLanguage}
                  onChange={(e) => setTargetLanguage(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={isRecording}
                >
                  {availableLanguages.map((lang) => (
                    <option key={`target-${lang.code}`} value={lang.code}>
                      {lang.name} ({lang.nativeName})
                    </option>
                  ))}
                </select>
                <ChevronDownIcon className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              </div>
            </div>
          </div>
          
          {/* Language preview */}
          <div className="text-center text-sm text-gray-600 dark:text-gray-400">
            {getLanguageName(sourceLanguage)} → {getLanguageName(targetLanguage)}
          </div>
        </div>
        
        {/* Controls */}
        <div className="flex items-center justify-center space-x-6 mb-6">
          {/* Record button */}
          <button
            onClick={handleRecordingToggle}
            disabled={!currentSessionId}
            className={`flex flex-col items-center ${
              isRecording 
                ? 'text-red-600' 
                : currentSessionId 
                  ? 'text-blue-600 dark:text-blue-400' 
                  : 'text-gray-400'
            }`}
          >
            <div className={`
              h-14 w-14 rounded-full flex items-center justify-center mb-2
              ${isRecording
                ? 'bg-red-100 dark:bg-red-900/30 animate-pulse'
                : currentSessionId
                  ? 'bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-800/30'
                  : 'bg-gray-100 dark:bg-gray-700'
              }
            `}>
              {isRecording ? (
                <MicrophoneIcon className="h-6 w-6" />
              ) : (
                <MicrophoneIcon className="h-6 w-6" />
              )}
            </div>
            <span className="text-sm font-medium">
              {isRecording ? 'Stop' : 'Start'} Translating
            </span>
          </button>
          
          {/* Play audio button */}
          <button
            onClick={playNextAudio}
            disabled={audioQueue.length === 0 || isPlayingAudio}
            className={`flex flex-col items-center ${
              audioQueue.length > 0 && !isPlayingAudio
                ? 'text-green-600 dark:text-green-400'
                : 'text-gray-400'
            }`}
          >
            <div className={`
              h-14 w-14 rounded-full flex items-center justify-center mb-2
              ${audioQueue.length > 0 && !isPlayingAudio
                ? 'bg-green-100 dark:bg-green-900/30 hover:bg-green-200 dark:hover:bg-green-800/30'
                : 'bg-gray-100 dark:bg-gray-700'
              }
            `}>
              {isPlayingAudio ? (
                <SpeakerWaveIcon className="h-6 w-6 animate-pulse" />
              ) : (
                <SpeakerXMarkIcon className="h-6 w-6" />
              )}
            </div>
            <span className="text-sm font-medium">
              {audioQueue.length > 0 ? `Play (${audioQueue.length})` : 'Play'}
            </span>
          </button>
        </div>
        
        {/* Translation segments */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Translation Log
            </h4>
            {segments.length > 0 && (
              <button
                onClick={clearSegments}
                className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                Clear
              </button>
            )}
          </div>
          
          <div 
            ref={segmentsRef}
            className="h-64 overflow-y-auto bg-gray-50 dark:bg-gray-900 rounded-lg p-3 space-y-3"
          >
            {segments.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400">
                <ClockIcon className="h-8 w-8 mb-2" />
                <p className="text-sm">No translations yet</p>
                <p className="text-xs">Start speaking to see translations here</p>
              </div>
            ) : (
              segments.slice().reverse().map((segment) => (
                <div
                  key={segment.id}
                  className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 rounded">
                        {segment.sourceLanguage.toUpperCase()}
                      </span>
                      <span className="text-gray-400">→</span>
                      <span className="text-xs px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-300 rounded">
                        {segment.targetLanguage.toUpperCase()}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500">
                      {format(new Date(segment.timestamp), 'HH:mm:ss')}
                    </span>
                  </div>
                  
                  <div className="mb-2">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                      {segment.text}
                    </p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {segment.translatedText}
                    </p>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">
                      Confidence: {(segment.confidence * 100).toFixed(1)}%
                    </span>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => copyToClipboard(segment.translatedText)}
                        className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        
        {/* Status bar */}
        <div className="flex items-center justify-between text-sm">
          <div className="text-gray-600 dark:text-gray-400">
            {segments.length} translations
          </div>
          <div className="flex items-center space-x-2">
            {isRecording && (
              <div className="flex items-center space-x-1 text-red-500">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span>Recording</span>
              </div>
            )}
            {isPlayingAudio && (
              <div className="flex items-center space-x-1 text-green-500">
                <SpeakerWaveIcon className="h-3 w-3 animate-pulse" />
                <span>Playing</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RealTimeTranslation;