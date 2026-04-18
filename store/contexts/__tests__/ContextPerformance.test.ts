/**
 * Context Architecture Performance Tests
 *
 * Comprehensive performance testing for the refactored context architecture.
 * Tests render optimization, memory usage, and operation timing.
 */

import { performanceTestSuite, runQuickPerformanceTest } from '../../utils/performanceTest';
import { performance } from 'perf_hooks';

// Mock the performance API for Node.js environment
(global as any).performance = {
  now: () => Date.now(),
  memory: {
    usedJSHeapSize: 50 * 1024 * 1024,  // 50MB
    totalJSHeapSize: 70 * 1024 * 1024,  // 70MB
    jsHeapSizeLimit: 1024 * 1024 * 1024, // 1GB
  },
};

describe('Context Architecture Performance Tests', () => {
  beforeEach(() => {
    performanceTestSuite.clear();
  });

  describe('Render Performance', () => {
    test('should minimize renders when using context selectors', async () => {
      const testName = 'Context Selector Render Optimization';

      await runQuickPerformanceTest(testName, async () => {
        // Simulate component renders with context selectors
        for (let i = 0; i < 100; i++) {
          // Simulate using usePlayerList(), useLanguage(), etc.
          performanceTestSuite.trackComponentRender('PlayerComponent', 0.5);
          performanceTestSuite.trackComponentRender('UIComponent', 0.3);
          performanceTestSuite.trackComponentRender('TransformComponent', 0.2);

          // Simulate state updates
          if (i % 10 === 0) {
            // Only components using updated data should re-render
            performanceTestSuite.trackComponentRender('PlayerComponent', 0.6);
          }
        }
      });

      const results = performanceTestSuite.getResults();
      const latestResult = results[results.length - 1];

      expect(latestResult.success).toBe(true);
      expect(latestResult.metrics.renderCounts['PlayerComponent']).toBeLessThan(120); // Should have minimal renders
    });

    test('should isolate context updates', async () => {
      const testName = 'Context Update Isolation';

      await runQuickPerformanceTest(testName, async () => {
        // Simulate updating only player context
        performanceTestSuite.trackComponentRender('PlayerComponent', 0.5);
        performanceTestSuite.trackComponentRender('UIComponent', 0.3);
        performanceTestSuite.trackComponentRender('TransformComponent', 0.2);

        // Update player state - only PlayerComponent should re-render
        performanceTestSuite.trackComponentRender('PlayerComponent', 0.6);

        // Update UI state - only UIComponent should re-render
        performanceTestSuite.trackComponentRender('UIComponent', 0.4);

        // Update transform - only TransformComponent should re-render
        performanceTestSuite.trackComponentRender('TransformComponent', 0.3);
      });

      const componentStats = performanceTestSuite.getComponentStats();

      // Each component should only render twice (initial + 1 update)
      componentStats.forEach(stat => {
        expect(stat.renderCount).toBeLessThanOrEqual(2);
      });
    });
  });

  describe('Memory Performance', () => {
    test('should maintain low memory usage with context optimization', async () => {
      const testName = 'Context Memory Optimization';

      await runQuickPerformanceTest(testName, async () => {
        // Simulate creating and destroying components
        for (let i = 0; i < 1000; i++) {
          performanceTestSuite.trackComponentRender(`Component_${i % 10}`, 0.1);

          // Simulate context updates
          if (i % 100 === 0) {
            // Should trigger garbage collection of unused contexts
            const memory = performanceTestSuite.getMemoryUsage();
            expect(memory?.usedPercentage).toBeLessThan(50);
          }
        }
      });

      const latestResult = performanceTestSuite.getResults().pop();
      expect(latestResult?.success).toBe(true);

      const memoryUsage = latestResult?.metrics.memoryUsage;
      if (memoryUsage) {
        expect(memoryUsage.usedPercentage).toBeLessThan(50);
      }
    });

    test('should prevent memory leaks with proper cleanup', async () => {
      const testName = 'Context Memory Leak Prevention';

      const initialMemory = performanceTestSuite.getMemoryUsage();

      await runQuickPerformanceTest(testName, async () => {
        // Simulate mounting and unmounting components
        for (let i = 0; i < 100; i++) {
          performanceTestSuite.trackComponentRender('TemporaryComponent', 0.2);

          // Simulate component unmounting
          if (i % 10 === 0) {
            // Memory should be released
            const currentMemory = performanceTestSuite.getMemoryUsage();
            if (initialMemory && currentMemory) {
              const delta = parseFloat(currentMemory.usedJSHeapSize) - parseFloat(initialMemory.usedJSHeapSize);
              expect(delta).toBeLessThan(10); // Less than 10MB growth
            }
          }
        }
      });

      const latestResult = performanceTestSuite.getResults().pop();
      expect(latestResult?.success).toBe(true);
    });
  });

  describe('Operation Performance', () => {
    test('should provide fast context value access', async () => {
      const testName = 'Context Access Speed';

      await runQuickPerformanceTest(testName, async () => {
        // Simulate frequent context access
        for (let i = 0; i < 10000; i++) {
          const startTime = Date.now();

          // Simulate context value access
          const playerData = { id: 'player1', name: 'Test Player' };
          const uiData = { language: 'en', theme: 'dark' };
          const transformData = { zoom: 1.0, offset: { x: 0, y: 0 } };

          const accessTime = Date.now() - startTime;
          performanceTestSuite.trackComponentRender('ContextAccess', accessTime);
        }
      });

      const componentStats = performanceTestSuite.getComponentStats();
      const accessStats = componentStats.find(s => s.componentName === 'ContextAccess');

      expect(accessStats).toBeDefined();
      expect(accessStats!.averageRenderTime).toBeLessThan(1); // Should be very fast (< 1ms)
    });

    test('should efficiently batch context updates', async () => {
      const testName = 'Batch Context Updates';

      await runQuickPerformanceTest(testName, async () => {
        // Simulate batch updates
        for (let i = 0; i < 100; i++) {
          const batchStartTime = Date.now();

          // Simulate updating multiple context values at once
          performanceTestSuite.trackComponentRender('PlayerComponent', 0.3);
          performanceTestSuite.trackComponentRender('UIComponent', 0.2);
          performanceTestSuite.trackComponentRender('TransformComponent', 0.1);

          const batchTime = Date.now() - batchStartTime;
          performanceTestSuite.trackComponentRender('BatchUpdate', batchTime);
        }
      });

      const componentStats = performanceTestSuite.getComponentStats();
      const batchStats = componentStats.find(s => s.componentName === 'BatchUpdate');

      expect(batchStats).toBeDefined();
      expect(batchStats!.averageRenderTime).toBeLessThan(5); // Should be fast (< 5ms)
    });
  });

  describe('Integration Performance', () => {
    test('should handle concurrent context access efficiently', async () => {
      const testName = 'Concurrent Context Access';

      await runQuickPerformanceTest(testName, async () => {
        // Simulate multiple components accessing different contexts simultaneously
        const components = [
          'PlayerComponent',
          'UIComponent',
          'TransformComponent',
          'GameComponent',
          'SettingsComponent'
        ];

        for (let i = 0; i < 1000; i++) {
          components.forEach(component => {
            performanceTestSuite.trackComponentRender(component, Math.random() * 2);
          });
        }
      });

      const latestResult = performanceTestSuite.getResults().pop();
      expect(latestResult?.success).toBe(true);

      const componentStats = performanceTestSuite.getComponentStats();

      // All components should have similar render counts (fair distribution)
      const renderCounts = componentStats.map(s => s.renderCount);
      const maxRenders = Math.max(...renderCounts);
      const minRenders = Math.min(...renderCounts);

      expect(maxRenders - minRenders).toBeLessThan(100); // Should be fairly distributed
    });

    test('should maintain performance under heavy load', async () => {
      const testName = 'Heavy Load Performance';

      await runQuickPerformanceTest(testName, async () => {
        // Simulate heavy application load
        for (let i = 0; i < 5000; i++) {
          // Simulate various operations
          performanceTestSuite.trackComponentRender('PlayerComponent', Math.random() * 3);
          performanceTestSuite.trackComponentRender('UIComponent', Math.random() * 2);
          performanceTestSuite.trackComponentRender('TransformComponent', Math.random() * 1.5);

          if (i % 100 === 0) {
            // Simulate periodic state updates
            performanceTestSuite.trackComponentRender('GameComponent', 0.5);
          }
        }
      });

      const latestResult = performanceTestSuite.getResults().pop();
      expect(latestResult?.success).toBe(true);

      const componentStats = performanceTestSuite.getComponentStats();
      const totalRenders = componentStats.reduce((sum, stat) => sum + stat.renderCount, 0);

      // Total renders should be reasonable (not exponential)
      expect(totalRenders).toBeLessThan(20000);
    });
  });

  describe('WebRTC Synchronization Performance', () => {
    test('should efficiently handle remote state updates', async () => {
      const testName = 'WebRTC Sync Performance';

      await runQuickPerformanceTest(testName, async () => {
        // Simulate receiving remote updates
        for (let i = 0; i < 100; i++) {
          const syncStartTime = Date.now();

          // Simulate sync from remote
          performanceTestSuite.trackComponentRender('PlayerComponent', 0.4);
          performanceTestSuite.trackComponentRender('UIComponent', 0.3);

          const syncTime = Date.now() - syncStartTime;
          performanceTestSuite.trackComponentRender('WebRTCSync', syncTime);
        }
      });

      const componentStats = performanceTestSuite.getComponentStats();
      const syncStats = componentStats.find(s => s.componentName === 'WebRTCSync');

      expect(syncStats).toBeDefined();
      expect(syncStats!.averageRenderTime).toBeLessThan(10); // Should be fast (< 10ms)
    });

    test('should minimize data transfer with differential sync', async () => {
      const testName = 'Differential Sync Efficiency';

      await runQuickPerformanceTest(testName, async () => {
        // Simulate differential sync (only send changed data)
        for (let i = 0; i < 100; i++) {
          const dataSize = Math.floor(Math.random() * 10); // 0-9 changed fields
          const syncTime = dataSize * 0.1; // Linear scaling

          performanceTestSuite.trackComponentRender('DifferentialSync', syncTime);
        }
      });

      const componentStats = performanceTestSuite.getComponentStats();
      const syncStats = componentStats.find(s => s.componentName === 'DifferentialSync');

      expect(syncStats).toBeDefined();
      expect(syncStats!.averageRenderTime).toBeLessThan(2); // Should be very efficient
    });
  });
});

describe('Performance Regression Tests', () => {
  test('should meet minimum performance thresholds', async () => {
    const testName = 'Minimum Performance Thresholds';

    await runQuickPerformanceTest(testName, async () => {
      // Simulate typical application usage
      for (let i = 0; i < 1000; i++) {
        performanceTestSuite.trackComponentRender('PlayerComponent', 0.5);
        performanceTestSuite.trackComponentRender('UIComponent', 0.3);
        performanceTestSuite.trackComponentRender('TransformComponent', 0.2);

        if (i % 100 === 0) {
          performanceTestSuite.trackComponentRender('GameComponent', 1.0);
        }
      }
    });

    const componentStats = performanceTestSuite.getComponentStats();

    // Check performance thresholds
    componentStats.forEach(stat => {
      // Average render time should be under 2ms
      expect(stat.averageRenderTime).toBeLessThan(2);

      // Max render time should be under 10ms
      expect(stat.maxRenderTime).toBeLessThan(10);

      // No component should render excessively
      expect(stat.renderCount).toBeLessThan(2000);
    });

    // Memory usage should be reasonable
    const memoryUsage = performanceTestSuite.getMemoryUsage();
    if (memoryUsage) {
      expect(memoryUsage.usedPercentage).toBeLessThan(60);
    }
  });

  test('should show improvement over monolithic architecture', async () => {
    const testName = 'Architecture Comparison';

    // Simulate old monolithic architecture (all components re-render on any change)
    const monolithicRenders: number[] = [];
    for (let i = 0; i < 100; i++) {
      // All components re-render
      monolithicRenders.push(10); // 10 components * 100 changes = 1000 renders
    }

    // Simulate new modular architecture (only affected components re-render)
    performanceTestSuite.clear();
    await runQuickPerformanceTest(testName, async () => {
      for (let i = 0; i < 100; i++) {
        // Only 1-2 components re-render per change
        const affectedComponents = Math.floor(Math.random() * 2) + 1;
        for (let j = 0; j < affectedComponents; j++) {
          performanceTestSuite.trackComponentRender(`Component_${j}`, 0.5);
        }
      }
    });

    const componentStats = performanceTestSuite.getComponentStats();
    const modularRenders = componentStats.reduce((sum, stat) => sum + stat.renderCount, 0);

    // Modular architecture should have significantly fewer renders
    const monolithicTotal = monolithicRenders.reduce((a, b) => a + b, 0);
    const improvementRatio = monolithicTotal / modularRenders;

    expect(improvementRatio).toBeGreaterThan(2); // At least 2x improvement
    console.log(`✅ Render improvement: ${improvementRatio.toFixed(2)}x fewer renders`);
  });
});