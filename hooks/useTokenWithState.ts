import { useMemo } from 'react';
import { TokenType, Token, TableObject, ItemType, TokenState } from '../types';

/**
 * Get token with applied state for rendering
 * This is a pure function that returns a token object with state properties applied
 * Works with both Token (instances) and TokenType (archetypes)
 */
const getTokenWithAppliedState = (
  token: TokenType | Token,
  allObjects: Record<string, TableObject>
): TokenType | Token => {
  // If no currentStateId, return token as-is
  const currentStateId = (token as any).currentStateId;

  if (!currentStateId) {
    return token;
  }

  // Determine where to get states and fallback values from
  let archetype: TokenType | Token | null = null;
  let states: TokenState[] = [];

  if (token.type === ItemType.TOKEN_TYPE) {
    // Token archetype - use itself as archetype
    archetype = token;
    states = token.states || [];
  } else if ((token as any).archetypeId && allObjects[(token as any).archetypeId]) {
    // Token copy - get archetype and its states
    archetype = allObjects[(token as any).archetypeId] as TokenType;
    states = archetype.states || [];
  } else {
    // Token without archetype - check if it has its own states
    states = token.states || [];

    if (states.length === 0) {
      return token;
    }

    // Use token itself as fallback for values
    archetype = token;
  }

  // Find the current state
  const currentState = states.find(s => s.id === currentStateId);

  if (!currentState || !archetype) {
    return token;
  }

  // Create a new object with state properties applied
  // Priority: state value > archetype value > token value
  const result: TokenType | Token = { ...token };

  // For each property, use: state value if defined, otherwise archetype value
  result.content = currentState.content ?? archetype.content;
  result.color = currentState.color ?? archetype.color;
  result.borderColor = currentState.borderColor ?? archetype.borderColor;
  result.borderWidth = currentState.borderWidth ?? archetype.borderWidth;
  result.opacity = currentState.opacity ?? archetype.opacity;
  (result as any).borderOpacity = currentState.borderOpacity ?? (archetype as any).borderOpacity;
  result.shape = currentState.shape ?? archetype.shape;
  result.width = currentState.width ?? archetype.width;
  result.height = currentState.height ?? archetype.height;
  result.rotation = currentState.rotation ?? token.rotation; // rotation stays from token
  (result as any).rotationStep = currentState.rotationStep ?? (archetype as any).rotationStep;
  (result as any).fontColor = currentState.fontColor ?? (archetype as any).fontColor;
  (result as any).showNameOnToken = currentState.showNameOnToken ?? (archetype as any).showNameOnToken;
  (result as any).tooltipText = currentState.tooltipText ?? (archetype as any).tooltipText;

  return result;
};

/**
 * Memoized hook to get token with applied state
 * This prevents unnecessary re-computation of token state
 *
 * @param token - The token object (raw, without state applied)
 * @param allObjects - All objects in the state (needed for archetype lookup)
 * @returns Token with state applied
 */
export const useTokenWithState = (
  token: TokenType | Token,
  allObjects: Record<string, TableObject>
): TokenType | Token => {
  return useMemo(() => {
    return getTokenWithAppliedState(token, allObjects);
  }, [
    token,
    token.id,
    token.content,
    token.color,
    token.borderWidth,
    token.borderColor,
    (token as any).borderOpacity,
    token.opacity,
    token.shape,
    token.width,
    token.height,
    (token as any).currentStateId,
    (token as any).archetypeId,
    (allObjects[(token as any).archetypeId] as TokenType | Token | undefined)?.states,
    allObjects[(token as any).currentStateId]
  ]);
};

// Re-export the pure function for non-hook usage
export { getTokenWithAppliedState };
