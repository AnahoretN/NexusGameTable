import React from 'react';
import { Hand, Eye, EyeOff, Shuffle, RefreshCw, Copy, Trash2, Lock, Unlock, Layers, Undo, Search, Pin, ArrowUp, ArrowDown, CornerDownRight } from 'lucide-react';
import { ContextAction } from '../types';

// Re-export ContextAction for convenience
export type ButtonAction = ContextAction;

// Base button configuration (styling only)
// Note: Not all ContextAction values have buttons (e.g., 'rotate', 'layer', 'moveTo' are abstract)
export const BUTTON_STYLES: Partial<Record<ButtonAction, { className: string; title: string }>> = {
  flip: { className: 'bg-purple-600 hover:bg-purple-500', title: 'Flip' },
  rotateClockwise: { className: 'bg-yellow-600 hover:bg-yellow-500', title: 'Rotate Clockwise' },
  rotateCounterClockwise: { className: 'bg-yellow-600 hover:bg-yellow-500', title: 'Rotate Counter-Clockwise' },
  swingClockwise: { className: 'bg-orange-600 hover:bg-orange-500', title: 'Swing Clockwise' },
  swingCounterClockwise: { className: 'bg-orange-600 hover:bg-orange-500', title: 'Swing Counter-Clockwise' },
  clone: { className: 'bg-cyan-600 hover:bg-cyan-500', title: 'Clone' },
  delete: { className: 'bg-red-600 hover:bg-red-500', title: 'Delete' },
  lock: { className: 'bg-yellow-600 hover:bg-yellow-500', title: 'Lock' },
  pin: { className: 'bg-pink-600 hover:bg-pink-500', title: 'Pin/Unpin' },
  layerUp: { className: 'bg-blue-600 hover:bg-blue-500', title: 'Layer Up' },
  layerDown: { className: 'bg-blue-600 hover:bg-blue-500', title: 'Layer Down' },
  draw: { className: 'bg-blue-600 hover:bg-blue-500', title: 'Draw' },
  playTopCard: { className: 'bg-green-600 hover:bg-green-500', title: 'Play Top' },
  millTopCard: { className: 'bg-teal-600 hover:bg-teal-500', title: 'Mill' },
  toBottom: { className: 'bg-yellow-500 hover:bg-yellow-400', title: 'To Bottom' },
  shuffleDeck: { className: 'bg-purple-600 hover:bg-purple-500', title: 'Shuffle' },
  searchDeck: { className: 'bg-cyan-600 hover:bg-cyan-500', title: 'Search' },
  topDeck: { className: 'bg-orange-600 hover:bg-orange-500', title: 'Top Deck' },
  piles: { className: 'bg-indigo-600 hover:bg-indigo-500', title: 'Piles' },
  returnAll: { className: 'bg-red-600 hover:bg-red-500', title: 'Return All' },
  removeFromTable: { className: 'bg-slate-600 hover:bg-slate-500', title: 'Remove From Table' },
  millToBottom: { className: 'bg-teal-600 hover:bg-teal-500', title: 'Mill to Bottom' },
  showTop: { className: 'bg-pink-600 hover:bg-pink-500', title: 'Show Top' },
  // "Move to" actions
  moveToHand: { className: 'bg-blue-600 hover:bg-blue-500', title: 'Move to Hand' },
  moveToTopDeck: { className: 'bg-orange-600 hover:bg-orange-500', title: 'Move to Top Deck' },
  moveToBottomDeck: { className: 'bg-yellow-600 hover:bg-yellow-500', title: 'Move to Bottom Deck' },
  moveToDiscard: { className: 'bg-red-600 hover:bg-red-500', title: 'Move to Discard' },
};

// Icon factory functions - return appropriate icon based on state
export const ButtonIcons = {
  flip: (faceUp: boolean) => faceUp ? <EyeOff size={14} /> : <Eye size={14} />,
  rotate: () => <RefreshCw size={14} />,
  rotateClockwise: () => <RefreshCw size={14} />,
  rotateCounterClockwise: () => <RefreshCw size={14} style={{ transform: 'scaleX(-1)' }} />,
  swingClockwise: () => <RefreshCw size={14} />,
  swingCounterClockwise: () => <RefreshCw size={14} style={{ transform: 'scaleX(-1)' }} />,
  clone: () => <Copy size={14} />,
  delete: () => <Trash2 size={14} />,
  lock: (locked: boolean) => locked ? <Unlock size={14} /> : <Lock size={14} />,
  pin: (pinned: boolean) => pinned ? <Pin size={14} /> : <Pin size={14} />,
  layer: () => <Layers size={14} />,
  layerUp: () => <ArrowUp size={14} />,
  layerDown: () => <ArrowDown size={14} />,
  draw: () => <Hand size={14} />,
  playTopCard: () => <Eye size={14} />,
  millTopCard: () => <Undo size={14} />,
  toBottom: () => <Unlock size={14} style={{ transform: 'rotate(180deg)' }} />,
  shuffleDeck: () => <Shuffle size={14} />,
  searchDeck: () => <Search size={14} />,
  topDeck: () => <Search size={14} />,
  piles: () => <Layers size={14} />,
  returnAll: () => <Undo size={14} />,
  removeFromTable: () => <Trash2 size={14} />,
  millToBottom: () => <Undo size={14} style={{ transform: 'rotate(180deg)' }} />,
  showTop: () => <Eye size={14} />,
  moveTo: () => <CornerDownRight size={14} />,
  moveToHand: () => <Hand size={14} />,
  moveToTopDeck: () => <ArrowUp size={14} />,
  moveToBottomDeck: () => <ArrowDown size={14} />,
  moveToDiscard: () => <Trash2 size={14} />,
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
  const style = BUTTON_STYLES[action as ButtonAction];
  if (!style) return null;

  const iconGetter = ButtonIcons[action as ButtonAction];
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

// Extended config with callbacks for hand panels and similar components
export interface CardButtonConfigWithAction extends CardButtonConfig {
  onAction: () => void;
}

export interface CardButtonCallbacks {
  onFlip?: () => void;
  onRotate?: () => void;
  onRotateClockwise?: () => void;
  onRotateCounterClockwise?: () => void;
  onSwingingClockwise?: () => void;
  onSwingingCounterClockwise?: () => void;
  onLayerUp?: () => void;
  onLayerDown?: () => void;
  onClone?: () => void;
  onMoveToHand?: () => void;
  onMoveToTopDeck?: () => void;
  onMoveToBottomDeck?: () => void;
  onMoveToDiscard?: () => void;
}

/**
 * Get button configs with callbacks for components like HandPanel
 * Excludes rotate/swing actions for hand panels
 */
export function getCardButtonConfigsWithActions(
  actions: ButtonAction[],
  callbacks: CardButtonCallbacks,
  faceUp: boolean = true,
  locked: boolean = false
): CardButtonConfigWithAction[] {
  // Exclude rotate and swing buttons from hand panel
  const filteredActions = actions.filter(action =>
    action !== 'rotate' &&
    action !== 'rotateClockwise' &&
    action !== 'rotateCounterClockwise' &&
    action !== 'swingClockwise' &&
    action !== 'swingCounterClockwise'
  );

  return filteredActions
    .map(action => {
      const config = getCardButtonConfig(action, faceUp, locked);
      if (!config) return null;

      let onAction: (() => void) | undefined;

      switch (action) {
        case 'flip':
          onAction = callbacks.onFlip;
          break;
        case 'layerUp':
          onAction = callbacks.onLayerUp;
          break;
        case 'layerDown':
          onAction = callbacks.onLayerDown;
          break;
        case 'clone':
          onAction = callbacks.onClone;
          break;
        case 'moveToHand':
          onAction = callbacks.onMoveToHand;
          break;
        case 'moveToTopDeck':
          onAction = callbacks.onMoveToTopDeck;
          break;
        case 'moveToBottomDeck':
          onAction = callbacks.onMoveToBottomDeck;
          break;
        case 'moveToDiscard':
          onAction = callbacks.onMoveToDiscard;
          break;
        default:
          return null;
      }

      if (!onAction) return null;

      return {
        ...config,
        onAction,
      };
    })
    .filter((config): config is CardButtonConfigWithAction => config !== null);
}
