import { MAIN_MENU_WIDTH, SCROLLBAR_WIDTH } from '../constants';
import { logger } from './logger';

const LOCAL_SETTINGS_KEY = 'nexus-local-settings';

// Local panel settings for each panel
export interface LocalPanelSettings {
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
  isPinnedToViewport: boolean;
  pinnedScreenPosition?: { x: number; y: number };
  expandedState?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  collapsedState?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  expandedPinnedPosition?: { x: number; y: number };
  collapsedPinnedPosition?: { x: number; y: number };
}

export interface LocalSettings {
  // Main menu position (local for each player)
  mainMenuPosition: {
    x: number;
    y: number;
  };
  // Main menu size (local for each player)
  mainMenuSize: {
    width: number;
    height: number;
  };
  // Whether the initial screen has been shown (for first launch)
  hasSeenInitialScreen: boolean;
  // Whether the menu position was set by the user (or loaded from save)
  isPositionSet: boolean;
  // Visual effects settings
  effects: {
    // Show shadow/ghost version of objects held by other players in their cursor slot
    showRemoteCursorSlotObjects: boolean;
  };
  // Zoom level for game space (100 = default, affects object sizes)
  zoom: number;
  // Local panel settings - keyed by panel ID
  // These settings override the global panel state for each player
  panelSettings: {
    [panelId: string]: LocalPanelSettings;
  };
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
  effects: {
    showRemoteCursorSlotObjects: true, // Enabled by default
  },
  zoom: 100, // Default 100%
  panelSettings: {}, // Empty by default - panels will use global settings until customized
};

/**
 * Save player's local settings
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
 * Load player's local settings
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
 * Check if there are saved local settings
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
 * Calculate main menu position for current screen size
 * Right side of menu flush with left side of vertical scrollbar
 * Bottom edge of menu flush with top edge of horizontal scrollbar
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
 * Clear local settings
 */
export const clearLocalSettings = (): void => {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(LOCAL_SETTINGS_KEY);
  } catch (error) {
    logger.error('Failed to clear local settings:', error);
  }
};

/**
 * Get local settings for a specific panel
 * Returns null if no local settings exist for this panel
 */
export const getLocalPanelSettings = (panelId: string): LocalPanelSettings | null => {
  const settings = loadLocalSettings();
  return settings.panelSettings[panelId] || null;
};

/**
 * Update local settings for a specific panel
 * OPTIMIZED: Debounces localStorage writes to prevent performance issues during drag
 */
let updateTimeout: ReturnType<typeof setTimeout> | null = null;
let pendingUpdates: Map<string, Partial<LocalPanelSettings>> = new Map();

export const updateLocalPanelSettings = (panelId: string, updates: Partial<LocalPanelSettings>): void => {
  // Store pending updates
  pendingUpdates.set(panelId, updates);

  // Clear existing timeout
  if (updateTimeout) {
    clearTimeout(updateTimeout);
  }

  // Schedule write after 100ms of no updates
  updateTimeout = setTimeout(() => {
    const settings = loadLocalSettings();

    // Apply all pending updates
    pendingUpdates.forEach((updates, id) => {
      // Initialize panel settings if they don't exist
      if (!settings.panelSettings[id]) {
        settings.panelSettings[id] = {
          x: 0,
          y: 0,
          width: 400,
          height: 300,
          minimized: false,
          isPinnedToViewport: true,
        };
      }

      // Apply updates
      settings.panelSettings[id] = {
        ...settings.panelSettings[id],
        ...updates
      };
    });

    saveLocalSettings(settings);

    // Clear pending updates
    pendingUpdates.clear();
    updateTimeout = null;
  }, 100);
};

/**
 * Remove local settings for a specific panel
 */
export const removeLocalPanelSettings = (panelId: string): void => {
  const settings = loadLocalSettings();

  if (settings.panelSettings[panelId]) {
    delete settings.panelSettings[panelId];
    saveLocalSettings(settings);
  }
};

/**
 * Clear all local panel settings
 */
export const clearAllLocalPanelSettings = (): void => {
  const settings = loadLocalSettings();
  settings.panelSettings = {};
  saveLocalSettings(settings);
};
