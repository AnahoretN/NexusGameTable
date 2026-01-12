import React, { useRef, useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { PanelObject, WindowObject, ItemType, PanelType, WindowType } from '../types';
import { X, Minus, Plus, Eye, EyeOff, Settings, Maximize2, Check, Pin } from 'lucide-react';
import { HandPanel } from './HandPanel';
import { MainMenuContent } from './MainMenuContent';
import { ObjectSettingsModal } from './ObjectSettingsModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { TopDeckModal } from './TopDeckModal';
import { useGame } from '../store/GameContext';

const GAME_NAME = 'Nexus Game Table';
const GAME_VERSION = 'v0.1.0';

interface UIObjectRendererProps {
  uiObject: PanelObject | WindowObject;
  isDragging: boolean;
  onMouseDown: (e: React.MouseEvent, id: string) => void;
  offset?: { x: number; y: number };
  zoom?: number;
}

export const UIObjectRenderer: React.FC<UIObjectRendererProps> = ({
  uiObject,
  isDragging,
  onMouseDown,
  offset = { x: 0, y: 0 },
  zoom = 1
}) => {
  const { dispatch, state } = useGame();
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Check if this is a main menu panel (must be before useState that uses it)
  const isMainMenu = uiObject.type === ItemType.PANEL && (uiObject as PanelObject).panelType === PanelType.MAIN_MENU;

  // Track if this panel is currently being resized
  const [isResizing, setIsResizing] = useState(false);

  // Main menu specific state
  const [showGameSettings, setShowGameSettings] = useState(false);

  const minimized = uiObject.minimized || false;
  const visible = uiObject.visible !== false;

  if (!visible) return null;

  // Can resize non-main-menu panels when not minimized
  const canResize = !isMainMenu && !minimized;

  const handleClose = useCallback(() => {
    dispatch({ type: 'CLOSE_UI_OBJECT', payload: { id: uiObject.id } });
  }, [dispatch, uiObject.id]);

  const isCollapsed = uiObject.width === 200 && uiObject.height === 32;
  // For main menu, use minimized flag; for other panels, use size-based check
  const shouldExpand = isMainMenu ? minimized : isCollapsed;
  const dualPosition = uiObject.type === ItemType.PANEL && (uiObject as PanelObject).dualPosition;

  const handleToggleCollapse = useCallback((e?: React.MouseEvent) => {
    // Toggle between collapsed (200px wide, title only) and full size

    if (shouldExpand) {
      // Currently collapsed - expand to saved state or default
      const restoreState = uiObject.expandedState;
      dispatch({
        type: 'UPDATE_OBJECT',
        payload: {
          id: uiObject.id,
          minimized: false,
          collapsedState: {
            x: uiObject.x,
            y: uiObject.y,
            width: uiObject.width,
            height: uiObject.height,
          },
          ...(dualPosition && restoreState ? {
            x: restoreState.x,
            y: restoreState.y,
            width: restoreState.width,
            height: restoreState.height,
          } : dualPosition ? {
            width: 300,
            height: 400,
          } : {
            // In single position mode, restore expanded dimensions but keep position
            width: restoreState?.width ?? 300,
            height: restoreState?.height ?? 400,
          })
        }
      });
    } else {
      // Currently expanded - collapse to 200px and minimize
      dispatch({
        type: 'UPDATE_OBJECT',
        payload: {
          id: uiObject.id,
          minimized: true,
          expandedState: {
            x: uiObject.x,
            y: uiObject.y,
            width: uiObject.width,
            height: uiObject.height,
          },
          ...(dualPosition ? {
            // In dual position mode, restore collapsed position
            ...(uiObject.collapsedState ? {
              x: uiObject.collapsedState.x,
              y: uiObject.collapsedState.y,
            } : {})
          } : {}),
          width: 200,
          height: 32, // Title bar height
        }
      });
    }
  }, [dispatch, uiObject, shouldExpand, dualPosition, isMainMenu]);

  // Toggle pin to viewport - using GameContext pinning system
  const handleTogglePin = useCallback(() => {
    const isPinned = uiObject.isPinnedToViewport === true;

    if (isPinned) {
      // Unpin
      dispatch({
        type: 'UNPIN_FROM_VIEWPORT',
        payload: { id: uiObject.id }
      });
    } else {
      // Pin - calculate current screen position
      // For UI panels/windows, we need to account for scroll and offset
      const scrollContainer = document.querySelector('[data-tabletop="true"]') as HTMLElement;
      const scrollLeft = scrollContainer?.scrollLeft || 0;
      const scrollTop = scrollContainer?.scrollTop || 0;

      // Screen position = panel position - scroll
      const screenX = uiObject.x - scrollLeft;
      const screenY = uiObject.y - scrollTop;

      dispatch({
        type: 'PIN_TO_VIEWPORT',
        payload: {
          id: uiObject.id,
          screenX,
          screenY
        }
      });
    }
  }, [dispatch, uiObject]);

  const handleHide = useCallback(() => {
    // Hide panel instead of closing it
    dispatch({ type: 'UPDATE_OBJECT', payload: { id: uiObject.id, visible: false } });
  }, [dispatch, uiObject.id]);

  const handleOpenSettings = useCallback(() => {
    // Check if settings window is already open
    const settingsWindowId = `settings-${uiObject.id}`;
    const existingWindow = state.objects[settingsWindowId];
    if (existingWindow) {
      // Already open, just close it
      dispatch({ type: 'CLOSE_UI_OBJECT', payload: { id: settingsWindowId } });
      return;
    }

    // Open settings window - uses CREATE_WINDOW which routes to PanelSettingsModal for panels
    dispatch({
      type: 'CREATE_WINDOW',
      payload: {
        windowType: 'OBJECT_SETTINGS',
        title: 'Settings',
        targetObjectId: uiObject.id,
        x: uiObject.x + 50,
        y: uiObject.y + 50,
      }
    });
  }, [dispatch, uiObject, state.objects]);

  const handleBringToFront = useCallback(() => {
    // Bring to front by setting high z-index
    // UI panels max at 9900, dragging cards are at 9999 (always above)
    dispatch({
      type: 'UPDATE_OBJECT',
      payload: { id: uiObject.id, zIndex: 9900 }
    });
  }, [dispatch, uiObject.id]);

  // Track resize manually to avoid ResizeObserver issues
  useEffect(() => {
    if (!canResize || !containerRef.current) return;

    const container = containerRef.current;
    let resizing = false;
    let startX = 0;
    let startY = 0;
    let startWidth = 0;
    let startHeight = 0;

    const handleMouseDown = (e: MouseEvent) => {
      // Check if clicking on the resize handle (bottom-right corner)
      const rect = container.getBoundingClientRect();
      const handleSize = 20;

      // Only start resize if near bottom-right corner
      if (e.clientX >= rect.right - handleSize &&
          e.clientY >= rect.bottom - handleSize &&
          e.clientX <= rect.right + 10 &&
          e.clientY <= rect.bottom + 10) {
        resizing = true;
        setIsResizing(true);
        startX = e.clientX;
        startY = e.clientY;
        startWidth = rect.width;
        startHeight = rect.height;
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizing) return;

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      const minSize = 200;

      const newWidth = Math.max(minSize, startWidth + deltaX);
      const newHeight = Math.max(minSize, startHeight + deltaY);

      // Update container style directly for smooth resize
      if (container) {
        container.style.width = `${newWidth}px`;
        container.style.height = `${newHeight}px`;
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!resizing) return;

      const rect = container.getBoundingClientRect();
      const newWidth = Math.round(rect.width);
      const newHeight = Math.round(rect.height);

      // Only update store if size actually changed
      if (Math.abs(newWidth - uiObject.width) > 5 || Math.abs(newHeight - uiObject.height) > 5) {
        dispatch({
          type: 'UPDATE_OBJECT',
          payload: { id: uiObject.id, width: newWidth, height: newHeight }
        });
      }

      resizing = false;
      setIsResizing(false);
    };

    container.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      container.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      // Clean up resize state on unmount
      if (resizing) setIsResizing(false);
    };
  }, [canResize, uiObject.id, uiObject.width, uiObject.height, dispatch]);

  // UI objects use screen coordinates, so we need to compensate for the world transform
  // The parent container has: translate(offset.x, offset.y) scale(zoom)
  // We need to reverse this for UI objects to keep them at screen positions
  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    // Convert screen coords to world coords: subtract offset, divide by zoom
    left: (uiObject.x - offset.x) / zoom,
    top: (uiObject.y - offset.y) / zoom,
    width: uiObject.width,
    height: minimized ? 32 : uiObject.height,
    // Reverse the scale and apply rotation
    transform: `rotate(${uiObject.rotation}deg) scale(${1 / zoom})`,
    transformOrigin: 'top left',
    zIndex: uiObject.zIndex || 1000,
    pointerEvents: 'auto',
    // Enable native CSS resize
    resize: canResize ? 'both' : 'none',
    overflow: canResize ? 'hidden' : 'hidden',
  };

  const headerBg = uiObject.type === ItemType.WINDOW
    ? 'bg-purple-800'
    : 'bg-slate-700';

  const borderColor = isDragging
    ? 'border-purple-400'
    : 'border-slate-600';

  return (
    <div
      ref={containerRef}
      data-ui-object={uiObject.id}
      style={containerStyle}
      className={`bg-slate-900 border-2 ${borderColor} rounded-lg shadow-2xl flex flex-col`}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {/* Header / Title Bar */}
      {isMainMenu ? (
        // Main Menu header - always shown, but different when minimized
        <div
          className={`${headerBg} px-2 py-1 flex items-center select-none flex-shrink-0`}
          style={{ height: 32, position: 'relative' }}
        >
          {/* Left side - Game name and version */}
          <div
            className="flex items-center gap-2 truncate cursor-move"
            style={{ flex: 1, minWidth: 0, pointerEvents: 'auto' }}
            onMouseDown={(e) => {
              e.stopPropagation();
              handleBringToFront();
              onMouseDown(e, uiObject.id);
            }}
          >
            <span className="text-sm font-bold text-white truncate">{GAME_NAME}</span>
            {!minimized && (
              <span className="text-xs text-gray-500 flex-shrink-0">{GAME_VERSION}</span>
            )}
          </div>
          {/* Right side - Control buttons */}
          <div className="flex items-center gap-0.5 flex-shrink-0 ml-1" style={{ pointerEvents: 'auto' }}>
            {!minimized && (
              <>
                {/* Settings button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowGameSettings(true);
                  }}
                  className="p-0.5 hover:bg-white/20 rounded transition-colors"
                  title="Settings"
                >
                  <Settings size={14} className="text-white" />
                </button>
                {/* Pin to screen button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTogglePin();
                  }}
                  className={`p-0.5 hover:bg-white/20 rounded transition-colors ${uiObject.isPinnedToViewport ? 'bg-purple-600' : ''}`}
                  title={uiObject.isPinnedToViewport ? 'Unpin from screen' : 'Pin to screen'}
                >
                  <Pin size={14} className="text-white" />
                </button>
              </>
            )}
            {/* Minimize/Expand button */}
            {minimized ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleCollapse();
                }}
                className="p-0.5 hover:bg-white/20 rounded transition-colors"
                title="Expand"
              >
                <Plus size={14} className="text-white" />
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleCollapse();
                }}
                className="p-0.5 hover:bg-white/20 rounded transition-colors"
                title="Minimize"
              >
                <Minus size={14} className="text-white" />
              </button>
            )}
          </div>
        </div>
      ) : (
        // Other panels header
        <div
          className={`${headerBg} px-2 py-1 flex items-center select-none flex-shrink-0`}
          style={{ height: 32, position: 'relative' }}
        >
          {/* Drag handle - only this area triggers drag */}
          <div
            className="text-sm font-semibold text-white truncate cursor-move"
            style={{ flex: 1, minWidth: 0, pointerEvents: 'auto' }}
            onMouseDown={(e) => {
              e.stopPropagation();
              handleBringToFront();
              onMouseDown(e, uiObject.id);
            }}
          >
            {uiObject.title}
          </div>
          {/* Buttons container - separate from drag handle */}
          <div className="flex items-center gap-0.5 flex-shrink-0 ml-1" style={{ pointerEvents: 'auto' }}>
            {uiObject.type === ItemType.PANEL ? (
              <>
                {/* Settings button - only shown when expanded */}
                {!isCollapsed && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenSettings();
                    }}
                    className="p-0.5 hover:bg-white/20 rounded transition-colors"
                    title="Settings"
                  >
                    <Settings size={14} className="text-white" />
                  </button>
                )}
                {/* Pin to viewport button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTogglePin();
                  }}
                  className={`p-0.5 rounded transition-colors ${uiObject.isPinnedToViewport ? 'bg-purple-600 hover:bg-purple-500' : 'hover:bg-white/20'}`}
                  title={uiObject.isPinnedToViewport ? 'Unpin from Screen' : 'Pin to Screen'}
                >
                  <Pin size={14} className="text-white" />
                </button>
                {/* Collapse/Expand button - minimizes and collapses to 200px */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleCollapse();
                  }}
                  className="p-0.5 hover:bg-white/20 rounded transition-colors"
                  title={isCollapsed ? 'Expand' : 'Collapse'}
                >
                  <Minus size={14} className="text-white" />
                </button>
                {/* Hide button (eye icon) - only shown when expanded */}
                {!isCollapsed && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleHide();
                    }}
                    className="p-0.5 hover:bg-white/20 rounded transition-colors"
                    title="Hide"
                  >
                    <EyeOff size={14} className="text-white" />
                  </button>
                )}
              </>
            ) : (
              // Windows have pin and close buttons
              <>
                {/* Pin to viewport button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTogglePin();
                  }}
                  className={`p-0.5 rounded transition-colors ${uiObject.isPinnedToViewport ? 'bg-purple-600 hover:bg-purple-500' : 'hover:bg-white/20'}`}
                  title={uiObject.isPinnedToViewport ? 'Unpin from Screen' : 'Pin to Screen'}
                >
                  <Pin size={14} className="text-white" />
                </button>
                {/* Close button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClose();
                  }}
                  className="p-0.5 hover:bg-red-500 rounded transition-colors"
                  title="Close"
                >
                  <X size={14} className="text-white" />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      {!minimized && (
        <div ref={contentRef} className="flex-1 overflow-hidden">
          {isResizing ? (
            // Show resize indicator during resize
            <div className="h-full flex items-center justify-center text-slate-400">
              <div className="text-center">
                <div className="text-4xl mb-2">⤡</div>
                <div className="text-sm">Resizing...</div>
              </div>
            </div>
          ) : (
            <>
              {uiObject.type === ItemType.PANEL && (
                <PanelContent panel={uiObject as PanelObject} />
              )}
              {uiObject.type === ItemType.WINDOW && (
                <WindowContent window={uiObject as WindowObject} />
              )}
            </>
          )}
        </div>
      )}

      {/* Game Settings Modal for Main Menu */}
      {isMainMenu && showGameSettings && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70" onClick={() => setShowGameSettings(false)}>
          <div className="bg-slate-800 rounded-lg shadow-xl w-[400px] border border-slate-600" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b border-slate-700">
              <h3 className="text-lg font-bold text-white">Game Settings</h3>
              <button onClick={() => setShowGameSettings(false)} className="text-gray-400 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="text-sm text-gray-400">
                <p>{GAME_NAME} {GAME_VERSION}</p>
                <p className="mt-2">Game settings will be available here.</p>
              </div>
            </div>
            <div className="flex justify-end p-4 border-t border-slate-700">
              <button
                onClick={() => setShowGameSettings(false)}
                className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-500 text-white rounded"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

// Panel content renderer
const PanelContent: React.FC<{ panel: PanelObject }> = ({ panel }) => {
  switch (panel.panelType) {
    case PanelType.MAIN_MENU:
      // Render the Main Menu content inside the panel (without outer wrapper)
      return <MainMenuContent width={panel.width} />;
    case PanelType.HAND:
      return <HandPanelWithDragDetection panel={panel} />;
    case PanelType.TABLEAU:
      return <TableauPanelContent panel={panel} />;
    case PanelType.PULL:
      return <PullPanelContent panel={panel} />;
    // TODO: Add other panel types
    // case PanelType.CHAT:
    //   return <ChatPanel />;
    // case PanelType.PLAYERS:
    //   return <PlayersPanel />;
    // case PanelType.CREATE:
    //   return <CreatePanel />;
    default:
      return (
        <div className="p-4 text-slate-400 text-sm">
          Panel: {panel.panelType}
        </div>
      );
  }
};

// HandPanel with drag detection for standalone panels
const HandPanelWithDragDetection: React.FC<{ panel: PanelObject }> = ({ panel }) => {
  const [isDragTarget, setIsDragTarget] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleDragMove = (e: Event) => {
      const customEvent = e as CustomEvent<{
        cardId: string | null;
        source: 'hand' | 'tabletop' | null;
        x: number;
        y: number;
      }>;

      if (customEvent.detail.source !== 'tabletop') return;

      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const x = customEvent.detail.x;
      const y = customEvent.detail.y;

      const isOver = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
      setIsDragTarget(isOver);
    };

    const handleDragEnd = () => {
      setIsDragTarget(false);
    };

    window.addEventListener('card-drag-move', handleDragMove);
    window.addEventListener('card-drag-end', handleDragEnd);

    return () => {
      window.removeEventListener('card-drag-move', handleDragMove);
      window.removeEventListener('card-drag-end', handleDragEnd);
    };
  }, []);

  const isCollapsed = panel.width === 200 && panel.height === 40;

  return (
    <div ref={containerRef} className="h-full">
      <HandPanel width={panel.width} isDragTarget={isDragTarget} isCollapsed={isCollapsed} />
    </div>
  );
};

// Tableau panel content
const TableauPanelContent: React.FC<{ panel: PanelObject }> = ({ panel }) => {
  const { state } = useGame();

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 text-slate-300 text-sm">
        Tableau Panel
      </div>
    </div>
  );
};

// Pull panel content
const PullPanelContent: React.FC<{ panel: PanelObject }> = ({ panel }) => {
  return (
    <div className="h-full flex flex-col">
      <div className="p-4 text-slate-300 text-sm">
        Pull Panel
      </div>
    </div>
  );
};

// Panel settings modal component
type PanelSettingsTab = 'general';

const PanelSettingsModal: React.FC<{
  panel: PanelObject;
  onClose: () => void;
}> = ({ panel, onClose }) => {
  const { dispatch } = useGame();
  const [activeTab, setActiveTab] = React.useState<PanelSettingsTab>('general');
  const [title, setTitle] = React.useState(panel.title);
  const [x, setX] = React.useState(panel.x);
  const [y, setY] = React.useState(panel.y);
  const [width, setWidth] = React.useState(panel.width);
  const [height, setHeight] = React.useState(panel.height);
  const [rotation, setRotation] = React.useState(panel.rotation);
  const [dualPosition, setDualPosition] = React.useState(panel.dualPosition || false);
  const [zIndex, setZIndex] = React.useState(panel.zIndex || 1000);

  const handleSave = () => {
    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: panel.id,
        title,
        x,
        y,
        width,
        height,
        rotation,
        dualPosition,
        zIndex
      }
    });
    onClose();
  };

  const modalContent = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70">
      <div className="bg-slate-800 rounded-lg shadow-xl w-[575px] border border-slate-600 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-slate-700">
          <h3 className="text-lg font-bold text-white">Settings: {panel.title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-700">
          <button
            onClick={() => setActiveTab('general')}
            className={`flex-1 py-3 px-3 flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
              activeTab === 'general'
                ? 'bg-slate-700 text-white border-b-2 border-purple-500'
                : 'text-gray-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <Settings size={16} /> General
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* Name */}
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1">Name</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
            />
          </div>

          {/* Position */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">X Position</label>
              <input
                type="number"
                value={Math.round(x)}
                onChange={e => setX(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">Y Position</label>
              <input
                type="number"
                value={Math.round(y)}
                onChange={e => setY(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
              />
            </div>
          </div>

          {/* Size */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">Width</label>
              <input
                type="number"
                value={width}
                onChange={e => setWidth(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">Height</label>
              <input
                type="number"
                value={height}
                onChange={e => setHeight(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
              />
            </div>
          </div>

          {/* Rotation */}
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1">Rotation (degrees)</label>
            <input
              type="number"
              value={rotation}
              onChange={e => setRotation(Number(e.target.value))}
              className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
            />
          </div>

          {/* Z-Index */}
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1">Z-Index (layer order)</label>
            <input
              type="number"
              value={zIndex}
              onChange={e => setZIndex(Number(e.target.value))}
              className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
            />
          </div>

          {/* Dual Position Toggle */}
          <div className="flex items-center justify-between bg-slate-900 rounded px-3 py-2 border border-slate-700">
            <label className="text-xs text-gray-300 flex items-center gap-2">
              <Maximize2 size={12} />
              Dual Position Mode
            </label>
            <button
              onClick={() => setDualPosition(!dualPosition)}
              className={`w-10 h-5 rounded-full transition-colors ${
                dualPosition ? 'bg-green-600' : 'bg-slate-700'
              }`}
            >
              <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                dualPosition ? 'translate-x-5' : 'translate-x-0.5'
              }`} />
            </button>
          </div>
          <p className="text-[10px] text-gray-500 -mt-2">
            When enabled, panel remembers separate positions for collapsed and expanded states
          </p>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-300 hover:bg-slate-700 rounded"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-500 text-white rounded flex items-center gap-2"
          >
            <Check size={16} /> Save Changes
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

// Window content renderer
const WindowContent: React.FC<{ window: WindowObject }> = ({ window: windowObj }) => {
  const { state, dispatch } = useGame();

  const handleClose = () => {
    dispatch({ type: 'CLOSE_UI_OBJECT', payload: { id: windowObj.id } });
  };

  switch (windowObj.windowType) {
    case WindowType.OBJECT_SETTINGS:
      const targetObj = windowObj.targetObjectId ? state.objects[windowObj.targetObjectId] : null;
      // Panels are stored in state.objects, not state.uiObjects
      const targetPanel = targetObj?.type === ItemType.PANEL ? targetObj as PanelObject : null;

      if (targetPanel) {
        // Show panel settings for panels
        return <PanelSettingsModal panel={targetPanel} onClose={handleClose} />;
      }

      if (!targetObj) {
        // Object not found, close the window
        return (
          <div className="p-4 text-slate-400 text-sm">
            Object not found
            <button onClick={handleClose} className="ml-2 text-red-400 hover:text-red-300">Close</button>
          </div>
        );
      }
      return (
        <ObjectSettingsModal
          object={targetObj}
          onClose={handleClose}
          onSave={(updatedObj) => {
            dispatch({ type: 'UPDATE_OBJECT', payload: updatedObj });
            handleClose();
          }}
        />
      );
    case WindowType.DELETE_CONFIRM:
      const deleteObj = windowObj.targetObjectId ? state.objects[windowObj.targetObjectId] : null;
      return deleteObj ? (
        <DeleteConfirmModal
          objectName={deleteObj.name}
          onConfirm={() => {
            dispatch({ type: 'DELETE_OBJECT', payload: { id: deleteObj.id }});
            handleClose();
          }}
          onCancel={handleClose}
        />
      ) : null;
    case WindowType.TOP_DECK:
      const deck = windowObj.targetObjectId ? state.objects[windowObj.targetObjectId] : null;
      return deck && deck.type === 'DECK' ? (
        <TopDeckModal
          deck={deck}
          onClose={handleClose}
        />
      ) : null;
    default:
      return (
        <div className="p-4 text-slate-400 text-sm">
          Window: {windowObj.windowType}
        </div>
      );
  }
};
