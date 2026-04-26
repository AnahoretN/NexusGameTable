
import { Coordinates, CardShape } from './types';

// Virtual Units (vu) - Game world size independent of screen pixels
export const WORLD_SIZE_VU = 10000; // Game world is 10000×10000 vu (total space)
export const PLAYABLE_AREA_SIZE = 5000; // Playable area for players/GM is 5000×5000 vu (top-left corner)
export const POOL_PANEL_SIZE = 1000; // Each pool panel reserves 1000×1000 vu territory

// Object dimensions in virtual units (vu)
// 1 vu = 0.1% of screen height, so objects scale with screen size
export const CARD_WIDTH = 120; // vu
export const CARD_HEIGHT = 168; // vu
export const TOKEN_SIZE = 80; // vu
export const DECK_OFFSET = 3; // vu

// UI Panel dimensions (pixels - not scaled, for interface elements)
export const MAIN_MENU_WIDTH = 306; // px (reduced by 2% from 313)
export const SCROLLBAR_WIDTH = 15; // px

// Default object dimensions in virtual units (vu)
export const DEFAULT_DECK_WIDTH = 120; // vu
export const DEFAULT_DECK_HEIGHT = 168; // vu
export const DEFAULT_DICE_SIZE = 60; // vu
export const DEFAULT_COUNTER_WIDTH = 120; // vu
export const DEFAULT_COUNTER_HEIGHT = 50; // vu
export const DEFAULT_PANEL_WIDTH = 450; // vu
export const DEFAULT_PANEL_HEIGHT = 400; // vu
export const DEFAULT_HAND_CARD_WIDTH = 120; // vu - Base width for cards in hand panel modals

// Modal dimensions in virtual units (vu)
export const DEFAULT_MODAL_WIDTH_VU = 1180; // vu
export const DEFAULT_MODAL_MIN_WIDTH_VU = 800; // vu
export const DEFAULT_MODAL_MAX_WIDTH_VU = 1600; // vu
export const DEFAULT_MODAL_HEIGHT_VU = 800; // vu

export const INITIAL_VIEWPORT: Coordinates = { x: 0, y: 0 };
export const INITIAL_ZOOM = 1;

// Card dimensions based on shape (all values in virtual units - vu)
export const CARD_SHAPE_DIMS: Record<CardShape, { width: number; height: number }> = {
  [CardShape.POKER]: { width: 120, height: 168 },
  [CardShape.BRIDGE]: { width: 112, height: 168 },
  [CardShape.MINI_US]: { width: 84, height: 128 },
  [CardShape.MINI_EURO]: { width: 88, height: 136 },
  [CardShape.SQUARE]: { width: 128, height: 128 },
  // Hexagon Ratio: width = height * (sqrt(3)/2) approx 0.866
  // 144 * 0.866 = 124.7 -> 125
  [CardShape.HEX]: { width: 125, height: 144 },
  // HEX_HORIZONTAL is flat-top (rotated 90° from HEX)
  [CardShape.HEX_HORIZONTAL]: { width: 144, height: 125 },
  [CardShape.CIRCLE]: { width: 128, height: 128 },
  [CardShape.TRIANGLE]: { width: 128, height: 128 },
};
