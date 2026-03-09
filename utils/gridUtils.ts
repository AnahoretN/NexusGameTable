import { Coordinates } from '../types';
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
