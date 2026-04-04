import { GameState, Action, Player } from '../gameState';
import { GameItem } from '../../types';

/**
 * Player Management Slice
 * Handles all player-related actions
 */
export const playerSlice = (state: GameState, action: Action): GameState => {
  switch (action.type) {
    case 'ADD_PLAYER': {
      const newPlayer = action.payload;
      return {
        ...state,
        players: [...state.players, newPlayer]
      };
    }

    case 'REMOVE_PLAYER': {
      const playerId = action.payload;
      return {
        ...state,
        players: state.players.filter(p => p.id !== playerId)
      };
    }

    case 'UPDATE_PLAYER': {
      const { playerId, updates } = action.payload;
      return {
        ...state,
        players: state.players.map(p =>
          p.id === playerId ? { ...p, ...updates } : p
        )
      };
    }

    case 'UPDATE_PLAYER_NAME': {
      const { playerId, name } = action.payload;
      return {
        ...state,
        players: state.players.map(p =>
          p.id === playerId ? { ...p, name } : p
        )
      };
    }

    case 'UPDATE_HAND_CARD_ORDER': {
      const { playerId, cardOrder } = action.payload;
      return {
        ...state,
        players: state.players.map(p =>
          p.id === playerId ? { ...p, handCardOrder: cardOrder } : p
        )
      };
    }

    case 'SET_ACTIVE_ID': {
      return {
        ...state,
        activePlayerId: action.payload
      };
    }

    case 'UPDATE_LANGUAGE': {
      return {
        ...state,
        language: action.payload
      };
    }

    case 'UPDATE_PERMISSIONS': {
      return {
        ...state,
        playerPermissions: action.payload
      };
    }

    case 'TOGGLE_CONNECTIONS_LOCKED': {
      return {
        ...state,
        connectionsLocked: !state.connectionsLocked
      };
    }

    default:
      return state;
  }
};