<div align="center">
  <h1>Nexus Game Table</h1>
  <p>Виртуальный игровой стол для настольных игр с P2P мультиплеером</p>
  <img width="1200" height="686" alt="Nexus Game Table" src="https://res.cloudinary.com/dxxh6meej/image/upload/v1772083073/NEXSUS_cfte8v.webp" />
</div>

---

## 📋 Содержание

- [О проекте](#о-проекте)
- [Возможности](#возможности)
- [Быстрый старт](#быстрый-старт)
- [Как играть](#как-играть)
- [Для разработчиков](#для-разработчиков)
- [Архитектура](#архитектура)
- [WebRTC мультиплеер](#webrtc-мультиплеер)

---

## О проекте

**Nexus Game Table** — бесплатный виртуальный игровой стол для настольных игр с поддержкой онлайн-мультиплеера. Приложение работает прямо в браузере и использует P2P-соединения — выделенный сервер не требуется.

**Текущая версия:** 0.2.5
**Статус:** ✅ Production Ready

### Knowledge Graph

Проект содержит интегрированную систему **graphify knowledge graph** для понимания архитектуры:

```bash
# Граф содержит 498 узлов и 643 связей
graphify-out/GRAPH_REPORT.md

# Для запросов к графу:
graphify query "ваш вопрос" --graph graphify-out/graph.json
```

---

## Возможности

| Возможность | Описание |
|-------------|----------|
| **Карты и колоды** | Создание колод, перетасовка, сдача карт, различные формы и размеры |
| **Кубики** | d4, d6, d8, d10, d12, d20 с логированием бросков, альтернативные значения |
| **Токены** | Произвольные токены с формами (круг, квадрат, шестиугольник), система состояний |
| **Счётчики** | Цифровые счётчики для очков/ресурсов |
| **Доски** | Игровые поля с квадратной/шестиугольной сеткой, Nexus boards |
| **Рисование** | Маркер, ластик, линейка, циркуль для рисования на столе |
| **Рулетки** | Случайный выбор из опций |
| **Чат** | Внутриигровое общение между игроками |
| **Автосохранение** | Автоматическое сохранение состояния игры |
| **P2P мультиплеер** | Прямые соединения между игроками без сервера |

---

## Быстрый старт

### Требования

- Node.js 18+ и npm

### Установка

```bash
# Клонирование репозитория
git clone https://github.com/your-repo/nexus-game-table.git
cd nexus-game-table

# Установка зависимостей
npm install

# Запуск приложения
npm run dev
```

Приложение откроется по адресу: **http://localhost:5173**

### Сборка для продакшена

```bash
npm run build
npm run preview
```

---

## Как играть

### Создание игры

1. Откройте приложение — локальная игра создаётся автоматически
2. Нажмите кнопку **Share** в правом меню, чтобы получить ссылку
3. Поделитесь ссылкой с друзьями

### Подключение к игре

1. Перейдите по ссылке вида: `https://example.com?hostId=...`
2. Введите своё имя
3. Нажмите **Join**

### Основное управление

| Действие | Управление |
|----------|------------|
| Перемещение объекта | Перетаскивание мышью |
| Взять объект | Shift + клик |
| Бросить объект | Shift + клик на цели |
| Контекстное меню | Правый клик |
| Масштаб | Колёсико мыши |
| Панорама | Space + Drag или средняя кнопка мыши |
| Отмена | Ctrl + Z |

### Инструменты рисования

| Клавиша | Инструмент |
|---------|------------|
| M | Маркер |
| E | Ластик |
| R | Линейка |
| C | Циркуль |
| N | Нет инструмента |

---

## Для разработчиков

### Стек технологий

```
React 18.x + TypeScript
├── Vite (сборка)
├── PeerJS + Trystero (WebRTC мультиплеер с fallback)
├── Zustand (state management)
├── Redux Toolkit (редьюсеры)
├── Lucide React (иконки)
└── Tailwind CSS + CSS Modules (стили)
```

### Структура проекта

```
NexusGameTable/
├── components/
│   ├── Tabletop/              # Основной игровой стол
│   │   ├── TabletopBackground.tsx    # Рендеринг фона
│   │   ├── TabletopEventHandlers.tsx # Обработка событий
│   │   ├── TabletopRefactored.tsx   # Ядро с smart z-index
│   │   ├── CardRenderer.tsx          # Рендеринг карт
│   │   ├── TokenRenderer.tsx         # Рендеринг токенов
│   │   └── index.tsx                 # Экспорт модуля
│   ├── CharacterBlocks/       # Блоки персонажей
│   ├── contextMenu/           # Контекстные меню
│   ├── ObjectSettings/        # Настройки объектов
│   ├── HandPanelOptimized.tsx # Панель руки
│   ├── ToolsPanel.tsx         # Панель инструментов
│   ├── PoolTabletopOptimized.tsx # Пул панелей
│   └── UIObjectRendererOptimized.tsx # Рендеринг объектов
├── store/
│   ├── contexts/              # React Context провайдеры
│   │   ├── PlayerContext.tsx         # Управление игроками
│   │   ├── ViewTransformContext.tsx  # Камера и зум
│   │   ├── UIContext.tsx             # Язык, слои
│   │   └── GameContext.tsx           # Игровое состояние
│   ├── slices/                 # Redux Toolkit слайсы
│   │   ├── objectSlice.ts            # Операции с объектами
│   │   └── playerSlice.ts            # Операции с игроками
│   ├── objectStore.ts         # Zustand store для объектов
│   ├── gameActions.ts         # Определение всех Actions
│   ├── gameState.ts           # Типы состояния
│   ├── usePeerConnection.ts   # WebRTC с fallback сигналингом
│   ├── useAutoSave.ts         # Автосохранение
│   └── reducers/               # Redux редьюсеры
├── utils/
│   ├── contextMenuActions.ts  # Обработчики контекстного меню
│   ├── objectActionHandlers.ts # Обработчики действий объектов
│   ├── objectFactories.ts     # Фабрики объектов
│   ├── geometryUtils.ts       # Геометрические расчёты
│   ├── coordinateUtils.ts     # Координатные преобразования
│   ├── logger.ts              # Система логирования
│   ├── memoryManager.ts       # Управление памятью
│   ├── performanceMonitor.ts # Мониторинг производительности
│   ├── webrtcOptimization.ts  # WebRTC оптимизация
│   └── assets/                # Управление ассетами
├── hooks/
│   ├── useDragHandlers.ts     # Drag & Drop
│   ├── useGridSnapping.ts     # Привязка к сетке
│   └── useObjectPinning.ts    # Закрепление объектов
├── locales/                   # Переводы
│   ├── en.json
│   ├── ru.json
│   ├── be.json
│   ├── sr.json
│   └── uk.json
├── types.ts                   # TypeScript типы
├── constants.ts               # Константы
└── graphify-out/              # Knowledge graph
    ├── GRAPH_REPORT.md        # Отчёт графа
    ├── graph.json             # Данные графа
    └── graph.html             # Визуализация
```

### Ключевые сообщества (из графа)

| Сообщество | Описание |
|------------|----------|
| **Object Actions Handlers** | Обработчики действий объектов (`executeClickAction()`, `handleFlip()`) |
| **Object Settings & Translations** | Настройки объектов и переводы |
| **Player Context & Hooks** | Управление игроками (`usePlayers()`, `useActivePlayer()`) |
| **Game Context & State** | Игровое состояние (`useGame()`) |
| **WebRTC & Networking** | P2P соединения и синхронизация |
| **Tabletop Core** | Основной игровой стол |
| **Drawing & Canvas** | Инструменты рисования |
| **Performance Monitoring** | FPS и оптимизация |

### God Nodes (наиболее связанные узлы)

1. `dispatch()` — 48 edges (центральный диспетчер)
2. `executeClickAction()` — 34 edges (обработчик кликов)
3. `MemoryManager` — 16 edges (оптимизация памяти)
4. `useUI()` — 11 edges (UI контекст)
5. `WebRTCSyncManager` — 11 edges (синхронизация P2P)

---

## Архитектура

### Context Architecture

Иерархия провайдеров:

```typescript
<LocalSettingsProvider>
  <UIProvider>              // Language (local), Layers (synced)
    <ViewTransformProvider>  // Camera (local, NO sync)
      <PlayerProvider>        // Players (synced)
        <GameProvider>        // Game objects (synced)
          <WebRTCIntegration> // Manages sync between contexts
            <App />
```

### Zustand ObjectStore

Оптимизированный доступ к объектам:

```typescript
import { useObjectsData, useObjectActions } from './store/objectStore';

const objects = useObjectsData();           // Read-only, stable
const { updateObject, deleteObject } = useObjectActions(); // Actions, stable
```

### Система Actions

Основные типы действий:

```typescript
// Объекты
ADD_OBJECT
UPDATE_OBJECT
DELETE_OBJECT
CLONE_OBJECT
MOVE_OBJECT
ROTATE_OBJECT
TOGGLE_LOCK

// Карты
DRAW_CARD
PLAY_CARD
FLIP_CARD
RETURN_TO_DECK
SHUFFLE_DECK

// UI
CREATE_PANEL
CREATE_WINDOW
CLOSE_UI_OBJECT

// Слои
MOVE_OBJECT_TO_HYPERSCALE_LAYER
ADD_HYPERSCALE_LAYER
UPDATE_HYPERSCALE_LAYER

// Отмена
UNDO_MARKER
UNDO_GENERAL
```

### Игровые объекты

#### Типы объектов

```typescript
enum ItemType {
  TOKEN = 'TOKEN',
  TOKEN_TYPE = 'TOKEN_TYPE',  // Архетип токена
  CARD = 'CARD',
  DECK = 'DECK',
  DICE_OBJECT = 'DICE_OBJECT',
  COUNTER = 'COUNTER',
  BOARD = 'BOARD',
  NEXUS_BOARD = 'NEXUS_BOARD',  // Связные шестиугольные клетки
  NEXUS_CELL = 'NEXUS_CELL',    // Отдельная клетка Nexus board
  BATTLEFIELD_CELL = 'BATTLEFIELD_CELL',
  RANDOMIZER = 'RANDOMIZER',
  PANEL = 'PANEL',
  WINDOW = 'WINDOW',
  DRAWING = 'DRAWING',
  EFFECT_TEMPLATE = 'EFFECT_TEMPLATE',
}
```

#### Формы карт

| Форма | Размер |
|-------|--------|
| POKER | 120×168 |
| BRIDGE | 108×144 |
| MINI_US | 74×106 |
| SQUARE | 168×168 |
| HEX | Переменный |

#### Локации карт

```
TABLE   → На столе
DECK    → В колоде
HAND    → В руке
PILE    → В сбросе
CURSOR_SLOT → В курсоре
```

### Hyperscale Layers

Система слоёв выше обычного z-index:

```typescript
interface HyperscaleLayer {
  id: string;
  name: string;
  minZIndex: number;
  maxZIndex: number;
  color: string;
  playerCanSelect: boolean;
  playerCanView: boolean;
  individualObjects: boolean;  // Локальные позиции для каждого игрока
  zoomEnabled: boolean;
  order: number;
}
```

Предустановленные слои:
- **Boards** (1-1000) — игровые поля
- **Cards** (1001-3000) — карты
- **Tokens** (3001-6000) — токены
- **Drawings** (6001-7000) — рисунки
- **Interface** (9001-10000) — интерфейс

### Система состояний токенов

Токены могут иметь альтернативные состояния:

```typescript
interface TokenState {
  id: string;
  name: string;  // "Wounded", "Poisoned", etc.
  content?: string;
  color?: string;
  shape?: TokenShape;
  // ... другие визуальные свойства
}
```

### Система слайдеров токенов

Токены могут иметь числовые слайдеры (HP, MP и т.д.):

```typescript
interface TokenSlider {
  id: string;
  name: string;
  value: number;
  maxValue: number;
  minValue?: number;
  color?: string;
  icon?: string;
}
```

---

## WebRTC мультиплеер

### Fallback Signaling System

Автоматическое переключение между методами сигналинга:

#### 1. PeerJS Cloud Servers (основной)

```
0.peerjs.com
1.peerjs.com
2.peerjs.com
```

#### 2. Community Servers (self-hosted)

Добавляются в `COMMUNITY_SERVERS` в `usePeerConnection.ts`

#### 3. Trystero Torrent Trackers (fallback)

```
wss://tracker.btorrent.xyz
wss://tracker.openwebtorrent.com
wss://tracker.fastcast.nz
wss://tracker.files.fm:443/announce
```

### Добавление комьюнити сервера

```typescript
// В store/usePeerConnection.ts

const COMMUNITY_SERVERS = [
  {
    host: 'your-server.com',
    port: 443,
    secure: true,
    path: '/peerjs',
    name: 'My Server'
  },
];
```

### Деплой своего PeerJS сервера

**Быстрый старт (Heroku/Railway/Render):**

```bash
# 1. Создайте папку для сервера
mkdir nexus-signaling && cd nexus-signaling

# 2. Инициализируйте проект
npm init -y
npm install peer

# 3. Создайте server.js
cat > server.js << 'EOF'
const { PeerServer } = require('peer');

const peerServer = PeerServer({
  port: process.env.PORT || 443,
  path: '/peerjs',
});

peerServer.on('connection', (client) => {
  console.log(`Client connected: ${client.getId()}`);
});

console.log('PeerJS server running');
EOF

# 4. Задеплойте
heroku create your-signaling-server
git push heroku main
```

### Модель Host/Guest

| Роль | Описание |
|-----|----------|
| Host | Создаёт комнату, транслирует state |
| Guest | Подключается, получает state |

### Диагностика

```javascript
// В консоли браузера
nexusP2PDebug.getDiagnostics();
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
// store/slices/objectSlice.ts
case 'CUSTOM_ACTION': {
  const obj = state.objects[action.payload.objectId];
  if (!obj || obj.type !== ItemType.MY_NEW_TYPE) return state;
  return {
    ...state,
    objects: {
      ...state.objects,
      [action.payload.objectId]: { ...obj, customProperty: action.payload.value }
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

### 2. Обработайте в utils/contextMenuActions.ts

```typescript
case 'my_custom_action':
  dispatch({ type: 'CUSTOM_ACTION', payload: { id: object.id } })
  break
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

### Система логирования

```typescript
import { logger } from './utils/logger';

logger.log('Сообщение', data);
logger.error('Ошибка', error);
logger.warn('Предупреждение');
logger.debug('Отладочная информация');
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

## Документация

### Основная документация

- 📖 [README.md](./README.md) — этот файл
- 🔒 [SECURITY.md](./SECURITY.md) — политика безопасности
- 📋 [CHANGELOG.md](./CHANGELOG.md) — история версий

### Устаревшие документы (объединены в этот README)

- ~~DEVELOPER_GUIDE.md~~ — включено в раздел "Для разработчиков"
- ~~DOCUMENTATION.md~~ — включено в раздел "Возможности" и "Как играть"
- ~~FALLBACK_SIGNALING.md~~ — включено в раздел "WebRTC мультиплеер"

---

## Лицензия

MIT License — см. файл [LICENSE](./LICENSE)

---

<div align="center">
  <p>Made with ❤️ for board game lovers</p>
  <a href="https://github.com/your-repo/nexus-game-table/issues">Report Issue</a> •
  <a href="https://github.com/your-repo/nexus-game-table/discussions">Discussions</a>
</div>
