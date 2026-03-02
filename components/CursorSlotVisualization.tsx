import React from 'react';
import { ItemType, Card as CardType, Token as TokenType, CardOrientation, Deck as DeckType } from '../types';
import { Card } from './Card';
import { SvgTokenShape } from './SvgTokenShape';
import { CARD_SHAPE_DIMS } from '../constants';

interface CursorSlotVisualizationProps {
  cursorSlot: (CardType | TokenType)[];
  cursorPosition: { x: number; y: number } | null;
  cursorPositionRef: React.MutableRefObject<{ x: number; y: number } | null>;
  zoom: number;
  state: { objects: Record<string, any> };
  getCardSettings: (card: CardType) => {
    cardWidth?: number;
    cardHeight?: number;
    cardOrientation?: CardOrientation;
  };
}

/**
 * CursorSlotVisualization - renders items following the cursor
 * Shows stacked items with newest in front, older items offset down-right
 */
export const CursorSlotVisualization: React.FC<CursorSlotVisualizationProps> = ({
  cursorSlot,
  cursorPosition,
  cursorPositionRef,
  zoom,
  state,
  getCardSettings,
}) => {
  if (cursorSlot.length === 0) return null;
  if (!cursorPosition && !cursorPositionRef.current) return null;

  const position = cursorPositionRef.current ?? cursorPosition;

  return (
    <div
      className="fixed pointer-events-none z-[100001]"
      style={{
        left: position!.x,
        top: position!.y,
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {/* Render stacked items - newest in front, older items offset */}
      {cursorSlot.map((item, index) => {
        const isCard = item.type === ItemType.CARD;

        // For cards, get settings from deck for proper dimensions
        let baseWidth = item.width ?? (isCard ? 63 : 50);
        let baseHeight = item.height ?? (isCard ? 88 : 50);
        let isHorizontal = (item as any).isHorizontal;

        if (isCard) {
          const cardSettings = getCardSettings(item as CardType);
          baseWidth = item.width ?? cardSettings.cardWidth ?? 63;
          baseHeight = item.height ?? cardSettings.cardHeight ?? 88;
          isHorizontal = cardSettings.cardOrientation === CardOrientation.HORIZONTAL;
        }

        // Scale by zoom to match in-game size
        let width = baseWidth * zoom;
        let height = baseHeight * zoom;

        // For horizontal cards, swap dimensions for display
        if (isHorizontal) {
          [width, height] = [height, width];
        }

        // Calculate offset from the BACK (newest element)
        // Newest element (highest index) has offset 0, older elements are offset down-right
        const slotIndex = (item as any).cursorSlotIndex ?? 0;
        const newestIndex = cursorSlot.length - 1;
        const offsetFromBack = Math.max(0, newestIndex - slotIndex);
        const offsetAmount = Math.min(width, height) * 0.05;
        const offsetX = offsetFromBack * offsetAmount;
        const offsetY = offsetFromBack * offsetAmount;
        // Cards at bottom (lower z-index), tokens at top (higher z-index)
        const zIndex = isCard ? index : index + 1000;

        if (isCard) {
          const card = item as CardType;
          const deck = card.deckId ? state.objects[card.deckId] as DeckType | undefined : undefined;

          return (
            <div
              key={`${card.id}-${index}`}
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

        // Token rendering
        const token = item as TokenType;

        return (
          <div
            key={`${token.id}-${index}`}
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

      {/* Stack counter badge - only show if more than 1 item */}
      {cursorSlot.length > 1 && (() => {
        const firstItem = cursorSlot[0];
        let badgeWidth = firstItem?.width ?? 63;
        let badgeHeight = firstItem?.height ?? 88;
        // For horizontal cards, swap dimensions to match visual card size
        if (firstItem?.type === ItemType.CARD && (firstItem as any).isHorizontal) {
          [badgeWidth, badgeHeight] = [badgeHeight, badgeWidth];
        }
        return (
          <div className="absolute" style={{
            left: `${(badgeWidth * zoom) / 2 + 4}px`,
            top: `${-(badgeHeight * zoom) / 2 - 4}px`,
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
