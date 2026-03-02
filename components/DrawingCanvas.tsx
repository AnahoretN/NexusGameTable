import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { useGame } from '../store/GameContext';
import { useDrawingTool } from './ToolsPanel';
import { ItemType, TableObject, Card as CardType, TokenShape, Stroke, StrokePoint, Drawing } from '../types';

interface DrawingCanvasProps {
  width: number;
  height: number;
  zoom: number;
  offsetX: number;
  offsetY: number;
  cursorSlotLength: number; // Number of items in cursor slot
}

// Helper to check if a point is near a stroke
const isPointNearStroke = (x: number, y: number, stroke: Stroke, threshold: number = 10): boolean => {
  for (const point of stroke.points) {
    const dx = point.x - x;
    const dy = point.y - y;
    if (Math.sqrt(dx * dx + dy * dy) < threshold + stroke.thickness / 2) {
      return true;
    }
  }
  return false;
};

// Calculate bounding box of a stroke
const getStrokeBounds = (stroke: Stroke): { minX: number; minY: number; maxX: number; maxY: number } => {
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
const getStrokesBounds = (strokes: Stroke[]): { minX: number; minY: number; maxX: number; maxY: number } => {
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

// Check if two drawing objects overlap
const doDrawingsOverlap = (drawing1: Drawing, drawing2: Drawing, threshold: number = 20): boolean => {
  const bounds1 = getStrokesBounds(drawing1.strokes);
  const bounds2 = getStrokesBounds(drawing2.strokes);

  // Check if bounding boxes overlap (with threshold)
  return !(bounds1.maxX + drawing1.x < bounds2.minX + drawing2.x - threshold ||
           bounds2.maxX + drawing2.x < bounds1.minX + drawing1.x - threshold ||
           bounds1.maxY + drawing1.y < bounds2.minY + drawing2.y - threshold ||
           bounds2.maxY + drawing2.y < bounds1.minY + drawing1.y - threshold);
};

// Check if a stroke actually overlaps with strokes of the same color in a drawing
// (not just bounding box overlap, but actual pixel/coordinate intersection)
const findOverlappingDrawing = (stroke: Stroke, drawings: Drawing[]): Drawing | null => {
  const overlapping = findOverlappingDrawings(stroke, drawings);
  return overlapping.length > 0 ? overlapping[0] : null;
};

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

// Find drawing at given world position (for drag selection)
const findDrawingAtPosition = (x: number, y: number, drawings: Drawing[]): Drawing | null => {
  // Check from top (highest z-index) to bottom
  for (let i = drawings.length - 1; i >= 0; i--) {
    const drawing = drawings[i];
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


export const DrawingCanvas: React.FC<DrawingCanvasProps> = ({
  width,
  height,
  zoom,
  offsetX,
  offsetY,
  cursorSlotLength = 0
}) => {
  const { state, dispatch, isHost } = useGame();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<StrokePoint[]>([]);
  const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null);
  const [isOverPanel, setIsOverPanel] = useState(false);
  const currentTool = useDrawingTool();
  const [isAltPressed, setIsAltPressed] = useState(false); // Track ALT key for normal cursor mode
  const [isShiftPressed, setIsShiftPressed] = useState(false); // Track Shift key for move cursor mode

  // Drawing drag state
  const [isDraggingDrawing, setIsDraggingDrawing] = useState(false);
  const [draggedDrawingId, setDraggedDrawingId] = useState<string | null>(null);
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number } | null>(null);
  const [dragStartDrawingPos, setDragStartDrawingPos] = useState<{ x: number; y: number } | null>(null);

  // Track initial stroke data for network commit on drawing end (guests only)
  const strokeStartDataRef = useRef<{ color: string; thickness: number } | null>(null);

  // Memoize filtered drawings to avoid repeated Object.values().filter() calls
  const drawings = useMemo(() => {
    return Object.values(state.objects).filter((obj): obj is Drawing =>
      obj.type === ItemType.DRAWING && obj.isOnTable
    );
  }, [state.objects]);

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
  useEffect(() => {
    const canvas = canvasRef.current;
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

  const redrawCanvas = useCallback((ctx: CanvasRenderingContext2D) => {
    if (!canvasRef.current) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

    // Draw all Drawing objects (uses memoized drawings from outer scope)
    drawings.forEach(drawing => {
      // Apply drawing opacity (convert 1-100 to 0-1)
      const opacity = (drawing.opacity ?? 100) / 100;
      ctx.globalAlpha = opacity;

      drawing.strokes.forEach(stroke => {
        if (stroke.points.length < 2) return;

        ctx.beginPath();
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.thickness * zoom;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Transform and draw each point (relative to drawing position)
        stroke.points.forEach((point, index) => {
          const screenX = (point.x + drawing.x + offsetX) * zoom;
          const screenY = (point.y + drawing.y + offsetY) * zoom;

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

    // Draw cursor circle when marker or eraser is active (but not when over panel or ALT is pressed)
    // Don't draw custom cursor when Shift is pressed (move mode)
    if ((currentTool === 'marker' || currentTool === 'eraser') && cursorPosition && !isOverPanel && !isAltPressed && !isShiftPressed) {
      ctx.beginPath();
      const cursorRadius = (markerThickness / 2) * zoom;
      ctx.arc(cursorPosition.x, cursorPosition.y, cursorRadius, 0, Math.PI * 2);
      if (currentTool === 'marker') {
        // Marker: filled circle with semi-transparent color
        ctx.fillStyle = markerColor + '80'; // Add transparency
        ctx.fill();
      } else {
        // Eraser: white outline circle
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // Draw current stroke being drawn (preview)
    if (isDrawing && currentStroke.length > 0 && currentTool === 'marker') {
      ctx.beginPath();
      ctx.strokeStyle = markerColor;
      ctx.lineWidth = markerThickness * zoom;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      currentStroke.forEach((point, index) => {
        const screenX = (point.x + offsetX) * zoom;
        const screenY = (point.y + offsetY) * zoom;

        if (index === 0) {
          ctx.moveTo(screenX, screenY);
        } else {
          ctx.lineTo(screenX, screenY);
        }
      });

      ctx.stroke();
    }
  }, [drawings, zoom, offsetX, offsetY, currentTool, cursorPosition, markerColor, markerThickness, isDrawing, currentStroke, isAltPressed, isShiftPressed, isOverPanel]);

  const getWorldPosition = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;

    // Convert screen position to world position
    return {
      x: screenX / zoom - offsetX,
      y: screenY / zoom - offsetY
    };
  }, [zoom, offsetX, offsetY]);

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

      // Update cursor position first
      const pos = getWorldPosition(e.clientX, e.clientY);
      const screenX = (pos.x + offsetX) * zoom;
      const screenY = (pos.y + offsetY) * zoom;
      setCursorPosition({ x: screenX, y: screenY });
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    return () => window.removeEventListener('mousemove', handleGlobalMouseMove);
  }, [currentTool, zoom, offsetX, offsetY, getWorldPosition, isAltPressed, isOverPanel]);

  // Redraw canvas when cursor position or shift state changes (for cursor rendering)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && cursorPosition && (currentTool === 'marker' || currentTool === 'eraser')) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        redrawCanvas(ctx);
      }
    }
  }, [cursorPosition, currentTool, redrawCanvas, isShiftPressed]); // Add isShiftPressed to trigger redraw when cursor mode changes

  // Keep redrawCanvas in a ref to avoid stale closures
  const redrawCanvasRef = useRef(redrawCanvas);
  useEffect(() => {
    redrawCanvasRef.current = redrawCanvas;
  }, [redrawCanvas]);

  // Redraw canvas when drawings or view transform changes (for displaying drawings even when tool is 'none')
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        redrawCanvasRef.current(ctx);
      }
    }
  }, [state.objects, zoom, offsetX, offsetY]); // Only depend on things that affect drawing display

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (currentTool !== 'marker' && currentTool !== 'eraser') return;
    if (isOverPanel) return; // Don't draw when over a panel
    if (e.altKey) return; // Don't draw/erase when ALT is pressed (normal cursor mode)

    const pos = getWorldPosition(e.clientX, e.clientY);

    // Check if Shift is pressed with eraser - delete entire drawing
    if (currentTool === 'eraser' && e.shiftKey) {
      const clickedDrawing = findDrawingAtPosition(pos.x, pos.y, drawings);

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
      const clickedDrawing = findDrawingAtPosition(pos.x, pos.y, drawings);

      if (clickedDrawing && !clickedDrawing.locked) {
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

    // Shift with empty cursor slot: allow drawing AND allow moving drawings
    if (e.shiftKey && currentTool === 'marker' && cursorSlotLength === 0) {
      const clickedDrawing = findDrawingAtPosition(pos.x, pos.y, drawings);

      if (clickedDrawing && !clickedDrawing.locked) {
        // Start dragging the drawing instead of drawing
        setIsDraggingDrawing(true);
        setDraggedDrawingId(clickedDrawing.id);
        setDragStartPos(pos);
        setDragStartDrawingPos({ x: clickedDrawing.x, y: clickedDrawing.y });
        return;
      }
      // Not over a drawing, proceed with drawing
    }

    setIsDrawing(true);
    setCurrentStroke([{ x: pos.x, y: pos.y }]);
    // Store stroke start data for network commit (guests only)
    strokeStartDataRef.current = { color: markerColor, thickness: markerThickness };
  }, [currentTool, getWorldPosition, isOverPanel, drawings, markerColor, markerThickness, cursorSlotLength]);

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

    // Convert world position to screen position for cursor display
    const screenX = (pos.x + offsetX) * zoom;
    const screenY = (pos.y + offsetY) * zoom;
    setCursorPosition({ x: screenX, y: screenY });

    // Handle drawing dragging
    if (isDraggingDrawing && draggedDrawingId && dragStartPos && dragStartDrawingPos) {
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
      return;
    }

    if (!isDrawing) {
      // Just update cursor, don't draw
      const ctx = canvas?.getContext('2d');
      if (ctx) redrawCanvas(ctx);
      return;
    }

    setCurrentStroke(prev => [...prev, { x: pos.x, y: pos.y }]);

    // Draw preview
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx || currentStroke.length < 1) return;

    // Redraw everything plus the current stroke
    redrawCanvas(ctx);

    if (currentTool === 'eraser') {
      // Eraser implementation for Drawing objects
      const screenX = (pos.x + offsetX) * zoom;
      const screenY = (pos.y + offsetY) * zoom;

      // Show eraser cursor (fully opaque white circle)
      ctx.beginPath();
      ctx.arc(screenX, screenY, (markerThickness / 2) * zoom, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Partial eraser: remove only touched points from strokes (uses memoized drawings)
      const eraserRadius = markerThickness / 2;

      drawings.forEach(drawing => {
        let strokesModified = false;
        const newStrokes: Stroke[] = [];

        drawing.strokes.forEach((stroke) => {
          // Find points that should be erased (within eraser radius)
          const survivingPoints: StrokePoint[] = [];
          const segments: StrokePoint[][] = [];
          let currentSegment: StrokePoint[] = [];

          stroke.points.forEach((point) => {
            const worldX = point.x + drawing.x;
            const worldY = point.y + drawing.y;
            const dx = worldX - pos.x;
            const dy = worldY - pos.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            // Use exact eraser radius without adding stroke thickness
            const isErased = distance < eraserRadius;

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
          } else if (segments.length === 1 && segments[0].length === stroke.points.length) {
            // Nothing was erased, keep original stroke
            newStrokes.push(stroke);
          } else {
            // Stroke was partially erased, create new strokes from segments
            strokesModified = true;
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

        // Update the drawing if strokes were modified
        if (strokesModified) {
          if (newStrokes.length === 0) {
            // All strokes were erased, delete the drawing
            dispatch({
              type: 'DELETE_OBJECT',
              payload: { id: drawing.id }
            });
          } else {
            // Update with new strokes
            dispatch({
              type: 'UPDATE_OBJECT',
              payload: {
                id: drawing.id,
                strokes: newStrokes
              }
            });
          }
        }
      });

      // Redraw to show changes
      if (ctx) redrawCanvas(ctx);
    } else {
      // Marker: draw current stroke preview
      ctx.beginPath();
      ctx.strokeStyle = markerColor;
      ctx.lineWidth = markerThickness * zoom;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const allPoints = [...currentStroke, { x: pos.x, y: pos.y }];
      allPoints.forEach((point, index) => {
        const screenX = (point.x + offsetX) * zoom;
        const screenY = (point.y + offsetY) * zoom;

        if (index === 0) {
          ctx.moveTo(screenX, screenY);
        } else {
          ctx.lineTo(screenX, screenY);
        }
      });

      ctx.stroke();
    }
  }, [isDrawing, isDraggingDrawing, draggedDrawingId, dragStartPos, dragStartDrawingPos, currentTool, getWorldPosition, currentStroke, redrawCanvas, markerColor, markerThickness, zoom, offsetX, offsetY, dispatch]);

  const handleMouseUp = useCallback(() => {
    // Handle drawing drag end
    if (isDraggingDrawing) {
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
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx) redrawCanvas(ctx);
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
      author: state.activePlayerId
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
  }, [isDrawing, isDraggingDrawing, draggedDrawingId, dragStartDrawingPos, currentStroke, currentTool, markerColor, markerThickness, markerOpacity, state.activePlayerId, drawings, dispatch, redrawCanvas, findOverlappingDrawings, getStrokeBounds, isHost]);

  // Handler for mouse leave (must be before conditional return)
  const handleMouseLeave = useCallback(() => {
    setIsDrawing(false);
    setCurrentStroke([]);
    setCursorPosition(null);
    // Also cancel drawing drag
    if (isDraggingDrawing) {
      setIsDraggingDrawing(false);
      setDraggedDrawingId(null);
      setDragStartPos(null);
      setDragStartDrawingPos(null);
    }
  }, [isDraggingDrawing]);

  // Check if there are any drawings to display (uses memoized drawings)
  const hasDrawings = drawings.length > 0;

  // Don't render if no tool is selected AND no drawings exist
  if (currentTool === 'none' && !hasDrawings) {
    return null;
  }

  // When tool is 'none', disable pointer events so canvas doesn't block other interactions
  const pointerEvents = currentTool === 'none' ? 'none' : 'auto';
  // Show move cursor when Shift+marker AND cursor slot has items, hide custom marker cursor otherwise
  // When ALT is pressed, always show default cursor (normal cursor mode)
  const canvasCursor = isAltPressed || isOverPanel || !(currentTool === 'marker' || currentTool === 'eraser')
    ? 'default'
    : isShiftPressed && cursorSlotLength > 0
      ? 'move'
      : 'none';
  // Also disable pointer events when over UI or when ALT is pressed (normal cursor mode)
  const finalPointerEvents = isOverPanel || isAltPressed ? 'none' : pointerEvents;

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="absolute top-0 left-0"
      style={{
        zIndex: 100, // Below panels (1000) and windows (10000), above most game objects
        cursor: canvasCursor,
        pointerEvents: finalPointerEvents,
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onMouseEnter={(e) => {
        // Update cursor position on enter using world-to-screen conversion
        const pos = getWorldPosition(e.clientX, e.clientY);
        const screenX = (pos.x + offsetX) * zoom;
        const screenY = (pos.y + offsetY) * zoom;
        setCursorPosition({ x: screenX, y: screenY });
      }}
    />
  );
};
