/**
 * Type definitions for Tabletop component refactoring
 * These types define the interfaces and contracts for the new modular components
 */

import { TableObject, Card as CardType, Token as TokenType, Board as BoardType } from '../../types';

/**
 * Rendering context passed to all sub-components
 * Contains transformation functions and styling utilities
 */
export interface TabletopRenderContext {
  /** Virtual units to pixels conversion factor */
  pixelsPerVU: number;
  /** Convert virtual units to pixels */
  v2p: (vu: number) => number;
  /** Convert pixels to virtual units */
  p2v: (px: number) => number;
  /** Get zoom scale for specific layer */
  getLayerZoomScale: (layerId: string) => number;
  /** Get inverse scale for layers without zoom */
  getLayerInverseScale: (layerId: string) => number;
  /** Create positioned style with layer zoom consideration */
  createPositionedStyle: (
    x: number,
    y: number,
    width: number,
    height: number,
    zIndex: number,
    layerId: string,
    additionalStyle?: React.CSSProperties
  ) => React.CSSProperties;
  /** Ruler step size in VU (0 = disabled) */
  rulerStep: number;
}

/**
 * Props for rendering individual objects
 */
export interface ObjectRenderProps {
  /** The object to render */
  obj: TableObject;
  /** Rendering context */
  context: TabletopRenderContext;
  /** Context menu handler */
  onContextMenu?: (e: React.MouseEvent, obj: TableObject) => void;
  /** Additional click handler */
  onClick?: (e: React.MouseEvent, obj: TableObject) => void;
}

/**
 * Cursor slot item types
 */
export type CursorSlotItem = CardType | TokenType | BoardType;

/**
 * Cursor slot state
 */
export interface CursorSlotState {
  /** Items in cursor slot */
  items: CursorSlotItem[];
  /** Current cursor position */
  position: { x: number; y: number } | null;
  /** Source of cursor slot (hold, shift, archetype) */
  source: 'hold' | 'shift' | 'archetype' | null;
}

/**
 * Ruler state for measurements
 */
export interface RulerState {
  /** Start position */
  start: { x: number; y: number } | null;
  /** Current position */
  current: { x: number; y: number } | null;
  /** Is right click held */
  isRightClick: boolean;
}

/**
 * Modal states for various dialogs
 */
export interface ModalStates {
  /** Context menu state */
  contextMenu: {
    visible: boolean;
    x: number;
    y: number;
    object: TableObject | null;
    shiftKey?: boolean;
  };
  /** Settings modal state */
  settingsModal: {
    visible: boolean;
    object: TableObject | null;
  };
  /** Delete confirm modal state */
  deleteModal: {
    visible: boolean;
    objectId: string | null;
  };
  /** Search deck modal state */
  searchDeckModal: {
    visible: boolean;
    deck: any;
    pile: any;
  };
  /** Top deck modal state */
  topDeckModal: {
    visible: boolean;
    deck: any;
  };
  /** Piles button menu state */
  pilesButtonMenu: {
    visible: boolean;
    x: number;
    y: number;
    deck: any;
  };
}

/**
 * Event handlers interface
 */
export interface TabletopEventHandlers {
  /** Mouse down handler */
  onMouseDown: (e: React.MouseEvent, id?: string) => void;
  /** Mouse move handler */
  onMouseMove: (e: MouseEvent | React.MouseEvent) => void;
  /** Mouse up handler */
  onMouseUp: (e?: MouseEvent | React.MouseEvent) => void;
  /** Context menu handler */
  onContextMenu: (e: React.MouseEvent, obj: TableObject) => void;
  /** Wheel handler */
  onWheel: (e: React.WheelEvent) => void;
  /** Key down handler */
  onKeyDown: (e: KeyboardEvent) => void;
  /** Key up handler */
  onKeyUp: (e: KeyboardEvent) => void;
}

/**
 * Tool states
 */
export interface ToolStates {
  /** Current active tool */
  currentTool: string;
  /** Is shift pressed (for delete cursor) */
  isShiftPressed: boolean;
  /** Is ctrl pressed (for hiding action buttons) */
  isCtrlPressed: boolean;
  /** Is panning */
  isPanning: boolean;
}

/**
 * Dragging states
 */
export interface DraggingStates {
  /** Currently dragging object ID */
  draggingId: string | null;
  /** Currently dragging pile */
  draggingPile: { pile: any; deck: any } | null;
  /** Dragging position offset */
  dragOffset: { x: number; y: number } | null;
}

/**
 * Resize states for boards
 */
export interface ResizeStates {
  /** Resizing object ID */
  resizingId: string | null;
  /** Resize start position */
  resizeStart: { x: number; y: number; width: number; height: number } | null;
  /** Live resize size */
  liveResizeSize: { width: number; height: number } | null;
}

/**
 * Filtered object collections
 * Results of filtering objects by various criteria
 */
export interface FilteredObjectCollections {
  /** All table objects */
  tableObjects: TableObject[];
  /** Visible table objects (viewport culling) */
  visibleTableObjects: TableObject[];
  /** Remote cursor slot objects */
  remoteCursorSlotObjects: TableObject[];
  /** Remote dragging objects */
  remoteDraggingObjects: TableObject[];
  /** UI objects (panels, windows) */
  uiObjects: TableObject[];
  /** Pinned UI objects */
  pinnedUIObjects: TableObject[];
  /** Unpinned UI objects */
  unpinnedUIObjects: TableObject[];
  /** Pinned decks */
  pinnedDecks: any[];
  /** Unpinned decks */
  unpinnedDecks: any[];
  /** Pinned game objects (tokens, cards, effects, etc.) */
  pinnedGameObjects: TableObject[];
}