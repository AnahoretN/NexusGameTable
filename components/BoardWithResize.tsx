import React, { useState, useCallback, useRef } from 'react';
import { TableObject, Token as TokenType, Board as BoardType, GridType } from '../types';

interface BoardWithResizeProps {
    token: TokenType | BoardType;
    obj: TableObject;
    isOwner: boolean;
    isDragging: boolean;
    isResizing: boolean;
    canResize: boolean;
    zoom: number;
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
    zoom,
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

    // Use gridWidth/gridHeight if provided, otherwise fall back to gridSize
    const gridW = gridWidth ?? gridSize;
    const gridH = gridHeight ?? gridSize;

    // For hex grid, with 120° top/bottom angles always
    // Top and bottom angles are always 120° regardless of width/height ratio
    const rowSpacing = gridH * 0.75;  // Vertical distance between hexagon centers
    const patternW = gridW * 2;        // Two hexagon columns for proper tiling
    const patternH = rowSpacing * 2;   // Two hexagon rows

    // Pointy-top hexagon: width = gridW, height = gridH
    // Shoulder Y at W/(2√3) preserves 120° top/bottom angles
    const shoulderY1 = gridW / 2 / Math.sqrt(3);
    const shoulderY2 = gridH - shoulderY1;
    const hexPath =
      `M ${gridW / 2} 0 ` +
      `L ${gridW} ${shoulderY1} ` +
      `L ${gridW} ${shoulderY2} ` +
      `L ${gridW / 2} ${gridH} ` +
      `L 0 ${shoulderY2} ` +
      `L 0 ${shoulderY1} Z`;

    // Build tiling pattern with 4 hexagons:
    // Even row: (0, 0) and (0, rowSpacing)
    // Odd row offset: (gridW/2, rowSpacing/2) and (gridW/2, rowSpacing * 1.5)
    const hexGridPath =
      // First hexagon (col 0, row 0)
      hexPath + ' ' +
      // Second hexagon (col 0, row 1)
      hexPath.replace(/([ML]) ([\d.]+) ([\d.]+)/g, (match, cmd, x, y) =>
        `${cmd} ${x} ${parseFloat(y) + rowSpacing}`
      ) + ' ' +
      // Third hexagon (col 1 offset, row 0)
      hexPath.replace(/([ML]) ([\d.]+) ([\d.]+)/g, (match, cmd, x, y) =>
        `${cmd} ${parseFloat(x) + gridW/2} ${parseFloat(y) + rowSpacing/2}`
      ) + ' ' +
      // Fourth hexagon (col 1 offset, row 1)
      hexPath.replace(/([ML]) ([\d.]+) ([\d.]+)/g, (match, cmd, x, y) =>
        `${cmd} ${parseFloat(x) + gridW/2} ${parseFloat(y) + rowSpacing * 1.5}`
      );

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
                <svg className="absolute inset-0 pointer-events-none opacity-50" width="100%" height="100%">
                    <defs>
                        {token.gridType === GridType.SQUARE && (
                            <pattern id={`grid-square-${obj.id}`} width={gridW} height={gridH} patternUnits="userSpaceOnUse">
                                {/* Draw complete square: top, left, right, bottom edges */}
                                <rect x="0" y="0" width={gridW} height={gridH} fill="none" stroke="black" strokeWidth="1"/>
                            </pattern>
                        )}
                        {token.gridType === GridType.HEX && (
                            <pattern id={`grid-hex-${obj.id}`} width={patternW} height={patternH} patternUnits="userSpaceOnUse">
                                <path d={hexPath} fill="none" stroke="black" strokeWidth="1"/>
                            </pattern>
                        )}
                    </defs>
                    <rect width="100%" height="100%" fill={`url(#grid-${token.gridType === GridType.SQUARE ? 'square' : 'hex'}-${obj.id})`} />
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
