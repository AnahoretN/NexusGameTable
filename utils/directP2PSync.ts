/**
 * Direct P2P Sync Utility
 *
 * Provides direct peer-to-peer synchronization for:
 * - Token sliders/counters
 * - Character panel blocks (sliders, text, tables, etc.)
 *
 * This bypasses the host for faster, more responsive updates.
 */

import { Token, TokenSlider, PanelObject, CharacterTab, CharacterBlock, SliderBlockData } from '../types';

// Types for direct P2P messages
export interface DirectP2PMessage {
  type: 'DIRECT_SYNC';
  syncType: 'TOKEN_COUNTERS' | 'CHARACTER_SLIDERS' | 'CHARACTER_BLOCK';
  payload: any;
  playerId: string;
  timestamp: number;
}

export interface TokenCountersPayload {
  tokenId: string;
  counters: TokenSlider[];
}

export interface CharacterSlidersPayload {
  panelId: string;
  characterId: string;
  sliders: Array<{
    id: string;
    label: string;
    value: number;
    maxValue: number;
    minValue: number;
    color: string;
  }>;
}

export interface CharacterBlockPayload {
  panelId: string;
  characterId: string;
  subTabId: string;
  blockId: string;
  blockType: string;
  data: any;
}

// Global reference to P2P connections (set by usePeerConnection)
let p2pConnections: {
  hostConnection: any;
  connections: any[];
  isHost: boolean;
} | null = null;

/**
 * Register P2P connections for direct sync
 * Called by usePeerConnection
 */
export function registerP2PConnections(connections: {
  hostConnection: any;
  connections: any[];
  isHost: boolean;
}) {
  p2pConnections = connections;
  // DirectP2P: P2P connections registered
}

/**
 * Send direct P2P message to all peers
 */
function sendToAllPeers(message: DirectP2PMessage) {
  if (!p2pConnections) {
    // DirectP2P: No P2P connections registered
    return;
  }

  const { hostConnection, connections, isHost } = p2pConnections;

  // If host, send to all guest connections
  if (isHost) {
    connections.forEach((conn: any) => {
      if (conn.open) {
        try {
          conn.send(message);
        } catch (e) {
          console.error('[DirectP2P] Failed to send to guest:', e);
        }
      }
    });
  } else {
    // If guest, send to host (which will relay to other guests)
    if (hostConnection?.open) {
      try {
        hostConnection.send(message);
      } catch (e) {
        console.error('[DirectP2P] Failed to send to host:', e);
      }
    }
  }
}

/**
 * Broadcast token counter changes to all peers
 * Called when a token's counters are updated
 */
export function broadcastTokenCounters(tokenId: string, counters: TokenSlider[], playerId: string) {
  const message: DirectP2PMessage = {
    type: 'DIRECT_SYNC',
    syncType: 'TOKEN_COUNTERS',
    payload: {
      tokenId,
      counters
    } as TokenCountersPayload,
    playerId,
    timestamp: Date.now()
  };

  // DirectP2P: Broadcasting token counters
  console.log('DirectP2P: Broadcasting token counters', {
    tokenId,
    counterCount: counters.length,
    counters: counters.map(c => ({ name: c.name, value: c.value }))
  });

  sendToAllPeers(message);
}

/**
 * Broadcast character slider changes to all peers
 * Called when sliders in character panel are updated
 */
export function broadcastCharacterSliders(
  panelId: string,
  characterId: string,
  sliders: Array<{ id: string; label: string; value: number; maxValue: number; minValue: number; color: string }>,
  playerId: string
) {
  const message: DirectP2PMessage = {
    type: 'DIRECT_SYNC',
    syncType: 'CHARACTER_SLIDERS',
    payload: {
      panelId,
      characterId,
      sliders
    } as CharacterSlidersPayload,
    playerId,
    timestamp: Date.now()
  };

  // DirectP2P: Broadcasting character sliders
  console.log('DirectP2P: Broadcasting character sliders', {
    panelId,
    characterId,
    sliderCount: sliders.length,
    sliders: sliders.map(s => ({ name: s.label, value: s.value }))
  });

  sendToAllPeers(message);
}

/**
 * Broadcast character block data changes to all peers
 * Called when any character block data is updated
 */
export function broadcastCharacterBlock(
  panelId: string,
  characterId: string,
  subTabId: string,
  blockId: string,
  blockType: string,
  data: any,
  playerId: string
) {
  const message: DirectP2PMessage = {
    type: 'DIRECT_SYNC',
    syncType: 'CHARACTER_BLOCK',
    payload: {
      panelId,
      characterId,
      subTabId,
      blockId,
      blockType,
      data
    } as CharacterBlockPayload,
    playerId,
    timestamp: Date.now()
  };

  // DirectP2P: Broadcasting character block
  console.log('DirectP2P: Broadcasting character block', {
    panelId,
    characterId,
    blockId,
    blockType
  });

  sendToAllPeers(message);
}

/**
 * Handle incoming direct P2P sync message
 * Returns the action to dispatch, or null if no action needed
 */
export function handleDirectSyncMessage(
  message: DirectP2PMessage,
  currentObjects: Record<string, any>,
  localPlayerId: string
): { type: string; payload: any } | null {
  // Ignore messages from ourselves
  if (message.playerId === localPlayerId) {
    return null;
  }

  // DirectP2P: Received direct sync

  switch (message.syncType) {
    case 'TOKEN_COUNTERS': {
      const payload = message.payload as TokenCountersPayload;
      const token = currentObjects[payload.tokenId] as Token;

      if (!token || token.type !== 'TOKEN') {
        // DirectP2P: Token not found
        return null;
      }

      // Check if counters actually changed
      const countersChanged = JSON.stringify(token.counters) !== JSON.stringify(payload.counters);
      if (!countersChanged) {
        // DirectP2P: Counters unchanged, skipping update
        return null;
      }

      // DirectP2P: Updating token counters

      return {
        type: 'UPDATE_OBJECT',
        payload: {
          id: payload.tokenId,
          counters: payload.counters,
          skipNetworkSync: true // Already broadcast via direct P2P
        }
      };
    }

    case 'CHARACTER_SLIDERS': {
      const payload = message.payload as CharacterSlidersPayload;
      const panel = currentObjects[payload.panelId] as PanelObject;

      if (!panel || panel.type !== 'PANEL') {
        // DirectP2P: Panel not found
        return null;
      }

      const characterData = panel.characterData;
      if (!characterData) {
        // DirectP2P: Panel has no characterData
        return null;
      }

      const character = characterData.characters.find((c: CharacterTab) => c.id === payload.characterId);
      if (!character) {
        // DirectP2P: Character not found
        return null;
      }

      // Find slider block and update sliders
      let sliderBlock: any = null;
      let subTabId: string | null = null;

      for (const subTab of character.subTabs || []) {
        const block = subTab.blocks?.find((b: any) => b.type === 'SLIDER' && b.visible);
        if (block) {
          sliderBlock = block;
          subTabId = subTab.id;
          break;
        }
      }

      if (!sliderBlock) {
        // DirectP2P: No slider block found for character
        return null;
      }

      // Check if sliders actually changed
      const currentSliders = sliderBlock.data?.sliders || [];
      const slidersChanged = JSON.stringify(currentSliders) !== JSON.stringify(payload.sliders);
      if (!slidersChanged) {
        // DirectP2P: Sliders unchanged, skipping update
        return null;
      }

      // DirectP2P: Updating character sliders

      // Build updated character data
      const updatedCharacters = characterData.characters.map((c: CharacterTab) => {
        if (c.id === payload.characterId) {
          return {
            ...c,
            subTabs: c.subTabs?.map(subTab =>
              subTab.id === subTabId
                ? {
                    ...subTab,
                    blocks: subTab.blocks?.map((block: any) =>
                      block.id === sliderBlock.id
                        ? {
                            ...block,
                            data: {
                              ...sliderBlock.data,
                              sliders: payload.sliders
                            }
                          }
                        : block
                    )
                  }
                : subTab
            )
          };
        }
        return c;
      });

      return {
        type: 'UPDATE_OBJECT',
        payload: {
          id: payload.panelId,
          characterData: {
            ...characterData,
            characters: updatedCharacters
          },
          skipNetworkSync: true // Already broadcast via direct P2P
        }
      };
    }

    case 'CHARACTER_BLOCK': {
      const payload = message.payload as CharacterBlockPayload;
      const panel = currentObjects[payload.panelId] as PanelObject;

      if (!panel || panel.type !== 'PANEL') {
        // DirectP2P: Panel not found
        return null;
      }

      const characterData = panel.characterData;
      if (!characterData) {
        // DirectP2P: Panel has no characterData
        return null;
      }

      const character = characterData.characters.find((c: CharacterTab) => c.id === payload.characterId);
      if (!character) {
        // DirectP2P: Character not found
        return null;
      }

      console.log('[DirectP2P] Updating character block:', payload.blockId);

      // Build updated character data with new block data
      const updatedCharacters = characterData.characters.map((c: CharacterTab) => {
        if (c.id === payload.characterId) {
          return {
            ...c,
            subTabs: c.subTabs?.map(subTab =>
              subTab.id === payload.subTabId
                ? {
                    ...subTab,
                    blocks: subTab.blocks?.map((block: any) =>
                      block.id === payload.blockId
                        ? { ...block, data: payload.data }
                        : block
                    )
                  }
                : subTab
            )
          };
        }
        return c;
      });

      return {
        type: 'UPDATE_OBJECT',
        payload: {
          id: payload.panelId,
          characterData: {
            ...characterData,
            characters: updatedCharacters
          },
          skipNetworkSync: true // Already broadcast via direct P2P
        }
      };
    }

    default:
      console.warn('[DirectP2P] Unknown sync type:', message.syncType);
      return null;
  }
}
