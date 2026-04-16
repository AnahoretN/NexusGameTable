/**
 * useRenderCounter - Custom hook to track component render performance
 *
 * Usage:
 * import { useRenderCounter } from '../hooks/useRenderCounter';
 *
 * function MyComponent({ prop1, prop2 }) {
 *   useRenderCounter('MyComponent');
 *   // ... component logic
 * }
 */

import { useRef, useEffect } from 'react';

export function useRenderCounter(componentName: string) {
  const renderCount = useRef(0);
  const previousProps = useRef<Record<string, any>>({});

  useEffect(() => {
    renderCount.current++;

    // Check for prop changes that might indicate unnecessary renders
    const currentProps = arguments[1] || {}; // Get props from second arg
    const changedProps: string[] = [];

    Object.keys(currentProps).forEach(key => {
      if (previousProps.current[key] !== currentProps[key]) {
        changedProps.push(key);
      }
    });

    // Render count logging disabled

    previousProps.current = currentProps;
  });

  return renderCount.current;
}

/**
 * Hook to measure render time
 */
export function useRenderTime(componentName: string, threshold: number = 16) {
  const startTime = useRef<number>(performance.now());

  useEffect(() => {
    const endTime = performance.now();
    const renderTime = endTime - startTime.current;

    // Slow render logging disabled

    // Reset for next render
    startTime.current = performance.now();
  });
}

/**
 * Hook to detect memory leaks in components
 */
export function useMemoryLeakDetector(componentName: string) {
  useEffect(() => {
    // Memory leak detector logging disabled

    return () => {
      // Add cleanup checks here if needed
    };
  }, [componentName]);
}
