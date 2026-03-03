
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { TableObject, ItemType, Card, Deck, ContextAction, Deck as DeckType, CardPile, AppLanguage } from '../types';
import { Lock, Unlock, RefreshCw, Copy, Settings, Eye, EyeOff, Layers, Trash2, ArrowUp, ArrowDown, Hand, Shuffle, Search, Undo, ChevronRight, RotateCw, Pin, ImageDown, CornerDownRight } from 'lucide-react';

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

  const t = (key: { en: string; ru: string }): string => key[language] || key.en;

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
        label: t({ en: 'Hand', ru: 'В руку' }),
        action: 'moveToHand',
        icon: <Hand size={14} />,
        visible: !hideCardActions && can('moveToHand')
      },
      {
        label: t({ en: 'Top Deck', ru: 'Верх колоды' }),
        action: 'moveToTopDeck',
        icon: <ArrowUp size={14} />,
        visible: !!deck && can('moveToTopDeck')
      },
      {
        label: t({ en: 'Bottom Deck', ru: 'Низ колоды' }),
        action: 'moveToBottomDeck',
        icon: <ArrowDown size={14} />,
        visible: !!deck && can('moveToBottomDeck')
      },
      // Move to Mill - only visible if there's a mill pile AND action is allowed
      ...(piles.some(p => p.isMillPile) && can('moveToDiscard') ? [{
        label: t({ en: 'Mill', ru: 'В сброс' }),
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
        label: t({ en: 'Move to...', ru: 'Переместить...' }),
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
      label: t({ en: 'Configure...', ru: 'Настроить...' }),
      action: 'configure',
      icon: <Settings size={14} />,
      // Hide for token-copies (tokens with archetypeId)
      visible: isGM && !(object.type === ItemType.TOKEN && (object as any).archetypeId),
      separator: false
    },
    {
      label: t({ en: 'Set as Card Back', ru: 'Установить как рубашку' }),
      action: 'setCardBack',
      icon: <ImageDown size={14} />,
      visible: isSearchWindow && isGM && object.type === ItemType.CARD,
      separator: true
    },
    // "Move to..." section for cards - before Change Layer
    ...moveToSection,
    {
      label: t({ en: 'Change Layer', ru: 'Изменить слой' }),
      action: 'layer',
      icon: <Layers size={14} />,
      visible: !hideCardActions && (can('layerUp') || can('layerDown')),
      hasSubmenu: true,
      separator: false,
      submenuItems: [
        {
          label: t({ en: 'Layer Up', ru: 'Слой выше' }),
          action: 'layerUp',
          icon: <ArrowUp size={14} />,
          visible: can('layerUp')
        },
        {
          label: t({ en: 'Layer Down', ru: 'Слой ниже' }),
          action: 'layerDown',
          icon: <ArrowDown size={14} />,
          visible: can('layerDown')
        }
      ]
    },
    {
      label: t({ en: 'Rotation', ru: 'Вращение' }),
      action: 'rotate',
      icon: <RotateCw size={14} />,
      // Hide rotation in search window and for cards in hand panel (only available in game space)
      visible: !isSearchWindow && !hideCardActions && can('rotate'),
      hasSubmenu: true,
      separator: true,
      submenuItems: [
        {
          label: t({ en: 'Clockwise', ru: 'По часовой' }),
          action: 'rotateClockwise',
          icon: <RefreshCw size={14} />,
          visible: can('rotateClockwise')
        },
        {
          label: t({ en: 'Counter-Clockwise', ru: 'Против часовой' }),
          action: 'rotateCounterClockwise',
          icon: <RefreshCw size={14} style={{ transform: 'scaleX(-1)' }} />,
          visible: can('rotateCounterClockwise')
        },
        {
          label: t({ en: 'Reset', ru: 'Сбросить' }),
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
          label: t({ en: 'Swing CW', ru: 'Покачать по часовой' }),
          action: 'swingClockwise',
          icon: <RefreshCw size={14} />,
          visible: can('swingClockwise')
        },
        {
          label: t({ en: 'Swing CCW', ru: 'Покачать против часовой' }),
          action: 'swingCounterClockwise',
          icon: <RefreshCw size={14} style={{ transform: 'scaleY(-1)' }} />,
          visible: can('swingCounterClockwise')
        }
      ]
    },
    // Deck-specific actions
    {
      label: t({ en: 'Top Deck', ru: 'Верх колоды' }),
      action: 'topDeck',
      icon: <ArrowUp size={14} />,
      visible: object.type === ItemType.DECK && can('topDeck'),
      hasSubmenu: true
    },
    {
      label: t({ en: 'Search', ru: 'Поиск' }),
      action: 'searchDeck',
      icon: <Search size={14} />,
      visible: object.type === ItemType.DECK && can('searchDeck')
    },
    {
      label: t({ en: 'Shuffle', ru: 'Перемешать' }),
      action: 'shuffleDeck',
      icon: <Shuffle size={14} />,
      visible: object.type === ItemType.DECK && can('shuffleDeck')
    },
    {
      label: t({ en: 'Piles', ru: 'Стопки' }),
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
      label: t({ en: 'Return All', ru: 'Вернуть все' }),
      action: 'returnAll',
      icon: <Undo size={14} />,
      visible: object.type === ItemType.DECK && can('returnAll'),
      separator: true
    },
    {
      label: t({ en: 'Flip', ru: 'Перевернуть' }),
      action: 'flip',
      icon: <Eye size={14} />,
      visible: object.type === ItemType.CARD && can('flip')
    },
    {
      label: object.locked ? t({ en: 'Unlock', ru: 'Разблокировать' }) : t({ en: 'Lock', ru: 'Заблокировать' }),
      action: 'lock',
      icon: object.locked ? <Unlock size={14} /> : <Lock size={14} />,
      visible: !hideCardActions && can('lock')
    },
    {
      label: object.isPinnedToViewport ? t({ en: 'Unpin', ru: 'Открепить' }) : t({ en: 'Pin', ru: 'Закрепить' }),
      action: object.isPinnedToViewport ? 'unpinFromViewport' : 'pinToViewport',
      icon: <Pin size={14} />,
      visible: !hideCardActions && can('pin'),
      separator: true
    },
    // Remove the old "To Hand" item since it's now in "Move to.."
    {
      label: (object as Card).hidden ? t({ en: 'Unhide Card', ru: 'Показать карту' }) : t({ en: 'Hide Card', ru: 'Скрыть карту' }),
      action: 'toggleHide',
      icon: (object as Card).hidden ? <Eye size={14} /> : <EyeOff size={14} />,
      visible: isSearchWindow && isGM && object.type === ItemType.CARD
    },
    {
      label: t({ en: 'Clone', ru: 'Клонировать' }),
      action: 'clone',
      icon: <Copy size={14} />,
      visible: !hideCardActions && can('clone')
    },
    {
      label: t({ en: 'Delete', ru: 'Удалить' }),
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
                            <span>{t({ en: 'Manager', ru: 'Менеджер' })}</span>
                          </button>
                          <div className="h-px bg-slate-700 my-1 mx-2" />
                          {can('draw') && (
                            <button
                              onClick={() => { onAction('draw'); onClose(); }}
                              className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
                            >
                              <Hand size={14} />
                              <span>{t({ en: 'Draw', ru: 'Взять' })}</span>
                            </button>
                          )}
                          {can('playTopCard') && (
                            <button
                              onClick={() => { onAction('playTopCard'); onClose(); }}
                              className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
                            >
                              <ArrowUp size={14} />
                              <span>{t({ en: 'Play', ru: 'Сыграть' })}</span>
                            </button>
                          )}
                          {deck.piles && deck.piles.length > 0 && (
                            <button
                              onClick={() => { onAction('millTopCard'); onClose(); }}
                              className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
                            >
                              <Undo size={14} />
                              <span>{t({ en: 'Mill', ru: 'В сброс' })}</span>
                            </button>
                          )}
                          <button
                            onClick={() => { onAction('toBottom'); onClose(); }}
                            className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
                          >
                            <ArrowDown size={14} />
                            <span>{t({ en: 'To Bottom', ru: 'В низ' })}</span>
                          </button>
                          {can('showTop') && (
                            <button
                              onClick={() => { onAction('showTop'); onClose(); }}
                              className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
                            >
                              <Eye size={14} />
                              <span>{(object as Deck).showTopCard ? t({ en: 'Hide Top', ru: 'Скрыть верхнюю' }) : t({ en: 'Show Top', ru: 'Показать верхнюю' })}</span>
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
                            <span>{t({ en: 'Layer Up', ru: 'Слой выше' })}</span>
                          </button>
                          <button
                            onClick={() => { onAction('layerDown'); onClose(); }}
                            className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
                          >
                            <ArrowDown size={14} />
                            <span>{t({ en: 'Layer Down', ru: 'Слой ниже' })}</span>
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
