import { t as translate, Locale } from '../utils/translations';
import React, { useState, useCallback, useEffect } from 'react';
import { useLocalSettings } from '../hooks/useLocalSettings';
import { AppLanguage } from '../types';
import { Pen, Eraser, Ruler, ZoomIn, MousePointer2 } from 'lucide-react';

// Drawing tools
export type DrawingTool = 'none' | 'marker' | 'eraser' | 'ruler' | 'zoom';

interface DrawingToolConfig {
  id: DrawingTool;
  labelKey: string;
  descKey: string;
  icon: React.ReactNode;
}

const DRAWING_TOOLS: DrawingToolConfig[] = [
  { id: 'none', labelKey: 'toolCursor', descKey: 'toolCursorDesc', icon: <MousePointer2 size={20} /> },
  { id: 'marker', labelKey: 'toolMarker', descKey: 'toolMarkerDesc', icon: <Pen size={20} /> },
  { id: 'eraser', labelKey: 'toolEraser', descKey: 'toolEraserDesc', icon: <Eraser size={20} /> },
  { id: 'ruler', labelKey: 'toolRuler', descKey: 'toolRulerDesc', icon: <Ruler size={20} /> },
  { id: 'zoom', labelKey: 'toolZoom', descKey: 'toolZoomDesc', icon: <ZoomIn size={20} /> },
];

// Helper function to get translation for tool keys
function getToolTranslation(language: AppLanguage, key: string): string {
  const toolTranslations: Record<string, string> = {
    toolCursor: 'Cursor',
    toolCursorDesc: 'Normal cursor mode',
    toolMarker: 'Marker',
    toolMarkerDesc: 'Draw on the board or objects',
    toolEraser: 'Eraser',
    toolEraserDesc: 'Erase drawings',
    toolRuler: 'Ruler',
    toolRulerDesc: 'Measure distances',
    toolZoom: 'Zoom',
    toolZoomDesc: 'Zoom in/out',
    Size: 'Size',
    Opacity: 'Opacity',
    Zoom: 'Zoom',
  };
  return translate(toolTranslations[key] || key, language as Locale);
}

interface DrawingToolsPanelProps {
  width?: number;
  isCollapsed?: boolean;
  language?: AppLanguage;
}

export const DrawingToolsPanel: React.FC<DrawingToolsPanelProps> = ({
  width = 280,
  isCollapsed = false,
  language = 'en'
}) => {
  const { settings: localSettings, updateSetting } = useLocalSettings();

  // Current selected tool
  const [selectedTool, setSelectedTool] = useState<DrawingTool>('none');

  // Marker settings
  const [markerColor, setMarkerColor] = useState('#ff0000');
  const [markerThickness, setMarkerThickness] = useState(10);
  const [markerOpacity, setMarkerOpacity] = useState(100);

  // Eraser settings
  const [eraserThickness, setEraserThickness] = useState(100);

  // Sync tool state with other components (bidirectional)
  useEffect(() => {
    const handleToolSync = (e: Event) => {
      const customEvent = e as CustomEvent<{ tool: DrawingTool }>;
      setSelectedTool(customEvent.detail.tool);
    };

    const handleToolRequest = () => {
      window.dispatchEvent(new CustomEvent('drawing-tool-sync', {
        detail: { tool: selectedTool }
      }));
    };

    window.addEventListener('drawing-tool-sync', handleToolSync);
    window.addEventListener('drawing-tool-request', handleToolRequest);

    // Request current tool state on mount
    window.dispatchEvent(new Event('drawing-tool-request'));

    return () => {
      window.removeEventListener('drawing-tool-sync', handleToolSync);
      window.removeEventListener('drawing-tool-request', handleToolRequest);
    };
  }, [selectedTool]);

  // Sync marker settings (bidirectional)
  useEffect(() => {
    // Emit when local state changes
    window.dispatchEvent(new CustomEvent('marker-settings-changed', {
      detail: { color: markerColor, thickness: markerThickness, opacity: markerOpacity }
    }));

    // Listen for changes from other components
    const handleMarkerSync = (e: Event) => {
      const customEvent = e as CustomEvent<{ color: string; thickness: number; opacity: number }>;
      setMarkerColor(customEvent.detail.color);
      setMarkerThickness(customEvent.detail.thickness);
      if (customEvent.detail.opacity !== undefined) {
        setMarkerOpacity(customEvent.detail.opacity);
      }
    };

    window.addEventListener('marker-settings-sync', handleMarkerSync);

    return () => {
      window.removeEventListener('marker-settings-sync', handleMarkerSync);
    };
  }, [markerColor, markerThickness, markerOpacity]);

  // Sync eraser settings (bidirectional)
  useEffect(() => {
    // Emit when local state changes
    window.dispatchEvent(new CustomEvent('eraser-settings-changed', {
      detail: { thickness: eraserThickness }
    }));

    // Listen for changes from other components
    const handleEraserSync = (e: Event) => {
      const customEvent = e as CustomEvent<{ thickness: number }>;
      setEraserThickness(customEvent.detail.thickness);
    };

    window.addEventListener('eraser-settings-sync', handleEraserSync);

    return () => {
      window.removeEventListener('eraser-settings-sync', handleEraserSync);
    };
  }, [eraserThickness]);

  // Handle tool selection
  const handleToolSelect = useCallback((tool: DrawingTool) => {
    setSelectedTool(tool);
    // Dispatch event to notify other components about tool change
    window.dispatchEvent(new CustomEvent('drawing-tool-changed', { detail: { tool } }));
    // Sync immediately with all other panels
    window.dispatchEvent(new CustomEvent('drawing-tool-sync', { detail: { tool } }));
  }, []);

  if (isCollapsed) {
    return (
      <div
        data-drawing-tools-panel
        className="h-full flex items-center justify-center bg-slate-800 border border-slate-600 rounded-lg"
        style={{ width: '40px' }}
      >
        <div className="text-xs text-slate-400 text-center px-1" style={{ writingMode: 'vertical-rl' }}>
          {translate('Tools', language as Locale)}
        </div>
      </div>
    );
  }

  return (
    <div
      data-drawing-tools-panel
      className="h-full flex flex-col bg-slate-800 rounded-lg"
      style={{ width }}
    >
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
        {/* Drawing Tools Grid */}
        <div className="grid grid-cols-5 gap-2 mb-3">
          {DRAWING_TOOLS.map((tool) => (
            <button
              key={tool.id}
              onClick={() => handleToolSelect(tool.id)}
              className={`flex flex-col items-center justify-center p-2 rounded-lg transition-colors ${
                selectedTool === tool.id
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-700 text-gray-400 hover:text-white hover:bg-slate-600'
              }`}
              title={getToolTranslation(language, tool.descKey)}
            >
              {tool.icon}
              <span className="text-[10px] mt-1">{getToolTranslation(language, tool.labelKey)}</span>
            </button>
          ))}
        </div>

        {/* Marker Settings (shown when marker is selected) */}
        {selectedTool === 'marker' && (
          <div className="space-y-3 p-3 bg-slate-900 rounded-lg">
            {/* Color picker */}
            <div>
              <input
                type="color"
                value={markerColor}
                onChange={(e) => setMarkerColor(e.target.value)}
                className="w-full h-10 bg-slate-800 border border-slate-700 rounded cursor-pointer"
              />
            </div>

            {/* Thickness slider */}
            <div>
              <label className="block text-[10px] text-gray-400 mb-1">
                {translate('Size', language as Locale)}: {markerThickness}px
              </label>
              <input
                type="range"
                min="1"
                max="100"
                value={markerThickness}
                onChange={(e) => setMarkerThickness(Number(e.target.value))}
                className="w-full bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500 slider-input"
              />
              <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
                <span>1px</span>
                <span>50px</span>
                <span>100px</span>
              </div>
            </div>

            {/* Opacity slider */}
            <div>
              <label className="block text-[10px] text-gray-400 mb-1">
                {translate('Opacity', language as Locale)}: {markerOpacity}%
              </label>
              <input
                type="range"
                min="1"
                max="100"
                value={markerOpacity}
                onChange={(e) => setMarkerOpacity(Number(e.target.value))}
                className="w-full bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500 slider-input"
              />
              <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
                <span>1%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>
          </div>
        )}

        {/* Eraser Settings (shown when eraser is selected) */}
        {selectedTool === 'eraser' && (
          <div className="space-y-3 p-3 bg-slate-900 rounded-lg">
            <div>
              <label className="block text-[10px] text-gray-400 mb-1">
                {translate('Size', language as Locale)}: {eraserThickness}px
              </label>
              <input
                type="range"
                min="1"
                max="100"
                value={eraserThickness}
                onChange={(e) => {
                  const newThickness = Number(e.target.value);
                  console.log('🎛️ Eraser slider changed to:', newThickness);
                  setEraserThickness(newThickness);
                  // Force immediate sync for cursor update
                  window.dispatchEvent(new CustomEvent('eraser-settings-changed', {
                    detail: { thickness: newThickness }
                  }));
                  console.log('🎛️ Dispatched eraser-settings-changed event with thickness:', newThickness);
                }}
                className="w-full bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500 slider-input"
              />
              <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
                <span>1px</span>
                <span>50px</span>
                <span>100px</span>
              </div>
            </div>
          </div>
        )}

        {/* Zoom Settings (shown when zoom is selected) */}
        {selectedTool === 'zoom' && (
          <div className="space-y-3 p-3 bg-slate-900 rounded-lg">
            {/* Zoom slider */}
            <div>
              <label className="block text-[10px] text-gray-400 mb-1">
                {translate('Zoom', language as Locale)}: {localSettings.zoom ?? 100}%
              </label>
              <input
                type="range"
                min="50"
                max="200"
                step="5"
                value={localSettings.zoom ?? 100}
                onChange={(e) => updateSetting('zoom', Number(e.target.value))}
                className="w-full bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500 slider-input"
              />
              <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
                <span>50%</span>
                <span>125%</span>
                <span>200%</span>
              </div>
            </div>

            <p className="text-[9px] text-gray-500 italic">
              {translate('Configure layer zoom in Layer Settings', language as Locale)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

// Hook to get current drawing tool
export function useDrawingTool(): DrawingTool {
  const [tool, setTool] = useState<DrawingTool>('none');

  useEffect(() => {
    const handleToolChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ tool: DrawingTool }>;
      setTool(customEvent.detail.tool);
    };

    const handleToolSync = (e: Event) => {
      const customEvent = e as CustomEvent<{ tool: DrawingTool }>;
      setTool(customEvent.detail.tool);
    };

    window.addEventListener('drawing-tool-changed', handleToolChange);
    window.addEventListener('drawing-tool-sync', handleToolSync);

    // Request current tool state on mount
    window.dispatchEvent(new Event('drawing-tool-request'));

    return () => {
      window.removeEventListener('drawing-tool-changed', handleToolChange);
      window.removeEventListener('drawing-tool-sync', handleToolSync);
    };
  }, []);

  return tool;
}

// Hook to get marker settings
export function useMarkerSettings(): { color: string; thickness: number; opacity: number } {
  const [settings, setSettings] = useState({ color: '#ff0000', thickness: 10, opacity: 100 });

  useEffect(() => {
    const handleMarkerChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ color: string; thickness: number; opacity?: number }>;
      setSettings({
        color: customEvent.detail.color,
        thickness: customEvent.detail.thickness,
        opacity: customEvent.detail.opacity ?? 100
      });
    };

    const handleMarkerSync = (e: Event) => {
      const customEvent = e as CustomEvent<{ color: string; thickness: number; opacity?: number }>;
      setSettings({
        color: customEvent.detail.color,
        thickness: customEvent.detail.thickness,
        opacity: customEvent.detail.opacity ?? 100
      });
    };

    window.addEventListener('marker-settings-changed', handleMarkerChange);
    window.addEventListener('marker-settings-sync', handleMarkerSync);

    // Request current settings on mount
    window.dispatchEvent(new Event('marker-settings-request'));

    return () => {
      window.removeEventListener('marker-settings-changed', handleMarkerChange);
      window.removeEventListener('marker-settings-sync', handleMarkerSync);
    };
  }, []);

  return settings;
}

// Hook to get eraser settings
export function useEraserSettings(): { thickness: number } {
  const [settings, setSettings] = useState({ thickness: 20 });

  useEffect(() => {
    const handleEraserChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ thickness: number }>;
      setSettings(customEvent.detail);
    };

    const handleEraserSync = (e: Event) => {
      const customEvent = e as CustomEvent<{ thickness: number }>;
      setSettings(customEvent.detail);
    };

    window.addEventListener('eraser-settings-changed', handleEraserChange);
    window.addEventListener('eraser-settings-sync', handleEraserSync);

    // Request current settings on mount
    window.dispatchEvent(new Event('marker-settings-request')); // Uses same request event

    return () => {
      window.removeEventListener('eraser-settings-changed', handleEraserChange);
      window.removeEventListener('eraser-settings-sync', handleEraserSync);
    };
  }, []);

  return settings;
}
