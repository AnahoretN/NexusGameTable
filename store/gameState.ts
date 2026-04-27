import { TableObject, Player, PlayerPermissions, DiceRoll, DrawingData, UndoState, AppLanguage, HyperscaleLayer, DiceGroup, AuditLogState } from '../types';
import { GM_COLOR, getSessionId } from './gameConstants';
import { calculatePixelsPerVU } from '../utils/vuSystem';

export interface ViewTransform {
  offset: { x: number; y: number };
  zoom: number;
  scroll: { x: number; y: number };
  pixelsPerVU: number; // Conversion factor from virtual units to pixels
}

// Individual panel settings for each player
export interface PlayerPanelSettings {
  [playerId: string]: {
    [panelId: string]: {
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      minimized?: boolean;
      isPinnedToViewport?: boolean;
      pinnedScreenPosition?: { x: number; y: number };
      expandedState?: { x: number; y: number; width: number; height: number };
      collapsedState?: { x: number; y: number; width: number; height: number };
      expandedPinnedPosition?: { x: number; y: number };
      collapsedPinnedPosition?: { x: number; y: number };
    };
  };
}

export interface GameState {
  objects: Record<string, TableObject>;
  players: Player[];
  activePlayerId: string; // The user's current identity
  diceRolls: DiceRoll[];
  viewTransform: ViewTransform;
  sessionId?: string; // Unique session identifier
  version?: number; // Save file version for migration purposes
  drawings: DrawingData; // Drawing layers for board and objects
  undo: UndoState; // Undo/redo history
  playerPermissions: PlayerPermissions; // Permissions for non-GM players
  language: AppLanguage; // Application language
  hyperscaleLayers: HyperscaleLayer[]; // Hyperscale layers configuration
  selectedHyperscaleLayerIds: string[]; // IDs of hyperscale layers currently selected for manipulation
  connectionsLocked: boolean; // Whether new player connections are locked (host only)
  diceGroups: DiceGroup[]; // Dice groups for rolling multiple dice together
  lastModifiedBy?: string; // ID of player who last modified the game state
  playerPanelSettings: PlayerPanelSettings; // Individual panel settings for each player
  auditLog: AuditLogState; // Session audit log
  // Internal fields (not persisted)
  _lastPanelSettingsUpdate?: number; // Timestamp of last panel settings update
  _pendingPanelSettings?: PlayerPanelSettings; // Pending settings waiting for throttle timeout
}

/**
 * Initial game state
 */
export const initialState: GameState = {
  objects: {},
  players: [
    { id: 'gm', name: 'Game Master', color: GM_COLOR, isGM: true },
    { id: 'gm-player', name: 'GM Player', color: GM_COLOR, isGM: false },
  ],
  activePlayerId: 'gm',
  diceRolls: [],
  viewTransform: {
    offset: { x: 0, y: 0 },
    zoom: 1,
    scroll: { x: 0, y: 0 },
    pixelsPerVU: typeof window !== 'undefined' ? calculatePixelsPerVU(window.innerWidth, window.innerHeight) : 1.08
  },
  sessionId: getSessionId(),
  drawings: { layers: [] },
  undo: { markerHistory: [], generalHistory: [], maxMarkerHistory: 10, maxGeneralHistory: 100 },
  // Default permissions: only GM can create, configure, delete, hide objects
  playerPermissions: {
    createObjects: false,
    configureObjects: false,
    deleteObjects: false,
    hideObjects: false,
  },
  // Connections are unlocked by default
  connectionsLocked: false,
  // Dice groups - empty by default
  diceGroups: [],
  // Load language from localStorage or default to 'en'
  language: (typeof localStorage !== 'undefined' && (localStorage.getItem('app-language') as AppLanguage)) || 'en',
  // Track who last modified the game state (for auto-save timers)
  lastModifiedBy: 'gm',
  // Individual panel settings for each player (stored on host)
  playerPanelSettings: {},
  // Session audit log
  auditLog: {
    entries: [],
    maxEntries: 10000,
    currentReplayIndex: -1,
  },
  // Default hyperscale layers
  hyperscaleLayers: [
    {
      id: 'boards',
      name: 'Game Boards',
      minZIndex: 1,
      maxZIndex: 1000,
      color: '#3b82f6',
      playerCanSelect: true,
      playerCanView: true,
      individualPosition: false,
      individualObjects: false,
      zoomEnabled: true,
      order: 0
    },
    {
      id: 'cards',
      name: 'Cards',
      minZIndex: 1001,
      maxZIndex: 3000,
      color: '#f59e0b',
      playerCanSelect: true,
      playerCanView: true,
      individualPosition: false,
      individualObjects: false,
      zoomEnabled: true,
      order: 1
    },
    {
      id: 'tokens',
      name: 'Tokens',
      minZIndex: 3001,
      maxZIndex: 6000,
      color: '#10b981',
      playerCanSelect: true,
      playerCanView: true,
      individualPosition: false,
      individualObjects: false,
      zoomEnabled: true,
      order: 2
    },
    {
      id: 'drawings',
      name: 'Drawings',
      minZIndex: 6001,
      maxZIndex: 7000,
      color: '#ec4899',
      playerCanSelect: true,
      playerCanView: true,
      individualPosition: true,
      individualObjects: false,
      zoomEnabled: true,
      order: 3
    },
    {
      id: 'interface',
      name: 'Interface',
      minZIndex: 9001,
      maxZIndex: 10000,
      color: '#8b5cf6',
      playerCanSelect: true,
      playerCanView: false,
      individualPosition: true,
      individualObjects: true, // Each player has their own interface objects (panels, windows, etc.)
      zoomEnabled: false, // Interface layer NOT affected by zoom
      order: 4
    }
  ],
  // All layers selected by default
  selectedHyperscaleLayerIds: ['boards', 'cards', 'tokens', 'drawings', 'interface'],
};
