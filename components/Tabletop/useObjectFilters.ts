/**
 * Custom hooks for filtering and processing tabletop objects
 * Extracted from Tabletop.tsx for better modularity and performance
 */

import { useMemo, useState, useEffect } from 'react';
import {
  TableObject,
  ItemType,
  Card as CardType,
  Token as TokenType,
  Board as BoardType,
  PanelObject,
  Deck as DeckType,
  Counter,
  CardLocation,
  EffectTemplate
} from '../../types';
import { filterVisibleObjects, calculateViewportBounds } from '../../utils/viewportCulling';
import { intersectsPlayableArea } from '../../utils/viewportConstraints';
import { isInCursorSlot, subscribeToCursorSlotChanges } from '../../utils/cursorSlotTracker';

/**
 * Filter objects by various criteria for rendering optimization
 */
export const useObjectFilters = (
  state: { objects?: Record<string, TableObject>; activePlayerId?: string },
  hyperscaleLayers: Array<{ id: string; maxZIndex?: number }>
) => {
  const activePlayerId = state.activePlayerId;

  // Subscribe to cursor slot changes to force re-render when objects are added/removed
  const [cursorSlotVersion, setCursorSlotVersion] = useState(0);
  useEffect(() => {
    return subscribeToCursorSlotChanges(() => {
      setCursorSlotVersion(v => v + 1);
    });
  }, []);

  // All table objects (convert from object record to array)
  const tableObjects = useMemo(() => {
    const PLAYABLE_AREA_SIZE = 5000;

    return (Object.values(state.objects || {}) as TableObject[]).filter((obj) => {
      // Exclude objects with isOnTable: false (hidden objects)
      if ((obj as any).isOnTable === false) {
        return false;
      }

      // Exclude objects at cursor slot holding position (-999999, -999999)
      // These are objects being dragged but not yet dropped
      if (obj.x < -90000 || obj.y < -90000) {
        return false;
      }

      // Exclude panels, windows, decks (they are rendered separately)
      if (obj.type === ItemType.PANEL || obj.type === ItemType.WINDOW || obj.type === ItemType.DECK) {
        return false;
      }

      // Exclude pinned game objects (tokens, effects, etc.) - they are rendered separately in PinnedGameObjectsRenderer
      if ((obj as any).isPinnedToViewport) {
        return false;
      }

      // Exclude cards that are in deck (location: DECK), in hand (location: HAND), or in pile (location: PILE)
      if (obj.type === ItemType.CARD) {
        const card = obj as CardType;
        if (card.location === CardLocation.DECK ||
            card.location === CardLocation.HAND ||
            card.location === CardLocation.PILE) {
          return false;
        }
      }

      // Exclude local cursor slot objects (being dragged by local player)
      // They are rendered in the cursor slot visualization, not on the table
      // 🔥 FIX: Check obj.inCursorSlot instead of tracker to prevent race condition
      // where object is removed from tracker but still has hidden coordinates (-999999)
      if ((obj as any).inCursorSlot === true) {
        return false;
      }

      // Effect Templates can extend far beyond playable area when stretched
      // Skip coordinate filtering for them to allow proper rendering
      if (obj.type === ItemType.EFFECT_TEMPLATE) {
        return true;
      }

      // Check if object intersects with playable area using proper intersection test
      // This allows objects to be partially outside the area while still being rendered
      if (!intersectsPlayableArea(obj.x, obj.y, obj.width || 100, obj.height || 100)) {
        return false;
      }

      return true;
    });
  }, [state.objects, cursorSlotVersion]);

  // Visible table objects (viewport culling would be applied here with viewport bounds)
  const visibleTableObjects = useMemo(() => {
    // For now, return all table objects - viewport culling can be added later
    return tableObjects;
  }, [tableObjects]);

  // Remote cursor slot objects (objects in other players' cursor slots)
  const remoteCursorSlotObjects = useMemo(() => {
    return (Object.values(state.objects || {}) as TableObject[])
      .filter((obj) => {
        // Check if object intersects with playable area
        if (!intersectsPlayableArea(obj.x, obj.y, obj.width || 100, obj.height || 100)) {
          return false;
        }

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
        if (obj.type === ItemType.COUNTER) {
          const counter = obj as Counter;
          return (
            counter.inCursorSlot &&
            counter.cursorSlotOwnerId &&
            counter.cursorSlotOwnerId !== 'local-player'
          );
        }
        if (obj.type === ItemType.EFFECT_TEMPLATE) {
          const effect = obj as EffectTemplate;
          return (
            effect.inCursorSlot &&
            effect.cursorSlotOwnerId &&
            effect.cursorSlotOwnerId !== 'local-player'
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
        // Check if object intersects with playable area
        if (!intersectsPlayableArea(obj.x, obj.y, obj.width || 100, obj.height || 100)) {
          return false;
        }

        if (obj.type === ItemType.CARD) {
          const card = obj as CardType;
          return card.isDragging && card.dragOwnerId && card.dragOwnerId !== 'local-player';
        }
        if (obj.type === ItemType.TOKEN) {
          const token = obj as TokenType;
          return token.isDragging && token.dragOwnerId && token.dragOwnerId !== 'local-player';
        }
        if (obj.type === ItemType.COUNTER) {
          const counter = obj as Counter;
          return counter.isDragging && counter.dragOwnerId && counter.dragOwnerId !== 'local-player';
        }
        if (obj.type === ItemType.EFFECT_TEMPLATE) {
          const effect = obj as EffectTemplate;
          return effect.isDragging && effect.dragOwnerId && effect.dragOwnerId !== 'local-player';
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
        if (obj.type === ItemType.WINDOW) {
          // Filter out windows with ownerId that belongs to another player
          // Settings windows (OBJECT_SETTINGS, HYPERSCALE_LAYER_SETTINGS) are local to their owner
          const windowObj = obj as any;
          if (windowObj.ownerId && windowObj.ownerId !== activePlayerId) {
            return false;
          }
          return true;
        }
        return false;
      })
      .sort((a, b) => (a.zIndex || 1000) - (b.zIndex || 1000));
  }, [state.objects, activePlayerId]);

  // Separate pinned and unpinned UI objects
  // NOTE: All panels and windows are UI elements and should always be pinned to viewport
  // This ensures they render in screen coordinates, not world coordinates
  const pinnedUIObjects = useMemo(() => {
    return uiObjects.filter((obj) => {
      // UI objects (panels and windows) are always considered pinned
      return obj.type === ItemType.PANEL || obj.type === ItemType.WINDOW || (obj as any).isPinnedToViewport;
    });
  }, [uiObjects]);

  const unpinnedUIObjects = useMemo(() => {
    return uiObjects.filter((obj) => {
      // Only non-UI objects can be unpinned
      return obj.type !== ItemType.PANEL && obj.type !== ItemType.WINDOW && !(obj as any).isPinnedToViewport;
    });
  }, [uiObjects]);

  // Separate pinned and unpinned decks
  const pinnedDecks = useMemo(() => {
    return (Object.values(state.objects) as TableObject[])
      .filter((obj) => {
        if (obj.type !== ItemType.DECK) return false;
        if (!(obj as any).isPinnedToViewport) return false;
        if ((obj as any).isOnTable !== true) return false;
        // Exclude decks at cursor slot holding position (-999999, -999999)
        if (obj.x < -90000 || obj.y < -90000) return false;
        // Exclude decks in cursor slot (being dragged)
        // 🔥 FIX: Check obj.inCursorSlot instead of tracker to prevent race condition
        if ((obj as any).inCursorSlot === true) return false;
        return true;
      })
      .map((obj) => obj as DeckType);
  }, [state.objects, cursorSlotVersion]);

  const unpinnedDecks = useMemo(() => {
    return (Object.values(state.objects) as TableObject[])
      .filter((obj) => {
        if (obj.type !== ItemType.DECK) return false;
        if ((obj as any).isPinnedToViewport) return false;
        if ((obj as any).isOnTable !== true) return false;
        // Exclude decks at cursor slot holding position (-999999, -999999)
        if (obj.x < -90000 || obj.y < -90000) return false;
        // Exclude decks in cursor slot (being dragged)
        // 🔥 FIX: Check obj.inCursorSlot instead of tracker to prevent race condition
        if ((obj as any).inCursorSlot === true) return false;
        return true;
      })
      .map((obj) => obj as DeckType);
  }, [state.objects, cursorSlotVersion]);

  // Pinned game objects (tokens, cards, effects, etc. - but NOT decks, panels, or windows)
  // These are rendered in viewport coordinates, not world coordinates
  const pinnedGameObjects = useMemo(() => {
    const result = (Object.values(state.objects) as TableObject[])
      .filter((obj) => {
        // Must be pinned to viewport
        if (!(obj as any).isPinnedToViewport) return false;
        // Must be on table
        if ((obj as any).isOnTable === false) return false;
        // Exclude UI objects and decks (they have their own pinned lists)
        if (obj.type === ItemType.PANEL || obj.type === ItemType.WINDOW || obj.type === ItemType.DECK) return false;
        // Exclude objects at cursor slot holding position (-999999, -999999)
        if (obj.x < -90000 || obj.y < -90000) return false;
        // Exclude objects in cursor slot (being dragged)
        // 🔥 FIX: Check obj.inCursorSlot instead of tracker to prevent race condition
        if ((obj as any).inCursorSlot === true) return false;
        return true;
      })
      .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
    return result;
  }, [state.objects, cursorSlotVersion]);

  return {
    tableObjects,
    visibleTableObjects,
    remoteCursorSlotObjects,
    remoteDraggingObjects,
    uiObjects,
    pinnedUIObjects,
    unpinnedUIObjects,
    pinnedDecks,
    unpinnedDecks,
    pinnedGameObjects
  };
};

/**
 * Calculate world bounds based on playable area
 * NOTE: Returns dimensions in VU (virtual units), caller must convert to pixels
 */
export const useWorldBounds = () => {
  return useMemo(() => {
    // Return VU dimensions (will be converted to pixels by caller)
    const PLAYABLE_AREA_SIZE = 5000;
    return {
      width: PLAYABLE_AREA_SIZE,
      height: PLAYABLE_AREA_SIZE
    };
  }, []);
};