/**
 * Simplified Panel Resize Hook
 *
 * Provides drag-to-move and corner-resize functionality for panels/windows
 * with proper screen bounds constraints.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { constrainPanelBounds, getScreenDimensionsInVU } from '../utils/panelConstraints';

export interface PanelResizeOptions {
  /** Panel/window ID */
  id: string;
  /** Container element ref */
  containerRef: React.RefObject<HTMLDivElement>;
  /** Current position and size */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Whether panel is pinned to viewport (affects coordinate system) */
  isPinnedToViewport?: boolean;
  /** Whether resize is enabled */
  canResize?: boolean;
  /** Minimum width in pixels (default: 200) */
  minWidth?: number;
  /** Minimum height in pixels (default: 150) */
  minHeight?: number;
  /** Pixels per VU (for unpinned panels) */
  pixelsPerVU?: number;
  /** Callback when position changes */
  onPositionChange?: (x: number, y: number) => void;
  /** Callback when size changes */
  onSizeChange?: (width: number, height: number) => void;
  /** Callback when drag starts */
  onDragStart?: () => void;
  /** Callback when drag ends */
  onDragEnd?: () => void;
}

export interface PanelResizeState {
  /** Currently dragging */
  isDragging: boolean;
  /** Currently resizing */
  isResizing: boolean;
  /** Cursor over resize handle */
  isOverResizeHandle: boolean;
  /** Current size during resize (for visual feedback) */
  currentSize: { width: number; height: number } | null;
  /** Current position during drag (for visual feedback) */
  currentPosition: { x: number; y: number } | null;
}

const RESIZE_HANDLE_SIZE = 20; // Size of resize handle area in pixels
const SNAP_THRESHOLD = 10; // Snap to edge threshold in pixels

/**
 * Hook for panel drag-resize functionality
 */
export function usePanelResize(options: PanelResizeOptions): {
  state: PanelResizeState;
  handlers: {
    onMouseDown: (e: React.MouseEvent) => void;
    onMouseMove: (e: React.MouseEvent) => void;
    onMouseLeave: () => void;
  };
} {
  const {
    containerRef,
    x,
    y,
    width,
    height,
    isPinnedToViewport = false,
    canResize = true,
    minWidth = 200,
    minHeight = 150,
    pixelsPerVU = 1,
    onPositionChange,
    onSizeChange,
    onDragStart,
    onDragEnd,
  } = options;

  // Drag state
  const dragStateRef = useRef<{
    isDragging: boolean;
    isResizing: boolean;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    startLeft: number;
    startTop: number;
  }>({
    isDragging: false,
    isResizing: false,
    startX: 0,
    startY: 0,
    startWidth: 0,
    startHeight: 0,
    startLeft: 0,
    startTop: 0,
  });

  // Visual state
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isOverResizeHandle, setIsOverResizeHandle] = useState(false);
  const [currentSize, setCurrentSize] = useState<{ width: number; height: number } | null>(null);
  const [currentPosition, setCurrentPosition] = useState<{ x: number; y: number } | null>(null);

  // Check if mouse is over resize handle area
  const checkResizeHandle = useCallback((clientX: number, clientY: number): boolean => {
    if (!containerRef.current || !canResize) return false;
    const rect = containerRef.current.getBoundingClientRect();
    return (
      clientX >= rect.right - RESIZE_HANDLE_SIZE &&
      clientY >= rect.bottom - RESIZE_HANDLE_SIZE &&
      clientX <= rect.right + 10 &&
      clientY <= rect.bottom + 10
    );
  }, [containerRef, canResize]);

  // Mouse down handler - starts drag or resize
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const isOverHandle = checkResizeHandle(e.clientX, e.clientY);

    if (isOverHandle && canResize) {
      // Start resize
      dragStateRef.current = {
        isDragging: false,
        isResizing: true,
        startX: e.clientX,
        startY: e.clientY,
        startWidth: rect.width,
        startHeight: rect.height,
        startLeft: rect.left,
        startTop: rect.top,
      };
      setIsResizing(true);
      setCurrentSize({ width: rect.width, height: rect.height });
      onDragStart?.();
    } else if (e.button === 0) {
      // Start drag (left click only, not on resize handle)
      dragStateRef.current = {
        isDragging: true,
        isResizing: false,
        startX: e.clientX,
        startY: e.clientY,
        startWidth: rect.width,
        startHeight: rect.height,
        startLeft: rect.left,
        startTop: rect.top,
      };
      setIsDragging(true);
      setCurrentPosition({ x: rect.left, y: rect.top });
      onDragStart?.();
    }
  }, [containerRef, canResize, checkResizeHandle, onDragStart]);

  // Mouse move handler - updates drag/resize position
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    // Update hover state
    setIsOverResizeHandle(checkResizeHandle(e.clientX, e.clientY));

    const state = dragStateRef.current;

    if (state.isResizing && currentSize) {
      // Handle resize
      const deltaX = e.clientX - state.startX;
      const deltaY = e.clientY - state.startY;

      // Calculate screen bounds
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const maxWidth = isPinnedToViewport ? viewportWidth : viewportWidth;
      const maxHeight = isPinnedToViewport ? viewportHeight : viewportHeight;

      const newWidth = Math.max(minWidth, Math.min(state.startWidth + deltaX, maxWidth));
      const newHeight = Math.max(minHeight, Math.min(state.startHeight + deltaY, maxHeight));

      setCurrentSize({ width: newWidth, height: newHeight });
    } else if (state.isDragging && currentPosition) {
      // Handle drag
      const deltaX = e.clientX - state.startX;
      const deltaY = e.clientY - state.startY;

      const newX = state.startLeft + deltaX;
      const newY = state.startTop + deltaY;

      setCurrentPosition({ x: newX, y: newY });
    }
  }, [currentSize, currentPosition, isPinnedToViewport, minWidth, minHeight, checkResizeHandle]);

  // Mouse leave handler
  const onMouseLeave = useCallback(() => {
    setIsOverResizeHandle(false);
  }, []);

  // Global mouse move handler
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const state = dragStateRef.current;

      if (state.isResizing && currentSize) {
        const deltaX = e.clientX - state.startX;
        const deltaY = e.clientY - state.startY;

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const maxWidth = isPinnedToViewport ? viewportWidth : viewportWidth;
        const maxHeight = isPinnedToViewport ? viewportHeight : viewportHeight;

        const newWidth = Math.max(minWidth, Math.min(state.startWidth + deltaX, maxWidth));
        const newHeight = Math.max(minHeight, Math.min(state.startHeight + deltaY, maxHeight));

        setCurrentSize({ width: newWidth, height: newHeight });
      } else if (state.isDragging) {
        const deltaX = e.clientX - state.startX;
        const deltaY = e.clientY - state.startY;

        const newX = state.startLeft + deltaX;
        const newY = state.startTop + deltaY;

        setCurrentPosition({ x: newX, y: newY });
      } else {
        // Update hover state when not dragging/resizing
        setIsOverResizeHandle(checkResizeHandle(e.clientX, e.clientY));
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      const state = dragStateRef.current;

      if (state.isResizing && currentSize) {
        // Finalize resize
        const finalWidth = currentSize.width;
        const finalHeight = currentSize.height;

        onSizeChange?.(finalWidth, finalHeight);

        setIsResizing(false);
        setCurrentSize(null);
        onDragEnd?.();
      } else if (state.isDragging) {
        // Finalize drag
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          onPositionChange?.(rect.left, rect.top);
        }

        setIsDragging(false);
        setCurrentPosition(null);
        onDragEnd?.();
      }

      // Reset state
      dragStateRef.current = {
        isDragging: false,
        isResizing: false,
        startX: 0,
        startY: 0,
        startWidth: 0,
        startHeight: 0,
        startLeft: 0,
        startTop: 0,
      };
    };

    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, isResizing, currentSize, containerRef, isPinnedToViewport, minWidth, minHeight, onPositionChange, onSizeChange, onDragEnd, checkResizeHandle]);

  return {
    state: {
      isDragging,
      isResizing,
      isOverResizeHandle,
      currentSize,
      currentPosition,
    },
    handlers: {
      onMouseDown,
      onMouseMove,
      onMouseLeave,
    },
  };
}
