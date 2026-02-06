import { ContextAction, ClickAction, ItemType } from '../../types';

// All available actions for Context Menu (ordered same as deck context menu)
export const AVAILABLE_ACTIONS: { id: ContextAction; label: string }[] = [
  { id: 'clone', label: 'Clone Object' },
  { id: 'delete', label: 'Delete Object' },
  { id: 'flip', label: 'Flip Card' },
  { id: 'layer', label: 'Change Layer (section)' },
  { id: 'layerUp', label: 'Layer Up' },
  { id: 'layerDown', label: 'Layer Down' },
  { id: 'lock', label: 'Lock/Unlock Position' },
  { id: 'pin', label: 'Pin/Unpin to Screen' },
  { id: 'rotate', label: 'Rotation (section)' },
  { id: 'rotateClockwise', label: 'Rotate Clockwise' },
  { id: 'rotateCounterClockwise', label: 'Rotate Counter-Clockwise' },
  { id: 'swingClockwise', label: 'Swing Clockwise' },
  { id: 'swingCounterClockwise', label: 'Swing Counter-Clockwise' },
];

// "Move to" actions are only for Action Buttons for Cards, NOT for Context Menu Actions
export const MOVE_TO_ACTIONS: { id: ContextAction; label: string }[] = [
  { id: 'moveTo', label: 'Move to... (section)' },
  { id: 'moveToHand', label: 'Move to Hand' },
  { id: 'moveToTopDeck', label: 'Move to Top Deck' },
  { id: 'moveToBottomDeck', label: 'Move to Bottom Deck' },
  { id: 'moveToDiscard', label: 'Move to Discard' },
];

// Actions that should NOT appear as quick action buttons (only in context menu)
export const EXCLUDED_FROM_BUTTONS: ContextAction[] = ['clone', 'delete', 'layer', 'lock', 'pin', 'rotate'];

// Check if an action can be shown as an action button
export function isActionButtonAllowed(action: ContextAction): boolean {
  return !EXCLUDED_FROM_BUTTONS.includes(action);
}

// Helper to determine which actions are available as buttons for which object types
export function getButtonApplicableTypes(action: ContextAction): ItemType[] {
  // Exclude actions that should only be in context menu
  if (!isActionButtonAllowed(action)) return [];

  switch (action) {
    case 'layerUp':
    case 'layerDown':
      return [ItemType.DECK, ItemType.CARD, ItemType.TOKEN, ItemType.COUNTER, ItemType.DICE_OBJECT, ItemType.BOARD];
    case 'rotateClockwise':
    case 'rotateCounterClockwise':
    case 'swingClockwise':
    case 'swingCounterClockwise':
      return [ItemType.DECK, ItemType.CARD, ItemType.TOKEN, ItemType.COUNTER, ItemType.DICE_OBJECT, ItemType.BOARD];
    case 'flip':
      return [ItemType.CARD];
    case 'rotate':
      return [ItemType.CARD, ItemType.TOKEN, ItemType.COUNTER, ItemType.DICE_OBJECT, ItemType.BOARD];
    default:
      return [];
  }
}

// Available click actions (all actions from AVAILABLE_ACTIONS + none)
export const CLICK_ACTIONS = [
  { id: 'none' as const, label: 'None' },
  ...AVAILABLE_ACTIONS.map(a => ({ id: a.id, label: a.label }))
];

// Card-specific click actions (includes showTooltipImage which is not a ContextAction)
export const CARD_CLICK_ACTIONS: { id: ClickAction; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'showTooltipImage' as const, label: 'Card Tooltip Image' },
  ...AVAILABLE_ACTIONS.map(a => ({ id: a.id, label: a.label }))
];
