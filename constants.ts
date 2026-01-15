
import { Coordinates, CardShape } from './types';

export const CARD_WIDTH = 120;
export const CARD_HEIGHT = 168;
export const TOKEN_SIZE = 80;
export const DECK_OFFSET = 3;

// UI Panel dimensions
export const MAIN_MENU_WIDTH = 310;
export const SCROLLBAR_WIDTH = 16;

// Default object dimensions
export const DEFAULT_DECK_WIDTH = 120;
export const DEFAULT_DECK_HEIGHT = 168;
export const DEFAULT_DICE_SIZE = 60;
export const DEFAULT_COUNTER_WIDTH = 120;
export const DEFAULT_COUNTER_HEIGHT = 50;
export const DEFAULT_PANEL_WIDTH = 300;
export const DEFAULT_PANEL_HEIGHT = 400;
export const DEFAULT_HAND_CARD_WIDTH = 120; // Base width for cards in hand panel modals

export const INITIAL_VIEWPORT: Coordinates = { x: 0, y: 0 };
export const INITIAL_ZOOM = 1;

// Definitions for card dimensions based on shape
export const CARD_SHAPE_DIMS: Record<CardShape, { width: number; height: number }> = {
  [CardShape.POKER]: { width: 120, height: 168 },
  [CardShape.BRIDGE]: { width: 112, height: 168 },
  [CardShape.MINI_US]: { width: 84, height: 128 },
  [CardShape.MINI_EURO]: { width: 88, height: 136 },
  [CardShape.SQUARE]: { width: 128, height: 128 },
  // Hexagon Ratio: width = height * (sqrt(3)/2) approx 0.866
  // 144 * 0.866 = 124.7 -> 125
  [CardShape.HEX]: { width: 125, height: 144 },
  [CardShape.CIRCLE]: { width: 128, height: 128 },
  [CardShape.TRIANGLE]: { width: 128, height: 128 },
};
