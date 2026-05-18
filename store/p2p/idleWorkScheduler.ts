/**
 * Idle Work Scheduler
 *
 * Schedules heavy P2P operations during browser idle time
 * to prevent blocking the main thread during user interactions
 */

import { logger } from '../../utils/logger';

// ============================================================================
// IDLE CALLBACK SUPPORT
// ============================================================================

/**
 * Check if requestIdleCallback is supported
 */
export const hasIdleCallback = typeof window !== 'undefined' && 'requestIdleCallback' in window;

/**
 * Request idle callback with fallback
 */
export function requestIdleCallbackCompat(
  callback: IdleRequestCallback,
  options?: IdleRequestOptions
): number {
  if (hasIdleCallback) {
    return window.requestIdleCallback(callback, options);
  }

  // Fallback: use setTimeout with minimal delay
  return window.setTimeout(() => {
    const deadline: IdleDeadline = {
      didTimeout: false,
      timeRemaining: () => 50, // Assume 50ms available
    };
    callback(deadline);
  }, 1) as unknown as number;
}

/**
 * Cancel idle callback with fallback
 */
export function cancelIdleCallbackCompat(handle: number): void {
  if (hasIdleCallback) {
    window.cancelIdleCallback(handle);
  } else {
    window.clearTimeout(handle);
  }
}

// ============================================================================
// WORK TASK
// ============================================================================

export interface WorkTask {
  id: string;
  priority: 'high' | 'normal' | 'low';
  work: () => void | Promise<void>;
  timeout?: number; // Maximum time to wait before forcing execution
  addedAt: number;
}

// ============================================================================
// IDLE WORK SCHEDULER
// ============================================================================

interface ScheduledTask {
  task: WorkTask;
  handle: number | null;
}

/**
 * Schedules work during idle time
 */
export class IdleWorkScheduler {
  private pendingTasks = new Map<string, ScheduledTask>();
  private queue: WorkTask[] = [];
  private isProcessing = false;
  private maxWaitTime = 2000; // Force execution after 2 seconds

  /**
   * Schedule a task to run during idle time
   */
  schedule(task: WorkTask): void {
    // Check if task already exists
    if (this.pendingTasks.has(task.id)) {
      return;
    }

    // Add to queue
    this.queue.push(task);

    // Sort by priority
    this.queue.sort((a, b) => {
      const priorityOrder = { high: 0, normal: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    // Mark as pending
    this.pendingTasks.set(task.id, {
      task,
      handle: null,
    });

    // Start processing if not already
    if (!this.isProcessing) {
      this.startProcessing();
    }
  }

  /**
   * Cancel a pending task
   */
  cancel(taskId: string): void {
    const scheduled = this.pendingTasks.get(taskId);
    if (scheduled) {
      if (scheduled.handle !== null) {
        cancelIdleCallbackCompat(scheduled.handle);
      }
      this.pendingTasks.delete(taskId);
    }

    // Remove from queue
    this.queue = this.queue.filter(t => t.id !== taskId);
  }

  /**
   * Start processing the queue
   */
  private startProcessing(): void {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    this.processNext();
  }

  /**
   * Process next task in queue
   */
  private processNext(): void {
    if (this.queue.length === 0) {
      this.isProcessing = false;
      return;
    }

    const task = this.queue.shift()!;
    const scheduled = this.pendingTasks.get(task.id);

    if (!scheduled) {
      // Task was cancelled
      this.processNext();
      return;
    }

    // Check if task has waited too long
    const waitTime = Date.now() - task.addedAt;
    const forceExecution = waitTime > (task.timeout || this.maxWaitTime);

    if (forceExecution) {
      // Execute immediately
      this.executeTask(task, scheduled);
    } else {
      // Schedule during idle time
      const handle = requestIdleCallbackCompat(
        (deadline) => this.executeTaskDuringIdle(task, scheduled, deadline),
        { timeout: task.timeout || this.maxWaitTime }
      );
      scheduled.handle = handle;
    }
  }

  /**
   * Execute task during idle time
   */
  private executeTaskDuringIdle(
    task: WorkTask,
    scheduled: ScheduledTask,
    deadline: IdleDeadline
  ): void {
    const startTime = performance.now();

    try {
      // Execute the work
      const result = task.work();

      // Handle async work
      if (result instanceof Promise) {
        result.then(() => {
          this.completeTask(task, scheduled);
        }).catch((error) => {
          logger.error('[IdleWork] Task error:', error);
          this.completeTask(task, scheduled);
        });
      } else {
        this.completeTask(task, scheduled);
      }
    } catch (error) {
      logger.error('[IdleWork] Task error:', error);
      this.completeTask(task, scheduled);
    }

    const elapsed = performance.now() - startTime;
    if (elapsed > 16) {
      logger.warn(`[IdleWork] Task ${task.id} took ${elapsed.toFixed(1)}ms, exceeded frame budget`);
    }
  }

  /**
   * Execute task immediately
   */
  private executeTask(task: WorkTask, scheduled: ScheduledTask): void {
    try {
      const result = task.work();

      if (result instanceof Promise) {
        result.then(() => {
          this.completeTask(task, scheduled);
        }).catch((error) => {
          logger.error('[IdleWork] Task error:', error);
          this.completeTask(task, scheduled);
        });
      } else {
        this.completeTask(task, scheduled);
      }
    } catch (error) {
      logger.error('[IdleWork] Task error:', error);
      this.completeTask(task, scheduled);
    }
  }

  /**
   * Complete task and process next
   */
  private completeTask(task: WorkTask, scheduled: ScheduledTask): void {
    this.pendingTasks.delete(task.id);
    this.processNext();
  }

  /**
   * Get pending task count
   */
  getPendingCount(): number {
    return this.queue.length;
  }

  /**
   * Clear all pending tasks
   */
  clear(): void {
    for (const scheduled of this.pendingTasks.values()) {
      if (scheduled.handle !== null) {
        cancelIdleCallbackCompat(scheduled.handle);
      }
    }
    this.pendingTasks.clear();
    this.queue = [];
    this.isProcessing = false;
  }
}

// Global scheduler instance
export const idleWorkScheduler = new IdleWorkScheduler();

// ============================================================================
// CHUNKED WORK
// ============================================================================

/**
 * Split work into chunks to avoid blocking
 */
export async function processInChunks<T, R>(
  items: T[],
  processFn: (item: T) => R | Promise<R>,
  options?: {
    chunkSize?: number;
    delayBetweenChunks?: number;
  }
): Promise<R[]> {
  const chunkSize = options?.chunkSize || 10;
  const delayBetweenChunks = options?.delayBetweenChunks || 0;

  const results: R[] = [];

  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);

    // Process chunk
    const chunkResults = await Promise.all(
      chunk.map(item => processFn(item))
    );
    results.push(...chunkResults);

    // Yield to browser
    if (delayBetweenChunks > 0 && i + chunkSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenChunks));
    }
  }

  return results;
}

// ============================================================================
// DEFERRED EXECUTION
// ============================================================================

/**
 * Defer execution until after current frame
 */
export function defer(work: () => void | Promise<void>): void {
  if (hasIdleCallback) {
    requestIdleCallbackCompat(() => {
      work();
    });
  } else {
    // Use setTimeout with 0ms delay
    setTimeout(() => {
      work();
    }, 0);
  }
}

/**
 * Defer with priority
 */
export function deferWithPriority(
  work: () => void | Promise<void>,
  priority: 'high' | 'normal' | 'low' = 'normal'
): void {
  const taskId = `deferred-${Date.now()}-${Math.random()}`;

  idleWorkScheduler.schedule({
    id: taskId,
    priority,
    work,
    addedAt: Date.now(),
    timeout: priority === 'high' ? 100 : 2000,
  });
}
