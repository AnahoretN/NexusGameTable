import { t as translate, Locale } from '../utils/translations';
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useGame } from '../store/GameContext';
import { ItemType, TableObject, TokenType, TokenShape, WindowType, AppLanguage } from '../types';
import { Pen, Eraser, Ruler, Compass, ChevronDown, ChevronUp, Settings } from 'lucide-react';
import { SvgTokenShape } from './SvgTokenShape';

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

interface ToolsPanelProps {
  width?: number;
  height?: number;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  language?: AppLanguage;
}

export const ToolsPanel: React.FC<ToolsPanelProps> = ({
  width = 280,
  height = 400,
  isCollapsed = false,
  onToggleCollapse,
  language = 'en'
}) => {
  const { state, dispatch, isHost } = useGame();
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

  // Track drag state to distinguish click from drag
  const dragStartTimeRef = useRef<number>(0);
  const dragStartPositionRef = useRef<{ x: number; y: number } | null>(null);

  // Handle archetype click - add to cursor slot
  const handleArchetypeClick = useCallback((archetype: TokenType, clientX: number, clientY: number) => {
    // Dispatch event to Tabletop to handle adding token to cursor slot
    window.dispatchEvent(new CustomEvent('add-token-to-cursor-slot', {
      detail: { archetypeId: archetype.id, clientX, clientY }
    }));
  }, []);

  // Track if we're currently dragging a token type to place it
  const isDraggingTokenRef = useRef<boolean>(false);
  const dragArchetypeIdRef = useRef<string | null>(null);
  const dragArchetypeCardRef = useRef<HTMLElement | null>(null);

  // Set up capture phase listener for mousedown to set flag BEFORE Tabletop's handleGlobalClick
  useEffect(() => {
    const handleMouseDownCapture = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Find if we're clicking on a token archetype card
      const archetypeCard = target.closest('[data-archetype-card]') as HTMLElement;
      // Check if clicking on settings button - don't add token in that case
      const settingsButton = target.closest('[data-archetype-settings]') as HTMLElement;
      if (archetypeCard && !settingsButton) {
        archetypeCard.dataset.isAddingToken = 'true';
        dragStartTimeRef.current = Date.now();
        dragStartPositionRef.current = { x: e.clientX, y: e.clientY };
        // Store reference to the card that was clicked
        dragArchetypeCardRef.current = archetypeCard;
      }
    };

    const handleMouseMoveCapture = (e: MouseEvent) => {
      // Check if we're dragging (moved more than 3px)
      if (dragStartTimeRef.current > 0 && dragStartPositionRef.current && !isDraggingTokenRef.current) {
        const dragDistance = Math.sqrt(
          Math.pow(e.clientX - dragStartPositionRef.current.x, 2) +
          Math.pow(e.clientY - dragStartPositionRef.current.y, 2)
        );
        // If moved more than 3px, consider it a drag and add token to cursor slot
        if (dragDistance > 3) {
          // Use the stored card reference instead of looking it up again
          const archetypeCard = dragArchetypeCardRef.current;
          if (archetypeCard) {
            const archetypeId = archetypeCard.dataset.archetypeId;
            if (archetypeId) {
              const archetype = state.objects[archetypeId] as TokenType;
              if (archetype && archetype.type === ItemType.TOKEN_TYPE) {
                isDraggingTokenRef.current = true;
                dragArchetypeIdRef.current = archetypeId;
                // Add token to cursor slot immediately
                handleArchetypeClick(archetype, e.clientX, e.clientY);
              }
            }
          }
        }
      }
    };

    const handleMouseUpCapture = (e: MouseEvent) => {
      // Check if we were dragging a token
      if (isDraggingTokenRef.current) {
        // Drop the token at current position
        isDraggingTokenRef.current = false;
        const archetypeId = dragArchetypeIdRef.current;
        dragArchetypeIdRef.current = null;
        // Dispatch event to drop cursor slot at this position
        window.dispatchEvent(new CustomEvent('drop-cursor-slot-at-position', {
          detail: { clientX: e.clientX, clientY: e.clientY }
        }));
        // Clear any adding token flags
        const card = dragArchetypeCardRef.current;
        if (card) {
          delete card.dataset.isAddingToken;
        }
        dragStartTimeRef.current = 0;
        dragStartPositionRef.current = null;
        dragArchetypeCardRef.current = null;
        return;
      }

      // Normal click handling (not a drag)
      const archetypeCard = dragArchetypeCardRef.current;
      if (archetypeCard && archetypeCard.dataset.isAddingToken) {
        const dragDuration = Date.now() - dragStartTimeRef.current;
        const dragDistance = dragStartPositionRef.current
          ? Math.sqrt(
              Math.pow(e.clientX - dragStartPositionRef.current.x, 2) +
              Math.pow(e.clientY - dragStartPositionRef.current.y, 2)
            )
          : 0;

        // Clear the adding token flag
        delete archetypeCard.dataset.isAddingToken;

        // If it was a quick click with minimal movement, treat as click (add to slot without dropping)
        if (dragDuration < 200 && dragDistance < 3) {
          const archetypeId = archetypeCard.dataset.archetypeId;
          if (archetypeId) {
            const archetype = state.objects[archetypeId] as TokenType;
            if (archetype && archetype.type === ItemType.TOKEN_TYPE) {
              handleArchetypeClick(archetype, e.clientX, e.clientY);
            }
          }
        }
      }

      // Reset drag tracking
      dragStartTimeRef.current = 0;
      dragStartPositionRef.current = null;
      dragArchetypeCardRef.current = null;
    };

    // Use capture phase to ensure this runs before Tabletop's handleGlobalClick
    document.addEventListener('mousedown', handleMouseDownCapture, { capture: true });
    document.addEventListener('mousemove', handleMouseMoveCapture, { capture: true });
    document.addEventListener('mouseup', handleMouseUpCapture, { capture: true });

    return () => {
      document.removeEventListener('mousedown', handleMouseDownCapture, { capture: true } as any);
      document.removeEventListener('mousemove', handleMouseMoveCapture, { capture: true } as any);
      document.removeEventListener('mouseup', handleMouseUpCapture, { capture: true } as any);
    };
  }, [state.objects, handleArchetypeClick]);

  // Handle archetype settings
  const handleArchetypeSettings = useCallback((archetype: TokenType) => {
    // Check permissions - GM always has access, non-GM needs configureObjects permission
    const canConfigure = isHost || state.playerPermissions.configureObjects;
    if (!canConfigure) return; // Silently do nothing if no permission

    dispatch({
      type: 'CREATE_WINDOW',
      payload: {
        windowType: WindowType.OBJECT_SETTINGS,
        title: 'Settings: ' + archetype.name,
        targetObjectId: archetype.id
      }
    });
  }, [dispatch, isHost, state.playerPermissions.configureObjects]);

  if (isCollapsed) {
    return (
      <div
        ref={containerRef}
        data-tools-panel
        className="fixed left-0 top-1/2 -translate-y-1/2 bg-slate-800 border border-slate-600 rounded-r-lg shadow-xl z-[9997]"
        style={{ width: '40px' }}
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
      className="fixed left-0 top-1/2 -translate-y-1/2 bg-slate-800 border border-slate-600 rounded-r-lg shadow-xl z-[9997] flex flex-col"
      style={{ width, maxHeight: '80vh' }}
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

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* Drawing Tools Section */}
        <div className="p-3 border-b border-slate-700">
          <h4 className="text-xs font-bold text-gray-400 mb-2 uppercase">{translate('Drawing', language as Locale)}</h4>
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

        {/* Token Archetypes Section */}
        <div className="p-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold text-gray-400 uppercase">{translate('Tokens', language as Locale)}</h4>
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
                  {translate('No token archetypes.', language as Locale)}<br />
                  {translate('Add them from the main menu.', language as Locale)}
                </div>
              ) : (
                archetypes.map((archetype) => {
                  // Calculate aspect ratio based on defaultSize or fall back to 1:1
                  const aspectRatio = archetype.defaultSize
                    ? archetype.defaultSize.width / archetype.defaultSize.height
                    : 1;

                  // Calculate size to fit within the card while maintaining aspect ratio
                  const baseSize = 70; // Base percentage
                  const tokenWidth = aspectRatio >= 1 ? baseSize : baseSize * aspectRatio;
                  const tokenHeight = aspectRatio <= 1 ? baseSize : baseSize / aspectRatio;

                  return (
                  <div
                    key={archetype.id}
                    data-archetype-card
                    data-archetype-id={archetype.id}
                    className="relative group aspect-square bg-slate-700 rounded-lg border-2 border-slate-600 hover:border-purple-500 cursor-pointer transition-colors"
                    title={`${archetype.name}\n${translate('Click to add to cursor slot', language as Locale)}`}
                  >
                    {/* Preview of the token using SvgTokenShape */}
                    <div className="w-full h-full flex items-center justify-center overflow-hidden rounded">
                      <SvgTokenShape
                        shape={archetype.shape || TokenShape.SQUARE}
                        width={tokenWidth}
                        height={tokenHeight}
                        color={archetype.color || '#ffffff'}
                        content={archetype.content}
                        borderColor={(archetype as any).borderColor || '#ffffff'}
                        borderWidth={(archetype as any).borderWidth ?? 2}
                        opacity={archetype.opacity ?? 100}
                        borderOpacity={archetype.borderOpacity ?? 100}
                        className="drop-shadow-md"
                        style={{ width: `${tokenWidth}%`, height: `${tokenHeight}%` }}
                      />
                    </div>

                    {/* Settings button */}
                    <button
                      data-archetype-settings
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
                  );
                })
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
