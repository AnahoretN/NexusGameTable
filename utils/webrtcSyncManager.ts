/**
 * WebRTC Sync Manager - Управление синхронизацией между контекстами
 *
 * Этот модуль обеспечивает синхронизацию данных между разными контекстами
 * в новой архитектуре независимых контекстов.
 *
 * @version 2.0.0
 * @since 2026-04-17
 */

import { logger } from './logger';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Структура данных для WebRTC синхронизации
 */
export interface WebRTCSyncData {
  version: string; // Версия протокола синхронизации
  timestamp: number; // Время создания данных

  // GameContext данные (игровые объекты)
  game: GameSyncData;

  // PlayerContext данные (игроки)
  players: PlayerSyncData;

  // UIContext данные (интерфейс)
  ui: UISyncData;
}

/**
 * Игровые данные для синхронизации
 */
export interface GameSyncData {
  objects: Record<string, any>;
  diceRolls: any[];
  drawings: any;
  undo: any;
  connectionsLocked: boolean;
  diceGroups: any[];
  sessionId: string;
  lastModifiedBy?: string;
}

/**
 * Player данные для синхронизации
 */
export interface PlayerSyncData {
  players: any[];
  activePlayerId: string;
  playerPermissions: any;
}

/**
 * UI данные для синхронизации (только общие для всех игроков)
 */
export interface UISyncData {
  hyperscaleLayers: any[];
  selectedHyperscaleLayerIds: string[];
  playerPanelSettings: Record<string, any>;
}

/**
 * Распределенные данные для применения в контекстах
 */
export interface DistributedSyncData {
  game: Partial<GameSyncData>;
  players: PlayerSyncData;
  ui: Partial<UISyncData>;
}

// ============================================================================
// WEBRTC SYNC MANAGER
// ============================================================================

export class WebRTCSyncManager {
  private static readonly VERSION = '0.1.9';

  /**
   * Собрать данные из всех контекстов для синхронизации
   *
   * @param gameState - Текущее состояние GameContext
   * @param playerState - Текущее состояние PlayerContext
   * @param uiState - Текущее состояние UIContext
   * @returns Данные для WebRTC синхронизации
   */
  static collectSyncData(
    gameState: any,
    playerState: any,
    uiState: any
  ): WebRTCSyncData {
    try {
      const syncData: WebRTCSyncData = {
        version: this.VERSION,
        timestamp: Date.now(),
        game: this.extractGameData(gameState),
        players: this.extractPlayerData(playerState),
        ui: this.extractUIData(uiState),
      };

      logger.debug('[WebRTCSyncManager] Collected sync data:', {
        gameObjects: Object.keys(syncData.game.objects).length,
        players: syncData.players.players.length,
        uiLayers: syncData.ui.hyperscaleLayers.length,
        dataSize: JSON.stringify(syncData).length
      });

      return syncData;
    } catch (error) {
      logger.error('[WebRTCSyncManager] Error collecting sync data:', error);
      throw error;
    }
  }

  /**
   * Извлечь только игровые данные для синхронизации
   *
   * ИСКЛЮЧАЕТ:
   * - players, activePlayerId, playerPermissions (→ PlayerContext)
   * - viewTransform (локальное состояние)
   * - language, playerPanelSettings, hyperscaleLayers, selectedHyperscaleLayerIds (→ UIContext)
   */
  private static extractGameData(state: any): GameSyncData {
    const {
      objects,
      diceRolls,
      drawings,
      undo,
      connectionsLocked,
      diceGroups,
      sessionId,
      lastModifiedBy
    } = state;

    return {
      objects: objects || {},
      diceRolls: diceRolls || [],
      drawings: drawings || {},
      undo: undo || { past: [], future: [] },
      connectionsLocked: connectionsLocked || false,
      diceGroups: diceGroups || [],
      sessionId: sessionId || '',
      lastModifiedBy: lastModifiedBy
    };
  }

  /**
   * Извлечь player данные для синхронизации
   */
  private static extractPlayerData(state: any): PlayerSyncData {
    const { players, activePlayerId, playerPermissions } = state;

    return {
      players: players || [],
      activePlayerId: activePlayerId || 'gm',
      playerPermissions: playerPermissions || {
        createObjects: false,
        configureObjects: false,
        deleteObjects: false,
        hideObjects: false
      }
    };
  }

  /**
   * Извлечь UI данные для синхронизации (только общие для всех игроков)
   *
   * ИСКЛЮЧАЕТ:
   * - language (локальная настройка каждого игрока)
   *
   * ВКЛЮЧАЕТ:
   * - hyperscaleLayers (общие для всех)
   * - selectedHyperscaleLayerIds (общие для всех)
   * - playerPanelSettings (синхронизируются между игроками)
   */
  private static extractUIData(state: any): UISyncData {
    const {
      hyperscaleLayers,
      selectedHyperscaleLayerIds,
      playerPanelSettings
    } = state;

    return {
      hyperscaleLayers: hyperscaleLayers || [],
      selectedHyperscaleLayerIds: selectedHyperscaleLayerIds || [],
      playerPanelSettings: playerPanelSettings || {}
    };
  }

  /**
   * Распределить полученные данные по контекстам
   *
   * @param data - Полученные через WebRTC данные
   * @returns Распределенные данные для каждого контекста
   */
  static distributeSyncData(data: WebRTCSyncData): DistributedSyncData {
    try {
      // Валидация версии
      if (data.version !== this.VERSION) {
        logger.warn(
          `[WebRTCSyncManager] Version mismatch: expected ${this.VERSION}, got ${data.version}`
        );
      }

      const distributed: DistributedSyncData = {
        game: data.game,
        players: data.players,
        ui: data.ui
      };

      logger.debug('[WebRTCSyncManager] Distributed sync data:', {
        gameObjects: Object.keys(distributed.game.objects || {}).length,
        players: distributed.players.players.length,
        uiLayers: distributed.ui.hyperscaleLayers?.length || 0
      });

      return distributed;
    } catch (error) {
      logger.error('[WebRTCSyncManager] Error distributing sync data:', error);
      throw error;
    }
  }

  /**
   * Создать differential sync (инкрементальные обновления)
   *
   * Используется для оптимизации WebRTC трафика -
   * отправляет только изменения, а не полное состояние
   *
   * @param baseState - Базовое состояние
   * @param currentState - Текущее состояние
   * @returns Differential sync данные
   */
  static createDifferentialSync(
    baseState: WebRTCSyncData,
    currentState: WebRTCSyncData
  ): Partial<WebRTCSyncData> {
    const changes: Partial<WebRTCSyncData> = {
      version: this.VERSION,
      timestamp: Date.now()
    };

    // Проверяем изменения в game данных
    if (!this.deepEqual(baseState.game, currentState.game)) {
      changes.game = currentState.game;
    }

    // Проверяем изменения в player данных
    if (!this.deepEqual(baseState.players, currentState.players)) {
      changes.players = currentState.players;
    }

    // Проверяем изменения в UI данных
    if (!this.deepEqual(baseState.ui, currentState.ui)) {
      changes.ui = currentState.ui;
    }

    logger.debug('[WebRTCSyncManager] Created differential sync:', {
      hasGameChanges: !!changes.game,
      hasPlayerChanges: !!changes.players,
      hasUIChanges: !!changes.ui,
      totalChanges: Object.keys(changes).length - 2 // -2 for version and timestamp
    });

    return changes;
  }

  /**
   * Применить differential sync к текущему состоянию
   *
   * @param currentState - Текущее состояние
   * @param differentialChanges - Инкрементальные изменения
   * @returns Обновленное состояние
   */
  static applyDifferentialSync(
    currentState: WebRTCSyncData,
    differentialChanges: Partial<WebRTCSyncData>
  ): WebRTCSyncData {
    const updated: WebRTCSyncData = {
      ...currentState,
      timestamp: differentialChanges.timestamp || Date.now()
    };

    if (differentialChanges.game) {
      updated.game = { ...currentState.game, ...differentialChanges.game };
    }

    if (differentialChanges.players) {
      updated.players = { ...currentState.players, ...differentialChanges.players };
    }

    if (differentialChanges.ui) {
      updated.ui = { ...currentState.ui, ...differentialChanges.ui };
    }

    logger.debug('[WebRTCSyncManager] Applied differential sync');

    return updated;
  }

  /**
   * Глубокое сравнение двух объектов
   */
  private static deepEqual(obj1: any, obj2: any): boolean {
    if (obj1 === obj2) return true;

    if (typeof obj1 !== 'object' || typeof obj2 !== 'object') {
      return false;
    }

    if (obj1 === null || obj2 === null) {
      return false;
    }

    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) {
      return false;
    }

    for (const key of keys1) {
      if (!keys2.includes(key)) {
        return false;
      }

      if (!this.deepEqual(obj1[key], obj2[key])) {
        return false;
      }
    }

    return true;
  }

  /**
   * Валидация структуры sync данных
   */
  static validateSyncData(data: any): data is WebRTCSyncData {
    if (!data || typeof data !== 'object') {
      return false;
    }

    const requiredFields = ['version', 'timestamp', 'game', 'players', 'ui'];
    for (const field of requiredFields) {
      if (!(field in data)) {
        logger.error(`[WebRTCSyncManager] Missing required field: ${field}`);
        return false;
      }
    }

    return true;
  }

  /**
   * Получить статистику sync данных
   */
  static getSyncDataStats(data: WebRTCSyncData) {
    const jsonString = JSON.stringify(data);
    const size = jsonString.length;

    return {
      version: data.version,
      timestamp: data.timestamp,
      size: {
        bytes: size,
        kb: (size / 1024).toFixed(2),
        mb: (size / 1024 / 1024).toFixed(2)
      },
      content: {
        gameObjects: Object.keys(data.game.objects || {}).length,
        players: data.players.players.length,
        diceRolls: data.game.diceRolls?.length || 0,
        uiLayers: data.ui.hyperscaleLayers?.length || 0
      }
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default WebRTCSyncManager;