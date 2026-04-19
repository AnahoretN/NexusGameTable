/**
 * Memory Manager - Automatic memory cleanup and optimization
 * Prevents memory leaks and optimizes memory usage for long-running sessions
 */

import { logger } from './logger';

// Memory manager configuration
const MEMORY_MANAGER_CONFIG = {
  CLEANUP_INTERVAL: 5 * 60 * 1000, // 5 minutes
  MAX_HISTORY_AGE: 24 * 60 * 60 * 1000, // 24 hours
  MAX_HISTORY_SIZE: 100,
  MAX_MARKER_HISTORY: 10,
  MAX_DRAWING_AGE: 60 * 60 * 1000, // 1 hour for drawings
  MAX_DICE_ROLL_AGE: 24 * 60 * 60 * 1000, // 24 hours for dice rolls
  MAX_CACHE_SIZE: 50 * 1024 * 1024, // 50MB
  CACHE_ENTRY_MAX_AGE: 30 * 60 * 1000, // 30 minutes
};

// Memory statistics interface
interface MemoryStats {
  usedJSHeapSize: string;
  totalJSHeapSize: string;
  jsHeapSizeLimit: string;
  cleanupCount: number;
  lastCleanupTime: number;
  memoryFreed: number; // bytes
}

// History entry interface
interface HistoryEntry {
  timestamp: number;
  type: string;
  data?: any;
}

// Memory Manager class
export class MemoryManager {
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private cleanupCount = 0;
  private memoryFreed = 0;
  private lastCleanupTime = 0;
  private isActive = false;

  // WeakMaps for temporary data (automatically garbage collected)
  private temporalDataCache = new WeakMap<object, any>();
  private temporalMetadata = new WeakMap<object, { timestamp: number }>();

  /**
   * Start automatic memory cleanup
   */
  start(): void {
    if (this.isActive) {
      return;
    }

    this.isActive = true;
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, MEMORY_MANAGER_CONFIG.CLEANUP_INTERVAL);
  }

  /**
   * Stop automatic memory cleanup
   */
  stop(): void {
    if (!this.isActive) {
      return;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.isActive = false;
  }

  /**
   * Perform manual cleanup
   */
  performCleanup(): void {
    const startTime = performance.now();
    const beforeMemory = this.getMemoryUsage();

    // Perform cleanup operations
    this.cleanupOldDrawings();
    this.cleanupUndoHistory();
    this.cleanupImageCache();
    this.cleanupOldDiceRolls();
    this.cleanupTemporalData();

    const afterMemory = this.getMemoryUsage();
    const timeElapsed = performance.now() - startTime;

    // Calculate memory freed (if available)
    if (beforeMemory && afterMemory) {
      const memoryFreed = beforeMemory - afterMemory;
      this.memoryFreed += memoryFreed;

      logger.log('[MemoryManager] Cleanup complete',
        `freed: ${(memoryFreed / 1024 / 1024).toFixed(2)}MB`,
        `time: ${timeElapsed.toFixed(0)}ms`);
    } else {
      logger.log('[MemoryManager] Cleanup complete',
        `time: ${timeElapsed.toFixed(0)}ms`);
    }

    this.cleanupCount++;
    this.lastCleanupTime = Date.now();
  }

  /**
   * Force immediate garbage collection (if available)
   */
  forceGC(): void {
    if ((window as any).gc) {
      logger.log('[MemoryManager] Forcing garbage collection');
      (window as any).gc();
    } else {
      logger.warn('[MemoryManager] Garbage collection not available');
    }
  }

  /**
   * Get current memory statistics
   */
  getMemoryStats(): MemoryStats | null {
    const memory = (performance as any).memory;
    if (!memory) {
      return null;
    }

    return {
      usedJSHeapSize: `${(memory.usedJSHeapSize / 1024 / 1024).toFixed(2)}MB`,
      totalJSHeapSize: `${(memory.totalJSHeapSize / 1024 / 1024).toFixed(2)}MB`,
      jsHeapSizeLimit: `${(memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2)}MB`,
      cleanupCount: this.cleanupCount,
      lastCleanupTime: this.lastCleanupTime,
      memoryFreed: this.memoryFreed,
    };
  }

  /**
   * Get current memory usage in MB
   */
  getMemoryUsage(): number | null {
    const memory = (performance as any).memory;
    return memory ? memory.usedJSHeapSize : null;
  }

  /**
   * Store temporal data associated with an object
   * Automatically cleaned up when object is garbage collected
   */
  setTemporalData<T>(obj: object, key: string, value: T): void {
    let objCache = this.temporalDataCache.get(obj);
    if (!objCache) {
      objCache = {};
      this.temporalDataCache.set(obj, objCache);
    }
    objCache[key] = value;

    // Update metadata
    this.temporalMetadata.set(obj, { timestamp: Date.now() });
  }

  /**
   * Get temporal data associated with an object
   */
  getTemporalData<T>(obj: object, key: string): T | undefined {
    const objCache = this.temporalDataCache.get(obj);
    if (objCache) {
      // Update timestamp on access
      this.temporalMetadata.set(obj, { timestamp: Date.now() });
      return objCache[key];
    }
    return undefined;
  }

  /**
   * Clear temporal data for a specific object
   */
  clearTemporalData(obj: object): void {
    this.temporalDataCache.delete(obj);
    this.temporalMetadata.delete(obj);
  }

  /**
   * Clean up old temporal data (though WeakMap handles this automatically)
   */
  private cleanupTemporalData(): void {
    const now = Date.now();
    const maxAge = MEMORY_MANAGER_CONFIG.CACHE_ENTRY_MAX_AGE;

    // Note: WeakMap doesn't provide iteration, but we can clean up metadata
    // The actual data will be garbage collected automatically when objects are no longer referenced
    let cleanedEntries = 0;

    // Since we can't iterate WeakMap, we just log the cleanup
    logger.log('[MemoryManager] Temporal data cleanup relies on WeakMap garbage collection');
  }

  /**
   * Clean up old drawings (placeholder - implementation depends on drawing system)
   */
  private cleanupOldDrawings(): void {
    // TODO: Implement when drawing system is refactored
    // This would typically involve:
    // 1. Finding drawings older than MAX_DRAWING_AGE
    // 2. Removing them from state
    // 3. Clearing associated caches

    logger.log('[MemoryManager] Drawing cleanup not yet implemented');
  }

  /**
   * Clean up undo history
   */
  private cleanupUndoHistory(): void {
    // This is a placeholder - actual implementation would work with GameContext
    // The undo history cleanup should be implemented in the reducer itself

    logger.log('[MemoryManager] Undo history cleanup should be implemented in reducer');
  }

  /**
   * Clean up image cache
   */
  private cleanupImageCache(): void {
    // This works with the existing imageCache system
    if (typeof (window as any).cleanupImageCache === 'function') {
      try {
        (window as any).cleanupImageCache(MEMORY_MANAGER_CONFIG.CACHE_ENTRY_MAX_AGE / 1000 / 60); // Convert to minutes
        logger.log('[MemoryManager] Image cache cleanup completed');
      } catch (e) {
        logger.warn('[MemoryManager] Image cache cleanup failed:', e);
      }
    }
  }

  /**
   * Clean up old dice rolls
   */
  private cleanupOldDiceRolls(): void {
    // This is a placeholder - actual implementation would work with GameContext
    // The dice roll cleanup should be implemented in the reducer itself

    logger.log('[MemoryManager] Dice roll cleanup should be implemented in reducer');
  }

  /**
   * Print memory statistics
   */
  printMemoryStats(): void {
    const stats = this.getMemoryStats();
    // Memory stats printing disabled
  }
}

// Global instance
export const memoryManager = new MemoryManager();

// Undo history optimization utilities
export interface UndoHistoryEntry {
  timestamp: number;
  type: string;
  objectId?: string;
  data?: any;
}

/**
 * Optimize undo history by size and age
 */
export function optimizeUndoHistory(
  history: UndoHistoryEntry[]
): UndoHistoryEntry[] {
  const now = Date.now();
  const maxSize = MEMORY_MANAGER_CONFIG.MAX_HISTORY_SIZE;
  const maxAge = MEMORY_MANAGER_CONFIG.MAX_HISTORY_AGE;

  // Filter by age
  const filteredByAge = history.filter(entry => {
    // Keep recent entries
    if (now - entry.timestamp < maxAge) {
      return true;
    }

    // For object-moved entries, keep only recent ones (1 hour)
    if (entry.type === 'object-moved') {
      return now - entry.timestamp < (60 * 60 * 1000);
    }

    return false;
  });

  // Limit by size
  const limited = filteredByAge.slice(-maxSize);

  // Compress consecutive object-moved entries for the same object
  const compressed = compressConsecutiveMoves(limited);

  return compressed;
}

/**
 * Compress consecutive object-moved entries
 */
function compressConsecutiveMoves(
  history: UndoHistoryEntry[]
): UndoHistoryEntry[] {
  const compressed: UndoHistoryEntry[] = [];

  for (const entry of history) {
    const lastEntry = compressed[compressed.length - 1];

    // Check if we can compress with the previous entry
    if (
      lastEntry &&
      entry.type === 'object-moved' &&
      lastEntry.type === 'object-moved' &&
      entry.objectId === lastEntry.objectId &&
      entry.timestamp - lastEntry.timestamp < 1000 // Within 1 second
    ) {
      // Replace previous entry with current one
      compressed[compressed.length - 1] = entry;
    } else {
      compressed.push(entry);
    }
  }

  return compressed;
}

/**
 * Optimize marker history (keep only last N entries)
 */
export function optimizeMarkerHistory(
  history: any[]
): any[] {
  const maxSize = MEMORY_MANAGER_CONFIG.MAX_MARKER_HISTORY;
  return history.slice(-maxSize);
}

// WeakMap-based temporal cache utilities
export const temporalCache = {
  set: <T>(obj: object, key: string, value: T): void => {
    memoryManager.setTemporalData(obj, key, value);
  },

  get: <T>(obj: object, key: string): T | undefined => {
    return memoryManager.getTemporalData<T>(obj, key);
  },

  has: (obj: object, key: string): boolean => {
    const data = memoryManager.getTemporalData(obj, key);
    return data !== undefined;
  },

  delete: (obj: object): void => {
    memoryManager.clearTemporalData(obj);
  },
};

// Example usage in components:
/*
import { memoryManager, temporalCache, optimizeUndoHistory } from '../utils/memoryManager';

// In App.tsx or main component:
useEffect(() => {
  memoryManager.start();

  // Optional: Set up periodic stats logging
  const statsInterval = setInterval(() => {
    memoryManager.printMemoryStats();
  }, 60000); // Every minute

  return () => {
    memoryManager.stop();
    clearInterval(statsInterval);
  };
}, []);

// In components with temporary data:
const MyComponent = ({ obj }) => {
  useEffect(() => {
    // Store temporary data
    temporalCache.set(obj, 'tempData', { some: 'data' });

    return () => {
      // Clean up (optional - WeakMap handles automatically)
      temporalCache.delete(obj);
    };
  }, [obj]);

  // Use temporary data
  const tempData = temporalCache.get(obj, 'tempData');
};

// In reducer (for undo history optimization):
case 'ADD_TO_HISTORY':
  return {
    ...state,
    generalHistory: optimizeUndoHistory([
      ...state.generalHistory,
      action.payload
    ])
  };
*/
