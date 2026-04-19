# План рефакторинга Tabletop.tsx
## Разбивка на подкомпоненты + мемоизация

**Текущее состояние:** 8,347 строк, 374KB  
**Целевое состояние:** ~500 строк в основном компоненте + 8 специализированных компонентов

---

## 🎯 Цели рефакторинга

1. **Улучшение читаемости** - разбить монолитный компонент на логические части
2. **Оптимизация производительности** - внедрить мемоизацию для предотвращения лишних ререндеров
3. **Упрощение тестирования** - создать независимые тестируемые модули
4. **Переиспользуемость** - выделить универсальные компоненты
5. **Улучшение поддерживаемости** - проще находить и исправлять баги

---

## 📊 Анализ текущей структуры

### Выявленные функциональные области:
- **Cursor Slot Management** (~600 строк) - drag/drop логика
- **Remote Objects Rendering** (~400 строк) - мультиплеер синхронизация
- **Game Objects Rendering** (~1200 строк) - карточки, токены, dice
- **UI Objects Rendering** (~800 строк) - панели, окна, decks
- **Event Handling** (~1000 строк) - mouse, keyboard, context menus
- **Background & Grid** (~200 строк) - визуальное окружение
- **Modals & Dialogs** (~300 строк) - всплывающие окна
- **Custom Hooks & Utils** (~400 строк) - оптимизации и хелперы

---

## 🔄 Этапы рефакторинга

### ЭТАП 1: Подготовка и анализ (1-2 часа)

#### 1.1 Создать резервную копию
```bash
git checkout -b refactor/tabletop-component-breakdown
git commit -am "backup: before Tabletop.tsx refactoring"
```

#### 1.2 Детальный анализ зависимостей
- [ ] Проанализировать все импорты и зависимости
- [ ] Выявить shared state и props flow
- [ ] Определить критические для производительности участки
- [ ] Создать map зависимостей между компонентами

#### 1.3 Подготовить структуру директорий
```
components/
  ├── Tabletop/
  │   ├── Tabletop.tsx              # Основной компонент
  │   ├── TabletopBackground.tsx    # Фон и сетка
  │   ├── RemoteObjectsRenderer.tsx # Удаленные объекты
  │   ├── GameObjectsRenderer.tsx   # Игровые объекты
  │   ├── UIObjectsRenderer.tsx     # UI элементы
  │   ├── TabletopCursorSlot.tsx    # Cursor slot логика
  │   ├── TabletopEventHandlers.tsx # Event обработчики
  │   ├── TabletopHooks.tsx         # Кастомные хуки
  │   └── TabletopModals.tsx        # Модальные окна
  ├── Card.tsx
  └── ... (остальные компоненты)
```

---

### ЭТАП 2: Создание инфраструктуры (2-3 часа)

#### 2.1 Создать TabletopHooks.ts
**Цель:** Вынести все кастомные хуки и оптимизации

```typescript
// hooks/useTabletopPositioning.ts
export const useTabletopPositioning = (viewTransform, localSettings) => {
  const pixelsPerVU = useMemo(() => /* ... */, []);
  const v2p = useCallback((vu: number) => /* ... */, [pixelsPerVU]);
  const p2v = useCallback((px: number) => /* ... */, [pixelsPerVU]);
  
  return { pixelsPerVU, v2p, p2v };
};

// hooks/useLayerZoom.ts
export const useLayerZoom = (zoomMultiplier, hyperscaleLayers) => {
  const getLayerZoomScale = useCallback((layerId: string) => /* ... */, []);
  const getLayerInverseScale = useCallback((layerId: string) => /* ... */, []);
  const createPositionedStyle = useCallback((...) => /* ... */, []);
  
  return { getLayerZoomScale, getLayerInverseScale, createPositionedStyle };
};

// hooks/useObjectFilters.ts
export const useObjectFilters = (state, hyperscaleLayers) => {
  const tableObjects = useMemo(() => /* ... */, []);
  const visibleTableObjects = useMemo(() => /* ... */, []);
  const remoteCursorSlotObjects = useMemo(() => /* ... */, []);
  // ... остальные фильтры
  
  return {
    tableObjects,
    visibleTableObjects,
    remoteCursorSlotObjects,
    // ...
  };
};
```

**Мемоизация:** Все хуки уже используют useMemo/useCallback

#### 2.2 Создать базовые типы и интерфейсы
```typescript
// types/tabletop.ts
export interface TabletopRenderContext {
  pixelsPerVU: number;
  v2p: (vu: number) => number;
  p2v: (px: number) => number;
  getLayerZoomScale: (layerId: string) => number;
  createPositionedStyle: (...) => React.CSSProperties;
}

export interface ObjectRenderProps {
  obj: TableObject;
  context: TabletopRenderContext;
  onContextMenu?: (e: React.MouseEvent, obj: TableObject) => void;
}
```

---

### ЭТАП 3: Выделение простых компонентов (3-4 часа)

#### 3.1 TabletopBackground.tsx
**Ответственность:** Фон, сетка, измерительные инструменты

```typescript
import React, { memo } from 'react';

interface TabletopBackgroundProps {
  worldBounds: { width: number; height: number };
  rulerStart: { x: number; y: number } | null;
  rulerCurrent: { x: number; y: number } | null;
  isRulerRightClick: boolean;
  v2p: (vu: number) => number;
}

export const TabletopBackground = memo<TabletopBackgroundProps>(({ 
  worldBounds, 
  rulerStart, 
  rulerCurrent, 
  isRulerRightClick,
  v2p 
}) => {
  return (
    <>
      {/* Solid background */}
      <div style={{ /* ... */ }} />
      
      {/* Grid pattern */}
      <div style={{ /* ... */ }} />
      
      {/* Ruler SVG */}
      {rulerStart && rulerCurrent && (
        <svg>{/* Ruler rendering */}</svg>
      )}
    </>
  );
});

TabletopBackground.displayName = 'TabletopBackground';
```

**Мемоизация:** React.memo prevents re-renders when ruler state doesn't change

#### 3.2 RemoteObjectsRenderer.tsx
**Ответственность:** Рендеринг удаленных объектов

```typescript
import React, { memo } from 'react';
import { SvgTokenShape } from './SvgTokenShape';
import { Card } from './Card';

export const RemoteObjectsRenderer = memo<{
  remoteCursorSlotObjects: TableObject[];
  remoteDraggingObjects: TableObject[];
  v2p: (vu: number) => number;
  state: any;
}>(({ remoteCursorSlotObjects, remoteDraggingObjects, v2p, state }) => {
  const renderRemoteObject = (obj: TableObject, globalZIndex: number, keyPrefix: string) => {
    // Рендеринг удаленного объекта
  };

  return (
    <>
      {remoteCursorSlotObjects.map(obj => renderRemoteObject(obj, 999997, 'remote-cursor'))}
      {remoteDraggingObjects.map(obj => renderRemoteObject(obj, 999999, 'remote-drag'))}
    </>
  );
});
```

**Мемоизация:** React.memo + отдельные мемоизированные подкомпоненты для каждого типа объекта

---

### ЭТАП 4: Выделение сложных рендеров (4-5 часов)

#### 4.1 GameObjectsRenderer.tsx
**Ответственность:** Основные игровые объекты

```typescript
import React, { memo } from 'react';
import { Card } from './Card';
import { SvgTokenShape } from './SvgTokenShape';
import { NexusBoardMemo } from './NexusBoard';
import { BoardWithResizeMemo } from './Tabletop/BoardWithResize';

// Мемоизированные подкомпоненты
const TokenRenderer = memo<{ token: TokenType; v2p: Function; /* ... */ }>(
  ({ token, v2p, ... }) => {
    return <SvgTokenShape /* ... */ />;
  }
);

const CardRenderer = memo<{ card: CardType; v2p: Function; state: any }>(
  ({ card, v2p, state }) => {
    const deck = card.deckId ? state.objects[card.deckId] : undefined;
    return <Card card={card} /* ... */ />;
  }
);

const DiceRenderer = memo<{ dice: DiceObject; v2p: Function }>(
  ({ dice, v2p }) => {
    // Dice rendering logic
  }
);

export const GameObjectsRenderer = memo<{
  visibleTableObjects: TableObject[];
  v2p: (vu: number) => number;
  state: any;
  getLayerZoomScale: (layerId: string) => number;
  onContextMenu: (e: React.MouseEvent, obj: TableObject) => void;
  // ... другие props
}>(({ visibleTableObjects, v2p, state, getLayerZoomScale, onContextMenu }) => {
  return (
    <>
      {visibleTableObjects.map(obj => {
        switch (obj.type) {
          case ItemType.TOKEN:
            return <TokenRenderer key={obj.id} token={obj as TokenType} v2p={v2p} />;
          case ItemType.CARD:
            return <CardRenderer key={obj.id} card={obj as CardType} v2p={v2p} state={state} />;
          case ItemType.DICE:
            return <DiceRenderer key={obj.id} dice={obj as DiceObject} v2p={v2p} />;
          case ItemType.BOARD:
            return <BoardWithResizeMemo key={obj.id} board={obj as Board} />;
          case ItemType.NEXUS_BOARD:
            return <NexusBoardMemo key={obj.id} board={obj as NexusBoard} />;
          default:
            return null;
        }
      })}
    </>
  );
});
```

**Мемоизация:**
- React.memo для основного компонента
- Отдельные memo подкомпоненты для каждого типа объекта
- Оптимизация пропсов с useCallback в родителе

#### 4.2 UIObjectsRenderer.tsx
**Ответственность:** UI элементы - панели, окна, decks

```typescript
import React, { memo } from 'react';
import { DeckComponent } from './DeckComponent';
import { UIObjectRendererMemo } from './UIObjectRendererOptimized';
import { PinnedIndicator } from './PinnedIndicator';

const PinnedDeckRenderer = memo<{ deck: DeckType; v2p: Function }>(
  ({ deck, v2p }) => {
    return (
      <div style={{ position: 'fixed', /* ... */ }}>
        <PinnedIndicator />
        <DeckComponent deck={deck} />
      </div>
    );
  }
);

const PanelRenderer = memo<{ panel: PanelObject; state: any }>(
  ({ panel, state }) => {
    // Panel rendering logic
  }
);

export const UIObjectsRenderer = memo<{
  pinnedUIObjects: TableObject[];
  unpinnedUIObjects: TableObject[];
  pinnedDecks: DeckType[];
  unpinnedDecks: DeckType[];
  v2p: (vu: number) => number;
  state: any;
}>(({ pinnedUIObjects, unpinnedUIObjects, pinnedDecks, unpinnedDecks, v2p, state }) => {
  return (
    <>
      {/* Pinned UI - fixed position */}
      {pinnedUIObjects.map(obj => (
        <PanelRenderer key={`pinned-${obj.id}`} panel={obj as PanelObject} state={state} />
      ))}
      
      {/* Pinned Decks */}
      {pinnedDecks.map(deck => (
        <PinnedDeckRenderer key={`pinned-deck-${deck.id}`} deck={deck} v2p={v2p} />
      ))}
      
      {/* Unpinned UI - transformed position */}
      {unpinnedUIObjects.map(obj => (
        <PanelRenderer key={obj.id} panel={obj as PanelObject} state={state} />
      ))}
      
      {/* Unpinned Decks */}
      {unpinnedDecks.map(deck => (
        <DeckComponent key={deck.id} deck={deck} />
      ))}
    </>
  );
});
```

**Мемоизация:** Аналогично GameObjectsRenderer

---

### ЭТАП 5: Выделение логики (5-6 часов)

#### 5.1 TabletopCursorSlot.tsx
**Ответственность:** Cursor slot логика и визуализация

```typescript
import React, { memo, useCallback } from 'react';
import { CursorSlotVisualization } from './CursorSlotVisualization';

export const TabletopCursorSlot = memo<{
  cursorSlot: (CardType | TokenType | BoardType)[];
  currentTool: string;
  isShiftPressed: boolean;
  v2p: (vu: number) => number;
  onClearCursorSlot: () => void;
  onMouseMove: (e: MouseEvent) => void;
  onMouseUp: (e: MouseEvent) => void;
}>(({ 
  cursorSlot, 
  currentTool, 
  isShiftPressed,
  v2p,
  onClearCursorSlot,
  onMouseMove,
  onMouseUp 
}) => {
  // Cursor slot логика
  const handleDrop = useCallback((clientX: number, clientY: number) => {
    // Drop логика
  }, [cursorSlot]);

  return (
    <>
      {cursorSlot.length > 0 && (
        <CursorSlotVisualization
          items={cursorSlot}
          v2p={v2p}
          currentTool={currentTool}
          isShiftPressed={isShiftPressed}
        />
      )}
    </>
  );
});
```

#### 5.2 TabletopEventHandlers.tsx
**Ответственность:** Event обработчики (не рендерит UI)

```typescript
import React, { useEffect, useCallback } from 'react';

export const useTabletopEventHandlers = (dependencies: {
  state: any;
  dispatch: Function;
  cursorSlot: any[];
  currentTool: string;
  // ... остальные зависимости
}) => {
  const { state, dispatch, cursorSlot, currentTool } = dependencies;

  // Mouse handlers
  const handleMouseDown = useCallback((e: React.MouseEvent, id?: string) => {
    // Mouse down логика
  }, [state, cursorSlot, currentTool]);

  const handleMouseMove = useCallback((e: MouseEvent | React.MouseEvent) => {
    // Mouse move логика
  }, [state, cursorSlot]);

  const handleMouseUp = useCallback((e?: MouseEvent | React.MouseEvent) => {
    // Mouse up логика
  }, [state, cursorSlot]);

  // Keyboard handlers
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Keyboard логика
  }, [currentTool, cursorSlot]);

  // Context menu
  const handleContextMenu = useCallback((e: React.MouseEvent, obj: TableObject) => {
    // Context menu логика
  }, [state]);

  // Effects
  useEffect(() => {
    window.addEventListener('mousedown', handleGlobalMouseDown);
    window.addEventListener('keydown', handleKeyDown);
    // ... остальные listeners

    return () => {
      window.removeEventListener('mousedown', handleGlobalMouseDown);
      window.removeEventListener('keydown', handleKeyDown);
      // ... cleanup
    };
  }, [handleMouseDown, handleKeyDown]);

  return {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleContextMenu,
    // ... остальные handlers
  };
};
```

**Мемоизация:** Все handlers обернуты в useCallback для стабильности ссылок

---

### ЭТАП 6: Модальные окна (2-3 часа)

#### 6.1 TabletopModals.tsx
**Ответственность:** Все модальные окна

```typescript
import React, { memo } from 'react';
import { ContextMenu } from './ContextMenu';
import { ObjectSettingsModal } from './ObjectSettingsModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { SearchDeckModal } from './SearchDeckModal';
import { TopDeckModal } from './TopDeckModal';

export const TabletopModals = memo<{
  contextMenuState: any;
  settingsModalState: any;
  deleteModalState: any;
  searchDeckModalState: any;
  topDeckModalState: any;
  onCloseContextMenu: () => void;
  onCloseSettingsModal: () => void;
  // ... остальные props
}>(({
  contextMenuState,
  settingsModalState,
  deleteModalState,
  searchDeckModalState,
  topDeckModalState,
  onCloseContextMenu,
  onCloseSettingsModal,
  // ... остальные props
}) => {
  return (
    <>
      {contextMenuState.visible && (
        <ContextMenu
          x={contextMenuState.x}
          y={contextMenuState.y}
          actions={contextMenuState.actions}
          onClose={onCloseContextMenu}
        />
      )}

      {settingsModalState.visible && (
        <ObjectSettingsModal
          object={settingsModalState.object}
          onClose={onCloseSettingsModal}
        />
      )}

      {/* ... остальные модалки */}
    </>
  );
});
```

**Мемоизация:** React.memo предотвращает ререндеры когда модалки закрыты

---

### ЭТАП 7: Сборка основного компонента (2-3 часа)

#### 7.1 Обновленный Tabletop.tsx

```typescript
import React, { FC, useState, useRef } from 'react';
import { useGame } from '../store/GameContext';
import { useTabletopPositioning } from './TabletopHooks/useTabletopPositioning';
import { useObjectFilters } from './TabletopHooks/useObjectFilters';
import { useTabletopEventHandlers } from './TabletopEventHandlers';
import { TabletopBackground } from './TabletopBackground';
import { RemoteObjectsRenderer } from './RemoteObjectsRenderer';
import { GameObjectsRenderer } from './GameObjectsRenderer';
import { UIObjectsRenderer } from './UIObjectsRenderer';
import { TabletopCursorSlot } from './TabletopCursorSlot';
import { TabletopModals } from './TabletopModals';

export const Tabletop: FC = () => {
  const { state, dispatch, isHost } = useGame();
  const { viewTransform } = useViewTransform();
  const { settings: localSettings, updateSetting } = useLocalSettings();
  
  // Кастомные хуки
  const { pixelsPerVU, v2p, p2v } = useTabletopPositioning(viewTransform, localSettings);
  const {
    tableObjects,
    visibleTableObjects,
    remoteCursorSlotObjects,
    remoteDraggingObjects,
    pinnedUIObjects,
    unpinnedUIObjects,
    pinnedDecks,
    unpinnedDecks
  } = useObjectFilters(state, hyperscaleLayers);
  
  // Event handlers
  const {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleContextMenu,
    handleWheel
  } = useTabletopEventHandlers({
    state,
    dispatch,
    cursorSlot,
    currentTool,
    // ... остальные зависимости
  });

  // Local state
  const [contextMenuState, setContextMenuState] = useState({ visible: false, x: 0, y: 0 });
  const [rulerStart, setRulerStart] = useState<{ x: number; y: number } | null>(null);
  const [rulerCurrent, setRulerCurrent] = useState<{ x: number; y: number } | null>(null);

  return (
    <div
      ref={scrollContainerRef}
      data-tabletop="true"
      className="w-full h-full overflow-auto relative"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onWheel={handleWheel}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Background */}
      <TabletopBackground
        worldBounds={worldBounds}
        rulerStart={rulerStart}
        rulerCurrent={rulerCurrent}
        isRulerRightClick={isRulerRightClick}
        v2p={v2p}
      />

      {/* Game Objects */}
      <GameObjectsRenderer
        visibleTableObjects={visibleTableObjects}
        v2p={v2p}
        state={state}
        getLayerZoomScale={getLayerZoomScale}
        onContextMenu={handleContextMenu}
      />

      {/* Remote Objects */}
      <RemoteObjectsRenderer
        remoteCursorSlotObjects={remoteCursorSlotObjects}
        remoteDraggingObjects={remoteDraggingObjects}
        v2p={v2p}
        state={state}
      />

      {/* UI Objects */}
      <UIObjectsRenderer
        pinnedUIObjects={pinnedUIObjects}
        unpinnedUIObjects={unpinnedUIObjects}
        pinnedDecks={pinnedDecks}
        unpinnedDecks={unpinnedDecks}
        v2p={v2p}
        state={state}
      />

      {/* Cursor Slot */}
      <TabletopCursorSlot
        cursorSlot={cursorSlot}
        currentTool={currentTool}
        isShiftPressed={isShiftPressed}
        v2p={v2p}
        onClearCursorSlot={clearCursorSlot}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      />

      {/* Modals */}
      <TabletopModals
        contextMenuState={contextMenuState}
        settingsModalState={settingsModalState}
        deleteModalState={deleteModalState}
        searchDeckModalState={searchDeckModalState}
        topDeckModalState={topDeckModalState}
        onCloseContextMenu={() => setContextMenuState({ visible: false, x: 0, y: 0 })}
        onCloseSettingsModal={() => setSettingsModalState({ visible: false, object: null })}
        // ... остальные handlers
      />
    </div>
  );
};
```

**Результат:** Основной компонент сократился с 8,347 до ~500 строк

---

### ЭТАП 8: Мемоизация и оптимизация (3-4 часа)

#### 8.1 Оптимизация пропсов
```typescript
// В Tabletop.tsx
const handleContextMenu = useCallback((e: React.MouseEvent, obj: TableObject) => {
  e.preventDefault();
  e.stopPropagation();
  setContextMenuState({
    visible: true,
    x: e.clientX,
    y: e.clientY,
    actions: getContextActions(obj)
  });
}, [state]); // Правильные зависимости

const handleWheel = useCallback((e: React.WheelEvent) => {
  // Wheel логика
}, [viewTransform, dispatch]);
```

#### 8.2 Мемоизация тяжелых вычислений
```typescript
// В useObjectFilters hook
const visibleTableObjects = useMemo(() => {
  return filterVisibleObjects(
    tableObjects,
    calculateViewportBounds(viewTransform, containerSize),
    { maxObjects: 1000 }
  );
}, [tableObjects, viewTransform, containerSize]);
```

#### 8.3 React.memo для всех компонентов
```typescript
// Каждый новый компонент должен быть обернут в React.memo
export const GameObjectsRenderer = memo<GameObjectsRendererProps>(
  ({ visibleTableObjects, v2p, state, getLayerZoomScale, onContextMenu }) => {
    // rendering logic
  },
  (prevProps, nextProps) => {
    // Custom comparison для оптимизации
    return (
      prevProps.visibleTableObjects === nextProps.visibleTableObjects &&
      prevProps.v2p === nextProps.v2p &&
      prevProps.state === nextProps.state
    );
  }
);
```

---

### ЭТАП 9: Тестирование и отладка (4-5 часов)

#### 9.1 Функциональное тестирование
- [ ] Drag & drop операций
- [ ] Мультиплеер синхронизации
- [ ] Cursor slot логики
- [ ] Context menus
- [ ] Модальных окон
- [ ] Zoom/pan функций
- [ ] Grid snapping
- [ ] 所有 типов объектов

#### 9.2 Performance тестирование
- [ ] Замерить время рендеринга с React DevTools
- [ ] Проверить количество re-renders с why-did-you-render
- [ ] Профилировать память с Chrome DevTools
- [ ] Сравнить метрики до/после рефакторинга

#### 9.3 Регрессионное тестирование
- [ ] Убедиться что все функции работают как раньше
- [ ] Проверить edge cases (пустой state, большие списки, etc)
- [ ] Тестирование с различными размерами экранов

---

### ЭТАП 10: Документация и финализация (1-2 часа)

#### 10.1 Обновить импорты
```typescript
// Убедиться что все импорты обновлены
import { Tabletop } from './Tabletop';
// Вместо старого импорта если он был в другом месте
```

#### 10.2 Добавить JSDoc комментарии
```typescript
/**
 * Tabletop - main game board component
 * Coordinates rendering of game objects, UI elements, and handles user interactions
 */
export const Tabletop: FC = () => {
  // ...
};
```

#### 10.3 Обновить PERFORMANCE_STATUS.md
```markdown
## Component Optimization Status

- ✅ Tabletop.tsx - Refactored into 8 components (8,347 → 500 lines)
- ✅ Memoization implemented for all renderers
- ✅ Custom hooks extracted for better performance
```

---

## 📈 Ожидаемые результаты

### Метрики производительности:
- **Время рендеринга:** -30-40% (за счет мемоизации)
- **Размер компонента:** -94% (8,347 → 500 строк)
- **Переиспользуемость:** +8 новых компонентов
- **Тестируемость:** +100% (возможность тестировать отдельные части)

### Качество кода:
- **Читаемость:** Значительно улучшена
- **Поддерживаемость:** Упрощена поиск и исправление багов
- **Масштабируемость:** Легче добавлять новую функциональность

---

## ⚠️ Риски и митигация

### Потенциальные проблемы:
1. **Проблемы с зависимостями** - Митигация: тщательный анализ зависимостей на этапе 1
2. **Потеря производительности** - Митигация: профилирование на каждом этапе
3. **Введение багов** - Митигация: поэтапное тестирование
4. **Сложность рефакторинга** - Митигация: работаем по веткам, frequent commits

### Rollback стратегия:
```bash
# Если что-то пошло не так
git checkout main
git branch -D refactor/tabletop-component-breakdown
```

---

## 📋 Чек-лист завершения

### Структурные изменения:
- [ ] Все компоненты созданы в `components/Tabletop/`
- [ ] Основной Tabletop.tsx сокращен до ~500 строк
- [ ] Все импорты обновлены
- [ ] Типы TypeScript экспортированы

### Мемоизация:
- [ ] Все компоненты обернуты в React.memo
- [ ] Все handlers используют useCallback
- [ ] Тяжелые вычисления в useMemo
- [ ] Custom comparison функции где нужны

### Тестирование:
- [ ] Все функции работают как раньше
- [ ] Производительность не ухудшилась
- [ ] Нет console ошибок
- [ ] Мультиплеер работает корректно

### Документация:
- [ ] JSDoc комментарии добавлены
- [ ] PERFORMANCE_STATUS.md обновлен
- [ ] Этот документ выполнен

---

## 🚀 Following Steps

После завершения рефакторинга:
1. Замерить и задокументировать улучшения производительности
2. Создать PR с подробным описанием изменений
3. Request code review от команды
4. Merge в main после одобрения

**Total Estimated Time:** 25-35 часов  
**Recommended Sprint:** 2-3 недели при работе part-time