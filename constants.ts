
import { Coordinates, CardShape } from './types';

export const CARD_WIDTH = 150;
export const CARD_HEIGHT = 210;
export const TOKEN_SIZE = 80;
export const DECK_OFFSET = 3;

// UI Panel dimensions
export const MAIN_MENU_WIDTH = 310; 
export const SCROLLBAR_WIDTH = 16;

// Default object dimensions
export const DEFAULT_DECK_WIDTH = 100;
export const DEFAULT_DECK_HEIGHT = 140;
export const DEFAULT_DICE_SIZE = 60;
export const DEFAULT_COUNTER_WIDTH = 120;
export const DEFAULT_COUNTER_HEIGHT = 50;
export const DEFAULT_PANEL_WIDTH = 300;
export const DEFAULT_PANEL_HEIGHT = 400;
export const DEFAULT_HAND_CARD_WIDTH = 140; // Base width for cards in hand panel modals

export const INITIAL_VIEWPORT: Coordinates = { x: 0, y: 0 };
export const INITIAL_ZOOM = 0.8;

// Definitions for card dimensions based on shape
export const CARD_SHAPE_DIMS: Record<CardShape, { width: number; height: number }> = {
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
