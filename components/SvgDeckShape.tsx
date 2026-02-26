import React from 'react';
import { CardShape, CardOrientation } from '../types';

// SVG paths for deck shapes
const SHAPE_PATHS: Record<CardShape, { path: string; viewBox: string; horizontalPath?: string }> = {
  [CardShape.HEX]: {
    // Hexagon with point at top (vertical orientation)
    path: 'M 50 0 L 93.3 25 L 93.3 75 L 50 100 L 6.7 75 L 6.7 25 Z',
    viewBox: '0 0 100 100',
    // Horizontal: points at left/right
    horizontalPath: 'M 25 6.7 L 75 6.7 L 100 50 L 75 93.3 L 25 93.3 L 0 50 Z'
  },
  [CardShape.TRIANGLE]: {
    // Triangle with point at top
    path: 'M 50 5 L 95 95 L 5 95 Z',
    viewBox: '0 0 100 100',
    // Horizontal: point at right
    horizontalPath: 'M 5 50 L 95 5 L 95 95 Z'
  },
  [CardShape.CIRCLE]: {
    path: 'M 50 0 A 50 50 0 1 1 50 100 A 50 50 0 1 1 50 0',
    viewBox: '0 0 100 100'
  },
  [CardShape.SQUARE]: {
    path: 'M 0 0 L 100 0 L 100 100 L 0 100 Z',
    viewBox: '0 0 100 100'
  },
  [CardShape.POKER]: {
    path: 'M 0 0 L 100 0 L 100 100 L 0 100 Z',
    viewBox: '0 0 100 100'
  },
  [CardShape.BRIDGE]: {
    path: 'M 0 0 L 100 0 L 100 100 L 0 100 Z',
    viewBox: '0 0 100 100'
  },
  [CardShape.MINI_US]: {
    path: 'M 0 0 L 100 0 L 100 100 L 0 100 Z',
    viewBox: '0 0 100 100'
  },
  [CardShape.MINI_EURO]: {
    path: 'M 0 0 L 100 0 L 100 100 L 0 100 Z',
    viewBox: '0 0 100 100'
  }
};

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
 * Used for HEX and TRIANGLE decks to get proper border that follows the shape
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
  const shapeData = SHAPE_PATHS[shape] || SHAPE_PATHS[CardShape.POKER];

  // For geometric shapes (HEX, TRIANGLE), use horizontal path if orientation is horizontal
  const isGeometric = shape === CardShape.HEX || shape === CardShape.TRIANGLE;
  const useHorizontalPath = isGeometric && orientation === CardOrientation.HORIZONTAL;
  const path = useHorizontalPath && shapeData.horizontalPath ? shapeData.horizontalPath : shapeData.path;
  const viewBox = shapeData.viewBox;

  const uniqueId = React.useId();

  // For triangle decks, we need to wrap text more aggressively
  // Calculate better positioning for triangle text
  const isTriangle = shape === CardShape.TRIANGLE;

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
      />

      {/* Content container with clip path */}
      <g clipPath={`url(#deck-clip-${uniqueId})`}>
        {children}
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
  // For triangle, wrap text more aggressively to fit within the triangle
  // The triangle narrows toward the top, so we need smaller text and more wrapping

  if (isTriangle) {
    // For triangle: try to split words, limit words per line to 2-3
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
            className="text-[10px] text-slate-300 font-bold select-none drop-shadow-md leading-tight"
            style={{ fontSize: '9px' }}
          >
            {line}
          </span>
        ))}
        <span className="text-[10px] text-slate-500 select-none drop-shadow-md mt-0.5">
          {count} / {totalCount}
        </span>
      </div>
    );
  }

  // For other shapes, normal display
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
