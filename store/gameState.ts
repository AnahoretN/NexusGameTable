import { TableObject, Player, PlayerPermissions, DiceRoll, DrawingData, UndoState, AppLanguage } from '../types';
import { GM_COLOR, getSessionId } from './gameConstants';

export interface ViewTransform {
  offset: { x: number; y: number };
  zoom: number;
  scroll: { x: number; y: number };
}

export interface GameState {
  objects: Record<string, TableObject>;
  players: Player[];
  activePlayerId: string; // The user's current identity
  diceRolls: DiceRoll[];
  viewTransform: ViewTransform;
  sessionId?: string; // Unique session identifier
  drawings: DrawingData; // Drawing layers for board and objects
  undo: UndoState; // Undo/redo history
  playerPermissions: PlayerPermissions; // Permissions for non-GM players
  language: AppLanguage; // Application language
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
  viewTransform: { offset: { x: 0, y: 0 }, zoom: 1, scroll: { x: 0, y: 0 } },
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
  // Load language from localStorage or default to 'en'
  language: (typeof localStorage !== 'undefined' && (localStorage.getItem('app-language') as AppLanguage)) || 'en',
};
