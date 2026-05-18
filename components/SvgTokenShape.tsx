import React, { useState, useEffect } from 'react';
import { TokenShape } from '../types';
import { generatePointyTopHexPath, generateFlatTopHexPath } from '../utils/shapePaths';
import { getAssetURL } from '../utils/assets';

// Global ObjectURL cache to prevent re-loading during drag operations
const objectURLCache = new Map<string, string>();
const pendingLoads = new Map<string, Promise<string | null>>();

// Global version counter - incrementing forces all SvgTokenShape components to reload
let globalCacheVersion = 0;

// Padding around the border (in virtual units)
const PADDING = 1;

/**
 * Initialize the global ObjectURL cache
 */
export function initResolvedImageCache(): void {
  // Assets are pre-loaded into the asset cache during app initialization
}

/**
 * Preload an image ObjectURL into the global cache
 */
export function preloadImageUrl(imageId: string, objectUrl: string): void {
  objectURLCache.set(imageId, objectUrl);
}

/**
 * Get the current global cache version
 */
export function getGlobalCacheVersion(): number {
  return globalCacheVersion;
}

/**
 * Clear the global ObjectURL cache
 * Call this when loading a pack to force re-loading of all images
 */
export function clearResolvedImageCache(): void {
  // Revoke all ObjectURLs to free memory
  for (const [, url] of objectURLCache.entries()) {
    URL.revokeObjectURL(url);
  }
  objectURLCache.clear();
  pendingLoads.clear();
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
    return `M ${outerWidth / 2} 0 L ${outerWidth} ${outerHeight} L 0 ${outerHeight} Z`;
  } else {
    // For SQUARE, return empty path (will use rect with borderRadius)
    return '';
  }
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
    return { path: `M ${width / 2} 0 L ${width} ${height} L 0 ${height} Z` };
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
  const [resolvedContent, setResolvedContent] = useState<string | undefined>(() => {
    // Initialize from global cache if available
    if (content && objectURLCache.has(content)) {
      return objectURLCache.get(content);
    }
    return undefined;
  });

  const [cacheVersion, setCacheVersion] = useState(getGlobalCacheVersion());

  // Handle cache version changes (pack loading)
  useEffect(() => {
    const currentVersion = getGlobalCacheVersion();
    if (currentVersion !== cacheVersion) {
      setCacheVersion(currentVersion);
      setResolvedContent(undefined); // Force reload
    }
  }, [cacheVersion]);

  // Load asset when content changes
  useEffect(() => {
    if (!content) {
      setResolvedContent(undefined);
      return;
    }

    // If not an asset hash, use as-is (regular URL)
    if (!isAssetHash(content)) {
      setResolvedContent(content);
      return;
    }

    // Check global cache first (instant)
    if (objectURLCache.has(content)) {
      const cached = objectURLCache.get(content);
      if (cached && cached !== resolvedContent) {
        setResolvedContent(cached);
      }
      return;
    }

    // Check if already loading
    if (pendingLoads.has(content)) {
      pendingLoads.get(content)!.then(url => {
        if (url) setResolvedContent(url);
      });
      return;
    }

    // Load from new asset system
    const loadPromise = getAssetURL(content)
      .then((objectUrl) => {
        objectURLCache.set(content, objectUrl);
        setResolvedContent(objectUrl);
        return objectUrl;
      })
      .catch((error) => {
        console.error(`[SvgTokenShape] Failed to load asset ${content}:`, error);
        return null;
      });

    pendingLoads.set(content, loadPromise);

    loadPromise.finally(() => {
      pendingLoads.delete(content);
    });
  }, [content]);

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

  // Calculate token name font size
  let tokenNameElement = null;
  if (tokenName && !resolvedContent) {
    const words = tokenName.split(' ');
    const textLength = tokenName.length;
    const longestWordLength = Math.max(...words.map(w => w.length));
    const fontSize = calculateFontSize(textLength, width, height, longestWordLength);

    tokenNameElement = (
      <text
        x={contentX + width / 2}
        y={contentY + height / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={fontColor}
        fontSize={fontSize}
        fontWeight="bold"
        style={{
          pointerEvents: 'none',
          textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
          userSelect: 'none'
        }}
      >
        {tokenName}
      </text>
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
