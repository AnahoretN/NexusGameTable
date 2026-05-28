import React, { memo, useMemo } from 'react';
import { Card as CardComponent } from '../Card';
import { TableObject, Card as CardType, Deck as DeckType, CardLocation } from '../../types';
import { Eye, EyeOff, RefreshCw, RotateCw, Hand, ArrowUp, Undo, Trash2 } from 'lucide-react';
import { Tooltip } from '../Tooltip';
import { removeFromCursorSlot } from '../../utils/cursorSlotTracker';

interface CardRendererProps {
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
  basePixelsPerVU: number;
  zoomMultiplier: number;
  onContextMenu: (e: React.MouseEvent, obj: TableObject) => void;
  onMouseDown: (e: React.MouseEvent, objId: string) => void;
  dispatch: React.Dispatch<any>;
}

export const CardRenderer = memo(({
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
  basePixelsPerVU,
  zoomMultiplier,
  onContextMenu,
  onMouseDown,
  dispatch,
}: CardRendererProps) => {
  const card = obj as CardType;
  const deck = card.deckId ? allObjects[card.deckId] as DeckType | undefined : undefined;
  // 🔥 FIX: All objects are shared - anyone can move them regardless of ownership
  // Only check if explicitly locked or being dragged by another player
  const canDrag = !obj.locked && (!obj.isDragging || obj.dragOwnerId === activePlayerId);
  const isDragging = draggingId === obj.id;
  const isDraggingByOther = obj.isDragging && obj.dragOwnerId && obj.dragOwnerId !== activePlayerId;
  const objLayer = obj.hyperscaleLayerId || 'none';

  // Memoize cursor class
  const cursorClass = useMemo(() => {
    if (currentTool !== 'none' && currentTool !== 'zoom') return 'cursor-default';
    if (isDragging) return 'cursor-grabbing z-[100000]';
    if (isDraggingByOther) return 'cursor-not-allowed opacity-50';
    if (canDrag) return 'cursor-grab';
    return 'cursor-default';
  }, [currentTool, isDragging, isDraggingByOther, canDrag]);

  // Memoize position style
  const positionStyle = useMemo(() => {
    const inverseScale = getLayerInverseScale(objLayer);
    const transform = `rotate(${obj.rotation ?? 0}deg)${inverseScale !== 1 ? ` scale(${inverseScale})` : ''}`;
    const baseWidth = card.width ?? (deck?.cardWidth ?? 63);
    const baseHeight = card.height ?? (deck?.cardHeight ?? 88);

    // 🔍 DEBUG: Log rendering for all objects
    console.log('[CardRenderer] Rendering:', obj.id, 'type:', obj.type);
    console.log('[CardRenderer] obj.x, obj.y:', { x: obj.x.toFixed(2), y: obj.y.toFixed(2) });
    console.log('[CardRenderer] v2p(obj.x, obj.y):', { x: v2p(obj.x).toFixed(2), y: v2p(obj.y).toFixed(2) });
    console.log('[CardRenderer] pixelsPerVU:', pixelsPerVU);

    return createPositionedStyle(
      v2p(obj.x),
      v2p(obj.y),
      v2p(baseWidth),
      v2p(baseHeight),
      globalZIndex,
      objLayer,
      {
        transform,
        overflow: 'visible',
        willChange: isDragging ? 'transform, left, top' : undefined,
        // Visual feedback when dragged by another player
        opacity: isDraggingByOther ? 0.5 : undefined,
        pointerEvents: isDraggingByOther ? 'none' : undefined,
      }
    );
  }, [obj.x, obj.y, obj.rotation, globalZIndex, objLayer, v2p, createPositionedStyle, getLayerInverseScale, isDragging, isDraggingByOther, card.width, card.height, deck?.cardWidth, deck?.cardHeight]);

  // Memoize dimensions
  const dimensions = useMemo(() => {
    const baseWidth = card.width ?? (deck?.cardWidth ?? 63);
    const baseHeight = card.height ?? (deck?.cardHeight ?? 88);
    return {
      pxWidth: v2p(baseWidth),
      pxHeight: v2p(baseHeight),
    };
  }, [card.width, card.height, deck?.cardWidth, deck?.cardHeight, v2p]);

  // Memoize action buttons visibility class
  const actionButtonsClass = useMemo(() => {
    const baseClass = 'absolute -bottom-4 left-1/2 flex items-center gap-1 transition-opacity z-20';
    if (isCtrlPressed) return `${baseClass} opacity-0 pointer-events-none`;
    if (currentTool === 'zoom') return `${baseClass} opacity-100 pointer-events-auto`;
    if (currentTool === 'none') return `${baseClass} opacity-0 group-hover:opacity-100 pointer-events-none`;
    return `${baseClass} opacity-100 pointer-events-auto`;
  }, [isCtrlPressed, currentTool]);

  // Memoize button configurations
  const buttonConfigs = useMemo(() => {
    const rotationStep = (card as any).rotationStep || 45;

    return {
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
          dispatch({ type: 'UPDATE_OBJECT', payload: { id: obj.id, updates: { rotation: ((card as any).rotation || 0) + rotationStep } } });
        },
        className: 'bg-yellow-600 hover:bg-yellow-500',
        title: 'Rotate CW',
        icon: <RotateCw size={14} />
      },
      rotateCounterClockwise: {
        key: 'rotateCounterClockwise',
        action: () => {
          dispatch({ type: 'UPDATE_OBJECT', payload: { id: obj.id, updates: { rotation: ((card as any).rotation || 0) - rotationStep } } });
        },
        className: 'bg-yellow-600 hover:bg-yellow-500',
        title: 'Rotate CCW',
        icon: <RotateCw size={14} style={{ transform: 'scaleX(-1)' }} />
      },
      moveToHand: {
        key: 'moveToHand',
        action: () => {
          removeFromCursorSlot(obj.id);
          dispatch({
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
          });
        },
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
            dispatch({ type: 'MILL_CARD_TO_PILE', payload: { deckId: deck?.id, cardId: obj.id, pileId: millPile.id } });
          }
        },
        className: 'bg-red-600 hover:bg-red-500',
        title: 'Discard',
        icon: <Trash2 size={14} />
      },
    };
  }, [card, obj.id, deck, activePlayerId, dispatch]);

  // Memoize rendered buttons
  const actionButtons = useMemo(() => {
    const buttons = (deck?.cardActionButtons || [])
      .map(action => buttonConfigs[action])
      .filter(Boolean);

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
  }, [deck?.cardActionButtons, buttonConfigs]);

  return (
    <Tooltip
      text={card.tooltipText}
      showImage={card.showTooltipImage}
      imageSrc={card.content}
      scale={card.tooltipScale}
    >
      <div
        data-object-id={obj.id}
        onMouseDown={(e) => {
          if (canDrag) {
            onMouseDown(e, obj.id);
          }
        }}
        onContextMenu={(e) => onContextMenu(e, obj)}
        className={`absolute group ${cursorClass}`}
        style={positionStyle}
      >
        <CardComponent
          card={card}
          overrideWidth={dimensions.pxWidth}
          overrideHeight={dimensions.pxHeight}
          cardWidth={deck?.cardWidth}
          cardHeight={deck?.cardHeight}
          cardOrientation={deck?.cardOrientation}
          cardNamePosition={deck?.cardNamePosition}
          disableRotationTransform={true}
          deckSpriteConfig={deck?.spriteConfig}
          deckShowTooltipImage={deck?.showTooltipImage}
          deckTooltipScale={deck?.tooltipScale}
        />

        {/* Action buttons - scale to compensate parent's inverseScale */}
        <div
          className={actionButtonsClass}
          style={{ transform: 'translateX(-50%) scale(' + zoomMultiplier + ')' }}
        >
          {actionButtons}
        </div>
      </div>
    </Tooltip>
  );
}, (prevProps, nextProps) => {
  // Only re-render if THIS card is being dragged, not when ANY card is dragged
  const prevIsDragging = prevProps.draggingId === prevProps.obj.id;
  const nextIsDragging = nextProps.draggingId === nextProps.obj.id;

  return (
    prevProps.obj === nextProps.obj &&
    prevProps.allObjects === nextProps.allObjects &&
    prevIsDragging === nextIsDragging &&
    prevProps.currentTool === nextProps.currentTool &&
    prevProps.isCtrlPressed === nextProps.isCtrlPressed &&
    prevProps.isGM === nextProps.isGM &&
    prevProps.activePlayerId === nextProps.activePlayerId &&
    prevProps.pixelsPerVU === nextProps.pixelsPerVU &&
    prevProps.basePixelsPerVU === nextProps.basePixelsPerVU &&
    prevProps.zoomMultiplier === nextProps.zoomMultiplier &&
    prevProps.v2p === nextProps.v2p
  );
});

CardRenderer.displayName = 'CardRenderer';
