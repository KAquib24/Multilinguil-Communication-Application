// src/utils/AudioMonitor.tsx
import React, { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../app/store'; // ✅ CORRECT IMPORT PATH

interface AudioMonitorProps {
  showVisualizer?: boolean;
}

const AudioMonitor: React.FC<AudioMonitorProps> = ({ showVisualizer = true }) => {
  const localStream = useSelector((state: RootState) => state.call.localStream);
  const remoteStream = useSelector((state: RootState) => state.call.remoteStream);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  // Monitor local audio
  useEffect(() => {
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
      
      // Check if audio is being transmitted
      const average = dataArray.reduce((a, b) => a + b) / bufferLength;
      const isAudioActive = average > 10; // Threshold
      
      // if (isAudioActive) {
      //   console.log('🎤 Local audio active - level:', average.toFixed(2));
      // }
      
      // Visualize if canvas exists
      if (canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const barWidth = (canvas.width / bufferLength) * 2.5;
        let barHeight;
        let x = 0;
        
        for (let i = 0; i < bufferLength; i++) {
          barHeight = dataArray[i];
          
          ctx.fillStyle = `rgb(${barHeight + 100}, 50, 50)`;
          ctx.fillRect(x, canvas.height - barHeight / 2, barWidth, barHeight / 2);
          
          x += barWidth + 1;
        }
      }
    };
    
    draw();
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      audioContext.close();
    };
  }, [localStream, showVisualizer]);

  // Monitor remote audio
  useEffect(() => {
    if (!remoteStream) return;
    
    // Check if remote stream has audio tracks
    const audioTracks = remoteStream.getAudioTracks();
    console.log('🔊 Remote audio tracks:', audioTracks.length);
    
    if (audioTracks.length > 0) {
      const track = audioTracks[0];
      console.log('🎧 Remote audio track state:', {
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState,
        kind: track.kind
      });
      
      // Listen for remote audio activity
      const audioElement = new Audio();
      audioElement.srcObject = remoteStream;
      
      // Set up audio level monitoring for remote
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
    }
  }, [remoteStream]);

  

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
        Local: {localStream ? 'Connected' : 'No audio'}
        <br />
        Remote: {remoteStream ? 'Connected' : 'No audio'}
      </div>
    </div>
  ) : null;
};

export default AudioMonitor;