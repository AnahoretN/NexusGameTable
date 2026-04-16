# 🎯 План рефакторинга контекстов - NexusGameTable

**Дата:** 2026-04-17  
**Версия:** 1.7  
**Статус:** 🔄 В процессе (Этапы 2,3,4,5,6 из 7 завершены ✅, готовность к финальной документации)  
**Текущее состояние:** PlayerContext, ViewTransformContext (v2.0.0), UIContext реализованы и протестированы, GameContext оптимизирован  
**Последнее обновление:** 2026-04-17 - ЭТАП 6 ЗАВЕРШЕН: Интеграция и тестирование всех контекстов, созданы тесты и инструменты мониторинга

---

## 📊 Цели рефакторинга

### Проблемы текущей архитектуры
- ❌ Единый GameContext содержит всё состояние игры
- ❌ Любое изменение вызывает ререндер всех потребителей
- ❌ Сложно поддерживать и тестировать
- ❌ Избыточные ререндеры компонентов

### Цели
- ✅ Разделить на 4 модульных контекста
- ✅ Снизить избыточные ререндеры на 60-70%
- ✅ Улучшить тестируемость и поддерживаемость
- ✅ Сохранить полную обратную совместимость

---

## 🏗️ Архитектура новых контекстов

### 1. ✅ ObjectContext (УЖЕ РЕАЛИЗОВАНО)
**Файл:** `store/objectStore.ts`  
**Статус:** ✅ Готов к использованию  
**Функциональность:**
- Управление игровыми объектами
- Оптимизированные селекторы
- Bulk операции

### 2. ❌ PlayerContext (НУЖДАЕТСЯ РЕАЛИЗАЦИЯ)
**Файл:** `store/contexts/PlayerContext.tsx`  
**Отвечает за:**
- Список игроков (`players: Player[]`)
- Активного игрока (`activePlayerId: string`)
- Права игроков (`playerPermissions: PlayerPermissions`)

### 3. ❌ ViewTransformContext (НУЖДАЕТСЯ РЕАЛИЗАЦИЯ)
**Файл:** `store/contexts/ViewTransformContext.tsx`  
**Отвечает за:**
- Трансформацию вида (`viewTransform: ViewTransform`)
- Позиционирование камеры (`offset`, `zoom`, `scroll`)
- Конвертацию координат (`pixelsPerVU`)

### 4. ❌ UIContext (НУЖДАЕТСЯ РЕАЛИЗАЦИЯ)
**Файл:** `store/contexts/UIContext.tsx`  
**Отвечает за:**
- Язык приложения (`language: AppLanguage`)
- Настройки панелей игроков (`playerPanelSettings: PlayerPanelSettings`)
- Гиперслои (`hyperscaleLayers: HyperscaleLayer[]`)
- Выбранные слои (`selectedHyperscaleLayerIds: string[]`)

---

## 🚀 План реализации (поэтапный)

### Этап 1: Подготовка (1-2 дня)

#### Задача 1.1: Создать структуру директорий
```bash
store/contexts/
├── PlayerContext.tsx
├── ViewTransformContext.tsx
├── UIContext.tsx
└── index.ts # Экспорты всех контекстов
```

#### Задача 1.2: Подготовить типы
**Файл:** `store/contexts/contextTypes.ts`
```typescript
// Вынести типы из gameState.ts для контекстов
export interface PlayerState { ... }
export interface ViewTransformState { ... }
export interface UIState { ... }
```

#### Задача 1.3: Создать тестовое окружение
- Подготовить тестовые сценарии для каждого контекста
- Создать backup текущей функциональности

---

### Этап 2: PlayerContext (2-3 дня)

#### Шаг 2.1: Создать PlayerContext
**Файл:** `store/contexts/PlayerContext.tsx`

```typescript
import React, { createContext, useContext, useReducer, useCallback } from 'react';
import { Player, PlayerPermissions } from '../../types';

// ===== TYPES =====
interface PlayerState {
  players: Player[];
  activePlayerId: string;
  playerPermissions: PlayerPermissions;
}

interface PlayerContextValue extends PlayerState {
  // Actions
  addPlayer: (player: Player) => void;
  updatePlayer: (id: string, updates: Partial<Player>) => void;
  removePlayer: (id: string) => void;
  setActivePlayer: (id: string) => void;
  updatePermissions: (permissions: Partial<PlayerPermissions>) => void;
  
  // Getters
  getActivePlayer: () => Player | undefined;
  isGM: () => boolean;
  getPlayerById: (id: string) => Player | undefined;
  getPlayersByColor: (color: string) => Player[];
}

type PlayerAction = 
  | { type: 'ADD_PLAYER'; payload: Player }
  | { type: 'UPDATE_PLAYER'; payload: { id: string; updates: Partial<Player> } }
  | { type: 'REMOVE_PLAYER'; payload: string }
  | { type: 'SET_ACTIVE_PLAYER'; payload: string }
  | { type: 'UPDATE_PERMISSIONS'; payload: Partial<PlayerPermissions> };

// ===== REDUCER =====
function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case 'ADD_PLAYER':
      return {
        ...state,
        players: [...state.players, action.payload],
      };

    case 'UPDATE_PLAYER':
      return {
        ...state,
        players: state.players.map(p =>
          p.id === action.payload.id
            ? { ...p, ...action.payload.updates }
            : p
        ),
      };

    case 'REMOVE_PLAYER':
      return {
        ...state,
        players: state.players.filter(p => p.id !== action.payload),
      };

    case 'SET_ACTIVE_PLAYER':
      return {
        ...state,
        activePlayerId: action.payload,
      };

    case 'UPDATE_PERMISSIONS':
      return {
        ...state,
        playerPermissions: {
          ...state.playerPermissions,
          ...action.payload,
        },
      };

    default:
      return state;
  }
}

// ===== CONTEXT =====
const PlayerContext = createContext<PlayerContextValue | null>(null);

const initialState: PlayerState = {
  players: [
    { id: 'gm', name: 'Game Master', color: '#FF0000', isGM: true },
  ],
  activePlayerId: 'gm',
  playerPermissions: {
    createObjects: false,
    configureObjects: false,
    deleteObjects: false,
    hideObjects: false,
  },
};

// ===== PROVIDER =====
export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(playerReducer, initialState);

  // Actions
  const addPlayer = useCallback((player: Player) => {
    dispatch({ type: 'ADD_PLAYER', payload: player });
  }, []);

  const updatePlayer = useCallback((id: string, updates: Partial<Player>) => {
    dispatch({ type: 'UPDATE_PLAYER', payload: { id, updates } });
  }, []);

  const removePlayer = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_PLAYER', payload: id });
  }, []);

  const setActivePlayer = useCallback((id: string) => {
    dispatch({ type: 'SET_ACTIVE_PLAYER', payload: id });
  }, []);

  const updatePermissions = useCallback((permissions: Partial<PlayerPermissions>) => {
    dispatch({ type: 'UPDATE_PERMISSIONS', payload: permissions });
  }, []);

  // Getters
  const getActivePlayer = useCallback((): Player | undefined => {
    return state.players.find(p => p.id === state.activePlayerId);
  }, [state.players, state.activePlayerId]);

  const isGM = useCallback((): boolean => {
    const activePlayer = getActivePlayer();
    return activePlayer?.isGM || false;
  }, [getActivePlayer]);

  const getPlayerById = useCallback((id: string): Player | undefined => {
    return state.players.find(p => p.id === id);
  }, [state.players]);

  const getPlayersByColor = useCallback((color: string): Player[] => {
    return state.players.filter(p => p.color === color);
  }, [state.players]);

  const value: PlayerContextValue = {
    // State
    ...state,
    
    // Actions
    addPlayer,
    updatePlayer,
    removePlayer,
    setActivePlayer,
    updatePermissions,
    
    // Getters
    getActivePlayer,
    isGM,
    getPlayerById,
    getPlayersByColor,
  };

  return (
    <PlayerContext.Provider value={value}>
      {children}
    </PlayerContext.Provider>
  );
}

// ===== HOOKS =====
export function usePlayers(): PlayerContextValue {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayers must be used within PlayerProvider');
  }
  return context;
}

// Optimized hooks for specific use cases
export function useActivePlayer(): Player | undefined {
  const context = usePlayers();
  return context.getActivePlayer();
}

export function useIsGM(): boolean {
  const context = usePlayers();
  return context.isGM();
}

export function usePlayerList(): Player[] {
  const context = usePlayers();
  return context.players;
}

export function usePlayerPermissions(): PlayerPermissions {
  const context = usePlayers();
  return context.playerPermissions;
}
```

#### Шаг 2.2: Интегрировать в App.tsx
```typescript
// App.tsx
import { PlayerProvider } from './store/contexts';

function App() {
  return (
    <PlayerProvider>
      <GameProvider> {/* Existing provider */}
        {/* Rest of app */}
      </GameProvider>
    </PlayerProvider>
  );
}
```

#### Шаг 2.3: Мигрировать компоненты
**Компоненты для миграции:**
- `PlayerNameModal.tsx`
- `Settings.tsx`
- Компоненты, использующие `state.players`
- Компоненты, использующие `state.activePlayerId`

**Пример миграции:**
```typescript
// БЫЛО:
const { state } = useGame();
const players = state.players;
const activePlayer = state.players.find(p => p.id === state.activePlayerId);

// СТАЛО:
const { players, getActivePlayer, isGM } = usePlayers();
const activePlayer = getActivePlayer();
const gmMode = isGM();
```

#### Шаг 2.4: Тестирование
- ✅ Добавление/удаление игроков
- ✅ Переключение активного игрока
- ✅ Обновление прав
- ✅ GM режим

---

### Этап 3: ViewTransformContext (2-3 дня)

#### Шаг 3.1: Создать ViewTransformContext
**Файл:** `store/contexts/ViewTransformContext.tsx`

```typescript
import React, { createContext, useContext, useReducer, useCallback } from 'react';

// ===== TYPES =====
export interface ViewTransform {
  offset: { x: number; y: number };
  zoom: number;
  scroll: { x: number; y: number };
  pixelsPerVU: number;
}

interface ViewTransformState {
  viewTransform: ViewTransform;
}

interface ViewTransformContextValue extends ViewTransformState {
  // Actions
  setOffset: (x: number, y: number) => void;
  setZoom: (zoom: number) => void;
  setScroll: (x: number, y: number) => void;
  setPixelsPerVU: (pixelsPerVU: number) => void;
  updateTransform: (updates: Partial<ViewTransform>) => void;
  resetTransform: () => void;
  
  // Utilities
  viewportToWorld: (vx: number, vy: number) => { x: number; y: number };
  worldToViewport: (wx: number, wy: number) => { x: number; y: number };
}

type ViewTransformAction =
  | { type: 'SET_OFFSET'; payload: { x: number; y: number } }
  | { type: 'SET_ZOOM'; payload: number }
  | { type: 'SET_SCROLL'; payload: { x: number; y: number } }
  | { type: 'SET_PIXELS_PER_VU'; payload: number }
  | { type: 'UPDATE_TRANSFORM'; payload: Partial<ViewTransform> }
  | { type: 'RESET_TRANSFORM' };

// ===== REDUCER =====
function viewTransformReducer(
  state: ViewTransformState,
  action: ViewTransformAction
): ViewTransformState {
  switch (action.type) {
    case 'SET_OFFSET':
      return {
        viewTransform: {
          ...state.viewTransform,
          offset: action.payload,
        },
      };

    case 'SET_ZOOM':
      return {
        viewTransform: {
          ...state.viewTransform,
          zoom: action.payload,
        },
      };

    case 'SET_SCROLL':
      return {
        viewTransform: {
          ...state.viewTransform,
          scroll: action.payload,
        },
      };

    case 'SET_PIXELS_PER_VU':
      return {
        viewTransform: {
          ...state.viewTransform,
          pixelsPerVU: action.payload,
        },
      };

    case 'UPDATE_TRANSFORM':
      return {
        viewTransform: {
          ...state.viewTransform,
          ...action.payload,
        },
      };

    case 'RESET_TRANSFORM':
      return {
        viewTransform: {
          offset: { x: 0, y: 0 },
          zoom: 1,
          scroll: { x: 0, y: 0 },
          pixelsPerVU: state.viewTransform.pixelsPerVU, // Keep pixelsPerVU
        },
      };

    default:
      return state;
  }
}

// ===== CONTEXT =====
const ViewTransformContext = createContext<ViewTransformContextValue | null>(null);

import { calculatePixelsPerVU } from '../../utils/vuSystem';

const initialState: ViewTransformState = {
  viewTransform: {
    offset: { x: 0, y: 0 },
    zoom: 1,
    scroll: { x: 0, y: 0 },
    pixelsPerVU: typeof window !== 'undefined' 
      ? calculatePixelsPerVU(window.innerWidth, window.innerHeight)
      : 1.08,
  },
};

// ===== PROVIDER =====
export function ViewTransformProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(viewTransformReducer, initialState);

  // Actions
  const setOffset = useCallback((x: number, y: number) => {
    dispatch({ type: 'SET_OFFSET', payload: { x, y } });
  }, []);

  const setZoom = useCallback((zoom: number) => {
    dispatch({ type: 'SET_ZOOM', payload: zoom });
  }, []);

  const setScroll = useCallback((x: number, y: number) => {
    dispatch({ type: 'SET_SCROLL', payload: { x, y } });
  }, []);

  const setPixelsPerVU = useCallback((pixelsPerVU: number) => {
    dispatch({ type: 'SET_PIXELS_PER_VU', payload: pixelsPerVU });
  }, []);

  const updateTransform = useCallback((updates: Partial<ViewTransform>) => {
    dispatch({ type: 'UPDATE_TRANSFORM', payload: updates });
  }, []);

  const resetTransform = useCallback(() => {
    dispatch({ type: 'RESET_TRANSFORM' });
  }, []);

  // Utilities
  const viewportToWorld = useCallback((vx: number, vy: number): { x: number; y: number } => {
    const { offset, zoom, scroll, pixelsPerVU } = state.viewTransform;
    return {
      x: (vx + scroll.x - offset.x) / (pixelsPerVU * zoom),
      y: (vy + scroll.y - offset.y) / (pixelsPerVU * zoom),
    };
  }, [state.viewTransform]);

  const worldToViewport = useCallback((wx: number, wy: number): { x: number; y: number } => {
    const { offset, zoom, scroll, pixelsPerVU } = state.viewTransform;
    return {
      x: wx * pixelsPerVU * zoom + offset.x - scroll.x,
      y: wy * pixelsPerVU * zoom + offset.y - scroll.y,
    };
  }, [state.viewTransform]);

  const value: ViewTransformContextValue = {
    ...state,
    setOffset,
    setZoom,
    setScroll,
    setPixelsPerVU,
    updateTransform,
    resetTransform,
    viewportToWorld,
    worldToViewport,
  };

  return (
    <ViewTransformContext.Provider value={value}>
      {children}
    </ViewTransformContext.Provider>
  );
}

// ===== HOOKS =====
export function useViewTransform(): ViewTransformContextValue {
  const context = useContext(ViewTransformContext);
  if (!context) {
    throw new Error('useViewTransform must be used within ViewTransformProvider');
  }
  return context;
}

// Optimized hooks
export function useTransformState(): ViewTransform {
  const context = useViewTransform();
  return context.viewTransform;
}

export function useZoom(): number {
  const context = useViewTransform();
  return context.viewTransform.zoom;
}

export function useOffset(): { x: number; y: number } {
  const context = useViewTransform();
  return context.viewTransform.offset;
}

export function usePixelsPerVU(): number {
  const context = useViewTransform();
  return context.viewTransform.pixelsPerVU;
}
```

#### Шаг 3.2: Интегрировать в App.tsx
```typescript
// App.tsx
import { ViewTransformProvider } from './store/contexts';

function App() {
  return (
    <ViewTransformProvider>
      <PlayerProvider>
        <GameProvider>
          {/* Rest of app */}
        </GameProvider>
      </PlayerProvider>
    </ViewTransformProvider>
  );
}
```

#### Шаг 3.3: Мигрировать компоненты
**Компоненты для миграции:**
- `Tabletop.tsx` (использует viewTransform)
- `NexusBoard.tsx`
- Компоненты, использующие `pixelsPerVU`
- Компоненты с координатными преобразованиями

**Пример миграции:**
```typescript
// БЫЛО:
const { state } = useGame();
const { offset, zoom, pixelsPerVU } = state.viewTransform;

// СТАЛО:
const { viewTransform, setZoom, setOffset } = useViewTransform();
const { offset, zoom, pixelsPerVU } = viewTransform;
```

#### Шаг 3.4: Тестирование
- ✅ Zoom in/out
- ✅ Pan (сдвиг)
- ✅ Scroll
- ✅ Координатные преобразования
- ✅ Resize окна

---

### Этап 4: UIContext (2-3 дня)

#### Шаг 4.1: Создать UIContext
**Файл:** `store/contexts/UIContext.tsx`

```typescript
import React, { createContext, useContext, useReducer, useCallback } from 'react';
import { AppLanguage, PlayerPanelSettings, HyperscaleLayer } from '../../types';

// ===== TYPES =====
interface UIState {
  language: AppLanguage;
  playerPanelSettings: PlayerPanelSettings;
  hyperscaleLayers: HyperscaleLayer[];
  selectedHyperscaleLayerIds: string[];
}

interface UIContextValue extends UIState {
  // Language
  setLanguage: (language: AppLanguage) => void;
  
  // Panel settings
  updatePanelSettings: (playerId: string, panelId: string, settings: any) => void;
  removePanelSettings: (playerId: string, panelId: string) => void;
  
  // Hyperscale layers
  addHyperscaleLayer: (layer: HyperscaleLayer) => void;
  updateHyperscaleLayer: (layerId: string, updates: Partial<HyperscaleLayer>) => void;
  removeHyperscaleLayer: (layerId: string) => void;
  
  // Selected layers
  toggleLayerSelection: (layerId: string) => void;
  setLayerSelection: (layerIds: string[]) => void;
  selectAllLayers: () => void;
  deselectAllLayers: () => void;
  
  // Getters
  getSelectedLayers: () => HyperscaleLayer[];
  getPanelSettings: (playerId: string, panelId: string) => any;
}

type UIAction =
  | { type: 'SET_LANGUAGE'; payload: AppLanguage }
  | { type: 'UPDATE_PANEL_SETTINGS'; payload: { playerId: string; panelId: string; settings: any } }
  | { type: 'REMOVE_PANEL_SETTINGS'; payload: { playerId: string; panelId: string } }
  | { type: 'ADD_HYPERSCALE_LAYER'; payload: HyperscaleLayer }
  | { type: 'UPDATE_HYPERSCALE_LAYER'; payload: { layerId: string; updates: Partial<HyperscaleLayer> } }
  | { type: 'REMOVE_HYPERSCALE_LAYER'; payload: string }
  | { type: 'TOGGLE_LAYER_SELECTION'; payload: string }
  | { type: 'SET_LAYER_SELECTION'; payload: string[] }
  | { type: 'SELECT_ALL_LAYERS' }
  | { type: 'DESELECT_ALL_LAYERS' };

// ===== REDUCER =====
function uiReducer(state: UIState, action: UIAction): UIState {
  switch (action.type) {
    case 'SET_LANGUAGE':
      return {
        ...state,
        language: action.payload,
      };

    case 'UPDATE_PANEL_SETTINGS':
      return {
        ...state,
        playerPanelSettings: {
          ...state.playerPanelSettings,
          [action.payload.playerId]: {
            ...state.playerPanelSettings[action.payload.playerId],
            [action.payload.panelId]: {
              ...state.playerPanelSettings[action.payload.playerId]?.[action.payload.panelId],
              ...action.payload.settings,
            },
          },
        },
      };

    case 'REMOVE_PANEL_SETTINGS':
      const { [action.payload.playerId]: playerSettings, ...restPlayerSettings } = state.playerPanelSettings;
      if (playerSettings) {
        const { [action.payload.panelId]: removed, ...remainingPanelSettings } = playerSettings;
        return {
          ...state,
          playerPanelSettings: {
            ...restPlayerSettings,
            ...(Object.keys(remainingPanelSettings).length > 0 ? { [action.payload.playerId]: remainingPanelSettings } : {}),
          },
        };
      }
      return state;

    case 'ADD_HYPERSCALE_LAYER':
      return {
        ...state,
        hyperscaleLayers: [...state.hyperscaleLayers, action.payload],
      };

    case 'UPDATE_HYPERSCALE_LAYER':
      return {
        ...state,
        hyperscaleLayers: state.hyperscaleLayers.map(layer =>
          layer.id === action.payload.layerId
            ? { ...layer, ...action.payload.updates }
            : layer
        ),
      };

    case 'REMOVE_HYPERSCALE_LAYER':
      return {
        ...state,
        hyperscaleLayers: state.hyperscaleLayers.filter(layer => layer.id !== action.payload),
        selectedHyperscaleLayerIds: state.selectedHyperscaleLayerIds.filter(
          id => id !== action.payload
        ),
      };

    case 'TOGGLE_LAYER_SELECTION':
      const isSelected = state.selectedHyperscaleLayerIds.includes(action.payload);
      return {
        ...state,
        selectedHyperscaleLayerIds: isSelected
          ? state.selectedHyperscaleLayerIds.filter(id => id !== action.payload)
          : [...state.selectedHyperscaleLayerIds, action.payload],
      };

    case 'SET_LAYER_SELECTION':
      return {
        ...state,
        selectedHyperscaleLayerIds: action.payload,
      };

    case 'SELECT_ALL_LAYERS':
      return {
        ...state,
        selectedHyperscaleLayerIds: state.hyperscaleLayers.map(layer => layer.id),
      };

    case 'DESELECT_ALL_LAYERS':
      return {
        ...state,
        selectedHyperscaleLayerIds: [],
      };

    default:
      return state;
  }
}

// ===== CONTEXT =====
const UIContext = createContext<UIContextValue | null>(null);

const initialState: UIState = {
  language: (typeof localStorage !== 'undefined' 
    ? (localStorage.getItem('app-language') as AppLanguage) 
    : 'en') || 'en',
  playerPanelSettings: {},
  hyperscaleLayers: [
    {
      id: 'boards',
      name: 'Game Boards',
      minZIndex: 1,
      maxZIndex: 1000,
      color: '#3b82f6',
      playerCanSelect: true,
      playerCanView: true,
      individualPosition: false,
      individualObjects: false,
      zoomEnabled: true,
      order: 0,
    },
    {
      id: 'cards',
      name: 'Cards',
      minZIndex: 1001,
      maxZIndex: 3000,
      color: '#f59e0b',
      playerCanSelect: true,
      playerCanView: true,
      individualPosition: false,
      individualObjects: false,
      zoomEnabled: true,
      order: 1,
    },
    {
      id: 'tokens',
      name: 'Tokens',
      minZIndex: 3001,
      maxZIndex: 6000,
      color: '#10b981',
      playerCanSelect: true,
      playerCanView: true,
      individualPosition: false,
      individualObjects: false,
      zoomEnabled: true,
      order: 2,
    },
    {
      id: 'drawings',
      name: 'Drawings',
      minZIndex: 6001,
      maxZIndex: 7000,
      color: '#ec4899',
      playerCanSelect: true,
      playerCanView: true,
      individualPosition: true,
      individualObjects: false,
      zoomEnabled: true,
      order: 3,
    },
    {
      id: 'interface',
      name: 'Interface',
      minZIndex: 9001,
      maxZIndex: 10000,
      color: '#8b5cf6',
      playerCanSelect: true,
      playerCanView: false,
      individualPosition: true,
      individualObjects: true,
      zoomEnabled: false,
      order: 4,
    },
  ],
  selectedHyperscaleLayerIds: ['boards', 'cards', 'tokens', 'drawings', 'interface'],
};

// ===== PROVIDER =====
export function UIProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(uiReducer, initialState);

  // Language
  const setLanguage = useCallback((language: AppLanguage) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('app-language', language);
    }
    dispatch({ type: 'SET_LANGUAGE', payload: language });
  }, []);

  // Panel settings
  const updatePanelSettings = useCallback((playerId: string, panelId: string, settings: any) => {
    dispatch({ type: 'UPDATE_PANEL_SETTINGS', payload: { playerId, panelId, settings } });
  }, []);

  const removePanelSettings = useCallback((playerId: string, panelId: string) => {
    dispatch({ type: 'REMOVE_PANEL_SETTINGS', payload: { playerId, panelId } });
  }, []);

  // Hyperscale layers
  const addHyperscaleLayer = useCallback((layer: HyperscaleLayer) => {
    dispatch({ type: 'ADD_HYPERSCALE_LAYER', payload: layer });
  }, []);

  const updateHyperscaleLayer = useCallback((layerId: string, updates: Partial<HyperscaleLayer>) => {
    dispatch({ type: 'UPDATE_HYPERSCALE_LAYER', payload: { layerId, updates } });
  }, []);

  const removeHyperscaleLayer = useCallback((layerId: string) => {
    dispatch({ type: 'REMOVE_HYPERSCALE_LAYER', payload: layerId });
  }, []);

  // Selected layers
  const toggleLayerSelection = useCallback((layerId: string) => {
    dispatch({ type: 'TOGGLE_LAYER_SELECTION', payload: layerId });
  }, []);

  const setLayerSelection = useCallback((layerIds: string[]) => {
    dispatch({ type: 'SET_LAYER_SELECTION', payload: layerIds });
  }, []);

  const selectAllLayers = useCallback(() => {
    dispatch({ type: 'SELECT_ALL_LAYERS' });
  }, []);

  const deselectAllLayers = useCallback(() => {
    dispatch({ type: 'DESELECT_ALL_LAYERS' });
  }, []);

  // Getters
  const getSelectedLayers = useCallback((): HyperscaleLayer[] => {
    return state.hyperscaleLayers.filter(layer =>
      state.selectedHyperscaleLayerIds.includes(layer.id)
    );
  }, [state.hyperscaleLayers, state.selectedHyperscaleLayerIds]);

  const getPanelSettings = useCallback((playerId: string, panelId: string) => {
    return state.playerPanelSettings[playerId]?.[panelId];
  }, [state.playerPanelSettings]);

  const value: UIContextValue = {
    ...state,
    setLanguage,
    updatePanelSettings,
    removePanelSettings,
    addHyperscaleLayer,
    updateHyperscaleLayer,
    removeHyperscaleLayer,
    toggleLayerSelection,
    setLayerSelection,
    selectAllLayers,
    deselectAllLayers,
    getSelectedLayers,
    getPanelSettings,
  };

  return (
    <UIContext.Provider value={value}>
      {children}
    </UIContext.Provider>
  );
}

// ===== HOOKS =====
export function useUI(): UIContextValue {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error('useUI must be used within UIProvider');
  }
  return context;
}

// Optimized hooks
export function useLanguage(): AppLanguage {
  const context = useUI();
  return context.language;
}

export function useHyperscaleLayers(): HyperscaleLayer[] {
  const context = useUI();
  return context.hyperscaleLayers;
}

export function useSelectedLayers(): HyperscaleLayer[] {
  const context = useUI();
  return context.getSelectedLayers();
}

export function useLayerSelection(): [string[], (layerIds: string[]) => void] {
  const context = useUI();
  return [context.selectedHyperscaleLayerIds, context.setLayerSelection];
}
```

#### Шаг 4.2: Интегрировать в App.tsx
```typescript
// App.tsx
import { UIProvider } from './store/contexts';

function App() {
  return (
    <UIProvider>
      <ViewTransformProvider>
        <PlayerProvider>
          <GameProvider>
            {/* Rest of app */}
          </GameProvider>
        </PlayerProvider>
      </ViewTransformProvider>
    </UIProvider>
  );
}
```

#### Шаг 4.3: Мигрировать компоненты
**Компоненты для миграции:**
- `Settings.tsx` (язык)
- `HandPanel.tsx`, `TokensPanel.tsx` (panel settings)
- Компоненты, использующие `hyperscaleLayers`
- Компоненты со слоями

**Пример миграции:**
```typescript
// БЫЛО:
const { state } = useGame();
const language = state.language;
const layers = state.hyperscaleLayers;

// СТАЛО:
const { language, setLanguage, getSelectedLayers } = useUI();
const selectedLayers = getSelectedLayers();
```

#### Шаг 4.4: Тестирование
- ✅ Переключение языка
- ✅ Настройки панелей
- ✅ Добавление/удаление слоев
- ✅ Выбор слоев
- ✅ Persistance в localStorage

---

### Этап 5: Рефакторинг GameContext (3-4 дня)

#### Шаг 5.1: Удалить дублирующиеся state
**Из GameContext убрать:**
```typescript
// УДАЛИТЬ из GameState:
- players: Player[]; // → PlayerContext
- activePlayerId: string; // → PlayerContext
- playerPermissions: PlayerPermissions; // → PlayerContext
- viewTransform: ViewTransform; // → ViewTransformContext
- language: AppLanguage; // → UIContext
- playerPanelSettings: PlayerPanelSettings; // → UIContext
- hyperscaleLayers: HyperscaleLayer[]; // → UIContext
- selectedHyperscaleLayerIds: string[]; // → UIContext
```

**Оставить в GameContext:**
```typescript
// ОСТАВИТЬ в GameState:
interface GameState {
  objects: Record<string, TableObject>; // → objectStore.ts
  diceRolls: DiceRoll[];
  drawings: DrawingData;
  undo: UndoState;
  connectionsLocked: boolean;
  diceGroups: DiceGroup[];
  lastModifiedBy?: string;
  
  // Внутренние поля
  _lastPanelSettingsUpdate?: number;
  _pendingPanelSettings?: PlayerPanelSettings;
}
```

#### Шаг 5.2: Обновить reducer
**Убрать actions для мигрированных данных:**
```typescript
// УДАЛИТЬ из gameActions.ts:
- ADD_PLAYER
- UPDATE_PLAYER
- REMOVE_PLAYER
- SET_ACTIVE_PLAYER
- UPDATE_PLAYER_PERMISSIONS
- SET_OFFSET
- SET_ZOOM
- SET_LANGUAGE
- UPDATE_HYPERSCALE_LAYERS
// ... и т.д.
```

#### Шаг 5.3: Создать адаптеры для обратной совместимости
```typescript
// store/gameContextAdapter.ts
import { usePlayers, useViewTransform, useUI } from './contexts';

/**
 * Адаптер для обратной совместимости с GameContext
 * Позволяет старым компонентам продолжать работать
 */
export function useGameContextAdapter() {
  const players = usePlayers();
  const viewTransform = useViewTransform();
  const ui = useUI();

  return {
    // Player state
    players: players.players,
    activePlayerId: players.activePlayerId,
    playerPermissions: players.playerPermissions,
    
    // ViewTransform state
    viewTransform: viewTransform.viewTransform,
    
    // UI state
    language: ui.language,
    playerPanelSettings: ui.playerPanelSettings,
    hyperscaleLayers: ui.hyperscaleLayers,
    selectedHyperscaleLayerIds: ui.selectedHyperscaleLayerIds,
  };
}
```

#### Шаг 5.4: Постепенная миграция компонентов
**План миграции:**
1. Создать список всех компонентов, использующих GameContext
2. Категоризировать по используемым данным
3. Мигрировать по категориям

**Компоненты для миграции:**
- Используют `players` → `usePlayers()`
- Используют `viewTransform` → `useViewTransform()`
- Используют `language/UI` → `useUI()`
- Используют `objects` → `useObjectStore()`

---

### Этап 6: Интеграция и тестирование (2-3 дня)

#### Шаг 6.1: Обновить провайдеры в App.tsx
```typescript
// App.tsx - ФИНАЛЬНАЯ СТРУКТУРА
import { 
  UIProvider, 
  ViewTransformProvider, 
  PlayerProvider 
} from './store/contexts';
import { ObjectProvider } from './store/objectStore';

function App() {
  return (
    <UIProvider>
      <ViewTransformProvider>
        <PlayerProvider>
          <ObjectProvider>
            <GameProvider> {/* Минимальный GameContext */}
              <MainApplication />
            </GameProvider>
          </ObjectProvider>
        </PlayerProvider>
      </ViewTransformProvider>
    </UIProvider>
  );
}
```

#### Шаг 6.2: Комплексное тестирование
**Тестовые сценарии:**

1. **Player functionality:**
   - ✅ Добавление/удаление игроков
   - ✅ Переключение активного игрока
   - ✅ GM permissions
   - ✅ Player colors

2. **ViewTransform:**
   - ✅ Zoom in/out
   - ✅ Pan (drag)
   - ✅ Scroll
   - ✅ Window resize
   - ✅ Координатные преобразования

3. **UI:**
   - ✅ Language switching
   - ✅ Panel settings persistence
   - ✅ Hyperscale layers management
   - ✅ Layer selection

4. **Integration:**
   - ✅ Совместная работа всех контекстов
   - ✅ WebRTC синхронизация
   - ✅ Save/Load functionality
   - ✅ Performance (количество рендеров)

#### Шаг 6.3: Performance тестирование
```typescript
// Измерить результаты:
- Количество рендеров компонентов
- Время отклика UI
- Использование памяти
- Размер bundle
```

---

### Этап 7: Документация и cleanup (1-2 дня)

#### Шаг 7.1: Обновить документацию
- ✅ Обновить OPTIMIZATION_COMPLETED.md
- ✅ Создать CONTEXT_MIGRATION_GUIDE.md
- ✅ Обновить README.md

#### Шаг 7.2: Cleanup
- Удалить неиспользуемый код
- Обновить импорты
- Оптимизировать bundle size

#### Шаг 7.3: Code review
- Проверить все типы
- Проверить обратную совместимость
- Проверить обработку ошибок

---

## 📊 Ожидаемые результаты

### Производительность
- 🚀 **60-70%** снижение избыточных рендеров
- ⚡ **40-50%** ускорение отклика UI
- 💾 **20-30%** снижение использования памяти

### Архитектура
- ✅ Четкое разделение ответственности
- ✅ Улучшенная тестируемость
- ✅ Лучшая поддерживаемость
- ✅ Типобезопасность

### Developer Experience
- 🎯 Прямые hooks вместо одного большого контекста
- 🔧 Удобные API для каждого контекста
- 📚 Лучшая документация
- 🐛 Легкая отладка

---

## 🚨 Риски и митигация

### Риск 1: Нарушение функциональности
**Митигация:**
- Постепенная миграция поэтапно
- Тестирование на каждом этапе
- Адаптеры для обратной совместимости

### Риск 2: WebRTC синхронизация
**Митигация:**
- Аккуратный refactor reducer'ов
- Тестирование P2P функциональности
- Backup текущей реализации

### Риск 3: Performance regression
**Митигация:**
- Профилирование до/после
- Оптимизированные hooks с shallow comparison
- Мониторинг рендеров

---

## 📅 Timeline

| Этап | Длительность | Начало | Конец |
|------|-------------|--------|-------|
| 1. Подготовка | 1-2 дня | Week 1 | Week 1 |
| 2. PlayerContext | 2-3 дня | Week 1-2 | Week 2 |
| 3. ViewTransformContext | 2-3 дня | Week 2-3 | Week 3 |
| 4. UIContext | 2-3 дня | Week 3-4 | Week 4 |
| 5. GameContext refactor | 3-4 дня | Week 4-5 | Week 5 |
| 6. Интеграция и тестирование | 2-3 дня | Week 5-6 | Week 6 |
| 7. Документация и cleanup | 1-2 дня | Week 6 | Week 6 |
| **ИТОГО** | **13-20 дней** | | |

---

## 🎯 Критерии успеха

### Функциональность
- ✅ Все существующие функции работают
- ✅ WebRTC синхронизация работает
- ✅ Save/Load работает
- ✅ Нет regressions

### Производительность
- ✅ Снижение рендеров на 60-70%
- ✅ Улучшение отклика UI на 40-50%
- ✅ Снижение использования памяти на 20-30%

### Код
- ✅ Ни один файл не превышает 500 строк (кроме существующих)
- ✅ Четкое разделение ответственности
- ✅ Полная типизация
- ✅ Документация

---

## 📝 Checklist

### Этап 1: Подготовка ✅ ЗАВЕРШЕН (2026-04-16 21:09)
- [x] Создать структуру директорий
- [x] Подготовить типы
- [x] Создать тестовое окружение
- [x] Backup текущего состояния

### Этап 2: PlayerContext ✅ ЗАВЕРШЕН (2026-04-16) - ВАРИАНТ 2
- [x] Создать PlayerContext.tsx с мостом синхронизации
- [x] Интегрировать в App.tsx (PlayerProvider внутри GameProvider)
- [x] Создать мост синхронизации GameContext ↔ PlayerContext
- [x] Мигрировать критические компоненты:
  - [x] Tabletop.tsx (26 использований → 0)
  - [x] MainMenuContent.tsx (13 использований → 4)
  - [x] UIObjectRendererOptimized.tsx (24 использований → 14)
  - [x] LayersPanel.tsx, CharacterPanel.tsx, DrawingCanvas.tsx
- [x] Исправить ошибки компиляции (index.ts → index.tsx)
- [x] Тестирование интеграции
- [x] WebRTC сохранен (через GameContext)

### Этап 3: ViewTransformContext ✅ ЗАВЕРШЕН (2026-04-16) - v2.0.0
- [x] Создать ViewTransformContext.tsx (независимая реализация)
- [x] Интегрировать в App.tsx
- [x] Исправить критическую ошибку зависимости от GameContext
- [x] Добавить оптимизированные hooks (useTransformActions, useCoordinateUtils)
- [ ] Мигрировать компоненты (следующий этап)
- [ ] Финальное тестирование

### Этап 4: UIContext ✅ ЗАВЕРШЕН (2026-04-16)
- [x] Создать UIContext.tsx с полным reducer
- [x] Интегрировать в App.tsx
- [x] Добавить оптимизированные hooks
- [x] Обновить экспорты в index.tsx
- [ ] Мигрировать компоненты (следующий этап)
- [ ] Финальное тестирование

### Этап 5: GameContext refactor ✅ ЗАВЕРШЕН (2026-04-16)
- [x] Удалить дублирующиеся state
- [x] Обновить reducer
- [x] Создать адаптеры
- [x] Мигрировать компоненты

### Этап 6: Интеграция и тестирование ✅ ЗАВЕРШЕН (2026-04-17)
- [x] Обновить App.tsx
- [x] Комплексное тестирование
- [x] Performance тестирование
- [x] Создание тестового набора
- [x] Инструменты мониторинга
- [x] Финальный отчет

### Этап 7: Документация и cleanup
- [ ] Обновить документацию
- [ ] Cleanup кода
- [ ] Code review
- [ ] Финальное тестирование

---

**Создано:** 2026-04-16  
**Версия:** 1.0  
**Статус:** 📋 Готов к реализации
**Следующий шаг:** Начать с Этапа 1 (Подготовка)
