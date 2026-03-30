// src/utils/AudioMonitor.tsx
import React, { useEffect, useRef } from 'react';
import { useStreams } from '../context/StreamContext';

interface AudioMonitorProps {
  showVisualizer?: boolean;
}

const AudioMonitor: React.FC<AudioMonitorProps> = ({ showVisualizer = true }) => {
  const { localStreamRef, remoteStreamRef, localStreamVersion, remoteStreamVersion } = useStreams();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  // Monitor local audio
  useEffect(() => {
    const localStream = localStreamRef.current;
    if (!localStream || !showVisualizer) return;

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(localStream);
    
    source.connect(analyser);
    analyser.fftSize = 256;
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);
      
      if (canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const barWidth = (canvas.width / bufferLength) * 2.5;
        let x = 0;
        
        for (let i = 0; i < bufferLength; i++) {
          const barHeight = dataArray[i];
          ctx.fillStyle = `rgb(${barHeight + 100}, 50, 50)`;
          ctx.fillRect(x, canvas.height - barHeight / 2, barWidth, barHeight / 2);
          x += barWidth + 1;
        }
      }
    };
    
    draw();
    
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      audioContext.close();
    };
  }, [localStreamVersion, showVisualizer]); // ✅ re-runs when local stream changes

  // Monitor remote audio
  useEffect(() => {
    const remoteStream = remoteStreamRef.current;
    if (!remoteStream) return;
    
    const audioTracks = remoteStream.getAudioTracks();
    console.log('🔊 Remote audio tracks:', audioTracks.length);
    
    if (audioTracks.length === 0) return;

    const track = audioTracks[0];
    console.log('🎧 Remote audio track state:', {
      enabled: track.enabled,
      muted: track.muted,
      readyState: track.readyState,
      kind: track.kind,
    });

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(remoteStream);
    
    source.connect(analyser);
    analyser.fftSize = 256;
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const checkRemoteAudio = () => {
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / bufferLength;
      if (average > 5) {
        console.log('🎧 Remote audio received - level:', average.toFixed(2));
      }
    };
    
    const interval = setInterval(checkRemoteAudio, 2000);
    
    return () => {
      clearInterval(interval);
      audioContext.close();
    };
  }, [remoteStreamVersion]); // ✅ re-runs when remote stream changes

  const localStream = localStreamRef.current;
  const remoteStream = remoteStreamRef.current;

  return showVisualizer ? (
    <div className="fixed bottom-20 left-4 bg-gray-800 bg-opacity-80 p-2 rounded-lg z-50">
      <div className="text-white text-xs mb-1">Audio Monitor</div>
      <canvas 
        ref={canvasRef} 
        width="200" 
        height="50"
        className="border border-gray-600 rounded"
      />
      <div className="text-xs text-gray-300 mt-1">
        Local: {localStream ? 'Active' : 'No audio'}
        <br />
        Remote: {remoteStream ? 'Connected' : 'No audio'}
      </div>
    </div>
  ) : null;
};

export default AudioMonitor;