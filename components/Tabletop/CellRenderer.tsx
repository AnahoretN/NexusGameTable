import React, { memo, useMemo } from 'react';
import { SvgTokenShape } from '../SvgTokenShape';
import { BoardBackgroundImageMemo } from './BoardWithResize';
import { PinnedIndicator } from '../PinnedIndicator';
import { TableObject, BattlefieldCell as BattlefieldCellType, ItemType, TokenShape } from '../../types';
import { Tooltip } from '../Tooltip';
import { getGlobalCacheVersion } from '../SvgTokenShape';

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
  isGM,
  activePlayerId,
  pixelsPerVU,
  state,
  onContextMenu,
  onMouseDown,
  dispatch,
}: CellRendererProps) => {
  const cell = obj as BattlefieldCellType;
  const objLayer = obj.hyperscaleLayerId || 'none';
  const viewTransform = state.viewTransform;

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
          borderWidth={cell.borderWidth ?? 2}
          borderColor={cell.borderColor || '#212f3c'}
          opacity={cell.opacity ?? 100}
          borderOpacity={cell.borderOpacity ?? 100}
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
    prevProps.activePlayerId === nextProps.activePlayerId
  );
});

CellRenderer.displayName = 'CellRenderer';
