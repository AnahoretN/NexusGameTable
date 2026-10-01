import type { CSSProperties } from 'react';

/**
 * Remote Movement Animator
 *
 * When an object's position changes via SYNC (another player moved it, or a
 * sync echo applied a jump), the object is animated from its old position to
 * the new one at REMOTE_MOVEMENT_SPEED VU per second instead of teleporting.
 *
 * Mechanics: the reducer registers a movement (old → new position); the
 * renderers apply a CSS transition on left/top for the computed duration and
 * disable pointer events while the object is in flight.
 *
 * Own moves never animate: the local drag already applies every intermediate
 * position, so the sync echo arrives with zero distance and is skipped.
 */

// 2000 VU per second
const REMOTE_MOVEMENT_SPEED = 2000;
// Jumps shorter than this are applied instantly (mouse-step noise)
const MIN_ANIMATION_DISTANCE = 20;
const MIN_DURATION = 0.2;
const MAX_DURATION = 3;

interface MovementEntry {
  durationSec: number;
  startedAt: number;
}

const movementAnimations = new Map<string, MovementEntry>();

const cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Version counter + subscribers so React components can re-render when an
// animation starts/ends (to restore pointer events).
let movementVersion = 0;
const changeCallbacks = new Set<() => void>();

function bumpVersion() {
  movementVersion++;
  changeCallbacks.forEach(cb => cb());
}

export function subscribeToMovementChanges(callback: () => void): () => void {
  changeCallbacks.add(callback);
  return () => changeCallbacks.delete(callback);
}

export function getMovementVersion(): number {
  return movementVersion;
}

/**
 * Register a remote position jump. Ignores zero/small distances (own-drag
 * steps and echoes) — only real jumps animate.
 */
export function registerRemoteMovement(
  id: string,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number
): void {
  if (fromX === undefined || fromY === undefined || toX === undefined || toY === undefined) return;
  const distance = Math.hypot(toX - fromX, toY - fromY);
  if (distance < MIN_ANIMATION_DISTANCE) return;

  const durationSec = Math.min(MAX_DURATION, Math.max(MIN_DURATION, distance / REMOTE_MOVEMENT_SPEED));

  const prevTimer = cleanupTimers.get(id);
  if (prevTimer) clearTimeout(prevTimer);

  movementAnimations.set(id, { durationSec, startedAt: performance.now() });
  bumpVersion();

  const timer = setTimeout(() => {
    movementAnimations.delete(id);
    cleanupTimers.delete(id);
    bumpVersion();
  }, durationSec * 1000);
  cleanupTimers.set(id, timer);
}

/** True while the object is flying to its target position. */
export function isRemoteMovementActive(id: string): boolean {
  return movementAnimations.has(id);
}

/**
 * Extra CSS for a rendering object: glides via left/top transition and is
 * non-interactive while the animation is active.
 */
export function getMovementExtraStyle(id: string, additionalTransition?: string): CSSProperties | undefined {
  const entry = movementAnimations.get(id);
  if (!entry) return undefined;
  return {
    transition: `left ${entry.durationSec}s linear, top ${entry.durationSec}s linear${additionalTransition ? `, ${additionalTransition}` : ''}`,
    pointerEvents: 'none',
  } as React.CSSProperties;
}
