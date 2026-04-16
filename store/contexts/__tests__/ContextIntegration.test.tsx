/**
 * Integration Tests for Context Refactoring - Phase 6
 *
 * This test suite verifies that all contexts work correctly together
 * and maintain backward compatibility with GameContext.
 */

import React from 'react';
import { renderHook, act } from '@testing-library/react';
import {
  PlayerProvider,
  usePlayers,
  ViewTransformProvider,
  useViewTransform,
  UIProvider,
  useUI,
  useGameContextAdapter
} from '../index';

// Test wrapper with all providers
function createTestWrapper() {
  return ({ children }: { children: React.ReactNode }) => (
    <UIProvider>
      <ViewTransformProvider>
        <PlayerProvider>
          {children}
        </PlayerProvider>
      </ViewTransformProvider>
    </UIProvider>
  );
}

describe('Context Integration Tests - Phase 6', () => {

  describe('Player Context Integration', () => {
    test('should provide player data correctly', () => {
      const wrapper = createTestWrapper();
      const { result } = renderHook(() => usePlayers(), { wrapper });

      expect(result.current.players).toBeDefined();
      expect(result.current.players.length).toBeGreaterThan(0);
      expect(result.current.activePlayerId).toBeDefined();
    });

    test('should add and update players', () => {
      const wrapper = createTestWrapper();
      const { result } = renderHook(() => usePlayers(), { wrapper });

      const initialCount = result.current.players.length;

      act(() => {
        result.current.addPlayer({
          id: 'test-player-1',
          name: 'Test Player',
          color: '#00FF00',
          isGM: false,
        });
      });

      expect(result.current.players.length).toBe(initialCount + 1);

      act(() => {
        result.current.updatePlayer('test-player-1', { name: 'Updated Player' });
      });

      const player = result.current.getPlayerById('test-player-1');
      expect(player?.name).toBe('Updated Player');
    });

    test('should handle active player switching', () => {
      const wrapper = createTestWrapper();
      const { result } = renderHook(() => usePlayers(), { wrapper });

      const originalActiveId = result.current.activePlayerId;

      act(() => {
        result.current.addPlayer({
          id: 'test-player-2',
          name: 'Another Test Player',
          color: '#0000FF',
          isGM: false,
        });
      });

      act(() => {
        result.current.setActivePlayer('test-player-2');
      });

      expect(result.current.activePlayerId).toBe('test-player-2');
      expect(result.current.getActivePlayer()?.id).toBe('test-player-2');
    });

    test('should check GM status correctly', () => {
      const wrapper = createTestWrapper();
      const { result } = renderHook(() => usePlayers(), { wrapper });

      // Initial player should be GM
      expect(result.current.isGM()).toBe(true);

      act(() => {
        result.current.addPlayer({
          id: 'regular-player',
          name: 'Regular Player',
          color: '#FF0000',
          isGM: false,
        });
      });

      act(() => {
        result.current.setActivePlayer('regular-player');
      });

      expect(result.current.isGM()).toBe(false);
    });
  });

  describe('ViewTransform Context Integration', () => {
    test('should provide view transform data', () => {
      const wrapper = createTestWrapper();
      const { result } = renderHook(() => useViewTransform(), { wrapper });

      expect(result.current.viewTransform).toBeDefined();
      expect(result.current.viewTransform.offset).toBeDefined();
      expect(result.current.viewTransform.zoom).toBeDefined();
      expect(result.current.viewTransform.pixelsPerVU).toBeGreaterThan(0);
    });

    test('should update zoom level', () => {
      const wrapper = createTestWrapper();
      const { result } = renderHook(() => useViewTransform(), { wrapper });

      const initialZoom = result.current.viewTransform.zoom;

      act(() => {
        result.current.setZoom(2.5);
      });

      expect(result.current.viewTransform.zoom).toBe(2.5);
      expect(result.current.viewTransform.zoom).not.toBe(initialZoom);
    });

    test('should update offset position', () => {
      const wrapper = createTestWrapper();
      const { result } = renderHook(() => useViewTransform(), { wrapper });

      act(() => {
        result.current.setOffset(100, 200);
      });

      expect(result.current.viewTransform.offset.x).toBe(100);
      expect(result.current.viewTransform.offset.y).toBe(200);
    });

    test('should convert coordinates correctly', () => {
      const wrapper = createTestWrapper();
      const { result } = renderHook(() => useViewTransform(), { wrapper });

      // Set a known transform state
      act(() => {
        result.current.setZoom(2);
        result.current.setOffset(50, 50);
      });

      // Test viewport to world conversion
      const worldCoords = result.current.viewportToWorld(100, 100);
      expect(worldCoords).toBeDefined();
      expect(typeof worldCoords.x).toBe('number');
      expect(typeof worldCoords.y).toBe('number');

      // Test world to viewport conversion
      const viewportCoords = result.current.worldToViewport(0, 0);
      expect(viewportCoords).toBeDefined();
      expect(typeof viewportCoords.x).toBe('number');
      expect(typeof viewportCoords.y).toBe('number');
    });

    test('should reset transform', () => {
      const wrapper = createTestWrapper();
      const { result } = renderHook(() => useViewTransform(), { wrapper });

      act(() => {
        result.current.setZoom(3);
        result.current.setOffset(500, 500);
      });

      act(() => {
        result.current.resetTransform();
      });

      expect(result.current.viewTransform.zoom).toBe(1);
      expect(result.current.viewTransform.offset.x).toBe(0);
      expect(result.current.viewTransform.offset.y).toBe(0);
    });
  });

  describe('UI Context Integration', () => {
    test('should provide UI data', () => {
      const wrapper = createTestWrapper();
      const { result } = renderHook(() => useUI(), { wrapper });

      expect(result.current.language).toBeDefined();
      expect(result.current.hyperscaleLayers).toBeDefined();
      expect(result.current.hyperscaleLayers.length).toBeGreaterThan(0);
      expect(result.current.selectedHyperscaleLayerIds).toBeDefined();
    });

    test('should switch language', () => {
      const wrapper = createTestWrapper();
      const { result } = renderHook(() => useUI(), { wrapper });

      const initialLanguage = result.current.language;

      act(() => {
        result.current.setLanguage('ru');
      });

      expect(result.current.language).toBe('ru');
      expect(result.current.language).not.toBe(initialLanguage);
    });

    test('should manage hyperscale layers', () => {
      const wrapper = createTestWrapper();
      const { result } = renderHook(() => useUI(), { wrapper });

      const initialLayerCount = result.current.hyperscaleLayers.length;

      act(() => {
        result.current.addHyperscaleLayer({
          id: 'test-layer',
          name: 'Test Layer',
          minZIndex: 10000,
          maxZIndex: 11000,
          color: '#CCCCCC',
          playerCanSelect: true,
          playerCanView: true,
          individualPosition: false,
          individualObjects: false,
          zoomEnabled: true,
          order: 10,
        });
      });

      expect(result.current.hyperscaleLayers.length).toBe(initialLayerCount + 1);

      act(() => {
        result.current.updateHyperscaleLayer('test-layer', { name: 'Updated Test Layer' });
      });

      const layer = result.current.hyperscaleLayers.find(l => l.id === 'test-layer');
      expect(layer?.name).toBe('Updated Test Layer');
    });

    test('should manage layer selection', () => {
      const wrapper = createTestWrapper();
      const { result } = renderHook(() => useUI(), { wrapper });

      const initialSelectionCount = result.current.selectedHyperscaleLayerIds.length;

      act(() => {
        result.current.deselectAllLayers();
      });

      expect(result.current.selectedHyperscaleLayerIds.length).toBe(0);

      act(() => {
        result.current.selectAllLayers();
      });

      expect(result.current.selectedHyperscaleLayerIds.length).toBeGreaterThan(0);

      act(() => {
        result.current.toggleLayerSelection('boards');
      });

      expect(result.current.selectedHyperscaleLayerIds.includes('boards')).toBe(false);
    });

    test('should get selected layers correctly', () => {
      const wrapper = createTestWrapper();
      const { result } = renderHook(() => useUI(), { wrapper });

      const selectedLayers = result.current.getSelectedLayers();
      expect(Array.isArray(selectedLayers)).toBe(true);

      // All selected layers should be in the layers array
      selectedLayers.forEach(layer => {
        expect(result.current.hyperscaleLayers).toContain(layer);
      });
    });
  });

  describe('Cross-Context Integration', () => {
    test('should work with adapter for backward compatibility', () => {
      const wrapper = createTestWrapper();
      const { result } = renderHook(() => useGameContextAdapter(), { wrapper });

      expect(result.current.players).toBeDefined();
      expect(result.current.viewTransform).toBeDefined();
      expect(result.current.language).toBeDefined();
      expect(result.current.hyperscaleLayers).toBeDefined();
    });

    test('should maintain data consistency across contexts', () => {
      const wrapper = createTestWrapper();

      // Test player context
      const { result: playerResult } = renderHook(() => usePlayers(), { wrapper });
      const { result: adapterResult } = renderHook(() => useGameContextAdapter(), { wrapper });

      expect(playerResult.current.players).toEqual(adapterResult.current.players);
      expect(playerResult.current.activePlayerId).toEqual(adapterResult.current.activePlayerId);
    });

    test('should handle simultaneous updates from different contexts', () => {
      const wrapper = createTestWrapper();

      const { result: playerResult } = renderHook(() => usePlayers(), { wrapper });
      const { result: viewResult } = renderHook(() => useViewTransform(), { wrapper });
      const { result: uiResult } = renderHook(() => useUI(), { wrapper });

      act(() => {
        // Update all contexts simultaneously
        playerResult.current.setActivePlayer('gm');
        viewResult.current.setZoom(1.5);
        uiResult.current.setLanguage('en');
      });

      expect(playerResult.current.activePlayerId).toBe('gm');
      expect(viewResult.current.viewTransform.zoom).toBe(1.5);
      expect(uiResult.current.language).toBe('en');
    });
  });

  describe('Performance Tests', () => {
    test('should not cause unnecessary re-renders', () => {
      const wrapper = createTestWrapper();

      let renderCount = 0;
      const { result } = renderHook(() => {
        renderCount++;
        return usePlayers();
      }, { wrapper });

      const initialRenderCount = renderCount;

      // Update UI context (should not cause player context to re-render)
      act(() => {
        const { result: uiResult } = renderHook(() => useUI(), { wrapper });
        uiResult.current.setLanguage('de');
      });

      // Player context should not re-render when UI context changes
      expect(renderCount).toBe(initialRenderCount);
    });

    test('should handle bulk operations efficiently', () => {
      const wrapper = createTestWrapper();
      const { result } = renderHook(() => usePlayers(), { wrapper });

      const startTime = Date.now();

      act(() => {
        // Add multiple players
        for (let i = 0; i < 10; i++) {
          result.current.addPlayer({
            id: `bulk-player-${i}`,
            name: `Bulk Player ${i}`,
            color: `#${Math.floor(Math.random()*16777215).toString(16)}`,
            isGM: false,
          });
        }
      });

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      // Should complete in reasonable time (< 100ms)
      expect(executionTime).toBeLessThan(100);
      expect(result.current.players.length).toBeGreaterThanOrEqual(10);
    });
  });
});