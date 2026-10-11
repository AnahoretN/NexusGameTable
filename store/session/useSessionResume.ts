/**
 * 🔥 RESUME: session auto-resume orchestration.
 *
 * On mount (once per page load): if a fresh session descriptor exists and the
 * URL carries no invite params, resume the previous session:
 *   - host  → initializeHost() re-creates the same peer id / roomId (invite
 *     links stay valid); the localStorage autosave reloads the game state via
 *     the existing GameContext init effect.
 *   - guest → resumeGuest() silently re-attaches with the persisted identity
 *     (no name modal); the host's full SYNC_STATE restores the table.
 *
 * URL invite params always win (a fresh join beats a resume), and a two-tab
 * lock prevents duplicate resumes from the same browser.
 */

import { useEffect, useRef, useState } from 'react';
import { logger } from '../../utils/logger';
import { getPlayerId } from '../gameConstants';
import {
  readSessionDescriptor,
  isDescriptorFresh,
  clearSessionDescriptor,
  acquireResumeLock,
  releaseResumeLock,
  hasUrlInviteParams,
  readTabSession,
  isTabSessionFresh,
  readRememberedIdentity,
  type ResumeMethod,
} from './sessionResume';
import type { UseGameSessionReturn } from './useGameSession';
import type { ConnectionMethod } from '../../utils/localSettings';

export type ResumePhase = 'idle' | 'resuming' | 'established' | 'failed';

export interface SessionResumeState {
  phase: ResumePhase;
  role: 'host' | 'guest' | null;
  method: ResumeMethod | null;
}

export function useSessionResume(
  session: UseGameSessionReturn,
  connectionMethod: ConnectionMethod
): SessionResumeState {
  const attemptedRef = useRef(false);
  const [state, setState] = useState<SessionResumeState>({
    phase: 'idle',
    role: null,
    method: null,
  });

  useEffect(() => {
    if (attemptedRef.current) return;
    attemptedRef.current = true;

    // A fresh invite join always wins over a resume
    if (hasUrlInviteParams()) {
      logger.log('[Resume] URL invite params present — skipping auto-resume');
      return;
    }

    // 🔥 RESUME: per-tab record (sessionStorage) is the PRIMARY role source —
    // localStorage is shared by all tabs of the browser, so a host tab must not
    // read a guest tab's descriptor (that made the host reload as "guest" and
    // skip its state load → empty battlefield).
    const tab = readTabSession();
    let role: 'host' | 'guest' | null = null;
    let method: ResumeMethod | null = null;
    let inviteId: string | null = null;

    if (tab && isTabSessionFresh(tab)) {
      role = tab.role;
      method = tab.method;
      inviteId = tab.inviteId;
    } else {
      const d = readSessionDescriptor();
      if (!d || !isDescriptorFresh(d)) {
        if (d) {
          logger.log('[Resume] Stale session descriptor — discarding');
          clearSessionDescriptor();
        }
        return;
      }
      role = d.role;
      method = d.method;
      inviteId = d.inviteId;
    }

    // Resume must match the active connection method (settings may have
    // changed between sessions; iroh/manual never persist descriptors).
    if (method !== connectionMethod) {
      logger.log('[Resume] Descriptor method', method, '≠ active method', connectionMethod, '— skipping');
      return;
    }

    // 🔥 RESUME: the two-tab lock guards GUEST auto-rejoin only (two tabs of
    // the same browser must not join twice). Host resume is never locked —
    // a guest tab holding the lock in the same browser must not block the
    // host from re-hosting.
    if (role === 'guest') {
      if (!acquireResumeLock()) return;
      window.addEventListener('beforeunload', releaseResumeLock);
    }

    if (role === 'host') {
      logger.log('[Resume] Resuming hosted session — re-creating identity', inviteId);
      setState({ phase: 'resuming', role: 'host', method });
      session.initializeHost();
      // Established detection: the transports flip connectionStatus to
      // 'connected' in peer.on('open') / room creation.
      const timer = setInterval(() => {
        if (session.connectionStatus === 'connected') {
          clearInterval(timer);
          setState({ phase: 'established', role: 'host', method });
        }
      }, 500);
      setTimeout(() => clearInterval(timer), 30000);
    } else {
      // Guest: identity comes from the shared descriptor, falling back to the
      // remembered identity (survives descriptor TTL / tab-record-only resume)
      const d = readSessionDescriptor();
      if (d?.role === 'guest' && d.playerId && d.playerId !== getPlayerId()) {
        logger.warn('[Resume] Descriptor playerId mismatch — discarding');
        clearSessionDescriptor();
        return;
      }
      let guestName = d?.role === 'guest' ? d.playerName : undefined;
      let guestColor = d?.role === 'guest' ? d.playerColor : undefined;
      if (!guestName) {
        const remembered = readRememberedIdentity();
        if (remembered) {
          guestName = remembered.playerName;
          guestColor = remembered.playerColor || guestColor;
        }
      }
      if (!guestName) {
        logger.warn('[Resume] Incomplete guest identity — discarding resume');
        clearSessionDescriptor();
        return;
      }
      if (!guestColor) {
        guestColor = '#' + Math.floor(Math.random() * 16777215).toString(16);
      }
      logger.log('[Resume] Resuming guest session — re-attaching to', inviteId);
      setState({ phase: 'resuming', role: 'guest', method });
      session.resumeGuest(inviteId!, { name: guestName, color: guestColor });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track establishment / failure for the guest side
  useEffect(() => {
    if (state.phase !== 'resuming' || state.role !== 'guest') return;
    if (session.connectionStatus === 'connected') {
      setState(prev => (prev.phase === 'resuming' ? { ...prev, phase: 'established' } : prev));
    }
  }, [session.connectionStatus, state.phase, state.role]);

  // Reconnect loop gave up — surface the failure state (banner offers retry
  // and local-backup restore)
  useEffect(() => {
    session.onReconnectFailedRef.current = () => {
      setState(prev => (prev.role === 'guest' ? { ...prev, phase: 'failed' } : prev));
    };
    return () => { session.onReconnectFailedRef.current = null; };
  }, [session.onReconnectFailedRef]);

  return state;
}
