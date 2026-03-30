import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { RootState } from '../../app/store.js';

export interface User {
  _id: string;
  name: string;
  email: string;
  picture: string;
  status: string;
  isOnline: boolean;
  lastSeen: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;
  error: string | null;
}

const initialState: AuthState = {
  user: null,
  accessToken: null,
  isLoading: false,
  error: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials: (
      state,
      action: PayloadAction<{ user: User; accessToken: string }>
    ) => {
      state.user = action.payload.user;
      state.accessToken = action.payload.accessToken;
      state.error = null;
    },

    setAccessToken: (state, action: PayloadAction<string>) => {
      state.accessToken = action.payload;
    },

    logout: (state) => {
      state.user = null;
      state.accessToken = null;
      state.error = null;
    },

    setError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
    },

    clearError: (state) => {
      state.error = null;
    },
  },
});

export const {
  setCredentials,
  setAccessToken,
  logout,
  setError,
  clearError,
} = authSlice.actions;

export default authSlice.reducer;

/* ✅ SELECTORS */
export const selectCurrentUser = (state: RootState) => state.auth.user;
export const selectAccessToken = (state: RootState) => state.auth.accessToken;
export const selectIsAuthenticated = (state: RootState) =>
  Boolean(state.auth.accessToken);
export const selectAuthError = (state: RootState) => state.auth.error;
