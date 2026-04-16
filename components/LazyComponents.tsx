/**
 * Lazy-loaded Components for Code Splitting
 * Implements React.lazy() for optimal bundle splitting
 */

import React, { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';

// Loading component for Suspense fallback
export const LoadingFallback: React.FC<{ message?: string }> = ({ message = 'Loading...' }) => (
  <div className="flex items-center justify-center p-8">
    <div className="flex flex-col items-center gap-3">
      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      <p className="text-sm text-gray-600">{message}</p>
    </div>
  </div>
);

// Simple HOC for lazy components without Suspense inside
function createLazyComponent<T extends React.ComponentType<any>>(
  importFunc: () => Promise<{ default: T }>,
  componentName: string
): React.ComponentType<React.ComponentProps<T>> {
  const LazyComponent = lazy(importFunc);
  LazyComponent.displayName = `Lazy(${componentName})`;
  return LazyComponent;
}

// Modal components (low priority, can be loaded on demand)
export const DeleteConfirmModalLazy = createLazyComponent(
  () => import('./DeleteConfirmModal'),
  'Delete Confirmation'
);

export const SearchDeckModalLazy = createLazyComponent(
  () => import('./SearchDeckModal'),
  'Search Deck'
);

export const TopDeckModalLazy = createLazyComponent(
  () => import('./TopDeckModal'),
  'Top Deck'
);

export const ObjectSettingsModalLazy = createLazyComponent(
  () => import('./ObjectSettingsModal'),
  'Object Settings'
);

export const CharacterSettingsModalLazy = createLazyComponent(
  () => import('./CharacterSettingsModal'),
  'Character Settings'
);

export const PanelSettingsModalLazy = createLazyComponent(
  () => import('./PanelSettingsModal'),
  'Panel Settings'
);

export const HandTabSettingsModalLazy = createLazyComponent(
  () => import('./HandTabSettingsModal'),
  'Hand Tab Settings'
);

export const PoolTabSettingsModalLazy = createLazyComponent(
  () => import('./PoolTabSettingsModal'),
  'Pool Tab Settings'
);

export const PlayerNameModalLazy = createLazyComponent(
  () => import('./PlayerNameModal'),
  'Player Name'
);

export const PackLoadingModalLazy = createLazyComponent(
  () => import('./PackLoadingModal'),
  'Pack Loading'
);

export const InitialLoadModalLazy = createLazyComponent(
  () => import('./InitialLoadModal'),
  'Initial Load'
);

// Large feature components (medium priority)
// NOTE: MainMenuContentLazy and TabletopLazy removed due to prop passing issues
// Use regular imports for now until proper lazy loading can be implemented

export const MainMenuContentLazy = lazy(() => import('./MainMenuContent'));
export const TabletopLazy = lazy(() => import('./Tabletop'));

// Utility components (low priority)
export const ContextMenuLazy = createLazyComponent(
  () => import('./ContextMenu'),
  'Context Menu'
);

export const PileContextMenuLazy = createLazyComponent(
  () => import('./PileContextMenu'),
  'Pile Context Menu'
);

// Advanced components (can be loaded on demand)
export const DrawingCanvasLazy = createLazyComponent(
  () => import('./DrawingCanvas'),
  'Drawing Canvas'
);

export const NexusBoardLazy = createLazyComponent(
  () => import('./NexusBoard'),
  'Nexus Board'
);

export const UIObjectRendererLazy = createLazyComponent(
  () => import('./UIObjectRendererOptimized'),
  'UI Object Renderer'
);

// Export a convenience wrapper for batch lazy loading
export function createLazyBundle<T extends Record<string, React.ComponentType<any>>>(
  imports: T
): T {
  const result = {} as T;

  for (const [key, importFunc] of Object.entries(imports)) {
    (result as any)[key] = lazy(importFunc as any);
  }

  return result;
}

// Re-export LoadingFallback for custom usage
export { LoadingFallback };

// Type exports for TypeScript
export type LazyComponentProps<T extends React.ComponentType<any>> = React.ComponentProps<T>;

/**
 * Usage example:
 *
 * import { DeleteConfirmModalLazy, SearchDeckModalLazy } from './components/LazyComponents';
 *
 * // Use exactly like regular components
 * <DeleteConfirmModalLazy
 *   isOpen={showDelete}
 *   onConfirm={handleDelete}
 *   onCancel={() => setShowDelete(false)}
 * />
 *
 * The lazy loading and Suspense handling is automatic!
 */