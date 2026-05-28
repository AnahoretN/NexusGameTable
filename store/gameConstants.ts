import { createStandardDeckWithCards } from '../utils/objectFactories';
import { Card, Deck, ItemType, CardLocation, CardShape, CardOrientation } from '../types';

// ============================================
// GAME CONSTANTS
// ============================================

/**
 * Color for GM players
 */
export const GM_COLOR = '#8e44ad';

/**
 * Deck & Card Constants
 */
export const DECK_CONSTANTS = {
  /** Offset in pixels for stacked cards in deck */
  OFFSET: 15,

  /** Factor for calculating stacking offset based on card count */
  STACKING_OFFSET_FACTOR: 0.05,

  /** Maximum number of action buttons per object */
  MAX_ACTION_BUTTONS: 4,

  /** Double click delay in milliseconds */
  DOUBLE_CLICK_DELAY: 300,
} as const;

/**
 * Drag & Drop Constants
 */
export const DRAG_CONSTANTS = {
  /** Minimum drag distance in pixels to trigger drag */
  THRESHOLD: 5,

  /** Maximum items allowed in cursor slot */
  MAX_CURSOR_SLOT_ITEMS: 100,

  /** Dice drag threshold to distinguish from click */
  DICE_DRAG_THRESHOLD: 5,
} as const;

/**
 * Pool Panel Constants
 */
export const POOL_PANEL_CONSTANTS = {
  /** Pool panel size in virtual units */
  SIZE: 1000,

  /** Default zoom level for pool panels */
  DEFAULT_ZOOM: 1.0,

  /** Minimum zoom level */
  MIN_ZOOM: 0.25,

  /** Maximum zoom level */
  MAX_ZOOM: 3.0,
} as const;

/**
 * Dice Animation Constants
 */
export const DICE_CONSTANTS = {
  /** Number of animation steps for dice roll */
  ANIMATION_STEPS: 10,

  /** Duration of dice roll animation in milliseconds */
  ANIMATION_DURATION: 1000,
} as const;

/**
 * UI Constants
 */
export const UI_CONSTANTS = {
  /** Default context menu width in pixels */
  CONTEXT_MENU_WIDTH: 200,

  /** Default context menu height in pixels */
  CONTEXT_MENU_HEIGHT: 400,

  /** Submenu offset from parent menu */
  SUBMENU_OFFSET: 5,

  /** Portal rendering delay for submenus in milliseconds */
  SUBMENU_PORTAL_DELAY: 10,
} as const;

/**
 * Generate or get session ID from localStorage
 */
export function getSessionId(): string {
  if (typeof window === 'undefined') return 'unknown';
  let sessionId = localStorage.getItem('nexus-session-id');
  if (!sessionId) {
    sessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('nexus-session-id', sessionId);
  }
  return sessionId;
}

/**
 * Get player's persistent ID from localStorage
 * This persists across page reloads to identify the same player
 */
export function getPlayerId(): string {
  if (typeof window === 'undefined') return 'unknown';
  let playerId = localStorage.getItem('nexus-player-id');
  if (!playerId) {
    playerId = 'player-' + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('nexus-player-id', playerId);
  }
  return playerId;
}

/**
 * Helper function to create a Standard Deck with 54 cards using sprite sheet
 * Delegates to objectFactories for unified implementation
 */
export function createStandardDeck(): { deck: Deck; cards: Card[] } {
  return createStandardDeckWithCards();
}
