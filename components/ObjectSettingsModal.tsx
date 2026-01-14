import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { TableObject, ItemType, Token, Deck, Card, DiceObject, Counter, TokenShape, GridType, CardShape, CardOrientation, ContextAction, CardPile, PilePosition, PileSize, ClickAction, CardNamePosition, SearchWindowVisibility, Board, CardSpriteConfig } from '../types';
import { X, Check, Settings, Shield, MousePointer, Layers, Trash2, Plus, Square, Maximize2, RotateCw, Box, Eye, Grid3x3, Image as ImageIcon } from 'lucide-react';

interface ObjectSettingsModalProps {
  object: TableObject;
  onSave: (obj: TableObject) => void;
  onClose: () => void;
}

// All available actions for Context Menu (ordered same as deck context menu)
const AVAILABLE_ACTIONS: { id: ContextAction; label: string }[] = [
  { id: 'draw', label: 'Draw Card' },
  { id: 'playTopCard', label: 'Play Top' },
  { id: 'showTop', label: 'Show Top' },
  { id: 'topDeck', label: 'Top Deck' },
  { id: 'searchDeck', label: 'Search' },
  { id: 'shuffleDeck', label: 'Shuffle' },
  { id: 'piles', label: 'Piles' },
  { id: 'returnAll', label: 'Return All' },
  { id: 'clone', label: 'Clone Object' },
  { id: 'delete', label: 'Delete Object' },
  { id: 'flip', label: 'Flip Card' },
  { id: 'layer', label: 'Change Layer' },
  { id: 'lock', label: 'Lock/Unlock Position' },
  { id: 'rotateClockwise', label: 'Rotate Clockwise' },
  { id: 'rotateCounterClockwise', label: 'Rotate Counter-Clockwise' },
  { id: 'swingClockwise', label: 'Swing Clockwise' },
  { id: 'swingCounterClockwise', label: 'Swing Counter-Clockwise' },
  { id: 'toHand', label: 'To Hand' },
];

// Actions that should NOT appear as quick action buttons (only in context menu)
const EXCLUDED_FROM_BUTTONS: ContextAction[] = ['clone', 'delete', 'layer', 'lock', 'returnAll', 'showTop', 'topDeck', 'piles'];

// Check if an action can be shown as an action button
function isActionButtonAllowed(action: ContextAction): boolean {
  return !EXCLUDED_FROM_BUTTONS.includes(action);
}

// Helper to determine which actions are available as buttons for which object types
function getButtonApplicableTypes(action: ContextAction): ItemType[] {
  // Exclude actions that should only be in context menu
  if (!isActionButtonAllowed(action)) return [];

  switch (action) {
    case 'draw':
    case 'playTopCard':
    case 'shuffleDeck':
    case 'searchDeck':
      return [ItemType.DECK];
    case 'rotateClockwise':
    case 'rotateCounterClockwise':
    case 'swingClockwise':
    case 'swingCounterClockwise':
      return [ItemType.DECK, ItemType.CARD, ItemType.TOKEN, ItemType.COUNTER, ItemType.DICE_OBJECT];
    case 'toHand':
      return [ItemType.CARD];
    case 'flip':
      return [ItemType.CARD, ItemType.TOKEN];
    case 'rotate':
      return [ItemType.CARD, ItemType.TOKEN, ItemType.COUNTER, ItemType.DICE_OBJECT];
    default:
      return [];
  }
}

// Available click actions (all actions from AVAILABLE_ACTIONS + none)
const CLICK_ACTIONS = [
  { id: 'none' as const, label: 'None' },
  ...AVAILABLE_ACTIONS.map(a => ({ id: a.id, label: a.label }))
];

type Tab = 'general' | 'actions' | 'piles' | 'cards' | 'sprite';

export const ObjectSettingsModal: React.FC<ObjectSettingsModalProps> = ({ object, onSave, onClose }) => {
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [data, setData] = useState<TableObject>({ ...object });

  // Initialize piles for decks
  const deck = data as Deck;
  const [piles, setPiles] = useState<CardPile[]>(
    deck.type === ItemType.DECK ? (deck.piles || [
      {
        id: `${deck.id}-discard`,
        name: 'Discard',
        deckId: deck.id,
        position: 'right',
        cardIds: [],
        faceUp: false,
        visible: false,  // Hidden by default
        size: 1
      }
    ]) : []
  );

  // Card settings for decks (settings that apply to cards belonging to this deck)
  // These are stored on the deck object and inherited by its cards
  interface CardSettings {
    cardShape?: CardShape;
    cardOrientation?: CardOrientation;
    allowedActions?: ContextAction[];
    allowedActionsForGM?: ContextAction[];
    actionButtons?: ContextAction[];
    singleClickAction?: ClickAction;
    doubleClickAction?: ClickAction;
    cardWidth?: number;
    cardHeight?: number;
    cardNamePosition?: CardNamePosition;
    searchFaceUp?: boolean;
    playTopFaceUp?: boolean;
    searchWindowVisibility?: SearchWindowVisibility;
  }

  const [cardSettings, setCardSettings] = useState<CardSettings>(() => {
    if (deck.type === ItemType.DECK) {
      return {
        cardShape: deck.cardShape,
        cardOrientation: deck.cardOrientation,
        allowedActions: deck.cardAllowedActions,
        allowedActionsForGM: deck.cardAllowedActionsForGM,
        actionButtons: deck.cardActionButtons,
        singleClickAction: deck.cardSingleClickAction,
        doubleClickAction: deck.cardDoubleClickAction,
        cardWidth: deck.cardWidth,
        cardHeight: deck.cardHeight,
        cardNamePosition: deck.cardNamePosition,
        searchFaceUp: deck.searchFaceUp ?? true,
        playTopFaceUp: deck.playTopFaceUp ?? true,
        searchWindowVisibility: deck.searchWindowVisibility,
      };
    }
    return {};
  });

  // Sprite sheet configuration state
  const [spriteConfig, setSpriteConfig] = useState<CardSpriteConfig | null>(
    deck.type === ItemType.DECK ? (deck.spriteConfig || null) : null
  );

  // Reset data when object changes
  useEffect(() => {
    setData({ ...object });
    // Initialize piles for decks
    if (object.type === ItemType.DECK) {
      const deckObj = object as Deck;
      setPiles(deckObj.piles || [
        {
          id: `${object.id}-discard`,
          name: 'Discard',
          deckId: object.id,
          position: 'right',
          cardIds: [],
          faceUp: false,
          visible: false,  // Hidden by default
          size: 1
        }
      ]);
      // Initialize card settings
      setCardSettings({
        cardShape: deckObj.cardShape,
        cardOrientation: deckObj.cardOrientation,
        allowedActions: deckObj.cardAllowedActions,
        allowedActionsForGM: deckObj.cardAllowedActionsForGM,
        actionButtons: deckObj.cardActionButtons,
        singleClickAction: deckObj.cardSingleClickAction,
        doubleClickAction: deckObj.cardDoubleClickAction,
        cardWidth: deckObj.cardWidth,
        cardHeight: deckObj.cardHeight,
        cardNamePosition: deckObj.cardNamePosition,
        searchFaceUp: deckObj.searchFaceUp ?? true,
        playTopFaceUp: deckObj.playTopFaceUp ?? true,
      });
      // Initialize sprite config
      setSpriteConfig(deckObj.spriteConfig || null);
    }
  }, [object]);

  const update = (field: string, value: any) => {
    setData(prev => ({ ...prev, [field]: value } as TableObject));
  };

  const toggleActionButton = (action: ContextAction) => {
    // Cards don't have actionButtons - only decks do
    if (isCard) return;
    const current = (data as any).actionButtons || [];
    if (current.includes(action)) {
      update('actionButtons', current.filter((a: ContextAction) => a !== action));
    } else {
      update('actionButtons', [...current, action]);
    }
  };

  // Card settings functions
  const updateCardSettings = (field: keyof CardSettings, value: any) => {
    setCardSettings(prev => {
      const updated = { ...prev, [field]: value };

      // When card shape changes to SQUARE or CIRCLE, force orientation to VERTICAL
      if (field === 'cardShape') {
        if (value === CardShape.SQUARE || value === CardShape.CIRCLE) {
          updated.cardOrientation = CardOrientation.VERTICAL;
        }
      }

      return updated;
    });
  };

  const toggleCardActionButton = (action: ContextAction) => {
    const current = cardSettings.actionButtons || [];
    if (current.includes(action)) {
      setCardSettings(prev => ({ ...prev, actionButtons: current.filter(a => a !== action) }));
    } else {
      setCardSettings(prev => ({ ...prev, actionButtons: [...current, action] }));
    }
  };

  const toggleCardAllowedAction = (action: ContextAction, forGM: boolean) => {
    const field = forGM ? 'allowedActionsForGM' : 'allowedActions';
    const current = cardSettings[field];

    if (current === undefined) {
      // Currently all allowed, switch to "all except this one"
      const allExcept = AVAILABLE_ACTIONS.filter(a => a.id !== action).map(a => a.id);
      setCardSettings(prev => ({ ...prev, [field]: allExcept }));
    } else if (current.includes(action)) {
      // Remove this action
      const updated = current.filter(a => a !== action);
      // Keep empty array as empty array (none allowed)
      setCardSettings(prev => ({ ...prev, [field]: updated }));
    } else {
      // Add this action
      const updated = [...current, action];
      setCardSettings(prev => ({ ...prev, [field]: updated }));
    }
  };

  const isCardActionAllowed = (action: ContextAction, forGM: boolean) => {
    const field = forGM ? 'allowedActionsForGM' : 'allowedActions';
    const current = cardSettings[field];
    // undefined = all allowed, [] = none allowed, specific array = only those allowed
    return current === undefined || (current.length > 0 && current.includes(action));
  };

  const handleSave = () => {
    // Helper to normalize permissions:
    // undefined = all allowed (default for new objects)
    // [] = none allowed (user explicitly disabled all)
    // specific array = only those allowed
    const allActionIds = AVAILABLE_ACTIONS.map(a => a.id);

    // For players: only convert to undefined if contains ALL actions
    let normalizedAllowedActions: ContextAction[] | undefined = (data as any).allowedActions;
    if (normalizedAllowedActions && normalizedAllowedActions.length === allActionIds.length) {
      // Check if it contains exactly all actions
      const hasAll = allActionIds.every(id => normalizedAllowedActions?.includes(id));
      if (hasAll) normalizedAllowedActions = undefined;
    }
    // Empty array stays as empty array (none allowed)

    // For GM: only convert to undefined if contains ALL actions
    let normalizedAllowedActionsForGM: ContextAction[] | undefined = (data as any).allowedActionsForGM;
    if (normalizedAllowedActionsForGM && normalizedAllowedActionsForGM.length === allActionIds.length) {
      const hasAll = allActionIds.every(id => normalizedAllowedActionsForGM?.includes(id));
      if (hasAll) normalizedAllowedActionsForGM = undefined;
    }
    // Empty array stays as empty array (none allowed)

    // Cards don't have action buttons or permissions - they inherit from deck
    const toSave: TableObject = isCard ? data : {
      ...data,
      allowedActions: normalizedAllowedActions,
      allowedActionsForGM: normalizedAllowedActionsForGM,
      ...(isDeck ? { actionButtons: (data as any).actionButtons || [] } : {})
    };
    // Add piles for decks
    if (toSave.type === ItemType.DECK) {
      (toSave as Deck).piles = piles;
      // Normalize card settings
      let normalizedCardAllowedActions: ContextAction[] | undefined = cardSettings.allowedActions;
      if (normalizedCardAllowedActions && normalizedCardAllowedActions.length === allActionIds.length) {
        const hasAll = allActionIds.every(id => normalizedCardAllowedActions?.includes(id));
        if (hasAll) normalizedCardAllowedActions = undefined;
      }

      let normalizedCardAllowedActionsForGM: ContextAction[] | undefined = cardSettings.allowedActionsForGM;
      if (normalizedCardAllowedActionsForGM && normalizedCardAllowedActionsForGM.length === allActionIds.length) {
        const hasAll = allActionIds.every(id => normalizedCardAllowedActionsForGM?.includes(id));
        if (hasAll) normalizedCardAllowedActionsForGM = undefined;
      }

      (toSave as Deck).cardShape = cardSettings.cardShape;
      (toSave as Deck).cardOrientation = cardSettings.cardOrientation;
      (toSave as Deck).cardAllowedActions = normalizedCardAllowedActions;
      (toSave as Deck).cardAllowedActionsForGM = normalizedCardAllowedActionsForGM;
      (toSave as Deck).cardActionButtons = cardSettings.actionButtons;
      (toSave as Deck).cardSingleClickAction = cardSettings.singleClickAction;
      (toSave as Deck).cardDoubleClickAction = cardSettings.doubleClickAction;
      (toSave as Deck).cardWidth = cardSettings.cardWidth;
      (toSave as Deck).cardHeight = cardSettings.cardHeight;
      (toSave as Deck).cardNamePosition = cardSettings.cardNamePosition;
      (toSave as Deck).searchFaceUp = cardSettings.searchFaceUp;
      (toSave as Deck).playTopFaceUp = cardSettings.playTopFaceUp;
      (toSave as Deck).searchWindowVisibility = cardSettings.searchWindowVisibility;
      (toSave as Deck).spriteConfig = spriteConfig || undefined;
    }
    onSave(toSave);
    onClose();
  };

  const isToken = data.type === ItemType.TOKEN;
  const isBoard = data.type === ItemType.BOARD;
  const isDeck = data.type === ItemType.DECK;
  const isCard = data.type === ItemType.CARD; // Cards don't have their own settings

  // Pile management functions
  const addPile = () => {
    const newPile: CardPile = {
      id: `${data.id}-pile-${Date.now()}`,
      name: `Pile ${piles.length + 1}`,
      deckId: data.id,
      position: 'right',
      cardIds: [],
      faceUp: false,
      visible: true,
      size: 1
    };
    setPiles([...piles, newPile]);
  };

  const updatePile = (index: number, field: keyof CardPile, value: any) => {
    const updated = [...piles];
    updated[index] = { ...updated[index], [field]: value };
    setPiles(updated);
  };

  const removePile = (index: number) => {
    setPiles(piles.filter((_, i) => i !== index));
  };

  const modalContent = (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70">
      <div className="bg-slate-800 rounded-lg shadow-xl w-[575px] border border-slate-600 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex justify-center items-center py-2 px-4 border-b border-slate-700">
          <h3 className="text-base font-bold text-white">Settings: {object.name}</h3>
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
          {!isCard && (
            <button
              onClick={() => setActiveTab('actions')}
              className={`flex-1 py-3 px-3 flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
                activeTab === 'actions'
                  ? 'bg-slate-700 text-white border-b-2 border-purple-500'
                  : 'text-gray-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Shield size={16} /> Actions
            </button>
          )}
          {isDeck && (
            <button
              onClick={() => setActiveTab('piles')}
              className={`flex-1 py-3 px-3 flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
                activeTab === 'piles'
                  ? 'bg-slate-700 text-white border-b-2 border-purple-500'
                  : 'text-gray-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Layers size={16} /> Piles
            </button>
          )}
          {isDeck && (
            <button
              onClick={() => setActiveTab('cards')}
              className={`flex-1 py-3 px-3 flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
                activeTab === 'cards'
                  ? 'bg-slate-700 text-white border-b-2 border-purple-500'
                  : 'text-gray-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Square size={16} /> Cards
            </button>
          )}
          {isDeck && (
            <button
              onClick={() => setActiveTab('sprite')}
              className={`flex-1 py-3 px-3 flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
                activeTab === 'sprite'
                  ? 'bg-slate-700 text-white border-b-2 border-purple-500'
                  : 'text-gray-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <ImageIcon size={16} /> Import
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
          {activeTab === 'general' && (
            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Name</label>
                <input
                  value={data.name}
                  onChange={e => update('name', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                />
              </div>

              {/* Size */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1">Width</label>
                  <input
                    type="number"
                    value={data.width}
                    onChange={e => update('width', Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1">Height</label>
                  <input
                    type="number"
                    value={data.height}
                    onChange={e => update('height', Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                  />
                </div>
              </div>

              {/* Rotation Step */}
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Rotation Step (degrees)</label>
                <input
                  type="number"
                  value={(data as any).rotationStep ?? 45}
                  onChange={e => update('rotationStep', Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                  min="1"
                  max="360"
                />
              </div>

              {/* Show Top Card (for decks) */}
              {isDeck && (
                <div className="flex items-center justify-between bg-slate-900 rounded px-3 py-2">
                  <label className="text-xs text-gray-400 flex items-center gap-2">
                    <Eye size={12} />
                    Show Top Card on Deck
                  </label>
                  <button
                    onClick={() => update('showTopCard', !(data as Deck).showTopCard)}
                    className={`w-10 h-5 rounded-full transition-colors ${
                      (data as Deck).showTopCard ? 'bg-green-600' : 'bg-slate-700'
                    }`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                      (data as Deck).showTopCard ? 'translate-x-5' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>
              )}

              {/* Color (for tokens) - full width for tokens only */}
              {isToken && !isBoard && (
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1">Color</label>
                  <input
                    type="color"
                    value={data.color || '#ffffff'}
                    onChange={e => update('color', e.target.value)}
                    className="w-full h-10 bg-slate-900 border border-slate-700 rounded cursor-pointer"
                  />
                </div>
              )}

              {/* Color + Image URL (for boards) - side by side, Color is smaller */}
              {isBoard && (
                <div className="grid grid-cols-[80px_1fr] gap-2">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">Color</label>
                    <input
                      type="color"
                      value={data.color || '#ffffff'}
                      onChange={e => update('color', e.target.value)}
                      className="w-full h-10 bg-slate-900 border border-slate-700 rounded cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">Background Image URL</label>
                    <input
                      value={data.content || ''}
                      onChange={e => update('content', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm h-10"
                      placeholder="https://..."
                    />
                  </div>
                </div>
              )}

              {/* Image URL (for standees) */}
              {isToken && !isBoard && (data as Token).shape === TokenShape.STANDEE && (
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1">Image URL</label>
                  <input
                    value={data.content || ''}
                    onChange={e => update('content', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                    placeholder="https://..."
                  />
                </div>
              )}

              {/* Grid Settings (for boards) */}
              {isBoard && (
                <div className="space-y-3 border-t border-slate-700 pt-4">
                  <h4 className="text-sm font-bold text-purple-400">Grid Settings</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 mb-1">Grid Type</label>
                      <select
                        value={(data as Board).gridType || GridType.NONE}
                        onChange={e => update('gridType', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                      >
                        {Object.values(GridType).map(v => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 mb-1">Grid Size (px)</label>
                      <input
                        type="number"
                        value={(data as Board).gridSize || 50}
                        onChange={e => update('gridSize', Number(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between bg-slate-900 rounded px-3 py-2">
                    <label className="text-xs text-gray-400 flex items-center gap-2">
                      <Grid3x3 size={12} />
                      Snap Objects to Grid
                    </label>
                    <button
                      onClick={() => update('snapToGrid', !(data as Board).snapToGrid)}
                      className={`w-10 h-5 rounded-full transition-colors ${
                        (data as Board).snapToGrid ? 'bg-green-600' : 'bg-slate-700'
                      }`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                        (data as Board).snapToGrid ? 'translate-x-5' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>
                </div>
              )}

              {/* Tooltip Settings */}
              <div className="space-y-3 pt-4 border-t border-slate-700">
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1">Tooltip Text</label>
                  <textarea
                    value={(data as any).tooltipText || ''}
                    onChange={e => update('tooltipText', e.target.value)}
                    placeholder="Text shown on hover..."
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm resize-none"
                    rows={5}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <label className="text-xs text-gray-400">Show Image in Tooltip</label>
                  </div>
                  <button
                    onClick={() => update('showTooltipImage', !(data as any).showTooltipImage)}
                    className={`w-10 h-5 rounded-full transition-colors ${
                      (data as any).showTooltipImage ? 'bg-green-600' : 'bg-slate-700'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 bg-white rounded-full transition-transform ${
                        (data as any).showTooltipImage ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>

                {(data as any).showTooltipImage && (
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-gray-400">Tooltip Scale</label>
                    <input
                      type="number"
                      value={(data as any).tooltipScale ?? 125}
                      onChange={e => update('tooltipScale', Number(e.target.value))}
                      className="w-20 bg-slate-900 border border-slate-700 rounded p-1 text-white text-sm text-center"
                      min="50"
                      max="300"
                      step="5"
                    />
                    <span className="text-xs text-gray-500">%</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'actions' && (
            <div className="space-y-4">
              {/* Context Menu Actions - with PL and GM toggle buttons */}
              <div>
                <h4 className="text-sm font-bold text-gray-300 mb-2 flex items-center gap-2">
                  <Shield size={14} /> Context Menu Actions
                </h4>

                <div className="grid grid-cols-2 gap-1">
                  {AVAILABLE_ACTIONS
                    .filter(action => {
                      // 'toHand' only applies to cards, not decks
                      if (action.id === 'toHand' && isDeck) return false;
                      // 'flip' only applies to cards and tokens, not decks
                      if (action.id === 'flip' && isDeck) return false;
                      return true;
                    })
                    .map((action) => {
                    const isPlayerAllowed = (data as any).allowedActions === undefined || (data as any).allowedActions.includes(action.id);
                    const isGMAllowed = (data as any).allowedActionsForGM === undefined || (data as any).allowedActionsForGM.includes(action.id);

                    const togglePlayer = () => {
                      const current = (data as any).allowedActions;
                      if (isPlayerAllowed) {
                        // Remove from player's allowed actions
                        if (current && current.includes(action.id)) {
                          const newActions = current.filter((a: ContextAction) => a !== action.id);
                          // Keep empty array as empty array (none allowed)
                          update('allowedActions', newActions);
                        } else if (current === undefined) {
                          update('allowedActions', AVAILABLE_ACTIONS.filter((a: typeof action) => a.id !== action.id).map((a: typeof action) => a.id));
                        }
                      } else {
                        // Add to player's allowed actions
                        const updated = current ? [...current, action.id] : [action.id];
                        update('allowedActions', updated);
                      }
                    };

                    const toggleGM = () => {
                      const current = (data as any).allowedActionsForGM;
                      if (isGMAllowed) {
                        // Remove from GM's allowed actions
                        if (current && current.includes(action.id)) {
                          const newActions = current.filter((a: ContextAction) => a !== action.id);
                          // Keep empty array as empty array (none allowed)
                          update('allowedActionsForGM', newActions);
                        } else if (current === undefined) {
                          update('allowedActionsForGM', AVAILABLE_ACTIONS.filter((a: typeof action) => a.id !== action.id).map((a: typeof action) => a.id));
                        }
                      } else {
                        // Add to GM's allowed actions
                        const updated = current ? [...current, action.id] : [action.id];
                        update('allowedActionsForGM', updated);
                      }
                    };

                    return (
                      <div
                        key={action.id}
                        className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-700 transition-colors bg-slate-800 border border-slate-700"
                      >
                        <span className="text-gray-200 text-xs font-medium leading-tight flex-1 truncate">{action.label}</span>
                        <button
                          onClick={togglePlayer}
                          className={`w-8 h-8 rounded text-[10px] font-bold transition-colors flex-shrink-0 ${
                            isPlayerAllowed
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-900 text-gray-400 hover:text-gray-200'
                          }`}
                          title="Player"
                        >
                          PL
                        </button>
                        <button
                          onClick={toggleGM}
                          className={`w-8 h-8 rounded text-[10px] font-bold transition-colors flex-shrink-0 ${
                            isGMAllowed
                              ? 'bg-purple-600 text-white'
                              : 'bg-slate-900 text-gray-400 hover:text-gray-200'
                          }`}
                          title="Game Master"
                        >
                          GM
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons - 2 columns, max 4 selected */}
              <div className="border-t border-slate-700 pt-4">
                <h4 className="text-sm font-bold text-gray-300 mb-2 flex items-center gap-2">
                  <Settings size={14} /> Action Buttons
                  <span className="text-xs text-gray-500 font-normal">(max 4)</span>
                </h4>

                <div className="grid grid-cols-2 gap-2">
                  {AVAILABLE_ACTIONS.map((action) => {
                    const applicableTypes = getButtonApplicableTypes(action.id);
                    const isApplicable = applicableTypes.includes(data.type);
                    if (!isApplicable) return null;

                    const isSelected = ((data as any).actionButtons || []).includes(action.id);
                    const selectedCount = ((data as any).actionButtons || []).length;
                    const isMaxReached = selectedCount >= 4 && !isSelected;

                    return (
                      <label
                        key={action.id}
                        className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors border ${
                          isSelected
                            ? 'bg-purple-600/20 border-purple-500'
                            : 'bg-slate-800 border-slate-700 hover:bg-slate-700'
                        } ${isMaxReached ? 'opacity-40 cursor-not-allowed' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={isMaxReached}
                          onChange={() => toggleActionButton(action.id)}
                          className="w-4 h-4 rounded border-gray-500 bg-slate-900 text-purple-600 focus:ring-purple-500 flex-shrink-0"
                        />
                        <span className="text-gray-200 text-xs font-medium leading-tight">{action.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Click Actions */}
              <div className="border-t border-slate-700 pt-4">
                <h4 className="text-sm font-bold text-gray-300 mb-2 flex items-center gap-2">
                  <MousePointer size={14} /> Mouse Click Actions
                </h4>

                <div className="grid grid-cols-2 gap-3">
                  {/* Single Click */}
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">Single Click</label>
                    <select
                      value={(data as any).singleClickAction || 'none'}
                      onChange={e => update('singleClickAction', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                    >
                      {CLICK_ACTIONS.map(action => (
                        <option key={action.id} value={action.id}>{action.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Double Click */}
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">Double Click</label>
                    <select
                      value={(data as any).doubleClickAction || 'none'}
                      onChange={e => update('doubleClickAction', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                    >
                      {CLICK_ACTIONS.map(action => (
                        <option key={action.id} value={action.id}>{action.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'piles' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-bold text-gray-300 flex items-center gap-2">
                  <Layers size={14} /> Card Piles
                </h4>
                <button
                  onClick={addPile}
                  className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  <Plus size={14} /> Add Pile
                </button>
              </div>

              {piles.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">
                  No piles configured. Click "Add Pile" to create one.
                </div>
              ) : (
                <div className="space-y-3">
                  {piles.map((pile, index) => (
                    <div key={pile.id} className="bg-slate-800 border border-slate-700 rounded-lg p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <input
                          type="text"
                          value={pile.name}
                          onChange={(e) => updatePile(index, 'name', e.target.value)}
                          className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white text-sm font-medium flex-1 mr-2"
                          placeholder="Pile name"
                        />
                        <button
                          onClick={() => removePile(index)}
                          className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition-colors"
                          title="Remove pile"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        {/* Visible toggle */}
                        <div className="flex items-center justify-between bg-slate-900 rounded px-3 py-2">
                          <label className="text-xs text-gray-400">Visible</label>
                          <button
                            onClick={() => updatePile(index, 'visible', !pile.visible)}
                            className={`w-10 h-5 rounded-full transition-colors ${
                              pile.visible ? 'bg-green-600' : 'bg-slate-700'
                            }`}
                          >
                            <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                              pile.visible ? 'translate-x-5' : 'translate-x-0.5'
                            }`} />
                          </button>
                        </div>

                        {/* Face Up toggle */}
                        <div className="flex items-center justify-between bg-slate-900 rounded px-3 py-2">
                          <label className="text-xs text-gray-400">Face Up</label>
                          <button
                            onClick={() => updatePile(index, 'faceUp', !pile.faceUp)}
                            className={`w-10 h-5 rounded-full transition-colors ${
                              pile.faceUp ? 'bg-green-600' : 'bg-slate-700'
                            }`}
                          >
                            <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                              pile.faceUp ? 'translate-x-5' : 'translate-x-0.5'
                            }`} />
                          </button>
                        </div>
                      </div>

                      {/* Size dropdown */}
                      <div>
                        <label className="block text-xs font-bold text-gray-400 mb-1">Size</label>
                        <select
                          value={pile.size ?? 1}
                          onChange={(e) => updatePile(index, 'size', Number(e.target.value) as PileSize)}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm"
                        >
                          <option value={1}>Full size</option>
                          <option value={0.5}>Half size</option>
                        </select>
                      </div>

                      {/* Position dropdown */}
                      <div>
                        <label className="block text-xs font-bold text-gray-400 mb-1">Position</label>
                        <select
                          value={pile.position}
                          onChange={(e) => updatePile(index, 'position', e.target.value as PilePosition)}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm"
                        >
                          <option value="left">Left of deck</option>
                          <option value="right">Right of deck</option>
                          <option value="top">Above deck</option>
                          <option value="bottom">Below deck</option>
                          <option value="free">Free position</option>
                        </select>
                      </div>

                      {/* Free position coordinates */}
                      {pile.position === 'free' && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-bold text-gray-400 mb-1">X Position</label>
                            <input
                              type="number"
                              value={pile.x ?? 0}
                              onChange={(e) => updatePile(index, 'x', Number(e.target.value))}
                              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-gray-400 mb-1">Y Position</label>
                            <input
                              type="number"
                              value={pile.y ?? 0}
                              onChange={(e) => updatePile(index, 'y', Number(e.target.value))}
                              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm"
                            />
                          </div>
                        </div>
                      )}

                      {/* Mill Pile toggle */}
                      <div className="flex items-center justify-between bg-slate-900 rounded px-3 py-2">
                        <label className="text-xs text-gray-400 flex items-center gap-2">
                          <Trash2 size={12} />
                          Mill Pile
                        </label>
                        <button
                          onClick={() => updatePile(index, 'isMillPile', !pile.isMillPile)}
                          className={`w-10 h-5 rounded-full transition-colors ${
                            pile.isMillPile ? 'bg-red-600' : 'bg-slate-700'
                          }`}
                        >
                          <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                            pile.isMillPile ? 'translate-x-5' : 'translate-x-0.5'
                          }`} />
                        </button>
                      </div>

                      {/* Show Top Card toggle */}
                      <div className="flex items-center justify-between bg-slate-900 rounded px-3 py-2">
                        <label className="text-xs text-gray-400 flex items-center gap-2">
                          <Eye size={12} />
                          Show Top Card
                        </label>
                        <button
                          onClick={() => updatePile(index, 'showTopCard', !pile.showTopCard)}
                          className={`w-10 h-5 rounded-full transition-colors ${
                            pile.showTopCard ? 'bg-green-600' : 'bg-slate-700'
                          }`}
                        >
                          <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                            pile.showTopCard ? 'translate-x-5' : 'translate-x-0.5'
                          }`} />
                        </button>
                      </div>

                      {/* Cards count indicator */}
                      <div className="text-xs text-gray-500 text-center">
                        {pile.cardIds.length} card{pile.cardIds.length !== 1 ? 's' : ''} in this pile
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'cards' && (
            <div className="space-y-4">
              {/* Basic Settings - Card dimensions and name position */}
              <div>
                <h4 className="text-sm font-bold text-gray-300 mb-3 flex items-center gap-2">
                  <Square size={14} /> Basic Settings
                </h4>

                <div className="grid grid-cols-2 gap-3 mb-2">
                  {/* Card Shape */}
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">Card Shape</label>
                    <select
                      value={cardSettings.cardShape ?? CardShape.POKER}
                      onChange={(e) => updateCardSettings('cardShape', e.target.value as CardShape)}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                    >
                      {Object.keys(CardShape).map(key => (
                        <option key={key} value={key}>{key}</option>
                      ))}
                    </select>
                  </div>

                  {/* Card Orientation - disabled for SQUARE and CIRCLE shapes */}
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">Card Orientation</label>
                    <select
                      value={cardSettings.cardOrientation ?? CardOrientation.VERTICAL}
                      onChange={(e) => updateCardSettings('cardOrientation', e.target.value as CardOrientation)}
                      disabled={cardSettings.cardShape === CardShape.SQUARE || cardSettings.cardShape === CardShape.CIRCLE}
                      className={`w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm ${
                        cardSettings.cardShape === CardShape.SQUARE || cardSettings.cardShape === CardShape.CIRCLE
                          ? 'opacity-50 cursor-not-allowed'
                          : ''
                      }`}
                    >
                      <option value={CardOrientation.VERTICAL}>Vertical</option>
                      <option value={CardOrientation.HORIZONTAL}>Horizontal</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-2">
                  {/* Card Width */}
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">Card Width (px)</label>
                    <input
                      type="number"
                      value={cardSettings.cardWidth ?? deck.width}
                      onChange={(e) => updateCardSettings('cardWidth', e.target.value ? parseInt(e.target.value) : undefined)}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                      placeholder="Default"
                    />
                  </div>

                  {/* Card Height */}
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">Card Height (px)</label>
                    <input
                      type="number"
                      value={cardSettings.cardHeight ?? deck.height}
                      onChange={(e) => updateCardSettings('cardHeight', e.target.value ? parseInt(e.target.value) : undefined)}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                      placeholder="Default"
                    />
                  </div>
                </div>

                {/* Search Window and Play Top Card Settings */}
                <div className="grid grid-cols-2 gap-3 mb-2">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">In Search Window (Players)</label>
                    <select
                      value={cardSettings.searchWindowVisibility ?? SearchWindowVisibility.FACE_UP}
                      onChange={(e) => updateCardSettings('searchWindowVisibility', e.target.value as SearchWindowVisibility)}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                    >
                      <option value={SearchWindowVisibility.FACE_UP}>Face Up</option>
                      <option value={SearchWindowVisibility.FACE_DOWN}>Face Down</option>
                      <option value={SearchWindowVisibility.AS_GM}>As GM Sees</option>
                      <option value={SearchWindowVisibility.LAST_STATE}>Last State (per player)</option>
                      <option value={SearchWindowVisibility.SHARED_DECK}>Shared Deck (all players)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">Play Top Card</label>
                    <select
                      value={(cardSettings.playTopFaceUp ?? true) ? 'faceUp' : 'faceDown'}
                      onChange={(e) => updateCardSettings('playTopFaceUp', e.target.value === 'faceUp')}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                    >
                      <option value="faceUp">Face Up</option>
                      <option value="faceDown">Face Down</option>
                    </select>
                  </div>
                </div>

                {/* Card Name Position */}
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1">Show Card Name</label>
                  <select
                    value={cardSettings.cardNamePosition ?? 'bottom'}
                    onChange={(e) => updateCardSettings('cardNamePosition', e.target.value as CardNamePosition)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                  >
                    <option value="bottom">Bottom</option>
                    <option value="top">Top</option>
                    <option value="none">None</option>
                  </select>
                </div>
              </div>

              <div className="border-t border-slate-700 pt-4">
              {/* Context Menu Actions - with PL and GM toggle buttons */}
              <div>
                <h4 className="text-sm font-bold text-gray-300 mb-2 flex items-center gap-2">
                  <Shield size={14} /> Context Menu Actions for Cards
                </h4>

                <div className="grid grid-cols-2 gap-1">
                  {AVAILABLE_ACTIONS
                    .filter(action => {
                      // Only show card-applicable actions
                      if (action.id === 'draw' || action.id === 'playTopCard' ||
                          action.id === 'shuffleDeck' || action.id === 'searchDeck' ||
                          action.id === 'topDeck' || action.id === 'returnAll' || action.id === 'piles') return false;
                      return true;
                    })
                    .map((action) => {
                    const isPlayerAllowed = isCardActionAllowed(action.id, false);
                    const isGMAllowed = isCardActionAllowed(action.id, true);

                    return (
                      <div
                        key={`card-${action.id}`}
                        className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-700 transition-colors bg-slate-800 border border-slate-700"
                      >
                        <span className="text-gray-200 text-xs font-medium leading-tight flex-1 truncate">{action.label}</span>
                        <button
                          onClick={() => toggleCardAllowedAction(action.id, false)}
                          className={`w-8 h-8 rounded text-[10px] font-bold transition-colors flex-shrink-0 ${
                            isPlayerAllowed
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-900 text-gray-400 hover:text-gray-200'
                          }`}
                          title="Player"
                        >
                          PL
                        </button>
                        <button
                          onClick={() => toggleCardAllowedAction(action.id, true)}
                          className={`w-8 h-8 rounded text-[10px] font-bold transition-colors flex-shrink-0 ${
                            isGMAllowed
                              ? 'bg-purple-600 text-white'
                              : 'bg-slate-900 text-gray-400 hover:text-gray-200'
                          }`}
                          title="Game Master"
                        >
                          GM
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons - 2 columns, max 4 selected */}
              <div className="border-t border-slate-700 pt-4">
                <h4 className="text-sm font-bold text-gray-300 mb-2 flex items-center gap-2">
                  <Settings size={14} /> Action Buttons for Cards
                  <span className="text-xs text-gray-500 font-normal">(max 4)</span>
                </h4>

                <div className="grid grid-cols-2 gap-2">
                  {AVAILABLE_ACTIONS
                    .filter(action => {
                      // Only card-applicable actions
                      if (action.id === 'draw' || action.id === 'playTopCard' ||
                          action.id === 'shuffleDeck' || action.id === 'searchDeck' ||
                          action.id === 'topDeck' || action.id === 'returnAll' || action.id === 'delete' || action.id === 'piles') return false;
                      return true;
                    })
                    .map((action) => {
                    const isSelected = (cardSettings.actionButtons || []).includes(action.id);
                    const selectedCount = (cardSettings.actionButtons || []).length;
                    const isMaxReached = selectedCount >= 4 && !isSelected;

                    return (
                      <label
                        key={`card-btn-${action.id}`}
                        className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors border ${
                          isSelected
                            ? 'bg-purple-600/20 border-purple-500'
                            : 'bg-slate-800 border-slate-700 hover:bg-slate-700'
                        } ${isMaxReached ? 'opacity-40 cursor-not-allowed' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={isMaxReached}
                          onChange={() => toggleCardActionButton(action.id)}
                          className="w-4 h-4 rounded border-gray-500 bg-slate-900 text-purple-600 focus:ring-purple-500 flex-shrink-0"
                        />
                        <span className="text-gray-200 text-xs font-medium leading-tight">{action.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Click Actions */}
              <div className="border-t border-slate-700 pt-4">
                <h4 className="text-sm font-bold text-gray-300 mb-2 flex items-center gap-2">
                  <MousePointer size={14} /> Mouse Click Actions for Cards
                </h4>

                <div className="grid grid-cols-2 gap-3">
                  {/* Single Click */}
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">Single Click</label>
                    <select
                      value={cardSettings.singleClickAction || 'none'}
                      onChange={(e) => updateCardSettings('singleClickAction', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                    >
                      {CLICK_ACTIONS.map(action => (
                        <option key={action.id} value={action.id}>{action.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Double Click */}
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">Double Click</label>
                    <select
                      value={cardSettings.doubleClickAction || 'none'}
                      onChange={(e) => updateCardSettings('doubleClickAction', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                    >
                      {CLICK_ACTIONS.map(action => (
                        <option key={action.id} value={action.id}>{action.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              </div>
            </div>
          )}

          {activeTab === 'sprite' && (
            <div className="space-y-4">
              <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-3 mb-4">
                <p className="text-xs text-blue-200">
                  <strong>Sprite Import:</strong> Load cards from a single image. The image will be divided into equal parts based on the grid you specify.
                </p>
              </div>

              {/* Sprite Sheet URL */}
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Sprite Sheet URL</label>
                <input
                  type="text"
                  value={spriteConfig?.spriteUrl || ''}
                  onChange={(e) => setSpriteConfig(prev => ({ ...prev, spriteUrl: e.target.value, cardBackUrl: prev?.cardBackUrl || '', columns: prev?.columns || 1, rows: prev?.rows || 1, totalCards: prev?.totalCards }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                  placeholder="https://example.com/cards.png"
                />
                {spriteConfig?.spriteUrl && (
                  <div className="mt-2 bg-slate-900 rounded p-2 border border-slate-700">
                    <img
                      src={spriteConfig.spriteUrl}
                      alt="Sprite sheet preview"
                      className="max-w-full max-h-48 mx-auto"
                      onError={(e) => { e.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22%3E%3Crect fill=%22%23334155%22 width=%22100%22 height=%22100%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 fill=%22%2394a3b8%22 dy=%22.3em%22%3EImage not found%3C/text%3E%3C/svg%3E'; }}
                    />
                  </div>
                )}
              </div>

              {/* Card Back URL */}
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Card Back URL (Rubashka)</label>
                <input
                  type="text"
                  value={spriteConfig?.cardBackUrl || ''}
                  onChange={(e) => setSpriteConfig(prev => ({ ...prev, cardBackUrl: e.target.value, spriteUrl: prev?.spriteUrl || '', columns: prev?.columns || 1, rows: prev?.rows || 1, totalCards: prev?.totalCards }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                  placeholder="https://example.com/card-back.png"
                />
                {spriteConfig?.cardBackUrl && (
                  <div className="mt-2 bg-slate-900 rounded p-2 border border-slate-700 flex justify-center">
                    <img
                      src={spriteConfig.cardBackUrl}
                      alt="Card back preview"
                      className="max-w-24 max-h-32"
                      onError={(e) => { e.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2250%22 height=%2275%22%3E%3Crect fill=%22%231e293b%22 width=%2250%22 height=%2275%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 fill=%22%2364748b%22 dy=%22.3em%22 font-size=%2210%22%3EN/A%3C/text%3E%3C/svg%3E'; }}
                    />
                  </div>
                )}
              </div>

              {/* Grid Settings */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1">Columns (cards per row)</label>
                  <input
                    type="number"
                    min="1"
                    value={spriteConfig?.columns || 1}
                    onChange={(e) => setSpriteConfig(prev => ({ ...prev, columns: Math.max(1, parseInt(e.target.value) || 1), spriteUrl: prev?.spriteUrl || '', cardBackUrl: prev?.cardBackUrl || '', rows: prev?.rows || 1, totalCards: prev?.totalCards }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1">Rows</label>
                  <input
                    type="number"
                    min="1"
                    value={spriteConfig?.rows || 1}
                    onChange={(e) => setSpriteConfig(prev => ({ ...prev, rows: Math.max(1, parseInt(e.target.value) || 1), spriteUrl: prev?.spriteUrl || '', cardBackUrl: prev?.cardBackUrl || '', columns: prev?.columns || 1, totalCards: prev?.totalCards }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                  />
                </div>
              </div>

              {/* Total Cards (optional) */}
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Total Cards (optional)</label>
                <input
                  type="number"
                  min="1"
                  value={spriteConfig?.totalCards || (spriteConfig?.columns && spriteConfig?.rows ? spriteConfig.columns * spriteConfig.rows : '')}
                  onChange={(e) => setSpriteConfig(prev => ({ ...prev, totalCards: e.target.value ? parseInt(e.target.value) : undefined, spriteUrl: prev?.spriteUrl || '', cardBackUrl: prev?.cardBackUrl || '', columns: prev?.columns || 1, rows: prev?.rows || 1 }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                  placeholder={`Auto: ${spriteConfig?.columns && spriteConfig?.rows ? spriteConfig.columns * spriteConfig.rows : 'N/A'}`}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Leave empty to use all cards from the grid ({spriteConfig?.columns && spriteConfig?.rows ? spriteConfig.columns * spriteConfig.rows : 0} cards)
                </p>
              </div>

              {/* Preview Grid */}
              {spriteConfig?.columns && spriteConfig?.rows && spriteConfig?.spriteUrl && (
                <div className="border-t border-slate-700 pt-4">
                  <h4 className="text-sm font-bold text-gray-300 mb-3">Grid Preview</h4>
                  <div
                    className="bg-slate-900 rounded p-2 border border-slate-700 overflow-auto"
                    style={{ maxHeight: '200px' }}
                  >
                    <div
                      className="grid gap-0.5 mx-auto"
                      style={{
                        gridTemplateColumns: `repeat(${spriteConfig.columns}, minmax(0, 1fr))`,
                        width: 'fit-content'
                      }}
                    >
                      {Array.from({ length: spriteConfig.totalCards || (spriteConfig.columns * spriteConfig.rows) }).map((_, index) => {
                        const row = Math.floor(index / spriteConfig.columns);
                        const col = index % spriteConfig.columns;
                        return (
                          <div
                            key={index}
                            className="aspect-square bg-slate-800 border border-slate-600 rounded overflow-hidden relative group"
                            style={{ width: '40px' }}
                          >
                            <img
                              src={spriteConfig.spriteUrl}
                              alt={`Card ${index + 1}`}
                              className="w-full h-full object-cover"
                              style={{
                                imageRendering: 'pixelated',
                                width: `${spriteConfig.columns * 40}px`,
                                height: `${spriteConfig.rows * 40}px`,
                                marginLeft: `-${col * 40}px`,
                                marginTop: `-${row * 40}px`,
                                maxWidth: 'none',
                              }}
                            />
                            <span className="absolute bottom-0 right-0 bg-black/70 text-white text-[8px] px-0.5 rounded-tl">
                              {index + 1}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Generate Cards Button */}
              {spriteConfig?.spriteUrl && spriteConfig.columns > 0 && spriteConfig.rows > 0 && (
                <div className="border-t border-slate-700 pt-4">
                  <button
                    onClick={() => {
                      // This will be handled by the parent component via onSave
                      // The card generation will happen in the reducer
                      (data as Deck).spriteConfig = spriteConfig;
                      onSave(data);
                      onClose();
                    }}
                    className="w-full py-3 bg-green-600 hover:bg-green-500 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <Plus size={16} /> Generate Cards from Sprite
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-slate-700">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-300 hover:bg-slate-700 rounded">Cancel</button>
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
