import React, { useState, useEffect } from 'react';
import { TokenShape } from '../types';
import { generatePointyTopHexPath, generateFlatTopHexPath } from '../utils/shapePaths';
import { getAssetURL, acquireAsset, releaseAsset, clearAssetCache } from '../utils/assets';
import { assetEvents, assetCache } from '../utils/assets/assetCache';

// 🔥 FIX: Remove local cache - it gets out of sync with assetCache.evictLRU()
// assetCache already manages ObjectURLs with proper LRU eviction
// Local cache was storing revoked URLs causing ERR_FILE_NOT_FOUND
// const objectURLCache = new Map<string, string>();
// const pendingLoads = new Map<string, Promise<string | null>>();

// Global version counter - incrementing forces all SvgTokenShape components to reload
let globalCacheVersion = 0;

// Set of callbacks to notify components of version changes
const versionCallbacks = new Set<() => void>;

// Subscribe to asset update events and increment version to trigger reloads
assetEvents.subscribe(() => {
  globalCacheVersion++;
  // Notify all mounted components
  versionCallbacks.forEach(cb => cb());
});

// Padding around the border (in virtual units)
const PADDING = 1;

/**
 * Get the current global cache version
 */
export function getGlobalCacheVersion(): number {
  return globalCacheVersion;
}

/**
 * Clear the asset cache - delegates to assetCache
 * Call this when loading a pack to force re-loading of all images
 */
export function clearResolvedImageCache(): void {
  // Delegate to assetCache which manages ObjectURLs properly
  clearAssetCache();
  globalCacheVersion++;
}

// Default border radius in viewBox units (scales with the SVG)
const BORDER_RADIUS = 3;

interface SvgTokenShapeProps {
  shape: TokenShape;
  width: number;
  height: number;
  color: string;
  content?: string;          // Hash (sha256:...) or URL
  borderWidth?: number;
  borderColor?: string;
  opacity?: number;
  borderOpacity?: number;
  rotation?: number;
  showThickness?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  tokenName?: string;
  fontColor?: string;
  preserveAspectRatio?: string;
}

/**
 * Calculate font size to fit text within available width with padding
 * @param textLength - Length of text to fit
 * @param availableWidth - Width available for text (token width minus padding)
 * @returns Font size in virtual units
 */
function calculateFontSizeForWidth(textLength: number, availableWidth: number): number {
  // Average character width is approximately 0.6 of font size for most fonts
  // Formula: fontSize = availableWidth / (textLength * 0.6)
  const avgCharWidthRatio = 0.6;
  return availableWidth / (textLength * avgCharWidthRatio);
}

/**
 * Calculate dynamic font size based on text length and token dimensions
 */
function calculateFontSize(textLength: number, tokenWidth: number, tokenHeight: number, longestWordLength: number): number {
  const baseSize = Math.min(tokenWidth, tokenHeight) / 6;

  let size = baseSize;
  if (textLength <= 3) size = baseSize;
  else if (textLength <= 6) size = baseSize * 0.7;
  else if (textLength <= 10) size = baseSize * 0.5;
  else size = baseSize * 0.656;

  if (longestWordLength > 9) size = size * 0.75;
  else if (longestWordLength > 12) size = size * 0.6;
  else if (longestWordLength > 15) size = size * 0.5;

  return size;
}

/**
 * Split token name into lines for better display on tokens
 * If text is > 12 chars and contains spaces, split into 2-3 roughly equal lines by word count
 */
function splitTokenNameIntoLines(text: string): string[] {
  // If text is short or has no spaces, keep as single line
  if (text.length <= 12 || !text.includes(' ')) {
    return [text];
  }

  const words = text.trim().split(/\s+/);
  const wordCount = words.length;

  // Single word but long - keep as one line
  if (wordCount === 1) {
    return [text];
  }

  // Two words - split evenly
  if (wordCount === 2) {
    return words;
  }

  // Three words - either all on separate lines or 2+1
  if (wordCount === 3) {
    // If total length is short, 2+1 split is better
    if (text.length <= 18) {
      return [words[0], words.slice(1).join(' ')];
    }
    return words;
  }

  // Four words - split 2+2
  if (wordCount === 4) {
    return [words.slice(0, 2).join(' '), words.slice(2).join(' ')];
  }

  // Five words - split 2+3 or 2+2+1
  if (wordCount === 5) {
    return [words.slice(0, 2).join(' '), words.slice(2).join(' ')];
  }

  // Six words - split 2+2+2
  if (wordCount === 6) {
    return [
      words.slice(0, 2).join(' '),
      words.slice(2, 4).join(' '),
      words.slice(4).join(' ')
    ];
  }

  // For 7+ words, distribute into 3 lines roughly equal by word count
  const linesCount = 3;
  const wordsPerLine = Math.ceil(wordCount / linesCount);
  const lines: string[] = [];

  for (let i = 0; i < wordCount; i += wordsPerLine) {
    lines.push(words.slice(i, i + wordsPerLine).join(' '));
  }

  // Limit to max 3 lines
  return lines.slice(0, 3);
}

/**
 * Check if content is an asset hash (needs loading)
 */
function isAssetHash(content: string): boolean {
  return content?.startsWith('sha256:') || false;
}

/**
 * Generate a path for the border that surrounds the content
 * The path is LARGER than content by borderWidth/2 (so outer edge of stroke is borderWidth away)
 */
function generateBorderPath(
  shape: TokenShape,
  contentWidth: number,
  contentHeight: number,
  borderWidth: number
): string {
  const outerWidth = contentWidth + borderWidth / 2;
  const outerHeight = contentHeight + borderWidth / 2;

  if (shape === TokenShape.HEX) {
    const hexData = generatePointyTopHexPath(Math.round(outerWidth), Math.round(outerHeight));
    return hexData.path;
  } else if (shape === TokenShape.HEX_HORIZONTAL) {
    const hexData = generateFlatTopHexPath(Math.round(outerWidth), Math.round(outerHeight));
    return hexData.path;
  } else if (shape === TokenShape.CIRCLE) {
    const cx = outerWidth / 2;
    const cy = outerHeight / 2;
    const rx = outerWidth / 2;
    const ry = outerHeight / 2;
    return `M ${cx} ${cy - ry} A ${rx} ${ry} 0 1 1 ${cx} ${cy + ry} A ${rx} ${ry} 0 1 1 ${cx} ${cy - ry}`;
  } else if (shape === TokenShape.TRIANGLE) {
    return generateRoundedTrianglePath(outerWidth, outerHeight);
  } else {
    // For SQUARE, return empty path (will use rect with borderRadius)
    return '';
  }
}

/**
 * Generate a rounded triangle path
 * Triangle with small rounded corners for better visual appearance
 * Top corner gets smaller radius to appear visually consistent with bottom corners
 */
function generateRoundedTrianglePath(width: number, height: number, baseRadius: number = 2): string {
  const halfWidth = width / 2;
  // Top corner gets smaller radius since it's sharper
  const topRadius = baseRadius * 0.6;
  const bottomRadius = baseRadius;

  return `M ${halfWidth} ${topRadius}
    Q ${halfWidth + topRadius} 0, ${halfWidth + topRadius} ${topRadius}
    L ${width - bottomRadius} ${height - bottomRadius}
    Q ${width} ${height}, ${width - bottomRadius} ${height}
    L ${bottomRadius} ${height}
    Q 0 ${height}, ${bottomRadius} ${height - bottomRadius}
    L ${halfWidth - topRadius} ${topRadius}
    Q ${halfWidth} 0, ${halfWidth} ${topRadius}
    Z`.replace(/\s+/g, ' ');
}

/**
 * Generate a path for the content (the main shape inside the border)
 */
function generateContentPath(
  shape: TokenShape,
  width: number,
  height: number
): { path: string; useRect?: boolean } {
  if (shape === TokenShape.HEX) {
    const hexData = generatePointyTopHexPath(Math.round(width), Math.round(height));
    return { path: hexData.path };
  } else if (shape === TokenShape.HEX_HORIZONTAL) {
    const hexData = generateFlatTopHexPath(Math.round(width), Math.round(height));
    return { path: hexData.path };
  } else if (shape === TokenShape.CIRCLE) {
    const cx = width / 2;
    const cy = height / 2;
    const rx = width / 2;
    const ry = height / 2;
    return { path: `M ${cx} ${cy - ry} A ${rx} ${ry} 0 1 1 ${cx} ${cy + ry} A ${rx} ${ry} 0 1 1 ${cx} ${cy - ry}` };
  } else if (shape === TokenShape.TRIANGLE) {
    return { path: generateRoundedTrianglePath(width, height) };
  } else {
    // For SQUARE, return empty path (will use rect with borderRadius)
    return { path: '', useRect: true };
  }
}

/**
 * SVG-based token shape
 * Layout: [PADDING][BORDER][CONTENT][BORDER][PADDING]
 * The content size is width x height (from token settings)
 * The border is OUTSIDE the content
 * Padding provides extra space around everything
 */
export const SvgTokenShape: React.FC<SvgTokenShapeProps> = ({
  shape,
  width,
  height,
  color,
  content,
  borderWidth = 2,
  borderColor = '#ffffff',
  opacity = 100,
  borderOpacity = 100,
  rotation = 0,
  showThickness = true,
  className = '',
  style = {},
  children,
  tokenName,
  fontColor = '#ffffff',
  preserveAspectRatio = "xMidYMid meet",
}) => {
  // 🔥 FIX: Initialize resolvedContent from cache if available to prevent flicker
  // When tokens are moved between cursor slot and tabletop, component remounts.
  // By initializing from cache, we avoid the "flash" of fallback color.
  const [resolvedContent, setResolvedContent] = useState<string | undefined>(() => {
    if (!content) return undefined;
    if (!isAssetHash(content)) return content;

    // Check if asset is already cached in memory
    const cachedEntry = assetCache.getEntryInfo(content);
    if (cachedEntry) {
      // Asset is in memory cache - use it immediately to prevent flicker
      // Acquire reference to prevent it from being evicted while in use
      assetCache.acquire(content);
      return cachedEntry.url;
    }

    return undefined;
  });

  const [isLoaded, setIsLoaded] = useState(() => {
    if (!content) return true;
    if (!isAssetHash(content)) return true;
    // Check if already in cache
    return assetCache.hasInMemory(content);
  });

  // 🔥 FIX: Local state that triggers re-render when global version changes
  const [forceUpdate, setForceUpdate] = useState(0);

  // Subscribe to global version changes
  useEffect(() => {
    const callback = () => {
      setForceUpdate(prev => prev + 1);
      setIsLoaded(false); // Force reload
      // 🔥 FIX: Don't clear resolvedContent immediately - keep it visible until new content loads
      // This prevents tokens from appearing transparent during reload
      // setResolvedContent(undefined); // REMOVED: Don't clear old URL yet
    };

    versionCallbacks.add(callback);

    return () => {
      versionCallbacks.delete(callback);
    };
  }, []);

  // Load asset when content changes or when forceUpdate changes
  useEffect(() => {
    if (!content) {
      setResolvedContent(undefined);
      setIsLoaded(true);
      return;
    }

    // If not an asset hash, use as-is (regular URL)
    if (!isAssetHash(content)) {
      setResolvedContent(content);
      setIsLoaded(true);
      return;
    }

    // 🔥 FIX: Check if already cached from initial state or previous load
    // This prevents unnecessary re-loading when component remounts
    if (resolvedContent && assetCache.hasInMemory(content)) {
      // Verify the cached URL is still valid
      const cachedEntry = assetCache.getEntryInfo(content);
      if (cachedEntry && cachedEntry.url === resolvedContent) {
        setIsLoaded(true);
        return;
      }
    }

    let cancelled = false;

    // Load from asset system with retry mechanism
    const loadWithRetry = async (retries = 3): Promise<string | null> => {
      for (let i = 0; i < retries; i++) {
        try {
          const objectUrl = await getAssetURL(content);
          if (cancelled) {
            // 🔥 FIX: Release reference if cancelled during load
            releaseAsset(content);
            return null;
          }
          return objectUrl;
        } catch (error) {
          const isAssetNotFound = (error as Error).message.includes('Asset not found');
          if (isAssetNotFound && i < retries - 1) {
            // Asset might still be saving to IndexedDB - wait and retry
            const delay = 100 * Math.pow(2, i); // 100ms, 200ms, 400ms
            await new Promise(resolve => setTimeout(resolve, delay));
          } else {
            // Final retry failed or different error
            throw error;
          }
        }
      }
      return null;
    };

    loadWithRetry()
      .then((objectUrl) => {
        if (cancelled) return;
        if (!objectUrl) {
          setResolvedContent(undefined);
          setIsLoaded(true);
          return;
        }
        setResolvedContent(objectUrl);
        setIsLoaded(true);
      })
      .catch((error) => {
        if (cancelled) return;
        setResolvedContent(undefined);
        setIsLoaded(true);
      });

    return () => {
      cancelled = true;
      // 🔥 FIX: Release reference when content changes or component unmounts
      if (isAssetHash(content)) {
        releaseAsset(content);
      }
    };
  }, [content, forceUpdate]); // Include forceUpdate to trigger reload when assets are updated

  // All tokens use the same border radius
  const borderRadius = BORDER_RADIUS;

  // Generate paths
  const contentPathData = generateContentPath(shape, width, height);
  const borderPath = generateBorderPath(shape, width, height, borderWidth);
  const useRect = shape === TokenShape.SQUARE;

  const uniqueId = React.useId();
  const clipPathId = `token-clip-${uniqueId}`;

  // Layout: [PADDING][BORDER][CONTENT][BORDER][PADDING]
  // Border's INNER edge (where content starts) is at PADDING + borderWidth
  const borderInnerEdge = PADDING + borderWidth;  // Where content starts
  const contentOffset = borderInnerEdge;
  const contentX = contentOffset;
  const contentY = contentOffset;

  // Total SVG size: content + 2*borderWidth + 2*PADDING
  const svgWidth = width + borderWidth * 2 + PADDING * 2;
  const svgHeight = height + borderWidth * 2 + PADDING * 2;

  // Calculate token name display with line wrapping
  let tokenNameElement = null;
  if (tokenName) {
    // Available width for text (token width minus 2 VU padding on each side)
    const availableWidth = width - 4; // 2 VU padding on left and right
    const paddingX = 2; // 2 VU padding from each edge

    // Split name into lines for better display
    const lines = splitTokenNameIntoLines(tokenName);
    const lineCount = lines.length;

    // Find the longest line to determine font size (all lines use same size)
    const longestLineLength = Math.max(...lines.map(line => line.length));
    const fontSize = Math.min(calculateFontSizeForWidth(longestLineLength, availableWidth), 25);

    // Calculate vertical positioning to center the entire text block
    const lineHeight = fontSize * 1.1;
    const totalTextHeight = lineCount * lineHeight;
    // Start Y positions the first line so the entire block is centered, then shift down by 1 VU
    // For triangle, shift down by additional height/4 to align with visual center (centroid)
    const triangleOffset = shape === TokenShape.TRIANGLE ? height / 4 : 0;
    const startY = contentY + height / 2 - totalTextHeight / 2 + lineHeight / 2 + 1 + triangleOffset;

    tokenNameElement = (
      <>
        {lines.map((line, index) => (
          <text
            key={index}
            x={contentX + paddingX + availableWidth / 2}
            y={startY + index * lineHeight}
            textAnchor="middle"
            dominantBaseline="central"
            fill={fontColor}
            fontSize={fontSize}
            fontWeight="bold"
            style={{
              pointerEvents: 'none',
              textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
              userSelect: 'none'
            }}
          >
            {line}
          </text>
        ))}
      </>
    );
  }

  return (
    <svg
      width={svgWidth}
      height={svgHeight}
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      preserveAspectRatio={preserveAspectRatio}
      className={className}
      style={{
        transform: `rotate(${rotation}deg)`,
        transformOrigin: 'center',
        opacity: opacity / 100,
        ...style
      }}
    >
      <defs>
        <clipPath id={clipPathId}>
          {useRect ? (
            <rect
              x={contentX}
              y={contentY}
              width={width}
              height={height}
              rx={borderRadius}
              ry={borderRadius}
            />
          ) : (
            <path d={contentPathData.path} transform={`translate(${contentOffset}, ${contentOffset})`} />
          )}
        </clipPath>
      </defs>

      {/* Border - OUTSIDE the content */}
      {borderPath ? (
        <path
          d={borderPath}
          // Position path so it's centered with content (border path is larger by borderWidth/2)
          transform={`translate(${contentOffset - borderWidth / 4}, ${contentOffset - borderWidth / 4})`}
          fill="none"
          stroke={borderColor}
          strokeWidth={borderWidth}
          strokeOpacity={borderOpacity / 100}
        />
      ) : (
        <rect
          // Position rect so it's centered with content
          x={contentOffset - borderWidth / 4}
          y={contentOffset - borderWidth / 4}
          width={width + borderWidth / 2}
          height={height + borderWidth / 2}
          rx={borderRadius + borderWidth / 4}
          ry={borderRadius + borderWidth / 4}
          fill="none"
          stroke={borderColor}
          strokeWidth={borderWidth}
          strokeOpacity={borderOpacity / 100}
        />
      )}

      {/* Content with clip path */}
      <g clipPath={`url(#${clipPathId})`}>
        {resolvedContent ? (
          <image
            href={resolvedContent}
            x={contentX}
            y={contentY}
            width={width}
            height={height}
            preserveAspectRatio={preserveAspectRatio}
          />
        ) : (
          <rect
            x={contentX}
            y={contentY}
            width={width}
            height={height}
            fill={color}
          />
        )}

        {tokenNameElement}
      </g>

      {/* Thickness indicator - inner line showing border thickness */}
      {showThickness && !resolvedContent && borderWidth > 0 && useRect && (
        <rect
          x={contentX + borderRadius}
          y={contentY + borderRadius}
          width={Math.max(0, width - borderRadius * 2)}
          height={Math.max(0, height - borderRadius * 2)}
          rx={Math.max(0, borderRadius - borderWidth / 4)}
          ry={Math.max(0, borderRadius - borderWidth / 4)}
          fill="none"
          stroke={borderColor}
          strokeWidth={borderWidth / 2}
          strokeOpacity={borderOpacity / 100 * 0.5}
        />
      )}

      {children}
    </svg>
  );
};
