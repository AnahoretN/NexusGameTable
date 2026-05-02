import { useState, useCallback, useRef } from 'react';
import { Action } from './gameActions';
import { Player } from '../types';

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
  private static activeAdapters = new Set<DataChannelAdapter>();
  private _openEventEmitted: boolean = false; // Track if open event was already emitted

  constructor(dataChannel: RTCDataChannel, peerId: string) {
    this.dc = dataChannel;
    this.peer = peerId;

    // Check for duplicate adapters for the same data channel
    for (const adapter of DataChannelAdapter.activeAdapters) {
      if (adapter.dc === dataChannel) {
        console.error('[DataChannelAdapter] WARNING: Creating duplicate adapter for same data channel!', {
          existingPeer: adapter.peer,
          newPeer: peerId,
          readyState: dataChannel.readyState
        });
      }
    }
    DataChannelAdapter.activeAdapters.add(this);

    console.log('[DataChannelAdapter] Creating adapter, readyState:', dataChannel.readyState, 'peer:', peerId);

    // Forward data channel events to adapter handlers
    this.dc.onopen = () => {
      console.log('[DataChannelAdapter] Data channel OPENED!', 'peer:', this.peer,
                  'id:', this.dc.id,
                  'label:', this.dc.label,
                  'ordered:', this.dc.ordered,
                  'maxPacketLifeTime:', this.dc.maxPacketLifeTime,
                  'maxRetransmits:', this.dc.maxRetransmits);
      this.open = true;
      // Only emit if not already emitted (prevents duplicate when channel was already open)
      if (!this._openEventEmitted) {
        this._openEventEmitted = true;
        setTimeout(() => this.emit('open'), 0);
      }
    };

    this.dc.onmessage = (event) => {
      console.log('[DataChannelAdapter] Received message:', event.data);
      try {
        const data = JSON.parse(event.data);
        this.emit('data', data);
      } catch (e) {
        // If not JSON, emit raw
        this.emit('data', event.data);
      }
    };

    this.dc.onclose = (event: any) => {
      console.log('[DataChannelAdapter] Data channel CLOSED', 'peer:', this.peer,
                  'wasClean:', event?.wasClean,
                  'code:', event?.code,
                  'reason:', event?.reason);
      this.open = false;
      DataChannelAdapter.activeAdapters.delete(this);
      this.emit('close');
    };

    this.dc.onerror = (error: any) => {
      console.error('[DataChannelAdapter] Data channel ERROR', 'peer:', this.peer,
                   'error:', error?.error || error,
                   'errorDetail:', error?.errorDetail,
                   'sctpCauseCode:', error?.error?.sctpCauseCode);
      this.emit('error', error);
    };

    // Check if already open - emit open event only once
    if (dataChannel.readyState === 'open') {
      console.log('[DataChannelAdapter] Data channel was already open!');
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
    } else {
      console.warn('[DataChannelAdapter] Cannot send - channel not open. peer:', this.peer, 'open:', this.open, 'readyState:', this.dc.readyState);
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
    } else {
      console.warn('[DataChannelAdapter] Attempted to add duplicate handler for event:', event, 'peer:', this.peer);
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
    console.log('[DataChannelAdapter] close() called!', 'peer:', this.peer, 'Stack:');
    console.log(new Error().stack?.split('\n').slice(1, 6).join('\n'));
    DataChannelAdapter.activeAdapters.delete(this);
    this.dc.close();
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
      console.log('[Manual P2P] Data channel is now open and ready!');
      setState(prev => ({ ...prev, channelOpen: true }));
    };

    const handleClose = () => {
      console.log('[Manual P2P] Data channel closed');
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
      console.log('[Manual P2P] Creating offer...');
      setState(prev => ({ ...prev, step: 'creating', error: null }));

      // Generate a host ID
      const hostId = 'manual-host-' + Math.random().toString(36).substr(2, 9);
      hostPlayerIdRef.current = hostId;

      // Create RTCPeerConnection with STUN servers from multiple providers for better connectivity
      const rtcConfig: RTCConfiguration = {
        iceServers: [
          // Google STUN servers (primary)
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          // Cloudflare STUN (backup)
          { urls: 'stun:stun.cloudflare.com:3478' },
          // Twilio STUN (backup)
          { urls: 'stun:global.stun.twilio.com:3478' }
        ]
      };

      console.log('[Manual P2P] Creating RTCPeerConnection with ICE config:', rtcConfig);

      const pc = new RTCPeerConnection(rtcConfig);

      peerConnectionRef.current = pc;

      // Log ICE gathering start for debugging
      console.log('[Manual P2P] Initial ICE gathering state:', pc.iceGatheringState);

      // Create data channel (host initiates) BEFORE creating offer
      const dc = pc.createDataChannel('nexus-game', {
        ordered: true
        // Removed 'protocol: json' as it may cause compatibility issues
      });

      // Create adapter immediately - it will handle data channel opening
      const guestId = 'manual-guest-' + Math.random().toString(36).substr(2, 9);
      const adapter = new DataChannelAdapter(dc, guestId);
      setupConnection(adapter);
      console.log('[Manual P2P] Host: DataChannelAdapter created for guest:', guestId);

      // Wait for ICE gathering to complete before generating code (with extended timeout)
      const iceGatheringComplete = new Promise<void>((resolve) => {
        let resolved = false;
        const timeout = setTimeout(() => {
          if (!resolved) {
            console.warn('[Manual P2P] ICE gathering timeout (5s) - using candidates gathered so far');
            console.warn('[Manual P2P] This may indicate network issues - check firewall/VPN');
            resolved = true;
            resolve();
          }
        }, 5000); // Extended to 5s for slower networks

        if (pc.iceGatheringState === 'complete') {
          clearTimeout(timeout);
          resolve();
          return;
        }
        pc.onicegatheringstatechange = () => {
          console.log('[Manual P2P] ICE gathering state:', pc.iceGatheringState);
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

      console.log('[Manual P2P] Offer created, waiting for ICE gathering (max 5s)...');

      // Wait for ICE gathering to complete
      await iceGatheringComplete;

      // Now get the updated SDP with all ICE candidates
      const finalSdp = pc.localDescription?.sdp || offer.sdp || '';
      console.log('[Manual P2P] ICE gathering complete');
      console.log('[Manual P2P] Final SDP length:', finalSdp.length);
      console.log('[Manual P2P] SDP contains data channel:', finalSdp.includes('application'));

      // Log the setup attribute for debugging
      const hostOfferSetup = finalSdp.match(/a=setup:(\w+)/);
      console.log('[Manual P2P] Host Offer setup attribute:', hostOfferSetup ? hostOfferSetup[1] : 'not found');

      // Generate final code with all candidates
      const message: SDPMessage = {
        type: 'offer',
        sdp: finalSdp || '',
        playerName
      };

      const code = unicodeBase64Encode(JSON.stringify(message));
      setState(prev => ({ ...prev, step: 'waiting_for_answer', localOffer: code, generatedCode: code }));

      pc.onconnectionstatechange = () => {
        console.log('[Manual P2P] Host connection state changed:', pc.connectionState);
        if (pc.connectionState === 'connected') {
          console.log('[Manual P2P] Host: ICE connection fully established!');
          setState(prev => ({ ...prev, noCandidates: false }));
        } else if (pc.connectionState === 'failed') {
          console.error('[Manual P2P] Host: ICE connection failed!');
          console.error('[Manual P2P] Host: ICE connection state:', pc.iceConnectionState);
          console.error('[Manual P2P] Host: Check if both peers are on localhost - try testing on different devices/networks');
          // Set noCandidates flag and error when connection fails
          setState(prev => ({
            ...prev,
            step: 'failed',
            error: 'ICE connection failed - try testing on different devices or networks',
            noCandidates: true
          }));
        } else if (pc.connectionState === 'disconnected') {
          console.warn('[Manual P2P] Host: ICE connection disconnected!');
        }
      };

      // Log ICE candidates for debugging
      let candidatesGathered = 0;
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          candidatesGathered++;
          const candidate = event.candidate.candidate;
          const type = candidate.includes('typ srflx') ? 'srflx (public)' :
                       candidate.includes('typ host') ? 'host (local)' :
                       candidate.includes('typ relay') ? 'relay (TURN)' :
                       candidate.includes('typ prflx') ? 'prflx (peer)' : 'unknown';
          console.log('[Manual P2P] Host ICE candidate:', type, candidate.substring(0, 100));
        } else {
          console.log('[Manual P2P] Host: ICE gathering complete (no more candidates). Total:', candidatesGathered);
          if (candidatesGathered === 0) {
            console.warn('[Manual P2P] ⚠️ No ICE candidates gathered during offer creation!');
            console.warn('[Manual P2P] This is normal for localhost - the warning will only show if connection fails');
          }
        }
      };

      // Log initial ICE state for debugging
      setTimeout(() => {
        console.log('[Manual P2P] Host: ICE gathering state after 1s:', pc.iceGatheringState);
        console.log('[Manual P2P] Host: ICE connection state:', pc.iceConnectionState);
        console.log('[Manual P2P] Host: Local description:', pc.localDescription ? 'set' : 'not set');
      }, 1000);
    } catch (error) {
      console.error('[Manual P2P] Error creating offer:', error);
      setState(prev => ({ ...prev, step: 'failed', error: String(error) }));
    }
  }, []);

  // Guest: Connect to Host
  const connectToHost = useCallback(async (offerCode: string, guestName: string = 'Guest Player', localDispatch?: React.Dispatch<Action>) => {
    try {
      console.log('[Manual P2P] Connecting to host...');
      setState(prev => ({ ...prev, step: 'connecting', error: null }));

      // Store dispatch and guest name for later use when channel opens
      localDispatchRef.current = localDispatch || null;
      guestNameRef.current = guestName;

      // Decode offer
      const offerMessage: SDPMessage = JSON.parse(unicodeBase64Decode(offerCode));

      // Generate guest ID
      const guestId = 'manual-guest-' + Math.random().toString(36).substr(2, 9);
      guestIdRef.current = guestId;

      // Create RTCPeerConnection with STUN servers from multiple providers for better connectivity
      const rtcConfig: RTCConfiguration = {
        iceServers: [
          // Google STUN servers (primary)
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          // Cloudflare STUN (backup)
          { urls: 'stun:stun.cloudflare.com:3478' },
          // Twilio STUN (backup)
          { urls: 'stun:global.stun.twilio.com:3478' }
        ]
      };

      console.log('[Manual P2P] Guest: Creating RTCPeerConnection with ICE config:', rtcConfig);

      const pc = new RTCPeerConnection(rtcConfig);

      // Log ICE gathering start for debugging
      console.log('[Manual P2P] Guest: Initial ICE gathering state:', pc.iceGatheringState);

      peerConnectionRef.current = pc;

      // Listen for data channel from host
      pc.ondatachannel = (event) => {
        console.log('[Manual P2P] Guest: Received data channel from host!');
        console.log('[Manual P2P] Guest: Data channel label:', event.channel.label);
        console.log('[Manual P2P] Guest: Data channel readyState:', event.channel.readyState);
        const dc = event.channel;

        // Log data channel events for debugging
        dc.onopen = () => console.log('[Manual P2P] Guest: Native data channel.onopen fired!');
        dc.onclose = () => console.log('[Manual P2P] Guest: Native data channel.onclose fired!');
        dc.onerror = (err) => console.error('[Manual P2P] Guest: Native data channel.onerror:', err);

        // Create adapter with host's ID (we'll use the offer message to identify)
        const adapter = new DataChannelAdapter(dc, hostPlayerIdRef.current || 'manual-host');
        setupConnection(adapter);
        console.log('[Manual P2P] Guest: DataChannelAdapter created', 'open:', adapter.open);

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

        console.log('[Manual P2P] Guest: Created player object:', myPlayer);

        // When data channel opens, register the guest player with the host
        adapter.on('open', () => {
          console.log('[Manual P2P] Guest: Data channel open, registering with host...');

          // Add ourselves locally (only once)
          if (dispatch) {
            dispatch({ type: 'ADD_PLAYER', payload: myPlayer });
            dispatch({ type: 'SET_ACTIVE_ID', payload: myPlayer.id });
            console.log('[Manual P2P] Guest: Player added locally and set as active');
          } else {
            console.warn('[Manual P2P] Guest: No dispatch available - player not added locally');
          }

          // Small delay to ensure host is ready to receive HELO
          setTimeout(() => {
            // Send HELO to host (only once per connection)
            if (!adapter._heloSent) {
              adapter._heloSent = true;
              console.log('[Manual P2P] Guest: Sending HELO to host...');
              adapter.send({ type: 'HELO', payload: myPlayer });
            } else {
              console.log('[Manual P2P] Guest: HELO already sent, skipping duplicate');
            }
          }, 200);
        });
      };

      // Debug: check if offer contains data channel info
      console.log('[Manual P2P] Guest: Offer SDP length:', offerMessage.sdp.length);
      console.log('[Manual P2P] Guest: Offer contains application data channel:', offerMessage.sdp.includes('application'));

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
            console.warn('[Manual P2P] Guest: ICE gathering timeout (5s) - using candidates gathered so far');
            console.warn('[Manual P2P] This may indicate network issues - check firewall/VPN');
            resolved = true;
            resolve();
          }
        }, 5000); // Extended to 5s for slower networks

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

      // Log original setup attribute for debugging
      const originalSetup = sdp.match(/a=setup:(\w+)/);
      console.log('[Manual P2P] Guest original setup attribute:', originalSetup ? originalSetup[1] : 'not found');

      // Replace setup attribute - try multiple patterns
      if (sdp.includes('a=setup:actpass')) {
        sdp = sdp.replace(/a=setup:actpass/g, 'a=setup:active');
      } else if (sdp.includes('a=setup:holdconn')) {
        sdp = sdp.replace(/a=setup:holdconn/g, 'a=setup:active');
      }

      const newSetup = sdp.match(/a=setup:(\w+)/);
      console.log('[Manual P2P] Guest modified setup attribute:', newSetup ? newSetup[1] : 'not found');

      await pc.setLocalDescription(new RTCSessionDescription({
        type: 'answer',
        sdp: sdp
      }));

      console.log('[Manual P2P] Answer created, waiting for ICE gathering (max 5s)...');

      // Wait for ICE gathering to complete
      await iceGatheringComplete;

      // Get the updated SDP with all ICE candidates
      let finalSdp = pc.localDescription?.sdp || answer.sdp || '';
      console.log('[Manual P2P] Guest ICE gathering complete');
      console.log('[Manual P2P] Guest Answer SDP length:', finalSdp.length);

      // CRITICAL: Modify SDP AFTER ICE gathering to fix setup attribute
      // Browser may have reset it to actpass, so fix it again before sending
      const finalSetupBefore = finalSdp.match(/a=setup:(\w+)/);
      console.log('[Manual P2P] Guest final setup BEFORE fix:', finalSetupBefore ? finalSetupBefore[1] : 'not found');

      if (finalSdp.includes('a=setup:actpass')) {
        finalSdp = finalSdp.replace(/a=setup:actpass/g, 'a=setup:active');
      } else if (finalSdp.includes('a=setup:holdconn')) {
        finalSdp = finalSdp.replace(/a=setup:holdconn/g, 'a=setup:active');
      }

      const finalSetupAfter = finalSdp.match(/a=setup:(\w+)/);
      console.log('[Manual P2P] Guest final setup AFTER fix:', finalSetupAfter ? finalSetupAfter[1] : 'not found');

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
        console.log('[Manual P2P] Guest connection state changed:', pc.connectionState);
        if (pc.connectionState === 'connected') {
          console.log('[Manual P2P] Guest: ICE connection fully established!');
          // Only now set step to 'connected'
          setState(prev => ({ ...prev, step: 'connected', noCandidates: false }));
        } else if (pc.connectionState === 'failed') {
          console.error('[Manual P2P] Guest: ICE connection failed!');
          console.error('[Manual P2P] Guest: ICE connection state:', pc.iceConnectionState);
          console.error('[Manual P2P] Guest: Make sure the host has pasted your answer code and clicked Connect!');
          // Set noCandidates flag when connection fails
          setState(prev => ({ ...prev, noCandidates: true }));
        } else if (pc.connectionState === 'disconnected') {
          console.warn('[Manual P2P] Guest: ICE connection disconnected!');
        }
      };

      // Log ICE candidates for debugging
      let candidatesGathered = 0;
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          candidatesGathered++;
          const candidate = event.candidate.candidate;
          const type = candidate.includes('typ srflx') ? 'srflx (public)' :
                       candidate.includes('typ host') ? 'host (local)' :
                       candidate.includes('typ relay') ? 'relay (TURN)' :
                       candidate.includes('typ prflx') ? 'prflx (peer)' : 'unknown';
          console.log('[Manual P2P] Guest ICE candidate:', type, candidate.substring(0, 100));
        } else {
          console.log('[Manual P2P] Guest: ICE gathering complete (no more candidates). Total:', candidatesGathered);
          if (candidatesGathered === 0) {
            console.warn('[Manual P2P] ⚠️ No ICE candidates gathered during answer creation!');
            console.warn('[Manual P2P] This is normal for localhost - the warning will only show if connection fails');
          }
        }
      };

      // Log initial ICE state for debugging
      setTimeout(() => {
        console.log('[Manual P2P] Guest: ICE gathering state after 1s:', pc.iceGatheringState);
        console.log('[Manual P2P] Guest: ICE connection state:', pc.iceConnectionState);
        console.log('[Manual P2P] Guest: Local description:', pc.localDescription ? 'set' : 'not set');
        console.log('[Manual P2P] Guest: Remote description:', pc.remoteDescription ? 'set' : 'not set');
      }, 1000);
    } catch (error) {
      console.error('[Manual P2P] Error connecting:', error);
      setState(prev => ({ ...prev, step: 'failed', error: String(error) }));
    }
  }, []);

  // Host: Handle Answer from Guest
  const handleGuestAnswer = useCallback(async (answerCode: string) => {
    try {
      console.log('[Manual P2P] Host: Processing guest answer...');
      const answerMessage: SDPMessage = JSON.parse(unicodeBase64Decode(answerCode));
      const pc = peerConnectionRef.current;

      if (!pc) {
        throw new Error('PeerConnection not initialized. Create an offer first.');
      }

      // Log the setup attribute from guest's answer for debugging
      const guestSetup = answerMessage.sdp.match(/a=setup:(\w+)/);
      console.log('[Manual P2P] Host: Guest answer setup attribute:', guestSetup ? guestSetup[1] : 'not found');

      // Set remote description (answer)
      await pc.setRemoteDescription(new RTCSessionDescription({
        type: 'answer',
        sdp: answerMessage.sdp
      }));

      console.log('[Manual P2P] Host: Connection established!');
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
