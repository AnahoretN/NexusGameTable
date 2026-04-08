import React from 'react';
import { Card, Token, ItemType, TableObject, TokenShape, ContextAction } from '../types';
import { SvgTokenShape } from './SvgTokenShape';
import { Trash2, Copy, RefreshCw, RotateCw, ChevronsUpDown, Eye, EyeOff, ArrowUp, ArrowDown, Lock, Unlock, Shuffle, Search, Hand, Pin, Undo } from 'lucide-react';
import { getCardSettings } from '../utils/cardUtils';
import { executeActionButtonUniversal } from '../utils/actionButtonsHandler';
import { logger } from '../utils/logger';

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
}

export const ObjectRenderer: React.FC<ObjectRendererProps> = ({
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
}) => {
  const rotation = obj.rotation || 0;
  // When dragging, use very high z-index to appear above everything
  // Otherwise use original object's z-index to maintain layer position
  const zIndex = isDragging ? 999999 : (obj.zIndex || 1000);

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

    logger.log('[ObjectRenderer] Rendering CARD:', {
      cardId: obj.id,
      cardName: card.name,
      faceUp: card.faceUp,
      isGM: isGM
    });

    logger.log('[ObjectRenderer] CARD action buttons:', {
      cardId: obj.id,
      cardName: card.name,
      deckId: card.deckId,
      actionButtons: actionButtons,
      actionButtonsCount: actionButtons?.length || 0
    });

    // Log each button being rendered
    if (actionButtons && actionButtons.length > 0) {
      logger.log('[ObjectRenderer] Rendering buttons:', actionButtons);
      actionButtons.forEach(action => {
        const hasConfig = !!getActionButtonConfig(action, obj, dispatch, setDeleteCandidateId, setSearchModalDeck, setTopDeckModalDeck, animateDiceRoll, activePlayerId, allObjects);
        logger.log(`[ObjectRenderer] Button ${action}:`, hasConfig ? 'WILL RENDER' : 'MISSING CONFIG');
      });
    }

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
          onMouseDown={(e) => {
            // Ignore clicks on action buttons
            if ((e.target as HTMLElement).closest('button')) {
              return;
            }
            onMouseDown?.(e);
          }}
          onContextMenu={onContextMenu}
        >
          {card.faceUp ? (
            <div className="w-full h-full rounded overflow-hidden">
              {card.spriteUrl && card.spriteColumns && card.spriteRows && card.spriteIndex !== undefined ? (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    ...backgroundStyles
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
            <div className="w-full h-full rounded flex items-center justify-center" style={backgroundStyles}>
              {/* Decorative element for card back */}
              <div className="w-8 h-8 rounded-full border-2 border-slate-600 opacity-50"></div>
            </div>
          )}

          {/* Action buttons for cards - positioned relative to card */}
          {actionButtons && actionButtons.length > 0 && dispatch && (
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 z-20 pointer-events-none">
              {actionButtons.map((action) => {
                const buttonConfig = getActionButtonConfig(action, obj, dispatch, setDeleteCandidateId, setSearchModalDeck, setTopDeckModalDeck, animateDiceRoll, activePlayerId, allObjects);
                if (!buttonConfig) {
                  logger.log('[ObjectRenderer] No button config for action:', action);
                  return null;
                }
                return (
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
            borderColor={token.borderColor || 'white'}
            opacity={token.opacity ?? 100}
            borderOpacity={token.borderOpacity ?? 100}
            showThickness={true}
            tokenName={showTokenName ? token.name : undefined}
            fontColor={token.fontColor || 'white'}
          />

          {/* Action buttons for tokens - positioned relative to token */}
          {obj.actionButtons && obj.actionButtons.length > 0 && dispatch && (
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 z-20 pointer-events-none">
              {obj.actionButtons.map((action) => {
                const buttonConfig = getActionButtonConfig(action, obj, dispatch, setDeleteCandidateId, setSearchModalDeck, setTopDeckModalDeck, animateDiceRoll, activePlayerId, allObjects);
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
  allObjects?: Record<string, TableObject>
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
  const handleAction = (actionName: string) => () => {
    executeActionButtonUniversal(obj, actionName, {
      dispatch,
      setDeleteCandidateId,
      setSearchModalDeck,
      setTopDeckModalDeck,
      animateDiceRoll,
      activePlayerId,
      objects: allObjects
    });
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
    logger.log('[ObjectRenderer] No config for action:', action, 'available actions:', Object.keys(configs));
    return null;
  }
  return config;
}

// Memoize ObjectRenderer to prevent unnecessary re-renders
export const ObjectRendererMemo = React.memo(ObjectRenderer, (prevProps, nextProps) => {
  // Compare critical props to determine if re-render is needed
  return (
    prevProps.obj.id === nextProps.obj.id &&
    prevProps.obj.rotation === nextProps.obj.rotation &&
    prevProps.obj.type === nextProps.obj.type &&
    prevProps.obj.locked === nextProps.obj.locked &&
    prevProps.obj.isOnTable === nextProps.obj.isOnTable &&
    prevProps.pixelsPerVU === nextProps.pixelsPerVU &&
    prevProps.isDragging === nextProps.isDragging &&
    prevProps.isGM === nextProps.isGM &&
    prevProps.showTokenName === nextProps.showTokenName
  );
});
