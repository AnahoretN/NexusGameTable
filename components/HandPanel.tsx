import { t as translate, Locale } from '../utils/translations';

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useGame } from '../store/GameContext';
import { Card, Deck as DeckType, ItemType, CardShape, CardLocation, TableObject, WindowType, AppLanguage } from '../types';
import { Card as CardComponent } from './Card';
import { ContextMenu } from './ContextMenu';
import { getCardSettings, getCardDimensions } from '../utils/cardUtils';
import { getCardButtonConfigsWithActions } from '../utils/buttonConfig';
import { MAIN_MENU_WIDTH } from '../constants';
import { Settings } from 'lucide-react';
import { useTabCardScale } from '../hooks/useTabCardScale';

interface HandPanelProps {
  width?: number;
  isDragTarget?: boolean;
  isCollapsed?: boolean;
  language?: AppLanguage;
}

export const HandPanel: React.FC<HandPanelProps> = ({
  width = MAIN_MENU_WIDTH,
  isDragTarget = false,
  isCollapsed = false,
  language = 'en'
}) => {
  const { state, dispatch } = useGame();
  const containerRef = useRef<HTMLDivElement>(null);
  const scaleMenuRef = useRef<HTMLDivElement>(null);
  const tabScaleMenuRef = useRef<HTMLDivElement>(null);


  // State for selected player hand tab (whose hand we're viewing)
  const [selectedPlayerId, setSelectedPlayerId] = useState(state.activePlayerId);

  // Use per-tab scale hook for the currently selected player
  const { scale: cardScale, setTabCardScale } = useTabCardScale(selectedPlayerId);

  // Get current player info
  const currentPlayer = state.players.find(p => p.id === state.activePlayerId);
  const isGM = currentPlayer?.isGM ?? false;

  // Context menu state for cards in hand
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; object: TableObject } | null>(null);
  // Context menu state for hand scale (right-click on empty space in hand panel)
  const [scaleMenu, setScaleMenu] = useState<{ x: number; y: number } | null>(null);
  // Context menu state for tab scale (right-click on tab)
  const [tabScaleMenu, setTabScaleMenu] = useState<{ x: number; y: number; playerId: string } | null>(null);
  // Edit mode for percentage input
  const [isEditingPercentage, setIsEditingPercentage] = useState(false);
  const [editedPercentage, setEditedPercentage] = useState('');

  // Local drag state for reorder
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);

  // Long-press state for adding cards to cursor slot
  const longPressTimerRef = useRef<number | null>(null);
  const longPressCardRef = useRef<{ cardId: string; startX: number; startY: number } | null>(null);

  // Local state for cursor slot hover (purple ring effect)
  const [isCursorOverHand, setIsCursorOverHand] = useState(false);

  // Listen for cursor slot move events to show purple ring when cursor with cards is over hand panel
  useEffect(() => {
    const handleCursorSlotMove = (e: Event) => {
      const customEvent = e as CustomEvent<{
        x: number;
        y: number;
        isOverMainMenu: boolean;
        hasCards: boolean;
      }>;

      const { x, y, hasCards } = customEvent.detail;

      if (!hasCards) {
        setIsCursorOverHand(false);
        return;
      }

      // Check if cursor is over hand panel using container's bounding rect
      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const isOver = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
        setIsCursorOverHand(isOver);
      } else {
        setIsCursorOverHand(false);
      }
    };

    const handleCursorSlotDrop = () => {
      setIsCursorOverHand(false);
    };

    window.addEventListener('cursor-slot-move', handleCursorSlotMove);
    window.addEventListener('cursor-slot-drop-to-hand', handleCursorSlotDrop);

    return () => {
      window.removeEventListener('cursor-slot-move', handleCursorSlotMove);
      window.removeEventListener('cursor-slot-drop-to-hand', handleCursorSlotDrop);
    };
  }, []);

  // Cleanup long-press timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  // Get cards in hand for selected player (whose hand tab we're viewing), sorted by handCardOrder
  const cards = useMemo(() => {
    const player = state.players.find(p => p.id === selectedPlayerId);
    const handCardOrder = player?.handCardOrder || [];

    // Get all cards in hand for selected player (exclude cards in cursor slot)
    const handCards = Object.values(state.objects).filter(o =>
      o.type === 'CARD' &&
      (o as Card).location === 'HAND' &&
      (o as Card).ownerId === selectedPlayerId &&
      !(o as Card).inCursorSlot // Don't show cards that are in cursor slot
    ) as Card[];

    // Sort by handCardOrder (first in order = top-right position)
    const cardOrderMap = new Map(handCardOrder.map((id, index) => [id, index]));
    return handCards.sort((a, b) => {
      const aIndex = cardOrderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bIndex = cardOrderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return aIndex - bIndex;
    });
  }, [state.objects, selectedPlayerId, state.players]);

  // Determine if we're viewing another player's hand (not our own)
  // In that case, show cards face down (as card backs)
  const isViewingOpponentHand = selectedPlayerId !== state.activePlayerId;

  // Group cards by shape, maintaining order within each group
  const cardsByShape = useMemo(() => {
    const groups: Record<string, { cards: Card[]; shape: CardShape | 'Mixed' }> = {};

    cards.forEach(card => {
      const shape = card.shape ?? CardShape.POKER;
      if (!groups[shape]) {
        groups[shape] = { cards: [], shape };
      }
      groups[shape].cards.push(card);
    });

    // Convert to array and sort groups by shape name for consistent display
    return Object.values(groups).sort((a, b) => {
      if (a.shape === 'Mixed') return 1;
      if (b.shape === 'Mixed') return -1;
      return a.shape.localeCompare(b.shape);
    });
  }, [cards]);

  // Memoized getCardDimensions
  const computeCardDimensions = useCallback((card: Card) => {
    const deck = card.deckId ? (state.objects[card.deckId] as DeckType | undefined) : undefined;
    return getCardDimensions(card, deck, cardScale, 1);
  }, [state.objects, cardScale]);

  // Memoized getCardSettings
  const computeCardSettings = useCallback((card: Card) => {
    return getCardSettings(card, state.objects);
  }, [state.objects]);

  // Action handlers
  const handleFlip = useCallback((cardId: string) => {
    dispatch({ type: 'FLIP_CARD', payload: { cardId } });
  }, [dispatch]);

  const handleRotate = useCallback((cardId: string) => {
    // Use card's rotationStep (or default 45) from settings
    const obj = state.objects[cardId] as any;
    const rotationStep = obj?.rotationStep ?? 45;
    dispatch({ type: 'ROTATE_OBJECT', payload: { id: cardId, angle: rotationStep } });
  }, [dispatch, state.objects]);

  const handleRotateClockwise = useCallback((cardId: string) => {
    // Rotate clockwise by rotationStep
    const obj = state.objects[cardId] as any;
    const rotationStep = obj?.rotationStep ?? 45;
    dispatch({ type: 'ROTATE_OBJECT', payload: { id: cardId, angle: rotationStep } });
  }, [dispatch, state.objects]);

  const handleRotateCounterClockwise = useCallback((cardId: string) => {
    // Rotate counter-clockwise by rotationStep
    const obj = state.objects[cardId] as any;
    const rotationStep = obj?.rotationStep ?? 45;
    dispatch({ type: 'ROTATE_OBJECT', payload: { id: cardId, angle: -rotationStep } });
  }, [dispatch, state.objects]);

  const handleSwingingClockwise = useCallback((cardId: string) => {
    dispatch({ type: 'SWING_CLOCKWISE', payload: { id: cardId } });
  }, [dispatch]);

  const handleSwingingCounterClockwise = useCallback((cardId: string) => {
    dispatch({ type: 'SWING_COUNTER_CLOCKWISE', payload: { id: cardId } });
  }, [dispatch]);

  const handleLayerUp = useCallback((cardId: string) => {
    dispatch({ type: 'MOVE_LAYER_UP', payload: { id: cardId } });
  }, [dispatch]);

  const handleLayerDown = useCallback((cardId: string) => {
    dispatch({ type: 'MOVE_LAYER_DOWN', payload: { id: cardId } });
  }, [dispatch]);

  const handleClone = useCallback((cardId: string) => {
    dispatch({ type: 'CLONE_OBJECT', payload: { id: cardId } });
  }, [dispatch]);

  // "Move to" action handlers
  const handleMoveToHand = useCallback((cardId: string) => {
    const card = state.objects[cardId] as Card;
    if (card) {
      dispatch({
        type: 'UPDATE_OBJECT',
        payload: {
          id: cardId,
          location: CardLocation.HAND,
          ownerId: selectedPlayerId,
          isOnTable: false
        }
      });
    }
  }, [dispatch, state.objects, selectedPlayerId]);

  const handleMoveToTopDeck = useCallback((cardId: string) => {
    const card = state.objects[cardId] as Card;
    if (card && card.deckId) {
      dispatch({ type: 'RETURN_CARD_TO_DECK_TOP', payload: { cardId, deckId: card.deckId }});
    }
  }, [dispatch, state.objects]);

  const handleMoveToBottomDeck = useCallback((cardId: string) => {
    const card = state.objects[cardId] as Card;
    if (card && card.deckId) {
      dispatch({ type: 'RETURN_CARD_TO_DECK_BOTTOM', payload: { cardId, deckId: card.deckId }});
    }
  }, [dispatch, state.objects]);

  const handleMoveToDiscard = useCallback((cardId: string) => {
    const card = state.objects[cardId] as Card;
    if (card && card.deckId) {
      const deck = state.objects[card.deckId] as DeckType | undefined;
      if (deck?.piles) {
        const millPile = deck.piles.find(p => p.isMillPile);
        if (millPile) {
          dispatch({
            type: 'ADD_CARD_TO_PILE',
            payload: { deckId: deck.id, pileId: millPile.id, cardId }
          });
        }
      }
    }
  }, [dispatch, state.objects]);

  // Context menu handler for individual cards
  const handleCardContextMenu = useCallback((e: React.MouseEvent, card: Card) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, object: card });
  }, []);

  // Helper function to calculate safe menu position within viewport
  const getSafeMenuPosition = useCallback((x: number, y: number): { x: number; y: number } => {
    // Estimated menu dimensions
    const menuWidth = 280;
    const menuHeight = 180;
    const padding = 8;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let safeX = x;
    let safeY = y;

    // Adjust horizontal position if menu would go off right edge
    if (safeX + menuWidth > viewportWidth - padding) {
      safeX = viewportWidth - menuWidth - padding;
    }

    // Adjust if menu would go off left edge
    if (safeX < padding) {
      safeX = padding;
    }

    // Adjust vertical position if menu would go off bottom edge
    if (safeY + menuHeight > viewportHeight - padding) {
      safeY = viewportHeight - menuHeight - padding;
    }

    // Adjust if menu would go off top edge
    if (safeY < padding) {
      safeY = padding;
    }

    return { x: safeX, y: safeY };
  }, []);

  // Context menu handler for hand panel empty space (shows scale options)
  const handlePanelContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const safePos = getSafeMenuPosition(e.clientX, e.clientY);
    setScaleMenu(safePos);
  }, [getSafeMenuPosition]);

  // Context menu handler for tab right-click (shows tab scale options)
  const handleTabContextMenu = useCallback((e: React.MouseEvent, playerId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const safePos = getSafeMenuPosition(e.clientX, e.clientY);
    setTabScaleMenu({ ...safePos, playerId });
  }, [getSafeMenuPosition]);

  // Handle context menu actions for cards
  const handleContextMenuAction = useCallback((action: string) => {
    if (!contextMenu) return;
    const object = contextMenu.object as Card;

    switch (action) {
      case 'configure':
        // Dispatch custom event for opening card settings (handled by UIObjectRenderer)
        window.dispatchEvent(new CustomEvent('open-card-settings', {
          detail: { cardId: object.id }
        }));
        setContextMenu(null);
        return;
      case 'rotate':
        dispatch({ type: 'ROTATE_OBJECT', payload: { id: object.id, angle: 90 } });
        break;
      case 'rotateClockwise':
        dispatch({ type: 'ROTATE_OBJECT', payload: { id: object.id, angle: object.rotationStep ?? 45 } });
        break;
      case 'rotateCounterClockwise':
        dispatch({ type: 'ROTATE_OBJECT', payload: { id: object.id, angle: -(object.rotationStep ?? 45) } });
        break;
      case 'swingClockwise':
        dispatch({ type: 'SWING_CLOCKWISE', payload: { id: object.id } });
        break;
      case 'swingCounterClockwise':
        dispatch({ type: 'SWING_COUNTER_CLOCKWISE', payload: { id: object.id } });
        break;
      case 'layerUp':
        dispatch({ type: 'MOVE_LAYER_UP', payload: { id: object.id } });
        break;
      case 'layerDown':
        dispatch({ type: 'MOVE_LAYER_DOWN', payload: { id: object.id } });
        break;
      case 'clone':
        dispatch({ type: 'CLONE_OBJECT', payload: { id: object.id } });
        break;
      case 'moveToHand':
        // Already in hand, do nothing
        break;
      case 'moveToTopDeck':
        if (object.deckId) {
          dispatch({ type: 'RETURN_CARD_TO_DECK_TOP', payload: { cardId: object.id, deckId: object.deckId } });
        }
        break;
      case 'moveToBottomDeck':
        if (object.deckId) {
          dispatch({ type: 'RETURN_CARD_TO_DECK_BOTTOM', payload: { cardId: object.id, deckId: object.deckId } });
        }
        break;
      case 'moveToDiscard': {
        if (object.deckId) {
          const deck = state.objects[object.deckId] as DeckType | undefined;
          if (deck?.piles) {
            const millPile = deck.piles.find(p => p.isMillPile);
            if (millPile) {
              dispatch({ type: 'ADD_CARD_TO_PILE', payload: { deckId: deck.id, pileId: millPile.id, cardId: object.id } });
            }
          }
        }
        break;
      }
      case 'delete':
        dispatch({ type: 'DELETE_OBJECT', payload: { id: object.id } });
        break;
      case 'toggleHide':
        const isHidden = object.hidden === true;
        dispatch({ type: 'UPDATE_OBJECT', payload: { id: object.id, hidden: !isHidden } });
        break;
      case 'flip':
        dispatch({ type: 'FLIP_CARD', payload: { cardId: object.id } });
        break;
      case 'lock':
        dispatch({ type: 'UPDATE_OBJECT', payload: { id: object.id, locked: !object.locked } });
        break;
      case 'pinToViewport':
      case 'unpinFromViewport':
        dispatch({ type: 'UPDATE_OBJECT', payload: { id: object.id, isPinnedToViewport: action === 'pinToViewport' } });
        break;
      default:
        // Handle pile-specific move actions
        if (action.startsWith('moveToPile-')) {
          const pileId = action.replace('moveToPile-', '');
          if (object.deckId) {
            dispatch({ type: 'ADD_CARD_TO_PILE', payload: { deckId: object.deckId, pileId, cardId: object.id } });
          }
        }
        break;
    }
    setContextMenu(null);
  }, [contextMenu, dispatch, state.objects]);

  // Scale handlers - use per-tab scale
  const handleScaleChange = useCallback((newScale: number) => {
    setTabCardScale(newScale);
  }, [setTabCardScale]);

  // Handle card mouse down - start reorder drag or add to cursor slot with Shift or long-press
  // Only works for own hand (not when viewing opponent's hand)
  const handleCardMouseDown = useCallback((e: React.MouseEvent, cardId: string, index: number, _cardElement: HTMLDivElement | null) => {
    // Only left click
    if (e.button !== 0) return;

    // Don't allow interactions when viewing opponent's hand
    if (isViewingOpponentHand) return;

    // Don't drag if clicking on action buttons
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;

    // Shift+click: add to cursor slot immediately
    if (e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      window.dispatchEvent(new CustomEvent('add-to-cursor-slot', {
        detail: { cardId, clientX: e.clientX, clientY: e.clientY }
      }));
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    // Start long-press timer (500ms) - if completed, add card to cursor slot
    longPressCardRef.current = {
      cardId,
      startX: e.clientX,
      startY: e.clientY
    };

    longPressTimerRef.current = window.setTimeout(() => {
      if (longPressCardRef.current) {
        window.dispatchEvent(new CustomEvent('add-to-cursor-slot', {
          detail: {
            cardId: longPressCardRef.current.cardId,
            clientX: e.clientX,
            clientY: e.clientY,
            source: 'hold' // Mark as coming from long-press, so it drops on mouseup
          }
        }));
        longPressCardRef.current = null;
        longPressTimerRef.current = null;
        setDragIndex(null); // Cancel reorder drag
      }
    }, 250); // 250ms long-press

    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
    setDragIndex(index);
  }, [isViewingOpponentHand]);

  // Handle mouse move for reorder preview
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // Check for long-press movement - if mouse moves while holding on a card, add to slot immediately
    if (longPressCardRef.current) {
      const moveThreshold = 5; // pixels
      const dx = e.clientX - longPressCardRef.current.startX;
      const dy = e.clientY - longPressCardRef.current.startY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance >= moveThreshold) {
        // Mouse moved enough - cancel timer and add to slot immediately
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        window.dispatchEvent(new CustomEvent('add-to-cursor-slot', {
          detail: {
            cardId: longPressCardRef.current.cardId,
            clientX: e.clientX,
            clientY: e.clientY,
            source: 'hold' // Mark as coming from drag, so it drops on mouseup
          }
        }));
        longPressCardRef.current = null;
        setDragIndex(null); // Cancel reorder drag
        return;
      }
    }

    if (dragIndex === null) return;

    // Check if we moved enough to consider it a drag
    if (dragStartPosRef.current) {
      const dx = e.clientX - dragStartPosRef.current.x;
      const dy = e.clientY - dragStartPosRef.current.y;
      const moveThreshold = 5;

      if (Math.abs(dx) < moveThreshold && Math.abs(dy) < moveThreshold) {
        return;
      }
    }

    // Find which card we're hovering over
    const container = containerRef.current;
    if (!container) return;

    const scrollContainer = container.querySelector('.custom-scrollbar') as HTMLElement;
    if (!scrollContainer) return;

    const cards = scrollContainer.querySelectorAll('[data-card-index]');

    cards.forEach((cardEl) => {
      const index = parseInt(cardEl.getAttribute('data-card-index') || '-1');
      if (index !== dragIndex && index >= 0) {
        const rect = cardEl.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top && e.clientY <= rect.bottom) {
          setDragOverIndex(index);
        }
      }
    });
  }, [dragIndex]);

  // Handle mouse up to complete reorder or drop to tabletop
  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    // Clear long-press timer if mouse is released before timeout
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressCardRef.current = null;

    if (dragIndex === null) return;

    // Check if we're dropping outside hand panel (to tabletop)
    const container = containerRef.current;
    if (container && !container.contains(e.target as Node)) {
      // Drop to tabletop - will be handled by tabletop listener
      setDragIndex(null);
      setDragOverIndex(null);
      dragStartPosRef.current = null;
      return;
    }

    // Check if we're reordering within hand
    if (dragOverIndex !== null && dragOverIndex !== dragIndex) {
      // Reorder cards
      const newCards = [...cards];
      const [movedCard] = newCards.splice(dragIndex, 1);
      newCards.splice(dragOverIndex, 0, movedCard);

      const newCardOrder = newCards.map(c => c.id);
      dispatch({
        type: 'UPDATE_HAND_CARD_ORDER',
        payload: { playerId: state.activePlayerId, cardOrder: newCardOrder }
      });
    }

    setDragIndex(null);
    setDragOverIndex(null);
    dragStartPosRef.current = null;
  }, [dragIndex, dragOverIndex, cards, state.activePlayerId, dispatch]);

  // Set up global mouse listeners during drag
  useEffect(() => {
    if (dragIndex === null) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      handleMouseMove(e as any);
    };

    const handleGlobalMouseUp = (e: MouseEvent) => {
      handleMouseUp(e as any);
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [dragIndex, handleMouseMove, handleMouseUp]);

  // Listen for cursor slot drop events to add cards to hand
  useEffect(() => {
    const handleCursorSlotDrop = (e: Event) => {
      const customEvent = e as CustomEvent<{
        items: Array<{
          id: string;
          type: string;
          name?: string;
          frontFaceUrl?: string;
          backFaceUrl?: string;
          deckId?: string;
          width?: number;
          height?: number;
          [key: string]: any;
        }>;
      }>;

      const items = customEvent.detail.items;
      if (!items || items.length === 0) return;

      // Filter only cards (tokens can't be in hand)
      const cards = items.filter(item => item.type === ItemType.CARD);

      if (cards.length === 0) return;

      // Get current player's hand card order
      const player = state.players.find(p => p.id === state.activePlayerId);
      const currentHandOrder = player?.handCardOrder || [];

      // New card IDs to add at the beginning (top-right position)
      const newCardIds = cards.map(c => c.id);

      // New order: new cards first, then existing cards
      const newCardOrder = [...newCardIds, ...currentHandOrder];

      // Update hand card order for active player
      dispatch({
        type: 'UPDATE_HAND_CARD_ORDER',
        payload: { playerId: state.activePlayerId, cardOrder: newCardOrder }
      });

      // Add each card to the game state with hand location
      cards.forEach(card => {
        const cardPayload: Card = {
          id: card.id,
          type: ItemType.CARD,
          x: 0, // Cards in hand don't need world coordinates
          y: 0,
          rotation: 0,
          content: card.content || card.frontFaceUrl || '', // Use content (main image URL) first
          name: card.name || 'Card',
          locked: false,
          location: 'HAND' as any,
          ownerId: state.activePlayerId,
          isOnTable: false,
          faceUp: true,
          ...(card.frontFaceUrl && { frontFaceUrl: card.frontFaceUrl }),
          ...(card.backFaceUrl && { backFaceUrl: card.backFaceUrl }),
          ...(card.deckId && { deckId: card.deckId }),
          ...(card.width && { width: card.width }),
          ...(card.height && { height: card.height }),
          // Preserve sprite properties for proper card display
          ...(card.spriteUrl && { spriteUrl: card.spriteUrl }),
          ...(card.spriteIndex !== undefined && { spriteIndex: card.spriteIndex }),
          ...(card.spriteColumns && { spriteColumns: card.spriteColumns }),
          ...(card.spriteRows && { spriteRows: card.spriteRows }),
          ...(card.shape && { shape: card.shape }),
        };

        dispatch({
          type: 'ADD_OBJECT',
          payload: cardPayload
        });
      });
    };

    window.addEventListener('cursor-slot-drop-to-hand', handleCursorSlotDrop);
    return () => window.removeEventListener('cursor-slot-drop-to-hand', handleCursorSlotDrop);
  }, [dispatch, state.objects, state.activePlayerId, state.players, selectedPlayerId]);

  // Reset to own hand when active player changes
  useEffect(() => {
    setSelectedPlayerId(state.activePlayerId);
  }, [state.activePlayerId]);

  // Debug: log menu state changes
  useEffect(() => {
    if (tabScaleMenu) {
      console.log('[HandPanel] tabScaleMenu rendered:', tabScaleMenu);
    }
  }, [tabScaleMenu]);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: Event) => {
      const target = e.target as Node;

      // Check if click is inside scale menu
      if (scaleMenuRef.current && scaleMenuRef.current.contains(target)) {
        return;
      }

      // Check if click is inside tab scale menu
      if (tabScaleMenuRef.current && tabScaleMenuRef.current.contains(target)) {
        return;
      }

      // Close context menu (click outside - ContextMenu component handles its own closing)
      if (contextMenu) {
        setContextMenu(null);
      }

      // Close scale menu
      if (scaleMenu) {
        setScaleMenu(null);
      }

      // Close tab scale menu
      if (tabScaleMenu) {
        setTabScaleMenu(null);
      }
    };
    if (contextMenu || scaleMenu || tabScaleMenu) {
      // Delay adding listener to avoid immediate closing after contextmenu
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 100);
      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [contextMenu, scaleMenu, tabScaleMenu]);

  return (
    <div
      ref={containerRef}
      data-hand-panel="true"
      className="h-full flex flex-col transition-all"
      style={{ width }}
    >
      {/* Player hand tabs - show when not collapsed and multiple players exist */}
      {!isCollapsed && state.players.length > 1 && (
        <div className="flex flex-wrap gap-1 px-1 pt-1 pb-0 border-b border-slate-700">
          {state.players.map(player => {
            const isActive = player.id === selectedPlayerId;
            const isOwnHand = player.id === state.activePlayerId;
            const currentPlayer = state.players.find(p => p.id === state.activePlayerId);
            const isCurrentPlayerGM = currentPlayer?.isGM ?? false;

            // Only show GM hand tabs if:
            // 1. It's the current player's own hand, OR
            // 2. The current player is a GM
            const playerIsGM = state.players.find(p => p.id === player.id)?.isGM ?? false;
            const shouldShowTab = isOwnHand || isCurrentPlayerGM || !playerIsGM;

            if (!shouldShowTab) return null;

            const cardCount = Object.values(state.objects).filter(o =>
              o.type === 'CARD' &&
              (o as Card).location === 'HAND' &&
              (o as Card).ownerId === player.id &&
              !(o as Card).inCursorSlot
            ).length;

            return (
              <button
                key={player.id}
                onClick={() => setSelectedPlayerId(player.id)}
                onContextMenu={(e) => handleTabContextMenu(e, player.id)}
                className={`px-2 py-1 text-xs font-medium rounded-t transition-colors relative ${
                  isActive
                    ? isOwnHand
                      ? 'bg-blue-600 text-white'
                      : 'bg-orange-600 text-white'
                    : isOwnHand
                      ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                <span className="flex items-center gap-1">
                  {isOwnHand ? (
                    <span>{translate('My Hand', language as Locale)} ({cardCount})</span>
                  ) : (
                    <span>{player.name} ({cardCount})</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Single player header with settings button - show when not collapsed and only one player */}
      {!isCollapsed && state.players.length === 1 && (
        <div className="flex items-center justify-between px-2 py-1 border-b border-slate-700">
          <span className="text-xs text-slate-400">
            {translate('My Hand', language as Locale)}
          </span>
          <button
            onClick={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const safePos = getSafeMenuPosition(rect.left, rect.bottom + 5);
              setScaleMenu(safePos);
            }}
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
            title={translate('Card Scale Settings', language as Locale)}
          >
            <Settings size={14} />
          </button>
        </div>
      )}

      {/* Cards Grid - outer scroll container - hidden when collapsed */}
      {!isCollapsed && (
        <>
          <style>{`
            [data-hand-panel="true"] .hand-panel-scrollbar::-webkit-scrollbar {
              width: 16px !important;
            }
          `}</style>
          {/* Scroll container with purple ring inside - ring stays fixed at viewport */}
          <div className="flex-1 hand-panel-scrollbar overflow-y-auto relative">
            {/* Purple ring overlay - absolute positioned relative to scroll container viewport */}
            {(isDragTarget || isCursorOverHand) && (
              <div className="absolute inset-0 pointer-events-none rounded ring-4 ring-purple-500 ring-inset z-[200]" />
            )}
            {/* Inner content container */}
            <div className="p-1" onContextMenu={handlePanelContextMenu}>
          {cards.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[200px] text-slate-500">
              <p className="text-sm">
                {isViewingOpponentHand
                  ? `${state.players.find(p => p.id === selectedPlayerId)?.name || translate('Player', language as Locale)} ${translate('has no cards', language as Locale)}`
                  : translate('No cards in hand', language as Locale)}
              </p>
              <p className="text-xs mt-1">
                {isViewingOpponentHand
                  ? translate('Cards will be shown here when they appear', language as Locale)
                  : translate('Draw cards from a deck', language as Locale)}
              </p>
            </div>
          ) : (
            <>
              {cardsByShape.map((group, groupIndex) => {
                const groupOffset = groupIndex === 0 ? 0 : cardsByShape.slice(0, groupIndex).reduce((sum, g) => sum + g.cards.length, 0);

                return (
                  <div key={group.shape} className="mb-3">
                    <div className="text-xs text-gray-500 font-bold mb-1 px-1">
                      {group.shape === CardShape.HEX ? 'HEX'
                        : group.shape === CardShape.TRIANGLE ? 'TRIANGLE'
                          : group.shape === CardShape.CIRCLE ? 'CIRCLE'
                          : group.shape === CardShape.SQUARE ? 'SQUARE'
                          : group.shape === CardShape.MINI_US ? 'MINI US'
                          : group.shape === CardShape.MINI_EURO ? 'MINI EURO'
                          : group.shape === CardShape.BRIDGE ? 'BRIDGE'
                          : group.shape === CardShape.POKER ? 'POKER'
                          : group.shape}
                    </div>
                    <div className="flex flex-wrap gap-[2px] w-full">
                      {group.cards.map((card, index) => {
                        const cardSettings = computeCardSettings(card);
                        const cardActionButtons = cardSettings.cardActionButtons;
                        const { width: cardWidth, height: cardHeight } = computeCardDimensions(card);
                        const deck = card.deckId ? (state.objects[card.deckId] as DeckType | undefined) : undefined;

                        const buttons = getCardButtonConfigsWithActions(
                          cardActionButtons,
                          {
                            onFlip: () => handleFlip(card.id),
                            onRotateClockwise: () => handleRotateClockwise(card.id),
                            onRotateCounterClockwise: () => handleRotateCounterClockwise(card.id),
                            onSwingingClockwise: () => handleSwingingClockwise(card.id),
                            onSwingingCounterClockwise: () => handleSwingingCounterClockwise(card.id),
                            onLayerUp: () => handleLayerUp(card.id),
                            onLayerDown: () => handleLayerDown(card.id),
                            onClone: () => handleClone(card.id),
                            onMoveToHand: () => handleMoveToHand(card.id),
                            onMoveToTopDeck: () => handleMoveToTopDeck(card.id),
                            onMoveToBottomDeck: () => handleMoveToBottomDeck(card.id),
                            onMoveToDiscard: () => handleMoveToDiscard(card.id)
                          },
                          card.faceUp ?? true,
                          card.locked ?? false,
                          language
                        );

                        const actualIndex = groupOffset + index;
                        const isDragging = dragIndex === actualIndex;
                        const isDragOver = dragOverIndex === actualIndex;

                        // When viewing opponent's hand, create a modified card that appears face down
                        const displayedCard = isViewingOpponentHand ? { ...card, faceUp: false } : card;

                        return (
                          <div
                            key={card.id}
                            data-card-index={actualIndex}
                            className="relative flex-shrink-0 group"
                            style={{
                              width: cardWidth,
                              height: cardHeight,
                              zIndex: isDragging ? 100 : isDragOver ? 50 : 'auto',
                              transform: isDragOver ? 'scale(1.05)' : undefined,
                            }}
                            onMouseDown={(e) => handleCardMouseDown(e, card.id, actualIndex, e.currentTarget as HTMLDivElement)}
                            onContextMenu={(e) => handleCardContextMenu(e, card)}
                          >
                            <CardComponent
                              card={displayedCard}
                              overrideWidth={cardWidth}
                              overrideHeight={cardHeight}
                              cardWidth={cardSettings.cardWidth}
                              cardHeight={cardSettings.cardHeight}
                              cardNamePosition={cardSettings.cardNamePosition}
                              cardOrientation={cardSettings.cardOrientation}
                              disableRotationTransform={true}
                              deckSpriteConfig={deck?.spriteConfig}
                              deckShowTooltipImage={deck?.showTooltipImage}
                              deckTooltipScale={deck?.tooltipScale}
                              shouldSeeCardFace={!isViewingOpponentHand}
                              language={language}
                            />

                            {!isViewingOpponentHand && buttons.length > 0 && (
                              <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                                {buttons.map(btn => (
                                  <button
                                    key={btn.title}
                                    onClick={(e) => { e.stopPropagation(); btn.onAction(); }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    className={`p-1.5 rounded-lg text-white shadow ${btn.className} pointer-events-auto`}
                                    title={btn.title}
                                  >
                                    {btn.icon}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </>
          )}
          </div>
        </div>
        </>
      )}

      {/* Context menu for cards in hand */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          object={contextMenu.object}
          isGM={isGM}
          onAction={handleContextMenuAction}
          onClose={() => setContextMenu(null)}
          allObjects={state.objects}
          hideCardActions={true}
          language={language}
        />
      )}

      {/* Scale menu for hand panel (right-click on empty space) */}
      {scaleMenu && createPortal(
        <div
          ref={scaleMenuRef}
          className="fixed z-[999999] bg-slate-800 border border-slate-600 rounded-lg shadow-xl py-3 px-3 min-w-[220px]"
          style={{ left: scaleMenu.x, top: scaleMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="text-xs text-slate-400 mb-2">
            {translate('Hand Card Scale', language as Locale)}
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.01}
              value={cardScale}
              onChange={(e) => {
                const newScale = parseFloat(e.target.value);
                handleScaleChange(newScale);
              }}
              className="flex-1 h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer slider-input"
              style={{
                background: 'linear-gradient(to right, #4a5568, #7c3aed)',
                borderRadius: '8px'
              }}
            />
            {isEditingPercentage ? (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={50}
                  max={200}
                  value={editedPercentage}
                  onChange={(e) => setEditedPercentage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const newPercent = parseFloat(editedPercentage);
                      if (!isNaN(newPercent) && newPercent >= 50 && newPercent <= 200) {
                        handleScaleChange(newPercent / 100);
                      }
                      setIsEditingPercentage(false);
                    } else if (e.key === 'Escape') {
                      setIsEditingPercentage(false);
                    }
                  }}
                  onBlur={() => {
                    const newPercent = parseFloat(editedPercentage);
                    if (!isNaN(newPercent) && newPercent >= 50 && newPercent <= 200) {
                      handleScaleChange(newPercent / 100);
                    }
                    setIsEditingPercentage(false);
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="w-16 bg-slate-700 text-white text-center rounded px-1 py-0.5 text-sm"
                  autoFocus
                />
                <span className="text-xs text-slate-400">%</span>
              </div>
            ) : (
              <span
                onClick={() => {
                  setEditedPercentage(String(Math.round(cardScale * 100)));
                  setIsEditingPercentage(true);
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className="cursor-pointer hover:bg-slate-700 px-2 py-0.5 rounded text-sm text-white"
              >
                {Math.round(cardScale * 100)}%
              </span>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Tab scale menu (right-click on tab) */}
      {tabScaleMenu && createPortal(
        <div
          ref={tabScaleMenuRef}
          className="fixed z-[999999] bg-slate-800 border border-slate-600 rounded-lg shadow-xl py-3 px-3 min-w-[220px]"
          style={{ left: tabScaleMenu.x, top: tabScaleMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="text-xs text-slate-400 mb-2">
            {translate('Tab Scale', language as Locale)}
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.01}
              value={selectedPlayerId === tabScaleMenu.playerId ? cardScale : 1}
              onChange={(e) => {
                const newScale = parseFloat(e.target.value);
                // If this is the active tab, update directly
                if (selectedPlayerId === tabScaleMenu.playerId) {
                  handleScaleChange(newScale);
                } else {
                  // Otherwise update scale for that player directly via localStorage
                  try {
                    const key = `hand-card-scale-${tabScaleMenu.playerId}`;
                    localStorage.setItem(key, String(newScale));
                    window.dispatchEvent(new CustomEvent('hand-card-scale-change', {
                      detail: { playerId: tabScaleMenu.playerId, newScale }
                    }));
                  } catch {
                    // Ignore localStorage errors
                  }
                }
              }}
              className="flex-1 h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer slider-input"
              style={{
                background: 'linear-gradient(to right, #4a5568, #7c3aed)',
                borderRadius: '8px'
              }}
            />
            {isEditingPercentage ? (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={50}
                  max={200}
                  value={editedPercentage}
                  onChange={(e) => setEditedPercentage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const newPercent = parseFloat(editedPercentage);
                      const newScale = newPercent / 100;
                      if (selectedPlayerId === tabScaleMenu.playerId) {
                        if (!isNaN(newPercent) && newPercent >= 50 && newPercent <= 200) {
                          handleScaleChange(newScale);
                        }
                      } else {
                        try {
                          const key = `hand-card-scale-${tabScaleMenu.playerId}`;
                          localStorage.setItem(key, String(newScale));
                          window.dispatchEvent(new CustomEvent('hand-card-scale-change', {
                            detail: { playerId: tabScaleMenu.playerId, newScale }
                          }));
                        } catch {
                          // Ignore localStorage errors
                        }
                      }
                      setIsEditingPercentage(false);
                    } else if (e.key === 'Escape') {
                      setIsEditingPercentage(false);
                    }
                  }}
                  onBlur={() => {
                    const newPercent = parseFloat(editedPercentage);
                    const newScale = newPercent / 100;
                    if (selectedPlayerId === tabScaleMenu.playerId) {
                      if (!isNaN(newPercent) && newPercent >= 50 && newPercent <= 200) {
                        handleScaleChange(newScale);
                      }
                    } else {
                      try {
                        const key = `hand-card-scale-${tabScaleMenu.playerId}`;
                        localStorage.setItem(key, String(newScale));
                        window.dispatchEvent(new CustomEvent('hand-card-scale-change', {
                          detail: { playerId: tabScaleMenu.playerId, newScale }
                        }));
                      } catch {
                        // Ignore localStorage errors
                      }
                    }
                    setIsEditingPercentage(false);
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="w-16 bg-slate-700 text-white text-center rounded px-1 py-0.5 text-sm"
                  autoFocus
                />
                <span className="text-xs text-slate-400">%</span>
              </div>
            ) : (
              <span
                onClick={() => {
                  const currentScale = selectedPlayerId === tabScaleMenu.playerId ? cardScale : 1;
                  setEditedPercentage(String(Math.round(currentScale * 100)));
                  setIsEditingPercentage(true);
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className="cursor-pointer hover:bg-slate-700 px-2 py-0.5 rounded text-sm text-white"
              >
                {Math.round((selectedPlayerId === tabScaleMenu.playerId ? cardScale : 1) * 100)}%
              </span>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
