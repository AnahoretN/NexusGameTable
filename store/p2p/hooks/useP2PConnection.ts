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

  // Asset transfer (guest only)
  assetProgress: { loaded: number; total: number; percent: number };

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
  const [assetProgress, setAssetProgress] = useState({ loaded: 0, total: 0, percent: 0 });

  // Refs to avoid recreating managers on rerender
  const managerRef = useRef<ConnectionManager | null>(null);

  // Determine initial role from URL
  const getInitialRole = useCallback((): PlayerRole | null => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    return params.has('hostId') ? PlayerRole.GUEST : null;
  }, []);

  // Handle incoming messages
  const handleMessage = useCallback((message: P2PMessage) => {
    switch (message.type) {
      case MessageType.ACTION:
        dispatch(message.payload as Action);
        break;
      case MessageType.STATE_SNAPSHOT:
        dispatch({ type: 'SYNC_STATE', payload: message.payload });
        break;
      case MessageType.STATE_PATCH:
        // Apply state patch
        break;
      case MessageType.ACK:
        // Handle acknowledgment
        break;
      default:
        logger.warn('[useP2P] Unknown message type:', message.type);
    }
  }, [dispatch]);

  // Initialize connection manager
  useEffect(() => {
    const initialRole = getInitialRole();
    setRole(initialRole);

    const manager = new ConnectionManager({
      onStateChange: setState,
      onGuestConnected: (guestId) => {
        logger.log(`[useP2P] Guest connected: ${guestId}`);
        // Asset manifest is sent automatically by ConnectionManager
      },
      onGuestDisconnected: (guestId) => {
        logger.log(`[useP2P] Guest disconnected: ${guestId}`);
      },
      onConnectedToHost: (hostId) => {
        logger.log(`[useP2P] Connected to host: ${hostId}`);
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
  }, [getInitialRole, handleMessage]);

  // Initialize as host
  const initializeHost = useCallback(async (): Promise<string> => {
    if (!managerRef.current) {
      throw new Error('Connection manager not initialized');
    }

    try {
      const id = await managerRef.current.initializeAsHost();
      setPeerId(id);
      setRole(PlayerRole.HOST);
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
  }, []);

  // Send action
  const sendAction = useCallback((action: Action) => {
    if (!managerRef.current) return;

    const currentRole = managerRef.current.getRole();

    if (currentRole === PlayerRole.HOST) {
      // Host broadcasts to all guests
      // This is handled by the state sync system
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
    assetProgress,
    lastError,
    clearError,
  };
}
