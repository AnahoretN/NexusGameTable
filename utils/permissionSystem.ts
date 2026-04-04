/**
 * Unified Permission System
 * Centralized permission checking for all game actions
 */

import { TableObject, ItemType, Deck, Card, ContextAction } from '../types';

// ============================================
// PERMISSION TYPES
// ============================================

export type PermissionLevel = 'gm' | 'player' | 'owner' | 'anyone';

export interface PermissionContext {
  isGM: boolean;
  playerId?: string;
  objectOwnerId?: string;
  allowedActions?: string[];
  allowedActionsForGM?: string[];
}

// ============================================
// PERMISSION DEFINITIONS
// ============================================

/**
 * Actions that GM can always perform (unless explicitly restricted)
 */
export const GM_DEFAULT_ACTIONS: ContextAction[] = [
  'configure', 'delete', 'clone', 'lock', 'pin', 'show', 'hide',
  'rotate', 'rotateClockwise', 'rotateCounterClockwise', 'resetRotation',
  'swingClockwise', 'swingCounterClockwise',
  'bringToFront', 'sendToBack', 'layerUp', 'layerDown',
  'flip', 'draw', 'playTopCard', 'shuffleDeck', 'searchDeck',
  'showTop', 'hideTop', 'returnAll', 'returnAllAndShuffle', 'returnAllExceptHands',
  'moveToHand', 'moveToDeck', 'moveToDiscard', 'moveToTopDeck', 'moveToBottomDeck',
  'roll', 'millTopCard', 'millToBottom', 'toBottom', 'topDeck'
];

/**
 * Actions that require explicit permission for players
 */
export const PLAYER_RESTRICTED_ACTIONS: ContextAction[] = [
  'delete', 'clone', 'configure', 'lock', 'pin',
  'show', 'hide', 'returnAll', 'returnAllAndShuffle', 'returnAllExceptHands'
];

/**
 * Actions that are generally safe for players
 */
export const PLAYER_DEFAULT_ACTIONS: ContextAction[] = [
  'flip', 'rotate', 'rotateClockwise', 'rotateCounterClockwise',
  'swingClockwise', 'swingCounterClockwise',
  'bringToFront', 'sendToBack', 'layerUp', 'layerDown',
  'draw', 'playTopCard', 'shuffleDeck', 'searchDeck',
  'showTop', 'hideTop', 'moveToHand', 'moveToDeck', 'moveToDiscard',
  'moveToTopDeck', 'moveToBottomDeck', 'roll', 'millTopCard', 'millToBottom',
  'toBottom', 'topDeck'
];

// ============================================
// PERMISSION CHECKERS
// ============================================

/**
 * Check if a user can perform a specific action on an object
 */
export function canPerformAction(
  action: ContextAction,
  context: PermissionContext
): boolean {
  const { isGM, allowedActions, allowedActionsForGM } = context;

  // GM permission logic
  if (isGM) {
    // If GM actions are explicitly defined, check against them
    if (allowedActionsForGM && allowedActionsForGM.length > 0) {
      return allowedActionsForGM.includes(action);
    }
    // Otherwise, GM can do anything unless explicitly restricted
    if (allowedActions && allowedActions.length > 0) {
      return allowedActions.includes(action);
    }
    // Default: GM can do everything
    return true;
  }

  // Player permission logic - must have explicit permission
  if (allowedActions && allowedActions.length > 0) {
    return allowedActions.includes(action);
  }

  // Default: player cannot perform restricted actions
  return !PLAYER_RESTRICTED_ACTIONS.includes(action);
}

/**
 * Check if a user can configure an object
 */
export function canConfigure(context: PermissionContext): boolean {
  return canPerformAction('configure', context);
}

/**
 * Check if a user can delete an object
 */
export function canDelete(context: PermissionContext): boolean {
  return canPerformAction('delete', context);
}

/**
 * Check if a user can modify an object (lock, clone, etc.)
 */
export function canModify(context: PermissionContext): boolean {
  return canPerformAction('lock', context) || canPerformAction('clone', context);
}

/**
 * Check if a user can move objects between locations
 */
export function canMoveObjects(context: PermissionContext): boolean {
  return canPerformAction('moveToHand', context);
}

// ============================================
// OBJECT-SPECIFIC PERMISSIONS
// ============================================

/**
 * Get permission context for a specific object
 */
export function getObjectPermissionContext(
  object: TableObject,
  playerId: string | undefined,
  isGM: boolean
): PermissionContext {
  const allowedActions = (object as any).allowedActions as string[] | undefined;
  const allowedActionsForGM = (object as any).allowedActionsForGM as string[] | undefined;

  return {
    isGM,
    playerId,
    objectOwnerId: (object as any).ownerId,
    allowedActions,
    allowedActionsForGM
  };
}

/**
 * Check if user can interact with a deck
 */
export function canInteractWithDeck(
  deck: Deck,
  playerId: string | undefined,
  isGM: boolean
): boolean {
  const context = getObjectPermissionContext(deck, playerId, isGM);
  return canPerformAction('draw', context) || canPerformAction('playTopCard', context);
}

/**
 * Check if user can interact with a card
 */
export function canInteractWithCard(
  card: Card,
  playerId: string | undefined,
  isGM: boolean
): boolean {
  const context = getObjectPermissionContext(card, playerId, isGM);
  return canPerformAction('flip', context);
}

// ============================================
// PERMISSION HELPERS
// ============================================

/**
 * Create a permission checker function for a specific context
 */
export function createPermissionChecker(context: PermissionContext) {
  return (action: ContextAction) => canPerformAction(action, context);
}

/**
 * Filter actions to only those the user can perform
 */
export function filterAllowedActions(
  actions: ContextAction[],
  context: PermissionContext
): ContextAction[] {
  return actions.filter(action => canPerformAction(action, context));
}

/**
 * Get all allowed actions for a user in a specific context
 */
export function getAllowedActions(
  defaultActions: ContextAction[],
  context: PermissionContext
): ContextAction[] {
  if (context.isGM) {
    // GM uses GM-specific actions if defined, otherwise all actions
    if (context.allowedActionsForGM && context.allowedActionsForGM.length > 0) {
      return context.allowedActionsForGM as ContextAction[];
    }
    if (context.allowedActions && context.allowedActions.length > 0) {
      return context.allowedActions as ContextAction[];
    }
    return GM_DEFAULT_ACTIONS;
  }

  // Players use explicitly allowed actions or defaults
  if (context.allowedActions && context.allowedActions.length > 0) {
    return context.allowedActions as ContextAction[];
  }

  return defaultActions;
}

// ============================================
// PERMISSION VALIDATION
// ============================================

/**
 * Validate action permission and throw if not allowed
 */
export function validateActionPermission(
  action: ContextAction,
  context: PermissionContext,
  objectName?: string
): void {
  if (!canPerformAction(action, context)) {
    const objectDesc = objectName ? ` on "${objectName}"` : '';
    throw new Error(
      `Permission denied: Cannot perform "${action}"${objectDesc}. ` +
      `Player: ${context.playerId || 'unknown'}, GM: ${context.isGM}`
    );
  }
}

/**
 * Safe action execution with permission check
 */
export function executeWithPermissionCheck<T>(
  action: ContextAction,
  context: PermissionContext,
  execute: () => T,
  objectName?: string
): T {
  validateActionPermission(action, context, objectName);
  return execute();
}

// ============================================
// REACT HOOK
// ============================================

import { useMemo } from 'react';

/**
 * Hook to create a permission checker for current user
 */
export function usePermissionChecker(
  isGM: boolean,
  playerId?: string
) {
  return useMemo(() => {
    return {
      can: (action: ContextAction, object?: TableObject) => {
        const context = object
          ? getObjectPermissionContext(object, playerId, isGM)
          : { isGM, playerId };

        return canPerformAction(action, context);
      },

      canConfigure: (object?: TableObject) => {
        const context = object
          ? getObjectPermissionContext(object, playerId, isGM)
          : { isGM, playerId };
        return canConfigure(context);
      },

      canDelete: (object?: TableObject) => {
        const context = object
          ? getObjectPermissionContext(object, playerId, isGM)
          : { isGM, playerId };
        return canDelete(context);
      },

      filterActions: (actions: ContextAction[], object?: TableObject) => {
        const context = object
          ? getObjectPermissionContext(object, playerId, isGM)
          : { isGM, playerId };
        return filterAllowedActions(actions, context);
      }
    };
  }, [isGM, playerId]);
}
