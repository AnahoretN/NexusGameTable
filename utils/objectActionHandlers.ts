/**
 * Universal Object Action Handlers
 * Consolidated action handlers for objects (cards, decks, tokens, etc.)
 * Used by both Tabletop and PoolTabletop to eliminate code duplication
 */

import { TableObject, ItemType, Deck as DeckType, Card as CardType, CardOrientation } from '../types';
import { Dispatch } from 'react';
import { Action } from '../store/GameContext';
import { executeContextMenuAction } from './contextMenuActions';

// ============================================
// ACTION HANDLER CONFIGURATION
// ============================================

export interface ActionHandlerContext {
  dispatch: Dispatch<Action>;
  state: {
    objects: Record<string, TableObject>;
    activePlayerId?: string;
    diceGroups?: any[];
    viewTransform?: {
      zoom?: number;
      scroll?: { x?: number; y?: number };
      pixelsPerVU?: number;
      offset?: { x: number; y: number };
    };
  };
  poolZone?: {
    panelId?: string;
    offsetX?: number;
    offsetY?: number;
    width?: number;
    height?: number;
  };
  additionalHandlers?: {
    onDeleteCandidate?: (id: string) => void;
    onAnimateDice?: (dice: any) => void;
    onOpenSearchDeck?: (deck: DeckType) => void;
    onOpenTopDeckModal?: (deck: DeckType) => void;
  };
  isGM?: boolean;
  isShiftPressed?: boolean;
}

export interface ClickActionEvent {
  clientX: number;
  clientY: number;
  shiftKey?: boolean;
}

// ============================================
// ROTATION ACTIONS
// ============================================

export function handleRotate(obj: TableObject, dispatch: Dispatch<Action>, allObjects?: Record<string, TableObject>) {
  const rotationStep = getRotationStepForObject(obj, allObjects || {});
  dispatch({ type: 'ROTATE_OBJECT', payload: { id: obj.id, angle: rotationStep } });
}

export function handleRotateClockwise(obj: TableObject, dispatch: Dispatch<Action>, allObjects?: Record<string, TableObject>) {
  const rotationStep = getRotationStepForObject(obj, allObjects || {});
  dispatch({ type: 'ROTATE_OBJECT', payload: { id: obj.id, angle: rotationStep } });
}

export function handleRotateCounterClockwise(obj: TableObject, dispatch: Dispatch<Action>, allObjects?: Record<string, TableObject>) {
  const rotationStep = getRotationStepForObject(obj, allObjects || {});
  dispatch({ type: 'ROTATE_OBJECT', payload: { id: obj.id, angle: -rotationStep } });
}

export function handleResetRotation(obj: TableObject, dispatch: Dispatch<Action>) {
  dispatch({ type: 'SET_ROTATION', payload: { id: obj.id, rotation: 0 } });
}

// ============================================
// CARD ACTIONS
// ============================================

export function handleFlip(obj: TableObject, dispatch: Dispatch<Action>) {
  if (obj.type === ItemType.CARD) {
    dispatch({ type: 'FLIP_CARD', payload: { cardId: obj.id } });
  }
}

export function handleDraw(obj: TableObject, context: ActionHandlerContext) {
  if (obj.type === ItemType.DECK) {
    context.dispatch({
      type: 'DRAW_CARD',
      payload: { deckId: obj.id, playerId: context.state.activePlayerId }
    });
  }
}

export function handlePlayTopCard(
  obj: TableObject,
  context: ActionHandlerContext,
  event?: ClickActionEvent
) {
  if (obj.type !== ItemType.DECK) return;

  const deck = obj as DeckType;
  if (!deck.cardIds || deck.cardIds.length === 0) return;

  const topCardId = deck.cardIds[0];
  const card = context.state.objects[topCardId] as CardType;
  if (!card) return;

  const faceUp = deck.playTopFaceUp ?? true;

  // Get mouse position
  const mousePos = event
    ? { x: event.clientX, y: event.clientY }
    : { x: window.innerWidth / 2, y: window.innerHeight / 2 };

  // Prepare card for cursor slot
  const isHorizontal = deck.cardOrientation === CardOrientation.HORIZONTAL;
  const cardWidth = deck.cardWidth ?? card.width ?? 63;
  const cardHeight = deck.cardHeight ?? card.height ?? 88;

  // Calculate click offset to center the card on cursor
  // This ensures the card is displayed with cursor at center, not at top-left
  const clickOffsetX = cardWidth / 2;
  const clickOffsetY = cardHeight / 2;

  const cardForSlot: CardType = {
    ...card,
    location: 'CURSOR_SLOT' as any,
    faceUp,
    isHorizontal,
    isOnTable: false,
    // Inherit card dimensions from deck for correct aspect ratio
    width: cardWidth,
    height: cardHeight,
  };

  // Add to cursor slot BEFORE dispatch
  window.dispatchEvent(new CustomEvent('add-to-cursor-slot', {
    detail: {
      cardId: card.id,
      clientX: mousePos.x,
      clientY: mousePos.y,
      source: 'shift',
      cardOverride: cardForSlot,
      clickOffsetX,
      clickOffsetY
    }
  }));

  // Then dispatch to update state
  context.dispatch({
    type: 'PLAY_TOP_CARD',
    payload: { deckId: deck.id }
  });
}

// ============================================
// LAYER ACTIONS
// ============================================

export function handleBringToFront(obj: TableObject, dispatch: Dispatch<Action>) {
  dispatch({ type: 'BRING_TO_FRONT', payload: { id: obj.id } });
}

export function handleSendToBack(obj: TableObject, dispatch: Dispatch<Action>) {
  dispatch({ type: 'SEND_TO_BACK', payload: { id: obj.id } });
}

export function handleLayerUp(obj: TableObject, dispatch: Dispatch<Action>) {
  dispatch({ type: 'MOVE_LAYER_UP', payload: { id: obj.id } });
}

export function handleLayerDown(obj: TableObject, dispatch: Dispatch<Action>) {
  dispatch({ type: 'MOVE_LAYER_DOWN', payload: { id: obj.id } });
}

// ============================================
// DECK ACTIONS
// ============================================

export function handleShuffleDeck(obj: TableObject, context: ActionHandlerContext) {
  if (obj.type === ItemType.DECK) {
    // Dispatch event for shuffle animation
    window.dispatchEvent(new CustomEvent('deck-shuffle-start', {
      detail: { deckId: obj.id }
    }));
    context.dispatch({
      type: 'SHUFFLE_DECK',
      payload: { deckId: obj.id }
    });
  }
}

export function handleSearchDeck(obj: TableObject, context: ActionHandlerContext) {
  if (obj.type === ItemType.DECK && context.additionalHandlers?.onOpenSearchDeck) {
    context.additionalHandlers.onOpenSearchDeck(obj as DeckType);
  }
}

export function handleShowTop(obj: TableObject, dispatch: Dispatch<Action>) {
  if (obj.type === ItemType.DECK) {
    dispatch({
      type: 'UPDATE_OBJECT',
      payload: { id: obj.id, updates: { showTopCard: true } }
    });
  }
}

export function handleHideTop(obj: TableObject, dispatch: Dispatch<Action>) {
  if (obj.type === ItemType.DECK) {
    dispatch({
      type: 'UPDATE_OBJECT',
      payload: { id: obj.id, updates: { showTopCard: false } }
    });
  }
}

export function handleMillTopCard(obj: TableObject, context: ActionHandlerContext) {
  if (obj.type === ItemType.DECK) {
    const deck = obj as DeckType;
    const millPile = deck.piles?.find(p => p.isMillPile);
    if (millPile && deck.cardIds.length > 0) {
      const topCardId = deck.cardIds[0];
      context.dispatch({
        type: 'ADD_CARD_TO_PILE',
        payload: {
          cardId: topCardId,
          deckId: obj.id,
          pileId: millPile.id
        }
      });
    }
  }
}

export function handleToBottom(obj: TableObject, context: ActionHandlerContext) {
  if (obj.type === ItemType.DECK) {
    const deck = obj as DeckType;
    if (deck.cardIds.length > 0) {
      const topCardId = deck.cardIds[0];
      const newCardIds = [...deck.cardIds.slice(1), topCardId];
      context.dispatch({
        type: 'UPDATE_OBJECT',
        payload: { id: obj.id, updates: { cardIds: newCardIds } }
      });
    }
  }
}

export function handleReturnAll(obj: TableObject, context: ActionHandlerContext) {
  if (obj.type === ItemType.DECK) {
    context.dispatch({
      type: 'RETURN_ALL_CARDS_TO_DECK',
      payload: { deckId: obj.id, shuffleAfter: false }
    });
  }
}

export function handleReturnAllAndShuffle(obj: TableObject, context: ActionHandlerContext) {
  if (obj.type === ItemType.DECK) {
    window.dispatchEvent(new CustomEvent('deck-shuffle-start', {
      detail: { deckId: obj.id }
    }));
    context.dispatch({
      type: 'RETURN_ALL_CARDS_TO_DECK',
      payload: { deckId: obj.id, shuffleAfter: true }
    });
  }
}

export function handleTopDeck(obj: TableObject, context: ActionHandlerContext) {
  if (obj.type === ItemType.DECK && context.additionalHandlers?.onOpenTopDeckModal) {
    context.additionalHandlers.onOpenTopDeckModal(obj as DeckType);
  }
}

export function handlePiles(obj: TableObject) {
  // Open piles menu - handled by component state
}

export function handleMillToBottom(obj: TableObject, context: ActionHandlerContext) {
  if (obj.type === ItemType.CARD) {
    const card = obj as CardType;
    if (card.deckId) {
      context.dispatch({
        type: 'RETURN_TO_DECK',
        payload: { cardId: obj.id }
      });
    }
  }
}

// ============================================
// OBJECT MANAGEMENT ACTIONS
// ============================================

export function handleDelete(obj: TableObject, context: ActionHandlerContext) {
  if (context.additionalHandlers?.onDeleteCandidate) {
    context.additionalHandlers.onDeleteCandidate(obj.id);
  }
}

export function handleClone(obj: TableObject, context: ActionHandlerContext) {
  // Special handling for cards in decks - clone card within the same deck
  if (obj.type === ItemType.CARD && (obj as any).deckId) {
    const card = obj as any;
    const deck = context.state.objects[card.deckId];
    if (deck && deck.type === ItemType.DECK) {
      // Create a copy of the card in the same deck
      const newCardId = `card-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      // Create exact copy of the card with new ID
      const newCard = {
        ...card,
        id: newCardId,
        name: `${card.name} (copy)`
      };

      // Add new card to deck's cardIds AND baseCardIds
      // baseCardIds defines the max cards in deck - cloned cards should persist
      const updatedCardIds = [...deck.cardIds, newCardId];
      const updatedBaseCardIds = [...(deck.baseCardIds || []), newCardId];

      context.dispatch({
        type: 'UPDATE_OBJECT',
        payload: {
          id: deck.id,
          updates: { cardIds: updatedCardIds, baseCardIds: updatedBaseCardIds }
        }
      });

      // Add the cloned card to objects
      context.dispatch({
        type: 'ADD_OBJECT',
        payload: { object: newCard }
      });
      return;
    }
  }
  // Default clone behavior for other objects
  context.dispatch({ type: 'CLONE_OBJECT', payload: { id: obj.id } });
}

export function handleLock(obj: TableObject, dispatch: Dispatch<Action>) {
  dispatch({
    type: 'UPDATE_OBJECT',
    payload: { id: obj.id, updates: { locked: !obj.locked } }
  });
}

export function handleShow(obj: TableObject, dispatch: Dispatch<Action>) {
  dispatch({
    type: 'UPDATE_OBJECT',
    payload: { id: obj.id, updates: { isOnTable: true } }
  });
}

export function handleHide(obj: TableObject, dispatch: Dispatch<Action>) {
  dispatch({
    type: 'UPDATE_OBJECT',
    payload: { id: obj.id, updates: { isOnTable: false } }
  });
}

export function handlePinToViewport(obj: TableObject, dispatch: Dispatch<Action>) {
  dispatch({
    type: 'UPDATE_OBJECT',
    payload: { id: obj.id, updates: { isPinnedToViewport: true } }
  });
}

export function handleUnpinFromViewport(obj: TableObject, dispatch: Dispatch<Action>) {
  dispatch({
    type: 'UPDATE_OBJECT',
    payload: { id: obj.id, updates: { isPinnedToViewport: false } }
  });
}

export function handlePin(obj: TableObject, dispatch: Dispatch<Action>) {
  const isPinned = (obj as any).isPinnedToViewport;
  dispatch({
    type: 'UPDATE_OBJECT',
    payload: { id: obj.id, updates: { isPinnedToViewport: !isPinned } }
  });
}

// ============================================
// SWING ACTIONS
// ============================================

/**
 * Helper function to get rotationStep for an object, considering archetype for tokens and deck for cards
 */
const getRotationStepForObject = (obj: TableObject, allObjects: Record<string, TableObject>): number => {
  // For cards with deckId, get rotationStep from deck
  if (obj.type === ItemType.CARD && (obj as any).deckId) {
    const deck = allObjects[(obj as any).deckId];
    if (deck && (deck as any).rotationStep) {
      return (deck as any).rotationStep;
    }
  }
  // For tokens with archetypeId, get rotationStep from archetype
  if (obj.type === ItemType.TOKEN && (obj as any).archetypeId) {
    const archetype = allObjects[(obj as any).archetypeId];
    if (archetype && archetype.type === ItemType.TOKEN_TYPE && archetype.rotationStep) {
      return archetype.rotationStep;
    }
  }
  // Default to object's rotationStep or 45
  return (obj as any).rotationStep || 45;
};

/**
 * Swing Clockwise: Toggle between rotationStep and 0
 * First press: rotate by rotationStep
 * Second press: reset to 0
 */
export function handleSwingClockwise(obj: TableObject, dispatch: Dispatch<Action>, allObjects?: Record<string, TableObject>) {
  const rotationStep = getRotationStepForObject(obj, allObjects || {});
  const currentRotation = obj.rotation || 0;

  // If already at the swing rotation, reset to 0
  if (currentRotation === rotationStep) {
    dispatch({
      type: 'UPDATE_OBJECT',
      payload: { id: obj.id, updates: { rotation: 0 } }
    });
  } else {
    // Otherwise, rotate to rotationStep
    dispatch({
      type: 'UPDATE_OBJECT',
      payload: { id: obj.id, updates: { rotation: rotationStep } }
    });
  }
}

/**
 * Swing Counter-Clockwise: Toggle between -rotationStep and 0
 * First press: rotate by -rotationStep
 * Second press: reset to 0
 */
export function handleSwingCounterClockwise(obj: TableObject, dispatch: Dispatch<Action>, allObjects?: Record<string, TableObject>) {
  const rotationStep = getRotationStepForObject(obj, allObjects || {});
  const currentRotation = obj.rotation || 0;

  // If already at the negative swing rotation, reset to 0
  if (currentRotation === -rotationStep) {
    dispatch({
      type: 'UPDATE_OBJECT',
      payload: { id: obj.id, updates: { rotation: 0 } }
    });
  } else {
    // Otherwise, rotate to -rotationStep
    dispatch({
      type: 'UPDATE_OBJECT',
      payload: { id: obj.id, updates: { rotation: -rotationStep } }
    });
  }
}

// ============================================
// DICE ACTIONS
// ============================================

// Memoized roll function to avoid redundant calls
const rollMemoCache = new Map<string, { timestamp: number; value: number }>();
const ROLL_MEMO_TTL = 100; // 100ms TTL to prevent duplicate rolls

export function handleRoll(obj: TableObject, context: ActionHandlerContext) {
  if (obj.type === ItemType.DICE_OBJECT) {
    const dice = obj as any;

    // Check memo cache to prevent duplicate rolls within TTL
    const now = Date.now();
    const cached = rollMemoCache.get(dice.id);
    if (cached && now - cached.timestamp < ROLL_MEMO_TTL) {
      return; // Skip duplicate roll
    }

    // Update cache
    rollMemoCache.set(dice.id, { timestamp: now, value: 0 });

    // Dispatch roll action - roll only this dice, not the group
    context.dispatch({
      type: 'ROLL_PHYSICAL_DICE',
      payload: { id: dice.id, rollGroup: false }
    });

    // Clean up old cache entries periodically
    if (rollMemoCache.size > 100) {
      for (const [key, value] of rollMemoCache.entries()) {
        if (now - value.timestamp > ROLL_MEMO_TTL * 10) {
          rollMemoCache.delete(key);
        }
      }
    }
  }
}

// Clear memo cache (useful for testing or manual reset)
export function clearRollMemoCache() {
  rollMemoCache.clear();
}

// ============================================
// UNIVERSAL CLICK ACTION HANDLER
// ============================================

export function executeClickAction(
  obj: TableObject,
  action: string,
  context: ActionHandlerContext,
  event?: ClickActionEvent
): void {
  if (!action || action === 'none') return;

  switch (action) {
    // Card actions
    case 'flip':
      handleFlip(obj, context.dispatch);
      break;

    // Rotation actions
    case 'rotate':
    case 'rotateClockwise':
      handleRotateClockwise(obj, context.dispatch, context.state.objects);
      break;
    case 'rotateCounterClockwise':
      handleRotateCounterClockwise(obj, context.dispatch, context.state.objects);
      break;
    case 'resetRotation':
      handleResetRotation(obj, context.dispatch);
      break;

    // Deck actions
    case 'draw':
      handleDraw(obj, context);
      break;
    case 'playTopCard':
      handlePlayTopCard(obj, context, event);
      break;
    case 'shuffleDeck':
      handleShuffleDeck(obj, context);
      break;
    case 'searchDeck':
      handleSearchDeck(obj, context);
      break;
    case 'showTop':
      handleShowTop(obj, context.dispatch);
      break;
    case 'hideTop':
      handleHideTop(obj, context.dispatch);
      break;
    case 'millTopCard':
      handleMillTopCard(obj, context);
      break;
    case 'toBottom':
      handleToBottom(obj, context);
      break;
    case 'returnAll':
      handleReturnAll(obj, context);
      break;
    case 'returnAllAndShuffle':
      handleReturnAllAndShuffle(obj, context);
      break;
    case 'topDeck':
      handleTopDeck(obj, context);
      break;
    case 'piles':
      handlePiles(obj);
      break;

    // Card move actions
    case 'millToBottom':
      handleMillToBottom(obj, context);
      break;
    case 'moveToHand':
    case 'moveToTopDeck':
    case 'moveToBottomDeck':
    case 'moveToDiscard': {
      // Delegate to executeContextMenuAction to share logic with context menu
      const playerId = context.state.activePlayerId;
      console.log('[executeClickAction] action:', action, 'playerId:', playerId, 'obj.id:', obj.id);
      const params = {
        object: obj,
        dispatch: context.dispatch,
        state: {
          ...context.state,
          viewTransform: (context.state as any).viewTransform || { zoom: 1, scroll: { x: 0, y: 0 }, pixelsPerVU: 1.08 },
          zoom: (context.state as any).viewTransform?.zoom || 1
        },
        activePlayerId: playerId,
        isGM: (context as any).isGM,
        isShiftPressed: (context as any).isShiftPressed,
        isPoolPanel: context.poolZone?.panelId !== undefined
      };
      console.log('[executeClickAction] params.activePlayerId:', params.activePlayerId);
      executeContextMenuAction(action, params);
      break;
    }

    // Layer actions
    case 'bringToFront':
      handleBringToFront(obj, context.dispatch);
      break;
    case 'sendToBack':
      handleSendToBack(obj, context.dispatch);
      break;
    case 'layerUp':
      handleLayerUp(obj, context.dispatch);
      break;
    case 'layerDown':
      handleLayerDown(obj, context.dispatch);
      break;

    // Object management
    case 'delete':
      handleDelete(obj, context);
      break;
    case 'clone':
      handleClone(obj, context);
      break;
    case 'lock':
      handleLock(obj, context.dispatch);
      break;
    case 'pin':
    case 'pinToViewport':
    case 'unpinFromViewport': {
      // Delegate to executeContextMenuAction for proper coordinate calculation
      const actionToExecute = action === 'pin'
        ? ((obj as any).isPinnedToViewport ? 'unpinFromViewport' : 'pinToViewport')
        : action;

      // Build minimal params for context menu action
      const params = {
        object: obj,
        dispatch: context.dispatch,
        state: {
          ...context.state,
          viewTransform: (context.state as any).viewTransform || { zoom: 1, scroll: { x: 0, y: 0 }, pixelsPerVU: 1.08 },
          zoom: (context.state as any).viewTransform?.zoom || 1
        },
        activePlayerId: context.state.activePlayerId,
        isGM: (context as any).isGM,
        isShiftPressed: (context as any).isShiftPressed,
        isPoolPanel: context.poolZone?.panelId !== undefined
      };
      executeContextMenuAction(actionToExecute, params);
      break;
    }
    case 'show':
      handleShow(obj, context.dispatch);
      break;
    case 'hide':
      handleHide(obj, context.dispatch);
      break;

    // Swing actions
    case 'swingClockwise':
      handleSwingClockwise(obj, context.dispatch, context.state.objects);
      break;
    case 'swingCounterClockwise':
      handleSwingCounterClockwise(obj, context.dispatch, context.state.objects);
      break;

    // Dice actions
    case 'roll':
      handleRoll(obj, context);
      break;

    // Token State actions
    case 'toggleState1':
      handleToggleState1(obj, context.dispatch, context.state.objects);
      break;
    case 'nextState':
      handleNextState(obj, context.dispatch, context.state.objects);
      break;
    case 'previousState':
      handlePreviousState(obj, context.dispatch, context.state.objects);
      break;

    // Effect Template actions
    case 'togglePivotEditing':
      handleTogglePivotEditing(obj, context.dispatch);
      break;

    default:
      // Unknown action - ignore
  }
}

// ============================================
// EFFECT TEMPLATE ACTIONS
// ============================================

export function handleTogglePivotEditing(obj: TableObject, dispatch: Dispatch<Action>) {
  if (obj.type === ItemType.EFFECT_TEMPLATE) {
    dispatch({
      type: 'TOGGLE_PIVOT_EDITING',
      payload: obj.id
    });
  }
}

// ============================================
// TOKEN STATE ACTIONS
// ============================================

/**
 * Toggle between State 1 (first state) and Default (no state)
 * - If currently on State 1, revert to default
 * - If on any other state or default, switch to State 1
 */
export function handleToggleState1(obj: TableObject, dispatch: Dispatch<Action>, allObjects: Record<string, TableObject>) {
  if (obj.type === ItemType.TOKEN) {
    const token = obj as any;
    const currentStateId = token.currentStateId;

    // Get states from archetype
    let states: any[] = [];
    if (token.archetypeId) {
      const archetype = allObjects[token.archetypeId];
      if (archetype && archetype.type === ItemType.TOKEN_TYPE) {
        states = (archetype as any).states || [];
      }
    }

    if (states.length === 0) return;

    const firstStateId = states[0].id;

    // Toggle: if on State 1, go to default; otherwise go to State 1
    if (currentStateId === firstStateId) {
      // Revert to default state
      dispatch({
        type: 'UPDATE_OBJECT',
        payload: { id: obj.id, updates: { currentStateId: undefined } }
      });
    } else {
      // Set to State 1
      dispatch({
        type: 'UPDATE_OBJECT',
        payload: { id: obj.id, updates: { currentStateId: firstStateId } }
      });
    }
  }
}

/**
 * Switch to next state in the list (cyclic)
 * - If on default, go to State 1
 * - If on last state, go to default
 */
export function handleNextState(obj: TableObject, dispatch: Dispatch<Action>, allObjects: Record<string, TableObject>) {
  if (obj.type === ItemType.TOKEN) {
    const token = obj as any;
    const currentStateId = token.currentStateId;

    // Get states from archetype
    let states: any[] = [];
    if (token.archetypeId) {
      const archetype = allObjects[token.archetypeId];
      if (archetype && archetype.type === ItemType.TOKEN_TYPE) {
        states = (archetype as any).states || [];
      }
    }

    if (states.length === 0) return;

    const currentIndex = currentStateId ? states.findIndex((s: any) => s.id === currentStateId) : -1;
    const nextIndex = currentIndex + 1;

    if (nextIndex >= states.length) {
      // Past last state - revert to default
      dispatch({
        type: 'UPDATE_OBJECT',
        payload: { id: obj.id, updates: { currentStateId: undefined } }
      });
    } else {
      // Go to next state
      dispatch({
        type: 'UPDATE_OBJECT',
        payload: { id: obj.id, updates: { currentStateId: states[nextIndex].id } }
      });
    }
  }
}

/**
 * Switch to previous state in the list (cyclic)
 * - If on default, go to last state
 * - If on State 1, go to default
 * - If on State 2+, go to previous state
 */
export function handlePreviousState(obj: TableObject, dispatch: Dispatch<Action>, allObjects: Record<string, TableObject>) {
  if (obj.type === ItemType.TOKEN) {
    const token = obj as any;
    const currentStateId = token.currentStateId;

    // Get states from archetype or token itself
    let states: any[] = [];
    if (token.states && token.states.length > 0) {
      states = token.states;
    } else if (token.archetypeId) {
      const archetype = allObjects[token.archetypeId];
      if (archetype && archetype.type === ItemType.TOKEN_TYPE) {
        states = archetype.states || [];
      }
    }

    if (states.length === 0) return;

    const currentIndex = currentStateId ? states.findIndex((s: any) => s.id === currentStateId) : -1;
    // Previous State logic (opposite of Next State):
    // -1 (default) → last state
    // 0 (state 1) → -1 (default)
    // 1 (state 2) → 0 (state 1)
    // etc.
    if (currentIndex === -1) {
      // From default, go to last state
      dispatch({
        type: 'UPDATE_OBJECT',
        payload: { id: obj.id, updates: { currentStateId: states[states.length - 1].id } }
      });
    } else if (currentIndex === 0) {
      // From first state, go to default
      dispatch({
        type: 'UPDATE_OBJECT',
        payload: { id: obj.id, updates: { currentStateId: undefined } }
      });
    } else {
      // From other states, go to previous state
      dispatch({
        type: 'UPDATE_OBJECT',
        payload: { id: obj.id, updates: { currentStateId: states[currentIndex - 1].id } }
      });
    }
  }
}

// ============================================
// ACTION VALIDATION
// ============================================

export function canExecuteAction(
  obj: TableObject,
  action: string,
  isGM: boolean,
  allowedActions?: string[]
): boolean {
  // GM can do anything unless restricted
  if (isGM) {
    return !allowedActions || allowedActions.length === 0 || allowedActions.includes(action);
  }

  // Players need explicit permission
  return allowedActions?.includes(action) ?? false;
}
