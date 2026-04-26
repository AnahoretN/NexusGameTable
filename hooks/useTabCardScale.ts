import { useState, useEffect, useCallback } from 'react';

/**
 * Custom hook for managing hand card scale per player tab with localStorage persistence.
 * Each player has their own independent scale setting stored locally.
 */
export const useTabCardScale = (playerId: string) => {
  const [scale, setScale] = useState(() => {
    try {
      // Get scale for specific player from localStorage
      const key = `hand-card-scale-${playerId}`;
      const saved = localStorage.getItem(key);
      return saved ? parseFloat(saved) : 1.15; // 115% by default
    } catch {
      return 1.15; // 115% by default
    }
  });

  // Update scale when playerId changes
  useEffect(() => {
    try {
      const key = `hand-card-scale-${playerId}`;
      const saved = localStorage.getItem(key);
      const newScale = saved ? parseFloat(saved) : 1;
      setScale(newScale);
    } catch {
      setScale(1);
    }
  }, [playerId]);

  const setTabCardScale = useCallback((newScale: number) => {
    const clampedScale = Math.max(0.5, Math.min(2, newScale));
    setScale(clampedScale);
    try {
      const key = `hand-card-scale-${playerId}`;
      localStorage.setItem(key, String(clampedScale));
      // Dispatch custom event for any listeners
      window.dispatchEvent(new CustomEvent('hand-card-scale-change', {
        detail: { playerId, newScale: clampedScale }
      }));
    } catch {
      // Ignore localStorage errors
    }
  }, [playerId]);

  return { scale, setTabCardScale };
};
