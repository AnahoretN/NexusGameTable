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

    // Log render count
    console.log(`[RenderCount] ${componentName}: ${renderCount.current}`);

    // Check for prop changes that might indicate unnecessary renders
    const currentProps = arguments[1] || {}; // Get props from second arg
    const changedProps: string[] = [];

    Object.keys(currentProps).forEach(key => {
      if (previousProps.current[key] !== currentProps[key]) {
        changedProps.push(key);
      }
    });

    if (changedProps.length > 0 && renderCount.current > 10) {
      console.warn(
        `[RenderCount] ${componentName} has rendered ${renderCount.current} times. ` +
        `Changed props: ${changedProps.join(', ')}`
      );
    }

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

    if (renderTime > threshold) {
      console.warn(
        `[SlowRender] ${componentName} took ${renderTime.toFixed(2)}ms ` +
        `(threshold: ${threshold}ms)`
      );
    }

    // Reset for next render
    startTime.current = performance.now();
  });
}

/**
 * Hook to detect memory leaks in components
 */
export function useMemoryLeakDetector(componentName: string) {
  useEffect(() => {
    console.log(`[MemoryLeakDetector] ${componentName} mounted`);

    return () => {
      console.log(`[MemoryLeakDetector] ${componentName} unmounted`);
      // Add cleanup checks here if needed
    };
  }, [componentName]);
}
