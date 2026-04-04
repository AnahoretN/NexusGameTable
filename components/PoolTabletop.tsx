import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { useGame } from '../store/GameContext';
import { TableObject, ItemType, Deck as DeckType, CardPile, Counter, DiceObject, TokenShape, Board as BoardType, CardLocation } from '../types';
import { ObjectRenderer } from './ObjectRenderer';
import { DeckComponent } from './DeckComponent';
import { ContextMenu } from './ContextMenu';
import { PileContextMenu } from './PileContextMenu';
import { executeContextMenuAction } from '../utils/contextMenuActions';
import { SvgTokenShape } from './SvgTokenShape';
import { Tooltip } from './Tooltip';
import { Plus, Minus } from 'lucide-react';
import { BoardWithResizeMemo } from './Tabletop/BoardWithResize';
import { ObjectSettingsModal } from './ObjectSettingsModal';
import { SearchDeckModal } from './SearchDeckModal';
import { TopDeckModal } from './TopDeckModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import {
  calculatePoolDropPositionWithScroll,
  dropObjectsToPool,
  getCursorSlotObjects,
  type PoolZone as PoolZoneType
} from '../utils/poolPlacement';

interface PoolZone extends PoolZoneType {
  panelId: string;
}

interface PoolTabletopProps {
  poolZone: PoolZone;
  zoom?: number;
}

export const PoolTabletop: React.FC<PoolTabletopProps> = ({ poolZone, zoom = 1.02 }) => {
  const { state, dispatch } = useGame();
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const currentPlayer = state.players.find(p => p.id === state.activePlayerId);
  const isGM = currentPlayer?.isGM ?? false;

  // View transform - use zoom from props or default to 1.02
  const currentZoom = zoom || 1.02;

  // Click tracking for single/double click detection on dice
  const clickTrackerRef = useRef<{ objectId: string | null; timestamp: number; clickCount: number }>({
    objectId: null,
    timestamp: 0,
    clickCount: 0
  });

  // Dragging state for objects (only for non-draggable objects like boards, etc.)
  const [draggingObject, setDraggingObject] = useState<TableObject | null>(null);
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
  const cursorSlotEventSentRef = useRef(false);
  const pileDragStartRef = useRef<{ x: number; y: number } | null>(null);

  // Dice drag tracking for click vs drag detection
  const diceDragRef = useRef<{
    objectId: string | null;
    startX: number;
    startY: number;
    isDragging: boolean;
  }>({
    objectId: null,
    startX: 0,
    startY: 0,
    isDragging: false
  });

  // Generic drag tracking for all draggable objects (cards, tokens, etc.)
  const genericDragRef = useRef<{
    objectId: string | null;
    startX: number;
    startY: number;
    isDragging: boolean;
  }>({
    objectId: null,
    startX: 0,
    startY: 0,
    isDragging: false
  });

  // State to trigger useEffect when drag starts/ends
  const [isDraggingDice, setIsDraggingDice] = useState(false);
  const [isDraggingGeneric, setIsDraggingGeneric] = useState(false);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; object: TableObject; shiftKey?: boolean } | null>(null);

  // Settings modal state
  const [settingsModalObj, setSettingsModalObj] = useState<TableObject | null>(null);

  // Search modal states
  const [searchModalDeck, setSearchModalDeck] = useState<DeckType | null>(null);
  const [searchModalPile, setSearchModalPile] = useState<CardPile | undefined>(undefined);
  const [topDeckModalDeck, setTopDeckModalDeck] = useState<DeckType | null>(null);

  // Delete confirmation state
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);

  const confirmDelete = useCallback(() => {
    if (deleteCandidateId) {
      dispatch({ type: 'DELETE_OBJECT', payload: { id: deleteCandidateId }});
      setDeleteCandidateId(null);
    }
  }, [deleteCandidateId, dispatch]);

  // Pile context menu state
  const [pileContextMenu, setPileContextMenu] = useState<{ x: number; y: number; pile: CardPile; deck: DeckType } | null>(null);

  // Timer refs for click delays
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Listen for pile modal open events from deck context menus
  useEffect(() => {
    const handleOpenPileModal = (e: Event) => {
      const customEvent = e as CustomEvent<{ pileId: string }>;
      const { pileId } = customEvent.detail;

      // Find the deck and pile
      const deck = Object.values(state.objects).find(obj =>
        obj.type === ItemType.DECK &&
        (obj as DeckType).piles?.some(p => p.id === pileId)
      ) as DeckType;

      if (deck) {
        const pile = deck.piles?.find(p => p.id === pileId);
        if (pile) {
          console.log('[PoolTabletop] Opening pile search modal:', { pileId, pileName: pile.name });
          setSearchModalDeck(deck);
          setSearchModalPile(pile);
        }
      }
    };

    const handleOpenSearchDeckModal = (e: Event) => {
      const customEvent = e as CustomEvent<{ deckId: string; pileId?: string }>;
      const { deckId, pileId } = customEvent.detail;
      console.log('[PoolTabletop] handleOpenSearchDeckModal called:', { deckId, pileId });

      const deck = state.objects[deckId] as DeckType;
      if (deck) {
        console.log('[PoolTabletop] Deck found:', deck.name);
        setSearchModalDeck(deck);
        if (pileId) {
          const pile = deck.piles?.find(p => p.id === pileId);
          console.log('[PoolTabletop] Pile found:', pile?.name);
          setSearchModalPile(pile);
        }
      } else {
        console.warn('[PoolTabletop] Deck not found:', deckId);
      }
    };

    const handleOpenTopDeckModal = (e: Event) => {
      const customEvent = e as CustomEvent<{ deckId: string }>;
      const { deckId } = customEvent.detail;

      const deck = state.objects[deckId] as DeckType;
      if (deck) {
        setTopDeckModalDeck(deck);
      }
    };

    window.addEventListener('open-pile-modal', handleOpenPileModal);
    window.addEventListener('open-search-deck-modal', handleOpenSearchDeckModal);
    window.addEventListener('open-top-deck-modal', handleOpenTopDeckModal);
    return () => {
      window.removeEventListener('open-pile-modal', handleOpenPileModal);
      window.removeEventListener('open-search-deck-modal', handleOpenSearchDeckModal);
      window.removeEventListener('open-top-deck-modal', handleOpenTopDeckModal);
    };
  }, [state.objects]);

  // Dice animation state
  const [rollingDice, setRollingDice] = useState<Record<string, number>>({});
  const initiatedRollsRef = useRef<Set<string>>(new Set());
  const lastSeenRollStartTimeRef = useRef<Record<string, number>>({});

  // Deck hover state
  const [hoveredDeckId, setHoveredDeckId] = useState<string | null>(null);
  const [hoveredPileId, setHoveredPileId] = useState<string | null>(null);

  // Calculate pixels per VU
  const pixelsPerVU = state.viewTransform?.pixelsPerVU ?? 1.08;

  // Memoize pool bounds calculations for rendering
  const poolBounds = useMemo(() => ({
    minX: poolZone.offsetX,
    minY: poolZone.offsetY,
    maxX: poolZone.offsetX + poolZone.width,
    maxY: poolZone.offsetY + poolZone.height,
    widthPx: poolZone.width * pixelsPerVU,
    heightPx: poolZone.height * pixelsPerVU
  }), [poolZone, pixelsPerVU]);

  // Filter objects in pool zone with optimized bounds checking
  const zoneObjects = useMemo(() => {
    const allObjects = Object.values(state.objects);

    // Pre-calculate pool bounds for efficiency
    const poolMinX = poolZone.offsetX;
    const poolMaxX = poolZone.offsetX + poolZone.width;
    const poolMinY = poolZone.offsetY;
    const poolMaxY = poolZone.offsetY + poolZone.height;

    const filtered = allObjects.filter(obj => {
      // Exclude UI objects (panels and windows) - they have their own rendering
      if (obj.type === ItemType.PANEL || obj.type === ItemType.WINDOW) {
        return false;
      }

      // Exclude hidden objects (isOnTable: false)
      if ((obj as any).isOnTable === false) {
        return false;
      }

      // Exclude objects in cursor slot - they should disappear from pool panel when picked up
      // This applies regardless of which pool panel they came from
      const inCursorSlot = (obj as any).inCursorSlot;

      if (inCursorSlot) {
        return false;
      }

      const objX = obj.x || 0;
      const objY = obj.y || 0;
      const objWidth = obj.width || 100;
      const objHeight = obj.height || 100;

      // For cards, tokens, decks, dice, counters, and other draggable objects: use partial overlap for smoother UX
      if (obj.type === ItemType.CARD || obj.type === ItemType.TOKEN || obj.type === ItemType.DECK ||
          obj.type === ItemType.DICE_OBJECT || obj.type === ItemType.COUNTER) {
        const isInPool = objX < poolMaxX && objX + objWidth > poolMinX &&
                         objY < poolMaxY && objY + objHeight > poolMinY;
        return isInPool;
      }

      // For other objects: use center point
      const centerX = objX + objWidth / 2;
      const centerY = objY + objHeight / 2;
      const isInPool = centerX >= poolMinX && centerX <= poolMaxX &&
                       centerY >= poolMinY && centerY <= poolMaxY;
      return isInPool;
    });

    // Sort by hyperscale layer order and zIndex (same as main Tabletop)
    const sorted = filtered.sort((a, b) => {
      // First, sort by hyperscale layer order (boards < cards < tokens < interface)
      const layerA = state.hyperscaleLayers.find(l => l.id === (a.hyperscaleLayerId || 'tokens'));
      const layerB = state.hyperscaleLayers.find(l => l.id === (b.hyperscaleLayerId || 'tokens'));
      const orderA = layerA?.order ?? 2;
      const orderB = layerB?.order ?? 2;
      if (orderA !== orderB) return orderA - orderB;

      // Within the same layer, sort by zIndex
      const zA = a.zIndex ?? 0;
      const zB = b.zIndex ?? 0;
      if (zA !== zB) return zA - zB;

      // Token types (archetypes) go to the back (for Tools panel)
      if (a.type === ItemType.TOKEN_TYPE) return -1;
      if (b.type === ItemType.TOKEN_TYPE) return 1;

      if (a.locked && !b.locked) return -1;
      if (!a.locked && b.locked) return 1;

      return 0;
    });

    // Removed debug logging for performance
    // if (sorted.length > 0 && false) {
    //   console.log('[PoolTabletop] Found objects in pool zone:', {
    //     total: sorted.length,
    //     objectIds: sorted.map(o => ({ id: o.id, type: o.type, x: o.x, y: o.y }))
    //   });
    // }

    return sorted;
  }, [state.objects, poolZone, state.hyperscaleLayers]);

  // Local dice animation function (used by both initiator and remote players)
  const startDiceAnimation = useCallback((diceId: string, sides: number, isInitiator: boolean) => {
    let steps = 0;
    const maxSteps = 10; // Change 10 times
    const duration = 1000; // 1 second
    const intervalTime = duration / maxSteps;

    const interval = setInterval(() => {
      steps++;
      if (steps < maxSteps) {
        // Update local state for visual effect only
        setRollingDice(prev => ({
          ...prev,
          [diceId]: Math.floor(Math.random() * sides) + 1
        }));
      } else {
        clearInterval(interval);

        // Clear local override so the component displays the value from the store
        setRollingDice(prev => {
          const next = { ...prev };
          delete next[diceId];
          return next;
        });

        // Only the initiator dispatches the final result
        if (isInitiator) {
          dispatch({ type: 'ROLL_PHYSICAL_DICE', payload: { id: diceId } });
          // Clear the rollStartTime after animation completes
          dispatch({
            type: 'UPDATE_OBJECT',
            payload: { id: diceId, rollStartTime: undefined }
          });
          initiatedRollsRef.current.delete(diceId);
        }
      }
    }, intervalTime);
  }, [dispatch]);

  const animateDiceRoll = useCallback((dice: DiceObject) => {
    const rollStartTime = Date.now();

    // Mark this as a roll we initiated (so we dispatch the final result)
    initiatedRollsRef.current.add(dice.id);

    // Broadcast the roll start time to all players
    dispatch({
      type: 'UPDATE_OBJECT',
      payload: { id: dice.id, rollStartTime }
    });

    // Start local animation
    startDiceAnimation(dice.id, dice.sides, true);
  }, [dispatch, startDiceAnimation]);

  // Watch for dice rollStartTime changes to sync animations across players
  useEffect(() => {
    Object.values(state.objects).forEach(obj => {
      if (obj.type === ItemType.DICE_OBJECT) {
        const dice = obj as DiceObject;
        const lastSeen = lastSeenRollStartTimeRef.current[dice.id];

        // If rollStartTime is newer than what we've seen, start animation
        if (dice.rollStartTime && dice.rollStartTime !== lastSeen) {
          lastSeenRollStartTimeRef.current[dice.id] = dice.rollStartTime;

          // Only start animation if we didn't initiate this roll ourselves
          if (!initiatedRollsRef.current.has(dice.id)) {
            startDiceAnimation(dice.id, dice.sides, false);
          }
        }
      }
    });
  }, [state.objects, startDiceAnimation]);

  // Handle dice roll (double-click)
  const handleRollDice = useCallback((e: React.MouseEvent, obj: TableObject) => {
    if (obj.type === ItemType.DICE_OBJECT) {
      e.stopPropagation();

      const dice = obj as DiceObject;

      // Check if dice belongs to a group
      if (dice.diceGroupId) {
        const group = state.diceGroups.find(g => g.id === dice.diceGroupId);
        if (group && group.visible) {
          // Roll all dice in the group with animation
          group.diceIds.forEach(diceId => {
            const groupDice = state.objects[diceId];
            if (groupDice?.type === ItemType.DICE_OBJECT) {
              animateDiceRoll(groupDice as DiceObject);
            }
          });
        } else {
          // Group not found or not visible, roll single dice with animation
          animateDiceRoll(dice);
        }
      } else {
        // Single dice roll (not in a group) with animation
        animateDiceRoll(dice);
      }
    }
  }, [dispatch, state.diceGroups, state.objects, animateDiceRoll]);

  // Handle object mouse down
  const handleObjectMouseDown = useCallback((e: React.MouseEvent, obj: TableObject) => {
    if (e.button !== 0) return;

    // Check if object is locked - locked objects can't be dragged
    if (obj.locked) return;

    // For draggable objects (cards, tokens, boards, etc.), add to cursor slot IMMEDIATELY
    // NOTE: Boards ARE draggable in pool panels - use same logic as tokens
    const isDraggableType = [
      ItemType.CARD,
      ItemType.TOKEN,
      ItemType.DECK,
      ItemType.DICE_OBJECT,
      ItemType.RANDOMIZER,
      ItemType.COUNTER,
      ItemType.BOARD // Now boards use same drag logic as tokens
    ].includes(obj.type);

    if (isDraggableType) {
      // Special handling for dice - track drag distance for click vs drag detection
      if (obj.type === ItemType.DICE_OBJECT) {
        e.preventDefault();
        e.stopPropagation();

        // Initialize drag tracking
        diceDragRef.current = {
          objectId: obj.id,
          startX: e.clientX,
          startY: e.clientY,
          isDragging: false
        };
        setIsDraggingDice(true);
        return;
      }

      // For other draggable types (including boards), also track drag distance
      e.preventDefault();
      e.stopPropagation();

      // Check if ctrl key is pressed - add to cursor slot immediately
      if (e.ctrlKey || e.metaKey) {
        window.dispatchEvent(new CustomEvent('add-to-cursor-slot', {
          detail: {
            cardId: obj.id,
            clientX: e.clientX,
            clientY: e.clientY,
            source: 'shift',
            fromPoolPanel: poolZone.panelId
          }
        }));
        return;
      }

      // Otherwise, track drag distance (boards use same logic as tokens now)
      genericDragRef.current = {
        objectId: obj.id,
        startX: e.clientX,
        startY: e.clientY,
        isDragging: false
      };
      setIsDraggingGeneric(true);
      return;
    }

    // For other objects, use local drag system
    e.stopPropagation();
    setDraggingObject(obj);
    setDragStartPos({ x: e.clientX, y: e.clientY });
    cursorSlotEventSentRef.current = false; // Reset event flag
  }, [poolZone.panelId, clickTimerRef, clickTrackerRef, handleRollDice]);

  // Handle context menu
  const handleContextMenu = useCallback((e: React.MouseEvent, obj: TableObject) => {
    e.preventDefault();
    e.stopPropagation();
    // Always get fresh object from state to ensure we have latest data
    const freshObject = state.objects[obj.id] || obj;
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      object: freshObject,
      shiftKey: e.shiftKey // Store shift key state for delete confirmation
    });
  }, [state.objects]);

  // Execute context menu action using shared utility
  const executeMenuAction = (action: string, shiftKey?: boolean) => {
    console.log('[PoolTabletop] ===== executeMenuAction CALLED =====');
    console.log('[PoolTabletop] Action:', action);
    console.log('[PoolTabletop] Shift key:', shiftKey);
    console.log('[PoolTabletop] Has context menu:', !!contextMenu);

    if (!contextMenu) {
      console.warn('[PoolTabletop] ERROR: No context menu exists!');
      return;
    }

    // Always get fresh object from state to ensure we have latest data
    const targetObject = state.objects[contextMenu.object.id] || contextMenu.object;
    console.log('[PoolTabletop] Target object:', {
      id: targetObject.id,
      type: targetObject.type,
      name: targetObject.name
    });

    // Try to handle action with shared contextMenuAction utility
    let wasHandled = false;

    // Actions that require special handling in context menu
    const specialActions = [
      'configure', 'delete', 'pinToViewport', 'unpinFromViewport',
      'setCardBack', 'toggleHide', 'moveToHand', 'moveToTopDeck',
      'moveToBottomDeck', 'moveToDiscard', 'moveToPile-', 'pile-',
      'moveToHyperscaleLayer:', 'editNexusBoard', 'closeNexusBoardEditing',
      'deleteNexusBoard', 'resetToBase', 'topDeck', 'searchDeck',
      // Basic object actions
      'lock', 'clone', 'flip', 'rotate', 'rotateClockwise', 'rotateCounterClockwise',
      'resetRotation', 'swingClockwise', 'swingCounterClockwise',
      'bringToFront', 'sendToBack', 'layerUp', 'layerDown',
      'show', 'hide',
      // Deck actions
      'shuffleDeck', 'draw', 'playTopCard', 'millTopCard', 'toBottom',
      'showTop', 'hideTop', 'returnAll', 'returnAllAndShuffle', 'returnAllExceptHands'
    ];

    const isSpecialAction = specialActions.some(specialAction => action.startsWith(specialAction));

    if (isSpecialAction) {
      try {
        executeContextMenuAction(action, {
          object: targetObject,
          dispatch,
          state,
          activePlayerId: state.activePlayerId,
          setContextMenu,
          setSettingsModalObj,
          setDeleteCandidateId,
          setSearchModalDeck,
          setSearchModalPile,
          setTopDeckModalDeck,
          isShiftPressed: shiftKey,
          isGM,
          animateDiceRoll,
          isPoolPanel: true
        });
        wasHandled = true;
        console.log('[PoolTabletop] executeContextMenuAction completed');

        // Close menu after executing special action (except for modals)
        if (setContextMenu && action !== 'configure' && action !== 'delete') {
          console.log('[PoolTabletop] Closing context menu');
          setContextMenu(null);
        } else {
          console.log('[PoolTabletop] Not closing menu for action:', action);
        }
      } catch (error) {
        console.error('[PoolTabletop] ERROR in executeContextMenuAction:', error);
      }
    }

    // Handle basic actions that weren't handled by executeContextMenuAction
    if (!wasHandled) {
      console.log('[PoolTabletop] Handling basic action in switch...');
      switch (action) {
        case 'roll':
          console.log('[PoolTabletop] Rolling dice');
          // Roll dice - handled by double-click, but also available from context menu
          if (targetObject.type === ItemType.DICE_OBJECT) {
            animateDiceRoll(targetObject as DiceObject);
          }
          break;

        default:
          console.log('[PoolTabletop] Default case for action:', action);
          // Handle dynamic actions that can't be in switch cases
          if (action.startsWith('moveToHyperscaleLayer:')) {
            const layerId = action.split(':')[1];
            dispatch({
              type: 'MOVE_OBJECT_TO_HYPERSCALE_LAYER',
              payload: { objectId: targetObject.id, layerId }
            });
          }
          break;
      }

      // Close menu after executing action
      console.log('[PoolTabletop] Closing context menu after basic action');
      if (setContextMenu) setContextMenu(null);
    }

    console.log('[PoolTabletop] ===== executeMenuAction FINISHED =====');
  };

  // Handle pile context menu
  const handlePileContextMenu = useCallback((e: React.MouseEvent, pile: CardPile, deck: DeckType) => {
    e.preventDefault();
    e.stopPropagation();
    setPileContextMenu({
      x: e.clientX,
      y: e.clientY,
      pile,
      deck
    });
  }, []);

  // Execute pile context menu action
  const executePileMenuAction = useCallback((action: string) => {
    console.log('[PoolTabletop] executePileMenuAction called:', action);
    if (!pileContextMenu) return;
    const { pile, deck } = pileContextMenu;
    console.log('[PoolTabletop] Pile context menu:', { pileName: pile.name, deckName: deck.name });

    switch(action) {
      case 'lock':
        dispatch({
          type: 'TOGGLE_PILE_LOCK',
          payload: { deckId: deck.id, pileId: pile.id }
        });
        setPileContextMenu(null);
        break;
      case 'showTop':
        dispatch({
          type: 'TOGGLE_SHOW_TOP_CARD',
          payload: { deckId: deck.id, pileId: pile.id }
        });
        setPileContextMenu(null);
        break;
      case 'searchDeck':
        console.log('[PoolTabletop] Dispatching open-search-deck-modal event:', { deckId: deck.id, pileId: pile.id });
        // Open search deck modal - dispatch event to main app
        window.dispatchEvent(new CustomEvent('open-search-deck-modal', {
          detail: { deckId: deck.id, pileId: pile.id }
        }));
        setPileContextMenu(null);
        break;
      case 'draw':
        dispatch({
          type: 'DRAW_FROM_PILE',
          payload: {
            pileId: pile.id,
            deckId: deck.id,
            playerId: state.activePlayerId
          }
        });
        setPileContextMenu(null);
        break;
      case 'returnAll':
        dispatch({ type: 'RETURN_ALL_CARDS_TO_DECK', payload: { deckId: deck.id, shuffleAfter: false } });
        setPileContextMenu(null);
        break;
    }
  }, [pileContextMenu, state.activePlayerId, dispatch]);

  // Cleanup click timers on unmount
  useEffect(() => {
    return () => {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
      }
    };
  }, []);

  // Handle mouse move for dragging objects
  const handleObjectMouseMove = useCallback((e: MouseEvent) => {
    // Handle dice drag tracking
    if (diceDragRef.current.objectId) {
      const deltaX = e.clientX - diceDragRef.current.startX;
      const deltaY = e.clientY - diceDragRef.current.startY;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      // If moved more than 5px, consider it a drag
      if (distance > 5 && !diceDragRef.current.isDragging) {
        diceDragRef.current.isDragging = true;

        // Add to cursor slot immediately when drag threshold is exceeded
        window.dispatchEvent(new CustomEvent('add-to-cursor-slot', {
          detail: {
            cardId: diceDragRef.current.objectId,
            clientX: diceDragRef.current.startX,
            clientY: diceDragRef.current.startY,
            source: 'hold',
            fromPoolPanel: poolZone.panelId
          }
        }));
      }
      return;
    }

    // Handle generic drag tracking for other draggable objects
    if (genericDragRef.current.objectId) {
      const deltaX = e.clientX - genericDragRef.current.startX;
      const deltaY = e.clientY - genericDragRef.current.startY;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      // If moved more than 5px, consider it a drag
      if (distance > 5 && !genericDragRef.current.isDragging) {
        genericDragRef.current.isDragging = true;

        // Add to cursor slot immediately when drag threshold is exceeded
        window.dispatchEvent(new CustomEvent('add-to-cursor-slot', {
          detail: {
            cardId: genericDragRef.current.objectId,
            clientX: genericDragRef.current.startX,
            clientY: genericDragRef.current.startY,
            source: 'hold',
            fromPoolPanel: poolZone.panelId
          }
        }));
      }
      return;
    }

    if (!draggingObject) return;

    const deltaX = e.clientX - dragStartPos.x;
    const deltaY = e.clientY - dragStartPos.y;

    // Draggable objects are now handled by cursor slot system - no local drag needed
    if ([
      ItemType.CARD,
      ItemType.TOKEN,
      ItemType.DECK,
      ItemType.DICE_OBJECT,
      ItemType.RANDOMIZER,
      ItemType.COUNTER,
      ItemType.BOARD
    ].includes(draggingObject.type)) {
      return;
    }

    // Convert pixel delta to VU delta (account for currentZoom)
    const vuDeltaX = deltaX / currentZoom / pixelsPerVU;
    const vuDeltaY = deltaY / currentZoom / pixelsPerVU;

    // Calculate new position
    const newX = draggingObject.x + vuDeltaX;
    const newY = draggingObject.y + vuDeltaY;

    // Calculate relative position for visual update
    const relativeX = (newX - poolZone.offsetX) * pixelsPerVU;
    const relativeY = (newY - poolZone.offsetY) * pixelsPerVU;

    // Update object position temporarily (visual only - actual update happens on mouse up)
    const objElement = document.querySelector(`[data-object-id="${draggingObject.id}"]`) as HTMLElement;
    if (objElement) {
      objElement.style.left = `${relativeX}px`;
      objElement.style.top = `${relativeY}px`;
    }
  }, [draggingObject, dragStartPos, currentZoom, pixelsPerVU, poolZone.offsetX, poolZone.offsetY, poolZone.panelId]);

  // Handle mouse up for object drag
  const handleObjectMouseUp = useCallback((e: MouseEvent) => {
    // Handle dice click detection
    if (diceDragRef.current.objectId) {
      const deltaX = e.clientX - diceDragRef.current.startX;
      const deltaY = e.clientY - diceDragRef.current.startY;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      const wasDrag = diceDragRef.current.isDragging;
      const objectId = diceDragRef.current.objectId;

      // Reset drag tracking
      diceDragRef.current = {
        objectId: null,
        startX: 0,
        startY: 0,
        isDragging: false
      };
      setIsDraggingDice(false);

      // If this was a click (not a drag), handle click detection
      if (!wasDrag && distance < 5) {
        const obj = state.objects[objectId];
        if (obj?.type === ItemType.DICE_OBJECT) {
          const now = Date.now();
          const DOUBLE_CLICK_DELAY = 300; // ms

          // Clear any existing timer
          if (clickTimerRef.current) {
            clearTimeout(clickTimerRef.current);
            clickTimerRef.current = null;
          }

          // Check if this is a double click
          const lastClick = clickTrackerRef.current;
          if (lastClick.objectId === objectId && now - lastClick.timestamp < DOUBLE_CLICK_DELAY) {
            // Double click detected - roll the dice
            handleRollDice(e as any, obj);

            // Reset click tracker after double click
            clickTrackerRef.current = { objectId: null, timestamp: 0, clickCount: 0 };
          } else {
            // Single click - just track for potential double click, don't add to cursor slot
            clickTrackerRef.current = {
              objectId: objectId,
              timestamp: now,
              clickCount: lastClick.clickCount + 1
            };

            // Wait to see if this becomes a double click
            clickTimerRef.current = setTimeout(() => {
              const currentTracker = clickTrackerRef.current;
              if (currentTracker.objectId === objectId && now === currentTracker.timestamp) {
                // Single click confirmed - just reset tracker, don't add to cursor slot
                clickTrackerRef.current = { objectId: null, timestamp: 0, clickCount: 0 };
              }
            }, DOUBLE_CLICK_DELAY);
          }
        }
      }
      return;
    }

    // Handle generic drag tracking for other draggable objects
    if (genericDragRef.current.objectId) {
      const deltaX = e.clientX - genericDragRef.current.startX;
      const deltaY = e.clientY - genericDragRef.current.startY;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      const wasDrag = genericDragRef.current.isDragging;

      // Reset drag tracking
      genericDragRef.current = {
        objectId: null,
        startX: 0,
        startY: 0,
        isDragging: false
      };
      setIsDraggingGeneric(false);

      // If this was a click (not a drag), don't add to cursor slot
      // Only drags should have already added the object to cursor slot
      if (!wasDrag && distance < 5) {
        // Single click - do nothing in pool panel
        // Objects are only added via drag or ctrl+click
      }
      return;
    }

    if (!draggingObject) return;

    // Draggable objects are now handled by cursor slot system - no local drag needed
    if ([
      ItemType.CARD,
      ItemType.TOKEN,
      ItemType.DECK,
      ItemType.DICE_OBJECT,
      ItemType.RANDOMIZER,
      ItemType.COUNTER,
      ItemType.BOARD
    ].includes(draggingObject.type)) {
      setDraggingObject(null);
      return;
    }

    // Calculate new position in game space
    const deltaX = e.clientX - dragStartPos.x;
    const deltaY = e.clientY - dragStartPos.y;

    // Convert pixel delta to VU delta (account for currentZoom)
    const vuDeltaX = deltaX / currentZoom / pixelsPerVU;
    const vuDeltaY = deltaY / currentZoom / pixelsPerVU;

    let newX = draggingObject.x + vuDeltaX;
    let newY = draggingObject.y + vuDeltaY;

    // For non-card/token objects: constrain to pool zone bounds
    const objWidth = draggingObject.width || 100;
    const objHeight = draggingObject.height || 100;

    // Allow object center to be within pool zone
    newX = Math.max(poolZone.offsetX, Math.min(newX, poolZone.offsetX + poolZone.width - objWidth / 2));
    newY = Math.max(poolZone.offsetY, Math.min(newY, poolZone.offsetY + poolZone.height - objHeight / 2));

    // Update object position
    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: draggingObject.id,
        x: newX,
        y: newY
      }
    });

    setDraggingObject(null);
  }, [draggingObject, dragStartPos, currentZoom, pixelsPerVU, dispatch, poolZone, state.objects, handleRollDice, poolZone.panelId]);

  // Add global mouse listeners for object dragging (for both non-draggable items and draggable objects)
  useEffect(() => {
    if (draggingObject || isDraggingDice || isDraggingGeneric) {
      window.addEventListener('mousemove', handleObjectMouseMove);
      window.addEventListener('mouseup', handleObjectMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleObjectMouseMove);
        window.removeEventListener('mouseup', handleObjectMouseUp);
      };
    }
  }, [draggingObject, isDraggingDice, isDraggingGeneric, handleObjectMouseMove, handleObjectMouseUp]);

  // Handle drop from cursor slot (local handler for mouseup on PoolTabletop)
  const handleDropFromCursor = useCallback((e: React.MouseEvent) => {
    // IMPORTANT: If clicking inside ANY context menu, don't process drops
    // This prevents interference with context menu button clicks in both Tabletop and Pool panels
    const target = e.target as HTMLElement;
    const tableContextMenuElement = target.closest('[data-context-menu="tabletop"]');
    const poolContextMenuElement = target.closest('[data-context-menu="pool"]');
    const submenuElement = target.closest('[data-submenu="true"]');
    if (tableContextMenuElement || poolContextMenuElement || submenuElement) {
      console.log('[PoolTabletop] Mouseup inside context menu, ignoring drop handler');
      return;
    }

    // Close context menu if open
    if (contextMenu) {
      setContextMenu(null);
    }

    // Don't drop if modifiers are pressed (Ctrl/Meta)
    if (e.ctrlKey || e.metaKey) return;

    // IMPORTANT: Check if cursor is over a deck or pile FIRST
    // If yes, let the main Tabletop handle it (don't drop to pool)
    const elementUnderCursor = document.elementFromPoint(e.clientX, e.clientY);

    // Check for piles FIRST (before deck) - piles are more specific targets
    const pileElement = elementUnderCursor?.closest('[data-pile-id]');
    if (pileElement) {
      console.log('[PoolTabletop] Cursor over pile, letting main handler process it');
      return; // Let main Tabletop handle it
    }

    // Check for deck
    const deckElement = elementUnderCursor?.closest('[data-object-id]');
    if (deckElement) {
      const objectId = deckElement.getAttribute('data-object-id');
      const obj = objectId ? state.objects[objectId] : undefined;
      if (obj && obj.type === ItemType.DECK) {
        console.log('[PoolTabletop] Cursor over deck, letting main handler process it:', objectId);
        return; // Let main Tabletop handle it
      }
    }

    const cursorSlotObjects = getCursorSlotObjects(state.objects);

    // console.log('[PoolTabletop] handleDropFromCursor called:', {
    //   hasCursorSlotObjects: cursorSlotObjects.length > 0,
    //   count: cursorSlotObjects.length,
    //   poolPanelId: poolZone.panelId
    // });

    if (cursorSlotObjects.length > 0) {
      const container = containerRef.current;
      if (!container) return;

      // Get scroll parent to account for scroll position
      const scrollParent = container.closest('.overflow-auto');
      if (!scrollParent) {
        console.warn('Scroll parent not found for pool drop operation');
        return;
      }

      const scrollRect = scrollParent.getBoundingClientRect();
      const scrollLeft = scrollParent.scrollLeft;
      const scrollTop = scrollParent.scrollTop;

      // Calculate drop position using utility function
      const dropPosition = calculatePoolDropPositionWithScroll(
        e.clientX,
        e.clientY,
        poolZone,
        scrollRect,
        scrollLeft,
        scrollTop,
        pixelsPerVU,
        currentZoom
      );

      // Check if cursor is over the VISIBLE pool panel window first
      // Get the visible content area (data-pool-content)
      const visibleContentArea = document.querySelector(`[data-pool-content="${poolZone.panelId}"]`) as HTMLElement;
      if (!visibleContentArea) {
        console.warn('[PoolTabletop] Visible content area not found');
        return;
      }

      const visibleRect = visibleContentArea.getBoundingClientRect();
      const isCursorOverVisibleArea = e.clientX >= visibleRect.left && e.clientX <= visibleRect.right &&
                                     e.clientY >= visibleRect.top && e.clientY <= visibleRect.bottom;

      if (!isCursorOverVisibleArea) {
        // Cursor is NOT over the visible pool panel window - don't allow drop
        return;
      }

      // Check if ALL objects will be completely visible in the pool panel window
      // Account for stacking offset - check the last (bottom-right most) object
      const lastObj = cursorSlotObjects[cursorSlotObjects.length - 1];
      if (lastObj) {
        // Calculate stacking offset for the last object
        const objWidth = (lastObj.width || 50) * pixelsPerVU;
        const objHeight = (lastObj.height || 50) * pixelsPerVU;
        const stackingOffset = Math.min(objWidth, objHeight) * 0.05; // 5% stacking offset
        const maxOffset = stackingOffset * (cursorSlotObjects.length - 1);

        // Calculate position of the last object (with maximum offset) in screen coords
        const objLeft = e.clientX - objWidth / 2 + maxOffset;
        const objRight = e.clientX + objWidth / 2 + maxOffset;
        const objTop = e.clientY - objHeight / 2 + maxOffset;
        const objBottom = e.clientY + objHeight / 2 + maxOffset;

        // Check if last object is completely within visible content area
        const isFullyVisible = objLeft >= visibleRect.left && objRight <= visibleRect.right &&
                            objTop >= visibleRect.top && objBottom <= visibleRect.bottom;

        if (!isFullyVisible) {
          // Object would be partially outside visible area - don't allow drop
          return;
        }
      }

      // Drop objects using utility function
      dropObjectsToPool(cursorSlotObjects, dropPosition, poolZone, dispatch, state.objects);

      // Clear cursor slot after successful drop
      // Dispatch event to clear cursor slot in main Tabletop
      window.dispatchEvent(new CustomEvent('clear-cursor-slot', {
        detail: { reason: 'pool-drop' }
      }));
    }
  }, [poolZone, currentZoom, pixelsPerVU, dispatch, state.objects, contextMenu]);

  // Global mouseup handler for cursor slot drop (handles all mouseup events)
  // This ensures objects are dropped even if mouseup happens outside PoolTabletop
  useEffect(() => {
    const handleGlobalMouseUp = (e: MouseEvent) => {
      // Only process left mouse button
      if (e.button !== 0) return;

      const cursorSlotObjects = getCursorSlotObjects(state.objects);

      // Only handle if cursor slot has objects
      if (cursorSlotObjects.length === 0) return;

      // Don't drop if modifiers are pressed (Ctrl/Meta)
      if (e.ctrlKey || e.metaKey) return;

      // Check if mouseup is over this pool panel
      const container = containerRef.current;
      if (!container) return;

      // Get the visible content area (data-pool-content) - this is the VISIBLE window
      const visibleContentArea = document.querySelector(`[data-pool-content="${poolZone.panelId}"]`) as HTMLElement;
      if (!visibleContentArea) {
        console.warn('[PoolTabletop] Visible content area not found');
        return;
      }

      const visibleRect = visibleContentArea.getBoundingClientRect();
      const x = e.clientX;
      const y = e.clientY;

      // Check if mouseup position is over the visible pool panel area
      const isCursorOverVisibleArea = x >= visibleRect.left && x <= visibleRect.right &&
                                     y >= visibleRect.top && y <= visibleRect.bottom;

      if (isCursorOverVisibleArea) {
        // Get the scroll parent (PoolGameSpace) to account for scroll position
        const scrollParent = container.closest('.overflow-auto') as HTMLElement;
        const scrollLeft = scrollParent?.scrollLeft || 0;
        const scrollTop = scrollParent?.scrollTop || 0;

        const scrollRect = scrollParent?.getBoundingClientRect();
        if (!scrollRect) return;

        // Calculate drop position using utility function
        const dropPosition = calculatePoolDropPositionWithScroll(
          x,
          y,
          poolZone,
          scrollRect,
          scrollLeft,
          scrollTop,
          pixelsPerVU,
          currentZoom
        );

        // Check if ALL objects will be completely visible in the pool panel window
        // Account for stacking offset - check the last (bottom-right most) object
        const lastObj = cursorSlotObjects[cursorSlotObjects.length - 1];
        if (lastObj) {
          // Calculate stacking offset for the last object
          const objWidth = (lastObj.width || 50) * pixelsPerVU;
          const objHeight = (lastObj.height || 50) * pixelsPerVU;
          const stackingOffset = Math.min(objWidth, objHeight) * 0.05; // 5% stacking offset
          const maxOffset = stackingOffset * (cursorSlotObjects.length - 1);

          // Calculate position of the last object (with maximum offset)
          const objLeft = x - objWidth / 2 + maxOffset;
          const objRight = x + objWidth / 2 + maxOffset;
          const objTop = y - objHeight / 2 + maxOffset;
          const objBottom = y + objHeight / 2 + maxOffset;

          // Check if last object is completely within visible content area
          const isFullyVisible = objLeft >= visibleRect.left && objRight <= visibleRect.right &&
                              objTop >= visibleRect.top && objBottom <= visibleRect.bottom;

          if (!isFullyVisible) {
            // Object would be partially outside visible area - don't allow drop
            return;
          }
        }

        // Drop objects using utility function
        dropObjectsToPool(cursorSlotObjects, dropPosition, poolZone, dispatch, state.objects);

        // Clear cursor slot after successful drop
        window.dispatchEvent(new CustomEvent('clear-cursor-slot', {
          detail: { reason: 'pool-drop-global' }
        }));

        // Stop event from propagating to Tabletop handler
        e.stopPropagation();
        e.preventDefault();
      } else {
        // NOT over pool panel - notify Tabletop to handle drop on main tabletop
        // Don't stop propagation - let Tabletop handle it
        window.dispatchEvent(new CustomEvent('cursor-slot-drop-to-tabletop', {
          detail: { x: e.clientX, y: e.clientY }
        }));
      }
    };

    window.addEventListener('mouseup', handleGlobalMouseUp, { capture: true });
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp, { capture: true } as any);
  }, [poolZone, currentZoom, pixelsPerVU, dispatch, state.objects]);

  // Listen for object-drag-end event from main tabletop (for both cards and tokens)
  useEffect(() => {
    const handleObjectDragEnd = (e: Event) => {
      const customEvent = e as CustomEvent<{
        wasDragging: boolean;
        objectId: string;
        objectType: string;
        source: 'hand' | 'tabletop' | null;
        x: number;
        y: number;
      }>;

      if (customEvent.detail.source !== 'tabletop') return;

      const container = containerRef.current;
      if (!container) return;

      // Get the visible content area (data-pool-content) - this is the VISIBLE window
      const visibleContentArea = document.querySelector(`[data-pool-content="${poolZone.panelId}"]`) as HTMLElement;
      if (!visibleContentArea) {
        console.warn('[PoolTabletop] Visible content area not found');
        return;
      }

      const visibleRect = visibleContentArea.getBoundingClientRect();
      const x = customEvent.detail.x;
      const y = customEvent.detail.y;

      // Check if drop position is over the visible pool panel area
      const isCursorOverVisibleArea = x >= visibleRect.left && x <= visibleRect.right &&
                                     y >= visibleRect.top && y <= visibleRect.bottom;

      if (isCursorOverVisibleArea) {
        // Get the scroll parent (PoolGameSpace) to account for scroll position
        const scrollParent = container.closest('.overflow-auto') as HTMLElement;
        const scrollLeft = scrollParent?.scrollLeft || 0;
        const scrollTop = scrollParent?.scrollTop || 0;

        // Calculate position relative to content area (accounting for scroll)
        const relativeX = x - visibleRect.left + scrollLeft;
        const relativeY = y - visibleRect.top + scrollTop;

        // Convert to pool zone coordinates
        const poolX = poolZone.offsetX + relativeX / currentZoom / pixelsPerVU;
        const poolY = poolZone.offsetY + relativeY / currentZoom / pixelsPerVU;

        // Get the object to determine its dimensions for centering
        const obj = state.objects[customEvent.detail.objectId];
        const objWidth = (obj?.width || 100) * pixelsPerVU;
        const objHeight = (obj?.height || 100) * pixelsPerVU;

        // Calculate final position (cursor is at center of object, so subtract half dimensions)
        const finalX = poolX - (objWidth / pixelsPerVU / 2);
        const finalY = poolY - (objHeight / pixelsPerVU / 2);

        // Check if object will be completely visible in the pool panel window
        // Calculate object bounds in screen coordinates
        const objLeft = x - objWidth / 2;
        const objRight = x + objWidth / 2;
        const objTop = y - objHeight / 2;
        const objBottom = y + objHeight / 2;

        // Check if object is completely within visible content area
        const isFullyVisible = objLeft >= visibleRect.left && objRight <= visibleRect.right &&
                            objTop >= visibleRect.top && objBottom <= visibleRect.bottom;

        if (!isFullyVisible) {
          // Object would be partially outside visible area - don't allow drop
          return;
        }

        // Move the object to the pool
        dispatch({
          type: 'UPDATE_OBJECT',
          payload: {
            id: customEvent.detail.objectId,
            x: finalX,
            y: finalY
          }
        });
      }
    };

    // Listen for both new object-drag-end and legacy card-drag-end events
    window.addEventListener('object-drag-end', handleObjectDragEnd);
    window.addEventListener('card-drag-end', (e: Event) => {
      // Handle legacy card-drag-end events for backward compatibility
      const customEvent = e as CustomEvent<any>;
      // Convert to object-drag-end format
      const syntheticEvent = new CustomEvent('object-drag-end', {
        detail: {
          wasDragging: customEvent.detail.wasDragging,
          objectId: customEvent.detail.cardId,
          objectType: ItemType.CARD,
          source: customEvent.detail.source,
          x: customEvent.detail.x,
          y: customEvent.detail.y
        }
      });
      handleObjectDragEnd(syntheticEvent);
    });

    return () => {
      window.removeEventListener('object-drag-end', handleObjectDragEnd);
      window.removeEventListener('card-drag-end', handleObjectDragEnd as any);
    };
  }, [poolZone, currentZoom, pixelsPerVU, dispatch, state.objects]);

  return (
    <div
      ref={containerRef}
      data-pool-panel={poolZone.panelId}
      className={`relative ${getCursorSlotObjects(state.objects).length > 0 ? 'cursor-grabbing' : ''}`}
      style={{
        width: poolBounds.widthPx,
        height: poolBounds.heightPx,
      }}
      onMouseUp={handleDropFromCursor}
    >
      {/* Debug info - removed to hide world coordinates from players */}
      {/* <div className="absolute top-0 right-0 z-50 bg-red-900 bg-opacity-90 px-2 py-1 rounded text-xs text-white pointer-events-none">
        {Math.round(poolBounds.widthPx)}x{Math.round(poolBounds.heightPx)}px | {pixelsPerVU}px/VU
      </div> */}
      {/* Pool zone background with grid pattern */}
      <div
        ref={contentRef}
        className="absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(#34495e 1px, transparent 1px)',
          backgroundSize: '20px 20px',
          transform: `scale(${currentZoom})`,
          transformOrigin: 'top left',
        }}
      >
          {/* Render objects (positioned relative to pool zone) */}
          {zoneObjects.map(obj => {
            // Object position relative to pool zone (no zoom here since parent is scaled)
            const relativeX = (obj.x - poolZone.offsetX) * pixelsPerVU;
            const relativeY = (obj.y - poolZone.offsetY) * pixelsPerVU;

            // Calculate if token name should be shown (same logic as main Tabletop)
            const showTokenName = obj.type === ItemType.TOKEN && (
              (obj as any).showNameOnToken ||
              (obj as any).showName ||
              ((obj as any).archetypeId && (state.objects[(obj as any).archetypeId] as any)?.showName)
            );

            // Use DeckComponent for DECK objects, BoardWithResize for BOARD objects, special rendering for DICE and COUNTER, ObjectRenderer for others
            if (obj.type === ItemType.BOARD) {
              const board = obj as BoardType;
              const boardWidth = board.width || 800;
              const boardHeight = board.height || 600;

              // Pool panel is 1000x1000 vu - calculate scale if board is larger
              const MAX_POOL_SIZE = 1000;
              const scaleX = Math.min(1, MAX_POOL_SIZE / boardWidth);
              const scaleY = Math.min(1, MAX_POOL_SIZE / boardHeight);
              const scale = Math.min(scaleX, scaleY);

              // Check if this object is being dragged (only for non-draggable items)
              const isDraggingBoard = draggingObject?.id === obj.id;

              return (
                <div
                  key={obj.id}
                  className="absolute"
                  style={{
                    left: (obj.x - poolZone.offsetX) * pixelsPerVU,
                    top: (obj.y - poolZone.offsetY) * pixelsPerVU,
                    width: boardWidth * pixelsPerVU,
                    height: boardHeight * pixelsPerVU,
                    transform: `scale(${scale})`,
                    transformOrigin: 'top left',
                  }}
                >
                  <BoardWithResizeMemo
                    token={board}
                    obj={board}
                    isOwner={true}
                    isResizing={false}
                    canResize={false} // Disable resize in pool panels
                    zoom={1} // No additional zoom - already scaled by wrapper
                    onMouseDown={(e) => handleObjectMouseDown(e, obj)}
                    onContextMenu={(e) => handleContextMenu(e, obj)}
                    onResizeStart={() => {}}
                    onResizeHandleEnter={() => {}}
                    onResizeHandleLeave={() => {}}
                    gridSize={board.gridSize || 65}
                    gridWidth={board.gridWidth}
                    gridHeight={board.gridHeight}
                    showGrid={board.showGrid}
                    currentTool={'none'}
                    livePreviewSize={null}
                  />
                </div>
              );
            }

            if (obj.type === ItemType.DECK) {
              const deckObj = obj as DeckType;
              const deckWidth = (deckObj.width || 100) * pixelsPerVU;
              const deckHeight = (deckObj.height || 140) * pixelsPerVU;

              // Check if this object is being dragged (only for non-draggable items)
              const isDraggingDeck = draggingObject?.id === obj.id;

              return (
                <DeckComponent
                  key={obj.id}
                  deck={deckObj}
                  draggingId={isDraggingDeck ? obj.id : null}
                  hoveredDeckId={hoveredDeckId}
                  hoveredPileId={hoveredPileId}
                  setHoveredDeckId={setHoveredDeckId}
                  setHoveredPileId={setHoveredPileId}
                  isGM={isGM}
                  draggingClass={isDraggingDeck ? 'dragging' : ''}
                  draggingPile={null}
                  setDraggingPile={() => {}}
                  pileDragStartRef={pileDragStartRef}
                  setTopDeckModalDeck={setTopDeckModalDeck}
                  handleMouseDown={(e, id) => handleObjectMouseDown(e, obj)}
                  handleContextMenu={(e) => handleContextMenu(e, obj)}
                  handlePileContextMenu={handlePileContextMenu}
                  setSearchModalDeck={setSearchModalDeck}
                  setSearchModalPile={setSearchModalPile}
                  setPilesButtonMenu={() => {}}
                  setDeleteCandidateId={() => {}}
                  executeClickAction={() => {}}
                  cursorSlotHasCards={false}
                  allObjects={state.objects}
                  currentTool={'none'}
                  pixelsPerVU={pixelsPerVU}
                  style={{
                    position: 'absolute',
                    left: relativeX,
                    top: relativeY,
                    width: deckWidth,
                    height: deckHeight
                  }}
                />
              );
            }

            // Render COUNTER objects
            if (obj.type === ItemType.COUNTER) {
              const counter = obj as Counter;
              const counterWidth = Math.max(counter.width || 60, 100) * pixelsPerVU;
              const counterHeight = 50 * pixelsPerVU;

              // Check if this object is being dragged (only for non-draggable items)
              const isDragging = draggingObject?.id === obj.id;

              return (
                <Tooltip
                  key={obj.id}
                  text={obj.tooltipText}
                  showImage={obj.showTooltipImage}
                  imageSrc={obj.content}
                  scale={obj.tooltipScale}
                >
                  <div
                    data-object-id={obj.id}
                    onMouseDown={(e) => handleObjectMouseDown(e, obj)}
                    onContextMenu={(e) => handleContextMenu(e, obj)}
                    className={`absolute bg-slate-900 border-2 border-slate-600 rounded-lg shadow-xl flex items-center justify-between p-2 gap-2 text-white select-none ${isDragging ? 'dragging' : ''}`}
                    style={{
                      left: relativeX,
                      top: relativeY,
                      width: counterWidth,
                      height: counterHeight,
                      transform: `rotate(${obj.rotation || 0}deg)`,
                      zIndex: obj.zIndex || 1000,
                      pointerEvents: 'auto',
                    }}
                  >
                    <button className="p-1 hover:bg-slate-700 rounded" onMouseDown={(e) => e.stopPropagation()} onClick={() => dispatch({type: 'UPDATE_COUNTER', payload: { id: obj.id, delta: -1 } })}><Minus size={14}/></button>
                    <span className="text-xl font-bold">{counter.value}</span>
                    <button className="p-1 hover:bg-slate-700 rounded" onMouseDown={(e) => e.stopPropagation()} onClick={() => dispatch({type: 'UPDATE_COUNTER', payload: { id: obj.id, delta: 1 } })}><Plus size={14}/></button>
                  </div>
                </Tooltip>
              );
            }

            // Render DICE_OBJECT objects
            if (obj.type === ItemType.DICE_OBJECT) {
              const dice = obj as DiceObject;
              const diceShape = dice.shape || TokenShape.SQUARE;
              const diceWidth = (dice.width || 60) * pixelsPerVU;
              const diceHeight = (dice.height || 60) * pixelsPerVU;

              // Check if this object is being dragged (only for non-draggable items)
              const isDragging = draggingObject?.id === obj.id;

              // Use animated value if rolling, otherwise use current value
              const displayValue = rollingDice[obj.id] ?? dice.currentValue ?? 1;

              return (
                <Tooltip
                  key={obj.id}
                  text={obj.tooltipText}
                  showImage={obj.showTooltipImage}
                  imageSrc={obj.content}
                  scale={obj.tooltipScale}
                >
                  <div
                    data-object-id={obj.id}
                    onMouseDown={(e) => handleObjectMouseDown(e, obj)}
                    onContextMenu={(e) => handleContextMenu(e, obj)}
                    className={`absolute flex items-center justify-center ${isDragging ? 'dragging' : ''}`}
                    style={{
                      left: relativeX,
                      top: relativeY,
                      width: diceWidth,
                      height: diceHeight,
                      transform: `rotate(${obj.rotation || 0}deg)`,
                      zIndex: obj.zIndex || 1000,
                      pointerEvents: 'auto',
                    }}
                  >
                    <SvgTokenShape
                      shape={diceShape}
                      width={diceWidth}
                      height={diceHeight}
                      color={dice.color || '#e74c3c'}
                      content={String(displayValue)}
                      rotation={0}
                      borderWidth={dice.borderWidth ?? 2}
                      borderColor={dice.borderColor || 'white'}
                      opacity={dice.opacity ?? 100}
                      borderOpacity={dice.borderOpacity ?? 100}
                      showThickness={true}
                      fontColor={dice.fontColor || 'white'}
                    />
                    {/* Dice value - always centered */}
                    <div
                      className="absolute flex items-center justify-center pointer-events-none"
                      style={{
                        top: diceShape === TokenShape.TRIANGLE ? '56%' : '45%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)'
                      }}
                    >
                      <span
                        className="font-bold text-white drop-shadow-md"
                        style={{
                          fontSize: `${Math.min(24 * (1 + ((dice.height || 60) / 60 - 1) * (2/3)), (dice.width || 60) * 0.7)}px`
                        }}
                      >{displayValue}</span>
                    </div>
                    {/* Dice sides indicator - midpoint between value center and bottom */}
                    <div
                      className="absolute flex items-center justify-center pointer-events-none"
                      style={{
                        top: diceShape === TokenShape.TRIANGLE ? '78%' : '72.5%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)'
                      }}
                    >
                      <span
                        className="opacity-75 text-white drop-shadow-md"
                        style={{
                          fontSize: `${Math.min(9 * (1 + ((dice.height || 60) / 60 - 1) * (2/3)), (dice.width || 60) * 0.25)}px`
                        }}
                      >d{dice.sides}</span>
                    </div>
                  </div>
                </Tooltip>
              );
            }

            // Use ObjectRenderer for CARD and TOKEN
            // Check if this object is being dragged (only for non-draggable items)
            const isDraggingObj = draggingObject?.id === obj.id;

            return (
              <ObjectRenderer
                key={obj.id}
                obj={obj}
                pixelsPerVU={pixelsPerVU}
                isDragging={isDraggingObj}
                isGM={isGM}
                showTokenName={showTokenName}
                onMouseDown={(e) => handleObjectMouseDown(e, obj)}
                onContextMenu={(e) => handleContextMenu(e, obj)}
                style={{
                  left: relativeX,
                  top: relativeY
                }}
              />
            );
          })}

        </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          object={state.objects[contextMenu.object.id] || contextMenu.object}
          isGM={isGM}
          onAction={executeMenuAction}
          onClose={() => setContextMenu(null)}
          allObjects={state.objects}
          language={state.language}
          shiftKey={contextMenu.shiftKey}
          nexusBoardEditingId={null} // Pool panels don't support Nexus Board editing
          contextMenuType="pool"
        />
      )}

      {/* Pile Context Menu */}
      {pileContextMenu && (
        <PileContextMenu
          x={pileContextMenu.x}
          y={pileContextMenu.y}
          pile={pileContextMenu.pile}
          deck={pileContextMenu.deck}
          onAction={executePileMenuAction}
          onClose={() => setPileContextMenu(null)}
          language={state.language}
        />
      )}

      {/* Object Settings Modal */}
      {settingsModalObj && (
        <ObjectSettingsModal
          object={settingsModalObj}
          onSave={(updatedObj) => {
            dispatch({ type: 'UPDATE_OBJECT', payload: updatedObj });
            setSettingsModalObj(null);
          }}
          onClose={() => setSettingsModalObj(null)}
          allObjects={state.objects}
          language={state.language}
          diceGroups={state.diceGroups}
          dispatch={dispatch}
        />
      )}

      {/* Search Deck Modal */}
      {searchModalDeck && (
        <SearchDeckModal
          deck={searchModalDeck}
          pile={searchModalPile}
          onClose={() => {
            setSearchModalDeck(null);
            setSearchModalPile(undefined);
          }}
          language={state.language}
        />
      )}

      {/* Top Deck Modal */}
      {topDeckModalDeck && (
        <TopDeckModal
          deck={topDeckModalDeck}
          onClose={() => setTopDeckModalDeck(null)}
          language={state.language}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteCandidateId && (
        <DeleteConfirmModal
          objectName={(state.objects[deleteCandidateId] as any)?.name || 'Object'}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteCandidateId(null)}
          language={state.language}
        />
      )}
    </div>
  );
};