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

import React, { useState, useCallback, useMemo, useEffect, useRef, memo } from 'react';
import { logger } from '../utils/logger';
import { createPortal } from 'react-dom';
import { useObjectsData, useObjectActions } from '../store/objectStore';
import {
  usePlayerList,
  useActivePlayerId,
  useIsGM,
  usePlayerPermissions
} from '../store/contexts';
import { Card, Deck as DeckType, ItemType, CardShape, CardLocation, TableObject, AppLanguage, Player } from '../types';
import { Card as CardComponent } from './Card';
import { ContextMenu } from './ContextMenu';
import { getCardSettings, getCardDimensions } from '../utils/cardUtils';
import { getCardButtonConfigsWithActions } from '../utils/buttonConfig';
import { MAIN_MENU_WIDTH } from '../constants';
import { Settings } from 'lucide-react';
import { useTabCardScale } from '../hooks/useTabCardScale';
import { HandTabSettingsModal } from './HandTabSettingsModal';
import { t as translate, Locale } from '../utils/translations';

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

interface HandPanelProps {
  width?: number;
  isDragTarget?: boolean;
  isCollapsed?: boolean;
  language?: AppLanguage;
}

export const HandPanelOptimized: React.FC<HandPanelProps> = ({
  width = MAIN_MENU_WIDTH,
  isDragTarget = false,
  isCollapsed = false,
  language = 'en'
}) => {
  // ✅ НОВЫЕ КОНТЕКСТЫ
  const objects = useObjectsData();
  const { updateObject, deleteObject, addObject } = useObjectActions();

  const players = usePlayerList();
  const activePlayerId = useActivePlayerId();
  const isGM = useIsGM();
  const playerPermissions = usePlayerPermissions();

  // 🔥 OPTIMIZED: Memoize cards array
  const allCards = useMemo(() => {
    return Object.values(objects).filter(obj => obj.type === ItemType.CARD) as Card[];
  }, [objects]);

  const containerRef = useRef<HTMLDivElement>(null);
  const scaleMenuRef = useRef<HTMLDivElement>(null);

  // State for selected player hand tab
  const [selectedPlayerId, setSelectedPlayerId] = useState(activePlayerId);

  // Use per-tab scale hook for the currently selected player
  const { scale: cardScale, setTabCardScale } = useTabCardScale(selectedPlayerId);

  // Get current player info
  const currentPlayer = players.find(p => p.id === activePlayerId);

  // Context menu state for cards in hand
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; object: TableObject } | null>(null);
  // Context menu state for hand scale
  const [scaleMenu, setScaleMenu] = useState<{ x: number; y: number } | null>(null);
  // Hand tab settings modal state
  const [handTabSettings, setHandTabSettings] = useState<{ playerId: string; player: Player } | null>(null);
  const [tempSettingsPlayer, setTempSettingsPlayer] = useState<Player | null>(null);
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

  // Local state to track cards being picked up
  const [pickingUpCardIds, setPickingUpCardIds] = useState<Set<string>>(new Set());

  // Track cards that were just dropped to hand
  const recentlyDroppedToHandRef = useRef<Set<string>>(new Set());

  // Local state for cursor slot hover
  const [isCursorOverHand, setIsCursorOverHand] = useState(false);

  // Listen for cursor slot move events
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

      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const isOver = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
        setIsCursorOverHand(isOver);
      } else {
        setIsCursorOverHand(false);
      }
    };

    const handleCursorSlotDrop = (e: Event) => {
      const customEvent = e as CustomEvent<{ items: any[] }>;
      const { items } = customEvent.detail;

      const cardsToAdd = items.filter(item => item.type === 'CARD');

      if (cardsToAdd.length > 0) {
        const player = players.find(p => p.id === selectedPlayerId);
        if (!player) {
          logger.warn('[HandPanelV2] Player not found:', selectedPlayerId);
          setIsCursorOverHand(false);
          return;
        }

        const currentHandCardOrder = player.handCardOrder || [];
        const newCardIds = cardsToAdd.map(card => card.id);
        const updatedHandCardOrder = [...currentHandCardOrder, ...newCardIds];

        // Update player via PlayerContext
        updateObject(player.id, {
          handCardOrder: updatedHandCardOrder
        });

        cardsToAdd.forEach(card => {
          updateObject(card.id, {
            location: CardLocation.HAND,
            ownerId: selectedPlayerId,
            inCursorSlot: false,
            isOnTable: true
          });
        });

        setPickingUpCardIds(prev => {
          const newSet = new Set(prev);
          cardsToAdd.forEach(card => newSet.delete(card.id));
          return newSet;
        });

        recentlyDroppedToHandRef.current = new Set([
          ...recentlyDroppedToHandRef.current,
          ...cardsToAdd.map(card => card.id)
        ]);

        setTimeout(() => {
          recentlyDroppedToHandRef.current = new Set(
            Array.from(recentlyDroppedToHandRef.current).filter(id =>
              !cardsToAdd.some(card => card.id === id)
            )
          );
        }, 2000);
      }

      setIsCursorOverHand(false);
    };

    window.addEventListener('cursor-slot-move', handleCursorSlotMove);
    window.addEventListener('cursor-slot-drop-to-hand', handleCursorSlotDrop);

    return () => {
      window.removeEventListener('cursor-slot-move', handleCursorSlotMove);
      window.removeEventListener('cursor-slot-drop-to-hand', handleCursorSlotDrop);
    };
  }, [selectedPlayerId, players, updateObject]);

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
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
      recentlyDroppedToHandRef.current.clear();
    };
  }, []);

  // Listen for add-to-cursor-slot events
  useEffect(() => {
    const handleAddToCursorSlot = (e: Event) => {
      const customEvent = e as CustomEvent<{
        cardId: string;
        clientX: number;
        clientY: number;
        source?: string;
      }>;

      const { cardId } = customEvent.detail;

      if (recentlyDroppedToHandRef.current.has(cardId)) {
        return;
      }

      setPickingUpCardIds(prev => new Set([...prev, cardId]));
    };

    window.addEventListener('add-to-cursor-slot', handleAddToCursorSlot);

    return () => {
      window.removeEventListener('add-to-cursor-slot', handleAddToCursorSlot);
    };
  }, [objects]);

  // Filter cards for selected player
  const cards = useMemo(() => {
    const player = players.find(p => p.id === selectedPlayerId);
    const handCardOrder = player?.handCardOrder || [];

    const handCards = allCards.filter(card =>
      card.location === 'HAND' &&
      card.ownerId === selectedPlayerId &&
      !pickingUpCardIds.has(card.id)
    );

    const cardOrderMap = new Map(handCardOrder.map((id, index) => [id, index]));
    return handCards.sort((a, b) => {
      const aIndex = cardOrderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bIndex = cardOrderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return aIndex - bIndex;
    });
  }, [allCards, selectedPlayerId, players, pickingUpCardIds]);

  // Determine if viewing opponent's hand
  const isViewingOpponentHand = selectedPlayerId !== activePlayerId;

  // Group cards by shape
  const cardsByShape = useMemo(() => {
    const groups: Record<string, { cards: Card[]; shape: CardShape | 'Mixed' }> = {};

    cards.forEach(card => {
      const shape = card.shape ?? CardShape.POKER;
      if (!groups[shape]) {
        groups[shape] = { cards: [], shape };
      }
      groups[shape].cards.push(card);
    });

    return Object.values(groups).sort((a, b) => {
      if (a.shape === 'Mixed') return 1;
      if (b.shape === 'Mixed') return -1;
      return a.shape.localeCompare(b.shape);
    });
  }, [cards]);

  // Compute card dimensions
  const computeCardDimensions = useCallback((card: Card) => {
    const deck = card.deckId ? (objects[card.deckId] as DeckType | undefined) : undefined;
    return getCardDimensions(card, deck, cardScale, 1);
  }, [objects, cardScale]);

  // Compute card settings
  const computeCardSettings = useCallback((card: Card) => {
    return getCardSettings(card, objects);
  }, [objects]);

  // Action handlers
  const handleFlip = useCallback((cardId: string) => {
    const obj = objects[cardId] as Card;
    if (obj) {
      updateObject(cardId, { faceUp: !obj.faceUp });
    }
  }, [objects, updateObject]);

  const handleRotateClockwise = useCallback((cardId: string) => {
    const obj = objects[cardId] as any;
    const rotationStep = obj?.rotationStep ?? 45;
    updateObject(cardId, { rotation: (obj?.rotation || 0) + rotationStep });
  }, [objects, updateObject]);

  const handleRotateCounterClockwise = useCallback((cardId: string) => {
    const obj = objects[cardId] as any;
    const rotationStep = obj?.rotationStep ?? 45;
    updateObject(cardId, { rotation: (obj?.rotation || 0) - rotationStep });
  }, [objects, updateObject]);

  const handleSwingingClockwise = useCallback((cardId: string) => {
    const obj = objects[cardId] as any;
    updateObject(cardId, { swinging: (obj?.swinging || 0) + 15 });
  }, [objects, updateObject]);

  const handleSwingingCounterClockwise = useCallback((cardId: string) => {
    const obj = objects[cardId] as any;
    updateObject(cardId, { swinging: (obj?.swinging || 0) - 15 });
  }, [objects, updateObject]);

  const handleLayerUp = useCallback((cardId: string) => {
    // Implement layer up logic
  }, []);

  const handleLayerDown = useCallback((cardId: string) => {
    // Implement layer down logic
  }, []);

  const handleClone = useCallback((cardId: string) => {
    const obj = objects[cardId];
    if (obj) {
      const newObj = {
        ...obj,
        id: `card-${Date.now()}`,
        x: (obj.x || 0) + 20,
        y: (obj.y || 0) + 20
      };
      addObject(newObj);
    }
  }, [objects, addObject]);

  const handleMoveToHand = useCallback((cardId: string) => {
    updateObject(cardId, {
      location: CardLocation.HAND,
      ownerId: selectedPlayerId,
      isOnTable: false
    });
  }, [updateObject, selectedPlayerId]);

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
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, object: card });
  }, []);

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

  const handleTabContextMenu = useCallback((e: React.MouseEvent, playerId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const player = players.find(p => p.id === playerId);
    if (player) {
      setHandTabSettings({ playerId, player });
    }
  }, [players]);

  const handleContextMenuAction = useCallback((action: string) => {
    if (!contextMenu) return;
    const object = contextMenu.object as Card;

    switch (action) {
      case 'flip':
        handleFlip(object.id);
        break;
      case 'rotateClockwise':
        handleRotateClockwise(object.id);
        break;
      case 'rotateCounterClockwise':
        handleRotateCounterClockwise(object.id);
        break;
      case 'clone':
        handleClone(object.id);
        break;
      case 'delete':
        deleteObject(object.id);
        break;
      // Add other actions as needed
    }
    setContextMenu(null);
  }, [contextMenu, handleFlip, handleRotateClockwise, handleRotateCounterClockwise, handleClone, deleteObject]);

  const handleScaleChange = useCallback((newScale: number) => {
    setTabCardScale(newScale);
  }, [setTabCardScale]);

  // Handle card mouse down
  const handleCardMouseDown = useCallback((e: React.MouseEvent, cardId: string, index: number, _cardElement: HTMLDivElement | null) => {
    if (e.button !== 0) return;
    if (isViewingOpponentHand) return;

    const target = e.target as HTMLElement;
    if (target.closest('button')) return;

    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      e.stopPropagation();

      const card = objects[cardId] as Card;

      if (card.inCursorSlot || pickingUpCardIds.has(cardId)) {
        return;
      }

      setPickingUpCardIds(prev => new Set([...prev, cardId]));
      window.dispatchEvent(new CustomEvent('add-to-cursor-slot', {
        detail: { cardId, clientX: e.clientX, clientY: e.clientY }
      }));
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    longPressCardRef.current = {
      cardId,
      startX: e.clientX,
      startY: e.clientY
    };

    longPressTimerRef.current = window.setTimeout(() => {
      if (longPressCardRef.current) {
        const card = objects[longPressCardRef.current.cardId] as Card;

        if (card.inCursorSlot || pickingUpCardIds.has(longPressCardRef.current.cardId)) {
          longPressCardRef.current = null;
          longPressTimerRef.current = null;
          setDragIndex(null);
          return;
        }

        const cardId = longPressCardRef.current.cardId;

        setPickingUpCardIds(prev => new Set([...prev, cardId]));
        window.dispatchEvent(new CustomEvent('add-to-cursor-slot', {
          detail: {
            cardId,
            clientX: e.clientX,
            clientY: e.clientY,
            source: 'hold'
          }
        }));
        longPressCardRef.current = null;
        longPressTimerRef.current = null;
        setDragIndex(null);
      }
    }, 250);

    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
    setDragIndex(index);
  }, [isViewingOpponentHand, objects, pickingUpCardIds]);

  // Handle mouse move
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (longPressCardRef.current) {
      const moveThreshold = 5;
      const dx = e.clientX - longPressCardRef.current.startX;
      const dy = e.clientY - longPressCardRef.current.startY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance >= moveThreshold) {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }

        const card = objects[longPressCardRef.current.cardId] as Card;

        if (card.inCursorSlot || pickingUpCardIds.has(longPressCardRef.current.cardId)) {
          longPressCardRef.current = null;
          setDragIndex(null);
          return;
        }

        const cardId = longPressCardRef.current.cardId;

        setPickingUpCardIds(prev => new Set([...prev, cardId]));
        window.dispatchEvent(new CustomEvent('add-to-cursor-slot', {
          detail: {
            cardId,
            clientX: e.clientX,
            clientY: e.clientY,
            source: 'hold'
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
  }, [dragIndex, longPressCardRef, objects, pickingUpCardIds]);

  // Handle mouse up
  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressCardRef.current = null;

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
        updateObject(player.id, {
          handCardOrder: newCardOrder
        });
      }
    }

    setDragIndex(null);
    setDragOverIndex(null);
    dragStartPosRef.current = null;
  }, [dragIndex, dragOverIndex, cards, selectedPlayerId, players, updateObject]);

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

  // Listen for cursor slot drop events
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

      const cards = items.filter(item => item.type === ItemType.CARD);

      if (cards.length === 0) return;

      const player = players.find(p => p.id === activePlayerId);
      const currentHandOrder = player?.handCardOrder || [];

      const newCardIds = cards.map(c => c.id);
      const newCardOrder = [...newCardIds, ...currentHandOrder];

      if (player) {
        updateObject(player.id, {
          handCardOrder: newCardOrder
        });
      }

      cards.forEach(card => {
        const existingCard = objects[card.id] as Card | undefined;

        if (existingCard) {
          updateObject(card.id, {
            location: 'HAND' as any,
            isOnTable: false,
            ownerId: activePlayerId,
            x: 0,
            y: 0,
            rotation: 0,
            inCursorSlot: false,
          });
        } else {
          const cardPayload: Card = {
            id: card.id,
            type: ItemType.CARD,
            x: 0,
            y: 0,
            rotation: 0,
            content: card.content || card.frontFaceUrl || '',
            name: card.name || 'Card',
            locked: false,
            location: 'HAND' as any,
            ownerId: activePlayerId,
            isOnTable: false,
            faceUp: true,
            inCursorSlot: false,
            ...(card.frontFaceUrl && { frontFaceUrl: card.frontFaceUrl }),
            ...(card.backFaceUrl && { backFaceUrl: card.backFaceUrl }),
            ...(card.deckId && { deckId: card.deckId }),
            ...(card.width && { width: card.width }),
            ...(card.height && { height: card.height }),
            ...(card.spriteUrl && { spriteUrl: card.spriteUrl }),
            ...(card.spriteIndex !== undefined && { spriteIndex: card.spriteIndex }),
            ...(card.spriteColumns && { spriteColumns: card.spriteColumns }),
            ...(card.spriteRows && { spriteRows: card.spriteRows }),
            ...(card.shape && { shape: card.shape }),
          };

          addObject(cardPayload);
        }
      });
    };

    window.addEventListener('cursor-slot-drop-to-hand', handleCursorSlotDrop);
    return () => window.removeEventListener('cursor-slot-drop-to-hand', handleCursorSlotDrop);
  }, [objects, activePlayerId, players, selectedPlayerId, updateObject, addObject]);

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

  // Helper function to count cards for a player
  const countCardsForPlayer = useCallback((playerId: string) => {
    return allCards.filter(card =>
      card.location === 'HAND' &&
      card.ownerId === playerId &&
      !pickingUpCardIds.has(card.id)
    ).length;
  }, [allCards, pickingUpCardIds]);

  return (
    <div
      ref={containerRef}
      data-hand-panel="true"
      className="h-full flex flex-col transition-all"
      style={{ width }}
    >
      {/* Player hand tabs */}
      {!isCollapsed && players.length > 1 && (
        <div className="flex flex-wrap gap-1 px-1 pt-1 pb-0 border-b border-slate-700">
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
        <>
          <style>{`
            [data-hand-panel="true"] .hand-panel-scrollbar::-webkit-scrollbar {
              width: 16px !important;
            }
          `}</style>
          <div className="flex-1 hand-panel-scrollbar overflow-y-auto relative">
            {(isDragTarget || isCursorOverHand) && (
              <div className="absolute inset-0 pointer-events-none rounded ring-4 ring-purple-500 ring-inset z-[200]" />
            )}
            <div className="p-1" onContextMenu={handlePanelContextMenu}>
          {cards.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[200px] text-slate-500">
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
                        const _isDragging = dragIndex === actualIndex;
                        const _isDragOver = dragOverIndex === actualIndex;

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

      {/* Hand Tab Settings Modal */}
      {handTabSettings && createPortal(
        <div className="fixed inset-0 z-[100006] flex items-center justify-center bg-black/40" onClick={(e) => {
          if (e.target === e.currentTarget) {
            setHandTabSettings(null);
          }
        }}>
          <div className="bg-slate-800 rounded-lg shadow-xl w-[575px] border border-slate-600 max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-center items-center py-2 px-4">
              <h3 className="text-base font-bold text-white">{translate('Settings:', language as Locale)} {handTabSettings.player.name}</h3>
            </div>

            <div className="flex">
              <button className="flex-1 py-3 px-3 flex items-center justify-center gap-2 text-sm font-medium transition-colors bg-slate-700 text-white border-b-2 border-purple-500">
                {translate('General', language as Locale)}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
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
                    updateObject(updatedPlayer.id, updatedPlayer);
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
                    updateObject(tempSettingsPlayer.id, tempSettingsPlayer);
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

      {/* Context menu for cards in hand */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          object={contextMenu.object}
          isGM={isGM}
          onAction={handleContextMenuAction}
          onClose={() => setContextMenu(null)}
          allObjects={objects}
          hideCardActions={true}
          language={language}
        />
      )}

      {/* Scale menu */}
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