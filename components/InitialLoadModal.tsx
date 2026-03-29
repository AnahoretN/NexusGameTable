import React from 'react';
import { MAIN_MENU_WIDTH } from '../constants';

export interface InitialLoadStep {
  message: string;
  status: 'loading' | 'success' | 'warning' | 'error';
}

interface InitialLoadModalProps {
  steps: InitialLoadStep[];
  isVisible: boolean;
}

export const InitialLoadModal: React.FC<InitialLoadModalProps> = ({ steps, isVisible }) => {
  if (!isVisible) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000
    }}>
      <div style={{
        backgroundColor: '#1e1e2e',
        color: '#cdd6f4',
        padding: '40px',
        borderRadius: '12px',
        width: `${MAIN_MENU_WIDTH + 100}px`,
        maxWidth: '95vw',
        maxHeight: '80vh',
        overflow: 'auto',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
      }}>
        <h2 style={{
          marginTop: 0,
          marginBottom: '30px',
          fontSize: '24px',
          fontWeight: 'bold',
          color: '#cdd6f4',
          textAlign: 'center'
        }}>
          Loading Game
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
          {steps.map((step, index) => (
            <div key={index} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px',
              borderRadius: '8px',
              backgroundColor: step.status === 'loading' ? 'rgba(137, 180, 250, 0.15)' : 'transparent',
              transition: 'background-color 0.3s ease'
            }}>
              {step.status === 'loading' && (
                <div style={{
                  width: '20px',
                  height: '20px',
                  border: '3px solid #89b4fa',
                  borderTop: '3px solid transparent',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  flexShrink: 0
                }} />
              )}
              {step.status === 'success' && (
                <span style={{ color: '#a6e3a1', fontSize: '22px', flexShrink: 0 }}>✓</span>
              )}
              {step.status === 'warning' && (
                <span style={{ color: '#f9e2af', fontSize: '22px', flexShrink: 0 }}>⚠</span>
              )}
              {step.status === 'error' && (
                <span style={{ color: '#f38ba8', fontSize: '22px', flexShrink: 0 }}>✗</span>
              )}

              <span style={{
                flex: 1,
                fontSize: '14px',
                lineHeight: '1.5',
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
