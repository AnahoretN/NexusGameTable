import { CardShape, CardOrientation, TokenShape } from '../types';

export interface ShapeStyles {
  borderRadius?: string;
  clipPath?: string;
  // For SVG-based shapes (rounded hex/triangle)
  useSvg?: boolean;
  svgPath?: string;
  svgViewBox?: string;
}

// SVG paths for rounded shapes
const ROUNDED_HEX_PATH = 'M 30 2 L 58 17 L 58 47 L 30 62 L 2 47 L 2 17 Z';
const ROUNDED_TRIANGLE_PATH = 'M 30 3 L 57 55 L 3 55 Z';

/**
 * Get CSS styles for card shapes
 * @param shape - CardShape enum value
 * @param orientation - CardOrientation (affects HEX clipPath)
 * @returns CSS styles object with borderRadius and clipPath
 */
export function getCardShapeStyles(
  shape: CardShape = CardShape.POKER,
  orientation: CardOrientation = CardOrientation.VERTICAL
): ShapeStyles {
  switch (shape) {
    case CardShape.CIRCLE:
      return { borderRadius: '50%' };

    case CardShape.HEX:
      // Vertical: vertices at top/bottom, Horizontal: vertices at left/right
      if (orientation === CardOrientation.HORIZONTAL) {
        return {
          borderRadius: '0',
          clipPath: 'polygon(0% 50%, 25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%)'
        };
      }
      return {
        borderRadius: '0',
        clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)'
      };

    case CardShape.TRIANGLE:
      return {
        borderRadius: '0',
        clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)'
      };

    case CardShape.SQUARE:
    case CardShape.MINI_US:
    case CardShape.MINI_EURO:
    case CardShape.BRIDGE:
    case CardShape.POKER:
    default:
      return { borderRadius: '8px' };
  }
}

/**
 * Get CSS styles for token shapes
 * @param shape - TokenShape enum value
 * @returns CSS styles object with borderRadius, clipPath, or SVG data for rounded shapes
 */
export function getTokenShapeStyles(shape: TokenShape): ShapeStyles {
  switch (shape) {
    case TokenShape.CIRCLE:
      return { borderRadius: '50%' };

    case TokenShape.HEX:
      // Use SVG for rounded hex with proper stroke
      return {
        useSvg: true,
        svgPath: ROUNDED_HEX_PATH,
        svgViewBox: '0 0 60 64'
      };

    case TokenShape.TRIANGLE:
      // Use SVG for rounded triangle with proper stroke
      return {
        useSvg: true,
        svgPath: ROUNDED_TRIANGLE_PATH,
        svgViewBox: '0 0 60 60'
      };

    case TokenShape.SQUARE:
      return { borderRadius: '5px' };

    case TokenShape.RECTANGLE:
      return { borderRadius: '5px' };

    case TokenShape.STANDEE:
      // Standee (figurine) - no special shaping
      return { borderRadius: '5px' };

    default:
      return { borderRadius: '5px' };
  }
}

/**
 * Check if a shape is geometric (uses clipPath)
 * @param shape - CardShape or TokenShape value
 * @returns true if shape is geometric (CIRCLE, HEX, TRIANGLE)
 */
export function isGeometricCardShape(shape: CardShape): boolean {
  return shape === CardShape.HEX || shape === CardShape.TRIANGLE || shape === CardShape.CIRCLE;
}

export function isGeometricTokenShape(shape: TokenShape): boolean {
  return shape === TokenShape.HEX || shape === TokenShape.TRIANGLE || shape === TokenShape.CIRCLE;
}

/**
 * Get border radius for token thumbnail (used in Tools panel)
 * @param shape - TokenShape enum value
 * @returns border radius CSS value
 */
export function getTokenThumbnailBorderRadius(shape: TokenShape): string {
  switch (shape) {
    case TokenShape.CIRCLE:
      return '50%';
    case TokenShape.HEX:
      return '30%';
    default:
      return '5px';
  }
}
