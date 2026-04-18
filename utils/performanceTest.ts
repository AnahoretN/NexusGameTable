/**
 * Comprehensive Performance Testing Suite
 *
 * Measures actual performance metrics for the refactored context architecture
 * including render counts, memory usage, FPS, and operation timing.
 */

import { perfMonitor, fpsMonitor, PerformanceStats } from './performanceMonitor';

export interface PerformanceTestResult {
  testName: string;
  timestamp: number;
  duration: number;
  metrics: {
    renderCounts: Record<string, number>;
    memoryUsage: MemoryUsage;
    fps: number;
    operationTimings: Record<string, PerformanceStats>;
  };
  success: boolean;
  error?: string;
}

export interface MemoryUsage {
  usedJSHeapSize: string;      // e.g., "45.23MB"
  totalJSHeapSize: string;     // e.g., "65.45MB"
  jsHeapSizeLimit: string;     // e.g., "1024.00MB"
  usedPercentage: number;      // e.g., 6.39
}

export interface ComponentRenderStats {
  componentName: string;
  renderCount: number;
  averageRenderTime: number;
  minRenderTime: number;
  maxRenderTime: number;
}

/**
 * Performance Test Suite
 */
export class PerformanceTestSuite {
  private results: PerformanceTestResult[] = [];
  private componentRenders: Map<string, number[]> = new Map();
  private baselineMemory: MemoryUsage | null = null;
  private testStartTime: number = 0;

  /**
   * Start a new performance test
   */
  startTest(testName: string): void {
    this.testStartTime = performance.now();
    this.baselineMemory = this.getMemoryUsage();
    console.log(`🧪 Starting performance test: ${testName}`);
    console.log(`📊 Baseline memory:`, this.baselineMemory);
  }

  /**
   * End the current performance test and record results
   */
  endTest(testName: string, success: boolean = true, error?: string): PerformanceTestResult {
    const duration = performance.now() - this.testStartTime;
    const currentMemory = this.getMemoryUsage();

    const result: PerformanceTestResult = {
      testName,
      timestamp: Date.now(),
      duration,
      metrics: {
        renderCounts: this.getRenderCounts(),
        memoryUsage: currentMemory,
        fps: this.getCurrentFPS(),
        operationTimings: perfMonitor.getAllStats(),
      },
      success,
      error,
    };

    this.results.push(result);

    console.log(`✅ Test completed: ${testName}`);
    console.log(`⏱️ Duration: ${duration.toFixed(2)}ms`);
    console.log(`📊 Memory delta:`, this.calculateMemoryDelta(this.baselineMemory!, currentMemory));
    console.log(`🎯 FPS:`, result.metrics.fps);

    return result;
  }

  /**
   * Track component render
   */
  trackComponentRender(componentName: string, renderTime: number): void {
    if (!this.componentRenders.has(componentName)) {
      this.componentRenders.set(componentName, []);
    }
    this.componentRenders.get(componentName)!.push(renderTime);
  }

  /**
   * Get render counts for all tracked components
   */
  private getRenderCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    this.componentRenders.forEach((renders, component) => {
      counts[component] = renders.length;
    });
    return counts;
  }

  /**
   * Get current memory usage
   */
  getMemoryUsage(): MemoryUsage | null {
    const memory = (performance as any).memory;
    if (!memory) {
      console.warn('Memory API not available');
      return null;
    }

    const used = memory.usedJSHeapSize / 1024 / 1024;
    const total = memory.totalJSHeapSize / 1024 / 1024;
    const limit = memory.jsHeapSizeLimit / 1024 / 1024;

    return {
      usedJSHeapSize: `${used.toFixed(2)}MB`,
      totalJSHeapSize: `${total.toFixed(2)}MB`,
      jsHeapSizeLimit: `${limit.toFixed(2)}MB`,
      usedPercentage: (used / limit) * 100,
    };
  }

  /**
   * Calculate memory delta between two measurements
   */
  private calculateMemoryDelta(before: MemoryUsage, after: MemoryUsage): {
    usedDelta: string;
    totalDelta: string;
    percentageDelta: number;
  } {
    const beforeUsed = parseFloat(before.usedJSHeapSize);
    const afterUsed = parseFloat(after.usedJSHeapSize);
    const beforeTotal = parseFloat(before.totalJSHeapSize);
    const afterTotal = parseFloat(after.totalJSHeapSize);

    return {
      usedDelta: `${(afterUsed - beforeUsed).toFixed(2)}MB`,
      totalDelta: `${(afterTotal - beforeTotal).toFixed(2)}MB`,
      percentageDelta: after.usedPercentage - before.usedPercentage,
    };
  }

  /**
   * Get current FPS (estimate)
   */
  private getCurrentFPS(): number {
    // This would be populated by fpsMonitor
    // For now, return a placeholder
    return 60; // TODO: Integrate with actual fpsMonitor
  }

  /**
   * Get detailed component render statistics
   */
  getComponentStats(): ComponentRenderStats[] {
    const stats: ComponentRenderStats[] = [];

    this.componentRenders.forEach((renders, componentName) => {
      if (renders.length === 0) return;

      const sum = renders.reduce((a, b) => a + b, 0);
      const avg = sum / renders.length;
      const min = Math.min(...renders);
      const max = Math.max(...renders);

      stats.push({
        componentName,
        renderCount: renders.length,
        averageRenderTime: avg,
        minRenderTime: min,
        maxRenderTime: max,
      });
    });

    return stats.sort((a, b) => b.renderCount - a.renderCount);
  }

  /**
   * Generate comprehensive performance report
   */
  generateReport(): string {
    let report = '🔍 COMPREHENSIVE PERFORMANCE REPORT\n';
    report += '=' .repeat(50) + '\n\n';

    // Test Results Summary
    report += '📊 TEST RESULTS SUMMARY\n';
    report += '-' .repeat(30) + '\n';

    const successfulTests = this.results.filter(r => r.success).length;
    const failedTests = this.results.filter(r => !r.success).length;

    report += `Total Tests: ${this.results.length}\n`;
    report += `✅ Successful: ${successfulTests}\n`;
    report += `❌ Failed: ${failedTests}\n\n`;

    // Component Render Statistics
    report += '🎯 COMPONENT RENDER STATISTICS\n';
    report += '-' .repeat(30) + '\n';

    const componentStats = this.getComponentStats();
    if (componentStats.length === 0) {
      report += 'No component render data collected\n\n';
    } else {
      componentStats.forEach(stat => {
        report += `${stat.componentName}:\n`;
        report += `  Renders: ${stat.renderCount}\n`;
        report += `  Avg Time: ${stat.averageRenderTime.toFixed(2)}ms\n`;
        report += `  Min/Max: ${stat.minRenderTime.toFixed(2)}ms / ${stat.maxRenderTime.toFixed(2)}ms\n`;
      });
      report += '\n';
    }

    // Operation Timing Statistics
    report += '⏱️ OPERATION TIMING STATISTICS\n';
    report += '-' .repeat(30) + '\n';

    const allStats = perfMonitor.getAllStats();
    const operationNames = Object.keys(allStats);

    if (operationNames.length === 0) {
      report += 'No operation timing data collected\n\n';
    } else {
      operationNames.forEach(name => {
        const stat = allStats[name];
        report += `${name}:\n`;
        report += `  Count: ${stat.count}\n`;
        report += `  Avg: ${stat.avg}ms\n`;
        report += `  Min/Max: ${stat.min}ms / ${stat.max}ms\n`;
        report += `  Total: ${stat.sum}ms\n`;
      });
      report += '\n';
    }

    // Memory Usage Analysis
    report += '💾 MEMORY USAGE ANALYSIS\n';
    report += '-' .repeat(30) + '\n';

    const currentMemory = this.getMemoryUsage();
    if (currentMemory) {
      report += `Current Used: ${currentMemory.usedJSHeapSize}\n`;
      report += `Current Total: ${currentMemory.totalJSHeapSize}\n`;
      report += `Heap Limit: ${currentMemory.jsHeapSizeLimit}\n`;
      report += `Usage: ${currentMemory.usedPercentage.toFixed(2)}%\n\n`;

      if (this.baselineMemory) {
        const delta = this.calculateMemoryDelta(this.baselineMemory, currentMemory);
        report += `Memory Delta from Baseline:\n`;
        report += `  Used: ${delta.usedDelta}\n`;
        report += `  Total: ${delta.totalDelta}\n`;
        report += `  Percentage: ${delta.percentageDelta > 0 ? '+' : ''}${delta.percentageDelta.toFixed(2)}%\n\n`;
      }
    } else {
      report += 'Memory data not available\n\n';
    }

    // Performance Assessment
    report += '📈 PERFORMANCE ASSESSMENT\n';
    report += '-' .repeat(30) + '\n';
    report += this.assessPerformance() + '\n';

    return report;
  }

  /**
   * Assess overall performance based on collected metrics
   */
  private assessPerformance(): string {
    const assessments: string[] = [];

    // Assess component renders
    const componentStats = this.getComponentStats();
    const totalRenders = componentStats.reduce((sum, stat) => sum + stat.renderCount, 0);

    if (totalRenders === 0) {
      assessments.push('⚠️ No component render data collected');
    } else if (totalRenders < 100) {
      assessments.push('✅ Excellent: Very low render count');
    } else if (totalRenders < 500) {
      assessments.push('✅ Good: Moderate render count');
    } else if (totalRenders < 1000) {
      assessments.push('⚠️ Fair: High render count');
    } else {
      assessments.push('❌ Poor: Excessive render count');
    }

    // Assess memory usage
    const currentMemory = this.getMemoryUsage();
    if (currentMemory) {
      if (currentMemory.usedPercentage < 10) {
        assessments.push('✅ Excellent: Low memory usage');
      } else if (currentMemory.usedPercentage < 30) {
        assessments.push('✅ Good: Moderate memory usage');
      } else if (currentMemory.usedPercentage < 50) {
        assessments.push('⚠️ Fair: High memory usage');
      } else {
        assessments.push('❌ Poor: Excessive memory usage');
      }
    }

    // Assess FPS
    const fps = this.getCurrentFPS();
    if (fps >= 55) {
      assessments.push('✅ Excellent: Smooth frame rate');
    } else if (fps >= 30) {
      assessments.push('✅ Good: Acceptable frame rate');
    } else if (fps >= 20) {
      assessments.push('⚠️ Fair: Low frame rate');
    } else {
      assessments.push('❌ Poor: Unacceptable frame rate');
    }

    return assessments.join('\n');
  }

  /**
   * Clear all test data
   */
  clear(): void {
    this.results = [];
    this.componentRenders.clear();
    this.baselineMemory = null;
    perfMonitor.clear();
  }

  /**
   * Export results as JSON
   */
  exportResults(): string {
    return JSON.stringify({
      results: this.results,
      componentStats: this.getComponentStats(),
      memoryUsage: this.getMemoryUsage(),
      timestamp: Date.now(),
    }, null, 2);
  }

  /**
   * Get all test results
   */
  getResults(): PerformanceTestResult[] {
    return [...this.results];
  }
}

// Global instance
export const performanceTestSuite = new PerformanceTestSuite();

/**
 * Convenience function to run a quick performance test
 */
export async function runQuickPerformanceTest(
  testName: string,
  operation: () => Promise<void> | void
): Promise<PerformanceTestResult> {
  performanceTestSuite.startTest(testName);

  try {
    await operation();
    return performanceTestSuite.endTest(testName, true);
  } catch (error) {
    return performanceTestSuite.endTest(testName, false, String(error));
  }
}

/**
 * Hook to track component renders in tests
 */
export function useTestRenderTracker(componentName: string) {
  const renderStartTime = useRef<number>(performance.now());
  const renderCount = useRef<number>(0);

  useEffect(() => {
    const renderTime = performance.now() - renderStartTime.current;
    performanceTestSuite.trackComponentRender(componentName, renderTime);

    renderCount.current++;
    renderStartTime.current = performance.now();
  });

  return renderCount.current;
}

import { useRef, useEffect } from 'react';