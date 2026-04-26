/**
 * Universal Settings Opener Utility
 * Provides memoized function for opening object settings modal
 */

import { TableObject, ItemType } from '../types';

// Memoization cache to prevent duplicate calls
const settingsOpenerCache = new Map<string, { timestamp: number; object: TableObject }>();
const SETTINGS_OPENER_TTL = 200; // 200ms TTL to prevent duplicate opens

/**
 * Open object settings with memoization to prevent duplicate calls
 * @param object - The table object to open settings for
 * @param setSettingsModalObj - Function to set the settings modal object
 * @param openSettingsModal - Function to open the settings modal
 * @returns true if settings were opened, false if cached (duplicate call)
 */
export function openObjectSettings(
  object: TableObject,
  setSettingsModalObj: (obj: TableObject) => void,
  openSettingsModal: () => void
): boolean {
  // Token-copies don't have individual settings
  if (object.type === ItemType.TOKEN && (object as any).archetypeId) {
    return false;
  }

  // Check memo cache to prevent duplicate opens within TTL
  const now = Date.now();
  const cached = settingsOpenerCache.get(object.id);
  if (cached && now - cached.timestamp < SETTINGS_OPENER_TTL) {
    return false; // Skip duplicate open
  }

  // Update cache
  settingsOpenerCache.set(object.id, { timestamp: now, object });

  // Open settings
  setSettingsModalObj(object);
  openSettingsModal();

  // Clean up old cache entries periodically
  if (settingsOpenerCache.size > 100) {
    for (const [key, value] of settingsOpenerCache.entries()) {
      if (now - value.timestamp > SETTINGS_OPENER_TTL * 10) {
        settingsOpenerCache.delete(key);
      }
    }
  }

  return true;
}

/**
 * Clear memoization cache (useful for testing or manual reset)
 */
export function clearSettingsOpenerCache() {
  settingsOpenerCache.clear();
}
