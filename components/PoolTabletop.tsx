import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { useGame } from '../store/GameContext';
import { TableObject, ItemType } from '../types';
import { ObjectRenderer } from './ObjectRenderer';

interface PoolZone {
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  panelId: string;
}

interface PoolTabletopProps {
  poolZone: PoolZone;
}

export const PoolTabletop: React.FC<PoolTabletopProps> = ({ poolZone }) => {
  const { state, dispatch } = useGame();
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const currentPlayer = state.players.find(p => p.id === state.activePlayerId);
  const isGM = currentPlayer?.isGM ?? false;

  // View transform
  const [zoom] = useState(1);

  // Dragging state for objects
  const [draggingObject, setDraggingObject] = useState<TableObject | null>(null);
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });

  // Calculate pixels per VU
  const pixelsPerVU = state.viewTransform?.pixelsPerVU ?? 1.08;

  // Filter objects in pool zone
  const zoneObjects = useMemo(() => {
    const allObjects = Object.values(state.objects);

    // Debug logging (commented out to reduce console spam)
    // console.log('PoolTabletop: === Starting filter ===');
    // console.log('PoolTabletop: Total objects in state:', allObjects.length);

    // const cardTokenObjects = allObjects.filter(obj => obj.type === ItemType.CARD || obj.type === ItemType.TOKEN);
    // console.log('PoolTabletop: Cards and tokens:', cardTokenObjects.length);

    // console.log('PoolTabletop: All cards/tokens coordinates:', cardTokenObjects
    //   .map(obj => ({ id: obj.id, name: obj.name, type: obj.type, x: obj.x, y: obj.y, inCursorSlot: (obj as any).inCursorSlot }))
    // );

    // console.log('PoolTabletop: Pool zone bounds:', {
    //   offsetX: poolZone.offsetX,
    //   offsetY: poolZone.offsetY,
    //   width: poolZone.width,
    //   height: poolZone.height,
    //   maxX: poolZone.offsetX + poolZone.width,
    //   maxY: poolZone.offsetY + poolZone.height
    // });

    const result = allObjects.filter(obj => {
      // Exclude objects in cursor slot
      if ((obj as any).inCursorSlot) return false;

      const objX = obj.x || 0;
      const objY = obj.y || 0;
      const objWidth = obj.width || 100;
      const objHeight = obj.height || 100;

      // Calculate object center
      const centerX = objX + objWidth / 2;
      const centerY = objY + objHeight / 2;

      // Object is visible if its center is within pool zone
      const centerInPool = centerX >= poolZone.offsetX && centerX <= poolZone.offsetX + poolZone.width &&
                          centerY >= poolZone.offsetY && centerY <= poolZone.offsetY + poolZone.height;

      // For cards and tokens: also show if any part is in pool zone (for smoother UX)
      const partlyInPool = objX < poolZone.offsetX + poolZone.width && objX + objWidth > poolZone.offsetX &&
                          objY < poolZone.offsetY + poolZone.height && objY + objHeight > poolZone.offsetY;

      const inPool = (obj.type === ItemType.CARD || obj.type === ItemType.TOKEN) ? partlyInPool : centerInPool;

      // Debug logging (commented out to reduce console spam)
      // if ((obj.type === ItemType.CARD || obj.type === ItemType.TOKEN)) {
      //   console.log('PoolTabletop: Checking object:', {
      //     id: obj.id,
      //     name: obj.name,
      //     type: obj.type,
      //     x: objX,
      //     y: objY,
      //     centerX,
      //     centerY,
      //     inPool,
      //     inCursorSlot: (obj as any).inCursorSlot,
      //     reason: !inPool ? `Object center (${centerX}, ${centerY}) not in pool zone [${poolZone.offsetX}, ${poolZone.offsetY}] to [${poolZone.offsetX + poolZone.width}, ${poolZone.offsetY + poolZone.height}]` : 'In pool zone'
      //   });
      // }

      return inPool;
    });

    // console.log('PoolTabletop: === Filter complete, found', result.length, 'objects in pool ===');

    return result;
  }, [state.objects, poolZone]);

  // Handle object mouse down
  const handleObjectMouseDown = useCallback((e: React.MouseEvent, obj: TableObject) => {
    // Debug logging (commented out to reduce console spam)
    // console.log('PoolTabletop handleObjectMouseDown:', {
    //   button: e.button,
    //   ctrlKey: e.ctrlKey,
    //   metaKey: e.metaKey,
    //   shiftKey: e.shiftKey,
    //   objId: obj.id,
    //   objType: obj.type,
    //   objName: obj.name
    // });

    if (e.button !== 0) return;

    // Handle Ctrl+click to add to cursor slot
    if (e.ctrlKey || e.metaKey) {
      console.log('PoolTabletop: Ctrl+click detected, dispatching add-to-cursor-slot event for', obj.id);
      e.preventDefault();
      e.stopPropagation();
      // Dispatch event for Tabletop to handle (same as HandPanel does)
      window.dispatchEvent(new CustomEvent('add-to-cursor-slot', {
        detail: { cardId: obj.id, clientX: e.clientX, clientY: e.clientY, source: 'shift' }
      }));
      return;
    }

    e.stopPropagation();
    console.log('PoolTabletop: Starting drag for', obj.id);
    setDraggingObject(obj);
    setDragStartPos({ x: e.clientX, y: e.clientY });
  }, []);

  // Handle mouse move for dragging objects
  const handleObjectMouseMove = useCallback((e: MouseEvent) => {
    if (!draggingObject) return;

    const deltaX = e.clientX - dragStartPos.x;
    const deltaY = e.clientY - dragStartPos.y;

    // For cards and tokens: add to cursor slot after 5px drag
    if ((draggingObject.type === ItemType.CARD || draggingObject.type === ItemType.TOKEN)) {
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      if (distance >= 5) {
        console.log('PoolTabletop: Card/token dragged 5px+, adding to cursor slot');
        setDraggingObject(null);

        // Add to cursor slot
        window.dispatchEvent(new CustomEvent('add-to-cursor-slot', {
          detail: {
            cardId: draggingObject.id,
            clientX: e.clientX,
            clientY: e.clientY,
            source: 'hold'
          }
        }));
        return;
      }
    }

    // Convert pixel delta to VU delta (account for zoom)
    const vuDeltaX = deltaX / zoom / pixelsPerVU;
    const vuDeltaY = deltaY / zoom / pixelsPerVU;

    // Calculate new position
    const newX = draggingObject.x + vuDeltaX;
    const newY = draggingObject.y + vuDeltaY;

    // Calculate relative position for visual update
    const relativeX = (newX - poolZone.offsetX) * pixelsPerVU;
    const relativeY = (newY - poolZone.offsetY) * pixelsPerVU;

    // Update object position temporarily (visual only - actual update happens on mouse up)
    const objElement = document.querySelector(`[data-object-id="${draggingObject.id}"]`) as HTMLElement;
    if (objElement) {
      objElement.style.left = `${relativeX}px`;
      objElement.style.top = `${relativeY}px`;
    }
  }, [draggingObject, dragStartPos, zoom, pixelsPerVU, poolZone.offsetX, poolZone.offsetY]);

  // Handle mouse up for object drag
  const handleObjectMouseUp = useCallback((e: MouseEvent) => {
    if (!draggingObject) return;

    // Cards and tokens are already handled in mouseMove (added to cursor slot)
    if (draggingObject.type === ItemType.CARD || draggingObject.type === ItemType.TOKEN) {
      setDraggingObject(null);
      return;
    }

    // Calculate new position in game space
    const deltaX = e.clientX - dragStartPos.x;
    const deltaY = e.clientY - dragStartPos.y;

    // Convert pixel delta to VU delta (account for zoom)
    const vuDeltaX = deltaX / zoom / pixelsPerVU;
    const vuDeltaY = deltaY / zoom / pixelsPerVU;

    let newX = draggingObject.x + vuDeltaX;
    let newY = draggingObject.y + vuDeltaY;

    // For non-card/token objects: constrain to pool zone bounds
    const objWidth = draggingObject.width || 100;
    const objHeight = draggingObject.height || 100;

    // Allow object center to be within pool zone
    newX = Math.max(poolZone.offsetX, Math.min(newX, poolZone.offsetX + poolZone.width - objWidth / 2));
    newY = Math.max(poolZone.offsetY, Math.min(newY, poolZone.offsetY + poolZone.height - objHeight / 2));

    // Update object position
    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: draggingObject.id,
        x: newX,
        y: newY
      }
    });

    setDraggingObject(null);
  }, [draggingObject, dragStartPos, zoom, pixelsPerVU, dispatch, poolZone]);

  // Add global mouse listeners for object dragging
  useEffect(() => {
    if (draggingObject) {
      window.addEventListener('mousemove', handleObjectMouseMove);
      window.addEventListener('mouseup', handleObjectMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleObjectMouseMove);
        window.removeEventListener('mouseup', handleObjectMouseUp);
      };
    }
  }, [draggingObject, handleObjectMouseMove, handleObjectMouseUp]);

  // Handle drop from cursor slot
  const handleDropFromCursor = useCallback((e: React.MouseEvent) => {
    // Don't drop if modifiers are pressed (Ctrl/Shift/Meta)
    if (e.ctrlKey || e.metaKey || e.shiftKey) return;

    const cursorSlotObjects = Object.values(state.objects).filter(obj =>
      (obj.type === ItemType.CARD || obj.type === ItemType.TOKEN) && (obj as any).inCursorSlot
    );

    if (cursorSlotObjects.length > 0) {
      const container = containerRef.current;
      if (!container) return;

      // Get scroll parent (PoolGameSpace) to account for scroll position
      const scrollParent = container.closest('.overflow-auto');
      if (!scrollParent) {
        console.error('PoolTabletop: scroll parent not found!');
        return;
      }

      const scrollRect = scrollParent.getBoundingClientRect();
      const scrollLeft = scrollParent.scrollLeft;
      const scrollTop = scrollParent.scrollTop;

      const containerRect = container.getBoundingClientRect();

      console.log('PoolTabletop: === DROP COORDINATES DEBUG ===');
      console.log('Click position (screen):', { x: e.clientX, y: e.clientY });
      console.log('Scroll parent:', {
        rect: { left: scrollRect.left, top: scrollRect.top, width: scrollRect.width, height: scrollRect.height },
        scroll: { left: scrollLeft, top: scrollTop }
      });
      console.log('Container:', {
        rect: { left: containerRect.left, top: containerRect.top, width: containerRect.width, height: containerRect.height },
        offsetLeft: container.offsetLeft,
        offsetTop: container.offsetTop
      });
      console.log('Pool zone:', {
        offsetX: poolZone.offsetX,
        offsetY: poolZone.offsetY,
        width: poolZone.width,
        height: poolZone.height,
        zoom,
        pixelsPerVU
      });

      // Try different calculation methods
      const method1 = {
        name: 'Method 1: screen - scrollRect.left + scrollLeft',
        x: (e.clientX - scrollRect.left + scrollLeft) / zoom / pixelsPerVU,
        y: (e.clientY - scrollRect.top + scrollTop) / zoom / pixelsPerVU
      };

      const method2 = {
        name: 'Method 2: screen - containerRect.left',
        x: (e.clientX - containerRect.left) / zoom / pixelsPerVU,
        y: (e.clientY - containerRect.top) / zoom / pixelsPerVU
      };

      const method3 = {
        name: 'Method 3: screen - scrollRect.left (no scroll)',
        x: (e.clientX - scrollRect.left) / zoom / pixelsPerVU,
        y: (e.clientY - scrollRect.top) / zoom / pixelsPerVU
      };

      console.log('Calculation methods:', { method1, method2, method3 });

      // Use method 1
      const relativeX = method1.x;
      const relativeY = method1.y;

      // Convert to pool zone coordinates
      const baseX = poolZone.offsetX + relativeX;
      const baseY = poolZone.offsetY + relativeY;

      console.log('Final coordinates:', { baseX, baseY, relativeX, relativeY });

      // Sort by zIndex in DESCENDING order to preserve layer relationships when dropping
      // Note: PoolTabletop doesn't have access to cursorSlot array, so we use current zIndex
      const sortedObjects = [...cursorSlotObjects].sort((a, b) => {
        const zA = a.zIndex ?? 0;
        const zB = b.zIndex ?? 0;
        return zB - zA; // Descending order - higher Z first
      });

      // Drop items with offset based on layer position (same as tabletop)
      sortedObjects.forEach((obj, sortedIndex) => {
        const objWidth = obj.width || 100;
        const objHeight = obj.height || 100;

        // Calculate offset based on sorted position
        // Highest zIndex (top, sortedIndex=0) gets no offset, lower gets more offset
        const offsetFromFront = sortedIndex;
        const offsetAmount = Math.min(objWidth, objHeight) * 0.05; // 5 VU offset
        const offsetX = offsetFromFront * offsetAmount;
        const offsetY = offsetFromFront * offsetAmount;

        // Calculate position (cursor is at center of object, so subtract half dimensions)
        let finalX = baseX - (objWidth / 2) + offsetX;
        let finalY = baseY - (objHeight / 2) + offsetY;

        // Constrain to pool zone bounds
        finalX = Math.max(poolZone.offsetX, Math.min(finalX, poolZone.offsetX + poolZone.width - objWidth));
        finalY = Math.max(poolZone.offsetY, Math.min(finalY, poolZone.offsetY + poolZone.height - objHeight));

        console.log(`Dropping ${obj.name} at:`, { finalX, finalY, objWidth, objHeight });

        dispatch({
          type: 'UPDATE_OBJECT',
          payload: {
            id: obj.id,
            x: finalX,
            y: finalY,
            inCursorSlot: false
          }
        });
      });
    }
  }, [poolZone, zoom, pixelsPerVU, dispatch, state.objects]);

  // Listen for object-drag-end event from main tabletop (for both cards and tokens)
  useEffect(() => {
    const handleObjectDragEnd = (e: Event) => {
      const customEvent = e as CustomEvent<{
        wasDragging: boolean;
        objectId: string;
        objectType: string;
        source: 'hand' | 'tabletop' | null;
        x: number;
        y: number;
      }>;

      if (customEvent.detail.source !== 'tabletop') return;

      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const x = customEvent.detail.x;
      const y = customEvent.detail.y;

      // Check if drop position is over the pool panel
      const isOver = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

      if (isOver) {
        // Calculate position relative to container (accounting for scroll)
        const relativeX = x - rect.left;
        const relativeY = y - rect.top;

        // Convert to pool zone coordinates
        const poolX = poolZone.offsetX + relativeX / zoom / pixelsPerVU;
        const poolY = poolZone.offsetY + relativeY / zoom / pixelsPerVU;

        // Get the object to determine its dimensions for centering
        const obj = state.objects[customEvent.detail.objectId];
        const objWidth = obj?.width || 100;
        const objHeight = obj?.height || 100;

        // Calculate final position (cursor is at center of object, so subtract half dimensions)
        const finalX = poolX - (objWidth / 2);
        const finalY = poolY - (objHeight / 2);

        console.log('PoolTabletop: Dropping object from tabletop to pool:', {
          objectId: customEvent.detail.objectId,
          screenX: x,
          screenY: y,
          rectLeft: rect.left,
          rectTop: rect.top,
          relativeX,
          relativeY,
          poolX,
          poolY,
          finalX,
          finalY,
          objWidth,
          objHeight,
          poolZoneOffsetX: poolZone.offsetX,
          poolZoneOffsetY: poolZone.offsetY,
          zoom,
          pixelsPerVU
        });

        // Move the object to the pool
        dispatch({
          type: 'UPDATE_OBJECT',
          payload: {
            id: customEvent.detail.objectId,
            x: finalX,
            y: finalY
          }
        });
      }
    };

    // Listen for both new object-drag-end and legacy card-drag-end events
    window.addEventListener('object-drag-end', handleObjectDragEnd);
    window.addEventListener('card-drag-end', (e: Event) => {
      // Handle legacy card-drag-end events for backward compatibility
      const customEvent = e as CustomEvent<any>;
      // Convert to object-drag-end format
      const syntheticEvent = new CustomEvent('object-drag-end', {
        detail: {
          wasDragging: customEvent.detail.wasDragging,
          objectId: customEvent.detail.cardId,
          objectType: ItemType.CARD,
          source: customEvent.detail.source,
          x: customEvent.detail.x,
          y: customEvent.detail.y
        }
      });
      handleObjectDragEnd(syntheticEvent);
    });

    return () => {
      window.removeEventListener('object-drag-end', handleObjectDragEnd);
      window.removeEventListener('card-drag-end', handleObjectDragEnd as any);
    };
  }, [poolZone, zoom, pixelsPerVU, dispatch]);

  return (
    <div
      ref={containerRef}
      data-pool-panel={poolZone.panelId}
      className="relative bg-table"
      style={{
        width: poolZone.width * pixelsPerVU,
        height: poolZone.height * pixelsPerVU,
      }}
      onMouseUp={handleDropFromCursor}
    >
      {/* Debug info */}
      <div className="absolute top-0 right-0 z-50 bg-red-900 bg-opacity-90 px-2 py-1 rounded text-xs text-white pointer-events-none">
        {Math.round(poolZone.width * pixelsPerVU)}x{Math.round(poolZone.height * pixelsPerVU)}px | {pixelsPerVU}px/VU
      </div>
      {/* Pool zone background with grid pattern */}
      <div
        ref={contentRef}
        className="absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(#34495e 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      >
          {/* Render objects (positioned relative to pool zone) */}
          {zoneObjects.map(obj => {
            // Object position relative to pool zone
            const relativeX = (obj.x - poolZone.offsetX) * pixelsPerVU;
            const relativeY = (obj.y - poolZone.offsetY) * pixelsPerVU;

            // Calculate if token name should be shown (same logic as main Tabletop)
            const showTokenName = obj.type === ItemType.TOKEN && (
              (obj as any).showNameOnToken ||
              (obj as any).showName ||
              ((obj as any).archetypeId && (state.objects[(obj as any).archetypeId] as any)?.showName)
            );

            return (
              <ObjectRenderer
                key={obj.id}
                obj={obj}
                pixelsPerVU={pixelsPerVU}
                isDragging={draggingObject?.id === obj.id}
                isGM={isGM}
                showTokenName={showTokenName}
                onMouseDown={(e) => handleObjectMouseDown(e, obj)}
                style={{
                  left: relativeX,
                  top: relativeY
                }}
              />
            );
          })}
        </div>

        {/* Zone info */}
      <div className="absolute top-2 left-2 z-50 bg-slate-800 bg-opacity-90 px-2 py-1 rounded text-xs text-slate-300 pointer-events-none">
        Zone: {poolZone.offsetX},{poolZone.offsetY} ({poolZone.width}x{poolZone.height}) | Objects: {zoneObjects.length}
      </div>

      {/* Controls hint */}
      <div className="absolute bottom-2 left-2 z-50 bg-slate-800 bg-opacity-90 px-2 py-1 rounded text-xs text-slate-400 pointer-events-none">
        Scroll • Ctrl+click or drag to pickup • Click empty space to drop • Other objects: drag to move
      </div>
    </div>
  );
};
