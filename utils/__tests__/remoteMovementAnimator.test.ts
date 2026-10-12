import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import {
  registerRemoteMovement,
  getMovementExtraStyle,
  isRemoteMovementActive,
} from '../remoteMovementAnimator';

describe('remoteMovementAnimator — merge fade-out (card → deck)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('plain movement: no opacity handling', () => {
    registerRemoteMovement('c1', 0, 0, 2000, 0); // 2000 VU → 1 s

    const style = getMovementExtraStyle('c1')!;
    expect(style).toBeDefined();
    expect(style.pointerEvents).toBe('none');
    expect(style.transition).toContain('left 1s linear');
    expect(style.opacity).toBeUndefined();
  });

  test('fadeOut movement: fades during the tail of the flight', () => {
    registerRemoteMovement('c2', 0, 0, 2000, 0, { fadeOut: true }); // 1 s, fade starts at 0.7 s

    // First half of the flight: fully opaque, just gliding
    vi.advanceTimersByTime(300);
    const midFlight = getMovementExtraStyle('c2')!;
    expect(midFlight.opacity).toBeUndefined();

    // After the fade start: opacity transitions to 0
    vi.advanceTimersByTime(500); // 800 ms total — past the 0.7 s fade start
    const fading = getMovementExtraStyle('c2')!;
    expect(fading.opacity).toBe(0);
    expect(fading.transition).toContain('opacity');
  });

  test('animation expires: the object becomes inactive and unstyled', () => {
    registerRemoteMovement('c3', 0, 0, 1000, 0, { fadeOut: true }); // 0.5 s

    expect(isRemoteMovementActive('c3')).toBe(true);
    vi.advanceTimersByTime(600);
    expect(isRemoteMovementActive('c3')).toBe(false);
    expect(getMovementExtraStyle('c3')).toBeUndefined();
  });

  test('short jumps are not animated at all', () => {
    registerRemoteMovement('c4', 0, 0, 10, 0);
    expect(isRemoteMovementActive('c4')).toBe(false);
    expect(getMovementExtraStyle('c4')).toBeUndefined();
  });
});
