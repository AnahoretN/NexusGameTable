/**
 * Performance Monitor - Track and analyze component performance
 *
 * Usage:
 * import { perfMonitor } from './utils/performanceMonitor';
 *
 * const endMeasure = perfMonitor.startMeasure('ComponentRender');
 * // ... component logic ...
 * endMeasure();
 *
 * // Print report
 * perfMonitor.printReport();
 */

export interface PerformanceStats {
  count: number;
  avg: string;
  min: string;
  max: string;
  sum: string;
}

export class PerformanceMonitor {
  private measurements: Map<string, number[]> = new Map();

  /**
   * Start measuring a named operation
   * Returns a function that must be called to end the measurement
   */
  startMeasure(name: string): () => void {
    const startTime = performance.now();

    return () => {
      const duration = performance.now() - startTime;
      this.recordMeasurement(name, duration);
    };
  }

  /**
   * Record a measurement manually
   */
  private recordMeasurement(name: string, duration: number) {
    if (!this.measurements.has(name)) {
      this.measurements.set(name, []);
    }
    this.measurements.get(name)!.push(duration);
  }

  /**
   * Get statistics for a specific measurement
   */
  getStats(name: string): PerformanceStats | null {
    const measurements = this.measurements.get(name);
    if (!measurements || measurements.length === 0) {
      return null;
    }

    const sum = measurements.reduce((a, b) => a + b, 0);
    const avg = sum / measurements.length;
    const min = Math.min(...measurements);
    const max = Math.max(...measurements);

    return {
      count: measurements.length,
      avg: avg.toFixed(2),
      min: min.toFixed(2),
      max: max.toFixed(2),
      sum: sum.toFixed(2),
    };
  }

  /**
   * Print a formatted report to console
   */
  printReport() {
    console.group('🔍 Performance Report');

    if (this.measurements.size === 0) {
      console.log('No measurements recorded yet.');
    } else {
      this.measurements.forEach((_, name) => {
        const stats = this.getStats(name);
        if (stats) {
          console.groupCollapsed(`📊 ${name}`);
          console.log(`Count: ${stats.count}`);
          console.log(`Avg: ${stats.avg}ms`);
          console.log(`Min: ${stats.min}ms`);
          console.log(`Max: ${stats.max}ms`);
          console.log(`Total: ${stats.sum}ms`);
          console.groupEnd();
        }
      });

      // Summary
      const totalMeasurements = Array.from(this.measurements.values())
        .reduce((sum, arr) => sum + arr.length, 0);
      const totalTime = Array.from(this.measurements.values())
        .flat()
        .reduce((sum, val) => sum + val, 0);

      console.groupCollapsed('📈 Summary');
      console.log(`Total measurements: ${totalMeasurements}`);
      console.log(`Total time: ${totalTime.toFixed(2)}ms`);
      console.log(`Average per measurement: ${(totalTime / totalMeasurements).toFixed(2)}ms`);
      console.groupEnd();
    }

    console.groupEnd();
  }

  /**
   * Get all measurements as an object
   */
  getAllStats(): Record<string, PerformanceStats> {
    const stats: Record<string, PerformanceStats> = {};

    this.measurements.forEach((_, name) => {
      const stat = this.getStats(name);
      if (stat) {
        stats[name] = stat;
      }
    });

    return stats;
  }

  /**
   * Clear all measurements
   */
  clear() {
    this.measurements.clear();
    console.log('🗑️ Performance measurements cleared');
  }

  /**
   * Get memory usage (if available)
   */
  getMemoryUsage() {
    const memory = (performance as any).memory;
    if (!memory) {
      console.log('Memory API not available in this browser');
      return null;
    }

    return {
      usedJSHeapSize: `${(memory.usedJSHeapSize / 1024 / 1024).toFixed(2)}MB`,
      totalJSHeapSize: `${(memory.totalJSHeapSize / 1024 / 1024).toFixed(2)}MB`,
      jsHeapSizeLimit: `${(memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2)}MB`,
    };
  }

  /**
   * Print memory usage
   */
  printMemoryUsage() {
    const memory = this.getMemoryUsage();
    if (memory) {
      console.group('💾 Memory Usage');
      console.log(`Used: ${memory.usedJSHeapSize}`);
      console.log(`Total: ${memory.totalJSHeapSize}`);
      console.log(`Limit: ${memory.jsHeapSizeLimit}`);
      console.groupEnd();
    }
  }
}

// Global instance
export const perfMonitor = new PerformanceMonitor();

/**
 * Custom hook to track render counts
 */
import { useRef, useEffect } from 'react';

export function useRenderCount(componentName: string) {
  const renderCount = useRef(0);

  useEffect(() => {
    renderCount.current++;
    console.log(`[RenderCount] ${componentName}: ${renderCount.current}`);
  });

  return renderCount.current;
}

/**
 * Custom hook to measure render time
 */
export function useRenderTime(componentName: string) {
  const renderStartTime = useRef<number>(performance.now());

  useEffect(() => {
    const renderTime = performance.now() - renderStartTime.current;
    if (renderTime > 16) { // Log only if takes more than one frame (16ms at 60fps)
      console.warn(`[SlowRender] ${componentName}: ${renderTime.toFixed(2)}ms`);
    }
  });
}

/**
 * Measure async operation performance
 */
export async function measureAsync<T>(
  name: string,
  operation: () => Promise<T>
): Promise<T> {
  const endMeasure = perfMonitor.startMeasure(name);
  try {
    const result = await operation();
    endMeasure();
    return result;
  } catch (error) {
    endMeasure();
    throw error;
  }
}

/**
 * Get current FPS (frames per second)
 */
export class FPSMonitor {
  private frames: number[] = [];
  private lastTime = performance.now();
  private rafId: number | null = null;

  start() {
    this.measureFPS();
  }

  private measureFPS() {
    const now = performance.now();
    const delta = now - this.lastTime;

    if (delta >= 1000) {
      const fps = this.frames.length;
      this.frames = [];

      console.log(`🎯 FPS: ${fps}`);

      // Warn if FPS is low
      if (fps < 30) {
        console.warn(`⚠️ Low FPS detected: ${fps}`);
      }

      this.lastTime = now;
    }

    this.frames.push(1);
    this.rafId = requestAnimationFrame(() => this.measureFPS());
  }

  stop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}

export const fpsMonitor = new FPSMonitor();
