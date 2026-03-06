import React from 'react';
import { Token as TokenType, Board as BoardType } from '../../types';
import { Lock } from 'lucide-react';

interface BoardWithResizeProps {
    token: TokenType | BoardType;
    obj: any;
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
    currentTool = 'none',
}) => {
    // Use gridWidth/gridHeight if provided, otherwise fall back to gridSize
    const gridW = gridWidth ?? gridSize;
    const gridH = gridHeight ?? gridSize;

    // Check if grid should be shown (grid type exists AND showGrid is not false)
    const shouldShowGrid = token.gridType && token.gridType !== 'NONE' && (token as BoardType).showGrid !== false;
    const isHexGrid = token.gridType === 'HEX';

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

    // Generate hex grid pattern with proper tiling
    const hexGridPattern = (
        <pattern
            id={`hex-grid-${token.id}`}
            width={patternW}
            height={patternH}
            patternUnits="userSpaceOnUse"
        >
            <path
                d={hexGridPath}
                fill="none"
                stroke="rgba(128,128,128,0.3)"
                strokeWidth={1 / zoom}
            />
        </pattern>
    );

    // Generate square grid pattern
    const squareGridPattern = (
        <pattern
            id={`square-grid-${token.id}`}
            width={gridW}
            height={gridH}
            patternUnits="userSpaceOnUse"
        >
            <rect
                width={gridW}
                height={gridH}
                fill="none"
                stroke="rgba(128,128,128,0.3)"
                strokeWidth={1 / zoom}
            />
        </pattern>
    );

    const gridContent = (
        <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ zIndex: 0 }}
        >
            <defs>
                {isHexGrid ? hexGridPattern : squareGridPattern}
            </defs>
            <rect
                width="100%"
                height="100%"
                fill={`url(#${isHexGrid ? `hex-grid-${token.id}` : `square-grid-${token.id}`})`}
            />
        </svg>
    );

    return (
        <div
            onMouseDown={onMouseDown}
            onContextMenu={onContextMenu}
            className={`absolute group ${currentTool !== 'none' ? 'cursor-default' : isDragging ? 'cursor-grabbing opacity-80' : isOwner ? 'cursor-grab' : ''} ${obj.locked ? 'ring-2 ring-red-500' : ''}`}
            style={{
                left: token.x,
                top: token.y,
                width: token.width,
                height: token.height,
                transform: `rotate(${token.rotation}deg)`,
                zIndex: obj.zIndex ?? 0,
                border: '2px solid rgba(100,100,100,0.5)',
                backgroundColor: token.color || 'transparent',
                backgroundImage: token.content ? `url(${token.content})` : undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                borderRadius: '4px',
            }}
        >
            {/* Grid overlay */}
            {shouldShowGrid && gridContent}

            {/* Resize handle - bottom right corner */}
            {canResize && !obj.locked && (
                <div
                    onMouseDown={onResizeStart}
                    className={`absolute bottom-0 right-0 w-4 h-4 cursor-se-resize ${isResizing ? 'bg-blue-500' : 'bg-gray-400 hover:bg-blue-400'} ${currentTool === 'none' ? 'opacity-0 group-hover:opacity-100' : 'opacity-0'} transition-opacity`}
                    style={{
                        transform: `scale(${1 / zoom})`,
                        transformOrigin: 'bottom right',
                    }}
                />
            )}

            {/* Lock indicator */}
            {obj.locked && (
                <div className="absolute top-2 left-2 text-red-500 opacity-75">
                    <Lock size={16} />
                </div>
            )}

            {/* Board name label */}
            <div className={`absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full bg-black/70 text-white px-2 py-1 rounded text-xs whitespace-nowrap ${currentTool === 'none' ? 'opacity-0 group-hover:opacity-100' : 'opacity-0'} transition-opacity`}>
                {token.name}
            </div>
        </div>
    );
};
