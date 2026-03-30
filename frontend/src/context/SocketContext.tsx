import React, { createContext, useContext, useEffect, useState, ReactNode, useRef } from 'react';
import io, { Socket } from 'socket.io-client';
import { useSelector } from 'react-redux';
import { selectAccessToken, selectCurrentUser } from '../features/auth/authSlice.js';
import { TranslationSocketService } from '../services/translationSocket.service.js';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  translationSocket: TranslationSocketService | null; // ✅ Add this
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  translationSocket: null,
});

export const useSocket = () => useContext(SocketContext);

interface SocketProviderProps {
  children: ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const translationSocketRef = useRef<TranslationSocketService | null>(null);
  
  const accessToken = useSelector(selectAccessToken);
  const user = useSelector(selectCurrentUser);

  // In frontend/src/context/SocketContext.tsx

useEffect(() => {
  if (!accessToken || !user) return;

  const socketInstance = io(process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000', {
    auth: {
      token: accessToken,
    },
    transports: ['polling','websocket'], // Allow polling fallback
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
    autoConnect: true,
    // forceNew: true, // Force new connection
  });

  socketInstance.on('connect', () => {
    console.log('Socket connected:', socketInstance.id);
    setIsConnected(true);
    
    // Authenticate with user ID
    // socketInstance.emit('authenticate', user._id);
    
    // Initialize translation socket service
    translationSocketRef.current = new TranslationSocketService(socketInstance);
  });

  socketInstance.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
    setIsConnected(false);
    
    // Try to reconnect if disconnected
    if (reason === 'io server disconnect') {
      socketInstance.connect();
    }
  });

  socketInstance.on('connect_error', (error) => {
    console.error('Socket connection error:', error.message);
    // Will retry automatically
  });

  socketInstance.on('reconnect', (attemptNumber) => {
    console.log(`Socket reconnected after ${attemptNumber} attempts`);
    setIsConnected(true);
  });

  socketInstance.on('reconnect_attempt', (attemptNumber) => {
    console.log(`Socket reconnection attempt ${attemptNumber}`);
  });

  setSocket(socketInstance);

  return () => {
    if (translationSocketRef.current) {
      translationSocketRef.current.disconnect();
    }
    if (socketInstance) {
      socketInstance.removeAllListeners();
      socketInstance.disconnect();
    }
  };
}, [accessToken, user]);

  // In frontend/src/context/SocketContext.tsx
// Add this to your return object:

return (
  <SocketContext.Provider value={{ 
    socket, 
    isConnected,
    translationSocket: translationSocketRef.current // ✅ Make sure this is included
  }}>
    {children}
  </SocketContext.Provider>
);
};