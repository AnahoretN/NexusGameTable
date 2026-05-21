import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Wifi, User, Package, Upload, Check, AlertCircle, X, Info, Play, Loader2 } from 'lucide-react';
import { loadPackFromFile } from '../utils/assets/sources/packLoader';
import { P2PLoadingStep } from '../store/usePeerConnection';
import { Action } from '../store/gameActions';
import { assetEvents } from '../utils/assets/assetCache';

interface RequiredPack {
  name: string;
  hash: string;
  size: number;
}

interface PackLoadStatus {
  packName: string;
  status: 'pending' | 'loading' | 'success' | 'error';
  progress: number;
  error?: string;
  imageCount?: number;
}

interface GuestConnectionModalProps {
  isOpen: boolean;
  // Player name
  initialPlayerName?: string;
  onPlayerNameSubmit: (name: string) => void;
  // Pack loading
  requiredPacks: RequiredPack[];
  onPackLoaded: (packName: string, hashes: string[]) => void;
  dispatch?: React.Dispatch<Action>;
  // Connection progress
  connectionSteps: P2PLoadingStep[];
  connectionProgress: number;
  // Ready to join
  canJoin: boolean;
  onJoin: () => void;
}

export const GuestConnectionModal: React.FC<GuestConnectionModalProps> = ({
  isOpen,
  initialPlayerName = '',
  onPlayerNameSubmit,
  requiredPacks,
  onPackLoaded,
  dispatch,
  connectionSteps,
  connectionProgress,
  canJoin,
  onJoin,
}) => {
  const [playerName, setPlayerName] = useState(initialPlayerName);
  const [nameSubmitted, setNameSubmitted] = useState(false);
  const [packStatuses, setPackStatuses] = useState<Record<string, PackLoadStatus>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // 🔥 FIX: Only reset when modal opens from closed state, not on every render
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      // Modal just opened - reset state
      console.log('[GuestConnectionModal] 📖 Modal opened, resetting state');
      setPlayerName(initialPlayerName);
      setNameSubmitted(false);
      wasOpenRef.current = true;
    } else if (!isOpen && wasOpenRef.current) {
      // Modal closed - reset ref for next time
      console.log('[GuestConnectionModal] 📕 Modal closed');
      wasOpenRef.current = false;
    }
  }, [isOpen, initialPlayerName]);

  // 🔥 NEW: Sync playerName when initialPlayerName changes (e.g., when PACKS_NEEDED arrives)
  useEffect(() => {
    if (isOpen && !nameSubmitted && initialPlayerName) {
      console.log('[GuestConnectionModal] 📝 Updating suggested name to:', initialPlayerName);
      setPlayerName(initialPlayerName);
    }
  }, [initialPlayerName, isOpen, nameSubmitted]);

  // 🔥 DEBUG: Log when requiredPacks changes
  useEffect(() => {
    console.log('[GuestConnectionModal] 📦 requiredPacks changed:', {
      count: requiredPacks.length,
      packs: requiredPacks.map(p => p.name),
      nameSubmitted
    });
  }, [requiredPacks, nameSubmitted]);

  // Update pack statuses when requiredPacks changes
  useEffect(() => {
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

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Use initialPlayerName (suggested by host) as fallback instead of random number
    const finalName = playerName.trim() || initialPlayerName || `Player ${Math.floor(Math.random() * 1000)}`;
    setPlayerName(finalName);
    setNameSubmitted(true);
    onPlayerNameSubmit(finalName);
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

      // 🔥 NEW: Notify all components that assets have been updated
      // This forces SvgTokenShape and other components to reload images
      console.log(`[GuestConnectionModal] 📢 Emitting asset event to refresh ${result.successfulHashes.length} images`);
      assetEvents.emit();

      // Notify parent
      onPackLoaded(pack.name, result.successfulHashes);

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

  const getStepIcon = (status: P2PLoadingStep['status']) => {
    switch (status) {
      case 'loading':
        return <Loader2 className="text-blue-500 animate-spin" size={18} />;
      case 'success':
        return <Check className="text-green-500" size={18} />;
      case 'error':
        return <AlertCircle className="text-red-500" size={18} />;
      default:
        return <div className="w-4 h-4 rounded-full border-2 border-slate-600" />;
    }
  };

  const allPacksLoaded = requiredPacks.length === 0 || requiredPacks.every(
    pack => packStatuses[pack.name]?.status === 'success'
  );

  const connectionComplete = connectionSteps.every(
    step => step.status === 'success' || step.id === 'packs' || step.status === 'pending'
  );

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-purple-500/50 rounded-lg shadow-2xl w-[550px] max-h-[90vh] overflow-hidden flex flex-col relative">
        {/* Header */}
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-purple-500/20 flex items-center justify-center">
              <Wifi className="text-purple-500" size={28} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">Join Game</h2>
              <p className="text-slate-400 text-sm">Connect to host and get ready to play</p>
            </div>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Section 1: Player Name */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <User className="text-purple-500" size={20} />
              <h3 className="text-lg font-semibold text-white">Your Name</h3>
              {nameSubmitted && <Check className="text-green-500" size={18} />}
            </div>

            {nameSubmitted ? (
              <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                <p className="text-green-400">Playing as: <span className="font-bold">{playerName}</span></p>
                <button
                  onClick={() => setNameSubmitted(false)}
                  className="text-xs text-slate-400 hover:text-white mt-1 underline"
                >
                  Change name
                </button>
              </div>
            ) : (
              <form onSubmit={handleNameSubmit} className="flex gap-2">
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Enter your name..."
                  className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500"
                  maxLength={30}
                />
                <button
                  type="submit"
                  className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-semibold transition-colors"
                >
                  Set
                </button>
              </form>
            )}
          </div>

          {/* Section 2: Asset Packs (only show if name is set) */}
          {nameSubmitted && requiredPacks.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Package className="text-purple-500" size={20} />
                <h3 className="text-lg font-semibold text-white">Asset Packs</h3>
                {allPacksLoaded && <Check className="text-green-500" size={18} />}
              </div>


              <div className="space-y-3">
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

                      {/* Progress bar */}
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
              </div>
            </div>
          )}

          {/* Section 3: Connection Progress (only show if name is set) */}
          {nameSubmitted && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Wifi className="text-purple-500" size={20} />
                <h3 className="text-lg font-semibold text-white">Connection Progress</h3>
                {connectionComplete && <Check className="text-green-500" size={18} />}
              </div>

              {/* Overall progress bar */}
              <div className="bg-slate-800 rounded-full h-3 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-600 to-blue-500 transition-all duration-300 relative"
                  style={{ width: `${connectionProgress}%` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                </div>
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>Progress</span>
                <span className="text-purple-400 font-mono">{connectionProgress}%</span>
              </div>

              {/* Steps list */}
              <div className="space-y-[0.33rem]">
                {connectionSteps.map((step) => (
                  <div
                    key={step.id}
                    className="flex items-center gap-3 p-2 rounded-lg bg-slate-800/30"
                  >
                    {getStepIcon(step.status)}
                    <p
                      className={`text-sm flex-1 ${
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
                    {step.status === 'loading' && step.progress !== undefined && (
                      <span className="text-xs text-slate-400">{step.progress.toFixed(0)}%</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer with Join button */}
        <div className="p-6 border-t border-slate-800 bg-slate-900/50">
          <button
            onClick={onJoin}
            disabled={!canJoin}
            className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition-all ${
              canJoin
                ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white shadow-lg shadow-green-500/25'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            {canJoin ? (
              <>
                <Play size={24} />
                <span>Join Game!</span>
              </>
            ) : (
              <>
                <Loader2 className="animate-spin" size={24} />
                <span>
                  {!nameSubmitted
                    ? 'Enter your name to continue'
                    : !allPacksLoaded
                    ? 'Load required asset packs'
                    : 'Connecting to host...'}
                </span>
              </>
            )}
          </button>

          {/* Status hints */}
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500 justify-center">
            {!nameSubmitted && (
              <span>• Enter your name</span>
            )}
            {nameSubmitted && requiredPacks.length > 0 && !allPacksLoaded && (
              <span>• Load all required packs</span>
            )}
            {nameSubmitted && allPacksLoaded && !connectionComplete && (
              <span>• Wait for connection to complete</span>
            )}
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
