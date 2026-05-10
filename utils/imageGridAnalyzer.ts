/**
 * Image Grid Analyzer - Detects individual cells from schematic images
 * Finds enclosed regions of any size, not a regular grid
 */

export interface DetectedCell {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  contour: Point[];
  polygon: Point[];
  shape: 'circle' | 'square' | 'rectangle' | 'hex';
  area: number;
  perimeter: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface GridAnalysisOptions {
  edgeThreshold?: number;       // Edge detection threshold (0-255), default 30
  minCellSize?: number;         // Minimum cell area in pixels, default 150
  maxCellSize?: number;         // Maximum cell area in pixels, default 300000
  simplifyTolerance?: number;   // Polygon simplification, default 0.02
  minAspectRatio?: number;      // Min aspect ratio (width/height), default 0.15
  maxAspectRatio?: number;      // Max aspect ratio (width/height), default 6.0
}

export interface GridAnalysisResult {
  cells: DetectedCell[];
  imageWidth: number;
  imageHeight: number;
  processingTime: number;
  debugInfo?: {
    edgesFound: number;
    regionsFound: number;
    cellsAfterFilter: number;
  };
}

/**
 * Main analysis - finds individual enclosed cells (not a regular grid)
 */
export function analyzeImageForGrid(
  imageData: ImageData,
  options: GridAnalysisOptions = {}
): GridAnalysisResult {
  const startTime = performance.now();

  const {
    edgeThreshold = 30,
    minCellSize = 150,
    maxCellSize = 300000,
    simplifyTolerance = 0.02,
    minAspectRatio = 0.15,
    maxAspectRatio = 6.0
  } = options;

  const width = imageData.width;
  const height = imageData.height;

  // Step 1: Convert to grayscale
  const grayData = convertToGrayscale(imageData);

  // Step 2: Detect edges (Sobel) - finds color boundaries
  const edgeData = detectEdges(grayData, width, height, edgeThreshold);

  // Step 3: Find dark lines directly - finds grid lines as dark regions
  const darkLineData = findDarkLines(grayData, width, height);

  // Step 4: Combine both methods - union of edge detection and dark line detection
  const combinedEdges = new Uint8Array(width * height);
  for (let i = 0; i < edgeData.length; i++) {
    combinedEdges[i] = (edgeData[i] === 1 || darkLineData[i] === 1) ? 1 : 0;
  }

  // Step 5: Dilate combined edges to close gaps
  const dilatedEdges = dilateEdges(combinedEdges, width, height, 4);

  // Step 6: Find enclosed regions using flood fill on NON-edge pixels
  const regions = findEnclosedRegions(dilatedEdges, width, height);

  // Count edges for debug
  let edgesCount = 0;
  for (let i = 0; i < combinedEdges.length; i++) {
    if (combinedEdges[i] === 1) edgesCount++;
  }

  // Step 5: Convert regions to cells, filtering by size and shape
  const cells: DetectedCell[] = [];

  for (const region of regions) {
    const bounds = region.bounds;
    const area = region.area;

    // Skip regions that are too small or too large
    if (area < minCellSize || area > maxCellSize) continue;

    // Skip regions with extreme aspect ratios (likely not cells)
    const aspectRatio = bounds.width / bounds.height;
    if (aspectRatio < minAspectRatio || aspectRatio > maxAspectRatio) continue;

    // Check if region touches image edges - only skip if MOST of the edge is touching
    // This allows cells that slightly touch the edge
    const edgeTouchThreshold = Math.min(bounds.width, bounds.height) * 0.5;
    const touchesTop = bounds.y <= 2;
    const touchesBottom = bounds.y + bounds.height >= height - 2;
    const touchesLeft = bounds.x <= 2;
    const touchesRight = bounds.x + bounds.width >= width - 2;

    // Only skip if region touches edges on multiple sides (likely background)
    const sidesTouching = (touchesTop ? 1 : 0) + (touchesBottom ? 1 : 0) +
                         (touchesLeft ? 1 : 0) + (touchesRight ? 1 : 0);
    if (sidesTouching >= 2) {
      continue;
    }

    // Also skip if region is very close to edge AND is very large (likely background)
    if ((touchesTop || touchesBottom || touchesLeft || touchesRight) &&
        (bounds.width > width * 0.3 || bounds.height > height * 0.3)) {
      continue;
    }

    // Create polygon from region
    const polygon = createPolygonFromRegion(region);
    const simplifiedPolygon = simplifyPolygon(polygon, simplifyTolerance);

    // Detect shape
    const perimeter = calculatePerimeter(simplifiedPolygon);
    const shape = detectShape(simplifiedPolygon, area, perimeter);

    cells.push({
      id: `cell-${Date.now()}-${cells.length}`,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      centerX: bounds.x + bounds.width / 2,
      centerY: bounds.y + bounds.height / 2,
      contour: region.contour,
      polygon: simplifiedPolygon,
      shape,
      area,
      perimeter
    });
  }

  const processingTime = performance.now() - startTime;

  return {
    cells,
    imageWidth: width,
    imageHeight: height,
    processingTime,
    debugInfo: {
      edgesFound: edgesCount,
      regionsFound: regions.length,
      cellsAfterFilter: cells.length
    }
  };
}

/**
 * Convert image to grayscale
 */
function convertToGrayscale(imageData: ImageData): Uint8Array {
  const data = imageData.data;
  const gray = new Uint8Array(imageData.width * imageData.height);

  for (let i = 0; i < data.length; i += 4) {
    gray[i / 4] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }

  return gray;
}

/**
 * Detect edges using Sobel operator
 */
function detectEdges(
  gray: Uint8Array,
  width: number,
  height: number,
  threshold: number
): Uint8Array {
  const edges = new Uint8Array(width * height);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;

      // Sobel kernels
      const gx =
        -gray[idx - width - 1] + gray[idx - width + 1] +
        -2 * gray[idx - 1] + 2 * gray[idx + 1] +
        -gray[idx + width - 1] + gray[idx + width + 1];

      const gy =
        -gray[idx - width - 1] - 2 * gray[idx - width] - gray[idx - width + 1] +
        gray[idx + width - 1] + 2 * gray[idx + width] + gray[idx + width + 1];

      const magnitude = Math.sqrt(gx * gx + gy * gy);
      edges[idx] = magnitude > threshold ? 1 : 0;
    }
  }

  return edges;
}

/**
 * Find dark lines directly (grid lines are typically darker than cell backgrounds)
 * Uses adaptive thresholding to find dark regions
 */
function findDarkLines(
  gray: Uint8Array,
  width: number,
  height: number
): Uint8Array {
  const darkLines = new Uint8Array(width * height);

  // Calculate local average brightness for adaptive thresholding
  const blockSize = 21;
  const halfBlock = Math.floor(blockSize / 2);

  // First pass: calculate average brightness for each block
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const pixel = gray[idx];

      // Calculate local average
      let sum = 0;
      let count = 0;

      for (let dy = -halfBlock; dy <= halfBlock; dy++) {
        for (let dx = -halfBlock; dx <= halfBlock; dx++) {
          const nx = x + dx;
          const ny = y + dy;

          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            sum += gray[ny * width + nx];
            count++;
          }
        }
      }

      const localAvg = sum / count;

      // Pixel is considered part of a dark line if it's significantly darker than surroundings
      // Grid lines are typically 20-30% darker than cell content
      const threshold = localAvg * 0.75; // 25% darker than local average

      if (pixel < threshold) {
        darkLines[idx] = 1;
      } else {
        darkLines[idx] = 0;
      }
    }
  }

  return darkLines;
}

/**
 * Dilate edges to close small gaps
 */
function dilateEdges(
  edges: Uint8Array,
  width: number,
  height: number,
  radius: number
): Uint8Array {
  const dilated = new Uint8Array(edges.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let found = false;

      for (let dy = -radius; dy <= radius && !found; dy++) {
        for (let dx = -radius; dx <= radius && !found; dx++) {
          const nx = x + dx;
          const ny = y + dy;

          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            if (edges[ny * width + nx] === 1) {
              found = true;
            }
          }
        }
      }

      dilated[y * width + x] = found ? 1 : 0;
    }
  }

  return dilated;
}

interface Region {
  contour: Point[];
  bounds: { x: number; y: number; width: number; height: number };
  area: number;
}

/**
 * Find enclosed regions using flood fill
 * Finds connected components of NON-edge pixels
 */
function findEnclosedRegions(
  edges: Uint8Array,
  width: number,
  height: number
): Region[] {
  const visited = new Uint8Array(width * height);
  const regions: Region[] = [];

  for (let startY = 0; startY < height; startY++) {
    for (let startX = 0; startX < width; startX++) {
      const idx = startY * width + startX;

      // Only start flood fill from non-edge, unvisited pixels
      if (edges[idx] === 0 && visited[idx] === 0) {
        const region = floodFillRegion(edges, visited, width, height, startX, startY);

        // Only keep regions with reasonable area
        if (region.area > 0) {
          regions.push(region);
        }
      }
    }
  }

  return regions;
}

/**
 * Flood fill to find a single connected region
 */
function floodFillRegion(
  edges: Uint8Array,
  visited: Uint8Array,
  width: number,
  height: number,
  startX: number,
  startY: number
): Region {
  const contour: Point[] = [];
  const pixels: Point[] = [];
  const stack: Point[] = [{ x: startX, y: startY }];

  let minX = startX, maxX = startX;
  let minY = startY, maxY = startY;

  visited[startY * width + startX] = 1;

  while (stack.length > 0) {
    const { x, y } = stack.pop()!;

    pixels.push({ x, y });

    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);

    // Check if this is a boundary pixel (adjacent to an edge)
    if (isBoundaryPixel(edges, width, height, x, y)) {
      contour.push({ x, y });
    }

    // 4-way connectivity
    const neighbors = [
      { x: x + 1, y },
      { x: x - 1, y },
      { x, y: y + 1 },
      { x, y: y - 1 }
    ];

    for (const n of neighbors) {
      if (n.x >= 0 && n.x < width && n.y >= 0 && n.y < height) {
        const nIdx = n.y * width + n.x;
        if (edges[nIdx] === 0 && visited[nIdx] === 0) {
          visited[nIdx] = 1;
          stack.push(n);
        }
      }
    }
  }

  // Create bounding box contour if no boundary pixels found
  let finalContour = contour;
  if (contour.length === 0 && pixels.length > 0) {
    finalContour = [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY }
    ];
  }

  return {
    contour: finalContour,
    bounds: {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1
    },
    area: pixels.length
  };
}

/**
 * Check if pixel is on region boundary
 */
function isBoundaryPixel(
  edges: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number
): boolean {
  const neighbors = [
    { x: x + 1, y },
    { x: x - 1, y },
    { x, y: y + 1 },
    { x, y: y - 1 }
  ];

  for (const n of neighbors) {
    if (n.x >= 0 && n.x < width && n.y >= 0 && n.y < height) {
      if (edges[n.y * width + n.x] === 1) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Create polygon from region
 */
function createPolygonFromRegion(region: Region): Point[] {
  const { bounds, contour } = region;

  // If we have a good contour, use it
  if (contour.length > 10) {
    // Simplify contour by taking every Nth point
    const step = Math.max(1, Math.floor(contour.length / 20));
    const simplified: Point[] = [];
    for (let i = 0; i < contour.length; i += step) {
      simplified.push(contour[i]);
    }
    if (simplified.length >= 3) return simplified;
  }

  // Otherwise use bounding box
  return [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { x: bounds.x, y: bounds.y + bounds.height }
  ];
}

/**
 * Calculate perimeter
 */
function calculatePerimeter(polygon: Point[]): number {
  if (polygon.length < 2) return 0;

  let perimeter = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    const dx = polygon[j].x - polygon[i].x;
    const dy = polygon[j].y - polygon[i].y;
    perimeter += Math.sqrt(dx * dx + dy * dy);
  }

  return perimeter;
}

/**
 * Simplify polygon using Douglas-Peucker
 */
function simplifyPolygon(contour: Point[], tolerance: number): Point[] {
  if (contour.length <= 2) return contour;

  let maxDist = 0;
  let maxIndex = 0;
  const start = contour[0];
  const end = contour[contour.length - 1];

  for (let i = 1; i < contour.length - 1; i++) {
    const dist = perpendicularDistance(contour[i], start, end);
    if (dist > maxDist) {
      maxDist = dist;
      maxIndex = i;
    }
  }

  const perimeter = calculatePerimeter(contour);
  const threshold = perimeter * tolerance;

  if (maxDist > threshold) {
    const left = simplifyPolygon(contour.slice(0, maxIndex + 1), tolerance);
    const right = simplifyPolygon(contour.slice(maxIndex), tolerance);
    return [...left.slice(0, -1), ...right];
  } else {
    return [start, end];
  }
}

/**
 * Perpendicular distance from point to line
 */
function perpendicularDistance(point: Point, lineStart: Point, lineEnd: Point): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;

  if (dx === 0 && dy === 0) {
    const pdx = point.x - lineStart.x;
    const pdy = point.y - lineStart.y;
    return Math.sqrt(pdx * pdx + pdy * pdy);
  }

  const t = Math.max(0, Math.min(1, (
    (point.x - lineStart.x) * dx +
    (point.y - lineStart.y) * dy
  ) / (dx * dx + dy * dy)));

  const nearestX = lineStart.x + t * dx;
  const nearestY = lineStart.y + t * dy;

  const distX = point.x - nearestX;
  const distY = point.y - nearestY;

  return Math.sqrt(distX * distX + distY * distY);
}

/**
 * Detect shape from polygon
 */
function detectShape(
  polygon: Point[],
  area: number,
  perimeter: number
): 'circle' | 'square' | 'rectangle' | 'hex' | null {
  if (polygon.length < 3) return 'rectangle';

  const circularity = (4 * Math.PI * area) / (perimeter * perimeter);

  if (circularity > 0.85) return 'circle';

  const vertices = countVertices(polygon);

  if (vertices === 6 && circularity > 0.7) return 'hex';

  // Default to rectangle for grid cells
  const bounds = getBoundingRect(polygon);
  const aspectRatio = bounds.width / bounds.height;

  if (aspectRatio > 0.75 && aspectRatio < 1.35) {
    return 'square';
  }
  return 'rectangle';
}

/**
 * Count vertices in polygon
 */
function countVertices(polygon: Point[]): number {
  if (polygon.length < 3) return polygon.length;

  let vertices = 0;
  const angleThreshold = 25 * Math.PI / 180;

  for (let i = 0; i < polygon.length; i++) {
    const prev = polygon[(i - 1 + polygon.length) % polygon.length];
    const curr = polygon[i];
    const next = polygon[(i + 1) % polygon.length];

    const angle = calculateAngle(prev, curr, next);
    if (Math.abs(angle - Math.PI) > angleThreshold) {
      vertices++;
    }
  }

  return vertices || 4;
}

/**
 * Calculate angle between three points
 */
function calculateAngle(p1: Point, p2: Point, p3: Point): number {
  const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
  const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };

  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
  const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

  if (mag1 === 0 || mag2 === 0) return Math.PI;

  const cosAngle = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
  return Math.acos(cosAngle);
}

/**
 * Get bounding rectangle
 */
function getBoundingRect(contour: Point[]): { x: number; y: number; width: number; height: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const p of contour) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}

/**
 * Smart analysis with multiple parameter attempts
 */
export function analyzeImageForGridSmart(
  imageData: ImageData,
  options: GridAnalysisOptions = {}
): GridAnalysisResult {
  // Try different combinations of parameters
  const combinations = [
    { edgeThreshold: 25, minCellSize: 100 },
    { edgeThreshold: 30, minCellSize: 150 },
    { edgeThreshold: 35, minCellSize: 150 },
    { edgeThreshold: 40, minCellSize: 200 },
    { edgeThreshold: 50, minCellSize: 200 },
    { edgeThreshold: 25, minCellSize: 200 },
    { edgeThreshold: 35, minCellSize: 100 },
  ];

  let bestResult: GridAnalysisResult | null = null;
  let bestScore = -1;

  for (const combo of combinations) {
    const result = analyzeImageForGrid(imageData, {
      ...options,
      edgeThreshold: combo.edgeThreshold,
      minCellSize: combo.minCellSize
    });

    // Score based on number of cells (prefer 20-80 cells for typical boards)
    const cellCount = result.cells.length;
    let score = cellCount;

    // Bonus for reasonable cell counts
    if (cellCount >= 20 && cellCount <= 80) {
      score += 50;
    } else if (cellCount >= 10 && cellCount <= 100) {
      score += 20;
    }

    // Penalty for too many cells (likely over-segmentation)
    if (cellCount > 150) {
      score -= (cellCount - 150) * 2;
    }

    if (score > bestScore) {
      bestScore = score;
      bestResult = result;
    }

    // Early exit if we found a great result
    if (cellCount >= 30 && cellCount <= 60) {
      return result;
    }
  }

  return bestResult || analyzeImageForGrid(imageData, options);
}

/**
 * Load image from file
 */
export async function loadImageFromFile(file: File): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      const maxSize = 2048;
      let width = img.width;
      let height = img.height;

      if (width > maxSize || height > maxSize) {
        const scale = Math.min(maxSize / width, maxSize / height);
        width = Math.floor(width * scale);
        height = Math.floor(height * scale);
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      resolve(ctx.getImageData(0, 0, width, height));
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Preview detected cells on canvas
 */
export function previewDetectedCells(
  canvas: HTMLCanvasElement,
  imageData: ImageData,
  cells: DetectedCell[],
  scale: number = 1
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.putImageData(imageData, 0, 0);

  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth = 2;

  for (const cell of cells) {
    ctx.strokeRect(cell.x * scale, cell.y * scale, cell.width * scale, cell.height * scale);

    if (cell.polygon.length > 1) {
      ctx.beginPath();
      ctx.moveTo(cell.polygon[0].x * scale, cell.polygon[0].y * scale);
      for (let i = 1; i < cell.polygon.length; i++) {
        ctx.lineTo(cell.polygon[i].x * scale, cell.polygon[i].y * scale);
      }
      ctx.closePath();
      ctx.strokeStyle = '#ff0000';
      ctx.stroke();
    }

    ctx.fillStyle = '#ffff00';
    ctx.beginPath();
    ctx.arc(cell.centerX * scale, cell.centerY * scale, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Create debug preview showing edges and detected cells
 */
export function createDebugPreview(
  canvas: HTMLCanvasElement,
  imageData: ImageData,
  _horizontalLines: number[],
  _verticalLines: number[],
  cells: DetectedCell[]
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;

  // Draw original image with slight dim
  ctx.putImageData(imageData, 0, 0);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.fillRect(0, 0, width, height);

  // Draw cells
  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth = 2;

  for (const cell of cells) {
    ctx.strokeRect(cell.x, cell.y, cell.width, cell.height);

    // Draw center point
    ctx.fillStyle = '#ffff00';
    ctx.beginPath();
    ctx.arc(cell.centerX, cell.centerY, 4, 0, Math.PI * 2);
    ctx.fill();

    // Draw cell number
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px Arial';
    ctx.fillText(`${cells.indexOf(cell) + 1}`, cell.x + 5, cell.y + 15);
  }
}
