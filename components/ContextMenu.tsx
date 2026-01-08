

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { TableObject, ItemType, Card, Deck, ContextAction, Deck as DeckType } from '../types';
import { Lock, Unlock, RefreshCw, Copy, Settings, Eye, Layers, Trash2, ArrowUp, ArrowDown, Hand, Shuffle, Search, Undo, ChevronRight } from 'lucide-react';

interface ContextMenuProps {
  x: number;
  y: number;
  object: TableObject;
  isGM: boolean;
  onAction: (action: string) => void;
  onClose: () => void;
  allObjects: Record<string, TableObject>; // Added to access deck for card inheritance
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, object, isGM, onAction, onClose, allObjects }) => {
  const [layerSubmenuOpen, setLayerSubmenuOpen] = useState(false);
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
      // undefined = all allowed, [] = none allowed, specific array = only those allowed
      return allowedActionsForGM === undefined || (allowedActionsForGM.length > 0 && allowedActionsForGM.includes(action));
    }
    // Player: check allowedActions
    // undefined = all allowed, [] = none allowed, specific array = only those allowed
    return allowedActions === undefined || (allowedActions.length > 0 && allowedActions.includes(action));
  };

  // Close layer submenu when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (submenuRef.current && !submenuRef.current.contains(e.target as Node)) {
        setLayerSubmenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const menuItems = [
    {
      label: 'Configure...',
      action: 'configure',
      icon: <Settings size={14} />,
      visible: isGM,
      separator: true
    },
    {
      label: 'Change Layer',
      action: 'layer',
      icon: <Layers size={14} />,
      visible: can('layer'),
      hasSubmenu: true,
      separator: true
    },
    // Deck-specific actions
    {
      label: 'Draw Card',
      action: 'draw',
      icon: <Hand size={14} />,
      visible: object.type === ItemType.DECK && can('draw')
    },
    {
      label: 'Play Top Card',
      action: 'playTopCard',
      icon: <Eye size={14} />,
      visible: object.type === ItemType.DECK && can('playTopCard')
    },
    {
      label: 'Shuffle Deck',
      action: 'shuffleDeck',
      icon: <Shuffle size={14} />,
      visible: object.type === ItemType.DECK && can('shuffleDeck')
    },
    {
      label: 'Search',
      action: 'searchDeck',
      icon: <Search size={14} />,
      visible: object.type === ItemType.DECK && can('searchDeck')
    },
    {
      label: 'Return All',
      action: 'returnAll',
      icon: <Undo size={14} />,
      visible: object.type === ItemType.DECK && can('returnAll')
    },
    {
      label: object.locked ? 'Unlock Position' : 'Lock Position',
      action: 'lock',
      icon: object.locked ? <Unlock size={14} /> : <Lock size={14} />,
      visible: can('lock')
    },
    {
      label: 'Flip Card',
      action: 'flip',
      icon: <Eye size={14} />,
      visible: object.type === ItemType.CARD && can('flip')
    },
    {
      label: 'Rotate 90°',
      action: 'rotate',
      icon: <RefreshCw size={14} />,
      visible: can('rotate')
    },
    {
      label: 'To Hand',
      action: 'toHand',
      icon: <Hand size={14} />,
      visible: object.type === ItemType.CARD && can('toHand')
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
            <span className="text-xs text-gray-400 font-bold uppercase truncate block max-w-[150px]">{object.name}</span>
        </div>

        {finalItems.map((item, idx) => {
            if (item.hasSubmenu) {
              return (
                <div key={item.action || idx} className="relative" ref={submenuRef}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setLayerSubmenuOpen(!layerSubmenuOpen); }}
                    className="w-full text-left px-3 py-2 flex items-center justify-between gap-2 hover:bg-slate-700 transition-colors text-gray-200"
                  >
                    <div className="flex items-center gap-2">
                      {item.icon}
                      <span>{item.label}</span>
                    </div>
                    <ChevronRight size={12} />
                  </button>
                  {layerSubmenuOpen && (
                    <div
                      className="absolute left-full top-0 ml-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl py-1 min-w-[160px] z-[10000]"
                      onMouseDown={(e) => e.stopPropagation()}
                    >
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
