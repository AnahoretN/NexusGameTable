/**
 * WebRTC Optimization Utilities
 * Provides throttling and optimization functions for WebRTC communication
 */

import { logger } from './logger';

// Throttle configuration
interface ThrottleConfig {
  interval: number; // milliseconds
  leading: boolean; // call on first trigger
  trailing: boolean; // call on last trigger
}

// Throttled function wrapper
class ThrottledFunction<T extends (...args: any[]) => any> {
  private lastCallTime = 0;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private lastArgs: Parameters<T> | null = null;

  constructor(
    private func: T,
    private config: ThrottleConfig
  ) {}

  execute(...args: Parameters<T>): void {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCallTime;

    // Clear any pending timeout
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    // Store arguments for trailing call
    this.lastArgs = args;

    // Leading edge call (first trigger)
    if (this.config.leading && timeSinceLastCall >= this.config.interval) {
      this.lastCallTime = now;
      this.func(...args);
      return;
    }

    // Trailing edge call (last trigger)
    if (this.config.trailing) {
      this.timeoutId = setTimeout(() => {
        this.lastCallTime = Date.now();
        if (this.lastArgs) {
          this.func(...this.lastArgs);
        }
        this.timeoutId = null;
      }, this.config.interval - timeSinceLastCall);
    }
  }

  cancel(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.lastArgs = null;
  }
}

// Debounce function wrapper
class DebouncedFunction<T extends (...args: any[]) => any> {
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private func: T,
    private delay: number
  ) {}

  execute(...args: Parameters<T>): void {
    // Clear any pending timeout
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    // Set new timeout
    this.timeoutId = setTimeout(() => {
      this.func(...args);
      this.timeoutId = null;
    }, this.delay);
  }

  cancel(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  flush(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
      // Execute immediately with stored arguments would go here
      // but we don't store them in simple debounce
    }
  }
}

// WebRTC optimization configuration
export const WEBRTC_OPTIMIZATION_CONFIG = {
  // Throttle state sync to max once per 100ms (balanced between responsiveness and bandwidth)
  STATE_SYNC_THROTTLE: 100,

  // Debounce panel settings sync to wait 300ms after last change
  PANEL_SETTINGS_DEBOUNCE: 300,

  // Core STUN servers (most reliable)
  OPTIMIZED_ICE_SERVERS: [
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],

  // Additional fallback STUN servers for countries with restricted internet
  FALLBACK_ICE_SERVERS: [
    { urls: 'stun:stun.nextcloud.com:443' },
    { urls: 'stun:stun.framasoft.org:443' },
    { urls: 'stun:stun.miwifi.com:3478' },
    { urls: 'stun:stun.voip.blackberry.com:3478' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    // Microsoft STUN servers
    { urls: 'stun:stun.services.mozilla.com:3478' },
  ],

  // 🔥 NEW: TURN servers for relay when direct connection fails
  // Using public TURN servers (for production, use your own or commercial service)
  TURN_SERVERS: [
    // OpenRelay (free public TURN) - most reliable
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],

  // Increase polling intervals for better performance
  POLLING_INTERVAL: 1000, // Increased from 500ms
  PING_INTERVAL: 5000,    // Increased from 1000ms

  // Differential sync thresholds
  MAX_CHANGES_FOR_FULL_SYNC: 50, // If >50 changes, send full state
  MAX_PARTIAL_OBJECTS: 20,       // Max objects in partial sync

  // 🔥 NEW: Connection timeouts
  CONNECTION_TIMEOUT: 30000,      // 30 seconds for P2P connection
  ICE_GATHERING_TIMEOUT: 15000,   // 15 seconds for ICE gathering
};

// Throttle function creator
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  interval: number,
  { leading = true, trailing = true }: Partial<ThrottleConfig> = {}
): ThrottledFunction<T> {
  return new ThrottledFunction(func, { interval, leading, trailing });
}

// Debounce function creator
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): DebouncedFunction<T> {
  return new DebouncedFunction(func, delay);
}

// Actions that REMOVE objects from state — their changes become tombstones
// (see getPartialState) so guests learn about deletions from partial sync.
const DELETION_ACTIONS = new Set(['DELETE_OBJECT', 'DELETE_DICE_GROUP', 'DELETE_DRAWING_LAYER']);

// Payload field that carries the removed object's id per deletion action
const DELETION_ID_FIELD: Record<string, string> = {
  DELETE_OBJECT: 'id',
  DELETE_DICE_GROUP: 'groupId',
  DELETE_DRAWING_LAYER: 'layerId',
};

// Differential sync for state changes
interface ChangeSet {
  type: 'object' | 'player' | 'ui';
  action: any;
  timestamp: number;
  // 🔧 Deletions: object ids removed by this action that are no longer
  // recoverable from current state (e.g. dice inside a deleted group)
  extraIds?: string[];
}

class DifferentialSyncManager {
  private pendingChanges: ChangeSet[] = [];
  private syncInProgress = false;
  // 🔧 Object ids present at the last partial sync — the diff against current
  // state yields ALL removals (cascades, dice groups, any code path), which
  // are sent as tombstones so guests delete in step with the host.
  private lastKnownIds: Set<string> | null = null;

  addChange(change: ChangeSet): void {
    this.pendingChanges.push(change);
  }

  shouldSendFullState(): boolean {
    return this.pendingChanges.length > WEBRTC_OPTIMIZATION_CONFIG.MAX_CHANGES_FOR_FULL_SYNC;
  }

  // 🔧 Full sync replaces everything on the guest — rebase the diff baseline
  resetKnownIds(objects: Record<string, unknown>): void {
    this.lastKnownIds = new Set(Object.keys(objects));
  }

  // Filter out changes for objects that don't exist in current state
  // (e.g., individual objects that were filtered from broadcast)
  filterInvalidChanges(currentState: any): void {
    const validChanges: ChangeSet[] = [];
    for (const change of this.pendingChanges) {
      if (change.type === 'object' && change.action.payload?.id) {
        const objId = change.action.payload.id;
        // 🔧 Deletion changes reference objects that are already gone — keep them
        const isDeletion = DELETION_ACTIONS.has(change.action.type) || Array.isArray(change.extraIds);
        if (isDeletion || currentState.objects[objId]) {
          validChanges.push(change);
        }
      } else {
        validChanges.push(change);
      }
    }
    const removedCount = this.pendingChanges.length - validChanges.length;
    if (removedCount > 0) {
      logger.debug('[DifferentialSyncManager] filtered out invalid changes:', removedCount, 'remaining:', validChanges.length);
    }
    this.pendingChanges = validChanges;
  }

  getPartialState(currentState: any, currentStateTime: number): any {
    const changedObjectIds = new Set<string>();
    const hasPlayerChanges = this.pendingChanges.some(c => c.type === 'player');
    // 🔧 Deletions: objects removed on the host that guests must remove too
    const deletedIds = new Set<string>();
    // 🔧 Position-only changes: objects whose SYNC carries just coordinates —
    // emit a limited {id, x, y} entry instead of the full object (minimal
    // traffic for big objects like drawings with many strokes)
    const positionOnlyIds = new Set<string>();
    const fullChangedIds = new Set<string>();

    // 🔧 Diff-based removals: anything that vanished since the last sync
    // (covers cascade deletions and every removal code path)
    const removedSinceLastSync: string[] = this.lastKnownIds
      ? Array.from(this.lastKnownIds).filter(id => !currentState.objects[id])
      : [];

    // 🔧 Diff-based additions: objects CREATED since the last sync whose id is
    // generated in the reducer and absent from any action payload (e.g.
    // CREATE_DRAWING_OBJECT). Without this newly created objects never reach
    // guests through partial sync.
    const addedSinceLastSync: string[] = this.lastKnownIds
      ? Object.keys(currentState.objects).filter(id => !this.lastKnownIds!.has(id))
      : [];

    // Collect IDs of changed objects
    this.pendingChanges.forEach(change => {
      if (change.type !== 'object') return;

      const action = change.action;

      // 🔧 Deletion actions: the object is already gone from currentState —
      // emit a tombstone so guests remove it too (partial merge can't express
      // deletions otherwise).
      if (DELETION_ACTIONS.has(action.type)) {
        const idField = DELETION_ID_FIELD[action.type] || 'id';
        const removedId = action.payload?.[idField] || action.payload?.id;
        if (removedId && !currentState.objects[removedId]) {
          deletedIds.add(removedId);
        }
        if (Array.isArray(change.extraIds)) {
          change.extraIds.forEach((eid: string) => {
            if (currentState.objects[eid]) {
              // Survivor of the deletion (e.g. a die whose diceGroupId the
              // reducer cleared) — sync its updated state, otherwise guests
              // that missed the ACTION keep stale references forever.
              changedObjectIds.add(eid);
            } else {
              deletedIds.add(eid);
            }
          });
        }
        return;
      }

      // Most actions use payload.id
      if (action.payload?.id) {
        changedObjectIds.add(action.payload.id);
        // 🔧 Position-only detection: MOVE_OBJECT with just coordinates
        if (action.type === 'MOVE_OBJECT') {
          const keys = Object.keys(action.payload).filter(k => k !== 'id');
          if (keys.length > 0 && keys.every(k => k === 'x' || k === 'y')) {
            positionOnlyIds.add(action.payload.id);
            return;
          }
        }
        fullChangedIds.add(action.payload.id);
        return;
      }

      // 🔥 FIX: Handle actions that modify objects but use different payload fields
      // DRAW_CARD: modifies deck (deckId) and card (drawnCardId from reducer)
      if (action.type === 'DRAW_CARD' && action.payload?.deckId) {
        const deckId = action.payload.deckId;
        const playerId = action.payload.playerId;
        changedObjectIds.add(deckId);

        // 🔥 FIX: Only include the deck and the drawn card (not all cards in deck)
        // Find the card that was just drawn (location: HAND, ownerId: playerId, deckId: deckId)
        Object.entries(currentState.objects as Record<string, { type: string; deckId?: string }>).forEach(([id, obj]) => {
          if (obj.type === 'CARD' && (obj as any).deckId === deckId) {
            const card = obj as any;
            // Include card if it's the one just drawn (in HAND, owned by player)
            // If playerId is undefined, include all cards in HAND from this deck (fallback)
            if (card.location === 'HAND' && (!playerId || card.ownerId === playerId)) {
              changedObjectIds.add(id);
            }
          }
        });
        return;
      }

      // PLAY_TOP_CARD: modifies deck (deckId) and the PLAYED card (moved to cursor slot)
      if (action.type === 'PLAY_TOP_CARD' && action.payload?.deckId) {
        changedObjectIds.add(action.payload.deckId);
        // 🔧 FIX: the PLAYED card is no longer deck.cardIds[0] here — the
        // reducer already removed it from the deck. Find it by its
        // __pendingPlayTop marker, otherwise it never reaches guests and
        // their state stays stale (location: DECK).
        Object.entries(currentState.objects as Record<string, any>).forEach(([id, obj]) => {
          if (obj?.__pendingPlayTop?.deckId === action.payload.deckId) {
            changedObjectIds.add(id);
          }
        });
        // Also include the new top card (top-deck display)
        const deck = currentState.objects[action.payload.deckId];
        if (deck?.cardIds?.[0]) {
          changedObjectIds.add(deck.cardIds[0]);
        }
        return;
      }

      // DROP_FROM_CURSOR_SLOT: modifies object being dropped
      if (action.type === 'DROP_FROM_CURSOR_SLOT' && action.payload?.objectId) {
        changedObjectIds.add(action.payload.objectId);
        return;
      }

      // ADD_CARD_TO_PILE: modifies deck (deckId) and card (cardId)
      if (action.type === 'ADD_CARD_TO_PILE' && action.payload?.deckId) {
        changedObjectIds.add(action.payload.deckId);
        if (action.payload?.cardId) {
          changedObjectIds.add(action.payload.cardId);
        }
        return;
      }

      // SHUFFLE_DECK: modifies deck
      if (action.type === 'SHUFFLE_DECK' && action.payload?.deckId) {
        changedObjectIds.add(action.payload.deckId);
        return;
      }

      // RETURN_ALL_CARDS_TO_DECK: modifies deck
      if (action.type === 'RETURN_ALL_CARDS_TO_DECK' && action.payload?.deckId) {
        changedObjectIds.add(action.payload.deckId);
        return;
      }

      // ADD_OBJECT: payload is the object itself
      if (action.type === 'ADD_OBJECT' && action.payload?.id) {
        changedObjectIds.add(action.payload.id);
        return;
      }

      // 🔧 GENERIC FALLBACK: any action referencing known objects via common
      // payload fields (FLIP_CARD.cardId, ADD_STROKE_TO_DRAWING.drawingId,
      // UPDATE_DRAWING_LAYER.layerId, RETURN_TO_DECK.deckId, ...). Without
      // this the change is silently dropped from partial sync and never
      // reaches guests.
      (['objectId', 'cardId', 'deckId', 'pileId', 'panelId', 'windowId', 'drawingId', 'layerId'] as const).forEach(key => {
        const ref = action.payload?.[key];
        if (typeof ref === 'string' && currentState.objects[ref]) {
          changedObjectIds.add(ref);
        }
      });
    });

    // Limit number of objects in partial sync
    const objectIds = Array.from(changedObjectIds).slice(
      0,
      WEBRTC_OPTIMIZATION_CONFIG.MAX_PARTIAL_OBJECTS
    );

    // Create partial state with only changed objects
    const partialObjects: Record<string, any> = {};
    const validObjectIds: string[] = [];
    objectIds.forEach(id => {
      if (currentState.objects[id]) {
        const obj = currentState.objects[id];
        // 🔧 Object held in a cursor slot: sync ONLY the flag — its real
        // position never leaves the holding client, so other clients keep it
        // rendered at its origin, locked and dimmed until the drop.
        if ((obj as any).inCursorSlot === true) {
          partialObjects[id] = {
            id,
            inCursorSlot: true,
            cursorSlotOwnerId: (obj as any).cursorSlotOwnerId,
          };
          validObjectIds.push(id);
          return;
        }
        // 🔧 Position-only change: sync ONLY coordinates — minimal traffic
        if (positionOnlyIds.has(id)) {
          partialObjects[id] = { id, x: obj.x, y: obj.y };
          validObjectIds.push(id);
          return;
        }
        partialObjects[id] = obj;
        validObjectIds.push(id);
      } else {
        logger.debug('[DifferentialSyncManager] object not found in currentState.objects (skipping):', id);
      }
    });

    // 🔧 Append deletion tombstones — guests remove these objects on merge
    deletedIds.forEach(id => {
      if (!partialObjects[id]) {
        partialObjects[id] = { id, _deleted: true };
        validObjectIds.push(id);
      }
    });

    // 🔧 Diff-based deletion tombstones. NOT capped by MAX_PARTIAL_OBJECTS —
    // tombstones are tiny and deferring them would strand removals until the
    // next unrelated state change triggers another broadcast.
    removedSinceLastSync.forEach(id => {
      if (!partialObjects[id]) {
        partialObjects[id] = { id, _deleted: true };
        validObjectIds.push(id);
      }
    });
    // Baseline for the next diff = current objects (all removals now sent)
    this.lastKnownIds = new Set(Object.keys(currentState.objects));

    // 🔧 New objects must always reach guests — uncapped like tombstones
    addedSinceLastSync.forEach(id => {
      if (!partialObjects[id]) {
        partialObjects[id] = currentState.objects[id];
        validObjectIds.push(id);
      }
    });

    // 🔥 FIX: If no objects found but there are player changes, still send state with players
    // This ensures player state (like handCardOrder) is synced even when no objects changed
    if (validObjectIds.length === 0 && !hasPlayerChanges) {
      return null;
    }

    const result = {
      ...currentState,
      objects: partialObjects,
      _isPartial: true,
      _changeCount: validObjectIds.length,
      _timestamp: currentStateTime,
      // 🔥 FIX: Always include current players in partial state
      // This ensures handCardOrder and other player state is synced
      players: currentState.players || [],
    };

    return result;
  }

  clearChanges(): void {
    this.pendingChanges = [];
  }

  getChangeCount(): number {
    return this.pendingChanges.length;
  }

  isSyncInProgress(): boolean {
    return this.syncInProgress;
  }

  setSyncInProgress(inProgress: boolean): void {
    this.syncInProgress = inProgress;
  }
}

export const differentialSyncManager = new DifferentialSyncManager();

// Optimized ICE servers configuration with STUN + TURN
// STUN: Helps peers discover their public IP
// TURN: Relays traffic when direct connection fails (symmetric NAT, firewall)
export function getOptimizedIceServers(): any[] {
  return [
    ...WEBRTC_OPTIMIZATION_CONFIG.OPTIMIZED_ICE_SERVERS,
    ...WEBRTC_OPTIMIZATION_CONFIG.FALLBACK_ICE_SERVERS,
    ...WEBRTC_OPTIMIZATION_CONFIG.TURN_SERVERS,
  ];
}

// Create optimized PeerJS configuration with global accessibility
export function createOptimizedPeerJSConfig() {
  return {
    // Try multiple PeerJS cloud servers for redundancy
    host: '0.peerjs.com',
    port: 443,
    secure: true,
    config: {
      iceServers: getOptimizedIceServers(),
      // Try direct connection first, fallback to relay if needed
      iceTransportPolicy: 'all',
    },
    // Increase timeouts for slower networks
    pollingInterval: WEBRTC_OPTIMIZATION_CONFIG.POLLING_INTERVAL,
    pingInterval: WEBRTC_OPTIMIZATION_CONFIG.PING_INTERVAL,
    // Retry settings
    retryWhen: true, // Auto-retry on connection failure
    // 🔥 NEW: Debug mode for WebRTC
    debug: 1, // 0=none, 1=errors, 2=warnings, 3=all
  };
}

// Export timeout constants for use in components
export const CONNECTION_TIMEOUT = WEBRTC_OPTIMIZATION_CONFIG.CONNECTION_TIMEOUT;
export const ICE_GATHERING_TIMEOUT = WEBRTC_OPTIMIZATION_CONFIG.ICE_GATHERING_TIMEOUT;

// Statistics for monitoring WebRTC performance
interface WebRTCStats {
  stateSyncs: number;
  partialSyncs: number;
  fullSyncs: number;
  bytesSent: number;
  lastSyncTime: number;
  averageSyncTime: number;
}

class WebRTCStatsMonitor {
  private stats: WebRTCStats = {
    stateSyncs: 0,
    partialSyncs: 0,
    fullSyncs: 0,
    bytesSent: 0,
    lastSyncTime: 0,
    averageSyncTime: 0,
  };

  private syncTimes: number[] = [];

  recordSync(isPartial: boolean, bytesSent: number, syncTime: number): void {
    this.stats.stateSyncs++;
    this.stats.bytesSent += bytesSent;
    this.stats.lastSyncTime = Date.now();

    if (isPartial) {
      this.stats.partialSyncs++;
    } else {
      this.stats.fullSyncs++;
    }

    // Track sync time for average calculation
    this.syncTimes.push(syncTime);
    if (this.syncTimes.length > 100) {
      this.syncTimes.shift(); // Keep only last 100 measurements
    }

    this.stats.averageSyncTime =
      this.syncTimes.reduce((a, b) => a + b, 0) / this.syncTimes.length;
  }

  getStats(): WebRTCStats {
    return { ...this.stats };
  }

  reset(): void {
    this.stats = {
      stateSyncs: 0,
      partialSyncs: 0,
      fullSyncs: 0,
      bytesSent: 0,
      lastSyncTime: 0,
      averageSyncTime: 0,
    };
    this.syncTimes = [];
  }

  printStats(): void {
    logger.log('[WebRTC Stats]', {
      totalSyncs: this.stats.stateSyncs,
      partialSyncs: this.stats.partialSyncs,
      fullSyncs: this.stats.fullSyncs,
      totalBytes: this.stats.bytesSent,
      avgBytesPerSync: this.stats.stateSyncs > 0
        ? Math.round(this.stats.bytesSent / this.stats.stateSyncs)
        : 0,
      avgSyncTime: `${Math.round(this.stats.averageSyncTime)}ms`,
      efficiency: this.stats.stateSyncs > 0
        ? `${Math.round((this.stats.partialSyncs / this.stats.stateSyncs) * 100)}% partial`
        : 'N/A',
    });
  }
}

export const webrtcStatsMonitor = new WebRTCStatsMonitor();

// Utility to measure sync operation time
export function measureSyncTime<T>(
  operation: () => T,
  onComplete: (result: T, time: number) => void
): T {
  const startTime = performance.now();
  const result = operation();
  const endTime = performance.now();
  onComplete(result, endTime - startTime);
  return result;
}

