/**
 * Trystero Connection Hook
 *
 * Uses Trystero BitTorrent P2P for completely serverless connections.
 * Works through WebTorrent trackers for peer discovery.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { Action } from './gameActions';
import { Player } from '../types';
import { logger } from '../utils/logger';
import { getPlayerId } from './gameConstants';
import { joinRoom } from 'trystero';

// ============================================================================
// TYPES
// ============================================================================

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

export interface WaitingForPlayerName {
  roomId: string;
}

export interface P2PLoadingStep {
  id: string;
  message: string;
  status: 'pending' | 'loading' | 'success' | 'error';
  progress?: number;
}

export interface UseTrysteroConnectionReturn {
  peerId: string | null;
  isHost: boolean;
  connectionStatus: ConnectionStatus;
  waitingForPlayerName: WaitingForPlayerName | null;
  setPlayerName: (name: string) => void;
  initializeHost: () => void;
  hostConnectionRef: React.RefObject<any>;
  connectionsRef: React.RefObject<any[]>;
  roomRef: React.RefObject<any>;
  p2pLoadingSteps: P2PLoadingStep[];
  p2pLoadingProgress: number;
  isP2PLoadingModalOpen: boolean;
  requiredPacks: Array<{ name: string; hash: string; size: number }>;
  onPackLoaded: (packName: string, hashes: string[]) => void;
  suggestedPlayerName: string;
  roomId: string | null; // Expose room ID for invite links
}

// Trystero room type
type TrysteroRoom = {
  makeAction: (namespace: string) => [(data: any, peerId?: string) => void, (callback: (data: any, peerId: string) => void) => () => void];
  onPeerJoin: (callback: (peerId: string) => void) => () => void;
  onPeerLeave: (callback: (peerId: string) => void) => () => void;
  leave: () => void;
  getPeers: () => string[];
};

// Torrent trackers for Trystero
const TORRENT_TRACKERS = [
  'wss://tracker.btorrent.xyz',
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.webtorrent.dev',
];

// ============================================================================
// HOOK
// ============================================================================

export function useTrysteroConnection(
  localDispatch: React.Dispatch<Action>,
  stateRef: React.RefObject<any>
): UseTrysteroConnectionReturn {
  const [peerId] = useState<string | null>(() => getPlayerId());
  const [isHost, setIsHost] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const params = new URLSearchParams(window.location.search);
    return !params.has('roomId');
  });
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [waitingForPlayerName, setWaitingForName] = useState<WaitingForPlayerName | null>(null);
  const [suggestedPlayerName, setSuggestedPlayerName] = useState<string>('');

  // Refs
  const hostConnectionRef = useRef<any>(null);
  const connectionsRef = useRef<any[]>([]);
  const roomRef = useRef<TrysteroRoom | null>(null);
  const sendRef = useRef<((data: any, peerId?: string) => void) | null>(null);

  // Loading progress
  const [p2pLoadingSteps, setP2pLoadingSteps] = useState<P2PLoadingStep[]>([
    { id: 'connect', message: 'Connecting to BitTorrent trackers...', status: 'pending' },
    { id: 'p2p', message: 'Establishing P2P connection...', status: 'pending' },
    { id: 'handshake', message: 'Handshaking with peer...', status: 'pending' },
  ]);
  const [p2pLoadingProgress, setP2pLoadingProgress] = useState(0);
  const [isP2PLoadingModalOpen, setIsP2PLoadingModalOpen] = useState(false);

  // Packs
  const [requiredPacks, setRequiredPacks] = useState<Array<{ name: string; hash: string; size: number }>>([]);

  // Pending player name
  const pendingPlayerNameRef = useRef<string | null>(null);

  // Room ID for Trystero
  const [roomId, setRoomId] = useState<string | null>(null);

  // ============================================================================
  // UPDATE LOADING STEP
  // ============================================================================

  const updateP2PLoadingStep = useCallback((id: string, status: 'pending' | 'loading' | 'success' | 'error', message?: string) => {
    setP2pLoadingSteps(prev => {
      const updated = prev.map(step =>
        step.id === id ? { ...step, status, message: message || step.message } : step
      );

      // Calculate progress
      const total = updated.length;
      const completed = updated.filter(s => s.status === 'success').length;
      const inProgress = updated.filter(s => s.status === 'loading').length;
      const progress = Math.round(((completed + inProgress * 0.5) / total) * 100);
      setP2pLoadingProgress(progress);

      return updated;
    });
  }, []);

  const resetP2PLoading = useCallback(() => {
    setP2pLoadingSteps([
      { id: 'connect', message: 'Connecting to BitTorrent trackers...', status: 'pending' },
      { id: 'p2p', message: 'Establishing P2P connection...', status: 'pending' },
      { id: 'handshake', message: 'Handshaking with peer...', status: 'pending' },
    ]);
    setP2pLoadingProgress(0);
  }, []);

  // ============================================================================
  // NETWORK DATA HANDLER
  // ============================================================================

  const handleNetworkData = useCallback((data: any, peerId: string) => {
    logger.log('[Trystero] Received data from', peerId, ':', data.type);

    switch (data.type) {
      case 'HELO': {
        const newPlayer: Player = data.payload;
        logger.log('[Trystero] Player joined:', newPlayer.name);

        localDispatch({ type: 'ADD_PLAYER', payload: newPlayer });

        // Send full state to new player
        const state = stateRef.current;
        localDispatch({
          type: 'SYNC_STATE',
          payload: {
            objects: state.objects,
            players: state.players,
            hyperscaleLayers: state.hyperscaleLayers,
          }
        });

        updateP2PLoadingStep('handshake', 'success', 'Handshake complete!');
        break;
      }

      case 'SYNC_STATE': {
        logger.log('[Trystero] Received state sync');
        const { objects, players, hyperscaleLayers } = data.payload;
        localDispatch({ type: 'SYNC_STATE', payload: { objects, players, hyperscaleLayers } });
        updateP2PLoadingStep('state', 'success', 'Game synchronized!');
        break;
      }

      case 'ACTION': {
        localDispatch(data.payload);
        break;
      }

      default:
        logger.warn('[Trystero] Unknown message type:', data.type);
    }
  }, [localDispatch, stateRef, updateP2PLoadingStep]);

  // ============================================================================
  // INITIALIZE HOST
  // ============================================================================

  const initializeHost = useCallback(() => {
    console.log('[Trystero] Initializing host...');

    if (roomRef.current) {
      console.log('[Trystero] Already initialized');
      return;
    }

    updateP2PLoadingStep('connect', 'loading', 'Creating room...');
    setConnectionStatus('connecting');

    // Generate a random room ID
    const newRoomId = `nexus-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setRoomId(newRoomId);

    const config = {
      appId: 'nexus-game-table',
      trackers: TORRENT_TRACKERS,
    };

    console.log('[Trystero] Creating room:', newRoomId);

    const room = joinRoom(config, newRoomId);
    roomRef.current = room;

    // Create messaging action using Trystero's makeAction
    const [send, getData] = room.makeAction('messaging');
    sendRef.current = send;

    // Handle incoming data from any peer
    const unsubscribeData = getData((data: any, peerId: string) => {
      handleNetworkData(data, peerId);
    });

    // Handle peer join
    room.onPeerJoin((peerId: string) => {
      console.log('[Trystero] Peer joined:', peerId);
      connectionsRef.current.push({ peerId, send });
      updateP2PLoadingStep('p2p', 'success', 'P2P connection established');
    });

    // Handle peer leave
    room.onPeerLeave((peerId: string) => {
      console.log('[Trystero] Peer left:', peerId);
      connectionsRef.current = connectionsRef.current.filter(c => c.peerId !== peerId);
    });

    setConnectionStatus('connected');
    updateP2PLoadingStep('connect', 'success', 'Room created: ' + newRoomId.slice(0, 20) + '...');
  }, [updateP2PLoadingStep, handleNetworkData]);

  // ============================================================================
  // CONNECT TO HOST (GUEST)
  // ============================================================================

  const connectToHost = useCallback(async (roomIdToJoin: string, playerName: string) => {
    console.log('[Trystero] Connecting to room:', roomIdToJoin);

    resetP2PLoading();
    updateP2PLoadingStep('connect', 'loading', 'Joining room...');
    setConnectionStatus('connecting');

    const config = {
      appId: 'nexus-game-table',
      trackers: TORRENT_TRACKERS,
    };

    try {
      const room = joinRoom(config, roomIdToJoin);
      roomRef.current = room;
      setRoomId(roomIdToJoin);

      // Create messaging action
      const [send, getData] = room.makeAction('messaging');
      sendRef.current = send;

      // Wait a bit for connection
      await new Promise(resolve => setTimeout(resolve, 2000));

      updateP2PLoadingStep('p2p', 'loading', 'Establishing P2P connection...');

      // Handle incoming data
      getData((data: any, peerId: string) => {
        handleNetworkData(data, peerId);
      });

      // Send HELO to room
      const myPlayer: Player = {
        id: getPlayerId(),
        name: playerName,
        color: '#' + Math.floor(Math.random() * 16777215).toString(16),
        isGM: false
      };

      send({ type: 'HELO', payload: myPlayer });
      localDispatch({ type: 'ADD_PLAYER', payload: myPlayer });
      localDispatch({ type: 'SET_ACTIVE_ID', payload: myPlayer.id });

      setConnectionStatus('connected');
      updateP2PLoadingStep('p2p', 'success', 'Connected to room');
      updateP2PLoadingStep('handshake', 'success', 'Handshake complete');

    } catch (error) {
      console.error('[Trystero] Failed to connect:', error);
      setConnectionStatus('disconnected');
      updateP2PLoadingStep('connect', 'error', 'Failed to connect');
    }
  }, [updateP2PLoadingStep, resetP2PLoading, handleNetworkData, localDispatch]);

  // ============================================================================
  // SET PLAYER NAME
  // ============================================================================

  const setPlayerName = useCallback((name: string) => {
    if (!waitingForPlayerName) return;

    const finalName = name.trim() || suggestedPlayerName || `Player ${Math.floor(Math.random() * 100)}`;
    pendingPlayerNameRef.current = finalName;

    // Connect to host room
    connectToHost(waitingForPlayerName.roomId, finalName);
    setWaitingForName(null);
  }, [waitingForPlayerName, suggestedPlayerName, connectToHost]);

  // ============================================================================
  // ON PACK LOADED
  // ============================================================================

  const onPackLoaded = useCallback((packName: string, hashes: string[]) => {
    // Notify room about pack loading
    const send = sendRef.current;
    if (send) {
      send({
        type: 'PACK_LOADED',
        payload: { packName, hashes }
      });
    }
  }, []);

  // ============================================================================
  // URL CHECK ON MOUNT
  // ============================================================================

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomIdParam = params.get('roomId');

    if (roomIdParam) {
      // Guest mode - show modal for player name
      const playerNum = params.get('playerNum');
      if (playerNum) {
        setSuggestedPlayerName(`Player ${playerNum}`);
      }

      setWaitingForName({
        roomId: roomIdParam
      });

      console.log('[Trystero] Guest mode - room:', roomIdParam);
    } else {
      console.log('[Trystero] Host mode');
    }
  }, []);

  // ============================================================================
  // CLEANUP
  // ============================================================================

  useEffect(() => {
    return () => {
      const room = roomRef.current;
      if (room) {
        room.leave();
        roomRef.current = null;
      }
    };
  }, []);

  // ============================================================================
  // RETURN
  // ============================================================================

  return {
    peerId,
    isHost,
    connectionStatus,
    waitingForPlayerName,
    setPlayerName,
    initializeHost,
    hostConnectionRef,
    connectionsRef,
    roomRef,
    p2pLoadingSteps,
    p2pLoadingProgress,
    isP2PLoadingModalOpen,
    requiredPacks,
    onPackLoaded,
    suggestedPlayerName,
    roomId,
  };
}
