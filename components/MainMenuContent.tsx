import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useHandCardScale } from '../hooks/useHandCardScale';
import { createPortal } from 'react-dom';
import { useGame, GameState } from '../store/GameContext';
import { ItemType, TableObject, Token, CardLocation, Deck, Card, DiceObject, Counter, TokenShape, GridType, CardShape, CardOrientation, PanelType, Board, Randomizer, WindowType, PanelObject, CardPile } from '../types';
import { Dices, MessageSquare, User, Check, ChevronDown, ChevronRight, Plus, LayoutGrid, CircleDot, Square, Hexagon, Component, Box, Lock, Unlock, Trash2, Library, Save, Upload, Link as LinkIcon, CheckCircle, Signal, Hand, Eye, EyeOff, Layers, Maximize2, CreditCard, Rows, Asterisk, PanelLeft, Minus, Settings } from 'lucide-react';
import { TOKEN_SIZE, CARD_SHAPE_DIMS, DEFAULT_DECK_WIDTH, DEFAULT_DECK_HEIGHT, DEFAULT_DICE_SIZE, DEFAULT_COUNTER_WIDTH, DEFAULT_COUNTER_HEIGHT, DEFAULT_PANEL_WIDTH, DEFAULT_PANEL_HEIGHT, MAIN_MENU_WIDTH } from '../constants';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { ObjectSettingsModal } from './ObjectSettingsModal';
import { PanelSettingsModal } from './PanelSettingsModal';
import { HandPanel } from './HandPanel';
import { cardDragAPI } from '../hooks/useCardDrag';

// Helper for safe ID generation
const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try {
      return crypto.randomUUID();
    } catch (e) {}
  }
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

// Get icon component for object type
const getTypeIcon = (obj: TableObject): React.ReactElement => {
  switch (obj.type) {
    case ItemType.TOKEN:
      const token = obj as Token;
      if (token.shape === TokenShape.CIRCLE) return <CircleDot size={10} />;
      if (token.shape === TokenShape.HEX) return <Hexagon size={10} />;
      if (token.shape === TokenShape.STANDEE) return <User size={10} />;
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
    default:
      return <Component size={10} />;
  }
};

interface MainMenuContentProps {
  width: number;
}

export const MainMenuContent: React.FC<MainMenuContentProps> = ({ width }) => {
  const { state, dispatch } = useGame();
  const [activeTab, setActiveTab] = useState<'create' | 'hand' | 'chat' | 'players'>('create');
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{ sender: string; text: string }[]>([]);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
  const [searchModalDeck, setSearchModalDeck] = useState<Deck | null>(null);
  const [searchModalPile, setSearchModalPile] = useState<CardPile | undefined>(undefined);
  const [topDeckModalDeck, setTopDeckModalDeck] = useState<Deck | null>(null);
  const [pilesButtonMenu, setPilesButtonMenu] = useState<{ deck: Deck; x: number; y: number } | null>(null);
  const [dragOverHand, setDragOverHand] = useState(false);
  const [previousTab, setPreviousTab] = useState<'create' | 'hand' | 'chat' | 'players'>('create');
  const [settingsObjectId, setSettingsObjectId] = useState<string | null>(null);
  const mainMenuRef = useRef<HTMLDivElement>(null);

  // Hand card scale state with localStorage persistence
  const { scale: handCardScale, setHandCardScale } = useHandCardScale();

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
        setSettingsObjectId(panelId);
        // Switch to create tab to show the settings modal
        setActiveTab('create');
      }
    };

    window.addEventListener('open-hand-panel-settings', handleOpenHandPanelSettings);
    return () => window.removeEventListener('open-hand-panel-settings', handleOpenHandPanelSettings);
  }, [state.objects]);

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
    const link = window.location.href;
    navigator.clipboard.writeText(link).then(() => {
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    });
  }, []);

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
        if (e.target?.result) {
          const json = JSON.parse(e.target.result as string);
          if (json.objects && json.players) {
            dispatch({ type: 'LOAD_GAME', payload: json as GameState });
          } else {
            alert("Invalid save file format.");
          }
        }
      } catch (err) {
        alert("Error loading save file.");
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
      id: 'boards', label: 'Game Boards', icon: <LayoutGrid size={16}/>,
      items: [
        { name: 'Standard Board', type: 'BOARD', gridType: GridType.SQUARE },
      ],
      matcher: (obj: TableObject) => obj.type === ItemType.BOARD
    },
    {
      id: 'decks', label: 'Decks', icon: <Library size={16}/>,
      items: [
        { name: 'Standard Deck', type: 'DECK' },
        { name: 'Empty Deck', type: 'EMPTY_DECK' },
      ],
      matcher: (obj: TableObject) => obj.type === ItemType.DECK
    },
    {
      id: 'tokens', label: 'Tokens', icon: <CircleDot size={16}/>,
      items: [
        { name: 'Round Token', type: 'TOKEN', shape: TokenShape.CIRCLE },
      ],
      matcher: (obj: TableObject) => obj.type === ItemType.TOKEN && (obj as Token).shape === TokenShape.CIRCLE
    },
    {
      id: 'badges', label: 'Badges / Tiles', icon: <Square size={16}/>,
      items: [
        { name: 'Square Tile', type: 'TOKEN', shape: TokenShape.SQUARE },
        { name: 'Hex Tile', type: 'TOKEN', shape: TokenShape.HEX },
      ],
      matcher: (obj: TableObject) => obj.type === ItemType.TOKEN && ((obj as Token).shape === TokenShape.SQUARE || (obj as Token).shape === TokenShape.HEX)
    },
    {
      id: 'figurines', label: 'Figurines', icon: <User size={16}/>,
      items: [
        { name: 'Character Standee', type: 'TOKEN', shape: TokenShape.STANDEE },
      ],
      matcher: (obj: TableObject) => obj.type === ItemType.TOKEN && (obj as Token).shape === TokenShape.STANDEE
    },
    {
      id: 'randomizers', label: 'Randomizers & Dice', icon: <Dices size={16}/>,
      items: [
        { name: 'd4', type: 'DICE', sides: 4 },
        { name: 'd6', type: 'DICE', sides: 6 },
        { name: 'd8', type: 'DICE', sides: 8 },
        { name: 'd10', type: 'DICE', sides: 10 },
        { name: 'd12', type: 'DICE', sides: 12 },
        { name: 'd20', type: 'DICE', sides: 20 },
      ],
      matcher: (obj: TableObject) => obj.type === ItemType.DICE_OBJECT || obj.type === ItemType.RANDOMIZER
    },
    {
      id: 'counters', label: 'Counters', icon: <Box size={16}/>,
      items: [
        { name: 'Life Counter', type: 'COUNTER' },
        { name: 'Score Tracker', type: 'COUNTER' },
      ],
      matcher: (obj: TableObject) => obj.type === ItemType.COUNTER
    },
    {
      id: 'panels', label: 'Panels', icon: <Layers size={16}/>,
      items: [
        { name: 'Hand Panel', type: 'PANEL', panelType: PanelType.HAND },
        { name: 'Tableau Panel', type: 'PANEL', panelType: PanelType.TABLEAU },
        { name: 'Pull Panel', type: 'PANEL', panelType: PanelType.PULL },
      ],
      matcher: (obj: TableObject) => obj.type === ItemType.PANEL && (obj as any).panelType !== PanelType.MAIN_MENU
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
            <button onClick={() => { setActiveTab('chat'); }} className={`flex-1 p-3 flex justify-center ${activeTab === 'chat' ? 'bg-slate-800 text-white border-b-2 border-purple-500' : 'text-gray-500 hover:bg-slate-800'}`}>
              <MessageSquare size={20} />
            </button>
            <button onClick={() => { setActiveTab('players'); }} className={`flex-1 p-3 flex justify-center ${activeTab === 'players' ? 'bg-slate-800 text-white border-b-2 border-purple-500' : 'text-gray-500 hover:bg-slate-800'}`}>
              <User size={20} />
            </button>
          </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar relative">
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
                settingsObjectId={settingsObjectId}
                setSettingsObjectId={setSettingsObjectId}
              />
            ))}
          </div>
        )}

        {activeTab === 'hand' && (
          <div className="h-full flex flex-col">
            {/* Hand Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
              <h3 className="text-sm font-semibold text-white flex items-center gap-1">
                <Hand size={14} />
                Your Hand ({Object.values(state.objects).filter(o =>
                  o.type === ItemType.CARD && (o as Card).location === 'HAND' && (o as Card).ownerId === state.activePlayerId
                ).length})
              </h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    const newScale = Math.max(0.5, handCardScale - 0.03);
                    setHandCardScale(newScale);
                    localStorage.setItem('hand-card-scale', String(newScale));
                  }}
                  className="p-1 bg-slate-700 hover:bg-slate-600 rounded text-gray-300 hover:text-white transition-colors"
                  title="Decrease card size"
                >
                  <Minus size={12} />
                </button>
                <span className="text-xs text-gray-400 w-8 text-center">{Math.round(handCardScale * 100)}%</span>
                <button
                  onClick={() => {
                    const newScale = Math.min(2, handCardScale + 0.03);
                    setHandCardScale(newScale);
                    localStorage.setItem('hand-card-scale', String(newScale));
                  }}
                  className="p-1 bg-slate-700 hover:bg-slate-600 rounded text-gray-300 hover:text-white transition-colors"
                  title="Increase card size"
                >
                  <Plus size={12} />
                </button>
              </div>
            </div>
            {/* Hand Panel */}
            <div className="flex-1 overflow-hidden">
              <HandPanel width={width} isDragTarget={dragOverHand} cardScale={handCardScale} />
            </div>
          </div>
        )}

        {activeTab === 'players' && (
          <div className="p-4 space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Session Tools</h3>
              <div className="grid grid-cols-1 gap-2">
                <button
                  onClick={handleInvite}
                  className={`w-full py-2 px-3 rounded flex items-center justify-center gap-2 font-bold transition-all ${inviteCopied ? 'bg-green-600 text-white' : 'bg-purple-600 hover:bg-purple-500 text-white'}`}
                >
                  {inviteCopied ? <CheckCircle size={16}/> : <LinkIcon size={16}/>}
                  {inviteCopied ? 'Link Copied!' : 'Invite Player'}
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Active Players</h3>
              {state.players
                .map(p => (
                  <div key={p.id} className="flex items-center gap-3 p-2 bg-slate-800 rounded">
                    <div className="w-3 h-3 rounded-full" style={{backgroundColor: p.color}} />
                    <span className="font-medium text-white">{p.name}</span>
                    {p.isGM && <span className="text-xs bg-yellow-600 px-1 rounded ml-auto text-white">GM</span>}
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
        </>
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
    items: Array<{
      name: string;
      type: string;
      sides?: number;
      shape?: TokenShape;
      gridType?: GridType;
      panelType?: PanelType;
    }>;
    matcher: (obj: TableObject) => boolean;
  };
  state: GameState;
  dispatch: React.Dispatch<any>;
  deleteCandidateId: string | null;
  setDeleteCandidateId: (id: string | null) => void;
  settingsObjectId: string | null;
  setSettingsObjectId: (id: string | null) => void;
}

const CategorySection: React.FC<CategorySectionProps> = ({
  category,
  state,
  dispatch,
  deleteCandidateId,
  setDeleteCandidateId,
  settingsObjectId,
  setSettingsObjectId,
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

  // Count objects on table that match this category (all objects, including hidden)
  const objectsOnTable = useMemo(() =>
    Object.values(state.objects).filter(category.matcher),
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
        const deck: Deck = {
          id: generateUUID(),
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
          piles: [],
          // Deck-specific properties
          cardShape: CardShape.POKER,
          cardOrientation: CardOrientation.VERTICAL,
          cardWidth: DEFAULT_DECK_WIDTH,
          cardHeight: DEFAULT_DECK_HEIGHT,
          cardAllowedActions: ['flip', 'rotate', 'toHand', 'delete', 'clone', 'lock', 'layer'],
          cardAllowedActionsForGM: ['flip', 'rotate', 'toHand', 'delete', 'clone', 'lock', 'layer'],
          cardActionButtons: ['flip'],
          cardSingleClickAction: undefined,
          cardDoubleClickAction: undefined,
          cardNamePosition: 'none' as const,
        };
        dispatch({ type: 'ADD_OBJECT', payload: deck });
        break;
      }
      case 'EMPTY_DECK': {
        const deck: Deck = {
          id: generateUUID(),
          type: ItemType.DECK,
          name: 'Empty Deck',
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
          piles: [],
          cardShape: CardShape.POKER,
          cardOrientation: CardOrientation.VERTICAL,
          cardWidth: DEFAULT_DECK_WIDTH,
          cardHeight: DEFAULT_DECK_HEIGHT,
          cardAllowedActions: ['flip', 'rotate', 'toHand', 'delete', 'clone', 'lock', 'layer'],
          cardAllowedActionsForGM: ['flip', 'rotate', 'toHand', 'delete', 'clone', 'lock', 'layer'],
          cardActionButtons: ['flip'],
          cardSingleClickAction: undefined,
          cardDoubleClickAction: undefined,
          cardNamePosition: 'none' as const,
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
        };
        dispatch({ type: 'ADD_OBJECT', payload: token });
        break;
      }
      case 'DICE': {
        const dice: DiceObject = {
          id: generateUUID(),
          type: ItemType.DICE_OBJECT,
          name: item.name,
          x: worldX,
          y: worldY,
          width: DEFAULT_DICE_SIZE,
          height: DEFAULT_DICE_SIZE,
          rotation: 0,
          color: '#6366f1',
          content: '',
          isOnTable: true,
          locked: false,
          sides: item.sides || 6,
          currentValue: 1,
        };
        dispatch({ type: 'ADD_OBJECT', payload: dice });
        break;
      }
      case 'COUNTER': {
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
          value: 20,
        };
        dispatch({ type: 'ADD_OBJECT', payload: counter });
        break;
      }
      case 'BOARD': {
        const board: Board = {
          id: generateUUID(),
          type: ItemType.BOARD,
          name: item.name,
          x: worldX - 200,
          y: worldY - 200,
          width: 400,
          height: 400,
          rotation: 0,
          color: '#1a1a2e',
          content: '',
          isOnTable: true,
          locked: false,
          shape: TokenShape.RECTANGLE,
          gridType: item.gridType || GridType.SQUARE,
          gridSize: 50,
          snapToGrid: true,
        };
        dispatch({ type: 'ADD_OBJECT', payload: board });
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
        className="w-full flex items-center gap-2 text-gray-300 hover:text-white py-1 px-2 rounded hover:bg-slate-800 transition-colors"
      >
        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {category.icon}
        <span className="flex-1 text-left text-sm font-medium">{category.label}</span>
        <span className="text-xs text-gray-500">{objectsOnTable.length}</span>
      </button>

      {isExpanded && (
        <div className="mt-2 space-y-1 pl-4">
          {/* Create items */}
          {category.items.map((item, idx) => (
            <button
              key={idx}
              onClick={() => handleCreateItem(item)}
              className="w-full flex items-center gap-2 text-gray-400 hover:text-white hover:bg-slate-800 py-1 px-2 rounded text-sm transition-colors"
            >
              <Plus size={12} />
              <span>{item.name}</span>
            </button>
          ))}

          {/* Objects on table */}
          {objectsOnTable.length > 0 && (
            <div className="mt-2 pt-2 border-t border-slate-700">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">On Table</div>
              {objectsOnTable.map(obj => {
                const isLocked = obj.locked || false;
                // visible property only exists on some types
                const isVisible = 'visible' in obj ? obj.visible !== false : true;
                // Get color - panels don't have color property
                const objColor = 'color' in obj ? obj.color : '#6366f1';
                // Get name - handle different object types
                const getDisplayName = () => {
                  if (obj.type === ItemType.PANEL) return (obj as PanelObject).title;
                  if (obj.type === ItemType.WINDOW) return (obj as any).title || 'Window';
                  return 'name' in obj ? obj.name : 'Object';
                };
                return (
                  <div
                    key={obj.id}
                    className={`flex items-center gap-1 py-1 px-2 rounded text-sm group ${isVisible ? 'text-gray-300 hover:bg-slate-800' : 'text-gray-600 hover:bg-slate-800/50'}`}
                  >
                    <span className="text-gray-500 flex-shrink-0">{getTypeIcon(obj)}</span>
                    <div
                      className="w-3 h-3 rounded flex-shrink-0"
                      style={{ backgroundColor: isVisible ? objColor : '#4a5568' }}
                    />
                    <span className="flex-1 truncate text-xs">{getDisplayName()}</span>
                    <button
                      onClick={() => dispatch({ type: 'UPDATE_OBJECT', payload: { id: obj.id, locked: !isLocked } })}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-700 rounded"
                      title={isLocked ? 'Unlock' : 'Lock'}
                    >
                      {isLocked ? <Lock size={10} /> : <Unlock size={10} />}
                    </button>
                    <button
                      onClick={() => dispatch({ type: 'UPDATE_OBJECT', payload: { id: obj.id, visible: !isVisible } })}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-700 rounded"
                      title={isVisible ? 'Hide' : 'Show'}
                    >
                      {isVisible ? <Eye size={10} /> : <EyeOff size={10} />}
                    </button>
                    <button
                      onClick={() => setSettingsObjectId(obj.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-700 rounded"
                      title="Settings"
                    >
                      <Settings size={10} />
                    </button>
                    <button
                      onClick={() => setDeleteCandidateId(obj.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-600 rounded text-red-400 hover:text-white"
                      title="Delete"
                    >
                      <Trash2 size={10} />
                    </button>
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
          onConfirm={() => {
            dispatch({ type: 'DELETE_OBJECT', payload: { id: deleteCandidateId }});
            setDeleteCandidateId(null);
          }}
          onCancel={() => setDeleteCandidateId(null)}
        />
      )}

      {settingsObjectId && category.matcher(state.objects[settingsObjectId]) && (
        <>
          {state.objects[settingsObjectId]?.type === ItemType.PANEL ? (
            <PanelSettingsModal
              panel={state.objects[settingsObjectId] as PanelObject}
              onClose={() => setSettingsObjectId(null)}
            />
          ) : (
            <ObjectSettingsModal
              object={state.objects[settingsObjectId]}
              onClose={() => setSettingsObjectId(null)}
              onSave={(updatedObj) => {
                dispatch({ type: 'UPDATE_OBJECT', payload: updatedObj });
                setSettingsObjectId(null);
              }}
            />
          )}
        </>
      )}
    </div>
  );
};

// Inline PanelSettingsModal for use in MainMenuContent (same as in UIObjectRenderer)
const PanelSettingsModalInline: React.FC<{
  panel: PanelObject;
  onClose: () => void;
}> = ({ panel, onClose }) => {
  const { dispatch } = useGame();
  const [activeTab, setActiveTab] = React.useState<'general'>('general');
  const [title, setTitle] = React.useState(panel.title);
  const [x, setX] = React.useState(panel.x);
  const [y, setY] = React.useState(panel.y);
  const [width, setWidth] = React.useState(panel.width);
  const [height, setHeight] = React.useState(panel.height);
  const [rotation, setRotation] = React.useState(panel.rotation);
  const [dualPosition, setDualPosition] = React.useState(panel.dualPosition || false);
  const [zIndex, setZIndex] = React.useState(panel.zIndex || 1000);

  // Hand card scale state for HAND panels
  const isHandPanel = panel.panelType === PanelType.HAND;
  const { scale: handCardScale, setHandCardScale } = useHandCardScale();

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
    // Save hand card scale to localStorage for HAND panels
    if (isHandPanel) {
      localStorage.setItem('hand-card-scale', String(handCardScale));
      // Dispatch event to update hand card scale in HandPanel
      window.dispatchEvent(new CustomEvent('hand-card-scale-changed', {
        detail: { scale: handCardScale }
      }));
    }
    onClose();
  };

  const modalContent = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70">
      <div className="bg-slate-800 rounded-lg shadow-xl w-[575px] border border-slate-600 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex justify-center items-center py-2 px-4 border-b border-slate-700">
          <h3 className="text-base font-bold text-white">Settings: {panel.title}</h3>
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

          {/* Z-Index and Card Scale in one row for HAND panels */}
          {isHandPanel ? (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Card Scale (%)</label>
                <input
                  type="number"
                  value={Math.round(handCardScale * 100)}
                  onChange={e => {
                    const val = Number(e.target.value);
                    if (!isNaN(val) && val >= 50 && val <= 200) {
                      setHandCardScale(val / 100);
                    }
                  }}
                  min={50}
                  max={200}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Z-Index</label>
                <input
                  type="number"
                  value={zIndex}
                  onChange={e => setZIndex(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">Z-Index (layer order)</label>
              <input
                type="number"
                value={zIndex}
                onChange={e => setZIndex(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
              />
            </div>
          )}

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
