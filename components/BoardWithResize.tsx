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
    hexR: number;
    hexW: number;
    hexPath: string;
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
    hexR,
    hexW,
    hexPath,
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

    const showGrid = token.gridType && token.gridType !== GridType.NONE;

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
                left: obj.x,
                top: obj.y,
                width: obj.width,
                height: obj.height,
                backgroundColor: (obj as any).content ? 'transparent' : ((obj as any).color || '#34495e'),
                backgroundImage: (obj as any).content ? `url(${(obj as any).content})` : undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                border: '2px solid white',
                boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
                transform: `rotate(${obj.rotation}deg)`,
                cursor: cursor,
            }}
        >
            {/* Grid overlay */}
            {showGrid && (
                <svg className="absolute inset-0 pointer-events-none opacity-50" width="100%" height="100%">
                    <defs>
                        {token.gridType === GridType.SQUARE && (
                            <pattern id={`grid-square-${obj.id}`} width={gridSize} height={gridSize} patternUnits="userSpaceOnUse">
                                <path d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`} fill="none" stroke="black" strokeWidth="1"/>
                            </pattern>
                        )}
                        {token.gridType === GridType.HEX && (
                            <pattern id={`grid-hex-${obj.id}`} width={hexW} height={gridSize * 3} patternUnits="userSpaceOnUse">
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
