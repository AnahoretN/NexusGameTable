import React, { createContext, useContext, useReducer, useEffect, useState, useRef, useCallback } from 'react';
import { GameItem, Player, PlayerPermissions, ItemType, TableObject, CardLocation, Card, Deck, Token, TokenType, DiceRoll, ContextAction, DiceObject, Counter, TokenShape, CardShape, GridType, CardPile, PanelType, WindowType, PanelObject, WindowObject, Board, Randomizer, CardOrientation, DrawingData, Stroke, DrawingLayer, Drawing, UndoState, MarkerHistoryEntry, GeneralHistoryEntry, AppLanguage } from '../types';
import { CARD_WIDTH, CARD_HEIGHT, CARD_SHAPE_DIMS, MAIN_MENU_WIDTH, SCROLLBAR_WIDTH, DEFAULT_PANEL_WIDTH, DEFAULT_PANEL_HEIGHT, DEFAULT_DECK_WIDTH, DEFAULT_DECK_HEIGHT } from '../constants';
import { Peer } from 'peerjs';
import { PlayerNameModal } from '../components/PlayerNameModal';
import { generateUUID } from '../utils/uuid';
import { saveGameState, loadGameState, clearGameState as clearStorageGameState, hasSavedGameState, getSavedGameTimestamp, formatTimestamp } from '../utils/gameStorage';

// Helper function to create a Standard Deck with 54 cards
const createStandardDeck = (): { deck: Deck; cards: Card[] } => {
  const deckId = generateUUID();
  const cardIds: string[] = [];
  const cards: Card[] = [];
  const defaultShape = CardShape.POKER;
  const defaultDims = CARD_SHAPE_DIMS[defaultShape];

  for (let i = 0; i < 54; i++) {
    const cid = generateUUID();
    cardIds.push(cid);
    const card: Card = {
      id: cid,
      type: ItemType.CARD,
      x: 0, y: 0,
      width: defaultDims.width,
      height: defaultDims.height,
      rotation: 0,
      name: `Card ${i + 1}`,
      content: `https://picsum.photos/seed/${cid}/${defaultDims.width}/${defaultDims.height}`,
      location: CardLocation.DECK,
      faceUp: false,
      deckId: deckId,
      locked: false,
      isOnTable: true,
      shape: defaultShape
    };
    cards.push(card);
  }

  const deck: Deck = {
    id: deckId,
    type: ItemType.DECK,
    x: 0, y: 0, // Will be set by caller
    width: defaultDims.width,
    height: defaultDims.height,
    rotation: 0,
    name: 'Standard Deck',
    content: '',
    baseCardIds: [...cardIds], // Base list - starts same as cardIds
    cardIds,
    locked: false,
    isOnTable: true,
    allowedActions: ['draw', 'shuffleDeck', 'playTopCard', 'searchDeck', 'returnAll', 'rotateClockwise', 'rotateCounterClockwise', 'swingClockwise', 'swingCounterClockwise'],
    actionButtons: ['draw', 'playTopCard', 'shuffleDeck', 'searchDeck'],
    cardShape: defaultShape,
    cardOrientation: CardOrientation.VERTICAL,
    cardWidth: defaultDims.width,
    cardHeight: defaultDims.height,
    cardAllowedActions: ['flip', 'rotate', 'rotateClockwise', 'rotateCounterClockwise', 'swingClockwise', 'swingCounterClockwise', 'layer', 'layerUp', 'layerDown', 'moveTo', 'moveToHand', 'moveToTopDeck', 'moveToBottomDeck', 'moveToDiscard'],
    cardAllowedActionsForGM: ['flip', 'rotate', 'rotateClockwise', 'rotateCounterClockwise', 'swingClockwise', 'swingCounterClockwise', 'layer', 'layerUp', 'layerDown', 'delete', 'clone', 'lock', 'pin', 'moveTo', 'moveToHand', 'moveToTopDeck', 'moveToBottomDeck', 'moveToDiscard'],
    cardActionButtons: ['moveToHand', 'swingClockwise', 'flip'],
    cardSingleClickAction: undefined,
    cardDoubleClickAction: undefined,
    cardNamePosition: 'none' as const,
    initialCardCount: cardIds.length,
    piles: [
      {
        id: `${deckId}-discard`,
        name: 'Discard',
        deckId: deckId,
        position: 'right',
        cardIds: [],
        faceUp: false,
        visible: false,
        size: 1,
        isMillPile: true
      }
    ]
  };

  return { deck, cards };
};

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

type Action =
  | BaseAction<'ADD_OBJECT', TableObject>
  | BaseAction<'UPDATE_OBJECT', Partial<TableObject> & { id: string }>
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
  | BaseAction<'ROLL_PHYSICAL_DICE', { id: string }>
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
  | BaseAction<'RETURN_ALL_CARDS_TO_DECK', { deckId: string; fromPile?: boolean; pileId?: string }>
  | BaseAction<'RETURN_CARD_TO_DECK_TOP', { cardId: string; deckId: string }>
  | BaseAction<'RETURN_CARD_TO_DECK_BOTTOM', { cardId: string; deckId: string }>
  | BaseAction<'TOGGLE_PILE_LOCK', { deckId: string; pileId: string }>
  | BaseAction<'UPDATE_PILE_POSITION', { deckId: string; pileId: string; x: number; y: number }>
  | BaseAction<'UPDATE_PERMISSIONS', { id: string; actions: ContextAction[] }>
  | BaseAction<'UPDATE_ACTION_BUTTONS', { id: string; actions: ContextAction[] }>
  | BaseAction<'MOVE_LAYER_UP', { id: string }>
  | BaseAction<'MOVE_LAYER_DOWN', { id: string }>
  | BaseAction<'LOAD_GAME', GameState>
  | BaseAction<'ADD_PLAYER', Player>
  | BaseAction<'REMOVE_PLAYER', { id: string }>
  | BaseAction<'UPDATE_PLAYER_NAME', { playerId: string; name: string }>
  | BaseAction<'UPDATE_PLAYER_PERMISSIONS', PlayerPermissions>
  | BaseAction<'UPDATE_LANGUAGE', AppLanguage>
  | BaseAction<'SET_ACTIVE_ID', string>
  | BaseAction<'SYNC_STATE', GameState> // Network sync
  | BaseAction<'UPDATE_VIEW_TRANSFORM', ViewTransform>
  | BaseAction<'UPDATE_HAND_CARD_ORDER', { playerId: string; cardOrder: string[] }>
  | BaseAction<'UPDATE_DECK_CARD_DIMENSIONS', { deckId: string; cardWidth?: number; cardHeight?: number }>
  | BaseAction<'MILL_CARD_TO_BOTTOM', { cardId: string; deckId: string }>
  | BaseAction<'MILL_CARD_TO_PILE', { cardId: string; deckId: string; pileId: string }>
  | BaseAction<'TOGGLE_SHOW_TOP_CARD', { deckId: string; pileId?: string }>
  | BaseAction<'SWING_CLOCKWISE', { id: string }>
  | BaseAction<'SWING_COUNTER_CLOCKWISE', { id: string }>
  | BaseAction<'PIN_TO_VIEWPORT', { id: string; screenX: number; screenY: number }>
  | BaseAction<'UNPIN_FROM_VIEWPORT', { id: string; worldX: number; worldY: number }>
  // UI Object actions
  | BaseAction<'CREATE_PANEL', { panelType: PanelType; x?: number; y?: number; width?: number; height?: number; title?: string; deckId?: string }>
  | BaseAction<'CREATE_WINDOW', { windowType: WindowType; x?: number; y?: number; title?: string; targetObjectId?: string }>
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
  // Undo actions
  | ActionWithoutPayload<'UNDO_MARKER'>
  | ActionWithoutPayload<'UNDO_GENERAL'>
  // Local storage actions
  | ActionWithoutPayload<'CLEAR_SAVED_STATE'>;

const GM_COLOR = '#8e44ad';

// Generate or get session ID from localStorage
const getSessionId = () => {
  if (typeof window === 'undefined') return 'unknown';
  let sessionId = localStorage.getItem('nexus-session-id');
  if (!sessionId) {
    sessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('nexus-session-id', sessionId);
  }
  return sessionId;
};

const initialState: GameState = {
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
  language: (typeof localStorage !== 'undefined' && (localStorage.getItem('app-language') as AppLanguage)) || 'en' as AppLanguage,
};

const GameContext = createContext<{
  state: GameState;
  dispatch: React.Dispatch<Action>;
  isHost: boolean;
  peerId: string | null;
  connectionStatus: 'disconnected' | 'connecting' | 'connected';
  waitingForPlayerName: { hostId: string } | null;
  setPlayerName: (name: string) => void;
} | null>(null);

const gameReducer = (state: GameState, action: Action): GameState => {
  switch (action.type) {
    case 'SYNC_STATE': {
        // When receiving full state from host, we want to keep our active ID correct locally
        // ensuring we don't accidentally become someone else visually
        const currentActiveId = state.activePlayerId;
        const currentViewTransform = state.viewTransform;
        return {
            ...action.payload,
            activePlayerId: currentActiveId,
            viewTransform: currentViewTransform
        };
    }
    case 'LOAD_GAME': {
        // Deep clone objects to avoid mutating the original payload
        const migratedObjects: Record<string, TableObject> = {};
        Object.entries(action.payload.objects || {}).forEach(([id, obj]) => {
            const cloned = { ...obj } as any;
            migratedObjects[id] = cloned;

            // === GameItem base properties migration (only for types that have them) ===
            const hasGameItemProps = [
                ItemType.TOKEN, ItemType.TOKEN_TYPE, ItemType.DICE_OBJECT,
                ItemType.COUNTER, ItemType.BOARD, ItemType.RANDOMIZER, ItemType.DRAWING,
                ItemType.DECK, ItemType.WINDOW
            ].includes(obj.type);

            if (hasGameItemProps) {
                if (cloned.rotationStep === undefined) cloned.rotationStep = undefined;
                if (cloned.baseRotation === undefined) cloned.baseRotation = undefined;
                if (cloned.allowedActions === undefined) cloned.allowedActions = undefined;
                if (cloned.allowedActionsForGM === undefined) cloned.allowedActionsForGM = undefined;
                if (cloned.actionButtons === undefined) cloned.actionButtons = undefined;
                if (cloned.singleClickAction === undefined) cloned.singleClickAction = undefined;
                if (cloned.doubleClickAction === undefined) cloned.doubleClickAction = undefined;
                if (cloned.zIndex === undefined) cloned.zIndex = undefined;
                if (cloned.tooltipText === undefined) cloned.tooltipText = undefined;
                if (cloned.showTooltipImage === undefined) cloned.showTooltipImage = undefined;
                if (cloned.tooltipScale === undefined) cloned.tooltipScale = undefined;
                if (cloned.ownerId === undefined) cloned.ownerId = undefined;
                if (cloned.isPinnedToViewport === undefined) cloned.isPinnedToViewport = false;
                if (cloned.pinnedScreenPosition === undefined) cloned.pinnedScreenPosition = undefined;
                if (cloned.expandedPinnedPosition === undefined) cloned.expandedPinnedPosition = undefined;
                if (cloned.collapsedPinnedPosition === undefined) cloned.collapsedPinnedPosition = undefined;
                if (cloned.inCursorSlot === undefined) cloned.inCursorSlot = false;
            }

            // === DECK specific migrations ===
            if (obj.type === ItemType.DECK) {
                const deck = cloned as Deck;
                if (!deck.baseCardIds || deck.baseCardIds.length === 0) {
                    deck.baseCardIds = [...deck.cardIds];
                }
                if (deck.cardShape === undefined) deck.cardShape = CardShape.POKER;
                if (deck.cardOrientation === undefined) deck.cardOrientation = CardOrientation.VERTICAL;
                if (deck.showTopCard === undefined) deck.showTopCard = false;
                if (deck.piles === undefined || deck.piles.length === 0) {
                    deck.piles = [{
                        id: `${deck.id}-discard`,
                        name: 'Discard',
                        deckId: deck.id,
                        position: 'right',
                        cardIds: [],
                        faceUp: false,
                        visible: false,
                        size: 1,
                        isMillPile: true
                    }];
                }
                // Migrate piles missing properties
                deck.piles?.forEach(pile => {
                    if (pile.isMillPile === undefined) pile.isMillPile = false;
                    if (pile.showTopCard === undefined) pile.showTopCard = false;
                    if (pile.locked === undefined) pile.locked = false;
                });
                if (deck.cardAllowedActions === undefined) deck.cardAllowedActions = undefined;
                if (deck.cardAllowedActionsForGM === undefined) deck.cardAllowedActionsForGM = undefined;
                if (deck.cardActionButtons === undefined) deck.cardActionButtons = undefined;
                if (deck.cardSingleClickAction === undefined) deck.cardSingleClickAction = undefined;
                if (deck.cardDoubleClickAction === undefined) deck.cardDoubleClickAction = undefined;
                if (deck.cardWidth === undefined) deck.cardWidth = DEFAULT_DECK_WIDTH;
                if (deck.cardHeight === undefined) deck.cardHeight = DEFAULT_DECK_HEIGHT;
                if (deck.cardNamePosition === undefined) deck.cardNamePosition = 'none';
                if (deck.playTopFaceUp === undefined) deck.playTopFaceUp = true;
                if (deck.searchWindowVisibility === undefined) deck.searchWindowVisibility = undefined;
                if (deck.perPlayerSearchFaceUp === undefined) deck.perPlayerSearchFaceUp = {};
                if (deck.gmSearchFaceUp === undefined) deck.gmSearchFaceUp = {};
                if (deck.spriteConfig === undefined) deck.spriteConfig = undefined;
            }

            // === CARD specific migrations ===
            if (obj.type === ItemType.CARD) {
                const card = cloned as Card;
                if (card.shape === undefined) card.shape = CardShape.POKER;
                if (card.width === undefined) card.width = DEFAULT_DECK_WIDTH;
                if (card.height === undefined) card.height = DEFAULT_DECK_HEIGHT;
                if (card.hidden === undefined) card.hidden = false;
                if (card.spriteIndex === undefined) card.spriteIndex = undefined;
                if (card.spriteUrl === undefined) card.spriteUrl = undefined;
                if (card.spriteColumns === undefined) card.spriteColumns = undefined;
                if (card.spriteRows === undefined) card.spriteRows = undefined;
                if (card.frontFaceUrl === undefined) card.frontFaceUrl = undefined;
                if (card.backFaceUrl === undefined) card.backFaceUrl = undefined;
                if (card.alternativeBack === undefined) card.alternativeBack = undefined;
            }

            // === TOKEN specific migrations ===
            if (obj.type === ItemType.TOKEN) {
                const token = cloned as Token;
                if (token.shape === undefined) token.shape = TokenShape.CIRCLE;
                if (token.gridType === undefined) token.gridType = GridType.NONE;
                if (token.gridSize === undefined) token.gridSize = 50;
                if (token.snapToGrid === undefined) token.snapToGrid = false;
                if (token.archetypeId === undefined) token.archetypeId = undefined;
                if (token.showName === undefined) token.showName = undefined;
                if (token.showNameOnToken === undefined) token.showNameOnToken = undefined;
                if (token.fontColor === undefined) token.fontColor = undefined;
            }

            // === TOKEN_TYPE (archetype) specific migrations ===
            if (obj.type === ItemType.TOKEN_TYPE) {
                const tokenType = cloned as TokenType;
                if (tokenType.shape === undefined) tokenType.shape = TokenShape.SQUARE;
                if (tokenType.defaultSize === undefined) tokenType.defaultSize = undefined;
                if (tokenType.autoName === undefined) tokenType.autoName = false;
                if (tokenType.namePrefix === undefined) tokenType.namePrefix = '';
                if (tokenType.spawnCount === undefined) tokenType.spawnCount = 0;
                if (tokenType.showName === undefined) tokenType.showName = undefined;
            }

            // === DICE_OBJECT specific migrations ===
            if (obj.type === ItemType.DICE_OBJECT) {
                const dice = cloned as DiceObject;
                if (dice.sides === undefined) dice.sides = 6;
                if (dice.currentValue === undefined) dice.currentValue = 1;
            }

            // === COUNTER specific migrations ===
            if (obj.type === ItemType.COUNTER) {
                const counter = cloned as Counter;
                if (counter.value === undefined) counter.value = 0;
            }

            // === BOARD specific migrations ===
            if (obj.type === ItemType.BOARD) {
                const board = cloned as Board;
                if (board.shape === undefined) board.shape = TokenShape.SQUARE;
                if (board.gridType === undefined) board.gridType = GridType.SQUARE;
                if (board.gridSize === undefined) board.gridSize = 50;
                if (board.snapToGrid === undefined) board.snapToGrid = true;
            }

            // === RANDOMIZER specific migrations ===
            if (obj.type === ItemType.RANDOMIZER) {
                const randomizer = cloned as Randomizer;
                if (randomizer.randomizerType === undefined) randomizer.randomizerType = 'spinner';
                if (randomizer.currentValue === undefined) randomizer.currentValue = undefined;
                if (randomizer.options === undefined) randomizer.options = undefined;
            }

            // === DRAWING specific migrations ===
            if (obj.type === ItemType.DRAWING) {
                const drawing = cloned as Drawing;
                if (drawing.opacity === undefined) drawing.opacity = 100;
                if (drawing.backgroundColor === undefined) drawing.backgroundColor = undefined;
                if (drawing.color === undefined) drawing.color = undefined;
                if (drawing.bounds === undefined) {
                    drawing.bounds = { x: 0, y: 0, width: drawing.width, height: drawing.height };
                }
            }

            // === PANEL specific migrations ===
            if (obj.type === ItemType.PANEL) {
                const panel = cloned as PanelObject;
                if (panel.minimized === undefined) panel.minimized = false;
                if (panel.collapsedState === undefined) panel.collapsedState = undefined;
                if (panel.expandedState === undefined) panel.expandedState = undefined;
                if (panel.dualPosition === undefined) panel.dualPosition = undefined;
                if (panel.isPinnedToViewport === undefined) panel.isPinnedToViewport = true; // Panels are pinned by default
            }

            // === WINDOW specific migrations ===
            if (obj.type === ItemType.WINDOW) {
                const window = cloned as WindowObject;
                if (window.minimized === undefined) window.minimized = false;
                if (window.isPinnedToViewport === undefined) window.isPinnedToViewport = true;
            }
        });

        // Migrate undo state with maxMarkerHistory and maxGeneralHistory if missing
        const payloadUndo = action.payload.undo;
        const undo: UndoState = payloadUndo || {
            markerHistory: [],
            generalHistory: [],
            maxMarkerHistory: 10,
            maxGeneralHistory: 100
        };
        if ((undo as any).maxMarkerHistory === undefined) {
            (undo as any).maxMarkerHistory = 10;
        }
        if ((undo as any).maxGeneralHistory === undefined) {
            (undo as any).maxGeneralHistory = 100;
        }

        // Migrate drawings state (DrawingData with layers)
        const drawings = action.payload.drawings || { layers: [] };

        // Migrate viewTransform
        const payloadViewTransform = action.payload.viewTransform;
        const viewTransform: ViewTransform = payloadViewTransform || {
            offset: { x: 0, y: 0 },
            zoom: 0.8,
            scroll: { x: 0, y: 0 }
        };

        // Ensure players array has required properties
        const players = (action.payload.players || []).map(p => ({
            ...p,
            handCardOrder: p.handCardOrder || undefined
        }));

        // Ensure diceRolls array exists
        const diceRolls = action.payload.diceRolls || [];

        // activePlayerId will use the current one from SYNC_STATE logic, not from save
        // This prevents accidentally becoming someone else after loading
        // sessionId from save is preserved (don't generate new one)

        return {
            ...action.payload,
            objects: migratedObjects,
            players,
            undo,
            drawings,
            viewTransform,
            diceRolls,
            // Keep current activePlayerId from state, not from save (handled by spread above)
            // sessionId from save is preserved if exists
        };
    }
    case 'SET_ACTIVE_ID': {
        return { ...state, activePlayerId: action.payload };
    }
    case 'ADD_PLAYER': {
        // Prevent duplicates
        if (state.players.find(p => p.id === action.payload.id)) return state;
        return {
            ...state,
            players: [...state.players, action.payload]
        };
    }
    case 'REMOVE_PLAYER': {
        return {
            ...state,
            players: state.players.filter(p => p.id !== action.payload.id)
        };
    }
    case 'UPDATE_PLAYER_NAME': {
        return {
            ...state,
            players: state.players.map(p =>
                p.id === action.payload.playerId
                    ? { ...p, name: action.payload.name }
                    : p
            )
        };
    }
    case 'UPDATE_PLAYER_PERMISSIONS': {
        return {
            ...state,
            playerPermissions: action.payload
        };
    }
    case 'UPDATE_LANGUAGE': {
        return {
            ...state,
            language: action.payload
        };
    }
    case 'UPDATE_HAND_CARD_ORDER': {
        return {
            ...state,
            players: state.players.map(p =>
                p.id === action.payload.playerId
                    ? { ...p, handCardOrder: action.payload.cardOrder }
                    : p
            )
        };
    }
    case 'ADD_OBJECT': {
      const isBoard = action.payload.type === ItemType.BOARD;
      const isDeck = action.payload.type === ItemType.DECK;
      const isArchetype = action.payload.type === ItemType.TOKEN_TYPE;
      const allZ = Object.values(state.objects).map(o => o.zIndex || 0);
      const currentMaxZ = allZ.length ? Math.max(...allZ) : 0;
      // Decks get low z-index so they don't interfere with dragging cards
      // Boards get -100, decks get 0, archetypes get -50 (for Tools panel), other objects get currentMaxZ + 1
      const defaultZ = isBoard ? -100 : (isDeck ? 0 : (isArchetype ? -50 : (currentMaxZ + 1)));

      const newObj = {
          ...action.payload,
          zIndex: action.payload.zIndex ?? defaultZ, // Don't override existing zIndex
      } as any;
      const payload = action.payload as any;
      if (payload.isOnTable !== undefined) {
          newObj.isOnTable = payload.isOnTable;
      } else {
          // Archetypes are hidden from table by default (shown in Tools panel)
          newObj.isOnTable = isArchetype ? false : true;
      }

      // Migrate old decks without baseCardIds
      if (isDeck && !newObj.baseCardIds) {
        newObj.baseCardIds = [...(newObj.cardIds || [])];
      }

      return {
        ...state,
        objects: { ...state.objects, [action.payload.id]: newObj },
      };
    }
    case 'UPDATE_OBJECT': {
      const obj = state.objects[action.payload.id];
      if (!obj) return state;

      const updatedObj = { ...obj, ...action.payload } as TableObject;

      // Ensure decks don't have excessively high z-index that interferes with card dragging
      // Cards use zIndex 9999 when dragging, so decks should stay below that
      if (updatedObj.type === ItemType.DECK && (updatedObj.zIndex === undefined || updatedObj.zIndex > 100)) {
        updatedObj.zIndex = 0;
      }

      const newObjects = { ...state.objects, [action.payload.id]: updatedObj };

      // Handle deck updates
      if (updatedObj.type === ItemType.DECK) {
          const deck = updatedObj as Deck;
          const oldDeck = obj as Deck;

          // When cardShape changes, update deck size and all cards
          if (deck.cardShape && deck.cardShape !== oldDeck.cardShape) {
              const dims = CARD_SHAPE_DIMS[deck.cardShape] || CARD_SHAPE_DIMS[CardShape.POKER];
              updatedObj.width = dims.width;
              updatedObj.height = dims.height;
              newObjects[updatedObj.id] = updatedObj;
              Object.values(state.objects).forEach(o => {
                  if (o.type === ItemType.CARD && (o as Card).deckId === deck.id) {
                      newObjects[o.id] = {
                          ...o,
                          shape: deck.cardShape,
                          width: dims.width,
                          height: dims.height
                      } as Card;
                  }
              });
          }

          // When cardWidth or cardHeight changes, update only cards that had the previous default size
          // This allows users to change deck size without affecting cards,
          // but changing card size will update cards that still have default sizes
          const oldCardWidth = oldDeck.cardWidth ?? DEFAULT_DECK_WIDTH;
          const oldCardHeight = oldDeck.cardHeight ?? DEFAULT_DECK_HEIGHT;
          const newCardWidth = deck.cardWidth ?? DEFAULT_DECK_WIDTH;
          const newCardHeight = deck.cardHeight ?? DEFAULT_DECK_HEIGHT;

          if (newCardWidth !== oldCardWidth || newCardHeight !== oldCardHeight) {
              Object.values(state.objects).forEach(o => {
                  if (o.type === ItemType.CARD && (o as Card).deckId === deck.id) {
                      const card = o as Card;
                      // Only update cards that currently have the old card dimensions
                      if (card.width === oldCardWidth && card.height === oldCardHeight) {
                          newObjects[o.id] = {
                              ...card,
                              width: newCardWidth,
                              height: newCardHeight
                          } as Card;
                      }
                  }
              });
          }

          // Handle isMillPile exclusive toggle
          if (deck.piles) {
              const oldPiles = oldDeck.piles || [];
              // Check if any pile's isMillPile changed to true
              const newlyEnabledMillPileIndex = deck.piles.findIndex(
                  (pile, idx) => pile.isMillPile && !oldPiles[idx]?.isMillPile
              );
              if (newlyEnabledMillPileIndex !== -1) {
                  // Disable isMillPile on all other piles
                  deck.piles = deck.piles.map((pile, idx) =>
                      idx === newlyEnabledMillPileIndex
                          ? pile
                          : { ...pile, isMillPile: false }
                  );
                  newObjects[deck.id] = deck;
              }
          }
      }

      // Handle drawing updates - when color changes, update all strokes
      if (updatedObj.type === ItemType.DRAWING) {
        const drawing = obj as Drawing;
        const newDrawing = updatedObj as Drawing;
        // Check if color is being updated
        if ('color' in action.payload && newDrawing.color !== drawing.color) {
          const newColor = newDrawing.color || '#ef4444';
          // Update all strokes with the new color
          newDrawing.strokes = drawing.strokes.map(stroke => ({
            ...stroke,
            color: newColor,
          }));
          newObjects[newDrawing.id] = newDrawing;
        }
      }

      return { ...state, objects: newObjects };
    }
    case 'MOVE_OBJECT': {
      const obj = state.objects[action.payload.id];
      if (!obj || obj.locked) return state;

      // Don't track history for drawings (they use marker history), objects in cursor slot, or local-only moves
      const isDrawing = obj.type === ItemType.DRAWING;
      const isInCursorSlot = (obj as any).inCursorSlot;
      const isLocalOnly = action._localOnly || action._excludeFromHistory;

      if (!isDrawing && !isInCursorSlot && !isLocalOnly) {
        // Add to general history (max 100)
        const historyEntry: GeneralHistoryEntry = {
          type: 'object-moved',
          objectId: obj.id,
          previousX: obj.x,
          previousY: obj.y,
        };
        const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

        // For pinned objects, also update pinnedScreenPosition to maintain visual position
        if ((obj as any).isPinnedToViewport) {
          return {
            ...state,
            objects: {
              ...state.objects,
              [action.payload.id]: {
                ...obj,
                x: action.payload.x,
                y: action.payload.y,
                pinnedScreenPosition: { x: action.payload.x, y: action.payload.y }
              } as TableObject,
            },
            undo: { ...state.undo, generalHistory: newGeneralHistory },
          };
        }
        return {
          ...state,
          objects: {
            ...state.objects,
            [action.payload.id]: { ...obj, x: action.payload.x, y: action.payload.y },
          },
          undo: { ...state.undo, generalHistory: newGeneralHistory },
        };
      }

      // For drawings, don't track history (handled by marker tool actions)
      if ((obj as any).isPinnedToViewport) {
        return {
          ...state,
          objects: {
            ...state.objects,
            [action.payload.id]: {
              ...obj,
              x: action.payload.x,
              y: action.payload.y,
              pinnedScreenPosition: { x: action.payload.x, y: action.payload.y }
            } as TableObject,
          },
        };
      }
      return {
        ...state,
        objects: {
          ...state.objects,
          [action.payload.id]: { ...obj, x: action.payload.x, y: action.payload.y },
        },
      };
    }
    case 'MOVE_OBJECT_COMMIT': {
      // Sent by guest when drag ends - includes previous position for undo
      const { id, x, y, previousX, previousY } = action.payload;
      const obj = state.objects[id];
      if (!obj || obj.locked) return state;

      const isDrawing = obj.type === ItemType.DRAWING;
      const isInCursorSlot = (obj as any).inCursorSlot;

      // Only add to history if not a drawing and not in cursor slot
      if (!isDrawing && !isInCursorSlot) {
        const historyEntry: GeneralHistoryEntry = {
          type: 'object-moved',
          objectId: id,
          previousX,
          previousY,
        };
        const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

        if ((obj as any).isPinnedToViewport) {
          return {
            ...state,
            objects: {
              ...state.objects,
              [id]: {
                ...obj,
                x,
                y,
                pinnedScreenPosition: { x, y }
              } as TableObject,
            },
            undo: { ...state.undo, generalHistory: newGeneralHistory },
          };
        }
        return {
          ...state,
          objects: {
            ...state.objects,
            [id]: { ...obj, x, y },
          },
          undo: { ...state.undo, generalHistory: newGeneralHistory },
        };
      }

      // For drawings, don't track history
      if ((obj as any).isPinnedToViewport) {
        return {
          ...state,
          objects: {
            ...state.objects,
            [id]: {
              ...obj,
              x,
              y,
              pinnedScreenPosition: { x, y }
            } as TableObject,
          },
        };
      }
      return {
        ...state,
        objects: {
          ...state.objects,
          [id]: { ...obj, x, y },
        },
      };
    }
    case 'FINISH_DRAWING_STROKE': {
      // Sent by guest when drawing stroke ends - creates the final drawing object
      const { stroke, bounds, opacity, drawingId } = action.payload;

      if (drawingId) {
        // Adding stroke to existing drawing
        const existingDrawing = state.objects[drawingId] as Drawing;
        if (existingDrawing) {
          const updatedDrawing: Drawing = {
            ...existingDrawing,
            strokes: [...existingDrawing.strokes, stroke],
            // Update bounds to include new stroke
            bounds: {
              x: Math.min(existingDrawing.bounds.x, bounds.x),
              y: Math.min(existingDrawing.bounds.y, bounds.y),
              width: Math.max(existingDrawing.bounds.x + existingDrawing.bounds.width, bounds.x + bounds.width) - Math.min(existingDrawing.bounds.x, bounds.x),
              height: Math.max(existingDrawing.bounds.y + existingDrawing.bounds.height, bounds.y + bounds.height) - Math.min(existingDrawing.bounds.y, bounds.y),
            }
          };
          return {
            ...state,
            objects: {
              ...state.objects,
              [drawingId]: updatedDrawing,
            },
          };
        }
      } else {
        // Creating new drawing object
        const newDrawing: Drawing = {
          id: generateUUID(),
          type: ItemType.DRAWING,
          name: 'Drawing',
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
          rotation: 0,
          color: stroke.color,
          content: '',
          isOnTable: true,
          locked: false,
          strokes: [stroke],
          bounds: { x: 0, y: 0, width: bounds.width, height: bounds.height },
          opacity: opacity ?? 100,
        };
        return {
          ...state,
          objects: {
            ...state.objects,
            [newDrawing.id]: newDrawing,
          },
        };
      }
      return state;
    }
    case 'DELETE_OBJECT': {
        const objectToDelete = state.objects[action.payload.id];
        if (!objectToDelete) return state;
        const newObjects = { ...state.objects };
        delete newObjects[action.payload.id];

        // Collect cascaded deletes for undo
        const cascadedDeletes: TableObject[] = [];

        // If deleting a deck, delete all its cards
        if (objectToDelete.type === ItemType.DECK) {
             const deck = objectToDelete as Deck;
             if (deck.cardIds) {
                 deck.cardIds.forEach(cid => {
                     const card = newObjects[cid];
                     if (card) cascadedDeletes.push(card);
                     delete newObjects[cid];
                 });
             }
        }

        // If deleting a token type (archetype), delete all its token copies
        if (objectToDelete.type === ItemType.TOKEN_TYPE) {
            const archetypeId = objectToDelete.id;
            // Find all tokens that have this archetypeId
            Object.keys(newObjects).forEach(tokenId => {
                const token = newObjects[tokenId];
                if (token.type === ItemType.TOKEN && (token as Token).archetypeId === archetypeId) {
                    cascadedDeletes.push(token);
                    delete newObjects[tokenId];
                }
            });
        }

        // If deleting a card, remove it from deck's cardIds and update initialCardCount
        if (objectToDelete.type === ItemType.CARD) {
            const card = objectToDelete as Card;
            if (card.deckId) {
                const deck = newObjects[card.deckId] as Deck;
                if (deck && deck.type === ItemType.DECK) {
                    // Remove card from deck's cardIds
                    const updatedCardIds = (deck.cardIds || []).filter(id => id !== card.id);
                    newObjects[card.deckId] = {
                        ...deck,
                        cardIds: updatedCardIds,
                        // Update initialCardCount if it exists
                        initialCardCount: deck.initialCardCount
                            ? Math.max(updatedCardIds.length, deck.initialCardCount - 1)
                            : undefined
                    };
                }
            }
        }

        // Add to history based on object type
        let updatedUndo = state.undo;
        if (objectToDelete.type === ItemType.DRAWING) {
            // Marker history (max 10)
            const historyEntry: MarkerHistoryEntry = {
                type: 'drawing-deleted',
                drawing: objectToDelete as Drawing,
            };
            updatedUndo = {
                ...state.undo,
                markerHistory: [...state.undo.markerHistory, historyEntry].slice(-10),
            };
        } else {
            // General history (max 25) - for non-drawing objects
            const historyEntry: GeneralHistoryEntry = {
                type: 'object-deleted',
                objectId: objectToDelete.id,
                object: objectToDelete,
                cascadedDeletes: cascadedDeletes.length > 0 ? cascadedDeletes : undefined,
            };
            updatedUndo = {
                ...state.undo,
                generalHistory: [...state.undo.generalHistory, historyEntry].slice(-100),
            };
        }

        return { ...state, objects: newObjects, undo: updatedUndo };
    }
    case 'DRAW_CARD': {
      const deck = state.objects[action.payload.deckId] as Deck;
      if (!deck || deck.type !== ItemType.DECK || deck.cardIds.length === 0) return state;
      // Take TOP card from deck (first element in array, index 0)
      const drawnCardId = deck.cardIds[0];
      const newCardIds = deck.cardIds.slice(1);
      if (!drawnCardId) return state;
      const card = state.objects[drawnCardId] as Card;

      // Add to general history (max 25)
      const historyEntry: GeneralHistoryEntry = {
        type: 'card-drawn',
        cardId: drawnCardId,
        fromDeckId: deck.id,
        fromIndex: 0, // Top card is at index 0
        previousLocation: card.location,
      };
      const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

      const updatedCard: Card = {
        ...card,
        location: CardLocation.HAND,
        ownerId: action.payload.playerId,
        deckId: deck.id,
        faceUp: true,
        isOnTable: false, // Not visible on tabletop
        shape: deck.cardShape || CardShape.POKER,
      };
      const updatedDeck: Deck = { ...deck, cardIds: newCardIds };

      // Add drawn card to the beginning of player's hand card order (top-right position in hand panel)
      const player = state.players.find(p => p.id === action.payload.playerId);
      const currentHandOrder = player?.handCardOrder || [];
      const newHandOrder = [drawnCardId, ...currentHandOrder];

      return {
        ...state,
        objects: { ...state.objects, [action.payload.deckId]: updatedDeck, [drawnCardId]: updatedCard },
        players: state.players.map(p =>
          p.id === action.payload.playerId
            ? { ...p, handCardOrder: newHandOrder }
            : p
        ),
        undo: { ...state.undo, generalHistory: newGeneralHistory },
      };
    }
    case 'PLAY_CARD': {
        const card = state.objects[action.payload.cardId] as Card;
        if (!card) return state;

        // Add to general history (max 25)
        const historyEntry: GeneralHistoryEntry = {
            type: 'card-played',
            cardId: card.id,
            previousLocation: card.location,
            previousX: card.x,
            previousY: card.y,
            previousFaceUp: card.faceUp,
        };
        const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

        const allZ = Object.values(state.objects).map(o => o.zIndex || 0);
        const maxZ = allZ.length ? Math.max(...allZ) : 0;
        return {
            ...state,
            objects: {
                ...state.objects,
                [action.payload.cardId]: {
                    ...card,
                    location: CardLocation.TABLE,
                    x: action.payload.x,
                    y: action.payload.y,
                    ownerId: undefined,
                    isOnTable: true,
                    zIndex: maxZ + 1
                }
            },
            undo: { ...state.undo, generalHistory: newGeneralHistory },
        };
    }
    case 'PLAY_TOP_CARD': {
        const deck = state.objects[action.payload.deckId] as Deck;
        if (!deck || deck.type !== ItemType.DECK || deck.cardIds.length === 0) return state;

        const topCardId = deck.cardIds[0];
        const card = state.objects[topCardId] as Card;
        if (!card) return state;

        const faceUp = deck.playTopFaceUp ?? true;

        // Capture state for undo - store on card for later use when dropped
        const pendingPlayTop = {
            deckId: deck.id,
            previousCardIds: [...deck.cardIds],
            previousLocation: card.location,
            previousFaceUp: card.faceUp,
        };

        // Remove top card from deck
        const newCardIds = deck.cardIds.slice(1);
        const updatedDeck: Deck = { ...deck, cardIds: newCardIds };

        // Update card to cursor slot - store pending data on card (temp field)
        const updatedCard: Card = {
            ...card,
            location: CardLocation.CURSOR_SLOT,
            faceUp: faceUp,
            isOnTable: false,
            // Store pending data for when card is dropped
            __pendingPlayTop: pendingPlayTop as any,
        };

        return {
            ...state,
            objects: {
                ...state.objects,
                [deck.id]: updatedDeck,
                [topCardId]: updatedCard,
            },
        };
    }
    case 'DROP_FROM_CURSOR_SLOT': {
        const obj = state.objects[action.payload.objectId];
        if (!obj) return state;

        // Only cards and tokens can be in cursor slot
        if (obj.type !== ItemType.CARD && obj.type !== ItemType.TOKEN && obj.type !== ItemType.DICE_OBJECT && obj.type !== ItemType.COUNTER) return state;

        // Check if this card was played via "Play Top" action
        const pendingPlayTop = (obj as Card).__pendingPlayTop;
        if (pendingPlayTop) {
            // This is a "Play Top" action - record full history when card is dropped
            const card = obj as Card;
            const deck = state.objects[pendingPlayTop.deckId] as Deck;
            if (!deck) return state;

            const updatedCard: Card = {
                ...card,
                x: action.payload.x,
                y: action.payload.y,
                ...(action.payload.zIndex !== undefined && { zIndex: action.payload.zIndex }),
                inCursorSlot: false,
                location: CardLocation.TABLE,
                isOnTable: true,
                // Clear the pending data
                __pendingPlayTop: undefined,
            };

            // Add to general history as card-played-from-top
            const historyEntry: GeneralHistoryEntry = {
                type: 'card-played-from-top',
                cardId: card.id,
                deckId: pendingPlayTop.deckId,
                previousCardIds: pendingPlayTop.previousCardIds,
                previousLocation: pendingPlayTop.previousLocation,
                previousFaceUp: pendingPlayTop.previousFaceUp,
            };
            const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

            return {
                ...state,
                objects: { ...state.objects, [obj.id]: updatedCard },
                undo: { ...state.undo, generalHistory: newGeneralHistory },
            };
        }

        // Handle token drop (simpler than cards - no location/deck tracking)
        if (obj.type === ItemType.TOKEN || obj.type === ItemType.DICE_OBJECT || obj.type === ItemType.COUNTER) {
            const updatedObj: TableObject = {
                ...obj,
                x: action.payload.x,
                y: action.payload.y,
                ...(action.payload.zIndex !== undefined && { zIndex: action.payload.zIndex }),
                inCursorSlot: false,
                isOnTable: true,
            };

            return {
                ...state,
                objects: { ...state.objects, [obj.id]: updatedObj },
            };
        }

        // Normal drop from cursor slot for cards (not Play Top)
        // Capture detailed state for undo - determine WHERE the card was before going to cursor slot
        const card = obj as Card;
        const previousLocation = card.location;
        const previousX = card.x;
        const previousY = card.y;
        const previousZIndex = card.zIndex;
        const previousInCursorSlot = card.inCursorSlot;
        const previousFaceUp = card.faceUp;

        // Determine the previous state based on location
        let previousState: 'cursor_slot' | 'table' | 'hand' | 'deck' | 'pile' = 'cursor_slot';
        let previousDeckId: string | undefined;
        let previousOwnerId: string | undefined;
        let previousDeckCardIds: string[] | undefined;
        let previousPileId: string | undefined;
        let previousPileCardIds: string[] | undefined;

        if (previousLocation === CardLocation.TABLE && !previousInCursorSlot) {
            previousState = 'table';
        } else if (previousLocation === CardLocation.HAND) {
            previousState = 'hand';
            previousOwnerId = card.ownerId;
        } else if (previousLocation === CardLocation.DECK) {
            previousState = 'deck';
            previousDeckId = card.deckId;
            // Find the deck and capture cardIds before the card was at top
            if (previousDeckId) {
                const deck = state.objects[previousDeckId] as Deck;
                if (deck && deck.cardIds.includes(card.id)) {
                    previousDeckCardIds = [...deck.cardIds];
                }
            }
        } else if (previousLocation === CardLocation.PILE) {
            previousState = 'pile';
            previousDeckId = card.deckId;
            // Find the pile and capture cardIds
            if (previousDeckId) {
                const deck = state.objects[previousDeckId] as Deck;
                if (deck?.piles) {
                    for (const pile of deck.piles) {
                        if (pile.cardIds.includes(card.id)) {
                            previousPileId = pile.id;
                            previousPileCardIds = [...pile.cardIds];
                            break;
                        }
                    }
                }
            }
        }

        const updatedObj: TableObject = {
            ...obj,
            x: action.payload.x,
            y: action.payload.y,
            ...(action.payload.zIndex !== undefined && { zIndex: action.payload.zIndex }),
            inCursorSlot: false,
        };

        // For cards, also update location to TABLE
        if (obj.type === ItemType.CARD) {
            (updatedObj as Card).location = CardLocation.TABLE;
            (updatedObj as Card).isOnTable = true;
        }

        // Add to general history (max 100)
        const historyEntry: GeneralHistoryEntry = {
            type: 'dropped-from-cursor-slot',
            objectId: obj.id,
            previousState,
            previousLocation,
            previousX,
            previousY,
            previousZIndex,
            previousFaceUp,
            previousDeckId,
            previousOwnerId,
            previousDeckCardIds,
            previousPileId,
            previousPileCardIds,
        };
        const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

        return {
            ...state,
            objects: { ...state.objects, [obj.id]: updatedObj },
            undo: { ...state.undo, generalHistory: newGeneralHistory },
        };
    }
    case 'SHUFFLE_DECK': {
        const deck = state.objects[action.payload.deckId] as Deck;
        if (!deck || deck.type !== ItemType.DECK) return state;

        // Capture state for undo before making changes
        const previousCardOrder = [...deck.cardIds];

        const shuffled = [...deck.cardIds];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        // Add to general history (max 100)
        const historyEntry: GeneralHistoryEntry = {
            type: 'deck-shuffled',
            deckId: deck.id,
            previousCardOrder,
        };
        const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

        return {
            ...state,
            objects: { ...state.objects, [action.payload.deckId]: { ...deck, cardIds: shuffled } },
            undo: { ...state.undo, generalHistory: newGeneralHistory },
        };
    }
    case 'FLIP_CARD': {
        const card = state.objects[action.payload.cardId] as Card;
        if (!card || card.type !== ItemType.CARD) return state;

        // Add to general history (max 25)
        const historyEntry: GeneralHistoryEntry = {
            type: 'card-flipped',
            cardId: card.id,
            previousFaceUp: card.faceUp,
        };
        const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

        return {
            ...state,
            objects: { ...state.objects, [action.payload.cardId]: { ...card, faceUp: !card.faceUp } },
            undo: { ...state.undo, generalHistory: newGeneralHistory },
        };
    }
    case 'ROLL_DICE_LOG': {
        const newRoll: DiceRoll = {
            id: generateUUID(),
            value: action.payload.value,
            playerName: action.payload.playerName,
            timestamp: Date.now()
        };
        return { ...state, diceRolls: [newRoll, ...state.diceRolls].slice(0, 50) };
    }
    case 'ROLL_PHYSICAL_DICE': {
        const dice = state.objects[action.payload.id] as DiceObject;
        if (!dice || dice.type !== ItemType.DICE_OBJECT) return state;
        const rollValue = Math.floor(Math.random() * dice.sides) + 1;
        const newRoll: DiceRoll = {
            id: generateUUID(),
            value: rollValue,
            playerName: 'Dice Object', 
            timestamp: Date.now()
        };
        return {
            ...state,
            objects: { ...state.objects, [action.payload.id]: { ...dice, currentValue: rollValue } },
            diceRolls: [newRoll, ...state.diceRolls].slice(0, 50)
        };
    }
    case 'UPDATE_COUNTER': {
        const counter = state.objects[action.payload.id] as Counter;
        if (!counter || counter.type !== ItemType.COUNTER) return state;

        const newValue = counter.value + action.payload.delta;

        // Check minimum value (0 or baseValue if allowNegative is false)
        const minAllowed = counter.allowNegative ? -Infinity : (counter.baseValue ?? 0);
        if (newValue < minAllowed) return state;

        // Check maximum value if set
        if (counter.maxValue !== undefined && newValue > counter.maxValue) return state;

        // Add to general history
        const historyEntry: GeneralHistoryEntry = {
            type: 'counter-updated',
            objectId: counter.id,
            previousValue: counter.value,
            delta: action.payload.delta,
        };
        const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

        return {
            ...state,
            objects: { ...state.objects, [action.payload.id]: { ...counter, value: newValue } },
            undo: { ...state.undo, generalHistory: newGeneralHistory },
        };
    }
    case 'SWITCH_ROLE': {
        return { ...state, activePlayerId: action.payload.playerId };
    }
    case 'TOGGLE_LOCK': {
        const obj = state.objects[action.payload.id];
        if (!obj) return state;

        // Don't track history for drawings (they use marker history)
        if (obj.type !== ItemType.DRAWING) {
            const historyEntry: GeneralHistoryEntry = {
                type: 'object-lock-toggled',
                objectId: obj.id,
                previousLocked: obj.locked ?? false,
            };
            const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

            return {
                ...state,
                objects: { ...state.objects, [action.payload.id]: { ...obj, locked: !obj.locked } },
                undo: { ...state.undo, generalHistory: newGeneralHistory },
            };
        }

        return { ...state, objects: { ...state.objects, [action.payload.id]: { ...obj, locked: !obj.locked } } };
    }
    case 'TOGGLE_ON_TABLE': {
        const obj = state.objects[action.payload.id] as any;
        if (!obj) return state;

        // Don't track history for drawings
        if (obj.type !== ItemType.DRAWING) {
            const historyEntry: GeneralHistoryEntry = {
                type: 'object-on-table-toggled',
                objectId: obj.id,
                previousIsOnTable: obj.isOnTable ?? false,
            };
            const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

            return {
                ...state,
                objects: { ...state.objects, [action.payload.id]: { ...obj, isOnTable: !obj.isOnTable } },
                undo: { ...state.undo, generalHistory: newGeneralHistory },
            };
        }

        return { ...state, objects: { ...state.objects, [action.payload.id]: { ...obj, isOnTable: !obj.isOnTable } } };
    }
    case 'ROTATE_OBJECT': {
        const obj = state.objects[action.payload.id] as any;
        if (!obj) return state;
        // If angle is provided in payload, use it; otherwise use object's rotationStep
        // For cards, also check deck's rotationStep
        let rotationStep = obj.rotationStep;
        if (!rotationStep && obj.type === ItemType.CARD && obj.deckId) {
            const deck = state.objects[obj.deckId] as any;
            rotationStep = deck?.rotationStep;
        }
        const angle = action.payload.angle ?? rotationStep ?? 45;
        const previousRotation = obj.rotation;

        // Add to general history (max 100)
        const historyEntry: GeneralHistoryEntry = {
            type: 'object-rotated',
            objectId: obj.id,
            previousRotation,
        };
        const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

        return {
            ...state,
            objects: { ...state.objects, [action.payload.id]: { ...obj, rotation: (obj.rotation + angle) % 360 } },
            undo: { ...state.undo, generalHistory: newGeneralHistory },
        };
    }
    case 'SET_ROTATION': {
        const obj = state.objects[action.payload.id];
        if (!obj) return state;
        const previousRotation = obj.rotation;

        // Add to general history (max 100)
        const historyEntry: GeneralHistoryEntry = {
            type: 'object-rotated',
            objectId: obj.id,
            previousRotation,
        };
        const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

        return {
            ...state,
            objects: { ...state.objects, [action.payload.id]: { ...obj, rotation: action.payload.rotation } },
            undo: { ...state.undo, generalHistory: newGeneralHistory },
        };
    }
    case 'CLONE_OBJECT': {
        const obj = state.objects[action.payload.id] as any;
        if (!obj) return state;
        const newId = generateUUID();
        const allZ = Object.values(state.objects).map(o => o.zIndex || 0);
        const maxZ = allZ.length ? Math.max(...allZ) : 0;
        const clonedObj: any = {
            ...obj,
            id: newId,
            x: obj.x + 30,
            y: obj.y + 30,
            name: `${obj.name} (Copy)`,
            locked: false,
            isOnTable: true,
            zIndex: maxZ + 1
        };
        if (clonedObj.type === ItemType.DECK) {
            clonedObj.cardIds = [];
            clonedObj.initialCardCount = 0;
        }

        // Add to general history (max 100)
        const historyEntry: GeneralHistoryEntry = {
            type: 'object-added',
            objectId: newId,
            object: clonedObj,
        };
        const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

        return {
            ...state,
            objects: { ...state.objects, [newId]: clonedObj },
            undo: { ...state.undo, generalHistory: newGeneralHistory },
        };
    }
    case 'RETURN_TO_DECK': {
        const card = state.objects[action.payload.cardId] as Card;
        if (!card || !card.deckId || !state.objects[card.deckId]) return state;
        const deck = state.objects[card.deckId] as Deck;

        // Add to general history (max 25)
        const historyEntry: GeneralHistoryEntry = {
            type: 'card-returned-to-deck',
            cardId: card.id,
            previousLocation: card.location,
            previousX: card.x,
            previousY: card.y,
            deckId: deck.id,
        };
        const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

        // Always return card to the TOP of its main deck (beginning of array)
        // Cards from piles (discard, etc.) return to the main deck, not to piles
        const newCardIds = [card.id, ...deck.cardIds];
        const updatedDeck: Deck = { ...deck, cardIds: newCardIds };
        // Card is face up by default (GM sees actual state, players see based on deck settings)
        const updatedCard: Card = { ...card, location: CardLocation.DECK, faceUp: true, x: deck.x, y: deck.y, isOnTable: true };
        return {
            ...state,
            objects: { ...state.objects, [deck.id]: updatedDeck, [card.id]: updatedCard },
            undo: { ...state.undo, generalHistory: newGeneralHistory },
        };
    }
    case 'RETURN_CARD_TO_DECK_TOP': {
        const card = state.objects[action.payload.cardId] as Card;
        const deck = state.objects[action.payload.deckId] as Deck;
        if (!card || !deck || deck.type !== ItemType.DECK) return state;

        // Capture state for undo before making changes
        const fromDeckId = card.deckId || deck.id;
        const fromDeck = state.objects[fromDeckId] as Deck;
        const fromCardIds = fromDeck?.cardIds ? [...fromDeck.cardIds] : undefined;

        // Find which pile the card was in (if any)
        let fromPileId: string | undefined;
        let fromPileCardIds: string[] | undefined;
        if (fromDeck?.piles) {
            for (const pile of fromDeck.piles) {
                if (pile.cardIds.includes(card.id)) {
                    fromPileId = pile.id;
                    fromPileCardIds = [...pile.cardIds];
                    break;
                }
            }
        }

        const toCardIds = [...deck.cardIds];

        const newObjects = { ...state.objects };

        // Remove card from wherever it currently is (deck.cardIds or any pile's cardIds)
        const sourceDeckId = card.deckId || deck.id;
        const sourceDeck = state.objects[sourceDeckId] as Deck;

        if (sourceDeck && sourceDeck.type === ItemType.DECK) {
            // First, try to find and remove from deck's main cardIds
            let updatedDeck = { ...sourceDeck };
            if (updatedDeck.cardIds.includes(card.id)) {
                updatedDeck.cardIds = updatedDeck.cardIds.filter(id => id !== card.id);
            }

            // Then check all piles
            if (updatedDeck.piles) {
                updatedDeck.piles = updatedDeck.piles.map(pile => {
                    if (pile.cardIds.includes(card.id)) {
                        return { ...pile, cardIds: pile.cardIds.filter(id => id !== card.id) };
                    }
                    return pile;
                });
            }

            newObjects[sourceDeckId] = updatedDeck;
        }

        // Add card to TOP of target deck (beginning of array)
        // Get fresh deck cardIds from state (which now has the card removed)
        const targetDeck = newObjects[deck.id] as Deck;
        const newCardIds = [card.id, ...targetDeck.cardIds];
        const updatedDeck: Deck = { ...targetDeck, cardIds: newCardIds };
        const updatedCard: Card = { ...card, location: CardLocation.DECK, faceUp: true, x: deck.x, y: deck.y, isOnTable: true, deckId: deck.id };
        newObjects[deck.id] = updatedDeck;
        newObjects[card.id] = updatedCard;

        // Add to general history (max 25)
        const historyEntry: GeneralHistoryEntry = {
            type: 'card-returned-to-top',
            cardId: card.id,
            previousLocation: card.location,
            previousX: card.location === CardLocation.TABLE ? card.x : undefined,
            previousY: card.location === CardLocation.TABLE ? card.y : undefined,
            previousFaceUp: card.faceUp,
            fromDeckId,
            toDeckId: deck.id,
            fromCardIds,
            toCardIds,
            fromPileId,
            fromPileCardIds,
        };
        const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

        return { ...state, objects: newObjects, undo: { ...state.undo, generalHistory: newGeneralHistory } };
    }
    case 'RETURN_CARD_TO_DECK_BOTTOM': {
        const card = state.objects[action.payload.cardId] as Card;
        const deck = state.objects[action.payload.deckId] as Deck;
        if (!card || !deck || deck.type !== ItemType.DECK) return state;

        // Capture state for undo before making changes
        const fromDeckId = card.deckId || deck.id;
        const fromDeck = state.objects[fromDeckId] as Deck;
        const fromCardIds = fromDeck?.cardIds ? [...fromDeck.cardIds] : undefined;

        // Find which pile the card was in (if any)
        let fromPileId: string | undefined;
        let fromPileCardIds: string[] | undefined;
        if (fromDeck?.piles) {
            for (const pile of fromDeck.piles) {
                if (pile.cardIds.includes(card.id)) {
                    fromPileId = pile.id;
                    fromPileCardIds = [...pile.cardIds];
                    break;
                }
            }
        }

        const toCardIds = [...deck.cardIds];

        const newObjects = { ...state.objects };

        // Remove card from wherever it currently is (deck.cardIds or any pile's cardIds)
        const sourceDeckId = card.deckId || deck.id;
        const sourceDeck = state.objects[sourceDeckId] as Deck;

        if (sourceDeck && sourceDeck.type === ItemType.DECK) {
            // First, try to find and remove from deck's main cardIds
            let updatedDeck = { ...sourceDeck };
            if (updatedDeck.cardIds.includes(card.id)) {
                updatedDeck.cardIds = updatedDeck.cardIds.filter(id => id !== card.id);
            }

            // Then check all piles
            if (updatedDeck.piles) {
                updatedDeck.piles = updatedDeck.piles.map(pile => {
                    if (pile.cardIds.includes(card.id)) {
                        return { ...pile, cardIds: pile.cardIds.filter(id => id !== card.id) };
                    }
                    return pile;
                });
            }

            newObjects[sourceDeckId] = updatedDeck;
        }

        // Get fresh deck cardIds from state (which now has the card removed)
        const targetDeck = newObjects[deck.id] as Deck;

        // Find the position of the first hidden card from the end
        // We want to insert the new card BEFORE hidden cards (so hidden cards stay at the very bottom)
        let insertIndex = targetDeck.cardIds.length;
        for (let i = targetDeck.cardIds.length - 1; i >= 0; i--) {
            const cardId = targetDeck.cardIds[i];
            const cardObj = state.objects[cardId] as Card;
            if (cardObj && cardObj.hidden) {
                insertIndex = i;
            } else {
                break; // Found a non-hidden card, stop here
            }
        }

        // Insert the card at the calculated position
        const newCardIds = [
            ...targetDeck.cardIds.slice(0, insertIndex),
            card.id,
            ...targetDeck.cardIds.slice(insertIndex)
        ];
        const updatedDeck: Deck = { ...targetDeck, cardIds: newCardIds };
        const updatedCard: Card = { ...card, location: CardLocation.DECK, faceUp: true, x: deck.x, y: deck.y, isOnTable: true, deckId: deck.id };
        newObjects[deck.id] = updatedDeck;
        newObjects[card.id] = updatedCard;

        // Add to general history (max 25)
        const historyEntry: GeneralHistoryEntry = {
            type: 'card-returned-to-bottom',
            cardId: card.id,
            previousLocation: card.location,
            previousX: card.location === CardLocation.TABLE ? card.x : undefined,
            previousY: card.location === CardLocation.TABLE ? card.y : undefined,
            previousFaceUp: card.faceUp,
            fromDeckId,
            toDeckId: deck.id,
            fromCardIds,
            toCardIds,
            fromPileId,
            fromPileCardIds,
        };
        const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

        return { ...state, objects: newObjects, undo: { ...state.undo, generalHistory: newGeneralHistory } };
    }
    case 'ADD_CARD_TO_TOP_OF_DECK': {
        const card = state.objects[action.payload.cardId] as Card;
        const deck = state.objects[action.payload.deckId] as Deck;
        if (!deck || deck.type !== ItemType.DECK) return state;

        // If card exists in state, use it; otherwise it might be coming from cursor slot
        // and we need to handle it differently (it will be added back to objects)
        if (!card) return state;

        // Capture state for undo before making changes
        let fromDeckId: string | undefined = card.deckId;
        let fromCardIds: string[] | undefined;

        // Remove card from its previous deck's cardIds (if it was in one)
        // Find which deck currently contains this card
        // If card doesn't have a deckId yet, check which deck's cardIds contains it
        if (!fromDeckId) {
            Object.values(state.objects).forEach(obj => {
                if (obj.type === ItemType.DECK) {
                    const d = obj as Deck;
                    if (d.cardIds.includes(card.id)) {
                        fromDeckId = d.id;
                    }
                }
            });
        }

        // Remove from previous deck's cardIds (but keep deckId unchanged - it belongs to original deck)
        let updatedState = state;
        if (fromDeckId && fromDeckId !== deck.id) {
            const previousDeck = state.objects[fromDeckId] as Deck;
            if (previousDeck && previousDeck.cardIds.includes(card.id)) {
                fromCardIds = [...previousDeck.cardIds];
                const updatedPreviousDeck: Deck = {
                    ...previousDeck,
                    cardIds: previousDeck.cardIds.filter(id => id !== card.id)
                };
                updatedState = { ...state, objects: { ...state.objects, [fromDeckId]: updatedPreviousDeck } };
            }
        }

        const toCardIds = [...deck.cardIds];

        // Add card to the beginning of the deck (top position)
        // Use updatedState instead of state to include previous deck changes
        const newCardIds = [action.payload.cardId, ...deck.cardIds];
        const updatedDeck: Deck = { ...deck, cardIds: newCardIds };

        // Update card to be in deck
        // Keep the card's original deckId - cards always belong to their original deck
        const updatedCard: Card = {
            ...card,
            location: CardLocation.DECK,
            // Set deckId if not already set (card from empty deck may not have one)
            deckId: card.deckId || deck.id,
            faceUp: false,  // Cards are face down in deck
            x: deck.x,
            y: deck.y,
            isOnTable: true
        };

        // Add to general history (max 25)
        const historyEntry: GeneralHistoryEntry = {
            type: 'card-added-to-top',
            cardId: card.id,
            previousLocation: card.location,
            previousX: card.location === CardLocation.TABLE ? card.x : undefined,
            previousY: card.location === CardLocation.TABLE ? card.y : undefined,
            previousFaceUp: card.faceUp,
            fromDeckId,
            toDeckId: deck.id,
            fromCardIds,
            toCardIds,
        };
        const newGeneralHistory = [...updatedState.undo.generalHistory, historyEntry].slice(-100);

        return { ...updatedState, objects: { ...updatedState.objects, [deck.id]: updatedDeck, [action.payload.cardId]: updatedCard }, undo: { ...updatedState.undo, generalHistory: newGeneralHistory } };
    }
    case 'ADD_CARD_TO_PILE': {
        const card = state.objects[action.payload.cardId] as Card;
        const deck = state.objects[action.payload.deckId] as Deck;
        if (!card || !deck || deck.type !== ItemType.DECK) return state;

        // Find the pile in the deck's piles array
        const pile = deck.piles?.find(p => p.id === action.payload.pileId);
        if (!pile) return state;

        // Capture state for undo before making changes
        const previousDeckCardIds = deck.cardIds ? [...deck.cardIds] : undefined;
        const previousPileCardIds = pile.cardIds ? [...pile.cardIds] : undefined;

        // Remove card from its previous deck's cardIds (if it was in one)
        // Find which deck currently contains this card
        let previousDeckId: string | undefined = card.deckId;
        // If card doesn't have a deckId yet, check which deck's cardIds contains it
        if (!previousDeckId) {
            Object.values(state.objects).forEach(obj => {
                if (obj.type === ItemType.DECK) {
                    const d = obj as Deck;
                    if (d.cardIds.includes(card.id)) {
                        previousDeckId = d.id;
                    }
                }
            });
        }

        // Remove from previous deck's cardIds (but keep deckId unchanged - it belongs to original deck)
        let deckWithUpdatedCardIds: Deck = deck;
        if (previousDeckId && previousDeckId !== deck.id) {
            // Card coming from a different deck - remove from that deck's cardIds
            const previousDeck = state.objects[previousDeckId] as Deck;
            if (previousDeck && previousDeck.cardIds.includes(card.id)) {
                const updatedPreviousDeck: Deck = {
                    ...previousDeck,
                    cardIds: previousDeck.cardIds.filter(id => id !== card.id)
                };
                // Also remove from previous deck's piles if present
                const updatedPreviousPiles = previousDeck.piles?.map(p => ({
                    ...p,
                    cardIds: p.cardIds.filter(id => id !== card.id)
                }));
                return { ...state, objects: { ...state.objects, [previousDeckId]: { ...updatedPreviousDeck, piles: updatedPreviousPiles } } };
            }
        } else if (previousDeckId === deck.id && deck.cardIds.includes(card.id)) {
            // Card coming from same deck's cardIds (e.g., milling from deck to pile) - remove from deck.cardIds
            deckWithUpdatedCardIds = {
                ...deck,
                cardIds: deck.cardIds.filter(id => id !== card.id)
            };
        }

        // Create updated pile with new card added to TOP (beginning of array)
        const updatedPile: CardPile = {
            ...pile,
            cardIds: [action.payload.cardId, ...pile.cardIds]
        };

        // Update deck's piles array
        const updatedPiles = deckWithUpdatedCardIds.piles?.map(p =>
            p.id === action.payload.pileId ? updatedPile : p
        ) || [updatedPile];

        const updatedDeck: Deck = { ...deckWithUpdatedCardIds, piles: updatedPiles };

        // Update card to be in pile
        // Keep the card's original deckId - cards always belong to their original deck
        const updatedCard: Card = {
            ...card,
            location: CardLocation.PILE,
            // Set deckId if not already set (card from empty deck may not have one)
            deckId: card.deckId || deck.id,
            faceUp: pile.faceUp ?? false,
            isOnTable: true
        };

        // Add to general history (max 25)
        const historyEntry: GeneralHistoryEntry = {
            type: 'card-added-to-pile',
            cardId: action.payload.cardId,
            previousLocation: card.location,
            previousX: card.location === CardLocation.TABLE ? card.x : undefined,
            previousY: card.location === CardLocation.TABLE ? card.y : undefined,
            deckId: deck.id,
            pileId: pile.id,
            previousDeckCardIds: previousDeckCardIds,
            previousPileCardIds: previousPileCardIds
        };
        const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

        return { ...state, objects: { ...state.objects, [deck.id]: updatedDeck, [action.payload.cardId]: updatedCard }, undo: { ...state.undo, generalHistory: newGeneralHistory } };
    }
    case 'UPDATE_PERMISSIONS': {
        const obj = state.objects[action.payload.id] as any;
        if (!obj) return state;
        // Cards don't have allowedActions - skip
        if (obj.type === ItemType.CARD) return state;
        return { ...state, objects: { ...state.objects, [action.payload.id]: { ...obj, allowedActions: action.payload.actions } } };
    }
    case 'UPDATE_ACTION_BUTTONS': {
        const obj = state.objects[action.payload.id] as any;
        if (!obj) return state;
        // Cards don't have actionButtons - skip
        if (obj.type === ItemType.CARD) return state;
        return { ...state, objects: { ...state.objects, [action.payload.id]: { ...obj, actionButtons: action.payload.actions } } };
    }
    case 'MOVE_LAYER_UP': {
        const obj = state.objects[action.payload.id];
        if (!obj) return state;
        const sortedObjects = Object.values(state.objects).sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
        const index = sortedObjects.findIndex(o => o.id === obj.id);
        if (index === -1 || index === sortedObjects.length - 1) return state;
        const nextObj = sortedObjects[index + 1];
        const currentZ = obj.zIndex || 0;
        const nextZ = nextObj.zIndex || 0;
        let newCurrentZ = nextZ;
        let newNextZ = currentZ;
        if (newCurrentZ <= newNextZ) { newCurrentZ = newNextZ + 1; }

        // Add to general history
        const historyEntry: GeneralHistoryEntry = {
            type: 'object-layer-changed',
            objectId: obj.id,
            direction: 'up',
            previousZIndex: currentZ,
            otherObjectId: nextObj.id,
            otherObjectPreviousZIndex: nextZ,
        };
        const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

        return {
            ...state,
            objects: { ...state.objects, [obj.id]: { ...obj, zIndex: newCurrentZ }, [nextObj.id]: { ...nextObj, zIndex: newNextZ } },
            undo: { ...state.undo, generalHistory: newGeneralHistory },
        };
    }
    case 'MOVE_LAYER_DOWN': {
        const obj = state.objects[action.payload.id];
        if (!obj) return state;
        const sortedObjects = Object.values(state.objects).sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
        const index = sortedObjects.findIndex(o => o.id === obj.id);
        if (index <= 0) return state;
        const prevObj = sortedObjects[index - 1];
        const isPrevBoard = prevObj.type === ItemType.BOARD;
        const isCurrentBoard = obj.type === ItemType.BOARD;
        if (isPrevBoard && !isCurrentBoard) return state;
        const currentZ = obj.zIndex || 0;
        const prevZ = prevObj.zIndex || 0;
        let newCurrentZ = prevZ;
        let newPrevZ = currentZ;
        if (newPrevZ >= newCurrentZ) { newPrevZ = newCurrentZ + 1; }

        // Add to general history
        const historyEntry: GeneralHistoryEntry = {
            type: 'object-layer-changed',
            objectId: obj.id,
            direction: 'down',
            previousZIndex: currentZ,
            otherObjectId: prevObj.id,
            otherObjectPreviousZIndex: prevZ,
        };
        const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

        return {
            ...state,
            objects: { ...state.objects, [obj.id]: { ...obj, zIndex: newCurrentZ }, [prevObj.id]: { ...prevObj, zIndex: newPrevZ } },
            undo: { ...state.undo, generalHistory: newGeneralHistory },
        };
    }
    case 'UPDATE_VIEW_TRANSFORM': {
      return { ...state, viewTransform: action.payload };
    }
    case 'DRAW_FROM_PILE': {
      const deck = state.objects[action.payload.deckId] as Deck;
      if (!deck || deck.type !== ItemType.DECK) return state;

      const pile = deck.piles?.find(p => p.id === action.payload.pileId);
      if (!pile || pile.cardIds.length === 0) return state;

      // Take TOP card from pile (first element in array, index 0)
      const drawnCardId = pile.cardIds[0];
      const newPileCardIds = pile.cardIds.slice(1);
      if (!drawnCardId) return state;

      const card = state.objects[drawnCardId] as Card;

      // Add to general history (max 25)
      const historyEntry: GeneralHistoryEntry = {
        type: 'card-drawn-from-pile',
        cardId: drawnCardId,
        previousLocation: card.location,
        deckId: deck.id,
        pileId: pile.id,
        fromIndex: 0,
      };
      const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

      const updatedCard: Card = {
        ...card,
        location: CardLocation.HAND,
        ownerId: action.payload.playerId,
        deckId: deck.id,
        faceUp: true,
        isOnTable: false,
      };

      // Update pile with card removed
      const updatedPile: CardPile = { ...pile, cardIds: newPileCardIds };
      const updatedPiles = deck.piles?.map(p => p.id === action.payload.pileId ? updatedPile : p) || [updatedPile];
      const updatedDeck: Deck = { ...deck, piles: updatedPiles };

      return {
        ...state,
        objects: { ...state.objects, [deck.id]: updatedDeck, [drawnCardId]: updatedCard },
        undo: { ...state.undo, generalHistory: newGeneralHistory },
      };
    }
    case 'RETURN_ALL_CARDS_TO_DECK': {
      const deck = state.objects[action.payload.deckId] as Deck;
      if (!deck || deck.type !== ItemType.DECK) return state;

      const baseCardIds = deck.baseCardIds || [];
      const newObjects = { ...state.objects };
      const spriteConfig = deck.spriteConfig;

      // 1. Clear all piles of this deck
      let updatedDeck = { ...deck };
      if (updatedDeck.piles) {
        updatedDeck.piles = updatedDeck.piles.map(pile => ({
          ...pile,
          cardIds: []
        }));
      }

      // 2. Set cardIds = baseCardIds (reset to base)
      updatedDeck.cardIds = [...baseCardIds];

      // 3. Track which base card IDs we've found
      const foundBaseCardIds = new Set<string>();

      // 4. Process all existing cards
      Object.values(state.objects).forEach(obj => {
        if (obj.type !== ItemType.CARD) return;
        const card = obj as Card;

        // Cards that belong to THIS deck
        if (card.deckId === deck.id) {
          if (baseCardIds.includes(card.id)) {
            // Card is in baseCardIds - move it to THIS deck
            foundBaseCardIds.add(card.id);
            newObjects[card.id] = {
              ...card,
              location: CardLocation.DECK,
              faceUp: true,
              x: deck.x,
              y: deck.y,
              isOnTable: true,
              ownerId: undefined,
            };
          } else {
            // Card has this deck's deckId but is NOT in baseCardIds
            // This means it was permanently removed by GM deletion - delete it
            delete newObjects[card.id];
          }
        }
      });

      // 5. Re-create missing cards using sprite config
      // baseCardIds is ordered by spriteIndex (baseCardIds[i] has spriteIndex = i)
      if (spriteConfig && spriteConfig.columns > 0 && spriteConfig.rows > 0) {
        baseCardIds.forEach((cardId, index) => {
          if (!foundBaseCardIds.has(cardId)) {
            // Card is missing - recreate it
            newObjects[cardId] = {
              id: cardId,
              type: ItemType.CARD,
              name: `Card ${index + 1}`,
              content: spriteConfig.cardBackUrl || spriteConfig.spriteUrl,
              deckId: deck.id,
              width: deck.cardWidth || deck.width || 63,
              height: deck.cardHeight || deck.height || 88,
              x: deck.x,
              y: deck.y,
              rotation: 0,
              location: CardLocation.DECK,
              faceUp: true,
              isOnTable: true,
              locked: false,
              // Sprite properties - index is the position in baseCardIds
              spriteIndex: index,
              spriteUrl: spriteConfig.spriteUrl,
              spriteColumns: spriteConfig.columns,
              spriteRows: spriteConfig.rows,
              shape: deck.cardShape,
            };
          }
        });
      }

      newObjects[deck.id] = updatedDeck;

      return { ...state, objects: newObjects };
    }
    case 'TOGGLE_PILE_LOCK': {
      const deck = state.objects[action.payload.deckId] as Deck;
      if (!deck || deck.type !== ItemType.DECK) return state;

      const pile = deck.piles?.find(p => p.id === action.payload.pileId);
      if (!pile) return state;

      const updatedPiles = deck.piles?.map(p =>
        p.id === action.payload.pileId ? { ...p, locked: !p.locked } : p
      );

      return {
        ...state,
        objects: {
          ...state.objects,
          [deck.id]: { ...deck, piles: updatedPiles }
        }
      };
    }
    case 'UPDATE_PILE_POSITION': {
      const deck = state.objects[action.payload.deckId] as Deck;
      if (!deck || deck.type !== ItemType.DECK) return state;

      const pile = deck.piles?.find(p => p.id === action.payload.pileId);
      if (!pile) return state;

      const updatedPiles = deck.piles?.map(p =>
        p.id === action.payload.pileId ? { ...p, x: action.payload.x, y: action.payload.y } : p
      );

      return {
        ...state,
        objects: {
          ...state.objects,
          [deck.id]: { ...deck, piles: updatedPiles }
        }
      };
    }
    case 'UPDATE_DECK_CARD_DIMENSIONS': {
      const deck = state.objects[action.payload.deckId] as Deck;
      if (!deck || deck.type !== ItemType.DECK) return state;

      const { cardWidth, cardHeight } = action.payload;

      // Update deck settings
      const updatedDeck: Deck = {
        ...deck,
        cardWidth,
        cardHeight,
      };

      // Update all cards in this deck - set their individual dimensions
      // to match the deck's card dimensions
      const newObjects = { ...state.objects };
      newObjects[deck.id] = updatedDeck;

      // Find all cards belonging to this deck and set their width/height
      Object.values(state.objects).forEach(obj => {
        if (obj.type === ItemType.CARD) {
          const card = obj as Card;
          if (card.deckId === deck.id) {
            // Set individual width/height on the card itself
            newObjects[card.id] = {
              ...card,
              width: cardWidth,
              height: cardHeight,
            };
          }
        }
      });

      return {
        ...state,
        objects: newObjects,
      };
    }
    case 'MILL_CARD_TO_BOTTOM': {
      // Move card to bottom of deck (before hidden cards)
      const { cardId, deckId } = action.payload;
      const deck = state.objects[deckId] as Deck;
      if (!deck || deck.type !== ItemType.DECK) return state;
      if (!deck.cardIds.includes(cardId)) return state;

      // Capture state for undo before making changes
      const previousCardIds = [...deck.cardIds];

      // Find the position of the first hidden card from the end
      // Insert before hidden cards so they stay at the very bottom
      let insertIndex = deck.cardIds.length;
      for (let i = deck.cardIds.length - 1; i >= 0; i--) {
        const currentCardId = deck.cardIds[i];
        const cardObj = state.objects[currentCardId] as Card;
        if (cardObj && cardObj.hidden) {
          insertIndex = i;
        } else {
          break;
        }
      }

      // Remove card from current position and insert at calculated position
      const filteredIds = deck.cardIds.filter(id => id !== cardId);
      const newCardIds = [
        ...filteredIds.slice(0, insertIndex),
        cardId,
        ...filteredIds.slice(insertIndex)
      ];

      // Add to general history (max 25)
      const historyEntry: GeneralHistoryEntry = {
        type: 'card-milled-to-bottom',
        cardId,
        deckId,
        previousCardIds,
      };
      const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

      return {
        ...state,
        objects: {
          ...state.objects,
          [deckId]: { ...deck, cardIds: newCardIds }
        },
        undo: { ...state.undo, generalHistory: newGeneralHistory },
      };
    }
    case 'MILL_CARD_TO_PILE': {
      // Move card from deck to pile
      const { cardId, deckId, pileId } = action.payload;
      const deck = state.objects[deckId] as Deck;
      if (!deck || deck.type !== ItemType.DECK) return state;
      if (!deck.cardIds.includes(cardId)) return state;

      const pile = deck.piles?.find(p => p.id === pileId);
      if (!pile) return state;

      // Capture state for undo before making changes
      const previousDeckCardIds = [...deck.cardIds];
      const previousPileCardIds = [...pile.cardIds];

      // Remove from deck cardIds
      const newDeckCardIds = deck.cardIds.filter(id => id !== cardId);
      // Add to pile cardIds
      const newPileCardIds = [...pile.cardIds, cardId];

      // Update piles array
      const updatedPiles = deck.piles?.map(p =>
        p.id === pileId ? { ...p, cardIds: newPileCardIds } : p
      );

      // Add to general history (max 25)
      const historyEntry: GeneralHistoryEntry = {
        type: 'card-milled-to-pile',
        cardId,
        deckId,
        pileId,
        previousDeckCardIds,
        previousPileCardIds,
      };
      const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

      return {
        ...state,
        objects: {
          ...state.objects,
          [deckId]: {
            ...deck,
            cardIds: newDeckCardIds,
            piles: updatedPiles
          }
        },
        undo: { ...state.undo, generalHistory: newGeneralHistory },
      };
    }
    case 'TOGGLE_SHOW_TOP_CARD': {
      // Toggle showTopCard for deck or pile
      const { deckId, pileId } = action.payload;
      const deck = state.objects[deckId] as Deck;
      if (!deck || deck.type !== ItemType.DECK) return state;

      if (pileId) {
        // Toggle showTopCard for a specific pile
        const pile = deck.piles?.find(p => p.id === pileId);
        if (!pile) return state;

        const updatedPiles = deck.piles?.map(p =>
          p.id === pileId ? { ...p, showTopCard: !p.showTopCard } : p
        );

        return {
          ...state,
          objects: {
            ...state.objects,
            [deckId]: { ...deck, piles: updatedPiles }
          }
        };
      } else {
        // Toggle showTopCard for the deck itself
        return {
          ...state,
          objects: {
            ...state.objects,
            [deckId]: { ...deck, showTopCard: !deck.showTopCard }
          }
        };
      }
    }
    case 'SWING_CLOCKWISE': {
      const obj = state.objects[action.payload.id] as any;
      if (!obj) return state;

      // For cards, check deck's rotationStep
      let rotationStep = obj.rotationStep;
      if (!rotationStep && obj.type === ItemType.CARD && obj.deckId) {
        const deck = state.objects[obj.deckId] as any;
        rotationStep = deck?.rotationStep;
      }
      rotationStep = rotationStep ?? 45;

      const baseRotation = obj.baseRotation ?? obj.rotation;
      const previousRotation = obj.rotation;

      // If current rotation is at base, rotate clockwise by rotationStep
      // Otherwise return to base rotation
      const newRotation = obj.rotation === baseRotation
        ? (obj.rotation + rotationStep) % 360
        : baseRotation;

      // Add to general history
      const historyEntry: GeneralHistoryEntry = {
        type: 'object-rotated',
        objectId: obj.id,
        previousRotation,
        previousBaseRotation: obj.baseRotation,
      };
      const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

      return {
        ...state,
        objects: {
          ...state.objects,
          [action.payload.id]: {
            ...obj,
            rotation: newRotation,
            baseRotation: baseRotation
          }
        },
        undo: { ...state.undo, generalHistory: newGeneralHistory },
      };
    }
    case 'SWING_COUNTER_CLOCKWISE': {
      const obj = state.objects[action.payload.id] as any;
      if (!obj) return state;

      // For cards, check deck's rotationStep
      let rotationStep = obj.rotationStep;
      if (!rotationStep && obj.type === ItemType.CARD && obj.deckId) {
        const deck = state.objects[obj.deckId] as any;
        rotationStep = deck?.rotationStep;
      }
      rotationStep = rotationStep ?? 45;

      const baseRotation = obj.baseRotation ?? obj.rotation;
      const previousRotation = obj.rotation;

      // If current rotation is at base, rotate counter-clockwise by rotationStep
      // Otherwise return to base rotation
      const newRotation = obj.rotation === baseRotation
        ? (obj.rotation - rotationStep + 360) % 360
        : baseRotation;

      // Add to general history
      const historyEntry: GeneralHistoryEntry = {
        type: 'object-rotated',
        objectId: obj.id,
        previousRotation,
        previousBaseRotation: obj.baseRotation,
      };
      const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

      return {
        ...state,
        objects: {
          ...state.objects,
          [action.payload.id]: {
            ...obj,
            rotation: newRotation,
            baseRotation: baseRotation
          }
        },
        undo: { ...state.undo, generalHistory: newGeneralHistory },
      };
    }
    case 'PIN_TO_VIEWPORT': {
      const obj = state.objects[action.payload.id];
      if (!obj) return state;

      // Add to general history
      const historyEntry: GeneralHistoryEntry = {
        type: 'object-pinned',
        objectId: obj.id,
        previousPinnedToViewport: (obj as any).isPinnedToViewport,
        previousScreenPosition: (obj as any).pinnedScreenPosition,
      };
      const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

      const isMinimized = (obj as any).minimized || false;
      const hasDualPosition = (obj as any).dualPosition || false;

      // For dual position mode, store separate positions for minimized and expanded states
      if (hasDualPosition) {
        const updatedObj: any = {
          ...obj,
          isPinnedToViewport: true,
        };

        if (isMinimized) {
          // Store as collapsed pinned position when currently minimized
          updatedObj.collapsedPinnedPosition = { x: action.payload.screenX, y: action.payload.screenY };
          // Keep expanded position if it exists
          if (!updatedObj.expandedPinnedPosition && (obj as any).pinnedScreenPosition) {
            updatedObj.expandedPinnedPosition = { ...(obj as any).pinnedScreenPosition };
          }
        } else {
          // Store as expanded pinned position when currently expanded
          updatedObj.expandedPinnedPosition = { x: action.payload.screenX, y: action.payload.screenY };
          // Keep collapsed position if it exists
          if (!updatedObj.collapsedPinnedPosition && (obj as any).pinnedScreenPosition) {
            updatedObj.collapsedPinnedPosition = { ...(obj as any).pinnedScreenPosition };
          }
        }

        // Also set the legacy pinnedScreenPosition for backward compatibility
        updatedObj.pinnedScreenPosition = { x: action.payload.screenX, y: action.payload.screenY };

        return {
          ...state,
          objects: {
            ...state.objects,
            [action.payload.id]: updatedObj
          },
          undo: { ...state.undo, generalHistory: newGeneralHistory },
        };
      }

      // Single position mode (original behavior)
      return {
        ...state,
        objects: {
          ...state.objects,
          [action.payload.id]: {
            ...obj,
            isPinnedToViewport: true,
            pinnedScreenPosition: { x: action.payload.screenX, y: action.payload.screenY }
          }
        },
        undo: { ...state.undo, generalHistory: newGeneralHistory },
      };
    }
    case 'UNPIN_FROM_VIEWPORT': {
      const obj = state.objects[action.payload.id];
      if (!obj) return state;

      // Add to general history
      const historyEntry: GeneralHistoryEntry = {
        type: 'object-unpinned',
        objectId: obj.id,
        previousX: obj.x,
        previousY: obj.y,
        previousPinnedToViewport: (obj as any).isPinnedToViewport || false,
        previousScreenPosition: (obj as any).pinnedScreenPosition,
      };
      const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

      return {
        ...state,
        objects: {
          ...state.objects,
          [action.payload.id]: {
            ...obj,
            x: action.payload.worldX,
            y: action.payload.worldY,
            isPinnedToViewport: false,
            pinnedScreenPosition: undefined,
            expandedPinnedPosition: undefined,
            collapsedPinnedPosition: undefined
          }
        },
        undo: { ...state.undo, generalHistory: newGeneralHistory },
      };
    }
    case 'CREATE_PANEL': {
      const { panelType, x = 100, y = 100, width = DEFAULT_PANEL_WIDTH, height = DEFAULT_PANEL_HEIGHT, title, deckId } = action.payload;
      const panelId = generateUUID();

      // UI panels have zIndex 9998, draggable cards have 9999
      const panelZ = 9998;

      const panel: PanelObject = {
        id: panelId,
        type: ItemType.PANEL,
        name: title || panelType,
        panelType,
        title: title || panelType,
        x,
        y,
        width,
        height,
        rotation: 0,
        zIndex: panelZ,
        locked: false,
        minimized: false,
        visible: true,
        deckId,
      };

      // Main menu is pinned to viewport by default with dual position mode enabled
      if (panelType === PanelType.MAIN_MENU) {
        (panel as any).isPinnedToViewport = true;
        (panel as any).pinnedScreenPosition = { x, y };
        (panel as any).dualPosition = true; // Enable dual position mode by default
      }

      return {
        ...state,
        objects: { ...state.objects, [panelId]: panel },
      };
    }
    case 'CREATE_WINDOW': {
      const { windowType, x = 200, y = 200, title, targetObjectId } = action.payload;
      const windowId = generateUUID();

      // UI windows have zIndex 9999 (above panels, same as dragging cards)
      const windowZ = 9999;

      const windowObj: WindowObject = {
        id: windowId,
        type: ItemType.WINDOW,
        name: title || windowType,
        windowType,
        title: title || windowType,
        x,
        y,
        width: 400,
        height: 300,
        rotation: 0,
        zIndex: windowZ,
        locked: false,
        minimized: false,
        visible: true,
        targetObjectId,
        // Settings windows are local to the player who created them
        ownerId: windowType === WindowType.OBJECT_SETTINGS ? state.activePlayerId : undefined,
      };

      return {
        ...state,
        objects: { ...state.objects, [windowId]: windowObj },
      };
    }
    case 'CLOSE_UI_OBJECT': {
      const obj = state.objects[action.payload.id];
      if (!obj || (obj.type !== ItemType.PANEL && obj.type !== ItemType.WINDOW)) return state;

      // For windows, close = delete; for panels, close = hide
      if (obj.type === ItemType.WINDOW) {
        const newObjects = { ...state.objects };
        delete newObjects[action.payload.id];
        return { ...state, objects: newObjects };
      } else {
        return {
          ...state,
          objects: {
            ...state.objects,
            [action.payload.id]: { ...obj, visible: false } as PanelObject,
          },
        };
      }
    }
    case 'TOGGLE_MINIMIZE': {
      const obj = state.objects[action.payload.id];
      if (!obj || (obj.type !== ItemType.PANEL && obj.type !== ItemType.WINDOW)) return state;

      const isMinimizing = !obj.minimized;
      const hasDualPosition = (obj as any).dualPosition || false;
      const isPinned = (obj as any).isPinnedToViewport || false;

      let newObj: PanelObject | WindowObject = { ...obj, minimized: isMinimizing } as PanelObject | WindowObject;

      // If dual position mode is enabled and object is pinned, update position
      if (hasDualPosition && isPinned) {
        const scrollContainer = typeof document !== 'undefined'
          ? document.querySelector('[data-tabletop="true"]') as HTMLElement
          : null;
        const currentScrollLeft = scrollContainer?.scrollLeft || 0;
        const currentScrollTop = scrollContainer?.scrollTop || 0;

        if (isMinimizing) {
          // Collapsing: save current expanded position as expandedPinnedPosition if not set
          if (!(obj as any).expandedPinnedPosition) {
            (newObj as any).expandedPinnedPosition = {
              x: obj.x - currentScrollLeft,
              y: obj.y - currentScrollTop
            };
          }

          // Save expanded state for size restoration
          (newObj as any).expandedState = {
            x: obj.x,
            y: obj.y,
            width: obj.width,
            height: obj.height,
          };

          // Move to collapsed pinned position (or stay in place if none set yet)
          if ((obj as any).collapsedPinnedPosition) {
            (newObj as any).x = (obj as any).collapsedPinnedPosition.x + currentScrollLeft;
            (newObj as any).y = (obj as any).collapsedPinnedPosition.y + currentScrollTop;
          }
        } else {
          // Expanding: save current collapsed position as collapsedPinnedPosition if not set
          if (!(obj as any).collapsedPinnedPosition) {
            (newObj as any).collapsedPinnedPosition = {
              x: obj.x - currentScrollLeft,
              y: obj.y - currentScrollTop
            };
          }

          // Move to expanded pinned position
          if ((obj as any).expandedPinnedPosition) {
            (newObj as any).x = (obj as any).expandedPinnedPosition.x + currentScrollLeft;
            (newObj as any).y = (obj as any).expandedPinnedPosition.y + currentScrollTop;
          }

          // Restore size if we have saved state
          if ((obj as any).expandedState) {
            newObj.width = (obj as any).expandedState.width;
            newObj.height = (obj as any).expandedState.height;
          }
        }

        // Update legacy pinnedScreenPosition to match current state
        (newObj as any).pinnedScreenPosition = {
          x: newObj.x - currentScrollLeft,
          y: newObj.y - currentScrollTop
        };
      }

      return {
        ...state,
        objects: {
          ...state.objects,
          [action.payload.id]: newObj,
        },
      };
    }
    case 'RESIZE_UI_OBJECT': {
      const obj = state.objects[action.payload.id];
      if (!obj || (obj.type !== ItemType.PANEL && obj.type !== ItemType.WINDOW)) return state;

      return {
        ...state,
        objects: {
          ...state.objects,
          [action.payload.id]: {
            ...obj,
            width: action.payload.width,
            height: action.payload.height,
          } as PanelObject | WindowObject,
        },
      };
    }
    case 'SPAWN_TOKEN_FROM_ARCHETYPE': {
      const archetype = state.objects[action.payload.archetypeId] as TokenType;
      if (!archetype || archetype.type !== ItemType.TOKEN_TYPE) return state;

      // Get current spawn count or start at 0
      const currentCount = archetype.spawnCount || 0;

      // Generate new token based on archetype settings
      const tokenId = generateUUID();
      const allZ = Object.values(state.objects).map(o => o.zIndex || 0);
      const maxZ = allZ.length ? Math.max(...allZ) : 0;

      const newToken: Token = {
        id: tokenId,
        type: ItemType.TOKEN,
        shape: archetype.shape,
        name: archetype.autoName && archetype.namePrefix
          ? `${archetype.namePrefix} ${currentCount + 1}`
          : archetype.name,
        x: action.payload.x,
        y: action.payload.y,
        width: archetype.defaultSize?.width ?? archetype.width,
        height: archetype.defaultSize?.height ?? archetype.height,
        rotation: 0,
        content: archetype.content,
        color: archetype.color,
        locked: false,
        isOnTable: true,
        zIndex: maxZ + 1,
        archetypeId: archetype.id,
      };

      // Increment spawn count on archetype
      const updatedArchetype = {
        ...archetype,
        spawnCount: currentCount + 1
      };

      // Add to general history
      const historyEntry: GeneralHistoryEntry = {
        type: 'token-spawned',
        objectId: tokenId,
        archetypeId: archetype.id,
        archetypePreviousSpawnCount: currentCount,
      };
      const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

      return {
        ...state,
        objects: {
          ...state.objects,
          [archetype.id]: updatedArchetype,
          [tokenId]: newToken,
        },
        undo: { ...state.undo, generalHistory: newGeneralHistory },
      };
    }
    case 'CREATE_DRAWING_OBJECT': {
      const { strokes, x, y, width, height, name, opacity } = action.payload;

      // Calculate bounds from strokes
      const drawingId = `drawing-${Date.now()}`;
      const drawing: Drawing = {
        id: drawingId,
        type: ItemType.DRAWING,
        x,
        y,
        rotation: 0,
        width,
        height,
        content: '',
        name: name || `Drawing ${Object.keys(state.objects).length + 1}`,
        locked: false,
        isOnTable: true,
        strokes,
        bounds: { x: 0, y: 0, width, height },
        opacity,
      };

      // Add to marker history (max 10)
      const historyEntry: MarkerHistoryEntry = {
        type: 'drawing-created',
        drawingId,
        drawing,
      };
      const newMarkerHistory = [...state.undo.markerHistory, historyEntry].slice(-10);

      return {
        ...state,
        objects: {
          ...state.objects,
          [drawingId]: drawing,
        },
        undo: {
          ...state.undo,
          markerHistory: newMarkerHistory,
        },
      };
    }
    case 'ADD_STROKE_TO_DRAWING': {
      const { drawingId, stroke } = action.payload;
      const drawing = state.objects[drawingId];
      if (!drawing || drawing.type !== ItemType.DRAWING) return state;

      // Add to marker history (max 10)
      const historyEntry: MarkerHistoryEntry = {
        type: 'stroke-added',
        drawingId,
        strokeId: stroke.id,
        stroke,
      };
      const newMarkerHistory = [...state.undo.markerHistory, historyEntry].slice(-10);

      return {
        ...state,
        objects: {
          ...state.objects,
          [drawingId]: {
            ...drawing,
            strokes: [...drawing.strokes, stroke],
          },
        },
        undo: {
          ...state.undo,
          markerHistory: newMarkerHistory,
        },
      };
    }
    case 'MERGE_DRAWINGS': {
      const { sourceId, targetId } = action.payload;
      const sourceDrawing = state.objects[sourceId];
      const targetDrawing = state.objects[targetId];

      if (!sourceDrawing || !targetDrawing ||
          sourceDrawing.type !== ItemType.DRAWING ||
          targetDrawing.type !== ItemType.DRAWING) {
        return state;
      }

      // Store target before merge for undo
      const targetBeforeMerge = { ...targetDrawing as Drawing };

      // Merge strokes from source into target
      const mergedDrawing: Drawing = {
        ...targetDrawing,
        strokes: [...targetDrawing.strokes, ...sourceDrawing.strokes],
      };

      // Remove source drawing
      const { [sourceId]: removed, ...remainingObjects } = state.objects;

      // Add to marker history (max 10)
      const historyEntry: MarkerHistoryEntry = {
        type: 'drawings-merged',
        mergedIntoId: targetId,
        sourceDrawings: [sourceDrawing as Drawing],
        targetDrawingBeforeMerge: targetBeforeMerge,
      };
      const newMarkerHistory = [...state.undo.markerHistory, historyEntry].slice(-10);

      return {
        ...state,
        objects: {
          ...remainingObjects,
          [targetId]: mergedDrawing,
        },
        undo: {
          ...state.undo,
          markerHistory: newMarkerHistory,
        },
      };
    }
    case 'ADD_STROKE': {
      const { stroke, layerId } = action.payload;
      const layer = state.drawings.layers.find(l => l.id === layerId);
      if (!layer) return state;

      return {
        ...state,
        drawings: {
          ...state.drawings,
          layers: state.drawings.layers.map(l =>
            l.id === layerId
              ? { ...l, strokes: [...l.strokes, stroke] }
              : l
          )
        }
      };
    }
    case 'DELETE_STROKE': {
      const { strokeId, layerId } = action.payload;
      return {
        ...state,
        drawings: {
          ...state.drawings,
          layers: state.drawings.layers.map(l =>
            l.id === layerId
              ? { ...l, strokes: l.strokes.filter(s => s.id !== strokeId) }
              : l
          )
        }
      };
    }
    case 'CREATE_DRAWING_LAYER': {
      const newLayer: DrawingLayer = {
        id: generateUUID(),
        ...action.payload
      };

      return {
        ...state,
        drawings: {
          ...state.drawings,
          layers: [...state.drawings.layers, newLayer]
        }
      };
    }
    case 'DELETE_DRAWING_LAYER': {
      return {
        ...state,
        drawings: {
          ...state.drawings,
          layers: state.drawings.layers.filter(l => l.id !== action.payload.layerId)
        }
      };
    }
    case 'UPDATE_DRAWING_LAYER': {
      const { layerId, updates } = action.payload;

      return {
        ...state,
        drawings: {
          ...state.drawings,
          layers: state.drawings.layers.map(l =>
            l.id === layerId ? { ...l, ...updates } : l
          )
        }
      };
    }
    case 'CLEAR_DRAWING_LAYER': {
      return {
        ...state,
        drawings: {
          ...state.drawings,
          layers: state.drawings.layers.map(l =>
            l.id === action.payload.layerId
              ? { ...l, strokes: [] }
              : l
          )
        }
      };
    }
    case 'UNDO_MARKER': {
      if (state.undo.markerHistory.length === 0) return state;

      const lastEntry = state.undo.markerHistory[state.undo.markerHistory.length - 1];
      const newHistory = state.undo.markerHistory.slice(0, -1);

      switch (lastEntry.type) {
        case 'drawing-created': {
          // Delete the drawing
          const { [lastEntry.drawingId]: removed, ...remainingObjects } = state.objects;
          return {
            ...state,
            objects: remainingObjects,
            undo: { ...state.undo, markerHistory: newHistory },
          };
        }
        case 'stroke-added': {
          // Remove the stroke from the drawing
          const drawing = state.objects[lastEntry.drawingId];
          if (!drawing || drawing.type !== ItemType.DRAWING) return state;
          return {
            ...state,
            objects: {
              ...state.objects,
              [lastEntry.drawingId]: {
                ...drawing,
                strokes: drawing.strokes.filter(s => s.id !== lastEntry.strokeId),
              },
            },
            undo: { ...state.undo, markerHistory: newHistory },
          };
        }
        case 'drawing-deleted': {
          // Restore the drawing
          return {
            ...state,
            objects: {
              ...state.objects,
              [lastEntry.drawing.id]: lastEntry.drawing,
            },
            undo: { ...state.undo, markerHistory: newHistory },
          };
        }
        case 'drawings-merged': {
          // Unmerge: delete the merged drawing, restore all source drawings and restore target to previous state
          const { [lastEntry.mergedIntoId]: mergedRemoved, ...remainingObjects } = state.objects;
          let restoredObjects = { ...remainingObjects };

          // Restore all source drawings
          for (const drawing of lastEntry.sourceDrawings) {
            restoredObjects[drawing.id] = drawing;
          }

          // Restore target to previous state
          restoredObjects[lastEntry.targetDrawingBeforeMerge.id] = lastEntry.targetDrawingBeforeMerge;

          return {
            ...state,
            objects: restoredObjects,
            undo: { ...state.undo, markerHistory: newHistory },
          };
        }
        default:
          return state;
      }
    }
    case 'UNDO_GENERAL': {
      if (state.undo.generalHistory.length === 0) return state;

      const lastEntry = state.undo.generalHistory[state.undo.generalHistory.length - 1];
      const newHistory = state.undo.generalHistory.slice(0, -1);

      switch (lastEntry.type) {
        case 'object-added': {
          // Delete the object
          const { [lastEntry.objectId]: removed, ...remainingObjects } = state.objects;
          return {
            ...state,
            objects: remainingObjects,
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'object-deleted': {
          // Restore the object and any cascaded deletes
          const restoredObjects = { ...state.objects, [lastEntry.objectId]: lastEntry.object };
          if (lastEntry.cascadedDeletes) {
            for (const obj of lastEntry.cascadedDeletes) {
              restoredObjects[obj.id] = obj;
            }
          }
          return {
            ...state,
            objects: restoredObjects,
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'object-moved': {
          const obj = state.objects[lastEntry.objectId];
          if (!obj) return state;
          return {
            ...state,
            objects: {
              ...state.objects,
              [lastEntry.objectId]: { ...obj, x: lastEntry.previousX, y: lastEntry.previousY },
            },
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'object-updated': {
          const obj = state.objects[lastEntry.objectId];
          if (!obj) return state;
          return {
            ...state,
            objects: {
              ...state.objects,
              [lastEntry.objectId]: { ...obj, ...lastEntry.previousValues },
            } as Record<string, TableObject>,
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'object-rotated': {
          const obj = state.objects[lastEntry.objectId];
          if (!obj) return state;
          return {
            ...state,
            objects: {
              ...state.objects,
              [lastEntry.objectId]: { ...obj, rotation: lastEntry.previousRotation },
            },
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'object-lock-toggled': {
          const obj = state.objects[lastEntry.objectId];
          if (!obj) return state;
          return {
            ...state,
            objects: {
              ...state.objects,
              [lastEntry.objectId]: { ...obj, locked: lastEntry.previousLocked },
            },
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'object-on-table-toggled': {
          const obj = state.objects[lastEntry.objectId];
          if (!obj) return state;
          return {
            ...state,
            objects: {
              ...state.objects,
              [lastEntry.objectId]: { ...obj, isOnTable: lastEntry.previousIsOnTable },
            } as Record<string, TableObject>,
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'object-layer-changed': {
          const obj = state.objects[lastEntry.objectId];
          if (!obj) return state;

          // Restore previous zIndex values for both objects
          const updatedObjects: Record<string, TableObject> = {
            ...state.objects,
            [lastEntry.objectId]: { ...obj, zIndex: lastEntry.previousZIndex ?? obj.zIndex },
          };

          if (lastEntry.otherObjectId && lastEntry.otherObjectPreviousZIndex !== undefined) {
            const otherObj = state.objects[lastEntry.otherObjectId];
            if (otherObj) {
              updatedObjects[lastEntry.otherObjectId] = { ...otherObj, zIndex: lastEntry.otherObjectPreviousZIndex };
            }
          }

          return {
            ...state,
            objects: updatedObjects,
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'counter-updated': {
          const counter = state.objects[lastEntry.objectId] as Counter;
          if (!counter || counter.type !== ItemType.COUNTER) return state;
          return {
            ...state,
            objects: {
              ...state.objects,
              [lastEntry.objectId]: { ...counter, value: lastEntry.previousValue },
            },
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'object-pinned': {
          const obj = state.objects[lastEntry.objectId];
          if (!obj) return state;
          const updatedObj: any = { ...obj };
          if (lastEntry.previousPinnedToViewport !== undefined) {
            updatedObj.isPinnedToViewport = lastEntry.previousPinnedToViewport;
          } else {
            delete updatedObj.isPinnedToViewport;
          }
          if (lastEntry.previousScreenPosition !== undefined) {
            updatedObj.pinnedScreenPosition = lastEntry.previousScreenPosition;
          } else {
            delete updatedObj.pinnedScreenPosition;
          }
          return {
            ...state,
            objects: {
              ...state.objects,
              [lastEntry.objectId]: updatedObj,
            },
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'object-unpinned': {
          const obj = state.objects[lastEntry.objectId];
          if (!obj) return state;
          return {
            ...state,
            objects: {
              ...state.objects,
              [lastEntry.objectId]: {
                ...obj,
                x: lastEntry.previousX,
                y: lastEntry.previousY,
                isPinnedToViewport: lastEntry.previousPinnedToViewport,
                ...(lastEntry.previousScreenPosition && { pinnedScreenPosition: lastEntry.previousScreenPosition }),
              } as any,
            },
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'token-spawned': {
          // Delete the spawned token
          const { [lastEntry.objectId]: removed, ...remainingObjects } = state.objects;

          // Also restore archetype's spawn count
          if (lastEntry.archetypePreviousSpawnCount !== undefined) {
            const archetype = remainingObjects[lastEntry.archetypeId] as TokenType;
            if (archetype && archetype.type === ItemType.TOKEN_TYPE) {
              remainingObjects[lastEntry.archetypeId] = {
                ...archetype,
                spawnCount: lastEntry.archetypePreviousSpawnCount,
              };
            }
          }

          return {
            ...state,
            objects: remainingObjects,
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'card-flipped': {
          const card = state.objects[lastEntry.cardId];
          if (!card || card.type !== ItemType.CARD) return state;
          return {
            ...state,
            objects: {
              ...state.objects,
              [lastEntry.cardId]: { ...card, faceUp: lastEntry.previousFaceUp },
            },
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'card-drawn': {
          const card = state.objects[lastEntry.cardId];
          const deck = state.objects[lastEntry.fromDeckId];
          if (!card || !deck || deck.type !== ItemType.DECK) return state;

          // Remove card from deck's cardIds and insert at previous position
          const newCardIds = [...deck.cardIds];
          newCardIds.splice(lastEntry.fromIndex, 0, lastEntry.cardId);

          // Update card location and position
          return {
            ...state,
            objects: {
              ...state.objects,
              [lastEntry.cardId]: {
                ...card,
                location: lastEntry.previousLocation,
              },
              [lastEntry.fromDeckId]: {
                ...deck,
                cardIds: newCardIds,
              },
            } as Record<string, TableObject>,
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'card-played': {
          const card = state.objects[lastEntry.cardId];
          if (!card || card.type !== ItemType.CARD) return state;

          return {
            ...state,
            objects: {
              ...state.objects,
              [lastEntry.cardId]: {
                ...card,
                location: lastEntry.previousLocation,
                x: lastEntry.previousX ?? card.x,
                y: lastEntry.previousY ?? card.y,
                faceUp: lastEntry.previousFaceUp ?? card.faceUp,
              },
            },
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'card-played-from-top': {
          const card = state.objects[lastEntry.cardId] as Card;
          const deck = state.objects[lastEntry.deckId] as Deck;
          if (!card || !deck || deck.type !== ItemType.DECK) return state;

          return {
            ...state,
            objects: {
              ...state.objects,
              [lastEntry.deckId]: {
                ...deck,
                cardIds: lastEntry.previousCardIds,
              },
              [lastEntry.cardId]: {
                ...card,
                location: lastEntry.previousLocation,
                faceUp: lastEntry.previousFaceUp,
                isOnTable: lastEntry.previousLocation !== CardLocation.CURSOR_SLOT,
              },
            },
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'dropped-from-cursor-slot': {
          const obj = state.objects[lastEntry.objectId];
          if (!obj) return state;

          return {
            ...state,
            objects: {
              ...state.objects,
              [lastEntry.objectId]: {
                ...obj,
                x: lastEntry.previousX ?? obj.x,
                y: lastEntry.previousY ?? obj.y,
                ...(lastEntry.previousZIndex !== undefined && { zIndex: lastEntry.previousZIndex }),
                ...(lastEntry.previousInCursorSlot !== undefined && { inCursorSlot: lastEntry.previousInCursorSlot }),
                // For cards, restore previous location
                ...(obj.type === ItemType.CARD && {
                  location: lastEntry.previousLocation,
                  isOnTable: lastEntry.previousLocation === CardLocation.TABLE,
                }),
              },
            },
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'card-returned-to-deck': {
          const card = state.objects[lastEntry.cardId];
          const deck = state.objects[lastEntry.deckId];
          if (!card || !deck || deck.type !== ItemType.DECK) return state;

          // Remove from deck's cardIds
          const newCardIds = deck.cardIds.filter(id => id !== lastEntry.cardId);

          return {
            ...state,
            objects: {
              ...state.objects,
              [lastEntry.cardId]: {
                ...card,
                location: lastEntry.previousLocation,
                x: lastEntry.previousX ?? card.x,
                y: lastEntry.previousY ?? card.y,
              },
              [lastEntry.deckId]: {
                ...deck,
                cardIds: newCardIds,
              },
            } as Record<string, TableObject>,
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'deck-shuffled': {
          const deck = state.objects[lastEntry.deckId];
          if (!deck || deck.type !== ItemType.DECK) return state;

          return {
            ...state,
            objects: {
              ...state.objects,
              [lastEntry.deckId]: {
                ...deck,
                cardIds: lastEntry.previousCardOrder,
              },
            },
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'card-added-to-pile': {
          const card = state.objects[lastEntry.cardId] as Card;
          const deck = state.objects[lastEntry.deckId] as Deck;
          if (!card || !deck || deck.type !== ItemType.DECK) return state;

          // Restore card's location and deck/pile state
          const updatedCard: Card = {
            ...card,
            location: lastEntry.previousLocation,
            ...(lastEntry.previousX !== undefined && { x: lastEntry.previousX }),
            ...(lastEntry.previousY !== undefined && { y: lastEntry.previousY }),
          };

          const newObjects: Record<string, TableObject> = {
            ...state.objects,
            [lastEntry.cardId]: updatedCard,
          };

          // Restore deck cardIds if they were changed
          if (lastEntry.previousDeckCardIds) {
            newObjects[lastEntry.deckId] = {
              ...deck,
              cardIds: lastEntry.previousDeckCardIds,
            };
          }

          // Restore pile cardIds
          if (lastEntry.previousPileCardIds) {
            const updatedPiles = deck.piles?.map(p =>
              p.id === lastEntry.pileId
                ? { ...p, cardIds: lastEntry.previousPileCardIds }
                : p
            ) as CardPile[] | undefined;
            newObjects[lastEntry.deckId] = {
              ...(newObjects[lastEntry.deckId] as Deck),
              piles: updatedPiles || deck.piles,
            } as TableObject;
          }

          return {
            ...state,
            objects: newObjects as Record<string, TableObject>,
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'card-drawn-from-pile': {
          const card = state.objects[lastEntry.cardId] as Card;
          const deck = state.objects[lastEntry.deckId] as Deck;
          if (!card || !deck || deck.type !== ItemType.DECK) return state;

          // Find the pile
          const pile = deck.piles?.find(p => p.id === lastEntry.pileId);
          if (!pile) return state;

          // Restore card to pile
          const restoredPileCardIds = [...pile.cardIds];
          restoredPileCardIds.splice(lastEntry.fromIndex, 0, lastEntry.cardId);

          const updatedPiles = deck.piles?.map(p =>
            p.id === lastEntry.pileId
              ? { ...p, cardIds: restoredPileCardIds }
              : p
          ) as CardPile[] | undefined;

          // Update card location
          const updatedCard: Card = {
            ...card,
            location: lastEntry.previousLocation,
          };

          return {
            ...state,
            objects: {
              ...state.objects,
              [lastEntry.deckId]: { ...deck, piles: updatedPiles } as TableObject,
              [lastEntry.cardId]: updatedCard,
            },
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'card-returned-to-top': {
          const card = state.objects[lastEntry.cardId] as Card;
          const toDeck = state.objects[lastEntry.toDeckId] as Deck;
          if (!card || !toDeck || toDeck.type !== ItemType.DECK) return state;

          const newObjects: Record<string, TableObject> = { ...state.objects };

          // Restore card's location and properties
          const updatedCard: Card = {
            ...card,
            location: lastEntry.previousLocation,
            ...(lastEntry.previousX !== undefined && { x: lastEntry.previousX }),
            ...(lastEntry.previousY !== undefined && { y: lastEntry.previousY }),
            ...(lastEntry.previousFaceUp !== undefined && { faceUp: lastEntry.previousFaceUp }),
          };
          newObjects[lastEntry.cardId] = updatedCard;

          // Restore toDeck cardIds
          if (lastEntry.toCardIds) {
            newObjects[lastEntry.toDeckId] = {
              ...toDeck,
              cardIds: lastEntry.toCardIds,
            };
          }

          // Restore fromDeck cardIds if different from toDeck
          if (lastEntry.fromDeckId && lastEntry.fromDeckId !== lastEntry.toDeckId && lastEntry.fromCardIds) {
            const fromDeck = state.objects[lastEntry.fromDeckId] as Deck;
            if (fromDeck) {
              newObjects[lastEntry.fromDeckId] = {
                ...fromDeck,
                cardIds: lastEntry.fromCardIds,
              };
            }
          }

          // Restore fromPile cardIds
          if (lastEntry.fromPileId && lastEntry.fromPileCardIds) {
            const fromDeck = state.objects[lastEntry.fromDeckId] as Deck;
            if (fromDeck?.piles) {
              const updatedPiles = fromDeck.piles.map(p =>
                p.id === lastEntry.fromPileId
                  ? { ...p, cardIds: lastEntry.fromPileCardIds }
                  : p
              ) as CardPile[];
              newObjects[lastEntry.fromDeckId] = {
                ...fromDeck,
                piles: updatedPiles,
              };
            }
          }

          return {
            ...state,
            objects: newObjects,
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'card-returned-to-bottom': {
          const card = state.objects[lastEntry.cardId] as Card;
          const toDeck = state.objects[lastEntry.toDeckId] as Deck;
          if (!card || !toDeck || toDeck.type !== ItemType.DECK) return state;

          const newObjects: Record<string, TableObject> = { ...state.objects };

          // Restore card's location and properties
          const updatedCard: Card = {
            ...card,
            location: lastEntry.previousLocation,
            ...(lastEntry.previousX !== undefined && { x: lastEntry.previousX }),
            ...(lastEntry.previousY !== undefined && { y: lastEntry.previousY }),
            ...(lastEntry.previousFaceUp !== undefined && { faceUp: lastEntry.previousFaceUp }),
          };
          newObjects[lastEntry.cardId] = updatedCard;

          // Restore toDeck cardIds
          if (lastEntry.toCardIds) {
            newObjects[lastEntry.toDeckId] = {
              ...toDeck,
              cardIds: lastEntry.toCardIds,
            };
          }

          // Restore fromDeck cardIds if different from toDeck
          if (lastEntry.fromDeckId && lastEntry.fromDeckId !== lastEntry.toDeckId && lastEntry.fromCardIds) {
            const fromDeck = state.objects[lastEntry.fromDeckId] as Deck;
            if (fromDeck) {
              newObjects[lastEntry.fromDeckId] = {
                ...fromDeck,
                cardIds: lastEntry.fromCardIds,
              };
            }
          }

          // Restore fromPile cardIds
          if (lastEntry.fromPileId && lastEntry.fromPileCardIds) {
            const fromDeck = state.objects[lastEntry.fromDeckId] as Deck;
            if (fromDeck?.piles) {
              const updatedPiles = fromDeck.piles.map(p =>
                p.id === lastEntry.fromPileId
                  ? { ...p, cardIds: lastEntry.fromPileCardIds }
                  : p
              ) as CardPile[];
              newObjects[lastEntry.fromDeckId] = {
                ...fromDeck,
                piles: updatedPiles,
              };
            }
          }

          return {
            ...state,
            objects: newObjects,
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'card-added-to-top': {
          const card = state.objects[lastEntry.cardId] as Card;
          const toDeck = state.objects[lastEntry.toDeckId] as Deck;
          if (!card || !toDeck || toDeck.type !== ItemType.DECK) return state;

          const newObjects: Record<string, TableObject> = { ...state.objects };

          // Restore card's location and properties
          const updatedCard: Card = {
            ...card,
            location: lastEntry.previousLocation,
            ...(lastEntry.previousX !== undefined && { x: lastEntry.previousX }),
            ...(lastEntry.previousY !== undefined && { y: lastEntry.previousY }),
            ...(lastEntry.previousFaceUp !== undefined && { faceUp: lastEntry.previousFaceUp }),
          };
          newObjects[lastEntry.cardId] = updatedCard;

          // Restore toDeck cardIds
          if (lastEntry.toCardIds) {
            newObjects[lastEntry.toDeckId] = {
              ...toDeck,
              cardIds: lastEntry.toCardIds,
            };
          }

          // Restore fromDeck cardIds if different from toDeck
          if (lastEntry.fromDeckId && lastEntry.fromDeckId !== lastEntry.toDeckId && lastEntry.fromCardIds) {
            const fromDeck = state.objects[lastEntry.fromDeckId] as Deck;
            if (fromDeck) {
              newObjects[lastEntry.fromDeckId] = {
                ...fromDeck,
                cardIds: lastEntry.fromCardIds,
              };
            }
          }

          return {
            ...state,
            objects: newObjects,
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'card-milled-to-bottom': {
          const deck = state.objects[lastEntry.deckId] as Deck;
          if (!deck || deck.type !== ItemType.DECK) return state;

          return {
            ...state,
            objects: {
              ...state.objects,
              [lastEntry.deckId]: {
                ...deck,
                cardIds: lastEntry.previousCardIds,
              },
            },
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'card-milled-to-pile': {
          const deck = state.objects[lastEntry.deckId] as Deck;
          if (!deck || deck.type !== ItemType.DECK) return state;

          const updatedPiles = deck.piles?.map(p =>
            p.id === lastEntry.pileId
              ? { ...p, cardIds: lastEntry.previousPileCardIds }
              : p
          );

          return {
            ...state,
            objects: {
              ...state.objects,
              [lastEntry.deckId]: {
                ...deck,
                cardIds: lastEntry.previousDeckCardIds,
                piles: updatedPiles,
              },
            },
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        default:
          return state;
      }
    }
    case 'CLEAR_SAVED_STATE': {
      // Clear the saved state from localStorage
      clearStorageGameState();
      return state;
    }
    default:
      return state;
  }
};

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, localDispatch] = useReducer(gameReducer, initialState);
  const [isHost, setIsHost] = useState(true);
  const [peerId, setPeerId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [waitingForPlayerName, setWaitingForPlayerName] = useState<{ hostId: string } | null>(null);

  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<any[]>([]); // For Host: list of guest connections
  const hostConnectionRef = useRef<any>(null); // For Guest: connection to host

  // Ref to track latest state for event listeners
  const stateRef = useRef(state);
  const initializedRef = useRef(false);

  useEffect(() => {
      stateRef.current = state;
  }, [state]);

  // Auto-save game state to localStorage (debounced)
  useEffect(() => {
    // Don't save if we're a guest (state comes from host)
    if (!isHost) return;

    const timeoutId = setTimeout(() => {
      saveGameState(state);
    }, 500); // Debounce: save 500ms after last state change

    return () => clearTimeout(timeoutId);
  }, [state, isHost]);

  // Initialize Default Board and Standard Deck (or load from storage)
  useEffect(() => {
    // Only initialize once we're sure about host status and haven't initialized yet
    if (!initializedRef.current && isHost && Object.keys(state.objects).length === 0) {
        initializedRef.current = true;

        // Try to load saved game state from localStorage
        const savedState = loadGameState();
        if (savedState && savedState.objects && Object.keys(savedState.objects).length > 0) {
          console.log('Restoring game state from localStorage');

          // Create a batch of updates to restore all state
          const updates: any[] = [];

          // Load all saved objects
          Object.values(savedState.objects).forEach(obj => {
            updates.push({ type: 'ADD_OBJECT', payload: obj });
          });

          // Restore drawings
          if (savedState.drawings) {
            updates.push({ type: 'SYNC_STATE', payload: { drawings: savedState.drawings } });
          }

          // Restore player permissions
          if (savedState.playerPermissions) {
            updates.push({ type: 'UPDATE_PLAYER_PERMISSIONS', payload: savedState.playerPermissions });
          }

          // Restore language
          if (savedState.language) {
            updates.push({ type: 'UPDATE_LANGUAGE', payload: savedState.language });
          }

          // Restore active player ID if different
          if (savedState.activePlayerId && savedState.activePlayerId !== state.activePlayerId) {
            updates.push({ type: 'SET_ACTIVE_ID', payload: savedState.activePlayerId });
          }

          // Restore view transform (zoom/pan)
          if (savedState.viewTransform) {
            updates.push({ type: 'UPDATE_VIEW_TRANSFORM', payload: savedState.viewTransform });
          }

          // Restore players (merge with default players)
          if (savedState.players && savedState.players.length > 0) {
            const currentPlayers = state.players || [];
            savedState.players.forEach(player => {
              // Only add players that don't already exist (don't overwrite GM)
              if (player.id !== 'gm' && player.id !== 'gm-player' &&
                  !currentPlayers.find(p => p.id === player.id)) {
                updates.push({ type: 'ADD_PLAYER', payload: player });
              }
            });
          }

          // Apply all updates in a single batch
          updates.forEach(update => localDispatch(update));

          return;
        }

        // No saved state or empty saved state, create default game board
        // Create game board
        const boardId = 'demo-board';
        const board: Board = {
             id: boardId,
             type: ItemType.BOARD,
             shape: TokenShape.SQUARE,
             x: 100, y: 100,
             width: 800, height: 600,
             rotation: 0,
             name: 'Game Board',
             content: '',
             color: '#34495e',
             locked: true,
             isOnTable: true,
             gridType: GridType.HEX,
             gridSize: 60,
             snapToGrid: true,
        };
        localDispatch({ type: 'ADD_OBJECT', payload: board });

        // Create Standard Deck positioned offset from center of screen
        // Calculate world coordinates based on default viewport settings
        const screenX = window.innerWidth - 460;
        const screenY = 15;
        const zoom = 1; // Default zoom (no scaling)
        const offsetX = 0; // Default offset
        const offsetY = 0; // Default offset
        const worldX = (screenX - offsetX) / zoom;
        const worldY = (screenY - offsetY) / zoom;
        const { deck, cards } = createStandardDeck();

        deck.x = worldX;
        deck.y = worldY;

        // Add all cards first
        cards.forEach(card => localDispatch({ type: 'ADD_OBJECT', payload: card }));
        // Then add the deck
        localDispatch({ type: 'ADD_OBJECT', payload: deck });

        // Create Main Menu panel in the unified space
        // Position slightly to the left to account for scrollbar
        const mainMenuX = window.innerWidth - MAIN_MENU_WIDTH - SCROLLBAR_WIDTH;
        const mainMenuY = 0;
        localDispatch({
            type: 'CREATE_PANEL',
            payload: {
                panelType: PanelType.MAIN_MENU,
                x: mainMenuX,
                y: mainMenuY,
                width: MAIN_MENU_WIDTH,
                height: window.innerHeight - SCROLLBAR_WIDTH,
                title: 'Main Menu'
            }
        });
    }
  }, [isHost, connectionStatus]); // Add connectionStatus to ensure peer is ready

  // PEERJS SETUP
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hostIdToJoin = params.get('hostId');

    // Cleanup previous peer if exists (React StrictMode double render handling)
    if (peerRef.current) return;

    // If we have a hostId in URL, show modal for player name first
    // Don't create peer yet - wait for player name
    if (hostIdToJoin) {
      setWaitingForPlayerName({ hostId: hostIdToJoin });
      return;
    }

    // No hostId - we are host, create peer immediately
    const peer = new Peer();
    peerRef.current = peer;

    peer.on('open', (id) => {
      setPeerId(id);
      setIsHost(true);
      setConnectionStatus('connected');
    });

    // Handle incoming connections (If we are Host)
    peer.on('connection', (conn) => {
      conn.on('open', () => {
        connectionsRef.current.push(conn);

        // Send current state to new player, using REF to get latest state
        conn.send({ type: 'SYNC_STATE', payload: stateRef.current });

        // Listen for data from this guest
        conn.on('data', (data: any) => {
          handleNetworkData(data, conn);
        });

        // Handle Disconnection
        conn.on('close', () => {
          connectionsRef.current = connectionsRef.current.filter(c => c !== conn);
          localDispatch({ type: 'REMOVE_PLAYER', payload: { id: conn.peer } });
        });

        conn.on('error', (err) => {
          console.error('Connection error with guest:', err);
          connectionsRef.current = connectionsRef.current.filter(c => c !== conn);
          localDispatch({ type: 'REMOVE_PLAYER', payload: { id: conn.peer } });
        });
      });
    });

    peer.on('error', (err) => {
      console.error('Peer error:', err);
      setConnectionStatus('disconnected');
    });

    // Cleanup logic to destroy peer on window close/reload to notify others
    const handleUnload = () => {
      if (peerRef.current) {
        peerRef.current.destroy();
      }
    };
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, []);

  // Connect to Host Logic (Guest Side) - called after player enters name
  const connectToHost = (hostId: string, playerName: string) => {
    const peer = new Peer();
    peerRef.current = peer;

    peer.on('open', (id) => {
      setPeerId(id);
      setIsHost(false);
      setConnectionStatus('connecting');

      const conn = peer.connect(hostId);
      hostConnectionRef.current = conn;

      conn.on('open', () => {
        setConnectionStatus('connected');

        const myPlayer: Player = {
          id: peer.id,
          name: playerName.trim() || `Player ${Math.floor(Math.random() * 100)}`,
          color: '#' + Math.floor(Math.random() * 16777215).toString(16),
          isGM: false
        };

        // Add ourselves locally
        localDispatch({ type: 'ADD_PLAYER', payload: myPlayer });
        localDispatch({ type: 'SET_ACTIVE_ID', payload: myPlayer.id });

        // Tell Host we are here
        conn.send({ type: 'HELO', payload: myPlayer });
      });

      conn.on('data', (data: any) => {
        handleNetworkData(data, null);
      });

      conn.on('close', () => {
        alert("Connection to Host lost");
        setConnectionStatus('disconnected');
        setWaitingForPlayerName(null);
      });

      conn.on('error', (err) => {
        console.error("Connection error to host:", err);
        alert("Failed to connect to host");
        setConnectionStatus('disconnected');
        setWaitingForPlayerName(null);
      });
    });

    peer.on('error', (err) => {
      console.error('Peer error:', err);
      alert("Failed to connect to peer server");
      setConnectionStatus('disconnected');
      setWaitingForPlayerName(null);
    });
  };

  // Handler for when player submits their name via modal (joining a game)
  const setPlayerName = useCallback((name: string) => {
    if (!waitingForPlayerName) return;

    const { hostId } = waitingForPlayerName;
    setWaitingForPlayerName(null);
    connectToHost(hostId, name.trim() || `Player ${Math.floor(Math.random() * 100)}`);
  }, [waitingForPlayerName]);

  // Central Network Data Handler
  const handleNetworkData = (data: any, senderConn: any) => {
      if (data.type === 'SYNC_STATE') {
          // Received full state update (Guest receives from Host)
          // We apply it, but ensure we don't lose our local identity perspective
          localDispatch({ type: 'SYNC_STATE', payload: data.payload });
      }
      else if (data.type === 'HELO') {
          // Host received new player info
          const newPlayer = data.payload;
          localDispatch({ type: 'ADD_PLAYER', payload: newPlayer });
      }
      else if (data.type === 'UPDATE_PLAYER_NAME') {
          // Host received player name update request
          localDispatch(data.payload); // Execute locally on Host
          // The useEffect below will trigger broadcast of resulting state
      }
      else if (data.type === 'ACTION') {
          // Host received action request from Guest
          localDispatch(data.payload); // Execute locally on Host
          // The useEffect below will trigger broadcast of resulting state
      }
  };

  // Middleware Dispatcher - memoized with useCallback to prevent infinite loops
  const dispatch = useCallback((action: Action) => {
      // Local-only actions are executed locally but never sent over network
      if (action._localOnly) {
          localDispatch(action);
          return;
      }

      if (isHost) {
          // Host executes locally
          localDispatch(action);
          // State broadcast handled by useEffect to ensure updated state is sent
      } else {
          // Guest sends action to Host
          if (hostConnectionRef.current && connectionStatus === 'connected') {
              // UPDATE_PLAYER_NAME is sent as a separate message type for clarity
              if (action.type === 'UPDATE_PLAYER_NAME') {
                  hostConnectionRef.current.send({ type: 'UPDATE_PLAYER_NAME', payload: action });
                  // Optimistic update for immediate feedback
                  localDispatch(action);
              } else if (action.type === 'MOVE_OBJECT_COMMIT' || action.type === 'FINISH_DRAWING_STROKE') {
                  // Commit actions are sent to host, applied locally after host broadcasts
                  hostConnectionRef.current.send({ type: 'ACTION', payload: action });
              } else if (action.type === 'CREATE_DRAWING_OBJECT' || action.type === 'ADD_STROKE_TO_DRAWING' || action.type === 'MERGE_DRAWINGS') {
                  // Drawing actions are sent to host
                  hostConnectionRef.current.send({ type: 'ACTION', payload: action });
                  // Wait for sync to avoid desync
              } else {
                  hostConnectionRef.current.send({ type: 'ACTION', payload: action });
                  // Wait for sync to avoid desync
              }
          }
      }
  }, [isHost, connectionStatus]);

  // Host Broadcast Loop: whenever state changes, send to all guests
  // We use a debounce or throttle in a real app, here we just check if meaningful change occurred
  useEffect(() => {
      if (isHost && connectionsRef.current.length > 0) {
          // Filter out local windows before broadcasting
          const stateForBroadcast = (() => {
              const filteredObjects: Record<string, TableObject> = {};
              Object.entries(state.objects).forEach(([id, obj]) => {
                  // Skip windows with ownerId (they are local to the owner)
                  if (obj.type === ItemType.WINDOW && (obj as WindowObject).ownerId) {
                      return;
                  }
                  filteredObjects[id] = obj;
              });
              return { ...state, objects: filteredObjects };
          })();

          // Broadcast new state
          connectionsRef.current.forEach(conn => {
              if (conn.open) {
                  conn.send({ type: 'SYNC_STATE', payload: stateForBroadcast });
              }
          });
      }
  }, [state, isHost]);

  return (
    <GameContext.Provider value={{ state, dispatch, isHost, peerId, connectionStatus, waitingForPlayerName, setPlayerName }}>
      {children}
      <PlayerNameModal
        isOpen={waitingForPlayerName !== null}
        onSubmit={setPlayerName}
        defaultName="Player"
        title="Join Game"
      />
    </GameContext.Provider>
  );
};

export const useGame = () => {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGame must be used within a GameProvider');
  return context;
};