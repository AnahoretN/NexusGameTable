import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ItemType, Card as CardType, Token as TokenType, CardOrientation, Deck as DeckType, Randomizer, Counter, DiceObject, Board as BoardType, BattlefieldCell, NexusBoard, NexusCellObject, Drawing } from '../types';
import { renderCursorSlotItem } from './CursorSlotItems';

interface CursorSlotVisualizationProps {
  cursorSlot: (CardType | TokenType | DeckType | Randomizer | Counter | DiceObject | BoardType | BattlefieldCell | NexusBoard | NexusCellObject | Drawing)[];
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
  item: CardType | TokenType | DeckType | Randomizer | Counter | DiceObject | BoardType | BattlefieldCell | NexusBoard | NexusCellObject | Drawing;
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
  item: CardType | TokenType | DeckType | Randomizer | Counter | DiceObject | BoardType | BattlefieldCell | NexusBoard | NexusCellObject | Drawing,
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
  const isBattlefieldCell = item.type === ItemType.BATTLEFIELD_CELL;
  const isNexusBoard = item.type === ItemType.NEXUS_BOARD;
  const isNexusCell = item.type === ItemType.NEXUS_CELL;
  const isDrawing = item.type === ItemType.DRAWING;

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
  } else if (isBattlefieldCell || isNexusBoard || isNexusCell) {
    // Use default dimensions for board-related objects
    baseWidth = item.width ?? 100;
    baseHeight = item.height ?? 100;
  } else if (isDrawing) {
    // Drawings have their own dimensions
    baseWidth = item.width ?? 200;
    baseHeight = item.height ?? 200;
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
  zoom: _zoom,
  pixelsPerVU,
  state,
  getCardSettings,
}) => {
  const [heldItems, setHeldItems] = useState<HeldItem[]>([]);
  const cleanupTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const rafRef = useRef<number>();

  // IMPORTANT: Simply use cursorSlot directly - no filtering needed
  // The cursorSlot state is the source of truth
  const sortedSlot = useMemo(() => {
    if (cursorSlot.length === 0) return [];
    // Sort by originalZIndex in DESCENDING order to preserve layer relationships
    return [...cursorSlot].sort((a, b) => {
      const zA = (a as any).originalZIndex ?? a.zIndex ?? 0;
      const zB = (b as any).originalZIndex ?? b.zIndex ?? 0;
      return zB - zA; // Descending order - higher Z first
    });
  }, [cursorSlot]);

  // Remove cursorSlot - not needed anymore
  // const cursorSlot = useMemo(() => { ... }, [cursorSlot, state.objects]);

  // Track items currently being held/dragged
  useEffect(() => {
    // Capture items BEFORE they're removed from cursorSlot for transition animation
    // When cursorSlot goes from having items to being empty, preserve the last state
    if (cursorSlot.length > 0 && cursorPositionRef.current) {
      const position = cursorPositionRef.current;

      const newHeldItems: HeldItem[] = cursorSlot.map((item, index) => {
        const dimensions = calculateItemDimensions(item, getCardSettings, pixelsPerVU);

        // Use pixel offsets directly if available
        const clickOffsetX_PX = (item as any).clickOffsetX_PX;
        const clickOffsetY_PX = (item as any).clickOffsetY_PX;
        const itemWidth = dimensions.width;
        const itemHeight = dimensions.height;

        // Calculate absolute screen position for held items
        let finalX = position.x;
        let finalY = position.y;

        if (clickOffsetX_PX !== undefined && clickOffsetY_PX !== undefined) {
          // Use pixel offsets directly
          finalX = position.x - clickOffsetX_PX;
          finalY = position.y - clickOffsetY_PX;
        } else {
          // Fallback to old VU-based offsets
          const clickOffsetX = (item as any).clickOffsetX;
          const clickOffsetY = (item as any).clickOffsetY;

          if (clickOffsetX !== undefined && clickOffsetY !== undefined) {
            const offsetXPx = clickOffsetX * pixelsPerVU;
            const offsetYPx = clickOffsetY * pixelsPerVU;
            finalX = position.x - offsetXPx;
            finalY = position.y - offsetYPx;
          } else {
            finalX = position.x - (itemWidth / 2);
            finalY = position.y - (itemHeight / 2);
          }
        }

        return {
          item,
          x: finalX,
          y: finalY,
          width: dimensions.width,
          height: dimensions.height,
          isHorizontal: dimensions.isHorizontal,
          id: item.id,
          timestamp: Date.now(),
        };
      });

      setHeldItems(newHeldItems);
    }

    return () => {
      if (cleanupTimeoutRef.current) {
        clearTimeout(cleanupTimeoutRef.current);
      }
    };
  }, [cursorSlot, pixelsPerVU, getCardSettings]);

  // Check if items from heldItems are now visible on table (not in cursor slot anymore)
  // If so, remove them from heldItems immediately to prevent flicker
  // Only trigger when cursorSlot changes (items were dropped)
  useEffect(() => {
    if (heldItems.length === 0) return;

    // Check if any held item IDs are still in cursorSlot
    // If an item is no longer in cursorSlot, it means it was dropped
    const cursorSlotIds = new Set(cursorSlot.map(item => item.id));
    const stillHeld = heldItems.filter(heldItem => cursorSlotIds.has(heldItem.id));

    if (stillHeld.length !== heldItems.length) {
      setHeldItems(stillHeld);
    }
  }, [cursorSlot]); // Only depend on cursorSlot changes

  const hasItems = cursorSlot.length > 0 || heldItems.length > 0;
  if (!hasItems) return null;
  if (!cursorPosition && !cursorPositionRef.current && heldItems.length === 0) return null;

  // If no active items after filtering, don't render
  if (cursorSlot.length === 0 && heldItems.length === 0) return null;

  // Use current position for active slot, last known position for dropped items
  const position = cursorSlot.length > 0
    ? (cursorPositionRef.current ?? cursorPosition)
    : (heldItems[0]?.x ? { x: heldItems[0].x, y: heldItems[0].y } : null);

  if (!position && heldItems.length === 0) return null;

  const finalPosition = position || { x: 0, y: 0 };

  // Render inline (not through portal) to maintain coordinate system compatibility
  // The z-index is already very high (9999999999) which should be above most UI elements
  return (
    <>
      {/* Active cursor slot items - container at cursor position for relative offsets */}
      {cursorSlot.length > 0 && (
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
          {sortedSlot.map((item, sortedIndex) => {
            const dimensions = calculateItemDimensions(item, getCardSettings, pixelsPerVU);
            const { width, height } = dimensions;
            const isCard = item.type === ItemType.CARD;

            // Container is already positioned at cursor position, so offsetX/Y are offsets from (0,0) of container
            // Calculate offset from cursor to object's clicked point
            let offsetX = 0;
            let offsetY = 0;

            // Use pixel offsets directly if available
            const clickOffsetX_PX = (item as any).clickOffsetX_PX;
            const clickOffsetY_PX = (item as any).clickOffsetY_PX;

            if (clickOffsetX_PX !== undefined && clickOffsetY_PX !== undefined) {
              // clickOffsetX_PX is the distance from object's top-left to the clicked point
              // This is ALWAYS in screen pixels now (consistently from all sources)
              // CursorSlotVisualization is rendered at screen level (no zoom transform),
              // so we can use the offset directly

              // We want the clicked point to be at the cursor (container's origin)
              // So we offset the object by NEGATIVE offset
              offsetX = -clickOffsetX_PX;
              offsetY = -clickOffsetY_PX;
            } else {
              // Fallback: try old VU-based offsets
              const clickOffsetX = (item as any).clickOffsetX;
              const clickOffsetY = (item as any).clickOffsetY;

              if (clickOffsetX !== undefined && clickOffsetY !== undefined) {
                // Convert offset from virtual units to pixels
                offsetX = -(clickOffsetX * pixelsPerVU);
                offsetY = -(clickOffsetY * pixelsPerVU);
              } else {
                // No offset - center on cursor
                offsetX = -(width / 2);
                offsetY = -(height / 2);
              }
            }

            // Calculate stack offset based on sorted position
            const offsetFromFront = sortedIndex;
            const offsetAmount = Math.min(width, height) * 0.05;
            const stackOffsetX = offsetFromFront * offsetAmount;
            const stackOffsetY = offsetFromFront * offsetAmount;

            // Combine base offset with stack offset
            const finalOffsetX = offsetX + stackOffsetX;
            const finalOffsetY = offsetY + stackOffsetY;

            // Use sequential zIndex for proper stacking in visualization
            const totalItems = sortedSlot.length;
            const zIndex = isCard ? (totalItems - sortedIndex) : (totalItems - sortedIndex) + 1000;

            return renderCursorSlotItem(
              { item, width, height, offsetX: finalOffsetX, offsetY: finalOffsetY, zIndex, state },
              item.id
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
      )}

      {/* Render held items (transition after drop) - separate container with absolute positioning */}
      {cursorSlot.length === 0 && heldItems.map((heldItem, index) => {
        const { item, width, height, x, y } = heldItem;
        const isCard = item.type === ItemType.CARD;
        const zIndex = isCard ? index + 2000 : index + 3000;

        // For held items, we need absolute positioning since cursorSlot is empty
        // The stored x/y are already absolute screen positions
        return (
          <div
            key={`held-${item.id}`}
            className="fixed pointer-events-none"
            style={{
              left: x,
              top: y,
              userSelect: 'none',
              WebkitUserSelect: 'none',
              zIndex: 999999999, // MUCH higher than hand panel (999999)
            }}
          >
            {renderCursorSlotItem(
              { item, width, height, offsetX: 0, offsetY: 0, zIndex, state },
              `held-${item.id}`
            )}
          </div>
        );
      })}
    </>
  );
});
