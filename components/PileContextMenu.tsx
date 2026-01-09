import React from 'react';
import { createPortal } from 'react-dom';
import { CardPile, Deck } from '../types';
import { Search, Hand, Undo, Lock, Unlock } from 'lucide-react';

interface PileContextMenuProps {
  x: number;
  y: number;
  pile: CardPile;
  deck: Deck;
  onAction: (action: string) => void;
  onClose: () => void;
}

export const PileContextMenu: React.FC<PileContextMenuProps> = ({ x, y, pile, deck, onAction, onClose }) => {
  const menuItems = [
    {
      label: pile.locked ? 'Unlock' : 'Lock',
      action: 'lock',
      icon: pile.locked ? <Unlock size={14} /> : <Lock size={14} />,
      visible: pile.position === 'free'
    },
    {
      label: 'Search',
      action: 'searchDeck',
      icon: <Search size={14} />,
      visible: true
    },
    {
      label: 'Draw',
      action: 'draw',
      icon: <Hand size={14} />,
      visible: pile.cardIds.length > 0
    },
    {
      label: 'Return All',
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
        className="fixed inset-0 z-[9998]"
        onClick={onClose}
        onMouseDown={onClose}
      />
      <div
        className="bg-slate-800 border border-slate-600 rounded-lg shadow-xl py-1 min-w-[180px] z-[9999]"
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
