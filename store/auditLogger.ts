import { Action } from './gameActions';
import { AuditLogEntry, AuditActionType, AuditLogState, GameState, ItemType } from '../types';
import { generateUUID } from '../utils/uuid';

// Helper function to round coordinates to 2 decimal places
function roundToDecimals(value: number, decimals: number = 2): number {
  const multiplier = Math.pow(10, decimals);
  return Math.round(value * multiplier) / multiplier;
}

// Helper function to format rounded value
function formatValue(value: number, decimals: number = 2): number {
  return roundToDecimals(value, decimals);
}

// Action type to audit action type mapping
const ACTION_TO_AUDIT_MAP: Record<string, (action: Action, state: any) => {
  actionType: AuditActionType;
  description: string;
  details?: Partial<AuditLogEntry['details']>;
} | null> = {
  'ADD_OBJECT': (action, state) => {
    const obj = action.payload;
    return {
      actionType: AuditActionType.OBJECT_CREATED,
      description: `Created ${obj.type}${obj.name ? ` "${obj.name}"` : ''}`,
      details: {
        objectId: obj.id,
        objectType: obj.type,
        objectName: obj.name,
      }
    };
  },
  'DELETE_OBJECT': (action, state) => {
    const obj = state.objects[action.payload.id];
    if (!obj) return null;
    return {
      actionType: AuditActionType.OBJECT_DELETED,
      description: `Deleted ${obj.type}${obj.name ? ` "${obj.name}"` : ''}`,
      details: {
        objectId: obj.id,
        objectType: obj.type,
        objectName: obj.name,
      }
    };
  },
  'MOVE_OBJECT_COMMIT': (action, state) => {
    const obj = state.objects[action.payload.id];
    if (!obj) return null;
    let fromX = formatValue(action.payload.previousX);
    let fromY = formatValue(action.payload.previousY);
    const toX = formatValue(action.payload.x);
    const toY = formatValue(action.payload.y);

    // For cursor slot drops, use originalX/originalY if previous position is -999999
    if (action.payload.previousX < -900000 || action.payload.previousY < -900000) {
      fromX = formatValue((obj as any).originalX ?? action.payload.previousX);
      fromY = formatValue((obj as any).originalY ?? action.payload.previousY);
    }

    // Skip only when moving TO cursor slot (destination is -999999)
    if (action.payload.x < -900000 || action.payload.y < -900000) {
      return null;
    }

    // Skip if position didn't actually change
    if (fromX === toX && fromY === toY) {
      return null;
    }

    const objName = obj.name ? ` "${obj.name}"` : '';
    return {
      actionType: AuditActionType.OBJECT_MOVED,
      description: `Moved${objName} from (${fromX}, ${fromY}) to (${toX}, ${toY})`,
      details: {
        objectId: obj.id,
        objectType: obj.type,
        objectName: obj.name,
        fromPosition: { x: fromX, y: fromY },
        toPosition: { x: toX, y: toY },
      }
    };
  },
  'UPDATE_OBJECT': (action, state) => {
    const obj = state.objects[action.payload.id];
    if (!obj) return null;

    // Handle case where payload has 'updates' field containing actual changes
    let actualUpdates = action.payload;
    if ((action.payload as any).updates && typeof (action.payload as any).updates === 'object') {
      actualUpdates = { id: action.payload.id, ...(action.payload as any).updates };
    }

    // Filter out technical/internal fields that shouldn't appear in logs
    const technicalFields = [
      'id', 'inCursorSlot', 'isOnTable', 'clickOffsetX_PX', 'clickOffsetY_PX',
      'clickOffsetX', 'clickOffsetY', 'originalX', 'originalY', 'originalZ',
      'lastModifiedBy', 'synced', 'dirty', 'gridCellMagnetPoints'
    ];

    // Get updates that are NOT technical fields AND actually changed value
    const updates = Object.keys(actualUpdates).filter(k => {
      if (technicalFields.includes(k)) return false;
      const newValue = (actualUpdates as any)[k];
      const oldValue = (obj as any)[k];
      // Only include if value actually changed
      return newValue !== oldValue;
    });

    if (updates.length === 0) return null;

    const objName = obj.name ? ` "${obj.name}"` : '';

    // Special handling for cursor slot drops (moving from -999999 to valid position)
    const toX = (actualUpdates as any).x;
    const toY = (actualUpdates as any).y;
    if ((toX !== undefined && toX < -900000) || (toY !== undefined && toY < -900000)) {
      return null; // Skip when moving TO cursor slot
    }

    // Determine the types of changes
    const hasPosition = updates.includes('x') && updates.includes('y');
    const hasRotation = updates.includes('rotation') || updates.includes('baseRotation');
    const hasResize = updates.includes('width') || updates.includes('height');
    const hasZIndex = updates.includes('zIndex');
    const hasLayer = updates.includes('hyperscaleLayerId');
    const hasLocked = updates.includes('locked');
    const hasName = updates.includes('name');
    const hasOther = updates.some(k => !['x', 'y', 'rotation', 'baseRotation', 'width', 'height', 'zIndex', 'hyperscaleLayerId', 'locked', 'name'].includes(k));

    // Build collection of tags and description parts
    const tags: AuditActionType[] = [];
    const descriptionParts: string[] = [];
    const newValue: any = {};

    // Handle position change
    if (hasPosition) {
      tags.push(AuditActionType.OBJECT_MOVED);
      let fromX = formatValue(obj.x);
      let fromY = formatValue(obj.y);
      const destX = formatValue(toX);
      const destY = formatValue(toY);

      // For cursor slot drops, use originalX/originalY if current position is -999999
      if (obj.x < -900000 || obj.y < -900000) {
        fromX = formatValue((obj as any).originalX ?? obj.x);
        fromY = formatValue((obj as any).originalY ?? obj.y);
      }

      // Skip if position didn't actually change
      if (fromX !== destX || fromY !== destY) {
        descriptionParts.push(`position: (${fromX}, ${fromY}) → (${destX}, ${destY})`);
        newValue.x = toX;
        newValue.y = toY;
      }
    }

    // Handle rotation change
    if (hasRotation) {
      const oldRot = Math.round((obj as any).rotation ?? (obj as any).baseRotation ?? 0);
      const newRot = Math.round((actualUpdates as any).rotation ?? (actualUpdates as any).baseRotation ?? oldRot);
      if (oldRot !== newRot) {
        tags.push(AuditActionType.OBJECT_ROTATED);
        descriptionParts.push(`rotation: ${oldRot}° → ${newRot}°`);
        newValue.rotation = newRot;
      }
    }

    // Handle resize change
    if (hasResize) {
      tags.push(AuditActionType.OBJECT_RESIZED);
      const sizeParts = [];
      if (updates.includes('width')) {
        const oldW = Math.round((obj as any).width);
        const newW = Math.round((actualUpdates as any).width);
        sizeParts.push(`width: ${oldW} → ${newW}`);
        newValue.width = newW;
      }
      if (updates.includes('height')) {
        const oldH = Math.round((obj as any).height);
        const newH = Math.round((actualUpdates as any).height);
        sizeParts.push(`height: ${oldH} → ${newH}`);
        newValue.height = newH;
      }
      descriptionParts.push(sizeParts.join(', '));
    }

    // Handle z-index change
    if (hasZIndex) {
      tags.push(AuditActionType.OBJECT_LAYER_CHANGED);
      const oldZ = (obj as any).zIndex ?? 0;
      const newZ = (actualUpdates as any).zIndex;
      descriptionParts.push(`layer: ${oldZ} → ${newZ}`);
      newValue.zIndex = newZ;
    }

    // Handle layer change
    if (hasLayer) {
      tags.push(AuditActionType.OBJECT_LAYER_CHANGED);
      const oldLayer = (obj as any).hyperscaleLayerId || 'default';
      const newLayer = (actualUpdates as any).hyperscaleLayerId;
      descriptionParts.push(`hyperscale: "${oldLayer}" → "${newLayer}"`);
      newValue.hyperscaleLayerId = newLayer;
    }

    // Handle locked change
    if (hasLocked) {
      tags.push(AuditActionType.OBJECT_LOCKED);
      const isLocked = (actualUpdates as any).locked;
      descriptionParts.push(isLocked ? 'locked' : 'unlocked');
      newValue.locked = isLocked;
    }

    // Handle name change
    if (hasName) {
      tags.push(AuditActionType.OBJECT_UPDATED);
      const oldName = (obj as any).name || '';
      const newName = (actualUpdates as any).name;
      descriptionParts.push(`name: "${oldName}" → "${newName}"`);
      newValue.name = newName;
    }

    // Handle other changes
    if (hasOther) {
      tags.push(AuditActionType.OBJECT_UPDATED);
      for (const k of updates) {
        if (['x', 'y', 'rotation', 'baseRotation', 'width', 'height', 'zIndex', 'hyperscaleLayerId', 'locked', 'name'].includes(k)) continue;
        const val = (actualUpdates as any)[k];
        const oldVal = (obj as any)[k];
        descriptionParts.push(`${k}: ${JSON.stringify(oldVal)} → ${JSON.stringify(val)}`);
        newValue[k] = val;
      }
    }

    // If no tags were added (e.g., position didn't actually change), return null
    if (tags.length === 0) {
      return null;
    }

    // For single tag with simple description, use existing format
    if (tags.length === 1 && descriptionParts.length === 1) {
      const tag = tags[0];
      if (tag === AuditActionType.OBJECT_MOVED) {
        const match = descriptionParts[0].match(/position: \(([^,]+), ([^)]+)\) → \(([^,]+), ([^)]+)\)/);
        if (match) {
          return {
            actionType: tag,
            description: `Moved${objName} from (${match[1]}, ${match[2]}) to (${match[3]}, ${match[4]})`,
            details: {
              objectId: obj.id,
              objectType: obj.type,
              objectName: obj.name,
              fromPosition: { x: parseFloat(match[1]), y: parseFloat(match[2]) },
              toPosition: { x: parseFloat(match[3]), y: parseFloat(match[4]) },
              newValue,
            }
          };
        }
      }
      if (tag === AuditActionType.OBJECT_ROTATED) {
        const match = descriptionParts[0].match(/rotation: (\d+)° → (\d+)°/);
        if (match) {
          return {
            actionType: tag,
            description: `Rotated${objName}: ${match[1]}° → ${match[2]}°`,
            details: {
              objectId: obj.id,
              objectType: obj.type,
              objectName: obj.name,
              newValue,
            }
          };
        }
      }
      if (tag === AuditActionType.OBJECT_RESIZED) {
        return {
          actionType: tag,
          description: `Resized${objName}: ${descriptionParts[0]}`,
          details: {
            objectId: obj.id,
            objectType: obj.type,
            objectName: obj.name,
            newValue,
          }
        };
      }
      if (tag === AuditActionType.OBJECT_LAYER_CHANGED) {
        return {
          actionType: tag,
          description: `Layer${objName}: ${descriptionParts[0]}`,
          details: {
            objectId: obj.id,
            objectType: obj.type,
            objectName: obj.name,
            newValue,
          }
        };
      }
      if (tag === AuditActionType.OBJECT_LOCKED) {
        return {
          actionType: tag,
          description: `${descriptionParts[0].charAt(0).toUpperCase() + descriptionParts[0].slice(1)}${objName}`,
          details: {
            objectId: obj.id,
            objectType: obj.type,
            objectName: obj.name,
            newValue,
          }
        };
      }
    }

    // For multiple changes or complex changes, use combined format
    return {
      actionType: tags[0], // Primary tag (first detected)
      tags: tags.length > 1 ? tags : undefined,
      description: `Changed${objName}: ${descriptionParts.join(', ')}`,
      details: {
        objectId: obj.id,
        objectType: obj.type,
        objectName: obj.name,
        newValue,
      }
    };
  },
  'ROTATE_OBJECT': (action, state) => {
    const obj = state.objects[action.payload.id];
    if (!obj) return null;
    return {
      actionType: AuditActionType.OBJECT_ROTATED,
      description: `Rotated ${obj.type}${obj.name ? ` "${obj.name}"` : ''}`,
      details: {
        objectId: obj.id,
        objectType: obj.type,
        objectName: obj.name,
      }
    };
  },
  'SET_ROTATION': (action, state) => {
    const obj = state.objects[action.payload.id];
    if (!obj) return null;
    return {
      actionType: AuditActionType.OBJECT_ROTATED,
      description: `Set rotation of ${obj.type}${obj.name ? ` "${obj.name}"` : ''} to ${action.payload.rotation}°`,
      details: {
        objectId: obj.id,
        objectType: obj.type,
        objectName: obj.name,
        newValue: { rotation: action.payload.rotation },
      }
    };
  },
  'TOGGLE_LOCK': (action, state) => {
    const obj = state.objects[action.payload.id];
    if (!obj) return null;
    return {
      actionType: AuditActionType.OBJECT_LOCKED,
      description: `${obj.locked ? 'Locked' : 'Unlocked'} ${obj.type}${obj.name ? ` "${obj.name}"` : ''}`,
      details: {
        objectId: obj.id,
        objectType: obj.type,
        objectName: obj.name,
        newValue: { locked: !obj.locked },
      }
    };
  },
  'TOGGLE_ON_TABLE': (action, state) => {
    const obj = state.objects[action.payload.id];
    if (!obj) return null;
    return {
      actionType: AuditActionType.OBJECT_HIDDEN,
      description: `${obj.isOnTable ? 'Showed' : 'Hid'} ${obj.type}${obj.name ? ` "${obj.name}"` : ''}`,
      details: {
        objectId: obj.id,
        objectType: obj.type,
        objectName: obj.name,
        newValue: { isOnTable: !obj.isOnTable },
      }
    };
  },
  'DRAW_CARD': (action, state) => {
    const deck = state.objects[action.payload.deckId];
    return {
      actionType: AuditActionType.CARD_DRAWN,
      description: `Drew card from ${deck?.name || 'deck'}`,
      details: {
        objectId: action.payload.deckId,
        objectType: ItemType.DECK,
        objectName: deck?.name,
        metadata: { playerId: action.payload.playerId },
      }
    };
  },
  'PLAY_CARD': (action, state) => {
    const card = state.objects[action.payload.cardId];
    return {
      actionType: AuditActionType.CARD_PLAYED,
      description: `Played card to (${action.payload.x}, ${action.payload.y})`,
      details: {
        objectId: action.payload.cardId,
        objectType: ItemType.CARD,
        objectName: card?.name,
        toPosition: { x: action.payload.x, y: action.payload.y },
      }
    };
  },
  'PLAY_TOP_CARD': (action, state) => {
    const deck = state.objects[action.payload.deckId];
    return {
      actionType: AuditActionType.CARD_PLAYED,
      description: `Played top card from ${deck?.name || 'deck'}`,
      details: {
        objectId: action.payload.deckId,
        objectType: ItemType.DECK,
        objectName: deck?.name,
      }
    };
  },
  'FLIP_CARD': (action, state) => {
    const card = state.objects[action.payload.cardId];
    return {
      actionType: AuditActionType.CARD_FLIPPED,
      description: `Flipped card`,
      details: {
        objectId: action.payload.cardId,
        objectType: ItemType.CARD,
        objectName: card?.name,
      }
    };
  },
  'SHUFFLE_DECK': (action, state) => {
    const deck = state.objects[action.payload.deckId];
    return {
      actionType: AuditActionType.DECK_SHUFFLED,
      description: `Shuffled ${deck?.name || 'deck'}`,
      details: {
        objectId: action.payload.deckId,
        objectType: ItemType.DECK,
        objectName: deck?.name,
      }
    };
  },
  'ADD_STROKE_TO_DRAWING': (action, state) => {
    const drawing = state.objects[action.payload.drawingId];
    return {
      actionType: AuditActionType.STROKE_ADDED,
      description: `Added stroke to ${drawing?.name || 'drawing'}`,
      details: {
        objectId: action.payload.drawingId,
        objectType: ItemType.DRAWING,
        objectName: drawing?.name,
      }
    };
  },
  'FINISH_DRAWING_STROKE': (action, state) => {
    if (action.payload.drawingId) {
      const drawing = state.objects[action.payload.drawingId];
      return {
        actionType: AuditActionType.STROKE_ADDED,
        description: `Finished stroke on ${drawing?.name || 'drawing'}`,
        details: {
          objectId: action.payload.drawingId,
          objectType: ItemType.DRAWING,
          objectName: drawing?.name,
        }
      };
    }
    return {
      actionType: AuditActionType.STROKE_ADDED,
      description: `Created new drawing`,
    };
  },
  'ADD_PLAYER': (action, state) => {
    return {
      actionType: AuditActionType.PLAYER_JOINED,
      description: `Player "${action.payload.name}" joined`,
      details: {
        metadata: { playerId: action.payload.id, isGM: action.payload.isGM },
      }
    };
  },
  'REMOVE_PLAYER': (action, state) => {
    const player = state.players.find(p => p.id === action.payload.id);
    return {
      actionType: AuditActionType.PLAYER_LEFT,
      description: `Player "${player?.name || 'Unknown'}" left`,
      details: {
        metadata: { playerId: action.payload.id },
      }
    };
  },
  'UPDATE_PLAYER_PERMISSIONS': (action, state) => {
    return {
      actionType: AuditActionType.SETTINGS_CHANGED,
      description: `Updated player permissions`,
      details: {
        newValue: action.payload,
      }
    };
  },
  'UPDATE_LANGUAGE': (action, state) => {
    return {
      actionType: AuditActionType.SETTINGS_CHANGED,
      description: `Changed language to ${action.payload}`,
      details: {
        newValue: { language: action.payload },
      }
    };
  },
  'TOGGLE_CONNECTIONS_LOCKED': (action, state) => {
    return {
      actionType: AuditActionType.SETTINGS_CHANGED,
      description: `${state.connectionsLocked ? 'Unlocked' : 'Locked'} player connections`,
      details: {
        newValue: { connectionsLocked: !state.connectionsLocked },
      }
    };
  },
  'CREATE_PANEL': (action, state) => {
    return {
      actionType: AuditActionType.OBJECT_CREATED,
      description: `Created panel: ${action.payload.panelType}`,
      details: {
        objectType: ItemType.PANEL,
        metadata: { panelType: action.payload.panelType },
      }
    };
  },
  'CREATE_WINDOW': (action, state) => {
    return null;
  },
  'CLOSE_UI_OBJECT': (action, state) => {
    return null;
  },
  'SPAWN_TOKEN_FROM_ARCHETYPE': (action, state) => {
    return {
      actionType: AuditActionType.OBJECT_CREATED,
      description: `Spawned token from archetype at (${action.payload.x}, ${action.payload.y})`,
      details: {
        toPosition: { x: action.payload.x, y: action.payload.y },
        metadata: { archetypeId: action.payload.archetypeId },
      }
    };
  },
  'CLONE_OBJECT': (action, state) => {
    const obj = state.objects[action.payload.id];
    return {
      actionType: AuditActionType.OBJECT_CREATED,
      description: `Cloned ${obj?.type || 'object'}`,
      details: {
        objectId: action.payload.id,
        objectType: obj?.type,
        objectName: obj?.name,
      }
    };
  },
  'MOVE_OBJECT_TO_HYPERSCALE_LAYER': (action, state) => {
    const obj = state.objects[action.payload.objectId];
    if (!obj) return null;
    const oldLayer = (obj as any).hyperscaleLayerId || 'default';
    const newLayer = action.payload.layerId;
    if (oldLayer === newLayer) return null;
    return {
      actionType: AuditActionType.OBJECT_LAYER_CHANGED,
      description: `Moved ${obj.type}${obj.name ? ` "${obj.name}"` : ''} from layer "${oldLayer}" to "${newLayer}"`,
      details: {
        objectId: obj.id,
        objectType: obj.type,
        objectName: obj.name,
        previousValue: { layerId: oldLayer },
        newValue: { layerId: newLayer },
      }
    };
  },
  'MOVE_LAYER_UP': (action, state) => {
    const obj = state.objects[action.payload.id];
    if (!obj) return null;
    const oldZ = obj.zIndex ?? 0;
    const newZ = oldZ + 1;
    return {
      actionType: AuditActionType.OBJECT_LAYER_CHANGED,
      description: `Layer${obj.name ? ` "${obj.name}"` : ''}: ${oldZ} → ${newZ}`,
      details: {
        objectId: obj.id,
        objectType: obj.type,
        objectName: obj.name,
        previousValue: { zIndex: oldZ },
        newValue: { zIndex: newZ },
      }
    };
  },
  'MOVE_LAYER_DOWN': (action, state) => {
    const obj = state.objects[action.payload.id];
    if (!obj) return null;
    const oldZ = obj.zIndex ?? 0;
    const newZ = Math.max(0, oldZ - 1);
    return {
      actionType: AuditActionType.OBJECT_LAYER_CHANGED,
      description: `Layer${obj.name ? ` "${obj.name}"` : ''}: ${oldZ} → ${newZ}`,
      details: {
        objectId: obj.id,
        objectType: obj.type,
        objectName: obj.name,
        previousValue: { zIndex: oldZ },
        newValue: { zIndex: newZ },
      }
    };
  },
  'BRING_TO_FRONT': (action, state) => {
    const obj = state.objects[action.payload.id];
    if (!obj) return null;
    const oldZ = obj.zIndex ?? 0;
    return {
      actionType: AuditActionType.OBJECT_LAYER_CHANGED,
      description: `Brought ${obj.type}${obj.name ? ` "${obj.name}"` : ''} to front`,
      details: {
        objectId: obj.id,
        objectType: obj.type,
        objectName: obj.name,
        previousValue: { zIndex: oldZ },
        newValue: { zIndex: 'front' },
      }
    };
  },
  'SEND_TO_BACK': (action, state) => {
    const obj = state.objects[action.payload.id];
    if (!obj) return null;
    const oldZ = obj.zIndex ?? 0;
    return {
      actionType: AuditActionType.OBJECT_LAYER_CHANGED,
      description: `Sent ${obj.type}${obj.name ? ` "${obj.name}"` : ''} to back`,
      details: {
        objectId: obj.id,
        objectType: obj.type,
        objectName: obj.name,
        previousValue: { zIndex: oldZ },
        newValue: { zIndex: 'back' },
      }
    };
  },
};

/**
 * Create an audit log entry from an action
 */
export function createAuditLogEntry(
  action: Action,
  state: any,
  playerId: string,
  playerName: string,
  isGM: boolean
): AuditLogEntry | null {
  // Skip local-only and excluded actions
  if (action._localOnly || action._excludeFromHistory) {
    return null;
  }

  // Skip picking up to cursor slot (when destination is -999999)
  // But allow dropping from cursor slot (when source is -999999 but destination is valid)
  const payload = action.payload;
  if (payload && typeof payload === 'object') {
    const checkCoord = (val: any) => typeof val === 'number' && val < -900000;
    const toX = (payload as any).updates?.x ?? payload.x;
    const toY = (payload as any).updates?.y ?? payload.y;
    // Skip only when moving TO cursor slot (destination is -999999)
    if (checkCoord(toX) || checkCoord(toY)) {
      return null;
    }
  }

  // Skip sync and restore actions
  if (action.type === 'SYNC_STATE' || action.type === 'RESTORE_IMAGES' ||
      action.type === 'UNDO_MARKER' || action.type === 'UNDO_GENERAL' ||
      action.type === 'LOAD_GAME' || action.type === 'SET_ACTIVE_ID' ||
      action.type === 'UPDATE_VIEW_TRANSFORM' || action.type === 'SET_PIXELS_PER_VU') {
    return null;
  }

  // Skip panel/window UI-only actions (position, size, z-index changes)
  if (action.type === 'RESIZE_UI_OBJECT' ||
      action.type === 'UPDATE_PLAYER_PANEL_SETTINGS') {
    return null;
  }

  // Skip layer actions only for panels/windows
  if ((action.type === 'MOVE_LAYER_UP' ||
       action.type === 'MOVE_LAYER_DOWN' ||
       action.type === 'BRING_TO_FRONT' ||
       action.type === 'SEND_TO_BACK') &&
      action.payload && action.payload.id) {
    const obj = state.objects[action.payload.id];
    if (obj && (obj.type === ItemType.PANEL || obj.type === ItemType.WINDOW)) {
      return null;
    }
  }

  // Skip cursor slot actions (adding/removing from cursor)
  if (action.type === 'DROP_FROM_CURSOR_SLOT') {
    return null;
  }

  // Skip MOVE_OBJECT (during drag) - only log MOVE_OBJECT_COMMIT at the end
  if (action.type === 'MOVE_OBJECT') {
    return null;
  }

  // Skip when object is picked up/dropped to cursor slot
  if (action.type === 'UPDATE_OBJECT' || action.type === 'MOVE_OBJECT_COMMIT') {
    const payload = action.payload;
    // Check if this action involves cursor slot (picking up/dropping)
    if ((payload as any).inCursorSlot === true ||
        (payload as any).updates?.inCursorSlot === true) {
      return null;
    }
  }

  // Skip MOVE_OBJECT_COMMIT for panels and windows
  if (action.type === 'MOVE_OBJECT_COMMIT') {
    const obj = state.objects[action.payload.id];
    if (obj && (obj.type === ItemType.PANEL || obj.type === ItemType.WINDOW)) {
      return null;
    }
  }

  // Skip UPDATE_OBJECT for position/size/z-index changes on panels and windows
  if (action.type === 'UPDATE_OBJECT') {
    const obj = state.objects[action.payload.id];
    if (obj && (obj.type === ItemType.PANEL || obj.type === ItemType.WINDOW)) {
      // Only log if it's not just position/size/z-index update
      const updates = Object.keys(action.payload).filter(k => k !== 'id');
      const isUiOnlyUpdate = updates.every(k =>
        ['x', 'y', 'width', 'height', 'zIndex', 'minimized', 'isPinnedToViewport',
         'pinnedScreenPosition', 'expandedState', 'collapsedState'].includes(k)
      );
      if (isUiOnlyUpdate) {
        return null;
      }
    }
  }

  const mapper = ACTION_TO_AUDIT_MAP[action.type];
  if (!mapper) {
    // For unmapped actions, create a generic entry
    return {
      id: generateUUID(),
      timestamp: Date.now(),
      playerId,
      playerName,
      isGM,
      actionType: AuditActionType.SETTINGS_CHANGED,
      details: {
        description: action.type,
        metadata: { payload: action.payload },
      },
      action,
    };
  }

  const result = mapper(action, state);
  if (!result) return null;

  return {
    id: generateUUID(),
    timestamp: Date.now(),
    playerId,
    playerName,
    isGM,
    actionType: result.actionType,
    details: {
      ...result.details,
      description: result.description,
    },
    action,
  };
}

/**
 * Filter audit log entries
 */
export function filterAuditLog(
  entries: AuditLogEntry[],
  filters: {
    actionTypes?: AuditActionType[];
    playerIds?: string[];
    objectTypes?: ItemType[];
    searchQuery?: string;
    startTime?: number;
    endTime?: number;
  }
): AuditLogEntry[] {
  return entries.filter(entry => {
    if (filters.actionTypes && !filters.actionTypes.includes(entry.actionType)) {
      return false;
    }
    if (filters.playerIds && !filters.playerIds.includes(entry.playerId)) {
      return false;
    }
    if (filters.objectTypes && entry.details.objectType && !filters.objectTypes.includes(entry.details.objectType)) {
      return false;
    }
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      const searchableText = [
        entry.playerName,
        entry.details.description || '',
        entry.details.objectName || '',
        entry.actionType,
      ].join(' ').toLowerCase();
      if (!searchableText.includes(query)) {
        return false;
      }
    }
    if (filters.startTime && entry.timestamp < filters.startTime) {
      return false;
    }
    if (filters.endTime && entry.timestamp > filters.endTime) {
      return false;
    }
    return true;
  });
}

/**
 * Replay actions to a specific index
 * This takes a base state and replays all actions up to the given index
 */
export function replayToIndex(baseState: GameState, entries: AuditLogEntry[], targetIndex: number): GameState {
  let currentState = { ...baseState };

  // Replay actions up to target index
  for (let i = 0; i <= targetIndex && i < entries.length; i++) {
    const entry = entries[i];
    // Apply the action - this would need to use the reducer
    // For now, we'll store the actions and let the GameContext handle replay
    currentState = {
      ...currentState,
      auditLog: {
        ...currentState.auditLog,
        currentReplayIndex: i,
      }
    };
  }

  return currentState;
}

/**
 * Create inverse action for undo functionality
 */
export function createInverseAction(action: Action, state: any): Action | null {
  switch (action.type) {
    case 'MOVE_OBJECT_COMMIT':
      return {
        type: 'MOVE_OBJECT',
        payload: {
          id: action.payload.id,
          x: action.payload.previousX,
          y: action.payload.previousY,
        },
        _excludeFromHistory: true,
      } as Action;
    case 'DELETE_OBJECT':
      // Would need the full object from state
      const obj = state.objects[action.payload.id];
      if (!obj) return null;
      return {
        type: 'ADD_OBJECT',
        payload: obj,
        _excludeFromHistory: true,
      } as Action;
    case 'ADD_OBJECT':
      return {
        type: 'DELETE_OBJECT',
        payload: { id: action.payload.id },
        _excludeFromHistory: true,
      } as Action;
    default:
      return null;
  }
}
