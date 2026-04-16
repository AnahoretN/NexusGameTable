/**
 * UIContext - Manages UI state and settings
 *
 * This context is responsible for:
 * - Application language
 * - Player panel settings
 * - Hyperscale layers configuration
 * - Layer selection and visibility
 *
 * Status: ✅ Implemented (Phase 4)
 */

import React, { createContext, useContext, useReducer, useCallback } from 'react';
import {
  UIContextValue,
  UIState,
  UIAction,
  initialUIState,
} from './contextTypes';
import { AppLanguage, HyperscaleLayer } from '../../types';

// ===== REDUCER =====

function uiReducer(state: UIState, action: UIAction): UIState {
  switch (action.type) {
    case 'SET_LANGUAGE':
      return {
        ...state,
        language: action.payload,
      };

    case 'UPDATE_PANEL_SETTINGS':
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
      return {
        ...state,
        hyperscaleLayers: [...state.hyperscaleLayers, action.payload],
      };

    case 'UPDATE_HYPERSCALE_LAYER':
      return {
        ...state,
        hyperscaleLayers: state.hyperscaleLayers.map(layer =>
          layer.id === action.payload.layerId
            ? { ...layer, ...action.payload.updates }
            : layer
        ),
      };

    case 'REMOVE_HYPERSCALE_LAYER':
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

    default:
      return state;
  }
}

// ===== CONTEXT =====

const UIContext = createContext<UIContextValue | null>(null);

// ===== PROVIDER =====

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(uiReducer, initialUIState);

  // Language actions
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

  const value: UIContextValue = {
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
  };

  return (
    <UIContext.Provider value={value}>
      {children}
    </UIContext.Provider>
  );
}

// ===== HOOKS =====

/**
 * useUI - Access UI context
 * Provides access to all UI state and actions
 */
export function useUI(): UIContextValue {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error('useUI must be used within UIProvider');
  }
  return context;
}

/**
 * useLanguage - Get current language
 * Optimized hook for language-only access
 */
export function useLanguage(): AppLanguage {
  const context = useUI();
  return context.language;
}

/**
 * useLanguageActions - Get language setter
 * Use this to avoid re-renders when you only need to set language
 */
export function useLanguageActions(): { setLanguage: (language: AppLanguage) => void } {
  const context = useUI();
  return { setLanguage: context.setLanguage };
}

/**
 * useHyperscaleLayers - Get all hyperscale layers
 * Optimized hook for layers-only access
 */
export function useHyperscaleLayers(): HyperscaleLayer[] {
  const context = useUI();
  return context.hyperscaleLayers;
}

/**
 * useSelectedLayers - Get selected layers
 * Returns filtered array of selected layers
 */
export function useSelectedLayers(): HyperscaleLayer[] {
  const context = useUI();
  return context.getSelectedLayers();
}

/**
 * useLayerSelection - Get layer selection state and setter
 * Returns tuple: [selectedIds, setSelectedIds]
 */
export function useLayerSelection(): [string[], (layerIds: string[]) => void] {
  const context = useUI();
  return [context.selectedHyperscaleLayerIds, context.setLayerSelection];
}

/**
 * useLayerActions - Get layer manipulation actions
 * Use this to avoid re-renders when you only need layer actions
 */
export function useLayerActions(): {
  toggleLayerSelection: (layerId: string) => void;
  setLayerSelection: (layerIds: string[]) => void;
  selectAllLayers: () => void;
  deselectAllLayers: () => void;
  addHyperscaleLayer: (layer: HyperscaleLayer) => void;
  updateHyperscaleLayer: (layerId: string, updates: Partial<HyperscaleLayer>) => void;
  removeHyperscaleLayer: (layerId: string) => void;
} {
  const context = useUI();
  return {
    toggleLayerSelection: context.toggleLayerSelection,
    setLayerSelection: context.setLayerSelection,
    selectAllLayers: context.selectAllLayers,
    deselectAllLayers: context.deselectAllLayers,
    addHyperscaleLayer: context.addHyperscaleLayer,
    updateHyperscaleLayer: context.updateHyperscaleLayer,
    removeHyperscaleLayer: context.removeHyperscaleLayer,
  };
}

/**
 * usePanelSettings - Get panel settings for a specific player
 * @param playerId - Player ID to get settings for
 */
export function usePanelSettings(playerId: string): <T = any>(panelId: string) => T | undefined {
  const context = useUI();
  return useCallback((panelId: string) => {
    return context.getPanelSettings(playerId, panelId);
  }, [context, playerId]);
}

/**
 * usePanelSettingsActions - Get panel settings actions
 * Use this to avoid re-renders when you only need panel settings actions
 */
export function usePanelSettingsActions(): {
  updatePanelSettings: (playerId: string, panelId: string, settings: any) => void;
  removePanelSettings: (playerId: string, panelId: string) => void;
} {
  const context = useUI();
  return {
    updatePanelSettings: context.updatePanelSettings,
    removePanelSettings: context.removePanelSettings,
  };
}