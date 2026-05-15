import React, { memo, useMemo, useCallback } from 'react';
import { SvgTokenShape } from '../SvgTokenShape';
import { EffectTemplateRendererMemo } from '../EffectTemplateRenderer';
import { PinnedIndicator } from '../PinnedIndicator';
import { Pin, RotateCw, RefreshCw, Trash2, Copy, Lock, Unlock, Eye, EyeOff, ChevronsUpDown, SkipForward, SkipBack, Rewind, Plus, Minus } from 'lucide-react';
import { TableObject, Token as TokenType, ItemType, TokenCounter, TokenCounterDisplay, Counter, DiceObject } from '../../types';
import { useTokenWithState } from '../../hooks/useTokenWithState';

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

const TokenCountersDisplay = memo(({
  counters,
  counterDisplay,
  tokenWidth,
  tokenHeight,
  pixelsPerVU,
  isGM,
  tokenId,
  dispatch
}: TokenCountersDisplayProps) => {
  if (!isGM && counterDisplay?.showForPlayers === false) {
    return null;
  }
  if (!counters || counters.length === 0) {
    return null;
  }

  const position = counterDisplay?.position || 'below';

  // Memoize bar dimensions
  const baseBarHeight = useMemo(() => 7 * pixelsPerVU, [pixelsPerVU]);
  const gap = useMemo(() => pixelsPerVU, [pixelsPerVU]);

  // Memoize render function for each counter
  const renderBar = useCallback((counter: TokenCounter, index: number) => {
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
  }, [counterDisplay, position, gap, baseBarHeight, pixelsPerVU, tokenWidth]);

  return <>{counters.map((c, i) => renderBar(c, i))}</>;
}, (prevProps, nextProps) => {
  // Custom comparison for memo
  return (
    prevProps.counters === nextProps.counters &&
    prevProps.counterDisplay === nextProps.counterDisplay &&
    prevProps.tokenWidth === nextProps.tokenWidth &&
    prevProps.tokenHeight === nextProps.tokenHeight &&
    prevProps.pixelsPerVU === nextProps.pixelsPerVU &&
    prevProps.isGM === nextProps.isGM &&
    prevProps.tokenId === nextProps.tokenId
  );
});

TokenCountersDisplay.displayName = 'PinnedTokenCountersDisplay';

// Pinned Counter Renderer Component
interface PinnedCounterRendererProps {
  obj: TableObject;
  pixelsPerVU: number;
  isGM: boolean;
  activePlayerId: string;
  draggingId: string | null;
  onContextMenu: (e: React.MouseEvent, obj: TableObject) => void;
  onMouseDown: (e: React.MouseEvent, objId: string) => void;
  dispatch: React.Dispatch<any>;
}

const PinnedCounterRenderer = memo(({
  obj,
  pixelsPerVU,
  isGM,
  activePlayerId,
  draggingId,
  onContextMenu,
  onMouseDown,
  dispatch,
}: PinnedCounterRendererProps) => {
  const counter = obj as Counter;
  const pinnedPosition = (obj as any).pinnedScreenPosition;

  if (!pinnedPosition) return null;

  const isOwner = !(obj as any).ownerId || (obj as any).ownerId === activePlayerId || isGM;
  const canDrag = !obj.locked;
  const isDragging = draggingId === obj.id;

  const counterWidth = Math.max(counter.width || 60, 100) / pixelsPerVU;
  const counterHeight = 50 / pixelsPerVU;

  // Memoize button configurations
  const buttonConfigs = useMemo(() => {
    return {
      delete: {
        key: 'delete',
        action: () => dispatch({ type: 'DELETE_OBJECT', payload: { id: obj.id } }),
        className: 'bg-red-600 hover:bg-red-500',
        title: 'Delete',
        icon: <Trash2 size={14} />
      },
      clone: {
        key: 'clone',
        action: () => dispatch({ type: 'CLONE_OBJECT', payload: { id: obj.id } }),
        className: 'bg-cyan-600 hover:bg-cyan-500',
        title: 'Clone',
        icon: <Copy size={14} />
      },
      lock: {
        key: 'lock',
        action: () => dispatch({ type: 'TOGGLE_LOCK', payload: { id: obj.id } }),
        className: 'bg-yellow-600 hover:bg-yellow-500',
        title: obj.locked ? 'Unlock' : 'Lock',
        icon: obj.locked ? <Unlock size={14} /> : <Lock size={14} />
      },
      pin: {
        key: 'pin',
        action: () => {
          const isPinned = (obj as any).isPinnedToViewport;
          if (isPinned) {
            const pinnedPos = (obj as any).pinnedScreenPosition;
            if (pinnedPos) {
              const { offset, zoom, scroll } = { offset: { x: 0, y: 0 }, zoom: 1, scroll: { x: 0, y: 0 } };
              const worldX = (pinnedPos.x * zoom - offset.x + scroll.x) / (pixelsPerVU * zoom);
              const worldY = (pinnedPos.y * zoom - offset.y + scroll.y) / (pixelsPerVU * zoom);
              dispatch({ type: 'UNPIN_FROM_VIEWPORT', payload: { id: obj.id, worldX, worldY } });
            }
          }
        },
        className: 'bg-pink-600 hover:bg-pink-500',
        title: 'Unpin',
        icon: <Pin size={14} />
      },
    };
  }, [obj, dispatch, pixelsPerVU]);

  const actionButtons = useMemo(() => {
    const buttons = (obj.actionButtons || [])
      .map(action => buttonConfigs[action])
      .filter(Boolean)
      .slice(0, 4);

    return buttons.map(btn => (
      <button
        key={btn.key}
        onClick={(e) => { e.stopPropagation(); btn.action(); }}
        className={`pointer-events-auto p-2 rounded-lg text-white shadow ${btn.className}`}
        title={btn.title}
      >
        {btn.icon}
      </button>
    ));
  }, [obj.actionButtons, buttonConfigs]);

  return (
    <div
      data-object-id={obj.id}
      className="absolute bg-slate-900 border-2 border-slate-600 shadow-xl flex items-center justify-between p-2 gap-2 text-white select-none group"
      style={{
        left: pinnedPosition.x,
        top: pinnedPosition.y,
        width: counterWidth * pixelsPerVU,
        height: counterHeight * pixelsPerVU,
        pointerEvents: 'auto',
        transform: `rotate(${obj.rotation || 0}deg)`,
        borderRadius: '5px',
        overflow: 'visible',
      }}
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) {
          return;
        }
        if (isOwner) onMouseDown(e, obj.id);
      }}
      onContextMenu={(e) => onContextMenu(e, obj)}
    >
      <button
        className="p-1 hover:bg-slate-700 rounded"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => dispatch({ type: 'UPDATE_COUNTER', payload: { id: obj.id, delta: -1 } })}
      >
        <Minus size={14} />
      </button>
      <span className="text-xl font-bold">{counter.value}</span>
      <button
        className="p-1 hover:bg-slate-700 rounded"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => dispatch({ type: 'UPDATE_COUNTER', payload: { id: obj.id, delta: 1 } })}
      >
        <Plus size={14} />
      </button>

      <PinnedIndicator />

      {/* Action buttons */}
      <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 transition-opacity z-20 opacity-0 group-hover:opacity-100 pointer-events-auto">
        {actionButtons}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.obj === nextProps.obj &&
    prevProps.pixelsPerVU === nextProps.pixelsPerVU &&
    prevProps.isGM === nextProps.isGM &&
    prevProps.activePlayerId === nextProps.activePlayerId &&
    prevProps.draggingId === nextProps.draggingId
  );
});

PinnedCounterRenderer.displayName = 'PinnedCounterRenderer';

// Pinned Dice Renderer Component
interface PinnedDiceRendererProps {
  obj: TableObject;
  pixelsPerVU: number;
  isGM: boolean;
  activePlayerId: string;
  draggingId: string | null;
  onContextMenu: (e: React.MouseEvent, obj: TableObject) => void;
  onMouseDown: (e: React.MouseEvent, objId: string) => void;
  onDoubleClick?: (e: React.MouseEvent, obj: TableObject) => void;
  dispatch: React.Dispatch<any>;
}

const PinnedDiceRenderer = memo(({
  obj,
  pixelsPerVU,
  isGM,
  activePlayerId,
  draggingId,
  onContextMenu,
  onMouseDown,
  onDoubleClick,
  dispatch,
}: PinnedDiceRendererProps) => {
  const dice = obj as DiceObject;
  const pinnedPosition = (obj as any).pinnedScreenPosition;

  if (!pinnedPosition) return null;

  const isOwner = !(obj as any).ownerId || (obj as any).ownerId === activePlayerId || isGM;
  const canDrag = !obj.locked;
  const isDragging = draggingId === obj.id;

  const diceWidth = dice.width * pixelsPerVU;
  const diceHeight = dice.height * pixelsPerVU;

  const valueFontSize = 25 * pixelsPerVU;
  const sidesFontSize = 15 * pixelsPerVU;

  const diceColor = obj.color || '#6366f1';
  const fontColor = (obj as any).fontColor || 'white';

  // Memoize button configurations
  const buttonConfigs = useMemo(() => {
    return {
      roll: {
        key: 'roll',
        action: () => dispatch({ type: 'ROLL_PHYSICAL_DICE', payload: { id: obj.id, rollGroup: false } }),
        className: 'bg-purple-600 hover:bg-purple-500',
        title: 'Roll',
        icon: <RefreshCw size={14} />
      },
      rotate: {
        key: 'rotate',
        action: () => dispatch({ type: 'ROTATE_OBJECT', payload: { id: obj.id } }),
        className: 'bg-green-600 hover:bg-green-500',
        title: 'Rotate',
        icon: <RefreshCw size={14} />
      },
      delete: {
        key: 'delete',
        action: () => dispatch({ type: 'DELETE_OBJECT', payload: { id: obj.id } }),
        className: 'bg-red-600 hover:bg-red-500',
        title: 'Delete',
        icon: <Trash2 size={14} />
      },
      clone: {
        key: 'clone',
        action: () => dispatch({ type: 'CLONE_OBJECT', payload: { id: obj.id } }),
        className: 'bg-cyan-600 hover:bg-cyan-500',
        title: 'Clone',
        icon: <Copy size={14} />
      },
      lock: {
        key: 'lock',
        action: () => dispatch({ type: 'TOGGLE_LOCK', payload: { id: obj.id } }),
        className: 'bg-yellow-600 hover:bg-yellow-500',
        title: obj.locked ? 'Unlock' : 'Lock',
        icon: obj.locked ? <Unlock size={14} /> : <Lock size={14} />
      },
      pin: {
        key: 'pin',
        action: () => {
          const isPinned = (obj as any).isPinnedToViewport;
          if (isPinned) {
            const pinnedPos = (obj as any).pinnedScreenPosition;
            if (pinnedPos) {
              const { offset, zoom, scroll } = { offset: { x: 0, y: 0 }, zoom: 1, scroll: { x: 0, y: 0 } };
              const worldX = (pinnedPos.x * zoom - offset.x + scroll.x) / (pixelsPerVU * zoom);
              const worldY = (pinnedPos.y * zoom - offset.y + scroll.y) / (pixelsPerVU * zoom);
              dispatch({ type: 'UNPIN_FROM_VIEWPORT', payload: { id: obj.id, worldX, worldY } });
            }
          }
        },
        className: 'bg-pink-600 hover:bg-pink-500',
        title: 'Unpin',
        icon: <Pin size={14} />
      },
    };
  }, [obj, dispatch, pixelsPerVU]);

  const actionButtons = useMemo(() => {
    const buttons = (obj.actionButtons || [])
      .map(action => buttonConfigs[action])
      .filter(Boolean)
      .slice(0, 4);

    return buttons.map(btn => (
      <button
        key={btn.key}
        onClick={(e) => { e.stopPropagation(); btn.action(); }}
        className={`pointer-events-auto p-2 rounded-lg text-white shadow ${btn.className}`}
        title={btn.title}
      >
        {btn.icon}
      </button>
    ));
  }, [obj.actionButtons, buttonConfigs]);

  return (
    <div
      data-object-id={obj.id}
      className="absolute flex items-center justify-center text-white font-bold select-none group"
      style={{
        left: pinnedPosition.x,
        top: pinnedPosition.y,
        width: diceWidth,
        height: diceHeight,
        pointerEvents: 'auto',
        transform: `rotate(${obj.rotation || 0}deg)`,
        overflow: 'visible',
      }}
      onMouseDown={(e) => isOwner && onMouseDown(e, obj.id)}
      onDoubleClick={(e) => isOwner && onDoubleClick?.(e, obj)}
      onContextMenu={(e) => onContextMenu(e, obj)}
    >
      <SvgTokenShape
        shape={dice.shape}
        width={diceWidth}
        height={diceHeight}
        color={diceColor}
        content={undefined}
        rotation={0}
        borderWidth={obj.borderWidth ?? 2}
        borderColor={(obj as any).borderColor || 'white'}
        opacity={obj.opacity ?? 100}
        borderOpacity={obj.borderOpacity ?? 100}
        showThickness={true}
        tokenName={undefined}
        fontColor={fontColor}
      >
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.1em',
        }}>
          <span
            className="fallback-number"
            style={{
              fontSize: `${valueFontSize}px`,
              fontWeight: 'bold',
              color: fontColor,
              lineHeight: 1,
            }}
          >
            {dice.currentValue ?? 1}
          </span>
          <span style={{
            fontSize: `${sidesFontSize}px`,
            fontWeight: 'normal',
            color: fontColor,
            lineHeight: 1,
          }}>
            d{dice.sides ?? 6}
          </span>
        </div>
      </SvgTokenShape>

      <PinnedIndicator />

      {/* Action buttons */}
      <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 transition-opacity z-20 opacity-0 group-hover:opacity-100 pointer-events-auto">
        {actionButtons}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.obj === nextProps.obj &&
    prevProps.pixelsPerVU === nextProps.pixelsPerVU &&
    prevProps.isGM === nextProps.isGM &&
    prevProps.activePlayerId === nextProps.activePlayerId &&
    prevProps.draggingId === nextProps.draggingId
  );
});

PinnedDiceRenderer.displayName = 'PinnedDiceRenderer';

// Pinned Token Renderer Component
interface PinnedTokenRendererProps {
  obj: TableObject;
  allObjects: Record<string, TableObject>;
  pixelsPerVU: number;
  isGM: boolean;
  activePlayerId: string;
  draggingId: string | null;
  viewTransform: { offset: { x: number; y: number }; zoom: number; scroll: { x: number; y: number } };
  onContextMenu: (e: React.MouseEvent, obj: TableObject) => void;
  onMouseDown: (e: React.MouseEvent, objId: string) => void;
  dispatch: React.Dispatch<any>;
}

const PinnedTokenRenderer = memo(({
  obj,
  allObjects,
  pixelsPerVU,
  isGM,
  activePlayerId,
  draggingId,
  viewTransform,
  onContextMenu,
  onMouseDown,
  dispatch,
}: PinnedTokenRendererProps) => {
  // Use memoized hook to get token with applied state
  const token = useTokenWithState(obj as TokenType, allObjects);
  const pinnedPosition = (obj as any).pinnedScreenPosition;

  if (!pinnedPosition) return null;

  const isOwner = !(obj as any).ownerId || (obj as any).ownerId === activePlayerId || isGM;
  const canDrag = !obj.locked;
  const isDragging = draggingId === obj.id;

  // Memoize counters
  const counters = useMemo(() => {
    return (obj as any).counters || [];
  }, [obj]);

  const counterDisplay = useMemo(() => {
    return (obj as any).counterDisplay;
  }, [obj]);

  // Memoize button configurations (same as TokenRenderer)
  const buttonConfigs = useMemo(() => {
    return {
      flip: {
        key: 'flip',
        action: () => dispatch({ type: 'FLIP_CARD', payload: { cardId: obj.id } }),
        className: 'bg-purple-600 hover:bg-purple-500',
        title: 'Flip',
        icon: <RefreshCw size={14} />
      },
      rotate: {
        key: 'rotate',
        action: () => dispatch({ type: 'ROTATE_OBJECT', payload: { id: obj.id } }),
        className: 'bg-green-600 hover:bg-green-500',
        title: 'Rotate',
        icon: <RefreshCw size={14} />
      },
      delete: {
        key: 'delete',
        action: () => dispatch({ type: 'DELETE_OBJECT', payload: { id: obj.id } }),
        className: 'bg-red-600 hover:bg-red-500',
        title: 'Delete',
        icon: <Trash2 size={14} />
      },
      clone: {
        key: 'clone',
        action: () => dispatch({ type: 'CLONE_OBJECT', payload: { id: obj.id } }),
        className: 'bg-cyan-600 hover:bg-cyan-500',
        title: 'Clone',
        icon: <Copy size={14} />
      },
      lock: {
        key: 'lock',
        action: () => dispatch({ type: 'TOGGLE_LOCK', payload: { id: obj.id } }),
        className: 'bg-yellow-600 hover:bg-yellow-500',
        title: obj.locked ? 'Unlock' : 'Lock',
        icon: obj.locked ? <Unlock size={14} /> : <Lock size={14} />
      },
      pin: {
        key: 'pin',
        action: () => {
          const isPinned = (obj as any).isPinnedToViewport;
          if (isPinned) {
            const pinnedPos = (obj as any).pinnedScreenPosition;
            if (pinnedPos) {
              const { offset, zoom, scroll } = viewTransform;
              const worldX = (pinnedPos.x * zoom - offset.x + scroll.x) / (pixelsPerVU * zoom);
              const worldY = (pinnedPos.y * zoom - offset.y + scroll.y) / (pixelsPerVU * zoom);
              dispatch({ type: 'UNPIN_FROM_VIEWPORT', payload: { id: obj.id, worldX, worldY } });
            }
          }
        },
        className: 'bg-pink-600 hover:bg-pink-500',
        title: 'Unpin',
        icon: <Pin size={14} />
      },
    };
  }, [obj, dispatch, viewTransform, pixelsPerVU]);

  // Memoize rendered buttons
  const actionButtons = useMemo(() => {
    const buttons = (obj.actionButtons || [])
      .map(action => buttonConfigs[action])
      .filter(Boolean)
      .slice(0, 4);

    return buttons.map(btn => (
      <button
        key={btn.key}
        onClick={(e) => { e.stopPropagation(); btn.action(); }}
        className={`pointer-events-auto p-2 rounded-lg text-white shadow ${btn.className}`}
        title={btn.title}
      >
        {btn.icon}
      </button>
    ));
  }, [obj.actionButtons, buttonConfigs]);

  return (
    <div
      data-object-id={obj.id}
      className="absolute flex items-center justify-center text-white font-bold select-none group"
      style={{
        left: pinnedPosition.x,
        top: pinnedPosition.y,
        width: token.width * pixelsPerVU,
        height: token.height * pixelsPerVU,
        pointerEvents: 'auto',
        transform: `rotate(${obj.rotation || 0}deg)`,
        overflow: 'visible',
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
        counters={counters}
        counterDisplay={counterDisplay}
        tokenWidth={token.width * pixelsPerVU}
        tokenHeight={token.height * pixelsPerVU}
        pixelsPerVU={pixelsPerVU}
        isGM={isGM}
        tokenId={obj.id}
        dispatch={dispatch}
      />

      {/* Action buttons */}
      <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 transition-opacity z-20 opacity-0 group-hover:opacity-100 pointer-events-auto">
        {actionButtons}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.obj === nextProps.obj &&
    prevProps.allObjects === nextProps.allObjects &&
    prevProps.draggingId === nextProps.draggingId &&
    prevProps.isGM === nextProps.isGM &&
    prevProps.activePlayerId === nextProps.activePlayerId
  );
});

PinnedTokenRenderer.displayName = 'PinnedTokenRenderer';

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
  // Filter out the object currently being dragged to prevent visual duplication
  // When a pinned object is being dragged, it's temporarily unpinned and rendered
  // in GameObjectsRenderer instead. Excluding it here prevents it from showing
  // in both places simultaneously, which causes the "clipping" effect.
  const pinnedObjectsToRender = pinnedGameObjects.filter(obj => obj.id !== draggingId);

  const renderPinnedToken = (obj: TableObject) => {
    return (
      <PinnedTokenRenderer
        obj={obj}
        allObjects={state.objects}
        pixelsPerVU={pixelsPerVU}
        isGM={isGM}
        activePlayerId={activePlayerId}
        draggingId={draggingId}
        viewTransform={state.viewTransform}
        onContextMenu={onContextMenu}
        onMouseDown={onMouseDown}
        dispatch={dispatch}
      />
    );
  };

  const renderPinnedEffect = (obj: TableObject) => {
    const pinnedPosition = (obj as any).pinnedScreenPosition;
    if (!pinnedPosition) return null;

    return (
      <div
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
          obj={obj}
          pixelsPerVU={pixelsPerVU}
          isGM={isGM}
          dispatch={dispatch}
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
    if (obj.type === ItemType.COUNTER) {
      return (
        <PinnedCounterRenderer
          key={obj.id}
          obj={obj}
          pixelsPerVU={pixelsPerVU}
          isGM={isGM}
          activePlayerId={activePlayerId}
          draggingId={draggingId}
          onContextMenu={onContextMenu}
          onMouseDown={onMouseDown}
          dispatch={dispatch}
        />
      );
    }
    if (obj.type === ItemType.DICE_OBJECT) {
      return (
        <PinnedDiceRenderer
          key={obj.id}
          obj={obj}
          pixelsPerVU={pixelsPerVU}
          isGM={isGM}
          activePlayerId={activePlayerId}
          draggingId={draggingId}
          onContextMenu={onContextMenu}
          onMouseDown={onMouseDown}
          onDoubleClick={undefined}
          dispatch={dispatch}
        />
      );
    }
    // For other types (CARD, etc.), render a simple placeholder
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
    <div className="fixed inset-0 pointer-events-none z-[600]" style={{ overflow: 'visible' }}>
      {pinnedObjectsToRender.map(obj => (
        <React.Fragment key={obj.id}>
          {renderPinnedGameObject(obj)}
        </React.Fragment>
      ))}
    </div>
  );
});

PinnedGameObjectsRenderer.displayName = 'PinnedGameObjectsRenderer';
