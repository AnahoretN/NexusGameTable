import { t as translate, Locale } from '../utils/translations';
import React, { useRef, useCallback, useEffect } from 'react';
import { useGame } from '../store/GameContext';
import { AppLanguage } from '../types';
import { Pen, Eraser, Ruler, ZoomIn, ChevronDown, ChevronUp, MousePointer2 } from 'lucide-react';
import { useToolSettings, DrawingTool } from '../contexts/ToolSettingsContext';

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
  };
  return translate(toolTranslations[key] || key, language as Locale);
}

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

interface MainToolsPanelProps {
  width?: number;
  height?: number;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  language?: AppLanguage;
}

export const MainToolsPanel: React.FC<MainToolsPanelProps> = ({
  width = 280,
  height = 400,
  isCollapsed = false,
  onToggleCollapse,
  language = 'en'
}) => {
  const { dispatch, isHost } = useGame();
  const containerRef = useRef<HTMLDivElement>(null);

  // Use shared tool settings context
  const { settings, setSelectedTool, updateMarkerSettings, updateEraserSettings, updateZoomSettings } = useToolSettings();

  // Handle tool selection
  const handleToolSelect = useCallback((tool: DrawingTool) => {
    setSelectedTool(tool);
  }, [setSelectedTool]);

  if (isCollapsed) {
    return (
      <div
        ref={containerRef}
        data-tools-panel
        className="fixed left-0 top-1/2 -translate-y-1/2 bg-slate-800 border border-slate-600 rounded-r-lg shadow-xl z-[9997] overflow-hidden"
        style={{ width: '40px', minWidth: '40px', maxWidth: '40px' }}
      >
        <button
          onClick={onToggleCollapse}
          className="w-full h-12 flex items-center justify-center text-gray-400 hover:text-white hover:bg-slate-700 transition-colors rounded-r-lg"
          title={translate('Expand Tools', language as Locale)}
        >
          <ChevronUp size={20} className="rotate-90" />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-tools-panel
      className="fixed left-0 top-1/2 -translate-y-1/2 bg-slate-800 border border-slate-600 rounded-r-lg shadow-xl z-[9997] flex flex-col overflow-hidden"
      style={{ width, maxHeight: '80vh', minWidth: width, maxWidth: width }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
        <h3 className="text-sm font-bold text-white">{translate('Tools', language as Locale)}</h3>
        <button
          onClick={onToggleCollapse}
          className="p-1 text-gray-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
          title={translate('Collapse', language as Locale)}
        >
          <ChevronDown size={16} className="rotate-90" />
        </button>
      </div>

      <div
        className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar"
        data-scrollable="true"
      >
        {/* Drawing Tools Section */}
        <div className="border-b border-slate-700">
          <div className="p-3">
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
              <div className="space-y-3 mt-3 p-3 bg-slate-900 rounded-lg">
                <div>
                  <input
                    type="color"
                    value={settings.marker.color}
                    onChange={(e) => updateMarkerSettings({ color: e.target.value })}
                    className="w-full h-10 bg-slate-800 border border-slate-700 rounded cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1">{translate('Size', language as Locale)}: {settings.marker.thickness}px</label>
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={settings.marker.thickness}
                    onChange={(e) => updateMarkerSettings({ thickness: Number(e.target.value) })}
                    className="w-full bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500 slider-input"
                  />
                  <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
                    <span>1px</span>
                    <span>50px</span>
                    <span>100px</span>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1">{translate('Opacity', language as Locale)}: {settings.marker.opacity}%</label>
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={settings.marker.opacity}
                    onChange={(e) => updateMarkerSettings({ opacity: Number(e.target.value) })}
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
                  <label className="block text-[10px] text-gray-400 mb-1">{translate('Size', language as Locale)}: {settings.eraser.thickness}px</label>
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
              <div className="space-y-2 p-3 bg-slate-900 rounded-lg">
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1">{translate('Zoom Level', language as Locale)}: {settings.zoom.level}%</label>
                  <input
                    type="range"
                    min="50"
                    max="200"
                    step="25"
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
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1">{translate('Quick Zoom', language as Locale)}</label>
                  <div className="grid grid-cols-4 gap-1">
                    {[50, 100, 150, 200].map((level) => (
                      <button
                        key={level}
                        onClick={() => updateZoomSettings({ level })}
                        className={`text-xs py-1 rounded transition-colors ${
                          settings.zoom.level === level
                            ? 'bg-purple-600 text-white'
                            : 'bg-slate-700 text-gray-400 hover:text-white hover:bg-slate-600'
                        }`}
                      >
                        {level}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// PanelToolsPanel - for separate panel objects (not fixed position)
interface PanelToolsPanelProps {
  width?: number;
  isCollapsed?: boolean;
  language?: AppLanguage;
}

export const PanelToolsPanel: React.FC<PanelToolsPanelProps> = ({
  width = 280,
  isCollapsed = false,
  language = 'en'
}) => {
  const { settings, setSelectedTool, updateMarkerSettings, updateEraserSettings, updateZoomSettings } = useToolSettings();

  // Handle tool selection
  const handleToolSelect = useCallback((tool: DrawingTool) => {
    setSelectedTool(tool);
  }, [setSelectedTool]);

  if (isCollapsed) {
    return (
      <div
        data-tools-panel
        className="h-full w-full bg-slate-800 overflow-hidden flex flex-col"
      >
        <div className="flex-1 flex items-center justify-center">
        </div>
      </div>
    );
  }

  return (
    <div
      data-tools-panel
      className="h-full w-full bg-slate-800 overflow-hidden flex flex-col"
    >
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar"
        data-scrollable="true"
      >
        {/* Drawing Tools Section */}
        <div className="p-3">
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
            <div className="space-y-3 mt-3 p-3 bg-slate-900 rounded-lg">
              <div>
                <input
                  type="color"
                  value={settings.marker.color}
                  onChange={(e) => updateMarkerSettings({ color: e.target.value })}
                  className="w-full h-10 bg-slate-800 border border-slate-700 rounded cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-400 mb-1">{translate('Size', language as Locale)}: {settings.marker.thickness}px</label>
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={settings.marker.thickness}
                  onChange={(e) => updateMarkerSettings({ thickness: Number(e.target.value) })}
                  className="w-full bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500 slider-input"
                />
                <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
                  <span>1px</span>
                  <span>50px</span>
                  <span>100px</span>
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-gray-400 mb-1">{translate('Opacity', language as Locale)}: {settings.marker.opacity}%</label>
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={settings.marker.opacity}
                  onChange={(e) => updateMarkerSettings({ opacity: Number(e.target.value) })}
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
                <label className="block text-[10px] text-gray-400 mb-1">{translate('Size', language as Locale)}: {settings.eraser.thickness}px</label>
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
            <div className="space-y-2 p-3 bg-slate-900 rounded-lg">
              <div>
                <label className="block text-[10px] text-gray-400 mb-1">{translate('Zoom Level', language as Locale)}: {settings.zoom.level}%</label>
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
              <div>
                <label className="block text-[10px] text-gray-400 mb-1">{translate('Quick Zoom', language as Locale)}</label>
                <div className="grid grid-cols-4 gap-1">
                  {[50, 100, 150, 200].map((level) => (
                    <button
                      key={level}
                      onClick={() => updateZoomSettings({ level })}
                      className={`text-xs py-1 rounded transition-colors ${
                        settings.zoom.level === level
                          ? 'bg-purple-600 text-white'
                          : 'bg-slate-700 text-gray-400 hover:text-white hover:bg-slate-600'
                      }`}
                    >
                      {level}%
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// MainToolsPanel now relies on context for tool settings, so we don't need memoization
// The context will trigger re-renders when settings change
export default MainToolsPanel;

// Export as ToolsPanel for compatibility with UIObjectRendererOptimized
export { MainToolsPanel as ToolsPanel };
