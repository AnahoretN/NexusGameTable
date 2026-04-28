# NexusGameTable - Руководство для разработчиков

Версия: 0.2.0

## 📊 Knowledge Graph

Проект имеет интегрированную систему **graphify knowledge graph**, которая отражает архитектуру, связи компонентов и документацию.

```bash
# Перед изучением архитектуры прочитайте:
graphify-out/GRAPH_REPORT.md

# Для запросов к графу:
graphify query "ваш вопрос" --graph graphify-out/graph.json
```

**Метрики графа:**
- **1613 узлов** (функции, компоненты, концепции)
- **3230 рёбер** (связи, вызовы, импорты)
- **136 сообществ** (логические группы)

---

## Архитектура приложения

### Стек технологий

```
React 18.x + TypeScript
├── Vite (сборка)
├── PeerJS + Trystero (WebRTC мультиплеер с fallback)
├── Zustand (state management)
├── Lucide React (иконки)
└── CSS Modules (стили)
```

### Структура проекта (v0.2.0)

```
NexusGameTable/
├── components/
│   ├── Tabletop/              # Рефакторинг основной игровой стол
│   │   ├── TabletopBackground.tsx      # Рендеринг фона
│   │   ├── TabletopEventHandlers.tsx   # Обработка событий
│   │   ├── TabletopRefactored.tsx      # Ядро с smart z-index
│   │   └── index.tsx                   # Экспорт модуля
│   ├── CharacterBlocks/       # Блоки персонажей
│   │   ├── AvatarBlock.tsx
│   │   ├── CounterBlock.tsx
│   │   ├── InventoryBlock.tsx
│   │   └── ...
│   ├── contextMenu/           # Контекстные меню
│   │   ├── ContextMenu.tsx
│   │   ├── ObjectManagementMenu.tsx
│   │   └── index.ts
│   ├── ObjectSettings/        # Настройки объектов
│   │   ├── ObjectSettingsModal.tsx
│   │   └── ...
│   ├── TabletopComponent.tsx  # Главный компонент стола
│   ├── MainMenuContent.tsx    # Главное меню
│   ├── ToolsPanel.tsx         # Панель инструментов
│   ├── UIObjectRendererOptimized.tsx  # Рендеринг объектов
│   └── ...
├── store/
│   ├── contexts/              # React Context провайдеры
│   │   ├── GameContext.tsx
│   │   ├── PlayerContext.tsx
│   │   ├── UIContext.tsx
│   │   └── ViewTransformContext.tsx
│   ├── objectStore.ts         # Zustand store для объектов
│   ├── usePeerConnection.ts   # WebRTC с fallback сигналингом
│   ├── useFallbackSignaling.ts # Fallback менеджер
│   └── reducers/              # Redux Toolkit редьюсеры
├── hooks/
│   ├── useDragHandlers.ts     # Drag & Drop
│   ├── useGridSnapping.ts     # Привязка к сетке
│   └── useObjectPinning.ts    # Закрепление объектов
├── utils/
│   ├── geometryUtils.ts       # Геометрические расчёты
│   ├── fallbackSignaling.ts   # Fallback сигналинг
│   ├── coordinateUtils.ts     # Координатные преобразования
│   └── logger.ts              # Система логирования
├── locales/                   # Переводы
│   ├── en.json
│   ├── ru.json
│   ├── be.json
│   ├── sr.json
│   └── uk.json
└── types.ts                   # TypeScript типы
```

---

## Ключевые сообщества (из графа)

| Сообщество | Описание |
|------------|----------|
| **Tabletop Component** | Основной игровой стол |
| **WebRTC Networking** | P2P соединения |
| **Grid & Snapping System** | Сетка и привязка |
| **Object Actions** | Действия над объектами |
| **Performance & Monitoring** | FPS и производительность |
| **React Context Providers** | State management |
| **Storage & Image Cache** | Хранилище и кеш |

---

## Система состояний

### Context Architecture (v0.2.0)

```typescript
// Иерархия провайдеров
<LocalSettingsProvider>
  <UIProvider>              // Language (local), Layers (synced)
    <ViewTransformProvider>  // Camera (local, NO sync)
      <PlayerProvider>        // Players (synced)
        <GameProvider>        // Game objects (synced)
          <WebRTCIntegration> // Manages sync between contexts
            <App />
```

### Zustand ObjectStore

```typescript
// Оптимизированный доступ к объектам
import { useObjectsData, useObjectActions } from './store/objectStore';

const objects = useObjectsData();           // Read-only, stable
const { updateObject, deleteObject } = useObjectActions(); // Actions, stable
```

---

## WebRTC Fallback Signaling

**Система автоматического переключения между методами сигналинга:**

1. **PeerJS Cloud Servers** (основной)
   - `0.peerjs.com`, `1.peerjs.com`, `2.peerjs.com`

2. **Community Servers** (self-hosted)
   - Добавляются в `COMMUNITY_SERVERS` в `usePeerConnection.ts`

3. **Trystero Torrent Trackers** (fallback)
   - `wss://tracker.btorrent.xyz`
   - `wss://tracker.openwebtorrent.com`

### Диагностика

```javascript
// В консоли браузера
nexusP2PDebug.getDiagnostics();
```

---

## Система логирования

Централизованная система логирования:

```typescript
import { logger } from './utils/logger';

logger.log('Сообщение', data);
logger.error('Ошибка', error);
logger.warn('Предупреждение');
logger.debug('Отладочная информация');
```

**Мониторинг производительности:**
- FPS трекинг
- Использование памяти
- Счётчик рендеров

---

## Новые функции v0.2.0

### Альтернативные значения кубиков

```typescript
// Настройка кастомных значений для граней
interface DiceObject {
  sides: number;
  alternativeValues?: number[];  // Кастомные значения
  currentValue: number;
}
```

### Настройка шага линейки

```typescript
// В настройках инструмента "Линейка"
rulerStepSize: number;  // Шаг измерения
snapToStep: boolean;    // Привязка к шагу
```

---

## Оптимизация производительности

### React.memo

```typescript
export const MyComponent = React.memo<MyComponentProps>(
  ({ prop1, prop2 }) => {
    // Рендеринг
  },
  (prevProps, nextProps) => {
    return prevProps.prop1 === nextProps.prop1
  }
)
```

### useCallback/useMemo

```typescript
const handleClick = useCallback((id: string) => {
  dispatch({ type: 'SOME_ACTION', payload: { id } })
}, [dispatch])

const sortedObjects = useMemo(() => {
  return Object.values(objects).sort((a, b) => a.zIndex - b.zIndex)
}, [objects])
```

---

## Создание нового объекта

### 1. Добавьте тип в types.ts

```typescript
export enum ItemType {
  TOKEN = 'token',
  CARD = 'card',
  MY_NEW_TYPE = 'my_new_type'
}

export interface MyNewType extends GameItem {
  type: ItemType.MY_NEW_TYPE
  customProperty: string
}
```

### 2. Добавьте редьюсер

```typescript
// store/gameReducer.ts
case 'CUSTOM_ACTION': {
  const obj = state.objects[action.payload.id]
  if (!obj || obj.type !== ItemType.MY_NEW_TYPE) return state
  return {
    ...state,
    objects: {
      ...state.objects,
      [action.payload.id]: { ...obj, customProperty: action.payload.value }
    }
  }
}
```

### 3. Создайте компонент рендеринга

```typescript
// components/MyNewTypeRenderer.tsx
export const MyNewTypeRenderer: React.FC<{ obj: MyNewType }> = ({ obj }) => {
  return (
    <div style={{ position: 'absolute', left: obj.x, top: obj.y }}>
      {/* Рендеринг */}
    </div>
  )
}
```

---

## Добавление действия в контекстное меню

### 1. Определите действие

```typescript
export type ContextAction =
  | 'flip' | 'clone' | 'delete'
  | 'my_custom_action'
```

### 2. Обработайте в ContextMenu

```typescript
case 'my_custom_action':
  dispatch({ type: 'CUSTOM_ACTION', payload: { id: object.id } })
  break
```

---

## Работа с мультиплеером

### Локальные действия

```typescript
dispatch({
  type: 'UPDATE_VIEW_TRANSFORM',
  payload: { zoom: 1.5 },
  _localOnly: true  // Не отправлять по сети
})
```

### Фильтрация при трансляции

```typescript
const stateForBroadcast = {
  ...state,
  objects: Object.entries(state.objects)
    .filter(([id, obj]) =>
      !(obj.type === ItemType.WINDOW && obj.ownerId)
    )
};
```

---

## Константы

### Размеры объектов

```typescript
CARD_WIDTH = 120
CARD_HEIGHT = 168
TOKEN_SIZE = 80
DEFAULT_DICE_SIZE = 60
```

### Z-index

```typescript
Z_INDEX_BOARD = -100
Z_INDEX_DECK = 0
Z_INDEX_PANEL = 1000
Z_INDEX_WINDOW = 10000
Z_INDEX_DRAGGING = 9999
```

---

## Горячие клавиши

| Клавиша | Действие |
|---------|----------|
| Shift + Click | Курсор-слот |
| Правый клик | Контекстное меню |
| Колёсико | Масштаб |
| Space + Drag | Панорама |
| M | Маркер |
| E | Ластик |
| R | Линейка |
| Ctrl + Z | Отмена |

---

## Сборка

```bash
npm run dev      # Разработка
npm run build    # Продакшн (в docs/)
npm run preview  # Предпросмотр
```

---

## Переводы

### Добавление нового ключа

```json
// locales/en.json
{
  "my_new_key": "My new text"
}

// locales/ru.json
{
  "my_new_key": "Мой новый текст"
}
```

### Поддерживаемые языки

- `en` - English
- `ru` - Русский
- `be` - Беларуская
- `sr` - Српски
- `uk` - Українська

---

## Соглашения по коду

### Именование

- PascalCase для компонентов: `MyComponent`
- camelCase для хуков: `useMyHook`
- UPPER_CASE для констант: `MY_CONSTANT`

### Структура компонента

```typescript
// 1. Imports
import React from 'react'

// 2. Types/interfaces
interface MyComponentProps {
  prop1: string
}

// 3. Component
export const MyComponent: React.FC<MyComponentProps> = ({ prop1 }) => {
  // 3.1 Hooks
  const [state, setState] = useState(null)

  // 3.2 Handlers
  const handleClick = useCallback(() => { ... }, [])

  // 3.3 Effects
  useEffect(() => { ... }, [])

  // 3.4 Render
  return <div>...</div>
}
```

---

## Полезные утилиты

### GeometryUtils

```typescript
import { getDistance, getAngle, isPointInRect } from './utils/geometryUtils'

const dist = getDistance(x1, y1, x2, y2)
const angle = getAngle(x1, y1, x2, y2)
const inside = isPointInRect(pointX, pointY, rectX, rectY, rectW, rectH)
```

### ShapeUtils

```typescript
import { getCardShapeStyles, getTokenShapeStyles } from './utils/shapeUtils'

const styles = getCardShapeStyles(CardShape.HEX, CardOrientation.VERTICAL)
```

---

## Ресурсы

### Документация

- [React](https://react.dev)
- [TypeScript](https://www.typescriptlang.org/docs)
- [PeerJS](https://peerjs.com/docs)
- [Vite](https://vitejs.dev/guide)
- [Zustand](https://zustand-demo.pmnd.rs)

### Иконки

- [Lucide Icons](https://lucide.dev/icons)

---

## Работа с CHANGELOG.md

### ⚠️ Важные правила

**КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО**:
- ❌ Добавлять новые версии без явного запроса
- ❌ Изменять номер текущей версии

**РАЗРЕШЕНО**:
- ✅ Обновлять содержимое текущей версии
- ✅ Добавлять описание новых функций
- ✅ Исправлять опечатки

---

*Руководство для разработчиков NexusGameTable v0.2.0*
