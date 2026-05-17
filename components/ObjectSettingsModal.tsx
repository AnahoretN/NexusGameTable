import { t as translate, Locale } from '../utils/translations';
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { TableObject, ItemType, Token, TokenType, Deck, Card, DiceObject, Counter, TokenShape, GridType, CardShape, CardOrientation, ContextAction, CardPile, PilePosition, PileSize, ClickAction, CardNamePosition, SearchWindowVisibility, Board, CardSpriteConfig, Drawing, AppLanguage, BattlefieldCell, DiceGroup, EffectTemplate, TokenState, TokenSlider, TokenSliderPosition } from '../types';

import { Check, Settings, Shield, MousePointer, Trash2, Square, RotateCw, RotateCcw, Eye, Grid3x3, Image as ImageIcon, Dices, Maximize2, Link, Unlink, Layers, Plus, FileText, Palette, Smile, Target, Minimize, Upload, Loader2, Sparkles, Hash } from 'lucide-react';
import { FilePickerInput } from './FilePickerInput';
import { DiceValuesSettings } from './DiceValuesSettings';
import { calculateHexHeight, calculateFlatHexHeight, clearBoardCellCache } from '../utils/gridUtils';
import { CARD_SHAPE_DIMS } from '../constants';
import { loadImageFromFile, analyzeImageForGridSmart, createDebugPreview, DetectedCell, GridAnalysisOptions } from '../utils/imageGridAnalyzer';
import { generateUUID } from '../utils/uuid';
import { useImageUrl } from '../hooks';

// Hex grid constants
const HEX_RATIO = 1.15;
const DEFAULT_HEX_WIDTH = 100;  // Pointy-top default width
const DEFAULT_FLAT_HEX_WIDTH = 115;  // Flat-top default width

interface ObjectSettingsModalProps {
  object: TableObject;
  onSave: (obj: TableObject) => void;
  onClose: () => void;
  allObjects?: Record<string, TableObject>; // All objects in the game
  language?: AppLanguage; // Language for translations
  diceGroups?: DiceGroup[]; // Dice groups for grouping dice
  dispatch?: React.Dispatch<any>; // Dispatch function for updating groups
  zIndex?: string; // Custom z-index for modal (default: z-[100005])
}

// Translate GridType value to display name
function translateGridType(gridType: GridType, language: AppLanguage = 'en'): string {
  // Convert uppercase enum values to title case for translation lookup
  const lookupKey: Record<typeof gridType, string> = {
    [GridType.NONE]: 'None',
    [GridType.SQUARE]: 'Square',
    [GridType.HEX]: 'Hex',
    [GridType.HEX_HORIZONTAL]: 'Hex (Horizontal)',
    [GridType.CUSTOM]: 'Custom (from Image)'
  };
  return translate(lookupKey[gridType], language as Locale);
}

// Get available actions with translated labels
// General actions available for ALL object types (tokens, cards, decks, etc.)
function getAvailableActions(language: AppLanguage = 'en'): { id: ContextAction; label: string }[] {
  return [
    { id: 'clone', label: translate('Clone Object', language as Locale) },
    { id: 'delete', label: translate('Delete Object', language as Locale) },
    { id: 'flip', label: translate('Flip', language as Locale) },
    { id: 'states', label: translate('States (section)', language as Locale) },
    { id: 'hide', label: translate('Hide/Show', language as Locale) },
    { id: 'lock', label: translate('Lock/Unlock', language as Locale) },
    { id: 'pin', label: translate('Pin/Unpin', language as Locale) },
    { id: 'layerUp', label: translate('Layer Up', language as Locale) },
    { id: 'layerDown', label: translate('Layer Down', language as Locale) },
    { id: 'bringToFront', label: translate('To Top', language as Locale) },
    { id: 'sendToBack', label: translate('To Bottom', language as Locale) },
    { id: 'layer', label: translate('Change Layer (section)', language as Locale) },
    { id: 'rotate', label: translate('Rotation (section)', language as Locale) },
    { id: 'rotateClockwise', label: translate('Rotation CW', language as Locale) },
    { id: 'rotateCounterClockwise', label: translate('Rotation CCW', language as Locale) },
    { id: 'swingClockwise', label: translate('Swing CW', language as Locale) },
    { id: 'swingCounterClockwise', label: translate('Swing CCW', language as Locale) },
  ];
}

// Deck-specific actions (ONLY for decks, NOT for tokens, cards, etc.)
// Ordered to match the deck context menu structure
function getDeckActions(language: AppLanguage = 'en'): { id: ContextAction; label: string }[] {
  return [
    // Top Deck section
    { id: 'topDeck', label: translate('Top Deck (section)', language as Locale) },
    // Individual actions within Top Deck submenu (controlled by parent section)
    { id: 'draw', label: translate('Draw Card', language as Locale) },
    { id: 'playTopCard', label: translate('Play Top', language as Locale) },
    { id: 'millTopCard', label: translate('Mill', language as Locale) },
    { id: 'toBottom', label: translate('Top to Bottom', language as Locale) },
    { id: 'showTop', label: translate('Show Top', language as Locale) },
    { id: 'hideTop', label: translate('Hide Top', language as Locale) },
    // Main deck actions
    { id: 'searchDeck', label: translate('Search', language as Locale) },
    { id: 'shuffleDeck', label: translate('Shuffle', language as Locale) },
    // Piles section
    { id: 'piles', label: translate('Piles (section)', language as Locale) },
    // Return section
    { id: 'returnAll', label: translate('Return... (section)', language as Locale) },
    { id: 'returnAllAndShuffle', label: translate('Return All and Shuffle', language as Locale) },
    { id: 'returnAllExceptHands', label: translate('Return All Except Hands', language as Locale) },
  ];
}

// Full context menu actions for decks in the correct order
function getDeckContextMenuActions(language: AppLanguage = 'en'): { id: ContextAction; label: string }[] {
  return [
    // Top Deck section
    { id: 'topDeck', label: translate('Top Deck (section)', language as Locale) },
    // Search and Shuffle
    { id: 'searchDeck', label: translate('Search', language as Locale) },
    { id: 'shuffleDeck', label: translate('Shuffle', language as Locale) },
    // Piles section
    { id: 'piles', label: translate('Piles (section)', language as Locale) },
    // Return section
    { id: 'returnAll', label: translate('Return... (section)', language as Locale) },
    // Change Layer section
    { id: 'layer', label: translate('Change Layer (section)', language as Locale) },
    // Rotation section
    { id: 'rotate', label: translate('Rotation (section)', language as Locale) },
    // Object management actions
    { id: 'hide', label: translate('Show/Hide', language as Locale) },
    { id: 'lock', label: translate('Lock/Unlock', language as Locale) },
    { id: 'pin', label: translate('Pin/Unpin', language as Locale) },
    { id: 'clone', label: translate('Clone Object', language as Locale) },
    { id: 'delete', label: translate('Delete Object', language as Locale) },
  ];
}

// Get move to actions with translated labels
function getMoveToActions(language: AppLanguage = 'en'): { id: ContextAction; label: string }[] {
  return [
    { id: 'moveTo', label: translate('Move to... (section)', language as Locale) },
    { id: 'moveToHand', label: translate('Move to Hand', language as Locale) },
    { id: 'moveToTopDeck', label: translate('Move to Top Deck', language as Locale) },
    { id: 'moveToBottomDeck', label: translate('Move to Bottom Deck', language as Locale) },
    { id: 'moveToDiscard', label: translate('Mill', language as Locale) },
  ];
}

// Actions that should NOT appear as quick action buttons (only in context menu)
// Submenu actions are excluded since they depend on their parent section (layer/rotate)
const EXCLUDED_FROM_BUTTONS: ContextAction[] = ['layer', 'rotate', 'moveToHand', 'moveToTopDeck', 'moveToBottomDeck', 'moveToDiscard', 'states'];

// Check if an action can be shown as an action button
function isActionButtonAllowed(action: ContextAction): boolean {
  return !EXCLUDED_FROM_BUTTONS.includes(action);
}

// Helper to determine which actions are available as buttons for which object types
function getButtonApplicableTypes(action: ContextAction): ItemType[] {
  // Exclude actions that should only be in context menu
  if (!isActionButtonAllowed(action)) return [];

  switch (action) {
    // "Move to" actions for cards
    case 'moveToHand':
    case 'moveToTopDeck':
    case 'moveToBottomDeck':
    case 'moveToDiscard':
      return [ItemType.CARD];
    // Rotation and swing actions for tokens, cards, counters, dice objects, boards, and decks
    case 'rotateClockwise':
    case 'rotateCounterClockwise':
    case 'swingClockwise':
    case 'swingCounterClockwise':
      return [ItemType.TOKEN, ItemType.CARD, ItemType.COUNTER, ItemType.DICE_OBJECT, ItemType.BOARD, ItemType.DECK];
    // Deck-specific actions for decks only
    case 'shuffleDeck':
    case 'searchDeck':
    case 'draw':
    case 'playTopCard':
    case 'millTopCard':
    case 'toBottom':
    case 'showTop':
      return [ItemType.DECK];
    // Layer actions for all types except cards in card settings
    case 'layerUp':
    case 'layerDown':
      return [ItemType.DECK, ItemType.TOKEN, ItemType.COUNTER, ItemType.DICE_OBJECT, ItemType.BOARD];
    case 'bringToFront':
    case 'sendToBack':
      return [ItemType.DECK, ItemType.TOKEN, ItemType.CARD, ItemType.COUNTER, ItemType.DICE_OBJECT, ItemType.BOARD];
    // Lock/Unlock for decks, tokens, counters, dice objects, and boards
    case 'lock':
      return [ItemType.DECK, ItemType.TOKEN, ItemType.COUNTER, ItemType.DICE_OBJECT, ItemType.BOARD];
    // Pin/Unpin for tokens, cards, and decks
    case 'pin':
    case 'pinToViewport':
      return [ItemType.TOKEN, ItemType.CARD, ItemType.DECK];
    // Clone and delete actions for tokens, cards, counters, dice objects, and boards
    case 'clone':
    case 'delete':
      return [ItemType.TOKEN, ItemType.CARD, ItemType.COUNTER, ItemType.DICE_OBJECT, ItemType.BOARD];
    // Hide/Show action for all object types (except cards in card settings)
    case 'hide':
      return [ItemType.TOKEN, ItemType.CARD, ItemType.COUNTER, ItemType.DICE_OBJECT, ItemType.BOARD, ItemType.DECK];
    // Token State actions - only for tokens and token types
    case 'toggleState1':
    case 'nextState':
    case 'previousState':
      return [ItemType.TOKEN, ItemType.TOKEN_TYPE];
    default:
      return [];
  }
}

type Tab = 'general' | 'values' | 'actions' | 'piles' | 'cards' | 'sprite' | 'textCards' | 'groups' | 'states' | 'counters';

const ObjectSettingsModalComponent: React.FC<ObjectSettingsModalProps> = ({ object, onSave, onClose, allObjects = {}, language = 'en', diceGroups = [], dispatch, zIndex }) => {
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [data, setData] = useState<TableObject>({ ...object });

  // Sync data state with object prop when it changes
  React.useEffect(() => {
    setData({ ...object });
  }, [object]);

  // Grid generation from image state
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [gridGenPreview, setGridGenPreview] = useState<string | null>(null);
  const [detectedCells, setDetectedCells] = useState<DetectedCell[]>([]);
  const [gridDebugInfo, setGridDebugInfo] = useState<{ hLines: number; vLines: number } | null>(null);

  // Custom grid unlock state (triple 'i' press within 2 seconds to unlock)
  const [customGridUnlocked, setCustomGridUnlocked] = useState(false);
  const [iPressCount, setIPressCount] = useState(0);
  const iPressTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Translation helper for inline translation objects
  const t = (key: { en: string; ru?: string; be?: string; uk?: string; sr?: string }): string => {
    return key[language] || key.en;
  };

  // Helper function to update pivot while keeping rotation marker at the same world position
  // This mimics the behavior of dragging the pivot marker in EffectTemplateRenderer
  const updatePivotWithMarkerDistance = (newPivot: { x: number; y: number }) => {
    if ((object as EffectTemplate).type !== ItemType.EFFECT_TEMPLATE) {
      update('pivot', newPivot);
      return;
    }

    const effectData = object as EffectTemplate;
    const currentPivot = effectData.pivot || { x: 50, y: 50 };
    const rotation = effectData.rotation ?? 0;
    const width = effectData.width ?? 100;
    const height = effectData.height ?? 100;
    const currentMarkerDistance = effectData.rotationMarkerDistance ?? height;

    // Calculate current rotation marker world position (before pivot change)
    const angleRad = ((rotation - 90) * Math.PI) / 180;
    const currentPivotPixelX = (currentPivot.x / 100) * width;
    const currentPivotPixelY = (currentPivot.y / 100) * height;
    const currentMarkerPixelX = currentPivotPixelX + currentMarkerDistance * Math.cos(angleRad);
    const currentMarkerPixelY = currentPivotPixelY + currentMarkerDistance * Math.sin(angleRad);

    // Convert to world coordinates (obj position + pixel offset)
    const markerWorldX = effectData.x + currentMarkerPixelX;
    const markerWorldY = effectData.y + currentMarkerPixelY;

    // Calculate new pivot position in world coordinates
    const newPivotPixelX = (newPivot.x / 100) * width;
    const newPivotPixelY = (newPivot.y / 100) * height;
    const newPivotWorldX = effectData.x + newPivotPixelX;
    const newPivotWorldY = effectData.y + newPivotPixelY;

    // Vector from NEW pivot to rotation marker (in world coordinates)
    const toMarkerX = markerWorldX - newPivotWorldX;
    const toMarkerY = markerWorldY - newPivotWorldY;

    // Direction from pivot towards rotation marker (same angle as used in EffectTemplateRenderer)
    const dirAngleRad = ((rotation - 90) * Math.PI) / 180;
    const dirX = Math.cos(dirAngleRad);
    const dirY = Math.sin(dirAngleRad);

    // Project vector onto direction to get the new distance
    // This gives us the distance from new pivot to rotation marker along the rotation direction
    const newMarkerDistance = toMarkerX * dirX + toMarkerY * dirY;

    // Clamp to reasonable range
    const clampedDistance = Math.max(5, Math.min(500, newMarkerDistance));

    // Update both pivot and rotationMarkerDistance
    updateMultiple({
      pivot: newPivot,
      rotationMarkerDistance: clampedDistance
    });
  };

  // Proportional resize states - initialize from object data, default to true
  const getInitialLinkState = (value?: boolean) => value !== undefined ? value : true;
  const [linkObjectSize, setLinkObjectSize] = useState(getInitialLinkState((object as any).linkObjectSize));
  const [linkGridSize, setLinkGridSize] = useState(getInitialLinkState((object as any).linkGridSize));
  const [linkCardSize, setLinkCardSize] = useState(getInitialLinkState((object as any).linkCardSize));
  const [objectRatio, setObjectRatio] = useState(1);
  const [cardRatio, setCardRatio] = useState(1);

  // Round to hundredths for display
  const roundToHundredths = (val: number | undefined) => val === undefined ? undefined : Math.round(val * 100) / 100;

  // Translation helper

  // Get translated action labels - IMPORTANT: These are separate for different object types!
  // Action settings for different object types are INDEPENDENT from each other
  const AVAILABLE_ACTIONS = getAvailableActions(language);
  const DECK_ACTIONS = getDeckActions(language);
  const DECK_CONTEXT_MENU_ACTIONS = getDeckContextMenuActions(language);
  const MOVE_TO_ACTIONS = getMoveToActions(language);
  // Exclude section headers from click actions (note: showTop is NOT a section, it's a concrete action)
  // Note: rotateClockwise, rotateCounterClockwise, swingClockwise, swingCounterClockwise are NOT in SECTION_ACTIONS
  // because they should be available in Double Click Action and Action Buttons, just NOT in Context Menu Actions
  const SECTION_ACTIONS: ContextAction[] = ['layer', 'rotate', 'topDeck', 'piles', 'moveTo', 'returnAll', 'states'];
  // Token State actions (ONLY for Action Buttons, NOT in Context Menu)
  const TOKEN_STATE_ACTIONS = [
    { id: 'toggleState1' as const, label: translate('State 1/Default', language as Locale) },
    { id: 'nextState' as const, label: translate('Next State', language as Locale) },
    { id: 'previousState' as const, label: translate('Previous State', language as Locale) },
  ];
  const CLICK_ACTIONS = [
    { id: 'none' as const, label: translate('None', language as Locale) },
    ...AVAILABLE_ACTIONS.filter(a => !SECTION_ACTIONS.includes(a.id)).map(a => ({ id: a.id, label: a.label })),
    ...TOKEN_STATE_ACTIONS
  ];
  const CARD_CLICK_ACTIONS: { id: ClickAction; label: string }[] = [
    { id: 'none' as const, label: translate('None', language as Locale) },
    { id: 'showTooltipImage' as const, label: translate('Card Tooltip Image', language as Locale) },
    ...[...AVAILABLE_ACTIONS, ...MOVE_TO_ACTIONS].map(a => ({ id: a.id, label: a.label }))
      .filter(action => {
        // Exclude deck-specific and section actions
        if (action.id === 'show' || action.id === 'hide' ||
            action.id === 'shuffleDeck' || action.id === 'searchDeck' || action.id === 'topDeck' ||
            action.id === 'returnAll' || action.id === 'delete' || action.id === 'piles' ||
            action.id === 'rotate' || action.id === 'layer') {
          return false;
        }
        // Exclude section headers
        if (action.id === 'moveTo') return false;
        // Exclude pin action from card double click actions
        if (action.id === 'pin' || action.id === 'pinToViewport') return false;
        return true;
      })
  ];

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

  // Initialize states for token types (archetypes)
  const tokenArchetype = data as TokenType;
  const [states, setStates] = useState<TokenState[]>(
    (tokenArchetype.type === ItemType.TOKEN_TYPE || tokenArchetype.type === ItemType.TOKEN)
      ? (tokenArchetype.states ? tokenArchetype.states.map(s => ({ ...s })) : [])
      : []
  );

  // Initialize sliders for tokens and token types
  const [sliders, setSliders] = useState<TokenSlider[]>(
    (tokenArchetype.type === ItemType.TOKEN_TYPE || tokenArchetype.type === ItemType.TOKEN)
      ? (tokenArchetype.counters ? tokenArchetype.counters.map(c => ({ ...c })) : [])
      : []
  );

  // Slider display settings
  const [sliderPosition, setSliderPosition] = useState<TokenSliderPosition>(
    tokenArchetype.counterDisplay?.position || 'below'
  );
  const [sliderShowForPlayers, setSliderShowForPlayers] = useState<boolean>(
    tokenArchetype.counterDisplay?.showForPlayers !== undefined
      ? tokenArchetype.counterDisplay.showForPlayers
      : true
  );

  // Groups state
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState('#8b5cf6');
  const [draggedDiceId, setDraggedDiceId] = useState<string | null>(null);

  // Text to Cards state
  const [textCardsInput, setTextCardsInput] = useState('');
  const [textCardsBackgroundColor, setTextCardsBackgroundColor] = useState('#ffffff');
  const [textCardsTextColor, setTextCardsTextColor] = useState('#000000');
  const [textCardsFontSize, setTextCardsFontSize] = useState('14');
  const [textCardsUseSpriteSheet, setTextCardsUseSpriteSheet] = useState(false);

  // Get all dice objects
  const allDice: DiceObject[] = Object.values(allObjects).filter(
    obj => obj.type === ItemType.DICE_OBJECT
  ) as DiceObject[];

  // Groups handlers
  const handleCreateGroup = () => {
    if (!newGroupName.trim() || !dispatch) return;
    const newGroup: DiceGroup = {
      id: `group-${Date.now()}`,
      name: newGroupName.trim(),
      color: newGroupColor,
      diceIds: [],
      visible: true
    };
    dispatch({ type: 'ADD_DICE_GROUP', payload: { group: newGroup } });
    setNewGroupName('');
    setNewGroupColor('#8b5cf6');
  };

  const handleUpdateGroup = (groupId: string, updates: Partial<DiceGroup>) => {
    if (!dispatch) return;
    dispatch({ type: 'UPDATE_DICE_GROUP', payload: { groupId, updates } });
  };

  const handleDeleteGroup = (groupId: string) => {
    if (!dispatch) return;
    dispatch({ type: 'DELETE_DICE_GROUP', payload: { groupId } });
  };

  const handleDropDice = (groupId: string | null) => {
    if (!draggedDiceId || !dispatch) return;
    dispatch({ type: 'MOVE_DICE_TO_GROUP', payload: { diceId: draggedDiceId, groupId } });
    setDraggedDiceId(null);
  };

  // Function to normalize dimensions based on shape (keeps width, adjusts height only)
  const normalizeShapeSizes = (shape: TokenShape, currentWidth: number, _currentHeight: number): { width: number; height: number } => {
    switch (shape) {
      case TokenShape.CIRCLE:
        // For circle, height = width (keep width, make height equal)
        return { width: currentWidth, height: currentWidth };
      case TokenShape.SQUARE:
        // For square, height = width (keep width, make height equal)
        return { width: currentWidth, height: currentWidth };
      case TokenShape.HEX:
        // For pointy-top hexagon: height = width * 1.15
        return { width: currentWidth, height: Math.round(currentWidth * 1.15) };
      case TokenShape.HEX_HORIZONTAL:
        // For flat-top hexagon: height = width / 1.15
        return { width: currentWidth, height: Math.round(currentWidth / 1.15) };
      case TokenShape.TRIANGLE:
        // For equilateral triangle: height = width * √3 / 2
        return { width: currentWidth, height: Math.round(currentWidth * Math.sqrt(3) / 2) };
      default:
        // For unknown shapes, just make height equal to width
        return { width: currentWidth, height: currentWidth };
    }
  };

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
    rotationStep?: number;
    searchFaceUp?: boolean;
    playTopFaceUp?: boolean;
    searchWindowVisibility?: SearchWindowVisibility;
    linkCardSize?: boolean; // Remember proportions button state
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
        rotationStep: deck.rotationStep ?? 45,
        searchFaceUp: deck.searchFaceUp ?? true,
        playTopFaceUp: deck.playTopFaceUp ?? true,
        searchWindowVisibility: deck.searchWindowVisibility,
        linkCardSize: deck.linkCardSize,
      };
    }
    return {};
  });

  // Sprite sheet configuration state
  const [spriteConfig, setSpriteConfig] = useState<CardSpriteConfig | null>(
    deck.type === ItemType.DECK ? (deck.spriteConfig || null) : null
  );

  // Convert img_ref:// URLs to displayable URLs for preview
  const spriteSheetDisplayUrl = useImageUrl(spriteConfig?.spriteUrl || '');
  const cardBackDisplayUrl = useImageUrl(spriteConfig?.cardBackUrl || '');

  // Reset data when object changes
  useEffect(() => {
    setData({ ...object });
    setCustomGridUnlocked(false);  // Reset custom grid unlock state when switching objects
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
        rotationStep: deckObj.rotationStep ?? 45,
        searchFaceUp: deckObj.searchFaceUp ?? true,
        playTopFaceUp: deckObj.playTopFaceUp ?? true,
      });
      // Initialize sprite config
      setSpriteConfig(deckObj.spriteConfig || null);

      // Initialize text cards style settings
      if (deckObj.textCardsStyle) {
        setTextCardsBackgroundColor(deckObj.textCardsStyle.backgroundColor || '#ffffff');
        setTextCardsTextColor(deckObj.textCardsStyle.textColor || '#000000');
        setTextCardsFontSize(deckObj.textCardsStyle.fontSize || '14');
        setTextCardsUseSpriteSheet(deckObj.textCardsStyle.useSpriteSheet || false);
      } else {
        // Reset to defaults if no style settings exist
        setTextCardsBackgroundColor('#ffffff');
        setTextCardsTextColor('#000000');
        setTextCardsFontSize('14');
        setTextCardsUseSpriteSheet(false);
      }
    }

    // Initialize states for token types (archetypes) and tokens
    if (object.type === ItemType.TOKEN_TYPE || object.type === ItemType.TOKEN) {
      const tokenObj = object as TokenType;
      // Deep copy states to avoid mutating the original object
      setStates(tokenObj.states ? tokenObj.states.map(s => ({ ...s })) : []);
    }

    // Initialize ratios for proportional resize
    const objWidth = object.width || 50;
    const objHeight = object.height || 50;
    setObjectRatio(objHeight / objWidth);

    if (object.type === ItemType.BOARD) {
      const board = object as Board;
      // For pointy-top hex grid, force link proportions
      // For flat-top hex, allow independent dimensions
      const gridType = board.gridType;
      if (gridType === GridType.HEX) {
        setLinkGridSize(true);
      }
    }

    if (object.type === ItemType.DECK) {
      const deckObj = object as Deck;
      const cardW = deckObj.cardWidth || deckObj.width || 50;
      const cardH = deckObj.cardHeight || deckObj.height || 50;
      setCardRatio(cardH / cardW);
    }
  }, [object]);

  // Handle triple 'i' press within 2 seconds to unlock Custom grid type
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'i' || e.key === 'I' || e.key === 'й' || e.key === 'Й') {
        setIPressCount(prev => {
          const newCount = prev + 1;

          // Clear existing timeout
          if (iPressTimeoutRef.current) {
            clearTimeout(iPressTimeoutRef.current);
          }

          // Set new timeout to reset count after 2 seconds
          const timeout = setTimeout(() => {
            setIPressCount(0);
          }, 2000);
          iPressTimeoutRef.current = timeout;

          // Unlock on third press
          if (newCount === 3) {
            setCustomGridUnlocked(true);
            setIPressCount(0);
            if (iPressTimeoutRef.current) {
              clearTimeout(iPressTimeoutRef.current);
              iPressTimeoutRef.current = null;
            }
          }

          return newCount;
        });
      }
    };

    window.addEventListener('keydown', handleKeyPress);

    return () => {
      window.removeEventListener('keydown', handleKeyPress);
      if (iPressTimeoutRef.current) {
        clearTimeout(iPressTimeoutRef.current);
      }
    };
  }, []);

  const update = (field: string, value: any) => {
    setData(prev => ({ ...prev, [field]: value } as TableObject));
  };

  const updateMultiple = (fields: Record<string, any>) => {
    setData(prev => ({ ...prev, ...fields } as TableObject));
  };

  // Check if value should trigger rounding (only if more than 1 digit)
  const shouldRound = (value: number): boolean => {
    if (isNaN(value)) return false;
    const absValue = Math.abs(value);
    // Single digit integers (0-9) don't trigger rounding
    if (absValue < 10 && Number.isInteger(value)) return false;
    return true;
  };

  const toggleActionButton = (action: ContextAction) => {
    // Cards don't have actionButtons - only decks do
    if (isCard) return;
    const current = 'actionButtons' in data ? data.actionButtons || [] : [];
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

        // Auto-normalize dimensions when card shape changes
        // Use proper dimensions from CARD_SHAPE_DIMS for the new shape
        const newShape = value as CardShape;
        const currentOrientation = prev.cardOrientation ?? CardOrientation.VERTICAL;

        // For standard card shapes (POKER, BRIDGE, MINI_US, MINI_EURO)
        if (newShape === CardShape.POKER || newShape === CardShape.BRIDGE ||
            newShape === CardShape.MINI_US || newShape === CardShape.MINI_EURO) {
          const baseDims = CARD_SHAPE_DIMS[newShape];
          const baseRatio = baseDims.height / baseDims.width;
          // VERTICAL: normal ratio, HORIZONTAL: inverted ratio
          const ratio = currentOrientation === CardOrientation.VERTICAL ? baseRatio : 1 / baseRatio;

          // Use base dimensions from CARD_SHAPE_DIMS to ensure correct aspect ratio
          const currentWidth = baseDims.width;
          const newHeight = Math.round(currentWidth * ratio);
          updated.cardWidth = currentWidth;
          updated.cardHeight = newHeight;
          // Also update deck dimensions to match
          update('width', currentWidth);
          update('height', newHeight);
        }
        // For HEX_HORIZONTAL, use exact formula: height = width / 1.15
        else if (newShape === CardShape.HEX_HORIZONTAL) {
          const baseDims = CARD_SHAPE_DIMS[newShape];
          const currentWidth = baseDims.width;
          const newHeight = Math.round(currentWidth / 1.15);
          updated.cardWidth = currentWidth;
          updated.cardHeight = newHeight;
          // Also update deck dimensions to match
          update('width', currentWidth);
          update('height', newHeight);
        }
        // For HEX, normalization depends on orientation
        else if (newShape === CardShape.HEX) {
          const baseDims = CARD_SHAPE_DIMS[newShape];
          const currentWidth = baseDims.width;
          // VERTICAL (pointy-top): height = width × 1.15
          // HORIZONTAL (flat-top): height = width / 1.15
          const newHeight = currentOrientation === CardOrientation.VERTICAL
            ? Math.round(currentWidth * 1.15)
            : Math.round(currentWidth / 1.15);
          updated.cardWidth = currentWidth;
          updated.cardHeight = newHeight;
          // Also update deck dimensions to match
          update('width', currentWidth);
          update('height', newHeight);
        }
        // For TRIANGLE, use equilateral triangle ratio
        else if (newShape === CardShape.TRIANGLE) {
          const baseDims = CARD_SHAPE_DIMS[newShape];
          const currentWidth = baseDims.width;
          const newHeight = Math.round(currentWidth * Math.sqrt(3) / 2);
          updated.cardWidth = currentWidth;
          updated.cardHeight = newHeight;
          // Also update deck dimensions to match
          update('width', currentWidth);
          update('height', newHeight);
        }
        // For SQUARE and CIRCLE, make height equal to width
        else if (newShape === CardShape.SQUARE || newShape === CardShape.CIRCLE) {
          const baseDims = CARD_SHAPE_DIMS[newShape];
          const currentWidth = baseDims.width;
          updated.cardWidth = currentWidth;
          updated.cardHeight = currentWidth;
          // Also update deck dimensions to match
          update('width', currentWidth);
          update('height', currentWidth);
        }
      }

      return updated;
    });
  };

  const updateCardSettingsMultiple = (fields: Partial<CardSettings>) => {
    setCardSettings(prev => ({ ...prev, ...fields }));
  };

  const toggleCardActionButton = (action: ContextAction) => {
    const current = cardSettings.actionButtons || [];
    if (current.includes(action)) {
      setCardSettings(prev => ({ ...prev, actionButtons: current.filter(a => a !== action) }));
    } else {
      setCardSettings(prev => ({ ...prev, actionButtons: [...current, action] }));
    }
  };

  const handleSave = () => {
    // Helper to normalize permissions:
    // undefined = all allowed (default for new objects)
    // [] = none allowed (user explicitly disabled all)
    // specific array = only those allowed
    const allActionIds = [...AVAILABLE_ACTIONS, ...(isDeck ? DECK_ACTIONS : [])].map(a => a.id);

    // For players: only convert to undefined if contains ALL actions
    let normalizedAllowedActions: ContextAction[] | undefined = 'allowedActions' in data ? data.allowedActions : undefined;
    if (normalizedAllowedActions && normalizedAllowedActions.length === allActionIds.length) {
      // Check if it contains exactly all actions
      const hasAll = allActionIds.every(id => normalizedAllowedActions?.includes(id));
      if (hasAll) normalizedAllowedActions = undefined;
    }
    // Empty array stays as empty array (none allowed)

    // For GM: only convert to undefined if contains ALL actions
    let normalizedAllowedActionsForGM: ContextAction[] | undefined = 'allowedActionsForGM' in data ? data.allowedActionsForGM : undefined;
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
      // Normalize card settings - cards can only use card-specific actions, not deck-specific ones
      const deckOnlyActions = DECK_ACTIONS.map(a => a.id);
      const cardOnlyActions = allActionIds.filter(id => !deckOnlyActions.includes(id));

      let normalizedCardAllowedActions: ContextAction[] | undefined = cardSettings.allowedActions;
      if (normalizedCardAllowedActions && normalizedCardAllowedActions.length === cardOnlyActions.length) {
        const hasAll = cardOnlyActions.every(id => normalizedCardAllowedActions?.includes(id));
        if (hasAll) normalizedCardAllowedActions = undefined;
      }

      let normalizedCardAllowedActionsForGM: ContextAction[] | undefined = cardSettings.allowedActionsForGM;
      if (normalizedCardAllowedActionsForGM && normalizedCardAllowedActionsForGM.length === cardOnlyActions.length) {
        const hasAll = cardOnlyActions.every(id => normalizedCardAllowedActionsForGM?.includes(id));
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
      (toSave as Deck).rotationStep = cardSettings.rotationStep;
      (toSave as Deck).searchFaceUp = cardSettings.searchFaceUp;
      (toSave as Deck).playTopFaceUp = cardSettings.playTopFaceUp;
      (toSave as Deck).searchWindowVisibility = cardSettings.searchWindowVisibility;
      (toSave as Deck).linkCardSize = cardSettings.linkCardSize;
      (toSave as Deck).spriteConfig = spriteConfig || undefined;
    }

    // Add states for token types (archetypes) and tokens
    if (toSave.type === ItemType.TOKEN_TYPE || toSave.type === ItemType.TOKEN) {
      (toSave as TokenType).states = states;
    }

    // If saving a token type (archetype), dispatch event to update all token-copies
    if (isArchetype) {
      const archetypeId = data.id;
      const tokenCopies = Object.values(allObjects).filter(obj =>
        obj.type === ItemType.TOKEN && (obj as any).archetypeId === archetypeId
      ) as TokenType[];

      // Properties to copy from archetype to token-copies
      const propsToUpdate = [
        'width', 'height', 'color', 'shape', 'content',
        'borderColor', 'borderWidth', 'showNameOnToken', 'showName', 'name', 'fontColor',
        'allowedActions', 'allowedActionsForGM', 'actionButtons', 'singleClickAction', 'doubleClickAction',
        'rotationStep'
      ] as const;

      tokenCopies.forEach(copy => {
        const updatedCopy: Partial<TokenType> = {};

        // For size, token-copies use defaultSize from archetype
        const defaultSize = (data as any).defaultSize;
        if (defaultSize) {
          updatedCopy.width = defaultSize.width;
          updatedCopy.height = defaultSize.height;
        } else {
          updatedCopy.width = data.width;
          updatedCopy.height = data.height;
        }

        propsToUpdate.forEach(prop => {
          if (prop !== 'width' && prop !== 'height') {
            // Handle showName/showNameOnToken mapping between archetype and token
            if (prop === 'showName' && !(data as any).showNameOnToken) {
              // If archetype has showName, copy to token's showNameOnToken
              (updatedCopy as any).showNameOnToken = (data as any)[prop];
            } else if (prop === 'showNameOnToken') {
              // Skip - tokens use showNameOnToken, not showNameOnToken from archetype
            } else {
              (updatedCopy as any)[prop] = (data as any)[prop];
            }
          }
        });

        // Dispatch event to update the token-copy
        if (Object.keys(updatedCopy).length > 0) {
          window.dispatchEvent(new CustomEvent('update-token-copy-from-archetype', {
            detail: { copyId: copy.id, updates: updatedCopy }
          }));
        }
      });
    }

    // For boards: clear magnet points when snap settings are disabled or grid size changes
    if (toSave.type === ItemType.BOARD) {
      const board = toSave as Board;
      const originalBoard = object as Board;

      // Check if snapToGrid or snapCardsToGrid changed from true to false
      const snapToGridDisabled = originalBoard.snapToGrid === true && board.snapToGrid === false;
      const snapCardsToGridDisabled = originalBoard.snapCardsToGrid === true && board.snapCardsToGrid === false;

      // Check if grid dimensions changed
      const originalGridW = originalBoard.gridWidth || originalBoard.gridSize || 50;
      const originalGridH = originalBoard.gridHeight || originalBoard.gridSize || 50;
      const newGridW = board.gridWidth || board.gridSize || 50;
      const newGridH = board.gridHeight || board.gridSize || 50;
      const gridDimensionsChanged = originalGridW !== newGridW || originalGridH !== newGridH;

      // Clear magnet points if snap settings disabled OR grid dimensions changed
      if (snapToGridDisabled || snapCardsToGridDisabled || gridDimensionsChanged) {
        (toSave as Board).gridCellMagnetPoints = undefined;
      }

      // Clear grid cell cache for this board when dimensions change
      if (gridDimensionsChanged) {
        clearBoardCellCache(board.id);
      }

      // Sync gridSize with gridWidth/gridHeight for backward compatibility
      // Use the average of width and height, or just width if they're equal
      if (board.gridWidth !== undefined || board.gridHeight !== undefined) {
        if (board.gridWidth && board.gridHeight) {
          board.gridSize = Math.round((board.gridWidth + board.gridHeight) / 2);
        } else if (board.gridWidth) {
          board.gridSize = board.gridWidth;
        } else if (board.gridHeight) {
          board.gridSize = board.gridHeight;
        }
      }
    }

    onSave(toSave);

    // After saving, update all cards in the deck when cardWidth/cardHeight/cardOrientation/cardShape changed
    if (isDeck) {
      const deckId = data.id;
      const oldDeck = allObjects[deckId] as Deck;
      if (!oldDeck) {
        return;
      }
      const oldCardWidth = oldDeck.cardWidth;
      const oldCardHeight = oldDeck.cardHeight;
      const oldCardOrientation = oldDeck.cardOrientation;
      const oldCardShape = oldDeck.cardShape;
      const oldRotationStep = oldDeck.rotationStep ?? 45;
      const newCardWidth = cardSettings.cardWidth;
      const newCardHeight = cardSettings.cardHeight;
      const newCardOrientation = cardSettings.cardOrientation;
      const newCardShape = cardSettings.cardShape;
      const newRotationStep = cardSettings.rotationStep ?? 45;

      const dimensionsChanged = oldCardWidth !== newCardWidth || oldCardHeight !== newCardHeight || oldCardOrientation !== newCardOrientation;
      const shapeChanged = oldCardShape !== newCardShape;

      if (dimensionsChanged) {
        // Clear card dimensions cache to ensure new dimensions are used immediately
        import('../utils/cardUtils').then(({ clearCardDimensionsCache }) => {
          clearCardDimensionsCache();
        });

        // Dispatch event to update all cards in this deck
        window.dispatchEvent(new CustomEvent('update-deck-cards-dimensions', {
          detail: {
            deckId,
            cardWidth: newCardWidth ?? oldDeck.width,
            cardHeight: newCardHeight ?? oldDeck.height
          }
        }));
      }

      // Check if cardShape changed
      if (shapeChanged) {
        // Dispatch event to update all cards in this deck with new shape
        window.dispatchEvent(new CustomEvent('update-deck-cards-shape', {
          detail: {
            deckId,
            cardShape: newCardShape
          }
        }));
      }

      // Check if rotationStep changed
      if (oldRotationStep !== newRotationStep) {
        // Dispatch event to update all cards in this deck with new rotationStep
        window.dispatchEvent(new CustomEvent('update-deck-cards-rotation-step', {
          detail: {
            deckId,
            rotationStep: newRotationStep
          }
        }));
      }

      // Check if cardBackUrl changed
      const oldCardBackUrl = oldDeck.spriteConfig?.cardBackUrl;
      const newCardBackUrl = spriteConfig?.cardBackUrl;
      if (oldCardBackUrl !== newCardBackUrl) {
        // Dispatch event to update deck card back display
        window.dispatchEvent(new CustomEvent('update-deck-card-back', {
          detail: {
            deckId,
            cardBackUrl: newCardBackUrl
          }
        }));
      }
    }

    onClose();
  };

  // Handle grid generation from image
  const handleGenerateGridFromImage = async (file: File) => {
    if (!isBoard) return;

    setIsAnalyzingImage(true);
    setGridGenPreview(null);
    setDetectedCells([]);
    setGridDebugInfo(null);

    try {
      // Load and analyze image
      const imageData = await loadImageFromFile(file);

      // Configure analysis options - finds individual enclosed cells
      const options: GridAnalysisOptions = {
        edgeThreshold: 30,         // Edge detection threshold (lower = more sensitive)
        minCellSize: 150,          // Minimum cell area (lowered to detect smaller cells)
        maxCellSize: 300000,       // Maximum cell area
        simplifyTolerance: 0.02,   // Polygon simplification
        minAspectRatio: 0.15,      // Min aspect ratio (allows narrower cells)
        maxAspectRatio: 6.0        // Max aspect ratio (allows wider cells)
      };

      // Use smart analysis that tries multiple thresholds
      const result = analyzeImageForGridSmart(imageData, options);

      // Create debug preview canvas showing detected cells
      const previewCanvas = document.createElement('canvas');
      previewCanvas.width = result.imageWidth;
      previewCanvas.height = result.imageHeight;

      // Create debug preview (empty arrays for lines since we don't use line detection anymore)
      createDebugPreview(previewCanvas, imageData, [], [], result.cells);

      setGridGenPreview(previewCanvas.toDataURL());

      setDetectedCells(result.cells);
      if (result.debugInfo) {
        setGridDebugInfo({
          hLines: result.debugInfo.regionsFound,
          vLines: result.debugInfo.cellsAfterFilter
        });
      }
    } catch (error) {
      console.error('Failed to analyze image:', error);
      alert(t({ en: 'Failed to analyze image. Please try a clearer image.', ru: 'Не удалось проанализировать изображение. Попробуйте более четкое изображение.' }));
    } finally {
      setIsAnalyzingImage(false);
    }
  };

  // Confirm and create cells from detected grid
  const handleConfirmGridGeneration = () => {
    if (!isBoard || detectedCells.length === 0) return;

    const board = data as Board;
    const boardWidth = board.width || 500;
    const boardHeight = board.height || 500;

    // Calculate scale factor to fit detected cells within board dimensions
    // with some padding (5% on each side)
    const padding = 0.05;
    const usableWidth = boardWidth * (1 - padding);
    const usableHeight = boardHeight * (1 - padding);

    // Get the bounding box of all detected cells
    const minX = Math.min(...detectedCells.map(c => c.x));
    const minY = Math.min(...detectedCells.map(c => c.y));
    const maxX = Math.max(...detectedCells.map(c => c.x + c.width));
    const maxY = Math.max(...detectedCells.map(c => c.y + c.height));
    const cellsWidth = maxX - minX;
    const cellsHeight = maxY - minY;

    // Avoid division by zero
    if (cellsWidth === 0 || cellsHeight === 0) {
      alert(t({ en: 'Failed to detect valid cells.', ru: 'Не удалось обнаружить корректные ячейки.' }));
      return;
    }

    // Calculate scale to fit cells within board
    const scaleX = usableWidth / cellsWidth;
    const scaleY = usableHeight / cellsHeight;
    const scale = Math.min(scaleX, scaleY, 3); // Cap at 3x max scale

    // Calculate offset to center cells on board
    const offsetX = (boardWidth - cellsWidth * scale) / 2 - minX * scale;
    const offsetY = (boardHeight - cellsHeight * scale) / 2 - minY * scale;

    // Convert detected cells to custom grid cells (normalized coordinates 0-1)
    const customGridCells = detectedCells.map((cell, index) => {
      // Calculate position in board coordinates
      const cellX = offsetX + (cell.x * scale);
      const cellY = offsetY + (cell.y * scale);
      const cellWidth = Math.max(10, cell.width * scale); // Minimum 10vu
      const cellHeight = Math.max(10, cell.height * scale);

      // Normalize to 0-1 range for storage (relative to board size)
      const normalizedX = cellX / boardWidth;
      const normalizedY = cellY / boardHeight;
      const normalizedWidth = cellWidth / boardWidth;
      const normalizedHeight = cellHeight / boardHeight;

      return {
        id: `cell-${index}-${Date.now()}`,
        x: normalizedX,
        y: normalizedY,
        width: normalizedWidth,
        height: normalizedHeight,
        shape: cell.shape,
        polygon: cell.polygon
      };
    });

    // Update board with custom grid
    updateMultiple({
      gridType: GridType.CUSTOM,
      customGridCells: customGridCells,
      showGrid: true
    });

    // Close preview and show success message
    setGridGenPreview(null);
    setDetectedCells([]);
setGridDebugInfo(null);

    alert(t({
      en: `Successfully created ${customGridCells.length} grid cells!`,
      ru: `Успешно создано ${customGridCells.length} ячеек сетки!`,
      uk: `Успішно створено ${customGridCells.length} комірок сітки!`,
      be: `Паспяхова створана ${customGridCells.length} ячэек сеткі!`,
      sr: `Успешно креирано ${customGridCells.length} ћелија мреже!`
    }));
  };

  const isToken = data.type === ItemType.TOKEN;
  const isArchetype = data.type === ItemType.TOKEN_TYPE;
  const isBoard = data.type === ItemType.BOARD;
  const isNexusBoard = data.type === ItemType.NEXUS_BOARD;
  const isNexusCell = data.type === ItemType.NEXUS_CELL;
  const isDeck = data.type === ItemType.DECK;
  const isCard = data.type === ItemType.CARD; // Cards don't have their own settings
  const isDice = data.type === ItemType.DICE_OBJECT;
  const isCounter = data.type === ItemType.COUNTER;
  const isDrawing = data.type === ItemType.DRAWING;
  const isPanel = data.type === ItemType.PANEL;
  const isBattlefieldCell = data.type === ItemType.BATTLEFIELD_CELL;
  const isEffectTemplate = data.type === ItemType.EFFECT_TEMPLATE;

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
    const updatedPiles = [...piles, newPile];
    setPiles(updatedPiles);
    // Also update data to keep in sync
    setData(prev => ({ ...prev, piles: updatedPiles } as TableObject));
  };

  const updatePile = (index: number, field: keyof CardPile, value: any) => {
    const updated = [...piles];

    // Special handling for isMillPile - only one pile can have mill enabled at a time
    if (field === 'isMillPile' && value === true) {
      // Disable mill for all other piles
      for (let i = 0; i < updated.length; i++) {
        if (i !== index) {
          updated[i] = { ...updated[i], isMillPile: false };
        }
      }
    }

    updated[index] = { ...updated[index], [field]: value };
    setPiles(updated);
    // Also update data to keep in sync
    setData(prev => ({ ...prev, piles: updated } as TableObject));
  };

  const removePile = (index: number) => {
    const updated = piles.filter((_, i) => i !== index);
    setPiles(updated);
    // Also update data to keep in sync
    setData(prev => ({ ...prev, piles: updated } as TableObject));
  };

  // State management functions for token archetypes
  const addState = () => {
    const token = data as TokenType;

    // Create new state with default values inherited from the token archetype
    // This way users only need to override the properties they want to change
    const newState: TokenState = {
      id: `state-${Date.now()}`,
      name: `State ${states.length + 1}`,
      // Inherit visual properties from token as starting point
      content: token.content,
      color: token.color,
      borderColor: token.borderColor,
      borderWidth: token.borderWidth,
      opacity: token.opacity,
      borderOpacity: (token as any).borderOpacity,
      shape: token.shape,
      width: token.width,
      height: token.height,
      rotationStep: (token as any).rotationStep,
      showNameOnToken: (token as any).showNameOnToken,
      fontColor: (token as any).fontColor,
      tooltipText: (token as any).tooltipText,
    };

    // Remove undefined values to keep state clean (optional properties will use token defaults)
    const cleanedState: TokenState = {
      id: newState.id,
      name: newState.name,
    };

    // Only add properties that have defined values
    if (newState.content !== undefined) cleanedState.content = newState.content;
    if (newState.color !== undefined) cleanedState.color = newState.color;
    if (newState.borderColor !== undefined) cleanedState.borderColor = newState.borderColor;
    if (newState.borderWidth !== undefined) cleanedState.borderWidth = newState.borderWidth;
    if (newState.opacity !== undefined) cleanedState.opacity = newState.opacity;
    if (newState.borderOpacity !== undefined) cleanedState.borderOpacity = newState.borderOpacity;
    if (newState.shape !== undefined) cleanedState.shape = newState.shape;
    if (newState.width !== undefined) cleanedState.width = newState.width;
    if (newState.height !== undefined) cleanedState.height = newState.height;
    if (newState.rotationStep !== undefined) cleanedState.rotationStep = newState.rotationStep;
    if (newState.showNameOnToken !== undefined) cleanedState.showNameOnToken = newState.showNameOnToken;
    if (newState.fontColor !== undefined) cleanedState.fontColor = newState.fontColor;
    if (newState.tooltipText !== undefined) cleanedState.tooltipText = newState.tooltipText;

    const updatedStates = [...states, cleanedState];
    setStates(updatedStates);
    // Also update data to keep in sync
    setData(prev => ({ ...prev, states: updatedStates } as TableObject));
  };

  const updateState = (index: number, field: keyof TokenState, value: any) => {
    const updated = [...states];
    updated[index] = { ...updated[index], [field]: value };
    setStates(updated);
    // Also update data to keep in sync
    setData(prev => ({ ...prev, states: updated } as TableObject));
  };

  // Reset a state field to the token's default value
  const resetStateField = (index: number, field: keyof TokenState) => {
    const token = data as TokenType;
    const updated = [...states];

    // Get the default value from the token for this field
    let defaultValue: any;
    switch (field) {
      case 'content': defaultValue = token.content; break;
      case 'color': defaultValue = token.color; break;
      case 'borderColor': defaultValue = token.borderColor; break;
      case 'borderWidth': defaultValue = token.borderWidth; break;
      case 'opacity': defaultValue = token.opacity; break;
      case 'borderOpacity': defaultValue = (token as any).borderOpacity; break;
      case 'shape': defaultValue = token.shape; break;
      case 'width': defaultValue = token.width; break;
      case 'height': defaultValue = token.height; break;
      case 'rotationStep': defaultValue = (token as any).rotationStep; break;
      case 'showNameOnToken': defaultValue = (token as any).showNameOnToken; break;
      case 'fontColor': defaultValue = (token as any).fontColor; break;
      case 'tooltipText': defaultValue = (token as any).tooltipText; break;
      default: return; // Unknown field, do nothing
    }

    // If the token's value is undefined, remove the field from state
    // Otherwise, set it to the token's value
    if (defaultValue === undefined) {
      const { [field]: _, ...rest } = updated[index];
      updated[index] = rest as TokenState;
    } else {
      updated[index] = { ...updated[index], [field]: defaultValue };
    }

    setStates(updated);
    // Also update data to keep in sync
    setData(prev => ({ ...prev, states: updated } as TableObject));
  };

  // Check if a state field differs from token's default (for button styling)
  const isStateFieldDifferent = (index: number, field: keyof TokenState): boolean => {
    const state = states[index];
    const token = data as TokenType;

    // Get the default value from token for this field
    let defaultValue: any;
    switch (field) {
      case 'content': defaultValue = token.content; break;
      case 'color': defaultValue = token.color; break;
      case 'borderColor': defaultValue = token.borderColor; break;
      case 'borderWidth': defaultValue = token.borderWidth; break;
      case 'opacity': defaultValue = (token as any).opacity; break;
      case 'borderOpacity': defaultValue = (token as any).borderOpacity; break;
      case 'shape': defaultValue = token.shape; break;
      case 'width': defaultValue = token.width; break;
      case 'height': defaultValue = token.height; break;
      case 'rotationStep': defaultValue = (token as any).rotationStep; break;
      case 'showNameOnToken': defaultValue = (token as any).showNameOnToken; break;
      case 'fontColor': defaultValue = (token as any).fontColor; break;
      case 'tooltipText': defaultValue = (token as any).tooltipText; break;
      default: return false;
    }

    // Field is different if it's defined in state and not equal to token's value
    const stateValue = state[field];
    return stateValue !== undefined && stateValue !== defaultValue;
  };

  const removeState = (index: number) => {
    const updated = states.filter((_, i) => i !== index);
    setStates(updated);
    // Also update data to keep in sync
    setData(prev => ({ ...prev, states: updated } as TableObject));
  };

  // Slider management functions for tokens and token types
  const addSlider = () => {
    const newSlider: TokenSlider = {
      id: `slider-${Date.now()}`,
      name: `Slider ${sliders.length + 1}`,
      value: 10,
      maxValue: 10,
      minValue: 0,
      color: '#ef4444',
      icon: undefined,
      showValue: true,
      showBar: true
    };

    const updatedSliders = [...sliders, newSlider];
    setSliders(updatedSliders);
    // Also update data to keep in sync
    setData(prev => ({ ...prev, counters: updatedSliders } as TableObject));
  };

  const updateSlider = (index: number, field: keyof TokenSlider, value: any) => {
    const updated = [...sliders];
    updated[index] = { ...updated[index], [field]: value };
    setSliders(updated);
    // Also update data to keep in sync
    setData(prev => ({ ...prev, counters: updated } as TableObject));
  };

  const removeSlider = (index: number) => {
    const updated = sliders.filter((_, i) => i !== index);
    setSliders(updated);
    // Also update data to keep in sync
    setData(prev => ({ ...prev, counters: updated } as TableObject));
  };

  // Update slider display settings
  const updateSliderDisplay = (field: 'position' | 'showForPlayers', value: any) => {
    if (field === 'position') {
      setSliderPosition(value as TokenSliderPosition);
    } else if (field === 'showForPlayers') {
      setSliderShowForPlayers(value as boolean);
    }
    // Update data
    const counterDisplay = {
      position: field === 'position' ? value : sliderPosition,
      showForPlayers: field === 'showForPlayers' ? value : sliderShowForPlayers
    };
    setData(prev => ({ ...prev, counterDisplay } as TableObject));
  };

  const modalContent = (
    <div className={`fixed inset-0 ${zIndex || 'z-[100005]'} flex items-center justify-center bg-black/40`}>
      <div className="bg-slate-800 rounded-lg shadow-xl w-[575px] border border-slate-600 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex justify-center items-center py-2 px-4">
          <h3 className="text-base font-bold text-white">{translate('Properties', language as Locale)}: {object.name}</h3>
        </div>

        {/* Tabs */}
        <div className="flex">
          <button
            onClick={() => setActiveTab('general')}
            className={`flex-1 py-3 px-3 flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
              activeTab === 'general'
                ? 'bg-slate-700 text-white border-b-2 border-purple-500'
                : 'text-gray-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <Settings size={16} /> {translate('General', language as Locale)}
          </button>
          {!isCard && !isDice && !isCounter && !isBattlefieldCell && !isPanel && !isEffectTemplate && (
            <button
              onClick={() => setActiveTab('actions')}
              className={`flex-1 py-3 px-3 flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
                activeTab === 'actions'
                  ? 'bg-slate-700 text-white border-b-2 border-purple-500'
                  : 'text-gray-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Shield size={16} /> {translate('Actions', language as Locale)}
            </button>
          )}
          {(isToken || isArchetype) && (
            <button
              onClick={() => setActiveTab('states')}
              className={`flex-1 py-3 px-3 flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
                activeTab === 'states'
                  ? 'bg-slate-700 text-white border-b-2 border-purple-500'
                  : 'text-gray-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Sparkles size={16} /> {translate('States', language as Locale)}
            </button>
          )}
          {(isToken || isArchetype) && (
            <button
              onClick={() => setActiveTab('counters')}
              className={`flex-1 py-3 px-3 flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
                activeTab === 'counters'
                  ? 'bg-slate-700 text-white border-b-2 border-purple-500'
                  : 'text-gray-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Hash size={16} /> {translate('Sliders', language as Locale)}
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
              <Layers size={16} /> {translate('Piles', language as Locale)}
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
              <Square size={16} /> {translate('Cards', language as Locale)}
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
              <ImageIcon size={16} /> {translate('Import', language as Locale)}
            </button>
          )}
          {isDeck && (
            <button
              onClick={() => setActiveTab('textCards')}
              className={`flex-1 py-3 px-3 flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
                activeTab === 'textCards'
                  ? 'bg-slate-700 text-white border-b-2 border-purple-500'
                  : 'text-gray-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <FileText size={16} /> {translate('Text', language as Locale)}
            </button>
          )}
          {isDice && (
            <button
              onClick={() => setActiveTab('values')}
              className={`flex-1 py-3 px-3 flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
                activeTab === 'values'
                  ? 'bg-slate-700 text-white border-b-2 border-purple-500'
                  : 'text-gray-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Smile size={16} /> {translate('Values', language as Locale)}
            </button>
          )}
          {isDice && (
            <button
              onClick={() => setActiveTab('groups')}
              className={`flex-1 py-3 px-3 flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
                activeTab === 'groups'
                  ? 'bg-slate-700 text-white border-b-2 border-purple-500'
                  : 'text-gray-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Dices size={16} /> {translate('Groups', language as Locale)}
            </button>
          )}
        </div>

        {/* Content */}
        <div
          className="flex-1 overflow-y-auto scrollbar-thin p-4"
          data-scrollable="true"
        >
          {activeTab === 'general' && (
            <div className="space-y-4">
              {/* Basic Properties - Name, Size, Rotation */}
              <div className="space-y-2">
                {/* Name */}
                {isToken || isArchetype || isCounter ? (
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Name', language as Locale)}</label>
                    <div className="flex items-center gap-2">
                      <input
                        value={data.name}
                        onChange={e => update('name', e.target.value)}
                        className="flex-1 bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                      />
                      {/* Font Color Picker */}
                      <input
                        type="color"
                        value={(data as any).fontColor || '#ffffff'}
                        onChange={e => update('fontColor', e.target.value)}
                        className="w-9 h-9 rounded cursor-pointer border-0 p-0 bg-slate-900"
                        title={translate('Font Color', language as Locale)}
                      />

                      {/* Show Name Toggle - for tokens, token types, and counters */}
                      {(isToken || isArchetype || isCounter) && (
                        <button
                          onClick={() => {
                            const targetProp = isArchetype ? 'showName' : 'showNameOnToken';
                            update(targetProp, !(data as any)[targetProp]);
                          }}
                          className={`w-9 h-5 rounded-full transition-colors ${
                            isArchetype
                              ? ((data as any).showName ? 'bg-green-600' : 'bg-slate-700')
                              : ((data as any).showNameOnToken ? 'bg-green-600' : 'bg-slate-700')
                          }`}
                          title={translate('Show name on token', language as Locale)}
                        >
                          <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                            isArchetype
                              ? ((data as any).showName ? 'translate-x-5' : 'translate-x-0.5')
                              : ((data as any).showNameOnToken ? 'translate-x-5' : 'translate-x-0.5')
                          }`} />
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Name', language as Locale)}</label>
                    <input
                      value={data.name}
                      onChange={e => update('name', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                    />
                  </div>
                )}

                {/* Size */}
                <div className="grid grid-cols-[1fr_auto_1fr_auto] gap-2 items-end">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Width', language as Locale)}</label>
                    <input
                      type="number"
                      step="0.01"
                      value={isEffectTemplate ? roundToHundredths(data.width) : (isArchetype ? (data as any).defaultSize?.width || data.width : data.width)}
                      onChange={e => {
                        const value = parseFloat(e.target.value);
                        const roundHeight = shouldRound(value);
                        if (isNexusCell) {
                          // Nexus cells always have 1:1.15 proportion
                          updateMultiple({ width: value, height: roundHeight ? Math.round(value * 1.15 * 100) / 100 : value * 1.15 });
                        } else if (isArchetype) {
                          // For token types, update defaultSize
                          const currentHeight = (data as any).defaultSize?.height || data.height || 50;
                          update('defaultSize', {
                            ...(data as any).defaultSize,
                            width: value,
                            height: linkObjectSize ? (roundHeight ? Math.round(value * objectRatio * 100) / 100 : value * objectRatio) : currentHeight
                          });
                        } else {
                          if (linkObjectSize) {
                            updateMultiple({
                              width: value,
                              height: roundHeight ? Math.round(value * objectRatio * 100) / 100 : value * objectRatio
                            });
                          } else {
                            update('width', value);
                          }
                        }
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                    />
                  </div>
                  <div className="flex items-end pb-0.5">
                    <button
                      onClick={() => {
                        if (isNexusCell) return; // Locked for Nexus cells
                        const newState = !linkObjectSize;
                        if (!linkObjectSize) {
                          // Turning on - save current ratio
                          const currentWidth = isArchetype ? (data as any).defaultSize?.width || data.width : data.width;
                          const currentHeight = isArchetype ? (data as any).defaultSize?.height || data.height : data.height;
                          setObjectRatio(currentHeight / currentWidth);
                        }
                        setLinkObjectSize(newState);
                        // Save to object
                        updateMultiple({ linkObjectSize: newState });
                      }}
                      disabled={isNexusCell}
                      className={`w-[30px] h-[30px] rounded border-2 flex items-center justify-center transition-colors ${
                        isNexusCell
                          ? 'bg-purple-600 border-purple-500 cursor-not-allowed'
                          : linkObjectSize
                            ? 'bg-blue-600 border-blue-500 hover:bg-blue-500'
                            : 'bg-slate-700 border-slate-600 hover:bg-slate-600'
                      }`}
                      title={isNexusCell ? translate('Proportions locked (1:1.15)', language as Locale) : (linkObjectSize ? translate('Unlink proportions', language as Locale) : translate('Link proportions', language as Locale))}
                    >
                      <Link size={14} />
                    </button>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Height', language as Locale)}</label>
                    <input
                      type="number"
                      step="0.01"
                      disabled={isNexusCell}
                      value={isEffectTemplate ? roundToHundredths(data.height) : (isArchetype ? (data as any).defaultSize?.height || data.height : data.height)}
                      onChange={e => {
                        const value = parseFloat(e.target.value);
                        const roundWidth = shouldRound(value);
                        if (isArchetype) {
                          // For token types, update defaultSize
                          const currentWidth = (data as any).defaultSize?.width || data.width || 50;
                          update('defaultSize', {
                            ...(data as any).defaultSize,
                            height: value,
                            width: linkObjectSize ? (roundWidth ? Math.round(value / objectRatio * 100) / 100 : value / objectRatio) : currentWidth
                          });
                        } else {
                          if (linkObjectSize) {
                            updateMultiple({
                              height: value,
                              width: roundWidth ? Math.round(value / objectRatio * 100) / 100 : value / objectRatio
                            });
                          } else {
                            update('height', value);
                          }
                        }
                      }}
                      className={`w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm ${
                        isNexusCell ? 'cursor-not-allowed opacity-60' : ''
                      }`}
                    />
                  </div>
                  <div className="flex items-end pb-0.5">
                    <button
                      onClick={() => {
                        const currentWidth = isArchetype ? (data as any).defaultSize?.width || data.width : data.width;
                        const currentHeight = isArchetype ? (data as any).defaultSize?.height || data.height : data.height;

                        let width: number;
                        let height: number;

                        // For decks/archetypes with card shape, use card normalization
                        if (isDeck || (isArchetype && (data as any).cardShape)) {
                          const cardShape = (data as any).cardShape || CardShape.POKER;
                          const cardWidthSetting = (data as any).cardWidth;
                          const cardHeightSetting = (data as any).cardHeight;

                          // For card shapes with standard aspect ratios (POKER, BRIDGE, MINI_US, MINI_EURO)
                          if (cardShape === CardShape.POKER || cardShape === CardShape.BRIDGE ||
                              cardShape === CardShape.MINI_US || cardShape === CardShape.MINI_EURO) {
                            if (cardWidthSetting && cardHeightSetting) {
                              // Use the card's aspect ratio from settings: height = width * (cardHeight / cardWidth)
                              width = currentWidth;
                              height = Math.round(currentWidth * cardHeightSetting / cardWidthSetting);
                            } else {
                              // Use default aspect ratio from CARD_SHAPE_DIMS
                              const baseDims = CARD_SHAPE_DIMS[cardShape as CardShape];
                              const ratio = baseDims.height / baseDims.width;
                              width = currentWidth;
                              height = Math.round(currentWidth * ratio);
                            }
                          } else if (cardShape === CardShape.HEX_HORIZONTAL) {
                            // For HEX_HORIZONTAL, use exact formula: height = width / 1.15
                            if (cardWidthSetting && cardHeightSetting) {
                              width = currentWidth;
                              height = Math.round(currentWidth / 1.15);
                            } else {
                              width = currentWidth;
                              height = Math.round(currentWidth / 1.15);
                            }
                          } else if (cardShape === CardShape.HEX) {
                            // For HEX, normalization depends on cardOrientation
                            // Read from cardSettings to get the current (unsaved) orientation value
                            const orientation = cardSettings.cardOrientation ?? CardOrientation.VERTICAL;
                            // VERTICAL (pointy-top): height = width × 1.15
                            // HORIZONTAL (flat-top): height = width / 1.15
                            width = currentWidth;
                            height = orientation === CardOrientation.VERTICAL
                              ? Math.round(currentWidth * 1.15)
                              : Math.round(currentWidth / 1.15);
                          } else {
                            // For other geometric shapes (TRIANGLE, CIRCLE), use existing normalization logic
                            let tokenShapeForNorm: TokenShape;
                            if (cardShape === CardShape.TRIANGLE) {
                              tokenShapeForNorm = TokenShape.TRIANGLE;
                            } else if (cardShape === CardShape.CIRCLE) {
                              tokenShapeForNorm = TokenShape.CIRCLE;
                            } else {
                              tokenShapeForNorm = TokenShape.SQUARE;
                            }
                            const normalized = normalizeShapeSizes(tokenShapeForNorm, currentWidth, currentHeight);
                            width = normalized.width;
                            height = normalized.height;
                          }
                        } else {
                          // For tokens, use shape
                          const tokenShapeForNorm = (data as any).shape || TokenShape.SQUARE;
                          const normalized = normalizeShapeSizes(tokenShapeForNorm, currentWidth, currentHeight);
                          width = normalized.width;
                          height = normalized.height;
                        }

                        if (isArchetype) {
                          update('defaultSize', { ...(data as any).defaultSize, width, height });
                        } else {
                          update('width', width);
                          update('height', height);
                        }
                      }}
                      className={`w-9 h-9 rounded border-2 flex items-center justify-center transition-colors bg-slate-700 border-slate-600 hover:bg-slate-600 hover:border-slate-500`}
                      title={translate('Normalize to perfect shape', language as Locale)}
                    >
                      <Maximize2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Rotation Step Settings - for objects that can be rotated */}
                {(isDeck || isCard || isToken || isBoard || isDice || isCounter || isNexusCell || isArchetype) && (
                  <div className="pt-2">
                    <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Rotation Step (°)', language as Locale)}</label>
                    <select
                      value={(data as any).rotationStep ?? 45}
                      onChange={(e) => update('rotationStep', Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                    >
                      <option value={15}>15°</option>
                      <option value={30}>30°</option>
                      <option value={45}>45°</option>
                      <option value={60}>60°</option>
                      <option value={90}>90°</option>
                      <option value={180}>180°</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Counter Settings */}
              {isCounter && (
                <div className="pt-4 space-y-3">
                  <h4 className="text-sm font-bold text-gray-300">{translate('Counter Limits', language as Locale)}</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Base Value', language as Locale)}</label>
                      <input
                        type="number"
                        value={(data as Counter).baseValue ?? 0}
                        onChange={e => update('baseValue', Number(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Max Value (optional)', language as Locale)}</label>
                      <input
                        type="number"
                        value={(data as Counter).maxValue ?? ''}
                        onChange={e => update('maxValue', e.target.value ? Number(e.target.value) : undefined)}
                        placeholder={translate('No limit', language as Locale)}
                        className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between bg-slate-900 rounded px-3 py-2">
                    <label className="text-xs text-gray-400">{translate('Allow Negative Values', language as Locale)}</label>
                    <button
                      onClick={() => update('allowNegative', !(data as Counter).allowNegative)}
                      className={`w-10 h-5 rounded-full transition-colors ${
                        (data as Counter).allowNegative ? 'bg-green-600' : 'bg-slate-700'
                      }`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                        (data as Counter).allowNegative ? 'translate-x-5' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>
                </div>
              )}

              {/* Deck Display Settings (for decks) */}
              {isDeck && (
                <>
                  <div className="flex items-center justify-between bg-slate-900 rounded px-3 py-2 mt-5 mb-2">
                    <label className="text-xs text-gray-400 flex items-center gap-2">
                      <Eye size={12} />
                      {translate('Show Top Card', language as Locale)}
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

                  <div className="grid grid-cols-2 gap-2 mb-5">
                    <div className="flex items-center justify-between bg-slate-900 rounded px-3 py-2">
                      <label className="text-xs text-gray-400 flex items-center gap-1">
                        <Layers size={12} />
                        {translate('Show Deck Back', language as Locale)}
                      </label>
                      <button
                        onClick={() => {
                          const newValue = !(data as Deck).showDeckBack;
                          update('showDeckBack', newValue);
                          // Disable showTopCardBack when enabling showDeckBack
                          if (newValue) {
                            update('showTopCardBack', false);
                          }
                        }}
                        className={`w-10 h-5 rounded-full transition-colors ${
                          (data as Deck).showDeckBack ? 'bg-green-600' : 'bg-slate-700'
                        }`}
                      >
                        <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                          (data as Deck).showDeckBack ? 'translate-x-5' : 'translate-x-0.5'
                        }`} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between bg-slate-900 rounded px-3 py-2">
                      <label className="text-xs text-gray-400 flex items-center gap-1">
                        <Layers size={12} />
                        {translate('Show Top Card Back', language as Locale)}
                      </label>
                      <button
                        onClick={() => {
                          const newValue = !(data as Deck).showTopCardBack;
                          update('showTopCardBack', newValue);
                          // Disable showDeckBack when enabling showTopCardBack
                          if (newValue) {
                            update('showDeckBack', false);
                          }
                        }}
                        className={`w-10 h-5 rounded-full transition-colors ${
                          (data as Deck).showTopCardBack ? 'bg-green-600' : 'bg-slate-700'
                        }`}
                      >
                        <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                          (data as Deck).showTopCardBack ? 'translate-x-5' : 'translate-x-0.5'
                        }`} />
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* Color + Border Color + Shape (for tokens and battlefield cells) - side by side, equal width */}
              {(isToken || isArchetype || isBattlefieldCell) && !isBoard && (
                <div className="rounded p-2 mb-1">
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Color', language as Locale)}</label>
                      <input
                        type="color"
                        value={data.color || '#ffffff'}
                        onChange={e => update('color', e.target.value)}
                        className="w-full h-10 bg-slate-900 border border-slate-700 rounded cursor-pointer"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Border', language as Locale)}</label>
                      <input
                        type="color"
                        value={(data as any).borderColor || '#ffffff'}
                        onChange={e => update('borderColor', e.target.value)}
                        className="w-full h-10 bg-slate-900 border border-slate-700 rounded cursor-pointer"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Shape', language as Locale)}</label>
                      <select
                        value={(data as Token | BattlefieldCell).shape}
                        onChange={e => update('shape', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm h-10"
                      >
                        <option value={TokenShape.SQUARE}>{translate('Square', language as Locale)}</option>
                        <option value={TokenShape.CIRCLE}>{translate('Circle', language as Locale)}</option>
                        <option value={TokenShape.HEX}>{translate('Hex', language as Locale)}</option>
                        <option value={TokenShape.TRIANGLE}>{translate('Triangle', language as Locale)}</option>
                      </select>
                    </div>
                  </div>

                  {/* Opacity and Border settings (for tokens, token types, and battlefield cells) */}
                  <div className="grid grid-cols-3 gap-x-2 gap-y-0.5">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Opacity', language as Locale)}</label>
                    <div className="flex items-center">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={(data as any).opacity ?? 100}
                        onChange={e => update('opacity', parseInt(e.target.value))}
                        className="flex-1 accent-purple-500"
                      />
                      <span className="text-xs text-gray-400 w-6 text-right">{(data as any).opacity ?? 100}</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Border Opacity', language as Locale)}</label>
                    <div className="flex items-center">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={(data as any).borderOpacity ?? 100}
                        onChange={e => update('borderOpacity', parseInt(e.target.value))}
                        className="flex-1 accent-purple-500"
                      />
                      <span className="text-xs text-gray-400 w-6 text-right">{(data as any).borderOpacity ?? 100}</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Border Width', language as Locale)}</label>
                    <div className="flex items-center">
                      <input
                        type="range"
                        min="0"
                        max="20"
                        value={(data as any).borderWidth ?? 2}
                        onChange={e => update('borderWidth', parseInt(e.target.value))}
                        className="flex-1 accent-purple-500"
                      />
                      <span className="text-xs text-gray-400 w-6 text-right">{(data as any).borderWidth ?? 2}</span>
                    </div>
                  </div>
                  </div>
                </div>
              )}

              {/* Snap to Grid setting (for battlefield cells) */}
              {isBattlefieldCell && (
                <div className="flex items-center justify-between bg-slate-900 rounded px-3 py-2 mb-4">
                  <label className="text-xs text-gray-400 flex items-center gap-2">
                    <Grid3x3 size={12} />
                    {translate('Snap Objects to Grid', language as Locale)}
                  </label>
                  <button
                    onClick={() => update('snapToGrid', !(data as any).snapToGrid)}
                    className={`w-10 h-5 rounded-full transition-colors ${
                      (data as any).snapToGrid ? 'bg-green-600' : 'bg-slate-700'
                    }`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                      (data as any).snapToGrid ? 'translate-x-5' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>
              )}

              {/* Image URL (for tokens and token types) */}
              {(isToken || isArchetype) && !isBoard && (
                <FilePickerInput
                  value={data.content || ''}
                  onChange={value => update('content', value)}
                  label={translate('Image URL', language as Locale)}
                  className="w-full"
                />
              )}

              {/* Effect Template - Image URL and Pivot settings */}
              {isEffectTemplate && (
                <>
                  <div className="mt-4 space-y-3">
                    <label className="block text-xs font-bold text-purple-400 mb-2">{t({ en: 'Effect Template Settings', ru: 'Настройки эффекта' })}</label>

                    {/* Image URL */}
                    <FilePickerInput
                      value={data.content || ''}
                      onChange={value => update('content', value)}
                      label={t({ en: 'Effect Image URL (PNG with transparency)', ru: 'URL изображения эффекта (PNG с прозрачностью)' })}
                      className="w-full"
                    />

                    {/* Opacity Slider */}
                    <div>
                      <label className="block text-xs font-bold text-gray-400 mb-1 flex items-center justify-between">
                        <span>{t({ en: 'Opacity', ru: 'Прозрачность' })}</span>
                        <span className="text-white">{(data as EffectTemplate).opacity ?? 100}%</span>
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={(data as EffectTemplate).opacity ?? 100}
                        onChange={e => update('opacity', Number(e.target.value))}
                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                        style={{ appearance: 'auto' }}
                      />
                    </div>

                    {/* Pivot Point X and Y - in one row */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-bold text-gray-400 mb-1">
                          {t({ en: 'Pivot X (%)', ru: 'Точка вращения X (%)' })}
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={roundToHundredths((data as EffectTemplate).pivot?.x ?? 50)}
                          onChange={e => updatePivotWithMarkerDistance({ ...((data as EffectTemplate).pivot || { x: 50, y: 50 }), x: Math.max(0, Math.min(100, Number(e.target.value))) })}
                          className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-400 mb-1">
                          {t({ en: 'Pivot Y (%)', ru: 'Точка вращения Y (%)' })}
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={roundToHundredths((data as EffectTemplate).pivot?.y ?? 50)}
                          onChange={e => updatePivotWithMarkerDistance({ ...((data as EffectTemplate).pivot || { x: 50, y: 50 }), y: Math.max(0, Math.min(100, Number(e.target.value))) })}
                          className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                        />
                      </div>
                    </div>

                    {/* Pivot presets */}
                    <div>
                      <label className="block text-xs font-bold text-gray-400 mb-1">{t({ en: 'Quick Presets', ru: 'Быстрые пресеты' })}</label>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          onClick={() => updatePivotWithMarkerDistance({ x: 50, y: 50 })}
                          className="bg-slate-700 hover:bg-slate-600 text-gray-300 text-xs py-1 px-2 rounded"
                        >
                          {t({ en: 'Center', ru: 'Центр' })}
                        </button>
                        <button
                          onClick={() => updatePivotWithMarkerDistance({ x: 50, y: 100 })}
                          className="bg-slate-700 hover:bg-slate-600 text-gray-300 text-xs py-1 px-2 rounded"
                        >
                          {t({ en: 'Bottom', ru: 'Низ' })}
                        </button>
                        <button
                          onClick={() => updatePivotWithMarkerDistance({ x: 50, y: 0 })}
                          className="bg-slate-700 hover:bg-slate-600 text-gray-300 text-xs py-1 px-2 rounded"
                        >
                          {t({ en: 'Top', ru: 'Верх' })}
                        </button>
                      </div>
                    </div>

                    {/* Effect Template Options */}
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      {/* Show Width Marker Toggle */}
                      <div className={`flex items-center justify-between bg-slate-900 rounded px-3 py-2 ${!(data as EffectTemplate).proportionalScaling ? '' : 'opacity-50'}`}>
                        <label className="text-xs text-gray-400 flex items-center gap-1">
                          <Maximize2 size={12} />
                          {t({ en: 'Show Width Marker', ru: 'Показывать маркер ширины' })}
                        </label>
                        <button
                          onClick={() => {
                            if (!(data as EffectTemplate).proportionalScaling) {
                              update('showWidthMarker', !((data as EffectTemplate).showWidthMarker ?? true));
                            }
                          }}
                          disabled={!!(data as EffectTemplate).proportionalScaling}
                          className={`w-10 h-5 rounded-full transition-colors ${(data as EffectTemplate).showWidthMarker ?? true ? 'bg-green-600' : 'bg-slate-700'} disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                          <div className={`w-4 h-4 bg-white rounded-full transition-transform ${(data as EffectTemplate).showWidthMarker ?? true ? 'translate-x-5' : 'translate-x-0.5'}`} />
                        </button>
                      </div>

                      {/* Proportional Scaling Toggle */}
                      <div className="flex items-center justify-between bg-slate-900 rounded px-3 py-2">
                        <label className="text-xs text-gray-400 flex items-center gap-1">
                          <Minimize size={12} />
                          {t({ en: 'Proportional Scaling', ru: 'Пропорциональное изменение' })}
                        </label>
                        <button
                          onClick={() => {
                            const newValue = !((data as EffectTemplate).proportionalScaling ?? false);
                            // When enabling proportional scaling, disable showWidthMarker
                            if (newValue) {
                              updateMultiple({ proportionalScaling: newValue, showWidthMarker: false });
                            } else {
                              // When disabling proportional scaling, enable showWidthMarker
                              updateMultiple({ proportionalScaling: newValue, showWidthMarker: true });
                            }
                          }}
                          className={`w-10 h-5 rounded-full transition-colors ${(data as EffectTemplate).proportionalScaling ?? false ? 'bg-green-600' : 'bg-slate-700'}`}
                        >
                          <div className={`w-4 h-4 bg-white rounded-full transition-transform ${(data as EffectTemplate).proportionalScaling ?? false ? 'translate-x-5' : 'translate-x-0.5'}`} />
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Max Copies (for token types only) */}
              {isArchetype && (
                <div className="mt-4">
                  <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Maximum Copies', language as Locale)}</label>
                  <input
                    type="number"
                    min="0"
                    value={(data as any).maxCopies ?? 0}
                    onChange={e => update('maxCopies', e.target.value ? Number(e.target.value) : 0)}
                    placeholder={translate('0 = unlimited', language as Locale)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">{translate('Maximum number of tokens that can be created from this type. Set to 0 for unlimited.', language as Locale)}</p>
                </div>
              )}

              {/* Auto-generate names (for token types only) */}
              {isArchetype && (
                <div className="mt-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={(data as any).autoName ?? false}
                      onChange={e => update('autoName', e.target.checked)}
                      className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-xs font-bold text-gray-400">{translate('Auto-generate names', language as Locale)}</span>
                  </label>
                  <p className="text-xs text-gray-500 mt-1">{translate('Automatically number tokens as they are created (e.g., "Goblin 1", "Goblin 2").', language as Locale)}</p>
                </div>
              )}

              {/* Name Prefix (for token types with auto-name) */}
              {isArchetype && (data as any).autoName && (
                <div className="mt-4">
                  <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Name Prefix', language as Locale)}</label>
                  <input
                    type="text"
                    value={(data as any).namePrefix ?? data.name ?? ''}
                    onChange={e => update('namePrefix', e.target.value)}
                    placeholder={translate('Goblin', language as Locale)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">{translate('Prefix used for auto-generated names. Tokens will be named "Prefix 1", "Prefix 2", etc.', language as Locale)}</p>
                </div>
              )}

              {/* Spawn Count (for token types - display only) */}
              {isArchetype && (data as any).autoName && (
                <div className="mt-4">
                  <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Tokens Created', language as Locale)}</label>
                  <div className="bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm">
                    {(data as any).spawnCount ?? 0}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{translate('Number of tokens that have been created from this type.', language as Locale)}</p>
                </div>
              )}

              {/* Color + Image URL (for boards) - side by side, Color is smaller */}
              {isBoard && (
                <div className="grid grid-cols-[80px_1fr] gap-2">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Color', language as Locale)}</label>
                    <input
                      type="color"
                      value={data.color || '#ffffff'}
                      onChange={e => update('color', e.target.value)}
                      className="w-full h-10 bg-slate-900 border border-slate-700 rounded cursor-pointer"
                    />
                  </div>
                  <div className="relative">
                    <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Background Image URL', language as Locale)}</label>
                    <FilePickerInput
                      value={data.content || ''}
                      onChange={value => update('content', value)}
                      className="w-full !h-10"
                      maxSize={10 * 1024 * 1024} // 10MB for board backgrounds
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Background Image Opacity', language as Locale)}</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={(data as any).backgroundOpacity ?? 100}
                        onChange={e => update('backgroundOpacity', parseInt(e.target.value))}
                        className="flex-1 accent-purple-500"
                      />
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={(data as any).backgroundOpacity ?? 100}
                        onChange={e => update('backgroundOpacity', Math.max(0, Math.min(100, parseInt(e.target.value) || 100)))}
                        className="w-16 bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm text-center"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Color (for drawings) */}
              {isDrawing && (
                <>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Drawing Color', language as Locale)}</label>
                  <div className="flex items-center">
                    <input
                      type="color"
                      value={(data as Drawing).color || ((data as Drawing).strokes.length > 0 ? (data as Drawing).strokes[0].color : '#ef4444')}
                      onChange={e => update('color', e.target.value)}
                      className="w-12 h-10 bg-slate-900 border border-slate-700 rounded cursor-pointer flex-shrink-0"
                    />
                    <input
                      type="text"
                      value={(data as Drawing).color || ((data as Drawing).strokes.length > 0 ? (data as Drawing).strokes[0].color : '#ef4444')}
                      onChange={e => update('color', e.target.value)}
                      className="flex-1 bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                      placeholder="#ef4444"
                    />
                  </div>
                </div>

                {/* Opacity */}
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Opacity', language as Locale)}: {Math.round((data as Drawing).opacity || 100)}%</label>
                  <div className="flex items-center">
                    <input
                      type="range"
                      min="1"
                      max="100"
                      value={(data as Drawing).opacity || 100}
                      onChange={e => update('opacity', parseInt(e.target.value))}
                      className="flex-1 bg-slate-700 rounded-lg appearance-none cursor-pointer slider-input"
                    />
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={(data as Drawing).opacity || 100}
                      onChange={e => update('opacity', Math.max(1, Math.min(100, parseInt(e.target.value) || 100)))}
                      className="w-16 bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm text-center"
                    />
                  </div>
                </div>
                </>
              )}

              {/* Dice Settings (for dice objects) */}
              {isDice && (
                <div className="pt-4 space-y-3">
                  <h4 className="text-sm font-bold text-gray-300 flex items-center gap-2">
                    <Dices size={14} /> {translate('Dice Settings', language as Locale)}
                  </h4>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Number of Sides', language as Locale)}: {(data as DiceObject).sides || 6}</label>
                    <div className="flex items-center">
                      <input
                        type="range"
                        min="2"
                        max="100"
                        value={(data as DiceObject).sides || 6}
                        onChange={e => { const sides = parseInt(e.target.value); update('sides', sides); }}
                        className="flex-1 bg-slate-700 rounded-lg appearance-none cursor-pointer slider-input"
                      />
                      <input
                        type="number"
                        min="2"
                        max="100"
                        value={(data as DiceObject).sides || 6}
                        onChange={e => update('sides', Math.max(2, Math.min(100, parseInt(e.target.value) || 6)))}
                        className="ml-2 w-16 bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm text-center"
                      />
                    </div>
                  </div>

                  {/* Color + Border Color + Shape - side by side, equal width */}
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Color', language as Locale)}</label>
                      <input
                        type="color"
                        value={data.color || '#6366f1'}
                        onChange={e => update('color', e.target.value)}
                        className="w-full h-10 bg-slate-900 border border-slate-700 rounded cursor-pointer"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Border', language as Locale)}</label>
                      <input
                        type="color"
                        value={(data as any).borderColor || '#4f46e5'}
                        onChange={e => update('borderColor', e.target.value)}
                        className="w-full h-10 bg-slate-900 border border-slate-700 rounded cursor-pointer"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Shape', language as Locale)}</label>
                      <select
                        value={(data as DiceObject).shape || TokenShape.SQUARE}
                        onChange={e => {
                          const newShape = e.target.value as TokenShape;
                          update('shape', newShape);
                          // Adjust height based on shape
                          if (newShape === TokenShape.CIRCLE || newShape === TokenShape.SQUARE) {
                            update('height', data.width);
                          } else if (newShape === TokenShape.HEX) {
                            update('height', Math.round(data.width * 1.15));
                          } else if (newShape === TokenShape.TRIANGLE) {
                            update('height', Math.round(data.width * Math.sqrt(3) / 2));
                          }
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                      >
                        <option value={TokenShape.SQUARE}>{translate('Square', language as Locale)}</option>
                        <option value={TokenShape.CIRCLE}>{translate('Circle', language as Locale)}</option>
                        <option value={TokenShape.HEX}>{translate('Hex', language as Locale)}</option>
                        <option value={TokenShape.TRIANGLE}>{translate('Triangle', language as Locale)}</option>
                      </select>
                    </div>
                  </div>

                  {/* Opacity, Border Opacity, Border Width */}
                  <div className="grid grid-cols-3 gap-x-2 gap-y-0.5">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Opacity', language as Locale)}</label>
                      <div className="flex items-center">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={(data as any).opacity ?? 100}
                          onChange={e => update('opacity', parseInt(e.target.value))}
                          className="flex-1 accent-purple-500"
                        />
                        <span className="text-xs text-gray-400 w-6 text-right">{(data as any).opacity ?? 100}</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Border Opacity', language as Locale)}</label>
                      <div className="flex items-center">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={(data as any).borderOpacity ?? 100}
                          onChange={e => update('borderOpacity', parseInt(e.target.value))}
                          className="flex-1 accent-purple-500"
                        />
                        <span className="text-xs text-gray-400 w-6 text-right">{(data as any).borderOpacity ?? 100}</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Border Width', language as Locale)}</label>
                      <div className="flex items-center">
                        <input
                          type="range"
                          min="0"
                          max="20"
                          value={(data as any).borderWidth ?? 3}
                          onChange={e => update('borderWidth', parseInt(e.target.value))}
                          className="flex-1 accent-purple-500"
                        />
                        <span className="text-xs text-gray-400 w-6 text-right">{(data as any).borderWidth ?? 3}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Grid Settings (for boards) */}
              {isBoard && (
                <div className="pt-4 space-y-3">
                  <h4 className="text-sm font-bold text-gray-300 flex items-center gap-2">
                    <Grid3x3 size={14} /> {translate('Grid Settings', language as Locale)}
                  </h4>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Grid Type', language as Locale)}</label>
                    <select
                      value={(data as Board).gridType || GridType.NONE}
                      onChange={e => {
                        const newGridType = e.target.value as GridType;
                        const board = data as Board;
                        const isCurrentlyHex = board.gridType === GridType.HEX || board.gridType === GridType.HEX_HORIZONTAL;

                        update('gridType', newGridType);

                        // Always normalize dimensions when switching to HEX grids
                        if (newGridType === GridType.HEX) {
                          // Pointy-top hex: use default width if not already set
                          const width = board.gridWidth || DEFAULT_HEX_WIDTH;
                          const height = calculateHexHeight(width);
                          updateMultiple({
                            gridWidth: width,
                            gridHeight: Math.round(height * 100) / 100
                          });
                          setLinkGridSize(true);  // Force link for pointy-top hex grids
                        } else if (newGridType === GridType.HEX_HORIZONTAL) {
                          // Flat-top hex: use default width if not already set
                          const width = board.gridWidth || DEFAULT_FLAT_HEX_WIDTH;
                          const height = calculateFlatHexHeight(width);
                          updateMultiple({
                            gridWidth: width,
                            gridHeight: height
                          });
                          setLinkGridSize(true);  // Force link for flat-top hex grids
                        } else if (newGridType === GridType.CUSTOM) {
                          // Custom grid - clear any custom grid cells when switching to CUSTOM
                          // User will need to generate new ones
                          updateMultiple({
                            customGridCells: [],
                            customGridImage: undefined
                          });
                        } else {
                          // Not a hex grid (SQUARE or NONE) - unlink proportions (allow independent width/height)
                          setLinkGridSize(false);
                          updateMultiple({ linkGridSize: false, customGridCells: undefined });
                        }
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                    >
                      {Object.values(GridType).map(v => (
                        <option
                          key={v}
                          value={v}
                          disabled={v === GridType.CUSTOM && !customGridUnlocked}
                        >
                          {translateGridType(v, language)}
                        </option>
                      ))}
                    </select>
                  </div>
                  {/* Grid Cell Width and Height with Normalize button */}
                  <div className="grid grid-cols-[1fr_auto_1fr_auto] gap-2 items-end">
                    <div>
                          <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Grid Width (vu)', language as Locale)}</label>
                          <input
                            type="number"
                            step="0.01"
                            value={(data as Board).gridWidth || (() => {
                              const board = data as Board;
                              if (board.gridType === GridType.HEX) return DEFAULT_HEX_WIDTH;
                              if (board.gridType === GridType.HEX_HORIZONTAL) return DEFAULT_FLAT_HEX_WIDTH;
                              return board.gridSize || 50;
                            })() || 50}
                            onChange={e => {
                          const value = parseFloat(e.target.value);
                          const board = data as Board;
                          const gridType = board.gridType;
                          const isPointyHex = gridType === GridType.HEX;

                          if (linkGridSize || isPointyHex) {
                            // For pointy-top hex, height = width * HEX_RATIO
                            // For flat-top hex, height = width / HEX_RATIO
                            const isFlatHex = gridType === GridType.HEX_HORIZONTAL;
                            const height = isFlatHex ? calculateFlatHexHeight(value) : calculateHexHeight(value);
                            const roundHeight = shouldRound(value);
                            updateMultiple({
                              gridWidth: value,
                              gridHeight: roundHeight ? Math.round(height * 100) / 100 : height,
                              gridSize: Math.round(value) // Sync gridSize for backward compatibility
                            });
                          } else {
                            // For square grid when not linked, still update gridHeight to match
                            updateMultiple({
                              gridWidth: value,
                              gridHeight: value,
                              gridSize: value
                            });
                          }
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                      />
                    </div>
                    <div className="flex items-end pb-0.5">
                      <button
                        onClick={() => {
                          const board = data as Board;
                          const gridType = board.gridType;
                          const isHexGrid = gridType === GridType.HEX || gridType === GridType.HEX_HORIZONTAL;

                          // Cannot unlink proportions for hex grids
                          if (isHexGrid) return;

                          const newState = !linkGridSize;
                          setLinkGridSize(newState);
                          // Save to object
                          updateMultiple({ linkGridSize: newState });
                        }}
                        disabled={(data as Board).gridType === GridType.HEX || (data as Board).gridType === GridType.HEX_HORIZONTAL}
                        className={`w-[30px] h-[30px] rounded border-2 flex items-center justify-center transition-colors ${
                          (data as Board).gridType === GridType.HEX || (data as Board).gridType === GridType.HEX_HORIZONTAL
                            ? 'bg-purple-600 border-purple-500 cursor-not-allowed'
                            : linkGridSize
                            ? 'bg-blue-600 border-blue-500 hover:bg-blue-500'
                            : 'bg-slate-700 border-slate-600 hover:bg-slate-600'
                        }`}
                        title={linkGridSize ? translate('Unlink proportions', language as Locale) : translate('Link proportions', language as Locale)}
                      >
                        <Link size={14} />
                      </button>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Grid Height (vu)', language as Locale)}</label>
                      <input
                        type="number"
                        step="0.01"
                        disabled={(data as Board).gridType === GridType.HEX || (data as Board).gridType === GridType.HEX_HORIZONTAL}
                        value={(data as Board).gridHeight || (() => {
                          const board = data as Board;
                          if (board.gridType === GridType.HEX) return Math.round(DEFAULT_HEX_WIDTH * HEX_RATIO * 100) / 100;  // 115
                          if (board.gridType === GridType.HEX_HORIZONTAL) return DEFAULT_HEX_WIDTH;  // 100
                          return board.gridSize || 50;
                        })() || 50}
                        onChange={e => {
                          const board = data as Board;
                          const gridType = board.gridType;
                          const isPointyHex = gridType === GridType.HEX;

                          const value = parseFloat(e.target.value);
                          if (linkGridSize || isPointyHex) {
                            // For pointy-top hex grids: width = height / HEX_RATIO
                            // For flat-top hex grids: width = height * HEX_RATIO
                            const isFlatHex = gridType === GridType.HEX_HORIZONTAL;
                            const width = isFlatHex ? value * HEX_RATIO : value / HEX_RATIO;
                            const roundWidth = shouldRound(value);
                            updateMultiple({
                              gridHeight: value,
                              gridWidth: roundWidth ? Math.round(width * 100) / 100 : width,
                              gridSize: Math.round((width + value) / 2) // Average for hex grids
                            });
                          } else {
                            // For square grid when not linked, still update gridWidth to match
                            updateMultiple({
                              gridHeight: value,
                              gridWidth: value,
                              gridSize: value
                            });
                          }
                        }}
                        className={`w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm ${
                          (data as Board).gridType === GridType.HEX || (data as Board).gridType === GridType.HEX_HORIZONTAL
                            ? 'opacity-50 cursor-not-allowed'
                            : ''
                        }`}
                      />
                    </div>
                    <div className="flex items-end pb-0.5">
                      <button
                        onClick={() => {
                          const board = data as Board;
                          const gridType = board.gridType;
                          const currentWidth = board.gridWidth || board.gridSize || 50;

                          // Normalize based on grid type
                          if (gridType === GridType.HEX) {
                            // Pointy-top hex: height = width * sqrt(3) / 2
                            const height = calculateHexHeight(currentWidth);
                            updateMultiple({
                              gridWidth: currentWidth,
                              gridHeight: Math.round(height * 100) / 100
                            });
                          } else if (gridType === GridType.HEX_HORIZONTAL) {
                            // Flat-top hex: height = width / 1.15
                            const height = calculateFlatHexHeight(currentWidth);
                            updateMultiple({
                              gridWidth: currentWidth,
                              gridHeight: Math.round(height * 100) / 100
                            });
                          } else {
                            // Square grid: make both equal
                            const avgSize = ((board.gridWidth || board.gridSize || 50) + (board.gridHeight || board.gridSize || 50)) / 2;
                            updateMultiple({
                              gridWidth: avgSize,
                              gridHeight: avgSize
                            });
                          }
                        }}
                        className={`w-9 h-9 rounded border-2 flex items-center justify-center transition-colors bg-slate-700 border-slate-600 hover:bg-slate-600 hover:border-slate-500`}
                        title={translate('Normalize to perfect shape', language as Locale)}
                      >
                        <Maximize2 size={14} />
                      </button>
                    </div>
                  </div>
                  {/* Show Grid and Snap Objects to Grid on same line */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center justify-between bg-slate-900 rounded px-3 py-2">
                      <label className="text-xs text-gray-400 flex items-center gap-2">
                        <Grid3x3 size={12} />
                        {translate('Snap Cards to Grid', language as Locale)}
                      </label>
                      <button
                        onClick={() => update('snapCardsToGrid', !(data as Board).snapCardsToGrid)}
                        className={`w-10 h-5 rounded-full transition-colors ${
                          (data as Board).snapCardsToGrid ? 'bg-green-600' : 'bg-slate-700'
                        }`}
                      >
                        <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                          (data as Board).snapCardsToGrid ? 'translate-x-5' : 'translate-x-0.5'
                        }`} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between bg-slate-900 rounded px-3 py-2">
                      <label className="text-xs text-gray-400 flex items-center gap-2">
                        <Grid3x3 size={12} />
                        {translate('Snap Tokens to Grid', language as Locale)}
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
                    <div className="flex items-center justify-between bg-slate-900 rounded px-3 py-2">
                      <label className="text-xs text-gray-400 flex items-center gap-2">
                        <Grid3x3 size={12} />
                        {translate('Snap Rotation to Grid', language as Locale)}
                      </label>
                      <button
                        onClick={() => update('snapRotationToGrid', !(data as Board).snapRotationToGrid)}
                        className={`w-10 h-5 rounded-full transition-colors ${
                          (data as Board).snapRotationToGrid ? 'bg-green-600' : 'bg-slate-700'
                        }`}
                      >
                        <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                          (data as Board).snapRotationToGrid ? 'translate-x-5' : 'translate-x-0.5'
                        }`} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between bg-slate-900 rounded px-3 py-2">
                      <label className="text-xs text-gray-400 flex items-center gap-2">
                        <Eye size={12} />
                        {translate('Show Grid', language as Locale)}
                      </label>
                      <button
                        onClick={() => update('showGrid', (data as Board).showGrid === false ? true : false)}
                        className={`w-10 h-5 rounded-full transition-colors ${
                          (data as Board).showGrid !== false ? 'bg-green-600' : 'bg-slate-700'
                        }`}
                      >
                        <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                          (data as Board).showGrid !== false ? 'translate-x-5' : 'translate-x-0.5'
                        }`} />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Custom Grid Generation from Image - only show for CUSTOM grid type */}
              {isBoard && (data as Board).gridType === GridType.CUSTOM && (
                <div className="pt-4 space-y-3">
                    <h4 className="text-sm font-bold text-gray-300 flex items-center gap-2">
                      <Sparkles size={14} /> {t({ en: 'Generate Grid from Image', ru: 'Генерация сетки из изображения', uk: 'Генерація сітки зі зображення', be: 'Генерацыя сеткі з выявы', sr: 'Generisanje mreže iz slike' })}
                    </h4>
                    <p className="text-xs text-gray-500">
                      {t({ en: 'Upload a schematic image to automatically detect and create grid cells.', ru: 'Загрузите схематическое изображение для автоматического обнаружения и создания ячеек сетки.', uk: 'Завантажте схематичне зображення для автоматичного виявлення та створення комірок сітки.', be: 'Загрузіце схематычна выяўленне для аўтаматычнага выяўлення і стварэння ячэек сеткі.', sr: 'Поставите схематску слику за аутоматско детектовање и стварање ћелија мреже.' })}
                    </p>

                    {/* Image upload button */}
                    <div className="flex gap-2">
                      <label className="flex-1 cursor-pointer bg-blue-600 hover:bg-blue-500 text-white rounded p-2 text-sm flex items-center justify-center gap-2 transition-colors">
                        <Upload size={14} />
                        {isAnalyzingImage ? (
                          <>
                            <Loader2 size={14} className="animate-spin" />
                            {t({ en: 'Analyzing...', ru: 'Анализ...', uk: 'Аналіз...', be: 'Аналіз...', sr: 'Анализирам...' })}
                          </>
                        ) : (
                          t({ en: 'Upload Image', ru: 'Загрузить изображение', uk: 'Завантажити зображення', be: 'Загрузіць выяву', sr: 'Постави слику' })
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              handleGenerateGridFromImage(file);
                            }
                          }}
                          disabled={isAnalyzingImage}
                        />
                      </label>
                    </div>

                    {/* Preview and confirm */}
                    {gridGenPreview && (
                      <div className="space-y-2">
                        <div className="bg-slate-900 rounded p-2">
                          <img
                            src={gridGenPreview}
                            alt="Grid preview"
                            className="w-full h-auto max-h-48 object-contain"
                          />
                        </div>
                        <div className="text-xs text-gray-400 text-center space-y-1">
                          <div>
                            {t({
                              en: `Detected ${detectedCells.length} cells`,
                              ru: `Обнаружено ${detectedCells.length} ячеек`,
                              uk: `Виявлено ${detectedCells.length} комірок`,
                              be: `Выяўлена ${detectedCells.length} ячэек`,
                              sr: `Откривено ${detectedCells.length} ћелија`
                            })}
                          </div>
                          {gridDebugInfo && (
                            <div className="text-gray-500">
                              {t({
                                en: `Found ${gridDebugInfo.hLines} regions, ${gridDebugInfo.vLines} cells after filter`,
                                ru: `Найдено ${gridDebugInfo.hLines} областей, ${gridDebugInfo.vLines} ячеек после фильтра`,
                                uk: `Знайдено ${gridDebugInfo.hLines} областей, ${gridDebugInfo.vLines} комірок після фільтра`,
                                be: `Знойдзена ${gridDebugInfo.hLines} абласцей, ${gridDebugInfo.vLines} ячэек пасля фільтра`,
                                sr: `Пронађено ${gridDebugInfo.hLines} регија, ${gridDebugInfo.vLines} ћелија након филтерирања`
                              })}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={handleConfirmGridGeneration}
                            className="flex-1 bg-green-600 hover:bg-green-500 text-white rounded p-2 text-sm flex items-center justify-center gap-2 transition-colors"
                          >
                            <Check size={14} />
                            {t({ en: 'Create Cells', ru: 'Создать ячейки', uk: 'Створити комірки', be: 'Стварыць ячэйкі', sr: 'Креирај ћелије' })}
                          </button>
                          <button
                            onClick={() => {
                              setGridGenPreview(null);
                              setDetectedCells([]);
setGridDebugInfo(null);
                            }}
                            className="flex-1 bg-slate-700 hover:bg-slate-600 text-white rounded p-2 text-sm flex items-center justify-center gap-2 transition-colors"
                          >
                            {t({ en: 'Cancel', ru: 'Отмена', uk: 'Скасувати', be: 'Адмена', sr: 'Откажи' })}
                          </button>
                        </div>
                      </div>
                    )}
                </div>
              )}

              {/* Cell Size Settings (for NexusBoard) */}
              {isNexusBoard && (
                <div className="pt-4 space-y-3">
                  <h4 className="text-sm font-bold text-gray-300 flex items-center gap-2">
                    <Grid3x3 size={14} /> {translate('Cell Size Settings', language as Locale)}
                  </h4>
                  <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-end">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Cell Width (vu)', language as Locale)}</label>
                      <input
                        type="number"
                        step="1"
                        value={(data as any).cellWidth || 100}
                        onChange={e => {
                          const value = parseFloat(e.target.value);
                          // Update both width and height to maintain 1:1.15 proportion
                          const roundHeight = shouldRound(value);
                          updateMultiple({ cellWidth: value, cellHeight: roundHeight ? Math.round(value * 1.15 * 100) / 100 : value * 1.15 });
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                      />
                    </div>
                    <div className="flex items-end pb-0.5">
                      <button
                        disabled={true}
                        className="w-9 h-9 rounded border-2 flex items-center justify-center bg-purple-600 border-purple-500 cursor-not-allowed opacity-100"
                        title={translate('Proportions locked (1:1.15)', language as Locale)}
                      >
                        <Link size={14} />
                      </button>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Cell Height (vu)', language as Locale)}</label>
                      <input
                        type="number"
                        step="1"
                        disabled={true}
                        value={Math.round(((data as any).cellHeight ?? 150) * 100) / 100}
                        onChange={() => {}}
                        className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm cursor-not-allowed opacity-60"
                      />
                    </div>
                  </div>

                  {/* Magnetism Toggle */}
                  <div className="flex items-center justify-between pt-2">
                    <label className="text-sm text-gray-300">{translate('Enable Cell Magnetism', language as Locale)}</label>
                    <button
                      onClick={() => update('snapToGrid', !(data as any).snapToGrid)}
                      className={`w-12 h-6 rounded-full transition-colors ${(data as any).snapToGrid !== false ? 'bg-green-600' : 'bg-slate-600'}`}
                    >
                      <div className={`w-5 h-5 bg-white rounded-full transition-transform ${(data as any).snapToGrid !== false ? 'translate-x-6' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                  <p className="text-xs text-gray-400">{translate('When enabled, tokens snap to the center of cells', language as Locale)}</p>
                </div>
              )}

              {/* Tooltip Settings - not for drawings */}
              {!isDrawing && (
              <div className="pt-1 space-y-3">
                <h4 className="text-sm font-bold text-gray-300 flex items-center gap-2">
                  <Eye size={14} /> {translate('Tooltip Settings', language as Locale)}
                </h4>
                <div>
                  <textarea
                    value={(data as any).tooltipText || ''}
                    onChange={e => update('tooltipText', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm resize-none"
                    rows={5}
                  />
                </div>
                {/* Show Tooltip Text on Card (for cards only) */}
                {isCard && (
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-gray-400 flex items-center gap-2">
                      <FileText size={12} />
                      {translate('Show tooltip text on card', language as Locale)}
                    </label>
                    <button
                      onClick={() => update('showTextOnCard', !((data as Card).showTextOnCard))}
                      className={`w-10 h-5 rounded-full transition-colors ${
                        (data as Card).showTextOnCard ? 'bg-green-600' : 'bg-slate-700'
                      }`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                        (data as Card).showTextOnCard ? 'translate-x-5' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>
                )}
              </div>
              )}

              {/* Explosive Dice (for dice objects only) */}
              {isDice && (
                <div className="pt-1 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-gray-300 flex items-center gap-2">
                      <Target size={14} /> {translate('Explosive Dice', language as Locale)}
                    </h4>
                    <button
                      onClick={() => update('isExplosive', !((data as DiceObject).isExplosive))}
                      className={`w-10 h-5 rounded-full transition-colors ${
                        (data as DiceObject).isExplosive ? 'bg-green-600' : 'bg-slate-700'
                      }`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                        (data as DiceObject).isExplosive ? 'translate-x-5' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">{translate('If maximum value is rolled, roll again and add the results', language as Locale)}</p>

                  {/* Explosive Dice Colors */}
                  {(data as DiceObject).isExplosive && (
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      <div>
                        <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Color', language as Locale)}</label>
                        <input
                          type="color"
                          value={(data as DiceObject).explosiveColor || '#ffff00'}
                          onChange={e => update('explosiveColor', e.target.value)}
                          className="w-full h-10 bg-slate-900 border border-slate-700 rounded cursor-pointer"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Text Color', language as Locale)}</label>
                        <input
                          type="color"
                          value={(data as DiceObject).explosiveTextColor || '#ff0000'}
                          onChange={e => update('explosiveTextColor', e.target.value)}
                          className="w-full h-10 bg-slate-900 border border-slate-700 rounded cursor-pointer"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Glow', language as Locale)}</label>
                        <input
                          type="color"
                          value={(data as DiceObject).explosiveGlow || '#ff0000'}
                          onChange={e => update('explosiveGlow', e.target.value)}
                          className="w-full h-10 bg-slate-900 border border-slate-700 rounded cursor-pointer"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Alternative Card Back (for cards only) */}
              {isCard && (
                <div className="pt-2 space-y-3">
                  <h4 className="text-sm font-bold text-gray-300 flex items-center gap-2">
                    <RotateCw size={14} /> {translate('Alternative Card Back', language as Locale)}
                  </h4>

                  {/* URL Input */}
                  <FilePickerInput
                    value={(data as Card).alternativeBack?.url || ''}
                    onChange={value => update('alternativeBack', {
                      ...(data as Card).alternativeBack,
                      url: value,
                      locations: (data as Card).alternativeBack?.locations || [],
                      visibleToOthers: (data as Card).alternativeBack?.visibleToOthers ?? false
                    } as any)}
                    label={translate('Alternative Back URL', language as Locale)}
                    placeholder="https://example.com/alternative-back.png"
                    className="w-full"
                  />

                  {/* Preview */}
                  {(data as Card).alternativeBack?.url && (
                    <div className="bg-slate-900 rounded p-2 border border-slate-700 flex justify-center">
                      <img
                        src={(data as Card).alternativeBack!.url}
                        alt={`${translate('Alternative Card Back', language as Locale)} - ${translate('preview', language as Locale)}`}
                        className="max-w-24 max-h-32"
                        onError={(e) => { e.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2250%22 height=%2275%22%3E%3Crect fill=%22%231e293b%22 width=%2250%22 height=%2275%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 fill=%22%2364748b%22 dy=%22.3em%22 font-size=%2210%22%3EN/A%3C/text%3E%3C/svg%3E'; }}
                      />
                    </div>
                  )}

                  {/* Locations checkboxes - 2 columns */}
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-2">{translate('Show in locations:', language as Locale)}</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { key: 'TABLE', label: translate('Tabletop', language as Locale) },
                        { key: 'HAND', label: translate('Hand', language as Locale) },
                        { key: 'DECK', label: translate('Deck', language as Locale) },
                        { key: 'PILE', label: translate('Pile', language as Locale) },
                      ].map(loc => (
                        <label key={loc.key} className="flex items-center gap-2 p-2 rounded bg-slate-800 border border-slate-700 cursor-pointer hover:bg-slate-700">
                          <input
                            type="checkbox"
                            checked={(data as Card).alternativeBack?.locations?.includes(loc.key as any) || false}
                            onChange={e => {
                              const currentLocations = (data as Card).alternativeBack?.locations || [];
                              const newLocations = e.target.checked
                                ? [...currentLocations, loc.key as any]
                                : currentLocations.filter(l => l !== loc.key);
                              update('alternativeBack', {
                                ...(data as Card).alternativeBack,
                                url: (data as Card).alternativeBack?.url || '',
                                locations: newLocations,
                                visibleToOthers: (data as Card).alternativeBack?.visibleToOthers ?? false
                              } as any);
                            }}
                            className="w-4 h-4 rounded border-gray-500 bg-slate-900 text-purple-600 focus:ring-purple-500 flex-shrink-0"
                          />
                          <span className="text-gray-200 text-xs">{loc.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Visible to others toggle */}
                  <div className="flex items-center justify-between bg-slate-900 rounded px-3 py-2">
                    <label className="text-xs text-gray-400 flex items-center gap-2">
                      <Eye size={12} />
                      {translate('Visible to players who cannot see the face of the card', language as Locale)}
                    </label>
                    <button
                      onClick={() => update('alternativeBack', {
                        ...(data as Card).alternativeBack,
                        url: (data as Card).alternativeBack?.url || '',
                        locations: (data as Card).alternativeBack?.locations || [],
                        visibleToOthers: !((data as Card).alternativeBack?.visibleToOthers ?? false)
                      } as any)}
                      className={`w-10 h-5 rounded-full transition-colors ${
                        (data as Card).alternativeBack?.visibleToOthers ? 'bg-green-600' : 'bg-slate-700'
                      }`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                        (data as Card).alternativeBack?.visibleToOthers ? 'translate-x-5' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'actions' && (
            <div className="space-y-4">
              {/* Context Menu Actions - with PL and GM toggle buttons - not for drawings or panels */}
              {!isDrawing && !isPanel && (
              <div className="pt-2">
                <h4 className="text-sm font-bold text-gray-300 mb-2 flex items-center gap-2">
                  <Shield size={14} /> {translate('Context Menu Actions', language as Locale)}
                </h4>

                <div className="grid grid-cols-2 gap-1">
                  {(isDeck ? DECK_CONTEXT_MENU_ACTIONS : [...AVAILABLE_ACTIONS, ...(isDeck ? DECK_ACTIONS : [])])
                    .filter(action => {
                      // Drawings have no context menu actions
                      if (isDrawing) return false;
                      // Cards should ONLY use "Context Menu Actions for Cards" from deck settings
                      // Skip all card-specific actions in the general Context Menu Actions section
                      if (isCard && ['flip', 'layer', 'pin', 'pinToViewport'].includes(action.id)) {
                        return false;
                      }
                      // Tokens should not have flip action - they use States instead
                      if ((isToken || isArchetype) && action.id === 'flip') {
                        return false;
                      }
                      // Only tokens should have states action
                      if (!isToken && !isArchetype && action.id === 'states') {
                        return false;
                      }
                      // Exclude rotation and swing actions - they're controlled by 'rotate' section
                      if (['rotateClockwise', 'rotateCounterClockwise', 'swingClockwise', 'swingCounterClockwise'].includes(action.id)) {
                        return false;
                      }
                      // Exclude layer sub-actions - they're controlled by 'layer' section
                      if (['layerUp', 'layerDown', 'bringToFront', 'sendToBack'].includes(action.id)) {
                        return false;
                      }
                      // For decks, exclude individual deck actions that are controlled by section headers
                      if (isDeck && ['draw', 'playTopCard', 'millTopCard', 'toBottom', 'showTop', 'hideTop', 'returnAllAndShuffle', 'returnAllExceptHands'].includes(action.id)) {
                        return false;
                      }
                      // Card-specific actions - only for cards (not tokens, decks, boards, or battlefield cells)
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
                          const allActions = isDeck ? DECK_CONTEXT_MENU_ACTIONS : [...AVAILABLE_ACTIONS, ...(isDeck ? DECK_ACTIONS : [])];
                          update('allowedActions', allActions.filter((a: typeof action) => a.id !== action.id).map((a: typeof action) => a.id));
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
                          const allActions = isDeck ? DECK_CONTEXT_MENU_ACTIONS : [...AVAILABLE_ACTIONS, ...(isDeck ? DECK_ACTIONS : [])];
                          update('allowedActionsForGM', allActions.filter((a: typeof action) => a.id !== action.id).map((a: typeof action) => a.id));
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
                        className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-slate-700 transition-colors bg-slate-800 border border-slate-700"
                      >
                        <span className="text-gray-200 text-xs font-medium leading-tight flex-1 truncate">{action.label}</span>
                        <button
                          onClick={togglePlayer}
                          className={`w-7 h-7 rounded text-[10px] font-bold transition-colors flex-shrink-0 ${
                            isPlayerAllowed
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-900 text-gray-400 hover:text-gray-200'
                          }`}
                          title={translate('Player', language as Locale)}
                        >
                          PL
                        </button>
                        <button
                          onClick={toggleGM}
                          className={`w-7 h-7 rounded text-[10px] font-bold transition-colors flex-shrink-0 ${
                            isGMAllowed
                              ? 'bg-purple-600 text-white'
                              : 'bg-slate-900 text-gray-400 hover:text-gray-200'
                          }`}
                          title={translate('Game Master', language as Locale)}
                        >
                          GM
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
              )}

              {/* Action Buttons - 2 columns, max 4 selected */}
              <div className="pt-4">
                <h4 className="text-sm font-bold text-gray-300 mb-2 flex items-center gap-2">
                  <Settings size={14} /> {translate('Action Buttons', language as Locale)}
                  <span className="text-xs text-gray-500 font-normal">({translate('max 4', language as Locale)})</span>
                </h4>

                <div className="grid grid-cols-2 gap-2">
                  {[...AVAILABLE_ACTIONS, ...TOKEN_STATE_ACTIONS, ...(isDeck ? DECK_ACTIONS : [])].map((action) => {
                    const applicableTypes = getButtonApplicableTypes(action.id);
                    const isApplicable = applicableTypes.includes(data.type);
                    if (!isApplicable || isDrawing) return null;

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

              {/* Click Actions - not for drawings or panels */}
              {!isDrawing && !isPanel && (
              <div className="pt-4">
                <h4 className="text-sm font-bold text-gray-300 mb-2 flex items-center gap-2">
                  <MousePointer size={14} /> {translate('Double Click Action', language as Locale)}
                </h4>

                <div>
                  {/* Double Click */}
                  <div>
                    <select
                      value={(data as any).doubleClickAction || 'none'}
                      onChange={e => update('doubleClickAction', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                    >
                      {[...CLICK_ACTIONS, ...(isDeck ? DECK_ACTIONS : [])]
                        .filter(action => {
                          // 'none' is always available
                          if (action.id === 'none') return true;

                          // Deck-specific actions - only for decks, not cards, boards, or battlefield cells
                          if ((isCard || isBoard || isBattlefieldCell) && ['topDeck', 'returnAll', 'shuffleDeck', 'searchDeck', 'piles'].includes(action.id)) {
                            return false;
                          }
                          // Card-specific actions - only for cards (not tokens, decks, boards, or battlefield cells)
                          if ((isDeck || isBoard || isToken || isBattlefieldCell) && ['flip', 'moveTo'].includes(action.id)) {
                            return false;
                          }
                          // For boards and battlefield cells, only allow rotate/layer section actions
                          if (isBoard || isBattlefieldCell) {
                            const boardAllowedActions = ['rotate', 'layer'];
                            if (!boardAllowedActions.includes(action.id)) {
                              return false;
                            }
                          }
                          return true;
                        })
                        .map(action => (
                          <option key={action.id} value={action.id}>{action.label}</option>
                        ))}
                    </select>
                  </div>
                </div>
              </div>
              )}
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
                          placeholder={translate('Pile name', language as Locale)}
                        />
                        <button
                          onClick={() => removePile(index)}
                          className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition-colors"
                          title={translate('Remove pile', language as Locale)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        {/* Visible toggle */}
                        <div className="flex items-center justify-between bg-slate-900 rounded px-3 py-2">
                          <label className="text-xs text-gray-400">{translate('Visible', language as Locale)}</label>
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

                        {/* Show Top Card toggle */}
                        <div className="flex items-center justify-between bg-slate-900 rounded px-3 py-2">
                          <label className="text-xs text-gray-400 flex items-center gap-2">
                            <Eye size={12} />
                            {translate('Show Top Card', language as Locale)}
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
                      </div>

                      {/* Size dropdown */}
                      <div>
                        <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Size', language as Locale)}</label>
                        <select
                          value={pile.size ?? 1}
                          onChange={(e) => updatePile(index, 'size', Number(e.target.value) as PileSize)}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm"
                        >
                          <option value={1}>{translate('Full size', language as Locale)}</option>
                          <option value={0.5}>{translate('Half size', language as Locale)}</option>
                        </select>
                      </div>

                      {/* Position dropdown */}
                      <div>
                        <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Position', language as Locale)}</label>
                        <select
                          value={pile.position}
                          onChange={(e) => updatePile(index, 'position', e.target.value as PilePosition)}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm"
                        >
                          <option value="left">{translate('Left of deck', language as Locale)}</option>
                          <option value="right">{translate('Right of deck', language as Locale)}</option>
                          <option value="top">{translate('Above deck', language as Locale)}</option>
                          <option value="bottom">{translate('Below deck', language as Locale)}</option>
                          <option value="free">{translate('Free position', language as Locale)}</option>
                        </select>
                      </div>

                      {/* Free position coordinates */}
                      {pile.position === 'free' && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-bold text-gray-400 mb-1">{translate('X Position', language as Locale)}</label>
                            <input
                              type="number"
                              value={pile.x ?? 0}
                              onChange={(e) => updatePile(index, 'x', Number(e.target.value))}
                              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Y Position', language as Locale)}</label>
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
                          {translate('Mill Pile', language as Locale)}
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

          {activeTab === 'states' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <button
                  onClick={addState}
                  className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-medium rounded transition-colors"
                >
                  <Plus size={14} /> {translate('Add State', language as Locale)}
                </button>
              </div>

              {states.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">
                  {translate('No states configured. Click "Add State" to create one.', language as Locale)}
                </div>
              ) : (
                <>
                  {states.map((state, index) => (
                    <div key={state.id} className="space-y-2 border border-slate-600 rounded-lg p-3 bg-slate-800/50">
                      {/* State header with name, Font Color, Show name toggle, and delete button */}
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={state.name}
                          onChange={(e) => updateState(index, 'name', e.target.value)}
                          className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-sm font-medium"
                          placeholder={translate('State name', language as Locale)}
                        />
                        {/* Font Color */}
                        <div className="flex items-center gap-1">
                          <input
                            type="color"
                            value={state.fontColor || '#ffffff'}
                            onChange={(e) => updateState(index, 'fontColor', e.target.value)}
                            className="w-8 h-7 bg-slate-900 border border-slate-700 rounded cursor-pointer"
                            title={translate('Font Color', language as Locale)}
                          />
                          <button
                            onClick={() => resetStateField(index, 'fontColor')}
                            className={`w-[26px] h-[26px] rounded border flex items-center justify-center transition-colors shrink-0 ${
                              isStateFieldDifferent(index, 'fontColor')
                                ? 'bg-purple-600 border-purple-500'
                                : 'bg-slate-700 border-slate-600 hover:bg-slate-600'
                            }`}
                            title={translate('Use Token Default', language as Locale)}
                          >
                            <RotateCcw size={12} />
                          </button>
                        </div>
                        {/* Show Name on Token toggle */}
                        <button
                          onClick={() => updateState(index, 'showNameOnToken', !state.showNameOnToken)}
                          className={`w-9 h-5 rounded-full transition-colors ${
                            state.showNameOnToken ? 'bg-green-600' : 'bg-slate-700'
                          }`}
                          title={translate('Show name on token', language as Locale)}
                        >
                          <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                            state.showNameOnToken ? 'translate-x-5' : 'translate-x-0.5'
                          }`} />
                        </button>
                        <button
                          onClick={() => removeState(index)}
                          className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition-colors"
                          title={translate('Remove state', language as Locale)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {/* State properties */}
                      <div className="grid grid-cols-[1fr_auto_1fr_auto] gap-2 items-end">
                        {/* Width + Height + Rotation Step - side by side */}
                        <div className="col-span-4 grid grid-cols-3 gap-1">
                          {/* Width */}
                          <div>
                            <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Width', language as Locale)}</label>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                value={state.width ?? data.width ?? 0}
                                onChange={(e) => updateState(index, 'width', Number(e.target.value))}
                                className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-white text-sm"
                                min="0"
                              />
                              <button
                                onClick={() => resetStateField(index, 'width')}
                                className={`w-[30px] h-[30px] rounded border-2 flex items-center justify-center transition-colors shrink-0 ${
                                  isStateFieldDifferent(index, 'width')
                                    ? 'bg-purple-600 border-purple-500'
                                    : 'bg-slate-700 border-slate-600 hover:bg-slate-600'
                                }`}
                                title={translate('Use Token Default', language as Locale)}
                              >
                                <RotateCcw size={14} />
                              </button>
                            </div>
                          </div>

                          {/* Height */}
                          <div>
                            <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Height', language as Locale)}</label>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                value={state.height ?? data.height ?? 0}
                                onChange={(e) => updateState(index, 'height', Number(e.target.value))}
                                className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-white text-sm"
                                min="0"
                              />
                              <button
                                onClick={() => resetStateField(index, 'height')}
                                className={`w-[30px] h-[30px] rounded border-2 flex items-center justify-center transition-colors shrink-0 ${
                                  isStateFieldDifferent(index, 'height')
                                    ? 'bg-purple-600 border-purple-500'
                                    : 'bg-slate-700 border-slate-600 hover:bg-slate-600'
                                }`}
                                title={translate('Use Token Default', language as Locale)}
                              >
                                <RotateCcw size={14} />
                              </button>
                            </div>
                          </div>

                          {/* Rotation Step */}
                          <div>
                            <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Rotation Step', language as Locale)} (°)</label>
                            <div className="flex items-center gap-1">
                              <select
                                value={state.rotationStep ?? (data as any).rotationStep ?? 45}
                                onChange={(e) => updateState(index, 'rotationStep', Number(e.target.value))}
                                className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded px-1.5 py-1.5 text-white text-sm"
                              >
                                <option value={15}>15°</option>
                                <option value={30}>30°</option>
                                <option value={45}>45°</option>
                                <option value={60}>60°</option>
                                <option value={90}>90°</option>
                              </select>
                              <button
                                onClick={() => resetStateField(index, 'rotationStep')}
                                className={`w-[30px] h-[30px] rounded border-2 flex items-center justify-center transition-colors shrink-0 ${
                                  isStateFieldDifferent(index, 'rotationStep')
                                    ? 'bg-purple-600 border-purple-500'
                                    : 'bg-slate-700 border-slate-600 hover:bg-slate-600'
                                }`}
                                title={translate('Use Token Default', language as Locale)}
                              >
                                <RotateCcw size={14} />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Color + Border + Shape - side by side, equal width */}
                        <div className="col-span-4 grid grid-cols-3 gap-1">
                          {/* Color */}
                          <div>
                            <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Color', language as Locale)}</label>
                            <div className="flex items-center gap-1">
                              <input
                                type="color"
                                value={state.color || '#ffffff'}
                                onChange={(e) => updateState(index, 'color', e.target.value)}
                                className="flex-1 min-w-0 h-9 bg-slate-900 border border-slate-700 rounded cursor-pointer"
                              />
                              <button
                                onClick={() => resetStateField(index, 'color')}
                                className={`w-[30px] h-[30px] rounded border-2 flex items-center justify-center transition-colors shrink-0 ${
                                  isStateFieldDifferent(index, 'color')
                                    ? 'bg-purple-600 border-purple-500'
                                    : 'bg-slate-700 border-slate-600 hover:bg-slate-600'
                                }`}
                                title={translate('Use Token Default', language as Locale)}
                              >
                                <RotateCcw size={14} />
                              </button>
                            </div>
                          </div>

                          {/* Border Color */}
                          <div>
                            <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Border', language as Locale)}</label>
                            <div className="flex items-center gap-1">
                              <input
                                type="color"
                                value={state.borderColor || '#ffffff'}
                                onChange={(e) => updateState(index, 'borderColor', e.target.value)}
                                className="flex-1 min-w-0 h-9 bg-slate-900 border border-slate-700 rounded cursor-pointer"
                              />
                              <button
                                onClick={() => resetStateField(index, 'borderColor')}
                                className={`w-[30px] h-[30px] rounded border-2 flex items-center justify-center transition-colors shrink-0 ${
                                  isStateFieldDifferent(index, 'borderColor')
                                    ? 'bg-purple-600 border-purple-500'
                                    : 'bg-slate-700 border-slate-600 hover:bg-slate-600'
                                }`}
                                title={translate('Use Token Default', language as Locale)}
                              >
                                <RotateCcw size={14} />
                              </button>
                            </div>
                          </div>

                          {/* Shape */}
                          <div>
                            <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Shape', language as Locale)}</label>
                            <div className="flex items-center gap-1">
                              <select
                                value={state.shape || ''}
                                onChange={(e) => updateState(index, 'shape', e.target.value as TokenShape || undefined)}
                                className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded px-1.5 py-1.5 text-white text-sm"
                              >
                                <option value="">{translate('Default', language as Locale)}</option>
                                {Object.keys(TokenShape).map(key => (
                                  <option key={key} value={key}>{key}</option>
                                ))}
                              </select>
                              <button
                                onClick={() => resetStateField(index, 'shape')}
                                className={`w-[30px] h-[30px] rounded border-2 flex items-center justify-center transition-colors shrink-0 ${
                                  isStateFieldDifferent(index, 'shape')
                                    ? 'bg-purple-600 border-purple-500'
                                    : 'bg-slate-700 border-slate-600 hover:bg-slate-600'
                                }`}
                                title={translate('Use Token Default', language as Locale)}
                              >
                                <RotateCcw size={14} />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Opacity + Border Opacity + Border Width - sliders */}
                        <div className="col-span-4 grid grid-cols-3 gap-x-2 gap-y-0.5">
                          {/* Opacity */}
                          <div>
                            <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Opacity', language as Locale)}</label>
                            <div className="flex items-center">
                              <input
                                type="range"
                                min="0"
                                max="100"
                                value={state.opacity ?? (data as any).opacity ?? 100}
                                onChange={(e) => updateState(index, 'opacity', parseInt(e.target.value))}
                                className="flex-1 accent-purple-500"
                              />
                              <span className="text-xs text-gray-400 w-6 text-right">{state.opacity ?? (data as any).opacity ?? 100}</span>
                            </div>
                            <button
                              onClick={() => resetStateField(index, 'opacity')}
                              className="text-xs text-purple-400 hover:text-purple-300 mt-0.5"
                            >
                              {translate('Default', language as Locale)}
                            </button>
                          </div>

                          {/* Border Opacity */}
                          <div>
                            <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Border Opacity', language as Locale)}</label>
                            <div className="flex items-center">
                              <input
                                type="range"
                                min="0"
                                max="100"
                                value={state.borderOpacity ?? (data as any).borderOpacity ?? 100}
                                onChange={(e) => updateState(index, 'borderOpacity', parseInt(e.target.value))}
                                className="flex-1 accent-purple-500"
                              />
                              <span className="text-xs text-gray-400 w-6 text-right">{state.borderOpacity ?? (data as any).borderOpacity ?? 100}</span>
                            </div>
                            <button
                              onClick={() => resetStateField(index, 'borderOpacity')}
                              className="text-xs text-purple-400 hover:text-purple-300 mt-0.5"
                            >
                              {translate('Default', language as Locale)}
                            </button>
                          </div>

                          {/* Border Width */}
                          <div>
                            <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Border Width', language as Locale)}</label>
                            <div className="flex items-center">
                              <input
                                type="range"
                                min="0"
                                max="20"
                                value={state.borderWidth ?? (data as any).borderWidth ?? 2}
                                onChange={(e) => updateState(index, 'borderWidth', parseInt(e.target.value))}
                                className="flex-1 accent-purple-500"
                              />
                              <span className="text-xs text-gray-400 w-6 text-right">{state.borderWidth ?? (data as any).borderWidth ?? 2}</span>
                            </div>
                            <button
                              onClick={() => resetStateField(index, 'borderWidth')}
                              className="text-xs text-purple-400 hover:text-purple-300 mt-0.5"
                            >
                              {translate('Default', language as Locale)}
                            </button>
                          </div>
                        </div>

                        {/* Content (Image URL) */}
                        <div className="col-span-4">
                          <FilePickerInput
                            value={state.content || ''}
                            onChange={value => updateState(index, 'content', value)}
                            label={translate('Image URL', language as Locale)}
                            className="w-full"
                          />
                        </div>

                        {/* Tooltip Text */}
                        <div className="col-span-4">
                          <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Tooltip Text', language as Locale)}</label>
                          <input
                            type="text"
                            value={state.tooltipText || ''}
                            onChange={(e) => updateState(index, 'tooltipText', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                            placeholder={translate('Use Token Default', language as Locale)}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {activeTab === 'counters' && (
            <div className="space-y-4">
              {/* Slider Display Settings */}
              <div className="border border-slate-600 rounded-lg p-3 bg-slate-800/50">
                <h4 className="text-sm font-bold text-gray-300 mb-3">{translate('Slider Display', language as Locale)}</h4>
                <div className="grid grid-cols-2 gap-3">
                  {/* Position */}
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Position', language as Locale)}</label>
                    <select
                      value={sliderPosition}
                      onChange={(e) => updateSliderDisplay('position', e.target.value as TokenSliderPosition)}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                    >
                      <option value="above">{translate('Above Token', language as Locale)}</option>
                      <option value="below">{translate('Below Token', language as Locale)}</option>
                      <option value="center">{translate('Center of Token', language as Locale)}</option>
                      <option value="left">{translate('Left of Token', language as Locale)}</option>
                      <option value="right">{translate('Right of Token', language as Locale)}</option>
                    </select>
                  </div>
                  {/* Show for Players */}
                  <div className="flex items-center gap-2 pt-5">
                    <input
                      type="checkbox"
                      id="sliderShowForPlayers"
                      checked={sliderShowForPlayers}
                      onChange={(e) => updateSliderDisplay('showForPlayers', e.target.checked)}
                      className="accent-purple-500"
                    />
                    <label htmlFor="sliderShowForPlayers" className="text-sm text-gray-300">
                      {translate('Show for Players', language as Locale)}
                    </label>
                  </div>
                </div>
              </div>

              {/* Sliders List */}
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-gray-300">{translate('Sliders', language as Locale)}</h4>
                <button
                  onClick={addSlider}
                  className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-medium rounded transition-colors"
                >
                  <Plus size={14} /> {translate('Add Slider', language as Locale)}
                </button>
              </div>

              {sliders.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">
                  {translate('No sliders configured. Click "Add Slider" to create one.', language as Locale)}
                </div>
              ) : (
                <div className="space-y-3">
                  {sliders.map((slider, index) => (
                    <div key={slider.id} className="border border-slate-600 rounded-lg p-3 bg-slate-800/50">
                      {/* Slider header with name, color, and delete button */}
                      <div className="flex items-center gap-2 mb-3">
                        <input
                          type="text"
                          value={slider.name}
                          onChange={(e) => updateSlider(index, 'name', e.target.value)}
                          className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-sm font-medium"
                          placeholder={translate('Slider name', language as Locale)}
                        />
                        {/* Color Picker */}
                        <div className="flex items-center gap-1">
                          <input
                            type="color"
                            value={slider.color || '#ef4444'}
                            onChange={(e) => updateSlider(index, 'color', e.target.value)}
                            className="w-8 h-8 rounded cursor-pointer border-0"
                            title={translate('Slider Color', language as Locale)}
                          />
                        </div>
                        {/* Icon Input */}
                        <input
                          type="text"
                          value={slider.icon || ''}
                          onChange={(e) => updateSlider(index, 'icon', e.target.value)}
                          className="w-12 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-sm text-center"
                          placeholder={translate('Icon', language as Locale)}
                          title={translate('Emoji icon (optional)', language as Locale)}
                        />
                        {/* Delete Button */}
                        <button
                          onClick={() => removeSlider(index)}
                          className="w-8 h-8 rounded bg-red-600 hover:bg-red-500 text-white flex items-center justify-center transition-colors"
                          title={translate('Delete Slider', language as Locale)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {/* Slider Values */}
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        {/* Current Value */}
                        <div>
                          <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Value', language as Locale)}</label>
                          <input
                            type="number"
                            value={slider.value}
                            onChange={(e) => updateSlider(index, 'value', parseInt(e.target.value) || 0)}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-sm"
                          />
                        </div>
                        {/* Max Value */}
                        <div>
                          <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Max', language as Locale)}</label>
                          <input
                            type="number"
                            value={slider.maxValue}
                            onChange={(e) => updateSlider(index, 'maxValue', parseInt(e.target.value) || 10)}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-sm"
                          />
                        </div>
                        {/* Min Value */}
                        <div>
                          <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Min', language as Locale)}</label>
                          <input
                            type="number"
                            value={slider.minValue ?? 0}
                            onChange={(e) => updateSlider(index, 'minValue', parseInt(e.target.value) || 0)}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-sm"
                          />
                        </div>
                      </div>

                      {/* Display Options */}
                      <div className="flex items-center gap-4">
                        {/* Show Value */}
                        <label className="flex items-center gap-2 text-sm text-gray-300">
                          <input
                            type="checkbox"
                            checked={slider.showValue !== false}
                            onChange={(e) => updateSlider(index, 'showValue', e.target.checked)}
                            className="accent-purple-500"
                          />
                          {translate('Show Value', language as Locale)}
                        </label>
                        {/* Show Bar */}
                        <label className="flex items-center gap-2 text-sm text-gray-300">
                          <input
                            type="checkbox"
                            checked={slider.showBar !== false}
                            onChange={(e) => updateSlider(index, 'showBar', e.target.checked)}
                            className="accent-purple-500"
                          />
                          {translate('Show Bar', language as Locale)}
                        </label>
                      </div>

                      {/* Preview */}
                      <div className="mt-3 pt-3 border-t border-slate-600">
                        <div className="flex items-center gap-2">
                          {slider.icon && <span className="text-lg">{slider.icon}</span>}
                          <span className="text-sm font-medium" style={{ color: slider.color || '#ef4444' }}>{slider.name}</span>
                          {slider.showValue !== false && (
                            <span className="text-sm text-gray-300">: {slider.value}/{slider.maxValue}</span>
                          )}
                          {slider.showBar !== false && (
                            <div className="flex-1 h-3 bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className="h-full transition-all"
                                style={{
                                  width: `${Math.max(0, Math.min(100, (slider.value / slider.maxValue) * 100))}%`,
                                  backgroundColor: slider.color || '#ef4444'
                                }}
                              />
                            </div>
                          )}
                        </div>
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
                  <Square size={14} /> {translate('Basic Settings', language as Locale)}
                </h4>

                <div className="grid grid-cols-2 gap-3 mb-2">
                  {/* Card Shape */}
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Card Shape', language as Locale)}</label>
                    <select
                      value={cardSettings.cardShape ?? CardShape.POKER}
                      onChange={(e) => updateCardSettings('cardShape', e.target.value as CardShape)}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                    >
                      {Object.keys(CardShape).filter(key => key !== 'HEX_HORIZONTAL').map(key => (
                        <option key={key} value={key}>{key}</option>
                      ))}
                    </select>
                  </div>

                  {/* Card Orientation - disabled for SQUARE and CIRCLE shapes */}
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Card Orientation', language as Locale)}</label>
                    <select
                      value={cardSettings.cardOrientation ?? CardOrientation.VERTICAL}
                      onChange={(e) => {
                        const newOrientation = e.target.value as CardOrientation;
                        const currentWidth = cardSettings.cardWidth ?? deck.width;
                        const currentShape = cardSettings.cardShape ?? CardShape.POKER;

                        // Auto-normalize dimensions when orientation changes
                        // Keep the current width, adjust height based on shape and new orientation
                        if (currentShape === CardShape.POKER || currentShape === CardShape.BRIDGE ||
                            currentShape === CardShape.MINI_US || currentShape === CardShape.MINI_EURO) {
                          const baseDims = CARD_SHAPE_DIMS[currentShape];
                          const baseRatio = baseDims.height / baseDims.width;
                          // VERTICAL: normal ratio, HORIZONTAL: inverted ratio
                          const ratio = newOrientation === CardOrientation.VERTICAL ? baseRatio : 1 / baseRatio;
                          const newHeight = Math.round(currentWidth * ratio);
                          updateCardSettingsMultiple({
                            cardOrientation: newOrientation,
                            cardWidth: currentWidth,
                            cardHeight: newHeight
                          });
                          // Also update deck dimensions to match
                          update('width', currentWidth);
                          update('height', newHeight);
                        } else if (currentShape === CardShape.HEX_HORIZONTAL) {
                          // HEX_HORIZONTAL: exact formula height = width / 1.15 (always flat-top)
                          const newHeight = Math.round(currentWidth / 1.15);
                          updateCardSettingsMultiple({
                            cardOrientation: newOrientation,
                            cardWidth: currentWidth,
                            cardHeight: newHeight
                          });
                          // Also update deck dimensions to match
                          update('width', currentWidth);
                          update('height', newHeight);
                        } else if (currentShape === CardShape.HEX) {
                          // HEX: normalize based on orientation
                          // VERTICAL (pointy-top): height = width × 1.15
                          // HORIZONTAL (flat-top): height = width / 1.15
                          const newHeight = newOrientation === CardOrientation.VERTICAL
                            ? Math.round(currentWidth * 1.15)
                            : Math.round(currentWidth / 1.15);
                          updateCardSettingsMultiple({
                            cardOrientation: newOrientation,
                            cardWidth: currentWidth,
                            cardHeight: newHeight
                          });
                          // Also update deck dimensions to match
                          update('width', currentWidth);
                          update('height', newHeight);
                        } else if (currentShape === CardShape.TRIANGLE) {
                          // TRIANGLE: swap width/height for orientation
                          const currentHeight = cardSettings.cardHeight ?? deck.height;
                          updateCardSettingsMultiple({
                            cardOrientation: newOrientation,
                            cardWidth: currentHeight,
                            cardHeight: currentWidth
                          });
                          // Also update deck dimensions to match
                          update('width', currentHeight);
                          update('height', currentWidth);
                        } else {
                          // For SQUARE and CIRCLE, orientation doesn't change dimensions
                          updateCardSettingsMultiple({
                            cardOrientation: newOrientation
                          });
                        }
                      }}
                      disabled={cardSettings.cardShape === CardShape.SQUARE || cardSettings.cardShape === CardShape.CIRCLE}
                      className={`w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm ${
                        cardSettings.cardShape === CardShape.SQUARE || cardSettings.cardShape === CardShape.CIRCLE
                          ? 'opacity-50 cursor-not-allowed'
                          : ''
                      }`}
                    >
                      <option value={CardOrientation.VERTICAL}>{translate('Vertical', language as Locale)}</option>
                      <option value={CardOrientation.HORIZONTAL}>{translate('Horizontal', language as Locale)}</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-[1fr_auto_1fr_auto] gap-3 mb-2">
                  {/* Card Width */}
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Card Width (vu)', language as Locale)}</label>
                    <input
                      type="number"
                      step="0.01"
                      value={cardSettings.cardWidth ?? deck.width}
                      onChange={(e) => {
                        const value = e.target.value ? parseFloat(e.target.value) : undefined;
                        if (linkCardSize && value !== undefined) {
                          const roundHeight = shouldRound(value);
                          updateCardSettingsMultiple({
                            cardWidth: value,
                            cardHeight: roundHeight ? Math.round(value * cardRatio * 100) / 100 : value * cardRatio
                          });
                        } else {
                          updateCardSettings('cardWidth', value);
                        }
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                      placeholder={translate('Default', language as Locale)}
                    />
                  </div>

                  <div className="flex items-end pb-0.5">
                    <button
                      onClick={() => {
                        const newState = !linkCardSize;
                        if (!linkCardSize) {
                          // Turning on - save current ratio
                          const currentWidth = cardSettings.cardWidth ?? deck.width;
                          const currentHeight = cardSettings.cardHeight ?? deck.height;
                          setCardRatio(currentHeight / currentWidth);
                        }
                        setLinkCardSize(newState);
                        // Save to object
                        updateCardSettingsMultiple({ linkCardSize: newState });
                      }}
                      className={`w-[30px] h-[30px] rounded border-2 flex items-center justify-center transition-colors ${
                        linkCardSize
                          ? 'bg-blue-600 border-blue-500 hover:bg-blue-500'
                          : 'bg-slate-700 border-slate-600 hover:bg-slate-600'
                      }`}
                      title={linkCardSize ? translate('Unlink proportions', language as Locale) : translate('Link proportions', language as Locale)}
                    >
                      {linkCardSize ? <Link size={14} /> : <Unlink size={14} />}
                    </button>
                  </div>

                  {/* Card Height */}
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Card Height (vu)', language as Locale)}</label>
                    <input
                      type="number"
                      step="0.01"
                      value={cardSettings.cardHeight ?? deck.height}
                      onChange={(e) => {
                        const value = e.target.value ? parseFloat(e.target.value) : undefined;
                        if (linkCardSize && value !== undefined) {
                          const roundWidth = shouldRound(value);
                          updateCardSettingsMultiple({
                            cardHeight: value,
                            cardWidth: roundWidth ? Math.round((value / cardRatio) * 100) / 100 : value / cardRatio
                          });
                        } else {
                          updateCardSettings('cardHeight', value);
                        }
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                      placeholder={translate('Default', language as Locale)}
                    />
                  </div>

                  {/* Normalize button for cards */}
                  <div className="flex items-end pb-0.5">
                    <button
                      onClick={() => {
                        const currentWidth = cardSettings.cardWidth ?? deck.width;
                        const currentHeight = cardSettings.cardHeight ?? deck.height;
                        const currentShape = cardSettings.cardShape ?? CardShape.POKER;
                        const currentOrientation = cardSettings.cardOrientation ?? CardOrientation.VERTICAL;

                        // For card shapes with standard aspect ratios (POKER, BRIDGE, MINI_US, MINI_EURO)
                        // Always keep width, adjust height only based on orientation
                        if (currentShape === CardShape.POKER || currentShape === CardShape.BRIDGE ||
                            currentShape === CardShape.MINI_US || currentShape === CardShape.MINI_EURO) {
                          const baseDims = CARD_SHAPE_DIMS[currentShape];
                          // Calculate aspect ratio (height/width) from the base dimensions
                          const baseRatio = baseDims.height / baseDims.width;

                          // VERTICAL: use normal ratio (tall portrait)
                          // HORIZONTAL: use inverted ratio (wide landscape)
                          const ratio = currentOrientation === CardOrientation.VERTICAL ? baseRatio : 1 / baseRatio;
                          const normalizedHeight = Math.round(currentWidth * ratio);
                          updateCardSettingsMultiple({
                            cardWidth: currentWidth,
                            cardHeight: normalizedHeight
                          });
                          return;
                        }

                        // For HEX_HORIZONTAL, use its specific aspect ratio (wider than tall, flat-top)
                        // Orientation setting doesn't affect HEX_HORIZONTAL shape (always flat-top)
                        // Use exact formula: height = width / 1.15
                        if (currentShape === CardShape.HEX_HORIZONTAL) {
                          const normalizedHeight = Math.round(currentWidth / 1.15);
                          updateCardSettingsMultiple({
                            cardWidth: currentWidth,
                            cardHeight: normalizedHeight
                          });
                          return;
                        }

                        // For HEX, normalization depends on orientation
                        if (currentShape === CardShape.HEX) {
                          // VERTICAL (pointy-top): height = width × 1.15
                          // HORIZONTAL (flat-top): height = width / 1.15
                          const normalizedHeight = currentOrientation === CardOrientation.VERTICAL
                            ? Math.round(currentWidth * 1.15)
                            : Math.round(currentWidth / 1.15);
                          updateCardSettingsMultiple({
                            cardWidth: currentWidth,
                            cardHeight: normalizedHeight
                          });
                          return;
                        }

                        // For other shapes (TRIANGLE, CIRCLE, SQUARE), use existing normalization logic
                        let tokenShapeForNorm: TokenShape;
                        if (currentShape === CardShape.TRIANGLE) {
                          tokenShapeForNorm = TokenShape.TRIANGLE;
                        } else if (currentShape === CardShape.CIRCLE) {
                          tokenShapeForNorm = TokenShape.CIRCLE;
                        } else {
                          tokenShapeForNorm = TokenShape.SQUARE;
                        }

                        const { width, height } = normalizeShapeSizes(
                          tokenShapeForNorm,
                          currentWidth,
                          currentHeight
                        );
                        updateCardSettingsMultiple({
                          cardWidth: width,
                          cardHeight: height
                        });
                      }}
                      className="w-9 h-9 rounded border-2 flex items-center justify-center transition-colors bg-slate-700 border-slate-600 hover:bg-slate-600 hover:border-slate-500"
                      title={translate('Normalize to perfect shape', language as Locale)}
                    >
                      <Maximize2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Search Window and Play Top Card Settings */}
                <div className="grid grid-cols-2 gap-3 mb-2">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">{translate('In Search Window (Players)', language as Locale)}</label>
                    <select
                      value={cardSettings.searchWindowVisibility ?? SearchWindowVisibility.FACE_UP}
                      onChange={(e) => updateCardSettings('searchWindowVisibility', e.target.value as SearchWindowVisibility)}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                    >
                      <option value={SearchWindowVisibility.FACE_UP}>{translate('Face Up', language as Locale)}</option>
                      <option value={SearchWindowVisibility.FACE_DOWN}>{translate('Face Down', language as Locale)}</option>
                      <option value={SearchWindowVisibility.AS_GM}>{translate('As GM Sees', language as Locale)}</option>
                      <option value={SearchWindowVisibility.LAST_STATE}>{translate('Last State (per player)', language as Locale)}</option>
                      <option value={SearchWindowVisibility.SHARED_DECK}>{translate('Shared Deck (all players)', language as Locale)}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Play Top Card', language as Locale)}</label>
                    <select
                      value={(cardSettings.playTopFaceUp ?? true) ? 'faceUp' : 'faceDown'}
                      onChange={(e) => updateCardSettings('playTopFaceUp', e.target.value === 'faceUp')}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                    >
                      <option value="faceUp">{translate('Face Up', language as Locale)}</option>
                      <option value="faceDown">{translate('Face Down', language as Locale)}</option>
                    </select>
                  </div>
                </div>

                {/* Card Name Position and Rotation Step */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Show Card Name', language as Locale)}</label>
                    <select
                      value={cardSettings.cardNamePosition ?? 'bottom'}
                      onChange={(e) => updateCardSettings('cardNamePosition', e.target.value as CardNamePosition)}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                    >
                      <option value="bottom">{translate('Bottom', language as Locale)}</option>
                      <option value="top">{translate('Top', language as Locale)}</option>
                      <option value="none">{translate('None', language as Locale)}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Rotation Step (°)', language as Locale)}</label>
                    <select
                      value={cardSettings.rotationStep ?? 45}
                      onChange={(e) => updateCardSettings('rotationStep', Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                    >
                      <option value={15}>15°</option>
                      <option value={30}>30°</option>
                      <option value={45}>45°</option>
                      <option value={60}>60°</option>
                      <option value={90}>90°</option>
                      <option value={180}>180°</option>
                    </select>
                  </div>
                </div>

                {/* Card Tooltip Image */}
                <div className="bg-slate-900 rounded px-3 py-2 space-y-2 mt-5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-gray-400 flex items-center gap-2">
                      <Eye size={12} />
                      {translate('Card Tooltip Image', language as Locale)}
                    </label>
                    <button
                      onClick={() => update('showTooltipImage', !(data as any).showTooltipImage)}
                      className={`w-10 h-5 rounded-full transition-colors ${
                        (data as any).showTooltipImage ? 'bg-green-600' : 'bg-slate-700'
                      }`}
                      title={(data as any).showTooltipImage ? translate('Hide tooltip image', language as Locale) : translate('Show tooltip image', language as Locale)}
                    >
                      <div
                        className={`w-4 h-4 bg-white rounded-full transition-transform ${
                          (data as any).showTooltipImage ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="range"
                      value={(data as any).tooltipScale ?? 125}
                      onChange={e => update('tooltipScale', Number(e.target.value))}
                      className="flex-1 bg-slate-700 rounded-lg appearance-none cursor-pointer slider-input"
                      min="50"
                      max="300"
                      step="5"
                    />
                    <span className="text-xs text-gray-400 w-12 text-right">{(data as any).tooltipScale ?? 125}%</span>
                  </div>
                </div>
              </div>

              {/* Context Menu Actions for Cards - with PL and GM toggle buttons */}
              <div className="pt-4">
                <h4 className="text-sm font-bold text-gray-300 mb-2 flex items-center gap-2">
                  <Shield size={14} /> {translate('Context Menu Actions for Cards', language as Locale)}
                </h4>

                <div className="grid grid-cols-2 gap-1">
                  {[...MOVE_TO_ACTIONS, ...AVAILABLE_ACTIONS]
                    .filter(action => {
                      // Card context menu actions in specific order:
                      // 1. Move to... (section)
                      // 2. Flip
                      // 3. Change Layer (section)
                      // 4. Rotation (section)
                      // 5. Lock/Unlock
                      // 6. Pin/Unpin
                      // 7. Clone
                      // 8. Delete
                      const cardActions = ['moveTo', 'flip', 'layer', 'rotate', 'lock', 'pin', 'clone', 'delete'];
                      return cardActions.includes(action.id);
                    })
                    .map((action) => {
                    const isPlayerAllowed = cardSettings.allowedActions === undefined || cardSettings.allowedActions.includes(action.id as ContextAction);
                    const isGMAllowed = cardSettings.allowedActionsForGM === undefined || cardSettings.allowedActionsForGM.includes(action.id as ContextAction);

                    const togglePlayer = () => {
                      const current = cardSettings.allowedActions;
                      // Only card-specific actions
                      const cardActions = ['moveTo', 'flip', 'layer', 'rotate', 'lock', 'pin', 'clone', 'delete'] as ContextAction[];

                      if (isPlayerAllowed) {
                        // Remove from player's allowed actions
                        if (current && current.includes(action.id as ContextAction)) {
                          const newActions = current.filter((a: ContextAction) => a !== action.id);
                          setCardSettings(prev => ({ ...prev, allowedActions: newActions }));
                        } else if (current === undefined) {
                          setCardSettings(prev => ({ ...prev, allowedActions: cardActions.filter((a: string) => a !== action.id) as ContextAction[] }));
                        }
                      } else {
                        // Add to player's allowed actions
                        const updated = current ? [...current, action.id as ContextAction] : [action.id as ContextAction];
                        setCardSettings(prev => ({ ...prev, allowedActions: updated }));
                      }
                    };

                    const toggleGM = () => {
                      const current = cardSettings.allowedActionsForGM;
                      // Only card-specific actions
                      const cardActions = ['moveTo', 'flip', 'layer', 'rotate', 'lock', 'pin', 'clone', 'delete'] as ContextAction[];

                      if (isGMAllowed) {
                        // Remove from GM's allowed actions
                        if (current && current.includes(action.id as ContextAction)) {
                          const newActions = current.filter((a: ContextAction) => a !== action.id);
                          setCardSettings(prev => ({ ...prev, allowedActionsForGM: newActions }));
                        } else if (current === undefined) {
                          setCardSettings(prev => ({ ...prev, allowedActionsForGM: cardActions.filter((a: string) => a !== action.id) as ContextAction[] }));
                        }
                      } else {
                        // Add to GM's allowed actions
                        const updated = current ? [...current, action.id as ContextAction] : [action.id as ContextAction];
                        setCardSettings(prev => ({ ...prev, allowedActionsForGM: updated }));
                      }
                    };

                    return (
                      <div
                        key={`card-action-${action.id}`}
                        className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-slate-700 transition-colors bg-slate-800 border border-slate-700"
                      >
                        <span className="text-gray-200 text-xs font-medium leading-tight flex-1 truncate">{action.label}</span>
                        <button
                          onClick={togglePlayer}
                          className={`w-7 h-7 rounded text-[10px] font-bold transition-colors flex-shrink-0 ${
                            isPlayerAllowed
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-900 text-gray-400 hover:text-gray-200'
                          }`}
                          title={translate('Player', language as Locale)}
                        >
                          PL
                        </button>
                        <button
                          onClick={toggleGM}
                          className={`w-7 h-7 rounded text-[10px] font-bold transition-colors flex-shrink-0 ${
                            isGMAllowed
                              ? 'bg-purple-600 text-white'
                              : 'bg-slate-900 text-gray-400 hover:text-gray-200'
                          }`}
                          title={translate('Game Master', language as Locale)}
                        >
                          GM
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons - 2 columns, max 4 selected */}
              <div className="pt-4">
                <h4 className="text-sm font-bold text-gray-300 mb-2 flex items-center gap-2">
                  <Settings size={14} /> {translate('Action Buttons for Cards', language as Locale)}
                  <span className="text-xs text-gray-500 font-normal">({translate('max 4', language as Locale)})</span>
                </h4>

                <div className="grid grid-cols-2 gap-2">
                  {[...AVAILABLE_ACTIONS, ...MOVE_TO_ACTIONS]
                    .filter(action => {
                      // Only card-applicable actions (exclude all deck-specific actions)
                      if (action.id === 'show' || action.id === 'hide' ||
                          action.id === 'shuffleDeck' || action.id === 'searchDeck' ||
                          action.id === 'topDeck' || action.id === 'returnAll' || action.id === 'delete' || action.id === 'piles') return false;
                      // Exclude section headers only
                      if (action.id === 'moveTo' || action.id === 'layer' || action.id === 'rotate') return false;
                      // Exclude pin action from card action buttons
                      if (action.id === 'pin' || action.id === 'pinToViewport') return false;
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
              <div className="pt-4">
                <h4 className="text-sm font-bold text-gray-300 mb-2 flex items-center gap-2">
                  <MousePointer size={14} /> {translate('Double Click Action for Cards', language as Locale)}
                </h4>

                <div>
                  {/* Double Click */}
                  <div>
                    <select
                      value={cardSettings.doubleClickAction || 'none'}
                      onChange={(e) => updateCardSettings('doubleClickAction', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                    >
                      {CARD_CLICK_ACTIONS.map(action => (
                        <option key={action.id} value={action.id}>{action.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'sprite' && (
            <div className="space-y-4">
              {/* Sprite Sheet URL */}
              <div className="pt-4 space-y-3">
                <h4 className="text-sm font-bold text-gray-300 flex items-center gap-2">
                  <ImageIcon size={14} /> {translate('Sprite Sheet URL', language as Locale)}
                </h4>
                <FilePickerInput
                  value={spriteConfig?.spriteUrl || ''}
                  onChange={(value) => setSpriteConfig(prev => ({ ...prev, spriteUrl: value, cardBackUrl: prev?.cardBackUrl || '', columns: prev?.columns || 1, rows: prev?.rows || 1, totalCards: prev?.totalCards }))}
                  placeholder="https://example.com/cards.png"
                  className="w-full"
                />
              </div>

              {/* Card Back URL */}
              <div className="pt-4 space-y-3">
                <h4 className="text-sm font-bold text-gray-300 flex items-center gap-2">
                  <RotateCw size={14} /> {translate('Card Back URL', language as Locale)}
                </h4>
                <FilePickerInput
                  value={spriteConfig?.cardBackUrl || ''}
                  onChange={(value) => setSpriteConfig(prev => ({ ...prev, cardBackUrl: value, spriteUrl: prev?.spriteUrl || '', columns: prev?.columns || 1, rows: prev?.rows || 1, totalCards: prev?.totalCards }))}
                  placeholder="https://example.com/card-back.png"
                  className="w-full"
                />
                {spriteConfig?.cardBackUrl && (
                  <div className="bg-slate-900 rounded p-2 border border-slate-700 flex justify-center">
                    <img
                      src={cardBackDisplayUrl}
                      alt={`${translate('Card Back URL', language as Locale)} - ${translate('preview', language as Locale)}`}
                      className="max-w-24 max-h-32"
                      onError={(e) => { e.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2250%22 height=%2275%22%3E%3Crect fill=%22%231e293b%22 width=%2250%22 height=%2275%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 fill=%22%2364748b%22 dy=%22.3em%22 font-size=%2210%22%3EN/A%3C/text%3E%3C/svg%3E'; }}
                    />
                  </div>
                )}
              </div>

              {/* Grid Settings */}
              <div className="pt-4 space-y-3">
                <h4 className="text-sm font-bold text-gray-300 flex items-center gap-2">
                  <Grid3x3 size={14} /> {translate('Grid Settings', language as Locale)}
                </h4>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Columns', language as Locale)}</label>
                    <input
                      type="number"
                      min="1"
                      value={spriteConfig?.columns || 1}
                      onChange={(e) => {
                        const newColumns = Math.max(1, parseInt(e.target.value) || 1);
                        setSpriteConfig(prev => ({ ...prev, columns: newColumns, rows: prev?.rows || 1, totalCards: newColumns * (prev?.rows || 1), spriteUrl: prev?.spriteUrl || '', cardBackUrl: prev?.cardBackUrl || '' }));
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Rows', language as Locale)}</label>
                    <input
                      type="number"
                      min="1"
                      value={spriteConfig?.rows || 1}
                      onChange={(e) => {
                        const newRows = Math.max(1, parseInt(e.target.value) || 1);
                        setSpriteConfig(prev => ({ ...prev, rows: newRows, columns: prev?.columns || 1, totalCards: newRows * (prev?.columns || 1), spriteUrl: prev?.spriteUrl || '', cardBackUrl: prev?.cardBackUrl || '' }));
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Total Cards', language as Locale)}</label>
                    <input
                      type="number"
                      min="1"
                      value={spriteConfig?.totalCards || (spriteConfig?.columns && spriteConfig?.rows ? spriteConfig.columns * spriteConfig.rows : '')}
                      onChange={(e) => setSpriteConfig(prev => ({ ...prev, totalCards: e.target.value ? parseInt(e.target.value) : undefined, spriteUrl: prev?.spriteUrl || '', cardBackUrl: prev?.cardBackUrl || '', columns: prev?.columns || 1, rows: prev?.rows || 1 }))}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                      placeholder={`${translate('Auto', language as Locale)}: ${spriteConfig?.columns && spriteConfig?.rows ? spriteConfig.columns * spriteConfig.rows : translate('N/A', language as Locale)}`}
                    />
                  </div>
                </div>
              </div>

              {/* Preview Grid */}
              {spriteConfig?.columns && spriteConfig?.rows && spriteConfig?.spriteUrl && (
                <div className="pt-4 space-y-3">
                  <h4 className="text-sm font-bold text-gray-300 flex items-center gap-2">
                    <Eye size={14} /> {translate('Grid Preview', language as Locale)}
                  </h4>
                  <div
                    className="bg-slate-900 rounded p-2 border border-slate-700 overflow-auto"
                    style={{ maxHeight: '200px' }}
                    data-scrollable="true"
                  >
                    <img
                      src={spriteSheetDisplayUrl}
                      alt={translate('Sprite Sheet Preview', language as Locale)}
                      className="mx-auto border border-slate-600"
                      style={{
                        maxWidth: '100%',
                        height: 'auto',
                        imageRendering: 'pixelated',
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Generate Cards Button */}
              {spriteConfig?.spriteUrl && spriteConfig.columns > 0 && spriteConfig.rows > 0 && (
                <div className="pt-4">
                  <button
                    onClick={() => {
                      // This will be handled by the parent component via onSave
                      // The card generation will happen in the reducer
                      // Set totalCards based on columns * rows if not explicitly set
                      const finalSpriteConfig = {
                        ...spriteConfig,
                        totalCards: spriteConfig.totalCards || (spriteConfig.columns * spriteConfig.rows)
                      };
                      // Update data with the final spriteConfig
                      const updatedData = { ...data, spriteConfig: finalSpriteConfig };
                      onSave(updatedData);
                      onClose();
                    }}
                    className="w-full py-3 bg-green-600 hover:bg-green-500 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <Plus size={16} /> {translate('Generate Cards from Sprite', language as Locale)}
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'textCards' && (
            <div className="space-y-4">
              {/* Text Input Area */}
              <div className="pt-4 space-y-3">
                <h4 className="text-sm font-bold text-gray-300 flex items-center gap-2">
                  <FileText size={14} /> {translate('Card Text Input', language as Locale)}
                </h4>
                <textarea
                  value={textCardsInput}
                  onChange={(e) => setTextCardsInput(e.target.value)}
                  placeholder={translate('Card format example:\nFireball\n3d6 fire damage to all creatures in area.\n-\nCure Light Wounds\nTarget regains 1d8+1 hit points.\n-\nMagic Missile\nYou create three glowing magic missiles.', language as Locale)}
                  className="w-full h-64 bg-slate-900 border border-slate-700 rounded p-3 text-white text-sm resize-y"
                  style={{ minHeight: '200px' }}
                />
              </div>

              {/* Text Cards Style Settings */}
              <div className="pt-4 space-y-3">
                <h4 className="text-sm font-bold text-gray-300 flex items-center gap-2">
                  <Palette size={14} /> {translate('Text Cards Style Settings', language as Locale)}
                </h4>

                {/* First row: Background color and text color */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Background', language as Locale)}</label>
                    <input
                      type="color"
                      value={textCardsBackgroundColor}
                      onChange={(e) => setTextCardsBackgroundColor(e.target.value)}
                      className="w-full h-10 bg-slate-900 border border-slate-700 rounded cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Text', language as Locale)}</label>
                    <input
                      type="color"
                      value={textCardsTextColor}
                      onChange={(e) => setTextCardsTextColor(e.target.value)}
                      className="w-full h-10 bg-slate-900 border border-slate-700 rounded cursor-pointer"
                    />
                  </div>
                </div>

                {/* Second row: Use Sprite Sheet toggle and Font size */}
                <div className="grid grid-cols-[1fr_2fr] gap-2">
                  <div className="flex items-center justify-between bg-slate-900 rounded px-3 py-2">
                    <label className="text-xs text-gray-400">{translate('Use Sprite Sheet', language as Locale)}</label>
                    <button
                      onClick={() => setTextCardsUseSpriteSheet(!textCardsUseSpriteSheet)}
                      className={`w-10 h-5 rounded-full transition-colors ${
                        textCardsUseSpriteSheet ? 'bg-green-600' : 'bg-slate-700'
                      }`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                        textCardsUseSpriteSheet ? 'translate-x-5' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Font Size (px)', language as Locale)}</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="8"
                        max="32"
                        value={textCardsFontSize}
                        onChange={(e) => setTextCardsFontSize(e.target.value)}
                        className="flex-1 accent-purple-500"
                      />
                      <input
                        type="number"
                        min="8"
                        max="32"
                        value={textCardsFontSize}
                        onChange={(e) => setTextCardsFontSize(e.target.value)}
                        className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-sm text-center"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Add Cards Button */}
              <div className="pt-4">
                <button
                  onClick={() => {
                    // Parse the text input and create cards
                    const cardEntries = textCardsInput.split('\n-').map(entry => entry.trim()).filter(entry => entry.length > 0);
                    const cardsData = cardEntries.map(entry => {
                      const lines = entry.split('\n').map(line => line.trim()).filter(line => line.length > 0);
                      if (lines.length >= 2) {
                        return {
                          name: lines[0],
                          description: lines.slice(1).join('\n')
                        };
                      } else if (lines.length === 1) {
                        return {
                          name: lines[0],
                          description: ''
                        };
                      }
                      return null;
                    }).filter(card => card !== null);

                    // Create the updated deck with text cards and style settings
                    const updatedDeck = { ...data };
                    (updatedDeck as Deck).textCardsData = cardsData;
                    (updatedDeck as Deck).textCardsStyle = {
                      backgroundColor: textCardsBackgroundColor,
                      textColor: textCardsTextColor,
                      fontSize: textCardsFontSize,
                      useSpriteSheet: textCardsUseSpriteSheet
                    };
                    onSave(updatedDeck);
                    onClose();
                  }}
                  disabled={!textCardsInput.trim()}
                  className="w-full py-3 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <Plus size={16} /> {translate('Add Cards from Text', language as Locale)}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'values' && (
            <DiceValuesSettings
              dice={data as DiceObject}
              onChange={(updates) => setData(prev => ({ ...prev, ...updates }))}
              language={language as Locale}
            />
          )}

          {activeTab === 'groups' && (
            <div className="space-y-4">
              {/* Create New Group Section */}
              <div className="pt-2 space-y-3">
                <h4 className="text-sm font-bold text-gray-300 flex items-center gap-2">
                  <Dices size={14} /> {translate('Create Group', language as Locale)}
                </h4>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                    placeholder={translate('Group Name', language as Locale)}
                  />
                  <input
                    type="color"
                    value={newGroupColor}
                    onChange={(e) => setNewGroupColor(e.target.value)}
                    className="w-12 h-10 rounded cursor-pointer"
                  />
                  <button
                    onClick={handleCreateGroup}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded flex items-center gap-2"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              {/* Dice Assignment Section with inline group editing */}
              <div className="pt-4 space-y-3">
                <h4 className="text-sm font-bold text-gray-300 flex items-center gap-2">
                  <Dices size={14} /> {translate('Assign Dice to Groups', language as Locale)}
                </h4>

                {/* Group headers as drop targets */}
                <div className="grid grid-cols-3 gap-2">
                  {/* No Group */}
                  <div
                    className={`p-3 rounded-lg border-2 border-dashed text-center cursor-pointer transition-colors ${
                      draggedDiceId !== null ? 'border-slate-600 hover:border-slate-500' : 'border-slate-700'
                    }`}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDropDice(null)}
                  >
                    <div className="text-sm text-gray-400 mb-2">{translate('No Group', language as Locale)}</div>
                    <div className="space-y-1">
                      {allDice.filter(d => {
                        const groupExists = d.diceGroupId && diceGroups.some(g => g.id === d.diceGroupId);
                        return !groupExists;
                      }).map(dice => (
                        <div
                          key={dice.id}
                          draggable
                          onDragStart={() => setDraggedDiceId(dice.id)}
                          className="bg-slate-700 rounded px-2 py-1 text-xs text-white cursor-move hover:bg-slate-600"
                        >
                          {dice.name}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Groups with inline editing */}
                  {diceGroups.map(group => (
                    <div
                      key={group.id}
                      className={`p-2 rounded-lg border-2 border-dashed text-center cursor-pointer transition-colors overflow-hidden`}
                      style={{
                        borderColor: group.color,
                        backgroundColor: `${group.color}10`
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleDropDice(group.id)}
                    >
                      {/* Header row: color picker, name, delete button */}
                      <div className="flex items-center gap-1 mb-2 min-w-0">
                        {/* Color picker */}
                        <input
                          type="color"
                          value={group.color}
                          onChange={(e) => handleUpdateGroup(group.id, { color: e.target.value })}
                          className="w-5 h-5 rounded cursor-pointer border-0 p-0 flex-shrink-0"
                        />
                        {/* Group name input */}
                        <input
                          type="text"
                          value={group.name}
                          onChange={(e) => handleUpdateGroup(group.id, { name: e.target.value })}
                          className="flex-1 min-w-0 bg-transparent border-0 text-white text-xs font-medium text-center focus:outline-none focus:bg-slate-800/50 rounded px-1 truncate"
                          style={{ color: group.color }}
                        />
                        {/* Delete button */}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group.id); }}
                          className="p-0.5 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded flex-shrink-0"
                          title={translate('Delete', language as Locale)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      {/* Dice list */}
                      <div className="space-y-1">
                        {allDice.filter(d => d.diceGroupId === group.id).map(dice => (
                          <div
                            key={dice.id}
                            draggable
                            onDragStart={() => setDraggedDiceId(dice.id)}
                            className="bg-slate-700 rounded px-2 py-1 text-xs text-white cursor-move hover:bg-slate-600"
                          >
                            {dice.name}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-300 hover:bg-slate-700 rounded">{t({ en: 'Cancel', ru: 'Отмена', uk: 'Скасувати', be: 'Адмена', sr: 'Откажи' })}</button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-500 text-white rounded flex items-center gap-2"
          >
            <Check size={16} /> {translate('Save Changes', language as Locale)}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

// Memoize ObjectSettingsModal to prevent unnecessary re-renders 🔥
// Use shallow comparison for object to detect when it actually changes
export const ObjectSettingsModal = React.memo<ObjectSettingsModalProps>(ObjectSettingsModalComponent, (prevProps, nextProps) => {
  // Compare all relevant props
  return prevProps.object === nextProps.object &&
         prevProps.language === nextProps.language &&
         prevProps.diceGroups === nextProps.diceGroups &&
         prevProps.allObjects === nextProps.allObjects;
});
