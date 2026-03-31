import React, { useRef, useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { PanelObject, WindowObject, ItemType, PanelType, WindowType, AppLanguage } from '../types';
import { X, Minus, Plus, Eye, EyeOff, Pin, Settings, Trash2, Clock, Keyboard } from 'lucide-react';
import { HandPanel } from './HandPanel';
import { CharacterPanel } from './CharacterPanel';
import { MainMenuContent } from './MainMenuContent';
import { ObjectSettingsModal } from './ObjectSettingsModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { TopDeckModal } from './TopDeckModal';
import { PanelSettingsModal } from './PanelSettingsModal';
import { HyperscaleLayerSettingsWindow } from './HyperscaleLayerSettingsWindow';
import { useGame } from '../store/GameContext';
import { MAIN_MENU_WIDTH } from '../constants';
import { useLocalSettings } from '../hooks/useLocalSettings';
import { hasSavedGameState, getSavedGameTimestamp, formatTimestamp } from '../utils/gameStorage';
import { t as translate, preloadTranslations, Locale } from '../utils/translations';
import { vuToPixels } from '../utils/vuSystem';

// Get version from package.json via Vite env
const APP_NAME = (import.meta as any).env?.APP_NAME || 'Nexus Game Table';
const APP_VERSION = (import.meta as any).env?.PACKAGE_VERSION || '0.1.7';

// Support links
const SUPPORT_LINKS = [
  {
    name: 'Telegram',
    url: 'https://t.me/NeurohoretApp',
    icon: 'https://res.cloudinary.com/dxxh6meej/image/upload/v1764190409/Telegram_logo.svg_rnhkud.webp',
    color: 'bg-blue-500'
  },
  {
    name: 'Discord',
    url: 'https://discord.gg/U5zKADsZZY',
    icon: 'https://res.cloudinary.com/dxxh6meej/image/upload/v1764190408/discord-icon_nhgjyx.svg',
    color: 'bg-indigo-500'
  },
  {
    name: 'GitHub',
    url: 'https://github.com/AnahoretN/NexusGameTable',
    icon: 'https://res.cloudinary.com/dxxh6meej/image/upload/v1773145441/github_xcc4uw.png',
    color: 'bg-gray-700'
  },
  {
    name: 'Boosty',
    url: 'https://boosty.to/anahoret',
    icon: 'https://res.cloudinary.com/dxxh6meej/image/upload/v1770475932/Boosty_mwnvrh.png',
    color: 'bg-pink-500'
  },
  {
    name: 'Patreon',
    url: 'https://www.patreon.com/c/AnchoriteComics',
    icon: 'https://res.cloudinary.com/dxxh6meej/image/upload/v1764190408/Patreon_logo.svg_ala7gn.png',
    color: 'bg-red-600'
  }
];

interface UIObjectRendererProps {
  uiObject: PanelObject | WindowObject;
  isDragging: boolean;
  onMouseDown: (e: React.MouseEvent, id: string) => void;
  offset?: { x: number; y: number };
  zoom?: number;
  isPinnedMode?: boolean;
}

export const UIObjectRenderer: React.FC<UIObjectRendererProps> = ({
  uiObject,
  isDragging,
  onMouseDown,
  offset = { x: 0, y: 0 },
  zoom = 1,
  isPinnedMode = false
}) => {
  const { dispatch, state, isHost } = useGame();
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Check if this is a main menu panel (must be before useState that uses it)
  const isMainMenu = uiObject.type === ItemType.PANEL && (uiObject as PanelObject).panelType === PanelType.MAIN_MENU;

  // Check if current user is GM
  const isGM = state.players.find(p => p.id === state.activePlayerId)?.isGM ?? false;

  // Track if this panel is currently being resized
  const [isResizing, setIsResizing] = useState(false);

  // Main menu specific state
  const [showGameSettings, setShowGameSettings] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const { settings: localSettings, updateEffectSetting } = useLocalSettings();

  const minimized = uiObject.minimized || false;
  const visible = uiObject.visible !== false;

  // Preload translations for current language
  useEffect(() => {
    const lang = localStorage.getItem('app-language') as Locale || 'en';
    preloadTranslations(lang);
  }, []);

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
            width: MAIN_MENU_WIDTH,
            height: 400,
          } : {
            // In single position mode, restore expanded dimensions but keep position
            width: restoreState?.width ?? MAIN_MENU_WIDTH,
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
      // Unpin - convert viewport coordinates to world coordinates
      // For pinned objects, uiObject.x/y are viewport coordinates (position: fixed)
      // For unpinned objects, uiObject.x/y need to be world coordinates (position: absolute)
      // Pinned: left: uiObject.x (viewport)
      // Unpinned: left: (uiObject.x - offset.x) / zoom
      // To keep same visual position: worldX = viewportX * zoom + offset.x
      const worldX = uiObject.x * zoom + offset.x;
      const worldY = uiObject.y * zoom + offset.y;

      dispatch({
        type: 'UNPIN_FROM_VIEWPORT',
        payload: { id: uiObject.id, worldX, worldY }
      });
    } else {
      // Pin - use getBoundingClientRect for accurate screen position
      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        dispatch({
          type: 'PIN_TO_VIEWPORT',
          payload: {
            id: uiObject.id,
            screenX: rect.left,
            screenY: rect.top
          }
        });
      }
    }
  }, [dispatch, uiObject, zoom, offset]);

  const handleHide = useCallback(() => {
    // Hide panel instead of closing it
    dispatch({ type: 'UPDATE_OBJECT', payload: { id: uiObject.id, visible: false } });
  }, [dispatch, uiObject.id]);

  const handleOpenSettings = useCallback(() => {
    // Check permissions - GM always has access, non-GM needs configureObjects permission
    const canConfigure = isHost || state.playerPermissions.configureObjects;
    if (!canConfigure) return; // Silently do nothing if no permission

    // Check if this is a HAND panel - if so, dispatch event for MainMenuContent to handle
    const panelObj = state.objects[uiObject.id] as PanelObject | undefined;
    if (panelObj?.panelType === PanelType.HAND) {
      // Dispatch custom event for MainMenuContent to open HAND panel settings
      window.dispatchEvent(new CustomEvent('open-hand-panel-settings', {
        detail: { panelId: uiObject.id }
      }));
      return;
    }

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
        windowType: WindowType.OBJECT_SETTINGS,
        title: 'Settings',
        targetObjectId: uiObject.id,
        x: uiObject.x + 50,
        y: uiObject.y + 50,
      }
    });
  }, [dispatch, uiObject, state.objects, isHost, state.playerPermissions.configureObjects]);

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
  // In pinned mode, use fixed positioning with screen coordinates (no transform compensation)
  const getPinnedPosition = () => {
    const obj = uiObject as any;
    // Check for dual position mode
    if (obj.dualPosition) {
      if (minimized) {
        return obj.collapsedPinnedPosition || obj.expandedPinnedPosition || obj.pinnedScreenPosition;
      } else {
        return obj.expandedPinnedPosition || obj.collapsedPinnedPosition || obj.pinnedScreenPosition;
      }
    }
    return obj.pinnedScreenPosition;
  };

  const pinnedPosition = isPinnedMode ? getPinnedPosition() : null;

  // Get pixelsPerVU for converting vu to pixels (for pinned panels)
  const pixelsPerVU = state.viewTransform?.pixelsPerVU ?? 1.08;
  const vuToPx = useCallback((vu: number) => vuToPixels(vu ?? 0, pixelsPerVU), [pixelsPerVU]);

  const containerStyle: React.CSSProperties = {
    position: isPinnedMode ? 'fixed' : 'absolute',
    // For pinned mode: use pinnedScreenPosition (actual screen coordinates)
    // For unpinned mode: convert screen coords to world coords: subtract offset, divide by zoom
    left: isPinnedMode
      ? (pinnedPosition?.x ?? uiObject.x)
      : (uiObject.x - offset.x) / zoom,
    top: isPinnedMode
      ? (pinnedPosition?.y ?? uiObject.y)
      : (uiObject.y - offset.y) / zoom,
    // For pinned panels, convert vu to pixels; for unpinned, use vu directly (scaled by CSS transform)
    // Main menu is special: its dimensions are already in pixels, not vu
    width: isPinnedMode ? (isMainMenu ? uiObject.width : vuToPx(uiObject.width)) : uiObject.width,
    height: minimized ? 32 : (isPinnedMode ? (isMainMenu ? uiObject.height : vuToPx(uiObject.height)) : uiObject.height),
    // In pinned mode, no scale transform; in unpinned mode, reverse the scale
    transform: isPinnedMode
      ? `rotate(${uiObject.rotation}deg)`
      : `rotate(${uiObject.rotation}deg) scale(${1 / zoom})`,
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

  // Special handling for modal windows that render via portal - don't render window frame
  const isModalWindow = uiObject.type === ItemType.WINDOW &&
    ((uiObject as WindowObject).windowType === WindowType.OBJECT_SETTINGS ||
     (uiObject as WindowObject).windowType === WindowType.HYPERSCALE_LAYER_SETTINGS);
  if (isModalWindow) {
    const windowObj = uiObject as WindowObject;
    const targetObj = windowObj.targetObjectId ? state.objects[windowObj.targetObjectId] : null;
    const targetPanel = targetObj?.type === ItemType.PANEL ? targetObj as PanelObject : null;
    // For non-panel objects and hyperscale layer settings, don't render the window frame - the modal renders via portal
    if ((uiObject as WindowObject).windowType === WindowType.HYPERSCALE_LAYER_SETTINGS ||
        !targetPanel || targetPanel.panelType === PanelType.HAND) {
      return <WindowContent window={windowObj} />;
    }
  }

  return (
    <div
      ref={containerRef}
      data-ui-object={uiObject.id}
      data-main-menu={isMainMenu ? "true" : undefined}
      style={containerStyle}
      className={`bg-slate-900 border-2 ${borderColor} rounded-lg shadow-2xl flex flex-col w-full`}
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
          {/* Left side - Game name and support button */}
          <div
            className="flex items-center gap-2 truncate cursor-move"
            style={{ flex: 1, minWidth: 0, pointerEvents: 'auto' }}
            onMouseDown={(e) => {
              e.stopPropagation();
              handleBringToFront();
              onMouseDown(e, uiObject.id);
            }}
          >
            <span className="text-sm font-bold text-white truncate">{APP_NAME}</span>
            {!minimized && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSupportModal(true);
                }}
                className="text-sm text-purple-400 hover:text-purple-300 flex-shrink-0 transition-colors"
              >
                [{translate('Links', state.language as Locale)}]
              </button>
            )}
          </div>
          {/* Right side - Control buttons */}
          <div className="flex items-center gap-0.5 flex-shrink-0 ml-1" style={{ pointerEvents: 'auto' }}>
            {!minimized && (
              <>
                {/* Settings button - visible to all */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowGameSettings(true);
                  }}
                  className="p-0.5 hover:bg-white/20 rounded transition-colors"
                  title={translate('Settings', state.language as Locale)}
                >
                  <Settings size={14} className="text-white" />
                </button>
                {/* Pin to screen button - GM only */}
                {isGM && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTogglePin();
                    }}
                    className={`p-0.5 hover:bg-white/20 rounded transition-colors ${uiObject.isPinnedToViewport ? 'bg-purple-600' : ''}`}
                    title={uiObject.isPinnedToViewport ? 'Unpin' : 'Pin'}
                  >
                    <Pin size={14} className="text-white" />
                  </button>
                )}
              </>
            )}
            {/* Pin button for collapsed state - GM only */}
            {minimized && isGM && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleTogglePin();
                }}
                className={`p-0.5 hover:bg-white/20 rounded transition-colors ${uiObject.isPinnedToViewport ? 'bg-purple-600' : ''}`}
                title={uiObject.isPinnedToViewport ? 'Unpin' : 'Pin'}
              >
                <Pin size={14} className="text-white" />
              </button>
            )}
            {/* Minimize/Expand button - GM only */}
            {isGM && (
              minimized ? (
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
              )
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
                  title={uiObject.isPinnedToViewport ? 'Unpin' : 'Pin'}
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
                  title={uiObject.isPinnedToViewport ? 'Unpin' : 'Pin'}
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
        <div ref={contentRef} className="flex-1 overflow-hidden w-full">
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
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/15" onClick={() => setShowGameSettings(false)}>
          <div className="bg-slate-800 rounded-lg shadow-xl w-[575px] border border-slate-600 max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex justify-center items-center py-2 px-4">
              <h3 className="text-base font-bold text-white">{translate('Game Settings', state.language as Locale)}</h3>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {/* Version Info */}
              <div className="text-sm text-gray-400 pb-3 border-b border-slate-700">
                <p>{APP_NAME} v{APP_VERSION}</p>
              </div>

              {/* Language Settings */}
              <div className="pt-2">
                <h4 className="text-sm font-bold text-gray-300 mb-2">{translate('Language', state.language as Locale)}</h4>
                <select
                  value={state.language || 'en'}
                  onChange={async (e) => {
                    const newLang = e.target.value as AppLanguage;
                    localStorage.setItem('app-language', newLang);
                    await preloadTranslations(newLang as Locale);
                    dispatch({ type: 'UPDATE_LANGUAGE', payload: newLang });
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm"
                >
                  <option value="be">Беларуская</option>
                  <option value="en">English</option>
                  <option value="ru">Русский</option>
                  <option value="sr">Srpski (Latin)</option>
                  <option value="uk">Українська</option>
                </select>
              </div>

              {/* Player Permissions */}
              {isGM && (
                <div className="pt-3 pb-2 border-t border-slate-700">
                  <h4 className="text-sm font-bold text-gray-300 mb-2">{translate('Player Permissions', state.language as Locale)}</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center justify-between bg-slate-900 rounded px-3 py-2 cursor-pointer ">
                      <span className="text-xs text-gray-300">{translate('Create Objects', state.language as Locale)}</span>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          dispatch({
                            type: 'UPDATE_PLAYER_PERMISSIONS',
                            payload: { ...state.playerPermissions, createObjects: !state.playerPermissions.createObjects }
                          });
                        }}
                        className={`w-10 h-5 rounded-full transition-colors ${
                          state.playerPermissions.createObjects ? 'bg-green-600' : 'bg-slate-700'
                        }`}
                      >
                        <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                          state.playerPermissions.createObjects ? 'translate-x-5' : 'translate-x-0.5'
                        }`} />
                      </button>
                    </label>
                    <label className="flex items-center justify-between bg-slate-900 rounded px-3 py-2 cursor-pointer ">
                      <span className="text-xs text-gray-300">{translate('Configure Objects (Settings)', state.language as Locale)}</span>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          dispatch({
                            type: 'UPDATE_PLAYER_PERMISSIONS',
                            payload: { ...state.playerPermissions, configureObjects: !state.playerPermissions.configureObjects }
                          });
                        }}
                        className={`w-10 h-5 rounded-full transition-colors ${
                          state.playerPermissions.configureObjects ? 'bg-green-600' : 'bg-slate-700'
                        }`}
                      >
                        <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                          state.playerPermissions.configureObjects ? 'translate-x-5' : 'translate-x-0.5'
                        }`} />
                      </button>
                    </label>
                    <label className="flex items-center justify-between bg-slate-900 rounded px-3 py-2 cursor-pointer ">
                      <span className="text-xs text-gray-300">{translate('Delete Objects', state.language as Locale)}</span>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          dispatch({
                            type: 'UPDATE_PLAYER_PERMISSIONS',
                            payload: { ...state.playerPermissions, deleteObjects: !state.playerPermissions.deleteObjects }
                          });
                        }}
                        className={`w-10 h-5 rounded-full transition-colors ${
                          state.playerPermissions.deleteObjects ? 'bg-green-600' : 'bg-slate-700'
                        }`}
                      >
                        <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                          state.playerPermissions.deleteObjects ? 'translate-x-5' : 'translate-x-0.5'
                        }`} />
                      </button>
                    </label>
                    <label className="flex items-center justify-between bg-slate-900 rounded px-3 py-2 cursor-pointer ">
                      <span className="text-xs text-gray-300">{translate('Show/Hide Objects', state.language as Locale)}</span>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          dispatch({
                            type: 'UPDATE_PLAYER_PERMISSIONS',
                            payload: { ...state.playerPermissions, hideObjects: !state.playerPermissions.hideObjects }
                          });
                        }}
                        className={`w-10 h-5 rounded-full transition-colors ${
                          state.playerPermissions.hideObjects ? 'bg-green-600' : 'bg-slate-700'
                        }`}
                      >
                        <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                          state.playerPermissions.hideObjects ? 'translate-x-5' : 'translate-x-0.5'
                        }`} />
                      </button>
                    </label>
                  </div>
                </div>
              )}

              {/* Effects Section */}
              <div className="pt-3 pb-2 border-t border-slate-700">
                <h4 className="text-sm font-bold text-gray-300 mb-2 flex items-center gap-2">
                  <Eye size={14} />
                  {translate('Effects', state.language as Locale)}
                </h4>
                <label
                  className="flex items-center justify-between bg-slate-900 rounded px-3 py-2 cursor-pointer "
                  title={translate('Show ghost/locked version of objects when another player has them in cursor slot', state.language as Locale)}
                >
                  <span className="text-xs text-gray-300">{translate('Show shadow objects held by other players', state.language as Locale)}</span>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      updateEffectSetting('showRemoteCursorSlotObjects', !localSettings.effects.showRemoteCursorSlotObjects);
                    }}
                    className={`w-10 h-5 rounded-full transition-colors ${
                      localSettings.effects.showRemoteCursorSlotObjects ? 'bg-green-600' : 'bg-slate-700'
                    }`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                      localSettings.effects.showRemoteCursorSlotObjects ? 'translate-x-5' : 'translate-x-0.5'
                    }`} />
                  </button>
                </label>
              </div>

              {/* Hotkeys Section */}
              <div className="pt-3 pb-2 border-t border-slate-700">
                <h4 className="text-sm font-bold text-gray-300 mb-2 flex items-center gap-2">
                  <Keyboard size={14} />
                  {translate('Hotkeys', state.language as Locale)}
                </h4>

                <div className="grid grid-cols-2 gap-1.5">
                  <div className="bg-slate-900 rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-700">
                      <span className="text-xs text-gray-300">{translate('Undo', state.language as Locale)}</span>
                      <kbd className="px-2 py-1 bg-slate-700 rounded text-xs text-gray-400 font-mono">Ctrl+Z</kbd>
                    </div>
                    <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-700">
                      <span className="text-xs text-gray-300">{translate('Close tooltip/menu', state.language as Locale)}</span>
                      <kbd className="px-2 py-1 bg-slate-700 rounded text-xs text-gray-400 font-mono">Esc</kbd>
                    </div>
                    <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-700">
                      <span className="text-xs text-gray-300">{translate('Add to cursor slot', state.language as Locale)}</span>
                      <kbd className="px-2 py-1 bg-slate-700 rounded text-xs text-gray-400 font-mono">Shift+Click</kbd>
                    </div>
                    <div className="flex items-center justify-between px-3 py-1.5">
                      <span className="text-xs text-gray-300">{translate('Delete without confirmation', state.language as Locale)}</span>
                      <kbd className="px-2 py-1 bg-slate-700 rounded text-xs text-gray-400 font-mono">Shift+Delete</kbd>
                    </div>
                  </div>
                  <div className="bg-slate-900 rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-700">
                      <span className="text-xs text-gray-300">{translate('Pan view (hold + drag)', state.language as Locale)}</span>
                      <kbd className="px-2 py-1 bg-slate-700 rounded text-xs text-gray-400 font-mono">Shift+Drag</kbd>
                    </div>
                    <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-700">
                      <span className="text-xs text-gray-300">{translate('Move the drawing', state.language as Locale)}</span>
                      <kbd className="px-2 py-1 bg-slate-700 rounded text-xs text-gray-400 font-mono">Shift+Marker</kbd>
                    </div>
                    <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-700">
                      <span className="text-xs text-gray-300">{translate('Delete entire drawing', state.language as Locale)}</span>
                      <kbd className="px-2 py-1 bg-slate-700 rounded text-xs text-gray-400 font-mono">Shift+Eraser</kbd>
                    </div>
                    <div className="flex items-center justify-between px-3 py-1.5">
                      <span className="text-xs text-gray-300">{translate('Normal cursor mode', state.language as Locale)}</span>
                      <kbd className="px-2 py-1 bg-slate-700 rounded text-xs text-gray-400 font-mono">Alt+Marker</kbd>
                    </div>
                  </div>
                </div>
              </div>

              {/* Storage & Cache Section */}
              <div className="pt-3 pb-2 border-t border-slate-700">
                <h4 className="text-sm font-bold text-gray-300 mb-2">{translate('Storage & Cache', state.language as Locale)}</h4>

                {hasSavedGameState() && (
                  <div className="bg-slate-900 rounded px-3 py-2 mb-3">
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <Clock size={12} />
                      <span>{translate('Last save: ', state.language as Locale)}{formatTimestamp(getSavedGameTimestamp() || 0)}</span>
                    </div>
                  </div>
                )}

                <button
                  onClick={() => {
                    if (confirm(translate('Are you sure you want to clear all saved game data? This action cannot be undone.', state.language as Locale))) {
                      dispatch({ type: 'CLEAR_SAVED_STATE' });
                      // Reload page to start fresh
                      window.location.reload();
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-500 text-white rounded transition-colors text-sm"
                >
                  <Trash2 size={14} />
                  <span>{translate('Clear Cache', state.language as Locale)}</span>
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 p-4 border-t border-slate-700">
              <button
                onClick={() => setShowGameSettings(false)}
                className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-500 text-white rounded font-medium"
              >
                {translate('Close', state.language as Locale)}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Support Modal */}
      {isMainMenu && showSupportModal && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70" onClick={() => setShowSupportModal(false)}>
          <div className="bg-slate-800 rounded-lg shadow-xl w-[540px] border border-slate-600" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-center items-center py-2 px-4 border-b border-slate-700">
              <h3 className="text-base font-bold text-white">{translate('Links', state.language as Locale)}</h3>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-400 text-center mb-6">
                {translate('Follow me on social media or support my work through donations!', state.language as Locale)}
              </p>
              <div className="grid grid-cols-3 gap-4">
                {SUPPORT_LINKS.map((link) => (
                  <a
                    key={link.name}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-col items-center gap-3 p-4 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors group"
                  >
                    <div className={`${link.name === 'Boosty' ? 'w-[70px] h-[70px]' : 'w-16 h-16'} flex items-center justify-center overflow-visible`}>
                      <img
                        src={link.icon}
                        alt={link.name}
                        className={`max-w-full max-h-full object-contain group-hover:scale-110 transition-transform ${link.name === 'Boosty' ? 'scale-125' : ''}`}
                      />
                    </div>
                    <span className="text-sm text-white font-medium">{link.name}</span>
                  </a>
                ))}
              </div>
            </div>
            <div className="flex justify-end p-4 border-t border-slate-700">
              <button
                onClick={() => setShowSupportModal(false)}
                className="px-4 py-2 text-sm bg-slate-600 hover:bg-slate-500 text-white rounded"
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
    case PanelType.CHARACTER:
      return <CharacterPanel panel={panel} />;
    case PanelType.TABLEAU:
      return <TableauPanelContent panel={panel} />;
    case PanelType.POOL:
      return <PoolPanelContent panel={panel} />;
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
  const { state } = useGame();

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
      <HandPanel width={panel.width} isDragTarget={isDragTarget} isCollapsed={isCollapsed} language={state.language} />
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

// Pool panel content
const PoolPanelContent: React.FC<{ panel: PanelObject }> = ({ panel }) => {
  return (
    <div className="h-full flex flex-col">
      <div className="p-4 text-slate-300 text-sm">
        Pool Panel
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
      // Panels are stored in state.objects, not state.uiObjects
      const targetPanel = targetObj?.type === ItemType.PANEL ? targetObj as PanelObject : null;

      if (targetPanel && targetPanel.panelType !== PanelType.HAND) {
        // Show panel settings for panels (except HAND panels which use MainMenuContent settings)
        return <PanelSettingsModal panel={targetPanel} onClose={handleClose} language={state.language} />;
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
      // ObjectSettingsModal uses createPortal to document.body, so render it without window frame
      // Return the modal directly - it will render via portal to document.body
      return (
        <ObjectSettingsModal
          object={targetObj}
          allObjects={state.objects}
          language={state.language}
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
          language={state.language}
        />
      ) : null;
    case WindowType.HYPERSCALE_LAYER_SETTINGS:
      const targetLayer = windowObj.targetLayerId
        ? state.hyperscaleLayers.find(l => l.id === windowObj.targetLayerId)
        : null;
      if (!targetLayer) {
        return (
          <div className="p-4 text-slate-400 text-sm">
            Layer not found
            <button onClick={handleClose} className="ml-2 text-red-400 hover:text-red-300">Close</button>
          </div>
        );
      }
      return (
        <HyperscaleLayerSettingsWindow
          layer={targetLayer}
          onClose={handleClose}
          language={state.language}
        />
      );
    default:
      return (
        <div className="p-4 text-slate-400 text-sm">
          Window: {windowObj.windowType}
        </div>
      );
  }
};

export const UIObjectRendererMemo = React.memo(UIObjectRenderer, (prevProps, nextProps) => {
  // Custom comparison for better performance
  return (
    prevProps.uiObject.id === nextProps.uiObject.id &&
    prevProps.uiObject.x === nextProps.uiObject.x &&
    prevProps.uiObject.y === nextProps.uiObject.y &&
    prevProps.uiObject.width === nextProps.uiObject.width &&
    prevProps.uiObject.height === nextProps.uiObject.height &&
    prevProps.uiObject.minimized === nextProps.uiObject.minimized &&
    prevProps.isDragging === nextProps.isDragging &&
    prevProps.zoom === nextProps.zoom &&
    prevProps.isPinnedMode === nextProps.isPinnedMode
  );
});

