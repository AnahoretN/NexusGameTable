import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ItemType, Card as CardType, Token as TokenType, CardOrientation, Deck as DeckType, Randomizer, Counter, DiceObject, Board as BoardType } from '../types';
import { Card } from './Card';
import { SvgTokenShape } from './SvgTokenShape';
import { renderCursorSlotItem } from './CursorSlotItems';

interface CursorSlotVisualizationProps {
  cursorSlot: (CardType | TokenType | DeckType | Randomizer | Counter | DiceObject | BoardType)[];
  cursorPosition: { x: number; y: number } | null;
  cursorPositionRef: React.MutableRefObject<{ x: number; y: number } | null>;
  zoom: number;
  pixelsPerVU: number;
  state: { objects: Record<string, any> };
  getCardSettings: (card: CardType) => {
    cardWidth?: number;
    cardHeight?: number;
    cardOrientation?: CardOrientation;
  };
}

interface HeldItem {
  item: CardType | TokenType | DeckType | Randomizer | Counter | DiceObject | BoardType;
  x: number;
  y: number;
  width: number;
  height: number;
  isHorizontal: boolean;
  id: string;
  timestamp: number;
}

/**
 * Helper function to calculate item dimensions
 */
const calculateItemDimensions = (
  item: CardType | TokenType | DeckType | Randomizer | Counter | DiceObject | BoardType,
  getCardSettings: (card: CardType) => {
    cardWidth?: number;
    cardHeight?: number;
    cardOrientation?: CardOrientation;
  },
  pixelsPerVU: number
) => {
  const isCard = item.type === ItemType.CARD;
  const isDeck = item.type === ItemType.DECK;
  const isRandomizer = item.type === ItemType.RANDOMIZER;
  const isCounter = item.type === ItemType.COUNTER;
  const isDice = item.type === ItemType.DICE_OBJECT;
  const isBoard = item.type === ItemType.BOARD;

  let baseWidth = item.width ?? 50;
  let baseHeight = item.height ?? 50;
  let isHorizontal = false;

  if (isCard) {
    const cardSettings = getCardSettings(item as CardType);
    baseWidth = item.width ?? cardSettings.cardWidth ?? 63;
    baseHeight = item.height ?? cardSettings.cardHeight ?? 88;
    isHorizontal = cardSettings.cardOrientation === CardOrientation.HORIZONTAL;
  } else if (isDeck) {
    baseWidth = item.width ?? 100;
    baseHeight = item.height ?? 140;
  } else if (isRandomizer || isCounter || isDice) {
    baseWidth = item.width ?? 60;
    baseHeight = item.height ?? 60;
  } else if (isBoard) {
    baseWidth = item.width ?? 500;
    baseHeight = item.height ?? 500;
  }

  return {
    width: baseWidth * pixelsPerVU,
    height: baseHeight * pixelsPerVU,
    isHorizontal,
    baseWidth,
    baseHeight,
  };
};

/**
 * CursorSlotVisualization - renders items following the cursor
 * Shows stacked items with newest in front, older items offset down-right
 * Keeps items visible briefly after drop to prevent flicker during sync
 */
export const CursorSlotVisualization = React.memo<CursorSlotVisualizationProps>(({
  cursorSlot,
  cursorPosition,
  cursorPositionRef,
  zoom,
  pixelsPerVU,
  state,
  getCardSettings,
}) => {
  const [heldItems, setHeldItems] = useState<HeldItem[]>([]);
  const cleanupTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const rafRef = useRef<number>();

  // Memoize sorted cursor slot to avoid re-sorting on every render
  const sortedSlot = useMemo(() => {
    if (cursorSlot.length === 0) return [];
    // Sort by originalZIndex in DESCENDING order to preserve layer relationships
    // Items with higher originalZIndex (top) should be rendered first (on top in stack)
    return [...cursorSlot].sort((a, b) => {
      const zA = (a as any).originalZIndex ?? a.zIndex ?? 0;
      const zB = (b as any).originalZIndex ?? b.zIndex ?? 0;
      return zB - zA; // Descending order - higher Z first
    });
  }, [cursorSlot]);

  // Efficiently update heldItems positions when cursor moves (using requestAnimationFrame)
  useEffect(() => {
    if (cursorSlot.length === 0 || heldItems.length === 0) {
      return;
    }

    const updatePosition = () => {
      if (cursorPositionRef.current && heldItems.length > 0) {
        const position = cursorPositionRef.current;

        setHeldItems(prevItems => prevItems.map(item => ({
          ...item,
          x: position.x,
          y: position.y,
        })));
      }
      rafRef.current = undefined;
    };

    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(updatePosition);
    }

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = undefined;
      }
    };
  }, [cursorSlot.length, heldItems.length]);

  // Track items currently being held/dragged
  useEffect(() => {
    if (cursorSlot.length > 0 && cursorPositionRef.current) {
      const position = cursorPositionRef.current;

      const newHeldItems: HeldItem[] = cursorSlot.map((item) => {
        const dimensions = calculateItemDimensions(item, getCardSettings, pixelsPerVU);

        return {
          item,
          x: position.x,
          y: position.y,
          width: dimensions.width,
          height: dimensions.height,
          isHorizontal: dimensions.isHorizontal,
          id: item.id,
          timestamp: Date.now(),
        };
      });

      setHeldItems(newHeldItems);

      // Clear any pending cleanup
      if (cleanupTimeoutRef.current) {
        clearTimeout(cleanupTimeoutRef.current);
      }
    } else if (cursorSlot.length === 0 && heldItems.length > 0) {
      // Items were dropped - immediately check if they're visible on table
      // Don't use timeout - rely on state.objects check below instead
    }

    return () => {
      if (cleanupTimeoutRef.current) {
        clearTimeout(cleanupTimeoutRef.current);
      }
    };
  }, [cursorSlot, pixelsPerVU, getCardSettings]);

  // Check if items from heldItems are now visible on table (not in cursor slot anymore)
  // If so, remove them from heldItems immediately to prevent flicker
  useEffect(() => {
    if (heldItems.length > 0) {
      const stillInCursorSlot = heldItems.filter(heldItem => {
        const obj = state.objects[heldItem.id];
        // Keep showing if object doesn't exist yet OR is still in cursor slot
        // Hide immediately if object exists and is NOT in cursor slot anymore
        // Also hide if object is on table (isOnTable=true)
        return !obj || (obj.inCursorSlot && !obj.isOnTable);
      });

      if (stillInCursorSlot.length !== heldItems.length) {
        setHeldItems(stillInCursorSlot);
      }
    }
  }, [state.objects, heldItems]);

  const hasItems = cursorSlot.length > 0 || heldItems.length > 0;
  if (!hasItems) return null;
  if (!cursorPosition && !cursorPositionRef.current && heldItems.length === 0) return null;

  // Use current position for active slot, last known position for dropped items
  const position = cursorSlot.length > 0
    ? (cursorPositionRef.current ?? cursorPosition)
    : (heldItems[0]?.x ? { x: heldItems[0].x, y: heldItems[0].y } : null);

  if (!position && heldItems.length === 0) return null;

  const finalPosition = position || { x: 0, y: 0 };

  return (
    <div
      className="fixed pointer-events-none"
      style={{
        left: finalPosition.x,
        top: finalPosition.y,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        zIndex: 999999999, // MUCH higher than hand panel (999999)
        willChange: 'transform', // Hint to browser for optimization
      }}
    >
      {/* Render active cursor slot items */}
      {cursorSlot.length > 0 && sortedSlot.map((item, sortedIndex) => {
        const dimensions = calculateItemDimensions(item, getCardSettings, pixelsPerVU);
        const { width, height } = dimensions;
        const isCard = item.type === ItemType.CARD;

        // Calculate offset based on sorted position
        const offsetFromFront = sortedIndex;
        const offsetAmount = Math.min(width, height) * 0.05;
        const offsetX = offsetFromFront * offsetAmount;
        const offsetY = offsetFromFront * offsetAmount;

        // Use sequential zIndex for proper stacking in visualization
        const totalItems = sortedSlot.length;
        const zIndex = isCard ? (totalItems - sortedIndex) : (totalItems - sortedIndex) + 1000;

        return renderCursorSlotItem(
          { item, width, height, offsetX, offsetY, zIndex, state },
          item.id
        );
      })}

      {/* Render held items (transition after drop, no fade) */}
      {cursorSlot.length === 0 && heldItems.map((heldItem, index) => {
        const { item, width, height } = heldItem;
        const isCard = item.type === ItemType.CARD;
        const zIndex = isCard ? index + 2000 : index + 3000;

        return renderCursorSlotItem(
          { item, width, height, offsetX: 0, offsetY: 0, zIndex, state },
          `held-${item.id}`
        );
      })}

      {/* Stack counter badge - only show if more than 1 item */}
      {cursorSlot.length > 1 && (() => {
        const firstItem = cursorSlot[0];
        // Card dimensions already reflect orientation, no swap needed
        const badgeWidth = firstItem?.width ?? 63;
        const badgeHeight = firstItem?.height ?? 88;
        // Convert vu to pixels for badge positioning
        const badgeWidthPx = badgeWidth * pixelsPerVU;
        const badgeHeightPx = badgeHeight * pixelsPerVU;
        return (
          <div className="absolute" style={{
            left: `${badgeWidthPx / 2 + 4}px`,
            top: `-${badgeHeightPx / 2 + 4}px`,
          }}>
            <div className="bg-purple-600 text-white text-xs px-2 py-1 rounded-full whitespace-nowrap">
              {cursorSlot.length}
            </div>
          </div>
        );
      })()}
    </div>
  );
});
