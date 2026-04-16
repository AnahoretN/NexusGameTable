/**
 * PlayerContext - Synchronized with GameContext
 *
 * This context provides optimized hooks for player data while keeping GameContext
 * as the single source of truth. Changes are synchronized bidirectionally.
 *
 * Status: 🔄 Synchronization Bridge (Phase 2 Completion)
 */

import React, { createContext, useContext, useCallback, useEffect, useMemo } from 'react';
import { useGame } from '../GameContext';
import {
  PlayerContextValue,
  PlayerState,
  initialPlayerState,
} from './contextTypes';
import { Player, PlayerPermissions } from '../../types';

// ============================================================================
// CONTEXT
// ============================================================================

const PlayerContext = createContext<PlayerContextValue | null>(null);

// ============================================================================
// PROVIDER
// ============================================================================

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const { state, dispatch } = useGame();

  // Create synchronized player state from GameContext
  const playerState: PlayerState = useMemo(() => ({
    players: state.players || [],
    activePlayerId: state.activePlayerId || 'gm',
    playerPermissions: state.playerPermissions || initialPlayerState.playerPermissions,
  }), [state.players, state.activePlayerId, state.playerPermissions]);

  // Actions that sync with GameContext
  const addPlayer = useCallback((player: Player) => {
    dispatch({ type: 'ADD_PLAYER', payload: player });
  }, [dispatch]);

  const updatePlayer = useCallback((id: string, updates: Partial<Player>) => {
    dispatch({ type: 'UPDATE_PLAYER', payload: { id, updates } });
  }, [dispatch]);

  const removePlayer = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_PLAYER', payload: id });
  }, [dispatch]);

  const setActivePlayer = useCallback((id: string) => {
    dispatch({ type: 'SET_ACTIVE_ID', payload: id });
  }, [dispatch]);

  const updatePermissions = useCallback((permissions: Partial<PlayerPermissions>) => {
    dispatch({ type: 'UPDATE_PLAYER_PERMISSIONS', payload: permissions });
  }, [dispatch]);

  // Getters - optimized with memoization
  const getActivePlayer = useCallback((): Player | undefined => {
    return playerState.players.find(p => p.id === playerState.activePlayerId);
  }, [playerState.players, playerState.activePlayerId]);

  const isGM = useCallback((): boolean => {
    const activePlayer = getActivePlayer();
    return activePlayer?.isGM || false;
  }, [getActivePlayer]);

  const getPlayerById = useCallback((id: string): Player | undefined => {
    return playerState.players.find(p => p.id === id);
  }, [playerState.players]);

  const getPlayersByColor = useCallback((color: string): Player[] => {
    return playerState.players.filter(p => p.color === color);
  }, [playerState.players]);

  // Context value
  const value: PlayerContextValue = useMemo(() => ({
    // State
    ...playerState,

    // Actions
    addPlayer,
    updatePlayer,
    removePlayer,
    setActivePlayer,
    updatePermissions,

    // Getters
    getActivePlayer,
    isGM,
    getPlayerById,
    getPlayersByColor,
  }), [
    playerState,
    addPlayer,
    updatePlayer,
    removePlayer,
    setActivePlayer,
    updatePermissions,
    getActivePlayer,
    isGM,
    getPlayerById,
    getPlayersByColor,
  ]);

  return (
    <PlayerContext.Provider value={value}>
      {children}
    </PlayerContext.Provider>
  );
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Main hook to access PlayerContext
 * Provides full access to player state and actions
 */
export function usePlayers(): PlayerContextValue {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayers must be used within PlayerProvider');
  }
  return context;
}

/**
 * Optimized hook to get active player only
 * Use this when you only need the current active player
 */
export function useActivePlayer(): Player | undefined {
  const context = usePlayers();
  return context.getActivePlayer();
}

/**
 * Optimized hook to check if current user is GM
 * Use this for permission checks
 */
export function useIsGM(): boolean {
  const context = usePlayers();
  return context.isGM();
}

/**
 * Optimized hook to get player list
 * Use this when rendering player lists
 */
export function usePlayerList(): Player[] {
  const context = usePlayers();
  return context.players;
}

/**
 * Optimized hook to get player permissions
 * Use this for permission-based UI rendering
 */
export function usePlayerPermissions(): PlayerPermissions {
  const context = usePlayers();
  return context.playerPermissions;
}

/**
 * Optimized hook to get active player ID
 * Use this when you only need the ID
 */
export function useActivePlayerId(): string {
  const context = usePlayers();
  return context.activePlayerId;
}
