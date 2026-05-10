import React, { createContext, useContext, useReducer, useEffect, useRef, useCallback, useState } from 'react';
import { Player, ItemType, TableObject, CardLocation, Card, Deck, Token, TokenType, DiceRoll, DiceObject, Counter, TokenShape, CardShape, GridType, CardPile, PanelType, WindowType, PanelObject, WindowObject, Board, Randomizer, CardOrientation, DrawingLayer, Drawing, UndoState, MarkerHistoryEntry, GeneralHistoryEntry, HyperscaleLayer, NexusBoard, NexusCellObject, PanelTab, PoolPanelData, TableauPanelData } from '../types';
import { CARD_SHAPE_DIMS, MAIN_MENU_WIDTH, DEFAULT_PANEL_WIDTH, DEFAULT_PANEL_HEIGHT, DEFAULT_DECK_WIDTH, DEFAULT_DECK_HEIGHT } from '../constants';
import { PlayerNameModal } from '../components/PlayerNameModal';
import { InitialLoadModal, InitialLoadStep } from '../components/InitialLoadModal';
import { generateUUID } from '../utils/uuid';
import { loadGameState, clearAllData } from '../utils/gameStorage';
import { loadLocalSettings, saveLocalSettings, calculateMainMenuPosition } from '../utils/localSettings';
import { createStandardDeck } from './gameConstants';
import { GameState, ViewTransform, initialState } from './gameState';
import { Action } from './gameActions';
import { createAuditLogEntry } from './auditLogger';
import { useAutoSave } from './useAutoSave';
import { usePeerConnection } from './usePeerConnection';
import {
  restoreImagesFromCache,
  extractImagesFromState,
  getNewImages,
  loadImageCacheFromIDB,
  addToManagedCache,
  getFromManagedCache,
  initManagedCacheFromImageCache,
  startManagedCacheCleanup,
  getManagedCacheStats
} from '../utils/imageCache';
import {
  throttle,
  debounce,
  differentialSyncManager,
  webrtcStatsMonitor,
  measureSyncTime,
  WEBRTC_OPTIMIZATION_CONFIG
} from '../utils/webrtcOptimization';
import { calculatePixelsPerVU } from '../utils/vuSystem';
import { logger } from '../utils/logger';
import { clearCardDimensionsCache } from '../utils/cardUtils';
import { findAvailableTerritory } from '../utils/territoryManager';
import { runPoolMigrationIfNeeded } from '../utils/poolMigration';

const GameContext = createContext<{
  state: GameState;
  dispatch: React.Dispatch<Action>;
  isHost: boolean;
  peerId: string | null;
  connectionStatus: 'disconnected' | 'connecting' | 'connected';
  waitingForPlayerName: { hostId: string } | null;
  setPlayerName: (name: string) => void;
  initializeHost: () => void;
  stateRef: React.RefObject<GameState>;
} | null>(null);

const gameReducer = (state: GameState, action: Action): GameState => {
  // 🔥 OPTIMIZED: Track changes for differential sync (exclude SYNC_STATE to avoid loops)
  if (action.type !== 'SYNC_STATE' && action.type !== 'RESTORE_IMAGES') {
    differentialSyncManager.addChange({
      type: 'object',
      action: action,
      timestamp: Date.now()
    });
  }

  switch (action.type) {
    case 'SYNC_STATE': {
        // When receiving full state from host, we want to keep our active ID correct locally
        // ensuring we don't accidentally become someone else visually
        const currentActiveId = state.activePlayerId;
        const currentViewTransform = state.viewTransform;

        // Keep our local main menu panel (each player has their own)
        const localMainMenu = Object.values(state.objects).find(
          obj => obj.type === ItemType.PANEL && (obj as PanelObject).panelType === PanelType.MAIN_MENU
        );

        // Check if this is a reconnection to the same session
        // If session ID matches, restore local panel settings; otherwise use host's settings
        const incomingSessionId = action.payload.sessionId;
        const isReconnection = state.sessionId === incomingSessionId;

        // Don't save/restore local panel settings anymore
        // All panel settings should come from host's playerPanelSettings

        // Only process objects if they're in the payload
        let finalObjects = state.objects; // Default to current objects
        if (action.payload.objects) {
            // Filter out main menu from incoming state to preserve local position
            const incomingObjects = { ...action.payload.objects };
            const incomingMainMenuId = Object.keys(incomingObjects).find(id => {
              const obj = incomingObjects[id];
              return obj.type === ItemType.PANEL && (obj as PanelObject).panelType === PanelType.MAIN_MENU;
            });
            if (incomingMainMenuId) {
              delete incomingObjects[incomingMainMenuId];
            }

            // Merge incoming objects with local main menu (if exists)
            finalObjects = localMainMenu
              ? { ...incomingObjects, [localMainMenu.id]: localMainMenu }
              : incomingObjects;

            // Don't restore local panel settings - all settings come from host's playerPanelSettings
        }

        // Remove viewTransform and internal fields from payload to prevent overwriting local settings
        // But MERGE playerPanelSettings from host (guest receives all players' settings)
        const { viewTransform, _lastPanelSettingsUpdate, _pendingPanelSettings, ...payloadWithoutViewTransform } = action.payload;

        // Merge playerPanelSettings from host with local settings
        // Host has all players' settings, guest needs to preserve their own and receive others'
        const mergedPlayerPanelSettings = {
          ...action.payload.playerPanelSettings, // All settings from host
          ...(state.playerPanelSettings || {}) // Keep local settings (shouldn't conflict, but just in case)
        };

        // Apply current player's panel settings to objects
        const currentPlayerId = currentActiveId;
        const currentPanelSettings = mergedPlayerPanelSettings[currentPlayerId] || {};

        const updatedObjects = { ...finalObjects };
        Object.entries(currentPanelSettings).forEach(([panelId, panelSettings]: [string, any]) => {
          if (updatedObjects[panelId] && (updatedObjects[panelId].type === ItemType.PANEL || updatedObjects[panelId].type === ItemType.WINDOW)) {
            updatedObjects[panelId] = {
              ...updatedObjects[panelId],
              ...panelSettings
            };
          }
        });

        return {
            ...state, // Keep existing state as base
            ...payloadWithoutViewTransform, // Merge with payload (excluding viewTransform and internal fields)
            objects: updatedObjects, // Use objects with applied panel settings
            activePlayerId: currentActiveId,
            // CRITICAL: Never use viewTransform from remote state - always keep local
            viewTransform: currentViewTransform,
            // CRITICAL: Merge playerPanelSettings from host
            playerPanelSettings: mergedPlayerPanelSettings,
            // CRITICAL: Keep internal fields
            _lastPanelSettingsUpdate: state._lastPanelSettingsUpdate,
            _pendingPanelSettings: state._pendingPanelSettings,
            // Update session ID to track connection state
            sessionId: incomingSessionId || state.sessionId
        };
    }
    case 'RESTORE_IMAGES': {
        // Restore images from cache - replace image references with base64 data
        const newImages = action.payload;
        // Check if state has image references
        const restoredObjects: Record<string, TableObject> = {};
        Object.entries(state.objects).forEach(([id, obj]) => {
            restoredObjects[id] = restoreImagesFromCache(obj, newImages);
        });

        return {
            ...state,
            objects: restoredObjects
        };
    }
    case 'LOAD_GAME': {
        // Deep clone objects to avoid mutating the original payload
        const migratedObjects: Record<string, TableObject> = {};
        Object.entries(action.payload.objects || {}).forEach(([id, obj]) => {
            const cloned = { ...obj } as any;
            migratedObjects[id] = cloned;

            // === GameItem base properties migration (only for types that have them) ===
            const hasGameItemProps = [
                ItemType.TOKEN, ItemType.TOKEN_TYPE, ItemType.DICE_OBJECT,
                ItemType.COUNTER, ItemType.BOARD, ItemType.RANDOMIZER, ItemType.DRAWING,
                ItemType.DECK, ItemType.WINDOW
            ].includes(obj.type);

            if (hasGameItemProps) {
                if (cloned.rotationStep === undefined) cloned.rotationStep = undefined;
                if (cloned.baseRotation === undefined) cloned.baseRotation = undefined;
                if (cloned.allowedActions === undefined) cloned.allowedActions = undefined;
                if (cloned.allowedActionsForGM === undefined) cloned.allowedActionsForGM = undefined;
                if (cloned.actionButtons === undefined) cloned.actionButtons = undefined;
                if (cloned.singleClickAction === undefined) cloned.singleClickAction = undefined;
                if (cloned.doubleClickAction === undefined) cloned.doubleClickAction = undefined;
                if (cloned.zIndex === undefined) cloned.zIndex = undefined;
                if (cloned.tooltipText === undefined) cloned.tooltipText = undefined;
                if (cloned.showTooltipImage === undefined) cloned.showTooltipImage = undefined;
                if (cloned.tooltipScale === undefined) cloned.tooltipScale = undefined;
                if (cloned.ownerId === undefined) cloned.ownerId = undefined;
                if (cloned.isPinnedToViewport === undefined) cloned.isPinnedToViewport = false;
                if (cloned.pinnedScreenPosition === undefined) cloned.pinnedScreenPosition = undefined;
                if (cloned.expandedPinnedPosition === undefined) cloned.expandedPinnedPosition = undefined;
                if (cloned.collapsedPinnedPosition === undefined) cloned.collapsedPinnedPosition = undefined;
                if (cloned.inCursorSlot === undefined) cloned.inCursorSlot = false;
            }

            // === DECK specific migrations ===
            if (obj.type === ItemType.DECK) {
                const deck = cloned as Deck;
                if (!deck.baseCardIds || deck.baseCardIds.length === 0) {
                    deck.baseCardIds = [...deck.cardIds];
                }
                if (deck.cardShape === undefined) deck.cardShape = CardShape.POKER;
                if (deck.cardOrientation === undefined) deck.cardOrientation = CardOrientation.VERTICAL;
                if (deck.showTopCard === undefined) deck.showTopCard = false;
                if (deck.piles === undefined || deck.piles.length === 0) {
                    deck.piles = [{
                        id: `${deck.id}-discard`,
                        name: 'Discard',
                        deckId: deck.id,
                        position: 'right',
                        cardIds: [],
                        faceUp: false,
                        visible: false,
                        size: 1,
                        isMillPile: true
                    }];
                }
                // Migrate piles missing properties
                deck.piles?.forEach(pile => {
                    if (pile.isMillPile === undefined) pile.isMillPile = false;
                    if (pile.showTopCard === undefined) pile.showTopCard = false;
                    if (pile.locked === undefined) pile.locked = false;
                });
                if (deck.cardAllowedActions === undefined) deck.cardAllowedActions = undefined;
                if (deck.cardAllowedActionsForGM === undefined) deck.cardAllowedActionsForGM = undefined;
                if (deck.cardActionButtons === undefined) deck.cardActionButtons = undefined;
                if (deck.cardSingleClickAction === undefined) deck.cardSingleClickAction = undefined;
                if (deck.cardDoubleClickAction === undefined) deck.cardDoubleClickAction = undefined;
                if (deck.cardWidth === undefined) deck.cardWidth = DEFAULT_DECK_WIDTH;
                if (deck.cardHeight === undefined) deck.cardHeight = DEFAULT_DECK_HEIGHT;
                if (deck.cardNamePosition === undefined) deck.cardNamePosition = 'none';
                if (deck.playTopFaceUp === undefined) deck.playTopFaceUp = true;
                if (deck.searchWindowVisibility === undefined) deck.searchWindowVisibility = undefined;
                if (deck.perPlayerSearchFaceUp === undefined) deck.perPlayerSearchFaceUp = {};
                if (deck.gmSearchFaceUp === undefined) deck.gmSearchFaceUp = {};
                if (deck.spriteConfig === undefined) deck.spriteConfig = undefined;
            }

            // === CARD specific migrations ===
            if (obj.type === ItemType.CARD) {
                const card = cloned as Card;
                if (card.shape === undefined) card.shape = CardShape.POKER;
                if (card.width === undefined) card.width = DEFAULT_DECK_WIDTH;
                if (card.height === undefined) card.height = DEFAULT_DECK_HEIGHT;
                if (card.hidden === undefined) card.hidden = false;
                if (card.spriteIndex === undefined) card.spriteIndex = undefined;
                if (card.spriteUrl === undefined) card.spriteUrl = undefined;
                if (card.spriteColumns === undefined) card.spriteColumns = undefined;
                if (card.spriteRows === undefined) card.spriteRows = undefined;
                if (card.frontFaceUrl === undefined) card.frontFaceUrl = undefined;
                if (card.backFaceUrl === undefined) card.backFaceUrl = undefined;
                if (card.alternativeBack === undefined) card.alternativeBack = undefined;
            }

            // === TOKEN specific migrations ===
            if (obj.type === ItemType.TOKEN) {
                const token = cloned as Token;
                if (token.shape === undefined) token.shape = TokenShape.CIRCLE;
                if (token.gridType === undefined) token.gridType = GridType.NONE;
                if (token.gridSize === undefined) token.gridSize = 50;
                if (token.snapToGrid === undefined) token.snapToGrid = false;
                if (token.archetypeId === undefined) token.archetypeId = undefined;
                if (token.showName === undefined) token.showName = undefined;
                if (token.showNameOnToken === undefined) token.showNameOnToken = undefined;
                if (token.fontColor === undefined) token.fontColor = undefined;
            }

            // === TOKEN_TYPE (archetype) specific migrations ===
            if (obj.type === ItemType.TOKEN_TYPE) {
                const tokenType = cloned as TokenType;
                if (tokenType.shape === undefined) tokenType.shape = TokenShape.SQUARE;
                if (tokenType.defaultSize === undefined) tokenType.defaultSize = undefined;
                if (tokenType.autoName === undefined) tokenType.autoName = false;
                if (tokenType.namePrefix === undefined) tokenType.namePrefix = '';
                if (tokenType.spawnCount === undefined) tokenType.spawnCount = 0;
                if (tokenType.showName === undefined) tokenType.showName = undefined;
            }

            // === DICE_OBJECT specific migrations ===
            if (obj.type === ItemType.DICE_OBJECT) {
                const dice = cloned as DiceObject;
                if (dice.sides === undefined) dice.sides = 6;
                if (dice.currentValue === undefined) dice.currentValue = 1;
            }

            // === COUNTER specific migrations ===
            if (obj.type === ItemType.COUNTER) {
                const counter = cloned as Counter;
                if (counter.value === undefined) counter.value = 0;
            }

            // === BOARD specific migrations ===
            if (obj.type === ItemType.BOARD) {
                const board = cloned as Board;
                if (board.shape === undefined) board.shape = TokenShape.SQUARE;
                if (board.gridType === undefined) board.gridType = GridType.SQUARE;
                if (board.gridSize === undefined) board.gridSize = 50;
                if (board.snapToGrid === undefined) board.snapToGrid = true;
            }

            // === RANDOMIZER specific migrations ===
            if (obj.type === ItemType.RANDOMIZER) {
                const randomizer = cloned as Randomizer;
                if (randomizer.randomizerType === undefined) randomizer.randomizerType = 'spinner';
                if (randomizer.currentValue === undefined) randomizer.currentValue = undefined;
                if (randomizer.options === undefined) randomizer.options = undefined;
            }

            // === DRAWING specific migrations ===
            if (obj.type === ItemType.DRAWING) {
                const drawing = cloned as Drawing;
                if (drawing.opacity === undefined) drawing.opacity = 100;
                if (drawing.backgroundColor === undefined) drawing.backgroundColor = undefined;
                if (drawing.color === undefined) drawing.color = undefined;
                if (drawing.bounds === undefined) {
                    drawing.bounds = { x: 0, y: 0, width: drawing.width, height: drawing.height };
                }
            }

            // === PANEL specific migrations ===
            if (obj.type === ItemType.PANEL) {
                const panel = cloned as PanelObject;
                if (panel.minimized === undefined) panel.minimized = false;
                if (panel.collapsedState === undefined) panel.collapsedState = undefined;
                if (panel.expandedState === undefined) panel.expandedState = undefined;
                if (panel.dualPosition === undefined) panel.dualPosition = undefined;
                if (panel.isPinnedToViewport === undefined) panel.isPinnedToViewport = true; // Panels are pinned by default
            }

            // === WINDOW specific migrations ===
            if (obj.type === ItemType.WINDOW) {
                const window = cloned as WindowObject;
                if (window.minimized === undefined) window.minimized = false;
                if (window.isPinnedToViewport === undefined) window.isPinnedToViewport = true;
            }
        });

        // Migrate undo state with maxMarkerHistory and maxGeneralHistory if missing
        const payloadUndo = action.payload.undo;
        const undo: UndoState = payloadUndo || {
            markerHistory: [],
            generalHistory: [],
            maxMarkerHistory: 10,
            maxGeneralHistory: 100
        };
        if ((undo as any).maxMarkerHistory === undefined) {
            (undo as any).maxMarkerHistory = 10;
        }
        if ((undo as any).maxGeneralHistory === undefined) {
            (undo as any).maxGeneralHistory = 100;
        }

        // Migrate drawings state (DrawingData with layers)
        const drawings = action.payload.drawings || { layers: [] };

        // Migrate viewTransform
        const payloadViewTransform = action.payload.viewTransform;
        const viewTransform: ViewTransform = {
            offset: payloadViewTransform?.offset || { x: 0, y: 0 },
            zoom: payloadViewTransform?.zoom || 0.8,
            scroll: payloadViewTransform?.scroll || { x: 0, y: 0 },
            // IMPORTANT: Always calculate pixelsPerVU for current screen (1 vu = 0.1% of screen height)
            // DO NOT use saved value as it's screen-dependent
            pixelsPerVU: calculatePixelsPerVU(window.innerWidth, window.innerHeight)
        };

        // CRITICAL: Merge players from save with current players
        // Keep current players, update their data from save if they exist there
        // Ignore players from save that don't exist in current session
        const savePlayers = action.payload.players || [];
        const mergedPlayers = [...state.players]; // Start with current players

        // Update current players with data from save (if they exist in save)
        mergedPlayers.forEach((currentPlayer, index) => {
            const savePlayer = savePlayers.find(p => p.id === currentPlayer.id);
            if (savePlayer) {
                // Player exists in both - update handCardOrder from save
                mergedPlayers[index] = {
                    ...currentPlayer,
                    handCardOrder: savePlayer.handCardOrder || currentPlayer.handCardOrder
                };
            }
        });

        // Ensure diceRolls array exists
        const diceRolls = action.payload.diceRolls || [];

        // CRITICAL: Ensure at least one GM exists after loading
        // If no GM in merged players, make the first player GM
        const hasGM = mergedPlayers.some(p => p.isGM === true);
        if (!hasGM && mergedPlayers.length > 0) {
            mergedPlayers[0].isGM = true;
        }

        // CRITICAL: Ensure players array is never undefined
        const finalPlayers = mergedPlayers.length > 0 ? mergedPlayers : state.players;

        // CRITICAL: Ensure playerPanelSettings exists (may be missing in old saves)
        const playerPanelSettings = action.payload.playerPanelSettings || {};

        // CRITICAL: Keep current activePlayerId to prevent losing GM status after loading pack
        // This ensures GM stays GM after loading a pack
        const currentActiveId = state.activePlayerId;

        return {
            ...action.payload,
            objects: migratedObjects,
            players: finalPlayers,
            playerPanelSettings,
            undo,
            drawings,
            viewTransform,
            diceRolls,
            // Preserve current activePlayerId - don't use the one from pack/save
            activePlayerId: currentActiveId,
            // Preserve current language - don't override with language from pack/save
            language: state.language,
            // sessionId from save is preserved if exists (handled by spread above)
        };
    }
    case 'SET_ACTIVE_ID': {
        return { ...state, activePlayerId: action.payload };
    }
    case 'ADD_PLAYER': {
        // Prevent duplicates
        if (state.players.find(p => p.id === action.payload.id)) return state;
        return {
            ...state,
            players: [...state.players, action.payload]
        };
    }
    case 'REMOVE_PLAYER': {
        return {
            ...state,
            players: state.players.filter(p => p.id !== action.payload.id)
        };
    }
    case 'UPDATE_PLAYER': {
        return {
            ...state,
            players: state.players.map(p =>
                p.id === action.payload.id ? { ...p, ...action.payload } : p
            )
        };
    }
    case 'UPDATE_PLAYER_NAME': {
        return {
            ...state,
            players: state.players.map(p =>
                p.id === action.payload.playerId
                    ? { ...p, name: action.payload.name }
                    : p
            )
        };
    }
    case 'UPDATE_PLAYER_PERMISSIONS': {
        return {
            ...state,
            playerPermissions: action.payload
        };
    }
    case 'UPDATE_LANGUAGE': {
        return {
            ...state,
            language: action.payload
        };
    }
    case 'UPDATE_HAND_CARD_ORDER': {
        return {
            ...state,
            players: state.players.map(p =>
                p.id === action.payload.playerId
                    ? { ...p, handCardOrder: action.payload.cardOrder }
                    : p
            )
        };
    }
    case 'ADD_OBJECT': {
      const isBoard = action.payload.type === ItemType.BOARD;
      const isDeck = action.payload.type === ItemType.DECK;
      const isArchetype = action.payload.type === ItemType.TOKEN_TYPE;
      const isToken = action.payload.type === ItemType.TOKEN;
      const isCard = action.payload.type === ItemType.CARD;
      const isCounter = action.payload.type === ItemType.COUNTER;
      const isRandomizer = action.payload.type === ItemType.RANDOMIZER;
      const isDice = action.payload.type === ItemType.DICE_OBJECT;
      const isPanel = action.payload.type === ItemType.PANEL;


      const newObj = {
          ...action.payload,
      } as any;
      const payload = action.payload as any;
      if (payload.isOnTable !== undefined) {
          newObj.isOnTable = payload.isOnTable;
      } else {
          // Archetypes are hidden from table by default (shown in Tools panel)
          newObj.isOnTable = isArchetype ? false : true;
      }

      // Set hyperscaleLayerId if not already set
      if (!newObj.hyperscaleLayerId) {
        // Counters, randomizers, dice, and panels go to 'interface' layer if it exists
        const preferInterface = isCounter || isRandomizer || isDice || isPanel;
        // Decks go to 'cards' layer if it exists
        const preferCards = isDeck;
        // Tokens and cards being created: use 'tokens' layer if it exists
        const preferTokens = isToken || isCard;

        if (preferInterface && state.hyperscaleLayers.some(l => l.id === 'interface')) {
          newObj.hyperscaleLayerId = 'interface';
        } else if (preferCards && state.hyperscaleLayers.some(l => l.id === 'cards')) {
          newObj.hyperscaleLayerId = 'cards';
        } else if (preferTokens && state.hyperscaleLayers.some(l => l.id === 'tokens')) {
          newObj.hyperscaleLayerId = 'tokens';
        } else if (state.selectedHyperscaleLayerIds.length > 0) {
          const selectedLayers = state.hyperscaleLayers.filter(l =>
            state.selectedHyperscaleLayerIds.includes(l.id)
          );
          // Sort by maxZIndex descending to get the highest layer
          selectedLayers.sort((a, b) => b.maxZIndex - a.maxZIndex);
          newObj.hyperscaleLayerId = selectedLayers[0].id;
        } else {
          // Default to 'tokens' layer if nothing is selected
          newObj.hyperscaleLayerId = 'tokens';
        }
      }

      // Now calculate zIndex within the hyperscale layer's bounds
      const layer = state.hyperscaleLayers.find(l => l.id === newObj.hyperscaleLayerId);
      const minZ = layer?.minZIndex ?? 1;
      const maxZ = layer?.maxZIndex ?? 10000;

      // Get all objects in the same layer to find max zIndex
      const layerObjects = Object.values(state.objects).filter(o =>
        o.hyperscaleLayerId === newObj.hyperscaleLayerId
      );
      const layerZ = layerObjects.map(o => o.zIndex || 0);
      const currentMaxZInLayer = layerZ.length ? Math.max(...layerZ) : minZ;

      // Set zIndex: use provided value if within bounds, otherwise calculate default
      if (action.payload.zIndex !== undefined && action.payload.zIndex >= minZ && action.payload.zIndex <= maxZ) {
        newObj.zIndex = action.payload.zIndex;
      } else {
        // Default zIndex within layer bounds
        // Boards get minZ, decks get minZ + 1, archetypes get minZ - 1 (hidden), others get currentMaxZInLayer + 1
        const defaultZ = isBoard ? minZ : (isDeck ? minZ + 1 : (isArchetype ? minZ - 1 : Math.min(currentMaxZInLayer + 1, maxZ)));
        newObj.zIndex = defaultZ;
      }

      // Migrate old decks without baseCardIds
      if (isDeck && !newObj.baseCardIds) {
        newObj.baseCardIds = [...(newObj.cardIds || [])];
      }

      const result = {
        ...state,
        objects: { ...state.objects, [action.payload.id]: newObj },
        lastModifiedBy: (action.payload as any).playerId || state.activePlayerId,
      };


      return result;
    }
    case 'UPDATE_OBJECT': {
      const obj = state.objects[action.payload.id];
      if (!obj) {
        logger.warn('[UPDATE_OBJECT] Object not found', { id: action.payload.id });
        return state;
      }

      // For panels and windows, filter out local-only properties from network sync
      // These properties should remain local to each player and not be synced
      if ((obj.type === ItemType.PANEL || obj.type === ItemType.WINDOW) && !action._localOnly) {
        const localOnlyProps = [
          'x', 'y',                    // Position is local
          'width', 'height',           // Size is local
          'zIndex',                   // Layer position is local
          'minimized',                 // Minimized state is local
          'isPinnedToViewport',        // Pinning is local
          'pinnedScreenPosition',      // Pinned position is local
          'expandedState',             // Expanded state is local
          'collapsedState',            // Collapsed state is local
          'expandedPinnedPosition',    // Expanded pinned position is local
          'collapsedPinnedPosition'    // Collapsed pinned position is local
        ];

        // Check if updates contain only local-only properties
        const updates = action.payload.updates || {};
        const updateKeys = Object.keys(updates);
        const hasOnlyLocalProps = updateKeys.every(key => localOnlyProps.includes(key));

        // If only local properties are being updated, skip this action for panels/windows
        if (hasOnlyLocalProps && updateKeys.length > 0) {
          return state;
        }

        // Filter out local properties from the updates
        const filteredUpdates: any = {};
        Object.entries(updates).forEach(([key, value]) => {
          if (!localOnlyProps.includes(key)) {
            filteredUpdates[key] = value;
          }
        });

        // If all properties were filtered out, skip this action
        if (Object.keys(filteredUpdates).length === 0) {
          return state;
        }

        // Use filtered updates instead of original
        action.payload.updates = filteredUpdates;
      }

      // Support both formats: { id, updates: {...} } and { id, ...updates }
      // For backward compatibility with existing code
      const updates = action.payload.updates || {};
      const { id, updates: _updates, ...restOfPayload } = action.payload;
      const mergedUpdates = Object.keys(updates).length > 0 ? updates : restOfPayload;

      const updatedObj = { ...obj, ...mergedUpdates } as TableObject;

      // Clamp zIndex to hyperscale layer bounds
      const layerId = updatedObj.hyperscaleLayerId || obj.hyperscaleLayerId || 'tokens';
      const layer = state.hyperscaleLayers.find(l => l.id === layerId);
      if (updatedObj.zIndex !== undefined) {
        // Use layer bounds or defaults if layer not found
        const minZ = layer?.minZIndex ?? (layerId === 'boards' ? 1 : layerId === 'cards' ? 1001 : layerId === 'tokens' ? 3001 : layerId === 'drawings' ? 6001 : layerId === 'interface' ? 9001 : 1);
        const maxZ = layer?.maxZIndex ?? (layerId === 'boards' ? 1000 : layerId === 'cards' ? 3000 : layerId === 'tokens' ? 6000 : layerId === 'drawings' ? 7000 : layerId === 'interface' ? 10000 : 10000);
        // Clamp zIndex to layer bounds
        if (updatedObj.zIndex < minZ) {
          updatedObj.zIndex = minZ;
        } else if (updatedObj.zIndex > maxZ) {
          updatedObj.zIndex = maxZ;
        }
      }

      const newObjects = { ...state.objects, [action.payload.id]: updatedObj };

      // Handle deck updates
      if (updatedObj.type === ItemType.DECK) {
          const deck = updatedObj as Deck;
          const oldDeck = obj as Deck;

          // When cardShape changes, update deck size and all cards
          if (deck.cardShape && deck.cardShape !== oldDeck.cardShape) {
              const dims = CARD_SHAPE_DIMS[deck.cardShape] || CARD_SHAPE_DIMS[CardShape.POKER];
              updatedObj.width = dims.width;
              updatedObj.height = dims.height;
              newObjects[updatedObj.id] = updatedObj;
              Object.values(state.objects).forEach(o => {
                  if (o.type === ItemType.CARD && (o as Card).deckId === deck.id) {
                      newObjects[o.id] = {
                          ...o,
                          shape: deck.cardShape,
                          width: dims.width,
                          height: dims.height
                      } as Card;
                  }
              });
          }

          // Clear card dimensions cache when card shape changes
          if (deck.cardShape && deck.cardShape !== oldDeck.cardShape) {
              clearCardDimensionsCache();
          }

          // When cardWidth or cardHeight changes, update only cards that had the previous default size
          // This allows users to change deck size without affecting cards,
          // but changing card size will update cards that still have default sizes
          const oldCardWidth = oldDeck.cardWidth ?? DEFAULT_DECK_WIDTH;
          const oldCardHeight = oldDeck.cardHeight ?? DEFAULT_DECK_HEIGHT;
          const newCardWidth = deck.cardWidth ?? DEFAULT_DECK_WIDTH;
          const newCardHeight = deck.cardHeight ?? DEFAULT_DECK_HEIGHT;

          if (newCardWidth !== oldCardWidth || newCardHeight !== oldCardHeight) {
              Object.values(state.objects).forEach(o => {
                  if (o.type === ItemType.CARD && (o as Card).deckId === deck.id) {
                      const card = o as Card;
                      // Update cards that currently have the old card dimensions OR match the deck's aspect ratio
                      // This ensures cards inherit deck dimension changes even if they have small variations
                      const cardMatchesOldDimensions = (card.width ?? 0) === oldCardWidth && (card.height ?? 0) === oldCardHeight;
                      const cardMatchesDeckRatio = card.width && card.height ? Math.abs((card.width / card.height) - (oldCardWidth / oldCardHeight)) < 0.01 : false;

                      if (cardMatchesOldDimensions || cardMatchesDeckRatio) {
                          newObjects[o.id] = {
                              ...card,
                              width: newCardWidth,
                              height: newCardHeight
                          } as Card;
                      }
                  }
              });
          }

          // Clear card dimensions cache when deck card dimensions change
          if (newCardWidth !== oldCardWidth || newCardHeight !== oldCardHeight) {
              clearCardDimensionsCache();
          }

          // Handle isMillPile exclusive toggle
          if (deck.piles) {
              const oldPiles = oldDeck.piles || [];
              // Check if any pile's isMillPile changed to true
              const newlyEnabledMillPileIndex = deck.piles.findIndex(
                  (pile, idx) => pile.isMillPile && !oldPiles[idx]?.isMillPile
              );
              if (newlyEnabledMillPileIndex !== -1) {
                  // Disable isMillPile on all other piles
                  deck.piles = deck.piles.map((pile, idx) =>
                      idx === newlyEnabledMillPileIndex
                          ? pile
                          : { ...pile, isMillPile: false }
                  );
                  newObjects[deck.id] = deck;
              }
          }

          // Handle textCardsData - create text-based cards
          if (deck.textCardsData && deck.textCardsData !== oldDeck.textCardsData) {
              const textCardsData = deck.textCardsData;

              // Create cards from text data
              const newCardIds: string[] = [];
              const textCardsStyle = deck.textCardsStyle;
              const useSpriteSheet = textCardsStyle?.useSpriteSheet === true;

              textCardsData.forEach((cardData, index) => {
                  const cardId = `${deck.id}-text-card-${Date.now()}-${index}`;
                  const newCard: Card = {
                      id: cardId,
                      type: ItemType.CARD,
                      name: cardData.name,
                      tooltipText: cardData.description,
                      deckId: deck.id,
                      width: deck.cardWidth || deck.width || DEFAULT_DECK_WIDTH,
                      height: deck.cardHeight || deck.height || DEFAULT_DECK_HEIGHT,
                      shape: deck.cardShape,
                      x: 0,
                      y: 0,
                      rotation: 0,
                      location: CardLocation.DECK,
                      faceUp: true,
                      isOnTable: true,
                      locked: false,
                      showTextOnCard: true,
                  };

                  // Only assign sprite sheet properties if useSpriteSheet is enabled
                  if (useSpriteSheet && deck.spriteConfig) {
                      newCard.spriteUrl = deck.spriteConfig.spriteUrl;
                      newCard.spriteIndex = index;
                      newCard.spriteColumns = deck.spriteConfig.columns;
                      newCard.spriteRows = deck.spriteConfig.rows;
                  }

                  // Store text cards style data for custom rendering
                  if (textCardsStyle) {
                      (newCard as any).textCardsStyle = textCardsStyle;
                  }

                  newObjects[cardId] = newCard;
                  newCardIds.push(cardId);
              });

              // Update deck's cardIds and baseCardIds
              deck.cardIds = [...newCardIds, ...deck.cardIds];
              deck.baseCardIds = [...newCardIds, ...(deck.baseCardIds || [])];
              newObjects[deck.id] = deck;

              // Clear textCardsData after processing to avoid re-processing
              deck.textCardsData = undefined;
          }
      }

      // Handle NexusCellObject updates - propagate to all cells in the same board
      if (updatedObj.type === ItemType.NEXUS_CELL) {
          const cell = updatedObj as NexusCellObject;
          const oldCell = obj as NexusCellObject;
          const boardId = cell.nexusBoardId;

          // Properties that should be synced across all cells (NOT including opacity)
          const syncableProps = ['locked', 'isPinnedToViewport', 'hyperscaleLayerId', 'zIndex'];
          const updates = action.payload.updates || {};
          const hasSyncableChange = syncableProps.some(prop => updates[prop as keyof typeof updates] !== undefined);

          if (hasSyncableChange) {
              const payload = updates as any;
              Object.values(state.objects).forEach(o => {
                  if (o.type === ItemType.NEXUS_CELL && o.id !== cell.id) {
                      const otherCell = o as NexusCellObject;
                      if (otherCell.nexusBoardId === boardId) {
                          const updates: any = {};
                          if (payload.locked !== undefined) updates.locked = payload.locked;
                          if (payload.isPinnedToViewport !== undefined) updates.isPinnedToViewport = payload.isPinnedToViewport;
                          if (payload.hyperscaleLayerId !== undefined) updates.hyperscaleLayerId = payload.hyperscaleLayerId;
                          if (payload.zIndex !== undefined) updates.zIndex = payload.zIndex;

                          (newObjects as any)[o.id] = { ...otherCell, ...updates };
                      }
                  }
              });

              // Also sync to the NexusBoard itself
              const board = state.objects[boardId];
              if (board && board.type === ItemType.NEXUS_BOARD) {
                  const boardUpdates: any = {};
                  if (payload.locked !== undefined) boardUpdates.locked = payload.locked;
                  if (payload.isPinnedToViewport !== undefined) boardUpdates.isPinnedToViewport = payload.isPinnedToViewport;
                  if (payload.hyperscaleLayerId !== undefined) boardUpdates.hyperscaleLayerId = payload.hyperscaleLayerId;
                  if (payload.zIndex !== undefined) boardUpdates.zIndex = payload.zIndex;

                  if (Object.keys(boardUpdates).length > 0) {
                      (newObjects as any)[boardId] = { ...board, ...boardUpdates };
                  }
              }
          }

          // Handle width/height changes - resize all cells and update positions
          if ((action.payload.width !== undefined || action.payload.height !== undefined) &&
              (action.payload.width !== oldCell.width || action.payload.height !== oldCell.height)) {

              const newWidth = action.payload.width ?? oldCell.width;
              const newHeight = action.payload.height ?? oldCell.height;
              const oldWidth = oldCell.width;
              const oldHeight = oldCell.height;

              // Update all cells in the board
              Object.values(state.objects).forEach(o => {
                  if (o.type === ItemType.NEXUS_CELL) {
                      const otherCell = o as NexusCellObject;
                      if (otherCell.nexusBoardId === boardId) {
                          // Calculate new position based on size change
                          // The offset is stored in VU, so we need to recalculate
                          const storedOffset = otherCell.offset; // { x, y } in VU

                          // Recalculate offset based on new dimensions
                          let newOffsetX = storedOffset.x;
                          let newOffsetY = storedOffset.y;

                          // Scale offsets proportionally to size change
                          const widthRatio = newWidth / oldWidth;
                          const heightRatio = newHeight / oldHeight;

                          if (storedOffset.x !== 0) newOffsetX = storedOffset.x * widthRatio;
                          if (storedOffset.y !== 0) newOffsetY = storedOffset.y * heightRatio;

                          // Find the main cell (direction 'N') to use as reference
                          const mainCell = Object.values(state.objects).find(
                              obj => obj.type === ItemType.NEXUS_CELL &&
                                     (obj as NexusCellObject).nexusBoardId === boardId &&
                                     (obj as NexusCellObject).direction === 'N'
                          ) as NexusCellObject;

                          if (mainCell) {
                              // Calculate position relative to main cell
                              const relativeX = otherCell.x - mainCell.x;
                              const relativeY = otherCell.y - mainCell.y;

                              // Recalculate relative position
                              const newRelativeX = relativeX * widthRatio;
                              const newRelativeY = relativeY * heightRatio;

                              newObjects[o.id] = {
                                  ...otherCell,
                                  width: newWidth,
                                  height: newHeight,
                                  x: mainCell.x + newRelativeX,
                                  y: mainCell.y + newRelativeY,
                                  offset: { x: newOffsetX, y: newOffsetY }
                              };
                          } else {
                              // Fallback: just update size
                              newObjects[o.id] = {
                                  ...otherCell,
                                  width: newWidth,
                                  height: newHeight
                              };
                          }
                      }
                  }
              });
          }
      }

      // Handle NexusBoard updates - propagate to all cells
      if (updatedObj.type === ItemType.NEXUS_BOARD) {
          const board = updatedObj as NexusBoard;
          const payload = action.payload as any;

          // Sync properties to all cells
          const syncableProps = ['opacity', 'locked', 'isPinnedToViewport', 'hyperscaleLayerId', 'zIndex', 'cellWidth', 'cellHeight'];
          const hasSyncableChange = syncableProps.some(prop => payload[prop] !== undefined);

          if (hasSyncableChange) {
              // Get main cell for position reference
              const mainCellId = board.cells[0]?.id;
              const mainCell = mainCellId ? (state.objects[mainCellId] as NexusCellObject) : null;
              const mainCellX = mainCell?.x ?? board.x;
              const mainCellY = mainCell?.y ?? board.y;

              // Check if cell dimensions changed - need to recalculate positions
              const sizeChanged = payload.cellWidth !== undefined || payload.cellHeight !== undefined;
              const newCellWidth = payload.cellWidth ?? board.cellWidth ?? 100;
              const newCellHeight = payload.cellHeight ?? board.cellHeight ?? 150;

              // Calculate row spacing ratio (same formula as in NexusBoard.tsx)
              // Uses decaying extrapolation: height=115→coeff=0.75, height=150→coeff=0.80833, approaches 0.86
              const H1 = 115;
              const C1 = 0.75;
              const H2 = 150;
              const C2 = 121.25 / 150;
              const targetRatio = 0.906;
              const k = -Math.log((targetRatio - C2) / (targetRatio - C1)) / (H2 - H1);
              const rowSpacingRatio = targetRatio - (targetRatio - C1) * Math.exp(-k * (newCellHeight - H1));
              const rowSpacing = newCellHeight * rowSpacingRatio;
              const colSpacing = newCellWidth;
              const colOffset = newCellWidth * 0.5;

              Object.values(state.objects).forEach(o => {
                  if (o.type === ItemType.NEXUS_CELL) {
                      const cell = o as NexusCellObject;
                      if (cell.nexusBoardId === board.id) {
                          const updates: any = {};
                          if (payload.opacity !== undefined) updates.opacity = payload.opacity;
                          if (payload.locked !== undefined) updates.locked = payload.locked;
                          if (payload.isPinnedToViewport !== undefined) updates.isPinnedToViewport = payload.isPinnedToViewport;
                          if (payload.hyperscaleLayerId !== undefined) updates.hyperscaleLayerId = payload.hyperscaleLayerId;
                          if (payload.zIndex !== undefined) updates.zIndex = payload.zIndex;
                          if (payload.cellWidth !== undefined) updates.width = payload.cellWidth;
                          if (payload.cellHeight !== undefined) updates.height = payload.cellHeight;

                          // Recalculate position if size changed and cell has a direction
                          if (sizeChanged && cell.direction && cell.id !== mainCellId) {
                              // Get potentially updated main cell position
                              const updatedMainCell = mainCellId ? (newObjects[mainCellId] as NexusCellObject) : null;
                              const baseX = updatedMainCell?.x ?? mainCellX;
                              const baseY = updatedMainCell?.y ?? mainCellY;

                              let offsetX = 0;
                              let offsetY = 0;

                              switch (cell.direction) {
                                  case 'NE':
                                      offsetX = colOffset;
                                      offsetY = -rowSpacing;
                                      break;
                                  case 'SE':
                                      offsetX = colSpacing;
                                      offsetY = 0;
                                      break;
                                  case 'NW':
                                      offsetX = -colOffset;
                                      offsetY = -rowSpacing;
                                      break;
                                  case 'SW':
                                      offsetX = -colSpacing;
                                      offsetY = 0;
                                      break;
                                  case 'N':
                                      offsetX = 0;
                                      offsetY = -rowSpacing;
                                      break;
                                  case 'S':
                                      offsetX = 0;
                                      offsetY = rowSpacing;
                                      break;
                              }

                              updates.x = baseX + offsetX;
                              updates.y = baseY + offsetY;
                          }

                          (newObjects as any)[o.id] = { ...cell, ...updates };
                      }
                  }
              });
          }
      }

      // Handle drawing updates - when color changes, update all strokes
      if (updatedObj.type === ItemType.DRAWING) {
        const drawing = obj as Drawing;
        const newDrawing = updatedObj as Drawing;
        // Check if color is being updated
        if ('color' in action.payload && newDrawing.color !== drawing.color) {
          const newColor = newDrawing.color || '#ef4444';
          // Update all strokes with the new color
          newDrawing.strokes = drawing.strokes.map(stroke => ({
            ...stroke,
            color: newColor,
          }));
          newObjects[newDrawing.id] = newDrawing;
        }
      }

      // Save local settings for main menu ONLY if it was actually moved
      // This check prevents expensive localStorage operations on every MOVE_OBJECT
      if (updatedObj.type === ItemType.PANEL && (updatedObj as PanelObject).panelType === PanelType.MAIN_MENU) {
        const oldPos = obj;
        const newPos = updatedObj;

        // Check if position actually changed
        const positionChanged = ('x' in action.payload || 'y' in action.payload) &&
                              (oldPos.x !== newPos.x || oldPos.y !== newPos.y);

        // Only save to localStorage if position actually changed
        if (positionChanged) {
          const localSettings = loadLocalSettings();
          localSettings.mainMenuPosition = { x: newPos.x, y: newPos.y };
          localSettings.mainMenuSize = { width: newPos.width || MAIN_MENU_WIDTH, height: newPos.height || 400 };
          localSettings.isPositionSet = true;
          saveLocalSettings(localSettings);
        }
      }

      return {
        ...state,
        objects: newObjects,
        lastModifiedBy: (action.payload as any).playerId || state.activePlayerId
      };
    }
    case 'MOVE_OBJECT': {
      const obj = state.objects[action.payload.id];
      if (!obj || obj.locked) return state;

      // For panels and windows, save position to playerPanelSettings (for host's own panels)
      // This ensures host's panel positions are also saved and restored
      if ((obj.type === ItemType.PANEL || obj.type === ItemType.WINDOW) && !action._localOnly) {
        const currentPlayerId = state.activePlayerId;
        const roundedX = Math.round(action.payload.x);
        const roundedY = Math.round(action.payload.y);

        // Update individual panel settings for host
        return {
          ...state,
          playerPanelSettings: {
            ...state.playerPanelSettings,
            [currentPlayerId]: {
              ...(state.playerPanelSettings[currentPlayerId] || {}),
              [obj.id]: {
                ...(state.playerPanelSettings[currentPlayerId]?.[obj.id] || {}),
                x: roundedX,
                y: roundedY,
                // Preserve existing settings
                width: state.playerPanelSettings[currentPlayerId]?.[obj.id]?.width || obj.width,
                height: state.playerPanelSettings[currentPlayerId]?.[obj.id]?.height || obj.height,
                minimized: state.playerPanelSettings[currentPlayerId]?.[obj.id]?.minimized || (obj as any).minimized || false,
                isPinnedToViewport: state.playerPanelSettings[currentPlayerId]?.[obj.id]?.isPinnedToViewport || (obj as any).isPinnedToViewport || false,
              }
            }
          },
          // Also update local object for immediate visual feedback
          objects: {
            ...state.objects,
            [obj.id]: {
              ...obj,
              x: roundedX,
              y: roundedY
            }
          }
        };
      }

      // Calculate position delta
      const deltaX = action.payload.x - obj.x;
      const deltaY = action.payload.y - obj.y;

      // Don't track history for drawings (they use marker history), objects in cursor slot, or local-only moves
      const isDrawing = obj.type === ItemType.DRAWING;
      const isInCursorSlot = (obj as any).inCursorSlot;
      const isLocalOnly = action._localOnly || action._excludeFromHistory;

      if (!isDrawing && !isInCursorSlot && !isLocalOnly) {
        // Add to general history (max 100)
        const historyEntry: GeneralHistoryEntry = {
          type: 'object-moved',
          objectId: obj.id,
          previousX: obj.x,
          previousY: obj.y,
        };
        const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

        // For pinned objects, also update pinnedScreenPosition to maintain visual position
        if ((obj as any).isPinnedToViewport) {
          return {
            ...state,
            objects: {
              ...state.objects,
              [action.payload.id]: {
                ...obj,
                x: action.payload.x,
                y: action.payload.y,
                pinnedScreenPosition: { x: action.payload.x, y: action.payload.y }
              } as TableObject,
            },
            undo: { ...state.undo, generalHistory: newGeneralHistory },
          };
        }

        // Build updated objects including NexusCellObjects linked to moved NexusBoard
        const updatedObjects: Record<string, TableObject> = {
          [action.payload.id]: { ...obj, x: action.payload.x, y: action.payload.y },
        };

        // If moving a NexusBoard, also move all linked NexusCellObjects
        if (obj.type === ItemType.NEXUS_BOARD) {
          Object.values(state.objects).forEach(o => {
            if (o.type === ItemType.NEXUS_CELL) {
              const cell = o as NexusCellObject;
              if (cell.nexusBoardId === obj.id) {
                updatedObjects[cell.id] = {
                  ...cell,
                  x: cell.x + deltaX,
                  y: cell.y + deltaY,
                };
              }
            }
          });
        }

        // If moving a NexusCellObject, also move all other cells in the same board
        if (obj.type === ItemType.NEXUS_CELL) {
          const movedCell = obj as NexusCellObject;
          const boardId = movedCell.nexusBoardId;

          Object.values(state.objects).forEach(o => {
            if (o.type === ItemType.NEXUS_CELL && o.id !== movedCell.id) {
              const cell = o as NexusCellObject;
              if (cell.nexusBoardId === boardId) {
                updatedObjects[cell.id] = {
                  ...cell,
                  x: cell.x + deltaX,
                  y: cell.y + deltaY,
                };
              }
            }
          });

          // Also move the NexusBoard itself
          const board = state.objects[boardId];
          if (board && board.type === ItemType.NEXUS_BOARD) {
            updatedObjects[boardId] = {
              ...board,
              x: board.x + deltaX,
              y: board.y + deltaY,
            };
          }
        }

        return {
          ...state,
          objects: { ...state.objects, ...updatedObjects },
          undo: { ...state.undo, generalHistory: newGeneralHistory },
          lastModifiedBy: (action.payload as any).playerId || state.activePlayerId,
        };
      }

      // For drawings, don't track history (handled by marker tool actions)
      if ((obj as any).isPinnedToViewport) {
        return {
          ...state,
          objects: {
            ...state.objects,
            [action.payload.id]: {
              ...obj,
              x: action.payload.x,
              y: action.payload.y,
              pinnedScreenPosition: { x: action.payload.x, y: action.payload.y }
            } as TableObject,
          },
        };
      }

      // Build updated objects including NexusCellObjects linked to moved NexusBoard (local-only moves)
      const updatedObjects: Record<string, TableObject> = {
        [action.payload.id]: { ...obj, x: action.payload.x, y: action.payload.y },
      };

      // If moving a NexusBoard, also move all linked NexusCellObjects
      if (obj.type === ItemType.NEXUS_BOARD) {
        Object.values(state.objects).forEach(o => {
          if (o.type === ItemType.NEXUS_CELL) {
            const cell = o as NexusCellObject;
            if (cell.nexusBoardId === obj.id) {
              updatedObjects[cell.id] = {
                ...cell,
                x: cell.x + deltaX,
                y: cell.y + deltaY,
              };
            }
          }
        });
      }

      // If moving a NexusCellObject, also move all other cells in the same board
      if (obj.type === ItemType.NEXUS_CELL) {
        const movedCell = obj as NexusCellObject;
        const boardId = movedCell.nexusBoardId;

        Object.values(state.objects).forEach(o => {
          if (o.type === ItemType.NEXUS_CELL && o.id !== movedCell.id) {
            const cell = o as NexusCellObject;
            if (cell.nexusBoardId === boardId) {
              updatedObjects[cell.id] = {
                ...cell,
                x: cell.x + deltaX,
                y: cell.y + deltaY,
              };
            }
          }
        });

        // Also move the NexusBoard itself
        const board = state.objects[boardId];
        if (board && board.type === ItemType.NEXUS_BOARD) {
          updatedObjects[boardId] = {
            ...board,
            x: board.x + deltaX,
            y: board.y + deltaY,
          };
        }
      }

      return {
        ...state,
        objects: { ...state.objects, ...updatedObjects },
      };
    }
    case 'MOVE_OBJECT_COMMIT': {
      // Sent by guest when drag ends - includes previous position for undo
      const { id, x, y, previousX, previousY } = action.payload;
      const obj = state.objects[id];
      if (!obj || obj.locked) return state;

      // For panels and windows, update individual player settings instead of syncing position
      if (obj.type === ItemType.PANEL || obj.type === ItemType.WINDOW) {
        const currentPlayerId = state.activePlayerId;
        const roundedX = Math.round(x);
        const roundedY = Math.round(y);

        // Update individual panel settings for this player
        return {
          ...state,
          playerPanelSettings: {
            ...state.playerPanelSettings,
            [currentPlayerId]: {
              ...(state.playerPanelSettings[currentPlayerId] || {}),
              [id]: {
                ...(state.playerPanelSettings[currentPlayerId]?.[id] || {}),
                x: roundedX,
                y: roundedY,
                // Preserve existing settings
                width: state.playerPanelSettings[currentPlayerId]?.[id]?.width || obj.width,
                height: state.playerPanelSettings[currentPlayerId]?.[id]?.height || obj.height,
                minimized: state.playerPanelSettings[currentPlayerId]?.[id]?.minimized || (obj as any).minimized || false,
                isPinnedToViewport: state.playerPanelSettings[currentPlayerId]?.[id]?.isPinnedToViewport || (obj as any).isPinnedToViewport || false,
              }
            }
          },
          // Also update local object for immediate visual feedback
          objects: {
            ...state.objects,
            [id]: {
              ...obj,
              x: roundedX,
              y: roundedY
            }
          }
        };
      }

      // Calculate position delta
      const deltaX = x - obj.x;
      const deltaY = y - obj.y;

      const isDrawing = obj.type === ItemType.DRAWING;
      const isInCursorSlot = (obj as any).inCursorSlot;

      // Only add to history if not a drawing and not in cursor slot
      if (!isDrawing && !isInCursorSlot) {
        const historyEntry: GeneralHistoryEntry = {
          type: 'object-moved',
          objectId: id,
          previousX,
          previousY,
        };
        const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

        // For pinned objects, also update pinnedScreenPosition
        if ((obj as any).isPinnedToViewport) {
          return {
            ...state,
            objects: {
              ...state.objects,
              [id]: {
                ...obj,
                x,
                y,
                pinnedScreenPosition: { x, y }
              } as TableObject,
            },
            undo: { ...state.undo, generalHistory: newGeneralHistory },
          };
        }

        // Build updated objects including NexusCellObjects linked to moved NexusBoard
        const updatedObjects: Record<string, TableObject> = {
          [id]: { ...obj, x, y },
        };

        // If moving a NexusBoard, also move all linked NexusCellObjects
        if (obj.type === ItemType.NEXUS_BOARD) {
          Object.values(state.objects).forEach(o => {
            if (o.type === ItemType.NEXUS_CELL) {
              const cell = o as NexusCellObject;
              if (cell.nexusBoardId === obj.id) {
                updatedObjects[cell.id] = {
                  ...cell,
                  x: cell.x + deltaX,
                  y: cell.y + deltaY,
                };
              }
            }
          });
        }

        // If moving a NexusCellObject, also move all other cells in the same board
        if (obj.type === ItemType.NEXUS_CELL) {
          const movedCell = obj as NexusCellObject;
          const boardId = movedCell.nexusBoardId;

          Object.values(state.objects).forEach(o => {
            if (o.type === ItemType.NEXUS_CELL && o.id !== movedCell.id) {
              const cell = o as NexusCellObject;
              if (cell.nexusBoardId === boardId) {
                updatedObjects[cell.id] = {
                  ...cell,
                  x: cell.x + deltaX,
                  y: cell.y + deltaY,
                };
              }
            }
          });

          // Also move the NexusBoard itself
          const board = state.objects[boardId];
          if (board && board.type === ItemType.NEXUS_BOARD) {
            updatedObjects[boardId] = {
              ...board,
              x: board.x + deltaX,
              y: board.y + deltaY,
            };
          }
        }

        return {
          ...state,
          objects: { ...state.objects, ...updatedObjects },
          undo: { ...state.undo, generalHistory: newGeneralHistory },
          lastModifiedBy: (action.payload as any).playerId || state.activePlayerId,
        };
      }

      // For drawings, don't track history
      if ((obj as any).isPinnedToViewport) {
        return {
          ...state,
          objects: {
            ...state.objects,
            [id]: {
              ...obj,
              x,
              y,
              pinnedScreenPosition: { x, y }
            } as TableObject,
          },
        };
      }

      // Build updated objects including NexusCellObjects linked to moved NexusBoard (drawings/local-only)
      const updatedObjects: Record<string, TableObject> = {
        [id]: { ...obj, x, y },
      };

      // If moving a NexusBoard, also move all linked NexusCellObjects
      if (obj.type === ItemType.NEXUS_BOARD) {
        Object.values(state.objects).forEach(o => {
          if (o.type === ItemType.NEXUS_CELL) {
            const cell = o as NexusCellObject;
            if (cell.nexusBoardId === obj.id) {
              updatedObjects[cell.id] = {
                ...cell,
                x: cell.x + deltaX,
                y: cell.y + deltaY,
              };
            }
          }
        });
      }

      // If moving a NexusCellObject, also move all other cells in the same board
      if (obj.type === ItemType.NEXUS_CELL) {
        const movedCell = obj as NexusCellObject;
        const boardId = movedCell.nexusBoardId;

        Object.values(state.objects).forEach(o => {
          if (o.type === ItemType.NEXUS_CELL && o.id !== movedCell.id) {
            const cell = o as NexusCellObject;
            if (cell.nexusBoardId === boardId) {
              updatedObjects[cell.id] = {
                ...cell,
                x: cell.x + deltaX,
                y: cell.y + deltaY,
              };
            }
          }
        });

        // Also move the NexusBoard itself
        const board = state.objects[boardId];
        if (board && board.type === ItemType.NEXUS_BOARD) {
          updatedObjects[boardId] = {
            ...board,
            x: board.x + deltaX,
            y: board.y + deltaY,
          };
        }
      }

      return {
        ...state,
        objects: { ...state.objects, ...updatedObjects },
      };
    }
    case 'FINISH_DRAWING_STROKE': {
      // Sent by guest when drawing stroke ends - creates the final drawing object
      const { stroke, bounds, opacity, drawingId } = action.payload;

      if (drawingId) {
        // Adding stroke to existing drawing
        const existingDrawing = state.objects[drawingId] as Drawing;
        if (existingDrawing) {
          // IMPORTANT: stroke.points are in world coordinates, need to convert to local coordinates
          // relative to the existing drawing's position (existingDrawing.x, existingDrawing.y)
          const relativeStroke: Stroke = {
            ...stroke,
            points: stroke.points.map(p => ({ x: p.x - existingDrawing.x, y: p.y - existingDrawing.y }))
          };

          const updatedDrawing: Drawing = {
            ...existingDrawing,
            strokes: [...existingDrawing.strokes, relativeStroke],
          };
          return {
            ...state,
            objects: {
              ...state.objects,
              [drawingId]: updatedDrawing,
            },
          };
        }
      } else {
        // Creating new drawing object
        // IMPORTANT: stroke.points are in world coordinates, need to convert to local coordinates
        // relative to the drawing's position (bounds.x, bounds.y)
        const relativeStroke: Stroke = {
          ...stroke,
          points: stroke.points.map(p => ({ x: p.x - bounds.x, y: p.y - bounds.y }))
        };

        const newDrawing: Drawing = {
          id: generateUUID(),
          type: ItemType.DRAWING,
          name: 'Drawing',
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
          rotation: 0,
          color: stroke.color,
          content: '',
          isOnTable: true,
          locked: false,
          strokes: [relativeStroke],
          bounds: { x: 0, y: 0, width: bounds.width, height: bounds.height },
          opacity: opacity ?? 100,
        };
        return {
          ...state,
          objects: {
            ...state.objects,
            [newDrawing.id]: newDrawing,
          },
        };
      }
      return state;
    }
    case 'DELETE_OBJECT': {
        const objectToDelete = state.objects[action.payload.id];
        if (!objectToDelete) return state;
        const newObjects = { ...state.objects };
        delete newObjects[action.payload.id];

        // Collect cascaded deletes for undo
        const cascadedDeletes: TableObject[] = [];

        // If deleting a deck, delete all its cards
        if (objectToDelete.type === ItemType.DECK) {
             const deck = objectToDelete as Deck;
             if (deck.cardIds) {
                 deck.cardIds.forEach(cid => {
                     const card = newObjects[cid];
                     if (card) cascadedDeletes.push(card);
                     delete newObjects[cid];
                 });
             }
        }

        // If deleting a token type (archetype), delete all its token copies
        if (objectToDelete.type === ItemType.TOKEN_TYPE) {
            const archetypeId = objectToDelete.id;
            // Find all tokens that have this archetypeId
            Object.keys(newObjects).forEach(tokenId => {
                const token = newObjects[tokenId];
                if (token.type === ItemType.TOKEN && (token as Token).archetypeId === archetypeId) {
                    cascadedDeletes.push(token);
                    delete newObjects[tokenId];
                }
            });
        }

        // If deleting a NexusBoard, delete all its NexusCellObjects
        if (objectToDelete.type === ItemType.NEXUS_BOARD) {
            const board = objectToDelete as NexusBoard;
            Object.keys(newObjects).forEach(cellId => {
                const cell = newObjects[cellId];
                if (cell.type === ItemType.NEXUS_CELL) {
                    const nexusCell = cell as NexusCellObject;
                    if (nexusCell.nexusBoardId === board.id) {
                        cascadedDeletes.push(cell);
                        delete newObjects[cellId];
                    }
                }
            });
        }

        // If deleting a NexusCellObject, only delete this cell (not the whole board)
        // But remove it from the board's cells array
        if (objectToDelete.type === ItemType.NEXUS_CELL) {
            const deletedCell = objectToDelete as NexusCellObject;
            const boardId = deletedCell.nexusBoardId;

            // Remove cell from board's cells array
            const board = newObjects[boardId];
            if (board && board.type === ItemType.NEXUS_BOARD) {
                const nexusBoard = board as NexusBoard;
                const updatedCells = nexusBoard.cells.filter(c => c.id !== deletedCell.id);
                newObjects[boardId] = {
                    ...nexusBoard,
                    cells: updatedCells
                };
            }
        }

        // If deleting a card, remove it from deck's cardIds and update initialCardCount
        if (objectToDelete.type === ItemType.CARD) {
            const card = objectToDelete as Card;
            if (card.deckId) {
                const deck = newObjects[card.deckId] as Deck;
                if (deck && deck.type === ItemType.DECK) {
                    // Remove card from deck's cardIds AND baseCardIds
                    // baseCardIds defines the max cards in deck - destroy should decrement it
                    const updatedCardIds = (deck.cardIds || []).filter(id => id !== card.id);
                    const updatedBaseCardIds = (deck.baseCardIds || []).filter(id => id !== card.id);
                    newObjects[card.deckId] = {
                        ...deck,
                        cardIds: updatedCardIds,
                        baseCardIds: updatedBaseCardIds,
                        // Update initialCardCount if it exists (deprecated, but keep for backwards compatibility)
                        initialCardCount: deck.initialCardCount
                            ? Math.max(updatedBaseCardIds.length, deck.initialCardCount - 1)
                            : undefined
                    };
                }
            }
        }

        // Add to history based on object type
        let updatedUndo = state.undo;
        if (objectToDelete.type === ItemType.DRAWING) {
            // Marker history (max 10)
            const historyEntry: MarkerHistoryEntry = {
                type: 'drawing-deleted',
                drawing: objectToDelete as Drawing,
            };
            updatedUndo = {
                ...state.undo,
                markerHistory: [...state.undo.markerHistory, historyEntry].slice(-10),
            };
        } else {
            // General history (max 25) - for non-drawing objects
            const historyEntry: GeneralHistoryEntry = {
                type: 'object-deleted',
                objectId: objectToDelete.id,
                object: objectToDelete,
                cascadedDeletes: cascadedDeletes.length > 0 ? cascadedDeletes : undefined,
            };
            updatedUndo = {
                ...state.undo,
                generalHistory: [...state.undo.generalHistory, historyEntry].slice(-100),
            };
        }

        return {
          ...state,
          objects: newObjects,
          undo: updatedUndo,
          lastModifiedBy: (action.payload as any).playerId || state.activePlayerId,
        };
    }
    case 'DRAW_CARD': {
      const deck = state.objects[action.payload.deckId] as Deck;
      if (!deck || deck.type !== ItemType.DECK || deck.cardIds.length === 0) return state;
      // Take TOP card from deck (first element in array, index 0)
      const drawnCardId = deck.cardIds[0];
      const newCardIds = deck.cardIds.slice(1);
      if (!drawnCardId) return state;
      const card = state.objects[drawnCardId] as Card;

      // Add to general history (max 25)
      const historyEntry: GeneralHistoryEntry = {
        type: 'card-drawn',
        cardId: drawnCardId,
        fromDeckId: deck.id,
        fromIndex: 0, // Top card is at index 0
        previousLocation: card.location,
      };
      const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

      // Determine faceUp based on deck's playTopFaceUp setting
      const faceUpValue = deck.playTopFaceUp ?? true;

      const updatedCard: Card = {
        ...card,
        location: CardLocation.HAND,
        ownerId: action.payload.playerId,
        deckId: deck.id,
        faceUp: faceUpValue, // Use deck's playTopFaceUp setting
        isOnTable: false, // Not visible on tabletop
        shape: deck.cardShape || CardShape.POKER,
        // Inherit card dimensions from deck to maintain correct aspect ratio
        width: deck.cardWidth,
        height: deck.cardHeight,
      } as Card;
      const updatedDeck: Deck = { ...deck, cardIds: newCardIds };

      // Add drawn card to the beginning of player's hand card order (top-right position in hand panel)
      const player = state.players.find(p => p.id === action.payload.playerId);
      const currentHandOrder = player?.handCardOrder || [];
      const newHandOrder = [drawnCardId, ...currentHandOrder];

      return {
        ...state,
        objects: { ...state.objects, [action.payload.deckId]: updatedDeck, [drawnCardId]: updatedCard },
        players: state.players.map(p =>
          p.id === action.payload.playerId
            ? { ...p, handCardOrder: newHandOrder }
            : p
        ),
        undo: { ...state.undo, generalHistory: newGeneralHistory },
        lastModifiedBy: action.payload.playerId || state.activePlayerId,
      };
    }
    case 'PLAY_CARD': {
        const card = state.objects[action.payload.cardId] as Card;
        if (!card) return state;

        // For cards played to table: use 'cards' layer if it exists
        let hyperscaleLayerId = 'cards';
        if (!state.hyperscaleLayers.some(l => l.id === 'cards')) {
          // Fall back to deck's layer if cards doesn't exist
          hyperscaleLayerId = (card as any).hyperscaleLayerId;
          if (!hyperscaleLayerId && card.deckId) {
              const deck = state.objects[card.deckId] as Deck;
              if (deck) {
                  hyperscaleLayerId = (deck as any).hyperscaleLayerId;
              }
          }
        }

        // Add to general history (max 25)
        const historyEntry: GeneralHistoryEntry = {
            type: 'card-played',
            cardId: card.id,
            previousLocation: card.location,
            previousX: card.x,
            previousY: card.y,
            previousFaceUp: card.faceUp,
        };
        const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

        // Get max zIndex within the card's hyperscale layer
        const layer = state.hyperscaleLayers.find(l => l.id === hyperscaleLayerId);
        const layerMinZ = layer?.minZIndex ?? 1;
        const layerMaxZ = layer?.maxZIndex ?? 10000;
        const layerObjects = Object.values(state.objects).filter(o => o.hyperscaleLayerId === hyperscaleLayerId);
        const layerZ = layerObjects.map(o => o.zIndex || 0);
        const maxZInLayer = layerZ.length ? Math.max(...layerZ) : layerMinZ;
        const cardZ = Math.min(maxZInLayer + 1, layerMaxZ);

        return {
            ...state,
            objects: {
                ...state.objects,
                [action.payload.cardId]: {
                    ...card,
                    location: CardLocation.TABLE,
                    x: action.payload.x,
                    y: action.payload.y,
                    ownerId: undefined,
                    isOnTable: true,
                    zIndex: cardZ,
                    ...(hyperscaleLayerId && { hyperscaleLayerId }),
                }
            },
            undo: { ...state.undo, generalHistory: newGeneralHistory },
        };
    }
    case 'PLAY_TOP_CARD': {
        const deck = state.objects[action.payload.deckId] as Deck;
        if (!deck || deck.type !== ItemType.DECK || deck.cardIds.length === 0) return state;

        const topCardId = deck.cardIds[0];
        const card = state.objects[topCardId] as Card;
        if (!card) return state;

        const faceUp = deck.playTopFaceUp ?? true;

        // Capture state for undo - store on card for later use when dropped
        const pendingPlayTop = {
            deckId: deck.id,
            previousCardIds: [...deck.cardIds],
            previousLocation: card.location,
            previousFaceUp: card.faceUp,
        };

        // Remove top card from deck
        const newCardIds = deck.cardIds.slice(1);
        const updatedDeck: Deck = { ...deck, cardIds: newCardIds };

        // Update card to cursor slot - IMPORTANT: Update position to deck position
        // This ensures the card appears at deck location when dragged to pool panel
        const updatedCard: Card = {
            ...card,
            location: CardLocation.CURSOR_SLOT,
            faceUp: faceUp,
            isOnTable: false,
            x: deck.x, // Position card at deck location
            y: deck.y, // Position card at deck location
            inCursorSlot: true, // Mark as in cursor slot
            // Store pending data for when card is dropped
            __pendingPlayTop: pendingPlayTop as any,
        };

        return {
            ...state,
            objects: {
                ...state.objects,
                [deck.id]: updatedDeck,
                [topCardId]: updatedCard,
            },
        };
    }
    case 'DROP_FROM_CURSOR_SLOT': {
        const obj = state.objects[action.payload.objectId];
        if (!obj) return state;

        // All draggable objects can be in cursor slot
        if (obj.type !== ItemType.CARD && obj.type !== ItemType.TOKEN && obj.type !== ItemType.DICE_OBJECT && obj.type !== ItemType.COUNTER && obj.type !== ItemType.DECK && obj.type !== ItemType.RANDOMIZER && obj.type !== ItemType.BOARD) return state;

        // Check if this card was played via "Play Top" action
        const pendingPlayTop = (obj as Card).__pendingPlayTop;
        if (pendingPlayTop) {
            // This is a "Play Top" action - record full history when card is dropped
            const card = obj as Card;
            const deck = state.objects[pendingPlayTop.deckId] as Deck;
            if (!deck) return state;

            // Get hyperscale layer from parent deck
            const deckHyperscaleLayerId = deck.hyperscaleLayerId || 'cards';
            const layer = state.hyperscaleLayers.find(l => l.id === deckHyperscaleLayerId);
            const minZ = layer?.minZIndex ?? 1001;
            const maxZ = layer?.maxZIndex ?? 3000;

            // Clamp zIndex to layer bounds
            let cardZ = card.zIndex ?? minZ;
            if (action.payload.zIndex !== undefined) {
              cardZ = Math.max(minZ, Math.min(action.payload.zIndex, maxZ));
            }

            const updatedCard: Card = {
                ...card,
                x: action.payload.x,
                y: action.payload.y,
                zIndex: cardZ,
                inCursorSlot: false,
                fromPoolPanel: undefined,
                location: CardLocation.TABLE,
                isOnTable: true,
                hyperscaleLayerId: deckHyperscaleLayerId,
                // Clear the pending data
                __pendingPlayTop: undefined,
                // Re-pin object if it was pinned before being picked up
                ...((card as any).wasPinnedToViewport && {
                    isPinnedToViewport: true,
                    pinnedScreenPosition: {
                        x: action.payload.x * (state.viewTransform?.pixelsPerVU || 1) + ((state.viewTransform?.offset?.x || 0) - (state.viewTransform?.scroll?.x || 0)),
                        y: action.payload.y * (state.viewTransform?.pixelsPerVU || 1) + ((state.viewTransform?.offset?.y || 0) - (state.viewTransform?.scroll?.y || 0))
                    },
                    wasPinnedToViewport: undefined // Clear the flag
                }),
            };

            // Add to general history as card-played-from-top
            const historyEntry: GeneralHistoryEntry = {
                type: 'card-played-from-top',
                cardId: card.id,
                deckId: pendingPlayTop.deckId,
                previousCardIds: pendingPlayTop.previousCardIds,
                previousLocation: pendingPlayTop.previousLocation,
                previousFaceUp: pendingPlayTop.previousFaceUp,
            };
            const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

            // Auto-select the deck's hyperscale layer if not already selected
            const newSelectedLayers = state.selectedHyperscaleLayerIds.includes(deckHyperscaleLayerId)
                ? state.selectedHyperscaleLayerIds
                : [...state.selectedHyperscaleLayerIds, deckHyperscaleLayerId];

            return {
                ...state,
                objects: { ...state.objects, [obj.id]: updatedCard },
                undo: { ...state.undo, generalHistory: newGeneralHistory },
                selectedHyperscaleLayerIds: newSelectedLayers,
            };
        }

        // Handle token drop (simpler than cards - no location/deck tracking)
        if (obj.type === ItemType.TOKEN || obj.type === ItemType.DICE_OBJECT || obj.type === ItemType.COUNTER) {
            const tokenLayer = obj.hyperscaleLayerId || 'tokens';
            const layer = state.hyperscaleLayers.find(l => l.id === tokenLayer);
            const minZ = layer?.minZIndex ?? 3001;
            const maxZ = layer?.maxZIndex ?? 6000;

            // Clamp zIndex to layer bounds
            let tokenZ = obj.zIndex ?? minZ;
            if (action.payload.zIndex !== undefined) {
              tokenZ = Math.max(minZ, Math.min(action.payload.zIndex, maxZ));
            }

            const updatedObj: TableObject = {
                ...obj,
                x: action.payload.x,
                y: action.payload.y,
                zIndex: tokenZ,
                inCursorSlot: false,
                fromPoolPanel: undefined,
                isOnTable: true,
                // Re-pin object if it was pinned before being picked up
                ...((obj as any).wasPinnedToViewport && {
                    isPinnedToViewport: true,
                    pinnedScreenPosition: {
                        x: action.payload.x * (state.viewTransform?.pixelsPerVU || 1) + ((state.viewTransform?.offset?.x || 0) - (state.viewTransform?.scroll?.x || 0)),
                        y: action.payload.y * (state.viewTransform?.pixelsPerVU || 1) + ((state.viewTransform?.offset?.y || 0) - (state.viewTransform?.scroll?.y || 0))
                    },
                    wasPinnedToViewport: undefined // Clear the flag
                }),
            };

            // Auto-select the token's hyperscale layer if not already selected
            const newSelectedLayers = state.selectedHyperscaleLayerIds.includes(tokenLayer)
                ? state.selectedHyperscaleLayerIds
                : [...state.selectedHyperscaleLayerIds, tokenLayer];

            return {
                ...state,
                objects: { ...state.objects, [obj.id]: updatedObj },
                selectedHyperscaleLayerIds: newSelectedLayers,
            };
        }

        // Handle board drop (similar to tokens - no location/deck tracking)
        if (obj.type === ItemType.BOARD) {
            const boardLayer = obj.hyperscaleLayerId || 'boards';
            const layer = state.hyperscaleLayers.find(l => l.id === boardLayer);
            const minZ = layer?.minZIndex ?? 1;
            const maxZ = layer?.maxZIndex ?? 1000;

            // Clamp zIndex to layer bounds
            let boardZ = obj.zIndex ?? minZ;
            if (action.payload.zIndex !== undefined) {
              boardZ = Math.max(minZ, Math.min(action.payload.zIndex, maxZ));
            }

            const updatedObj: TableObject = {
                ...obj,
                x: action.payload.x,
                y: action.payload.y,
                zIndex: boardZ,
                inCursorSlot: false,
                fromPoolPanel: undefined,
                isOnTable: true,
                // Re-pin object if it was pinned before being picked up
                ...((obj as any).wasPinnedToViewport && {
                    isPinnedToViewport: true,
                    pinnedScreenPosition: {
                        x: action.payload.x * (state.viewTransform?.pixelsPerVU || 1) + ((state.viewTransform?.offset?.x || 0) - (state.viewTransform?.scroll?.x || 0)),
                        y: action.payload.y * (state.viewTransform?.pixelsPerVU || 1) + ((state.viewTransform?.offset?.y || 0) - (state.viewTransform?.scroll?.y || 0))
                    },
                    wasPinnedToViewport: undefined // Clear the flag
                }),
            };

            // Auto-select the board's hyperscale layer if not already selected
            const newSelectedLayers = state.selectedHyperscaleLayerIds.includes(boardLayer)
                ? state.selectedHyperscaleLayerIds
                : [...state.selectedHyperscaleLayerIds, boardLayer];

            return {
                ...state,
                objects: { ...state.objects, [obj.id]: updatedObj },
                selectedHyperscaleLayerIds: newSelectedLayers,
            };
        }

        // Normal drop from cursor slot for cards (not Play Top)
        // Capture detailed state for undo - determine WHERE the card was before going to cursor slot
        const card = obj as Card;
        const previousLocation = card.location;
        const previousX = card.x;
        const previousY = card.y;
        const previousZIndex = card.zIndex;
        const previousInCursorSlot = card.inCursorSlot;
        const previousFaceUp = card.faceUp;

        // Determine the previous state based on location
        let previousState: 'cursor_slot' | 'table' | 'hand' | 'deck' | 'pile' = 'cursor_slot';
        let previousDeckId: string | undefined;
        let previousOwnerId: string | undefined;
        let previousDeckCardIds: string[] | undefined;
        let previousPileId: string | undefined;
        let previousPileCardIds: string[] | undefined;

        if (previousLocation === CardLocation.TABLE && !previousInCursorSlot) {
            previousState = 'table';
        } else if (previousLocation === CardLocation.HAND) {
            previousState = 'hand';
            previousOwnerId = card.ownerId;
        } else if (previousLocation === CardLocation.DECK) {
            previousState = 'deck';
            previousDeckId = card.deckId;
            // Find the deck and capture cardIds before the card was at top
            if (previousDeckId) {
                const deck = state.objects[previousDeckId] as Deck;
                if (deck && deck.cardIds.includes(card.id)) {
                    previousDeckCardIds = [...deck.cardIds];
                }
            }
        } else if (previousLocation === CardLocation.PILE) {
            previousState = 'pile';
            previousDeckId = card.deckId;
            // Find the pile and capture cardIds
            if (previousDeckId) {
                const deck = state.objects[previousDeckId] as Deck;
                if (deck?.piles) {
                    for (const pile of deck.piles) {
                        if (pile.cardIds.includes(card.id)) {
                            previousPileId = pile.id;
                            previousPileCardIds = [...pile.cardIds];
                            break;
                        }
                    }
                }
            }
        }

        // For cards, get hyperscale layer from parent deck
        let hyperscaleLayerId = obj.hyperscaleLayerId;
        if (obj.type === ItemType.CARD && previousDeckId) {
            const deck = state.objects[previousDeckId] as Deck;
            if (deck) {
                hyperscaleLayerId = deck.hyperscaleLayerId || 'cards';
            }
        }

        // Clamp zIndex to hyperscale layer bounds
        const layerId = hyperscaleLayerId || (obj.type === ItemType.CARD ? 'cards' : 'tokens');
        const layer = state.hyperscaleLayers.find(l => l.id === layerId);
        const minZ = layer?.minZIndex ?? (obj.type === ItemType.CARD ? 1001 : 3001);
        const maxZ = layer?.maxZIndex ?? (obj.type === ItemType.CARD ? 3000 : 6000);

        let objZ = obj.zIndex ?? minZ;
        if (action.payload.zIndex !== undefined) {
          objZ = Math.max(minZ, Math.min(action.payload.zIndex, maxZ));
        }

        const updatedObj: TableObject = {
            ...obj,
            x: action.payload.x,
            y: action.payload.y,
            zIndex: objZ,
            inCursorSlot: false,
            fromPoolPanel: undefined,
            isOnTable: true, // Always set isOnTable: true when dropping from cursor slot
            ...(hyperscaleLayerId && { hyperscaleLayerId }),
            // Re-pin object if it was pinned before being picked up
            ...((obj as any).wasPinnedToViewport && {
                isPinnedToViewport: true,
                pinnedScreenPosition: {
                    // Convert world coordinates (vu) to pinned screen coordinates
                    // Pinned rendering: left = pinnedPosition.x * zoom
                    // Unpinned rendering: left = worldX * pixelsPerVU * zoom + offset.x - scroll.x
                    // To maintain visual position: pinnedPosition.x * zoom = worldX * pixelsPerVU * zoom + offset.x - scroll.x
                    // Therefore: pinnedPosition.x = (worldX * pixelsPerVU * zoom + offset.x - scroll.x) / zoom
                    // Simplified: pinnedPosition.x = worldX * pixelsPerVU + (offset.x - scroll.x) / zoom
                    x: action.payload.x * (state.viewTransform?.pixelsPerVU || 1) + ((state.viewTransform?.offset?.x || 0) - (state.viewTransform?.scroll?.x || 0)),
                    y: action.payload.y * (state.viewTransform?.pixelsPerVU || 1) + ((state.viewTransform?.offset?.y || 0) - (state.viewTransform?.scroll?.y || 0))
                },
                wasPinnedToViewport: undefined // Clear the flag
            }),
        };

        // For cards, also update location to TABLE
        if (obj.type === ItemType.CARD) {
            (updatedObj as Card).location = CardLocation.TABLE;
        }

        // Add to general history (max 100)
        const historyEntry: GeneralHistoryEntry = {
            type: 'dropped-from-cursor-slot',
            objectId: obj.id,
            previousState,
            previousLocation,
            previousX,
            previousY,
            previousZIndex,
            previousFaceUp,
            previousDeckId,
            previousOwnerId,
            previousDeckCardIds,
            previousPileId,
            previousPileCardIds,
        };
        const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

        // Auto-select the object's hyperscale layer if not already selected
        const objLayer = hyperscaleLayerId || (obj.type === ItemType.CARD ? 'cards' : 'tokens');
        const newSelectedLayers = state.selectedHyperscaleLayerIds.includes(objLayer)
            ? state.selectedHyperscaleLayerIds
            : [...state.selectedHyperscaleLayerIds, objLayer];

        return {
            ...state,
            objects: { ...state.objects, [obj.id]: updatedObj },
            undo: { ...state.undo, generalHistory: newGeneralHistory },
            selectedHyperscaleLayerIds: newSelectedLayers,
        };
    }
    case 'SHUFFLE_DECK': {
        const deck = state.objects[action.payload.deckId] as Deck;
        if (!deck || deck.type !== ItemType.DECK) return state;

        // Capture state for undo before making changes
        const previousCardOrder = [...deck.cardIds];

        const shuffled = [...deck.cardIds];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        // Add to general history (max 100)
        const historyEntry: GeneralHistoryEntry = {
            type: 'deck-shuffled',
            deckId: deck.id,
            previousCardOrder,
        };
        const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

        return {
            ...state,
            objects: { ...state.objects, [action.payload.deckId]: { ...deck, cardIds: shuffled } },
            undo: { ...state.undo, generalHistory: newGeneralHistory },
            lastModifiedBy: (action.payload as any).playerId || state.activePlayerId,
        };
    }
    case 'FLIP_CARD': {
        const card = state.objects[action.payload.cardId] as Card;
        if (!card || card.type !== ItemType.CARD) return state;

        // Add to general history (max 25)
        const historyEntry: GeneralHistoryEntry = {
            type: 'card-flipped',
            cardId: card.id,
            previousFaceUp: card.faceUp,
        };
        const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

        return {
            ...state,
            objects: { ...state.objects, [action.payload.cardId]: { ...card, faceUp: !card.faceUp } },
            undo: { ...state.undo, generalHistory: newGeneralHistory },
        };
    }
    case 'ROLL_DICE_LOG': {
        const newRoll: DiceRoll = {
            id: generateUUID(),
            value: action.payload.value,
            playerName: action.payload.playerName,
            timestamp: Date.now()
        };
        return { ...state, diceRolls: [newRoll, ...state.diceRolls].slice(0, 50) };
    }
    case 'ROLL_PHYSICAL_DICE': {
        const dice = state.objects[action.payload.id] as DiceObject;
        if (!dice || dice.type !== ItemType.DICE_OBJECT) return state;

        // Check if we should roll the group or just this dice
        // rollGroup=true (or undefined) rolls the group, rollGroup=false rolls only this dice
        const diceIdsToRoll: string[] = [];
        if (action.payload.rollGroup === false) {
            // Roll only this dice, ignore group
            diceIdsToRoll.push(action.payload.id);
        } else if (dice.diceGroupId) {
            // Check if dice belongs to a group - roll all dice in the group
            const group = state.diceGroups?.find((g: any) => g.id === dice.diceGroupId);
            if (group) {
                diceIdsToRoll.push(...group.diceIds);
            } else {
                diceIdsToRoll.push(action.payload.id);
            }
        } else {
            diceIdsToRoll.push(action.payload.id);
        }

        // Roll each dice and collect rolls
        const newRolls: DiceRoll[] = [];
        const updatedObjects: Record<string, any> = {};

        diceIdsToRoll.forEach(diceId => {
            const diceToRoll = state.objects[diceId] as DiceObject;
            if (!diceToRoll || diceToRoll.type !== ItemType.DICE_OBJECT) return;

            // Roll the dice
            const firstRoll = Math.floor(Math.random() * diceToRoll.sides) + 1;
            let finalValue = firstRoll;
            let explosiveRoll: number | undefined = undefined;

            // Handle explosive dice: if max value is rolled, prepare for second roll
            const isExplosiveTrigger = diceToRoll.isExplosive && firstRoll === diceToRoll.sides;

            if (isExplosiveTrigger) {
                // Generate second roll value
                explosiveRoll = Math.floor(Math.random() * diceToRoll.sides) + 1;
                finalValue = diceToRoll.sides + explosiveRoll;
            }

            newRolls.push({
                id: generateUUID(),
                value: finalValue,
                playerName: 'Dice Object',
                timestamp: Date.now()
            });

            // Start animation for each dice
            const animationDuration = 500;
            const updateCount = 5;
            const updateInterval = animationDuration / updateCount; // 500 / 5 = 100ms per update, total 500ms
            let updateIndex = 0;
            let previousValue = diceToRoll.currentValue;

            const animateRoll = () => {
                if (updateIndex < updateCount) {
                    let intermediateValue: number;
                    if (diceToRoll.sides === 2) {
                        intermediateValue = previousValue === 1 ? 2 : 1;
                    } else {
                        do {
                            intermediateValue = Math.floor(Math.random() * diceToRoll.sides) + 1;
                        } while (intermediateValue === previousValue);
                    }
                    previousValue = intermediateValue;

                    if (typeof window !== 'undefined' && (window as any).__diceRollDispatch) {
                        (window as any).__diceRollDispatch({
                            type: 'UPDATE_OBJECT',
                            payload: { id: diceId, updates: { currentValue: intermediateValue } }
                        });
                    }
                    updateIndex++;
                    setTimeout(animateRoll, updateInterval);
                } else {
                    // First roll animation complete
                    if (typeof window !== 'undefined' && (window as any).__diceRollDispatch) {
                        if (isExplosiveTrigger && explosiveRoll !== undefined) {
                            // For explosive dice: show max value first, then trigger second roll
                            (window as any).__diceRollDispatch({
                                type: 'UPDATE_OBJECT',
                                payload: {
                                    id: diceId,
                                    updates: {
                                        currentValue: diceToRoll.sides,
                                        rolling: false,
                                        rollTargetValue: undefined,
                                        rollStartTime: undefined
                                    }
                                }
                            });

                            // Trigger explosive second roll immediately (first roll lasted full 500ms)
                            if (typeof window !== 'undefined' && (window as any).__diceRollDispatch) {
                                (window as any).__diceRollDispatch({
                                    type: 'EXPLOSIVE_DICE_SECOND_ROLL',
                                    payload: { id: diceId, explosiveRoll }
                                });
                            }
                        } else {
                            // Normal dice: show final value
                            (window as any).__diceRollDispatch({
                                type: 'UPDATE_OBJECT',
                                payload: {
                                    id: diceId,
                                    updates: {
                                        currentValue: finalValue,
                                        rolling: false,
                                        rollTargetValue: undefined,
                                        rollStartTime: undefined
                                    }
                                }
                            });
                        }
                    }
                }
            };
            setTimeout(animateRoll, 0);

            updatedObjects[diceId] = {
                ...diceToRoll,
                currentValue: 1,
                rolling: true,
                rollTargetValue: firstRoll,
                rollStartTime: Date.now(),
                explosiveRollValue: undefined // Clear any previous explosive roll
            };
        });

        return {
            ...state,
            objects: {
                ...state.objects,
                ...updatedObjects
            },
            diceRolls: [...newRolls, ...state.diceRolls].slice(0, 50)
        };
    }
    case 'EXPLOSIVE_DICE_SECOND_ROLL': {
        const dice = state.objects[action.payload.id] as DiceObject;
        if (!dice || dice.type !== ItemType.DICE_OBJECT) return state;

        const { explosiveRoll } = action.payload;

        // Animate the second roll - 500ms to match first roll duration
        const animationDuration = 500;
        const updateCount = 5;
        const updateInterval = animationDuration / updateCount; // 500 / 5 = 100ms per update
        let updateIndex = 0;
        let previousValue = 0;

        const animateSecondRoll = () => {
            if (updateIndex < updateCount) {
                let intermediateValue: number;
                if (dice.sides === 2) {
                    intermediateValue = previousValue === 1 ? 2 : 1;
                } else {
                    do {
                        intermediateValue = Math.floor(Math.random() * dice.sides) + 1;
                    } while (intermediateValue === previousValue);
                }
                previousValue = intermediateValue;

                if (typeof window !== 'undefined' && (window as any).__diceRollDispatch) {
                    (window as any).__diceRollDispatch({
                        type: 'UPDATE_OBJECT',
                        payload: { id: action.payload.id, updates: { explosiveRollValue: intermediateValue } }
                    });
                }
                updateIndex++;
                setTimeout(animateSecondRoll, updateInterval);
            } else {
                // Show final explosive roll value
                if (typeof window !== 'undefined' && (window as any).__diceRollDispatch) {
                    (window as any).__diceRollDispatch({
                        type: 'UPDATE_OBJECT',
                        payload: { id: action.payload.id, updates: { explosiveRollValue: explosiveRoll } }
                    });
                }
            }
        };
        setTimeout(animateSecondRoll, 0);

        return state;
    }
    case 'UPDATE_COUNTER': {
        const counter = state.objects[action.payload.id] as Counter;
        if (!counter || counter.type !== ItemType.COUNTER) return state;

        const newValue = counter.value + action.payload.delta;

        // Check minimum value (use minValue if set, otherwise 0 unless allowNegative)
        const minAllowed = counter.allowNegative ? -Infinity : (counter.minValue ?? 0);
        if (newValue < minAllowed) return state;

        // Check maximum value if set
        if (counter.maxValue !== undefined && newValue > counter.maxValue) return state;

        // Add to general history
        const historyEntry: GeneralHistoryEntry = {
            type: 'counter-updated',
            objectId: counter.id,
            previousValue: counter.value,
            delta: action.payload.delta,
        };
        const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

        return {
            ...state,
            objects: { ...state.objects, [action.payload.id]: { ...counter, value: newValue } },
            undo: { ...state.undo, generalHistory: newGeneralHistory },
        };
    }
    case 'SWITCH_ROLE': {
        return { ...state, activePlayerId: action.payload.playerId };
    }
    case 'TOGGLE_LOCK': {
        const obj = state.objects[action.payload.id];
        if (!obj) return state;

        const newLocked = !obj.locked;
        const newObjects = { ...state.objects, [action.payload.id]: { ...obj, locked: newLocked } };

        // If toggling lock on a NexusCellObject, sync to all other cells in the same board
        if (obj.type === ItemType.NEXUS_CELL) {
            const cell = obj as NexusCellObject;
            const boardId = cell.nexusBoardId;

            Object.values(state.objects).forEach(o => {
                if (o.type === ItemType.NEXUS_CELL && o.id !== cell.id) {
                    const otherCell = o as NexusCellObject;
                    if (otherCell.nexusBoardId === boardId) {
                        (newObjects as any)[o.id] = { ...otherCell, locked: newLocked };
                    }
                }
            });

            // Also sync to the NexusBoard itself
            const board = state.objects[boardId];
            if (board && board.type === ItemType.NEXUS_BOARD) {
                (newObjects as any)[boardId] = { ...board, locked: newLocked };
            }
        }

        // Don't track history for drawings (they use marker history)
        if (obj.type !== ItemType.DRAWING) {
            const historyEntry: GeneralHistoryEntry = {
                type: 'object-lock-toggled',
                objectId: obj.id,
                previousLocked: obj.locked ?? false,
            };
            const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

            return {
                ...state,
                objects: newObjects,
                undo: { ...state.undo, generalHistory: newGeneralHistory },
            };
        }

        return { ...state, objects: newObjects };
    }
    case 'TOGGLE_ON_TABLE': {
        const obj = state.objects[action.payload.id] as any;
        if (!obj) return state;

        // Don't track history for drawings
        if (obj.type !== ItemType.DRAWING) {
            const historyEntry: GeneralHistoryEntry = {
                type: 'object-on-table-toggled',
                objectId: obj.id,
                previousIsOnTable: obj.isOnTable ?? false,
            };
            const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

            return {
                ...state,
                objects: { ...state.objects, [action.payload.id]: { ...obj, isOnTable: !obj.isOnTable } },
                undo: { ...state.undo, generalHistory: newGeneralHistory },
            };
        }

        return { ...state, objects: { ...state.objects, [action.payload.id]: { ...obj, isOnTable: !obj.isOnTable } } };
    }
    case 'ROTATE_OBJECT': {
        const obj = state.objects[action.payload.id] as any;
        if (!obj) return state;
        // If angle is provided in payload, use it; otherwise use object's rotationStep
        // For cards, also check deck's rotationStep
        // For tokens with archetypeId, check archetype's rotationStep
        let rotationStep = obj.rotationStep;
        if (!rotationStep && obj.type === ItemType.CARD && obj.deckId) {
            const deck = state.objects[obj.deckId] as any;
            rotationStep = deck?.rotationStep;
        }
        if (!rotationStep && obj.type === ItemType.TOKEN && obj.archetypeId) {
            const archetype = state.objects[obj.archetypeId] as any;
            rotationStep = archetype?.rotationStep;
        }
        const angle = action.payload.angle ?? rotationStep ?? 45;
        const previousRotation = obj.rotation;

        // Add to general history (max 100)
        const historyEntry: GeneralHistoryEntry = {
            type: 'object-rotated',
            objectId: obj.id,
            previousRotation,
        };
        const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

        return {
            ...state,
            objects: { ...state.objects, [action.payload.id]: { ...obj, rotation: (obj.rotation + angle) % 360 } },
            undo: { ...state.undo, generalHistory: newGeneralHistory },
        };
    }
    case 'SET_ROTATION': {
        const obj = state.objects[action.payload.id];
        if (!obj) return state;
        const previousRotation = obj.rotation;

        // Add to general history (max 100)
        const historyEntry: GeneralHistoryEntry = {
            type: 'object-rotated',
            objectId: obj.id,
            previousRotation,
        };
        const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

        return {
            ...state,
            objects: { ...state.objects, [action.payload.id]: { ...obj, rotation: action.payload.rotation } },
            undo: { ...state.undo, generalHistory: newGeneralHistory },
        };
    }
    case 'CLONE_OBJECT': {
        const obj = state.objects[action.payload.id] as any;
        if (!obj) return state;

        // For tokens with archetypeId, check maxCopies limit
        if (obj.type === ItemType.TOKEN && obj.archetypeId) {
          const archetype = state.objects[obj.archetypeId] as any;
          if (archetype && archetype.type === ItemType.TOKEN_TYPE) {
            const maxCopies = archetype.maxCopies ?? 0;
            if (maxCopies > 0) {
              // Count existing tokens with this archetypeId
              const existingCopyCount = Object.values(state.objects).filter(o =>
                o.type === ItemType.TOKEN && o.archetypeId === obj.archetypeId
              ).length;

              if (existingCopyCount >= maxCopies) {
                // Limit reached, don't allow cloning
                return state;
              }
            }
          }
        }

        const newId = generateUUID();

        // For token copies: use 'tokens' layer if it exists
        let hyperscaleLayerId = obj.hyperscaleLayerId;
        if (obj.type === ItemType.TOKEN && state.hyperscaleLayers.some(l => l.id === 'tokens')) {
          hyperscaleLayerId = 'tokens';
        }

        // Get max zIndex within the object's hyperscale layer
        const layer = state.hyperscaleLayers.find(l => l.id === hyperscaleLayerId);
        const layerMinZ = layer?.minZIndex ?? 1;
        const layerMaxZ = layer?.maxZIndex ?? 10000;
        const layerObjects = Object.values(state.objects).filter(o => o.hyperscaleLayerId === hyperscaleLayerId);
        const layerZ = layerObjects.map(o => o.zIndex || 0);
        const maxZInLayer = layerZ.length ? Math.max(...layerZ) : layerMinZ;
        const newZ = Math.min(maxZInLayer + 1, layerMaxZ);

        // Prepare new objects map for deck cloning
        const newObjects: Record<string, TableObject> = {};
        let clonedObj: any;

        if (obj.type === ItemType.DECK) {
            // Deep clone deck with new cards and piles
            const deck = obj as Deck;
            const oldCardIdToNew: Map<string, string> = new Map();
            const oldPileIdToNew: Map<string, string> = new Map();
            const newBaseCardIds: string[] = [];
            const newCardIds: string[] = [];

            // Clone all cards from baseCardIds
            for (const oldCardId of deck.baseCardIds || []) {
                const oldCard = state.objects[oldCardId] as Card;
                if (oldCard) {
                    const newCardId = generateUUID();
                    oldCardIdToNew.set(oldCardId, newCardId);

                    newObjects[newCardId] = {
                        ...oldCard,
                        id: newCardId,
                        deckId: newId,
                        location: CardLocation.DECK,
                        isOnTable: false,
                        x: deck.x,
                        y: deck.y,
                    } as Card;

                    newBaseCardIds.push(newCardId);
                    newCardIds.push(newCardId);
                }
            }

            // Clone piles with new IDs and new card references
            const newPiles: CardPile[] = [];
            for (const oldPile of deck.piles || []) {
                const newPileId = generateUUID();
                oldPileIdToNew.set(oldPile.id, newPileId);

                const newPileCardIds: string[] = [];
                for (const oldCardId of oldPile.cardIds || []) {
                    const newCardId = oldCardIdToNew.get(oldCardId);
                    if (newCardId) {
                        newPileCardIds.push(newCardId);
                        // Update card location to pile
                        (newObjects[newCardId] as Card).location = CardLocation.PILE;
                    }
                }

                newPiles.push({
                    ...oldPile,
                    id: newPileId,
                    deckId: newId,
                    cardIds: newPileCardIds,
                });
            }

            // Create the cloned deck
            clonedObj = {
                ...obj,
                id: newId,
                x: obj.x + 30,
                y: obj.y + 30,
                name: `${obj.name} (Copy)`,
                locked: false,
                isOnTable: true,
                zIndex: newZ,
                hyperscaleLayerId,
                baseCardIds: newBaseCardIds,
                cardIds: newCardIds,
                initialCardCount: newBaseCardIds.length,
                piles: newPiles,
            };
        } else {
            // Simple clone for non-deck objects
            clonedObj = {
                ...obj,
                id: newId,
                x: obj.x + 30,
                y: obj.y + 30,
                name: `${obj.name} (Copy)`,
                locked: false,
                isOnTable: true,
                zIndex: newZ,
                hyperscaleLayerId,
            };
        }

        // Add cloned object and any new cards to the result
        const updatedObjects = { ...state.objects, [newId]: clonedObj, ...newObjects };

        // Add to general history (max 100)
        const historyEntry: GeneralHistoryEntry = {
            type: 'object-added',
            objectId: newId,
            object: clonedObj,
        };
        const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

        return {
            ...state,
            objects: updatedObjects,
            undo: { ...state.undo, generalHistory: newGeneralHistory },
        };
    }
    case 'RETURN_TO_DECK': {
        const card = state.objects[action.payload.cardId] as Card;
        if (!card || !card.deckId || !state.objects[card.deckId]) return state;
        const deck = state.objects[card.deckId] as Deck;

        // Add to general history (max 25)
        const historyEntry: GeneralHistoryEntry = {
            type: 'card-returned-to-deck',
            cardId: card.id,
            previousLocation: card.location,
            previousX: card.x,
            previousY: card.y,
            deckId: deck.id,
        };
        const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

        // Always return card to the TOP of its main deck (beginning of array)
        // Cards from piles (discard, etc.) return to the main deck, not to piles
        const newCardIds = [card.id, ...deck.cardIds];
        const updatedDeck: Deck = { ...deck, cardIds: newCardIds };
        // Card is face up by default (GM sees actual state, players see based on deck settings)
        const updatedCard: Card = {
            ...card,
            location: CardLocation.DECK,
            faceUp: true,
            x: deck.x,
            y: deck.y,
            isOnTable: true,
            // Clear cursor slot state to allow card to be added to cursor slot again
            inCursorSlot: false,
            fromPoolPanel: undefined,
            // Clear any pending play top state
            __pendingPlayTop: undefined,
        };
        return {
            ...state,
            objects: { ...state.objects, [deck.id]: updatedDeck, [card.id]: updatedCard },
            undo: { ...state.undo, generalHistory: newGeneralHistory },
        };
    }
    case 'RETURN_CARD_TO_DECK_TOP': {
        const card = state.objects[action.payload.cardId] as Card;
        const deck = state.objects[action.payload.deckId] as Deck;
        if (!card || !deck || deck.type !== ItemType.DECK) return state;

        // Capture state for undo before making changes
        const fromDeckId = card.deckId || deck.id;
        const fromDeck = state.objects[fromDeckId] as Deck;
        const fromCardIds = fromDeck?.cardIds ? [...fromDeck.cardIds] : undefined;

        // Find which pile the card was in (if any)
        let fromPileId: string | undefined;
        let fromPileCardIds: string[] | undefined;
        if (fromDeck?.piles) {
            for (const pile of fromDeck.piles) {
                if (pile.cardIds.includes(card.id)) {
                    fromPileId = pile.id;
                    fromPileCardIds = [...pile.cardIds];
                    break;
                }
            }
        }

        const toCardIds = [...deck.cardIds];

        const newObjects = { ...state.objects };

        // Remove card from wherever it currently is (deck.cardIds or any pile's cardIds)
        const sourceDeckId = card.deckId || deck.id;
        const sourceDeck = state.objects[sourceDeckId] as Deck;

        if (sourceDeck && sourceDeck.type === ItemType.DECK) {
            // First, try to find and remove from deck's main cardIds
            let updatedDeck = { ...sourceDeck };
            if (updatedDeck.cardIds.includes(card.id)) {
                updatedDeck.cardIds = updatedDeck.cardIds.filter(id => id !== card.id);
            }

            // Then check all piles
            if (updatedDeck.piles) {
                updatedDeck.piles = updatedDeck.piles.map(pile => {
                    if (pile.cardIds.includes(card.id)) {
                        return { ...pile, cardIds: pile.cardIds.filter(id => id !== card.id) };
                    }
                    return pile;
                });
            }

            newObjects[sourceDeckId] = updatedDeck;
        }

        // Add card to TOP of target deck (beginning of array)
        // Get fresh deck cardIds from state (which now has the card removed)
        const targetDeck = newObjects[deck.id] as Deck;
        const newCardIds = [card.id, ...targetDeck.cardIds];
        const updatedDeck: Deck = { ...targetDeck, cardIds: newCardIds };
        const updatedCard: Card = {
            ...card,
            location: CardLocation.DECK,
            faceUp: true,
            x: deck.x,
            y: deck.y,
            isOnTable: true,
            deckId: deck.id,
            // Clear cursor slot state to allow card to be added to cursor slot again
            inCursorSlot: false,
            fromPoolPanel: undefined,
            // Clear any pending play top state
            __pendingPlayTop: undefined,
        };
        newObjects[deck.id] = updatedDeck;
        newObjects[card.id] = updatedCard;

        // Add to general history (max 25)
        const historyEntry: GeneralHistoryEntry = {
            type: 'card-returned-to-top',
            cardId: card.id,
            previousLocation: card.location,
            previousX: card.location === CardLocation.TABLE ? card.x : undefined,
            previousY: card.location === CardLocation.TABLE ? card.y : undefined,
            previousFaceUp: card.faceUp,
            fromDeckId,
            toDeckId: deck.id,
            fromCardIds,
            toCardIds,
            fromPileId,
            fromPileCardIds,
        };
        const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

        return {
          ...state,
          objects: newObjects,
          undo: { ...state.undo, generalHistory: newGeneralHistory },
          lastModifiedBy: (action.payload as any).playerId || state.activePlayerId,
        };
    }
    case 'RETURN_CARD_TO_DECK_BOTTOM': {
        const card = state.objects[action.payload.cardId] as Card;
        const deck = state.objects[action.payload.deckId] as Deck;
        if (!card || !deck || deck.type !== ItemType.DECK) return state;

        // Capture state for undo before making changes
        const fromDeckId = card.deckId || deck.id;
        const fromDeck = state.objects[fromDeckId] as Deck;
        const fromCardIds = fromDeck?.cardIds ? [...fromDeck.cardIds] : undefined;

        // Find which pile the card was in (if any)
        let fromPileId: string | undefined;
        let fromPileCardIds: string[] | undefined;
        if (fromDeck?.piles) {
            for (const pile of fromDeck.piles) {
                if (pile.cardIds.includes(card.id)) {
                    fromPileId = pile.id;
                    fromPileCardIds = [...pile.cardIds];
                    break;
                }
            }
        }

        const toCardIds = [...deck.cardIds];

        const newObjects = { ...state.objects };

        // Remove card from wherever it currently is (deck.cardIds or any pile's cardIds)
        const sourceDeckId = card.deckId || deck.id;
        const sourceDeck = state.objects[sourceDeckId] as Deck;

        if (sourceDeck && sourceDeck.type === ItemType.DECK) {
            // First, try to find and remove from deck's main cardIds
            let updatedDeck = { ...sourceDeck };
            if (updatedDeck.cardIds.includes(card.id)) {
                updatedDeck.cardIds = updatedDeck.cardIds.filter(id => id !== card.id);
            }

            // Then check all piles
            if (updatedDeck.piles) {
                updatedDeck.piles = updatedDeck.piles.map(pile => {
                    if (pile.cardIds.includes(card.id)) {
                        return { ...pile, cardIds: pile.cardIds.filter(id => id !== card.id) };
                    }
                    return pile;
                });
            }

            newObjects[sourceDeckId] = updatedDeck;
        }

        // Get fresh deck cardIds from state (which now has the card removed)
        const targetDeck = newObjects[deck.id] as Deck;

        // Find the position of the first hidden card from the end
        // We want to insert the new card BEFORE hidden cards (so hidden cards stay at the very bottom)
        let insertIndex = targetDeck.cardIds.length;
        for (let i = targetDeck.cardIds.length - 1; i >= 0; i--) {
            const cardId = targetDeck.cardIds[i];
            const cardObj = state.objects[cardId] as Card;
            if (cardObj && cardObj.hidden) {
                insertIndex = i;
            } else {
                break; // Found a non-hidden card, stop here
            }
        }

        // Insert the card at the calculated position
        const newCardIds = [
            ...targetDeck.cardIds.slice(0, insertIndex),
            card.id,
            ...targetDeck.cardIds.slice(insertIndex)
        ];
        const updatedDeck: Deck = { ...targetDeck, cardIds: newCardIds };
        const updatedCard: Card = {
            ...card,
            location: CardLocation.DECK,
            faceUp: true,
            x: deck.x,
            y: deck.y,
            isOnTable: true,
            deckId: deck.id,
            // Clear cursor slot state to allow card to be added to cursor slot again
            inCursorSlot: false,
            fromPoolPanel: undefined,
            // Clear any pending play top state
            __pendingPlayTop: undefined,
        };
        newObjects[deck.id] = updatedDeck;
        newObjects[card.id] = updatedCard;

        // Add to general history (max 25)
        const historyEntry: GeneralHistoryEntry = {
            type: 'card-returned-to-bottom',
            cardId: card.id,
            previousLocation: card.location,
            previousX: card.location === CardLocation.TABLE ? card.x : undefined,
            previousY: card.location === CardLocation.TABLE ? card.y : undefined,
            previousFaceUp: card.faceUp,
            fromDeckId,
            toDeckId: deck.id,
            fromCardIds,
            toCardIds,
            fromPileId,
            fromPileCardIds,
        };
        const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

        return {
          ...state,
          objects: newObjects,
          undo: { ...state.undo, generalHistory: newGeneralHistory },
          lastModifiedBy: (action.payload as any).playerId || state.activePlayerId,
        };
    }
    case 'ADD_CARD_TO_TOP_OF_DECK': {
        const card = state.objects[action.payload.cardId] as Card;
        const deck = state.objects[action.payload.deckId] as Deck;
        if (!deck || deck.type !== ItemType.DECK) return state;

        // If card exists in state, use it; otherwise it might be coming from cursor slot
        // and we need to handle it differently (it will be added back to objects)
        if (!card) {
          return state;
        }

        // Prevent duplicate additions - if card is already in this deck, skip
        if (deck.cardIds.includes(card.id)) {
          return state;
        }

        // Capture state for undo before making changes
        let fromDeckId: string | undefined = card.deckId;
        let fromCardIds: string[] | undefined;

        // Remove card from its previous deck's cardIds (if it was in one)
        // Find which deck currently contains this card
        // If card doesn't have a deckId yet, check which deck's cardIds contains it
        if (!fromDeckId) {
            Object.values(state.objects).forEach(obj => {
                if (obj.type === ItemType.DECK) {
                    const d = obj as Deck;
                    if (d.cardIds.includes(card.id)) {
                        fromDeckId = d.id;
                    }
                }
            });
        }

        // Remove from previous deck's cardIds (but keep deckId unchanged - it belongs to original deck)
        let updatedState = state;
        if (fromDeckId) {
            const previousDeck = state.objects[fromDeckId] as Deck;
            // Always remove card from previous deck if it's there, even if adding back to same deck
            // This prevents duplicates when card was moved to pool panel and then back to deck
            if (previousDeck && previousDeck.cardIds.includes(card.id)) {
                fromCardIds = [...previousDeck.cardIds];
                const updatedPreviousDeck: Deck = {
                    ...previousDeck,
                    cardIds: previousDeck.cardIds.filter(id => id !== card.id)
                };
                updatedState = { ...state, objects: { ...state.objects, [fromDeckId]: updatedPreviousDeck } };
            }
        }

        const toCardIds = [...deck.cardIds];

        // Add card to the beginning of the deck (top position)
        // Use updatedState instead of state to include previous deck changes
        const newCardIds = [action.payload.cardId, ...deck.cardIds];
        const updatedDeck: Deck = { ...deck, cardIds: newCardIds };

        // Update card to be in deck
        // Keep the card's original deckId - cards always belong to their original deck
        const updatedCard: Card = {
            ...card,
            location: CardLocation.DECK,
            // Set deckId if not already set (card from empty deck may not have one)
            deckId: card.deckId || deck.id,
            faceUp: false,  // Cards are face down in deck
            x: deck.x,
            y: deck.y,
            isOnTable: true,
            // Clear cursor slot state to allow card to be added to cursor slot again
            inCursorSlot: false,
            fromPoolPanel: undefined,
            // Clear any pending play top state
            __pendingPlayTop: undefined,
        };

        // Add to general history (max 25)
        const historyEntry: GeneralHistoryEntry = {
            type: 'card-added-to-top',
            cardId: card.id,
            previousLocation: card.location,
            previousX: card.location === CardLocation.TABLE ? card.x : undefined,
            previousY: card.location === CardLocation.TABLE ? card.y : undefined,
            previousFaceUp: card.faceUp,
            fromDeckId,
            toDeckId: deck.id,
            fromCardIds,
            toCardIds,
        };
        const newGeneralHistory = [...updatedState.undo.generalHistory, historyEntry].slice(-100);

        return {
          ...updatedState,
          objects: { ...updatedState.objects, [deck.id]: updatedDeck, [action.payload.cardId]: updatedCard },
          undo: { ...updatedState.undo, generalHistory: newGeneralHistory },
          lastModifiedBy: (action.payload as any).playerId || state.activePlayerId,
        };
    }
    case 'ADD_CARD_TO_PILE': {
        const card = state.objects[action.payload.cardId] as Card;
        const deck = state.objects[action.payload.deckId] as Deck;
        if (!card || !deck || deck.type !== ItemType.DECK) return state;

        // Find the pile in the deck's piles array
        const pile = deck.piles?.find(p => p.id === action.payload.pileId);
        if (!pile) return state;

        // Capture state for undo before making changes
        const previousDeckCardIds = deck.cardIds ? [...deck.cardIds] : undefined;
        const previousPileCardIds = pile.cardIds ? [...pile.cardIds] : undefined;

        // Remove card from its previous deck's cardIds (if it was in one)
        // Find which deck currently contains this card
        let previousDeckId: string | undefined = card.deckId;
        // If card doesn't have a deckId yet, check which deck's cardIds contains it
        if (!previousDeckId) {
            Object.values(state.objects).forEach(obj => {
                if (obj.type === ItemType.DECK) {
                    const d = obj as Deck;
                    if (d.cardIds.includes(card.id)) {
                        previousDeckId = d.id;
                    }
                }
            });
        }

        // Remove from previous deck's cardIds (but keep deckId unchanged - it belongs to original deck)
        let deckWithUpdatedCardIds: Deck = deck;
        if (previousDeckId && previousDeckId !== deck.id) {
            // Card coming from a different deck - remove from that deck's cardIds
            const previousDeck = state.objects[previousDeckId] as Deck;
            if (previousDeck && previousDeck.cardIds.includes(card.id)) {
                const updatedPreviousDeck: Deck = {
                    ...previousDeck,
                    cardIds: previousDeck.cardIds.filter(id => id !== card.id)
                };
                // Also remove from previous deck's piles if present
                const updatedPreviousPiles = previousDeck.piles?.map(p => ({
                    ...p,
                    cardIds: p.cardIds.filter(id => id !== card.id)
                }));
                return { ...state, objects: { ...state.objects, [previousDeckId]: { ...updatedPreviousDeck, piles: updatedPreviousPiles } } };
            }
        } else if (previousDeckId === deck.id && deck.cardIds.includes(card.id)) {
            // Card coming from same deck's cardIds (e.g., milling from deck to pile) - remove from deck.cardIds
            deckWithUpdatedCardIds = {
                ...deck,
                cardIds: deck.cardIds.filter(id => id !== card.id)
            };
        }

        // Create updated pile with new card added to TOP (beginning of array)
        const updatedPile: CardPile = {
            ...pile,
            cardIds: [action.payload.cardId, ...pile.cardIds]
        };

        // Update deck's piles array
        const updatedPiles = deckWithUpdatedCardIds.piles?.map(p =>
            p.id === action.payload.pileId ? updatedPile : p
        ) || [updatedPile];

        const updatedDeck: Deck = { ...deckWithUpdatedCardIds, piles: updatedPiles };

        // Update card to be in pile
        // Keep the card's original deckId - cards always belong to their original deck
        const updatedCard: Card = {
            ...card,
            location: CardLocation.PILE,
            // Set deckId if not already set (card from empty deck may not have one)
            deckId: card.deckId || deck.id,
            faceUp: pile.faceUp ?? false,
            isOnTable: true
        };

        // Add to general history (max 25)
        const historyEntry: GeneralHistoryEntry = {
            type: 'card-added-to-pile',
            cardId: action.payload.cardId,
            previousLocation: card.location,
            previousX: card.location === CardLocation.TABLE ? card.x : undefined,
            previousY: card.location === CardLocation.TABLE ? card.y : undefined,
            deckId: deck.id,
            pileId: pile.id,
            previousDeckCardIds: previousDeckCardIds,
            previousPileCardIds: previousPileCardIds
        };
        const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

        return {
          ...state,
          objects: { ...state.objects, [deck.id]: updatedDeck, [action.payload.cardId]: updatedCard },
          undo: { ...state.undo, generalHistory: newGeneralHistory },
          lastModifiedBy: (action.payload as any).playerId || state.activePlayerId,
        };
    }
    case 'UPDATE_PERMISSIONS': {
        const obj = state.objects[action.payload.id] as any;
        if (!obj) return state;
        // Cards don't have allowedActions - skip
        if (obj.type === ItemType.CARD) return state;
        return { ...state, objects: { ...state.objects, [action.payload.id]: { ...obj, allowedActions: action.payload.actions } } };
    }
    case 'UPDATE_ACTION_BUTTONS': {
        const obj = state.objects[action.payload.id] as any;
        if (!obj) return state;
        // Cards don't have actionButtons - skip
        if (obj.type === ItemType.CARD) return state;
        return { ...state, objects: { ...state.objects, [action.payload.id]: { ...obj, actionButtons: action.payload.actions } } };
    }
    case 'MOVE_LAYER_UP': {
        const obj = state.objects[action.payload.id];
        if (!obj) return state;

        // Get object's hyperscale layer bounds
        const layerId = obj.hyperscaleLayerId || 'tokens';
        const layer = state.hyperscaleLayers.find(l => l.id === layerId);
        const maxZ = layer?.maxZIndex ?? 10000;

        // Only sort objects within the same hyperscale layer
        const layerObjects = Object.values(state.objects).filter(o => o.hyperscaleLayerId === layerId);
        const sortedObjects = layerObjects.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
        const index = sortedObjects.findIndex(o => o.id === obj.id);
        if (index === -1 || index === sortedObjects.length - 1) return state;
        const nextObj = sortedObjects[index + 1];
        const currentZ = obj.zIndex || 0;
        const nextZ = nextObj.zIndex || 0;
        let newCurrentZ = Math.min(nextZ, maxZ);
        let newNextZ = currentZ;
        if (newCurrentZ <= newNextZ) { newCurrentZ = Math.min(newNextZ + 1, maxZ); }

        // Add to general history
        const historyEntry: GeneralHistoryEntry = {
            type: 'object-layer-changed',
            objectId: obj.id,
            direction: 'up',
            previousZIndex: currentZ,
            otherObjectId: nextObj.id,
            otherObjectPreviousZIndex: nextZ,
        };
        const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

        return {
            ...state,
            objects: { ...state.objects, [obj.id]: { ...obj, zIndex: newCurrentZ }, [nextObj.id]: { ...nextObj, zIndex: newNextZ } },
            undo: { ...state.undo, generalHistory: newGeneralHistory },
        };
    }
    case 'MOVE_LAYER_DOWN': {
        const obj = state.objects[action.payload.id];
        if (!obj) return state;

        // Get object's hyperscale layer bounds
        const layerId = obj.hyperscaleLayerId || 'tokens';
        const layer = state.hyperscaleLayers.find(l => l.id === layerId);
        const minZ = layer?.minZIndex ?? 1;

        // Only sort objects within the same hyperscale layer
        const layerObjects = Object.values(state.objects).filter(o => o.hyperscaleLayerId === layerId);
        const sortedObjects = layerObjects.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
        const index = sortedObjects.findIndex(o => o.id === obj.id);
        if (index <= 0) return state;
        const prevObj = sortedObjects[index - 1];
        const isPrevBoard = prevObj.type === ItemType.BOARD;
        const isCurrentBoard = obj.type === ItemType.BOARD;
        if (isPrevBoard && !isCurrentBoard) return state;
        const currentZ = obj.zIndex || 0;
        const prevZ = prevObj.zIndex || 0;
        let newCurrentZ = Math.max(prevZ, minZ);
        let newPrevZ = currentZ;
        if (newPrevZ >= newCurrentZ) { newPrevZ = Math.max(newCurrentZ + 1, minZ); }

        // Add to general history
        const historyEntry: GeneralHistoryEntry = {
            type: 'object-layer-changed',
            objectId: obj.id,
            direction: 'down',
            previousZIndex: currentZ,
            otherObjectId: prevObj.id,
            otherObjectPreviousZIndex: prevZ,
        };
        const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

        return {
            ...state,
            objects: { ...state.objects, [obj.id]: { ...obj, zIndex: newCurrentZ }, [prevObj.id]: { ...prevObj, zIndex: newPrevZ } },
            undo: { ...state.undo, generalHistory: newGeneralHistory },
        };
    }
    case 'BRING_TO_FRONT': {
        const obj = state.objects[action.payload.id];
        if (!obj) return state;

        // Get object's hyperscale layer bounds
        const layerId = obj.hyperscaleLayerId || 'tokens';
        const layer = state.hyperscaleLayers.find(l => l.id === layerId);
        const minZ = layer?.minZIndex ?? 1;

        // Get all objects in the same layer, sorted by zIndex, EXCLUDING target
        const otherObjects = Object.values(state.objects)
            .filter(o => o.hyperscaleLayerId === layerId && o.id !== obj.id)
            .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

        // Defragment: compact all other objects starting from minZ
        const newObjects = { ...state.objects };
        otherObjects.forEach((layerObj, index) => {
            newObjects[layerObj.id] = { ...layerObj, zIndex: minZ + index };
        });

        // Place the target object at the top (above all others, at lowest possible position)
        const targetZ = minZ + otherObjects.length;
        newObjects[obj.id] = { ...obj, zIndex: targetZ };

        // Add to general history
        const historyEntry: GeneralHistoryEntry = {
            type: 'object-layer-changed',
            objectId: obj.id,
            direction: 'up',
            previousZIndex: obj.zIndex || 0,
        };
        const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

        return {
            ...state,
            objects: newObjects,
            undo: { ...state.undo, generalHistory: newGeneralHistory },
        };
    }
    case 'SEND_TO_BACK': {
        const obj = state.objects[action.payload.id];
        if (!obj) return state;

        // Get object's hyperscale layer bounds
        const layerId = obj.hyperscaleLayerId || 'tokens';
        const layer = state.hyperscaleLayers.find(l => l.id === layerId);
        const minZ = layer?.minZIndex ?? 1;

        // Get all objects in the same layer, sorted by zIndex, EXCLUDING target
        const otherObjects = Object.values(state.objects)
            .filter(o => o.hyperscaleLayerId === layerId && o.id !== obj.id)
            .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

        // Defragment: compact all other objects starting from minZ + 1
        const newObjects = { ...state.objects };
        otherObjects.forEach((layerObj, index) => {
            newObjects[layerObj.id] = { ...layerObj, zIndex: minZ + 1 + index };
        });

        // Place the target object at the bottom (minZ)
        newObjects[obj.id] = { ...obj, zIndex: minZ };

        // Add to general history
        const historyEntry: GeneralHistoryEntry = {
            type: 'object-layer-changed',
            objectId: obj.id,
            direction: 'down',
            previousZIndex: obj.zIndex || 0,
        };
        const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

        return {
            ...state,
            objects: newObjects,
            undo: { ...state.undo, generalHistory: newGeneralHistory },
        };
    }
    case 'UPDATE_VIEW_TRANSFORM': {
      return { ...state, viewTransform: action.payload };
    }
    case 'SET_PIXELS_PER_VU': {
      return {
        ...state,
        viewTransform: { ...state.viewTransform, pixelsPerVU: action.payload.pixelsPerVU }
      };
    }
    case 'DRAW_FROM_PILE': {
      const deck = state.objects[action.payload.deckId] as Deck;
      if (!deck || deck.type !== ItemType.DECK) return state;

      const pile = deck.piles?.find(p => p.id === action.payload.pileId);
      if (!pile || pile.cardIds.length === 0) return state;

      // Take TOP card from pile (first element in array, index 0)
      const drawnCardId = pile.cardIds[0];
      const newPileCardIds = pile.cardIds.slice(1);
      if (!drawnCardId) return state;

      const card = state.objects[drawnCardId] as Card;

      // Add to general history (max 25)
      const historyEntry: GeneralHistoryEntry = {
        type: 'card-drawn-from-pile',
        cardId: drawnCardId,
        previousLocation: card.location,
        deckId: deck.id,
        pileId: pile.id,
        fromIndex: 0,
      };
      const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

      const updatedCard: Card = {
        ...card,
        location: CardLocation.HAND,
        ownerId: action.payload.playerId,
        deckId: deck.id,
        faceUp: true,
        isOnTable: false,
      };

      // Update pile with card removed
      const updatedPile: CardPile = { ...pile, cardIds: newPileCardIds };
      const updatedPiles = deck.piles?.map(p => p.id === action.payload.pileId ? updatedPile : p) || [updatedPile];
      const updatedDeck: Deck = { ...deck, piles: updatedPiles };

      return {
        ...state,
        objects: { ...state.objects, [deck.id]: updatedDeck, [drawnCardId]: updatedCard },
        undo: { ...state.undo, generalHistory: newGeneralHistory },
        lastModifiedBy: action.payload.playerId || state.activePlayerId,
      };
    }
    case 'RETURN_ALL_CARDS_TO_DECK': {
      const deck = state.objects[action.payload.deckId] as Deck;
      if (!deck || deck.type !== ItemType.DECK) return state;

      const { exceptHands = false, shuffleAfter = false } = action.payload;
      const baseCardIds = deck.baseCardIds || [];
      const newObjects = { ...state.objects };
      const spriteConfig = deck.spriteConfig;

      // 1. Clear all piles of this deck
      let updatedDeck = { ...deck };
      if (updatedDeck.piles) {
        updatedDeck.piles = updatedDeck.piles.map(pile => ({
          ...pile,
          cardIds: []
        }));
      }

      // 2. Set cardIds = baseCardIds (reset to base)
      // If exceptHands is true, we'll filter out cards in hands later
      updatedDeck.cardIds = [...baseCardIds];

      // 3. Track which base card IDs we've found
      const foundBaseCardIds = new Set<string>();
      // Track cards that are in hands (when exceptHands is true)
      const cardsInHands = new Set<string>();

      // 4. Process all existing cards
      Object.values(state.objects).forEach(obj => {
        if (obj.type !== ItemType.CARD) return;
        const card = obj as Card;

        // Cards that belong to THIS deck
        if (card.deckId === deck.id) {
          // Skip cards in hands if exceptHands is true
          if (exceptHands && card.location === CardLocation.HAND) {
            // Track cards that are in hands so we don't recreate them
            if (baseCardIds.includes(card.id)) {
              cardsInHands.add(card.id);
            }
            return;
          }

          if (baseCardIds.includes(card.id)) {
            // Card is in baseCardIds - move it to THIS deck
            foundBaseCardIds.add(card.id);
            newObjects[card.id] = {
              ...card,
              location: CardLocation.DECK,
              faceUp: true,
              x: 0,
              y: 0,
              isOnTable: true,
              ownerId: undefined,
            };
          } else {
            // Card has this deck's deckId but is NOT in baseCardIds
            // This means it was permanently removed by GM deletion - delete it
            delete newObjects[card.id];
          }
        }
      });

      // 5. Re-create missing cards using sprite config
      // baseCardIds is ordered by spriteIndex (baseCardIds[i] has spriteIndex = i)
      if (spriteConfig && spriteConfig.columns > 0 && spriteConfig.rows > 0) {
        baseCardIds.forEach((cardId, index) => {
          if (!foundBaseCardIds.has(cardId)) {
            // Check if this card is in a player's hand - if so, don't recreate it
            if (cardsInHands.has(cardId)) {
              return;
            }
            // Card is missing - recreate it
            newObjects[cardId] = {
              id: cardId,
              type: ItemType.CARD,
              name: `Card ${index + 1}`,
              content: spriteConfig.cardBackUrl || spriteConfig.spriteUrl,
              deckId: deck.id,
              width: deck.cardWidth || deck.width || 63,
              height: deck.cardHeight || deck.height || 88,
              x: 0,
              y: 0,
              rotation: 0,
              location: CardLocation.DECK,
              faceUp: true,
              isOnTable: true,
              locked: false,
              // Sprite properties - index is the position in baseCardIds
              spriteIndex: index,
              spriteUrl: spriteConfig.spriteUrl,
              spriteColumns: spriteConfig.columns,
              spriteRows: spriteConfig.rows,
              shape: deck.cardShape,
            };
          }
        });
      }

      // 5.5. Update deck.cardIds to exclude cards that are in hands (when exceptHands is true)
      if (exceptHands && cardsInHands.size > 0) {
        updatedDeck.cardIds = baseCardIds.filter(id => !cardsInHands.has(id));
      }

      // 6. Shuffle if requested
      if (shuffleAfter) {
        // Fisher-Yates shuffle
        const shuffled = [...updatedDeck.cardIds];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        updatedDeck.cardIds = shuffled;
      }

      newObjects[deck.id] = updatedDeck;

      return {
        ...state,
        objects: newObjects,
        lastModifiedBy: (action.payload as any).playerId || state.activePlayerId,
      };
    }
    case 'TOGGLE_PILE_LOCK': {
      const deck = state.objects[action.payload.deckId] as Deck;
      if (!deck || deck.type !== ItemType.DECK) return state;

      const pile = deck.piles?.find(p => p.id === action.payload.pileId);
      if (!pile) return state;

      const updatedPiles = deck.piles?.map(p =>
        p.id === action.payload.pileId ? { ...p, locked: !p.locked } : p
      );

      return {
        ...state,
        objects: {
          ...state.objects,
          [deck.id]: { ...deck, piles: updatedPiles }
        },
        lastModifiedBy: (action.payload as any).playerId || state.activePlayerId,
      };
    }
    case 'UPDATE_PILE_POSITION': {
      const deck = state.objects[action.payload.deckId] as Deck;
      if (!deck || deck.type !== ItemType.DECK) return state;

      const pile = deck.piles?.find(p => p.id === action.payload.pileId);
      if (!pile) return state;

      const updatedPiles = deck.piles?.map(p =>
        p.id === action.payload.pileId ? { ...p, x: action.payload.x, y: action.payload.y } : p
      );

      return {
        ...state,
        objects: {
          ...state.objects,
          [deck.id]: { ...deck, piles: updatedPiles }
        },
        lastModifiedBy: (action.payload as any).playerId || state.activePlayerId,
      };
    }
    case 'UPDATE_DECK_CARD_DIMENSIONS': {
      const deck = state.objects[action.payload.deckId] as Deck;
      if (!deck || deck.type !== ItemType.DECK) return state;

      const { cardWidth, cardHeight } = action.payload;

      // Update deck settings
      const updatedDeck: Deck = {
        ...deck,
        cardWidth,
        cardHeight,
      };

      // Update all cards in this deck - set their individual dimensions
      // to match the deck's card dimensions
      const newObjects = { ...state.objects };
      newObjects[deck.id] = updatedDeck;

      // Find all cards belonging to this deck and set their width/height
      Object.values(state.objects).forEach(obj => {
        if (obj.type === ItemType.CARD) {
          const card = obj as Card;
          if (card.deckId === deck.id) {
            // Set individual width/height on the card itself
            newObjects[card.id] = {
              ...card,
              width: cardWidth,
              height: cardHeight,
            };
          }
        }
      });

      // Clear card dimensions cache to force recalculation with new dimensions
      clearCardDimensionsCache();

      return {
        ...state,
        objects: newObjects,
      };
    }
    case 'MILL_CARD_TO_BOTTOM': {
      // Move card to bottom of deck (before hidden cards)
      const { cardId, deckId } = action.payload;
      const deck = state.objects[deckId] as Deck;
      if (!deck || deck.type !== ItemType.DECK) return state;

      // Capture state for undo before making changes
      const previousCardIds = [...deck.cardIds];

      // Remove card from any pile if it's there
      let updatedPiles = deck.piles;
      if (deck.piles) {
        updatedPiles = deck.piles.map(pile => ({
          ...pile,
          cardIds: pile.cardIds.filter(id => id !== cardId)
        }));
      }

      // Build cardIds array - include the card even if it's not currently in deck
      // (card might be on table, in hand, etc.)
      let workingCardIds = [...deck.cardIds];
      if (!workingCardIds.includes(cardId)) {
        // Card is not in deck, add it first
        workingCardIds.push(cardId);
      }

      // Find the position of the first hidden card from the end
      // Insert before hidden cards so they stay at the very bottom
      let insertIndex = workingCardIds.length;
      for (let i = workingCardIds.length - 1; i >= 0; i--) {
        const currentCardId = workingCardIds[i];
        const cardObj = state.objects[currentCardId] as Card;
        if (cardObj && cardObj.hidden) {
          insertIndex = i;
        } else {
          break;
        }
      }

      // Remove card from current position and insert at calculated position
      const filteredIds = workingCardIds.filter(id => id !== cardId);
      const newCardIds = [
        ...filteredIds.slice(0, insertIndex),
        cardId,
        ...filteredIds.slice(insertIndex)
      ];

      // Update the card itself - set location to DECK and clear table state
      const card = state.objects[cardId] as Card;
      const updatedCard = card ? {
        ...card,
        location: CardLocation.DECK,
        isOnTable: false,
        ownerId: undefined,
        x: undefined,
        y: undefined,
      } : null;

      // Add to general history (max 25)
      const historyEntry: GeneralHistoryEntry = {
        type: 'card-milled-to-bottom',
        cardId,
        deckId,
        previousCardIds,
      };
      const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

      const newObjects = {
        ...state.objects,
        [deckId]: { ...deck, cardIds: newCardIds, piles: updatedPiles }
      };
      if (updatedCard) {
        newObjects[cardId] = updatedCard;
      }

      return {
        ...state,
        objects: newObjects,
        undo: { ...state.undo, generalHistory: newGeneralHistory },
      };
    }
    case 'MILL_CARD_TO_PILE': {
      // Move card from deck to pile
      const { cardId, deckId, pileId } = action.payload;
      const deck = state.objects[deckId] as Deck;
      if (!deck || deck.type !== ItemType.DECK) return state;
      if (!deck.cardIds.includes(cardId)) return state;

      const pile = deck.piles?.find(p => p.id === pileId);
      if (!pile) return state;

      // Capture state for undo before making changes
      const previousDeckCardIds = [...deck.cardIds];
      const previousPileCardIds = [...pile.cardIds];

      // Remove from deck cardIds
      const newDeckCardIds = deck.cardIds.filter(id => id !== cardId);
      // Add to pile cardIds
      const newPileCardIds = [...pile.cardIds, cardId];

      // Update piles array
      const updatedPiles = deck.piles?.map(p =>
        p.id === pileId ? { ...p, cardIds: newPileCardIds } : p
      );

      // Add to general history (max 25)
      const historyEntry: GeneralHistoryEntry = {
        type: 'card-milled-to-pile',
        cardId,
        deckId,
        pileId,
        previousDeckCardIds,
        previousPileCardIds,
      };
      const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

      return {
        ...state,
        objects: {
          ...state.objects,
          [deckId]: {
            ...deck,
            cardIds: newDeckCardIds,
            piles: updatedPiles
          }
        },
        undo: { ...state.undo, generalHistory: newGeneralHistory },
        lastModifiedBy: (action.payload as any).playerId || state.activePlayerId,
      };
    }
    case 'TOGGLE_SHOW_TOP_CARD': {
      // Toggle showTopCard for deck or pile
      const { deckId, pileId } = action.payload;
      const deck = state.objects[deckId] as Deck;
      if (!deck || deck.type !== ItemType.DECK) return state;

      if (pileId) {
        // Toggle showTopCard for a specific pile
        const pile = deck.piles?.find(p => p.id === pileId);
        if (!pile) return state;

        const updatedPiles = deck.piles?.map(p =>
          p.id === pileId ? { ...p, showTopCard: !p.showTopCard } : p
        );

        return {
          ...state,
          objects: {
            ...state.objects,
            [deckId]: { ...deck, piles: updatedPiles }
          }
        };
      } else {
        // Toggle showTopCard for the deck itself
        return {
          ...state,
          objects: {
            ...state.objects,
            [deckId]: { ...deck, showTopCard: !deck.showTopCard }
          }
        };
      }
    }
    case 'SWING_CLOCKWISE': {
      const obj = state.objects[action.payload.id] as any;
      if (!obj) return state;

      // For cards, check deck's rotationStep
      let rotationStep = obj.rotationStep;
      if (!rotationStep && obj.type === ItemType.CARD && obj.deckId) {
        const deck = state.objects[obj.deckId] as any;
        rotationStep = deck?.rotationStep;
      }
      rotationStep = rotationStep ?? 45;

      const baseRotation = obj.baseRotation ?? obj.rotation;
      const previousRotation = obj.rotation;

      // If current rotation is at base, rotate clockwise by rotationStep
      // Otherwise return to base rotation
      const newRotation = obj.rotation === baseRotation
        ? (obj.rotation + rotationStep) % 360
        : baseRotation;

      // Add to general history
      const historyEntry: GeneralHistoryEntry = {
        type: 'object-rotated',
        objectId: obj.id,
        previousRotation,
        previousBaseRotation: obj.baseRotation,
      };
      const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

      return {
        ...state,
        objects: {
          ...state.objects,
          [action.payload.id]: {
            ...obj,
            rotation: newRotation,
            baseRotation: baseRotation
          }
        },
        undo: { ...state.undo, generalHistory: newGeneralHistory },
      };
    }
    case 'SWING_COUNTER_CLOCKWISE': {
      const obj = state.objects[action.payload.id] as any;
      if (!obj) return state;

      // For cards, check deck's rotationStep
      let rotationStep = obj.rotationStep;
      if (!rotationStep && obj.type === ItemType.CARD && obj.deckId) {
        const deck = state.objects[obj.deckId] as any;
        rotationStep = deck?.rotationStep;
      }
      rotationStep = rotationStep ?? 45;

      const baseRotation = obj.baseRotation ?? obj.rotation;
      const previousRotation = obj.rotation;

      // If current rotation is at base, rotate counter-clockwise by rotationStep
      // Otherwise return to base rotation
      const newRotation = obj.rotation === baseRotation
        ? (obj.rotation - rotationStep + 360) % 360
        : baseRotation;

      // Add to general history
      const historyEntry: GeneralHistoryEntry = {
        type: 'object-rotated',
        objectId: obj.id,
        previousRotation,
        previousBaseRotation: obj.baseRotation,
      };
      const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

      return {
        ...state,
        objects: {
          ...state.objects,
          [action.payload.id]: {
            ...obj,
            rotation: newRotation,
            baseRotation: baseRotation
          }
        },
        undo: { ...state.undo, generalHistory: newGeneralHistory },
      };
    }
    case 'PIN_TO_VIEWPORT': {
      const obj = state.objects[action.payload.id];
      if (!obj) return state;

      // Skip history for pinning to improve performance
      // Pinning/unpinning is frequent and doesn't need history tracking

      const isMinimized = (obj as any).minimized || false;
      const hasDualPosition = (obj as any).dualPosition || false;

      // For dual position mode, store separate positions for minimized and expanded states
      if (hasDualPosition) {
        const updatedObj: any = {
          ...obj,
          isPinnedToViewport: true,
        };

        if (isMinimized) {
          // Store as collapsed pinned position when currently minimized
          updatedObj.collapsedPinnedPosition = { x: action.payload.screenX, y: action.payload.screenY };
          // Keep expanded position if it exists
          if (!updatedObj.expandedPinnedPosition && (obj as any).pinnedScreenPosition) {
            updatedObj.expandedPinnedPosition = { ...(obj as any).pinnedScreenPosition };
          }
        } else {
          // Store as expanded pinned position when currently expanded
          updatedObj.expandedPinnedPosition = { x: action.payload.screenX, y: action.payload.screenY };
          // Keep collapsed position if it exists
          if (!updatedObj.collapsedPinnedPosition && (obj as any).pinnedScreenPosition) {
            updatedObj.collapsedPinnedPosition = { ...(obj as any).pinnedScreenPosition };
          }
        }

        // Also set the legacy pinnedScreenPosition for backward compatibility
        updatedObj.pinnedScreenPosition = { x: action.payload.screenX, y: action.payload.screenY };

        // Store pixel dimensions if provided (to prevent size changes when pinning)
        if (action.payload.pixelWidth !== undefined) {
          updatedObj.pinnedPixelWidth = action.payload.pixelWidth;
        }
        if (action.payload.pixelHeight !== undefined) {
          updatedObj.pinnedPixelHeight = action.payload.pixelHeight;
        }

        return {
          ...state,
          objects: {
            ...state.objects,
            [action.payload.id]: updatedObj
          },
        };
      }

      // Single position mode (original behavior)
      const updatedObj: any = {
        ...obj,
        isPinnedToViewport: true,
        pinnedScreenPosition: { x: action.payload.screenX, y: action.payload.screenY }
      };

      // Store pixel dimensions if provided (to prevent size changes when pinning)
      if (action.payload.pixelWidth !== undefined) {
        updatedObj.pinnedPixelWidth = action.payload.pixelWidth;
      }
      if (action.payload.pixelHeight !== undefined) {
        updatedObj.pinnedPixelHeight = action.payload.pixelHeight;
      }

      return {
        ...state,
        objects: {
          ...state.objects,
          [action.payload.id]: updatedObj
        },
      };
    }
    case 'UNPIN_FROM_VIEWPORT': {
      const obj = state.objects[action.payload.id];
      if (!obj) return state;

      // Skip history for unpinning to improve performance
      // Pinning/unpinning is frequent and doesn't need history tracking

      return {
        ...state,
        objects: {
          ...state.objects,
          [action.payload.id]: {
            ...obj,
            x: action.payload.worldX,
            y: action.payload.worldY,
            isPinnedToViewport: false,
            pinnedScreenPosition: undefined,
            expandedPinnedPosition: undefined,
            collapsedPinnedPosition: undefined
          }
        },
      };
    }
    case 'CREATE_PANEL': {
      const { panelType, x = 100, y = 100, width = DEFAULT_PANEL_WIDTH, height = DEFAULT_PANEL_HEIGHT, title, deckId } = action.payload;
      const panelId = generateUUID();

      // Get max zIndex within interface layer, clamp to layer bounds
      const interfaceLayer = state.hyperscaleLayers.find(l => l.id === 'interface');
      const layerMinZ = interfaceLayer?.minZIndex ?? 9001;
      const layerMaxZ = interfaceLayer?.maxZIndex ?? 10000;
      const interfaceObjects = Object.values(state.objects).filter(o => o.hyperscaleLayerId === 'interface');
      const interfaceZ = interfaceObjects.map(o => o.zIndex || 0);
      const maxZInInterface = interfaceZ.length ? Math.max(...interfaceZ) : layerMinZ;
      const panelZ = Math.min(maxZInInterface + 1, layerMaxZ);

      const panel: PanelObject = {
        id: panelId,
        type: ItemType.PANEL,
        name: title || panelType,
        panelType,
        title: title || panelType,
        x,
        y,
        width,
        height,
        rotation: 0,
        zIndex: panelZ,
        locked: false,
        minimized: false,
        visible: true,
        deckId,
        hyperscaleLayerId: 'interface', // All panels go on the interface layer
      };

      // Main menu is pinned to viewport by default with dual position mode enabled
      if (panelType === PanelType.MAIN_MENU) {
        panel.isPinnedToViewport = true;
        panel.pinnedScreenPosition = { x, y };
        panel.dualPosition = true; // Enable dual position mode by default
      }

      // Initialize character data for CHARACTER panels with first character
      if (panelType === PanelType.CHARACTER) {
        const firstCharacterId = `char-${Date.now()}`;
        (panel as PanelObject & { characterData: any }).characterData = {
          characters: [
            {
              id: firstCharacterId,
              characterName: 'Character 1',
              playerId: undefined,
              subTabs: [
                {
                  id: 'subtab-1',
                  name: 'Main',
                  blocks: [],
                  columns: 1
                },
                {
                  id: 'subtab-2',
                  name: 'Skills',
                  blocks: [],
                  columns: 1
                },
                {
                  id: 'subtab-3',
                  name: 'Inventory',
                  blocks: [],
                  columns: 1
                }
              ],
              activeSubTabId: 'subtab-1',
              visibleToPlayerIds: [],
              manageableByPlayerIds: [],
              editableByPlayerIds: [],
              avatarUrl: undefined
            }
          ],
          presets: [],
          activeCharacterId: firstCharacterId,
          isUniversal: false
        };
      }

      // Initialize pool data for POOL panels
      if (panelType === PanelType.POOL) {
        const defaultPoolTab: PanelTab = {
          id: 'tab-default',
          name: 'Pool 1',
          visibleToPlayerIds: [],
          manageableByPlayerIds: [],
          editableByPlayerIds: [],
          offsetX: 0,
          offsetY: 0
        };

        // Find available territory outside playable area (5000×5000)
        const existingPools = Object.values(state.objects)
          .filter(obj => obj.type === ItemType.PANEL && (obj as PanelObject).panelType === PanelType.POOL)
          .flatMap(obj => {
            const poolPanel = obj as PanelObject;
            const poolData = poolPanel.poolData!;
            // Each tab has its own territory now
            return poolData.tabs.map(tab => ({
              id: tab.id,
              x: tab.offsetX ?? 0,
              y: tab.offsetY ?? 0,
              width: 1000,
              height: 1000
            }));
          });

        const territory = findAvailableTerritory(existingPools);

        if (!territory) {
          logger.error('No available territory for pool panel');
          // Fallback to old logic if territory finding fails
          const poolIndex = existingPools.length;
          const fallbackTab = {
            ...defaultPoolTab,
            offsetX: 2500 + poolIndex * 1200,
            offsetY: 0
          };
          const defaultPoolData: PoolPanelData = {
            tabs: [fallbackTab],
            activeTabId: 'tab-default',
            width: 1000,
            height: 1000
          };
          (panel as PanelObject & { poolData: PoolPanelData }).poolData = defaultPoolData;
        } else {
          const territoryTab = {
            ...defaultPoolTab,
            offsetX: territory.x,
            offsetY: territory.y,
            territoryId: `territory-${panel.id}-tab-default-${Date.now()}`
          };
          const defaultPoolData: PoolPanelData = {
            tabs: [territoryTab],
            activeTabId: 'tab-default',
            width: 1000,
            height: 1000
          };
          (panel as PanelObject & { poolData: PoolPanelData }).poolData = defaultPoolData;
        }
      }

      // Initialize tableau data for TABLEAU panels
      if (panelType === PanelType.TABLEAU) {
        const defaultTableauTab: PanelTab = {
          id: 'tab-default',
          name: 'Tableau 1',
          visibleToPlayerIds: [],
          manageableByPlayerIds: [],
          editableByPlayerIds: [],
          offsetX: 0,
          offsetY: 0
        };

        const defaultTableauData: TableauPanelData = {
          tabs: [defaultTableauTab],
          activeTabId: 'tab-default',
          tabObjects: {
            'tab-default': []
          }
        };

        (panel as PanelObject & { tableauData: TableauPanelData }).tableauData = defaultTableauData;
      }

      return {
        ...state,
        objects: { ...state.objects, [panelId]: panel },
      };
    }
    case 'CREATE_WINDOW': {
      const { windowType, x = 200, y = 200, title, targetObjectId, targetLayerId } = action.payload;
      const windowId = generateUUID();

      // Get max zIndex within interface layer, clamp to layer bounds
      const interfaceLayer = state.hyperscaleLayers.find(l => l.id === 'interface');
      const layerMinZ = interfaceLayer?.minZIndex ?? 9001;
      const layerMaxZ = interfaceLayer?.maxZIndex ?? 10000;
      const interfaceObjects = Object.values(state.objects).filter(o => o.hyperscaleLayerId === 'interface');
      const interfaceZ = interfaceObjects.map(o => o.zIndex || 0);
      const maxZInInterface = interfaceZ.length ? Math.max(...interfaceZ) : layerMinZ;
      const windowZ = Math.min(maxZInInterface + 1, layerMaxZ);

      const windowObj: WindowObject = {
        id: windowId,
        type: ItemType.WINDOW,
        name: title || windowType,
        windowType,
        title: title || windowType,
        x,
        y,
        width: 400,
        height: 300,
        rotation: 0,
        zIndex: windowZ,
        locked: false,
        minimized: false,
        visible: true,
        targetObjectId,
        targetLayerId,
        hyperscaleLayerId: 'interface', // All windows go on the interface layer
        // Settings windows are local to the player who created them
        ownerId: windowType === WindowType.OBJECT_SETTINGS || windowType === WindowType.HYPERSCALE_LAYER_SETTINGS ? state.activePlayerId : undefined,
      };

      return {
        ...state,
        objects: { ...state.objects, [windowId]: windowObj },
      };
    }
    case 'CLOSE_UI_OBJECT': {
      const obj = state.objects[action.payload.id];
      if (!obj || (obj.type !== ItemType.PANEL && obj.type !== ItemType.WINDOW)) return state;

      // For windows, close = delete; for panels, close = hide
      if (obj.type === ItemType.WINDOW) {
        const newObjects = { ...state.objects };
        delete newObjects[action.payload.id];
        return { ...state, objects: newObjects };
      } else {
        return {
          ...state,
          objects: {
            ...state.objects,
            [action.payload.id]: { ...obj, visible: false } as PanelObject,
          },
        };
      }
    }
    case 'TOGGLE_MINIMIZE': {
      const obj = state.objects[action.payload.id];
      if (!obj || (obj.type !== ItemType.PANEL && obj.type !== ItemType.WINDOW)) return state;

      const isMinimizing = !obj.minimized;
      const hasDualPosition = (obj as any).dualPosition || false;
      const isPinned = (obj as any).isPinnedToViewport || false;

      let newObj: PanelObject | WindowObject = { ...obj, minimized: isMinimizing } as PanelObject | WindowObject;

      // If dual position mode is enabled and object is pinned, update position
      if (hasDualPosition && isPinned) {
        const scrollContainer = typeof document !== 'undefined'
          ? document.querySelector('[data-tabletop="true"]') as HTMLElement
          : null;
        const currentScrollLeft = scrollContainer?.scrollLeft || 0;
        const currentScrollTop = scrollContainer?.scrollTop || 0;

        if (isMinimizing) {
          // Collapsing: save current expanded position as expandedPinnedPosition if not set
          if (!(obj as any).expandedPinnedPosition) {
            (newObj as any).expandedPinnedPosition = {
              x: obj.x - currentScrollLeft,
              y: obj.y - currentScrollTop
            };
          }

          // Save expanded state for size restoration
          (newObj as any).expandedState = {
            x: obj.x,
            y: obj.y,
            width: obj.width,
            height: obj.height,
          };

          // Move to collapsed pinned position (or stay in place if none set yet)
          if ((obj as any).collapsedPinnedPosition) {
            (newObj as any).x = (obj as any).collapsedPinnedPosition.x + currentScrollLeft;
            (newObj as any).y = (obj as any).collapsedPinnedPosition.y + currentScrollTop;
          }
        } else {
          // Expanding: save current collapsed position as collapsedPinnedPosition if not set
          if (!(obj as any).collapsedPinnedPosition) {
            (newObj as any).collapsedPinnedPosition = {
              x: obj.x - currentScrollLeft,
              y: obj.y - currentScrollTop
            };
          }

          // Move to expanded pinned position
          if ((obj as any).expandedPinnedPosition) {
            (newObj as any).x = (obj as any).expandedPinnedPosition.x + currentScrollLeft;
            (newObj as any).y = (obj as any).expandedPinnedPosition.y + currentScrollTop;
          }

          // Restore size if we have saved state
          if ((obj as any).expandedState) {
            newObj.width = (obj as any).expandedState.width;
            newObj.height = (obj as any).expandedState.height;
          }
        }

        // Update legacy pinnedScreenPosition to match current state
        (newObj as any).pinnedScreenPosition = {
          x: newObj.x - currentScrollLeft,
          y: newObj.y - currentScrollTop
        };
      }

      return {
        ...state,
        objects: {
          ...state.objects,
          [action.payload.id]: newObj,
        },
      };
    }
    case 'RESIZE_UI_OBJECT': {
      const obj = state.objects[action.payload.id];
      if (!obj || (obj.type !== ItemType.PANEL && obj.type !== ItemType.WINDOW)) return state;

      // For panels and windows, resize is a local-only operation
      // Skip network sync for resize operations
      if (!action._localOnly) {
        // Mark as local-only to prevent network sync
        action._localOnly = true;
      }

      return {
        ...state,
        objects: {
          ...state.objects,
          [action.payload.id]: {
            ...obj,
            width: action.payload.width,
            height: action.payload.height,
          } as PanelObject | WindowObject,
        },
      };
    }
    case 'SPAWN_TOKEN_FROM_ARCHETYPE': {
      const archetype = state.objects[action.payload.archetypeId] as TokenType;
      if (!archetype || archetype.type !== ItemType.TOKEN_TYPE) return state;

      // Get current spawn count or start at 0
      const currentCount = archetype.spawnCount || 0;

      // Determine hyperscale layer for spawned token - always use 'tokens' layer for token copies
      let hyperscaleLayerId = 'tokens';

      // NEW: Use smart z-index allocation with defragmentation support
      // This ensures spawned tokens always get a valid z-index above existing objects
      const { allocateZIndexInHyperslice, defragmentHyperslice } = require('../utils/zIndexAllocator');
      const allocation = allocateZIndexInHyperslice(
        state.objects,
        hyperscaleLayerId,
        state.hyperscaleLayers
      );

      let newZ: number;
      let objectsToUpdate: Record<string, TableObject> = {};

      if (allocation.needsDefragmentation) {
        // Defragment the layer to free up space
        const newZIndices = defragmentHyperslice(
          state.objects,
          hyperscaleLayerId,
          state.hyperscaleLayers
        );

        // Apply defragmentation to all objects in the layer
        for (const [objId, newZIndex] of Object.entries(newZIndices)) {
          const obj = state.objects[objId];
          if (obj) {
            objectsToUpdate[objId] = { ...obj, zIndex: newZIndex };
          }
        }

        // After defragmentation, allocate at the next available position
        const layer = state.hyperscaleLayers.find(l => l.id === hyperscaleLayerId);
        const layerMinZ = layer?.minZIndex ?? 1;
        newZ = layerMinZ + Object.keys(newZIndices).length;
      } else {
        newZ = allocation.allocatedZIndex;
      }

      // Generate new token based on archetype settings
      const tokenId = generateUUID();

      const newToken: Token = {
        id: tokenId,
        type: ItemType.TOKEN,
        shape: archetype.shape,
        name: archetype.autoName && archetype.namePrefix
          ? `${archetype.namePrefix} ${currentCount + 1}`
          : archetype.name,
        x: action.payload.x,
        y: action.payload.y,
        width: archetype.defaultSize?.width ?? archetype.width,
        height: archetype.defaultSize?.height ?? archetype.height,
        rotation: 0,
        content: archetype.content,
        color: archetype.color,
        locked: false,
        isOnTable: true,
        zIndex: newZ,
        hyperscaleLayerId,
        archetypeId: archetype.id,
        // Inherit action settings from archetype
        allowedActions: archetype.allowedActions,
        allowedActionsForGM: archetype.allowedActionsForGM,
        actionButtons: archetype.actionButtons,
        singleClickAction: archetype.singleClickAction,
        doubleClickAction: archetype.doubleClickAction,
        rotationStep: archetype.rotationStep,
      };

      // Increment spawn count on archetype
      const updatedArchetype = {
        ...archetype,
        spawnCount: currentCount + 1
      };

      // Add to general history
      const historyEntry: GeneralHistoryEntry = {
        type: 'token-spawned',
        objectId: tokenId,
        archetypeId: archetype.id,
        archetypePreviousSpawnCount: currentCount,
      };
      const newGeneralHistory = [...state.undo.generalHistory, historyEntry].slice(-100);

      // Build the updated objects map with defragmented objects
      const updatedObjects: Record<string, TableObject> = {
        ...state.objects,
        [archetype.id]: updatedArchetype,
        [tokenId]: newToken,
      };

      // Apply defragmentation changes if any
      for (const [objId, updatedObj] of Object.entries(objectsToUpdate)) {
        updatedObjects[objId] = updatedObj;
      }

      return {
        ...state,
        objects: updatedObjects,
        undo: { ...state.undo, generalHistory: newGeneralHistory },
      };
    }
    case 'CREATE_DRAWING_OBJECT': {
      const { strokes, x, y, width, height, name, opacity } = action.payload;

      // Calculate bounds from strokes
      const drawingId = `drawing-${Date.now()}`;

      // Get max zIndex in drawings layer
      const drawingsLayerId = 'drawings';
      const drawingsLayer = state.hyperscaleLayers.find(l => l.id === drawingsLayerId);
      const layerMinZ = drawingsLayer?.minZIndex ?? 6001;
      const layerMaxZ = drawingsLayer?.maxZIndex ?? 7000;
      const layerObjects = Object.values(state.objects).filter(o => o.hyperscaleLayerId === drawingsLayerId);
      const maxLayerZ = layerObjects.length > 0 ? Math.max(...layerObjects.map(o => o.zIndex || 0)) : layerMinZ;
      const newZ = Math.min(maxLayerZ + 1, layerMaxZ);

      const drawing: Drawing = {
        id: drawingId,
        type: ItemType.DRAWING,
        x,
        y,
        rotation: 0,
        width,
        height,
        content: '',
        name: name || `Drawing ${Object.keys(state.objects).length + 1}`,
        locked: false,
        isOnTable: true,
        strokes,
        bounds: { x: 0, y: 0, width, height },
        opacity,
        hyperscaleLayerId: drawingsLayerId,
        zIndex: newZ,
      };

      // Add to marker history (max 10)
      const historyEntry: MarkerHistoryEntry = {
        type: 'drawing-created',
        drawingId,
        drawing,
      };
      const newMarkerHistory = [...state.undo.markerHistory, historyEntry].slice(-10);

      return {
        ...state,
        objects: {
          ...state.objects,
          [drawingId]: drawing,
        },
        undo: {
          ...state.undo,
          markerHistory: newMarkerHistory,
        },
      };
    }
    case 'ADD_STROKE_TO_DRAWING': {
      const { drawingId, stroke } = action.payload;
      const drawing = state.objects[drawingId];
      if (!drawing || drawing.type !== ItemType.DRAWING) return state;

      // Add to marker history (max 10)
      const historyEntry: MarkerHistoryEntry = {
        type: 'stroke-added',
        drawingId,
        strokeId: stroke.id,
        stroke,
      };
      const newMarkerHistory = [...state.undo.markerHistory, historyEntry].slice(-10);

      return {
        ...state,
        objects: {
          ...state.objects,
          [drawingId]: {
            ...drawing,
            strokes: [...drawing.strokes, stroke],
          },
        },
        undo: {
          ...state.undo,
          markerHistory: newMarkerHistory,
        },
      };
    }
    case 'MERGE_DRAWINGS': {
      const { sourceId, targetId } = action.payload;
      const sourceDrawing = state.objects[sourceId];
      const targetDrawing = state.objects[targetId];

      if (!sourceDrawing || !targetDrawing ||
          sourceDrawing.type !== ItemType.DRAWING ||
          targetDrawing.type !== ItemType.DRAWING) {
        return state;
      }

      // Store target before merge for undo
      const targetBeforeMerge = { ...targetDrawing as Drawing };

      // IMPORTANT: sourceDrawing.strokes are in sourceDrawing's local coordinates
      // Need to convert them to targetDrawing's local coordinates
      // Calculate offset from source world position to target world position
      const offsetX = sourceDrawing.x - targetDrawing.x;
      const offsetY = sourceDrawing.y - targetDrawing.y;

      const convertedSourceStrokes = sourceDrawing.strokes.map(stroke => ({
        ...stroke,
        id: `${stroke.id}-merged`, // New ID to avoid conflicts
        points: stroke.points.map(p => ({
          x: p.x + offsetX, // Convert from source local to target local
          y: p.y + offsetY
        }))
      }));

      // Merge strokes from source into target
      const mergedDrawing: Drawing = {
        ...targetDrawing,
        strokes: [...targetDrawing.strokes, ...convertedSourceStrokes],
      };

      // Remove source drawing
      const { [sourceId]: removed, ...remainingObjects } = state.objects;

      // Add to marker history (max 10)
      const historyEntry: MarkerHistoryEntry = {
        type: 'drawings-merged',
        mergedIntoId: targetId,
        sourceDrawings: [sourceDrawing as Drawing],
        targetDrawingBeforeMerge: targetBeforeMerge,
      };
      const newMarkerHistory = [...state.undo.markerHistory, historyEntry].slice(-10);

      return {
        ...state,
        objects: {
          ...remainingObjects,
          [targetId]: mergedDrawing,
        },
        undo: {
          ...state.undo,
          markerHistory: newMarkerHistory,
        },
      };
    }
    case 'ADD_STROKE': {
      const { stroke, layerId } = action.payload;
      const layer = state.drawings.layers.find(l => l.id === layerId);
      if (!layer) return state;

      return {
        ...state,
        drawings: {
          ...state.drawings,
          layers: state.drawings.layers.map(l =>
            l.id === layerId
              ? { ...l, strokes: [...l.strokes, stroke] }
              : l
          )
        }
      };
    }
    case 'DELETE_STROKE': {
      const { strokeId, layerId } = action.payload;
      return {
        ...state,
        drawings: {
          ...state.drawings,
          layers: state.drawings.layers.map(l =>
            l.id === layerId
              ? { ...l, strokes: l.strokes.filter(s => s.id !== strokeId) }
              : l
          )
        }
      };
    }
    case 'CREATE_DRAWING_LAYER': {
      const newLayer: DrawingLayer = {
        id: generateUUID(),
        ...action.payload
      };

      return {
        ...state,
        drawings: {
          ...state.drawings,
          layers: [...state.drawings.layers, newLayer]
        }
      };
    }
    case 'DELETE_DRAWING_LAYER': {
      return {
        ...state,
        drawings: {
          ...state.drawings,
          layers: state.drawings.layers.filter(l => l.id !== action.payload.layerId)
        }
      };
    }
    case 'UPDATE_DRAWING_LAYER': {
      const { layerId, updates } = action.payload;

      return {
        ...state,
        drawings: {
          ...state.drawings,
          layers: state.drawings.layers.map(l =>
            l.id === layerId ? { ...l, ...updates } : l
          )
        }
      };
    }
    case 'CLEAR_DRAWING_LAYER': {
      return {
        ...state,
        drawings: {
          ...state.drawings,
          layers: state.drawings.layers.map(l =>
            l.id === action.payload.layerId
              ? { ...l, strokes: [] }
              : l
          )
        }
      };
    }
    case 'UNDO_MARKER': {
      if (state.undo.markerHistory.length === 0) return state;

      const lastEntry = state.undo.markerHistory[state.undo.markerHistory.length - 1];
      const newHistory = state.undo.markerHistory.slice(0, -1);

      switch (lastEntry.type) {
        case 'drawing-created': {
          // Delete the drawing
          const { [lastEntry.drawingId]: removed, ...remainingObjects } = state.objects;
          return {
            ...state,
            objects: remainingObjects,
            undo: { ...state.undo, markerHistory: newHistory },
          };
        }
        case 'stroke-added': {
          // Remove the stroke from the drawing
          const drawing = state.objects[lastEntry.drawingId];
          if (!drawing || drawing.type !== ItemType.DRAWING) return state;
          return {
            ...state,
            objects: {
              ...state.objects,
              [lastEntry.drawingId]: {
                ...drawing,
                strokes: drawing.strokes.filter(s => s.id !== lastEntry.strokeId),
              },
            },
            undo: { ...state.undo, markerHistory: newHistory },
          };
        }
        case 'drawing-deleted': {
          // Restore the drawing
          return {
            ...state,
            objects: {
              ...state.objects,
              [lastEntry.drawing.id]: lastEntry.drawing,
            },
            undo: { ...state.undo, markerHistory: newHistory },
          };
        }
        case 'drawings-merged': {
          // Unmerge: delete the merged drawing, restore all source drawings and restore target to previous state
          const { [lastEntry.mergedIntoId]: mergedRemoved, ...remainingObjects } = state.objects;
          let restoredObjects = { ...remainingObjects };

          // Restore all source drawings
          for (const drawing of lastEntry.sourceDrawings) {
            restoredObjects[drawing.id] = drawing;
          }

          // Restore target to previous state
          restoredObjects[lastEntry.targetDrawingBeforeMerge.id] = lastEntry.targetDrawingBeforeMerge;

          return {
            ...state,
            objects: restoredObjects,
            undo: { ...state.undo, markerHistory: newHistory },
          };
        }
        default:
          return state;
      }
    }
    case 'UNDO_GENERAL': {
      if (state.undo.generalHistory.length === 0) return state;

      const lastEntry = state.undo.generalHistory[state.undo.generalHistory.length - 1];
      const newHistory = state.undo.generalHistory.slice(0, -1);

      switch (lastEntry.type) {
        case 'object-added': {
          // Delete the object
          const { [lastEntry.objectId]: removed, ...remainingObjects } = state.objects;
          return {
            ...state,
            objects: remainingObjects,
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'object-deleted': {
          // Restore the object and any cascaded deletes
          const restoredObjects = { ...state.objects, [lastEntry.objectId]: lastEntry.object };
          if (lastEntry.cascadedDeletes) {
            for (const obj of lastEntry.cascadedDeletes) {
              restoredObjects[obj.id] = obj;
            }
          }
          return {
            ...state,
            objects: restoredObjects,
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'object-moved': {
          const obj = state.objects[lastEntry.objectId];
          if (!obj) return state;
          return {
            ...state,
            objects: {
              ...state.objects,
              [lastEntry.objectId]: { ...obj, x: lastEntry.previousX, y: lastEntry.previousY },
            },
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'object-updated': {
          const obj = state.objects[lastEntry.objectId];
          if (!obj) return state;
          return {
            ...state,
            objects: {
              ...state.objects,
              [lastEntry.objectId]: { ...obj, ...lastEntry.previousValues },
            } as Record<string, TableObject>,
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'object-rotated': {
          const obj = state.objects[lastEntry.objectId];
          if (!obj) return state;
          return {
            ...state,
            objects: {
              ...state.objects,
              [lastEntry.objectId]: { ...obj, rotation: lastEntry.previousRotation },
            },
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'object-lock-toggled': {
          const obj = state.objects[lastEntry.objectId];
          if (!obj) return state;
          return {
            ...state,
            objects: {
              ...state.objects,
              [lastEntry.objectId]: { ...obj, locked: lastEntry.previousLocked },
            },
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'object-on-table-toggled': {
          const obj = state.objects[lastEntry.objectId];
          if (!obj) return state;
          return {
            ...state,
            objects: {
              ...state.objects,
              [lastEntry.objectId]: { ...obj, isOnTable: lastEntry.previousIsOnTable },
            } as Record<string, TableObject>,
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'object-layer-changed': {
          const obj = state.objects[lastEntry.objectId];
          if (!obj) return state;

          // Restore previous zIndex values for both objects
          const updatedObjects: Record<string, TableObject> = {
            ...state.objects,
            [lastEntry.objectId]: { ...obj, zIndex: lastEntry.previousZIndex ?? obj.zIndex },
          };

          if (lastEntry.otherObjectId && lastEntry.otherObjectPreviousZIndex !== undefined) {
            const otherObj = state.objects[lastEntry.otherObjectId];
            if (otherObj) {
              updatedObjects[lastEntry.otherObjectId] = { ...otherObj, zIndex: lastEntry.otherObjectPreviousZIndex };
            }
          }

          return {
            ...state,
            objects: updatedObjects,
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'counter-updated': {
          const counter = state.objects[lastEntry.objectId] as Counter;
          if (!counter || counter.type !== ItemType.COUNTER) return state;
          return {
            ...state,
            objects: {
              ...state.objects,
              [lastEntry.objectId]: { ...counter, value: lastEntry.previousValue },
            },
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'object-pinned': {
          const obj = state.objects[lastEntry.objectId];
          if (!obj) return state;
          const updatedObj: any = { ...obj };
          if (lastEntry.previousPinnedToViewport !== undefined) {
            updatedObj.isPinnedToViewport = lastEntry.previousPinnedToViewport;
          } else {
            delete updatedObj.isPinnedToViewport;
          }
          if (lastEntry.previousScreenPosition !== undefined) {
            updatedObj.pinnedScreenPosition = lastEntry.previousScreenPosition;
          } else {
            delete updatedObj.pinnedScreenPosition;
          }
          return {
            ...state,
            objects: {
              ...state.objects,
              [lastEntry.objectId]: updatedObj,
            },
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'object-unpinned': {
          const obj = state.objects[lastEntry.objectId];
          if (!obj) return state;
          return {
            ...state,
            objects: {
              ...state.objects,
              [lastEntry.objectId]: {
                ...obj,
                x: lastEntry.previousX,
                y: lastEntry.previousY,
                isPinnedToViewport: lastEntry.previousPinnedToViewport,
                ...(lastEntry.previousScreenPosition && { pinnedScreenPosition: lastEntry.previousScreenPosition }),
              } as any,
            },
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'token-spawned': {
          // Delete the spawned token
          const { [lastEntry.objectId]: removed, ...remainingObjects } = state.objects;

          // Also restore archetype's spawn count
          if (lastEntry.archetypePreviousSpawnCount !== undefined) {
            const archetype = remainingObjects[lastEntry.archetypeId] as TokenType;
            if (archetype && archetype.type === ItemType.TOKEN_TYPE) {
              remainingObjects[lastEntry.archetypeId] = {
                ...archetype,
                spawnCount: lastEntry.archetypePreviousSpawnCount,
              };
            }
          }

          return {
            ...state,
            objects: remainingObjects,
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'card-flipped': {
          const card = state.objects[lastEntry.cardId];
          if (!card || card.type !== ItemType.CARD) return state;
          return {
            ...state,
            objects: {
              ...state.objects,
              [lastEntry.cardId]: { ...card, faceUp: lastEntry.previousFaceUp },
            },
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'card-drawn': {
          const card = state.objects[lastEntry.cardId];
          const deck = state.objects[lastEntry.fromDeckId];
          if (!card || !deck || deck.type !== ItemType.DECK) return state;

          // Remove card from deck's cardIds and insert at previous position
          const newCardIds = [...deck.cardIds];
          newCardIds.splice(lastEntry.fromIndex, 0, lastEntry.cardId);

          // Update card location and position
          return {
            ...state,
            objects: {
              ...state.objects,
              [lastEntry.cardId]: {
                ...card,
                location: lastEntry.previousLocation,
              },
              [lastEntry.fromDeckId]: {
                ...deck,
                cardIds: newCardIds,
              },
            } as Record<string, TableObject>,
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'card-played': {
          const card = state.objects[lastEntry.cardId];
          if (!card || card.type !== ItemType.CARD) return state;

          return {
            ...state,
            objects: {
              ...state.objects,
              [lastEntry.cardId]: {
                ...card,
                location: lastEntry.previousLocation,
                x: lastEntry.previousX ?? card.x,
                y: lastEntry.previousY ?? card.y,
                faceUp: lastEntry.previousFaceUp ?? card.faceUp,
              },
            },
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'card-played-from-top': {
          const card = state.objects[lastEntry.cardId] as Card;
          const deck = state.objects[lastEntry.deckId] as Deck;
          if (!card || !deck || deck.type !== ItemType.DECK) return state;

          return {
            ...state,
            objects: {
              ...state.objects,
              [lastEntry.deckId]: {
                ...deck,
                cardIds: lastEntry.previousCardIds,
              },
              [lastEntry.cardId]: {
                ...card,
                location: lastEntry.previousLocation,
                faceUp: lastEntry.previousFaceUp,
                isOnTable: lastEntry.previousLocation !== CardLocation.CURSOR_SLOT,
              },
            },
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'dropped-from-cursor-slot': {
          const obj = state.objects[lastEntry.objectId];
          if (!obj) return state;

          return {
            ...state,
            objects: {
              ...state.objects,
              [lastEntry.objectId]: {
                ...obj,
                x: lastEntry.previousX ?? obj.x,
                y: lastEntry.previousY ?? obj.y,
                ...(lastEntry.previousZIndex !== undefined && { zIndex: lastEntry.previousZIndex }),
                ...(lastEntry.previousInCursorSlot !== undefined && { inCursorSlot: lastEntry.previousInCursorSlot }),
                // For cards, restore previous location
                ...(obj.type === ItemType.CARD && {
                  location: lastEntry.previousLocation,
                  isOnTable: lastEntry.previousLocation === CardLocation.TABLE,
                }),
              },
            },
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'card-returned-to-deck': {
          const card = state.objects[lastEntry.cardId];
          const deck = state.objects[lastEntry.deckId];
          if (!card || !deck || deck.type !== ItemType.DECK) return state;

          // Remove from deck's cardIds
          const newCardIds = deck.cardIds.filter(id => id !== lastEntry.cardId);

          return {
            ...state,
            objects: {
              ...state.objects,
              [lastEntry.cardId]: {
                ...card,
                location: lastEntry.previousLocation,
                x: lastEntry.previousX ?? card.x,
                y: lastEntry.previousY ?? card.y,
              },
              [lastEntry.deckId]: {
                ...deck,
                cardIds: newCardIds,
              },
            } as Record<string, TableObject>,
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'deck-shuffled': {
          const deck = state.objects[lastEntry.deckId];
          if (!deck || deck.type !== ItemType.DECK) return state;

          return {
            ...state,
            objects: {
              ...state.objects,
              [lastEntry.deckId]: {
                ...deck,
                cardIds: lastEntry.previousCardOrder,
              },
            },
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'card-added-to-pile': {
          const card = state.objects[lastEntry.cardId] as Card;
          const deck = state.objects[lastEntry.deckId] as Deck;
          if (!card || !deck || deck.type !== ItemType.DECK) return state;

          // Restore card's location and deck/pile state
          const updatedCard: Card = {
            ...card,
            location: lastEntry.previousLocation,
            ...(lastEntry.previousX !== undefined && { x: lastEntry.previousX }),
            ...(lastEntry.previousY !== undefined && { y: lastEntry.previousY }),
          };

          const newObjects: Record<string, TableObject> = {
            ...state.objects,
            [lastEntry.cardId]: updatedCard,
          };

          // Restore deck cardIds if they were changed
          if (lastEntry.previousDeckCardIds) {
            newObjects[lastEntry.deckId] = {
              ...deck,
              cardIds: lastEntry.previousDeckCardIds,
            };
          }

          // Restore pile cardIds
          if (lastEntry.previousPileCardIds) {
            const updatedPiles = deck.piles?.map(p =>
              p.id === lastEntry.pileId
                ? { ...p, cardIds: lastEntry.previousPileCardIds }
                : p
            ) as CardPile[] | undefined;
            newObjects[lastEntry.deckId] = {
              ...(newObjects[lastEntry.deckId] as Deck),
              piles: updatedPiles || deck.piles,
            } as TableObject;
          }

          return {
            ...state,
            objects: newObjects as Record<string, TableObject>,
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'card-drawn-from-pile': {
          const card = state.objects[lastEntry.cardId] as Card;
          const deck = state.objects[lastEntry.deckId] as Deck;
          if (!card || !deck || deck.type !== ItemType.DECK) return state;

          // Find the pile
          const pile = deck.piles?.find(p => p.id === lastEntry.pileId);
          if (!pile) return state;

          // Restore card to pile
          const restoredPileCardIds = [...pile.cardIds];
          restoredPileCardIds.splice(lastEntry.fromIndex, 0, lastEntry.cardId);

          const updatedPiles = deck.piles?.map(p =>
            p.id === lastEntry.pileId
              ? { ...p, cardIds: restoredPileCardIds }
              : p
          ) as CardPile[] | undefined;

          // Update card location
          const updatedCard: Card = {
            ...card,
            location: lastEntry.previousLocation,
          };

          return {
            ...state,
            objects: {
              ...state.objects,
              [lastEntry.deckId]: { ...deck, piles: updatedPiles } as TableObject,
              [lastEntry.cardId]: updatedCard,
            },
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'card-returned-to-top': {
          const card = state.objects[lastEntry.cardId] as Card;
          const toDeck = state.objects[lastEntry.toDeckId] as Deck;
          if (!card || !toDeck || toDeck.type !== ItemType.DECK) return state;

          const newObjects: Record<string, TableObject> = { ...state.objects };

          // Restore card's location and properties
          const updatedCard: Card = {
            ...card,
            location: lastEntry.previousLocation,
            ...(lastEntry.previousX !== undefined && { x: lastEntry.previousX }),
            ...(lastEntry.previousY !== undefined && { y: lastEntry.previousY }),
            ...(lastEntry.previousFaceUp !== undefined && { faceUp: lastEntry.previousFaceUp }),
          };
          newObjects[lastEntry.cardId] = updatedCard;

          // Restore toDeck cardIds
          if (lastEntry.toCardIds) {
            newObjects[lastEntry.toDeckId] = {
              ...toDeck,
              cardIds: lastEntry.toCardIds,
            };
          }

          // Restore fromDeck cardIds if different from toDeck
          if (lastEntry.fromDeckId && lastEntry.fromDeckId !== lastEntry.toDeckId && lastEntry.fromCardIds) {
            const fromDeck = state.objects[lastEntry.fromDeckId] as Deck;
            if (fromDeck) {
              newObjects[lastEntry.fromDeckId] = {
                ...fromDeck,
                cardIds: lastEntry.fromCardIds,
              };
            }
          }

          // Restore fromPile cardIds
          if (lastEntry.fromPileId && lastEntry.fromPileCardIds) {
            const fromDeck = state.objects[lastEntry.fromDeckId] as Deck;
            if (fromDeck?.piles) {
              const updatedPiles = fromDeck.piles.map(p =>
                p.id === lastEntry.fromPileId
                  ? { ...p, cardIds: lastEntry.fromPileCardIds }
                  : p
              ) as CardPile[];
              newObjects[lastEntry.fromDeckId] = {
                ...fromDeck,
                piles: updatedPiles,
              };
            }
          }

          return {
            ...state,
            objects: newObjects,
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'card-returned-to-bottom': {
          const card = state.objects[lastEntry.cardId] as Card;
          const toDeck = state.objects[lastEntry.toDeckId] as Deck;
          if (!card || !toDeck || toDeck.type !== ItemType.DECK) return state;

          const newObjects: Record<string, TableObject> = { ...state.objects };

          // Restore card's location and properties
          const updatedCard: Card = {
            ...card,
            location: lastEntry.previousLocation,
            ...(lastEntry.previousX !== undefined && { x: lastEntry.previousX }),
            ...(lastEntry.previousY !== undefined && { y: lastEntry.previousY }),
            ...(lastEntry.previousFaceUp !== undefined && { faceUp: lastEntry.previousFaceUp }),
          };
          newObjects[lastEntry.cardId] = updatedCard;

          // Restore toDeck cardIds
          if (lastEntry.toCardIds) {
            newObjects[lastEntry.toDeckId] = {
              ...toDeck,
              cardIds: lastEntry.toCardIds,
            };
          }

          // Restore fromDeck cardIds if different from toDeck
          if (lastEntry.fromDeckId && lastEntry.fromDeckId !== lastEntry.toDeckId && lastEntry.fromCardIds) {
            const fromDeck = state.objects[lastEntry.fromDeckId] as Deck;
            if (fromDeck) {
              newObjects[lastEntry.fromDeckId] = {
                ...fromDeck,
                cardIds: lastEntry.fromCardIds,
              };
            }
          }

          // Restore fromPile cardIds
          if (lastEntry.fromPileId && lastEntry.fromPileCardIds) {
            const fromDeck = state.objects[lastEntry.fromDeckId] as Deck;
            if (fromDeck?.piles) {
              const updatedPiles = fromDeck.piles.map(p =>
                p.id === lastEntry.fromPileId
                  ? { ...p, cardIds: lastEntry.fromPileCardIds }
                  : p
              ) as CardPile[];
              newObjects[lastEntry.fromDeckId] = {
                ...fromDeck,
                piles: updatedPiles,
              };
            }
          }

          return {
            ...state,
            objects: newObjects,
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'card-added-to-top': {
          const card = state.objects[lastEntry.cardId] as Card;
          const toDeck = state.objects[lastEntry.toDeckId] as Deck;
          if (!card || !toDeck || toDeck.type !== ItemType.DECK) return state;

          const newObjects: Record<string, TableObject> = { ...state.objects };

          // Restore card's location and properties
          const updatedCard: Card = {
            ...card,
            location: lastEntry.previousLocation,
            ...(lastEntry.previousX !== undefined && { x: lastEntry.previousX }),
            ...(lastEntry.previousY !== undefined && { y: lastEntry.previousY }),
            ...(lastEntry.previousFaceUp !== undefined && { faceUp: lastEntry.previousFaceUp }),
          };
          newObjects[lastEntry.cardId] = updatedCard;

          // Restore toDeck cardIds
          if (lastEntry.toCardIds) {
            newObjects[lastEntry.toDeckId] = {
              ...toDeck,
              cardIds: lastEntry.toCardIds,
            };
          }

          // Restore fromDeck cardIds if different from toDeck
          if (lastEntry.fromDeckId && lastEntry.fromDeckId !== lastEntry.toDeckId && lastEntry.fromCardIds) {
            const fromDeck = state.objects[lastEntry.fromDeckId] as Deck;
            if (fromDeck) {
              newObjects[lastEntry.fromDeckId] = {
                ...fromDeck,
                cardIds: lastEntry.fromCardIds,
              };
            }
          }

          return {
            ...state,
            objects: newObjects,
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'card-milled-to-bottom': {
          const deck = state.objects[lastEntry.deckId] as Deck;
          if (!deck || deck.type !== ItemType.DECK) return state;

          return {
            ...state,
            objects: {
              ...state.objects,
              [lastEntry.deckId]: {
                ...deck,
                cardIds: lastEntry.previousCardIds,
              },
            },
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        case 'card-milled-to-pile': {
          const deck = state.objects[lastEntry.deckId] as Deck;
          if (!deck || deck.type !== ItemType.DECK) return state;

          const updatedPiles = deck.piles?.map(p =>
            p.id === lastEntry.pileId
              ? { ...p, cardIds: lastEntry.previousPileCardIds }
              : p
          );

          return {
            ...state,
            objects: {
              ...state.objects,
              [lastEntry.deckId]: {
                ...deck,
                cardIds: lastEntry.previousDeckCardIds,
                piles: updatedPiles,
              },
            },
            undo: { ...state.undo, generalHistory: newHistory },
          };
        }
        default:
          return state;
      }
    }
    case 'UPDATE_PLAYER_PANEL_SETTINGS': {
      // Store individual panel settings for a player (host only)
      // All updates are saved immediately - no throttling to prevent UI lag
      const { playerId, panelId, settings } = action.payload;

      // Initialize player settings if not exists
      if (!state.playerPanelSettings[playerId]) {
        return {
          ...state,
          playerPanelSettings: {
            ...state.playerPanelSettings,
            [playerId]: {
              [panelId]: settings
            },
          },
        };
      }

      // Update panel settings for this player
      return {
        ...state,
        playerPanelSettings: {
          ...state.playerPanelSettings,
          [playerId]: {
            ...state.playerPanelSettings[playerId],
            [panelId]: {
              ...(state.playerPanelSettings[playerId][panelId] || {}),
              ...settings
            }
          }
        },
      };
    }
    case 'REQUEST_PLAYER_PANEL_SETTINGS': {
      // Guest requests their panel settings from host
      // This should only be processed by host, guests ignore it
      // Note: This action is filtered at dispatch level based on isHost status

      // The actual delivery will happen via the peer connection
      // For now, we'll just return the current state
      return state;
    }
    case 'APPLY_PLAYER_PANEL_SETTINGS': {
      // Apply individual panel settings directly to panels (used when guest receives their settings from host)
      // This bypasses the regular UPDATE_OBJECT zIndex clamping to preserve individual layer positions
      const { settings } = action.payload;

      // Update panels with individual settings
      const updatedObjects = { ...state.objects };
      Object.entries(settings).forEach(([panelId, panelSettings]: [string, any]) => {
        if (updatedObjects[panelId] && (updatedObjects[panelId].type === ItemType.PANEL || updatedObjects[panelId].type === ItemType.WINDOW)) {
          updatedObjects[panelId] = {
            ...updatedObjects[panelId],
            ...panelSettings
          };
        }
      });

      // Also save to playerPanelSettings so they persist and are used in rendering
      const currentPlayerId = state.activePlayerId;

      return {
        ...state,
        objects: updatedObjects,
        playerPanelSettings: {
          ...state.playerPanelSettings,
          [currentPlayerId]: {
            ...(state.playerPanelSettings[currentPlayerId] || {}),
            ...settings
          }
        }
      };
    }
    case 'APPLY_SAVED_PANEL_SETTINGS': {
      // Apply player panel settings from saved game state (used when loading from file)
      // This restores all players' panel settings from the save file AND applies them to panel objects
      const { playerPanelSettings: savedPanelSettings } = action.payload;

      // Apply settings to panel objects for the current player
      const currentPlayerId = state.activePlayerId;
      const currentPanelSettings = savedPanelSettings[currentPlayerId] || {};

      const updatedObjects = { ...state.objects };
      Object.entries(currentPanelSettings).forEach(([panelId, panelSettings]: [string, any]) => {
        if (updatedObjects[panelId] && (updatedObjects[panelId].type === ItemType.PANEL || updatedObjects[panelId].type === ItemType.WINDOW)) {
          updatedObjects[panelId] = {
            ...updatedObjects[panelId],
            ...panelSettings
          };
        }
      });

      return {
        ...state,
        objects: updatedObjects,
        playerPanelSettings: {
          ...state.playerPanelSettings,
          ...savedPanelSettings
        }
      };
    }
    case 'CLEAR_SAVED_STATE': {
      // Clear ALL saved data from localStorage including URL parameters
      clearAllData();

      // Reset to initial state but preserve current language
      const resetState = {
        ...initialState,
        language: state.language, // Preserve language setting
      };
      return resetState;
    }
    // Audit log actions
    case 'ADD_AUDIT_LOG_ENTRY': {
      const entry = action.payload;
      const newEntries = [...state.auditLog.entries, entry].slice(-state.auditLog.maxEntries);
      return {
        ...state,
        auditLog: {
          ...state.auditLog,
          entries: newEntries,
          currentReplayIndex: newEntries.length - 1,
        },
      };
    }
    case 'ADD_HYPERSCALE_LAYER': {
      const newLayer: HyperscaleLayer = {
        ...action.payload,
        id: generateUUID()
      };
      return {
        ...state,
        hyperscaleLayers: [...state.hyperscaleLayers, newLayer]
      };
    }
    case 'UPDATE_HYPERSCALE_LAYER': {
      return {
        ...state,
        hyperscaleLayers: state.hyperscaleLayers.map(l =>
          l.id === action.payload.layerId
            ? { ...l, ...action.payload.updates }
            : l
        )
      };
    }
    case 'DELETE_HYPERSCALE_LAYER': {
      // Check if there are any objects on this layer
      const hasObjects = Object.values(state.objects).some(
        obj => obj.hyperscaleLayerId === action.payload.layerId
      );
      if (hasObjects) {
        return state; // Cannot delete layer with objects
      }
      return {
        ...state,
        hyperscaleLayers: state.hyperscaleLayers.filter(l => l.id !== action.payload.layerId),
        selectedHyperscaleLayerIds: state.selectedHyperscaleLayerIds.filter(id => id !== action.payload.layerId)
      };
    }
    case 'SET_HYPERSCALE_LAYERS': {
      return {
        ...state,
        selectedHyperscaleLayerIds: action.payload.layerIds
      };
    }
    case 'MOVE_OBJECT_TO_HYPERSCALE_LAYER': {
      const obj = state.objects[action.payload.objectId];
      if (!obj) return state;

      const targetLayer = state.hyperscaleLayers.find(l => l.id === action.payload.layerId);
      if (!targetLayer) return state;

      // Get all objects in target layer (excluding the moving object)
      const targetLayerObjects = Object.values(state.objects).filter(o =>
        o.hyperscaleLayerId === action.payload.layerId && o.id !== obj.id
      );

      // Defragment: sort by zIndex and reassign to fill gaps from minZIndex
      const sortedTargetObjects = targetLayerObjects.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

      const newObjects = { ...state.objects };

      // Reassign zIndex to compact the layer (fill gaps)
      sortedTargetObjects.forEach((layerObj, index) => {
        const newZ = targetLayer.minZIndex + index;
        if (newZ <= targetLayer.maxZIndex) {
          newObjects[layerObj.id] = { ...layerObj, zIndex: newZ };
        }
      });

      // Calculate zIndex for moved object (after defragmentation)
      const newZ = Math.min(
        targetLayer.minZIndex + sortedTargetObjects.length,
        targetLayer.maxZIndex
      );

      newObjects[action.payload.objectId] = {
        ...obj,
        hyperscaleLayerId: action.payload.layerId,
        zIndex: newZ
      };

      return {
        ...state,
        objects: newObjects
      };
    }
    case 'ADD_DICE_GROUP': {
      return {
        ...state,
        diceGroups: [...state.diceGroups, action.payload.group]
      };
    }
    case 'UPDATE_DICE_GROUP': {
      return {
        ...state,
        diceGroups: state.diceGroups.map(g =>
          g.id === action.payload.groupId
            ? { ...g, ...action.payload.updates }
            : g
        )
      };
    }
    case 'DELETE_DICE_GROUP': {
      // Remove group reference from all dice in the group
      const group = state.diceGroups.find(g => g.id === action.payload.groupId);
      const newObjects = { ...state.objects };
      if (group) {
        group.diceIds.forEach(diceId => {
          const dice = newObjects[diceId];
          if (dice && dice.type === 'DICE_OBJECT') {
            newObjects[diceId] = { ...dice, diceGroupId: undefined };
          }
        });
      }
      return {
        ...state,
        objects: newObjects,
        diceGroups: state.diceGroups.filter(g => g.id !== action.payload.groupId)
      };
    }
    case 'MOVE_DICE_TO_GROUP': {
      const { diceId, groupId } = action.payload;
      const dice = state.objects[diceId];
      if (!dice || dice.type !== 'DICE_OBJECT') return state;

      const newObjects = { ...state.objects };
      const newGroups = [...state.diceGroups];

      // Remove dice from previous group
      if (dice.diceGroupId) {
        const prevGroup = newGroups.find(g => g.id === dice.diceGroupId);
        if (prevGroup) {
          prevGroup.diceIds = prevGroup.diceIds.filter(id => id !== diceId);
        }
      }

      // Add dice to new group (if groupId is not null/undefined)
      if (groupId) {
        const newGroup = newGroups.find(g => g.id === groupId);
        if (newGroup && !newGroup.diceIds.includes(diceId)) {
          newGroup.diceIds = [...newGroup.diceIds, diceId];
        }
      }

      newObjects[diceId] = { ...dice, diceGroupId: groupId || undefined };

      return {
        ...state,
        objects: newObjects,
        diceGroups: newGroups
      };
    }
    case 'SET_PIVOT_POINT': {
      const { objectId, pivot } = action.payload;
      if (!state.objects[objectId]) {
        console.warn('[SET_PIVOT_POINT] Object not found:', objectId);
        return state;
      }

      console.log('[SET_PIVOT_POINT] Updating pivot for', objectId, 'to', pivot);

      return {
        ...state,
        objects: {
          ...state.objects,
          [objectId]: {
            ...state.objects[objectId],
            pivot
          }
        }
      };
    }
    case 'TOGGLE_PIVOT_EDITING': {
      const objectId = action.payload;
      if (!state.objects[objectId]) return state;

      return {
        ...state,
        objects: {
          ...state.objects,
          [objectId]: {
            ...state.objects[objectId],
            isEditingPivot: !(state.objects[objectId] as any).isEditingPivot
          }
        }
      };
    }
    case 'SET_HITBOX_POLYGON': {
      const { objectId, hitboxPolygon } = action.payload;
      if (!state.objects[objectId]) return state;

      return {
        ...state,
        objects: {
          ...state.objects,
          [objectId]: {
            ...state.objects[objectId],
            hitboxPolygon
          }
        }
      };
    }
    default:
      return state;
  }
};

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, localDispatch] = useReducer(gameReducer, initialState);

  // Initial loading state - only for slow operations
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [initialLoadSteps, setInitialLoadSteps] = useState<InitialLoadStep[]>([]);

  const addInitialLoadStep = (message: string, status: 'loading' | 'success' | 'warning' | 'error' = 'loading') => {
    setInitialLoadSteps(prev => {
      const lastStep = prev[prev.length - 1];
      if (lastStep && lastStep.status === 'loading') {
        return [...prev.slice(0, -1), { message, status }];
      }
      return [...prev, { message, status }];
    });
  };

  // Ref to track latest state for event listeners
  const stateRef = useRef(state);
  const initializedRef = useRef(false);
  const creatingMenuRef = useRef(false); // Track if menu creation is in progress
  // Manual P2P connection (PeerJS-compatible adapter for direct connection without PeerJS)
  const manualConnectionRef = useRef<any>(null);
  // Track which connection we've set up handlers for to prevent duplicates
  const manualConnectionSetupRef = useRef<string | null>(null);
  // Expose manual connection ref globally so MainMenuContent can set it
  (window as any).__setManualConnection = (conn: any) => {
    // Only update if it's a different connection
    if (conn && conn.peer !== manualConnectionSetupRef.current) {
      manualConnectionRef.current = conn;
    }
  };

  // Expose dispatch for dice roll animations
  (window as any).__diceRollDispatch = localDispatch;

  useEffect(() => {
      stateRef.current = state;
  }, [state]);

  // Peer.js connection management
  const { peerId, isHost, connectionStatus, waitingForPlayerName, setPlayerName, initializeHost, hostConnectionRef, connectionsRef, imageCachesRef } = usePeerConnection(localDispatch, stateRef);

  // Auto-save game state to localStorage (debounced)
  useAutoSave(state, isHost, initializedRef.current);

  // Update pixelsPerVU when window size changes
  useEffect(() => {
    const handleResize = () => {
      const newPixelsPerVU = calculatePixelsPerVU(window.innerWidth, window.innerHeight);
      localDispatch({
        type: 'SET_PIXELS_PER_VU',
        payload: { pixelsPerVU: newPixelsPerVU }
      });
    };

    // Recalculate on mount using requestAnimationFrame to ensure layout is stable
    // This fixes the issue where initial window.innerHeight is incorrect
    requestAnimationFrame(() => {
      // Double-check with another RAF to ensure browser has painted
      requestAnimationFrame(() => {
        handleResize();
      });
    });

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Initialize Default Board and Standard Deck (or load from storage)
  useEffect(() => {
    // Only initialize once we're sure about host status and haven't initialized yet
    if (!initializedRef.current && Object.keys(state.objects).length === 0) {
        const isGuest = !isHost;

        // Guests don't load from localStorage - they receive state from host
        if (isGuest) {
          initializedRef.current = true; // Set initialized flag for guests
          createMainMenu(localDispatch);
          setIsInitialLoading(false); // Guests don't need loading screen - they wait for host
          return;
        }

        // Try to load saved game state from localStorage (host only)
        const savedState = loadGameState(false);

        if (savedState && savedState.objects && Object.keys(savedState.objects).length > 0) {
          // Check if images need restoration (metadata or img_ref:// instead of actual images)
          const needsRestoration = Object.values(savedState.objects).some((obj: any) =>
            obj.content && (obj.content === 'B' || obj.content === 'D' ||
             obj.content.startsWith('{"t":') || obj.content.startsWith('{"type":') ||
             obj.content.startsWith('img_ref://'))
          );

          // Function to add objects to state
          // IMPORTANT: Add cards BEFORE decks to ensure deck.cardIds references exist
          const addObjects = (objects: Record<string, TableObject>) => {
            const objectValues = Object.values(objects);

            // Separate cards and decks for proper ordering
            const cards = objectValues.filter(obj => obj.type === ItemType.CARD);
            const decks = objectValues.filter(obj => obj.type === ItemType.DECK);
            const otherObjects = objectValues.filter(obj =>
              obj.type !== ItemType.CARD &&
              obj.type !== ItemType.DECK &&
              !(obj.type === ItemType.PANEL && (obj as PanelObject).panelType === PanelType.MAIN_MENU)
            );

            // Add cards first (so they exist when decks are added)
            cards.forEach(obj => localDispatch({ type: 'ADD_OBJECT', payload: obj }));

            // Then add decks (which reference cards via cardIds)
            decks.forEach(obj => localDispatch({ type: 'ADD_OBJECT', payload: obj }));

            // Finally add all other objects
            otherObjects.forEach(obj => localDispatch({ type: 'ADD_OBJECT', payload: obj }));
          };

          // Restore other state (drawings, players, etc.)
          const restoreOtherState = () => {
            const updates: any[] = [];

            // Restore drawings
            if (savedState.drawings) {
              updates.push({ type: 'SYNC_STATE', payload: { drawings: savedState.drawings } });
            }

            // Restore player permissions
            if (savedState.playerPermissions) {
              updates.push({ type: 'UPDATE_PLAYER_PERMISSIONS', payload: savedState.playerPermissions });
            }

            // Restore language
            if (savedState.language) {
              updates.push({ type: 'UPDATE_LANGUAGE', payload: savedState.language });
            }

            // Restore active player ID if different
            if (savedState.activePlayerId && savedState.activePlayerId !== state.activePlayerId) {
              updates.push({ type: 'SET_ACTIVE_ID', payload: savedState.activePlayerId });
            }

            // Restore view transform (zoom/pan) - only for host or single player
            if (savedState.viewTransform && !isGuest) {
              updates.push({ type: 'UPDATE_VIEW_TRANSFORM', payload: savedState.viewTransform });
            }

            // Restore players (merge with default players)
            if (savedState.players && savedState.players.length > 0) {
              const currentPlayers = state.players || [];
              savedState.players.forEach((player: Player) => {
                // Only add players that don't already exist (don't overwrite GM)
                if (player.id !== 'gm' && player.id !== 'gm-player' &&
                    !currentPlayers.find(p => p.id === player.id)) {
                  updates.push({ type: 'ADD_PLAYER', payload: player });
                } else if (player.id !== 'gm' && player.id !== 'gm-player') {
                  // Update existing player with saved state (especially handCardOrder)
                  updates.push({ type: 'UPDATE_PLAYER', payload: player });
                }
              });
            }

            // Restore player panel settings (individual panel positions/sizes for each player)
            if (savedState.playerPanelSettings && Object.keys(savedState.playerPanelSettings).length > 0) {
              updates.push({ type: 'APPLY_SAVED_PANEL_SETTINGS', payload: { playerPanelSettings: savedState.playerPanelSettings } });
            }

            // Apply all updates
            updates.forEach(update => localDispatch(update));

            // Create main menu from local settings
            createMainMenu(localDispatch);
          };

          if (needsRestoration) {
            // Only show loading modal for IndexedDB operations
            setIsInitialLoading(true);
            addInitialLoadStep('Loading saved game...', 'loading');

            // Load images from IndexedDB in background
            loadImageCacheFromIDB().then(imageCache => {
              if (Object.keys(imageCache).length > 0) {
                addInitialLoadStep(`Restoring ${Object.keys(imageCache).length} images...`, 'loading');

                // Restore images in objects BEFORE adding them
                const restoredObjects: Record<string, TableObject> = {};
                Object.entries(savedState.objects || {}).forEach(([id, obj]) => {
                  restoredObjects[id] = restoreImagesFromCache(obj, imageCache);
                });

                // Add restored objects
                addObjects(restoredObjects);

                // Migrate pool panels that are in playable area to non-playable territories
                runPoolMigrationIfNeeded(restoredObjects);

                addInitialLoadStep('Images restored', 'success');
              } else {
                // Just add objects without restoration
                addObjects(savedState.objects || {});
              }

              // After objects are added, restore other state
              restoreOtherState();

              // Check if we need to reconnect to host (for guests)
              if (!isHost) {
                setIsInitialLoading(false);
                initializedRef.current = true;
              } else {
                // Host is ready immediately
                setIsInitialLoading(false);
                initializedRef.current = true;
              }
            }).catch(error => {
              logger.error('[LOAD] Failed to load images from IndexedDB:', error);
              // Just add objects without restoration
              addObjects(savedState.objects || {});
              // Still restore other state
              restoreOtherState();

              // IMPORTANT: Mark as initialized even on error
              setIsInitialLoading(false);
              initializedRef.current = true;
            });
          } else {
            // No restoration needed - add objects directly
            addObjects(savedState.objects || {});

            // Restore other state
            restoreOtherState();

            // Mark as initialized
            initializedRef.current = true;
          }

          return; // IMPORTANT: Return after async operations complete
        }

        // No saved state or empty saved state, create default game board (only for host)
        if (isHost) {
          // Create game board on 'boards' layer - ALL VALUES IN VU
          const boardId = 'demo-board';
          const board: Board = {
               id: boardId,
               type: ItemType.BOARD,
               shape: TokenShape.SQUARE,
               x: 100,    // VU: centered position
               y: 100,    // VU: centered position
               width: 1200,  // VU: 120% of screen width
               height: 800, // VU: 80% of screen height
               rotation: 0,
               name: 'Game Board',
               content: '',
               color: '#34495e',
               locked: false,
               isOnTable: true,
               gridType: GridType.HEX,
               gridSize: 60,  // Grid cell size in VU
               gridWidth: 100,  // Hex width in VU
               gridHeight: 115, // Hex height in VU
               snapToGrid: true,
               hyperscaleLayerId: 'boards',
          };
          localDispatch({ type: 'ADD_OBJECT', payload: board });

          // Create Standard Deck on 'cards' layer
          // Position: 10 vu from top, 15 vu left of main panel
          const menuPosition = calculateMainMenuPosition(); // Returns pixels
          const pixelsPerVU = calculatePixelsPerVU(window.innerWidth, window.innerHeight);
          // Convert menu X from pixels to vu, then subtract 15 vu and deck width
          const menuX_vu = menuPosition.x / pixelsPerVU;
          const deckWidth = 120; // Standard deck width in vu (cardWidth * 2 for stacked effect)
          const worldX = menuX_vu - deckWidth - 15; // 15 vu left of menu
          const worldY = 10; // 10 vu from top
          const { deck, cards } = createStandardDeck();


          // Update deck position
          deck.x = worldX;
          deck.y = worldY;
          deck.hyperscaleLayerId = 'cards';

          // Update card positions directly in the cards array before dispatch
          cards.forEach(card => {
            card.x = worldX;
            card.y = worldY;
          });

          // Add all cards first
          cards.forEach(card => localDispatch({ type: 'ADD_OBJECT', payload: card }));
          // Then add the deck
          localDispatch({ type: 'ADD_OBJECT', payload: deck });

          // IMPORTANT: Mark as initialized AFTER default objects are created
          initializedRef.current = true;
        }

        // Create main menu (for everyone)
        createMainMenu(localDispatch);
    }
  }, [isHost]); // Only depend on isHost - connectionStatus changes should NOT re-trigger initialization

  // Initialize managed image cache for better memory management
  useEffect(() => {
    let stopCleanup: (() => void) | null = null;

    const initManagedCache = async () => {
      try {
        // Load existing images from IndexedDB
        const existingCache = await loadImageCacheFromIDB();

        // Initialize managed cache with existing images
        if (Object.keys(existingCache).length > 0) {
          initManagedCacheFromImageCache(existingCache);
        }

        // Start automatic cleanup (every 5 minutes)
        stopCleanup = startManagedCacheCleanup();

        return () => {
          if (stopCleanup) stopCleanup();
        };
      } catch (error) {
        // Failed to initialize managed cache
      }
    };

    initManagedCache();
  }, []); // Run once on mount

  // Function to create main menu from local settings
  const createMainMenu = useCallback((dispatch: React.Dispatch<Action>) => {
    // Prevent duplicate menu creation
    if (creatingMenuRef.current) {
      return;
    }
    creatingMenuRef.current = true;

    // ALWAYS use calculated position - main menu is fixed at right side, full height
    const calculatedPosition = calculateMainMenuPosition();

    const menuX = calculatedPosition.x;
    const menuY = 0; // Always at top
    const menuWidth = calculatedPosition.width;
    const menuHeight = calculatedPosition.height; // Full height minus scrollbar

    // Update local settings with current calculated values
    const localSettings = loadLocalSettings();
    localSettings.mainMenuPosition = { x: menuX, y: menuY };
    localSettings.mainMenuSize = { width: menuWidth, height: menuHeight };

    // Preserve other settings
    if (localSettings.hasSeenInitialScreen === undefined) {
      localSettings.hasSeenInitialScreen = false;
    }
    if (localSettings.effects === undefined) {
      localSettings.effects = { showRemoteCursorSlotObjects: true };
    }
    saveLocalSettings(localSettings);

    // Create main menu
    dispatch({
      type: 'CREATE_PANEL',
      payload: {
        panelType: PanelType.MAIN_MENU,
        x: menuX,
        y: menuY,
        width: menuWidth,
        height: menuHeight,
        title: 'Main Menu'
      }
    });

    // Reset flag after a short delay to allow dispatch to process
    setTimeout(() => {
      creatingMenuRef.current = false;
    }, 100);
  }, []);

  // Update main menu on window resize
  useEffect(() => {
    const handleResize = () => {
      // Find main menu in objects
      const mainMenu = Object.values(state.objects).find(
        obj => obj.type === ItemType.PANEL && (obj as PanelObject).panelType === PanelType.MAIN_MENU
      ) as PanelObject | undefined;

      if (mainMenu) {
        // ALWAYS recalculate position and size based on current screen
        // Main menu should always be: right side flush with scrollbar, full height
        const calculated = calculateMainMenuPosition();

        // Update menu with calculated position and size
        localDispatch({
          type: 'UPDATE_OBJECT',
          payload: {
            id: mainMenu.id,
            x: calculated.x,
            y: 0, // Always at top
            width: calculated.width,
            height: calculated.height // Full height minus horizontal scrollbar
          }
        });

        // Save new position to local settings
        const localSettings = loadLocalSettings();
        localSettings.mainMenuPosition = { x: calculated.x, y: 0 };
        localSettings.mainMenuSize = { width: calculated.width, height: calculated.height };
        saveLocalSettings(localSettings);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [state.objects, localDispatch]);

  // Ensure main menu exists (create it if missing)
  // This handles edge cases where the main menu might be accidentally removed
  useEffect(() => {
    // Only run after initialization is complete to avoid race conditions
    if (!initializedRef.current) {
      return;
    }

    // Skip if menu creation is already in progress
    if (creatingMenuRef.current) {
      return;
    }

    const hasMainMenu = Object.values(state.objects).some(
      obj => obj.type === ItemType.PANEL && (obj as PanelObject).panelType === PanelType.MAIN_MENU
    );

    if (!hasMainMenu) {
      // Small delay to ensure DOM is ready and calculateMainMenuPosition works
      setTimeout(() => {
        createMainMenu(localDispatch);
      }, 0);
    }
  }, [state.objects]); // Only depend on state.objects, NOT connectionStatus

  // Audit log deduplication - prevent duplicate entries from React Strict Mode
  const lastAuditLogRef = useRef<{ action: string; payload: any; timestamp: number } | null>(null);

  // Middleware Dispatcher - memoized with useCallback to prevent infinite loops
  const dispatch = useCallback((action: Action) => {
      // Local-only actions are executed locally but never sent over network
      if (action._localOnly) {
          localDispatch(action);
          return;
      }

      // Audit logging - create log entry before executing action
      // Only log on host to avoid duplicate entries
      if (isHost && !action._excludeFromHistory && action.type !== 'ADD_AUDIT_LOG_ENTRY') {
          // Deduplication: skip if same action for same object was logged within 500ms
          const now = Date.now();
          const lastLog = lastAuditLogRef.current;
          const isDuplicate = lastLog &&
            lastLog.action === action.type &&
            ((action.payload?.id && lastLog.payload?.id && action.payload.id === lastLog.payload.id) ||
             JSON.stringify(lastLog.payload) === JSON.stringify(action.payload)) &&
            now - lastLog.timestamp < 500;

          if (!isDuplicate) {
            const currentState = stateRef.current;
            const currentPlayer = currentState.players.find(p => p.id === currentState.activePlayerId);
            if (currentPlayer) {
              const auditEntry = createAuditLogEntry(
                action,
                currentState,
                currentPlayer.id,
                currentPlayer.name,
                currentPlayer.isGM
              );
              if (auditEntry) {
                // Update last log ref
                lastAuditLogRef.current = {
                  action: action.type,
                  payload: action.payload,
                  timestamp: now
                };
                // Dispatch audit log entry (marked as excluded from history to avoid infinite loop)
                (localDispatch as React.Dispatch<Action>)({
                  type: 'ADD_AUDIT_LOG_ENTRY',
                  payload: auditEntry,
                  _excludeFromHistory: true,
                } as Action);
              }
            }
          }
      }

      if (isHost) {
          // Host executes locally
          localDispatch(action);
          // State broadcast handled by useEffect to ensure updated state is sent
      } else {
          // Guest sends action to Host
          // Filter out local-only actions that should not be sent to host
          const localOnlyActions = [
              'UPDATE_VIEW_TRANSFORM',  // View transform is screen-specific
              'SET_PIXELS_PER_VU',       // Pixels per VU is screen-specific
              'MOVE_OBJECT_COMMIT',      // Panel/window position is local (handled separately)
              'RESIZE_UI_OBJECT'         // Panel/window size is local (handled separately)
          ];

          if (localOnlyActions.includes(action.type)) {
              // Local-only actions - execute locally only, don't send to host
              localDispatch(action);
              return;
          }

          const hasPeerJSConnection = hostConnectionRef.current && connectionStatus === 'connected';
          const hasManualConnection = manualConnectionRef.current && manualConnectionRef.current.open === true;

          if (hasPeerJSConnection) {
              // UPDATE_PLAYER_PANEL_SETTINGS is sent as a separate message type for clarity
              if (action.type === 'UPDATE_PLAYER_PANEL_SETTINGS') {
                  hostConnectionRef.current.send({ type: 'ACTION', payload: action });
                  // Optimistic update for immediate feedback
                  localDispatch(action);
              // UPDATE_PLAYER_NAME is sent as a separate message type for clarity
              } else if (action.type === 'UPDATE_PLAYER_NAME') {
                  hostConnectionRef.current.send({ type: 'UPDATE_PLAYER_NAME', payload: action });
                  // Optimistic update for immediate feedback
                  localDispatch(action);
              } else if (action.type === 'MOVE_OBJECT_COMMIT' || action.type === 'FINISH_DRAWING_STROKE') {
                  // Commit actions are sent to host, applied locally after host broadcasts
                  hostConnectionRef.current.send({ type: 'ACTION', payload: action });
              } else if (action.type === 'CREATE_DRAWING_OBJECT' || action.type === 'ADD_STROKE_TO_DRAWING' || action.type === 'MERGE_DRAWINGS') {
                  // Drawing actions are sent to host
                  hostConnectionRef.current.send({ type: 'ACTION', payload: action });
                  // Wait for sync to avoid desync
              } else {
                  hostConnectionRef.current.send({ type: 'ACTION', payload: action });
                  // Wait for sync to avoid desync
              }
          } else if (hasManualConnection) {
              // Using manual P2P connection (DataChannelAdapter has PeerJS-compatible interface)
              if (action.type === 'UPDATE_PLAYER_PANEL_SETTINGS') {
                  manualConnectionRef.current.send({ type: 'ACTION', payload: action });
                  localDispatch(action);  // Optimistic update
              } else if (action.type === 'UPDATE_PLAYER_NAME') {
                  manualConnectionRef.current.send({ type: 'UPDATE_PLAYER_NAME', payload: action });
                  localDispatch(action);  // Optimistic update
              } else {
                  manualConnectionRef.current.send({ type: 'ACTION', payload: action });
              }
          }
      }
  }, [isHost, connectionStatus, hostConnectionRef]);

  // 🔥 OPTIMIZED: Create throttled broadcast function with WebRTC optimizations
  const createOptimizedBroadcastFunction = useCallback(() => {
    return throttle((currentState: GameState) => {
      if (!isHost || !connectionsRef.current || connectionsRef.current.length === 0 || !imageCachesRef.current) {
        return;
      }

      // Filter out local windows before broadcasting
      const stateForBroadcast = (() => {
        const filteredObjects: Record<string, TableObject> = {};
        Object.entries(currentState.objects).forEach(([id, obj]) => {
          // Skip windows with ownerId (they are local to the owner)
          if (obj.type === ItemType.WINDOW && (obj as WindowObject).ownerId) {
            return;
          }
          // For objects being dragged by host, use broadcast coordinates (prevents showing drag path)
          if ((obj as any).draggingPlayerId === currentState.activePlayerId && (obj as any).broadcastX !== undefined) {
            // Create a copy with broadcast coordinates instead of current position
            const broadcastObj = { ...obj, x: (obj as any).broadcastX, y: (obj as any).broadcastY };
            filteredObjects[id] = broadcastObj;
          } else {
            filteredObjects[id] = obj;
          }
        });
        const broadcastState = { ...currentState, objects: filteredObjects };
        return broadcastState;
      })();

      // Extract images and replace with references for each connection
      connectionsRef.current.forEach(conn => {
        if (conn.open) {
          const peerId = conn.peer;
          const existingCache = imageCachesRef.current!.get(peerId);
          const isFirstConnection = !existingCache || Object.keys(existingCache).length === 0;

          // 🔥 FIX: Always send FULL state for new connections, use differential sync only for updates
          let stateToSend = stateForBroadcast;
          let isPartialSync = false;

          if (!isFirstConnection) {
            // For existing connections, check if we can use differential sync
            const shouldSendFullState = differentialSyncManager.shouldSendFullState();
            if (!shouldSendFullState) {
              stateToSend = differentialSyncManager.getPartialState(stateForBroadcast, Date.now());
              isPartialSync = stateToSend._isPartial || false;
            }
          }

          // Extract images to cache and get state with references
          const { state: stateWithRefs, imageCache: newCache } = extractImagesFromState(stateToSend, existingCache || {});

          // For first connection, send ALL images. For updates, send only new ones.
          const imagesToSend = isFirstConnection ? newCache : getNewImages(newCache, existingCache || {});

          // 🔥 OPTIMIZED: Measure sync time and track statistics
          measureSyncTime(
            () => {
              // Debug: Check if state actually has references
              const stateJson = JSON.stringify(stateWithRefs);
              const hasBase64 = stateJson.includes('data:image/');
              const hasRefs = stateJson.includes('img_ref://');

              // Send state with image references
              conn.send({ type: 'SYNC_STATE', payload: stateWithRefs });

              // Send images (all images for new connection, only new for existing)
              if (Object.keys(imagesToSend).length > 0) {
                conn.send({ type: 'IMAGE_CACHE', payload: imagesToSend });
                // Update the cache for this guest
                imageCachesRef.current!.set(peerId, newCache);
              }

              return { stateSize: stateJson.length, isPartial: isPartialSync };
            },
            (result, syncTime) => {
              // 🔥 OPTIMIZED: Record statistics
              webrtcStatsMonitor.recordSync(result.isPartial, result.stateSize, syncTime);
            }
          );
        }
      });

      // Also broadcast to manual P2P connection guest
      if (isHost && manualConnectionRef.current && manualConnectionRef.current.open === true) {
        const { state: stateWithRefs, imageCache } = extractImagesFromState(stateForBroadcast);
        try {
          manualConnectionRef.current.send({ type: 'SYNC_STATE', payload: stateWithRefs });
          if (Object.keys(imageCache).length > 0) {
            manualConnectionRef.current.send({ type: 'IMAGE_CACHE', payload: imageCache });
          }
        } catch (e) {
          // Error broadcasting state silently
        }
      }

      // 🔥 OPTIMIZED: Clear differential sync changes after broadcast
      differentialSyncManager.clearChanges();
    }, WEBRTC_OPTIMIZATION_CONFIG.STATE_SYNC_THROTTLE);
  }, [isHost]);

  // 🔥 OPTIMIZED: Create and store the throttled broadcast function
  const optimizedBroadcastRef = useRef<ReturnType<typeof throttle> | null>(null);
  useEffect(() => {
    optimizedBroadcastRef.current = createOptimizedBroadcastFunction();
  }, [createOptimizedBroadcastFunction]);

  // 🔥 OPTIMIZED: Host Broadcast Loop - Now using throttled broadcast function
  useEffect(() => {
      // 🔥 OPTIMIZED: Use throttled broadcast function instead of direct sends
      if (optimizedBroadcastRef.current) {
        optimizedBroadcastRef.current.execute(state);
      }
  }, [state, isHost]);

  // Handle incoming data from manual P2P connection
  useEffect(() => {
      const conn = manualConnectionRef.current;
      if (!conn) return;

      // Generate a unique ID for this effect instance to track if we've already set up
      const effectId = `${conn.peer}-${Date.now()}`;

      // Only set up handlers if this is a new connection or effect is re-running
      // We use a composite key to detect both connection changes and dependency changes
      if (manualConnectionSetupRef.current && manualConnectionSetupRef.current.startsWith(conn.peer)) {
          // Same connection, but dependencies changed - remove old handlers first
          console.log('[Manual P2P] Re-setting up handlers for connection due to dependency change:', conn.peer);
      }

      const handleData = (data: any) => {
                    if (data.type === 'SYNC_STATE') {
              // Restore images from local cache before dispatching
              const restoredState = restoreImagesFromCache(data.payload, {});
              localDispatch({ type: 'SYNC_STATE', payload: restoredState });
          } else if (data.type === 'IMAGE_CACHE') {
              localDispatch({ type: 'RESTORE_IMAGES', payload: data.payload });
          } else if (data.type === 'HELO') {
              // Host received HELO from guest - add player and send current state
              const newPlayer = data.payload;
              console.log('[Manual P2P] Received HELO from player:', newPlayer.name);
              localDispatch({ type: 'ADD_PLAYER', payload: newPlayer });

              // Send current state to new player (with safety checks)
              setTimeout(() => {
                  console.log('[Manual P2P] Sending SYNC_STATE to guest, conn:', conn?.peer, 'conn.open:', conn?.open, 'conn.dataChannel.readyState:', conn?.dataChannel?.readyState);
                  if (conn && conn.open && conn.dataChannel && conn.dataChannel.readyState === 'open') {
                      try {
                          const { state: stateWithRefs, imageCache } = extractImagesFromState(stateRef.current);
                          console.log('[Manual P2P] Sending SYNC_STATE, state size:', JSON.stringify(stateWithRefs).length);
                          conn.send({ type: 'SYNC_STATE', payload: stateWithRefs });
                          if (Object.keys(imageCache).length > 0) {
                              console.log('[Manual P2P] Sending IMAGE_CACHE, cache size:', JSON.stringify(imageCache).length);
                              conn.send({ type: 'IMAGE_CACHE', payload: imageCache });
                          }
                          console.log('[Manual P2P] Successfully sent state to guest');
                      } catch (e) {
                          console.error('[Manual P2P] Error sending SYNC_STATE:', e);
                      }
                  } else {
                      console.warn('[Manual P2P] Cannot send SYNC_STATE - conn is closed or null. conn:', conn, 'open:', conn?.open, 'readyState:', conn?.dataChannel?.readyState);
                  }
              }, 100);
          } else if (data.type === 'UPDATE_PLAYER_NAME') {
              localDispatch(data.payload);
          } else if (data.type === 'ACTION') {
              localDispatch(data.payload);
          }
      };

      const handleOpen = () => {
          console.log('[Manual P2P] Connection opened');
          // HELO is now handled by useManualConnection with proper guest name
      };

      const handleClose = () => {
          console.log('[Manual P2P] Connection closed');
          // Reset the setup ref when connection closes so we can re-connect if needed
          manualConnectionSetupRef.current = null;
      };

      const handleError = (error: any) => {
          console.error('[Manual P2P] Connection error:', error);
      };

      // Register event handlers
      conn.on('data', handleData);
      conn.on('open', handleOpen);
      conn.on('close', handleClose);
      conn.on('error', handleError);

      // Mark this connection as set up with this effect instance
      manualConnectionSetupRef.current = effectId;

      // If connection is already open when we set up handlers, trigger handleOpen manually
      // This handles the case where the data channel opened before GameContext registered handlers
      if (conn.open) {
          setTimeout(() => handleOpen(), 0);
      }

      // IMPORTANT: Clean up handlers when effect re-runs or unmounts
      return () => {
          console.log('[Manual P2P] Cleaning up connection handlers for:', conn.peer);
          conn.off('data', handleData);
          conn.off('open', handleOpen);
          conn.off('close', handleClose);
          conn.off('error', handleError);
          // Reset the setup ref so next effect run can set up handlers
          if (manualConnectionSetupRef.current === effectId) {
              manualConnectionSetupRef.current = null;
          }
      };
  }, [localDispatch, isHost]);

  return (
    <GameContext.Provider value={{ state, dispatch, isHost, peerId, connectionStatus, waitingForPlayerName, setPlayerName, initializeHost, stateRef }}>
      {children}
      <InitialLoadModal
        steps={initialLoadSteps}
        isVisible={isInitialLoading}
      />
      <PlayerNameModal
        isOpen={waitingForPlayerName !== null}
        onSubmit={setPlayerName}
        defaultName="Player"
        title="Join Game"
      />
    </GameContext.Provider>
  );
};

// Re-export types for convenience
export type { GameState, ViewTransform } from './gameState';

export const useGame = () => {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGame must be used within a GameProvider');
  return context;
};

// 🔥 OPTIMIZED: Expose WebRTC diagnostics to global scope for debugging
if (typeof window !== 'undefined') {
  (window as any).nexusWebRTCDebug = {
    getStats: () => {
      const stats = webrtcStatsMonitor.getStats();
      return stats;
    },
    printStats: () => {
      webrtcStatsMonitor.printStats();
    },
    resetStats: () => {
      webrtcStatsMonitor.resetStats();
    },
    getDifferentialSyncInfo: () => {
      const changeCount = differentialSyncManager.getChangeCount();
      const shouldFull = differentialSyncManager.shouldSendFullState();
      return {
        changeCount,
        shouldSendFullState: shouldFull,
        threshold: WEBRTC_OPTIMIZATION_CONFIG.MAX_CHANGES_FOR_FULL_SYNC
      };
    }
  };
}