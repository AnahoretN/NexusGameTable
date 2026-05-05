/**
 * useTokenArchetype - Hook for handling token archetype interactions
 *
 * This hook manages:
 * - Adding token copies from archetypes to cursor slot
 * - Dropping token copies from cursor slot to table
 * - Updating token copies when archetype settings change
 *
 * Based on the original functionality from Tabletop.tsx (old version)
 *
 * @version 2.0.0
 * @since 2026-04-22
 */

import { useEffect, useRef } from 'react';
import { useGame } from '../../store/GameContext';
import { useViewTransform } from '../../store/contexts';
import { ItemType, TokenType, Token } from '../../types';
import { generateUUID } from '../../utils/uuid';

interface UseTokenArchetypeProps {
  cursorSlot: any[];
  setCursorSlot: React.Dispatch<React.SetStateAction<any[]>>;
  setCursorPosition: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>;
  cursorPositionRef: React.MutableRefObject<{ x: number; y: number } | null>;
  cursorSlotLastAddedRef: React.MutableRefObject<number>;
  setCursorSlotSource: React.Dispatch<React.SetStateAction<'hold' | 'shift' | 'archetype' | null>>;
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  pixelsPerVU: number;
  p2v: (px: number) => number;
  isAddingTokenRef?: React.MutableRefObject<boolean>;
}

/**
 * Hook for handling token archetype interactions
 */
export const useTokenArchetype = (props: UseTokenArchetypeProps) => {
  const {
    cursorSlot,
    setCursorSlot,
    setCursorPosition,
    cursorPositionRef,
    cursorSlotLastAddedRef,
    setCursorSlotSource,
    scrollContainerRef,
    pixelsPerVU,
    p2v,
    isAddingTokenRef = { current: false },
  } = props;

  const { state, dispatch } = useGame();
  const viewTransform = useViewTransform();
  const cursorSlotRef = useRef<any[]>(cursorSlot);

  // Sync cursorSlotRef
  useEffect(() => {
    cursorSlotRef.current = cursorSlot;
  }, [cursorSlot]);

  // Handle add-token-to-cursor-slot events from TokensPanel
  // This adds a new token copy from archetype to cursor slot on each click
  useEffect(() => {
    const handleAddTokenToSlot = (e: Event) => {
      // Set flag to prevent slot from being dropped during this operation
      isAddingTokenRef.current = true;

      // Prevent event from propagating to avoid clearing the slot
      e.preventDefault();
      e.stopPropagation();

      const customEvent = e as CustomEvent<{ archetypeId: string; clientX?: number; clientY?: number }>;
      const { archetypeId, clientX, clientY } = customEvent.detail;
      const archetype = state.objects[archetypeId] as TokenType;

      if (!archetype || archetype.type !== ItemType.TOKEN_TYPE) {
        isAddingTokenRef.current = false;
        return;
      }
      if (cursorSlot.length >= 100) {
        isAddingTokenRef.current = false;
        return;
      }

      // Get current spawn count for naming
      const currentCount = archetype.spawnCount || 0;

      // ALWAYS create a NEW token copy from archetype (not add existing tokens)
      const newTokenId = generateUUID();

      const defaultSize = archetype.defaultSize || { width: 50, height: 50 };
      const newToken: TokenType = {
        id: newTokenId,
        type: ItemType.TOKEN,
        // Use archetype name for token-copy (or auto-generated name)
        name: archetype.autoName && archetype.namePrefix
          ? `${archetype.namePrefix} ${currentCount + 1}`
          : archetype.name,
        x: 0,
        y: 0,
        width: defaultSize.width,
        height: defaultSize.height,
        rotation: 0,
        content: archetype.content,
        shape: archetype.shape,
        color: archetype.color,
        borderColor: archetype.borderColor,
        borderWidth: archetype.borderWidth,
        opacity: archetype.opacity,
        borderOpacity: archetype.borderOpacity,
        locked: false,
        isOnTable: false,
        inCursorSlot: true,
        archetypeId: archetype.id,
        // Store display settings from archetype
        showName: (archetype as any).showName || false,
        showNameOnToken: (archetype as any).showNameOnToken || false,
        fontColor: (archetype as any).fontColor,
        // IMPORTANT: Set zIndex to maintain layer relationships
        zIndex: archetype.zIndex ?? 3000,
        hyperscaleLayerId: 'tokens',
        // Inherit action settings from archetype
        allowedActions: archetype.allowedActions,
        allowedActionsForGM: archetype.allowedActionsForGM,
        actionButtons: archetype.actionButtons,
        singleClickAction: archetype.singleClickAction,
        doubleClickAction: archetype.doubleClickAction,
        rotationStep: archetype.rotationStep,
      };

      // Add token to objects list
      dispatch({ type: 'ADD_OBJECT', payload: newToken });

      // Increment spawn count on archetype atomically
      dispatch({
        type: 'UPDATE_OBJECT',
        payload: {
          id: archetypeId,
          spawnCount: currentCount + 1
        }
      });

      // Add to cursor slot
      const tokenClone: TokenType = { ...newToken };
      (tokenClone as any).cursorSlotIndex = cursorSlot.length;
      (tokenClone as any).originalZIndex = newToken.zIndex ?? 0;
      (tokenClone as any).source = 'shift'; // Use 'shift' for Ctrl+click behavior

      setCursorSlot(prev => {
        return [...prev, tokenClone];
      });
      cursorSlotRef.current = [...cursorSlotRef.current, tokenClone];

      // Set cursor position to show tokens immediately (use provided coords or current mouse position)
      if (clientX !== undefined && clientY !== undefined) {
        const pos = { x: clientX, y: clientY };
        setCursorPosition(pos);
        cursorPositionRef.current = pos;
      }

      // Set source to 'shift' to behave like Ctrl+click (drop on click, not on mouseup)
      setCursorSlotSource('shift');

      isAddingTokenRef.current = false;
    };

    window.addEventListener('add-token-to-cursor-slot', handleAddTokenToSlot, { passive: false } as any);
    return () => window.removeEventListener('add-token-to-cursor-slot', handleAddTokenToSlot);
  }, [cursorSlot.length, dispatch, state.objects, setCursorSlot, setCursorPosition, cursorPositionRef, setCursorSlotSource, isAddingTokenRef]);

  // Handle drop-cursor-slot-at-position events from TokensPanel
  // This drops all tokens from cursor slot at the specified position
  useEffect(() => {
    const handleDropCursorSlotAtPosition = (e: Event) => {
      const customEvent = e as CustomEvent<{
        clientX: number;
        clientY: number;
      }>;

      const { clientX, clientY } = customEvent.detail;

      // Only drop if we have items in cursor slot
      if (cursorSlotRef.current.length === 0) {
        return;
      }

      // Drop all items from cursor slot at the specified position
      const itemsToDrop = cursorSlotRef.current;
      const droppedIds = itemsToDrop.map(item => item.id);

      // Notify that items were dropped from cursor slot
      window.dispatchEvent(new CustomEvent('cursor-slot-dropped', {
        detail: { cardIds: droppedIds }
      }));

      // Check if cursor is over a token archetype card
      const elementAtCursor = document.elementFromPoint(clientX, clientY);
      const archetypeCard = elementAtCursor?.closest('[data-archetype-card]');

      if (archetypeCard) {
        return;
      }

      // Check if cursor is over hand panel - drop cards/tokens to hand
      const handPanel = elementAtCursor?.closest('[data-hand-panel="true"]');
      if (handPanel) {
        const items = itemsToDrop.filter(item => item.type === ItemType.CARD || item.type === ItemType.TOKEN);
        if (items.length > 0) {
          window.dispatchEvent(new CustomEvent('cursor-slot-drop-to-hand', {
            detail: { items }
          }));
          // IMPORTANT: Also dispatch cursor-slot-dropped to hide purple outline
          window.dispatchEvent(new CustomEvent('cursor-slot-dropped', {
            detail: { cardIds: items.map(i => i.id) }
          }));
        }
        setCursorSlot([]);
        setCursorPosition(null);
        cursorPositionRef.current = null;
        setCursorSlotSource(null);
        return;
      }

      // Calculate drop position
      const rect = scrollContainerRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      const baseX = p2v(clientX - rect.left + (viewTransform?.scroll?.x || 0));
      const baseY = p2v(clientY - rect.top + (viewTransform?.scroll?.y || 0));

      // Determine zIndex behavior based on source
      const source = cursorSlotRef.current[0]?.source || 'hold';
      const useOriginalZIndex = source === 'hold' || source === 'archetype';

      // Sort items to preserve visual stack order
      // For token copies from archetype: use cursorSlotIndex (order added to slot)
      // For regular tokens: use originalZIndex
      // Sort ASCENDING by sort key so first added (or lowest Z) is processed first (back of stack)
      const sortedItems = [...itemsToDrop].sort((a, b) => {
        const sortKeyA = (a as any).cursorSlotIndex ?? (a as any).originalZIndex ?? a.zIndex ?? 0;
        const sortKeyB = (b as any).cursorSlotIndex ?? (b as any).originalZIndex ?? b.zIndex ?? 0;
        return sortKeyA - sortKeyB; // Ascending - first added/lowest Z first (back of stack)
      });

      // Drop all items from cursor slot
      sortedItems.forEach((item, sortedIndex) => {
        let finalX = baseX;
        let finalY = baseY;

        // Center the token on cursor (no click offset for archetype tokens)
        const tokenWidth = item.width ?? 50;
        const tokenHeight = item.height ?? 50;
        finalX = baseX - tokenWidth / 2;
        finalY = baseY - tokenHeight / 2;

        // Apply stack offset - back items (first in sorted array) get MORE offset
        // This matches CursorSlotVisualization where back items are farther from cursor
        if (sortedItems.length > 1) {
          const offsetAmount = Math.min(tokenWidth, tokenHeight) * 0.05;
          const visualStackIndex = sortedItems.length - 1 - sortedIndex; // Reverse: back=max, front=0
          finalX += visualStackIndex * offsetAmount;
          finalY += visualStackIndex * offsetAmount;
        }

        let finalZIndex = item.zIndex;
        if (!useOriginalZIndex) {
          // Simple formula: first in sorted array (back) gets lowest zIndex, last (front) gets highest
          finalZIndex = 10000 + sortedIndex;
        }

        // Check if object exists in state before updating
        if (!state.objects[item.id]) {
          return;
        }

        // Restore object to table at new position
        dispatch({
          type: 'UPDATE_OBJECT',
          payload: {
            id: item.id,
            inCursorSlot: false,
            isOnTable: true,
            x: finalX,
            y: finalY,
            zIndex: finalZIndex
          }
        });
      });

      // Clear cursor slot
      setCursorSlot([]);
      setCursorPosition(null);
      cursorPositionRef.current = null;
      setCursorSlotSource(null);
    };

    window.addEventListener('drop-cursor-slot-at-position', handleDropCursorSlotAtPosition);
    return () => window.removeEventListener('drop-cursor-slot-at-position', handleDropCursorSlotAtPosition);
  }, [state.objects, dispatch, p2v, scrollContainerRef, viewTransform, setCursorSlot, setCursorPosition, cursorPositionRef, setCursorSlotSource]);

  // Handle update-token-copy-from-archetype events from ObjectSettingsModal
  // This updates token copies when archetype settings change
  useEffect(() => {
    const handleUpdateTokenCopyFromArchetype = (e: Event) => {
      const customEvent = e as CustomEvent<{
        copyId: string;
        updates: Partial<TokenType>;
      }>;

      const { copyId, updates } = customEvent.detail;

      // Check if token exists in state
      if (!state.objects[copyId]) {
        return;
      }

      // Update the token copy
      dispatch({
        type: 'UPDATE_OBJECT',
        payload: {
          id: copyId,
          ...updates
        } as any
      });
    };

    window.addEventListener('update-token-copy-from-archetype', handleUpdateTokenCopyFromArchetype);
    return () => window.removeEventListener('update-token-copy-from-archetype', handleUpdateTokenCopyFromArchetype);
  }, [state.objects, dispatch]);
};
