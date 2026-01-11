import { useRef, useCallback } from 'react';

export interface DragState {
  isDragging: boolean;
  cardId: string | null;
  source: 'hand' | 'tabletop' | null;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

// Global drag state shared across components
let globalDragState: DragState = {
  isDragging: false,
  cardId: null,
  source: null,
  startX: 0,
  startY: 0,
  currentX: 0,
  currentY: 0,
};

let onGlobalMouseMove: ((e: MouseEvent) => void) | null = null;
let onGlobalMouseUp: ((e: MouseEvent) => void) | null = null;

const listeners: Set<(state: DragState) => void> = new Set();

/**
 * Simple hook for card drag operations across components
 */
export function useCardDrag() {
  const dragIdRef = useRef<string | null>(null);

  const startDrag = useCallback((
    cardId: string,
    source: 'hand' | 'tabletop',
    e: MouseEvent
  ) => {
    if (globalDragState.isDragging) return;

    dragIdRef.current = cardId;
    globalDragState = {
      isDragging: true,
      cardId,
      source,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
    };

    listeners.forEach(listener => listener({ ...globalDragState }));

    onGlobalMouseMove = handleMouseMove;
    onGlobalMouseUp = handleMouseUp;

    window.addEventListener('mousemove', onGlobalMouseMove);
    window.addEventListener('mouseup', onGlobalMouseUp);

    // Dispatch card-drag-start event
    window.dispatchEvent(new CustomEvent('card-drag-start', {
      detail: {
        cardId,
        source,
      }
    }));

    return cardId;
  }, []);

  const endDrag = useCallback(() => {
    if (!globalDragState.isDragging) return;

    const wasDragging = globalDragState.isDragging;
    const droppedCardId = globalDragState.cardId;
    const source = globalDragState.source;

    if (onGlobalMouseMove) {
      window.removeEventListener('mousemove', onGlobalMouseMove);
      onGlobalMouseMove = null;
    }
    if (onGlobalMouseUp) {
      window.removeEventListener('mouseup', onGlobalMouseUp);
      onGlobalMouseUp = null;
    }

    globalDragState = {
      isDragging: false,
      cardId: null,
      source: null,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
    };

    dragIdRef.current = null;

    listeners.forEach(listener => listener({ ...globalDragState }));

    return { wasDragging, cardId: droppedCardId, source };
  }, []);

  const subscribe = useCallback((callback: (state: DragState) => void) => {
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  }, []);

  const getState = useCallback((): DragState => {
    return { ...globalDragState };
  }, []);

  const isDragging = useCallback((): boolean => {
    return globalDragState.isDragging;
  }, []);

  return {
    startDrag,
    endDrag,
    subscribe,
    getState,
    isDragging,
  };
}

function handleMouseMove(e: MouseEvent) {
  if (!globalDragState.isDragging) return;

  globalDragState.currentX = e.clientX;
  globalDragState.currentY = e.clientY;

  listeners.forEach(listener => listener({ ...globalDragState }));

  window.dispatchEvent(new CustomEvent('card-drag-move', {
    detail: {
      cardId: globalDragState.cardId,
      source: globalDragState.source,
      x: e.clientX,
      y: e.clientY,
    }
  }));
}

function handleMouseUp(e: MouseEvent) {
  if (!globalDragState.isDragging) return;

  const wasDragging = globalDragState.isDragging;
  const droppedCardId = globalDragState.cardId;
  const source = globalDragState.source;
  const x = e.clientX;
  const y = e.clientY;

  if (onGlobalMouseMove) {
    window.removeEventListener('mousemove', onGlobalMouseMove);
    onGlobalMouseMove = null;
  }
  if (onGlobalMouseUp) {
    window.removeEventListener('mouseup', onGlobalMouseUp);
    onGlobalMouseUp = null;
  }

  globalDragState = {
    isDragging: false,
    cardId: null,
    source: null,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
  };

  listeners.forEach(listener => listener({ ...globalDragState }));

  window.dispatchEvent(new CustomEvent('card-drag-end', {
    detail: { wasDragging, cardId: droppedCardId, source, x, y }
  }));
}

export const cardDragAPI = {
  isDragging: () => globalDragState.isDragging,
  getState: () => ({ ...globalDragState }),
};
