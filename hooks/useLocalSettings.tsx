import React, { createContext, useContext, useState, useEffect } from 'react';
import { LocalSettings, loadLocalSettings, saveLocalSettings } from '../utils/localSettings';

// Context for Local Settings
const LocalSettingsContext = createContext<{
  settings: LocalSettings;
  updateSetting: <K extends keyof LocalSettings>(key: K, value: LocalSettings[K]) => void;
  updateEffectSetting: <K extends keyof LocalSettings['effects']>(key: K, value: LocalSettings['effects'][K]) => void;
} | undefined>(undefined);

/**
 * Provider component for Local Settings
 */
export const LocalSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<LocalSettings>(() => loadLocalSettings());

  // Update a specific setting
  const updateSetting = <K extends keyof LocalSettings>(
    key: K,
    value: LocalSettings[K]
  ) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    saveLocalSettings(newSettings);
  };

  // Update a nested effect setting
  const updateEffectSetting = <K extends keyof LocalSettings['effects']>(
    key: K,
    value: LocalSettings['effects'][K]
  ) => {
    const newSettings = {
      ...settings,
      effects: {
        ...settings.effects,
        [key]: value,
      },
    };
    setSettings(newSettings);
    saveLocalSettings(newSettings);
  };

  const value = {
    settings,
    updateSetting,
    updateEffectSetting,
  };

  return (
    <LocalSettingsContext.Provider value={value}>
      {children}
    </LocalSettingsContext.Provider>
  );
};

/**
 * Hook to manage local settings (stored in localStorage, not synced via WebRTC)
 */
export function useLocalSettings() {
  const context = useContext(LocalSettingsContext);
  if (!context) {
    throw new Error('useLocalSettings must be used within a LocalSettingsProvider');
  }
  return context;
}
