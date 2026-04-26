import React, { useState, useCallback, useMemo, memo } from 'react';
import { createPortal } from 'react-dom';
import { TableObject, ItemType, Card, Deck, ContextAction, Deck as DeckType, CardPile, AppLanguage, HyperscaleLayer, NexusCellObject } from '../types';
import { Lock, Unlock, RefreshCw, Copy, Settings, Eye, EyeOff, Layers, Trash2, ArrowUp, ArrowDown, ChevronsUp, ChevronsDown, Hand, Shuffle, Search, Undo, ChevronRight, RotateCw, RotateCcw, Pin, ImageDown, CornerDownRight, Check, Plus } from 'lucide-react';
import { t as translate, Locale } from '../utils/translations';
import { useGame } from '../store/GameContext';
import { useHyperscaleLayers } from '../store/contexts';

interface ContextMenuProps {
  x: number;
  y: number;
  object: TableObject;
  isGM: boolean;
  onAction: (action: string, shiftKey?: boolean) => void;
  onClose: () => void;
  allObjects: Record<string, TableObject>;
  hideCardActions?: boolean;
  isSearchWindow?: boolean;
  language?: AppLanguage;
  nexusBoardEditingId?: string | null; // ID of NexusBoard currently being edited
  shiftKey?: boolean; // Whether Shift key was pressed when context menu opened
  contextMenuType?: 'tabletop' | 'pool'; // Type of context menu for proper event handling
}

interface MenuItem {
  label: string;
  action: string;
  icon?: JSX.Element;
  visible?: boolean;
  hasSubmenu?: boolean;
  separator?: boolean;
  submenuItems?: MenuItem[];
  isSeparator?: boolean;
}

// Memoized submenu item component
const SubmenuItem = memo<{
  subItem: MenuItem;
  onAction: (action: string, shiftKey?: boolean) => void;
  onClose: () => void;
}>(({ subItem, onAction, onClose }) => {
  if (subItem.isSeparator) {
    return <div key={subItem.action} className="h-px bg-slate-700 my-1 mx-2" />;
  }

  const subAction = subItem.action.toString();

  return (
    <button
      key={subItem.action}
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onAction(subAction);
        onClose();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200 cursor-pointer pointer-events-auto relative z-[9999996]"
      style={{ pointerEvents: 'auto' }}
    >
      {subItem.icon}
      <span>{subItem.label}</span>
    </button>
  );
});

SubmenuItem.displayName = 'SubmenuItem';

// Memoized regular menu item component
const RegularMenuItem = memo<{
  item: MenuItem;
  onAction: (action: string, shiftKey?: boolean) => void;
  onClose: () => void;
}>(({ item, onAction, onClose }) => {
  return (
    <React.Fragment>
      <button
        type="button"
        onClick={(e) => {
          // Pass actual shift key state for delete action
          if (item.action === 'delete') {
            onAction(item.action, e.shiftKey);
          } else {
            onAction(item.action);
          }
          onClose();
        }}
        className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors cursor-pointer ${item.action === 'delete' || item.action === 'destroy' ? 'text-red-400 hover:text-red-300' : 'text-gray-200'}`}
      >
        {item.icon}
        <span>{item.label}</span>
      </button>
      {item.separator && <div className="h-px bg-slate-700 my-1 mx-2" />}
    </React.Fragment>
  );
});

RegularMenuItem.displayName = 'RegularMenuItem';

const ContextMenuComponent: React.FC<ContextMenuProps> = ({ x, y, object, isGM, onAction, onClose, allObjects, hideCardActions, isSearchWindow, language = 'en', nexusBoardEditingId, shiftKey: _shiftKey, contextMenuType = 'tabletop' }) => {
  const { state } = useGame();
  const hyperscaleLayers = useHyperscaleLayers();

  // Early return if allObjects is not available
  if (!allObjects) {
    return null;
  }

  const [layerSubmenuOpen, setLayerSubmenuOpen] = useState(false);
  const [rotateSubmenuOpen, setRotateSubmenuOpen] = useState(false);
  const [pilesSubmenuOpen, setPilesSubmenuOpen] = useState(false);
  const [topDeckSubmenuOpen, setTopDeckSubmenuOpen] = useState(false);
  const [moveSubmenuOpen, setMoveSubmenuOpen] = useState(false);
  const [returnSubmenuOpen, setReturnSubmenuOpen] = useState(false);
  const submenuRef = React.useRef<HTMLDivElement>(null);

  // Store computed positions for main menu and submenus
  const [menuPosition, setMenuPosition] = React.useState({ left: x, top: y });
  const [submenuPositions, setSubmenuPositions] = React.useState<Record<string, { left: number; top: number; side: 'left' | 'right' }>>({});
  const menuRef = React.useRef<HTMLDivElement>(null);
  const submenuButtonRefs = React.useRef<Record<string, HTMLButtonElement | null>>({});

  // Track actual menu dimensions for accurate positioning
  const [menuDimensions, setMenuDimensions] = React.useState({ width: 0, height: 0 });
  const [submenuDimensions, setSubmenuDimensions] = React.useState<Record<string, { width: number; height: number }>>({});
  const layerSubmenuRef = React.useRef<HTMLDivElement>(null);
  const rotateSubmenuRef = React.useRef<HTMLDivElement>(null);
  const pilesSubmenuRef = React.useRef<HTMLDivElement>(null);
  const topDeckSubmenuRef = React.useRef<HTMLDivElement>(null);
  const moveSubmenuRef = React.useRef<HTMLDivElement>(null);
  const returnSubmenuRef = React.useRef<HTMLDivElement>(null);

  // Helper to get card settings from deck (cards always inherit from deck)
  const getCardSettings = useCallback((card: Card) => {
    if (card.deckId && allObjects) {
      const deck = allObjects[card.deckId] as DeckType;
      if (deck && deck.type === ItemType.DECK) {
        return {
          allowedActions: deck.cardAllowedActions,
          allowedActionsForGM: deck.cardAllowedActionsForGM,
          actionButtons: deck.cardActionButtons,
          singleClickAction: deck.cardSingleClickAction,
          doubleClickAction: deck.cardDoubleClickAction,
        };
      }
    }

    // Default to no specific settings (all actions allowed)
    return {
      allowedActions: undefined,
      allowedActionsForGM: undefined,
      actionButtons: undefined,
      singleClickAction: undefined,
      doubleClickAction: undefined,
    };
  }, [allObjects]);

  // Mapping of submenu actions to their parent section actions
  // When a parent section is enabled, its submenu actions are automatically available
  const SUBMENU_TO_PARENT: Record<string, ContextAction> = {
    'layerUp': 'layer',
    'layerDown': 'layer',
    'bringToFront': 'layer',
    'sendToBack': 'layer',
    'rotateClockwise': 'rotate',
    'rotateCounterClockwise': 'rotate',
    'swingClockwise': 'rotate',
    'swingCounterClockwise': 'rotate',
    'resetRotation': 'rotate',
    'draw': 'topDeck',
    'playTopCard': 'topDeck',
    'millTopCard': 'topDeck',
    'toBottom': 'topDeck',
    'showTop': 'topDeck',
    'hideTop': 'topDeck',
    'moveToHand': 'moveTo',
    'moveToTopDeck': 'moveTo',
    'moveToBottomDeck': 'moveTo',
    'moveToDiscard': 'moveTo',
    'returnSubmenu': 'returnAll',
    'returnAllAndShuffle': 'returnAll',
    'returnAllExceptHands': 'returnAll',
  };

  // Helper to check if an action is allowed for the current user
  const can = useCallback((action: ContextAction) => {
    let allowedActions: ContextAction[] | undefined;
    let allowedActionsForGM: ContextAction[] | undefined;

    // For cards, use inherited settings from deck
    if (object.type === ItemType.CARD) {
      const cardSettings = getCardSettings(object as Card);
      allowedActions = cardSettings.allowedActions;
      allowedActionsForGM = cardSettings.allowedActionsForGM;
    } else {
      allowedActions = object.allowedActions;
      allowedActionsForGM = object.allowedActionsForGM;
    }

    // Check if this is a submenu action - if so, check parent section permission
    const parentAction = SUBMENU_TO_PARENT[action];

    let result = false;
    if (isGM) {
      // GM: more permissive - check if parent section is allowed or action is explicitly allowed
      // undefined/null/empty array = all allowed, specific array = only those allowed
      if (allowedActionsForGM != null && allowedActionsForGM.length > 0) {
        // If GM-specific permissions are defined and not empty, check them
        // Check BOTH the specific action AND the parent section
        result = allowedActionsForGM.includes(action) ||
               allowedActionsForGM.includes(parentAction);
      } else {
        // If no GM-specific permissions defined, GM has ALL actions allowed
        // This is the key fix: don't fall back to player's allowedActions for GM!
        result = true;
      }
    } else {
      // Player: check allowedActions with parent section fallback
      // undefined/null/empty array = all allowed, specific array = only those allowed
      if (allowedActions != null && allowedActions.length > 0) {
        // Check BOTH the specific action AND the parent section
        result = allowedActions.includes(action) ||
               allowedActions.includes(parentAction);
      } else {
        result = true;
      }
    }


    return result;
  }, [object, isGM, getCardSettings]);

  // Calculate safe menu position to keep it within viewport
  React.useEffect(() => {
    const menuWidth = 250;  // Estimated menu width
    const menuHeight = 400; // Estimated menu height
    const padding = 8;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = x;
    let top = y;

    // Adjust horizontal position
    if (left + menuWidth + padding > viewportWidth) {
      left = viewportWidth - menuWidth - padding;
    }
    if (left < padding) {
      left = padding;
    }

    // Adjust vertical position
    if (top + menuHeight + padding > viewportHeight) {
      top = viewportHeight - menuHeight - padding;
    }
    if (top < padding) {
      top = padding;
    }

    setMenuPosition({ left, top });
  }, [x, y]);

  // Close layer submenu when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      // Check if click is on any submenu (rendered via portal)
      const target = e.target as Node;
      const clickedSubmenu = (target as Element).closest('[data-submenu="true"]');
      const clickedMenu = menuRef.current?.contains(target);

      // Only close if click is outside both main menu and all submenus
      if (!clickedMenu && !clickedSubmenu) {
        setLayerSubmenuOpen(false);
        setRotateSubmenuOpen(false);
        setPilesSubmenuOpen(false);
        setTopDeckSubmenuOpen(false);
        setMoveSubmenuOpen(false);
        setReturnSubmenuOpen(false);
        setSubmenuPositions({});
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Measure main menu dimensions using ResizeObserver
  React.useEffect(() => {
    const menuEl = menuRef.current;
    if (!menuEl) return;

    const updateDimensions = () => {
      const rect = menuEl.getBoundingClientRect();
      setMenuDimensions({ width: rect.width, height: rect.height });
    };

    // Initial measurement
    updateDimensions();

    // Observe size changes
    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(menuEl);

    return () => resizeObserver.disconnect();
  }, [menuRef]);

  // Measure submenu dimensions using individual refs
  React.useEffect(() => {
    const refs: Record<string, React.RefObject<HTMLDivElement>> = {
      layer: layerSubmenuRef,
      rotate: rotateSubmenuRef,
      topDeck: topDeckSubmenuRef,
      piles: pilesSubmenuRef,
      moveTo: moveSubmenuRef,
      returnAll: returnSubmenuRef
    };

    const openSubmenus: string[] = [];
    if (layerSubmenuOpen) openSubmenus.push('layer');
    if (rotateSubmenuOpen) openSubmenus.push('rotate');
    if (topDeckSubmenuOpen) openSubmenus.push('topDeck');
    if (pilesSubmenuOpen) openSubmenus.push('piles');
    if (moveSubmenuOpen) openSubmenus.push('moveTo');
    if (returnSubmenuOpen) openSubmenus.push('returnAll');

    const updateDimensions = () => {
      const dimensions: Record<string, { width: number; height: number }> = {};

      openSubmenus.forEach(key => {
        const ref = refs[key];
        if (ref.current) {
          const rect = ref.current.getBoundingClientRect();
          dimensions[key] = { width: rect.width, height: rect.height };
        }
      });

      setSubmenuDimensions(dimensions);
    };

    // Initial measurement after a short delay to ensure portal rendering is complete
    const timeoutId = setTimeout(updateDimensions, 10);

    // Set up ResizeObserver for each open submenu
    const observers: ResizeObserver[] = [];
    openSubmenus.forEach(key => {
      const ref = refs[key];
      if (ref.current) {
        const observer = new ResizeObserver(updateDimensions);
        observer.observe(ref.current);
        observers.push(observer);
      }
    });

    return () => {
      clearTimeout(timeoutId);
      observers.forEach(obs => obs.disconnect());
    };
  }, [layerSubmenuOpen, rotateSubmenuOpen, topDeckSubmenuOpen, pilesSubmenuOpen, moveSubmenuOpen, returnSubmenuOpen]);

  // Calculate main menu position to keep it on screen
  React.useEffect(() => {
    const menuWidth = menuDimensions.width || 200; // Use measured dimensions or fallback
    const menuHeight = menuDimensions.height || 400;

    let left = x;
    let top = y;

    // Check right edge
    if (left + menuWidth > window.innerWidth) {
      left = Math.max(10, window.innerWidth - menuWidth - 10);
    }
    if (left < 10) left = 10;

    // Check bottom edge
    if (top + menuHeight > window.innerHeight) {
      top = Math.max(10, window.innerHeight - menuHeight - 10);
    }
    if (top < 10) top = 10;

    setMenuPosition({ left, top });
  }, [x, y, menuDimensions.width, menuDimensions.height]);

  // Calculate submenu positions based on actual button positions and submenu dimensions
  React.useEffect(() => {
    const positions: Record<string, { left: number; top: number; side: 'left' | 'right' }> = {};

    const openSubmenus: string[] = [];
    if (layerSubmenuOpen) openSubmenus.push('layer');
    if (rotateSubmenuOpen) openSubmenus.push('rotate');
    if (topDeckSubmenuOpen) openSubmenus.push('topDeck');
    if (pilesSubmenuOpen) openSubmenus.push('piles');
    if (moveSubmenuOpen) openSubmenus.push('moveTo');
    if (returnSubmenuOpen) openSubmenus.push('returnAll');

    // Clear positions when all submenus are closed
    if (openSubmenus.length === 0) {
      setSubmenuPositions({});
      return;
    }

    openSubmenus.forEach(key => {
      const button = submenuButtonRefs.current[key];
      const dims = submenuDimensions[key] || { width: 180, height: 200 };

      if (button) {
        const rect = button.getBoundingClientRect();
        let left = rect.right + 5;
        let top = rect.top;
        let side: 'left' | 'right' = 'right';

        // Check if submenu would go off right edge
        if (left + dims.width > window.innerWidth) {
          // Show on left side instead
          left = rect.left - dims.width - 5;
          side = 'left';
        }

        // Check if submenu would go off bottom edge - also check top edge
        if (top + dims.height > window.innerHeight) {
          top = Math.max(10, window.innerHeight - dims.height - 10);
        }
        if (top < 10) top = 10;

        // Also ensure left position is valid
        if (left < 10) left = 10;

        positions[key] = { left, top, side };
      }
    });

    setSubmenuPositions(positions);
  }, [layerSubmenuOpen, rotateSubmenuOpen, topDeckSubmenuOpen, pilesSubmenuOpen, moveSubmenuOpen, returnSubmenuOpen, submenuDimensions]);

  // "Move to.." section for cards - defined here to be inserted early
  const moveToSection: MenuItem[] = useMemo(() => {
    if (object.type !== ItemType.CARD) return [];
    if (!allObjects) return [];

    const card = object as Card;
    const deck = card.deckId ? allObjects[card.deckId] as DeckType : null;
    const piles = deck?.piles || [];

    const submenuItems: MenuItem[] = [
      {
        label: translate('Hand', language as Locale),
        action: 'moveToHand',
        icon: <Hand size={14} />,
        visible: (!hideCardActions || isSearchWindow) && can('moveToHand')
      },
      {
        label: translate('Top Deck', language as Locale),
        action: 'moveToTopDeck',
        icon: <ArrowUp size={14} />,
        visible: !!deck && can('moveToTopDeck')
      },
      {
        label: translate('Bottom Deck', language as Locale),
        action: 'moveToBottomDeck',
        icon: <ArrowDown size={14} />,
        visible: !!deck && can('moveToBottomDeck')
      },
      // Move to Mill - only visible if there's a mill pile AND action is allowed
      ...(piles.some(p => p.isMillPile) && can('moveToDiscard') ? [{
        label: translate('Mill', language as Locale),
        action: 'moveToDiscard' as const,
        icon: <Trash2 size={14} />,
        visible: true
      }] : []),
      ...(piles.length > 0 ? [{
        label: '-',
        action: 'separator-move-to-piles',
        visible: true,
        isSeparator: true
      }] : []),
      ...piles.map((pile: CardPile) => ({
        label: pile.name,
        action: `moveToPile-${pile.id}`,
        icon: <Layers size={14} />,
        visible: true,
        pileId: pile.id
      }))
    ];

    // Section is only visible if at least one submenu item is visible
    const hasVisibleItems = submenuItems.some(item => item.visible);

    return hasVisibleItems ? [
      {
        label: translate('Move to...', language as Locale),
        action: 'moveTo',
        icon: <CornerDownRight size={14} />,
        visible: true,
        hasSubmenu: true,
        submenuItems
      }
    ] : [];
  }, [object, allObjects, hideCardActions, isSearchWindow, language, can]);

  const menuItems: MenuItem[] = useMemo(() => [
    {
      label: translate('Properties', language as Locale),
      action: 'configure',
      icon: <Settings size={14} />,
      // Hide for token-copies (tokens with archetypeId)
      visible: isGM && !(object.type === ItemType.TOKEN && (object as any).archetypeId),
    },
    // Separator after Configure (only visible if Configure is visible)
    {
      label: '-',
      action: 'separator-configure',
      visible: isGM && !(object.type === ItemType.TOKEN && (object as any).archetypeId),
      isSeparator: true
    },
    {
      label: translate('Roll', language as Locale),
      action: 'roll',
      icon: <RefreshCw size={14} />,
      visible: object.type === ItemType.DICE_OBJECT,
    },
    {
      label: translate('Reset to Base Value', language as Locale),
      action: 'resetToBase',
      icon: <RotateCcw size={14} />,
      visible: object.type === ItemType.COUNTER,
    },
    // "Move to..." section for cards
    ...moveToSection,
    // Flip for cards
    {
      label: translate('Flip', language as Locale),
      action: 'flip',
      icon: <RotateCw size={14} />,
      visible: object.type === ItemType.CARD && can('flip'),
    },
    // Deck-specific actions
    {
      label: translate('Top Deck', language as Locale),
      action: 'topDeck',
      icon: <ArrowUp size={14} />,
      visible: object.type === ItemType.DECK && can('topDeck'),
      hasSubmenu: true,
      submenuItems: [
        {
          label: translate('Manager', language as Locale),
          action: 'topDeck',
          icon: <Settings size={14} />,
          visible: true
        },
        {
          label: '-',
          action: 'separator-topdeck-draw',
          visible: true,
          isSeparator: true
        },
        {
          label: translate('Draw', language as Locale),
          action: 'draw',
          icon: <Hand size={14} />,
          visible: can('draw')
        },
        {
          label: translate('Play', language as Locale),
          action: 'playTopCard',
          icon: <ArrowUp size={14} />,
          visible: can('playTopCard')
        },
        {
          label: translate('Mill', language as Locale),
          action: 'millTopCard',
          icon: <Undo size={14} />,
          visible: (object as Deck).piles && (object as Deck).piles.length > 0
        },
        {
          label: translate('To Bottom', language as Locale),
          action: 'toBottom',
          icon: <ArrowDown size={14} />,
          visible: true
        },
        {
          label: (object as Deck).showTopCard ? translate('Hide Top', language as Locale) : translate('Show Top', language as Locale),
          action: (object as Deck).showTopCard ? 'hideTop' : 'showTop',
          icon: <Eye size={14} />,
          visible: can('showTop')
        }
      ]
    },
    {
      label: translate('Search', language as Locale),
      action: 'searchDeck',
      icon: <Search size={14} />,
      visible: object.type === ItemType.DECK && can('searchDeck')
    },
    {
      label: translate('Shuffle', language as Locale),
      action: 'shuffleDeck',
      icon: <Shuffle size={14} />,
      visible: object.type === ItemType.DECK && can('shuffleDeck')
    },
    {
      label: translate('Piles', language as Locale),
      action: 'piles',
      icon: <Layers size={14} />,
      visible: object.type === ItemType.DECK &&
               (object as Deck).piles &&
               (object as Deck).piles.length > 0 &&
               can('piles'),
      hasSubmenu: true,
      submenuItems: (object as Deck).piles?.map((pile) => ({
        label: `${pile.name} (${pile.cardIds.length})`,
        action: `pile-${pile.id}`,
        icon: <Layers size={14} />,
        visible: true
      })) || []
    },
    // Return All section for decks
    ...(object.type === ItemType.DECK && can('returnAll') ? (() => {
      const returnSubmenuItems: MenuItem[] = [
        {
          label: translate('All', language as Locale),
          action: 'returnAll',
          icon: <Undo size={14} />,
          visible: true
        },
        {
          label: translate('All and Shuffle', language as Locale),
          action: 'returnAllAndShuffle',
          icon: <Shuffle size={14} />,
          visible: true
        },
        {
          label: translate('All Except Hands', language as Locale),
          action: 'returnAllExceptHands',
          icon: <RotateCcw size={14} />,
          visible: true
        }
      ];
      return [{
        label: translate('Return...', language as Locale),
        action: 'returnSubmenu',
        icon: <CornerDownRight size={14} />,
        visible: true,
        hasSubmenu: true,
        submenuItems: returnSubmenuItems
      }];
    })() : []),
    {
      label: translate('Edit Board', language as Locale),
      action: 'editNexusBoard',
      icon: <Plus size={14} />,
      visible: !hideCardActions && can('editNexusBoard') && (
        (object.type === ItemType.NEXUS_BOARD && nexusBoardEditingId !== object.id) ||
        (object.type === ItemType.NEXUS_CELL && nexusBoardEditingId !== (object as NexusCellObject).nexusBoardId)
      ),
    },
    {
      label: translate('Close Editing', language as Locale),
      action: 'closeNexusBoardEditing',
      icon: <Check size={14} />,
      visible: !hideCardActions && (
        (object.type === ItemType.NEXUS_BOARD && nexusBoardEditingId === object.id) ||
        (object.type === ItemType.NEXUS_CELL && nexusBoardEditingId === (object as NexusCellObject).nexusBoardId)
      ),
    },
    {
      label: translate('Delete Board', language as Locale),
      action: 'deleteNexusBoard',
      icon: <Trash2 size={14} />,
      visible: !hideCardActions && can('deleteNexusBoard') && object.type === ItemType.NEXUS_CELL,
    },
    // Separator before Change Layer group (only visible if any of Change Layer, Rotation, Hide, Lock, Pin are visible)
    {
      label: '-',
      action: 'separator-layer-group',
      visible: (!hideCardActions && (can('layerUp') || can('layerDown'))) ||
               (!isSearchWindow && !hideCardActions && can('rotate')) ||
               (can('hide') && !(object.type === ItemType.TOKEN && (object as any).archetypeId)) ||
               (!hideCardActions && can('lock')) ||
               (!hideCardActions && can('pin')),
      isSeparator: true
    },
    {
      label: translate('Change Layer', language as Locale),
      action: 'layer',
      icon: <Layers size={14} />,
      visible: !hideCardActions && (can('layerUp') || can('layerDown')),
      hasSubmenu: true,
      submenuItems: (() => {
        // Get hyperscale layers, sorted by reverse order (higher maxZIndex = higher in list)
        const sortedLayers = [...hyperscaleLayers]
          .sort((a, b) => b.maxZIndex - a.maxZIndex);

        // Check if player/GM can see this layer in context menu
        const canViewLayer = (layer: HyperscaleLayer) => {
          if (isGM) return true;
          return layer.playerCanView;
        };

        // Generate menu items for each hyperscale layer
        const layerItems: MenuItem[] = sortedLayers
          .filter(layer => canViewLayer(layer))
          .map(layer => {
            const isSelected = object.hyperscaleLayerId === layer.id;
            return {
              label: layer.name,
              action: `moveToHyperscaleLayer:${layer.id}`,
              icon: (
                <div className="flex items-center gap-1">
                  {!isSelected && (
                    <div
                      className="w-2 h-2 rounded"
                      style={{ backgroundColor: layer.color }}
                    />
                  )}
                  {isSelected && <Check size={12} style={{ color: layer.color }} />}
                </div>
              ),
              visible: true
            };
          });

        // Add legacy layer up/down options first, then hyperscale layers
        return [
          {
            label: translate('Layer Up', language as Locale),
            action: 'layerUp',
            icon: <ArrowUp size={14} />,
            visible: can('layerUp')
          },
          {
            label: translate('Layer Down', language as Locale),
            action: 'layerDown',
            icon: <ArrowDown size={14} />,
            visible: can('layerDown')
          },
          {
            label: '-',
            action: 'separator-layer-controls',
            visible: true,
            isSeparator: true
          },
          {
            label: translate('To Top', language as Locale),
            action: 'bringToFront',
            icon: <ChevronsUp size={14} />,
            visible: can('bringToFront')
          },
          {
            label: translate('To Bottom', language as Locale),
            action: 'sendToBack',
            icon: <ChevronsDown size={14} />,
            visible: can('sendToBack')
          },
          {
            label: '-',
            action: 'separator-hyperscale-layers',
            visible: layerItems.length > 0,
            isSeparator: true
          },
          ...layerItems
        ];
      })()
    },
    {
      label: translate('Rotation', language as Locale),
      action: 'rotate',
      icon: <RotateCw size={14} />,
      // Hide rotation in search window and for cards in hand panel (only available in game space)
      visible: !isSearchWindow && !hideCardActions && can('rotate'),
      hasSubmenu: true,
      submenuItems: [
        {
          label: translate('Clockwise', language as Locale),
          action: 'rotateClockwise',
          icon: <RefreshCw size={14} />,
          visible: can('rotateClockwise')
        },
        {
          label: translate('Counter-Clockwise', language as Locale),
          action: 'rotateCounterClockwise',
          icon: <RefreshCw size={14} style={{ transform: 'scaleX(-1)' }} />,
          visible: can('rotateCounterClockwise')
        },
        {
          label: translate('Reset', language as Locale),
          action: 'resetRotation',
          icon: <Undo size={14} />,
          visible: can('rotateClockwise') // Using rotateClockwise as proxy for rotate permission
        },
        {
          label: '-',
          action: 'separator-rotation-swing',
          visible: can('swingClockwise') || can('swingCounterClockwise'),
          isSeparator: true
        },
        {
          label: translate('Swing CW', language as Locale),
          action: 'swingClockwise',
          icon: <RefreshCw size={14} />,
          visible: can('swingClockwise')
        },
        {
          label: translate('Swing CCW', language as Locale),
          action: 'swingCounterClockwise',
          icon: <RefreshCw size={14} style={{ transform: 'scaleY(-1)' }} />,
          visible: can('swingCounterClockwise')
        }
      ]
    },
    // Separator before Hide/Show/Lock/Pin section (only visible if any of Hide, Lock, Pin are visible)
    {
      label: '-',
      action: 'separator-before-hide-lock-pin',
      visible: (can('hide') && !(object.type === ItemType.TOKEN && (object as any).archetypeId)) || (!hideCardActions && can('lock')) || (!hideCardActions && can('pin')),
      isSeparator: true
    },
    // Remove the old "To Hand" item since it's now in "Move to.."
    {
      label: (object as any).isOnTable === false ? translate('Show', language as Locale) : translate('Hide', language as Locale),
      action: (object as any).isOnTable === false ? 'show' : 'hide',
      icon: (object as any).isOnTable === false ? <Eye size={14} /> : <EyeOff size={14} />,
      // Hide for token-copies (tokens with archetypeId)
      visible: can('hide') && !(object.type === ItemType.TOKEN && (object as any).archetypeId)
    },
    {
      label: object.locked ? translate('Unlock', language as Locale) : translate('Lock', language as Locale),
      action: 'lock',
      icon: object.locked ? <Unlock size={14} /> : <Lock size={14} />,
      visible: !hideCardActions && can('lock')
    },
    {
      label: object.isPinnedToViewport ? translate('Unpin', language as Locale) : translate('Pin', language as Locale),
      action: object.isPinnedToViewport ? 'unpinFromViewport' : 'pinToViewport',
      icon: <Pin size={14} />,
      // TODO: Temporarily hide pinning in pool panel - re-enable later when properly implemented
      // NOTE: Pinning disabled for cards and tokens - only available for decks, dice, counters
      visible: !hideCardActions && can('pin') && object.type !== ItemType.BOARD && object.type !== ItemType.CARD && object.type !== ItemType.TOKEN && contextMenuType !== 'pool',
    },
    // Separator after Hide/Lock/Pin section (only visible if any of Hide, Lock, Pin are visible)
    {
      label: '-',
      action: 'separator-after-hide-lock-pin',
      visible: (can('hide') && !(object.type === ItemType.TOKEN && (object as any).archetypeId)) || (!hideCardActions && can('lock')) || (!hideCardActions && can('pin') && object.type !== ItemType.BOARD && object.type !== ItemType.CARD && object.type !== ItemType.TOKEN && contextMenuType !== 'pool'),
      isSeparator: true
    },
    // Hide Card / Unhide Card
    {
      label: (object as Card).hidden ? translate('Unhide Card', language as Locale) : translate('Hide Card', language as Locale),
      action: 'toggleHide',
      icon: (object as Card).hidden ? <Eye size={14} /> : <EyeOff size={14} />,
      visible: isSearchWindow && isGM && object.type === ItemType.CARD,
    },
    // Separator after Hide Card (only visible in search window for GM)
    {
      label: '-',
      action: 'separator-after-hide',
      visible: isSearchWindow && isGM && object.type === ItemType.CARD,
      isSeparator: true
    },
    // Set as Card Back
    {
      label: translate('Set as Card Back', language as Locale),
      action: 'setCardBack',
      icon: <ImageDown size={14} />,
      visible: isSearchWindow && isGM && object.type === ItemType.CARD,
    },
    // Separator before Clone and Destroy (only visible in search window for GM) - ABOVE Clone
    {
      label: '-',
      action: 'separator-before-clone-destroy',
      visible: isSearchWindow && isGM && object.type === ItemType.CARD,
      isSeparator: true
    },
    // Clone - creates copy of card in same deck (available in search window)
    {
      label: translate('Clone', language as Locale),
      action: 'clone',
      icon: <Copy size={14} />,
      visible: (isSearchWindow && isGM && object.type === ItemType.CARD) || (!hideCardActions && can('clone')),
    },
    // Destroy - permanently removes card from deck (GM only in search window for cards) - AT THE BOTTOM
    {
      label: translate('Destroy', language as Locale),
      action: 'destroy',
      icon: <Trash2 size={14} />,
      visible: isSearchWindow && isGM && object.type === ItemType.CARD,
    },
    // Delete - removes card from deck (NOT available in search window, only on tabletop)
    {
      label: translate('Delete', language as Locale),
      action: 'delete',
      icon: <Trash2 size={14} />,
      visible: !isSearchWindow && !hideCardActions && can('delete')
    },
  ], [object, isGM, hideCardActions, isSearchWindow, language, nexusBoardEditingId, contextMenuType, hyperscaleLayers, moveToSection, can]);

  // Filter visible items
  const visibleItems = useMemo(() => menuItems.filter(item => item.visible), [menuItems]);
  const configureItem = useMemo(() => visibleItems.find(i => i.action === 'configure'), [visibleItems]);
  const otherItems = useMemo(() => visibleItems.filter(i => i.action !== 'configure'), [visibleItems]);
  const finalItems = useMemo(() => configureItem ? [configureItem, ...otherItems] : otherItems, [configureItem, otherItems]);


  const menuStyle: React.CSSProperties = {
    top: menuPosition.top,
    left: menuPosition.left,
  };

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[9999990] cursor-default"
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      />
      <div
        ref={menuRef}
        data-context-menu={contextMenuType}
        className="fixed z-[9999992] bg-slate-800 border border-slate-600 rounded-lg shadow-2xl py-1 min-w-[180px] text-sm animate-in fade-in zoom-in-95 duration-100 cursor-pointer"
        style={menuStyle}
        onClick={() => {
          // Menu container click
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="px-3 py-2 border-b border-slate-700 mb-1">
            <span className="text-xs text-white truncate block max-w-[150px]">
              {object.type === ItemType.CARD
                ? (object as Card).hidden
                  ? 'HIDDEN'
                  : (object as Card).faceUp
                    ? object.name
                    : '*****'
                : object.name}
            </span>
        </div>

        {finalItems.map((item, idx) => {
            // Handle standalone separator items
            if (item.isSeparator) {
              return <div key={item.action || idx} className="h-px bg-slate-700 my-1 mx-2" />;
            }

            if (item.hasSubmenu) {
              const isRotateSubmenu = item.action === 'rotate';
              const isPilesSubmenu = item.action === 'piles';
              const isTopDeckSubmenu = item.action === 'topDeck';
              const isMoveSubmenu = item.action === 'moveTo';
              const isReturnSubmenu = item.action === 'returnSubmenu';
              const isSubmenuOpen = isRotateSubmenu ? rotateSubmenuOpen : isPilesSubmenu ? pilesSubmenuOpen : isTopDeckSubmenu ? topDeckSubmenuOpen : isMoveSubmenu ? moveSubmenuOpen : isReturnSubmenu ? returnSubmenuOpen : layerSubmenuOpen;

              const toggleSubmenu = () => {
                if (isRotateSubmenu) {
                  setRotateSubmenuOpen(!rotateSubmenuOpen);
                  setLayerSubmenuOpen(false);
                  setPilesSubmenuOpen(false);
                  setTopDeckSubmenuOpen(false);
                  setMoveSubmenuOpen(false);
                  setReturnSubmenuOpen(false);
                } else if (isPilesSubmenu) {
                  setPilesSubmenuOpen(!pilesSubmenuOpen);
                  setLayerSubmenuOpen(false);
                  setRotateSubmenuOpen(false);
                  setTopDeckSubmenuOpen(false);
                  setMoveSubmenuOpen(false);
                  setReturnSubmenuOpen(false);
                } else if (isTopDeckSubmenu) {
                  setTopDeckSubmenuOpen(!topDeckSubmenuOpen);
                  setLayerSubmenuOpen(false);
                  setRotateSubmenuOpen(false);
                  setPilesSubmenuOpen(false);
                  setMoveSubmenuOpen(false);
                  setReturnSubmenuOpen(false);
                } else if (isMoveSubmenu) {
                  setMoveSubmenuOpen(!moveSubmenuOpen);
                  setLayerSubmenuOpen(false);
                  setRotateSubmenuOpen(false);
                  setPilesSubmenuOpen(false);
                  setTopDeckSubmenuOpen(false);
                  setReturnSubmenuOpen(false);
                } else if (isReturnSubmenu) {
                  setReturnSubmenuOpen(!returnSubmenuOpen);
                  setLayerSubmenuOpen(false);
                  setRotateSubmenuOpen(false);
                  setPilesSubmenuOpen(false);
                  setTopDeckSubmenuOpen(false);
                  setMoveSubmenuOpen(false);
                } else {
                  setLayerSubmenuOpen(!layerSubmenuOpen);
                  setRotateSubmenuOpen(false);
                  setPilesSubmenuOpen(false);
                  setTopDeckSubmenuOpen(false);
                  setMoveSubmenuOpen(false);
                  setReturnSubmenuOpen(false);
                }
              };

              const submenuKey = isRotateSubmenu ? 'rotate' : isPilesSubmenu ? 'piles' : isTopDeckSubmenu ? 'topDeck' : isMoveSubmenu ? 'moveTo' : isReturnSubmenu ? 'returnAll' : 'layer';
              const submenuPos = submenuPositions[submenuKey];

              // Get the correct ref for this submenu
              const getSubmenuRef = () => {
                if (isRotateSubmenu) return rotateSubmenuRef;
                if (isPilesSubmenu) return pilesSubmenuRef;
                if (isTopDeckSubmenu) return topDeckSubmenuRef;
                if (isMoveSubmenu) return moveSubmenuRef;
                if (isReturnSubmenu) return returnSubmenuRef;
                return layerSubmenuRef;
              };

              return (
                <div key={item.action || idx} className="relative" ref={submenuRef}>
                  <button
                    ref={(el) => { submenuButtonRefs.current[submenuKey] = el; }}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSubmenu();
                    }}
                    className="w-full text-left px-3 py-2 flex items-center justify-between gap-2 hover:bg-slate-700 transition-colors text-gray-200"
                  >
                    <div className="flex items-center gap-2">
                      {item.icon}
                      <span>{item.label}</span>
                    </div>
                    <ChevronRight size={12} />
                  </button>
                  {isSubmenuOpen && submenuPos && createPortal(
                    <div
                      ref={getSubmenuRef()}
                      data-submenu="true"
                      data-submenu-key={submenuKey}
                      className="fixed z-[9999995] bg-slate-800 border border-slate-600 rounded-lg shadow-xl py-1 min-w-[180px] animate-in fade-in zoom-in-95 duration-100 pointer-events-auto"
                      style={{ left: submenuPos.left, top: submenuPos.top }}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Render submenu items */}
                      {item.submenuItems && item.submenuItems.length > 0 ? (
                        <>
                          {item.submenuItems.filter(subItem => subItem.visible).map((subItem) => (
                            <SubmenuItem
                              key={subItem.action}
                              subItem={subItem}
                              onAction={onAction}
                              onClose={onClose}
                            />
                          ))}
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => { onAction('layerUp'); onClose(); }}
                            className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
                          >
                            <ArrowUp size={14} />
                            <span>{translate('Layer Up', language as Locale)}</span>
                          </button>
                          <button
                            onClick={() => { onAction('layerDown'); onClose(); }}
                            className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
                          >
                            <ArrowDown size={14} />
                            <span>{translate('Layer Down', language as Locale)}</span>
                          </button>
                        </>
                      )}
                    </div>,
                    document.body
                  )}
                  {item.separator && <div className="h-px bg-slate-700 my-1 mx-2" />}
                </div>
              );
            }
            return (
              <RegularMenuItem
                key={item.action}
                item={item}
                onAction={onAction}
                onClose={onClose}
              />
            );
        })}
      </div>
    </>,
    document.body
  );
};

export const ContextMenu = memo(ContextMenuComponent);
ContextMenu.displayName = 'ContextMenu';
