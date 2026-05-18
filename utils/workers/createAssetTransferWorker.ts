/**
 * Create Asset Transfer Worker
 *
 * Factory function to create and manage the asset transfer Web Worker.
 */

export interface AssetTransferWorker {
  postMessage: (message: any) => void;
  terminate: () => void;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}

let workerInstance: AssetTransferWorker | null = null;

/**
 * Get or create the asset transfer worker singleton
 */
export function getAssetTransferWorker(): AssetTransferWorker {
  if (workerInstance) {
    return workerInstance;
  }

  // Create worker from the TypeScript file
  // Note: In production, this would be a bundled worker file
  const workerPath = new URL('./assetTransfer.worker.ts', import.meta.url);

  try {
    // Try to create worker from TypeScript (will work with proper bundler setup)
    workerInstance = new Worker(workerPath.toString(), { type: 'module' }) as unknown as AssetTransferWorker;
  } catch (error) {
    // Fallback: try with a different approach for different bundlers
    console.warn('Failed to create module worker, trying blob approach:', error);

    // For development with Vite/webpack
    workerInstance = new Worker(
      new URL('./assetTransfer.worker.ts', import.meta.url),
      { type: 'classic' }
    ) as unknown as AssetTransferWorker;
  }

  // Handle worker errors
  workerInstance.onerror = (event) => {
    console.error('Asset transfer worker error:', event);
  };

  return workerInstance;
}

/**
 * Terminate the asset transfer worker
 */
export function terminateAssetTransferWorker(): void {
  if (workerInstance) {
    workerInstance.terminate();
    workerInstance = null;
  }
}

/**
 * Check if worker is available
 */
export function isWorkerAvailable(): boolean {
  return typeof Worker !== 'undefined';
}
