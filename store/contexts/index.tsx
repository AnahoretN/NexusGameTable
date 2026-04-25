/**
 * Context Module - Centralized exports for all modular contexts
 *
 * This module provides a unified interface for importing all context-related
 * functionality. Each context is responsible for a specific domain of the
 * application state.
 *
 * Usage:
 * ```typescript
 * // Import everything from one place
 * import {
 *   PlayerProvider,
 *   usePlayers,
 *   ViewTransformProvider,
 *   useViewTransform,
 *   UIProvider,
 *   useUI
 * } from './store/contexts';
 * ```
 */

// ============================================================================
// TYPES
// ============================================================================

export * from './contextTypes';

// ============================================================================
// PLAYER CONTEXT
// ============================================================================

// Provider
export { PlayerProvider } from './PlayerContext';

// Hooks
export {
  usePlayers,
  useActivePlayer,
  useIsGM,
  usePlayerList,
  usePlayerPermissions,
  useActivePlayerId
} from './PlayerContext';

// ============================================================================
// VIEW TRANSFORM CONTEXT
// ============================================================================

// Provider
export { ViewTransformProvider } from './ViewTransformContext';

// Hooks
export {
  useViewTransform,
  useTransformState,
  useZoom,
  useOffset,
  usePixelsPerVU,
  useTransformActions,
  useCoordinateUtils
} from './ViewTransformContext';

// ============================================================================
// UI CONTEXT
// ============================================================================

// Provider
export { UIProvider } from './UIContext';

// Hooks
export {
  useUI,
  useLanguage,
  useLanguageActions,
  useHyperscaleLayers,
  useSelectedLayers,
  useLayerSelection,
  useLayerActions,
  usePanelSettings,
  usePanelSettingsActions
} from './UIContext';

// ============================================================================
// BACKWARD COMPATIBILITY
// ============================================================================

export {
  useGameContextAdapter,
  usePlayerStateAdapter,
  useViewTransformAdapter,
  useUIStateAdapter,
  checkLegacyUsage,
  createMigrationPath
} from './gameContextAdapter';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Helper to combine all providers into a single wrapper
 * Usage in App.tsx:
 * ```typescript
 * <ContextProviders>
 *   <MainApplication />
 * </ContextProviders>
 * ```
 */
export function ContextProviders({ children }: { children: React.ReactNode }) {
  // Import here to avoid circular dependencies
  const { PlayerProvider } = require('./PlayerContext');
  const { ViewTransformProvider } = require('./ViewTransformContext');
  const { UIProvider } = require('./UIContext');

  return (
    <UIProvider>
      <ViewTransformProvider>
        <PlayerProvider>
          {children}
        </PlayerProvider>
      </ViewTransformProvider>
    </UIProvider>
  );
}

/**
 * Version information for the context module
 */
export const CONTEXT_VERSION = '1.1.0';
export const CONTEXT_BUILD_DATE = '2026-04-17';

/**
 * Context module metadata
 */
export const CONTEXT_INFO = {
  version: CONTEXT_VERSION,
  buildDate: CONTEXT_BUILD_DATE,
  contexts: {
    player: {
      name: 'PlayerContext',
      version: '1.0.0',
      status: 'ready',
    },
    viewTransform: {
      name: 'ViewTransformContext',
      version: '2.0.0',
      status: 'ready',
    },
    ui: {
      name: 'UIContext',
      version: '1.0.0',
      status: 'ready',
    },
  },
};

/**
 * Debug utility to check context status
 * Usage: `checkContextStatus()`
 */
export function checkContextStatus() {
  console.group('🔍 Context Module Status');
  console.groupEnd();

  return CONTEXT_INFO;
}

// Expose to window for debugging (development only)
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).nexusContextDebug = {
    checkContextStatus,
    CONTEXT_INFO,
    version: CONTEXT_VERSION,
  };

}
