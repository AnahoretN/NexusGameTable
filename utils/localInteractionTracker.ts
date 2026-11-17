/**
 * Local Interaction Tracker
 *
 * While the user is continuously manipulating an object locally (effect
 * marker drags — resize/rotate happen in place, unlike cursor-slot drags
 * which hide the object at -999999), incoming sync snapshots must NOT
 * overwrite the object's geometry: the host's throttled broadcast lags the
 * local state, and applying it would drag the object backwards and forwards
 * (visible as position "jumps" that get worse the faster you drag).
 *
 * The tracker records which object ids are being locally interacted with
 * (with a recency window as a safety net in case a drag-end marker is lost,
 * e.g. the tab losing focus mid-drag).
 */

const RECENCY_WINDOW_MS = 1500;

const lastInteractionAt = new Map<string, number>();

/**
 * Mark an object as being locally manipulated (call on grab and on every
 * drag step). Intentionally NOT cleared on mouse-up: a stale in-flight
 * snapshot can arrive after the release and would yank the object back —
 * the marker simply expires RECENCY_WINDOW_MS after the last drag step.
 * During that window non-geometry fields still sync, and geometry catches
 * up with the next broadcast (local and host values are equal by then).
 */
export function markLocalInteraction(id: string): void {
  lastInteractionAt.set(id, Date.now());
}

/** True while the object was locally manipulated recently (or right now). */
export function isLocallyInteracted(id: string): boolean {
  const at = lastInteractionAt.get(id);
  if (at === undefined) return false;
  if (Date.now() - at > RECENCY_WINDOW_MS) {
    lastInteractionAt.delete(id);
    return false;
  }
  return true;
}
