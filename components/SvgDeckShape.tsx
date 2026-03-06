import React from 'react';
import { CardShape, CardOrientation } from '../types';
import { getCardShapePath } from '../utils/shapePaths';

interface SvgDeckShapeProps {
  shape: CardShape;
  width: number;
  height: number;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  orientation?: CardOrientation;
}

/**
 * SVG-based deck shape with proper border/stroke
 * Uses universal path generation for consistent shapes across the app
 * For HEX shapes, the path adjusts dynamically based on aspect ratio
 */
export const SvgDeckShape: React.FC<SvgDeckShapeProps> = ({
  shape,
  width,
  height,
  backgroundColor = '#1e293b',
  borderColor = '#64748b',
  borderWidth = 2,
  children,
  className = '',
  style = {},
  orientation = CardOrientation.VERTICAL
}) => {
  // Calculate aspect ratio for dynamic shapes
  const aspectRatio = width / height;

  // Get shape path using universal path generation
  const { path, viewBox } = getCardShapePath(shape, orientation, aspectRatio);

  const uniqueId = React.useId();

  // Parse viewBox to get dimensions for foreignObject
  const viewBoxValues = viewBox.split(' ').map(Number);
  const vbWidth = viewBoxValues[2];
  const vbHeight = viewBoxValues[3];

  return (
    <svg
      width={width}
      height={height}
      viewBox={viewBox}
      preserveAspectRatio="none"
      className={className}
      style={{
        display: 'block',
        overflow: 'visible',
        ...style,
      }}
    >
      <defs>
        <clipPath id={`deck-clip-${uniqueId}`}>
          <path d={path} />
        </clipPath>
      </defs>

      {/* Background */}
      <path
        d={path}
        fill={backgroundColor}
        stroke={borderColor}
        strokeWidth={borderWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />

      {/* Content container with clip path - use actual viewBox dimensions */}
      <g clipPath={`url(#deck-clip-${uniqueId})`}>
        <foreignObject x="0" y="0" width={vbWidth} height={vbHeight}>
          <div className="w-full h-full flex flex-col items-center justify-center">
            {children}
          </div>
        </foreignObject>
      </g>
    </svg>
  );
};

/**
 * Component for rendering deck label (name and count) that adapts to shape
 */
interface DeckLabelProps {
  name: string;
  count: number;
  totalCount: number;
  shape: CardShape;
  isTriangle?: boolean;
}

export const DeckLabel: React.FC<DeckLabelProps> = ({
  name,
  count,
  totalCount,
  shape,
  isTriangle = shape === CardShape.TRIANGLE
}) => {
  // For geometric shapes (HEX, CIRCLE, TRIANGLE), the foreignObject scaling makes text appear larger
  // We need to use smaller font sizes to compensate
  const isGeometric = shape === CardShape.HEX || shape === CardShape.CIRCLE;

  if (isTriangle) {
    // For triangle: wrap text more aggressively to fit within the triangle
    // The triangle narrows toward the top, so we need smaller text and more wrapping
    const words = name.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      if (currentLine.length + word.length + 1 > 12) { // Limit to ~12 chars per line
        if (currentLine) {
          lines.push(currentLine);
        }
        currentLine = word;
      } else {
        currentLine = currentLine ? `${currentLine} ${word}` : word;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }

    // If still too long, truncate each line
    const maxLines = 3;
    const displayLines = lines.slice(0, maxLines).map(line =>
      line.length > 15 ? line.substring(0, 12) + '...' : line
    );

    return (
      <div className="flex flex-col items-center justify-center text-center px-2">
        {displayLines.map((line, i) => (
          <span
            key={i}
            className="text-slate-300 font-bold select-none drop-shadow-md leading-tight"
            style={{ fontSize: '11px' }}
          >
            {line}
          </span>
        ))}
        <span className="text-slate-500 select-none drop-shadow-md mt-0.5" style={{ fontSize: '11px' }}>
          {count} / {totalCount}
        </span>
      </div>
    );
  }

  if (isGeometric) {
    // For HEX and CIRCLE: use smaller font size to compensate for SVG foreignObject scaling
    return (
      <div className="flex flex-col items-center justify-center text-center px-2">
        <span
          className="text-slate-300 font-bold select-none drop-shadow-md leading-tight"
          style={{ fontSize: '11px' }}
        >
          {name}
        </span>
        <span
          className="text-slate-500 select-none drop-shadow-md mt-0.5"
          style={{ fontSize: '11px' }}
        >
          {count} / {totalCount}
        </span>
      </div>
    );
  }

  // For other shapes (POKER, BRIDGE, etc.), normal display
  return (
    <div className="flex flex-col items-center justify-center">
      <span className="text-xs text-slate-300 font-bold px-2 text-center select-none drop-shadow-md">
        {name}
      </span>
      <span className="text-xs text-slate-500 select-none drop-shadow-md">
        {count} / {totalCount}
      </span>
    </div>
  );
};

/**
 * Check if a card shape should use SVG rendering for decks
 */
export function shouldUseSvgForDeck(shape: CardShape): boolean {
  return shape === CardShape.HEX || shape === CardShape.TRIANGLE || shape === CardShape.CIRCLE;
}

// Memoize SvgDeckShape to prevent unnecessary re-renders
export const SvgDeckShapeMemo = React.memo(SvgDeckShape, (prevProps, nextProps) => {
  return (
    prevProps.shape === nextProps.shape &&
    prevProps.width === nextProps.width &&
    prevProps.height === nextProps.height &&
    prevProps.backgroundColor === nextProps.backgroundColor &&
    prevProps.borderColor === nextProps.borderColor &&
    prevProps.borderWidth === nextProps.borderWidth &&
    prevProps.orientation === nextProps.orientation
  );
});

// Memoize DeckLabel to prevent unnecessary re-renders
export const DeckLabelMemo = React.memo(DeckLabel, (prevProps, nextProps) => {
  return (
    prevProps.name === nextProps.name &&
    prevProps.count === nextProps.count &&
    prevProps.totalCount === nextProps.totalCount &&
    prevProps.shape === nextProps.shape
  );
});
