import React, { memo } from 'react';
import { CursorSlotVisualization } from '../CursorSlotVisualization';
import { Card as CardType, Token as TokenType, Board as BoardType, Deck as DeckType, CardOrientation } from '../../types';

interface TabletopCursorSlotProps {
  cursorSlot: (CardType | TokenType | BoardType | DeckType)[];
  cursorPosition: { x: number; y: number } | null;
  cursorPositionRef: React.RefObject<{ x: number; y: number } | null>;
  pixelsPerVU: number;
  zoom: number;
  state: { objects: Record<string, any> };
}

export const TabletopCursorSlot = memo<TabletopCursorSlotProps>(({
  cursorSlot,
  cursorPosition,
  cursorPositionRef,
  pixelsPerVU,
  zoom,
  state
}) => {
  // Helper function to get card settings
  const getCardSettings = (card: CardType) => {
    const isHorizontal = card.isHorizontal ?? false;
    return {
      cardWidth: card.width,
      cardHeight: card.height,
      cardOrientation: isHorizontal ? CardOrientation.HORIZONTAL : CardOrientation.VERTICAL
    };
  };

  // Don't render if cursor slot is empty
  if (cursorSlot.length === 0) {
    return null;
  }

  return (
    <>
      {/* Cursor Slot Visualization - renders items following cursor */}
      <CursorSlotVisualization
        cursorSlot={cursorSlot}
        cursorPosition={cursorPosition}
        cursorPositionRef={cursorPositionRef}
        pixelsPerVU={pixelsPerVU}
        zoom={zoom}
        state={state}
        getCardSettings={getCardSettings}
      />
    </>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for TabletopCursorSlot
  return (
    prevProps.cursorSlot === nextProps.cursorSlot &&
    prevProps.cursorPosition === nextProps.cursorPosition &&
    prevProps.pixelsPerVU === nextProps.pixelsPerVU &&
    prevProps.zoom === nextProps.zoom &&
    prevProps.state === nextProps.state
  );
});

TabletopCursorSlot.displayName = 'TabletopCursorSlot';

// Export memoized component with custom comparison
export const TabletopCursorSlotMemo = memo(TabletopCursorSlot, (prevProps, nextProps) => {
  return (
    prevProps.cursorSlot === nextProps.cursorSlot &&
    prevProps.cursorPosition === nextProps.cursorPosition &&
    prevProps.pixelsPerVU === nextProps.pixelsPerVU &&
    prevProps.zoom === nextProps.zoom &&
    prevProps.state === nextProps.state
  );
});

TabletopCursorSlotMemo.displayName = 'TabletopCursorSlotMemo';