/**
 * useP2PConnection Hook
 * Main React hook for P2P connection management
 *
 * This hook provides a simple API for connecting as host or guest,
 * and manages the underlying ConnectionManager.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Action } from '../../gameActions';
import {
  ConnectionManager,
  ConnectionState,
  PlayerRole,
  P2PError,
  P2PErrorType,
  createHostP2PSystem,
  createGuestP2PSystem,
} from '../';
import { P2PMessage, MessageType } from '../protocol/messages';
import { logger } from '../../../utils/logger';
import { getPlayerId } from '../../gameConstants';

// ============================================================================
// RETURN TYPE
// ============================================================================

export interface UseP2PConnectionReturn {
  // Connection state
  state: ConnectionState;
  role: PlayerRole | null;
  peerId: string | null;

  // Actions
  initializeHost: () => Promise<string>;
  connectToHost: (hostId: string) => Promise<boolean>;
  disconnect: () => void;

  // Messaging
  sendAction: (action: Action) => void;

  // Image transfer (guest only)
  imageProgress: { loaded: number; total: number; percent: number };

  // Errors
  lastError: P2PError | null;
  clearError: () => void;
}

// ============================================================================
// HOOK
// ============================================================================

export function useP2PConnection(dispatch: (action: Action) => void): UseP2PConnectionReturn {
  const [state, setState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [role, setRole] = useState<PlayerRole | null>(null);
  const [peerId, setPeerId] = useState<string | null>(null);
  const [lastError, setLastError] = useState<P2PError | null>(null);
  const [imageProgress, setImageProgress] = useState({ loaded: 0, total: 0, percent: 0 });

  // Refs to avoid recreating managers on rerender
  const managerRef = useRef<ConnectionManager | null>(null);
  const hostSystemRef = useRef<ReturnType<typeof createHostP2PSystem> | null>(null);
  const guestSystemRef = useRef<ReturnType<typeof createGuestP2PSystem> | null>(null);

  // Determine initial role from URL
  const getInitialRole = useCallback((): PlayerRole | null => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    return params.has('hostId') ? PlayerRole.GUEST : null;
  }, []);

  // Initialize connection manager
  useEffect(() => {
    const initialRole = getInitialRole();
    setRole(initialRole);

    const manager = new ConnectionManager({
      onStateChange: setState,
      onGuestConnected: (guestId, connection) => {
        logger.log(`[useP2P] Guest connected: ${guestId}`);

        // Send image manifest
        if (hostSystemRef.current) {
          hostSystemRef.current.imageTransfer.sendManifest(guestId, connection);
        }

        // Add to state sync
        if (hostSystemRef.current) {
          hostSystemRef.current.stateSync.addGuest(guestId, connection);
        }
      },
      onGuestDisconnected: (guestId) => {
        logger.log(`[useP2P] Guest disconnected: ${guestId}`);

        if (hostSystemRef.current) {
          hostSystemRef.current.imageTransfer.guestDisconnected(guestId);
          hostSystemRef.current.stateSync.removeGuest(guestId);
        }
      },
      onConnectedToHost: (hostId) => {
        logger.log(`[useP2P] Connected to host: ${hostId}`);

        // Set connection for guest systems
        if (guestSystemRef.current) {
          guestSystemRef.current.imageTransfer.setConnection(
            manager.getHostConnection()!
          );
          guestSystemRef.current.stateSync.setConnection(
            manager.getHostConnection()!
          );
        }
      },
      onDisconnected: () => {
        logger.log('[useP2P] Disconnected from host');
      },
      onError: setLastError,
      onMessage: handleMessage,
    });

    managerRef.current = manager;

    return () => {
      manager.disconnect();
    };
  }, [getInitialRole]);

  // Handle incoming messages
  const handleMessage = useCallback((message: P2PMessage, peerId?: string) => {
    switch (message.type) {
      case MessageType.IMAGE_MANIFEST:
        if (guestSystemRef.current) {
          guestSystemRef.current.imageTransfer.handleManifest(message.payload);
          updateImageProgress();
        }
        break;

      case MessageType.IMAGE_CHUNK:
        if (guestSystemRef.current) {
          const completed = guestSystemRef.current.imageTransfer.handleChunk(message.payload);
          if (completed) {
            updateImageProgress();
          }
        }
        break;

      case MessageType.IMAGE_REQUEST:
        if (hostSystemRef.current && peerId) {
          hostSystemRef.current.imageTransfer.handleImageRequest(
            peerId,
            message.payload,
            managerRef.current?.getGuestConnections().get(peerId)!
          );
        }
        break;

      case MessageType.STATE_SNAPSHOT:
        if (guestSystemRef.current) {
          guestSystemRef.current.stateSync.handleSnapshot(message.payload, dispatch);
        }
        break;

      case MessageType.STATE_PATCH:
        if (guestSystemRef.current) {
          guestSystemRef.current.stateSync.handlePatch(message.payload, dispatch);
        }
        break;

      case MessageType.ACTION:
        if (guestSystemRef.current) {
          guestSystemRef.current.stateSync.handleAction(message.payload, dispatch);
        }
        break;

      case MessageType.ACK:
        if (hostSystemRef.current && peerId) {
          hostSystemRef.current.stateSync.handleAck(peerId, message.payload.messageId);
        }
        break;

      default:
        logger.warn('[useP2P] Unknown message type:', message.type);
    }
  }, []);

  // Update image progress
  const updateImageProgress = useCallback(() => {
    if (guestSystemRef.current) {
      setImageProgress(guestSystemRef.current.imageTransfer.getProgress());
    }
  }, []);

  // Initialize as host
  const initializeHost = useCallback(async (): Promise<string> => {
    if (!managerRef.current) {
      throw new Error('Connection manager not initialized');
    }

    try {
      const id = await managerRef.current.initializeAsHost();
      setPeerId(id);
      setRole(PlayerRole.HOST);

      // Create host system
      hostSystemRef.current = createHostP2PSystem(managerRef.current);

      return id;
    } catch (error) {
      if (error instanceof P2PError) {
        setLastError(error);
      } else {
        setLastError(new P2PError(P2PErrorType.CONNECTION_FAILED, 'Unknown error', error));
      }
      throw error;
    }
  }, []);

  // Connect to host
  const connectToHost = useCallback(async (hostId: string): Promise<boolean> => {
    if (!managerRef.current) {
      throw new Error('Connection manager not initialized');
    }

    try {
      const success = await managerRef.current.connectToHost(hostId);

      if (success) {
        setRole(PlayerRole.GUEST);

        // Create guest system
        guestSystemRef.current = createGuestP2PSystem(managerRef.current);

        // Set up image progress callback
        guestSystemRef.current.imageTransfer.onAllImagesLoaded(() => {
          logger.log('[useP2P] All images loaded!');
        });
      }

      return success;
    } catch (error) {
      if (error instanceof P2PError) {
        setLastError(error);
      } else {
        setLastError(new P2PError(P2PErrorType.CONNECTION_FAILED, 'Unknown error', error));
      }
      return false;
    }
  }, []);

  // Disconnect
  const disconnect = useCallback(() => {
    if (managerRef.current) {
      managerRef.current.disconnect();
    }

    setPeerId(null);
    setRole(null);
    setState(ConnectionState.DISCONNECTED);

    if (hostSystemRef.current) {
      hostSystemRef.current = null;
    }

    if (guestSystemRef.current) {
      guestSystemRef.current.imageTransfer.cleanup();
      guestSystemRef.current = null;
    }
  }, []);

  // Send action
  const sendAction = useCallback((action: Action) => {
    if (!managerRef.current) return;

    const currentRole = managerRef.current.getRole();

    if (currentRole === PlayerRole.HOST && hostSystemRef.current) {
      // Record and broadcast
      hostSystemRef.current.stateSync.recordAndBroadcast(action, getPlayerId());
    } else if (currentRole === PlayerRole.GUEST && managerRef.current.getHostConnection()) {
      // Send to host
      const message = {
        type: MessageType.ACTION,
        payload: {
          type: action.type,
          payload: action.payload,
          timestamp: Date.now(),
          playerId: getPlayerId(),
        },
      };

      try {
        managerRef.current.sendToHost(message);
      } catch (error) {
        logger.error('[useP2P] Error sending action:', error);
      }
    }
  }, []);

  // Clear error
  const clearError = useCallback(() => {
    setLastError(null);
  }, []);

  return {
    state,
    role,
    peerId,
    initializeHost,
    connectToHost,
    disconnect,
    sendAction,
    imageProgress,
    lastError,
    clearError,
  };
}
