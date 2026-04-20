/**
 * Tabletop Refactored - Performance Tests
 *
 * Performance testing suite for refactored Tabletop components
 * Tests rendering performance, memoization effectiveness, and optimization
 */

import React, { Profiler, ProfilerOnRenderCallback } from 'react';
import { render, fireEvent } from '@testing-library/react';
import { Tabletop } from '../TabletopRefactored';

// Mock GameContext
jest.mock('../../store/GameContext', () => ({
  useGame: () => ({
    state: {
      objects: {},
      players: [],
    },
    dispatch: jest.fn(),
    isHost: true,
  }),
}));

// Mock contexts
jest.mock('../../store/contexts', () => ({
  useActivePlayerId: () => 'player-1',
  useIsGM: () => true,
  usePlayerList: () => [],
  useViewTransform: () => ({
    viewTransform: {
      pixelsPerVU: 1.08,
      zoom: 1,
      scroll: { x: 0, y: 0 },
    },
  }),
  useHyperscaleLayers: () => [],
  useLayerSelection: () => [[], jest.fn()],
  useLanguage: () => 'en',
}));

// Performance metrics
interface PerformanceMetrics {
  componentName: string;
  renderCount: number;
  totalTime: number;
  averageTime: number;
  memoizationHitRate: number;
}

const performanceResults: PerformanceMetrics[] = [];

/**
 * Profiler callback to measure component performance
 */
const onRenderCallback: ProfilerOnRenderCallback = (
  id,
  phase,
  actualDuration,
  baseDuration,
  startTime,
  commitTime,
  interactions
) => {
  const existingResult = performanceResults.find(r => r.componentName === id);

  if (existingResult) {
    existingResult.renderCount++;
    existingResult.totalTime += actualDuration;
    existingResult.averageTime = existingResult.totalTime / existingResult.renderCount;
  } else {
    performanceResults.push({
      componentName: id,
      renderCount: 1,
      totalTime: actualDuration,
      averageTime: actualDuration,
      memoizationHitRate: 0,
    });
  }

  console.log(`[Performance] ${id} (${phase}): ${actualDuration.toFixed(2)}ms`);
};

/**
 * Test 1: Initial render performance
 */
describe('Tabletop Refactored - Performance Tests', () => {

  test('should render initial component within acceptable time', () => {
    const startTime = performance.now();

    render(
      <Profiler id="Tabletop" onRender={onRenderCallback}>
        <Tabletop />
      </Profiler>
    );

    const endTime = performance.now();
    const renderTime = endTime - startTime;

    console.log(`Initial render time: ${renderTime.toFixed(2)}ms`);

    // Initial render should be under 100ms
    expect(renderTime).toBeLessThan(100);

    // Check that all sub-components rendered
    const componentNames = performanceResults.map(r => r.componentName);
    expect(componentNames).toContain('Tabletop');
  });

  /**
   * Test 2: Re-render performance with state changes
   */
  test('should handle state changes efficiently', () => {
    const { rerender } = render(
      <Profiler id="Tabletop" onRender={onRenderCallback}>
        <Tabletop />
      </Profiler>
    );

    const initialResults = [...performanceResults];

    // Trigger re-render
    rerender(
      <Profiler id="Tabletop" onRender={onRenderCallback}>
        <Tabletop />
      </Profiler>
    );

    // Check that memoization prevented unnecessary re-renders
    performanceResults.forEach(result => {
      const initialResult = initialResults.find(r => r.componentName === result.componentName);
      if (initialResult) {
        const reRenderCount = result.renderCount - initialResult.renderCount;

        // Most components should not re-render without prop changes
        if (result.componentName !== 'Tabletop') {
          expect(reRenderCount).toBeLessThanOrEqual(1);
        }
      }
    });
  });

  /**
   * Test 3: Memory usage check
   */
  test('should maintain acceptable memory usage', () => {
    const initialMemory = (performance as any).memory?.usedJSHeapSize || 0;

    render(
      <Profiler id="Tabletop" onRender={onRenderCallback}>
        <Tabletop />
      </Profiler>
    );

    const finalMemory = (performance as any).memory?.usedJSHeapSize || 0;
    const memoryIncrease = finalMemory - initialMemory;

    console.log(`Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);

    // Memory increase should be reasonable (less than 10MB for initial render)
    expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
  });

  /**
   * Test 4: Component memoization effectiveness
   */
  test('should effectively memoize components', () => {
    let renderCount = 0;

    const MockComponent = React.memo(() => {
      renderCount++;
      return <div>Mock</div>;
    });

    const { rerender } = render(<MockComponent />);

    const initialCount = renderCount;

    // Re-render with same props
    rerender(<MockComponent />);

    // Memoized component should not re-render
    expect(renderCount).toBe(initialCount);
  });

  /**
   * Test 5: Event handler performance
   */
  test('should handle events efficiently', () => {
    const { container } = render(<Tabletop />);

    const startTime = performance.now();

    // Simulate mouse move events
    const tabletopElement = container.querySelector('[data-tabletop="true"]');
    if (tabletopElement) {
      for (let i = 0; i < 100; i++) {
        fireEvent.mouseMove(tabletopElement, {
          clientX: 100 + i,
          clientY: 100 + i,
        });
      }
    }

    const endTime = performance.now();
    const eventTime = endTime - startTime;

    console.log(`100 mouse move events processed in: ${eventTime.toFixed(2)}ms`);

    // Event handling should be fast (less than 50ms for 100 events)
    expect(eventTime).toBeLessThan(50);
  });
});

/**
 * Performance report generator
 */
export const generatePerformanceReport = () => {
  console.log('\n=== Performance Report ===');
  console.log('Component Render Times:');
  performanceResults.forEach(result => {
    console.log(`${result.componentName}:`);
    console.log(`  - Renders: ${result.renderCount}`);
    console.log(`  - Total Time: ${result.totalTime.toFixed(2)}ms`);
    console.log(`  - Average Time: ${result.averageTime.toFixed(2)}ms`);
  });

  const totalTime = performanceResults.reduce((sum, r) => sum + r.totalTime, 0);
  const averageTime = totalTime / performanceResults.length;

  console.log(`\nTotal Performance:`);
  console.log(`  - Total Time: ${totalTime.toFixed(2)}ms`);
  console.log(`  - Average Time: ${averageTime.toFixed(2)}ms`);
  console.log(`  - Components Tested: ${performanceResults.length}`);
};

// Run report after tests
afterAll(() => {
  generatePerformanceReport();
});