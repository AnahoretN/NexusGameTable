import { GameState, Action } from '../gameState';
import { TableObject, ItemType } from '../../types';
import { generateUUID } from '../../utils/uuid';

/**
 * Object Core Slice
 * Handles basic object operations (add, update, delete, move, etc.)
 */
export const objectSlice = (state: GameState, action: Action): GameState => {
  switch (action.type) {
    case 'ADD_OBJECT': {
      const newObject = action.payload;
      return {
        ...state,
        objects: {
          ...state.objects,
          [newObject.id]: newObject
        }
      };
    }

    case 'UPDATE_OBJECT': {
      const { objectId, updates } = action.payload;
      if (!state.objects[objectId]) return state;

      return {
        ...state,
        objects: {
          ...state.objects,
          [objectId]: {
            ...state.objects[objectId],
            ...updates
          }
        }
      };
    }

    case 'DELETE_OBJECT': {
      const objectId = action.payload;
      const { [objectId]: deleted, ...remainingObjects } = state.objects;
      return {
        ...state,
        objects: remainingObjects
      };
    }

    case 'CLONE_OBJECT': {
      const sourceObject = state.objects[action.payload.objectId];
      if (!sourceObject) return state;

      const clonedObject: TableObject = {
        ...JSON.parse(JSON.stringify(sourceObject)),
        id: generateUUID(),
        x: sourceObject.x + 20,
        y: sourceObject.y + 20
      };

      return {
        ...state,
        objects: {
          ...state.objects,
          [clonedObject.id]: clonedObject
        }
      };
    }

    case 'MOVE_OBJECT': {
      const { objectId, x, y } = action.payload;
      if (!state.objects[objectId]) return state;

      return {
        ...state,
        objects: {
          ...state.objects,
          [objectId]: {
            ...state.objects[objectId],
            x,
            y
          }
        }
      };
    }

    case 'TOGGLE_LOCK': {
      const objectId = action.payload;
      if (!state.objects[objectId]) return state;

      return {
        ...state,
        objects: {
          ...state.objects,
          [objectId]: {
            ...state.objects[objectId],
            locked: !state.objects[objectId].locked
          }
        }
      };
    }

    case 'TOGGLE_ON_TABLE': {
      const objectId = action.payload;
      if (!state.objects[objectId]) return state;

      return {
        ...state,
        objects: {
          ...state.objects,
          [objectId]: {
            ...state.objects[objectId],
            isOnTable: !state.objects[objectId].isOnTable
          }
        }
      };
    }

    case 'ROTATE_OBJECT': {
      const { objectId, rotation } = action.payload;
      if (!state.objects[objectId]) return state;

      return {
        ...state,
        objects: {
          ...state.objects,
          [objectId]: {
            ...state.objects[objectId],
            rotation
          }
        }
      };
    }

    case 'SET_ROTATION': {
      const { objectId, rotation } = action.payload;
      if (!state.objects[objectId]) return state;

      return {
        ...state,
        objects: {
          ...state.objects,
          [objectId]: {
            ...state.objects[objectId],
            rotation,
            baseRotation: rotation
          }
        }
      };
    }

    case 'MOVE_LAYER_UP':
    case 'MOVE_LAYER_DOWN':
    case 'BRING_TO_FRONT':
    case 'SEND_TO_BACK': {
      // Layer operations - simplified version
      const objectId = action.payload.objectId;
      if (!state.objects[objectId]) return state;

      // In a full implementation, this would recalculate z-indices
      // For now, just return state unchanged
      return state;
    }

    case 'SET_PIVOT_POINT': {
      const { objectId, pivot } = action.payload;
      if (!state.objects[objectId]) {
        console.warn('[SET_PIVOT_POINT] Object not found:', objectId);
        return state;
      }

      console.log('[SET_PIVOT_POINT] Updating pivot for', objectId, 'to', pivot);

      return {
        ...state,
        objects: {
          ...state.objects,
          [objectId]: {
            ...state.objects[objectId],
            pivot
          }
        }
      };
    }

    case 'TOGGLE_PIVOT_EDITING': {
      const objectId = action.payload;
      if (!state.objects[objectId]) return state;

      return {
        ...state,
        objects: {
          ...state.objects,
          [objectId]: {
            ...state.objects[objectId],
            isEditingPivot: !state.objects[objectId].isEditingPivot
          }
        }
      };
    }

    case 'SET_HITBOX_POLYGON': {
      const { objectId, hitboxPolygon } = action.payload;
      if (!state.objects[objectId]) return state;

      return {
        ...state,
        objects: {
          ...state.objects,
          [objectId]: {
            ...state.objects[objectId],
            hitboxPolygon
          }
        }
      };
    }

    default:
      return state;
  }
};