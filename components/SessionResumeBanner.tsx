/**
 * 🔥 RESUME: session reconnection overlay.
 *
 * Keeps the player informed during a session resume / reconnect:
 *   - reconnecting → BLOCKING full-screen modal (no input needed — the table
 *     is frozen while the guest re-attaches to the host; it dismisses itself
 *     once the session is re-established and play continues)
 *   - failed       → panel with "Retry" and "Load local backup" (restores the
 *                    guest's own autosave as an offline game)
 */

import React from 'react';
import { t } from '../utils/translations';
import type { Locale } from '../utils/translations';
import type { ResumePhase } from '../store/session/useSessionResume';

interface SessionResumeBannerProps {
  phase: ResumePhase;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | string;
  language?: Locale;
  onRetry: () => void;
  onLoadBackup: () => void;
  onDismiss?: () => void;
  backupInProgress?: boolean;
}

export const SessionResumeBanner: React.FC<SessionResumeBannerProps> = ({
  phase,
  connectionStatus,
  language = 'en',
  onRetry,
  onLoadBackup,
  onDismiss,
  backupInProgress,
}) => {
  const reconnecting =
    phase === 'resuming' ||
    connectionStatus === 'reconnecting';
  const failed = phase === 'failed';

  if (!reconnecting && !failed) return null;

  // 🔥 RECONNECT MODAL: full-screen blocking overlay while the guest
  // re-attaches to the host. Purely informational — no buttons, no input;
  // it disappears automatically when the session is re-established.
  if (reconnecting) {
    return (
      <div
        className="nexus-resume-overlay"
        role="alertdialog"
        aria-live="assertive"
        aria-busy="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 2147483000,
          background: 'rgba(2, 6, 23, 0.72)',
          backdropFilter: 'blur(3px)',
          WebkitBackdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'auto',
          cursor: 'wait',
        }}
        onMouseDown={e => e.preventDefault()}
        onClick={e => e.preventDefault()}
      >
        <div
          className="nexus-resume-modal"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 14,
            background: 'rgba(15, 23, 42, 0.96)',
            color: '#e2e8f0',
            border: '1px solid rgba(148, 163, 184, 0.4)',
            borderRadius: 14,
            padding: '26px 34px',
            maxWidth: 420,
            textAlign: 'center',
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.55)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}>
            <span
              aria-hidden
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: '#f59e0b',
                animation: 'nexus-resume-pulse 1.2s ease-in-out infinite',
              }}
            />
            <span style={{ fontSize: 16, fontWeight: 600 }}>
              {t('Reconnecting to host…', language)}
            </span>
          </div>
          <div style={{ fontSize: 13, opacity: 0.75, position: 'relative' }}>
            {t('The connection to the host was lost. The game will continue automatically once the host is back.', language)}
          </div>
        </div>

        <style>{`
          @keyframes nexus-resume-pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.4; transform: scale(0.8); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2147483000,
        pointerEvents: 'auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
      }}
    >
      {failed && (
        <div
          className="nexus-resume-failed"
          role="alertdialog"
          aria-live="assertive"
          style={{
            background: 'rgba(15, 23, 42, 0.96)',
            color: '#e2e8f0',
            border: '1px solid rgba(248, 113, 113, 0.5)',
            borderRadius: 12,
            padding: '14px 18px',
            fontSize: 13,
            maxWidth: 380,
            textAlign: 'center',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4, position: 'relative' }}>
            {t('Host is unreachable', language)}
            {onDismiss && (
              <button
                onClick={onDismiss}
                title={t('Dismiss', language)}
                aria-label={t('Dismiss', language)}
                style={{
                  position: 'absolute',
                  top: -6,
                  right: -10,
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: 16,
                  lineHeight: 1,
                  cursor: 'pointer',
                  padding: 4,
                }}
              >
                ×
              </button>
            )}
          </div>
          <div style={{ opacity: 0.8, marginBottom: 12 }}>
            {t('The connection could not be re-established. You can keep trying, or load your latest local backup as an offline game.', language)}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button
              onClick={onRetry}
              disabled={backupInProgress}
              style={{
                background: '#334155',
                color: '#e2e8f0',
                border: 'none',
                borderRadius: 8,
                padding: '7px 14px',
                fontSize: 13,
                cursor: backupInProgress ? 'wait' : 'pointer',
              }}
            >
              {t('Retry', language)}
            </button>
            <button
              onClick={onLoadBackup}
              disabled={backupInProgress}
              style={{
                background: '#7c3aed',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                padding: '7px 14px',
                fontSize: 13,
                cursor: backupInProgress ? 'wait' : 'pointer',
              }}
            >
              {backupInProgress
                ? t('Loading…', language)
                : t('Load local backup', language)}
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes nexus-resume-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.8); }
        }
      `}</style>
    </div>
  );
};
