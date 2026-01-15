import { Coordinates } from '../types';
import { GridType, TableObject, ItemType } from '../types';

export interface GridSnapResult {
  x: number;
  y: number;
  snapped: boolean;
}

export interface GridSnapOptions {
  gridSize: number;
  gridType: GridType;
  offsetX?: number;
  offsetY?: number;
}

/**
 * Snap a coordinate to the nearest grid point
 */
export function snapToGrid(
  x: number,
  y: number,
  options: GridSnapOptions
): Coordinates {
  const { gridSize, gridType, offsetX = 0, offsetY = 0 } = options;

  // Adjust for grid offset
  const adjustedX = x - offsetX;
  const adjustedY = y - offsetY;

  let snappedX: number;
  let snappedY: number;

  switch (gridType) {
    case GridType.HEX:
      // Hex grid - treat as pointy top
      snappedX = Math.round(adjustedX / (gridSize * Math.sqrt(3))) * gridSize * Math.sqrt(3);
      snappedY = Math.round(adjustedY / (gridSize * 1.5)) * gridSize * 1.5;
      break;

    case GridType.SQUARE:
    default:
      // Standard square grid
      snappedX = Math.round(adjustedX / gridSize) * gridSize;
      snappedY = Math.round(adjustedY / gridSize) * gridSize;
      break;
  }

  // Add offset back
  return {
    x: snappedX + offsetX,
    y: snappedY + offsetY
  };
}

/**
 * Get snapped coordinates for object center
 */
export function getSnappedCenter(
  centerX: number,
  centerY: number,
  options: GridSnapOptions
): Coordinates {
  return snapToGrid(centerX, centerY, options);
}

/**
 * Check if an object is on table (for filtering)
 */
export function isObjectOnTable(obj: TableObject): boolean {
  return 'isOnTable' in obj ? (obj as any).isOnTable : true;
}
