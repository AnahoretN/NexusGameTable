import { useRef, useCallback } from 'react';

export interface DragState {
  isDragging: boolean;
  cardId: string | null;
  source: 'hand' | 'tabletop' | null;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  // Offset from cursor to card's top-left corner (where user grabbed the card)
  offsetX: number;
  offsetY: number;
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
  offsetX: 0,
  offsetY: 0,
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
    e: MouseEvent,
    offsetX: number = 0,
    offsetY: number = 0,
    overrideClientX?: number,
    overrideClientY?: number
  ) => {
    if (globalDragState.isDragging) return;

    dragIdRef.current = cardId;

    // Use override coordinates if provided (from React event which is more reliable),
    // otherwise fall back to native event coordinates
    const startX = overrideClientX ?? e.clientX;
    const startY = overrideClientY ?? e.clientY;

    console.log('[useCardDrag] startDrag:', {
      cardId,
      source,
      overrideClientX,
      overrideClientY,
      startX,
      startY,
      nativeScreenX: e.screenX,
      nativeScreenY: e.screenY,
      nativeClientX: e.clientX,
      nativeClientY: e.clientY,
    });

    globalDragState = {
      isDragging: true,
      cardId,
      source,
      startX: startX,
      startY: startY,
      currentX: startX,
      currentY: startY,
      offsetX,
      offsetY,
    };

    listeners.forEach(listener => listener({ ...globalDragState }));

    onGlobalMouseMove = handleMouseMove;
    onGlobalMouseUp = handleMouseUp;

    window.addEventListener('mousemove', onGlobalMouseMove);
    window.addEventListener('mouseup', onGlobalMouseUp);

    // Dispatch card-drag-start event with offset
    window.dispatchEvent(new CustomEvent('card-drag-start', {
      detail: {
        cardId,
        source,
        offsetX,
        offsetY,
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
      offsetX: 0,
      offsetY: 0,
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

  // Accumulate position using movementX/movementY
  // These represent the delta from the last mousemove event and are more reliable
  const currentX = globalDragState.currentX + e.movementX;
  const currentY = globalDragState.currentY + e.movementY;

  globalDragState.currentX = currentX;
  globalDragState.currentY = currentY;

  listeners.forEach(listener => listener({ ...globalDragState }));

  window.dispatchEvent(new CustomEvent('card-drag-move', {
    detail: {
      cardId: globalDragState.cardId,
      source: globalDragState.source,
      x: currentX,
      y: currentY,
      offsetX: globalDragState.offsetX,
      offsetY: globalDragState.offsetY,
    }
  }));
}

function handleMouseUp(e: MouseEvent) {
  if (!globalDragState.isDragging) return;

  const wasDragging = globalDragState.isDragging;
  const droppedCardId = globalDragState.cardId;
  const source = globalDragState.source;

  // Use currentX/currentY from globalDragState directly
  // These have been continuously updated by handleMouseMove with reliable coordinates
  const x = globalDragState.currentX;
  const y = globalDragState.currentY;
  const offsetX = globalDragState.offsetX;
  const offsetY = globalDragState.offsetY;

  console.log('[useCardDrag] handleMouseUp:', {
    cardId: droppedCardId,
    source,
    startX: globalDragState.startX,
    startY: globalDragState.startY,
    currentX: x,
    currentY: y,
    offsetX,
    offsetY,
    eventScreenX: e.screenX,
    eventScreenY: e.screenY,
    eventClientX: e.clientX,
    eventClientY: e.clientY,
  });

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
    offsetX: 0,
    offsetY: 0,
  };

  listeners.forEach(listener => listener({ ...globalDragState }));

  window.dispatchEvent(new CustomEvent('card-drag-end', {
    detail: { wasDragging, cardId: droppedCardId, source, x, y, offsetX, offsetY }
  }));
}

export const cardDragAPI = {
  isDragging: () => globalDragState.isDragging,
  getState: () => ({ ...globalDragState }),
};
