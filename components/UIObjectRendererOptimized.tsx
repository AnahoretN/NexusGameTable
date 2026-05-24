import React, { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { PanelObject, WindowObject, ItemType, PanelType, WindowType, AppLanguage } from '../types';
import { X, Minus, Plus, Eye, EyeOff, Lock, Unlock, Settings, Trash2, Clock, Keyboard, Palette, Network, Server, PlusCircle, XCircle } from 'lucide-react';
import { HandPanelOptimized as HandPanel } from './HandPanelOptimized';
import { useActivePlayerId, useIsGM, usePixelsPerVU, usePlayerPermissions, useLanguage, useHyperscaleLayers, useLanguageActions } from '../store/contexts';
import { getConnectionSettings, updateConnectionSettings, removeCustomSignalingServer, clearCustomSignalingServers } from '../utils/localSettings';
import { applyResizePanelToPanelMagnetism, type PanelBounds, type GameSpaceBounds, type MagnetismConfig } from '../utils/panelMagnetism';

// 🔥 OPTIMIZED: Zustand version of UIObjectRenderer
// Replaces: components/UIObjectRenderer.tsx
// Performance: Optimized state.objects access with useMemo for fewer re-renders
// NOTE: Using useMemo instead of direct Zustand hooks to avoid infinite loop with GameContext sync
import { CharacterPanel } from './CharacterPanel';
import { PoolPanel } from './PoolPanel';
import { TableauPanel } from './TableauPanel';
import { MainMenuContent } from './MainMenuContent';
import { PanelToolsPanel } from './ToolsPanel';
import { TokensPanelOptimized as TokensPanel } from './TokensPanelOptimized';
import { ObjectSettingsModal } from './ObjectSettingsModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { TopDeckModal } from './TopDeckModal';
import { PanelSettingsModal } from './PanelSettingsModal';
import { HyperscaleLayerSettingsWindow } from './HyperscaleLayerSettingsWindow';
import { useGame } from '../store/GameContext';
import { useDragOverStore } from '../store/dragOverState';
import { SCROLLBAR_WIDTH_THICK } from '../constants';
import { DEFAULT_POOL_WIDTH, DEFAULT_POOL_HEIGHT } from '../constants/pool';
import { useLocalSettings } from '../hooks/useLocalSettings';
import { LocalSettings } from '../utils/localSettings';
import { useLocalPanelSettings } from '../hooks/useLocalPanelSettings';
import { hasSavedGameState, getSavedGameTimestamp, formatTimestamp } from '../utils/gameStorage';
import { t as translate, preloadTranslations, Locale } from '../utils/translations';
import { vuToPixels } from '../utils/vuSystem';
import { PanelResizeHandleMemo } from './PanelResizeHandle';

// Get version from package.json via Vite env
const APP_NAME = (import.meta as any).env?.APP_NAME || 'Nexus Game Table';
const APP_VERSION = (import.meta as any).env?.PACKAGE_VERSION || '0.1.9';

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
    color: 'bg-purple-600'
  }
];

interface UIObjectRendererProps {
  uiObject: PanelObject | WindowObject;
  isDragging: boolean;
  onMouseDown: (e: React.MouseEvent, id: string) => void;
  onContextMenu?: (e: React.MouseEvent, obj: any) => void;
  offset?: { x: number; y: number };
  zoom?: number;
  isPinnedMode?: boolean;
}

export const UIObjectRendererOptimized: React.FC<UIObjectRendererProps> = ({
  uiObject,
  isDragging,
  onMouseDown,
  onContextMenu,
  offset = { x: 0, y: 0 },
  zoom = 1,
  isPinnedMode = false
}) => {
  const { dispatch, state, isHost } = useGame();
  const pixelsPerVU = usePixelsPerVU();

  // PlayerContext hooks - synchronized with GameContext
  const activePlayerId = useActivePlayerId();
  const isGM = useIsGM();
  const playerPermissions = usePlayerPermissions();
  const language = useLanguage();
  const { setLanguage } = useLanguageActions();
  const hyperscaleLayers = useHyperscaleLayers();

  const { isDragging: isDraggingOverPoolState, targetPoolPanelId } = useDragOverStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Check if this is a main menu panel (must be before useState that uses it)
  const isMainMenu = uiObject.type === ItemType.PANEL && (uiObject as PanelObject).panelType === PanelType.MAIN_MENU;

  // Track if this panel is currently being resized
  const [isResizing, setIsResizing] = useState(false);
  const [isHoveringResizeHandle, setIsHoveringResizeHandle] = useState(false);
  // Track if we just finished resizing (to prevent drag from overwriting size)
  const justFinishedResizingRef = useRef(false);

  // Track if panel is being dragged with Shift
  const [isShiftDragging, setIsShiftDragging] = useState(false);

  // Single unified state object for all drag/resize operations
  const dragResizeStateRef = useRef({
    // Operation type
    isDragging: false,
    isResizing: false,
    // Start positions
    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0,
    // Start dimensions
    startWidth: 0,
    startHeight: 0,
  });

  // Helper to check if click should be blocked during Shift+drag
  const shouldBlockClick = useCallback((e: React.MouseEvent) => {
    return isShiftDragging || e.shiftKey;
  }, [isShiftDragging]);

  // Main menu specific state
  const [showGameSettings, setShowGameSettings] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [showStyleSelector, setShowStyleSelector] = useState(false);
  const [isIrohUnlocked, setIsIrohUnlocked] = useState(false);
  const [isTrysteroUnlocked, setIsTrysteroUnlocked] = useState(false);

  // Connection settings state
  const [showAddServerForm, setShowAddServerForm] = useState(false);
  const [newServerHost, setNewServerHost] = useState('');
  const [newServerPort, setNewServerPort] = useState('443');
  const [newServerSecure, setNewServerSecure] = useState(true);
  const [newServerPath, setNewServerPath] = useState('/peerjs');
  const [connectionSettings, setConnectionSettings] = useState(getConnectionSettings());
  const { settings: localSettings, updateSetting, updateEffectSetting } = useLocalSettings();

  // Secret style selector: press 'S' 3 times within 2 seconds
  useEffect(() => {
    const sPresses: number[] = [];
    const SECRET_KEY = 's';
    const REQUIRED_PRESSES = 3;
    const TIME_WINDOW = 2000; // 2 seconds

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === SECRET_KEY) {
        const now = Date.now();
        // Remove presses outside the time window
        while (sPresses.length > 0 && sPresses[0] < now - TIME_WINDOW) {
          sPresses.shift();
        }
        sPresses.push(now);

        if (sPresses.length >= REQUIRED_PRESSES) {
          setShowStyleSelector(prev => !prev); // Toggle visibility
          sPresses.length = 0; // Reset to prevent immediate re-trigger
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Secret Iroh unlock: press 'I' 3 times within 2 seconds (works on any keyboard layout)
  useEffect(() => {
    const iPresses: number[] = [];
    const REQUIRED_PRESSES = 3;
    const TIME_WINDOW = 2000; // 2 seconds

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyI') {
        const now = Date.now();
        // Remove presses outside the time window
        while (iPresses.length > 0 && iPresses[0] < now - TIME_WINDOW) {
          iPresses.shift();
        }
        iPresses.push(now);

        if (iPresses.length >= REQUIRED_PRESSES) {
          setIsIrohUnlocked(prev => !prev); // Toggle visibility
          iPresses.length = 0; // Reset to prevent immediate re-trigger
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Secret Trystero unlock: press 'T' 3 times within 2 seconds (works on any keyboard layout)
  useEffect(() => {
    const tPresses: number[] = [];
    const REQUIRED_PRESSES = 3;
    const TIME_WINDOW = 2000; // 2 seconds

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyT') {
        const now = Date.now();
        // Remove presses outside the time window
        while (tPresses.length > 0 && tPresses[0] < now - TIME_WINDOW) {
          tPresses.shift();
        }
        tPresses.push(now);

        if (tPresses.length >= REQUIRED_PRESSES) {
          setIsTrysteroUnlocked(prev => !prev); // Toggle visibility
          tPresses.length = 0; // Reset to prevent immediate re-trigger
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Memoize panel check to prevent repeated type checks
  const isPanel = useMemo(() => uiObject.type === ItemType.PANEL, [uiObject.type]);
  const panelObject = useMemo(() => isPanel ? (uiObject as PanelObject) : null, [isPanel, uiObject]);

  // getLocalEffectiveProps and updateLocalSettings are only needed for windows now
  const {
    updateSettings: updateLocalSettings,
  } = useLocalPanelSettings(panelObject || uiObject as any);

  // Get player-specific panel settings from GameContext (stored on host)
  // For panels, always use playerPanelSettings if they exist, otherwise use panel properties directly
  // This is much simpler and more performant than the localSettings system
  const currentPlayerId = activePlayerId;
  const playerPanelSettings = state.playerPanelSettings[currentPlayerId]?.[uiObject.id];

  // Refs for values that need to be always current in mouse handlers (must be after playerPanelSettings declaration)
  const uiObjectRef = useRef(uiObject);
  const playerPanelSettingsRef = useRef(playerPanelSettings);

  // Update refs when values change
  useEffect(() => {
    uiObjectRef.current = uiObject;
    playerPanelSettingsRef.current = playerPanelSettings;
  }, [uiObject, playerPanelSettings]);

  // Memoize effectiveProps to prevent unnecessary recalculations
  const effectiveProps = useMemo(() => {
    // Simple direct computation - no complex dependencies
    // IMPORTANT: During dragging, always use uiObject properties directly, not playerPanelSettings
    // This prevents panels from jumping to stale positions from playerPanelSettings
    // For position (x,y), ALWAYS use uiObject to avoid conflicts with playerPanelSettings
    // playerPanelSettings is used for size (width,height) and state (minimized, etc.)

    // ALWAYS prefer playerPanelSettings for size if available, even during drag
    // This prevents size jumping when drag starts
    const result = playerPanelSettings ? {
        // FIX: Use playerPanelSettings for position if available (guests move panels locally)
        x: playerPanelSettings.x !== undefined ? playerPanelSettings.x : uiObject.x,
        y: playerPanelSettings.y !== undefined ? playerPanelSettings.y : uiObject.y,
        width: playerPanelSettings.width !== undefined ? playerPanelSettings.width : uiObject.width,
        height: playerPanelSettings.height !== undefined ? playerPanelSettings.height : uiObject.height,
        minimized: playerPanelSettings.minimized !== undefined ? playerPanelSettings.minimized : (uiObject as any).minimized || false,
        isPinnedToViewport: playerPanelSettings.isPinnedToViewport !== undefined ? playerPanelSettings.isPinnedToViewport : (uiObject as any).isPinnedToViewport || false,
        pinnedScreenPosition: playerPanelSettings.pinnedScreenPosition !== undefined ? playerPanelSettings.pinnedScreenPosition : (uiObject as any).pinnedScreenPosition,
        expandedState: playerPanelSettings.expandedState !== undefined ? playerPanelSettings.expandedState : (uiObject as any).expandedState,
        collapsedState: playerPanelSettings.collapsedState !== undefined ? playerPanelSettings.collapsedState : (uiObject as any).collapsedState,
        expandedPinnedPosition: playerPanelSettings.expandedPinnedPosition !== undefined ? playerPanelSettings.expandedPinnedPosition : (uiObject as any).expandedPinnedPosition,
        collapsedPinnedPosition: playerPanelSettings.collapsedPinnedPosition !== undefined ? playerPanelSettings.collapsedPinnedPosition : (uiObject as any).collapsedPinnedPosition,
        visible: playerPanelSettings.visible !== undefined ? playerPanelSettings.visible : (uiObject.visible !== false),
      } : {
        // No player settings - use panel properties directly
        x: uiObject.x,
        y: uiObject.y,
        width: uiObject.width,
        height: uiObject.height,
        minimized: (uiObject as any).minimized || false,
        isPinnedToViewport: (uiObject as any).isPinnedToViewport || false,
        pinnedScreenPosition: (uiObject as any).pinnedScreenPosition,
        expandedState: (uiObject as any).expandedState,
        collapsedState: (uiObject as any).collapsedState,
        expandedPinnedPosition: (uiObject as any).expandedPinnedPosition,
        collapsedPinnedPosition: (uiObject as any).collapsedPinnedPosition,
        visible: uiObject.visible !== false,
      };

    return result;
  }, [
    playerPanelSettings,
    isDragging,
    uiObject.x,
    uiObject.y,
    uiObject.width,
    uiObject.height,
    uiObject.minimized,
    uiObject.isPinnedToViewport,
    uiObject.pinnedScreenPosition,
    uiObject.expandedState,
    uiObject.collapsedState,
    uiObject.expandedPinnedPosition,
    uiObject.collapsedPinnedPosition,
    uiObject.visible,
    playerPanelSettings?.x,
    playerPanelSettings?.y,
    playerPanelSettings?.width,
    playerPanelSettings?.height,
    playerPanelSettings?.minimized,
    playerPanelSettings?.pinnedScreenPosition,
    playerPanelSettings?.expandedState,
    playerPanelSettings?.collapsedState,
    playerPanelSettings?.expandedPinnedPosition,
    playerPanelSettings?.collapsedPinnedPosition,
    playerPanelSettings?.visible,
  ]);

  // Get pixelsPerVU for converting vu to pixels (for pinned panels)
  const vuToPx = useCallback((vu: number) => vuToPixels(vu ?? 0, pixelsPerVU), [pixelsPerVU]);

  // Memoize minimized check - always use effectiveProps (playerPanelSettings or uiObject)
  const minimized = effectiveProps.minimized;
  const visible = effectiveProps.visible;

  // Preload translations for current language
  useEffect(() => {
    const lang = localStorage.getItem('app-language') as Locale || 'en';
    preloadTranslations(lang);
  }, []);

  // Reload connection settings when game settings modal opens
  useEffect(() => {
    if (showGameSettings) {
      setConnectionSettings(getConnectionSettings());
    }
  }, [showGameSettings]);

  // Memoize canResize check - use actual minimized state during drag
  // Main menu panel can now be resized (using bottom-left corner)
  const canResize = useMemo(() => !minimized, [minimized]);

  const handleClose = useCallback(() => {
    dispatch({ type: 'CLOSE_UI_OBJECT', payload: { id: uiObject.id } });
  }, [dispatch, uiObject.id]);

  // Memoize collapse checks
  const isCollapsed = useMemo(() => {
    // Use minimized flag instead of height check
    return effectiveProps.minimized || false;
  }, [effectiveProps.minimized]);
  // For main menu, use minimized flag; for other panels, use size-based check
  const shouldExpand = isMainMenu ? minimized : isCollapsed;
  const dualPosition = useMemo(() => uiObject.type === ItemType.PANEL && (uiObject as PanelObject).dualPosition, [uiObject]);

  const handleToggleCollapse = useCallback((_e?: React.MouseEvent) => {
    // Toggle between collapsed (200px wide, title only) and full size

    if (shouldExpand) {
      // Currently collapsed - expand to saved state
      const restoreState = effectiveProps.expandedState;

      // Update local settings instead of global state
      if (isPanel && !isMainMenu) {
        // Update the object itself first
        dispatch({
          type: 'UPDATE_OBJECT',
          payload: {
            id: uiObject.id,
            minimized: false,
            width: restoreState?.width || uiObject.width,
            height: restoreState?.height || 400,
            collapsedState: {
              x: effectiveProps.x,
              y: effectiveProps.y,
              width: effectiveProps.width,
              height: effectiveProps.height,
            },
          },
          _localOnly: true // Local-only properties for panels
        });

        // Update local settings for localStorage
        updateLocalSettings({
          minimized: false,
          collapsedState: {
            x: effectiveProps.x,
            y: effectiveProps.y,
            width: effectiveProps.width,
            height: effectiveProps.height,
          },
          // Restore exact dimensions from expandedState
          width: restoreState?.width || uiObject.width,
          height: restoreState?.height || 400,
        });

        // Also update playerPanelSettings in global state
        dispatch({
          type: 'UPDATE_PLAYER_PANEL_SETTINGS',
          payload: {
            playerId: activePlayerId,
            panelId: uiObject.id,
            settings: {
              minimized: false,
              x: effectiveProps.x,
              y: effectiveProps.y,
              width: restoreState?.width || uiObject.width,
              height: restoreState?.height || 400,
              expandedState: restoreState // Save expandedState to playerPanelSettings
            }
          }
        });

        // Also update playerPanelSettings in global state
        dispatch({
          type: 'UPDATE_PLAYER_PANEL_SETTINGS',
          payload: {
            playerId: activePlayerId,
            panelId: uiObject.id,
            settings: {
              minimized: false,
              x: effectiveProps.x,
              y: effectiveProps.y,
              width: restoreState?.width || uiObject.width,
              height: restoreState?.height || 400,
            }
          }
        });
      } else {
        // For main menu and windows, use global state

        // First update the object dimensions and minimized state
        dispatch({
          type: 'UPDATE_OBJECT',
          payload: {
            id: uiObject.id,
            minimized: false,
            width: restoreState?.width || uiObject.width, // Restore exact saved width
            height: restoreState?.height || 400, // Restore exact saved height
            collapsedState: {
              x: effectiveProps.x,
              y: effectiveProps.y,
              width: effectiveProps.width,
              height: effectiveProps.height,
            },
          },
          _localOnly: true // Local-only properties for panels
        });

        // Then update playerPanelSettings for position persistence
        dispatch({
          type: 'UPDATE_PLAYER_PANEL_SETTINGS',
          payload: {
            playerId: activePlayerId,
            panelId: uiObject.id,
            settings: {
              minimized: false,
              x: effectiveProps.x,
              y: effectiveProps.y,
              width: restoreState?.width || uiObject.width,
              height: restoreState?.height || 400,
            }
          }
        });
      }
    } else {
      // Currently expanded - collapse and minimize
      if (isPanel && !isMainMenu) {
        // Save current dimensions before collapsing
        const currentWidth = effectiveProps.width;
        const currentHeight = effectiveProps.height;

        // Update the object itself first (to prevent expansion during drag)
        dispatch({
          type: 'UPDATE_OBJECT',
          payload: {
            id: uiObject.id,
            minimized: true,
            height: 40,
            expandedState: {
              x: effectiveProps.x,
              y: effectiveProps.y,
              width: currentWidth,
              height: currentHeight,
            },
          },
          _localOnly: true // Local-only properties for panels
        });

        // Update local settings for localStorage
        updateLocalSettings({
          minimized: true,
          expandedState: {
            x: effectiveProps.x,
            y: effectiveProps.y,
            width: currentWidth,
            height: currentHeight,
          },
          height: 40, // Title bar height
        });

        // Also update playerPanelSettings in global state
        dispatch({
          type: 'UPDATE_PLAYER_PANEL_SETTINGS',
          payload: {
            playerId: activePlayerId,
            panelId: uiObject.id,
            settings: {
              minimized: true,
              x: effectiveProps.x,
              y: effectiveProps.y,
              width: currentWidth,
              height: 40,
              expandedState: {
                x: effectiveProps.x,
                y: effectiveProps.y,
                width: currentWidth,
                height: currentHeight,
              }
            }
          }
        });
      } else {
        // For main menu and windows, use global state
        // Save current dimensions before collapsing
        const currentWidth = effectiveProps.width;
        const currentHeight = effectiveProps.height;

        // Update the object minimized state and height
        dispatch({
          type: 'UPDATE_OBJECT',
          payload: {
            id: uiObject.id,
            minimized: true,
            height: 40, // Title bar height (must match containerHeight calculation)
            expandedState: {
              x: effectiveProps.x,
              y: effectiveProps.y,
              width: currentWidth,
              height: currentHeight,
            },
          },
          _localOnly: true // Local-only properties for panels
        });

        // Then update playerPanelSettings for position persistence
        dispatch({
          type: 'UPDATE_PLAYER_PANEL_SETTINGS',
          payload: {
            playerId: activePlayerId,
            panelId: uiObject.id,
            settings: {
              minimized: true,
              x: effectiveProps.x,
              y: effectiveProps.y,
              width: currentWidth,
              height: 40,
              expandedState: {
                x: effectiveProps.x,
                y: effectiveProps.y,
                width: currentWidth,
                height: currentHeight,
              }
            }
          }
        });
      }
    }
  }, [dispatch, uiObject, shouldExpand, dualPosition, isMainMenu, effectiveProps, isPanel, updateLocalSettings, state]);

  // Toggle lock for panels/windows
  const handleToggleLock = useCallback(() => {
    dispatch({
      type: 'TOGGLE_LOCK',
      payload: { id: uiObject.id }
    });
  }, [dispatch, uiObject.id]);

  const handleHide = useCallback(() => {
    // Hide panel - for individualObjects layers this is local-only (not synced)
    dispatch({
      type: 'UPDATE_OBJECT',
      payload: { id: uiObject.id, updates: { visible: false } },
      _localOnly: true // Local-only: visibility is not synced
    });
  }, [dispatch, uiObject.id]);

  const handleOpenSettings = useCallback(() => {
    // Only GM can access panel settings - no exceptions for guests
    if (uiObject.type === ItemType.PANEL) {
      if (!isGM) return; // Non-GM players cannot access panel settings
    }

    // For non-panel objects, check permissions
    if (uiObject.type !== ItemType.PANEL) {
      const canConfigure = isHost || playerPermissions.configureObjects;
      if (!canConfigure) return; // Silently do nothing if no permission
    }

    // Check if settings window is already open
    const settingsWindowId = `settings-${uiObject.id}`;
    const existingWindow = state.objects[settingsWindowId];
    if (existingWindow) {
      // Already open, just close it
      dispatch({ type: 'CLOSE_UI_OBJECT', payload: { id: settingsWindowId } });
      return;
    }

    // For all objects including panels, use CREATE_WINDOW with OBJECT_SETTINGS
    // The WindowContent renderer will handle panels specially and show PanelSettingsModal
    dispatch({
      type: 'CREATE_WINDOW',
      payload: {
        windowType: WindowType.OBJECT_SETTINGS,
        title: 'Properties',
        targetObjectId: uiObject.id,
        x: effectiveProps.x + 50,
        y: effectiveProps.y + 50,
      }
    });
  }, [dispatch, uiObject.id, uiObject.type, state.objects, isHost, playerPermissions.configureObjects, effectiveProps.x, effectiveProps.y, isGM]);

  const handleBringToFront = useCallback(() => {
    // Bring to front by setting high z-index
    // UI panels max at 9900, dragging cards are at 9999 (always above)
    dispatch({
      type: 'UPDATE_OBJECT',
      payload: { id: uiObject.id, zIndex: 9900 }
    });
  }, [dispatch, uiObject.id]);

  // Unified resize handler with direct DOM updates
  useEffect(() => {
    if (!canResize || !containerRef.current) return;

    const container = containerRef.current;
    const state = dragResizeStateRef.current;
    const handleSize = 20;

    // Check if this is a pool panel (needs size constraints)
    const isPoolPanel = uiObject.type === ItemType.PANEL && (uiObject as PanelObject).panelType === PanelType.POOL;
    // Max size in pixels for pool panels (1000 VU * pixelsPerVU)
    const maxPoolWidthPx = isPoolPanel ? DEFAULT_POOL_WIDTH * pixelsPerVU : Infinity;
    const maxPoolHeightPx = isPoolPanel ? DEFAULT_POOL_HEIGHT * pixelsPerVU : Infinity;

    const handleMouseDown = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();

      // Only start resize if near bottom-right corner
      if (e.clientX >= rect.right - handleSize &&
          e.clientY >= rect.bottom - handleSize &&
          e.clientX <= rect.right + 10 &&
          e.clientY <= rect.bottom + 10) {

        state.isResizing = true;
        state.startX = e.clientX;
        state.startY = e.clientY;
        state.startLeft = rect.left;
        state.startTop = rect.top;
        state.startWidth = rect.width;
        state.startHeight = rect.height;
        setIsResizing(true);
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();

      // Update hover state when not resizing
      if (!state.isResizing) {
        const isOverHandle = e.clientX >= rect.right - handleSize &&
                            e.clientY >= rect.bottom - handleSize &&
                            e.clientX <= rect.right + 10 &&
                            e.clientY <= rect.bottom + 10;
        setIsHoveringResizeHandle(isOverHandle);
        return;
      }

      // Calculate new size with minimum constraint
      const deltaX = e.clientX - state.startX;
      const deltaY = e.clientY - state.startY;
      const minSize = 200;

      let newWidth = Math.max(minSize, state.startWidth + deltaX);
      let newHeight = Math.max(minSize, state.startHeight + deltaY);

      // Apply pool panel max size constraint
      if (isPoolPanel) {
        newWidth = Math.min(newWidth, maxPoolWidthPx);
        newHeight = Math.min(newHeight, maxPoolHeightPx);
      }

      // Get other panels for panel-to-panel snapping
      const otherPanels: PanelBounds[] = [];
      document.querySelectorAll('[data-ui-object]').forEach(el => {
        const panelId = el.getAttribute('data-ui-object');
        if (panelId && panelId !== uiObject.id) {
          const panelRect = (el as HTMLElement).getBoundingClientRect();
          otherPanels.push({
            id: panelId,
            x: panelRect.left,
            y: panelRect.top,
            width: panelRect.width,
            height: panelRect.height,
          });
        }
      });

      // Get actual scrollbar width from game container
      let actualScrollbarWidth = 0;
      let gameSpaceBottom = window.innerHeight;
      let gameSpaceRight = window.innerWidth;

      const tabletopContainer = document.querySelector('[data-tabletop="true"]') as HTMLElement;
      if (tabletopContainer) {
        actualScrollbarWidth = tabletopContainer.offsetWidth - tabletopContainer.clientWidth;
        const rect = tabletopContainer.getBoundingClientRect();
        gameSpaceBottom = rect.bottom - actualScrollbarWidth;
        gameSpaceRight = rect.right - actualScrollbarWidth;
      }

      // Game space bounds (visible area)
      const gameSpaceBounds: GameSpaceBounds = {
        left: 0,
        top: 0,
        right: gameSpaceRight,
        bottom: gameSpaceBottom
      };

      // Magnetism config
      const magnetismConfig: MagnetismConfig = {
        enabled: true,
        snapThreshold: 15,
        snapToRight: true,
        snapToBottom: true,
        scrollbarWidth: actualScrollbarWidth,
      };

      // Apply full magnetism (viewport edges + panel-to-panel snapping)
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      const magnetismResult = applyResizePanelToPanelMagnetism(
        state.startLeft,
        state.startTop,
        newWidth,
        newHeight,
        viewportWidth,
        viewportHeight,
        otherPanels,
        uiObject.id,
        magnetismConfig,
        gameSpaceBounds
      );

      // Apply directly to DOM - no React state updates during resize
      container.style.width = `${magnetismResult.width}px`;
      container.style.height = `${magnetismResult.height}px`;
    };

    const handleMouseUp = () => {
      if (!state.isResizing) return;

      // Read final size from DOM (what user sees)
      const rect = container.getBoundingClientRect();
      const widthChanged = Math.abs(rect.width - state.startWidth) > 5;
      const heightChanged = Math.abs(rect.height - state.startHeight) > 5;

      // Clear state immediately
      state.isResizing = false;
      state.startX = 0;
      state.startY = 0;
      state.startLeft = 0;
      state.startTop = 0;
      state.startWidth = 0;
      state.startHeight = 0;
      setIsResizing(false);

      // Update state only if size actually changed
      if (widthChanged || heightChanged) {
        justFinishedResizingRef.current = true; // Mark that we just resized (to prevent drag from overwriting)

        const isPinned = uiObject.isPinnedToViewport;
        let finalWidth = isPinned ? rect.width : Math.round((rect.width / pixelsPerVU) * 1000) / 1000;
        let finalHeight = isPinned ? rect.height : Math.round((rect.height / pixelsPerVU) * 1000) / 1000;

        // Apply pool panel max size constraint (in VU)
        if (isPoolPanel) {
          if (!isPinned) {
            finalWidth = Math.min(finalWidth, DEFAULT_POOL_WIDTH);
            finalHeight = Math.min(finalHeight, DEFAULT_POOL_HEIGHT);
          } else {
            // For pinned panels, convert pixels to VU for constraint check
            const finalWidthVU = finalWidth / pixelsPerVU;
            const finalHeightVU = finalHeight / pixelsPerVU;
            finalWidth = Math.min(finalWidthVU, DEFAULT_POOL_WIDTH) * pixelsPerVU;
            finalHeight = Math.min(finalHeightVU, DEFAULT_POOL_HEIGHT) * pixelsPerVU;
          }
        }

        if (isPanel && !isMainMenu) {
          updateLocalSettings({ width: finalWidth, height: finalHeight });
        }

        dispatch({
          type: 'UPDATE_PLAYER_PANEL_SETTINGS',
          payload: {
            playerId: activePlayerId,
            panelId: uiObject.id,
            settings: { width: finalWidth, height: finalHeight }
          }
        });

        dispatch({
          type: 'UPDATE_OBJECT',
          payload: {
            id: uiObject.id,
            width: finalWidth,
            height: finalHeight,
          },
          _localOnly: true
        });
      }
    };

    const handleMouseLeave = () => {
      if (!state.isResizing) {
        setIsHoveringResizeHandle(false);
      }
    };

    container.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      container.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('mouseleave', handleMouseLeave);
      if (state.isResizing) {
        state.isResizing = false;
        setIsResizing(false);
      }
    };
  }, [canResize, isPanel, isMainMenu, pixelsPerVU, uiObject.isPinnedToViewport, uiObject.id, uiObject.type, (uiObject as PanelObject).panelType, activePlayerId, dispatch, updateLocalSettings]);

  // Global mouse up handler to clear shift-drag state
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isShiftDragging) {
        setIsShiftDragging(false);
      }
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isShiftDragging]);

  // Simplified drag size saving - only update on drag end
  useEffect(() => {
    if (!isDragging && containerRef.current) {
      // Skip updating size if we just finished resizing (resize already handled it)
      if (justFinishedResizingRef.current) {
        justFinishedResizingRef.current = false; // Reset flag
        return;
      }

      // Read actual DOM size when drag ends
      const rect = containerRef.current.getBoundingClientRect();
      const isPinned = uiObject.isPinnedToViewport;
      const finalWidth = isPinned ? rect.width : Math.round((rect.width / pixelsPerVU) * 1000) / 1000;
      const finalHeight = isPinned ? rect.height : Math.round((rect.height / pixelsPerVU) * 1000) / 1000;

      // Update playerPanelSettings with actual size
      dispatch({
        type: 'UPDATE_PLAYER_PANEL_SETTINGS',
        payload: {
          playerId: activePlayerId,
          panelId: uiObject.id,
          settings: { width: finalWidth, height: finalHeight }
        }
      });
    }
  }, [isDragging, uiObject.id, uiObject.isPinnedToViewport, activePlayerId, dispatch, pixelsPerVU]);

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

  const pinnedPosition = useMemo(() => {
    return isPinnedMode ? getPinnedPosition() : null;
  }, [isPinnedMode, uiObject]);

  // Simplified width calculation - direct conversion without caching
  const containerWidth = useMemo(() => {
    if (minimized) return 200; // Fixed width when minimized

    // Pinned pixel width takes priority (explicit pixel value)
    if ((uiObject as any).pinnedPixelWidth) return (uiObject as any).pinnedPixelWidth;

    // For pinned-to-viewport panels, use pixels directly
    if (uiObject.isPinnedToViewport) return effectiveProps.width;

    // For all other panels, convert VU to pixels
    return vuToPx(effectiveProps.width);
  }, [minimized, uiObject.isPinnedToViewport, (uiObject as any).pinnedPixelWidth, effectiveProps.width, vuToPx]);

  // Simplified height calculation - direct conversion without caching
  const containerHeight = useMemo(() => {
    if (minimized) return 40; // Title bar height when minimized

    // Pinned pixel height takes priority (explicit pixel value)
    if ((uiObject as any).pinnedPixelHeight) return (uiObject as any).pinnedPixelHeight;

    // For pinned-to-viewport panels, use pixels directly
    if (uiObject.isPinnedToViewport) return effectiveProps.height;

    // For all other panels, convert VU to pixels
    return vuToPx(effectiveProps.height);
  }, [minimized, uiObject.isPinnedToViewport, (uiObject as any).pinnedPixelHeight, effectiveProps.height, vuToPx]);

  // Memoize container style to prevent unnecessary recalculations
  const containerStyle: React.CSSProperties = useMemo(() => {
    const style: React.CSSProperties = {
      position: isPinnedMode ? 'fixed' : 'absolute',
      // For pinned mode: use pinnedScreenPosition (actual screen coordinates)
      // For unpinned mode: convert screen coords to world coords: subtract offset, divide by zoom
      left: isPinnedMode
        ? (pinnedPosition?.x ?? effectiveProps.x)
        : (effectiveProps.x - offset.x) / zoom,
      top: isPinnedMode
        ? (pinnedPosition?.y ?? effectiveProps.y)
        : (effectiveProps.y - offset.y) / zoom,
      // In pinned mode, no scale transform; in unpinned mode, reverse the scale
      transform: isPinnedMode
        ? `rotate(${uiObject.rotation}deg)`
        : `rotate(${uiObject.rotation}deg) scale(${1 / zoom})`,
      transformOrigin: 'top left',
      zIndex: uiObject.zIndex || 1000,
      pointerEvents: 'auto',
      cursor: isShiftDragging ? 'grabbing' : (isHoveringResizeHandle ? 'nwse-resize' : 'auto'),
      // Disable native CSS resize - use custom resize handler
      resize: 'none',
      overflow: 'hidden',
      // Always set dimensions - prevents size jumping on resize start
      // DOM manipulation during resize will override these via inline styles
      width: containerWidth,
      height: containerHeight,
      borderRadius: '5px',
    };

    return style;
  }, [
    isPinnedMode,
    pinnedPosition,
    effectiveProps.x,
    effectiveProps.y,
    offset.x,
    offset.y,
    zoom,
    containerWidth,
    containerHeight,
    uiObject.rotation,
    uiObject.zIndex,
    isShiftDragging,
    isHoveringResizeHandle,
  ]);

  const headerBg = uiObject.type === ItemType.WINDOW
    ? 'bg-purple-800'
    : 'bg-slate-700';

  // Check if an object is being dragged over this pool panel
  const isDragOverPool = isDraggingOverPoolState && targetPoolPanelId === uiObject.id;

  const borderColor = isDragging
    ? 'border-purple-400'
    : isDragOverPool
    ? 'border-purple-400'
    : 'border-slate-600';

  // Early return after all hooks - if not visible, don't render
  if (!visible) {
    return null;
  }

  // Special handling for modal windows that render via portal - don't render window frame
  const isModalWindow = uiObject.type === ItemType.WINDOW &&
    ((uiObject as WindowObject).windowType === WindowType.OBJECT_SETTINGS ||
     (uiObject as WindowObject).windowType === WindowType.HYPERSCALE_LAYER_SETTINGS);
  if (isModalWindow) {
    const windowObj = uiObject as WindowObject;
    // For ALL modal windows (OBJECT_SETTINGS and HYPERSCALE_LAYER_SETTINGS), don't render the window frame
    // The modal renders via portal directly, so we don't need the window frame
    return <WindowContent window={windowObj} />;
  }

  return (
    <div
      ref={containerRef}
      data-ui-object={uiObject.id}
      data-main-menu={isMainMenu ? "true" : undefined}
      data-shift-dragging={isShiftDragging ? "true" : undefined}
      style={containerStyle}
      className={`bg-slate-900 border-2 ${borderColor} shadow-2xl flex flex-col ${
        isShiftDragging || isDragOverPool ? 'ring-2 ring-purple-500 ring-opacity-50' : ''
      }`}
      onContextMenu={(e) => {
        // Prevent default browser context menu
        e.preventDefault();
        // Don't open context menu for panels that show content inside them
        // Context menu should only open for objects within these panels
        const noContextMenuPanels = [
          PanelType.MAIN_MENU, // Main menu panel - no context menu needed
          PanelType.HAND,      // Cards have their own context menu
          PanelType.POOL,      // Objects inside pool have context menu
          PanelType.TABLEAU,   // Cards inside tableau have context menu
          PanelType.TOKENS,    // Token archetypes have settings button
          PanelType.CHARACTER, // Character blocks have settings button
          PanelType.TOOLS,     // Tools panel - no context menu needed
        ];
        if (uiObject.type === ItemType.PANEL && noContextMenuPanels.includes((uiObject as PanelObject).panelType)) {
          return;
        }
        // Call the parent handler if provided
        if (onContextMenu) {
          onContextMenu(e, uiObject);
        }
      }}
      onMouseDown={(e) => {
        // Always bring to front on click
        handleBringToFront();
        // Enable drag when Shift is pressed (drag from anywhere)
        // or when clicking on the container (normal drag behavior)
        if (e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          setIsShiftDragging(true);
          onMouseDown(e, uiObject.id);
        }
        // When Shift is not pressed, let click handlers work
        // Drag is handled by the header/title bar
      }}
      onMouseUp={(_e) => {
        if (isShiftDragging) {
          setIsShiftDragging(false);
        }
      }}
      onMouseLeave={(_e) => {
        if (isShiftDragging) {
          setIsShiftDragging(false);
        }
      }}
    >
      {/* Header / Title Bar */}
      {isMainMenu ? (
        // Main Menu header - always shown, but different when minimized
        <div
          className={`${headerBg} px-2 py-1 flex items-center select-none flex-shrink-0`}
          style={{ height: 40, position: 'relative' }}
        >
          {/* Left side - Game name and support button */}
          <div
            className="flex items-center gap-2 truncate cursor-move"
            style={{ flex: 1, minWidth: 0, pointerEvents: 'auto' }}
            onMouseDown={(e) => {
              // Don't handle normal drag when Shift is pressed - let the container's Shift+drag take over
              if (e.shiftKey || isShiftDragging) {
                e.stopPropagation();
                return;
              }
              e.stopPropagation();
              handleBringToFront();

              onMouseDown(e, uiObject.id);
            }}
          >
            <span className="text-sm font-bold text-white truncate">{APP_NAME}</span>
            {!minimized && (
              <button
                onClick={(e) => {
                  if (shouldBlockClick(e)) return;
                  e.stopPropagation();
                  setShowSupportModal(true);
                }}
                className="text-sm text-purple-400 hover:text-purple-300 flex-shrink-0 transition-colors"
              >
                [{translate('Links', language as Locale)}]
              </button>
            )}
          </div>
          {/* Right side - Control buttons */}
          <div
            className="flex items-center gap-0.5 flex-shrink-0 ml-1"
            style={{ pointerEvents: isShiftDragging ? 'none' : 'auto' }}
          >
            {!minimized && (
              <>
                {/* Settings button - visible to all */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowGameSettings(true);
                  }}
                  className="p-0.5 hover:bg-white/20 rounded transition-colors"
                  title={translate('Settings', language as Locale)}
                >
                  <Settings size={14} className="text-white" />
                </button>
                {/* Lock button - available for all players */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleLock();
                  }}
                  className={`p-0.5 hover:bg-white/20 rounded transition-colors ${uiObject.locked ? 'bg-purple-600' : ''}`}
                  title={uiObject.locked ? 'Unlock' : 'Lock'}
                >
                  {uiObject.locked ? <Unlock size={14} className="text-white" /> : <Lock size={14} className="text-white" />}
                </button>
              </>
            )}
            {/* Lock button for collapsed state - available for all players */}
            {minimized && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleLock();
                }}
                className={`p-0.5 hover:bg-white/20 rounded transition-colors ${uiObject.locked ? 'bg-purple-600' : ''}`}
                title={uiObject.locked ? 'Unlock' : 'Lock'}
              >
                {uiObject.locked ? <Unlock size={14} className="text-white" /> : <Lock size={14} className="text-white" />}
              </button>
            )}
            {/* Minimize/Expand button - available for all players */}
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
          style={{ height: 40, position: 'relative' }}
        >
          {/* Drag handle - only this area triggers drag */}
          <div
            className="text-sm font-semibold text-white truncate cursor-move"
            style={{ flex: 1, minWidth: 0, pointerEvents: 'auto' }}
            onMouseDown={(e) => {
              // Don't handle normal drag when Shift is pressed - let the container's Shift+drag take over
              if (e.shiftKey || isShiftDragging) {
                e.stopPropagation();
                return;
              }
              e.stopPropagation();
              handleBringToFront();
              onMouseDown(e, uiObject.id);
            }}
          >
            {uiObject.title}
          </div>
          {/* Buttons container - separate from drag handle */}
          <div
            className="flex items-center gap-0.5 flex-shrink-0 ml-1"
            style={{ pointerEvents: isShiftDragging ? 'none' : 'auto' }}
          >
            {uiObject.type === ItemType.PANEL ? (
              <>
                {/* Settings button - only shown to GM when expanded */}
                {!isCollapsed && isGM && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenSettings();
                    }}
                    className="p-0.5 hover:bg-white/20 rounded transition-colors"
                    title="Properties"
                  >
                    <Settings size={14} className="text-white" />
                  </button>
                )}
                {/* Lock button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleLock();
                  }}
                  className={`p-0.5 rounded transition-colors ${uiObject.locked ? 'bg-purple-600 hover:bg-purple-500' : 'hover:bg-white/20'}`}
                  title={uiObject.locked ? 'Unlock' : 'Lock'}
                >
                  {uiObject.locked ? <Unlock size={14} className="text-white" /> : <Lock size={14} className="text-white" />}
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
              // Windows have lock and close buttons
              <>
                {/* Lock button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleLock();
                  }}
                  className={`p-0.5 rounded transition-colors ${uiObject.locked ? 'bg-purple-600 hover:bg-purple-500' : 'hover:bg-white/20'}`}
                  title={uiObject.locked ? 'Unlock' : 'Lock'}
                >
                  {uiObject.locked ? <Unlock size={14} className="text-white" /> : <Lock size={14} className="text-white" />}
                </button>
                {/* Close button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClose();
                  }}
                  className="p-0.5 hover:bg-purple-500 rounded transition-colors"
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
        <div
          ref={contentRef}
          className="flex-1 overflow-hidden w-full relative"
          onMouseDown={(e) => {
            // Prevent all clicks when Shift is held and dragging
            if (e.shiftKey || isShiftDragging) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          onClick={(e) => {
            // Prevent click events during Shift drag
            if (isShiftDragging) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        >
          <div
            className="h-full w-full"
            style={{ pointerEvents: isShiftDragging ? 'none' : 'auto' }}
          >
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
                  <PanelContent panel={uiObject as PanelObject} effectiveProps={effectiveProps} />
                )}
                {uiObject.type === ItemType.WINDOW && (
                  <WindowContent window={uiObject as WindowObject} />
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Game Settings Modal for Main Menu */}
      {isMainMenu && showGameSettings && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/40" onClick={() => setShowGameSettings(false)}>
          <div className="bg-slate-800 rounded-lg shadow-xl w-[575px] border border-slate-600 max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex justify-center items-center py-2 px-4">
              <h3 className="text-base font-bold text-white">{translate('Game Settings', language as Locale)}</h3>
            </div>

            {/* Content */}
            <div
              className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin"
              data-scrollable="true"
            >
              {/* Version Info */}
              <div className="text-sm text-gray-400 pb-3 border-b border-slate-700">
                <p>{APP_NAME} v{APP_VERSION}</p>
              </div>

              {/* Language Settings */}
              <div className="pt-2">
                <h4 className="text-sm font-bold text-gray-300 mb-2">{translate('Language', language as Locale)}</h4>
                <select
                  value={language || 'en'}
                  onChange={async (e) => {
                    const newLang = e.target.value as AppLanguage;
                    await preloadTranslations(newLang as Locale);
                    setLanguage(newLang);
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

              {/* Interface Style Settings */}
              <div className="pt-3 pb-2 border-t border-slate-700">
                <h4 className="text-sm font-bold text-gray-300 mb-2 flex items-center gap-2">
                  <Palette size={14} />
                  {translate('Interface Style', language as Locale)}
                </h4>
                <div className="relative">
                  <select
                    value={localSettings.interfaceStyle || 'default'}
                    onChange={(e) => updateSetting('interfaceStyle', e.target.value as LocalSettings['interfaceStyle'])}
                    disabled={!showStyleSelector}
                    className={`w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-white text-sm appearance-none transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                      showStyleSelector
                        ? 'cursor-pointer hover:bg-slate-800'
                        : 'cursor-not-allowed opacity-50'
                    }`}
                  >
                    <option value="default">{translate('Default', language as Locale)}</option>
                    <option value="dark-fantasy">{translate('Dark Fantasy', language as Locale)}</option>
                    <option value="fairy-tale">{translate('Fairy Tale', language as Locale)}</option>
                    <option value="cosmos">{translate('Cosmos', language as Locale)}</option>
                    <option value="science">{translate('Science', language as Locale)}</option>
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <Palette size={16} className={showStyleSelector ? "text-gray-400" : "text-gray-600"} />
                  </div>
                </div>
              </div>

              {/* Player Permissions */}
              {isGM && (
                <div className="pt-3 pb-2 border-t border-slate-700">
                  <h4 className="text-sm font-bold text-gray-300 mb-2">{translate('Player Permissions', language as Locale)}</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center justify-between bg-slate-900 rounded px-3 py-2 cursor-pointer ">
                      <span className="text-xs text-gray-300">{translate('Create Objects', language as Locale)}</span>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          dispatch({
                            type: 'UPDATE_PLAYER_PERMISSIONS',
                            payload: { ...playerPermissions, createObjects: !playerPermissions.createObjects }
                          });
                        }}
                        className={`w-10 h-5 rounded-full transition-colors ${
                          playerPermissions.createObjects ? 'bg-green-600' : 'bg-slate-700'
                        }`}
                      >
                        <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                          playerPermissions.createObjects ? 'translate-x-5' : 'translate-x-0.5'
                        }`} />
                      </button>
                    </label>
                    <label className="flex items-center justify-between bg-slate-900 rounded px-3 py-2 cursor-pointer ">
                      <span className="text-xs text-gray-300">{translate('Configure Objects (Settings)', language as Locale)}</span>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          dispatch({
                            type: 'UPDATE_PLAYER_PERMISSIONS',
                            payload: { ...playerPermissions, configureObjects: !playerPermissions.configureObjects }
                          });
                        }}
                        className={`w-10 h-5 rounded-full transition-colors ${
                          playerPermissions.configureObjects ? 'bg-green-600' : 'bg-slate-700'
                        }`}
                      >
                        <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                          playerPermissions.configureObjects ? 'translate-x-5' : 'translate-x-0.5'
                        }`} />
                      </button>
                    </label>
                    <label className="flex items-center justify-between bg-slate-900 rounded px-3 py-2 cursor-pointer ">
                      <span className="text-xs text-gray-300">{translate('Delete Objects', language as Locale)}</span>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          dispatch({
                            type: 'UPDATE_PLAYER_PERMISSIONS',
                            payload: { ...playerPermissions, deleteObjects: !playerPermissions.deleteObjects }
                          });
                        }}
                        className={`w-10 h-5 rounded-full transition-colors ${
                          playerPermissions.deleteObjects ? 'bg-green-600' : 'bg-slate-700'
                        }`}
                      >
                        <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                          playerPermissions.deleteObjects ? 'translate-x-5' : 'translate-x-0.5'
                        }`} />
                      </button>
                    </label>
                    <label className="flex items-center justify-between bg-slate-900 rounded px-3 py-2 cursor-pointer ">
                      <span className="text-xs text-gray-300">{translate('Show/Hide Objects', language as Locale)}</span>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          dispatch({
                            type: 'UPDATE_PLAYER_PERMISSIONS',
                            payload: { ...playerPermissions, hideObjects: !playerPermissions.hideObjects }
                          });
                        }}
                        className={`w-10 h-5 rounded-full transition-colors ${
                          playerPermissions.hideObjects ? 'bg-green-600' : 'bg-slate-700'
                        }`}
                      >
                        <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                          playerPermissions.hideObjects ? 'translate-x-5' : 'translate-x-0.5'
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
                  {translate('Effects', language as Locale)}
                </h4>
                <label
                  className="flex items-center justify-between bg-slate-900 rounded px-3 py-2 cursor-pointer "
                  title={translate('Show ghost/locked version of objects when another player has them in cursor slot', language as Locale)}
                >
                  <span className="text-xs text-gray-300">{translate('Show shadow objects held by other players', language as Locale)}</span>
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
                  {translate('Hotkeys', language as Locale)}
                </h4>

                <div className="grid grid-cols-2 gap-1.5">
                  <div className="bg-slate-900 rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-700">
                      <span className="text-xs text-gray-300">{translate('Undo', language as Locale)}</span>
                      <kbd className="px-2 py-1 bg-slate-700 rounded text-xs text-gray-400 font-mono">Ctrl+Z</kbd>
                    </div>
                    <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-700">
                      <span className="text-xs text-gray-300">{translate('Close tooltip/menu', language as Locale)}</span>
                      <kbd className="px-2 py-1 bg-slate-700 rounded text-xs text-gray-400 font-mono">Esc</kbd>
                    </div>
                    <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-700">
                      <span className="text-xs text-gray-300">{translate('Add to cursor slot', language as Locale)}</span>
                      <kbd className="px-2 py-1 bg-slate-700 rounded text-xs text-gray-400 font-mono">Ctrl+Click</kbd>
                    </div>
                    <div className="flex items-center justify-between px-3 py-1.5">
                      <span className="text-xs text-gray-300">{translate('Delete without confirmation', language as Locale)}</span>
                      <kbd className="px-2 py-1 bg-slate-700 rounded text-xs text-gray-400 font-mono">Shift+Delete</kbd>
                    </div>
                  </div>
                  <div className="bg-slate-900 rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-700">
                      <span className="text-xs text-gray-300">{translate('Pan view (hold + drag)', language as Locale)}</span>
                      <kbd className="px-2 py-1 bg-slate-700 rounded text-xs text-gray-400 font-mono">Shift+Drag</kbd>
                    </div>
                    <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-700">
                      <span className="text-xs text-gray-300">{translate('Move the drawing', language as Locale)}</span>
                      <kbd className="px-2 py-1 bg-slate-700 rounded text-xs text-gray-400 font-mono">Shift+Marker</kbd>
                    </div>
                    <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-700">
                      <span className="text-xs text-gray-300">{translate('Delete entire drawing', language as Locale)}</span>
                      <kbd className="px-2 py-1 bg-slate-700 rounded text-xs text-gray-400 font-mono">Shift+Eraser</kbd>
                    </div>
                    <div className="flex items-center justify-between px-3 py-1.5">
                      <span className="text-xs text-gray-300">{translate('Normal cursor mode', language as Locale)}</span>
                      <kbd className="px-2 py-1 bg-slate-700 rounded text-xs text-gray-400 font-mono">Alt+Marker</kbd>
                    </div>
                  </div>
                </div>
              </div>

              {/* Connection Settings Section */}
              <div className="pt-3 pb-2 border-t border-slate-700">
                <h4 className="text-sm font-bold text-gray-300 mb-2 flex items-center gap-2">
                  <Network size={14} />
                  {translate('Connection Settings', language as Locale)}
                </h4>

                {/* Connection Method Selector */}
                <div className="bg-slate-900 rounded px-3 py-2 mb-3">
                  <label className="text-xs text-gray-300 block mb-2">{translate('Connection Method', language as Locale)}</label>
                  <select
                    value={connectionSettings.connectionMethod || 'peerjs'}
                    onChange={(e) => {
                      const method = e.target.value as 'peerjs' | 'iroh' | 'trystero';
                      updateConnectionSettings({ connectionMethod: method });
                      setConnectionSettings(getConnectionSettings());
                    }}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500"
                  >
                    <option value="peerjs">{translate('PeerJS (WebRTC)', language as Locale)}</option>
                    <option value="iroh" disabled={!isIrohUnlocked}>{translate('Iroh (P2P)', language as Locale)}</option>
                    <option value="trystero" disabled={!isTrysteroUnlocked}>{translate('Trystero (Torrent)', language as Locale)}</option>
                  </select>
                </div>

                {/* Custom Signaling Servers */}
                <div className="bg-slate-900 rounded px-3 py-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-300">{translate('Custom Signaling Servers', language as Locale)}</span>
                    <div className="flex gap-1">
                      {connectionSettings.customSignalingServers.length > 0 && (
                        <button
                          onClick={() => {
                            if (confirm(translate('Clear all custom servers?', language as Locale))) {
                              clearCustomSignalingServers();
                              setConnectionSettings(getConnectionSettings());
                            }
                          }}
                          className="p-1 hover:bg-red-600 rounded transition-colors"
                          title={translate('Clear all', language as Locale)}
                        >
                          <Trash2 size={12} className="text-gray-400" />
                        </button>
                      )}
                      <button
                        onClick={() => setShowAddServerForm(!showAddServerForm)}
                        className="p-1 hover:bg-green-600 rounded transition-colors"
                        title={translate('Add server', language as Locale)}
                      >
                        {showAddServerForm ? <XCircle size={12} className="text-gray-400" /> : <PlusCircle size={12} className="text-gray-400" />}
                      </button>
                    </div>
                  </div>

                  {/* Add Server Form */}
                  {showAddServerForm && (
                    <div className="space-y-2 mb-2 p-2 bg-slate-800 rounded">
                      <input
                        type="text"
                        placeholder={translate('Host (e.g., server.example.com)', language as Locale)}
                        value={newServerHost}
                        onChange={(e) => setNewServerHost(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-xs"
                      />
                      <div className="flex gap-2">
                        <input
                          type="number"
                          placeholder={translate('Port', language as Locale)}
                          value={newServerPort}
                          onChange={(e) => setNewServerPort(e.target.value)}
                          className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-xs"
                        />
                        <input
                          type="text"
                          placeholder={translate('Path (optional)', language as Locale)}
                          value={newServerPath}
                          onChange={(e) => setNewServerPath(e.target.value)}
                          className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-xs"
                        />
                      </div>
                      <label className="flex items-center gap-2 text-xs text-gray-300">
                        <input
                          type="checkbox"
                          checked={newServerSecure}
                          onChange={(e) => setNewServerSecure(e.target.checked)}
                          className="rounded"
                        />
                        {translate('Use SSL/TLS (HTTPS)', language as Locale)}
                      </label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            if (newServerHost.trim()) {
                              updateConnectionSettings({
                                customSignalingServers: [
                                  ...connectionSettings.customSignalingServers,
                                  {
                                    host: newServerHost.trim(),
                                    port: parseInt(newServerPort) || 443,
                                    secure: newServerSecure,
                                    path: newServerPath.trim() || undefined,
                                    name: newServerHost.trim(),
                                  }
                                ]
                              });
                              setConnectionSettings(getConnectionSettings());
                              setNewServerHost('');
                              setNewServerPort('443');
                              setNewServerPath('/peerjs');
                              setNewServerSecure(true);
                              setShowAddServerForm(false);
                            }
                          }}
                          className="flex-1 px-2 py-1 bg-green-600 hover:bg-green-500 text-white rounded text-xs transition-colors"
                        >
                          {translate('Add', language as Locale)}
                        </button>
                        <button
                          onClick={() => {
                            setShowAddServerForm(false);
                            setNewServerHost('');
                            setNewServerPort('443');
                            setNewServerPath('/peerjs');
                            setNewServerSecure(true);
                          }}
                          className="flex-1 px-2 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs transition-colors"
                        >
                          {translate('Cancel', language as Locale)}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Server List */}
                  <div className="space-y-1">
                    {connectionSettings.customSignalingServers.length === 0 ? (
                      <div className="text-xs text-gray-500 italic py-1">
                        {translate('No custom servers added', language as Locale)}
                      </div>
                    ) : (
                      connectionSettings.customSignalingServers.map((server, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between bg-slate-800 rounded px-2 py-1"
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <Server size={10} className={server.secure ? 'text-green-400' : 'text-yellow-400'} />
                            <span className="text-xs text-gray-300 truncate">
                              {server.host}:{server.port}
                            </span>
                          </div>
                          <button
                            onClick={() => {
                              removeCustomSignalingServer(index);
                              setConnectionSettings(getConnectionSettings());
                            }}
                            className="p-0.5 hover:bg-red-600 rounded transition-colors"
                            title={translate('Remove', language as Locale)}
                          >
                            <X size={12} className="text-gray-400" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Storage & Cache Section */}
              <div className="pt-3 pb-2 border-t border-slate-700">
                <h4 className="text-sm font-bold text-gray-300 mb-2">{translate('Storage & Cache', language as Locale)}</h4>

                {hasSavedGameState() && (
                  <div className="bg-slate-900 rounded px-3 py-2 mb-3">
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <Clock size={12} />
                      <span>{translate('Last save: ', language as Locale)}{formatTimestamp(getSavedGameTimestamp() || 0)}</span>
                    </div>
                  </div>
                )}

                <button
                  onClick={() => {
                    if (confirm(translate('Are you sure you want to clear all saved game data? This action cannot be undone.', language as Locale))) {
                      dispatch({ type: 'CLEAR_SAVED_STATE' });
                      // Reload page to start fresh
                      window.location.reload();
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded transition-colors text-sm"
                >
                  <Trash2 size={14} />
                  <span>{translate('Clear Cache', language as Locale)}</span>
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 p-4 border-t border-slate-700">
              <button
                onClick={() => setShowGameSettings(false)}
                className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-500 text-white rounded font-medium"
              >
                {translate('Close', language as Locale)}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Support Modal */}
      {isMainMenu && showSupportModal && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/40" onClick={() => setShowSupportModal(false)}>
          <div className="bg-slate-800 rounded-lg shadow-xl w-[575px] border border-slate-600" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-center items-center py-2 px-4 border-b border-slate-700">
              <h3 className="text-base font-bold text-white">{translate('Links', language as Locale)}</h3>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-400 text-center mb-6">
                {translate('Follow me on social media or support my work through donations!', language as Locale)}
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
      {/* Resize handle indicator - shown in bottom-right corner */}
      <PanelResizeHandleMemo
        isVisible={canResize && !minimized}
        isHovering={isHoveringResizeHandle}
        zoom={zoom}
        size={16}
        type="square"
      />
      {/* Invisible overlay to prevent scrollbar from capturing mouse over resize handle */}
      {canResize && !minimized && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: '32px',
            height: '32px',
            pointerEvents: 'auto',
            cursor: 'nwse-resize',
            zIndex: 10,
          }}
          onMouseDown={(e) => {
            // Forward mousedown to container for resize handling
            const container = containerRef.current;
            if (container) {
              // Simulate mousedown on the resize handle
              const mouseDownEvent = new MouseEvent('mousedown', {
                bubbles: true,
                cancelable: true,
                clientX: e.clientX,
                clientY: e.clientY,
                button: e.button,
                buttons: e.buttons,
              });
              container.dispatchEvent(mouseDownEvent);
            }
          }}
        />
      )}
    </div>
  );
};

// Panel content renderer
const PanelContent: React.FC<{ panel: PanelObject; effectiveProps: any }> = ({ panel, effectiveProps }) => {
  switch (panel.panelType) {
    case PanelType.MAIN_MENU:
      // Render the Main Menu content inside the panel (without outer wrapper)
      return <MainMenuContentWithDragDetection panel={panel} />;
    case PanelType.HAND:
      return <HandPanelWithShiftDragDetection panel={panel} effectiveProps={effectiveProps} />;
    case PanelType.CHARACTER:
      return <CharacterPanelWithDragDetection panel={panel} />;
    case PanelType.TABLEAU:
      return <TableauPanelWithDragDetection panel={panel} />;
    case PanelType.POOL:
      return <PoolPanelWithDragDetection panel={panel} />;
    case PanelType.TOOLS:
      return <ToolsPanelWithDragDetection panel={panel} effectiveProps={effectiveProps} />;
    case PanelType.TOKENS:
      return <TokensPanelWithDragDetection panel={panel} effectiveProps={effectiveProps} />;
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

// CharacterPanel with Shift+drag detection
const CharacterPanelWithDragDetection: React.FC<{ panel: PanelObject }> = ({ panel }) => {
  const [isShiftDragging, setIsShiftDragging] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Global mouse up handler to clear shift-drag state
  React.useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isShiftDragging) {
        setIsShiftDragging(false);
      }
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isShiftDragging]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      setIsShiftDragging(true);

      // Find the UIObjectRenderer container and trigger its drag
      const uiObjectContainer = containerRef.current?.closest('[data-ui-object]') as HTMLElement;
      if (uiObjectContainer) {
        // Simulate mouse down on the container for drag
        const mouseDownEvent = new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          clientX: e.clientX,
          clientY: e.clientY,
          button: e.button,
          shiftKey: true
        });
        uiObjectContainer.dispatchEvent(mouseDownEvent);
      }
    }
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      style={{ pointerEvents: isShiftDragging ? 'none' : 'auto' }}
      className="h-full"
    >
      <CharacterPanel panel={panel} />
    </div>
  );
};

// MainMenuContent with Shift+drag detection
const MainMenuContentWithDragDetection: React.FC<{ panel: PanelObject }> = ({ panel }) => {
  const [isShiftDragging, setIsShiftDragging] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Global mouse up handler to clear shift-drag state
  React.useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isShiftDragging) {
        setIsShiftDragging(false);
      }
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isShiftDragging]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      setIsShiftDragging(true);

      // Find the UIObjectRenderer container and trigger its drag
      const uiObjectContainer = containerRef.current?.closest('[data-ui-object]') as HTMLElement;
      if (uiObjectContainer) {
        // Simulate mouse down on the container for drag
        const mouseDownEvent = new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          clientX: e.clientX,
          clientY: e.clientY,
          button: e.button,
          shiftKey: true
        });
        uiObjectContainer.dispatchEvent(mouseDownEvent);
      }
    }
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      style={{ pointerEvents: isShiftDragging ? 'none' : 'auto' }}
      className="h-full"
    >
      <MainMenuContent width={panel.width} />
    </div>
  );
};

// HandPanel with Shift+drag detection and card drag detection
const HandPanelWithShiftDragDetection: React.FC<{ panel: PanelObject; effectiveProps: any }> = ({ panel: _panel, effectiveProps }) => {
  const [isShiftDragging, setIsShiftDragging] = React.useState(false);
  const [isCardDragTarget, setIsCardDragTarget] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const { state } = useGame();
  const language = useLanguage();

  // Global mouse up handler to clear shift-drag state
  React.useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isShiftDragging) {
        setIsShiftDragging(false);
      }
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isShiftDragging]);

  // Card drag detection
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
      setIsCardDragTarget(isOver);
    };

    const handleDragEnd = () => {
      setIsCardDragTarget(false);
    };

    window.addEventListener('card-drag-move', handleDragMove);
    window.addEventListener('card-drag-end', handleDragEnd);

    return () => {
      window.removeEventListener('card-drag-move', handleDragMove);
      window.removeEventListener('card-drag-end', handleDragEnd);
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      setIsShiftDragging(true);

      // Find the UIObjectRenderer container and trigger its drag
      const uiObjectContainer = containerRef.current?.closest('[data-ui-object]') as HTMLElement;
      if (uiObjectContainer) {
        // Simulate mouse down on the container for drag
        const mouseDownEvent = new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          clientX: e.clientX,
          clientY: e.clientY,
          button: e.button,
          shiftKey: true
        });
        uiObjectContainer.dispatchEvent(mouseDownEvent);
      }
    }
  };

  const isCollapsed = effectiveProps.minimized || false;

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      style={{ pointerEvents: isShiftDragging ? 'none' : 'auto' }}
      className="h-full flex flex-col w-full"
    >
      <HandPanel isDragTarget={isCardDragTarget} isCollapsed={isCollapsed} language={language} />
    </div>
  );
};

// PoolPanel with Shift+drag detection
const PoolPanelWithDragDetection: React.FC<{ panel: PanelObject }> = ({ panel }) => {
  const [isShiftDragging, setIsShiftDragging] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const { state } = useGame();
  const language = useLanguage();

  // Global mouse up handler to clear shift-drag state
  React.useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isShiftDragging) {
        setIsShiftDragging(false);
      }
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isShiftDragging]);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only handle Shift+drag for panel movement
    // Let other key combinations (Ctrl, etc.) pass through to children
    if (e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      setIsShiftDragging(true);

      // Find the UIObjectRenderer container and trigger its drag
      const uiObjectContainer = containerRef.current?.closest('[data-ui-object]') as HTMLElement;
      if (uiObjectContainer) {
        // Simulate mouse down on the container for drag
        const mouseDownEvent = new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          clientX: e.clientX,
          clientY: e.clientY,
          button: e.button,
          shiftKey: true
        });
        uiObjectContainer.dispatchEvent(mouseDownEvent);
      }
      return;
    }

    // Don't prevent default or stop propagation for other key combinations
    // Let them pass through to children (PoolTabletop)
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      style={{ pointerEvents: isShiftDragging ? 'none' : 'auto' }}
      className="h-full"
    >
      <PoolPanel panel={panel} language={language} />
    </div>
  );
};

// TableauPanel with Shift+drag detection
const TableauPanelWithDragDetection: React.FC<{ panel: PanelObject }> = ({ panel }) => {
  const [isShiftDragging, setIsShiftDragging] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Global mouse up handler to clear shift-drag state
  React.useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isShiftDragging) {
        setIsShiftDragging(false);
      }
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isShiftDragging]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      setIsShiftDragging(true);

      // Find the UIObjectRenderer container and trigger its drag
      const uiObjectContainer = containerRef.current?.closest('[data-ui-object]') as HTMLElement;
      if (uiObjectContainer) {
        // Simulate mouse down on the container for drag
        const mouseDownEvent = new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          clientX: e.clientX,
          clientY: e.clientY,
          button: e.button,
          shiftKey: true
        });
        uiObjectContainer.dispatchEvent(mouseDownEvent);
      }
    }
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      style={{ pointerEvents: isShiftDragging ? 'none' : 'auto' }}
      className="h-full"
    >
      <TableauPanel panel={panel} />
    </div>
  );
};

// ToolsPanel with Shift+drag detection
const ToolsPanelWithDragDetection: React.FC<{ panel: PanelObject; effectiveProps: any }> = ({ panel: _panel, effectiveProps }) => {
  const [isShiftDragging, setIsShiftDragging] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const { state } = useGame();
  const language = useLanguage();

  // Global mouse up handler to clear shift-drag state
  React.useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isShiftDragging) {
        setIsShiftDragging(false);
      }
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isShiftDragging]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      setIsShiftDragging(true);

      // Find the UIObjectRenderer container and trigger its drag
      const uiObjectContainer = containerRef.current?.closest('[data-ui-object]') as HTMLElement;
      if (uiObjectContainer) {
        // Simulate mouse down on the container for drag
        const mouseDownEvent = new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          clientX: e.clientX,
          clientY: e.clientY,
          button: e.button,
          shiftKey: true
        });
        uiObjectContainer.dispatchEvent(mouseDownEvent);
      }
    }
  };

  const isCollapsed = effectiveProps.minimized || false;

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      style={{ pointerEvents: isShiftDragging ? 'none' : 'auto' }}
      className="h-full"
    >
      <PanelToolsPanel width={effectiveProps.width} isCollapsed={isCollapsed} language={language} />
    </div>
  );
};

// TokensPanel with Shift+drag detection
const TokensPanelWithDragDetection: React.FC<{ panel: PanelObject; effectiveProps: any }> = ({ panel: _panel, effectiveProps }) => {
  const [isShiftDragging, setIsShiftDragging] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const { state } = useGame();
  const language = useLanguage();

  // Global mouse up handler to clear shift-drag state
  React.useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isShiftDragging) {
        setIsShiftDragging(false);
      }
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isShiftDragging]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      setIsShiftDragging(true);

      // Find the UIObjectRenderer container and trigger its drag
      const uiObjectContainer = containerRef.current?.closest('[data-ui-object]') as HTMLElement;
      if (uiObjectContainer) {
        // Simulate mouse down on the container for drag
        const mouseDownEvent = new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          clientX: e.clientX,
          clientY: e.clientY,
          button: e.button,
          shiftKey: true
        });
        uiObjectContainer.dispatchEvent(mouseDownEvent);
      }
    }
  };

  const isCollapsed = effectiveProps.minimized || false;

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      style={{ pointerEvents: isShiftDragging ? 'none' : 'auto' }}
      className="h-full"
    >
      <TokensPanel width={effectiveProps.width} isCollapsed={isCollapsed} language={language} />
    </div>
  );
};

// Window content renderer
const WindowContent: React.FC<{ window: WindowObject }> = ({ window: windowObj }) => {
  const { state, dispatch } = useGame();
  const language = useLanguage();
  const hyperscaleLayers = useHyperscaleLayers();

  const handleClose = () => {
    dispatch({ type: 'CLOSE_UI_OBJECT', payload: { id: windowObj.id } });
  };

  switch (windowObj.windowType) {
    case WindowType.OBJECT_SETTINGS:
      const targetObj = windowObj.targetObjectId ? state.objects[windowObj.targetObjectId] : null;

      if (!targetObj) {
        // Object not found, close the window immediately
        handleClose();
        return null;
      }

      // Check if this is a panel - panels have their own settings modal
      if (targetObj.type === ItemType.PANEL) {
        const targetPanel = targetObj as PanelObject;
        // Show panel settings for all panels
        return <PanelSettingsModal panel={targetPanel} onClose={handleClose} language={language} />;
      }

      // For non-panel objects, use the regular ObjectSettingsModal
      return (
        <ObjectSettingsModal
          object={targetObj}
          allObjects={state.objects}
          language={language}
          diceGroups={state.diceGroups}
          dispatch={dispatch}
          onClose={handleClose}
          onSave={(updatedObj) => {
            dispatch({ type: 'UPDATE_OBJECT', payload: { id: updatedObj.id, updates: updatedObj } });
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
          language={language}
        />
      ) : null;
    case WindowType.HYPERSCALE_LAYER_SETTINGS:
      const targetLayer = windowObj.targetLayerId
        ? hyperscaleLayers.find(l => l.id === windowObj.targetLayerId)
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
          language={language}
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

export const UIObjectRendererOptimizedMemo = React.memo(UIObjectRendererOptimized, (prevProps, nextProps) => {
  // Custom comparison for better performance
  return (
    prevProps.uiObject.id === nextProps.uiObject.id &&
    prevProps.uiObject.x === nextProps.uiObject.x &&
    prevProps.uiObject.y === nextProps.uiObject.y &&
    prevProps.uiObject.width === nextProps.uiObject.width &&
    prevProps.uiObject.height === nextProps.uiObject.height &&
    prevProps.uiObject.minimized === nextProps.uiObject.minimized &&
    prevProps.uiObject.locked === nextProps.uiObject.locked &&
    prevProps.isDragging === nextProps.isDragging &&
    prevProps.zoom === nextProps.zoom &&
    prevProps.isPinnedMode === nextProps.isPinnedMode &&
    prevProps.onContextMenu === nextProps.onContextMenu
  );
});

