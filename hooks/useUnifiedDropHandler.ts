/**
 * Unified Drop Handler Hook
 *
 * This hook provides a single global drop handler that delegates to
 * the appropriate component based on where the drop occurs.
 *
 * Components register their drop handlers, and the unified system
 * ensures only one handler processes each drop event.
 */

import { useEffect, useRef, useCallback } from 'react';
import { TableObject } from '../types';
import { DropTarget, analyzeDropTarget } from '../utils/dragDropUtils';

/**
 * Drop handler function type
 */
export type DropHandlerFunction = (
  e: MouseEvent,
  target: DropTarget,
  cursorSlotObjects: TableObject[]
) => boolean | Promise<boolean>;

/**
 * Handler registration
 */
interface DropHandlerRegistration {
  id: string;
  priority: number; // Higher priority = checked first
  canHandle: (target: DropTarget) => boolean;
  handler: DropHandlerFunction;
}

/**
 * Options for the unified drop handler
 */
export interface UseUnifiedDropHandlerOptions {
  /** Function to get current cursor slot objects */
  getCursorSlotObjects: () => TableObject[];
  /** Function to check if objects were just picked up (to prevent immediate drop) */
  getJustPickedUp?: () => boolean;
  /** Minimum time after pickup before allowing drop (ms) */
  pickupCooldown?: number;
  /** Debug logging */
  debug?: boolean;
}

/**
 * Global registry of drop handlers (module-level variable, not a hook)
 */
let dropHandlerRegistry: DropHandlerRegistration[] = [];

/**
 * Register a drop handler
 *
 * @param registration - The handler registration
 * @returns Cleanup function to unregister
 */
export function registerDropHandler(registration: DropHandlerRegistration): () => void {
  dropHandlerRegistry.push(registration);

  // Sort by priority (descending)
  dropHandlerRegistry.sort((a, b) => b.priority - a.priority);

  // Return cleanup function
  return () => {
    dropHandlerRegistry = dropHandlerRegistry.filter(h => h.id !== registration.id);
  };
}

/**
 * Clear all registered handlers (for testing)
 */
export function clearDropHandlers(): void {
  dropHandlerRegistry = [];
}

/**
 * Hook to use the unified drop handler system
 *
 * This hook sets up the global mouseup listener and delegates to
 * registered handlers based on drop target.
 *
 * @param options - Configuration options
 */
export function useUnifiedDropHandler(options: UseUnifiedDropHandlerOptions) {
  const {
    getCursorSlotObjects,
    getJustPickedUp,
    pickupCooldown = 150,
    debug = false
  } = options;

  const lastPickupTimeRef = useRef<number>(0);
  const isProcessingRef = useRef(false);

  const handleGlobalMouseUp = useCallback(async (e: MouseEvent) => {
    // Only process left mouse button
    if (e.button !== 0) return;

    // Prevent concurrent processing
    if (isProcessingRef.current) {
      if (debug) console.log('[UnifiedDropHandler] Already processing, skipping');
      return;
    }

    const cursorSlotObjects = getCursorSlotObjects();
    if (cursorSlotObjects.length === 0) return;

    // Check pickup cooldown
    const timeSincePickup = Date.now() - lastPickupTimeRef.current;
    if (timeSincePickup < pickupCooldown) {
      if (debug) console.log('[UnifiedDropHandler] Pickup cooldown active, skipping:', timeSincePickup);
      return;
    }

    // Don't drop if modifiers are pressed (unless specifically handled)
    if (e.ctrlKey || e.metaKey) {
      if (debug) console.log('[UnifiedDropHandler] Modifier key pressed, skipping');
      return;
    }

    // Analyze drop target
    const target = analyzeDropTarget(e.clientX, e.clientY);

    if (debug) {
      console.log('[UnifiedDropHandler] Processing drop:', {
        x: e.clientX,
        y: e.clientY,
        target,
        cursorSlotIds: cursorSlotObjects.map(o => o.id)
      });
    }

    // Find a handler that can process this drop
    isProcessingRef.current = true;

    for (const registration of dropHandlerRegistry) {
      if (registration.canHandle(target)) {
        if (debug) {
          console.log('[UnifiedDropHandler] Delegating to handler:', registration.id);
        }

        try {
          const handled = await registration.handler(e, target, cursorSlotObjects);

          if (handled) {
            if (debug) {
              console.log('[UnifiedDropHandler] Drop handled by:', registration.id);
            }
            e.stopPropagation();
            e.preventDefault();
            return;
          }
        } catch (error) {
          console.error('[UnifiedDropHandler] Handler error:', registration.id, error);
        }
      }
    }

    if (debug) {
      console.log('[UnifiedDropHandler] No handler processed the drop');
    }
  }, [getCursorSlotObjects, pickupCooldown, debug]);

  // Set up global mouseup listener
  useEffect(() => {
    const listener = (e: MouseEvent) => handleGlobalMouseUp(e);
    window.addEventListener('mouseup', listener, { capture: true });

    return () => {
      window.removeEventListener('mouseup', listener, { capture: true } as any);
    };
  }, [handleGlobalMouseUp]);

  // Function to mark that objects were just picked up
  const markJustPickedUp = useCallback(() => {
    lastPickupTimeRef.current = Date.now();
  }, []);

  return {
    markJustPickedUp,
    registerDropHandler
  };
}

/**
 * Hook to register a drop handler for a component
 *
 * @param id - Unique identifier for this handler
 * @param priority - Handler priority (higher = checked first)
 * @param canHandle - Function to check if this handler can process the target
 * @param handler - The drop handler function
 */
export function useDropHandler(
  id: string,
  priority: number,
  canHandle: (target: DropTarget) => boolean,
  handler: DropHandlerFunction
): void {
  useEffect(() => {
    const unregister = registerDropHandler({
      id,
      priority,
      canHandle,
      handler
    });

    return unregister;
  }, [id, priority, canHandle, handler]);
}
