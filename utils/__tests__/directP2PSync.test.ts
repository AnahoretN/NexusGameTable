/**
 * Unit tests for handleDirectSyncMessage (utils/directP2PSync.ts).
 *
 * Direct P2P sync (bypassing the host) for token counters and character
 * panel blocks. The handler decides whether an incoming message becomes a
 * local UPDATE_OBJECT or is dropped (own messages, stale data, missing
 * targets) — a wrong drop here means one player's sliders silently freeze
 * for everyone else.
 */

import { vi, describe, test, expect } from 'vitest';
import { handleDirectSyncMessage, DirectP2PMessage } from '../directP2PSync';

vi.mock('../logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const LOCAL = 'player-me';

function msg(overrides: Partial<DirectP2PMessage>): DirectP2PMessage {
  return {
    type: 'DIRECT_SYNC',
    syncType: 'TOKEN_COUNTERS',
    payload: {},
    playerId: 'other-player',
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('handleDirectSyncMessage — common guards', () => {
  test('ignores our own messages (echo loop guard)', () => {
    const result = handleDirectSyncMessage(
      msg({ playerId: LOCAL, payload: { tokenId: 't1', counters: [] } }),
      { t1: { id: 't1', type: 'TOKEN' } },
      LOCAL
    );
    expect(result).toBeNull();
  });

  test('unknown sync type is dropped', () => {
    const result = handleDirectSyncMessage(
      msg({ syncType: 'SOMETHING_ELSE' as any }),
      {},
      LOCAL
    );
    expect(result).toBeNull();
  });
});

describe('handleDirectSyncMessage — TOKEN_COUNTERS', () => {
  test('missing or non-token object is dropped', () => {
    expect(handleDirectSyncMessage(
      msg({ payload: { tokenId: 'ghost', counters: [] } }),
      {},
      LOCAL
    )).toBeNull();

    expect(handleDirectSyncMessage(
      msg({ payload: { tokenId: 'card-1', counters: [] } }),
      { 'card-1': { id: 'card-1', type: 'CARD' } },
      LOCAL
    )).toBeNull();
  });

  test('unchanged counters produce no action (dedup)', () => {
    const counters = [{ id: 'hp', value: 3, maxValue: 10, minValue: 0, label: 'HP', color: '#f00' }];
    const result = handleDirectSyncMessage(
      msg({ payload: { tokenId: 't1', counters } }),
      { t1: { id: 't1', type: 'TOKEN', counters } },
      LOCAL
    );
    expect(result).toBeNull();
  });

  test('changed counters update the token with skipNetworkSync', () => {
    const counters = [{ id: 'hp', value: 7, maxValue: 10, minValue: 0, label: 'HP', color: '#f00' }];
    const result = handleDirectSyncMessage(
      msg({ payload: { tokenId: 't1', counters } }),
      { t1: { id: 't1', type: 'TOKEN', counters: [] } },
      LOCAL
    );

    expect(result).toEqual({
      type: 'UPDATE_OBJECT',
      payload: { id: 't1', counters, skipNetworkSync: true },
    });
  });
});

describe('handleDirectSyncMessage — CHARACTER_SLIDERS', () => {
  const makePanel = (sliders: any[] = []) => ({
    id: 'panel-1',
    type: 'PANEL',
    characterData: {
      characters: [{
        id: 'char-1',
        subTabs: [{
          id: 'tab-1',
          blocks: [{ id: 'block-1', type: 'SLIDER', visible: true, data: { sliders } }],
        }],
      }],
    },
  });

  const sliders = [{ id: 'hp', label: 'HP', value: 5, maxValue: 10, minValue: 0, color: '#0f0' }];

  test('missing panel / characterData / character / slider block are all dropped', () => {
    const m = msg({ syncType: 'CHARACTER_SLIDERS', payload: { panelId: 'panel-1', characterId: 'char-1', sliders } });

    expect(handleDirectSyncMessage(m, {}, LOCAL)).toBeNull(); // no panel
    expect(handleDirectSyncMessage(m, { 'panel-1': { id: 'panel-1', type: 'PANEL' } }, LOCAL)).toBeNull(); // no characterData
    expect(handleDirectSyncMessage(
      m,
      { 'panel-1': { ...makePanel(), characterData: { characters: [{ id: 'other-char' }] } } },
      LOCAL
    )).toBeNull(); // no matching character

    const panelNoSliderBlock = {
      id: 'panel-1',
      type: 'PANEL',
      characterData: {
        characters: [{ id: 'char-1', subTabs: [{ id: 'tab-1', blocks: [{ id: 'b', type: 'TEXT', visible: true, data: {} }] }] }],
      },
    };
    expect(handleDirectSyncMessage(m, { 'panel-1': panelNoSliderBlock }, LOCAL)).toBeNull();
  });

  test('unchanged sliders produce no action', () => {
    const result = handleDirectSyncMessage(
      msg({ syncType: 'CHARACTER_SLIDERS', payload: { panelId: 'panel-1', characterId: 'char-1', sliders } }),
      { 'panel-1': makePanel(sliders) },
      LOCAL
    );
    expect(result).toBeNull();
  });

  test('changed sliders update the visible SLIDER block of the right character', () => {
    const result = handleDirectSyncMessage(
      msg({ syncType: 'CHARACTER_SLIDERS', payload: { panelId: 'panel-1', characterId: 'char-1', sliders } }),
      { 'panel-1': makePanel([]) },
      LOCAL
    );

    expect(result?.type).toBe('UPDATE_OBJECT');
    expect(result?.payload.id).toBe('panel-1');
    expect(result?.payload.skipNetworkSync).toBe(true);

    const char = result!.payload.characterData.characters[0];
    const block = char.subTabs[0].blocks.find((b: any) => b.type === 'SLIDER');
    expect(block.data.sliders).toEqual(sliders);
  });
});

describe('handleDirectSyncMessage — CHARACTER_BLOCK', () => {
  test('replaces the target block data, leaving other blocks untouched', () => {
    const panel = {
      id: 'panel-1',
      type: 'PANEL',
      characterData: {
        characters: [{
          id: 'char-1',
          subTabs: [{
            id: 'tab-1',
            blocks: [
              { id: 'block-1', type: 'TEXT', data: { text: 'old' } },
              { id: 'block-2', type: 'TABLE', data: { rows: [] } },
            ],
          }],
        }],
      },
    };

    const newData = { text: 'new' };
    const result = handleDirectSyncMessage(
      msg({
        syncType: 'CHARACTER_BLOCK',
        payload: { panelId: 'panel-1', characterId: 'char-1', subTabId: 'tab-1', blockId: 'block-1', blockType: 'TEXT', data: newData },
      }),
      { 'panel-1': panel },
      LOCAL
    );

    expect(result?.type).toBe('UPDATE_OBJECT');
    const blocks = result!.payload.characterData.characters[0].subTabs[0].blocks;
    expect(blocks.find((b: any) => b.id === 'block-1').data).toEqual(newData);
    expect(blocks.find((b: any) => b.id === 'block-2').data).toEqual({ rows: [] }); // untouched
  });
});
