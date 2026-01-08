
import { Coordinates, CardShape } from './types';

export const CARD_WIDTH = 150;
export const CARD_HEIGHT = 210;
export const TOKEN_SIZE = 80; 
export const DECK_OFFSET = 3; 

export const INITIAL_VIEWPORT: Coordinates = { x: 0, y: 0 };
export const INITIAL_ZOOM = 0.8; 

export const DEFAULT_DECK_IMAGE = 'https://picsum.photos/150/210?grayscale'; 

export const COLORS = [
  '#ef4444', // Red
  '#3b82f6', // Blue
  '#10b981', // Green
  '#f59e0b', // Yellow
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#64748b', // Slate
  '#d97706', // Amber
];

// Definitions for card dimensions based on shape
export const CARD_SHAPE_DIMS: Record<CardShape, { width: number, height: number }> = {
  [CardShape.POKER]: { width: 150, height: 210 },
  [CardShape.BRIDGE]: { width: 140, height: 210 },
  [CardShape.MINI_US]: { width: 105, height: 160 },
  [CardShape.MINI_EURO]: { width: 110, height: 170 },
  [CardShape.SQUARE]: { width: 160, height: 160 },
  // Hexagon Ratio: width = height * (sqrt(3)/2) approx 0.866
  // 180 * 0.866 = 155.88 -> 156
  [CardShape.HEX]: { width: 156, height: 180 }, 
  [CardShape.CIRCLE]: { width: 160, height: 160 },
  [CardShape.TRIANGLE]: { width: 160, height: 160 },
};
