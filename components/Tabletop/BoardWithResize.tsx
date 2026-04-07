import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Token as TokenType, Board as BoardType, GridType } from '../../types';
import { Lock } from 'lucide-react';
import { calculateFlexibleHexGrid, calculateHorizontalHexGrid, calculateFlatHexHeight } from '../../utils/gridUtils';
import { ResizeHandleMemo } from '../ResizeHandle';
import { HexGridMemo } from '../HexGrid';
import { SquareGridMemo } from '../SquareGrid';

/**
 * Simplified board rendering for resize mode - much better performance
 * Shows just the basic board without heavy grid overlays
 */
const SimplifiedBoard: React.FC<{
    token: TokenType | BoardType;
    obj: any;
    isResizing: boolean;
    actualWidth: number;
    actualHeight: number;
    onContextMenu: (e: React.MouseEvent) => void;
    onMouseDown?: (e: React.MouseEvent) => void;
    onResizeStart: (e: React.MouseEvent) => void;
    canResize: boolean;
    zoom: number;
    onResizeHandleEnter?: () => void;
    onResizeHandleLeave?: () => void;
    currentTool?: string;
}> = ({
    token,
    obj,
    isResizing,
    actualWidth,
    actualHeight,
    onContextMenu,
    onMouseDown,
    onResizeStart,
    canResize,
    zoom,
    onResizeHandleEnter,
    onResizeHandleLeave,
    currentTool = 'none',
}) => {
    return (
        <div
            onContextMenu={onContextMenu}
            {...(onMouseDown && { onMouseDown })}
            className={`absolute flex items-center justify-center text-white font-bold select-none group ${isResizing ? 'opacity-80' : ''} ${obj.locked ? 'ring-2 ring-red-500' : ''}`}
            style={{
                left: 0,
                top: 0,
                width: '100%',
                height: '100%',
                transform: `rotate(${token.rotation}deg)`,
                zIndex: obj.zIndex ?? 0,
                border: '2px solid #212f3c',
                boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
                backgroundColor: token.color || '#34495e',
                backgroundImage: (obj as any).content ? `url(${(obj as any).content})` : undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                borderRadius: '4px',
                cursor: 'default',
                overflow: 'hidden',
                pointerEvents: 'auto',
            }}
        >
            {/* No icon during resize - cleaner look */}

            {/* Resize handle - always visible in simplified mode */}
            {canResize && !obj.locked && (
                <div
                    className="absolute bottom-0 right-0"
                    style={{ pointerEvents: 'none' }}
                >
                    <ResizeHandleMemo
                        zoom={zoom}
                        isVisible={true}
                        onResizeStart={onResizeStart}
                        onMouseEnter={onResizeHandleEnter || (() => {})}
                        onMouseLeave={onResizeHandleLeave || (() => {})}
                    />
                </div>
            )}

            {/* Lock indicator */}
            {obj.locked && (
                <div className="absolute top-2 left-2 text-red-500 opacity-75" style={{ pointerEvents: 'auto' }}>
                    <Lock size={16} />
                </div>
            )}

            {/* Board name label */}
            <div className={`absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full bg-black/70 text-white px-2 py-1 rounded text-xs whitespace-nowrap ${currentTool === 'none' || currentTool === 'zoom' ? 'opacity-0 group-hover:opacity-100' : 'opacity-0'} transition-opacity`} style={{ pointerEvents: 'auto' }}>
                {token.name}
            </div>
        </div>
    );
};

interface BoardWithResizeProps {
    token: TokenType | BoardType;
    obj: any;
    isOwner: boolean;
    isResizing: boolean;
    canResize: boolean;
    zoom: number;
    onContextMenu: (e: React.MouseEvent) => void;
    onMouseDown?: (e: React.MouseEvent) => void;
    onResizeStart: (e: React.MouseEvent) => void;
    onResizeHandleEnter?: () => void;
    onResizeHandleLeave?: () => void;
    gridSize: number;
    gridWidth?: number;
    gridHeight?: number;
    showGrid?: boolean;
    currentTool?: string;
    livePreviewSize?: { width: number; height: number } | null; // Live preview during resize
}

export const BoardWithResize: React.FC<BoardWithResizeProps> = ({
    token,
    obj,
    isOwner,
    isResizing,
    canResize,
    zoom,
    onContextMenu,
    onMouseDown,
    onResizeStart,
    onResizeHandleEnter,
    onResizeHandleLeave,
    gridSize,
    gridWidth,
    gridHeight,
    showGrid,
    currentTool = 'none',
    livePreviewSize,
}) => {
    // Use live preview size during resize, otherwise use actual size
    const actualWidth = isResizing && livePreviewSize ? livePreviewSize.width : (token.width ?? 100);
    const actualHeight = isResizing && livePreviewSize ? livePreviewSize.height : (token.height ?? 100);
    // Board cursor is ALWAYS default/pointer arrow (never grab)
    // Only resize handle (triangle) gets se-resize cursor
    const boardCursor = 'default';

    // Check if grid should be shown
    const boardToken = token as BoardType;
    const shouldShowGrid = boardToken.gridType && boardToken.gridType !== GridType.NONE && boardToken.showGrid !== false;
    const isHexGrid = boardToken.gridType === GridType.HEX;
    const isHexHorizontalGrid = boardToken.gridType === GridType.HEX_HORIZONTAL;
    const isSquareGrid = boardToken.gridType === GridType.SQUARE;

    // Hex grid constants
    const HEX_RATIO = 1.15;
    const DEFAULT_HEX_WIDTH = 100;
    const DEFAULT_FLAT_HEX_WIDTH = 115;

    // Use gridWidth if provided, otherwise fall back to default hex dimensions
    // Use useMemo to ensure these recalculate when gridType, gridWidth, or gridHeight change
    const actualGridWidth = useMemo(() => {
        return gridWidth ?? boardToken.gridWidth ?? (isHexGrid ? DEFAULT_HEX_WIDTH : (isHexHorizontalGrid ? DEFAULT_FLAT_HEX_WIDTH : gridSize));
    }, [gridWidth, boardToken.gridWidth, isHexGrid, isHexHorizontalGrid, gridSize]);

    const actualGridHeight = useMemo(() => {
        if (gridHeight !== undefined) return gridHeight;
        if (boardToken.gridHeight !== undefined) return boardToken.gridHeight;

        if (isHexGrid) {
            return Math.round(actualGridWidth * HEX_RATIO * 100) / 100;
        } else if (isHexHorizontalGrid) {
            return Math.round(calculateFlatHexHeight(actualGridWidth) * 100) / 100;
        } else {
            return gridSize;
        }
    }, [gridHeight, boardToken.gridHeight, isHexGrid, isHexHorizontalGrid, gridSize, actualGridWidth]);

    // Grid overlay - use proper grid components for better rendering
    // Hide grid overlay during resize for performance
    const gridContent = shouldShowGrid && !isResizing && (
        <>
            {(isHexGrid || isHexHorizontalGrid) ? (
                <HexGridMemo
                    width={actualWidth * zoom}
                    height={actualHeight * zoom}
                    orientation={isHexGrid ? 'pointy-top' : 'flat-top'}
                    hexWidth={actualGridWidth}
                    hexHeight={actualGridHeight}
                    stroke="rgba(33,47,60,0.7)"
                    strokeWidth={1}
                    zoom={zoom}
                />
            ) : isSquareGrid ? (
                <SquareGridMemo
                    width={actualWidth * zoom}
                    height={actualHeight * zoom}
                    cellWidth={actualGridWidth}
                    cellHeight={actualGridHeight}
                    stroke="rgba(33,47,60,0.7)"
                    strokeWidth={1}
                    zoom={zoom}
                />
            ) : null}
        </>
    );

    // Use simplified rendering during resize for better performance
    if (isResizing) {
        return (
            <SimplifiedBoard
                token={token}
                obj={obj}
                isResizing={isResizing}
                actualWidth={actualWidth}
                actualHeight={actualHeight}
                onContextMenu={onContextMenu}
                onMouseDown={onMouseDown}
                onResizeStart={onResizeStart}
                canResize={canResize}
                zoom={zoom}
                onResizeHandleEnter={onResizeHandleEnter}
                onResizeHandleLeave={onResizeHandleLeave}
                currentTool={currentTool}
            />
        );
    }

    return (
        <div
            onContextMenu={onContextMenu}
            {...(onMouseDown && { onMouseDown })}
            className={`absolute flex items-center justify-center text-white font-bold select-none group ${isResizing ? 'opacity-80' : ''} ${obj.locked ? 'ring-2 ring-red-500' : ''}`}
            style={{
                left: 0,
                top: 0,
                width: '100%',
                height: '100%',
                transform: `rotate(${token.rotation}deg)`,
                zIndex: obj.zIndex ?? 0,
                border: '2px solid #212f3c',
                boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
                backgroundColor: token.color || '#34495e',
                backgroundImage: (obj as any).content ? `url(${(obj as any).content})` : undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                borderRadius: '4px',
                cursor: boardCursor,
                overflow: 'hidden',
                pointerEvents: 'auto', // Enable mouse events on the board
            }}
        >
            {/* Grid overlay - proper rendering for all grid types */}
            {gridContent}

            {/* Resize handle - bottom right corner - always visible */}
            {canResize && !obj.locked && (
                <div
                    className="absolute bottom-0 right-0"
                    style={{ pointerEvents: 'none' }} // Wrapper doesn't capture events
                >
                    <ResizeHandleMemo
                        zoom={zoom}
                        isVisible={true}
                        onResizeStart={onResizeStart}
                        onMouseEnter={onResizeHandleEnter || (() => {})}
                        onMouseLeave={onResizeHandleLeave || (() => {})}
                    />
                </div>
            )}

            {/* Lock indicator */}
            {obj.locked && (
                <div className="absolute top-2 left-2 text-red-500 opacity-75" style={{ pointerEvents: 'auto' }}>
                    <Lock size={16} />
                </div>
            )}

            {/* Board name label */}
            <div className={`absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full bg-black/70 text-white px-2 py-1 rounded text-xs whitespace-nowrap ${currentTool === 'none' || currentTool === 'zoom' ? 'opacity-0 group-hover:opacity-100' : 'opacity-0'} transition-opacity`} style={{ pointerEvents: 'auto' }}>
                {token.name}
            </div>
        </div>
    );
};

// Memoize the component to prevent unnecessary re-renders
export const BoardWithResizeMemo = React.memo(BoardWithResize, (prevProps, nextProps) => {
    // Re-render when important props change
    if (prevProps.isResizing !== nextProps.isResizing) {
        return false; // Force re-render for resize state changes
    }

    if (prevProps.canResize !== nextProps.canResize ||
        prevProps.obj.locked !== nextProps.obj.locked ||
        Math.abs((prevProps.token.width || 0) - (nextProps.token.width || 0)) > 1 ||
        Math.abs((prevProps.token.height || 0) - (nextProps.token.height || 0)) > 1) {
        return false; // Re-render when size changes significantly
    }

    // Check live preview size changes during resize
    const prevLive = prevProps.livePreviewSize;
    const nextLive = nextProps.livePreviewSize;
    if (prevLive !== nextLive) {
        if (!prevLive || !nextLive ||
            Math.abs(prevLive.width - nextLive.width) > 1 ||
            Math.abs(prevLive.height - nextLive.height) > 1) {
            return false; // Re-render when live preview size changes
        }
    }

    // IMPORTANT: Check board properties that affect rendering
    const prevBoard = prevProps.token;
    const nextBoard = nextProps.token;

    // Check rotation changes
    if ((prevBoard.rotation || 0) !== (nextBoard.rotation || 0)) {
        return false; // Re-render when rotation changes
    }

    // Check grid size changes
    if ((prevBoard.gridSize || 50) !== (nextBoard.gridSize || 50) ||
        (prevBoard.gridWidth || 50) !== (nextBoard.gridWidth || 50) ||
        (prevBoard.gridHeight || 50) !== (nextBoard.gridHeight || 50)) {
        return false; // Re-render when grid cell size changes
    }

    // Check grid type changes
    if (prevBoard.gridType !== nextBoard.gridType) {
        return false; // Re-render when grid type changes
    }

    // Check showGrid changes
    if (prevBoard.showGrid !== nextBoard.showGrid) {
        return false; // Re-render when grid visibility changes
    }

    // Check color changes
    if (prevBoard.color !== nextBoard.color) {
        return false; // Re-render when board color changes
    }

    // Check background image changes
    if (prevProps.obj.content !== nextProps.obj.content) {
        return false; // Re-render when background image changes
    }

    // Check zoom changes - important for grid rendering
    if (prevProps.zoom !== nextProps.zoom) {
        return false; // Re-render when zoom changes
    }

    return true; // Skip re-render by default
});
