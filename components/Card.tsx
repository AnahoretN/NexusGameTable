
import React from 'react';
import { Card as CardType, CardShape, CardOrientation, ContextAction, CardNamePosition, CardSpriteConfig, AppLanguage } from '../types';
import { Layers, Hand, Eye, EyeOff } from 'lucide-react';
import { Tooltip } from './Tooltip';
import { getCardButtonConfig, ButtonAction, CardButtonConfig } from '../utils/buttonConfig';
import { isGeometricCardShape } from '../utils/shapeUtils';
import { SvgDeckShape, shouldUseSvgForDeck } from './SvgDeckShape';

interface CardProps {
  card: CardType;
  onClick?: () => void;
  onFlip?: (e: React.MouseEvent) => void;
  isHovered?: boolean;
  canFlip?: boolean;
  showActionButtons?: boolean;
  currentTool?: string; // Add currentTool to handle zoom tool visibility
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
  // Sprite config from deck (for custom card back support)
  deckSpriteConfig?: CardSpriteConfig;
  // Tooltip settings from deck (inherited, can be overridden by card's own settings)
  deckShowTooltipImage?: boolean;
  deckTooltipScale?: number;
  // Whether the current user should see the card face (for alternative back logic)
  shouldSeeCardFace?: boolean;
  // Language for translations
  language?: AppLanguage;
}

export const Card: React.FC<CardProps> = ({ card, onClick, onFlip, isHovered, canFlip, showActionButtons, onToHand, onReturnToDeck, actionButtons, onActionButtonClick, overrideWidth, overrideHeight, cardWidth, cardHeight, cardNamePosition, cardOrientation, disableRotationTransform, disablePointerEvents, skipTooltip, deckSpriteConfig, deckShowTooltipImage, deckTooltipScale, shouldSeeCardFace = true, language = 'en' }) => {
  const shape = card.shape || CardShape.POKER;
  const orientation = cardOrientation ?? CardOrientation.VERTICAL;

  // Determine display dimensions - orientation does NOT affect dimensions
  // 1. overrideWidth/overrideHeight (for hand scaling)
  // 2. card.width/card.height (individual card's own settings - this is PRIMARY)
  // 3. cardWidth/cardHeight (from deck settings - fallback only)
  // 4. Default to 100x100 if none specified
  const displayWidth = overrideWidth ?? card.width ?? cardWidth ?? 100;
  const displayHeight = overrideHeight ?? card.height ?? cardHeight ?? 100;

  // Calculate aspect ratio for tooltip (width/height)
  const aspectRatio = displayWidth / displayHeight;

  // Memoized sprite background styles calculation to avoid duplication
  // This is computed once and reused in both geometric and non-geometric rendering paths
  const spriteBackgroundStyles = React.useMemo(() => {
    const getBackgroundImage = (): string | undefined => {
      if (card.faceUp) {
        // Check if this is a text card with useSpriteSheet disabled
        const textCardsStyle = (card as any).textCardsStyle;
        if (textCardsStyle && textCardsStyle.useSpriteSheet === false) {
          // Don't use sprite sheet, use background color only
          return undefined;
        }

        // Use card's spriteUrl, or deck's spriteConfig spriteUrl, or card's content
        const spriteUrl = card.spriteUrl || deckSpriteConfig?.spriteUrl || card.content;
        return spriteUrl ? `url(${spriteUrl})` : undefined;
      }
      // Card is face down - check for alternative back first
      const altBack = (card as any).alternativeBack;
      if (altBack?.url) {
        // Check if location matches (if locations array is empty or undefined, show everywhere)
        const locationMatch = !altBack.locations || altBack.locations.length === 0 || altBack.locations?.includes(card.location as any);
        // Check if current user should see it (if visibleToOthers is false, only show to those who can see card face)
        const shouldShow = altBack.visibleToOthers || shouldSeeCardFace;
        if (locationMatch && shouldShow) {
          return `url(${altBack.url})`;
        }
      }
      // Card is face down - check for custom sprite back (from "Set as Card Back" function)
      if (deckSpriteConfig?.cardBackSpriteUrl && deckSpriteConfig.cardBackSpriteIndex !== undefined) {
        return `url(${deckSpriteConfig.cardBackSpriteUrl})`;
      }
      // Card is face down - check for simple card back URL from deck settings
      if (deckSpriteConfig?.cardBackUrl) {
        return `url(${deckSpriteConfig.cardBackUrl})`;
      }
      // Default pattern
      return 'repeating-linear-gradient(45deg, #1e293b 0, #1e293b 10px, #0f172a 10px, #0f172a 20px)';
    };

    const getBackgroundSize = (): string => {
      // Use card's sprite dimensions or fall back to deck's spriteConfig
      const spriteCols = card.spriteColumns || deckSpriteConfig?.columns;
      const spriteRows = card.spriteRows || deckSpriteConfig?.rows;
      const hasSpriteUrl = card.spriteUrl || deckSpriteConfig?.spriteUrl;

      if (card.faceUp && hasSpriteUrl && spriteCols && spriteRows) {
        return `${spriteCols * 100}% ${spriteRows * 100}%`;
      }
      if (!card.faceUp && deckSpriteConfig?.cardBackSpriteUrl && deckSpriteConfig.cardBackSpriteColumns && deckSpriteConfig.cardBackSpriteRows) {
        return `${deckSpriteConfig.cardBackSpriteColumns * 100}% ${deckSpriteConfig.cardBackSpriteRows * 100}%`;
      }
      return '100% 100%'; // Stretch to fill entire shape
    };

    const getBackgroundPosition = (): string => {
      // Use card's sprite index or fall back to deck's spriteConfig
      const spriteIdx = card.spriteIndex !== undefined ? card.spriteIndex : deckSpriteConfig?.spriteIndex;
      const spriteCols = card.spriteColumns || deckSpriteConfig?.columns;
      const spriteRows = card.spriteRows || deckSpriteConfig?.rows;
      const hasSpriteUrl = card.spriteUrl || deckSpriteConfig?.spriteUrl;

      if (card.faceUp && hasSpriteUrl && spriteIdx !== undefined && spriteCols && spriteRows) {
        const col = spriteIdx % spriteCols;
        const row = Math.floor(spriteIdx / spriteCols);
        const colPercent = spriteCols > 1 ? (col / (spriteCols - 1)) * 100 : 0;
        const rowPercent = spriteRows > 1 ? (row / (spriteRows - 1)) * 100 : 0;
        return `${colPercent}% ${rowPercent}%`;
      }
      if (!card.faceUp && deckSpriteConfig?.cardBackSpriteUrl && deckSpriteConfig.cardBackSpriteIndex !== undefined && deckSpriteConfig.cardBackSpriteColumns && deckSpriteConfig.cardBackSpriteRows) {
        const idx = deckSpriteConfig.cardBackSpriteIndex;
        const cols = deckSpriteConfig.cardBackSpriteColumns;
        const rows = deckSpriteConfig.cardBackSpriteRows;
        return `${(idx % cols) * (100 / (cols - 1 || 1))}% ${Math.floor(idx / cols) * (100 / ((rows || 1) - 1 || 1))}%`;
      }
      return 'center';
    };

    return {
      backgroundImage: getBackgroundImage(),
      backgroundSize: getBackgroundSize(),
      backgroundPosition: getBackgroundPosition(),
    };
  }, [card.faceUp, card.spriteUrl, card.spriteIndex, card.spriteColumns, card.spriteRows, card.content, card.location, (card as any).alternativeBack, deckSpriteConfig, shouldSeeCardFace]);

  // Memoized text cards styles calculation
  const textCardsStyles = React.useMemo(() => {
    const textCardsStyle = (card as any).textCardsStyle;
    if (!textCardsStyle) return null;

    return {
      backgroundColor: textCardsStyle.backgroundColor || '#ffffff',
      color: textCardsStyle.textColor || '#000000',
      fontSize: textCardsStyle.fontSize || '14px',
    };
  }, [(card as any).textCardsStyle]);

  // Define button configurations for cards using shared utility
  const getCardButtonConfigs = (): CardButtonConfig[] => {
    const buttons = actionButtons || [];
    return buttons
      .filter(action => {
        // Don't show "Move to Hand" button when card is already in HAND location
        if (action === 'moveToHand' && card.location === 'HAND') {
          return false;
        }
        return true;
      })
      .map(action => getCardButtonConfig(action as ButtonAction, card.faceUp, card.locked, language))
      .filter((config): config is CardButtonConfig => config !== null)
      .slice(0, 4);
  };

  const renderActionButtons = () => {
    // If actionButtons are provided and non-empty, use that setting
    const hasActionButtons = actionButtons && actionButtons.length > 0;

    if (hasActionButtons && onActionButtonClick) {
      const buttons = getCardButtonConfigs();
      return (
        <>
          {buttons.map(btn => (
            <button
              key={btn.action}
              onClick={(e) => { e.stopPropagation(); onActionButtonClick(btn.action); }}
              onMouseDown={(e) => e.stopPropagation()}
              className={`pointer-events-auto p-2 rounded-lg text-white shadow ${btn.className}`}
              title={btn.title}
            >
              {btn.icon}
            </button>
          ))}
        </>
      );
    }

    // Fallback to legacy button props for backward compatibility
    // ONLY show legacy buttons when actionButtons is NOT provided (undefined)
    // If actionButtons is explicitly set (even to empty array), respect that setting
    if (actionButtons === undefined) {
      return (
        <>
          {onToHand && (
            <button
              onClick={(e) => { e.stopPropagation(); onToHand(e); }}
              onMouseDown={(e) => e.stopPropagation()}
              className="pointer-events-auto p-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white shadow"
              title="To Hand"
            >
              <Hand size={14} />
            </button>
          )}
          {onFlip && (
            <button
              onClick={(e) => { e.stopPropagation(); onFlip(e); }}
              onMouseDown={(e) => e.stopPropagation()}
              className="pointer-events-auto p-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-white shadow"
              title="Flip"
            >
              {card.faceUp ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          )}
          {onReturnToDeck && (
            <button
              onClick={(e) => { e.stopPropagation(); onReturnToDeck(e); }}
              onMouseDown={(e) => e.stopPropagation()}
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

  const isGeometric = isGeometricCardShape(shape);

  // Calculate transform for card rotation
  const getCardTransform = (disableRotation: boolean | undefined, cardRotation: number) => {
    const transforms: string[] = [];

    // Apply card's rotation property (custom rotation from rotate actions)
    if (!disableRotation && cardRotation) {
      transforms.push(`rotate(${cardRotation}deg)`);
    }

    // Note: For all cards, orientation affects dimensions (width/height) but NOT rotation
    // The sprite/image is never rotated - only the container dimensions change

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
          // Geometric shapes use clip-path instead of rotation
          // Plus the card's own rotation property for custom rotation
          transform: getCardTransform(disableRotationTransform, card.rotation),
          // Drop shadow for depth
          filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.3))',
          // Disable pointer events when dragging in cursor slot to allow mouse events to pass through to decks/piles
          pointerEvents: disablePointerEvents ? 'none' : 'auto',
        }}
      >
          {/* For geometric shapes, use SVG wrapper for proper clipping and border */}
          {isGeometric && shouldUseSvgForDeck(shape) ? (
            <SvgDeckShape
              shape={shape}
              width={displayWidth}
              height={displayHeight}
              backgroundColor={card.faceUp ? (textCardsStyles?.backgroundColor || 'white') : '#1e293b'}
              borderColor={isHovered ? '#facc15' : '#374151'}
              borderWidth={2}
              orientation={orientation}
            >
              <div
                style={{ width: '100%', height: '100%', position: 'relative', ...(textCardsStyles || spriteBackgroundStyles) }}
              >
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
                    onMouseDown={(e) => e.stopPropagation()}
                    className="absolute top-4 left-1/2 -translate-x-1/2 z-20 p-1 bg-black/50 hover:bg-black/80 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Flip Card"
                  >
                    {card.faceUp ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                )}

                {/* Card name - position based on cardNamePosition setting */}
                {card.faceUp && cardNamePosition !== 'none' && !card.showTextOnCard && (
                  <div className={`absolute inset-x-0 bg-black/60 p-0.5 h-[12.5%] flex items-center justify-center z-10 ${
                      cardNamePosition === 'top' ? 'top-0' : 'bottom-0'
                    }`}>
                      <p className="text-[10px] text-white truncate text-center font-medium w-full">{card.name}</p>
                    </div>
                  )}

                {/* Text on card display - when showTextOnCard is enabled */}
                {card.faceUp && card.showTextOnCard && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-2 z-10">
                    <div className="w-full h-full flex flex-col items-center justify-center text-center">
                      <h3
                        className="font-bold mb-1 break-words w-full"
                        style={{
                          fontSize: textCardsStyles?.fontSize || '13px',
                          color: textCardsStyles?.color || 'rgb(17 24 39)' // text-gray-900
                        }}
                      >
                        {card.name}
                      </h3>
                      <p
                        className="whitespace-pre-wrap break-words w-full overflow-auto"
                        style={{
                          maxHeight: 'calc(100% - 20px)',
                          fontSize: textCardsStyles ? `calc(${textCardsStyles.fontSize} * 0.85)` : '11px',
                          color: textCardsStyles?.color || 'rgb(17 24 39)' // text-gray-900
                        }}
                      >
                        {card.tooltipText || card.description || ''}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </SvgDeckShape>
          ) : (
            // Standard card rendering for non-geometric shapes
            <div
              className={`w-full h-full ${!isGeometric ? 'border-2 border-gray-700 rounded-lg' : ''} ${isHovered && !isGeometric ? 'ring-2 ring-yellow-400' : ''}`}
              style={{
                  backgroundColor: card.faceUp ? (textCardsStyles?.backgroundColor || 'white') : '#1e293b',
                  position: 'relative',
                  overflow: 'hidden',
              }}
            >
              {/* Inner content wrapper - handles rotation for HORIZONTAL orientation */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  ...(textCardsStyles || spriteBackgroundStyles),
              }}
          >
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
                      onMouseDown={(e) => e.stopPropagation()}
                      className="absolute top-4 left-1/2 -translate-x-1/2 z-20 p-1 bg-black/50 hover:bg-black/80 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Flip Card"
                  >
                      {card.faceUp ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
              )}

              {/* Card name - position based on cardNamePosition setting */}
              {card.faceUp && cardNamePosition !== 'none' && !card.showTextOnCard && (
                  <div className={`absolute inset-x-0 bg-black/60 p-0.5 h-[12.5%] flex items-center justify-center z-10 ${
                    cardNamePosition === 'top' ? 'top-0' : 'bottom-0'
                  }`}>
                      <p className="text-[10px] text-white truncate text-center font-medium w-full">{card.name}</p>
                  </div>
              )}

              {/* Text on card display - when showTextOnCard is enabled */}
              {card.faceUp && card.showTextOnCard && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-2 z-10">
                  <div className="w-full h-full flex flex-col items-center justify-center text-center">
                    <h3
                      className="font-bold mb-1 break-words w-full"
                      style={{
                        fontSize: textCardsStyles?.fontSize || '13px',
                        color: textCardsStyles?.color || 'rgb(17 24 39)' // text-gray-900
                      }}
                    >
                      {card.name}
                    </h3>
                    <p
                      className="whitespace-pre-wrap break-words w-full overflow-auto"
                      style={{
                        maxHeight: 'calc(100% - 20px)',
                        fontSize: textCardsStyles ? `calc(${textCardsStyles.fontSize} * 0.85)` : '11px',
                        color: textCardsStyles?.color || 'rgb(17 24 39)' // text-gray-900
                      }}
                    >
                      {card.tooltipText || card.description || ''}
                    </p>
                  </div>
                </div>
              )}
          </div>
          </div>
          )}
      </div>
      </div>
  );

  // Determine the correct image source for tooltip
  // Priority: spriteUrl (if face up with sprites) > content > card back (if face down)
  const getTooltipImageSrc = (): string | undefined => {
    if (!deckShowTooltipImage) return undefined;

    // If face up and using sprite sheet, use spriteUrl
    if (card.faceUp && card.spriteUrl) {
      return card.spriteUrl;
    }
    // If face up, use content (individual card image)
    if (card.faceUp && card.content) {
      return card.content;
    }
    // If face down and has custom card back sprite
    if (!card.faceUp && deckSpriteConfig?.cardBackSpriteUrl) {
      return deckSpriteConfig.cardBackSpriteUrl;
    }
    // If face down and has simple card back
    if (!card.faceUp && deckSpriteConfig?.cardBackUrl) {
      return deckSpriteConfig.cardBackUrl;
    }
    // Face down with default - show nothing (tooltip shows text only or nothing)
    return undefined;
  };

  return (
    skipTooltip || card.showTextOnCard ? cardContent : (
      <Tooltip
        text={card.tooltipText}
        showImage={deckShowTooltipImage && getTooltipImageSrc() !== undefined}
        imageSrc={getTooltipImageSrc() || card.content}
        scale={deckTooltipScale ?? 125}
        aspectRatio={aspectRatio}
        baseWidth={displayWidth}
        // Pass sprite info for proper tooltip positioning
        spriteIndex={card.spriteIndex}
        spriteColumns={card.spriteColumns}
        spriteRows={card.spriteRows}
      >
        {cardContent}
      </Tooltip>
    )
  );
};

// Memoize Card component to prevent unnecessary re-renders
// Only re-render when props actually change
// This optimization is critical for performance when rendering 60+ cards in SearchDeckModal
export default React.memo(Card, (prevProps, nextProps) => {
  // Quick ID check first - different cards should always re-render
  if (prevProps.card.id !== nextProps.card.id) return false;

  // Compare critical card properties that affect rendering
  const prevCard = prevProps.card;
  const nextCard = nextProps.card;

  // Visual properties that affect what the card looks like
  if (prevCard.faceUp !== nextCard.faceUp) return false;
  if (prevCard.rotation !== nextCard.rotation) return false;
  if (prevCard.hidden !== nextCard.hidden) return false;

  // Sprite-related properties (critical for sprite sheet rendering)
  if (prevCard.spriteUrl !== nextCard.spriteUrl) return false;
  if (prevCard.spriteIndex !== nextCard.spriteIndex) return false;
  if (prevCard.spriteColumns !== nextCard.spriteColumns) return false;
  if (prevCard.spriteRows !== nextCard.spriteRows) return false;

  // Content URL (fallback when sprite not used)
  if (prevCard.content !== nextCard.content) return false;

  // Alternative back card
  const prevAltBack = (prevCard as any).alternativeBack;
  const nextAltBack = (nextCard as any).alternativeBack;
  if (prevAltBack?.url !== nextAltBack?.url) return false;
  if (prevAltBack?.locations?.length !== nextAltBack?.locations?.length) return false;
  if (prevAltBack?.visibleToOthers !== nextAltBack?.visibleToOthers) return false;

  // Compare component props
  if (prevProps.isHovered !== nextProps.isHovered) return false;
  if (prevProps.showActionButtons !== nextProps.showActionButtons) return false;
  if (prevProps.overrideWidth !== nextProps.overrideWidth) return false;
  if (prevProps.overrideHeight !== nextProps.overrideHeight) return false;
  if (prevProps.disablePointerEvents !== nextProps.disablePointerEvents) return false;
  if (prevProps.shouldSeeCardFace !== nextProps.shouldSeeCardFace) return false;

  // Compare deck sprite config (affects card back rendering)
  const prevConfig = prevProps.deckSpriteConfig;
  const nextConfig = nextProps.deckSpriteConfig;
  if (prevConfig?.cardBackUrl !== nextConfig?.cardBackUrl) return false;
  if (prevConfig?.cardBackSpriteUrl !== nextConfig?.cardBackSpriteUrl) return false;
  if (prevConfig?.cardBackSpriteIndex !== nextConfig?.cardBackSpriteIndex) return false;
  if (prevConfig?.cardBackSpriteColumns !== nextConfig?.cardBackSpriteColumns) return false;
  if (prevConfig?.cardBackSpriteRows !== nextConfig?.cardBackSpriteRows) return false;

  // Compare tooltip settings
  if (prevProps.deckShowTooltipImage !== nextProps.deckShowTooltipImage) return false;
  if (prevProps.deckTooltipScale !== nextProps.deckTooltipScale) return false;

  // All compared properties are equal - skip re-render
  return true;
});
