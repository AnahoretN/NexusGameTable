# 🔍 WebRTC Анализ и план миграции

**Дата:** 2026-04-17
**Этап:** ФАЗА 1.2 - Анализ WebRTC синхронизации
**Статус:** ✅ Завершен

---

## 📊 Текущая архитектура WebRTC

### Компоненты системы

1. **usePeerConnection.ts** - Управление WebRTC соединениями
2. **GameContext.tsx** - Обработка SYNC_STATE actions
3. **webrtcOptimization.ts** - Оптимизация передачи данных

### Поток данных синхронизации

```
HOST → GUEST:
┌─────────────────────────────────────────────────────────────┐
│ usePeerConnection.ts                                       │
│ ├─ stateRef.current (полный GameState)                     │
│ ├─ extractImagesFromState()                                │
│ ├─ compressWebRTCData()                                    │
│ └─ conn.send({ type: 'SYNC_STATE', payload, compressed })  │
└─────────────────────────────────────────────────────────────┘
                            ↓
                    [WebRTC Connection]
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ usePeerConnection.ts (Guest side)                          │
│ ├─ handleNetworkData()                                     │
│ ├─ decompressWebRTCData()                                  │
│ ├─ restoreImagesFromCache()                                │
│ └─ localDispatch({ type: 'SYNC_STATE', payload })          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ GameContext.tsx - gameReducer                              │
│ ├─ case 'SYNC_STATE':                                      │
│ ├─ └─ Обрабатывает полный GameState                        │
│ └─ └─ Сохраняет локальные настройки (viewTransform, etc)   │
└─────────────────────────────────────────────────────────────┘
```

---

## 📦 Что синхронизируется сейчас

### Полный GameState содержит:

```typescript
interface GameState {
  // Игровые объекты (СИНХРОНИЗИРУЕТСЯ ✅)
  objects: Record<string, TableObject>;
  diceRolls: DiceRoll[];
  drawings: DrawingData;
  undo: UndoState;
  connectionsLocked: boolean;
  diceGroups: DiceGroup[];
  sessionId: string;
  lastModifiedBy?: string;

  // Player данные (СИНХРОНИЗИРУЕТСЯ ✅, но должно быть в PlayerContext)
  players: Player[];
  activePlayerId: string;
  playerPermissions: PlayerPermissions;

  // ViewTransform (СИНХРОНИЗИРУЕТСЯ ❌, но НЕ ДОЛЖНО - локальное)
  viewTransform: ViewTransform;

  // UI данные (СИНХРОНИЗИРУЕТСЯ ЧАСТИЧНО ⚠️)
  language: AppLanguage;                    // НЕ синхронизируется (локальное)
  playerPanelSettings: PlayerPanelSettings; // Синхронизируется
  hyperscaleLayers: HyperscaleLayer[];      // Синхронизируется
  selectedHyperscaleLayerIds: string[];     // Синхронизируется

  // Внутренние поля (НЕ СИНХРОНИЗИРУЕТСЯ ✅)
  _lastPanelSettingsUpdate?: number;
  _pendingPanelSettings?: PlayerPanelSettings;
}
```

---

## 🎯 Правила синхронизации для новой архитектуры

### Что ДОЛЖНО синхронизироваться через WebRTC:

#### 1. GameContext данные (Игровые объекты)
```typescript
const gameSyncData = {
  objects: Record<string, TableObject>;
  diceRolls: DiceRoll[];
  drawings: DrawingData;
  undo: UndoState;
  connectionsLocked: boolean;
  diceGroups: DiceGroup[];
  sessionId: string;
  lastModifiedBy?: string;
}
```

#### 2. PlayerContext данные (Игроки)
```typescript
const playerSyncData = {
  players: Player[];
  activePlayerId: string;        // Синхронизируется для всех
  playerPermissions: PlayerPermissions;
}
```

#### 3. UIContext данные (Интерфейс - частично)
```typescript
const uiSyncData = {
  // Синхронизировать (общие для всех игроков)
  hyperscaleLayers: HyperscaleLayer[];
  selectedHyperscaleLayerIds: string[];
  playerPanelSettings: PlayerPanelSettings;

  // НЕ синхронизировать (локальные для каждого игрока)
  // language: AppLanguage;  // Каждый игрок выбирает свой
}
```

#### 4. ViewTransform данные (КАМЕРА - НЕ синхронизируется)
```typescript
// ViewTransform НЕ синхронизируется между игроками
// Каждый игрок имеет свою позицию камеры
const localViewTransform = {
  offset: { x: number; y: number };
  zoom: number;
  scroll: { x: number; y: number };
  pixelsPerVU: number;
}
```

---

## 🔄 НОВАЯ архитектура WebRTC

### Структура данных для синхронизации

```typescript
interface WebRTCSyncData {
  version: string; // '0.1.9'

  // GameContext данные
  game: {
    objects: Record<string, TableObject>;
    diceRolls: DiceRoll[];
    drawings: DrawingData;
    undo: UndoState;
    connectionsLocked: boolean;
    diceGroups: DiceGroup[];
    sessionId: string;
    lastModifiedBy?: string;
  };

  // PlayerContext данные
  players: {
    players: Player[];
    activePlayerId: string;
    playerPermissions: PlayerPermissions;
  };

  // UIContext данные (только синхронизируемые)
  ui: {
    hyperscaleLayers: HyperscaleLayer[];
    selectedHyperscaleLayerIds: string[];
    playerPanelSettings: PlayerPanelSettings;
  };

  // ViewTransform НЕ включается (локальное состояние)
}
```

---

## 🛠️ План реализации

### Этап 1: Создать WebRTC менеджер для новой архитектуры

**Файл:** `utils/webrtcSyncManager.ts`

```typescript
/**
 * WebRTC Sync Manager для новой архитектуры контекстов
 * Управляет синхронизацией между разными контекстами
 */

interface ContextSyncData {
  game: any;  // GameState без дублирующихся полей
  players: any;  // PlayerState
  ui: any;  // UIState (только синхронизируемые поля)
}

export class WebRTCSyncManager {
  /**
   * Собрать данные из всех контекстов для синхронизации
   */
  static collectSyncData(
    gameState: GameState,
    playerState: PlayerState,
    uiState: UIState
  ): WebRTCSyncData {
    return {
      version: '0.1.9',
      game: this.extractGameData(gameState),
      players: this.extractPlayerData(playerState),
      ui: this.extractUIData(uiState),
    };
  }

  /**
   * Извлечь только игровые данные для синхронизации
   */
  private static extractGameData(state: GameState) {
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
      objects,
      diceRolls,
      drawings,
      undo,
      connectionsLocked,
      diceGroups,
      sessionId,
      lastModifiedBy
    };
  }

  /**
   * Извлечь player данные для синхронизации
   */
  private static extractPlayerData(state: PlayerState) {
    const { players, activePlayerId, playerPermissions } = state;
    return { players, activePlayerId, playerPermissions };
  }

  /**
   * Извлечь UI данные для синхронизации (только общие)
   */
  private static extractUIData(state: UIState) {
    // НЕ включать language (локальное)
    const {
      hyperscaleLayers,
      selectedHyperscaleLayerIds,
      playerPanelSettings
    } = state;

    return {
      hyperscaleLayers,
      selectedHyperscaleLayerIds,
      playerPanelSettings
    };
  }

  /**
   * Распределить полученные данные по контекстам
   */
  static distributeSyncData(data: WebRTCSyncData): {
    game: Partial<GameState>;
    players: PlayerState;
    ui: Partial<UIState>;
  } {
    return {
      game: data.game,
      players: data.players,
      ui: data.ui
    };
  }
}
```

### Этап 2: Обновить usePeerConnection.ts

**Изменения:**
- Использовать `WebRTCSyncManager` для сбора данных
- Отправлять раздельные данные для каждого контекста
- Обрабатывать входящие данные по контекстам

### Этап 3: Обновить контексты для работы с WebRTC

**PlayerContext:**
```typescript
// Добавить методы для WebRTC
interface PlayerContextValue {
  // ... существующие методы

  // WebRTC методы
  syncFromRemote: (remoteData: PlayerState) => void;
  getSyncData: () => PlayerState;
}
```

**UIContext:**
```typescript
// Добавить методы для WebRTC
interface UIContextValue {
  // ... существующие методы

  // WebRTC методы
  syncFromRemote: (remoteData: Partial<UIState>) => void;
  getSyncData: () => Partial<UIState>;
}
```

**GameContext:**
```typescript
// Убрать дублирующиеся поля
interface GameState {
  // Только игровые объекты
  objects: Record<string, TableObject>;
  diceRolls: DiceRoll[];
  drawings: DrawingData;
  undo: UndoState;
  connectionsLocked: boolean;
  diceGroups: DiceGroup[];
  sessionId: string;
  lastModifiedBy?: string;
}
```

---

## 🧪 Тестовые сценарии

### Unit тесты
```typescript
describe('WebRTCSyncManager', () => {
  test('должен собирать данные из всех контекстов', () => {});
  test('должен исключать viewTransform из синхронизации', () => {});
  test('должен исключать language из синхронизации', () => {});
  test('должен правильно распределять полученные данные', () => {});
});
```

### Integration тесты
```typescript
describe('WebRTC Integration', () => {
  test('полная синхронизация host → guest', () => {});
  test('частичная синхронизация (только изменения)', () => {});
  test('сохранение локальных настроек при синхронизации', () => {});
});
```

---

## 📝 following steps

1. ✅ **Анализ завершен** - Понятна текущая архитектура
2. **Следующий шаг:** Создать `WebRTCSyncManager`
3. **Затем:** Обновить `usePeerConnection.ts`
4. **Затем:** Обновить контексты для работы с WebRTC
5. **Финал:** Протестировать новую архитектуру

---

**Статус:** Готов к реализации Phase 2
**Риск:** Средний (требуется тщательное тестирование WebRTC)
**Приоритет:** Критический (WebRTC - основная функциональность)