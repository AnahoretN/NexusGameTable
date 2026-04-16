# 🧪 План тестирования WebRTC для новой архитектуры

**Дата:** 2026-04-17
**Этап:** ФАЗА 1.3 - План тестирования WebRTC
**Статус:** ✅ Завершен

---

## 🎯 Цели тестирования

1. **Проверить корректность синхронизации** данных между контекстами
2. **Убедиться в сохранении локальных настроек** при синхронизации
3. **Проверить производительность** новой архитектуры
4. **Проверить обратную совместимость** с существующими saves

---

## 📋 Сценарии тестирования

### 1. Unit тесты для WebRTCSyncManager

```typescript
describe('WebRTCSyncManager', () => {

  describe('collectSyncData', () => {
    test('должен собирать данные из всех контекстов', () => {
      const mockGameState = { /* ... */ };
      const mockPlayerState = { /* ... */ };
      const mockUIState = { /* ... */ };

      const result = WebRTCSyncManager.collectSyncData(
        mockGameState,
        mockPlayerState,
        mockUIState
      );

      expect(result).toHaveProperty('game');
      expect(result).toHaveProperty('players');
      expect(result).toHaveProperty('ui');
      expect(result.version).toBe('0.1.9');
    });

    test('НЕ должен включать viewTransform в синхронизацию', () => {
      const mockGameState = {
        objects: {},
        viewTransform: { offset: { x: 100, y: 100 }, zoom: 1.5 } // Это должно быть исключено
      };

      const result = WebRTCSyncManager.collectSyncData(mockGameState, {}, {});

      expect(result.game).not.toHaveProperty('viewTransform');
    });

    test('НЕ должен включать language в синхронизацию', () => {
      const mockUIState = {
        language: 'ru', // Это должно быть исключено
        hyperscaleLayers: []
      };

      const result = WebRTCSyncManager.collectSyncData({}, {}, mockUIState);

      expect(result.ui).not.toHaveProperty('language');
    });
  });

  describe('distributeSyncData', () => {
    test('должен правильно распределять данные по контекстам', () => {
      const syncData: WebRTCSyncData = {
        version: '0.1.9',
        game: { objects: {} },
        players: { players: [] },
        ui: { hyperscaleLayers: [] }
      };

      const result = WebRTCSyncManager.distributeSyncData(syncData);

      expect(result).toHaveProperty('game');
      expect(result).toHaveProperty('players');
      expect(result).toHaveProperty('ui');
    });
  });
});
```

---

### 2. Integration тесты для WebRTC

```typescript
describe('WebRTC Integration Tests', () => {

  describe('Host → Guest синхронизация', () => {
    test('полная синхронизация при подключении нового guest', async () => {
      // Arrange
      const hostState = createMockHostState();
      const guestConnection = createMockGuestConnection();

      // Act
      await simulateHostSync(hostState, guestConnection);

      // Assert
      expect(guestConnection.receivedData).toEqual({
        game: expect.any(Object),
        players: expect.any(Object),
        ui: expect.any(Object)
      });
    });

    test('сохранение локальных настроек guest при синхронизации', async () => {
      // Arrange
      const guestLocalSettings = {
        language: 'ru', // Локальная настройка
        viewTransform: { offset: { x: 50, y: 50 }, zoom: 2.0 } // Локальная настройка
      };

      const hostData = createMockHostData();
      const guestConnection = createMockGuestConnection(guestLocalSettings);

      // Act
      await simulateHostSync(hostData, guestConnection);

      // Assert
      expect(guestConnection.state.language).toBe('ru'); // Сохранена
      expect(guestConnection.state.viewTransform).toEqual(guestLocalSettings.viewTransform); // Сохранен
    });

    test('правильная синхронизация players данных', async () => {
      // Arrange
      const hostPlayers = [
        { id: 'host', name: 'Host Player', isGM: true },
        { id: 'guest1', name: 'Guest 1', isGM: false }
      ];

      // Act
      await syncPlayersData(hostPlayers);

      // Assert
      expect(guestState.players).toEqual(hostPlayers);
      expect(guestState.activePlayerId).toBe('guest1'); // Guest остается самим собой
    });
  });

  describe('Differential sync (инкрементальные обновления)', () => {
    test('синхронизация только измененных данных', async () => {
      // Arrange
      const baseState = createMockState();
      const updatedState = {
        ...baseState,
        objects: {
          ...baseState.objects,
          'new-object': { id: 'new-object', type: 'token' }
        }
      };

      // Act
      const differentialSync = createDifferentialSync(baseState, updatedState);

      // Assert
      expect(differentialSync).toHaveProperty('changes');
      expect(Object.keys(differentialSync.changes)).toHaveLength(1); // Только один объект изменился
    });
  });
});
```

---

### 3. E2E тесты для сценариев реального использования

```typescript
describe('E2E WebRTC Tests', () => {

  test('полный цикл: создание игры → подключение игрока → синхронизация', async () => {
    // 1. Host создает игру
    const hostApp = createTestApp({ role: 'host' });
    await hostApp.initialize();

    // 2. Host создает объекты
    await hostApp.createObject({ type: 'token', x: 100, y: 100 });
    await hostApp.createObject({ type: 'card', x: 200, y: 200 });

    // 3. Guest подключается
    const guestApp = createTestApp({ role: 'guest' });
    await guestApp.connectTo(hostApp);

    // 4. Проверяем синхронизацию
    expect(guestApp.state.objects).toHaveLength(2); // Все объекты синхронизированы
    expect(guestApp.state.players).toHaveLength(2); // Host + Guest
  });

  test('синхронизация при добавлении нового игрока', async () => {
    // 1. Host + 2 Guest уже в игре
    const hostApp = createTestApp({ role: 'host' });
    const guest1App = createTestApp({ role: 'guest' });
    const guest2App = createTestApp({ role: 'guest' });

    await setupGame([hostApp, guest1App, guest2App]);

    // 2. Подключается 3-й игрок
    const guest3App = createTestApp({ role: 'guest' });
    await guest3App.connectTo(hostApp);

    // 3. Проверяем, что все видят всех
    expect(hostApp.state.players).toHaveLength(4);
    expect(guest1App.state.players).toHaveLength(4);
    expect(guest2App.state.players).toHaveLength(4);
    expect(guest3App.state.players).toHaveLength(4);
  });

  test('сохранение локальных настроек при многопользовательской игре', async () => {
    // 1. Создаем 3 игроков с разными локальными настройками
    const player1 = createTestApp({
      role: 'guest',
      localSettings: { language: 'ru', zoom: 1.5 }
    });

    const player2 = createTestApp({
      role: 'guest',
      localSettings: { language: 'en', zoom: 2.0 }
    });

    const player3 = createTestApp({
      role: 'guest',
      localSettings: { language: 'de', zoom: 1.0 }
    });

    // 2. Подключаем к host
    await Promise.all([
      player1.connectTo(host),
      player2.connectTo(host),
      player3.connectTo(host)
    ]);

    // 3. Проверяем сохранение локальных настроек
    expect(player1.state.language).toBe('ru');
    expect(player1.state.viewTransform.zoom).toBe(1.5);

    expect(player2.state.language).toBe('en');
    expect(player2.state.viewTransform.zoom).toBe(2.0);

    expect(player3.state.language).toBe('de');
    expect(player3.state.viewTransform.zoom).toBe(1.0);
  });
});
```

---

### 4. Performance тесты

```typescript
describe('WebRTC Performance Tests', () => {

  test('производительность при большом количестве объектов', async () => {
    // Arrange
    const hostApp = createTestApp({ role: 'host' });

    // Создаем 1000 объектов
    for (let i = 0; i < 1000; i++) {
      await hostApp.createObject({
        id: `object-${i}`,
        type: 'token',
        x: Math.random() * 1000,
        y: Math.random() * 1000
      });
    }

    // Act
    const startTime = performance.now();
    await hostApp.syncToGuest();
    const syncTime = performance.now() - startTime;

    // Assert
    expect(syncTime).toBeLessThan(1000); // Должно занимать < 1 секунды
  });

  test('размер данных для синхронизации', () => {
    const state = createLargeState();
    const syncData = WebRTCSyncManager.collectSyncData(state);

    const dataSize = JSON.stringify(syncData).length;
    const compressedSize = compressData(syncData).length;

    expect(compressedSize).toBeLessThan(dataSize * 0.7); // Сжатие минимум на 30%
  });

  test('частота синхронизации не вызывает проблем', async () => {
    const hostApp = createTestApp({ role: 'host' });
    const guestApp = createTestApp({ role: 'guest' });

    await guestApp.connectTo(hostApp);

    // Симулируем активную игру (много изменений)
    const syncTimes = [];
    for (let i = 0; i < 100; i++) {
      const start = performance.now();
      await hostApp.syncChange({ type: 'update_object', id: `obj-${i}` });
      syncTimes.push(performance.now() - start);
    }

    const avgSyncTime = syncTimes.reduce((a, b) => a + b) / syncTimes.length;
    expect(avgSyncTime).toBeLessThan(50); // В среднем < 50ms на синхронизацию
  });
});
```

---

### 5. Тесты обратной совместимости

```typescript
describe('Backward Compatibility Tests', () => {

  test('загрузка save файла из старой версии (v0.1.8)', () => {
    const oldSave = loadSaveFile('v0.1.8-save.json');

    // Должен автоматически мигрировать в новую структуру
    const migratedState = migrateSaveToV019(oldSave);

    expect(migratedState).toHaveProperty('game');
    expect(migratedState).toHaveProperty('players');
    expect(migratedState).toHaveProperty('ui');
  });

  test('совместимость с существующими WebRTC сообщениями', () => {
    const oldMessage = createOldWebRTCMessage(); // v0.1.8 формат

    // Должен обрабатывать старый формат
    const handled = handleIncomingWebRTCMessage(oldMessage);

    expect(handled).toBe(true);
  });
});
```

---

## 🔧 Инструменты для тестирования

### Mock объекты
```typescript
// utils/testMocks.ts
export function createMockGameState(overrides = {}) {
  return {
    objects: {},
    diceRolls: [],
    drawings: {},
    undo: { past: [], future: [] },
    connectionsLocked: false,
    diceGroups: [],
    sessionId: 'test-session',
    lastModifiedBy: 'test-player',
    ...overrides
  };
}

export function createMockPlayerState(overrides = {}) {
  return {
    players: [
      { id: 'player1', name: 'Player 1', color: '#FF0000', isGM: true }
    ],
    activePlayerId: 'player1',
    playerPermissions: {
      createObjects: true,
      configureObjects: true,
      deleteObjects: true,
      hideObjects: true
    },
    ...overrides
  };
}

export function createMockUIState(overrides = {}) {
  return {
    language: 'en',
    playerPanelSettings: {},
    hyperscaleLayers: [],
    selectedHyperscaleLayerIds: [],
    ...overrides
  };
}
```

### Test утилиты
```typescript
// utils/testUtils.ts
export async function simulateHostSync(hostState, guestConnection) {
  const syncData = WebRTCSyncManager.collectSyncData(
    hostState.game,
    hostState.players,
    hostState.ui
  );

  await guestConnection.handleMessage({
    type: 'SYNC_STATE',
    payload: syncData
  });
}

export function createDifferentialSync(baseState, updatedState) {
  // Реализация differential sync логики
  return {
    base: baseState,
    changes: calculateChanges(baseState, updatedState)
  };
}
```

---

## 📊 Критерии успеха

### Функциональность
- ✅ Все unit тесты проходят (100%)
- ✅ Все integration тесты проходят (100%)
- ✅ Все E2E тесты проходят (100%)

### Производительность
- ✅ Синхронизация 1000 объектов < 1 секунды
- ✅ Среднее время синхронизации < 50ms
- ✅ Сжатие данных минимум на 30%

### Совместимость
- ✅ Обратная совместимость с v0.1.8
- ✅ Корректная обработка старых save файлов
- ✅ Совместимость с существующими WebRTC сообщениями

---

## 🚀 План выполнения

1. ✅ **Создать структуру тестов** - Завершено
2. **Реализовать mock объекты** - Следующий шаг
3. **Написать unit тесты** - После реализации WebRTCSyncManager
4. **Написать integration тесты** - После обновления usePeerConnection
5. **Написать E2E тесты** - После реализации новой архитектуры
6. **Прогнать все тесты** - Финальная проверка

---

**Статус:** План тестирования готов
**Следующий шаг:** Начать реализацию Phase 2 - Создание независимых контекстов