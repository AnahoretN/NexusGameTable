
import React from 'react';
import { Card as CardType, CardShape, CardOrientation, ContextAction, CardNamePosition } from '../types';
import { Eye, EyeOff, Hand, Layers, RefreshCw, Copy, Trash2, Lock, Unlock, Search, Shuffle, Undo, ChevronRight, ArrowUp, ArrowDown } from 'lucide-react';

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
}

export const Card: React.FC<CardProps> = ({ card, onClick, onFlip, isHovered, canFlip, showActionButtons, onToHand, onReturnToDeck, actionButtons, onActionButtonClick, overrideWidth, overrideHeight, cardWidth, cardHeight, cardNamePosition, cardOrientation }) => {
  const shape = card.shape || CardShape.POKER;
  const orientation = cardOrientation ?? CardOrientation.VERTICAL;

  // Determine display dimensions - orientation does NOT affect dimensions
  // 1. overrideWidth/overrideHeight (for hand scaling)
  // 2. card.width/card.height (individual card's own settings - this is PRIMARY)
  // 3. cardWidth/cardHeight (from deck settings - fallback only)
  // 4. Default to 100x100 if none specified
  const displayWidth = overrideWidth ?? card.width ?? cardWidth ?? 100;
  const displayHeight = overrideHeight ?? card.height ?? cardHeight ?? 100;

  // Define button configurations for cards
  const getCardButtonConfigs = () => {
    const buttons = actionButtons || [];
    const configs: Partial<Record<ContextAction, { className: string; title: string; icon: React.ReactNode }>> = {
      flip: {
        className: 'bg-purple-600 hover:bg-purple-500',
        title: 'Flip',
        icon: card.faceUp ? <EyeOff size={14} /> : <Eye size={14} />
      },
      toHand: {
        className: 'bg-blue-600 hover:bg-blue-500',
        title: 'To Hand',
        icon: <Hand size={14} />
      },
      rotate: {
        className: 'bg-green-600 hover:bg-green-500',
        title: 'Rotate',
        icon: <RefreshCw size={14} />
      },
      clone: {
        className: 'bg-cyan-600 hover:bg-cyan-500',
        title: 'Clone',
        icon: <Copy size={14} />
      },
      delete: {
        className: 'bg-red-600 hover:bg-red-500',
        title: 'Delete',
        icon: <Trash2 size={14} />
      },
      lock: {
        className: 'bg-yellow-600 hover:bg-yellow-500',
        title: card.locked ? 'Unlock' : 'Lock',
        icon: card.locked ? <Unlock size={14} /> : <Lock size={14} />
      },
      layer: {
        className: 'bg-indigo-600 hover:bg-indigo-500',
        title: 'Layer',
        icon: <Layers size={14} />
      },
    };

    return buttons
      .filter(action => action in configs)
      .map(action => ({ action, ...configs[action]! }))
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

  return (
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
          // But the content stays oriented the same way - only the shape rotates
          transform: orientation === CardOrientation.HORIZONTAL ? 'rotate(-90deg)' : undefined,
          // For geometric shapes that get clipped, we use a drop-shadow filter to simulate a border/shadow
          // since the actual CSS border is clipped away.
          filter: isGeometric
              ? `drop-shadow(0 4px 4px rgba(0,0,0,0.5)) ${isHovered ? 'drop-shadow(0 0 4px #facc15)' : ''}`
              : 'drop-shadow(0 4px 6px rgba(0,0,0,0.3))',
          ...styles
        }}
      >
          <div
              className={`w-full h-full ${!isGeometric ? 'border-2 border-gray-700 rounded-lg' : ''} ${isHovered && !isGeometric ? 'ring-2 ring-yellow-400' : ''}`}
              style={{
                  backgroundColor: card.faceUp ? 'white' : '#1e293b',
                  backgroundImage: card.faceUp ? `url(${card.content})` : `repeating-linear-gradient(45deg, #1e293b 0, #1e293b 10px, #0f172a 10px, #0f172a 20px)`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
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
              {card.faceUp && !showActionButtons && cardNamePosition !== 'none' && (
                  <div className={`absolute inset-x-0 bg-black/60 p-0.5 h-[12.5%] flex items-center justify-center ${
                    cardNamePosition === 'top' ? 'top-0' : 'bottom-0'
                  }`}>
                      <p className="text-[10px] text-white truncate text-center font-medium w-full">{card.name}</p>
                  </div>
              )}
          </div>
      </div>
    </div>
  );
};
