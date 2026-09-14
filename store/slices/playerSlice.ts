import { GameState } from '../gameState';
import { Action } from '../gameActions';

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
      const playerId = action.payload.id;
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
      // Per-object permissions: { id, actions } — mirrors the GameContext reducer
      const obj = state.objects[action.payload.id];
      if (!obj) return state;
      return {
        ...state,
        objects: {
          ...state.objects,
          [action.payload.id]: { ...obj, allowedActions: action.payload.actions } as GameState['objects'][string]
        }
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