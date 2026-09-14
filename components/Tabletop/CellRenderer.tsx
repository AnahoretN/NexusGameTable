import React, { memo, useMemo } from 'react';
import { SvgTokenShape } from '../SvgTokenShape';
import { BoardBackgroundImageMemo } from './BoardWithResize';
import { PinnedIndicator } from '../PinnedIndicator';
import { TableObject, BattlefieldCell as BattlefieldCellType } from '../../types';
import { Tooltip } from '../Tooltip';
import { getGlobalCacheVersion, CELL_BORDER_SCALE } from '../SvgTokenShape';

interface CellRendererProps {
  obj: TableObject;
  globalZIndex: number;
  v2p: (value: number) => number;
  createPositionedStyle: (
    x: number,
    y: number,
    width: number,
    height: number,
    zIndex: number,
    layerId: string,
    extraStyles?: React.CSSProperties
  ) => React.CSSProperties;
  getLayerInverseScale: (layerId: string) => number;
  draggingId: string | null;
  currentTool: string;
  isGM: boolean;
  activePlayerId: string;
  pixelsPerVU: number;
  state: any;
  onContextMenu: (e: React.MouseEvent, obj: TableObject) => void;
  onMouseDown: (e: React.MouseEvent, objId: string) => void;
  dispatch: React.Dispatch<any>;
}

export const CellRenderer = memo(({
  obj,
  globalZIndex,
  v2p,
  createPositionedStyle,
  getLayerInverseScale,
  draggingId,
  currentTool,
  isGM: _isGM,
  activePlayerId,
  pixelsPerVU: _pixelsPerVU,
  state: _state,
  onContextMenu,
  onMouseDown,
  dispatch: _dispatch,
}: CellRendererProps) => {
  const cell = obj as BattlefieldCellType;
  const objLayer = obj.hyperscaleLayerId || 'none';

  const canDrag = !obj.locked && (!obj.isDragging || obj.dragOwnerId === activePlayerId);
  const isDragging = draggingId === obj.id;
  const isDraggingByOther = obj.isDragging && obj.dragOwnerId && obj.dragOwnerId !== activePlayerId;

  const cursorClass = useMemo(() => {
    if (currentTool !== 'none' && currentTool !== 'zoom') return 'cursor-default';
    // 🔥 FIX: Don't add z-[100000] - z-index is already set via globalZIndex prop
    if (isDragging) return 'cursor-grabbing';
    if (isDraggingByOther) return 'cursor-not-allowed opacity-50';
    if (canDrag) return 'cursor-grab';
    return 'cursor-default';
  }, [currentTool, isDragging, isDraggingByOther, canDrag]);

  const positionStyle = useMemo(() => {
    const inverseScale = getLayerInverseScale(objLayer);
    const transform = `rotate(${obj.rotation || 0}deg)${inverseScale !== 1 ? ` scale(${inverseScale})` : ''}`;

    const style = createPositionedStyle(
      v2p(obj.x),
      v2p(obj.y),
      v2p(cell.width),
      v2p(cell.height),
      globalZIndex,
      objLayer,
      {
        transform,
        overflow: 'visible',
        willChange: isDragging ? 'transform, left, top' : undefined,
        opacity: isDraggingByOther ? 0.5 : undefined,
        pointerEvents: isDraggingByOther ? 'none' : undefined,
      }
    );
    return style;
  }, [obj.x, obj.y, obj.rotation, cell.width, cell.height, globalZIndex, objLayer, v2p, createPositionedStyle, getLayerInverseScale, isDragging, isDraggingByOther]);

  return (
    <Tooltip
      text={undefined}
      showImage={false}
      imageSrc={undefined}
      scale={undefined}
    >
      <div
        data-object-id={obj.id}
        onClick={undefined}
        onContextMenu={(e) => onContextMenu(e, obj)}
        onMouseDown={(e) => onMouseDown(e, obj.id)}
        className={`absolute flex items-center justify-center select-none group ${cursorClass}`}
        style={positionStyle}
      >
        {/* Background image with opacity */}
        {cell.content && (
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            <BoardBackgroundImageMemo
              content={cell.content}
              opacity={(cell as any).backgroundOpacity ?? 100}
              cacheVersion={getGlobalCacheVersion()}
            />
          </div>
        )}

        <SvgTokenShape
          shape={cell.shape}
          width={v2p(cell.width)}
          height={v2p(cell.height)}
          color={cell.color || '#496179'}
          content=""
          rotation={0}
          // Border thickness is stored in VU - scale to screen px like width/height
          // so the border scales with zoom (cell magnetism relies on the VU thickness)
          borderWidth={v2p((cell.borderWidth ?? 2) * CELL_BORDER_SCALE)}
          borderColor={cell.borderColor || '#212f3c'}
          opacity={cell.opacity ?? 100}
          borderOpacity={cell.borderOpacity ?? 100}
          // The svg is drawn larger than the content box (border + padding around it).
          // Without this, flex shrinks the svg to the container width and
          // preserveAspectRatio letterboxes the content - the visible fill becomes
          // smaller than the cell bounds, leaving visual gaps between snapped cells.
          style={{ flexShrink: 0 }}
          // Draw the border centered on the cell edge: the stroke's center line lies on
          // the object bounds, so half the thickness is inside and half outside
          borderCentered
        />

        {(obj as any).isPinnedToViewport && !isDragging && <PinnedIndicator />}
      </div>
    </Tooltip>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.obj === nextProps.obj &&
    prevProps.globalZIndex === nextProps.globalZIndex &&
    prevProps.draggingId === nextProps.draggingId &&
    prevProps.currentTool === nextProps.currentTool &&
    prevProps.isGM === nextProps.isGM &&
    prevProps.activePlayerId === nextProps.activePlayerId &&
    // Zoom changed - cells must re-render with new pixel positions and sizes
    prevProps.pixelsPerVU === nextProps.pixelsPerVU &&
    prevProps.v2p === nextProps.v2p
  );
});

CellRenderer.displayName = 'CellRenderer';
