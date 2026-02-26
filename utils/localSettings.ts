import { MAIN_MENU_WIDTH, SCROLLBAR_WIDTH } from '../constants';
import { logger } from './logger';

const LOCAL_SETTINGS_KEY = 'nexus-local-settings';

export interface LocalSettings {
  // Позиция главного меню (локальная для каждого игрока)
  mainMenuPosition: {
    x: number;
    y: number;
  };
  // Размеры главного меню (локальная для каждого игрока)
  mainMenuSize: {
    width: number;
    height: number;
  };
  // Был ли уже основной экран показан (для первого запуска)
  hasSeenInitialScreen: boolean;
  // Была ли позиция меню установлена пользователем (или загружена из сохранения)
  isPositionSet: boolean;
}

const DEFAULT_LOCAL_SETTINGS: LocalSettings = {
  mainMenuPosition: {
    x: 0,
    y: 0,
  },
  mainMenuSize: {
    width: MAIN_MENU_WIDTH,
    height: 600,
  },
  hasSeenInitialScreen: false,
  isPositionSet: false,
};

/**
 * Сохранить локальные настройки игрока
 */
export const saveLocalSettings = (settings: LocalSettings): void => {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    logger.error('Failed to save local settings:', error);
  }
};

/**
 * Загрузить локальные настройки игрока
 */
export const loadLocalSettings = (): LocalSettings => {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_LOCAL_SETTINGS };
  }

  try {
    const stored = localStorage.getItem(LOCAL_SETTINGS_KEY);
    if (!stored) {
      return { ...DEFAULT_LOCAL_SETTINGS };
    }

    const parsed = JSON.parse(stored);
    return {
      ...DEFAULT_LOCAL_SETTINGS,
      ...parsed,
    };
  } catch (error) {
    logger.error('Failed to load local settings:', error);
    return { ...DEFAULT_LOCAL_SETTINGS };
  }
};

/**
 * Проверить, есть ли сохранённые локальные настройки
 */
export const hasLocalSettings = (): boolean => {
  if (typeof window === 'undefined') return false;

  try {
    const stored = localStorage.getItem(LOCAL_SETTINGS_KEY);
    return !!stored;
  } catch (error) {
    return false;
  }
};

/**
 * Вычислить позицию главного меню для текущего размера экрана
 * Правая сторона меню вплотную к левой стороне вертикального скроллбара
 * Нижний край меню вплотную к верхнему краю горизонтального скроллбара
 */
export const calculateMainMenuPosition = (): { x: number; y: number; width: number; height: number } => {
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;

  return {
    x: screenWidth - MAIN_MENU_WIDTH - SCROLLBAR_WIDTH,
    y: 0,
    width: MAIN_MENU_WIDTH,
    height: screenHeight - SCROLLBAR_WIDTH,
  };
};

/**
 * Очистить локальные настройки
 */
export const clearLocalSettings = (): void => {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(LOCAL_SETTINGS_KEY);
  } catch (error) {
    logger.error('Failed to clear local settings:', error);
  }
};
