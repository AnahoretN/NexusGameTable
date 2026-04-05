import { Card, Deck as DeckType, CardOrientation, CardShape, CardNamePosition, ContextAction } from '../types';
import { isGeometricCardShape } from './shapeUtils';

// Cache for card dimensions to avoid repeated calculations
const cardDimensionsCache = new Map<string, { width: number; height: number }>();

/**
 * Get card dimensions based on deck settings and display scale
 * Results are cached to avoid repeated calculations
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

  // Create cache key from card properties including dimensions
  // This ensures cache is invalidated when card dimensions change
  const cacheKey = `${card.id}-${deck?.id || 'nodeck'}-${displayScale}-${baseScale}-${cardWidth}-${cardHeight}-${deck?.cardOrientation}`;

  // Check cache first
  if (cardDimensionsCache.has(cacheKey)) {
    return cardDimensionsCache.get(cacheKey)!;
  }

  // Simply scale the actual dimensions - preserve exact aspect ratio from settings
  // NO swapping of width/height - use exactly what's specified in settings
  const result = {
    width: cardWidth * actualScale,
    height: cardHeight * actualScale
  };

  // Cache the result
  cardDimensionsCache.set(cacheKey, result);

  return result;
}

/**
 * Clear the card dimensions cache (useful for memory management)
 */
export function clearCardDimensionsCache() {
  cardDimensionsCache.clear();
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
