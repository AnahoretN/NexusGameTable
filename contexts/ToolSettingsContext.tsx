import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useViewTransform } from '../store/contexts/ViewTransformContext';

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

// Zoom settings
interface ZoomSettings {
  level: number;
}

// All tool settings
interface ToolSettings {
  selectedTool: DrawingTool;
  marker: MarkerSettings;
  eraser: EraserSettings;
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

const DEFAULT_ZOOM_SETTINGS: ZoomSettings = {
  level: 100
};

const DEFAULT_TOOL_SETTINGS: ToolSettings = {
  selectedTool: 'none',
  marker: DEFAULT_MARKER_SETTINGS,
  eraser: DEFAULT_ERASER_SETTINGS,
  zoom: DEFAULT_ZOOM_SETTINGS
};

interface ToolSettingsContextType {
  settings: ToolSettings;
  setSelectedTool: (tool: DrawingTool) => void;
  updateMarkerSettings: (settings: Partial<MarkerSettings>) => void;
  updateEraserSettings: (settings: Partial<EraserSettings>) => void;
  updateZoomSettings: (settings: Partial<ZoomSettings>) => void;
}

const ToolSettingsContext = createContext<ToolSettingsContextType | undefined>(undefined);

interface ToolSettingsProviderProps {
  children: ReactNode;
}

export const ToolSettingsProvider: React.FC<ToolSettingsProviderProps> = ({ children }) => {
  const [settings, setSettings] = useState<ToolSettings>(DEFAULT_TOOL_SETTINGS);
  const { setZoom } = useViewTransform(); // Access to real game camera zoom

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

    // Notify external components AFTER state update
    setTimeout(() => {
      setSettings(currentSettings => {
        window.dispatchEvent(new CustomEvent('marker-settings-changed', {
          detail: currentSettings.marker
        }));
        return currentSettings;
      });
    }, 0);
  };

  const updateEraserSettings = (newSettings: Partial<EraserSettings>) => {
    setSettings(prev => {
      const updatedEraser = { ...prev.eraser, ...newSettings };
      return {
        ...prev,
        eraser: updatedEraser
      };
    });

    // Notify external components AFTER state update
    setTimeout(() => {
      setSettings(currentSettings => {
        window.dispatchEvent(new CustomEvent('eraser-settings-changed', {
          detail: currentSettings.eraser
        }));
        return currentSettings;
      });
    }, 0);
  };

  const updateZoomSettings = (newSettings: Partial<ZoomSettings>) => {
    // Convert zoom level (50-200) to zoom factor (0.5-2.0) and update actual game camera
    if (newSettings.level !== undefined) {
      const zoomFactor = newSettings.level / 100; // Convert 50-200 to 0.5-2.0
      setZoom(zoomFactor); // Update the real game camera
    }

    setSettings(prev => {
      const updatedZoom = { ...prev.zoom, ...newSettings };
      return {
        ...prev,
        zoom: updatedZoom
      };
    });

    // Notify external components AFTER state update
    setTimeout(() => {
      setSettings(currentSettings => {
        window.dispatchEvent(new CustomEvent('zoom-settings-changed', {
          detail: currentSettings.zoom
        }));
        return currentSettings;
      });
    }, 0);
  };

  return (
    <ToolSettingsContext.Provider value={{ settings, setSelectedTool, updateMarkerSettings, updateEraserSettings, updateZoomSettings }}>
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
