import { useState, useEffect, createContext, useContext, useRef, useMemo, useCallback } from 'react';
import { LocalSettings, loadLocalSettings, saveLocalSettings } from '../utils/localSettings';

const LOCAL_SETTINGS_EVENT = 'local-settings-changed';

interface LocalSettingsContextValue {
  settings: LocalSettings;
  updateSetting(key: keyof LocalSettings, value: any): void;
  updateEffectSetting(key: keyof LocalSettings['effects'], value: any): void;
}

const LocalSettingsContext = createContext<LocalSettingsContextValue | null>(null);

export function LocalSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<LocalSettings>(() => loadLocalSettings());
  const settingsRef = useRef(settings);

  // Keep ref in sync with settings
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'nexus-local-settings' && e.newValue) {
        try {
          const newSettings = JSON.parse(e.newValue);
          setSettings(newSettings);
        } catch (err) {
          console.error('Failed to parse settings from storage event:', err);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Stable update functions that always use current settings from ref
  const updateSetting = useCallback((key: keyof LocalSettings, value: any) => {
    const currentSettings = settingsRef.current;
    const newSettings = { ...currentSettings, [key]: value };
    setSettings(newSettings);
    saveLocalSettings(newSettings);
  }, []);

  const updateEffectSetting = useCallback((key: keyof LocalSettings['effects'], value: any) => {
    const currentSettings = settingsRef.current;
    const newSettings = {
      ...currentSettings,
      effects: { ...currentSettings.effects, [key]: value },
    };
    setSettings(newSettings);
    saveLocalSettings(newSettings);
  }, []);

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo<LocalSettingsContextValue>(
    () => ({ settings, updateSetting, updateEffectSetting }),
    [settings, updateSetting, updateEffectSetting]
  );

  return (
    <LocalSettingsContext.Provider value={contextValue}>
      {children}
    </LocalSettingsContext.Provider>
  );
}

export function useLocalSettings() {
  const context = useContext(LocalSettingsContext);

  if (context) {
    return context;
  }

  const [settings, setSettings] = useState<LocalSettings>(() => loadLocalSettings());
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const updateSetting = useCallback((key: keyof LocalSettings, value: any) => {
    const currentSettings = settingsRef.current;
    const newSettings = { ...currentSettings, [key]: value };
    setSettings(newSettings);
    saveLocalSettings(newSettings);
    window.dispatchEvent(new CustomEvent(LOCAL_SETTINGS_EVENT, { detail: newSettings }));
  }, []);

  const updateEffectSetting = useCallback((key: keyof LocalSettings['effects'], value: any) => {
    const currentSettings = settingsRef.current;
    const newSettings = {
      ...currentSettings,
      effects: { ...currentSettings.effects, [key]: value },
    };
    setSettings(newSettings);
    saveLocalSettings(newSettings);
    window.dispatchEvent(new CustomEvent(LOCAL_SETTINGS_EVENT, { detail: newSettings }));
  }, []);

  return { settings, updateSetting, updateEffectSetting };
}
