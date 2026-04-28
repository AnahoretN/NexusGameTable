/**
 * VirtualizedHandList - Optimized horizontal list for card hands
 * Uses @tanstack/react-virtual for smooth horizontal scrolling
 *
 * Performance benefits:
 * - Renders only visible cards in hand
 * - Smooth horizontal scrolling even with 100+ cards
 * - Reduces memory usage significantly
 * - Maintains 60fps performance
 */

import React, { useRef, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Card as CardType } from '../types';

interface VirtualizedHandListProps {
  cards: CardType[];
  pixelsPerVU: number;
  className?: string;
  // Card dimensions for virtualization
  cardWidth: number;
  cardHeight: number;
  // Spacing between cards
  cardSpacing?: number;
  // Render function for each card
  renderCard: (card: CardType, index: number) => React.ReactNode;
  // When true, cards are rendered vertically instead of horizontally
  vertical?: boolean;
}

export const VirtualizedHandList: React.FC<VirtualizedHandListProps> = ({
  cards,
  pixelsPerVU,
  className = '',
  cardWidth,
  cardHeight,
  cardSpacing = 10,
  renderCard,
  vertical = false,
}) => {
  const parentRef = useRef<HTMLDivElement>(null);

  // Calculate actual dimensions with pixelsPerVU
  const actualCardWidth = cardWidth * pixelsPerVU;
  const actualCardHeight = cardHeight * pixelsPerVU;
  const actualSpacing = cardSpacing * pixelsPerVU;

  // Calculate total size (including spacing)
  const getItemSize = useMemo(() => {
    const size = vertical ? actualCardHeight : actualCardWidth;
    return size + actualSpacing;
  }, [actualCardWidth, actualCardHeight, actualSpacing, vertical]);

  const totalSize = getItemSize * cards.length;

  // Create virtualizer for horizontal or vertical scrolling
  const virtualizer = useVirtualizer({
    count: cards.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => getItemSize,
    overscan: 3, // Pre-render 3 items before/after viewport
    horizontal: !vertical, // true for horizontal scrolling
  });

  // If no cards, show empty state
  if (cards.length === 0) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <div className="text-slate-500 text-sm">Empty hand</div>
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className={className}
      style={{
        width: '100%',
        height: '100%',
        overflow: vertical ? 'auto' : 'auto',
        overflowX: vertical ? 'hidden' : 'auto',
        overflowY: vertical ? 'auto' : 'hidden',
        position: 'relative',
      }}
      data-scrollable="true"
    >
      <div
        style={{
          [vertical ? 'height' : 'width']: `${totalSize}px`,
          position: 'relative',
          [vertical ? 'width' : 'height']: vertical ? '100%' : '100%',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const card = cards[virtualItem.index];

          return (
            <div
              key={card.id}
              data-index={virtualItem.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                [vertical ? 'height' : 'width']: `${virtualItem.size}px`,
                [vertical ? 'width' : 'height']: vertical ? '100%' : '100%',
                transform: vertical
                  ? `translateY(${virtualItem.start}px)`
                  : `translateX(${virtualItem.start}px)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {renderCard(card, virtualItem.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * Hook to determine if hand list should be virtualized
 * and get optimal configuration
 */
export function useVirtualizedHandList(cardCount: number) {
  // TEMPORARILY DISABLED to debug cards disappearing issue
  const shouldVirtualize = false; // cardCount > 15; // Virtualize if more than 15 cards

  return {
    shouldVirtualize,
    cardCount,
    recommendedCardSpacing: shouldVirtualize ? 10 : 15,
    overscan: 3,
  };
}

/**
 * Non-virtualized version for small hands (better performance for < 15 cards)
 */
interface SimpleHandListProps {
  cards: CardType[];
  pixelsPerVU: number;
  className?: string;
  cardWidth: number;
  cardHeight: number;
  cardSpacing?: number;
  renderCard: (card: CardType, index: number) => React.ReactNode;
  vertical?: boolean;
}

export const SimpleHandList: React.FC<SimpleHandListProps> = ({
  cards,
  pixelsPerVU,
  className = '',
  cardWidth,
  cardHeight,
  cardSpacing = 15,
  renderCard,
  vertical = false,
}) => {
  const actualSpacing = cardSpacing * pixelsPerVU;

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: vertical ? 'column' : 'row',
        gap: `${actualSpacing}px`,
        overflow: vertical ? 'auto' : 'auto',
        overflowX: vertical ? 'hidden' : 'auto',
        overflowY: vertical ? 'auto' : 'hidden',
        padding: '10px',
      }}
      data-scrollable="true"
    >
      {cards.map((card, index) => renderCard(card, index))}
    </div>
  );
};
