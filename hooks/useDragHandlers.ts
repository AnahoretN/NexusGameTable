import { useRef, useCallback } from 'react';
import { Coordinates } from '../types';

interface DragState {
  draggingId: string | null;
  dragStartPos: Coordinates;
  dragOffset: Coordinates;
}

interface UseDragHandlersOptions {
  onDragStart?: (id: string, e: React.MouseEvent) => void;
  onDragMove?: (id: string, x: number, y: number, e: MouseEvent) => void;
  onDragEnd?: (id: string) => void;
  onDragCancel?: () => void;
}

interface UseDragHandlersResult {
  isDragging: boolean;
  draggingId: string | null;
  startDrag: (id: string, e: React.MouseEvent, offset?: Coordinates) => void;
  endDrag: () => void;
  cancelDrag: () => void;
  getDragPosition: (e: MouseEvent) => Coordinates;
}

/**
 * Custom hook for managing drag state and handlers
 */
export function useDragHandlers(options: UseDragHandlersOptions = {}): UseDragHandlersResult {
  const {
    onDragStart,
    onDragMove,
    onDragEnd,
    onDragCancel
  } = options;

  const dragStateRef = useRef<DragState>({
    draggingId: null,
    dragStartPos: { x: 0, y: 0 },
    dragOffset: { x: 0, y: 0 }
  });

  const isDragging = dragStateRef.current.draggingId !== null;
  const draggingId = dragStateRef.current.draggingId;

  const startDrag = useCallback(
    (id: string, e: React.MouseEvent, offset?: Coordinates) => {
      dragStateRef.current = {
        draggingId: id,
        dragStartPos: { x: e.clientX, y: e.clientY },
        dragOffset: offset || { x: 0, y: 0 }
      };

      onDragStart?.(id, e);
    },
    [onDragStart]
  );

  const endDrag = useCallback(() => {
    const id = dragStateRef.current.draggingId;
    if (id) {
      dragStateRef.current = {
        draggingId: null,
        dragStartPos: { x: 0, y: 0 },
        dragOffset: { x: 0, y: 0 }
      };
      onDragEnd?.(id);
    }
  }, [onDragEnd]);

  const cancelDrag = useCallback(() => {
    dragStateRef.current = {
      draggingId: null,
      dragStartPos: { x: 0, y: 0 },
      dragOffset: { x: 0, y: 0 }
    };
    onDragCancel?.();
  }, [onDragCancel]);

  const getDragPosition = useCallback(
    (e: MouseEvent): Coordinates => {
      return {
        x: e.clientX - dragStateRef.current.dragStartPos.x,
        y: e.clientY - dragStateRef.current.dragStartPos.y
      };
    },
    []
  );

  return {
    isDragging,
    draggingId,
    startDrag,
    endDrag,
    cancelDrag,
    getDragPosition
  };
}

/**
 * Check if mouse moved enough to consider it a drag (vs a click)
 */
export function isDragMovement(startX: number, startY: number, currentX: number, currentY: number, threshold: number = 5): boolean {
  const dx = currentX - startX;
  const dy = currentY - startY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return distance >= threshold;
}

/**
 * Calculate drag offset from cursor to object origin
 */
export function calculateDragOffset(
  clientX: number,
  clientY: number,
  objectX: number,
  objectY: number
): Coordinates {
  return {
    x: clientX - objectX,
    y: clientY - objectY
  };
}
