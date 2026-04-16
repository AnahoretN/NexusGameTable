/**
 * GameContext Adapter - Backward compatibility layer
 *
 * This adapter provides a bridge between the new modular contexts and the legacy GameContext.
 * It allows existing components to continue working while migration is in progress.
 *
 * @module store/contexts/gameContextAdapter
 */

import { useMemo } from 'react';
import { usePlayers, useViewTransform, useUI } from './index';
import { Player, PlayerPermissions, ViewTransform, AppLanguage, HyperscaleLayer, PlayerPanelSettings } from '../types';

/**
 * Adapted state interface that mirrors the legacy GameContext state
 * This maintains the same structure that components expect
 */
export interface AdaptedGameState {
  // Player state (from PlayerContext)
  players: Player[];
  activePlayerId: string;
  playerPermissions: PlayerPermissions;

  // ViewTransform state (from ViewTransformContext)
  viewTransform: ViewTransform;

  // UI state (from UIContext)
  language: AppLanguage;
  playerPanelSettings: PlayerPanelSettings;
  hyperscaleLayers: HyperscaleLayer[];
  selectedHyperscaleLayerIds: string[];
}

/**
 * Hook that provides the adapted state for backward compatibility
 *
 * Usage in components that still expect GameContext state:
 * ```typescript
 * // Instead of:
 * const { state } = useGame();
 * const players = state.players;
 *
 * // Use:
 * const adaptedState = useGameContextAdapter();
 * const players = adaptedState.players;
 * ```
 *
 * @returns Adapted game state that mirrors the legacy GameContext structure
 */
export function useGameContextAdapter(): AdaptedGameState {
  const playersContext = usePlayers();
  const viewTransformContext = useViewTransform();
  const uiContext = useUI();

  // Memoize the adapted state to prevent unnecessary re-renders
  return useMemo<AdaptedGameState>(() => ({
    // Player state
    players: playersContext.players,
    activePlayerId: playersContext.activePlayerId,
    playerPermissions: playersContext.playerPermissions,

    // ViewTransform state
    viewTransform: viewTransformContext.viewTransform,

    // UI state
    language: uiContext.language,
    playerPanelSettings: uiContext.playerPanelSettings,
    hyperscaleLayers: uiContext.hyperscaleLayers,
    selectedHyperscaleLayerIds: uiContext.selectedHyperscaleLayerIds,
  }), [
    playersContext.players,
    playersContext.activePlayerId,
    playersContext.playerPermissions,
    viewTransformContext.viewTransform,
    uiContext.language,
    uiContext.playerPanelSettings,
    uiContext.hyperscaleLayers,
    uiContext.selectedHyperscaleLayerIds,
  ]);
}

/**
 * Hook that provides only the player-related state
 * Useful for components that only need player data
 */
export function usePlayerStateAdapter() {
  const playersContext = usePlayers();

  return useMemo(() => ({
    players: playersContext.players,
    activePlayerId: playersContext.activePlayerId,
    playerPermissions: playersContext.playerPermissions,
  }), [
    playersContext.players,
    playersContext.activePlayerId,
    playersContext.playerPermissions,
  ]);
}

/**
 * Hook that provides only the view transform state
 * Useful for components that only need view transform data
 */
export function useViewTransformAdapter() {
  const viewTransformContext = useViewTransform();

  return useMemo(() => ({
    viewTransform: viewTransformContext.viewTransform,
  }), [viewTransformContext.viewTransform]);
}

/**
 * Hook that provides only the UI-related state
 * Useful for components that only need UI data
 */
export function useUIStateAdapter() {
  const uiContext = useUI();

  return useMemo(() => ({
    language: uiContext.language,
    playerPanelSettings: uiContext.playerPanelSettings,
    hyperscaleLayers: uiContext.hyperscaleLayers,
    selectedHyperscaleLayerIds: uiContext.selectedHyperscaleLayerIds,
  }), [
    uiContext.language,
    uiContext.playerPanelSettings,
    uiContext.hyperscaleLayers,
    uiContext.selectedHyperscaleLayerIds,
  ]);
}

/**
 * Migration helper function to check if a component still uses legacy GameContext
 *
 * Usage in development:
 * ```typescript
 * checkLegacyUsage('MyComponent', ['players', 'viewTransform']);
 * ```
 */
export function checkLegacyUsage(componentName: string, usedFields: string[]) {
  if (process.env.NODE_ENV === 'development') {
    const legacyFields = usedFields.filter(field =>
      ['players', 'activePlayerId', 'playerPermissions', 'viewTransform',
       'language', 'playerPanelSettings', 'hyperscaleLayers', 'selectedHyperscaleLayerIds']
      .includes(field)
    );

    if (legacyFields.length > 0) {
      console.warn(
        `[Migration Warning] ${componentName} is using legacy GameContext fields:`,
        legacyFields
      );
      console.warn(
        `[Migration Hint] Consider migrating to:`,
        legacyFields.map(field => {
          if (['players', 'activePlayerId', 'playerPermissions'].includes(field)) {
            return `usePlayers() for ${field}`;
          } else if (field === 'viewTransform') {
            return `useViewTransform() for ${field}`;
          } else {
            return `useUI() for ${field}`;
          }
        }).join(', ')
      );
    }
  }
}

/**
 * Utility to create a migration path for components
 *
 * This helps identify which components need migration and provides guidance
 */
export function createMigrationPath(componentName: string, currentState: any) {
  if (process.env.NODE_ENV !== 'development') return;

  const requiredMigrations: string[] = [];

  // Check which legacy fields are being used
  if (currentState.players) {
    requiredMigrations.push('Migrate players to usePlayers()');
  }
  if (currentState.viewTransform) {
    requiredMigrations.push('Migrate viewTransform to useViewTransform()');
  }
  if (currentState.language || currentState.hyperscaleLayers) {
    requiredMigrations.push('Migrate UI state to useUI()');
  }

  if (requiredMigrations.length > 0) {
    console.group(`🔄 Migration Path for ${componentName}`);
    requiredMigrations.forEach(migration => {
      console.log(`  - ${migration}`);
    });
    console.groupEnd();
  }

  return requiredMigrations;
}