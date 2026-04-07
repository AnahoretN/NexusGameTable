import React from 'react';

interface HexGridProps {
  width: number;
  height: number;
  orientation: 'pointy-top' | 'flat-top';
  hexWidth: number;
  hexHeight: number;
  stroke: string;
  strokeWidth: number;
  zoom: number;
}

interface HexGridData {
  points: string;
  dx: number;
  dy: number;
  offsetX: number;
  offsetY: number;
}

// Calculate hex geometry using flexible-hex-grid-calculator logic
function calculatePointyTopHexData(width: number, height: number): HexGridData {
  const hCapIdeal = width / (2 * Math.sqrt(3));
  const hCap = Math.min(hCapIdeal, height / 2);
  const sideHeight = height - 2 * hCap;

  const halfW = width / 2;
  const halfH = height / 2;

  const vertices = [
    { x: 0, y: -halfH },
    { x: halfW, y: -sideHeight / 2 },
    { x: halfW, y: sideHeight / 2 },
    { x: 0, y: halfH },
    { x: -halfW, y: sideHeight / 2 },
    { x: -halfW, y: -sideHeight / 2 }
  ];

  return {
    points: vertices.map(v => `${v.x},${v.y}`).join(' '),
    dx: width,
    dy: height - hCap,
    offsetX: width / 2,
    offsetY: 0
  };
}

function calculateFlatTopHexData(width: number, height: number): HexGridData {
  const wCapIdeal = height / (2 * Math.sqrt(3));
  const wCap = Math.min(wCapIdeal, width / 2);
  const sideWidth = width - 2 * wCap;

  const halfW = width / 2;
  const halfH = height / 2;

  const vertices = [
    { x: -halfW, y: 0 },
    { x: -sideWidth / 2, y: -halfH },
    { x: sideWidth / 2, y: -halfH },
    { x: halfW, y: 0 },
    { x: sideWidth / 2, y: halfH },
    { x: -sideWidth / 2, y: halfH }
  ];

  return {
    points: vertices.map(v => `${v.x},${v.y}`).join(' '),
    dx: width - wCap,
    dy: height,
    offsetX: 0,
    offsetY: height / 2
  };
}

export const HexGrid: React.FC<HexGridProps> = ({
  width,
  height,
  orientation,
  hexWidth,
  hexHeight,
  stroke,
  strokeWidth,
  zoom
}) => {
  // Calculate hex data based on orientation
  const hexData = orientation === 'pointy-top'
    ? calculatePointyTopHexData(hexWidth, hexHeight)
    : calculateFlatTopHexData(hexWidth, hexHeight);

  const { points, dx, dy, offsetX, offsetY } = hexData;

  // Generate grid points - cover from (0,0) to (width,height)
  const gridPoints: Array<{ x: number; y: number }> = [];

  // Calculate how many hexes we need to cover the area
  const cols = Math.ceil(width / dx) + 2;
  const rows = Math.ceil(height / dy) + 2;

  // Start from negative coordinates to ensure coverage from (0,0)
  for (let c = -1; c < cols; c++) {
    for (let r = -1; r < rows; r++) {
      const x = c * dx + (r % 2 === 1 ? offsetX : 0);
      const y = r * dy + (c % 2 === 1 ? offsetY : 0);
      gridPoints.push({ x, y });
    }
  }

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      width={width}
      height={height}
    >
      {gridPoints.map((point, i) => (
        <polygon
          key={`${i}-${point.x}-${point.y}`}
          points={points}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth / zoom}
          transform={`translate(${point.x}, ${point.y})`}
        />
      ))}
    </svg>
  );
};

export const HexGridMemo = React.memo(HexGrid, (prevProps, nextProps) => {
  return (
    prevProps.width === nextProps.width &&
    prevProps.height === nextProps.height &&
    prevProps.orientation === nextProps.orientation &&
    prevProps.hexWidth === nextProps.hexWidth &&
    prevProps.hexHeight === nextProps.hexHeight &&
    prevProps.stroke === nextProps.stroke &&
    prevProps.strokeWidth === nextProps.strokeWidth &&
    prevProps.zoom === nextProps.zoom
  );
});
