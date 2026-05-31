import React, { memo, useCallback } from 'react';
import { CursorSlotVisualization } from '../CursorSlotVisualization';
import { Card as CardType, Token as TokenType, Board as BoardType, Deck as DeckType, Counter, DiceObject, EffectTemplate, CardOrientation } from '../../types';

interface TabletopCursorSlotProps {
  cursorSlot: (CardType | TokenType | BoardType | DeckType | Counter | DiceObject | EffectTemplate)[];
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
  // Memoize getCardSettings to prevent infinite re-renders
  const getCardSettings = useCallback((card: CardType) => {
    const deck = card.deckId ? state.objects[card.deckId] as DeckType | undefined : undefined;
    const isHorizontal = card.isHorizontal ?? false;
    return {
      cardWidth: card.width ?? deck?.cardWidth,
      cardHeight: card.height ?? deck?.cardHeight,
      cardOrientation: isHorizontal ? CardOrientation.HORIZONTAL : CardOrientation.VERTICAL
    };
  }, [state.objects]);

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
  // 🔥 FIX: ALWAYS return false to prevent memo from blocking re-renders
  // We need to re-render on every parent update because cursorPositionRef.current changes
  return false;
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