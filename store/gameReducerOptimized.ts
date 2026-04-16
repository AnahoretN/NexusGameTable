/**
 * GameReducer v2.0 - Optimized reducer for game objects only
 *
 * @version 2.0.0
 * @since 2026-04-17
 *
 * ИЗМЕНЕНИЯ с v1.0:
 * ✅ Работает только с GameState v2.0 (без дублирующихся полей)
 * ✅ Обрабатывает только actions для игровых объектов
 * ✅ НЕ обрабатывает actions для контекстов (перенесены в соответствующие контексты)
 * ✅ Оптимизирован для производительности
 * ✅ Сохранена WebRTC синхронизация для игровых объектов
 */

import { GameState, initialGameState } from './gameStateOptimized.v2';
import { Action } from './gameActionsOptimized';
import { ItemType } from '../types';
import { logger } from '../utils/logger';

// ============================================================================
// MAIN REDUCER
// ============================================================================

/**
 * Optimized game reducer for GameState v2.0
 *
 * Обрабатывает только действия, связанные с игровыми объектами.
 * Все действия, связанные с игроками, viewTransform и UI перенесены в соответствующие контексты.
 */
export function gameReducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    // ========================================================================
    // OBJECT MANIPULATION
    // ========================================================================

    case 'SET_OBJECTS': {
      logger.debug('[GameReducer] Setting all objects:', Object.keys(action.payload).length);
      return {
        ...state,
        objects: action.payload,
      };
    }

    case 'SET_OBJECT': {
      const { id, object } = action.payload;
      logger.debug('[GameReducer] Setting object:', id);
      return {
        ...state,
        objects: {
          ...state.objects,
          [id]: object,
        },
      };
    }

    case 'UPDATE_OBJECT': {
      const { id, updates } = action.payload;
      const existingObject = state.objects[id];
      if (!existingObject) {
        logger.warn('[GameReducer] Cannot update non-existent object:', id);
        return state;
      }

      logger.debug('[GameReducer] Updating object:', id);
      return {
        ...state,
        objects: {
          ...state.objects,
          [id]: { ...existingObject, ...updates },
        },
      };
    }

    case 'DELETE_OBJECT': {
      const idToDelete = action.payload;
      if (!state.objects[idToDelete]) {
        logger.warn('[GameReducer] Cannot delete non-existent object:', idToDelete);
        return state;
      }

      logger.debug('[GameReducer] Deleting object:', idToDelete);
      const { [idToDelete]: deleted, ...remainingObjects } = state.objects;
      return {
        ...state,
        objects: remainingObjects,
      };
    }

    case 'DELETE_MULTIPLE_OBJECTS': {
      const idsToDelete = new Set(action.payload);
      logger.debug('[GameReducer] Deleting multiple objects:', action.payload.length);

      const remainingObjects: Record<string, any> = {};
      Object.entries(state.objects).forEach(([id, obj]) => {
        if (!idsToDelete.has(id)) {
          remainingObjects[id] = obj;
        }
      });

      return {
        ...state,
        objects: remainingObjects,
      };
    }

    case 'MOVE_OBJECT': {
      const { id, x, y } = action.payload;
      const existingObject = state.objects[id];
      if (!existingObject) {
        logger.warn('[GameReducer] Cannot move non-existent object:', id);
        return state;
      }

      return {
        ...state,
        objects: {
          ...state.objects,
          [id]: { ...existingObject, x, y },
        },
      };
    }

    case 'MOVE_MULTIPLE_OBJECTS': {
      const movements = action.payload;
      logger.debug('[GameReducer] Moving multiple objects:', movements.length);

      const updatedObjects = { ...state.objects };
      movements.forEach(({ id, x, y }) => {
        if (updatedObjects[id]) {
          updatedObjects[id] = { ...updatedObjects[id], x, y };
        }
      });

      return {
        ...state,
        objects: updatedObjects,
      };
    }

    // ========================================================================
    // CARD OPERATIONS
    // ========================================================================

    case 'DRAW_CARD': {
      const { deckId, playerId, faceUp } = action.payload;
      const deck = state.objects[deckId];

      if (!deck || deck.type !== ItemType.DECK) {
        logger.warn('[GameReducer] Cannot draw from non-existent deck:', deckId);
        return state;
      }

      logger.debug('[GameReducer] Drawing card from deck:', deckId);

      // Логика вытягивания карты из колоды
      // (упрощенная версия, полная логика будет в отдельном модуле)
      const cardId = `card-${Date.now()}-${Math.random()}`;
      const newCard = {
        id: cardId,
        type: ItemType.CARD,
        x: deck.x + 50,
        y: deck.y + 50,
        name: 'Card',
        faceUp: faceUp ?? false,
        ownerId: playerId,
      };

      return {
        ...state,
        objects: {
          ...state.objects,
          [cardId]: newCard,
        },
      };
    }

    case 'RETURN_CARD_TO_DECK': {
      const { cardId, deckId, position } = action.payload;
      const card = state.objects[cardId];
      const deck = state.objects[deckId];

      if (!card || !deck) {
        logger.warn('[GameReducer] Cannot return card to deck:', { cardId, deckId });
        return state;
      }

      logger.debug('[GameReducer] Returning card to deck:', cardId);

      // Удалить карту из объектов (она возвращается в колоду)
      const { [cardId]: removed, ...remainingObjects } = state.objects;

      // В реальной реализации здесь нужно обновить состояние колоды
      // Для simplicity сейчас просто удаляем карту

      return {
        ...state,
        objects: remainingObjects,
      };
    }

    case 'SHUFFLE_DECK': {
      const deckId = action.payload;
      const deck = state.objects[deckId];

      if (!deck || deck.type !== ItemType.DECK) {
        logger.warn('[GameReducer] Cannot shuffle non-existent deck:', deckId);
        return state;
      }

      logger.debug('[GameReducer] Shuffling deck:', deckId);

      // В реальной реализации здесь нужно перемешать карты в колоде
      // Для simplicity сейчас просто логируем

      return state;
    }

    case 'SORT_DECK': {
      const deckId = action.payload;
      logger.debug('[GameReducer] Sorting deck:', deckId);

      // В реальной реализации здесь нужно отсортировать карты в колоде
      // Для simplicity сейчас просто логируем

      return state;
    }

    // ========================================================================
    // DICE OPERATIONS
    // ========================================================================

    case 'ROLL_DICE': {
      logger.debug('[GameReducer] Rolling dice:', action.payload);
      return {
        ...state,
        diceRolls: [...state.diceRolls, action.payload],
      };
    }

    case 'CLEAR_DICE_ROLLS': {
      logger.debug('[GameReducer] Clearing dice rolls');
      return {
        ...state,
        diceRolls: [],
      };
    }

    case 'CREATE_DICE_GROUP': {
      logger.debug('[GameReducer] Creating dice group:', action.payload);
      return {
        ...state,
        diceGroups: [...state.diceGroups, action.payload],
      };
    }

    case 'UPDATE_DICE_GROUP': {
      const { groupId, updates } = action.payload;
      logger.debug('[GameReducer] Updating dice group:', groupId);

      return {
        ...state,
        diceGroups: state.diceGroups.map(group =>
          group.id === groupId ? { ...group, ...updates } : group
        ),
      };
    }

    case 'DELETE_DICE_GROUP': {
      const groupId = action.payload;
      logger.debug('[GameReducer] Deleting dice group:', groupId);

      return {
        ...state,
        diceGroups: state.diceGroups.filter(group => group.id !== groupId),
      };
    }

    // ========================================================================
    // DRAWING OPERATIONS
    // ========================================================================

    case 'ADD_DRAWING_LAYER': {
      logger.debug('[GameReducer] Adding drawing layer:', action.payload);
      return {
        ...state,
        drawings: {
          ...state.drawings,
          layers: [...state.drawings.layers, action.payload],
        },
      };
    }

    case 'UPDATE_DRAWING_LAYER': {
      const { layerId, updates } = action.payload;
      logger.debug('[GameReducer] Updating drawing layer:', layerId);

      return {
        ...state,
        drawings: {
          ...state.drawings,
          layers: state.drawings.layers.map(layer =>
            layer.id === layerId ? { ...layer, ...updates } : layer
          ),
        },
      };
    }

    case 'REMOVE_DRAWING_LAYER': {
      const layerId = action.payload;
      logger.debug('[GameReducer] Removing drawing layer:', layerId);

      return {
        ...state,
        drawings: {
          ...state.drawings,
          layers: state.drawings.layers.filter(layer => layer.id !== layerId),
        },
      };
    }

    case 'ADD_DRAWING': {
      const { layerId, drawing } = action.payload;
      logger.debug('[GameReducer] Adding drawing to layer:', layerId);

      return {
        ...state,
        drawings: {
          ...state.drawings,
          layers: state.drawings.layers.map(layer => {
            if (layer.id === layerId) {
              return {
                ...layer,
                drawings: [...layer.drawings, drawing],
              };
            }
            return layer;
          }),
        },
      };
    }

    case 'UPDATE_DRAWING': {
      const { layerId, drawingId, updates } = action.payload;
      logger.debug('[GameReducer] Updating drawing:', drawingId);

      return {
        ...state,
        drawings: {
          ...state.drawings,
          layers: state.drawings.layers.map(layer => {
            if (layer.id === layerId) {
              return {
                ...layer,
                drawings: layer.drawings.map(drawing =>
                  drawing.id === drawingId ? { ...drawing, ...updates } : drawing
                ),
              };
            }
            return layer;
          }),
        },
      };
    }

    case 'REMOVE_DRAWING': {
      const { layerId, drawingId } = action.payload;
      logger.debug('[GameReducer] Removing drawing:', drawingId);

      return {
        ...state,
        drawings: {
          ...state.drawings,
          layers: state.drawings.layers.map(layer => {
            if (layer.id === layerId) {
              return {
                ...layer,
                drawings: layer.drawings.filter(drawing => drawing.id !== drawingId),
              };
            }
            return layer;
          }),
        },
      };
    }

    case 'CLEAR_DRAWINGS': {
      const layerId = action.payload;
      logger.debug('[GameReducer] Clearing drawings in layer:', layerId);

      return {
        ...state,
        drawings: {
          ...state.drawings,
          layers: state.drawings.layers.map(layer => {
            if (layer.id === layerId) {
              return {
                ...layer,
                drawings: [],
              };
            }
            return layer;
          }),
        },
      };
    }

    // ========================================================================
    // UNDO/REDO
    // ========================================================================

    case 'UNDO': {
      if (state.undo.past.length === 0) {
        logger.debug('[GameReducer] Nothing to undo');
        return state;
      }

      logger.debug('[GameReducer] Undoing action');
      const previous = state.undo.past[state.undo.past.length - 1];
      const newPast = state.undo.past.slice(0, state.undo.past.length - 1);

      return {
        ...state,
        objects: previous.objects,
        undo: {
          past: newPast,
          future: [state.objects, ...state.undo.future],
        },
      };
    }

    case 'REDO': {
      if (state.undo.future.length === 0) {
        logger.debug('[GameReducer] Nothing to redo');
        return state;
      }

      logger.debug('[GameReducer] Redoing action');
      const next = state.undo.future[0];
      const newFuture = state.undo.future.slice(1);

      return {
        ...state,
        objects: next,
        undo: {
          past: [...state.undo.past, state.objects],
          future: newFuture,
        },
      };
    }

    case 'SAVE_STATE': {
      logger.debug('[GameReducer] Saving state for undo');
      return {
        ...state,
        undo: {
          past: [...state.undo.past, state.objects],
          future: [],
        },
      };
    }

    // ========================================================================
    // GAME STATE
    // ========================================================================

    case 'SET_CONNECTIONS_LOCKED': {
      logger.debug('[GameReducer] Setting connections locked:', action.payload);
      return {
        ...state,
        connectionsLocked: action.payload,
      };
    }

    // ========================================================================
    // NEXUS BOARD OPERATIONS
    // ========================================================================

    case 'UPDATE_NEXUS_CELL': {
      const { boardId, cellId, updates } = action.payload;
      logger.debug('[GameReducer] Updating nexus cell:', cellId);

      // В реальной реализации здесь нужно обновить клетку в nexus board
      // Для simplicity сейчас просто логируем

      return state;
    }

    // ========================================================================
    // PANEL OPERATIONS
    // ========================================================================

    case 'SET_PANEL_TAB': {
      const { panelId, tabId } = action.payload;
      logger.debug('[GameReducer] Setting panel tab:', { panelId, tabId });

      const panel = state.objects[panelId];
      if (panel && (panel.type === ItemType.PANEL || panel.type === ItemType.WINDOW)) {
        return {
          ...state,
          objects: {
            ...state.objects,
            [panelId]: { ...panel, selectedTabId: tabId },
          },
        };
      }

      return state;
    }

    case 'UPDATE_POOL_PANEL_DATA': {
      const { panelId, data } = action.payload;
      logger.debug('[GameReducer] Updating pool panel data:', panelId);

      const panel = state.objects[panelId];
      if (panel && panel.type === ItemType.PANEL) {
        return {
          ...state,
          objects: {
            ...state.objects,
            [panelId]: { ...panel, poolPanelData: { ...panel.poolPanelData, ...data } },
          },
        };
      }

      return state;
    }

    case 'UPDATE_TABLEAU_PANEL_DATA': {
      const { panelId, data } = action.payload;
      logger.debug('[GameReducer] Updating tableau panel data:', panelId);

      const panel = state.objects[panelId];
      if (panel && panel.type === ItemType.PANEL) {
        return {
          ...state,
          objects: {
            ...state.objects,
            [panelId]: { ...panel, tableauPanelData: { ...panel.tableauPanelData, ...data } },
          },
        };
      }

      return state;
    }

    // ========================================================================
    // SESSION MANAGEMENT (WebRTC)
    // ========================================================================

    case 'SYNC_STATE': {
      logger.info('[GameReducer] Syncing state from remote');

      // WebRTC синхронизация для игровых объектов
      // (без players, viewTransform, language и т.д. - они в контекстах)
      return {
        ...state,
        ...action.payload,
      };
    }

    case 'RESTORE_IMAGES': {
      logger.debug('[GameReducer] Restoring images from cache');

      const restoredObjects: Record<string, any> = {};
      Object.entries(state.objects).forEach(([id, obj]) => {
        restoredObjects[id] = obj; // В реальной реализации нужно восстановить изображения
      });

      return {
        ...state,
        objects: restoredObjects,
      };
    }

    // ========================================================================
    // LOAD/SAVE
    // ========================================================================

    case 'LOAD_GAME': {
      logger.info('[GameReducer] Loading game from save');

      // Миграция данных из save файла в GameState v2.0
      const migratedData = action.payload;

      return {
        ...state,
        objects: migratedData.objects || {},
        diceRolls: migratedData.diceRolls || [],
        drawings: migratedData.drawings || { layers: [] },
        undo: migratedData.undo || { past: [], future: [] },
        connectionsLocked: migratedData.connectionsLocked || false,
        diceGroups: migratedData.diceGroups || [],
        sessionId: migratedData.sessionId || '',
        lastModifiedBy: migratedData.lastModifiedBy,
      };
    }

    case 'NEW_GAME': {
      logger.info('[GameReducer] Creating new game');
      return initialGameState;
    }

    case 'SAVE_GAME': {
      logger.info('[GameReducer] Saving game');
      // Сохранение обрабатывается в отдельном модуле
      return state;
    }

    // ========================================================================
    // DEFAULT
    // ========================================================================

    default:
      logger.warn('[GameReducer] Unknown action:', action);
      return state;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default gameReducer;