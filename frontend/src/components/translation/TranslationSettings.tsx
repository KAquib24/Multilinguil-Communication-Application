import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  setSourceLanguage,
  setTargetLanguage,
  setTranslationEnabled,
  selectSourceLanguage,
  selectTargetLanguage,
  selectTranslationEnabled,
} from '../../features/translation/translationSlice.js';
import { XMarkIcon } from '@heroicons/react/24/outline';

interface TranslationSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

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

const TranslationSettings: React.FC<TranslationSettingsProps> = ({ isOpen, onClose }) => {
  const dispatch = useDispatch();
  const sourceLanguage = useSelector(selectSourceLanguage);
  const targetLanguage = useSelector(selectTargetLanguage);
  const translationEnabled = useSelector(selectTranslationEnabled);

  const [localSource, setLocalSource] = useState(sourceLanguage);
  const [localTarget, setLocalTarget] = useState(targetLanguage);
  const [localEnabled, setLocalEnabled] = useState(translationEnabled);

  if (!isOpen) return null;

  const handleSave = () => {
    dispatch(setSourceLanguage(localSource));
    dispatch(setTargetLanguage(localTarget));
    dispatch(setTranslationEnabled(localEnabled));
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Translation Settings
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <span className="text-gray-700 dark:text-gray-300">Enable Translation</span>
            <button
              onClick={() => setLocalEnabled(!localEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                localEnabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  localEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {localEnabled && (
            <>
              {/* Source language */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Translate From
                </label>
                <select
                  value={localSource}
                  onChange={(e) => setLocalSource(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white"
                >
                  <option value="auto">Auto-detect</option>
                  {languages.map(lang => (
                    <option key={lang.code} value={lang.code}>
                      {lang.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Target language */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Translate To
                </label>
                <select
                  value={localTarget}
                  onChange={(e) => setLocalTarget(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white"
                >
                  {languages.map(lang => (
                    <option key={lang.code} value={lang.code}>
                      {lang.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end space-x-3 p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default TranslationSettings;