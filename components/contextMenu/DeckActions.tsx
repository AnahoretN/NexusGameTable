/**
 * Deck Actions Component
 * Handles deck-specific actions (draw, shuffle, search, etc.)
 */

import React from 'react';
import { ContextAction, Deck } from '../../types';
import { Hand, Shuffle, Search, Eye, EyeOff, Undo, ArrowDown, CornerDownRight, RotateCw } from 'lucide-react';
import { Locale } from '../../utils/translations';

export interface DeckActionsProps {
  deck: Deck;
  canPerformAction: (action: ContextAction) => boolean;
  onAction: (action: ContextAction) => void;
  language?: Locale;
  hasCursorSlotCards?: boolean;
}

export const DeckActions: React.FC<DeckActionsProps> = ({
  deck,
  canPerformAction,
  onAction,
  language = 'en',
  hasCursorSlotCards = false
}) => {
  const t = (key: string) => key; // Simplified

  return (
    <>
      {/* Draw/Play actions */}
      {canPerformAction('draw') && (
        <button
          onClick={() => onAction('draw')}
          className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
        >
          <Hand size={14} />
          <span>{t('Draw')}</span>
        </button>
      )}
      {canPerformAction('playTopCard') && (
        <button
          onClick={() => onAction('playTopCard')}
          className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
        >
          <ArrowDown size={14} />
          <span>{t('Play Top')}</span>
        </button>
      )}

      {/* Shuffle and Search */}
      {canPerformAction('shuffleDeck') && (
        <button
          onClick={() => onAction('shuffleDeck')}
          className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
        >
          <Shuffle size={14} />
          <span>{t('Shuffle')}</span>
        </button>
      )}
      {canPerformAction('searchDeck') && (
        <button
          onClick={() => onAction('searchDeck')}
          className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
        >
          <Search size={14} />
          <span>{t('Search')}</span>
        </button>
      )}

      {/* Mill actions */}
      {deck.piles && deck.piles.length > 0 && canPerformAction('millTopCard') && (
        <button
          onClick={() => onAction('millTopCard')}
          className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
        >
          <Undo size={14} />
          <span>{t('Mill')}</span>
        </button>
      )}

      {/* Show/Hide top card */}
      {canPerformAction('showTop') && canPerformAction('hideTop') && (
        <button
          onClick={() => onAction(deck.showTopCard ? 'hideTop' : 'showTop')}
          className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
        >
          <Eye size={14} />
          <span>{deck.showTopCard ? t('Hide Top') : t('Show Top')}</span>
        </button>
      )}

      {/* Return all actions */}
      {canPerformAction('returnAll') && hasCursorSlotCards && (
        <button
          onClick={() => onAction('returnAll')}
          className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
        >
          <CornerDownRight size={14} />
          <span>{t('Return All')}</span>
        </button>
      )}
      {canPerformAction('returnAllAndShuffle') && hasCursorSlotCards && (
        <button
          onClick={() => onAction('returnAllAndShuffle')}
          className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
        >
          <RotateCw size={14} />
          <span>{t('Return & Shuffle')}</span>
        </button>
      )}
    </>
  );
};

export const DECK_ACTIONS: ContextAction[] = [
  'draw',
  'playTopCard',
  'shuffleDeck',
  'searchDeck',
  'millTopCard',
  'showTop',
  'hideTop',
  'returnAll',
  'returnAllAndShuffle'
];

/**
 * Check if deck has any actions available
 */
export function hasDeckActions(
  deck: Deck,
  canPerformAction: (action: ContextAction) => boolean
): boolean {
  return DECK_ACTIONS.some(action => canPerformAction(action));
}
