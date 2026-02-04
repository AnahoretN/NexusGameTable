
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { TableObject, ItemType, Card, Deck, ContextAction, Deck as DeckType, CardPile } from '../types';
import { Lock, Unlock, RefreshCw, Copy, Settings, Eye, EyeOff, Layers, Trash2, ArrowUp, ArrowDown, Hand, Shuffle, Search, Undo, ChevronRight, RotateCw, Pin, ImageDown, CornerDownRight } from 'lucide-react';

interface ContextMenuProps {
  x: number;
  y: number;
  object: TableObject;
  isGM: boolean;
  onAction: (action: string) => void;
  onClose: () => void;
  allObjects: Record<string, TableObject>; // Added to access deck for card inheritance
  hideCardActions?: boolean; // Hide layer, lock, and rotate for cards
  isSearchWindow?: boolean; // Show additional GM actions in search window
}

interface MenuItem {
  label: string;
  action: string;
  icon?: JSX.Element;
  visible?: boolean;
  hasSubmenu?: boolean;
  separator?: boolean;
  submenuItems?: MenuItem[];
  isSeparator?: boolean;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, object, isGM, onAction, onClose, allObjects, hideCardActions, isSearchWindow }) => {
  const [layerSubmenuOpen, setLayerSubmenuOpen] = useState(false);
  const [rotateSubmenuOpen, setRotateSubmenuOpen] = useState(false);
  const [pilesSubmenuOpen, setPilesSubmenuOpen] = useState(false);
  const [topDeckSubmenuOpen, setTopDeckSubmenuOpen] = useState(false);
  const [moveSubmenuOpen, setMoveSubmenuOpen] = useState(false);
  const submenuRef = React.useRef<HTMLDivElement>(null);

  // Helper to get card settings from deck (cards always inherit from deck)
  const getCardSettings = (card: Card) => {
    if (card.deckId) {
      const deck = allObjects[card.deckId] as DeckType;
      if (deck && deck.type === ItemType.DECK) {
        return {
          allowedActions: deck.cardAllowedActions,
          allowedActionsForGM: deck.cardAllowedActionsForGM,
          actionButtons: deck.cardActionButtons,
          singleClickAction: deck.cardSingleClickAction,
          doubleClickAction: deck.cardDoubleClickAction,
        };
      }
    }

    // Default to no specific settings (all actions allowed)
    return {
      allowedActions: undefined,
      allowedActionsForGM: undefined,
      actionButtons: undefined,
      singleClickAction: undefined,
      doubleClickAction: undefined,
    };
  };

  // Helper to check if an action is allowed for the current user
  const can = (action: ContextAction) => {
    let allowedActions: ContextAction[] | undefined;
    let allowedActionsForGM: ContextAction[] | undefined;

    // For cards, use inherited settings from deck
    if (object.type === ItemType.CARD) {
      const cardSettings = getCardSettings(object as Card);
      allowedActions = cardSettings.allowedActions;
      allowedActionsForGM = cardSettings.allowedActionsForGM;
    } else {
      allowedActions = object.allowedActions;
      allowedActionsForGM = object.allowedActionsForGM;
    }

    if (isGM) {
      // GM: check allowedActionsForGM
      // undefined/null = all allowed, [] = none allowed, specific array = only those allowed
      return allowedActionsForGM == null || (allowedActionsForGM.length > 0 && allowedActionsForGM.includes(action));
    }
    // Player: check allowedActions
    // undefined/null = all allowed, [] = none allowed, specific array = only those allowed
    return allowedActions == null || (allowedActions.length > 0 && allowedActions.includes(action));
  };

  // Close layer submenu when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (submenuRef.current && !submenuRef.current.contains(e.target as Node)) {
        setLayerSubmenuOpen(false);
        setRotateSubmenuOpen(false);
        setPilesSubmenuOpen(false);
        setTopDeckSubmenuOpen(false);
        setMoveSubmenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // "Move to.." section for cards - defined here to be inserted early
  const moveToSection: MenuItem[] = object.type === ItemType.CARD ? (() => {
    const card = object as Card;
    const deck = card.deckId ? allObjects[card.deckId] as DeckType : null;
    const piles = deck?.piles || [];

    return [
      {
        label: 'Move to..',
        action: 'moveTo',
        icon: <CornerDownRight size={14} />,
        visible: can('moveTo') || can('moveTo') === undefined,
        hasSubmenu: true,
        separator: true,
        submenuItems: [
          {
            label: 'Hand',
            action: 'moveToHand',
            icon: <Hand size={14} />,
            visible: true
          },
          {
            label: 'Top Deck',
            action: 'moveToTopDeck',
            icon: <ArrowUp size={14} />,
            visible: !!deck
          },
          {
            label: 'Bottom Deck',
            action: 'moveToBottomDeck',
            icon: <ArrowDown size={14} />,
            visible: !!deck
          },
          ...(piles.length > 0 ? [{
            label: '-',
            action: 'separator',
            visible: true,
            isSeparator: true
          }] : []),
          ...piles.map((pile: CardPile) => ({
            label: pile.name,
            action: `moveToPile-${pile.id}`,
            icon: <Layers size={14} />,
            visible: true,
            pileId: pile.id
          }))
        ]
      }
    ];
  })() : [];

  const menuItems: MenuItem[] = [
    {
      label: 'Configure...',
      action: 'configure',
      icon: <Settings size={14} />,
      visible: isGM,
      separator: false
    },
    {
      label: 'Set as Card Back',
      action: 'setCardBack',
      icon: <ImageDown size={14} />,
      visible: isSearchWindow && isGM && object.type === ItemType.CARD,
      separator: true
    },
    // "Move to..." section for cards - before Change Layer
    ...moveToSection,
    {
      label: 'Change Layer',
      action: 'layer',
      icon: <Layers size={14} />,
      visible: can('layer'),
      hasSubmenu: true,
      separator: false
    },
    {
      label: 'Rotation',
      action: 'rotate',
      icon: <RotateCw size={14} />,
      // Hide rotation in search window and for cards in hand panel (only available in game space)
      visible: !isSearchWindow && !hideCardActions && can('rotate'),
      hasSubmenu: true,
      separator: true
    },
    // Deck-specific actions
    {
      label: 'Top Deck',
      action: 'topDeck',
      icon: <ArrowUp size={14} />,
      visible: object.type === ItemType.DECK && can('topDeck'),
      hasSubmenu: true
    },
    {
      label: 'Search',
      action: 'searchDeck',
      icon: <Search size={14} />,
      visible: object.type === ItemType.DECK && can('searchDeck')
    },
    {
      label: 'Shuffle',
      action: 'shuffleDeck',
      icon: <Shuffle size={14} />,
      visible: object.type === ItemType.DECK && can('shuffleDeck')
    },
    {
      label: 'Piles',
      action: 'piles',
      icon: <Layers size={14} />,
      visible: object.type === ItemType.DECK && can('piles') && (object as Deck).piles && (object as Deck).piles!.length > 0,
      hasSubmenu: true
    },
    {
      label: 'Return All',
      action: 'returnAll',
      icon: <Undo size={14} />,
      visible: object.type === ItemType.DECK && can('returnAll'),
      separator: true
    },
    {
      label: 'Flip',
      action: 'flip',
      icon: <Eye size={14} />,
      visible: object.type === ItemType.CARD && can('flip')
    },
    {
      label: object.locked ? 'Unlock' : 'Lock',
      action: 'lock',
      icon: object.locked ? <Unlock size={14} /> : <Lock size={14} />,
      visible: can('lock')
    },
    {
      label: object.isPinnedToViewport ? 'Unpin' : 'Pin',
      action: object.isPinnedToViewport ? 'unpinFromViewport' : 'pinToViewport',
      icon: <Pin size={14} />,
      visible: can('pin'),
      separator: true
    },
    // Remove the old "To Hand" item since it's now in "Move to.."
    {
      label: (object as Card).hidden ? 'Unhide Card' : 'Hide Card',
      action: 'toggleHide',
      icon: (object as Card).hidden ? <Eye size={14} /> : <EyeOff size={14} />,
      visible: isSearchWindow && isGM && object.type === ItemType.CARD
    },
    {
      label: 'Clone',
      action: 'clone',
      icon: <Copy size={14} />,
      visible: can('clone')
    },
    {
      label: 'Delete',
      action: 'delete',
      icon: <Trash2 size={14} />,
      visible: can('delete')
    },
  ];

  // Filter visible items
  const visibleItems = menuItems.filter(item => item.visible);
  const configureItem = visibleItems.find(i => i.action === 'configure');
  const otherItems = visibleItems.filter(i => i.action !== 'configure');
  const finalItems = configureItem ? [configureItem, ...otherItems] : otherItems;

  // Adjust position to not go off-screen (basic check)
  const style: React.CSSProperties = {
    top: y,
    left: x,
  };

  // If near right edge, shift left. If near bottom, shift up.
  if (x > window.innerWidth - 200) style.left = x - 180;
  if (y > window.innerHeight - 300) style.top = y - 250;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[9999]"
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
        onMouseDown={(e) => e.stopPropagation()}
      />
      <div
        className="fixed z-[9999] bg-slate-800 border border-slate-600 rounded-lg shadow-2xl py-1 min-w-[180px] text-sm animate-in fade-in zoom-in-95 duration-100"
        style={style}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-2 border-b border-slate-700 mb-1">
            <span className="text-xs text-gray-400 font-bold uppercase truncate block max-w-[150px]">
              {object.type === ItemType.CARD
                ? (object as Card).hidden
                  ? 'HIDDEN'
                  : (object as Card).faceUp
                    ? object.name
                    : '*****'
                : object.name}
            </span>
        </div>

        {finalItems.map((item, idx) => {
            if (item.hasSubmenu) {
              const isRotateSubmenu = item.action === 'rotate';
              const isPilesSubmenu = item.action === 'piles';
              const isTopDeckSubmenu = item.action === 'topDeck';
              const isMoveSubmenu = item.action === 'moveTo';
              const isSubmenuOpen = isRotateSubmenu ? rotateSubmenuOpen : isPilesSubmenu ? pilesSubmenuOpen : isTopDeckSubmenu ? topDeckSubmenuOpen : isMoveSubmenu ? moveSubmenuOpen : layerSubmenuOpen;
              const deck = object as Deck;
              const toggleSubmenu = () => {
                if (isRotateSubmenu) {
                  setRotateSubmenuOpen(!rotateSubmenuOpen);
                  setLayerSubmenuOpen(false);
                  setPilesSubmenuOpen(false);
                  setTopDeckSubmenuOpen(false);
                  setMoveSubmenuOpen(false);
                } else if (isPilesSubmenu) {
                  setPilesSubmenuOpen(!pilesSubmenuOpen);
                  setLayerSubmenuOpen(false);
                  setRotateSubmenuOpen(false);
                  setTopDeckSubmenuOpen(false);
                  setMoveSubmenuOpen(false);
                } else if (isTopDeckSubmenu) {
                  setTopDeckSubmenuOpen(!topDeckSubmenuOpen);
                  setLayerSubmenuOpen(false);
                  setRotateSubmenuOpen(false);
                  setPilesSubmenuOpen(false);
                  setMoveSubmenuOpen(false);
                } else if (isMoveSubmenu) {
                  setMoveSubmenuOpen(!moveSubmenuOpen);
                  setLayerSubmenuOpen(false);
                  setRotateSubmenuOpen(false);
                  setPilesSubmenuOpen(false);
                  setTopDeckSubmenuOpen(false);
                } else {
                  setLayerSubmenuOpen(!layerSubmenuOpen);
                  setRotateSubmenuOpen(false);
                  setPilesSubmenuOpen(false);
                  setTopDeckSubmenuOpen(false);
                  setMoveSubmenuOpen(false);
                }
              };

              return (
                <div key={item.action || idx} className="relative" ref={submenuRef}>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleSubmenu(); }}
                    className="w-full text-left px-3 py-2 flex items-center justify-between gap-2 hover:bg-slate-700 transition-colors text-gray-200"
                  >
                    <div className="flex items-center gap-2">
                      {item.icon}
                      <span>{item.label}</span>
                    </div>
                    <ChevronRight size={12} />
                  </button>
                  {isSubmenuOpen && (
                    <div
                      className="absolute left-full top-0 ml-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl py-1 min-w-[180px] z-[10000]"
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      {isRotateSubmenu ? (
                        <>
                          <button
                            onClick={() => { onAction('rotateClockwise'); onClose(); }}
                            className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
                          >
                            <RefreshCw size={14} />
                            <span>Clockwise</span>
                          </button>
                          <button
                            onClick={() => { onAction('rotateCounterClockwise'); onClose(); }}
                            className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
                          >
                            <RefreshCw size={14} style={{ transform: 'scaleX(-1)' }} />
                            <span>Counter-Clockwise</span>
                          </button>
                          <button
                            onClick={() => { onAction('freeRotate'); onClose(); }}
                            className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
                          >
                            <RotateCw size={14} />
                            <span>Free Rotate</span>
                          </button>
                          <button
                            onClick={() => { onAction('resetRotation'); onClose(); }}
                            className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
                          >
                            <Undo size={14} />
                            <span>Reset</span>
                          </button>
                          <div className="h-px bg-slate-700 my-1 mx-2" />
                          <button
                            onClick={() => { onAction('swingClockwise'); onClose(); }}
                            className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
                          >
                            <RefreshCw size={14} />
                            <span>Swing CW</span>
                          </button>
                          <button
                            onClick={() => { onAction('swingCounterClockwise'); onClose(); }}
                            className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
                          >
                            <RefreshCw size={14} style={{ transform: 'scaleY(-1)' }} />
                            <span>Swing CCW</span>
                          </button>
                        </>
                      ) : isPilesSubmenu ? (
                        <>
                          {deck.piles?.map((pile) => (
                            <button
                              key={pile.id}
                              onClick={() => { onAction(`pile-${pile.id}`); onClose(); }}
                              className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
                            >
                              <Layers size={14} />
                              <span>{pile.name}</span>
                            </button>
                          ))}
                        </>
                      ) : isTopDeckSubmenu ? (
                        <>
                          <button
                            onClick={() => { onAction('topDeck'); onClose(); }}
                            className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
                          >
                            <Settings size={14} />
                            <span>Manager</span>
                          </button>
                          <div className="h-px bg-slate-700 my-1 mx-2" />
                          {can('draw') && (
                            <button
                              onClick={() => { onAction('draw'); onClose(); }}
                              className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
                            >
                              <Hand size={14} />
                              <span>Draw</span>
                            </button>
                          )}
                          {can('playTopCard') && (
                            <button
                              onClick={() => { onAction('playTopCard'); onClose(); }}
                              className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
                            >
                              <Eye size={14} />
                              <span>Play</span>
                            </button>
                          )}
                          {deck.piles && deck.piles.length > 0 && (
                            <button
                              onClick={() => { onAction('millTopCard'); onClose(); }}
                              className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
                            >
                              <Undo size={14} />
                              <span>Mill</span>
                            </button>
                          )}
                          <button
                            onClick={() => { onAction('toBottom'); onClose(); }}
                            className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
                          >
                            <ArrowDown size={14} />
                            <span>To Bottom</span>
                          </button>
                          {can('showTop') && (
                            <button
                              onClick={() => { onAction('showTop'); onClose(); }}
                              className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
                            >
                              <Eye size={14} />
                              <span>{(object as Deck).showTopCard ? 'Hide Top' : 'Show Top'}</span>
                            </button>
                          )}
                        </>
                      ) : isMoveSubmenu ? (
                        <>
                          {/* Move to submenu items */}
                          {(item.submenuItems || []).map((subItem) => {
                            if (subItem.isSeparator) {
                              return (
                                <div key={subItem.action} className="h-px bg-slate-700 my-1 mx-2" />
                              );
                            }
                            const subAction = subItem.action.toString();
                            return (
                              <button
                                key={subItem.action}
                                onClick={() => {
                                  onAction(subAction);
                                  onClose();
                                }}
                                className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
                              >
                                {subItem.icon}
                                <span>{subItem.label}</span>
                              </button>
                            );
                          })}
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => { onAction('layerUp'); onClose(); }}
                            className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
                          >
                            <ArrowUp size={14} />
                            <span>Layer Up</span>
                          </button>
                          <button
                            onClick={() => { onAction('layerDown'); onClose(); }}
                            className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
                          >
                            <ArrowDown size={14} />
                            <span>Layer Down</span>
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  {item.separator && <div className="h-px bg-slate-700 my-1 mx-2" />}
                </div>
              );
            }
            return (
                <React.Fragment key={item.action || idx}>
                    <button
                        onClick={() => { onAction(item.action); onClose(); }}
                        className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors ${item.action === 'delete' ? 'text-red-400 hover:text-red-300' : 'text-gray-200'}`}
                    >
                        {item.icon}
                        <span>{item.label}</span>
                    </button>
                    {item.separator && <div className="h-px bg-slate-700 my-1 mx-2" />}
                </React.Fragment>
            );
        })}
      </div>
    </>,
    document.body
  );
};
