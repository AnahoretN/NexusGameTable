import React, { memo, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Plus, Minus } from 'lucide-react';
import { TokenSlider, TokenSliderDisplay } from '../../types';
import { broadcastTokenCounters } from '../../utils/directP2PSync';
import { useActivePlayerId } from '../../store/contexts';

interface TokenCountersDisplayProps {
  counters: TokenSlider[];
  counterDisplay: TokenSliderDisplay | undefined;
  tokenWidth: number;  // Now in VU (virtual units)
  tokenHeight: number; // Now in VU (virtual units)
  pixelsPerVU: number;
  basePixelsPerVU: number;
  isGM: boolean;
  tokenId: string;
  dispatch: React.Dispatch<any>;
}

export const TokenCountersDisplay = memo(({
  counters,
  counterDisplay,
  tokenWidth,
  tokenHeight,
  pixelsPerVU,
  basePixelsPerVU,
  isGM,
  tokenId,
  dispatch
}: TokenCountersDisplayProps) => {
  // ALL hooks must be called before any conditional returns (Rules of Hooks)
  const activePlayerId = useActivePlayerId();
  const position = counterDisplay?.position || 'above';
  const [hoveredCounterId, setHoveredCounterId] = useState<string | null>(null);
  const [draggingCounterId, setDraggingCounterId] = useState<string | null>(null);
  const intervalRef = useRef<number | null>(null);

  // Early returns AFTER all hooks
  if (!isGM && counterDisplay?.showForPlayers === false) {
    return null;
  }

  if (!counters || counters.length === 0) {
    return null;
  }

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Memoize position check
  const isVerticalPosition = position === 'left' || position === 'right';

  // Helper to convert VU to pixels (token dimensions are in VU)
  const v2p = useCallback((vu: number) => vu * pixelsPerVU, [pixelsPerVU]);

  // Handle slider value change (can be delta for buttons or absolute value for slider)
  const handleSliderChange = useCallback((slider: TokenSlider, valueOrDelta: number) => {
    const clampedValue = Math.max(
      slider.minValue ?? 0,
      Math.min(slider.maxValue, valueOrDelta)
    );

    // Update the counter value
    const updatedCounters = counters.map(c =>
      c.id === slider.id ? { ...c, value: clampedValue } : c
    );

    // 🔥 NEW: Broadcast counter changes via direct P2P
    broadcastTokenCounters(tokenId, updatedCounters, activePlayerId);

    // Update token locally AND sync to panel characterData (but skip network sync)
    // This ensures panel sliders update even when panel is closed or different tab is active
    const action: any = {
      type: 'UPDATE_OBJECT',
      payload: {
        id: tokenId,
        updates: { counters: updatedCounters }
      },
      syncToPanel: true,      // Update panel.characterData (checked in reducer)
      skipNetworkSync: true   // Don't send to host (checked in middleware)
    };

    dispatch(action);
  }, [counters, tokenId, dispatch, activePlayerId]);

  // Start continuous change on button hold
  const startContinuousChange = useCallback((slider: TokenSlider, delta: number) => {
    let currentValue = slider.value;

    // Apply first change immediately
    currentValue += delta;
    handleSliderChange(slider, currentValue);

    // Then apply changes every 250ms
    intervalRef.current = setInterval(() => {
      currentValue += delta;
      // Use the original slider reference but with updated value
      const updatedSlider = { ...slider, value: currentValue };
      handleSliderChange(updatedSlider, currentValue);
    }, 250);
  }, [handleSliderChange]);

  // Stop continuous change
  const stopContinuousChange = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Calculate zoom multiplier from pixelsPerVU / basePixelsPerVU
  const zoomMultiplier = pixelsPerVU / basePixelsPerVU;

  // Memoize container style
  const containerStyle = useMemo((): React.CSSProperties => {
    const baseBarHeight = 7 * basePixelsPerVU;
    const gap = basePixelsPerVU;

    if (isVerticalPosition) {
      // Vertical layout (left/right) - calculate total width
      const totalWidth = counters.length * (baseBarHeight + gap);

      const baseStyle: React.CSSProperties = {
        position: 'absolute',
        top: '50%',
        transform: `translateY(-50%) scale(${zoomMultiplier})`,
        transformOrigin: 'center',
        pointerEvents: 'auto',
        zIndex: 10,
        width: `${totalWidth}px`,
        flexDirection: 'row' as const,
      };

      if (position === 'left') {
        return { ...baseStyle, right: '100%', marginRight: '4px' };
      } else { // right
        return { ...baseStyle, left: '100%', marginLeft: '4px' };
      }
    } else {
      // Horizontal layout (above/below/center) - calculate total height
      const totalHeight = counters.length * (baseBarHeight + gap);

      const baseStyle: React.CSSProperties = {
        position: 'absolute',
        left: '50%',
        transform: `translateX(-50%) scale(${zoomMultiplier})`,
        transformOrigin: 'center',
        pointerEvents: 'auto',
        zIndex: 10,
        height: `${totalHeight}px`,
      };

      if (position === 'above') {
        return { ...baseStyle, bottom: '100%', marginBottom: '4px' };
      } else if (position === 'below') {
        return { ...baseStyle, top: '100%', marginTop: '4px' };
      } else { // center
        return { ...baseStyle, top: '50%', transform: 'translate(-50%, -50%) scale(' + zoomMultiplier + ')' };
      }
    }
  }, [counters.length, isVerticalPosition, position, basePixelsPerVU, zoomMultiplier]);

  // Memoize base bar dimensions
  const baseBarHeight = useMemo(() => 7 * basePixelsPerVU, [basePixelsPerVU]);
  const maxHeight = useMemo(() => 7 * 2 * basePixelsPerVU, [basePixelsPerVU]);
  const gap = useMemo(() => basePixelsPerVU, [basePixelsPerVU]);
  const buttonSize = useMemo(() => 24 * basePixelsPerVU, [basePixelsPerVU]);
  const buttonOffset = useMemo(() => buttonSize / 2 + 0.5 * basePixelsPerVU, [buttonSize, basePixelsPerVU]);

  // Memoize label style
  const labelStyle = useMemo((): React.CSSProperties => {
    const fontSize = 15 * basePixelsPerVU;

    if (isVerticalPosition) {
      // Vertical - label above the + button
      const offset = buttonOffset + buttonSize + 6 * basePixelsPerVU;
      return {
        fontSize: `${fontSize}px`,
        fontWeight: 'bold',
        color: 'white',
        textShadow: '0 1px 3px rgba(0,0,0,0.9)',
        whiteSpace: 'nowrap' as const,
        position: 'absolute' as const,
        left: '50%',
        transform: 'translateX(-50%)',
        top: `-${offset}px`,
        animation: 'fadeInDown 0.2s ease forwards',
      };
    } else {
      // Horizontal - label above the bar
      return {
        fontSize: `${fontSize}px`,
        fontWeight: 'bold',
        color: 'white',
        textShadow: '0 1px 3px rgba(0,0,0,0.9)',
        whiteSpace: 'nowrap' as const,
        position: 'absolute' as const,
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: '100%',
        marginBottom: `${2 * basePixelsPerVU}px`,
        animation: 'fadeInDown 0.2s ease forwards',
      };
    }
  }, [isVerticalPosition, basePixelsPerVU, buttonSize, buttonOffset]);

  // Memoize value style
  const valueStyle = useMemo((): React.CSSProperties => {
    const fontSize = 10 * basePixelsPerVU;
    return {
      fontSize: `${fontSize}px`,
      fontWeight: 'bold',
      color: 'white',
      textShadow: '0 1px 3px rgba(0,0,0,0.9)',
      whiteSpace: 'nowrap' as const,
      position: 'absolute' as const,
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      pointerEvents: 'none',
      zIndex: 1,
    };
  }, [basePixelsPerVU]);

  // Memoize button text style
  const buttonTextStyle = useMemo((): React.CSSProperties => {
    return {
      position: 'relative',
      top: `-${3 * basePixelsPerVU}px`,
    };
  }, [basePixelsPerVU]);

  // Get button style with animation
  const getButtonStyle = useCallback((isTop: boolean): React.CSSProperties => {
    if (isVerticalPosition) {
      // Vertical layout - buttons at top and bottom
      return {
        position: 'absolute' as const,
        left: '50%',
        transform: isTop ? 'translate(-50%, -50%)' : 'translate(-50%, 50%)',
        width: `${buttonSize}px`,
        height: `${buttonSize}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        backgroundColor: 'rgba(0,0,0,0.8)',
        border: '1px solid rgba(255,255,255,0.3)',
        color: 'white',
        fontSize: `${20 * basePixelsPerVU}px`,
        fontWeight: 'bold',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        [isTop ? 'top' as const : 'bottom' as const]: `-${buttonOffset}px`,
        animation: isTop ? 'fadeInTopBtn 0.2s ease forwards' : 'fadeInBottomBtn 0.2s ease forwards',
      };
    } else {
      // Horizontal layout - buttons at left and right
      return {
        position: 'absolute' as const,
        top: '50%',
        transform: isTop ? 'translate(-50%, -50%)' : 'translate(50%, -50%)',
        width: `${buttonSize}px`,
        height: `${buttonSize}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        backgroundColor: 'rgba(0,0,0,0.8)',
        border: '1px solid rgba(255,255,255,0.3)',
        color: 'white',
        fontSize: `${20 * basePixelsPerVU}px`,
        fontWeight: 'bold',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        [isTop ? 'left' as const : 'right' as const]: `-${buttonOffset}px`,
        animation: isTop ? 'fadeInLeftBtn 0.2s ease forwards' : 'fadeInRightBtn 0.2s ease forwards',
      };
    }
  }, [isVerticalPosition, buttonSize, buttonOffset, basePixelsPerVU]);

  // Get counter wrapper style
  const getCounterStyle = useCallback((index: number, isHovered: boolean): React.CSSProperties => {
    if (isVerticalPosition) {
      // Vertical counter (left/right position) - convert VU to pixels
      const barHeight = isHovered ? v2p(tokenHeight) * 1.5 : v2p(tokenHeight);

      return {
        position: 'absolute' as const,
        top: '50%',
        transform: 'translateY(-50%)',
        left: `${index * (baseBarHeight + gap)}px`,
        width: `${maxHeight}px`,
        height: `${barHeight}px`,
        zIndex: isHovered ? 20 : 1,
        transition: 'height 0.2s ease',
      };
    } else {
      // Horizontal counter (above/below/center position) - convert VU to pixels
      const barWidth = isHovered ? v2p(tokenWidth) * 1.5 : v2p(tokenWidth);

      return {
        position: 'absolute' as const,
        left: '50%',
        transform: 'translateX(-50%)',
        top: `${index * (baseBarHeight + gap)}px`,
        width: `${barWidth}px`,
        height: `${maxHeight}px`,
        zIndex: isHovered ? 20 : 1,
        transition: 'width 0.2s ease',
      };
    }
  }, [isVerticalPosition, tokenHeight, tokenWidth, baseBarHeight, gap, maxHeight, v2p]);

  // Get bar background style
  const getBarStyle = useCallback((isHovered: boolean): React.CSSProperties => {
    const barSize = isHovered ? 7 * 2 : 7;

    if (isVerticalPosition) {
      // Vertical bar - width is fixed, height is 100%
      return {
        width: `${barSize * basePixelsPerVU}px`,
        height: '100%',
        backgroundColor: 'rgba(0,0,0,0.6)',
        borderRadius: '3px',
        overflow: 'visible',
        position: 'absolute' as const,
        left: '50%',
        transform: 'translateX(-50%)',
        transition: 'all 0.2s ease',
        cursor: 'pointer',
        zIndex: isHovered ? 20 : 1,
      };
    } else {
      // Horizontal bar - width is 100%, height is fixed
      return {
        width: '100%',
        height: `${barSize * basePixelsPerVU}px`,
        backgroundColor: 'rgba(0,0,0,0.6)',
        borderRadius: '3px',
        overflow: 'visible',
        position: 'absolute' as const,
        top: '50%',
        transform: 'translateY(-50%)',
        transition: 'all 0.2s ease',
        cursor: 'pointer',
        zIndex: isHovered ? 20 : 1,
      };
    }
  }, [isVerticalPosition, basePixelsPerVU]);

  // Get bar fill style
  const getBarFillStyle = useCallback((slider: TokenSlider): React.CSSProperties => {
    const percentage = Math.max(0, Math.min(100, (slider.value / slider.maxValue) * 100));

    if (isVerticalPosition) {
      // Vertical bar - fill from bottom
      return {
        width: '100%',
        height: `${percentage}%`,
        backgroundColor: slider.color || '#ef4444',
        borderRadius: '3px',
        position: 'absolute' as const,
        bottom: '0',
        left: '0',
        transition: 'height 0.3s ease',
      };
    } else {
      // Horizontal bar - fill from left
      return {
        width: `${percentage}%`,
        height: '100%',
        backgroundColor: slider.color || '#ef4444',
        borderRadius: '3px',
        transition: 'width 0.3s ease',
      };
    }
  }, [isVerticalPosition]);

  // Mouse enter handler
  const handleMouseEnter = useCallback((counterId: string) => {
    if (!draggingCounterId) {
      setHoveredCounterId(counterId);
    }
  }, [draggingCounterId]);

  // Mouse leave handler
  const handleMouseLeave = useCallback((counterId: string) => {
    if (draggingCounterId !== counterId) {
      setHoveredCounterId(null);
    }
  }, [draggingCounterId]);

  // Button handlers
  const handleButtonMouseDown = useCallback((e: React.MouseEvent<HTMLButtonElement>, slider: TokenSlider, delta: number) => {
    e.stopPropagation();
    startContinuousChange(slider, delta);
  }, [startContinuousChange]);

  const handleButtonMouseUp = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    stopContinuousChange();
  }, [stopContinuousChange]);

  const handleButtonMouseLeave = useCallback((e: React.MouseEvent<HTMLButtonElement>, isVertical: boolean) => {
    stopContinuousChange();
    const button = e.currentTarget;
    button.style.backgroundColor = 'rgba(0,0,0,0.8)';
    if (isVertical) {
      button.style.transform = button.style.transform.replace('scale(1.1)', 'scale(1)');
    } else {
      button.style.transform = button.style.transform.replace('scale(1.1)', 'scale(1)');
    }
  }, [stopContinuousChange]);

  const handleButtonMouseEnter = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const button = e.currentTarget;
    button.style.backgroundColor = 'rgba(50,50,50,0.9)';
    button.style.transform = button.style.transform.replace('scale(1)', 'scale(1.1)');
  }, []);

  // Vertical drag handler
  const handleVerticalDragStart = useCallback((e: React.MouseEvent<HTMLDivElement>, slider: TokenSlider) => {
    e.stopPropagation();
    setDraggingCounterId(slider.id);
    const bar = e.currentTarget;
    const rect = bar.getBoundingClientRect();
    const updateFromMouse = (mouseEvent: MouseEvent) => {
      const relativeY = rect.bottom - mouseEvent.clientY;
      const percentage = Math.max(0, Math.min(1, relativeY / rect.height));
      const newValue = Math.round((slider.minValue ?? 0) + percentage * (slider.maxValue - (slider.minValue ?? 0)));
      handleSliderChange(slider, newValue);
    };
    updateFromMouse(e.nativeEvent);
    const onMove = (moveEvent: MouseEvent) => updateFromMouse(moveEvent);
    const onUp = () => {
      setDraggingCounterId(null);
      setHoveredCounterId(null);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [handleSliderChange]);

  // Range change handler
  const handleRangeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>, slider: TokenSlider) => {
    handleSliderChange(slider, parseInt(e.target.value));
  }, [handleSliderChange]);

  const handleRangeMouseDown = useCallback((e: React.MouseEvent<HTMLInputElement>) => {
    e.stopPropagation();
  }, []);

  return (
    <div style={containerStyle}>
      {counters.map((slider, index) => {
        const isHovered = hoveredCounterId === slider.id || draggingCounterId === slider.id;
        return (
          <div
            key={slider.id}
            style={getCounterStyle(index, isHovered)}
            onMouseEnter={() => handleMouseEnter(slider.id)}
            onMouseLeave={() => handleMouseLeave(slider.id)}
          >
            {isHovered && (
              <span style={labelStyle}>
                {slider.icon && <span style={{ marginRight: '2px' }}>{slider.icon}</span>}
                {slider.name}
              </span>
            )}
            <div
              style={getBarStyle(isHovered)}
              title={`${slider.name}: ${slider.value}/${slider.maxValue}`}
            >
              <div style={getBarFillStyle(slider)} />
              {isHovered && !isVerticalPosition && (
                <input
                  type="range"
                  min={slider.minValue ?? 0}
                  max={slider.maxValue}
                  value={slider.value}
                  onChange={(e) => handleRangeChange(e, slider)}
                  onMouseDown={handleRangeMouseDown}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    opacity: 0,
                    cursor: 'pointer',
                    zIndex: 10,
                  }}
                />
              )}
              {isHovered && isVerticalPosition && (
                <div
                  onMouseDown={(e) => handleVerticalDragStart(e, slider)}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    cursor: 'pointer',
                    zIndex: 10,
                  }}
                />
              )}
              {isHovered && (
                <span style={{...valueStyle, animation: 'fadeInCenter 0.2s ease forwards'}}>
                  {slider.value}/{slider.maxValue}
                </span>
              )}
              {isHovered && (
                <button
                  style={getButtonStyle(true)}
                  onMouseDown={(e) => handleButtonMouseDown(e, slider, isVerticalPosition ? 1 : -1)}
                  onMouseUp={handleButtonMouseUp}
                  onMouseLeave={(e) => handleButtonMouseLeave(e, isVerticalPosition)}
                  onMouseEnter={handleButtonMouseEnter}
                >
                  <span style={buttonTextStyle}>{isVerticalPosition ? '+' : '-'}</span>
                </button>
              )}
              {isHovered && (
                <button
                  style={getButtonStyle(false)}
                  onMouseDown={(e) => handleButtonMouseDown(e, slider, isVerticalPosition ? -1 : 1)}
                  onMouseUp={handleButtonMouseUp}
                  onMouseLeave={(e) => handleButtonMouseLeave(e, isVerticalPosition)}
                  onMouseEnter={handleButtonMouseEnter}
                >
                  <span style={buttonTextStyle}>{isVerticalPosition ? '-' : '+'}</span>
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for memo
  return (
    prevProps.counters === nextProps.counters &&
    prevProps.counterDisplay === nextProps.counterDisplay &&
    prevProps.tokenWidth === nextProps.tokenWidth &&
    prevProps.tokenHeight === nextProps.tokenHeight &&
    prevProps.pixelsPerVU === nextProps.pixelsPerVU &&
    prevProps.basePixelsPerVU === nextProps.basePixelsPerVU &&
    prevProps.isGM === nextProps.isGM &&
    prevProps.tokenId === nextProps.tokenId
  );
});

TokenCountersDisplay.displayName = 'TokenCountersDisplay';

export default TokenCountersDisplay;
