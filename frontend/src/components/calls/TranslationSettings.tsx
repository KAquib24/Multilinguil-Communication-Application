import React, { useState } from 'react';
import { useCall } from '../../hooks/useCall';
import {
  LanguageIcon,
  ArrowRightIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';

const SUPPORTED_LANGUAGES = [
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
];

interface TranslationSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

const TranslationSettings: React.FC<TranslationSettingsProps> = ({ isOpen, onClose }) => {
  const {
    translationEnabled,
    sourceLanguage,
    targetLanguage,
    toggleTranslation,
    updateTranslationLanguages,
  } = useCall();
  
  const [localSource, setLocalSource] = useState(sourceLanguage);
  const [localTarget, setLocalTarget] = useState(targetLanguage);
  
  if (!isOpen) return null;
  
  const handleSave = () => {
    updateTranslationLanguages(localSource, localTarget);
    onClose();
  };
  
  const getLanguageName = (code: string) => {
    const lang = SUPPORTED_LANGUAGES.find(l => l.code === code);
    return lang ? `${lang.name} (${lang.nativeName})` : code;
  };
  
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />
      
      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div 
          className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-3">
              <LanguageIcon className="h-6 w-6 text-blue-500" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Translation Settings
              </h3>
            </div>
            
            {/* Toggle switch */}
            <div className="flex items-center">
              <span className="mr-3 text-sm text-gray-600 dark:text-gray-400">
                {translationEnabled ? 'On' : 'Off'}
              </span>
              <button
                onClick={toggleTranslation}
                className={`
                  relative inline-flex h-6 w-11 items-center rounded-full
                  ${translationEnabled ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}
                `}
              >
                <span className={`
                  inline-block h-4 w-4 transform rounded-full bg-white transition
                  ${translationEnabled ? 'translate-x-6' : 'translate-x-1'}
                `} />
              </button>
            </div>
          </div>
          
          {/* Content */}
          <div className="p-6">
            {translationEnabled ? (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Translate From
                  </label>
                  <div className="space-y-2">
                    {SUPPORTED_LANGUAGES.map((language) => (
                      <button
                        key={`source-${language.code}`}
                        onClick={() => setLocalSource(language.code)}
                        className={`
                          flex items-center justify-between w-full px-4 py-3 rounded-lg
                          transition-colors duration-200
                          ${localSource === language.code
                            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300'
                            : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                          }
                        `}
                      >
                        <div className="text-left">
                          <div className="font-medium">{language.name}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {language.nativeName}
                          </div>
                        </div>
                        {localSource === language.code && (
                          <CheckIcon className="h-5 w-5 text-blue-500" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Translate To
                  </label>
                  <div className="space-y-2">
                    {SUPPORTED_LANGUAGES.map((language) => (
                      <button
                        key={`target-${language.code}`}
                        onClick={() => setLocalTarget(language.code)}
                        className={`
                          flex items-center justify-between w-full px-4 py-3 rounded-lg
                          transition-colors duration-200
                          ${localTarget === language.code
                            ? 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-300'
                            : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                          }
                        `}
                      >
                        <div className="text-left">
                          <div className="font-medium">{language.name}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {language.nativeName}
                          </div>
                        </div>
                        {localTarget === language.code && (
                          <CheckIcon className="h-5 w-5 text-green-500" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                
                {/* Preview */}
                <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    Translation Preview
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm text-gray-900 dark:text-gray-100">
                      <span className="font-medium">Original:</span> Hello, how are you?
                    </div>
                    <div className="flex items-center text-gray-500">
                      <ArrowRightIcon className="h-4 w-4 mr-2" />
                      <span className="text-sm">
                        {getLanguageName(localSource)} → {getLanguageName(localTarget)}
                      </span>
                    </div>
                    <div className="text-sm text-gray-900 dark:text-gray-100">
                      <span className="font-medium">Translated:</span> Hola, ¿cómo estás?
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <LanguageIcon className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  Translation is Off
                </h4>
                <p className="text-gray-600 dark:text-gray-400">
                  Enable translation to automatically translate speech during calls.
                  This feature supports real-time translation between multiple languages.
                </p>
              </div>
            )}
          </div>
          
          {/* Footer */}
          <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            
            <div className="flex items-center space-x-3">
              {translationEnabled && (
                <button
                  onClick={handleSave}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                >
                  Save Settings
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TranslationSettings;

