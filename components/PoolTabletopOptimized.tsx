import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { useGame } from '../store/GameContext';
import { usePixelsPerVU, usePlayerList, useActivePlayerId, useHyperscaleLayers, useLanguage, useSettingsModalState } from '../store/contexts';
import { TableObject, ItemType, Deck as DeckType, CardPile, Counter, DiceObject, TokenShape, Board as BoardType, CardLocation, Card, ContextAction } from '../types';
import { ObjectRenderer } from './ObjectRenderer';
import { DeckComponent } from './DeckComponent';

// 🔥 OPTIMIZED: Zustand version of PoolTabletop
// Replaces: components/PoolTabletop.tsx
// Performance: Significant improvement with large scenes by using useMemo instead of repeated state.objects lookups
// NOTE: Using useMemo instead of direct Zustand hooks to avoid infinite loop with GameContext sync
import { ContextMenu } from './ContextMenu';
import { PileContextMenu } from './PileContextMenu';
import { executeContextMenuAction } from '../utils/contextMenuActions';
import { executeClickAction as universalExecuteClickAction } from '../utils/objectActionHandlers';
import { SvgTokenShape, getGlobalCacheVersion } from './SvgTokenShape';
import { Tooltip } from './Tooltip';
import { logger } from '../utils/logger';
import { Plus, Minus, RefreshCw, Trash2, Copy, Lock, Unlock, ArrowUp, ArrowDown, EyeOff, Pin, Layers } from 'lucide-react';
import { executeActionButtonUniversal } from '../utils/actionButtonsHandler';
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
import {
  calculatePickupOffsetWithFallback,
  pixelsToVU,
  type CursorSlotObject
} from '../utils/dragDropUtils';
import { allocateZIndexWithDefrag } from '../utils/zIndexAllocator';

interface PoolZone extends PoolZoneType {
  panelId: string;
  tabId: string; // Each tab has its own separate game space
}

interface PoolTabletopProps {
  poolZone: PoolZone;
  zoom?: number;
}

// ============================================
// MEMOIZED DICE ACTION BUTTONS COMPONENT
// ============================================
interface DiceActionButtonsProps {
  obj: TableObject;
  dispatch: (action: any) => void;
  state: any;
  activePlayerId: string;
  isGM: boolean;
  animateDiceRoll?: (dice: any) => void;
  setDeleteCandidateId?: (id: string | null) => void;
  setSearchModalDeck?: (deck: any) => void;
  setTopDeckModalDeck?: (deck: any) => void;
  className?: string;
  players?: any[];
}

const DiceActionButtonsMemo = React.memo(({ obj, dispatch, state, activePlayerId, isGM, animateDiceRoll, setDeleteCandidateId, setSearchModalDeck, setTopDeckModalDeck, players, className = '' }: DiceActionButtonsProps) => {
  const actionButtons = 'actionButtons' in obj ? (obj.actionButtons || []) : [];
  const dice = obj as DiceObject;
  const isInGroup = !!dice.diceGroupId;

  const buttonConfigs: Record<string, { key: string; action: () => void; className: string; title: string; icon: React.ReactNode }> = {
    roll: {
      key: 'roll',
      action: () => {
        if (animateDiceRoll) {
          animateDiceRoll(dice);
        } else {
          dispatch({ type: 'ROLL_PHYSICAL_DICE', payload: { id: obj.id, rollGroup: false } });
        }
      },
      className: 'bg-purple-600 hover:bg-purple-500',
      title: 'Roll',
      icon: <RefreshCw size={14} />
    },
    rollGroup: {
      key: 'rollGroup',
      action: () => {
        // Roll all dice in the group
        if (dice.diceGroupId) {
          const group = state.diceGroups?.find((g: any) => g.id === dice.diceGroupId);
          if (group) {
            group.diceIds.forEach((diceId: string) => {
              if (animateDiceRoll) {
                const groupDice = state.objects[diceId];
                if (groupDice?.type === ItemType.DICE_OBJECT) {
                  animateDiceRoll(groupDice);
                }
              } else {
                dispatch({ type: 'ROLL_PHYSICAL_DICE', payload: { id: diceId } });
              }
            });
          }
        }
      },
      className: 'bg-blue-600 hover:bg-blue-500',
      title: 'Roll Group',
      icon: <RefreshCw size={14} />
    },
    rotateClockwise: {
      key: 'rotateClockwise',
      action: () => dispatch({ type: 'ROTATE_OBJECT', payload: { id: obj.id } }),
      className: 'bg-yellow-600 hover:bg-yellow-500',
      title: 'Rotate CW',
      icon: <RefreshCw size={14} />
    },
    rotateCounterClockwise: {
      key: 'rotateCounterClockwise',
      action: () => dispatch({ type: 'ROTATE_OBJECT', payload: { id: obj.id } }),
      className: 'bg-yellow-600 hover:bg-yellow-500',
      title: 'Rotate CCW',
      icon: <RefreshCw size={14} style={{ transform: 'scaleX(-1)' }} />
    },
    swingClockwise: {
      key: 'swingClockwise',
      action: () => executeActionButtonUniversal(obj, 'swingClockwise', {
        dispatch, activePlayerId, objects: state.objects, state: { objects: state.objects, activePlayerId, players }, isGM
      }),
      className: 'bg-orange-600 hover:bg-orange-500',
      title: 'Swing CW',
      icon: <RefreshCw size={14} />
    },
    swingCounterClockwise: {
      key: 'swingCounterClockwise',
      action: () => executeActionButtonUniversal(obj, 'swingCounterClockwise', {
        dispatch, activePlayerId, objects: state.objects, state: { objects: state.objects, activePlayerId, players }, isGM
      }),
      className: 'bg-orange-600 hover:bg-orange-500',
      title: 'Swing CCW',
      icon: <RefreshCw size={14} style={{ transform: 'scaleX(-1)' }} />
    },
    delete: {
      key: 'delete',
      action: () => setDeleteCandidateId ? setDeleteCandidateId(obj.id) : dispatch({ type: 'DELETE_OBJECT', payload: { id: obj.id } }),
      className: 'bg-red-600 hover:bg-red-500',
      title: 'Delete',
      icon: <Trash2 size={14} />
    },
    clone: {
      key: 'clone',
      action: () => dispatch({ type: 'CLONE_OBJECT', payload: { id: obj.id } }),
      className: 'bg-cyan-600 hover:bg-cyan-500',
      title: 'Clone',
      icon: <Copy size={14} />
    },
    lock: {
      key: 'lock',
      action: () => dispatch({ type: 'TOGGLE_LOCK', payload: { id: obj.id } }),
      className: 'bg-yellow-600 hover:bg-yellow-500',
      title: obj.locked ? 'Unlock' : 'Lock',
      icon: obj.locked ? <Unlock size={14} /> : <Lock size={14} />
    },
    layer: {
      key: 'layer',
      action: () => dispatch({ type: 'MOVE_LAYER_UP', payload: { id: obj.id } }),
      className: 'bg-indigo-600 hover:bg-indigo-500',
      title: 'Layer Up',
      icon: <Layers size={14} />
    },
    layerUp: {
      key: 'layerUp',
      action: () => executeActionButtonUniversal(obj, 'layerUp', {
        dispatch, activePlayerId, objects: state.objects, state: { objects: state.objects, activePlayerId, players }, isGM
      }),
      className: 'bg-blue-600 hover:bg-blue-500',
      title: 'Layer Up',
      icon: <ArrowUp size={14} />
    },
    layerDown: {
      key: 'layerDown',
      action: () => executeActionButtonUniversal(obj, 'layerDown', {
        dispatch, activePlayerId, objects: state.objects, state: { objects: state.objects, activePlayerId, players }, isGM
      }),
      className: 'bg-blue-600 hover:bg-blue-500',
      title: 'Layer Down',
      icon: <ArrowDown size={14} />
    },
    pin: {
      key: 'pin',
      action: () => executeActionButtonUniversal(obj, 'pin', {
        dispatch, activePlayerId, objects: state.objects, state: { objects: state.objects, activePlayerId, players }, isGM
      }),
      className: 'bg-pink-600 hover:bg-pink-500',
      title: (obj as any).isPinnedToViewport ? 'Unpin' : 'Pin',
      icon: <Pin size={14} />
    },
    hide: {
      key: 'hide',
      action: () => executeActionButtonUniversal(obj, 'hide', {
        dispatch, activePlayerId, objects: state.objects, state: { objects: state.objects, activePlayerId, players }, isGM
      }),
      className: 'bg-slate-600 hover:bg-slate-500',
      title: 'Hide',
      icon: <EyeOff size={14} />
    }
  };

  let buttons = actionButtons
    .map((action: ContextAction) => buttonConfigs[action])
    .filter(Boolean);

  // Add rollGroup button if dice is in a group and not already in buttons
  if (isInGroup && !actionButtons.includes('rollGroup' as any)) {
    buttons.push(buttonConfigs.rollGroup);
  }

  // Limit to 4 buttons
  buttons = buttons.slice(0, 4);

  if (buttons.length === 0) return null;

  return (
    <div className={`absolute -bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 transition-opacity z-20 opacity-0 group-hover:opacity-100 pointer-events-none ${className}`}>
      {buttons.map((btn: { key: string; action: () => void; className: string; title: string; icon: React.ReactNode }) => (
        <button
          key={btn.key}
          onClick={(e) => { e.stopPropagation(); btn.action(); }}
          className={`pointer-events-auto p-2 rounded-lg text-white shadow ${btn.className}`}
          title={btn.title}
        >
          {btn.icon}
        </button>
      ))}
    </div>
  );
});
DiceActionButtonsMemo.displayName = 'DiceActionButtonsMemo';

export const PoolTabletopOptimized: React.FC<PoolTabletopProps> = ({ poolZone, zoom = 1.02 }) => {
  const { state, dispatch } = useGame();
  const pixelsPerVU = usePixelsPerVU();
  const players = usePlayerList();
  const activePlayerId = useActivePlayerId();
  const hyperscaleLayers = useHyperscaleLayers();
  const language = useLanguage();
  const [isSettingsModalOpen, openSettingsModal, closeSettingsModal] = useSettingsModalState();
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const currentPlayer = players.find(p => p.id === activePlayerId);
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
  // Track when item was last added to cursor slot to prevent immediate re-add after drop
  const cursorSlotLastAddedRef = useRef<number>(0);

  // Track objects that were just dropped to this pool panel to prevent immediate re-pickup
  // This solves the issue where dragging from pool panel -> dropping back to same panel
  // causes the object to be immediately picked up again
  const justDroppedToPoolRef = useRef<Set<string>>(new Set());

  // Track objects currently being dragged from this pool panel
  // This prevents them from showing in both the pool panel AND cursor slot
  const locallyDraggingIdsRef = useRef<Set<string>>(new Set());
  const [locallyDraggingTrigger, setLocallyDraggingTrigger] = useState(0);

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
    object: TableObject | null;  // Store object to avoid stale state issues
    startX: number;
    startY: number;
    isDragging: boolean;
    logCounter?: number;  // For throttling debug logs
  }>({
    objectId: null,
    object: null,
    startX: 0,
    startY: 0,
    isDragging: false,
    logCounter: 0
  });

  // State to trigger useEffect when drag starts/ends
  const [isDraggingDice, setIsDraggingDice] = useState(false);
  const [isDraggingGeneric, setIsDraggingGeneric] = useState(false);

  // Highlight state when cursor with suitable objects is over pool panel
  const [isHighlightActive, setIsHighlightActive] = useState(false);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; object: TableObject; shiftKey?: boolean } | null>(null);

  // Settings modal state
  const [settingsModalObj, setSettingsModalObj] = useState<TableObject | null>(null);

  // Sync settings modal state with UI context
  useEffect(() => {
    if (settingsModalObj) {
      openSettingsModal();
    } else {
      closeSettingsModal();
    }
  }, [settingsModalObj, openSettingsModal, closeSettingsModal]);

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
          dispatch({ type: 'ROLL_PHYSICAL_DICE', payload: { id: diceId, rollGroup: false } });
          // Clear the rollStartTime after animation completes
          dispatch({
            type: 'UPDATE_OBJECT',
            payload: { id: diceId, updates: { rollStartTime: undefined } }
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
      payload: { id: dice.id, updates: { rollStartTime } }
    });

    // Start local animation
    startDiceAnimation(dice.id, dice.sides, true);
  }, [dispatch, startDiceAnimation]);

  // Execute click actions for objects using universal handler
  const executeClickAction = useCallback((obj: TableObject, action: string, event?: React.MouseEvent) => {
    if (!action || action === 'none') return;

    // Pool panel specific actions
    switch (action) {
      case 'delete':
        setDeleteCandidateId(obj.id);
        return;
      case 'roll':
        // Use universal handler which now handles dice groups correctly
        universalExecuteClickAction(obj, action, {
          dispatch,
          state: { objects: state.objects, activePlayerId, diceGroups: state.diceGroups },
          additionalHandlers: { onAnimateDice: animateDiceRoll }
        });
        return;
      case 'millTopCard':
        if (obj.type === ItemType.DECK) {
          const deck = obj as DeckType;
          if (deck.piles) {
            const millPile = deck.piles.find(p => p.isMillPile);
            if (millPile && deck.cardIds.length > 0) {
              const topCardId = deck.cardIds[0];
              dispatch({
                type: 'ADD_CARD_TO_PILE',
                payload: { deckId: deck.id, pileId: millPile.id, cardId: topCardId }
              });
            }
          }
        }
        return;
      case 'shuffleDeck':
        if (obj.type === ItemType.DECK) {
          window.dispatchEvent(new CustomEvent('deck-shuffle-start', {
            detail: { deckId: obj.id }
          }));
          dispatch({ type: 'SHUFFLE_DECK', payload: { deckId: obj.id } });
        }
        return;
      case 'searchDeck':
        if (obj.type === ItemType.DECK) {
          setSearchModalDeck(obj as DeckType);
          setSearchModalPile(undefined);
        }
        return;
      case 'topDeck':
        if (obj.type === ItemType.DECK) {
          setTopDeckModalDeck(obj as DeckType);
        }
        return;
    }

    // Use universal action handler for standard actions
    universalExecuteClickAction(obj, action, {
      dispatch,
      state: { objects: state.objects, activePlayerId: activePlayerId },
      poolZone: { panelId: poolZone.panelId },
      additionalHandlers: {
        onDeleteCandidate: setDeleteCandidateId,
        onAnimateDice: animateDiceRoll,
        onOpenSearchDeck: setSearchModalDeck,
        onOpenTopDeckModal: setTopDeckModalDeck
      }
    }, event ? { clientX: event.clientX, clientY: event.clientY, shiftKey: event.shiftKey } : undefined);
  }, [dispatch, activePlayerId, state.objects, poolZone.panelId, setDeleteCandidateId, animateDiceRoll, setSearchModalDeck, setTopDeckModalDeck]);

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
          setSearchModalDeck(deck);
          setSearchModalPile(pile);
        }
      }
    };

    const handleOpenSearchDeckModal = (e: Event) => {
      const customEvent = e as CustomEvent<{ deckId: string; pileId?: string }>;
      const { deckId, pileId } = customEvent.detail;

      const deck = state.objects[deckId] as DeckType;
      if (deck) {
        setSearchModalDeck(deck);
        if (pileId) {
          const pile = deck.piles?.find(p => p.id === pileId);
          setSearchModalPile(pile);
        }
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

  // Listen for cursor-slot-dropped event to prevent immediate re-add
  useEffect(() => {
    const handleCursorSlotDropped = (e: Event) => {
      const customEvent = e as CustomEvent<{ cardIds: string[] }>;
      // Update the timestamp to prevent immediate re-add
      cursorSlotLastAddedRef.current = Date.now();
    };

    window.addEventListener('cursor-slot-dropped', handleCursorSlotDropped);
    return () => {
      window.removeEventListener('cursor-slot-dropped', handleCursorSlotDropped);
    };
  }, []);

  // 🔥 FIX: Listen for cursor-slot-item-adding event to clear locallyDraggingIdsRef IMMEDIATELY
  // This event is dispatched BEFORE the object is added to cursor slot, helping with timing
  // The cursor-slot-item-added event is dispatched AFTER, but this early event prevents
  // the object from being hidden during the transition
  useEffect(() => {
    const handleCursorSlotItemAdding = (e: Event) => {
      const customEvent = e as CustomEvent<{ cardId: string }>;
      const { cardId } = customEvent.detail;

      // Clear from locallyDraggingIdsRef immediately - object is about to be added to cursor slot
      if (cardId && locallyDraggingIdsRef.current.has(cardId)) {
        console.log('🚀 [CURSOR_SLOT_ITEM_ADDING] Clearing from locallyDraggingIdsRef:', cardId);
        locallyDraggingIdsRef.current.delete(cardId);
        setLocallyDraggingTrigger(prev => prev + 1);
      }
    };

    window.addEventListener('cursor-slot-item-adding', handleCursorSlotItemAdding);
    return () => {
      window.removeEventListener('cursor-slot-item-adding', handleCursorSlotItemAdding);
    };
  }, []);

  // 🔥 FIX: Listen for cursor-slot-item-added event to clear locallyDraggingIdsRef
  // When object is successfully added to cursor slot, remove it from locallyDraggingIdsRef
  // This prevents object from disappearing (it's hidden by locallyDraggingIdsRef during drag,
  // but should stay hidden because inCursorSlot=true after successful add)
  //
  // IMPORTANT: We must check cursorSlot state directly, not state.objects.inCursorSlot,
  // because cursorSlot is updated BEFORE the UPDATE_OBJECT dispatch that sets inCursorSlot=true.
  // This prevents a race condition where the object briefly reappears.
  useEffect(() => {
    const handleCursorSlotItemAdded = (e: Event) => {
      const customEvent = e as CustomEvent<{ cardId: string }>;
      const { cardId } = customEvent.detail;

      // Check if object was in locallyDraggingIdsRef
      if (cardId && locallyDraggingIdsRef.current.has(cardId)) {
        // Also verify that the object is actually in the cursor slot now
        // We need to access cursorSlot from GameContext since we can't use hooks here
        // For now, we'll trust that if cursor-slot-item-added was dispatched,
        // the object will be in cursorSlot momentarily
        console.log('✅ [CURSOR_SLOT_ITEM_ADDED] Removing from locallyDraggingIdsRef:', cardId);
        locallyDraggingIdsRef.current.delete(cardId);
        setLocallyDraggingTrigger(prev => prev + 1);

        // Schedule a verification to ensure object stays hidden
        // If inCursorSlot is not set after a short delay, force it
        setTimeout(() => {
          const obj = state.objects[cardId];
          if (obj && (obj as any).inCursorSlot !== true) {
            console.log('⚠️ [CURSOR_SLOT_ITEM_ADDED] Object not in cursor slot after delay:', cardId);
          }
        }, 50);
      }
    };

    window.addEventListener('cursor-slot-item-added', handleCursorSlotItemAdded);
    return () => {
      window.removeEventListener('cursor-slot-item-added', handleCursorSlotItemAdded);
    };
  }, [state.objects]);

  // Dice animation state
  const [rollingDice, setRollingDice] = useState<Record<string, number>>({});
  const initiatedRollsRef = useRef<Set<string>>(new Set());
  const lastSeenRollStartTimeRef = useRef<Record<string, number>>({});

  // Deck hover state
  const [hoveredPileId, setHoveredPileId] = useState<string | null>(null);

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

    // Log filtering for debugging
    const filterLog: any[] = [];

    const filtered = allObjects.filter(obj => {
      // Exclude UI objects (panels and windows) - they have their own rendering
      if (obj.type === ItemType.PANEL || obj.type === ItemType.WINDOW) {
        return false;
      }

      // Exclude hidden objects (isOnTable: false)
      if ((obj as any).isOnTable === false) {
        filterLog.push({ id: obj.id, reason: 'isOnTable=false', isOnTable: (obj as any).isOnTable });
        return false;
      }

      // Exclude objects in cursor slot - they should disappear from pool panel when picked up
      // This applies regardless of which pool panel they came from
      const inCursorSlot = (obj as any).inCursorSlot;

      if (inCursorSlot) {
        return false;
      }

      // Also exclude objects that are currently being dragged from this pool panel
      // This prevents visual duplication while the object is being picked up
      if (locallyDraggingIdsRef.current.has(obj.id)) {
        console.log('🚫 [POOL_FILTER] Excluded by locallyDraggingIdsRef:', obj.id, 'Set size:', locallyDraggingIdsRef.current.size);
        return false;
      }

      // Exclude cards that are in deck (location: DECK) - they are part of the deck
      if (obj.type === ItemType.CARD && (obj as any).location === CardLocation.DECK) {
        filterLog.push({ id: obj.id, reason: 'location=DECK', location: (obj as any).location });
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
        if (!isInPool && (obj as any).inCursorSlot === false) {
          filterLog.push({
            id: obj.id,
            reason: 'outside-pool-bounds',
            type: obj.type,
            objX, objY, objWidth, objHeight,
            poolMinX, poolMaxX, poolMinY, poolMaxY
          });
        }
        return isInPool;
      }

      // For other objects: use center point
      const centerX = objX + objWidth / 2;
      const centerY = objY + objHeight / 2;
      const isInPool = centerX >= poolMinX && centerX <= poolMaxX &&
                       centerY >= poolMinY && centerY <= poolMaxY;
      if (!isInPool && (obj as any).inCursorSlot === false) {
        filterLog.push({
          id: obj.id,
          reason: 'center-outside-pool',
          type: obj.type,
          centerX, centerY,
          poolMinX, poolMaxX, poolMinY, poolMaxY
        });
      }
      return isInPool;
    });

    // Sort by hyperscale layer order and zIndex (same as main Tabletop)
    const sorted = filtered.sort((a, b) => {
      // First, sort by hyperscale layer order (boards < cards < tokens < interface)
      const layerA = hyperscaleLayers.find(l => l.id === (a.hyperscaleLayerId || 'tokens'));
      const layerB = hyperscaleLayers.find(l => l.id === (b.hyperscaleLayerId || 'tokens'));
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

    return sorted;
  }, [state.objects, poolZone, hyperscaleLayers, locallyDraggingTrigger]);

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

    // IMPORTANT: Check if this object was just dropped to this pool panel
    // This prevents immediate re-pickup when dragging from pool panel -> dropping back to same panel
    if (justDroppedToPoolRef.current.has(obj.id)) {
      return;
    }

    // Check if cursor slot already has items - drop them first (unless shift is held)
    const cursorSlotObjects = getCursorSlotObjects(state.objects);

    if (cursorSlotObjects.length > 0 && !e.shiftKey) {
      // IMPORTANT: If cursor slot has items, just return without picking up new object
      // The cursor slot items will be dropped when user clicks elsewhere (mouseup)
      e.preventDefault();
      e.stopPropagation();

      console.log('[PoolTabletop] Cursor slot has items - not picking up new object');
      return;
    }

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

      // Track drag distance (boards use same logic as tokens now)
      genericDragRef.current = {
        objectId: obj.id,
        object: obj,  // Store object reference to avoid stale state issues
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
  }, [poolZone.panelId, clickTimerRef, clickTrackerRef, handleRollDice, setLocallyDraggingTrigger, players, pixelsPerVU, currentZoom, poolZone, dispatch, state.objects, hyperscaleLayers]);

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

    if (!contextMenu) {
      return;
    }

    // Always get fresh object from state to ensure we have latest data
    const targetObject = state.objects[contextMenu.object.id] || contextMenu.object;

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
          activePlayerId: activePlayerId,
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

        // Close menu after executing special action (except for modals)
        if (setContextMenu && action !== 'configure' && action !== 'delete') {
          setContextMenu(null);
        } else {
        }
      } catch (error) {
      }
    }

    // Handle basic actions that weren't handled by executeContextMenuAction
    if (!wasHandled) {
      switch (action) {
        case 'roll':
          // Roll dice - handled by double-click, but also available from context menu
          if (targetObject.type === ItemType.DICE_OBJECT) {
            animateDiceRoll(targetObject as DiceObject);
          }
          break;

        default:
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
      if (setContextMenu) setContextMenu(null);
    }

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
    if (!pileContextMenu) return;
    const { pile, deck } = pileContextMenu;

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
            playerId: activePlayerId
          }
        });
        setPileContextMenu(null);
        break;
      case 'playTopCard':
        // Play top card from pile to cursor slot
        if (pile.cardIds.length > 0) {
          const topCardId = pile.cardIds[0];
          const card = state.objects[topCardId];
          if (card) {
            const cardWidth = deck.cardWidth ?? card.width ?? 63;
            const cardHeight = deck.cardHeight ?? card.height ?? 88;
            const clickOffsetX = cardWidth / 2;
            const clickOffsetY = cardHeight / 2;

            // Dispatch event to add to cursor slot
            window.dispatchEvent(new CustomEvent('add-to-cursor-slot', {
              detail: {
                cardId: card.id,
                clientX: pileContextMenu.x,
                clientY: pileContextMenu.y,
                source: 'pile',
                cardOverride: {
                  ...card,
                  location: 'CURSOR_SLOT' as any,
                  faceUp: pile.faceUp ?? true,
                  isOnTable: false,
                  width: cardWidth,
                  height: cardHeight,
                },
                clickOffsetX,
                clickOffsetY
              }
            }));

            // Remove card from pile
            dispatch({
              type: 'DRAW_FROM_PILE',
              payload: {
                pileId: pile.id,
                deckId: deck.id,
                playerId: activePlayerId
              }
            });
          }
        }
        setPileContextMenu(null);
        break;
      case 'returnAll':
        // Return all cards from this pile to deck only
        dispatch({
          type: 'RETURN_ALL_CARDS_TO_DECK',
          payload: {
            deckId: deck.id,
            fromPile: true,
            pileId: pile.id
          }
        });
        setPileContextMenu(null);
        break;
    }
  }, [pileContextMenu, activePlayerId, dispatch, state.objects]);

  // Cleanup click timers on unmount
  useEffect(() => {
    return () => {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
      }
    };
  }, []);

  // Timer ref for just-dropped cleanup
  const justDroppedTimerRef = useRef<number | null>(null);

  // Cleanup just-dropped timer on unmount
  useEffect(() => {
    return () => {
      if (justDroppedTimerRef.current) {
        clearTimeout(justDroppedTimerRef.current);
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

      // Use same threshold as main tabletop: 2 VU (virtual units)
      const thresholdPixels = 2 * pixelsPerVU * currentZoom;
      if (distance > thresholdPixels && !diceDragRef.current.isDragging) {
        diceDragRef.current.isDragging = true;

        // Calculate click offset using centralized utility
        const obj = state.objects[diceDragRef.current.objectId];

        console.log('🔍 [DICE_OBJ_LOOKUP] Looking up dice object:', {
          diceId: diceDragRef.current.objectId,
          objFound: !!obj,
          objType: obj?.type,
          totalStateObjects: Object.keys(state.objects).length
        });

        let clickOffsetX, clickOffsetY;
        let offsetXPX = 0, offsetYPX = 0;

        if (obj) {
          const offsetResult = calculatePickupOffsetWithFallback(
            obj,
            diceDragRef.current.startX,
            diceDragRef.current.startY,
            pixelsPerVU,
            { containerRef: { current: containerRef.current } }
          );
          offsetXPX = offsetResult.offsetX_PX;
          offsetYPX = offsetResult.offsetY_PX;

          // Convert to VU for drop positioning
          const vuOffset = pixelsToVU(offsetXPX, offsetYPX, pixelsPerVU);
          clickOffsetX = vuOffset.offsetX_VU;
          clickOffsetY = vuOffset.offsetY_VU;
        }

        // Add to cursor slot immediately when drag threshold is exceeded
        // First, mark as locally dragging to prevent visual duplication
        if (diceDragRef.current.objectId) {
          console.log('🎯 [POOL_DRAG_START] Adding to locallyDraggingIdsRef:', diceDragRef.current.objectId);
          locallyDraggingIdsRef.current.add(diceDragRef.current.objectId);
          setLocallyDraggingTrigger(prev => prev + 1);
        }

        // IMPORTANT: Check if this object was just dropped to this pool panel
        // This prevents immediate re-pickup after dropping back to same panel
        if (diceDragRef.current.objectId && justDroppedToPoolRef.current.has(diceDragRef.current.objectId)) {
          diceDragRef.current = {
            objectId: null,
            startX: 0,
            startY: 0,
            isDragging: false
          };
          setIsDraggingDice(false);
          return;
        }

        // IMPORTANT: Check if this object was just dropped to this pool panel
        // This prevents immediate re-pickup after dropping back to same panel
        // Using object ID tracking instead of global timer - more reliable
        if (diceDragRef.current.objectId && justDroppedToPoolRef.current.has(diceDragRef.current.objectId)) {
          diceDragRef.current = {
            objectId: null,
            startX: 0,
            startY: 0,
            isDragging: false
          };
          setIsDraggingDice(false);
          return;
        }

        // 🔥 FIX: Send cardOverride with actual object data from pool panel
        // This ensures correct dice data is used instead of stale data from state.objects
        // Note: obj is already declared above in this scope

        // If not in state.objects, it's a pool panel object - create minimal cardOverride
        // Include type so TabletopRefactored knows how to handle it
        const cardOverride: any = obj ? { ...obj } : {
          id: diceDragRef.current.objectId,
          type: ItemType.DICE_OBJECT
        };

        console.log('📤 [ADD_TO_CURSOR_SLOT] Dispatching add-to-cursor-slot for dice:', diceDragRef.current.objectId, {
          hasObj: !!obj,
          hasCardOverride: !!cardOverride,
          overrideType: cardOverride?.type,
          fromPoolPanel: poolZone.panelId
        });

        window.dispatchEvent(new CustomEvent('add-to-cursor-slot', {
          detail: {
            cardId: diceDragRef.current.objectId,
            clientX: diceDragRef.current.startX,
            clientY: diceDragRef.current.startY,
            source: 'hold',
            fromPoolPanel: poolZone.panelId,
            sourceZoom: currentZoom,
            clickOffsetX,
            clickOffsetY,
            clickOffsetX_PX: offsetXPX,
            clickOffsetY_PX: offsetYPX,
            cardOverride
          }
        }));

        // Update timestamp to track when item was added to slot
        cursorSlotLastAddedRef.current = Date.now();
      }
      return;
    }

    // Handle generic drag tracking for other draggable objects
    if (genericDragRef.current.objectId) {
      const deltaX = e.clientX - genericDragRef.current.startX;
      const deltaY = e.clientY - genericDragRef.current.startY;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      // Use same threshold as main tabletop: 2 VU (virtual units)
      const thresholdPixels = 2 * pixelsPerVU * currentZoom;
      // Throttle logging: only log every 5th call or when threshold is exceeded
      if (!genericDragRef.current.logCounter) genericDragRef.current.logCounter = 0;
      genericDragRef.current.logCounter++;
      if (distance > thresholdPixels && !genericDragRef.current.isDragging) {
        genericDragRef.current.isDragging = true;

        // Use stored object from ref instead of state to avoid stale closure issues
        const obj = genericDragRef.current.object || state.objects[genericDragRef.current.objectId || ''];
        let clickOffsetX, clickOffsetY;
        let offsetXPX = 0, offsetYPX = 0;

        if (obj) {
          const offsetResult = calculatePickupOffsetWithFallback(
            obj,
            genericDragRef.current.startX,
            genericDragRef.current.startY,
            pixelsPerVU,
            { containerRef: { current: containerRef.current }, debug: false }
          );
          offsetXPX = offsetResult.offsetX_PX;
          offsetYPX = offsetResult.offsetY_PX;

          // Convert to VU for drop positioning
          const vuOffset = pixelsToVU(offsetXPX, offsetYPX, pixelsPerVU);
          clickOffsetX = vuOffset.offsetX_VU;
          clickOffsetY = vuOffset.offsetY_VU;
        }

        // Add to cursor slot immediately when drag threshold is exceeded
        // First, mark as locally dragging to prevent visual duplication
        if (genericDragRef.current.objectId) {
          console.log('🎯 [POOL_DRAG_START] Adding to locallyDraggingIdsRef:', genericDragRef.current.objectId);
          locallyDraggingIdsRef.current.add(genericDragRef.current.objectId);
          setLocallyDraggingTrigger(prev => prev + 1);
        }

        // IMPORTANT: Check if this object was just dropped to this pool panel
        // This prevents immediate re-pickup after dropping back to same panel
        // Using object ID tracking instead of global timer - more reliable
        if (genericDragRef.current.objectId && justDroppedToPoolRef.current.has(genericDragRef.current.objectId)) {
          genericDragRef.current = {
            objectId: null,
            object: null,
            startX: 0,
            startY: 0,
            isDragging: false,
            logCounter: 0
          };
          setIsDraggingGeneric(false);
          return;
        }

        // 🔥 FIX: Send cardOverride with actual object data from pool panel
        // This ensures correct faceUp and location are used instead of stale data from state.objects
        const cardOverride: any = obj ? { ...obj } : undefined;
        // IMPORTANT: Explicitly preserve faceUp and location from the visible object
        if (cardOverride) {
          cardOverride.faceUp = (obj as any).faceUp;
          cardOverride.location = (obj as any).location;
          // Don't override x/y - let cursor slot handle positioning
        }

        console.log('📤 [ADD_TO_CURSOR_SLOT] Dispatching add-to-cursor-slot for generic:', genericDragRef.current.objectId, {
          type: obj?.type,
          faceUp: (obj as any)?.faceUp,
          location: (obj as any)?.location,
          fromPoolPanel: poolZone.panelId,
          sendingCardOverride: !!cardOverride
        });
        window.dispatchEvent(new CustomEvent('add-to-cursor-slot', {
          detail: {
            cardId: genericDragRef.current.objectId,
            clientX: genericDragRef.current.startX,
            clientY: genericDragRef.current.startY,
            source: 'hold',
            fromPoolPanel: poolZone.panelId,
            sourceZoom: currentZoom,
            clickOffsetX,
            clickOffsetY,
            clickOffsetX_PX: offsetXPX,
            clickOffsetY_PX: offsetYPX,
            cardOverride
          }
        }));

        // Update timestamp to track when item was added to slot
        cursorSlotLastAddedRef.current = Date.now();
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

      // 🔥 FIX: Don't clear locallyDraggingIdsRef immediately on mouse up
      // Instead, wait for cursor-slot-item-added event to confirm object was added to cursor slot
      // If object wasn't added (drag cancelled), clear it after a timeout
      if (objectId && wasDrag) {
        console.log('🧹 [DICE_MOUSEUP] Scheduling cleanup for:', objectId, 'wasDrag:', wasDrag);

        // Schedule cleanup in case cursor slot add didn't happen
        setTimeout(() => {
          // Check if object is still in locallyDraggingIdsRef (meaning cursor-slot-item-added didn't clear it)
          if (locallyDraggingIdsRef.current.has(objectId)) {
            const obj = state.objects[objectId];
            console.log('🔄 [DICE_MOUSEUP_TIMEOUT] Cursor slot add not confirmed, checking for:', objectId, {
              objFound: !!obj,
              inCursorSlot: obj ? (obj as any).inCursorSlot : 'obj not found',
              stillInDraggingRef: true
            });

            // If object is in cursor slot now, it was successfully added - clear from dragging ref
            if (obj && (obj as any).inCursorSlot === true) {
              console.log('✅ [DICE_MOUSEUP_TIMEOUT] Object in cursor slot, clearing from locallyDraggingIdsRef:', objectId);
              locallyDraggingIdsRef.current.delete(objectId);
              setLocallyDraggingTrigger(prev => prev + 1);
            } else if (obj && (obj as any).inCursorSlot === false) {
              // Object not in cursor slot - drag was cancelled or failed
              // Clear from dragging ref so it reappears in pool panel
              console.log('⚠️ [DICE_MOUSEUP_TIMEOUT] Drag cancelled, clearing locallyDraggingIdsRef:', objectId);
              locallyDraggingIdsRef.current.delete(objectId);
              setLocallyDraggingTrigger(prev => prev + 1);
            }
          }
        }, 150);
      } else if (objectId && !wasDrag) {
        // For clicks (not drags), clear immediately
        console.log('🧹 [DICE_MOUSEUP] Clearing from click (not drag):', objectId);
        locallyDraggingIdsRef.current.delete(objectId);
        setLocallyDraggingTrigger(prev => prev + 1);
      }

      // Use same threshold as main tabletop: 2 VU (virtual units)
      const thresholdPixels = 2 * pixelsPerVU * currentZoom;
      // If this was a click (not a drag), handle click detection
      if (!wasDrag && distance < thresholdPixels) {
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
      const objectId = genericDragRef.current.objectId;

      // Reset drag tracking
      genericDragRef.current = {
        objectId: null,
        object: null,
        startX: 0,
        startY: 0,
        isDragging: false,
        logCounter: 0
      };
      setIsDraggingGeneric(false);

      // 🔥 FIX: Don't clear locallyDraggingIdsRef immediately on mouse up
      // Instead, wait for cursor-slot-item-added event to confirm object was added to cursor slot
      // If object wasn't added (drag cancelled), clear it after a timeout
      if (objectId && wasDrag) {
        console.log('🧹 [OBJECT_MOUSEUP] Scheduling cleanup for:', objectId, 'wasDrag:', wasDrag);

        // Schedule cleanup in case cursor slot add didn't happen
        setTimeout(() => {
          // Check if object is still in locallyDraggingIdsRef (meaning cursor-slot-item-added didn't clear it)
          if (locallyDraggingIdsRef.current.has(objectId)) {
            const obj = state.objects[objectId];
            console.log('🔄 [OBJECT_MOUSEUP_TIMEOUT] Cursor slot add not confirmed, checking for:', objectId, {
              objFound: !!obj,
              inCursorSlot: obj ? (obj as any).inCursorSlot : 'obj not found',
              stillInDraggingRef: true
            });

            // If object is in cursor slot now, it was successfully added - clear from dragging ref
            if (obj && (obj as any).inCursorSlot === true) {
              console.log('✅ [OBJECT_MOUSEUP_TIMEOUT] Object in cursor slot, clearing from locallyDraggingIdsRef:', objectId);
              locallyDraggingIdsRef.current.delete(objectId);
              setLocallyDraggingTrigger(prev => prev + 1);
            } else if (obj && (obj as any).inCursorSlot === false) {
              // Object not in cursor slot - drag was cancelled or failed
              // Clear from dragging ref so it reappears in pool panel
              console.log('⚠️ [OBJECT_MOUSEUP_TIMEOUT] Drag cancelled, clearing locallyDraggingIdsRef:', objectId);
              locallyDraggingIdsRef.current.delete(objectId);
              setLocallyDraggingTrigger(prev => prev + 1);
            }
          }
        }, 150);
      } else if (objectId && !wasDrag) {
        // For clicks (not drags), clear immediately
        console.log('🧹 [OBJECT_MOUSEUP] Clearing from click (not drag):', objectId);
        locallyDraggingIdsRef.current.delete(objectId);
        setLocallyDraggingTrigger(prev => prev + 1);
      }

      // Use same threshold as main tabletop: 2 VU (virtual units)
      const thresholdPixels = 2 * pixelsPerVU * currentZoom;
      // If this was a click (not a drag), don't add to cursor slot
      // Only drags should have already added the object to cursor slot
      if (!wasDrag && distance < thresholdPixels) {
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
        updates: {
          x: newX,
          y: newY
        }
      }
    });

    setDraggingObject(null);
  }, [draggingObject, dragStartPos, currentZoom, pixelsPerVU, dispatch, poolZone, state.objects, handleRollDice, poolZone.panelId]);

  // Drop cards to deck in pool panel
  const dropToDeck = useCallback((deckId: string, slotItems?: (Card | TableObject)[]) => {
    const cursorSlotObjects = slotItems ?? getCursorSlotObjects(state.objects);

    if (cursorSlotObjects.length === 0) {
      return;
    }

    const deck = state.objects[deckId] as DeckType;
    if (!deck) {
      return;
    }

    // Only add cards to deck (not tokens)
    const cardsInSlot = cursorSlotObjects.filter(item => item.type === ItemType.CARD);
    if (cardsInSlot.length > 0) {
      // Add cards to deck in reverse order (last in slot = first to be added = ends up on top)
      // ADD_CARD_TO_TOP_OF_DECK will handle setting inCursorSlot: false and updating position
      // It also prevents duplicate additions by checking if card is already in deck
      [...cardsInSlot].reverse().forEach((item) => {
        dispatch({
          type: 'ADD_CARD_TO_TOP_OF_DECK',
          payload: { cardId: item.id, deckId }
        });
      });
    }

    // For non-card items (tokens), drop them on the pool tabletop at deck position
    const nonCardsInSlot = cursorSlotObjects.filter(item => item.type !== ItemType.CARD);
    if (nonCardsInSlot.length > 0) {
      // Sort tokens by their original z-index to preserve visual order
      const sortedTokens = [...nonCardsInSlot].sort((a, b) => {
        const zA = (a as any).originalZIndex ?? a.zIndex ?? 0;
        const zB = (b as any).originalZIndex ?? b.zIndex ?? 0;
        return zB - zA; // Descending - higher Z first
      });

      // Group tokens by hyperscale layer for z-index allocation
      const layerGroups: Record<string, typeof sortedTokens> = {};
      for (const item of sortedTokens) {
        const layerId = item.hyperscaleLayerId ?? 'default';
        if (!layerGroups[layerId]) {
          layerGroups[layerId] = [];
        }
        layerGroups[layerId].push(item);
      }

      // Allocate z-indices for each layer
      const layerAllocations: Record<string, { allocatedZIndex: number; objectsToUpdate?: Record<string, number> }> = {};
      for (const [layerId, layerItems] of Object.entries(layerGroups)) {
        const allocation = allocateZIndexWithDefrag(
          state.objects,
          layerId === 'default' ? undefined : layerId,
          hyperscaleLayers
        );
        layerAllocations[layerId] = allocation;

        // If defragmentation was needed, apply it first
        if (allocation.objectsToUpdate) {
          for (const [objId, newZ] of Object.entries(allocation.objectsToUpdate)) {
            dispatch({
              type: 'UPDATE_OBJECT',
              payload: {
                id: objId,
                updates: { zIndex: newZ }
              }
            });
          }
        }
      }

      // Track item index within each layer for sequential z-index allocation
      const layerItemIndices: Record<string, number> = {};

      sortedTokens.forEach((item, sortedIndex) => {
        const baseWidth = item.width ?? 50;
        const baseHeight = item.height ?? 50;

        const offsetFromFront = sortedIndex;
        const offsetAmount = Math.min(baseWidth, baseHeight) * 0.05;
        const offsetX = offsetFromFront * offsetAmount;
        const offsetY = offsetFromFront * offsetAmount;

        // Get allocated z-index for this item's layer
        const layerId = item.hyperscaleLayerId ?? 'default';
        const allocation = layerAllocations[layerId];
        let finalZIndex = item.zIndex ?? 0;

        if (allocation) {
          const currentIndex = layerItemIndices[layerId] ?? 0;
          finalZIndex = allocation.allocatedZIndex + currentIndex;
          layerItemIndices[layerId] = currentIndex + 1;
        }

        // Use DROP_FROM_CURSOR_SLOT action
        dispatch({
          type: 'DROP_FROM_CURSOR_SLOT',
          payload: {
            objectId: item.id,
            x: deck.x + deck.width / 2 - baseWidth / 2 + offsetX,
            y: deck.y + deck.height / 2 - baseHeight / 2 + offsetY,
            zIndex: finalZIndex,
          }
        });
      });
    }

    // Send cursor-left-deck event to remove highlight from deck
    window.dispatchEvent(new CustomEvent('cursor-left-deck', {
      detail: { deckId }
    }));

    // Send cursor-slot-dropped event to reset hover state in DeckComponent
    window.dispatchEvent(new CustomEvent('cursor-slot-dropped', {
      detail: { cardIds: cursorSlotObjects.map(o => o.id) }
    }));

    // Track dropped objects to prevent immediate re-pickup
    cursorSlotObjects.forEach(obj => justDroppedToPoolRef.current.add(obj.id));

    // Clear the just-dropped set after 200ms
    setTimeout(() => {
      justDroppedToPoolRef.current.clear();
    }, 200);

    // Clear only dropped objects from cursor slot
    window.dispatchEvent(new CustomEvent('clear-cursor-slot', {
      detail: { objectIds: cursorSlotObjects.map(o => o.id) }
    }));

    // Update timestamp to prevent immediate re-add
    cursorSlotLastAddedRef.current = Date.now();
  }, [state.objects, dispatch, hyperscaleLayers]);

  // Drop cards to pile in pool panel
  const dropToPile = useCallback((pileId: string, deckId: string, slotItems?: (Card | TableObject)[]) => {
    const cursorSlotObjects = slotItems ?? getCursorSlotObjects(state.objects);

    if (cursorSlotObjects.length === 0) {
      return;
    }

    // Only add cards to pile (not tokens)
    const cardsInSlot = cursorSlotObjects.filter(item => item.type === ItemType.CARD);
    if (cardsInSlot.length > 0) {
      // First, restore cards from cursor slot (set inCursorSlot: false)
      // Use _localOnly to prevent visual flicker - card will be updated again by ADD_CARD_TO_TOP_OF_DECK/ADD_CARD_TO_PILE
      cardsInSlot.forEach((item) => {
        dispatch({
          type: 'UPDATE_OBJECT',
          payload: { id: item.id, updates: { inCursorSlot: false, fromPoolPanel: undefined } },
          _localOnly: true
        });
      });

      // Then add them to the pile in reverse order (last in slot = first to be added = ends up on top)
      [...cardsInSlot].reverse().forEach((item) => {
        dispatch({
          type: 'ADD_CARD_TO_PILE',
          payload: { cardId: item.id, pileId, deckId }
        });
      });
    }

    // For non-card items (tokens), drop them on the pool tabletop near the pile
    const deck = state.objects[deckId] as DeckType;
    const pile = deck?.piles?.find(p => p.id === pileId);
    const nonCardsInSlot = cursorSlotObjects.filter(item => item.type !== ItemType.CARD);
    if (nonCardsInSlot.length > 0 && deck && pile) {
      // Calculate pile position
      const pileSize = pile.size ?? 1;
      let pileX: number, pileY: number;

      if (pile.position === 'free') {
        pileX = pile.x ?? 0;
        pileY = pile.y ?? 0;
      } else if (pile.position === 'right') {
        pileX = deck.x + deck.width + 4;
        pileY = deck.y;
      } else if (pile.position === 'left') {
        pileX = deck.x - deck.width - 4;
        pileY = deck.y;
      } else if (pile.position === 'top') {
        pileX = deck.x;
        pileY = deck.y - deck.height - 4;
      } else if (pile.position === 'bottom') {
        pileX = deck.x;
        pileY = deck.y + deck.height + 4;
      } else {
        pileX = deck.x;
        pileY = deck.y;
      }

      // Sort tokens by their original z-index to preserve visual order
      const sortedTokens = [...nonCardsInSlot].sort((a, b) => {
        const zA = (a as any).originalZIndex ?? a.zIndex ?? 0;
        const zB = (b as any).originalZIndex ?? b.zIndex ?? 0;
        return zB - zA; // Descending - higher Z first
      });

      // Group tokens by hyperscale layer for z-index allocation
      const layerGroups: Record<string, typeof sortedTokens> = {};
      for (const item of sortedTokens) {
        const layerId = item.hyperscaleLayerId ?? 'default';
        if (!layerGroups[layerId]) {
          layerGroups[layerId] = [];
        }
        layerGroups[layerId].push(item);
      }

      // Allocate z-indices for each layer
      const layerAllocations: Record<string, { allocatedZIndex: number; objectsToUpdate?: Record<string, number> }> = {};
      for (const [layerId, _layerItems] of Object.entries(layerGroups)) {
        const allocation = allocateZIndexWithDefrag(
          state.objects,
          layerId === 'default' ? undefined : layerId,
          hyperscaleLayers
        );
        layerAllocations[layerId] = allocation;

        // If defragmentation was needed, apply it first
        if (allocation.objectsToUpdate) {
          for (const [objId, newZ] of Object.entries(allocation.objectsToUpdate)) {
            dispatch({
              type: 'UPDATE_OBJECT',
              payload: {
                id: objId,
                updates: { zIndex: newZ }
              }
            });
          }
        }
      }

      // Track item index within each layer for sequential z-index allocation
      const layerItemIndices: Record<string, number> = {};

      sortedTokens.forEach((item, sortedIndex) => {
        const baseWidth = item.width ?? 50;
        const baseHeight = item.height ?? 50;

        const offsetFromFront = sortedIndex;
        const offsetAmount = Math.min(baseWidth, baseHeight) * 0.05;
        const offsetX = offsetFromFront * offsetAmount;
        const offsetY = offsetFromFront * offsetAmount;

        // Get allocated z-index for this item's layer
        const layerId = item.hyperscaleLayerId ?? 'default';
        const allocation = layerAllocations[layerId];
        let finalZIndex = item.zIndex ?? 0;

        if (allocation) {
          const currentIndex = layerItemIndices[layerId] ?? 0;
          finalZIndex = allocation.allocatedZIndex + currentIndex;
          layerItemIndices[layerId] = currentIndex + 1;
        }

        dispatch({
          type: 'DROP_FROM_CURSOR_SLOT',
          payload: {
            objectId: item.id,
            x: pileX + offsetX,
            y: pileY + offsetY,
            zIndex: finalZIndex,
          }
        });
      });
    }

    // Send cursor-left-deck event to remove highlight from deck (for pile drops too)
    window.dispatchEvent(new CustomEvent('cursor-left-deck', {
      detail: { deckId }
    }));

    // Send cursor-slot-dropped event to reset hover state in DeckComponent
    window.dispatchEvent(new CustomEvent('cursor-slot-dropped', {
      detail: { cardIds: cursorSlotObjects.map(o => o.id) }
    }));

    // Track dropped objects to prevent immediate re-pickup
    cursorSlotObjects.forEach(obj => justDroppedToPoolRef.current.add(obj.id));

    // Clear the just-dropped set after 200ms
    setTimeout(() => {
      justDroppedToPoolRef.current.clear();
    }, 200);

    // Clear only dropped objects from cursor slot
    window.dispatchEvent(new CustomEvent('clear-cursor-slot', {
      detail: { objectIds: cursorSlotObjects.map(o => o.id) }
    }));

    // Update timestamp to prevent immediate re-add
    cursorSlotLastAddedRef.current = Date.now();
  }, [state.objects, dispatch, hyperscaleLayers]);

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
    return undefined;
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
      return;
    }

    // Close context menu if open
    if (contextMenu) {
      setContextMenu(null);
    }

    // Don't drop if modifiers are pressed (Ctrl/Meta)
    if (e.ctrlKey || e.metaKey) return;

    // IMPORTANT: Check if cursor is over a deck or pile FIRST
    // If the deck/pile is in THIS pool panel, handle it locally
    // Use elementsFromPoint to check all elements under cursor
    const elementsAtCursor = document.elementsFromPoint(e.clientX, e.clientY);

    // Check for piles FIRST (before deck) - piles are more specific targets
    let pileElement: Element | null = null;
    for (const element of elementsAtCursor) {
      pileElement = element.closest('[data-pile-id]');
      if (pileElement) break;
    }

    if (pileElement) {
      const pileId = pileElement.getAttribute('data-pile-id');
      const deckElement = pileElement.closest('[data-object-id]');
      const deckId = deckElement?.getAttribute('data-object-id');

      if (pileId && deckId) {
        const deck = state.objects[deckId] as DeckType;
        // Check if this deck is in the current pool panel
        if (deck && deck.x >= poolZone.offsetX && deck.x < poolZone.offsetX + poolZone.width &&
            deck.y >= poolZone.offsetY && deck.y < poolZone.offsetY + poolZone.height) {
          // Check if cursor is actually over the pile element's bounding box
          const pileRect = pileElement.getBoundingClientRect();
          const isOverPile = e.clientX >= pileRect.left && e.clientX <= pileRect.right &&
                           e.clientY >= pileRect.top && e.clientY <= pileRect.bottom;

          if (isOverPile) {
            dropToPile(pileId, deckId);
            return;
          }
        }
        // Pile is in main tabletop - let main handler process it
        return;
      }
      // If not a valid pile, ignore and continue
    }

    // Check for deck
    let deckElement: Element | null = null;
    for (const element of elementsAtCursor) {
      deckElement = element.closest('[data-object-id]');
      if (deckElement) break;
    }

    if (deckElement) {
      const objectId = deckElement.getAttribute('data-object-id');
      const obj = objectId ? state.objects[objectId] : undefined;
      if (obj && obj.type === ItemType.DECK) {
        const deck = obj as DeckType;
        // Check if this deck is in the current pool panel
        if (deck.x >= poolZone.offsetX && deck.x < poolZone.offsetX + poolZone.width &&
            deck.y >= poolZone.offsetY && deck.y < poolZone.offsetY + poolZone.height) {
          // Check if cursor is actually over the deck element's bounding box
          const deckRect = deckElement.getBoundingClientRect();
          const isOverDeck = e.clientX >= deckRect.left && e.clientX <= deckRect.right &&
                            e.clientY >= deckRect.top && e.clientY <= deckRect.bottom;

          if (isOverDeck && objectId) {
            dropToDeck(objectId);
            return;
          }
        }
        // Deck is in main tabletop - let main handler process it
        return;
      }
      // If not a deck, ignore this element and continue to check for pool drop
    }

    const cursorSlotObjects = getCursorSlotObjects(state.objects);

    if (cursorSlotObjects.length > 0) {
      const container = containerRef.current;
      if (!container) return;

      // Get scroll parent to account for scroll position
      const scrollParent = container.closest('.overflow-auto');
      if (!scrollParent) {
        logger.warn('Scroll parent not found for pool drop operation');
        return;
      }

      const scrollLeft = scrollParent.scrollLeft;
      const scrollTop = scrollParent.scrollTop;

      // Use containerRef bounds instead of scrollParent bounds
      // containerRef is the unscaled PoolTabletop container
      const containerRect = container.getBoundingClientRect();

      // Calculate drop position using utility function
      const dropPosition = calculatePoolDropPositionWithScroll(
        e.clientX,
        e.clientY,
        poolZone,
        containerRect,
        scrollLeft,
        scrollTop,
        pixelsPerVU,
        currentZoom
      );

      // Check if cursor is over the VISIBLE pool panel window first
      // Use the same logic as handleGlobalMouseUp for consistency
      const elementUnderCursor = document.elementFromPoint(e.clientX, e.clientY);

      // IMPORTANT: Check if cursor is over hand panel FIRST
      // If dragging to hand panel, let hand panel handle it - don't drop to pool
      // Use bounding rect check because cursor slot visualization might be on top
      let isOverHandPanel = false;
      const handPanels = document.querySelectorAll('[data-hand-panel="true"]');
      for (const handPanel of handPanels) {
        const rect = handPanel.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top && e.clientY <= rect.bottom) {
          isOverHandPanel = true;
          break;
        }
      }

      logger.log('[PoolTabletop] Hand panel check', { isOverHandPanel, x: e.clientX, y: e.clientY });
      if (isOverHandPanel) {
        // Let hand panel handle the drop via its cursor-slot-drop-to-hand event
        logger.log('[PoolTabletop] Skipping drop - cursor over hand panel');
        // 🔥 FIX: Dispatch cursor-slot-dropped event so hand panel's onDrop callback gets triggered
        window.dispatchEvent(new CustomEvent('cursor-slot-dropped', {
          detail: { cardIds: cursorSlotObjects.map(o => o.id) }
        }));
        return;
      }

      // PRIMARY METHOD: Check if cursor is over this specific pool panel (root container)
      // Use bounding rect for accurate detection - more reliable than elementFromPoint/closest
      const poolPanelEl = document.querySelector(`[data-pool-panel="${poolZone.panelId}"]`) as HTMLElement;
      let isOverPoolPanel = false;

      if (poolPanelEl) {
        const rect = poolPanelEl.getBoundingClientRect();
        isOverPoolPanel = e.clientX >= rect.left && e.clientX <= rect.right &&
                         e.clientY >= rect.top && e.clientY <= rect.bottom;
      }

      const isCursorOverVisibleArea = isOverPoolPanel;

      if (!isCursorOverVisibleArea) {
        // Cursor is NOT over the visible pool panel window - don't allow drop
        return;
      }

      // Check if ALL objects will be completely visible in the pool panel window
      // Account for stacking offset - check the last (bottom-right most) object
      const lastObj = cursorSlotObjects[cursorSlotObjects.length - 1];
      if (lastObj && poolPanelEl) {
        // Get visible rect for bounds checking
        const visibleRect = poolPanelEl.getBoundingClientRect();

        // Calculate stacking offset for the last object
        const objWidth = (lastObj.width || 50) * pixelsPerVU;
        const objHeight = (lastObj.height || 50) * pixelsPerVU;
        const stackingOffset = Math.min(objWidth, objHeight) * 0.05; // 5% stacking offset
        const maxOffset = stackingOffset * (cursorSlotObjects.length - 1);

        // IMPORTANT: Calculate position based on ACTUAL visual position (same as CursorSlotVisualization)
        // CursorSlotVisualization renders objects at: cursorPosition - clickOffset + stackOffset
        // We need to match this for accurate bounds checking

        // Get click offset for this object (in screen pixels)
        const clickOffsetX_PX = (lastObj as any).clickOffsetX_PX;
        const clickOffsetY_PX = (lastObj as any).clickOffsetY_PX;

        // Calculate visual position of object's top-left corner
        // This MUST match CursorSlotVisualization logic:
        // - offsetX = -clickOffsetX_PX (negative because we subtract from cursor)
        // - Container is at cursor position
        // - Object is offset by negative clickOffset
        let objLeft, objTop;

        if (clickOffsetX_PX !== undefined && clickOffsetY_PX !== undefined) {
          // Object is visually at: cursorPosition - clickOffset (from CursorSlotVisualization)
          // But we need top-left corner for bounds calculation
          // CursorSlotVisualization positions object so click point is at cursor
          objLeft = e.clientX - clickOffsetX_PX;
          objTop = e.clientY - clickOffsetY_PX;
        } else {
          // Fallback: center object on cursor (no offset available)
          objLeft = e.clientX - objWidth / 2;
          objTop = e.clientY - objHeight / 2;
        }

        // Add stacking offset to get final position
        objLeft += maxOffset;
        objTop += maxOffset;

        const objRight = objLeft + objWidth;
        const objBottom = objTop + objHeight;

        // Check if last object is completely within visible content area
        const isFullyVisible = objLeft >= visibleRect.left && objRight <= visibleRect.right &&
                            objTop >= visibleRect.top && objBottom <= visibleRect.bottom;

        // IMPORTANT: Relax visibility check for cards from PLAY_TOP_CARD action
        // These cards may have position from deck location, but cursor is over pool panel
        // Allow drop if at least the center of the object is within visible area
        const isFromPlayTop = (lastObj as any).__pendingPlayTop !== undefined;
        const isCenterVisible = e.clientX >= visibleRect.left && e.clientX <= visibleRect.right &&
                             e.clientY >= visibleRect.top && e.clientY <= visibleRect.bottom;

        // Also allow drop if at least 50% of the object is visible
        const objArea = (objRight - objLeft) * (objBottom - objTop);
        const visibleLeft = Math.max(objLeft, visibleRect.left);
        const visibleRight = Math.min(objRight, visibleRect.right);
        const visibleTop = Math.max(objTop, visibleRect.top);
        const visibleBottom = Math.min(objBottom, visibleRect.bottom);
        const visibleArea = Math.max(0, visibleRight - visibleLeft) * Math.max(0, visibleBottom - visibleTop);
        const isHalfVisible = objArea > 0 && (visibleArea / objArea) >= 0.5;

        // IMPORTANT: Allow boards to be dropped even if not fully visible
        // Boards are large and users should be able to position them partially outside
        const isBoard = lastObj?.type === ItemType.BOARD || lastObj?.type === ItemType.NEXUS_BOARD;

        if (!isFullyVisible && !(isFromPlayTop && isCenterVisible) && !isHalfVisible && !isBoard) {
          // Object would be partially outside visible area - don't allow drop
          // Unless it's from PLAY_TOP_CARD and center is visible, at least 50% visible, or it's a board
          return;
        }
      }

      // Drop objects using utility function
      dropObjectsToPool(cursorSlotObjects, dropPosition, poolZone, dispatch, state.objects, pixelsPerVU, currentZoom, hyperscaleLayers);

      // IMPORTANT: Remove dropped cards from all players' handCardOrder
      // When cards are dropped from hand to pool panel, they should be removed from hand
      const droppedCardIds = cursorSlotObjects.filter(obj => obj.type === ItemType.CARD).map(obj => obj.id);
      if (droppedCardIds.length > 0) {
        players.forEach(player => {
          const currentHandOrder = player.handCardOrder || [];
          const updatedHandOrder = currentHandOrder.filter(id => !droppedCardIds.includes(id));
          if (updatedHandOrder.length !== currentHandOrder.length) {
            dispatch({
              type: 'UPDATE_PLAYER',
              payload: {
                id: player.id,
                updates: { handCardOrder: updatedHandOrder }
              }
            });
          }
        });
      }

      // IMPORTANT: Clear from locallyDraggingIdsRef to allow objects to reappear in pool panel
      // This is needed when objects were picked up from THIS panel and are being dropped back
      cursorSlotObjects.forEach(obj => {
        locallyDraggingIdsRef.current.delete(obj.id);
      });
      setLocallyDraggingTrigger(prev => prev + 1);

      // Track dropped objects to prevent immediate re-pickup
      cursorSlotObjects.forEach(obj => justDroppedToPoolRef.current.add(obj.id));

      // Clear the just-dropped set after 200ms
      setTimeout(() => {
        justDroppedToPoolRef.current.clear();
      }, 200);

      // Update timestamp to prevent immediate re-add
      cursorSlotLastAddedRef.current = Date.now();

      // Clear only dropped objects from cursor slot AFTER dispatch has been processed
      queueMicrotask(() => {
        window.dispatchEvent(new CustomEvent('clear-cursor-slot', {
          detail: { objectIds: cursorSlotObjects.map(o => o.id) }
        }));
      });
    }
  }, [poolZone, currentZoom, pixelsPerVU, dispatch, state.objects, contextMenu, dropToDeck, dropToPile, setLocallyDraggingTrigger, hyperscaleLayers, players]);

  // Global mouseup handler for cursor slot drop (handles all mouseup events)
  // This ensures objects are dropped even if mouseup happens outside PoolTabletop
  useEffect(() => {
    const handleGlobalMouseUp = (e: MouseEvent) => {
      // Only process left mouse button
      if (e.button !== 0) return;

      const cursorSlotObjects = getCursorSlotObjects(state.objects);

      // Only handle if cursor slot has objects
      if (cursorSlotObjects.length === 0) return;

      // 🔥 FIX: Always clear locallyDraggingIdsRef for objects from this panel
      // This ensures objects reappear in pool panel even if dropped elsewhere
      const objectsFromThisPanel = cursorSlotObjects.filter(obj =>
        (obj as any).cursorSlotSourcePanel === poolZone.panelId
      );
      if (objectsFromThisPanel.length > 0) {
        console.log('🧹 [POOL_MOUSEUP] Clearing locallyDraggingIdsRef:', objectsFromThisPanel.map(o => o.id));
        objectsFromThisPanel.forEach(obj => {
          locallyDraggingIdsRef.current.delete(obj.id);
        });
        setLocallyDraggingTrigger(prev => prev + 1);
      }

      // IMPORTANT: Don't drop if objects were just picked up from this pool panel
      // Check if any cursor slot object was just picked up from this panel
      const justPickedUpFromThisPanel = cursorSlotObjects.some(obj =>
        (obj as any).cursorSlotSourcePanel === poolZone.panelId &&
        justDroppedToPoolRef.current.has(obj.id)
      );
      if (justPickedUpFromThisPanel) {
        return;
      }

      // Don't drop if modifiers are pressed (Ctrl/Meta)
      if (e.ctrlKey || e.metaKey) return;

      // Check if mouseup is over this pool panel
      const container = containerRef.current;
      if (!container) return;

      const x = e.clientX;
      const y = e.clientY;

      // PRIMARY METHOD: Check if element under cursor or its ancestors is our pool panel
      // Use elementsFromPoint to get all elements at cursor position, not just the top one
      // This is more reliable when cursor slot visualization is under the cursor
      const elementsAtCursor = document.elementsFromPoint(x, y);

      // IMPORTANT: Check if cursor is over hand panel FIRST
      // If dragging to hand panel, let hand panel handle it - don't drop to pool
      // Use bounding rect check because cursor slot visualization might be on top
      let isOverHandPanel = false;
      const handPanels = document.querySelectorAll('[data-hand-panel="true"]');
      for (const handPanel of handPanels) {
        const rect = handPanel.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right &&
            y >= rect.top && y <= rect.bottom) {
          isOverHandPanel = true;
          break;
        }
      }

      // If cursor is over hand panel, don't handle drop in pool panel
      if (isOverHandPanel) {
        // Let hand panel handle the drop via its cursor-slot-drop-to-hand event
        // 🔥 FIX: Dispatch cursor-slot-dropped event so hand panel's onDrop callback gets triggered
        window.dispatchEvent(new CustomEvent('cursor-slot-dropped', {
          detail: { cardIds: cursorSlotObjects.map(o => o.id) }
        }));
        return;
      }

      // Check bounding rect of pool panel (root container with data-pool-panel)
      let isOverPoolPanel = false;

      // Find the pool panel element (root container with data-pool-panel)
      const poolPanelEl = document.querySelector(`[data-pool-panel="${poolZone.panelId}"]`);
      if (poolPanelEl) {
        const rect = poolPanelEl.getBoundingClientRect();
        // Check if cursor is within the visible bounds of this pool panel
        isOverPoolPanel = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
      }

      if (isOverPoolPanel) {
        // IMPORTANT: Check if cursor is over a deck or pile FIRST
        // If the deck/pile is in THIS pool panel, handle it locally
        // Use elementsFromPoint to check all elements under cursor
        const elementsAtCursor = document.elementsFromPoint(x, y);

        // Check for piles FIRST (before deck) - piles are more specific targets
        let pileElement: Element | null = null;
        for (const element of elementsAtCursor) {
          pileElement = element.closest('[data-pile-id]');
          if (pileElement) break;
        }

        if (pileElement) {
          const pileId = pileElement.getAttribute('data-pile-id');
          const deckElement = pileElement.closest('[data-object-id]');
          const deckId = deckElement?.getAttribute('data-object-id');

          if (pileId && deckId) {
            const deck = state.objects[deckId] as DeckType;
            // Check if this deck is in the current pool panel
            if (deck && deck.x >= poolZone.offsetX && deck.x < poolZone.offsetX + poolZone.width &&
                deck.y >= poolZone.offsetY && deck.y < poolZone.offsetY + poolZone.height) {
              // Check if cursor is actually over the pile element's bounding box
              const pileRect = pileElement.getBoundingClientRect();
              const isOverPile = x >= pileRect.left && x <= pileRect.right &&
                               y >= pileRect.top && y <= pileRect.bottom;

              if (isOverPile) {
                dropToPile(pileId, deckId);
                e.stopPropagation();
                e.preventDefault();
                return;
              }
            }
            // Pile is in main tabletop - let main handler process it
            return;
          }
          // If not a valid pile, ignore and continue
        }

        // Check for deck
        let deckElement: Element | null = null;
        for (const element of elementsAtCursor) {
          deckElement = element.closest('[data-object-id]');
          if (deckElement) break;
        }

        if (deckElement) {
          const objectId = deckElement.getAttribute('data-object-id');
          const obj = objectId ? state.objects[objectId] : undefined;
          if (obj && obj.type === ItemType.DECK) {
            const deck = obj as DeckType;
            // Check if this deck is in the current pool panel
            if (deck.x >= poolZone.offsetX && deck.x < poolZone.offsetX + poolZone.width &&
                deck.y >= poolZone.offsetY && deck.y < poolZone.offsetY + poolZone.height) {
              // Check if cursor is actually over the deck element's bounding box
              const deckRect = deckElement.getBoundingClientRect();
              const isOverDeck = x >= deckRect.left && x <= deckRect.right &&
                                y >= deckRect.top && y <= deckRect.bottom;

              if (isOverDeck) {
                if (objectId) {
                  dropToDeck(objectId);
                }
                e.stopPropagation();
                e.preventDefault();
                return;
              }
            }
            // Deck is in main tabletop - let main handler process it
            return;
          }
          // If not a deck, ignore this element and continue to check for pool drop
        }

        // Get the scroll parent (PoolGameSpace) to account for scroll position
        const scrollParent = container.closest('.overflow-auto') as HTMLElement;
        const scrollLeft = scrollParent?.scrollLeft || 0;
        const scrollTop = scrollParent?.scrollTop || 0;

        // Use container bounds instead of scrollParent bounds
        // container is the unscaled PoolTabletop container
        const containerRect = container.getBoundingClientRect();
        if (!containerRect) return;

        // Calculate drop position using utility function
        const dropPosition = calculatePoolDropPositionWithScroll(
          x,
          y,
          poolZone,
          containerRect,
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

          // IMPORTANT: Account for click offset when calculating object position
          // The object is NOT centered on cursor - it's offset by the click position
          const clickOffsetX_PX = (lastObj as any).clickOffsetX_PX;
          const clickOffsetY_PX = (lastObj as any).clickOffsetY_PX;

          let objLeft, objRight, objTop, objBottom;

          if (clickOffsetX_PX !== undefined && clickOffsetY_PX !== undefined) {
            // Use click offset to calculate actual object position
            // Object's top-left is at: cursor - offset
            objLeft = x - clickOffsetX_PX + maxOffset;
            objTop = y - clickOffsetY_PX + maxOffset;
            objRight = objLeft + objWidth;
            objBottom = objTop + objHeight;
          } else {
            // Fallback: assume centered on cursor
            objLeft = x - objWidth / 2 + maxOffset;
            objRight = x + objWidth / 2 + maxOffset;
            objTop = y - objHeight / 2 + maxOffset;
            objBottom = y + objHeight / 2 + maxOffset;
          }

          // Get visible rect for bounds checking
          const poolPanelEl = document.querySelector(`[data-pool-panel="${poolZone.panelId}"]`) as HTMLElement;
          const visibleRect = poolPanelEl?.getBoundingClientRect();
          if (!visibleRect) {
            // Can't verify bounds, allow drop anyway
          } else {
            // Check if last object is completely within visible content area
            const isFullyVisible = objLeft >= visibleRect.left && objRight <= visibleRect.right &&
                                objTop >= visibleRect.top && objBottom <= visibleRect.bottom;

            // IMPORTANT: Relax visibility check for cards from PLAY_TOP_CARD action
            // These cards may have position from deck location, but cursor is over pool panel
            // Allow drop if at least the center of the object is within visible area
            const isFromPlayTop = (lastObj as any).__pendingPlayTop !== undefined;
            const isCenterVisible = x >= visibleRect.left && x <= visibleRect.right &&
                                 y >= visibleRect.top && y <= visibleRect.bottom;

            // Also allow drop if at least 50% of the object is visible
            const objArea = (objRight - objLeft) * (objBottom - objTop);
            const visibleLeft = Math.max(objLeft, visibleRect.left);
            const visibleRight = Math.min(objRight, visibleRect.right);
            const visibleTop = Math.max(objTop, visibleRect.top);
            const visibleBottom = Math.min(objBottom, visibleRect.bottom);
            const visibleArea = Math.max(0, visibleRight - visibleLeft) * Math.max(0, visibleBottom - visibleTop);
            const isHalfVisible = objArea > 0 && (visibleArea / objArea) >= 0.5;

            // IMPORTANT: Allow boards to be dropped even if not fully visible
            // Boards are large and users should be able to position them partially outside
            const isBoard = lastObj?.type === ItemType.BOARD || lastObj?.type === ItemType.NEXUS_BOARD;

            if (!isFullyVisible && !(isFromPlayTop && isCenterVisible) && !isHalfVisible && !isBoard) {
              // Object would be partially outside visible area - don't allow drop
              // Unless it's from PLAY_TOP_CARD and center is visible, at least 50% visible, or it's a board
              return;
            }
          }
        }

        // Drop objects using utility function
        dropObjectsToPool(cursorSlotObjects, dropPosition, poolZone, dispatch, state.objects, pixelsPerVU, currentZoom, hyperscaleLayers);

        // IMPORTANT: Remove dropped cards from all players' handCardOrder
        // When cards are dropped from hand to pool panel, they should be removed from hand
        const droppedCardIds = cursorSlotObjects.filter(obj => obj.type === ItemType.CARD).map(obj => obj.id);
        if (droppedCardIds.length > 0) {
          players.forEach(player => {
            const currentHandOrder = player.handCardOrder || [];
            const updatedHandOrder = currentHandOrder.filter(id => !droppedCardIds.includes(id));
            if (updatedHandOrder.length !== currentHandOrder.length) {
              dispatch({
                type: 'UPDATE_PLAYER',
                payload: {
                  id: player.id,
                  updates: { handCardOrder: updatedHandOrder }
                }
              });
            }
          });
        }

        // IMPORTANT: Clear from locallyDraggingIdsRef to allow objects to reappear in pool panel
        cursorSlotObjects.forEach(obj => {
          locallyDraggingIdsRef.current.delete(obj.id);
        });
        setLocallyDraggingTrigger(prev => prev + 1);

        // Track dropped objects to prevent immediate re-pickup
        cursorSlotObjects.forEach(obj => justDroppedToPoolRef.current.add(obj.id));

        // Clear the just-dropped set after 200ms
        setTimeout(() => {
          justDroppedToPoolRef.current.clear();
        }, 200);

        // Update timestamp to prevent immediate re-add
        cursorSlotLastAddedRef.current = Date.now();

        // Clear only dropped objects from cursor slot AFTER dispatch has been processed
        queueMicrotask(() => {
          window.dispatchEvent(new CustomEvent('clear-cursor-slot', {
            detail: { objectIds: cursorSlotObjects.map(o => o.id) }
          }));
        });

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
  }, [poolZone, currentZoom, pixelsPerVU, dispatch, state.objects, dropToDeck, dropToPile, locallyDraggingTrigger, hyperscaleLayers, players]);

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

      // Accept events from any source (tabletop, pool panels, etc.)
      // This allows dragging boards between pool panels

      const container = containerRef.current;
      if (!container) return;

      // Get the visible pool panel area (data-pool-panel) - this is the VISIBLE window
      const poolPanelEl = document.querySelector(`[data-pool-panel="${poolZone.panelId}"]`) as HTMLElement;
      if (!poolPanelEl) {
        return;
      }

      const visibleRect = poolPanelEl.getBoundingClientRect();
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

        // For boards, allow placement even if partially outside visible area
        const isBoard = obj?.type === ItemType.BOARD || obj?.type === ItemType.NEXUS_BOARD;

        // Check if object is completely within visible content area (or if it's a board)
        const isFullyVisible = isBoard || (
          objLeft >= visibleRect.left && objRight <= visibleRect.right &&
          objTop >= visibleRect.top && objBottom <= visibleRect.bottom
        );

        if (!isFullyVisible) {
          // Object would be partially outside visible area - don't allow drop (unless it's a board)
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

  // Track cursor position over pool panel for highlight effect
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const cursorSlotObjects = getCursorSlotObjects(state.objects);

      if (cursorSlotObjects.length === 0) {
        setIsHighlightActive(false);
        return;
      }

      // IMPORTANT: Dispatch cursor-slot-move event for HandPanel/MainMenu hover detection
      // This is needed when objects are picked up from pool panel (not just main tabletop)
      const eventData = {
        x: e.clientX,
        y: e.clientY,
        isOverMainMenu: false,
        hasCards: cursorSlotObjects.length > 0,
        items: cursorSlotObjects.map(item => ({ type: item.type }))
      };

      // Event for HandPanel to detect hover
      window.dispatchEvent(new CustomEvent('cursor-slot-move', {
        detail: eventData
      }));

      // Event for MainMenu to switch to hand tab
      window.dispatchEvent(new CustomEvent('cursor-position-update', {
        detail: eventData
      }));

      // Highlight for ANY object type in cursor slot
      // Check if cursor is over the visible pool panel area
      const poolPanelEl = document.querySelector(`[data-pool-panel="${poolZone.panelId}"]`) as HTMLElement;
      if (!poolPanelEl) return;

      const rect = poolPanelEl.getBoundingClientRect();
      const isOver = e.clientX >= rect.left && e.clientX <= rect.right &&
                    e.clientY >= rect.top && e.clientY <= rect.bottom;

      setIsHighlightActive(isOver);
    };

    // Listen to global mousemove
    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [poolZone.panelId, state.objects]);

  // Apply highlight to the entire pool panel (not just inner content)
  useEffect(() => {
    const poolPanelContainer = document.querySelector(`[data-ui-object="${poolZone.panelId}"]`) as HTMLElement;
    if (!poolPanelContainer) return;

    if (isHighlightActive) {
      poolPanelContainer.style.boxShadow = '0 0 0 3px #a855f7';
    } else {
      poolPanelContainer.style.boxShadow = '';
    }
  }, [isHighlightActive, poolZone.panelId]);

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
      {/* Pool zone background with grid pattern - covers entire container with zoomed pattern */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(#465665 1px, transparent 1px)',
          backgroundSize: `${20 * currentZoom}px ${20 * currentZoom}px`,
          width: poolBounds.widthPx * currentZoom,
          height: poolBounds.heightPx * currentZoom,
        }}
      />

      {/* Content container - scale to match zoom */}
      <div
        ref={contentRef}
        className="absolute overflow-hidden"
        style={{
          transform: `scale(${currentZoom})`,
          transformOrigin: 'top left',
          width: poolBounds.widthPx,
          height: poolBounds.heightPx,
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
                    pixelsPerVU={pixelsPerVU}
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
                    cacheVersion={getGlobalCacheVersion()}
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
                  hoveredPileId={hoveredPileId}
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
                  setDeleteCandidateId={setDeleteCandidateId}
                  executeClickAction={executeClickAction}
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
                <div
                  key={obj.id}
                  className="group relative"
                  style={{
                    position: 'absolute',
                    left: relativeX,
                    top: relativeY,
                    width: counterWidth,
                    height: counterHeight,
                    transform: `rotate(${obj.rotation || 0}deg)`,
                    zIndex: obj.zIndex || 1000,
                  }}
                >
                  <Tooltip
                    text={obj.tooltipText}
                    showImage={obj.showTooltipImage}
                    imageSrc={obj.content}
                    scale={obj.tooltipScale}
                  >
                    <div
                      data-object-id={obj.id}
                      onMouseDown={(e) => handleObjectMouseDown(e, obj)}
                      onContextMenu={(e) => handleContextMenu(e, obj)}
                      className={`w-full h-full bg-slate-900 border-2 border-slate-600 shadow-xl flex items-center justify-between p-2 gap-2 text-white select-none ${isDragging ? 'dragging' : ''}`}
                      style={{ pointerEvents: 'auto', borderRadius: '5px' }}
                    >
                      <button className="p-1 hover:bg-slate-700 rounded" onMouseDown={(e) => e.stopPropagation()} onClick={() => dispatch({type: 'UPDATE_COUNTER', payload: { id: obj.id, delta: -1 } })}><Minus size={14}/></button>
                      <span className="text-xl font-bold">{counter.value}</span>
                      <button className="p-1 hover:bg-slate-700 rounded" onMouseDown={(e) => e.stopPropagation()} onClick={() => dispatch({type: 'UPDATE_COUNTER', payload: { id: obj.id, delta: 1 } })}><Plus size={14}/></button>
                    </div>
                  </Tooltip>
                </div>
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
                <div
                  key={obj.id}
                  className="group relative"
                  style={{
                    position: 'absolute',
                    left: relativeX,
                    top: relativeY,
                    width: diceWidth,
                    height: diceHeight,
                    transform: `rotate(${obj.rotation || 0}deg)`,
                    zIndex: obj.zIndex || 1000,
                  }}
                >
                  <Tooltip
                    text={obj.tooltipText}
                    showImage={obj.showTooltipImage}
                    imageSrc={obj.content}
                    scale={obj.tooltipScale}
                  >
                    <div
                      data-object-id={obj.id}
                      onMouseDown={(e) => handleObjectMouseDown(e, obj)}
                      onContextMenu={(e) => handleContextMenu(e, obj)}
                      className={`w-full h-full flex items-center justify-center ${isDragging ? 'dragging' : ''}`}
                      style={{ pointerEvents: 'auto' }}
                    >
                      <SvgTokenShape
                        shape={diceShape}
                        width={diceWidth}
                        height={diceHeight}
                        color={dice.color || '#e74c3c'}
                        content={undefined}
                        rotation={0}
                        borderWidth={dice.borderWidth ?? 2}
                        borderColor={dice.borderColor || '#ffffff'}
                        opacity={dice.opacity ?? 100}
                        borderOpacity={dice.borderOpacity ?? 100}
                        showThickness={true}
                        fontColor={dice.fontColor || '#ffffff'}
                      >
                        {/* SvgTokenShape adds PADDING (1) + borderWidth around the content */}
                        <foreignObject
                          x={3}
                          y={3}
                          width={diceWidth}
                          height={diceHeight}
                        >
                          <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.1em',
                            width: '100%',
                            height: '100%',
                          }}>
                            {(() => {
                              const currentValue = dice.currentValue ?? 1;
                              const valueOverride = dice.valueOverrides?.[currentValue];
                              const valueFontSize = 25 * pixelsPerVU;

                              // Show override if available
                              if (valueOverride) {
                                if (valueOverride.type === 'image') {
                                  return (
                                    <img
                                      src={valueOverride.value}
                                      alt={`Value ${currentValue}`}
                                      style={{
                                        width: `${valueFontSize * 1.5}px`,
                                        height: `${valueFontSize * 1.5}px`,
                                        objectFit: 'contain',
                                      }}
                                      onError={(e) => {
                                        // Fallback to number if image fails to load
                                        const target = e.target as HTMLImageElement;
                                        target.style.display = 'none';
                                        const fallback = target.parentElement?.querySelector('.fallback-number') as HTMLElement;
                                        if (fallback) fallback.style.display = 'block';
                                      }}
                                    />
                                  );
                                } else if (valueOverride.type === 'emoji' || valueOverride.type === 'icon') {
                                  // Both emoji and icon types display text/emoji
                                  return (
                                    <span style={{
                                      fontSize: `${valueFontSize * 1.2}px`,
                                      lineHeight: 1,
                                    }}>
                                      {valueOverride.value}
                                    </span>
                                  );
                                }
                              }

                              // Default: show number
                              return (
                                <>
                                  <span
                                    className="fallback-number"
                                    style={{
                                      fontSize: `${valueFontSize}px`,
                                      fontWeight: 'bold',
                                      color: dice.fontColor || '#ffffff',
                                      lineHeight: 1,
                                    }}
                                  >
                                    {displayValue}
                                  </span>
                                </>
                              );
                            })()}
                            <span style={{
                              fontSize: `${15 * pixelsPerVU}px`,
                              fontWeight: 'normal',
                              color: dice.fontColor || '#ffffff',
                              lineHeight: 1,
                            }}>
                              d{dice.sides}
                            </span>
                          </div>
                        </foreignObject>
                      </SvgTokenShape>
                    </div>
                  </Tooltip>

                  {/* Action buttons for dice - using memoized component */}
                  <DiceActionButtonsMemo
                    obj={obj}
                    dispatch={dispatch}
                    state={state}
                    activePlayerId={activePlayerId}
                    isGM={isGM}
                    animateDiceRoll={animateDiceRoll}
                    setDeleteCandidateId={setDeleteCandidateId}
                    players={players}
                  />
                </div>
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
                dispatch={dispatch}
                allObjects={state.objects}
                setDeleteCandidateId={setDeleteCandidateId}
                setSearchModalDeck={setSearchModalDeck}
                setTopDeckModalDeck={setTopDeckModalDeck}
                animateDiceRoll={animateDiceRoll}
                activePlayerId={activePlayerId}
                players={state.players}
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
          language={language}
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
          language={language}
        />
      )}

      {/* Object Settings Modal */}
      {settingsModalObj && (
        <ObjectSettingsModal
          object={settingsModalObj}
          onSave={(updatedObj) => {
            dispatch({ type: 'UPDATE_OBJECT', payload: { id: updatedObj.id, updates: updatedObj } });
            setSettingsModalObj(null);
          }}
          onClose={() => setSettingsModalObj(null)}
          allObjects={state.objects}
          language={language}
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
          language={language}
        />
      )}

      {/* Top Deck Modal */}
      {topDeckModalDeck && (
        <TopDeckModal
          deck={topDeckModalDeck}
          onClose={() => setTopDeckModalDeck(null)}
          language={language}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteCandidateId && (
        <DeleteConfirmModal
          objectName={(state.objects[deleteCandidateId] as any)?.name || 'Object'}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteCandidateId(null)}
          language={language}
        />
      )}
    </div>
  );
};

// Memoize PoolTabletopOptimized to prevent unnecessary re-renders
export const PoolTabletopOptimizedMemo = React.memo(PoolTabletopOptimized, (prevProps, nextProps) => {
  return prevProps.poolZone.panelId === nextProps.poolZone.panelId &&
         prevProps.poolZone.tabId === nextProps.poolZone.tabId;
});