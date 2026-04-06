import { Player } from '../types';

/**
 * Find the Game Master player from the players array
 * @param players - Array of players
 * @returns The GM player or undefined if not found
 */
export function findGM(players: Player[]): Player | undefined {
  return players.find(p => p.isGM === true);
}

/**
 * Check if a player is the Game Master
 * @param player - Player to check
 * @returns True if the player is GM
 */
export function isGM(player: Player | undefined): boolean {
  return player?.isGM === true;
}

/**
 * Get the current GM player or create a default one if none exists
 * @param players - Array of players
 * @returns The GM player (existing or default)
 */
export function getOrCreateGM(players: Player[]): Player {
  const gm = findGM(players);
  if (gm) {
    return gm;
  }

  // If no GM exists, return a default one
  return {
    id: 'gm',
    name: 'Game Master',
    color: '#FF6B6B',
    isGM: true,
  };
}
