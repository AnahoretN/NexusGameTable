import { Coordinates } from '../../types';

/**
 * Reducer functions for view transform and viewport actions
 * UPDATE_VIEW_TRANSFORM, SYNC_STATE, LOAD_GAME, etc.
 */

export function updateViewTransformReducer(state: any, action: any): any {
  if (action.type !== 'UPDATE_VIEW_TRANSFORM') return state;

  return {
    ...state,
    viewTransform: action.payload
  };
}

export function syncStateReducer(state: any, action: any): any {
  if (action.type !== 'SYNC_STATE') return state;

  return {
    ...state,
    ...action.payload
  };
}

export function loadGameReducer(state: any, action: any): any {
  if (action.type !== 'LOAD_GAME') return state;

  return {
    ...action.payload,
    viewTransform: state.viewTransform // Preserve current view transform
  };
}

export function setActiveIdReducer(state: any, action: any): any {
  if (action.type !== 'SET_ACTIVE_ID') return state;

  return {
    ...state,
    activePlayerId: action.payload.id
  };
}

export function addPlayerReducer(state: any, action: any): any {
  if (action.type !== 'ADD_PLAYER') return state;

  return {
    ...state,
    players: [...state.players, action.payload.player]
  };
}

export function removePlayerReducer(state: any, action: any): any {
  if (action.type !== 'REMOVE_PLAYER') return state;

  return {
    ...state,
    players: state.players.filter((p: any) => p.id !== action.payload.id)
  };
}

export function updateHandCardOrderReducer(state: any, action: any): any {
  if (action.type !== 'UPDATE_HAND_CARD_ORDER') return state;

  return {
    ...state,
    players: state.players.map((p: any) =>
      p.id === action.payload.playerId
        ? { ...p, handCardOrder: action.payload.order }
        : p
    )
  };
}
