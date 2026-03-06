import { TokenShape, CardShape, CardOrientation } from '../types';

// SVG paths for basic shapes that don't change with aspect ratio
const BASIC_SHAPE_PATHS: Record<TokenShape, { path: string; viewBox: string; useRect?: boolean }> = {
  [TokenShape.TRIANGLE]: {
    path: 'M 30 0 L 60 60 L 0 60 Z',
    viewBox: '0 0 60 60'
  },
  [TokenShape.CIRCLE]: {
    path: 'M 30 0 A 30 30 0 1 1 30 60 A 30 30 0 1 1 30 0',
    viewBox: '0 0 60 60'
  },
  [TokenShape.SQUARE]: {
    path: '',
    viewBox: '0 0 60 60',
    useRect: true
  },
  [TokenShape.HEX]: {
    path: '', // Generated dynamically
    viewBox: '0 0 60 60'
  },
  [TokenShape.HEX_HORIZONTAL]: {
    path: '', // Generated dynamically
    viewBox: '0 0 60 60'
  }
};

/**
 * Generate a pointy-top hexagon
 * Top and bottom angles are always 120° regardless of width/height ratio
 * @param width - The width of the bounding box
 * @param height - The height of the bounding box
 */
export function generatePointyTopHexPath(width: number, height: number): { path: string; viewBox: string } {
  // To keep 120° angle at top vertex: shoulder Y must be W/(2√3)
  // This preserves the top/bottom angles at 120°
  // Side angles will vary with aspect ratio

  const shoulderY1 = width / 2 / Math.sqrt(3);  // W/2 divided by tan(60°)
  const shoulderY2 = height - shoulderY1;

  const path = `M ${width / 2} 0 L ${width} ${shoulderY1} L ${width} ${shoulderY2} L ${width / 2} ${height} L 0 ${shoulderY2} L 0 ${shoulderY1} Z`;

  return { path, viewBox: `0 0 ${width} ${height}` };
}

/**
 * Generate a flat-top hexagon
 * Left and right angles are always 120° regardless of width/height ratio
 * @param width - The width of the bounding box
 * @param height - The height of the bounding box
 */
export function generateFlatTopHexPath(width: number, height: number): { path: string; viewBox: string } {
  // To keep 120° angle at left vertex: shoulder X must be H/(2√3)
  // This preserves the left/right angles at 120°

  const shoulderX1 = height / 2 / Math.sqrt(3);  // H/2 divided by tan(60°)
  const shoulderX2 = width - shoulderX1;

  const path = `M ${shoulderX1} 0 L ${shoulderX2} 0 L ${width} ${height / 2} L ${shoulderX2} ${height} L ${shoulderX1} ${height} L 0 ${height / 2} Z`;

  return { path, viewBox: `0 0 ${width} ${height}` };
}

/**
 * Get shape path data for tokens
 * @param shape - Token shape
 * @param aspectRatio - Width/height ratio for dynamic shapes
 */
export function getTokenShapePath(shape: TokenShape, aspectRatio: number = 1): { path: string; viewBox: string; useRect?: boolean } {
  // For basic shapes, return static path
  if (shape !== TokenShape.HEX && shape !== TokenShape.HEX_HORIZONTAL) {
    return BASIC_SHAPE_PATHS[shape] || BASIC_SHAPE_PATHS[TokenShape.SQUARE];
  }

  // For HEX (pointy-top), generate path with actual dimensions
  if (shape === TokenShape.HEX) {
    const hexWidth = 60;
    const hexHeight = Math.round(60 / aspectRatio);
    return generatePointyTopHexPath(hexWidth, hexHeight);
  }

  // For HEX_HORIZONTAL (flat-top), generate path with actual dimensions
  if (shape === TokenShape.HEX_HORIZONTAL) {
    const hexHeight = 60;
    const hexWidth = Math.round(60 * aspectRatio);
    return generateFlatTopHexPath(hexWidth, hexHeight);
  }

  return BASIC_SHAPE_PATHS[TokenShape.SQUARE];
}

/**
 * Get shape path data for cards/decks
 * @param shape - Card shape
 * @param orientation - Card orientation (vertical/horizontal)
 * @param aspectRatio - Width/height ratio for dynamic shapes
 */
export function getCardShapePath(
  shape: CardShape,
  orientation: CardOrientation = CardOrientation.VERTICAL,
  aspectRatio: number = 1
): { path: string; viewBox: string } {
  // Map CardShape to equivalent logic
  const isGeometric = shape === CardShape.HEX || shape === CardShape.TRIANGLE;
  const isHorizontal = isGeometric && orientation === CardOrientation.HORIZONTAL;

  // For HEX card shape
  if (shape === CardShape.HEX) {
    if (isHorizontal) {
      // Flat-top hex for horizontal orientation
      const hexHeight = 100;
      const hexWidth = Math.round(100 * aspectRatio);
      return generateFlatTopHexPath(hexWidth, hexHeight);
    } else {
      // Pointy-top hex for vertical orientation
      const hexWidth = 100;
      const hexHeight = Math.round(100 / aspectRatio);
      return generatePointyTopHexPath(hexWidth, hexHeight);
    }
  }

  // For TRIANGLE and other shapes, use static paths (viewBox 0 0 100 100)
  const staticPaths: Record<CardShape, string> = {
    [CardShape.HEX]: '', // Should be handled above
    [CardShape.TRIANGLE]: isHorizontal
      ? 'M 5 50 L 95 5 L 95 95 Z'  // Point at right
      : 'M 50 5 L 95 95 L 5 95 Z', // Point at top
    [CardShape.CIRCLE]: 'M 50 0 A 50 50 0 1 1 50 100 A 50 50 0 1 1 50 0',
    [CardShape.SQUARE]: 'M 0 0 L 100 0 L 100 100 L 0 100 Z',
    [CardShape.POKER]: 'M 0 0 L 100 0 L 100 100 L 0 100 Z',
    [CardShape.BRIDGE]: 'M 0 0 L 100 0 L 100 100 L 0 100 Z',
    [CardShape.MINI_US]: 'M 0 0 L 100 0 L 100 100 L 0 100 Z',
    [CardShape.MINI_EURO]: 'M 0 0 L 100 0 L 100 100 L 0 100 Z',
  };

  return {
    path: staticPaths[shape] || staticPaths[CardShape.POKER],
    viewBox: '0 0 100 100'
  };
}
