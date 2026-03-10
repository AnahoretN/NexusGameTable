import { TableObject, ItemType, BattlefieldCell, NexusCellObject } from '../../types';
import { removeObjectFromCellMagnet } from '../../utils/gridUtils';

/**
 * Reducer functions for object manipulation actions
 * ADD_OBJECT, UPDATE_OBJECT, MOVE_OBJECT, DELETE_OBJECT, CLONE_OBJECT, etc.
 */

export function addObjectReducer(state: any, action: any): any {
  const { type, payload } = action;
  const newObjects = { ...state.objects };

  if (type === 'ADD_OBJECT') {
    const obj = payload.object;
    newObjects[obj.id] = obj;

    // If adding a deck, ensure baseCardIds is set
    if (obj.type === ItemType.DECK) {
      (obj as any).baseCardIds = [...obj.cardIds];
    }

    return { ...state, objects: newObjects };
  }

  if (type === 'UPDATE_OBJECT') {
    const obj = state.objects[action.payload.id];
    if (!obj) return state;

    // Handle deck card dimension updates
    if (obj.type === ItemType.DECK && (payload.cardWidth || payload.cardHeight)) {
      const oldDeck = obj as any;
      const oldCardWidth = oldDeck.cardWidth ?? 120;
      const oldCardHeight = oldDeck.cardHeight ?? 168;
      const newCardWidth = payload.cardWidth ?? oldDeck.cardWidth ?? 120;
      const newCardHeight = payload.cardHeight ?? oldDeck.cardHeight ?? 168;

      if (newCardWidth !== oldCardWidth || newCardHeight !== oldCardHeight) {
        Object.values(state.objects).forEach((o: unknown) => {
          if ((o as any).type === ItemType.CARD && (o as any).deckId === obj.id) {
            const card = o as any;
            if (card.width === oldCardWidth && card.height === oldCardHeight) {
              newObjects[(o as any).id] = { ...card, width: newCardWidth, height: newCardHeight };
            }
          }
        });
      }
    }

    newObjects[action.payload.id] = { ...obj, ...action.payload };
    return { ...state, objects: newObjects };
  }

  if (type === 'MOVE_OBJECT') {
    const obj = state.objects[action.payload.id];
    if (!obj || obj.locked) return state;

    // For pinned objects, also update pinnedScreenPosition
    if ((obj as any).isPinnedToViewport) {
      return {
        ...state,
        objects: {
          ...state.objects,
          [action.payload.id]: {
            ...obj,
            x: action.payload.x,
            y: action.payload.y,
            pinnedScreenPosition: { x: action.payload.x, y: action.payload.y }
          } as TableObject
        }
      };
    }

    // Check if this object was snapped to a cell's magnet points
    // If moved far enough from the cell, remove it from magnet points and reposition remaining objects
    const newObjects = { ...state.objects };
    let needsMagnetCleanup = false;

    for (const cellObj of Object.values(state.objects)) {
      if ((cellObj.type === ItemType.BATTLEFIELD_CELL || cellObj.type === ItemType.NEXUS_CELL) && cellObj.magnetPoints) {
        const cell = cellObj as BattlefieldCell | NexusCellObject;
        const magnetPoint = cell.magnetPoints.find(p => p.objectId === action.payload.id);

        if (magnetPoint) {
          // Check if object is still within reasonable distance of the cell
          const cellCenterX = cell.x + (cell.width ?? 100) / 2;
          const cellCenterY = cell.y + (cell.height ?? 100) / 2;
          const objCenterX = action.payload.x + (obj.width ?? 50) / 2;
          const objCenterY = action.payload.y + (obj.height ?? 50) / 2;

          const distance = Math.sqrt(
            Math.pow(objCenterX - cellCenterX, 2) +
            Math.pow(objCenterY - cellCenterY, 2)
          );

          // Snap radius is the larger of cell dimensions + some margin
          const snapRadius = Math.max(cell.width ?? 100, cell.height ?? 100) / 2 + 50;

          // If object moved outside snap radius, remove from magnet points and reposition remaining objects
          if (distance > snapRadius) {
            const result = removeObjectFromCellMagnet(cell, action.payload.id, newObjects);
            if (result) {
              // Update the cell with new magnet points
              newObjects[cell.id] = { ...cell, ...result.updatedCell };

              // Move remaining objects to their new magnet positions
              for (const movedObj of result.movedObjects) {
                newObjects[movedObj.objectId] = {
                  ...newObjects[movedObj.objectId],
                  x: movedObj.x,
                  y: movedObj.y
                };
              }
              needsMagnetCleanup = true;
            }
          }
        }
      }
    }

    if (needsMagnetCleanup) {
      return {
        ...state,
        objects: {
          ...newObjects,
          [action.payload.id]: { ...obj, x: action.payload.x, y: action.payload.y }
        }
      };
    }

    return {
      ...state,
      objects: {
        ...state.objects,
        [action.payload.id]: { ...obj, x: action.payload.x, y: action.payload.y }
      }
    };
  }

  if (type === 'DELETE_OBJECT') {
    const objectToDelete = state.objects[action.payload.id];
    if (!objectToDelete) return state;

    // If deleting a deck, delete all its cards
    if (objectToDelete.type === ItemType.DECK) {
      const deck = objectToDelete as any;
      if (deck.cardIds) {
        deck.cardIds.forEach((cid: string) => delete newObjects[cid]);
      }
    }

    // If deleting a card, remove from deck's cardIds
    if (objectToDelete.type === ItemType.CARD) {
      const card = objectToDelete as any;
      if (card.deckId) {
        const deck = state.objects[card.deckId] as any;
        if (deck) {
          newObjects[deck.id] = {
            ...deck,
            cardIds: deck.cardIds.filter((id: string) => id !== card.id)
          };
        }
      }
    }

    // Clean up magnet points - remove this object from any cell's magnetPoints
    // and reposition remaining objects
    for (const obj of Object.values(state.objects)) {
      if ((obj.type === ItemType.BATTLEFIELD_CELL || obj.type === ItemType.NEXUS_CELL) && obj.magnetPoints) {
        const cell = obj as BattlefieldCell | NexusCellObject;
        if (cell.magnetPoints?.some(p => p.objectId === action.payload.id)) {
          const result = removeObjectFromCellMagnet(cell, action.payload.id, newObjects);
          if (result) {
            // Update the cell with new magnet points
            newObjects[cell.id] = { ...cell, ...result.updatedCell };

            // Move remaining objects to their new magnet positions
            for (const movedObj of result.movedObjects) {
              if (movedObj.objectId !== action.payload.id) { // Don't move the object being deleted
                newObjects[movedObj.objectId] = {
                  ...newObjects[movedObj.objectId],
                  x: movedObj.x,
                  y: movedObj.y
                };
              }
            }
          }
        }
      }
    }

    delete newObjects[action.payload.id];
    return { ...state, objects: newObjects };
  }

  if (type === 'CLONE_OBJECT') {
    const obj = state.objects[action.payload.id];
    if (!obj) return state;

    const newId = action.payload.newId;
    const clonedObj = {
      ...obj,
      id: newId,
      x: obj.x + 20,
      y: obj.y + 20,
      name: `${obj.name} (copy)`
    };

    newObjects[newId] = clonedObj;

    // If cloning a deck, clone its cards too
    if (obj.type === ItemType.DECK) {
      const deck = obj as any;
      const cardIdMap: Record<string, string> = {};

      deck.cardIds.forEach((oldCardId: string, index: number) => {
        const oldCard = state.objects[oldCardId] as any;
        if (oldCard) {
          const newCardId = `card-${Date.now()}-${index}`;
          cardIdMap[oldCardId] = newCardId;

          newObjects[newCardId] = {
            ...oldCard,
            id: newCardId,
            deckId: newId
          };
        }
      });

      (clonedObj as any).cardIds = Object.values(cardIdMap);
      (clonedObj as any).baseCardIds = Object.values(cardIdMap);
    }

    return { ...state, objects: newObjects };
  }

  return state;
}

export function toggleLockReducer(state: any, action: any): any {
  if (action.type !== 'TOGGLE_LOCK') return state;

  const obj = state.objects[action.payload.id];
  if (!obj) return state;

  return {
    ...state,
    objects: {
      ...state.objects,
      [action.payload.id]: { ...obj, locked: !obj.locked }
    }
  };
}

export function toggleOnTableReducer(state: any, action: any): any {
  if (action.type !== 'TOGGLE_ON_TABLE') return state;

  const obj = state.objects[action.payload.id];
  if (!obj) return state;

  return {
    ...state,
    objects: {
      ...state.objects,
      [action.payload.id]: { ...obj, isOnTable: !(obj as any).isOnTable }
    }
  };
}

export function moveLayerReducer(state: any, action: any): any {
  if (action.type !== 'MOVE_LAYER_UP' && action.type !== 'MOVE_LAYER_DOWN') return state;

  const obj = state.objects[action.payload.id];
  if (!obj) return state;

  const allObjects = Object.values(state.objects)
    .filter((o: unknown) => (o as any).zIndex !== undefined)
    .sort((a: unknown, b: unknown) => ((a as any).zIndex || 1000) - ((b as any).zIndex || 1000));

  const currentIndex = allObjects.findIndex((o: unknown) => (o as any).id === action.payload.id);
  if (currentIndex === -1) return state;

  const targetObj = allObjects[currentIndex];
  const currentZ = (targetObj as any).zIndex || 1000;

  if (action.type === 'MOVE_LAYER_UP') {
    const nextObj = allObjects[currentIndex + 1];
    if (nextObj) {
      const nextZ = (nextObj as any).zIndex || 1000;
      return {
        ...state,
        objects: {
          ...state.objects,
          [action.payload.id]: { ...(targetObj as any), zIndex: nextZ },
          [(nextObj as any).id]: { ...(nextObj as any), zIndex: currentZ }
        }
      };
    }
  } else {
    const prevObj = allObjects[currentIndex - 1];
    if (prevObj) {
      const prevZ = (prevObj as any).zIndex || 1000;
      return {
        ...state,
        objects: {
          ...state.objects,
          [action.payload.id]: { ...(targetObj as any), zIndex: prevZ },
          [(prevObj as any).id]: { ...(prevObj as any), zIndex: currentZ }
        }
      };
    }
  }

  return state;
}

export function updatePermissionsReducer(state: any, action: any): any {
  if (action.type !== 'UPDATE_PERMISSIONS') return state;

  const obj = state.objects[action.payload.id];
  if (!obj) return state;

  return {
    ...state,
    objects: {
      ...state.objects,
      [action.payload.id]: {
        ...obj,
        allowedActions: action.payload.allowedActions,
        allowedActionsForGM: action.payload.allowedActionsForGM
      }
    }
  };
}

export function updateActionButtonsReducer(state: any, action: any): any {
  if (action.type !== 'UPDATE_ACTION_BUTTONS') return state;

  const obj = state.objects[action.payload.id];
  if (!obj) return state;

  return {
    ...state,
    objects: {
      ...state.objects,
      [action.payload.id]: {
        ...obj,
        actionButtons: action.payload.actionButtons,
        singleClickAction: action.payload.singleClickAction,
        doubleClickAction: action.payload.doubleClickAction
      }
    }
  };
}
