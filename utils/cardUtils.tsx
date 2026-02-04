import React from 'react';
import { Eye, RefreshCw, Copy, RotateCw, Move3D, ArrowUp, ArrowDown, Hand } from 'lucide-react';
import { Card, ContextAction, Deck as DeckType, CardOrientation, CardNamePosition, CardShape } from '../types';

/**
 * Get card dimensions based on deck settings and display scale
 */
export function getCardDimensions(
  card: Card,
  deck: DeckType | undefined,
  displayScale: number,
  baseScale: number = 0.9
): { width: number; height: number } {
  const actualScale = displayScale * baseScale;
  // Use card's own dimensions first, then fall back to deck settings
  const cardWidth = card.width ?? deck?.cardWidth ?? 100;
  const cardHeight = card.height ?? deck?.cardHeight ?? 140;
  const cardShape = deck?.cardShape ?? card.shape ?? CardShape.POKER;
  const isHorizontal = deck?.cardOrientation === CardOrientation.HORIZONTAL;

  // For geometric shapes (HEX, TRIANGLE, CIRCLE) with horizontal orientation,
  // dimensions are swapped (like in DeckComponent) but NOT through rotation
  // For other shapes, horizontal orientation means rotation by -90deg
  const isGeometricShape = cardShape === CardShape.HEX || cardShape === CardShape.TRIANGLE || cardShape === CardShape.CIRCLE;

  let baseCardWidth = cardWidth;
  let baseCardHeight = cardHeight;

  // For geometric shapes with horizontal orientation, swap dimensions
  // (matches the effectiveWidth/effectiveHeight logic in DeckComponent)
  if (isGeometricShape && isHorizontal) {
    baseCardWidth = cardHeight;
    baseCardHeight = cardWidth;
  }

  // For non-geometric shapes with horizontal orientation, swap dimensions
  // (the card is rotated -90deg, so we need to display it "sideways")
  if (!isGeometricShape && isHorizontal) {
    baseCardWidth = cardHeight;
    baseCardHeight = cardWidth;
  }

  // Base width for display - horizontal cards get more width
  // This matches the logic in SearchDeckModal where horizontal cards get 1.254x multiplier
  const baseDisplayWidth = 140;
  const scaledBaseWidth = isHorizontal ? baseDisplayWidth * 1.254 * actualScale : baseDisplayWidth * actualScale;

  // Calculate aspect ratio from the card's display dimensions
  const aspectRatio = baseCardWidth / baseCardHeight;

  // Final dimensions based on base width and aspect ratio
  const finalWidth = scaledBaseWidth;
  const finalHeight = scaledBaseWidth / aspectRatio;

  return { width: finalWidth, height: finalHeight };
}

/**
 * Get card settings from deck
 */
export function getCardSettings(
  card: Card,
  objects: Record<string, unknown>
): {
  cardWidth: number;
  cardHeight: number;
  cardNamePosition: CardNamePosition;
  cardOrientation: CardOrientation;
  cardActionButtons: ContextAction[];
  allowedActions: ContextAction[] | undefined;
  allowedActionsForGM: ContextAction[] | undefined;
  rotationStep: number;
} {
  if (!card.deckId) {
    return {
      cardWidth: 100,
      cardHeight: 140,
      cardNamePosition: 'none' as CardNamePosition,
      cardOrientation: CardOrientation.VERTICAL,
      cardActionButtons: [],
      allowedActions: undefined,
      allowedActionsForGM: undefined,
      rotationStep: 45
    };
  }

  const deck = objects[card.deckId] as DeckType | undefined;
  return {
    cardWidth: deck?.cardWidth ?? 100,
    cardHeight: deck?.cardHeight ?? 140,
    cardNamePosition: (deck?.cardNamePosition ?? 'none') as CardNamePosition,
    cardOrientation: (deck?.cardOrientation ?? CardOrientation.VERTICAL) as CardOrientation,
    cardActionButtons: deck?.cardActionButtons ?? [],
    allowedActions: deck?.cardAllowedActions,
    allowedActionsForGM: deck?.cardAllowedActionsForGM,
    rotationStep: deck?.rotationStep ?? 45
  };
}

/**
 * Get card button configurations for action buttons
 */
export interface ButtonConfig {
  className: string;
  title: string;
  icon: JSX.Element;
  onAction: () => void;
}

export function getCardButtonConfigs(
  card: Card,
  actionButtons: ContextAction[] = [],
  callbacks: {
    onFlip?: () => void;
    onRotate?: () => void;
    onRotateClockwise?: () => void;
    onRotateCounterClockwise?: () => void;
    onSwingingClockwise?: () => void;
    onSwingingCounterClockwise?: () => void;
    onLayerUp?: () => void;
    onLayerDown?: () => void;
    onClone?: () => void;
    onMoveToHand?: () => void;
    onMoveToTopDeck?: () => void;
    onMoveToBottomDeck?: () => void;
  }
): ButtonConfig[] {
  // Exclude rotate and swing buttons from hand panel
  const filteredActions = actionButtons.filter(action =>
    action !== 'rotate' &&
    action !== 'rotateClockwise' &&
    action !== 'rotateCounterClockwise' &&
    action !== 'swingClockwise' &&
    action !== 'swingCounterClockwise'
  );

  const configs: Record<string, ButtonConfig> = {
    flip: {
      className: 'bg-purple-600 hover:bg-purple-500',
      title: 'Flip',
      icon: <Eye size={14} />,
      onAction: callbacks.onFlip || (() => {})
    },
    rotate: {
      className: 'bg-green-600 hover:bg-green-500',
      title: 'Rotate',
      icon: <RefreshCw size={14} />,
      onAction: callbacks.onRotate || (() => {})
    },
    rotateClockwise: {
      className: 'bg-yellow-600 hover:bg-yellow-500',
      title: 'Rotate Clockwise',
      icon: <RotateCw size={14} />,
      onAction: callbacks.onRotateClockwise || (() => {})
    },
    rotateCounterClockwise: {
      className: 'bg-yellow-600 hover:bg-yellow-500',
      title: 'Rotate Counter-Clockwise',
      icon: <RotateCw size={14} style={{ transform: 'scaleX(-1)' }} />,
      onAction: callbacks.onRotateCounterClockwise || (() => {})
    },
    swingClockwise: {
      className: 'bg-green-600 hover:bg-green-500',
      title: 'Swing Clockwise',
      icon: <Move3D size={14} />,
      onAction: callbacks.onSwingingClockwise || (() => {})
    },
    swingCounterClockwise: {
      className: 'bg-green-600 hover:bg-green-500',
      title: 'Swing Counter-Clockwise',
      icon: <Move3D size={14} style={{ transform: 'scaleX(-1)' }} />,
      onAction: callbacks.onSwingingCounterClockwise || (() => {})
    },
    layerUp: {
      className: 'bg-blue-600 hover:bg-blue-500',
      title: 'Layer Up',
      icon: <ArrowUp size={14} />,
      onAction: callbacks.onLayerUp || (() => {})
    },
    layerDown: {
      className: 'bg-blue-600 hover:bg-blue-500',
      title: 'Layer Down',
      icon: <ArrowDown size={14} />,
      onAction: callbacks.onLayerDown || (() => {})
    },
    clone: {
      className: 'bg-cyan-600 hover:bg-cyan-500',
      title: 'Clone',
      icon: <Copy size={14} />,
      onAction: callbacks.onClone || (() => {})
    },
    // "Move to" actions
    moveToHand: {
      className: 'bg-blue-600 hover:bg-blue-500',
      title: 'Move to Hand',
      icon: <Hand size={14} />,
      onAction: callbacks.onMoveToHand || (() => {})
    },
    moveToTopDeck: {
      className: 'bg-orange-600 hover:bg-orange-500',
      title: 'Move to Top Deck',
      icon: <ArrowUp size={14} />,
      onAction: callbacks.onMoveToTopDeck || (() => {})
    },
    moveToBottomDeck: {
      className: 'bg-yellow-600 hover:bg-yellow-500',
      title: 'Move to Bottom Deck',
      icon: <ArrowDown size={14} />,
      onAction: callbacks.onMoveToBottomDeck || (() => {})
    }
  };

  return filteredActions.map(action => configs[action]).filter(Boolean);
}
