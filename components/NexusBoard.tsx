import React, { useState, useCallback, useMemo } from 'react';
import { NexusBoard as NexusBoardType, HexDirection, TokenShape } from '../types';
import { SvgTokenShape } from './SvgTokenShape';
import { Plus } from 'lucide-react';
import { vuToPixels } from '../utils/vuSystem';

interface NexusBoardProps {
  board: NexusBoardType;
  isOwner: boolean;
  isDragging: boolean;
  zoom?: number;
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
  isDragging: _isDragging,
  zoom: _zoom,
  onMouseDown,
  onContextMenu,
  onAddCell,
  showAddUI = false,
  selectedCellIds: _selectedCellIds,
  onCellSelect,
  mainCellWidth,
  mainCellHeight,
  pixelsPerVU = 1.08,
}) => {
  const [hoveredDirection, setHoveredDirection] = useState<HexDirection | null>(null);

  // Use actual main cell dimensions (in vu) for all calculations
  const cellWidth = mainCellWidth ?? board.cellWidth ?? 100;
  const cellHeight = mainCellHeight ?? board.cellHeight ?? 150;

  // Convert to pixels for green button rendering
  const cellWidthPx = vuToPixels(cellWidth, pixelsPerVU);
  const cellHeightPx = vuToPixels(cellHeight, pixelsPerVU);

  // Calculate positions for all cells using hex grid spacing
  const cellPositions = useMemo(() => {
    const positions: Map<string, { x: number; y: number; direction: HexDirection }> = new Map();

    // Main cell at center (0, 0)
    positions.set(board.cells[0]?.id || 'main', { x: 0, y: 0, direction: 'N' as HexDirection });

    // Pointy-top hex spacing
    const rowSpacing = cellHeight * 0.75;
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

  return (
    <div
      onMouseDown={onMouseDown}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
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
            // Use hex grid spacing for consistent positioning
            const rowSpacing = cellHeight * 0.75;
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
            const offsetXPx = vuToPixels(offsetX, pixelsPerVU);
            const offsetYPx = vuToPixels(offsetY, pixelsPerVU);

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
