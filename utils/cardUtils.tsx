import React from 'react';
import { Eye, RefreshCw, Copy } from 'lucide-react';
import { Card, ContextAction, Deck as DeckType, CardOrientation, CardNamePosition } from '../types';

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
  const cardWidth = deck?.cardWidth ?? 100;
  const cardHeight = deck?.cardHeight ?? 140;
  const isHorizontal = deck?.cardOrientation === CardOrientation.HORIZONTAL;

  // For horizontal orientation, swap width and height for the card itself
  const actualCardWidth = isHorizontal ? cardHeight : cardWidth;
  const actualCardHeight = isHorizontal ? cardWidth : cardHeight;

  // Base width for display - horizontal cards get more width
  // This matches the logic in SearchDeckModal where horizontal cards get 1.254x multiplier
  const baseWidth = 140;
  const scaledBaseWidth = isHorizontal ? baseWidth * 1.254 * actualScale : baseWidth * actualScale;

  // Calculate aspect ratio from the card's actual dimensions
  const aspectRatio = actualCardWidth / actualCardHeight;

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
} {
  if (!card.deckId) {
    return {
      cardWidth: 100,
      cardHeight: 140,
      cardNamePosition: 'none' as CardNamePosition,
      cardOrientation: CardOrientation.VERTICAL,
      cardActionButtons: []
    };
  }

  const deck = objects[card.deckId] as DeckType | undefined;
  return {
    cardWidth: deck?.cardWidth ?? 100,
    cardHeight: deck?.cardHeight ?? 140,
    cardNamePosition: (deck?.cardNamePosition ?? 'none') as CardNamePosition,
    cardOrientation: (deck?.cardOrientation ?? CardOrientation.VERTICAL) as CardOrientation,
    cardActionButtons: deck?.cardActionButtons ?? []
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
  onFlip: () => void,
  onRotate: () => void,
  onClone: () => void
): ButtonConfig[] {
  const configs: Record<string, ButtonConfig> = {
    flip: {
      className: 'bg-purple-600 hover:bg-purple-500',
      title: 'Flip',
      icon: <Eye size={14} />,
      onAction: onFlip
    },
    rotate: {
      className: 'bg-green-600 hover:bg-green-500',
      title: 'Rotate',
      icon: <RefreshCw size={14} />,
      onAction: onRotate
    },
    clone: {
      className: 'bg-cyan-600 hover:bg-cyan-500',
      title: 'Clone',
      icon: <Copy size={14} />,
      onAction: onClone
    }
  };

  return actionButtons.map(action => configs[action]).filter(Boolean);
}
