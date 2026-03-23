import React from 'react';

interface SquareGridProps {
  width: number;
  height: number;
  cellWidth: number;
  cellHeight: number;
  stroke: string;
  strokeWidth: number;
  zoom: number;
}

export const SquareGrid: React.FC<SquareGridProps> = ({
  width,
  height,
  cellWidth,
  cellHeight,
  stroke,
  strokeWidth,
  zoom
}) => {
  // Generate grid cells - cover from (0,0) to (width,height)
  const cells: Array<{ x: number; y: number }> = [];
  const cols = Math.ceil(width / cellWidth) + 1;
  const rows = Math.ceil(height / cellHeight) + 1;

  // Start from negative coordinates to ensure coverage from (0,0)
  for (let r = -1; r < rows; r++) {
    for (let c = -1; c < cols; c++) {
      const x = c * cellWidth;
      const y = r * cellHeight;
      cells.push({ x, y });
    }
  }

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      width={width}
      height={height}
    >
      {cells.map((cell, i) => (
        <rect
          key={`${i}-${cell.x}-${cell.y}`}
          x={cell.x}
          y={cell.y}
          width={cellWidth}
          height={cellHeight}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth / zoom}
        />
      ))}
    </svg>
  );
};

export const SquareGridMemo = React.memo(SquareGrid);
