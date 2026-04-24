import { TableObject, ItemType, Deck as DeckType, CardLocation } from '../types';
import { executeContextMenuAction, ContextMenuActionParams } from './contextMenuActions';

/**
 * Universal action buttons handler that works for both pool panels and main tabletop
 * This provides a consistent way to handle action button clicks across different contexts
 *
 * Refactored to use executeContextMenuAction to eliminate code duplication
 */
export interface ActionButtonsHandlerContext {
  dispatch: (action: any) => void;
  setDeleteCandidateId?: (id: string | null) => void;
  setSearchModalDeck?: (deck: DeckType) => void;
  setTopDeckModalDeck?: (deck: DeckType) => void;
  setSearchModalPile?: (pile: any) => void;
  setSettingsModalObj?: (obj: TableObject) => void;
  setContextMenu?: (menu: any) => void;
  setNexusBoardAddingCell?: (id: string | null) => void;
  animateDiceRoll?: (dice: any) => void;
  activePlayerId?: string;
  objects?: Record<string, any>;
  state: any;
  isGM?: boolean;
}

/**
 * Execute an action button click universally
 * This function works for both pool panels and main tabletop
 * Delegates to executeContextMenuAction to avoid code duplication
 */
export function executeActionButtonUniversal(
  obj: TableObject,
  action: string,
  context: ActionButtonsHandlerContext
) {
  const {
    dispatch,
    setDeleteCandidateId,
    setSearchModalDeck,
    setTopDeckModalDeck,
    setSearchModalPile,
    setSettingsModalObj,
    setContextMenu,
    setNexusBoardAddingCell,
    animateDiceRoll,
    activePlayerId,
    objects,
    state,
    isGM
  } = context;

  // Build params for executeContextMenuAction
  const params: ContextMenuActionParams = {
    object: obj,
    dispatch,
    state: state || { objects: objects || {}, activePlayerId },
    activePlayerId,
    isGM,
    setDeleteCandidateId,
    setSearchModalDeck: (deck: DeckType | null) => setSearchModalDeck?.(deck as DeckType),
    setTopDeckModalDeck,
    setSearchModalPile,
    setSettingsModalObj,
    setContextMenu,
    setNexusBoardAddingCell,
    animateDiceRoll,
  };

  // Delegate to the shared context menu action handler
  executeContextMenuAction(action, params);
}
