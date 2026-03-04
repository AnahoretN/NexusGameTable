import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { TableObject, ItemType, Card, Deck, ContextAction, Deck as DeckType, CardPile, AppLanguage } from '../types';
import { Lock, Unlock, RefreshCw, Copy, Settings, Eye, EyeOff, Layers, Trash2, ArrowUp, ArrowDown, Hand, Shuffle, Search, Undo, ChevronRight, RotateCw, Pin, ImageDown, CornerDownRight } from 'lucide-react';
import { t as translate, Locale } from '../utils/translations';

interface ContextMenuProps {
  x: number;
  y: number;
  object: TableObject;
  isGM: boolean;
  onAction: (action: string) => void;
  onClose: () => void;
  allObjects: Record<string, TableObject>;
  hideCardActions?: boolean;
  isSearchWindow?: boolean;
  language?: AppLanguage;
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

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, object, isGM, onAction, onClose, allObjects, hideCardActions, isSearchWindow, language = 'en' }) => {
  const [layerSubmenuOpen, setLayerSubmenuOpen] = useState(false);
  const [rotateSubmenuOpen, setRotateSubmenuOpen] = useState(false);
  const [pilesSubmenuOpen, setPilesSubmenuOpen] = useState(false);
  const [topDeckSubmenuOpen, setTopDeckSubmenuOpen] = useState(false);
  const [moveSubmenuOpen, setMoveSubmenuOpen] = useState(false);
  const submenuRef = React.useRef<HTMLDivElement>(null);

  // Store computed positions for main menu and submenus
  const [menuPosition, setMenuPosition] = React.useState({ left: x, top: y });
  const [submenuPositions, setSubmenuPositions] = React.useState<Record<string, { left: number; top: number; side: 'left' | 'right' }>>({});
  const menuRef = React.useRef<HTMLDivElement>(null);
  const submenuButtonRefs = React.useRef<Record<string, HTMLButtonElement | null>>({});

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
        setSubmenuPositions({});
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Calculate main menu position to keep it on screen
  React.useEffect(() => {
    const menuWidth = 200; // approximate min width
    const menuHeight = 400; // approximate max height

    let left = x;
    let top = y;

    // Check right edge
    if (left + menuWidth > window.innerWidth) {
      left = window.innerWidth - menuWidth - 10;
    }
    if (left < 10) left = 10;

    // Check bottom edge
    if (top + menuHeight > window.innerHeight) {
      top = window.innerHeight - menuHeight - 10;
    }
    if (top < 10) top = 10;

    setMenuPosition({ left, top });
  }, [x, y]);

  // Calculate submenu positions based on actual button positions
  React.useEffect(() => {
    const positions: Record<string, { left: number; top: number; side: 'left' | 'right' }> = {};
    const submenuWidth = 180;
    const submenuHeight = 200; // estimated max height

    const openSubmenus: string[] = [];
    if (layerSubmenuOpen) openSubmenus.push('layer');
    if (rotateSubmenuOpen) openSubmenus.push('rotate');
    if (pilesSubmenuOpen) openSubmenus.push('piles');
    if (topDeckSubmenuOpen) openSubmenus.push('topDeck');
    if (moveSubmenuOpen) openSubmenus.push('moveTo');

    // Clear positions when all submenus are closed
    if (openSubmenus.length === 0) {
      setSubmenuPositions({});
      return;
    }

    openSubmenus.forEach(key => {
      const button = submenuButtonRefs.current[key];
      if (button) {
        const rect = button.getBoundingClientRect();
        let left = rect.right + 5;
        let top = rect.top;
        let side: 'left' | 'right' = 'right';

        // Check if submenu would go off right edge
        if (left + submenuWidth > window.innerWidth) {
          // Show on left side instead
          left = rect.left - submenuWidth - 5;
          side = 'left';
        }

        // Check if submenu would go off bottom edge
        if (top + submenuHeight > window.innerHeight) {
          top = window.innerHeight - submenuHeight - 10;
        }
        if (top < 10) top = 10;

        positions[key] = { left, top, side };
      }
    });

    setSubmenuPositions(positions);
  }, [layerSubmenuOpen, rotateSubmenuOpen, pilesSubmenuOpen, topDeckSubmenuOpen, moveSubmenuOpen]);

  // "Move to.." section for cards - defined here to be inserted early
  const moveToSection: MenuItem[] = object.type === ItemType.CARD ? (() => {
    const card = object as Card;
    const deck = card.deckId ? allObjects[card.deckId] as DeckType : null;
    const piles = deck?.piles || [];

    const submenuItems: MenuItem[] = [
      {
        label: translate('Hand', language as Locale),
        action: 'moveToHand',
        icon: <Hand size={14} />,
        visible: !hideCardActions && can('moveToHand')
      },
      {
        label: translate('Top Deck', language as Locale),
        action: 'moveToTopDeck',
        icon: <ArrowUp size={14} />,
        visible: !!deck && can('moveToTopDeck')
      },
      {
        label: translate('Bottom Deck', language as Locale),
        action: 'moveToBottomDeck',
        icon: <ArrowDown size={14} />,
        visible: !!deck && can('moveToBottomDeck')
      },
      // Move to Mill - only visible if there's a mill pile AND action is allowed
      ...(piles.some(p => p.isMillPile) && can('moveToDiscard') ? [{
        label: translate('Mill', language as Locale),
        action: 'moveToDiscard' as const,
        icon: <Trash2 size={14} />,
        visible: true
      }] : []),
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
    ];

    // Section is only visible if at least one submenu item is visible
    const hasVisibleItems = submenuItems.some(item => item.visible);

    return hasVisibleItems ? [
      {
        label: translate('Move to...', language as Locale),
        action: 'moveTo',
        icon: <CornerDownRight size={14} />,
        visible: true,
        hasSubmenu: true,
        separator: true,
        submenuItems
      }
    ] : [];
  })() : [];

  const menuItems: MenuItem[] = [
    {
      label: translate('Configure...', language as Locale),
      action: 'configure',
      icon: <Settings size={14} />,
      // Hide for token-copies (tokens with archetypeId)
      visible: isGM && !(object.type === ItemType.TOKEN && (object as any).archetypeId),
      separator: false
    },
    {
      label: translate('Set as Card Back', language as Locale),
      action: 'setCardBack',
      icon: <ImageDown size={14} />,
      visible: isSearchWindow && isGM && object.type === ItemType.CARD,
      separator: true
    },
    // "Move to..." section for cards - before Change Layer
    ...moveToSection,
    {
      label: translate('Change Layer', language as Locale),
      action: 'layer',
      icon: <Layers size={14} />,
      visible: !hideCardActions && (can('layerUp') || can('layerDown')),
      hasSubmenu: true,
      separator: false,
      submenuItems: [
        {
          label: translate('Layer Up', language as Locale),
          action: 'layerUp',
          icon: <ArrowUp size={14} />,
          visible: can('layerUp')
        },
        {
          label: translate('Layer Down', language as Locale),
          action: 'layerDown',
          icon: <ArrowDown size={14} />,
          visible: can('layerDown')
        }
      ]
    },
    {
      label: translate('Rotation', language as Locale),
      action: 'rotate',
      icon: <RotateCw size={14} />,
      // Hide rotation in search window and for cards in hand panel (only available in game space)
      visible: !isSearchWindow && !hideCardActions && can('rotate'),
      hasSubmenu: true,
      separator: true,
      submenuItems: [
        {
          label: translate('Clockwise', language as Locale),
          action: 'rotateClockwise',
          icon: <RefreshCw size={14} />,
          visible: can('rotateClockwise')
        },
        {
          label: translate('Counter-Clockwise', language as Locale),
          action: 'rotateCounterClockwise',
          icon: <RefreshCw size={14} style={{ transform: 'scaleX(-1)' }} />,
          visible: can('rotateCounterClockwise')
        },
        {
          label: translate('Reset', language as Locale),
          action: 'resetRotation',
          icon: <Undo size={14} />,
          visible: can('rotateClockwise') // Using rotateClockwise as proxy for rotate permission
        },
        {
          label: '-',
          action: 'separator',
          visible: can('swingClockwise') || can('swingCounterClockwise'),
          isSeparator: true
        },
        {
          label: translate('Swing CW', language as Locale),
          action: 'swingClockwise',
          icon: <RefreshCw size={14} />,
          visible: can('swingClockwise')
        },
        {
          label: translate('Swing CCW', language as Locale),
          action: 'swingCounterClockwise',
          icon: <RefreshCw size={14} style={{ transform: 'scaleY(-1)' }} />,
          visible: can('swingCounterClockwise')
        }
      ]
    },
    // Deck-specific actions
    {
      label: translate('Top Deck', language as Locale),
      action: 'topDeck',
      icon: <ArrowUp size={14} />,
      visible: object.type === ItemType.DECK && can('topDeck'),
      hasSubmenu: true
    },
    {
      label: translate('Search', language as Locale),
      action: 'searchDeck',
      icon: <Search size={14} />,
      visible: object.type === ItemType.DECK && can('searchDeck')
    },
    {
      label: translate('Shuffle', language as Locale),
      action: 'shuffleDeck',
      icon: <Shuffle size={14} />,
      visible: object.type === ItemType.DECK && can('shuffleDeck')
    },
    {
      label: translate('Piles', language as Locale),
      action: 'piles',
      icon: <Layers size={14} />,
      visible: object.type === ItemType.DECK && can('piles') && (object as Deck).piles && (object as Deck).piles!.length > 0,
      hasSubmenu: true,
      submenuItems: (object as Deck).piles?.map((pile) => ({
        label: `${pile.name} (${pile.cardIds.length})`,
        action: `pile-${pile.id}`,
        icon: <Layers size={14} />,
        visible: true
      })) || []
    },
    {
      label: translate('Return All', language as Locale),
      action: 'returnAll',
      icon: <Undo size={14} />,
      visible: object.type === ItemType.DECK && can('returnAll'),
      separator: true
    },
    {
      label: (object as any).isOnTable === false ? translate('Show', language as Locale) : translate('Hide', language as Locale),
      action: (object as any).isOnTable === false ? 'show' : 'hide',
      icon: (object as any).isOnTable === false ? <Eye size={14} /> : <EyeOff size={14} />,
      visible: can('hide')
    },
    {
      label: translate('Flip', language as Locale),
      action: 'flip',
      icon: <Eye size={14} />,
      visible: object.type === ItemType.CARD && can('flip')
    },
    {
      label: object.locked ? translate('Unlock', language as Locale) : translate('Lock', language as Locale),
      action: 'lock',
      icon: object.locked ? <Unlock size={14} /> : <Lock size={14} />,
      visible: !hideCardActions && can('lock')
    },
    {
      label: object.isPinnedToViewport ? translate('Unpin', language as Locale) : translate('Pin', language as Locale),
      action: object.isPinnedToViewport ? 'unpinFromViewport' : 'pinToViewport',
      icon: <Pin size={14} />,
      visible: !hideCardActions && can('pin'),
      separator: true
    },
    // Remove the old "To Hand" item since it's now in "Move to.."
    {
      label: (object as Card).hidden ? translate('Unhide Card', language as Locale) : translate('Hide Card', language as Locale),
      action: 'toggleHide',
      icon: (object as Card).hidden ? <Eye size={14} /> : <EyeOff size={14} />,
      visible: isSearchWindow && isGM && object.type === ItemType.CARD
    },
    {
      label: translate('Clone', language as Locale),
      action: 'clone',
      icon: <Copy size={14} />,
      visible: !hideCardActions && can('clone')
    },
    {
      label: translate('Delete', language as Locale),
      action: 'delete',
      icon: <Trash2 size={14} />,
      visible: !hideCardActions && can('delete')
    },
  ];

  // Filter visible items
  const visibleItems = menuItems.filter(item => item.visible);
  const configureItem = visibleItems.find(i => i.action === 'configure');
  const otherItems = visibleItems.filter(i => i.action !== 'configure');
  const finalItems = configureItem ? [configureItem, ...otherItems] : otherItems;

  const menuStyle: React.CSSProperties = {
    top: menuPosition.top,
    left: menuPosition.left,
  };

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[9999] cursor-default"
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
        onMouseDown={(e) => e.stopPropagation()}
      />
      <div
        ref={menuRef}
        className="fixed z-[9999] bg-slate-800 border border-slate-600 rounded-lg shadow-2xl py-1 min-w-[180px] text-sm animate-in fade-in zoom-in-95 duration-100 cursor-default"
        style={menuStyle}
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

              const submenuKey = isRotateSubmenu ? 'rotate' : isPilesSubmenu ? 'piles' : isTopDeckSubmenu ? 'topDeck' : isMoveSubmenu ? 'moveTo' : 'layer';
              const submenuPos = submenuPositions[submenuKey];

              return (
                <div key={item.action || idx} className="relative" ref={submenuRef}>
                  <button
                    ref={(el) => { submenuButtonRefs.current[submenuKey] = el; }}
                    onClick={(e) => { e.stopPropagation(); toggleSubmenu(); }}
                    className="w-full text-left px-3 py-2 flex items-center justify-between gap-2 hover:bg-slate-700 transition-colors text-gray-200"
                  >
                    <div className="flex items-center gap-2">
                      {item.icon}
                      <span>{item.label}</span>
                    </div>
                    <ChevronRight size={12} />
                  </button>
                  {isSubmenuOpen && submenuPos && createPortal(
                    <div
                      className="fixed z-[10000] bg-slate-800 border border-slate-600 rounded-lg shadow-xl py-1 min-w-[180px] animate-in fade-in zoom-in-95 duration-100"
                      style={{ left: submenuPos.left, top: submenuPos.top }}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      {/* If item has submenuItems defined, use generic renderer */}
                      {item.submenuItems ? (
                        <>
                          {item.submenuItems.filter(subItem => subItem.visible).map((subItem) => {
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
                      ) : isTopDeckSubmenu ? (
                        <>
                          <button
                            onClick={() => { onAction('topDeck'); onClose(); }}
                            className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
                          >
                            <Settings size={14} />
                            <span>{translate('Manager', language as Locale)}</span>
                          </button>
                          <div className="h-px bg-slate-700 my-1 mx-2" />
                          {can('draw') && (
                            <button
                              onClick={() => { onAction('draw'); onClose(); }}
                              className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
                            >
                              <Hand size={14} />
                              <span>{translate('Draw', language as Locale)}</span>
                            </button>
                          )}
                          {can('playTopCard') && (
                            <button
                              onClick={() => { onAction('playTopCard'); onClose(); }}
                              className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
                            >
                              <ArrowUp size={14} />
                              <span>{translate('Play', language as Locale)}</span>
                            </button>
                          )}
                          {deck.piles && deck.piles.length > 0 && (
                            <button
                              onClick={() => { onAction('millTopCard'); onClose(); }}
                              className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
                            >
                              <Undo size={14} />
                              <span>{translate('Mill', language as Locale)}</span>
                            </button>
                          )}
                          <button
                            onClick={() => { onAction('toBottom'); onClose(); }}
                            className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
                          >
                            <ArrowDown size={14} />
                            <span>{translate('To Bottom', language as Locale)}</span>
                          </button>
                          {can('showTop') && (
                            <button
                              onClick={() => { onAction('showTop'); onClose(); }}
                              className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
                            >
                              <Eye size={14} />
                              <span>{(object as Deck).showTopCard ? translate('Hide Top', language as Locale) : translate('Show Top', language as Locale)}</span>
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => { onAction('layerUp'); onClose(); }}
                            className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
                          >
                            <ArrowUp size={14} />
                            <span>{translate('Layer Up', language as Locale)}</span>
                          </button>
                          <button
                            onClick={() => { onAction('layerDown'); onClose(); }}
                            className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
                          >
                            <ArrowDown size={14} />
                            <span>{translate('Layer Down', language as Locale)}</span>
                          </button>
                        </>
                      )}
                    </div>,
                    document.body
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
