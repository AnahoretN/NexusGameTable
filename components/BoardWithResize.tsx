import React, { useState, useCallback, useRef } from 'react';
import { TableObject, Token as TokenType, Board as BoardType, GridType } from '../types';
import { calculateFlexibleHexGrid, calculateHorizontalHexGrid } from '../utils/gridUtils';

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

    // Hex grid constants
    const HEX_RATIO = 1.15;
    const DEFAULT_HEX_WIDTH = 100;
    const DEFAULT_FLAT_HEX_WIDTH = 115;

    // Use gridWidth if provided, otherwise fall back to default hex dimensions
    // For HEX (pointy-top): default width=100, height = 100 * 1.15 = 115
    // For HEX_HORIZONTAL (flat-top): default width=115, height = 100
    const actualGridWidth = gridWidth ?? (isHexGrid ? DEFAULT_HEX_WIDTH : (isHexHorizontalGrid ? DEFAULT_FLAT_HEX_WIDTH : gridSize));
    const actualGridHeight = gridHeight ?? (isHexGrid ? Math.round(DEFAULT_HEX_WIDTH * HEX_RATIO * 100) / 100 : (isHexHorizontalGrid ? DEFAULT_HEX_WIDTH : gridSize));

    // Flexible hex grid calculations
    let hexGridPattern: React.ReactNode = null;
    if (isHexGrid) {
        const hexGrid = calculateFlexibleHexGrid(actualGridWidth);

        hexGridPattern = (
            <pattern
                id={`hex-grid-${obj.id}`}
                width={hexGrid.patternWidth}
                height={hexGrid.patternHeight}
                patternUnits="userSpaceOnUse"
            >
                <path
                    d={hexGrid.path}
                    fill="none"
                    stroke="rgba(33,47,60,0.7)"
                    strokeWidth={1}
                />
            </pattern>
        );
    } else if (isHexHorizontalGrid) {
        const hexGrid = calculateHorizontalHexGrid(actualGridWidth);

        hexGridPattern = (
            <pattern
                id={`hex-grid-${obj.id}`}
                width={hexGrid.patternWidth}
                height={hexGrid.patternHeight}
                patternUnits="userSpaceOnUse"
            >
                <path
                    d={hexGrid.path}
                    fill="none"
                    stroke="rgba(33,47,60,0.7)"
                    strokeWidth={1}
                />
            </pattern>
        );
    }

    // Generate square grid pattern (uses actualGridWidth and actualGridHeight)
    const squareGridPattern = (
        <pattern
            id={`square-grid-${obj.id}`}
            width={actualGridWidth}
            height={actualGridHeight}
            patternUnits="userSpaceOnUse"
        >
            <rect
                width={actualGridWidth}
                height={actualGridHeight}
                fill="none"
                stroke="rgba(33,47,60,0.7)"
                strokeWidth={1}
            />
        </pattern>
    );

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
            }}
        >
            {/* Grid overlay */}
            {shouldShowGrid && (
                <svg className="absolute inset-0 pointer-events-none" width="100%" height="100%">
                    <defs>
                        {(isHexGrid || isHexHorizontalGrid) ? hexGridPattern : squareGridPattern}
                    </defs>
                    <rect
                        width="100%"
                        height="100%"
                        fill={`url(#${(isHexGrid || isHexHorizontalGrid) ? `hex-grid-${obj.id}` : `square-grid-${obj.id}`})`}
                    />
                </svg>
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

export const BoardWithResizeMemo = React.memo(BoardWithResize);
