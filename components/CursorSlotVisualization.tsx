import React, { useEffect, useRef } from 'react';
import { ItemType, Card as CardType, Token as TokenType, CardOrientation, Deck as DeckType, Randomizer, Counter, DiceObject, Board as BoardType, BattlefieldCell, NexusBoard, NexusCellObject, Drawing, EffectTemplate, TableObject } from '../types';
import { renderCursorSlotItem } from './CursorSlotItems';
import { getTokenWithAppliedState } from '../hooks/useTokenWithState';

interface CursorSlotVisualizationProps {
  cursorSlot: (CardType | TokenType | DeckType | Randomizer | Counter | DiceObject | BoardType | BattlefieldCell | NexusBoard | NexusCellObject | Drawing | EffectTemplate)[];
  cursorPosition: { x: number; y: number } | null;
  cursorPositionRef: React.MutableRefObject<{ x: number; y: number } | null>;
  zoom: number;
  pixelsPerVU: number;
  state: { objects: Record<string, any> };
  getCardSettings: (card: CardType) => {
    cardWidth?: number;
    cardHeight?: number;
    cardOrientation?: CardOrientation;
  };
}

interface ItemData {
  item: CardType | TokenType | DeckType | Randomizer | Counter | DiceObject | BoardType | BattlefieldCell | NexusBoard | NexusCellObject | Drawing | EffectTemplate;
  width: number;
  height: number;
  clickOffsetX: number;
  clickOffsetY: number;
  stackOffsetX: number;
  stackOffsetY: number;
  zIndex: number;
}

/**
 * Helper function to calculate item dimensions
 */
const calculateItemDimensions = (
  item: CardType | TokenType | DeckType | Randomizer | Counter | DiceObject | BoardType | BattlefieldCell | NexusBoard | NexusCellObject | Drawing | EffectTemplate,
  getCardSettings: (card: CardType) => {
    cardWidth?: number;
    cardHeight?: number;
    cardOrientation?: CardOrientation;
  },
  pixelsPerVU: number,
  allObjects: Record<string, TableObject>
) => {
  const isCard = item.type === ItemType.CARD;
  const isToken = item.type === ItemType.TOKEN;
  const isDeck = item.type === ItemType.DECK;
  const isRandomizer = item.type === ItemType.RANDOMIZER;
  const isCounter = item.type === ItemType.COUNTER;
  const isDice = item.type === ItemType.DICE_OBJECT;
  const isBoard = item.type === ItemType.BOARD;
  const isBattlefieldCell = item.type === ItemType.BATTLEFIELD_CELL;
  const isNexusBoard = item.type === ItemType.NEXUS_BOARD;
  const isNexusCell = item.type === ItemType.NEXUS_CELL;
  const isDrawing = item.type === ItemType.DRAWING;
  const isEffectTemplate = item.type === ItemType.EFFECT_TEMPLATE;

  let baseWidth = item.width ?? 50;
  let baseHeight = item.height ?? 50;
  if (isToken) {
    const tokenWithState = getTokenWithAppliedState(item as TokenType, allObjects);
    baseWidth = tokenWithState.width ?? 50;
    baseHeight = tokenWithState.height ?? 50;
  }

  let isHorizontal = false;

  if (isCard) {
    const cardSettings = getCardSettings(item as CardType);
    baseWidth = item.width ?? cardSettings.cardWidth ?? 63;
    baseHeight = item.height ?? cardSettings.cardHeight ?? 88;
    isHorizontal = cardSettings.cardOrientation === CardOrientation.HORIZONTAL;
  } else if (isDeck) {
    baseWidth = item.width ?? 100;
    baseHeight = item.height ?? 140;
  } else if (isRandomizer || isCounter || isDice) {
    baseWidth = item.width ?? 60;
    baseHeight = item.height ?? 60;
  } else if (isBoard) {
    baseWidth = item.width ?? 500;
    baseHeight = item.height ?? 500;
  } else if (isBattlefieldCell || isNexusBoard || isNexusCell) {
    baseWidth = item.width ?? 100;
    baseHeight = item.height ?? 100;
  } else if (isDrawing) {
    baseWidth = item.width ?? 200;
    baseHeight = item.height ?? 200;
  } else if (isEffectTemplate) {
    baseWidth = item.width ?? 100;
    baseHeight = item.height ?? 100;
    baseWidth = Math.max(baseWidth, 50);
    baseHeight = Math.max(baseHeight, 50);
  }

  return {
    width: baseWidth * pixelsPerVU,
    height: baseHeight * pixelsPerVU,
    isHorizontal,
    baseWidth,
    baseHeight,
  };
};

/**
 * CursorSlotVisualization - renders items following the cursor
 *
 * PERFORMANCE OPTIMIZATION:
 * - Uses RAF-based DOM updates instead of React re-renders
 * - Only re-renders when cursorSlot changes, not on every mouse move
 * - Direct DOM manipulation for smooth 60fps cursor following across all browsers
 */
export const CursorSlotVisualization = (({
  cursorSlot,
  cursorPositionRef,
  pixelsPerVU,
  state,
  getCardSettings,
}: CursorSlotVisualizationProps) => {
  const itemElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const rafRef = useRef<number>();
  const itemDataRef = useRef<Map<string, ItemData>>(new Map());
  const rootRefsRef = useRef<Map<string, any>>(new Map());

  // Calculate item data once when cursorSlot changes AND create DOM elements synchronously
  useEffect(() => {
    const newItemData = new Map<string, ItemData>();

    const sorted = [...cursorSlot].sort((a, b) => {
      const zA = (a as any).originalZIndex ?? a.zIndex ?? 0;
      const zB = (b as any).originalZIndex ?? b.zIndex ?? 0;
      return zB - zA;
    });

    sorted.forEach((item, sortedIndex) => {
      const dimensions = calculateItemDimensions(item, getCardSettings, pixelsPerVU, state.objects as Record<string, TableObject>);
      const width = Math.max(dimensions.width, 1);
      const height = Math.max(dimensions.height, 1);
      const isCard = item.type === ItemType.CARD;

      const clickOffsetX_PX = (item as any).clickOffsetX_PX;
      const clickOffsetY_PX = (item as any).clickOffsetY_PX;

      let offsetX = 0;
      let offsetY = 0;

      if (clickOffsetX_PX !== undefined && clickOffsetY_PX !== undefined) {
        offsetX = clickOffsetX_PX;
        offsetY = clickOffsetY_PX;
      } else {
        const clickOffsetX = (item as any).clickOffsetX;
        const clickOffsetY = (item as any).clickOffsetY;

        if (clickOffsetX !== undefined && clickOffsetY !== undefined) {
          offsetX = clickOffsetX * pixelsPerVU;
          offsetY = clickOffsetY * pixelsPerVU;
        } else {
          offsetX = width / 2;
          offsetY = height / 2;
        }
      }

      const offsetAmount = Math.min(width, height) * 0.05;
      const stackOffsetX = sortedIndex * offsetAmount;
      const stackOffsetY = sortedIndex * offsetAmount;

      const totalItems = sorted.length;
      const zIndex = isCard ? (totalItems - sortedIndex) : (totalItems - sortedIndex) + 1000;

      newItemData.set(item.id, {
        item,
        width,
        height,
        clickOffsetX: offsetX,
        clickOffsetY: offsetY,
        stackOffsetX,
        stackOffsetY,
        zIndex,
      });
    });

    itemDataRef.current = newItemData;

    // 🔥 FIX: Create DOM elements synchronously IMMEDIATELY after itemData is populated
    // This prevents race condition where elements are created before itemData is ready
    for (const [id, itemData] of newItemData) {
      let element = itemElementsRef.current.get(id);

      // Create element if it doesn't exist - DO THIS SYNCHRONOUSLY
      if (!element) {
        element = document.createElement('div');
        element.style.cssText = `
          position: fixed;
          left: 0;
          top: 0;
          width: ${itemData.width}px;
          height: ${itemData.height}px;
          z-index: ${999999999 + itemData.zIndex};
          pointer-events: none;
          user-select: none;
          will-change: transform;
          backface-visibility: hidden;
        `;
        element.dataset.cursorSlotItem = id;

        // Create container for React content
        const container = document.createElement('div');
        container.style.cssText = 'width: 100%; height: 100%; position: absolute; left: 0; top: 0;';
        element.appendChild(container);
        document.body.appendChild(element);
        itemElementsRef.current.set(id, element);

        // 🔥 FIX: Set initial position immediately after element creation
        // This prevents element from appearing at 0,0 before first RAF update
        const initialPos = cursorPositionRef.current;
        if (initialPos) {
          const itemX = initialPos.x - itemData.clickOffsetX + itemData.stackOffsetX;
          const itemY = initialPos.y - itemData.clickOffsetY + itemData.stackOffsetY;
          element.style.transform = `translate3d(${itemX}px, ${itemY}px, 0)`;
        }

        // Render React content into container
        const renderedItem = renderCursorSlotItem(
          { item: itemData.item, width: itemData.width, height: itemData.height, offsetX: 0, offsetY: 0, zIndex: itemData.zIndex, state, pixelsPerVU },
          `cursor-slot-${id}`
        );

        // Use createRoot for React 18 - still async but element is already in DOM
        import('react-dom/client').then(({ createRoot }) => {
          const tempRoot = createRoot(container);
          rootRefsRef.current.set(id, tempRoot);
          tempRoot.render(renderedItem);
        });
      }
    }

    // Cleanup unused elements
    const currentIds = new Set(cursorSlot.map((item: any) => item.id));
    for (const [id, element] of itemElementsRef.current) {
      if (!currentIds.has(id)) {
        element.remove();
        itemElementsRef.current.delete(id);
        // Cleanup React root asynchronously to avoid render-time unmount warning
        const root = rootRefsRef.current.get(id);
        if (root) {
          setTimeout(() => {
            try {
              root.unmount();
            } catch (e) {
              // Ignore unmount errors
            }
            rootRefsRef.current.delete(id);
          }, 0);
        }
      }
    }

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      // Cleanup all elements
      itemElementsRef.current.forEach(el => el.remove());
      itemElementsRef.current.clear();
      // Cleanup React roots asynchronously
      setTimeout(() => {
        rootRefsRef.current.forEach(root => {
          try {
            root.unmount();
          } catch (e) {
            // Ignore unmount errors
          }
        });
        rootRefsRef.current.clear();
      }, 0);
    };
  }, [cursorSlot, pixelsPerVU, getCardSettings, state.objects]);

  // RAF-based position updates - only for position, not creation
  useEffect(() => {
    if (cursorSlot.length === 0) return;

    const updatePositions = () => {
      const pos = cursorPositionRef.current;
      if (!pos) return;

      for (const [id, itemData] of itemDataRef.current) {
        const element = itemElementsRef.current.get(id);
        if (!element) continue; // Skip if element doesn't exist (should be created by sync effect)

        // Calculate position
        const itemX = pos.x - itemData.clickOffsetX + itemData.stackOffsetX;
        const itemY = pos.y - itemData.clickOffsetY + itemData.stackOffsetY;

        // Update transform directly (no React re-render needed)
        element.style.transform = `translate3d(${itemX}px, ${itemY}px, 0)`;
      }

      rafRef.current = requestAnimationFrame(updatePositions);
    };

    rafRef.current = requestAnimationFrame(updatePositions);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [cursorSlot.length]);

  if (cursorSlot.length === 0) return null;

  return null;
});
