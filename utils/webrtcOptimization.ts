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
  // Throttle state sync to max once per 100ms
  STATE_SYNC_THROTTLE: 100,

  // Debounce panel settings sync to wait 300ms after last change
  PANEL_SETTINGS_DEBOUNCE: 300,

  // Optimize ICE servers to only 3 most reliable
  OPTIMIZED_ICE_SERVERS: [
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    { urls: 'stun:stun.l.google.com:19302' },
  ],

  // Increase polling intervals for better performance
  POLLING_INTERVAL: 1000, // Increased from 500ms
  PING_INTERVAL: 5000,    // Increased from 1000ms

  // Differential sync thresholds
  MAX_CHANGES_FOR_FULL_SYNC: 50, // If >50 changes, send full state
  MAX_PARTIAL_OBJECTS: 20,       // Max objects in partial sync
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

// Differential sync for state changes
interface ChangeSet {
  type: 'object' | 'player' | 'ui';
  action: any;
  timestamp: number;
}

class DifferentialSyncManager {
  private pendingChanges: ChangeSet[] = [];
  private lastSyncTime = 0;
  private syncInProgress = false;

  addChange(change: ChangeSet): void {
    this.pendingChanges.push(change);
  }

  shouldSendFullState(): boolean {
    return this.pendingChanges.length > WEBRTC_OPTIMIZATION_CONFIG.MAX_CHANGES_FOR_FULL_SYNC;
  }

  getPartialState(currentState: any, currentStateTime: number): any {
    const changedObjectIds = new Set<string>();

    // Collect IDs of changed objects
    this.pendingChanges.forEach(change => {
      if (change.type === 'object' && change.action.payload?.id) {
        changedObjectIds.add(change.action.payload.id);
      }
    });

    // Limit number of objects in partial sync
    const objectIds = Array.from(changedObjectIds).slice(
      0,
      WEBRTC_OPTIMIZATION_CONFIG.MAX_PARTIAL_OBJECTS
    );

    // Create partial state with only changed objects
    const partialObjects: Record<string, any> = {};
    objectIds.forEach(id => {
      if (currentState.objects[id]) {
        partialObjects[id] = currentState.objects[id];
      }
    });

    return {
      ...currentState,
      objects: partialObjects,
      _isPartial: true,
      _changeCount: objectIds.length,
      _timestamp: currentStateTime,
    };
  }

  clearChanges(): void {
    this.pendingChanges = [];
    this.lastSyncTime = Date.now();
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

// Optimized ICE servers configuration
export function getOptimizedIceServers(): { urls: string }[] {
  return WEBRTC_OPTIMIZATION_CONFIG.OPTIMIZED_ICE_SERVERS;
}

// Create optimized PeerJS configuration
export function createOptimizedPeerJSConfig() {
  return {
    config: {
      iceServers: getOptimizedIceServers(),
    },
    pollingInterval: WEBRTC_OPTIMIZATION_CONFIG.POLLING_INTERVAL,
    pingInterval: WEBRTC_OPTIMIZATION_CONFIG.PING_INTERVAL,
  };
}

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

// Example usage in GameContext:
/*
import {
  throttle,
  debounce,
  differentialSyncManager,
  webrtcStatsMonitor,
  measureSyncTime,
  createOptimizedPeerJSConfig,
  WEBRTC_OPTIMIZATION_CONFIG
} from '../utils/webrtcOptimization';

// Replace existing PeerJS config with optimized version
const PEERJS_CONFIG = createOptimizedPeerJSConfig();

// Create throttled state sync function
const throttledStateSync = throttle((state) => {
  if (!isHost || !connectionsRef.current || connectionsRef.current.length === 0) {
    return;
  }

  const syncStartTime = performance.now();

  // Check if we should use differential sync
  if (differentialSyncManager.shouldSendFullState()) {
    // Full state sync
    connectionsRef.current.forEach(conn => {
      if (conn.open) {
        const { state: stateWithRefs, imageCache } = extractImagesFromState(state);
        conn.send({ type: 'SYNC_STATE', payload: stateWithRefs });

        if (Object.keys(imageCache).length > 0) {
          conn.send({ type: 'IMAGE_CACHE', payload: imageCache });
        }
      }
    });
  } else {
    // Partial sync
    const partialState = differentialSyncManager.getPartialState(state, Date.now());
    connectionsRef.current.forEach(conn => {
      if (conn.open) {
        conn.send({ type: 'SYNC_STATE', payload: partialState });
      }
    });
  }

  const syncTime = performance.now() - syncStartTime;
  const stateSize = JSON.stringify(state).length;

  webrtcStatsMonitor.recordSync(
    !differentialSyncManager.shouldSendFullState(),
    stateSize,
    syncTime
  );

  differentialSyncManager.clearChanges();
}, WEBRTC_OPTIMIZATION_CONFIG.STATE_SYNC_THROTTLE);

// Create debounced panel settings sync
const debouncedPanelSettingsSync = debounce((settings, connections) => {
  connections.forEach(conn => {
    if (conn.open) {
      conn.send({
        type: 'PLAYER_PANEL_SETTINGS',
        payload: settings
      });
    }
  });
}, WEBRTC_OPTIMIZATION_CONFIG.PANEL_SETTINGS_DEBOUNCE);
*/
