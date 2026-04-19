/**
 * Optimized Components Index
 *
 * Export all optimized components for easy importing
 */

// Virtualized lists
export { VirtualizedObjectList, useVirtualizedObjectList } from './VirtualizedObjectList';
export {
  VirtualizedHandList,
  SimpleHandList,
  useVirtualizedHandList
} from './VirtualizedHandList';
export {
  VirtualizedTokensPanel,
  SimpleTokensPanel,
  useVirtualizedTokensPanel
} from './VirtualizedTokensPanel';

// Lazy loading images
export { LazyImage, LazyBackgroundImage, useImagePreloader } from './LazyImage';

// Memoized components
export { ObjectRendererMemo } from './ObjectRenderer';
export { default as CardMemo } from './Card';
export { SvgTokenShapeMemo } from './SvgTokenShape';

// 🔥 NEW: Optimized HandPanel with Zustand
export { HandPanelOptimized, HandPanelOptimizedMemo } from './HandPanelOptimized';

// 🔥 NEW: Optimized TokensPanel with useMemo
export { TokensPanelOptimized, TokensPanelOptimizedMemo } from './TokensPanelOptimized';

// 🔥 OPTIMIZED: DeckComponent with useMemo (replaces original DeckComponent)
export { DeckComponent } from './DeckComponent';

// 🔥 NEW: Optimized PoolTabletop with useMemo
export { PoolTabletopOptimized, PoolTabletopOptimizedMemo } from './PoolTabletopOptimized';

// 🔥 NEW: Optimized UIObjectRenderer with useMemo
export { UIObjectRendererOptimized, UIObjectRendererOptimizedMemo } from './UIObjectRendererOptimized';

// 🚀 Code Splitting - Lazy-loaded components (removed - not in use)
// All components use direct imports for better performance and stability

// 🚀 MainMenuContent optimized sub-components (removed - not in use)
// All functionality is integrated directly into MainMenuContent.tsx

// 🚀 NEW: MainMenuContent optimized version
export { MainMenuContentMemoized } from './MainMenuContent';
export { default as MainMenuContentOptimized } from './MainMenuContentOptimized';
export {
  useFilteredObjects,
  useObjectStats,
  usePaginatedObjects
} from './MainMenuContentOptimized';

// Re-export original types
export type { VirtualizedObjectListProps } from './VirtualizedObjectList';
export type { VirtualizedHandListProps, SimpleHandListProps } from './VirtualizedHandList';
export type { VirtualizedTokensPanelProps, SimpleTokensPanelProps } from './VirtualizedTokensPanel';
export type { LazyImageProps, LazyBackgroundImageProps } from './LazyImage';
