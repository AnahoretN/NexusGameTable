import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { Move } from 'lucide-react';
import { useGame } from '../store/GameContext';
import { useActivePlayerId } from '../store/contexts';
import { useDrawingTool } from '../contexts/ToolSettingsContext';
import { ItemType, Stroke, StrokePoint, Drawing } from '../types';
import { findDrawingAtPosition, getStrokesBounds, getStrokeBounds } from '../utils/drawingUtils';

interface DrawingCanvasProps {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  cursorSlotLength: number; // Number of items in cursor slot
  pixelsPerVU: number; // Scale factor for converting VU <-> canvas pixels
}

// Find ALL drawings that overlap with the given stroke (same color only)
// Returns array of overlapping drawings (empty array if none)
// Optimized with early exit based on bounding box check before point-by-point comparison
const findOverlappingDrawings = (stroke: Stroke, drawings: Drawing[]): Drawing[] => {
  const strokeRadius = stroke.thickness / 2;
  const margin = strokeRadius + 5; // Small margin for near-touching strokes
  const overlapping: Drawing[] = [];
  const overlappingSet = new Set<Drawing>(); // For O(1) lookup

  // Calculate stroke bounding box for quick rejection
  let strokeMinX = Infinity, strokeMinY = Infinity, strokeMaxX = -Infinity, strokeMaxY = -Infinity;
  for (const point of stroke.points) {
    strokeMinX = Math.min(strokeMinX, point.x);
    strokeMinY = Math.min(strokeMinY, point.y);
    strokeMaxX = Math.max(strokeMaxX, point.x);
    strokeMaxY = Math.max(strokeMaxY, point.y);
  }
  // Add margin to stroke bounds
  strokeMinX -= margin;
  strokeMinY -= margin;
  strokeMaxX += margin;
  strokeMaxY += margin;

  for (const drawing of drawings) {
    if (drawing.type !== ItemType.DRAWING) continue;

    // Quick bounding box check: skip if drawing is far from stroke
    const drawingBounds = getStrokesBounds(drawing.strokes);
    const drawingWorldMinX = drawingBounds.minX + drawing.x;
    const drawingWorldMinY = drawingBounds.minY + drawing.y;
    const drawingWorldMaxX = drawingBounds.maxX + drawing.x;
    const drawingWorldMaxY = drawingBounds.maxY + drawing.y;

    // Skip if bounding boxes don't overlap
    if (strokeMaxX < drawingWorldMinX || strokeMinX > drawingWorldMaxX ||
        strokeMaxY < drawingWorldMinY || strokeMinY > drawingWorldMaxY) {
      continue;
    }

    // Check if this drawing has strokes of the same color
    const sameColorStrokes = drawing.strokes.filter(s => s.color === stroke.color);
    if (sameColorStrokes.length === 0) continue;

    // Check if stroke actually intersects with any same-color stroke in this drawing
    for (const existingStroke of sameColorStrokes) {
      const existingRadius = existingStroke.thickness / 2;
      const combinedRadius = strokeRadius + existingRadius + margin;
      const combinedRadiusSq = combinedRadius * combinedRadius; // Compare squared distances to avoid sqrt

      // Check each point in new stroke against each point in existing stroke
      for (const newPoint of stroke.points) {
        // Convert new point (world coords) to drawing's local coords
        const localX = newPoint.x - drawing.x;
        const localY = newPoint.y - drawing.y;

        for (const existingPoint of existingStroke.points) {
          const dx = localX - existingPoint.x;
          const dy = localY - existingPoint.y;
          const distanceSq = dx * dx + dy * dy;

          if (distanceSq <= combinedRadiusSq) {
            // Found actual overlap between strokes of same color
            if (!overlappingSet.has(drawing)) {
              overlappingSet.add(drawing);
              overlapping.push(drawing);
            }
            break; // Found overlap with this drawing, move to next
          }
        }
      }
      if (overlappingSet.has(drawing)) break; // Already found overlap, no need to check more strokes
    }
  }
  return overlapping;
};

export const DrawingCanvas: React.FC<DrawingCanvasProps> = ({
  width,
  height,
  offsetX,
  offsetY,
  cursorSlotLength = 0,
  pixelsPerVU = 1
}) => {
  // Stroke points, thickness and drawing x/y are stored in VU (virtual units),
  // NOT canvas pixels. This keeps drawings independent of browser zoom /
  // window size / fullscreen: they scale with the world like every other object.
  // Convert VU -> canvas px only where we touch the 2D context (const k below).
  const k = pixelsPerVU;
  const { state, dispatch, isHost } = useGame();
  const activePlayerId = useActivePlayerId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastEraserProcessTimeRef = useRef<number>(0);
  const eraserModifiedDrawingsRef = useRef<Map<string, Drawing>>(new Map());
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<StrokePoint[]>([]);
  const [isOverPanel, setIsOverPanel] = useState(false);
  const currentTool = useDrawingTool();
  const [isAltPressed, setIsAltPressed] = useState(false); // Track ALT key for normal cursor mode
  const [isShiftPressed, setIsShiftPressed] = useState(false); // Track Shift key for move cursor mode

  // Drawing drag state
  const [isDraggingDrawing, setIsDraggingDrawing] = useState(false);
  const [draggedDrawingId, setDraggedDrawingId] = useState<string | null>(null);
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number } | null>(null);
  const [dragStartDrawingPos, setDragStartDrawingPos] = useState<{ x: number; y: number } | null>(null);
  // Throttle for drag position dispatches + synchronous drag flag (window listeners)
  const drawingDragLastDispatchRef = useRef<number>(0);
  const isDraggingDrawingRef = useRef(false);
  const drawingDragTrailingTimerRef = useRef<number | null>(null);
  const drawingDragPendingPosRef = useRef<{ x: number; y: number } | null>(null);

  // Keep the synchronous drag flag in sync with state
  useEffect(() => {
    isDraggingDrawingRef.current = isDraggingDrawing;
  }, [isDraggingDrawing]);

  // Local cache for immediate eraser feedback
  const [localDrawingsCache, setLocalDrawingsCache] = useState<Map<string, Drawing>>(new Map());

  // Track initial stroke data for network commit on drawing end (guests only)
  const strokeStartDataRef = useRef<{ color: string; thickness: number } | null>(null);

  // Memoize filtered drawings to avoid repeated Object.values().filter() calls
  const drawings = useMemo(() => {
    return Object.values(state.objects).filter((obj): obj is Drawing =>
      obj.type === ItemType.DRAWING && obj.isOnTable
    );
  }, [state.objects]);

  // Update local cache when drawings change from Redux (separate useEffect to avoid issues)
  useEffect(() => {
    setLocalDrawingsCache(new Map(drawings.map(d => [d.id, d])));
  }, [drawings]);

  // Track ALT and Shift keys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && !isAltPressed) {
        setIsAltPressed(true);
      }
      if (e.shiftKey && !isShiftPressed) {
        setIsShiftPressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e.altKey && isAltPressed) {
        setIsAltPressed(false);
      }
      if (!e.shiftKey && isShiftPressed) {
        setIsShiftPressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isAltPressed, isShiftPressed]);

  // Notify other components about current tool state for Shift+drag behavior
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('current-tool-changed', {
      detail: { tool: currentTool }
    }));
  }, [currentTool]);

  // Set canvas dimensions
  const canvas = canvasRef.current;
  useEffect(() => {
    if (canvas) {
      canvas.width = width;
      canvas.height = height;
    }
  }, [width, height]);

  // Drawing settings (sync with MainMenuContent via events)
  const [markerColor, setMarkerColor] = useState('#ff0000');
  const [markerThickness, setMarkerThickness] = useState(10);
  const [markerOpacity, setMarkerOpacity] = useState(100);

  // Listen for marker settings changes from MainMenuContent
  useEffect(() => {
    const handleMarkerSettingsChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ color: string; thickness: number; opacity?: number }>;
      setMarkerColor(customEvent.detail.color);
      setMarkerThickness(customEvent.detail.thickness);
      if (customEvent.detail.opacity !== undefined) {
        setMarkerOpacity(customEvent.detail.opacity);
      }
    };

    window.addEventListener('marker-settings-changed', handleMarkerSettingsChange);
    // Request initial settings
    window.dispatchEvent(new Event('marker-settings-request'));

    return () => window.removeEventListener('marker-settings-changed', handleMarkerSettingsChange);
  }, []);

  // Eraser settings
  const [eraserThickness, setEraserThickness] = useState(20);

  // Listen for eraser settings changes
  useEffect(() => {
    const handleEraserSettingsChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ thickness: number }>;
	      const newThickness = Math.max(15, customEvent.detail.thickness);
setEraserThickness(newThickness);
// No need to redraw - eraser settings only affect new erasing actions
    };

    window.addEventListener('eraser-settings-changed', handleEraserSettingsChange);
    // Request initial settings
    window.dispatchEvent(new Event('eraser-settings-request'));

    return () => {
      window.removeEventListener('eraser-settings-changed', handleEraserSettingsChange);
    };
  }, []); // Run once on mount

  // Listen for settings sync response
  useEffect(() => {
    const handleSettingsSync = (e: Event) => {
      const customEvent = e as CustomEvent<{ color: string; thickness: number; opacity?: number }>;
      setMarkerColor(customEvent.detail.color);
      setMarkerThickness(customEvent.detail.thickness);
      if (customEvent.detail.opacity !== undefined) {
        setMarkerOpacity(customEvent.detail.opacity);
      }
    };

    window.addEventListener('marker-settings-sync', handleSettingsSync);
    return () => window.removeEventListener('marker-settings-sync', handleSettingsSync);
  }, []);

  const redrawCanvas = useCallback((ctx: CanvasRenderingContext2D, useCache = false) => {
    if (!canvasRef.current) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

    // Use either cache, eraser modifications, or regular drawings
    let drawingsToDraw = drawings;

    if (useCache) {
      drawingsToDraw = Array.from(localDrawingsCache.values());
    } else if (eraserModifiedDrawingsRef.current.size > 0) {
      // Apply eraser modifications on top of regular drawings
      drawingsToDraw = drawings.map(d =>
        eraserModifiedDrawingsRef.current.get(d.id) || d
      );
    }

    // Draw all Drawing objects
    drawingsToDraw.forEach(drawing => {
      // Apply drawing opacity (convert 1-100 to 0-1)
      const opacity = (drawing.opacity ?? 100) / 100;
      ctx.globalAlpha = opacity;

      drawing.strokes.forEach(stroke => {
        if (stroke.points.length < 2) return;

        ctx.beginPath();
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.thickness * k;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Transform and draw each point (relative to drawing position)
        // Points are stored in VU - scale to canvas px; offsetX/Y are scroll px
        stroke.points.forEach((point, index) => {
          const screenX = (point.x + drawing.x) * k - offsetX;
          const screenY = (point.y + drawing.y) * k - offsetY;

          if (index === 0) {
            ctx.moveTo(screenX, screenY);
          } else {
            ctx.lineTo(screenX, screenY);
          }
        });

        ctx.stroke();
      });

      // Reset opacity for next drawing
      ctx.globalAlpha = 1;
    });


    // Draw current stroke being drawn (preview)
    if (isDrawing && currentStroke.length > 0 && currentTool === 'marker') {
      ctx.beginPath();
      ctx.strokeStyle = markerColor;
      ctx.lineWidth = markerThickness * k;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      currentStroke.forEach((point, index) => {
        // Points are stored in VU - scale to canvas px; offsetX/Y are scroll px
        const screenX = point.x * k - offsetX;
        const screenY = point.y * k - offsetY;

        if (index === 0) {
          ctx.moveTo(screenX, screenY);
        } else {
          ctx.lineTo(screenX, screenY);
        }
      });

      ctx.stroke();
    }
  }, [drawings, localDrawingsCache, offsetX, offsetY, currentTool, markerColor, markerThickness, eraserThickness, isDrawing, currentStroke, isAltPressed, isShiftPressed, isOverPanel, pixelsPerVU]);

  // Helper function to redraw with cache for immediate eraser feedback

  const getWorldPosition = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;

    // Convert screen px to world position in VU
    // (canvas px = VU * pixelsPerVU; offsetX/Y are scroll px)
    return {
      x: (screenX + offsetX) / k,
      y: (screenY + offsetY) / k
    };
  }, [offsetX, offsetY, pixelsPerVU]);

  // Global mouse move handler to track cursor position even when over panels (canvas has pointer-events: none)
  useEffect(() => {
    if (currentTool !== 'marker' && currentTool !== 'eraser') return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      // Check if cursor is over a panel or any UI element
      const elementsAtPoint = document.elementsFromPoint(e.clientX, e.clientY);
      let isOverUI = elementsAtPoint.some(el =>
        el instanceof HTMLElement && (
          el.dataset.uiObject != null ||  // Panels and windows have data-ui-object
          el.dataset.mainMenu === 'true' || // Main menu specific
          el.closest('[data-ui-object]') != null || // Inside a panel/window
          el.tagName === 'BUTTON' ||
          el.tagName === 'INPUT' ||
          el.tagName === 'SELECT' ||
          el.tagName === 'TEXTAREA'
        )
      );

      // Also check if cursor is near any panel/window border
      const panelElements = document.querySelectorAll('[data-ui-object]');
      for (const panel of panelElements) {
        if (panel instanceof HTMLElement) {
          const rect = panel.getBoundingClientRect();
          const margin = 5;
          if (e.clientX >= rect.left - margin &&
              e.clientX <= rect.right + margin &&
              e.clientY >= rect.top - margin &&
              e.clientY <= rect.bottom + margin) {
            isOverUI = true;
            break;
          }
        }
      }

      setIsOverPanel(isOverUI);
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    return () => window.removeEventListener('mousemove', handleGlobalMouseMove);
  }, [currentTool]);

  // Keep redrawCanvas in a ref to avoid stale closures
  const redrawCanvasRef = useRef(redrawCanvas);
  useEffect(() => {
    redrawCanvasRef.current = redrawCanvas;
  }, [redrawCanvas]);

  // Redraw canvas when drawings, view transform or viewport scale changes
  // (pixelsPerVU changes canvas px size, so drawings must be redrawn in new scale)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        redrawCanvasRef.current(ctx);
      }
    }
  }, [state.objects, offsetX, offsetY, pixelsPerVU]); // Only depend on things that affect drawing display

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (currentTool !== 'marker' && currentTool !== 'eraser') return;
    if (isOverPanel) return; // Don't draw when over a panel
    if (e.altKey) return; // Don't draw/erase when ALT is pressed (normal cursor mode)

    const pos = getWorldPosition(e.clientX, e.clientY);

    // Check if Shift is pressed with eraser - delete entire drawing
    if (currentTool === 'eraser' && e.shiftKey) {
      // Use cached drawings for more up-to-date data
      const drawingsToUse = localDrawingsCache.size > 0 ? Array.from(localDrawingsCache.values()) : drawings;
      const clickedDrawing = findDrawingAtPosition(pos.x, pos.y, drawingsToUse);

      if (clickedDrawing && !clickedDrawing.locked) {
        // Delete the entire drawing
        dispatch({
          type: 'DELETE_OBJECT',
          payload: { id: clickedDrawing.id }
        });
        return;
      }
    }

    // Check if Shift is pressed for drawing drag mode (only when cursor slot has items)
    // If cursor slot is empty, allow Shift+drag to move drawings instead
    if (currentTool === 'marker' && e.shiftKey && cursorSlotLength > 0) {
      // Use cached drawings for more up-to-date data
      const drawingsToUse = localDrawingsCache.size > 0 ? Array.from(localDrawingsCache.values()) : drawings;
      const clickedDrawing = findDrawingAtPosition(pos.x, pos.y, drawingsToUse);

      // Moving ignores the drawing's lock - only cursor drag-and-drop respects it
      if (clickedDrawing) {
        // Start dragging the drawing
        setIsDraggingDrawing(true);
        setDraggedDrawingId(clickedDrawing.id);
        setDragStartPos(pos);
        setDragStartDrawingPos({ x: clickedDrawing.x, y: clickedDrawing.y });
        return;
      }
      // If Shift is pressed with items in cursor slot but not over a drawing, don't draw
      return;
    }

    // Shift with empty cursor slot: allow moving drawings, but NOT drawing on empty space
    // (empty space Shift+drag is handled by TabletopEventHandlers for panning)
    if (e.shiftKey && currentTool === 'marker' && cursorSlotLength === 0) {
      // Use cached drawings for more up-to-date data
      const drawingsToUse = localDrawingsCache.size > 0 ? Array.from(localDrawingsCache.values()) : drawings;
      const clickedDrawing = findDrawingAtPosition(pos.x, pos.y, drawingsToUse);

      // Moving ignores the drawing's lock - only cursor drag-and-drop respects it
      if (clickedDrawing) {
        // Start dragging the drawing instead of drawing
        setIsDraggingDrawing(true);
        setDraggedDrawingId(clickedDrawing.id);
        setDragStartPos(pos);
        setDragStartDrawingPos({ x: clickedDrawing.x, y: clickedDrawing.y });
        return;
      }
      // Not over a drawing - don't draw, let TabletopEventHandlers handle panning
      return;
    }

    setIsDrawing(true);
    setCurrentStroke([{ x: pos.x, y: pos.y }]);
    // Store stroke start data for network commit (guests only)
    strokeStartDataRef.current = { color: markerColor, thickness: markerThickness };
  }, [currentTool, getWorldPosition, isOverPanel, drawings, markerColor, markerThickness, cursorSlotLength, localDrawingsCache]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // Check if cursor is over a panel or any UI element via DOM
    const elementsAtPoint = document.elementsFromPoint(e.clientX, e.clientY);
    let isOverUI = elementsAtPoint.some(el =>
      el instanceof HTMLElement && (
        el.dataset.uiObject != null ||  // Panels and windows have data-ui-object
        el.dataset.mainMenu === 'true' || // Main menu specific
        el.closest('[data-ui-object]') != null || // Inside a panel/window
        el.tagName === 'BUTTON' ||
        el.tagName === 'INPUT' ||
        el.tagName === 'SELECT' ||
        el.tagName === 'TEXTAREA'
      )
    );

    // Also check if cursor is near any panel/window border by checking their DOM elements directly
    // This catches the edge case where cursor is exactly on the border
    const panelElements = document.querySelectorAll('[data-ui-object]');
    for (const panel of panelElements) {
      if (panel instanceof HTMLElement) {
        const rect = panel.getBoundingClientRect();
        // Add 5px margin around panel to detect edges
        const margin = 5;
        if (e.clientX >= rect.left - margin &&
            e.clientX <= rect.right + margin &&
            e.clientY >= rect.top - margin &&
            e.clientY <= rect.bottom + margin) {
          isOverUI = true;
          break;
        }
      }
    }

    setIsOverPanel(isOverUI);

    if (currentTool === 'marker' || currentTool === 'eraser') {
    }
    // Update cursor position for all tools - use world position so it aligns with strokes
    const canvas = canvasRef.current;
    const pos = getWorldPosition(e.clientX, e.clientY);

    // Handle drawing dragging
    if (isDraggingDrawing && draggedDrawingId && dragStartPos && dragStartDrawingPos) {
      // Throttle position commits to one per 250ms - mousemove fires much faster,
      // and every commit triggers a full state update + canvas redraw.
      // A trailing commit is scheduled so the final movement is not lost.
      const now = performance.now();
      const sinceLast = now - drawingDragLastDispatchRef.current;
      const commitDragPos = () => {
        const dx = pos.x - dragStartPos.x;
        const dy = pos.y - dragStartPos.y;
        dispatch({
          type: 'UPDATE_OBJECT',
          payload: {
            id: draggedDrawingId,
            x: dragStartDrawingPos.x + dx,
            y: dragStartDrawingPos.y + dy
          },
          _localOnly: true, // Don't send over network during drag
        });
      };
      if (sinceLast < 250) {
        // Trailing commit: schedule the position for when the throttle window ends
        if (drawingDragTrailingTimerRef.current === null) {
          drawingDragTrailingTimerRef.current = window.setTimeout(() => {
            drawingDragTrailingTimerRef.current = null;
            if (isDraggingDrawingRef.current && drawingDragPendingPosRef.current) {
              drawingDragLastDispatchRef.current = performance.now();
              const p = drawingDragPendingPosRef.current;
              const dx = p.x - dragStartPos.x;
              const dy = p.y - dragStartPos.y;
              dispatch({
                type: 'UPDATE_OBJECT',
                payload: {
                  id: draggedDrawingId,
                  x: dragStartDrawingPos.x + dx,
                  y: dragStartDrawingPos.y + dy
                },
                _localOnly: true,
              });
            }
          }, 250 - sinceLast);
        }
        drawingDragPendingPosRef.current = pos;
        return;
      }
      drawingDragLastDispatchRef.current = now;
      commitDragPos();
      return;
    }

    if (!isDrawing) {
      return; // Cursor is now CSS-based, no canvas redraw needed
    }

    setCurrentStroke(prev => [...prev, { x: pos.x, y: pos.y }]);

    // Draw preview
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx || currentStroke.length < 1) return;

    // Skip full redraw here - canvas is redrawn only when drawings change
    // Just draw the tool cursor on top

    if (currentTool === 'eraser') {
      // Eraser implementation for Drawing objects
      // NOTE: offsetX/Y are scroll positions - subtract to offset by scroll

      // Throttle eraser processing to prevent performance issues
      const now = Date.now();
      if (now - lastEraserProcessTimeRef.current < 50) { // Reduced to 50ms for ~20fps (smoother but still efficient)
        return; // Skip processing but cursor already shown
      }
      lastEraserProcessTimeRef.current = now;

      // Eraser effect is 30% larger than the setting for better coverage
      // (eraserThickness is a screen-px setting; eraser math runs in VU)
      const eraserRadius = (eraserThickness * 0.65) / k;

      // Partial eraser: remove only touched points from strokes (uses cached drawings for immediate feedback)

      // Use modified drawings from ref if available, otherwise use original drawings
      const drawingsToErase = eraserModifiedDrawingsRef.current.size > 0
        ? drawings.map(d => eraserModifiedDrawingsRef.current.get(d.id) || d)
        : drawings;

      let anyStrokesModified = false;

      drawingsToErase.forEach(drawing => {
        // Calculate drawing bounds
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        drawing.strokes.forEach(stroke => {
          stroke.points.forEach(point => {
            minX = Math.min(minX, point.x);
            minY = Math.min(minY, point.y);
            maxX = Math.max(maxX, point.x);
            maxY = Math.max(maxY, point.y);
          });
        });

        let strokesModified = false;
        const newStrokes: Stroke[] = [];

        drawing.strokes.forEach((stroke, _strokeIndex) => {
          // Find points that should be erased (within eraser radius)
          const segments: StrokePoint[][] = [];
          let currentSegment: StrokePoint[] = [];
          let pointsErased = 0;

          stroke.points.forEach((point) => {
            const worldX = point.x + drawing.x;
            const worldY = point.y + drawing.y;
            const dx = worldX - pos.x;
            const dy = worldY - pos.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            // Use exact eraser radius without adding stroke thickness
            const isErased = distance < eraserRadius;

            if (isErased) {
              pointsErased++;
            }

            if (!isErased) {
              // Point survives - add to current segment
              currentSegment.push(point);
            } else {
              // Point is erased - if we have a segment, save it
              if (currentSegment.length > 0) {
                segments.push([...currentSegment]);
                currentSegment = [];
              }
            }
          });

          // Don't forget the last segment
          if (currentSegment.length > 0) {
            segments.push(currentSegment);
          }


          // Create new strokes from surviving segments
          if (segments.length === 0) {
            // Entire stroke was erased
            strokesModified = true;
            anyStrokesModified = true;
          } else if (segments.length === 1 && segments[0].length === stroke.points.length) {
            // Nothing was erased, keep original stroke
            newStrokes.push(stroke);
          } else {
            // Stroke was partially erased, create new strokes from segments
            strokesModified = true;
            anyStrokesModified = true;
            segments.forEach((segmentPoints, segIndex) => {
              if (segmentPoints.length >= 2) {
                newStrokes.push({
                  ...stroke,
                  id: `${stroke.id}-seg-${segIndex}-${Date.now()}`,
                  points: segmentPoints
                });
              } else if (segmentPoints.length === 1) {
                // Single point segments are just dots - keep as single-point stroke
                newStrokes.push({
                  ...stroke,
                  id: `${stroke.id}-seg-${segIndex}-${Date.now()}`,
                  points: segmentPoints
                });
              }
            });
          }
        });

        // Create updated drawing variable (declare outside the if block for wider scope)
        let updatedDrawing: Drawing | null = null;

        // Update the drawing if strokes were modified
        if (strokesModified) {

          if (newStrokes.length === 0) {
            // All strokes were erased, delete from cache
            // Mark as deleted in ref for real-time feedback
            eraserModifiedDrawingsRef.current.set(drawing.id, { ...drawing, strokes: [] });

            setLocalDrawingsCache(prev => {
              const newCache = new Map(prev);
              newCache.delete(drawing.id);
              // Use the updated cache immediately for redraw
              setTimeout(() => {
                const ctx = canvasRef.current?.getContext('2d');
                if (ctx) redrawCanvas(ctx, true);
              }, 0);
              return newCache;
            });
            // Note: DELETE dispatch removed to prevent update loops - will be sent in handleMouseUp
          } else {
            // Update cache with new strokes
            updatedDrawing = { ...drawing, strokes: newStrokes };

            // Update the ref immediately for real-time feedback
            eraserModifiedDrawingsRef.current.set(drawing.id, updatedDrawing);

            setLocalDrawingsCache(prev => {
              const newCache = new Map(prev);
              if (updatedDrawing) {
                newCache.set(drawing.id, updatedDrawing);
              } else {
                newCache.delete(drawing.id);
              }
              // Use the updated cache immediately for redraw
              setTimeout(() => {
                const ctx = canvasRef.current?.getContext('2d');
                if (ctx) redrawCanvas(ctx, true);
              }, 0);
              return newCache;
            });
          }
          // Note: Redux dispatch removed during erasing to prevent conflicts - will be sent in handleMouseUp
        }
      });

      // Force immediate redraw with updated data inline (only if modifications were made)
      if (anyStrokesModified && ctx) {
        const updatedDrawings = eraserModifiedDrawingsRef.current.size > 0
          ? drawings.map(d => eraserModifiedDrawingsRef.current.get(d.id) || d)
          : drawings;

        // Clear canvas
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

        // Draw all drawings with updated data
        updatedDrawings.forEach(d => {
          // Skip drawings with no strokes (completely erased)
          if (d.strokes.length === 0) return;

          const drawingToDraw = d;

          // Apply drawing opacity
          const opacity = (drawingToDraw.opacity ?? 100) / 100;
          ctx.globalAlpha = opacity;

          drawingToDraw.strokes.forEach(stroke => {
            if (stroke.points.length < 2) return;

            ctx.beginPath();
            ctx.strokeStyle = stroke.color;
            ctx.lineWidth = stroke.thickness * k;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            stroke.points.forEach((point, index) => {
              const screenX = (point.x + drawingToDraw.x) * k - offsetX;
              const screenY = (point.y + drawingToDraw.y) * k - offsetY;

              if (index === 0) {
                ctx.moveTo(screenX, screenY);
              } else {
                ctx.lineTo(screenX, screenY);
              }
            });

            ctx.stroke();
          });

          ctx.globalAlpha = 1;
        });
      }

      // Redraw to show changes using cached data (only if no modifications were made)
      if (ctx && !anyStrokesModified) {
        redrawCanvas(ctx, true);
      }
    } else {
      // Marker: draw current stroke preview (optimized - only draw new segment)
      if (currentStroke.length > 0) {
        const lastPoint = currentStroke[currentStroke.length - 1];

        // Draw only the new line segment from last point to current position
        // (points are in VU - scale to canvas px)
        ctx.beginPath();
        ctx.strokeStyle = markerColor;
        ctx.lineWidth = markerThickness * k;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const lastScreenX = lastPoint.x * k - offsetX;
        const lastScreenY = lastPoint.y * k - offsetY;
        const screenX = pos.x * k - offsetX;
        const screenY = pos.y * k - offsetY;

        ctx.moveTo(lastScreenX, lastScreenY);
        ctx.lineTo(screenX, screenY);
        ctx.stroke();
      }
    }
  }, [isDrawing, isDraggingDrawing, draggedDrawingId, dragStartPos, dragStartDrawingPos, currentTool, getWorldPosition, currentStroke, redrawCanvas, markerColor, markerThickness, offsetX, offsetY, pixelsPerVU, dispatch]);

  const handleMouseUp = useCallback(() => {
    // Handle drawing drag end
    if (isDraggingDrawing) {
      isDraggingDrawingRef.current = false; // synchronous guard for the window mouseup listener
      // Flush the trailing throttled position so the final movement is not lost
      if (drawingDragTrailingTimerRef.current !== null) {
        clearTimeout(drawingDragTrailingTimerRef.current);
        drawingDragTrailingTimerRef.current = null;
      }
      if (drawingDragPendingPosRef.current && draggedDrawingId && dragStartPos && dragStartDrawingPos) {
        const p = drawingDragPendingPosRef.current;
        dispatch({
          type: 'UPDATE_OBJECT',
          payload: {
            id: draggedDrawingId,
            x: dragStartDrawingPos.x + (p.x - dragStartPos.x),
            y: dragStartDrawingPos.y + (p.y - dragStartPos.y),
          },
          _localOnly: true,
        });
      }
      drawingDragPendingPosRef.current = null;
      // For guests, send final position via MOVE_OBJECT_COMMIT
      if (!isHost && draggedDrawingId && dragStartDrawingPos) {
        const drawing = state.objects[draggedDrawingId] as Drawing;
        if (drawing) {
          dispatch({
            type: 'MOVE_OBJECT_COMMIT',
            payload: {
              id: draggedDrawingId,
              x: drawing.x,
              y: drawing.y,
              previousX: dragStartDrawingPos.x,
              previousY: dragStartDrawingPos.y,
            },
          });
        }
      }
      setIsDraggingDrawing(false);
      setDraggedDrawingId(null);
      setDragStartPos(null);
      setDragStartDrawingPos(null);
      return;
    }

    if (!isDrawing) {
      setIsDrawing(false);
      setCurrentStroke([]);
      return;
    }

    // For eraser, we don't create strokes - partial erasing happens in handleMouseMove
    if (currentTool === 'eraser') {
      setIsDrawing(false);
      setCurrentStroke([]);


      // Store the modifications before clearing
      const finalModifications = Array.from(eraserModifiedDrawingsRef.current.entries());

      // Final dispatch to update Redux with eraser results
      finalModifications.forEach(([_drawingId, updatedDrawing]) => {
        const originalDrawing = drawings.find(d => d.id === updatedDrawing.id);

        if (!originalDrawing && updatedDrawing.strokes.length > 0) {
          // This shouldn't happen, but handle it - new drawing was created
          dispatch({
            type: 'UPDATE_OBJECT',
            payload: {
              id: updatedDrawing.id,
              updates: {
                strokes: updatedDrawing.strokes
              }
            }
          });
        } else if (updatedDrawing.strokes.length === 0) {
          // Drawing was completely erased - send DELETE
          dispatch({
            type: 'DELETE_OBJECT',
            payload: { id: updatedDrawing.id }
          });
        } else if (!originalDrawing || JSON.stringify(originalDrawing.strokes) !== JSON.stringify(updatedDrawing.strokes)) {
          // Drawing was partially erased - send UPDATE
          dispatch({
            type: 'UPDATE_OBJECT',
            payload: {
              id: updatedDrawing.id,
              updates: {
                strokes: updatedDrawing.strokes
              }
            }
          } as const);
        }
      });

      // Clear the eraser modifications ref after dispatching to Redux
      eraserModifiedDrawingsRef.current.clear();

      // Note: No need to manually redraw here - Redux update will trigger component re-render
      return;
    }

    if (currentStroke.length < 2) {
      setIsDrawing(false);
      setCurrentStroke([]);
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx) redrawCanvas(ctx);
      return;
    }

    // Create the stroke (only for marker)
    const stroke: Stroke = {
      id: Date.now().toString(),
      points: currentStroke,
      color: markerColor,
      thickness: markerThickness,
      timestamp: Date.now(),
      author: activePlayerId
    };

    // For guests, send FINISH_DRAWING_STROKE instead of CREATE_DRAWING_OBJECT
    if (!isHost) {
      // Calculate stroke bounds
      const strokeBounds = getStrokeBounds(stroke);
      const padding = markerThickness + 10;
      const bounds = {
        x: strokeBounds.minX - padding,
        y: strokeBounds.minY - padding,
        width: strokeBounds.maxX - strokeBounds.minX + padding * 2,
        height: strokeBounds.maxY - strokeBounds.minY + padding * 2,
      };

      // Check if stroke overlaps with existing drawings (find ALL overlapping drawings of same color)
      const overlappingDrawings = findOverlappingDrawings(stroke, drawings);

      dispatch({
        type: 'FINISH_DRAWING_STROKE',
        payload: {
          stroke,
          bounds,
          opacity: markerOpacity,
          drawingId: overlappingDrawings.length === 1 ? overlappingDrawings[0].id : undefined,
        },
      });

      setIsDrawing(false);
      setCurrentStroke([]);
      strokeStartDataRef.current = null;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx) redrawCanvas(ctx);
      return;
    }

    // Host creates drawing object immediately (existing logic)
    // Check if stroke overlaps with existing drawings (find ALL overlapping drawings of same color)
    const overlappingDrawings = findOverlappingDrawings(stroke, drawings);

    if (overlappingDrawings.length > 0) {
      // Stroke overlaps with one or more existing drawings
      if (overlappingDrawings.length === 1) {
        // Single overlapping drawing - merge stroke into it
        const overlappingDrawing = overlappingDrawings[0];
        const relativeStroke: Stroke = {
          ...stroke,
          points: stroke.points.map(p => ({ x: p.x - overlappingDrawing.x, y: p.y - overlappingDrawing.y }))
        };

        dispatch({
          type: 'ADD_STROKE_TO_DRAWING',
          payload: { drawingId: overlappingDrawing.id, stroke: relativeStroke }
        });
      } else {
        // Multiple overlapping drawings - merge all of them + new stroke into one drawing

        // Calculate bounding box that includes all overlapping drawings and the new stroke
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        // Include all existing drawings' bounds
        for (const drawing of overlappingDrawings) {
          const bounds = getStrokesBounds(drawing.strokes);
          minX = Math.min(minX, drawing.x + bounds.minX);
          minY = Math.min(minY, drawing.y + bounds.minY);
          maxX = Math.max(maxX, drawing.x + bounds.maxX);
          maxY = Math.max(maxY, drawing.y + bounds.maxY);
        }

        // Include new stroke bounds
        const strokeBounds = getStrokeBounds(stroke);
        minX = Math.min(minX, strokeBounds.minX);
        minY = Math.min(minY, strokeBounds.minY);
        maxX = Math.max(maxX, strokeBounds.maxX);
        maxY = Math.max(maxY, strokeBounds.maxY);

        const padding = markerThickness + 10;
        const mergedX = minX - padding;
        const mergedY = minY - padding;
        const mergedWidth = maxX - minX + padding * 2;
        const mergedHeight = maxY - minY + padding * 2;

        // Collect all strokes from all drawings + new stroke, converted to merged coords
        const allMergedStrokes: Stroke[] = [];

        for (const drawing of overlappingDrawings) {
          // Convert each stroke from drawing's local coords to merged drawing's local coords
          for (const s of drawing.strokes) {
            const offsetX = drawing.x - mergedX;
            const offsetY = drawing.y - mergedY;
            allMergedStrokes.push({
              ...s,
              points: s.points.map(p => ({ x: p.x + offsetX, y: p.y + offsetY }))
            });
          }
        }

        // Add the new stroke (convert from world coords to merged coords)
        allMergedStrokes.push({
          ...stroke,
          points: stroke.points.map(p => ({ x: p.x - mergedX, y: p.y - mergedY }))
        });

        // Get opacity from existing drawings (use the first one's opacity)
        const mergedOpacity = overlappingDrawings[0].opacity ?? 100;

        // Delete all old drawings
        for (const drawing of overlappingDrawings) {
          dispatch({
            type: 'DELETE_OBJECT',
            payload: { id: drawing.id }
          });
        }

        // Create the new merged drawing
        dispatch({
          type: 'CREATE_DRAWING_OBJECT',
          payload: {
            strokes: allMergedStrokes,
            x: mergedX,
            y: mergedY,
            width: mergedWidth,
            height: mergedHeight,
            opacity: mergedOpacity
          }
        });
      }
    } else {
      // Create new drawing object
      const strokeBounds = getStrokeBounds(stroke);
      const padding = markerThickness + 10;
      const width = strokeBounds.maxX - strokeBounds.minX + padding * 2;
      const height = strokeBounds.maxY - strokeBounds.minY + padding * 2;
      const x = strokeBounds.minX - padding;
      const y = strokeBounds.minY - padding;

      // Adjust stroke points to be relative to drawing position
      const relativeStroke: Stroke = {
        ...stroke,
        points: stroke.points.map(p => ({ x: p.x - x, y: p.y - y }))
      };

      dispatch({
        type: 'CREATE_DRAWING_OBJECT',
        payload: {
          strokes: [relativeStroke],
          x,
          y,
          width,
          height,
          opacity: markerOpacity
        }
      });
    }

    setIsDrawing(false);
    setCurrentStroke([]);
    strokeStartDataRef.current = null;
    // Redraw to show cursor
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx) redrawCanvas(ctx);
  }, [isDrawing, isDraggingDrawing, draggedDrawingId, dragStartDrawingPos, currentStroke, currentTool, markerColor, markerThickness, markerOpacity, activePlayerId, drawings, dispatch, redrawCanvas, findOverlappingDrawings, getStrokeBounds, isHost]);

  // Handler for mouse leave (must be before conditional return)
  const handleMouseLeave = useCallback(() => {
    setIsDrawing(false);
    setCurrentStroke([]);
    // NOTE: an active drawing drag is NOT cancelled here - fast drags may
    // briefly leave the canvas; the drag ends via mouseup (window listener).
  }, [isDraggingDrawing]);

  // While a drawing drag is active, finish it reliably on mouseup anywhere
  // (the canvas may not receive the event if the cursor is over a panel)
  useEffect(() => {
    if (!isDraggingDrawing) return;
    const onWinUp = () => {
      if (!isDraggingDrawingRef.current) return;
      handleMouseUp();
    };
    window.addEventListener('mouseup', onWinUp);
    return () => window.removeEventListener('mouseup', onWinUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDraggingDrawing, handleMouseUp]);

  // Check if there are any drawings to display (uses memoized drawings)
  const hasDrawings = drawings.length > 0;

  // Don't render if no tool is selected AND no drawings exist
  if (currentTool === 'none' && !hasDrawings) {
    return null;
  }

  // When tool is 'none', 'ruler', or 'zoom', disable pointer events so canvas doesn't block other interactions
  // Canvas should only capture events for drawing tools (marker, eraser)
  const pointerEvents = (currentTool === 'none' || currentTool === 'ruler' || currentTool === 'zoom') ? 'none' : 'auto';

  // Generate dynamic SVG cursors for marker and eraser (size based on thickness)
  const generateMarkerCursor = (color: string, thickness: number) => {
    const r = Math.max(8, thickness / 2);
    const size = Math.max(32, r * 2 + 8);
    const cx = size / 2;
    const cy = size / 2;
    // Convert color to ensure it works in SVG data URI
    const svgColor = color.replace('#', '%23');
    return `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'><circle cx='${cx}' cy='${cy}' r='${r}' fill='${svgColor}' fill-opacity='0.5' stroke='${svgColor}' stroke-width='1'/></svg>") ${cx} ${cy}, crosshair`;
  };

  const generateEraserCursor = (thickness: number) => {
    const r = Math.max(8, thickness / 2);
    const size = Math.max(32, r * 2 + 8);
    const cx = size / 2;
    const cy = size / 2;
    return `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'><circle cx='${cx}' cy='${cy}' r='${r}' fill='none' stroke='white' stroke-width='2'/></svg>") ${cx} ${cy}, crosshair`;
  };

  // Cursor logic:
  // - ALT pressed or over panel: default cursor (normal cursor mode)
  // - Shift+marker: move cursor (for moving drawings)
  // - Shift+eraser: trash cursor (for deleting drawings)
  // - marker/eraser without Shift: dynamic SVG cursor
  const canvasCursor = isAltPressed || isOverPanel || !(currentTool === 'marker' || currentTool === 'eraser')
    ? 'default'
    : currentTool === 'marker' && isShiftPressed
      ? 'move'
      : currentTool === 'eraser' && isShiftPressed
        ? 'default' // Will be overridden by inline style
        : currentTool === 'marker'
          ? generateMarkerCursor(markerColor, markerThickness * k)
          : generateEraserCursor(eraserThickness * k);

  // Custom cursor for eraser+shift (trash icon)
  const eraserShiftCursor = currentTool === 'eraser' && isShiftPressed
    ? `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M3 6h18' /><path d='M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6' /><path d='M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2' /><line x1='10' y1='11' x2='10' y2='17' /><line x1='14' y1='11' x2='14' y2='17' /></svg>") 12 12, auto`
    : undefined;
  // Also disable pointer events when over UI or when ALT is pressed (normal cursor mode)
  const finalPointerEvents = isOverPanel || isAltPressed ? 'none' : pointerEvents;

  return (
    <>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="absolute top-0 left-0"
        style={{
          zIndex: 100, // Below panels (1000) and windows (10000), above most game objects
          cursor: eraserShiftCursor || canvasCursor,
          pointerEvents: finalPointerEvents,
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      />
      {/* Move handles for marker drawings (marker tool only). Reuse the same
          drag machinery as Shift+drag: they ignore the drawing's lock. */}
      {currentTool === 'marker' && (
        <div
          className="absolute top-0 left-0 pointer-events-none"
          style={{ width, height, zIndex: 101 }}
        >
          {drawings.map((d) => {
            if ((d as any).inCursorSlot) return null;
            const handleX = (d.x + d.width) * k - offsetX;
            const handleY = d.y * k - offsetY;
            if (handleX < -30 || handleY < -30 || handleX > width + 30 || handleY > height + 30) return null;
            return (
              <div
                key={d.id}
                data-drawing-move-handle={d.id}
                className="absolute cursor-move flex items-center justify-center text-slate-200"
                style={{
                  left: handleX,
                  top: handleY,
                  width: '20px',
                  height: '20px',
                  borderRadius: '6px',
                  background: 'rgba(71, 85, 105, 0.9)',
                  border: '1px solid rgba(147, 51, 234, 0.4)',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                  pointerEvents: 'auto',
                }}
                title="Move drawing"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  // Pick into the cursor slot via the SAME pipeline the cursor
                  // drag-and-drop uses: ghost follows, mouseup drops (full
                  // dropCursorSlot logic: magnetism, clamping, z-index).
                  window.dispatchEvent(new CustomEvent('handle-pick-to-cursor-slot', {
                    detail: {
                      objectId: d.id,
                      clientX: e.clientX,
                      clientY: e.clientY,
                    },
                  }));
                }}
              >
                <Move size={12} />
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};

// Memoize DrawingCanvas to prevent unnecessary re-renders
export default React.memo(DrawingCanvas, (prevProps, nextProps) => {
  // Re-render only when critical props change
  if (prevProps.width !== nextProps.width) return false;
  if (prevProps.height !== nextProps.height) return false;
  if (prevProps.offsetX !== nextProps.offsetX) return false;
  if (prevProps.offsetY !== nextProps.offsetY) return false;
  if (prevProps.cursorSlotLength !== nextProps.cursorSlotLength) return false;
  // IMPORTANT: re-render when viewport scale changes (browser zoom / fullscreen),
  // otherwise strokes keep stale pixel scaling
  if (prevProps.pixelsPerVU !== nextProps.pixelsPerVU) return false;

  // All props are the same - skip re-render
  return true;
});
