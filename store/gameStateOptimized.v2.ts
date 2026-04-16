/**
 * GameState v2.0 - Optimized state without duplicated fields
 *
 * @version 2.0.0
 * @since 2026-04-17
 *
 * ИЗМЕНЕНИЯ с v1.0:
 * ✅ Убраны дублирующиеся поля (перенесены в соответствующие контексты):
 * - players: Player[] → PlayerContext
 * - activePlayerId: string → PlayerContext
 * - playerPermissions: PlayerPermissions → PlayerContext
 * - viewTransform: ViewTransform → ViewTransformContext (локальное)
 * - language: AppLanguage → UIContext (локальное)
 * - playerPanelSettings: PlayerPanelSettings → UIContext
 * - hyperscaleLayers: HyperscaleLayer[] → UIContext
 * - selectedHyperscaleLayerIds: string[] → UIContext
 *
 * ✅ Оставлены только игровые объекты:
 * - objects: Record<string, TableObject>
 * - diceRolls: DiceRoll[]
 * - drawings: DrawingData
 * - undo: UndoState
 * - connectionsLocked: boolean
 * - diceGroups: DiceGroup[]
 * - sessionId: string
 * - lastModifiedBy?: string
 */

import { TableObject, DiceRoll, DrawingData, UndoState, DiceGroup } from '../types';

// ============================================================================
// OPTIMIZED GAME STATE
// ============================================================================

/**
 * GameState v2.0 - Только игровые объекты
 *
 * Это состояние содержит ТОЛЬКО данные, которые относятся к игровым объектам
 * и должны синхронизироваться через WebRTC.
 */
export interface GameState {
  // Игровые объекты (ОСНОВНАЯ ЧАСТЬ)
  objects: Record<string, TableObject>;

  // Игровые механики
  diceRolls: DiceRoll[];
  drawings: DrawingData;
  undo: UndoState;

  // Настройки игры
  connectionsLocked: boolean;
  diceGroups: DiceGroup[];

  // Метаданные сессии
  sessionId: string;
  lastModifiedBy?: string;

  // Внутренние поля (не синхронизируются)
  _lastPanelSettingsUpdate?: number;
  _pendingPanelSettings?: Record<string, Record<string, any>>;
}

// ============================================================================
// INITIAL STATE
// ============================================================================

/**
 * Начальное состояние для GameState v2.0
 */
export const initialGameState: GameState = {
  objects: {},
  diceRolls: [],
  drawings: {
    layers: [],
  },
  undo: {
    past: [],
    future: [],
  },
  connectionsLocked: false,
  diceGroups: [],
  sessionId: '',
  lastModifiedBy: undefined,
  _lastPanelSettingsUpdate: undefined,
  _pendingPanelSettings: undefined,
};

// ============================================================================
// MIGRATION HELPERS
// ============================================================================

/**
 * Мигрировать старый GameState (v1.0) в новый (v2.0)
 *
 * @param oldState - Старое состояние с дублирующимися полями
 * @returns Новое оптимизированное состояние
 */
export function migrateGameStateV1ToV2(oldState: any): GameState {
  return {
    // Игровые объекты
    objects: oldState.objects || {},
    diceRolls: oldState.diceRolls || [],
    drawings: oldState.drawings || { layers: [] },
    undo: oldState.undo || { past: [], future: [] },
    connectionsLocked: oldState.connectionsLocked || false,
    diceGroups: oldState.diceGroups || [],

    // Метаданные
    sessionId: oldState.sessionId || '',
    lastModifiedBy: oldState.lastModifiedBy,

    // Внутренние поля
    _lastPanelSettingsUpdate: oldState._lastPanelSettingsUpdate,
    _pendingPanelSettings: oldState._pendingPanelSettings,

    // УБРАНЫ (перенесены в контексты):
    // - players, activePlayerId, playerPermissions → PlayerContext
    // - viewTransform → ViewTransformContext
    // - language, playerPanelSettings, hyperscaleLayers, selectedHyperscaleLayerIds → UIContext
  };
}

/**
 * Валидация GameState v2.0
 *
 * @param state - Состояние для валидации
 * @returns true если состояние валидно
 */
export function validateGameState(state: any): state is GameState {
  if (!state || typeof state !== 'object') {
    return false;
  }

  // Обязательные поля
  const requiredFields = ['objects', 'diceRolls', 'drawings', 'undo', 'connectionsLocked', 'diceGroups', 'sessionId'];
  for (const field of requiredFields) {
    if (!(field in state)) {
      console.error(`[GameState] Missing required field: ${field}`);
      return false;
    }
  }

  // Проверяем, что отсутствуют исключенные поля
  const excludedFields = [
    'players',
    'activePlayerId',
    'playerPermissions',
    'viewTransform',
    'language',
    'playerPanelSettings',
    'hyperscaleLayers',
    'selectedHyperscaleLayerIds'
  ];

  for (const field of excludedFields) {
    if (field in state) {
      console.warn(`[GameState] Field ${field} should not be in GameState v2.0 (moved to context)`);
    }
  }

  return true;
}

/**
 * Получить статистику GameState
 */
export function getGameStateStats(state: GameState) {
  return {
    objects: Object.keys(state.objects).length,
    visibleObjects: Object.values(state.objects).filter(obj => obj.isOnTable !== false).length,
    diceRolls: state.diceRolls.length,
    drawingLayers: state.drawings.layers?.length || 0,
    undoSteps: state.undo.past.length,
    redoSteps: state.undo.future.length,
    diceGroups: state.diceGroups.length,
    connectionsLocked: state.connectionsLocked,
    sessionId: state.sessionId,
    lastModifiedBy: state.lastModifiedBy,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default initialGameState;