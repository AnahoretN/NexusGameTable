/**
 * Performance Monitor for Context Refactoring - Phase 6
 *
 * Этот инструмент предназначен для измерения производительности контекстов
 * и сравнения метрик до и после рефакторинга.
 */

import { logger } from './logger';

// ============================================================================
// TYPES
// ============================================================================

interface PerformanceMetrics {
  // Количество рендеров компонентов
  renderCounts: {
    total: number;
    byComponent: Record<string, number>;
  };

  // Время отклика UI
  responseTimes: {
    average: number;
    byAction: Record<string, number>;
  };

  // Использование памяти
  memoryUsage: {
    current: number;
    peak: number;
    average: number;
  };

  // Размер bundle
  bundleSize: {
    total: number;
    contexts: number;
    reduction: string; // Процент снижения
  };

  // Количество контекстных обновлений
  contextUpdates: {
    player: number;
    viewTransform: number;
    ui: number;
    game: number;
  };
}

interface PerformanceSnapshot {
  timestamp: number;
  component: string;
  action: string;
  renderTime: number;
  memoryBefore: number;
  memoryAfter: number;
}

// ============================================================================
// PERFORMANCE MONITOR CLASS
// ============================================================================

class ContextPerformanceMonitor {
  private renderCounts: Record<string, number> = {};
  private responseTimes: Record<string, number[]> = {};
  private snapshots: PerformanceSnapshot[] = [];
  private contextUpdateCounts: Record<string, number> = {
    player: 0,
    viewTransform: 0,
    ui: 0,
    game: 0,
  };

  private startTime: number = 0;
  private isMonitoring: boolean = false;

  // ============================================================================
  // PUBLIC METHODS
  // ============================================================================

  /**
   * Начать мониторинг производительности
   */
  startMonitoring(): void {
    if (this.isMonitoring) {
      logger.warn('[PerformanceMonitor] Already monitoring');
      return;
    }

    this.startTime = Date.now();
    this.isMonitoring = true;
    this.resetMetrics();

    logger.info('[PerformanceMonitor] Started monitoring');
  }

  /**
   * Остановить мониторинг и получить результаты
   */
  stopMonitoring(): PerformanceMetrics {
    if (!this.isMonitoring) {
      logger.warn('[PerformanceMonitor] Not monitoring');
      return this.getEmptyMetrics();
    }

    this.isMonitoring = false;
    const metrics = this.calculateMetrics();

    logger.info('[PerformanceMonitor] Stopped monitoring', metrics);
    return metrics;
  }

  /**
   * Зарегистрировать рендер компонента
   */
  registerRender(componentName: string): void {
    if (!this.isMonitoring) return;

    this.renderCounts[componentName] = (this.renderCounts[componentName] || 0) + 1;
  }

  /**
   * Зарегистрировать время отклика действия
   */
  registerResponseTime(actionName: string, responseTime: number): void {
    if (!this.isMonitoring) return;

    if (!this.responseTimes[actionName]) {
      this.responseTimes[actionName] = [];
    }
    this.responseTimes[actionName].push(responseTime);
  }

  /**
   * Зарегистрировать обновление контекста
   */
  registerContextUpdate(contextType: 'player' | 'viewTransform' | 'ui' | 'game'): void {
    if (!this.isMonitoring) return;

    this.contextUpdateCounts[contextType]++;
  }

  /**
   * Создать снимок производительности
   */
  createSnapshot(
    component: string,
    action: string,
    renderTime: number,
    memoryBefore: number,
    memoryAfter: number
  ): void {
    if (!this.isMonitoring) return;

    this.snapshots.push({
      timestamp: Date.now(),
      component,
      action,
      renderTime,
      memoryBefore,
      memoryAfter,
    });
  }

  /**
   * Получить текущие метрики
   */
  getCurrentMetrics(): PerformanceMetrics {
    return this.calculateMetrics();
  }

  /**
   * Получить детальный отчет
   */
  getDetailedReport(): string {
    const metrics = this.calculateMetrics();
    const duration = Date.now() - this.startTime;

    let report = '\n';
    report += '='.repeat(80) + '\n';
    report += '📊 CONTEXT PERFORMANCE REPORT - Phase 6\n';
    report += '='.repeat(80) + '\n\n';

    report += `📅 Duration: ${Math.floor(duration / 1000)}s\n`;
    report += `🔍 Monitoring Status: ${this.isMonitoring ? 'Active' : 'Stopped'}\n\n`;

    // Render Counts
    report += '🔄 RENDER COUNTS:\n';
    report += '-'.repeat(40) + '\n';
    const totalRenders = Object.values(this.renderCounts).reduce((a, b) => a + b, 0);
    report += `Total Renders: ${totalRenders}\n\n`;

    const topRenderers = Object.entries(this.renderCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);

    report += 'Top Components by Render Count:\n';
    topRenderers.forEach(([component, count]) => {
      const percentage = ((count / totalRenders) * 100).toFixed(1);
      report += `  ${component}: ${count} (${percentage}%)\n`;
    });

    // Response Times
    report += '\n⚡ RESPONSE TIMES:\n';
    report += '-'.repeat(40) + '\n';
    Object.entries(this.responseTimes).forEach(([action, times]) => {
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const max = Math.max(...times);
      const min = Math.min(...times);
      report += `  ${action}:\n`;
      report += `    Average: ${avg.toFixed(2)}ms\n`;
      report += `    Min: ${min.toFixed(2)}ms\n`;
      report += `    Max: ${max.toFixed(2)}ms\n`;
    });

    // Context Updates
    report += '\n🔄 CONTEXT UPDATES:\n';
    report += '-'.repeat(40) + '\n';
    const totalUpdates = Object.values(this.contextUpdateCounts).reduce((a, b) => a + b, 0);
    Object.entries(this.contextUpdateCounts).forEach(([context, count]) => {
      const percentage = ((count / totalUpdates) * 100).toFixed(1);
      report += `  ${context}: ${count} (${percentage}%)\n`;
    });

    // Snapshots
    if (this.snapshots.length > 0) {
      report += '\n📸 PERFORMANCE SNAPSHOTS:\n';
      report += '-'.repeat(40) + '\n';
      const slowSnapshots = this.snapshots
        .filter(s => s.renderTime > 16) // Больше 16ms (60fps)
        .sort((a, b) => b.renderTime - a.renderTime)
        .slice(0, 5);

      if (slowSnapshots.length > 0) {
        report += 'Slowest Operations (>16ms):\n';
        slowSnapshots.forEach(snapshot => {
          report += `  ${snapshot.component} - ${snapshot.action}: ${snapshot.renderTime.toFixed(2)}ms\n`;
        });
      } else {
        report += '✅ All operations under 16ms (60fps target)\n';
      }
    }

    report += '\n' + '='.repeat(80) + '\n';

    return report;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private resetMetrics(): void {
    this.renderCounts = {};
    this.responseTimes = {};
    this.snapshots = [];
    this.contextUpdateCounts = {
      player: 0,
      viewTransform: 0,
      ui: 0,
      game: 0,
    };
  }

  private calculateMetrics(): PerformanceMetrics {
    const totalRenders = Object.values(this.renderCounts).reduce((a, b) => a + b, 0);

    // Calculate average response times
    const avgResponseTimes: Record<string, number> = {};
    Object.entries(this.responseTimes).forEach(([action, times]) => {
      avgResponseTimes[action] = times.reduce((a, b) => a + b, 0) / times.length;
    });

    const overallAvgResponse = Object.values(avgResponseTimes).reduce((a, b) => a + b, 0) /
      (Object.keys(avgResponseTimes).length || 1);

    return {
      renderCounts: {
        total: totalRenders,
        byComponent: { ...this.renderCounts },
      },
      responseTimes: {
        average: overallAvgResponse,
        byAction: avgResponseTimes,
      },
      memoryUsage: {
        current: 0, // Требуется дополнительная реализация
        peak: 0,
        average: 0,
      },
      bundleSize: {
        total: 0, // Требуется измерение при сборке
        contexts: 0,
        reduction: '0%',
      },
      contextUpdates: { ...this.contextUpdateCounts },
    };
  }

  private getEmptyMetrics(): PerformanceMetrics {
    return {
      renderCounts: { total: 0, byComponent: {} },
      responseTimes: { average: 0, byAction: {} },
      memoryUsage: { current: 0, peak: 0, average: 0 },
      bundleSize: { total: 0, contexts: 0, reduction: '0%' },
      contextUpdates: { player: 0, viewTransform: 0, ui: 0, game: 0 },
    };
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const contextPerformanceMonitor = new ContextPerformanceMonitor();

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Wrapper для измерения производительности компонента
 */
export function withPerformanceMonitoring<T extends (...args: any[]) => any>(
  componentName: string,
  actionName: string,
  func: T
): T {
  return ((...args: any[]) => {
    const startTime = performance.now();
    const memoryBefore = getMemoryUsage();

    const result = func(...args);

    const endTime = performance.now();
    const memoryAfter = getMemoryUsage();

    contextPerformanceMonitor.createSnapshot(
      componentName,
      actionName,
      endTime - startTime,
      memoryBefore,
      memoryAfter
    );

    contextPerformanceMonitor.registerRender(componentName);

    return result;
  }) as T;
}

/**
 * Получить текущее использование памяти (если доступно)
 */
function getMemoryUsage(): number {
  if (performance.memory) {
    return performance.memory.usedJSHeapSize / 1024 / 1024; // MB
  }
  return 0;
}

/**
 * Создать декоратор для измерения времени отклика
 */
export function measureResponseTime(actionName: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = function (...args: any[]) {
      const startTime = performance.now();

      const result = originalMethod.apply(this, args);

      if (result instanceof Promise) {
        return result.then((value) => {
          const endTime = performance.now();
          contextPerformanceMonitor.registerResponseTime(
            actionName,
            endTime - startTime
          );
          return value;
        });
      } else {
        const endTime = performance.now();
        contextPerformanceMonitor.registerResponseTime(
          actionName,
          endTime - startTime
        );
        return result;
      }
    };

    return descriptor;
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default ContextPerformanceMonitor;