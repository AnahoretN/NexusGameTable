import { useRef, useCallback, useEffect } from 'react';

export interface DragData {
  type: 'card' | 'token' | 'deck' | 'dice' | 'pile';
  id: string;
  source: 'tabletop' | 'hand' | 'searchDeck' | 'topDeck' | 'contextMenu';
  // Additional data based on type
  cardData?: {
    location?: string;
    ownerId?: string;
    deckId?: string;
    faceUp?: boolean;
  };
}

export interface DropZone {
  id: string;
  type: 'tabletop' | 'hand' | 'deck' | 'pile';
  element: HTMLElement;
  onDrop: (data: DragData, position: { x: number; y: number }, dropIndex?: number) => void;
  onDragOver?: (data: DragData, position: { x: number; y: number }) => boolean;
  onDragLeave?: () => void;
}

interface DragState {
  isDragging: boolean;
  data: DragData | null;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  dragElement: HTMLElement | null;
  activeDropZone: DropZone | null;
}

// Global drag state
let globalDragState: DragState = {
  isDragging: false,
  data: null,
  startX: 0,
  startY: 0,
  currentX: 0,
  currentY: 0,
  dragElement: null,
  activeDropZone: null,
};

let dropZones: Map<string, DropZone> = new Map();
let dragIdCounter = 0;

// Global mouse handlers
let onGlobalMouseMove: ((e: MouseEvent) => void) | null = null;
let onGlobalMouseUp: ((e: MouseEvent) => void) | null = null;

/**
 * Hook for unified drag-and-drop system across the entire application
 */
export function useGlobalDrag() {
  const currentDragIdRef = useRef<string | null>(null);

  // Start a drag operation
  const startDrag = useCallback((
    data: DragData,
    element: HTMLElement,
    e: MouseEvent
  ): string => {
    if (globalDragState.isDragging) {
      return currentDragIdRef.current!;
    }

    const dragId = `drag-${dragIdCounter++}`;
    currentDragIdRef.current = dragId;

    globalDragState = {
      isDragging: true,
      data,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      dragElement: element,
      activeDropZone: null,
    };

    // Create drag preview
    createDragPreview(element, e.clientX, e.clientY);

    // Set up global handlers
    onGlobalMouseMove = handleMouseMove;
    onGlobalMouseUp = handleMouseUp;

    window.addEventListener('mousemove', onGlobalMouseMove);
    window.addEventListener('mouseup', onGlobalMouseUp);

    // Dispatch drag start event for backward compatibility
    window.dispatchEvent(new CustomEvent('global-drag-start', {
      detail: { data, dragId }
    }));

    return dragId;
  }, []);

  // End current drag operation
  const endDrag = useCallback(() => {
    if (!globalDragState.isDragging) return;

    // Clean up
    removeDragPreview();

    if (onGlobalMouseMove) {
      window.removeEventListener('mousemove', onGlobalMouseMove);
      onGlobalMouseMove = null;
    }
    if (onGlobalMouseUp) {
      window.removeEventListener('mouseup', onGlobalMouseUp);
      onGlobalMouseUp = null;
    }

    const wasDragging = globalDragState.isDragging;
    const activeZone = globalDragState.activeDropZone;

    globalDragState = {
      isDragging: false,
      data: null,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
      dragElement: null,
      activeDropZone: null,
    };

    currentDragIdRef.current = null;

    // Dispatch drag end event
    window.dispatchEvent(new CustomEvent('global-drag-end', {
      detail: { wasDragging, dropZone: activeZone?.id }
    }));

    // Call drop handler if we have an active drop zone
    if (activeZone) {
      activeZone.onDrop(
        globalDragState.data!,
        { x: globalDragState.currentX, y: globalDragState.currentY }
      );
    }
  }, []);

  // Register a drop zone
  const registerDropZone = useCallback((zone: Omit<DropZone, 'id'>): string => {
    const zoneId = `zone-${dropZones.size}-${Date.now()}`;
    dropZones.set(zoneId, { ...zone, id: zoneId });
    return zoneId;
  }, []);

  // Unregister a drop zone
  const unregisterDropZone = useCallback((zoneId: string) => {
    dropZones.delete(zoneId);
  }, []);

  // Get current drag state
  const getDragState = useCallback((): DragState => {
    return { ...globalDragState };
  }, []);

  // Check if currently dragging
  const isDragging = useCallback((): boolean => {
    return globalDragState.isDragging;
  }, []);

  // Get drag data
  const getDragData = useCallback((): DragData | null => {
    return globalDragState.data;
  }, []);

  return {
    startDrag,
    endDrag,
    registerDropZone,
    unregisterDropZone,
    getDragState,
    isDragging,
    getDragData,
  };
}

// Create drag preview element
function createDragPreview(element: HTMLElement, x: number, y: number) {
  const preview = element.cloneNode(true) as HTMLElement;
  preview.id = 'global-drag-preview';
  preview.style.cssText = `
    position: fixed;
    left: ${x}px;
    top: ${y}px;
    transform: translate(-50%, -50%);
    pointer-events: none;
    z-index: 99999;
    opacity: 0.8;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
  `;
  document.body.appendChild(preview);
  globalDragState.dragElement = preview;
}

// Update drag preview position
function updateDragPreview(x: number, y: number) {
  const preview = document.getElementById('global-drag-preview');
  if (preview) {
    preview.style.left = `${x}px`;
    preview.style.top = `${y}px`;
  }
}

// Remove drag preview
function removeDragPreview() {
  const preview = document.getElementById('global-drag-preview');
  if (preview) {
    preview.remove();
  }
  globalDragState.dragElement = null;
}

// Handle global mouse move during drag
function handleMouseMove(e: MouseEvent) {
  if (!globalDragState.isDragging) return;

  globalDragState.currentX = e.clientX;
  globalDragState.currentY = e.clientY;

  updateDragPreview(e.clientX, e.clientY);

  // Check drop zones
  const elementUnderCursor = document.elementFromPoint(e.clientX, e.clientY);
  if (!elementUnderCursor) {
    if (globalDragState.activeDropZone?.onDragLeave) {
      globalDragState.activeDropZone.onDragLeave();
    }
    globalDragState.activeDropZone = null;
    return;
  }

  // Find matching drop zone
  let foundZone: DropZone | null = null;
  for (const [zoneId, zone] of dropZones) {
    let el: Element | null = elementUnderCursor;
    while (el) {
      if (el === zone.element) {
        foundZone = zone;
        break;
      }
      el = el.parentElement;
    }
    if (foundZone) break;
  }

  // Handle zone change
  if (foundZone !== globalDragState.activeDropZone) {
    if (globalDragState.activeDropZone?.onDragLeave) {
      globalDragState.activeDropZone.onDragLeave();
    }
    globalDragState.activeDropZone = foundZone;
  }

  // Call onDragOver if zone allows the drag
  if (foundZone && foundZone.onDragOver) {
    const canDrop = foundZone.onDragOver(
      globalDragState.data!,
      { x: e.clientX, y: e.clientY }
    );
    if (!canDrop) {
      globalDragState.activeDropZone = null;
    }
  }

  // Dispatch drag move event
  window.dispatchEvent(new CustomEvent('global-drag-move', {
    detail: {
      data: globalDragState.data,
      position: { x: e.clientX, y: e.clientY },
      dropZone: foundZone?.id
    }
  }));
}

// Handle global mouse up to end drag
function handleMouseUp(e: MouseEvent) {
  if (!globalDragState.isDragging) return;

  // Check if we should complete the drop
  const elementUnderCursor = document.elementFromPoint(e.clientX, e.clientY);
  let shouldDrop = false;

  if (elementUnderCursor && globalDragState.activeDropZone) {
    let el: Element | null = elementUnderCursor;
    while (el) {
      if (el === globalDragState.activeDropZone.element) {
        shouldDrop = true;
        break;
      }
      el = el.parentElement;
    }
  }

  if (shouldDrop && globalDragState.activeDropZone) {
    // Call the drop handler and mark as handled
    globalDragState.activeDropZone.onDrop(
      globalDragState.data!,
      { x: e.clientX, y: e.clientY }
    );
  }

  // Clean up
  removeDragPreview();

  if (onGlobalMouseMove) {
    window.removeEventListener('mousemove', onGlobalMouseMove);
    onGlobalMouseMove = null;
  }
  if (onGlobalMouseUp) {
    window.removeEventListener('mouseup', onGlobalMouseUp);
    onGlobalMouseUp = null;
  }

  const wasDragging = globalDragState.isDragging;
  const activeZone = globalDragState.activeDropZone;

  globalDragState = {
    isDragging: false,
    data: null,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    dragElement: null,
    activeDropZone: null,
  };

  // Dispatch drag end event
  window.dispatchEvent(new CustomEvent('global-drag-end', {
    detail: {
      wasDragging,
      dropped: shouldDrop,
      dropZone: activeZone?.id,
      position: { x: e.clientX, y: e.clientY }
    }
  }));
}

// Export functions for non-hook usage
export const globalDragAPI = {
  isDragging: () => globalDragState.isDragging,
  getDragData: () => globalDragState.data,
  getCurrentPosition: () => ({ x: globalDragState.currentX, y: globalDragState.currentY }),
};
