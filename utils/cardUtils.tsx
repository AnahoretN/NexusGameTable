import { Card, Deck as DeckType, CardOrientation, CardShape } from '../types';
import { isGeometricCardShape } from './shapeUtils';

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

  // Check if this is a geometric shape
  const isGeometricShape = isGeometricCardShape(cardShape);

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
