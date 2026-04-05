import { ViewTransform } from '../store/gameState';
import { TableObject } from '../types';

interface ViewportInfo {
  width: number;
  height: number;
}

interface StoredGameState {
  version: number;
  viewport: ViewportInfo;
  state: any;
}

const STORAGE_VERSION = 2; // Increased version for new save structure

/**
 * Transform state for saving with viewport info
 */
export function prepareStateForStorage(state: any, viewportWidth: number, viewportHeight: number): string {
  const storedState: StoredGameState = {
    version: STORAGE_VERSION,
    viewport: { width: viewportWidth, height: viewportHeight },
    state,
  };
  return JSON.stringify(storedState);
}

/**
 * Load state and adapt object coordinates to current screen size
 */
export function loadAndAdaptState(storedData: string, currentViewportWidth: number, currentViewportHeight: number): any | null {
  try {
    const parsed = JSON.parse(storedData);

    // If old version format
    if (!parsed.version || parsed.version < 2) {
      return parsed; // Old format, return as is
    }

    const stored: StoredGameState = parsed;
    const oldViewport = stored.viewport;
    const newState = { ...stored.state };

    // Check if adaptation is needed
    const needsAdaptation =
      oldViewport.width !== currentViewportWidth ||
      oldViewport.height !== currentViewportHeight;

    if (!needsAdaptation) {
      return newState;
    }

    // Adapt object coordinates
    const scaleX = currentViewportWidth / oldViewport.width;
    const scaleY = currentViewportHeight / oldViewport.height;

    // Use average scale to preserve proportions
    const avgScale = (scaleX + scaleY) / 2;

    if (newState.objects) {
      const adaptedObjects: Record<string, TableObject> = {};

      Object.entries(newState.objects).forEach(([id, obj]: [string, any]) => {
        const adaptedObj = { ...obj };

        // For "floating" elements (pinned to viewport) - don't adapt
        if (obj.isPinnedToViewport) {
          adaptedObjects[id] = obj;
        } else {
          // Adapt position to new screen size
          adaptedObj.x = obj.x * scaleX;
          adaptedObj.y = obj.y * scaleY;

          // Optionally can also adapt object size
          // adaptedObj.width = obj.width * avgScale;
          // adaptedObj.height = obj.height * avgScale;
        }

        adaptedObjects[id] = adaptedObj;
      });

      newState.objects = adaptedObjects;
    }

    // Adapt viewTransform (pan/zoom)
    if (newState.viewTransform) {
      const vt: ViewTransform = newState.viewTransform;
      vt.scroll.x = vt.scroll.x * scaleX;
      vt.scroll.y = vt.scroll.y * scaleY;
    }

    return newState;
  } catch (e) {
    return null;
  }
}

/**
 * Get viewport information
 */
export function getViewportInfo(): ViewportInfo {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}
