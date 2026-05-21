/**
 * Context Types - Shared types for all modular contexts
 * Extracted from gameState.ts for better separation of concerns
 */

import { Player, PlayerPermissions, AppLanguage, HyperscaleLayer } from '../../types';
import { PlayerPanelSettings } from '../gameState';
import { calculatePixelsPerVU } from '../../utils/vuSystem';

// ============================================================================
// PLAYER CONTEXT TYPES
// ============================================================================

export interface PlayerState {
  players: Player[];
  activePlayerId: string;
  playerPermissions: PlayerPermissions;
}

export interface PlayerContextValue extends PlayerState {
  // Actions
  addPlayer: (player: Player) => void;
  updatePlayer: (id: string, updates: Partial<Player>) => void;
  removePlayer: (id: string) => void;
  setActivePlayer: (id: string) => void;
  updatePermissions: (permissions: Partial<PlayerPermissions>) => void;

  // Getters
  getActivePlayer: () => Player | undefined;
  isGM: () => boolean;
  getPlayerById: (id: string) => Player | undefined;
  getPlayersByColor: (color: string) => Player[];
}

export type PlayerAction =
  | { type: 'ADD_PLAYER'; payload: Player }
  | { type: 'UPDATE_PLAYER'; payload: { id: string; updates: Partial<Player> } }
  | { type: 'REMOVE_PLAYER'; payload: string }
  | { type: 'SET_ACTIVE_PLAYER'; payload: string }
  | { type: 'UPDATE_PERMISSIONS'; payload: Partial<PlayerPermissions> };

// ============================================================================
// VIEW TRANSFORM CONTEXT TYPES
// ============================================================================

export interface ViewTransform {
  offset: { x: number; y: number };
  zoom: number;
  scroll: { x: number; y: number };
  pixelsPerVU: number; // Conversion factor from virtual units to pixels
}

export interface ViewTransformState {
  viewTransform: ViewTransform;
}

export interface ViewTransformContextValue extends ViewTransformState {
  // Actions
  setOffset: (x: number, y: number) => void;
  setZoom: (zoom: number) => void;
  setScroll: (x: number, y: number) => void;
  setPixelsPerVU: (pixelsPerVU: number) => void;
  updateTransform: (updates: Partial<ViewTransform>) => void;
  resetTransform: () => void;

  // Utilities
  viewportToWorld: (vx: number, vy: number) => { x: number; y: number };
  worldToViewport: (wx: number, wy: number) => { x: number; y: number };
}

export type ViewTransformAction =
  | { type: 'SET_OFFSET'; payload: { x: number; y: number } }
  | { type: 'SET_ZOOM'; payload: number }
  | { type: 'SET_SCROLL'; payload: { x: number; y: number } }
  | { type: 'SET_PIXELS_PER_VU'; payload: number }
  | { type: 'UPDATE_TRANSFORM'; payload: Partial<ViewTransform> }
  | { type: 'RESET_TRANSFORM' };

// ============================================================================
// UI CONTEXT TYPES
// ============================================================================

export interface UIState {
  language: AppLanguage;
  playerPanelSettings: PlayerPanelSettings;
  hyperscaleLayers: HyperscaleLayer[];
  selectedHyperscaleLayerIds: string[];
  // Track if any settings modal is open (to block context menus)
  settingsModalOpen: boolean;
}

export interface UIContextValue extends UIState {
  // Language
  setLanguage: (language: AppLanguage) => void;

  // Panel settings
  updatePanelSettings: (playerId: string, panelId: string, settings: any) => void;
  removePanelSettings: (playerId: string, panelId: string) => void;

  // Hyperscale layers
  addHyperscaleLayer: (layer: HyperscaleLayer) => void;
  updateHyperscaleLayer: (layerId: string, updates: Partial<HyperscaleLayer>) => void;
  removeHyperscaleLayer: (layerId: string) => void;

  // Selected layers
  toggleLayerSelection: (layerId: string) => void;
  setLayerSelection: (layerIds: string[]) => void;
  selectAllLayers: () => void;
  deselectAllLayers: () => void;

  // Getters
  getSelectedLayers: () => HyperscaleLayer[];
  getPanelSettings: (playerId: string, panelId: string) => any;

  // Settings modal state
  openSettingsModal: () => void;
  closeSettingsModal: () => void;
}

export type UIAction =
  | { type: 'SET_LANGUAGE'; payload: AppLanguage }
  | { type: 'UPDATE_PANEL_SETTINGS'; payload: { playerId: string; panelId: string; settings: any } }
  | { type: 'REMOVE_PANEL_SETTINGS'; payload: { playerId: string; panelId: string } }
  | { type: 'ADD_HYPERSCALE_LAYER'; payload: HyperscaleLayer }
  | { type: 'UPDATE_HYPERSCALE_LAYER'; payload: { layerId: string; updates: Partial<HyperscaleLayer> } }
  | { type: 'REMOVE_HYPERSCALE_LAYER'; payload: string }
  | { type: 'TOGGLE_LAYER_SELECTION'; payload: string }
  | { type: 'SET_LAYER_SELECTION'; payload: string[] }
  | { type: 'SELECT_ALL_LAYERS' }
  | { type: 'DESELECT_ALL_LAYERS' }
  | { type: 'OPEN_SETTINGS_MODAL' }
  | { type: 'CLOSE_SETTINGS_MODAL' };

// ============================================================================
// SHARED UTILITIES
// ============================================================================

/**
 * Initial player state for PlayerContext
 */
export const initialPlayerState: PlayerState = {
  players: [
    { id: 'gm', name: 'Game Master', color: '#FF0000', isGM: true },
  ],
  activePlayerId: 'gm',
  playerPermissions: {
    createObjects: false,
    configureObjects: false,
    deleteObjects: false,
    hideObjects: false,
  },
};

/**
 * Initial UI state for UIContext
 */
export const initialUIState: UIState = {
  language: (typeof localStorage !== 'undefined'
    ? (localStorage.getItem('app-language') as AppLanguage)
    : 'en') || 'en',
  playerPanelSettings: {},
  hyperscaleLayers: [
    {
      id: 'boards',
      name: 'Game Boards',
      minZIndex: 1,
      maxZIndex: 1000,
      color: '#3b82f6',
      playerCanSelect: true,
      playerCanView: true,
      individualObjects: false,
      zoomEnabled: true,
      order: 0,
    },
    {
      id: 'cards',
      name: 'Cards',
      minZIndex: 1001,
      maxZIndex: 3000,
      color: '#f59e0b',
      playerCanSelect: true,
      playerCanView: true,
      individualObjects: false,
      zoomEnabled: true,
      order: 1,
    },
    {
      id: 'tokens',
      name: 'Tokens',
      minZIndex: 3001,
      maxZIndex: 6000,
      color: '#10b981',
      playerCanSelect: true,
      playerCanView: true,
      individualObjects: false,
      zoomEnabled: true,
      order: 2,
    },
    {
      id: 'drawings',
      name: 'Drawings',
      minZIndex: 6001,
      maxZIndex: 7000,
      color: '#ec4899',
      playerCanSelect: true,
      playerCanView: true,
      individualObjects: false,
      zoomEnabled: true,
      order: 3,
    },
    {
      id: 'interface',
      name: 'Interface',
      minZIndex: 9001,
      maxZIndex: 10000,
      color: '#8b5cf6',
      playerCanSelect: true,
      playerCanView: false,
      individualObjects: true,
      zoomEnabled: false,
      order: 4,
    },
  ],
  selectedHyperscaleLayerIds: ['boards', 'cards', 'tokens', 'drawings', 'interface'],
  settingsModalOpen: false,
};

/**
 * Helper to calculate initial pixels per VU
 */
export function getInitialPixelsPerVU(): number {
  if (typeof window !== 'undefined') {
    return calculatePixelsPerVU(window.innerWidth, window.innerHeight);
  }
  return 1.08;
}

/**
 * Initial view transform state for ViewTransformContext
 */
export const initialViewTransformState: ViewTransformState = {
  viewTransform: {
    offset: { x: 0, y: 0 },
    zoom: 1,
    scroll: { x: 0, y: 0 },
    pixelsPerVU: getInitialPixelsPerVU(),
  },
};
