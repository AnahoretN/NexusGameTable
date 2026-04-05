# NexusGameTable - Руководство для разработчиков

## Архитектура приложения

### Стек технологий

```
React 18.x + TypeScript
├── Vite (сборка)
├── PeerJS (WebRTC мультиплеер)
├── Lucide React (иконки)
└── CSS Modules (стили)
```

### Структура проекта

```
NexusGameTable/
├── components/           # React компоненты
│   ├── Tabletop.tsx     # Главный игровой стол (~4000 строк)
│   ├── MainMenuContent.tsx  # Главное меню (~1400 строк)
│   ├── ObjectSettingsModal.tsx  # Настройки объектов (~1800 строк)
│   ├── UIObjectRenderer.tsx    # Рендеринг объектов (~1000 строк)
│   ├── DrawingCanvas.tsx       # Canvas для рисования (~900 строк)
│   ├── HandPanel.tsx           # Панель руки (~800 строк)
│   ├── SearchDeckModal.tsx     # Модалка поиска (~700 строк)
│   ├── ContextMenu.tsx         # Контекстное меню (~600 строк)
│   └── ...
├── store/               # Управление состоянием
│   ├── GameContext.tsx  # Главный контекст (~3500 строк)
│   ├── gameState.ts     # Типы состояния
│   ├── gameActions.ts   # Типы действий
│   ├── gameConstants.ts # Константы
│   ├── useAutoSave.ts   # Хук автосохранения
│   ├── usePeerConnection.ts  # Хук WebRTC
│   └── reducers/        # Редьюсеры (модульные)
├── hooks/               # Custom React hooks
│   ├── useDragHandlers.ts
│   ├── useGridSnapping.ts
│   ├── useObjectPinning.ts
│   └── useHandCardScale.ts
├── utils/               # Утилиты
│   ├── geometryUtils.ts
│   ├── cardUtils.tsx
│   ├── shapeUtils.ts
│   ├── coordinateUtils.ts
│   └── gameStorage.ts
├── types.ts             # Все TypeScript типы
├── constants.ts         # Константы приложения
├── translations.ts      # Переводы (EN/RU)
└── services/            # Внешние сервисы
    └── webSocketService.ts
```

## Система состояний

### GameState

```typescript
interface GameState {
  // Объекты на столе
  objects: Record<string, TableObject>

  // Игроки
  players: Player[]
  activePlayerId: string

  // Броски кубиков
  diceRolls: DiceRoll[]

  // Вид (масштаб, панорама)
  viewTransform: ViewTransform

  // Рисунки
  drawings: DrawingData[]

  // История для отмены
  undo: UndoState

  // Права игроков
  playerPermissions: PlayerPermissions

  // Язык
  language: AppLanguage

  // ID сессии
  sessionId: string
}
```

### Система действий (Actions)

Действия отправляются через `dispatch()`:

```typescript
// Добавить объект
dispatch({
  type: 'ADD_OBJECT',
  payload: { id: 'obj-1', type: ItemType.TOKEN, x: 100, y: 100, ... }
})

// Переместить объект
dispatch({
  type: 'MOVE_OBJECT',
  payload: { id: 'obj-1', x: 200, y: 200 }
})
```

Все типы действий определены в `store/gameActions.ts`.

## Создание нового объекта

### 1. Добавьте тип в types.ts

```typescript
// types.ts
export enum ItemType {
  TOKEN = 'token',
  CARD = 'card',
  DECK = 'deck',
  MY_NEW_TYPE = 'my_new_type'  // Добавьте сюда
}

export interface MyNewType extends GameItem {
  type: ItemType.MY_NEW_TYPE
  // Ваши уникальные свойства
  customProperty: string
}
```

### 2. Добавьте редьюсер

```typescript
// store/GameContext.tsx (в gameReducer)
case 'CUSTOM_ACTION': {
  const obj = state.objects[action.payload.id]
  if (!obj || obj.type !== ItemType.MY_NEW_TYPE) return state

  // Ваша логика
  return {
    ...state,
    objects: {
      ...state.objects,
      [action.payload.id]: {
        ...obj,
        customProperty: action.payload.value
      }
    }
  }
}
```

### 3. Добавьте тип действия

```typescript
// store/gameActions.ts
export type Action =
  | BaseAction<'CUSTOM_ACTION', { id: string; value: string }>
  // ... другие действия
```

### 4. Создайте компонент рендеринга

```typescript
// components/MyNewTypeRenderer.tsx
import React from 'react'
import { MyNewType } from '../types'

interface MyNewTypeRendererProps {
  obj: MyNewType
  dispatch: React.Dispatch<Action>
}

export const MyNewTypeRenderer: React.FC<MyNewTypeRendererProps> = ({ obj, dispatch }) => {
  return (
    <div
      style={{
        position: 'absolute',
        left: obj.x,
        top: obj.y,
        width: obj.width,
        height: obj.height,
      }}
    >
      {/* Ваш рендеринг */}
    </div>
  )
}
```

### 5. Добавьте в UIObjectRenderer

```typescript
// components/UIObjectRenderer.tsx
switch (obj.type) {
  case ItemType.MY_NEW_TYPE:
    return <MyNewTypeRenderer key={obj.id} obj={obj} dispatch={dispatch} />
  // ...
}
```

## Добавление нового действия в контекстное меню

### 1. Определите действие

```typescript
// types.ts
export type ContextAction =
  | 'flip' | 'clone' | 'delete'
  | 'my_custom_action'  // Добавьте сюда
```

### 2. Добавьте в AVAILABLE_ACTIONS

```typescript
// components/ObjectSettingsModal.tsx или constants.ts
const AVAILABLE_ACTIONS: { id: ContextAction; label: string }[] = [
  // ...
  { id: 'my_custom_action', label: 'My Custom Action' }
]
```

### 3. Обработайте в ContextMenu

```typescript
// components/ContextMenu.tsx
case 'my_custom_action':
  dispatch({
    type: 'CUSTOM_ACTION',
    payload: { id: object.id }
  })
  break
```

## Создание нового инструмента рисования

### 1. Добавьте тип инструмента

```typescript
// types.ts
export type DrawingTool =
  | 'marker' | 'eraser' | 'ruler' | 'compass'
  | 'my_tool'  // Добавьте сюда
```

### 2. Добавьте UI в ToolsPanel

```typescript
// components/ToolsPanel.tsx
<button onClick={() => setSelectedTool('my_tool')}>
  My Tool
</button>
```

### 3. Обработайте в Tabletop

```typescript
// components/Tabletop.tsx
const handleMouseDown = (e: React.MouseEvent) => {
  if (currentTool === 'my_tool') {
    // Ваша логика
  }
}
```

## Добавление новой вкладки в главное меню

### 1. Определите тип вкладки

```typescript
// types.ts
export type PanelType =
  | 'main_menu' | 'hand' | 'chat' | 'players' | 'create'
  | 'my_tab'  // Добавьте сюда
```

### 2. Создайте компонент вкладки

```typescript
// components/MyTabContent.tsx
export const MyTabContent: React.FC = () => {
  return (
    <div>
      <h3>My Tab</h3>
      {/* Контент */}
    </div>
  )
}
```

### 3. Добавьте в MainMenuContent

```typescript
// components/MainMenuContent.tsx
const tabs = [
  { id: 'create', label: 'Create' },
  { id: 'hand', label: 'Hand' },
  { id: 'my_tab', label: 'My Tab' },  // Добавьте сюда
]

// В рендере:
{activeTab === 'my_tab' && <MyTabContent />}
```

## Работа с мультиплеером

### Локальные действия

Действия, которые не синхронизируются:

```typescript
dispatch({
  type: 'UPDATE_VIEW_TRANSFORM',
  payload: { zoom: 1.5 },
  _localOnly: true  // Не отправлять по сети
})
```

### Действия только для гостя

Действия, которые выполняются только на клиенте:

```typescript
dispatch({
  type: 'SOME_ACTION',
  payload: {...},
  _guestOnly: true
})
```

### Фильтрация при трансляции

Локальные окна не отправляются:

```typescript
// GameContext.tsx - Host Broadcast Loop
const stateForBroadcast = (() => {
  const filteredObjects: Record<string, TableObject> = {}
  Object.entries(state.objects).forEach(([id, obj]) => {
    // Пропускаем окна с ownerId
    if (obj.type === ItemType.WINDOW && (obj as WindowObject).ownerId) {
      return
    }
    filteredObjects[id] = obj
  })
  return { ...state, objects: filteredObjects }
})()
```

## Оптимизация производительности

### React.memo для компонентов

```typescript
export const MyComponent = React.memo<MyComponentProps>(
  ({ prop1, prop2 }) => {
    // Рендеринг
  },
  (prevProps, nextProps) => {
    // Custom comparison
    return prevProps.prop1 === nextProps.prop1
  }
)
```

### useCallback для обработчиков

```typescript
const handleClick = useCallback((id: string) => {
  dispatch({ type: 'SOME_ACTION', payload: { id } })
}, [dispatch])
```

### useMemo для вычислений

```typescript
const sortedObjects = useMemo(() => {
  return Object.values(objects).sort((a, b) => a.zIndex - b.zIndex)
}, [objects])
```

## Отладка

### Logger

Используйте централизованный логгер:

```typescript
import { logger } from './utils/logger'

logger.log('Some message', data)
logger.error('Error occurred', error)
logger.warn('Warning message')
logger.debug('Debug info')
```

### Redux DevTools

Для отладки состояний можно добавить React DevTools:

```typescript
// GameContext.tsx
import { DevTools } from './components/DevTools'

// В рендере:
{process.env.NODE_ENV === 'development' && <DevTools />}
```

### Peer.js отладка

```typescript
// Включить debug логи Peer.js
const peer = new Peer({ debug: 2 })
```

## Тестирование

### Запуск тестов

```bash
npm test
```

### Запуск с покрытием

```bash
npm run test:coverage
```

## Сборка

### Разработка

```bash
npm run dev
```

### Продакшн

```bash
npm run build
```

### Предпросмотр сборки

```bash
npm run preview
```

## Константы

### Размеры объектов

```typescript
// constants.ts
CARD_WIDTH = 120
CARD_HEIGHT = 168
TOKEN_SIZE = 80
DEFAULT_DICE_SIZE = 60
```

### Z-index

```typescript
Z_INDEX_BOARD = -100
Z_INDEX_DECK = 0
Z_INDEX_ARCHETYPE = -50
Z_INDEX_PANEL = 1000
Z_INDEX_WINDOW = 10000
Z_INDEX_DRAGGING = 9999
```

## Переводы

### Добавление нового перевода

```typescript
// translations.ts
export const translations = {
  en: {
    my_new_key: 'My new text'
  },
  ru: {
    my_new_key: 'Мой новый текст'
  }
}
```

### Использование перевода

```typescript
import { translations } from './translations'

const text = translations[language].my_new_key
```

## Соглашения по коду

### Именование компонентов

- PascalCase для компонентов: `MyComponent`
- camelCase для хуков: `useMyHook`
- UPPER_CASE для констант: `MY_CONSTANT`

### Структура компонента

```typescript
// 1. Imports
import React from 'react'
import { SomeType } from './types'

// 2. Types/interfaces
interface MyComponentProps {
  prop1: string
  prop2: number
}

// 3. Component
export const MyComponent: React.FC<MyComponentProps> = ({ prop1, prop2 }) => {
  // 3.1 Hooks
  const [state, setState] = useState(null)
  const ref = useRef(null)

  // 3.2 Handlers
  const handleClick = useCallback(() => {
    // ...
  }, [])

  // 3.3 Effects
  useEffect(() => {
    // ...
  }, [])

  // 3.4 Render
  return (
    <div>...</div>
  )
}
```

## Полезные утилиты

### GeometryUtils

```typescript
import { getDistance, getAngle, isPointInRect } from './utils/geometryUtils'

// Расстояние между точками
const dist = getDistance(x1, y1, x2, y2)

// Угол между точками
const angle = getAngle(x1, y1, x2, y2)

// Проверка попадания точки в прямоугольник
const inside = isPointInRect(pointX, pointY, rectX, rectY, rectW, rectH)
```

### ShapeUtils

```typescript
import { getCardShapeStyles, getTokenShapeStyles } from './utils/shapeUtils'

// Стили для формы карты
const styles = getCardShapeStyles(CardShape.HEX, CardOrientation.VERTICAL)

// Стили для формы токена
const tokenStyles = getTokenShapeStyles(TokenShape.CIRCLE)
```

### UUID генерация

```typescript
import { generateUUID } from './utils/uuid'

const id = generateUUID() // "550e8400-e29b-41d4-a716-446655440000"
```

## Ресурсы

### Документация

- [React](https://react.dev)
- [TypeScript](https://www.typescriptlang.org/docs)
- [PeerJS](https://peerjs.com/docs)
- [Vite](https://vitejs.dev/guide)

### Иконки

- [Lucide Icons](https://lucide.dev/icons)

---

## Работа с CHANGELOG.md

### ⚠️ Важные правила

**КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО**:
- ❌ Добавлять новые версии в CHANGELOG.md без явного запроса от ведущего разработчика
- ❌ Изменять номер текущей версии
- ❌ Создавать новые секции версий (например, `## [0.1.9]`)

**РАЗРЕШЕНО**:
- ✅ Обновлять содержимое текущей версии `[0.1.8]`
- ✅ Добавлять описание новых функций в текущую версию
- ✅ Исправлять опечатки и форматирование в существующих секциях
- ✅ Добавлять технические детали в существующие секции

### Пример правильного обновления

```markdown
## [0.1.8] - 2026-04-04

### 🎮 Major Features

#### 🛠️ Tools Panel
+ Добавлено описание новой панели...

#### 🎭 Tokens Panel
+ Добавлено описание новой панели...
```

### Когда добавлять новую версию

Только когда ведущий разработчик явно скажет:
> "Обнови версию до 0.1.9 и добавь в CHANGELOG"

### Почему это важно

- Номер версии управляется процессом релиза
- Несвоевременное обновление версии может сломать обратную совместимость
- Систематический подход к changelog повышает качество документации

---

*Руководство для разработчиков NexusGameTable*
