import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { useViewTransform } from '../store/contexts/ViewTransformContext';

// Global function to update zoom settings from outside the context
let externalZoomUpdater: ((level: number) => void) | null = null;
if (typeof window !== 'undefined') {
  (window as any).updateToolSettingsZoom = (level: number) => {
    if (externalZoomUpdater) {
      externalZoomUpdater(level);
    }
  };
}

// Drawing tools
export type DrawingTool = 'none' | 'marker' | 'eraser' | 'ruler' | 'zoom';

// Marker settings
interface MarkerSettings {
  color: string;
  thickness: number;
  opacity: number;
}

// Eraser settings
interface EraserSettings {
  thickness: number;
}

// Ruler settings
interface RulerSettings {
  step: number; // Step size in VU (0 = disabled, 1-500 = step size)
}

// Zoom settings
interface ZoomSettings {
  level: number;
}

// All tool settings
interface ToolSettings {
  selectedTool: DrawingTool;
  marker: MarkerSettings;
  eraser: EraserSettings;
  ruler: RulerSettings;
  zoom: ZoomSettings;
}

// Default settings
const DEFAULT_MARKER_SETTINGS: MarkerSettings = {
  color: '#ff0000',
  thickness: 10,
  opacity: 100
};

const DEFAULT_ERASER_SETTINGS: EraserSettings = {
  thickness: 20
};

const DEFAULT_RULER_SETTINGS: RulerSettings = {
  step: 0 // Disabled by default
};

const DEFAULT_ZOOM_SETTINGS: ZoomSettings = {
  level: 100
};

const DEFAULT_TOOL_SETTINGS: ToolSettings = {
  selectedTool: 'none',
  marker: DEFAULT_MARKER_SETTINGS,
  eraser: DEFAULT_ERASER_SETTINGS,
  ruler: DEFAULT_RULER_SETTINGS,
  zoom: DEFAULT_ZOOM_SETTINGS
};

interface ToolSettingsContextType {
  settings: ToolSettings;
  setSelectedTool: (tool: DrawingTool) => void;
  updateMarkerSettings: (settings: Partial<MarkerSettings>) => void;
  updateEraserSettings: (settings: Partial<EraserSettings>) => void;
  updateRulerSettings: (settings: Partial<RulerSettings>) => void;
  updateZoomSettings: (settings: Partial<ZoomSettings>) => void;
}

const ToolSettingsContext = createContext<ToolSettingsContextType | undefined>(undefined);

interface ToolSettingsProviderProps {
  children: ReactNode;
}

export const ToolSettingsProvider: React.FC<ToolSettingsProviderProps> = ({ children }) => {
  const [settings, setSettings] = useState<ToolSettings>(DEFAULT_TOOL_SETTINGS);
  const { setZoom, viewTransform } = useViewTransform(); // Access to real game camera zoom

  // Use refs to track previous values for effect comparison
  const prevMarkerSettingsRef = useRef<MarkerSettings>(settings.marker);
  const prevEraserSettingsRef = useRef<EraserSettings>(settings.eraser);
  const prevRulerSettingsRef = useRef<RulerSettings>(settings.ruler);
  const prevZoomSettingsRef = useRef<ZoomSettings>(settings.zoom);
  const isInternalZoomChangeRef = useRef(false); // Track if zoom change is internal

  const setSelectedTool = (tool: DrawingTool) => {
    setSettings(prev => {
      // Only update if actually different
      if (prev.selectedTool !== tool) {
        // Notify external components (like DrawingCanvas) that don't use the context
        window.dispatchEvent(new CustomEvent('drawing-tool-changed', { detail: { tool } }));
        return { ...prev, selectedTool: tool };
      }
      return prev;
    });
  };

  const updateMarkerSettings = (newSettings: Partial<MarkerSettings>) => {
    setSettings(prev => {
      const updatedMarker = { ...prev.marker, ...newSettings };
      return {
        ...prev,
        marker: updatedMarker
      };
    });
  };

  const updateEraserSettings = (newSettings: Partial<EraserSettings>) => {
    setSettings(prev => {
      const updatedEraser = { ...prev.eraser, ...newSettings };
      return {
        ...prev,
        eraser: updatedEraser
      };
    });
  };

  const updateRulerSettings = (newSettings: Partial<RulerSettings>) => {
    setSettings(prev => {
      const updatedRuler = { ...prev.ruler, ...newSettings };
      return {
        ...prev,
        ruler: updatedRuler
      };
    });
  };

  const updateZoomSettings = (newSettings: Partial<ZoomSettings>) => {
    // Convert zoom level (50-200) to zoom factor (0.5-2.0) and update actual game camera
    if (newSettings.level !== undefined) {
      const zoomFactor = newSettings.level / 100; // Convert 50-200 to 0.5-2.0
      isInternalZoomChangeRef.current = true; // Mark as internal change
      setZoom(zoomFactor); // Update the real game camera

      // Also update localSettings.zoom (used by tabletop for rendering)
      window.dispatchEvent(new CustomEvent('tool-settings-zoom-changed', {
        detail: { zoom: newSettings.level }
      }));
    }

    setSettings(prev => {
      const updatedZoom = { ...prev.zoom, ...newSettings };
      return {
        ...prev,
        zoom: updatedZoom
      };
    });
  };

  // Notify external components when marker settings change
  useEffect(() => {
    const prevMarker = prevMarkerSettingsRef.current;
    if (settings.marker !== prevMarker) {
      window.dispatchEvent(new CustomEvent('marker-settings-changed', {
        detail: settings.marker
      }));
      prevMarkerSettingsRef.current = settings.marker;
    }
  }, [settings.marker]);

  // Notify external components when eraser settings change
  useEffect(() => {
    const prevEraser = prevEraserSettingsRef.current;
    if (settings.eraser !== prevEraser) {
      window.dispatchEvent(new CustomEvent('eraser-settings-changed', {
        detail: settings.eraser
      }));
      prevEraserSettingsRef.current = settings.eraser;
    }
  }, [settings.eraser]);

  // Notify external components when ruler settings change
  useEffect(() => {
    const prevRuler = prevRulerSettingsRef.current;
    if (settings.ruler !== prevRuler) {
      window.dispatchEvent(new CustomEvent('ruler-settings-changed', {
        detail: settings.ruler
      }));
      prevRulerSettingsRef.current = settings.ruler;
    }
  }, [settings.ruler]);

  // Notify external components when zoom settings change
  useEffect(() => {
    const prevZoom = prevZoomSettingsRef.current;
    if (settings.zoom !== prevZoom) {
      window.dispatchEvent(new CustomEvent('zoom-settings-changed', {
        detail: settings.zoom
      }));
      prevZoomSettingsRef.current = settings.zoom;
    }
  }, [settings.zoom]);

  // Sync zoom from ViewTransformContext to ToolSettingsContext (bi-directional sync)
  useEffect(() => {
    // Skip if this change was initiated from within ToolSettingsContext
    if (isInternalZoomChangeRef.current) {
      isInternalZoomChangeRef.current = false;
      return;
    }

    // Convert zoom factor (0.5-2.0) to zoom level (50-200)
    const zoomLevel = Math.round(viewTransform.zoom * 100);

    // Only update if significantly different to avoid loops
    if (Math.abs(zoomLevel - settings.zoom.level) > 1) {
      setSettings(prev => ({
        ...prev,
        zoom: { ...prev.zoom, level: zoomLevel }
      }));
    }
  }, [viewTransform.zoom]);

  // Listen for external zoom updates (e.g., from Ctrl+scroll in Tabletop)
  useEffect(() => {
    const handleZoomChange = (event: CustomEvent) => {
      const newLevel = event.detail.level;
      if (typeof newLevel === 'number' && Math.abs(newLevel - settings.zoom.level) > 1) {
        setSettings(prev => ({
          ...prev,
          zoom: { ...prev.zoom, level: newLevel }
        }));
      }
    };

    window.addEventListener('zoom-settings-changed', handleZoomChange as EventListener);
    return () => window.removeEventListener('zoom-settings-changed', handleZoomChange as EventListener);
  }, [settings.zoom.level]);

  // Register external updater function
  useEffect(() => {
    externalZoomUpdater = (level: number) => {
      setSettings(prev => ({
        ...prev,
        zoom: { ...prev.zoom, level }
      }));
    };

    return () => {
      externalZoomUpdater = null;
    };
  }, []);

  return (
    <ToolSettingsContext.Provider value={{ settings, setSelectedTool, updateMarkerSettings, updateEraserSettings, updateRulerSettings, updateZoomSettings }}>
      {children}
    </ToolSettingsContext.Provider>
  );
};

export const useToolSettings = () => {
  const context = useContext(ToolSettingsContext);
  if (!context) {
    throw new Error('useToolSettings must be used within a ToolSettingsProvider');
  }
  return context;
};

// Legacy hooks for backward compatibility
export function useDrawingTool(): DrawingTool {
  const { settings } = useToolSettings();
  return settings.selectedTool;
}

export function useMarkerSettings(): MarkerSettings {
  const { settings } = useToolSettings();
  return settings.marker;
}

export function useEraserSettings(): EraserSettings {
  const { settings } = useToolSettings();
  return settings.eraser;
}

export function useRulerSettings(): RulerSettings {
  const { settings } = useToolSettings();
  return settings.ruler;
}
