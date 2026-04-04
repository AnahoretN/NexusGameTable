import React from 'react';
import { Card, Token, ItemType, TableObject, TokenShape, ContextAction } from '../types';
import { SvgTokenShape } from './SvgTokenShape';
import { Trash2, Copy, RefreshCw, RotateCw, ChevronsUpDown, Eye, EyeOff } from 'lucide-react';

interface ObjectRendererProps {
  obj: TableObject;
  pixelsPerVU: number;
  isDragging?: boolean;
  onMouseDown?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
  className?: string;
  isGM?: boolean;
  showTokenName?: boolean; // Show token name on token
  dispatch?: (action: any) => void; // For action buttons
}

export const ObjectRenderer = React.memo<ObjectRendererProps>(({
  obj,
  pixelsPerVU,
  isDragging = false,
  onMouseDown,
  onContextMenu,
  style = {},
  className = '',
  isGM = false,
  showTokenName = false
}) => {
  const rotation = obj.rotation || 0;
  // When dragging, use very high z-index to appear above everything
  // Otherwise use original object's z-index to maintain layer position
  const zIndex = isDragging ? 999999 : (obj.zIndex || 1000);

  if (obj.type === ItemType.CARD) {
    const card = obj as Card;
    const cardWidth = (card.width || 100) * pixelsPerVU;
    const cardHeight = (card.height || 140) * pixelsPerVU;

    return (
      <div className="group relative">
        <div
          data-object-id={obj.id}
          style={{
            position: 'absolute',
            width: cardWidth,
            height: cardHeight,
            transform: `rotate(${rotation}deg)`,
            transformOrigin: 'center center',
            zIndex,
            cursor: isDragging ? 'grabbing' : 'grab',
            ...style
          }}
          className={`bg-slate-700 border border-slate-600 rounded shadow-lg ${className}`}
          onMouseDown={onMouseDown}
          onContextMenu={onContextMenu}
        >
          {card.faceUp || isGM ? (
            <div className="w-full h-full rounded overflow-hidden">
              {card.spriteUrl && card.spriteColumns && card.spriteRows && card.spriteIndex !== undefined ? (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    backgroundImage: `url(${card.spriteUrl})`,
                    backgroundSize: `${card.spriteColumns * 100}% ${card.spriteRows * 100}%`,
                    backgroundPosition: (() => {
                      const col = card.spriteIndex % card.spriteColumns;
                      const row = Math.floor(card.spriteIndex / card.spriteColumns);
                      const colPercent = card.spriteColumns > 1 ? (col / (card.spriteColumns - 1)) * 100 : 0;
                      const rowPercent = card.spriteRows > 1 ? (row / (card.spriteRows - 1)) * 100 : 0;
                      return `${colPercent}% ${rowPercent}%`;
                    })(),
                    backgroundRepeat: 'no-repeat',
                    imageRendering: 'pixelated'
                  }}
                />
              ) : card.content ? (
                <img
                  src={card.content}
                  alt={card.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white text-xs p-1">
                  {card.name}
                </div>
              )}
            </div>
          ) : (
            <div className="w-full h-full bg-blue-900 rounded flex items-center justify-center">
              {card.backFaceUrl ? (
                <img
                  src={card.backFaceUrl}
                  alt="Card Back"
                  className="w-full h-full object-cover rounded"
                />
              ) : (
                <div className="text-blue-400 text-xs">Card Back</div>
              )}
            </div>
          )}
        </div>

        {/* Action buttons for cards */}
        {obj.actionButtons && obj.actionButtons.length > 0 && dispatch && (
          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 z-20 pointer-events-none">
            {obj.actionButtons.map((action) => {
              const buttonConfig = getActionButtonConfig(action, obj, dispatch);
              return buttonConfig ? (
                <button
                  key={action}
                  onClick={(e) => {
                    e.stopPropagation();
                    buttonConfig.action();
                  }}
                  className={`${buttonConfig.className} pointer-events-auto`}
                  title={buttonConfig.title}
                >
                  {buttonConfig.icon}
                </button>
              ) : null;
            })}
          </div>
        )}
      </div>
    );
  }

  if (obj.type === ItemType.TOKEN) {
    const token = obj as Token;
    const tokenWidth = (token.width || 50) * pixelsPerVU;
    const tokenHeight = (token.height || 50) * pixelsPerVU;

    return (
      <div className="group relative">
        <div
          data-object-id={obj.id}
          style={{
            position: 'absolute',
            width: tokenWidth,
            height: tokenHeight,
            transform: `rotate(${rotation}deg)`,
            transformOrigin: 'center center',
            zIndex,
            cursor: isDragging ? 'grabbing' : 'grab',
            pointerEvents: isDragging ? 'none' : 'auto',
            ...style
          }}
          onMouseDown={onMouseDown}
          onContextMenu={onContextMenu}
        >
          <SvgTokenShape
            shape={token.shape || TokenShape.CIRCLE}
            width={tokenWidth}
            height={tokenHeight}
            color={token.color || '#e74c3c'}
            content={token.content}
            rotation={0}
            borderWidth={token.borderWidth ?? 2}
            borderColor={token.borderColor || 'white'}
            opacity={token.opacity ?? 100}
            borderOpacity={token.borderOpacity ?? 100}
            showThickness={true}
            tokenName={showTokenName ? token.name : undefined}
            fontColor={token.fontColor || 'white'}
          />
        </div>

        {/* Action buttons for tokens */}
        {obj.actionButtons && obj.actionButtons.length > 0 && dispatch && (
          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 z-20 pointer-events-none">
            {obj.actionButtons.map((action) => {
              const buttonConfig = getActionButtonConfig(action, obj, dispatch);
              return buttonConfig ? (
                <button
                  key={action}
                  onClick={(e) => {
                    e.stopPropagation();
                    buttonConfig.action();
                  }}
                  className={`${buttonConfig.className} pointer-events-auto`}
                  title={buttonConfig.title}
                >
                  {buttonConfig.icon}
                </button>
              ) : null;
            })}
          </div>
        )}
      </div>
    );
  }

  return null;
});

/**
 * Get action button configuration for a given action
 */
function getActionButtonConfig(action: ContextAction, obj: TableObject, dispatch: any) {
  const configs: Record<ContextAction, { className: string; title: string; icon: React.ReactNode; action: () => void }> = {
    flip: {
      className: 'bg-purple-600 hover:bg-purple-500 rounded p-1 shadow',
      title: 'Flip',
      icon: <EyeOff size={14} />,
      action: () => dispatch({ type: 'FLIP_CARD', payload: { cardId: obj.id } })
    },
    rotate: {
      className: 'bg-green-600 hover:bg-green-500 rounded p-1 shadow',
      title: 'Rotate',
      icon: <RefreshCw size={14} />,
      action: () => dispatch({ type: 'ROTATE_OBJECT', payload: { id: obj.id } })
    },
    rotateClockwise: {
      className: 'bg-green-600 hover:bg-green-500 rounded p-1 shadow',
      title: 'Rotate CW',
      icon: <RotateCw size={14} />,
      action: () => dispatch({ type: 'ROTATE_OBJECT', payload: { id: obj.id } })
    },
    rotateCounterClockwise: {
      className: 'bg-green-600 hover:bg-green-500 rounded p-1 shadow',
      title: 'Rotate CCW',
      icon: <RotateCw size={14} style={{ transform: 'scaleX(-1)' }} />,
      action: () => dispatch({ type: 'ROTATE_OBJECT', payload: { id: obj.id } })
    },
    delete: {
      className: 'bg-red-600 hover:bg-red-500 rounded p-1 shadow',
      title: 'Delete',
      icon: <Trash2 size={14} />,
      action: () => dispatch({ type: 'DELETE_OBJECT', payload: { id: obj.id } })
    },
    clone: {
      className: 'bg-cyan-600 hover:bg-cyan-500 rounded p-1 shadow',
      title: 'Clone',
      icon: <Copy size={14} />,
      action: () => dispatch({ type: 'CLONE_OBJECT', payload: { id: obj.id } })
    },
    bringToFront: {
      className: 'bg-blue-600 hover:bg-blue-500 rounded p-1 shadow',
      title: 'Front',
      icon: <ChevronsUpDown size={14} />,
      action: () => dispatch({ type: 'BRING_TO_FRONT', payload: { id: obj.id } })
    },
    sendToBack: {
      className: 'bg-blue-600 hover:bg-blue-500 rounded p-1 shadow',
      title: 'Back',
      icon: <ChevronsUpDown size={14} style={{ transform: 'rotate(180deg)' }} />,
      action: () => dispatch({ type: 'SEND_TO_BACK', payload: { id: obj.id } })
    }
  };

  return configs[action];
}
