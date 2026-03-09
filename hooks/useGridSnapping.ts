import { useMemo } from 'react';
import { Coordinates, GridType, TableObject } from '../types';
import { snapToGrid, getSnappedCenter, GridSnapOptions } from '../utils/gridUtils';

interface UseGridSnappingOptions {
  enabled: boolean;
  gridSize?: number;
  gridType?: GridType;
  offset?: Coordinates;
}

interface UseGridSnappingResult {
  getSnappedCoordinates: (x: number, y: number, width: number, height: number) => Coordinates;
  getSnappedCenter: (x: number, y: number) => Coordinates;
  snapToGrid: (x: number, y: number) => Coordinates;
  isNearGridPoint: (x: number, y: number, threshold?: number) => boolean;
}

/**
 * Custom hook for grid snapping functionality
 */
export function useGridSnapping(options: UseGridSnappingOptions): UseGridSnappingResult {
  const { enabled, gridSize = 50, gridType = GridType.SQUARE, offset = { x: 0, y: 0 } } = options;

  const snapOptions: GridSnapOptions = useMemo(
    () => ({ gridSize, gridType, offsetX: offset.x, offsetY: offset.y }),
    [gridSize, gridType, offset.x, offset.y]
  );

  const getSnappedCoordinates = useMemo(
    () => (x: number, y: number, width: number, height: number): Coordinates => {
      if (!enabled) return { x, y };

      const centerX = x + width / 2;
      const centerY = y + height / 2;

      const snappedCenter = getSnappedCenter(centerX, centerY, snapOptions);

      return {
        x: snappedCenter.x - width / 2,
        y: snappedCenter.y - height / 2
      };
    },
    [enabled, snapOptions]
  );

  const getSnappedCenterPosition = useMemo(
    () => (x: number, y: number): Coordinates => {
      if (!enabled) return { x, y };
      return getSnappedCenter(x, y, snapOptions);
    },
    [enabled, snapOptions]
  );

  const snapPosition = useMemo(
    () => (x: number, y: number): Coordinates => {
      if (!enabled) return { x, y };
      return snapToGrid(x, y, snapOptions);
    },
    [enabled, snapOptions]
  );

  const isNearGridPoint = useMemo(
    () => (x: number, y: number, threshold: number = 5): boolean => {
      if (!enabled) return false;

      const xMod = x % gridSize;
      const yMod = y % gridSize;

      const distToX = Math.min(xMod, gridSize - xMod);
      const distToY = Math.min(yMod, gridSize - yMod);

      return distToX < threshold || distToY < threshold;
    },
    [enabled, gridSize]
  );

  return {
    getSnappedCoordinates,
    getSnappedCenter: getSnappedCenterPosition,
    snapToGrid: snapPosition,
    isNearGridPoint
  };
}

/**
 * Find snap target objects (objects to snap to)
 */
export function findSnapTarget(
  x: number,
  y: number,
  objects: Record<string, TableObject>,
  excludeId: string,
  snapDistance: number = 50
): { x: number; y: number } | null {
  let closest: { x: number; y: number; distance: number } | null = null;

  for (const obj of Object.values(objects)) {
    if (obj.id === excludeId) continue;
    const isOnTable = 'isOnTable' in obj ? (obj as any).isOnTable : true;
    if (!isOnTable) continue;

    const objCenterX = obj.x + (obj.width ?? 100) / 2;
    const objCenterY = obj.y + (obj.height ?? 100) / 2;

    const distance = Math.sqrt(
      Math.pow(x - objCenterX, 2) + Math.pow(y - objCenterY, 2)
    );

    if (distance < snapDistance && (!closest || distance < closest.distance)) {
      closest = { x: objCenterX, y: objCenterY, distance };
    }
  }

  return closest ? { x: closest.x, y: closest.y } : null;
}
