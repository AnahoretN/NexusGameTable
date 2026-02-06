import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useGame } from '../store/GameContext';
import { useDrawingTool } from './ToolsPanel';
import { Stroke, StrokePoint, TableObject, TokenShape } from '../types';

interface ObjectDrawingCanvasProps {
  obj: TableObject;
  width: number;
  height: number;
  faceUp?: boolean; // For cards - whether front is showing
}

// Get layer ID for an object's drawings
export function getObjectDrawingLayerId(objId: string, cardSide?: 'front' | 'back'): string {
  return `object-${objId}${cardSide ? `-${cardSide}` : ''}`;
}

export const ObjectDrawingCanvas: React.FC<ObjectDrawingCanvasProps> = ({
  obj,
  width,
  height,
  faceUp = true
}) => {
  const { state, dispatch } = useGame();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<StrokePoint[]>([]);
  const currentTool = useDrawingTool();

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
  const layerId = getObjectDrawingLayerId(obj.id, obj.type === 'CARD' ? (faceUp ? 'front' : 'back') : undefined);

  // Setup canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = width;
    canvas.height = height;

    // Enable image smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Redraw all strokes
    redrawCanvas(ctx);
  }, [width, height, state.drawings, obj.id, faceUp]);

  const redrawCanvas = useCallback((ctx: CanvasRenderingContext2D) => {
    if (!canvasRef.current) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

    // Get this object's drawing layer
    const layer = state.drawings.layers.find(l => l.id === layerId);
    if (!layer || !layer.visible) return;

    // Draw all strokes in this layer
    layer.strokes.forEach(stroke => {
      if (stroke.points.length < 2) return;

      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.thickness;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Points are stored in local coordinates (relative to object)
      stroke.points.forEach((point, index) => {
        if (index === 0) {
          ctx.moveTo(point.x, point.y);
        } else {
          ctx.lineTo(point.x, point.y);
        }
      });

      ctx.stroke();
    });
  }, [state.drawings, layerId]);

  // Helper to check if a point is near a stroke
  const isPointNearStroke = useCallback((x: number, y: number, stroke: Stroke, threshold: number = 10): boolean => {
    for (const point of stroke.points) {
      const dx = point.x - x;
      const dy = point.y - y;
      if (Math.sqrt(dx * dx + dy * dy) < threshold + stroke.thickness / 2) {
        return true;
      }
    }
    return false;
  }, []);

  // Strokes that have been erased (to prevent re-erasing in same pass)
  const erasedStrokesRef = useRef<Set<string>>(new Set());

  const getLocalPosition = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (currentTool !== 'marker' && currentTool !== 'eraser') return;

    e.stopPropagation(); // Prevent board drawing
    const pos = getLocalPosition(e);
    setIsDrawing(true);
    setCurrentStroke([{ x: pos.x, y: pos.y }]);

    // Clear erased strokes cache when starting new stroke
    if (currentTool === 'eraser') {
      erasedStrokesRef.current.clear();
    }
  }, [currentTool, getLocalPosition]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDrawing) return;

    e.stopPropagation();
    const pos = getLocalPosition(e);
    setCurrentStroke(prev => [...prev, { x: pos.x, y: pos.y }]);

    // Draw preview
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx || currentStroke.length < 1) return;

    // Redraw existing strokes
    redrawCanvas(ctx);

    if (currentTool === 'eraser') {
      // Partial eraser: remove only touched points from strokes
      const layer = state.drawings.layers.find(l => l.id === layerId);
      if (layer) {
        const eraserRadius = markerThickness / 2;

        layer.strokes.forEach(stroke => {
          if (erasedStrokesRef.current.has(stroke.id)) return; // Already processed

          // Find points that should be erased (within eraser radius)
          const segments: StrokePoint[][] = [];
          let currentSegment: StrokePoint[] = [];

          stroke.points.forEach((point) => {
            const dx = point.x - pos.x;
            const dy = point.y - pos.y;
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

          // Check if stroke was modified
          if (segments.length === 0 || segments.length > 1 ||
            (segments.length === 1 && segments[0].length !== stroke.points.length)) {
            // Stroke was partially or fully erased
            erasedStrokesRef.current.add(stroke.id);

            // Delete the original stroke
            dispatch({
              type: 'DELETE_STROKE',
              payload: { strokeId: stroke.id, layerId }
            });

            // Add new strokes from surviving segments
            segments.forEach((segmentPoints, segIndex) => {
              if (segmentPoints.length >= 1) {
                const newStroke: Stroke = {
                  ...stroke,
                  id: `${stroke.id}-seg-${segIndex}-${Date.now()}`,
                  points: segmentPoints
                };
                dispatch({
                  type: 'ADD_STROKE',
                  payload: { stroke: newStroke, layerId }
                });
              }
            });
          }
        });
      }

      // Draw eraser cursor preview (fully opaque white)
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, markerThickness / 2, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      // Marker: draw current stroke preview
      ctx.beginPath();
      ctx.strokeStyle = markerColor;
      ctx.lineWidth = markerThickness;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const allPoints = [...currentStroke, { x: pos.x, y: pos.y }];
      allPoints.forEach((point, index) => {
        if (index === 0) {
          ctx.moveTo(point.x, point.y);
        } else {
          ctx.lineTo(point.x, point.y);
        }
      });

      ctx.stroke();
    }
  }, [isDrawing, currentTool, getLocalPosition, currentStroke, redrawCanvas, markerColor, markerThickness, state.drawings, layerId, dispatch, isPointNearStroke]);

  const handleMouseUp = useCallback(() => {
    if (!isDrawing) {
      setIsDrawing(false);
      setCurrentStroke([]);
      return;
    }

    // For eraser, we don't create strokes - strokes are deleted during mouse move
    if (currentTool === 'eraser') {
      setIsDrawing(false);
      setCurrentStroke([]);
      erasedStrokesRef.current.clear();
      return;
    }

    if (currentStroke.length < 2) {
      setIsDrawing(false);
      setCurrentStroke([]);
      return;
    }

    // Create the stroke (only for marker)
    const stroke: Stroke = {
      id: `${obj.id}-${Date.now()}`,
      points: currentStroke,
      color: markerColor,
      thickness: markerThickness,
      timestamp: Date.now(),
      author: state.activePlayerId
    };

    // Get or create layer for this object
    const existingLayer = state.drawings.layers.find(l => l.id === layerId);

    if (existingLayer) {
      dispatch({
        type: 'ADD_STROKE',
        payload: { stroke, layerId }
      });
    } else {
      dispatch({
        type: 'CREATE_DRAWING_LAYER',
        payload: {
          layer: {
            boundObjectId: obj.id,
            boundCardSide: obj.type === 'CARD' ? (faceUp ? 'front' : 'back') : undefined,
            strokes: [stroke],
            visible: true,
            opacity: 1
          }
        }
      });
    }

    setIsDrawing(false);
    setCurrentStroke([]);
  }, [isDrawing, currentStroke, currentTool, markerColor, markerThickness, obj.id, obj.type, faceUp, state.activePlayerId, layerId, state.drawings.layers, dispatch]);

  // Create layer on mount if it doesn't exist
  useEffect(() => {
    const existingLayer = state.drawings.layers.find(l => l.id === layerId);
    if (!existingLayer) {
      dispatch({
        type: 'CREATE_DRAWING_LAYER',
        payload: {
          layer: {
            boundObjectId: obj.id,
            boundCardSide: obj.type === 'CARD' ? (faceUp ? 'front' : 'back') : undefined,
            strokes: [],
            visible: true,
            opacity: 1
          }
        }
      });
    }
  }, []);

  // Don't render if no tool is selected
  if (currentTool === 'none' || currentTool === 'ruler' || currentTool === 'compass') {
    return null;
  }

  // For cards, only show the drawing canvas if the correct side is facing up
  if (obj.type === 'CARD') {
    const layer = state.drawings.layers.find(l => l.id === layerId);
    // If this is the front side canvas but card is face down, don't show
    if (faceUp && layer?.boundCardSide === 'back') return null;
    // If this is the back side canvas but card is face up, don't show
    if (!faceUp && layer?.boundCardSide === 'front') return null;
  }

  return (
    <canvas
      ref={canvasRef}
      className="absolute top-0 left-0 pointer-events-auto"
      style={{
        width,
        height,
        zIndex: 100,
        cursor: currentTool === 'marker' ? 'crosshair' : 'cell',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    />
  );
};
