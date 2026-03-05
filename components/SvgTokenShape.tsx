import React from 'react';
import { TokenShape } from '../types';

// SVG paths for shapes that fill the entire viewBox
// Rounded corners achieved via stroke-linejoin="round" with thicker stroke
const SHAPE_PATHS: Record<TokenShape, { path: string; viewBox: string; useRect?: boolean }> = {
  [TokenShape.HEX]: {
    path: 'M 30 0 L 60 16 L 60 48 L 30 64 L 0 48 L 0 16 Z',
    viewBox: '0 0 60 64'
  },
  [TokenShape.TRIANGLE]: {
    path: 'M 30 0 L 60 60 L 0 60 Z',
    viewBox: '0 0 60 60'
  },
  [TokenShape.CIRCLE]: {
    path: 'M 30 0 A 30 30 0 1 1 30 60 A 30 30 0 1 1 30 0',
    viewBox: '0 0 60 60'
  },
  [TokenShape.SQUARE]: {
    path: '',
    viewBox: '0 0 60 60',
    useRect: true
  }
};

// Border radius in viewBox units (scales with the SVG)
const BORDER_RADIUS = 4;

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
}

/**
 * Calculate dynamic font size based on text length and token dimensions
 */
function calculateFontSize(textLength: number, tokenWidth: number, tokenHeight: number): number {
  const baseSize = Math.min(tokenWidth, tokenHeight) / 6; // Reduced from /3 to /6 (half)
  if (textLength <= 3) return baseSize;
  if (textLength <= 6) return baseSize * 0.7;
  if (textLength <= 10) return baseSize * 0.5;
  return baseSize * 0.656; // +25% more (was 0.525)
}

/**
 * SVG-based token shape with rounded corners and proper stroke
 * Used for HEX and TRIANGLE tokens that need rounded corners and proper border
 */
export const SvgTokenShape: React.FC<SvgTokenShapeProps> = ({
  shape,
  width,
  height,
  color,
  content,
  borderWidth = 2,
  borderColor = 'white',
  opacity = 100,
  borderOpacity = 100,
  rotation = 0,
  showThickness = true,
  className = '',
  style = {},
  children,
  tokenName,
  fontColor = 'white',
}) => {
  const shapeData = SHAPE_PATHS[shape] || SHAPE_PATHS[TokenShape.SQUARE];
  const { path, viewBox, useRect } = shapeData;

  // Generate unique ID for this instance
  const uniqueId = React.useId();

  // Consistent 3px stroke width for all shapes
  const strokeWidth = borderWidth;
  // Thicker stroke in fill color creates rounded corners for path shapes
  const cornerRadiusStroke = useRect ? 0 : 6;

  // Convert opacity (0-100) to (0-1)
  const fillOpacity = opacity / 100;
  const strokeOpacityVal = borderOpacity / 100;

  // Common SVG props
  const svgProps = {
    width,
    height,
    viewBox,
    preserveAspectRatio: "none" as const,
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
    width: 60,
    height: 60,
    rx: BORDER_RADIUS,
    ry: BORDER_RADIUS,
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
        {content ? (
          // With image content - use clipPath
          <>
            {useRect ? (
              <rect {...rectProps} fill={color} fillOpacity={fillOpacity} />
            ) : (
              <path d={path} fill={color} fillOpacity={fillOpacity} />
            )}
            <image
              href={content}
              x="0"
              y="0"
              width="100%"
              height="100%"
              preserveAspectRatio="xMidYMid slice"
            />
            {/* Border stroke on top */}
            {useRect ? (
              <rect
                {...rectProps}
                fill="none"
                stroke={borderColor}
                strokeOpacity={strokeOpacityVal}
                strokeWidth={strokeWidth}
                vectorEffect="non-scaling-stroke"
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
                  vectorEffect="non-scaling-stroke"
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
              vectorEffect="non-scaling-stroke"
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
                vectorEffect="non-scaling-stroke"
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
          width="60"
          height="60"
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
              transform: 'translateY(5%)',
            }}
          >
            {children}
            {tokenName && !children && (
              <span
                style={{
                  fontSize: `${calculateFontSize(tokenName.length, width, height)}px`,
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
export function shouldUseSvgForToken(shape: TokenShape): boolean {
  return true;
}

// Memoize SvgTokenShape to prevent unnecessary re-renders
export const SvgTokenShapeMemo = React.memo(SvgTokenShape, (prevProps, nextProps) => {
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
    prevProps.fontColor === nextProps.fontColor
  );
});
