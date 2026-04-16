# 🔍 АУДИТ ИНТЕГРАЦИИ КОНТЕКСТОВ

**Дата:** 2026-04-16
**Версия:** 1.0.0
**Статус:** ⚠️ ЧАСТИЧНАЯ ИНТЕГРАЦИЯ
**Этап:** 5 из 7 - Рефакторинг GameContext

---

## 📊 ИЗМЕРЕНИЯ ИНТЕГРАЦИИ

### 📈 Статистика использования

| Категория | Количество | Процент |
|-----------|------------|---------|
| **Всего компонентов** | 50+ | 100% |
| **Используют новые контексты** | 13 | 26% |
| **Полностью мигрировали** | 4 | 8% |
| **Частично мигрировали** | 9 | 18% |
| **Не мигрировали** | 11+ | 22%+ |

### 🎯 Уровень интеграции по контекстам

| Контекст | Полная миграция | Частичная миграция | Не мигрировали |
|----------|----------------|-------------------|----------------|
| **PlayerContext** | 2 компонента | 6 компонентов | 8+ компонентов |
| **ViewTransformContext** | 2 компонента | 2 компонента | 5+ компонентов |
| **UIContext** | 1 компонент | 3 компонента | 10+ компонентов |

---

## ⚠️ ОБНАРУЖЕННЫЕ ПРОБЛЕМЫ

### 1. ГИБРИДНЫЙ ПОДХОД (КРИТИЧНО)

**Проблема:** Многие компоненты используют одновременно старые и новые паттерны, создавая дублирование.

#### Пример 1: MainMenuContent.tsx ⚠️
```typescript
// СТАРЫЙ ПОДХОД (продолжает использоваться)
const { state, dispatch, peerId } = useGame();
const language: AppLanguage = state.language || 'en';
const permissions = state.playerPermissions;

// НОВЫЙ ПОДХОД (также используется)
const { viewTransform } = useViewTransform();
const activePlayerId = useActivePlayerId();
const isGM = useIsGM();
const players = usePlayerList();
```

**Проблема:** Дублирование данных:
- `state.language` vs `useLanguage()`
- `state.playerPermissions` vs `usePlayerPermissions()`
- `state.players` vs `usePlayerList()`
- `state.activePlayerId` vs `useActivePlayerId()`

#### Пример 2: LayersPanel.tsx ⚠️
```typescript
// СТАРЫЙ ПОДХОД (основной)
const { state, dispatch } = useGame();
const sortedLayers = [...state.hyperscaleLayers].sort((a, b) => b.maxZIndex - a.maxZIndex);
const isLayerSelected = (layerId: string) => state.selectedHyperscaleLayerIds.includes(layerId);

// НОВЫЙ ПОДХОД (только для GM проверки)
const isGM = useIsGM();
```

**Проблема:** Компонент импортирует новые контекты, но продолжает использовать старые паттерны для основной логики.

### 2. НЕПОЛНАЯ МИГРАЦИЯ (ВЫСОКИЙ ПРИОРИТЕТ)

**Компоненты, использующие старые паттерны:**

#### ❌ Стержневые компоненты (критично)
- **MainMenuContent.tsx** - 7 использований старых паттернов
- **Tabletop.tsx** - несколько использований
- **PoolTabletopOptimized.tsx** - используется state.players
- **UIObjectRendererOptimized.tsx** - используется state.players

#### ❌ Панели и модальные окна
- **LayersPanel.tsx** - 6 использований state.hyperscaleLayers
- **SearchDeckModal.tsx** - используется state.viewTransform
- **TopDeckModal.tsx** - используется state.viewTransform
- **PoolPanel.tsx** - неизвестно (требуется проверка)
- **TokensPanelOptimized.tsx** - неизвестно (требуется проверка)
- **HandPanelOptimized.tsx** - неизвестно (требуется проверка)
- **TableauPanel.tsx** - неизвестно (требуется проверка)

### 3. ДУБЛИРОВАНИЕ ЛОГИКИ (СРЕДНИЙ ПРИОРИТЕТ)

#### Проблема синхронизации данных
Существуют мосты синхронизации в PlayerContext и других контекстах, которые создают:

1. **Двойное состояние:** Данные существуют и в GameContext, и в новых контекстах
2. **Сложность поддержки:** Две системы вместо одной
3. **Потенциальные рассинхронизации:** Risk несогласованности данных

#### Пример из PlayerContext.tsx
```typescript
// МОСТ СИНХРОНИЗАЦИИ (временное решение)
useEffect(() => {
  // Синхронизация с GameContext для WebRTC
  if (gameDispatch) {
    gameDispatch({
      type: 'ADD_PLAYER',
      payload: newPlayer
    });
  }
}, [players]);
```

**Проблема:** Временные мосты создают сложность и должны быть удалены после полной миграции.

---

## ✅ УСПЕШНЫЕ МИГРАЦИИ

### Полностью мигрированные компоненты (4)

#### 1. ✅ ContextMenu.tsx
```typescript
// БЫЛО:
const sortedLayers = [...state.hyperscaleLayers].sort(...)

// СТАЛО:
const hyperscaleLayers = useHyperscaleLayers();
const sortedLayers = [...hyperscaleLayers].sort(...)
```

#### 2. ✅ HyperscaleLayerSettingsWindow.tsx
```typescript
// БЫЛО:
const hasOverlap = state.hyperscaleLayers.some(l => {...})

// СТАЛО:
const hyperscaleLayers = useHyperscaleLayers();
const hasOverlap = hyperscaleLayers.some(l => {...})
```

#### 3. ✅ ToolsPanel.tsx
```typescript
// БЫЛО:
const canConfigure = isHost || state.playerPermissions.configureObjects;

// СТАЛО:
const playerPermissions = usePlayerPermissions();
const canConfigure = isHost || playerPermissions.configureObjects;
```

#### 4. ✅ PanelSettingsModal.tsx
```typescript
// БЫЛО:
const currentPlayerId = state.activePlayerId;

// СТАЛО:
const activePlayerId = useActivePlayerId();
const currentPlayerId = activePlayerId;
```

---

## 📋 КОМПОНЕНТЫ, ТРЕБУЮЩИЕ МИГРАЦИИ

### 🔥 КРИТИЧЕСКИЕ (немедленная миграция)

1. **MainMenuContent.tsx**
   - 7 использований старых паттернов
   - Критически важный компонент
   - Требует полной миграции

2. **Tabletop.tsx**
   - Основной компонент игрового поля
   - Несколько использований старых паттернов
   - Влияние на производительность

3. **LayersPanel.tsx**
   - 6 использований `state.hyperscaleLayers`
   - Уже импортирует `useIsGM` из новых контекстов
   - Легкая миграция

### ⚠️ ВАЖНЫЕ (приоритетная миграция)

4. **UIObjectRendererOptimized.tsx**
   - Использует `state.players`
   - Влияние на производительность рендеринга

5. **PoolTabletopOptimized.tsx**
   - Использует `state.players`
   - Оптимизированный компонент

6. **SearchDeckModal.tsx**
   - Использует `state.viewTransform`
   - Импортирует `usePixelsPerVU` (частичная миграция)

7. **TopDeckModal.tsx**
   - Использует `state.viewTransform`
   - Импортирует `usePixelsPerVU` (частичная миграция)

### 📝 СРЕДНИЕ (плановая миграция)

8. **PoolPanel.tsx** - требуется анализ
9. **TokensPanelOptimized.tsx** - требуется анализ
10. **HandPanelOptimized.tsx** - требуется анализ
11. **TableauPanel.tsx** - требуется анализ

---

## 🎯 ПЛАН ДЕЙСТВИЙ

### ЭТАП 1: Критическая миграция (1-2 дня)
1. **MainMenuContent.tsx** - полная миграция
2. **Tabletop.tsx** - полная миграция
3. **LayersPanel.tsx** - завершение миграции

### ЭТАП 2: Важная миграция (1-2 дня)
4. **UIObjectRendererOptimized.tsx**
5. **PoolTabletopOptimized.tsx**
6. **SearchDeckModal.tsx**
7. **TopDeckModal.tsx**

### ЭТАП 3: Плановая миграция (1 день)
8. Анализ и миграция оставшихся компонентов
9. Удаление временных мостов синхронизации

### ЭТАП 4: Очистка (1 день)
10. Удаление старых reducer actions
11. Очистка неиспользуемого кода
12. Финальное тестирование

---

## 🚨 РИСКИ

### Высокие риски
- ⚠️ **Рассинхронизация данных:** Двойное состояние может привести к багам
- ⚠️ **Performance:** Дублирование данных увеличивает использование памяти
- ⚠️ **Сложность поддержки:** Две системы вместо одной

### Средние риски
- ⚠️ **WebRTC синхронизация:** Может требовать особого внимания
- ⚠️ **Save/Load функциональность:** Требует тщательного тестирования

---

## 📈 ПРОГНОЗ

### Текущий статус
- **Готовность:** ~30% (полная миграция)
- **Прогресс:** ~50% (включая частичную миграцию)
- **Осталось:** ~50% компонентов для миграции

### Оптимистичный сценарий
- **Время завершения:** 3-4 дня
- **Критические компоненты:** 2 дня
- **Остальные компоненты:** 1-2 дня

### Реалистичный сценарий
- **Время завершения:** 5-7 дней
- **С учетом тестирования:** 7-10 дней

---

## 🎯 КРИТЕРИИ УСПЕХА

### Полная миграция считается успешной, когда:
1. ✅ Ни один компонент не использует `state.players`, `state.activePlayerId`, `state.playerPermissions`
2. ✅ Ни один компонент не использует `state.viewTransform`
3. ✅ Ни один компонент не использует `state.language`, `state.hyperscaleLayers`, `state.selectedHyperscaleLayerIds`
4. ✅ Все временные мосты синхронизации удалены
5. ✅ Старые reducer actions удалены или标记ены как deprecated
6. ✅ Все тесты проходят успешно
7. ✅ WebRTC синхронизация работает корректно

---

## 📝 ЗАКЛЮЧЕНИЕ

**Текущее состояние:** ⚠️ **ЧАСТИЧНАЯ ИНТЕГРАЦИЯ**

**Прогресс:** ✅ **ХОРОШИЙ, НО ТРЕБУЕТ ЗАВЕРШЕНИЯ**

**Рекомендация:** Продолжить миграцию компонентов согласно плану действий, начиная с критических компонентов.

**Приоритет:** 🔥 **ВЫСОКИЙ** - завершить миграцию до Этапа 7 (Документация и cleanup)

---

*Аудит создан: 2026-04-16*
*Версия документа: 1.0.0*
*Следующий аудит: После завершения Этапа 6*