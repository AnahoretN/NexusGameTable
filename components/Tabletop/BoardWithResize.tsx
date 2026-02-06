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
    hexR: number;
    hexW: number;
    hexPath: string;
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
    hexR,
    hexW,
    hexPath,
}) => {
    const showGrid = token.gridType && token.gridType !== 'NONE';
    const isHexGrid = token.gridType === 'HEX';

    // Generate hex grid pattern
    const hexGridPattern = (
        <pattern
            id={`hex-grid-${token.id}`}
            width={hexW}
            height={hexR * 3}
            patternUnits="userSpaceOnUse"
            patternTransform={`scale(${zoom})`}
        >
            <path
                d={hexPath}
                fill="none"
                stroke="rgba(128,128,128,0.3)"
                strokeWidth="1"
            />
        </pattern>
    );

    // Generate square grid pattern
    const squareGridPattern = (
        <pattern
            id={`square-grid-${token.id}`}
            width={gridSize}
            height={gridSize}
            patternUnits="userSpaceOnUse"
            patternTransform={`scale(${zoom})`}
        >
            <rect
                width={gridSize}
                height={gridSize}
                fill="none"
                stroke="rgba(128,128,128,0.3)"
                strokeWidth="1"
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
            className={`absolute group ${isDragging ? 'cursor-grabbing opacity-80' : isOwner ? 'cursor-grab' : ''} ${obj.locked ? 'ring-2 ring-red-500' : ''}`}
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
            {showGrid && gridContent}

            {/* Resize handle - bottom right corner */}
            {canResize && !obj.locked && (
                <div
                    onMouseDown={onResizeStart}
                    className={`absolute bottom-0 right-0 w-4 h-4 cursor-se-resize ${isResizing ? 'bg-blue-500' : 'bg-gray-400 hover:bg-blue-400'} opacity-0 group-hover:opacity-100 transition-opacity`}
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
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full bg-black/70 text-white px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                {token.name}
            </div>
        </div>
    );
};
