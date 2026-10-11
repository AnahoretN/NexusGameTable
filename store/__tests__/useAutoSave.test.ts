/**
 * Regression tests for useAutoSave.
 *
 * Historical bug: the 60s interval effect had `state` in its deps, so every
 * dispatch cleared and restarted the timer. During active play the interval
 * never fired, there was no save-on-unload, and a host F5 lost the whole
 * session (guests were unaffected — their table comes from host SYNC_STATE).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutoSave } from '../useAutoSave';
import { saveGameState } from '../../utils/gameStorage';
import type { GameState } from '../gameState';

vi.mock('../../utils/gameStorage', () => ({
  saveGameState: vi.fn().mockResolvedValue(undefined),
}));

const mockSave = vi.mocked(saveGameState);

function makeState(objects: number): GameState {
  const objs: Record<string, unknown> = {};
  for (let i = 0; i < objects; i++) objs[`obj-${i}`] = { id: `obj-${i}` };
  return { objects: objs } as unknown as GameState;
}

beforeEach(() => {
  vi.useFakeTimers();
  mockSave.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useAutoSave', () => {
  it('saves on the interval even when state keeps changing (interval must not reset)', async () => {
    const { rerender } = renderHook(
      ({ state }: { state: GameState }) => useAutoSave(state, true, 'host'),
      { initialProps: { state: makeState(1) } }
    );

    // Simulate active play: a state change every 10s for 3 minutes.
    // The old implementation reset the 60s timer on each change → never fired.
    for (let i = 0; i < 18; i++) {
      act(() => {
        vi.advanceTimersByTime(10_000);
      });
      rerender({ state: makeState(i + 2) });
    }

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(mockSave).toHaveBeenCalled();
  });

  it('debounces a save after a state change', async () => {
    const { rerender } = renderHook(
      ({ state }: { state: GameState }) => useAutoSave(state, true, 'host'),
      { initialProps: { state: makeState(1) } }
    );

    rerender({ state: makeState(5) });
    expect(mockSave).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    expect(mockSave).toHaveBeenCalledTimes(1);
    // Debounce reads the LATEST state through the ref, not the initial one
    expect((mockSave.mock.calls[0][0] as GameState).objects).toHaveProperty('obj-4');
  });

  it('does not save before initialization', () => {
    renderHook(() => useAutoSave(makeState(1), false, 'host'));
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('passes the role through to saveGameState', async () => {
    renderHook(() => useAutoSave(makeState(1), true, 'guest'));
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    expect(mockSave).toHaveBeenCalledWith(expect.anything(), 'guest');
  });

  it('saves synchronously on pagehide and beforeunload', () => {
    renderHook(() => useAutoSave(makeState(1), true, 'host'));

    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('beforeunload'));
    expect(mockSave).toHaveBeenCalledTimes(2);
  });
});
