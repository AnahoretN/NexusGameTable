
import React from 'react';
import { Card as CardType, CardShape, CardOrientation, ContextAction, CardNamePosition } from '../types';
import { Layers, Undo, ChevronRight, ArrowUp, ArrowDown, Hand, Eye, EyeOff } from 'lucide-react';
import { Tooltip } from './Tooltip';
import { getCardButtonConfig, ButtonAction, CardButtonConfig } from '../utils/buttonConfig';

interface CardProps {
  card: CardType;
  onClick?: () => void;
  onFlip?: (e: React.MouseEvent) => void;
  isHovered?: boolean;
  canFlip?: boolean;
  showActionButtons?: boolean;
  onToHand?: (e: React.MouseEvent) => void;
  onReturnToDeck?: (e: React.MouseEvent) => void;
  // Action buttons based on settings
  actionButtons?: ContextAction[];
  onActionButtonClick?: (action: ContextAction) => void;
  // Override dimensions for scaling
  overrideWidth?: number;
  overrideHeight?: number;
  // Inherited settings from deck
  cardWidth?: number;
  cardHeight?: number;
  cardNamePosition?: CardNamePosition;
  cardOrientation?: CardOrientation;
  // When true, orientation affects dimensions but does NOT rotate the card content
  disableRotationTransform?: boolean;
  // When true, all pointer events are disabled (for cursor slot drag preview)
  disablePointerEvents?: boolean;
  // When true, skip the Tooltip wrapper (for cursor slot cards)
  skipTooltip?: boolean;
}

export const Card: React.FC<CardProps> = ({ card, onClick, onFlip, isHovered, canFlip, showActionButtons, onToHand, onReturnToDeck, actionButtons, onActionButtonClick, overrideWidth, overrideHeight, cardWidth, cardHeight, cardNamePosition, cardOrientation, disableRotationTransform, disablePointerEvents, skipTooltip }) => {
  const shape = card.shape || CardShape.POKER;
  const orientation = cardOrientation ?? CardOrientation.VERTICAL;

  // Determine display dimensions - orientation does NOT affect dimensions
  // 1. overrideWidth/overrideHeight (for hand scaling)
  // 2. card.width/card.height (individual card's own settings - this is PRIMARY)
  // 3. cardWidth/cardHeight (from deck settings - fallback only)
  // 4. Default to 100x100 if none specified
  const displayWidth = overrideWidth ?? card.width ?? cardWidth ?? 100;
  const displayHeight = overrideHeight ?? card.height ?? cardHeight ?? 100;

  // Define button configurations for cards using shared utility
  const getCardButtonConfigs = (): CardButtonConfig[] => {
    const buttons = actionButtons || [];
    return buttons
      .map(action => getCardButtonConfig(action as ButtonAction, card.faceUp, card.locked))
      .filter((config): config is CardButtonConfig => config !== null)
      .slice(0, 4);
  };

  const renderActionButtons = () => {
    // If actionButtons are provided (even as empty array), use that setting only
    // Empty array or undefined means no buttons should be shown when showActionButtons is true
    // Only use legacy fallback when showActionButtons is false (backward compatibility)
    const useActionButtonSetting = actionButtons !== undefined;

    if (useActionButtonSetting) {
      if (actionButtons.length > 0 && onActionButtonClick) {
        const buttons = getCardButtonConfigs();
        return (
          <>
            {buttons.map(btn => (
              <button
                key={btn.action}
                onClick={(e) => { e.stopPropagation(); onActionButtonClick(btn.action); }}
                className={`pointer-events-auto p-2 rounded-lg text-white shadow ${btn.className}`}
                title={btn.title}
              >
                {btn.icon}
              </button>
            ))}
          </>
        );
      }
      // actionButtons is explicitly set to empty array - show no buttons
      return null;
    }

    // Fallback to legacy button props for backward compatibility (when actionButtons is not provided)
    // Only use this when showActionButtons is false
    if (!showActionButtons) {
      return (
        <>
          {onToHand && (
            <button
              onClick={(e) => { e.stopPropagation(); onToHand(e); }}
              className="pointer-events-auto p-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white shadow"
              title="To Hand"
            >
              <Hand size={14} />
            </button>
          )}
          {onFlip && (
            <button
              onClick={(e) => { e.stopPropagation(); onFlip(e); }}
              className="pointer-events-auto p-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-white shadow"
              title="Flip"
            >
              {card.faceUp ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          )}
          {onReturnToDeck && (
            <button
              onClick={(e) => { e.stopPropagation(); onReturnToDeck(e); }}
              className="pointer-events-auto p-2 bg-yellow-600 hover:bg-yellow-500 rounded-lg text-white shadow"
              title="Return to Deck"
            >
              <Layers size={14} />
            </button>
          )}
        </>
      );
    }

    return null;
  };

  const getShapeStyles = () => {
    switch (shape) {
      case CardShape.CIRCLE:
        return { borderRadius: '50%' };
      case CardShape.HEX:
        return { clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' };
      case CardShape.TRIANGLE:
        return { clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' };
      default:
        return { borderRadius: '8px' }; // Default rounded corners for rectangles/squares
    }
  };

  const styles = getShapeStyles();
  const isGeometric = shape === CardShape.HEX || shape === CardShape.TRIANGLE || shape === CardShape.CIRCLE;

  // Calculate transform for card rotation
  const getCardTransform = (orientation: CardOrientation, disableRotation: boolean | undefined, cardRotation: number) => {
    const transforms: string[] = [];
    const isGeometricShape = shape === CardShape.HEX || shape === CardShape.TRIANGLE || shape === CardShape.CIRCLE;

    // Apply card's rotation property (custom rotation from rotate actions)
    if (cardRotation) {
      transforms.push(`rotate(${cardRotation}deg)`);
    }

    // Apply horizontal orientation (90 degrees clockwise = -90deg CSS)
    // Unless disabled (for search window, hand, etc.)
    // For geometric shapes (HEX, TRIANGLE, CIRCLE), orientation affects dimensions but NOT shape rotation
    if (!disableRotation && orientation === CardOrientation.HORIZONTAL && !isGeometricShape) {
      transforms.push('rotate(-90deg)');
    }

    return transforms.length > 0 ? transforms.join(' ') : undefined;
  };

  const cardContent = (
      <div className={`relative inline-block group ${isHovered ? 'scale-105 z-50' : ''}`}>
      {/* Action buttons on bottom edge - outside overflow-hidden */}
      {showActionButtons && (
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-30 pointer-events-none">
              {renderActionButtons()}
          </div>
      )}

      <div
        onClick={onClick}
        className={`relative transition-transform duration-200 select-none overflow-hidden`}
        style={{
          width: displayWidth,
          height: displayHeight,
          boxSizing: 'border-box',
          // Apply rotation for horizontal orientation (90 degrees clockwise = -90deg CSS)
          // Unless disableRotationTransform is true (for search window, hand, etc.)
          // Plus the card's own rotation property for custom rotation
          transform: getCardTransform(orientation, disableRotationTransform, card.rotation),
          // For geometric shapes that get clipped, we use a drop-shadow filter to simulate a border/shadow
          // since the actual CSS border is clipped away.
          filter: isGeometric
              ? `drop-shadow(0 4px 4px rgba(0,0,0,0.5)) ${isHovered ? 'drop-shadow(0 0 4px #facc15)' : ''}`
              : 'drop-shadow(0 4px 6px rgba(0,0,0,0.3))',
          // Disable pointer events when dragging in cursor slot to allow mouse events to pass through to decks/piles
          pointerEvents: disablePointerEvents ? 'none' : 'auto',
          ...styles
        }}
      >
          <div
              className={`w-full h-full ${!isGeometric ? 'border-2 border-gray-700 rounded-lg' : ''} ${isHovered && !isGeometric ? 'ring-2 ring-yellow-400' : ''}`}
              style={{
                  backgroundColor: card.faceUp ? 'white' : '#1e293b',
                  backgroundImage: card.faceUp ? `url(${card.spriteUrl || card.content})` : `repeating-linear-gradient(45deg, #1e293b 0, #1e293b 10px, #0f172a 10px, #0f172a 20px)`,
                  backgroundSize: card.spriteUrl && card.spriteColumns && card.spriteRows
                    ? `${card.spriteColumns * 100}% ${card.spriteRows * 100}%`
                    : 'cover',
                  backgroundPosition: card.spriteUrl && card.spriteIndex !== undefined && card.spriteColumns && card.spriteRows
                    ? `${(card.spriteIndex % card.spriteColumns) * (100 / (card.spriteColumns - 1 || 1))}% ${Math.floor(card.spriteIndex / card.spriteColumns) * (100 / ((card.spriteRows || 1) - 1 || 1))}%`
                    : 'center',
              }}
          >
              {/* Visual Border helper for clipped shapes (rendered inside the clip area) */}
              {isGeometric && (
                  <div className="absolute inset-0 border-[6px] border-slate-700/50 pointer-events-none" />
              )}

              {/* Card Back Design Element if Face Down */}
              {!card.faceUp && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-8 h-8 rounded-full border-2 border-slate-600 opacity-50"></div>
                  </div>
              )}

              {/* Overlay controls for hover */}
              {/* Only show legacy flip button if actionButtons is not provided or flip is in actionButtons */}
              {canFlip && !showActionButtons && (actionButtons === undefined || actionButtons.includes('flip')) && (
                  <button
                      onClick={(e) => { e.stopPropagation(); onFlip && onFlip(e); }}
                      className="absolute top-4 left-1/2 -translate-x-1/2 z-20 p-1 bg-black/50 hover:bg-black/80 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Flip Card"
                  >
                      {card.faceUp ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
              )}

              {/* Card name - position based on cardNamePosition setting */}
              {card.faceUp && cardNamePosition !== 'none' && (
                  <div className={`absolute inset-x-0 bg-black/60 p-0.5 h-[12.5%] flex items-center justify-center z-10 ${
                    cardNamePosition === 'top' ? 'top-0' : 'bottom-0'
                  }`}>
                      <p className="text-[10px] text-white truncate text-center font-medium w-full">{card.name}</p>
                  </div>
              )}
          </div>
      </div>
      </div>
  );

  return (
    skipTooltip ? cardContent : (
      <Tooltip
        text={card.tooltipText}
        showImage={card.showTooltipImage}
        imageSrc={card.content}
        scale={card.tooltipScale}
      >
        {cardContent}
      </Tooltip>
    )
  );
};

// Memoize Card component to prevent unnecessary re-renders
// Only re-render when props actually change
export default React.memo(Card, (prevProps, nextProps) => {
  return (
    prevProps.card.id === nextProps.card.id &&
    prevProps.card.faceUp === nextProps.card.faceUp &&
    prevProps.card.rotation === nextProps.card.rotation &&
    prevProps.card.location === nextProps.card.location &&
    prevProps.card.hidden === nextProps.card.hidden &&
    prevProps.isHovered === nextProps.isHovered &&
    prevProps.showActionButtons === nextProps.showActionButtons &&
    prevProps.overrideWidth === nextProps.overrideWidth &&
    prevProps.overrideHeight === nextProps.overrideHeight &&
    prevProps.disablePointerEvents === nextProps.disablePointerEvents
  );
});
