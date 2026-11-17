/**
 * Display Angle ("wedge") helpers for Effect Templates
 *
 * When displayAngleEnabled is on, the effect image is clipped to a wedge
 * between two rays emanating from the pivot. The wedge is symmetric around
 * the effect's local "up" direction (angle -90° in the rotated wrapper's
 * local frame — the same direction the rotation marker points at rotation=0)
 * and therefore rotates together with the effect.
 *
 * All geometry here works in the rotated wrapper's LOCAL pixel frame: the
 * wrapper itself carries the object rotation, so the wedge needs no
 * rotation-awareness and stays glued to the image.
 */

/** Default total wedge angle in degrees. */
export const DEFAULT_DISPLAY_ANGLE = 90;

/** Hard clamp range for the wedge angle (a sliver to a full disc). */
export const MIN_DISPLAY_ANGLE = 1;
export const MAX_DISPLAY_ANGLE = 360;

/**
 * Clamp a stored/typed wedge angle into the valid range, defaulting to 90°.
 */
export function clampDisplayAngle(raw: number | undefined): number {
  const v = typeof raw === 'number' && isFinite(raw) ? raw : DEFAULT_DISPLAY_ANGLE;
  return Math.max(MIN_DISPLAY_ANGLE, Math.min(MAX_DISPLAY_ANGLE, v));
}

/**
 * Local-frame direction angle (degrees, screen convention: 0 = right, -90 = up)
 * of one of the two wedge rays.
 * @param side +1 = clockwise-side ray, -1 = counter-clockwise-side ray
 */
export function wedgeRayLocalAngle(displayAngleDeg: number, side: 1 | -1): number {
  return -90 + side * (displayAngleDeg / 2);
}

/**
 * Build a CSS `polygon()` clip-path for the wedge, in local element pixels.
 * Shape: pivot point → ray 1 far point → arc sampled towards ray 2 → ray 2 far
 * point. The arc sampling (rather than a bare triangle) keeps the wedge
 * circular for wide angles — a 3-point triangle would cut the arc with a chord
 * beyond ~120°.
 *
 * The radius overshoots the element so the wedge always covers it, however
 * far the pivot sits from the center.
 *
 * @returns the polygon string, or null when the wedge covers the full disc
 *          (no clipping needed).
 */
export function buildWedgeClipPolygon(
  widthPx: number,
  heightPx: number,
  pivotXpx: number,
  pivotYpx: number,
  displayAngleDeg: number
): string | null {
  const angle = clampDisplayAngle(displayAngleDeg);
  if (angle >= MAX_DISPLAY_ANGLE) return null;

  const W = isFinite(widthPx) ? Math.max(widthPx, 1) : 1;
  const H = isFinite(heightPx) ? Math.max(heightPx, 1) : 1;
  const px = isFinite(pivotXpx) ? pivotXpx : W / 2;
  const py = isFinite(pivotYpx) ? pivotYpx : H / 2;

  // Far beyond any element corner, but sane numbers for the CSS string
  const radius = Math.hypot(W, H) * 3 + 1000;

  const startAngle = wedgeRayLocalAngle(angle, -1);
  const endAngle = wedgeRayLocalAngle(angle, 1);

  // Sample the arc at ≤10° steps (cap points so 360°-wide wedges stay cheap)
  const segmentCount = Math.max(2, Math.min(48, Math.ceil(angle / 10)));

  // 🔧 CSS syntax: a point is "Xpx Ypx" (space between the pair members, px
  // units — bare numbers make the whole clip-path declaration invalid and the
  // browser silently drops it), pairs are separated by commas.
  const points: string[] = [`${px.toFixed(1)}px ${py.toFixed(1)}px`];
  for (let i = 0; i <= segmentCount; i++) {
    const aDeg = startAngle + ((endAngle - startAngle) * i) / segmentCount;
    const aRad = (aDeg * Math.PI) / 180;
    points.push(
      `${(px + radius * Math.cos(aRad)).toFixed(1)}px ${(py + radius * Math.sin(aRad)).toFixed(1)}px`
    );
  }
  return `polygon(${points.join(', ')})`;
}

/**
 * Half-angle (degrees) implied by dragging one wedge marker, given the mouse's
 * LOCAL angle relative to the pivot (screen-convention degrees, already with
 * the object rotation subtracted).
 * @param side +1 for the clockwise-side marker, -1 for the other
 */
export function halfAngleFromLocalMouseAngle(localMouseAngleDeg: number, side: 1 | -1): number {
  // Local angle of the dragged ray is (-90 + side * half) → solve for half.
  // Saturate the RAW value directly: wrapping first would make the wedge snap
  // from fully open to closed when the mouse crosses the opposite ray.
  // Overshooting past the opposite ray simply pins the wedge fully open
  // (rays coincide), going the other way pins it to the minimum sliver.
  const half = side * (localMouseAngleDeg + 90);
  return Math.max(MIN_DISPLAY_ANGLE / 2, Math.min(180, half));
}
