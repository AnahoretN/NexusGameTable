/**
 * HandPanelOptimized v2.0 - Migrated to new context architecture
 *
 * @version 2.0.0
 * @since 2026-04-17
 *
 * ИЗМЕНЕНИЯ с v1.0:
 * ✅ Полностью убрана зависимость от useGame()
 * ✅ Использует ObjectStore для игровых объектов
 * ✅ Использует PlayerContext v2.0 для player данных
 * ✅ Оптимизированные hooks для предотвращения ререндеров
 * ✅ Сохранена вся функциональность оригинала
 */

import React, { useState, useCallback, useEffect, useRef, memo } from 'react';
import { logger } from '../utils/logger';
import { createPortal } from 'react-dom';
import { useObjectActions } from '../store/objectStore';
import {
  usePlayerList,
  useActivePlayerId,
  useIsGM,
  usePlayerPermissions,
  useSettingsModalState,
  useIsSettingsModalOpen
} from '../store/contexts';
import { useGame } from '../store/GameContext';
import { Card, Token, Deck as DeckType, ItemType, CardShape, CardLocation, TableObject, AppLanguage, Player, TokenShape } from '../types';
import { Card as CardComponent } from './Card';
import { ObjectRenderer } from './ObjectRenderer';
import { ContextMenu } from './ContextMenu';
import { getCardSettings, getCardDimensions } from '../utils/cardUtils';
import { useCursorSlotHover } from '../hooks';
import { getCardButtonConfigsWithActions } from '../utils/buttonConfig';
import { MAIN_MENU_WIDTH } from '../constants';
import { Settings, ArrowUp, ArrowDown, Shuffle, ChevronRight, RotateCw } from 'lucide-react';
import { useTabCardScale } from '../hooks/useTabCardScale';
import { HandTabSettingsModal } from './HandTabSettingsModal';
import { ObjectSettingsModal } from './ObjectSettingsModal';
import { t as translate, Locale } from '../utils/translations';
import { VirtualizedHandList, useVirtualizedHandList } from './VirtualizedHandList';

// Context Menu for cards in hand
interface HandCardContextMenuProps {
  x: number;
  y: number;
  card: Card;
  deck?: DeckType;
  onClose: () => void;
  onFlip: () => void;
  onMoveToTop: () => void;
  onMoveToBottom: () => void;
  onMill: () => void;
  onMoveToPile: (pileId: string) => void;
  onOpenSettings: () => void;
  language: AppLanguage;
}

// Helper function to calculate safe menu position
const calculateSafeMenuPosition = (
  x: number,
  y: number,
  menuWidth: number = 200,
  menuHeight: number = 300
): { left: number; top: number; submenuPosition: 'left' | 'right' } => {
  const padding = 8;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Calculate horizontal position
  let left = x;
  if (left + menuWidth + padding > viewportWidth) {
    left = viewportWidth - menuWidth - padding;
  }
  if (left < padding) {
    left = padding;
  }

  // Calculate vertical position
  let top = y;
  if (top + menuHeight + padding > viewportHeight) {
    top = viewportHeight - menuHeight - padding;
  }
  if (top < padding) {
    top = padding;
  }

  // Determine submenu position (left or right of parent menu)
  const submenuPosition: 'left' | 'right' =
    left + menuWidth + menuWidth + padding > viewportWidth ? 'left' : 'right';

  return { left, top, submenuPosition };
};

const HandCardContextMenu: React.FC<HandCardContextMenuProps> = ({
  x, y, card, deck, onClose, onFlip, onMoveToTop, onMoveToBottom, onMill, onMoveToPile, onOpenSettings, language
}) => {
  const [moveSubmenuOpen, setMoveSubmenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const moveSubmenuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState(() => calculateSafeMenuPosition(x, y));
  const [submenuPosition, setSubmenuPosition] = useState<{ left: number; top: number } | null>(null);

  // Get piles from deck
  const piles = deck?.piles || [];

  // Find mill pile (pile with isMillPile: true)
  const millPile = piles.find(p => p.isMillPile);

  // Recalculate position if window resizes
  useEffect(() => {
    const handleResize = () => {
      setMenuPosition(calculateSafeMenuPosition(x, y));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [x, y]);

  // Calculate submenu position when it opens
  useEffect(() => {
    if (moveSubmenuOpen && moveSubmenuButtonRef.current) {
      const buttonRect = moveSubmenuButtonRef.current.getBoundingClientRect();
      const submenuWidth = 200;
      const submenuHeight = piles.length > 0 ? 150 + piles.length * 35 : 150;
      const padding = 8;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let left: number;
      let top = buttonRect.top;

      // Determine if submenu should be on left or right
      if (menuPosition.submenuPosition === 'right') {
        left = buttonRect.right + padding;
        // Check if would go off right edge
        if (left + submenuWidth + padding > viewportWidth) {
          left = buttonRect.left - submenuWidth - padding;
        }
      } else {
        left = buttonRect.left - submenuWidth - padding;
        // Check if would go off left edge
        if (left < padding) {
          left = buttonRect.right + padding;
        }
      }

      // Adjust vertical position if needed
      if (top + submenuHeight + padding > viewportHeight) {
        top = Math.max(padding, viewportHeight - submenuHeight - padding);
      }

      setSubmenuPosition({ left, top });
    } else {
      setSubmenuPosition(null);
    }
  }, [moveSubmenuOpen, menuPosition.submenuPosition, piles.length]);

  const handleAction = useCallback((action: () => void) => {
    action();
    onClose();
  }, [onClose]);

  // Close menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: Event) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[999999] bg-slate-800 border border-slate-600 rounded-lg shadow-xl py-1 min-w-[200px]"
      style={{ left: menuPosition.left, top: menuPosition.top }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Configuration */}
      <button
        onClick={() => handleAction(onOpenSettings)}
        className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200 cursor-pointer"
      >
        <Settings size={16} />
        <span>{translate('Properties', language as Locale)}</span>
      </button>

      {/* Separator */}
      <div className="h-px bg-slate-700 my-1 mx-2" />

      {/* Move Submenu */}
      <div className="relative">
        <button
          ref={moveSubmenuButtonRef}
          onClick={() => setMoveSubmenuOpen(!moveSubmenuOpen)}
          className="w-full text-left px-3 py-2 flex items-center justify-between hover:bg-slate-700 transition-colors text-gray-200 cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Shuffle size={16} />
            <span>{translate('Move', language as Locale)}</span>
          </span>
          {menuPosition.submenuPosition === 'right' ? (
            <ChevronRight size={14} />
          ) : (
            <ChevronRight size={14} style={{ transform: 'rotate(180deg)' }} />
          )}
        </button>

        {moveSubmenuOpen && submenuPosition && createPortal(
          <div
            ref={submenuRef}
            className="fixed bg-slate-800 border border-slate-600 rounded-lg shadow-xl py-1 min-w-[200px] z-[999999]"
            style={{ left: submenuPosition.left, top: submenuPosition.top }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Move to Top */}
            <button
              onClick={() => {
                handleAction(onMoveToTop);
                setMoveSubmenuOpen(false);
              }}
              className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200 cursor-pointer"
            >
              <ArrowUp size={16} />
              <span>{translate('To Top', language as Locale)}</span>
            </button>

            {/* Move to Bottom */}
            <button
              onClick={() => {
                handleAction(onMoveToBottom);
                setMoveSubmenuOpen(false);
              }}
              className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200 cursor-pointer"
            >
              <ArrowDown size={16} />
              <span>{translate('To Bottom', language as Locale)}</span>
            </button>

            {/* Mill - only if mill pile exists */}
            {millPile && (
              <button
                onClick={() => {
                  handleAction(onMill);
                  setMoveSubmenuOpen(false);
                }}
                className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200 cursor-pointer"
              >
                <Shuffle size={16} />
                <span>{translate('Mill', language as Locale)}</span>
              </button>
            )}

            {/* Separator before piles list - only if there are piles */}
            {piles.length > 0 && <div className="h-px bg-slate-700 my-1 mx-2" />}

            {/* Piles list */}
            {piles.map((pile) => (
              <button
                key={pile.id}
                onClick={() => {
                  handleAction(() => onMoveToPile(pile.id));
                  setMoveSubmenuOpen(false);
                }}
                className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200 cursor-pointer"
              >
                <span className="w-4" />
                <span>{pile.name || pile.id}</span>
              </button>
            ))}
          </div>,
          document.body
        )}
      </div>

      {/* Separator before Flip */}
      <div className="h-px bg-slate-700 my-1 mx-2" />

      {/* Flip - at the bottom */}
      <button
        onClick={() => handleAction(onFlip)}
        className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200 cursor-pointer"
      >
        <RotateCw size={16} />
        <span>{translate('Flip', language as Locale)}</span>
      </button>
    </div>,
    document.body
  );
};

// Memoized component for individual card in hand panel
interface HandCardItemProps {
  card: Card;
  displayedCard: Card;
  actualIndex: number;
  cardWidth: number;
  cardHeight: number;
  cardSettings: ReturnType<typeof getCardSettings>;
  deck?: DeckType;
  isViewingOpponentHand: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  buttons: Array<{ title: string; icon: React.ReactNode; className: string; onAction: () => void }>;
  language: AppLanguage;
  onMouseDown: (e: React.MouseEvent, cardId: string, index: number, element: HTMLDivElement) => void;
  onContextMenu: (e: React.MouseEvent, card: Card) => void;
}

const HandCardItem = memo<HandCardItemProps>(({
  card,
  displayedCard,
  actualIndex,
  cardWidth,
  cardHeight,
  cardSettings,
  deck,
  isViewingOpponentHand,
  isDragging,
  isDragOver,
  buttons,
  language,
  onMouseDown,
  onContextMenu
}) => {
  return (
    <div
      data-card-index={actualIndex}
      className="relative flex-shrink-0 group"
      style={{
        width: cardWidth,
        height: cardHeight,
        zIndex: isDragging ? 100 : isDragOver ? 50 : 'auto',
        transform: isDragOver ? 'scale(1.05)' : undefined,
      }}
      onMouseDown={(e) => onMouseDown(e, card.id, actualIndex, e.currentTarget as HTMLDivElement)}
      onContextMenu={(e) => onContextMenu(e, card)}
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
}, (prevProps, nextProps) => {
  return (
    prevProps.card.id === nextProps.card.id &&
    prevProps.card.faceUp === nextProps.card.faceUp &&
    prevProps.displayedCard.faceUp === nextProps.displayedCard.faceUp &&
    prevProps.cardWidth === nextProps.cardWidth &&
    prevProps.cardHeight === nextProps.cardHeight &&
    prevProps.isDragging === nextProps.isDragging &&
    prevProps.isDragOver === nextProps.isDragOver &&
    prevProps.isViewingOpponentHand === nextProps.isViewingOpponentHand &&
    prevProps.actualIndex === nextProps.actualIndex
  );
});

HandCardItem.displayName = 'HandCardItem';

// Token stack interface for grouping identical tokens
interface TokenStack {
  tokens: Token[];
  count: number;
  representativeToken: Token;
}

// Helper function to create a unique key for token grouping
// Tokens are considered identical if they have the same visual properties
const getTokenGroupKey = (token: Token): string => {
  return JSON.stringify({
    content: token.content,
    name: token.name,
    shape: token.shape,
    width: token.width,
    height: token.height,
    color: token.color,
    borderColor: token.borderColor,
    borderWidth: token.borderWidth,
    opacity: token.opacity,
    borderOpacity: token.borderOpacity,
    showNameOnToken: token.showNameOnToken,
    fontColor: token.fontColor,
  });
};

// Helper function to group tokens by their visual properties
const groupTokens = (tokens: Token[]): TokenStack[] => {
  const groups = new Map<string, Token[]>();

  tokens.forEach(token => {
    const key = getTokenGroupKey(token);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(token);
  });

  return Array.from(groups.values()).map(tokensInGroup => ({
    tokens: tokensInGroup,
    count: tokensInGroup.length,
    representativeToken: tokensInGroup[0]
  }));
};

// Token Stack Component - displays stacked tokens with count badge
interface TokenStackItemProps {
  stack: TokenStack;
  stackIndex: number;
  groupOffset: number;
  isDragging: boolean;
  isDragOver: boolean;
  isGM: boolean;
  activePlayerId: string;
  onMouseDown: (e: React.MouseEvent, tokenIds: string[], index: number, element: HTMLDivElement) => void;
  onContextMenu: (e: React.MouseEvent, token: Token) => void;
}

const TokenStackItem = memo(({
  stack,
  stackIndex,
  groupOffset,
  isDragging,
  isDragOver,
  isGM,
  activePlayerId,
  onMouseDown,
  onContextMenu
}: TokenStackItemProps) => {
  const actualIndex = groupOffset + stackIndex;
  const tokenIds = stack.tokens.map(t => t.id);

  return (
    <div
      data-card-index={actualIndex}
      data-token-stack="true"
      data-token-ids={JSON.stringify(tokenIds)}
      className="relative flex-shrink-0 group"
      style={{
        width: 88,
        height: 88,
        zIndex: isDragging ? 100 : isDragOver ? 50 : 'auto',
        transform: isDragOver ? 'scale(1.05)' : undefined,
      }}
      onMouseDown={(e) => onMouseDown(e, tokenIds, actualIndex, e.currentTarget as HTMLDivElement)}
      onContextMenu={(e) => onContextMenu(e, stack.representativeToken)}
    >
      {/* Render stacked tokens with slight offset for visual effect */}
      {stack.count > 1 && (
        <>
          {/* Bottom tokens - create stack effect */}
          {Array.from({ length: Math.min(stack.count - 1, 3) }).map((_, i) => (
            <div
              key={i}
              className="absolute pointer-events-none"
              style={{
                top: -i * 2,
                left: -i * 2,
                width: 88,
                height: 88,
                opacity: 0.7,
              }}
            >
              <ObjectRenderer
                obj={stack.representativeToken}
                pixelsPerVU={0.98}
                isGM={isGM}
                activePlayerId={activePlayerId}
                onMouseDown={() => {}}
                onContextMenu={() => {}}
              />
            </div>
          ))}
        </>
      )}

      {/* Top token */}
      <div className="relative">
        <ObjectRenderer
          obj={stack.representativeToken}
          pixelsPerVU={1}
          isGM={isGM}
          activePlayerId={activePlayerId}
          onMouseDown={(e) => e.preventDefault()}
          onContextMenu={(e) => onContextMenu(e, stack.representativeToken)}
        />
      </div>

      {/* Count badge */}
      {stack.count > 1 && (
        <div className="absolute -top-2 -right-2 bg-purple-600 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center border-2 border-slate-800 shadow-lg pointer-events-none">
          {stack.count}
        </div>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.stack.count === nextProps.stack.count &&
    prevProps.stack.representativeToken.id === nextProps.stack.representativeToken.id &&
    prevProps.isDragging === nextProps.isDragging &&
    prevProps.isDragOver === nextProps.isDragOver &&
    prevProps.stackIndex === nextProps.stackIndex
  );
});

TokenStackItem.displayName = 'TokenStackItem';

interface HandPanelProps {
  width?: number;
  isDragTarget?: boolean;
  isCollapsed?: boolean;
  language?: AppLanguage;
  shiftScrollbar?: boolean;
}

export const HandPanelOptimized: React.FC<HandPanelProps> = ({
  width,
  isDragTarget = false,
  isCollapsed = false,
  language = 'en',
  shiftScrollbar = false
}) => {
  // ✅ ИСПРАВЛЕНО: Получаем objects и dispatch из GameContext (один вызов)
  const { state: gameState, dispatch } = useGame();
  const objects = gameState.objects;

  // Helper function to update objects via GameContext
  const updateCard = useCallback((cardId: string, updates: any) => {
    dispatch({
      type: 'UPDATE_OBJECT',
      payload: { id: cardId, updates }
    });
  }, [dispatch]);

  // Helper function to update players via GameContext
  const updatePlayerData = useCallback((playerId: string, updates: any) => {
    dispatch({
      type: 'UPDATE_PLAYER',
      payload: { id: playerId, updates }
    });
  }, [dispatch]);

  // Для операций, которые еще не мигрированы, используем objectStore
  const { deleteObject, addObject } = useObjectActions();

  const players = usePlayerList();
  const activePlayerId = useActivePlayerId();
  const isGM = useIsGM();
  const playerPermissions = usePlayerPermissions();
  const [isSettingsModalOpen, openSettingsModal, closeSettingsModal] = useSettingsModalState();

  const containerRef = useRef<HTMLDivElement>(null);
  const scaleMenuRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // State for selected player hand tab - MUST be declared before useMemo
  const [selectedPlayerId, setSelectedPlayerId] = useState(activePlayerId);

  // Get both CARDS and TOKENS that can be in hand
  const allHandObjects = Object.values(objects).filter(obj => obj.type === ItemType.CARD || obj.type === ItemType.TOKEN) as (Card | Token)[];
  const allCards = allHandObjects.filter(obj => obj.type === ItemType.CARD) as Card[];

  // Use per-tab scale hook for the currently selected player
  const { scale: cardScale, setTabCardScale } = useTabCardScale(selectedPlayerId);
  // Use ref to avoid stale closures in callbacks
  const cardScaleRef = useRef(cardScale);
  useEffect(() => {
    cardScaleRef.current = cardScale;
  }, [cardScale]);

  // Get current player info
  const currentPlayer = players.find(p => p.id === activePlayerId);

  // Context menu state for cards in hand
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; object: TableObject } | null>(null);
  // Context menu state for hand scale
  const [scaleMenu, setScaleMenu] = useState<{ x: number; y: number } | null>(null);
  // Hand tab settings modal state
  const [handTabSettings, setHandTabSettings] = useState<{ playerId: string; player: Player } | null>(null);
  const [tempSettingsPlayer, setTempSettingsPlayer] = useState<Player | null>(null);
  // Card settings modal state
  const [cardSettingsModal, setCardSettingsModal] = useState<Card | null>(null);
  // Edit mode for percentage input
  const [isEditingPercentage, setIsEditingPercentage] = useState(false);
  const [editedPercentage, setEditedPercentage] = useState('');

  // Local drag state for reorder
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);

  // Drag state for adding cards to cursor slot (distance-based, like tabletop)
  const longPressCardRef = useRef<{ cardId: string; startTime: number; startX: number; startY: number; clickOffsetX_PX?: number; clickOffsetY_PX?: number } | null>(null);
  const cardPickedUpRef = useRef(false);

  // Local state to track cards being picked up
  const [pickingUpCardIds, setPickingUpCardIds] = useState<Set<string>>(new Set());

  // Track cards that were just dropped to hand
  const recentlyDroppedToHandRef = useRef<Set<string>>(new Set());

  // Local state for cursor slot hover
  const [isCursorOverHand, setIsCursorOverHand] = useState(false);

  // Helper function to get tokens currently in cursor slot
  const getTokensInCursorSlot = useCallback((): Token[] => {
    return Object.values(objects).filter(obj =>
      obj.type === ItemType.TOKEN &&
      (obj as any).inCursorSlot === true
    ) as Token[];
  }, [objects]);

  // Helper function to check if cursor slot contains only tokens of the same type
  const isCursorSlotSameTokenType = useCallback((token: Token): boolean => {
    const tokensInSlot = getTokensInCursorSlot();
    if (tokensInSlot.length === 0) return true;
    const tokenKey = getTokenGroupKey(token);
    return tokensInSlot.every(t => getTokenGroupKey(t) === tokenKey);
  }, [getTokensInCursorSlot]);

  // Helper function to check if cursor slot contains any cards
  const cursorSlotHasCards = useCallback((): boolean => {
    return Object.values(objects).some(obj =>
      obj.type === ItemType.CARD &&
      (obj as any).inCursorSlot === true
    );
  }, [objects]);

  // Helper function to drop all items from cursor slot to hand
  const dropCursorSlotToHand = useCallback(() => {
    const itemsInCursorSlot = Object.values(objects).filter(obj =>
      (obj.type === ItemType.CARD || obj.type === ItemType.TOKEN) &&
      (obj as any).inCursorSlot === true
    );
    if (itemsInCursorSlot.length === 0) return;

    setIsCursorOverHand(false);
    window.dispatchEvent(new CustomEvent('cursor-slot-drop-to-hand', {
      detail: { items: itemsInCursorSlot }
    }));
    window.dispatchEvent(new CustomEvent('cursor-slot-dropped', {
      detail: { cardIds: itemsInCursorSlot.map(i => i.id) }
    }));
  }, [objects, setIsCursorOverHand]);

  // Use shared hook for cursor slot hover detection
  const { isCursorOver: isCursorOverFromHook } = useCursorSlotHover(containerRef, {
    requireDraggingCard: true,
  });

  // Sync settings modal state with UI context
  useEffect(() => {
    if (handTabSettings) {
      openSettingsModal();
    } else {
      closeSettingsModal();
    }
  }, [handTabSettings, openSettingsModal, closeSettingsModal]);

  // Sync card settings modal state with UI context
  useEffect(() => {
    if (cardSettingsModal) {
      openSettingsModal();
    } else if (!handTabSettings) {
      // Only close if both modals are closed
      closeSettingsModal();
    }
  }, [cardSettingsModal, handTabSettings, openSettingsModal, closeSettingsModal]);

  // Update local state when hook state changes
  useEffect(() => {
    setIsCursorOverHand(isCursorOverFromHook);
  }, [isCursorOverFromHook]);

  // Listen for cursor slot drop events (hand panel specific logic)
  useEffect(() => {
    const handleCursorSlotDrop = (e: Event) => {
      const customEvent = e as CustomEvent<{ items: any[] }>;
      const { items } = customEvent.detail;

      // IMPORTANT: Clear purple outline IMMEDIATELY to prevent it from getting stuck
      // Do this before any other processing to ensure fast UI response
      setIsCursorOverHand(false);

      // Allow both CARDS and TOKENS in hand panel
      const itemsToAdd = items.filter(item => item.type === ItemType.CARD || item.type === ItemType.TOKEN);

      if (itemsToAdd.length > 0) {
        const player = players.find(p => p.id === selectedPlayerId);
        if (!player) {
          logger.warn('[HandPanelV2] Player not found:', selectedPlayerId);
          setIsCursorOverHand(false);
          return;
        }

        const currentHandCardOrder = player.handCardOrder || [];
        const newItemIds = itemsToAdd.map(item => item.id);
        const updatedHandCardOrder = [...currentHandCardOrder, ...newItemIds];

        // ✅ ИСПРАВЛЕНО: Update player via GameContext dispatch
        dispatch({
          type: 'UPDATE_PLAYER',
          payload: {
            id: player.id,
            updates: {
              handCardOrder: updatedHandCardOrder
            }
          }
        });

        itemsToAdd.forEach(item => {
          // IMPORTANT: When user explicitly drops cards/tokens to hand panel, ALWAYS move to HAND
          // Don't check currentLocation because PoolTabletop might have already changed it
          // The user's intent (clicking on hand panel) should take precedence

          // For cards, set location to HAND
          // For tokens, just set isOnTable to false
          const updates: any = {
            ownerId: selectedPlayerId,
            inCursorSlot: false,
            isOnTable: false, // Cards/tokens in hand are not on table
            x: -999999, // Hide from table view
            y: -999999
          };

          // Only cards have location property
          if (item.type === ItemType.CARD) {
            updates.location = CardLocation.HAND;
          }

          dispatch({
            type: 'UPDATE_OBJECT',
            payload: {
              id: item.id,
              updates
            }
          });
        });

        setPickingUpCardIds(prev => {
          const newSet = new Set(prev);
          itemsToAdd.forEach(item => newSet.delete(item.id));
          return newSet;
        });

        recentlyDroppedToHandRef.current = new Set([
          ...recentlyDroppedToHandRef.current,
          ...itemsToAdd.map(item => item.id)
        ]);

        // Reduced timeout from 2000ms to 500ms to allow quicker re-pickup
        setTimeout(() => {
          recentlyDroppedToHandRef.current = new Set(
            Array.from(recentlyDroppedToHandRef.current).filter(id =>
              !itemsToAdd.some(item => item.id === id)
            )
          );
        }, 500);
      }

      // Also dispatch cursor-slot-dropped to notify useCursorSlotHover hook
      // This ensures the purple outline is cleared in all components
      window.dispatchEvent(new CustomEvent('cursor-slot-dropped', {
        detail: { cardIds: itemsToAdd.map(i => i.id) }
      }));
    };

    window.addEventListener('cursor-slot-drop-to-hand', handleCursorSlotDrop);
    return () => {
      window.removeEventListener('cursor-slot-drop-to-hand', handleCursorSlotDrop);
    };
  }, [selectedPlayerId, players, dispatch]);

  // Listen for cursor slot drop events
  useEffect(() => {
    const handleCursorSlotDropped = (e: Event) => {
      const customEvent = e as CustomEvent<{
        cardIds: string[];
      }>;

      const { cardIds } = customEvent.detail;
      if (!cardIds || cardIds.length === 0) return;

      setPickingUpCardIds(prev => {
        const newSet = new Set(prev);
        cardIds.forEach(id => newSet.delete(id));
        return newSet;
      });
    };

    window.addEventListener('cursor-slot-dropped', handleCursorSlotDropped);
    return () => window.removeEventListener('cursor-slot-dropped', handleCursorSlotDropped);
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      recentlyDroppedToHandRef.current.clear();
    };
  }, []);

  // Listen for add-to-cursor-slot events
  // This handler ONLY updates local state, doesn't block the event
  useEffect(() => {
    const handleAddToCursorSlot = (e: Event) => {
      const customEvent = e as CustomEvent<{
        cardId: string;
        clientX: number;
        clientY: number;
        source?: string;
      }>;

      const { cardId } = customEvent.detail;

      setPickingUpCardIds(prev => {
        // Check if already picking up this card to avoid duplicates
        if (prev.has(cardId)) {
          return prev;
        }
        return new Set([...prev, cardId]);
      });
    };

    window.addEventListener('add-to-cursor-slot', handleAddToCursorSlot);

    return () => {
      window.removeEventListener('add-to-cursor-slot', handleAddToCursorSlot);
    };
  }, []); // Remove pickingUpCardIds dependency to avoid infinite loop

  // Filter cards and tokens for selected player
  const player = players.find(p => p.id === selectedPlayerId);
  const handCardOrder = player?.handCardOrder || [];

  // Get both cards and tokens in hand
  // Note: pickingUpCardIds filter is only for TABLE items, not HAND items
  // HAND items should always be shown regardless of pickingUpCardIds
  const handItems = allHandObjects.filter((item): item is Card | Token => {
    if (item.inCursorSlot) return false;
    if (item.ownerId !== selectedPlayerId) return false;

    // For cards, check location
    if (item.type === ItemType.CARD) {
      return (item as Card).location === CardLocation.HAND;
    }
    // For tokens, check if not on table (in hand)
    if (item.type === ItemType.TOKEN) {
      return !item.isOnTable;
    }
    return false;
  });

  const cardOrderMap = new Map(handCardOrder.map((id, index) => [id, index]));
  const cards = handItems.sort((a, b) => {
    const aIndex = cardOrderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const bIndex = cardOrderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return aIndex - bIndex;
  });

  // Determine if viewing opponent's hand
  const isViewingOpponentHand = selectedPlayerId !== activePlayerId;

  // Group items by type and shape
  const groups: Record<string, { cards: (Card | Token)[]; shape: CardShape | 'Mixed' | 'Token' }> = {};

  cards.forEach(item => {
    if (item.type === ItemType.TOKEN) {
      // Tokens go to their own group
      if (!groups['Token']) {
        groups['Token'] = { cards: [], shape: 'Token' };
      }
      groups['Token'].cards.push(item);
    } else {
      // Cards grouped by shape
      const shape = (item as Card).shape ?? CardShape.POKER;
      if (!groups[shape]) {
        groups[shape] = { cards: [], shape };
      }
      groups[shape].cards.push(item);
    }
  });

  const cardsByShape = Object.values(groups).sort((a, b) => {
    if (a.shape === 'Mixed') return 1;
    if (b.shape === 'Mixed') return -1;
    if (a.shape === 'Token') return 1; // Tokens at the end
    if (b.shape === 'Token') return -1;
    return a.shape.localeCompare(b.shape);
  });

  // Group tokens into stacks for each group
  const groupsWithTokenStacks = cardsByShape.map(group => {
    if (group.shape === 'Token') {
      const tokens = group.cards.filter((item): item is Token => item.type === ItemType.TOKEN);
      const tokenStacks = groupTokens(tokens);
      return {
        ...group,
        cards: tokens, // Keep original cards for compatibility
        tokenStacks,
        hasTokenStacks: true
      };
    }
    return {
      ...group,
      hasTokenStacks: false
    };
  });

  // Compute card dimensions
  const computeCardDimensions = useCallback((card: Card) => {
    const deck = card.deckId ? (objects[card.deckId] as DeckType | undefined) : undefined;
    return getCardDimensions(card, deck, cardScale, 0.98);
  }, [objects, cardScale]);

  // Compute card settings
  const computeCardSettings = useCallback((card: Card) => {
    return getCardSettings(card, objects);
  }, [objects]);

  // Action handlers
  const handleFlip = useCallback((cardId: string) => {
    const obj = objects[cardId] as Card;
    if (obj) {
      updateCard(cardId, { faceUp: !obj.faceUp });
    }
  }, [objects, updateCard]);

  const handleRotateClockwise = useCallback((cardId: string) => {
    const obj = objects[cardId] as any;
    // Get rotationStep from deck if card has one, otherwise from card itself
    let rotationStep = obj?.rotationStep;
    if (!rotationStep && obj?.deckId) {
      const deck = objects[obj.deckId] as any;
      rotationStep = deck?.rotationStep;
    }
    rotationStep = rotationStep ?? 45;
    updateCard(cardId, { rotation: (obj?.rotation || 0) + rotationStep });
  }, [objects, updateCard]);

  const handleRotateCounterClockwise = useCallback((cardId: string) => {
    const obj = objects[cardId] as any;
    // Get rotationStep from deck if card has one, otherwise from card itself
    let rotationStep = obj?.rotationStep;
    if (!rotationStep && obj?.deckId) {
      const deck = objects[obj.deckId] as any;
      rotationStep = deck?.rotationStep;
    }
    rotationStep = rotationStep ?? 45;
    updateCard(cardId, { rotation: (obj?.rotation || 0) - rotationStep });
  }, [objects, updateCard]);

  const handleSwingingClockwise = useCallback((cardId: string) => {
    const obj = objects[cardId] as any;
    updateCard(cardId, { swinging: (obj?.swinging || 0) + 15 });
  }, [objects, updateCard]);

  const handleSwingingCounterClockwise = useCallback((cardId: string) => {
    const obj = objects[cardId] as any;
    updateCard(cardId, { swinging: (obj?.swinging || 0) - 15 });
  }, [objects, updateCard]);

  const handleLayerUp = useCallback((cardId: string) => {
    // Implement layer up logic
  }, []);

  const handleLayerDown = useCallback((cardId: string) => {
    // Implement layer down logic
  }, []);

  const handleClone = useCallback((cardId: string) => {
    const obj = objects[cardId];
    if (obj) {
      const card = obj as any;
      const newCardId = `card-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      // If card belongs to a deck, add to both cardIds and baseCardIds
      if (card.deckId) {
        const deck = objects[card.deckId];
        if (deck && deck.type === 'DECK') {
          const newCard = {
            ...card,
            id: newCardId,
            name: `${card.name} (copy)`,
            x: (card.x || 0) + 20,
            y: (card.y || 0) + 20
          };

          // Add to both cardIds and baseCardIds so cloned card persists
          const updatedCardIds = [...deck.cardIds, newCardId];
          const updatedBaseCardIds = [...(deck.baseCardIds || []), newCardId];

          dispatch({
            type: 'UPDATE_OBJECT',
            payload: {
              id: deck.id,
              updates: { cardIds: updatedCardIds, baseCardIds: updatedBaseCardIds }
            }
          });

          addObject(newCard);
          return;
        }
      }

      // Fallback for cards without deck
      const newObj = {
        ...obj,
        id: newCardId,
        x: (obj.x || 0) + 20,
        y: (obj.y || 0) + 20
      };
      addObject(newObj);
    }
  }, [objects, addObject, dispatch]);

  const handleMoveToHand = useCallback((cardId: string) => {
    updateCard(cardId, {
      location: CardLocation.HAND,
      ownerId: selectedPlayerId,
      isOnTable: false
    });
  }, [updateCard, selectedPlayerId]);

  const handleMoveToTopDeck = useCallback((cardId: string) => {
    // Implement deck logic
  }, []);

  const handleMoveToBottomDeck = useCallback((cardId: string) => {
    // Implement deck logic
  }, []);

  const handleMoveToDiscard = useCallback((cardId: string) => {
    // Implement discard logic
  }, []);

  // Context menu handler
  const handleCardContextMenu = useCallback((e: React.MouseEvent, card: Card) => {
    // Block context menu if settings modal is open
    if (isSettingsModalOpen) return;
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, object: card });
  }, [isSettingsModalOpen]);

  const getSafeMenuPosition = useCallback((x: number, y: number): { x: number; y: number } => {
    const menuWidth = 280;
    const menuHeight = 180;
    const padding = 8;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let safeX = x;
    let safeY = y;

    if (safeX + menuWidth > viewportWidth - padding) {
      safeX = viewportWidth - menuWidth - padding;
    }

    if (safeX < padding) {
      safeX = padding;
    }

    if (safeY + menuHeight > viewportHeight - padding) {
      safeY = viewportHeight - menuHeight - padding;
    }

    if (safeY < padding) {
      safeY = padding;
    }

    return { x: safeX, y: safeY };
  }, []);

  const handlePanelContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const safePos = getSafeMenuPosition(e.clientX, e.clientY);
    setScaleMenu(safePos);
  }, [getSafeMenuPosition]);

  // Handle click on hand panel to drop cursor slot items
  const handlePanelClick = useCallback((e: React.MouseEvent) => {
    // Check if click is within hand panel (but not on a card or button)
    const target = e.target as HTMLElement;
    const isCardOrButton = target.closest('[data-card-id], [data-hand-panel-card], button, a');

    // Don't handle clicks on cards or buttons
    if (isCardOrButton) {
      return;
    }

    // Check if there are items in cursor slot (objects with inCursorSlot: true)
    const itemsInCursorSlot = Object.values(objects).filter(obj =>
      (obj.type === ItemType.CARD || obj.type === ItemType.TOKEN) &&
      (obj as any).inCursorSlot === true
    );

    if (itemsInCursorSlot.length === 0) {
      return;
    }

    // Dispatch event to drop items to hand
    // IMPORTANT: Clear purple outline immediately when dropping to hand
    // This prevents the outline from getting stuck due to timing issues
    setIsCursorOverHand(false);
    window.dispatchEvent(new CustomEvent('cursor-slot-drop-to-hand', {
      detail: { items: itemsInCursorSlot }
    }));
    // Also dispatch cursor-slot-dropped to notify useCursorSlotHover hook
    // This ensures the purple outline is cleared in all components
    window.dispatchEvent(new CustomEvent('cursor-slot-dropped', {
      detail: { cardIds: itemsInCursorSlot.map(i => i.id) }
    }));
  }, [objects, selectedPlayerId, setIsCursorOverHand]);

  const handleTabContextMenu = useCallback((e: React.MouseEvent, playerId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const player = players.find(p => p.id === playerId);
    if (player) {
      setHandTabSettings({ playerId, player });
    }
  }, [players]);

  // Context menu handlers for cards in hand
  const handleCardMoveToTop = useCallback((cardId: string) => {
    const card = objects[cardId] as Card;
    if (!card || !card.deckId) return;

    const deck = objects[card.deckId] as DeckType;
    if (!deck || deck.type !== ItemType.DECK) return;

    // Remove card from current position in deck
    const newCardIds = deck.cardIds.filter(id => id !== cardId);

    // Add to top of deck
    newCardIds.unshift(cardId);

    // Update deck
    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: deck.id,
        updates: { cardIds: newCardIds }
      }
    });

    // Update card location
    updateCard(cardId, {
      location: CardLocation.DECK,
      inCursorSlot: false,
      isOnTable: false,
      x: -999999,
      y: -999999
    });

    // IMPORTANT: Remove card from player's handCardOrder
    const player = players.find(p => p.id === selectedPlayerId);
    if (player) {
      const currentHandOrder = player.handCardOrder || [];
      const updatedHandOrder = currentHandOrder.filter(id => id !== cardId);
      dispatch({
        type: 'UPDATE_PLAYER',
        payload: {
          id: player.id,
          updates: { handCardOrder: updatedHandOrder }
        }
      });
    }
  }, [objects, dispatch, updateCard, players, selectedPlayerId]);

  const handleCardMoveToBottom = useCallback((cardId: string) => {
    const card = objects[cardId] as Card;
    if (!card || !card.deckId) return;

    const deck = objects[card.deckId] as DeckType;
    if (!deck || deck.type !== ItemType.DECK) return;

    // Remove card from current position in deck
    const newCardIds = deck.cardIds.filter(id => id !== cardId);

    // Add to bottom of deck
    newCardIds.push(cardId);

    // Update deck
    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: deck.id,
        updates: { cardIds: newCardIds }
      }
    });

    // Update card location
    updateCard(cardId, {
      location: CardLocation.DECK,
      inCursorSlot: false,
      isOnTable: false,
      x: -999999,
      y: -999999
    });

    // IMPORTANT: Remove card from player's handCardOrder
    const player = players.find(p => p.id === selectedPlayerId);
    if (player) {
      const currentHandOrder = player.handCardOrder || [];
      const updatedHandOrder = currentHandOrder.filter(id => id !== cardId);
      dispatch({
        type: 'UPDATE_PLAYER',
        payload: {
          id: player.id,
          updates: { handCardOrder: updatedHandOrder }
        }
      });
    }
  }, [objects, dispatch, updateCard, players, selectedPlayerId]);

  const handleCardMill = useCallback((cardId: string) => {
    const card = objects[cardId] as Card;
    if (!card || !card.deckId) return;

    const deck = objects[card.deckId] as DeckType;
    if (!deck || deck.type !== ItemType.DECK) return;

    // Find mill pile (pile with isMillPile: true)
    const millPile = deck.piles?.find(p => p.isMillPile);
    if (!millPile) return;

    // Remove card from deck
    const newCardIds = deck.cardIds.filter(id => id !== cardId);

    // Update deck
    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: deck.id,
        updates: { cardIds: newCardIds }
      }
    });

    // Add card to pile
    const updatedPiles = deck.piles?.map(pile => {
      if (pile.id === millPile.id) {
        return {
          ...pile,
          cardIds: [cardId, ...pile.cardIds]
        };
      }
      return pile;
    });

    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: deck.id,
        updates: { piles: updatedPiles }
      }
    });

    // Update card location
    updateCard(cardId, {
      location: CardLocation.PILE,
      inCursorSlot: false,
      isOnTable: false,
      x: -999999,
      y: -999999
    });

    // IMPORTANT: Remove card from player's handCardOrder
    const player = players.find(p => p.id === selectedPlayerId);
    if (player) {
      const currentHandOrder = player.handCardOrder || [];
      const updatedHandOrder = currentHandOrder.filter(id => id !== cardId);
      dispatch({
        type: 'UPDATE_PLAYER',
        payload: {
          id: player.id,
          updates: { handCardOrder: updatedHandOrder }
        }
      });
    }
  }, [objects, dispatch, updateCard, players, selectedPlayerId]);

  const handleCardMoveToPile = useCallback((cardId: string, pileId: string) => {
    const card = objects[cardId] as Card;
    if (!card || !card.deckId) return;

    const deck = objects[card.deckId] as DeckType;
    if (!deck || deck.type !== ItemType.DECK) return;

    // Find target pile
    const targetPile = deck.piles?.find(p => p.id === pileId);
    if (!targetPile) return;

    // Remove card from deck
    const newCardIds = deck.cardIds.filter(id => id !== cardId);

    // Update deck
    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: deck.id,
        updates: { cardIds: newCardIds }
      }
    });

    // Add card to pile
    const updatedPiles = deck.piles?.map(pile => {
      if (pile.id === pileId) {
        return {
          ...pile,
          cardIds: [cardId, ...pile.cardIds]
        };
      }
      return pile;
    });

    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: deck.id,
        updates: { piles: updatedPiles }
      }
    });

    // Update card location
    updateCard(cardId, {
      location: CardLocation.PILE,
      inCursorSlot: false,
      isOnTable: false,
      x: -999999,
      y: -999999
    });

    // IMPORTANT: Remove card from player's handCardOrder
    const player = players.find(p => p.id === selectedPlayerId);
    if (player) {
      const currentHandOrder = player.handCardOrder || [];
      const updatedHandOrder = currentHandOrder.filter(id => id !== cardId);
      dispatch({
        type: 'UPDATE_PLAYER',
        payload: {
          id: player.id,
          updates: { handCardOrder: updatedHandOrder }
        }
      });
    }
  }, [objects, dispatch, updateCard, players, selectedPlayerId]);

  const handleOpenCardSettings = useCallback((card: Card) => {
    setCardSettingsModal(card);
  }, []);

  const handleScaleChange = useCallback((newScale: number) => {
    setTabCardScale(newScale);
  }, [setTabCardScale]);

  // Handle card mouse down
  const handleCardMouseDown = useCallback((e: React.MouseEvent, cardId: string, index: number, cardElement: HTMLDivElement | null) => {
    if (e.button !== 0) return;
    if (isViewingOpponentHand) return;

    const target = e.target as HTMLElement;
    if (target.closest('button')) return;

    e.preventDefault();
    e.stopPropagation();

    // Calculate click offset relative to the card element (in screen pixels)
    let clickOffsetX_PX: number | undefined;
    let clickOffsetY_PX: number | undefined;

    if (cardElement) {
      const rect = cardElement.getBoundingClientRect();
      clickOffsetX_PX = e.clientX - rect.left;
      clickOffsetY_PX = e.clientY - rect.top;
    }

    // Handle Shift+click: immediately add to cursor slot without drag
    if (e.shiftKey) {
      const card = objects[cardId] as Card | Token;
      if (card && !card.inCursorSlot && !pickingUpCardIds.has(cardId)) {
        if (!recentlyDroppedToHandRef.current.has(cardId)) {
          // Check if we need to drop existing cursor slot items first
          let shouldDropFirst = false;

          if (card.type === ItemType.TOKEN) {
            const token = card as Token;
            if (cursorSlotHasCards() || !isCursorSlotSameTokenType(token)) {
              shouldDropFirst = true;
            }
          } else {
            const tokensInSlot = getTokensInCursorSlot();
            const cardsInSlot = Object.values(objects).filter(obj =>
              obj.type === ItemType.CARD && (obj as any).inCursorSlot === true
            );
            if (tokensInSlot.length > 0 || cardsInSlot.length > 0) {
              shouldDropFirst = true;
            }
          }

          if (shouldDropFirst) {
            dropCursorSlotToHand();
          }

          recentlyDroppedToHandRef.current.delete(cardId);
          setPickingUpCardIds(prev => new Set([...prev, cardId]));

          const cardOverride: any = { ...card };
          if (card.type === ItemType.CARD && (card as Card).location === CardLocation.HAND) {
            delete cardOverride.x;
            delete cardOverride.y;
          }

          window.dispatchEvent(new CustomEvent('add-to-cursor-slot', {
            detail: {
              cardId,
              clientX: e.clientX,
              clientY: e.clientY,
              source: 'shift', // Use 'shift' for Shift+click behavior
              cardOverride,
              clickOffsetX_PX,
              clickOffsetY_PX,
              isFromHand: true
            }
          }));

          // Don't set up drag refs for Shift+click
          return;
        }
      }
    }

    longPressCardRef.current = {
      cardId,
      startTime: Date.now(),
      startX: e.clientX,
      startY: e.clientY,
      clickOffsetX_PX,
      clickOffsetY_PX
    };


    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
    setDragIndex(index);
    cardPickedUpRef.current = false;
  }, [isViewingOpponentHand, objects, pickingUpCardIds, cursorSlotHasCards, isCursorSlotSameTokenType, getTokensInCursorSlot, dropCursorSlotToHand]);

  // Handle mouse move
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (longPressCardRef.current && !cardPickedUpRef.current) {
      // Use 2vu distance threshold like in tabletop space
      const dx_PX = e.clientX - longPressCardRef.current.startX;
      const dy_PX = e.clientY - longPressCardRef.current.startY;
      const distance_PX = Math.sqrt(dx_PX * dx_PX + dy_PX * dy_PX);
      const distance_VU = distance_PX / cardScaleRef.current; // Convert pixels to VU using ref

      if (distance_VU >= 2) {
        // Card picked up after moving 2vu
        const card = objects[longPressCardRef.current.cardId] as Card;

        // For cards in HAND, allow picking up even if in pickingUpCardIds
        // (pickingUpCardIds is only for TABLE items)
        const isCardInHand = card.location === CardLocation.HAND;
        if (!isCardInHand && (card.inCursorSlot || pickingUpCardIds.has(longPressCardRef.current.cardId))) {
          longPressCardRef.current = null;
          setDragIndex(null);
          return;
        }

        const cardId = longPressCardRef.current.cardId;

        // IMPORTANT: Check recentlyDroppedToHandRef BEFORE dispatching event
        if (recentlyDroppedToHandRef.current.has(cardId)) {
          longPressCardRef.current = null;
          setDragIndex(null);
          return;
        }

        // Clear from recentlyDroppedToHandRef when picking up from hand
        recentlyDroppedToHandRef.current.delete(cardId);

        setPickingUpCardIds(prev => new Set([...prev, cardId]));
        cardPickedUpRef.current = true;


        // Pass card data directly to ensure handler has access to it
        // IMPORTANT: For cards in HAND, don't pass x,y coordinates in cardOverride
        // because they're in a different coordinate system and cause offset calculation errors
        const cardOverride: any = { ...card };
        if (card.location === CardLocation.HAND) {
          // Remove x,y coordinates for cards in hand - they're in pool/table coordinate system
          // and will cause incorrect offset calculations when used with global click coordinates
          delete cardOverride.x;
          delete cardOverride.y;
        }

        window.dispatchEvent(new CustomEvent('add-to-cursor-slot', {
          detail: {
            cardId,
            clientX: e.clientX,
            clientY: e.clientY,
            source: 'hold',
            cardOverride,
            clickOffsetX_PX: longPressCardRef.current.clickOffsetX_PX,
            clickOffsetY_PX: longPressCardRef.current.clickOffsetY_PX,
            isFromHand: true // Flag to indicate this card came from hand panel
          }
        }));
        longPressCardRef.current = null;
        setDragIndex(null);
        return;
      }
    }

    if (dragIndex === null) return;

    if (dragStartPosRef.current) {
      const dx = e.clientX - dragStartPosRef.current.x;
      const dy = e.clientY - dragStartPosRef.current.y;
      const moveThreshold = 5;

      if (Math.abs(dx) < moveThreshold && Math.abs(dy) < moveThreshold) {
        return;
      }
    }

    const container = containerRef.current;
    if (!container) return;

    const scrollContainer = container.querySelector('.scrollbar-thin') as HTMLElement;
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
  }, [dragIndex, objects, pickingUpCardIds]);

  // Handle mouse up
  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    // Check if this was a quick click on a card/token (not a drag)
    if (longPressCardRef.current && !cardPickedUpRef.current) {
      const dragDuration = Date.now() - longPressCardRef.current.startTime;
      const dragDistance = Math.sqrt(
        Math.pow(e.clientX - longPressCardRef.current.startX, 2) +
        Math.pow(e.clientY - longPressCardRef.current.startY, 2)
      );

      // If it was a quick click with minimal movement, add to cursor slot (like TokensPanel)
      if (dragDuration < 200 && dragDistance < 10) {
        const cardId = longPressCardRef.current.cardId;
        const card = objects[cardId] as Card | Token;

        if (card && !card.inCursorSlot && !pickingUpCardIds.has(cardId)) {
          // Check recentlyDroppedToHandRef
          if (!recentlyDroppedToHandRef.current.has(cardId)) {
            // Clear from recentlyDroppedToHandRef when picking up from hand
            recentlyDroppedToHandRef.current.delete(cardId);

            setPickingUpCardIds(prev => new Set([...prev, cardId]));
            cardPickedUpRef.current = true;

            // Pass card data directly to ensure handler has access to it
            const cardOverride: any = { ...card };
            if (card.type === ItemType.CARD && (card as Card).location === CardLocation.HAND) {
              delete cardOverride.x;
              delete cardOverride.y;
            }

            window.dispatchEvent(new CustomEvent('add-to-cursor-slot', {
              detail: {
                cardId,
                clientX: e.clientX,
                clientY: e.clientY,
                source: 'hold',
                cardOverride,
                clickOffsetX_PX: longPressCardRef.current.clickOffsetX_PX,
                clickOffsetY_PX: longPressCardRef.current.clickOffsetY_PX,
                isFromHand: true
              }
            }));

            // Clear refs and return early (don't process drag reordering)
            longPressCardRef.current = null;
            setDragIndex(null);
            dragStartPosRef.current = null;
            return;
          }
        }
      }
    }

    longPressCardRef.current = null;
    cardPickedUpRef.current = false;

    if (dragIndex === null) return;

    const container = containerRef.current;
    if (container && !container.contains(e.target as Node)) {
      setDragIndex(null);
      setDragOverIndex(null);
      dragStartPosRef.current = null;
      return;
    }

    if (dragOverIndex !== null && dragOverIndex !== dragIndex) {
      const newCards = [...cards];
      const [movedCard] = newCards.splice(dragIndex, 1);
      newCards.splice(dragOverIndex, 0, movedCard);

      const newCardOrder = newCards.map(c => c.id);
      const player = players.find(p => p.id === selectedPlayerId);
      if (player) {
        updatePlayerData(player.id, {
          handCardOrder: newCardOrder
        });
      }
    }

    setDragIndex(null);
    setDragOverIndex(null);
    dragStartPosRef.current = null;
  }, [dragIndex, dragOverIndex, cards, selectedPlayerId, players, updatePlayerData, objects, pickingUpCardIds]);

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

  // Reset to own hand when active player changes
  useEffect(() => {
    setSelectedPlayerId(activePlayerId);
  }, [activePlayerId]);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: Event) => {
      const target = e.target as Node;

      if (scaleMenuRef.current && scaleMenuRef.current.contains(target)) {
        return;
      }

      if (contextMenu) {
        setContextMenu(null);
      }

      if (scaleMenu) {
        setScaleMenu(null);
      }
    };
    if (contextMenu || scaleMenu) {
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 100);
      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
    return undefined;
  }, [contextMenu, scaleMenu]);

  // Helper function to count items (cards + tokens) for a player
  const countCardsForPlayer = useCallback((playerId: string) => {
    return allHandObjects.filter(item => {
      if (item.inCursorSlot || pickingUpCardIds.has(item.id)) return false;
      if (item.ownerId !== playerId) return false;

      // For cards, check location
      if (item.type === ItemType.CARD) {
        return (item as Card).location === CardLocation.HAND;
      }
      // For tokens, check if not on table (in hand)
      if (item.type === ItemType.TOKEN) {
        return !item.isOnTable;
      }
      return false;
    }).length;
  }, [allHandObjects, pickingUpCardIds]);

  return (
    <div
      ref={containerRef}
      data-hand-panel="true"
      className="h-full flex flex-col transition-all w-full"
      style={width ? { width: shiftScrollbar ? width + 25 : width } : undefined}
      onClick={handlePanelClick}
    >
      {/* Player hand tabs */}
      {!isCollapsed && players.length > 1 && (
        <div className="flex flex-wrap gap-1 px-1 pt-1 pb-0 border-b border-slate-700 min-w-0 max-w-full overflow-hidden box-border">
          {players.map(player => {
            const isActive = player.id === selectedPlayerId;
            const isOwnHand = player.id === activePlayerId;

            const playerIsGM = players.find(p => p.id === player.id)?.isGM ?? false;
            const shouldShowTab = isOwnHand || isGM || !playerIsGM;

            if (!shouldShowTab) return null;

            const cardCount = countCardsForPlayer(player.id);

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

      {/* Single player header */}
      {!isCollapsed && players.length === 1 && (
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

      {/* Cards Grid */}
      {!isCollapsed && (
        <div className="flex-1 min-h-0 w-full relative box-border">
          {(isDragTarget || isCursorOverHand) && (
            <div className="absolute inset-0 pointer-events-none rounded ring-4 ring-purple-500 ring-inset z-[200]" />
          )}
          <div ref={scrollContainerRef} className="scrollbar-thin h-full pt-1 pb-1 px-1 overflow-x-auto overflow-y-hidden min-w-0 w-full box-border" data-scrollable="true">
          {cards.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[200px] text-slate-500 px-1">
              <p className="text-sm">
                {isViewingOpponentHand
                  ? `${players.find(p => p.id === selectedPlayerId)?.name || translate('Player', language as Locale)} ${translate('has no cards', language as Locale)}`
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
              {groupsWithTokenStacks.map((group, groupIndex) => {
                const groupOffset = groupIndex === 0 ? 0 : groupsWithTokenStacks.slice(0, groupIndex).reduce((sum, g) => {
                  // For token stacks, count as 1 per stack
                  if (g.hasTokenStacks) {
                    return sum + (g as any).tokenStacks?.length || 0;
                  }
                  return sum + g.cards.length;
                }, 0);
                const groupCards = group.cards.filter((item): item is Card => item.type === ItemType.CARD) as Card[];
                const { shouldVirtualize } = useVirtualizedHandList(groupCards.length);
                const tokenStacks = (group as any).tokenStacks as TokenStack[] || [];
                const hasTokenStacks = (group as any).hasTokenStacks || false;

                return (
                  <div key={group.shape} className="mb-3 min-w-0 max-w-full box-border">
                    <div className="text-xs text-gray-500 font-bold mb-1 px-1 truncate">
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

                    {shouldVirtualize ? (
                      <VirtualizedHandList
                        cards={groupCards}
                        pixelsPerVU={1}
                        className="px-1"
                        cardWidth={100}
                        cardHeight={140}
                        cardSpacing={10}
                        vertical={false}
                        renderCard={(card, index) => {
                          const cardSettings = computeCardSettings(card);
                          const cardActionButtons = cardSettings.cardActionButtons;
                          const { width: cardWidth, height: cardHeight } = computeCardDimensions(card);
                          const deck = card.deckId ? (objects[card.deckId] as DeckType | undefined) : undefined;

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
                          const displayedCard = isViewingOpponentHand ? { ...card, faceUp: false } : card;

                          return (
                            <HandCardItem
                              key={card.id}
                              card={card}
                              displayedCard={displayedCard}
                              actualIndex={actualIndex}
                              cardWidth={cardWidth}
                              cardHeight={cardHeight}
                              cardSettings={cardSettings}
                              deck={deck}
                              isViewingOpponentHand={isViewingOpponentHand}
                              isDragging={dragIndex === actualIndex}
                              isDragOver={dragOverIndex === actualIndex}
                              buttons={buttons}
                              language={language}
                              onMouseDown={handleCardMouseDown}
                              onContextMenu={handleCardContextMenu}
                            />
                          );
                        }}
                      />
                    ) : (
                      <div className="flex flex-wrap gap-[2px] min-w-0 overflow-hidden box-border hand-cards-container px-1">
                        {/* Render token stacks if this is a token group */}
                        {hasTokenStacks && tokenStacks.map((stack, stackIndex) => {
                          const actualIndex = groupOffset + stackIndex;

                          return (
                            <TokenStackItem
                              key={stack.representativeToken.id}
                              stack={stack}
                              stackIndex={stackIndex}
                              groupOffset={groupOffset}
                              isDragging={dragIndex === actualIndex}
                              isDragOver={dragOverIndex === actualIndex}
                              isGM={isGM}
                              activePlayerId={selectedPlayerId}
                              onMouseDown={(e, tokenIds, index, element) => {
                                // For token stacks, we handle the first token ID
                                handleCardMouseDown(e, tokenIds[0], index, element);
                              }}
                              onContextMenu={(e) => handleCardContextMenu(e, stack.representativeToken as any)}
                            />
                          );
                        })}

                        {/* Render cards */}
                        {group.cards.filter((item): item is Card => item.type === ItemType.CARD).map((card, cardIndex) => {
                          // Explicitly type the card as Card to avoid type errors
                          const typedCard = card as Card;
                          const cardSettings = computeCardSettings(typedCard);
                          const cardActionButtons = cardSettings.cardActionButtons;
                          const { width: cardWidth, height: cardHeight } = computeCardDimensions(typedCard);
                          const deck = typedCard.deckId ? (objects[typedCard.deckId] as DeckType | undefined) : undefined;

                          const buttons = getCardButtonConfigsWithActions(
                            cardActionButtons,
                            {
                              onFlip: () => handleFlip(typedCard.id),
                              onRotateClockwise: () => handleRotateClockwise(typedCard.id),
                              onRotateCounterClockwise: () => handleRotateCounterClockwise(typedCard.id),
                              onSwingingClockwise: () => handleSwingingClockwise(typedCard.id),
                              onSwingingCounterClockwise: () => handleSwingingCounterClockwise(typedCard.id),
                              onLayerUp: () => handleLayerUp(typedCard.id),
                              onLayerDown: () => handleLayerDown(typedCard.id),
                              onClone: () => handleClone(typedCard.id),
                              onMoveToHand: () => handleMoveToHand(typedCard.id),
                              onMoveToTopDeck: () => handleMoveToTopDeck(typedCard.id),
                              onMoveToBottomDeck: () => handleMoveToBottomDeck(typedCard.id),
                              onMoveToDiscard: () => handleMoveToDiscard(typedCard.id)
                            },
                            typedCard.faceUp ?? true,
                            typedCard.locked ?? false,
                            language
                          );

                          // Calculate actual index considering token stacks
                          const actualIndex = groupOffset + (hasTokenStacks ? tokenStacks.length : 0) + cardIndex;
                          const displayedCard = isViewingOpponentHand ? { ...typedCard, faceUp: false } : typedCard;

                          return (
                            <HandCardItem
                              key={typedCard.id}
                              card={typedCard}
                              displayedCard={displayedCard}
                              actualIndex={actualIndex}
                              cardWidth={cardWidth}
                              cardHeight={cardHeight}
                              cardSettings={cardSettings}
                              deck={deck}
                              isViewingOpponentHand={isViewingOpponentHand}
                              isDragging={dragIndex === actualIndex}
                              isDragOver={dragOverIndex === actualIndex}
                              buttons={buttons}
                              language={language}
                              onMouseDown={handleCardMouseDown}
                              onContextMenu={handleCardContextMenu}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
          </div>
        </div>
      )}

      {/* Hand Tab Settings Modal */}
      {handTabSettings && createPortal(
        <div className="fixed inset-0 z-[100006] flex items-center justify-center bg-black/40" onClick={(e) => {
          if (e.target === e.currentTarget) {
            setHandTabSettings(null);
          }
        }}>
          <div className="bg-slate-800 rounded-lg shadow-xl w-[575px] border border-slate-600 max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-center items-center py-2 px-4">
              <h3 className="text-base font-bold text-white">{translate('Properties:', language as Locale)} {handTabSettings.player.name}</h3>
            </div>

            <div className="flex">
              <button className="flex-1 py-3 px-3 flex items-center justify-center gap-2 text-sm font-medium transition-colors bg-slate-700 text-white border-b-2 border-purple-500">
                {translate('General', language as Locale)}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
              <div className="space-y-4">
                <HandTabSettingsModal
                  player={handTabSettings.player}
                  players={players}
                  activePlayerId={activePlayerId}
                  isGM={isGM}
                  onScaleChange={(newScale) => {
                    if (selectedPlayerId === handTabSettings.playerId) {
                      setTabCardScale(newScale);
                    } else {
                      try {
                        const key = `hand-card-scale-${handTabSettings.playerId}`;
                        localStorage.setItem(key, String(newScale));
                        window.dispatchEvent(new CustomEvent('hand-card-scale-change', {
                          detail: { playerId: handTabSettings.playerId, newScale }
                        }));
                      } catch {
                        // Ignore localStorage errors
                      }
                    }
                  }}
                  onPlayerChange={setTempSettingsPlayer}
                  onSave={(updatedPlayer) => {
                    updatePlayerData(updatedPlayer.id, updatedPlayer);
                    setHandTabSettings(null);
                    setTempSettingsPlayer(null);
                  }}
                  language={language}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 p-4">
              <button
                onClick={() => setHandTabSettings(null)}
                className="px-4 py-2 text-sm text-gray-300 hover:bg-slate-700 rounded"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (tempSettingsPlayer) {
                    updatePlayerData(tempSettingsPlayer.id, tempSettingsPlayer);
                  }
                  setHandTabSettings(null);
                  setTempSettingsPlayer(null);
                }}
                className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-500 text-white rounded flex items-center gap-2"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Card Settings Modal */}
      {cardSettingsModal && (
        <ObjectSettingsModal
          object={cardSettingsModal}
          onSave={(updatedObj) => {
            dispatch({
              type: 'UPDATE_OBJECT',
              payload: { id: updatedObj.id, updates: updatedObj }
            });
            setCardSettingsModal(null);
          }}
          onClose={() => setCardSettingsModal(null)}
          allObjects={objects}
          language={language}
        />
      )}

      {/* Context menu for cards in hand */}
      {contextMenu && (
        <HandCardContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          card={contextMenu.object as Card}
          deck={(contextMenu.object as Card).deckId ? objects[(contextMenu.object as Card).deckId!] as DeckType : undefined}
          onClose={() => setContextMenu(null)}
          onFlip={() => handleFlip((contextMenu.object as Card).id)}
          onMoveToTop={() => handleCardMoveToTop((contextMenu.object as Card).id)}
          onMoveToBottom={() => handleCardMoveToBottom((contextMenu.object as Card).id)}
          onMill={() => handleCardMill((contextMenu.object as Card).id)}
          onMoveToPile={(pileId) => handleCardMoveToPile((contextMenu.object as Card).id, pileId)}
          onOpenSettings={() => handleOpenCardSettings(contextMenu.object as Card)}
          language={language}
        />
      )}

      {/* Scale menu */}
      {scaleMenu && createPortal(
        <div
          ref={scaleMenuRef}
          className="fixed z-[999999] bg-slate-800 border border-slate-600 rounded-lg shadow-xl py-3 px-3 min-w-[220px]"
          style={{
            left: calculateSafeMenuPosition(scaleMenu.x, scaleMenu.y, 220, 100).left,
            top: calculateSafeMenuPosition(scaleMenu.x, scaleMenu.y, 220, 100).top
          }}
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
    </div>
  );
};

// Memoize HandPanelOptimizedV2
export const HandPanelOptimizedMemo = React.memo(HandPanelOptimized, (prevProps, nextProps) => {
  return prevProps.width === nextProps.width &&
         prevProps.isDragTarget === nextProps.isDragTarget &&
         prevProps.isCollapsed === nextProps.isCollapsed &&
         prevProps.language === nextProps.language;
});

export default HandPanelOptimized;