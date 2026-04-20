import { useCallback, useEffect, useRef } from 'react';
import { TableObject } from '../../types';
import { clampScrollToPlayableArea } from '../../utils/viewportConstraints';

interface TabletopEventHandlersProps {
  state: any;
  dispatch: React.Dispatch<any>;
  cursorSlot: any[];
  setCursorSlot: React.Dispatch<React.SetStateAction<any[]>>;
  setCursorPosition: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>;
  cursorPositionRef: React.RefObject<{ x: number; y: number } | null>;
  setCursorSlotSource: React.Dispatch<React.SetStateAction<'ctrl' | 'hold' | 'shift' | 'archetype' | null>>;
  cursorSlotSource: 'ctrl' | 'hold' | 'shift' | 'archetype' | null;
  currentTool: string;
  setCurrentTool: React.Dispatch<React.SetStateAction<string>>;
  isShiftPressed: boolean;
  setIsShiftPressed: React.Dispatch<React.SetStateAction<boolean>>;
  isCtrlPressed: boolean;
  setIsCtrlPressed: React.Dispatch<React.SetStateAction<boolean>>;
  draggingId: string | null;
  setDraggingId: React.Dispatch<React.SetStateAction<string | null>>;
  setResizingId: React.Dispatch<React.SetStateAction<string | null>>;
  setResizeStart: React.Dispatch<React.SetStateAction<{ x: number; y: number; width: number; height: number } | null>>;
  rulerStart: { x: number; y: number } | null;
  setRulerStart: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>;
  rulerCurrent: { x: number; y: number } | null;
  setRulerCurrent: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>;
  isRulerRightClick: boolean;
  setIsRulerRightClick: React.Dispatch<React.SetStateAction<boolean>>;
  setContextMenu: React.Dispatch<React.SetStateAction<{ x: number; y: number; object: TableObject; shiftKey?: boolean } | null>>;
  setDeleteCandidateId: React.Dispatch<React.SetStateAction<string | null>>;
  setIsPanning: React.Dispatch<React.SetStateAction<boolean>>;
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  viewTransform: any;
  pixelsPerVU: number;
  v2p: (vu: number) => number;
  p2v: (px: number) => number;
  activePlayerId: string;
  isGM: boolean;
  hyperscaleLayers: any[];
  localSettings: any;
  updateSetting: (key: string | number | symbol, value: any) => void;
  liveResizeSizeRef: React.RefObject<{ width: number; height: number } | null>;
  setLiveResizeSize: React.Dispatch<React.SetStateAction<{ width: number; height: number } | null>>;
  resizeFinalSizeRef: React.RefObject<{ width: number; height: number } | null>;
  isAddingTokenRef: React.RefObject<boolean>;
  longPressTimerRef: React.RefObject<number | null>;
  clickTooltipTimerRef: React.RefObject<number | null>;
  clickTooltipBoundsRef: React.RefObject<{ left: number; right: number; top: number; bottom: number } | null>;
  dragThresholdRef: React.RefObject<{
    initialX: number;
    initialY: number;
    targetId: string | null;
    addedToSlot: boolean;
  }>;
  dragOffsetRef: React.RefObject<{ x: number; y: number } | null>;
  setClickTooltip: React.Dispatch<React.SetStateAction<{ cardId: string; x: number; y: number } | null>>;
  setNexusBoardAddingCell: React.Dispatch<React.SetStateAction<string | null>>;
  setSettingsModalObj: React.Dispatch<React.SetStateAction<TableObject | null>>;
  setPileContextMenu: React.Dispatch<React.SetStateAction<{ x: number; y: number; pile: any; deck: any } | null>>;
  setSearchModalDeck: React.Dispatch<React.SetStateAction<any>>;
  setPilesButtonMenu: React.Dispatch<React.SetStateAction<{ x: number; y: number; deck: any } | null>>;
  setTopDeckModalDeck: React.Dispatch<React.SetStateAction<any>>;
  setZoom?: (zoom: number) => void; // Optional setZoom from ViewTransformContext
}

export const useTabletopEventHandlers = (props: TabletopEventHandlersProps) => {
  const {
    state,
    dispatch,
    cursorSlot,
    setCursorSlot,
    setCursorPosition,
    setZoom,
    cursorPositionRef,
    setCursorSlotSource,
    cursorSlotSource,
    currentTool,
    setCurrentTool,
    isShiftPressed,
    setIsShiftPressed,
    isCtrlPressed,
    setIsCtrlPressed,
    draggingId,
    setDraggingId,
    setResizingId,
    setResizeStart,
    rulerStart,
    setRulerStart,
    rulerCurrent,
    setRulerCurrent,
    isRulerRightClick,
    setIsRulerRightClick,
    setContextMenu,
    setDeleteCandidateId,
    setIsPanning,
    scrollContainerRef,
    viewTransform,
    pixelsPerVU,
    v2p,
    p2v,
    activePlayerId,
    isGM,
    hyperscaleLayers,
    localSettings,
    updateSetting,
    liveResizeSizeRef,
    setLiveResizeSize,
    resizeFinalSizeRef,
    isAddingTokenRef,
    longPressTimerRef,
    clickTooltipTimerRef,
    clickTooltipBoundsRef,
    dragThresholdRef,
    dragOffsetRef,
    setClickTooltip,
    setNexusBoardAddingCell,
    setSettingsModalObj,
    setPileContextMenu,
    setSearchModalDeck,
    setPilesButtonMenu,
    setTopDeckModalDeck,
  } = props;

  // Clear tooltip click timer
  useEffect(() => {
    return () => {
      if (clickTooltipTimerRef.current) {
        clearTimeout(clickTooltipTimerRef.current);
      }
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  // Context menu handler
  const handleContextMenu = useCallback((e: React.MouseEvent, obj: TableObject) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      object: obj,
      shiftKey: isShiftPressed
    });
  }, [isShiftPressed, setContextMenu]);

  // Mouse down handler
  const handleMouseDown = useCallback((e: React.MouseEvent, objId?: string) => {
    // Handle clicking on empty space (clear context menus, rulers, etc.)
    if (!objId) {
      // Clear ruler if active
      if (currentTool === 'ruler' && e.button === 0) {
        if (!rulerStart) {
          const rect = (e.target as HTMLElement).getBoundingClientRect();
          const startX = e.clientX - rect.left;
          const startY = e.clientY - rect.top;
          setRulerStart({ x: p2v(startX), y: p2v(startY) });
        }
      }
      return;
    }

    const obj = state.objects[objId];
    if (!obj) return;

    // Check if object is locked or not owned by player
    const isOwner = !(obj as any).ownerId || (obj as any).ownerId === activePlayerId || isGM;
    if (obj.locked && !isGM) return;
    if (!isOwner) return;

    // Handle different tools
    if (currentTool === 'marker') {
      // Marker tool logic would go here
      return;
    }

    if (currentTool === 'eraser') {
      if (isShiftPressed && isOwner) {
        setDeleteCandidateId(objId);
      }
      return;
    }

    // Handle right-click for ruler radius
    if (currentTool === 'ruler' && e.button === 2) {
      setIsRulerRightClick(true);
      return;
    }

    // Handle left-click for dragging
    if (e.button === 0) {
      // Set up drag threshold to distinguish clicks from drags
      dragThresholdRef.current = {
        initialX: e.clientX,
        initialY: e.clientY,
        targetId: objId,
        addedToSlot: false
      };

      // Calculate offset from object's top-left corner
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      dragOffsetRef.current = {
        x: clickX,
        y: clickY
      };

      setDraggingId(objId);
    }
  }, [
    state.objects,
    currentTool,
    rulerStart,
    setRulerStart,
    setIsRulerRightClick,
    isShiftPressed,
    activePlayerId,
    isGM,
    setDraggingId,
    setDeleteCandidateId,
    p2v,
    dragThresholdRef,
    dragOffsetRef
  ]);

  // Mouse move handler
  const handleMouseMove = useCallback((e: MouseEvent | React.MouseEvent) => {
    // Update cursor slot position
    if (cursorSlot.length > 0) {
      const newX = e.clientX;
      const newY = e.clientY;
      setCursorPosition({ x: newX, y: newY });
      if (cursorPositionRef.current) {
        cursorPositionRef.current = { x: newX, y: newY };
      }
    }

    // Handle ruler tool
    if (currentTool === 'ruler' && rulerStart && (e.target as HTMLElement)?.closest('[data-tabletop="true"]')) {
      const rect = scrollContainerRef.current?.getBoundingClientRect();
      if (rect) {
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;
        setRulerCurrent({ x: p2v(currentX), y: p2v(currentY) });
      }
    }

    // Handle dragging objects
    if (draggingId && dragOffsetRef.current) {
      const obj = state.objects[draggingId];
      if (!obj) return;

      // Check if drag threshold has been exceeded
      const dragThreshold = 5; // pixels
      const deltaX = e.clientX - dragThresholdRef.current.initialX;
      const deltaY = e.clientY - dragThresholdRef.current.initialY;
      const hasExceededThreshold = Math.abs(deltaX) > dragThreshold || Math.abs(deltaY) > dragThreshold;

      if (!hasExceededThreshold && !dragThresholdRef.current.addedToSlot) {
        return; // Still in click threshold zone
      }

      dragThresholdRef.current.addedToSlot = true;

      const rect = scrollContainerRef.current?.getBoundingClientRect();
      if (!rect) return;

      // Calculate new position in virtual units
      const newX = p2v(e.clientX - rect.left - dragOffsetRef.current.x + viewTransform?.scroll?.x || 0);
      const newY = p2v(e.clientY - rect.top - dragOffsetRef.current.y + viewTransform?.scroll?.y || 0);

      // Update object position
      dispatch({
        type: 'UPDATE_OBJECT_POSITION',
        payload: {
          id: draggingId,
          x: newX,
          y: newY
        }
      });

      // Mark as dragging for remote players
      if (!obj.isDragging) {
        dispatch({
          type: 'SET_DRAGGING',
          payload: {
            id: draggingId,
            isDragging: true,
            dragOwnerId: activePlayerId
          }
        });
      }
    }
  }, [
    cursorSlot.length,
    setCursorPosition,
    cursorPositionRef,
    currentTool,
    rulerStart,
    setRulerCurrent,
    draggingId,
    dragOffsetRef,
    dragThresholdRef,
    state.objects,
    scrollContainerRef,
    p2v,
    viewTransform,
    dispatch,
    activePlayerId
  ]);

  // Mouse up handler
  const handleMouseUp = useCallback((e?: MouseEvent | React.MouseEvent) => {
    // Handle ruler tool right-click release
    if (currentTool === 'ruler' && isRulerRightClick) {
      setIsRulerRightClick(false);
    }

    // Handle dragging completion
    if (draggingId) {
      const obj = state.objects[draggingId];
      if (obj && obj.isDragging) {
        dispatch({
          type: 'SET_DRAGGING',
          payload: {
            id: draggingId,
            isDragging: false,
            dragOwnerId: null
          }
        });
      }

      // Reset drag threshold tracking
      dragThresholdRef.current = {
        initialX: 0,
        initialY: 0,
        targetId: null,
        addedToSlot: false
      };

      dragOffsetRef.current = null;
      setDraggingId(null);
    }

    // Handle cursor slot dropping
    if (cursorSlot.length > 0 && e) {
      const rect = scrollContainerRef.current?.getBoundingClientRect();
      if (rect) {
        const dropX = p2v(e.clientX - rect.left + (viewTransform?.scroll?.x || 0));
        const dropY = p2v(e.clientY - rect.top + (viewTransform?.scroll?.y || 0));

        // Drop all items from cursor slot
        cursorSlot.forEach((item, index) => {
          const offsetX = index * 20; // Slight offset for multiple items
          const offsetY = index * 20;

          dispatch({
            type: 'DROP_FROM_CURSOR_SLOT',
            payload: {
              item,
              x: dropX + offsetX,
              y: dropY + offsetY,
              playerId: activePlayerId
            }
          });
        });

        // Clear cursor slot
        setCursorSlot([]);
        setCursorPosition(null);
        if (cursorPositionRef.current) {
          cursorPositionRef.current = null;
        }
        setCursorSlotSource(null);
      }
    }
  }, [
    currentTool,
    isRulerRightClick,
    setIsRulerRightClick,
    draggingId,
    state.objects,
    dispatch,
    dragThresholdRef,
    dragOffsetRef,
    setDraggingId,
    cursorSlot,
    setCursorSlot,
    setCursorPosition,
    cursorPositionRef,
    setCursorSlotSource,
    scrollContainerRef,
    p2v,
    viewTransform,
    activePlayerId
  ]);

  // Wheel handler
  const handleWheel = useCallback((e: React.WheelEvent) => {
    // Handle zoom with Ctrl/Cmd + scroll
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();

      const zoomSensitivity = 0.001;
      const delta = -e.deltaY * zoomSensitivity;
      const currentZoom = localSettings.zoom ?? 100;
      const newZoom = Math.max(25, Math.min(400, currentZoom + delta * 100));

      // Round to nearest 5%
      const roundedZoom = Math.round(newZoom / 5) * 5;

      if (roundedZoom !== currentZoom) {
        // Update localSettings
        updateSetting('zoom', roundedZoom);

        // Sync with ViewTransformContext (convert 25-400 to 0.25-4.0)
        if (setZoom) {
          const zoomFactor = roundedZoom / 100;
          setZoom(zoomFactor);
        }

        // Sync with ToolSettingsContext via custom event
        window.dispatchEvent(new CustomEvent('zoom-settings-changed', {
          detail: { level: roundedZoom }
        }));

        // Also update ToolSettingsContext directly if available
        if ((window as any).updateToolSettingsZoom) {
          (window as any).updateToolSettingsZoom(roundedZoom);
        }
      }
      return;
    }

    // Handle panning with scroll
    if (!e.ctrlKey && !e.metaKey && scrollContainerRef.current) {
      const container = scrollContainerRef.current;

      // Apply scroll constraints
      const scrollLeft = container.scrollLeft + e.deltaX;
      const scrollTop = container.scrollTop + e.deltaY;

      // Constrain to playable area
      const constrained = clampScrollToPlayableArea(
        scrollLeft,
        scrollTop,
        container.clientWidth,
        container.clientHeight,
        pixelsPerVU
      );

      container.scrollLeft = constrained.x;
      container.scrollTop = constrained.y;

      // Update view transform
      dispatch({
        type: 'UPDATE_VIEW_TRANSFORM',
        payload: {
          ...viewTransform,
          scroll: { x: constrained.x, y: constrained.y }
        }
      });
    }
  }, [
    localSettings.zoom,
    updateSetting,
    setZoom,
    scrollContainerRef,
    pixelsPerVU,
    viewTransform,
    dispatch
  ]);

  // Keyboard down handler
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Shift') {
      setIsShiftPressed(true);
    }
    if (e.key === 'Control' || e.key === 'Meta') {
      setIsCtrlPressed(true);
    }
  }, [setIsShiftPressed, setIsCtrlPressed]);

  // Keyboard up handler
  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Shift') {
      setIsShiftPressed(false);
    }
    if (e.key === 'Control' || e.key === 'Meta') {
      setIsCtrlPressed(false);
    }
  }, [setIsShiftPressed, setIsCtrlPressed]);

  // Resize start handler
  const handleResizeStart = useCallback((e: React.MouseEvent, objId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const obj = state.objects[objId];
    if (obj) {
      setResizingId(objId);
      setResizeStart({
        x: e.clientX,
        y: e.clientY,
        width: obj.width,
        height: obj.height
      });
    }
  }, [state.objects, setResizingId, setResizeStart]);

  // Nexus board add cell handler
  const handleAddNexusCell = useCallback((objId: string, direction: string) => {
    // Simplified implementation
    setNexusBoardAddingCell(null);
    // Logic to add cell would go here
  }, [setNexusBoardAddingCell]);

  // Global click handler
  const handleGlobalClick = useCallback((e: MouseEvent) => {
    // Clear context menu on outside click
    const target = e.target as HTMLElement;
    if (!target.closest('.context-menu') && !target.closest('[data-prevent-close="true"]')) {
      setContextMenu(null);
      setPileContextMenu(null);
      setPilesButtonMenu(null);
    }

    // Clear ruler on outside click
    if (currentTool === 'ruler' && !target.closest('[data-tabletop="true"]')) {
      setRulerStart(null);
      setRulerCurrent(null);
    }
  }, [setContextMenu, setPileContextMenu, setPilesButtonMenu, currentTool, setRulerStart, setRulerCurrent]);

  // Global mouse up handler
  const handleGlobalMouseUp = useCallback((e: MouseEvent) => {
    // Handle mouse up anywhere (even outside tabletop)
    if (draggingId) {
      const obj = state.objects[draggingId];
      if (obj && obj.isDragging) {
        dispatch({
          type: 'SET_DRAGGING',
          payload: {
            id: draggingId,
            isDragging: false,
            dragOwnerId: null
          }
        });
      }

      // Check if this was a click (not a drag)
      const deltaX = e.clientX - dragThresholdRef.current.initialX;
      const deltaY = e.clientY - dragThresholdRef.current.initialY;
      const dragThreshold = 5;
      const wasClick = Math.abs(deltaX) < dragThreshold && Math.abs(deltaY) < dragThreshold;

      if (wasClick && draggingId) {
        // This was a click, not a drag - could trigger click handlers
        const obj = state.objects[draggingId];
        if (obj && obj.onClick) {
          // Execute object's click handler
          obj.onClick(e, obj);
        }
      }

      // Reset drag state
      dragThresholdRef.current = {
        initialX: 0,
        initialY: 0,
        targetId: null,
        addedToSlot: false
      };

      dragOffsetRef.current = null;
      setDraggingId(null);
    }

    // Handle cursor slot dropping outside tabletop
    if (cursorSlot.length > 0) {
      const target = e.target as HTMLElement;
      const tabletopElement = target.closest('[data-tabletop="true"]');

      if (!tabletopElement) {
        // Dropped outside tabletop - clear cursor slot
        setCursorSlot([]);
        setCursorPosition(null);
        if (cursorPositionRef.current) {
          cursorPositionRef.current = null;
        }
        setCursorSlotSource(null);
      }
    }
  }, [
    draggingId,
    state.objects,
    dispatch,
    dragThresholdRef,
    dragOffsetRef,
    setDraggingId,
    cursorSlot,
    setCursorSlot,
    setCursorPosition,
    cursorPositionRef,
    setCursorSlotSource
  ]);

  // Setup event listeners
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('contextmenu', handleGlobalClick);
    window.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('contextmenu', handleGlobalClick);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [handleKeyDown, handleKeyUp, handleGlobalClick, handleGlobalMouseUp]);

  return {
    handleContextMenu,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleWheel,
    handleResizeStart,
    handleAddNexusCell,
    handleGlobalClick,
    handleGlobalMouseUp,
  };
};