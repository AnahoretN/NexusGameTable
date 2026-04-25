import React from 'react';
import { MAIN_MENU_WIDTH } from '../constants';

export interface PackLoadingStep {
  message: string;
  status: 'loading' | 'success' | 'warning' | 'error';
}

interface PackLoadingModalProps {
  steps: PackLoadingStep[];
  isVisible: boolean;
}

export const PackLoadingModal: React.FC<PackLoadingModalProps> = ({ steps, isVisible }) => {
  if (!isVisible) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000
    }}>
      <div
        style={{
          backgroundColor: '#1e1e2e',
          color: '#cdd6f4',
          padding: '30px',
          borderRadius: '12px',
          width: `${MAIN_MENU_WIDTH}px`,
          maxWidth: '95vw',
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)'
        }}
        onWheel={(e) => {
          // Prevent scroll from propagating to the game tabletop
          e.stopPropagation();
        }}
      >
        <h2 style={{
          marginTop: 0,
          marginBottom: '20px',
          fontSize: '20px',
          fontWeight: 'bold',
          color: '#cdd6f4',
          textAlign: 'center'
        }}>
          Loading Pack
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {steps.map((step, index) => (
            <div key={index} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '10px',
              borderRadius: '8px',
              backgroundColor: step.status === 'loading' ? 'rgba(137, 180, 250, 0.1)' : 'transparent'
            }}>
              {step.status === 'loading' && (
                <div style={{
                  width: '18px',
                  height: '18px',
                  border: '2px solid #89b4fa',
                  borderTop: '2px solid transparent',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  flexShrink: 0
                }} />
              )}
              {step.status === 'success' && (
                <span style={{ color: '#a6e3a1', fontSize: '20px', flexShrink: 0 }}>✓</span>
              )}
              {step.status === 'warning' && (
                <span style={{ color: '#f9e2af', fontSize: '20px', flexShrink: 0 }}>⚠</span>
              )}
              {step.status === 'error' && (
                <span style={{ color: '#f38ba8', fontSize: '20px', flexShrink: 0 }}>✗</span>
              )}

              <span style={{
                flex: 1,
                fontSize: '13px',
                lineHeight: '1.4',
                wordBreak: 'break-word',
                color: step.status === 'error' ? '#f38ba8' :
                       step.status === 'warning' ? '#f9e2af' :
                       '#cdd6f4'
              }}>
                {step.message}
              </span>
            </div>
          ))}
        </div>

        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
};