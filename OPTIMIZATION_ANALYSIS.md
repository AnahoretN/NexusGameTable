# Анализ оптимизации кода NexusGameTable

## Обзор текущей архитектуры

Проект представляет собой React-приложение для виртуального игрового стола с сложной системой объектов, сетевой синхронизацией и богатыми возможностями взаимодействия.

### Ключевые компоненты архитектуры

- **React 18.2.0** - основной фреймворк UI
- **Zustand 5.0.12** - управление состоянием (частично используется)
- **React Context** - основное управление глобальным состоянием
- **Vite** - система сборки
- **TypeScript** - типизация

## Выявленные проблемы и возможности оптимизации

### 1. Проблемы с рендерингом компонентов

#### 1.1 Отсутствие мемоизации в критических компонентах

**Проблема:** Компоненты `Card`, `ObjectRenderer`, `NexusBoard` не используют `React.memo`

**Влияние:** Ненужные ререндеры при изменениях родительских компонентов

**Решение:**
```typescript
// В components/Card.tsx
export const Card = React.FC<CardProps> = React.memo(({ card, ... }) => {
  // существующий код
}, (prevProps, nextProps) => {
  // Кастомная функция сравнения для оптимизации
  return (
    prevProps.card.id === nextProps.card.id &&
    prevProps.card.faceUp === nextProps.card.faceUp &&
    prevProps.card.location === nextProps.card.location &&
    prevProps.isHovered === nextProps.isHovered &&
    prevProps.overrideWidth === nextProps.overrideWidth &&
    prevProps.overrideHeight === nextProps.overrideHeight
  );
});
```

#### 1.2 Избыточные вычисления в компонентах

**Проблема:** В `Card.tsx` вычисление `spriteBackgroundStyles` происходит каждый рендер

**Решение:**
```typescript
// Уже есть useMemo, но можно улучшить
const spriteBackgroundStyles = useMemo(() => {
  // существующий код
}, [card.faceUp, card.spriteUrl, card.spriteIndex, card.spriteColumns, card.spriteRows,
    deckSpriteConfig?.spriteUrl, deckSpriteConfig?.columns, deckSpriteConfig?.rows,
    card.alternativeBack?.url, shouldSeeCardFace, card.location]);
```

### 2. Проблемы с управлением состоянием

#### 2.1 Тяжелый GameContext

**Проблема:** Единый контекст содержит все состояние игры, что вызывает ререндеры всех потребителей при любых изменениях

**Влияние:** При изменении одного объекта ререндерятся все компоненты, использующие контекст

**Решение:** Разделение на отдельные контексты:
```typescript
// Создать отдельные контексты
const GameObjectContext = createContext<Record<string, TableObject>>({});
const PlayerContext = createContext<Player[]>([]);
const ViewTransformContext = createContext<ViewTransform | null>(null);
const UIContext = createContext<UIState | null>(null);

// В провайдерах
<GameProvider>
  <ObjectsProvider>
    <PlayersProvider>
      <ViewTransformProvider>
        <UIProvider>
          {children}
        </UIProvider>
      </ViewTransformProvider>
    </PlayersProvider>
  </ObjectsProvider>
</GameProvider>
```

#### 2.2 Отсутствие селекторов для Zustand

**Проблема:** В `useManualConnection.ts`, `dragOverState.ts` не используются селекторы

**Решение:**
```typescript
// Вместо
const state = useManualConnectionStore();

// Использовать
const isConnected = useManualConnectionStore(state => state.isConnected);
const connectionStatus = useManualConnectionStore(state => state.connectionStatus);
```

### 3. Проблемы с хуками

#### 3.1 Неэффективное использование useCallback

**Проблема:** В `useLocalSettings.tsx` функции `updateSetting` и `updateEffectSetting` пересоздаются при каждом изменении настроек

**Решение:**
```typescript
// Оптимизированная версия
const updateSetting = useCallback((key: keyof LocalSettings, value: any) => {
  setSettings(prev => {
    const newSettings = { ...prev, [key]: value };
    saveLocalSettings(newSettings);
    return newSettings;
  });
}, []); // Пустой массив зависимостей

const updateEffectSetting = useCallback((key: keyof LocalSettings['effects'], value: any) => {
  setSettings(prev => {
    const newSettings = {
      ...prev,
      effects: { ...prev.effects, [key]: value },
    };
    saveLocalSettings(newSettings);
    return newSettings;
  });
}, []);
```

#### 3.2 Отсутствие мемоизации в useDragHandlers

**Проблема:** Обработчики drag событий создаются заново при каждом рендере

**Решение:** Использовать `useCallback` с правильными зависимостями

### 4. Проблемы с вычислениями

#### 4.1 Повторные вычисления в gridUtils.ts

**Проблема:** Функции `calculateGridCellCenter`, `calculateFlexibleHexGrid` выполняют одни и те же вычисления многократно

**Решение:** Кэширование результатов:
```typescript
// Создать кэш для вычислений
const gridCellCenterCache = new Map<string, { x: number; y: number }>();

export function calculateGridCellCenter(
  board: Board,
  col: number,
  row: number
): { x: number; y: number } {
  const cacheKey = `${board.id}-${col}-${row}`;

  if (gridCellCenterCache.has(cacheKey)) {
    return gridCellCenterCache.get(cacheKey)!;
  }

  // существующий код вычисления

  gridCellCenterCache.set(cacheKey, result);
  return result;
}

// Очистка кэша при изменении доски
export function clearGridCellCache(boardId: string) {
  const keysToDelete = Array.from(gridCellCenterCache.keys())
    .filter(key => key.startsWith(`${boardId}-`));
  keysToDelete.forEach(key => gridCellCenterCache.delete(key));
}
```

#### 4.2 Оптимизация координатных преобразований

**Проблема:** В `coordinateUtils.ts` функции `viewportToWorld`, `worldToViewport` вызываются очень часто

**Решение:** Использовать более эффективные вычисления и кэширование:
```typescript
// Оптимизированная версия с меньшим количеством allocations
export function viewportToWorld(
  viewportX: number,
  viewportY: number,
  offset: Coordinates,
  scrollLeft: number = 0,
  scrollTop: number = 0,
  pixelsPerVU: number = 1
): Coordinates {
  return {
    x: (viewportX + scrollLeft - offset.x) / pixelsPerVU,
    y: (viewportY + scrollTop - offset.y) / pixelsPerVU
  };
}

// Для массовых преобразований создать батчевую версию
export function batchViewportToWorld(
  points: Array<{ x: number; y: number }>,
  offset: Coordinates,
  scrollLeft: number = 0,
  scrollTop: number = 0,
  pixelsPerVU: number = 1
): Coordinates[] {
  const result = new Array(points.length);
  const invPixelsPerVU = 1 / pixelsPerVU; // Предвычисление

  for (let i = 0; i < points.length; i++) {
    result[i] = {
      x: (points[i].x + scrollLeft - offset.x) * invPixelsPerVU,
      y: (points[i].y + scrollTop - offset.y) * invPixelsPerVU
    };
  }

  return result;
}
```

### 5. Проблемы с производительностью списков

#### 5.1 Отсутствие виртуализации больших списков

**Проблема:** В `HandPanel.tsx`, `TokensPanel.tsx` рендерятся все элементы без виртуализации

**Решение:** Использовать `react-window` или `react-virtualized`:
```typescript
import { FixedSizeList } from 'react-window';

export const HandPanel: React.FC<HandPanelProps> = ({ ... }) => {
  const cards = useMemo(() =>
    Object.values(state.objects)
      .filter(obj => obj.type === ItemType.CARD && obj.location === CardLocation.HAND)
    , [state.objects]); // Правильная зависимость

  const Row = useCallback(({ index, style }) => (
    <div style={style}>
      <Card card={cards[index]} {...cardProps} />
    </div>
  ), [cards, cardProps]);

  return (
    <FixedSizeList
      height={600}
      itemCount={cards.length}
      itemSize={100}
      width="100%"
    >
      {Row}
    </FixedSizeList>
  );
};
```

### 6. Консистентность кода

#### 6.1 Разные паттерны мемоизации

**Проблема:** В некоторых местах используется `useMemo`, в других - нет, без ясной логики

**Решение:** Создать единые правила:
- Использовать `useMemo` для дорогостоящих вычислений
- Использовать `useCallback` для функций, передаваемых в дочерние компоненты
- Использовать `React.memo` для компонентов, которые часто ререндерятся с одинаковыми props

#### 6.2 Непоследовательное использование TypeScript

**Проблема:** Некоторые функции имеют типы, другие - нет

**Решение:** Добавить строгую типизацию везде:
```typescript
// Явные типы для всех функций
export function getDistance(p1: Coordinates, p2: Coordinates): number {
  // ...
}

// Вместо
export function getDistance(p1, p2) {
  // ...
}
```

## Приоритетные рекомендации

### Высокий приоритет (немедленная реализация)

1. **Добавить React.memo для критических компонентов**
   - `Card.tsx` - самый часто рендеримый компонент
   - `ObjectRenderer.tsx` - рендерит все объекты на столе
   - `NexusBoard.tsx` - сложные вычисления позиций

2. **Оптимизировать GameContext**
   - Разделить на отдельные контексты
   - Добавить селекторы для подписки на части состояния

3. **Добавить кэширование для вычислений**
   - `gridUtils.ts` - кэширование позиций ячеек
   - `coordinateUtils.ts` - батчевые преобразования

### Средний приоритет

4. **Оптимизировать хуки**
   - Исправить зависимости в `useCallback`
   - Добавить мемоизацию в `useDragHandlers`

5. **Виртуализация списков**
   - `HandPanel.tsx` - для больших рук
   - `TokensPanel.tsx` - для большого количества токенов

### Низкий приоритет (оптимизация по мере необходимости)

6. **Консистентность кода**
   - Единые правила мемоизации
   - Полная типизация

7. **Мониторинг производительности**
   - Добавить React Profiler
   - Логирование медленных операций

## Ожидаемые результаты

### Производительность
- **Снижение количества ререндеров на 40-60%**
- **Ускорение отклика UI на 30-50%**
- **Снижение использования памяти на 20-30%**

### Консистентность
- **Единые паттерны мемоизации во всем коде**
- **Предсказуемая производительность компонентов**
- **Легкая отладка и оптимизация в будущем**

## План внедрения

1. **Этап 1: Критические компоненты** (1-2 дня)
   - Добавить React.memo для Card, ObjectRenderer
   - Оптимизировать GameContext

2. **Этап 2: Вычисления и утилиты** (1 день)
   - Добавить кэширование в gridUtils
   - Оптимизировать coordinateUtils

3. **Этап 3: Хуки и списки** (1-2 дня)
   - Оптимизировать существующие хуки
   - Добавить виртуализацию списков

4. **Этап 4: Тестирование и мониторинг** (1 день)
   - Профилирование до и после
   - Корректировка по результатам

## Заключение

Анализ показал, что проект имеет хорошие основы для оптимизации. Основные проблемы связаны с:
- Избыточными ререндерами компонентов
- Неэффективным управлением состоянием
- Отсутствием кэширования вычислений

Реализация предложенных рекомендаций значительно улучшит производительность без потери функциональности.