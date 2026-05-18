import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { getAssetURL, isValidHash } from '../utils/assets';

// Global tooltip tracker for memory management
interface TooltipTracker {
  [id: string]: {
    timestamp: number;
    element: HTMLElement;
  };
}

const globalTooltipTracker: TooltipTracker = {};
const MAX_TOOLTIP_AGE = 60000; // 1 minute
const CLEANUP_INTERVAL = 30000; // 30 seconds

// Global cleanup function
function cleanupOldTooltips() {
  const now = Date.now();
  Object.keys(globalTooltipTracker).forEach(id => {
    const tooltip = globalTooltipTracker[id];
    if (now - tooltip.timestamp > MAX_TOOLTIP_AGE) {
      delete globalTooltipTracker[id];
    }
  });
}

// Start global cleanup interval
if (typeof window !== 'undefined') {
  setInterval(cleanupOldTooltips, CLEANUP_INTERVAL);
}

interface TooltipProps {
  text?: string;
  showImage?: boolean;
  imageSrc?: string;
  scale?: number;
  aspectRatio?: number; // width/height ratio for proper tooltip sizing
  baseWidth?: number; // Actual card width at 100% scale (for realistic tooltip sizing)
  // Sprite sheet support - for showing specific card from sprite sheet
  spriteIndex?: number;
  spriteColumns?: number;
  spriteRows?: number;
  children: React.ReactElement;
}

export const Tooltip: React.FC<TooltipProps> = ({
  text,
  showImage,
  imageSrc,
  scale = 125,
  aspectRatio = 1, // Default to square (1:1)
  baseWidth = 300, // Default to 300px for backward compatibility
  spriteIndex,
  spriteColumns,
  spriteRows,
  children
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [resolvedImageSrc, setResolvedImageSrc] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<number | null>(null);
  const tooltipId = useRef<string>(`tooltip-${Date.now()}-${Math.random()}`);

  // Register tooltip in global tracker when visible
  useEffect(() => {
    if (isVisible && containerRef.current) {
      globalTooltipTracker[tooltipId.current] = {
        timestamp: Date.now(),
        element: containerRef.current
      };
    }

    return () => {
      delete globalTooltipTracker[tooltipId.current];
    };
  }, [isVisible]);

  const handleMouseEnter = useCallback(() => {
    // Only show if we have tooltip content
    // Show if there's text OR if showImage is enabled with a valid image source
    if (!text && (!showImage || !imageSrc)) return;

    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Show tooltip after a short delay
    timeoutRef.current = window.setTimeout(() => {
      setIsVisible(true);
    }, 500);
  }, [text, showImage, imageSrc]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // Update position on mouse move
    setPosition({ x: e.clientX, y: e.clientY });
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsVisible(false);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Resolve sha256: URLs to blob URLs
  useEffect(() => {
    if (!imageSrc) {
      setResolvedImageSrc(null);
      return;
    }

    if (isValidHash(imageSrc)) {
      getAssetURL(imageSrc)
        .then(setResolvedImageSrc)
        .catch(() => setResolvedImageSrc(null));
    } else {
      setResolvedImageSrc(imageSrc);
    }
  }, [imageSrc]);

  // Only show tooltip if we have actual content to display
  const hasImageContent = showImage && resolvedImageSrc;
  const hasTextContent = text && text.trim().length > 0;
  const hasContent = hasImageContent || hasTextContent;

  // Calculate sprite position if sprite sheet is used
  const hasSpriteInfo = spriteIndex !== undefined && spriteColumns && spriteRows;
  const spriteCol = hasSpriteInfo ? spriteIndex % spriteColumns : 0;
  const spriteRow = hasSpriteInfo ? Math.floor(spriteIndex / spriteColumns) : 0;
  const spriteColPercent = spriteColumns && spriteColumns > 1 ? (spriteCol / (spriteColumns - 1)) * 100 : 0;
  const spriteRowPercent = spriteRows && spriteRows > 1 ? (spriteRow / (spriteRows - 1)) * 100 : 0;

  // Calculate tooltip dimensions
  const tooltipWidth = baseWidth * (scale / 100);
  const tooltipHeight = tooltipWidth / aspectRatio;

  const tooltipContent = isVisible && hasContent && (
    <div
      className="fixed z-[99998] pointer-events-none"
      style={{
        left: position.x + 5,
        top: position.y,
        // Firefox fix: ensure proper positioning with transforms
        willChange: 'transform, left, top',
      }}
    >
      <div
        className="bg-slate-900/95 border border-slate-600 rounded-lg overflow-hidden shadow-xl"
        style={{
          // For image tooltips (with or without text): use calculated dimensions
          // For text-only tooltips: size based on content
          ...(hasImageContent ? {
            minWidth: tooltipWidth,
            maxWidth: tooltipWidth,
            ...(hasTextContent ? {
              // If both image and text, let height be determined by content
              minHeight: tooltipHeight,
            } : {
              minHeight: tooltipHeight,
              maxHeight: tooltipHeight,
            }),
          } : {
            // Text-only: let content determine size, with max constraints
            maxWidth: Math.min(400, window.innerWidth - 20),
            maxHeight: Math.min(300, window.innerHeight - 20),
          })
        }}
      >
        {hasImageContent && (
          hasSpriteInfo ? (
            // Sprite sheet: use background-image to show correct portion
            <div
              style={{
                width: tooltipWidth,
                height: hasTextContent ? tooltipHeight : tooltipHeight,
                backgroundImage: `url(${resolvedImageSrc})`,
                backgroundSize: `${spriteColumns! * 100}% ${spriteRows! * 100}%`,
                backgroundPosition: `${spriteColPercent}% ${spriteRowPercent}%`,
                backgroundRepeat: 'no-repeat',
                imageRendering: 'auto',
              }}
            />
          ) : (
            // Regular image: use img tag
            <img
              src={resolvedImageSrc!}
              alt=""
              className="block w-full h-full object-cover"
              style={{
                width: tooltipWidth,
                height: hasTextContent ? tooltipHeight : tooltipHeight,
                imageRendering: 'auto',
              }}
            />
          )
        )}
        {hasTextContent && (
          <div className="p-3">
            <p className="text-sm text-white whitespace-pre-wrap">{text}</p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div
        ref={containerRef}
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ display: 'contents' }}
      >
        {children}
      </div>
      {tooltipContent && createPortal(tooltipContent, document.body)}
    </>
  );
};
