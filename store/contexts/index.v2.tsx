/**
 * Context Module Index v2.0 - Final exports for complete migration
 *
 * @version 2.0.0
 * @since 2026-04-17
 *
 * ИЗМЕНЕНИЯ с v1.0:
 * ✅ Экспортирует новые версии контекстов (v2.0, v1.1, v2.1)
 * ✅ Скрывает старые версии контекстов
 * ✅ Полная готовность к production
 */

// ============================================================================
// CONTEXT PROVIDERS
// ============================================================================

// PlayerContext v2.0 - НЕЗАВИСИМЫЙ
export { PlayerProviderV2 as PlayerProvider } from './PlayerContext.v2';
export {
  usePlayersV2 as usePlayers,
  useActivePlayerV2 as useActivePlayer,
  useActivePlayerIdV2 as useActivePlayerId,
  usePlayerListV2 as usePlayerList,
  useIsGMV2 as useIsGM,
  usePlayerPermissionsV2 as usePlayerPermissions
} from './PlayerContext.v2';

// ViewTransformContext v2.1 - ЛОКАЛЬНЫЙ
export { ViewTransformProvider } from './ViewTransformContext';
export {
  useViewTransform,
  useTransformState,
  useZoom,
  useOffset,
  usePixelsPerVU
} from './ViewTransformContext';

// UIContext v1.1 - ГИБРИДНЫЙ
export { UIProviderV1 as UIProvider } from './UIContext.v1.1';
export {
  useUIV1 as useUI,
  useLanguageV1 as useLanguage,
  useHyperscaleLayersV1 as useHyperscaleLayers,
  useSelectedLayersV1 as useSelectedLayers,
  useLayerSelectionV1 as useLayerSelection
} from './UIContext.v1.1';

// ============================================================================
// OPTIMIZED HOOKS (backward compatibility aliases)
// ============================================================================

// Player hooks - указывают на v2.0
export const useActivePlayer = useActivePlayerV2;
export const useIsGM = useIsGMV2;
export const usePlayerList = usePlayerListV2;
export const useActivePlayerId = useActivePlayerIdV2;
export const usePlayerPermissions = usePlayerPermissionsV2;

// ViewTransform hooks
export const useTransformState = useTransformState;
export const useZoom = useZoom;
export const useOffset = useOffset;
export const usePixelsPerVU = usePixelsPerVU;

// UI hooks - указывают на v1.1
export const useLanguage = useLanguageV1;
export const useHyperscaleLayers = useHyperscaleLayersV1;
export const useSelectedLayers = useSelectedLayersV1;
export const useLayerSelection = useLayerSelectionV1;

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
 * Combined providers for easy usage
 * Usage in App.tsx:
 * ```typescript
 * <ContextProviders>
 *   <MainApplication />
 * </ContextProviders>
 * ```
 */
export function ContextProviders({ children }: { children: React.ReactNode }) {
  const { PlayerProvider: PlayerProv } = require('./PlayerContext.v2');
  const { ViewTransformProvider: ViewProv } = require('./ViewTransformContext');
  const { UIProviderV1: UIProv } = require('./UIContext.v1.1');

  const PlayerProvider = PlayerProv.PlayerProvider || PlayerProv.default;
  const ViewTransformProvider = ViewProv.ViewTransformProvider || ViewProv.default;
  const UIProvider = UIProv.UIProviderV1 || UIProv.default;

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
export const CONTEXT_VERSION = '2.0.0';
export const CONTEXT_BUILD_DATE = '2026-04-17';
export const CONTEXT_MIGRATION_STATUS = 'COMPLETE';

/**
 * Context module metadata
 */
export const CONTEXT_INFO = {
  version: CONTEXT_VERSION,
  buildDate: CONTEXT_BUILD_DATE,
  migrationStatus: CONTEXT_MIGRATION_STATUS,
  contexts: {
    player: {
      name: 'PlayerContext',
      version: '2.0.0',
      status: 'independent',
      webRTC: 'synced',
      description: 'Manages player data, fully independent from GameContext'
    },
    viewTransform: {
      name: 'ViewTransformContext',
      version: '2.1.0',
      status: 'local',
      webRTC: 'not synced',
      description: 'Manages camera/transform, local to each player'
    },
    ui: {
      name: 'UIContext',
      version: '1.1.0',
      status: 'hybrid',
      webRTC: 'partial',
      description: 'Manages UI data, language is local, layers are synced'
    },
  },
};

/**
 * Debug utility to check context status
 * Usage: `checkContextStatus()`
 */
export function checkContextStatus() {
  console.group('🔍 Context Module Status v2.0');
  console.log('Version:', CONTEXT_VERSION);
  console.log('Build Date:', CONTEXT_BUILD_DATE);
  console.log('Migration Status:', CONTEXT_MIGRATION_STATUS);
  console.log('Contexts:', CONTEXT_INFO.contexts);
  console.groupEnd();

  return CONTEXT_INFO;
}

/**
 * Migration utility for components still using old contexts
 * Automatically detects and suggests migration paths
 */
export function suggestMigration(componentName: string, usedHooks: string[]) {
  const suggestions: string[] = [];

  // Check for old hooks
  const oldHooks = ['useGame', 'usePlayers', 'useViewTransform', 'useUI'];
  const foundOldHooks = usedHooks.filter(hook =>
    oldHooks.some(oldHook => hook.includes(oldHook))
  );

  if (foundOldHooks.length > 0) {
    suggestions.push(
      `⚠️ ${componentName} uses old context hooks: ${foundOldHooks.join(', ')}`
    );
    suggestions.push('💡 Migrate to: usePlayersV2(), useViewTransform(), useUIV1()');
  }

  // Check for correct usage
  const newHooks = [
    'usePlayersV2', 'useActivePlayerV2', 'usePlayerListV2', 'useIsGMV2',
    'useViewTransform', 'useTransformState', 'useZoom', 'useOffset',
    'useUIV1', 'useLanguageV1', 'useHyperscaleLayersV1', 'useSelectedLayersV1'
  ];

  const foundNewHooks = usedHooks.filter(hook =>
    newHooks.some(newHook => hook.includes(newHook))
  );

  if (foundNewHooks.length > 0) {
    suggestions.push(
      `✅ ${componentName} uses new context hooks: ${foundNewHooks.join(', ')}`
    );
  }

  if (process.env.NODE_ENV === 'development' && suggestions.length > 0) {
    console.group(`🔄 Migration Suggestions for ${componentName}`);
    suggestions.forEach(s => console.log(s));
    console.groupEnd();
  }

  return suggestions;
}

// Expose to window for debugging (development only)
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).nexusContextDebug = {
    checkContextStatus,
    CONTEXT_INFO,
    CONTEXT_VERSION,
    suggestMigration,
    version: CONTEXT_VERSION,
  };

  console.log('[Context Module v2.0] 💡 Debug utilities available:');
  console.log('[Context Module v2.0] 💡 - nexusContextDebug.checkContextStatus()');
  console.log('[Context Module v2.0] 💡 - nexusContextDebug.suggestMigration("ComponentName", ["usePlayers"])');
}