/**
 * Custom hooks for tabletop positioning and transformations
 * Extracted from Tabletop.tsx for better modularity and memoization
 */

import { useMemo, useCallback } from 'react';
import { vuToPixels, pixelsToVu } from '../../utils/vuSystem';

/**
 * Hook for positioning and coordinate transformations
 * Handles virtual units ↔ pixels conversion and zoom calculations
 */
export const useTabletopPositioning = (
  viewTransform: { pixelsPerVU?: number; zoom?: number } | null | undefined,
  localSettings: { zoom?: number }
) => {
  // Use pixelsPerVU from viewTransform (calculated from actual viewport size)
  // This ensures consistency with viewportToWorld/worldToViewport conversions
  const actualPixelsPerVU = viewTransform?.pixelsPerVU ?? 1.0;

  // Local zoom multiplier (100 = default, 150 = 50% larger objects, etc.)
  const zoomMultiplier = viewTransform?.zoom ?? (localSettings.zoom ?? 100) / 100;

  // Apply zoom multiplier to pixelsPerVU (affects all calculations)
  const pixelsPerVU = useMemo(
    () => actualPixelsPerVU * zoomMultiplier,
    [actualPixelsPerVU, zoomMultiplier]
  );

  // Helper functions for vu ↔ pixel conversion (with zoom applied)
  const v2p = useCallback(
    (vu: number) => vuToPixels(vu ?? 0, pixelsPerVU),
    [pixelsPerVU]
  );

  const p2v = useCallback(
    (px: number) => pixelsToVu(px ?? 0, pixelsPerVU),
    [pixelsPerVU]
  );

  return {
    pixelsPerVU,
    v2p,
    p2v,
    zoomMultiplier,
    basePixelsPerVU: actualPixelsPerVU  // Use actual pixelsPerVU as base
  };
};

/**
 * Hook for layer-specific zoom calculations
 * Handles zoom enable/disable per layer
 */
export const useLayerZoom = (
  zoomMultiplier: number,
  hyperscaleLayers: Array<{ id: string; zoomEnabled?: boolean }>
) => {
  // Helper to get zoom scale for a specific layer (returns 1 if zoom disabled for layer)
  const getLayerZoomScale = useCallback(
    (layerId: string): number => {
      const layer = hyperscaleLayers.find((l) => l.id === layerId);
      const zoomEnabled = layer?.zoomEnabled ?? true;
      return zoomEnabled ? zoomMultiplier : 1;
    },
    [zoomMultiplier, hyperscaleLayers]
  );

  // Helper to get inverse scale for layers without zoom (to cancel out global zoom)
  const getLayerInverseScale = useCallback(
    (layerId: string): number => {
      const layer = hyperscaleLayers.find((l) => l.id === layerId);
      const zoomEnabled = layer?.zoomEnabled ?? true;
      // If zoom is disabled for this layer, return inverse scale to cancel out global zoom
      // Otherwise return 1 (let the global zoom apply normally via v2p)
      return zoomEnabled ? 1 : 1 / zoomMultiplier;
    },
    [hyperscaleLayers, zoomMultiplier]
  );

  return {
    getLayerZoomScale,
    getLayerInverseScale
  };
};

/**
 * Hook for creating positioned styles with layer zoom consideration
 */
export const usePositionedStyle = (
  getLayerInverseScale: (layerId: string) => number
) => {
  // Helper to create positioning styles with layer zoom consideration
  const createPositionedStyle = useCallback(
    (
      x: number,
      y: number,
      width: number,
      height: number,
      zIndex: number,
      layerId: string,
      additionalStyle: React.CSSProperties = {}
    ): React.CSSProperties => {
      const inverseScale = getLayerInverseScale(layerId);
      return {
        position: 'absolute' as const,
        left: x,
        top: y,
        width,
        height,
        zIndex,
        ...(inverseScale !== 1 && {
          transform: `scale(${inverseScale})`,
          transformOrigin: 'top left'
        }),
        ...additionalStyle
      };
    },
    [getLayerInverseScale]
  );

  return { createPositionedStyle };
};