/**
 * @file TabletopBackground.tsx
 *
 * Background rendering component for Tabletop
 * Handles solid background, grid pattern, drawing canvas, and ruler overlay
 *
 * @author Tabletop Refactoring Team
 * @created 2026-04-19
 * @stage 3 of Tabletop.tsx refactoring
 */

import { memo } from 'react';
import { DrawingCanvas } from '../DrawingCanvas';

/**
 * Props for TabletopBackground component
 *
 * @interface TabletopBackgroundProps
 * @property {Object} worldBounds - Dimensions of the game world in pixels
 * @property {number} worldBounds.width - Width of the game world
 * @property {number} worldBounds.height - Height of the game world
 * @property {Object|null} rulerStart - Starting point for ruler tool
 * @property {number} rulerStart.x - X coordinate in virtual units
 * @property {number} rulerStart.y - Y coordinate in virtual units
 * @property {Object|null} rulerCurrent - Current point for ruler tool
 * @property {number} rulerCurrent.x - X coordinate in virtual units
 * @property {number} rulerCurrent.y - Y coordinate in virtual units
 * @property {boolean} isRulerRightClick - Whether right mouse button is held for radius measurement
 * @property {string} currentTool - Currently active tool ('ruler' for ruler overlay)
 * @property {Function} v2p - Function to convert virtual units to pixels
 * @property {number} cursorSlotLength - Number of objects in cursor slot (for DrawingCanvas)
 */

interface TabletopBackgroundProps {
  worldBounds: { width: number; height: number };
  rulerStart: { x: number; y: number } | null;
  rulerCurrent: { x: number; y: number } | null;
  isRulerRightClick: boolean;
  currentTool: string;
  v2p: (vu: number) => number;
  cursorSlotLength: number;
  rulerStep: number; // Step size in VU (0 = disabled)
  language: string; // Language for step text formatting
  pixelsPerVU: number; // Viewport scale for DrawingCanvas VU <-> px conversion
  gridEnabled: boolean; // Local per-player world grid visible + snapping
  gridCellSizeVU: number; // Grid cell size in VU
}

/**
 * TabletopBackground Component
 *
 * Renders the background layers of the tabletop including:
 * - Solid background color
 * - Grid pattern overlay
 * - Drawing canvas for marker/eraser tools
 * - Ruler overlay when ruler tool is active
 *
 * @component
 * @param {TabletopBackgroundProps} props - Component properties
 * @returns {JSX.Element} Rendered background layers
 *
 * @example
 * ```tsx
 * <TabletopBackground
 *   worldBounds={{ width: 5000, height: 5000 }}
 *   rulerStart={{ x: 100, y: 100 }}
 *   rulerCurrent={{ x: 200, y: 200 }}
 *   isRulerRightClick={false}
 *   currentTool="ruler"
 *   v2p={(vu) => vu * 1.08}
 *   cursorSlotLength={3}
 * />
 * ```
 */
export const TabletopBackground = memo<TabletopBackgroundProps>(({
  worldBounds,
  rulerStart,
  rulerCurrent,
  isRulerRightClick,
  currentTool,
  v2p,
  cursorSlotLength,
  rulerStep,
  language,
  pixelsPerVU,
  gridEnabled,
  gridCellSizeVU
}) => {
  return (
    <>
      {/* Solid background color */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: worldBounds.width,
          height: worldBounds.height,
          backgroundColor: '#2c3e50',
          pointerEvents: 'none',
          zIndex: -3
        }}
      />

      {/* Board background with grid pattern */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: worldBounds.width,
          height: worldBounds.height,
          backgroundImage: 'radial-gradient(#34495e 1px, transparent 1px)',
          backgroundSize: '20px 20px',
          pointerEvents: 'none',
          zIndex: -1
        }}
      />

      {/* Local world grid (per-player): guide lines that objects/panels snap to.
          CSS gradient instead of thousands of SVG lines; rescales with zoom. */}
      {gridEnabled && gridCellSizeVU > 0 && (() => {
        const cellPx = v2p(gridCellSizeVU);
        if (cellPx <= 0) return null;
        return (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: worldBounds.width,
              height: worldBounds.height,
              backgroundImage:
                'linear-gradient(to right, rgba(148, 163, 184, 0.35) 1px, transparent 1px),' +
                ' linear-gradient(to bottom, rgba(148, 163, 184, 0.35) 1px, transparent 1px)',
              backgroundSize: `${cellPx}px ${cellPx}px`,
              pointerEvents: 'none',
              zIndex: -1,
            }}
          />
        );
      })()}

      <div
        style={{
          width: worldBounds.width,
          height: worldBounds.height,
          position: 'absolute',
          top: 0,
          left: 0,
          pointerEvents: 'none',
          zIndex: -2
        }}
      />

      {/* Drawing Canvas - overlays the board for marker/eraser tools */}
      <DrawingCanvas
        width={worldBounds.width}
        height={worldBounds.height}
        offsetX={0} // Will be passed from parent
        offsetY={0} // Will be passed from parent
        cursorSlotLength={cursorSlotLength}
        pixelsPerVU={pixelsPerVU}
      />

      {/* Ruler overlay */}
      {currentTool === 'ruler' && rulerStart && (
        <svg
          className="absolute pointer-events-none"
          style={{
            top: 0,
            left: 0,
            width: worldBounds.width,
            height: worldBounds.height,
            zIndex: 8000
          }}
        >
          {/* Start point circle */}
          <circle
            cx={v2p(rulerStart.x)}
            cy={v2p(rulerStart.y)}
            r={v2p(1.5)}
            fill="white"
          />

          {/* Dashed line from start to current */}
          {rulerCurrent && (
            <>
              <line
                x1={v2p(rulerStart.x)}
                y1={v2p(rulerStart.y)}
                x2={v2p(rulerCurrent.x)}
                y2={v2p(rulerCurrent.y)}
                stroke="white"
                strokeWidth={v2p(2)}
                strokeDasharray={`${v2p(6)},${v2p(4)}`}
              />

              {/* Circle around start point when right-click is held (radius = line length) */}
              {isRulerRightClick && (() => {
                const lineLength = Math.sqrt(
                  Math.pow(rulerCurrent.x - rulerStart.x, 2) +
                  Math.pow(rulerCurrent.y - rulerStart.y, 2)
                );
                return lineLength > 0 ? (
                  <circle
                    cx={v2p(rulerStart.x)}
                    cy={v2p(rulerStart.y)}
                    r={v2p(lineLength)}
                    fill="none"
                    stroke="white"
                    strokeWidth={v2p(2)}
                    strokeDasharray={`${v2p(4)},${v2p(4)}`}
                  />
                ) : null;
              })()}

              {/* End point circle */}
              <circle
                cx={v2p(rulerCurrent.x)}
                cy={v2p(rulerCurrent.y)}
                r={v2p(1.5)}
                fill="white"
              />

              {/* Text showing distance in VU */}
              {(() => {
                const lineLength = Math.sqrt(
                  Math.pow(rulerCurrent.x - rulerStart.x, 2) +
                  Math.pow(rulerCurrent.y - rulerStart.y, 2)
                );
                const midX = (rulerStart.x + rulerCurrent.x) / 2;
                const midY = (rulerStart.y + rulerCurrent.y) / 2;

                // Calculate step count if step is enabled
                // Format: ru = " (5ш)", en = " (5.0st)"
                const stepCount = rulerStep > 0 ? (lineLength / rulerStep).toFixed(1) : null;
                const isRussianLanguage = language === 'ru' || language === 'sr' || language === 'uk';
                const stepText = stepCount !== null
                  ? (isRussianLanguage ? ` (${stepCount}ш)` : ` (${stepCount}st)`)
                  : '';

                return (
                  <text
                    x={v2p(midX)}
                    y={v2p(midY) - 5}
                    fill="white"
                    fontSize={v2p(15)}
                    textAnchor="middle"
                    style={{ pointerEvents: 'none' }}
                  >
                    {lineLength.toFixed(1)}{stepText}
                  </text>
                );
              })()}
            </>
          )}
        </svg>
      )}
    </>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for TabletopBackground
  return (
    prevProps.worldBounds.width === nextProps.worldBounds.width &&
    prevProps.worldBounds.height === nextProps.worldBounds.height &&
    prevProps.rulerStart === nextProps.rulerStart &&
    prevProps.rulerCurrent === nextProps.rulerCurrent &&
    prevProps.isRulerRightClick === nextProps.isRulerRightClick &&
    prevProps.currentTool === nextProps.currentTool &&
    prevProps.v2p === nextProps.v2p &&
    prevProps.cursorSlotLength === nextProps.cursorSlotLength &&
    prevProps.rulerStep === nextProps.rulerStep &&
    prevProps.language === nextProps.language &&
    prevProps.pixelsPerVU === nextProps.pixelsPerVU &&
    prevProps.gridEnabled === nextProps.gridEnabled &&
    prevProps.gridCellSizeVU === nextProps.gridCellSizeVU
  );
});

TabletopBackground.displayName = 'TabletopBackground';

// Export memoized component with custom comparison
export const TabletopBackgroundMemo = memo(TabletopBackground, (prevProps, nextProps) => {
  return (
    prevProps.worldBounds.width === nextProps.worldBounds.width &&
    prevProps.worldBounds.height === nextProps.worldBounds.height &&
    prevProps.rulerStart === nextProps.rulerStart &&
    prevProps.rulerCurrent === nextProps.rulerCurrent &&
    prevProps.isRulerRightClick === nextProps.isRulerRightClick &&
    prevProps.currentTool === nextProps.currentTool &&
    prevProps.v2p === nextProps.v2p &&
    prevProps.cursorSlotLength === nextProps.cursorSlotLength &&
    prevProps.rulerStep === nextProps.rulerStep &&
    prevProps.pixelsPerVU === nextProps.pixelsPerVU &&
    prevProps.gridEnabled === nextProps.gridEnabled &&
    prevProps.gridCellSizeVU === nextProps.gridCellSizeVU
  );
});

TabletopBackgroundMemo.displayName = 'TabletopBackgroundMemo';