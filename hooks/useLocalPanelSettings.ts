import { useState, useEffect, useCallback } from 'react';
import { PanelObject, LocalPanelSettings } from '../types';
import {
  getLocalPanelSettings,
  updateLocalPanelSettings,
  removeLocalPanelSettings
} from '../utils/localSettings';

/**
 * Hook for managing local panel settings
 * Provides access to local panel settings that override global settings
 */
export const useLocalPanelSettings = (panel: PanelObject) => {
  const [localSettings, setLocalSettings] = useState<LocalPanelSettings | null>(() =>
    getLocalPanelSettings(panel.id)
  );

  // Refresh local settings from localStorage
  const refreshSettings = useCallback(() => {
    setLocalSettings(getLocalPanelSettings(panel.id));
  }, [panel.id]);

  // Update local settings
  const updateSettings = useCallback((updates: Partial<LocalPanelSettings>) => {
    updateLocalPanelSettings(panel.id, updates);
    setLocalSettings(prev => ({
      ...prev,
      ...updates
    } as LocalPanelSettings));
  }, [panel.id]);

  // Remove local settings (revert to global)
  const clearSettings = useCallback(() => {
    removeLocalPanelSettings(panel.id);
    setLocalSettings(null);
  }, [panel.id]);

  // Get effective panel properties (local if exists, otherwise global)
  const getEffectiveProps = useCallback(() => {
    if (!localSettings) {
      // Return global panel properties
      return {
        x: panel.x,
        y: panel.y,
        width: panel.width,
        height: panel.height,
        minimized: panel.minimized || false,
        isPinnedToViewport: panel.isPinnedToViewport || false,
        pinnedScreenPosition: panel.pinnedScreenPosition,
        expandedState: panel.expandedState,
        collapsedState: panel.collapsedState,
        expandedPinnedPosition: panel.expandedPinnedPosition,
        collapsedPinnedPosition: panel.collapsedPinnedPosition,
      };
    }

    // Return local settings (with fallback to global for missing properties)
    return {
      x: localSettings.x !== undefined ? localSettings.x : panel.x,
      y: localSettings.y !== undefined ? localSettings.y : panel.y,
      width: localSettings.width !== undefined ? localSettings.width : panel.width,
      height: localSettings.height !== undefined ? localSettings.height : panel.height,
      minimized: localSettings.minimized !== undefined ? localSettings.minimized : (panel.minimized || false),
      isPinnedToViewport: localSettings.isPinnedToViewport !== undefined ? localSettings.isPinnedToViewport : (panel.isPinnedToViewport || false),
      pinnedScreenPosition: localSettings.pinnedScreenPosition || panel.pinnedScreenPosition,
      expandedState: localSettings.expandedState || panel.expandedState,
      collapsedState: localSettings.collapsedState || panel.collapsedState,
      expandedPinnedPosition: localSettings.expandedPinnedPosition || panel.expandedPinnedPosition,
      collapsedPinnedPosition: localSettings.collapsedPinnedPosition || panel.collapsedPinnedPosition,
    };
  }, [localSettings, panel]);

  // Check if panel has local settings
  const hasLocalSettings = localSettings !== null;

  return {
    localSettings,
    updateSettings,
    clearSettings,
    getEffectiveProps,
    hasLocalSettings,
    refreshSettings
  };
};
