import { useState, useEffect } from 'react';
import { LocalSettings, loadLocalSettings, saveLocalSettings } from '../utils/localSettings';

/**
 * Hook to manage local settings (stored in localStorage, not synced via WebRTC)
 */
export function useLocalSettings() {
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

  return {
    settings,
    updateSetting,
    updateEffectSetting,
  };
}
