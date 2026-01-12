import React, { createContext, useContext, useReducer, useEffect, useState, useRef, useCallback } from 'react';
import { GameItem, Player, ItemType, TableObject, CardLocation, Card, Deck, Token, DiceRoll, ContextAction, DiceObject, Counter, TokenShape, CardShape, GridType, CardPile, PanelType, WindowType, PanelObject, WindowObject, Board, Randomizer } from '../types';
import { CARD_WIDTH, CARD_HEIGHT, CARD_SHAPE_DIMS, MAIN_MENU_WIDTH, SCROLLBAR_WIDTH, DEFAULT_PANEL_WIDTH, DEFAULT_PANEL_HEIGHT } from '../constants';
import { Peer } from 'peerjs';

// Helper for safe ID generation
const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try {
      return crypto.randomUUID();
    } catch (e) {}
  }
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

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
    cardIds,
    locked: false,
    isOnTable: true,
    allowedActions: ['draw', 'shuffleDeck', 'playTopCard', 'searchDeck', 'returnAll'],
    actionButtons: ['draw', 'playTopCard', 'shuffleDeck', 'searchDeck'],
    cardShape: defaultShape,
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
}

export interface GameState {
  objects: Record<string, TableObject>;
  players: Player[];
  activePlayerId: string; // The user's current identity
  diceRolls: DiceRoll[];
  viewTransform: ViewTransform;
}

type Action =
  | { type: 'ADD_OBJECT'; payload: TableObject }
  | { type: 'UPDATE_OBJECT'; payload: Partial<TableObject> & { id: string } }
  | { type: 'MOVE_OBJECT'; payload: { id: string; x: number; y: number } }
  | { type: 'DELETE_OBJECT'; payload: { id: string } }
  | { type: 'DRAW_CARD'; payload: { deckId: string; playerId: string } }
  | { type: 'PLAY_CARD'; payload: { cardId: string; x: number; y: number } }
  | { type: 'SHUFFLE_DECK'; payload: { deckId: string } }
  | { type: 'FLIP_CARD'; payload: { cardId: string } }
  | { type: 'ROLL_DICE_LOG'; payload: { value: number; playerName: string } }
  | { type: 'ROLL_PHYSICAL_DICE'; payload: { id: string } }
  | { type: 'UPDATE_COUNTER'; payload: { id: string; delta: number } }
  | { type: 'SWITCH_ROLE'; payload: { playerId: string } }
  | { type: 'TOGGLE_LOCK'; payload: { id: string } }
  | { type: 'TOGGLE_ON_TABLE'; payload: { id: string } }
  | { type: 'ROTATE_OBJECT'; payload: { id: string; angle?: number } }
  | { type: 'SET_ROTATION'; payload: { id: string; rotation: number } }
  | { type: 'CLONE_OBJECT'; payload: { id: string } }
  | { type: 'RETURN_TO_DECK'; payload: { cardId: string } }
  | { type: 'ADD_CARD_TO_TOP_OF_DECK'; payload: { cardId: string; deckId: string } }
  | { type: 'ADD_CARD_TO_PILE'; payload: { cardId: string; pileId: string; deckId: string } }
  | { type: 'DRAW_FROM_PILE'; payload: { pileId: string; deckId: string; playerId: string } }
  | { type: 'RETURN_ALL_CARDS_TO_DECK'; payload: { deckId: string; fromPile?: boolean; pileId?: string } }
  | { type: 'TOGGLE_PILE_LOCK'; payload: { deckId: string; pileId: string } }
  | { type: 'UPDATE_PILE_POSITION'; payload: { deckId: string; pileId: string; x: number; y: number } }
  | { type: 'UPDATE_PERMISSIONS'; payload: { id: string; actions: ContextAction[] } }
  | { type: 'UPDATE_ACTION_BUTTONS'; payload: { id: string; actions: ContextAction[] } }
  | { type: 'MOVE_LAYER_UP'; payload: { id: string } }
  | { type: 'MOVE_LAYER_DOWN'; payload: { id: string } }
  | { type: 'LOAD_GAME'; payload: GameState }
  | { type: 'ADD_PLAYER'; payload: Player }
  | { type: 'REMOVE_PLAYER'; payload: { id: string } }
  | { type: 'SET_ACTIVE_ID'; payload: string }
  | { type: 'SYNC_STATE'; payload: GameState } // Network sync
  | { type: 'UPDATE_VIEW_TRANSFORM'; payload: ViewTransform }
  | { type: 'UPDATE_HAND_CARD_ORDER'; payload: { playerId: string; cardOrder: string[] } }
  | { type: 'UPDATE_DECK_CARD_DIMENSIONS'; payload: { deckId: string; cardWidth?: number; cardHeight?: number } }
  | { type: 'MILL_CARD_TO_BOTTOM'; payload: { cardId: string; deckId: string } }
  | { type: 'MILL_CARD_TO_PILE'; payload: { cardId: string; deckId: string; pileId: string } }
  | { type: 'TOGGLE_SHOW_TOP_CARD'; payload: { deckId: string; pileId?: string } }
  | { type: 'SWING_CLOCKWISE'; payload: { id: string } }
  | { type: 'SWING_COUNTER_CLOCKWISE'; payload: { id: string } }
  | { type: 'PIN_TO_VIEWPORT'; payload: { id: string; screenX: number; screenY: number } }
  | { type: 'UNPIN_FROM_VIEWPORT'; payload: { id: string } }
  // UI Object actions
  | { type: 'CREATE_PANEL'; payload: { panelType: PanelType; x?: number; y?: number; width?: number; height?: number; title?: string; deckId?: string } }
  | { type: 'CREATE_WINDOW'; payload: { windowType: WindowType; x?: number; y?: number; title?: string; targetObjectId?: string } }
  | { type: 'CLOSE_UI_OBJECT'; payload: { id: string } }
  | { type: 'TOGGLE_MINIMIZE'; payload: { id: string } }
  | { type: 'RESIZE_UI_OBJECT'; payload: { id: string; width: number; height: number } };

const initialState: GameState = {
  objects: {},
  players: [
    { id: 'gm', name: 'Game Master', color: '#8e44ad', isGM: true },
    { id: 'player-view', name: 'Player', color: '#3b82f6', isGM: false },
  ],
  activePlayerId: 'gm',
  diceRolls: [],
  viewTransform: { offset: { x: 0, y: 0 }, zoom: 0.8 },
};

const GameContext = createContext<{
  state: GameState;
  dispatch: React.Dispatch<Action>;
  isHost: boolean;
  peerId: string | null;
  connectionStatus: 'disconnected' | 'connecting' | 'connected';
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
        return {
            ...action.payload,
            viewTransform: action.payload.viewTransform || { offset: { x: 0, y: 0 }, zoom: 0.8 }
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
      const isBoard = action.payload.type === ItemType.BOARD || (action.payload.type === ItemType.TOKEN && (action.payload as any).shape === TokenShape.RECTANGLE);
      const allZ = Object.values(state.objects).map(o => o.zIndex || 0);
      const currentMaxZ = allZ.length ? Math.max(...allZ) : 0;
      const defaultZ = isBoard ? -100 : (currentMaxZ + 1);

      const newObj = {
          ...action.payload,
          zIndex: action.payload.zIndex ?? defaultZ, // Don't override existing zIndex
      } as any;
      const payload = action.payload as any;
      if (payload.isOnTable !== undefined) {
          newObj.isOnTable = payload.isOnTable;
      } else {
          newObj.isOnTable = true;
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
      const newObjects = { ...state.objects, [action.payload.id]: updatedObj };

      // Handle exclusive isMillPile toggle for piles
      if (updatedObj.type === ItemType.DECK) {
          const deck = updatedObj as Deck;
          const oldDeck = obj as Deck;
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
      return { ...state, objects: newObjects };
    }
    case 'MOVE_OBJECT': {
      const obj = state.objects[action.payload.id];
      if (!obj || obj.locked) return state;
      return {
        ...state,
        objects: {
          ...state.objects,
          [action.payload.id]: { ...obj, x: action.payload.x, y: action.payload.y },
        },
      };
    }
    case 'DELETE_OBJECT': {
        const objectToDelete = state.objects[action.payload.id];
        if (!objectToDelete) return state;
        const newObjects = { ...state.objects };
        delete newObjects[action.payload.id];
        if (objectToDelete.type === ItemType.DECK) {
             const deck = objectToDelete as Deck;
             if (deck.cardIds) { deck.cardIds.forEach(cid => delete newObjects[cid]); }
        }
        return { ...state, objects: newObjects };
    }
    case 'DRAW_CARD': {
      const deck = state.objects[action.payload.deckId] as Deck;
      if (!deck || deck.type !== ItemType.DECK || deck.cardIds.length === 0) return state;
      // Take TOP card from deck (first element in array, index 0)
      const drawnCardId = deck.cardIds[0];
      const newCardIds = deck.cardIds.slice(1);
      if (!drawnCardId) return state;
      const card = state.objects[drawnCardId] as Card;
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
      return {
        ...state,
        objects: { ...state.objects, [action.payload.deckId]: updatedDeck, [drawnCardId]: updatedCard },
      };
    }
    case 'PLAY_CARD': {
        const card = state.objects[action.payload.cardId] as Card;
        if (!card) return state;
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
            }
        };
    }
    case 'SHUFFLE_DECK': {
        const deck = state.objects[action.payload.deckId] as Deck;
        if (!deck || deck.type !== ItemType.DECK) return state;
        const shuffled = [...deck.cardIds];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return {
            ...state,
            objects: { ...state.objects, [action.payload.deckId]: { ...deck, cardIds: shuffled } }
        };
    }
    case 'FLIP_CARD': {
        const card = state.objects[action.payload.cardId] as Card;
        if (!card || card.type !== ItemType.CARD) return state;
        return {
            ...state,
            objects: { ...state.objects, [action.payload.cardId]: { ...card, faceUp: !card.faceUp } }
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
        return {
            ...state,
            objects: { ...state.objects, [action.payload.id]: { ...counter, value: counter.value + action.payload.delta } }
        };
    }
    case 'SWITCH_ROLE': {
        return { ...state, activePlayerId: action.payload.playerId };
    }
    case 'TOGGLE_LOCK': {
        const obj = state.objects[action.payload.id];
        if (!obj) return state;
        return { ...state, objects: { ...state.objects, [action.payload.id]: { ...obj, locked: !obj.locked } } };
    }
    case 'TOGGLE_ON_TABLE': {
        const obj = state.objects[action.payload.id] as any;
        if (!obj) return state;
        return { ...state, objects: { ...state.objects, [action.payload.id]: { ...obj, isOnTable: !obj.isOnTable } } };
    }
    case 'ROTATE_OBJECT': {
        const obj = state.objects[action.payload.id] as any;
        if (!obj) return state;
        // If angle is provided in payload, use it; otherwise use object's rotationStep
        const angle = action.payload.angle ?? obj.rotationStep ?? 45;
        return { ...state, objects: { ...state.objects, [action.payload.id]: { ...obj, rotation: (obj.rotation + angle) % 360 } } };
    }
    case 'SET_ROTATION': {
        const obj = state.objects[action.payload.id];
        if (!obj) return state;
        return { ...state, objects: { ...state.objects, [action.payload.id]: { ...obj, rotation: action.payload.rotation } } };
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
        return { ...state, objects: { ...state.objects, [newId]: clonedObj } };
    }
    case 'RETURN_TO_DECK': {
        const card = state.objects[action.payload.cardId] as Card;
        if (!card || !card.deckId || !state.objects[card.deckId]) return state;
        const deck = state.objects[card.deckId] as Deck;

        // Always return card to the TOP of its main deck (beginning of array)
        // Cards from piles (discard, etc.) return to the main deck, not to piles
        const newCardIds = [card.id, ...deck.cardIds];
        const updatedDeck: Deck = { ...deck, cardIds: newCardIds };
        // Card is face up by default (GM sees actual state, players see based on deck settings)
        const updatedCard: Card = { ...card, location: CardLocation.DECK, faceUp: true, x: deck.x, y: deck.y, isOnTable: true };
        return { ...state, objects: { ...state.objects, [deck.id]: updatedDeck, [card.id]: updatedCard } };
    }
    case 'ADD_CARD_TO_TOP_OF_DECK': {
        const card = state.objects[action.payload.cardId] as Card;
        const deck = state.objects[action.payload.deckId] as Deck;
        if (!card || !deck || deck.type !== ItemType.DECK) return state;

        // Add card to the beginning of the deck (top position)
        const newCardIds = [card.id, ...deck.cardIds];
        const updatedDeck: Deck = { ...deck, cardIds: newCardIds };

        // Update card to be in deck
        // Keep the card's original deckId to track which deck it belongs to
        const updatedCard: Card = {
            ...card,
            location: CardLocation.DECK,
            // Only update deckId if the card doesn't already have one (e.g., newly created card)
            // This preserves the original deckId when moving cards between decks
            deckId: card.deckId || deck.id,
            faceUp: true,
            x: deck.x,
            y: deck.y,
            isOnTable: true
        };

        return { ...state, objects: { ...state.objects, [deck.id]: updatedDeck, [card.id]: updatedCard } };
    }
    case 'ADD_CARD_TO_PILE': {
        const card = state.objects[action.payload.cardId] as Card;
        const deck = state.objects[action.payload.deckId] as Deck;
        if (!card || !deck || deck.type !== ItemType.DECK) return state;

        // Find the pile in the deck's piles array
        const pile = deck.piles?.find(p => p.id === action.payload.pileId);
        if (!pile) return state;


        // Create updated pile with new card added to TOP (beginning of array)
        const updatedPile: CardPile = {
            ...pile,
            cardIds: [card.id, ...pile.cardIds]
        };

        // Update deck's piles array
        const updatedPiles = deck.piles?.map(p =>
            p.id === action.payload.pileId ? updatedPile : p
        ) || [updatedPile];

        const updatedDeck: Deck = { ...deck, piles: updatedPiles };

        // Update card to be in pile
        // Keep the card's original deckId to track which deck it belongs to
        const updatedCard: Card = {
            ...card,
            location: CardLocation.PILE,
            // Only update deckId if the card doesn't already have one
            deckId: card.deckId || deck.id,
            faceUp: pile.faceUp ?? false,
            isOnTable: true
        };


        return { ...state, objects: { ...state.objects, [deck.id]: updatedDeck, [card.id]: updatedCard } };
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
        return { ...state, objects: { ...state.objects, [obj.id]: { ...obj, zIndex: newCurrentZ }, [nextObj.id]: { ...nextObj, zIndex: newNextZ } } };
    }
    case 'MOVE_LAYER_DOWN': {
        const obj = state.objects[action.payload.id];
        if (!obj) return state;
        const sortedObjects = Object.values(state.objects).sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
        const index = sortedObjects.findIndex(o => o.id === obj.id);
        if (index <= 0) return state;
        const prevObj = sortedObjects[index - 1];
        const isPrevBoard = prevObj.type === ItemType.BOARD || (prevObj.type === ItemType.TOKEN && (prevObj as Token).shape === TokenShape.RECTANGLE);
        const isCurrentBoard = obj.type === ItemType.BOARD || (obj.type === ItemType.TOKEN && (obj as Token).shape === TokenShape.RECTANGLE);
        if (isPrevBoard && !isCurrentBoard) return state;
        const currentZ = obj.zIndex || 0;
        const prevZ = prevObj.zIndex || 0;
        let newCurrentZ = prevZ;
        let newPrevZ = currentZ;
        if (newPrevZ >= newCurrentZ) { newPrevZ = newCurrentZ + 1; }
        return { ...state, objects: { ...state.objects, [obj.id]: { ...obj, zIndex: newCurrentZ }, [prevObj.id]: { ...prevObj, zIndex: newPrevZ } } };
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
      };
    }
    case 'RETURN_ALL_CARDS_TO_DECK': {
      const deck = state.objects[action.payload.deckId] as Deck;
      if (!deck || deck.type !== ItemType.DECK) return state;

      const newObjects = { ...state.objects };
      const allCardIds: string[] = [];

      // Collect all card IDs that belong to this deck in a predictable order:
      // 1. Cards currently in the deck
      allCardIds.push(...deck.cardIds);

      // 2. Cards from each pile (in pile order)
      if (deck.piles) {
        deck.piles.forEach(pile => {
          allCardIds.push(...pile.cardIds);
        });
      }

      // 3. Cards from table and hand (sorted by id for consistency)
      const otherCardIds: string[] = [];
      Object.values(state.objects).forEach(obj => {
        if (obj.type === ItemType.CARD) {
          const card = obj as Card;
          if (card.deckId === deck.id && card.location !== CardLocation.DECK && card.location !== CardLocation.PILE) {
            otherCardIds.push(card.id);
          }
        }
      });
      otherCardIds.sort(); // Sort by ID for consistent ordering
      allCardIds.push(...otherCardIds);

      // Clear all piles of this deck
      let updatedDeck = { ...deck };
      if (updatedDeck.piles && updatedDeck.piles.length > 0) {
        updatedDeck.piles = updatedDeck.piles.map(pile => ({
          ...pile,
          cardIds: []
        }));
      }

      // Reset deck's cardIds to contain all cards
      updatedDeck.cardIds = [...allCardIds];

      // Update all cards to be back in deck
      // Cards are face up by default (GM sees actual state, players see based on deck settings)
      allCardIds.forEach(cardId => {
        const card = state.objects[cardId] as Card;
        if (card) {
          newObjects[cardId] = {
            ...card,
            location: CardLocation.DECK,
            faceUp: true,
            x: deck.x,
            y: deck.y,
            isOnTable: true,
            ownerId: undefined,
          } as Card;
        }
      });

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
      // Move card to bottom of deck (last position in cardIds array)
      const { cardId, deckId } = action.payload;
      const deck = state.objects[deckId] as Deck;
      if (!deck || deck.type !== ItemType.DECK) return state;
      if (!deck.cardIds.includes(cardId)) return state;

      // Remove card from current position and add to end
      const newCardIds = [...deck.cardIds.filter(id => id !== cardId), cardId];

      return {
        ...state,
        objects: {
          ...state.objects,
          [deckId]: { ...deck, cardIds: newCardIds }
        }
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

      // Remove from deck cardIds
      const newDeckCardIds = deck.cardIds.filter(id => id !== cardId);
      // Add to pile cardIds
      const newPileCardIds = [...pile.cardIds, cardId];

      // Update piles array
      const updatedPiles = deck.piles?.map(p =>
        p.id === pileId ? { ...p, cardIds: newPileCardIds } : p
      );

      return {
        ...state,
        objects: {
          ...state.objects,
          [deckId]: {
            ...deck,
            cardIds: newDeckCardIds,
            piles: updatedPiles
          }
        }
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

      const rotationStep = obj.rotationStep ?? 45;
      const baseRotation = obj.baseRotation ?? obj.rotation;

      // If current rotation is at base, rotate clockwise by rotationStep
      // Otherwise return to base rotation
      const newRotation = obj.rotation === baseRotation
        ? (obj.rotation + rotationStep) % 360
        : baseRotation;

      return {
        ...state,
        objects: {
          ...state.objects,
          [action.payload.id]: {
            ...obj,
            rotation: newRotation,
            baseRotation: baseRotation
          }
        }
      };
    }
    case 'SWING_COUNTER_CLOCKWISE': {
      const obj = state.objects[action.payload.id] as any;
      if (!obj) return state;

      const rotationStep = obj.rotationStep ?? 45;
      const baseRotation = obj.baseRotation ?? obj.rotation;

      // If current rotation is at base, rotate counter-clockwise by rotationStep
      // Otherwise return to base rotation
      const newRotation = obj.rotation === baseRotation
        ? (obj.rotation - rotationStep + 360) % 360
        : baseRotation;

      return {
        ...state,
        objects: {
          ...state.objects,
          [action.payload.id]: {
            ...obj,
            rotation: newRotation,
            baseRotation: baseRotation
          }
        }
      };
    }
    case 'PIN_TO_VIEWPORT': {
      const obj = state.objects[action.payload.id];
      if (!obj) return state;

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
          }
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
        }
      };
    }
    case 'UNPIN_FROM_VIEWPORT': {
      const obj = state.objects[action.payload.id];
      if (!obj) return state;

      return {
        ...state,
        objects: {
          ...state.objects,
          [action.payload.id]: {
            ...obj,
            isPinnedToViewport: false,
            pinnedScreenPosition: undefined,
            expandedPinnedPosition: undefined,
            collapsedPinnedPosition: undefined
          }
        }
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
    default:
      return state;
  }
};

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, localDispatch] = useReducer(gameReducer, initialState);
  const [isHost, setIsHost] = useState(true);
  const [peerId, setPeerId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  
  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<any[]>([]); // For Host: list of guest connections
  const hostConnectionRef = useRef<any>(null); // For Guest: connection to host

  // Ref to track latest state for event listeners
  const stateRef = useRef(state);
  const initializedRef = useRef(false);

  useEffect(() => {
      stateRef.current = state;
  }, [state]);

  // Initialize Default Board and Standard Deck
  useEffect(() => {
    if (!initializedRef.current && isHost && Object.keys(state.objects).length === 0) {
        initializedRef.current = true;

        // Create game board
        const boardId = 'demo-board';
        const board: Board = {
             id: boardId,
             type: ItemType.BOARD,
             shape: TokenShape.RECTANGLE,
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

        // Create Standard Deck positioned in top-right corner
        // Position: 10px from top, 60px from right main menu
        const MARGIN_X = 80;
        const MARGIN_Y = -80;
        const { deck, cards } = createStandardDeck();

        // Calculate world coordinates for top-right position
        // screenX = worldX * zoom + offset.x
        // We want screenX to be near right edge (windowWidth - MAIN_MENU_WIDTH - MARGIN_X - deckWidth/2)
        // With default offset.x = 0, zoom = 0.8:
        // worldX = (screenX - offset.x) / zoom
        const windowWidth = window.innerWidth;
        const deckScreenWidth = windowWidth - MAIN_MENU_WIDTH - MARGIN_X - (deck.width / 2);
        const deckScreenY = MARGIN_Y + (deck.height / 2);

        deck.x = deckScreenWidth / state.viewTransform.zoom - state.viewTransform.offset.x;
        deck.y = deckScreenY / state.viewTransform.zoom - state.viewTransform.offset.y;

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
                height: window.innerHeight,
                title: 'Main Menu'
            }
        });
    }
  }, [isHost]);

  // PEERJS SETUP
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hostIdToJoin = params.get('hostId');
    
    // Cleanup previous peer if exists (React StrictMode double render handling)
    if (peerRef.current) return;

    const peer = new Peer();
    peerRef.current = peer;

    peer.on('open', (id) => {
        setPeerId(id);
        
        // If we have a hostId in URL, we are a Guest joining a game
        if (hostIdToJoin) {
            setIsHost(false);
            setConnectionStatus('connecting');
            connectToHost(hostIdToJoin, peer);
        } else {
            setIsHost(true);
            setConnectionStatus('connected'); // Host is always connected to themselves
        }
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
                // Treat error as potential disconnect
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
        // peer.destroy(); 
    };
  }, []);

  // Connect to Host Logic (Guest Side)
  const connectToHost = (hostId: string, peer: Peer) => {
      const conn = peer.connect(hostId);
      hostConnectionRef.current = conn;

      conn.on('open', () => {
          setConnectionStatus('connected');
          
          // Send HELO
          const name = window.prompt("Enter your player name:", "Player") || `Player ${Math.floor(Math.random() * 100)}`;
          const myPlayer: Player = {
              id: peer.id, // Use peer ID as player ID
              name: name,
              color: '#'+Math.floor(Math.random()*16777215).toString(16),
              isGM: false
          };
          
          // Add ourselves locally temporarily, but real confirm comes from Host state sync
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
      });
      
      conn.on('error', (err) => {
          console.error("Connection error to host:", err);
      });
  };

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
      else if (data.type === 'ACTION') {
          // Host received action request from Guest
          localDispatch(data.payload); // Execute locally on Host
          // The useEffect below will trigger broadcast of resulting state
      }
  };

  // Middleware Dispatcher - memoized with useCallback to prevent infinite loops
  const dispatch = useCallback((action: Action) => {
      if (isHost) {
          // Host executes locally
          localDispatch(action);
          // State broadcast handled by useEffect to ensure updated state is sent
      } else {
          // Guest sends action to Host
          if (hostConnectionRef.current && connectionStatus === 'connected') {
              hostConnectionRef.current.send({ type: 'ACTION', payload: action });

              // Optimistic updates for some actions (like moving objects) to make it feel responsive?
              // For now, simpler to just wait for sync to avoid desync bugs in this architecture
              // But for better UX, we execute locally too *if* we trust it won't conflict.
              // Let's execute locally ONLY for UI responsiveness if it's safe,
              // BUT 'SYNC_STATE' will overwrite it anyway.
              if (action.type === 'MOVE_OBJECT') {
                 localDispatch(action);
              }
          }
      }
  }, [isHost, connectionStatus]);

  // Host Broadcast Loop: whenever state changes, send to all guests
  // We use a debounce or throttle in a real app, here we just check if meaningful change occurred
  useEffect(() => {
      if (isHost && connectionsRef.current.length > 0) {
          // Broadcast new state
          connectionsRef.current.forEach(conn => {
              if (conn.open) {
                  conn.send({ type: 'SYNC_STATE', payload: state });
              }
          });
      }
  }, [state, isHost]);

  return (
    <GameContext.Provider value={{ state, dispatch, isHost, peerId, connectionStatus }}>
      {children}
    </GameContext.Provider>
  );
};

export const useGame = () => {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGame must be used within a GameProvider');
  return context;
};