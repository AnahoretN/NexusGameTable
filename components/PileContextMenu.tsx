import { t as translate, Locale } from '../utils/translations';
import React from 'react';
import { createPortal } from 'react-dom';
import { CardPile, Deck, AppLanguage } from '../types';
import { Search, Hand, Undo, Lock, Unlock, Eye } from 'lucide-react';

interface PileContextMenuProps {
  x: number;
  y: number;
  pile: CardPile;
  deck: Deck;
  onAction: (action: string) => void;
  onClose: () => void;
  language?: AppLanguage;
}

export const PileContextMenu: React.FC<PileContextMenuProps> = ({ x, y, pile, deck, onAction, onClose, language = 'en' }) => {

  const menuItems = [
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
      action: 'searchDeck',
      icon: <Search size={14} />,
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
  ].filter(item => item.visible);

  // Adjust position if menu would go off screen
  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: x,
    top: y,
    zIndex: 9999
  };

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[100000]"
        onClick={onClose}
        onMouseDown={onClose}
      />
      <div
        className="bg-slate-800 border border-slate-600 rounded-lg shadow-xl py-1 min-w-[180px] z-[100000]"
        style={menuStyle}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-2 border-b border-slate-700 mb-1">
          <span className="text-xs text-gray-400 font-bold uppercase truncate block max-w-[150px]">{pile.name}</span>
        </div>

        {menuItems.map((item) => (
          <React.Fragment key={item.action}>
            <button
              onClick={() => { onAction(item.action); onClose(); }}
              className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          </React.Fragment>
        ))}
      </div>
    </>,
    document.body
  );
};
