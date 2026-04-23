import React from 'react';
import { Layers, Lock, Unlock, RefreshCw, Trash2, Copy, RotateCw, ChevronsUpDown, EyeOff, Hand, Shuffle, Undo, Search, ArrowUp, ArrowDown, CornerDownRight, Pin } from 'lucide-react';
import { ContextAction } from '../types';

interface ObjectActionButtonsProps {
  obj: any;
  dispatch: (action: any) => void;
  currentTool: string;
  executeClickAction?: (obj: any, action: string) => void;
}

/**
 * Action button configuration factory
 */
const createButtonConfigs = (obj: any, dispatch: any, executeClickAction?: (obj: any, action: string) => void) => ({
  flip: {
    key: 'flip',
    action: () => executeClickAction ? executeClickAction(obj, 'flip') : dispatch({ type: 'FLIP_CARD', payload: { cardId: obj.id } }),
    className: 'bg-purple-600 hover:bg-purple-500',
    title: 'Flip',
    icon: <EyeOff size={14} />
  },
  rotate: {
    key: 'rotate',
    action: () => executeClickAction ? executeClickAction(obj, 'rotate') : dispatch({ type: 'ROTATE_OBJECT', payload: { id: obj.id } }),
    className: 'bg-green-600 hover:bg-green-500',
    title: 'Rotate',
    icon: <RefreshCw size={14} />
  },
  rotateClockwise: {
    key: 'rotateClockwise',
    action: () => executeClickAction ? executeClickAction(obj, 'rotateClockwise') : dispatch({ type: 'ROTATE_OBJECT', payload: { id: obj.id } }),
    className: 'bg-green-600 hover:bg-green-500',
    title: 'Rotate CW',
    icon: <RefreshCw size={14} />
  },
  rotateCounterClockwise: {
    key: 'rotateCounterClockwise',
    action: () => executeClickAction ? executeClickAction(obj, 'rotateCounterClockwise') : dispatch({ type: 'ROTATE_OBJECT', payload: { id: obj.id } }),
    className: 'bg-green-600 hover:bg-green-500',
    title: 'Rotate CCW',
    icon: <RotateCw size={14} />
  },
  delete: {
    key: 'delete',
    action: () => executeClickAction ? executeClickAction(obj, 'delete') : dispatch({ type: 'DELETE_OBJECT', payload: { id: obj.id } }),
    className: 'bg-red-600 hover:bg-red-500',
    title: 'Delete',
    icon: <Trash2 size={14} />
  },
  clone: {
    key: 'clone',
    action: () => executeClickAction ? executeClickAction(obj, 'clone') : dispatch({ type: 'CLONE_OBJECT', payload: { id: obj.id } }),
    className: 'bg-cyan-600 hover:bg-cyan-500',
    title: 'Clone',
    icon: <Copy size={14} />
  },
  lock: {
    key: 'lock',
    action: () => executeClickAction ? executeClickAction(obj, 'lock') : dispatch({ type: 'TOGGLE_LOCK', payload: { id: obj.id } }),
    className: 'bg-yellow-600 hover:bg-yellow-500',
    title: obj.locked ? 'Unlock' : 'Lock',
    icon: obj.locked ? <Unlock size={14} /> : <Lock size={14} />
  },
  pin: {
    key: 'pin',
    action: () => executeClickAction ? executeClickAction(obj, 'pin') : dispatch({ type: 'UPDATE_OBJECT', payload: { id: obj.id, isPinnedToViewport: !(obj as any).isPinnedToViewport } }),
    className: 'bg-pink-600 hover:bg-pink-500',
    title: (obj as any).isPinnedToViewport ? 'Unpin' : 'Pin',
    icon: <Pin size={14} />
  },
  layer: {
    key: 'layer',
    action: () => executeClickAction ? executeClickAction(obj, 'layerUp') : dispatch({ type: 'MOVE_LAYER_UP', payload: { id: obj.id } }),
    className: 'bg-indigo-600 hover:bg-indigo-500',
    title: 'Layer Up',
    icon: <Layers size={14} />
  },
  layerUp: {
    key: 'layerUp',
    action: () => executeClickAction ? executeClickAction(obj, 'layerUp') : dispatch({ type: 'MOVE_LAYER_UP', payload: { id: obj.id } }),
    className: 'bg-blue-600 hover:bg-blue-500',
    title: 'Layer Up',
    icon: <ChevronsUpDown size={14} />
  },
  layerDown: {
    key: 'layerDown',
    action: () => executeClickAction ? executeClickAction(obj, 'layerDown') : dispatch({ type: 'MOVE_LAYER_DOWN', payload: { id: obj.id } }),
    className: 'bg-blue-600 hover:bg-blue-500',
    title: 'Layer Down',
    icon: <ChevronsUpDown size={14} />
  },
  // Deck actions
  draw: {
    key: 'draw',
    action: () => executeClickAction ? executeClickAction(obj, 'draw') : dispatch({ type: 'DRAW_CARD', payload: { deckId: obj.id } }),
    className: 'bg-blue-600 hover:bg-blue-500',
    title: 'Draw',
    icon: <Hand size={14} />
  },
  playTopCard: {
    key: 'playTopCard',
    action: () => executeClickAction ? executeClickAction(obj, 'playTopCard') : dispatch({ type: 'PLAY_TOP_CARD', payload: { deckId: obj.id } }),
    className: 'bg-green-600 hover:bg-green-500',
    title: 'Play Top',
    icon: <ArrowUp size={14} />
  },
  shuffleDeck: {
    key: 'shuffleDeck',
    action: () => {
      if (executeClickAction) {
        executeClickAction(obj, 'shuffleDeck');
      } else {
        window.dispatchEvent(new CustomEvent('deck-shuffle-start', { detail: { deckId: obj.id } }));
        dispatch({ type: 'SHUFFLE_DECK', payload: { deckId: obj.id } });
      }
    },
    className: 'bg-purple-600 hover:bg-purple-500',
    title: 'Shuffle',
    icon: <Shuffle size={14} />
  },
  millTopCard: {
    key: 'millTopCard',
    action: () => executeClickAction ? executeClickAction(obj, 'millTopCard') : null,
    className: 'bg-teal-600 hover:bg-teal-500',
    title: 'Mill',
    icon: <Undo size={14} />
  },
  toBottom: {
    key: 'toBottom',
    action: () => executeClickAction ? executeClickAction(obj, 'toBottom') : null,
    className: 'bg-yellow-500 hover:bg-yellow-400',
    title: 'To Bottom',
    icon: <ArrowDown size={14} />
  },
  searchDeck: {
    key: 'searchDeck',
    action: () => executeClickAction ? executeClickAction(obj, 'searchDeck') : null,
    className: 'bg-cyan-600 hover:bg-cyan-500',
    title: 'Search',
    icon: <Search size={14} />
  },
  topDeck: {
    key: 'topDeck',
    action: () => executeClickAction ? executeClickAction(obj, 'topDeck') : null,
    className: 'bg-orange-600 hover:bg-orange-500',
    title: 'Top Deck',
    icon: <ArrowUp size={14} />
  },
  piles: {
    key: 'piles',
    action: () => executeClickAction ? executeClickAction(obj, 'piles') : null,
    className: 'bg-indigo-600 hover:bg-indigo-500',
    title: 'Piles',
    icon: <Layers size={14} />
  },
  returnAll: {
    key: 'returnAll',
    action: () => executeClickAction ? executeClickAction(obj, 'returnAll') : dispatch({ type: 'RETURN_ALL_CARDS_TO_DECK', payload: { deckId: obj.id, shuffleAfter: false } }),
    className: 'bg-red-600 hover:bg-red-500',
    title: 'Return All',
    icon: <Undo size={14} />
  },
  // Card move actions
  moveToHand: {
    key: 'moveToHand',
    action: () => executeClickAction ? executeClickAction(obj, 'moveToHand') : null,
    className: 'bg-blue-600 hover:bg-blue-500',
    title: 'Move to Hand',
    icon: <Hand size={14} />
  },
  moveToTopDeck: {
    key: 'moveToTopDeck',
    action: () => executeClickAction ? executeClickAction(obj, 'moveToTopDeck') : null,
    className: 'bg-orange-600 hover:bg-orange-500',
    title: 'Move to Top',
    icon: <ArrowUp size={14} />
  },
  moveToBottomDeck: {
    key: 'moveToBottomDeck',
    action: () => executeClickAction ? executeClickAction(obj, 'moveToBottomDeck') : null,
    className: 'bg-yellow-600 hover:bg-yellow-500',
    title: 'Move to Bottom',
    icon: <ArrowDown size={14} />
  },
  moveToDiscard: {
    key: 'moveToDiscard',
    action: () => executeClickAction ? executeClickAction(obj, 'moveToDiscard') : null,
    className: 'bg-red-600 hover:bg-red-500',
    title: 'Mill',
    icon: <CornerDownRight size={14} />
  },
});

/**
 * ObjectActionButtons - renders action buttons for game objects
 * Used by cards, tokens, dice, counters, etc.
 */
export const ObjectActionButtons: React.FC<ObjectActionButtonsProps> = ({ obj, dispatch, currentTool, executeClickAction }) => {
  const actionButtons = obj.actionButtons || [];
  const buttonConfigs = createButtonConfigs(obj, dispatch, executeClickAction);

  const buttons = actionButtons
    .map((action: ContextAction) => buttonConfigs[action as keyof typeof buttonConfigs])
    .filter(Boolean)
    .slice(0, 4);

  if (buttons.length === 0) return null;

  return (
    <div className={`absolute -bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 opacity-0 transition-opacity z-20 pointer-events-none ${currentTool === 'none' || currentTool === 'zoom' ? 'group-hover:opacity-100' : ''}`}>
      {buttons.map((btn: any) => (
        <button
          key={btn.key}
          onClick={(e) => { e.stopPropagation(); btn.action(); }}
          className={`pointer-events-auto p-2 rounded-lg text-white shadow ${btn.className}`}
          title={btn.title}
        >
          {btn.icon}
        </button>
      ))}
    </div>
  );
};
