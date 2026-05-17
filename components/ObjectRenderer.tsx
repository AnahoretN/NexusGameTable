import React, { memo, useMemo, useCallback } from 'react';
import { Card, Token, Counter, ItemType, TableObject, TokenShape, ContextAction } from '../types';
import { SvgTokenShape } from './SvgTokenShape';
import { Trash2, Copy, RefreshCw, RotateCw, ChevronsUpDown, Eye, EyeOff, ArrowUp, ArrowDown, Lock, Unlock, Shuffle, Search, Hand, Pin, Undo } from 'lucide-react';
import { getCardSettings } from '../utils/cardUtils';
import { executeActionButtonUniversal } from '../utils/actionButtonsHandler';
import { logger } from '../utils/logger';
import { LazyBackgroundImage } from './LazyImage';
import { EffectTemplateRendererMemo } from './EffectTemplateRenderer';

interface ObjectRendererProps {
  obj: TableObject;
  pixelsPerVU: number;
  isDragging?: boolean;
  onMouseDown?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
  className?: string;
  isGM?: boolean;
  showTokenName?: boolean;
  dispatch?: (action: any) => void;
  allObjects?: Record<string, TableObject>;
  setDeleteCandidateId?: (id: string | null) => void;
  setSearchModalDeck?: (deck: any) => void;
  setTopDeckModalDeck?: (deck: any) => void;
  animateDiceRoll?: (dice: any) => void;
  activePlayerId?: string;
  players?: any[];
}

export const ObjectRenderer: React.FC<ObjectRendererProps> = (props) => {
  const {
    obj,
    pixelsPerVU,
    isDragging = false,
    onMouseDown,
    onContextMenu,
    style = {},
    className = '',
    isGM = false,
    showTokenName = false,
    dispatch,
    allObjects = {},
    setDeleteCandidateId,
    setSearchModalDeck,
    setTopDeckModalDeck,
    animateDiceRoll,
    activePlayerId
  } = props;

  const players = props.players || [];
  const rotation = obj.rotation || 0;
  // When dragging, use very high z-index to appear above everything
  // Otherwise use original object's z-index to maintain layer position
  const zIndex = isDragging ? 999999 : (obj.zIndex || 1000);

  // Optimized event handlers to prevent unnecessary re-renders
  const handleObjectMouseDown = useCallback((e: React.MouseEvent) => {
    // Ignore clicks on action buttons
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }
    onMouseDown?.(e);
  }, [onMouseDown]);

  const handleActionButtonClick = useCallback((e: React.MouseEvent, action: () => void) => {
    e.stopPropagation();
    e.preventDefault();
    action();
  }, []);

  if (obj.type === ItemType.CARD) {
    const card = obj as Card;
    const cardWidth = (card.width || 100) * pixelsPerVU;
    const cardHeight = (card.height || 140) * pixelsPerVU;

    // Get card settings from deck (actionButtons are configured at deck level)
    const cardSettings = getCardSettings(card, allObjects);
    const actionButtons = cardSettings.cardActionButtons;

    // Get deck for sprite config
    const deck = card.deckId ? (allObjects[card.deckId] as any) : null;
    const deckSpriteConfig = deck?.spriteConfig;

    // Calculate background styles for card face/back
    const getBackgroundStyles = () => {
      if (card.faceUp) {
        // Show card face
        if (card.spriteUrl && card.spriteColumns && card.spriteRows && card.spriteIndex !== undefined) {
          const col = card.spriteIndex % card.spriteColumns;
          const row = Math.floor(card.spriteIndex / card.spriteColumns);
          const colPercent = card.spriteColumns > 1 ? (col / (card.spriteColumns - 1)) * 100 : 0;
          const rowPercent = card.spriteRows > 1 ? (row / (card.spriteRows - 1)) * 100 : 0;

          return {
            backgroundImage: `url(${card.spriteUrl})`,
            backgroundSize: `${card.spriteColumns * 100}% ${card.spriteRows * 100}%`,
            backgroundPosition: `${colPercent}% ${rowPercent}%`,
            backgroundRepeat: 'no-repeat',
            imageRendering: 'pixelated' as const
          };
        } else if (card.content) {
          return {
            backgroundImage: `url(${card.content})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          };
        }
        return {};
      } else {
        // Show card back
        // Check for alternative back first
        const altBack = (card as any).alternativeBack;
        if (altBack?.url) {
          const locationMatch = !altBack.locations || altBack.locations.length === 0 || altBack.locations?.includes(card.location as any);
          if (locationMatch) {
            // Check if alternative back has sprite properties
            if (altBack.columns && altBack.rows && altBack.index !== undefined) {
              const col = altBack.index % altBack.columns;
              const row = Math.floor(altBack.index / altBack.columns);
              const colPercent = altBack.columns > 1 ? (col / (altBack.columns - 1)) * 100 : 0;
              const rowPercent = altBack.rows > 1 ? (row / (altBack.rows - 1)) * 100 : 0;

              return {
                backgroundImage: `url(${altBack.url})`,
                backgroundSize: `${altBack.columns * 100}% ${altBack.rows * 100}%`,
                backgroundPosition: `${colPercent}% ${rowPercent}%`,
                backgroundRepeat: 'no-repeat',
                imageRendering: 'pixelated' as const
              };
            } else {
              return {
                backgroundImage: `url(${altBack.url})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center'
              };
            }
          }
        }

        // Check for custom sprite back from deck
        if (deckSpriteConfig?.cardBackSpriteUrl && deckSpriteConfig.cardBackSpriteIndex !== undefined) {
          const idx = deckSpriteConfig.cardBackSpriteIndex;
          const cols = deckSpriteConfig.cardBackSpriteColumns;
          const rows = deckSpriteConfig.cardBackSpriteRows;

          if (cols && rows) {
            const col = idx % cols;
            const row = Math.floor(idx / cols);
            const colPercent = cols > 1 ? (col / (cols - 1)) * 100 : 0;
            const rowPercent = rows > 1 ? (row / (rows - 1)) * 100 : 0;

            return {
              backgroundImage: `url(${deckSpriteConfig.cardBackSpriteUrl})`,
              backgroundSize: `${cols * 100}% ${rows * 100}%`,
              backgroundPosition: `${colPercent}% ${rowPercent}%`,
              backgroundRepeat: 'no-repeat',
              imageRendering: 'pixelated' as const
            };
          } else {
            return {
              backgroundImage: `url(${deckSpriteConfig.cardBackSpriteUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            };
          }
        }

        // Default pattern
        return {
          backgroundImage: 'repeating-linear-gradient(45deg, #1e293b 0, #1e293b 10px, #0f172a 10px, #0f172a 20px)',
          backgroundSize: 'auto',
          backgroundPosition: 'center'
        };
      }
    };

    const backgroundStyles = getBackgroundStyles();

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
          className={`bg-slate-700 border border-slate-600 rounded shadow-lg relative ${className}`}
          onMouseDown={handleObjectMouseDown}
          onContextMenu={onContextMenu}
        >
          {card.faceUp ? (
            <div className="w-full h-full rounded overflow-hidden">
              {card.spriteUrl && card.spriteColumns && card.spriteRows && card.spriteIndex !== undefined ? (
                <LazyBackgroundImage
                  src={card.spriteUrl}
                  className="w-full h-full"
                  style={{
                    backgroundSize: `${card.spriteColumns * 100}% ${card.spriteRows * 100}%`,
                    backgroundPosition: `${((card.spriteIndex % card.spriteColumns) / (card.spriteColumns - 1)) * 100}% ${(Math.floor(card.spriteIndex / card.spriteColumns) / (card.spriteRows - 1)) * 100}%`,
                    backgroundRepeat: 'no-repeat',
                    imageRendering: 'pixelated'
                  }}
                  rootMargin="100px"
                  threshold={0.01}
                />
              ) : card.content ? (
                <LazyBackgroundImage
                  src={card.content}
                  className="w-full h-full"
                  style={{
                    backgroundSize: 'cover',
                    backgroundPosition: 'center'
                  }}
                  rootMargin="100px"
                  threshold={0.01}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white text-xs p-1">
                  {card.name}
                </div>
              )}
            </div>
          ) : (
            <LazyBackgroundImage
              src={backgroundStyles.backgroundImage?.replace(/url\(['"]?([^'"]+)['"]?\)/, '$1') || ''}
              className="w-full h-full rounded flex items-center justify-center"
              style={{
                backgroundSize: backgroundStyles.backgroundSize,
                backgroundPosition: backgroundStyles.backgroundPosition,
                backgroundRepeat: backgroundStyles.backgroundRepeat
              }}
              rootMargin="100px"
              threshold={0.01}
            >
              {/* Decorative element for card back */}
              <div className="w-8 h-8 rounded-full border-2 border-slate-600 opacity-50"></div>
            </LazyBackgroundImage>
          )}

          {/* Action buttons for cards - positioned relative to card */}
          {actionButtons && actionButtons.length > 0 && dispatch && (
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 z-20 pointer-events-none">
              {actionButtons.map((action) => {
                const buttonConfig = getActionButtonConfig(action, obj, dispatch, setDeleteCandidateId, setSearchModalDeck, setTopDeckModalDeck, animateDiceRoll, activePlayerId, allObjects, players);
                if (!buttonConfig) {
                  return null;
                }
                return (
                  <button
                    key={action}
                    onClick={(e) => handleActionButtonClick(e, buttonConfig.action)}
                    className={`${buttonConfig.className} pointer-events-auto p-2 rounded-lg`}
                    title={buttonConfig.title}
                  >
                    {buttonConfig.icon}
                  </button>
                );
              })}
            </div>
          )}
        </div>
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
          className="relative"
          onMouseDown={(e) => {
            // Ignore clicks on action buttons
            if ((e.target as HTMLElement).closest('button')) {
              return;
            }
            onMouseDown?.(e);
          }}
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
            borderColor={token.borderColor || '#ffffff'}
            opacity={token.opacity ?? 100}
            borderOpacity={token.borderOpacity ?? 100}
            showThickness={true}
            tokenName={showTokenName ? token.name : undefined}
            fontColor={token.fontColor || '#ffffff'}
            pixelsPerVU={pixelsPerVU}
          />

          {/* Action buttons for tokens - positioned relative to token */}
          {obj.actionButtons && obj.actionButtons.length > 0 && dispatch && (
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 z-20 pointer-events-none">
              {obj.actionButtons.map((action) => {
                const buttonConfig = getActionButtonConfig(action, obj, dispatch, setDeleteCandidateId, setSearchModalDeck, setTopDeckModalDeck, animateDiceRoll, activePlayerId, allObjects, players);
                return buttonConfig ? (
                  <button
                    key={action}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      buttonConfig.action();
                    }}
                    className={`${buttonConfig.className} pointer-events-auto p-2 rounded-lg`}
                    title={buttonConfig.title}
                  >
                    {buttonConfig.icon}
                  </button>
                ) : null;
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (obj.type === ItemType.COUNTER) {
    const counter = obj as Counter;
    const counterWidth = (counter.width || 100) * pixelsPerVU;
    const counterHeight = (counter.height || 60) * pixelsPerVU;

    return (
      <div className="group relative">
        <div
          data-object-id={obj.id}
          style={{
            position: 'absolute',
            width: counterWidth,
            height: counterHeight,
            transform: `rotate(${rotation}deg)`,
            transformOrigin: 'center center',
            zIndex,
            cursor: isDragging ? 'grabbing' : 'grab',
            ...style
          }}
          className="relative"
          onMouseDown={(e) => {
            if ((e.target as HTMLElement).closest('button')) {
              return;
            }
            onMouseDown?.(e);
          }}
          onContextMenu={onContextMenu}
        >
          <div
            className="w-full h-full rounded-lg flex flex-col items-center justify-center shadow-lg"
            style={{
              backgroundColor: counter.color || '#10b981',
              border: '2px solid rgba(255,255,255,0.3)'
            }}
          >
            {counter.name && (
              <div className="text-xs font-medium text-white/90 mb-1 px-2 truncate max-w-full">
                {counter.name}
              </div>
            )}
            <div className="text-2xl font-bold text-white">
              {counter.value}
            </div>
          </div>

          {/* Action buttons for counters */}
          {obj.actionButtons && obj.actionButtons.length > 0 && dispatch && (
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 z-20 pointer-events-none">
              {obj.actionButtons.map((action) => {
                const buttonConfig = getActionButtonConfig(action, obj, dispatch, setDeleteCandidateId, setSearchModalDeck, setTopDeckModalDeck, animateDiceRoll, activePlayerId, allObjects, players);
                return buttonConfig ? (
                  <button
                    key={action}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      buttonConfig.action();
                    }}
                    className={`${buttonConfig.className} pointer-events-auto p-2 rounded-lg`}
                    title={buttonConfig.title}
                  >
                    {buttonConfig.icon}
                  </button>
                ) : null;
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (obj.type === ItemType.EFFECT_TEMPLATE) {
    return <EffectTemplateRendererMemo {...props} obj={obj} />;
  }

  return null;
};

/**
 * Get action button configuration for a given action
 * Uses universal action handler that works for both pool panels and main tabletop
 */
function getActionButtonConfig(
  action: ContextAction,
  obj: TableObject,
  dispatch: any,
  setDeleteCandidateId?: (id: string | null) => void,
  setSearchModalDeck?: (deck: any) => void,
  setTopDeckModalDeck?: (deck: any) => void,
  animateDiceRoll?: (dice: any) => void,
  activePlayerId?: string,
  allObjects?: Record<string, TableObject>,
  players?: any[]
) {
  // Determine flip icon based on card state
  const flipIcon = obj.type === ItemType.CARD && (obj as Card).faceUp
    ? <EyeOff size={14} />
    : <Eye size={14} />;

  // Determine lock icon based on lock state
  const lockIcon = obj.locked
    ? <Unlock size={14} />
    : <Lock size={14} />;

  // Universal action handler
  const handleAction = (actionName: string) => {
    return () => {
      executeActionButtonUniversal(obj, actionName, {
        dispatch,
        setDeleteCandidateId,
        setSearchModalDeck,
        setTopDeckModalDeck,
        animateDiceRoll,
        activePlayerId,
        objects: allObjects,
        state: { objects: allObjects, activePlayerId, players }
      });
    };
  };

  const configs: Record<string, { className: string; title: string; icon: React.ReactNode; action: () => void }> = {
    // Basic card/token actions
    flip: {
      className: 'bg-purple-600 hover:bg-purple-500 shadow',
      title: 'Flip',
      icon: flipIcon,
      action: handleAction('flip')
    },
    rotate: {
      className: 'bg-green-600 hover:bg-green-500 shadow',
      title: 'Rotate',
      icon: <RefreshCw size={14} />,
      action: handleAction('rotate')
    },
    rotateClockwise: {
      className: 'bg-yellow-600 hover:bg-yellow-500 shadow',
      title: 'Rotate CW',
      icon: <RotateCw size={14} />,
      action: handleAction('rotateClockwise')
    },
    rotateCounterClockwise: {
      className: 'bg-yellow-600 hover:bg-yellow-500 shadow',
      title: 'Rotate CCW',
      icon: <RotateCw size={14} style={{ transform: 'scaleX(-1)' }} />,
      action: handleAction('rotateCounterClockwise')
    },
    swingClockwise: {
      className: 'bg-orange-600 hover:bg-orange-500 shadow',
      title: 'Swing CW',
      icon: <RefreshCw size={14} />,
      action: handleAction('swingClockwise')
    },
    swingCounterClockwise: {
      className: 'bg-orange-600 hover:bg-orange-500 shadow',
      title: 'Swing CCW',
      icon: <RefreshCw size={14} style={{ transform: 'scaleX(-1)' }} />,
      action: handleAction('swingCounterClockwise')
    },
    delete: {
      className: 'bg-red-600 hover:bg-red-500 shadow',
      title: 'Delete',
      icon: <Trash2 size={14} />,
      action: handleAction('delete')
    },
    destroy: {
      className: 'bg-red-700 hover:bg-red-600 shadow',
      title: 'Destroy',
      icon: <Trash2 size={14} />,
      action: handleAction('delete')
    },
    clone: {
      className: 'bg-cyan-600 hover:bg-cyan-500 shadow',
      title: 'Clone',
      icon: <Copy size={14} />,
      action: handleAction('clone')
    },
    lock: {
      className: obj.locked ? 'bg-yellow-500 hover:bg-yellow-400' : 'bg-yellow-600 hover:bg-yellow-500',
      title: obj.locked ? 'Unlock' : 'Lock',
      icon: lockIcon,
      action: handleAction('lock')
    },
    pin: {
      className: 'bg-pink-600 hover:bg-pink-500 shadow',
      title: obj.isPinnedToViewport ? 'Unpin' : 'Pin',
      icon: <Pin size={14} />,
      action: handleAction('pin')
    },
    // Layer actions
    bringToFront: {
      className: 'bg-indigo-600 hover:bg-indigo-500 shadow',
      title: 'Front',
      icon: <ChevronsUpDown size={14} />,
      action: handleAction('bringToFront')
    },
    sendToBack: {
      className: 'bg-indigo-600 hover:bg-indigo-500 shadow',
      title: 'Back',
      icon: <ChevronsUpDown size={14} style={{ transform: 'rotate(180deg)' }} />,
      action: handleAction('sendToBack')
    },
    layerUp: {
      className: 'bg-blue-600 hover:bg-blue-500 shadow',
      title: 'Layer Up',
      icon: <ArrowUp size={14} />,
      action: handleAction('layerUp')
    },
    layerDown: {
      className: 'bg-blue-600 hover:bg-blue-500 shadow',
      title: 'Layer Down',
      icon: <ArrowDown size={14} />,
      action: handleAction('layerDown')
    },
    hide: {
      className: 'bg-slate-600 hover:bg-slate-500 shadow',
      title: 'Hide',
      icon: <EyeOff size={14} />,
      action: handleAction('hide')
    },
    // Deck actions
    shuffleDeck: {
      className: 'bg-purple-600 hover:bg-purple-500 shadow',
      title: 'Shuffle',
      icon: <Shuffle size={14} />,
      action: handleAction('shuffleDeck')
    },
    searchDeck: {
      className: 'bg-cyan-600 hover:bg-cyan-500 shadow',
      title: 'Search',
      icon: <Search size={14} />,
      action: handleAction('searchDeck')
    },
    topDeck: {
      className: 'bg-orange-600 hover:bg-orange-500 shadow',
      title: 'Top Deck',
      icon: <Search size={14} />,
      action: handleAction('topDeck')
    },
    // Card-specific actions
    mill: {
      className: 'bg-teal-600 hover:bg-teal-500 shadow',
      title: 'Mill',
      icon: <Undo size={14} />,
      action: handleAction('mill')
    },
    moveToHand: {
      className: 'bg-blue-600 hover:bg-blue-500 shadow',
      title: 'To Hand',
      icon: <Hand size={14} />,
      action: handleAction('moveToHand')
    },
    moveToTopDeck: {
      className: 'bg-orange-600 hover:bg-orange-500 shadow',
      title: 'To Top',
      icon: <ArrowUp size={14} />,
      action: handleAction('moveToTopDeck')
    },
    moveToBottomDeck: {
      className: 'bg-yellow-600 hover:bg-yellow-500 shadow',
      title: 'To Bottom',
      icon: <ArrowDown size={14} />,
      action: handleAction('moveToBottomDeck')
    },
    toBottom: {
      className: 'bg-yellow-500 hover:bg-yellow-400 shadow',
      title: 'To Bottom',
      icon: <ArrowDown size={14} style={{ transform: 'rotate(180deg)' }} />,
      action: handleAction('toBottom')
    },
    millToBottom: {
      className: 'bg-teal-600 hover:bg-teal-500 shadow',
      title: 'Mill to Bottom',
      icon: <Undo size={14} style={{ transform: 'rotate(180deg)' }} />,
      action: handleAction('millToBottom')
    }
  };

  const config = configs[action];
  if (!config) {
    return null;
  }
  return config;
}

// Optimized memoized ObjectRenderer to prevent unnecessary re-renders
export const ObjectRendererMemo = memo(ObjectRenderer, (prevProps, nextProps) => {
  // Quick ID check first
  if (prevProps.obj.id !== nextProps.obj.id) return false;

  // Compare critical properties that affect rendering
  const prevObj = prevProps.obj;
  const nextObj = nextProps.obj;

  // Position and transform
  if (prevObj.x !== nextObj.x) return false;
  if (prevObj.y !== nextObj.y) return false;
  if (prevObj.rotation !== nextObj.rotation) return false;
  if (prevObj.width !== nextObj.width) return false;
  if (prevObj.height !== nextObj.height) return false;

  // Visual properties
  if ('content' in prevObj && 'content' in nextObj && prevObj.content !== nextObj.content) return false;
  if ('isOnTable' in prevObj && 'isOnTable' in nextObj && prevObj.isOnTable !== nextObj.isOnTable) return false;
  if (prevObj.locked !== nextObj.locked) return false;

  // Card-specific properties
  if (prevObj.type === ItemType.CARD && nextObj.type === ItemType.CARD) {
    const prevCard = prevObj as Card;
    const nextCard = nextObj as Card;

    if (prevCard.faceUp !== nextCard.faceUp) return false;
    if (prevCard.spriteUrl !== nextCard.spriteUrl) return false;
    if (prevCard.spriteIndex !== nextCard.spriteIndex) return false;
    if (prevCard.spriteColumns !== nextCard.spriteColumns) return false;
    if (prevCard.spriteRows !== nextCard.spriteRows) return false;
    if (prevCard.frontFaceUrl !== nextCard.frontFaceUrl) return false;
    if (prevCard.alternativeBack?.url !== nextCard.alternativeBack?.url) return false;
  }

  // Token-specific properties
  if (prevObj.type === ItemType.TOKEN && nextObj.type === ItemType.TOKEN) {
    const prevToken = prevObj as Token;
    const nextToken = nextObj as Token;

    if (prevToken.color !== nextToken.color) return false;
    if (prevToken.borderColor !== nextToken.borderColor) return false;
    if (prevToken.borderWidth !== nextToken.borderWidth) return false;
    if (prevToken.opacity !== nextToken.opacity) return false;
    if (prevToken.borderOpacity !== nextToken.borderOpacity) return false;
    if (prevToken.fontColor !== nextToken.fontColor) return false;
  }

  // Rendering props
  if (prevProps.pixelsPerVU !== nextProps.pixelsPerVU) return false;
  if (prevProps.isDragging !== nextProps.isDragging) return false;
  if (prevProps.isGM !== nextProps.isGM) return false;
  if (prevProps.showTokenName !== nextProps.showTokenName) return false;

  // All props are equal, no re-render needed
  return true;
});

ObjectRendererMemo.displayName = 'ObjectRendererMemo';
