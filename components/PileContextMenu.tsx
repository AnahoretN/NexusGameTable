import { t as translate, Locale } from '../utils/translations';
import React, { useMemo, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import { CardPile, Deck, AppLanguage } from '../types';
import { Search, Hand, Undo, Lock, Unlock, Eye, Settings } from 'lucide-react';

interface PileContextMenuProps {
  x: number;
  y: number;
  pile: CardPile;
  deck: Deck;
  onAction: (action: string) => void;
  onClose: () => void;
  language?: AppLanguage;
}

interface PileMenuItem {
  label: string;
  action: string;
  icon: JSX.Element;
  visible: boolean;
}

// Memoized menu item component
const PileMenuItem = memo<{
  item: PileMenuItem;
  onAction: (action: string) => void;
  onClose: () => void;
}>(({ item, onAction, onClose }) => {
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onAction(item.action);
    onClose();
  }, [item.action, onAction, onClose]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <button
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 active:bg-slate-600 transition-colors text-gray-200 cursor-pointer select-none border-none bg-transparent"
      type="button"
      style={{ outline: 'none' }}
    >
      {item.icon}
      <span>{item.label}</span>
    </button>
  );
});

PileMenuItem.displayName = 'PileMenuItem';

export const PileContextMenu: React.FC<PileContextMenuProps> = memo(({ x, y, pile, deck, onAction, onClose, language = 'en' }) => {

  const menuItems = useMemo<PileMenuItem[]>(() => [
    {
      label: pile.locked ? translate('Unlock', language as Locale) : translate('Lock', language as Locale),
      action: 'lock',
      icon: pile.locked ? <Unlock size={14} /> : <Lock size={14} />,
      visible: pile.position === 'free'
    },
    {
      label: pile.showTopCard ? translate('Hide top', language as Locale) : translate('Show top', language as Locale),
      action: 'showTop',
      icon: <Eye size={14} />,
      visible: true
    },
    {
      label: translate('Search', language as Locale),
      action: 'search',
      icon: <Search size={14} />,
      visible: true
    },
    {
      label: translate('Manage Topdeck', language as Locale) || 'Manage Topdeck',
      action: 'topDeck',
      icon: <Settings size={14} />,
      visible: true
    },
    {
      label: translate('Draw', language as Locale),
      action: 'draw',
      icon: <Hand size={14} />,
      visible: pile.cardIds.length > 0
    },
    {
      label: translate('Return All', language as Locale),
      action: 'returnAll',
      icon: <Undo size={14} />,
      visible: true
    },
  ].filter(item => item.visible), [pile.locked, pile.showTopCard, pile.position, pile.cardIds.length, language]);

  // Calculate menu position to keep it on screen
  const menuStyle = useMemo<React.CSSProperties>(() => {
    let left = x;
    let top = y;

    // Check right edge (menu is approximately 180px wide)
    if (left + 180 > window.innerWidth) {
      left = Math.max(10, window.innerWidth - 190);
    }
    if (left < 10) left = 10;

    // Check bottom edge (menu is approximately 200px tall)
    if (top + 200 > window.innerHeight) {
      top = Math.max(10, window.innerHeight - 210);
    }
    if (top < 10) top = 10;

    return {
      position: 'fixed',
      left,
      top,
      zIndex: 100001
    };
  }, [x, y]);

  return createPortal(
    <>
      {/* Overlay - closes menu on click */}
      <div
        className="fixed inset-0 z-[100000] cursor-default"
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
        onMouseDown={(e) => e.stopPropagation()}
      />

      {/* Menu container - higher z-index than overlay */}
      <div
        className="bg-slate-800 border border-slate-600 rounded-lg shadow-2xl py-1 min-w-[175px] text-sm animate-in fade-in zoom-in-95 duration-100 pointer-events-auto"
        style={menuStyle}
        onMouseDown={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-2 border-b border-slate-700 mb-1">
            <span className="text-xs text-white truncate block max-w-[150px]">
              {pile.name} ({pile.cardIds.length})
            </span>
        </div>

        {menuItems.map((item) => (
          <PileMenuItem
            key={item.action}
            item={item}
            onAction={onAction}
            onClose={onClose}
          />
        ))}
      </div>
    </>,
    document.body
  );
});

PileContextMenu.displayName = 'PileContextMenu';
