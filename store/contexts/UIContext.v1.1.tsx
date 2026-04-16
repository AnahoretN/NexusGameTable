/**
 * UIContext v1.1 - Управление UI состоянием (частичная синхронизация)
 *
 * @version 1.1.0
 * @since 2026-04-17
 *
 * СИНХРОНИЗИРУЕТСЯ (общие для всех игроков):
 * ✅ hyperscaleLayers - слои объектов
 * ✅ selectedHyperscaleLayerIds - выбранные слои
 * ✅ playerPanelSettings - настройки панелей игроков
 *
 * НЕ СИНХРОНИЗИРУЕТСЯ (локальные настройки):
 * ❌ language - язык интерфейса (каждый игрок выбирает свой)
 *
 * ИЗМЕНЕНИЯ с v1.0:
 * ✅ Добавлена документация о WebRTC синхронизации
 * ✅ Добавлены WebRTC методы для частичной синхронизации
 * ✅ Оптимизированы hooks для предотвращения ререндеров
 */

import React, { createContext, useContext, useReducer, useCallback, useEffect, useMemo } from 'react';
import { AppLanguage, HyperscaleLayer } from '../../types';
import { logger } from '../../utils/logger';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Состояние UIContext
 */
export interface UIState {
  language: AppLanguage;
  playerPanelSettings: Record<string, Record<string, any>>;
  hyperscaleLayers: HyperscaleLayer[];
  selectedHyperscaleLayerIds: string[];
}

/**
 * Данные для WebRTC синхронизации (только синхронизируемые поля)
 */
export interface UISyncData {
  hyperscaleLayers: HyperscaleLayer[];
  selectedHyperscaleLayerIds: string[];
  playerPanelSettings: Record<string, Record<string, any>>;
  // language НЕ включается (локальное)
}

/**
 * Значение UIContext
 */
export interface UIContextValue extends UIState {
  // Language
  setLanguage: (language: AppLanguage) => void;

  // Panel settings
  updatePanelSettings: (playerId: string, panelId: string, settings: any) => void;
  removePanelSettings: (playerId: string, panelId: string) => void;

  // Hyperscale layers
  addHyperscaleLayer: (layer: HyperscaleLayer) => void;
  updateHyperscaleLayer: (layerId: string, updates: Partial<HyperscaleLayer>) => void;
  removeHyperscaleLayer: (layerId: string) => void;

  // Selected layers
  toggleLayerSelection: (layerId: string) => void;
  setLayerSelection: (layerIds: string[]) => void;
  selectAllLayers: () => void;
  deselectAllLayers: () => void;

  // Getters
  getSelectedLayers: () => HyperscaleLayer[];
  getPanelSettings: (playerId: string, panelId: string) => any;

  // WebRTC методы (новые в v1.1)
  syncFromRemote: (remoteData: UISyncData) => void;
  getSyncData: () => UISyncData;
  onUIChange?: (data: UISyncData) => void; // Callback для WebRTC
}

/**
 * Action типы для reducer
 */
type UIAction =
  | { type: 'SET_LANGUAGE'; payload: AppLanguage }
  | { type: 'UPDATE_PANEL_SETTINGS'; payload: { playerId: string; panelId: string; settings: any } }
  | { type: 'REMOVE_PANEL_SETTINGS'; payload: { playerId: string; panelId: string } }
  | { type: 'ADD_HYPERSCALE_LAYER'; payload: HyperscaleLayer }
  | { type: 'UPDATE_HYPERSCALE_LAYER'; payload: { layerId: string; updates: Partial<HyperscaleLayer> } }
  | { type: 'REMOVE_HYPERSCALE_LAYER'; payload: string }
  | { type: 'TOGGLE_LAYER_SELECTION'; payload: string }
  | { type: 'SET_LAYER_SELECTION'; payload: string[] }
  | { type: 'SELECT_ALL_LAYERS' }
  | { type: 'DESELECT_ALL_LAYERS' }
  | { type: 'SYNC_FROM_REMOTE'; payload: UISyncData }; // Новый action для WebRTC

// ============================================================================
// INITIAL STATE
// ============================================================================

const initialUIState: UIState = {
  language: (typeof localStorage !== 'undefined'
    ? (localStorage.getItem('app-language') as AppLanguage)
    : 'en') || 'en',
  playerPanelSettings: {},
  hyperscaleLayers: [
    {
      id: 'boards',
      name: 'Game Boards',
      minZIndex: 1,
      maxZIndex: 1000,
      color: '#3b82f6',
      playerCanSelect: true,
      playerCanView: true,
      individualPosition: false,
      individualObjects: false,
      zoomEnabled: true,
      order: 0,
    },
    {
      id: 'cards',
      name: 'Cards',
      minZIndex: 1001,
      maxZIndex: 3000,
      color: '#f59e0b',
      playerCanSelect: true,
      playerCanView: true,
      individualPosition: false,
      individualObjects: false,
      zoomEnabled: true,
      order: 1,
    },
    {
      id: 'tokens',
      name: 'Tokens',
      minZIndex: 3001,
      maxZIndex: 6000,
      color: '#10b981',
      playerCanSelect: true,
      playerCanView: true,
      individualPosition: false,
      individualObjects: false,
      zoomEnabled: true,
      order: 2,
    },
    {
      id: 'drawings',
      name: 'Drawings',
      minZIndex: 6001,
      maxZIndex: 7000,
      color: '#ec4899',
      playerCanSelect: true,
      playerCanView: true,
      individualPosition: true,
      individualObjects: false,
      zoomEnabled: true,
      order: 3,
    },
    {
      id: 'interface',
      name: 'Interface',
      minZIndex: 9001,
      maxZIndex: 10000,
      color: '#8b5cf6',
      playerCanSelect: true,
      playerCanView: false,
      individualPosition: true,
      individualObjects: true,
      zoomEnabled: false,
      order: 4,
    },
  ],
  selectedHyperscaleLayerIds: ['boards', 'cards', 'tokens', 'drawings', 'interface'],
};

// ============================================================================
// REDUCER
// ============================================================================

function uiReducer(state: UIState, action: UIAction): UIState {
  switch (action.type) {
    case 'SET_LANGUAGE':
      logger.debug('[UIContext] Setting language:', action.payload);
      return {
        ...state,
        language: action.payload,
      };

    case 'UPDATE_PANEL_SETTINGS':
      logger.debug('[UIContext] Updating panel settings:', action.payload);
      return {
        ...state,
        playerPanelSettings: {
          ...state.playerPanelSettings,
          [action.payload.playerId]: {
            ...state.playerPanelSettings[action.payload.playerId],
            [action.payload.panelId]: {
              ...state.playerPanelSettings[action.payload.playerId]?.[action.payload.panelId],
              ...action.payload.settings,
            },
          },
        },
      };

    case 'REMOVE_PANEL_SETTINGS':
      const { [action.payload.playerId]: playerSettings, ...restPlayerSettings } = state.playerPanelSettings;
      if (playerSettings) {
        const { [action.payload.panelId]: removed, ...remainingPanelSettings } = playerSettings;
        return {
          ...state,
          playerPanelSettings: {
            ...restPlayerSettings,
            ...(Object.keys(remainingPanelSettings).length > 0 ? { [action.payload.playerId]: remainingPanelSettings } : {}),
          },
        };
      }
      return state;

    case 'ADD_HYPERSCALE_LAYER':
      logger.debug('[UIContext] Adding hyperscale layer:', action.payload);
      return {
        ...state,
        hyperscaleLayers: [...state.hyperscaleLayers, action.payload],
      };

    case 'UPDATE_HYPERSCALE_LAYER':
      logger.debug('[UIContext] Updating hyperscale layer:', action.payload);
      return {
        ...state,
        hyperscaleLayers: state.hyperscaleLayers.map(layer =>
          layer.id === action.payload.layerId
            ? { ...layer, ...action.payload.updates }
            : layer
        ),
      };

    case 'REMOVE_HYPERSCALE_LAYER':
      logger.debug('[UIContext] Removing hyperscale layer:', action.payload);
      return {
        ...state,
        hyperscaleLayers: state.hyperscaleLayers.filter(layer => layer.id !== action.payload),
        selectedHyperscaleLayerIds: state.selectedHyperscaleLayerIds.filter(
          id => id !== action.payload
        ),
      };

    case 'TOGGLE_LAYER_SELECTION':
      const isSelected = state.selectedHyperscaleLayerIds.includes(action.payload);
      return {
        ...state,
        selectedHyperscaleLayerIds: isSelected
          ? state.selectedHyperscaleLayerIds.filter(id => id !== action.payload)
          : [...state.selectedHyperscaleLayerIds, action.payload],
      };

    case 'SET_LAYER_SELECTION':
      logger.debug('[UIContext] Setting layer selection:', action.payload);
      return {
        ...state,
        selectedHyperscaleLayerIds: action.payload,
      };

    case 'SELECT_ALL_LAYERS':
      return {
        ...state,
        selectedHyperscaleLayerIds: state.hyperscaleLayers.map(layer => layer.id),
      };

    case 'DESELECT_ALL_LAYERS':
      return {
        ...state,
        selectedHyperscaleLayerIds: [],
      };

    case 'SYNC_FROM_REMOTE':
      // Новый action для WebRTC синхронизации (без language!)
      logger.debug('[UIContext] Syncing from remote:', action.payload);
      return {
        ...state,
        // НЕ синхронизируем language (локальное)
        hyperscaleLayers: action.payload.hyperscaleLayers || state.hyperscaleLayers,
        selectedHyperscaleLayerIds: action.payload.selectedHyperscaleLayerIds || state.selectedHyperscaleLayerIds,
        playerPanelSettings: action.payload.playerPanelSettings || state.playerPanelSettings,
      };

    default:
      return state;
  }
}

// ============================================================================
// CONTEXT
// ============================================================================

const UIContext = createContext<UIContextValue | null>(null);

// ============================================================================
// PROVIDER
// ============================================================================

interface UIProviderProps {
  children: React.ReactNode;
  initialSyncData?: UISyncData; // Начальные данные из WebRTC
  onUIChange?: (data: UISyncData) => void; // Callback для WebRTC синхронизации
}

export function UIProviderV1({
  children,
  initialSyncData,
  onUIChange
}: UIProviderProps) {
  // Инициализируем состояние из initialSyncData или используем дефолтное
  const initialState = useMemo(() => {
    if (initialSyncData) {
      return {
        // language НЕ инициализируем из WebRTC (локальное)
        language: initialUIState.language,
        hyperscaleLayers: initialSyncData.hyperscaleLayers || initialUIState.hyperscaleLayers,
        selectedHyperscaleLayerIds: initialSyncData.selectedHyperscaleLayerIds || initialUIState.selectedHyperscaleLayerIds,
        playerPanelSettings: initialSyncData.playerPanelSettings || initialUIState.playerPanelSettings,
      };
    }
    return initialUIState;
  }, [initialSyncData]);

  const [state, dispatch] = useReducer(uiReducer, initialState);

  // WebRTC синхронизация - уведомляем об изменениях (кроме language)
  useEffect(() => {
    if (onUIChange) {
      const syncData: UISyncData = {
        // НЕ включаем language (локальное)
        hyperscaleLayers: state.hyperscaleLayers,
        selectedHyperscaleLayerIds: state.selectedHyperscaleLayerIds,
        playerPanelSettings: state.playerPanelSettings,
      };

      onUIChange(syncData);
    }
  }, [
    state.hyperscaleLayers,
    state.selectedHyperscaleLayerIds,
    state.playerPanelSettings,
    onUIChange
  ]); // НЕ включаем state.language в зависимости!

  // Language action с сохранением в localStorage
  const setLanguage = useCallback((language: AppLanguage) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('app-language', language);
    }
    dispatch({ type: 'SET_LANGUAGE', payload: language });
  }, []);

  // Panel settings actions
  const updatePanelSettings = useCallback((playerId: string, panelId: string, settings: any) => {
    dispatch({ type: 'UPDATE_PANEL_SETTINGS', payload: { playerId, panelId, settings } });
  }, []);

  const removePanelSettings = useCallback((playerId: string, panelId: string) => {
    dispatch({ type: 'REMOVE_PANEL_SETTINGS', payload: { playerId, panelId } });
  }, []);

  // Hyperscale layers actions
  const addHyperscaleLayer = useCallback((layer: HyperscaleLayer) => {
    dispatch({ type: 'ADD_HYPERSCALE_LAYER', payload: layer });
  }, []);

  const updateHyperscaleLayer = useCallback((layerId: string, updates: Partial<HyperscaleLayer>) => {
    dispatch({ type: 'UPDATE_HYPERSCALE_LAYER', payload: { layerId, updates } });
  }, []);

  const removeHyperscaleLayer = useCallback((layerId: string) => {
    dispatch({ type: 'REMOVE_HYPERSCALE_LAYER', payload: layerId });
  }, []);

  // Layer selection actions
  const toggleLayerSelection = useCallback((layerId: string) => {
    dispatch({ type: 'TOGGLE_LAYER_SELECTION', payload: layerId });
  }, []);

  const setLayerSelection = useCallback((layerIds: string[]) => {
    dispatch({ type: 'SET_LAYER_SELECTION', payload: layerIds });
  }, []);

  const selectAllLayers = useCallback(() => {
    dispatch({ type: 'SELECT_ALL_LAYERS' });
  }, []);

  const deselectAllLayers = useCallback(() => {
    dispatch({ type: 'DESELECT_ALL_LAYERS' });
  }, []);

  // Getters
  const getSelectedLayers = useCallback((): HyperscaleLayer[] => {
    return state.hyperscaleLayers.filter(layer =>
      state.selectedHyperscaleLayerIds.includes(layer.id)
    );
  }, [state.hyperscaleLayers, state.selectedHyperscaleLayerIds]);

  const getPanelSettings = useCallback((playerId: string, panelId: string) => {
    return state.playerPanelSettings[playerId]?.[panelId];
  }, [state.playerPanelSettings]);

  // WebRTC методы (новые в v1.1)
  const syncFromRemote = useCallback((remoteData: UISyncData) => {
    logger.info('[UIContext] Syncing from remote:', remoteData);
    dispatch({ type: 'SYNC_FROM_REMOTE', payload: remoteData });
  }, []);

  const getSyncData = useCallback((): UISyncData => {
    return {
      hyperscaleLayers: state.hyperscaleLayers,
      selectedHyperscaleLayerIds: state.selectedHyperscaleLayerIds,
      playerPanelSettings: state.playerPanelSettings,
      // НЕ включаем language (локальное)
    };
  }, [state.hyperscaleLayers, state.selectedHyperscaleLayerIds, state.playerPanelSettings]);

  // Context value с мемоизацией
  const value: UIContextValue = useMemo(() => ({
    // State
    ...state,

    // Language
    setLanguage,

    // Panel settings
    updatePanelSettings,
    removePanelSettings,

    // Hyperscale layers
    addHyperscaleLayer,
    updateHyperscaleLayer,
    removeHyperscaleLayer,

    // Layer selection
    toggleLayerSelection,
    setLayerSelection,
    selectAllLayers,
    deselectAllLayers,

    // Getters
    getSelectedLayers,
    getPanelSettings,

    // WebRTC методы
    syncFromRemote,
    getSyncData,
    onUIChange,
  }), [
    state,
    setLanguage,
    updatePanelSettings,
    removePanelSettings,
    addHyperscaleLayer,
    updateHyperscaleLayer,
    removeHyperscaleLayer,
    toggleLayerSelection,
    setLayerSelection,
    selectAllLayers,
    deselectAllLayers,
    getSelectedLayers,
    getPanelSettings,
    syncFromRemote,
    getSyncData,
    onUIChange,
  ]);

  return (
    <UIContext.Provider value={value}>
      {children}
    </UIContext.Provider>
  );
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Основной hook для использования UIContext
 */
export function useUIV1(): UIContextValue {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error('useUIV1 must be used within UIProviderV1');
  }
  return context;
}

// Optimized hooks для конкретных use cases

/**
 * Получить текущий язык
 */
export function useLanguageV1(): AppLanguage {
  const context = useUIV1();
  return context.language;
}

/**
 * Получить слои
 */
export function useHyperscaleLayersV1(): HyperscaleLayer[] {
  const context = useUIV1();
  return context.hyperscaleLayers;
}

/**
 * Получить выбранные слои
 */
export function useSelectedLayersV1(): HyperscaleLayer[] {
  const context = useUIV1();
  return context.getSelectedLayers();
}

/**
 * Получить и установить выбор слоев
 */
export function useLayerSelectionV1(): [string[], (layerIds: string[]) => void] {
  const context = useUIV1();
  return [context.selectedHyperscaleLayerIds, context.setLayerSelection];
}

// ============================================================================
// EXPORTS
// ============================================================================

export { UIContext };
export default UIProviderV1;