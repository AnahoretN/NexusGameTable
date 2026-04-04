import { create } from 'zustand';

/**
 * Drag-over state management for pool panels
 * Tracks when any object is being dragged over a pool panel
 */

interface DragOverState {
  isDragging: boolean;
  targetPoolPanelId: string | null;
  draggedObjectId: string | null;
}

interface DragOverActions {
  setDraggingOver: (panelId: string | null, objectId: string | null) => void;
  clearDraggingOver: () => void;
}

export const useDragOverStore = create<DragOverState & DragOverActions>((set) => ({
  isDragging: false,
  targetPoolPanelId: null,
  draggedObjectId: null,

  setDraggingOver: (panelId, objectId) => set({
    isDragging: true,
    targetPoolPanelId: panelId,
    draggedObjectId: objectId
  }),

  clearDraggingOver: () => set({
    isDragging: false,
    targetPoolPanelId: null,
    draggedObjectId: null
  })
}));