import { TableObject, Player, PlayerPermissions, ContextAction, CardLocation, Card, Deck, Token, DiceRoll, PanelType, WindowType, DrawingData, Stroke, DrawingLayer, CardOrientation, AppLanguage } from '../types';
import { GameState, ViewTransform } from './gameState';

// Base action type with optional local-only flag
type BaseAction<T extends string, P = any> = {
  type: T;
  payload: P;
  _localOnly?: boolean; // If true, action is NOT sent over network (guest only)
  _excludeFromHistory?: boolean; // If true, action is NOT added to undo history
};

// Actions without payload
type ActionWithoutPayload<T extends string> = {
  type: T;
  _localOnly?: boolean;
  _excludeFromHistory?: boolean;
};

export type Action =
  | BaseAction<'ADD_OBJECT', TableObject>
  | BaseAction<'UPDATE_OBJECT', (Partial<TableObject> & { id: string }) | { id: string; updates: Partial<TableObject> }>
  | BaseAction<'MOVE_OBJECT', { id: string; x: number; y: number }>
  | BaseAction<'MOVE_OBJECT_COMMIT', { id: string; x: number; y: number; previousX: number; previousY: number }> // Sent on drag end
  | BaseAction<'DELETE_OBJECT', { id: string }>
  | BaseAction<'DRAW_CARD', { deckId: string; playerId: string }>
  | BaseAction<'PLAY_CARD', { cardId: string; x: number; y: number }>
  | BaseAction<'PLAY_TOP_CARD', { deckId: string }>
  | BaseAction<'DROP_FROM_CURSOR_SLOT', { objectId: string; x: number; y: number; zIndex?: number }>
  | BaseAction<'SHUFFLE_DECK', { deckId: string }>
  | BaseAction<'FLIP_CARD', { cardId: string }>
  | BaseAction<'ROLL_DICE_LOG', { value: number; playerName: string }>
  | BaseAction<'ROLL_PHYSICAL_DICE', { id: string; rollGroup?: boolean }>
  | BaseAction<'EXPLOSIVE_DICE_SECOND_ROLL', { id: string; explosiveRoll: number }>
  | BaseAction<'UPDATE_COUNTER', { id: string; delta: number }>
  | BaseAction<'SWITCH_ROLE', { playerId: string }>
  | BaseAction<'TOGGLE_LOCK', { id: string }>
  | BaseAction<'TOGGLE_ON_TABLE', { id: string }>
  | BaseAction<'ROTATE_OBJECT', { id: string; angle?: number }>
  | BaseAction<'SET_ROTATION', { id: string; rotation: number }>
  | BaseAction<'CLONE_OBJECT', { id: string }>
  | BaseAction<'RETURN_TO_DECK', { cardId: string }>
  | BaseAction<'ADD_CARD_TO_TOP_OF_DECK', { cardId: string; deckId: string }>
  | BaseAction<'ADD_CARD_TO_PILE', { cardId: string; pileId: string; deckId: string }>
  | BaseAction<'DRAW_FROM_PILE', { pileId: string; deckId: string; playerId: string }>
  | BaseAction<'RETURN_ALL_CARDS_TO_DECK', { deckId: string; fromPile?: boolean; pileId?: string; exceptHands?: boolean; shuffleAfter?: boolean }>
  | BaseAction<'RETURN_CARD_TO_DECK_TOP', { cardId: string; deckId: string }>
  | BaseAction<'RETURN_CARD_TO_DECK_BOTTOM', { cardId: string; deckId: string }>
  | BaseAction<'TOGGLE_PILE_LOCK', { deckId: string; pileId: string }>
  | BaseAction<'UPDATE_PILE_POSITION', { deckId: string; pileId: string; x: number; y: number }>
  | BaseAction<'UPDATE_PERMISSIONS', { id: string; actions: ContextAction[] }>
  | BaseAction<'UPDATE_ACTION_BUTTONS', { id: string; actions: ContextAction[] }>
  | BaseAction<'MOVE_LAYER_UP', { id: string }>
  | BaseAction<'MOVE_LAYER_DOWN', { id: string }>
  | BaseAction<'BRING_TO_FRONT', { id: string }>
  | BaseAction<'SEND_TO_BACK', { id: string }>
  | BaseAction<'LOAD_GAME', GameState>
  | BaseAction<'ADD_PLAYER', Player>
  | BaseAction<'REMOVE_PLAYER', { id: string }>
  | BaseAction<'UPDATE_PLAYER', { id: string; [key: string]: any }>
  | BaseAction<'UPDATE_PLAYER_NAME', { playerId: string; name: string }>
  | BaseAction<'UPDATE_PLAYER_PERMISSIONS', PlayerPermissions>
  | BaseAction<'UPDATE_LANGUAGE', AppLanguage>
  | BaseAction<'SET_ACTIVE_ID', string>
  | BaseAction<'SYNC_STATE', GameState> // Network sync
  | BaseAction<'RESTORE_IMAGES', Record<string, string>> // Restore images from cache (guest)
  | BaseAction<'UPDATE_VIEW_TRANSFORM', ViewTransform>
  | BaseAction<'SET_PIXELS_PER_VU', { pixelsPerVU: number }>
  | BaseAction<'UPDATE_HAND_CARD_ORDER', { playerId: string; cardOrder: string[] }>
  | BaseAction<'UPDATE_DECK_CARD_DIMENSIONS', { deckId: string; cardWidth?: number; cardHeight?: number }>
  | BaseAction<'MILL_CARD_TO_BOTTOM', { cardId: string; deckId: string }>
  | BaseAction<'MILL_CARD_TO_PILE', { cardId: string; deckId: string; pileId: string }>
  | BaseAction<'TOGGLE_SHOW_TOP_CARD', { deckId: string; pileId?: string }>
  | BaseAction<'SWING_CLOCKWISE', { id: string }>
  | BaseAction<'SWING_COUNTER_CLOCKWISE', { id: string }>
  | BaseAction<'PIN_TO_VIEWPORT', { id: string; screenX: number; screenY: number; pixelWidth?: number; pixelHeight?: number }>
  | BaseAction<'UNPIN_FROM_VIEWPORT', { id: string; worldX: number; worldY: number }>
  // UI Object actions
  | BaseAction<'CREATE_PANEL', { panelType: PanelType; x?: number; y?: number; width?: number; height?: number; title?: string; deckId?: string }>
  | BaseAction<'CREATE_WINDOW', { windowType: WindowType; x?: number; y?: number; title?: string; targetObjectId?: string; targetLayerId?: string }>
  | BaseAction<'CLOSE_UI_OBJECT', { id: string }>
  | BaseAction<'TOGGLE_MINIMIZE', { id: string }>
  | BaseAction<'RESIZE_UI_OBJECT', { id: string; width: number; height: number }>
  // Token Archetype actions
  | BaseAction<'SPAWN_TOKEN_FROM_ARCHETYPE', { archetypeId: string; x: number; y: number }>
  // Drawing actions
  | BaseAction<'CREATE_DRAWING_OBJECT', { strokes: Stroke[]; x: number; y: number; width: number; height: number; name?: string; opacity?: number }>
  | BaseAction<'ADD_STROKE_TO_DRAWING', { drawingId: string; stroke: Stroke }>
  | BaseAction<'FINISH_DRAWING_STROKE', { drawingId?: string; stroke: Stroke; bounds: { x: number; y: number; width: number; height: number }; opacity?: number }> // Sent on stroke end
  | BaseAction<'MERGE_DRAWINGS', { sourceId: string; targetId: string }>
  | BaseAction<'ADD_STROKE', { stroke: Stroke; layerId: string }>
  | BaseAction<'DELETE_STROKE', { strokeId: string; layerId: string }>
  | BaseAction<'CREATE_DRAWING_LAYER', Omit<DrawingLayer, 'id'>>
  | BaseAction<'DELETE_DRAWING_LAYER', { layerId: string }>
  | BaseAction<'UPDATE_DRAWING_LAYER', { layerId: string; updates: Partial<DrawingLayer> }>
  | BaseAction<'CLEAR_DRAWING_LAYER', { layerId: string }>
  // Hyperscale layer actions
  | BaseAction<'ADD_HYPERSCALE_LAYER', Omit<import('../types').HyperscaleLayer, 'id'>>
  | BaseAction<'UPDATE_HYPERSCALE_LAYER', { layerId: string; updates: Partial<import('../types').HyperscaleLayer> }>
  | BaseAction<'DELETE_HYPERSCALE_LAYER', { layerId: string }>
  | BaseAction<'SET_HYPERSCALE_LAYERS', { layerIds: string[] }> // Set selected hyperscale layers
  // Dice group actions
  | BaseAction<'ADD_DICE_GROUP', { group: import('../types').DiceGroup }>
  | BaseAction<'UPDATE_DICE_GROUP', { groupId: string; updates: Partial<import('../types').DiceGroup> }>
  | BaseAction<'DELETE_DICE_GROUP', { groupId: string }>
  | BaseAction<'MOVE_DICE_TO_GROUP', { diceId: string; groupId: string | null }>
  // Connection lock actions
  | ActionWithoutPayload<'TOGGLE_CONNECTIONS_LOCKED'>
  | BaseAction<'MOVE_OBJECT_TO_HYPERSCALE_LAYER', { objectId: string; layerId: string }>
  // Effect Template actions
  | BaseAction<'SET_PIVOT_POINT', { objectId: string; pivot: { x: number; y: number } }>
  | ActionWithoutPayload<'TOGGLE_PIVOT_EDITING'>
  | BaseAction<'SET_HITBOX_POLYGON', { objectId: string; hitboxPolygon: Array<{ x: number; y: number }> }>
  // Player panel settings actions
  | BaseAction<'UPDATE_PLAYER_PANEL_SETTINGS', { playerId: string; panelId: string; settings: any }>
  | BaseAction<'APPLY_PLAYER_PANEL_SETTINGS', { settings: Record<string, any> }> // Apply individual settings to panels
  | BaseAction<'APPLY_SAVED_PANEL_SETTINGS', { playerPanelSettings: Record<string, any> }> // Apply saved settings from file
  | BaseAction<'REQUEST_PLAYER_PANEL_SETTINGS', { playerId: string }> // Guest requests their panel settings from host
  // Undo actions
  | ActionWithoutPayload<'UNDO_MARKER'>
  | ActionWithoutPayload<'UNDO_GENERAL'>
  // Local storage actions
  | ActionWithoutPayload<'CLEAR_SAVED_STATE'>
  // Audit log actions
  | BaseAction<'ADD_AUDIT_LOG_ENTRY', any>;  // AuditLogEntry (to avoid circular dependency)
