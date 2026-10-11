/**
 * Session resume descriptors — the persistence half of the reconnection system.
 *
 * A small JSON descriptor records WHO was in the session and HOW to find it
 * again, so a page reload can silently resume:
 *   - host: {method, inviteId}  → initializeHost() reuses the same PeerJS peer
 *     id / Trystero roomId, so old invite links and reconnecting guests work.
 *   - guest: {method, inviteId, playerId, playerName, playerColor} → the guest
 *     re-attaches without the name modal, keeping its game identity.
 *
 * Descriptors expire after a TTL and are wiped by CLEAR_SAVED_STATE. URL invite
 * params always take precedence over a descriptor (fresh join wins).
 */

import { logger } from '../../utils/logger';

const DESCRIPTOR_KEY = 'nexus-session-descriptor';
const HOST_PEER_ID_KEY = 'nexus-host-peer-id';
const HOST_ROOM_ID_KEY = 'nexus-host-room-id';
const RESUME_LOCK_KEY = 'nexus-resume-lock';
const TAB_SESSION_KEY = 'nexus-tab-session';
const PLAYER_IDENTITY_KEY = 'nexus-player-identity';

export const RESUME_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/** Only these transports participate in resume (iroh is a shim, manual is out of scope). */
export type ResumeMethod = 'peerjs' | 'trystero';

export interface SessionDescriptor {
  version: 1;
  role: 'host' | 'guest';
  method: ResumeMethod;
  /** PeerJS host peer id | Trystero roomId */
  inviteId: string;
  savedAt: number;
  /** Guest only — must equal localStorage['nexus-player-id'] */
  playerId?: string;
  playerName?: string;
  playerColor?: string;
}

// ============================================================================
// DESCRIPTOR
// ============================================================================

export function readSessionDescriptor(): SessionDescriptor | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(DESCRIPTOR_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as SessionDescriptor;
    if (d?.version !== 1 || !d.role || !d.method || !d.inviteId) {
      logger.warn('[Resume] Invalid session descriptor — clearing');
      clearSessionDescriptor();
      return null;
    }
    if (d.method !== 'peerjs' && d.method !== 'trystero') return null;
    return d;
  } catch (e) {
    logger.error('[Resume] Failed to read session descriptor:', e);
    return null;
  }
}

export function isDescriptorFresh(d: SessionDescriptor | null, ttlMs = RESUME_TTL_MS): boolean {
  if (!d) return false;
  return Date.now() - d.savedAt < ttlMs;
}

function writeDescriptor(d: SessionDescriptor): void {
  if (typeof window === 'undefined') return;
  try {
    d.savedAt = Date.now();
    localStorage.setItem(DESCRIPTOR_KEY, JSON.stringify(d));
  } catch (e) {
    logger.error('[Resume] Failed to write session descriptor:', e);
  }
  // 🔥 RESUME: mirror the role into THIS TAB's sessionStorage. localStorage is
  // shared by all tabs of the browser — a host tab and a guest tab in the same
  // browser would overwrite each other's descriptor, and on reload the tab
  // couldn't tell which role IT had (a host tab that reads the guest tab's
  // descriptor classifies itself as guest and skips its state load → empty
  // battlefield). sessionStorage is per-tab and survives F5.
  writeTabSession({ role: d.role, method: d.method, inviteId: d.inviteId, savedAt: d.savedAt });
}

export function writeHostDescriptor(method: ResumeMethod, inviteId: string): void {
  writeDescriptor({ version: 1, role: 'host', method, inviteId, savedAt: Date.now() });
}

export function writeGuestDescriptor(
  method: ResumeMethod,
  inviteId: string,
  identity: { playerId: string; playerName: string; playerColor: string }
): void {
  writeDescriptor({
    version: 1,
    role: 'guest',
    method,
    inviteId,
    savedAt: Date.now(),
    ...identity,
  });
}

/**
 * Per-tab session record (sessionStorage). PRIMARY source for the reload role
 * decision — the shared localStorage descriptor is only the fallback.
 */
export interface TabSession {
  role: 'host' | 'guest';
  method: ResumeMethod;
  inviteId: string;
  savedAt: number;
}

function writeTabSession(t: TabSession): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(TAB_SESSION_KEY, JSON.stringify(t));
  } catch {
    // Best-effort
  }
}

export function readTabSession(): TabSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(TAB_SESSION_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as TabSession;
    if (!t?.role || (t.method !== 'peerjs' && t.method !== 'trystero') || !t.inviteId) return null;
    return t;
  } catch {
    return null;
  }
}

export function isTabSessionFresh(t: TabSession | null, ttlMs = RESUME_TTL_MS): boolean {
  return !!t && Date.now() - t.savedAt < ttlMs;
}

/** Refresh savedAt so an in-progress resume doesn't expire mid-retry. */
export function touchSessionDescriptor(): void {
  const d = readSessionDescriptor();
  if (d) writeDescriptor(d);
}

/**
 * Whether the guest descriptor should be (re)written on this session
 * establishment. onSessionEstablished fires on EVERY full/partial SYNC_STATE —
 * rewriting localStorage on each would be wasteful. Write on first establish,
 * on reconnect (fresh savedAt), or when the saved descriptor went stale (>1h).
 */
export function shouldRefreshGuestDescriptor(inviteId: string): boolean {
  const d = readSessionDescriptor();
  if (!d || d.role !== 'guest' || d.inviteId !== inviteId) return true;
  return !isDescriptorFresh(d, 60 * 60 * 1000);
}

export function clearSessionDescriptor(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(DESCRIPTOR_KEY);
    // This tab's session is over too — don't resume it on reload
    sessionStorage.removeItem(TAB_SESSION_KEY);
  } catch (e) {
    logger.error('[Resume] Failed to clear session descriptor:', e);
  }
}

// ============================================================================
// REMEMBERED GUEST IDENTITY (name prefill in the join modal)
// ============================================================================

/**
 * Persistent guest identity (localStorage) — survives tab close and TTL
 * expiry. Used to prefill the player-name input on a fresh join so a guest
 * doesn't retype "Player 2" every session.
 */
export function rememberGuestIdentity(playerName: string, playerColor: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      PLAYER_IDENTITY_KEY,
      JSON.stringify({ playerName, playerColor, savedAt: Date.now() })
    );
  } catch (e) {
    logger.error('[Resume] Failed to remember guest identity:', e);
  }
}

export function readRememberedIdentity(): { playerName: string; playerColor: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PLAYER_IDENTITY_KEY);
    if (!raw) return null;
    const id = JSON.parse(raw);
    if (!id?.playerName) return null;
    return { playerName: id.playerName, playerColor: id.playerColor || '' };
  } catch {
    return null;
  }
}

// ============================================================================
// HOST INVITE IDENTITY
// ============================================================================

/**
 * The persisted host invite id for a method, if any.
 * - PeerJS: the peer id under HOST_PEER_ID_KEY.
 * - Trystero: the roomId under HOST_ROOM_ID_KEY.
 * Both are dedicated keys (NOT the shared descriptor): in a same-browser
 * host+guest setup the guest tab overwrites the descriptor, and the host must
 * still resume with its own room id.
 */
export function getHostInviteId(method: ResumeMethod): string | null {
  if (typeof window === 'undefined') return null;
  if (method === 'peerjs') {
    return localStorage.getItem(HOST_PEER_ID_KEY);
  }
  const stored = localStorage.getItem(HOST_ROOM_ID_KEY);
  if (stored) return stored;
  // Legacy fallback (pre-dedicated-key descriptor)
  const d = readSessionDescriptor();
  return d?.role === 'host' && d.method === 'trystero' ? d.inviteId : null;
}

/** Persist the Trystero host room id (called by initializeHost). */
export function persistHostRoomId(roomId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(HOST_ROOM_ID_KEY, roomId);
  } catch (e) {
    logger.error('[Resume] Failed to persist host room id:', e);
  }
}

/** Generate a new PeerJS host id and persist it (used on collision or first host). */
export function regenerateHostPeerId(): string {
  const id = 'nexus-host-' + Math.random().toString(36).substring(2, 12);
  try {
    localStorage.setItem(HOST_PEER_ID_KEY, id);
  } catch (e) {
    logger.error('[Resume] Failed to persist host peer id:', e);
  }
  return id;
}

// ============================================================================
// TWO-TAB RESUME LOCK
// ============================================================================

const LOCK_HEARTBEAT_MS = 3000;
const LOCK_STALE_MS = 10000;

let lockTabId: string | null = null;
let lockHeartbeatTimer: ReturnType<typeof setInterval> | null = null;

function readLock(): { tabId: string; ts: number } | null {
  try {
    const raw = localStorage.getItem(RESUME_LOCK_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Try to claim exclusive resume rights for this tab (prevents two tabs of the
 * same browser from both auto-resuming / duplicating players).
 * Returns true when this tab owns the lock. Call releaseResumeLock() on unload.
 */
export function acquireResumeLock(): boolean {
  if (typeof window === 'undefined') return false;
  const existing = readLock();
  if (existing && existing.tabId !== getTabId() && Date.now() - existing.ts < LOCK_STALE_MS) {
    logger.log('[Resume] Another tab holds the resume lock — skipping auto-resume');
    return false;
  }
  claimLock();
  lockHeartbeatTimer = setInterval(claimLock, LOCK_HEARTBEAT_MS);
  return true;
}

function claimLock(): void {
  try {
    localStorage.setItem(RESUME_LOCK_KEY, JSON.stringify({ tabId: getTabId(), ts: Date.now() }));
  } catch {
    // Storage full — resume lock is best-effort
  }
}

export function releaseResumeLock(): void {
  if (lockHeartbeatTimer) {
    clearInterval(lockHeartbeatTimer);
    lockHeartbeatTimer = null;
  }
  try {
    const existing = readLock();
    if (existing?.tabId === lockTabId) {
      localStorage.removeItem(RESUME_LOCK_KEY);
    }
  } catch {
    // Ignore
  }
  lockTabId = null;
}

function getTabId(): string {
  if (!lockTabId) {
    lockTabId = 'tab-' + Math.random().toString(36).substring(2, 10);
  }
  return lockTabId;
}

// ============================================================================
// URL HELPERS
// ============================================================================

/** True when the URL carries an invite param for the given method family. */
export function hasUrlInviteParams(): boolean {
  if (typeof window === 'undefined') return false;
  const p = new URLSearchParams(window.location.search);
  return p.has('hostId') || p.has('ticket') || p.has('roomId');
}

/** Connection method implied by URL invite params, if any. */
export function getUrlInviteMethod(): ResumeMethod | 'iroh' | null {
  if (typeof window === 'undefined') return null;
  const p = new URLSearchParams(window.location.search);
  if (p.has('hostId')) return 'peerjs';
  if (p.has('roomId')) return 'trystero';
  if (p.has('ticket')) return 'iroh';
  return null;
}
