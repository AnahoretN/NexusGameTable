/**
 * WebRTCSyncManager Unit Tests
 * @version 1.0.0
 */

import { WebRTCSyncManager, WebRTCSyncData, UISyncData, PlayerSyncData, GameSyncData } from '../../utils/webrtcSyncManager';

describe('WebRTCSyncManager', () => {

  // Mock данные для тестов
  const mockGameState = {
    objects: { obj1: { id: 'obj1', type: 'token', x: 100, y: 100 } },
    diceRolls: [],
    drawings: { layers: [] },
    undo: { past: [], future: [] },
    connectionsLocked: false,
    diceGroups: [],
    sessionId: 'test-session',
    lastModifiedBy: 'player1'
  };

  const mockPlayerState = {
    players: [
      { id: 'player1', name: 'Player 1', color: '#FF0000', isGM: true },
      { id: 'player2', name: 'Player 2', color: '#00FF00', isGM: false }
    ],
    activePlayerId: 'player1',
    playerPermissions: {
      createObjects: true,
      configureObjects: true,
      deleteObjects: true,
      hideObjects: true
    }
  };

  const mockUIState = {
    language: 'en',
    playerPanelSettings: {},
    hyperscaleLayers: [
      { id: 'boards', name: 'Boards', minZIndex: 1, maxZIndex: 1000, color: '#3b82f6' }
    ],
    selectedHyperscaleLayerIds: ['boards']
  };

  describe('collectSyncData', () => {

    test('должен собирать данные из всех контекстов', () => {
      const result = WebRTCSyncManager.collectSyncData(
        mockGameState,
        mockPlayerState,
        mockUIState
      );

      expect(result).toHaveProperty('version', '0.1.9');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('game');
      expect(result).toHaveProperty('players');
      expect(result).toHaveProperty('ui');
    });

    test('НЕ должен включать viewTransform в синхронизацию', () => {
      const stateWithViewTransform = {
        ...mockGameState,
        viewTransform: { offset: { x: 100, y: 100 }, zoom: 1.5 }
      };

      const result = WebRTCSyncManager.collectSyncData(
        stateWithViewTransform as any,
        mockPlayerState,
        mockUIState
      );

      expect(result.game).not.toHaveProperty('viewTransform');
    });

    test('НЕ должен включать language в синхронизацию', () => {
      const result = WebRTCSyncManager.collectSyncData(
        mockGameState,
        mockPlayerState,
        mockUIState
      );

      expect(result.ui).not.toHaveProperty('language');
    });

    test('правильно извлекает game данные', () => {
      const result = WebRTCSyncManager.collectSyncData(
        mockGameState,
        mockPlayerState,
        mockUIState
      );

      expect(result.game).toHaveProperty('objects');
      expect(result.game).toHaveProperty('diceRolls');
      expect(result.game).toHaveProperty('sessionId');
      expect(result.game.objects).toEqual(mockGameState.objects);
    });

    test('правильно извлекает player данные', () => {
      const result = WebRTCSyncManager.collectSyncData(
        mockGameState,
        mockPlayerState,
        mockUIState
      );

      expect(result.players).toHaveProperty('players');
      expect(result.players).toHaveProperty('activePlayerId');
      expect(result.players).toHaveProperty('playerPermissions');
      expect(result.players.players).toEqual(mockPlayerState.players);
    });

    test('правильно извлекает UI данные (без language)', () => {
      const result = WebRTCSyncManager.collectSyncData(
        mockGameState,
        mockPlayerState,
        mockUIState
      );

      expect(result.ui).toHaveProperty('hyperscaleLayers');
      expect(result.ui).toHaveProperty('selectedHyperscaleLayerIds');
      expect(result.ui).not.toHaveProperty('language');
    });
  });

  describe('distributeSyncData', () => {

    test('правильно распределяет данные по контекстам', () => {
      const syncData: WebRTCSyncData = {
        version: '0.1.9',
        timestamp: Date.now(),
        game: mockGameState,
        players: mockPlayerState,
        ui: {
          hyperscaleLayers: mockUIState.hyperscaleLayers,
          selectedHyperscaleLayerIds: mockUIState.selectedHyperscaleLayerIds,
          playerPanelSettings: mockUIState.playerPanelSettings
        }
      };

      const result = WebRTCSyncManager.distributeSyncData(syncData);

      expect(result).toHaveProperty('game');
      expect(result).toHaveProperty('players');
      expect(result).toHaveProperty('ui');
      expect(result.game.objects).toEqual(mockGameState.objects);
      expect(result.players.players).toEqual(mockPlayerState.players);
    });

    test('валидная версия данных', () => {
      const syncData: WebRTCSyncData = {
        version: '0.1.9',
        timestamp: Date.now(),
        game: mockGameState,
        players: mockPlayerState,
        ui: {
          hyperscaleLayers: mockUIState.hyperscaleLayers,
          selectedHyperscaleLayerIds: mockUIState.selectedHyperscaleLayerIds,
          playerPanelSettings: mockUIState.playerPanelSettings
        }
      };

      const result = WebRTCSyncManager.distributeSyncData(syncData);

      expect(result.game).toBeDefined();
      expect(result.players).toBeDefined();
      expect(result.ui).toBeDefined();
    });
  });

  describe('createDifferentialSync', () => {

    test('создает differential sync для измененных данных', () => {
      const baseState: WebRTCSyncData = {
        version: '0.1.9',
        timestamp: Date.now() - 1000,
        game: { ...mockGameState },
        players: { ...mockPlayerState },
        ui: {
          hyperscaleLayers: [...mockUIState.hyperscaleLayers],
          selectedHyperscaleLayerIds: [...mockUIState.selectedHyperscaleLayerIds],
          playerPanelSettings: { ...mockUIState.playerPanelSettings }
        }
      };

      const currentState: WebRTCSyncData = {
        ...baseState,
        timestamp: Date.now(),
        game: {
          ...mockGameState,
          objects: {
            ...mockGameState.objects,
            newObj: { id: 'newObj', type: 'token', x: 200, y: 200 }
          }
        }
      };

      const result = WebRTCSyncManager.createDifferentialSync(baseState, currentState);

      expect(result).toHaveProperty('version');
      expect(result).toHaveProperty('timestamp');
      expect(result.game).toBeDefined(); // Изменился
      expect(result.players).toBeUndefined(); // Не изменился
      expect(result.ui).toBeUndefined(); // Не изменился
    });

    test('возвращает пустой differential если нет изменений', () => {
      const state: WebRTCSyncData = {
        version: '0.1.9',
        timestamp: Date.now(),
        game: mockGameState,
        players: mockPlayerState,
        ui: {
          hyperscaleLayers: mockUIState.hyperscaleLayers,
          selectedHyperscaleLayerIds: mockUIState.selectedHyperscaleLayerIds,
          playerPanelSettings: mockUIState.playerPanelSettings
        }
      };

      const result = WebRTCSyncManager.createDifferentialSync(state, state);

      // Должен вернуть только version и timestamp
      expect(Object.keys(result)).toHaveLength(2);
      expect(result).toHaveProperty('version');
      expect(result).toHaveProperty('timestamp');
    });
  });

  describe('applyDifferentialSync', () => {

    test('применяет differential изменения к состоянию', () => {
      const currentState: WebRTCSyncData = {
        version: '0.1.9',
        timestamp: Date.now(),
        game: mockGameState,
        players: mockPlayerState,
        ui: {
          hyperscaleLayers: mockUIState.hyperscaleLayers,
          selectedHyperscaleLayerIds: mockUIState.selectedHyperscaleLayerIds,
          playerPanelSettings: mockUIState.playerPanelSettings
        }
      };

      const differentialChanges: Partial<WebRTCSyncData> = {
        timestamp: Date.now(),
        game: {
          ...mockGameState,
          objects: {
            ...mockGameState.objects,
            newObj: { id: 'newObj', type: 'token', x: 200, y: 200 }
          }
        }
      };

      const result = WebRTCSyncManager.applyDifferentialSync(currentState, differentialChanges);

      expect(result.game.objects).toHaveProperty('newObj');
      expect(result.players).toEqual(currentState.players); // Не изменился
      expect(result.ui).toEqual(currentState.ui); // Не изменился
    });
  });

  describe('validateSyncData', () => {

    test('валидные данные проходят проверку', () => {
      const validData: WebRTCSyncData = {
        version: '0.1.9',
        timestamp: Date.now(),
        game: mockGameState,
        players: mockPlayerState,
        ui: {
          hyperscaleLayers: mockUIState.hyperscaleLayers,
          selectedHyperscaleLayerIds: mockUIState.selectedHyperscaleLayerIds,
          playerPanelSettings: mockUIState.playerPanelSettings
        }
      };

      const isValid = WebRTCSyncManager.validateSyncData(validData);

      expect(isValid).toBe(true);
    });

    test('невалидные данные не проходят проверку', () => {
      const invalidData = { invalid: 'data' };

      const isValid = WebRTCSyncManager.validateSyncData(invalidData as any);

      expect(isValid).toBe(false);
    });

    test('данные без обязательных полей не валидны', () => {
      const incompleteData = {
        version: '0.1.9',
        timestamp: Date.now()
        // Missing: game, players, ui
      };

      const isValid = WebRTCSyncManager.validateSyncData(incompleteData as any);

      expect(isValid).toBe(false);
    });
  });

  describe('getSyncDataStats', () => {

    test('возвращает статистику sync данных', () => {
      const syncData: WebRTCSyncData = {
        version: '0.1.9',
        timestamp: Date.now(),
        game: {
          ...mockGameState,
          objects: {
            obj1: { id: 'obj1', type: 'token' },
            obj2: { id: 'obj2', type: 'card' }
          }
        },
        players: mockPlayerState,
        ui: {
          hyperscaleLayers: mockUIState.hyperscaleLayers,
          selectedHyperscaleLayerIds: mockUIState.selectedHyperscaleLayerIds,
          playerPanelSettings: mockUIState.playerPanelSettings
        }
      };

      const stats = WebRTCSyncManager.getSyncDataStats(syncData);

      expect(stats).toHaveProperty('version');
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('content');
      expect(stats.content.gameObjects).toBe(2);
      expect(stats.content.players).toBe(2);
    });
  });
});