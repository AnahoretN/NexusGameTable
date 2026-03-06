import { Coordinates } from '../types';
import { GridType, TableObject } from '../types';

export interface GridSnapResult {
  x: number;
  y: number;
  snapped: boolean;
}

export interface GridSnapOptions {
  gridSize: number;
  gridWidth?: number;
  gridHeight?: number;
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
  const { gridSize, gridWidth, gridHeight, gridType, offsetX = 0, offsetY = 0 } = options;

  // Use gridWidth/gridHeight if provided, otherwise fall back to gridSize
  const snapX = gridWidth ?? gridSize;
  const snapY = gridHeight ?? gridSize;

  // Adjust for grid offset
  const adjustedX = x - offsetX;
  const adjustedY = y - offsetY;

  let snappedX: number;
  let snappedY: number;

  switch (gridType) {
    case GridType.HEX:
      // Hex grid - treat as pointy top
      snappedX = Math.round(adjustedX / (snapX * Math.sqrt(3))) * snapX * Math.sqrt(3);
      snappedY = Math.round(adjustedY / (snapY * 1.5)) * snapY * 1.5;
      break;

    case GridType.SQUARE:
    default:
      // Standard square grid
      snappedX = Math.round(adjustedX / snapX) * snapX;
      snappedY = Math.round(adjustedY / snapY) * snapY;
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

