import React from 'react';
import { Card, Token, ItemType, TableObject, TokenShape } from '../types';
import { SvgTokenShape } from './SvgTokenShape';

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
    );
  }

  if (obj.type === ItemType.TOKEN) {
    const token = obj as Token;
    const tokenWidth = (token.width || 50) * pixelsPerVU;
    const tokenHeight = (token.height || 50) * pixelsPerVU;

    return (
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
    );
  }

  return null;
});
