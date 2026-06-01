import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Token as TokenType, Board as BoardType, GridType } from '../../types';
import { Lock } from 'lucide-react';
import { calculateFlexibleHexGrid, calculateHorizontalHexGrid, calculateFlatHexHeight } from '../../utils/gridUtils';
import { ResizeHandleMemo } from '../ResizeHandle';
import { HexGridMemo } from '../HexGrid';
import { SquareGridMemo } from '../SquareGrid';
import { isHashRef, isImageRef } from '../../utils/imageCompat';
import { getGlobalCacheVersion } from '../SvgTokenShape';
import { getAssetURL } from '../../utils/assets';
import { assetEvents } from '../../utils/assets/assetCache';

// Global cache version for P2P asset updates
let globalAssetVersion = 0;

// Subscribe to asset update events
assetEvents.subscribe(() => {
  globalAssetVersion++;
});

/**
 * BoardBackgroundImage - Component that handles board background images
 * Supports both sha256: hashes (new CAS system) and regular URLs
 * Tracks global cache version to reload images when pack is loaded
 */
interface BoardBackgroundImageProps {
  content: string;
  opacity: number;
  cacheVersion?: number; // Global cache version to force re-render when pack is loaded
}

const BoardBackgroundImage: React.FC<BoardBackgroundImageProps> = ({ content, opacity, cacheVersion: externalCacheVersion }) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [internalCacheVersion, setInternalCacheVersion] = useState(getGlobalCacheVersion());

  // Use external cache version if provided, otherwise use internal state
  const currentCacheVersion = externalCacheVersion ?? internalCacheVersion;

  // Track global cache version for force-reload when pack is loaded
  useEffect(() => {
    const globalVersion = getGlobalCacheVersion();
    if (globalVersion !== currentCacheVersion) {
      setInternalCacheVersion(globalVersion);
      // Force re-resolve the image
      setImageUrl(null);
    }
  }, [currentCacheVersion, content]);

  useEffect(() => {
    const loadImage = async () => {
      if (!content) {
        setImageUrl(null);
        return;
      }

      try {
        if (isHashRef(content)) {
          // New CAS system: sha256:hash
          const url = await getAssetURL(content);
          setImageUrl(url);
        } else if (isImageRef(content)) {
          // Old img_ref:// system - not supported, show placeholder
          setImageUrl(null);
        } else {
          // Regular URL (data:image/, http://, etc.)
          setImageUrl(content);
        }
      } catch (error) {
        // If asset not found, it might be loading via P2P - clear to retry
        if ((error as Error).message.includes('Asset not found')) {
          setImageUrl(null); // Clear to force retry
        }
      }
    };

    loadImage();
  }, [content, currentCacheVersion, globalAssetVersion]); // Added globalAssetVersion

  if (!imageUrl) {
    return null;
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundImage: `url(${imageUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        opacity: opacity / 100,
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  );
};

export const BoardBackgroundImageMemo = React.memo(BoardBackgroundImage, (prevProps, nextProps) => {
  // Re-render when cache version changes (pack loaded)
  if (prevProps.cacheVersion !== nextProps.cacheVersion) {
    return false;
  }
  return prevProps.content === nextProps.content && prevProps.opacity === nextProps.opacity;
});

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
    cacheVersion?: number;
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
    cacheVersion,
}) => {

    return (
        <div
            data-object-id={obj.id}
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
                boxShadow: '0 2px 4px rgba(0,0,0,0.08)',
                backgroundColor: token.color || '#34495e',
                borderRadius: '4px',
                cursor: 'default',
                overflow: 'hidden',
                pointerEvents: 'auto',
            }}
        >
            {/* Background image with opacity */}
            {(obj as any).content && (
                <BoardBackgroundImage
                    content={(obj as any).content}
                    opacity={(obj as BoardType).backgroundOpacity ?? 100}
                    cacheVersion={cacheVersion}
                />
            )}

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
    pixelsPerVU: number;
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
    cacheVersion?: number; // Global cache version to force re-render when pack is loaded
}

export const BoardWithResize: React.FC<BoardWithResizeProps> = ({
    token,
    obj,
    isOwner,
    isResizing,
    canResize,
    zoom,
    pixelsPerVU,
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
    cacheVersion,
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
    const DEFAULT_GRID_SIZE = 50;

    // Use gridWidth if provided, otherwise fall back to default hex dimensions
    // Use useMemo to ensure these recalculate when gridType, gridWidth, or gridHeight change
    // IMPORTANT: All values should be in VU (virtual units), not pixels
    const actualGridWidth = useMemo(() => {
        return boardToken.gridWidth ?? (isHexGrid ? DEFAULT_HEX_WIDTH : (isHexHorizontalGrid ? DEFAULT_FLAT_HEX_WIDTH : DEFAULT_GRID_SIZE));
    }, [boardToken.gridWidth, isHexGrid, isHexHorizontalGrid]);

    const actualGridHeight = useMemo(() => {
        if (boardToken.gridHeight !== undefined) return boardToken.gridHeight;

        if (isHexGrid) {
            return Math.round(actualGridWidth * HEX_RATIO * 100) / 100;
        } else if (isHexHorizontalGrid) {
            return Math.round(calculateFlatHexHeight(actualGridWidth) * 100) / 100;
        } else {
            return DEFAULT_GRID_SIZE;
        }
    }, [boardToken.gridHeight, isHexGrid, isHexHorizontalGrid, actualGridWidth]);

    const isCustomGrid = boardToken.gridType === GridType.CUSTOM;

    // Calculate grid cell sizes in pixels (for SVG rendering)
    // IMPORTANT: Use pixelsPerVU to match how tokens are rendered
    // Board container is positioned with v2p() which uses pixelsPerVU
    const gridCellWidthPx = actualGridWidth * pixelsPerVU;
    const gridCellHeightPx = actualGridHeight * pixelsPerVU;

    // Grid overlay - use proper grid components for better rendering
    // Hide grid overlay during resize for performance
    const gridContent = shouldShowGrid && !isResizing && (
        <>
            {isCustomGrid ? (
                // Custom grid from image analysis
                <svg
                    width={actualWidth * pixelsPerVU}
                    height={actualHeight * pixelsPerVU}
                    style={{ position: 'absolute', top: 0, left: 0 }}
                >
                    {(boardToken as any).customGridCells?.map((cell: any) => {
                        const x = cell.x * actualWidth * pixelsPerVU;
                        const y = cell.y * actualHeight * pixelsPerVU;
                        const w = cell.width * actualWidth * pixelsPerVU;
                        const h = cell.height * actualHeight * pixelsPerVU;

                        // Draw cell based on shape
                        if (cell.shape === 'circle') {
                            return (
                                <circle
                                    key={cell.id}
                                    cx={x + w / 2}
                                    cy={y + h / 2}
                                    r={Math.min(w, h) / 2}
                                    fill="none"
                                    stroke="rgba(255,255,255,0.5)"
                                    strokeWidth={1.5}
                                />
                            );
                        } else if (cell.shape === 'hex') {
                            // Draw hexagon
                            const cx = x + w / 2;
                            const cy = y + h / 2;
                            const r = Math.min(w, h) / 2;
                            // Hexagon vertices (pointy-top)
                            const hexPoints = [];
                            for (let i = 0; i < 6; i++) {
                                const angle = (Math.PI / 3) * i - Math.PI / 6;
                                const px = cx + r * Math.cos(angle);
                                const py = cy + r * Math.sin(angle);
                                hexPoints.push(`${px},${py}`);
                            }

                            return (
                                <polygon
                                    key={cell.id}
                                    points={hexPoints.join(' ')}
                                    fill="none"
                                    stroke="rgba(255,255,255,0.5)"
                                    strokeWidth={1.5}
                                />
                            );
                        } else {
                            // Default: draw rectangle/square
                            return (
                                <rect
                                    key={cell.id}
                                    x={x}
                                    y={y}
                                    width={w}
                                    height={h}
                                    fill="none"
                                    stroke="rgba(255,255,255,0.5)"
                                    strokeWidth={1.5}
                                />
                            );
                        }
                    })}
                </svg>
            ) : (isHexGrid || isHexHorizontalGrid) ? (
                <HexGridMemo
                    width={actualWidth * pixelsPerVU}
                    height={actualHeight * pixelsPerVU}
                    orientation={isHexGrid ? 'pointy-top' : 'flat-top'}
                    hexWidth={gridCellWidthPx}
                    hexHeight={gridCellHeightPx}
                    stroke="rgba(33,47,60,0.7)"
                    strokeWidth={1}
                    zoom={1}
                />
            ) : isSquareGrid ? (
                <SquareGridMemo
                    width={actualWidth * pixelsPerVU}
                    height={actualHeight * pixelsPerVU}
                    cellWidth={gridCellWidthPx}
                    cellHeight={gridCellHeightPx}
                    stroke="rgba(33,47,60,0.7)"
                    strokeWidth={1}
                    zoom={1}
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
                cacheVersion={cacheVersion}
            />
        );
    }


    return (
        <div
            data-object-id={obj.id}
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
                boxShadow: '0 2px 4px rgba(0,0,0,0.08)',
                backgroundColor: token.color || '#34495e',
                borderRadius: '4px',
                cursor: boardCursor,
                overflow: 'hidden',
                pointerEvents: 'auto', // Enable mouse events on the board
            }}
        >
            {/* Background image with opacity */}
            {(obj as any).content && (
                <BoardBackgroundImage
                    content={(obj as any).content}
                    opacity={(obj as BoardType).backgroundOpacity ?? 100}
                    cacheVersion={cacheVersion}
                />
            )}

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
    // IMPORTANT: Check cache version to force re-render when pack is loaded
    if (prevProps.cacheVersion !== nextProps.cacheVersion) {
        return false; // Force re-render when cache version changes
    }

    // IMPORTANT: Check currentTool changes to ensure proper re-rendering
    if (prevProps.currentTool !== nextProps.currentTool) {
        return false; // Force re-render when tool changes (especially for zoom)
    }

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
    const prevBoard = prevProps.token as BoardType;
    const nextBoard = nextProps.token as BoardType;

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

    // Check background opacity changes
    if ((prevProps.obj as BoardType).backgroundOpacity !== (nextProps.obj as BoardType).backgroundOpacity) {
        return false; // Re-render when background opacity changes
    }

    // Check zoom changes - important for grid rendering
    if (prevProps.zoom !== nextProps.zoom) {
        return false; // Re-render when zoom changes
    }

    return true; // Skip re-render by default
});
