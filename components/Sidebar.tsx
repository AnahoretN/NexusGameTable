import React, { useState, useRef } from 'react';
import { useGame, GameState } from '../store/GameContext';
import { ItemType, TableObject, Token, CardLocation, Deck, Card, DiceObject, Counter, TokenShape, GridType, CardShape } from '../types';
import { Dices, MessageSquare, User, Check, ChevronDown, ChevronRight, Settings, Plus, LayoutGrid, CircleDot, Square, Hexagon, Component, Box, Lock, Unlock, Trash2, Library, Save, Upload, Link as LinkIcon, CheckCircle, Signal, Hand, Eye, EyeOff } from 'lucide-react';
import { TOKEN_SIZE, CARD_SHAPE_DIMS } from '../constants';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { ObjectSettingsModal } from './ObjectSettingsModal';
import { HandPanel } from './HandPanel';

// Helper for safe ID generation
const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try {
      return crypto.randomUUID();
    } catch (e) {}
  }
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

interface SidebarProps {
    width?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({ width = 350 }) => {
  const { state, dispatch, isHost, peerId, connectionStatus } = useGame();
  const activePlayer = state.players.find(p => p.id === state.activePlayerId);
  const isGM = activePlayer?.isGM;

  const [activeTab, setActiveTab] = useState<'create' | 'chat' | 'players' | 'hand'>('create');
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{sender: string, text: string}[]>([]);

  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [editingObject, setEditingObject] = useState<TableObject | null>(null);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const handleChat = async () => {
      if (!chatInput.trim()) return;
      const userMsg = chatInput;
      setChatHistory(prev => [...prev, { sender: 'You', text: userMsg }]);
      setChatInput('');
  };

  const handleSaveGame = () => {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", `nexustable_save_${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchorNode); // required for firefox
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
  };

  const handleLoadGame = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
          try {
              if (e.target?.result) {
                  const json = JSON.parse(e.target.result as string);
                  // Basic validation to check if it looks like a game state
                  if (json.objects && json.players) {
                      dispatch({ type: 'LOAD_GAME', payload: json as GameState });
                  } else {
                      alert("Invalid save file format.");
                  }
              }
          } catch (err) {
              console.error(err);
              alert("Failed to load save file.");
          }
      };
      reader.readAsText(file);
      // Reset input so same file can be selected again if needed
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleInvite = () => {
      if (!peerId) {
          alert("Network not ready yet.");
          return;
      }
      const url = `${window.location.origin}${window.location.pathname}?hostId=${peerId}`;
      navigator.clipboard.writeText(url).then(() => {
          setInviteCopied(true);
          setTimeout(() => setInviteCopied(false), 2000);
      });
  };

  const toggleCategory = (id: string) => {
      setOpenCategory(openCategory === id ? null : id);
  };

  const promptDelete = (e: React.MouseEvent, id: string) => {
      e.preventDefault();
      e.stopPropagation();
      setDeleteCandidateId(id);
  };

  const confirmDelete = () => {
      if (deleteCandidateId) {
          dispatch({ type: 'DELETE_OBJECT', payload: { id: deleteCandidateId } });
          setDeleteCandidateId(null);
      }
  };

  const openSettings = (e: React.MouseEvent, obj: TableObject) => {
      e.preventDefault();
      e.stopPropagation();
      setEditingObject(obj);
  };

  const saveSettings = (updatedObj: TableObject) => {
      dispatch({ type: 'UPDATE_OBJECT', payload: updatedObj });
  };

  const spawnObject = (itemData: any) => {
      const id = generateUUID();
      const centerX = 600 + (Math.random() * 50); 
      const centerY = 400 + (Math.random() * 50);
      
      const baseName = itemData.name;
      const baseColor = '#3b82f6';
      
      let newObj: TableObject | null = null;

      switch(itemData.type) {
          case 'DECK':
              const cardIds: string[] = [];
              const count = itemData.subtype === '54' ? 54 : 0;
              const defaultShape = CardShape.POKER;
              const defaultDims = CARD_SHAPE_DIMS[defaultShape];

              for(let i=0; i<count; i++) {
                  const cid = generateUUID();
                  cardIds.push(cid);
                  const card: Card = {
                      id: cid,
                      type: ItemType.CARD,
                      x: 0, y: 0,
                      width: defaultDims.width, height: defaultDims.height,
                      rotation: 0,
                      name: `Card ${i+1}`,
                      content: `https://picsum.photos/seed/${cid}/${defaultDims.width}/${defaultDims.height}`,
                      location: CardLocation.DECK,
                      faceUp: true,  // Face up by default (GM sees actual state, players see based on deck settings)
                      deckId: id,
                      locked: false,
                      isOnTable: true,
                      // Cards don't have allowedActions/actionButtons - they inherit from deck
                      shape: defaultShape
                  };
                  dispatch({ type: 'ADD_OBJECT', payload: card });
              }

              newObj = {
                  id,
                  type: ItemType.DECK,
                  x: centerX, y: centerY,
                  width: defaultDims.width, height: defaultDims.height,
                  rotation: 0,
                  name: baseName,
                  content: '',
                  cardIds,
                  locked: false,
                  isOnTable: true,
                  allowedActions: ['draw', 'shuffleDeck', 'playTopCard', 'searchDeck', 'returnAll'],
                  actionButtons: ['draw', 'playTopCard', 'shuffleDeck', 'searchDeck'],
                  cardShape: defaultShape,
                  initialCardCount: cardIds.length,
                  piles: [
                      {
                          id: `${id}-discard`,
                          name: 'Discard',
                          deckId: id,
                          position: 'right',
                          cardIds: [],
                          faceUp: false,
                          visible: false,  // Hidden by default
                          size: 1
                      }
                  ]
              } as Deck;
              break;

          case 'TOKEN':
              newObj = {
                  id,
                  type: ItemType.TOKEN,
                  shape: itemData.shape || TokenShape.CIRCLE,
                  x: centerX, y: centerY,
                  width: itemData.shape === TokenShape.STANDEE ? 60 : TOKEN_SIZE,
                  height: itemData.shape === TokenShape.STANDEE ? 100 : TOKEN_SIZE,
                  rotation: 0,
                  name: baseName,
                  content: '',
                  color: baseColor,
                  locked: false,
                  isOnTable: true
              } as Token;
              break;

          case 'BOARD':
               newObj = {
                  id,
                  type: ItemType.TOKEN,
                  shape: TokenShape.RECTANGLE,
                  x: centerX - 300, y: centerY - 200,
                  width: 800, height: 600,
                  rotation: 0,
                  name: baseName,
                  content: '',
                  color: '#2c3e50',
                  locked: true,
                  isOnTable: true,
                  gridType: GridType.NONE,
                  gridSize: 50,
                  snapToGrid: false
               } as Token;
               break;

          case 'COUNTER':
              newObj = {
                  id,
                  type: ItemType.COUNTER,
                  x: centerX, y: centerY,
                  width: 120, height: 50,
                  rotation: 0,
                  name: baseName,
                  content: '',
                  value: 0,
                  locked: false,
                  isOnTable: true
              } as Counter;
              break;

          case 'DICE':
               newObj = {
                   id,
                   type: ItemType.DICE_OBJECT,
                   x: centerX, y: centerY,
                   width: 60, height: 60,
                   rotation: 0,
                   name: baseName,
                   content: '',
                   sides: itemData.sides || 6,
                   currentValue: itemData.sides || 6,
                   locked: false,
                   isOnTable: true
               } as DiceObject;
               break;
      }

      if (newObj) {
          dispatch({ type: 'ADD_OBJECT', payload: newObj });
      }
  };

  const categories = [
      {
          id: 'decks', label: 'Decks', icon: <Component size={16}/>,
          items: [
              { name: 'Standard Deck', type: 'DECK', subtype: '54' },
              { name: 'Empty Deck', type: 'DECK', subtype: '0' },
          ],
          matcher: (obj: TableObject) => obj.type === ItemType.DECK
      },
      {
          id: 'boards', label: 'Game Boards', icon: <LayoutGrid size={16}/>,
          items: [
              { name: 'Custom Board', type: 'BOARD' },
          ],
          matcher: (obj: TableObject) => obj.type === ItemType.TOKEN && (obj as Token).shape === TokenShape.RECTANGLE
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
          id: 'dice', label: 'Dice', icon: <Dices size={16}/>,
          items: [
              { name: 'd4', type: 'DICE', sides: 4 },
              { name: 'd6', type: 'DICE', sides: 6 },
              { name: 'd8', type: 'DICE', sides: 8 },
              { name: 'd10', type: 'DICE', sides: 10 },
              { name: 'd12', type: 'DICE', sides: 12 },
              { name: 'd20', type: 'DICE', sides: 20 },
          ],
          matcher: (obj: TableObject) => obj.type === ItemType.DICE_OBJECT
      },
      {
          id: 'counters', label: 'Counters', icon: <Box size={16}/>,
          items: [
              { name: 'Life Counter', type: 'COUNTER' },
              { name: 'Score Tracker', type: 'COUNTER' },
          ],
          matcher: (obj: TableObject) => obj.type === ItemType.COUNTER
      }
  ];

  return (
    <>
    <div
        ref={sidebarRef}
        className="h-full bg-slate-900 border-l border-slate-700 flex flex-col shadow-2xl z-50"
        style={{ width: `${width}px` }}
    >
        <div className="p-4 border-b border-slate-700 bg-slate-800">
            <h2 className="text-base font-bold text-wood-400 mb-2 flex items-center gap-2">
                <Dices className="text-purple-400" /> Nexus Game Table v0.0.5
            </h2>
            
            <div className="flex items-center gap-2 text-[10px] text-gray-500 mb-2">
                <Signal size={10} className={connectionStatus === 'connected' ? 'text-green-500' : 'text-red-500'} />
                <span>{connectionStatus === 'connected' ? (isHost ? 'Online (Host)' : 'Online (Guest)') : 'Connecting...'}</span>
            </div>

            <div className="flex gap-2 flex-wrap">
                {isHost ? (
                    state.players.map(p => (
                        <button
                            key={p.id}
                            onClick={() => dispatch({ type: 'SWITCH_ROLE', payload: { playerId: p.id }})}
                            className={`text-xs px-2 py-1 rounded border ${state.activePlayerId === p.id ? 'bg-purple-600 border-purple-400 text-white' : 'bg-slate-700 border-slate-600 text-gray-400'}`}
                        >
                            {p.name} {p.isGM ? '(GM)' : ''}
                        </button>
                    ))
                ) : (
                    state.players
                    .filter(p => p.id !== 'player-view')
                    .map(p => (
                        <div
                            key={p.id}
                            className={`text-xs px-2 py-1 rounded border select-none cursor-default ${state.activePlayerId === p.id ? 'bg-green-600 border-green-400 text-white' : 'bg-slate-800 border-slate-700 text-gray-500'}`}
                        >
                            {p.name} {p.isGM ? '(GM)' : ''} {state.activePlayerId === p.id ? '(You)' : ''}
                        </div>
                    ))
                )}
            </div>
        </div>

        <div className="flex border-b border-slate-700">
            <button onClick={() => setActiveTab('create')} className={`flex-1 p-3 flex justify-center ${activeTab === 'create' ? 'bg-slate-800 text-white border-b-2 border-purple-500' : 'text-gray-500 hover:bg-slate-800'}`}>
                <Library size={20} />
            </button>
            <button onClick={() => setActiveTab('hand')} className={`flex-1 p-3 flex justify-center ${activeTab === 'hand' ? 'bg-slate-800 text-white border-b-2 border-purple-500' : 'text-gray-500 hover:bg-slate-800'}`}>
                <Hand size={20} />
            </button>
            <button onClick={() => setActiveTab('chat')} className={`flex-1 p-3 flex justify-center ${activeTab === 'chat' ? 'bg-slate-800 text-white border-b-2 border-purple-500' : 'text-gray-500 hover:bg-slate-800'}`}>
                <MessageSquare size={20} />
            </button>
            <button onClick={() => setActiveTab('players')} className={`flex-1 p-3 flex justify-center ${activeTab === 'players' ? 'bg-slate-800 text-white border-b-2 border-purple-500' : 'text-gray-500 hover:bg-slate-800'}`}>
                <User size={20} />
            </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar relative">
            {activeTab === 'create' && (
                <div className="p-2">
                    {!isGM ? (
                        <div className="text-center text-gray-500 py-10 px-4">Only the GM can manage objects.</div>
                    ) : (
                        <div className="space-y-1">
                            {categories.map(cat => {
                                const activeItems = Object.values(state.objects).filter(cat.matcher) as TableObject[];
                                return (
                                    <div key={cat.id} className="border border-slate-700 rounded bg-slate-800 overflow-hidden">
                                        <button 
                                            onClick={() => toggleCategory(cat.id)}
                                            className="w-full flex items-center justify-between p-3 hover:bg-slate-700 transition-colors text-left"
                                        >
                                            <div className="flex items-center gap-2 font-semibold text-gray-300">
                                                {cat.icon}
                                                {cat.label}
                                                {activeItems.length > 0 && <span className="text-xs bg-slate-600 px-1.5 rounded-full text-white">{activeItems.length}</span>}
                                            </div>
                                            {openCategory === cat.id ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
                                        </button>
                                        
                                        {openCategory === cat.id && (
                                            <div className="bg-slate-900/50 p-2 border-t border-slate-700">
                                                <div className="mb-4">
                                                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Create New</div>
                                                    <div className="space-y-1">
                                                        {cat.items.map((item, idx) => (
                                                            <button 
                                                                key={idx}
                                                                onClick={() => spawnObject(item)}
                                                                className="w-full text-left text-xs p-2 rounded bg-slate-800 hover:bg-slate-700 text-gray-400 hover:text-white flex items-center gap-2 border border-slate-700"
                                                            >
                                                                <Plus size={12}/>
                                                                {item.name}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                {activeItems.length > 0 && (
                                                    <div>
                                                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">In Game Library</div>
                                                        <div className="space-y-1">
                                                            {activeItems.map((obj) => (
                                                                <div key={obj.id} className="flex items-center justify-between p-2 rounded bg-slate-800/80 border border-slate-700 hover:border-slate-500 group">
                                                                    <span className={`text-xs truncate max-w-[80px] ${!obj.isOnTable && 'opacity-50 line-through'}`}>{obj.name}</span>
                                                                    <div className="flex gap-1">
                                                                        <button 
                                                                            onClick={(e) => openSettings(e, obj)}
                                                                            className="p-1 rounded text-gray-600 hover:text-blue-400 hover:bg-blue-400/10"
                                                                            title="Object Settings"
                                                                        >
                                                                            <Settings size={12}/>
                                                                        </button>
                                                                        <button 
                                                                            onClick={(e) => { e.stopPropagation(); dispatch({ type: 'TOGGLE_ON_TABLE', payload: { id: obj.id }})}}
                                                                            className={`p-1 rounded ${obj.isOnTable ? 'text-green-400 hover:bg-green-400/10' : 'text-gray-500 hover:text-gray-300'}`}
                                                                            title={obj.isOnTable ? 'Hide from Table' : 'Show on Table'}
                                                                        >
                                                                            {obj.isOnTable ? <Eye size={12}/> : <EyeOff size={12}/>}
                                                                        </button>
                                                                        <button 
                                                                            onClick={(e) => { e.stopPropagation(); dispatch({ type: 'TOGGLE_LOCK', payload: { id: obj.id }})}}
                                                                            className={`p-1 rounded ${obj.locked ? 'text-red-400 hover:bg-red-400/10' : 'text-gray-600 hover:text-gray-400'}`}
                                                                            title={obj.locked ? 'Unlock' : 'Lock'}
                                                                        >
                                                                            {obj.locked ? <Lock size={12}/> : <Unlock size={12}/>}
                                                                        </button>
                                                                        <button 
                                                                            onClick={(e) => promptDelete(e, obj.id)}
                                                                            className="p-1 rounded text-gray-600 hover:text-red-500 hover:bg-red-500/10"
                                                                            title="Delete Permanently"
                                                                        >
                                                                            <Trash2 size={12}/>
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'chat' && (
                <div className="flex flex-col h-full p-4">
                    <div className="flex-1 space-y-3 mb-4 overflow-y-auto">
                        {state.diceRolls.slice(0, 5).map(roll => (
                             <div key={roll.id} className="text-xs bg-slate-800 p-2 rounded border-l-2 border-yellow-500">
                                <span className="font-bold text-yellow-500">{roll.playerName}</span> rolled <span className="font-bold text-white text-sm">{roll.value}</span>
                             </div>
                        ))}
                        {chatHistory.map((msg, idx) => (
                            <div key={idx} className={`p-2 rounded text-sm ${msg.sender === 'You' ? 'bg-purple-900/50 self-end ml-4' : 'bg-slate-800 self-start mr-4'}`}>
                                <div className="font-bold text-xs opacity-70 mb-1">{msg.sender}</div>
                                <div>{msg.text}</div>
                            </div>
                        ))}
                    </div>
                    <div className="mt-auto">
                        <div className="flex gap-2">
                            <input
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleChat()}
                                placeholder="Chat..."
                                className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm outline-none text-white"
                            />
                            <button onClick={handleChat} className="bg-purple-600 hover:bg-purple-500 p-2 rounded text-white">
                                <Check size={16} />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'hand' && (
                <HandPanel width={width} />
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
                             <p className="text-[10px] text-gray-500 text-center">Share link to let others join this session.</p>
                         </div>
                         
                         {isGM && (
                             <div className="mt-4 grid grid-cols-2 gap-2">
                                <button 
                                    onClick={handleSaveGame}
                                    className="py-2 px-3 rounded bg-slate-800 border border-slate-600 hover:bg-slate-700 text-gray-300 flex items-center justify-center gap-2 text-sm"
                                >
                                    <Save size={14}/> Save Game
                                </button>
                                <button 
                                    onClick={() => fileInputRef.current?.click()}
                                    className="py-2 px-3 rounded bg-slate-800 border border-slate-600 hover:bg-slate-700 text-gray-300 flex items-center justify-center gap-2 text-sm"
                                >
                                    <Upload size={14}/> Load Game
                                </button>
                                <input 
                                    type="file" 
                                    ref={fileInputRef}
                                    onChange={handleLoadGame}
                                    accept="application/json"
                                    className="hidden"
                                />
                             </div>
                         )}
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

    {editingObject && (
        <ObjectSettingsModal 
            object={editingObject}
            onSave={saveSettings}
            onClose={() => setEditingObject(null)}
        />
    )}
    
    {deleteCandidateId && (
        <DeleteConfirmModal
            objectName={state.objects[deleteCandidateId]?.name || 'Object'}
            onConfirm={confirmDelete}
            onCancel={() => setDeleteCandidateId(null)}
        />
    )}
    </>
  );
};