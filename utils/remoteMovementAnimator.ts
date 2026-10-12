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
  /** 🔧 Merge flights (card → deck): fade the object out during the last part of the flight. */
  fadeOut?: boolean;
  fading?: boolean;
  fadeDurationSec?: number;
}

const movementAnimations = new Map<string, MovementEntry>();

const cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();
const fadeTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Version counter + subscribers so React components can re-render when an
// animation starts/ends (to restore pointer events).
let movementVersion = 0;
const changeCallbacks = new Set<() => void>();

// 🔧 FIX: notify subscribers ASYNCHRONOUSLY (coalesced). registerRemoteMovement
// is called from the gameReducer — i.e. during React's render phase — and a
// synchronous callback would setState inside useSyncExternalStore subscribers
// (GameObjectsRenderer/TokenRenderer/...) while GameProvider is still
// rendering: "Cannot update a component while rendering a different component".
// The animation map itself is updated synchronously (renderers read it during
// the render that applies the new position); only the notification moves to
// the next macrotask.
let notifyScheduled = false;

function bumpVersion() {
  movementVersion++;
  if (notifyScheduled) return;
  notifyScheduled = true;
  setTimeout(() => {
    notifyScheduled = false;
    changeCallbacks.forEach(cb => cb());
  }, 0);
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
  toY: number,
  opts?: { fadeOut?: boolean }
): void {
  if (fromX === undefined || fromY === undefined || toX === undefined || toY === undefined) return;
  const distance = Math.hypot(toX - fromX, toY - fromY);
  if (distance < MIN_ANIMATION_DISTANCE) return;

  const durationSec = Math.min(MAX_DURATION, Math.max(MIN_DURATION, distance / REMOTE_MOVEMENT_SPEED));

  const prevTimer = cleanupTimers.get(id);
  if (prevTimer) clearTimeout(prevTimer);
  const prevFadeTimer = fadeTimers.get(id);
  if (prevFadeTimer) clearTimeout(prevFadeTimer);

  movementAnimations.set(id, {
    durationSec,
    startedAt: performance.now(),
    fadeOut: opts?.fadeOut === true,
    fading: false,
  });
  bumpVersion();

  // 🔧 Merge flights: fade the object out during the last part of the flight
  // (a mid-flight re-render with opacity:0 + an opacity transition does the fade)
  if (opts?.fadeOut) {
    const fadeStartSec = Math.max(durationSec - 0.3, durationSec * 0.5);
    const fadeTimer = setTimeout(() => {
      fadeTimers.delete(id);
      const entry = movementAnimations.get(id);
      if (!entry) return;
      const elapsedSec = (performance.now() - entry.startedAt) / 1000;
      entry.fading = true;
      entry.fadeDurationSec = Math.max(0.1, entry.durationSec - elapsedSec);
      bumpVersion();
    }, fadeStartSec * 1000);
    fadeTimers.set(id, fadeTimer);
  }

  const timer = setTimeout(() => {
    movementAnimations.delete(id);
    cleanupTimers.delete(id);
    const fadeTimer = fadeTimers.get(id);
    if (fadeTimer) { clearTimeout(fadeTimer); fadeTimers.delete(id); }
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
 * non-interactive while the animation is active. Merge flights (fadeOut) also
 * fade the object out during the last part of the flight.
 */
export function getMovementExtraStyle(id: string, additionalTransition?: string): CSSProperties | undefined {
  const entry = movementAnimations.get(id);
  if (!entry) return undefined;
  let transition = `left ${entry.durationSec}s linear, top ${entry.durationSec}s linear`;
  if (additionalTransition) transition += `, ${additionalTransition}`;
  const style: CSSProperties = {
    transition,
    pointerEvents: 'none',
  } as CSSProperties;
  if (entry.fading) {
    style.transition = `${transition}, opacity ${entry.fadeDurationSec}s linear`;
    style.opacity = 0;
  }
  return style;
}
