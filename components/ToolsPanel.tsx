import { t as translate, Locale } from '../utils/translations';
import React, { useRef, useCallback } from 'react';
import { useGame } from '../store/GameContext';
import { AppLanguage } from '../types';
import { Pen, Eraser, Ruler, ZoomIn, ChevronDown, ChevronUp, MousePointer2, Type } from 'lucide-react';
import { useToolSettings, DrawingTool } from '../contexts/ToolSettingsContext';
import { ToolSettingsCards } from './ToolSettingsCards';

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
    toolText: 'Text',
    toolTextDesc: 'Create and edit text labels',
    toolZoom: 'Zoom',
    toolZoomDesc: 'Zoom in/out',
    rulerStep: 'Step',
    rulerStepDesc: 'Ruler step size in VU (0 = disabled)',
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
  { id: 'text', labelKey: 'toolText', descKey: 'toolTextDesc', icon: <Type size={20} /> },
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
  height: _height = 400,
  isCollapsed = false,
  onToggleCollapse,
  language = 'en'
}) => {
  useGame();
  const containerRef = useRef<HTMLDivElement>(null);

  // Use shared tool settings context
  const { settings, setSelectedTool } = useToolSettings();

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
        className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin"
        data-scrollable="true"
      >
        {/* Drawing Tools Section */}
        <div className="border-b border-slate-700">
          <div className="p-3">
            <div className="grid grid-cols-6 gap-1 mb-3">
              {DRAWING_TOOLS.map((tool) => (
                <button
                  key={tool.id}
                  onClick={() => handleToolSelect(tool.id)}
                  className={`flex flex-col items-center justify-center h-10 px-2 rounded-lg transition-colors ${
                    settings.selectedTool === tool.id
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-700 text-gray-400 hover:text-white hover:bg-slate-600'
                  }`}
                  title={getToolTranslation(language, tool.descKey)}
                >
                  {tool.icon}
                  <span className="text-[10px] mt-0.5">{getToolTranslation(language, tool.labelKey)}</span>
                </button>
              ))}
            </div>

                        {/* Shared tool settings cards (same as main menu Tools tab) */}
            <ToolSettingsCards />
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
  width: _width = 280,
  isCollapsed = false,
  language = 'en'
}) => {
  const { settings, setSelectedTool } = useToolSettings();

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
        className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin"
        data-scrollable="true"
      >
        {/* Drawing Tools Section */}
        <div className="p-3">
          <div className="grid grid-cols-6 gap-1 mb-3">
            {DRAWING_TOOLS.map((tool) => (
              <button
                key={tool.id}
                onClick={() => handleToolSelect(tool.id)}
                className={`flex flex-col items-center justify-center h-10 px-2 rounded-lg transition-colors ${
                  settings.selectedTool === tool.id
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-700 text-gray-400 hover:text-white hover:bg-slate-600'
                }`}
                title={getToolTranslation(language, tool.descKey)}
              >
                {tool.icon}
                <span className="text-[10px] mt-0.5">{getToolTranslation(language, tool.labelKey)}</span>
              </button>
            ))}
          </div>

                      {/* Shared tool settings cards (same as main menu Tools tab) */}
            <ToolSettingsCards />
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
