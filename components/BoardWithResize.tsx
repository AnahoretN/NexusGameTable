import React, { useState, useCallback, useRef, useMemo } from 'react';
import { TableObject, Token as TokenType, Board as BoardType, GridType } from '../types';
import { HexGridMemo } from './HexGrid';
import { SquareGridMemo } from './SquareGrid';
import { calculateFlatHexHeight } from '../utils/gridUtils';
import { LazyBackgroundImage } from './LazyImage';

interface BoardWithResizeProps {
    token: TokenType | BoardType;
    obj: TableObject;
    isOwner: boolean;
    isDragging: boolean;
    isResizing: boolean;
    canResize: boolean;
    onMouseDown: (e: React.MouseEvent) => void;
    onContextMenu: (e: React.MouseEvent) => void;
    onResizeStart: (e: React.MouseEvent) => void;
    gridSize: number;
    gridWidth?: number;
    gridHeight?: number;
    showGrid?: boolean;
    currentTool?: string;
    zoom?: number;
}

export const BoardWithResize: React.FC<BoardWithResizeProps> = ({
    token,
    obj,
    isDragging,
    isResizing,
    canResize,
    onMouseDown,
    onContextMenu,
    onResizeStart,
    gridSize,
    gridWidth,
    gridHeight,
    zoom = 1,
}) => {
    const [isHoveringCorner, setIsHoveringCorner] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!containerRef.current || !canResize) return;
        const rect = containerRef.current.getBoundingClientRect();
        const handleSize = 20;

        // Check if hovering near bottom-right corner
        const nearCorner = e.clientX >= rect.right - handleSize &&
                          e.clientY >= rect.bottom - handleSize &&
                          e.clientX <= rect.right + 10 &&
                          e.clientY <= rect.bottom + 10;

        setIsHoveringCorner(nearCorner);
    }, [canResize]);

    const handleMouseLeave = useCallback(() => {
        setIsHoveringCorner(false);
    }, []);

    // Check if grid should be shown (grid type exists AND showGrid is not false)
    const shouldShowGrid = token.gridType && token.gridType !== GridType.NONE && (token as BoardType).showGrid !== false;
    const isHexGrid = token.gridType === GridType.HEX;
    const isHexHorizontalGrid = token.gridType === GridType.HEX_HORIZONTAL;
    const isSquareGrid = token.gridType === GridType.SQUARE;

    // Hex grid constants
    const HEX_RATIO = 1.15;
    const DEFAULT_HEX_WIDTH = 100;
    const DEFAULT_FLAT_HEX_WIDTH = 115;

    // Use gridWidth if provided, otherwise fall back to default hex dimensions
    // Use useMemo to ensure these recalculate when gridType, gridWidth, or gridHeight change
    const actualGridWidth = useMemo(() => {
      return gridWidth ?? (isHexGrid ? DEFAULT_HEX_WIDTH : (isHexHorizontalGrid ? DEFAULT_FLAT_HEX_WIDTH : gridSize));
    }, [gridWidth, isHexGrid, isHexHorizontalGrid, gridSize]);

    const actualGridHeight = useMemo(() => {
      if (gridHeight !== undefined) return gridHeight;

      if (isHexGrid) {
        return Math.round(actualGridWidth * HEX_RATIO * 100) / 100;
      } else if (isHexHorizontalGrid) {
        return Math.round(calculateFlatHexHeight(actualGridWidth) * 100) / 100;
      } else {
        return gridSize;
      }
    }, [gridHeight, isHexGrid, isHexHorizontalGrid, gridSize, actualGridWidth]);

    // Determine cursor based on hover state and action state
    const getCursor = useCallback(() => {
        if (isResizing) return 'nwse-resize';
        if (isDragging) return 'grabbing';
        if (isHoveringCorner && canResize) return 'nwse-resize';
        return 'grab';
    }, [isHoveringCorner, canResize, isDragging, isResizing]);

    const cursor = getCursor();

    return (
        <div
            ref={containerRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onMouseDown={onMouseDown}
            onContextMenu={onContextMenu}
            className="absolute flex items-center justify-center text-white font-bold select-none"
        >
            <LazyBackgroundImage
                src={(obj as any).content || ''}
                className="w-full h-full"
                style={{
                    left: 0,
                    top: 0,
                    width: '100%',
                    height: '100%',
                    backgroundColor: token.color || '#34495e',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    border: '2px solid #212f3c',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
                    transform: `rotate(${obj.rotation}deg)`,
                    cursor: cursor,
                    overflow: 'hidden',
                }}
                rootMargin="100px"
                threshold={0.01}
            >
            {/* Grid overlay - direct rendering for all grid types */}
            {shouldShowGrid && (
                <>
                    {(isHexGrid || isHexHorizontalGrid) ? (
                        <HexGridMemo
                            width={(obj.width ?? 100) * zoom}
                            height={(obj.height ?? 100) * zoom}
                            orientation={isHexGrid ? 'pointy-top' : 'flat-top'}
                            hexWidth={actualGridWidth}
                            hexHeight={actualGridHeight}
                            stroke="rgba(33,47,60,0.7)"
                            strokeWidth={1}
                            zoom={zoom}
                        />
                    ) : isSquareGrid ? (
                        <SquareGridMemo
                            width={(obj.width ?? 100) * zoom}
                            height={(obj.height ?? 100) * zoom}
                            cellWidth={actualGridWidth}
                            cellHeight={actualGridHeight}
                            stroke="rgba(33,47,60,0.7)"
                            strokeWidth={1}
                            zoom={zoom}
                        />
                    ) : null}
                </>
            )}

            {/* Resize handle - bottom-right corner */}
            {canResize && !isDragging && (
                <div
                    onMouseDown={onResizeStart}
                    className={`absolute bottom-0 right-0 cursor-nwse-resize transition-opacity ${
                        isHoveringCorner || isResizing ? 'opacity-100' : 'opacity-75'
                    }`}
                    style={{
                        width: `${Math.min(16 * zoom, 32)}px`, // Max 32px to prevent blocking board
                        height: `${Math.min(16 * zoom, 32)}px`,
                        background: 'linear-gradient(135deg, transparent 50%, rgba(147, 51, 234, 0.8) 50%)',
                        borderTopLeftRadius: `${Math.min(4 * zoom, 8)}px`,
                        pointerEvents: 'auto',
                    }}
                />
            )}

        </LazyBackgroundImage>
    );
};

// Custom comparison for BoardWithResize memo
function arePropsEqual(
  prevProps: Readonly<BoardWithResizeProps>,
  nextProps: Readonly<BoardWithResizeProps>
) {
  return (
    prevProps.token.gridType === nextProps.token.gridType &&
    (prevProps.token as any).gridWidth === (nextProps.token as any).gridWidth &&
    (prevProps.token as any).gridHeight === (nextProps.token as any).gridHeight &&
    (prevProps.token as any).showGrid === (nextProps.token as any).showGrid &&
    prevProps.gridWidth === nextProps.gridWidth &&
    prevProps.gridHeight === nextProps.gridHeight &&
    prevProps.gridSize === nextProps.gridSize &&
    prevProps.obj.width === nextProps.obj.width &&
    prevProps.obj.height === nextProps.obj.height &&
    (prevProps.token as any).content === (nextProps.token as any).content &&
    (prevProps.token as any).color === (nextProps.token as any).color &&
    prevProps.zoom === nextProps.zoom
  );
}

export const BoardWithResizeMemo = React.memo(BoardWithResize, arePropsEqual);
