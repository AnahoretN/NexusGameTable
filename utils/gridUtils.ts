import { Coordinates, MagnetPoint, BattlefieldCell, NexusCellObject } from '../types';
import { GridType, TableObject } from '../types';

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

export interface FlexibleHexGrid {
  path: string;
  patternWidth: number;
  patternHeight: number;
  hexWidth: number;
  hexHeight: number;
}

/**
 * Hex grid constants
 * HEX: width=100, height = width * 1.15 = 115
 * HEX_HORIZONTAL: width=115, height = width / 1.15 = 100
 */
const HEX_RATIO = 1.15;
const DEFAULT_HEX_WIDTH = 100;
const DEFAULT_FLAT_HEX_WIDTH = 115;

/**
 * Calculate pointy-top hex height from width
 * height = width * 1.15
 */
export function calculateHexHeight(width: number): number {
  return width * HEX_RATIO;
}

/**
 * Calculate flat-top hex height from width
 * height = width / 1.15
 */
export function calculateFlatHexHeight(width: number): number {
  return width / HEX_RATIO;
}

/**
 * Generate flexible-size hexagonal grid pattern with proper edge-to-edge tiling (pointy-top)
 * @param gridWidth - Width of a single pointy-top hex (default 100)
 * @returns Hex grid path and pattern dimensions
 */
export function calculateFlexibleHexGrid(gridWidth: number = DEFAULT_HEX_WIDTH): FlexibleHexGrid {
  const width = gridWidth;
  const height = calculateHexHeight(width);

  const halfW = width / 2;
  const quarterH = height / 4;
  const threeQuarterH = height * 0.75;

  // Single hex path (pointy-top)
  const hexPath =
    `M 0 ${quarterH} ` +
    `L ${halfW} 0 ` +
    `L ${width} ${quarterH} ` +
    `L ${width} ${threeQuarterH} ` +
    `L ${halfW} ${height} ` +
    `L 0 ${threeQuarterH} Z`;

  // Pointy-top tiling: rows spaced by 3/4 * height
  const rowSpacing = threeQuarterH;
  const nextRowOffsetX = halfW;

  // Pattern dimensions for seamless tiling
  const patternWidth = width * 2;
  const patternHeight = rowSpacing * 2;

  const tilingPath =
    hexPath +
    `M ${nextRowOffsetX} ${rowSpacing + quarterH} ` +
    `L ${halfW + nextRowOffsetX} ${rowSpacing} ` +
    `L ${width + nextRowOffsetX} ${rowSpacing + quarterH} ` +
    `L ${width + nextRowOffsetX} ${rowSpacing + threeQuarterH} ` +
    `L ${halfW + nextRowOffsetX} ${rowSpacing + height} ` +
    `L ${nextRowOffsetX} ${rowSpacing + threeQuarterH} Z` +
    `M ${width} ${quarterH} ` +
    `L ${width + halfW} 0 ` +
    `L ${width * 2} ${quarterH} ` +
    `L ${width * 2} ${threeQuarterH} ` +
    `L ${width + halfW} ${height} ` +
    `L ${width} ${threeQuarterH} Z` +
    `M 0 ${patternHeight + quarterH} ` +
    `L ${halfW} ${patternHeight} ` +
    `L ${width} ${patternHeight + quarterH} ` +
    `L ${width} ${patternHeight + threeQuarterH} ` +
    `L ${halfW} ${patternHeight + height} ` +
    `L 0 ${patternHeight + threeQuarterH} Z`;

  return {
    path: tilingPath,
    patternWidth: patternWidth,
    patternHeight: patternHeight,
    hexWidth: width,
    hexHeight: height
  };
}

/**
 * Generate flexible-size flat-top (horizontal) hexagonal grid pattern
 * Based on reference positioning formulas with proper tight packing
 * @param gridWidth - Width of a single flat-top hex (default 115)
 * @returns Hex grid path and pattern dimensions
 */
export function calculateHorizontalHexGrid(gridWidth: number = DEFAULT_FLAT_HEX_WIDTH): FlexibleHexGrid {
  const width = gridWidth;
  const height = calculateFlatHexHeight(width);

  const halfW = width / 2;
  const halfH = height / 2;
  const quarterW = width / 4;

  // Flat-top hex path
  const hexPath =
    `M ${quarterW} 0 ` +
    `L ${width - quarterW} 0 ` +
    `L ${width} ${halfH} ` +
    `L ${width - quarterW} ${height} ` +
    `L ${quarterW} ${height} ` +
    `L 0 ${halfH} Z`;

  // Flat-top tiling based on reference formulas:
  // - colSpacing = 0.75 * width (horizontal distance between column centers)
  // - rowSpacing = height (vertical distance between centers in same column)
  // - Odd columns offset down by height / 2
  const colSpacing = width * 0.75;
  const rowSpacing = height;
  const colOffset = height / 2;

  // Pattern dimensions
  const patternWidth = colSpacing * 2;
  const patternHeight = rowSpacing + colOffset;

  // Tiling path following the reference logic
  const tilingPath =
    hexPath +  // Main hex at (0, 0)
    // Odd column hex (second column, offset down by colOffset)
    `M ${colSpacing + quarterW} ${colOffset} ` +
    `L ${colSpacing + width - quarterW} ${colOffset} ` +
    `L ${colSpacing + width} ${halfH + colOffset} ` +
    `L ${colSpacing + width - quarterW} ${height + colOffset} ` +
    `L ${colSpacing + quarterW} ${height + colOffset} ` +
    `L ${colSpacing} ${halfH + colOffset} Z` +
    // Bottom row hexes
    `M ${quarterW} ${patternHeight} ` +
    `L ${width - quarterW} ${patternHeight} ` +
    `L ${width} ${halfH + patternHeight} ` +
    `L ${width - quarterW} ${height + patternHeight} ` +
    `L ${quarterW} ${height + patternHeight} ` +
    `L 0 ${halfH + patternHeight} Z` +
    // Bottom-right hex (odd column, second row)
    `M ${colSpacing + quarterW} ${patternHeight + colOffset} ` +
    `L ${colSpacing + width - quarterW} ${patternHeight + colOffset} ` +
    `L ${colSpacing + width} ${halfH + patternHeight + colOffset} ` +
    `L ${colSpacing + width - quarterW} ${height + patternHeight + colOffset} ` +
    `L ${colSpacing + quarterW} ${height + patternHeight + colOffset} ` +
    `L ${colSpacing} ${halfH + patternHeight + colOffset} Z`;

  return {
    path: tilingPath,
    patternWidth: patternWidth,
    patternHeight: patternHeight,
    hexWidth: width,
    hexHeight: height
  };
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
 * Calculate magnet point positions for a cell
 * @param cell - The battlefield cell or nexus cell
 * @returns Array of magnet point positions {x, y}
 */
export function calculateMagnetPointPositions(
  cell: BattlefieldCell | NexusCellObject
): { x: number; y: number }[] {
  const cellCenterX = cell.x + (cell.width ?? 100) / 2;
  const cellCenterY = cell.y + (cell.height ?? 100) / 2;

  const magnetPointCount = cell.magnetPointCount ?? 1;
  const magnetRotation = cell.magnetRotation ?? 0;

  const magnetPoints: { x: number; y: number }[] = [];

  if (magnetPointCount === 1) {
    // Single point at center
    magnetPoints.push({ x: cellCenterX, y: cellCenterY });
  } else {
    // Multiple magnet points along lines from center to inscribed ellipse
    const anglePerSlice = 360 / magnetPointCount;
    const halfW = (cell.width ?? 100) / 2 - 2; // 2 vu padding
    const halfH = (cell.height ?? 100) / 2 - 2;

    for (let i = 0; i < magnetPointCount; i++) {
      const angle = (i * anglePerSlice + magnetRotation) * Math.PI / 180;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      // Calculate distance to inscribed ellipse in this direction
      const lineLength = 1 / Math.sqrt(
        (cosA / halfW) ** 2 + (sinA / halfH) ** 2
      );

      // Magnet point is at 60% from center along the line
      const magnetRadius = lineLength * 0.6;
      const magnetX = cellCenterX + cosA * magnetRadius;
      const magnetY = cellCenterY + sinA * magnetRadius;
      magnetPoints.push({ x: magnetX, y: magnetY });
    }
  }

  return magnetPoints;
}

/**
 * Add an object to a cell's magnet points
 * Automatically increases magnetPointCount if needed and returns new cell properties
 * @param cell - The battlefield cell or nexus cell
 * @param objectId - The ID of the object to add
 * @param objects - All objects to check if object still exists
 * @returns Updated cell properties and the snap position for the new object
 */
export function addObjectToCellMagnet(
  cell: BattlefieldCell | NexusCellObject,
  objectId: string,
  objects: Record<string, TableObject>
): {
  updatedCell: Partial<BattlefieldCell | NexusCellObject>;
  snapPosition: { x: number; y: number };
  movedObjects: Array<{ objectId: string; x: number; y: number }>;
} {
  // Clean up magnet points - remove references to non-existent objects
  const existingPoints = (cell.magnetPoints ?? []).filter(p => p.objectId in objects);

  // Check if this object is already snapped to this cell
  if (existingPoints.some(p => p.objectId === objectId)) {
    // Object already in this cell, return current position
    const positions = calculateMagnetPointPositions(cell);
    const existingPoint = existingPoints.find(p => p.objectId === objectId);
    if (existingPoint) {
      const pos = positions[existingPoint.pointIndex];
      return {
        updatedCell: { magnetPoints: existingPoints },
        snapPosition: pos,
        movedObjects: []
      };
    }
  }

  // Add new object
  const newPointIndex = existingPoints.length;
  const newPoints: MagnetPoint[] = [
    ...existingPoints,
    { objectId, pointIndex: newPointIndex }
  ];

  // Calculate required magnet point count (minimum is current point count + 1, or use existing setting)
  const requiredPointCount = Math.max(newPoints.length, cell.magnetPointCount ?? 1);

  // Recalculate positions with the new point count
  const updatedCell: Partial<BattlefieldCell | NexusCellObject> = {
    magnetPointCount: requiredPointCount,
    magnetPoints: newPoints,
    magnetRotation: cell.magnetRotation ?? 0
  };

  // Calculate all magnet point positions for the updated cell
  const positions = calculateMagnetPointPositions({ ...cell, ...updatedCell });

  // Calculate moved objects - objects that were already snapped need to move to new positions
  const movedObjects: Array<{ objectId: string; x: number; y: number }> = [];

  for (const point of newPoints) {
    const obj = objects[point.objectId];
    if (!obj) continue;

    const newPos = positions[point.pointIndex];
    const objWidth = obj.width ?? 50;
    const objHeight = obj.height ?? 50;

    // Calculate top-left position from center position
    movedObjects.push({
      objectId: point.objectId,
      x: newPos.x - objWidth / 2,
      y: newPos.y - objHeight / 2
    });
  }

  // Get snap position for the new object (center position)
  const snapPosition = positions[newPointIndex];

  return {
    updatedCell,
    snapPosition,
    movedObjects
  };
}

/**
 * Remove an object from a cell's magnet points
 * @param cell - The battlefield cell or nexus cell
 * @param objectId - The ID of the object to remove
 * @param objects - All objects to check if object still exists
 * @returns Updated cell properties and positions of moved objects
 */
export function removeObjectFromCellMagnet(
  cell: BattlefieldCell | NexusCellObject,
  objectId: string,
  objects: Record<string, TableObject>
): {
  updatedCell: Partial<BattlefieldCell | NexusCellObject>;
  movedObjects: Array<{ objectId: string; x: number; y: number }>;
} | null {
  const existingPoints = (cell.magnetPoints ?? []);

  // Filter out the object and any non-existent objects
  const newPoints = existingPoints.filter(p => p.objectId !== objectId && p.objectId in objects);

  // If no change, return null
  if (newPoints.length === existingPoints.length) {
    return null;
  }

  // Re-index the remaining points sequentially
  const reindexedPoints = newPoints.map((p, i) => ({ ...p, pointIndex: i }));

  // Calculate new magnet point count (minimum 1)
  const newPointCount = Math.max(1, reindexedPoints.length);

  // Create updated cell with new point count and reindexed points
  const updatedCell: Partial<BattlefieldCell | NexusCellObject> = {
    magnetPointCount: newPointCount,
    magnetPoints: reindexedPoints.length > 0 ? reindexedPoints : undefined,
    magnetRotation: cell.magnetRotation ?? 0
  };

  // Calculate new magnet point positions
  const tempCell = { ...cell, ...updatedCell };
  const newPositions = calculateMagnetPointPositions(tempCell);

  // Calculate moved objects - all remaining objects need to move to new positions
  const movedObjects: Array<{ objectId: string; x: number; y: number }> = [];

  for (const point of reindexedPoints) {
    const obj = objects[point.objectId];
    if (!obj) continue;

    const newPos = newPositions[point.pointIndex];
    const objWidth = obj.width ?? 50;
    const objHeight = obj.height ?? 50;

    // Calculate top-left position from center position
    movedObjects.push({
      objectId: point.objectId,
      x: newPos.x - objWidth / 2,
      y: newPos.y - objHeight / 2
    });
  }

  return {
    updatedCell,
    movedObjects
  };
}

/**
 * Find which cell an object is snapped to
 * @param objectId - The object ID
 * @param objects - All objects
 * @returns The cell object if found, null otherwise
 */
export function findCellForSnappedObject(
  objectId: string,
  objects: Record<string, TableObject>
): (BattlefieldCell | NexusCellObject) | null {
  for (const obj of Object.values(objects)) {
    if ((obj.type === 'BATTLEFIELD_CELL' || obj.type === 'NEXUS_CELL') && obj.magnetPoints) {
      if (obj.magnetPoints.some(p => p.objectId === objectId)) {
        return obj as BattlefieldCell | NexusCellObject;
      }
    }
  }
  return null;
}
