import { useEffect, useRef, useState } from 'react';
import { ItemType } from '../types';

interface CursorSlotMoveEvent {
  x: number;
  y: number;
  isOverMainMenu: boolean;
  hasCards: boolean;
  isDraggingCard?: boolean;
  items?: Array<{ type: string }>;
}

/**
 * Hook for detecting cursor slot hover over a specific element
 * Used by DeckComponent and HandPanelOptimized
 *
 * @param elementRef - Ref to the element to check hover against
 * @param options - Configuration options
 * @returns Object with isCursorOver state and event handlers
 */
export function useCursorSlotHover(
  elementRef: React.RefObject<HTMLElement>,
  options: {
    requireCards?: boolean;      // Only show hover when cards are in cursor slot
    requireDraggingCard?: boolean; // Only show hover when dragging a card specifically
    onDrop?: () => void;          // Callback when items are dropped
  } = {}
) {
  const { requireCards = true, requireDraggingCard = false, onDrop } = options;
  const [isCursorOver, setIsCursorOver] = useState(false);
  const onDropRef = useRef(onDrop);
  const justDroppedRef = useRef(false);

  // Keep callback ref in sync
  useEffect(() => {
    onDropRef.current = onDrop;
  }, [onDrop]);

  useEffect(() => {
    const handleCursorSlotMove = (e: Event) => {
      // If we just dropped, ignore move events for a short time to prevent race conditions
      if (justDroppedRef.current) {
        return;
      }

      const customEvent = e as CustomEvent<CursorSlotMoveEvent>;
      const { x, y, hasCards, isDraggingCard, items } = customEvent.detail;

      // Check if we should show hover based on options
      if (requireCards || requireDraggingCard) {
        // Determine if there are cards in the cursor slot
        // Check isDraggingCard first (from MainMenu event), fallback to items check
        const draggingCard = isDraggingCard !== undefined
          ? isDraggingCard
          : items ? items.some(item => item.type === ItemType.CARD) : hasCards;

        // If we require dragging cards and there are none, hide hover
        if (requireDraggingCard && !draggingCard) {
          setIsCursorOver(false);
          return;
        }

        // If we require any cards and there are none, hide hover
        if (requireCards && !draggingCard) {
          setIsCursorOver(false);
          return;
        }
      }

      // Check if cursor is over the element
      const element = elementRef.current;
      if (element) {
        const rect = element.getBoundingClientRect();
        const isOver = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
        setIsCursorOver(isOver);
      } else {
        setIsCursorOver(false);
      }
    };

    const handleCursorSlotDropped = () => {
      setIsCursorOver(false);
      onDropRef.current?.();

      // Set flag to ignore move events for a short time
      justDroppedRef.current = true;
      setTimeout(() => {
        justDroppedRef.current = false;
      }, 100);
    };

    window.addEventListener('cursor-slot-move', handleCursorSlotMove);
    window.addEventListener('cursor-slot-dropped', handleCursorSlotDropped);

    return () => {
      window.removeEventListener('cursor-slot-move', handleCursorSlotMove);
      window.removeEventListener('cursor-slot-dropped', handleCursorSlotDropped);
    };
  }, [elementRef, requireCards, requireDraggingCard]);

  return { isCursorOver, setIsCursorOver };
}

/**
 * Types for cursor slot events
 */
export type { CursorSlotMoveEvent };
