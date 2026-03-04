import React from 'react';
import { Hand, Eye, EyeOff, Shuffle, RefreshCw, Copy, Trash2, Lock, Unlock, Layers, Undo, Search, Pin, ArrowUp, ArrowDown, CornerDownRight } from 'lucide-react';
import { ContextAction, AppLanguage } from '../types';
import { t as translate, Locale } from './translations';

// Re-export ContextAction for convenience
export type ButtonAction = ContextAction;

// Mapping from button action to English text (used as translation key)
const ACTION_LABELS: Record<ButtonAction, string> = {
  flip: 'Flip',
  rotateClockwise: 'Rotate Clockwise',
  rotateCounterClockwise: 'Rotate Counter-Clockwise',
  swingClockwise: 'Swing Clockwise',
  swingCounterClockwise: 'Swing Counter-Clockwise',
  clone: 'Clone',
  delete: 'Delete',
  lock: 'Lock',
  pin: 'Pin',
  layerUp: 'Layer Up',
  layerDown: 'Layer Down',
  draw: 'Draw Card',
  playTopCard: 'Play Top',
  millTopCard: 'Mill',
  toBottom: 'To Bottom',
  shuffleDeck: 'Shuffle',
  searchDeck: 'Search',
  topDeck: 'Top Deck (section)',
  piles: 'Piles',
  returnAll: 'Return All',
  hide: 'Hide/Show',
  millToBottom: 'To Bottom',
  showTop: 'Show Top',
  // "Move to" actions
  moveToHand: 'Move to Hand',
  moveToTopDeck: 'Move to Top Deck',
  moveToBottomDeck: 'Move to Bottom Deck',
  moveToDiscard: 'Move to Discard',
  // Abstract actions (no buttons, but needed for type completeness)
  rotate: 'Rotation',
  layer: 'Change Layer',
  moveTo: 'Move to...',
};

// Base button configuration (styling only)
// Note: Not all ContextAction values have buttons (e.g., 'rotate', 'layer', 'moveTo' are abstract)
export const BUTTON_STYLES: Partial<Record<ButtonAction, { className: string }>> = {
  flip: { className: 'bg-purple-600 hover:bg-purple-500' },
  rotateClockwise: { className: 'bg-yellow-600 hover:bg-yellow-500' },
  rotateCounterClockwise: { className: 'bg-yellow-600 hover:bg-yellow-500' },
  swingClockwise: { className: 'bg-orange-600 hover:bg-orange-500' },
  swingCounterClockwise: { className: 'bg-orange-600 hover:bg-orange-500' },
  clone: { className: 'bg-cyan-600 hover:bg-cyan-500' },
  delete: { className: 'bg-red-600 hover:bg-red-500' },
  lock: { className: 'bg-yellow-600 hover:bg-yellow-500' },
  pin: { className: 'bg-pink-600 hover:bg-pink-500' },
  layerUp: { className: 'bg-blue-600 hover:bg-blue-500' },
  layerDown: { className: 'bg-blue-600 hover:bg-blue-500' },
  draw: { className: 'bg-blue-600 hover:bg-blue-500' },
  playTopCard: { className: 'bg-green-600 hover:bg-green-500' },
  millTopCard: { className: 'bg-teal-600 hover:bg-teal-500' },
  toBottom: { className: 'bg-yellow-500 hover:bg-yellow-400' },
  shuffleDeck: { className: 'bg-purple-600 hover:bg-purple-500' },
  searchDeck: { className: 'bg-cyan-600 hover:bg-cyan-500' },
  topDeck: { className: 'bg-orange-600 hover:bg-orange-500' },
  piles: { className: 'bg-indigo-600 hover:bg-indigo-500' },
  returnAll: { className: 'bg-red-600 hover:bg-red-500' },
  hide: { className: 'bg-slate-600 hover:bg-slate-500' },
  millToBottom: { className: 'bg-teal-600 hover:bg-teal-500' },
  showTop: { className: 'bg-pink-600 hover:bg-pink-500' },
  // "Move to" actions
  moveToHand: { className: 'bg-blue-600 hover:bg-blue-500' },
  moveToTopDeck: { className: 'bg-orange-600 hover:bg-orange-500' },
  moveToBottomDeck: { className: 'bg-yellow-600 hover:bg-yellow-500' },
  moveToDiscard: { className: 'bg-red-600 hover:bg-red-500' },
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
  hide: () => <Trash2 size={14} />,
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
  locked: boolean,
  language: AppLanguage = 'en'
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

  // Get translated title
  let title: string;
  if (action === 'lock') {
    title = locked
      ? translate('Unlock', language as Locale)
      : translate('Lock', language as Locale);
  } else if (action === 'pin') {
    title = locked
      ? translate('Unpin', language as Locale)
      : translate('Pin', language as Locale);
  } else {
    const label = ACTION_LABELS[action as ButtonAction];
    title = label ? translate(label, language as Locale) : action;
  }

  return {
    action,
    className: style.className,
    title,
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
 * Excludes rotate/swing actions and "Move to Hand" from hand panel (cards already in hand)
 */
export function getCardButtonConfigsWithActions(
  actions: ButtonAction[],
  callbacks: CardButtonCallbacks,
  faceUp: boolean = true,
  locked: boolean = false,
  language: AppLanguage = 'en'
): CardButtonConfigWithAction[] {
  // Exclude rotate, swing, and "Move to Hand" buttons from hand panel
  const filteredActions = actions.filter(action =>
    action !== 'rotate' &&
    action !== 'rotateClockwise' &&
    action !== 'rotateCounterClockwise' &&
    action !== 'swingClockwise' &&
    action !== 'swingCounterClockwise' &&
    action !== 'moveToHand'
  );

  return filteredActions
    .map(action => {
      const config = getCardButtonConfig(action, faceUp, locked, language);
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
