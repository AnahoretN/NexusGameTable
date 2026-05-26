import { t as translate, Locale } from '../utils/translations';
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useHandCardScale } from '../hooks/useHandCardScale';
import { useLocalSettings } from '../hooks/useLocalSettings';
import { createPortal } from 'react-dom';
import { useGame, GameState } from '../store/GameContext';
import { useActivePlayerId, useIsGM, usePlayerList, useViewTransform, usePlayerPermissions, useLanguage, useHyperscaleLayers, useSelectedLayers } from '../store/contexts';
import { AppLanguage } from '../types';
import { logger } from '../utils/logger';
import { findGM } from '../utils/playerUtils';
import { findLocalFilePaths } from '../utils/imageCompat';
import { saveSession, loadSession } from '../utils/sessionStorage';
import { saveGameState } from '../utils/gameStorage';
import { ItemType, TableObject, Token, Deck, DiceObject, Counter, TokenShape, GridType, CardShape, CardOrientation, PanelType, Board, WindowType, PanelObject, TokenType, Drawing, BattlefieldCell, NexusBoard, NexusCellObject, HexDirection, ContextAction } from '../types';
import { Dices, User, Crown, ChevronDown, ChevronRight, Plus, LayoutGrid, CircleDot, Square, Component, Box, Lock, Unlock, Trash2, Library, Save, Upload, Link as LinkIcon, CheckCircle, Hand, Eye, EyeOff, Layers, CreditCard, Asterisk, PanelLeft, Settings, Pencil, Pen, Eraser, Ruler, MousePointer2, Brush, FileText, Rows, Wrench, Network, X, Copy, Loader2, Search, Package, Clock, Target, AlertCircle, Shuffle, RefreshCw } from 'lucide-react';
import { TOKEN_SIZE, DEFAULT_DECK_WIDTH, DEFAULT_DECK_HEIGHT, DEFAULT_DICE_SIZE, DEFAULT_COUNTER_WIDTH, DEFAULT_COUNTER_HEIGHT, MAIN_MENU_WIDTH, DEFAULT_PANEL_WIDTH, DEFAULT_PANEL_HEIGHT } from '../constants';
import { calculatePixelsPerVU, pixelsToVu } from '../utils/vuSystem';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { ObjectSettingsModal } from './ObjectSettingsModal';
import { HandPanelOptimized as HandPanel } from './HandPanelOptimized';
import { PlayerNameModal } from './PlayerNameModal';
import { generateUUID } from '../utils/uuid';
import { useToolSettings, useDrawingTool, DrawingTool } from '../contexts/ToolSettingsContext';
import { SvgTokenShape } from './SvgTokenShape';
import { LayersPanel } from './LayersPanel';
import { useManualConnection, testWebRTCConnectivity } from '../store/useManualConnection';
import { createPack, loadPack } from '../utils/packManager';
import { clearGameState } from '../utils/gameStorage';
import { clearResolvedImageCache } from './SvgTokenShape';
import { PackLoadingModal, PackLoadingStep } from './PackLoadingModal';
import LogViewer from './LogViewer';
import { CharacterPanel } from './CharacterPanel';
import { LocalFileRestoreDialog } from './LocalFileRestoreDialog';

// Get icon component for object type
const getTypeIcon = (obj: TableObject): React.ReactElement => {
  switch (obj.type) {
    case ItemType.TOKEN:
      return <CircleDot size={10} />;
    case ItemType.TOKEN_TYPE:
      return <Square size={10} />;
    case ItemType.CARD:
      return <CreditCard size={10} />;
    case ItemType.DECK:
      return <Layers size={10} />;
    case ItemType.DICE_OBJECT:
      return <Dices size={10} />;
    case ItemType.COUNTER:
      return <Asterisk size={10} />;
    case ItemType.BOARD:
      return <LayoutGrid size={10} />;
    case ItemType.RANDOMIZER:
      return <Rows size={10} />;
    case ItemType.PANEL:
      return <PanelLeft size={10} />;
    case ItemType.WINDOW:
      return <Box size={10} />;
    case ItemType.DRAWING:
      return <Brush size={10} />;
    case ItemType.EFFECT_TEMPLATE:
      return <Target size={10} />;
    default:
      return <Component size={10} />;
  }
};

interface MainMenuContentProps {
  width: number;
}

export const MainMenuContent: React.FC<MainMenuContentProps> = ({ width }) => {
  const { state, dispatch, peerId, initializeHost, connectionMethod, ticket, roomId } = useGame();
  const { viewTransform } = useViewTransform();
  const { settings: localSettings, updateSetting } = useLocalSettings();

  // PlayerContext hooks - using new contexts
  const activePlayerId = useActivePlayerId();
  const isGM = useIsGM();
  const players = usePlayerList();
  const playerPermissions = usePlayerPermissions();
  const language = useLanguage();
  const hyperscaleLayers = useHyperscaleLayers();
  const selectedLayersFromContext = useSelectedLayers();

  // Translation helper - must be memoized to update when language changes
  const t = useMemo(() => (key: { en: string; ru: string; be?: string; uk?: string; sr?: string }): string => {
    return key[language] || key.en;
  }, [language]);

  const [activeTab, setActiveTab] = useState<'create' | 'hand' | 'character' | 'players' | 'tools'>(() => {
    // Restore from localStorage on mount
    const saved = localStorage.getItem('main-menu-active-tab');
    if (saved && ['create', 'hand', 'character', 'players', 'tools'].includes(saved)) {
      return saved as any;
    }
    return 'create';
  });

  // Save activeTab to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('main-menu-active-tab', activeTab);
  }, [activeTab]);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [waitingForPeerId, setWaitingForPeerId] = useState(false);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
  const [dragOverHand, setDragOverHand] = useState(false);
  const [, setPreviousTab] = useState<'create' | 'hand' | 'character' | 'players' | 'tools'>('create');

  // Track cursor position when tokens first appear in cursor slot (for tools tab switching threshold)
  const cursorSlotStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const hadCardsInSlotRef = useRef(false);
  const [renamePlayerId, setRenamePlayerId] = useState<string | null>(null);
  const [settingsObject, setSettingsObject] = useState<TableObject | null>(null);
  // Use centralized tool settings context
  const { settings, setSelectedTool, updateMarkerSettings, updateEraserSettings, updateRulerSettings, updateZoomSettings } = useToolSettings();
  const currentDrawingTool = useDrawingTool();

  const [isShiftPressed, setIsShiftPressed] = useState(false);
  // Pack modal state
  const [packModalOpen, setPackModalOpen] = useState(false);
  const [packName, setPackName] = useState('');
  const [packDescription, setPackDescription] = useState('');
  const [isCreatingPack, setIsCreatingPack] = useState(false);

  // Pack loading modal state
  const [packLoadingSteps, setPackLoadingSteps] = useState<PackLoadingStep[]>([]);
  const [isPackLoading, setIsPackLoading] = useState(false);
  const packFileInputRef = useRef<HTMLInputElement>(null);
  const addPackFileInputRef = useRef<HTMLInputElement>(null);
  // Log viewer state
  const [showLogViewer, setShowLogViewer] = useState(false);
  // Local file restore dialog state
  const [localFilesToRestore, setLocalFilesToRestore] = useState<any[] | null>(null);
  const [pendingLoadState, setPendingLoadState] = useState<any>(null);
  // Manual connection modal state
  const [showManualConnection, setShowManualConnection] = useState(false);
  const [manualConnectionTab, setManualConnectionTab] = useState<'create' | 'join'>('create');
  const [guestNameInput, setGuestNameInput] = useState('');
  const [webrtcTestResult, setWebrtcTestResult] = useState<string | null>(null);
  const [testingWebRTC, setTestingWebRTC] = useState(false);
  const manualConnection = useManualConnection();

  // Read offer code from URL on mount (for invite links)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const offerCode = urlParams.get('offer');
    if (offerCode) {
      setManualConnectionTab('join');
      manualConnection.setLocalOffer(offerCode);
      setShowManualConnection(true);
      // Remove only the offer parameter, keep others (like hostId)
      urlParams.delete('offer');
      const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
      window.history.replaceState({}, '', newUrl);
    }
  }, []);

  // Set manual connection ref for GameContext to use
  // CRITICAL: Update when connection becomes available, but don't spam on every step change
  useEffect(() => {
    if ((window as any).__setManualConnection) {
      const conn = manualConnection.connectionRef.current;
      const currentSetup = (window as any).__manualConnectionPeer;

      // Only update if we have a connection and it's different from the current one
      if (conn && conn.peer !== currentSetup) {
        (window as any).__setManualConnection(conn);
        (window as any).__manualConnectionPeer = conn.peer;
      }
    }
  }, [manualConnection.state.step, manualConnection.state.channelOpen]); // Track when connection becomes available

  // Hand card scale state with localStorage persistence
  const { setHandCardScale } = useHandCardScale();

  // Listen for hand card scale change events from context menu
  useEffect(() => {
    const handleScaleChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ newScale: number }>;
      setHandCardScale(customEvent.detail.newScale);
      localStorage.setItem('hand-card-scale', String(customEvent.detail.newScale));
    };

    window.addEventListener('hand-card-scale-change', handleScaleChange);
    return () => window.removeEventListener('hand-card-scale-change', handleScaleChange);
  }, [setHandCardScale]);

  // Nexus Board unlock via Shift+3 pressed 3 times
  const [nexusBoardUnlocked, setNexusBoardUnlocked] = useState(false);
  const shiftThreeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressCountRef = useRef(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Use e.code instead of e.key to work with any keyboard layout
      // Digit3 is the physical key '3' regardless of layout
      if (e.code === 'Digit3' && e.shiftKey) {
        // Increment press count using ref to avoid closure issues
        pressCountRef.current += 1;

        // Clear existing timeout
        if (shiftThreeTimeoutRef.current) {
          clearTimeout(shiftThreeTimeoutRef.current);
        }

        // Set timeout to reset count after 2 seconds
        shiftThreeTimeoutRef.current = setTimeout(() => {
          pressCountRef.current = 0;
        }, 2000);

        // Unlock after 3 presses
        if (pressCountRef.current >= 3) {
          setNexusBoardUnlocked(true);
          pressCountRef.current = 0;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (shiftThreeTimeoutRef.current) {
        clearTimeout(shiftThreeTimeoutRef.current);
      }
    };
  }, []);

  // Track Shift key state for delete confirmation skip
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Direct Connection button unlock via 'd' key pressed 3 times
  const [directConnectionUnlocked, setDirectConnectionUnlocked] = useState(false);
  const dKeyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dKeyPressCountRef = useRef(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Use e.code instead of e.key to work with any keyboard layout
      // KeyD is the physical key 'D' regardless of layout
      if (e.code === 'KeyD') {
        // Increment press count using ref to avoid closure issues
        dKeyPressCountRef.current += 1;

        // Clear existing timeout
        if (dKeyTimeoutRef.current) {
          clearTimeout(dKeyTimeoutRef.current);
        }

        // Set timeout to reset count after 2 seconds
        dKeyTimeoutRef.current = setTimeout(() => {
          dKeyPressCountRef.current = 0;
        }, 2000);

        // Unlock after 3 presses
        if (dKeyPressCountRef.current >= 3) {
          setDirectConnectionUnlocked(true);
          dKeyPressCountRef.current = 0;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (dKeyTimeoutRef.current) {
        clearTimeout(dKeyTimeoutRef.current);
      }
    };
  }, []);

  const currentUserIsGM = players.find(p => p.id === activePlayerId)?.isGM ?? false;

  // Get main menu panel for bounds and minimized state
  const mainMenuPanel = useMemo(() => {
    return Object.values(state.objects).find(
      obj => obj.type === ItemType.PANEL && (obj as any).panelType === PanelType.MAIN_MENU
    ) as PanelObject | undefined;
  }, [state.objects]);

  // Check if main menu panel is minimized
  const isMainMenuMinimized = mainMenuPanel?.minimized || false;

  // Handle opening HAND panel settings from button on the panel
  useEffect(() => {
    const handleOpenHandPanelSettings = (e: Event) => {
      const customEvent = e as CustomEvent<{
        panelId: string;
      }>;

      const { panelId } = customEvent.detail;

      // Check if main menu is minimized - if so, don't open settings
      const mainMenuPanel = Object.values(state.objects).find(
        obj => obj.type === ItemType.PANEL && (obj as PanelObject).panelType === PanelType.MAIN_MENU
      ) as PanelObject | undefined;
      if (mainMenuPanel?.minimized) {
        return;
      }

      // Check if it's a HAND panel
      const panel = state.objects[panelId] as PanelObject | undefined;
      if (panel?.panelType === PanelType.HAND) {
        // Create a window for panel settings
        dispatch({
          type: 'CREATE_WINDOW',
          payload: {
            windowType: WindowType.OBJECT_SETTINGS,
            targetObjectId: panelId,
            title: 'Hand Panel Properties'
          }
        });
      }
    };

    window.addEventListener('open-hand-panel-settings', handleOpenHandPanelSettings);
    return () => window.removeEventListener('open-hand-panel-settings', handleOpenHandPanelSettings);
  }, [state.objects, dispatch]);

  // Handle opening card settings from context menu (e.g., from HandPanel)
  // Register once and use ref for latest state/dispatch
  const cardSettingsHandlerRef = useRef<((e: Event) => void) | null>(null);

  useEffect(() => {
    // Create handler that uses current dispatch and state
    cardSettingsHandlerRef.current = (e: Event) => {
      const customEvent = e as CustomEvent<{
        cardId: string;
      }>;

      const { cardId } = customEvent.detail;

      // Check if card exists
      if (!state.objects[cardId]) {
        return;
      }

      // Check if main menu is minimized - if so, don't open settings
      const mainMenuPanel = Object.values(state.objects).find(
        obj => obj.type === ItemType.PANEL && (obj as PanelObject).panelType === PanelType.MAIN_MENU
      ) as PanelObject | undefined;
      if (mainMenuPanel?.minimized) {
        return;
      }

      // Open settings modal directly (not through CREATE_WINDOW)
      setSettingsObject(state.objects[cardId]);
    };
  }, [state.objects]); // Update handler when state changes

  useEffect(() => {
    const handler = (e: Event) => cardSettingsHandlerRef.current?.(e);

    window.addEventListener('open-card-settings', handler);
    return () => window.removeEventListener('open-card-settings', handler);
  }, []); // Only run once on mount

  // Track cursor over main menu when cursor slot has items
  useEffect(() => {
    const handleCursorPositionUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{
        x: number;
        y: number;
        hasCards: boolean;
        items?: { type: string }[];
      }>;

      const { x, y, hasCards, items } = customEvent.detail;

      if (!hasCards) {
        // Clear start position when cursor slot is empty
        cursorSlotStartPosRef.current = null;
        hadCardsInSlotRef.current = false;
        setDragOverHand(false);
        return;
      }

      // Check if cards just appeared in slot (transition from empty to having cards)
      if (!hadCardsInSlotRef.current) {
        hadCardsInSlotRef.current = true;
        // If current tab is 'tools', remember start position for threshold calculation
        if (activeTab === 'tools') {
          cursorSlotStartPosRef.current = { x, y };
        }
      }

      // Check if first item in cursor slot is a CARD or TOKEN
      // Switch to hand tab if dragging a card or token
      const firstItemType = items?.[0]?.type;
      const isDraggingCard = firstItemType === 'CARD' || firstItemType === 'TOKEN';

      // Find main menu panel element in DOM to get actual screen position
      const mainMenuElement = document.querySelector('[data-main-menu="true"]') as HTMLElement;

      if (!mainMenuElement) return;

      // Get actual screen position of main menu using getBoundingClientRect
      const rect = mainMenuElement.getBoundingClientRect();

      // Check if cursor is over main menu bounds
      const isOverMainMenu =
        x >= rect.left &&
        x <= rect.right &&
        y >= rect.top &&
        y <= rect.bottom;

      // Dispatch event for HandPanel to show purple ring (with card type info)
      window.dispatchEvent(new CustomEvent('cursor-slot-move', {
        detail: { x, y, isOverMainMenu, hasCards, isDraggingCard }
      }));

      // Only switch to hand tab if cursor is over main menu AND dragging a card
      if (isOverMainMenu && isDraggingCard) {
        // Calculate distance from start position if tracking (for tools tab)
        let shouldSwitch = true;
        if (cursorSlotStartPosRef.current && activeTab === 'tools') {
          const dx = x - cursorSlotStartPosRef.current.x;
          const dy = y - cursorSlotStartPosRef.current.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          // 🔥 FIX: Use 60vu threshold for tab switching (converted to pixels)
          // This prevents accidental tab switching when moving cursor slightly
          const pixelsPerVU = calculatePixelsPerVU(window.innerWidth, window.innerHeight);
          const SWITCH_THRESHOLD = 60 * pixelsPerVU; // 60vu converted to pixels
          shouldSwitch = distance >= SWITCH_THRESHOLD;
        }

        // 🔥 FIX: Don't switch to hand tab if cursor slot contains tokens from archetype
        // Check if first item has source='archetype' or 'shift' (from token panel clicks)
        const firstItemSource = items?.[0]?.source;
        const isFromArchetypePanel = firstItemSource === 'archetype' || firstItemSource === 'shift';

        if (shouldSwitch && activeTab !== 'hand' && !isFromArchetypePanel) {
          setPreviousTab(activeTab);
          setActiveTab('hand');
        }
        // Also unminimize main menu if it's minimized
        if (mainMenuPanel?.minimized) {
          dispatch({
            type: 'UPDATE_OBJECT',
            payload: { id: mainMenuPanel.id, updates: { minimized: false } }
          });
        }
        setDragOverHand(true);
      } else {
        setDragOverHand(false);
      }
    };

    const handleCursorSlotDrop = () => {
      setDragOverHand(false);
      // Reset refs when items are dropped
      cursorSlotStartPosRef.current = null;
      hadCardsInSlotRef.current = false;
    };

    // Also handle general cursor-slot-dropped event (for drops to table, etc.)
    const handleCursorSlotDropped = () => {
      setDragOverHand(false);
      // Reset refs when items are dropped anywhere
      cursorSlotStartPosRef.current = null;
      hadCardsInSlotRef.current = false;
    };

    window.addEventListener('cursor-position-update', handleCursorPositionUpdate);
    window.addEventListener('cursor-slot-drop-to-hand', handleCursorSlotDrop);
    window.addEventListener('cursor-slot-dropped', handleCursorSlotDropped);

    return () => {
      window.removeEventListener('cursor-position-update', handleCursorPositionUpdate);
      window.removeEventListener('cursor-slot-drop-to-hand', handleCursorSlotDrop);
      window.removeEventListener('cursor-slot-dropped', handleCursorSlotDropped);
    };
  }, [activeTab, mainMenuPanel, dispatch]);

  const handleCreatePanel = (panelType: PanelType) => {
    const x = window.innerWidth / 2 - MAIN_MENU_WIDTH / 2;
    const y = window.innerHeight / 2 - 200;

    dispatch({
      type: 'CREATE_PANEL',
      payload: {
        panelType,
        x,
        y,
        width: DEFAULT_PANEL_WIDTH,
        height: DEFAULT_PANEL_HEIGHT,
        title: panelType === PanelType.HAND ? 'Standard Hand Panel' : panelType,
      }
    });
  };

  const handleInvite = useCallback(() => {
    // Determine identifier based on connection method
    const identifier = connectionMethod === 'iroh' ? ticket
      : connectionMethod === 'trystero' ? roomId
      : peerId;

    if (!identifier) {
      // Initialize host peer on first invite click
      setWaitingForPeerId(true);
      initializeHost();
      return;
    }

    // Calculate next player number (non-GM players only)
    const nonGMCount = players.filter(p => !p.isGM).length;
    const nextPlayerNumber = nonGMCount + 1;

    const baseUrl = window.location.href.split('?')[0];
    let inviteLink: string;

    if (connectionMethod === 'iroh') {
      // Use ticket-based invite
      inviteLink = `${baseUrl}?ticket=${identifier}&playerNum=${nextPlayerNumber}`;
    } else if (connectionMethod === 'trystero') {
      // Use roomId-based invite
      inviteLink = `${baseUrl}?roomId=${identifier}&playerNum=${nextPlayerNumber}`;
    } else {
      // Use PeerJS hostId
      inviteLink = `${baseUrl}?hostId=${identifier}&playerNum=${nextPlayerNumber}`;
    }

    navigator.clipboard.writeText(inviteLink).then(() => {
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    });
  }, [peerId, ticket, roomId, connectionMethod, initializeHost, players]);

  // Auto-generate invite link when identifier becomes available
  useEffect(() => {
    const identifier = connectionMethod === 'iroh' ? ticket
      : connectionMethod === 'trystero' ? roomId
      : peerId;

    if (waitingForPeerId && identifier) {
      setWaitingForPeerId(false);

      // Calculate next player number (non-GM players only)
      const nonGMCount = players.filter(p => !p.isGM).length;
      const nextPlayerNumber = nonGMCount + 1;

      const baseUrl = window.location.href.split('?')[0];
      let inviteLink: string;

      if (connectionMethod === 'iroh') {
        // Use ticket-based invite
        inviteLink = `${baseUrl}?ticket=${identifier}&playerNum=${nextPlayerNumber}`;
      } else if (connectionMethod === 'trystero') {
        // Use roomId-based invite
        inviteLink = `${baseUrl}?roomId=${identifier}&playerNum=${nextPlayerNumber}`;
      } else {
        // Use PeerJS hostId
        inviteLink = `${baseUrl}?hostId=${identifier}&playerNum=${nextPlayerNumber}`;
      }

      navigator.clipboard.writeText(inviteLink).then(() => {
        setInviteCopied(true);
        setTimeout(() => setInviteCopied(false), 2000);
      });
    }
  }, [waitingForPeerId, peerId, ticket, roomId, connectionMethod, players]);

  const handleSaveGame = async () => {
    // Use simplified save system - saves everything as JSON
    await saveSession(state);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLoadGame = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      // Use simplified load system - validates and sanitizes automatically
      const loadedState = await loadSession(file);

      // Dispatch load action with validated state
      dispatch({ type: 'LOAD_GAME', payload: loadedState });

      // Reset file input to allow loading the same file again if needed
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      logger.log('[LOAD] Game loaded successfully');
    } catch (err) {
      logger.error('Error loading save file:', err);
      alert(`Error loading save file: ${(err as Error).message}`);
    }
  };

  const handleSavePack = () => {
    setPackModalOpen(true);
    setPackName(`nexus_pack_${new Date().toISOString().slice(0, 10)}`);
    setPackDescription('');
  };

  const handleCreatePack = async () => {
    if (!packName.trim()) {
      alert(translate('Pack Name', language as Locale) + ' ' + 'is required');
      return;
    }

    // Simple check: count objects instead of trying to serialize huge state
    const objectCount = Object.keys(state.objects).length;
    if (objectCount > 500) {
      const confirmed = confirm(
        `Warning: Your game has ${objectCount} objects.\n\n` +
        `This may take a while to process and create a large pack file.\n\n` +
        `Continue anyway?`
      );

      if (!confirmed) {
        return;
      }
    }

    setIsCreatingPack(true);
    try {
      await createPack(state, packName.trim(), packDescription.trim() || undefined);
      setPackModalOpen(false);
      setPackName('');
      setPackDescription('');
    } catch (error) {
      logger.error(translate('Error creating pack', language as Locale), error);
      alert(translate('Error creating pack', language as Locale) + ': ' + (error as Error).message);
    } finally {
      setIsCreatingPack(false);
    }
  };

  const handleLoadPack = () => {
    packFileInputRef.current?.click();
  };

  // Helper function to add pack loading steps
  const addPackLoadingStep = (message: string, status: PackLoadingStep['status'] = 'loading') => {
    setPackLoadingSteps(prev => {
      // Update existing step if message matches
      const existingIndex = prev.findIndex(step => step.message === message);
      if (existingIndex !== -1) {
        const updated = [...prev];
        updated[existingIndex] = { message, status };
        return updated;
      }
      // Add new step
      return [...prev, { message, status }];
    });
  };

  const handlePackFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.nexuspack')) {
      alert(translate('Invalid pack file', language as Locale));
      return;
    }

    try {
      // Show loading modal
      setIsPackLoading(true);
      setPackLoadingSteps([{ message: `Loading pack: ${file.name}`, status: 'loading' }]);

      // Clear cache before loading pack to prevent overflow
      addPackLoadingStep('Clearing browser cache...', 'loading');
      try {
        clearGameState();
        clearResolvedImageCache(); // Clear component-level image cache
        addPackLoadingStep('Cache cleared', 'success');
      } catch (error) {
        logger.warn('[PACK] Failed to clear cache:', error);
        addPackLoadingStep('Cache clear failed (continuing anyway)', 'warning');
      }

      // 🔥 NEW: Calculate pack file hash for registration
      addPackLoadingStep('Calculating pack hash...', 'loading');
      let packHash = '';
      let packSize = file.size;
      let imageCount = 0;

      try {
        const { hashAsset } = await import('../utils/assets/hashing');
        const hashResult = await hashAsset(file);
        packHash = hashResult.hash || '';
        if (packHash) {
          addPackLoadingStep(`Pack hash: ${packHash.substring(0, 16)}...`, 'success');
        } else {
          addPackLoadingStep('Pack hash not available', 'warning');
        }
      } catch (error) {
        logger.warn('[PACK] Failed to calculate pack hash:', error);
        addPackLoadingStep('Hash calculation failed (continuing anyway)', 'warning');
      }

      const packData = await loadPack(file, (step, status) => {
        addPackLoadingStep(step, status);
      });

      // Validate pack data structure
      if (!packData.objects || typeof packData.objects !== 'object') {
        throw new Error("Invalid pack: missing or invalid 'objects' field");
      }
      if (!packData.players || !Array.isArray(packData.players)) {
        throw new Error("Invalid pack: missing or invalid 'players' field");
      }

      // 🔥 NEW: Count images in pack for registration
      imageCount = Object.values(packData.objects || {}).length;

      // Dispatch load action
      dispatch({ type: 'LOAD_GAME', payload: packData as GameState });

      // 🔥 NEW: Register the pack for P2P sync
      if (packHash) {
        dispatch({
          type: 'REGISTER_PACK',
          payload: {
            packName: file.name.replace(/\.[^/.]+$/, ''), // Remove extension
            packHash,
            packSize,
            imageCount
          }
        });
        addPackLoadingStep(`Pack registered for sync`, 'success');
      }

      // Preload all pack images into resolved cache to force re-render with new images
      const { preloadAllPackImages } = await import('../hooks/useImageUrl');
      await preloadAllPackImages(packData.objects || {});

      const objectCount = Object.keys(packData.objects || {}).length;
      const playerCount = packData.players?.length || 0;

      // 🔥 NEW: Auto-save after pack is fully loaded
      try {
        await saveGameState({ ...packData, version: state.version } as GameState);
      } catch (error) {
        logger.warn('[AUTOSAVE] Failed to save after pack load:', error);
      }

      // Add final success step
      addPackLoadingStep(`Pack loaded successfully! (${objectCount} objects, ${playerCount} players)`, 'success');

      // Hide modal after short delay
      setTimeout(() => {
        setIsPackLoading(false);
        setPackLoadingSteps([]);
      }, 1500);

      // Reset file input
      if (packFileInputRef.current) {
        packFileInputRef.current.value = '';
      }
    } catch (error) {
      // Add error step to modal
      addPackLoadingStep(`Error loading pack: ${(error as Error).message}`, 'error');

      // Keep modal visible longer to show error
      setTimeout(() => {
        setIsPackLoading(false);
        setPackLoadingSteps([]);
      }, 3000);

      logger.error(translate('Error loading pack', language as Locale), error);
    }
  };

  const handleAddPack = () => {
    addPackFileInputRef.current?.click();
  };

  const handleAddPackFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.nexuspack')) {
      alert(translate('Invalid pack file', language as Locale));
      return;
    }

    try {
      // Show loading modal
      setIsPackLoading(true);
      setPackLoadingSteps([{ message: `Adding pack: ${file.name}`, status: 'loading' }]);

      const packData = await loadPack(file, (step, status) => {
        addPackLoadingStep(step, status);
      });

      // Validate pack data structure
      if (!packData.objects || typeof packData.objects !== 'object') {
        throw new Error("Invalid pack: missing or invalid 'objects' field");
      }
      if (!packData.players || !Array.isArray(packData.players)) {
        throw new Error("Invalid pack: missing or invalid 'players' field");
      }

      // ===== CRITICAL: Migrate img_ref:// URLs to sha256 hashes =====
      // Old packs use img_ref://, new system uses sha256 hashes
      addPackLoadingStep('Migrating images to CAS system...', 'loading');

      const {
        getImageUrlFromRef
      } = await import('../utils/packManager');
      const {
        hashDataURL,
        storeAssetFromDataURL
      } = await import('../utils/assets');

      // Find all img_ref:// URLs in pack objects
      const imgRefUrls = new Set<string>();
      const extractImgRefs = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;
        if (Array.isArray(obj)) {
          obj.forEach(extractImgRefs);
          return;
        }
        // Check all string values for img_ref:// URLs
        for (const value of Object.values(obj)) {
          if (typeof value === 'string' && value.startsWith('img_ref://')) {
            imgRefUrls.add(value);
          } else if (typeof value === 'object' && value !== null) {
            extractImgRefs(value);
          }
        }
      };

      for (const obj of Object.values(packData.objects || {})) {
        extractImgRefs(obj);
      }

      // Create mapping from img_ref:// to sha256 hash
      const imageMigrationMap = new Map<string, string>();
      let migratedCount = 0;
      let skippedCount = 0;

      // For each img_ref://, hash the image data and create sha256 hash
      for (const oldImgRef of imgRefUrls) {
        try {
          const imageData = await getImageUrlFromRef(oldImgRef);
          if (imageData && imageData.startsWith('data:image/')) {
            // Hash the image data
            const hashResult = await hashDataURL(imageData);
            const hash = hashResult.hash;

            // Store in asset database
            await storeAssetFromDataURL(imageData, 'pack');

            // Create mapping
            imageMigrationMap.set(oldImgRef, hash);
            migratedCount++;
          } else {
            logger.warn(`[ADD_PACK] Could not load image for ${oldImgRef}`);
            skippedCount++;
          }
        } catch (error) {
          logger.warn(`[ADD_PACK] Failed to migrate image ${oldImgRef}:`, error);
          skippedCount++;
        }
      }

      // Replace all img_ref:// URLs in objects with sha256 hashes
      const replaceImgRefs = (obj: any): any => {
        if (!obj || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) {
          return obj.map(replaceImgRefs);
        }
        const result = { ...obj };
        for (const [key, value] of Object.entries(result)) {
          if (typeof value === 'string' && imageMigrationMap.has(value)) {
            result[key] = imageMigrationMap.get(value);
          } else if (typeof value === 'object' && value !== null) {
            result[key] = replaceImgRefs(value);
          }
        }
        return result;
      };

      // Apply the migration to all pack objects
      const migratedObjects: Record<string, any> = {};
      for (const [id, obj] of Object.entries(packData.objects || {})) {
        migratedObjects[id] = replaceImgRefs(obj);
      }
      packData.objects = migratedObjects;

      addPackLoadingStep(`Migrated ${migratedCount} images to sha256${skippedCount > 0 ? ` (${skippedCount} skipped)` : ''}`, 'success');

      // Count conflicts
      const existingIds = new Set(Object.keys(state.objects));
      let conflictCount = 0;
      for (const id of Object.keys(packData.objects)) {
        if (existingIds.has(id)) conflictCount++;
      }

      if (conflictCount > 0) {
        addPackLoadingStep(`Found ${conflictCount} conflicting IDs - generating new ones`, 'loading');
      }

      // 🔥 NEW: Calculate pack file hash for registration
      addPackLoadingStep('Calculating pack hash...', 'loading');
      let packHash = '';
      let packSize = file.size;
      let imageCount = 0;

      try {
        const { hashAsset } = await import('../utils/assets/hashing');
        const hashResult = await hashAsset(file);
        packHash = hashResult.hash || '';
        if (packHash) {
          addPackLoadingStep(`Pack hash: ${packHash.substring(0, 16)}...`, 'success');
        } else {
          addPackLoadingStep('Pack hash not available', 'warning');
        }
      } catch (error) {
        logger.warn('[ADD_PACK] Failed to calculate pack hash:', error);
        addPackLoadingStep('Hash calculation failed (continuing anyway)', 'warning');
      }

      // Dispatch add pack action (merges with current state)
      dispatch({ type: 'ADD_PACK_TO_GAME', payload: packData });

      // 🔥 NEW: Register the pack for P2P sync
      imageCount = Object.keys(packData.objects || {}).length;
      if (packHash) {
        dispatch({
          type: 'REGISTER_PACK',
          payload: {
            packName: file.name.replace(/\.[^/.]+$/, ''), // Remove extension
            packHash,
            packSize,
            imageCount
          }
        });
        addPackLoadingStep(`Pack registered for sync`, 'success');
      }

      // Preload all pack images into resolved cache
      const { preloadAllPackImages } = await import('../hooks/useImageUrl');
      await preloadAllPackImages(packData.objects || {});

      const objectCount = Object.keys(packData.objects || {}).length;

      // 🔥 NEW: Auto-save after pack is added
      try {
        await saveGameState(state);
      } catch (error) {
        logger.warn('[AUTOSAVE] Failed to save after adding pack:', error);
      }

      // Add final success step
      addPackLoadingStep(`Pack added successfully! (${objectCount} objects merged into current game)`, 'success');

      // Hide modal after short delay
      setTimeout(() => {
        setIsPackLoading(false);
        setPackLoadingSteps([]);
      }, 1500);

      // Reset file input
      if (addPackFileInputRef.current) {
        addPackFileInputRef.current.value = '';
      }
    } catch (error) {
      // Add error step to modal
      addPackLoadingStep(`Error adding pack: ${(error as Error).message}`, 'error');

      // Keep modal visible longer to show error
      setTimeout(() => {
        setIsPackLoading(false);
        setPackLoadingSteps([]);
      }, 3000);

      logger.error(translate('Error adding pack', language as Locale), error);
    }
  };

  // Manual connection handlers
  const handleCreateManualOffer = async () => {
    const name = guestNameInput.trim() || 'Host';
    await manualConnection.createOffer(name);
  };

  const handleJoinManualConnection = async (code: string) => {
    const guestName = guestNameInput.trim() || 'Guest Player';
    await manualConnection.connectToHost(code, guestName, dispatch);
  };

  const handleManualAnswer = async (code: string) => {
    await manualConnection.handleGuestAnswer(code);
  };

  // Create categories with proper order and labels
  const categories = [
    {
      id: 'boards', label: translate('Game Boards', language as Locale), icon: <LayoutGrid size={16}/>,
      items: [
        { name: translate('Standard Board', language as Locale), type: 'BOARD', gridType: GridType.SQUARE },
        { name: translate('Cell', language as Locale), type: 'BATTLEFIELD_CELL' },
        { name: translate('Nexus Board', language as Locale), type: 'NEXUS_BOARD', disabled: !nexusBoardUnlocked },
      ],
      matcher: (obj: TableObject) => obj.type === ItemType.BOARD || obj.type === ItemType.BATTLEFIELD_CELL || obj.type === ItemType.NEXUS_BOARD
    },
    {
      id: 'decks', label: translate('Decks', language as Locale), icon: <Library size={16}/>,
      items: [
        { name: translate('Standard Deck', language as Locale), type: 'DECK' },
        { name: translate('Hex Deck', language as Locale), type: 'HEX_DECK' },
      ],
      matcher: (obj: TableObject) => obj.type === ItemType.DECK
    },
    {
      id: 'tokens', label: translate('Tokens', language as Locale), icon: <CircleDot size={16}/>,
      items: [
        { name: translate('Standard Token', language as Locale), type: 'TOKEN', shape: TokenShape.CIRCLE },
        { name: translate('Token Type', language as Locale), type: 'TOKEN_TYPE' },
      ],
      matcher: (obj: TableObject) => obj.type === ItemType.TOKEN || obj.type === ItemType.TOKEN_TYPE
    },
    {
      id: 'effects', label: t({ en: 'Effect Templates', ru: 'Эффекты', be: 'Эфекты', uk: 'Ефекти', sr: 'Ефекти' }), icon: <Target size={16}/>,
      items: [
        { name: t({ en: 'Fire Cone Effect', ru: 'Огненный конус', be: 'Агністы конус', uk: 'Вогняний конус', sr: 'Ватрени конус' }), type: 'FIRE_CONE_EFFECT' },
        { name: t({ en: 'Fire Explosion Effect', ru: 'Огненный взрыв', be: 'Агністы выбух', uk: 'Вогняний вибух', sr: 'Ватрена експлозија' }), type: 'FIRE_EXPLOSION_EFFECT' },
      ],
      matcher: (obj: TableObject) => obj.type === ItemType.EFFECT_TEMPLATE
    },
    {
      id: 'randomizers', label: translate('Randomizers & Dice', language as Locale), icon: <Dices size={16}/>,
      items: [
        { name: translate('Standard Dice', language as Locale), type: 'DICE' },
      ],
      matcher: (obj: TableObject) => obj.type === ItemType.DICE_OBJECT || obj.type === ItemType.RANDOMIZER
    },
    {
      id: 'counters', label: translate('Counters', language as Locale), icon: <Box size={16}/>,
      items: [
        { name: translate('Life Counter', language as Locale), type: 'COUNTER' },
        { name: translate('Score Tracker', language as Locale), type: 'COUNTER' },
      ],
      matcher: (obj: TableObject) => obj.type === ItemType.COUNTER
    },
    {
      id: 'panels', label: translate('Panels', language as Locale), icon: <Layers size={16}/>,
      items: [
        { name: translate('Hand Panel', language as Locale), type: 'PANEL', panelType: PanelType.HAND },
        { name: translate('Character Panel', language as Locale), type: 'PANEL', panelType: PanelType.CHARACTER },
        { name: translate('Pool Panel', language as Locale), type: 'PANEL', panelType: PanelType.POOL },
        { name: translate('Tools Panel', language as Locale), type: 'PANEL', panelType: PanelType.TOOLS },
        { name: translate('Tokens Panel', language as Locale), type: 'PANEL', panelType: PanelType.TOKENS },
      ],
      matcher: (obj: TableObject) => obj.type === ItemType.PANEL && (obj as any).panelType !== PanelType.MAIN_MENU
    },
    {
      id: 'drawings', label: translate('Drawings', language as Locale), icon: <Brush size={16}/>,
      items: [], // Drawings are created with marker tool, not via menu
      matcher: (obj: TableObject) => obj.type === ItemType.DRAWING
    },
    {
      id: 'pages', label: translate('Pages', language as Locale), icon: <FileText size={16}/>,
      items: [
        { name: translate('Page', language as Locale), type: 'PAGE', disabled: true },
      ],
      matcher: (obj: TableObject) => false // Pages not implemented yet
    },
  ];

  return (
    <div className="h-full bg-slate-900 flex flex-col transition-all">
      {/* Tabs and Content - hidden when minimized */}
      {!isMainMenuMinimized && (
        <>
          <div className="flex border-b border-slate-700">
            <button onClick={() => { setActiveTab('create'); }} className={`flex-1 p-3 flex justify-center ${activeTab === 'create' ? 'bg-slate-800 text-white border-b-2 border-purple-500' : 'text-gray-500 hover:bg-slate-800'}`}>
              <Library size={20} />
            </button>
            <button onClick={() => { setActiveTab('hand'); }} className={`flex-1 p-3 flex justify-center ${activeTab === 'hand' ? 'bg-slate-800 text-white border-b-2 border-purple-500' : 'text-gray-500 hover:bg-slate-800'}`}>
              <Hand size={20} />
            </button>
            <button onClick={() => { setActiveTab('tools'); }} className={`flex-1 p-3 flex justify-center ${activeTab === 'tools' ? 'bg-slate-800 text-white border-b-2 border-purple-500' : 'text-gray-500 hover:bg-slate-800'}`}>
              <Wrench size={20} />
            </button>
            <button onClick={() => { setActiveTab('character'); }} className={`flex-1 p-3 flex justify-center ${activeTab === 'character' ? 'bg-slate-800 text-white border-b-2 border-purple-500' : 'text-gray-500 hover:bg-slate-800'}`}>
              <User size={20} />
            </button>
            <button onClick={() => { setActiveTab('players'); }} className={`flex-1 p-3 flex justify-center ${activeTab === 'players' ? 'bg-slate-800 text-white border-b-2 border-purple-500' : 'text-gray-500 hover:bg-slate-800'}`}>
              <Network size={20} />
            </button>
          </div>

      <div
        className="flex-1 relative select-none min-h-0"
      >
        {activeTab === 'create' && (
          <div className="h-full overflow-y-auto scrollbar-thin p-2" data-scrollable="true">
            {categories.map(category => (
              <CategorySection
                key={category.id}
                category={category}
                state={state}
                dispatch={dispatch}
                deleteCandidateId={deleteCandidateId}
                setDeleteCandidateId={setDeleteCandidateId}
                currentUserIsGM={currentUserIsGM}
                canCreateObjects={currentUserIsGM || playerPermissions.createObjects}
                canConfigureObjects={currentUserIsGM || playerPermissions.configureObjects}
                canDeleteObjects={currentUserIsGM || playerPermissions.deleteObjects}
                canHideObjects={currentUserIsGM || playerPermissions.hideObjects}
                language={language}
                isShiftPressed={isShiftPressed}
                viewTransform={viewTransform}
                hyperscaleLayers={hyperscaleLayers}
                selectedLayersFromContext={selectedLayersFromContext}
              />
            ))}
          </div>
        )}

        {activeTab === 'hand' && (
          <div className="h-full flex flex-col min-h-0 w-full">
            {/* Hand Panel */}
            <div className="flex-1 min-h-0 w-full" onClick={(e) => {
              // Don't let clicks propagate to main menu container
              // This allows cursor slot drops to work properly
              e.stopPropagation();
            }}>
              <HandPanel shiftScrollbar={false} isDragTarget={dragOverHand} language={language} />
            </div>
          </div>
        )}

        {activeTab === 'tools' && (
          <div className="flex flex-col h-full">
            {/* Upper section - Drawing tools and tokens */}
            <div
              className="flex-[3] overflow-y-auto px-3 py-2 space-y-3 min-h-0 scrollbar-thin"
              data-scrollable="true"
            >
              {/* Drawing Tools Section */}
              <div>
                <h4 className="text-xs font-bold text-gray-400 mb-2 uppercase">{translate('Drawing Tools', language as Locale)}</h4>
                <div className="grid grid-cols-5 gap-2">
                  <DrawingToolButton tool="none" icon={<MousePointer2 size={15} />} label={translate('Cursor', language as Locale)} selectedTool={settings.selectedTool} setSelectedTool={setSelectedTool} />
                  <DrawingToolButton tool="marker" icon={<Pen size={15} />} label={translate('Marker', language as Locale)} selectedTool={settings.selectedTool} setSelectedTool={setSelectedTool} />
                  <DrawingToolButton tool="eraser" icon={<Eraser size={15} />} label={translate('Eraser', language as Locale)} selectedTool={settings.selectedTool} setSelectedTool={setSelectedTool} />
                  <DrawingToolButton tool="ruler" icon={<Ruler size={15} />} label={translate('Ruler', language as Locale)} selectedTool={settings.selectedTool} setSelectedTool={setSelectedTool} />
                  <DrawingToolButton tool="zoom" icon={<Search size={15} />} label={translate('Zoom', language as Locale)} selectedTool={settings.selectedTool} setSelectedTool={setSelectedTool} />
                </div>
              </div>

              {/* Marker Settings (shown when marker is selected) */}
              {settings.selectedTool === 'marker' && (
                <div className="bg-slate-800 rounded-lg space-y-3 p-3">
                  {/* Color picker */}
                  <div>
                    <input
                      type="color"
                      value={settings.marker.color}
                      onChange={(e) => updateMarkerSettings({ color: e.target.value })}
                      className="w-full h-10 bg-slate-900 border border-slate-700 rounded cursor-pointer"
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
                      onChange={(e) => updateMarkerSettings({ thickness: Number(e.target.value) })}
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
                <div className="bg-slate-800 rounded-lg space-y-3 p-3">
                  {/* Thickness slider */}
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

              {/* Ruler Settings (shown when ruler tool is selected) */}
              {settings.selectedTool === 'ruler' && (
                <div className="bg-slate-800 rounded-lg space-y-3 p-3">
                  {/* Step slider */}
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-1">
                      {translate('Step', language as Locale)}: {settings.ruler.step} VU
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="500"
                      step="1"
                      value={settings.ruler.step}
                      onChange={(e) => updateRulerSettings({ step: Number(e.target.value) })}
                      className="w-full bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500 slider-input"
                    />
                    <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
                      <span>0</span>
                      <span>250</span>
                      <span>500</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Zoom Settings (shown when zoom tool is selected) */}
              {settings.selectedTool === 'zoom' && (
                <div className="bg-slate-800 rounded-lg space-y-3 p-3">
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

              {/* Token Archetypes Section */}
              <div>
                <h4 className="text-xs font-bold text-gray-400 mb-2 uppercase">Tokens</h4>
                <div className="grid grid-cols-3 gap-2">
                  {Object.values(state.objects)
                    .filter((obj): obj is TokenType => obj.type === ItemType.TOKEN_TYPE)
                    .map((archetype) => {
                      // Count token copies for this archetype
                      const copyCount = Object.values(state.objects).filter(
                        obj => obj.type === ItemType.TOKEN && (obj as any).archetypeId === archetype.id
                      ).length;
                      // Get max copies limit for this archetype
                      const maxCopies = (archetype as any).maxCopies ?? 0;
                      return (
                        <TokenTypeCard
                          key={archetype.id}
                          archetype={archetype}
                          copyCount={copyCount}
                          maxCopies={maxCopies}
                          onSettings={() => dispatch({
                            type: 'CREATE_WINDOW',
                            payload: {
                              windowType: WindowType.OBJECT_SETTINGS,
                              title: 'Properties: ' + archetype.name,
                              targetObjectId: archetype.id
                            }
                          })}
                        />
                      );
                    })}
                </div>
              </div>
            </div>

            {/* Lower section - Layers panel */}
            <div className="flex-[2] border-t border-slate-700 min-h-0">
              <LayersPanel language={language as Locale} />
            </div>
          </div>
        )}

        {activeTab === 'character' && (
          <div className="h-full overflow-hidden">
            {/* Find or create character panel for embedded use */}
            {(() => {
              const characterPanel = Object.values(state.objects).find(
                obj => obj.type === ItemType.PANEL && (obj as PanelObject).panelType === PanelType.CHARACTER
              ) as PanelObject | undefined;

              if (!characterPanel) {
                return (
                  <div className="h-full flex flex-col items-center justify-center p-4 text-center">
                    <p className="text-gray-400 text-sm mb-4">{translate('No Character Panel found', language as Locale)}</p>
                    <button
                      onClick={() => {
                        dispatch({
                          type: 'CREATE_PANEL',
                          payload: {
                            panelType: PanelType.CHARACTER,
                            x: window.innerWidth / 2 - 150,
                            y: window.innerHeight / 2 - 200,
                            width: 350,
                            height: 500,
                            title: translate('Character Panel', language as Locale),
                          }
                        });
                      }}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded transition-colors"
                    >
                      {translate('Create Character Panel', language as Locale)}
                    </button>
                  </div>
                );
              }

              return <CharacterPanel panel={characterPanel} isCollapsed={false} />;
            })()}
          </div>
        )}

        {activeTab === 'players' && (
          <div className="h-full overflow-y-auto scrollbar-thin p-4" data-scrollable="true">
            <div>
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">{translate('Session Tools', language as Locale)}</h3>
              {/* Session ID Display */}
              <div className="mb-2 p-2 bg-slate-800 rounded border border-slate-700">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider">{translate('Session ID', language as Locale)}</div>
                <div className="text-sm text-gray-300 font-mono break-all">{state.sessionId || 'Generating...'}</div>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {/* Invite Player with Direct Connection button */}
                <div className="flex gap-2">
                  <button
                    onClick={handleInvite}
                    disabled={waitingForPeerId}
                    className={`flex-1 py-2 px-3 rounded flex items-center justify-center gap-2 font-bold transition-all ${
                      inviteCopied ? 'bg-green-600 text-white' :
                      waitingForPeerId ? 'bg-yellow-600 text-white cursor-wait' :
                      'bg-purple-600 hover:bg-purple-500 text-white'
                    }`}
                  >
                    {inviteCopied ? <CheckCircle size={16}/> :
                     waitingForPeerId ? <Loader2 size={16} className="animate-spin" /> :
                     <LinkIcon size={16}/>}
                    {inviteCopied ? translate('Link Copied!', language as Locale) :
                     waitingForPeerId ? translate('Generating ID...', language as Locale) :
                     translate('Invite Player', language as Locale)}
                  </button>
                  <button
                    onClick={() => directConnectionUnlocked && setShowManualConnection(true)}
                    disabled={!directConnectionUnlocked}
                    className={`w-12 h-10 rounded flex items-center justify-center font-bold transition-all ${
                      directConnectionUnlocked
                        ? 'bg-blue-600 hover:bg-blue-500 text-white'
                        : 'bg-slate-700 text-gray-500 cursor-not-allowed'
                    }`}
                    title={directConnectionUnlocked ? translate('Direct Connection', language as Locale) : translate('Locked', language as Locale)}
                  >
                    <Network size={16} />
                  </button>
                </div>

                {/* 🔥 NEW: Registered Asset Packs indicator */}
                {(() => {
                  const usedPacks = state.usedPacks || {};
                  const packCount = Object.keys(usedPacks).length;
                  if (packCount === 0) return null;
                  return (
                    <div className={`p-2 rounded border text-xs ${packCount > 0 ? 'bg-green-500/10 border-green-500/30' : 'bg-slate-800 border-slate-700'}`}>
                      <div className="flex items-center gap-2">
                        <Package size={14} className={packCount > 0 ? 'text-green-500' : 'text-slate-500'} />
                        <span className="text-gray-400">
                          {packCount} asset pack{packCount !== 1 ? 's' : ''} registered for guests
                        </span>
                      </div>
                      {packCount > 0 && (
                        <div className="mt-1 text-gray-500 pl-6">
                          {Object.keys(usedPacks).join(', ')}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Divider line before save/load buttons */}
                <div className="border-t border-slate-600 my-2"></div>

                {/* Session buttons row */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleSaveGame}
                    className="py-2 px-3 rounded flex items-center justify-center gap-2 font-bold bg-blue-600 hover:bg-blue-500 text-white transition-all"
                  >
                    <Save size={16} />
                    {translate('Save', language as Locale)}
                  </button>
                  {currentUserIsGM && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="py-2 px-3 rounded flex items-center justify-center gap-2 font-bold bg-blue-600 hover:bg-blue-500 text-white transition-all"
                    >
                      <Upload size={16} />
                      {translate('Load', language as Locale)}
                    </button>
                  )}
                </div>

                {/* Save Pack button */}
                {currentUserIsGM && (
                  <button
                    onClick={handleSavePack}
                    className="w-full py-3 px-3 rounded flex items-center justify-center gap-2 font-bold bg-purple-700 hover:bg-purple-600 text-white transition-all"
                  >
                    <Save size={16} />
                    {translate('Save Pack', language as Locale)}
                  </button>
                )}

                {/* Load Pack and Add Pack buttons row */}
                {currentUserIsGM && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={handleLoadPack}
                      className="py-2 px-3 rounded flex items-center justify-center gap-2 font-bold bg-purple-700 hover:bg-purple-600 text-white transition-all"
                    >
                      <Upload size={16} />
                      {translate('Load Pack', language as Locale)}
                    </button>
                    <button
                      onClick={handleAddPack}
                      className="py-2 px-3 rounded flex items-center justify-center gap-2 font-bold bg-purple-700 hover:bg-purple-600 text-white transition-all"
                      title="Add pack objects to current game (conflicting IDs will be regenerated)"
                    >
                      <Plus size={16} />
                      {translate('Add Pack', language as Locale)}
                    </button>
                  </div>
                )}
                <div className="border-t border-slate-600 my-2" />
                <button
                  onClick={() => setShowLogViewer(true)}
                  className="w-full py-2 px-3 rounded flex items-center justify-center gap-2 font-bold bg-purple-700 hover:bg-purple-600 text-white transition-all"
                >
                  <Clock size={16} />
                  {translate('Session Log', language as Locale)}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleLoadGame}
                  className="hidden"
                />
                <input
                  ref={packFileInputRef}
                  type="file"
                  accept=".nexuspack"
                  onChange={handlePackFileChange}
                  className="hidden"
                />
                <input
                  ref={addPackFileInputRef}
                  type="file"
                  accept=".nexuspack"
                  onChange={handleAddPackFileChange}
                  className="hidden"
                />

                {/* Spacer for resize handle */}
                <div style={{ height: '20px', flexShrink: 0 }} />
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">{translate('Active Players', language as Locale)}</h3>
              {players
                .map(p => {
                  const isCurrentPlayer = p.id === activePlayerId;
                  const gameMaster = findGM(players);
                  const isGameMaster = p.id === gameMaster?.id;
                  const currentPlayerObj = players.find(pl => pl.id === activePlayerId);
                  const isGMView = currentPlayerObj?.isGM || false;

                  // Check if current user is the host (can switch between GM and GM Player modes)
                  // Host is defined as the user who is currently using the GM account (either 'gm' or 'gm-player' mode)
                  const isHostUser = isGMView || activePlayerId === 'gm-player';

                  // Determine which buttons to show
                  let showSwitchButton = false;
                  let showRenameButton = false;

                  // Check if this player block is either Game Master or GM Player
                  const isGMRelatedPlayer = isGameMaster || (p.id === 'gm-player');

                  if (isHostUser && isGMRelatedPlayer) {
                    // Host can switch between GM and GM Player modes
                    // Show switch button on both Game Master and GM Player blocks
                    showSwitchButton = true;
                  } else if (isHostUser && !isGMRelatedPlayer) {
                    // Host can rename other players (not GM or GM Player)
                    showRenameButton = true;
                  } else if (!isHostUser && isCurrentPlayer) {
                    // Non-host players can only rename themselves
                    showRenameButton = true;
                  }

                  // 🔥 NEW: Calculate pack loading status for guests
                  const guestPackStatus = state.guestPackStatus?.[p.id];
                  const totalPacks = Object.keys(state.usedPacks || {}).length;
                  const loadedPacks = guestPackStatus ? Object.keys(guestPackStatus.loadedPacks || {}).length : 0;
                  const packsLoaded = totalPacks > 0 && loadedPacks >= totalPacks;
                  const showPackStatus = isGMView && totalPacks > 0 && !p.isGM && guestPackStatus;

                  return (
                    <div key={p.id} className={`flex items-center gap-2 p-2 rounded ${isCurrentPlayer ? 'bg-purple-900/30 border border-purple-700/50' : 'bg-slate-800'}`}>
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{backgroundColor: p.color}} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white truncate">{p.name}</span>
                          {/* 🔥 NEW: Pack loading indicator for guests */}
                          {showPackStatus && (
                            <div className="flex items-center gap-1 flex-shrink-0" title={`${loadedPacks}/${totalPacks} packs loaded`}>
                              {packsLoaded ? (
                                <Package size={12} className="text-green-500" />
                              ) : (
                                <div className="relative">
                                  <Package size={12} className="text-amber-500" />
                                  <span className="absolute -top-1 -right-1 text-[9px] font-bold text-amber-500">
                                    {totalPacks - loadedPacks}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        {/* 🔥 NEW: Show pack loading progress for guests */}
                        {showPackStatus && !packsLoaded && (
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {loadedPacks}/{totalPacks} packs loaded
                          </div>
                        )}
                      </div>

                      {/* All buttons and badges on the right side */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {/* Rename button */}
                        {showRenameButton && (
                          <button
                            onClick={() => setRenamePlayerId(p.id)}
                            className="p-1 hover:bg-slate-700 rounded text-gray-400 hover:text-white transition-colors"
                            title={translate('Edit name', language as Locale)}
                          >
                            <Pencil size={14} />
                          </button>
                        )}

                        {/* You badge */}
                        {isCurrentPlayer && (
                          <button
                            className="w-7 h-7 flex items-center justify-center bg-slate-600 hover:bg-slate-500 rounded text-white transition-colors"
                            title={translate('You', language as Locale)}
                          >
                            <User size={12} />
                          </button>
                        )}

                        {/* GM badge with crown */}
                        {p.isGM && (
                          <button
                            className="w-7 h-7 flex items-center justify-center bg-yellow-600 hover:bg-yellow-500 rounded text-white transition-colors"
                            title="GM"
                          >
                            <Crown size={12} />
                          </button>
                        )}

                        {/* GM Mode Switch Button */}
                        {showSwitchButton && (
                          <button
                            onClick={() => {
                              if (isGameMaster) {
                                // Clicking on Game Master block switches TO GM mode
                                dispatch({ type: 'SET_ACTIVE_ID', payload: 'gm' });
                              } else {
                                // Clicking on GM Player block switches TO GM Player mode
                                dispatch({ type: 'SET_ACTIVE_ID', payload: 'gm-player' });
                              }
                            }}
                            className="w-7 h-7 flex items-center justify-center bg-purple-600/20 hover:bg-purple-600/40 rounded text-purple-400 hover:text-purple-300 transition-colors"
                            title={isGameMaster ? translate('Switch to GM Mode', language as Locale) : translate('Switch to Player Mode', language as Locale)}
                          >
                            <User size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* Spacer for resize handle */}
        <div style={{ height: '20px', flexShrink: 0 }} />
      </div>
        </>
      )}

      {/* Player name rename modal */}
      {renamePlayerId && (
        <PlayerNameModal
          isOpen={renamePlayerId !== null}
          onSubmit={(newName) => {
            dispatch({ type: 'UPDATE_PLAYER_NAME', payload: { playerId: renamePlayerId, name: newName } });
            setRenamePlayerId(null);
          }}
          defaultName={players.find(p => p.id === renamePlayerId)?.name || 'Player'}
          title={renamePlayerId === activePlayerId ? 'Edit Your Name' : 'Edit Player Name'}
        />
      )}

      {/* Card/Object Settings Modal */}
      {settingsObject && (
        <ObjectSettingsModal
          object={settingsObject}
          allObjects={state.objects}
          language={language}
          diceGroups={state.diceGroups}
          dispatch={dispatch}
          onClose={() => setSettingsObject(null)}
          onSave={(updatedObj) => {
            dispatch({ type: 'UPDATE_OBJECT', payload: { id: updatedObj.id, updates: updatedObj } });
            setSettingsObject(null);
          }}
        />
      )}

      {/* Pack Loading Modal */}
      {isPackLoading && (
        <PackLoadingModal
          steps={packLoadingSteps}
          isVisible={isPackLoading}
        />
      )}

      {/* Manual P2P Connection Modal */}
      {showManualConnection && createPortal(
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[10000]">
          <div
            className="bg-slate-800 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onWheel={(e) => {
              // Prevent scroll from propagating to the game tabletop
              e.stopPropagation();
            }}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-white">{translate('Direct Connection', language as Locale)}</h2>
              <button
                onClick={() => {
                  // Don't allow closing if connection is in progress
                  if (manualConnection.state.step === 'connecting' ||
                      manualConnection.state.step === 'waiting_for_answer' ||
                      (manualConnection.state.step === 'connected' && !manualConnection.state.channelOpen)) {
                    if (!confirm(translate('Connection is in progress. Close anyway?', language as Locale))) {
                      return;
                    }
                  }
                  setShowManualConnection(false);
                  manualConnection.reset();
                }}
                className="text-gray-400 hover:text-white"
              >
                <X size={24} />
              </button>
            </div>

            {/* WebRTC Diagnostic Button */}
            <button
              onClick={async () => {
                setTestingWebRTC(true);
                setWebrtcTestResult('Testing WebRTC connectivity...');
                const result = await testWebRTCConnectivity();
                setTestingWebRTC(false);
                if (result.success) {
                  setWebrtcTestResult(`✓ WebRTC works! Found ${result.candidates} candidates (host: ${result.details.host}, srflx: ${result.details.srflx}, relay: ${result.details.relay})`);
                } else {
                  setWebrtcTestResult(`❌ WebRTC problem: ${result.error || 'Unknown error'}\nCandidates: ${result.candidates} (host: ${result.details.host}, srflx: ${result.details.srflx}, relay: ${result.details.relay})\n\nTroubleshooting:\n- Check browser settings for WebRTC\n- Disable VPN/Proxy\n- Disable browser extensions (uBlock, Privacy Badger)\n- Try a different browser (Chrome/Firefox)\n- Check if firewall allows WebRTC`);
                }
              }}
              disabled={testingWebRTC}
              className="w-full py-2 px-4 bg-yellow-700 hover:bg-yellow-600 disabled:bg-slate-600 disabled:text-gray-400 text-white rounded font-medium transition-colors text-sm mb-4"
            >
              {testingWebRTC ? 'Testing...' : '🔍 Test WebRTC Connectivity'}
            </button>

            {webrtcTestResult && (
              <div className={`mb-4 p-3 text-sm whitespace-pre-wrap rounded ${
                webrtcTestResult.startsWith('✓') ? 'bg-green-900/50 border border-green-700 text-green-200' :
                webrtcTestResult.startsWith('❌') ? 'bg-red-900/50 border border-red-700 text-red-200' :
                'bg-blue-900/50 border border-blue-700 text-blue-200'
              }`}>
                {webrtcTestResult}
                <button
                  onClick={() => setWebrtcTestResult(null)}
                  className="float-right text-gray-400 hover:text-white"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Tab selector */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setManualConnectionTab('create')}
                className={`flex-1 py-2 px-4 rounded font-medium transition-colors ${
                  manualConnectionTab === 'create'
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                }`}
              >
                {translate('Create (Host)', language as Locale)}
              </button>
              <button
                onClick={() => setManualConnectionTab('join')}
                className={`flex-1 py-2 px-4 rounded font-medium transition-colors ${
                  manualConnectionTab === 'join'
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                }`}
              >
                {translate('Join (Guest)', language as Locale)}
              </button>
            </div>

            {/* Status indicator */}
            {manualConnection.state.error && (
              <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded text-red-200">
                {translate('Error', language as Locale)}: {manualConnection.state.error}
              </div>
            )}

            {manualConnection.state.noCandidates && (manualConnection.state.error || manualConnection.state.step === 'failed') && (
              <div className="mb-4 p-3 bg-yellow-900/50 border border-yellow-700 rounded text-yellow-200">
                {translate('No ICE candidates gathered - try testing on different devices', language as Locale)}
              </div>
            )}

            {manualConnection.state.step === 'connected' && manualConnection.state.channelOpen && (
              <div className="mb-4 p-3 bg-green-900/50 border border-green-700 rounded text-green-200">
                {translate('Connected successfully!', language as Locale)}
              </div>
            )}

            {/* Show connecting message if step is connected but channel not yet open */}
            {manualConnection.state.step === 'connected' && !manualConnection.state.channelOpen && (
              <div className="mb-4 p-3 bg-blue-900/50 border border-blue-700 rounded text-blue-200">
                {translate('Establishing secure connection...', language as Locale)}
              </div>
            )}

            {/* Create (Host) Tab */}
            {manualConnectionTab === 'create' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    {translate('Your Name', language as Locale)}
                  </label>
                  <input
                    type="text"
                    defaultValue={players.find(p => p.id === activePlayerId)?.name || 'Host'}
                    id="host-name-input"
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                  />
                </div>

                {manualConnection.state.step === 'idle' && (
                  <button
                    onClick={() => {
                      const name = (document.getElementById('host-name-input') as HTMLInputElement)?.value || 'Host';
                      manualConnection.createOffer(name);
                    }}
                    className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded font-medium transition-colors"
                  >
                    {translate('Generate Connection Code', language as Locale)}
                  </button>
                )}

                {(manualConnection.state.step === 'creating' || manualConnection.state.step === 'waiting_for_answer') && (
                  <div className="space-y-4">
                    <div className="p-3 bg-blue-900/30 border border-blue-700 rounded text-blue-200">
                      {translate('Step 1: Copy this code and send to your guest', language as Locale)}
                    </div>

                    <textarea
                      readOnly
                      value={manualConnection.state.generatedCode}
                      className="w-full h-32 px-3 py-2 bg-slate-900 border border-slate-600 rounded text-white text-xs font-mono"
                    />

                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(manualConnection.state.generatedCode);
                        }}
                        className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded font-medium transition-colors flex items-center justify-center gap-2"
                      >
                        <Copy size={16} />
                        {translate('Copy to Clipboard', language as Locale)}
                      </button>
                    </div>

                    {manualConnection.state.step === 'waiting_for_answer' && (
                      <div className="space-y-4 pt-4 border-t border-slate-700">
                        <div className="p-3 bg-green-900/30 border border-green-700 rounded text-green-200">
                          {translate('Step 2: Paste the answer code from your guest', language as Locale)}
                        </div>

                        <textarea
                          placeholder={translate('Paste answer code here...', language as Locale)}
                          value={manualConnection.state.remoteAnswer}
                          onChange={(e) => manualConnection.setRemoteAnswer(e.target.value)}
                          className="w-full h-24 px-3 py-2 bg-slate-900 border border-slate-600 rounded text-white text-xs font-mono"
                        />

                        <button
                          onClick={() => {
                            manualConnection.handleGuestAnswer(manualConnection.state.remoteAnswer);
                          }}
                          disabled={!manualConnection.state.remoteAnswer}
                          className="w-full py-3 px-4 bg-green-600 hover:bg-green-500 disabled:bg-slate-600 disabled:text-gray-400 text-white rounded font-medium transition-colors"
                        >
                          {translate('Connect', language as Locale)}
                        </button>
                      </div>
                    )}

                    {manualConnection.state.step === 'creating' && (
                      <div className="flex items-center justify-center gap-2 text-blue-400">
                        <Loader2 size={20} className="animate-spin" />
                        {translate('Generating code...', language as Locale)}
                      </div>
                    )}
                  </div>
                )}

                {manualConnection.state.step === 'connected' && manualConnection.state.channelOpen && (
                  <button
                    onClick={() => {
                      setShowManualConnection(false);
                      manualConnection.reset();
                    }}
                    className="w-full py-3 px-4 bg-green-600 hover:bg-green-500 text-white rounded font-medium transition-colors"
                  >
                    {translate('Close', language as Locale)}
                  </button>
                )}
              </div>
            )}

            {/* Join (Guest) Tab */}
            {manualConnectionTab === 'join' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    {translate('Your Name', language as Locale)}
                  </label>
                  <input
                    type="text"
                    value={guestNameInput}
                    onChange={(e) => setGuestNameInput(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                  />
                </div>

                {manualConnection.state.step === 'idle' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        {translate('Host Connection Code', language as Locale)}
                      </label>
                      <textarea
                        placeholder={translate('Paste the code from host here...', language as Locale)}
                        value={manualConnection.state.localOffer}
                        onChange={(e) => manualConnection.setLocalOffer(e.target.value)}
                        className="w-full h-32 px-3 py-2 bg-slate-900 border border-slate-600 rounded text-white text-xs font-mono"
                      />
                    </div>

                    <button
                      onClick={() => manualConnection.connectToHost(manualConnection.state.localOffer, guestNameInput.trim() || 'Guest Player', dispatch)}
                      disabled={!manualConnection.state.localOffer || !guestNameInput}
                      className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:text-gray-400 text-white rounded font-medium transition-colors"
                    >
                      {translate('Connect to Host', language as Locale)}
                    </button>
                  </>
                )}

                {(manualConnection.state.step === 'connecting' || manualConnection.state.step === 'connected') && (
                  <div className="space-y-4">
                    {/* Show answer code when it's been generated */}
                    {manualConnection.state.generatedCode && (
                      <>
                        <div className="p-3 bg-green-900/30 border border-green-700 rounded text-green-200">
                          {translate('Copy this answer code and send back to host', language as Locale)}
                        </div>

                        <textarea
                          readOnly
                          value={manualConnection.state.generatedCode}
                          className="w-full h-32 px-3 py-2 bg-slate-900 border border-slate-600 rounded text-white text-xs font-mono"
                        />

                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(manualConnection.state.generatedCode);
                          }}
                          className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded font-medium transition-colors flex items-center justify-center gap-2"
                        >
                          <Copy size={16} />
                          {translate('Copy to Clipboard', language as Locale)}
                        </button>

                        {!manualConnection.state.channelOpen && (
                          <div className="flex items-center justify-center gap-2 text-blue-400">
                            <Loader2 size={20} className="animate-spin" />
                            {translate('Waiting for host to connect...', language as Locale)}
                          </div>
                        )}
                      </>
                    )}

                    {/* Show connecting message if no code yet */}
                    {!manualConnection.state.generatedCode && (
                      <div className="flex items-center justify-center gap-2 text-blue-400">
                        <Loader2 size={20} className="animate-spin" />
                        {translate('Connecting...', language as Locale)}
                      </div>
                    )}

                    {/* Show Done button only when fully connected */}
                    {manualConnection.state.step === 'connected' && manualConnection.state.channelOpen && (
                      <button
                        onClick={() => {
                          setShowManualConnection(false);
                          manualConnection.reset();
                        }}
                        className="w-full py-3 px-4 bg-green-600 hover:bg-green-500 text-white rounded font-medium transition-colors"
                      >
                        {translate('Done', language as Locale)}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Reset button */}
            <div className="mt-6 pt-4 border-t border-slate-700">
              <button
                onClick={() => {
                  manualConnection.reset();
                  setGuestNameInput('');
                }}
                className="w-full py-2 px-4 bg-red-900/50 hover:bg-red-900/70 text-red-200 rounded font-medium transition-colors"
              >
                {translate('Reset', language as Locale)}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Pack Creation Modal */}
      {packModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[10001]">
          <div className="bg-slate-800 rounded-lg shadow-xl w-[575px] max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-center py-3 px-4 border-b border-slate-700">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Package size={20} />
                {translate('Create Pack', language as Locale)}
              </h3>
              <button
                onClick={() => setPackModalOpen(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
              <p className="text-sm text-gray-300">
                {translate('A pack contains your game state and all custom images in a single file', language as Locale)}
              </p>

              {/* Pack Name */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  {translate('Pack Name', language as Locale)} *
                </label>
                <input
                  type="text"
                  value={packName}
                  onChange={(e) => setPackName(e.target.value)}
                  placeholder="nexus_pack_2026-03-26"
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                  autoFocus
                />
              </div>

              {/* Pack Description */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  {translate('Pack Description (optional)', language as Locale)}
                </label>
                <textarea
                  value={packDescription}
                  onChange={(e) => setPackDescription(e.target.value)}
                  placeholder="Description of your pack..."
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                />
              </div>

              {/* Info */}
              {isCreatingPack && (
                <div className="flex items-center justify-center gap-2 text-blue-400 py-2">
                  <Loader2 size={16} className="animate-spin" />
                  {translate('Creating pack...', language as Locale)}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 py-3 px-4 border-t border-slate-700 bg-slate-900/50">
              <button
                onClick={() => setPackModalOpen(false)}
                disabled={isCreatingPack}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white rounded font-medium transition-colors"
              >
                {translate('Cancel', language as Locale)}
              </button>
              <button
                onClick={handleCreatePack}
                disabled={isCreatingPack || !packName.trim()}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:text-gray-400 text-white rounded font-medium transition-colors flex items-center gap-2"
              >
                {isCreatingPack ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    {translate('Creating pack...', language as Locale)}
                  </>
                ) : (
                  <>
                    <Package size={16} />
                    {translate('Create Pack', language as Locale)}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Local File Restore Dialog */}
      {localFilesToRestore && pendingLoadState && (
        <LocalFileRestoreDialog
          localFiles={localFilesToRestore}
          onConfirm={async (_fileMap) => {
            // Load state without processing local files (old system not supported)
            dispatch({ type: 'LOAD_GAME', payload: pendingLoadState as GameState });

            setLocalFilesToRestore(null);
            setPendingLoadState(null);

            if (fileInputRef.current) {
              fileInputRef.current.value = '';
            }
          }}
          onCancel={() => {
            // Load without images
            dispatch({ type: 'LOAD_GAME', payload: pendingLoadState as GameState });
            setLocalFilesToRestore(null);
            setPendingLoadState(null);
            if (fileInputRef.current) {
              fileInputRef.current.value = '';
            }
          }}
        />
      )}

      {/* Session Log Viewer */}
      {showLogViewer && <LogViewer isOpen={showLogViewer} onClose={() => setShowLogViewer(false)} />}
    </div>
  );
};

export const MainMenuContentMemoized = React.memo(MainMenuContent);
MainMenuContentMemoized.displayName = 'MainMenuContentMemoized';

// Category section component
interface CategorySectionProps {
  category: {
    id: string;
    label: string;
    icon: React.ReactNode;
    disabled?: boolean;
    items: Array<{
      name: string;
      type: string;
      sides?: number;
      shape?: TokenShape;
      gridType?: GridType;
      panelType?: PanelType;
      disabled?: boolean;
    }>;
    matcher: (obj: TableObject) => boolean;
  };
  state: GameState;
  dispatch: React.Dispatch<any>;
  deleteCandidateId: string | null;
  setDeleteCandidateId: (id: string | null) => void;
  currentUserIsGM: boolean;
  canCreateObjects: boolean;
  canConfigureObjects: boolean;
  canDeleteObjects: boolean;
  canHideObjects: boolean;
  language: AppLanguage;
  isShiftPressed: boolean;
  viewTransform: any;
  hyperscaleLayers: import('../types').HyperscaleLayer[];
  selectedLayersFromContext: import('../types').HyperscaleLayer[];
}

const CategorySection: React.FC<CategorySectionProps> = ({
  category,
  state,
  dispatch,
  deleteCandidateId,
  setDeleteCandidateId,
  currentUserIsGM,
  canCreateObjects,
  canConfigureObjects,
  canDeleteObjects,
  canHideObjects,
  language,
  isShiftPressed,
  viewTransform,
  hyperscaleLayers,
  selectedLayersFromContext,
}) => {
  // Load expanded state from localStorage, default to false (collapsed)
  const [isExpanded, setIsExpanded] = useState(() => {
    try {
      const saved = localStorage.getItem(`category-expanded-${category.id}`);
      return saved === 'true';
    } catch {
      return false;
    }
  });

  // Save expanded state to localStorage when it changes
  const toggleExpanded = () => {
    const newState = !isExpanded;
    setIsExpanded(newState);
    try {
      localStorage.setItem(`category-expanded-${category.id}`, String(newState));
    } catch {
      // Ignore localStorage errors
    }
  };

  // Count objects on table that match this category
  const objectsOnTable = useMemo(() =>
    Object.values(state.objects).filter((obj): obj is TableObject =>
      category.matcher(obj) &&
      !(obj as any).archetypeId  // Exclude token copies (tokens created from archetypes)
      // Objects in cursor slot should NOW be visible in the list
    ),
    [state.objects, category.matcher]
  );

  // Helper function to check if an action button should be shown for an object
  // Based on both actionButtons setting and user permissions
  const isActionButtonShown = useCallback((obj: TableObject, action: ContextAction): boolean => {
    // For panels:
    // - Non-GM players (host or guest): only show lock and hide/show buttons
    // - GM host: show all buttons like normal objects
    if (obj.type === ItemType.PANEL && !currentUserIsGM) {
      // For non-GM players, panels only show lock and hide/show buttons
      return action === 'lock' || action === 'hide' || action === 'show';
    }

    // GM always sees core management buttons: lock, hide, clone, delete
    // These buttons are always visible to GM regardless of object settings
    if (currentUserIsGM) {
      const coreManagementButtons: ContextAction[] = ['lock', 'hide', 'clone', 'delete'];
      if (coreManagementButtons.includes(action)) {
        return true;
      }
    }

    // Get actionButtons for this object
    let actionButtons: ContextAction[] | undefined;
    let allowedActions: ContextAction[] | undefined;
    let allowedActionsForGM: ContextAction[] | undefined;

    if (obj.type === ItemType.CARD) {
      // Cards inherit from deck
      const deck = state.objects[(obj as any).deckId] as Deck;
      actionButtons = deck?.cardActionButtons;
      allowedActions = deck?.cardAllowedActions;
      allowedActionsForGM = deck?.cardAllowedActionsForGM;
    } else {
      actionButtons = (obj as any).actionButtons;
      allowedActions = obj.allowedActions;
      allowedActionsForGM = obj.allowedActionsForGM;
    }

    // First check if action is in actionButtons
    // If actionButtons is not set or empty, default to showing the button (backward compatibility)
    const isInActionButtons = !actionButtons || actionButtons.length === 0 || actionButtons.includes(action);
    if (!isInActionButtons) {
      return false;
    }

    // For non-GM players, check both object settings and global permissions
    if (!currentUserIsGM) {
      // Check global permissions first
      if (action === 'hide' && !canHideObjects) return false;
      if (action === 'delete' && !canDeleteObjects) return false;
    }

    // Then check if user has permission to perform this action
    // For GM: check allowedActionsForGM, for players: check allowedActions
    const permissionsToCheck = currentUserIsGM ? allowedActionsForGM : allowedActions;

    // undefined or null = all actions allowed (default behavior)
    if (!permissionsToCheck || permissionsToCheck.length === 0) {
      return true;
    }

    // Check if this specific action is allowed
    return permissionsToCheck.includes(action);
  }, [state.objects, currentUserIsGM, canHideObjects, canDeleteObjects]);

  const handleCreateItem = (item: typeof category.items[number]) => {
    // Screen coordinates (center of viewport)
    const screenX = window.innerWidth / 2;
    const screenY = window.innerHeight / 2;

    // Convert screen coordinates to world coordinates (in pixels first)
    // Objects are rendered inside transform container with: translate(offset.x, offset.y) scale(zoom)
    const zoom = viewTransform.zoom;
    const offsetX = viewTransform.offset.x;
    const offsetY = viewTransform.offset.y;
    const scrollX = viewTransform.scroll?.x ?? 0;
    const scrollY = viewTransform.scroll?.y ?? 0;

    const worldX_px = (screenX - offsetX + scrollX) / zoom;
    const worldY_px = (screenY - offsetY + scrollY) / zoom;

    // Convert pixels to VU (Virtual Units) for consistent positioning across different screen sizes
    const pixelsPerVU = calculatePixelsPerVU(window.innerWidth, window.innerHeight);
    const worldX = pixelsToVu(worldX_px, pixelsPerVU);
    const worldY = pixelsToVu(worldY_px, pixelsPerVU);

    switch (item.type) {
      case 'DECK': {
        const deckId = generateUUID();
        const deck: Deck = {
          id: deckId,
          type: ItemType.DECK,
          name: item.name,
          x: worldX,
          y: worldY,
          width: DEFAULT_DECK_WIDTH,
          height: DEFAULT_DECK_HEIGHT,
          rotation: 0,
          color: '#2c3e50',
          borderColor: '#64748b',
          borderWidth: 2,
          content: '',
          isOnTable: true,
          locked: false,
          baseCardIds: [],
          cardIds: [],
          showTopCard: false,
          piles: [{
            id: generateUUID(),
            name: 'Discard',
            deckId: deckId,
            position: 'right',
            cardIds: [],
            faceUp: false,
            visible: false,
            size: 1,
            isMillPile: true,
          }],
          // Deck-specific properties
          cardShape: CardShape.POKER,
          cardOrientation: CardOrientation.VERTICAL,
          cardWidth: DEFAULT_DECK_WIDTH,
          cardHeight: DEFAULT_DECK_HEIGHT,
          cardAllowedActions: undefined, // undefined = all actions allowed for players
          cardAllowedActionsForGM: undefined, // undefined = all actions allowed for GM
          cardActionButtons: ['moveToHand', 'swingClockwise', 'flip'],
          cardSingleClickAction: undefined,
          cardDoubleClickAction: undefined,
          cardNamePosition: 'none' as const,
          // Deck actions (for the deck itself, not cards)
          actionButtons: ['draw', 'playTopCard', 'millTopCard', 'shuffleDeck'],
          allowedActions: ['draw', 'playTopCard', 'millTopCard', 'toBottom', 'showTop', 'topDeck', 'searchDeck', 'shuffleDeck', 'piles', 'returnAll', 'rotateClockwise', 'rotateCounterClockwise', 'swingClockwise', 'swingCounterClockwise'],
          allowedActionsForGM: undefined, // undefined = all actions allowed for GM
        };
        dispatch({ type: 'ADD_OBJECT', payload: deck });
        break;
      }
      case 'HEX_DECK': {
        // Hex card dimensions for pointy-top orientation (vertices at top/bottom)
        // Width = sqrt(3) * height / 2, Height = 2 * radius
        // Using similar height to standard cards (168), width ≈ 145.5
        const hexHeight = DEFAULT_DECK_HEIGHT;  // 168
        const hexWidth = Math.sqrt(3) * hexHeight / 2;  // ≈ 145.5
        const deckId = generateUUID();

        const deck: Deck = {
          id: deckId,
          type: ItemType.DECK,
          name: 'Hex Deck',
          x: worldX,
          y: worldY,
          width: hexWidth,
          height: hexHeight,
          rotation: 0,
          color: '#2c3e50',
          borderColor: '#64748b',
          borderWidth: 2,
          content: '',
          isOnTable: true,
          locked: false,
          baseCardIds: [],
          cardIds: [],
          showTopCard: false,
          piles: [{
            id: generateUUID(),
            name: 'Discard',
            deckId: deckId,
            position: 'right',
            cardIds: [],
            faceUp: false,
            visible: false,
            size: 1,
            isMillPile: true,
          }],
          cardShape: CardShape.HEX,
          cardOrientation: CardOrientation.VERTICAL,
          cardWidth: hexWidth,
          cardHeight: hexHeight,
          cardAllowedActions: undefined, // undefined = all actions allowed for players
          cardAllowedActionsForGM: undefined, // undefined = all actions allowed for GM
          cardActionButtons: ['moveToHand', 'swingClockwise', 'flip'],
          cardSingleClickAction: undefined,
          cardDoubleClickAction: undefined,
          cardNamePosition: 'none' as const,
          // Deck actions (for the deck itself, not cards)
          actionButtons: ['draw', 'playTopCard', 'millTopCard', 'shuffleDeck'],
          allowedActions: ['draw', 'playTopCard', 'millTopCard', 'toBottom', 'showTop', 'topDeck', 'searchDeck', 'shuffleDeck', 'piles', 'returnAll', 'rotateClockwise', 'rotateCounterClockwise', 'swingClockwise', 'swingCounterClockwise'],
          allowedActionsForGM: undefined, // undefined = all actions allowed for GM
        };
        dispatch({ type: 'ADD_OBJECT', payload: deck });
        break;
      }
      case 'TOKEN': {
        const token: Token = {
          id: generateUUID(),
          type: ItemType.TOKEN,
          name: item.name,
          x: worldX,
          y: worldY,
          width: TOKEN_SIZE,
          height: TOKEN_SIZE,
          rotation: 0,
          color: '#e74c3c',
          borderColor: '#ffffff',
          borderWidth: 2,
          isOnTable: true,
          locked: false,
          shape: item.shape || TokenShape.CIRCLE,
          content: '',
          snapToGrid: false,
          gridType: GridType.NONE,
          gridSize: 50,
          zIndex: 10, // Tokens above cells by default
        };
        dispatch({ type: 'ADD_OBJECT', payload: token });
        break;
      }
      case 'TOKEN_TYPE': {
        // Normalize dimensions for hexagon shape
        const hexWidth = Math.round(TOKEN_SIZE / 1.155);
        const tokenType: TokenType = {
          id: generateUUID(),
          type: ItemType.TOKEN_TYPE,
          name: item.name,
          x: 0,
          y: 0,
          width: hexWidth,
          height: TOKEN_SIZE,
          rotation: 0,
          color: '#3498db',
          borderColor: '#ffffff',
          borderWidth: 2,
          isOnTable: false,
          locked: false,
          shape: TokenShape.HEX,
          content: '',
          // Token type specific properties
          defaultSize: { width: hexWidth, height: TOKEN_SIZE },
          autoName: false,
          namePrefix: '',
          spawnCount: 0,
        };
        dispatch({ type: 'ADD_OBJECT', payload: tokenType });
        break;
      }
      case 'DICE': {
        const sides = item.sides || 6;
        // Determine shape based on number of sides
        let shape: TokenShape;
        let width = DEFAULT_DICE_SIZE;
        let height = DEFAULT_DICE_SIZE;

        if (sides < 5) {
          shape = TokenShape.TRIANGLE;
          // Adjust dimensions for equilateral triangle
          width = DEFAULT_DICE_SIZE;
          height = Math.round(DEFAULT_DICE_SIZE / 1.155);
        } else if (sides <= 12) {
          shape = TokenShape.SQUARE;
          width = DEFAULT_DICE_SIZE;
          height = DEFAULT_DICE_SIZE;
        } else {
          shape = TokenShape.HEX;
          // Adjust dimensions for hexagon - width becomes smaller
          width = Math.round(DEFAULT_DICE_SIZE / 1.155);
          height = DEFAULT_DICE_SIZE;
        }

        const dice: DiceObject = {
          id: generateUUID(),
          type: ItemType.DICE_OBJECT,
          name: item.name,
          x: worldX,
          y: worldY,
          width,
          height,
          rotation: 0,
          color: '#6366f1',
          content: '',
          isOnTable: true,
          locked: false,
          sides,
          currentValue: 1,
          shape,
          actionButtons: ['roll'],
          allowedActions: ['roll'],
          allowedActionsForGM: ['roll'],
        };
        dispatch({ type: 'ADD_OBJECT', payload: dice });
        break;
      }
      case 'COUNTER': {
        const isLifeCounter = item.name === 'Life Counter';
        const counter: Counter = {
          id: generateUUID(),
          type: ItemType.COUNTER,
          name: item.name,
          x: worldX,
          y: worldY,
          width: DEFAULT_COUNTER_WIDTH,
          height: DEFAULT_COUNTER_HEIGHT,
          rotation: 0,
          color: '#10b981',
          content: '',
          isOnTable: true,
          locked: false,
          value: isLifeCounter ? 30 : 0,
          baseValue: isLifeCounter ? 30 : 0,
          maxValue: isLifeCounter ? undefined : 30,
          allowNegative: !isLifeCounter,
          actionButtons: ['lock', 'delete'],
        };
        dispatch({ type: 'ADD_OBJECT', payload: counter });
        break;
      }
      case 'BOARD': {
        const board: Board = {
          id: generateUUID(),
          type: ItemType.BOARD,
          name: item.name,
          x: worldX - 400,
          y: worldY - 300,
          width: 800,
          height: 600,
          rotation: 0,
          color: '#34495e',
          content: '',
          isOnTable: true,
          locked: false,
          shape: TokenShape.HEX,
          gridType: GridType.HEX,
          gridSize: 65,
          gridWidth: 100,  // Must match DEFAULT_HEX_WIDTH for HEX grids
          gridHeight: 115, // Must match DEFAULT_HEX_WIDTH * 1.15 for HEX grids
          snapToGrid: true,
          hyperscaleLayerId: 'boards',  // Place on boards hyperscale layer
        };
        dispatch({ type: 'ADD_OBJECT', payload: board });
        break;
      }
      case 'BATTLEFIELD_CELL': {
        // Determine hyperscale layer: try 'boards' first, then use top selected layer
        let targetLayerId: string | undefined;

        // First priority: 'boards' layer if it exists
        const boardsLayer = hyperscaleLayers.find(l => l.id === 'boards');
        if (boardsLayer) {
          targetLayerId = 'boards';
        } else if (selectedLayersFromContext.length > 0) {
          // Second priority: use the top-most selected layer
          // Sort selected layers by order (lower = higher priority) and pick the first
          const sortedSelectedLayers = [...selectedLayersFromContext].sort((a, b) => a.order - b.order);
          if (sortedSelectedLayers.length > 0) {
            targetLayerId = sortedSelectedLayers[0].id;
          }
        }

        const cell: BattlefieldCell = {
          id: generateUUID(),
          type: ItemType.BATTLEFIELD_CELL,
          shape: TokenShape.SQUARE, // Default shape, can be changed in settings
          x: worldX - pixelsToVu(50, pixelsPerVU), // Center the cell on cursor (50 is half of default 100vu width)
          y: worldY - pixelsToVu(50, pixelsPerVU), // Center the cell on cursor (50 is half of default 100vu height)
          rotation: 0,
          width: 100,
          height: 100,
          content: '',
          name: item.name || 'Cell',
          isOnTable: true,
          locked: false,
          color: '#496179',
          borderColor: '#212f3c',
          borderWidth: 3,
          opacity: 100,
          borderOpacity: 100,
          snapToGrid: false,
          gridSize: 50,
          zIndex: 0, // Will be clamped to layer bounds
          hyperscaleLayerId: targetLayerId, // Place on boards layer or top selected layer
          actionButtons: ['pin', 'lock', 'delete'], // Add pin button for battlefield cells
        };
        dispatch({ type: 'ADD_OBJECT', payload: cell });
        break;
      }
      case 'NEXUS_BOARD': {
        // Find target hyperscale layer
        let targetLayerId: string | undefined = undefined;
        const sortedSelectedLayers = [...selectedLayersFromContext].sort((a, b) => a.order - b.order);
        if (sortedSelectedLayers.length > 0) {
          targetLayerId = sortedSelectedLayers[0].id;
        }

        const boardId = generateUUID();
        const mainCellId = generateUUID();
        const cellWidth = 100;
        const cellHeight = 150;

        // Create main cell as a separate NexusCellObject
        const mainCell: NexusCellObject = {
          id: mainCellId,
          type: ItemType.NEXUS_CELL,
          shape: TokenShape.HEX,
          x: worldX - pixelsToVu(cellWidth / 2, pixelsPerVU), // Center the cell on cursor
          y: worldY - pixelsToVu(cellHeight / 2, pixelsPerVU), // Center the cell on cursor
          rotation: 0,
          width: cellWidth,
          height: cellHeight,
          content: '',
          name: 'Main Cell',
          isOnTable: true,
          locked: false,
          color: '#496179',
          borderColor: '#212f3c',
          borderWidth: 3,
          opacity: 100,
          borderOpacity: 100,
          snapToGrid: true,
          gridSize: 50,
          zIndex: 0,
          hyperscaleLayerId: targetLayerId,
          nexusBoardId: boardId,
          direction: 'N' as HexDirection,
          offset: { x: 0, y: 0 },
          gridType: GridType.HEX,
          magnetPointCount: 1,
          magnetRotation: 0,
        };

        // Create the NexusBoard (smaller, just a container)
        const nexusBoard: NexusBoard = {
          id: boardId,
          type: ItemType.NEXUS_BOARD,
          shape: TokenShape.HEX,
          x: worldX - pixelsToVu(50, pixelsPerVU),
          y: worldY - pixelsToVu(75, pixelsPerVU),
          rotation: 0,
          width: 0,  // Board itself doesn't render, just a container
          height: 0,
          content: '',
          name: item.name || 'Nexus Board',
          isOnTable: true,
          locked: false,
          color: '#496179',
          borderColor: '#212f3c',
          borderWidth: 0,
          opacity: 100,
          borderOpacity: 100,
          zIndex: 0,
          hyperscaleLayerId: targetLayerId,
          gridType: GridType.HEX,
          gridSize: 50,
          cells: [
            {
              id: mainCellId,
              direction: 'N' as HexDirection,
            }
          ],
          cellWidth: cellWidth,
          cellHeight: cellHeight,
          snapToGrid: true, // Enable magnetism by default
        };

        // Add both objects - board first, then cell
        dispatch({ type: 'ADD_OBJECT', payload: nexusBoard });
        dispatch({ type: 'ADD_OBJECT', payload: mainCell });
        break;
      }
      case 'PANEL': {
        // Panels use screen coordinates (pixels), not world coordinates
        // Center the panel on screen
        const panelX = window.innerWidth / 2 - DEFAULT_PANEL_WIDTH / 2;
        const panelY = window.innerHeight / 2 - DEFAULT_PANEL_HEIGHT / 2;

        dispatch({
          type: 'CREATE_PANEL',
          payload: {
            panelType: item.panelType!,
            x: panelX,
            y: panelY,
            width: DEFAULT_PANEL_WIDTH,
            height: DEFAULT_PANEL_HEIGHT,
            title: item.name,
          }
        });
        break;
      }
      case 'FIRE_CONE_EFFECT': {
        const effectTemplate: import('../types').EffectTemplate = {
          id: generateUUID(),
          type: ItemType.EFFECT_TEMPLATE,
          name: item.name || 'Fire Cone Effect',
          x: worldX - pixelsToVu(100, pixelsPerVU), // Center on cursor
          y: worldY - pixelsToVu(175, pixelsPerVU), // Center vertically (height/2 = 350/2 = 175)
          rotation: 0, // Will point upward due to calculation offset
          width: 200,
          height: 350,
          content: 'https://res.cloudinary.com/dxxh6meej/image/upload/v1777883916/FireConeEffect_npwe4x.png',
          isOnTable: true,
          locked: false,
          pivot: { x: 50, y: 100 }, // Default pivot at bottom center
          actionButtons: ['lock', 'delete'],
          hyperscaleLayerId: 'boards', // Place on boards hyperscale layer (with game boards)
          zIndex: 15, // Above tokens for visibility
          opacity: 85, // 85% opacity by default
        };
        dispatch({ type: 'ADD_OBJECT', payload: effectTemplate });
        break;
      }
      case 'FIRE_EXPLOSION_EFFECT': {
        const effectTemplate: import('../types').EffectTemplate = {
          id: generateUUID(),
          type: ItemType.EFFECT_TEMPLATE,
          name: item.name || 'Fire Explosion Effect',
          x: worldX - pixelsToVu(150, pixelsPerVU), // Center on cursor (width/2 = 300/2 = 150)
          y: worldY - pixelsToVu(150, pixelsPerVU), // Center on cursor (height/2 = 300/2 = 150)
          rotation: 0,
          width: 300,
          height: 300,
          content: 'https://res.cloudinary.com/dxxh6meej/image/upload/v1777884706/FireExplosionEffect_bejprf.png',
          isOnTable: true,
          locked: false,
          pivot: { x: 50, y: 50 }, // Default pivot at center
          rotationMarkerDistance: 150, // Distance from pivot to rotation marker (radius of explosion)
          proportionalScaling: true, // Scale width proportionally when resizing height
          actionButtons: ['lock', 'delete'],
          hyperscaleLayerId: 'boards', // Place on boards hyperscale layer (with game boards)
          zIndex: 15, // Above tokens for visibility
          opacity: 85, // 85% opacity by default
        };
        dispatch({ type: 'ADD_OBJECT', payload: effectTemplate });
        break;
      }
    }
  };

  return (
    <div className="mb-3 border-b border-slate-700 pb-3">
      <button
        onClick={toggleExpanded}
        className={`w-full flex items-center gap-2 py-1 px-2 rounded transition-colors ${
          category.disabled
            ? 'text-gray-600 cursor-not-allowed'
            : 'text-gray-300 hover:text-white hover:bg-slate-800'
        }`}
      >
        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {category.icon}
        <span className="flex-1 text-left text-sm font-medium">{category.label}</span>
        <span className="text-xs text-gray-500">{objectsOnTable.length}</span>
      </button>

      {isExpanded && (
        <div className="mt-2 space-y-1 pl-4">
          {/* Create items */}
          {canCreateObjects && category.items.map((item, idx) => {
            const isItemDisabled = category.disabled || item.disabled;
            return (
              <button
                key={idx}
                onClick={() => !isItemDisabled && handleCreateItem(item)}
                disabled={isItemDisabled}
                className={`w-full flex items-center gap-2 py-1 px-2 rounded text-xs transition-colors ${
                  isItemDisabled
                    ? 'text-gray-600 cursor-not-allowed'
                    : 'text-gray-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Plus size={12} />
                <span>{item.name}</span>
              </button>
            );
          })}

          {/* Objects on table */}
          {objectsOnTable.length > 0 && (
            <div className="mt-2 pt-2 border-t border-slate-700">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{translate('On Table', language as Locale)}</div>
              {objectsOnTable.map(obj => {
                const isLocked = obj.locked || false;
                // For UI objects check 'visible', for game objects check 'isOnTable'
                // Token types (TOKEN_TYPE) should always be considered visible in this list
                const isVisible = obj.type === ItemType.TOKEN_TYPE
                  ? true
                  : 'visible' in obj ? obj.visible !== false : (obj as any).isOnTable !== false;
                // Get color - panels don't have color property
                let objColor = 'color' in obj ? obj.color : '#6366f1';
                // For effect templates, use red color
                if (obj.type === ItemType.EFFECT_TEMPLATE) {
                  objColor = '#ef4444';
                }
                // For drawings, use their color property or first stroke color
                if (obj.type === ItemType.DRAWING) {
                  const drawing = obj as Drawing;
                  objColor = drawing.color || (drawing.strokes.length > 0 ? drawing.strokes[0].color : '#ef4444');
                }
                // Get name - handle different object types
                const getDisplayName = () => {
                  if (obj.type === ItemType.PANEL) return (obj as PanelObject).title;
                  if (obj.type === ItemType.WINDOW) return (obj as any).title || 'Window';
                  const baseName = 'name' in obj ? obj.name : 'Object';
                  // For token types (archetypes), show copy count in parentheses
                  if (obj.type === ItemType.TOKEN_TYPE) {
                    const copyCount = Object.values(state.objects).filter(
                      o => o.type === ItemType.TOKEN && (o as any).archetypeId === obj.id
                    ).length;
                    const maxCopies = (obj as any).maxCopies ?? 0;
                    if (copyCount > 0) {
                      return maxCopies > 0 ? `${baseName} (${copyCount}/${maxCopies})` : `${baseName} (${copyCount})`;
                    }
                    return baseName;
                  }
                  return baseName;
                };
                return (
                  <div
                    key={obj.id}
                    className={`flex items-center gap-1 py-1 px-2 rounded text-xs group ${isVisible ? 'text-white hover:bg-slate-800' : 'text-gray-400 hover:bg-slate-800/50'}`}
                  >
                    <span className="text-gray-500 flex-shrink-0 text-xs">{getTypeIcon(obj)}</span>
                    <div
                      className="w-3 h-3 rounded flex-shrink-0"
                      style={{ backgroundColor: obj.type === ItemType.TOKEN_TYPE ? objColor : (isVisible ? objColor : '#4a5568') }}
                    />
                    <span className="flex-1 truncate font-normal">{getDisplayName()}</span>
                    {isActionButtonShown(obj, 'lock') && (
                      <button
                        onClick={() => {
                          // Check if object is on an individualObjects layer
                          const individualLayer = state.hyperscaleLayers.find(l => l.id === (obj.hyperscaleLayerId || 'tokens'));
                          const isIndividualObjectsLayer = individualLayer?.individualObjects === true;
                          // For individualObjects layers, lock state is local-only (not synced)
                          dispatch({
                            type: 'UPDATE_OBJECT',
                            payload: { id: obj.id, updates: { locked: !isLocked } },
                            _localOnly: isIndividualObjectsLayer
                          });
                        }}
                        className={`p-1 rounded text-xs ${isLocked ? 'text-red-400 hover:text-white' : 'hover:bg-slate-700'} opacity-0 group-hover:opacity-100`}
                        title={isLocked ? 'Unlock' : 'Lock'}
                      >
                        {isLocked ? <Lock size={10} /> : <Unlock size={10} />}
                      </button>
                    )}
                    {isActionButtonShown(obj, 'hide') && (
                      <button
                        onClick={() => {
                          const propToUpdate = 'visible' in obj ? 'visible' : 'isOnTable';
                          // Check if object is on an individualObjects layer
                          const individualLayer = state.hyperscaleLayers.find(l => l.id === (obj.hyperscaleLayerId || 'tokens'));
                          const isIndividualObjectsLayer = individualLayer?.individualObjects === true;
                          // For individualObjects layers, visibility is local-only (not synced)
                          dispatch({
                            type: 'UPDATE_OBJECT',
                            payload: { id: obj.id, updates: { [propToUpdate]: !isVisible } },
                            _localOnly: isIndividualObjectsLayer
                          });
                        }}
                        className="p-1 hover:bg-slate-700 rounded opacity-0 group-hover:opacity-100 text-xs"
                        title={isVisible ? 'Hide' : 'Show'}
                      >
                        {isVisible ? <EyeOff size={10} /> : <Eye size={10} />}
                      </button>
                    )}
                    {isActionButtonShown(obj, 'clone') && (
                      <button
                        onClick={() => {
                          // Clone the object - for Token Types this creates a copy of the type itself,
                          // not a new token instance
                          dispatch({ type: 'CLONE_OBJECT', payload: { id: obj.id } });
                        }}
                        className="p-1 hover:bg-slate-700 rounded opacity-0 group-hover:opacity-100 text-xs"
                        title="Clone"
                      >
                        <Copy size={10} />
                      </button>
                    )}
                    {(currentUserIsGM || canConfigureObjects) && (
                      <button
                        onClick={() => dispatch({
                          type: 'CREATE_WINDOW',
                          payload: {
                            windowType: WindowType.OBJECT_SETTINGS,
                            targetObjectId: obj.id,
                            title: 'Properties'
                          }
                        })}
                        className="p-1 hover:bg-slate-700 rounded opacity-0 group-hover:opacity-100 text-xs"
                        title="Properties"
                      >
                        <Settings size={10} />
                      </button>
                    )}
                    {isActionButtonShown(obj, 'delete') && (
                      <button
                        onMouseDown={(e) => {
                          // Prevent default behavior to avoid interference
                          e.preventDefault();
                          e.stopPropagation();

                          // Token copies (tokens with archetypeId) are deleted immediately without confirmation
                          if (obj.type === ItemType.TOKEN && (obj as any).archetypeId) {
                            dispatch({ type: 'DELETE_OBJECT', payload: { id: obj.id }});
                          } else if (isShiftPressed) {
                            // If Shift is held, delete immediately without confirmation
                            dispatch({ type: 'DELETE_OBJECT', payload: { id: obj.id }});
                          } else {
                            setDeleteCandidateId(obj.id);
                          }
                        }}
                        className="p-1 hover:bg-red-600 rounded text-red-400 hover:text-white opacity-0 group-hover:opacity-100 text-xs"
                        title="Delete (Shift+Click to skip confirmation)"
                      >
                        <Trash2 size={10} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {deleteCandidateId && category.matcher(state.objects[deleteCandidateId]) && (
        <DeleteConfirmModal
          objectName={
            state.objects[deleteCandidateId]?.type === ItemType.PANEL
              ? (state.objects[deleteCandidateId] as PanelObject).title
              : state.objects[deleteCandidateId]?.type === ItemType.WINDOW
                ? (state.objects[deleteCandidateId] as any).title || 'Window'
                : state.objects[deleteCandidateId]?.name || 'Object'
          }
          language={language}
          onConfirm={() => {
            dispatch({ type: 'DELETE_OBJECT', payload: { id: deleteCandidateId }});
            setDeleteCandidateId(null);
          }}
          onCancel={() => setDeleteCandidateId(null)}
        />
      )}
    </div>
  );
};

// Drawing tool button component
interface DrawingToolButtonProps {
  tool: DrawingTool;
  icon: React.ReactNode;
  label: string;
  selectedTool: DrawingTool;
  setSelectedTool: (tool: DrawingTool) => void;
}

const DrawingToolButton: React.FC<DrawingToolButtonProps> = ({ tool, icon, label, selectedTool, setSelectedTool }) => {
  const handleClick = () => {
    setSelectedTool(tool);
  };

  return (
    <button
      onClick={handleClick}
      className={`flex flex-col items-center justify-center p-2 rounded-lg transition-colors ${
        selectedTool === tool
          ? 'bg-purple-600 text-white'
          : 'bg-slate-700 text-gray-400 hover:text-white hover:bg-slate-600'
      }`}
      title={label}
    >
      {icon}
      <span className="text-[10px] mt-1">{label}</span>
    </button>
  );
};

// Token type card component
interface TokenTypeCardProps {
  archetype: TokenType;
  copyCount: number;
  maxCopies: number;
  onSettings: () => void;
}

const TokenTypeCard: React.FC<TokenTypeCardProps> = ({ archetype, copyCount, maxCopies, onSettings }) => {
  // Track drag state to distinguish click from drag
  const dragStartTimeRef = useRef<number>(0);
  const dragStartPositionRef = useRef<{ x: number; y: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Handle archetype click - add to cursor slot
  const handleArchetypeClick = useCallback((clientX: number, clientY: number) => {
    const event = new CustomEvent('add-token-to-cursor-slot', {
      detail: { archetypeId: archetype.id, clientX, clientY }
    });

    window.dispatchEvent(event);
  }, [archetype.id, archetype.name]);

  // Set up capture phase listener for mousedown to set flag BEFORE Tabletop's handleGlobalClick
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    const handleMouseDownCapture = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Check if clicking on settings button - don't add token in that case
      const settingsButton = target.closest('[data-archetype-settings]') as HTMLElement;
      if (settingsButton) return;

      (card as HTMLElement).dataset.isAddingToken = 'true';
      dragStartTimeRef.current = Date.now();
      dragStartPositionRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUpCapture = (e: MouseEvent) => {
      if (card.dataset.isAddingToken) {
        const dragDuration = Date.now() - dragStartTimeRef.current;
        const dragDistance = dragStartPositionRef.current
          ? Math.sqrt(
              Math.pow(e.clientX - dragStartPositionRef.current.x, 2) +
              Math.pow(e.clientY - dragStartPositionRef.current.y, 2)
            )
          : 0;

        // Clear the adding token flag
        delete card.dataset.isAddingToken;

        // If it was a quick click with minimal movement, treat as click
        if (dragDuration < 200 && dragDistance < 10) {
          handleArchetypeClick(e.clientX, e.clientY);
        }
      }
    };

    // Use capture phase to ensure this runs before Tabletop's handleGlobalClick
    card.addEventListener('mousedown', handleMouseDownCapture, { capture: true });
    card.addEventListener('mouseup', handleMouseUpCapture, { capture: true });

    return () => {
      card.removeEventListener('mousedown', handleMouseDownCapture, { capture: true } as any);
      card.removeEventListener('mouseup', handleMouseUpCapture, { capture: true } as any);
    };
  }, []); // Empty dependencies - handlers are created once and never change

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
      ref={cardRef}
      data-archetype-card
      data-archetype-id={archetype.id}
      className="relative group aspect-square bg-slate-700 rounded-lg border-2 border-slate-600 hover:border-purple-500 cursor-pointer transition-colors"
      title={`${archetype.name} (${maxCopies > 0 ? `${copyCount}/${maxCopies}` : copyCount})\nClick to add to cursor slot`}
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
          onSettings();
        }}
        className="absolute top-0.5 right-0.5 p-1 bg-slate-800 rounded opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Settings size={10} className="text-gray-400" />
      </button>

      {/* Name label */}
      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] truncate px-1 py-0.5 rounded-b">
        {maxCopies > 0 ? `${archetype.name} (${copyCount}/${maxCopies})` : `${archetype.name} (${copyCount})`}
      </div>
    </div>
  );
};
