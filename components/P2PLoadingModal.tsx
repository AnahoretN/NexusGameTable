import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Wifi, Download, Check, AlertCircle, Upload, Package, Info } from 'lucide-react';
import { P2PLoadingStep } from '../store/usePeerConnection';
import { loadPackFromFile } from '../utils/assets/sources/packLoader';
import { Action } from '../store/gameActions';

interface RequiredPack {
  name: string;
  hash: string;
  size: number;
}

interface P2PLoadingModalProps {
  isOpen: boolean;
  steps: P2PLoadingStep[];
  overallProgress: number; // 0-100
  // 🔥 NEW: Pack loading props
  requiredPacks?: RequiredPack[];
  onPackLoaded?: (packName: string, hashes: string[]) => void;
  dispatch?: React.Dispatch<Action>;
}

interface PackLoadStatus {
  packName: string;
  status: 'pending' | 'loading' | 'success' | 'error';
  progress: number;
  error?: string;
  imageCount?: number;
}

export const P2PLoadingModal: React.FC<P2PLoadingModalProps> = ({
  isOpen,
  steps,
  overallProgress,
  requiredPacks = [],
  onPackLoaded,
  dispatch,
}) => {
  const [packStatuses, setPackStatuses] = useState<Record<string, PackLoadStatus>>(() =>
    requiredPacks.reduce((acc, pack) => {
      acc[pack.name] = {
        packName: pack.name,
        status: 'pending',
        progress: 0,
      };
      return acc;
    }, {} as Record<string, PackLoadStatus>)
  );
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Update statuses when requiredPacks changes
  React.useEffect(() => {
    setPackStatuses(prev => {
      const newStatuses: Record<string, PackLoadStatus> = {};
      for (const pack of requiredPacks) {
        if (prev[pack.name]) {
          newStatuses[pack.name] = prev[pack.name];
        } else {
          newStatuses[pack.name] = {
            packName: pack.name,
            status: 'pending',
            progress: 0,
          };
        }
      }
      return newStatuses;
    });
  }, [requiredPacks]);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const handleFileSelect = async (pack: RequiredPack, file: File) => {
    setPackStatuses(prev => ({
      ...prev,
      [pack.name]: { packName: pack.name, status: 'loading', progress: 0, file },
    }));

    try {
      // Validate file size first
      const sizeDiff = Math.abs(file.size - pack.size);
      const sizeTolerance = pack.size * 0.01; // 1% tolerance

      if (sizeDiff > sizeTolerance) {
        throw new Error(
          `File size mismatch. Expected: ${formatFileSize(pack.size)}, Got: ${formatFileSize(file.size)}`
        );
      }

      const result = await loadPackFromFile(file, (progress) => {
        setPackStatuses(prev => ({
          ...prev,
          [pack.name]: {
            packName: pack.name,
            status: 'loading',
            progress: (progress.current / progress.total) * 100,
          },
        }));
      });

      // Verify hash
      if (result.packHash !== pack.hash) {
        throw new Error(
          `Pack hash mismatch. Expected: ${pack.hash.substring(0, 16)}..., Got: ${result.packHash.substring(0, 16)}...`
        );
      }

      // Register pack for P2P sync
      if (dispatch) {
        dispatch({
          type: 'REGISTER_PACK',
          payload: {
            packName: pack.name,
            packHash: result.packHash,
            packSize: pack.size,
            imageCount: result.imageEntries
          }
        });
      }

      setPackStatuses(prev => ({
        ...prev,
        [pack.name]: {
          packName: pack.name,
          status: 'success',
          progress: 100,
          imageCount: result.imageEntries,
        },
      }));

      // Notify parent
      if (onPackLoaded) {
        onPackLoaded(pack.name, result.successfulHashes);
      }

      // Clear file input
      const inputRef = fileInputRefs.current[pack.name];
      if (inputRef) {
        inputRef.value = '';
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setPackStatuses(prev => ({
        ...prev,
        [pack.name]: {
          packName: pack.name,
          status: 'error',
          progress: 0,
          error: errorMessage,
        },
      }));
    }
  };

  const allPacksLoaded = requiredPacks.length === 0 || requiredPacks.every(
    pack => packStatuses[pack.name]?.status === 'success'
  );

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

  if (!isOpen) return null;

  // Check if we're on the packs loading step
  const packsStep = steps.find(s => s.id === 'packs');
  const isPacksStep = packsStep?.status === 'loading' || packsStep?.status === 'pending';
  const showPackLoadingUI = isPacksStep && requiredPacks.length > 0;

  // 🔥 DEBUG: Log pack loading state
  console.log('[P2PLoadingModal] Pack loading state:', {
    packsStep: packsStep?.status,
    isPacksStep,
    requiredPacksCount: requiredPacks.length,
    requiredPacks: requiredPacks.map(p => p.name),
    showPackLoadingUI
  });

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-purple-500/50 rounded-xl shadow-2xl p-6 w-[500px] max-h-[80vh] overflow-hidden relative">
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
              <h3 className="text-xl font-bold text-white">
                {showPackLoadingUI ? 'Asset Packs Required' : 'Connecting to Host'}
              </h3>
              <p className="text-slate-400 text-sm">
                {showPackLoadingUI
                  ? 'Load the required asset pack(s) to continue'
                  : 'Establishing P2P connection...'}
              </p>
            </div>
          </div>

          {/* Overall progress bar (hide during pack loading) */}
          {!showPackLoadingUI && (
            <>
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
            </>
          )}

          {/* 🔥 NEW: Pack loading UI */}
          {showPackLoadingUI && (
            <div className="flex flex-col gap-3">
              {/* Info message */}
              <div className="flex items-start gap-2 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <Info className="text-blue-500 mt-0.5 flex-shrink-0" size={16} />
                <p className="text-sm text-blue-200">
                  This game requires asset pack(s). Please select the matching file(s) below.
                </p>
              </div>

              {/* Pack list */}
              {requiredPacks.map((pack) => {
                const status = packStatuses[pack.name];
                const isLoaded = status?.status === 'success';

                return (
                  <div
                    key={pack.name}
                    className={`p-4 rounded-lg border transition-all ${
                      isLoaded
                        ? 'bg-green-500/10 border-green-500/30'
                        : status?.status === 'error'
                        ? 'bg-red-500/10 border-red-500/30'
                        : 'bg-slate-800/50 border-slate-700'
                    }`}
                  >
                    {/* Pack header */}
                    <div className="flex items-center gap-3 mb-2">
                      <Package className={isLoaded ? 'text-green-500' : 'text-slate-500'} size={20} />
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium truncate">{pack.name}</p>
                        <p className="text-slate-400 text-xs">
                          Size: {formatFileSize(pack.size)} • Hash: {pack.hash.substring(0, 12)}...
                        </p>
                      </div>
                      {!isLoaded && (
                        <label className="cursor-pointer px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 transition-colors text-sm">
                          <Upload size={16} />
                          <span>Select</span>
                          <input
                            ref={el => fileInputRefs.current[pack.name] = el}
                            type="file"
                            accept=".nexuspack"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const expectedName = pack.name;
                                const actualName = file.name.replace(/\.[^/.]+$/, '');
                                if (actualName !== expectedName) {
                                  setPackStatuses(prev => ({
                                    ...prev,
                                    [pack.name]: {
                                      packName: pack.name,
                                      status: 'error',
                                      progress: 0,
                                      error: `Filename mismatch. Expected: "${expectedName}.nexuspack", Got: "${file.name}"`,
                                    },
                                  }));
                                  return;
                                }
                                handleFileSelect(pack, file);
                              }
                            }}
                            disabled={status?.status === 'loading'}
                          />
                        </label>
                      )}
                    </div>

                    {/* Progress bar (when loading) */}
                    {status?.status === 'loading' && (
                      <div className="mb-2">
                        <div className="flex justify-between text-xs text-slate-400 mb-1">
                          <span>Loading pack...</span>
                          <span>{status.progress.toFixed(0)}%</span>
                        </div>
                        <div className="bg-slate-700 rounded-full h-2 overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-blue-600 to-cyan-500 transition-all duration-200"
                            style={{ width: `${status.progress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Error message */}
                    {status?.status === 'error' && (
                      <div className="flex items-start gap-2 text-red-400 text-sm">
                        <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                        <span>{status.error}</span>
                      </div>
                    )}

                    {/* Success message */}
                    {status?.status === 'success' && (
                      <div className="flex items-center gap-2 text-green-400 text-sm">
                        <Check size={16} />
                        <span>Loaded {status.imageCount} images successfully</span>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Footer status */}
              <div className="text-center text-sm">
                {allPacksLoaded ? (
                  <span className="text-green-400">All packs loaded! Continuing connection...</span>
                ) : (
                  <span className="text-slate-400">
                    {requiredPacks.filter(p => packStatuses[p.name]?.status === 'success').length} / {requiredPacks.length} packs loaded
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Steps list (hide during pack loading) */}
          {!showPackLoadingUI && (
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
          )}

          {/* Footer info */}
          <div className="flex items-center gap-2 text-slate-500 text-xs mt-2 pt-2 border-t border-slate-800">
            <Download size={14} />
            <span>
              {showPackLoadingUI
                ? 'Load all required packs to continue with the connection'
                : 'First connection may take a moment. Large images are being optimized.'}
            </span>
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
