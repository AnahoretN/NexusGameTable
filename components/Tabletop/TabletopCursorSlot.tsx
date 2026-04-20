import React, { memo } from 'react';
import { CursorSlotVisualization } from '../CursorSlotVisualization';
import { Card as CardType, Token as TokenType, Board as BoardType } from '../../types';

interface TabletopCursorSlotProps {
  cursorSlot: (CardType | TokenType | BoardType)[];
  cursorPosition: { x: number; y: number } | null;
  cursorPositionRef: React.RefObject<{ x: number; y: number } | null>;
  pixelsPerVU: number;
  zoom: number;
  currentTool: string;
  isShiftPressed: boolean;
  language: string;
}

export const TabletopCursorSlot = memo<TabletopCursorSlotProps>(({
  cursorSlot,
  cursorPosition,
  cursorPositionRef,
  pixelsPerVU,
  zoom,
  currentTool,
  isShiftPressed,
  language
}) => {
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
        currentTool={currentTool}
        isShiftPressed={isShiftPressed}
        language={language}
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
    prevProps.currentTool === nextProps.currentTool &&
    prevProps.isShiftPressed === nextProps.isShiftPressed &&
    prevProps.language === nextProps.language
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
    prevProps.currentTool === nextProps.currentTool &&
    prevProps.isShiftPressed === nextProps.isShiftPressed &&
    prevProps.language === nextProps.language
  );
});

TabletopCursorSlotMemo.displayName = 'TabletopCursorSlotMemo';