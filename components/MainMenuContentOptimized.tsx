/**
 * Optimized MainMenuContent wrapper
 * Provides performance optimizations for the main menu
 */

import React, { memo, useMemo, useCallback, lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';

// Lazy load the original MainMenuContent
const MainMenuContentOriginal = lazy(() => import('./MainMenuContent'));

// Loading fallback
const LoadingFallback = () => (
  <div className="flex items-center justify-center p-8">
    <div className="flex flex-col items-center gap-3">
      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      <p className="text-sm text-gray-600">Loading Menu...</p>
    </div>
  </div>
);

/**
 * Optimized MainMenuContent with code splitting and memoization
 */
const MainMenuContentOptimized = memo((props: any) => {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <MainMenuContentOriginal {...props} />
    </Suspense>
  );
});

MainMenuContentOptimized.displayName = 'MainMenuContentOptimized';

export default MainMenuContentOptimized;

/**
 * Performance hooks for MainMenuContent optimization
 */

// Hook for filtering objects with memoization
export function useFilteredObjects(
  objects: Record<string, any>,
  filterType: string | null,
  searchTerm: string
) {
  return useMemo(() => {
    let filtered = Object.values(objects);

    // Filter by type
    if (filterType) {
      filtered = filtered.filter(obj => obj.type === filterType);
    }

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(obj =>
        obj.name?.toLowerCase().includes(term) ||
        obj.id?.toLowerCase().includes(term)
      );
    }

    return filtered;
  }, [objects, filterType, searchTerm]);
}

// Hook for object statistics with memoization
export function useObjectStats(objects: Record<string, any>) {
  return useMemo(() => {
    const objectValues = Object.values(objects);

    return {
      total: objectValues.length,
      cards: objectValues.filter(obj => obj.type === 'card').length,
      tokens: objectValues.filter(obj => obj.type === 'token').length,
      decks: objectValues.filter(obj => obj.type === 'deck').length,
      dice: objectValues.filter(obj => obj.type === 'dice').length,
      panels: objectValues.filter(obj => obj.type === 'panel').length,
    };
  }, [objects]);
}

// Hook for paginated object list
export function usePaginatedObjects(
  objects: any[],
  pageSize: number = 50,
  currentPage: number = 0
) {
  return useMemo(() => {
    const startIndex = currentPage * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedItems = objects.slice(startIndex, endIndex);
    const totalPages = Math.ceil(objects.length / pageSize);

    return {
      items: paginatedItems,
      totalPages,
      hasNextPage: currentPage < totalPages - 1,
      hasPrevPage: currentPage > 0,
      totalItems: objects.length,
    };
  }, [objects, pageSize, currentPage]);
}