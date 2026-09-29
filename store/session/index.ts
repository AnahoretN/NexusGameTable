/**
 * Session layer: transports bring players into the game, ONE shared protocol
 * handles all gameplay sync.
 */

export { useGameSession } from './useGameSession';
export type { UseGameSessionReturn } from './useGameSession';
export { useSessionUx, CANONICAL_STEPS } from './sessionUx';
export type { SessionUx, P2PLoadingStep } from './sessionUx';
export {
  createProtocolHandler,
  buildPacksNeeded,
  buildInitialSyncState,
  notifyGuestDisconnected
} from './protocol';
export type { ProtocolDeps, SenderConn } from './protocol';
export type { Transport, PeerConnLike, ConnectionMethod } from './transport';
import { resetP2PSingleton } from '../usePeerConnection';
import { resetIrohSingleton } from '../useIrohConnection';

/** Teardown every transport (CLEAR_SAVED_STATE, page refresh). */
export function resetAllTransports() {
  resetP2PSingleton();
  resetIrohSingleton();
}
