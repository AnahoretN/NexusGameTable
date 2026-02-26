import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useHandCardScale } from '../hooks/useHandCardScale';
import { createPortal } from 'react-dom';
import { useGame, GameState } from '../store/GameContext';
import { AppLanguage } from '../types';
import { logger } from '../utils/logger';
import { ItemType, TableObject, Token, CardLocation, Deck, Card, DiceObject, Counter, TokenShape, GridType, CardShape, CardOrientation, PanelType, Board, Randomizer, WindowType, PanelObject, CardPile, TokenType, Drawing, BattlefieldCell } from '../types';
import { Dices, MessageSquare, User, Check, ChevronDown, ChevronRight, Plus, LayoutGrid, CircleDot, Square, Component, Box, Lock, Unlock, Trash2, Library, Save, Upload, Link as LinkIcon, CheckCircle, Hand, Eye, EyeOff, Layers, CreditCard, Asterisk, PanelLeft, Settings, Pencil, Pen, Eraser, Ruler, MousePointer2, Brush, FileText, Rows } from 'lucide-react';
import { TOKEN_SIZE, CARD_SHAPE_DIMS, DEFAULT_DECK_WIDTH, DEFAULT_DECK_HEIGHT, DEFAULT_DICE_SIZE, DEFAULT_COUNTER_WIDTH, DEFAULT_COUNTER_HEIGHT, DEFAULT_PANEL_WIDTH, DEFAULT_PANEL_HEIGHT, MAIN_MENU_WIDTH } from '../constants';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { ObjectSettingsModal } from './ObjectSettingsModal';
import { HandPanel } from './HandPanel';
import { PlayerNameModal } from './PlayerNameModal';
import { generateUUID } from '../utils/uuid';
import { useDrawingTool } from './ToolsPanel';
import { SvgTokenShape } from './SvgTokenShape';

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
    default:
      return <Component size={10} />;
  }
};

interface MainMenuContentProps {
  width: number;
}

export const MainMenuContent: React.FC<MainMenuContentProps> = ({ width }) => {
  const { state, dispatch, peerId } = useGame();
  const lang: AppLanguage = state.language || 'en';

  // Translation helper
  const t = (key: { en: string; ru: string }): string => key[lang] || key.en;

  const [activeTab, setActiveTab] = useState<'create' | 'hand' | 'chat' | 'players' | 'tools'>('create');
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{ sender: string; text: string }[]>([]);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
  const [searchModalDeck, setSearchModalDeck] = useState<Deck | null>(null);
  const [searchModalPile, setSearchModalPile] = useState<CardPile | undefined>(undefined);
  const [topDeckModalDeck, setTopDeckModalDeck] = useState<Deck | null>(null);
  const [pilesButtonMenu, setPilesButtonMenu] = useState<{ deck: Deck; x: number; y: number } | null>(null);
  const [dragOverHand, setDragOverHand] = useState(false);
  const [previousTab, setPreviousTab] = useState<'create' | 'hand' | 'chat' | 'players' | 'tools'>('create');
  const [renamePlayerId, setRenamePlayerId] = useState<string | null>(null);
  const [settingsObject, setSettingsObject] = useState<TableObject | null>(null);
  const [selectedTool, setSelectedTool] = useState<'none' | 'marker' | 'eraser' | 'compass'>('none');
  // Drawing settings (shared via events with drawing components)
  const [markerColor, setMarkerColor] = useState('#ff0000');
  const [markerThickness, setMarkerThickness] = useState(10);
  const [markerOpacity, setMarkerOpacity] = useState(100);
  const mainMenuRef = useRef<HTMLDivElement>(null);
  const currentDrawingTool = useDrawingTool();

  // Hand card scale state with localStorage persistence
  const { scale: handCardScale, setHandCardScale } = useHandCardScale();

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

  // Sync marker settings with drawing components via events
  useEffect(() => {
    const handleMarkerSettingsRequest = () => {
      window.dispatchEvent(new CustomEvent('marker-settings-sync', {
        detail: { color: markerColor, thickness: markerThickness, opacity: markerOpacity }
      }));
    };

    window.addEventListener('marker-settings-request', handleMarkerSettingsRequest);
    return () => window.removeEventListener('marker-settings-request', handleMarkerSettingsRequest);
  }, [markerColor, markerThickness, markerOpacity]);

  // Sync drawing tool state with drawing components
  useEffect(() => {
    const handleToolRequest = () => {
      window.dispatchEvent(new CustomEvent('drawing-tool-sync', {
        detail: { tool: selectedTool }
      }));
    };

    window.addEventListener('drawing-tool-request', handleToolRequest);
    return () => window.removeEventListener('drawing-tool-request', handleToolRequest);
  }, [selectedTool]);

  // Update marker settings and notify drawing components
  const updateMarkerColor = (color: string) => {
    setMarkerColor(color);
    window.dispatchEvent(new CustomEvent('marker-settings-changed', {
      detail: { color, thickness: markerThickness, opacity: markerOpacity }
    }));
  };

  const updateMarkerThickness = (thickness: number) => {
    setMarkerThickness(thickness);
    window.dispatchEvent(new CustomEvent('marker-settings-changed', {
      detail: { color: markerColor, thickness, opacity: markerOpacity }
    }));
  };

  const updateMarkerOpacity = (opacity: number) => {
    setMarkerOpacity(opacity);
    window.dispatchEvent(new CustomEvent('marker-settings-changed', {
      detail: { color: markerColor, thickness: markerThickness, opacity }
    }));
  };

  const isGM = state.players.find(p => p.id === state.activePlayerId)?.isGM ?? false;

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
            title: 'Hand Panel Settings'
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
      }>;

      const { x, y, hasCards } = customEvent.detail;

      if (!hasCards) {
        setDragOverHand(false);
        return;
      }

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

      // Dispatch event for HandPanel to show purple ring
      window.dispatchEvent(new CustomEvent('cursor-slot-move', {
        detail: { x, y, isOverMainMenu, hasCards }
      }));

      // Only switch to hand tab if cursor is over main menu AND slot has cards
      if (isOverMainMenu && hasCards) {
        if (activeTab !== 'hand') {
          setPreviousTab(activeTab);
          setActiveTab('hand');
        }
        // Also unminimize main menu if it's minimized
        if (mainMenuPanel?.minimized) {
          dispatch({
            type: 'UPDATE_OBJECT',
            payload: { id: mainMenuPanel.id, minimized: false }
          });
        }
        setDragOverHand(true);
      } else {
        setDragOverHand(false);
      }
    };

    const handleCursorSlotDrop = () => {
      setDragOverHand(false);
    };

    window.addEventListener('cursor-position-update', handleCursorPositionUpdate);
    window.addEventListener('cursor-slot-drop-to-hand', handleCursorSlotDrop);

    return () => {
      window.removeEventListener('cursor-position-update', handleCursorPositionUpdate);
      window.removeEventListener('cursor-slot-drop-to-hand', handleCursorSlotDrop);
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
        width: MAIN_MENU_WIDTH,
        height: 400,
        title: panelType === PanelType.HAND ? 'Standard Hand Panel' : panelType,
      }
    });
  };

  const handleInvite = useCallback(() => {
    if (!peerId) {
      alert("PeerJS is not ready yet. Please wait a moment and try again.");
      return;
    }

    const baseUrl = window.location.href.split('?')[0];
    const inviteLink = `${baseUrl}?hostId=${peerId}`;

    navigator.clipboard.writeText(inviteLink).then(() => {
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    });
  }, [peerId]);

  const handleSaveGame = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `nexustable_save_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLoadGame = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        if (!e.target?.result) {
          alert("Error reading file.");
          return;
        }

        const json = JSON.parse(e.target.result as string);

        // Validate save file structure
        if (!json.objects || typeof json.objects !== 'object') {
          alert("Invalid save file: missing or invalid 'objects' field.");
          return;
        }
        if (!json.players || !Array.isArray(json.players)) {
          alert("Invalid save file: missing or invalid 'players' field.");
          return;
        }

        // Count objects by type for validation summary
        const objectCount = Object.keys(json.objects).length;
        const playerCount = json.players.length;

        // Dispatch load action
        dispatch({ type: 'LOAD_GAME', payload: json as GameState });

        // Success message with summary
        logger.log(`Game loaded successfully: ${objectCount} objects, ${playerCount} players`);

        // Reset file input to allow loading the same file again if needed
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } catch (err) {
        logger.error('Error loading save file:', err);
        alert("Error loading save file. Make sure it's a valid JSON file saved from Nexus Game Table.");
      }
    };
    reader.readAsText(file);
  };

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput;
    setChatHistory(prev => [...prev, { sender: 'You', text: userMsg }]);
    setChatInput('');
  };

  // Create categories with proper order and labels
  const categories = [
    {
      id: 'boards', label: t({ en: 'Game Boards', ru: 'Игровые доски' }), icon: <LayoutGrid size={16}/>,
      items: [
        { name: t({ en: 'Standard Board', ru: 'Стандартная доска' }), type: 'BOARD', gridType: GridType.SQUARE },
        { name: t({ en: 'Cell', ru: 'Ячейка' }), type: 'BATTLEFIELD_CELL' },
      ],
      matcher: (obj: TableObject) => obj.type === ItemType.BOARD || obj.type === ItemType.BATTLEFIELD_CELL
    },
    {
      id: 'decks', label: t({ en: 'Decks', ru: 'Колоды' }), icon: <Library size={16}/>,
      items: [
        { name: t({ en: 'Standard Deck', ru: 'Стандартная колода' }), type: 'DECK' },
        { name: t({ en: 'Hex Deck', ru: 'Гекс-колода' }), type: 'HEX_DECK' },
      ],
      matcher: (obj: TableObject) => obj.type === ItemType.DECK
    },
    {
      id: 'tokens', label: t({ en: 'Tokens', ru: 'Токены' }), icon: <CircleDot size={16}/>,
      items: [
        { name: t({ en: 'Standard Token', ru: 'Стандартный токен' }), type: 'TOKEN', shape: TokenShape.CIRCLE },
        { name: t({ en: 'Token Type', ru: 'Тип токена' }), type: 'TOKEN_TYPE' },
      ],
      matcher: (obj: TableObject) => obj.type === ItemType.TOKEN || obj.type === ItemType.TOKEN_TYPE
    },
    {
      id: 'randomizers', label: t({ en: 'Randomizers & Dice', ru: 'Рандомайзеры и кости' }), icon: <Dices size={16}/>,
      items: [
        { name: t({ en: 'Standard Dice', ru: 'Стандартные кости' }), type: 'DICE' },
      ],
      matcher: (obj: TableObject) => obj.type === ItemType.DICE_OBJECT || obj.type === ItemType.RANDOMIZER
    },
    {
      id: 'counters', label: t({ en: 'Counters', ru: 'Счётчики' }), icon: <Box size={16}/>,
      items: [
        { name: t({ en: 'Life Counter', ru: 'Счётчик жизней' }), type: 'COUNTER' },
        { name: t({ en: 'Score Tracker', ru: 'Трекер очков' }), type: 'COUNTER' },
      ],
      matcher: (obj: TableObject) => obj.type === ItemType.COUNTER
    },
    {
      id: 'panels', label: t({ en: 'Panels', ru: 'Панели' }), icon: <Layers size={16}/>,
      items: [
        { name: t({ en: 'Hand Panel', ru: 'Панель руки' }), type: 'PANEL', panelType: PanelType.HAND },
        { name: t({ en: 'Tableau Panel', ru: 'Панель таблицы' }), type: 'PANEL', panelType: PanelType.TABLEAU, disabled: true },
        { name: t({ en: 'Pull Panel', ru: 'Pull панель' }), type: 'PANEL', panelType: PanelType.PULL, disabled: true },
      ],
      matcher: (obj: TableObject) => obj.type === ItemType.PANEL && (obj as any).panelType !== PanelType.MAIN_MENU
    },
    {
      id: 'drawings', label: t({ en: 'Drawings', ru: 'Рисунки' }), icon: <Brush size={16}/>,
      items: [], // Drawings are created with marker tool, not via menu
      matcher: (obj: TableObject) => obj.type === ItemType.DRAWING
    },
    {
      id: 'pages', label: t({ en: 'Pages', ru: 'Страницы' }), icon: <FileText size={16}/>,
      items: [
        { name: t({ en: 'Page', ru: 'Страница' }), type: 'PAGE', disabled: true },
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
              <Pen size={20} />
            </button>
            <button onClick={() => { setActiveTab('chat'); }} className={`flex-1 p-3 flex justify-center ${activeTab === 'chat' ? 'bg-slate-800 text-white border-b-2 border-purple-500' : 'text-gray-500 hover:bg-slate-800'}`}>
              <MessageSquare size={20} />
            </button>
            <button onClick={() => { setActiveTab('players'); }} className={`flex-1 p-3 flex justify-center ${activeTab === 'players' ? 'bg-slate-800 text-white border-b-2 border-purple-500' : 'text-gray-500 hover:bg-slate-800'}`}>
              <User size={20} />
            </button>
          </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar relative select-none">
        {activeTab === 'create' && (
          <div className="p-2">
            {categories.map(category => (
              <CategorySection
                key={category.id}
                category={category}
                state={state}
                dispatch={dispatch}
                deleteCandidateId={deleteCandidateId}
                setDeleteCandidateId={setDeleteCandidateId}
                isGM={isGM}
                canCreateObjects={isGM || state.playerPermissions.createObjects}
                canConfigureObjects={isGM || state.playerPermissions.configureObjects}
                canDeleteObjects={isGM || state.playerPermissions.deleteObjects}
                canHideObjects={isGM || state.playerPermissions.hideObjects}
                language={state.language}
              />
            ))}
          </div>
        )}

        {activeTab === 'hand' && (
          <div className="h-full flex flex-col">
            {/* Hand Panel */}
            <div className="flex-1 overflow-hidden">
              <HandPanel width={width} isDragTarget={dragOverHand} cardScale={handCardScale} language={lang} />
            </div>
          </div>
        )}

        {activeTab === 'tools' && (
          <div className="p-3 space-y-3">
            {/* Drawing Tools Section */}
            <div>
              <h4 className="text-xs font-bold text-gray-400 mb-2 uppercase">{t({ en: 'Drawing Tools', ru: 'Инструменты рисования' })}</h4>
              <div className="grid grid-cols-4 gap-2">
                <DrawingToolButton tool="none" icon={<MousePointer2 size={20} />} label={t({ en: 'Cursor', ru: 'Курсор' })} selectedTool={selectedTool} setSelectedTool={setSelectedTool} />
                <DrawingToolButton tool="marker" icon={<Pen size={20} />} label={t({ en: 'Marker', ru: 'Маркер' })} selectedTool={selectedTool} setSelectedTool={setSelectedTool} />
                <DrawingToolButton tool="eraser" icon={<Eraser size={20} />} label={t({ en: 'Eraser', ru: 'Ластик' })} selectedTool={selectedTool} setSelectedTool={setSelectedTool} />
                <DrawingToolButton tool="compass" icon={<Ruler size={20} />} label={t({ en: 'Ruler', ru: 'Линейка' })} selectedTool={selectedTool} setSelectedTool={setSelectedTool} />
              </div>
            </div>

            {/* Marker Settings (shown when marker or eraser is selected) */}
            {(selectedTool === 'marker' || selectedTool === 'eraser') && (
              <div className="p-3 bg-slate-800 rounded-lg space-y-3">
                <h4 className="text-xs font-bold text-gray-400 uppercase">
                  {selectedTool === 'marker' ? t({ en: 'Marker Settings', ru: 'Настройки маркера' }) : t({ en: 'Eraser Settings', ru: 'Настройки ластика' })}
                </h4>

                {/* Color picker */}
                {selectedTool === 'marker' && (
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-2">{t({ en: 'Color', ru: 'Цвет' })}</label>
                    <div className="grid grid-cols-8 gap-1">
                      {[
                        // Basic colors (first row)
                        '#ff0000', '#ff8000', '#ffff00', '#80ff00',
                        '#00ff00', '#00ff80', '#00ffff', '#0080ff',
                        '#0000ff', '#8000ff', '#ff00ff', '#ff0080',
                        // Light/Dark variants
                        '#ffffff', '#c0c0c0', '#808080', '#404040',
                        '#000000', '#800000', '#008000', '#000080',
                        '#808000', '#008080', '#800080', '#ff8080',
                      ].map((color) => (
                        <button
                          key={color}
                          onClick={() => updateMarkerColor(color)}
                          className={`w-6 h-6 rounded border transition-all ${
                            markerColor === color ? 'border-white scale-110' : 'border-slate-600 hover:border-slate-400'
                          }`}
                          style={{ backgroundColor: color }}
                          title={color}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Thickness slider */}
                <div>
                  <label className="block text-[10px] text-gray-400 mb-2">
                    {t({ en: 'Size', ru: 'Размер' })}: {markerThickness}px
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={markerThickness}
                    onChange={(e) => updateMarkerThickness(Number(e.target.value))}
                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                  />
                  <div className="flex justify-between text-[9px] text-gray-600 mt-1">
                    <span>1px</span>
                    <span>50px</span>
                    <span>100px</span>
                  </div>
                </div>

                {/* Opacity slider - only for marker, not eraser */}
                {currentDrawingTool === 'marker' && (
                <div>
                  <label className="block text-[10px] text-gray-400 mb-2">
                    {t({ en: 'Opacity', ru: 'Прозрачность' })}: {markerOpacity}%
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={markerOpacity}
                    onChange={(e) => updateMarkerOpacity(Number(e.target.value))}
                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                  />
                  <div className="flex justify-between text-[9px] text-gray-600 mt-1">
                    <span>1%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                </div>
                )}
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
                    return (
                      <TokenTypeCard
                        key={archetype.id}
                        archetype={archetype}
                        copyCount={copyCount}
                        onSettings={() => dispatch({
                          type: 'CREATE_WINDOW',
                          payload: {
                            windowType: WindowType.OBJECT_SETTINGS,
                            title: 'Settings: ' + archetype.name,
                            targetObjectId: archetype.id
                          }
                        })}
                      />
                    );
                  })}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'players' && (
          <div className="p-4 space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">{t({ en: 'Session Tools', ru: 'Инструменты сессии' })}</h3>
              {/* Session ID Display */}
              <div className="mb-2 p-2 bg-slate-800 rounded border border-slate-700">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider">{t({ en: 'Session ID', ru: 'ID сессии' })}</div>
                <div className="text-sm text-gray-300 font-mono break-all">{state.sessionId || 'Generating...'}</div>
              </div>
              <div className="grid grid-cols-1 gap-2">
                <button
                  onClick={handleInvite}
                  className={`w-full py-2 px-3 rounded flex items-center justify-center gap-2 font-bold transition-all ${inviteCopied ? 'bg-green-600 text-white' : 'bg-purple-600 hover:bg-purple-500 text-white'}`}
                >
                  {inviteCopied ? <CheckCircle size={16}/> : <LinkIcon size={16}/>}
                  {inviteCopied ? t({ en: 'Link Copied!', ru: 'Ссылка скопирована!' }) : t({ en: 'Invite Player', ru: 'Пригласить игрока' })}
                </button>
                <button
                  onClick={handleSaveGame}
                  className="w-full py-2 px-3 rounded flex items-center justify-center gap-2 font-bold bg-slate-700 hover:bg-slate-600 text-white transition-all"
                >
                  <Save size={16} />
                  {t({ en: 'Save Session', ru: 'Сохранить сессию' })}
                </button>
                {isGM && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-2 px-3 rounded flex items-center justify-center gap-2 font-bold bg-slate-700 hover:bg-slate-600 text-white transition-all"
                  >
                    <Upload size={16} />
                    {t({ en: 'Load Session', ru: 'Загрузить сессию' })}
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleLoadGame}
                  className="hidden"
                />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">{t({ en: 'Active Players', ru: 'Активные игроки' })}</h3>
              {state.players
                .map(p => {
                  const isCurrentPlayer = p.id === state.activePlayerId;
                  const isGMPlayer = p.id === 'gm-player';
                  const isGameMaster = p.id === 'gm';
                  const isGMView = state.activePlayerId === 'gm';

                  // Check if current user is the host (can switch between GM and GM Player modes)
                  const isHostUser = state.activePlayerId === 'gm' || state.activePlayerId === 'gm-player';

                  // Determine which buttons to show
                  let showSwitchButton = false;
                  let showRenameButton = false;

                  if (isHostUser) {
                    // Host can switch between GM and GM Player modes
                    if (isGameMaster || isGMPlayer) {
                      showSwitchButton = true;
                    } else {
                      // Other players - Host can rename them
                      showRenameButton = true;
                    }
                  } else {
                    // Non-host players can only rename themselves
                    if (isCurrentPlayer) {
                      showRenameButton = true;
                    }
                  }

                  return (
                    <div key={p.id} className={`flex items-center gap-3 p-2 rounded ${isCurrentPlayer ? 'bg-purple-900/30 border border-purple-700/50' : 'bg-slate-800'}`}>
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{backgroundColor: p.color}} />
                      <span className="font-medium text-white truncate">{p.name}</span>
                      {p.isGM && <span className="text-xs bg-yellow-600 px-1 rounded text-white">GM</span>}
                      {isCurrentPlayer && <span className="text-xs bg-slate-600 px-1 rounded text-gray-300">{t({ en: 'You', ru: 'Вы' })}</span>}

                      {/* GM Mode Switch Button - shown for both Game Master and GM Player when current user is host */}
                      {showSwitchButton && (
                        <button
                          onClick={() => {
                            if (isGMView) {
                              // Switch to GM Player mode
                              dispatch({ type: 'SET_ACTIVE_ID', payload: 'gm-player' });
                            } else {
                              // Switch back to GM mode
                              dispatch({ type: 'SET_ACTIVE_ID', payload: 'gm' });
                            }
                          }}
                          className="ml-auto p-1 bg-purple-600/20 hover:bg-purple-600/40 rounded text-purple-400 hover:text-purple-300 transition-colors"
                          title={isGMView ? t({ en: "Switch to Player Mode", ru: "Переключиться в режим игрока" }) : t({ en: "Switch to GM Mode", ru: "Переключиться в режим ГМ" })}
                        >
                          <User size={14} />
                        </button>
                      )}

                      {/* Rename button - not shown when switch button is visible */}
                      {showRenameButton && (
                        <button
                          onClick={() => setRenamePlayerId(p.id)}
                          className="ml-auto p-1 hover:bg-slate-700 rounded text-gray-400 hover:text-white transition-colors"
                          title={t({ en: "Edit name", ru: "Изменить имя" })}
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        )}
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
          defaultName={state.players.find(p => p.id === renamePlayerId)?.name || 'Player'}
          title={renamePlayerId === state.activePlayerId ? 'Edit Your Name' : 'Edit Player Name'}
        />
      )}

      {/* Card/Object Settings Modal */}
      {settingsObject && (
        <ObjectSettingsModal
          object={settingsObject}
          onClose={() => setSettingsObject(null)}
          onSave={(updatedObj) => {
            dispatch({ type: 'UPDATE_OBJECT', payload: updatedObj });
            setSettingsObject(null);
          }}
        />
      )}
    </div>
  );
};

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
  isGM: boolean;
  canCreateObjects: boolean;
  canConfigureObjects: boolean;
  canDeleteObjects: boolean;
  canHideObjects: boolean;
  language: AppLanguage;
}

const CategorySection: React.FC<CategorySectionProps> = ({
  category,
  state,
  dispatch,
  deleteCandidateId,
  setDeleteCandidateId,
  isGM,
  canCreateObjects,
  canConfigureObjects,
  canDeleteObjects,
  canHideObjects,
  language,
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
      // Keep standard tokens (without archetypeId) in the list even when in cursor slot
      ((obj.type === ItemType.TOKEN && !(obj as any).archetypeId) || !(obj as any).inCursorSlot) &&
      !(obj as any).archetypeId  // Exclude token copies (tokens created from archetypes)
    ),
    [state.objects, category.matcher]
  );

  const handleCreateItem = (item: typeof category.items[number]) => {
    // Screen coordinates (center of viewport)
    const screenX = window.innerWidth / 2;
    const screenY = window.innerHeight / 2;

    // Convert screen coordinates to world coordinates
    // Objects are rendered inside transform container with: translate(offset.x, offset.y) scale(zoom)
    const zoom = state.viewTransform.zoom;
    const offsetX = state.viewTransform.offset.x;
    const offsetY = state.viewTransform.offset.y;

    const worldX = (screenX - offsetX) / zoom;
    const worldY = (screenY - offsetY) / zoom;

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
          cardAllowedActions: ['flip', 'rotate', 'rotateClockwise', 'rotateCounterClockwise', 'swingClockwise', 'swingCounterClockwise', 'layer', 'layerUp', 'layerDown', 'moveTo', 'moveToHand', 'moveToTopDeck', 'moveToBottomDeck', 'moveToDiscard'],
          cardAllowedActionsForGM: ['flip', 'rotate', 'rotateClockwise', 'rotateCounterClockwise', 'swingClockwise', 'swingCounterClockwise', 'layer', 'layerUp', 'layerDown', 'delete', 'clone', 'lock', 'pin', 'moveTo', 'moveToHand', 'moveToTopDeck', 'moveToBottomDeck', 'moveToDiscard'],
          cardActionButtons: ['moveToHand', 'swingClockwise', 'flip'],
          cardSingleClickAction: undefined,
          cardDoubleClickAction: undefined,
          cardNamePosition: 'none' as const,
          // Deck actions (for the deck itself, not cards)
          actionButtons: ['draw', 'millTopCard', 'toBottom', 'shuffleDeck'],
          allowedActions: ['draw', 'playTopCard', 'millTopCard', 'toBottom', 'showTop', 'topDeck', 'searchDeck', 'shuffleDeck', 'piles', 'returnAll', 'rotateClockwise', 'rotateCounterClockwise', 'swingClockwise', 'swingCounterClockwise'],
          allowedActionsForGM: ['draw', 'playTopCard', 'millTopCard', 'toBottom', 'showTop', 'topDeck', 'searchDeck', 'shuffleDeck', 'piles', 'returnAll', 'rotateClockwise', 'rotateCounterClockwise', 'swingClockwise', 'swingCounterClockwise'],
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
          cardAllowedActions: ['flip', 'rotate', 'rotateClockwise', 'rotateCounterClockwise', 'swingClockwise', 'swingCounterClockwise', 'layer', 'layerUp', 'layerDown', 'moveTo', 'moveToHand', 'moveToTopDeck', 'moveToBottomDeck', 'moveToDiscard'],
          cardAllowedActionsForGM: ['flip', 'rotate', 'rotateClockwise', 'rotateCounterClockwise', 'swingClockwise', 'swingCounterClockwise', 'layer', 'layerUp', 'layerDown', 'delete', 'clone', 'lock', 'pin', 'moveTo', 'moveToHand', 'moveToTopDeck', 'moveToBottomDeck', 'moveToDiscard'],
          cardActionButtons: ['moveToHand', 'swingClockwise', 'flip'],
          cardSingleClickAction: undefined,
          cardDoubleClickAction: undefined,
          cardNamePosition: 'none' as const,
          // Deck actions (for the deck itself, not cards)
          actionButtons: ['draw', 'millTopCard', 'toBottom', 'shuffleDeck'],
          allowedActions: ['draw', 'playTopCard', 'millTopCard', 'toBottom', 'showTop', 'topDeck', 'searchDeck', 'shuffleDeck', 'piles', 'returnAll', 'rotateClockwise', 'rotateCounterClockwise', 'swingClockwise', 'swingCounterClockwise'],
          allowedActionsForGM: ['draw', 'playTopCard', 'millTopCard', 'toBottom', 'showTop', 'topDeck', 'searchDeck', 'shuffleDeck', 'piles', 'returnAll', 'rotateClockwise', 'rotateCounterClockwise', 'swingClockwise', 'swingCounterClockwise'],
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
        const tokenType: TokenType = {
          id: generateUUID(),
          type: ItemType.TOKEN_TYPE,
          name: item.name,
          x: 0,
          y: 0,
          width: TOKEN_SIZE,
          height: TOKEN_SIZE,
          rotation: 0,
          color: '#3498db',
          isOnTable: false,
          locked: false,
          shape: TokenShape.SQUARE,
          content: '',
          // Token type specific properties
          defaultSize: { width: TOKEN_SIZE, height: TOKEN_SIZE },
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
          value: isLifeCounter ? 20 : 0,
          baseValue: isLifeCounter ? 20 : 0,
          maxValue: isLifeCounter ? undefined : 30,
          allowNegative: !isLifeCounter,
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
          snapToGrid: true,
        };
        dispatch({ type: 'ADD_OBJECT', payload: board });
        break;
      }
      case 'BATTLEFIELD_CELL': {
        const cell: BattlefieldCell = {
          id: generateUUID(),
          type: ItemType.BATTLEFIELD_CELL,
          shape: TokenShape.SQUARE, // Default shape, can be changed in settings
          x: screenX - 50,
          y: screenY - 50,
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
          zIndex: 0, // Cells at bottom layer by default
        };
        dispatch({ type: 'ADD_OBJECT', payload: cell });
        break;
      }
      case 'PANEL': {
        dispatch({
          type: 'CREATE_PANEL',
          payload: {
            panelType: item.panelType!,
            x: screenX - 150,
            y: screenY - 200,
            width: MAIN_MENU_WIDTH,
            height: 400,
            title: item.name,
          }
        });
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
                className={`w-full flex items-center gap-2 py-1 px-2 rounded text-sm transition-colors ${
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
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">On Table</div>
              {objectsOnTable.map(obj => {
                const isLocked = obj.locked || false;
                // For UI objects check 'visible', for game objects check 'isOnTable'
                const isVisible = 'visible' in obj ? obj.visible !== false : (obj as any).isOnTable !== false;
                // Get color - panels don't have color property
                let objColor = 'color' in obj ? obj.color : '#6366f1';
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
                    return copyCount > 0 ? `${baseName} (${copyCount})` : baseName;
                  }
                  return baseName;
                };
                return (
                  <div
                    key={obj.id}
                    className={`flex items-center gap-1 py-1 px-2 rounded text-sm group ${isVisible ? 'text-gray-300 hover:bg-slate-800' : 'text-gray-600 hover:bg-slate-800/50'}`}
                  >
                    <span className="text-gray-500 flex-shrink-0">{getTypeIcon(obj)}</span>
                    <div
                      className="w-3 h-3 rounded flex-shrink-0"
                      style={{ backgroundColor: obj.type === ItemType.TOKEN_TYPE ? objColor : (isVisible ? objColor : '#4a5568') }}
                    />
                    <span className="flex-1 truncate text-xs">{getDisplayName()}</span>
                    {canHideObjects && (
                      <button
                        onClick={() => dispatch({ type: 'UPDATE_OBJECT', payload: { id: obj.id, locked: !isLocked } })}
                        className={`p-1 rounded ${isLocked ? 'text-red-400 hover:text-white' : 'hover:bg-slate-700'} opacity-0 group-hover:opacity-100`}
                        title={isLocked ? 'Unlock' : 'Lock'}
                      >
                        {isLocked ? <Lock size={10} /> : <Unlock size={10} />}
                      </button>
                    )}
                    {canHideObjects && (
                      <button
                        onClick={() => dispatch({ type: 'UPDATE_OBJECT', payload: { id: obj.id, ['visible' in obj ? 'visible' : 'isOnTable']: !isVisible } })}
                        className="p-1 hover:bg-slate-700 rounded opacity-0 group-hover:opacity-100"
                        title={isVisible ? 'Hide' : 'Show'}
                      >
                        {isVisible ? <Eye size={10} /> : <EyeOff size={10} />}
                      </button>
                    )}
                    {canConfigureObjects && (
                      <button
                        onClick={() => dispatch({
                          type: 'CREATE_WINDOW',
                          payload: {
                            windowType: WindowType.OBJECT_SETTINGS,
                            targetObjectId: obj.id,
                            title: 'Settings'
                          }
                        })}
                        className="p-1 hover:bg-slate-700 rounded opacity-0 group-hover:opacity-100"
                        title="Settings"
                      >
                        <Settings size={10} />
                      </button>
                    )}
                    {canDeleteObjects && (
                      <button
                        onClick={() => {
                          // Token copies (tokens with archetypeId) are deleted immediately without confirmation
                          if (obj.type === ItemType.TOKEN && (obj as any).archetypeId) {
                            dispatch({ type: 'DELETE_OBJECT', payload: { id: obj.id } });
                          } else {
                            setDeleteCandidateId(obj.id);
                          }
                        }}
                        className="p-1 hover:bg-red-600 rounded text-red-400 hover:text-white opacity-0 group-hover:opacity-100"
                        title="Delete"
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

// Drawing tool types
type DrawingTool = 'none' | 'marker' | 'eraser' | 'compass';

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
    window.dispatchEvent(new CustomEvent('drawing-tool-changed', { detail: { tool } }));
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
  onSettings: () => void;
}

const TokenTypeCard: React.FC<TokenTypeCardProps> = ({ archetype, copyCount, onSettings }) => {
  // Track drag state to distinguish click from drag
  const dragStartTimeRef = useRef<number>(0);
  const dragStartPositionRef = useRef<{ x: number; y: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Handle archetype click - add to cursor slot
  const handleArchetypeClick = (clientX: number, clientY: number) => {
    window.dispatchEvent(new CustomEvent('add-token-to-cursor-slot', {
      detail: { archetypeId: archetype.id, clientX, clientY }
    }));
  };

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
  }, [handleArchetypeClick]);

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
      title={`${archetype.name}\nClick to add to cursor slot`}
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
        {archetype.name} {copyCount > 0 && `(${copyCount})`}
      </div>
    </div>
  );
};
