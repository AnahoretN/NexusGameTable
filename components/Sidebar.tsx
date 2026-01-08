import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useGame, GameState } from '../store/GameContext';
import { ItemType, TableObject, Token, CardLocation, Deck, Card, DiceObject, Counter, TokenShape, GridType, CardShape, CardOrientation, ContextAction, Deck as DeckType, CardNamePosition } from '../types';
import { Dices, MessageSquare, PlusSquare, User, Check, ChevronDown, ChevronRight, Settings, Plus, LayoutGrid, CircleDot, Square, Hexagon, Component, Box, Eye, EyeOff, Lock, Unlock, Trash2, Library, X, ShieldCheck, Save, Upload, Link as LinkIcon, CheckCircle, Signal, Hand, Layers, Minus, Maximize2, Minimize2, RefreshCw, Copy } from 'lucide-react';
import { TOKEN_SIZE, CARD_SHAPE_DIMS } from '../constants';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { ObjectSettingsModal } from './ObjectSettingsModal';
import { Card as CardComponent } from './Card';

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

export const Sidebar: React.FC<SidebarProps> = ({ width = 320 }) => {
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
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number } | null>(null);
  const [isDraggingFromTable, setIsDraggingFromTable] = useState(false);
  const [isHoveringHand, setIsHoveringHand] = useState(false);
  const [cardScale, setCardScale] = useState(1);

  // Drag reordering state for hand cards
  const [reorderDraggedIndex, setReorderDraggedIndex] = useState<number | null>(null);
  const [reorderDropIndex, setReorderDropIndex] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const changeCardScale = (delta: number) => {
      setCardScale(prev => Math.max(0.5, Math.min(2, prev + delta)));
  };

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
                      faceUp: false,
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

  // Get hand cards - cards with location HAND that belong to active player
  // Use custom order if available, otherwise sort by ID descending (newest first)
  const currentPlayer = state.players.find(p => p.id === state.activePlayerId);
  const rawHandCards = (Object.values(state.objects) as TableObject[])
    .filter(obj =>
        obj.type === ItemType.CARD &&
        (obj as Card).location === CardLocation.HAND &&
        (obj as Card).ownerId === state.activePlayerId
    ) as Card[];

  // Helper to get card settings from deck (cards always inherit from deck)
  const getCardSettings = useCallback((card: Card) => {
    if (card.deckId) {
      const deck = state.objects[card.deckId] as DeckType;
      if (deck && deck.type === ItemType.DECK) {
        return {
          cardOrientation: deck.cardOrientation,
          allowedActions: deck.cardAllowedActions,
          allowedActionsForGM: deck.cardAllowedActionsForGM,
          actionButtons: deck.cardActionButtons,
          singleClickAction: deck.cardSingleClickAction,
          doubleClickAction: deck.cardDoubleClickAction,
          cardWidth: deck.cardWidth,
          cardHeight: deck.cardHeight,
          cardNamePosition: deck.cardNamePosition,
        };
      }
    }

    // Default to no specific settings (all actions allowed)
    return {
      cardOrientation: undefined,
      allowedActions: undefined,
      allowedActionsForGM: undefined,
      actionButtons: undefined,
      singleClickAction: undefined,
      doubleClickAction: undefined,
      cardWidth: undefined,
      cardHeight: undefined,
      cardNamePosition: undefined,
    };
  }, [state.objects]);

  // Use player's saved order if available, otherwise default sorting
  let handCards: Card[];
  if (currentPlayer?.handCardOrder && currentPlayer.handCardOrder.length > 0) {
    // Use custom order, filtering out cards no longer in hand
    const orderedIds = currentPlayer.handCardOrder.filter(id =>
        rawHandCards.some(c => c.id === id)
    );
    // Add any new cards not in the order (at the beginning for newest-first behavior)
    const newCardIds = rawHandCards
        .filter(c => !currentPlayer.handCardOrder?.includes(c.id))
        .map(c => c.id)
        .sort((a, b) => b.localeCompare(a)); // newest first

    const finalOrder = [...newCardIds, ...orderedIds];
    handCards = finalOrder.map(id => rawHandCards.find(c => c.id === id)).filter(Boolean) as Card[];
  } else {
    // Default sorting: newest first
    handCards = rawHandCards.sort((a, b) => b.id.localeCompare(a.id));
  }

  // Apply visual reordering during drag (don't modify actual handCards, just for display)
  let displayCards = [...handCards];
  if (reorderDraggedIndex !== null && reorderDropIndex !== null && reorderDraggedIndex !== reorderDropIndex) {
    const [removed] = displayCards.splice(reorderDraggedIndex, 1);
    displayCards.splice(reorderDropIndex, 0, removed);
  }

  // Always show 2 cards per row with 2px gap
  const columnsCount = 2;
  // Calculate card width: (sidebar width - scrollbar - outer padding - inner padding - gap) / columns
  // scrollbar (~15px) + p-2 (16px) + px-1 (8px) + gap (2px)
  const cardWidth = (width - 15 - 16 - 8 - 2) / columnsCount;

  // Get dimensions for card (all cards in hand use same aspect ratio from first card)
  const getCardDimensions = (card: Card) => {
      const cardSettings = getCardSettings(card);
      const isHorizontal = cardSettings.cardOrientation === CardOrientation.HORIZONTAL;

      const actualCardWidth = card.width ?? 100;
      const actualCardHeight = card.height ?? 140;

      // For layout calculations, swap dimensions for horizontal orientation
      // because CSS rotate(-90deg) makes the card occupy that space visually
      const layoutWidth = isHorizontal ? actualCardHeight : actualCardWidth;
      const layoutHeight = isHorizontal ? actualCardWidth : actualCardHeight;

      const aspectRatio = layoutWidth / layoutHeight;
      const cardHeight = cardWidth / aspectRatio;
      return { cardWidth, cardHeight, aspectRatio };
  };

  const cardLayouts = displayCards.map((card, index) => {
      const { cardWidth, cardHeight } = getCardDimensions(card);
      const scaledWidth = cardWidth * cardScale;
      const scaledHeight = cardHeight * cardScale;
      const col = index % columnsCount;
      const row = Math.floor(index / columnsCount);
      const xPos = col * (cardWidth + 2); // 2px gap
      const yPos = row * (cardHeight + 2); // 2px gap
      return { card, cardWidth, cardHeight, scaledWidth, scaledHeight, xPos, yPos, index };
  });

  // Calculate container height for scroll
  const firstCardDims = displayCards.length > 0 ? getCardDimensions(displayCards[0]) : { cardHeight: 140 };
  const rows = Math.ceil(displayCards.length / columnsCount);
  const containerHeight = displayCards.length === 0 ? 0 : (rows * firstCardDims.cardHeight * cardScale + (rows - 1) * 2);

  // Handle card drag start from hand (for playing to table or reordering)
  const handleCardMouseDown = (e: React.MouseEvent, cardId: string, index: number) => {
      e.preventDefault();
      e.stopPropagation();

      // Check if Shift key is held for reordering
      if (e.shiftKey) {
          setReorderDraggedIndex(index);
          setReorderDropIndex(index);
      } else {
          // Normal drag to play to table
          setDraggingCardId(cardId);
          setDragPosition({ x: e.clientX, y: e.clientY });
          setDragStartPos({ x: e.clientX, y: e.clientY });
          // Dispatch event for Tabletop to track drag from hand
          window.dispatchEvent(new CustomEvent('sidebar-drag-start', { detail: { cardId } }));
      }
  };

  // Handle drag move
  const handleMouseMove = (e: React.MouseEvent) => {
      if (draggingCardId) {
          setDragPosition({ x: e.clientX, y: e.clientY });
      } else if (reorderDraggedIndex !== null) {
          // Find which card is under the cursor for reordering
          const sidebarEl = sidebarRef.current;
          if (sidebarEl) {
              const cardsArea = sidebarEl.querySelector('[data-cards-area="true"]') as HTMLElement;
              if (cardsArea) {
                  const rect = cardsArea.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const y = e.clientY - rect.top;

                  // Find which card position is under cursor
                  const targetIndex = cardLayouts.findIndex(layout => {
                      return x >= layout.xPos && x <= layout.xPos + layout.cardWidth &&
                             y >= layout.yPos && y <= layout.yPos + layout.cardHeight;
                  });

                  if (targetIndex !== -1 && targetIndex !== reorderDropIndex) {
                      setReorderDropIndex(targetIndex);
                  }
              }
          }
      }
  };

  // Handle drag end - play card to table (called from global mouseup)
  const finishDrag = useCallback((clientX: number, clientY: number) => {
      if (!draggingCardId) return;

      const card = handCards.find(c => c.id === draggingCardId);
      if (!card) {
          setDraggingCardId(null);
          setDragPosition(null);
          setDragStartPos(null);
          return;
      }

      // Check if drag distance is significant (not just a click)
      if (dragStartPos) {
          const dragDistance = Math.sqrt(
              Math.pow(clientX - dragStartPos.x, 2) +
              Math.pow(clientY - dragStartPos.y, 2)
          );

          if (dragDistance > 10) {
              // Get sidebar element to check bounds
              const sidebarEl = sidebarRef.current;
              if (sidebarEl) {
                  const sidebarRect = sidebarEl.getBoundingClientRect();
                  const isOutsideSidebar =
                      clientX < sidebarRect.left ||
                      clientX > sidebarRect.right ||
                      clientY < sidebarRect.top ||
                      clientY > sidebarRect.bottom;

                  if (isOutsideSidebar) {
                      // Place card on table at mouse position (adjusted for view transform)
                      const { offset, zoom } = state.viewTransform;
                      const actualCardWidth = card.width ?? 100;
                      const actualCardHeight = card.height ?? 140;
                      const worldX = (clientX - offset.x) / zoom - actualCardWidth / 2;
                      const worldY = (clientY - offset.y) / zoom - actualCardHeight / 2;

                      // Get the highest zIndex from table objects
                      const tableObjects = Object.values(state.objects).filter(obj =>
                          obj.isOnTable && obj.id !== card.id
                      );
                      const allZ = tableObjects.map(o => o.zIndex || 0);
                      const maxZ = allZ.length ? Math.max(...allZ) : 0;

                      dispatch({
                          type: 'UPDATE_OBJECT',
                          payload: {
                              id: card.id,
                              x: worldX,
                              y: worldY,
                              location: CardLocation.TABLE,
                              ownerId: undefined,
                              isOnTable: true,
                              zIndex: maxZ + 1
                          }
                      });
                  }
              }
          }
      }

      setDraggingCardId(null);
      setDragPosition(null);
      setDragStartPos(null);
      // Dispatch event for Tabletop to handle drop on decks and piles
      window.dispatchEvent(new CustomEvent('sidebar-drag-end', { detail: { cardId: draggingCardId, clientX, clientY } }));
  }, [draggingCardId, dragStartPos, handCards, state.viewTransform, state.objects, dispatch]);

  // Handle drag end - play card to table (called from sidebar mouseup)
  const handleMouseUp = (e: React.MouseEvent) => {
      // Handle reordering end
      if (reorderDraggedIndex !== null) {
          if (reorderDropIndex !== null && reorderDraggedIndex !== reorderDropIndex) {
              // Calculate the new card order
              const newOrder = [...handCards.map(c => c.id)];
              const [removed] = newOrder.splice(reorderDraggedIndex, 1);
              newOrder.splice(reorderDropIndex, 0, removed);

              // Dispatch to update the player's handCardOrder
              dispatch({
                  type: 'UPDATE_HAND_CARD_ORDER',
                  payload: { playerId: state.activePlayerId, cardOrder: newOrder }
              });
          }
          setReorderDraggedIndex(null);
          setReorderDropIndex(null);
          return;
      }

      finishDrag(e.clientX, e.clientY);
  };

  // Return card to deck
  const handleReturnToDeck = (card: Card) => {
      if (!card.deckId) return;
      dispatch({ type: 'RETURN_TO_DECK', payload: { cardId: card.id } });
  };

  // Flip card
  const handleFlipCard = (card: Card) => {
      dispatch({ type: 'FLIP_CARD', payload: { cardId: card.id } });
  };

  // Listen for drag events from tabletop (cards from table)
  useEffect(() => {
      const handleTableDragStart = (e: Event) => {
          const customEvent = e as CustomEvent<{ cardId: string }>;
          // Check if this is a card on the table
          const card = state.objects[customEvent.detail.cardId] as Card;
          if (card && card.type === ItemType.CARD && card.location === CardLocation.TABLE) {
              setIsDraggingFromTable(true);
              setDragPosition({ x: 0, y: 0 }); // Will be updated by mousemove
          }
      };

      const handleTableDragEnd = (e: Event) => {
          setIsDraggingFromTable(false);
          setDragPosition(null);
      };

      window.addEventListener('tabletop-drag-start', handleTableDragStart as EventListener);
      window.addEventListener('tabletop-drag-end', handleTableDragEnd as EventListener);

      return () => {
          window.removeEventListener('tabletop-drag-start', handleTableDragStart as EventListener);
          window.removeEventListener('tabletop-drag-end', handleTableDragEnd as EventListener);
      };
  }, [state.objects]);

  // Handle drop from table to hand
  useEffect(() => {
      const handleTableDropToHand = (e: Event) => {
          const customEvent = e as CustomEvent<{ cardId: string }>;
          const card = state.objects[customEvent.detail.cardId] as Card;
          if (card && card.type === ItemType.CARD && isHoveringHand && activeTab === 'hand') {
              dispatch({
                  type: 'UPDATE_OBJECT',
                  payload: {
                      id: card.id,
                      location: CardLocation.HAND,
                      ownerId: state.activePlayerId,
                      isOnTable: false
                  }
              });
          }
      };

      window.addEventListener('tabletop-drop-to-hand', handleTableDropToHand as EventListener);
      return () => {
          window.removeEventListener('tabletop-drop-to-hand', handleTableDropToHand as EventListener);
      };
  }, [isHoveringHand, activeTab, state.objects, state.activePlayerId, dispatch]);

  // Global mouseup handler to catch mouse release outside sidebar
  useEffect(() => {
      const handleGlobalMouseUp = (e: MouseEvent) => {
          if (draggingCardId) {
              finishDrag(e.clientX, e.clientY);
          }
      };

      const handleGlobalMouseMove = (e: MouseEvent) => {
          if (draggingCardId) {
              setDragPosition({ x: e.clientX, y: e.clientY });
          }
      };

      if (draggingCardId) {
          window.addEventListener('mouseup', handleGlobalMouseUp);
          window.addEventListener('mousemove', handleGlobalMouseMove);
      }

      return () => {
          window.removeEventListener('mouseup', handleGlobalMouseUp);
          window.removeEventListener('mousemove', handleGlobalMouseMove);
      };
  }, [draggingCardId, dragStartPos, handCards, finishDrag]);

  return (
    <>
    <div
        ref={sidebarRef}
        className="h-full bg-slate-900 border-l border-slate-700 flex flex-col shadow-2xl z-50"
        style={{ width: `${width}px` }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
    >
        <div className="p-4 border-b border-slate-700 bg-slate-800">
            <h2 className="text-xl font-bold text-wood-400 mb-2 flex items-center gap-2">
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
                <div
                    className="p-2 h-full overflow-y-scroll"
                    onMouseEnter={() => setIsHoveringHand(true)}
                    onMouseLeave={() => setIsHoveringHand(false)}
                >
                    <div className="flex items-center justify-between mb-3 px-2">
                        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Your Hand</h3>
                        <div className="flex items-center gap-2">
                            {/* Scale controls */}
                            <button
                                onClick={() => changeCardScale(-0.1)}
                                className="p-1 bg-slate-700 hover:bg-slate-600 rounded text-gray-300 hover:text-white transition-colors"
                                title="Decrease card size"
                            >
                                <Minus size={12} />
                            </button>
                            <span className="text-xs text-gray-400 w-8 text-center">{Math.round(cardScale * 100)}%</span>
                            <button
                                onClick={() => changeCardScale(0.1)}
                                className="p-1 bg-slate-700 hover:bg-slate-600 rounded text-gray-300 hover:text-white transition-colors"
                                title="Increase card size"
                            >
                                <Plus size={12} />
                            </button>
                            <span className="text-xs bg-purple-600 px-2 py-1 rounded-full text-white ml-1">{handCards.length}</span>
                        </div>
                    </div>

                    {handCards.length === 0 ? (
                        <div className={`text-center py-10 rounded-lg transition-colors ${isDraggingFromTable ? 'bg-purple-500/10 border-2 border-dashed border-purple-500' : 'text-gray-500'}`}>
                            <Hand size={32} className="mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No cards in hand</p>
                            <p className="text-xs mt-1">Draw cards from a deck or drag from table</p>
                        </div>
                    ) : (
                        <div className="px-1 relative flex flex-col">
                            <div className="flex-shrink-0" style={{ height: `${containerHeight}px` }} data-cards-area="true">
                                {cardLayouts.map(({ card, cardWidth, cardHeight, scaledWidth, scaledHeight, xPos, yPos, index }) => {
                                const isDragging = draggingCardId === card.id;
                                const isReorderDragging = reorderDraggedIndex === index;
                                const cardSettings = getCardSettings(card);

                                // Define button configs matching Card.tsx
                                const buttonConfigs: Record<string, { className: string; title: string; icon: React.ReactNode; action: () => void }> = {
                                    flip: {
                                        className: 'bg-purple-600 hover:bg-purple-500',
                                        title: 'Flip',
                                        icon: <Eye size={14} />,
                                        action: () => handleFlipCard(card)
                                    },
                                    toHand: {
                                        className: 'bg-blue-600 hover:bg-blue-500',
                                        title: 'To Hand',
                                        icon: <Hand size={14} />,
                                        action: () => {/* Already in hand */}
                                    },
                                    rotate: {
                                        className: 'bg-green-600 hover:bg-green-500',
                                        title: 'Rotate',
                                        icon: <RefreshCw size={14} />,
                                        action: () => dispatch({ type: 'ROTATE_OBJECT', payload: { id: card.id, angle: 90 }})
                                    },
                                    clone: {
                                        className: 'bg-cyan-600 hover:bg-cyan-500',
                                        title: 'Clone',
                                        icon: <Copy size={14} />,
                                        action: () => dispatch({ type: 'CLONE_OBJECT', payload: { id: card.id }})
                                    },
                                    lock: {
                                        className: 'bg-yellow-600 hover:bg-yellow-500',
                                        title: card.locked ? 'Unlock' : 'Lock',
                                        icon: card.locked ? <Unlock size={14} /> : <Lock size={14} />,
                                        action: () => dispatch({ type: 'TOGGLE_LOCK', payload: { id: card.id }})
                                    },
                                    layer: {
                                        className: 'bg-indigo-600 hover:bg-indigo-500',
                                        title: 'Layer',
                                        icon: <Layers size={14} />,
                                        action: () => dispatch({ type: 'MOVE_LAYER_UP', payload: { id: card.id }})
                                    },
                                };

                                const actionButtons = cardSettings.actionButtons || [];

                                return (
                                    <div
                                        key={card.id}
                                        className={`absolute group flex items-center justify-center ${isDragging ? 'opacity-0' : 'hover:z-10'} ${isReorderDragging ? 'opacity-50' : ''}`}
                                        onMouseDown={(e) => handleCardMouseDown(e, card.id, index)}
                                        style={{
                                            left: `${xPos}px`,
                                            top: `${yPos}px`,
                                            width: `${scaledWidth}px`,
                                            height: `${scaledHeight}px`
                                        }}
                                    >
                                        <CardComponent
                                            card={card}
                                            overrideWidth={scaledWidth}
                                            overrideHeight={scaledHeight}
                                            cardWidth={cardSettings.cardWidth}
                                            cardHeight={cardSettings.cardHeight}
                                            cardNamePosition={cardSettings.cardNamePosition}
                                            cardOrientation={cardSettings.cardOrientation}
                                        />

                                        {/* Action buttons overlay - use deck settings if available */}
                                        {actionButtons.length > 0 && (
                                            <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {actionButtons
                                                    .filter(action => action in buttonConfigs && action !== 'toHand') // Exclude toHand in hand
                                                    .slice(0, 2)
                                                    .map(action => {
                                                        const btn = buttonConfigs[action];
                                                        return (
                                                            <button
                                                                key={action}
                                                                onClick={(e) => { e.stopPropagation(); btn.action(); }}
                                                                onMouseDown={(e) => e.stopPropagation()}
                                                                className={`p-2 rounded text-white hover:shadow ${btn.className}`}
                                                                title={btn.title}
                                                            >
                                                                {btn.icon}
                                                            </button>
                                                        );
                                                    })}
                                            </div>
                                        )}
                                    </div>
                                );
                                })}
                            </div>
                        </div>
                    )}
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

    {/* Drag preview for cards from hand */}
    {draggingCardId && dragPosition && (() => {
        const layout = cardLayouts.find(l => l.card.id === draggingCardId);
        if (!layout) return null;
        const { card, cardWidth: previewWidth, cardHeight: previewHeight } = layout;

        return (
            <div
                className="fixed pointer-events-none z-[200]"
                style={{
                    left: dragPosition.x,
                    top: dragPosition.y,
                    transform: 'translate(-50%, -50%)',
                    filter: 'drop-shadow(0 10px 20px rgba(0,0,0,0.5))'
                }}
            >
                <div style={{ width: previewWidth, height: previewHeight }}>
                    <CardComponent card={card} overrideWidth={previewWidth} overrideHeight={previewHeight} />
                </div>
            </div>
        );
    })()}
    </>
  );
};