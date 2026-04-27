/**
 * PanelResizeHandle Component
 *
 * A visual resize handle (triangle) in the bottom-right corner of panels.
 * Provides visual feedback and proper cursor for resizing.
 */

import React from 'react';

export interface PanelResizeHandleProps {
  /** Whether the handle is visible */
  isVisible: boolean;
  /** Whether mouse is hovering over the handle */
  isHovering?: boolean;
  /** Current zoom level (affects handle size) */
  zoom?: number;
  /** Custom CSS class for styling */
  className?: string;
  /** Custom inline styles */
  style?: React.CSSProperties;
  /** Size of the handle in pixels (default: 16) */
  size?: number;
  /** Handle type (triangle or square) */
  type?: 'triangle' | 'square';
}

/**
 * Resize handle component - shows a triangle in bottom-right corner
 */
export const PanelResizeHandle: React.FC<PanelResizeHandleProps> = ({
  isVisible,
  isHovering = false,
  zoom = 1,
  className = '',
  style = {},
  size = 16,
  type = 'triangle',
}) => {
  if (!isVisible) return null;

  // Calculate actual size with zoom, but cap at reasonable max
  const actualSize = Math.min(size * Math.min(zoom, 2), 32);

  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: `${actualSize}px`,
    height: `${actualSize}px`,
    pointerEvents: 'none', // Events handled by parent
    cursor: 'nwse-resize',
    opacity: isHovering ? 1 : 0.5,
    transition: 'opacity 0.15s ease',
    zIndex: 9999,
    ...style,
  };

  if (type === 'triangle') {
    // Triangle shape using clip-path
    baseStyle.clipPath = 'polygon(100% 0, 100% 100%, 0 100%)';
    baseStyle.backgroundColor = 'rgba(255, 255, 255, 0.3)';
  } else {
    // Square shape with gradient
    baseStyle.background = 'linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.3) 50%)';
  }

  return (
    <div
      className={`panel-resize-handle ${className}`}
      style={baseStyle}
      data-resize-handle="true"
    />
  );
};

/**
 * Memoized version for performance
 */
export const PanelResizeHandleMemo = React.memo(PanelResizeHandle, (prev, next) => {
  return (
    prev.isVisible === next.isVisible &&
    prev.isHovering === next.isHovering &&
    prev.zoom === next.zoom &&
    prev.size === next.size &&
    prev.type === next.type
  );
});

PanelResizeHandleMemo.displayName = 'PanelResizeHandleMemo';
