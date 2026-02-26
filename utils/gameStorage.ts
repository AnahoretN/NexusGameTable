import type { TableObject, Player, PlayerPermissions, DiceRoll, DrawingData, UndoState, AppLanguage } from '../types';
import type { GameState, ViewTransform } from '../store/GameContext';
import { SCROLLBAR_WIDTH } from '../constants';
import { logger } from './logger';

const STORAGE_KEY = 'nexus-game-state';
const STORAGE_VERSION = 4; // Версия с правильной адаптацией

interface ViewportInfo {
  width: number;
  height: number;
}

export interface StoredGameState {
  version: number;
  timestamp: number;
  viewport: ViewportInfo;
  state: Partial<GameState>;
}

/**
 * Save the current game state to localStorage with viewport info
 */
export const saveGameState = (state: GameState): void => {
  if (typeof window === 'undefined') return;

  try {
    const storedData: StoredGameState = {
      version: STORAGE_VERSION,
      timestamp: Date.now(),
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      state: {
        // Save objects (the main game data)
        objects: state.objects,
        // Save players
        players: state.players,
        // Save active player ID (so user stays as same role)
        activePlayerId: state.activePlayerId,
        // Save dice rolls
        diceRolls: state.diceRolls,
        // Save view transform (zoom, pan position)
        viewTransform: state.viewTransform,
        // Save drawings
        drawings: state.drawings,
        // Save player permissions
        playerPermissions: state.playerPermissions,
        // Save language
        language: state.language,
        // Save session ID
        sessionId: state.sessionId,
      }
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(storedData));
  } catch (error) {
    logger.error('Failed to save game state:', error);
  }
};

/**
 * Load the game state from localStorage
 * Адаптирует объекты только если пользователь ХОСТ или играет ОДИН
 */
export const loadGameState = (isGuest: boolean): Partial<GameState> | null => {
  if (typeof window === 'undefined') return null;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored);

    // Миграция старых форматов
    if (!parsed.version || parsed.version < 3) {
      logger.log('Old save format detected, migrating...');
      return migrateOldFormat(parsed);
    }

    if (parsed.version === 3) {
      // Версия 3 имела проблему с адаптацией - перейдём на версию 4
      return migrateVersion3(parsed);
    }

    const data: StoredGameState = parsed;

    // Проверяем версию
    if (data.version !== STORAGE_VERSION) {
      logger.warn('Game state version mismatch, clearing saved state');
      clearGameState();
      return null;
    }

    // Check if state is too old (more than 7 days)
    const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    if (data.timestamp < weekAgo) {
      logger.warn('Saved game state is too old, clearing');
      clearGameState();
      return null;
    }

    // Если мы гость - НЕ адаптируем объекты (хост контролирует их позицию)
    // Если хост или одиночная игра - адаптируем объекты под новый размер экрана
    const shouldAdapt = !isGuest;
    const adaptedState = shouldAdapt
      ? adaptStateToViewport(data.state, data.viewport, window.innerWidth, window.innerHeight)
      : data.state;

    return adaptedState;
  } catch (error) {
    logger.error('Failed to load game state:', error);
    return null;
  }
};

/**
 * Миграция старого формата (версии < 3)
 */
function migrateOldFormat(parsed: any): Partial<GameState> | null {
  try {
    // Старый формат мог быть обёрнут в viewportAdapter структуру
    if (parsed.state && parsed.state.state) {
      return parsed.state.state;
    }
    if (parsed.state) {
      return parsed.state;
    }
    return parsed;
  } catch (e) {
    logger.error('Failed to migrate old format:', e);
    return null;
  }
}

/**
 * Миграция с версии 3 (которая адаптировала все объекты включая закреплённые)
 */
function migrateVersion3(parsed: any): Partial<GameState> | null {
  // Версия 3 уже адаптировала состояние, просто возвращаем его как есть
  // Но обновим версию при следующем сохранении
  if (parsed.state) {
    return parsed.state;
  }
  return parsed;
}

/**
 * Адаптирует состояние игры под новый размер экрана
 * Масштабирует позиции объектов и pan/zoom чтобы визуально всё оставалось на тех же местах
 *
 * ВАЖНО: Эта функция вызывается ТОЛЬКО для хоста или одиночной игры
 * Гости не адаптируют объекты - их положение контролирует хост
 */
function adaptStateToViewport(
  savedState: Partial<GameState>,
  savedViewport: ViewportInfo,
  currentWidth: number,
  currentHeight: number
): Partial<GameState> {
  const newState = { ...savedState };

  // Проверяем, нужно ли адаптировать
  const needsAdaptation =
    savedViewport.width !== currentWidth ||
    savedViewport.height !== currentHeight;

  if (!needsAdaptation) {
    return newState;
  }

  logger.log(`Adapting game state from ${savedViewport.width}x${savedViewport.height} to ${currentWidth}x${currentHeight}`);

  // Вычисляем коэффициенты масштабирования
  const scaleX = currentWidth / savedViewport.width;
  const scaleY = currentHeight / savedViewport.height;

  // Адаптируем объекты
  if (newState.objects) {
    const adaptedObjects: Record<string, TableObject> = {};

    Object.entries(newState.objects).forEach(([id, obj]: [string, any]) => {
      const adaptedObj = { ...obj };

      if (obj.isPinnedToViewport) {
        // Закреплённые объекты - проверяем что они не выходят за пределы экрана
        // Правая сторона должна быть в пределах экрана
        let newX = obj.x;
        let newY = obj.y;

        // Если объект за правым краем, сдвигаем
        if (newX + (obj.width || 100) > currentWidth) {
          newX = currentWidth - (obj.width || 100) - SCROLLBAR_WIDTH;
        }
        // Если ниже нижнего края, сдвигаем вверх
        if (newY + (obj.height || 100) > currentHeight - SCROLLBAR_WIDTH) {
          newY = currentHeight - (obj.height || 100) - SCROLLBAR_WIDTH;
        }

        adaptedObj.x = newX;
        adaptedObj.y = newY;

        // Адаптируем pinnedScreenPosition если есть
        if (obj.pinnedScreenPosition) {
          adaptedObj.pinnedScreenPosition = {
            x: newX,
            y: newY
          };
        }
      } else {
        // Обычные объекты - масштабируем координаты
        // Это сохраняет их визуальное положение относительно экрана
        adaptedObj.x = obj.x * scaleX;
        adaptedObj.y = obj.y * scaleY;
      }

      adaptedObjects[id] = adaptedObj;
    });

    newState.objects = adaptedObjects;
  }

  // Адаптируем viewTransform (pan/zoom) чтобы камера осталась на том же месте
  if (newState.viewTransform) {
    const vt: ViewTransform = { ...newState.viewTransform };
    if (vt.scroll) {
      vt.scroll = {
        x: vt.scroll.x * scaleX,
        y: vt.scroll.y * scaleY
      };
    }
    if (vt.offset) {
      vt.offset = {
        x: vt.offset.x * scaleX,
        y: vt.offset.y * scaleY
      };
    }
    newState.viewTransform = vt;
  }

  return newState;
}

/**
 * Clear the saved game state from localStorage
 */
export const clearGameState = (): void => {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    logger.error('Failed to clear game state:', error);
  }
};

/**
 * Check if there is a saved game state
 */
export const hasSavedGameState = (): boolean => {
  if (typeof window === 'undefined') return false;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return !!stored;
  } catch (error) {
    return false;
  }
};

/**
 * Get the timestamp of the saved game state
 * Returns null if no saved state exists
 */
export const getSavedGameTimestamp = (): number | null => {
  if (typeof window === 'undefined') return null;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const data: StoredGameState = JSON.parse(stored);
    return data.timestamp;
  } catch (error) {
    return null;
  }
};

/**
 * Format timestamp to readable date/time
 */
export const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleString();
};
