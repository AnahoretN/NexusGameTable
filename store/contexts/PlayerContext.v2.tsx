/**
 * PlayerContext v2.0 - Независимый контекст для управления игроками
 *
 * @version 2.0.0
 * @since 2026-04-17
 *
 * ИЗМЕНЕНИЯ с v1.0:
 * ✅ Полностью независим от GameContext
 * ✅ Использует собственный reducer
 * ✅ Добавлена WebRTC синхронизация
 * ✅ Оптимизированные hooks для предотвращения ререндеров
 * ✅ Сохранена обратная совместимость API
 */

import React, { createContext, useContext, useReducer, useCallback, useEffect, useMemo } from 'react';
import { Player, PlayerPermissions } from '../../types';
import { WebRTCSyncManager, PlayerSyncData } from '../../utils/webrtcSyncManager';
import { logger } from '../../utils/logger';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Состояние PlayerContext
 */
export interface PlayerState {
  players: Player[];
  activePlayerId: string;
  playerPermissions: PlayerPermissions;
}

/**
 * Значение PlayerContext
 */
export interface PlayerContextValue extends PlayerState {
  // Actions
  addPlayer: (player: Player) => void;
  updatePlayer: (id: string, updates: Partial<Player>) => void;
  removePlayer: (id: string) => void;
  setActivePlayer: (id: string) => void;
  updatePermissions: (permissions: Partial<PlayerPermissions>) => void;

  // Getters
  getActivePlayer: () => Player | undefined;
  isGM: () => boolean;
  getPlayerById: (id: string) => Player | undefined;
  getPlayersByColor: (color: string) => Player[];

  // WebRTC методы (новые в v2.0)
  syncFromRemote: (remoteData: PlayerSyncData) => void;
  getSyncData: () => PlayerSyncData;
  onPlayerChange?: (data: PlayerSyncData) => void; // Callback для WebRTC
}

/**
 * Action типы для reducer
 */
type PlayerAction =
  | { type: 'ADD_PLAYER'; payload: Player }
  | { type: 'UPDATE_PLAYER'; payload: { id: string; updates: Partial<Player> } }
  | { type: 'REMOVE_PLAYER'; payload: string }
  | { type: 'SET_ACTIVE_PLAYER'; payload: string }
  | { type: 'UPDATE_PERMISSIONS'; payload: Partial<PlayerPermissions> }
  | { type: 'SYNC_FROM_REMOTE'; payload: PlayerSyncData }; // Новый action для WebRTC

// ============================================================================
// REDUCER
// ============================================================================

/**
 * Начальное состояние
 */
const initialPlayerState: PlayerState = {
  players: [
    {
      id: 'gm',
      name: 'Game Master',
      color: '#FF0000',
      isGM: true,
    }
  ],
  activePlayerId: 'gm',
  playerPermissions: {
    createObjects: false,
    configureObjects: false,
    deleteObjects: false,
    hideObjects: false,
  },
};

/**
 * Reducer для PlayerContext
 */
function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case 'ADD_PLAYER':
      logger.debug('[PlayerContext] Adding player:', action.payload);
      return {
        ...state,
        players: [...state.players, action.payload],
      };

    case 'UPDATE_PLAYER':
      logger.debug('[PlayerContext] Updating player:', action.payload.id);
      return {
        ...state,
        players: state.players.map(p =>
          p.id === action.payload.id
            ? { ...p, ...action.payload.updates }
            : p
        ),
      };

    case 'REMOVE_PLAYER':
      logger.debug('[PlayerContext] Removing player:', action.payload);
      return {
        ...state,
        players: state.players.filter(p => p.id !== action.payload),
      };

    case 'SET_ACTIVE_PLAYER':
      logger.debug('[PlayerContext] Setting active player:', action.payload);
      return {
        ...state,
        activePlayerId: action.payload,
      };

    case 'UPDATE_PERMISSIONS':
      logger.debug('[PlayerContext] Updating permissions:', action.payload);
      return {
        ...state,
        playerPermissions: {
          ...state.playerPermissions,
          ...action.payload,
        },
      };

    case 'SYNC_FROM_REMOTE':
      // Новый action для WebRTC синхронизации
      logger.debug('[PlayerContext] Syncing from remote:', action.payload);
      return {
        ...state,
        players: action.payload.players || state.players,
        activePlayerId: action.payload.activePlayerId || state.activePlayerId,
        playerPermissions: action.payload.playerPermissions || state.playerPermissions,
      };

    default:
      return state;
  }
}

// ============================================================================
// CONTEXT
// ============================================================================

const PlayerContext = createContext<PlayerContextValue | null>(null);

// ============================================================================
// PROVIDER
// ============================================================================

interface PlayerProviderProps {
  children: React.ReactNode;
  initialSyncData?: PlayerSyncData; // Начальные данные из WebRTC
  onPlayerChange?: (data: PlayerSyncData) => void; // Callback для WebRTC синхронизации
}

export function PlayerProviderV2({
  children,
  initialSyncData,
  onPlayerChange
}: PlayerProviderProps) {
  // Инициализируем состояние из initialSyncData или используем дефолтное
  const initialState = useMemo(() => {
    if (initialSyncData) {
      return {
        players: initialSyncData.players || initialPlayerState.players,
        activePlayerId: initialSyncData.activePlayerId || initialPlayerState.activePlayerId,
        playerPermissions: initialSyncData.playerPermissions || initialPlayerState.playerPermissions,
      };
    }
    return initialPlayerState;
  }, [initialSyncData]);

  const [state, dispatch] = useReducer(playerReducer, initialState);

  // WebRTC синхронизация - уведомляем об изменениях
  useEffect(() => {
    if (onPlayerChange) {
      const syncData: PlayerSyncData = {
        players: state.players,
        activePlayerId: state.activePlayerId,
        playerPermissions: state.playerPermissions,
      };

      onPlayerChange(syncData);
    }
  }, [state, onPlayerChange]);

  // Actions
  const addPlayer = useCallback((player: Player) => {
    dispatch({ type: 'ADD_PLAYER', payload: player });
  }, []);

  const updatePlayer = useCallback((id: string, updates: Partial<Player>) => {
    dispatch({ type: 'UPDATE_PLAYER', payload: { id, updates } });
  }, []);

  const removePlayer = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_PLAYER', payload: id });
  }, []);

  const setActivePlayer = useCallback((id: string) => {
    dispatch({ type: 'SET_ACTIVE_PLAYER', payload: id });
  }, []);

  const updatePermissions = useCallback((permissions: Partial<PlayerPermissions>) => {
    dispatch({ type: 'UPDATE_PERMISSIONS', payload: permissions });
  }, []);

  // Getters - оптимизированы с useCallback
  const getActivePlayer = useCallback((): Player | undefined => {
    return state.players.find(p => p.id === state.activePlayerId);
  }, [state.players, state.activePlayerId]);

  const isGM = useCallback((): boolean => {
    const activePlayer = getActivePlayer();
    return activePlayer?.isGM || false;
  }, [getActivePlayer]);

  const getPlayerById = useCallback((id: string): Player | undefined => {
    return state.players.find(p => p.id === id);
  }, [state.players]);

  const getPlayersByColor = useCallback((color: string): Player[] => {
    return state.players.filter(p => p.color === color);
  }, [state.players]);

  // WebRTC методы (новые в v2.0)
  const syncFromRemote = useCallback((remoteData: PlayerSyncData) => {
    logger.info('[PlayerContext] Syncing from remote:', remoteData);
    dispatch({ type: 'SYNC_FROM_REMOTE', payload: remoteData });
  }, []);

  const getSyncData = useCallback((): PlayerSyncData => {
    return {
      players: state.players,
      activePlayerId: state.activePlayerId,
      playerPermissions: state.playerPermissions,
    };
  }, [state.players, state.activePlayerId, state.playerPermissions]);

  // Context value с мемоизацией
  const value: PlayerContextValue = useMemo(() => ({
    // State
    ...state,

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

    // WebRTC методы
    syncFromRemote,
    getSyncData,
    onPlayerChange,
  }), [
    state,
    addPlayer,
    updatePlayer,
    removePlayer,
    setActivePlayer,
    updatePermissions,
    getActivePlayer,
    isGM,
    getPlayerById,
    getPlayersByColor,
    syncFromRemote,
    getSyncData,
    onPlayerChange,
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
 * Основной hook для использования PlayerContext
 */
export function usePlayersV2(): PlayerContextValue {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayersV2 must be used within PlayerProviderV2');
  }
  return context;
}

// Optimized hooks для конкретных use cases

/**
 * Получить активного игрока
 * Только ререндерится когда активный игрок изменяется
 */
export function useActivePlayerV2(): Player | undefined {
  const context = usePlayersV2();
  return context.getActivePlayer();
}

/**
 * Проверить, является ли текущий игрок GM
 */
export function useIsGMV2(): boolean {
  const context = usePlayersV2();
  return context.isGM();
}

/**
 * Получить список всех игроков
 */
export function usePlayerListV2(): Player[] {
  const context = usePlayersV2();
  return context.players;
}

/**
 * Получить ID активного игрока
 */
export function useActivePlayerIdV2(): string {
  const context = usePlayersV2();
  return context.activePlayerId;
}

/**
 * Получить права игрока
 */
export function usePlayerPermissionsV2(): PlayerPermissions {
  const context = usePlayersV2();
  return context.playerPermissions;
}

// ============================================================================
// EXPORTS
// ============================================================================

export { PlayerContext };
export default PlayerProviderV2;