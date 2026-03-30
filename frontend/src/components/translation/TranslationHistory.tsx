import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { useTranslation } from '../../hooks/useTranslation.js';
import { selectTranslationHistory } from '../../features/translation/translationSlice.js';
import {
  ClockIcon,
  DocumentDuplicateIcon,
  TrashIcon,
  SpeakerWaveIcon,
  LanguageIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';

interface TranslationHistoryProps {
  maxItems?: number;
  showHeader?: boolean;
}

const TranslationHistory: React.FC<TranslationHistoryProps> = ({ 
  maxItems = 10, 
  showHeader = true 
}) => {
  const translationHistory = useSelector(selectTranslationHistory);
  const { getLanguageName, textToSpeech, playAudio } = useTranslation();
  
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [filterLanguage, setFilterLanguage] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Get unique languages from history
  const uniqueLanguages = Array.from(
    new Set(translationHistory.map(item => item.sourceLang).concat(
      translationHistory.map(item => item.targetLang)
    ))
  );
  
  // Filter history
  const filteredHistory = translationHistory
    .filter(item => {
      if (filterLanguage !== 'all' && item.sourceLang !== filterLanguage && item.targetLang !== filterLanguage) {
        return false;
      }
      
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return item.original.toLowerCase().includes(query) || 
               item.translated.toLowerCase().includes(query);
      }
      
      return true;
    })
    .slice(0, maxItems);
  
  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    // You could add a toast notification here
  };
  
  const handlePlayAudio = async (text: string, language: string) => {
    try {
      const result = await textToSpeech(text, language);
      if (result.audioUrl) {
        playAudio(result.audioUrl);
      }
    } catch (error) {
      console.error('Failed to play audio:', error);
    }
  };
  
  const toggleExpand = (id: string) => {
    setExpandedItem(expandedItem === id ? null : id);
  };
  
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return 'text-green-500';
    if (confidence >= 0.7) return 'text-yellow-500';
    return 'text-red-500';
  };
  
  const getConfidenceText = (confidence: number) => {
    if (confidence >= 0.9) return 'High';
    if (confidence >= 0.7) return 'Medium';
    return 'Low';
  };
  
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg">
      {/* Header */}
      {showHeader && (
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <ClockIcon className="h-5 w-5 text-gray-500" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Translation History
              </h3>
              <span className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded-full">
                {translationHistory.length}
              </span>
            </div>
          </div>
          
          {/* Filters */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Search */}
            <div>
              <input
                type="text"
                placeholder="Search translations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            {/* Language filter */}
            <div className="relative">
              <select
                value={filterLanguage}
                onChange={(e) => setFilterLanguage(e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
              >
                <option value="all">All Languages</option>
                {uniqueLanguages.map(lang => (
                  <option key={lang} value={lang}>
                    {getLanguageName(lang)}
                  </option>
                ))}
              </select>
              <ChevronDownIcon className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>
      )}
      
      {/* History list */}
      <div className="divide-y divide-gray-200 dark:divide-gray-700 max-h-96 overflow-y-auto">
        {filteredHistory.length === 0 ? (
          <div className="p-8 text-center">
            <LanguageIcon className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">
              No translation history yet
            </p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
              Your translations will appear here
            </p>
          </div>
        ) : (
          filteredHistory.map((item) => (
            <div key={item.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50">
              {/* Header */}
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="text-xs font-medium px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 rounded">
                      {item.sourceLang.toUpperCase()}
                    </span>
                    <span className="text-gray-400">→</span>
                    <span className="text-xs font-medium px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-300 rounded">
                      {item.targetLang.toUpperCase()}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded ${getConfidenceColor(item.confidence)} bg-opacity-20`}>
                      {getConfidenceText(item.confidence)} ({Math.round(item.confidence * 100)}%)
                    </span>
                  </div>
                  
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {format(new Date(item.timestamp), 'MMM d, h:mm a')}
                  </div>
                </div>
                
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => toggleExpand(item.id)}
                    className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {expandedItem === item.id ? (
                      <ChevronUpIcon className="h-4 w-4" />
                    ) : (
                      <ChevronDownIcon className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
              
              {/* Original text (collapsed view) */}
              <div className="mb-2">
                <p className="text-gray-700 dark:text-gray-300 line-clamp-2">
                  {item.original}
                </p>
              </div>
              
              {/* Expanded view */}
              {expandedItem === item.id && (
                <div className="mt-3 space-y-3">
                  {/* Original text with actions */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        Original ({getLanguageName(item.sourceLang)})
                      </span>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleCopyText(item.original)}
                          className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                        >
                          <DocumentDuplicateIcon className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => handlePlayAudio(item.original, item.sourceLang)}
                          className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                        >
                          <SpeakerWaveIcon className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                      <p className="text-gray-900 dark:text-white">{item.original}</p>
                    </div>
                  </div>
                  
                  {/* Translated text with actions */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        Translated ({getLanguageName(item.targetLang)})
                      </span>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleCopyText(item.translated)}
                          className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                        >
                          <DocumentDuplicateIcon className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => handlePlayAudio(item.translated, item.targetLang)}
                          className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                        >
                          <SpeakerWaveIcon className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <p className="text-gray-900 dark:text-white">{item.translated}</p>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Action buttons (collapsed view) */}
              {expandedItem !== item.id && (
                <div className="flex items-center justify-end space-x-2 mt-2">
                  <button
                    onClick={() => handleCopyText(item.translated)}
                    className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center space-x-1"
                  >
                    <DocumentDuplicateIcon className="h-3 w-3" />
                    <span>Copy</span>
                  </button>
                  <button
                    onClick={() => handlePlayAudio(item.translated, item.targetLang)}
                    className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center space-x-1"
                  >
                    <SpeakerWaveIcon className="h-3 w-3" />
                    <span>Listen</span>
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
      
      {/* Footer */}
      {showHeader && filteredHistory.length > 0 && (
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
            <span>
              Showing {filteredHistory.length} of {translationHistory.length} translations
            </span>
            {translationHistory.length > maxItems && (
              <button className="text-blue-500 hover:text-blue-600">
                View all
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TranslationHistory;