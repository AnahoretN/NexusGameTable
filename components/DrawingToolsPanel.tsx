import { t as translate, Locale } from '../utils/translations';
import React, { useState, useCallback, useEffect } from 'react';
import { useGame } from '../store/GameContext';
import { AppLanguage } from '../types';
import { Pen, Eraser, Ruler, Compass, ChevronDown, Settings } from 'lucide-react';

// Drawing tools
export type DrawingTool = 'none' | 'marker' | 'eraser' | 'ruler' | 'compass';

interface DrawingToolConfig {
  id: DrawingTool;
  labelKey: string;
  descKey: string;
  icon: React.ReactNode;
}

const DRAWING_TOOLS: DrawingToolConfig[] = [
  { id: 'none', labelKey: 'toolCursor', descKey: 'toolCursorDesc', icon: null },
  { id: 'marker', labelKey: 'toolMarker', descKey: 'toolMarkerDesc', icon: <Pen size={20} /> },
  { id: 'eraser', labelKey: 'toolEraser', descKey: 'toolEraserDesc', icon: <Eraser size={20} /> },
  { id: 'ruler', labelKey: 'toolRuler', descKey: 'toolRulerDesc', icon: <Ruler size={20} /> },
  { id: 'compass', labelKey: 'toolCompass', descKey: 'toolCompassDesc', icon: <Compass size={20} /> },
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
    toolCompass: 'Compass',
    toolCompassDesc: 'Draw circles/arcs',
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
  // Current selected tool
  const [selectedTool, setSelectedTool] = useState<DrawingTool>('none');

  // Marker settings
  const [markerColor, setMarkerColor] = useState('#ff0000');
  const [markerThickness, setMarkerThickness] = useState(10);

  // Emit marker settings when they change
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('marker-settings-changed', {
      detail: { color: markerColor, thickness: markerThickness }
    }));
  }, [markerColor, markerThickness]);

  // Respond to settings request from other components
  useEffect(() => {
    const handleRequest = () => {
      window.dispatchEvent(new CustomEvent('marker-settings-sync', {
        detail: { color: markerColor, thickness: markerThickness }
      }));
    };
    window.addEventListener('marker-settings-request', handleRequest);
    return () => window.removeEventListener('marker-settings-request', handleRequest);
  }, [markerColor, markerThickness]);

  // Sync tool state with other components
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

    return () => {
      window.removeEventListener('drawing-tool-sync', handleToolSync);
      window.removeEventListener('drawing-tool-request', handleToolRequest);
    };
  }, [selectedTool]);

  // Handle tool selection
  const handleToolSelect = useCallback((tool: DrawingTool) => {
    setSelectedTool(tool);
    // Dispatch event to notify other components about tool change
    window.dispatchEvent(new CustomEvent('drawing-tool-changed', { detail: { tool } }));
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
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
        <h3 className="text-sm font-bold text-white">{translate('Drawing Tools', language as Locale)}</h3>
        <Settings size={16} className="text-slate-400" />
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
        {/* Drawing Tools Grid */}
        <h4 className="text-xs font-bold text-gray-400 mb-2 uppercase">{translate('Tools', language as Locale)}</h4>
        <div className="grid grid-cols-4 gap-2 mb-3">
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
          <div className="space-y-2 mt-3 p-2 bg-slate-900 rounded">
            <div>
              <label className="block text-[10px] text-gray-400 mb-1">{translate('Color', language as Locale)}</label>
              <div className="flex gap-1">
                {['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ffffff', '#000000'].map((color) => (
                  <button
                    key={color}
                    onClick={() => setMarkerColor(color)}
                    className={`w-6 h-6 rounded border-2 transition-colors ${
                      markerColor === color ? 'border-white scale-110' : 'border-slate-600'
                    }`}
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="block text-[10px] text-gray-400 mb-1">{translate('Thickness', language as Locale)}: {markerThickness}px</label>
              <input
                type="range"
                min="1"
                max="20"
                value={markerThickness}
                onChange={(e) => setMarkerThickness(Number(e.target.value))}
                className="w-full bg-slate-700 rounded-lg appearance-none cursor-pointer slider-input"
              />
            </div>
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
export function useMarkerSettings(): { color: string; thickness: number } {
  const [settings, setSettings] = useState({ color: '#ff0000', thickness: 3 });

  useEffect(() => {
    const handleMarkerChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ color: string; thickness: number }>;
      setSettings(customEvent.detail);
    };

    const handleMarkerSync = (e: Event) => {
      const customEvent = e as CustomEvent<{ color: string; thickness: number }>;
      setSettings(customEvent.detail);
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
