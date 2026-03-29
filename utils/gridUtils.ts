import { Coordinates, MagnetPoint, BattlefieldCell, NexusCellObject, GridCellKey, GridCellMagnetPoints, Board } from '../types';
import { GridType, TableObject } from '../types';

export interface GridSnapResult {
  x: number;
  y: number;
  snapped: boolean;
}

export interface GridSnapOptions {
  gridSize: number;
  gridHeight?: number; // For hex grids with different height
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

/**
 * Calculate grid cell center based on grid type
 * @param board - The board object
 * @param col - Column index
 * @param row - Row index
 * @returns Cell center coordinates {x, y}
 */
export function calculateGridCellCenter(
  board: Board,
  col: number,
  row: number
): { x: number; y: number } {
  const gridW = board.gridWidth || board.gridSize || 50;
  const gridH = board.gridHeight || board.gridSize || 50;

  if (board.gridType === GridType.SQUARE) {
    return {
      x: board.x + (col * gridW) + (gridW / 2),
      y: board.y + (row * gridH) + (gridH / 2)
    };
  } else if (board.gridType === GridType.HEX) {
    const hCapIdeal = gridW / (2 * Math.sqrt(3));
    const hCap = Math.min(hCapIdeal, gridH / 2);
    const dx = gridW;
    const dy = gridH - hCap;
    const offsetX = gridW / 2;

    return {
      x: board.x + col * dx + (row % 2 === 1 ? offsetX : 0),
      y: board.y + row * dy
    };
  } else if (board.gridType === GridType.HEX_HORIZONTAL) {
    const wCapIdeal = gridH / (2 * Math.sqrt(3));
    const wCap = Math.min(wCapIdeal, gridW / 2);
    const dx = gridW - wCap;
    const dy = gridH;
    const offsetY = gridH / 2;

    return {
      x: board.x + col * dx,
      y: board.y + row * dy + (col % 2 === 1 ? offsetY : 0)
    };
  } else {
    // Fallback for other grid types
    return {
      x: board.x + (col * gridW) + (gridW / 2),
      y: board.y + (row * gridH) + (gridH / 2)
    };
  }
}

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
 * Based on flexible-hex-grid-calculator logic
 * @param gridWidth - Width of a single pointy-top hex (default 100)
 * @returns Hex grid path and pattern dimensions
 */
export function calculateFlexibleHexGrid(gridWidth: number = DEFAULT_HEX_WIDTH): FlexibleHexGrid {
  const width = gridWidth;
  const height = calculateHexHeight(width);

  // Calculate hex geometry using flexible approach from flexible-hex-grid-calculator
  const hCapIdeal = width / (2 * Math.sqrt(3));
  const hCap = Math.min(hCapIdeal, height / 2);
  const sideHeight = height - 2 * hCap;

  const halfW = width / 2;
  const halfH = height / 2;

  // Vertices centered at (0, 0) for pointy-top hex
  const vertices = [
    { x: 0, y: -halfH },          // Top
    { x: halfW, y: -sideHeight / 2 }, // Top Right
    { x: halfW, y: sideHeight / 2 },  // Bottom Right
    { x: 0, y: halfH },           // Bottom
    { x: -halfW, y: sideHeight / 2 }, // Bottom Left
    { x: -halfW, y: -sideHeight / 2 }, // Top Left
  ];

  // Grid spacing from flexible-hex-grid-calculator
  const dx = width;
  const dy = height - hCap;
  const offsetX = width / 2;
  const offsetY = 0;

  // Pattern dimensions - need 2x2 grid for seamless tiling
  const patternWidth = dx * 2;
  const patternHeight = dy * 2;

  // Helper to create hex path at specific position
  const makeHexPath = (centerX: number, centerY: number) => {
    return vertices.map((v, i) => {
      const x = v.x + centerX;
      const y = v.y + centerY;
      return (i === 0 ? 'M' : 'L') + ` ${x.toFixed(2)} ${y.toFixed(2)}`;
    }).join(' ') + ' Z';
  };

  // Create 2x2 grid pattern
  // Row 0: (0,0), (dx, 0)
  // Row 1: (offsetX, dy), (dx + offsetX, dy)
  const tilingPath =
    makeHexPath(0, 0) +
    makeHexPath(dx, 0) +
    makeHexPath(offsetX, dy) +
    makeHexPath(dx + offsetX, dy);

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
    // Third column (for seamless pattern width)
    `M ${colSpacing * 2 + quarterW} ${colOffset} ` +
    `L ${colSpacing * 2 + width - quarterW} ${colOffset} ` +
    `L ${colSpacing * 2 + width} ${halfH + colOffset} ` +
    `L ${colSpacing * 2 + width - quarterW} ${height + colOffset} ` +
    `L ${colSpacing * 2 + quarterW} ${height + colOffset} ` +
    `L ${colSpacing * 2} ${halfH + colOffset} Z` +
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
 * Uses same formulas as HexGrid.tsx for consistent positioning
 */
export function snapToGrid(
  x: number,
  y: number,
  options: GridSnapOptions
): Coordinates {
  const { gridSize, gridHeight, gridType, offsetX = 0, offsetY = 0 } = options;

  // Adjust for grid offset
  const adjustedX = x - offsetX;
  const adjustedY = y - offsetY;

  let snappedX: number;
  let snappedY: number;

  switch (gridType) {
    case GridType.HEX: {
      // Pointy-top hex - using same formulas as HexGrid.tsx
      const width = gridSize;
      const height = gridHeight ?? calculateHexHeight(width);

      const hCapIdeal = width / (2 * Math.sqrt(3));
      const hCap = Math.min(hCapIdeal, height / 2);

      const dx = width;
      const dy = height - hCap;
      const hexOffsetX = width / 2;
      const hexOffsetY = 0;

      // Find nearest hex center
      // We need to consider both even and odd columns/rows
      const col = Math.round(adjustedX / dx);
      const row = Math.round(adjustedY / dy);

      // Try different combinations to find nearest center
      let minDist = Infinity;
      let bestX = 0;
      let bestY = 0;

      // Check surrounding hexes to find nearest
      for (let dc = -1; dc <= 1; dc++) {
        for (let dr = -1; dr <= 1; dr++) {
          const c = col + dc;
          const r = row + dr;

          const testX = c * dx + (r % 2 === 1 ? hexOffsetX : 0);
          const testY = r * dy + (c % 2 === 1 ? hexOffsetY : 0);

          const dist = Math.sqrt((testX - adjustedX) ** 2 + (testY - adjustedY) ** 2);
          if (dist < minDist) {
            minDist = dist;
            bestX = testX;
            bestY = testY;
          }
        }
      }

      snappedX = bestX;
      snappedY = bestY;
      break;
    }

    case GridType.HEX_HORIZONTAL: {
      // Flat-top hex - using same formulas as HexGrid.tsx
      const width = gridSize;
      const height = gridHeight ?? calculateFlatHexHeight(width);

      const wCapIdeal = height / (2 * Math.sqrt(3));
      const wCap = Math.min(wCapIdeal, width / 2);

      const dx = width - wCap;
      const dy = height;
      const hexOffsetX = 0;
      const hexOffsetY = height / 2;

      // Find nearest hex center
      const col = Math.round(adjustedX / dx);
      const row = Math.round(adjustedY / dy);

      // Try different combinations to find nearest center
      let minDist = Infinity;
      let bestX = 0;
      let bestY = 0;

      // Check surrounding hexes to find nearest
      for (let dc = -1; dc <= 1; dc++) {
        for (let dr = -1; dr <= 1; dr++) {
          const c = col + dc;
          const r = row + dr;

          const testX = c * dx + (r % 2 === 1 ? hexOffsetX : 0);
          const testY = r * dy + (c % 2 === 1 ? hexOffsetY : 0);

          const dist = Math.sqrt((testX - adjustedX) ** 2 + (testY - adjustedY) ** 2);
          if (dist < minDist) {
            minDist = dist;
            bestX = testX;
            bestY = testY;
          }
        }
      }

      snappedX = bestX;
      snappedY = bestY;
      break;
    }

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

      // Magnet point is at 55% from center along the line
      const magnetRadius = lineLength * 0.55;
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
  const positions = calculateMagnetPointPositions({ ...cell, ...updatedCell } as BattlefieldCell | NexusCellObject);

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
  const tempCell = { ...cell, ...updatedCell } as BattlefieldCell | NexusCellObject;
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

/**
 * Hex grid coordinates (axial coordinate system)
 */
export interface HexCoords {
  q: number; // Column
  r: number; // Row
}

/**
 * Convert pixel coordinates to hex coordinates
 * @param x - Pixel X coordinate
 * @param y - Pixel Y coordinate
 * @param hexWidth - Width of hex
 * @param hexHeight - Height of hex
 * @param orientation - 'pointy-top' or 'flat-top'
 * @returns Hex coordinates {q, r}
 */
export function pixelToHex(
  x: number,
  y: number,
  hexWidth: number,
  hexHeight: number,
  orientation: 'pointy-top' | 'flat-top'
): HexCoords {
  if (orientation === 'pointy-top') {
    // Pointy-top hex conversion
    const hCapIdeal = hexWidth / (2 * Math.sqrt(3));
    const hCap = Math.min(hCapIdeal, hexHeight / 2);

    const dx = hexWidth;
    const dy = hexHeight - hCap;

    const q = Math.round((x * Math.sqrt(3) / 3 - y / 3) / (hexWidth / 2));
    const r = Math.round(y * 2 / 3 / (hexHeight / 2));

    return { q, r };
  } else {
    // Flat-top hex conversion
    const wCapIdeal = hexHeight / (2 * Math.sqrt(3));
    const wCap = Math.min(wCapIdeal, hexWidth / 2);

    const dx = hexWidth - wCap;
    const dy = hexHeight;

    const q = Math.round(x * 2 / 3 / (hexWidth / 2));
    const r = Math.round((-x / 3 + y * Math.sqrt(3) / 3) / (hexHeight / 2));

    return { q, r };
  }
}

/**
 * Convert hex coordinates to pixel coordinates
 * @param hex - Hex coordinates {q, r}
 * @param hexWidth - Width of hex
 * @param hexHeight - Height of hex
 * @param orientation - 'pointy-top' or 'flat-top'
 * @returns Pixel coordinates {x, y}
 */
export function hexToPixel(
  hex: HexCoords,
  hexWidth: number,
  hexHeight: number,
  orientation: 'pointy-top' | 'flat-top'
): { x: number; y: number } {
  if (orientation === 'pointy-top') {
    // Pointy-top hex conversion
    const hCapIdeal = hexWidth / (2 * Math.sqrt(3));
    const hCap = Math.min(hCapIdeal, hexHeight / 2);

    const dx = hexWidth;
    const dy = hexHeight - hCap;
    const offsetX = hexWidth / 2;

    const x = hex.q * dx + (hex.r % 2 === 1 ? offsetX : 0);
    const y = hex.r * dy;

    return { x, y };
  } else {
    // Flat-top hex conversion
    const wCapIdeal = hexHeight / (2 * Math.sqrt(3));
    const wCap = Math.min(wCapIdeal, hexWidth / 2);

    const dx = hexWidth - wCap;
    const dy = hexHeight;
    const offsetY = hexHeight / 2;

    const x = hex.q * dx;
    const y = hex.r * dy + (hex.q % 2 === 1 ? offsetY : 0);

    return { x, y };
  }
}

/**
 * Get all neighboring hex coordinates
 * @param hex - Center hex coordinates
 * @returns Array of 6 neighboring hex coordinates
 */
export function getHexNeighbors(hex: HexCoords): HexCoords[] {
  // Pointy-top neighbors
  const directions = [
    { q: 1, r: 0 },   // Right
    { q: 1, r: -1 },  // Top right
    { q: 0, r: -1 },  // Top left
    { q: -1, r: 0 },  // Left
    { q: -1, r: 1 },  // Bottom left
    { q: 0, r: 1 }    // Bottom right
  ];

  return directions.map(dir => ({
    q: hex.q + dir.q,
    r: hex.r + dir.r
  }));
}

/**
 * Calculate distance between two hexes
 * @param a - First hex coordinates
 * @param b - Second hex coordinates
 * @returns Distance in hex steps
 */
export function hexDistance(a: HexCoords, b: HexCoords): number {
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}

/**
 * Get hexes within a certain radius
 * @param center - Center hex coordinates
 * @param radius - Radius in hex steps
 * @returns Array of hex coordinates within radius
 */
export function getHexesInRadius(center: HexCoords, radius: number): HexCoords[] {
  const results: HexCoords[] = [];

  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
      results.push({ q: center.q + q, r: center.r + r });
    }
  }

  return results;
}

/**
 * Get the center of the hex that contains the given pixel coordinates
 * This is the main function for hex grid magnetism
 * @param x - Pixel X coordinate
 * @param y - Pixel Y coordinate
 * @param hexWidth - Width of hex
 * @param hexHeight - Height of hex
 * @param orientation - 'pointy-top' or 'flat-top'
 * @returns Center pixel coordinates of the containing hex {x, y}
 */
export function getHexCenterAtPixel(
  x: number,
  y: number,
  hexWidth: number,
  hexHeight: number,
  orientation: 'pointy-top' | 'flat-top'
): { x: number; y: number } {
  if (orientation === 'pointy-top') {
    // Pointy-top hex
    const hCapIdeal = hexWidth / (2 * Math.sqrt(3));
    const hCap = Math.min(hCapIdeal, hexHeight / 2);

    const dx = hexWidth;
    const dy = hexHeight - hCap;
    const offsetX = hexWidth / 2;
    const offsetY = 0;

    // Find nearest hex center by checking surrounding hexes
    let minDist = Infinity;
    let bestX = 0;
    let bestY = 0;

    // Check hexes in a 3x3 area around the estimated position
    const estimatedCol = Math.round(x / dx);
    const estimatedRow = Math.round(y / dy);

    for (let dc = -2; dc <= 2; dc++) {
      for (let dr = -2; dr <= 2; dr++) {
        const c = estimatedCol + dc;
        const r = estimatedRow + dr;

        const testX = c * dx + (r % 2 === 1 ? offsetX : 0);
        const testY = r * dy + (c % 2 === 1 ? offsetY : 0);

        const dist = Math.sqrt((testX - x) ** 2 + (testY - y) ** 2);
        if (dist < minDist) {
          minDist = dist;
          bestX = testX;
          bestY = testY;
        }
      }
    }

    return { x: bestX, y: bestY };
  } else {
    // Flat-top hex
    const wCapIdeal = hexHeight / (2 * Math.sqrt(3));
    const wCap = Math.min(wCapIdeal, hexWidth / 2);

    const dx = hexWidth - wCap;
    const dy = hexHeight;
    const offsetX = 0;
    const offsetY = hexHeight / 2;

    // Find nearest hex center by checking surrounding hexes
    let minDist = Infinity;
    let bestX = 0;
    let bestY = 0;

    // Check hexes in a 3x3 area around the estimated position
    const estimatedCol = Math.round(x / dx);
    const estimatedRow = Math.round(y / dy);

    for (let dc = -2; dc <= 2; dc++) {
      for (let dr = -2; dr <= 2; dr++) {
        const c = estimatedCol + dc;
        const r = estimatedRow + dr;

        const testX = c * dx + (r % 2 === 1 ? offsetX : 0);
        const testY = r * dy + (c % 2 === 1 ? offsetY : 0);

        const dist = Math.sqrt((testX - x) ** 2 + (testY - y) ** 2);
        if (dist < minDist) {
          minDist = dist;
          bestX = testX;
          bestY = testY;
        }
      }
    }

    return { x: bestX, y: bestY };
  }
}

/**
 * Snap object to hex grid center
 * Convenience function that combines offset handling with hex center calculation
 * @param objX - Object X position (top-left)
 * @param objY - Object Y position (top-left)
 * @param objWidth - Object width
 * @param objHeight - Object height
 * @param gridWidth - Grid hex width
 * @param gridHeight - Grid hex height
 * @param gridType - Grid type (HEX or HEX_HORIZONTAL)
 * @param offsetX - Grid offset X (default 0)
 * @param offsetY - Grid offset Y (default 0)
 * @returns Snapped position {x, y} for object top-left corner
 */
export function snapObjectToHexGrid(
  objX: number,
  objY: number,
  objWidth: number,
  objHeight: number,
  gridWidth: number,
  gridHeight: number,
  gridType: GridType.HEX | GridType.HEX_HORIZONTAL,
  offsetX: number = 0,
  offsetY: number = 0
): { x: number; y: number } {
  // Calculate object center
  const objCenterX = objX + objWidth / 2;
  const objCenterY = objY + objHeight / 2;

  // Adjust for grid offset
  const adjustedX = objCenterX - offsetX;
  const adjustedY = objCenterY - offsetY;

  // Get hex center
  const hexCenter = getHexCenterAtPixel(
    adjustedX,
    adjustedY,
    gridWidth,
    gridHeight,
    gridType === GridType.HEX ? 'pointy-top' : 'flat-top'
  );

  // Add offset back
  const finalCenterX = hexCenter.x + offsetX;
  const finalCenterY = hexCenter.y + offsetY;

  // Calculate top-left position
  return {
    x: finalCenterX - objWidth / 2,
    y: finalCenterY - objHeight / 2
  };
}

/**
 * Get all hex centers in a rectangular area
 * Useful for grid operations like getting all cells in a board
 * @param startX - Area start X (pixels)
 * @param startY - Area start Y (pixels)
 * @param width - Area width (pixels)
 * @param height - Area height (pixels)
 * @param hexWidth - Hex width
 * @param hexHeight - Hex height
 * @param orientation - 'pointy-top' or 'flat-top'
 * @returns Array of hex center coordinates {x, y}
 */
export function getHexCentersInArea(
  startX: number,
  startY: number,
  width: number,
  height: number,
  hexWidth: number,
  hexHeight: number,
  orientation: 'pointy-top' | 'flat-top'
): Array<{ x: number; y: number; q: number; r: number }> {
  const centers: Array<{ x: number; y: number; q: number; r: number }> = [];

  if (orientation === 'pointy-top') {
    const hCapIdeal = hexWidth / (2 * Math.sqrt(3));
    const hCap = Math.min(hCapIdeal, hexHeight / 2);

    const dx = hexWidth;
    const dy = hexHeight - hCap;
    const offsetX = hexWidth / 2;
    const offsetY = 0;

    const cols = Math.ceil(width / dx) + 2;
    const rows = Math.ceil(height / dy) + 2;

    for (let c = -1; c < cols; c++) {
      for (let r = -1; r < rows; r++) {
        const x = c * dx + (r % 2 === 1 ? offsetX : 0);
        const y = r * dy + (c % 2 === 1 ? offsetY : 0);

        // Check if this hex center is within the area (with some margin)
        if (x >= startX - hexWidth && x <= startX + width + hexWidth &&
            y >= startY - hexHeight && y <= startY + height + hexHeight) {
          centers.push({ x, y, q: c, r });
        }
      }
    }
  } else {
    const wCapIdeal = hexHeight / (2 * Math.sqrt(3));
    const wCap = Math.min(wCapIdeal, hexWidth / 2);

    const dx = hexWidth - wCap;
    const dy = hexHeight;
    const offsetX = 0;
    const offsetY = hexHeight / 2;

    const cols = Math.ceil(width / dx) + 2;
    const rows = Math.ceil(height / dy) + 2;

    for (let c = -1; c < cols; c++) {
      for (let r = -1; r < rows; r++) {
        const x = c * dx + (r % 2 === 1 ? offsetX : 0);
        const y = r * dy + (c % 2 === 1 ? offsetY : 0);

        // Check if this hex center is within the area (with some margin)
        if (x >= startX - hexWidth && x <= startX + width + hexWidth &&
            y >= startY - hexHeight && y <= startY + height + hexHeight) {
          centers.push({ x, y, q: c, r: r });
        }
      }
    }
  }

  return centers;
}

/**
 * Generate a grid cell key from column and row indices
 * @param col - Column index
 * @param row - Row index
 * @returns Grid cell key string "col,row"
 */
export function generateGridCellKey(col: number, row: number): string {
  return `${col},${row}`;
}

/**
 * Parse a grid cell key into column and row indices
 * @param key - Grid cell key string "col,row"
 * @returns Grid cell key with col and row
 */
export function parseGridCellKey(key: string): GridCellKey {
  const [col, row] = key.split(',').map(Number);
  return { col, row };
}

/**
 * Get magnet points data for a specific grid cell
 * @param board - The board object
 * @param col - Column index
 * @param row - Row index
 * @returns Grid cell magnet points or undefined if not set
 */
export function getGridCellMagnetPoints(
  board: Board,
  col: number,
  row: number
): GridCellMagnetPoints | undefined {
  const key = generateGridCellKey(col, row);
  return board.gridCellMagnetPoints?.[key];
}

/**
 * Calculate magnet point positions for a grid cell
 * Similar to calculateMagnetPointPositions but for grid cells
 * @param cellCenterX - Cell center X coordinate
 * @param cellCenterY - Cell center Y coordinate
 * @param cellWidth - Cell width
 * @param cellHeight - Cell height
 * @param magnetPoints - Grid cell magnet points data
 * @returns Array of magnet point positions {x, y}
 */
export function calculateGridCellMagnetPositions(
  cellCenterX: number,
  cellCenterY: number,
  cellWidth: number,
  cellHeight: number,
  magnetPoints: GridCellMagnetPoints
): { x: number; y: number }[] {
  const magnetPointCount = magnetPoints.magnetPointCount ?? 1;
  const magnetRotation = magnetPoints.magnetRotation ?? 0;

  const positions: { x: number; y: number }[] = [];

  if (magnetPointCount === 1) {
    // Single point at center
    positions.push({ x: cellCenterX, y: cellCenterY });
  } else {
    // Multiple magnet points along lines from center to inscribed ellipse
    const anglePerSlice = 360 / magnetPointCount;
    const halfW = cellWidth / 2 - 2; // 2 vu padding
    const halfH = cellHeight / 2 - 2;

    for (let i = 0; i < magnetPointCount; i++) {
      const angle = (i * anglePerSlice + magnetRotation) * Math.PI / 180;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      // Calculate distance to inscribed ellipse in this direction
      const lineLength = 1 / Math.sqrt(
        (cosA / halfW) ** 2 + (sinA / halfH) ** 2
      );

      // Magnet point is at 55% from center along the line
      const magnetRadius = lineLength * 0.55;
      const magnetX = cellCenterX + cosA * magnetRadius;
      const magnetY = cellCenterY + sinA * magnetRadius;
      positions.push({ x: magnetX, y: magnetY });
    }
  }

  return positions;
}

/**
 * Add an object to a grid cell's magnet points
 * Automatically increases magnetPointCount if needed
 * @param board - The board object
 * @param col - Column index
 * @param row - Row index
 * @param objectId - The ID of the object to add
 * @param objects - All objects to check if object still exists
 * @param cellCenterX - Cell center X coordinate
 * @param cellCenterY - Cell center Y coordinate
 * @param cellWidth - Cell width
 * @param cellHeight - Cell height
 * @returns Updated board grid cell magnet points, snap position, and moved objects
 */
export function addObjectToGridCellMagnet(
  board: Board,
  col: number,
  row: number,
  objectId: string,
  objects: Record<string, TableObject>,
  cellCenterX: number,
  cellCenterY: number,
  cellWidth: number,
  cellHeight: number
): {
  updatedBoard: Partial<Board>;
  snapPosition: { x: number; y: number };
  movedObjects: Array<{ objectId: string; x: number; y: number }>;
} {
  const key = generateGridCellKey(col, row);
  const existingCellData = board.gridCellMagnetPoints?.[key] || {};

  // Clean up magnet points - remove references to non-existent objects
  const existingPoints = (existingCellData.magnetPoints || []).filter((p: MagnetPoint) => p.objectId in objects);

  // Check if this object is already snapped to this cell
  if (existingPoints.some((p: MagnetPoint) => p.objectId === objectId)) {
    // Object already in this cell, return current position
    const positions = calculateGridCellMagnetPositions(
      cellCenterX, cellCenterY, cellWidth, cellHeight, existingCellData
    );
    const existingPoint = existingPoints.find((p: MagnetPoint) => p.objectId === objectId);
    if (existingPoint) {
      const pos = positions[existingPoint.pointIndex];
      return {
        updatedBoard: {
          gridCellMagnetPoints: {
            ...board.gridCellMagnetPoints,
            [key]: { ...existingCellData, magnetPoints: existingPoints }
          }
        },
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

  // Calculate required magnet point count
  const requiredPointCount = Math.max(newPoints.length, existingCellData.magnetPointCount ?? 1);

  // Create updated cell data
  const updatedCellData: GridCellMagnetPoints = {
    ...existingCellData,
    magnetPointCount: requiredPointCount,
    magnetPoints: newPoints,
    magnetRotation: existingCellData.magnetRotation ?? 0
  };

  // Calculate all magnet point positions for the updated cell
  const positions = calculateGridCellMagnetPositions(
    cellCenterX, cellCenterY, cellWidth, cellHeight, updatedCellData
  );

  // Calculate moved objects
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
    updatedBoard: {
      gridCellMagnetPoints: {
        ...board.gridCellMagnetPoints,
        [key]: updatedCellData
      }
    },
    snapPosition,
    movedObjects
  };
}

/**
 * Remove an object from a grid cell's magnet points
 * @param board - The board object
 * @param col - Column index
 * @param row - Row index
 * @param objectId - The ID of the object to remove
 * @param objects - All objects to check if object still exists
 * @param cellCenterX - Cell center X coordinate
 * @param cellCenterY - Cell center Y coordinate
 * @param cellWidth - Cell width
 * @param cellHeight - Cell height
 * @returns Updated board grid cell magnet points and moved objects, or null if no change
 */
export function removeObjectFromGridCellMagnet(
  board: Board,
  col: number,
  row: number,
  objectId: string,
  objects: Record<string, TableObject>,
  cellCenterX: number,
  cellCenterY: number,
  cellWidth: number,
  cellHeight: number
): {
  updatedBoard: Partial<Board>;
  movedObjects: Array<{ objectId: string; x: number; y: number }>;
} | null {
  const key = generateGridCellKey(col, row);
  const existingCellData = board.gridCellMagnetPoints?.[key];

  if (!existingCellData) {
    return null;
  }

  const existingPoints = existingCellData.magnetPoints || [];

  // Filter out the object and any non-existent objects
  const newPoints = existingPoints.filter((p: MagnetPoint) => p.objectId !== objectId && p.objectId in objects);

  // If no change, return null
  if (newPoints.length === existingPoints.length) {
    return null;
  }

  // Re-index the remaining points sequentially
  const reindexedPoints = newPoints.map((p: MagnetPoint, i: number) => ({ ...p, pointIndex: i }));

  // Calculate new magnet point count (minimum 1)
  const newPointCount = Math.max(1, reindexedPoints.length);

  // Create updated cell data with new point count and reindexed points
  const updatedCellData: GridCellMagnetPoints = {
    magnetPointCount: newPointCount,
    magnetPoints: reindexedPoints.length > 0 ? reindexedPoints : undefined,
    magnetRotation: existingCellData.magnetRotation ?? 0
  };

  // Calculate new magnet point positions
  const positions = calculateGridCellMagnetPositions(
    cellCenterX, cellCenterY, cellWidth, cellHeight, updatedCellData
  );

  // Calculate moved objects - all remaining objects need to move to new positions
  const movedObjects: Array<{ objectId: string; x: number; y: number }> = [];

  for (const point of reindexedPoints) {
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

  // Build updated board
  const updatedGridCellMagnetPoints = { ...board.gridCellMagnetPoints };
  if (reindexedPoints.length === 0) {
    // Remove the cell entry if no more magnet points
    delete updatedGridCellMagnetPoints[key];
  } else {
    updatedGridCellMagnetPoints[key] = updatedCellData;
  }

  return {
    updatedBoard: {
      gridCellMagnetPoints: updatedGridCellMagnetPoints
    },
    movedObjects
  };
}

/**
 * Find which grid cell an object is snapped to
 * @param objectId - The object ID
 * @param boards - All boards
 * @returns The board, column, and row if found, null otherwise
 */
export function findGridCellForSnappedObject(
  objectId: string,
  boards: Record<string, Board>
): { board: Board; col: number; row: number } | null {
  for (const board of Object.values(boards)) {
    if (board.gridCellMagnetPoints) {
      for (const [key, cellData] of Object.entries(board.gridCellMagnetPoints)) {
        if (cellData.magnetPoints?.some((p: MagnetPoint) => p.objectId === objectId)) {
          const { col, row } = parseGridCellKey(key);
          return { board, col, row };
        }
      }
    }
  }
  return null;
}
