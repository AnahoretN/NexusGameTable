import React, { useState, useEffect } from 'react';
import { TokenShape } from '../types';
import { generatePointyTopHexPath, generateFlatTopHexPath } from '../utils/shapePaths';
import { isImageRef, getImageIdFromRef, getFromManagedCache } from '../utils/imageCache';

// Global cache for resolved image URLs to prevent re-loading during drag operations
const resolvedImageCache = new Map<string, string>();
const pendingLoads = new Map<string, Promise<string | null>>();

// Global version counter - incrementing this forces all SvgTokenShape components to reload
let globalCacheVersion = 0;

/**
 * Initialize the global resolved image cache from the managed cache
 * Call this during app startup to pre-populate the cache
 */
export function initResolvedImageCache(): void {
  // The managed cache is already populated from IndexedDB during GameContext init
  // We can't directly access it here, but images will be cached on first use
  // This function exists for future preloading optimization
}

/**
 * Preload an image into the global cache
 */
export function preloadImageUrl(imageId: string, dataUrl: string): void {
  resolvedImageCache.set(imageId, dataUrl);
}

/**
 * Get the current global cache version
 */
export function getGlobalCacheVersion(): number {
  return globalCacheVersion;
}

/**
 * Clear the global resolved image cache
 * Call this when loading a pack to force re-loading of all images
 */
export function clearResolvedImageCache(): void {
  resolvedImageCache.clear();
  pendingLoads.clear();
  globalCacheVersion++; // Increment version to force all components to reload
}

// Default border radius in viewBox units (scales with the SVG)
const BORDER_RADIUS = 3;

interface SvgTokenShapeProps {
  shape: TokenShape;
  width: number;
  height: number;
  color: string;
  content?: string;
  borderWidth?: number;
  borderColor?: string;
  opacity?: number;
  borderOpacity?: number;
  rotation?: number;
  showThickness?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  tokenName?: string; // Token name to display in center
  fontColor?: string; // Font color for token name
  preserveAspectRatio?: string; // Control aspect ratio preservation (default: "none")
  pixelsPerVU?: number; // VU to pixels conversion factor
}

/**
 * Calculate dynamic font size based on text length and token dimensions
 * Also considers longest word to ensure it fits
 */
function calculateFontSize(textLength: number, tokenWidth: number, tokenHeight: number, longestWordLength: number): number {
  const baseSize = Math.min(tokenWidth, tokenHeight) / 6;

  // Reduce font size based on total text length
  let size = baseSize;
  if (textLength <= 3) size = baseSize;
  else if (textLength <= 6) size = baseSize * 0.7;
  else if (textLength <= 10) size = baseSize * 0.5;
  else size = baseSize * 0.656;

  // Further reduce if a single word is too long (more than 8-9 chars)
  if (longestWordLength > 9) {
    size = size * 0.75;
  } else if (longestWordLength > 12) {
    size = size * 0.6;
  } else if (longestWordLength > 15) {
    size = size * 0.5;
  }

  return size;
}

/**
 * SVG-based token shape with rounded corners and proper stroke
 * Uses universal path generation for consistent shapes across the app
 * For HEX shapes, the path adjusts dynamically based on aspect ratio
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
  preserveAspectRatio = "none",
  pixelsPerVU = 1,
}) => {
  // Resolve img_ref:// to data URL from IndexedDB
  const [resolvedContent, setResolvedContent] = useState<string | undefined>(() => {
    // Initialize from global cache if available
    if (content && isImageRef(content)) {
      const imageId = getImageIdFromRef(content);
      return resolvedImageCache.get(imageId) || content;
    }
    return content;
  });

  // Track global cache version for force-reload when pack is loaded
  const [cacheVersion, setCacheVersion] = useState(getGlobalCacheVersion());

  useEffect(() => {
    const currentVersion = getGlobalCacheVersion();
    if (currentVersion !== cacheVersion) {
      setCacheVersion(currentVersion);
      // Force re-resolve content by setting to undefined first
      if (content && isImageRef(content)) {
        setResolvedContent(undefined); // This will trigger the content useEffect
      }
    }
  }, [cacheVersion, content]);

  useEffect(() => {
    if (!content) {
      setResolvedContent(undefined);
      return;
    }

    // If it's not an image reference, use as-is
    if (!isImageRef(content)) {
      setResolvedContent(content);
      return;
    }

    const imageId = getImageIdFromRef(content);

    // Check global cache first (instant)
    if (resolvedImageCache.has(imageId)) {
      const cached = resolvedImageCache.get(imageId);
      if (cached && cached !== resolvedContent) {
        setResolvedContent(cached);
      }
      return;
    }

    // Check managed cache (fast, in-memory)
    const managedCached = getFromManagedCache(imageId);
    if (managedCached) {
      resolvedImageCache.set(imageId, managedCached);
      setResolvedContent(managedCached);
      return;
    }

    // Check if there's already a pending load for this image
    if (pendingLoads.has(imageId)) {
      pendingLoads.get(imageId)!.then(dataUrl => {
        if (dataUrl) {
          setResolvedContent(dataUrl);
        }
      });
      return;
    }

    // Create new load promise from IndexedDB (slower, fallback)
    const loadPromise = new Promise<string | null>((resolve) => {
      const request = indexedDB.open('NexusGameTable_Images', 1);
      request.onerror = () => resolve(null);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['cachedImages'], 'readonly');
        const store = transaction.objectStore('cachedImages');
        const getReq = store.get(imageId);
        getReq.onerror = () => resolve(null);
        getReq.onsuccess = () => {
          const entry = getReq.result;
          const dataUrl = entry ? entry.data : null;
          if (dataUrl) {
            resolvedImageCache.set(imageId, dataUrl);
          }
          resolve(dataUrl);
        };
      };
    });

    pendingLoads.set(imageId, loadPromise);

    loadPromise.then(dataUrl => {
      if (dataUrl && dataUrl !== resolvedContent) {
        setResolvedContent(dataUrl);
      }
      pendingLoads.delete(imageId);
    }).catch(() => {
      pendingLoads.delete(imageId);
    });
  }, [content]);
  // All tokens use the same border radius
  const borderRadius = BORDER_RADIUS;
  // For HEX and HEX_HORIZONTAL, generate dynamic path based on actual pixel dimensions
  let shapeData;
  if (shape === TokenShape.HEX) {
    // Use actual pixel dimensions for correct scaling
    const hexWidth = Math.round(width);
    const hexHeight = Math.round(height);
    shapeData = generatePointyTopHexPath(hexWidth, hexHeight);
  } else if (shape === TokenShape.HEX_HORIZONTAL) {
    const hexWidth = Math.round(width);
    const hexHeight = Math.round(height);
    shapeData = generateFlatTopHexPath(hexWidth, hexHeight);
  } else if (shape === TokenShape.CIRCLE) {
    // Generate circle path with actual dimensions
    const cx = width / 2;
    const rx = width / 2;
    const ry = height / 2;
    const path = `M ${cx} 0 A ${rx} ${ry} 0 1 1 ${cx} ${height} A ${rx} ${ry} 0 1 1 ${cx} 0`;
    shapeData = { path, viewBox: `0 0 ${width} ${height}` };
  } else if (shape === TokenShape.TRIANGLE) {
    // Generate triangle path with actual dimensions
    const path = `M ${width / 2} 0 L ${width} ${height} L 0 ${height} Z`;
    shapeData = { path, viewBox: `0 0 ${width} ${height}` };
  } else {
    // For SQUARE and other shapes, use default with actual dimensions
    shapeData = { path: '', viewBox: `0 0 ${width} ${height}`, useRect: true };
  }

  const { path, viewBox } = shapeData;
  // Use rect rendering for SQUARE shape only
  const useRect = shape === TokenShape.SQUARE;

  // Generate unique ID for this instance
  const uniqueId = React.useId();

  // Parse viewBox to get actual dimensions
  const viewBoxMatch = viewBox.match(/[\d.]+/g);
  const viewBoxWidth = viewBoxMatch ? parseFloat(viewBoxMatch[2]) : 60;
  const viewBoxHeight = viewBoxMatch ? parseFloat(viewBoxMatch[3]) : 60;

  // Convert VU to pixels for stroke width (borderWidth is in VU)
  const strokeWidth = borderWidth * pixelsPerVU;

  // Minimal stroke for rounded corners - don't waste space
  const cornerRadiusStroke = useRect ? 0 : 2;

  // Convert opacity (0-100) to (0-1)
  const fillOpacity = opacity / 100;
  const strokeOpacityVal = borderOpacity / 100;

  // Common SVG props
  const svgProps = {
    width,
    height,
    viewBox,
    preserveAspectRatio,
    className,
    style: {
      transform: `rotate(${rotation}deg)`,
      transformOrigin: 'center',
      overflow: 'visible',
      display: 'block',
      ...style,
    },
  };

  // Props for shapes with rounded corners (SQUARE, RECTANGLE, STANDEE)
  const rectProps = {
    x: 0,
    y: 0,
    width: viewBoxWidth,
    height: viewBoxHeight,
    rx: borderRadius,
    ry: borderRadius,
  };

  return (
    <svg {...svgProps}>
      <defs>
        {/* Clip path for content clipping - keeps thick strokes inside shape bounds */}
        <clipPath id={`token-clip-${uniqueId}`}>
          {useRect ? (
            <rect {...rectProps} />
          ) : (
            <path d={path} />
          )}
        </clipPath>
      </defs>

      {/* Group with clipPath to contain all rendering within shape bounds */}
      <g clipPath={`url(#token-clip-${uniqueId})`}>
        {/* Thickness effect layers - only for non-image tokens */}
        {showThickness && !content && (
          <>
            {useRect ? (
              <>
                <rect {...rectProps} fill={color} transform="translate(2, 2)" opacity={0.4} />
                <rect {...rectProps} fill={color} transform="translate(4, 4)" opacity={0.3} />
              </>
            ) : (
              <>
                <path d={path} fill={color} transform="translate(2, 2)" opacity={0.4} />
                <path d={path} fill={color} transform="translate(4, 4)" opacity={0.3} />
              </>
            )}
          </>
        )}

        {/* Main shape */}
        {resolvedContent ? (
          // With image content - use clipPath
          <>
            {useRect ? (
              <rect {...rectProps} fill={color} fillOpacity={fillOpacity} />
            ) : (
              <path d={path} fill={color} fillOpacity={fillOpacity} />
            )}
            <image
              href={resolvedContent}
              x="0"
              y="0"
              width="100%"
              height="100%"
              preserveAspectRatio="none"
            />
            {/* Border stroke on top */}
            {useRect ? (
              <rect
                {...rectProps}
                fill="none"
                stroke={borderColor}
                strokeOpacity={strokeOpacityVal}
                strokeWidth={strokeWidth}
              />
            ) : (
              <>
                {/* Extra thick stroke in fill color creates rounded corners */}
                {cornerRadiusStroke > 0 && (
                  <path
                    d={path}
                    fill="none"
                    stroke={color}
                    strokeOpacity={fillOpacity}
                    strokeWidth={cornerRadiusStroke}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                )}
                {/* Border stroke on top */}
                <path
                  d={path}
                  fill="none"
                  stroke={borderColor}
                  strokeOpacity={strokeOpacityVal}
                  strokeWidth={strokeWidth}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </>
            )}
          </>
        ) : (
          // Without image - solid color with border
          useRect ? (
            <rect
              {...rectProps}
              fill={color}
              fillOpacity={fillOpacity}
              stroke={borderColor}
              strokeOpacity={strokeOpacityVal}
              strokeWidth={strokeWidth}
            />
          ) : (
            <>
              {/* Extra thick stroke in fill color creates rounded corners */}
              {cornerRadiusStroke > 0 && (
                <path
                  d={path}
                  fill={color}
                  fillOpacity={fillOpacity}
                  stroke={color}
                  strokeOpacity={fillOpacity}
                  strokeWidth={cornerRadiusStroke}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}
              {/* Border stroke on top */}
              <path
                d={path}
                fill={fillOpacity > 0 ? color : 'none'}
                fillOpacity={fillOpacity}
                stroke={borderColor}
                strokeOpacity={strokeOpacityVal}
                strokeWidth={strokeWidth}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </>
          )
        )}
      </g>

      {/* Children overlay (text, icons, etc.) - use viewBox-relative coordinates */}
      {(children || tokenName) && (
        <foreignObject
          x="0"
          y="0"
          width={viewBoxWidth}
          height={viewBoxHeight}
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              overflow: 'hidden',
              transform: 'translateY(-1%)',
            }}
          >
            {children}
            {tokenName && !children && (
              <span
                style={{
                  fontSize: `${calculateFontSize(tokenName.length, width, height, Math.max(...tokenName.split(' ').map(w => w.length)))}px`,
                  fontWeight: 'bold',
                  color: fontColor,
                  textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                  textAlign: 'center',
                  maxWidth: '90%',
                  maxHeight: '100%',
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  lineHeight: 1.1,
                  wordWrap: 'break-word',
                  overflowWrap: 'break-word',
                  wordBreak: 'break-word',
                  hyphens: 'auto',
                }}
              >
                {tokenName}
              </span>
            )}
          </div>
        </foreignObject>
      )}
    </svg>
  );
};

/**
 * Check if a token shape should use SVG rendering
 * Now all token shapes use SVG rendering for consistency
 */
export function shouldUseSvgForToken(_shape: TokenShape): boolean {
  return true;
}

// Memoize SvgTokenShape to prevent unnecessary re-renders
export const SvgTokenShapeMemo = React.memo(SvgTokenShape, (prevProps, nextProps) => {
  // Compare tokenName as well since fontSize calculation depends on its content
  const prevLongestWord = prevProps.tokenName ? Math.max(...prevProps.tokenName.split(' ').map(w => w.length)) : 0;
  const nextLongestWord = nextProps.tokenName ? Math.max(...nextProps.tokenName.split(' ').map(w => w.length)) : 0;

  return (
    prevProps.shape === nextProps.shape &&
    prevProps.width === nextProps.width &&
    prevProps.height === nextProps.height &&
    prevProps.color === nextProps.color &&
    prevProps.content === nextProps.content &&
    prevProps.borderWidth === nextProps.borderWidth &&
    prevProps.borderColor === nextProps.borderColor &&
    prevProps.opacity === nextProps.opacity &&
    prevProps.borderOpacity === nextProps.borderOpacity &&
    prevProps.rotation === nextProps.rotation &&
    prevProps.showThickness === nextProps.showThickness &&
    prevProps.tokenName === nextProps.tokenName &&
    prevProps.fontColor === nextProps.fontColor &&
    prevProps.preserveAspectRatio === nextProps.preserveAspectRatio &&
    prevLongestWord === nextLongestWord
  );
});
