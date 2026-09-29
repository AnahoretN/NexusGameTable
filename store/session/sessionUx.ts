/**
 * Shared session UX state: loading steps, pack negotiation buffer.
 *
 * Single source of truth for the guest-connection UX — used by every transport.
 * Extracted verbatim from usePeerConnection (the canonical implementation).
 */

import { useCallback, useRef, useState } from 'react';
import { Action } from '../gameActions';

// ============================================================================
// TYPES
// ============================================================================

export interface P2PLoadingStep {
  id: string;
  message: string;
  status: 'pending' | 'loading' | 'success' | 'error';
  progress?: number;
}

export interface RequiredPack {
  name: string;
  hash: string;
  size: number;
}

// Canonical 5-step sequence — every transport renders these
export const CANONICAL_STEPS: P2PLoadingStep[] = [
  { id: 'connect', message: 'Connecting...', status: 'pending' },
  { id: 'p2p', message: 'Establishing P2P connection...', status: 'pending' },
  { id: 'handshake', message: 'Handshake with host...', status: 'pending' },
  { id: 'packs', message: 'Loading asset packs...', status: 'pending' },
  { id: 'state', message: 'Synchronizing game state...', status: 'pending' },
];

const STEP_ORDER = ['connect', 'p2p', 'handshake', 'packs', 'state'] as const;

// ============================================================================
// HOOK
// ============================================================================

export function useSessionUx(localDispatch: React.Dispatch<Action>) {
  const [p2pLoadingSteps, setP2pLoadingSteps] = useState<P2PLoadingStep[]>(CANONICAL_STEPS.map(s => ({ ...s })));
  const [p2pLoadingProgress, setP2pLoadingProgress] = useState(0);
  const [requiredPacks, setRequiredPacks] = useState<RequiredPack[]>([]);
  const [suggestedPlayerName, setSuggestedPlayerName] = useState('');

  // Pack buffering (guest applies SYNC_STATE only after required packs are loaded)
  const loadedPacksRef = useRef<Set<string>>(new Set());
  const bufferedStateRef = useRef<any | null>(null);
  const hasReceivedPacksNeededRef = useRef(false);
  const expectedPacksCountRef = useRef(0);
  const receivedEmptyPacksRef = useRef(false);

  const updateStep = useCallback((stepId: string, status: P2PLoadingStep['status'], message?: string, progress?: number) => {
    setP2pLoadingSteps(prev => {
      const updated = prev.map(step => {
        if (step.id === stepId) {
          return {
            ...step,
            status,
            ...(message && { message }),
            ...(progress !== undefined && { progress })
          };
        }
        return step;
      });

      // Update overall progress based on completed steps
      const stepIndex = STEP_ORDER.indexOf(stepId as any);
      if (stepIndex !== -1) {
        const stepProgress = status === 'success' ? 100 : progress || 0;
        const stepWeight = 100 / STEP_ORDER.length;
        const newProgress = Math.min(100, (stepIndex * stepWeight) + (stepProgress * stepWeight / 100));
        setP2pLoadingProgress(newProgress);
      }

      return updated;
    });
  }, []);

  const flushBufferedSyncState = useCallback(() => {
    if (bufferedStateRef.current) {
      updateStep('state', 'loading', 'Synchronizing game state...');
      localDispatch({ type: 'SYNC_STATE', payload: bufferedStateRef.current });
      bufferedStateRef.current = null;
      updateStep('state', 'success', 'Game synchronized!');
    }
  }, [localDispatch, updateStep]);

  /**
   * Guest proceeds without loading required packs (join modal closed).
   * Disables SYNC_STATE buffering — otherwise every subsequent state update
   * would be buffered forever and the guest would never see gameplay changes.
   */
  const proceedWithoutPacks = useCallback(() => {
    expectedPacksCountRef.current = 0;
    hasReceivedPacksNeededRef.current = true;
    receivedEmptyPacksRef.current = true;
    flushBufferedSyncState();
  }, [flushBufferedSyncState]);

  const reset = useCallback(() => {
    setP2pLoadingSteps(CANONICAL_STEPS.map(s => ({ ...s })));
    setP2pLoadingProgress(0);
    loadedPacksRef.current.clear();
    bufferedStateRef.current = null;
    hasReceivedPacksNeededRef.current = false;
    expectedPacksCountRef.current = 0;
    receivedEmptyPacksRef.current = false;
    setRequiredPacks([]);
  }, []);

  return {
    p2pLoadingSteps,
    p2pLoadingProgress,
    requiredPacks,
    suggestedPlayerName,
    setRequiredPacks,
    setSuggestedPlayerName,
    updateStep,
    reset,
    packBuffer: {
      loadedPacksRef,
      bufferedStateRef,
      hasReceivedPacksNeededRef,
      expectedPacksCountRef,
      receivedEmptyPacksRef,
      flushBufferedSyncState,
      proceedWithoutPacks,
    },
  };
}

export type SessionUx = ReturnType<typeof useSessionUx>;
