import React, { useState, useRef, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useTranslation } from '../../hooks/useTranslation';
import {
  selectSourceLanguage,
  selectTargetLanguage,
  selectTranslationEnabled,
} from '../../features/translation/translationSlice';
import {
  LanguageIcon,
  SpeakerWaveIcon,
  ArrowPathIcon,
  XMarkIcon,
  ClipboardIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface TranslationOverlayProps {
  text?: string;
  onTranslate?: (translatedText: string) => void;
  onClose?: () => void;
  position?: { x: number; y: number };
}

const TranslationOverlay: React.FC<TranslationOverlayProps> = ({
  text = '',
  onTranslate,
  onClose,
  position = { x: 0, y: 0 },
}) => {
  const { 
    supportedLanguages, 
    getLanguageName,
    translateText: translateTextHook
  } = useTranslation();
  
  const reduxSourceLanguage = useSelector(selectSourceLanguage);
  const reduxTargetLanguage = useSelector(selectTargetLanguage);
  const translationEnabledRedux = useSelector(selectTranslationEnabled);
  
  const [isTranslating, setIsTranslating] = useState(false);
  const [translatedText, setTranslatedText] = useState('');
  const [detectedSourceLanguage, setDetectedSourceLanguage] = useState('');
  const [copied, setCopied] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  useEffect(() => {
    if (text) {
      handleTranslate();
    }
  }, [text]);
  
  const handleTranslate = async () => {
    if (!text || !translationEnabledRedux) return;
    
    setIsTranslating(true);
    try {
      // Use the hook's translateText function
      if (translateTextHook) {
        const result = await translateTextHook(text, {
          sourceLanguage: reduxSourceLanguage,
          targetLanguage: reduxTargetLanguage,
          saveToHistory: true
        });
        
        setTranslatedText(result.translatedText);
        setDetectedSourceLanguage(result.sourceLanguage);
        
        if (onTranslate) {
          onTranslate(result.translatedText);
        }
      } else {
        // Fallback mock translation
        const mockTranslation = text.split('').reverse().join('');
        setTranslatedText(mockTranslation);
        setDetectedSourceLanguage('en');
        
        if (onTranslate) {
          onTranslate(mockTranslation);
        }
      }
      
      setIsTranslating(false);
    } catch (error) {
      console.error('Translation failed:', error);
      toast.error('Translation failed');
      setIsTranslating(false);
    }
  };
  
  const handlePlayAudio = async () => {
    if (!translatedText || isPlaying) return;
    
    try {
      setIsPlaying(true);
      // In a real implementation, this would call text-to-speech API
      // For now, simulate with a timeout
      setTimeout(() => {
        setIsPlaying(false);
        toast.success('Audio played');
      }, 2000);
      
    } catch (error) {
      setIsPlaying(false);
      toast.error('Could not generate speech');
    }
  };
  
  const handleCopy = () => {
    navigator.clipboard.writeText(translatedText);
    setCopied(true);
    toast.success('Copied to clipboard');
    
    setTimeout(() => setCopied(false), 2000);
  };
  
  const handleSwap = () => {
    // Note: We can't directly swap languages here because setSourceLanguage
    // and setTargetLanguage aren't exposed. You'll need to either:
    // 1. Import and use the Redux actions directly
    // 2. Add these functions to the useTranslation hook
    // 3. Handle swap differently
    
    // For now, just swap the translation text and trigger re-translation
    const temp = translatedText;
    setTranslatedText(text);
    setDetectedSourceLanguage('');
    
    // Re-translate the original text
    if (text) {
      setTimeout(() => handleTranslate(), 100);
    }
  };
  
  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    }
  };
  
  const formatLanguagePair = () => {
    const sourceName = detectedSourceLanguage ? getLanguageName(detectedSourceLanguage) : 'Auto-detect';
    const targetName = getLanguageName(reduxTargetLanguage);
    return `${sourceName} → ${targetName}`;
  };
  
  // Import Redux actions directly if needed
  const { setSourceLanguage, setTargetLanguage } = useTranslation();
  
  const handleLanguageSwap = () => {
    // Swap languages using Redux actions
    const temp = reduxSourceLanguage;
    setSourceLanguage(reduxTargetLanguage);
    setTargetLanguage(temp);
    
    // Swap text display
    if (translatedText) {
      const tempText = translatedText;
      setTranslatedText(text);
      setDetectedSourceLanguage(reduxTargetLanguage);
      
      // Re-translate if there's original text
      if (text) {
        setTimeout(() => handleTranslate(), 100);
      }
    }
  };
  
  useEffect(() => {
    return () => {
      stopAudio();
    };
  }, []);
  
  if (!translationEnabledRedux) return null;
  
  return (
    <div
      className="absolute z-50 w-96 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700"
      style={{
        left: `${Math.min(position.x, window.innerWidth - 400)}px`,
        top: `${Math.min(position.y, window.innerHeight - 500)}px`,
      }}
    >
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <LanguageIcon className="h-5 w-5 text-blue-500" />
            <span className="font-medium text-gray-900 dark:text-white">
              Translation
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleLanguageSwap}
              className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              title="Swap languages"
            >
              <ArrowPathIcon className="h-4 w-4" />
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          {formatLanguagePair()}
        </div>
      </div>
      
      {/* Content */}
      <div className="p-4">
        {/* Original Text */}
        {text && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Original
              </span>
              {detectedSourceLanguage && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {getLanguageName(detectedSourceLanguage)}
                </span>
              )}
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <p className="text-gray-900 dark:text-white">{text}</p>
            </div>
          </div>
        )}
        
        {/* Translated Text */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
              Translation
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {getLanguageName(reduxTargetLanguage)}
            </span>
          </div>
          
          {isTranslating ? (
            <div className="p-8 text-center">
              <div className="inline-flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  Translating...
                </span>
              </div>
            </div>
          ) : translatedText ? (
            <div className="space-y-3">
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-gray-900 dark:text-white">{translatedText}</p>
              </div>
              
              {/* Actions */}
              <div className="flex items-center justify-between">
                <div className="flex space-x-2">
                  <button
                    onClick={handlePlayAudio}
                    disabled={isPlaying}
                    className={`
                      p-2 rounded-lg flex items-center space-x-1 text-sm font-medium
                      ${isPlaying
                        ? 'bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-300'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }
                    `}
                  >
                    <SpeakerWaveIcon className="h-4 w-4" />
                    <span>{isPlaying ? 'Playing...' : 'Listen'}</span>
                  </button>
                  
                  <button
                    onClick={handleCopy}
                    className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center space-x-1 text-sm font-medium"
                  >
                    {copied ? (
                      <>
                        <CheckIcon className="h-4 w-4 text-green-500" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <ClipboardIcon className="h-4 w-4" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                
                <button
                  onClick={handleTranslate}
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                >
                  Re-translate
                </button>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center">
              <LanguageIcon className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No translation available
              </p>
              <button
                onClick={handleTranslate}
                className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
              >
                Translate Now
              </button>
            </div>
          )}
        </div>
      </div>
      
      {/* Language Settings */}
      <div className="border-t border-gray-200 dark:border-gray-700 p-3">
        <div className="flex items-center justify-between">
          <select
            value={reduxSourceLanguage}
            onChange={(e) => setSourceLanguage(e.target.value)}
            className="text-xs bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1"
          >
            <option value="auto">Auto-detect</option>
            {supportedLanguages.map((lang: any) => (
              <option key={lang.code} value={lang.code}>
                {getLanguageName(lang.code)}
              </option>
            ))}
          </select>
          
          <ArrowPathIcon className="h-4 w-4 text-gray-400" />
          
          <select
            value={reduxTargetLanguage}
            onChange={(e) => setTargetLanguage(e.target.value)}
            className="text-xs bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1"
          >
            {supportedLanguages.map((lang: any) => (
              <option key={lang.code} value={lang.code}>
                {getLanguageName(lang.code)}
              </option>
            ))}
          </select>
        </div>
      </div>
      
      {/* Footer */}
      <div className="border-t border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-900">
        <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
          Translation feature
        </div>
      </div>
    </div>
  );
};

export default TranslationOverlay;