# NexusGameTable - Полная документация приложения

## Оглавление

1. [Обзор приложения](#1-обзор-приложения)
2. [Архитектура](#2-архитектура)
3. [Игровые объекты](#3-игровые-объекты)
4. [Системы взаимодействия](#4-системы-взаимодействия)
5. [Инструменты и рисование](#5-инструменты-и-рисование)
6. [Интерфейс пользователя](#6-интерфейс-пользователя)
7. [Управление игрой](#7-управление-игрой)
8. [Мультиплеер](#8-мультиплеер)
9. [Настройки и конфигурация](#9-настройки-и-конфигурация)
10. [Горячие клавиши](#10-горячие-клавиши)
11. [Техническая реализация](#11-техническая-реализация)

---

## 1. Обзор приложения

### Назначение

**NexusGameTable** — это виртуальный игровой стол для настольных игр с поддержкой мультиплеера. Приложение позволяет:

- Играть в настольные игры онлайн с друзьями
- Создавать и управлять игровыми объектами (карты, фишки, кубики, токены)
- Использовать инструменты для рисования на столе
- Сохранять и загружать состояние игры
- Настраивать права доступа для разных игроков

### Основные возможности

| Возможность | Описание |
|------------|----------|
| **Карты и колоды** | Создание колод, перетасовка, сдача карт |
| **Токены и фишки** | Произвольные токены с формами и цветами |
| **Кубики** Various} | Бросок виртуальных кубиков с анимацией |
| **Счётчики** | Цифровые счётчики для очков/ресурсов |
| **Доски** | Игровые поля с сеткой (квадратная/шестиугольная) |
| **Рисование** | Рисование маркером на столе и объектах |
| **Рулетки** | Случайный выбор из опций |
| **Чат** | Внутриигровое общение между игроками |
| **Автосохранение** | Автоматическое сохранение состояния игры |

---

## 2. Архитектура

### Структура приложения

```
NexusGameTable/
├── components/          # React компоненты
│   ├── Tabletop.tsx    # Главный игровой стол (4028 строк)
│   ├── UIObjectRenderer.tsx  # Рендеринг объектов
│   ├── MainMenuContent.tsx   # Главное меню (1431 строка)
│   ├── HandPanel.tsx   # Панель руки игрока
│   ├── ToolsPanel.tsx  # Панель инструментов
│   ├── ContextMenu.tsx # Контекстное меню
│   └── ...            # Прочие компоненты
├── store/              # Управление состоянием
│   ├── GameContext.tsx # Главный контекст (3528 строк)
│   ├── gameState.ts    # Интерфейсы состояния
│   ├── gameActions.ts  # Типы действий
│   ├── gameConstants.ts # Константы
│   ├── useAutoSave.ts  # Хук автосохранения
│   ├── usePeerConnection.ts # Хук Peer.js
│   └── reducers/       # Редьюсеры
├── utils/              # Утилиты
│   ├── geometryUtils.ts # Геометрические расчёты
│   ├── cardUtils.tsx   # Утилиты для карт
│   ├── shapeUtils.ts   # Формы объектов
│   └── gameStorage.ts  # Сохранение/загрузка
├── hooks/              # Custom React хуки
│   ├── useDragHandlers.ts # Обработка перетаскивания
│   ├── useGridSnapping.ts # Привязка к сетке
│   └── useObjectPinning.ts # Закрепление объектов
├── types.ts            # TypeScript типы
├── constants.ts        # Константы приложения
└── translations.ts     # Переводы (EN/RU)
```

### Система состояний

Приложение использует централизованное управление состоянием:

```typescript
GameState {
  objects: Record<string, TableObject>  // Все объекты на столе
  players: Player[]                     // Список игроков
  activePlayerId: string                // Текущий игрок
  diceRolls: DiceRoll[]                 // История бросков кубиков
  viewTransform: ViewTransform          // Масштаб и позиция вида
  drawings: DrawingData[]               # Рисунки на столе
  undo: UndoState                       # История для отмены
  playerPermissions: PlayerPermissions  // Права игроков
  language: AppLanguage                 // Язык интерфейса
  sessionId: string                     # ID сессии
}
```

---

## 3. Игровые объекты

### 3.1 Карты (Cards)

#### Типы карт

| Форма | Размер | Описание |
|-------|--------|----------|
| POKER | 120×168 | Стандартные покерные карты |
| BRIDGE | 108×144 | Бридж |
| MINI_US | 74×106 | Мини (US) |
| MINI_EURO | 68×97 | Мини (Европа) |
| SQUARE | 168×168 | Квадратные |
| HEX | Переменный | Шестиугольные |
| CIRCLE | Переменный | Круглые |
| TRIANGLE | Переменный | Треугольные |

#### Локации карт

```
TABLE   → Карта на столе
DECK    → Карта в колоде
HAND    → Карта в руке игрока
PILE    → Карта в сбросе
CURSOR_SLOT → Карта в курсоре (перетаскивается)
```

#### Свойства карт

- **faceUp**: Показывать ли лицевую сторону
- **deckId**: ID родительской колоды
- **shape**: Форма карты
- **width/height**: Размеры
- **content**: URL изображения лицевой стороны
- **backFaceUrl**: URL изображения рубашки
- **alternativeBack**: Альтернативная рубашка для разных локаций

#### Действия с картами

| Действие | Описание |
|----------|----------|
| Draw | Взять карту из колоды |
| Play | Выложить карту на стол |
| Flip | Перевернуть карту |
| Move to Hand | Переместить в руку |
| Return to Deck | Вернуть в колоду |
| Shuffle | Перетасовать колоду |

### 3.2 Колоды (Decks)

#### Основные функции

- **Shuffle**: Перетасовать колоду
- **Draw**: Сдать карту (сверху или снизу)
- **Play Top**: Выложить верхнюю карту
- **Search**: Просмотреть содержимое колоды

#### Настройки колоды

| Параметр | Описание |
|----------|----------|
| cardShape | Форма карт в колоде |
| cardOrientation | Ориентация (VERTICAL/HORIZONTAL) |
| cardWidth/cardHeight | Размер карт |
| showTopCard | Показывать верхнюю карту |
| playTopFaceUp | Выкладывать верхней картой вверх |
| searchWindowVisibility | Видимость окна поиска |

#### Пулы (Piles)

Каждая колода может иметь несколько пулов:

| Тип пула | Описание |
|----------|----------|
| Discard | Стандартный сброс |
| Custom | Пользовательский пул |

Настройки пула:
- **position**: Позиция относительно колоды (left/right/top/bottom)
- **faceUp**: Карты лицевой стороной вверх
- **visible**: Видимость пула
- **size**: Размер пула (1-5)
- **locked**: Заблокирован ли пул
- **isMillPile**: Пул для сброса (mill)

### 3.3 Токены (Tokens)

#### Формы токенов

| Форма | Описание |
|-------|----------|
| CIRCLE | Круг |
| SQUARE | Квадрат |
| HEX | Шестиугольник |
| TRIANGLE | Треугольник |

#### Свойства токенов

| Свойство | Описание |
|----------|----------|
| shape | Форма токена |
| color | Цвет заливки |
| borderColor | Цвет границы |
| borderWidth | Толщина границы |
| gridType | Тип привязки к сетке |
| gridSize | Размер сетки |
| snapToGrid | Привязка к сетке |
| showName | Показывать название |
| isPinnedToViewport | Закреплён на экране |

#### Архетипы токенов (Token Types)

Архетипы — это шаблоны для создания множества однотипных токенов:

| Параметр | Описание |
|----------|----------|
| defaultSize | Размер по умолчанию |
| autoName | Автоматическое название |
| namePrefix | Префикс названия |
| spawnCount | Счётчик созданных токенов |

### 3.4 Кубики (Dice Objects)

#### Типы кубиков

- D2, D4, D6, D8, D10, D12, D20 — стандартные RPG кубики
- Произвольное количество граней (2-100)

#### Свойства кубика

| Свойство | Описание |
|----------|----------|
| sides | Количество граней |
| currentValue | Текущее значение |
| shape | Форма отображения |
| color | Цвет |

#### Логирование бросков

Все броски кубиков логируются в чат:
```
Игрок бросил d20 и получил 15
```

### 3.5 Счётчики (Counters)

#### Настройки счётчика

| Параметр | Описание |
|----------|----------|
| value | Текущее значение |
| minValue | Минимальное значение |
| maxValue | Максимальное значение |
| allowNegative | Разрешить отрицательные значения |
| step | Шаг изменения |

#### Действия

- **Increment**: Увеличить значение
- **Decrement**: Уменьшить значение
- **Reset**: Сбросить значение

### 3.6 Доски (Boards)

#### Типы сетки

| Тип | Описание |
|-----|----------|
| SQUARE | Квадратная сетка |
| HEX | Шестиугольная сетка |
| NONE | Без сетки |

#### Настройки доски

| Параметр | Описание |
|----------|----------|
| width/height | Размер доски |
| gridType | Тип сетки |
| gridSize | Размер ячейки |
| snapToGrid | Привязка к сетке |
| color | Цвет фона |
| content | Фоновое изображение |

### 3.7 Рулетки (Randomizers)

Рулетка — это объект для случайного выбора из опций.

#### Настройки рулетки

| Параметр | Описание |
|----------|----------|
| options | Массив опций |
| allowReuse | Разрешить повторный выбор |
| spinAnimation | Анимация вращения |

### 3.8 Рисунки (Drawings)

#### Слои рисования

Каждый рисунок имеет несколько слоёв:

| Тип слоя | Описание |
|----------|----------|
| Background | Фоновый слой |
| Foreground | Передний слой |

#### Инструменты рисования

- **Marker**: Рисование линий
- **Eraser**: Стирание
- **Ruler**: Линейка для измерений
- **Compass**: Циркуль для кругов

#### Настройки рисунка

| Параметр | Описание |
|----------|----------|
| color | Цвет линий |
| thickness | Толщина линий |
| opacity | Прозрачность |
| name | Название рисунка |

---

## 4. Системы взаимодействия

### 4.1 Контекстное меню

Контекстное меню открывается при правом клике на любом объекте.

#### Структура меню

```
┌─────────────────────────┐
│ 📋 Название объекта     │
├─────────────────────────┤
│ ▶ Действия              │
│   └─ Перевернуть        │
│   └─ Вращение ▶         │
│      ├─ По часовой       │
│      └─ Против часовой   │
│ ▶ Слой                  │
│   ├─ Слой выше          │
│   └─ Слой ниже          │
│ 🔒 Заблокировать        │
│ 📌 Закрепить на экране  │
│ 📋 Клонировать          │
│ 🗑️ Удалить              │
└─────────────────────────┘
```

#### Действия контекстного меню

| Действие | Описание |
|----------|----------|
| clone | Создать копию объекта |
| delete | Удалить объект |
| flip | Перевернуть карту/токен |
| layerUp/layerDown | Изменить z-index |
| lock/unlock | Заблокировать позицию |
| pin/unpin | Закрепить на экране |
| rotate | Вращение объекта |

### 4.2 Система курсор-слота (Cursor Slot)

Система позволяет переносить объекты, заживая **Shift** и кликая.

#### Механика работы

1. **Shift + Click** на объекте → объект помещается в курсор
2. **Shift + Click** на цели → объект перемещается

#### Визуальная индикация

- Фиолетовое кольцо вокруг объекта → объект может быть принят
- Счётчик на курсоре → количество объектов в слоте

#### Ограничения

- Максимум 100 объектов в слоте
- Работает только с картами и токенами
- Источник слота отслеживается для логики

#### Типы источника слота

| Источник | Описание |
|----------|----------|
| shift | Зажат Shift при клике |
| hold | Зажата кнопка мыши |
| archetype | Из архетипа токена |

### 4.3 Drag and Drop

#### Фазы перетаскивания

1. **MouseDown**: Начало перетаскивания
2. **MouseMove**: Перемещение объекта
3. **MouseUp**: Завершение (commit)

#### COMMIT для сетевой синхронизации

При отпускании объекта отправляется действие `MOVE_OBJECT_COMMIT`:

```typescript
{
  type: 'MOVE_OBJECT_COMMIT',
  payload: {
    id: string,
    x: number,
    y: number,
    previousX: number,
    previousY: number
  }
}
```

#### Hover-эффекты

При наведении на цели:

- **Колоды**: Подсветка колоды
- **Пулы**: Подсветка пула
- **Рука игрока**: Подсветка панели руки

### 4.4 Привязка к сетке (Grid Snapping)

#### Включение привязки

- Через контекстное меню объекта
- Или через настройки колоды/доски

#### Расчёт позиции

```
snappedX = round(x / gridSize) * gridSize
snappedY = round(y / gridSize) * gridSize
```

#### Для шестиугольной сетки

Используется специальный расчёт с учётом формы шестиугольника.

---

## 5. Инструменты и рисование

### 5.1 Инструменты рисования

#### Marker (Маркер)

| Параметр | Диапазон | Описание |
|----------|----------|----------|
| color | Любой HEX | Цвет линии |
| thickness | 1-50 | Толщина линии |
| opacity | 0-100 | Прозрачность (%) |

#### Eraser (Ластик)

Удаляет штрихи из рисунка. Размер регулируется.

#### Ruler (Линейка)

Измеряет расстояние между двумя точками.

#### Compass (Циркуль)

Рисует круги и дуги с заданным радиусом.

### 5.2 Система слоёв рисования

#### Структура слоёв

```typescript
DrawingData {
  id: string
  name: string
  x, y: number        // Позиция
  width, height: number
  color: string
  opacity: number
  layers: DrawingLayer[]
}
```

#### DrawingLayer

```typescript
DrawingLayer {
  id: string
  name: string
  visible: boolean
  strokes: Stroke[]
}
```

#### Stroke (Штрих)

```typescript
Stroke {
  id: string
  points: Point[]
  color: string
  thickness: number
  tool: 'marker' | 'eraser' | 'ruler' | 'compass'
}
```

### 5.3 Действия с рисунками

| Действие | Описание |
|----------|----------|
| CREATE_DRAWING_OBJECT | Создать новый рисунок |
| ADD_STROKE_TO_DRAWING | Добавить штрих |
| FINISH_DRAWING_STROKE | Завершить штрих |
| MERGE_DRAWINGS | Объединить рисунки |
| CLEAR_DRAWING_LAYER | Очистить слой |

---

## 6. Интерфейс пользователя

### 6.1 Главный экран (Tabletop)

#### Основные элементы

```
┌─────────────────────────────────────────────────────┐
│  (Стол с объектами)                                 │
│                                                     │
│    ┌──────┐  ┌───┐  ┌─────┐                       │
│    │Колода│  │Кар│  │Токен│                       │
│    └──────┘  └───┘  └─────┘                       │
│                                                     │
│  (Панели и окна)                                    │
└─────────────────────────────────────────────────────┘
```

### 6.2 Главное меню (Правая панель)

#### Вкладки меню

| Вкладка | Описание |
|---------|----------|
| Create | Создание новых объектов |
| Hand | Управление рукой игрока |
| Chat | Чат между игроками |
| Players | Управление игроками |
| Tools | Инструменты рисования |

#### Вкладка Create

Разделы создания объектов:

| Раздел | Объекты |
|--------|---------|
| Boards | Доски с сеткой |
| Tokens | Токены разных форм |
| Dice | Кубики (d4, d6, d8, d10, d12, d20, custom) |
| Counters | Счётчики |
| Decks | Стандартная колода |
| Spinners | Рулетки |

#### Вкладка Hand

- Список карт в руке
- Масштаб карт (0.5x - 2x)
- Перетаскивание для изменения порядка
- Контекстное меню на карте

#### Вкладка Chat

- История сообщений
- Поле ввода
- Отправка по Enter

#### Вкладка Players

- Список подключённых игроков
- Цвет игрока
- Роль (GM/игрок)
- Кнопка изменения роли

#### Вкладка Tools

- Выбор инструмента (Marker, Eraser, Ruler, Compass)
- Настройки цвета
- Настройки толщины
- Настройки прозрачности

### 6.3 Панели и окна

#### Типы панелей (PanelType)

| Тип | Описание |
|-----|----------|
| MAIN_MENU | Главное меню |
| HAND | Рука игрока |
| DECK_SEARCH | Поиск по колоде |
| DECK_BUILD | Редактор колоды |
| CHAT | Чат |
| PLAYERS | Игроки |
| CREATE | Создание объектов |
| TOOLS | Инструменты |
| TABLEAU | Табло |
| PULL | Вытягивание |

#### Типы окон (WindowType)

| Тип | Описание |
|-----|----------|
| OBJECT_SETTINGS | Настройки объекта |
| DELETE_CONFIRM | Подтверждение удаления |
| TOP_DECK | Верх колоды |

#### Управление панелями

- **Minimize**: Свернуть/развернуть
- **Resize**: Изменить размер
- **Close**: Закрыть
- **Pin**: Закрепить на экране

### 6.4 Рука игрока (HandPanel)

#### Функциональность

| Действие | Описание |
|----------|----------|
| Drag & Drop | Изменить порядок карт |
| Scale | Изменить размер карт |
| Context Menu | Действия с картой |
| Drop target | Принять объект из курсор-слота |

#### Масштабирование

| Значение | Описание |
|----------|----------|
| 0.5x | Очень мелко |
| 0.75x | Мелко |
| 1.0x | Нормально |
| 1.25x | Крупно |
| 1.5x | Очень крупно |
| 2.0x | Огромно |

### 6.5 Модальные окна

#### SearchDeckModal

Просмотр и поиск в колоде:

- Фильтр по face up/face down
- Список всех карт
- Действия: взять, посмотреть, переместить

#### TopDeckModal

Просмотр верхней карты колоды:

- Показывает верхнюю карту
- Режим "последний вид игроками"
- Действия с верхней картой

#### ObjectSettingsModal

Настройки объекта с вкладками:

| Вкладка | Настройки |
|---------|-----------|
| General | Имя, размер, позиция, вращение |
| Actions | Разрешённые действия, кнопки |
| Cards | Настройки карт (для колод) |
| Piles | Управление пулами (для колод) |
| Sprite | Настройки спрайтов (для колод) |

---

## 7. Управление игрой

### 7.1 Система игроков

#### Роли игроков

| Роль | Права |
|-----|-------|
| Game Master (GM) | Полный контроль над всеми объектами |
| Player | Ограниченные права (задаётся GM) |

#### PlayerPermissions

```typescript
PlayerPermissions {
  canCreateObjects: boolean
  canConfigureObjects: boolean
  canDeleteObjects: boolean
  canShowHiddenObjects: boolean
  canMoveLockedObjects: boolean
}
```

#### Управление игроками

| Действие | Описание |
|----------|----------|
| ADD_PLAYER | Добавить игрока |
| REMOVE_PLAYER | Удалить игрока |
| UPDATE_PLAYER_NAME | Изменить имя |
| SWITCH_ROLE | Сменить роль (GM/Player) |

### 7.2 Система отмены (Undo)

#### Типы истории

| Тип | Описание | Лимит |
|-----|----------|-------|
| Marker History | Действия с рисованием | 10 |
| General History | Все остальные действия | 100 |

#### Маркеры истории

```typescript
MarkerHistoryEntry {
  type: 'marker' | 'eraser' | 'ruler' | 'compass'
  layerId: string
  strokeId?: string
  previousData?: any
}
```

#### Общая история

```typescript
GeneralHistoryEntry {
  type: 'object-moved' | 'object-added' | ...
  objectId: string
  previousX?: number
  previousY?: number
}
```

### 7.3 Автосохранение

#### Параметры сохранения

| Параметр | Значение |
|----------|----------|
| Ключ localStorage | `nexus-game-state` |
| Версия формата | 1 |
| Задержка (debounce) | 500 мс |
| Максимальный возраст | 7 дней |

#### Сохраняемые данные

```typescript
StoredGameState {
  version: number
  timestamp: number
  state: {
    objects: Record<string, TableObject>
    players: Player[]
    activePlayerId: string
    diceRolls: DiceRoll[]
    viewTransform: ViewTransform
    drawings: DrawingData[]
    playerPermissions: PlayerPermissions
    language: AppLanguage
    sessionId: string
  }
}
```

#### Действия с сохранением

| Действие | Описание |
|----------|----------|
| saveGameState | Сохранить в localStorage |
| loadGameState | Загрузить из localStorage |
| clearGameState | Удалить сохранение |
| hasSavedGameState | Проверить наличие |
| getSavedGameTimestamp | Получить время сохранения |

---

## 8. Мультиплеер

### 8.1 Архитектура мультиплеера

#### Peer.js (WebRTC)

Приложение использует Peer.js для P2P соединения:

```
Host (Server)              Guest (Client)
     │                          │
     │  ← Создаёт Peer →       │
     │                          │
     │  ← Гость подключается → │
     │                          │
     │  ← Синхронизация state → │
     │                          │
```

#### Модель Host/Guest

| Роль | Описание |
|-----|----------|
| Host | Создаёт комнату, хранит state, транслирует изменения |
| Guest | Подключается к Host, получает state, отправляет действия |

### 8.2 Соединение

#### Создание комнаты (Host)

1. Открыть приложение
2. Скопировать Peer ID из URL
3. Отправить ID друзьям

#### Подключение к комнате (Guest)

1. Перейти по ссылке с `?hostId=<peer_id>`
2. Ввести имя игрока
3. Подключиться к хосту

### 8.3 Синхронизация состояния

#### Типы сообщений

| Тип | Описание |
|-----|----------|
| SYNC_STATE | Полная синхронизация состояния |
| HELO | Приветствие нового игрока |
| ACTION | Действие от гостя |
| UPDATE_PLAYER_NAME | Изменение имени игрока |

#### Фильтрация локальных объектов

При трансляции состояния фильтруются:

- Окна с `ownerId` (локальные для владельца)

```typescript
const stateForBroadcast = {
  ...state,
  objects: Object.entries(state.objects)
    .filter(([id, obj]) =>
      !(obj.type === ItemType.WINDOW && obj.ownerId)
    )
};
```

### 8.4 Сетевые действия

#### Локальные действия (_localOnly)

Некоторые действия не отправляются по сети:

- `UPDATE_VIEW_TRANSFORM` — локальный масштаб/панов
- Локальные UI действия

#### Commit-действия

Действия, требующие подтверждения:

- `MOVE_OBJECT_COMMIT` — фиксация перемещения
- `FINISH_DRAWING_STROKE` — завершение штриха

---

## 9. Настройки и конфигурация

### 9.1 Настройки объектов

#### Общие настройки

| Параметр | Тип | Описание |
|----------|-----|----------|
| id | string | Уникальный идентификатор |
| name | string | Отображаемое название |
| x, y | number | Позиция |
| width, height | number | Размер |
| rotation | number | Угол вращения |
| zIndex | number | Порядок отрисовки |
| locked | boolean | Заблокирован ли объект |
| isOnTable | boolean | Виден ли на столе |

#### Действия (Actions)

```typescript
ContextAction =
  // Общие
  | 'clone' | 'delete' | 'lock' | 'pin'
  // Вращение
  | 'rotate' | 'rotateClockwise' | 'rotateCounterClockwise'
  | 'swingClockwise' | 'swingCounterClockwise'
  // Слои
  | 'layerUp' | 'layerDown'
  // Карты
  | 'flip' | 'moveToHand' | 'moveToTopDeck' | 'moveToBottomDeck'
  // Колоды
  | 'draw' | 'playTopCard' | 'shuffleDeck' | 'searchDeck'
  | 'millTopCard' | 'toBottom' | 'returnAll'
```

#### Кнопки действий (Action Buttons)

Быстрые кнопки на объекте:

```typescript
actionButtons: ContextAction[]
singleClickAction: ClickAction
doubleClickAction: ClickAction
```

### 9.2 Настройки колоды

#### Карточные настройки

| Параметр | Описание |
|----------|----------|
| cardShape | Форма карт |
| cardOrientation | Ориентация (VERTICAL/HORIZONTAL) |
| cardWidth/cardHeight | Размер карт |
| cardNamePosition | Позиция названия (none/top/bottom) |

#### Пулы

```typescript
CardPile {
  id: string
  name: string
  deckId: string
  position: 'left' | 'right' | 'top' | 'bottom'
  cardIds: string[]
  faceUp: boolean
  visible: boolean
  size: number (1-5)
  isMillPile: boolean
  locked: boolean
  showTopCard: boolean
}
```

#### Спрайт-листы

```typescript
CardSpriteConfig {
  spriteUrl: string
  spriteColumns: number
  spriteRows: number
}
```

### 9.3 Языковые настройки

#### Поддерживаемые языки

| Код | Язык |
|-----|------|
| en | English |
| ru | Русский |

#### Переключение языка

Через Settings → Language или через action:

```typescript
dispatch({ type: 'UPDATE_LANGUAGE', payload: 'ru' })
```

---

## 10. Горячие клавиши

### Основные сочетания

| Клавиша | Действие |
|---------|----------|
| Shift + Click | Положить объект в курсор-слот |
| Shift + Click (на цели) | Переместить объект из слота |
| Правый клик | Открыть контекстное меню |
| Колёсико мыши | Масштаб (zoom) |
| Средняя кнопка / Space + Drag | Панорама (pan) |

### Инструменты

| Клавиша | Действие |
|---------|----------|
| M | Маркер |
| E | Ластик |
| R | Линейка |
| C | Циркуль |
| N | Нет инструмента |

### Отмена

| Клавиша | Действие |
|---------|----------|
| Ctrl + Z | Отменить последнее действие |

---

## 11. Техническая реализация

### 11.1 Стек технологий

| Технология | Версия | Назначение |
|------------|--------|------------|
| React | 18.x | UI фреймворк |
| TypeScript | Latest | Типизация |
| Vite | Latest | Сборщик |
| PeerJS | Latest | WebRTC мультиплеер |
| Lucide React | Latest | Иконки |

### 11.2 Константы

#### Размеры по умолчанию

```typescript
CARD_WIDTH = 120
CARD_HEIGHT = 168
DEFAULT_DECK_WIDTH = 120
DEFAULT_DECK_HEIGHT = 168
TOKEN_SIZE = 80
DEFAULT_DICE_SIZE = 60
DEFAULT_COUNTER_WIDTH = 60
DEFAULT_COUNTER_HEIGHT = 60
MAIN_MENU_WIDTH = 300
DEFAULT_PANEL_WIDTH = 300
DEFAULT_PANEL_HEIGHT = 400
```

#### Z-index по умолчанию

```typescript
Z_INDEX = {
  BOARD: -100,
  DECK: 0,
  ARCHETYPE: -50,
  PANEL: 1000,
  WINDOW: 10000,
  DRAGGING: 9999
}
```

### 11.3 Performance оптимизации

#### React.memo

Используется для компонентов:
- UIObjectRenderer
- BoardWithResize
- Card
- Token

#### useMemo/useCallback

Оптимизация:
- Расчёты геометрии
- Обработчики событий
- Фильтрация списков

#### Canvas для рисования

Рисунки рендерятся на Canvas для производительности.

### 11.4 Безопасность

#### Валидация действий

Все действия проверяются перед отправкой:

```typescript
if (obj.locked && !isGM) return;
if (action.type === 'DELETE' && !permissions.canDeleteObjects) return;
```

#### Защита GM-функций

Критические действия доступны только GM:
- Удаление объектов
- Изменение прав доступа
- Управление видимостью

---

## Приложение: Полный список типов действий (Action Types)

### Объекты

| Action | Payload |
|--------|---------|
| ADD_OBJECT | TableObject |
| UPDATE_OBJECT | Partial<TableObject> & { id: string } |
| MOVE_OBJECT | { id: string; x: number; y: number } |
| MOVE_OBJECT_COMMIT | { id: string; x: number; y: number; previousX: number; previousY: number } |
| DELETE_OBJECT | { id: string } |
| CLONE_OBJECT | { id: string } |
| TOGGLE_LOCK | { id: string } |
| TOGGLE_ON_TABLE | { id: string } |
| ROTATE_OBJECT | { id: string; angle?: number } |
| SET_ROTATION | { id: string; rotation: number } |
| MOVE_LAYER_UP | { id: string } |
| MOVE_LAYER_DOWN | { id: string } |

### Карты и колоды

| Action | Payload |
|--------|---------|
| DRAW_CARD | { deckId: string; playerId: string } |
| PLAY_CARD | { cardId: string; x: number; y: number } |
| PLAY_TOP_CARD | { deckId: string } |
| SHUFFLE_DECK | { deckId: string } |
| FLIP_CARD | { cardId: string } |
| RETURN_TO_DECK | { cardId: string } |
| ADD_CARD_TO_TOP_OF_DECK | { cardId: string; deckId: string } |
| ADD_CARD_TO_PILE | { cardId: string; pileId: string; deckId: string } |
| DRAW_FROM_PILE | { pileId: string; deckId: string; playerId: string } |
| RETURN_ALL_CARDS_TO_DECK | { deckId: string; fromPile?: boolean; pileId?: string } |
| RETURN_CARD_TO_DECK_TOP | { cardId: string; deckId: string } |
| RETURN_CARD_TO_DECK_BOTTOM | { cardId: string; deckId: string } |
| TOGGLE_SHOW_TOP_CARD | { deckId: string; pileId?: string } |
| MILL_CARD_TO_BOTTOM | { cardId: string; deckId: string } |
| MILL_CARD_TO_PILE | { cardId: string; deckId: string; pileId: string } |
| UPDATE_DECK_CARD_DIMENSIONS | { deckId: string; cardWidth?: number; cardHeight?: number } |

### Разное

| Action | Payload |
|--------|---------|
| ROLL_DICE_LOG | { value: number; playerName: string } |
| ROLL_PHYSICAL_DICE | { id: string } |
| UPDATE_COUNTER | { id: string; delta: number } |
| SWITCH_ROLE | { playerId: string } |
| SWING_CLOCKWISE | { id: string } |
| SWING_COUNTER_CLOCKWISE | { id: string } |
| PIN_TO_VIEWPORT | { id: string; screenX: number; screenY: number } |
| UNPIN_FROM_VIEWPORT | { id: string; worldX: number; worldY: number } |
| DROP_FROM_CURSOR_SLOT | { objectId: string; x: number; y: number; zIndex?: number } |

### UI

| Action | Payload |
|--------|---------|
| CREATE_PANEL | { panelType: PanelType; x?: number; y?: number; width?: number; height?: number; title?: string; deckId?: string } |
| CREATE_WINDOW | { windowType: WindowType; x?: number; y?: number; title?: string; targetObjectId?: string } |
| CLOSE_UI_OBJECT | { id: string } |
| TOGGLE_MINIMIZE | { id: string } |
| RESIZE_UI_OBJECT | { id: string; width: number; height: number } |

### Игроки и состояние

| Action | Payload |
|--------|---------|
| ADD_PLAYER | Player |
| REMOVE_PLAYER | { id: string } |
| UPDATE_PLAYER_NAME | { playerId: string; name: string } |
| UPDATE_PLAYER_PERMISSIONS | PlayerPermissions |
| SET_ACTIVE_ID | string |
| UPDATE_LANGUAGE | AppLanguage |
| UPDATE_VIEW_TRANSFORM | ViewTransform |
| LOAD_GAME | GameState |
| SYNC_STATE | GameState |
| CLEAR_SAVED_STATE | - |

### Рисование

| Action | Payload |
|--------|---------|
| CREATE_DRAWING_OBJECT | { strokes: Stroke[]; x: number; y: number; width: number; height: number; name?: string; opacity?: number } |
| ADD_STROKE_TO_DRAWING | { drawingId: string; stroke: Stroke } |
| FINISH_DRAWING_STROKE | { drawingId?: string; stroke: Stroke; bounds: { x: number; y: number; width: number; height: number }; opacity?: number } |
| MERGE_DRAWINGS | { sourceId: string; targetId: string } |
| ADD_STROKE | { stroke: Stroke; layerId: string } |
| DELETE_STROKE | { strokeId: string; layerId: string } |
| CREATE_DRAWING_LAYER | Omit<DrawingLayer, 'id'> |
| DELETE_DRAWING_LAYER | { layerId: string } |
| UPDATE_DRAWING_LAYER | { layerId: string; updates: Partial<DrawingLayer> } |
| CLEAR_DRAWING_LAYER | { layerId: string } |

### Undo

| Action | Payload |
|--------|---------|
| UNDO_MARKER | - |
| UNDO_GENERAL | - |

### Архетипы

| Action | Payload |
|--------|---------|
| SPAWN_TOKEN_FROM_ARCHETYPE | { archetypeId: string; x: number; y: number } |

---

*Документация создана автоматически на основе анализа исходного кода NexusGameTable.*
