import { useState, useEffect } from 'react';

/**
 * Custom hook for managing hand card scale with localStorage persistence
 * and cross-component synchronization via custom events.
 */
export const useHandCardScale = () => {
  const [scale, setScale] = useState(() => {
    try {
      const saved = localStorage.getItem('hand-card-scale');
      return saved ? parseFloat(saved) : 1;
    } catch {
      return 1;
    }
  });

  useEffect(() => {
    const handleHandCardScaleChanged = (e: Event) => {
      const customEvent = e as CustomEvent<{ scale: number }>;
      setScale(customEvent.detail.scale);
    };

    window.addEventListener('hand-card-scale-changed', handleHandCardScaleChanged);
    return () => window.removeEventListener('hand-card-scale-changed', handleHandCardScaleChanged);
  }, []);

  const setHandCardScale = (newScale: number) => {
    setScale(newScale);
    try {
      localStorage.setItem('hand-card-scale', String(newScale));
      window.dispatchEvent(new CustomEvent('hand-card-scale-changed', { detail: { scale: newScale } }));
    } catch {
      // Ignore localStorage errors
    }
  };

  return { scale, setHandCardScale };
};
