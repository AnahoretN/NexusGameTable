/**
 * useP2PImages Hook
 * Hook for managing image transfer in P2P system
 */

import { useEffect, useState, useCallback } from 'react';
import { GuestImageTransferManager, ProgressiveImageLoader } from '../p2p/images/transfer';
import { ImageLoadState } from '../p2p/types';

// ============================================================================
// RETURN TYPE
// ============================================================================

export interface ImageLoadStatus {
  id: string;
  state: ImageLoadState;
  progress: number;
  priority: number;
}

export interface UseP2PImagesReturn {
  // Progress
  progress: { loaded: number; total: number; percent: number };

  // Status
  isComplete: boolean;
  isLoading: boolean;

  // Per-image status
  getStatus: (imageId: string) => ImageLoadStatus | null;
  getAllStatuses: () => ImageLoadStatus[];

  // Data
  getImageData: (imageId: string) => string | null;
  isLoaded: (imageId: string) => boolean;

  // Callbacks
  onImageLoaded: (imageId: string, callback: () => void) => void;
  onAllImagesLoaded: (callback: () => void) => void;
}

// ============================================================================
// HOOK
// ============================================================================

export function useP2PImages(
  loader: ProgressiveImageLoader | null
): UseP2PImagesReturn {
  const [progress, setProgress] = useState({ loaded: 0, total: 0, percent: 0 });
  const [isComplete, setIsComplete] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Update progress from loader
  useEffect(() => {
    if (!loader) {
      setProgress({ loaded: 0, total: 0, percent: 0 });
      setIsComplete(false);
      setIsLoading(false);
      return;
    }

    const updateProgress = () => {
      const p = loader.getProgress();
      setProgress(p);
      setIsComplete(loader.isComplete());
      setIsLoading(!loader.isComplete() && p.total > 0);
    };

    updateProgress();

    // Set up callbacks
    const interval = setInterval(updateProgress, 100);

    loader.onAllImagesLoaded(() => {
      setIsComplete(true);
      setIsLoading(false);
    });

    return () => {
      clearInterval(interval);
    };
  }, [loader]);

  // Get status for specific image
  const getStatus = useCallback((imageId: string): ImageLoadStatus | null => {
    if (!loader) return null;
    return loader.getStatus(imageId);
  }, [loader]);

  // Get all statuses
  const getAllStatuses = useCallback((): ImageLoadStatus[] => {
    if (!loader) return [];
    return Array.from(loader.getProgress() as any); // This is a simplified approach
  }, [loader]);

  // Get image data
  const getImageData = useCallback((imageId: string): string | null => {
    if (!loader) return null;
    return loader.getImageData(imageId);
  }, [loader]);

  // Check if image is loaded
  const isLoaded = useCallback((imageId: string): boolean => {
    if (!loader) return false;
    return loader.isLoaded(imageId);
  }, [loader]);

  // Register callback for image loaded
  const onImageLoaded = useCallback((imageId: string, callback: () => void) => {
    if (!loader) return;
    loader.onImageLoaded(imageId, () => callback());
  }, [loader]);

  // Register callback for all images loaded
  const onAllImagesLoaded = useCallback((callback: () => void) => {
    if (!loader) return;
    loader.onAllImagesLoaded(() => callback());
  }, [loader]);

  return {
    progress,
    isComplete,
    isLoading,
    getStatus,
    getAllStatuses,
    getImageData,
    isLoaded,
    onImageLoaded,
    onAllImagesLoaded,
  };
}
