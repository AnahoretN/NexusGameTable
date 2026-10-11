/**
 * 🔥 RESUME: session reconnection banner.
 *
 * Small unobtrusive overlay that keeps the player informed during a session
 * resume / reconnect, and offers recovery actions when the host is gone:
 *   - reconnecting → "Reconnecting to host…" pill
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

  return (
    <div
      style={{
        position: 'fixed',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2147483000,
        pointerEvents: failed ? 'auto' : 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
      }}
    >
      {reconnecting && (
        <div
          className="nexus-resume-pill"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'rgba(15, 23, 42, 0.92)',
            color: '#e2e8f0',
            border: '1px solid rgba(148, 163, 184, 0.4)',
            borderRadius: 9999,
            padding: '6px 14px',
            fontSize: 13,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35)',
          }}
        >
          <span
            aria-hidden
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: '#f59e0b',
              animation: 'nexus-resume-pulse 1.2s ease-in-out infinite',
            }}
          />
          {t('Reconnecting to host…', language)}
        </div>
      )}

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
