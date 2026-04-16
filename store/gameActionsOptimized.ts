/**
 * GameActions v2.0 - Optimized actions without duplicated field actions
 *
 * @version 2.0.0
 * @since 2026-04-17
 *
 * ИЗМЕНЕНИЯ с v1.0:
 * ✅ Убраны actions для дублирующихся полей (перенесены в контексты):
 *
 * УДАЛЕННЫЕ actions (перенесены в контексты):
 * ❌ ADD_PLAYER → PlayerContext.addPlayer()
 * ❌ UPDATE_PLAYER → PlayerContext.updatePlayer()
 * ❌ REMOVE_PLAYER → PlayerContext.removePlayer()
 * ❌ SET_ACTIVE_ID → PlayerContext.setActivePlayer()
 * ❌ UPDATE_PLAYER_PERMISSIONS → PlayerContext.updatePermissions()
 * ❌ UPDATE_VIEW_TRANSFORM → ViewTransformContext.updateTransform()
 * ❌ SET_PIXELS_PER_VU → ViewTransformContext.setPixelsPerVU()
 * ❌ SET_LANGUAGE → UIContext.setLanguage()
 * ❌ UPDATE_HYPERSCALE_LAYERS → UIContext.updateHyperscaleLayer()
 * ❌ ADD_HYPERSCALE_LAYER → UIContext.addHyperscaleLayer()
 * ❌ UPDATE_HYPERSCALE_LAYER → UIContext.updateHyperscaleLayer()
 * ❌ REMOVE_HYPERSCALE_LAYER → UIContext.removeHyperscaleLayer()
 * ❌ TOGGLE_LAYER_SELECTION → UIContext.toggleLayerSelection()
 * ❌ SET_LAYER_SELECTION → UIContext.setLayerSelection()
 * ❌ SELECT_ALL_LAYERS → UIContext.selectAllLayers()
 * ❌ DESELECT_ALL_LAYERS → UIContext.deselectAllLayers()
 *
 * ✅ Оставлены только actions для игровых объектов:
 * - Object manipulation (create, update, delete, move)
 * - Game mechanics (dice, drawings, undo)
 * - Session management
 */

import { TableObject, CardLocation, Card, DiceRoll, DiceObject, DrawingLayer, Drawing, UndoState, DiceGroup, HyperscaleLayer, NexusBoard, BattlefieldCell, Board, NexusCellObject, PanelTab, PoolPanelData, TableauPanelData } from '../types';
import { ItemType } from '../types';
import { GameState } from './gameStateOptimized.v2';

// ============================================================================
// ACTION TYPE
// ============================================================================

export type Action =
  // Object manipulation
  | { type: 'SET_OBJECTS'; payload: Record<string, TableObject> }
  | { type: 'SET_OBJECT'; payload: { id: string; object: TableObject } }
  | { type: 'UPDATE_OBJECT'; payload: { id: string; updates: Partial<TableObject> } }
  | { type: 'DELETE_OBJECT'; payload: string }
  | { type: 'DELETE_MULTIPLE_OBJECTS'; payload: string[] }
  | { type: 'MOVE_OBJECT'; payload: { id: string; x: number; y: number } }
  | { type: 'MOVE_MULTIPLE_OBJECTS'; payload: Array<{ id: string; x: number; y: number }> }

  // Card operations
  | { type: 'DRAW_CARD'; payload: { deckId: string; playerId?: string; faceUp?: boolean } }
  | { type: 'RETURN_CARD_TO_DECK'; payload: { cardId: string; deckId: string; position?: 'top' | 'bottom' | 'shuffle' } }
  | { type: 'SHUFFLE_DECK'; payload: string }
  | { type: 'SORT_DECK'; payload: string }

  // Dice operations
  | { type: 'ROLL_DICE'; payload: DiceRoll }
  | { type: 'CLEAR_DICE_ROLLS' }
  | { type: 'CREATE_DICE_GROUP'; payload: DiceGroup }
  | { type: 'UPDATE_DICE_GROUP'; payload: { groupId: string; updates: Partial<DiceGroup> } }
  | { type: 'DELETE_DICE_GROUP'; payload: string }

  // Drawing operations
  | { type: 'ADD_DRAWING_LAYER'; payload: DrawingLayer }
  | { type: 'UPDATE_DRAWING_LAYER'; payload: { layerId: string; updates: Partial<DrawingLayer> } }
  | { type: 'REMOVE_DRAWING_LAYER'; payload: string }
  | { type: 'ADD_DRAWING'; payload: { layerId: string; drawing: Drawing } }
  | { type: 'UPDATE_DRAWING'; payload: { layerId: string; drawingId: string; updates: Partial<Drawing> } }
  | { type: 'REMOVE_DRAWING'; payload: { layerId: string; drawingId: string } }
  | { type: 'CLEAR_DRAWINGS'; payload: string } // layerId

  // Undo/Redo
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'SAVE_STATE'; payload: any } // для undo history

  // Game state
  | { type: 'SET_CONNECTIONS_LOCKED'; payload: boolean }

  // Nexus Board operations
  | { type: 'SET_NEXUS_BOARD_EDITING_ID'; payload: string | null }
  | { type: 'UPDATE_NEXUS_CELL'; payload: { boardId: string; cellId: string; updates: Partial<NexusCellObject> } }

  // Panel operations
  | { type: 'SET_PANEL_TAB'; payload: { panelId: string; tabId: string } }
  | { type: 'UPDATE_POOL_PANEL_DATA'; payload: { panelId: string; data: Partial<PoolPanelData> } }
  | { type: 'UPDATE_TABLEAU_PANEL_DATA'; payload: { panelId: string; data: Partial<TableauPanelData> } }

  // Session management (WebRTC)
  | { type: 'SYNC_STATE'; payload: Partial<GameState> } // Полная синхронизация
  | { type: 'RESTORE_IMAGES'; payload: Record<string, string> } // Восстановление изображений

  // Load/Save
  | { type: 'LOAD_GAME'; payload: any }
  | { type: 'NEW_GAME' }
  | { type: 'SAVE_GAME' };

// ============================================================================
// ACTION CREATORS
// ============================================================================

/**
 * Action creators для удобного использования
 */
export const actionCreators = {
  // Object manipulation
  setObjects: (objects: Record<string, TableObject>): Action => ({
    type: 'SET_OBJECTS',
    payload: objects
  }),

  setObject: (id: string, object: TableObject): Action => ({
    type: 'SET_OBJECT',
    payload: { id, object }
  }),

  updateObject: (id: string, updates: Partial<TableObject>): Action => ({
    type: 'UPDATE_OBJECT',
    payload: { id, updates }
  }),

  deleteObject: (id: string): Action => ({
    type: 'DELETE_OBJECT',
    payload: id
  }),

  deleteMultipleObjects: (ids: string[]): Action => ({
    type: 'DELETE_MULTIPLE_OBJECTS',
    payload: ids
  }),

  moveObject: (id: string, x: number, y: number): Action => ({
    type: 'MOVE_OBJECT',
    payload: { id, x, y }
  }),

  moveMultipleObjects: (movements: Array<{ id: string; x: number; y: number }>): Action => ({
    type: 'MOVE_MULTIPLE_OBJECTS',
    payload: movements
  }),

  // Card operations
  drawCard: (deckId: string, playerId?: string, faceUp?: boolean): Action => ({
    type: 'DRAW_CARD',
    payload: { deckId, playerId, faceUp }
  }),

  returnCardToDeck: (cardId: string, deckId: string, position?: 'top' | 'bottom' | 'shuffle'): Action => ({
    type: 'RETURN_CARD_TO_DECK',
    payload: { cardId, deckId, position }
  }),

  shuffleDeck: (deckId: string): Action => ({
    type: 'SHUFFLE_DECK',
    payload: deckId
  }),

  sortDeck: (deckId: string): Action => ({
    type: 'SORT_DECK',
    payload: deckId
  }),

  // Dice operations
  rollDice: (diceRoll: DiceRoll): Action => ({
    type: 'ROLL_DICE',
    payload: diceRoll
  }),

  clearDiceRolls: (): Action => ({
    type: 'CLEAR_DICE_ROLLS'
  }),

  createDiceGroup: (diceGroup: DiceGroup): Action => ({
    type: 'CREATE_DICE_GROUP',
    payload: diceGroup
  }),

  updateDiceGroup: (groupId: string, updates: Partial<DiceGroup>): Action => ({
    type: 'UPDATE_DICE_GROUP',
    payload: { groupId, updates }
  }),

  deleteDiceGroup: (groupId: string): Action => ({
    type: 'DELETE_DICE_GROUP',
    payload: groupId
  }),

  // Drawing operations
  addDrawingLayer: (layer: DrawingLayer): Action => ({
    type: 'ADD_DRAWING_LAYER',
    payload: layer
  }),

  updateDrawingLayer: (layerId: string, updates: Partial<DrawingLayer>): Action => ({
    type: 'UPDATE_DRAWING_LAYER',
    payload: { layerId, updates }
  }),

  removeDrawingLayer: (layerId: string): Action => ({
    type: 'REMOVE_DRAWING_LAYER',
    payload: layerId
  }),

  addDrawing: (layerId: string, drawing: Drawing): Action => ({
    type: 'ADD_DRAWING',
    payload: { layerId, drawing }
  }),

  updateDrawing: (layerId: string, drawingId: string, updates: Partial<Drawing>): Action => ({
    type: 'UPDATE_DRAWING',
    payload: { layerId, drawingId, updates }
  }),

  removeDrawing: (layerId: string, drawingId: string): Action => ({
    type: 'REMOVE_DRAWING',
    payload: { layerId, drawingId }
  }),

  clearDrawings: (layerId: string): Action => ({
    type: 'CLEAR_DRAWINGS',
    payload: layerId
  }),

  // Undo/Redo
  undo: (): Action => ({
    type: 'UNDO'
  }),

  redo: (): Action => ({
    type: 'REDO'
  }),

  saveState: (state: any): Action => ({
    type: 'SAVE_STATE',
    payload: state
  }),

  // Game state
  setConnectionsLocked: (locked: boolean): Action => ({
    type: 'SET_CONNECTIONS_LOCKED',
    payload: locked
  }),

  // Nexus Board operations
  setNexusBoardEditingId: (boardId: string | null): Action => ({
    type: 'SET_NEXUS_BOARD_EDITING_ID',
    payload: boardId
  }),

  updateNexusCell: (boardId: string, cellId: string, updates: Partial<NexusCellObject>): Action => ({
    type: 'UPDATE_NEXUS_CELL',
    payload: { boardId, cellId, updates }
  }),

  // Panel operations
  setPanelTab: (panelId: string, tabId: string): Action => ({
    type: 'SET_PANEL_TAB',
    payload: { panelId, tabId }
  }),

  updatePoolPanelData: (panelId: string, data: Partial<PoolPanelData>): Action => ({
    type: 'UPDATE_POOL_PANEL_DATA',
    payload: { panelId, data }
  }),

  updateTableauPanelData: (panelId: string, data: Partial<TableauPanelData>): Action => ({
    type: 'UPDATE_TABLEAU_PANEL_DATA',
    payload: { panelId, data }
  }),

  // Session management (WebRTC)
  syncState: (state: Partial<GameState>): Action => ({
    type: 'SYNC_STATE',
    payload: state
  }),

  restoreImages: (images: Record<string, string>): Action => ({
    type: 'RESTORE_IMAGES',
    payload: images
  }),

  // Load/Save
  loadGame: (data: any): Action => ({
    type: 'LOAD_GAME',
    payload: data
  }),

  newGame: (): Action => ({
    type: 'NEW_GAME'
  }),

  saveGame: (): Action => ({
    type: 'SAVE_GAME'
  }),
};

// ============================================================================
// EXPORTS
// ============================================================================

export default Action;