/**
 * Image Analysis Utilities
 *
 * Provides utilities for analyzing images to generate hitbox polygons
 * for accurate click detection on non-transparent areas of PNG images.
 */

export interface HitboxPolygon {
  points: Array<{ x: number; y: number }>;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Extracts opaque points from image data based on alpha threshold
 */
function extractOpaquePoints(
  imageData: ImageData,
  alphaThreshold: number
): Point[] {
  const { data, width, height } = imageData;
  const points: Point[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > alphaThreshold) {
        points.push({ x, y });
      }
    }
  }

  return points;
}

/**
 * Calculates the bounding box of a set of points
 */
function calculateBounds(points: Point[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  let minX = points[0].x;
  let minY = points[0].y;
  let maxX = points[0].x;
  let maxY = points[0].y;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return { minX, minY, maxX, maxY };
}

/**
 * Simplifies a polygon using the Douglas-Peucker algorithm
 */
function simplifyPolygon(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points;

  // Find the point with the maximum distance from the line formed by first and last points
  let maxDist = 0;
  let maxIndex = 0;
  const start = points[0];
  const end = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], start, end);
    if (dist > maxDist) {
      maxDist = dist;
      maxIndex = i;
    }
  }

  // If max distance is greater than tolerance, recursively simplify
  if (maxDist > tolerance) {
    const left = points.slice(0, maxIndex + 1);
    const right = points.slice(maxIndex);
    const leftResult = simplifyPolygon(left, tolerance);
    const rightResult = simplifyPolygon(right, tolerance);
    return [...leftResult.slice(0, -1), ...rightResult];
  }

  return [start, end];
}

/**
 * Calculates the perpendicular distance from a point to a line
 */
function perpendicularDistance(point: Point, lineStart: Point, lineEnd: Point): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const mag = Math.sqrt(dx * dx + dy * dy);

  if (mag === 0) {
    return Math.sqrt((point.x - lineStart.x) ** 2 + (point.y - lineStart.y) ** 2);
  }

  const u = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / (mag * mag);
  const closestX = lineStart.x + u * dx;
  const closestY = lineStart.y + u * dy;

  return Math.sqrt((point.x - closestX) ** 2 + (point.y - closestY) ** 2);
}

/**
 * Check if URL is external (might have CORS issues)
 */
function isExternalUrl(url: string): boolean {
  if (!url) return false;
  try {
    const urlObj = new URL(url, window.location.href);
    // Different origin means potential CORS issues
    return urlObj.origin !== window.location.origin;
  } catch {
    return false;
  }
}

/**
 * Generates a simplified hitbox polygon from a PNG image
 *
 * @param imageUrl - URL of the image to analyze
 * @param alphaThreshold - Alpha channel threshold (0-255), pixels with alpha below this are considered transparent
 * @param simplifyTolerance - Tolerance for polygon simplification (higher = simpler polygon)
 * @returns Promise resolving to hitbox polygon or null if analysis fails
 */
export async function generateHitboxFromImage(
  imageUrl: string,
  alphaThreshold: number = 10,
  simplifyTolerance: number = 2
): Promise<HitboxPolygon | null> {
  // Skip analysis for external URLs to avoid CORS errors
  if (isExternalUrl(imageUrl)) {
    return null;
  }

  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      resolve(null);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const opaquePoints = extractOpaquePoints(imageData, alphaThreshold);

        if (opaquePoints.length === 0) {
          resolve(null);
          return;
        }

        // Generate convex hull using Graham scan algorithm
        const hull = convexHull(opaquePoints);

        if (hull.length < 3) {
          resolve(null);
          return;
        }

        // Simplify the hull
        const simplified = simplifyPolygon(hull, simplifyTolerance);

        resolve({
          points: simplified,
          bounds: calculateBounds(simplified)
        });
      } catch (error) {
        // CORS or other canvas access errors
        resolve(null);
      }
    };

    img.onerror = () => {
      resolve(null);
    };

    img.src = imageUrl;
  });
}

/**
 * Computes the convex hull of a set of points using Graham scan algorithm
 */
function convexHull(points: Point[]): Point[] {
  if (points.length <= 2) return points;

  // Find the point with the lowest y (and leftmost if tie)
  let start = points[0];
  for (const point of points) {
    if (point.y < start.y || (point.y === start.y && point.x < start.x)) {
      start = point;
    }
  }

  // Sort points by polar angle with respect to start point
  const sorted = points.filter(p => p !== start).sort((a, b) => {
    const angleA = Math.atan2(a.y - start.y, a.x - start.x);
    const angleB = Math.atan2(b.y - start.y, b.x - start.x);
    if (angleA !== angleB) return angleA - angleB;
    // If angles are equal, closer point comes first
    const distA = (a.x - start.x) ** 2 + (a.y - start.y) ** 2;
    const distB = (b.x - start.x) ** 2 + (b.y - start.y) ** 2;
    return distA - distB;
  });

  const hull: Point[] = [start];

  for (const point of sorted) {
    while (hull.length > 1) {
      const top = hull[hull.length - 1];
      const nextToTop = hull[hull.length - 2];
      const cross = crossProduct(nextToTop, top, point);
      if (cross <= 0) {
        hull.pop();
      } else {
        break;
      }
    }
    hull.push(point);
  }

  return hull;
}

/**
 * Calculates the cross product of vectors OA and OB
 */
function crossProduct(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/**
 * Checks if a point is inside a hitbox polygon using ray casting algorithm
 *
 * @param point - The point to check
 * @param polygon - The polygon to check against
 * @returns True if the point is inside the polygon
 */
export function isPointInHitboxPolygon(
  point: Point,
  polygon: Array<{ x: number; y: number }>
): boolean {
  if (polygon.length < 3) return false;

  let inside = false;
  const j = polygon.length - 1;

  for (let i = 0; i < polygon.length; i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect =
      ((yi > point.y) !== (yj > point.y)) &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Checks if a point (in screen coordinates) is inside an effect template
 * taking into account rotation, scaling, and pivot point
 *
 * @param point - Screen coordinates to check
 * @param obj - Effect template object with optional pivot
 * @param pixelsPerVU - Pixels per virtual unit scaling factor
 * @returns True if the point is inside the effect template's hitbox
 */
export function isPointInEffectTemplate(
  point: Point,
  obj: { x: number; y: number; width: number; height: number; rotation: number; hitboxPolygon?: Array<{ x: number; y: number }>; pivot?: { x: number; y: number } },
  pixelsPerVU: number
): boolean {
  // For Effect Templates, hitboxPolygon is not reliable when size changes
  // Use rectangular check with proper pivot-based transformation instead

  // Get pivot point (default to center if not specified)
  const pivot = obj.pivot || { x: 50, y: 50 };

  // Calculate pivot position in world coordinates (pixels)
  const pivotX = (obj.x + (pivot.x / 100) * obj.width) * pixelsPerVU;
  const pivotY = (obj.y + (pivot.y / 100) * obj.height) * pixelsPerVU;

  // If no rotation, simple rectangular check
  if (!obj.rotation || obj.rotation === 0) {
    return (
      point.x >= obj.x * pixelsPerVU &&
      point.x <= (obj.x + obj.width) * pixelsPerVU &&
      point.y >= obj.y * pixelsPerVU &&
      point.y <= (obj.y + obj.height) * pixelsPerVU
    );
  }

  // Transform point to object's local coordinate system (un-rotate around pivot)
  const angle = -obj.rotation * Math.PI / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  // Vector from pivot to point
  const dx = point.x - pivotX;
  const dy = point.y - pivotY;

  // Rotate this vector back by -rotation
  const localDX = dx * cos - dy * sin;
  const localDY = dx * sin + dy * cos;

  // The point in local coordinates (relative to pivot)
  const localX = pivotX + localDX;
  const localY = pivotY + localDY;

  // Check if local point is within the container bounds
  const containerLeft = obj.x * pixelsPerVU;
  const containerTop = obj.y * pixelsPerVU;
  const containerRight = (obj.x + obj.width) * pixelsPerVU;
  const containerBottom = (obj.y + obj.height) * pixelsPerVU;

  return (
    localX >= containerLeft &&
    localX <= containerRight &&
    localY >= containerTop &&
    localY <= containerBottom
  );
}
