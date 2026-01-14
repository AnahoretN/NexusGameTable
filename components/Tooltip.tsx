import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  text?: string;
  showImage?: boolean;
  imageSrc?: string;
  scale?: number;
  children: React.ReactElement;
}

export const Tooltip: React.FC<TooltipProps> = ({
  text,
  showImage,
  imageSrc,
  scale = 125,
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
    }, 300);
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
        left: position.x + 15,
        top: position.y,
        transform: 'translateY(-100%)',
      }}
    >
      <div className="bg-slate-900/95 border border-slate-600 rounded-lg p-3 shadow-xl max-w-xs">
        {showImage && imageSrc && (
          <div
            className="mb-2 rounded overflow-hidden bg-slate-800"
            style={{
              maxWidth: '300px',
            }}
          >
            <img
              src={imageSrc}
              alt=""
              style={{
                width: '100%',
                transform: `scale(${scale / 100})`,
                transformOrigin: 'center center',
                display: 'block',
              }}
            />
          </div>
        )}
        {text && !showImage && (
          <p className="text-sm text-white whitespace-pre-wrap">{text}</p>
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
