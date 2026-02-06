import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useGame } from '../store/GameContext';
import { ItemType, TableObject, TokenType, TokenShape, WindowType } from '../types';
import { Pen, Eraser, Ruler, Compass, ChevronDown, ChevronUp, Settings } from 'lucide-react';

// Drawing tools
export type DrawingTool = 'none' | 'marker' | 'eraser' | 'ruler' | 'compass';

interface DrawingToolConfig {
  id: DrawingTool;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const DRAWING_TOOLS: DrawingToolConfig[] = [
  { id: 'none', label: 'Cursor', icon: null, description: 'Normal cursor mode' },
  { id: 'marker', label: 'Marker', icon: <Pen size={20} />, description: 'Draw on the board or objects' },
  { id: 'eraser', label: 'Eraser', icon: <Eraser size={20} />, description: 'Erase drawings' },
  { id: 'ruler', label: 'Ruler', icon: <Ruler size={20} />, description: 'Measure distances' },
  { id: 'compass', label: 'Compass', icon: <Compass size={20} />, description: 'Draw circles/arcs' },
];

interface ToolsPanelProps {
  width?: number;
  height?: number;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const ToolsPanel: React.FC<ToolsPanelProps> = ({
  width = 280,
  height = 400,
  isCollapsed = false,
  onToggleCollapse
}) => {
  const { state, dispatch } = useGame();
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Token archetypes expanded state
  const [archetypesExpanded, setArchetypesExpanded] = useState(true);

  // Get all token archetypes
  const archetypes = Object.values(state.objects)
    .filter((obj): obj is TokenType => obj.type === ItemType.TOKEN_TYPE);

  // Handle tool selection
  const handleToolSelect = useCallback((tool: DrawingTool) => {
    setSelectedTool(tool);
    // Dispatch event to notify other components about tool change
    window.dispatchEvent(new CustomEvent('drawing-tool-changed', { detail: { tool } }));
  }, []);

  // Handle archetype drag start
  const handleArchetypeDragStart = useCallback((e: React.DragEvent, archetype: TokenType) => {
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'token-archetype',
      archetypeId: archetype.id
    }));
    e.dataTransfer.effectAllowed = 'copy';
  }, []);

  // Handle archetype settings
  const handleArchetypeSettings = useCallback((archetype: TokenType) => {
    dispatch({
      type: 'CREATE_WINDOW',
      payload: {
        windowType: WindowType.OBJECT_SETTINGS,
        title: 'Settings: ' + archetype.name,
        targetObjectId: archetype.id
      }
    });
  }, [dispatch]);

  if (isCollapsed) {
    return (
      <div
        ref={containerRef}
        className="fixed left-0 top-1/2 -translate-y-1/2 bg-slate-800 border border-slate-600 rounded-r-lg shadow-xl z-[9997]"
        style={{ width: '40px' }}
      >
        <button
          onClick={onToggleCollapse}
          className="w-full h-12 flex items-center justify-center text-gray-400 hover:text-white hover:bg-slate-700 transition-colors rounded-r-lg"
          title="Expand Tools"
        >
          <ChevronUp size={20} className="rotate-90" />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="fixed left-0 top-1/2 -translate-y-1/2 bg-slate-800 border border-slate-600 rounded-r-lg shadow-xl z-[9997] flex flex-col"
      style={{ width, maxHeight: '80vh' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
        <h3 className="text-sm font-bold text-white">Tools</h3>
        <button
          onClick={onToggleCollapse}
          className="p-1 text-gray-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
          title="Collapse"
        >
          <ChevronDown size={16} className="rotate-90" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* Drawing Tools Section */}
        <div className="p-3 border-b border-slate-700">
          <h4 className="text-xs font-bold text-gray-400 mb-2 uppercase">Drawing</h4>
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
                title={tool.description}
              >
                {tool.icon}
                <span className="text-[10px] mt-1">{tool.label}</span>
              </button>
            ))}
          </div>

          {/* Marker Settings (shown when marker is selected) */}
          {selectedTool === 'marker' && (
            <div className="space-y-2 mt-3 p-2 bg-slate-900 rounded">
              <div>
                <label className="block text-[10px] text-gray-400 mb-1">Color</label>
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
                <label className="block text-[10px] text-gray-400 mb-1">Thickness: {markerThickness}px</label>
                <input
                  type="range"
                  min="1"
                  max="20"
                  value={markerThickness}
                  onChange={(e) => setMarkerThickness(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>

        {/* Token Archetypes Section */}
        <div className="p-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold text-gray-400 uppercase">Tokens</h4>
            <button
              onClick={() => setArchetypesExpanded(!archetypesExpanded)}
              className="p-1 text-gray-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
            >
              {archetypesExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>

          {archetypesExpanded && (
            <div className="grid grid-cols-3 gap-2">
              {archetypes.length === 0 ? (
                <div className="col-span-3 text-center py-4 text-gray-500 text-xs">
                  No token archetypes.<br />
                  Add them from the main menu.
                </div>
              ) : (
                archetypes.map((archetype) => (
                  <div
                    key={archetype.id}
                    draggable
                    onDragStart={(e) => handleArchetypeDragStart(e, archetype)}
                    className="relative group aspect-square bg-slate-700 rounded-lg border-2 border-slate-600 hover:border-purple-500 cursor-grab active:cursor-grabbing transition-colors"
                    title={`${archetype.name}\nDrag to board to spawn a token`}
                  >
                    {/* Preview of the token */}
                    <div
                      className="w-full h-full flex items-center justify-center overflow-hidden rounded"
                      style={{
                        backgroundColor: archetype.defaultColor || archetype.color || '#ffffff',
                      }}
                    >
                      {archetype.defaultContent || archetype.content ? (
                        <img
                          src={archetype.defaultContent || archetype.content}
                          alt={archetype.name}
                          className="max-w-full max-h-full object-contain"
                          draggable={false}
                        />
                      ) : (
                        <div
                          className="flex items-center justify-center"
                          style={{
                            width: '60%',
                            height: '60%',
                            backgroundColor: archetype.defaultColor || archetype.color || '#ffffff',
                            borderRadius: archetype.shape === TokenShape.CIRCLE ? '50%' :
                                         archetype.shape === TokenShape.SQUARE ? '5px' :
                                         '0', // CIRCLE has 50%, SQUARE has 5px, others have 0
                            clipPath: archetype.shape === TokenShape.HEX ? 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' :
                                         archetype.shape === TokenShape.TRIANGLE ? 'polygon(50% 0%, 0% 100%, 100% 100%)' :
                                         undefined,
                          }}
                        />
                      )}
                    </div>

                    {/* Settings button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleArchetypeSettings(archetype);
                      }}
                      className="absolute top-0.5 right-0.5 p-1 bg-slate-800 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Settings size={10} className="text-gray-400" />
                    </button>

                    {/* Name label */}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] truncate px-1 py-0.5 rounded-b">
                      {archetype.name}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
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

    window.addEventListener('marker-settings-changed', handleMarkerChange);
    return () => window.removeEventListener('marker-settings-changed', handleMarkerChange);
  }, []);

  return settings;
}
