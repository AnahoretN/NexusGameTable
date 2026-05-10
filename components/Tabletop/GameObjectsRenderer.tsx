import React, { memo, useState, useEffect, useRef } from 'react';
import { Card } from '../Card';
import { SvgTokenShape } from '../SvgTokenShape';
import { BoardWithResizeMemo } from './BoardWithResize';
import { NexusBoardMemo } from '../NexusBoard';
import { EffectTemplateRendererMemo } from '../EffectTemplateRenderer';
import { Tooltip } from '../Tooltip';
import { PinnedIndicator } from '../PinnedIndicator';
import { Layers, Lock, Unlock, RefreshCw, Trash2, Copy, Plus, Minus, Users, ArrowUp, ArrowDown, ChevronsUp, ChevronsDown, Hand, Eye, EyeOff, Undo, Pin, RotateCw } from 'lucide-react';
import { TableObject, Card as CardType, Token as TokenType, Board as BoardType, NexusBoard, NexusCellObject, Counter, DiceObject, EffectTemplate, ItemType, GridType } from '../../types';
import { TabletopRenderContext, ObjectRenderProps } from './types';
import { getTokenWithAppliedState } from '../../utils/contextMenuActions';

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
  nexusBoardAddingCell: string | null;
  onContextMenu: (e: React.MouseEvent, obj: TableObject) => void;
  onMouseDown: (e: React.MouseEvent, objId: string) => void;
  onDoubleClick?: (e: React.MouseEvent, obj: TableObject) => void;
  onResizeStart?: (e: React.MouseEvent, objId: string) => void;
  onAddNexusCell?: (objId: string, direction: string) => void;
  dispatch: React.Dispatch<any>;
}

export const GameObjectsRenderer = memo(({
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
  nexusBoardAddingCell,
  onContextMenu,
  onMouseDown,
  onDoubleClick,
  onResizeStart,
  onAddNexusCell,
  dispatch
}) => {
  const { v2p, createPositionedStyle, getLayerZoomScale, getLayerInverseScale, pixelsPerVU } = context;

  // State for explosive dice animation (scale value and phase for each dice)
  const [explosiveScales, setExplosiveScales] = useState<Record<string, number>>({});
  const [explosivePhases, setExplosivePhases] = useState<Record<string, 'phase1' | 'phase2' | 'done'>>({});
  const prevDiceRollRef = useRef<Record<string, number | undefined>>({});
  const animationTimeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});
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
    const isOwner = !(obj as any).ownerId || (obj as any).ownerId === activePlayerId || isGM;
    const objLayer = obj.hyperscaleLayerId || 'none';
    const layerZoomScale = getLayerZoomScale(objLayer);

    const hasSelectedLayers = selectedHyperscaleLayerIds.length > 0;
    const isLayerSelected = objLayer === 'none' || selectedHyperscaleLayerIds.includes(objLayer);
    const isPermeable = hasSelectedLayers && !isLayerSelected;

    return (
      <Tooltip
        key={obj.id}
        text={obj.tooltipText}
        showImage={obj.showTooltipImage}
        imageSrc={obj.content}
        scale={obj.tooltipScale}
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
            isOwner={isOwner}
            isResizing={isResizing}
            canResize={canResize}
            zoom={layerZoomScale}
            onContextMenu={(e) => onContextMenu(e, obj)}
            onMouseDown={(e) => onMouseDown(e, obj.id)}
            onResizeStart={(e) => isOwner && onResizeStart?.(e, obj.id)}
            gridSize={gridSize}
            gridWidth={gridW_px}
            gridHeight={gridH_px}
            showGrid={board.showGrid}
            currentTool={currentTool}
            livePreviewSize={resizingId === obj.id ? liveResizeSizeRef.current : null}
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
    const isOwner = !(obj as any).ownerId || (obj as any).ownerId === activePlayerId || isGM;
    const isDragging = draggingId === obj.id;
    const objLayer = obj.hyperscaleLayerId || 'none';

    return (
      <Tooltip
        key={obj.id}
        text={obj.tooltipText}
        showImage={obj.showTooltipImage}
        imageSrc={obj.content}
        scale={obj.tooltipScale}
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
            isOwner={isOwner}
            isDragging={isDragging}
            onMouseDown={(e) => isOwner && onMouseDown(e, obj.id)}
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
    const token = getTokenWithAppliedState(obj as TokenType, state.objects);

    const isOwner = !(obj as any).ownerId || (obj as any).ownerId === activePlayerId || isGM;
    const canDrag = !obj.locked;
    const draggingClass = draggingId === obj.id ? 'cursor-grabbing z-[100000]' : (canDrag ? 'cursor-grab' : 'cursor-default');
    const objLayer = obj.hyperscaleLayerId || 'none';

    const hasSelectedLayers = selectedHyperscaleLayerIds.length > 0;
    const isLayerSelected = objLayer === 'none' || selectedHyperscaleLayerIds.includes(objLayer);
    const isPermeable = hasSelectedLayers && !isLayerSelected;

    return (
      <Tooltip
        key={obj.id}
        text={obj.tooltipText}
        showImage={obj.showTooltipImage}
        imageSrc={obj.content}
        scale={obj.tooltipScale}
      >
        <div
          data-object-id={obj.id}
          onMouseDown={(e) => isOwner && onMouseDown(e, obj.id)}
          onContextMenu={(e) => onContextMenu(e, obj)}
          className={`absolute flex items-center justify-center text-white font-bold select-none group ${currentTool !== 'none' && currentTool !== 'zoom' ? 'cursor-default' : draggingClass}`}
          style={createPositionedStyle(
            v2p(obj.x),
            v2p(obj.y),
            v2p(token.width),
            v2p(token.height),
            globalZIndex,
            objLayer,
            {
              transform: `rotate(${obj.rotation}deg)${getLayerInverseScale(objLayer) !== 1 ? ` scale(${getLayerInverseScale(objLayer)})` : ''}`,
              pointerEvents: isPermeable ? 'none' : 'auto',
            }
          )}
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
            tokenName={(token as any).showNameOnToken || (obj as any).showName || ((obj as any).archetypeId && (state.objects[(obj as any).archetypeId] as any)?.showName) ? obj.name : undefined}
            fontColor={(token as any).fontColor || 'white'}
          />

          {(obj as any).isPinnedToViewport && draggingId !== obj.id && <PinnedIndicator />}

          {/* Action buttons */}
          <div className={`absolute -bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 transition-opacity z-20 ${isCtrlPressed ? 'opacity-0 pointer-events-none' : currentTool === 'zoom' ? 'opacity-100 pointer-events-auto' : currentTool === 'none' ? 'opacity-0 group-hover:opacity-100 pointer-events-none' : 'opacity-100 pointer-events-auto'}`}>
            {(() => {
              const actionButtons = obj.actionButtons || [];
              const buttonConfigs: Record<string, { key: string; action: () => void; className: string; title: string; icon: React.ReactNode }> = {
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
                  action: () => dispatch({ type: 'UPDATE_OBJECT', payload: { id: obj.id, isPinnedToViewport: !(obj as any).isPinnedToViewport } }),
                  className: 'bg-pink-600 hover:bg-pink-500',
                  title: (obj as any).isPinnedToViewport ? 'Unpin' : 'Pin',
                  icon: <Pin size={14} />
                },
              };

              const buttons = actionButtons
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
            })()}
          </div>
        </div>
      </Tooltip>
    );
  };

  const renderCard = (obj: TableObject, globalZIndex: number) => {
    const card = obj as CardType;
    const deck = card.deckId ? state.objects[card.deckId] : undefined;
    const isOwner = !(obj as any).ownerId || (obj as any).ownerId === activePlayerId || isGM;
    const canDrag = !obj.locked;
    const draggingClass = draggingId === obj.id ? 'cursor-grabbing z-[100000]' : (canDrag ? 'cursor-grab' : 'cursor-default');
    const objLayer = obj.hyperscaleLayerId || 'none';

    let baseWidth = card.width ?? (deck?.cardWidth ?? 63);
    let baseHeight = card.height ?? (deck?.cardHeight ?? 88);
    const pxWidth = v2p(baseWidth);
    const pxHeight = v2p(baseHeight);

    return (
      <Tooltip
        key={obj.id}
        text={obj.tooltipText}
        showImage={obj.showTooltipImage}
        imageSrc={obj.content}
        scale={obj.tooltipScale}
      >
        <div
          data-object-id={obj.id}
          onMouseDown={(e) => isOwner && onMouseDown(e, obj.id)}
          onContextMenu={(e) => onContextMenu(e, obj)}
          className={`absolute group ${currentTool !== 'none' && currentTool !== 'zoom' ? 'cursor-default' : draggingClass}`}
          style={createPositionedStyle(
            v2p(obj.x),
            v2p(obj.y),
            pxWidth,
            pxHeight,
            globalZIndex,
            objLayer,
            {
              transform: `rotate(${obj.rotation ?? 0}rad)${getLayerInverseScale(objLayer) !== 1 ? ` scale(${getLayerInverseScale(objLayer)})` : ''}`,
            }
          )}
        >
          <Card
            card={card}
            overrideWidth={pxWidth}
            overrideHeight={pxHeight}
            cardWidth={deck?.cardWidth}
            cardHeight={deck?.cardHeight}
            cardOrientation={deck?.cardOrientation}
            cardNamePosition={deck?.cardNamePosition}
            disableRotationTransform={true}
            deckSpriteConfig={deck?.spriteConfig}
            deckShowTooltipImage={deck?.showTooltipImage}
            deckTooltipScale={deck?.tooltipScale}
          />

          {/* Action buttons for cards */}
          <div className={`absolute -bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 transition-opacity z-20 ${isCtrlPressed ? 'opacity-0 pointer-events-none' : currentTool === 'zoom' ? 'opacity-100 pointer-events-auto' : currentTool === 'none' ? 'opacity-0 group-hover:opacity-100 pointer-events-none' : 'opacity-100 pointer-events-auto'}`}>
            {(() => {
              const actionButtons = deck?.cardActionButtons || [];
              const buttonConfigs: Record<string, { key: string; action: () => void; className: string; title: string; icon: React.ReactNode }> = {
                flip: {
                  key: 'flip',
                  action: () => dispatch({ type: 'FLIP_CARD', payload: { cardId: obj.id } }),
                  className: 'bg-purple-600 hover:bg-purple-500',
                  title: card.faceUp ? 'Face Down' : 'Face Up',
                  icon: card.faceUp ? <EyeOff size={14} /> : <Eye size={14} />
                },
                swingClockwise: {
                  key: 'swingClockwise',
                  action: () => {
                    const rotationStep = (card as any).rotationStep || 45;
                    const newRotation = (card.rotation || 0) === 0 ? rotationStep : 0;
                    dispatch({ type: 'UPDATE_OBJECT', payload: { id: obj.id, updates: { rotation: newRotation } } });
                  },
                  className: 'bg-orange-600 hover:bg-orange-500',
                  title: 'Swing CW',
                  icon: <RefreshCw size={14} />
                },
                swingCounterClockwise: {
                  key: 'swingCounterClockwise',
                  action: () => {
                    const rotationStep = (card as any).rotationStep || 45;
                    const newRotation = (card.rotation || 0) === 0 ? -rotationStep : 0;
                    dispatch({ type: 'UPDATE_OBJECT', payload: { id: obj.id, updates: { rotation: newRotation } } });
                  },
                  className: 'bg-orange-600 hover:bg-orange-500',
                  title: 'Swing CCW',
                  icon: <RefreshCw size={14} style={{ transform: 'scaleX(-1)' }} />
                },
                rotateClockwise: {
                  key: 'rotateClockwise',
                  action: () => {
                    const rotationStep = (card as any).rotationStep || 45;
                    dispatch({ type: 'UPDATE_OBJECT', payload: { id: obj.id, updates: { rotation: (card.rotation || 0) + rotationStep } } });
                  },
                  className: 'bg-yellow-600 hover:bg-yellow-500',
                  title: 'Rotate CW',
                  icon: <RotateCw size={14} />
                },
                rotateCounterClockwise: {
                  key: 'rotateCounterClockwise',
                  action: () => {
                    const rotationStep = (card as any).rotationStep || 45;
                    dispatch({ type: 'UPDATE_OBJECT', payload: { id: obj.id, updates: { rotation: (card.rotation || 0) - rotationStep } } });
                  },
                  className: 'bg-yellow-600 hover:bg-yellow-500',
                  title: 'Rotate CCW',
                  icon: <RotateCw size={14} style={{ transform: 'scaleX(-1)' }} />
                },
                moveToHand: {
                  key: 'moveToHand',
                  action: () => dispatch({
                    type: 'UPDATE_OBJECT',
                    payload: {
                      id: obj.id,
                      updates: {
                        location: 'HAND' as CardLocation,
                        faceUp: true,
                        ownerId: activePlayerId,
                        isOnTable: false,
                        inCursorSlot: false
                      }
                    }
                  }),
                  className: 'bg-blue-600 hover:bg-blue-500',
                  title: 'To Hand',
                  icon: <Hand size={14} />
                },
                moveToTopDeck: {
                  key: 'moveToTopDeck',
                  action: () => dispatch({ type: 'RETURN_CARD_TO_DECK_TOP', payload: { cardId: obj.id, deckId: deck?.id } }),
                  className: 'bg-orange-600 hover:bg-orange-500',
                  title: 'To Top Deck',
                  icon: <ArrowUp size={14} />
                },
                moveToBottomDeck: {
                  key: 'moveToBottomDeck',
                  action: () => dispatch({ type: 'MILL_CARD_TO_BOTTOM', payload: { deckId: deck?.id, cardId: obj.id } }),
                  className: 'bg-yellow-600 hover:bg-yellow-500',
                  title: 'To Bottom Deck',
                  icon: <Undo size={14} style={{ transform: 'rotate(180deg)' }} />
                },
                moveToDiscard: {
                  key: 'moveToDiscard',
                  action: () => {
                    const millPile = deck?.piles?.find((p: any) => p.isMillPile);
                    if (millPile) {
                      dispatch({ type: 'ADD_CARD_TO_PILE', payload: { cardId: obj.id, deckId: deck?.id, pileId: millPile.id } });
                    }
                  },
                  className: 'bg-red-600 hover:bg-red-500',
                  title: 'Mill',
                  icon: <Trash2 size={14} />
                },
                clone: {
                  key: 'clone',
                  action: () => dispatch({ type: 'CLONE_OBJECT', payload: { id: obj.id } }),
                  className: 'bg-cyan-600 hover:bg-cyan-500',
                  title: 'Clone',
                  icon: <Copy size={14} />
                },
                delete: {
                  key: 'delete',
                  action: () => dispatch({ type: 'DELETE_OBJECT', payload: { id: obj.id } }),
                  className: 'bg-red-600 hover:bg-red-500',
                  title: 'Delete',
                  icon: <Trash2 size={14} />
                },
                lock: {
                  key: 'lock',
                  action: () => dispatch({ type: 'TOGGLE_LOCK', payload: { id: obj.id } }),
                  className: 'bg-yellow-600 hover:bg-yellow-500',
                  title: card.locked ? 'Unlock' : 'Lock',
                  icon: card.locked ? <Unlock size={14} /> : <Lock size={14} />
                },
                layerUp: {
                  key: 'layerUp',
                  action: () => dispatch({ type: 'MOVE_LAYER_UP', payload: { id: obj.id } }),
                  className: 'bg-blue-600 hover:bg-blue-500',
                  title: 'Layer Up',
                  icon: <ArrowUp size={14} />
                },
                layerDown: {
                  key: 'layerDown',
                  action: () => dispatch({ type: 'MOVE_LAYER_DOWN', payload: { id: obj.id } }),
                  className: 'bg-blue-600 hover:bg-blue-500',
                  title: 'Layer Down',
                  icon: <ArrowDown size={14} />
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
                  action: () => dispatch({ type: 'UPDATE_OBJECT', payload: { id: obj.id, isPinnedToViewport: !(obj as any).isPinnedToViewport } }),
                  className: 'bg-pink-600 hover:bg-pink-500',
                  title: (obj as any).isPinnedToViewport ? 'Unpin' : 'Pin',
                  icon: <Pin size={14} />
                },
              };

              const buttons = actionButtons
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
            })()}
          </div>
        </div>
      </Tooltip>
    );
  };

  const renderCounter = (obj: TableObject, globalZIndex: number) => {
    const counter = obj as Counter;
    const isOwner = !(obj as any).ownerId || (obj as any).ownerId === activePlayerId || isGM;
    const canDrag = !obj.locked;
    const draggingClass = draggingId === obj.id ? 'cursor-grabbing z-[100000]' : (canDrag ? 'cursor-grab' : 'cursor-default');
    const objLayer = obj.hyperscaleLayerId || 'none';

    const hasSelectedLayers = selectedHyperscaleLayerIds.length > 0;
    const isLayerSelected = objLayer === 'none' || selectedHyperscaleLayerIds.includes(objLayer);
    const isPermeable = hasSelectedLayers && !isLayerSelected;

    const counterWidth = Math.max(counter.width || 60, v2p(100)) / pixelsPerVU;
    const counterHeight = 50 / pixelsPerVU;

    return (
      <Tooltip
        key={obj.id}
        text={obj.tooltipText}
        showImage={obj.showTooltipImage}
        imageSrc={obj.content}
        scale={obj.tooltipScale}
      >
        <div
          data-object-id={obj.id}
          onMouseDown={(e) => {
            if ((e.target as HTMLElement).closest('button')) {
              return;
            }
            if (isOwner) onMouseDown(e, obj.id);
          }}
          onContextMenu={(e) => onContextMenu(e, obj)}
          className={`absolute bg-slate-900 border-2 border-slate-600 rounded-lg shadow-xl flex items-center justify-between p-2 gap-2 text-white select-none group ${currentTool !== 'none' && currentTool !== 'zoom' ? 'cursor-default' : draggingClass}`}
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
            }
          )}
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

          {(obj as any).isPinnedToViewport && draggingId !== obj.id && <PinnedIndicator />}
        </div>
      </Tooltip>
    );
  };

  const renderDice = (obj: TableObject, globalZIndex: number) => {
    const dice = obj as DiceObject;
    const isOwner = !(obj as any).ownerId || (obj as any).ownerId === activePlayerId || isGM;
    const canDrag = !obj.locked;
    const draggingClass = draggingId === obj.id ? 'cursor-grabbing z-[100000]' : (canDrag ? 'cursor-grab' : 'cursor-default');
    const objLayer = obj.hyperscaleLayerId || 'none';

    const hasSelectedLayers = selectedHyperscaleLayerIds.length > 0;
    const isLayerSelected = objLayer === 'none' || selectedHyperscaleLayerIds.includes(objLayer);
    const isPermeable = hasSelectedLayers && !isLayerSelected;

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
    const diceWidth = v2p(obj.width);
    const diceHeight = v2p(obj.height);

    const valueFontSize = v2p(25); // 25 vu for dice value
    const sidesFontSize = v2p(15); // 15 vu for dice sides (d6, d20, etc.)

    // Use explosive colors when triggered, otherwise use defaults
    const diceColor = isExplosiveTriggered
      ? (dice.explosiveColor || '#ffff00')
      : (obj.color || '#6366f1');
    const fontColor = isExplosiveTriggered
      ? (dice.explosiveTextColor || '#ff0000')
      : ((obj as any).fontColor || 'white');
    const glowColor = isExplosiveTriggered
      ? (dice.explosiveGlow || '#ff0000')
      : undefined;

    return (
      <Tooltip
        key={obj.id}
        text={obj.tooltipText}
        showImage={obj.showTooltipImage}
        imageSrc={obj.content}
        scale={obj.tooltipScale}
      >
        <div
          data-object-id={obj.id}
          onMouseDown={(e) => isOwner && onMouseDown(e, obj.id)}
          onDoubleClick={(e) => isOwner && onDoubleClick?.(e, obj)}
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
            }
          )}
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
                  } else if (valueOverride.type === 'emoji') {
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
          </SvgTokenShape>

          {(obj as any).isPinnedToViewport && draggingId !== obj.id && <PinnedIndicator />}

          {/* Action buttons */}
          <div className={`absolute -bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 transition-opacity z-20 ${isCtrlPressed ? 'opacity-0 pointer-events-none' : currentTool === 'zoom' ? 'opacity-100 pointer-events-auto' : currentTool === 'none' ? 'opacity-0 group-hover:opacity-100 pointer-events-none' : 'opacity-100 pointer-events-auto'}`}>
            {(() => {
              const actionButtons = obj.actionButtons || [];
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
                  action: () => dispatch({ type: 'UPDATE_OBJECT', payload: { id: obj.id, isPinnedToViewport: !(obj as any).isPinnedToViewport } }),
                  className: 'bg-pink-600 hover:bg-pink-500',
                  title: (obj as any).isPinnedToViewport ? 'Unpin' : 'Pin',
                  icon: <Pin size={14} />
                },
              };

              let buttons = actionButtons
                .map(action => buttonConfigs[action])
                .filter(Boolean);

              // Add rollGroup button if dice is in a group and not already in buttons
              if (isInGroup && !actionButtons.includes('rollGroup')) {
                buttons.push(buttonConfigs.rollGroup);
              }

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
    const isOwner = !(obj as any).ownerId || (obj as any).ownerId === activePlayerId || isGM;
    const canDrag = !obj.locked;
    const draggingClass = draggingId === obj.id ? 'cursor-grabbing z-[100000]' : (canDrag ? 'cursor-grab' : 'cursor-default');
    const objLayer = obj.hyperscaleLayerId || 'tokens';

    const hasSelectedLayers = selectedHyperscaleLayerIds.length > 0;
    const isLayerSelected = objLayer === 'none' || selectedHyperscaleLayerIds.includes(objLayer);
    const isPermeable = hasSelectedLayers && !isLayerSelected;

    return (
      <EffectTemplateRendererMemo
        key={obj.id}
        obj={obj}
        pixelsPerVU={pixelsPerVU}
        isDragging={draggingId === obj.id}
        onMouseDown={(e) => isOwner && onMouseDown(e, obj.id)}
        onContextMenu={(e) => onContextMenu(e, obj)}
        style={{
          pointerEvents: isPermeable ? 'none' : 'auto',
        }}
        className={draggingClass}
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
      return renderEffectTemplate(obj, globalZIndex);
    }

    return null;
  };

  return (
    <>
      {visibleTableObjects.map(obj => renderGameObject(obj))}
    </>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for GameObjectsRenderer
  return (
    prevProps.visibleTableObjects === nextProps.visibleTableObjects &&
    prevProps.context === nextProps.context &&
    prevProps.state === nextProps.state &&
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
    prevProps.dispatch === nextProps.dispatch
  );
});

GameObjectsRenderer.displayName = 'GameObjectsRenderer';

// Export memoized component with custom comparison
export const GameObjectsRendererMemo = memo(GameObjectsRenderer, (prevProps, nextProps) => {
  return (
    prevProps.visibleTableObjects === nextProps.visibleTableObjects &&
    prevProps.context === nextProps.context &&
    prevProps.state === nextProps.state &&
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
    prevProps.dispatch === nextProps.dispatch
  );
});

GameObjectsRendererMemo.displayName = 'GameObjectsRendererMemo';