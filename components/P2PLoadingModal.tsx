import React from 'react';
import { createPortal } from 'react-dom';
import { Wifi, Download, Check, AlertCircle } from 'lucide-react';
import { P2PLoadingStep } from '../store/usePeerConnection';

interface P2PLoadingModalProps {
  isOpen: boolean;
  steps: P2PLoadingStep[];
  overallProgress: number; // 0-100
}

export const P2PLoadingModal: React.FC<P2PLoadingModalProps> = ({
  isOpen,
  steps,
  overallProgress
}) => {
  if (!isOpen) return null;

  const getStatusIcon = (status: P2PLoadingStep['status']) => {
    switch (status) {
      case 'loading':
        return (
          <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        );
      case 'success':
        return <Check className="text-green-500" size={20} />;
      case 'error':
        return <AlertCircle className="text-red-500" size={20} />;
      default:
        return <div className="w-5 h-5 rounded-full border-2 border-slate-600" />;
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-purple-500/50 rounded-xl shadow-2xl p-6 w-[500px] relative overflow-hidden">
        {/* Background glow effect */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-purple-500 to-transparent opacity-50" />

        {/* Animated background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-transparent to-blue-500/5 animate-pulse" />

        <div className="flex flex-col gap-4 relative z-10">
          {/* Header */}
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center">
              <Wifi className="text-purple-500" size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Connecting to Host</h3>
              <p className="text-slate-400 text-sm">Establishing P2P connection...</p>
            </div>
          </div>

          {/* Overall progress bar */}
          <div className="bg-slate-800 rounded-full h-3 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-600 to-blue-500 transition-all duration-300 ease-out relative"
              style={{ width: `${overallProgress}%` }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
            </div>
          </div>

          {/* Progress percentage */}
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Progress</span>
            <span className="text-purple-400 font-mono">{overallProgress}%</span>
          </div>

          {/* Steps list */}
          <div className="flex flex-col gap-2 mt-2 max-h-[200px] overflow-y-auto">
            {steps.map((step) => (
              <div
                key={step.id}
                className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                  step.status === 'loading'
                    ? 'bg-purple-500/10 border border-purple-500/30'
                    : step.status === 'error'
                    ? 'bg-red-500/10 border border-red-500/30'
                    : 'bg-transparent'
                }`}
              >
                {getStatusIcon(step.status)}

                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm ${
                      step.status === 'error'
                        ? 'text-red-400'
                        : step.status === 'success'
                        ? 'text-green-400'
                        : step.status === 'loading'
                        ? 'text-white'
                        : 'text-slate-500'
                    }`}
                  >
                    {step.message}
                  </p>

                  {/* Step progress bar (if available) */}
                  {step.status === 'loading' && step.progress !== undefined && (
                    <div className="mt-2 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full bg-purple-500 transition-all duration-200"
                        style={{ width: `${step.progress}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Footer info */}
          <div className="flex items-center gap-2 text-slate-500 text-xs mt-2 pt-2 border-t border-slate-800">
            <Download size={14} />
            <span>First connection may take a moment. Large images are being optimized.</span>
          </div>
        </div>

        {/* CSS animations */}
        <style>{`
          @keyframes shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
          }
          .animate-shimmer {
            animation: shimmer 2s infinite;
          }
        `}</style>
      </div>
    </div>,
    document.body
  );
};
