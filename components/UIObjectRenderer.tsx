import React, { useRef, useCallback, useEffect, useState } from 'react';
import { PanelObject, WindowObject, ItemType, PanelType, WindowType } from '../types';
import { X, Minus } from 'lucide-react';
import { HandPanel } from './HandPanel';
import { MainMenuContent } from './MainMenuContent';
import { ObjectSettingsModal } from './ObjectSettingsModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { TopDeckModal } from './TopDeckModal';
import { useGame } from '../store/GameContext';

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
  const { dispatch } = useGame();
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Track if this panel is currently being resized
  const [isResizing, setIsResizing] = useState(false);

  const minimized = uiObject.minimized || false;
  const visible = uiObject.visible !== false;

  if (!visible) return null;

  // Check if this is a main menu panel (no header, content has its own tabs)
  const isMainMenu = uiObject.type === ItemType.PANEL && (uiObject as PanelObject).panelType === PanelType.MAIN_MENU;

  // Can resize non-main-menu panels when not minimized
  const canResize = !isMainMenu && !minimized;

  const handleClose = useCallback(() => {
    dispatch({ type: 'CLOSE_UI_OBJECT', payload: { id: uiObject.id } });
  }, [dispatch, uiObject.id]);

  const handleToggleMinimize = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch({ type: 'TOGGLE_MINIMIZE', payload: { id: uiObject.id } });
  }, [dispatch, uiObject.id]);

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
    height: minimized ? 40 : uiObject.height,
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
      onMouseDown={(e) => {
        e.stopPropagation();
        handleBringToFront();
        onMouseDown(e, uiObject.id);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {/* Header / Title Bar - not shown for Main Menu */}
      {!isMainMenu && (
        <div
          className={`${headerBg} px-3 py-2 flex items-center justify-between cursor-move select-none flex-shrink-0`}
          style={{ height: 40 }}
        >
          <span className="text-sm font-semibold text-white truncate flex-1">
            {uiObject.title}
          </span>
          <div className="flex items-center gap-1">
            {uiObject.type === ItemType.PANEL && (
              <button
                onClick={handleToggleMinimize}
                className="p-1 hover:bg-white/20 rounded transition-colors"
                title={minimized ? 'Expand' : 'Minimize'}
              >
                <Minus size={14} className="text-white" />
              </button>
            )}
            <button
              onClick={handleClose}
              className="p-1 hover:bg-red-500 rounded transition-colors"
              title="Close"
            >
              <X size={14} className="text-white" />
            </button>
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

  return (
    <div ref={containerRef} className="h-full">
      <HandPanel width={panel.width} isDragTarget={isDragTarget} />
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

// Window content renderer
const WindowContent: React.FC<{ window: WindowObject }> = ({ window: windowObj }) => {
  const { state, dispatch } = useGame();

  const handleClose = () => {
    dispatch({ type: 'CLOSE_UI_OBJECT', payload: { id: windowObj.id } });
  };

  switch (windowObj.windowType) {
    case WindowType.OBJECT_SETTINGS:
      const targetObj = windowObj.targetObjectId ? state.objects[windowObj.targetObjectId] : null;
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
