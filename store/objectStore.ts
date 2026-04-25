/**
 * Object Store - Zustand store with optimized selectors for object management
 * Provides efficient access to game objects with minimal re-renders
 */

import { create } from 'zustand';
import { shallow } from 'zustand/shallow';
import { useMemo } from 'react';
import { TableObject, ItemType, Card, Token, Deck } from '../types';

// Object store interface
interface ObjectStore {
  objects: Record<string, TableObject>;

  // Actions
  setObject: (id: string, object: TableObject) => void;
  addObject: (object: TableObject) => void;
  updateObject: (id: string, updates: Partial<TableObject>) => void;
  deleteObject: (id: string) => void;
  moveObject: (id: string, x: number, y: number) => void;
  setObjects: (objects: Record<string, TableObject>) => void;
  clearObjects: () => void;

  // Selectors (built into the store for convenience)
  getObjectById: (id: string) => TableObject | undefined;
  getObjectsByType: <T extends TableObject>(type: ItemType) => T[];
  getVisibleObjects: () => TableObject[];
  getObjectsOnTable: () => TableObject[];
  getObjectsByLayer: (layerId: string) => TableObject[];
  getObjectsByOwner: (ownerId: string) => TableObject[];
  searchObjects: (query: string) => TableObject[];
}

// Create the object store
export const useObjectStore = create<ObjectStore>((set, get) => ({
  objects: {},

  // Actions
  setObject: (id, object) =>
    set(state => ({
      objects: { ...state.objects, [id]: object },
    })),

  addObject: (object) =>
    set(state => ({
      objects: { ...state.objects, [object.id]: object },
    })),

  updateObject: (id, updates) =>
    set(state => {
      const existingObject = state.objects[id];
      if (!existingObject) {
        return state;
      }

      return {
        objects: {
          ...state.objects,
          [id]: { ...existingObject, ...updates },
        },
      };
    }),

  deleteObject: (id) =>
    set(state => {
      const { [id]: deleted, ...rest } = state.objects;
      return { objects: rest };
    }),

  moveObject: (id, x, y) =>
    set(state => {
      const existingObject = state.objects[id];
      if (!existingObject) {
        return state;
      }

      return {
        objects: {
          ...state.objects,
          [id]: { ...existingObject, x, y },
        },
      };
    }),

  setObjects: (objects) =>
    set({ objects }),

  clearObjects: () =>
    set({ objects: {} }),

  // Selectors
  getObjectById: (id) => {
    return get().objects[id];
  },

  getObjectsByType: <T extends TableObject>(type: ItemType): T[] => {
    const objects = get().objects;
    return Object.values(objects).filter(obj => obj.type === type) as T[];
  },

  getVisibleObjects: () => {
    const objects = get().objects;
    return Object.values(objects).filter(obj => obj.isOnTable !== false);
  },

  getObjectsOnTable: () => {
    const objects = get().objects;
    return Object.values(objects).filter(obj => obj.isOnTable && !obj.inCursorSlot);
  },

  getObjectsByLayer: (layerId: string) => {
    const objects = get().objects;
    return Object.values(objects).filter(obj => obj.hyperscaleLayerId === layerId);
  },

  getObjectsByOwner: (ownerId: string) => {
    const objects = get().objects;
    return Object.values(objects).filter(obj => {
      if ('ownerId' in obj) {
        return (obj as any).ownerId === ownerId;
      }
      return false;
    });
  },

  searchObjects: (query: string) => {
    const objects = get().objects;
    const lowerQuery = query.toLowerCase();

    return Object.values(objects).filter(obj => {
      // Search in ID
      if (obj.id.toLowerCase().includes(lowerQuery)) {
        return true;
      }

      // Search in name (if exists)
      if ('name' in obj && obj.name) {
        if (obj.name.toLowerCase().includes(lowerQuery)) {
          return true;
        }
      }

      // Search in content (if exists)
      if ('content' in obj && obj.content) {
        if (obj.content.toLowerCase().includes(lowerQuery)) {
          return true;
        }
      }

      return false;
    });
  },
}));

// Optimized hooks for components
// These hooks use shallow comparison to prevent unnecessary re-renders

/**
 * Get a specific object by ID
 * Only re-renders when this specific object changes
 */
export function useObjectById(id: string) {
  return useObjectStore(state =>
    state.objects[id],
    (a, b) => a === b // Simple equality check
  );
}

/**
 * Get objects by type with shallow comparison
 * Only re-renders when the array of objects changes (not individual objects)
 */
export function useObjectsByType<T extends TableObject>(type: ItemType): T[] {
  return useObjectStore(
    state => Object.values(state.objects).filter(obj => obj.type === type) as T[],
    shallow
  );
}

/**
 * Get all visible objects
 * Only re-renders when the set of visible objects changes
 */
export function useVisibleObjects(): TableObject[] {
  return useObjectStore(
    state => Object.values(state.objects).filter(obj => obj.isOnTable !== false),
    shallow
  );
}

/**
 * Get objects that are currently on the table
 * Only re-renders when objects on table change
 */
export function useObjectsOnTable(): TableObject[] {
  return useObjectStore(
    state => Object.values(state.objects).filter(obj => obj.isOnTable && !obj.inCursorSlot),
    shallow
  );
}

/**
 * Get objects in a specific layer
 * Only re-renders when objects in this layer change
 */
export function useObjectsByLayer(layerId: string): TableObject[] {
  return useObjectStore(
    state => Object.values(state.objects).filter(obj => obj.hyperscaleLayerId === layerId),
    shallow
  );
}

/**
 * Get cards specifically
 * Optimized hook for card objects
 */
export function useCards(): Card[] {
  return useObjectStore(
    state => Object.values(state.objects).filter(obj => obj.type === ItemType.CARD) as Card[],
    shallow
  );
}

/**
 * Get tokens specifically
 * Optimized hook for token objects
 */
export function useTokens(): Token[] {
  return useObjectStore(
    state => Object.values(state.objects).filter(obj => obj.type === ItemType.TOKEN) as Token[],
    shallow
  );
}

/**
 * Get decks specifically
 * Optimized hook for deck objects
 */
export function useDecks(): Deck[] {
  return useObjectStore(
    state => Object.values(state.objects).filter(obj => obj.type === ItemType.DECK) as Deck[],
    shallow
  );
}

/**
 * Get objects owned by a specific player
 */
export function useObjectsByOwner(ownerId: string): TableObject[] {
  return useObjectStore(
    state => Object.values(state.objects).filter(obj => {
      if ('ownerId' in obj) {
        return (obj as any).ownerId === ownerId;
      }
      return false;
    }),
    shallow
  );
}

/**
 * Search objects by query string
 */
export function useObjectSearch(query: string): TableObject[] {
  return useObjectStore(
    state => {
      if (!query) return [];

      const lowerQuery = query.toLowerCase();
      return Object.values(state.objects).filter(obj => {
        // Search in ID
        if (obj.id.toLowerCase().includes(lowerQuery)) {
          return true;
        }

        // Search in name (if exists)
        if ('name' in obj && obj.name) {
          if (obj.name.toLowerCase().includes(lowerQuery)) {
            return true;
          }
        }

        // Search in content (if exists)
        if ('content' in obj && obj.content) {
          if (obj.content.toLowerCase().includes(lowerQuery)) {
            return true;
          }
        }

        return false;
      });
    },
    shallow
  );
}

/**
 * Get object count statistics
 */
export function useObjectStats() {
  return useObjectStore(
    state => {
      const objects = Object.values(state.objects);

      return {
        total: objects.length,
        onTable: objects.filter(obj => obj.isOnTable && !obj.inCursorSlot).length,
        cards: objects.filter(obj => obj.type === ItemType.CARD).length,
        tokens: objects.filter(obj => obj.type === ItemType.TOKEN).length,
        decks: objects.filter(obj => obj.type === ItemType.DECK).length,
        boards: objects.filter(obj => obj.type === ItemType.BOARD || obj.type === ItemType.NEXUS_BOARD).length,
        visible: objects.filter(obj => obj.isOnTable !== false).length,
      };
    },
    shallow
  );
}

/**
 * Hook to get object store actions (no re-render on data changes)
 * Uses direct selector for stable references
 */
export function useObjectActions() {
  const setObject = useObjectStore(state => state.setObject);
  const addObject = useObjectStore(state => state.addObject);
  const updateObject = useObjectStore(state => state.updateObject);
  const deleteObject = useObjectStore(state => state.deleteObject);
  const moveObject = useObjectStore(state => state.moveObject);
  const setObjects = useObjectStore(state => state.setObjects);
  const clearObjects = useObjectStore(state => state.clearObjects);

  return useMemo(() => ({
    setObject,
    addObject,
    updateObject,
    deleteObject,
    moveObject,
    setObjects,
    clearObjects,
  }), [setObject, addObject, updateObject, deleteObject, moveObject, setObjects, clearObjects]);
}

/**
 * Hook to get only objects data (no actions)
 * Use this when you only need to read objects to avoid unnecessary re-renders
 */
export function useObjectsData() {
  return useObjectStore(state => state.objects);
}

/**
 * Hook to get both data and actions
 * Use this when you need both read and write access
 * Uses direct selectors for stable references
 */
export function useObjects() {
  const objects = useObjectStore(state => state.objects);
  const setObject = useObjectStore(state => state.setObject);
  const addObject = useObjectStore(state => state.addObject);
  const updateObject = useObjectStore(state => state.updateObject);
  const deleteObject = useObjectStore(state => state.deleteObject);
  const moveObject = useObjectStore(state => state.moveObject);
  const setObjects = useObjectStore(state => state.setObjects);
  const clearObjects = useObjectStore(state => state.clearObjects);
  const getObjectById = useObjectStore(state => state.getObjectById);
  const getObjectsByType = useObjectStore(state => state.getObjectsByType);
  const getVisibleObjects = useObjectStore(state => state.getVisibleObjects);
  const getObjectsOnTable = useObjectStore(state => state.getObjectsOnTable);
  const getObjectsByLayer = useObjectStore(state => state.getObjectsByLayer);
  const getObjectsByOwner = useObjectStore(state => state.getObjectsByOwner);
  const searchObjects = useObjectStore(state => state.searchObjects);

  return useMemo(() => ({
    // Data
    objects,
    // Actions
    setObject,
    addObject,
    updateObject,
    deleteObject,
    moveObject,
    setObjects,
    clearObjects,
    // Selectors
    getObjectById,
    getObjectsByType,
    getVisibleObjects,
    getObjectsOnTable,
    getObjectsByLayer,
    getObjectsByOwner,
    searchObjects,
  }), [objects, setObject, addObject, updateObject, deleteObject, moveObject, setObjects, clearObjects, getObjectById, getObjectsByType, getVisibleObjects, getObjectsOnTable, getObjectsByLayer, getObjectsByOwner, searchObjects]);
}

// Utility functions for bulk operations
export const objectUtils = {
  /**
   * Bulk update multiple objects
   */
  bulkUpdate: (updates: Array<{ id: string; changes: Partial<TableObject> }>) => {
    const { updateObject } = useObjectStore.getState();
    updates.forEach(({ id, changes }) => {
      updateObject(id, changes);
    });
  },

  /**
   * Bulk move multiple objects
   */
  bulkMove: (movements: Array<{ id: string; x: number; y: number }>) => {
    const { moveObject } = useObjectStore.getState();
    movements.forEach(({ id, x, y }) => {
      moveObject(id, x, y);
    });
  },

  /**
   * Bulk delete multiple objects
   */
  bulkDelete: (ids: string[]) => {
    const { deleteObject } = useObjectStore.getState();
    ids.forEach(id => {
      deleteObject(id);
    });
  },

  /**
   * Filter objects by custom predicate
   */
  filter: (predicate: (obj: TableObject) => boolean) => {
    const objects = useObjectStore.getState().objects;
    return Object.values(objects).filter(predicate);
  },

  /**
   * Map over all objects
   */
  map: <T>(mapper: (obj: TableObject) => T) => {
    const objects = useObjectStore.getState().objects;
    return Object.values(objects).map(mapper);
  },

  /**
   * Reduce over all objects
   */
  reduce: <T>(reducer: (acc: T, obj: TableObject) => T, initialValue: T) => {
    const objects = useObjectStore.getState().objects;
    return Object.values(objects).reduce(reducer, initialValue);
  },
};

// Example usage:
/*
// In components:

// Get a specific object
const card = useObjectById('card-123');
const cards = useCards();
const tokens = useTokens();

// Get objects with filters
const visibleObjects = useVisibleObjects();
const tableObjects = useObjectsOnTable();
const layerObjects = useObjectsByLayer('layer-1');

// Get statistics
const stats = useObjectStats();

// Get actions only (no re-render on data changes)
const { updateObject, moveObject } = useObjectActions();

// Get both data and actions
const { objects, setObject, deleteObject } = useObjects();

// Bulk operations
objectUtils.bulkMove([
  { id: 'card-1', x: 100, y: 200 },
  { id: 'card-2', x: 150, y: 250 },
]);

// Search objects
const searchResults = useObjectSearch('dragon');
*/
