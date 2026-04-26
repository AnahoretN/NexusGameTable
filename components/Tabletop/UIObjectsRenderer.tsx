import React, { memo } from 'react';
import { DeckComponent } from '../DeckComponent';
import { UIObjectRendererOptimizedMemo as UIObjectRendererMemo } from '../UIObjectRendererOptimized';
import { PinnedIndicator } from '../PinnedIndicator';
import { TableObject, Deck as DeckType, PanelObject, WindowObject, ItemType } from '../../types';
import { TabletopRenderContext } from './types';

interface UIObjectsRendererProps {
  pinnedUIObjects: TableObject[];
  unpinnedUIObjects: TableObject[];
  pinnedDecks: DeckType[];
  unpinnedDecks: DeckType[];
  context: TabletopRenderContext;
  state: any;
  draggingId: string | null;
  activePlayerId: string;
  isGM: boolean;
  currentTool: string;
  onContextMenu: (e: React.MouseEvent, obj: TableObject) => void;
  onMouseDown: (e: React.MouseEvent, objId: string) => void;
  executeClickAction: (obj: any, action: string, event?: React.MouseEvent) => void;
  handleContextMenu: (e: React.MouseEvent, obj: TableObject) => void;
  handlePileContextMenu?: (e: React.MouseEvent, pile: any, deck: any) => void;
  dispatch: React.Dispatch<any>;
  setSearchModalDeck: (deck: DeckType) => void;
  setTopDeckModalDeck: (deck: DeckType) => void;
  setDeleteCandidateId: (id: string | null) => void;
}

export const UIObjectsRenderer = memo<UIObjectsRendererProps>(({
  pinnedUIObjects,
  unpinnedUIObjects,
  pinnedDecks,
  unpinnedDecks,
  context,
  state,
  draggingId,
  activePlayerId,
  isGM,
  currentTool,
  onContextMenu,
  onMouseDown,
  executeClickAction,
  handleContextMenu,
  handlePileContextMenu,
  dispatch,
  setSearchModalDeck,
  setTopDeckModalDeck,
  setDeleteCandidateId
}) => {
  const { v2p } = context;

  const renderPinnedDeck = (deck: DeckType) => {
    const deckObj = deck as DeckType;
    const pinnedPosition = (deckObj as any).pinnedScreenPosition;
    if (!pinnedPosition) return null;

    const canDrag = !deckObj.locked;
    const draggingClass = draggingId === deckObj.id ? 'cursor-grabbing z-[100000]' : (canDrag ? 'cursor-grab' : 'cursor-default');

    return (
      <div
        key={`pinned-deck-${deckObj.id}`}
        className="absolute"
        style={{
          left: pinnedPosition.x,
          top: pinnedPosition.y,
          pointerEvents: 'auto',
        }}
      >
        <PinnedIndicator />
        <div
          className={`inline-block ${currentTool !== 'none' && currentTool !== 'zoom' ? 'cursor-default' : draggingClass}`}
          onMouseDown={(e) => onMouseDown(e, deckObj.id)}
          onContextMenu={(e) => onContextMenu(e, deckObj)}
        >
          <DeckComponent
            deck={deckObj}
            state={state}
            allObjects={state.objects}
            activePlayerId={activePlayerId}
            isGM={isGM}
            executeClickAction={executeClickAction}
            handleContextMenu={handleContextMenu}
            handlePileContextMenu={handlePileContextMenu}
            dispatch={dispatch}
            setSearchModalDeck={setSearchModalDeck}
            setTopDeckModalDeck={setTopDeckModalDeck}
            setDeleteCandidateId={setDeleteCandidateId}
            pixelsPerVU={context.pixelsPerVU}
          />
        </div>
      </div>
    );
  };

  const renderUnpinnedDeck = (deck: DeckType) => {
    const deckObj = deck as DeckType;
    const canDrag = !deckObj.locked;
    const draggingClass = draggingId === deckObj.id ? 'cursor-grabbing z-[100000]' : (canDrag ? 'cursor-grab' : 'cursor-default');

    // Calculate global z-index for decks (cards layer: 1001-3000)
    const globalZIndex = 2000 + (deckObj.zIndex ?? 0);

    return (
      <div
        key={deckObj.id}
        className={`absolute inline-block ${currentTool !== 'none' && currentTool !== 'zoom' ? 'cursor-default' : draggingClass}`}
        style={{
          left: v2p(deckObj.x),
          top: v2p(deckObj.y),
          zIndex: globalZIndex,
        }}
        onMouseDown={(e) => onMouseDown(e, deckObj.id)}
        onContextMenu={(e) => onContextMenu(e, deckObj)}
      >
        <DeckComponent
          deck={deckObj}
          state={state}
          allObjects={state.objects}
          activePlayerId={activePlayerId}
          isGM={isGM}
          executeClickAction={executeClickAction}
          handleContextMenu={handleContextMenu}
          handlePileContextMenu={handlePileContextMenu}
          dispatch={dispatch}
          setSearchModalDeck={setSearchModalDeck}
          setTopDeckModalDeck={setTopDeckModalDeck}
          setDeleteCandidateId={setDeleteCandidateId}
          pixelsPerVU={context.pixelsPerVU}
        />
      </div>
    );
  };

  return (
    <>
      {/* Unpinned Decks - rendered in the transform container with other game objects */}
      {unpinnedDecks.map(deck => renderUnpinnedDeck(deck))}

      {/* Unpinned UI Objects Container - rendered outside transform, always above game objects */}
      <div className="fixed inset-0 pointer-events-none z-[9800]">
        {unpinnedUIObjects.map(uiObj => (
          <UIObjectRendererMemo
            key={uiObj.id}
            uiObject={uiObj as PanelObject | WindowObject}
            isDragging={draggingId === uiObj.id}
            onMouseDown={onMouseDown}
            onContextMenu={onContextMenu}
          />
        ))}
      </div>

      {/* Pinned UI Objects Container - rendered outside transform, not affected by camera/scroll */}
      <div className="fixed inset-0 pointer-events-none z-[9900]">
        {pinnedUIObjects.map(uiObj => (
          <UIObjectRendererMemo
            key={uiObj.id}
            uiObject={uiObj as PanelObject | WindowObject}
            isDragging={draggingId === uiObj.id}
            onMouseDown={onMouseDown}
            onContextMenu={onContextMenu}
          />
        ))}
      </div>

      {/* Pinned Game Objects Container - rendered outside transform, below panels */}
      <div className="fixed inset-0 pointer-events-none z-[500]">
        {pinnedDecks.map(deck => renderPinnedDeck(deck))}
      </div>
    </>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for UIObjectsRenderer
  // Check if draggingId changed - always re-render when dragging
  if (prevProps.draggingId !== nextProps.draggingId) {
    return false;
  }

  // For dragging panels, check position changes in objects
  if (nextProps.draggingId) {
    // If something is being dragged, check if positions of UI objects changed
    const prevUnpinnedPositions = prevProps.unpinnedUIObjects.map(o => `${o.id}:${o.x}:${o.y}`).join('|');
    const nextUnpinnedPositions = nextProps.unpinnedUIObjects.map(o => `${o.id}:${o.x}:${o.y}`).join('|');
    if (prevUnpinnedPositions !== nextUnpinnedPositions) return false;

    const prevPinnedPositions = prevProps.pinnedUIObjects.map(o => `${o.id}:${o.x}:${o.y}`).join('|');
    const nextPinnedPositions = nextProps.pinnedUIObjects.map(o => `${o.id}:${o.x}:${o.y}`).join('|');
    if (prevPinnedPositions !== nextPinnedPositions) return false;
  }

  // Default shallow comparison for other props
  return (
    prevProps.pinnedUIObjects === nextProps.pinnedUIObjects &&
    prevProps.unpinnedUIObjects === nextProps.unpinnedUIObjects &&
    prevProps.pinnedDecks === nextProps.pinnedDecks &&
    prevProps.unpinnedDecks === nextProps.unpinnedDecks &&
    prevProps.context === nextProps.context &&
    prevProps.state === nextProps.state &&
    prevProps.activePlayerId === nextProps.activePlayerId &&
    prevProps.isGM === nextProps.isGM &&
    prevProps.currentTool === nextProps.currentTool &&
    prevProps.onContextMenu === nextProps.onContextMenu &&
    prevProps.onMouseDown === nextProps.onMouseDown &&
    prevProps.executeClickAction === nextProps.executeClickAction &&
    prevProps.handleContextMenu === nextProps.handleContextMenu &&
    prevProps.handlePileContextMenu === nextProps.handlePileContextMenu &&
    prevProps.dispatch === nextProps.dispatch &&
    prevProps.setSearchModalDeck === nextProps.setSearchModalDeck &&
    prevProps.setTopDeckModalDeck === nextProps.setTopDeckModalDeck &&
    prevProps.setDeleteCandidateId === nextProps.setDeleteCandidateId
  );
});

UIObjectsRenderer.displayName = 'UIObjectsRenderer';

// Export memoized component with custom comparison
export const UIObjectsRendererMemo = memo(UIObjectsRenderer, (prevProps, nextProps) => {
  // Check if draggingId changed - always re-render when dragging
  if (prevProps.draggingId !== nextProps.draggingId) {
    return false;
  }

  // For dragging panels, check position changes in objects
  if (nextProps.draggingId) {
    const prevUnpinnedPositions = prevProps.unpinnedUIObjects.map(o => `${o.id}:${o.x}:${o.y}`).join('|');
    const nextUnpinnedPositions = nextProps.unpinnedUIObjects.map(o => `${o.id}:${o.x}:${o.y}`).join('|');
    if (prevUnpinnedPositions !== nextUnpinnedPositions) return false;

    const prevPinnedPositions = prevProps.pinnedUIObjects.map(o => `${o.id}:${o.x}:${o.y}`).join('|');
    const nextPinnedPositions = nextProps.pinnedUIObjects.map(o => `${o.id}:${o.x}:${o.y}`).join('|');
    if (prevPinnedPositions !== nextPinnedPositions) return false;
  }

  // Default shallow comparison for other props
  return (
    prevProps.pinnedUIObjects === nextProps.pinnedUIObjects &&
    prevProps.unpinnedUIObjects === nextProps.unpinnedUIObjects &&
    prevProps.pinnedDecks === nextProps.pinnedDecks &&
    prevProps.unpinnedDecks === nextProps.unpinnedDecks &&
    prevProps.context === nextProps.context &&
    prevProps.state === nextProps.state &&
    prevProps.activePlayerId === nextProps.activePlayerId &&
    prevProps.isGM === nextProps.isGM &&
    prevProps.currentTool === nextProps.currentTool &&
    prevProps.onContextMenu === nextProps.onContextMenu &&
    prevProps.onMouseDown === nextProps.onMouseDown &&
    prevProps.executeClickAction === nextProps.executeClickAction &&
    prevProps.handleContextMenu === nextProps.handleContextMenu &&
    prevProps.handlePileContextMenu === nextProps.handlePileContextMenu &&
    prevProps.dispatch === nextProps.dispatch &&
    prevProps.setSearchModalDeck === nextProps.setSearchModalDeck &&
    prevProps.setTopDeckModalDeck === nextProps.setTopDeckModalDeck &&
    prevProps.setDeleteCandidateId === nextProps.setDeleteCandidateId
  );
});

UIObjectsRendererMemo.displayName = 'UIObjectsRendererMemo';