/**
 * DiceRenderer - Unified dice rendering component
 *
 * Used for:
 * - Dice preview thumbnails in DicePanel
 * - Rolled dice in the roll field
 * - Can be used for regular dice objects on the game board
 */

import React from 'react';
import { TokenShape } from '../types';
import { SvgTokenShape } from './SvgTokenShape';

export interface DiceRenderData {
  // Dice identification
  id: string;
  name: string;

  // Dice properties
  sides: number;
  value?: number; // Current value (if rolled) or display value
  explosiveRoll?: number; // Second roll value for explosive dice

  // Visual properties
  color: string;
  shape?: TokenShape;
  fontColor?: string;

  // Border properties
  borderColor?: string;
  borderWidth?: number;
  borderOpacity?: number;

  // Opacity
  opacity?: number;

  // Explosive dice
  isExplosive?: boolean;
  explosiveColor?: string;
  explosiveTextColor?: string;
  explosiveGlow?: string;

  // Value overrides (custom images/icons for specific values)
  valueOverrides?: Record<number, {
    type: 'image' | 'emoji' | 'icon';
    value: string;
  }>;
}

export interface DiceRendererProps {
  dice: DiceRenderData;
  size?: number; // Base size in pixels (default: 50)
  showValue?: boolean; // Whether to show the value (default: true)
  showSides?: boolean; // Whether to show "d{N}" text below value (default: false)
  className?: string;
  style?: React.CSSProperties;
  animate?: boolean; // Whether to show rolling animation (default: false)
}

// Get dice shape based on number of sides
function getDiceShape(sides: number): TokenShape {
  if (sides < 5) return TokenShape.TRIANGLE;
  if (sides <= 12) return TokenShape.SQUARE;
  return TokenShape.HEX;
}

// Calculate dimensions based on shape
function getDiceDimensions(shape: TokenShape, baseSize: number): { width: number; height: number } {
  const isHex = shape === TokenShape.HEX;
  const isHexHorizontal = shape === TokenShape.HEX_HORIZONTAL;
  const isTriangle = shape === TokenShape.TRIANGLE;

  let width = baseSize;
  let height = baseSize;

  if (isHex) {
    // Pointy-top hex: taller than wide
    height = Math.round(baseSize * 1.15);
  } else if (isHexHorizontal) {
    // Flat-top hex: wider than tall
    width = Math.round(baseSize * 1.15);
    height = Math.round(baseSize / 1.15);
  } else if (isTriangle) {
    // Triangle: width = 1, height = 0.87 ratio
    height = Math.round(baseSize * 0.87);
  }

  return { width, height };
}

export const DiceRenderer: React.FC<DiceRendererProps> = ({
  dice,
  size = 50,
  showValue = true,
  showSides = false,
  className = '',
  style = {},
  animate = false,
}) => {
  const shape = dice.shape || getDiceShape(dice.sides);
  const { width, height } = getDiceDimensions(shape, size);

  const borderWidth = dice.borderWidth ?? 2;
  const displayValue = dice.value ?? 1;

  // For explosive dice, use explosive colors only when actually exploded
  const isExplosive = Boolean(dice.explosiveRoll);

  // Debug: log explosive dice data
  if (isExplosive) {
    console.log('Explosive dice:', {
      name: dice.name,
      explosiveRoll: dice.explosiveRoll,
      explosiveColor: dice.explosiveColor,
      explosiveGlow: dice.explosiveGlow,
    });
  }

  // Use explosive colors when exploded
  const diceColor = isExplosive ? (dice.explosiveColor || '#ff6b00') : dice.color;
  const diceBorderColor = isExplosive ? (dice.explosiveGlow || '#ff0000') : (dice.borderColor || '#ffffff');

  // Calculate content size (fixed regardless of border)
  let baseContentWidth = size * 0.84; // 42px for 50px base
  const baseContentHeight = baseContentWidth;

  // Adjust dimensions for shape
  let contentHeight = baseContentHeight;
  if (shape === TokenShape.HEX) {
    contentHeight = Math.round(baseContentWidth * 1.15);
  } else if (shape === TokenShape.HEX_HORIZONTAL) {
    contentHeight = Math.round(baseContentWidth / 1.15);
  } else if (shape === TokenShape.TRIANGLE) {
    // Triangle: width = 1, height = 0.87 ratio
    contentHeight = Math.round(baseContentWidth * 0.87);
  }

  return (
    <div
      className={`relative flex items-center justify-center ${className} ${animate ? 'animate-explode' : ''}`}
      style={{ width: `${width}px`, height: `${height}px`, ...style }}
    >
      <SvgTokenShape
        shape={shape}
        width={baseContentWidth}
        height={contentHeight}
        color={diceColor}
        content={undefined}
        rotation={0}
        borderWidth={borderWidth}
        borderColor={diceBorderColor}
        opacity={dice.opacity ?? 100}
        borderOpacity={dice.borderOpacity ?? 100}
        showThickness={true}
        fontColor={dice.fontColor || '#ffffff'}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Content area for dice value - offset by PADDING (3px) */}
        {showValue && (
          <foreignObject
            x={3}
            y={shape === TokenShape.TRIANGLE ? 3 + contentHeight * 0.08 : 3}
            width={baseContentWidth}
            height={contentHeight}
          >
            <div xmlns="http://www.w3.org/1999/xhtml" style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.1em',
              width: '100%',
              height: '100%',
              padding: '0',
              margin: '0',
              pointerEvents: 'none',
              boxSizing: 'border-box',
              textAlign: 'center',
            }}>
              {/* Value or custom override */}
              {(() => {
                const valueOverride = dice.valueOverrides?.[displayValue];
                const fontSize = size * 0.36; // 18px for 50px base
                const sidesFontSize = size * 0.18; // 9px for 50px base

                // Show override if available
                if (valueOverride) {
                  if (valueOverride.type === 'image') {
                    return (
                      <>
                        <img
                          src={valueOverride.value}
                          alt={`Value ${displayValue}`}
                          style={{
                            width: `${fontSize * 1.5}px`,
                            height: `${fontSize * 1.5}px`,
                            objectFit: 'contain',
                          }}
                          onError={(e) => {
                            // Fallback to number if image fails to load
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            const fallback = target.parentElement?.querySelector('.fallback-number') as HTMLElement;
                            if (fallback) fallback.style.display = 'block';
                          }}
                        />
                        <span
                          className="fallback-number"
                          style={{ display: 'none', fontSize: `${fontSize}px`, fontWeight: 'bold', color: dice.fontColor || '#ffffff', lineHeight: '1' }}
                        >
                          {displayValue}
                        </span>
                      </>
                    );
                  } else {
                    // emoji or icon
                    return (
                      <span style={{ fontSize: `${fontSize * 1.2}px`, lineHeight: '1' }}>
                        {valueOverride.value}
                      </span>
                    );
                  }
                }

                // Default: show number (and optionally sides)
                return (
                  <>
                    <span style={{
                      fontSize: `${fontSize}px`,
                      fontWeight: 'bold',
                      // Use explosive text color if dice exploded
                      color: (dice.explosiveRoll && dice.explosiveTextColor)
                        ? dice.explosiveTextColor
                        : (dice.fontColor || '#ffffff'),
                      lineHeight: '1',
                    }}>
                      {displayValue}
                    </span>
                    {showSides && (
                      <span style={{
                        fontSize: `${sidesFontSize}px`,
                        fontWeight: 'normal',
                        color: dice.fontColor || '#ffffff',
                        lineHeight: '1',
                      }}>
                        d{dice.sides}
                      </span>
                    )}
                  </>
                );
              })()}
            </div>
          </foreignObject>
        )}
      </SvgTokenShape>
    </div>
  );
};

export default DiceRenderer;
