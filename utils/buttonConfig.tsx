import React from 'react';
import { Hand, Eye, EyeOff, Shuffle, RefreshCw, Copy, Trash2, Lock, Unlock, Layers, Undo, Search } from 'lucide-react';
import { ContextAction } from '../types';

// Re-export ContextAction for convenience
export type ButtonAction = ContextAction;

// Base button configuration (styling only)
export const BUTTON_STYLES: Record<ButtonAction, { className: string; title: string }> = {
  flip: { className: 'bg-purple-600 hover:bg-purple-500', title: 'Flip' },
  toHand: { className: 'bg-blue-600 hover:bg-blue-500', title: 'To Hand' },
  rotate: { className: 'bg-green-600 hover:bg-green-500', title: 'Rotate' },
  rotateClockwise: { className: 'bg-yellow-600 hover:bg-yellow-500', title: 'Rotate Clockwise' },
  rotateCounterClockwise: { className: 'bg-yellow-600 hover:bg-yellow-500', title: 'Rotate Counter-Clockwise' },
  swingClockwise: { className: 'bg-orange-600 hover:bg-orange-500', title: 'Swing Clockwise' },
  swingCounterClockwise: { className: 'bg-orange-600 hover:bg-orange-500', title: 'Swing Counter-Clockwise' },
  clone: { className: 'bg-cyan-600 hover:bg-cyan-500', title: 'Clone' },
  delete: { className: 'bg-red-600 hover:bg-red-500', title: 'Delete' },
  lock: { className: 'bg-yellow-600 hover:bg-yellow-500', title: 'Lock' },
  layer: { className: 'bg-indigo-600 hover:bg-indigo-500', title: 'Layer Up' },
  draw: { className: 'bg-blue-600 hover:bg-blue-500', title: 'Draw' },
  playTopCard: { className: 'bg-green-600 hover:bg-green-500', title: 'Play Top' },
  shuffleDeck: { className: 'bg-purple-600 hover:bg-purple-500', title: 'Shuffle' },
  searchDeck: { className: 'bg-cyan-600 hover:bg-cyan-500', title: 'Search' },
  topDeck: { className: 'bg-orange-600 hover:bg-orange-500', title: 'Top Deck' },
  piles: { className: 'bg-indigo-600 hover:bg-indigo-500', title: 'Piles' },
  returnAll: { className: 'bg-red-600 hover:bg-red-500', title: 'Return All' },
  removeFromTable: { className: 'bg-slate-600 hover:bg-slate-500', title: 'Remove From Table' },
  millToBottom: { className: 'bg-teal-600 hover:bg-teal-500', title: 'Mill to Bottom' },
  showTop: { className: 'bg-pink-600 hover:bg-pink-500', title: 'Show Top' },
};

// Icon factory functions - return appropriate icon based on state
export const ButtonIcons = {
  flip: (faceUp: boolean) => faceUp ? <EyeOff size={14} /> : <Eye size={14} />,
  toHand: () => <Hand size={14} />,
  rotate: () => <RefreshCw size={14} />,
  rotateClockwise: () => <RefreshCw size={14} />,
  rotateCounterClockwise: () => <RefreshCw size={14} style={{ transform: 'scaleX(-1)' }} />,
  swingClockwise: () => <RefreshCw size={14} />,
  swingCounterClockwise: () => <RefreshCw size={14} style={{ transform: 'scaleX(-1)' }} />,
  clone: () => <Copy size={14} />,
  delete: () => <Trash2 size={14} />,
  lock: (locked: boolean) => locked ? <Unlock size={14} /> : <Lock size={14} />,
  layer: () => <Layers size={14} />,
  draw: () => <Hand size={14} />,
  playTopCard: () => <Eye size={14} />,
  shuffleDeck: () => <Shuffle size={14} />,
  searchDeck: () => <Search size={14} />,
  topDeck: () => <Search size={14} />,
  piles: () => <Layers size={14} />,
  returnAll: () => <Undo size={14} />,
  removeFromTable: () => <Trash2 size={14} />,
  millToBottom: () => <Undo size={14} style={{ transform: 'rotate(180deg)' }} />,
  showTop: () => <Eye size={14} />,
} as const;

// Helper to get complete button config for cards
export interface CardButtonConfig {
  action: ContextAction;
  className: string;
  title: string;
  icon: React.ReactNode;
}

export function getCardButtonConfig(
  action: ButtonAction,
  faceUp: boolean,
  locked: boolean
): CardButtonConfig | null {
  const style = BUTTON_STYLES[action];
  if (!style) return null;

  const iconGetter = ButtonIcons[action];
  let icon: React.ReactNode;

  // Call icon factory with appropriate state
  if (action === 'flip') {
    icon = iconGetter(faceUp);
  } else if (action === 'lock') {
    icon = iconGetter(locked);
  } else {
    icon = (iconGetter as () => React.ReactNode)();
  }

  return {
    action,
    className: style.className,
    title: action === 'lock' ? (locked ? 'Unlock' : 'Lock') : style.title,
    icon,
  };
}
