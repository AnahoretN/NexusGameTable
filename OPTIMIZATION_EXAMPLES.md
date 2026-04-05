# Конкретные примеры оптимизации кода

## 1. Оптимизированный компонент Card

```typescript
// components/Card.tsx
import React, { memo, useMemo } from 'react';
import { Card as CardType, CardShape, CardOrientation, ContextAction, CardNamePosition, CardSpriteConfig, AppLanguage } from '../types';
import { Layers, Hand, Eye, EyeOff } from 'lucide-react';
import { Tooltip } from './Tooltip';
import { getCardButtonConfig, ButtonAction, CardButtonConfig } from '../utils/buttonConfig';
import { isGeometricCardShape } from '../utils/shapeUtils';
import { SvgDeckShape, shouldUseSvgForDeck } from './SvgDeckShape';

interface CardProps {
  card: CardType;
  onClick?: () => void;
  onFlip?: (e: React.MouseEvent) => void;
  isHovered?: boolean;
  canFlip?: boolean;
  showActionButtons?: boolean;
  onToHand?: (e: React.MouseEvent) => void;
  onReturnToDeck?: (e: React.MouseEvent) => void;
  actionButtons?: ContextAction[];
  onActionButtonClick?: (action: ContextAction) => void;
  overrideWidth?: number;
  overrideHeight?: number;
  cardWidth?: number;
  cardHeight?: number;
  cardNamePosition?: CardNamePosition;
  cardOrientation?: CardOrientation;
  disableRotationTransform?: boolean;
  disablePointerEvents?: boolean;
  skipTooltip?: boolean;
  deckSpriteConfig?: CardSpriteConfig;
  deckShowTooltipImage?: boolean;
  deckTooltipScale?: number;
  shouldSeeCardFace?: boolean;
  language?: AppLanguage;
}

// Кастомная функция сравнения для оптимизации
const areCardPropsEqual = (prevProps: CardProps, nextProps: CardProps) => {
  return (
    prevProps.card.id === nextProps.card.id &&
    prevProps.card.faceUp === nextProps.card.faceUp &&
    prevProps.card.location === nextProps.card.location &&
    prevProps.card.width === nextProps.card.width &&
    prevProps.card.height === nextProps.card.height &&
    prevProps.card.rotation === nextProps.card.rotation &&
    prevProps.isHovered === nextProps.isHovered &&
    prevProps.overrideWidth === nextProps.overrideWidth &&
    prevProps.overrideHeight === nextProps.overrideHeight &&
    prevProps.canFlip === nextProps.canFlip &&
    prevProps.showActionButtons === nextProps.showActionButtons &&
    prevProps.shouldSeeCardFace === nextProps.shouldSeeCardFace &&
    prevProps.language === nextProps.language
  );
};

export const Card = memo<CardProps>(({ card, onClick, onFlip, isHovered, canFlip, showActionButtons, onToHand, onReturnToDeck, actionButtons, onActionButtonClick, overrideWidth, overrideHeight, cardWidth, cardHeight, cardNamePosition, cardOrientation, disableRotationTransform, disablePointerEvents, skipTooltip, deckSpriteConfig, deckShowTooltipImage, deckTooltipScale, shouldSeeCardFace = true, language = 'en' }) => {
  const shape = card.shape || CardShape.POKER;
  const orientation = cardOrientation ?? CardOrientation.VERTICAL;

  // Оптимизированное определение размеров
  const displayDimensions = useMemo(() => ({
    width: overrideWidth ?? card.width ?? cardWidth ?? 100,
    height: overrideHeight ?? card.height ?? cardHeight ?? 100,
  }), [overrideWidth, overrideHeight, card.width, card.height, cardWidth, cardHeight]);

  const { displayWidth, displayHeight } = displayDimensions;

  // Оптимизированное вычисление aspect ratio
  const aspectRatio = useMemo(() => displayWidth / displayHeight, [displayWidth, displayHeight]);

  // Оптимизированное вычисление sprite background styles
  const spriteBackgroundStyles = useMemo(() => {
    const getBackgroundImage = (): string | undefined => {
      if (card.faceUp) {
        const spriteUrl = card.spriteUrl || deckSpriteConfig?.spriteUrl || card.content;
        return spriteUrl ? `url(${spriteUrl})` : undefined;
      }

      // Card is face down - check for alternative back first
      const altBack = (card as any).alternativeBack;
      if (altBack?.url) {
        const locationMatch = !altBack.locations || altBack.locations.length === 0 || altBack.locations?.includes(card.location as any);
        const shouldShow = altBack.visibleToOthers || shouldSeeCardFace;
        if (locationMatch && shouldShow) {
          return `url(${altBack.url})`;
        }
      }

      // Card is face down - check for custom sprite back
      if (deckSpriteConfig?.cardBackSpriteUrl && deckSpriteConfig.cardBackSpriteIndex !== undefined) {
        return `url(${deckSpriteConfig.cardBackSpriteUrl})`;
      }

      // Default pattern
      return 'repeating-linear-gradient(45deg, #1e293b 0, #1e293b 10px, #0f172a 10px, #0f172a 20px)';
    };

    const getBackgroundSize = (): string => {
      const spriteCols = card.spriteColumns || deckSpriteConfig?.columns;
      const spriteRows = card.spriteRows || deckSpriteConfig?.rows;
      const hasSpriteUrl = card.spriteUrl || deckSpriteConfig?.spriteUrl;

      if (card.faceUp && hasSpriteUrl && spriteCols && spriteRows) {
        return `${spriteCols * 100}% ${spriteRows * 100}%`;
      }
      if (!card.faceUp && deckSpriteConfig?.cardBackSpriteUrl && deckSpriteConfig.cardBackSpriteColumns && deckSpriteConfig.cardBackSpriteRows) {
        return `${deckSpriteConfig.cardBackSpriteColumns * 100}% ${deckSpriteConfig.cardBackSpriteRows * 100}%`;
      }
      return 'cover';
    };

    const getBackgroundPosition = (): string => {
      if (card.faceUp) {
        const spriteCols = card.spriteColumns || deckSpriteConfig?.columns;
        const spriteRows = card.spriteRows || deckSpriteConfig?.rows;
        const spriteIndex = card.spriteIndex;

        if (spriteCols && spriteRows && spriteIndex !== undefined && (card.spriteUrl || deckSpriteConfig?.spriteUrl)) {
          const col = spriteIndex % spriteCols;
          const row = Math.floor(spriteIndex / spriteCols);
          const colPercent = spriteCols > 1 ? (col / (spriteCols - 1)) * 100 : 0;
          const rowPercent = spriteRows > 1 ? (row / (spriteRows - 1)) * 100 : 0;
          return `${colPercent}% ${rowPercent}%`;
        }
      } else if (deckSpriteConfig?.cardBackSpriteUrl && deckSpriteConfig.cardBackSpriteIndex !== undefined) {
        const cols = deckSpriteConfig.cardBackSpriteColumns;
        const rows = deckSpriteConfig.cardBackSpriteRows;
        const index = deckSpriteConfig.cardBackSpriteIndex;

        if (cols && rows && index !== undefined) {
          const col = index % cols;
          const row = Math.floor(index / cols);
          const colPercent = cols > 1 ? (col / (cols - 1)) * 100 : 0;
          const rowPercent = rows > 1 ? (row / (rows - 1)) * 100 : 0;
          return `${colPercent}% ${rowPercent}%`;
        }
      }
      return 'center';
    };

    const backgroundImage = getBackgroundImage();
    if (!backgroundImage) return {};

    return {
      backgroundImage,
      backgroundSize: getBackgroundSize(),
      backgroundPosition: getBackgroundPosition(),
      backgroundRepeat: 'no-repeat',
      imageRendering: 'pixelated' as const
    };
  }, [card.faceUp, card.spriteUrl, card.spriteIndex, card.spriteColumns, card.spriteRows,
      deckSpriteConfig?.spriteUrl, deckSpriteConfig?.columns, deckSpriteConfig?.rows,
      deckSpriteConfig?.cardBackSpriteUrl, deckSpriteConfig?.cardBackSpriteIndex,
      deckSpriteConfig?.cardBackSpriteColumns, deckSpriteConfig?.cardBackSpriteRows,
      card.alternativeBack, shouldSeeCardFace, card.location, card.content]);

  // Оптимизированное определение, нужно ли показывать SVG
  const useSvgForCard = useMemo(() => {
    return isGeometricCardShape(shape) && shouldUseSvgForDeck(card, deckSpriteConfig);
  }, [shape, card, deckSpriteConfig]);

  // Оптимизированная генерация конфигурации кнопок
  const buttonConfig = useMemo(() => {
    if (!showActionButtons || !actionButtons || actionButtons.length === 0) {
      return [];
    }
    return getCardButtonConfig(actionButtons, card, language);
  }, [showActionButtons, actionButtons, card, language]);

  // Оптимизированное определение названия карты
  const cardNameDisplay = useMemo(() => {
    if (cardNamePosition === 'none') return null;

    const namePosition = cardNamePosition ?? 'bottom';
    const shouldShowName = card.showNameOnToken || (card.type === 'CARD' && cardNamePosition !== 'none');

    if (!shouldShowName) return null;

    return (
      <div className={`
        absolute left-0 right-0 text-center text-xs font-bold
        ${namePosition === 'top' ? 'top-1' : 'bottom-1'}
      `}>
        {card.name}
      </div>
    );
  }, [cardNamePosition, card.showNameOnToken, card.name, card.type]);

  // Остальная часть компонента...
  return (
    // JSX компонента
    <div>Card component content</div>
  );
}, areCardPropsEqual);

Card.displayName = 'Card';
```

## 2. Оптимизированный GameContext с разделением на контексты

```typescript
// store/GameContexts.tsx
import React, { createContext, useContext, useReducer, useCallback, useMemo } from 'react';
import { GameState, initialState } from './gameState';
import { Action } from './gameActions';

// 1. Контекст для объектов
const GameObjectsContext = createContext<Record<string, TableObject>>({});
const GameObjectsDispatchContext = createContext<React.Dispatch<Action> | null>(null);

// 2. Контекст для игроков
const PlayersContext = createContext<Player[]>([]);
const ActivePlayerContext = createContext<string>('');

// 3. Контекст для view transform
const ViewTransformContext = createContext<ViewTransform | null>(null);

// 4. Контекст для UI состояния
const UIContext = createContext<{
  diceRolls: DiceRoll[];
  language: AppLanguage;
  hyperscaleLayers: HyperscaleLayer[];
  selectedHyperscaleLayerIds: string[];
} | null>(null);

// Хуки для использования отдельных контекстов
export function useGameObjects() {
  return useContext(GameObjectsContext);
}

export function useGameObjectsDispatch() {
  return useContext(GameObjectsDispatchContext);
}

export function usePlayers() {
  return useContext(PlayersContext);
}

export function useActivePlayer() {
  return useContext(ActivePlayerContext);
}

export function useViewTransform() {
  return useContext(ViewTransformContext);
}

export function useUIState() {
  return useContext(UIContext);
}

// Оптимизированный провайдер
export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);

  // Мемоизированные значения для контекстов
  const objects = useMemo(() => state.objects, [state.objects]);
  const players = useMemo(() => state.players, [state.players]);
  const activePlayerId = useMemo(() => state.activePlayerId, [state.activePlayerId]);
  const viewTransform = useMemo(() => state.viewTransform, [state.viewTransform]);

  const uiState = useMemo(() => ({
    diceRolls: state.diceRolls,
    language: state.language,
    hyperscaleLayers: state.hyperscaleLayers,
    selectedHyperscaleLayerIds: state.selectedHyperscaleLayerIds,
  }), [state.diceRolls, state.language, state.hyperscaleLayers, state.selectedHyperscaleLayerIds]);

  // Оптимизированный dispatch с useCallback
  const optimizedDispatch = useCallback((action: Action) => {
    dispatch(action);
  }, []);

  return (
    <GameObjectsContext.Provider value={objects}>
      <GameObjectsDispatchContext.Provider value={optimizedDispatch}>
        <PlayersContext.Provider value={players}>
          <ActivePlayerContext.Provider value={activePlayerId}>
            <ViewTransformContext.Provider value={viewTransform}>
              <UIContext.Provider value={uiState}>
                {children}
              </UIContext.Provider>
            </ViewTransformContext.Provider>
          </ActivePlayerContext.Provider>
        </PlayersContext.Provider>
      </GameObjectsDispatchContext.Provider>
    </GameObjectsContext.Provider>
  );
}
```

## 3. Оптимизированные утилиты с кэшированием

```typescript
// utils/gridUtils.ts с кэшированием
import { Board } from '../types';
import { GridType } from '../types';

// Кэш для вычислений центров ячеек
const gridCellCenterCache = new Map<string, { x: number; y: number }>();
const MAX_CACHE_SIZE = 1000;

/**
 * Очистка кэша для конкретной доски
 */
export function clearGridCellCache(boardId: string) {
  const keysToDelete = Array.from(gridCellCenterCache.keys())
    .filter(key => key.startsWith(`${boardId}-`));

  keysToDelete.forEach(key => gridCellCenterCache.delete(key));
}

/**
 * Очистка всего кэша (например, при изменении размера доски)
 */
export function clearAllGridCellCache() {
  gridCellCenterCache.clear();
}

/**
 * Вычисление центра ячейки сетки с кэшированием
 */
export function calculateGridCellCenter(
  board: Board,
  col: number,
  row: number
): { x: number; y: number } {
  const cacheKey = `${board.id}-${col}-${row}`;

  // Проверка кэша
  if (gridCellCenterCache.has(cacheKey)) {
    return gridCellCenterCache.get(cacheKey)!;
  }

  // Вычисление
  const gridW = board.gridWidth || board.gridSize || 50;
  const gridH = board.gridHeight || board.gridSize || 50;

  let result: { x: number; y: number };

  if (board.gridType === GridType.SQUARE) {
    result = {
      x: board.x + (col * gridW) + (gridW / 2),
      y: board.y + (row * gridH) + (gridH / 2)
    };
  } else if (board.gridType === GridType.HEX) {
    const hCapIdeal = gridW / (2 * Math.sqrt(3));
    const hCap = Math.min(hCapIdeal, gridH / 2);
    const dx = gridW;
    const dy = gridH - hCap;
    const offsetX = gridW / 2;

    result = {
      x: board.x + col * dx + (row % 2 === 1 ? offsetX : 0),
      y: board.y + row * dy
    };
  } else if (board.gridType === GridType.HEX_HORIZONTAL) {
    const wCapIdeal = gridH / (2 * Math.sqrt(3));
    const wCap = Math.min(wCapIdeal, gridW / 2);
    const dx = gridW - wCap;
    const dy = gridH;
    const offsetY = gridH / 2;

    result = {
      x: board.x + col * dx,
      y: board.y + row * dy + (col % 2 === 1 ? offsetY : 0)
    };
  } else {
    result = {
      x: board.x + (col * gridW) + (gridW / 2),
      y: board.y + (row * gridH) + (gridH / 2)
    };
  }

  // Сохранение в кэш с проверкой размера
  if (gridCellCenterCache.size >= MAX_CACHE_SIZE) {
    // Удаление самой старой записи (FIFO)
    const firstKey = gridCellCenterCache.keys().next().value;
    gridCellCenterCache.delete(firstKey);
  }

  gridCellCenterCache.set(cacheKey, result);
  return result;
}

/**
 * Батчевое вычисление центров ячеек для оптимизации
 */
export function batchCalculateGridCellCenters(
  board: Board,
  cells: Array<{ col: number; row: number }>
): Array<{ x: number; y: number }> {
  return cells.map(cell => calculateGridCellCenter(board, cell.col, cell.row));
}
```

## 4. Оптимизированный useLocalSettings

```typescript
// hooks/useLocalSettings.tsx
import { useState, useEffect, createContext, useContext, useRef, useMemo, useCallback } from 'react';
import { LocalSettings, loadLocalSettings, saveLocalSettings } from '../utils/localSettings';
import { logger } from '../utils/logger';

const LOCAL_SETTINGS_EVENT = 'local-settings-changed';

interface LocalSettingsContextValue {
  settings: LocalSettings;
  updateSetting(key: keyof LocalSettings, value: any): void;
  updateEffectSetting(key: keyof LocalSettings['effects'], value: any): void;
}

const LocalSettingsContext = createContext<LocalSettingsContextValue | null>(null);

// Оптимизированный провайдер с использованием функциональных обновлений
export function LocalSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<LocalSettings>(() => loadLocalSettings());

  // Оптимизированные функции обновления с функциональными обновлениями состояния
  const updateSetting = useCallback((key: keyof LocalSettings, value: any) => {
    setSettings(prevSettings => {
      const newSettings = { ...prevSettings, [key]: value };
      saveLocalSettings(newSettings);
      return newSettings;
    });
  }, []); // Пустой массив зависимостей - функция стабильна

  const updateEffectSetting = useCallback((key: keyof LocalSettings['effects'], value: any) => {
    setSettings(prevSettings => {
      const newSettings = {
        ...prevSettings,
        effects: { ...prevSettings.effects, [key]: value },
      };
      saveLocalSettings(newSettings);
      return newSettings;
    });
  }, []); // Пустой массив зависимостей - функция стабильна

  // Мемоизированное значение контекста
  const contextValue = useMemo<LocalSettingsContextValue>(
    () => ({ settings, updateSetting, updateEffectSetting }),
    [settings, updateSetting, updateEffectSetting]
  );

  // Обработка событий storage
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'nexus-local-settings' && e.newValue) {
        try {
          const newSettings = JSON.parse(e.newValue);
          setSettings(newSettings);
        } catch (err) {
          logger.error('Failed to parse settings from storage event:', err);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return (
    <LocalSettingsContext.Provider value={contextValue}>
      {children}
    </LocalSettingsContext.Provider>
  );
}

// Оптимизированный хук для использования настроек
export function useLocalSettings() {
  const context = useContext(LocalSettingsContext);

  if (context) {
    return context;
  }

  // Fallback для использования вне провайдера
  const [settings, setSettings] = useState<LocalSettings>(() => loadLocalSettings());

  const updateSetting = useCallback((key: keyof LocalSettings, value: any) => {
    setSettings(prevSettings => {
      const newSettings = { ...prevSettings, [key]: value };
      saveLocalSettings(newSettings);
      window.dispatchEvent(new CustomEvent(LOCAL_SETTINGS_EVENT, { detail: newSettings }));
      return newSettings;
    });
  }, []);

  const updateEffectSetting = useCallback((key: keyof LocalSettings['effects'], value: any) => {
    setSettings(prevSettings => {
      const newSettings = {
        ...prevSettings,
        effects: { ...prevSettings.effects, [key]: value },
      };
      saveLocalSettings(newSettings);
      window.dispatchEvent(new CustomEvent(LOCAL_SETTINGS_EVENT, { detail: newSettings }));
      return newSettings;
    });
  }, []);

  return useMemo(
    () => ({ settings, updateSetting, updateEffectSetting }),
    [settings, updateSetting, updateEffectSetting]
  );
}
```

## 5. Оптимизированный coordinateUtils

```typescript
// utils/coordinateUtils.ts с оптимизацией
import { Coordinates } from '../types';
import { vuToPixels, pixelsToVu } from './vuSystem';

/**
 * Оптимизированное преобразование координат viewport в world
 */
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

/**
 * Оптимизированное преобразование координат world в viewport
 */
export function worldToViewport(
  worldX: number,
  worldY: number,
  offset: Coordinates,
  scrollLeft: number = 0,
  scrollTop: number = 0,
  pixelsPerVU: number = 1
): Coordinates {
  return {
    x: worldX * pixelsPerVU + offset.x - scrollLeft,
    y: worldY * pixelsPerVU + offset.y - scrollTop
  };
}

/**
 * Батчевое преобразование координат для оптимизации
 * Используется для массовых преобразований
 */
export function batchViewportToWorld(
  points: Array<{ x: number; y: number }>,
  offset: Coordinates,
  scrollLeft: number = 0,
  scrollTop: number = 0,
  pixelsPerVU: number = 1
): Coordinates[] {
  const result = new Array(points.length);
  const invPixelsPerVU = 1 / pixelsPerVU; // Предвычисление для оптимизации

  for (let i = 0; i < points.length; i++) {
    result[i] = {
      x: (points[i].x + scrollLeft - offset.x) * invPixelsPerVU,
      y: (points[i].y + scrollTop - offset.y) * invPixelsPerVU
    };
  }

  return result;
}

/**
 * Батчевое преобразование world в viewport
 */
export function batchWorldToViewport(
  points: Array<{ x: number; y: number }>,
  offset: Coordinates,
  scrollLeft: number = 0,
  scrollTop: number = 0,
  pixelsPerVU: number = 1
): Coordinates[] {
  const result = new Array(points.length);

  for (let i = 0; i < points.length; i++) {
    result[i] = {
      x: points[i].x * pixelsPerVU + offset.x - scrollLeft,
      y: points[i].y * pixelsPerVU + offset.y - scrollTop
    };
  }

  return result;
}

/**
 * Вычисление расстояния между двумя точками (оптимизированная версия)
 */
export function getDistance(p1: Coordinates, p2: Coordinates): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Вычисление угла между двумя точками в градусах (оптимизированная версия)
 */
export function getAngle(p1: Coordinates, p2: Coordinates): number {
  return Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;
}

/**
 * Батчевое вычисление расстояний от одной точки до нескольких
 */
export function batchGetDistances(
  fromPoint: Coordinates,
  toPoints: Coordinates[]
): number[] {
  const result = new Array(toPoints.length);
  const fromX = fromPoint.x;
  const fromY = fromPoint.y;

  for (let i = 0; i < toPoints.length; i++) {
    const dx = toPoints[i].x - fromX;
    const dy = toPoints[i].y - fromY;
    result[i] = Math.sqrt(dx * dx + dy * dy);
  }

  return result;
}
```

## 6. Пример виртуализированного списка для HandPanel

```typescript
// components/HandPanel.tsx с виртуализацией
import React, { useState, useCallback, useMemo } from 'react';
import { FixedSizeList as List, areEqual } from 'react-window';
import { useGame } from '../store/GameContext';
import { Card, Deck as DeckType, ItemType, CardShape, CardLocation } from '../types';
import { Card as CardComponent } from './Card';
import { MAIN_MENU_WIDTH } from '../constants';

interface HandPanelProps {
  width?: number;
  isDragTarget?: boolean;
  isCollapsed?: boolean;
}

// Мемоизированный компонент для рендеринга отдельной карты
const MemoizedCardItem = React.memo(({ index, style, data }: { index: number; style: React.CSSProperties; data: any }) => {
  const { cards, cardProps } = data;
  const card = cards[index];

  if (!card) return null;

  return (
    <div style={style}>
      <CardComponent card={card} {...cardProps} />
    </div>
  );
}, areEqual);

export const HandPanel: React.FC<HandPanelProps> = ({
  width = MAIN_MENU_WIDTH,
  isDragTarget = false,
  isCollapsed = false
}) => {
  const { state, dispatch } = useGame();

  // Мемоизированный список карт
  const cards = useMemo(() =>
    Object.values(state.objects)
      .filter(obj => obj.type === ItemType.CARD && obj.location === CardLocation.HAND)
      .sort((a, b) => a.id.localeCompare(b.id)),
    [state.objects]
  );

  // Мемоизированные пропсы для карт
  const cardProps = useMemo(() => ({
    isGM: false,
    showActionButtons: true,
    language: state.language,
    // ... другие пропсы
  }), [state.language]);

  // Обработчики событий с useCallback
  const handleCardClick = useCallback((cardId: string) => {
    // обработка клика
  }, []);

  // Размеры списка
  const listHeight = useMemo(() => isCollapsed ? 200 : 600, [isCollapsed]);
  const itemSize = useMemo(() => 140, []); // Высота карты

  // Данные для передачи в виртуализированный список
  const listData = useMemo(() => ({
    cards,
    cardProps: {
      ...cardProps,
      onClick: handleCardClick
    }
  }), [cards, cardProps, handleCardClick]);

  if (cards.length === 0) {
    return <div>No cards in hand</div>;
  }

  return (
    <div className={`hand-panel ${isDragTarget ? 'drag-target' : ''}`} style={{ width }}>
      <List
        height={listHeight}
        itemCount={cards.length}
        itemSize={itemSize}
        width={width}
        itemData={listData}
        className="hand-cards-list"
      >
        {MemoizedCardItem}
      </List>
    </div>
  );
};
```

## Итоговые рекомендации по внедрению

1. **Начните с самого важного:** Оптимизируйте компонент `Card` с помощью `React.memo` - это даст наибольший прирост производительности.

2. **Разделите контексты:** Это уменьшит количество ненужных ререндеров во всем приложении.

3. **Добавьте кэширование:** Начните с `gridUtils.ts`, так как эти вычисления выполняются часто.

4. **Используйте виртуализацию:** Добавьте в `HandPanel` и `TokensPanel` для работы с большими списками.

5. **Оптимизируйте хуки:** Исправьте зависимости в `useCallback` и используйте функциональные обновления состояния.

Эти изменения улучшат производительность без потери функциональности и сделают код более консистентным и предсказуемым.