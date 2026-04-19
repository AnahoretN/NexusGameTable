import { t as translate, Locale } from '../utils/translations';
import React, { useCallback, useEffect } from 'react';
import { useLocalSettings } from '../hooks/useLocalSettings';
import { AppLanguage } from '../types';
import { Pen, Eraser, Ruler, ZoomIn, MousePointer2 } from 'lucide-react';
import { useToolSettings, DrawingTool } from '../contexts/ToolSettingsContext';

// Drawing tools configuration
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

interface ToolsPanelProps {
  width?: number;
  isCollapsed?: boolean;
  language?: AppLanguage;
}

export const ToolsPanel: React.FC<ToolsPanelProps> = ({
  width = 280,
  isCollapsed = false,
  language = 'en'
}) => {
  const { settings: localSettings, updateSetting } = useLocalSettings();

  // Use shared tool settings context
  const { settings, setSelectedTool, updateMarkerSettings, updateEraserSettings, updateZoomSettings } = useToolSettings();

  // Debug logging to check if context is working
  useEffect(() => {
    console.log('🎨 DrawingToolsPanel: Current settings:', settings);
  }, [settings]);

  // Handle tool selection with logging
  const handleToolSelect = useCallback((tool: DrawingTool) => {
    console.log('🎨 DrawingToolsPanel: Tool selected:', tool);
    console.log('🎨 DrawingToolsPanel: Current tool before change:', settings.selectedTool);
    setSelectedTool(tool);
  }, [setSelectedTool, settings.selectedTool]);

  // Add logging for marker settings updates
  const handleUpdateMarkerSettings = useCallback((newSettings: Partial<{ color: string; thickness: number; opacity: number }>) => {
    console.log('🎨 DrawingToolsPanel: Calling updateMarkerSettings with:', newSettings);
    console.log('🎨 DrawingToolsPanel: Current marker settings:', settings.marker);
    updateMarkerSettings(newSettings);
  }, [updateMarkerSettings, settings.marker]);

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
                settings.selectedTool === tool.id
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
        {settings.selectedTool === 'marker' && (
          <div className="space-y-3 p-3 bg-slate-900 rounded-lg">
            {/* Color picker */}
            <div>
              <input
                type="color"
                value={settings.marker.color}
                onChange={(e) => handleUpdateMarkerSettings({ color: e.target.value })}
                className="w-full h-10 bg-slate-800 border border-slate-700 rounded cursor-pointer"
              />
            </div>

            {/* Thickness slider */}
            <div>
              <label className="block text-[10px] text-gray-400 mb-1">
                {translate('Size', language as Locale)}: {settings.marker.thickness}px
              </label>
              <input
                type="range"
                min="1"
                max="100"
                value={settings.marker.thickness}
                onChange={(e) => handleUpdateMarkerSettings({ thickness: Number(e.target.value) })}
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
                {translate('Opacity', language as Locale)}: {settings.marker.opacity}%
              </label>
              <input
                type="range"
                min="1"
                max="100"
                value={settings.marker.opacity}
                onChange={(e) => handleUpdateMarkerSettings({ opacity: Number(e.target.value) })}
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
        {settings.selectedTool === 'eraser' && (
          <div className="space-y-3 p-3 bg-slate-900 rounded-lg">
            <div>
              <label className="block text-[10px] text-gray-400 mb-1">
                {translate('Size', language as Locale)}: {settings.eraser.thickness}px
              </label>
              <input
                type="range"
                min="15"
                max="100"
                value={settings.eraser.thickness}
                onChange={(e) => updateEraserSettings({ thickness: Number(e.target.value) })}
                className="w-full bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500 slider-input"
              />
              <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
                <span>15px</span>
                <span>50px</span>
                <span>100px</span>
              </div>
            </div>
          </div>
        )}

        {/* Zoom Settings (shown when zoom is selected) */}
        {settings.selectedTool === 'zoom' && (
          <div className="space-y-3 p-3 bg-slate-900 rounded-lg">
            {/* Zoom slider */}
            <div>
              <label className="block text-[10px] text-gray-400 mb-1">
                {translate('Zoom', language as Locale)}: {settings.zoom.level}%
              </label>
              <input
                type="range"
                min="50"
                max="200"
                step="5"
                value={settings.zoom.level}
                onChange={(e) => updateZoomSettings({ level: Number(e.target.value) })}
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
