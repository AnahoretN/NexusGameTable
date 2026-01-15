import { Coordinates } from '../types';

export interface Point {
  x: number;
  y: number;
}

export interface RotatedRect {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

/**
 * Check if a point is inside a rotated rectangle
 */
export function isPointInRotatedRect(
  px: number,
  py: number,
  rect: RotatedRect
): boolean {
  // Translate point to rectangle's local coordinate system
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;

  // Rotate point around rectangle center by negative rectangle rotation
  const angle = -rect.rotation * Math.PI / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  const dx = px - centerX;
  const dy = py - centerY;

  const localX = dx * cos - dy * sin + centerX;
  const localY = dx * sin + dy * cos + centerY;

  // Check if point is in axis-aligned rectangle
  return (
    localX >= rect.x &&
    localX <= rect.x + rect.width &&
    localY >= rect.y &&
    localY <= rect.y + rect.height
  );
}

/**
 * Get the four corners of a rotated rectangle
 */
export function getRotatedRectCorners(rect: RotatedRect): Point[] {
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;

  const corners: Point[] = [
    { x: rect.x, y: rect.y }, // Top-left
    { x: rect.x + rect.width, y: rect.y }, // Top-right
    { x: rect.x + rect.width, y: rect.y + rect.height }, // Bottom-right
    { x: rect.x, y: rect.y + rect.height } // Bottom-left
  ];

  const angle = rect.rotation * Math.PI / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return corners.map(corner => {
    const dx = corner.x - centerX;
    const dy = corner.y - centerY;

    return {
      x: dx * cos - dy * sin + centerX,
      y: dx * sin + dy * cos + centerY
    };
  });
}

/**
 * Get the bounding box of a rotated rectangle
 */
export function getRotatedRectBounds(rect: RotatedRect): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const corners = getRotatedRectCorners(rect);

  const xs = corners.map(c => c.x);
  const ys = corners.map(c => c.y);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}

/**
 * Check if two rectangles intersect
 */
export function doRectsIntersect(
  rect1: RotatedRect,
  rect2: RotatedRect
): boolean {
  // Simple bounding box check first
  const bounds1 = getRotatedRectBounds(rect1);
  const bounds2 = getRotatedRectBounds(rect2);

  if (
    bounds1.x > bounds2.x + bounds2.width ||
    bounds1.x + bounds1.width < bounds2.x ||
    bounds1.y > bounds2.y + bounds2.height ||
    bounds1.y + bounds1.height < bounds2.y
  ) {
    return false;
  }

  // For rotated rectangles, use SAT (Separating Axis Theorem)
  const corners1 = getRotatedRectCorners(rect1);
  const corners2 = getRotatedRectCorners(rect2);

  // Check axes of both rectangles
  const axes = [
    // Axes from rect1
    { x: Math.cos(rect1.rotation * Math.PI / 180), y: Math.sin(rect1.rotation * Math.PI / 180) },
    { x: -Math.sin(rect1.rotation * Math.PI / 180), y: Math.cos(rect1.rotation * Math.PI / 180) },
    // Axes from rect2
    { x: Math.cos(rect2.rotation * Math.PI / 180), y: Math.sin(rect2.rotation * Math.PI / 180) },
    { x: -Math.sin(rect2.rotation * Math.PI / 180), y: Math.cos(rect2.rotation * Math.PI / 180) }
  ];

  for (const axis of axes) {
    // Project both rectangles onto the axis
    const proj1 = corners1.map(c => c.x * axis.x + c.y * axis.y);
    const proj2 = corners2.map(c => c.x * axis.x + c.y * axis.y);

    const min1 = Math.min(...proj1);
    const max1 = Math.max(...proj1);
    const min2 = Math.min(...proj2);
    const max2 = Math.max(...proj2);

    // Check for separation
    if (max1 < min2 || max2 < min1) {
      return false;
    }
  }

  return true;
}

/**
 * Normalize an angle to 0-360 range
 */
export function normalizeAngle(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

/**
 * Get the shortest rotation direction between two angles
 */
export function getRotationDirection(from: number, to: number): 1 | -1 {
  const diff = normalizeAngle(to - from);
  return diff > 180 ? -1 : 1;
}

/**
 * Rotate a point around another point
 */
export function rotatePoint(
  point: Point,
  center: Point,
  angleDegrees: number
): Point {
  const angle = angleDegrees * Math.PI / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  const dx = point.x - center.x;
  const dy = point.y - center.y;

  return {
    x: dx * cos - dy * sin + center.x,
    y: dx * sin + dy * cos + center.y
  };
}

/**
 * Check if a point is inside a polygon (using ray casting)
 */
export function isPointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }

  return inside;
}
