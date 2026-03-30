import React, { createContext, useContext, useRef, useCallback, useState, ReactNode } from 'react';

interface StreamContextType {
  setLocalStream: (stream: MediaStream | null) => void;
  setRemoteStream: (stream: MediaStream | null) => void;
  getLocalStream: () => MediaStream | null;
  getRemoteStream: () => MediaStream | null;
  localStreamRef: React.MutableRefObject<MediaStream | null>;
  remoteStreamRef: React.MutableRefObject<MediaStream | null>;
  // Version counters — increment when stream changes, use in useEffect deps
  localStreamVersion: number;
  remoteStreamVersion: number;
}

const StreamContext = createContext<StreamContextType | null>(null);

export const StreamProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const [localStreamVersion, setLocalStreamVersion] = useState(0);
  const [remoteStreamVersion, setRemoteStreamVersion] = useState(0);

  const setLocalStream = useCallback((stream: MediaStream | null) => {
    localStreamRef.current = stream;
    (window as any).localStream = stream;
    setLocalStreamVersion(v => v + 1);
    window.dispatchEvent(new CustomEvent('localStreamChanged', { detail: stream }));
  }, []);

  const setRemoteStream = useCallback((stream: MediaStream | null) => {
    remoteStreamRef.current = stream;
    (window as any).remoteStream = stream;
    setRemoteStreamVersion(v => v + 1);
    window.dispatchEvent(new CustomEvent('remoteStreamChanged', { detail: stream }));
  }, []);

  const getLocalStream = useCallback(() => localStreamRef.current, []);
  const getRemoteStream = useCallback(() => remoteStreamRef.current, []);

  return (
    <StreamContext.Provider value={{
      setLocalStream,
      setRemoteStream,
      getLocalStream,
      getRemoteStream,
      localStreamRef,
      remoteStreamRef,
      localStreamVersion,
      remoteStreamVersion,
    }}>
      {children}
    </StreamContext.Provider>
  );
};

export const useStreams = () => {
  const ctx = useContext(StreamContext);
  if (!ctx) throw new Error('useStreams must be used inside StreamProvider');
  return ctx;
};