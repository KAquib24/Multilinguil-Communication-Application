// src/app/store.ts
import { configureStore, combineReducers } from '@reduxjs/toolkit';
import {
  persistStore,
  persistReducer,
  FLUSH,
  REHYDRATE,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
} from 'redux-persist';
import storage from 'redux-persist/lib/storage';

import authReducer from '../features/auth/authSlice';
import chatReducer from '../features/chat/chatSlice';
import callReducer from '../features/calls/callSlice';
import translationReducer from '../features/translation/translationSlice';
import { apiSlice } from './apiSlice';

// ✅ Persist only auth slice
const authPersistConfig = {
  key: 'auth',
  storage,
  whitelist: ['user', 'accessToken'],
};

const rootReducer = combineReducers({
  auth: persistReducer(authPersistConfig, authReducer),
  chat: chatReducer,
  call: callReducer,
  translation: translationReducer,
  [apiSlice.reducerPath]: apiSlice.reducer,
});

export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // ✅ ignore redux-persist actions
        ignoredActions: [
          FLUSH,
          REHYDRATE,
          PAUSE,
          PERSIST,
          PURGE,
          REGISTER,
        ],

        // ✅ ignore WebRTC-related state paths
        ignoredPaths: [
          'call.localStream',
          'call.remoteStreams',
          'call.peerConnections',
          'call.remoteStream',
        ],
      },
    }).concat(apiSlice.middleware),

  devTools: process.env.NODE_ENV !== 'production',
});

export const persistor = persistStore(store);

// Types
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;