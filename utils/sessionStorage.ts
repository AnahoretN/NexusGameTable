/**
 * Simplified session save/load system
 * Saves and loads complete game state as JSON with validation for security
 */

import { logger } from './logger';
import { TableObject, ItemType } from '../types';
import { GameState } from '../store/gameState';

// ============================================================
// TYPES AND INTERFACES
// ============================================================

export interface SaveFileData {
  version: string;
  timestamp: number;
  state: GameState;
}

// ============================================================
// SECURITY: WHITELIST OF ALLOWED KEYS AND VALUES
// ============================================================

/**
 * Allowed top-level keys in game state
 * This prevents loading malicious data in unexpected fields
 */
const ALLOWED_STATE_KEYS = new Set([
  'objects',
  'players',
  'activePlayerId',
  'diceRolls',
  'viewTransform',
  'sessionId',
  'version',
  'drawings',
  'undo',
  'playerPermissions',
  'language',
  'hyperscaleLayers',
  'selectedHyperscaleLayerIds',
  'connectionsLocked',
  'diceGroups',
  'lastModifiedBy',
  'playerPanelSettings',
  'auditLog',
]);

/**
 * Allowed object types - extra validation layer
 */
const ALLOWED_OBJECT_TYPES = new Set([
  'TOKEN',
  'TOKEN_TYPE',
  'CARD',
  'DECK',
  'DICE_OBJECT',
  'COUNTER',
  'BOARD',
  'RANDOMIZER',
  'PANEL',
  'WINDOW',
  'DRAWING',
  'EFFECT_TEMPLATE',
  'NOTE',
  'CHARACTER_BLOCK',
]);

/**
 * Keys that are never allowed from save files
 * (prevents code injection via __proto__, constructor, etc.)
 */
const FORBIDDEN_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'eval',
  'function',
  'script',
]);

// ============================================================
// VALIDATION FUNCTIONS
// ============================================================

/**
 * Check if a key is forbidden
 */
function isForbiddenKey(key: string): boolean {
  return FORBIDDEN_KEYS.has(key);
}

/**
 * Validate and sanitize a single value recursively
 * Returns sanitized value or throws error if invalid
 */
function sanitizeValue(value: any, path: string = 'root'): any {
  // Primitives are safe
  if (value === null || value === undefined) {
    return value;
  }

  switch (typeof value) {
    case 'string':
    case 'number':
    case 'boolean':
      return value;

    case 'object':
      if (Array.isArray(value)) {
        // Sanitize array elements
        return value.map((item, index) => sanitizeValue(item, `${path}[${index}]`));
      }

      // Sanitize object keys and values
      const result: any = {};
      for (const [key, val] of Object.entries(value)) {
        // Check for forbidden keys
        if (isForbiddenKey(key)) {
          logger.warn(`[SAVE_LOAD] Forbidden key "${key}" at ${path}, skipping`);
          continue;
        }

        // Recursively sanitize nested values
        result[key] = sanitizeValue(val, `${path}.${key}`);
      }
      return result;

    default:
      throw new Error(`Invalid type ${typeof value} at ${path}`);
  }
}

/**
 * Validate the structure of loaded save data
 * Returns true if valid, throws error if invalid
 */
function validateSaveData(data: any): data is SaveFileData {
  // Must be an object
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid save file: not an object');
  }

  // Must have version
  if (typeof data.version !== 'string') {
    throw new Error('Invalid save file: missing or invalid version');
  }

  // Must have timestamp
  if (typeof data.timestamp !== 'number') {
    throw new Error('Invalid save file: missing or invalid timestamp');
  }

  // Must have state
  if (!data.state || typeof data.state !== 'object') {
    throw new Error('Invalid save file: missing or invalid state');
  }

  // Validate state keys (only allow known keys)
  for (const key of Object.keys(data.state)) {
    if (!ALLOWED_STATE_KEYS.has(key)) {
      logger.warn(`[SAVE_LOAD] Unknown state key "${key}", skipping`);
      delete data.state[key];
    }
  }

  // Validate objects if present
  if (data.state.objects) {
    if (typeof data.state.objects !== 'object') {
      throw new Error('Invalid save file: objects must be an object');
    }

    for (const [objId, obj] of Object.entries(data.state.objects)) {
      if (!obj || typeof obj !== 'object') {
        throw new Error(`Invalid object ${objId}: not an object`);
      }

      // Validate object type if present
      if (obj.type && !ALLOWED_OBJECT_TYPES.has(obj.type as string)) {
        logger.warn(`[SAVE_LOAD] Unknown object type "${obj.type}" in ${objId}`);
      }
    }
  }

  // Validate players if present
  if (data.state.players) {
    if (!Array.isArray(data.state.players)) {
      throw new Error('Invalid save file: players must be an array');
    }
  }

  return true;
}

// ============================================================
// SAVE FUNCTION
// ============================================================

/**
 * Save current game state to a JSON file
 * @param state - Current game state from context
 * @returns Downloaded file trigger
 */
export async function saveSession(state: GameState): Promise<void> {
  try {
    logger.log('[SAVE_LOAD] Starting session save...');

    // Create save file structure
    const saveData: SaveFileData = {
      version: '1.0.0',
      timestamp: Date.now(),
      state: { ...state },
    };

    // Convert to JSON
    const jsonString = JSON.stringify(saveData, null, 2);

    // Create download
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nexus_session_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    logger.log('[SAVE_LOAD] Session saved successfully');
  } catch (error) {
    logger.error('[SAVE_LOAD] Error saving session:', error);
    throw error;
  }
}

// ============================================================
// LOAD FUNCTION
// ============================================================

/**
 * Load a game state from a JSON file
 * Supports both new format ({version, timestamp, state}) and old format (direct state)
 * @param file - File object from file input
 * @returns Parsed and validated game state
 * @throws Error if validation fails
 */
export async function loadSession(file: File): Promise<GameState> {
  try {
    logger.log('[SAVE_LOAD] Starting session load...');

    // Read file
    const text = await file.text();

    // Parse JSON
    let rawData: any;
    try {
      rawData = JSON.parse(text);
    } catch (parseError) {
      throw new Error('Invalid save file: not valid JSON');
    }

    // Check if this is new format or old format
    let stateToLoad: any;

    if (rawData.version && rawData.state && typeof rawData.state === 'object') {
      // New format: { version, timestamp, state }
      logger.log('[SAVE_LOAD] Loading new format save file');
      validateSaveData(rawData);
      stateToLoad = rawData.state;
    } else if (rawData.objects && rawData.players) {
      // Old format: direct state (backward compatibility)
      logger.log('[SAVE_LOAD] Loading old format save file (backward compatibility)');
      stateToLoad = rawData;
    } else {
      throw new Error('Invalid save file: unrecognized format');
    }

    // Sanitize all values to prevent code injection
    const sanitizedState = sanitizeValue(stateToLoad);

    // Validate state keys (only allow known keys)
    for (const key of Object.keys(sanitizedState)) {
      if (!ALLOWED_STATE_KEYS.has(key)) {
        logger.warn(`[SAVE_LOAD] Unknown state key "${key}", skipping`);
        delete sanitizedState[key];
      }
    }

    logger.log('[SAVE_LOAD] Session loaded and validated successfully');
    if (rawData.version) {
      logger.log(`[SAVE_LOAD] Save version: ${rawData.version}`);
      logger.log(`[SAVE_LOAD] Save date: ${new Date(rawData.timestamp).toLocaleString()}`);
    }
    logger.log(`[SAVE_LOAD] Objects: ${Object.keys(sanitizedState.objects || {}).length}`);
    logger.log(`[SAVE_LOAD] Players: ${sanitizedState.players?.length || 0}`);

    return sanitizedState;
  } catch (error) {
    logger.error('[SAVE_LOAD] Error loading session:', error);
    throw error;
  }
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Get save file info without loading the full state
 * @param file - File object from file input
 * @returns Metadata about the save file
 */
export async function getSaveFileInfo(file: File): Promise<{
  version: string;
  timestamp: number;
  date: string;
  objectCount: number;
  playerCount: number;
}> {
  const text = await file.text();
  const data = JSON.parse(text) as SaveFileData;

  return {
    version: data.version,
    timestamp: data.timestamp,
    date: new Date(data.timestamp).toLocaleString(),
    objectCount: Object.keys(data.state.objects || {}).length,
    playerCount: data.state.players?.length || 0,
  };
}
