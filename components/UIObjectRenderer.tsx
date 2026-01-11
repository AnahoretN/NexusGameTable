import React, { useRef, useState, useCallback } from 'react';
import { PanelObject, WindowObject, ItemType, PanelType, WindowType } from '../types';
import { X, Minus, GripHorizontal } from 'lucide-react';
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

export const UIObjectRenderer: React.FC<UIObjectRendererProps> = ({ uiObject, isDragging, onMouseDown, offset = { x: 0, y: 0 }, zoom = 1 }) => {
  const { dispatch } = useGame();
  const [isResizing, setIsResizing] = useState(false);
  const resizeHandleRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => {
    dispatch({ type: 'CLOSE_UI_OBJECT', payload: { id: uiObject.id } });
  }, [dispatch, uiObject.id]);

  const handleToggleMinimize = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch({ type: 'TOGGLE_MINIMIZE', payload: { id: uiObject.id } });
  }, [dispatch, uiObject.id]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsResizing(true);
  }, []);

  const handleBringToFront = useCallback(() => {
    // Bring to front by setting high z-index
    // UI panels max at 9900, dragging cards are at 9999 (always above)
    dispatch({
      type: 'UPDATE_OBJECT',
      payload: { id: uiObject.id, zIndex: 9900 }
    });
  }, [dispatch, uiObject.id]);

  const minimized = uiObject.minimized || false;
  const visible = uiObject.visible !== false;

  if (!visible) return null;

  // Check if this is a main menu panel (no header, content has its own tabs)
  const isMainMenu = uiObject.type === ItemType.PANEL && (uiObject as PanelObject).panelType === PanelType.MAIN_MENU;

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
  };

  const headerBg = uiObject.type === ItemType.WINDOW
    ? 'bg-purple-800'
    : 'bg-slate-700';

  const borderColor = isDragging
    ? 'border-purple-400'
    : 'border-slate-600';

  return (
    <div
      data-ui-object={uiObject.id}
      style={containerStyle}
      className={`bg-slate-900 border-2 ${borderColor} rounded-lg shadow-2xl overflow-hidden flex flex-col`}
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
          {uiObject.type === ItemType.PANEL && (
            <PanelContent panel={uiObject as PanelObject} />
          )}
          {uiObject.type === ItemType.WINDOW && (
            <WindowContent window={uiObject as WindowObject} />
          )}
        </div>
      )}

      {/* Resize Handle - not shown for Main Menu */}
      {!isMainMenu && (
        <div
          ref={resizeHandleRef}
          onMouseDown={handleResizeStart}
          className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize flex items-center justify-center opacity-50 hover:opacity-100"
        >
          <GripHorizontal size={12} className="text-white rotate-[-45deg]" />
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
      return deck && deck.type === ItemType.DECK ? (
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
