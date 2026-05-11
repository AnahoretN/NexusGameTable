import React, { memo } from 'react';
import { SvgTokenShape } from '../SvgTokenShape';
import { EffectTemplateRendererMemo } from '../EffectTemplateRenderer';
import { PinnedIndicator } from '../PinnedIndicator';
import { Pin, RotateCw, RefreshCw, Trash2, Copy, Lock, Unlock, Eye, EyeOff, ChevronsUpDown, SkipForward, SkipBack, Rewind } from 'lucide-react';
import { TableObject, Token as TokenType, ItemType, TokenCounter, TokenCounterDisplay } from '../../types';
import { getTokenWithAppliedState } from '../../utils/contextMenuActions';

interface PinnedGameObjectsRendererProps {
  pinnedGameObjects: TableObject[];
  state: any;
  draggingId: string | null;
  currentTool: string;
  isCtrlPressed: boolean;
  isGM: boolean;
  activePlayerId: string;
  pixelsPerVU: number;
  onContextMenu: (e: React.MouseEvent, obj: TableObject) => void;
  onMouseDown: (e: React.MouseEvent, objId: string) => void;
  dispatch: React.Dispatch<any>;
}

// Token counters display component (simplified for pinned objects)
interface TokenCountersDisplayProps {
  counters: TokenCounter[];
  counterDisplay: TokenCounterDisplay | undefined;
  tokenWidth: number;
  tokenHeight: number;
  pixelsPerVU: number;
  isGM: boolean;
  tokenId: string;
  dispatch: React.Dispatch<any>;
}

const TokenCountersDisplay: React.FC<TokenCountersDisplayProps> = ({
  counters,
  counterDisplay,
  tokenWidth,
  tokenHeight,
  pixelsPerVU,
  isGM,
  tokenId,
  dispatch
}) => {
  if (!isGM && counterDisplay?.showForPlayers === false) {
    return null;
  }
  if (!counters || counters.length === 0) {
    return null;
  }

  const position = counterDisplay?.position || 'below';
  const baseBarHeight = 7 * pixelsPerVU;
  const gap = pixelsPerVU;

  const renderBar = (counter: TokenCounter, index: number) => {
    if (counterDisplay?.displayType === 'bars') {
      const maxValue = counter.maxValue || 100;
      const currentValue = counter.value || 0;
      const barSize = counter.width || 60;
      const barWidth = Math.max(barSize * pixelsPerVU, tokenWidth);
      const fillPercentage = Math.min(100, Math.max(0, (currentValue / maxValue) * 100));
      const color = counter.color || '#e74c3c';

      const positionStyle: React.CSSProperties = {
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)',
      };

      if (position === 'above') {
        positionStyle.bottom = '100%';
        positionStyle.marginBottom = `${gap}px`;
      } else {
        positionStyle.top = '100%';
        positionStyle.marginTop = `${gap}px`;
      }

      return (
        <div
          key={counter.id}
          style={{
            ...positionStyle,
            width: `${barWidth}px`,
            height: `${baseBarHeight}px`,
            backgroundColor: 'rgba(0,0,0,0.7)',
            borderRadius: '4px',
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.3)',
          }}
        >
          <div
            style={{
              width: `${fillPercentage}%`,
              height: '100%',
              backgroundColor: color,
              transition: 'width 0.1s ease',
            }}
          />
        </div>
      );
    }
    return null;
  };

  return <>{counters.map((c, i) => renderBar(c, i))}</>;
};

export const PinnedGameObjectsRenderer = memo<PinnedGameObjectsRendererProps>(({
  pinnedGameObjects,
  state,
  draggingId,
  currentTool,
  isCtrlPressed,
  isGM,
  activePlayerId,
  pixelsPerVU,
  onContextMenu,
  onMouseDown,
  dispatch,
}) => {
  const renderPinnedToken = (obj: TableObject) => {
    const token = getTokenWithAppliedState(obj as TokenType, state.objects);
    const pinnedPosition = (obj as any).pinnedScreenPosition;
    if (!pinnedPosition) return null;

    const isOwner = !(obj as any).ownerId || (obj as any).ownerId === activePlayerId || isGM;
    const canDrag = !obj.locked;
    const draggingClass = draggingId === obj.id ? 'cursor-grabbing z-[100000]' : (canDrag ? 'cursor-grab' : 'cursor-default');

    return (
      <div
        key={obj.id}
        data-object-id={obj.id}
        className="absolute flex items-center justify-center text-white font-bold select-none group"
        style={{
          left: pinnedPosition.x,
          top: pinnedPosition.y,
          width: token.width * pixelsPerVU,
          height: token.height * pixelsPerVU,
          pointerEvents: 'auto',
          transform: `rotate(${obj.rotation || 0}deg)`,
        }}
        onMouseDown={(e) => isOwner && onMouseDown(e, obj.id)}
        onContextMenu={(e) => onContextMenu(e, obj)}
      >
        <SvgTokenShape
          shape={token.shape}
          width={token.width * pixelsPerVU}
          height={token.height * pixelsPerVU}
          color={token.color || '#e74c3c'}
          content={token.content}
          rotation={0}
          borderWidth={token.borderWidth ?? 2}
          borderColor={(token as any).borderColor || 'white'}
          opacity={token.opacity ?? 100}
          borderOpacity={(token as any).borderOpacity ?? 100}
          showThickness={true}
          tokenName={(token as any).showNameOnToken || (obj as any).showName ? obj.name : undefined}
          fontColor={(token as any).fontColor || 'white'}
        />

        <TokenCountersDisplay
          counters={(obj as any).counters || []}
          counterDisplay={(obj as any).counterDisplay}
          tokenWidth={token.width * pixelsPerVU}
          tokenHeight={token.height * pixelsPerVU}
          pixelsPerVU={pixelsPerVU}
          isGM={isGM}
          tokenId={obj.id}
          dispatch={dispatch}
        />

        <PinnedIndicator />

        {/* Action buttons */}
        <div className={`absolute -bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 transition-opacity z-20 ${isCtrlPressed ? 'opacity-0 pointer-events-none' : 'opacity-0 group-hover:opacity-100 pointer-events-auto'}`}>
          {obj.actionButtons?.includes('delete') && (
            <button
              onClick={(e) => { e.stopPropagation(); dispatch({ type: 'DELETE_OBJECT', payload: { id: obj.id } }); }}
              className="bg-red-600 hover:bg-red-500 text-white p-1 rounded"
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
          )}
          {obj.actionButtons?.includes('clone') && (
            <button
              onClick={(e) => { e.stopPropagation(); dispatch({ type: 'CLONE_OBJECT', payload: { id: obj.id } }); }}
              className="bg-cyan-600 hover:bg-cyan-500 text-white p-1 rounded"
              title="Clone"
            >
              <Copy size={14} />
            </button>
          )}
          {obj.actionButtons?.includes('rotate') && (
            <button
              onClick={(e) => { e.stopPropagation(); dispatch({ type: 'ROTATE_OBJECT', payload: { id: obj.id } }); }}
              className="bg-green-600 hover:bg-green-500 text-white p-1 rounded"
              title="Rotate"
            >
              <RotateCw size={14} />
            </button>
          )}
          {obj.actionButtons?.includes('flip') && (
            <button
              onClick={(e) => { e.stopPropagation(); dispatch({ type: 'FLIP_CARD', payload: { cardId: obj.id } }); }}
              className="bg-purple-600 hover:bg-purple-500 text-white p-1 rounded"
              title="Flip"
            >
              <RefreshCw size={14} />
            </button>
          )}
          {obj.actionButtons?.includes('lock') && (
            <button
              onClick={(e) => { e.stopPropagation(); dispatch({ type: 'TOGGLE_LOCK', payload: { id: obj.id } }); }}
              className="bg-yellow-600 hover:bg-yellow-500 text-white p-1 rounded"
              title={obj.locked ? 'Unlock' : 'Lock'}
            >
              {obj.locked ? <Unlock size={14} /> : <Lock size={14} />}
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              const isPinned = (obj as any).isPinnedToViewport;
              if (isPinned) {
                const pinnedPos = (obj as any).pinnedScreenPosition;
                if (pinnedPos) {
                  const { offset, zoom, scroll, pixelsPerVU: ppVU } = state.viewTransform;
                  const worldX = (pinnedPos.x * zoom - offset.x + scroll.x) / (ppVU * zoom);
                  const worldY = (pinnedPos.y * zoom - offset.y + scroll.y) / (ppVU * zoom);
                  dispatch({ type: 'UNPIN_FROM_VIEWPORT', payload: { id: obj.id, worldX, worldY } });
                }
              }
            }}
            className="bg-pink-600 hover:bg-pink-500 text-white p-1 rounded"
            title="Unpin"
          >
            <Pin size={14} />
          </button>
        </div>
      </div>
    );
  };

  const renderPinnedEffect = (obj: TableObject) => {
    const pinnedPosition = (obj as any).pinnedScreenPosition;
    if (!pinnedPosition) return null;

    return (
      <div
        key={obj.id}
        data-object-id={obj.id}
        className="absolute"
        style={{
          left: pinnedPosition.x,
          top: pinnedPosition.y,
          pointerEvents: 'auto',
        }}
        onMouseDown={(e) => onMouseDown(e, obj.id)}
        onContextMenu={(e) => onContextMenu(e, obj)}
      >
        <EffectTemplateRendererMemo
          effect={obj}
          pixelsPerVU={pixelsPerVU}
        />
        <PinnedIndicator />
      </div>
    );
  };

  const renderPinnedGameObject = (obj: TableObject) => {
    if (obj.type === ItemType.TOKEN) {
      return renderPinnedToken(obj);
    }
    if (obj.type === ItemType.EFFECT_TEMPLATE) {
      return renderPinnedEffect(obj);
    }
    // For other types (CARD, COUNTER, DICE_OBJECT, etc.), render a simple placeholder
    const pinnedPosition = (obj as any).pinnedScreenPosition;
    if (!pinnedPosition) return null;

    return (
      <div
        key={obj.id}
        data-object-id={obj.id}
        className="absolute flex items-center justify-center"
        style={{
          left: pinnedPosition.x,
          top: pinnedPosition.y,
          pointerEvents: 'auto',
        }}
        onMouseDown={(e) => onMouseDown(e, obj.id)}
        onContextMenu={(e) => onContextMenu(e, obj)}
      >
        <div className="bg-gray-700 text-white p-2 rounded text-xs">
          {obj.name || obj.type}
        </div>
        <PinnedIndicator />
      </div>
    );
  };

  return (
    <div className="fixed inset-0 pointer-events-none z-[600]">
      {pinnedGameObjects.map(obj => renderPinnedGameObject(obj))}
    </div>
  );
});

PinnedGameObjectsRenderer.displayName = 'PinnedGameObjectsRenderer';
