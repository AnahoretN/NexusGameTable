import { t as translate, Locale } from '../utils/translations';
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { TableObject, ItemType, Token, TokenType, Deck, Card, DiceObject, Counter, TokenShape, GridType, CardShape, CardOrientation, ContextAction, CardPile, PilePosition, PileSize, ClickAction, CardNamePosition, SearchWindowVisibility, Board, CardSpriteConfig, Drawing, AppLanguage, BattlefieldCell, DiceGroup } from '../types';

import { X, Check, Settings, Shield, MousePointer, Layers, Trash2, Plus, Square, RotateCw, Eye, Grid3x3, Image as ImageIcon, Dices, Maximize2, Link, Unlink, Magnet } from 'lucide-react';
import { FilePickerInput } from './FilePickerInput';
import { calculateHexHeight, calculateFlatHexHeight } from '../utils/gridUtils';
import { CARD_SHAPE_DIMS } from '../constants';

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
}

// Translate GridType value to display name
function translateGridType(gridType: GridType, language: AppLanguage = 'en'): string {
  // Convert uppercase enum values to title case for translation lookup
  const lookupKey: Record<typeof gridType, string> = {
    [GridType.NONE]: 'None',
    [GridType.SQUARE]: 'Square',
    [GridType.HEX]: 'Hex',
    [GridType.HEX_HORIZONTAL]: 'Hex (Horizontal)'
  };
  return translate(lookupKey[gridType], language as Locale);
}

// Get available actions with translated labels
function getAvailableActions(language: AppLanguage = 'en'): { id: ContextAction; label: string }[] {
  return [
    { id: 'topDeck', label: translate('Top Deck (section)', language as Locale) },
    { id: 'draw', label: translate('Draw Card', language as Locale) },
    { id: 'playTopCard', label: translate('Play Top', language as Locale) },
    { id: 'millTopCard', label: translate('Mill', language as Locale) },
    { id: 'toBottom', label: translate('To Bottom', language as Locale) },
    { id: 'showTop', label: translate('Show Top', language as Locale) },
    { id: 'searchDeck', label: translate('Search', language as Locale) },
    { id: 'shuffleDeck', label: translate('Shuffle', language as Locale) },
    { id: 'piles', label: translate('Piles', language as Locale) },
    { id: 'returnAll', label: translate('Return All', language as Locale) },
    { id: 'hide', label: translate('Hide/Show', language as Locale) },
    { id: 'clone', label: translate('Clone Object', language as Locale) },
    { id: 'delete', label: translate('Delete Object', language as Locale) },
    { id: 'flip', label: translate('Flip Card', language as Locale) },
    { id: 'layer', label: translate('Change Layer (section)', language as Locale) },
    { id: 'lock', label: translate('Lock/Unlock', language as Locale) },
    { id: 'pin', label: translate('Pin/Unpin', language as Locale) },
    { id: 'rotate', label: translate('Rotation (section)', language as Locale) },
    { id: 'rotateClockwise', label: translate('Rotation CW', language as Locale) },
    { id: 'rotateCounterClockwise', label: translate('Rotation CCW', language as Locale) },
    { id: 'swingClockwise', label: translate('Swing CW', language as Locale) },
    { id: 'swingCounterClockwise', label: translate('Swing CCW', language as Locale) },
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
// Submenu actions are excluded since they depend on their parent section (layer/rotate/topDeck)
const EXCLUDED_FROM_BUTTONS: ContextAction[] = ['clone', 'delete', 'layer', 'lock', 'pin', 'returnAll', 'rotate', 'topDeck', 'piles'];

// Check if an action can be shown as an action button
function isActionButtonAllowed(action: ContextAction): boolean {
  return !EXCLUDED_FROM_BUTTONS.includes(action);
}

// Helper to determine which actions are available as buttons for which object types
function getButtonApplicableTypes(action: ContextAction): ItemType[] {
  // Exclude actions that should only be in context menu
  if (!isActionButtonAllowed(action)) return [];

  switch (action) {
    case 'shuffleDeck':
    case 'searchDeck':
    case 'draw':
    case 'playTopCard':
    case 'millTopCard':
    case 'toBottom':
    case 'showTop':
      return [ItemType.DECK];
    case 'flip':
      return [ItemType.CARD, ItemType.TOKEN];
    case 'rotateClockwise':
    case 'rotateCounterClockwise':
      return [ItemType.CARD];
    case 'swingClockwise':
    case 'swingCounterClockwise':
      return [ItemType.CARD];
    // "Move to" actions for cards
    case 'moveToHand':
    case 'moveToTopDeck':
    case 'moveToBottomDeck':
    case 'moveToDiscard':
      return [ItemType.CARD];
    default:
      return [];
  }
}

type Tab = 'general' | 'actions' | 'piles' | 'cards' | 'sprite' | 'groups';

export const ObjectSettingsModal: React.FC<ObjectSettingsModalProps> = ({ object, onSave, onClose, allObjects = {}, language = 'en', diceGroups = [], dispatch }) => {
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [data, setData] = useState<TableObject>({ ...object });

  // Proportional resize states - initialize from object data, default to true
  const getInitialLinkState = (value?: boolean) => value !== undefined ? value : true;
  const [linkObjectSize, setLinkObjectSize] = useState(getInitialLinkState((object as any).linkObjectSize));
  const [linkGridSize, setLinkGridSize] = useState(getInitialLinkState((object as any).linkGridSize));
  const [linkCardSize, setLinkCardSize] = useState(getInitialLinkState((object as any).linkCardSize));
  const [objectRatio, setObjectRatio] = useState(1);
  const [cardRatio, setCardRatio] = useState(1);

  // Translation helper

  // Get translated action labels
  const AVAILABLE_ACTIONS = getAvailableActions(language);
  const MOVE_TO_ACTIONS = getMoveToActions(language);
  // Exclude section headers from click actions (note: showTop is NOT a section, it's a concrete action)
  const SECTION_ACTIONS: ContextAction[] = ['layer', 'rotate', 'topDeck', 'piles', 'moveTo'];
  const CLICK_ACTIONS = [
    { id: 'none' as const, label: translate('None', language as Locale) },
    ...AVAILABLE_ACTIONS.filter(a => !SECTION_ACTIONS.includes(a.id)).map(a => ({ id: a.id, label: a.label }))
  ];
  const CARD_CLICK_ACTIONS: { id: ClickAction; label: string }[] = [
    { id: 'none' as const, label: translate('None', language as Locale) },
    { id: 'showTooltipImage' as const, label: translate('Card Tooltip Image', language as Locale) },
    ...[...AVAILABLE_ACTIONS, ...MOVE_TO_ACTIONS].map(a => ({ id: a.id, label: a.label }))
      .filter(action => {
        // Exclude deck-specific and section actions
        if (action.id === 'hide' ||
            action.id === 'shuffleDeck' || action.id === 'searchDeck' || action.id === 'topDeck' ||
            action.id === 'returnAll' || action.id === 'delete' || action.id === 'piles' ||
            action.id === 'rotate' || action.id === 'layer' ||
            action.id === 'draw' || action.id === 'playTopCard' || action.id === 'millTopCard' ||
            action.id === 'toBottom' || action.id === 'showTop') {
          return false;
        }
        // Exclude section headers
        if (action.id === 'moveTo') return false;
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

  // Groups state
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState('#8b5cf6');
  const [draggedDiceId, setDraggedDiceId] = useState<string | null>(null);

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
        rotationStep: deckObj.rotationStep ?? 45,
        searchFaceUp: deckObj.searchFaceUp ?? true,
        playTopFaceUp: deckObj.playTopFaceUp ?? true,
      });
      // Initialize sprite config
      setSpriteConfig(deckObj.spriteConfig || null);
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
    const allActionIds = AVAILABLE_ACTIONS.map(a => a.id);

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
      const deckOnlyActions = ['hide', 'topDeck', 'returnAll', 'shuffleDeck', 'searchDeck', 'piles'];
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

    // If saving a token type (archetype), dispatch event to update all token-copies
    if (isArchetype) {
      const archetypeId = data.id;
      const tokenCopies = Object.values(allObjects).filter(obj =>
        obj.type === ItemType.TOKEN && (obj as any).archetypeId === archetypeId
      ) as TokenType[];

      // Properties to copy from archetype to token-copies
      const propsToUpdate = [
        'width', 'height', 'color', 'shape', 'content',
        'borderColor', 'borderWidth', 'showNameOnToken', 'showName', 'name', 'fontColor'
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

    onSave(toSave);

    // After saving, update all cards in the deck when cardWidth/cardHeight/cardOrientation/cardShape changed
    if (isDeck) {
      const deckId = data.id;
      const oldDeck = allObjects[deckId] as Deck;
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
    }

    onClose();
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

  const modalContent = (
    <div className="fixed inset-0 z-[100005] flex items-center justify-center bg-black/40">
      <div className="bg-slate-800 rounded-lg shadow-xl w-[575px] border border-slate-600 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex justify-center items-center py-2 px-4">
          <h3 className="text-base font-bold text-white">{translate('Settings', language as Locale)}: {object.name}</h3>
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
          {!isCard && !isDice && !isCounter && !isBattlefieldCell && !isPanel && (
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
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
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
                            (data as any).showNameOnToken || (data as any).showName ? 'bg-green-600' : 'bg-slate-700'
                          }`}
                          title={translate('Show name on token', language as Locale)}
                        >
                          <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                            (data as any).showNameOnToken || (data as any).showName ? 'translate-x-5' : 'translate-x-0.5'
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
                      value={isArchetype ? (data as any).defaultSize?.width || data.width : data.width}
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
                      className={`w-9 h-9 rounded border-2 flex items-center justify-center transition-colors ${
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
                      value={isArchetype ? (data as any).defaultSize?.height || data.height : data.height}
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
                    />
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
                        } else {
                          // Not a hex grid (SQUARE or NONE) - unlink proportions (allow independent width/height)
                          setLinkGridSize(false);
                          updateMultiple({ linkGridSize: false });
                        }
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                    >
                      {Object.values(GridType).map(v => (
                        <option
                          key={v}
                          value={v}
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
                              gridHeight: roundHeight ? Math.round(height * 100) / 100 : height
                            });
                          } else {
                            update('gridWidth', value);
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
                        className={`w-9 h-9 rounded border-2 flex items-center justify-center transition-colors ${
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
                              gridWidth: roundWidth ? Math.round(width * 100) / 100 : width
                            });
                          } else {
                            update('gridHeight', value);
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
                  {AVAILABLE_ACTIONS
                    .filter(action => {
                      // Drawings have no context menu actions
                      if (isDrawing) return false;
                      // Cards should ONLY use "Context Menu Actions for Cards" from deck settings
                      // Skip all card-specific actions in the general Context Menu Actions section
                      if (isCard && ['flip', 'layer', 'pin'].includes(action.id)) {
                        return false;
                      }
                      // Deck-specific actions - only for decks, not cards, tokens, or battlefield cells
                      if ((isCard || isToken || isBattlefieldCell) && ['hide', 'topDeck', 'returnAll', 'shuffleDeck', 'searchDeck', 'piles', 'draw', 'playTopCard', 'millTopCard', 'toBottom', 'showTop'].includes(action.id)) {
                        return false;
                      }
                      // Board-specific actions - only decks, not boards
                      if (isBoard && ['topDeck', 'returnAll', 'shuffleDeck', 'searchDeck', 'piles', 'draw', 'playTopCard', 'millTopCard', 'toBottom', 'showTop'].includes(action.id)) {
                        return false;
                      }
                      // For decks: exclude individual Top Deck actions (they're controlled by 'topDeck' section)
                      if (isDeck && ['draw', 'playTopCard', 'millTopCard', 'toBottom', 'showTop', 'swingClockwise', 'swingCounterClockwise', 'rotateClockwise', 'rotateCounterClockwise'].includes(action.id)) {
                        return false;
                      }
                      // Card-specific actions - only for cards (not tokens, decks, boards, or battlefield cells)
                      if ((isDeck || isBoard || isToken || isBattlefieldCell) && ['flip'].includes(action.id)) {
                        return false;
                      }
                      // 'flip' only applies to cards (not tokens, decks, boards, or battlefield cells)
                      if (action.id === 'flip' && (isDeck || isBoard || isToken || isBattlefieldCell)) return false;
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
                  {AVAILABLE_ACTIONS.map((action) => {
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
                      {CLICK_ACTIONS
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
                      className={`w-9 h-9 rounded border-2 flex items-center justify-center transition-colors ${
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
                  {[...AVAILABLE_ACTIONS, ...MOVE_TO_ACTIONS]
                    .filter(action => {
                      // Exclude deck-specific and section actions
                      if (action.id === 'hide' ||
                          action.id === 'shuffleDeck' || action.id === 'searchDeck' ||
                          action.id === 'topDeck' || action.id === 'returnAll' || action.id === 'delete' || action.id === 'piles' ||
                          action.id === 'draw' || action.id === 'playTopCard' || action.id === 'millTopCard' ||
                          action.id === 'toBottom' || action.id === 'showTop') return false;
                      // Exclude individual Move To actions (keep moveTo section only)
                      if (action.id === 'moveToHand' || action.id === 'moveToTopDeck' ||
                          action.id === 'moveToBottomDeck' || action.id === 'moveToDiscard') return false;
                      // Exclude swing and rotation actions (only for Action Buttons, not Context Menu)
                      if (action.id === 'swingClockwise' || action.id === 'swingCounterClockwise' ||
                          action.id === 'rotateClockwise' || action.id === 'rotateCounterClockwise') return false;
                      return true;
                    })
                    .map((action) => {
                    const isPlayerAllowed = cardSettings.allowedActions === undefined || cardSettings.allowedActions.includes(action.id as ContextAction);
                    const isGMAllowed = cardSettings.allowedActionsForGM === undefined || cardSettings.allowedActionsForGM.includes(action.id as ContextAction);

                    const togglePlayer = () => {
                      const current = cardSettings.allowedActions;
                      const cardActions = [...AVAILABLE_ACTIONS, ...MOVE_TO_ACTIONS]
                        .filter(a => {
                          if (a.id === 'hide' ||
                              a.id === 'shuffleDeck' || a.id === 'searchDeck' ||
                              a.id === 'topDeck' || a.id === 'returnAll' || a.id === 'delete' || a.id === 'piles' ||
                              a.id === 'draw' || a.id === 'playTopCard' || a.id === 'millTopCard' ||
                              a.id === 'toBottom' || a.id === 'showTop') return false;
                          // Exclude individual Move To actions (keep moveTo section only)
                          if (a.id === 'moveToHand' || a.id === 'moveToTopDeck' ||
                              a.id === 'moveToBottomDeck' || a.id === 'moveToDiscard') return false;
                          // Exclude swing actions (only for Action Buttons, not Context Menu)
                          if (a.id === 'swingClockwise' || a.id === 'swingCounterClockwise') return false;
                          return true;
                        })
                        .map(a => a.id);

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
                      const cardActions = [...AVAILABLE_ACTIONS, ...MOVE_TO_ACTIONS]
                        .filter(a => {
                          if (a.id === 'hide' ||
                              a.id === 'shuffleDeck' || a.id === 'searchDeck' ||
                              a.id === 'topDeck' || a.id === 'returnAll' || a.id === 'delete' || a.id === 'piles' ||
                              a.id === 'draw' || a.id === 'playTopCard' || a.id === 'millTopCard' ||
                              a.id === 'toBottom' || a.id === 'showTop') return false;
                          // Exclude individual Move To actions (keep moveTo section only)
                          if (a.id === 'moveToHand' || a.id === 'moveToTopDeck' ||
                              a.id === 'moveToBottomDeck' || a.id === 'moveToDiscard') return false;
                          // Exclude swing actions (only for Action Buttons, not Context Menu)
                          if (a.id === 'swingClockwise' || a.id === 'swingCounterClockwise') return false;
                          return true;
                        })
                        .map(a => a.id);

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
                      if (action.id === 'hide' ||
                          action.id === 'shuffleDeck' || action.id === 'searchDeck' ||
                          action.id === 'topDeck' || action.id === 'returnAll' || action.id === 'delete' || action.id === 'piles' ||
                          action.id === 'draw' || action.id === 'playTopCard' || action.id === 'millTopCard' ||
                          action.id === 'toBottom' || action.id === 'showTop') return false;
                      // Exclude section headers only
                      if (action.id === 'moveTo' || action.id === 'layer' || action.id === 'rotate') return false;
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
                      src={spriteConfig.cardBackUrl}
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
                      onChange={(e) => setSpriteConfig(prev => ({ ...prev, columns: Math.max(1, parseInt(e.target.value) || 1), spriteUrl: prev?.spriteUrl || '', cardBackUrl: prev?.cardBackUrl || '', rows: prev?.rows || 1, totalCards: prev?.totalCards }))}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Rows', language as Locale)}</label>
                    <input
                      type="number"
                      min="1"
                      value={spriteConfig?.rows || 1}
                      onChange={(e) => setSpriteConfig(prev => ({ ...prev, rows: Math.max(1, parseInt(e.target.value) || 1), spriteUrl: prev?.spriteUrl || '', cardBackUrl: prev?.cardBackUrl || '', columns: prev?.columns || 1, totalCards: prev?.totalCards }))}
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
                  >
                    <img
                      src={spriteConfig.spriteUrl}
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
                      (data as Deck).spriteConfig = spriteConfig;
                      onSave(data);
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
                      {allDice.filter(d => !d.diceGroupId).map(dice => (
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
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-300 hover:bg-slate-700 rounded">{translate('Cancel', language as Locale)}</button>
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
