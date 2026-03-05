import React, { useState, useEffect, useRef } from 'react';
import { ItemType, Card as CardType, Token as TokenType, CardOrientation, Deck as DeckType } from '../types';
import { Card } from './Card';
import { SvgTokenShape } from './SvgTokenShape';

interface CursorSlotVisualizationProps {
  cursorSlot: (CardType | TokenType)[];
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
  item: CardType | TokenType;
  x: number;
  y: number;
  width: number;
  height: number;
  isHorizontal: boolean;
  id: string;
  timestamp: number;
}

/**
 * CursorSlotVisualization - renders items following the cursor
 * Shows stacked items with newest in front, older items offset down-right
 * Keeps items visible briefly after drop to prevent flicker during sync
 */
export const CursorSlotVisualization: React.FC<CursorSlotVisualizationProps> = ({
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

  // Track items currently being held/dragged
  useEffect(() => {
    if (cursorSlot.length > 0 && cursorPositionRef.current) {
      const position = cursorPositionRef.current;

      const newHeldItems: HeldItem[] = cursorSlot.map((item) => {
        const isCard = item.type === ItemType.CARD;
        let baseWidth = item.width ?? (isCard ? 63 : 50);
        let baseHeight = item.height ?? (isCard ? 88 : 50);
        let isHorizontal = false;

        if (isCard) {
          const cardSettings = getCardSettings(item as CardType);
          baseWidth = item.width ?? cardSettings.cardWidth ?? 63;
          baseHeight = item.height ?? cardSettings.cardHeight ?? 88;
          isHorizontal = cardSettings.cardOrientation === CardOrientation.HORIZONTAL;
        }

        // Convert vu to pixels
        let width = baseWidth * pixelsPerVU;
        let height = baseHeight * pixelsPerVU;

        if (isHorizontal) {
          [width, height] = [height, width];
        }

        return {
          item,
          x: position.x,
          y: position.y,
          width,
          height,
          isHorizontal,
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
      // Items were dropped - keep them visible for a brief moment to sync with table render
      if (cleanupTimeoutRef.current) {
        clearTimeout(cleanupTimeoutRef.current);
      }

      // Keep visible for 100ms then clear - no animation, just timing
      cleanupTimeoutRef.current = setTimeout(() => {
        setHeldItems([]);
      }, 100);
    }

    return () => {
      if (cleanupTimeoutRef.current) {
        clearTimeout(cleanupTimeoutRef.current);
      }
    };
  }, [cursorSlot, cursorPositionRef.current, pixelsPerVU, getCardSettings]);

  // Check if items from heldItems are now visible on table (not in cursor slot anymore)
  // If so, remove them from heldItems immediately
  useEffect(() => {
    if (heldItems.length > 0 && cursorSlot.length === 0) {
      const stillInCursorSlot = heldItems.filter(heldItem => {
        const obj = state.objects[heldItem.id];
        // Keep showing if object doesn't exist yet OR is still in cursor slot
        return !obj || obj.inCursorSlot;
      });

      if (stillInCursorSlot.length !== heldItems.length) {
        setHeldItems(stillInCursorSlot);
      }
    }
  }, [state.objects, heldItems, cursorSlot.length]);

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
      className="fixed pointer-events-none z-[100001]"
      style={{
        left: finalPosition.x,
        top: finalPosition.y,
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {/* Render active cursor slot items */}
      {cursorSlot.length > 0 && cursorSlot.map((item, index) => {
        const isCard = item.type === ItemType.CARD;

        let baseWidth = item.width ?? (isCard ? 63 : 50);
        let baseHeight = item.height ?? (isCard ? 88 : 50);
        let isHorizontal = (item as any).isHorizontal;

        if (isCard) {
          const cardSettings = getCardSettings(item as CardType);
          baseWidth = item.width ?? cardSettings.cardWidth ?? 63;
          baseHeight = item.height ?? cardSettings.cardHeight ?? 88;
          isHorizontal = cardSettings.cardOrientation === CardOrientation.HORIZONTAL;
        }

        // Convert vu to pixels
        let width = baseWidth * pixelsPerVU;
        let height = baseHeight * pixelsPerVU;

        if (isHorizontal) {
          [width, height] = [height, width];
        }

        const slotIndex = (item as any).cursorSlotIndex ?? 0;
        const newestIndex = cursorSlot.length - 1;
        const offsetFromBack = Math.max(0, newestIndex - slotIndex);
        const offsetAmount = Math.min(width, height) * 0.05;
        const offsetX = offsetFromBack * offsetAmount;
        const offsetY = offsetFromBack * offsetAmount;
        const zIndex = isCard ? index : index + 1000;

        if (isCard) {
          const card = item as CardType;
          const deck = card.deckId ? state.objects[card.deckId] as DeckType | undefined : undefined;

          return (
            <div
              key={card.id}
              className="absolute"
              style={{
                left: 0,
                top: 0,
                width: `${width}px`,
                height: `${height}px`,
                transform: `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px)`,
                zIndex,
                pointerEvents: 'none',
              }}
            >
              <Card
                card={card}
                overrideWidth={width}
                overrideHeight={height}
                cardWidth={deck?.cardWidth}
                cardHeight={deck?.cardHeight}
                cardOrientation={deck?.cardOrientation}
                cardNamePosition={deck?.cardNamePosition}
                disableRotationTransform={true}
                disablePointerEvents={true}
                showActionButtons={false}
                skipTooltip={true}
                deckSpriteConfig={deck?.spriteConfig}
                deckShowTooltipImage={deck?.showTooltipImage}
                deckTooltipScale={deck?.tooltipScale}
              />
            </div>
          );
        }

        const token = item as TokenType;

        return (
          <div
            key={token.id}
            className="absolute"
            style={{
              left: 0,
              top: 0,
              transform: `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px)`,
              width: `${width}px`,
              height: `${height}px`,
              zIndex,
              pointerEvents: 'none',
            }}
          >
            <SvgTokenShape
              shape={token.shape}
              width={width}
              height={height}
              color={token.color || '#34495e'}
              content={token.content}
              rotation={0}
              borderWidth={token.borderWidth ?? 3}
              borderColor={(token as any).borderColor || 'white'}
              opacity={token.opacity ?? 100}
              borderOpacity={token.borderOpacity ?? 100}
              showThickness={true}
              tokenName={(token as any).showName || ((token as any).archetypeId && (state.objects[(token as any).archetypeId] as any)?.showName) ? token.name : undefined}
            />
          </div>
        );
      })}

      {/* Render held items (transition after drop, no fade) */}
      {cursorSlot.length === 0 && heldItems.map((heldItem, index) => {
        const { item, width, height } = heldItem;
        const isCard = item.type === ItemType.CARD;
        const zIndex = isCard ? index + 2000 : index + 3000;

        if (isCard) {
          const card = item as CardType;
          const deck = card.deckId ? state.objects[card.deckId] as DeckType | undefined : undefined;

          return (
            <div
              key={`held-${card.id}`}
              className="absolute"
              style={{
                left: 0,
                top: 0,
                width: `${width}px`,
                height: `${height}px`,
                transform: `translate(-50%, -50%)`,
                zIndex,
                pointerEvents: 'none',
              }}
            >
              <Card
                card={card}
                overrideWidth={width}
                overrideHeight={height}
                cardWidth={deck?.cardWidth}
                cardHeight={deck?.cardHeight}
                cardOrientation={heldItem.isHorizontal ? deck?.cardOrientation : undefined}
                cardNamePosition={deck?.cardNamePosition}
                disableRotationTransform={true}
                disablePointerEvents={true}
                showActionButtons={false}
                skipTooltip={true}
                deckSpriteConfig={deck?.spriteConfig}
                deckShowTooltipImage={deck?.showTooltipImage}
                deckTooltipScale={deck?.tooltipScale}
              />
            </div>
          );
        }

        const token = item as TokenType;

        return (
          <div
            key={`held-${token.id}`}
            className="absolute"
            style={{
              left: 0,
              top: 0,
              transform: `translate(-50%, -50%)`,
              width: `${width}px`,
              height: `${height}px`,
              zIndex,
              pointerEvents: 'none',
            }}
          >
            <SvgTokenShape
              shape={token.shape}
              width={width}
              height={height}
              color={token.color || '#34495e'}
              content={token.content}
              rotation={0}
              borderWidth={token.borderWidth ?? 3}
              borderColor={(token as any).borderColor || 'white'}
              opacity={token.opacity ?? 100}
              borderOpacity={token.borderOpacity ?? 100}
              showThickness={true}
              tokenName={(token as any).showName || ((token as any).archetypeId && (state.objects[(token as any).archetypeId] as any)?.showName) ? token.name : undefined}
            />
          </div>
        );
      })}

      {/* Stack counter badge - only show if more than 1 item */}
      {cursorSlot.length > 1 && (() => {
        const firstItem = cursorSlot[0];
        let badgeWidth = firstItem?.width ?? 63;
        let badgeHeight = firstItem?.height ?? 88;
        if (firstItem?.type === ItemType.CARD && (firstItem as any).isHorizontal) {
          [badgeWidth, badgeHeight] = [badgeHeight, badgeWidth];
        }
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
};
