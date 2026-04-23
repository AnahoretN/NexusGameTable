/**
 * Custom hooks for filtering and processing tabletop objects
 * Extracted from Tabletop.tsx for better modularity and performance
 */

import { useMemo } from 'react';
import {
  TableObject,
  ItemType,
  Card as CardType,
  Token as TokenType,
  Board as BoardType,
  PanelObject,
  Deck as DeckType,
  CardLocation
} from '../../types';
import { filterVisibleObjects, calculateViewportBounds } from '../../utils/viewportCulling';

/**
 * Filter objects by various criteria for rendering optimization
 */
export const useObjectFilters = (
  state: { objects?: Record<string, TableObject> },
  hyperscaleLayers: Array<{ id: string; maxZIndex?: number }>
) => {
  // All table objects (convert from object record to array)
  const tableObjects = useMemo(() => {
    return (Object.values(state.objects || {}) as TableObject[]).filter((obj) => {
      // Exclude panels, windows, decks (they are rendered separately)
      if (obj.type === ItemType.PANEL || obj.type === ItemType.WINDOW || obj.type === ItemType.DECK) {
        return false;
      }

      // Exclude cards that are in deck (location: DECK) or in hand (location: HAND)
      if (obj.type === ItemType.CARD) {
        const card = obj as CardType;
        if (card.location === CardLocation.DECK ||
            card.location === CardLocation.HAND) {
          return false;
        }
      }

      // Exclude objects in local cursor slot (they are rendered by CursorSlotVisualization)
      if ((obj as any).inCursorSlot && !(obj as any).cursorSlotOwnerId) {
        return false;
      }

      return true;
    });
  }, [state.objects]);

  // Visible table objects (viewport culling would be applied here with viewport bounds)
  const visibleTableObjects = useMemo(() => {
    // For now, return all table objects - viewport culling can be added later
    return tableObjects;
  }, [tableObjects]);

  // Remote cursor slot objects (objects in other players' cursor slots)
  const remoteCursorSlotObjects = useMemo(() => {
    return (Object.values(state.objects || {}) as TableObject[])
      .filter((obj) => {
        if (obj.type === ItemType.CARD) {
          const card = obj as CardType;
          return (
            card.inCursorSlot &&
            card.cursorSlotOwnerId &&
            card.cursorSlotOwnerId !== 'local-player' // Exclude local player's cursor slot
          );
        }
        if (obj.type === ItemType.TOKEN) {
          const token = obj as TokenType;
          return (
            token.inCursorSlot &&
            token.cursorSlotOwnerId &&
            token.cursorSlotOwnerId !== 'local-player'
          );
        }
        if (obj.type === ItemType.BOARD) {
          const board = obj as BoardType;
          return (
            board.inCursorSlot &&
            board.cursorSlotOwnerId &&
            board.cursorSlotOwnerId !== 'local-player'
          );
        }
        return false;
      })
      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  }, [state.objects]);

  // Remote dragging objects (objects being dragged by other players)
  const remoteDraggingObjects = useMemo(() => {
    return (Object.values(state.objects || {}) as TableObject[])
      .filter((obj) => {
        if (obj.type === ItemType.CARD) {
          const card = obj as CardType;
          return card.isDragging && card.dragOwnerId && card.dragOwnerId !== 'local-player';
        }
        if (obj.type === ItemType.TOKEN) {
          const token = obj as TokenType;
          return token.isDragging && token.dragOwnerId && token.dragOwnerId !== 'local-player';
        }
        return false;
      })
      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  }, [state.objects]);

  // UI objects (panels and windows)
  const uiObjects = useMemo(() => {
    return (Object.values(state.objects) as TableObject[])
      .filter((obj) => {
        if (obj.type === ItemType.PANEL) {
          const panelObj = obj as PanelObject;
          return panelObj.visible !== false;
        }
        return obj.type === ItemType.WINDOW;
      })
      .sort((a, b) => (a.zIndex || 1000) - (b.zIndex || 1000));
  }, [state.objects]);

  // Separate pinned and unpinned UI objects
  const pinnedUIObjects = useMemo(() => {
    return uiObjects.filter((obj) => (obj as any).isPinnedToViewport);
  }, [uiObjects]);

  const unpinnedUIObjects = useMemo(() => {
    return uiObjects.filter((obj) => !(obj as any).isPinnedToViewport);
  }, [uiObjects]);

  // Separate pinned and unpinned decks
  const pinnedDecks = useMemo(() => {
    return (Object.values(state.objects) as TableObject[])
      .filter((obj) => obj.type === ItemType.DECK && (obj as any).isPinnedToViewport)
      .map((obj) => obj as DeckType);
  }, [state.objects]);

  const unpinnedDecks = useMemo(() => {
    return (Object.values(state.objects) as TableObject[])
      .filter((obj) => obj.type === ItemType.DECK && !(obj as any).isPinnedToViewport)
      .map((obj) => obj as DeckType);
  }, [state.objects]);

  return {
    tableObjects,
    visibleTableObjects,
    remoteCursorSlotObjects,
    remoteDraggingObjects,
    uiObjects,
    pinnedUIObjects,
    unpinnedUIObjects,
    pinnedDecks,
    unpinnedDecks
  };
};

/**
 * Calculate world bounds based on playable area
 */
export const useWorldBounds = () => {
  return useMemo(() => {
    // From PLAYABLE_AREA_SIZE constant (5000×5000 top-left)
    const PLAYABLE_AREA_SIZE = 5000;
    return {
      width: PLAYABLE_AREA_SIZE,
      height: PLAYABLE_AREA_SIZE
    };
  }, []);
};