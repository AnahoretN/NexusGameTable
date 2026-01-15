import { TableObject, ItemType } from '../../types';

/**
 * Reducer functions for UI object (panel/window) manipulation actions
 * CREATE_PANEL, CREATE_WINDOW, CLOSE_UI_OBJECT, TOGGLE_MINIMIZE, RESIZE_UI_OBJECT, etc.
 */

export function createPanelReducer(state: any, action: any): any {
  if (action.type !== 'CREATE_PANEL') return state;

  const { panelType, playerId, x, y, width, height, title } = action.payload;
  const id = `panel-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;

  const panel = {
    id,
    type: ItemType.PANEL,
    name: title || panelType,
    x,
    y,
    width: width ?? 300,
    height: height ?? 400,
    rotation: 0,
    locked: false,
    minimized: false,
    visible: true,
    zIndex: 1000,
    panelType,
    title: title || panelType,
    playerId,
    dualPosition: true, // Enable dual position by default
    isPinnedToViewport: false
  };

  return {
    ...state,
    objects: {
      ...state.objects,
      [id]: panel
    }
  };
}

export function createWindowReducer(state: any, action: any): any {
  if (action.type !== 'CREATE_WINDOW') return state;

  const { windowType, targetObjectId, x, y, width, height, title } = action.payload;
  const id = `window-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;

  const windowObj = {
    id,
    type: ItemType.WINDOW,
    name: title || windowType,
    x,
    y,
    width: width ?? 400,
    height: height ?? 500,
    rotation: 0,
    locked: false,
    visible: true,
    zIndex: 10000,
    windowType,
    targetObjectId,
    isPinnedToViewport: false
  };

  return {
    ...state,
    objects: {
      ...state.objects,
      [id]: windowObj
    }
  };
}

export function closeUIObjectReducer(state: any, action: any): any {
  if (action.type !== 'CLOSE_UI_OBJECT') return state;

  const newObjects = { ...state.objects };
  delete newObjects[action.payload.id];

  return { ...state, objects: newObjects };
}

export function toggleMinimizeReducer(state: any, action: any): any {
  if (action.type !== 'TOGGLE_MINIMIZE') return state;

  const obj = state.objects[action.payload.id];
  if (!obj) return state;

  const isMinimizing = !(obj as any).minimized;
  const hasDualPosition = (obj as any).dualPosition || false;
  const isPinned = (obj as any).isPinnedToViewport || false;

  if (!hasDualPosition || !isPinned) {
    // Simple toggle without dual position
    return {
      ...state,
      objects: {
        ...state.objects,
        [action.payload.id]: {
          ...obj,
          minimized: isMinimizing
        }
      }
    };
  }

  // Dual position mode with pinning
  const currentScrollLeft = state.viewTransform.scroll.x;
  const currentScrollTop = state.viewTransform.scroll.y;
  const newObj: any = {
    ...obj,
    minimized: isMinimizing
  };

  if (isMinimizing) {
    // Save expanded state
    if (!(obj as any).expandedPinnedPosition) {
      newObj.expandedPinnedPosition = {
        x: (obj as any).pinnedScreenPosition?.x || obj.x,
        y: (obj as any).pinnedScreenPosition?.y || obj.y
      };
    }
    newObj.expandedState = {
      x: obj.x,
      y: obj.y,
      width: obj.width,
      height: obj.height
    };

    // Use collapsed position if available
    if ((obj as any).collapsedPinnedPosition) {
      newObj.x = (obj as any).collapsedPinnedPosition.x + currentScrollLeft;
      newObj.y = (obj as any).collapsedPinnedPosition.y + currentScrollTop;
    }
  } else {
    // Save collapsed state
    if (!(obj as any).collapsedPinnedPosition) {
      newObj.collapsedPinnedPosition = {
        x: (obj as any).pinnedScreenPosition?.x || obj.x,
        y: (obj as any).pinnedScreenPosition?.y || obj.y
      };
    }

    // Use expanded position if available
    if ((obj as any).expandedPinnedPosition) {
      newObj.x = (obj as any).expandedPinnedPosition.x + currentScrollLeft;
      newObj.y = (obj as any).expandedPinnedPosition.y + currentScrollTop;
    }

    if ((obj as any).expandedState) {
      newObj.width = (obj as any).expandedState.width;
      newObj.height = (obj as any).expandedState.height;
    }
  }

  newObj.pinnedScreenPosition = {
    x: newObj.x - currentScrollLeft,
    y: newObj.y - currentScrollTop
  };

  return {
    ...state,
    objects: {
      ...state.objects,
      [action.payload.id]: newObj
    }
  };
}

export function resizeUIObjectReducer(state: any, action: any): any {
  if (action.type !== 'RESIZE_UI_OBJECT') return state;

  const obj = state.objects[action.payload.id];
  if (!obj) return state;

  return {
    ...state,
    objects: {
      ...state.objects,
      [action.payload.id]: {
        ...obj,
        width: action.payload.width,
        height: action.payload.height
      }
    }
  };
}

export function pinToViewportReducer(state: any, action: any): any {
  if (action.type !== 'PIN_TO_VIEWPORT') return state;

  const obj = state.objects[action.payload.id];
  if (!obj) return state;

  return {
    ...state,
    objects: {
      ...state.objects,
      [action.payload.id]: {
        ...obj,
        isPinnedToViewport: true,
        pinnedScreenPosition: {
          x: action.payload.screenX,
          y: action.payload.screenY
        },
        dualPosition: (obj as any).dualPosition ?? true
      } as TableObject
    }
  };
}

export function unpinFromViewportReducer(state: any, action: any): any {
  if (action.type !== 'UNPIN_FROM_VIEWPORT') return state;

  const obj = state.objects[action.payload.id];
  if (!obj) return state;

  const newObj: any = {
    ...obj,
    x: action.payload.worldX,
    y: action.payload.worldY,
    isPinnedToViewport: false,
    pinnedScreenPosition: undefined,
    expandedPinnedPosition: undefined,
    collapsedPinnedPosition: undefined
  };

  return {
    ...state,
    objects: {
      ...state.objects,
      [action.payload.id]: newObj
    }
  };
}
