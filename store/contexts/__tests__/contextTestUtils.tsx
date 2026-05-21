/**
 * Context Testing Utilities
 *
 * Provides utilities for testing modular contexts without affecting the main application
 */

import React, { ReactNode } from 'react';
import {
  PlayerProvider,
  ViewTransformProvider,
  UIProvider,
  PlayerState,
  ViewTransformState,
  UIState,
  initialPlayerState,
  initialViewTransformState,
  initialUIState,
} from '../index';

// ============================================================================
// TEST PROVIDERS WITH CUSTOM INITIAL STATE
// ============================================================================

interface TestPlayerProviderProps {
  children: ReactNode;
  initialState?: Partial<PlayerState>;
}

export function TestPlayerProvider({ children, initialState }: TestPlayerProviderProps) {
  // We'll need to modify the actual provider to accept initial state
  // For now, this is a placeholder
  return <PlayerProvider>{children}</PlayerProvider>;
}

interface TestViewTransformProviderProps {
  children: ReactNode;
  initialState?: Partial<ViewTransformState>;
}

export function TestViewTransformProvider({ children, initialState }: TestViewTransformProviderProps) {
  return <ViewTransformProvider>{children}</ViewTransformProvider>;
}

interface TestUIProviderProps {
  children: ReactNode;
  initialState?: Partial<UIState>;
}

export function TestUIProvider({ children, initialState }: TestUIProviderProps) {
  return <UIProvider>{children}</UIProvider>;
}

// ============================================================================
// MOCK DATA GENERATORS
// ============================================================================

import { Player, HyperscaleLayer } from '../../types';

/**
 * Generate mock players for testing
 */
export function generateMockPlayers(count: number = 3): Player[] {
  const colors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF'];
  const players: Player[] = [
    {
      id: 'gm',
      name: 'Game Master',
      color: '#FF0000',
      isGM: true,
    },
  ];

  for (let i = 1; i <= count; i++) {
    players.push({
      id: `player-${i}`,
      name: `Player ${i}`,
      color: colors[i % colors.length],
      isGM: false,
    });
  }

  return players;
}

/**
 * Generate mock hyperscale layers for testing
 */
export function generateMockLayers(count: number = 3): HyperscaleLayer[] {
  const colors = ['#3b82f6', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6'];
  const names = ['Test Layer 1', 'Test Layer 2', 'Test Layer 3', 'Test Layer 4', 'Test Layer 5'];

  return Array.from({ length: count }, (_, i) => ({
    id: `test-layer-${i}`,
    name: names[i % names.length],
    minZIndex: i * 1000,
    maxZIndex: (i + 1) * 1000 - 1,
    color: colors[i % colors.length],
    playerCanSelect: true,
    playerCanView: true,
    individualObjects: false,
    zoomEnabled: true,
    order: i,
  }));
}

/**
 * Generate mock panel settings for testing
 */
export function generateMockPanelSettings(playerCount: number = 2, panelsPerPlayer: number = 2) {
  const settings: any = {};

  for (let p = 1; p <= playerCount; p++) {
    const playerId = `player-${p}`;
    settings[playerId] = {};

    for (let i = 1; i <= panelsPerPlayer; i++) {
      const panelId = `panel-${i}`;
      settings[playerId][panelId] = {
        x: 100 + i * 50,
        y: 100 + i * 50,
        width: 300,
        height: 400,
        minimized: i % 2 === 0,
      };
    }
  }

  return settings;
}

// ============================================================================
// TEST SCENARIOS
// ============================================================================

/**
 * Test scenarios for each context
 */
export const testScenarios = {
  player: {
    addPlayer: 'Add a new player to the game',
    removePlayer: 'Remove an existing player',
    setActivePlayer: 'Change the active player',
    updatePermissions: 'Update player permissions',
    gmMode: 'Test GM mode functionality',
    playerColors: 'Test player color management',
  },

  viewTransform: {
    zoomIn: 'Zoom in the viewport',
    zoomOut: 'Zoom out the viewport',
    pan: 'Pan the viewport',
    reset: 'Reset viewport to default',
    coordinateConversion: 'Test viewport/world coordinate conversion',
    windowResize: 'Test window resize handling',
  },

  ui: {
    changeLanguage: 'Change application language',
    updatePanelSettings: 'Update panel settings for a player',
    addLayer: 'Add a new hyperscale layer',
    removeLayer: 'Remove a hyperscale layer',
    toggleLayerSelection: 'Toggle layer selection',
    selectAllLayers: 'Select all layers',
    deselectAllLayers: 'Deselect all layers',
  },
};

// ============================================================================
// ASSERTION HELPERS
// ============================================================================

/**
 * Assert player state is valid
 */
export function assertPlayerState(state: PlayerState) {
  if (!state.players || state.players.length === 0) {
    throw new Error('Player state must have at least one player');
  }

  if (!state.activePlayerId) {
    throw new Error('Player state must have an active player ID');
  }

  const activePlayer = state.players.find(p => p.id === state.activePlayerId);
  if (!activePlayer) {
    throw new Error(`Active player ID ${state.activePlayerId} not found in players array`);
  }

  if (!state.playerPermissions) {
    throw new Error('Player state must have player permissions defined');
  }

  return true;
}

/**
 * Assert view transform state is valid
 */
export function assertViewTransformState(state: ViewTransformState) {
  const { viewTransform } = state;

  if (!viewTransform) {
    throw new Error('View transform state must have viewTransform object');
  }

  if (typeof viewTransform.zoom !== 'number' || viewTransform.zoom <= 0) {
    throw new Error('Zoom must be a positive number');
  }

  if (typeof viewTransform.pixelsPerVU !== 'number' || viewTransform.pixelsPerVU <= 0) {
    throw new Error('Pixels per VU must be a positive number');
  }

  if (!viewTransform.offset || typeof viewTransform.offset.x !== 'number' || typeof viewTransform.offset.y !== 'number') {
    throw new Error('Offset must have x and y coordinates');
  }

  if (!viewTransform.scroll || typeof viewTransform.scroll.x !== 'number' || typeof viewTransform.scroll.y !== 'number') {
    throw new Error('Scroll must have x and y coordinates');
  }

  return true;
}

/**
 * Assert UI state is valid
 */
export function assertUIState(state: UIState) {
  if (!state.language || typeof state.language !== 'string') {
    throw new Error('UI state must have a valid language');
  }

  if (!state.hyperscaleLayers || !Array.isArray(state.hyperscaleLayers)) {
    throw new Error('UI state must have hyperscale layers array');
  }

  if (!state.selectedHyperscaleLayerIds || !Array.isArray(state.selectedHyperscaleLayerIds)) {
    throw new Error('UI state must have selected hyperscale layer IDs array');
  }

  if (!state.playerPanelSettings || typeof state.playerPanelSettings !== 'object') {
    throw new Error('UI state must have player panel settings object');
  }

  return true;
}

// ============================================================================
// PERFORMANCE TESTING UTILITIES
// ============================================================================

/**
 * Measure render performance of a component
 */
export function measureRenderPerformance(componentName: string, renderFn: () => void) {
  const startTime = performance.now();
  renderFn();
  const endTime = performance.now();

  const duration = endTime - startTime;


  return {
    duration,
    componentName,
    timestamp: Date.now(),
  };
}

/**
 * Count re-renders of a component (for testing)
 */
export function createRenderCounter(componentName: string) {
  let renderCount = 0;

  return {
    count: () => renderCount,
    increment: () => {
      renderCount++;
    },
    reset: () => {
      renderCount = 0;
    },
  };
}

// ============================================================================
// INTEGRATION TEST HELPERS
// ============================================================================

/**
 * Create a complete test environment with all contexts
 */
export function createTestEnvironment() {
  const mockPlayers = generateMockPlayers(3);
  const mockLayers = generateMockLayers(3);
  const mockPanelSettings = generateMockPanelSettings(2, 2);

  return {
    players: {
      initialState: {
        ...initialPlayerState,
        players: mockPlayers,
        activePlayerId: mockPlayers[0].id,
      },
    },
    viewTransform: {
      initialState: initialViewTransformState,
    },
    ui: {
      initialState: {
        ...initialUIState,
        hyperscaleLayers: mockLayers,
        playerPanelSettings: mockPanelSettings,
      },
    },
  };
}

/**
 * Run a comprehensive test suite for all contexts
 */
export function runContextTests() {
  console.group('🧪 Context Test Suite');

  try {
    // Test initial states
    assertPlayerState(initialPlayerState);

    assertViewTransformState(initialViewTransformState);

    assertUIState(initialUIState);

    // Test mock data generators
    const mockPlayers = generateMockPlayers(3);

    const mockLayers = generateMockLayers(3);

    const mockSettings = generateMockPanelSettings(2, 2);

    // Test environment creation
    const testEnv = createTestEnvironment();

    console.groupEnd();

    return { success: true, testEnv };
  } catch (error) {
    console.groupEnd();
    return { success: false, error };
  }
}

// Auto-run tests in development
if (typeof window !== 'undefined' && import.meta.env?.DEV) {
  (window as any).runContextTests = runContextTests;
}
