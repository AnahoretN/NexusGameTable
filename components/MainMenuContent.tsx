import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useGame, GameState } from '../store/GameContext';
import { ItemType, TableObject, Token, CardLocation, Deck, Card, DiceObject, Counter, TokenShape, GridType, CardShape, PanelType, Board, Randomizer, WindowType, PanelObject, CardPile } from '../types';
import { Dices, MessageSquare, User, Check, ChevronDown, ChevronRight, Settings, Plus, LayoutGrid, CircleDot, Square, Hexagon, Component, Box, Lock, Unlock, Trash2, Library, Save, Upload, Link as LinkIcon, CheckCircle, Signal, Hand, Eye, EyeOff, Layers } from 'lucide-react';
import { TOKEN_SIZE, CARD_SHAPE_DIMS } from '../constants';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { ObjectSettingsModal } from './ObjectSettingsModal';
import { HandPanel } from './HandPanel';
import { cardDragAPI, DragState } from '../hooks/useCardDrag';

// Helper for safe ID generation
const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try {
      return crypto.randomUUID();
    } catch (e) {}
  }
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
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

  const isGM = state.players.find(p => p.id === state.activePlayerId)?.isGM ?? false;
  const isHost = true; // TODO: from context

  // Get main menu panel bounds for drag detection
  const mainMenuBounds = useMemo(() => {
    // UI panels are stored in state.objects, not a separate uiObjects
    const mainMenuPanel = Object.values(state.objects).find(
      obj => obj.type === ItemType.PANEL && (obj as any).panelType === PanelType.MAIN_MENU
    ) as PanelObject | undefined;

    if (!mainMenuPanel) return null;

    return {
      x: mainMenuPanel.x,
      y: mainMenuPanel.y,
      width: mainMenuPanel.width,
      height: mainMenuPanel.height
    };
  }, [state.objects]);

  // Handle card drag over mainMenu for hand panel
  useEffect(() => {
    const handleDragMove = (e: Event) => {
      const customEvent = e as CustomEvent<{
        cardId: string | null;
        source: 'hand' | 'tabletop' | null;
        x: number;
        y: number;
      }>;

      // Only handle cards dragged from tabletop to hand
      if (customEvent.detail.source !== 'tabletop') return;

      if (!mainMenuBounds) return;

      const x = customEvent.detail.x;
      const y = customEvent.detail.y;

      const isOverMainMenu = x >= mainMenuBounds.x && x <= mainMenuBounds.x + mainMenuBounds.width &&
                             y >= mainMenuBounds.y && y <= mainMenuBounds.y + mainMenuBounds.height;

      if (isOverMainMenu) {
        if (activeTab !== 'hand') {
          setPreviousTab(activeTab);
          setActiveTab('hand');
        }
        setDragOverHand(true);
      } else {
        setDragOverHand(false);
      }
    };

    const handleDragEnd = () => {
      setDragOverHand(false);
    };

    window.addEventListener('card-drag-move', handleDragMove);
    window.addEventListener('card-drag-end', handleDragEnd);

    return () => {
      window.removeEventListener('card-drag-move', handleDragMove);
      window.removeEventListener('card-drag-end', handleDragEnd);
    };
  }, [activeTab, mainMenuBounds]);

  const handleCreatePanel = (panelType: PanelType) => {
    const x = window.innerWidth / 2 - 150;
    const y = window.innerHeight / 2 - 200;

    dispatch({
      type: 'CREATE_PANEL',
      payload: {
        panelType,
        x,
        y,
        width: 300,
        height: 400,
        title: panelType === PanelType.HAND ? 'Your Hand' : panelType,
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
        { name: 'Square Board', type: 'BOARD', gridType: GridType.SQUARE },
        { name: 'Hex Board', type: 'BOARD', gridType: GridType.HEX },
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
          <HandPanel width={width} isDragTarget={dragOverHand} panelBounds={mainMenuBounds} />
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
                .filter(p => isHost || p.id !== 'player-view')
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
  const objectsOnTable = Object.values(state.objects).filter(category.matcher);

  const handleCreateItem = (item: typeof category.items[number]) => {
    const centerX = (window.innerWidth - 286) / 2; // Subtract mainMenu width
    const centerY = window.innerHeight / 2;

    switch (item.type) {
      case 'DECK': {
        const deck: Deck = {
          id: generateUUID(),
          type: ItemType.DECK,
          name: item.name,
          x: centerX,
          y: centerY,
          width: 100,
          height: 140,
          rotation: 0,
          color: '#2c3e50',
          faceUp: false,
          isOnTable: true,
          locked: false,
          cardIds: [],
          faceUpCardIds: [],
          showTopCard: false,
          piles: [],
          // Deck-specific properties
          cardShape: CardShape.RECTANGLE,
          cardOrientation: 'vertical' as const,
          cardWidth: 100,
          cardHeight: 140,
          cardBackImage: '',
          cardAllowedActions: ['flip', 'rotate', 'toHand', 'delete', 'clone', 'lock', 'layer'],
          cardAllowedActionsForGM: ['flip', 'rotate', 'toHand', 'delete', 'clone', 'lock', 'layer'],
          cardActionButtons: ['flip'],
          cardSingleClickAction: undefined,
          cardDoubleClickAction: undefined,
          cardNamePosition: 'bottom' as const,
        };
        dispatch({ type: 'ADD_OBJECT', payload: deck });
        break;
      }
      case 'EMPTY_DECK': {
        const deck: Deck = {
          id: generateUUID(),
          type: ItemType.DECK,
          name: 'Empty Deck',
          x: centerX,
          y: centerY,
          width: 100,
          height: 140,
          rotation: 0,
          color: '#2c3e50',
          faceUp: false,
          isOnTable: true,
          locked: false,
          cardIds: [],
          faceUpCardIds: [],
          showTopCard: false,
          piles: [],
          cardShape: CardShape.RECTANGLE,
          cardOrientation: 'vertical' as const,
          cardWidth: 100,
          cardHeight: 140,
          cardBackImage: '',
          cardAllowedActions: ['flip', 'rotate', 'toHand', 'delete', 'clone', 'lock', 'layer'],
          cardAllowedActionsForGM: ['flip', 'rotate', 'toHand', 'delete', 'clone', 'lock', 'layer'],
          cardActionButtons: ['flip'],
          cardSingleClickAction: undefined,
          cardDoubleClickAction: undefined,
          cardNamePosition: 'bottom' as const,
        };
        dispatch({ type: 'ADD_OBJECT', payload: deck });
        break;
      }
      case 'TOKEN': {
        const token: Token = {
          id: generateUUID(),
          type: ItemType.TOKEN,
          name: item.name,
          x: centerX,
          y: centerY,
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
          x: centerX,
          y: centerY,
          width: 60,
          height: 60,
          rotation: 0,
          color: '#6366f1',
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
          x: centerX,
          y: centerY,
          width: 120,
          height: 50,
          rotation: 0,
          color: '#10b981',
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
          x: centerX - 200,
          y: centerY - 200,
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
            x: centerX - 150,
            y: centerY - 200,
            width: 300,
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
                const isVisible = obj.visible !== false;
                return (
                  <div
                    key={obj.id}
                    className={`flex items-center gap-1 py-1 px-2 rounded text-sm group ${isVisible ? 'text-gray-300 hover:bg-slate-800' : 'text-gray-600 hover:bg-slate-800/50'}`}
                  >
                    <div
                      className="w-3 h-3 rounded flex-shrink-0"
                      style={{ backgroundColor: isVisible ? obj.color : '#4a5568' }}
                    />
                    <span className="flex-1 truncate text-xs">{obj.name}</span>
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
          objectName={state.objects[deleteCandidateId]?.name || 'Object'}
          onConfirm={() => {
            dispatch({ type: 'DELETE_OBJECT', payload: { id: deleteCandidateId }});
            setDeleteCandidateId(null);
          }}
          onCancel={() => setDeleteCandidateId(null)}
        />
      )}

      {settingsObjectId && category.matcher(state.objects[settingsObjectId]) && (
        <ObjectSettingsModal
          object={state.objects[settingsObjectId]}
          onClose={() => setSettingsObjectId(null)}
          onSave={(updatedObj) => {
            dispatch({ type: 'UPDATE_OBJECT', payload: updatedObj });
            setSettingsObjectId(null);
          }}
        />
      )}
    </div>
  );
};
