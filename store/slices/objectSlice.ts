import { GameState } from '../gameState';
import { Action } from '../gameActions';
import { TableObject } from '../../types';
import { generateUUID } from '../../utils/uuid';

/**
 * Object Core Slice
 * Handles basic object operations (add, update, delete, move, etc.)
 */
export const objectSlice = (state: GameState, action: Action): GameState => {
  switch (action.type) {
    case 'ADD_OBJECT': {
      const newObject = action.payload;
      // 🔍 DEBUG: Log object creation
      console.log('[ADD_OBJECT] Creating object:', {
        type: newObject.type,
        name: newObject.name,
        x: newObject.x,
        y: newObject.y,
        id: newObject.id
      });
      return {
        ...state,
        objects: {
          ...state.objects,
          [newObject.id]: newObject
        }
      };
    }

    case 'UPDATE_OBJECT': {
      const payload = action.payload;
      const objectId = payload.id;
      if (!state.objects[objectId]) return state;
      // Support both payload formats: { id, updates } and flat { id, ...changes }
      const updates = 'updates' in payload ? payload.updates : payload;

      return {
        ...state,
        objects: {
          ...state.objects,
          [objectId]: {
            ...state.objects[objectId],
            ...updates
          } as TableObject
        }
      };
    }

    case 'DELETE_OBJECT': {
      const { [action.payload.id]: _deleted, ...remainingObjects } = state.objects;
      return {
        ...state,
        objects: remainingObjects
      };
    }

    case 'CLONE_OBJECT': {
      const sourceObject = state.objects[action.payload.id];
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
      const { id: objectId, x, y } = action.payload;
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
      const objectId = action.payload.id;
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
      const objectId = action.payload.id;
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
      const { id: objectId, angle } = action.payload;
      if (!state.objects[objectId]) return state;

      return {
        ...state,
        objects: {
          ...state.objects,
          [objectId]: {
            ...state.objects[objectId],
            rotation: angle ?? state.objects[objectId].rotation
          }
        }
      };
    }

    case 'SET_ROTATION': {
      const { id: objectId, rotation } = action.payload;
      if (!state.objects[objectId]) return state;

      return {
        ...state,
        objects: {
          ...state.objects,
          [objectId]: {
            ...state.objects[objectId],
            rotation,
            baseRotation: rotation
          } as TableObject
        }
      };
    }

    case 'MOVE_LAYER_UP':
    case 'MOVE_LAYER_DOWN':
    case 'BRING_TO_FRONT':
    case 'SEND_TO_BACK': {
      // Layer operations - simplified version
      const objectId = action.payload.id;
      if (!state.objects[objectId]) return state;

      // In a full implementation, this would recalculate z-indices
      // For now, just return state unchanged
      return state;
    }

    case 'SET_PIVOT_POINT': {
      const { objectId, pivot } = action.payload;
      if (!state.objects[objectId]) {
        return state;
      }

      return {
        ...state,
        objects: {
          ...state.objects,
          [objectId]: {
            ...state.objects[objectId],
            pivot
          } as TableObject
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
            isEditingPivot: !(state.objects[objectId] as { isEditingPivot?: boolean }).isEditingPivot
          } as TableObject
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
          } as TableObject
        }
      };
    }

    default:
      return state;
  }
};
