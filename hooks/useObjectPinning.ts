import { useCallback } from 'react';
import { useGame } from '../store/GameContext';
import { TableObject, Coordinates } from '../types';
import { viewportToWorld, worldToViewport } from '../utils/coordinateUtils';

interface UseObjectPinningOptions {
  offset?: Coordinates;
  zoom?: number;
  scrollLeft?: number;
  scrollTop?: number;
}

interface UseObjectPinningResult {
  pinObject: (objectId: string) => void;
  unpinObject: (objectId: string) => void;
  togglePin: (objectId: string) => void;
  isPinned: (objectId: string) => boolean;
}

/**
 * Custom hook for managing object pinning to viewport
 */
export function useObjectPinning(options: UseObjectPinningOptions = {}): UseObjectPinningResult {
  const { dispatch } = useGame();
  const { offset = { x: 0, y: 0 }, zoom = 1, scrollLeft = 0, scrollTop = 0 } = options;

  const pinObject = useCallback(
    (objectId: string) => {
      dispatch({
        type: 'PIN_TO_VIEWPORT',
        payload: {
          id: objectId,
          screenX: 0, // Will be calculated by reducer
          screenY: 0
        }
      });
    },
    [dispatch]
  );

  const unpinObject = useCallback(
    (objectId: string) => {
      dispatch({
        type: 'UNPIN_FROM_VIEWPORT',
        payload: {
          id: objectId,
          worldX: 0, // Will be calculated by reducer
          worldY: 0
        }
      });
    },
    [dispatch]
  );

  const togglePin = useCallback(
    (objectId: string) => {
      // This needs to be handled by checking current state
      // Use the component's executeClickAction or check state directly
    },
    []
  );

  const isPinned = useCallback(
    (objectId: string): boolean => {
      // This needs access to state - caller should check state directly
      return false;
    },
    []
  );

  return {
    pinObject,
    unpinObject,
    togglePin,
    isPinned
  };
}

/**
 * Calculate screen position for pinning UI objects
 */
export function calculatePinPosition(
  object: TableObject,
  offset: Coordinates,
  zoom: number,
  scrollLeft: number,
  scrollTop: number
): { x: number; y: number } {
  // For UI objects (panels/windows), subtract scroll
  return {
    x: object.x * zoom + offset.x - scrollLeft,
    y: object.y * zoom + offset.y - scrollTop
  };
}

/**
 * Calculate world position for unpinning UI objects
 */
export function calculateUnpinPosition(
  object: TableObject,
  offset: Coordinates,
  zoom: number
): { x: number; y: number } {
  // For UI objects, use current position (which is viewport coords for pinned)
  return {
    x: object.x * zoom + offset.x,
    y: object.y * zoom + offset.y
  };
}

/**
 * Calculate world position for unpinning game objects (decks, etc.)
 */
export function calculateGameUnpinPosition(
  object: TableObject,
  pinnedScreenPosition: { x: number; y: number },
  offset: Coordinates,
  zoom: number,
  scrollLeft: number,
  scrollTop: number
): { x: number; y: number } {
  // Pinned: viewportX, Unpinned: worldX where (worldX - offset.x) / zoom - scrollLeft = viewportX
  return {
    x: (pinnedScreenPosition.x + scrollLeft - offset.x) / zoom,
    y: (pinnedScreenPosition.y + scrollTop - offset.y) / zoom
  };
}
