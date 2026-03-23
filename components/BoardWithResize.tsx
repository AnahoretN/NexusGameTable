import React, { useState, useCallback, useRef, useMemo } from 'react';
import { TableObject, Token as TokenType, Board as BoardType, GridType } from '../types';
import { HexGridMemo } from './HexGrid';
import { SquareGridMemo } from './SquareGrid';
import { calculateFlatHexHeight } from '../utils/gridUtils';

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
}

export const BoardWithResize: React.FC<BoardWithResizeProps> = ({
    token,
    obj,
    isOwner,
    isDragging,
    isResizing,
    canResize,
    onMouseDown,
    onContextMenu,
    onResizeStart,
    gridSize,
    gridWidth,
    gridHeight,
    showGrid,
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
            style={{
                left: 0,
                top: 0,
                width: '100%',   // Use full width of parent container
                height: '100%',  // Use full height of parent container
                backgroundColor: (obj as any).color || '#34495e',
                backgroundImage: (obj as any).content ? `url(${(obj as any).content})` : undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                border: '2px solid #212f3c',
                boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
                transform: `rotate(${obj.rotation}deg)`,
                cursor: cursor,
                overflow: 'hidden',
            }}
        >
            {/* Grid overlay - direct rendering for all grid types */}
            {shouldShowGrid && (
                <>
                    {(isHexGrid || isHexHorizontalGrid) ? (
                        <HexGridMemo
                            width={obj.width ?? 100}
                            height={obj.height ?? 100}
                            orientation={isHexGrid ? 'pointy-top' : 'flat-top'}
                            hexWidth={actualGridWidth}
                            hexHeight={actualGridHeight}
                            stroke="rgba(33,47,60,0.7)"
                            strokeWidth={1}
                            zoom={1}
                        />
                    ) : isSquareGrid ? (
                        <SquareGridMemo
                            width={obj.width ?? 100}
                            height={obj.height ?? 100}
                            cellWidth={actualGridWidth}
                            cellHeight={actualGridHeight}
                            stroke="rgba(33,47,60,0.7)"
                            strokeWidth={1}
                            zoom={1}
                        />
                    ) : null}
                </>
            )}

            {/* Resize handle - bottom-right corner */}
            {canResize && !isDragging && (
                <div
                    onMouseDown={onResizeStart}
                    className={`absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize transition-opacity ${
                        isHoveringCorner || isResizing ? 'opacity-100' : 'opacity-75'
                    }`}
                    style={{
                        background: 'linear-gradient(135deg, transparent 50%, rgba(147, 51, 234, 0.8) 50%)',
                        borderTopLeftRadius: '4px',
                        pointerEvents: 'auto',
                    }}
                />
            )}

        </div>
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
    prevProps.obj.height === nextProps.obj.height
  );
}

export const BoardWithResizeMemo = React.memo(BoardWithResize, arePropsEqual);
