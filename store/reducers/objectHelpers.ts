import { TableObject, ItemType, Card, Deck, Drawing, GeneralHistoryEntry, PanelObject, WindowObject } from '../../types';
import { CARD_SHAPE_DIMS, DEFAULT_DECK_WIDTH, DEFAULT_DECK_HEIGHT } from '../../constants';
import { CardShape } from '../../types';
import { constrainPanelPosition, constrainPanelBounds, DEFAULT_SCREEN_WIDTH_VU, DEFAULT_SCREEN_HEIGHT_VU } from '../../utils/panelConstraints';

/**
 * Helper functions for object manipulation in reducers
 */

/**
 * Calculate default z-index for a new object
 */
export function calculateDefaultZIndex(
  objects: Record<string, TableObject>,
  isBoard: boolean,
  isDeck: boolean,
  isArchetype: boolean
): number {
  const currentMaxZ = Object.values(objects).reduce((max, obj) => {
    const z = ('zIndex' in obj && obj.zIndex !== undefined) ? obj.zIndex : 0;
    return Math.max(max, z);
  }, 0);
  // Boards get -100, decks get 0, archetypes get -50, other objects get currentMaxZ + 1
  return isBoard ? -100 : (isDeck ? 0 : (isArchetype ? -50 : currentMaxZ + 1));
}

/**
 * Create a new object with proper defaults
 */
export function createNewObject(
  payload: any,
  defaultZ: number,
  isArchetype: boolean
): TableObject {
  const newObj = {
    ...payload,
    zIndex: payload.zIndex ?? defaultZ,
  } as TableObject;

  if (payload.isOnTable !== undefined) {
    (newObj as any).isOnTable = payload.isOnTable;
  } else if ('isOnTable' in newObj) {
    // Keep existing isOnTable value
  } else {
    // Archetypes are hidden from table by default (shown in Tools panel)
    (newObj as any).isOnTable = isArchetype ? false : true;
  }

  // Migrate old decks without baseCardIds
  if ((newObj as Deck).cardIds && !(newObj as Deck).baseCardIds) {
    (newObj as Deck).baseCardIds = [...(newObj as Deck).cardIds];
  }

  return newObj;
}

/**
 * Update an object with proper handling for special types
 * For panels and windows, applies size and position constraints
 */
export function updateObject(
  state: any,
  objects: Record<string, TableObject>,
  action: any
): Record<string, TableObject> {
  const obj = objects[action.payload.id];
  if (!obj) return objects;

  const updatedObj = { ...obj, ...action.payload } as TableObject;
  const newObjects = { ...objects, [action.payload.id]: updatedObj };

  // Apply constraints for panels and windows when position or size changes
  if ((obj.type === ItemType.PANEL || obj.type === ItemType.WINDOW) &&
      ('x' in action.payload || 'y' in action.payload || 'width' in action.payload || 'height' in action.payload)) {
    const { x, y, width, height } = action.payload;
    const currentX = x !== undefined ? x : obj.x;
    const currentY = y !== undefined ? y : obj.y;
    const currentWidth = width !== undefined ? width : obj.width;
    const currentHeight = height !== undefined ? height : obj.height;

    // Use provided screen dimensions or defaults
    const screenWidth = action.payload.screenWidth ?? DEFAULT_SCREEN_WIDTH_VU;
    const screenHeight = action.payload.screenHeight ?? DEFAULT_SCREEN_HEIGHT_VU;

    const constrained = constrainPanelBounds(
      currentX,
      currentY,
      currentWidth,
      currentHeight,
      screenWidth,
      screenHeight
    );

    updatedObj.x = constrained.x;
    updatedObj.y = constrained.y;
    updatedObj.width = constrained.width;
    updatedObj.height = constrained.height;
  }

  // Ensure decks don't have excessively high z-index
  if (updatedObj.type === ItemType.DECK && (updatedObj.zIndex === undefined || updatedObj.zIndex > 100)) {
    updatedObj.zIndex = 0;
  }

  // Handle deck updates
  if (updatedObj.type === ItemType.DECK) {
    handleDeckUpdate(newObjects, updatedObj as Deck, obj as Deck, objects);
  }

  // Handle drawing updates - when color changes, update all strokes
  if (updatedObj.type === ItemType.DRAWING && 'color' in action.payload) {
    const drawing = obj as Drawing;
    const newDrawing = updatedObj as Drawing;
    if (newDrawing.color !== drawing.color) {
      const newColor = newDrawing.color || '#ef4444';
      newDrawing.strokes = drawing.strokes.map(stroke => ({
        ...stroke,
        color: newColor,
      }));
      (newObjects as Record<string, TableObject>)[newDrawing.id] = newDrawing;
    }
  }

  return newObjects;
}

/**
 * Handle deck-specific updates (card shape, dimensions, piles)
 */
function handleDeckUpdate(
  newObjects: Record<string, TableObject>,
  deck: Deck,
  oldDeck: Deck,
  oldObjects: Record<string, TableObject>
): void {
  // When cardShape changes, update deck size and all cards
  if (deck.cardShape && deck.cardShape !== oldDeck.cardShape) {
    const dims = CARD_SHAPE_DIMS[deck.cardShape] || CARD_SHAPE_DIMS[CardShape.POKER];
    deck.width = dims.width;
    deck.height = dims.height;
    newObjects[deck.id] = deck;
    Object.values(oldObjects).forEach(o => {
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

  // When cardWidth or cardHeight changes, update cards with old default dimensions
  const oldCardWidth = oldDeck.cardWidth ?? DEFAULT_DECK_WIDTH;
  const oldCardHeight = oldDeck.cardHeight ?? DEFAULT_DECK_HEIGHT;
  const newCardWidth = deck.cardWidth ?? DEFAULT_DECK_WIDTH;
  const newCardHeight = deck.cardHeight ?? DEFAULT_DECK_HEIGHT;

  if (newCardWidth !== oldCardWidth || newCardHeight !== oldCardHeight) {
    Object.values(oldObjects).forEach(o => {
      if (o.type === ItemType.CARD && (o as Card).deckId === deck.id) {
        const card = o as Card;
        // Update cards that currently have the old card dimensions OR match the deck's aspect ratio
        // This ensures cards inherit deck dimension changes even if they have small variations
        const cardMatchesOldDimensions = card.width === oldCardWidth && card.height === oldCardHeight;
        const cardMatchesDeckRatio = Math.abs((card.width / card.height) - (oldCardWidth / oldCardHeight)) < 0.01;

        if (cardMatchesOldDimensions || cardMatchesDeckRatio) {
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
    const newlyEnabledMillPileIndex = deck.piles.findIndex(
      (pile, idx) => pile.isMillPile && !oldPiles[idx]?.isMillPile
    );
    if (newlyEnabledMillPileIndex !== -1) {
      deck.piles = deck.piles.map((pile, idx) =>
        idx === newlyEnabledMillPileIndex
          ? pile
          : { ...pile, isMillPile: false }
      );
      newObjects[deck.id] = deck;
    }
  }
}

/**
 * Move an object to new coordinates
 * For panels and windows, applies position constraints (50% must remain visible)
 */
export function moveObject(
  state: any,
  obj: TableObject,
  x: number,
  y: number,
  isLocalOnly?: boolean
): any {
  const isDrawing = obj.type === ItemType.DRAWING;
  const isInCursorSlot = (obj as any).inCursorSlot;
  const isLocalOnlyMove = isLocalOnly || (obj as any)._localOnly || (obj as any)._excludeFromHistory;

  // Apply position constraints for panels and windows (all in VU)
  // Panel can extend up to 50% off-screen
  let constrainedX = x;
  let constrainedY = y;

  if (obj.type === ItemType.PANEL || obj.type === ItemType.WINDOW) {
    const constrained = constrainPanelPosition(
      x,
      y,
      obj.width,
      obj.height,
      DEFAULT_SCREEN_WIDTH_VU,
      DEFAULT_SCREEN_HEIGHT_VU
    );
    constrainedX = constrained.x;
    constrainedY = constrained.y;
  }

  const baseUpdate = {
    ...state,
    objects: {
      ...state.objects,
      [obj.id]: { ...obj, x: constrainedX, y: constrainedY },
    },
  };

  // For pinned objects, update pinnedScreenPosition
  if ((obj as any).isPinnedToViewport) {
    baseUpdate.objects[obj.id] = {
      ...obj,
      x: constrainedX,
      y: constrainedY,
      pinnedScreenPosition: { x: constrainedX, y: constrainedY }
    } as TableObject;
  }

  // Don't track history for drawings, cursor slot objects, or local-only moves
  if (!isDrawing && !isInCursorSlot && !isLocalOnlyMove) {
    const historyEntry: GeneralHistoryEntry = {
      type: 'object-moved',
      objectId: obj.id,
      previousX: obj.x,
      previousY: obj.y,
    };
    baseUpdate.undo = {
      ...state.undo,
      generalHistory: [...(state.undo.generalHistory || []), historyEntry].slice(-100),
    };
  }

  return baseUpdate;
}
