import { TokenShape } from '../types';
import { CELL_BORDER_SCALE } from '../components/SvgTokenShape';

/**
 * Cell edge magnetism
 *
 * Shared by the main tabletop drop handler (TabletopEventHandlers) and pool panel
 * drops (poolPlacement). Two mechanisms:
 *
 * - Rectangular (bounding box): cell edges snap flush to other cells' bounding boxes
 *   and to the container edges (game field / pool zone). Works for square cells and
 *   stays the behavior whenever a hex snap is not possible.
 *
 * - Hexagonal (apothem): a hex cell's sides are at angles, so instead of bounding
 *   boxes the snap works along the 3 apothem axes (one per pair of parallel sides).
 *   The apothem is the line from the center that bisects a side. Parallel sides of
 *   two hexes attract: the dragged hex settles flush against the neighbour along the
 *   shared apothem axis and slides along the side so both centers lie on one apothem
 *   line - the proper hex tiling position.
 *
 * Cell-to-cell snaps land exactly flush (zero gap between the object bounds). The
 * border stroke is centered on the object edge and drawn at a fixed screen thickness
 * (it does not scale with zoom), so flush bounds make the two strokes coincide on the
 * shared edge - they read as one border line at every zoom, and the stored world
 * positions do not depend on the zoom at drop time. (Offsetting the snap by half the
 * stroke thickness made the world-space gap zoom-dependent: cells dropped at high
 * zoom sat closer together than cells dropped at low zoom, and zooming after a drop
 * opened a background gap between the strokes.)
 *
 * Both hex orientations are supported (HEX pointy-top, HEX_HORIZONTAL flat-top).
 * Hexes snap only to hexes with the same orientation: the other orientation has no
 * parallel sides (30°/90°/150° vs 60°/120°/0°). Object rotation is taken into
 * account - axes rotate with the cell, so two cells rotated equally still snap.
 */

export interface CellEdgeSnapCell {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  shape?: TokenShape;
  rotation?: number;
  borderWidth?: number;
}

/** Rectangular container the cell snaps its outer stroke to (game field / pool zone) */
export interface CellEdgeSnapBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface CellEdgeSnapOptions {
  /** The dragged cell */
  cell: {
    width: number;
    height: number;
    shape?: TokenShape;
    rotation?: number;
    borderWidth?: number;
  };
  /** Current (unsnapped) top-left position in world units */
  position: { x: number; y: number };
  /** Candidate cells (already filtered: same zone, visible, not pinned, not self) */
  others: CellEdgeSnapCell[];
  /** Container bounds for edge snapping (game field / pool zone) */
  bounds?: CellEdgeSnapBounds;
  pixelsPerVU: number;
  /** Snap tolerance in VU (default 10) */
  snapThreshold?: number;
  /** Apothem/center alignment tolerance in VU (default 10) */
  centerAlignThreshold?: number;
}

export interface CellEdgeSnapResult {
  x: number;
  y: number;
}

export function isHexShape(shape?: TokenShape): boolean {
  return shape === TokenShape.HEX || shape === TokenShape.HEX_HORIZONTAL;
}

interface HexAxis {
  /** Outward unit normal: direction from the center to the side midpoint (the apothem) */
  nx: number;
  ny: number;
  /** Distance from center to the side along the normal */
  apothem: number;
}

/**
 * The 3 apothem axes of a hex (one per pair of parallel sides).
 *
 * The rendered hexagon (see generatePointyTopHexPath/generateFlatTopHexPath) keeps
 * its 120° angles regardless of width/height ratio, so side directions are fixed:
 * - pointy-top (HEX):     normals at 0°, 60°, 120° - vertical sides apothem = W/2,
 *                         slanted sides apothem = √3·H/4
 * - flat-top (HEX_HORIZONTAL): normals at 30°, 90°, 150° - horizontal sides
 *                         apothem = H/2, slanted sides apothem = √3·W/4
 */
export function getHexApothemAxes(
  shape: TokenShape,
  width: number,
  height: number,
  rotationDeg: number = 0
): HexAxis[] {
  const rot = (rotationDeg || 0) * Math.PI / 180;
  const axisAt = (deg: number, apothem: number): HexAxis => {
    const a = deg * Math.PI / 180 + rot;
    return { nx: Math.cos(a), ny: Math.sin(a), apothem };
  };

  if (shape === TokenShape.HEX) {
    return [
      axisAt(0, width / 2),
      axisAt(60, Math.sqrt(3) * height / 4),
      axisAt(120, Math.sqrt(3) * height / 4),
    ];
  }
  // Flat-top (HEX_HORIZONTAL)
  return [
    axisAt(30, Math.sqrt(3) * width / 4),
    axisAt(90, height / 2),
    axisAt(150, Math.sqrt(3) * width / 4),
  ];
}

/**
 * Snap a battlefield cell to other cells and to the container edges on drop.
 * Hex cells snap side-to-side along their apothem axes; everything else uses
 * axis-aligned bounding box edges (the original square-cell behavior).
 */
export function applyCellEdgeMagnetism(options: CellEdgeSnapOptions): CellEdgeSnapResult {
  const { cell, position, others, bounds } = options;
  const snapThreshold = options.snapThreshold ?? 10;
  const centerAlignThreshold = options.centerAlignThreshold ?? 10;
  const ppVU = options.pixelsPerVU > 0 ? options.pixelsPerVU : 1;

  const w = cell.width;
  const h = cell.height;
  const px = position.x;
  const py = position.y;
  // The border is centered on the object edge and drawn at a fixed screen thickness
  // (SvgTokenShape viewBox units = screen px). Convert to world units (VU) only for
  // the container-edge inset below - cell-to-cell snaps are flush (see header), the
  // neighbour's stroke is not part of the offset
  const selfBorderVU = (cell.borderWidth ?? 2) * CELL_BORDER_SCALE / ppVU;

  const selfIsHex = isHexShape(cell.shape);

  // For a hex cell, other hexes snap through their apothem axes (side-to-side) instead
  // of bounding boxes - a hex's bounding box only touches its shape at the vertical
  // sides and the top/bottom vertices, so box snapping would stack vertices together.
  // Hexes with the other orientation share no parallel sides - no candidates at all.
  const hexOthers: CellEdgeSnapCell[] = [];
  const bboxOthers: CellEdgeSnapCell[] = [];
  for (const other of others) {
    if (selfIsHex && isHexShape(other.shape)) {
      if (other.shape === cell.shape) hexOthers.push(other);
    } else {
      bboxOthers.push(other);
    }
  }

  interface BboxCandidate {
    value: number;
    dist: number;
    cellId?: string; // undefined = container edge
  }

  // --- Rectangular candidates: container edges + non-hex cells ---
  const xCandidates: BboxCandidate[] = [];
  const yCandidates: BboxCandidate[] = [];
  const cellBounds: Record<string, { x: number; y: number; width: number; height: number }> = {};

  if (bounds) {
    // Container edges - outer stroke edge aligns with the container edge
    xCandidates.push(
      { value: bounds.left + selfBorderVU / 2, dist: Math.abs(px - (bounds.left + selfBorderVU / 2)) },
      { value: bounds.right - w - selfBorderVU / 2, dist: Math.abs(px + w + selfBorderVU / 2 - bounds.right) }
    );
    yCandidates.push(
      { value: bounds.top + selfBorderVU / 2, dist: Math.abs(py - (bounds.top + selfBorderVU / 2)) },
      { value: bounds.bottom - h - selfBorderVU / 2, dist: Math.abs(py + h + selfBorderVU / 2 - bounds.bottom) }
    );
  }

  for (const other of bboxOthers) {
    const ow = other.width;
    const oh = other.height;
    cellBounds[other.id] = { x: other.x, y: other.y, width: ow, height: oh };

    // Edge-to-edge (flush): my left to their right, my right to their left.
    // No border offset - the centered strokes coincide on the shared edge
    xCandidates.push({ value: other.x + ow, dist: Math.abs(px - (other.x + ow)), cellId: other.id });
    xCandidates.push({ value: other.x - w, dist: Math.abs(px + w - other.x), cellId: other.id });
    // My top to their bottom, my bottom to their top
    yCandidates.push({ value: other.y + oh, dist: Math.abs(py - (other.y + oh)), cellId: other.id });
    yCandidates.push({ value: other.y - h, dist: Math.abs(py + h - other.y), cellId: other.id });
  }

  const pickBest = (candidates: BboxCandidate[]): BboxCandidate | null => {
    let best: BboxCandidate | null = null;
    for (const c of candidates) {
      if (c.dist <= snapThreshold && (!best || c.dist < best.dist)) best = c;
    }
    return best;
  };

  // --- Hex apothem candidates: parallel sides snap flush along the apothem axis ---
  interface HexSnap {
    dx: number;
    dy: number;
    dist: number;
    cellId: string;
    axisIndex: number;
  }
  let bestHex: HexSnap | null = null;
  let myAxes: HexAxis[] | null = null;

  if (selfIsHex && hexOthers.length > 0) {
    myAxes = getHexApothemAxes(cell.shape!, w, h, cell.rotation);
    const myCx = px + w / 2;
    const myCy = py + h / 2;

    for (const other of hexOthers) {
      const otherAxes = getHexApothemAxes(other.shape!, other.width, other.height, other.rotation);
      const dcx = other.x + other.width / 2 - myCx;
      const dcy = other.y + other.height / 2 - myCy;

      for (let i = 0; i < myAxes.length; i++) {
        const n = myAxes[i];

        for (let j = 0; j < otherAxes.length; j++) {
          const m = otherAxes[j];
          // The sides must be parallel (equal rotation or a multiple of 60° apart)
          if (Math.abs(n.nx * m.nx + n.ny * m.ny) < 0.999) continue;

          // Flush: center distance along the shared apothem axis =
          // my apothem + their apothem, either side of me (strokes coincide on
          // the shared side, same as the rectangular flush snap)
          const flush = n.apothem + m.apothem;
          const dn = dcx * n.nx + dcy * n.ny;

          for (const sign of [1, -1]) {
            const target = sign * flush;
            const dist = Math.abs(dn - target);
            if (dist <= snapThreshold && (!bestHex || dist < bestHex.dist)) {
              // Moving my center by Δ along n changes dn to dn - Δ (dn = (other - me)·n)
              bestHex = { dx: (dn - target) * n.nx, dy: (dn - target) * n.ny, dist, cellId: other.id, axisIndex: i };
            }
          }
        }
      }
    }
  }

  if (bestHex && myAxes) {
    // Align along the apothem: slide along the touching side so both centers lie on
    // one apothem line (side midpoints coincide) - the proper hex tiling position
    const n = myAxes[bestHex.axisIndex];
    const tx = -n.ny;
    const ty = n.nx;
    const other = hexOthers.find(o => o.id === bestHex!.cellId);
    if (other) {
      const dcx = other.x + other.width / 2 - (px + w / 2);
      const dcy = other.y + other.height / 2 - (py + h / 2);
      const dt = dcx * tx + dcy * ty;
      if (Math.abs(dt) <= centerAlignThreshold) {
        // Moving my center by Δ along t changes dt to dt - Δ (d = (other - me))
        return { x: px + bestHex.dx + dt * tx, y: py + bestHex.dy + dt * ty };
      }
    }
    return { x: px + bestHex.dx, y: py + bestHex.dy };
  }

  // --- Rectangular snapping (container edges + non-hex cells) ---
  const bestX = pickBest(xCandidates);
  const bestY = pickBest(yCandidates);

  let snappedX = bestX ? bestX.value : px;
  let snappedY = bestY ? bestY.value : py;

  // Center alignment: when snapped to a cell on one axis and the other axis is free,
  // align centers if they coincide within the threshold
  if (bestX?.cellId && !bestY) {
    const target = cellBounds[bestX.cellId];
    const targetCenterY = target.y + target.height / 2;
    const myCenterY = py + h / 2;
    if (Math.abs(myCenterY - targetCenterY) <= centerAlignThreshold) {
      snappedY = targetCenterY - h / 2;
    }
  } else if (bestY?.cellId && !bestX) {
    const target = cellBounds[bestY.cellId];
    const targetCenterX = target.x + target.width / 2;
    const myCenterX = px + w / 2;
    if (Math.abs(myCenterX - targetCenterX) <= centerAlignThreshold) {
      snappedX = targetCenterX - w / 2;
    }
  }

  return { x: snappedX, y: snappedY };
}
