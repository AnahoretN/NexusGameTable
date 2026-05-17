import { TableObject, ItemType, BattlefieldCell, NexusCellObject, Board, GridType, PanelObject, Token } from '../../types';
import { removeObjectFromCellMagnet, removeObjectFromGridCellMagnet, generateGridCellKey, parseGridCellKey, calculateGridCellCenter, calculateGridDimensions } from '../../utils/gridUtils';
import {
  syncSlidersToTokens,
  syncCountersToCharacter,
  syncCharacterNameToTokens,
  syncTokenNameToCharacter,
  syncCharacterAvatarToTokens,
  syncCharacterBorderToTokens,
  syncTokenBorderToCharacter,
  syncTokenImageToCharacter,
  findCharacterForToken
} from '../../utils/characterTokenSync';

/**
 * Reducer functions for object manipulation actions
 * ADD_OBJECT, UPDATE_OBJECT, MOVE_OBJECT, DELETE_OBJECT, CLONE_OBJECT, etc.
 */

export function addObjectReducer(state: any, action: any): any {
  const { type, payload } = action;
  const newObjects = { ...state.objects };

  if (type === 'ADD_OBJECT') {
    const obj = payload.object;
    newObjects[obj.id] = obj;

    // If adding a deck, ensure baseCardIds is set
    if (obj.type === ItemType.DECK) {
      (obj as any).baseCardIds = [...obj.cardIds];
    }

    return { ...state, objects: newObjects };
  }

  if (type === 'UPDATE_OBJECT') {
    console.log('[UPDATE_OBJECT]', { id: action.payload.id, objType: state.objects[action.payload.id]?.type, hasUpdates: !!action.payload.updates, hasCharacterData: !!(action.payload.updates || action.payload).characterData, payload: action.payload });
    const obj = state.objects[action.payload.id];
    if (!obj) return state;

    // Handle deck card dimension updates
    if (obj.type === ItemType.DECK && (payload.cardWidth || payload.cardHeight)) {
      const oldDeck = obj as any;
      const oldCardWidth = oldDeck.cardWidth ?? 120;
      const oldCardHeight = oldDeck.cardHeight ?? 168;
      const newCardWidth = payload.cardWidth ?? oldDeck.cardWidth ?? 120;
      const newCardHeight = payload.cardHeight ?? oldDeck.cardHeight ?? 168;

      if (newCardWidth !== oldCardWidth || newCardHeight !== oldCardHeight) {
        Object.values(state.objects).forEach((o: unknown) => {
          if ((o as any).type === ItemType.CARD && (o as any).deckId === obj.id) {
            const card = o as any;
            if (card.width === oldCardWidth && card.height === oldCardHeight) {
              newObjects[(o as any).id] = { ...card, width: newCardWidth, height: newCardHeight };
            }
          }
        });
      }
    }

    // Apply updates - handle both formats: { id, updates: {...} } and { id, ...updates }
    const updates = action.payload.updates || action.payload;
    newObjects[action.payload.id] = { ...obj, ...updates };

    // Character-Token Synchronization
    // Sync FROM panel TO token when panel data changes
    if (obj.type === ItemType.PANEL && updates.characterData) {
      const panel = obj as PanelObject;
      const updatedPanel = { ...panel, ...updates } as PanelObject;
      const oldCharacterData = panel.characterData;
      const newCharacterData = updatedPanel.characterData;

      if (oldCharacterData && newCharacterData) {
        // Check each character for changes
        for (const newChar of newCharacterData.characters) {
          const oldChar = oldCharacterData.characters.find((c: any) => c.id === newChar.id);
          if (!oldChar) continue;

          // Check for name change
          if (oldChar.characterName !== newChar.characterName) {
            syncCharacterNameToTokens({ ...state, objects: newObjects }, updatedPanel, newChar, newObjects);
          }

          // Check for avatar change
          if (oldChar.avatarUrl !== newChar.avatarUrl) {
            syncCharacterAvatarToTokens({ ...state, objects: newObjects }, updatedPanel, newChar, newObjects);
          }

          // Check for border settings change
          if (oldChar.avatarBorderColor !== newChar.avatarBorderColor || oldChar.avatarBorderWidth !== newChar.avatarBorderWidth) {
            syncCharacterBorderToTokens({ ...state, objects: newObjects }, updatedPanel, newChar, newObjects);
          }

          // Check for slider changes - more robust comparison
          if (oldChar.subTabs && newChar.subTabs) {
            let sliderSynced = false;
            for (let i = 0; i < newChar.subTabs.length && !sliderSynced; i++) {
              const oldSubTab = oldChar.subTabs[i];
              const newSubTab = newChar.subTabs[i];
              if (!oldSubTab || !newSubTab) continue;

              for (const newBlock of newSubTab.blocks || []) {
                if (newBlock.type === 'SLIDER' && newBlock.data?.sliders) {
                  const oldBlock = oldSubTab.blocks?.find((b: any) => b.id === newBlock.id);
                  if (!oldBlock || !oldBlock.data?.sliders) continue;

                  // Check if sliders changed - more detailed comparison
                  const oldSliders = oldBlock.data.sliders;
                  const newSliders = newBlock.data.sliders;

                  // Check length first
                  if (oldSliders.length !== newSliders.length) {
                    syncSlidersToTokens({ ...state, objects: newObjects }, updatedPanel, newChar, newObjects);
                    sliderSynced = true;
                    break;
                  }

                  // Check each slider for value changes
                  let sliderValueChanged = false;
                  for (const newSlider of newSliders) {
                    const oldSlider = oldSliders.find((s: any) => s.id === newSlider.id);
                    if (!oldSlider) {
                      sliderValueChanged = true;
                      break;
                    }
                    // Check all relevant properties
                    if (oldSlider.value !== newSlider.value ||
                        oldSlider.maxValue !== newSlider.maxValue ||
                        oldSlider.minValue !== newSlider.minValue ||
                        oldSlider.color !== newSlider.color ||
                        oldSlider.label !== newSlider.label) {
                      sliderValueChanged = true;
                      break;
                    }
                  }

                  if (sliderValueChanged) {
                    syncSlidersToTokens({ ...state, objects: newObjects }, updatedPanel, newChar, newObjects);
                    sliderSynced = true;
                    break;
                  }
                }
              }
            }
          }
        }
      }
    }

    // Sync FROM token TO panel when token counters change
    if (obj.type === ItemType.TOKEN && updates.counters) {
      const token = obj as Token;
      const updatedToken = { ...token, ...updates } as Token;
      const oldCounters = token.counters || [];
      const newCounters = updatedToken.counters || [];

      // Check if counters actually changed - more detailed comparison
      let countersChanged = false;
      if (oldCounters.length !== newCounters.length) {
        countersChanged = true;
      } else {
        for (const newCounter of newCounters) {
          const oldCounter = oldCounters.find(c => c.id === newCounter.id);
          if (!oldCounter) {
            countersChanged = true;
            break;
          }
          // Check all relevant properties
          if (oldCounter.value !== newCounter.value ||
              oldCounter.maxValue !== newCounter.maxValue ||
              oldCounter.minValue !== newCounter.minValue ||
              oldCounter.color !== newCounter.color ||
              oldCounter.name !== newCounter.name) {
            countersChanged = true;
            break;
          }
        }
      }

      if (countersChanged && token.characterId && token.panelId) {
        syncCountersToCharacter({ ...state, objects: newObjects }, updatedToken, newObjects);
      }
    }

    // Sync FROM token TO panel when token name changes
    if (obj.type === ItemType.TOKEN && updates.name !== undefined && obj.name !== updates.name) {
      const token = { ...obj, ...updates } as Token;
      if (token.characterId && token.panelId) {
        syncTokenNameToCharacter({ ...state, objects: newObjects }, token, newObjects);
      }
    }

    // Sync FROM token TO panel when token content (image) changes
    if (obj.type === ItemType.TOKEN && updates.content !== undefined && obj.content !== updates.content) {
      const token = { ...obj, ...updates } as Token;
      if (token.characterId && token.panelId) {
        syncTokenImageToCharacter({ ...state, objects: newObjects }, token, newObjects);
      }
    }

    // Sync FROM token TO panel when token border settings change
    if (obj.type === ItemType.TOKEN && (updates.borderColor !== undefined || updates.borderWidth !== undefined)) {
      const token = { ...obj, ...updates } as Token;
      if (token.characterId && token.panelId) {
        const borderColorChanged = obj.borderColor !== token.borderColor;
        const borderWidthChanged = obj.borderWidth !== token.borderWidth;
        if (borderColorChanged || borderWidthChanged) {
          syncTokenBorderToCharacter({ ...state, objects: newObjects }, token, newObjects);
        }
      }
    }

    return { ...state, objects: newObjects };
  }

  if (type === 'MOVE_OBJECT') {
    const obj = state.objects[action.payload.id];
    if (!obj || obj.locked) return state;

    // For pinned objects, update world coordinates but keep pinnedScreenPosition unchanged
    // The pinnedScreenPosition should only be updated when pinning/unpinning, not during movement
    if ((obj as any).isPinnedToViewport) {
      return {
        ...state,
        objects: {
          ...state.objects,
          [action.payload.id]: {
            ...obj,
            x: action.payload.x,
            y: action.payload.y
            // Note: pinnedScreenPosition is NOT updated here - it stays constant while pinned
          } as TableObject
        }
      };
    }

    // Check if this object was snapped to a cell's magnet points
    // If moved far enough from the cell, remove it from magnet points and reposition remaining objects
    const newObjects = { ...state.objects };
    let needsMagnetCleanup = false;

    for (const cellObj of Object.values(state.objects) as any[]) {
      if ((cellObj.type === ItemType.BATTLEFIELD_CELL || cellObj.type === ItemType.NEXUS_CELL) && cellObj.magnetPoints) {
        const cell = cellObj as BattlefieldCell | NexusCellObject;
        const magnetPoint = cell.magnetPoints?.find(p => p.objectId === action.payload.id);

        if (magnetPoint) {
          // Check if object is still within reasonable distance of the cell
          const cellCenterX = cell.x + (cell.width ?? 100) / 2;
          const cellCenterY = cell.y + (cell.height ?? 100) / 2;
          const objCenterX = action.payload.x + (obj.width ?? 50) / 2;
          const objCenterY = action.payload.y + (obj.height ?? 50) / 2;

          const distance = Math.sqrt(
            Math.pow(objCenterX - cellCenterX, 2) +
            Math.pow(objCenterY - cellCenterY, 2)
          );

          // Snap radius is the larger of cell dimensions + some margin
          const snapRadius = Math.max(cell.width ?? 100, cell.height ?? 100) / 2 + 50;

          // If object moved outside snap radius, remove from magnet points and reposition remaining objects
          if (distance > snapRadius) {
            const result = removeObjectFromCellMagnet(cell, action.payload.id, newObjects);
            if (result) {
              // Update the cell with new magnet points
              newObjects[cell.id] = { ...cell, ...result.updatedCell };

              // Move remaining objects to their new magnet positions
              for (const movedObj of result.movedObjects) {
                newObjects[movedObj.objectId] = {
                  ...newObjects[movedObj.objectId],
                  x: movedObj.x,
                  y: movedObj.y
                };
              }
              needsMagnetCleanup = true;
            }
          }
        }
      }
    }

    // Check if this object was snapped to a grid cell's magnet points
    // If moved far enough from the cell, remove it from magnet points and reposition remaining objects

    // First check if object has gridCellKey for faster lookup
    const token = obj as any;
    if (token.gridCellKey) {
      const [boardId, ...cellParts] = token.gridCellKey.split(':');
      const cellKey = cellParts.join(':');
      const board = state.objects[boardId] as Board;

      if (board && board.gridCellMagnetPoints && board.gridCellMagnetPoints[cellKey]) {
        const cellData = board.gridCellMagnetPoints[cellKey];
        if (cellData.magnetPoints?.some(p => p.objectId === action.payload.id)) {
          // Parse cell key to get col and row
          const { col, row } = parseGridCellKey(cellKey);

          // Calculate cell dimensions using consistent logic
          const { gridW, gridH } = calculateGridDimensions(board);

          // Use helper function to calculate cell center
          const cellCenter = calculateGridCellCenter(board, col, row);

          // Check if object is still within reasonable distance of the cell
          const objCenterX = action.payload.x + (obj.width ?? 50) / 2;
          const objCenterY = action.payload.y + (obj.height ?? 50) / 2;

          const distance = Math.sqrt(
            Math.pow(objCenterX - cellCenter.x, 2) +
            Math.pow(objCenterY - cellCenter.y, 2)
          );

          // Snap radius is the larger of cell dimensions + some margin
          const snapRadius = Math.max(gridW, gridH) / 2 + 50;

          // If object moved outside snap radius, remove from magnet points and reposition remaining objects
          if (distance > snapRadius) {
            const result = removeObjectFromGridCellMagnet(
              board,
              col,
              row,
              action.payload.id,
              newObjects,
              cellCenter.x,
              cellCenter.y,
              gridW,
              gridH
            );

            if (result) {
              // Update the board with new grid cell magnet points
              newObjects[board.id] = {
                ...board,
                gridCellMagnetPoints: result.updatedBoard.gridCellMagnetPoints
              };

              // Move remaining objects to their new magnet positions
              for (const movedObj of result.movedObjects) {
                newObjects[movedObj.objectId] = {
                  ...newObjects[movedObj.objectId],
                  x: movedObj.x,
                  y: movedObj.y
                };
              }

              // Clear gridCellKey from the moved object
              newObjects[action.payload.id] = {
                ...newObjects[action.payload.id],
                gridCellKey: undefined
              };

              needsMagnetCleanup = true;
            }
          }
        }
      }
    } else {
      // Fallback to checking all boards if no gridCellKey
      for (const boardObj of Object.values(state.objects) as any[]) {
        if (boardObj.type === ItemType.BOARD && boardObj.gridCellMagnetPoints) {
          const board = boardObj as Board;

          for (const [cellKey, cellData] of Object.entries(board.gridCellMagnetPoints || {})) {
            if (!cellData.magnetPoints) continue;

            const magnetPoint = cellData.magnetPoints.find(p => p.objectId === action.payload.id);
            if (!magnetPoint) continue;

            // Parse cell key to get col and row
            const { col, row } = parseGridCellKey(cellKey);

            // Calculate cell dimensions
            const gridW = board.gridWidth || board.gridSize || 50;
            const gridH = board.gridHeight || board.gridSize || 50;

            // Use helper function to calculate cell center
            const cellCenter = calculateGridCellCenter(board, col, row);

            // Check if object is still within reasonable distance of the cell
            const objCenterX = action.payload.x + (obj.width ?? 50) / 2;
            const objCenterY = action.payload.y + (obj.height ?? 50) / 2;

            const distance = Math.sqrt(
              Math.pow(objCenterX - cellCenter.x, 2) +
              Math.pow(objCenterY - cellCenter.y, 2)
            );

            // Snap radius is the larger of cell dimensions + some margin
            const snapRadius = Math.max(gridW, gridH) / 2 + 50;

            // If object moved outside snap radius, remove from magnet points and reposition remaining objects
            if (distance > snapRadius) {
              const result = removeObjectFromGridCellMagnet(
                board,
                col,
                row,
                action.payload.id,
                newObjects,
                cellCenter.x,
                cellCenter.y,
                gridW,
                gridH
              );

              if (result) {
                // Update the board with new grid cell magnet points
                newObjects[board.id] = {
                  ...board,
                  gridCellMagnetPoints: result.updatedBoard.gridCellMagnetPoints
                };

                // Move remaining objects to their new magnet positions
                for (const movedObj of result.movedObjects) {
                  newObjects[movedObj.objectId] = {
                    ...newObjects[movedObj.objectId],
                    x: movedObj.x,
                    y: movedObj.y
                  };
                }

                // Clear gridCellKey from the moved object
                newObjects[action.payload.id] = {
                  ...newObjects[action.payload.id],
                  gridCellKey: undefined
                };

                needsMagnetCleanup = true;
              }
            }
        }
      }
    }

    if (needsMagnetCleanup) {
      return {
        ...state,
        objects: {
          ...newObjects,
          [action.payload.id]: { ...obj, x: action.payload.x, y: action.payload.y }
        }
      };
    }

    return {
      ...state,
      objects: {
        ...state.objects,
        [action.payload.id]: { ...obj, x: action.payload.x, y: action.payload.y }
      }
    };
  }

  if (type === 'DELETE_OBJECT') {
    const objectToDelete = state.objects[action.payload.id];
    if (!objectToDelete) return state;

    // If deleting a deck, delete all its cards
    if (objectToDelete.type === ItemType.DECK) {
      const deck = objectToDelete as any;
      if (deck.cardIds) {
        deck.cardIds.forEach((cid: string) => delete newObjects[cid]);
      }
    }

    // If deleting a card, remove from deck's cardIds
    if (objectToDelete.type === ItemType.CARD) {
      const card = objectToDelete as any;
      if (card.deckId) {
        const deck = state.objects[card.deckId] as any;
        if (deck) {
          newObjects[deck.id] = {
            ...deck,
            cardIds: deck.cardIds.filter((id: string) => id !== card.id)
          };
        }
      }
    }

    // Clean up magnet points - remove this object from any cell's magnetPoints
    // and reposition remaining objects
    for (const obj of Object.values(state.objects) as any[]) {
      if ((obj.type === ItemType.BATTLEFIELD_CELL || obj.type === ItemType.NEXUS_CELL) && obj.magnetPoints) {
        const cell = obj as BattlefieldCell | NexusCellObject;
        if (cell.magnetPoints?.some(p => p.objectId === action.payload.id)) {
          const result = removeObjectFromCellMagnet(cell, action.payload.id, newObjects);
          if (result) {
            // Update the cell with new magnet points
            newObjects[cell.id] = { ...cell, ...result.updatedCell };

            // Move remaining objects to their new magnet positions
            for (const movedObj of result.movedObjects) {
              if (movedObj.objectId !== action.payload.id) { // Don't move the object being deleted
                newObjects[movedObj.objectId] = {
                  ...newObjects[movedObj.objectId],
                  x: movedObj.x,
                  y: movedObj.y
                };
              }
            }
          }
        }
      }
    }

    // Clean up grid cell magnet points - remove this object from any board's grid cells
    for (const obj of Object.values(state.objects) as any[]) {
      if (obj.type === ItemType.BOARD && obj.gridCellMagnetPoints) {
        const board = obj as Board;
        for (const [cellKey, cellData] of Object.entries(board.gridCellMagnetPoints || {})) {
          if (!cellData.magnetPoints) continue;

          const magnetPoint = cellData.magnetPoints.find(p => p.objectId === action.payload.id);
          if (!magnetPoint) continue;

          // Parse cell key to get col and row
          const { col, row } = parseGridCellKey(cellKey);

          // Calculate cell dimensions using consistent logic
          const { gridW, gridH } = calculateGridDimensions(board);

          // Use helper function to calculate cell center
          const cellCenter = calculateGridCellCenter(board, col, row);

          const result = removeObjectFromGridCellMagnet(
            board,
            col,
            row,
            action.payload.id,
            newObjects,
            cellCenter.x,
            cellCenter.y,
            gridW,
            gridH
          );

          if (result) {
            // Update the board with new grid cell magnet points
            newObjects[board.id] = {
              ...board,
              gridCellMagnetPoints: result.updatedBoard.gridCellMagnetPoints
            };

            // Move remaining objects to their new magnet positions
            for (const movedObj of result.movedObjects) {
              if (movedObj.objectId !== action.payload.id) { // Don't move the object being deleted
                newObjects[movedObj.objectId] = {
                  ...newObjects[movedObj.objectId],
                  x: movedObj.x,
                  y: movedObj.y
                };
              }
            }
          }
        }
      }
    }

    delete newObjects[action.payload.id];
    return { ...state, objects: newObjects };
  }

  if (type === 'CLONE_OBJECT') {
    const obj = state.objects[action.payload.id];
    if (!obj) return state;

    const newId = action.payload.newId;
    const clonedObj = {
      ...obj,
      id: newId,
      x: obj.x + 20,
      y: obj.y + 20,
      name: `${obj.name} (copy)`
    };

    newObjects[newId] = clonedObj;

    // If cloning a deck, clone its cards too
    if (obj.type === ItemType.DECK) {
      const deck = obj as any;
      const cardIdMap: Record<string, string> = {};

      deck.cardIds.forEach((oldCardId: string, index: number) => {
        const oldCard = state.objects[oldCardId] as any;
        if (oldCard) {
          const newCardId = `card-${Date.now()}-${index}`;
          cardIdMap[oldCardId] = newCardId;

          newObjects[newCardId] = {
            ...oldCard,
            id: newCardId,
            deckId: newId
          };
        }
      });

      (clonedObj as any).cardIds = Object.values(cardIdMap);
      (clonedObj as any).baseCardIds = Object.values(cardIdMap);
    }

    return { ...state, objects: newObjects };
  }

  return state;
}
}

export function toggleLockReducer(state: any, action: any): any {
  if (action.type !== 'TOGGLE_LOCK') return state;

  const obj = state.objects[action.payload.id];
  if (!obj) return state;

  return {
    ...state,
    objects: {
      ...state.objects,
      [action.payload.id]: { ...obj, locked: !obj.locked }
    }
  };
}

export function toggleOnTableReducer(state: any, action: any): any {
  if (action.type !== 'TOGGLE_ON_TABLE') return state;

  const obj = state.objects[action.payload.id];
  if (!obj) return state;

  return {
    ...state,
    objects: {
      ...state.objects,
      [action.payload.id]: { ...obj, isOnTable: !(obj as any).isOnTable }
    }
  };
}

export function moveLayerReducer(state: any, action: any): any {
  if (action.type !== 'MOVE_LAYER_UP' && action.type !== 'MOVE_LAYER_DOWN') return state;

  const obj = state.objects[action.payload.id];
  if (!obj) return state;

  const allObjects = Object.values(state.objects)
    .filter((o: unknown) => (o as any).zIndex !== undefined)
    .sort((a: unknown, b: unknown) => ((a as any).zIndex || 1000) - ((b as any).zIndex || 1000));

  const currentIndex = allObjects.findIndex((o: unknown) => (o as any).id === action.payload.id);
  if (currentIndex === -1) return state;

  const targetObj = allObjects[currentIndex];
  const currentZ = (targetObj as any).zIndex || 1000;

  if (action.type === 'MOVE_LAYER_UP') {
    const nextObj = allObjects[currentIndex + 1];
    if (nextObj) {
      const nextZ = (nextObj as any).zIndex || 1000;
      return {
        ...state,
        objects: {
          ...state.objects,
          [action.payload.id]: { ...(targetObj as any), zIndex: nextZ },
          [(nextObj as any).id]: { ...(nextObj as any), zIndex: currentZ }
        }
      };
    }
  } else {
    const prevObj = allObjects[currentIndex - 1];
    if (prevObj) {
      const prevZ = (prevObj as any).zIndex || 1000;
      return {
        ...state,
        objects: {
          ...state.objects,
          [action.payload.id]: { ...(targetObj as any), zIndex: prevZ },
          [(prevObj as any).id]: { ...(prevObj as any), zIndex: currentZ }
        }
      };
    }
  }

  return state;
}

export function updatePermissionsReducer(state: any, action: any): any {
  if (action.type !== 'UPDATE_PERMISSIONS') return state;

  const obj = state.objects[action.payload.id];
  if (!obj) return state;

  return {
    ...state,
    objects: {
      ...state.objects,
      [action.payload.id]: {
        ...obj,
        allowedActions: action.payload.allowedActions,
        allowedActionsForGM: action.payload.allowedActionsForGM
      }
    }
  };
}

export function updateActionButtonsReducer(state: any, action: any): any {
  if (action.type !== 'UPDATE_ACTION_BUTTONS') return state;

  const obj = state.objects[action.payload.id];
  if (!obj) return state;

  return {
    ...state,
    objects: {
      ...state.objects,
      [action.payload.id]: {
        ...obj,
        actionButtons: action.payload.actionButtons,
        singleClickAction: action.payload.singleClickAction,
        doubleClickAction: action.payload.doubleClickAction
      }
    }
  };
}