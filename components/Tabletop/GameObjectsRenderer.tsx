import React, { memo, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Card } from '../Card';
import { SvgTokenShape } from '../SvgTokenShape';
import { BoardWithResizeMemo } from './BoardWithResize';
import { NexusBoardMemo } from '../NexusBoard';
import { EffectTemplateRendererMemo } from '../EffectTemplateRenderer';
import { Tooltip } from '../Tooltip';
import { PinnedIndicator } from '../PinnedIndicator';
import { Layers, Lock, Unlock, RefreshCw, Trash2, Copy, Plus, Minus, Users, ArrowUp, ArrowDown, ChevronsUp, ChevronsDown, Hand, Eye, EyeOff, Undo, Pin, RotateCw, SkipForward, SkipBack, Rewind } from 'lucide-react';
import { TableObject, Card as CardType, Token as TokenType, Board as BoardType, NexusBoard, NexusCellObject, Counter, DiceObject, EffectTemplate, ItemType, GridType, TokenSlider, TokenSliderPosition, TokenSliderDisplay, TokenShape } from '../../types';
import { TabletopRenderContext, ObjectRenderProps } from './types';
import { useTokenWithState } from '../../hooks/useTokenWithState';
import { TokenCountersDisplay } from './TokenCountersDisplay';
import { TokenRenderer } from './TokenRenderer';
import { CardRenderer } from './CardRenderer';
import { getGlobalCacheVersion } from '../SvgTokenShape';

interface GameObjectsRendererProps {
  visibleTableObjects: TableObject[];
  context: TabletopRenderContext;
  state: any;
  hyperscaleLayers: any[];
  selectedHyperscaleLayerIds: string[];
  draggingId: string | null;
  resizingId: string | null;
  currentTool: string;
  isCtrlPressed: boolean;
  isGM: boolean;
  activePlayerId: string;
  liveResizeSizeRef: React.RefObject<{ width: number; height: number } | null>;
  livePreviewSize: { width: number; height: number } | null; // Local preview state for smooth visual feedback
  nexusBoardAddingCell: string | null;
  onContextMenu: (e: React.MouseEvent, obj: TableObject) => void;
  onMouseDown: (e: React.MouseEvent, objId: string) => void;
  onDoubleClick?: (e: React.MouseEvent, obj: TableObject) => void;
  onResizeStart?: (e: React.MouseEvent, objId: string) => void;
  onAddNexusCell?: (objId: string, direction: string) => void;
  dispatch: React.Dispatch<any>;
}

export const GameObjectsRenderer = memo((props: GameObjectsRendererProps) => {
  const {
    visibleTableObjects,
    context,
    state,
    hyperscaleLayers,
    selectedHyperscaleLayerIds,
    draggingId,
    resizingId,
    currentTool,
    isCtrlPressed,
    isGM,
    activePlayerId,
    liveResizeSizeRef,
    livePreviewSize,
    nexusBoardAddingCell,
    onContextMenu,
    onMouseDown,
    onDoubleClick,
    onResizeStart,
    onAddNexusCell,
    dispatch
  } = props;

  const { v2p, createPositionedStyle, getLayerZoomScale, getLayerInverseScale, pixelsPerVU, basePixelsPerVU } = context;

  // Calculate zoom multiplier for UI elements compensation
  const zoomMultiplier = pixelsPerVU / basePixelsPerVU;

  // Memoize effect props to prevent unnecessary re-renders of EffectTemplateRendererMemo
  // Create stable callback references for each effect
  const effectHandlersMap = React.useMemo(() => {
    const map = new Map<string, {
      onMouseDown: (e: React.MouseEvent) => void;
      onContextMenu: (e: React.MouseEvent) => void;
    }>();

    // Only create handlers for effects currently in visibleTableObjects
    const effects = visibleTableObjects.filter(obj => obj.type === ItemType.EFFECT_TEMPLATE);

    effects.forEach(obj => {
      if (!map.has(obj.id)) {
        const canDrag = !obj.locked; // 🔥 FIX: Only check locked, not ownership

        map.set(obj.id, {
          onMouseDown: (e: React.MouseEvent) => canDrag && onMouseDown(e, obj.id),
          onContextMenu: (e: React.MouseEvent) => onContextMenu(e, obj),
        });
      }
    });

    return map;
  }, [visibleTableObjects, onMouseDown, onContextMenu]);

  // Memoize style and className for effects to prevent unnecessary re-renders
  const effectStyleMap = React.useMemo(() => {
    const map = new Map<string, {
      style: React.CSSProperties;
      className: string;
      isDragging: boolean;
    }>();

    const effects = visibleTableObjects.filter(obj => obj.type === ItemType.EFFECT_TEMPLATE);

    effects.forEach(obj => {
      const canDrag = !obj.locked && (!obj.isDragging || obj.dragOwnerId === activePlayerId);
      const isDraggingEffect = draggingId === obj.id;
      const draggingClass = isDraggingEffect ? 'cursor-grabbing z-[100000]' : (canDrag ? 'cursor-grab' : 'cursor-default');
      const objLayer = obj.hyperscaleLayerId || 'tokens';

      const hasSelectedLayers = selectedHyperscaleLayerIds.length > 0;
      const isLayerSelected = objLayer === 'none' || selectedHyperscaleLayerIds.includes(objLayer);
      const isPermeable = hasSelectedLayers && !isLayerSelected;

      // For EFFECT_TEMPLATE, don't set pointerEvents in style - the component handles it internally
      // The component uses pointerEvents: 'none' on container and 'fill' on SVG polygon
      const style: React.CSSProperties = isPermeable ? { pointerEvents: 'none' } : {};

      map.set(obj.id, {
        style,
        className: draggingClass,
        isDragging: isDraggingEffect
      });
    });

    return map;
  }, [visibleTableObjects, draggingId, selectedHyperscaleLayerIds]);

  // DEBUG: Check for duplicate DOM elements for effects
  // Use timeout to avoid catching transient React render states during drag operations
  useEffect(() => {
    // First check if there are duplicates in the visibleTableObjects array itself
    const effectIds = visibleTableObjects
      .filter(obj => obj.type === ItemType.EFFECT_TEMPLATE)
      .map(obj => obj.id);

    const idCounts: Record<string, number> = {};
    effectIds.forEach(id => {
      idCounts[id] = (idCounts[id] || 0) + 1;
    });

    const duplicateIds = Object.entries(idCounts).filter(([_, count]) => count > 1);
    if (duplicateIds.length > 0) {
      // Duplicate IDs found
    }

    const timeoutId = setTimeout(() => {
      // Exclude cursor slot effects AND pool panel effects from duplicate check
      const effectElements = Array.from(document.querySelectorAll('[data-object-type="EFFECT_TEMPLATE"]'))
        .filter(el => {
          // Exclude cursor slot effects (have the attribute directly)
          if (el.hasAttribute('data-cursor-slot-effect')) {
            return false;
          }
          // Exclude pool panel effects (inside absolute overflow-hidden container)
          const parent = el.parentElement;
          if (parent && parent.classList.contains('overflow-hidden') &&
              parent.classList.contains('absolute')) {
            // This is likely a pool panel effect
            return false;
          }
          return true;
        });

      const effectIdCounts: Record<string, number> = {};
      const effectElementsById: Record<string, Element[]> = {};

      effectElements.forEach(el => {
        const objectId = el.getAttribute('data-object-id');
        if (objectId) {
          effectIdCounts[objectId] = (effectIdCounts[objectId] || 0) + 1;
          if (!effectElementsById[objectId]) {
            effectElementsById[objectId] = [];
          }
          effectElementsById[objectId].push(el);
        }
      });

      Object.entries(effectIdCounts).forEach(([id, count]) => {
        if (count > 1) {
          // Duplicate DOM elements for effect found
        }
      });
    }, 100); // Wait 100ms for React to stabilize

    return () => clearTimeout(timeoutId);
  }, [visibleTableObjects]);

  // State for explosive dice animation (scale value and phase for each dice)
  const [explosiveScales, setExplosiveScales] = useState<Record<string, number>>({});
  const [explosivePhases, setExplosivePhases] = useState<Record<string, 'phase1' | 'phase2' | 'done'>>({});
  const prevDiceRollRef = useRef<Record<string, number | undefined>>({});
  const animationTimeoutsRef = useRef<Record<string, number>>({});
  const animatingDiceRef = useRef<Set<string>>(new Set());

  // Cleanup effect for explosive dice animations
  useEffect(() => {
    return () => {
      // Clear all pending timeouts on unmount
      Object.values(animationTimeoutsRef.current).forEach(clearTimeout);
      animationTimeoutsRef.current = {};
    };
  }, []);

  // Extract dice objects and their explosive roll values (memoized)
  const diceExplosiveStates = React.useMemo(() => {
    const diceObjects = visibleTableObjects.filter(obj => obj.type === ItemType.DICE_OBJECT) as DiceObject[];
    const states: Record<string, { isExplosive: boolean; rollValue?: number }> = {};
    diceObjects.forEach(dice => {
      states[dice.id] = {
        isExplosive: dice.isExplosive || false,
        rollValue: dice.explosiveRollValue
      };
    });
    return states;
  }, [visibleTableObjects]);

  // Detect new explosive rolls and trigger animations
  useEffect(() => {
    const newAnimations: Array<{ diceId: string }> = [];

    // Check each dice for new explosive roll
    Object.entries(diceExplosiveStates).forEach(([diceId, { isExplosive, rollValue }]) => {
      const prevRoll = prevDiceRollRef.current[diceId];

      // Detect when explosive roll just appeared (undefined -> number)
      if (isExplosive && rollValue !== undefined && prevRoll === undefined && !animatingDiceRef.current.has(diceId)) {
        animatingDiceRef.current.add(diceId);
        newAnimations.push({ diceId });

        // Set initial state
        setExplosiveScales(prev => ({ ...prev, [diceId]: 1 }));
        setExplosivePhases(prev => ({ ...prev, [diceId]: 'phase1' }));
      } else if (!isExplosive || rollValue === undefined) {
        // Reset when not explosive or no explosive roll
        if (!animatingDiceRef.current.has(diceId)) {
          setExplosiveScales(prev => {
            const { [diceId]: _, ...rest } = prev;
            return rest;
          });
          setExplosivePhases(prev => {
            const { [diceId]: _, ...rest } = prev;
            return rest;
          });
        }
      }

      prevDiceRollRef.current[diceId] = rollValue;
    });

    // Run animations for new dice
    newAnimations.forEach(({ diceId }) => {
      // Phase 1: Animate from 1 to 1.3 over 0.3s
      const phase1Timeout = setTimeout(() => {
        setExplosiveScales(prev => ({ ...prev, [diceId]: 1.3 }));
        setExplosivePhases(prev => ({ ...prev, [diceId]: 'phase1' }));
      }, 16); // Small delay to ensure initial state is rendered

      // Phase 2: After 0.3s, animate to 1.1 over 0.2s
      const phase2Timeout = setTimeout(() => {
        setExplosiveScales(prev => ({ ...prev, [diceId]: 1.1 }));
        setExplosivePhases(prev => ({ ...prev, [diceId]: 'phase2' }));

        // Mark animation complete after another 0.2s
        const completeTimeout = setTimeout(() => {
          setExplosivePhases(prev => ({ ...prev, [diceId]: 'done' }));
          animatingDiceRef.current.delete(diceId);
          delete animationTimeoutsRef.current[diceId];
        }, 200);

        animationTimeoutsRef.current[`${diceId}-complete`] = completeTimeout;
      }, 300);

      animationTimeoutsRef.current[diceId] = phase1Timeout;
      animationTimeoutsRef.current[`${diceId}-phase2`] = phase2Timeout;
    });
  }, [diceExplosiveStates]);

  const renderBoard = (obj: TableObject, globalZIndex: number) => {
    const board = obj as BoardType;
    const isResizing = resizingId === obj.id;
    const canResize = !obj.locked;
    const gridSize = v2p(board.gridSize || 50);
    const gridW_px = v2p(board.gridWidth || board.gridSize || 50);
    const gridH_px = v2p(board.gridHeight || board.gridSize || 50);
    // 🔥 FIX: Don't check ownership - all players can interact with shared objects
    const objLayer = obj.hyperscaleLayerId || 'none';
    const layerZoomScale = getLayerZoomScale(objLayer);

    const hasSelectedLayers = selectedHyperscaleLayerIds.length > 0;
    const isLayerSelected = objLayer === 'none' || selectedHyperscaleLayerIds.includes(objLayer);
    const isPermeable = hasSelectedLayers && !isLayerSelected;

    return (
      <Tooltip
        text={undefined}
        showImage={false}
        imageSrc={undefined}
        scale={undefined}
      >
        <div
          className={isPermeable ? '' : 'pointer-events-auto'}
          style={createPositionedStyle(
            v2p(obj.x),
            v2p(obj.y),
            v2p(resizingId === obj.id && liveResizeSizeRef.current ? liveResizeSizeRef.current.width : board.width),
            v2p(resizingId === obj.id && liveResizeSizeRef.current ? liveResizeSizeRef.current.height : board.height),
            globalZIndex,
            objLayer,
            { pointerEvents: isPermeable ? 'none' : 'auto' }
          )}
        >
          <BoardWithResizeMemo
            token={board}
            obj={obj}
            isOwner={true} // 🔥 FIX: All players are "owners" for shared objects
            isResizing={isResizing}
            canResize={canResize}
            zoom={layerZoomScale}
            pixelsPerVU={pixelsPerVU}
            onContextMenu={(e) => onContextMenu(e, obj)}
            onMouseDown={(e) => onMouseDown(e, obj.id)}
            onResizeStart={(e) => canResize && onResizeStart?.(e, obj.id)}
            gridSize={gridSize}
            gridWidth={gridW_px}
            gridHeight={gridH_px}
            showGrid={board.showGrid}
            currentTool={currentTool}
            livePreviewSize={resizingId === obj.id ? livePreviewSize : null}
            cacheVersion={getGlobalCacheVersion()}
          />
        </div>
      </Tooltip>
    );
  };

  const renderNexusBoard = (obj: TableObject, globalZIndex: number) => {
    const nexusBoard = obj as NexusBoard;
    const showAddUI = nexusBoardAddingCell === obj.id;
    const mainCellId = nexusBoard.cells[0]?.id;
    const mainCell = mainCellId ? (state.objects[mainCellId] as NexusCellObject) : null;
    const boardX = mainCell?.x ?? obj.x;
    const boardY = mainCell?.y ?? obj.y;
    const boardWidth = mainCell?.width ?? nexusBoard.cellWidth ?? 100;
    const boardHeight = mainCell?.height ?? nexusBoard.cellHeight ?? 150;
    const canDrag = !obj.locked; // 🔥 FIX: Only check locked, not ownership
    const isDragging = draggingId === obj.id;
    const objLayer = obj.hyperscaleLayerId || 'none';

    return (
      <Tooltip
        text={undefined}
        showImage={false}
        imageSrc={undefined}
        scale={undefined}
      >
        <div
          data-object-id={obj.id}
          className="absolute"
          style={createPositionedStyle(
            v2p(boardX),
            v2p(boardY),
            v2p(boardWidth),
            v2p(boardHeight),
            globalZIndex,
            objLayer,
            {
              transform: `rotate(${obj.rotation || 0}deg)${getLayerInverseScale(objLayer) !== 1 ? ` scale(${getLayerInverseScale(objLayer)})` : ''}`,
              transformOrigin: 'center center',
            }
          )}
        >
          <NexusBoardMemo
            board={nexusBoard}
            isOwner={true} // 🔥 FIX: All players are "owners" for shared objects
            isDragging={isDragging}
            onMouseDown={(e) => canDrag && onMouseDown(e, obj.id)}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onAddCell={(direction) => onAddNexusCell?.(obj.id, direction)}
            showAddUI={showAddUI}
            mainCellWidth={mainCell?.width}
            mainCellHeight={mainCell?.height}
            pixelsPerVU={context.pixelsPerVU}
          />
        </div>
      </Tooltip>
    );
  };

  const renderToken = (obj: TableObject, globalZIndex: number) => {
    return (
      <TokenRenderer
        obj={obj}
        allObjects={state.objects}
        globalZIndex={globalZIndex}
        v2p={v2p}
        createPositionedStyle={createPositionedStyle}
        getLayerInverseScale={getLayerInverseScale}
        draggingId={draggingId}
        currentTool={currentTool}
        isCtrlPressed={isCtrlPressed}
        isGM={isGM}
        activePlayerId={activePlayerId}
        pixelsPerVU={pixelsPerVU}
        basePixelsPerVU={basePixelsPerVU}
        viewTransform={state.viewTransform}
        onContextMenu={onContextMenu}
        onMouseDown={onMouseDown}
        dispatch={dispatch}
      />
    );
  };

  const renderCard = (obj: TableObject, globalZIndex: number) => {
    return (
      <CardRenderer
        key={obj.id}
        obj={obj}
        allObjects={state.objects}
        globalZIndex={globalZIndex}
        v2p={v2p}
        createPositionedStyle={createPositionedStyle}
        getLayerInverseScale={getLayerInverseScale}
        draggingId={draggingId}
        currentTool={currentTool}
        isCtrlPressed={isCtrlPressed}
        isGM={isGM}
        activePlayerId={activePlayerId}
        pixelsPerVU={pixelsPerVU}
        basePixelsPerVU={basePixelsPerVU}
        zoomMultiplier={zoomMultiplier}
        onContextMenu={onContextMenu}
        onMouseDown={onMouseDown}
        dispatch={dispatch}
      />
    );
  };

  const renderCounter = (obj: TableObject, globalZIndex: number) => {
    const counter = obj as Counter;
    const canDrag = !obj.locked; // 🔥 FIX: Only check locked, not ownership
    const draggingClass = draggingId === obj.id ? 'cursor-grabbing z-[100000]' : (canDrag ? 'cursor-grab' : 'cursor-default');
    const objLayer = obj.hyperscaleLayerId || 'none';

    const hasSelectedLayers = selectedHyperscaleLayerIds.length > 0;
    const isLayerSelected = objLayer === 'none' || selectedHyperscaleLayerIds.includes(objLayer);
    const isPermeable = hasSelectedLayers && !isLayerSelected;

    // Counter dimensions in VU (will be converted to pixels by v2p)
    const counterWidth = Math.max(counter.width || 60, 100);
    const counterHeight = 50;

    return (
      <Tooltip
        text={undefined}
        showImage={false}
        imageSrc={undefined}
        scale={undefined}
      >
        <div
          data-object-id={obj.id}
          onMouseDown={(e) => {
            if ((e.target as HTMLElement).closest('button')) {
              return;
            }
            if (canDrag) onMouseDown(e, obj.id);
          }}
          onContextMenu={(e) => onContextMenu(e, obj)}
          className={`absolute bg-slate-900 border-2 border-slate-600 shadow-xl flex items-center justify-between p-2 gap-2 text-white select-none group ${currentTool !== 'none' && currentTool !== 'zoom' ? 'cursor-default' : draggingClass}`}
          style={createPositionedStyle(
            v2p(obj.x),
            v2p(obj.y),
            v2p(counterWidth),
            v2p(counterHeight),
            globalZIndex,
            objLayer,
            {
              transform: `rotate(${obj.rotation || 0}deg)${getLayerInverseScale(objLayer) !== 1 ? ` scale(${getLayerInverseScale(objLayer)})` : ''}`,
              pointerEvents: isPermeable ? 'none' : 'auto',
              borderRadius: '5px',
            }
          )}
        >
          {/* Counter content with scale compensation */}
          <div className="flex items-center justify-between w-full" style={{ transform: 'scale(' + zoomMultiplier + ')' }}>
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
          </div>

          {(obj as any).isPinnedToViewport && draggingId !== obj.id && <PinnedIndicator />}
        </div>
      </Tooltip>
    );
  };

  const renderDice = (obj: TableObject, globalZIndex: number) => {
    const dice = obj as DiceObject;
    const canDrag = !obj.locked; // 🔥 FIX: Only check locked, not ownership
    const isDragging = draggingId === obj.id;
    const draggingClass = isDragging ? 'cursor-grabbing z-[100000]' : (canDrag ? 'cursor-grab' : 'cursor-default');
    const objLayer = obj.hyperscaleLayerId || 'none';

    const hasSelectedLayers = selectedHyperscaleLayerIds.length > 0;
    const isLayerSelected = objLayer === 'none' || selectedHyperscaleLayerIds.includes(objLayer);
    const isPermeable = hasSelectedLayers && !isLayerSelected;

    // Get inverse scale for this layer (to compensate zoom)
    const inverseScale = getLayerInverseScale(objLayer);

    // Detect explosive dice trigger (when explosive roll value exists)
    const isExplosiveTriggered = dice.isExplosive && dice.explosiveRollValue !== undefined;
    const currentScale = explosiveScales[dice.id] ?? (isExplosiveTriggered ? 1.1 : 1);
    const animationPhase = explosivePhases[dice.id] ?? 'done';

    // Calculate transition duration based on animation phase
    // Phase 1: 1 → 1.3 over 0.3s, Phase 2: 1.3 → 1.1 over 0.2s
    const getTransitionDuration = () => {
      if (animationPhase === 'phase1') return '0.3s ease-out';
      if (animationPhase === 'phase2') return '0.2s ease-out';
      return undefined;
    };

    // Calculate position (no adjustment needed since we use transform)
    const diceX = v2p(obj.x);
    const diceY = v2p(obj.y);
    const diceWidth = v2p(obj.width ?? 50);
    const diceHeight = v2p(obj.height ?? 50);

    // Font size based on base VU size converted to pixels
    // Use the same approach as tokens: base size in VU, then convert to pixels
    const valueFontSize = v2p(25); // 25 VU for dice value
    const sidesFontSize = v2p(15); // 15 VU for dice sides

    // Use explosive colors when triggered, otherwise use defaults
    const diceColor = isExplosiveTriggered
      ? (dice.explosiveColor || '#ffff00')
      : ((obj as any).color || '#6366f1');
    const fontColor = isExplosiveTriggered
      ? (dice.explosiveTextColor || '#ff0000')
      : ((obj as any).fontColor || '#ffffff');
    const glowColor = isExplosiveTriggered
      ? (dice.explosiveGlow || '#ff0000')
      : undefined;

    return (
      <Tooltip
        text={undefined}
        showImage={false}
        imageSrc={undefined}
        scale={undefined}
      >
        <div
          data-object-id={obj.id}
          onMouseDown={(e) => canDrag && onMouseDown(e, obj.id)}
          onDoubleClick={(e) => canDrag && onDoubleClick?.(e, obj)}
          onContextMenu={(e) => onContextMenu(e, obj)}
          className={`absolute flex items-center justify-center text-white font-bold select-none group ${currentTool !== 'none' && currentTool !== 'zoom' ? 'cursor-default' : draggingClass}`}
          style={createPositionedStyle(
            diceX,
            diceY,
            diceWidth,
            diceHeight,
            globalZIndex,
            objLayer,
            {
              transform: `rotate(${obj.rotation}deg)${getLayerInverseScale(objLayer) !== 1 ? ` scale(${getLayerInverseScale(objLayer)})` : ''} scale(${currentScale})`,
              pointerEvents: isPermeable ? 'none' : 'auto',
              filter: glowColor ? `drop-shadow(0 0 8px ${glowColor}) drop-shadow(0 0 4px ${glowColor})` : undefined,
              transition: getTransitionDuration(),
              transformOrigin: 'center center',
              overflow: 'visible',
              // Optimize for smooth dragging
              willChange: isDragging ? 'transform, left, top' : undefined,
            }
          )}
        >
          <SvgTokenShape
            shape={(dice.shape ?? TokenShape.SQUARE) as TokenShape}
            width={diceWidth}
            height={diceHeight}
            color={diceColor}
            content={undefined}
            rotation={0}
            borderWidth={(obj as any).borderWidth ?? 2}
            borderColor={(obj as any).borderColor || '#ffffff'}
            opacity={(obj as any).opacity ?? 100}
            borderOpacity={(obj as any).borderOpacity ?? 100}
            showThickness={true}
            tokenName={undefined}
            fontColor={fontColor}
            preserveAspectRatio="xMidYMid meet"
          >
            {(() => {
              // SvgTokenShape adds PADDING (1) + borderWidth around the content
              // We need to position foreignObject at the content area offset
              const PADDING = 1;
              const borderWidth = (obj as any).borderWidth ?? 2;
              const contentOffset = PADDING + borderWidth;
              const svgWidth = diceWidth + borderWidth * 2 + PADDING * 2;
              const svgHeight = diceHeight + borderWidth * 2 + PADDING * 2;

              return (
                <foreignObject
                  x={contentOffset}
                  y={contentOffset}
                  width={diceWidth}
                  height={diceHeight}
                >
                  <div xmlns="http://www.w3.org/1999/xhtml" style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.1em',
                    width: '100%',
                    height: '100%',
                  }}>
                {(() => {
                  const currentValue = dice.currentValue ?? 1;
                  const explosiveRoll = dice.explosiveRollValue;
                  const valueOverride = dice.valueOverrides?.[currentValue];

                  // For explosive dice with explosive roll, show the sum (max sides + explosive roll)
                  if (explosiveRoll !== undefined) {
                    const sum = (dice.sides ?? 6) + explosiveRoll;
                    return (
                      <span
                        className="fallback-number"
                        style={{
                          fontSize: `${valueFontSize}px`,
                          fontWeight: 'bold',
                          color: fontColor,
                          lineHeight: 1,
                        }}
                      >
                        {sum}
                      </span>
                    );
                  }

                  // Show override if available
                  if (valueOverride) {
                    if (valueOverride.type === 'image') {
                      return (
                        <img
                          src={valueOverride.value}
                          alt={`Value ${currentValue}`}
                          style={{
                            width: `${valueFontSize * 1.5}px`,
                            height: `${valueFontSize * 1.5}px`,
                            objectFit: 'contain',
                          }}
                          onError={(e) => {
                            // Fallback to number if image fails to load
                            (e.target as HTMLImageElement).style.display = 'none';
                            ((e.target as HTMLImageElement).parentElement as HTMLElement).querySelector('.fallback-number')?.classList.remove('hidden');
                          }}
                        />
                      );
                    } else if (valueOverride.type === 'emoji' || valueOverride.type === 'icon') {
                      // Both emoji and icon types display text/emoji
                      return (
                        <span style={{
                          fontSize: `${valueFontSize * 1.2}px`,
                          lineHeight: 1,
                        }}>
                          {valueOverride.value}
                        </span>
                      );
                    }
                  }

                  // Default: show number
                  return (
                    <>
                      <span
                        className="fallback-number"
                        style={{
                          fontSize: `${valueFontSize}px`,
                          fontWeight: 'bold',
                          color: fontColor,
                          lineHeight: 1,
                        }}
                      >
                        {currentValue}
                      </span>
                    </>
                  );
                })()}
                    <span style={{
                      fontSize: `${sidesFontSize}px`,
                      fontWeight: 'normal',
                      color: fontColor,
                      lineHeight: 1,
                    }}>
                      d{dice.sides ?? 6}
                    </span>
                  </div>
                </foreignObject>
              );
            })()}
          </SvgTokenShape>

          {(obj as any).isPinnedToViewport && draggingId !== obj.id && <PinnedIndicator />}

          {/* Action buttons - scale to compensate parent's inverseScale */}
          <div
            className="absolute -bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 opacity-0 transition-opacity z-20 pointer-events-none group-hover:opacity-100"
            style={{ transform: `translateX(-50%) scale(${zoomMultiplier})` }}
          >
            {(() => {
              const actionButtons = (obj as any).actionButtons || [];
              const dice = obj as DiceObject;
              const isInGroup = !!dice.diceGroupId;

              const buttonConfigs: Record<string, { key: string; action: () => void; className: string; title: string; icon: React.ReactNode }> = {
                roll: {
                  key: 'roll',
                  action: () => dispatch({ type: 'ROLL_PHYSICAL_DICE', payload: { id: obj.id, rollGroup: false } }),
                  className: 'bg-purple-600 hover:bg-purple-500',
                  title: 'Roll',
                  icon: <RefreshCw size={14} />
                },
                rollGroup: {
                  key: 'rollGroup',
                  action: () => {
                    // Roll all dice in the group
                    if (dice.diceGroupId) {
                      const group = state.diceGroups?.find((g: any) => g.id === dice.diceGroupId);
                      if (group) {
                        group.diceIds.forEach((diceId: string) => {
                          dispatch({ type: 'ROLL_PHYSICAL_DICE', payload: { id: diceId } });
                        });
                      }
                    }
                  },
                  className: 'bg-blue-600 hover:bg-blue-500',
                  title: 'Roll Group',
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
                  icon: obj.locked ? <Lock size={14} /> : <Unlock size={14} />
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
                    const rotationStep = (obj as any).rotationStep || 45;
                    dispatch({ type: 'UPDATE_OBJECT', payload: { id: obj.id, updates: { rotation: ((obj as any).rotation || 0) + rotationStep } } });
                  },
                  className: 'bg-yellow-600 hover:bg-yellow-500',
                  title: 'Rotate CW',
                  icon: <RotateCw size={14} />
                },
                rotateCounterClockwise: {
                  key: 'rotateCounterClockwise',
                  action: () => {
                    const rotationStep = (obj as any).rotationStep || 45;
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
                      // Unpin: calculate world position from pinned screen position
                      const pinnedPos = (obj as any).pinnedScreenPosition;
                      if (pinnedPos) {
                        const { offset, zoom, scroll, pixelsPerVU } = state.viewTransform;
                        const worldX = (pinnedPos.x * zoom - offset.x + scroll.x) / (pixelsPerVU * zoom);
                        const worldY = (pinnedPos.y * zoom - offset.y + scroll.y) / (pixelsPerVU * zoom);
                        dispatch({ type: 'UNPIN_FROM_VIEWPORT', payload: { id: obj.id, worldX, worldY } });
                      }
                    } else {
                      // Pin: calculate screen position from world position
                      const { offset, zoom, scroll, pixelsPerVU } = state.viewTransform;
                      const screenX = obj.x * pixelsPerVU + (offset.x - scroll.x) / zoom;
                      const screenY = obj.y * pixelsPerVU + (offset.y - scroll.y) / zoom;
                      dispatch({ type: 'PIN_TO_VIEWPORT', payload: { id: obj.id, screenX, screenY } });
                    }
                  },
                  className: 'bg-pink-600 hover:bg-pink-500',
                  title: (obj as any).isPinnedToViewport ? 'Unpin' : 'Pin',
                  icon: <Pin size={14} />
                },
              };

              let buttons = actionButtons
                .map(action => buttonConfigs[action])
                .filter(Boolean);

              // Limit to 4 buttons
              buttons = buttons.slice(0, 4);

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
            })()}
          </div>
        </div>
      </Tooltip>
    );
  };

  const renderEffectTemplate = (obj: TableObject, globalZIndex: number) => {
    const handlers = effectHandlersMap.get(obj.id);
    const styleData = effectStyleMap.get(obj.id);

    if (!handlers || !styleData) return null;

    return (
      <EffectTemplateRendererMemo
        obj={obj as EffectTemplate}
        pixelsPerVU={pixelsPerVU}
        isDragging={styleData.isDragging}
        onMouseDown={handlers.onMouseDown}
        onContextMenu={handlers.onContextMenu}
        style={styleData.style}
        className={styleData.className}
        isGM={isGM}
        dispatch={dispatch}
        rulerStep={context.rulerStep}
      />
    );
  };

  const renderGameObject = (obj: TableObject) => {
    const isOwner = !(obj as any).ownerId || (obj as any).ownerId === activePlayerId || isGM;
    const canDrag = !obj.locked;
    const draggingClass = draggingId === obj.id ? 'cursor-grabbing z-[100000]' : (canDrag ? 'cursor-grab' : 'cursor-default');

    const layer = hyperscaleLayers.find(l => l.id === (obj.hyperscaleLayerId || 'tokens'));
    const layerMinZ = layer?.minZIndex ?? 3001;
    const isDragging = draggingId === obj.id;
    const globalZIndex = isDragging ? 999999 : layerMinZ + (obj.zIndex ?? 0);

    if (obj.type === ItemType.BOARD) {
      return renderBoard(obj, globalZIndex);
    }

    if (obj.type === ItemType.NEXUS_BOARD) {
      return renderNexusBoard(obj, globalZIndex);
    }

    if (obj.type === ItemType.TOKEN) {
      return renderToken(obj, globalZIndex);
    }

    if (obj.type === ItemType.CARD) {
      return renderCard(obj, globalZIndex);
    }

    if (obj.type === ItemType.COUNTER) {
      return renderCounter(obj, globalZIndex);
    }

    if (obj.type === ItemType.DICE_OBJECT) {
      return renderDice(obj, globalZIndex);
    }

    if (obj.type === ItemType.EFFECT_TEMPLATE) {
      // 🔥 FIX: Don't render effect templates that are in cursor slot
      // They are rendered by CursorSlotVisualization instead
      if ((obj as any).inCursorSlot === true) {
        return null;
      }
      return renderEffectTemplate(obj, globalZIndex);
    }

    return null;
  };

  return (
    <>
      {visibleTableObjects.map(obj => {
        const element = renderGameObject(obj);
        // Use only obj.id as key - pixelsPerVU changes should trigger re-render via props, not remount
        // This prevents tokens from disappearing during SYNC_STATE when pixelsPerVU fluctuates
        return element ? React.cloneElement(element, { key: obj.id }) : null;
      })}
    </>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for GameObjectsRenderer with deep array check
  const prevObjects = prevProps.visibleTableObjects;
  const nextObjects = nextProps.visibleTableObjects;

  // Quick length check
  if (prevObjects.length !== nextObjects.length) return false;

  // Check if any object changed (by reference - objects are immutable)
  for (let i = 0; i < prevObjects.length; i++) {
    if (prevObjects[i] !== nextObjects[i]) return false;
  }

  // All objects are the same references, check other props
  return (
    prevProps.hyperscaleLayers === nextProps.hyperscaleLayers &&
    prevProps.selectedHyperscaleLayerIds === nextProps.selectedHyperscaleLayerIds &&
    prevProps.draggingId === nextProps.draggingId &&
    prevProps.resizingId === nextProps.resizingId &&
    prevProps.currentTool === nextProps.currentTool &&
    prevProps.isCtrlPressed === nextProps.isCtrlPressed &&
    prevProps.isGM === nextProps.isGM &&
    prevProps.activePlayerId === nextProps.activePlayerId &&
    prevProps.nexusBoardAddingCell === nextProps.nexusBoardAddingCell &&
    prevProps.onContextMenu === nextProps.onContextMenu &&
    prevProps.onMouseDown === nextProps.onMouseDown &&
    prevProps.onDoubleClick === nextProps.onDoubleClick &&
    prevProps.onResizeStart === nextProps.onResizeStart &&
    prevProps.onAddNexusCell === nextProps.onAddNexusCell &&
    prevProps.dispatch === nextProps.dispatch &&
    prevProps.context.pixelsPerVU === nextProps.context.pixelsPerVU &&
    prevProps.context.basePixelsPerVU === nextProps.context.basePixelsPerVU &&
    prevProps.context.v2p === nextProps.context.v2p &&
    prevProps.context.rulerStep === nextProps.context.rulerStep
  );
});

GameObjectsRenderer.displayName = 'GameObjectsRenderer';

// Export memoized component with custom comparison (same as above)
export const GameObjectsRendererMemo = memo(GameObjectsRenderer, (prevProps, nextProps) => {
  // Deep array comparison for visibleTableObjects
  const prevObjects = prevProps.visibleTableObjects;
  const nextObjects = nextProps.visibleTableObjects;

  if (prevObjects.length !== nextObjects.length) return false;

  for (let i = 0; i < prevObjects.length; i++) {
    if (prevObjects[i] !== nextObjects[i]) return false;
  }

  return (
    prevProps.hyperscaleLayers === nextProps.hyperscaleLayers &&
    prevProps.selectedHyperscaleLayerIds === nextProps.selectedHyperscaleLayerIds &&
    prevProps.draggingId === nextProps.draggingId &&
    prevProps.resizingId === nextProps.resizingId &&
    prevProps.currentTool === nextProps.currentTool &&
    prevProps.isCtrlPressed === nextProps.isCtrlPressed &&
    prevProps.isGM === nextProps.isGM &&
    prevProps.activePlayerId === nextProps.activePlayerId &&
    prevProps.nexusBoardAddingCell === nextProps.nexusBoardAddingCell &&
    prevProps.onContextMenu === nextProps.onContextMenu &&
    prevProps.onMouseDown === nextProps.onMouseDown &&
    prevProps.onDoubleClick === nextProps.onDoubleClick &&
    prevProps.onResizeStart === nextProps.onResizeStart &&
    prevProps.onAddNexusCell === nextProps.onAddNexusCell &&
    prevProps.dispatch === nextProps.dispatch &&
    prevProps.context.pixelsPerVU === nextProps.context.pixelsPerVU &&
    prevProps.context.basePixelsPerVU === nextProps.context.basePixelsPerVU &&
    prevProps.context.v2p === nextProps.context.v2p &&
    prevProps.context.rulerStep === nextProps.context.rulerStep
  );
});

GameObjectsRendererMemo.displayName = 'GameObjectsRendererMemo';