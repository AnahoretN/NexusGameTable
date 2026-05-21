import { useState, useCallback, useRef } from 'react';
import { Action } from './gameActions';
import { Player } from '../types';

// Alternative TURN servers (multiple providers for redundancy)
const TURN_SERVERS = [
  // OpenRelay (free, no auth)
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  // Twilio free TURN (if available)
  {
    urls: 'turn:global.turn.twilio.com:3478?transport=udp',
    username: 'nexusgametable',
    credential: 'nexusgametable123'
  },
  {
    urls: 'turn:global.turn.twilio.com:3478?transport=tcp',
    username: 'nexusgametable',
    credential: 'nexusgametable123'
  },
  // RTCNetwork (community TURN)
  {
    urls: 'turn:numb.viagenie.ca:3478',
    username: 'nexusgametable@gmail.com',
    credential: 'nexusgametable123'
  }
];

const STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:global.stun.twilio.com:3478' }
];

// Unicode-safe base64 encoding/decoding
function unicodeBase64Encode(str: string): string {
  // First encode the string as UTF-8, then base64 encode
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16))));
}

function unicodeBase64Decode(str: string): string {
  // First base64 decode, then decode UTF-8
  return decodeURIComponent(atob(str).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
}

export type ManualConnectionStep = 'idle' | 'creating' | 'waiting_for_answer' | 'connecting' | 'connected' | 'failed';

export interface ManualConnectionState {
  step: ManualConnectionStep;
  localOffer: string;
  remoteAnswer: string;
  error: string | null;
  generatedCode: string;
  channelOpen: boolean;  // Track if the data channel is actually open
  noCandidates: boolean; // Track if no ICE candidates were gathered (localhost issue)
}

export interface SDPMessage {
  type: 'offer' | 'answer';
  sdp: string;
  playerId?: string;
  playerName?: string;
}

/**
 * Adapter that wraps RTCDataChannel to look like a PeerJS DataConnection
 * This allows the manual connection to work with the existing P2P sync system
 */
class DataChannelAdapter {
  private dc: RTCDataChannel;
  private _handlers: { [event: string]: ((...args: any[]) => void)[] } = {};
  public peer: string;
  public open: boolean = false;
  private static adapterMap = new WeakMap<RTCDataChannel, DataChannelAdapter>();
  private _openEventEmitted: boolean = false; // Track if open event was already emitted

  // Private constructor - use create() factory method instead
  private constructor(dataChannel: RTCDataChannel, peerId: string) {
    this.dc = dataChannel;
    this.peer = peerId;

    // Forward data channel events to adapter handlers
    this.dc.onopen = () => {
      this.open = true;
      // Only emit if not already emitted (prevents duplicate when channel was already open)
      if (!this._openEventEmitted) {
        this._openEventEmitted = true;
        setTimeout(() => this.emit('open'), 0);
      }
    };

    this.dc.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.emit('data', data);
      } catch (e) {
        // If not JSON, emit raw
        this.emit('data', event.data);
      }
    };

    this.dc.onclose = (event: any) => {
      this.open = false;
      DataChannelAdapter.adapterMap.delete(this.dc);
      this.emit('close');
    };

    this.dc.onerror = (error: any) => {
      console.error('[DataChannelAdapter] Data channel ERROR', 'peer:', this.peer);
      this.emit('error', error);
    };

    // Check if already open - emit open event only once
    if (dataChannel.readyState === 'open') {
      this.open = true;
      if (!this._openEventEmitted) {
        this._openEventEmitted = true;
        // Emit in next tick to allow handlers to be registered
        setTimeout(() => this.emit('open'), 0);
      }
    }
  }

  // PeerJS-compatible send method (takes object, auto-serializes)
  send(data: any): void {
    if (this.open && this.dc.readyState === 'open') {
      // PeerJS sends objects directly, we need to stringify for raw data channel
      if (typeof data === 'object') {
        this.dc.send(JSON.stringify(data));
      } else {
        this.dc.send(data);
      }
    }
  }

  // Check if HELO was already sent for this connection
  _heloSent: boolean = false;

  // Event handler methods
  on(event: string, handler: (...args: any[]) => void): void {
    if (!this._handlers[event]) {
      this._handlers[event] = [];
    }
    // Prevent duplicate handlers
    if (!this._handlers[event].includes(handler)) {
      this._handlers[event].push(handler);
    }
  }

  off(event: string, handler: (...args: any[]) => void): void {
    if (this._handlers[event]) {
      this._handlers[event] = this._handlers[event].filter(h => h !== handler);
    }
  }

  private emit(event: string, ...args: any[]): void {
    if (this._handlers[event]) {
      this._handlers[event].forEach(handler => handler(...args));
    }
  }

  close(): void {
    DataChannelAdapter.adapterMap.delete(this.dc);
    this.dc.close();
  }

  /**
   * Factory method to create or get existing adapter for a data channel
   * Prevents duplicate adapters for the same data channel
   */
  static create(dataChannel: RTCDataChannel, peerId: string): DataChannelAdapter {
    // Check if adapter already exists for this data channel
    const existing = DataChannelAdapter.adapterMap.get(dataChannel);
    if (existing) {
      return existing;
    }

    // Create new adapter and store it
    const adapter = DataChannelAdapter.create(dataChannel, peerId);
    DataChannelAdapter.adapterMap.set(dataChannel, adapter);
    return adapter;
  }

  // Allow direct access to underlying data channel if needed
  get dataChannel(): RTCDataChannel {
    return this.dc;
  }
}

/**
 * Hook for manual P2P connection without signalling server
 * Returns a PeerJS-compatible connection that integrates with existing sync system
 */
// Check WebRTC support and permissions
export function checkWebRTCSupport(): { supported: boolean; reason?: string } {
  if (!window.RTCPeerConnection) {
    return { supported: false, reason: 'WebRTC (RTCPeerConnection) not supported in this browser' };
  }
  if (!window.RTCDataChannel) {
    return { supported: false, reason: 'RTCDataChannel not supported' };
  }
  return { supported: true };
}

// Test WebRTC connectivity by trying to gather ICE candidates
export async function testWebRTCConnectivity(): Promise<{
  success: boolean;
  candidates: number;
  error?: string;
  details: { host: number; srflx: number; relay: number };
}> {
  return new Promise((resolve) => {
    try {
      const pc = new RTCPeerConnection({
        iceServers: [...STUN_SERVERS, ...TURN_SERVERS]
      });

      let candidates = 0;
      let hostCount = 0;
      let srflxCount = 0;
      let relayCount = 0;

      const timeout = setTimeout(() => {
        pc.close();
        if (candidates === 0) {
          resolve({
            success: false,
            candidates: 0,
            error: 'No ICE candidates gathered - WebRTC may be blocked',
            details: { host: hostCount, srflx: srflxCount, relay: relayCount }
          });
        } else {
          resolve({
            success: true,
            candidates,
            details: { host: hostCount, srflx: srflxCount, relay: relayCount }
          });
        }
      }, 5000);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          candidates++;
          const cand = event.candidate.candidate;
          if (cand.includes('typ host')) hostCount++;
          if (cand.includes('typ srflx')) srflxCount++;
          if (cand.includes('typ relay')) relayCount++;
        } else {
          clearTimeout(timeout);
          pc.close();
          if (candidates === 0) {
            resolve({
              success: false,
              candidates: 0,
              error: 'ICE gathering completed but no candidates found',
              details: { host: hostCount, srflx: srflxCount, relay: relayCount }
            });
          } else {
            resolve({
              success: true,
              candidates,
              details: { host: hostCount, srflx: srflxCount, relay: relayCount }
            });
          }
        }
      };

      // Create a data channel to trigger ICE gathering
      pc.createDataChannel('test');

      // Create offer to start ICE gathering
      pc.createOffer().then(offer => {
        pc.setLocalDescription(offer);
      }).catch(err => {
        clearTimeout(timeout);
        pc.close();
        resolve({
          success: false,
          candidates: 0,
          error: String(err),
          details: { host: 0, srflx: 0, relay: 0 }
        });
      });
    } catch (error) {
      resolve({
        success: false,
        candidates: 0,
        error: String(error),
        details: { host: 0, srflx: 0, relay: 0 }
      });
    }
  });
}

export function useManualConnection() {
  const [state, setState] = useState<ManualConnectionState>({
    step: 'idle',
    localOffer: '',
    remoteAnswer: '',
    error: null,
    generatedCode: '',
    channelOpen: false,
    noCandidates: false,
  });

  const connectionRef = useRef<DataChannelAdapter | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const hostPlayerIdRef = useRef<string>('');
  const guestNameRef = useRef<string>('');
  const guestIdRef = useRef<string>('');
  const localDispatchRef = useRef<React.Dispatch<Action> | null>(null);

  // Helper function to set up a connection and listen for its open event
  // CRITICAL: This should only be called ONCE per connection to avoid duplicate handlers
  const setupConnection = useCallback((adapter: DataChannelAdapter) => {
    // Check if we're already tracking this exact adapter
    if (connectionRef.current === adapter) {
      console.log('[Manual P2P] setupConnection: Adapter already set up, skipping');
      return;
    }

    // Clean up old adapter if exists
    if (connectionRef.current && connectionRef.current !== adapter) {
      console.log('[Manual P2P] setupConnection: Cleaning up old adapter');
      // Remove our handlers from old adapter by removing all listeners
      // (we can't selectively remove only our handlers since on() uses anonymous functions)
      connectionRef.current._handlers = {};
    }

    connectionRef.current = adapter;

    // Listen for the data channel to actually open
    const handleOpen = () => {
      setState(prev => ({ ...prev, channelOpen: true }));
    };

    const handleClose = () => {
      setState(prev => ({ ...prev, channelOpen: false }));
    };

    adapter.on('open', handleOpen);
    adapter.on('close', handleClose);

    // If already open, update state immediately
    if (adapter.open) {
      setState(prev => ({ ...prev, channelOpen: true }));
    }
  }, []);

  // Host: Create Offer
  const createOffer = useCallback(async (playerName: string) => {
    try {
      // Check WebRTC support first
      const supportCheck = checkWebRTCSupport();
      if (!supportCheck.supported) {
        setState(prev => ({ ...prev, step: 'failed', error: supportCheck.reason || 'WebRTC not supported' }));
        return;
      }

      setState(prev => ({ ...prev, step: 'creating', error: null }));

      // Generate a host ID
      const hostId = 'manual-host-' + Math.random().toString(36).substr(2, 9);
      hostPlayerIdRef.current = hostId;

      // Create RTCPeerConnection with STUN + TURN servers for better connectivity
      const rtcConfig: RTCConfiguration = {
        iceServers: [...STUN_SERVERS, ...TURN_SERVERS],
        iceCandidatePoolSize: 10,
        iceTransportPolicy: 'all'
      };

      // Check for TURN servers
      const hasTurnServers = rtcConfig.iceServers?.some(s => s.urls?.includes('turn'));
      if (hasTurnServers) {
        console.log('[Manual P2P Host] 🔒 Using TURN servers for connection');
      }

      const pc = new RTCPeerConnection(rtcConfig);

      peerConnectionRef.current = pc;

      // Create data channel (host initiates) BEFORE creating offer
      const dc = pc.createDataChannel('nexus-game', {
        ordered: true
        // Removed 'protocol: json' as it may cause compatibility issues
      });

      // Create adapter immediately - it will handle data channel opening
      const guestId = 'manual-guest-' + Math.random().toString(36).substr(2, 9);
      const adapter = DataChannelAdapter.create(dc, guestId);
      setupConnection(adapter);

      // Wait for ICE gathering to complete before generating code (with extended timeout)
      const iceGatheringComplete = new Promise<void>((resolve) => {
        let resolved = false;
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            resolve();
          }
        }, 10000); // Extended to 10s for slower networks with TURN

        if (pc.iceGatheringState === 'complete') {
          clearTimeout(timeout);
          resolve();
          return;
        }
        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === 'complete' && !resolved) {
            clearTimeout(timeout);
            resolved = true;
            resolve();
          }
        };
      });

      // Create offer with proper SDP options
      const offer = await pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false
      });

      // Host offer keeps 'setup:actpass' (accepts either active or passive from answerer)
      await pc.setLocalDescription(offer);

      // Wait for ICE gathering to complete
      await iceGatheringComplete;

      // Now get the updated SDP with all ICE candidates
      const finalSdp = pc.localDescription?.sdp || offer.sdp || '';

      // Generate final code with all candidates
      const message: SDPMessage = {
        type: 'offer',
        sdp: finalSdp || '',
        playerName
      };

      const code = unicodeBase64Encode(JSON.stringify(message));
      setState(prev => ({ ...prev, step: 'waiting_for_answer', localOffer: code, generatedCode: code }));

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          console.log('[Manual P2P Host] ✅ Connection established!');
          setState(prev => ({ ...prev, noCandidates: false }));
        } else if (pc.connectionState === 'failed') {
          console.error('[Manual P2P Host] ❌ ICE connection failed!');
          // Set noCandidates flag and error when connection fails
          setState(prev => ({
            ...prev,
            step: 'failed',
            error: 'ICE connection failed - try testing on different devices or networks',
            noCandidates: true
          }));
        }
      };

      // Log ICE candidates for debugging
      let candidatesGathered = 0;
      let hostCandidateCount = 0;
      let srflxCandidateCount = 0;
      let relayCandidateCount = 0;

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          candidatesGathered++;
          const candidate = event.candidate.candidate;
          const type = candidate.includes('typ srflx') ? 'srflx (public)' :
                       candidate.includes('typ host') ? 'host (local)' :
                       candidate.includes('typ relay') ? 'relay (TURN)' :
                       candidate.includes('typ prflx') ? 'prflx (peer)' : 'unknown';

          if (type.includes('host')) hostCandidateCount++;
          if (type.includes('srflx')) srflxCandidateCount++;
          if (type.includes('relay')) relayCandidateCount++;
        } else {
          if (candidatesGathered === 0) {
            console.error('[Manual P2P] ❌ No ICE candidates gathered!');
          } else if (relayCandidateCount === 0 && srflxCandidateCount === 0) {
            console.warn('[Manual P2P] ⚠️ Only local candidates - TURN servers not responding!');
          }
        }
      };
    } catch (error) {
      console.error('[Manual P2P] Error creating offer:', error);
      setState(prev => ({ ...prev, step: 'failed', error: String(error) }));
    }
  }, []);

  // Guest: Connect to Host
  const connectToHost = useCallback(async (offerCode: string, guestName: string = 'Guest Player', localDispatch?: React.Dispatch<Action>) => {
    try {
      console.log('[Manual P2P Guest] 🔵 Starting connection to host...');

      // Check WebRTC support first
      const supportCheck = checkWebRTCSupport();
      if (!supportCheck.supported) {
        setState(prev => ({ ...prev, step: 'failed', error: supportCheck.reason || 'WebRTC not supported' }));
        return;
      }

      setState(prev => ({ ...prev, step: 'connecting', error: null }));

      // Store dispatch and guest name for later use when channel opens
      localDispatchRef.current = localDispatch || null;
      guestNameRef.current = guestName;

      // Decode offer
      const offerMessage: SDPMessage = JSON.parse(unicodeBase64Decode(offerCode));

      // Generate guest ID
      const guestId = 'manual-guest-' + Math.random().toString(36).substr(2, 9);
      guestIdRef.current = guestId;

      // Create RTCPeerConnection with STUN + TURN servers for better connectivity
      const rtcConfig: RTCConfiguration = {
        iceServers: [...STUN_SERVERS, ...TURN_SERVERS],
        iceCandidatePoolSize: 10,
        iceTransportPolicy: 'all'
      };

      // Check for TURN servers
      const hasTurnServers = rtcConfig.iceServers?.some(s => s.urls?.includes('turn'));
      if (hasTurnServers) {
        console.log('[Manual P2P Guest] 🔒 Using TURN servers for connection');
      }

      const pc = new RTCPeerConnection(rtcConfig);

      peerConnectionRef.current = pc;

      // Listen for data channel from host
      pc.ondatachannel = (event) => {
        const dc = event.channel;

        // Create adapter with host's ID (we'll use the offer message to identify)
        const adapter = DataChannelAdapter.create(dc, hostPlayerIdRef.current || 'manual-host');
        setupConnection(adapter);

        // Create player object ONCE (outside the open handler to prevent duplicates)
        const dispatch = localDispatchRef.current;
        const playerName = guestNameRef.current || 'Guest Player';
        const playerId = guestIdRef.current;

        const myPlayer: Player = {
          id: playerId,
          name: playerName.trim() || `Player ${Math.floor(Math.random() * 100)}`,
          color: '#' + Math.floor(Math.random() * 16777215).toString(16),
          isGM: false
        };

        // When data channel opens, register the guest player with the host
        adapter.on('open', () => {
          console.log('[Manual P2P Guest] 🎉 Connection to host SUCCESSFUL!');

          // Add ourselves locally (only once)
          if (dispatch) {
            dispatch({ type: 'ADD_PLAYER', payload: myPlayer });
            dispatch({ type: 'SET_ACTIVE_ID', payload: myPlayer.id });
          }

          // Small delay to ensure host is ready to receive HELO
          setTimeout(() => {
            // Send HELO to host (only once per connection)
            if (!adapter._heloSent) {
              adapter._heloSent = true;
              adapter.send({ type: 'HELO', payload: myPlayer });
            }
          }, 200);
        });
      };

      // Set remote description (offer)
      await pc.setRemoteDescription(new RTCSessionDescription({
        type: 'offer',
        sdp: offerMessage.sdp
      }));

      // Wait for ICE gathering to complete before generating code (with extended timeout)
      const iceGatheringComplete = new Promise<void>((resolve) => {
        let resolved = false;
        const timeout = setTimeout(() => {
          if (!resolved) {
            console.warn('[Manual P2P] Guest: ICE gathering timeout (10s) - using candidates gathered so far');
            console.warn('[Manual P2P] This may indicate network issues - check firewall/VPN');
            resolved = true;
            resolve();
          }
        }, 10000); // Extended to 10s for slower networks with TURN

        if (pc.iceGatheringState === 'complete') {
          clearTimeout(timeout);
          resolve();
          return;
        }
        pc.onicegatheringstatechange = () => {
          console.log('[Manual P2P] Guest ICE gathering state:', pc.iceGatheringState);
          if (pc.iceGatheringState === 'complete' && !resolved) {
            clearTimeout(timeout);
            resolved = true;
            resolve();
          }
        };
      });

      // Create answer with proper SDP options
      const answer = await pc.createAnswer();

      // Guest must use 'setup:active' to initiate the DTLS connection
      let sdp = answer.sdp || '';

      // Replace setup attribute - try multiple patterns
      if (sdp.includes('a=setup:actpass')) {
        sdp = sdp.replace(/a=setup:actpass/g, 'a=setup:active');
      } else if (sdp.includes('a=setup:holdconn')) {
        sdp = sdp.replace(/a=setup:holdconn/g, 'a=setup:active');
      }

      await pc.setLocalDescription(new RTCSessionDescription({
        type: 'answer',
        sdp: sdp
      }));

      // Wait for ICE gathering to complete
      await iceGatheringComplete;

      // Get the updated SDP with all ICE candidates
      let finalSdp = pc.localDescription?.sdp || answer.sdp || '';

      // CRITICAL: Modify SDP AFTER ICE gathering to fix setup attribute
      // Browser may have reset it to actpass, so fix it again before sending
      if (finalSdp.includes('a=setup:actpass')) {
        finalSdp = finalSdp.replace(/a=setup:actpass/g, 'a=setup:active');
      } else if (finalSdp.includes('a=setup:holdconn')) {
        finalSdp = finalSdp.replace(/a=setup:holdconn/g, 'a=setup:active');
      }

      // Generate answer code
      const message: SDPMessage = {
        type: 'answer',
        sdp: finalSdp || ''
      };

      const code = unicodeBase64Encode(JSON.stringify(message));
      // Don't set step to 'connected' yet - wait for ICE connection to actually establish
      // Instead, set generatedCode so the UI can show the answer code
      setState(prev => ({ ...prev, generatedCode: code }));

      // Set up connection state change handler BEFORE checking current state
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          console.log('[Manual P2P Guest] ✅ Connection established!');
          // Only now set step to 'connected'
          setState(prev => ({ ...prev, step: 'connected', noCandidates: false }));
        } else if (pc.connectionState === 'failed') {
          console.error('[Manual P2P Guest] ❌ ICE connection failed!');
          // Set noCandidates flag when connection fails
          setState(prev => ({ ...prev, noCandidates: true }));
        }
      };

      // Log ICE candidates for debugging
      let candidatesGathered = 0;
      let hostCandidateCount = 0;
      let srflxCandidateCount = 0;
      let relayCandidateCount = 0;

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          candidatesGathered++;
          const candidate = event.candidate.candidate;
          const type = candidate.includes('typ srflx') ? 'srflx (public)' :
                       candidate.includes('typ host') ? 'host (local)' :
                       candidate.includes('typ relay') ? 'relay (TURN)' :
                       candidate.includes('typ prflx') ? 'prflx (peer)' : 'unknown';

          if (type.includes('host')) hostCandidateCount++;
          if (type.includes('srflx')) srflxCandidateCount++;
          if (type.includes('relay')) relayCandidateCount++;
        } else {
          if (candidatesGathered === 0) {
            console.error('[Manual P2P] ❌ No ICE candidates gathered!');
          } else if (relayCandidateCount === 0 && srflxCandidateCount === 0) {
            console.warn('[Manual P2P] ⚠️ Only local candidates - TURN servers not responding!');
          }
        }
      };
    } catch (error) {
      console.error('[Manual P2P] Error connecting:', error);
      setState(prev => ({ ...prev, step: 'failed', error: String(error) }));
    }
  }, []);

  // Host: Handle Answer from Guest
  const handleGuestAnswer = useCallback(async (answerCode: string) => {
    try {
      const answerMessage: SDPMessage = JSON.parse(unicodeBase64Decode(answerCode));
      const pc = peerConnectionRef.current;

      if (!pc) {
        throw new Error('PeerConnection not initialized. Create an offer first.');
      }

      // Set remote description (answer)
      await pc.setRemoteDescription(new RTCSessionDescription({
        type: 'answer',
        sdp: answerMessage.sdp
      }));

      console.log('[Manual P2P Host] ✅ Connection established!');
      setState(prev => ({ ...prev, step: 'connected', noCandidates: false }));
    } catch (error) {
      console.error('[Manual P2P] Error processing answer:', error);
      setState(prev => ({ ...prev, step: 'failed', error: String(error) }));
    }
  }, []);

  const reset = useCallback(() => {
    if (connectionRef.current) {
      connectionRef.current.close();
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }
    connectionRef.current = null;
    peerConnectionRef.current = null;
    hostPlayerIdRef.current = '';
    setState({
      step: 'idle',
      localOffer: '',
      remoteAnswer: '',
      error: null,
      generatedCode: '',
      channelOpen: false,
      noCandidates: false,
    });
  }, []);

  const setRemoteAnswer = useCallback((answer: string) => {
    setState(prev => ({ ...prev, remoteAnswer: answer }));
  }, []);

  const setLocalOffer = useCallback((offer: string) => {
    setState(prev => ({ ...prev, localOffer: offer }));
  }, []);

  return {
    state,
    createOffer,
    connectToHost,
    handleGuestAnswer,
    reset,
    setRemoteAnswer,
    setLocalOffer,
    connectionRef,  // PeerJS-compatible connection adapter
  };
}
