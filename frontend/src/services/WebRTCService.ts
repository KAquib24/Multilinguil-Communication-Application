// import { store } from '../app/store';
// import {
//   setRemoteStream
// } from '../features/calls/callSlice';
import { Socket } from "socket.io-client";

export class WebRTCService {
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  private iceServers: RTCIceServer[] = [];
  private socket: Socket; // ✅ Added socket property
  
  // ✅ Callbacks for remote stream handling
  private onRemoteStreamCallback: ((peerId: string, stream: MediaStream) => void) | null = null;
  private onStreamEndedCallback: ((peerId: string) => void) | null = null;

  // ✅ Updated constructor to accept socket
  constructor(iceServers: RTCIceServer[], socket: Socket) {
    this.iceServers = iceServers;
    this.socket = socket;
  }

  // ✅ Add local stream to all peer connections
  addLocalStreamToAll(stream: MediaStream) {
    this.peerConnections.forEach((pc) => {
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });
    });
  }
  
  // ✅ Set callback for remote stream
  setOnRemoteStream(callback: (peerId: string, stream: MediaStream) => void) {
    this.onRemoteStreamCallback = callback;
  }

  // ✅ Set callback for stream ended
  setOnStreamEnded(callback: (peerId: string) => void) {
    this.onStreamEndedCallback = callback;
  }

  // ✅ Handle track event (remote stream)
  private handleTrackEvent(event: RTCTrackEvent, peerId: string) {
  if (event.streams && event.streams[0]) {
    const stream = event.streams[0];
    console.log("📹 Track received from peer:", peerId);

    // ✅ Fixed: event.track (singular), not event.tracks
    const track = event.track;
    console.log(`🎵 Track ${track.kind} initial muted state:`, track.muted);

    track.onunmute = () => {
      console.log(`🔊 Track ${track.kind} UNMUTED - firing remote stream callback`);
      if (this.onRemoteStreamCallback) {
        this.onRemoteStreamCallback(peerId, stream);
      }
    };

    track.onmute = () => {
      console.log(`🔇 Track ${track.kind} muted`);
    };

    // Fire immediately so UI shows connected state
    if (this.onRemoteStreamCallback) {
      this.onRemoteStreamCallback(peerId, stream);
    }
  }
}
  
  // Create a new peer connection
  createPeerConnection(peerId: string): RTCPeerConnection {
    const configuration: RTCConfiguration = {
      iceServers: this.iceServers,
      iceTransportPolicy: 'all',
    };
    
    const peerConnection = new RTCPeerConnection(configuration);
    
    // Store the connection
    this.peerConnections.set(peerId, peerConnection);
    
    // Set up event handlers
    this.setupConnectionHandlers(peerId, peerConnection);
    
    return peerConnection;
  }
  
  private setupConnectionHandlers(peerId: string, peerConnection: RTCPeerConnection) {
    // ICE candidate handler
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        // Send ICE candidate to signaling server
        this.sendIceCandidate(peerId, event.candidate);
      }
    };
    
    // Track handler for remote streams
    peerConnection.ontrack = (event) => {
      this.handleTrackEvent(event, peerId);
    };
    
    // Connection state change
    peerConnection.onconnectionstatechange = () => {
      console.log(`Connection state for ${peerId}:`, peerConnection.connectionState);
      
      if (peerConnection.connectionState === 'failed' || 
          peerConnection.connectionState === 'disconnected' ||
          peerConnection.connectionState === 'closed') {
        this.cleanupPeerConnection(peerId);
      }
    };
    
    // ICE connection state change
    peerConnection.oniceconnectionstatechange = () => {
      console.log(`ICE connection state for ${peerId}:`, peerConnection.iceConnectionState);
    };
    
    // ICE gathering state change
    peerConnection.onicegatheringstatechange = () => {
      console.log(`ICE gathering state for ${peerId}:`, peerConnection.iceGatheringState);
    };
    
    // Signaling state change
    peerConnection.onsignalingstatechange = () => {
      console.log(`Signaling state for ${peerId}:`, peerConnection.signalingState);
    };
    
    // Negotiation needed
    peerConnection.onnegotiationneeded = async () => {
      try {
        await this.createAndSendOffer(peerId);
      } catch (error) {
        console.error('Negotiation error:', error);
      }
    };
  }
  
  // Create and send offer
  async createAndSendOffer(peerId: string): Promise<void> {
    const peerConnection = this.peerConnections.get(peerId);
    if (!peerConnection) return;
    
    try {
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      
      await peerConnection.setLocalDescription(offer);
      
      // Send offer to signaling server
      this.sendOffer(peerId, offer);
      console.log("🟢 Creating offer for:", peerId);
    } catch (error) {
      console.error('Create offer error:', error);
    }
  }
  
  // Handle incoming offer
  async handleOffer(peerId: string, offer: RTCSessionDescriptionInit): Promise<void> {
  let peerConnection = this.peerConnections.get(peerId);

  if (!peerConnection) {
    peerConnection = this.createPeerConnection(peerId);

    // ✅ Add local tracks BEFORE setRemoteDescription
    const localStream = (window as any).localStream as MediaStream | null;
    if (localStream) {
      localStream.getTracks().forEach(track => {
        peerConnection!.addTrack(track, localStream!);
        console.log("✅ Track added to peer connection before answer:", track.kind);
      });
    } else {
      console.error("❌ No local stream available when handling offer!");
    }
  }

  try {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    this.sendAnswer(peerId, answer);
    console.log("📥 Offer handled + answer sent to:", peerId);
  } catch (error) {
    console.error('Handle offer error:', error);
  }
}

getPeerConnection(peerId: string): RTCPeerConnection | undefined {
  return this.peerConnections.get(peerId);
}
  
  // Handle incoming answer
  async handleAnswer(peerId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    const peerConnection = this.peerConnections.get(peerId);
    if (!peerConnection) return;
    
    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
      console.error('Handle answer error:', error);
    }
  }
  
  // Handle ICE candidate
  async handleIceCandidate(peerId: string, candidate: RTCIceCandidateInit): Promise<void> {
    const peerConnection = this.peerConnections.get(peerId);
    if (!peerConnection) return;
    
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('Add ICE candidate error:', error);
    }
  }
  
  // Add local stream to connection
  addLocalStream(peerId: string, stream: MediaStream): void {
    const peerConnection = this.peerConnections.get(peerId);
    if (!peerConnection) return;
    
    // Add all tracks from local stream
    stream.getTracks().forEach(track => {
      peerConnection.addTrack(track, stream);
    });
  }
  
  // Create data channel
  createDataChannel(peerId: string, channelName: string): RTCDataChannel | null {
    const peerConnection = this.peerConnections.get(peerId);
    if (!peerConnection) return null;
    
    const dataChannel = peerConnection.createDataChannel(channelName);
    this.dataChannels.set(`${peerId}_${channelName}`, dataChannel);
    
    this.setupDataChannelHandlers(peerId, channelName, dataChannel);
    
    return dataChannel;
  }
  
  // Handle incoming data channel
  handleDataChannel(peerId: string, dataChannel: RTCDataChannel): void {
    const channelName = dataChannel.label;
    this.dataChannels.set(`${peerId}_${channelName}`, dataChannel);
    
    this.setupDataChannelHandlers(peerId, channelName, dataChannel);
  }
  
  private setupDataChannelHandlers(
    peerId: string,
    channelName: string,
    dataChannel: RTCDataChannel
  ) {
    dataChannel.onopen = () => {
      console.log(`Data channel ${channelName} opened for ${peerId}`);
    };
    
    dataChannel.onclose = () => {
      console.log(`Data channel ${channelName} closed for ${peerId}`);
      this.dataChannels.delete(`${peerId}_${channelName}`);
    };
    
    dataChannel.onerror = (error) => {
      console.error(`Data channel ${channelName} error for ${peerId}:`, error);
    };
    
    dataChannel.onmessage = (event) => {
      this.handleDataChannelMessage(peerId, channelName, event.data);
    };
  }
  
  private handleDataChannelMessage(peerId: string, channelName: string, data: any) {
    try {
      const message = JSON.parse(data);
      
      // Handle different message types
      switch (message.type) {
        case 'chat':
          // Handle chat messages during call
          break;
        case 'translation':
          // Handle translation data
          break;
        case 'control':
          // Handle call control messages
          break;
        default:
          console.log('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Parse data channel message error:', error);
    }
  }
  
  // Send data via data channel
  sendData(peerId: string, channelName: string, data: any): boolean {
    const dataChannel = this.dataChannels.get(`${peerId}_${channelName}`);
    if (!dataChannel || dataChannel.readyState !== 'open') {
      return false;
    }
    
    try {
      dataChannel.send(JSON.stringify(data));
      return true;
    } catch (error) {
      console.error('Send data error:', error);
      return false;
    }
  }
  
  // ✅ CRITICAL FIX: Clean up peer connection - AB ERROR-FREE
  cleanupPeerConnection(peerId: string): void {
  const peerConnection = this.peerConnections.get(peerId);
  if (peerConnection) {
    peerConnection.close();
  }
  this.peerConnections.delete(peerId);

  // ✅ Notify via window event instead of Redux
  window.dispatchEvent(new CustomEvent('remoteStreamChanged', { detail: null }));

  if (this.onStreamEndedCallback) {
    this.onStreamEndedCallback(peerId);
  }
}
  
  // Clean up all connections
  cleanupAll(): void {
    Array.from(this.peerConnections.keys()).forEach(peerId => {
      this.cleanupPeerConnection(peerId);
    });
    
    this.peerConnections.clear();
    this.dataChannels.clear();
  }
  
  // Get peer connection stats
  async getStats(peerId: string): Promise<any> {
    const peerConnection = this.peerConnections.get(peerId);
    if (!peerConnection) return null;
    
    try {
      const stats = await peerConnection.getStats();
      const result: any = {};
      
      stats.forEach(report => {
        result[report.type] = {
          ...Object.fromEntries(
            Object.entries(report).filter(([key]) => !['type', 'id', 'timestamp'].includes(key))
          ),
          timestamp: report.timestamp,
        };
      });
      
      return result;
    } catch (error) {
      console.error('Get stats error:', error);
      return null;
    }
  }
  
  // Get all peer IDs
  getPeerIds(): string[] {
    return Array.from(this.peerConnections.keys());
  }
  
  // Check if has connection for peer
  hasConnection(peerId: string): boolean {
    return this.peerConnections.has(peerId);
  }
  
  // ✅ FIXED: Send methods with socket
  private sendOffer(peerId: string, offer: RTCSessionDescriptionInit) {
    console.log("📤 Sending offer to", peerId);
    this.socket.emit("webrtc:offer", {
      targetUserId: peerId,
      offer,
    });
  }

  private sendAnswer(peerId: string, answer: RTCSessionDescriptionInit) {
    console.log("📤 Sending answer to", peerId);
    this.socket.emit("webrtc:answer", {
      targetUserId: peerId,
      answer,
    });
  }

  private sendIceCandidate(peerId: string, candidate: RTCIceCandidate) {
    console.log("📤 Sending ICE candidate to", peerId);
    this.socket.emit("webrtc:ice-candidate", {
      targetUserId: peerId,
      candidate,
    });
  }
}

export default WebRTCService;