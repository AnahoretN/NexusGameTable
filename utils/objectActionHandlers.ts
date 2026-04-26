/**
 * Universal Object Action Handlers
 * Consolidated action handlers for objects (cards, decks, tokens, etc.)
 * Used by both Tabletop and PoolTabletop to eliminate code duplication
 */

import { TableObject, ItemType, Deck as DeckType, Card as CardType, CardOrientation } from '../types';
import { Dispatch } from 'react';
import { Action } from '../store/GameContext';

// ============================================
// ACTION HANDLER CONFIGURATION
// ============================================

export interface ActionHandlerContext {
  dispatch: Dispatch<Action>;
  state: {
    objects: Record<string, TableObject>;
    activePlayerId?: string;
    diceGroups?: any[];
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
}

export interface ClickActionEvent {
  clientX: number;
  clientY: number;
  shiftKey?: boolean;
}

// ============================================
// ROTATION ACTIONS
// ============================================

export function handleRotate(obj: TableObject, dispatch: Dispatch<Action>) {
  dispatch({ type: 'ROTATE_OBJECT', payload: { id: obj.id } });
}

export function handleRotateClockwise(obj: TableObject, dispatch: Dispatch<Action>) {
  dispatch({ type: 'ROTATE_OBJECT', payload: { id: obj.id } });
}

export function handleRotateCounterClockwise(obj: TableObject, dispatch: Dispatch<Action>) {
  const rotationStep = (obj as any).rotationStep ?? 45;
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
  dispatch({ type: 'LAYER_UP', payload: { id: obj.id } });
}

export function handleLayerDown(obj: TableObject, dispatch: Dispatch<Action>) {
  dispatch({ type: 'LAYER_DOWN', payload: { id: obj.id } });
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

export function handleMoveToHand(obj: TableObject, context: ActionHandlerContext) {
  if (obj.type === ItemType.CARD && context.state.activePlayerId) {
    context.dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: obj.id,
        updates: { location: 'CURSOR_SLOT' as any },
        ownerId: context.state.activePlayerId,
        isOnTable: false
      }
    });
  }
}

export function handleMoveToTopDeck(obj: TableObject, context: ActionHandlerContext) {
  if (obj.type === ItemType.CARD && (obj as CardType).deckId) {
    context.dispatch({
      type: 'RETURN_CARD_TO_DECK_TOP',
      payload: { cardId: obj.id, deckId: (obj as CardType).deckId }
    });
  }
}

export function handleMoveToBottomDeck(obj: TableObject, context: ActionHandlerContext) {
  if (obj.type === ItemType.CARD && (obj as CardType).deckId) {
    context.dispatch({
      type: 'RETURN_CARD_TO_DECK_BOTTOM',
      payload: { cardId: obj.id, deckId: (obj as CardType).deckId }
    });
  }
}

export function handleMoveToDiscard(obj: TableObject, context: ActionHandlerContext) {
  if (obj.type === ItemType.CARD && (obj as CardType).deckId) {
    const card = obj as CardType;
    const deck = context.state.objects[card.deckId] as DeckType | undefined;
    if (deck?.piles) {
      const millPile = deck.piles.find(p => p.isMillPile);
      if (millPile) {
        context.dispatch({
          type: 'ADD_CARD_TO_PILE',
          payload: { deckId: deck.id, pileId: millPile.id, cardId: obj.id }
        });
      }
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

export function handleClone(obj: TableObject, dispatch: Dispatch<Action>) {
  dispatch({ type: 'CLONE_OBJECT', payload: { id: obj.id } });
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
    payload: { id: obj.id, updates: { isPinnedToViewport: false } }
  });
}

export function handleHide(obj: TableObject, dispatch: Dispatch<Action>) {
  dispatch({
    type: 'UPDATE_OBJECT',
    payload: { id: obj.id, updates: { isPinnedToViewport: true } }
  });
}

// ============================================
// SWING ACTIONS
// ============================================

export function handleSwingClockwise(obj: TableObject, dispatch: Dispatch<Action>) {
  dispatch({
    type: 'UPDATE_OBJECT',
    payload: { id: obj.id, updates: { rotation: (obj.rotation || 0) + 15 } }
  });
}

export function handleSwingCounterClockwise(obj: TableObject, dispatch: Dispatch<Action>) {
  dispatch({
    type: 'UPDATE_OBJECT',
    payload: { id: obj.id, updates: { rotation: (obj.rotation || 0) - 15 } }
  });
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
      handleRotateClockwise(obj, context.dispatch);
      break;
    case 'rotateCounterClockwise':
      handleRotateCounterClockwise(obj, context.dispatch);
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
      handleMoveToHand(obj, context);
      break;
    case 'moveToTopDeck':
      handleMoveToTopDeck(obj, context);
      break;
    case 'moveToBottomDeck':
      handleMoveToBottomDeck(obj, context);
      break;
    case 'moveToDiscard':
      handleMoveToDiscard(obj, context);
      break;

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
      handleClone(obj, context.dispatch);
      break;
    case 'lock':
      handleLock(obj, context.dispatch);
      break;
    case 'show':
      handleShow(obj, context.dispatch);
      break;
    case 'hide':
      handleHide(obj, context.dispatch);
      break;

    // Swing actions
    case 'swingClockwise':
      handleSwingClockwise(obj, context.dispatch);
      break;
    case 'swingCounterClockwise':
      handleSwingCounterClockwise(obj, context.dispatch);
      break;

    // Dice actions
    case 'roll':
      handleRoll(obj, context);
      break;

    default:
      // Unknown action - ignore
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
