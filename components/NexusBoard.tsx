import React, { useState, useCallback, useMemo } from 'react';
import { NexusBoard as NexusBoardType, HexDirection, NexusCell, TokenShape } from '../types';
import { SvgTokenShape } from './SvgTokenShape';
import { Plus } from 'lucide-react';

interface NexusBoardProps {
  board: NexusBoardType;
  isOwner: boolean;
  isDragging: boolean;
  zoom: number;
  onMouseDown: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onAddCell: (direction: HexDirection) => void;
  showAddUI?: boolean;
  selectedCellIds?: string[];
  onCellSelect?: (cellId: string) => void;
  mainCellWidth?: number;  // Actual width of main cell (in vu)
  mainCellHeight?: number; // Actual height of main cell (in vu)
  pixelsPerVU?: number;    // Conversion factor from vu to pixels
}

// Hex directions with their positions relative to center cell
// For pointy-top hex (N, NE, SE, S, SW, NW)
const HEX_DIRECTIONS: { direction: HexDirection; x: number; y: number }[] = [
  { direction: 'N', x: 0, y: -1 },
  { direction: 'NE', x: 1, y: -0.5 },
  { direction: 'SE', x: 1, y: 0.5 },
  { direction: 'S', x: 0, y: 1 },
  { direction: 'SW', x: -1, y: 0.5 },
  { direction: 'NW', x: -1, y: -0.5 },
];

export const NexusBoard: React.FC<NexusBoardProps> = ({
  board,
  isOwner,
  isDragging,
  zoom,
  onMouseDown,
  onContextMenu,
  onAddCell,
  showAddUI = false,
  selectedCellIds = [],
  onCellSelect,
  mainCellWidth,
  mainCellHeight,
  pixelsPerVU = 1.08,
}) => {
  const [hoveredDirection, setHoveredDirection] = useState<HexDirection | null>(null);

  // Helper to convert vu to pixels
  const vuToPx = (vu: number) => vu * pixelsPerVU;

  // Use actual main cell dimensions (in vu) for all calculations
  const cellWidth = mainCellWidth ?? board.cellWidth ?? 100;
  const cellHeight = mainCellHeight ?? board.cellHeight ?? 150;

  // Convert to pixels for green button rendering
  const cellWidthPx = vuToPx(cellWidth);
  const cellHeightPx = vuToPx(cellHeight);

  // Calculate positions for all cells
  const cellPositions = useMemo(() => {
    const positions: Map<string, { x: number; y: number; direction: HexDirection }> = new Map();

    // Main cell at center (0, 0)
    positions.set(board.cells[0]?.id || 'main', { x: 0, y: 0, direction: 'N' as HexDirection });

    // Nexus Board hex grid spacing with decaying extrapolation
    // Uses asymptotic approach: ratio approaches target ratio as height increases
    // At height=115 → ratio=0.75, at height=150 → ratio≈0.80833, approaches 0.86 as limit
    const H1 = 115;
    const C1 = 0.75;
    const H2 = 150;
    const C2 = 121.25 / 150;  // ≈ 0.80833
    const targetRatio = 0.906;  // Maximum ratio as height → infinity
    // Solve for k: C2 = targetRatio - (targetRatio - C1) * exp(-k * (H2 - H1))
    const k = -Math.log((targetRatio - C2) / (targetRatio - C1)) / (H2 - H1);
    const rowSpacingRatio = targetRatio - (targetRatio - C1) * Math.exp(-k * (cellHeight - H1));
    const rowSpacing = cellHeight * rowSpacingRatio;
    const colSpacing = cellWidth;
    const colOffset = cellWidth * 0.5;

    // Calculate position for each direction (relative to parent cell center)
    const getHexPosition = (direction: HexDirection, centerX: number, centerY: number) => {
      switch (direction) {
        case 'N': return { x: centerX, y: centerY - rowSpacing };
        case 'S': return { x: centerX, y: centerY + rowSpacing };
        case 'NE':
          return { x: centerX + colOffset, y: centerY - rowSpacing };
        case 'SE':
          return { x: centerX + colSpacing, y: centerY };
        case 'NW':
          return { x: centerX - colOffset, y: centerY - rowSpacing };
        case 'SW':
          return { x: centerX - colSpacing, y: centerY };
      }
    };

    // Calculate positions for all connected cells
    // For simplicity, all cells connect to the main cell (first cell)
    // in their specified direction
    const mainCellId = board.cells[0]?.id;
    if (mainCellId) {
      const mainPos = positions.get(mainCellId);
      if (mainPos) {
        for (let i = 1; i < board.cells.length; i++) {
          const cell = board.cells[i];
          const pos = getHexPosition(cell.direction, mainPos.x, mainPos.y);
          positions.set(cell.id, { ...pos, direction: cell.direction });
        }
      }
    }

    return positions;
  }, [board.cells, cellWidth, cellHeight]);

  // Get available directions for adding new cells
  // Exclude the main cell (index 0) from occupied directions - its direction is just a placeholder
  const availableDirections = useMemo(() => {
    const occupied = new Set(board.cells.slice(1).map(c => c.direction));
    return HEX_DIRECTIONS.filter(d => !occupied.has(d.direction));
  }, [board.cells]);

  // Handle add cell click
  const handleAddCell = useCallback((direction: HexDirection) => {
    onAddCell(direction);
    setHoveredDirection(null);
  }, [onAddCell]);

  // Handle cell click
  const handleCellClick = useCallback((e: React.MouseEvent, cellId: string) => {
    e.stopPropagation();
    onCellSelect?.(cellId);
  }, [onCellSelect]);

  return (
    <div
      onMouseDown={onMouseDown}
      onContextMenu={onContextMenu}
      className="absolute"
      style={{
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        transform: `rotate(${board.rotation}deg)`,
        pointerEvents: showAddUI ? 'auto' : 'auto',
      }}
    >
      {/* Add cell UI - only renders when showAddUI is true */}
      {showAddUI && isOwner && (
        <>
          {availableDirections.map(({ direction }) => {
            // Same spacing calculation as used in cellPositions (with decaying extrapolation)
            const H1 = 115;
            const C1 = 0.75;
            const H2 = 150;
            const C2 = 121.25 / 150;
            const targetRatio = 0.86;
            const k = -Math.log((targetRatio - C2) / (targetRatio - C1)) / (H2 - H1);
            const rowSpacingRatio = targetRatio - (targetRatio - C1) * Math.exp(-k * (cellHeight - H1));
            const rowSpacing = cellHeight * rowSpacingRatio;
            const colSpacing = cellWidth;
            const colOffset = cellWidth * 0.5;

            let offsetX = 0;
            let offsetY = 0;
            let show = false;

            switch (direction) {
              case 'NE':
                offsetX = colOffset;
                offsetY = -rowSpacing;
                show = true;
                break;
              case 'SE':
                offsetX = colSpacing;
                offsetY = 0;
                show = true;
                break;
              case 'NW':
                offsetX = -colOffset;
                offsetY = -rowSpacing;
                show = true;
                break;
              case 'SW':
                offsetX = -colSpacing;
                offsetY = 0;
                show = true;
                break;
              default:
                show = false;
                break;
            }

            if (!show) return null;

            // Convert VU offsets to pixels for positioning
            const offsetXPx = vuToPx(offsetX);
            const offsetYPx = vuToPx(offsetY);

            return (
              <div
                key={direction}
                className="absolute cursor-pointer transition-opacity hover:opacity-100"
                style={{
                  left: `calc(50% + ${offsetXPx - cellWidthPx / 2}px)`,
                  top: `calc(50% + ${offsetYPx - cellHeightPx / 2}px)`,
                  width: cellWidthPx,
                  height: cellHeightPx,
                  opacity: 0.5,
                  pointerEvents: 'auto',
                  zIndex: 100,
                }}
                onMouseEnter={() => setHoveredDirection(direction)}
                onMouseLeave={() => setHoveredDirection(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddCell(direction);
                }}
              >
                <SvgTokenShape
                  shape={TokenShape.HEX}
                  width={cellWidthPx}
                  height={cellHeightPx}
                  color={board.color || '#34495e'}
                  borderWidth={3}
                  borderColor="rgba(46, 204, 113, 0.8)"
                  opacity={100}
                  rotation={0}
                  showThickness={false}
                />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                    <Plus size={20} />
                  </div>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
};

export const NexusBoardMemo = React.memo(NexusBoard);
