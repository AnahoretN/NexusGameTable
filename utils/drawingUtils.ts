import { Drawing, Stroke, ItemType } from '../types';

// Calculate bounding box of a stroke
export const getStrokeBounds = (stroke: Stroke): { minX: number; minY: number; maxX: number; maxY: number } => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const point of stroke.points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { minX, minY, maxX, maxY };
};

// Calculate bounding box of multiple strokes
export const getStrokesBounds = (strokes: Stroke[]): { minX: number; minY: number; maxX: number; maxY: number } => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const stroke of strokes) {
    const bounds = getStrokeBounds(stroke);
    minX = Math.min(minX, bounds.minX);
    minY = Math.min(minY, bounds.minY);
    maxX = Math.max(maxX, bounds.maxX);
    maxY = Math.max(maxY, bounds.maxY);
  }
  return { minX, minY, maxX, maxY };
};

// Find drawing at given world position (for drag selection)
// Checks from top (highest z-index) to bottom
export const findDrawingAtPosition = (
  x: number,
  y: number,
  drawings: Drawing[]
): Drawing | null => {
  // Check from top (highest z-index) to bottom
  for (let i = drawings.length - 1; i >= 0; i--) {
    const drawing = drawings[i];
    if (drawing.type !== ItemType.DRAWING) continue;

    const bounds = getStrokesBounds(drawing.strokes);

    // Check if point is within drawing bounds (in world coords)
    const worldMinX = bounds.minX + drawing.x;
    const worldMaxX = bounds.maxX + drawing.x;
    const worldMinY = bounds.minY + drawing.y;
    const worldMaxY = bounds.maxY + drawing.y;

    if (x >= worldMinX && x <= worldMaxX && y >= worldMinY && y <= worldMaxY) {
      return drawing;
    }
  }
  return null;
};
