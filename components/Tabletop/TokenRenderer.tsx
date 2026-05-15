import React, { memo, useMemo } from 'react';
import { SvgTokenShape } from '../SvgTokenShape';
import { PinnedIndicator } from '../PinnedIndicator';
import { Layers, Lock, Unlock, RefreshCw, Trash2, Copy, ArrowUp, ArrowDown, ChevronsUp, ChevronsDown, Eye, EyeOff, Pin, RotateCw, SkipForward, SkipBack, Rewind } from 'lucide-react';
import { TableObject, Token as TokenType, ItemType, TokenCounter, TokenCounterDisplay } from '../../types';
import { useTokenWithState } from '../../hooks/useTokenWithState';
import { Tooltip } from '../Tooltip';
import { TokenCountersDisplay } from './TokenCountersDisplay';

interface TokenRendererProps {
  obj: TableObject;
  allObjects: Record<string, TableObject>;
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
  isCtrlPressed: boolean;
  isGM: boolean;
  activePlayerId: string;
  pixelsPerVU: number;
  viewTransform: { offset: { x: number; y: number }; zoom: number; scroll: { x: number; y: number } };
  onContextMenu: (e: React.MouseEvent, obj: TableObject) => void;
  onMouseDown: (e: React.MouseEvent, objId: string) => void;
  dispatch: React.Dispatch<any>;
}

export const TokenRenderer = memo(({
  obj,
  allObjects,
  globalZIndex,
  v2p,
  createPositionedStyle,
  getLayerInverseScale,
  draggingId,
  currentTool,
  isCtrlPressed,
  isGM,
  activePlayerId,
  pixelsPerVU,
  viewTransform,
  onContextMenu,
  onMouseDown,
  dispatch,
}: TokenRendererProps) => {
  // Use memoized hook to get token with applied state
  const token = useTokenWithState(obj as TokenType, allObjects);

  const isOwner = !(obj as any).ownerId || (obj as any).ownerId === activePlayerId || isGM;
  const canDrag = !obj.locked;
  const isDragging = draggingId === obj.id;
  const objLayer = obj.hyperscaleLayerId || 'none';

  // Memoize cursor class
  const cursorClass = useMemo(() => {
    if (currentTool !== 'none' && currentTool !== 'zoom') return 'cursor-default';
    if (isDragging) return 'cursor-grabbing z-[100000]';
    if (canDrag) return 'cursor-grab';
    return 'cursor-default';
  }, [currentTool, isDragging, canDrag]);

  // Memoize position style
  const positionStyle = useMemo(() => {
    const inverseScale = getLayerInverseScale(objLayer);
    const transform = `rotate(${obj.rotation}deg)${inverseScale !== 1 ? ` scale(${inverseScale})` : ''}`;
    return createPositionedStyle(
      v2p(obj.x),
      v2p(obj.y),
      v2p(token.width),
      v2p(token.height),
      globalZIndex,
      objLayer,
      {
        transform,
        overflow: 'visible',
        // Optimize for smooth dragging
        willChange: isDragging ? 'transform, left, top' : undefined,
      }
    );
  }, [obj.x, obj.y, obj.rotation, token.width, token.height, globalZIndex, objLayer, v2p, createPositionedStyle, getLayerInverseScale, isDragging]);

  // Memoize token name display
  const tokenName = useMemo(() => {
    return (token as any).showNameOnToken ||
           (obj as any).showName ||
           ((obj as any).archetypeId && (allObjects[(obj as any).archetypeId] as any)?.showName)
      ? obj.name
      : undefined;
  }, [token, obj, allObjects]);

  // Memoize counters from object or archetype
  const counters = useMemo(() => {
    return (obj as any).counters ||
           ((obj as any).archetypeId && (allObjects[(obj as any).archetypeId] as any)?.counters) ||
           [];
  }, [obj, allObjects]);

  const counterDisplay = useMemo(() => {
    return (obj as any).counterDisplay ||
           ((obj as any).archetypeId && (allObjects[(obj as any).archetypeId] as any)?.counterDisplay);
  }, [obj, allObjects]);

  // Memoize action buttons visibility class
  const actionButtonsClass = useMemo(() => {
    const baseClass = 'absolute -bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 transition-opacity z-20';
    if (isCtrlPressed) return `${baseClass} opacity-0 pointer-events-none`;
    if (currentTool === 'zoom') return `${baseClass} opacity-100 pointer-events-auto`;
    if (currentTool === 'none') return `${baseClass} opacity-0 group-hover:opacity-100 pointer-events-none`;
    return `${baseClass} opacity-100 pointer-events-auto`;
  }, [isCtrlPressed, currentTool]);

  // Memoize button configurations
  const buttonConfigs = useMemo(() => {
    const rotationStep = (obj as any).rotationStep || 45;

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
      layer: {
        key: 'layer',
        action: () => dispatch({ type: 'MOVE_LAYER_UP', payload: { id: obj.id } }),
        className: 'bg-indigo-600 hover:bg-indigo-500',
        title: 'Layer Up',
        icon: <ArrowUp size={14} />
      },
      layerUp: {
        key: 'layerUp',
        action: () => dispatch({ type: 'MOVE_LAYER_UP', payload: { id: obj.id } }),
        className: 'bg-blue-600 hover:bg-blue-500',
        title: 'Layer Up',
        icon: <ChevronsUp size={14} />
      },
      layerDown: {
        key: 'layerDown',
        action: () => dispatch({ type: 'MOVE_LAYER_DOWN', payload: { id: obj.id } }),
        className: 'bg-blue-600 hover:bg-blue-500',
        title: 'Layer Down',
        icon: <ChevronsDown size={14} />
      },
      bringToFront: {
        key: 'bringToFront',
        action: () => dispatch({ type: 'BRING_TO_FRONT', payload: { id: obj.id } }),
        className: 'bg-indigo-600 hover:bg-indigo-500',
        title: 'To Top',
        icon: <ChevronsUp size={14} />
      },
      sendToBack: {
        key: 'sendToBack',
        action: () => dispatch({ type: 'SEND_TO_BACK', payload: { id: obj.id } }),
        className: 'bg-indigo-600 hover:bg-indigo-500',
        title: 'To Bottom',
        icon: <ChevronsDown size={14} />
      },
      rotateClockwise: {
        key: 'rotateClockwise',
        action: () => {
          dispatch({ type: 'UPDATE_OBJECT', payload: { id: obj.id, updates: { rotation: ((obj as any).rotation || 0) + rotationStep } } });
        },
        className: 'bg-yellow-600 hover:bg-yellow-500',
        title: 'Rotate CW',
        icon: <RotateCw size={14} />
      },
      rotateCounterClockwise: {
        key: 'rotateCounterClockwise',
        action: () => {
          dispatch({ type: 'UPDATE_OBJECT', payload: { id: obj.id, updates: { rotation: ((obj as any).rotation || 0) - rotationStep } } });
        },
        className: 'bg-yellow-600 hover:bg-yellow-500',
        title: 'Rotate CCW',
        icon: <RotateCw size={14} style={{ transform: 'scaleX(-1)' }} />
      },
      swingClockwise: {
        key: 'swingClockwise',
        action: () => dispatch({ type: 'SWING_CLOCKWISE', payload: { id: obj.id } }),
        className: 'bg-orange-600 hover:bg-orange-500',
        title: 'Swing CW',
        icon: <RefreshCw size={14} />
      },
      swingCounterClockwise: {
        key: 'swingCounterClockwise',
        action: () => dispatch({ type: 'SWING_COUNTER_CLOCKWISE', payload: { id: obj.id } }),
        className: 'bg-orange-600 hover:bg-orange-500',
        title: 'Swing CCW',
        icon: <RefreshCw size={14} style={{ transform: 'scaleX(-1)' }} />
      },
      hide: {
        key: 'hide',
        action: () => dispatch({ type: 'UPDATE_OBJECT', payload: { id: obj.id, isOnTable: !(obj as any).isOnTable } }),
        className: 'bg-gray-600 hover:bg-gray-500',
        title: (obj as any).isOnTable === false ? 'Show' : 'Hide',
        icon: (obj as any).isOnTable === false ? <Eye size={14} /> : <EyeOff size={14} />
      },
      show: {
        key: 'show',
        action: () => dispatch({ type: 'UPDATE_OBJECT', payload: { id: obj.id, isOnTable: true } }),
        className: 'bg-gray-600 hover:bg-gray-500',
        title: 'Show',
        icon: <Eye size={14} />
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
          } else {
            const { offset, zoom, scroll } = viewTransform;
            const screenX = obj.x * pixelsPerVU + (offset.x - scroll.x) / zoom;
            const screenY = obj.y * pixelsPerVU + (offset.y - scroll.y) / zoom;
            dispatch({ type: 'PIN_TO_VIEWPORT', payload: { id: obj.id, screenX, screenY } });
          }
        },
        className: 'bg-pink-600 hover:bg-pink-500',
        title: (obj as any).isPinnedToViewport ? 'Unpin' : 'Pin',
        icon: <Pin size={14} />
      },
      // Token State actions
      toggleState1: {
        key: 'toggleState1',
        action: () => {
          const tokenObj = obj as any;
          const currentStateId = tokenObj.currentStateId;
          let states: any[] = [];

          if (tokenObj.states && tokenObj.states.length > 0) {
            states = tokenObj.states;
          } else if (tokenObj.archetypeId) {
            const archetype = allObjects[tokenObj.archetypeId];
            if (archetype && archetype.type === ItemType.TOKEN_TYPE) {
              states = archetype.states || [];
            }
          }

          if (states.length > 0) {
            const firstStateId = states[0].id;
            const newCurrentStateId = currentStateId === firstStateId ? undefined : firstStateId;
            dispatch({ type: 'UPDATE_OBJECT', payload: { id: obj.id, updates: { currentStateId: newCurrentStateId } } });
          }
        },
        className: 'bg-violet-600 hover:bg-violet-500',
        title: 'State 1/Default',
        icon: <Rewind size={14} />
      },
      nextState: {
        key: 'nextState',
        action: () => {
          const tokenObj = obj as any;
          const currentStateId = tokenObj.currentStateId;
          let states: any[] = [];

          if (tokenObj.states && tokenObj.states.length > 0) {
            states = tokenObj.states;
          } else if (tokenObj.archetypeId) {
            const archetype = allObjects[tokenObj.archetypeId];
            if (archetype && archetype.type === ItemType.TOKEN_TYPE) {
              states = archetype.states || [];
            }
          }

          if (states.length > 0) {
            const currentIndex = currentStateId ? states.findIndex(s => s.id === currentStateId) : -1;
            const nextIndex = currentIndex + 1;
            const newCurrentStateId = nextIndex >= states.length ? undefined : states[nextIndex].id;
            dispatch({ type: 'UPDATE_OBJECT', payload: { id: obj.id, updates: { currentStateId: newCurrentStateId } } });
          }
        },
        className: 'bg-violet-600 hover:bg-violet-500',
        title: 'Next State',
        icon: <SkipForward size={14} />
      },
      previousState: {
        key: 'previousState',
        action: () => {
          const tokenObj = obj as any;
          const currentStateId = tokenObj.currentStateId;
          let states: any[] = [];

          if (tokenObj.states && tokenObj.states.length > 0) {
            states = tokenObj.states;
          } else if (tokenObj.archetypeId) {
            const archetype = allObjects[tokenObj.archetypeId];
            if (archetype && archetype.type === ItemType.TOKEN_TYPE) {
              states = archetype.states || [];
            }
          }

          if (states.length > 0) {
            const currentIndex = currentStateId ? states.findIndex(s => s.id === currentStateId) : -1;
            if (currentIndex === -1) {
              dispatch({ type: 'UPDATE_OBJECT', payload: { id: obj.id, updates: { currentStateId: states[states.length - 1].id } } });
            } else if (currentIndex === 0) {
              dispatch({ type: 'UPDATE_OBJECT', payload: { id: obj.id, updates: { currentStateId: undefined } } });
            } else {
              dispatch({ type: 'UPDATE_OBJECT', payload: { id: obj.id, updates: { currentStateId: states[currentIndex - 1].id } } });
            }
          }
        },
        className: 'bg-violet-600 hover:bg-violet-500',
        title: 'Previous State',
        icon: <SkipBack size={14} />
      },
    };
  }, [obj, allObjects, dispatch, viewTransform, pixelsPerVU]);

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
    <Tooltip
      text={obj.tooltipText}
      showImage={obj.showTooltipImage}
      imageSrc={obj.content}
      scale={obj.tooltipScale}
    >
      <div
        data-object-id={obj.id}
        onMouseDown={(e) => isOwner && onMouseDown(e, obj.id)}
        onContextMenu={(e) => onContextMenu(e, obj)}
        className={`absolute flex items-center justify-center text-white font-bold select-none group ${cursorClass}`}
        style={positionStyle}
      >
        <SvgTokenShape
          shape={token.shape}
          width={v2p(token.width)}
          height={v2p(token.height)}
          color={token.color || '#e74c3c'}
          content={token.content}
          rotation={0}
          borderWidth={token.borderWidth ?? 2}
          borderColor={(token as any).borderColor || 'white'}
          opacity={token.opacity ?? 100}
          borderOpacity={(token as any).borderOpacity ?? 100}
          showThickness={true}
          tokenName={tokenName}
          fontColor={(token as any).fontColor || 'white'}
        />

        {/* Token Counters Display */}
        <TokenCountersDisplay
          counters={counters}
          counterDisplay={counterDisplay}
          tokenWidth={v2p(token.width)}
          tokenHeight={v2p(token.height)}
          pixelsPerVU={pixelsPerVU}
          isGM={isGM}
          tokenId={obj.id}
          dispatch={dispatch}
        />

        {(obj as any).isPinnedToViewport && !isDragging && <PinnedIndicator />}

        {/* Action buttons */}
        <div className={actionButtonsClass}>
          {actionButtons}
        </div>
      </div>
    </Tooltip>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for memo
  return (
    prevProps.obj === nextProps.obj &&
    prevProps.allObjects === nextProps.allObjects &&
    prevProps.draggingId === nextProps.draggingId &&
    prevProps.currentTool === nextProps.currentTool &&
    prevProps.isCtrlPressed === nextProps.isCtrlPressed &&
    prevProps.isGM === nextProps.isGM &&
    prevProps.activePlayerId === nextProps.activePlayerId
  );
});

TokenRenderer.displayName = 'TokenRenderer';
