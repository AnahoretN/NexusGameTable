import { ViewTransform } from '../store/gameState';
import { TableObject } from '../types';

interface ViewportInfo {
  width: number;
  height: number;
}

interface StoredGameState {
  version: number;
  viewport: ViewportInfo;
  state: any;
}

const STORAGE_VERSION = 2; // Увеличиваем версию для новой структуры сохранения

/**
 * Преобразует состояние для сохранения с информацией о вьюпорте
 */
export function prepareStateForStorage(state: any, viewportWidth: number, viewportHeight: number): string {
  const storedState: StoredGameState = {
    version: STORAGE_VERSION,
    viewport: { width: viewportWidth, height: viewportHeight },
    state,
  };
  return JSON.stringify(storedState);
}

/**
 * Загружает состояние и адаптирует координаты объектов под текущий размер экрана
 */
export function loadAndAdaptState(storedData: string, currentViewportWidth: number, currentViewportHeight: number): any | null {
  try {
    const parsed = JSON.parse(storedData);

    // Если старая версия формата
    if (!parsed.version || parsed.version < 2) {
      return parsed; // Старый формат, возвращаем как есть
    }

    const stored: StoredGameState = parsed;
    const oldViewport = stored.viewport;
    const newState = { ...stored.state };

    // Проверяем, нужно ли адаптировать
    const needsAdaptation =
      oldViewport.width !== currentViewportWidth ||
      oldViewport.height !== currentViewportHeight;

    if (!needsAdaptation) {
      return newState;
    }

    // Адаптируем координаты объектов
    const scaleX = currentViewportWidth / oldViewport.width;
    const scaleY = currentViewportHeight / oldViewport.height;

    // Используем средний масштаб для сохранения пропорций
    const avgScale = (scaleX + scaleY) / 2;

    if (newState.objects) {
      const adaptedObjects: Record<string, TableObject> = {};

      Object.entries(newState.objects).forEach(([id, obj]: [string, any]) => {
        const adaptedObj = { ...obj };

        // Для "плавающих" элементов (закреплённых на вьюпорте) - не адаптируем
        if (obj.isPinnedToViewport) {
          adaptedObjects[id] = obj;
        } else {
          // Адаптируем позицию к новому размеру экрана
          adaptedObj.x = obj.x * scaleX;
          adaptedObj.y = obj.y * scaleY;

          // Также можно адаптировать размер объектов опционально
          // adaptedObj.width = obj.width * avgScale;
          // adaptedObj.height = obj.height * avgScale;
        }

        adaptedObjects[id] = adaptedObj;
      });

      newState.objects = adaptedObjects;
    }

    // Адаптируем viewTransform (pan/zoom)
    if (newState.viewTransform) {
      const vt: ViewTransform = newState.viewTransform;
      vt.scroll.x = vt.scroll.x * scaleX;
      vt.scroll.y = vt.scroll.y * scaleY;
    }

    return newState;
  } catch (e) {
    console.error('Error loading saved state:', e);
    return null;
  }
}

/**
 * Получить информацию о вьюпорте
 */
export function getViewportInfo(): ViewportInfo {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}
