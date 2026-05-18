/**
 * Authoritative Sync Middleware
 *
 * Integrates the new authoritative sync system with the existing GameContext.
 * This middleware intercepts Redux actions and handles P2P synchronization.
 */

import { Middleware } from '@reduxjs/toolkit';
import { Action } from '../../gameActions';
import { logger } from '../../../utils/logger';
import { getPlayerId } from '../../gameConstants';

// Import sync components
import { shouldSyncAction, reduxActionToGameAction } from '../sync/HostEventQueue';
import { GuestStateManager } from '../sync/GuestStateManager';
import { AuthMessageFactory } from '../protocol/authoritativeMessages';

// ============================================================================
// TYPES
// ============================================================================

export interface SyncState {
  isHost: boolean;
  isConnected: boolean;
  hostConnection: any;  // PeerJS connection
  connections: any[];   // Guest connections (for host)
  guestStateManager?: GuestStateManager;
}

// ============================================================================
// MIDDLEWARE
// ============================================================================

/**
 * Creates the authoritative sync middleware
 *
 * This middleware:
 * 1. Intercepts Redux actions
 * 2. Checks if they should be synced
 * 3. Sends to host (if guest) or broadcasts to guests (if host)
 * 4. Prevents re-broadcasting of actions from host
 */
export function createAuthoritativeMiddleware(): Middleware {
  // Global sync state (will be set by useAuthoritativeSync)
  let syncState: SyncState | null = null;

  /**
   * Set the current sync state
   * Called by useAuthoritativeSync hook
   */
  const setSyncState = (state: SyncState | null) => {
    syncState = state;
  };

  /**
   * Get the current sync state
   */
  const getSyncState = (): SyncState | null => {
    return syncState;
  };

  /**
   * The middleware function
   */
  const middleware: Middleware = (store) => (next) => (action: Action) => {
    // First, apply the action locally
    const result = next(action);

    // Then handle P2P sync if connected
    if (!syncState || !syncState.isConnected) {
      return result;
    }

    // Check if this action should be synced
    if (!shouldSyncAction(action.type)) {
      return result;
    }

    // Check if this action came from host (don't re-broadcast)
    if ((action as any)._fromHost || (action as any).skipNetworkSync) {
      return result;
    }

    // Handle sync based on role
    if (syncState.isHost) {
      // Host: broadcast to all guests
      broadcastToGuests(action, syncState);
    } else {
      // Guest: send to host
      sendToHost(action, syncState);
    }

    return result;
  };

  return { middleware, setSyncState, getSyncState };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Broadcast action to all connected guests (host only)
 */
function broadcastToGuests(action: Action, syncState: SyncState): void {
  const { connections } = syncState;

  if (connections.length === 0) {
    return;
  }

  // Convert Redux action to GameAction
  const gameAction = reduxActionToGameAction(action);

  // Create event message
  const message = AuthMessageFactory.createGameEvent(
    getPlayerId(),
    gameAction
  );

  // Broadcast to all guests
  let sentCount = 0;
  for (const conn of connections) {
    if (conn.open) {
      try {
        conn.send(message);
        sentCount++;
      } catch (error) {
        logger.error('[AuthMiddleware] Failed to send to guest:', error);
      }
    }
  }

  if (sentCount > 0) {
    logger.debug(`[AuthMiddleware] Broadcast ${action.type} to ${sentCount} guests`);
  }
}

/**
 * Send action to host (guest only)
 */
function sendToHost(action: Action, syncState: SyncState): void {
  const { hostConnection, guestStateManager } = syncState;

  if (!hostConnection || !hostConnection.open) {
    return;
  }

  if (!guestStateManager) {
    return;
  }

  // Convert Redux action to GameAction
  const gameAction = reduxActionToGameAction(action);

  // Check if we should send this event (rate limiting, deduplication)
  if (!guestStateManager.shouldSendEvent(gameAction)) {
    return;
  }

  // Create and send event message
  const message = guestStateManager.createEventMessage(gameAction);

  try {
    hostConnection.send(message);
    logger.debug(`[AuthMiddleware] Sent ${action.type} to host`);
  } catch (error) {
    logger.error('[AuthMiddleware] Failed to send to host:', error);
  }
}

// ============================================================================
// GLOBAL MIDDLEWARE INSTANCE
// ============================================================================

/**
 * Global middleware instance for use outside of Redux store
 * This allows useAuthoritativeSync to access the middleware
 */
let globalMiddlewareInstance: ReturnType<typeof createAuthoritativeMiddleware> | null = null;

/**
 * Get or create the global middleware instance
 */
export function getGlobalAuthoritativeMiddleware() {
  if (!globalMiddlewareInstance) {
    globalMiddlewareInstance = createAuthoritativeMiddleware();
  }
  return globalMiddlewareInstance;
}

/**
 * Update sync state (called by useAuthoritativeSync)
 */
export function updateSyncState(state: SyncState | null) {
  const middleware = getGlobalAuthoritativeMiddleware();
  middleware.setSyncState(state);
}

/**
 * Get current sync state
 */
export function getSyncState(): SyncState | null {
  const middleware = getGlobalAuthoritativeMiddleware();
  return middleware.getSyncState();
}
