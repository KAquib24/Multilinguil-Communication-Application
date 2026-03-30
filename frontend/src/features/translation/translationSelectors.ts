import { createSelector } from '@reduxjs/toolkit';
import { RootState } from '../../app/store';

// Base selectors
const selectTranslationState = (state: RootState) => state.translation;

// Memoized selectors
export const selectSupportedLanguages = createSelector(
  [selectTranslationState],
  (translation) => translation.supportedLanguages
);

export const selectSourceLanguage = createSelector(
  [selectTranslationState],
  (translation) => translation.sourceLanguage
);

export const selectTargetLanguage = createSelector(
  [selectTranslationState],
  (translation) => translation.targetLanguage
);

export const selectTranslationEnabled = createSelector(
  [selectTranslationState],
  (translation) => translation.translationEnabled
);

export const selectIsTranslating = createSelector(
  [selectTranslationState],
  (translation) => translation.isTranslating
);

export const selectCurrentSession = createSelector(
  [selectTranslationState],
  (translation) => translation.currentSession
);

export const selectTranslationSessions = createSelector(
  [selectTranslationState],
  (translation) => translation.sessions
);

export const selectTranslationHistory = createSelector(
  [selectTranslationState],
  (translation) => translation.translationHistory
);

export const selectAudioQueue = createSelector(
  [selectTranslationState],
  (translation) => translation.audioQueue
);

export const selectIsPlayingAudio = createSelector(
  [selectTranslationState],
  (translation) => translation.isPlayingAudio
);

export const selectTranslationError = createSelector(
  [selectTranslationState],
  (translation) => translation.error
);

export const selectTranslationLoading = createSelector(
  [selectTranslationState],
  (translation) => translation.isLoading
);