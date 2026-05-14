/**
 * Panel Magnetism System
 * Provides snap-to-edge functionality for panel positioning and resizing
 */

/**
 * Game space bounds for magnetism (inner edges of scrollable area)
 * These represent the visible edges of the game world after scrolling
 */
export interface GameSpaceBounds {
  /** Left edge of visible game space (changes with horizontal scroll) */
  left: number;
  /** Top edge of visible game space (changes with vertical scroll) */
  top: number;
  /** Right edge of visible game space (left + viewport width) */
  right: number;
  /** Bottom edge of visible game space (top + viewport height) */
  bottom: number;
}

/**
 * Magnetism configuration
 */
export interface MagnetismConfig {
  /** Distance in pixels to trigger snap (default: 15) */
  snapThreshold?: number;
  /** Whether snapping is enabled (default: true) */
  enabled?: boolean;
  /** Snap to left edge (default: true) */
  snapToLeft?: boolean;
  /** Snap to right edge (default: true) */
  snapToRight?: boolean;
  /** Snap to top edge (default: true) */
  snapToTop?: boolean;
  /** Snap to bottom edge (default: true) */
  snapToBottom?: boolean;
  /** Width of scrollbars for inner edge snapping (default: 0) */
  scrollbarWidth?: number;
}

/**
 * Result of applying magnetism
 */
export interface MagnetismResult {
  /** The snapped position */
  x: number;
  y: number;
  /** Which edges were snapped to */
  snappedEdges: {
    left?: number;
    right?: number;
    top?: number;
    bottom?: number;
  };
}

/**
 * Default magnetism configuration
 */
const DEFAULT_CONFIG: Required<MagnetismConfig> = {
  snapThreshold: 15,
  enabled: true,
  snapToLeft: true,
  snapToRight: true,
  snapToTop: true,
  snapToBottom: true,
  scrollbarWidth: 0,
};

/**
 * Snap a value to a target if within threshold
 */
function snapToTarget(value: number, target: number, threshold: number): number {
  const distance = Math.abs(value - target);
  return distance <= threshold ? target : value;
}

/**
 * Apply magnetism to panel position during drag
 * Snaps panel edges to viewport edges when close
 *
 * @param x - Current X position
 * @param y - Current Y position
 * @param width - Panel width
 * @param height - Panel height
 * @param viewportWidth - Viewport width
 * @param viewportHeight - Viewport height
 * @param config - Magnetism configuration
 */
export function applyPositionMagnetism(
  x: number,
  y: number,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
  config: MagnetismConfig = {}
): MagnetismResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const snappedEdges: MagnetismResult['snappedEdges'] = {};

  if (!cfg.enabled) {
    return { x, y, snappedEdges };
  }

  let snappedX = x;
  let snappedY = y;

  // Snap left edge to viewport left
  if (cfg.snapToLeft) {
    const snapped = snapToTarget(x, 0, cfg.snapThreshold);
    if (snapped !== x) {
      snappedX = snapped;
      snappedEdges.left = 0;
    }
  }

  // Snap right edge to viewport right (consider scrollbar for inner edge)
  if (cfg.snapToRight) {
    const rightEdge = x + width;
    const targetRight = viewportWidth;
    const targetInnerRight = viewportWidth - cfg.scrollbarWidth;

    // Try snapping to inner edge (scrollbar) first
    if (cfg.scrollbarWidth > 0) {
      const snappedInner = snapToTarget(rightEdge, targetInnerRight, cfg.snapThreshold);
      if (snappedInner !== rightEdge) {
        snappedX = targetInnerRight - width;
        snappedEdges.right = targetInnerRight;
      } else {
        // Try snapping to outer edge (viewport edge)
        const snapped = snapToTarget(rightEdge, targetRight, cfg.snapThreshold);
        if (snapped !== rightEdge) {
          snappedX = targetRight - width;
          snappedEdges.right = viewportWidth;
        }
      }
    } else {
      // No scrollbar, snap to viewport edge
      const snapped = snapToTarget(rightEdge, targetRight, cfg.snapThreshold);
      if (snapped !== rightEdge) {
        snappedX = targetRight - width;
        snappedEdges.right = viewportWidth;
      }
    }
  }

  // Snap top edge to viewport top
  if (cfg.snapToTop) {
    const snapped = snapToTarget(y, 0, cfg.snapThreshold);
    if (snapped !== y) {
      snappedY = snapped;
      snappedEdges.top = 0;
    }
  }

  // Snap bottom edge to viewport bottom (consider scrollbar for inner edge)
  if (cfg.snapToBottom) {
    const bottomEdge = y + height;
    const targetBottom = viewportHeight;
    const targetInnerBottom = viewportHeight - cfg.scrollbarWidth;

    // Try snapping to inner edge (scrollbar) first
    if (cfg.scrollbarWidth > 0) {
      const snappedInner = snapToTarget(bottomEdge, targetInnerBottom, cfg.snapThreshold);
      if (snappedInner !== bottomEdge) {
        snappedY = targetInnerBottom - height;
        snappedEdges.bottom = targetInnerBottom;
      } else {
        // Try snapping to outer edge (viewport edge)
        const snapped = snapToTarget(bottomEdge, targetBottom, cfg.snapThreshold);
        if (snapped !== bottomEdge) {
          snappedY = targetBottom - height;
          snappedEdges.bottom = viewportHeight;
        }
      }
    } else {
      // No scrollbar, snap to viewport edge
      const snapped = snapToTarget(bottomEdge, targetBottom, cfg.snapThreshold);
      if (snapped !== bottomEdge) {
        snappedY = targetBottom - height;
        snappedEdges.bottom = viewportHeight;
      }
    }
  }

  return { x: snappedX, y: snappedY, snappedEdges };
}

/**
 * Result of applying resize magnetism
 */
export interface ResizeMagnetismResult {
  /** The snapped dimensions */
  width: number;
  height: number;
  /** Which edges were snapped to */
  snappedEdges: {
    right?: number;
    bottom?: number;
  };
}

/**
 * Apply magnetism to panel size during resize
 * Snaps panel edges to viewport edges when close
 *
 * @param x - Panel X position (fixed during resize)
 * @param y - Panel Y position (fixed during resize)
 * @param width - Current width
 * @param height - Current height
 * @param viewportWidth - Viewport width
 * @param viewportHeight - Viewport height
 * @param config - Magnetism configuration
 */
export function applyResizeMagnetism(
  x: number,
  y: number,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
  config: MagnetismConfig = {}
): ResizeMagnetismResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const snappedEdges: ResizeMagnetismResult['snappedEdges'] = {};

  if (!cfg.enabled) {
    return { width, height, snappedEdges };
  }

  let snappedWidth = width;
  let snappedHeight = height;

  // Snap right edge to viewport right (consider scrollbar for inner edge)
  if (cfg.snapToRight) {
    const rightEdge = x + width;
    const targetRight = viewportWidth;
    const targetInnerRight = viewportWidth - cfg.scrollbarWidth;

    // Try snapping to inner edge (scrollbar) first
    if (cfg.scrollbarWidth > 0) {
      const snappedInner = snapToTarget(rightEdge, targetInnerRight, cfg.snapThreshold);
      if (snappedInner !== rightEdge) {
        snappedWidth = targetInnerRight - x;
        snappedEdges.right = targetInnerRight;
      } else {
        // Try snapping to outer edge (viewport edge)
        const snapped = snapToTarget(rightEdge, targetRight, cfg.snapThreshold);
        if (snapped !== rightEdge) {
          snappedWidth = targetRight - x;
          snappedEdges.right = viewportWidth;
        }
      }
    } else {
      // No scrollbar, snap to viewport edge
      const snapped = snapToTarget(rightEdge, targetRight, cfg.snapThreshold);
      if (snapped !== rightEdge) {
        snappedWidth = targetRight - x;
        snappedEdges.right = viewportWidth;
      }
    }
  }

  // Snap bottom edge to viewport bottom (consider scrollbar for inner edge)
  if (cfg.snapToBottom) {
    const bottomEdge = y + height;
    const targetBottom = viewportHeight;
    const targetInnerBottom = viewportHeight - cfg.scrollbarWidth;

    // Try snapping to inner edge (scrollbar) first
    if (cfg.scrollbarWidth > 0) {
      const snappedInner = snapToTarget(bottomEdge, targetInnerBottom, cfg.snapThreshold);
      if (snappedInner !== bottomEdge) {
        snappedHeight = targetInnerBottom - y;
        snappedEdges.bottom = targetInnerBottom;
      } else {
        // Try snapping to outer edge (viewport edge)
        const snapped = snapToTarget(bottomEdge, targetBottom, cfg.snapThreshold);
        if (snapped !== bottomEdge) {
          snappedHeight = targetBottom - y;
          snappedEdges.bottom = viewportHeight;
        }
      }
    } else {
      // No scrollbar, snap to viewport edge
      const snapped = snapToTarget(bottomEdge, targetBottom, cfg.snapThreshold);
      if (snapped !== bottomEdge) {
        snappedHeight = targetBottom - y;
        snappedEdges.bottom = viewportHeight;
      }
    }
  }

  return { width: snappedWidth, height: snappedHeight, snappedEdges };
}

/**
 * Result of applying dual-edge resize magnetism (resizing from top-left)
 */
export interface DualResizeMagnetismResult {
  /** The snapped position */
  x: number;
  y: number;
  /** The snapped dimensions */
  width: number;
  height: number;
  /** Which edges were snapped to */
  snappedEdges: {
    left?: number;
    right?: number;
    top?: number;
    bottom?: number;
  };
}

/**
 * Apply magnetism during resize from top-left corner
 * Both position and size can change
 *
 * @param x - Current X position
 * @param y - Current Y position
 * @param width - Current width
 * @param height - Current height
 * @param rightEdge - Fixed right edge (original right)
 * @param bottomEdge - Fixed bottom edge (original bottom)
 * @param viewportWidth - Viewport width
 * @param viewportHeight - Viewport height
 * @param config - Magnetism configuration
 */
export function applyDualResizeMagnetism(
  x: number,
  y: number,
  width: number,
  height: number,
  rightEdge: number,
  bottomEdge: number,
  viewportWidth: number,
  viewportHeight: number,
  config: MagnetismConfig = {}
): DualResizeMagnetismResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const snappedEdges: DualResizeMagnetismResult['snappedEdges'] = {};

  if (!cfg.enabled) {
    return { x, y, width, height, snappedEdges };
  }

  let snappedX = x;
  let snappedY = y;
  let snappedWidth = width;
  let snappedHeight = height;

  // Snap left edge to viewport left
  if (cfg.snapToLeft) {
    const snapped = snapToTarget(x, 0, cfg.snapThreshold);
    if (snapped !== x) {
      snappedX = snapped;
      snappedWidth = rightEdge - snapped;
      snappedEdges.left = 0;
    }
  }

  // Snap top edge to viewport top
  if (cfg.snapToTop) {
    const snapped = snapToTarget(y, 0, cfg.snapThreshold);
    if (snapped !== y) {
      snappedY = snapped;
      snappedHeight = bottomEdge - snapped;
      snappedEdges.top = 0;
    }
  }

  return {
    x: snappedX,
    y: snappedY,
    width: snappedWidth,
    height: snappedHeight,
    snappedEdges,
  };
}

/**
 * Check if a position is near a snap edge
 * Useful for visual feedback (show snap indicator)
 */
export function getNearbyEdges(
  x: number,
  y: number,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
  threshold: number = DEFAULT_CONFIG.snapThreshold
): {
  left: boolean;
  right: boolean;
  top: boolean;
  bottom: boolean;
} {
  return {
    left: Math.abs(x) <= threshold,
    right: Math.abs(x + width - viewportWidth) <= threshold,
    top: Math.abs(y) <= threshold,
    bottom: Math.abs(y + height - viewportHeight) <= threshold,
  };
}

/**
 * Represents the bounds of another panel for magnetism
 */
export interface PanelBounds {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Extended magnetism result with panel snapping info
 */
export interface PanelMagnetismResult extends MagnetismResult {
  /** Which panel edges were snapped to */
  snappedToPanel?: {
    panelId: string;
    edge: 'left' | 'right' | 'top' | 'bottom';
    at: number;
  };
}

/**
 * Apply magnetism to panel position with panel-to-panel snapping
 * Only snaps panel edges TOGETHER (left to right, top to bottom), not alignment
 *
 * @param x - Current X position
 * @param y - Current Y position
 * @param width - Panel width
 * @param height - Panel height
 * @param viewportWidth - Viewport width
 * @param viewportHeight - Viewport height
 * @param otherPanels - Other panels to snap to (excluding current panel)
 * @param currentPanelId - ID of current panel (to exclude from otherPanels)
 * @param config - Magnetism configuration
 */
// Track last snapped positions for sticky snapping
const lastSnappedPositions: { [key: string]: { x: number; y: number; timestamp: number } } = {};

export function applyPanelToPanelMagnetism(
  x: number,
  y: number,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
  otherPanels: PanelBounds[],
  currentPanelId: string,
  config: MagnetismConfig = {},
  gameSpaceBounds?: GameSpaceBounds
): PanelMagnetismResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const snappedEdges: MagnetismResult['snappedEdges'] = {};
  let snappedToPanel: PanelMagnetismResult['snappedToPanel'] = undefined;

  if (!cfg.enabled) {
    return { x, y, snappedEdges };
  }

  let snappedX = x;
  let snappedY = y;
  const threshold = cfg.snapThreshold;

  // Filter out the current panel from other panels
  const nearbyPanels = otherPanels.filter(p => p.id !== currentPanelId);

  // Find closest snap targets separately for X and Y
  let bestXSnap = null;
  let bestXDist = threshold + 1; // Initialize to > threshold so first snap within threshold wins
  let bestYSnap = null;
  let bestYDist = threshold + 1; // Initialize to > threshold so first snap within threshold wins

  // Check if we need to break away from previous snap (user is dragging away)
  const lastSnapped = lastSnappedPositions[currentPanelId];
  const breakawayThreshold = threshold;  // Distance needed to break away from snap

  if (lastSnapped && Date.now() - lastSnapped.timestamp < 1000) {
    const distFromLastSnappedX = Math.abs(x - lastSnapped.x);
    const distFromLastSnappedY = Math.abs(y - lastSnapped.y);

    // If user dragged far enough from last snap, clear it to allow re-snapping or free movement
    if (distFromLastSnappedX > breakawayThreshold) {
      delete lastSnappedPositions[currentPanelId];
    }
    if (distFromLastSnappedY > breakawayThreshold) {
      delete lastSnappedPositions[currentPanelId];
    }
  }

  // Check viewport edges
  if (cfg.snapToLeft) {
    const dist = Math.abs(x);
    if (dist <= threshold && dist < bestXDist) {
      bestXDist = dist;
      bestXSnap = { type: 'viewport', edge: 'left', value: 0 };
    }
  }
  if (cfg.snapToRight) {
    // Check inner edge (scrollbar) first if scrollbar width is set
    if (cfg.scrollbarWidth > 0) {
      const distInner = Math.abs(x + width - (viewportWidth - cfg.scrollbarWidth));
      if (distInner <= threshold && distInner < bestXDist) {
        bestXDist = distInner;
        bestXSnap = { type: 'viewport', edge: 'right', value: (viewportWidth - cfg.scrollbarWidth) - width };
      }
    }
    // Check outer edge (viewport edge)
    const dist = Math.abs(x + width - viewportWidth);
    if (dist <= threshold && dist < bestXDist) {
      bestXDist = dist;
      bestXSnap = { type: 'viewport', edge: 'right', value: viewportWidth - width };
    }
  }
  if (cfg.snapToTop) {
    const dist = Math.abs(y);
    if (dist <= threshold && dist < bestYDist) {
      bestYDist = dist;
      bestYSnap = { type: 'viewport', edge: 'top', value: 0 };
    }
  }
  if (cfg.snapToBottom) {
    // Check inner edge (scrollbar) first if scrollbar width is set
    if (cfg.scrollbarWidth > 0) {
      const distInner = Math.abs(y + height - (viewportHeight - cfg.scrollbarWidth));
      if (distInner <= threshold && distInner < bestYDist) {
        bestYDist = distInner;
        bestYSnap = { type: 'viewport', edge: 'bottom', value: (viewportHeight - cfg.scrollbarWidth) - height };
      }
    }
    // Check outer edge (viewport edge)
    const dist = Math.abs(y + height - viewportHeight);
    if (dist <= threshold && dist < bestYDist) {
      bestYDist = dist;
      bestYSnap = { type: 'viewport', edge: 'bottom', value: viewportHeight - height };
    }
  }

  // Check game space edges (if provided) - these are the edges of the visible scrollable area
  if (gameSpaceBounds) {
    // Snap to left edge of game space (right of panel to left edge of visible area)
    const distToGameLeft = Math.abs(x - gameSpaceBounds.left);
    if (distToGameLeft <= threshold && distToGameLeft < bestXDist) {
      bestXDist = distToGameLeft;
      bestXSnap = { type: 'viewport', edge: 'left', value: gameSpaceBounds.left };
    }

    // Snap to right edge of game space (left of panel to right edge of visible area)
    const distToGameRight = Math.abs(x + width - gameSpaceBounds.right);
    if (distToGameRight <= threshold && distToGameRight < bestXDist) {
      bestXDist = distToGameRight;
      bestXSnap = { type: 'viewport', edge: 'right', value: gameSpaceBounds.right - width };
    }

    // Snap to top edge of game space (bottom of panel to top edge of visible area)
    const distToGameTop = Math.abs(y - gameSpaceBounds.top);
    if (distToGameTop <= threshold && distToGameTop < bestYDist) {
      bestYDist = distToGameTop;
      bestYSnap = { type: 'viewport', edge: 'top', value: gameSpaceBounds.top };
    }

    // Snap to bottom edge of game space (top of panel to bottom edge of visible area)
    const distToGameBottom = Math.abs(y + height - gameSpaceBounds.bottom);
    if (distToGameBottom <= threshold && distToGameBottom < bestYDist) {
      bestYDist = distToGameBottom;
      bestYSnap = { type: 'viewport', edge: 'bottom', value: gameSpaceBounds.bottom - height };
    }
  }

  // Check panel-to-panel edges
  for (const panel of nearbyPanels) {
    const panelRight = panel.x + panel.width;
    const panelBottom = panel.y + panel.height;

    // My left edge to panel's right edge
    const dist = Math.abs(x - panelRight);
    if (dist <= threshold && dist < bestXDist) {
      bestXDist = dist;
      bestXSnap = { type: 'panel', panelId: panel.id, edge: 'left', value: panelRight };
    }

    // My right edge to panel's left edge
    const myRight = x + width;
    const distRight = Math.abs(myRight - panel.x);
    if (distRight <= threshold && distRight < bestXDist) {
      bestXDist = distRight;
      bestXSnap = { type: 'panel', panelId: panel.id, edge: 'right', value: panel.x - width };
    }

    // My top edge to panel's bottom edge
    const distTop = Math.abs(y - panelBottom);
    if (distTop <= threshold && distTop < bestYDist) {
      bestYDist = distTop;
      bestYSnap = { type: 'panel', panelId: panel.id, edge: 'top', value: panelBottom };
    }

    // My bottom edge to panel's top edge
    const myBottom = y + height;
    const distBottom = Math.abs(myBottom - panel.y);
    if (distBottom <= threshold && distBottom < bestYDist) {
      bestYDist = distBottom;
      bestYSnap = { type: 'panel', panelId: panel.id, edge: 'bottom', value: panel.y - height };
    }
  }

  // Check for sticky snapping (apply BEFORE normal snaps for "stickiness")
  // TEMPORARILY DISABLED FOR TESTING
  /*
  const lastSnapped = lastSnappedPositions[currentPanelId];
  const stickyThreshold = threshold * 2; // Use larger threshold for "unsticking"

  if (lastSnapped && Date.now() - lastSnapped.timestamp < 1000) {
    const distFromLastSnappedX = Math.abs(x - lastSnapped.x);
    const distFromLastSnappedY = Math.abs(y - lastSnapped.y);

    // For X: if no better snap found and we're close to last snapped X, keep it
    if (!bestXSnap && distFromLastSnappedX < stickyThreshold && distFromLastSnappedX > 0) {
      snappedX = lastSnapped.x;
      console.log('[Magnetism] Sticky X snap:', { lastSnappedX: lastSnapped.x, currentX: x, dist: distFromLastSnappedX });
    }

    // For Y: if no better snap found and we're close to last snapped Y, keep it
    if (!bestYSnap && distFromLastSnappedY < stickyThreshold && distFromLastSnappedY > 0) {
      snappedY = lastSnapped.y;
      console.log('[Magnetism] Sticky Y snap:', { lastSnappedY: lastSnapped.y, currentY: y, dist: distFromLastSnappedY });
    }
  }
  */

  // Apply normal snaps (override sticky snapping if found)
  if (bestXSnap) {
    snappedX = bestXSnap.value;
    if (bestXSnap.type === 'viewport') {
      if (bestXSnap.edge === 'left') snappedEdges.left = 0;
      else snappedEdges.right = viewportWidth;
    } else {
      snappedToPanel = {
        panelId: bestXSnap.panelId!,
        edge: bestXSnap.edge as 'left' | 'right',
        at: bestXSnap.edge === 'right' ? snappedX + width : snappedX,
      };
    }
  }

  if (bestYSnap) {
    snappedY = bestYSnap.value;
    if (bestYSnap.type === 'viewport') {
      if (bestYSnap.edge === 'top') snappedEdges.top = 0;
      else snappedEdges.bottom = viewportHeight;
    } else {
      snappedToPanel = {
        panelId: bestYSnap.panelId!,
        edge: bestYSnap.edge as 'top' | 'bottom',
        at: bestYSnap.edge === 'bottom' ? snappedY + height : snappedY,
      };
    }
  }

  // Update last snapped position for sticky snapping (with breakaway logic)
  if (bestXSnap || bestYSnap) {
    lastSnappedPositions[currentPanelId] = {
      x: snappedX,
      y: snappedY,
      timestamp: Date.now()
    };
  }

  return { x: snappedX, y: snappedY, snappedEdges, snappedToPanel };
}

/**
 * Extended resize magnetism result with panel snapping info
 */
export interface ResizePanelMagnetismResult extends ResizeMagnetismResult {
  /** Which panel edges were snapped to */
  snappedToPanel?: {
    panelId: string;
    edge: 'right' | 'bottom';
    at: number;
  };
}

/**
 * Apply magnetism to panel size during resize with panel-to-panel snapping
 * Snaps panel edges to viewport edges, game space edges, AND to other panel edges when close
 *
 * @param x - Panel X position (fixed during resize)
 * @param y - Panel Y position (fixed during resize)
 * @param width - Current width
 * @param height - Current height
 * @param viewportWidth - Viewport width
 * @param viewportHeight - Viewport height
 * @param otherPanels - Other panels to snap to
 * @param currentPanelId - ID of current panel
 * @param config - Magnetism configuration
 * @param gameSpaceBounds - Optional game space bounds for snapping to scroll area edges
 */
export function applyResizePanelToPanelMagnetism(
  x: number,
  y: number,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
  otherPanels: PanelBounds[],
  currentPanelId: string,
  config: MagnetismConfig = {},
  gameSpaceBounds?: GameSpaceBounds
): ResizePanelMagnetismResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const snappedEdges: ResizeMagnetismResult['snappedEdges'] = {};
  let snappedToPanel: ResizePanelMagnetismResult['snappedToPanel'] = undefined;

  if (!cfg.enabled) {
    return { width, height, snappedEdges };
  }

  let snappedWidth = width;
  let snappedHeight = height;
  const threshold = cfg.snapThreshold;

  // Filter out the current panel from other panels
  const nearbyPanels = otherPanels.filter(p => p.id !== currentPanelId);

  // Current panel edges
  const myRight = x + width;
  const myBottom = y + height;

  // Collect potential snap targets for right edge (width)
  // First, find nearby edges, then calculate required width
  type SnapEdge = { type: 'viewport'; edge: number; panelId?: never } | { type: 'panel'; edge: number; panelId: string } | { type: 'gamespace'; edge: number };
  let closestRightEdge: SnapEdge | null = null;
  let closestRightDistance = threshold;

  // Check viewport right edge (inner scrollbar edge first, then outer edge)
  if (cfg.scrollbarWidth > 0) {
    const distToInnerRight = Math.abs(myRight - (viewportWidth - cfg.scrollbarWidth));
    if (distToInnerRight < closestRightDistance) {
      closestRightDistance = distToInnerRight;
      closestRightEdge = { type: 'viewport', edge: viewportWidth - cfg.scrollbarWidth };
    }
  }
  const distToViewportRight = Math.abs(myRight - viewportWidth);
  if (distToViewportRight < closestRightDistance) {
    closestRightDistance = distToViewportRight;
    closestRightEdge = { type: 'viewport', edge: viewportWidth };
  }

  // Check game space edges (if provided) - these are the edges of the visible scrollable area
  if (gameSpaceBounds) {
    // Snap to left edge of game space (useful when panel is to the right of visible area)
    const distToGameSpaceLeft = Math.abs(myRight - gameSpaceBounds.left);
    if (distToGameSpaceLeft < closestRightDistance && gameSpaceBounds.left - x >= 200) {
      closestRightDistance = distToGameSpaceLeft;
      closestRightEdge = { type: 'gamespace', edge: gameSpaceBounds.left };
    }

    // Snap to right edge of game space (useful when panel extends beyond visible area)
    const distToGameSpaceRight = Math.abs(myRight - gameSpaceBounds.right);
    if (distToGameSpaceRight < closestRightDistance && gameSpaceBounds.right - x >= 200) {
      closestRightDistance = distToGameSpaceRight;
      closestRightEdge = { type: 'gamespace', edge: gameSpaceBounds.right };
    }
  }

  // Check panel edges for right snap
  for (const panel of nearbyPanels) {
    const panelLeft = panel.x;
    const panelRight = panel.x + panel.width;

    // Check if there's vertical overlap (panels should be aligned vertically to snap horizontally)
    const vertOverlap = !(y + height < panel.y || y > panel.y + panel.height);
    if (!vertOverlap) continue; // Skip if no vertical overlap

    // My right to panel's left
    const distToLeft = Math.abs(myRight - panelLeft);
    if (distToLeft < closestRightDistance && panelLeft - x >= 200) {
      closestRightDistance = distToLeft;
      closestRightEdge = { type: 'panel', edge: panelLeft, panelId: panel.id };
    }

    // My right to panel's right (alignment)
    const distToRight = Math.abs(myRight - panelRight);
    if (distToRight < closestRightDistance && panelRight - x >= 200) {
      closestRightDistance = distToRight;
      closestRightEdge = { type: 'panel', edge: panelRight, panelId: panel.id };
    }
  }

  // Collect potential snap targets for bottom edge (height)
  // First, find nearby edges, then calculate required height
  let closestBottomEdge: SnapEdge | null = null;
  let closestBottomDistance = threshold;

  // Check viewport bottom edge (inner scrollbar edge first, then outer edge)
  if (cfg.scrollbarWidth > 0) {
    const distToInnerBottom = Math.abs(myBottom - (viewportHeight - cfg.scrollbarWidth));
    if (distToInnerBottom < closestBottomDistance) {
      closestBottomDistance = distToInnerBottom;
      closestBottomEdge = { type: 'viewport', edge: viewportHeight - cfg.scrollbarWidth };
    }
  }
  const distToViewportBottom = Math.abs(myBottom - viewportHeight);
  if (distToViewportBottom < closestBottomDistance) {
    closestBottomDistance = distToViewportBottom;
    closestBottomEdge = { type: 'viewport', edge: viewportHeight };
  }

  // Check game space edges (if provided) - these are the edges of the visible scrollable area
  if (gameSpaceBounds) {
    // Snap to top edge of game space (useful when panel is below visible area)
    const distToGameSpaceTop = Math.abs(myBottom - gameSpaceBounds.top);
    if (distToGameSpaceTop < closestBottomDistance && gameSpaceBounds.top - y >= 150) {
      closestBottomDistance = distToGameSpaceTop;
      closestBottomEdge = { type: 'gamespace', edge: gameSpaceBounds.top };
    }

    // Snap to bottom edge of game space (useful when panel extends beyond visible area)
    const distToGameSpaceBottom = Math.abs(myBottom - gameSpaceBounds.bottom);
    if (distToGameSpaceBottom < closestBottomDistance && gameSpaceBounds.bottom - y >= 150) {
      closestBottomDistance = distToGameSpaceBottom;
      closestBottomEdge = { type: 'gamespace', edge: gameSpaceBounds.bottom };
    }
  }

  // Check panel edges for bottom snap
  for (const panel of nearbyPanels) {
    const panelTop = panel.y;
    const panelBottom = panel.y + panel.height;

    // Check if there's horizontal overlap (panels should be aligned horizontally to snap vertically)
    const horizOverlap = !(x + width < panel.x || x > panel.x + panel.width);
    if (!horizOverlap) continue; // Skip if no horizontal overlap

    // My bottom to panel's top
    const distToTop = Math.abs(myBottom - panelTop);
    if (distToTop < closestBottomDistance && panelTop - y >= 150) {
      closestBottomDistance = distToTop;
      closestBottomEdge = { type: 'panel', edge: panelTop, panelId: panel.id };
    }

    // My bottom to panel's bottom (alignment)
    const distToBottom = Math.abs(myBottom - panelBottom);
    if (distToBottom < closestBottomDistance && panelBottom - y >= 150) {
      closestBottomDistance = distToBottom;
      closestBottomEdge = { type: 'panel', edge: panelBottom, panelId: panel.id };
    }
  }

  // Apply right edge snap if found
  if (closestRightEdge) {
    const newWidth = closestRightEdge.edge - x;
    if (newWidth >= 200) { // Minimum width constraint
      snappedWidth = newWidth;
      if (closestRightEdge.type === 'viewport') {
        snappedEdges.right = viewportWidth;
      } else {
        snappedToPanel = {
          panelId: closestRightEdge.panelId!,
          edge: 'right',
          at: closestRightEdge.edge,
        };
      }
    }
  }

  // Apply bottom edge snap if found
  if (closestBottomEdge) {
    const newHeight = closestBottomEdge.edge - y;
    if (newHeight >= 150) { // Minimum height constraint
      snappedHeight = newHeight;
      if (closestBottomEdge.type === 'viewport') {
        snappedEdges.bottom = viewportHeight;
      } else {
        snappedToPanel = {
          panelId: closestBottomEdge.panelId!,
          edge: 'bottom',
          at: closestBottomEdge.edge,
        };
      }
    }
  }

  return { width: snappedWidth, height: snappedHeight, snappedEdges, snappedToPanel };
}
