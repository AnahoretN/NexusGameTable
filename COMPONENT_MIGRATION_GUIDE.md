# 🔄 Руководство по миграции компонентов на новые контексты

**Дата:** 2026-04-17
**Версия:** 1.0
**Статус:** Готово к использованию

---

## 📋 Общие принципы миграции

### ✅ Что нужно заменить

**БЫЛО (старый подход):**
```typescript
import { useGame } from '../store/GameContext';

function MyComponent() {
  const { state, dispatch } = useGame();
  const { players, activePlayerId, viewTransform, language } = state;

  const handleAction = () => {
    dispatch({ type: 'SOME_ACTION', payload: data });
  };
}
```

**СТАЛО (новый подход):**
```typescript
import {
  usePlayersV2,
  useViewTransform,
  useUIV1,
  useObjects,
  useObjectActions
} from '../store/contexts';

function MyComponent() {
  // Данные из контекстов
  const { players, activePlayerId, getActivePlayer } = usePlayersV2();
  const { viewTransform } = useViewTransform();
  const { language } = useUIV1();
  const objects = useObjects();

  // Actions из ObjectStore
  const { updateObject, deleteObject } = useObjectActions();

  const handleAction = () => {
    // Прямые вызовы методов вместо dispatch
    updateObject(objectId, updates);
  };
}
```

---

## 🎯 Паттерны миграции по типам данных

### 1. Player данные → PlayerContext v2.0

**БЫЛО:**
```typescript
const { state } = useGame();
const { players, activePlayerId, playerPermissions } = state;
const activePlayer = players.find(p => p.id === activePlayerId);
const isGM = activePlayer?.isGM || false;
```

**СТАЛО:**
```typescript
import { usePlayersV2, useActivePlayerIdV2, usePlayerListV2, useIsGMV2 } from '../store/contexts';

const { getActivePlayer } = usePlayersV2();
const activePlayerId = useActivePlayerIdV2();
const players = usePlayerListV2();
const isGM = useIsGMV2();

// Или еще проще:
const activePlayer = getActivePlayer();
```

**Доступные hooks:**
- `usePlayersV2()` - все player данные и методы
- `useActivePlayerV2()` - только активный игрок
- `useActivePlayerIdV2()` - только ID активного игрока
- `usePlayerListV2()` - список всех игроков
- `useIsGMV2()` - проверка GM статуса

### 2. ViewTransform данные → ViewTransformContext

**БЫЛО:**
```typescript
const { state } = useGame();
const { viewTransform } = state;
const { offset, zoom, pixelsPerVU } = viewTransform;
```

**СТАЛО:**
```typescript
import { useViewTransform, useTransformState, useZoom, useOffset, usePixelsPerVU } from '../store/contexts';

// Вариант 1: Полный transform
const { viewTransform } = useViewTransform();

// Вариант 2: Только состояние
const transformState = useTransformState();

// Вариант 3: Отдельные значения
const zoom = useZoom();
const offset = useOffset();
const pixelsPerVU = usePixelsPerVU();
```

**Доступные hooks:**
- `useViewTransform()` - все transform данные и методы
- `useTransformState()` - только состояние
- `useZoom()` - только zoom уровень
- `useOffset()` - только offset
- `usePixelsPerVU()` - только pixelsPerVU

### 3. UI данные → UIContext v1.1

**БЫЛО:**
```typescript
const { state } = useGame();
const { language, hyperscaleLayers, selectedHyperscaleLayerIds } = state;
```

**СТАЛО:**
```typescript
import {
  useUIV1,
  useLanguageV1,
  useHyperscaleLayersV1,
  useSelectedLayersV1,
  useLayerSelectionV1
} from '../store/contexts';

// Вариант 1: Все UI данные
const { language, hyperscaleLayers, selectedHyperscaleLayerIds } = useUIV1();

// Вариант 2: Отдельные значения
const language = useLanguageV1();
const layers = useHyperscaleLayersV1();
const selectedLayers = useSelectedLayersV1();
```

**Доступные hooks:**
- `useUIV1()` - все UI данные и методы
- `useLanguageV1()` - только язык
- `useHyperscaleLayersV1()` - только слои
- `useSelectedLayersV1()` - только выбранные слои
- `useLayerSelectionV1()` - выбор слоев `[selectedIds, setSelectedIds]`

### 4. Игровые объекты → ObjectStore

**БЫЛО:**
```typescript
const { state, dispatch } = useGame();
const { objects } = state;

const updateObject = (id, updates) => {
  dispatch({ type: 'UPDATE_OBJECT', payload: { id, updates } });
};
```

**СТАЛО:**
```typescript
import { useObjects, useObjectActions } from '../store/objectStore';

// Данные
const objects = useObjects();

// Actions
const { updateObject, deleteObject, moveObject, setObject } = useObjectActions();

// Использование
const handleUpdate = () => {
  updateObject(objectId, { x: 100, y: 200 });
};
```

**Доступные hooks:**
- `useObjects()` - все объекты и методы
- `useObjectById(id)` - конкретный объект
- `useObjectsByType<T>(type)` - объекты по типу
- `useVisibleObjects()` - видимые объекты
- `useObjectActions()` - только actions

---

## 🔧 Практические примеры миграции

### Пример 1: Простой компонент

**БЫЛО:**
```typescript
function PlayerInfo() {
  const { state } = useGame();
  const { players, activePlayerId } = state;
  const activePlayer = players.find(p => p.id === activePlayerId);

  return <div>{activePlayer?.name}</div>;
}
```

**СТАЛО:**
```typescript
import { usePlayersV2 } from '../store/contexts';

function PlayerInfo() {
  const { getActivePlayer } = usePlayersV2();
  const activePlayer = getActivePlayer();

  return <div>{activePlayer?.name}</div>;
}
```

### Пример 2: Компонент с actions

**БЫЛО:**
```typescript
function ObjectCard({ objectId }) {
  const { state, dispatch } = useGame();
  const object = state.objects[objectId];

  const handleDelete = () => {
    dispatch({ type: 'DELETE_OBJECT', payload: objectId });
  };

  const handleMove = (x, y) => {
    dispatch({ type: 'MOVE_OBJECT', payload: { id: objectId, x, y } });
  };

  return <Card onClick={handleDelete} onDrag={handleMove} />;
}
```

**СТАЛО:**
```typescript
import { useObjectById, useObjectActions } from '../store/objectStore';

function ObjectCard({ objectId }) {
  const object = useObjectById(objectId);
  const { deleteObject, moveObject } = useObjectActions();

  const handleDelete = () => {
    deleteObject(objectId);
  };

  const handleMove = (x, y) => {
    moveObject(objectId, x, y);
  };

  return <Card onClick={handleDelete} onDrag={handleMove} />;
}
```

### Пример 3: Компонент с несколькими контекстами

**БЫЛО:**
```typescript
function GameView() {
  const { state } = useGame();
  const {
    objects,
    players,
    activePlayerId,
    viewTransform,
    language,
    hyperscaleLayers
  } = state;

  const currentPlayer = players.find(p => p.id === activePlayerId);
  const isGM = currentPlayer?.isGM || false;
  const { offset, zoom } = viewTransform;

  return <div>{/* ... */}</div>;
}
```

**СТАЛО:**
```typescript
import {
  usePlayersV2,
  useViewTransform,
  useUIV1,
  useObjects
} from '../store/contexts';
import { useIsGMV2, useActivePlayerIdV2 } from '../store/contexts';

function GameView() {
  // Данные из разных контекстов
  const objects = useObjects();
  const { getActivePlayer } = usePlayersV2();
  const { viewTransform } = useViewTransform();
  const { language } = useUIV1();

  // Оптимизированные hooks
  const activePlayerId = useActivePlayerIdV2();
  const isGM = useIsGMV2();

  const { offset, zoom } = viewTransform;

  return <div>{/* ... */}</div>;
}
```

---

## 📋 Чеклист миграции компонента

### Шаг 1: Анализ компонента
- [ ] Выяснить, какие данные использует компонент
- [ ] Выяснить, какие actions использует компонент
- [ ] Определить, какие контексты нужны

### Шаг 2: Замена импортов
- [ ] Убрать `import { useGame } from '../store/GameContext'`
- [ ] Добавить импорты из `'../store/contexts'`
- [ ] Добавить импорты из `'../store/objectStore'`

### Шаг 3: Замена использования useGame()
- [ ] Заменить player данные на `usePlayersV2()`
- [ ] Заменить viewTransform на `useViewTransform()`
- [ ] Заменить UI данные на `useUIV1()`
- [ ] Заменить objects на `useObjects()`

### Шаг 4: Замена dispatch на прямые методы
- [ ] Заменить `dispatch({ type: 'UPDATE_OBJECT', ... })` на `updateObject()`
- [ ] Заменить `dispatch({ type: 'DELETE_OBJECT', ... })` на `deleteObject()`
- [ ] Заменить `dispatch({ type: 'MOVE_OBJECT', ... })` на `moveObject()`
- [ ] Заменить player actions на методы PlayerContext
- [ ] Заменить UI actions на методы UIContext

### Шаг 5: Тестирование
- [ ] Проверить, что компонент работает корректно
- [ ] Проверить, что actions работают
- [ ] Проверить, что нет лишних ререндеров

---

## 🎯 Компоненты для миграции (приоритизировано)

### Критические (мигрировать сначала)
1. ✅ `PoolTabletopOptimized.tsx` - ГОТОВО (пример миграции)
2. `PoolPanel.tsx` - использует player данные
3. `HandPanelOptimized.tsx` - использует player данные
4. `TokensPanelOptimized.tsx` - использует objects

### Средний приоритет
5. `TableauPanel.tsx` - использует objects и players
6. `TopDeckModal.tsx` - использует objects
7. `SearchDeckModal.tsx` - использует objects
8. `PanelSettingsModal.tsx` - использует UI данные

### Низкий приоритет
9. `ToolsPanel.tsx` - использует UI данные
10. `HyperscaleLayerSettingsWindow.tsx` - использует UI данные
11. `DeckComponent.tsx` - использует objects

---

## ⚠️ Распространенные ошибки

### Ошибка 1: Использование обоих подходов
```typescript
// ❌ НЕ ПРАВИЛЬНО
const { state } = useGame();
const { players } = usePlayersV2(); // Дублирование!
```

```typescript
// ✅ ПРАВИЛЬНО
const { players } = usePlayersV2(); // Только новые контексты
```

### Ошибка 2: Забыть заменить dispatch
```typescript
// ❌ НЕ ПРАВИЛЬНО
const { updateObject } = useObjectActions();
dispatch({ type: 'UPDATE_OBJECT', payload: { id, updates } }); // Старый подход
```

```typescript
// ✅ ПРАВИЛЬНО
const { updateObject } = useObjectActions();
updateObject(id, updates); // Новый подход
```

### Ошибка 3: Неправильный порядок контекстов
```typescript
// ❌ НЕ ПРАВИЛЬНО
const { language } = useUIV1();
const { getActivePlayer } = usePlayersV2(); // Может вызвать ошибку
```

```typescript
// ✅ ПРАВИЛЬНО
// Порядок не важен, контексты независимы
const { getActivePlayer } = usePlayersV2();
const { language } = useUIV1();
```

---

## 📊 Шаблон миграции

Скопируйте этот шаблон для быстрой миграции:

```typescript
// ========================================
// ШАБЛОН МИГРАЦИИ КОМПОНЕНТА
// ========================================

// 1. Удалить старый импорт
// import { useGame } from '../store/GameContext';

// 2. Добавить новые импорты
import {
  usePlayersV2,
  useViewTransform,
  useUIV1,
  useActivePlayerIdV2,
  usePlayerListV2,
  useIsGMV2
} from '../store/contexts';
import { useObjects, useObjectActions } from '../store/objectStore';

// 3. Заменить использование useGame()
function MyComponent() {
  // БЫЛО: const { state, dispatch } = useGame();

  // Player данные
  const { getActivePlayer } = usePlayersV2();
  const activePlayerId = useActivePlayerIdV2();
  const players = usePlayerListV2();
  const isGM = useIsGMV2();

  // ViewTransform данные
  const { viewTransform } = useViewTransform();

  // UI данные
  const { language } = useUIV1();

  // Игровые объекты
  const objects = useObjects();
  const { updateObject, deleteObject, moveObject } = useObjectActions();

  // 4. Заменить dispatch на прямые методы
  const handleSomething = () => {
    // БЫЛО: dispatch({ type: 'UPDATE_OBJECT', payload: { id, updates } });
    updateObject(id, updates);
  };

  // ... остальная логика компонента
}
```

---

**Руководство подготовлено:** 2026-04-17
**Статус:** Готово к использованию
**Следующий шаг:** Применить к оставшимся 10 компонентам