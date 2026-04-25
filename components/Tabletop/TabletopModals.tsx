/**
 * TabletopModals.tsx
 *
 * Consolidated modal components for Tabletop
 * Handles all modal dialogs: context menus, settings, confirmations, etc.
 *
 * @component TabletopModals
 * @description Centralized modal management for Tabletop component
 * @stage 6 of Tabletop.tsx refactoring
 */

import React, { useCallback, memo } from 'react';
import { ContextMenu } from '../ContextMenu';
import { PileContextMenu } from '../PileContextMenu';
import { ObjectSettingsModal } from '../ObjectSettingsModal';
import { DeleteConfirmModal } from '../DeleteConfirmModal';
import { SearchDeckModal } from '../SearchDeckModal';
import { TopDeckModal } from '../TopDeckModal';
import { executeContextMenuAction } from '../../utils/contextMenuActions';
import { TableObject, DeckType, CardPile } from '../types';
import { ItemType } from '../../types';

/**
 * Props for TabletopModals component
 */
export interface TabletopModalsProps {
  // Modal states
  contextMenu: { x: number; y: number; object: TableObject; shiftKey?: boolean } | null;
  settingsModalObj: TableObject | null;
  deleteCandidateId: string | null;
  pileContextMenu: { x: number; y: number; pile: CardPile; deck: DeckType } | null;
  searchModalDeck: DeckType | null;
  searchModalPile?: CardPile;
  topDeckModalDeck: DeckType | null;

  // Setters for modal states
  setContextMenu: React.Dispatch<React.SetStateAction<{ x: number; y: number; object: TableObject; shiftKey?: boolean } | null>>;
  setSettingsModalObj: React.Dispatch<React.SetStateAction<TableObject | null>>;
  setDeleteCandidateId: React.Dispatch<React.SetStateAction<string | null>>;
  setPileContextMenu: React.Dispatch<React.SetStateAction<{ x: number; y: number; pile: CardPile; deck: DeckType } | null>>;
  setSearchModalDeck: React.Dispatch<React.SetStateAction<DeckType | null>>;
  setSearchModalPile: React.Dispatch<React.SetStateAction<CardPile | undefined>>;
  setTopDeckModalDeck: React.Dispatch<React.SetStateAction<DeckType | null>>;

  // Additional context for modals
  state: any;
  dispatch: React.Dispatch<any>;
  activePlayerId: string;
  isGM: boolean;
  language: string;
}

/**
 * TabletopModals Component
 *
 * Consolidates all modal dialogs used in Tabletop:
 * - Context menus for objects and piles
 * - Settings modals for object configuration
 * - Confirmation modals for destructive actions
 * - Search and deck management modals
 */
export const TabletopModals = memo(({
  contextMenu,
  settingsModalObj,
  deleteCandidateId,
  pileContextMenu,
  searchModalDeck,
  searchModalPile,
  topDeckModalDeck,
  setContextMenu,
  setSettingsModalObj,
  setDeleteCandidateId,
  setPileContextMenu,
  setSearchModalDeck,
  setSearchModalPile,
  setTopDeckModalDeck,
  state,
  dispatch,
  activePlayerId,
  isGM,
  language,
}: TabletopModalsProps) => {

  /**
   * Handle context menu action selection
   */
  const handleContextMenuAction = useCallback((action: string) => {
    if (!contextMenu) return;

    executeContextMenuAction(action, {
      object: contextMenu.object,
      state,
      dispatch,
      activePlayerId,
      isGM,
      shiftKey: contextMenu.shiftKey,
      setSettingsModalObj,
      setDeleteCandidateId,
      setSearchModalDeck,
      setSearchModalPile,
      setTopDeckModalDeck,
    });

    // Close context menu after action (except for configure/delete which open their own modals)
    if (setContextMenu && action !== 'configure' && action !== 'delete') {
      setContextMenu(null);
    }
  }, [
    contextMenu,
    state,
    dispatch,
    activePlayerId,
    isGM,
    setSettingsModalObj,
    setDeleteCandidateId,
    setSearchModalDeck,
    setSearchModalPile,
    setTopDeckModalDeck,
    setContextMenu,
  ]);

  /**
   * Handle pile context menu action selection
   */
  const handlePileContextMenuAction = useCallback((action: string) => {
    if (!pileContextMenu) return;

    const { pile, deck } = pileContextMenu;

    switch (action) {
      case 'search':
        setSearchModalDeck(deck);
        setSearchModalPile(pile);
        setPileContextMenu(null);
        break;
      case 'search_deck':
      case 'searchDeck':
        setSearchModalDeck(deck);
        setSearchModalPile(undefined);
        setPileContextMenu(null);
        break;
      case 'flip_all_face_up':
        dispatch({ type: 'FLIP_PILE', pileId: pile.id, faceUp: true });
        setPileContextMenu(null);
        break;
      case 'flip_all_face_down':
        dispatch({ type: 'FLIP_PILE', pileId: pile.id, faceUp: false });
        setPileContextMenu(null);
        break;
      case 'shuffle':
        dispatch({ type: 'SHUFFLE_PILE', pileId: pile.id });
        setPileContextMenu(null);
        break;
      case 'deal_one':
        dispatch({ type: 'DEAL_CARDS', pileId: pile.id, count: 1 });
        setPileContextMenu(null);
        break;
      case 'deal_five':
        dispatch({ type: 'DEAL_CARDS', pileId: pile.id, count: 5 });
        setPileContextMenu(null);
        break;
      case 'reset':
        dispatch({ type: 'RESET_PILE', pileId: pile.id });
        setPileContextMenu(null);
        break;
      case 'delete':
        setDeleteCandidateId(pile.id);
        setPileContextMenu(null);
        break;
      case 'draw':
        // Draw from pile (not from deck)
        dispatch({ type: 'DRAW_FROM_PILE', payload: { pileId: pile.id, deckId: deck.id, playerId: activePlayerId } });
        setPileContextMenu(null);
        break;
      case 'showTop':
        // Toggle showTopCard for pile
        dispatch({ type: 'TOGGLE_SHOW_TOP_CARD', payload: { deckId: deck.id, pileId: pile.id } });
        setPileContextMenu(null);
        break;
      case 'playTopCard':
        // Play top card from pile to cursor slot
        if (pile.cardIds.length > 0) {
          const topCardId = pile.cardIds[0];
          const card = state.objects[topCardId];
          if (card) {
            const cardWidth = deck.cardWidth ?? card.width ?? 63;
            const cardHeight = deck.cardHeight ?? card.height ?? 88;
            const clickOffsetX = cardWidth / 2;
            const clickOffsetY = cardHeight / 2;

            // Dispatch event to add to cursor slot
            window.dispatchEvent(new CustomEvent('add-to-cursor-slot', {
              detail: {
                cardId: card.id,
                clientX: pileContextMenu.x,
                clientY: pileContextMenu.y,
                source: 'pile',
                cardOverride: {
                  ...card,
                  location: 'CURSOR_SLOT' as any,
                  faceUp: pile.faceUp ?? true,
                  isOnTable: false,
                  width: cardWidth,
                  height: cardHeight,
                },
                clickOffsetX,
                clickOffsetY
              }
            }));

            // Remove card from pile
            dispatch({ type: 'DRAW_FROM_PILE', payload: { pileId: pile.id, deckId: deck.id, playerId: activePlayerId } });
          }
        }
        setPileContextMenu(null);
        break;
      case 'lock':
        dispatch({ type: 'UPDATE_OBJECT', payload: { id: pile.id, locked: !pile.locked } });
        setPileContextMenu(null);
        break;
      case 'returnAll':
        // Return all cards from this pile to deck only
        dispatch({ type: 'RETURN_ALL_CARDS_TO_DECK', payload: { deckId: deck.id, fromPile: true, pileId: pile.id } });
        setPileContextMenu(null);
        break;
      default:
        setPileContextMenu(null);
        break;
    }
  }, [
    pileContextMenu,
    dispatch,
    setSearchModalDeck,
    setSearchModalPile,
    setPileContextMenu,
    setDeleteCandidateId,
    activePlayerId,
    state.objects,
  ]);

  /**
   * Handle object settings update
   */
  const handleObjectSettingsUpdate = useCallback((updatedObj: TableObject) => {
    if (!settingsModalObj) return;

    // Handle deck-specific logic
    if (settingsModalObj.type === ItemType.DECK && updatedObj.type === ItemType.DECK) {
      const oldDeck = settingsModalObj as DeckType;
      const newDeck = updatedObj as DeckType;

      // Clear search modal if deck properties changed significantly
      if (
        oldDeck.name !== newDeck.name ||
        oldDeck.backImageUrl !== newDeck.backImageUrl ||
        oldDeck.cardIds.length !== newDeck.cardIds.length
      ) {
        setSearchModalDeck(null);
        setSearchModalPile(undefined);
      }
    }

    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: updatedObj.id,
        updates: updatedObj
      }
    });
    setSettingsModalObj(null);
  }, [
    settingsModalObj,
    dispatch,
    setSearchModalDeck,
    setSearchModalPile,
    setSettingsModalObj,
  ]);

  /**
   * Handle delete confirmation
   */
  const handleDeleteConfirm = useCallback(() => {
    if (!deleteCandidateId) return;

    dispatch({
      type: 'DELETE_OBJECT',
      payload: { id: deleteCandidateId }
    });
    setDeleteCandidateId(null);
  }, [deleteCandidateId, dispatch, setDeleteCandidateId]);

  /**
   * Handle close modals
   */
  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, [setContextMenu]);

  const handleCloseSettingsModal = useCallback(() => {
    setSettingsModalObj(null);
  }, [setSettingsModalObj]);

  const handleCloseDeleteModal = useCallback(() => {
    setDeleteCandidateId(null);
  }, [setDeleteCandidateId]);

  const handleClosePileContextMenu = useCallback(() => {
    setPileContextMenu(null);
  }, [setPileContextMenu]);

  const handleCloseSearchModal = useCallback(() => {
    setSearchModalDeck(null);
    setSearchModalPile(undefined);
  }, [setSearchModalDeck, setSearchModalPile]);

  const handleCloseTopDeckModal = useCallback(() => {
    setTopDeckModalDeck(null);
  }, [setTopDeckModalDeck]);

  return (
    <>
      {/* Context Menu for Objects */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          object={contextMenu.object}
          allObjects={state.objects}
          isGM={isGM}
          language={language}
          onAction={handleContextMenuAction}
          onClose={handleCloseContextMenu}
        />
      )}

      {/* Object Settings Modal */}
      {settingsModalObj && (
        <ObjectSettingsModal
          object={settingsModalObj}
          state={state}
          dispatch={dispatch}
          activePlayerId={activePlayerId}
          isGM={isGM}
          language={language}
          onSave={handleObjectSettingsUpdate}
          onClose={handleCloseSettingsModal}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteCandidateId && (
        <DeleteConfirmModal
          objectId={deleteCandidateId}
          state={state}
          dispatch={dispatch}
          onConfirm={handleDeleteConfirm}
          onClose={handleCloseDeleteModal}
        />
      )}

      {/* Pile Context Menu */}
      {pileContextMenu && (
        <PileContextMenu
          x={pileContextMenu.x}
          y={pileContextMenu.y}
          pile={pileContextMenu.pile}
          deck={pileContextMenu.deck}
          language={language}
          onAction={handlePileContextMenuAction}
          onClose={handleClosePileContextMenu}
        />
      )}

      {/* Search Deck/Pile Modal */}
      {searchModalDeck && (
        <SearchDeckModal
          deck={searchModalDeck}
          pile={searchModalPile}
          state={state}
          dispatch={dispatch}
          activePlayerId={activePlayerId}
          isGM={isGM}
          language={language}
          onClose={handleCloseSearchModal}
        />
      )}

      {/* Top Deck Modal */}
      {topDeckModalDeck && (
        <TopDeckModal
          deck={topDeckModalDeck}
          state={state}
          dispatch={dispatch}
          activePlayerId={activePlayerId}
          isGM={isGM}
          language={language}
          onClose={handleCloseTopDeckModal}
        />
      )}
    </>
  );
});

TabletopModals.displayName = 'TabletopModals';

/**
 * Export memoized component
 */
export const TabletopModalsMemo = memo(TabletopModals, (prevProps, nextProps) => {
  return (
    prevProps.contextMenu === nextProps.contextMenu &&
    prevProps.settingsModalObj === nextProps.settingsModalObj &&
    prevProps.deleteCandidateId === nextProps.deleteCandidateId &&
    prevProps.pileContextMenu === nextProps.pileContextMenu &&
    prevProps.searchModalDeck === nextProps.searchModalDeck &&
    prevProps.searchModalPile === nextProps.searchModalPile &&
    prevProps.topDeckModalDeck === nextProps.topDeckModalDeck &&
    prevProps.state === nextProps.state &&
    prevProps.activePlayerId === nextProps.activePlayerId &&
    prevProps.isGM === nextProps.isGM &&
    prevProps.language === nextProps.language
  );
});

TabletopModalsMemo.displayName = 'TabletopModalsMemo';