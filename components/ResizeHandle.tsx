import React, { useRef, useEffect, useCallback } from 'react';

interface ResizeHandleProps {
  zoom: number;
  isVisible: boolean;
  onResizeStart: (e: React.MouseEvent) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

/**
 * Resize handle component - always visible purple triangle
 * Simplified for better performance and reliability
 */
export const ResizeHandle: React.FC<ResizeHandleProps> = ({
  zoom,
  isVisible,
  onResizeStart,
  onMouseEnter,
  onMouseLeave,
}) => {
  const handleRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onResizeStart(e);
  }, [onResizeStart]);

  const handleMouseEnter = useCallback(() => {
    onMouseEnter?.();
  }, [onMouseEnter]);

  const handleMouseLeave = useCallback(() => {
    onMouseLeave?.();
  }, [onMouseLeave]);

  // Simple mouse tracking for cursor state
  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;

    handle.addEventListener('mouseenter', handleMouseEnter);
    handle.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      handle.removeEventListener('mouseenter', handleMouseEnter);
      handle.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [handleMouseEnter, handleMouseLeave]);

  if (!isVisible) return null;

  return (
    <div
      ref={handleRef}
      onMouseDown={handleMouseDown}
      className="absolute bottom-0 right-0"
      style={{
        width: '12px',
        height: '12px',
        transform: `scale(${zoom})`,
        transformOrigin: 'bottom right',
        pointerEvents: 'auto', // Always capture events
        cursor: 'se-resize', // Always se-resize when over handle
        // Simple triangle shape without clipPath issues
        clipPath: 'polygon(100% 0, 100% 100%, 0 100%)',
        backgroundColor: 'rgba(147, 51, 234, 0.8)', // Always purple
        zIndex: 9999, // Very high z-index to ensure cursor takes priority over board
      }}
    />
  );
};

export const ResizeHandleMemo = React.memo(ResizeHandle);