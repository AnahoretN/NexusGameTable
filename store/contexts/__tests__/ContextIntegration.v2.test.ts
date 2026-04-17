/**
 * Integration Tests for Context Architecture
 * @version 1.0.0
 */

import { renderHook, act } from '@testing-library/react';
import { WebRTCSyncManager } from '../../utils/webrtcSyncManager';

// Mock провайдеры для тестов
function createTestProviders() {
  return ({ children }: { children: React.ReactNode }) => {
    // Здесь будут реальные провайдеры из нашей миграции
    return <>{children}</>;
  };
}

describe('Context Integration Tests', () => {

  describe('WebRTC Integration', () => {

    test('полная синхронизация host → guest через WebRTCSyncManager', () => {
      // Arrange
      const hostState = {
        game: {
          objects: { obj1: { id: 'obj1', type: 'token', x: 100, y: 100 } },
          diceRolls: [],
          drawings: { layers: [] },
          undo: { past: [], future: [] },
          connectionsLocked: false,
          diceGroups: [],
          sessionId: 'host-session'
        },
        players: {
          players: [
            { id: 'host', name: 'Host', color: '#FF0000', isGM: true }
          ],
          activePlayerId: 'host',
          playerPermissions: {
            createObjects: true,
            configureObjects: true,
            deleteObjects: true,
            hideObjects: true
          }
        },
        ui: {
          hyperscaleLayers: [
            { id: 'boards', name: 'Boards', minZIndex: 1, maxZIndex: 1000, color: '#3b82f6' }
          ],
          selectedHyperscaleLayerIds: ['boards'],
          playerPanelSettings: {}
        }
      };

      // Act
      const syncData = WebRTCSyncManager.collectSyncData(
        hostState.game,
        hostState.players,
        hostState.ui
      );

      // Assert
      expect(syncData.version).toBe('0.1.9');
      expect(syncData.game).toBeDefined();
      expect(syncData.players).toBeDefined();
      expect(syncData.ui).toBeDefined();
      expect(syncData.game.objects).toHaveProperty('obj1');
      expect(syncData.players.players).toHaveLength(1);
      expect(syncData.ui.hyperscaleLayers).toHaveLength(1);
    });

    test('сохранение локальных настроек при синхронизации', () => {
      // Arrange
      const guestLocalSettings = {
        language: 'ru', // Локальная настройка
        viewTransform: { offset: { x: 50, y: 50 }, zoom: 2.0 } // Локальная настройка
      };

      const hostData = {
        game: {
          objects: {},
          diceRolls: [],
          drawings: { layers: [] },
          undo: { past: [], future: [] },
          connectionsLocked: false,
          diceGroups: [],
          sessionId: 'host-session'
        },
        players: {
          players: [{ id: 'host', name: 'Host', color: '#FF0000', isGM: true }],
          activePlayerId: 'host',
          playerPermissions: {
            createObjects: true,
            configureObjects: true,
            deleteObjects: true,
            hideObjects: true
          }
        },
        ui: {
          hyperscaleLayers: [
            { id: 'boards', name: 'Boards', minZIndex: 1, maxZIndex: 1000, color: '#3b82f6' }
          ],
          selectedHyperscaleLayerIds: ['boards'],
          playerPanelSettings: {}
        }
      };

      // Act
      const syncData = WebRTCSyncManager.collectSyncData(
        hostData.game,
        hostData.players,
        hostData.ui
      );

      const distributedData = WebRTCSyncManager.distributeSyncData(syncData);

      // Assert
      // Language НЕ должен быть в синхронизированных данных
      expect(distributedData.ui).not.toHaveProperty('language');

      // ViewTransform НЕ должен быть в синхронизированных данных
      expect(distributedData.game).not.toHaveProperty('viewTransform');

      // Другие данные должны синхронизироваться
      expect(distributedData.players.players).toHaveLength(1);
      expect(distributedData.ui.hyperscaleLayers).toHaveLength(1);
    });

    test('правильная синхронизация player данных', () => {
      // Arrange
      const hostPlayers = {
        players: [
          { id: 'host', name: 'Host', color: '#FF0000', isGM: true },
          { id: 'guest1', name: 'Guest 1', color: '#00FF00', isGM: false }
        ],
        activePlayerId: 'guest1',
        playerPermissions: {
          createObjects: true,
          configureObjects: true,
          deleteObjects: true,
          hideObjects: true
        }
      };

      // Act
      const syncData = WebRTCSyncManager.collectSyncData(
        {} as any, // game data не важен для этого теста
        hostPlayers,
        {} as any  // ui data не важен
      );

      // Assert
      expect(syncData.players.players).toHaveLength(2);
      expect(syncData.players.activePlayerId).toBe('guest1');
      expect(syncData.players.playerPermissions).toBeDefined();
    });
  });

  describe('Cross-Context Integration', () => {

    test('одновременные обновления разных контекстов не конфликтуют', () => {
      // Arrange
      const baseState = WebRTCSyncManager.collectSyncData(
        mockGameState,
        mockPlayerState,
        mockUIState
      );

      // Act - симулируем одновременные обновления
      const updatedPlayerState = {
        ...mockPlayerState,
        activePlayerId: 'player2'
      };

      const updatedUIState = {
        ...mockUIState,
        hyperscaleLayers: [
          ...mockUIState.hyperscaleLayers,
          { id: 'tokens', name: 'Tokens', minZIndex: 3001, maxZIndex: 6000, color: '#10b981' }
        ]
      };

      const updatedSyncData = WebRTCSyncManager.collectSyncData(
        mockGameState,
        updatedPlayerState,
        updatedUIState
      );

      // Assert
      expect(updatedSyncData.players.activePlayerId).toBe('player2');
      expect(updatedSyncData.ui.hyperscaleLayers).toHaveLength(2);
      expect(updatedSyncData.game).toEqual(baseState.game); // Game не изменился
    });

    test('differential sync работает между контекстами', () => {
      // Arrange
      const baseState = WebRTCSyncManager.collectSyncData(
        mockGameState,
        mockPlayerState,
        mockUIState
      );

      // Act - только player данные изменились
      const updatedPlayerState = {
        ...mockPlayerState,
        activePlayerId: 'player2'
      };

      const differentialSync = WebRTCSyncManager.createDifferentialSync(
        baseState,
        WebRTCSyncManager.collectSyncData(mockGameState, updatedPlayerState, mockUIState)
      );

      // Assert
      expect(differentialSync.players).toBeDefined();
      expect(differentialSync.game).toBeUndefined(); // Game не изменился
      expect(differentialSync.ui).toBeUndefined(); // UI не изменился
    });
  });

  describe('Data Consistency', () => {

    test('сохранение ссылочной целостности при синхронизации', () => {
      // Arrange
      const complexState = {
        game: {
          objects: {
            obj1: { id: 'obj1', type: 'card', ownerId: 'player1' }
          },
          diceRolls: [],
          drawings: { layers: [] },
          undo: { past: [], future: [] },
          connectionsLocked: false,
          diceGroups: [],
          sessionId: 'session-1'
        },
        players: {
          players: [
            { id: 'player1', name: 'Player 1', color: '#FF0000', isGM: true }
          ],
          activePlayerId: 'player1',
          playerPermissions: {
            createObjects: true,
            configureObjects: true,
            deleteObjects: true,
            hideObjects: true
          }
        },
        ui: {
          hyperscaleLayers: [
            { id: 'boards', name: 'Boards', minZIndex: 1, maxZIndex: 1000, color: '#3b82f6' }
          ],
          selectedHyperscaleLayerIds: ['boards'],
          playerPanelSettings: {}
        }
      };

      // Act - несколько циклов синхронизации
      const sync1 = WebRTCSyncManager.collectSyncData(
        complexState.game,
        complexState.players,
        complexState.ui
      );

      const sync2 = WebRTCSyncManager.collectSyncData(
        sync1.game,
        sync1.players,
        sync1.ui
      );

      // Assert
      expect(sync1).toEqual(sync2); // Должны быть идентичны
    });

    test('корректная обработка ошибочных данных', () => {
      // Arrange
      const corruptedData = {
        version: '0.1.9',
        timestamp: Date.now(),
        game: null as any, // Коррумпированные данные
        players: mockPlayerState,
        ui: mockUIState
      };

      // Act & Assert
      expect(() => {
        WebRTCSyncManager.distributeSyncData(corruptedData as any);
      }).not.toThrow(); // Не должен падать

      const isValid = WebRTCSyncManager.validateSyncData(corruptedData as any);
      expect(isValid).toBe(false);
    });
  });

  describe('Performance Tests', () => {

    test('синхронизация больших наборов данных выполняется быстро', () => {
      // Arrange - создаем большое состояние
      const largeState = {
        game: {
          objects: {},
          diceRolls: [],
          drawings: { layers: [] },
          undo: { past: [], future: [] },
          connectionsLocked: false,
          diceGroups: [],
          sessionId: 'large-session'
        },
        players: {
          players: Array.from({ length: 100 }, (_, i) => ({
            id: `player-${i}`,
            name: `Player ${i}`,
            color: `#${Math.floor(Math.random() * 16777215).toString(16)}`,
            isGM: false
          })),
          activePlayerId: 'player-0',
          playerPermissions: {
            createObjects: true,
            configureObjects: true,
            deleteObjects: true,
            hideObjects: true
          }
        },
        ui: {
          hyperscaleLayers: [],
          selectedHyperscaleLayerIds: [],
          playerPanelSettings: {}
        }
      };

      // Создаем 100 объектов
      for (let i = 0; i < 100; i++) {
        largeState.game.objects[`obj-${i}`] = {
          id: `obj-${i}`,
          type: 'token',
          x: Math.random() * 1000,
          y: Math.random() * 1000
        };
      }

      // Act
      const startTime = performance.now();
      const syncData = WebRTCSyncManager.collectSyncData(
        largeState.game,
        largeState.players,
        largeState.ui
      );
      const endTime = performance.now();

      // Assert
      expect(endTime - startTime).toBeLessThan(50); // Должно быть < 50ms
      expect(syncData.game.objects).toHaveProperty('obj-50');
      expect(syncData.players.players).toHaveLength(100);
    });

    test('differential sync для малого количества изменений эффективен', () => {
      // Arrange
      const baseState = WebRTCSyncManager.collectSyncData(
        mockGameState,
        mockPlayerState,
        mockUIState
      );

      // Act - меняем только один объект
      const updatedState = {
        ...mockGameState,
        objects: {
          ...mockGameState.objects,
          updatedObj: { ...mockGameState.objects.obj1, x: 200 }
        }
      };

      const differentialSync = WebRTCSyncManager.createDifferentialSync(
        baseState,
        WebRTCSyncManager.collectSyncData(updatedState, mockPlayerState, mockUIState)
      );

      // Assert
      const baseSize = JSON.stringify(baseState).length;
      const diffSize = JSON.stringify(differentialSync).length;

      expect(diffSize).toBeLessThan(baseSize * 0.5); // Differential sync минимум в 2 раза меньше
    });
  });
});