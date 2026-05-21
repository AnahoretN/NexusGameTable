/**
 * MissingAssetPlaceholder - Placeholder for missing/invalid assets
 *
 * Shows when an asset cannot be loaded (missing hash, pack not loaded, etc.)
 * Provides options to load from URL or show asset info.
 */

import React, { useState } from 'react';
import { AlertCircle, Image as ImageIcon, Link, Info, Download } from 'lucide-react';

export interface MissingAssetPlaceholderProps {
  assetHash: string;
  width?: number;
  height?: number;
  className?: string;
  style?: React.CSSProperties;
  onUrlLoad?: (url: string) => void;
}

export const MissingAssetPlaceholder: React.FC<MissingAssetPlaceholderProps> = ({
  assetHash,
  width = 100,
  height = 100,
  className = '',
  style = {},
  onUrlLoad,
}) => {
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shortHash = assetHash.length > 20
    ? `${assetHash.substring(0, 8)}...${assetHash.substring(assetHash.length - 8)}`
    : assetHash;

  const handleUrlLoad = async () => {
    if (!urlInput.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      if (onUrlLoad) {
        await onUrlLoad(urlInput.trim());
        setShowUrlInput(false);
        setUrlInput('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load image from URL');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className={`flex flex-col items-center justify-center bg-slate-800 border-2 border-dashed border-slate-600 rounded ${className}`}
      style={{ width: `${width}px`, height: `${height}px`, ...style }}
    >
      {!showUrlInput ? (
        <>
          <AlertCircle className="text-amber-500 mb-2" size={24} />
          <div className="text-xs text-slate-400 text-center px-2">
            <div className="font-medium mb-1">Asset Missing</div>
            <div className="font-mono text-[10px] opacity-70">{shortHash}</div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-1 mt-2">
            {onUrlLoad && (
              <button
                onClick={() => setShowUrlInput(true)}
                className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"
                title="Load from URL"
              >
                <Link size={14} />
              </button>
            )}
            <button
              onClick={() => navigator.clipboard.writeText(assetHash)}
              className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"
              title="Copy hash"
            >
              <Info size={14} />
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center w-full px-2">
          <div className="flex items-center gap-1 mb-2">
            <Download size={14} className="text-blue-400" />
            <span className="text-xs text-slate-300">Load from URL</span>
          </div>

          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://..."
            className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-white mb-1"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleUrlLoad();
              if (e.key === 'Escape') {
                setShowUrlInput(false);
                setUrlInput('');
                setError(null);
              }
            }}
          />

          {error && (
            <div className="text-[10px] text-red-400 text-center mb-1">{error}</div>
          )}

          <div className="flex gap-1">
            <button
              onClick={handleUrlLoad}
              disabled={!urlInput.trim() || isLoading}
              className="px-2 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-xs rounded transition-colors"
            >
              {isLoading ? 'Loading...' : 'Load'}
            </button>
            <button
              onClick={() => {
                setShowUrlInput(false);
                setUrlInput('');
                setError(null);
              }}
              className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Hook to load image from URL and store in IndexedDB
 */
export async function loadImageFromUrl(
  url: string,
  onProgress?: (progress: number) => void
): Promise<string> {
  try {
    // Fetch image from URL
    onProgress?.(10);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
    }

    onProgress?.(50);

    const blob = await response.blob();
    onProgress?.(80);

    // Hash and store in IndexedDB
    const { storeAsset } = await import('../utils/assets');

    const hash = await storeAsset(blob, blob.type || 'image/png', 'url');

    onProgress?.(100);

    return hash;
  } catch (error) {
    throw new Error(`Failed to load image from URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
