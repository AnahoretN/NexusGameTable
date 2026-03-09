import React from 'react';
import { Token as TokenType, Board as BoardType, GridType } from '../../types';
import { Lock } from 'lucide-react';
import { calculateFlexibleHexGrid, calculateHorizontalHexGrid } from '../../utils/gridUtils';

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
    // Check if grid should be shown (grid type exists AND showGrid is not false)
    const shouldShowGrid = token.gridType && token.gridType !== 'NONE' && (token as BoardType).showGrid !== false;
    const isHexGrid = token.gridType === GridType.HEX;
    const isHexHorizontalGrid = token.gridType === GridType.HEX_HORIZONTAL;

    // Hex grid constants
    const HEX_RATIO = 1.15;

    // Use gridWidth if provided, otherwise fall back to gridSize
    // This ensures the grid matches the snapping behavior which uses gridSize
    const actualGridWidth = gridWidth ?? gridSize;
    const actualGridHeight = gridHeight ?? (isHexGrid ? Math.round(gridSize * HEX_RATIO * 100) / 100 : (isHexHorizontalGrid ? gridSize / HEX_RATIO : gridSize));

    // Flexible hex grid calculations
    let hexGridPattern: React.ReactNode = null;
    if (isHexGrid) {
        const hexGrid = calculateFlexibleHexGrid(actualGridWidth);

        hexGridPattern = (
            <pattern
                id={`hex-grid-${token.id}`}
                width={hexGrid.patternWidth}
                height={hexGrid.patternHeight}
                patternUnits="userSpaceOnUse"
            >
                <path
                    d={hexGrid.path}
                    fill="none"
                    stroke="rgba(100,100,100,0.7)"
                    strokeWidth={1 / zoom}
                />
            </pattern>
        );
    } else if (isHexHorizontalGrid) {
        const hexGrid = calculateHorizontalHexGrid(actualGridWidth);

        hexGridPattern = (
            <pattern
                id={`hex-grid-${token.id}`}
                width={hexGrid.patternWidth}
                height={hexGrid.patternHeight}
                patternUnits="userSpaceOnUse"
            >
                <path
                    d={hexGrid.path}
                    fill="none"
                    stroke="rgba(100,100,100,0.7)"
                    strokeWidth={1 / zoom}
                />
            </pattern>
        );
    }

    // Generate square grid pattern (uses actualGridWidth and actualGridHeight)
    const squareGridPattern = (
        <pattern
            id={`square-grid-${token.id}`}
            width={actualGridWidth}
            height={actualGridHeight}
            patternUnits="userSpaceOnUse"
        >
            <rect
                width={actualGridWidth}
                height={actualGridHeight}
                fill="none"
                stroke="rgba(100,100,100,0.7)"
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
                {(isHexGrid || isHexHorizontalGrid) ? hexGridPattern : squareGridPattern}
            </defs>
            <rect
                width="100%"
                height="100%"
                fill={`url(#${(isHexGrid || isHexHorizontalGrid) ? `hex-grid-${token.id}` : `square-grid-${token.id}`})`}
            />
            {/* Magnetism points at cell centers */}
            {magnetPoints.map((point, index) => (
                <circle
                    key={index}
                    cx={point.x}
                    cy={point.y}
                    r={4 / zoom}
                    fill="rgba(100, 150, 255, 0.6)"
                    stroke="rgba(100, 150, 255, 0.3)"
                    strokeWidth={1 / zoom}
                />
            ))}
        </svg>
    );

    // Generate magnetism points at cell centers
    const magnetPoints: { x: number; y: number }[] = [];
    const boardWidth = token.width;
    const boardHeight = token.height;

    if (isHexGrid) {
        // Pointy-top hex grid
        const hexWidth = actualGridWidth;
        const hexHeight = actualGridWidth * 1.15;
        const rowSpacing = hexHeight * 0.75;
        const colSpacing = hexWidth;
        const rowOffset = hexWidth / 2;
        const halfW = hexWidth / 2;
        const halfH = hexHeight / 2;

        const numCols = Math.ceil(boardWidth / colSpacing) + 2;
        const numRows = Math.ceil(boardHeight / rowSpacing) + 2;

        for (let row = -1; row < numRows; row++) {
            for (let col = -1; col < numCols; col++) {
                const x = col * colSpacing + (row % 2) * rowOffset + halfW;
                const y = row * rowSpacing + halfH;
                if (x >= -hexWidth/2 && x <= boardWidth + hexWidth/2 && y >= -hexHeight/2 && y <= boardHeight + hexHeight/2) {
                    magnetPoints.push({ x, y });
                }
            }
        }
    } else if (isHexHorizontalGrid) {
        // Flat-top hex grid
        const hexWidth = actualGridWidth;
        const hexHeight = actualGridWidth / 1.15;
        const colSpacing = hexWidth * 0.75;
        const rowSpacing = hexHeight;
        const colOffset = hexHeight / 2;
        const halfW = hexWidth / 2;
        const halfH = hexHeight / 2;

        const numCols = Math.ceil(boardWidth / colSpacing) + 1;
        const numRows = Math.ceil(boardHeight / rowSpacing) + 1;

        for (let col = 0; col < numCols; col++) {
            for (let row = 0; row < numRows; row++) {
                const x = col * colSpacing + halfW;
                const y = row * rowSpacing + (col % 2) * colOffset + halfH;
                if (x >= -hexWidth && x <= boardWidth + hexWidth && y >= -hexHeight && y <= boardHeight + hexHeight) {
                    magnetPoints.push({ x, y });
                }
            }
        }
    } else {
        // Square grid - points at cell centers
        const numCols = Math.ceil(boardWidth / actualGridWidth) + 1;
        const numRows = Math.ceil(boardHeight / actualGridHeight) + 1;

        for (let row = 0; row <= numRows; row++) {
            for (let col = 0; col <= numCols; col++) {
                magnetPoints.push({
                    x: col * actualGridWidth + actualGridWidth / 2,
                    y: row * actualGridHeight + actualGridHeight / 2
                });
            }
        }
    }

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
            {/* Grid overlay with magnetism points */}
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
