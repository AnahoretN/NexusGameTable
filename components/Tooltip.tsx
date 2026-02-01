import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  text?: string;
  showImage?: boolean;
  imageSrc?: string;
  scale?: number;
  aspectRatio?: number; // width/height ratio for proper tooltip sizing
  baseWidth?: number; // Actual card width at 100% scale (for realistic tooltip sizing)
  children: React.ReactElement;
}

export const Tooltip: React.FC<TooltipProps> = ({
  text,
  showImage,
  imageSrc,
  scale = 125,
  aspectRatio = 1, // Default to square (1:1)
  baseWidth = 300, // Default to 300px for backward compatibility
  children
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<number | null>(null);

  const handleMouseEnter = () => {
    // Only show if we have tooltip content
    if (!text && !showImage) return;

    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Show tooltip after a short delay
    timeoutRef.current = window.setTimeout(() => {
      setIsVisible(true);
    }, 500);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    // Update position on mouse move
    setPosition({ x: e.clientX, y: e.clientY });
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsVisible(false);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const hasContent = text || showImage;

  const tooltipContent = isVisible && hasContent && (
    <div
      className="fixed z-[99999] pointer-events-none"
      style={{
        left: position.x + 5,
        top: position.y,
      }}
    >
      <div className="bg-slate-900/95 border border-slate-600 rounded-lg overflow-hidden shadow-xl">
        {showImage && imageSrc && (
          <img
            src={imageSrc}
            alt=""
            className="block"
            style={{
              width: `${baseWidth * (scale / 100)}px`,
              height: `${baseWidth * (scale / 100) / aspectRatio}px`,
              objectFit: 'contain',
            }}
          />
        )}
        {text && !showImage && (
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
