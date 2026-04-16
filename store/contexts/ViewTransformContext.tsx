/**
 * ViewTransformContext v2.1 - Локальное управление камерой (НЕ синхронизируется)
 *
 * ⚠️ ВАЖНО: Этот контекст является ЛОКАЛЬНЫМ и НЕ синхронизируется через WebRTC
 *
 * Каждый игрок имеет собственную позицию камеры, зум и настройки вида.
 * ViewTransform данные НЕ включаются в WebRTC синхронизацию.
 *
 * @version 2.1.0
 * @since 2026-04-17
 *
 * ИЗМЕНЕНИЯ с v2.0:
 * ✅ Явное указание, что это локальное состояние
 * ✅ Добавлена документация о WebRTC исключении
 * ✅ Оптимизированы hooks для предотвращения ререндеров
 */

import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import {
  ViewTransformContextValue,
  ViewTransformState,
  ViewTransformAction,
  initialViewTransformState,
  ViewTransform,
} from './contextTypes';
import { calculatePixelsPerVU } from '../../utils/vuSystem';
import { viewportToWorld as utilViewportToWorld, worldToViewport as utilWorldToViewport } from '../../utils/coordinateUtils';

// ============================================================================
// REDUCER
// ============================================================================

function viewTransformReducer(
  state: ViewTransformState,
  action: ViewTransformAction
): ViewTransformState {
  switch (action.type) {
    case 'SET_OFFSET':
      return {
        viewTransform: {
          ...state.viewTransform,
          offset: action.payload,
        },
      };

    case 'SET_ZOOM':
      return {
        viewTransform: {
          ...state.viewTransform,
          zoom: action.payload,
        },
      };

    case 'SET_SCROLL':
      return {
        viewTransform: {
          ...state.viewTransform,
          scroll: action.payload,
        },
      };

    case 'SET_PIXELS_PER_VU':
      return {
        viewTransform: {
          ...state.viewTransform,
          pixelsPerVU: action.payload,
        },
      };

    case 'UPDATE_TRANSFORM':
      return {
        viewTransform: {
          ...state.viewTransform,
          ...action.payload,
        },
      };

    case 'RESET_TRANSFORM':
      return {
        viewTransform: {
          offset: { x: 0, y: 0 },
          zoom: 1,
          scroll: { x: 0, y: 0 },
          pixelsPerVU: state.viewTransform.pixelsPerVU, // Keep pixelsPerVU
        },
      };

    default:
      return state;
  }
}

// ============================================================================
// CONTEXT
// ============================================================================

const ViewTransformContext = createContext<ViewTransformContextValue | null>(null);

// ============================================================================
// PROVIDER
// ============================================================================

export function ViewTransformProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(viewTransformReducer, initialViewTransformState);

  // Handle window resize to update pixelsPerVU
  useEffect(() => {
    const handleResize = () => {
      const newPixelsPerVU = calculatePixelsPerVU(window.innerWidth, window.innerHeight);
      dispatch({ type: 'SET_PIXELS_PER_VU', payload: newPixelsPerVU });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Actions
  const setOffset = useCallback((x: number, y: number) => {
    dispatch({ type: 'SET_OFFSET', payload: { x, y } });
  }, []);

  const setZoom = useCallback((zoom: number) => {
    dispatch({ type: 'SET_ZOOM', payload: zoom });
  }, []);

  const setScroll = useCallback((x: number, y: number) => {
    dispatch({ type: 'SET_SCROLL', payload: { x, y } });
  }, []);

  const setPixelsPerVU = useCallback((pixelsPerVU: number) => {
    dispatch({ type: 'SET_PIXELS_PER_VU', payload: pixelsPerVU });
  }, []);

  const updateTransform = useCallback((updates: Partial<ViewTransform>) => {
    dispatch({ type: 'UPDATE_TRANSFORM', payload: updates });
  }, []);

  const resetTransform = useCallback(() => {
    dispatch({ type: 'RESET_TRANSFORM' });
  }, []);

  // Utilities
  const viewportToWorld = useCallback((vx: number, vy: number): { x: number; y: number } => {
    const { offset, zoom, scroll, pixelsPerVU } = state.viewTransform;
    // Apply zoom to pixelsPerVU for the conversion
    const zoomedPixelsPerVU = pixelsPerVU * zoom;
    return utilViewportToWorld(vx, vy, offset, scroll.x, scroll.y, zoomedPixelsPerVU);
  }, [state.viewTransform]);

  const worldToViewport = useCallback((wx: number, wy: number): { x: number; y: number } => {
    const { offset, zoom, scroll, pixelsPerVU } = state.viewTransform;
    // Apply zoom to pixelsPerVU for the conversion
    const zoomedPixelsPerVU = pixelsPerVU * zoom;
    return utilWorldToViewport(wx, wy, offset, scroll.x, scroll.y, zoomedPixelsPerVU);
  }, [state.viewTransform]);

  const value: ViewTransformContextValue = {
    // State
    ...state,

    // Actions
    setOffset,
    setZoom,
    setScroll,
    setPixelsPerVU,
    updateTransform,
    resetTransform,

    // Utilities
    viewportToWorld,
    worldToViewport,
  };

  return (
    <ViewTransformContext.Provider value={value}>
      {children}
    </ViewTransformContext.Provider>
  );
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * useViewTransform - Access view transform context
 * Provides full access to view transform state and actions
 */
export function useViewTransform(): ViewTransformContextValue {
  const context = useContext(ViewTransformContext);
  if (!context) {
    throw new Error('useViewTransform must be used within ViewTransformProvider');
  }
  return context;
}

/**
 * useTransformState - Access only the transform state
 * Optimized for components that only need to read the state
 */
export function useTransformState(): ViewTransform {
  const context = useViewTransform();
  return context.viewTransform;
}

/**
 * useZoom - Access only the zoom level
 * Optimized for components that only need zoom
 */
export function useZoom(): number {
  const context = useViewTransform();
  return context.viewTransform.zoom;
}

/**
 * useOffset - Access only the offset
 * Optimized for components that only need offset
 */
export function useOffset(): { x: number; y: number } {
  const context = useViewTransform();
  return context.viewTransform.offset;
}

/**
 * usePixelsPerVU - Access only the pixels per VU conversion factor
 * Optimized for components that only need pixelsPerVU
 */
export function usePixelsPerVU(): number {
  const context = useViewTransform();
  return context.viewTransform.pixelsPerVU;
}

/**
 * useTransformActions - Access only transform actions
 * Use this to avoid re-renders when you only need transform actions
 */
export function useTransformActions(): {
  setOffset: (x: number, y: number) => void;
  setZoom: (zoom: number) => void;
  setScroll: (x: number, y: number) => void;
  setPixelsPerVU: (pixelsPerVU: number) => void;
  updateTransform: (updates: Partial<ViewTransform>) => void;
  resetTransform: () => void;
} {
  const context = useViewTransform();
  return {
    setOffset: context.setOffset,
    setZoom: context.setZoom,
    setScroll: context.setScroll,
    setPixelsPerVU: context.setPixelsPerVU,
    updateTransform: context.updateTransform,
    resetTransform: context.resetTransform,
  };
}

/**
 * useCoordinateUtils - Access coordinate transformation utilities
 * Use this for coordinate conversions without accessing full state
 */
export function useCoordinateUtils(): {
  viewportToWorld: (vx: number, vy: number) => { x: number; y: number };
  worldToViewport: (wx: number, wy: number) => { x: number; y: number };
} {
  const context = useViewTransform();
  return {
    viewportToWorld: context.viewportToWorld,
    worldToViewport: context.worldToViewport,
  };
}