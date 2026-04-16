# 🚀 План полной миграции и интеграции контекстов

**Дата:** 2026-04-17
**Цель:** Полное разделение контекстов и удаление зависимостей от GameContext
**Статус:** 📋 Требуется выполнение
**Сложность:** Высокая
**Приоритет:** Критический

---

## 🎯 Текущая проблема

**Текущее состояние:** Гибридная архитектура
- ❌ PlayerContext зависит от GameContext (использует `useGame()`)
- ❌ GameContext содержит дублирующиеся состояния
- ❌ WebRTC синхронизация идёт через GameContext
- ❌ 61% компонентов всё ещё используют только GameContext

**Целевое состояние:** Полностью разделённая архитектура
- ✅ Все контексты независимы
- ✅ GameContext содержит только игровые объекты
- ✅ WebRTC синхронизация работает с новыми контекстами
- ✅ Все компоненты мигрировали на новые контексты

---

## 📋 План выполнения

### ФАЗА 1: Подготовка к полной миграции (1-2 дня)

#### 1.1 Резервное копирование и анализ
```bash
# Создать backup ветку
git checkout -b backup/before-full-migration

# Зафиксировать текущее состояние
git add .
git commit -m "backup: перед полной миграцией контекстов"
```

#### 1.2 Анализ WebRTC синхронизации
**Задача:** Понять, как работает WebRTC в GameContext

**Файлы для анализа:**
- `store/usePeerConnection.ts` - WebRTC соединение
- `store/GameContext.tsx` - reducer и действия для синхронизации
- Действия: `SYNC_STATE`, `WEBRTC_SYNC_STATE`

**Вопросы для ответа:**
1. Какие данные синхронизируются через WebRTC?
2. Как работает `SYNC_STATE` действие?
3. Какие поля должны остаться в GameContext для синхронизации?

#### 1.3 Создать план тестирования WebRTC
```typescript
// Тестовые сценарии:
- [ ] Синхронизация объектов (objects)
- [ ] Синхронизация diceRolls
- [ ] Синхронизация drawings
- [ ] Проверка, что player данные синхронизируются через PlayerContext
- [ ] Проверка, что viewTransform не синхронизируется (локальный)
```

---

### ФАЗА 2: Создание независимых контекстов (2-3 дня)

#### 2.1 PlayerContext v2.0 - Независимый
**Текущая проблема:** PlayerContext использует `useGame()` внутри

**Решение:** Создать полностью независимый PlayerContext

```typescript
// store/contexts/PlayerContext.tsx - v2.0
// ИЗМЕНЕНИЯ:
// ❌ УБРАТЬ: import { useGame } from '../GameContext';
// ✅ ДОБАВИТЬ: Независимый reducer
// ✅ ДОБАВИТЬ: WebRTC синхронизацию через пропсы или callback

interface PlayerContextValue extends PlayerState {
  // ... существующие методы

  // НОВЫЕ методы для WebRTC
  syncFromRemote: (remoteState: PlayerState) => void;
  getSyncData: () => PlayerState;
}

export function PlayerProvider({
  children,
  initialSyncData,
  onPlayerChange  // Callback для WebRTC синхронизации
}: PlayerProviderProps) {
  // Независимый state management
  const [state, dispatch] = useReducer(playerReducer, initialSyncData || initialState);

  // WebRTC синхронизация
  useEffect(() => {
    if (onPlayerChange) {
      onPlayerChange(state);
    }
  }, [state, onPlayerChange]);

  // ... остальная реализация
}
```

#### 2.2 ViewTransformContext v2.1 - Локальный только
**Уточнение:** ViewTransform должен остаться локальным (без синхронизации)

```typescript
// store/contexts/ViewTransformContext.tsx - v2.1
// ИЗМЕНЕНИЯ:
// ✅ Убедиться, что NO WebRTC synchronization
// ✅ Добавить комментарий: "Локальное состояние, не синхронизируется"

// ViewTransform НЕ должен синхронизироваться между игроками
// Каждый игрок имеет свою позицию камеры
```

#### 2.3 UIContext v1.1 - Частичная синхронизация
**Уточнение:** Некоторые UI данные должны синхронизироваться

```typescript
// store/contexts/UIContext.tsx - v1.1
// СИНХРОНИЗИРОВАТЬ:
// ✅ hyperscaleLayers
// ✅ selectedHyperscaleLayerIds

// ЛОКАЛЬНЫЕ (НЕ синхронизировать):
// ❌ language (каждый игрок выбирает свой язык)
// ❌ playerPanelSettings (каждый игрок имеет свои настройки)
```

---

### ФАЗА 3: Очистка GameContext (2-3 дня)

#### 3.1 Удалить дублирующиеся состояния
**Файл:** `store/gameState.ts`

```typescript
// УДАЛИТЬ из GameState:
interface GameState {
  // ❌ УДАЛИТЬ:
  // players: Player[];
  // activePlayerId: string;
  // playerPermissions: PlayerPermissions;
  // viewTransform: ViewTransform;
  // language: AppLanguage;
  // playerPanelSettings: PlayerPanelSettings;
  // hyperscaleLayers: HyperscaleLayer[];
  // selectedHyperscaleLayerIds: string[];

  // ✅ ОСТАВИТЬ:
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

#### 3.2 Удалить ненужные actions
**Файл:** `store/gameActions.ts`

```typescript
// УДАЛИТЬ actions:
// - ADD_PLAYER
// - UPDATE_PLAYER
// - REMOVE_PLAYER
// - SET_ACTIVE_ID
// - UPDATE_PLAYER_PERMISSIONS
// - UPDATE_VIEW_TRANSFORM
// - SET_PIXELS_PER_VU
// - SET_LANGUAGE
// - UPDATE_HYPERSCALE_LAYERS
// - ADD_HYPERSCALE_LAYER
// - UPDATE_HYPERSCALE_LAYER
// - REMOVE_HYPERSCALE_LAYER
// - TOGGLE_LAYER_SELECTION
// - SET_LAYER_SELECTION
// - SELECT_ALL_LAYERS
// - DESELECT_ALL_LAYERS
```

#### 3.3 Обновить WebRTC синхронизацию
**Файл:** `store/usePeerConnection.ts`

```typescript
// ИЗМЕНЕНИЯ в WebRTC синхронизации:

// Раньше синхронизировали весь state:
const syncData = {
  ...state,  // ❌ Содержал все данные
};

// Теперь синхронизируем только GameContext:
const syncData = {
  objects: state.objects,
  diceRolls: state.diceRolls,
  drawings: state.drawings,
  undo: state.undo,
  connectionsLocked: state.connectionsLocked,
  diceGroups: state.diceGroups,
  sessionId: state.sessionId,
  lastModifiedBy: state.lastModifiedBy,
};

// Player данные синхронизируются отдельно:
const playerSyncData = {
  players: playerContext.players,
  activePlayerId: playerContext.activePlayerId,
  playerPermissions: playerContext.playerPermissions,
};

// UI данные синхронизируются отдельно:
const uiSyncData = {
  hyperscaleLayers: uiContext.hyperscaleLayers,
  selectedHyperscaleLayerIds: uiContext.selectedHyperscaleLayerIds,
};
```

---

### ФАЗА 4: Миграция компонентов (3-4 дня)

#### 4.1 Приоритизация компонентов
**Критические (мигрировать сначала):**
1. `PoolTabletopOptimized.tsx` - основной компонент
2. `PoolPanel.tsx` - панели игроков
3. `HandPanelOptimized.tsx` - руки карт
4. `TokensPanelOptimized.tsx` - токены

**Средний приоритет:**
5. `TableauPanel.tsx`
6. `TopDeckModal.tsx`
7. `SearchDeckModal.tsx`
8. `PanelSettingsModal.tsx`

**Низкий приоритет:**
9. `ToolsPanel.tsx`
10. `HyperscaleLayerSettingsWindow.tsx`
11. `DeckComponent.tsx`

#### 4.2 Процесс миграции компонента
**Шаблон миграции:**

```typescript
// БЫЛО:
import { useGame } from '../store/GameContext';

function MyComponent() {
  const { state, dispatch } = useGame();
  const { players, activePlayerId } = state;
  const { viewTransform } = state;

  const handleAddPlayer = (player) => {
    dispatch({ type: 'ADD_PLAYER', payload: player });
  };
}

// СТАЛО:
import { usePlayers, useViewTransform } from '../store/contexts';

function MyComponent() {
  const { players, activePlayerId, addPlayer } = usePlayers();
  const { viewTransform } = useViewTransform();

  const handleAddPlayer = (player) => {
    addPlayer(player);  // Прямой вызов метода
  };
}
```

#### 4.3 Миграция по категориям
**Используют players:** → `usePlayers()`
- `PoolPanel.tsx`
- `HandPanelOptimized.tsx`
- `CharacterPanel.tsx`

**Используют viewTransform:** → `useViewTransform()`
- `PoolTabletopOptimized.tsx`
- `TableauPanel.tsx`

**Используют language/UI:** → `useUI()`
- `ToolsPanel.tsx`
- `PanelSettingsModal.tsx`
- `HyperscaleLayerSettingsWindow.tsx`

---

### ФАЗА 5: Обновление App.tsx (1 день)

#### 5.1 Новая структура провайдеров
```typescript
// App.tsx - ФИНАЛЬНАЯ СТРУКТУРА
import React from 'react';
import { LocalSettingsProvider } from './hooks/useLocalSettings';
import { UIProvider } from './store/contexts/UIContext';
import { ViewTransformProvider } from './store/contexts/ViewTransformContext';
import { PlayerProvider } from './store/contexts/PlayerContext';
import { GameProvider } from './store/GameContext';
import { usePeerConnection } from './store/usePeerConnection';

// WebRTC Integration Component
function WebRTCIntegration({ children }) {
  // WebRTC теперь собирает данные из разных контекстов
  const playerContext = usePlayers();
  const uiContext = useUI();
  const gameContext = useGame();

  // Синхронизация через WebRTC
  const { sendSync } = usePeerConnection();

  useEffect(() => {
    // Собираем данные из всех контекстов
    const syncData = {
      // GameContext данные
      game: {
        objects: gameContext.state.objects,
        diceRolls: gameContext.state.diceRolls,
        // ... другие game данные
      },
      // PlayerContext данные
      players: {
        players: playerContext.players,
        activePlayerId: playerContext.activePlayerId,
        playerPermissions: playerContext.playerPermissions,
      },
      // UIContext данные
      ui: {
        hyperscaleLayers: uiContext.hyperscaleLayers,
        selectedHyperscaleLayerIds: uiContext.selectedHyperscaleLayerIds,
      },
    };

    sendSync(syncData);
  }, [gameContext.state, playerContext, uiContext, sendSync]);

  return <>{children}</>;
}

function App() {
  return (
    <LocalSettingsProvider>
      <UIProvider>
        <ViewTransformProvider>
          <PlayerProvider>
            <GameProvider>
              <WebRTCIntegration>
                <MainApplication />
              </WebRTCIntegration>
            </GameProvider>
          </PlayerProvider>
        </ViewTransformProvider>
      </UIProvider>
    </LocalSettingsProvider>
  );
}
```

---

### ФАЗА 6: Комплексное тестирование (2-3 дня)

#### 6.1 Unit тесты
```typescript
// Тесты для каждого контекста
describe('PlayerContext v2.0', () => {
  test('должен работать независимо от GameContext', () => {});
  test('должен синхронизироваться через WebRTC', () => {});
});

describe('ViewTransformContext v2.1', () => {
  test('должен быть локальным (без синхронизации)', () => {});
});

describe('UIContext v1.1', () => {
  test('должен синхронизировать только layers', () => {});
  test('НЕ должен синхронизировать language', () => {});
});
```

#### 6.2 Integration тесты
```typescript
describe('WebRTC Integration', () => {
  test('должен синхронизировать данные между игроками', () => {});
  test('должен обрабатывать конфликты данных', () => {});
});

describe('Cross-Context Integration', () => {
  test('все контексты должны работать вместе', () => {});
});
```

#### 6.3 E2E тесты
```typescript
// Сценарии реального использования
describe('Player Flow', () => {
  test('добавление игрока и синхронизация', () => {});
  test('переключение активного игрока', () => {});
});

describe('Game Flow', () => {
  test('создание объектов и синхронизация', () => {});
  test('многопользовательская игра', () => {});
});
```

---

### ФАЗА 7: Performance оптимизация (1-2 дня)

#### 7.1 Профилирование
```typescript
// Замерить метрики ДО и ПОСЛЕ миграции
const metrics = {
  renderCount: {},
  responseTime: {},
  memoryUsage: {},
};

// Сравнить с текущими показателями
```

#### 7.2 Оптимизация
- [ ] Оптимизировать рендеры контекстов
- [ ] Оптимизировать WebRTC передачу данных
- [ ] Оптимизировать селекторы
- [ ] Добавить мемоизацию там, где нужно

---

### ФАЗА 8: Документация и cleanup (1 день)

#### 8.1 Обновить документацию
- [ ] Обновить CONTEXT_REFACTORING_PLAN.md
- [ ] Создать MIGRATION_GUIDE.md
- [ ] Обновить README.md
- [ ] Обновить OPTIMIZATION_COMPLETED.md

#### 8.2 Cleanup
- [ ] Удалить неиспользуемый код
- [ ] Удалить адаптеры (если не нужны)
- [] Обновить импорты
- [ ] Проверить типы

---

## 🚨 Риски и митигация

### Риск 1: Потеря WebRTC функциональности
**Митигация:**
- Тестировать WebRTC на каждом этапе
- Создать comprehensive тесты
- Backup ветка для отката

### Риск 2: Performance regression
**Митигация:**
- Профилирование до/после
- Оптимизация на каждом этапе
- Мониторинг метрик

### Риск 3: Нарушение работы компонентов
**Митигация:**
- Постепенная миграция
- Тестирование каждого компонента
- Unit и integration тесты

---

## 📊 Timeline

| Фаза | Длительность | Начало | Конец |
|------|-------------|--------|-------|
| 1. Подготовка | 1-2 дня | Day 1 | Day 2 |
| 2. Независимые контексты | 2-3 дня | Day 3 | Day 5 |
| 3. Очистка GameContext | 2-3 дня | Day 6 | Day 8 |
| 4. Миграция компонентов | 3-4 дня | Day 9 | Day 12 |
| 5. Обновление App.tsx | 1 день | Day 13 | Day 13 |
| 6. Тестирование | 2-3 дня | Day 14 | Day 16 |
| 7. Performance | 1-2 дня | Day 17 | Day 18 |
| 8. Документация | 1 день | Day 19 | Day 19 |
| **ИТОГО** | **13-19 дней** | | |

---

## 🎯 Критерии успеха

### Функциональность
- ✅ WebRTC синхронизация работает корректно
- ✅ Все компоненты мигрировали на новые контексты
- ✅ Нет regressions в функциональности
- ✅ Обратная совместимость (если нужна)

### Архитектура
- ✅ Все контексты независимы
- ✅ GameContext содержит только игровые объекты
- ✅ Четкое разделение ответственности
- ✅ Понятная структура провайдеров

### Производительность
- ✅ Снижение рендеров на 60-70%
- ✅ Улучшение отклика UI на 40-50%
- ✅ Снижение использование памяти на 20-30%

### Качество кода
- ✅ Все тесты проходят
- ✅ Нет TypeScript ошибок
- ✅ Чистая структура кода
- ✅ Полная документация

---

## 📝 Следующие шаги

### НЕМЕДЛЕННО:
1. Проанализировать WebRTC в `usePeerConnection.ts`
2. Создать backup ветку
3. Начать с ФАЗЫ 1 (подготовка)

### ПРИОРИТЕТ 1:
- Создать независимый PlayerContext v2.0
- Протестировать WebRTC синхронизацию

### ПРИОРИТЕТ 2:
- Очистить GameContext
- Мигрировать критические компоненты

---

**Статус:** Ожидает начала выполнения
**Сложность:** Высокая
**Риск:** Высокий (требует тщательного тестирования)
**Рекомендация:** Начать с анализа WebRTC и создания backup

Хотите начать выполнение этого плана?