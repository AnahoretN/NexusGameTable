/**
 * The ONE session hook.
 *
 * Composes the transports (peerjs / trystero / iroh) and exposes a single
 * method-agnostic surface. GameContext consumes only this hook — all gameplay
 * sync flows through the shared protocol in store/session/protocol.ts.
 *
 * NOTE: transports keep their own isHost semantics on purpose:
 *   - peerjs: host after initializeHost() is called
 *   - trystero/iroh: derived from URL (?roomId / ?ticket) at mount
 */

import { Action } from '../gameActions';
import { usePeerConnection } from '../usePeerConnection';
import { useIrohConnection } from '../useIrohConnection';
import { useTrysteroConnection } from '../useTrysteroConnection';
import type { ConnectionMethod } from '../../utils/localSettings';

export interface UseGameSessionReturn {
  peerId: string | null;
  isHost: boolean;
  connectionStatus: 'disconnected' | 'connecting' | 'connected';
  waitingForPlayerName: { hostId: string } | null;
  setPlayerName: (name: string) => void;
  initializeHost: () => void;
  hostConnectionRef: React.RefObject<any>;
  connectionsRef: React.RefObject<any[]>;
  p2pLoadingSteps: any[];
  p2pLoadingProgress: number;
  requiredPacks: Array<{ name: string; hash: string; size: number }>;
  onPackLoaded: (packName: string, hashes: string[]) => void;
  onJoinWithoutPacks: () => void;
  suggestedPlayerName: string;
  // Method-specific extras (null for other methods)
  nodeId: string | null;
  ticket: string | null;
  roomId: string | null;
}

export function useGameSession(
  localDispatch: React.Dispatch<Action>,
  stateRef: React.RefObject<any>,
  connectionMethod: ConnectionMethod
): UseGameSessionReturn {
  // Transports are instantiated unconditionally (React hooks rules);
  // only the active one actually initializes.
  const peerJsConn = usePeerConnection(localDispatch, stateRef, connectionMethod);
  const irohConn = useIrohConnection(localDispatch, stateRef);
  const trysteroConn = useTrysteroConnection(localDispatch, stateRef);

  const peerId = connectionMethod === 'iroh' ? irohConn.peerId
    : connectionMethod === 'trystero' ? trysteroConn.peerId
    : peerJsConn.peerId;

  const isHost = connectionMethod === 'iroh' ? irohConn.isHost
    : connectionMethod === 'trystero' ? trysteroConn.isHost
    : peerJsConn.isHost;

  const connectionStatus = connectionMethod === 'iroh' ? irohConn.connectionStatus
    : connectionMethod === 'trystero' ? trysteroConn.connectionStatus
    : peerJsConn.connectionStatus;

  const waitingForPlayerName = connectionMethod === 'iroh'
    ? (irohConn.waitingForPlayerName ? { hostId: irohConn.waitingForPlayerName.nodeId || irohConn.waitingForPlayerName.ticket || '' } : null)
    : connectionMethod === 'trystero'
    ? (trysteroConn.waitingForPlayerName ? { hostId: trysteroConn.waitingForPlayerName.roomId } : null)
    : peerJsConn.waitingForPlayerName;

  const setPlayerName = connectionMethod === 'iroh' ? irohConn.setPlayerName
    : connectionMethod === 'trystero' ? trysteroConn.setPlayerName
    : peerJsConn.setPlayerName;

  const initializeHost = connectionMethod === 'iroh' ? irohConn.initializeHost
    : connectionMethod === 'trystero' ? trysteroConn.initializeHost
    : peerJsConn.initializeHost;

  const hostConnectionRef = connectionMethod === 'iroh' ? irohConn.hostConnectionRef
    : connectionMethod === 'trystero' ? trysteroConn.hostConnectionRef
    : peerJsConn.hostConnectionRef;

  const connectionsRef = connectionMethod === 'iroh' ? irohConn.connectionsRef
    : connectionMethod === 'trystero' ? trysteroConn.connectionsRef
    : peerJsConn.connectionsRef;

  const p2pLoadingSteps = connectionMethod === 'iroh' ? irohConn.p2pLoadingSteps
    : connectionMethod === 'trystero' ? trysteroConn.p2pLoadingSteps
    : peerJsConn.p2pLoadingSteps;

  const p2pLoadingProgress = connectionMethod === 'iroh' ? irohConn.p2pLoadingProgress
    : connectionMethod === 'trystero' ? trysteroConn.p2pLoadingProgress
    : peerJsConn.p2pLoadingProgress;

  const requiredPacks = connectionMethod === 'iroh' ? irohConn.requiredPacks
    : connectionMethod === 'trystero' ? trysteroConn.requiredPacks
    : peerJsConn.requiredPacks;

  const onPackLoaded = connectionMethod === 'iroh' ? irohConn.onPackLoaded
    : connectionMethod === 'trystero' ? trysteroConn.onPackLoaded
    : peerJsConn.onPackLoaded;

  const onJoinWithoutPacks = connectionMethod === 'iroh' ? irohConn.onJoinWithoutPacks
    : connectionMethod === 'trystero' ? trysteroConn.onJoinWithoutPacks
    : peerJsConn.onJoinWithoutPacks;

  const suggestedPlayerName = connectionMethod === 'iroh' ? irohConn.suggestedPlayerName
    : connectionMethod === 'trystero' ? trysteroConn.suggestedPlayerName
    : peerJsConn.suggestedPlayerName;

  const nodeId = connectionMethod === 'iroh' ? irohConn.nodeId : null;
  const ticket = connectionMethod === 'iroh' ? irohConn.ticket : null;
  const roomId = connectionMethod === 'trystero' ? trysteroConn.roomId : null;

  return {
    peerId,
    isHost,
    connectionStatus,
    waitingForPlayerName,
    setPlayerName,
    initializeHost,
    hostConnectionRef,
    connectionsRef,
    p2pLoadingSteps,
    p2pLoadingProgress,
    requiredPacks,
    onPackLoaded,
    onJoinWithoutPacks,
    suggestedPlayerName,
    nodeId,
    ticket,
    roomId,
  };
}
