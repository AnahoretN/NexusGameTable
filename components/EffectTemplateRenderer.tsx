/**
 * EffectTemplateRenderer Component
 *
 * Renders effect template objects (area-of-effect visualizations for wargames)
 * with custom pivot point support and rotation marker for visual control.
 */

import React, { useRef, useEffect, useState, useCallback, memo, useMemo } from 'react';
import { EffectTemplate } from '../types';
import { generateHitboxFromImage } from '../utils/imageAnalysis';
import { useLanguage } from '../store/contexts';
import { useImageUrl } from '../hooks';
import { getAssetURL } from '../utils/assets';

// Global image cache for Effect Templates to prevent reloading
const effectImageCache = new Map<string, HTMLImageElement>();
const preloadPromises = new Map<string, Promise<void>>();

// Calculate rotation marker position based on pivot, rotation, and width
function calculateRotationMarkerPosition(
  pivotX: number,
  pivotY: number,
  rotation: number,
  width: number,
  height: number
): { x: number; y: number } {
  // The rotation marker is at the top of the template
  // When rotation = 0, it's directly above the pivot (upward)
  // The distance is the full height (from bottom to top)
  const fullHeight = height;
  // Add -90 degrees offset so rotation 0 points upward
  const angleRad = ((rotation - 90) * Math.PI) / 180;

  // Calculate position relative to pivot (in percentage)
  // At rotation 0, marker is at (pivotX, pivotY - fullHeight) = top center
  const dx = fullHeight * Math.cos(angleRad);
  const dy = fullHeight * Math.sin(angleRad);

  return {
    x: pivotX + dx,
    y: pivotY + dy
  };
}

// Generate tick marks for the ruler
function generateRulerTicks(
  pivotX: number,
  pivotY: number,
  markerX: number,
  markerY: number,
  pixelsPerVU: number
): Array<{ x1: number; y1: number; x2: number; y2: number; isMajor: boolean }> {
  const ticks: Array<{ x1: number; y1: number; x2: number; y2: number; isMajor: boolean }> = [];

  const dx = markerX - pivotX;
  const dy = markerY - pivotY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const distanceVU = distance / pixelsPerVU;

  // Calculate unit vector along the line
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length === 0) return ticks;

  const ux = dx / length;
  const uy = dy / length;

  // Perpendicular vector
  const px = -uy;
  const py = ux;

  // Major ticks every 1 VU, minor ticks every 0.5 VU
  const tickSpacing = 0.5 * pixelsPerVU; // 0.5 VU in pixels
  const numTicks = Math.floor(distanceVU * 2); // Number of 0.5 VU intervals

  for (let i = 1; i <= numTicks; i++) {
    const t = i * 0.5; // Distance in VU
    const dist = t * pixelsPerVU;

    // Don't draw tick at the very end (where marker is)
    if (dist >= distance - 5) continue;

    const tickX = pivotX + ux * dist;
    const tickY = pivotY + uy * dist;

    const isMajor = i % 2 === 0; // Every 1 VU is major
    const tickLength = isMajor ? 12 : 6; // Pixels

    ticks.push({
      x1: tickX,
      y1: tickY,
      x2: tickX + px * tickLength,
      y2: tickY + py * tickLength,
      isMajor
    });
  }

  return ticks;
}

/**
 * Preload an Effect Template image and cache it
 */
async function preloadEffectImage(src: string): Promise<void> {
  // Resolve sha256: hashes to blob URLs before loading
  let resolvedSrc = src;
  if (src?.startsWith('sha256:')) {
    try {
      resolvedSrc = await getAssetURL(src);
    } catch (error) {
      return; // Skip preload if we can't resolve
    }
  }

  if (effectImageCache.has(src)) {
    return Promise.resolve();
  }

  if (preloadPromises.has(src)) {
    return preloadPromises.get(src)!;
  }

  const promise = new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      effectImageCache.set(src, img);
      resolve();
    };
    img.onerror = () => {
      // Still cache on error to prevent repeated failed requests
      effectImageCache.set(src, img);
      resolve(); // Don't reject - allow render to continue
    };
    img.src = resolvedSrc;
  });

  preloadPromises.set(src, promise);
  return promise;
}

// Export preload function for external use
export { preloadEffectImage };

/**
 * Calculate the bounding box of a rotated rectangle
 * Returns { x, y, width, height } of the bounding box
 */
function calculateRotatedBoundingBox(
  width: number,
  height: number,
  rotation: number,
  pivotX: number,
  pivotY: number
): { x: number; y: number; width: number; height: number } {
  // Rectangle corners relative to pivot (unrotated)
  const corners = [
    { x: -pivotX, y: -pivotY },
    { x: width - pivotX, y: -pivotY },
    { x: width - pivotX, y: height - pivotY },
    { x: -pivotX, y: height - pivotY }
  ];

  // Convert rotation to radians
  const angleRad = (rotation * Math.PI) / 180;

  // Rotate each corner around pivot
  const rotatedCorners = corners.map(corner => {
    const rx = corner.x * Math.cos(angleRad) - corner.y * Math.sin(angleRad);
    const ry = corner.x * Math.sin(angleRad) + corner.y * Math.cos(angleRad);
    return { x: rx + pivotX, y: ry + pivotY };
  });

  // Find bounding box
  const minX = Math.min(...rotatedCorners.map(c => c.x));
  const maxX = Math.max(...rotatedCorners.map(c => c.x));
  const minY = Math.min(...rotatedCorners.map(c => c.y));
  const maxY = Math.max(...rotatedCorners.map(c => c.y));

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}

/**
 * Calculate the 4 corner points of a rotated rectangle
 * Returns polygon points in CSS format (e.g., "x1,y1 x2,y2 ...")
 */
function calculateRotatedRectPolygon(
  width: number,
  height: number,
  rotation: number,
  pivotX: number, // in pixels
  pivotY: number  // in pixels
): string {
  // Rectangle corners relative to pivot (unrotated)
  // Top-left, Top-right, Bottom-right, Bottom-left
  const corners = [
    { x: -pivotX, y: -pivotY },           // Top-left (relative to pivot)
    { x: width - pivotX, y: -pivotY },    // Top-right
    { x: width - pivotX, y: height - pivotY }, // Bottom-right
    { x: -pivotX, y: height - pivotY }    // Bottom-left
  ];

  // Convert rotation to radians
  const angleRad = (rotation * Math.PI) / 180;

  // Rotate each corner around pivot (0,0 in relative coordinates)
  const rotatedCorners = corners.map(corner => {
    const rx = corner.x * Math.cos(angleRad) - corner.y * Math.sin(angleRad);
    const ry = corner.x * Math.sin(angleRad) + corner.y * Math.cos(angleRad);
    // Convert back to absolute coordinates (relative to container top-left)
    return {
      x: rx + pivotX,
      y: ry + pivotY
    };
  });

  // Format as CSS polygon points
  return rotatedCorners.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
}

interface EffectTemplateRendererProps {
  obj: EffectTemplate;
  pixelsPerVU: number;
  isDragging?: boolean;
  onMouseDown?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
  className?: string;
  isGM?: boolean;
  dispatch?: (action: any) => void;
  rulerStep?: number;
}

export const EffectTemplateRenderer: React.FC<EffectTemplateRendererProps> = ({
  obj,
  pixelsPerVU,
  isDragging = false,
  onMouseDown,
  onContextMenu,
  style = {},
  className = '',
  isGM = false,
  dispatch,
  rulerStep = 0
}) => {
  const [isDraggingPivot, setIsDraggingPivot] = useState(false);
  const [isDraggingRotation, setIsDraggingRotation] = useState(false);
  const [isDraggingWidth, setIsDraggingWidth] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const initialWidthRef = useRef<number>(obj.width ?? 100);
  const initialRotationRef = useRef<number>(obj.rotation ?? 0);
  const rotationMarkerWorldPosRef = useRef<{ x: number; y: number } | null>(null);
  const pivotDragStateRef = useRef<{ rotation: number; width: number; height: number; markerDistance: number; initialObj?: { x: number; y: number } } | null>(null);
  const rotationDragStateRef = useRef<{ initialHeight: number; initialWidth: number; initialDistance: number; pivotWorldX: number; pivotWorldY: number } | null>(null);
  const widthDragStateRef = useRef<{ initialWidth: number; initialDistance: number; pivotWorldX: number; pivotWorldY: number } | null>(null);

  // Get current language for step text formatting
  const language = useLanguage();

  // Convert img_ref:// URLs to displayable URLs for effect image
  const effectImageUrl = useImageUrl(obj.content || '');

  // Memoize language check for Russian-like languages (ru, sr, uk)
  const isRussianLanguage = useMemo(() =>
    language === 'ru' || language === 'sr' || language === 'uk',
    [language]
  );

  // Save the element rect at drag start for consistent coordinate calculations
  const dragStartRectRef = useRef<DOMRect | null>(null);

  // Preload image on mount to prevent flicker when dragging
  useEffect(() => {
    if (effectImageUrl) {
      preloadEffectImage(effectImageUrl);
    }
  }, [effectImageUrl]);

  // Generate hitbox polygon and determine base image height on first load
  useEffect(() => {
    if (!obj.hitboxPolygon && effectImageUrl) {
      generateHitboxFromImage(effectImageUrl).then(hitbox => {
        if (hitbox && dispatch) {
          dispatch({
            type: 'SET_HITBOX_POLYGON',
            payload: { objectId: obj.id, hitboxPolygon: hitbox.points }
          });
        }
      });
    }

    // Determine base image height from loaded image
    if (effectImageUrl && !obj.baseImageHeight) {
      const img = effectImageCache.get(effectImageUrl);
      if (img && img.naturalHeight > 0 && dispatch) {
        // Calculate baseImageHeight in VU based on image natural dimensions
        // Assuming the image is loaded with its natural aspect ratio
        const naturalWidth = img.naturalWidth;
        const naturalHeight = img.naturalHeight;
        const currentWidth = obj.width ?? 200;

        // Calculate what the height would be if we maintain natural aspect ratio
        const aspectRatio = naturalHeight / naturalWidth;
        const baseHeight = currentWidth * aspectRatio;

        dispatch({
          type: 'UPDATE_OBJECT',
          payload: {
            id: obj.id,
            updates: { baseImageHeight: baseHeight }
          }
        });
      }
    }
  }, [effectImageUrl, obj.hitboxPolygon, obj.baseImageHeight, obj.id, obj.width, dispatch]);

  // Handle pivot marker drag start
  const handlePivotMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!isGM && !(obj.playerControlEnabled ?? false)) {
      return;
    }

    const element = containerRef.current;
    if (!element) return;

    // Capture the element rect at drag start for consistent coordinate calculations
    dragStartRectRef.current = element.getBoundingClientRect();

    // Calculate and save rotation marker world position (fixed during pivot drag)
    const pivot = obj.pivot || { x: 50, y: 100 };
    const currentWidth = obj.width ?? 100;
    const currentHeight = obj.height ?? 100;
    const currentMarkerDistance = obj.rotationMarkerDistance ?? currentHeight;
    const rotation = obj.rotation ?? 0;

    // Calculate rotation marker position in pixels
    const angleRad = ((rotation - 90) * Math.PI) / 180;
    const pivotPixelX = (pivot.x / 100) * currentWidth;
    const pivotPixelY = (pivot.y / 100) * currentHeight;
    const markerPixelX = pivotPixelX + currentMarkerDistance * Math.cos(angleRad);
    const markerPixelY = pivotPixelY + currentMarkerDistance * Math.sin(angleRad);

    // Convert to world coordinates
    rotationMarkerWorldPosRef.current = {
      x: obj.x + markerPixelX,
      y: obj.y + markerPixelY
    };

    // Save initial state for drag
    pivotDragStateRef.current = {
      rotation: rotation,
      width: currentWidth,
      height: currentHeight,
      markerDistance: currentMarkerDistance,
      initialObj: { x: obj.x, y: obj.y }
    };

    setIsDraggingPivot(true);
  }, [isGM, dispatch, obj]);

  // Handle pivot marker dragging (constrained to ruler line)
  useEffect(() => {
    if (!isDraggingPivot) return;
    if (!pivotDragStateRef.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dispatch) return;

      // Validate mouse coordinates - ignore if outside valid range
      if (!isFinite(e.clientX) || !isFinite(e.clientY) ||
          e.clientX < -1000 || e.clientX > window.innerWidth + 1000 ||
          e.clientY < -1000 || e.clientY > window.innerHeight + 1000) {
        return; // Skip invalid coordinates
      }

      // Use saved rect from drag start for consistent coordinate calculations
      const rect = dragStartRectRef.current;
      if (!rect) return;

      // Validate object coordinates
      if (!isFinite(obj.x) || !isFinite(obj.y)) {
        return;
      }

      // Use current values from obj (not saved state) since they don't change during pivot drag
      const rotation = obj.rotation ?? 0;
      const currentHeight = obj.height ?? 100;
      const currentWidth = obj.width ?? 100;

      // Rotation Marker is at fixed world position (saved at drag start)
      const rotMarkerWorld = rotationMarkerWorldPosRef.current;
      if (!rotMarkerWorld || !isFinite(rotMarkerWorld.x) || !isFinite(rotMarkerWorld.y)) {
        return;
      }

      // Get mouse position in world coordinates (VU)
      const mouseX_VU = obj.x + (e.clientX - rect.left) / pixelsPerVU;
      const mouseY_VU = obj.y + (e.clientY - rect.top) / pixelsPerVU;

      // Validate calculated coordinates
      if (!isFinite(mouseX_VU) || !isFinite(mouseY_VU)) {
        return;
      }

      // Direction from rotation marker towards pivot (opposite of rotation direction)
      const angleRad = ((rotation - 90) * Math.PI) / 180;
      const dirX = -Math.cos(angleRad);
      const dirY = -Math.sin(angleRad);

      // Vector from rotation marker to mouse
      const toMouseX = mouseX_VU - rotMarkerWorld.x;
      const toMouseY = mouseY_VU - rotMarkerWorld.y;

      // Project mouse onto the line = distance from rotation marker to pivot
      const distance = toMouseX * dirX + toMouseY * dirY;

      // Clamp distance to reasonable range (5 VU to 500 VU)
      const clampedDistance = Math.max(5, Math.min(500, distance));

      // Calculate pivot position as percentage of image height
      // pivotY_pct is the position where the pivot should be on the image (0-100%)
      // We project the clamped distance onto the Y axis (upward direction when rotation=0)
      // distance / height gives us the ratio, then * 100 for percentage
      const pivotY_pct = (clampedDistance / currentHeight) * 100;

      // Clamp to valid range (0-100%)
      const clampedPivotY = Math.max(0, Math.min(100, pivotY_pct));
      const pivotX_pct = 50; // Always center horizontally

      // Update ONLY the pivot position and rotationMarkerDistance
      // Don't change height, width, or object position
      dispatch({
        type: 'UPDATE_OBJECT',
        payload: {
          id: obj.id,
          updates: {
            pivot: { x: pivotX_pct, y: clampedPivotY },
            rotationMarkerDistance: clampedDistance
          }
        }
      });
    };

    const handleMouseUp = () => {
      rotationMarkerWorldPosRef.current = null;
      pivotDragStateRef.current = null;
      dragStartRectRef.current = null;
      setIsDraggingPivot(false);
    };

    const cleanup = () => {
      rotationMarkerWorldPosRef.current = null;
      pivotDragStateRef.current = null;
      dragStartRectRef.current = null;
      setIsDraggingPivot(false);
    };

    // Use window for mousemove to catch events even when cursor leaves the viewport
    window.addEventListener('mousemove', handleMouseMove, { passive: false, capture: true });
    window.addEventListener('mouseup', handleMouseUp, { capture: true });
    window.addEventListener('pointercancel', cleanup);
    window.addEventListener('blur', cleanup);
    document.addEventListener('mouseleave', cleanup);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove, { capture: true as any });
      window.removeEventListener('mouseup', handleMouseUp, { capture: true as any });
      window.removeEventListener('pointercancel', cleanup);
      window.removeEventListener('blur', cleanup);
      document.removeEventListener('mouseleave', cleanup);
    };
  }, [isDraggingPivot, obj.id, obj.x, obj.y, obj.rotation, obj.height, obj.width, dispatch, pixelsPerVU]);

  // Handle rotation marker drag start
  const handleRotationMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!isGM && !(obj.playerControlEnabled ?? false)) {
      return;
    }

    const element = containerRef.current;
    if (!element) return;

    // Capture the element rect at drag start for consistent coordinate calculations
    dragStartRectRef.current = element.getBoundingClientRect();

    const pivot = obj.pivot || { x: 50, y: 50 };
    const currentWidth = obj.width ?? 100;
    const currentHeight = obj.height ?? 100;
    const rotation = obj.rotation ?? 0;

    // Use object dimensions in pixels for consistency
    const objWidth = currentWidth * pixelsPerVU;
    const objHeight = currentHeight * pixelsPerVU;

    // Calculate pivot position in object pixels (not screen pixels)
    const pivotPixelX = (pivot.x / 100) * objWidth;
    const pivotPixelY = (pivot.y / 100) * objHeight;

    // Calculate current rotation marker position in object pixels
    const currentMarkerDistanceVU = obj.rotationMarkerDistance ?? currentHeight;
    const markerDistancePixels = currentMarkerDistanceVU * pixelsPerVU;
    const markerPixelX = pivotPixelX + markerDistancePixels * Math.cos(((rotation - 90) * Math.PI) / 180);
    const markerPixelY = pivotPixelY + markerDistancePixels * Math.sin(((rotation - 90) * Math.PI) / 180);

    // Calculate initial distance in object pixels (what we'll compare against during drag)
    const initialDistance = Math.sqrt(
      Math.pow(markerPixelX - pivotPixelX, 2) + Math.pow(markerPixelY - pivotPixelY, 2)
    );

    // Calculate pivot world position (in VU)
    const pivotWorldX = obj.x + (pivot.x / 100) * currentWidth;
    const pivotWorldY = obj.y + (pivot.y / 100) * currentHeight;

    // Save initial state for proportional scaling
    rotationDragStateRef.current = {
      initialHeight: currentHeight,
      initialWidth: currentWidth,
      initialDistance: initialDistance,
      pivotWorldX,
      pivotWorldY
    };

    setIsDraggingRotation(true);
    initialWidthRef.current = currentWidth;
    initialRotationRef.current = rotation;
  }, [isGM, obj.width, obj.height, obj.rotation, obj.pivot, obj.x, obj.y, obj.rotationMarkerDistance, obj.playerControlEnabled, pixelsPerVU]);

  // Handle rotation marker dragging
  useEffect(() => {
    if (!isDraggingRotation) return;
    if (!rotationDragStateRef.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dispatch) return;

      // Validate mouse coordinates
      if (!isFinite(e.clientX) || !isFinite(e.clientY)) {
        return;
      }

      // Use SAVED rect from drag start for consistent coordinate calculations
      const rect = dragStartRectRef.current;
      if (!rect) {
        return;
      }

      const pivot = obj.pivot || { x: 50, y: 50 };
      const { initialHeight, initialWidth, initialDistance, pivotWorldX, pivotWorldY } = rotationDragStateRef.current!;

      // Pivot position in pixels for mouse calculation (using saved rect)
      const pivotPixelX = (pivot.x / 100) * rect.width;
      const pivotPixelY = (pivot.y / 100) * rect.height;

      // Mouse position relative to pivot (in pixels) - using saved rect
      const dx = e.clientX - rect.left - pivotPixelX;
      const dy = e.clientY - rect.top - pivotPixelY;

      // Calculate new rotation angle (add 90 degrees to compensate for -90 offset)
      const angleRad = Math.atan2(dy, dx);
      let newRotation = (angleRad * 180) / Math.PI + 90;

      // Calculate current distance from pivot to mouse (in pixels, then VU)
      const currentDistance = Math.sqrt(dx * dx + dy * dy);
      const distanceRatio = currentDistance / initialDistance;

      // Constrain distance ratio to prevent extreme sizes (0.1x to 10x)
      const clampedRatio = Math.max(0.1, Math.min(10, distanceRatio));
      const newHeight = initialHeight * clampedRatio;

      // Additional constraint: limit maximum size in VU to prevent browser rendering issues
      // At pixelsPerVU = 3, 5000 VU = 15000px which is well below browser limits
      const MAX_SIZE_VU = 5000;
      const finalHeight = Math.min(newHeight, MAX_SIZE_VU);

      // This distance becomes the new rotationMarkerDistance (in VU) - clamp it too
      const currentDistanceVU = currentDistance / pixelsPerVU;
      const newMarkerDistance = Math.max(5, Math.min(MAX_SIZE_VU, currentDistanceVU));

      // Calculate new width based on proportional scaling setting
      const useProportionalScaling = obj.proportionalScaling ?? false;
      const newWidth = useProportionalScaling ? initialWidth * clampedRatio : initialWidth;
      const finalWidth = Math.min(newWidth, MAX_SIZE_VU);

      // Calculate new object position to keep pivot at the same world position
      const newPivotOffsetX = (pivot.x / 100) * finalWidth;
      const newPivotOffsetY = (pivot.y / 100) * finalHeight;

      let newObjX = pivotWorldX - newPivotOffsetX;
      let newObjY = pivotWorldY - newPivotOffsetY;

      // Safety checks: prevent coordinates from becoming NaN, Infinity, or out of reasonable bounds
      if (!isFinite(newObjX) || !isFinite(newObjY) ||
          !isFinite(newRotation) || !isFinite(finalHeight) || !isFinite(finalWidth)) {
        return;
      }

      // Clamp coordinates to reasonable range (-100000 to 100000 VU)
      newObjX = Math.max(-100000, Math.min(100000, newObjX));
      newObjY = Math.max(-100000, Math.min(100000, newObjY));

      dispatch({
        type: 'UPDATE_OBJECT',
        payload: {
          id: obj.id,
          updates: {
            rotation: newRotation,
            height: finalHeight,
            width: finalWidth,
            rotationMarkerDistance: newMarkerDistance,
            x: newObjX,
            y: newObjY
          }
        }
      });
    };

    const handleMouseUp = () => {
      rotationDragStateRef.current = null;
      dragStartRectRef.current = null;
      setIsDraggingRotation(false);
    };

    const cleanup = () => {
      rotationDragStateRef.current = null;
      dragStartRectRef.current = null;
      setIsDraggingRotation(false);
    };

    // Use window for mousemove to catch events even when cursor leaves the viewport
    window.addEventListener('mousemove', handleMouseMove, { passive: false });
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('pointercancel', cleanup);
    window.addEventListener('blur', cleanup);
    document.addEventListener('mouseleave', cleanup);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('pointercancel', cleanup);
      window.removeEventListener('blur', cleanup);
      document.removeEventListener('mouseleave', cleanup);
    };
  }, [isDraggingRotation, obj.id, obj.pivot, obj.proportionalScaling, dispatch, pixelsPerVU]);

  // Handle width marker drag start
  const handleWidthMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!isGM && !(obj.playerControlEnabled ?? false)) {
      return;
    }

    const element = containerRef.current;
    if (!element) return;

    // Capture the element rect at drag start for consistent coordinate calculations
    dragStartRectRef.current = element.getBoundingClientRect();

    const pivot = obj.pivot || { x: 50, y: 50 };
    const currentWidth = obj.width ?? 100;
    const currentHeight = obj.height ?? 100;
    const rotation = obj.rotation ?? 0;

    // Use object dimensions in pixels for consistency
    const objWidth = currentWidth * pixelsPerVU;
    const objHeight = currentHeight * pixelsPerVU;

    // Calculate pivot position in object pixels (not screen pixels)
    const pivotPixelX = (pivot.x / 100) * objWidth;
    const pivotPixelY = (pivot.y / 100) * objHeight;

    // Calculate current width marker position in object pixels
    // Width marker is perpendicular to rotation marker (at angle `rotation`)
    // Width marker is at HALF the width (midpoint between pivot and right edge)
    const widthAngleRad = (rotation * Math.PI) / 180;
    const markerPixelX = pivotPixelX + (currentWidth / 2) * pixelsPerVU * Math.cos(widthAngleRad);
    const markerPixelY = pivotPixelY + (currentWidth / 2) * pixelsPerVU * Math.sin(widthAngleRad);

    // Calculate initial distance in object pixels (distance from pivot to marker)
    const initialDistance = Math.sqrt(
      Math.pow(markerPixelX - pivotPixelX, 2) + Math.pow(markerPixelY - pivotPixelY, 2)
    );

    // Calculate pivot world position (in VU)
    const pivotWorldX = obj.x + (pivot.x / 100) * currentWidth;
    const pivotWorldY = obj.y + (pivot.y / 100) * currentHeight;

    // Save initial state for proportional scaling
    widthDragStateRef.current = {
      initialWidth: currentWidth,
      initialDistance: initialDistance,
      pivotWorldX,
      pivotWorldY
    };

    setIsDraggingWidth(true);
    initialWidthRef.current = currentWidth;
  }, [isGM, obj.width, obj.height, obj.pivot, obj.x, obj.y, obj.rotation, obj.playerControlEnabled, pixelsPerVU]);

  // Handle width marker dragging
  useEffect(() => {
    if (!isDraggingWidth) return;
    if (!widthDragStateRef.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dispatch) return;

      // Validate mouse coordinates
      if (!isFinite(e.clientX) || !isFinite(e.clientY)) {
        return;
      }

      // Use SAVED rect from drag start for consistent coordinate calculations
      const rect = dragStartRectRef.current;
      if (!rect) return;

      const pivot = obj.pivot || { x: 50, y: 50 };
      const currentHeight = obj.height ?? 100;
      const rotation = obj.rotation ?? 0;
      const { initialWidth, initialDistance, pivotWorldX, pivotWorldY } = widthDragStateRef.current!;

      // Pivot position in pixels for mouse calculation (using saved rect)
      const pivotPixelX = (pivot.x / 100) * rect.width;
      const pivotPixelY = (pivot.y / 100) * rect.height;

      // Width marker line direction is at angle `rotation` (perpendicular to rotation marker)
      const widthAngleRad = (rotation * Math.PI) / 180;
      const dirX = Math.cos(widthAngleRad);
      const dirY = Math.sin(widthAngleRad);

      // Mouse position relative to pivot (using saved rect)
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const toMouseX = mouseX - pivotPixelX;
      const toMouseY = mouseY - pivotPixelY;

      // Project mouse onto the width line (perpendicular direction)
      const distance = toMouseX * dirX + toMouseY * dirY;

      // Calculate new width proportionally: width = initialWidth * (currentDistance / initialDistance)
      const distanceRatio = Math.abs(distance) / initialDistance;

      // Constrain distance ratio to prevent extreme sizes (0.1x to 10x)
      const clampedRatio = Math.max(0.1, Math.min(10, distanceRatio));
      const newWidth = initialWidth * clampedRatio;

      // Additional constraint: limit maximum size in VU to prevent browser rendering issues
      const MAX_SIZE_VU = 5000;
      const finalWidth = Math.min(newWidth, MAX_SIZE_VU);

      // Calculate new object position to keep pivot at the same world position
      const newPivotOffsetX = (pivot.x / 100) * finalWidth;
      const newPivotOffsetY = (pivot.y / 100) * currentHeight;

      let newObjX = pivotWorldX - newPivotOffsetX;
      let newObjY = pivotWorldY - newPivotOffsetY;

      // Safety checks: prevent coordinates from becoming NaN, Infinity, or out of reasonable bounds
      if (!isFinite(newObjX) || !isFinite(newObjY) || !isFinite(finalWidth)) {
        return;
      }

      // Clamp coordinates to reasonable range (-100000 to 100000 VU)
      newObjX = Math.max(-100000, Math.min(100000, newObjX));
      newObjY = Math.max(-100000, Math.min(100000, newObjY));

      dispatch({
        type: 'UPDATE_OBJECT',
        payload: {
          id: obj.id,
          updates: {
            width: finalWidth,
            x: newObjX,
            y: newObjY
          }
        }
      });
    };

    const handleMouseUp = () => {
      widthDragStateRef.current = null;
      dragStartRectRef.current = null;
      setIsDraggingWidth(false);
    };

    const cleanup = () => {
      widthDragStateRef.current = null;
      dragStartRectRef.current = null;
      setIsDraggingWidth(false);
    };

    // Use window for mousemove to catch events even when cursor leaves the viewport
    window.addEventListener('mousemove', handleMouseMove, { passive: false });
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('pointercancel', cleanup);
    window.addEventListener('blur', cleanup);
    document.addEventListener('mouseleave', cleanup);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('pointercancel', cleanup);
      window.removeEventListener('blur', cleanup);
      document.removeEventListener('mouseleave', cleanup);
    };
  }, [isDraggingWidth, obj.id, obj.pivot, obj.height, obj.rotation, dispatch, pixelsPerVU]);

  // Calculate dimensions and pivot (with fallback to prevent zero-size rendering)
  // Also protect against NaN/Infinity which can cause rendering issues
  const safeWidth = isFinite(obj.width) ? obj.width : 100;
  const safeHeight = isFinite(obj.height) ? obj.height : 100;

  // Browser rendering limits - most browsers have issues with elements larger than ~32767px
  // We clamp at a safe value to prevent rendering issues
  const MAX_PIXEL_SIZE = 20000;
  const objWidth = Math.min(Math.max(safeWidth * pixelsPerVU, 1), MAX_PIXEL_SIZE);
  const objHeight = Math.min(Math.max(safeHeight * pixelsPerVU, 1), MAX_PIXEL_SIZE);

  const pivot = obj.pivot || { x: 50, y: 50 };
  const rotation = obj.rotation || 0;

  // Build container style (no rotation here - applied to image wrapper only)
  // Protect against invalid coordinates that would cause rendering issues
  const safeX = isFinite(obj.x) ? obj.x : 0;
  const safeY = isFinite(obj.y) ? obj.y : 0;

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    left: safeX * pixelsPerVU,
    top: safeY * pixelsPerVU,
    width: objWidth,
    height: objHeight,
    minWidth: objWidth,
    minHeight: objHeight,
    zIndex: isDragging ? 999999 : (obj.zIndex || 1000),
    cursor: isDragging ? 'grabbing' : 'grab',
    opacity: obj.opacity !== undefined ? obj.opacity / 100 : 1,
    // Disable pointer events on container - clicks go through SVG polygon instead
    pointerEvents: 'none',
    // Use visible overflow so markers are visible
    overflow: 'visible',
    ...style
  };

  // Image wrapper with rotation (pivoted correctly)
  const imageWrapperStyle: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
    minWidth: objWidth,
    minHeight: objHeight,
    transform: `rotate(${rotation}deg)`,
    transformOrigin: `${pivot.x}% ${pivot.y}%`,
    pointerEvents: 'none',
    overflow: 'visible', // Allow image to extend beyond wrapper when scaled
    backfaceVisibility: 'hidden' as 'hidden',
  };

  // Pivot marker style (non-rotating, always on top)
  // Important: these are the base styles, don't let external style override critical ones
  const pivotMarkerBaseStyle = {
    position: 'absolute' as const,
    left: `${pivot.x}%`,
    top: `${pivot.y}%`,
    width: '16px',
    height: '16px',
    transform: 'translate(-50%, -50%)',
    borderRadius: '50%',
    backgroundColor: isDraggingPivot ? 'rgba(147, 51, 234, 1)' : 'rgba(147, 51, 234, 0.9)',
    border: '2px solid white',
    boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
    pointerEvents: 'auto' as const,
    zIndex: 10,
    transition: isDraggingPivot ? 'none' : 'transform 0.1s, background-color 0.2s',
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };

  // Image container style
  const imageStyle: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
    minWidth: objWidth,
    minHeight: objHeight,
    backgroundSize: 'contain',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'center',
    pointerEvents: 'none',
    userSelect: 'none',
    // Ensure transparent background instead of black during loading
    backgroundColor: 'transparent',
  };

  // Hide pivot marker when dragging the object (but not when dragging the pivot itself)
  // Show to GM always, or to players when playerControlEnabled is true
  const canControlEffect = isGM || (obj.playerControlEnabled ?? false);
  const shouldShowPivotMarker = !isDragging && canControlEffect && !(obj as any).inCursorSlot;

  // Show rotation marker and ruler whenever pivot marker is shown and user can control
  const shouldShowRotationControls = shouldShowPivotMarker && canControlEffect;

  // Show width marker only if showWidthMarker is enabled (and not when proportionalScaling is on)
  const shouldShowWidthMarker = shouldShowRotationControls && (obj.showWidthMarker ?? true) && !(obj.proportionalScaling ?? false);

  // Calculate rotation marker position (in pixels, relative to container)
  // Use rotationMarkerDistance if available, otherwise fall back to height
  const markerDistance = (obj.rotationMarkerDistance ?? obj.height ?? 200) * pixelsPerVU;
  let markerPixelX: number;
  let markerPixelY: number;

  // Calculate rotation marker position based on pivot, rotation, and marker distance
  const angleRad = ((rotation - 90) * Math.PI) / 180;
  markerPixelX = (pivot.x / 100) * objWidth + markerDistance * Math.cos(angleRad);
  markerPixelY = (pivot.y / 100) * objHeight + markerDistance * Math.sin(angleRad);

  // Calculate width marker position (in pixels, relative to container)
  // Width marker is perpendicular to rotation marker (90 degrees apart)
  const pivotPixelX = (pivot.x / 100) * objWidth;
  const pivotPixelY = (pivot.y / 100) * objHeight;

  // Rotation marker angle: rotation - 90 (points upward when rotation = 0)
  // Width marker angle: rotation (points right when rotation = 0, perpendicular to rotation marker)
  const widthAngleRad = (rotation * Math.PI) / 180;
  // Width marker is at midpoint between pivot and right edge (half of width)
  const widthMarkerDistance = (obj.width / 2) * pixelsPerVU;
  const widthMarkerX = pivotPixelX + widthMarkerDistance * Math.cos(widthAngleRad);
  const widthMarkerY = pivotPixelY + widthMarkerDistance * Math.sin(widthAngleRad);

  // Calculate length in VU for display (height = length of the template)
  // Calculate length in VU for display (use rotationMarkerDistance if available)
  const lengthVU = (obj.rotationMarkerDistance ?? obj.height ?? 100).toFixed(1);
  // Calculate step count if ruler step is enabled
  const lengthValue = obj.rotationMarkerDistance ?? obj.height ?? 100;
  const stepCount = rulerStep > 0 ? (lengthValue / rulerStep).toFixed(1) : null;
  // Format step text in parentheses with space: ru = " (5ш)", en = " (5.0st)"
  const stepText = stepCount !== null
    ? (isRussianLanguage ? ` (${stepCount}ш)` : ` (${stepCount}st)`)
    : '';
  // Width ruler shows distance from pivot to width marker (half of total width)
  const widthValue = (obj.width ?? 100) / 2;
  const widthVU = widthValue.toFixed(1);
  // Calculate step count for width ruler
  const widthStepCount = rulerStep > 0 ? (widthValue / rulerStep).toFixed(1) : null;
  const widthStepText = widthStepCount !== null
    ? (isRussianLanguage ? ` (${widthStepCount}ш)` : ` (${widthStepCount}st)`)
    : '';

  return (
    <div
      ref={containerRef}
      className={`effect-template ${className}`}
      data-object-id={obj.id}
      data-object-type={obj.type}
      style={containerStyle}
      onContextMenu={onContextMenu}
    >
      {/* Rotated image wrapper */}
      <div data-rotated-object="true" style={imageWrapperStyle}>
        {/* Effect image - use img tag directly with cached source */}
        <img
          src={effectImageUrl}
          alt=""
          crossOrigin="anonymous"
          onError={(e) => {
            // If loading fails due to CORS, retry without crossOrigin attribute
            const img = e.currentTarget;
            if (img.crossOrigin === 'anonymous') {
              img.removeAttribute('crossOrigin');
              img.src = effectImageUrl; // Retry loading
            }
          }}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '100%',
            height: '100%',
            objectFit: 'fill', // Allow stretching beyond original image dimensions
            opacity: obj.opacity !== undefined ? obj.opacity / 100 : 1,
            pointerEvents: 'none',
            userSelect: 'none',
            backgroundColor: 'transparent',
          }}
          draggable={false}
        />
      </div>

      {/* SVG hit area for rotated template - ensures clicks only register on the actual image area */}
      <svg
        data-effect-svg={obj.id}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none', // Changed from 'auto' to let polygon handle events
          zIndex: 1,
          overflow: 'visible',
        }}
      >
        <polygon
          data-effect-polygon={obj.id}
          points={calculateRotatedRectPolygon(
            objWidth,
            objHeight,
            rotation,
            (pivot.x / 100) * objWidth,
            (pivot.y / 100) * objHeight
          )}
          fill="rgba(0, 0, 0, 0.01)"
          stroke="transparent"
          strokeWidth="0"
          style={{ pointerEvents: 'fill', cursor: isDragging ? 'grabbing' : 'grab' }}
          onMouseDown={(e) => {
            // Ignore clicks on markers (they have higher z-index and will catch first)
            if ((e.target as HTMLElement).closest('[data-pivot-marker]') ||
                (e.target as HTMLElement).closest('[data-rotation-marker]') ||
                (e.target as HTMLElement).closest('[data-width-marker]')) {
              return;
            }
            // Forward to parent handler
            onMouseDown?.(e);
          }}
          onContextMenu={onContextMenu}
        />
      </svg>

      {/* Pivot marker (non-rotating, always on top) */}
      {shouldShowPivotMarker && (
        <div
          data-pivot-marker="true"
          onMouseDown={handlePivotMouseDown}
          style={{
            ...pivotMarkerBaseStyle,
            cursor: canControlEffect ? 'move' : 'default',
          }}
          title={canControlEffect ? "Drag to move pivot point" : "Pivot point (GM only)"}
        />
      )}

      {/* Rotation controls: ruler line and marker (visible when editing) */}
      {shouldShowRotationControls && (
        <>
          {/* SVG for ruler line and ticks */}
          <svg
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              zIndex: 99999,
              overflow: 'visible',
            }}
          >
            {/* Ruler line - dashed */}
            <line
              x1={`${pivot.x}%`}
              y1={`${pivot.y}%`}
              x2={markerPixelX}
              y2={markerPixelY}
              stroke="rgba(255, 255, 255, 0.8)"
              strokeWidth="2"
              strokeDasharray="4,4"
            />

            {/* Length label */}
            <text
              x={(markerPixelX + (pivot.x / 100) * objWidth) / 2}
              y={(markerPixelY + (pivot.y / 100) * objHeight) / 2 - 10}
              textAnchor="middle"
              fill="rgba(255, 255, 255, 1)"
              fontSize="12"
              fontWeight="bold"
              style={{
                textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                pointerEvents: 'none',
              }}
            >
              {lengthVU}{stepText}
            </text>
          </svg>

          {/* Square rotation marker at the end */}
          <div
            data-rotation-marker="true"
            onMouseDown={handleRotationMouseDown}
            style={{
              position: 'absolute',
              left: markerPixelX,
              top: markerPixelY,
              width: '14px',
              height: '14px',
              transform: 'translate(-50%, -50%)',
              borderRadius: '2px',
              backgroundColor: isDraggingRotation ? 'rgba(234, 179, 8, 1)' : 'rgba(234, 179, 8, 0.9)',
              border: '2px solid white',
              boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
              pointerEvents: 'auto',
              zIndex: 10,
              transition: isDraggingRotation ? 'none' : 'transform 0.1s, background-color 0.2s',
              cursor: canControlEffect ? 'crosshair' : 'default',
            }}
            title={canControlEffect ? "Drag to rotate and resize" : "Rotation control (GM only)"}
          >
            {/* Small dot in center to show it's a control point */}
            <div
              style={{
                width: '4px',
                height: '4px',
                backgroundColor: 'white',
                borderRadius: '50%',
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
              }}
            />
          </div>
        </>
      )}

      {/* Width controls: ruler line and marker (visible when editing and showWidthMarker is enabled) */}
      {shouldShowWidthMarker && (
        <>
          {/* SVG for width ruler line and ticks */}
          <svg
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              zIndex: 99998,
              overflow: 'visible',
            }}
          >
            {/* Ruler line - dashed */}
            <line
              x1={pivotPixelX}
              y1={pivotPixelY}
              x2={widthMarkerX}
              y2={widthMarkerY}
              stroke="rgba(255, 255, 255, 0.8)"
              strokeWidth="2"
              strokeDasharray="4,4"
            />

            {/* Width label */}
            <text
              x={(widthMarkerX + pivotPixelX) / 2}
              y={(widthMarkerY + pivotPixelY) / 2 - 10}
              textAnchor="middle"
              fill="rgba(255, 255, 255, 1)"
              fontSize="12"
              fontWeight="bold"
              style={{
                textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                pointerEvents: 'none',
              }}
            >
              {widthVU}{widthStepText}
            </text>
          </svg>

          {/* Square width marker at the end */}
          <div
            data-width-marker="true"
            onMouseDown={handleWidthMouseDown}
            style={{
              position: 'absolute',
              left: widthMarkerX,
              top: widthMarkerY,
              width: '14px',
              height: '14px',
              transform: 'translate(-50%, -50%)',
              borderRadius: '2px',
              backgroundColor: isDraggingWidth ? 'rgba(59, 130, 246, 1)' : 'rgba(59, 130, 246, 0.9)',
              border: '2px solid white',
              boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
              pointerEvents: 'auto',
              zIndex: 10,
              transition: isDraggingWidth ? 'none' : 'transform 0.1s, background-color 0.2s',
              cursor: canControlEffect ? 'ew-resize' : 'default',
            }}
            title={canControlEffect ? "Drag to resize width" : "Width control (GM only)"}
          >
            {/* Small dot in center to show it's a control point */}
            <div
              style={{
                width: '4px',
                height: '4px',
                backgroundColor: 'white',
                borderRadius: '50%',
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
              }}
            />
          </div>
        </>
      )}

      {/* Lock indicator */}
      {obj.locked && (
        <div
          style={{
            position: 'absolute',
            top: '4px',
            right: '4px',
            width: '16px',
            height: '16px',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none'
          }}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
      )}
    </div>
  );
};

export const EffectTemplateRendererMemo = memo(EffectTemplateRenderer, (prevProps, nextProps) => {
  // Compare style object by value (only pointerEvents matters for effects)
  const prevPointerEvents = prevProps.style?.pointerEvents;
  const nextPointerEvents = nextProps.style?.pointerEvents;

  return (
    prevProps.obj.id === nextProps.obj.id &&
    prevProps.obj.x === nextProps.obj.x &&
    prevProps.obj.y === nextProps.obj.y &&
    prevProps.obj.rotation === nextProps.obj.rotation &&
    prevProps.obj.width === nextProps.obj.width &&
    prevProps.obj.height === nextProps.obj.height &&
    prevProps.obj.opacity === nextProps.obj.opacity &&
    prevProps.obj.locked === nextProps.obj.locked &&
    prevProps.obj.pivot?.x === nextProps.obj.pivot?.x &&
    prevProps.obj.pivot?.y === nextProps.obj.pivot?.y &&
    prevProps.obj.content === nextProps.obj.content &&
    (prevProps.obj as EffectTemplate).showWidthMarker === (nextProps.obj as EffectTemplate).showWidthMarker &&
    (prevProps.obj as EffectTemplate).proportionalScaling === (nextProps.obj as EffectTemplate).proportionalScaling &&
    (prevProps.obj as any).inCursorSlot === (nextProps.obj as any).inCursorSlot &&
    prevProps.pixelsPerVU === nextProps.pixelsPerVU &&
    prevProps.isDragging === nextProps.isDragging &&
    prevProps.isGM === nextProps.isGM &&
    prevProps.rulerStep === nextProps.rulerStep &&
    prevProps.className === nextProps.className &&
    prevPointerEvents === nextPointerEvents &&
    prevProps.onMouseDown === nextProps.onMouseDown &&
    prevProps.onContextMenu === nextProps.onContextMenu &&
    prevProps.dispatch === nextProps.dispatch
  );
});

EffectTemplateRendererMemo.displayName = 'EffectTemplateRendererMemo';
