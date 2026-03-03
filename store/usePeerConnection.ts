import { useEffect, useRef, useCallback, useState } from 'react';
import { Peer } from 'peerjs';
import { Action } from './gameActions';
import { Player } from '../types';
import { logger } from '../utils/logger';
import { extractImagesFromState, restoreImagesFromCache } from '../utils/imageCache';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';
export type ImageCache = Record<string, string>; // imageId -> base64 data

export interface WaitingForPlayerName {
  hostId: string;
}

export interface UsePeerConnectionReturn {
  peerId: string | null;
  isHost: boolean;
  connectionStatus: ConnectionStatus;
  waitingForPlayerName: WaitingForPlayerName | null;
  setPlayerName: (name: string) => void;
  hostConnectionRef: React.RefObject<any>;
  connectionsRef: React.RefObject<any[]>;
  imageCachesRef: React.RefObject<Map<string, ImageCache>>; // Map<peerId, ImageCache>
}

/**
 * Hook for managing Peer.js WebRTC connections
 * Handles both host and guest connection logic
 *
 * @param localDispatch - Local dispatcher for actions
 * @param stateRef - Ref to current state (for syncing)
 */
export function usePeerConnection(
  localDispatch: React.Dispatch<Action>,
  stateRef: React.RefObject<any>
): UsePeerConnectionReturn {
  const [isHost, setIsHost] = useState(true);
  const [peerId, setPeerId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [waitingForPlayerName, setWaitingForPlayerName] = useState<WaitingForPlayerName | null>(null);

  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<any[]>([]); // For Host: list of guest connections
  const hostConnectionRef = useRef<any>(null); // For Guest: connection to host
  const imageCachesRef = useRef<Map<string, ImageCache>>(new Map()); // Track sent images per guest
  const localImageCacheRef = useRef<ImageCache>({}); // Guest's local image cache

  // Central Network Data Handler
  const handleNetworkData = useCallback((data: any, senderConn: any) => {
    if (data.type === 'SYNC_STATE') {
      // Received full state update (Guest receives from Host)
      // Images in state are references - restore them from local cache
      const payloadSize = JSON.stringify(data.payload).length;
      console.log(`[P2P Debug Guest] Received SYNC_STATE, size: ${payloadSize} chars`);

      // Restore images from local cache before dispatching
      const restoredState = restoreImagesFromCache(data.payload, localImageCacheRef.current);

      localDispatch({ type: 'SYNC_STATE', payload: restoredState });
    } else if (data.type === 'IMAGE_CACHE') {
      // Received image cache from host (Guest only)
      const newImages = data.payload;
      console.log(`[P2P Debug Guest] Received IMAGE_CACHE with ${Object.keys(newImages).length} images, total size: ${JSON.stringify(newImages).length} chars`);
      localImageCacheRef.current = { ...localImageCacheRef.current, ...newImages };
      // Re-dispatch to update state with restored images
      localDispatch({ type: 'RESTORE_IMAGES', payload: newImages });
    } else if (data.type === 'HELO') {
      // Host received new player info
      const newPlayer = data.payload;
      localDispatch({ type: 'ADD_PLAYER', payload: newPlayer });
    } else if (data.type === 'UPDATE_PLAYER_NAME') {
      // Host received player name update request
      localDispatch(data.payload);
    } else if (data.type === 'ACTION') {
      // Host received action request from Guest
      localDispatch(data.payload);
    }
  }, [localDispatch]);

  // Connect to Host Logic (Guest Side)
  const connectToHost = useCallback((hostId: string, playerName: string) => {
    const peer = new Peer();
    peerRef.current = peer;

    peer.on('open', (id) => {
      setPeerId(id);
      setIsHost(false);
      setConnectionStatus('connecting');

      const conn = peer.connect(hostId);
      hostConnectionRef.current = conn;

      conn.on('open', () => {
        setConnectionStatus('connected');

        const myPlayer: Player = {
          id: peer.id,
          name: playerName.trim() || `Player ${Math.floor(Math.random() * 100)}`,
          color: '#' + Math.floor(Math.random() * 16777215).toString(16),
          isGM: false
        };

        // Add ourselves locally
        localDispatch({ type: 'ADD_PLAYER', payload: myPlayer });
        localDispatch({ type: 'SET_ACTIVE_ID', payload: myPlayer.id });

        // Tell Host we are here
        conn.send({ type: 'HELO', payload: myPlayer });
      });

      conn.on('data', (data: any) => {
        handleNetworkData(data, null);
      });

      conn.on('close', () => {
        alert("Connection to Host lost");
        setConnectionStatus('disconnected');
        setWaitingForPlayerName(null);
      });

      conn.on('error', (err) => {
        logger.error("Connection error to host:", err);
        alert("Failed to connect to host");
        setConnectionStatus('disconnected');
        setWaitingForPlayerName(null);
      });
    });

    peer.on('error', (err) => {
      logger.error('Peer error:', err);
      alert("Failed to connect to peer server");
      setConnectionStatus('disconnected');
      setWaitingForPlayerName(null);
    });
  }, [localDispatch, handleNetworkData]);

  // Handler for when player submits their name via modal (joining a game)
  const setPlayerName = useCallback((name: string) => {
    if (!waitingForPlayerName) return;

    const { hostId } = waitingForPlayerName;
    setWaitingForPlayerName(null);
    connectToHost(hostId, name.trim() || `Player ${Math.floor(Math.random() * 100)}`);
  }, [waitingForPlayerName, connectToHost]);

  // PEERJS SETUP
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hostIdToJoin = params.get('hostId');

    // Cleanup previous peer if exists (React StrictMode double render handling)
    if (peerRef.current) return;

    // If we have a hostId in URL, show modal for player name first
    if (hostIdToJoin) {
      setWaitingForPlayerName({ hostId: hostIdToJoin });
      return;
    }

    // No hostId - we are host, create peer immediately
    const peer = new Peer();
    peerRef.current = peer;

    peer.on('open', (id) => {
      setPeerId(id);
      setIsHost(true);
      setConnectionStatus('connected');
    });

    // Handle incoming connections (If we are Host)
    peer.on('connection', (conn) => {
      conn.on('open', () => {
        connectionsRef.current.push(conn);

        // Send current state to new player with image references
        // Also send all images in cache
        const { state: stateWithRefs, imageCache } = extractImagesFromState(stateRef.current);

        conn.send({ type: 'SYNC_STATE', payload: stateWithRefs });
        if (Object.keys(imageCache).length > 0) {
          conn.send({ type: 'IMAGE_CACHE', payload: imageCache });
        }

        // Initialize cache for this guest
        imageCachesRef.current.set(conn.peer, imageCache);

        // Listen for data from this guest
        conn.on('data', (data: any) => {
          handleNetworkData(data, conn);
        });

        // Handle Disconnection
        conn.on('close', () => {
          connectionsRef.current = connectionsRef.current.filter(c => c !== conn);
          localDispatch({ type: 'REMOVE_PLAYER', payload: { id: conn.peer } });
        });

        conn.on('error', (err) => {
          logger.error('Connection error with guest:', err);
          connectionsRef.current = connectionsRef.current.filter(c => c !== conn);
          localDispatch({ type: 'REMOVE_PLAYER', payload: { id: conn.peer } });
        });
      });
    });

    peer.on('error', (err) => {
      logger.error('Peer error:', err);
      setConnectionStatus('disconnected');
    });

    // Cleanup logic to destroy peer on window close/reload
    const handleUnload = () => {
      if (peerRef.current) {
        peerRef.current.destroy();
      }
    };
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [localDispatch, handleNetworkData, stateRef]);

  return {
    peerId,
    isHost,
    connectionStatus,
    waitingForPlayerName,
    setPlayerName,
    hostConnectionRef,
    connectionsRef,
    imageCachesRef,
  };
}
