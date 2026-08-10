import React from 'react';
import { useToolSettings } from '../../contexts/ToolSettingsContext';

/**
 * VerticalZoomSlider Component
 *
 * Displays a vertical, semi-transparent zoom slider in the top-left corner
 * of the game board when the zoom tool is active and the setting is enabled.
 *
 * @component
 * @returns {JSX.Element | null} Rendered slider or null if disabled
 */
export const VerticalZoomSlider: React.FC = () => {
  const { settings, updateZoomSettings } = useToolSettings();

  // Don't render if the setting is disabled
  if (!settings.zoom.showVerticalSlider) {
    return null;
  }

  const handleZoomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newLevel = Number(e.target.value);
    updateZoomSettings({ level: newLevel });
  };

  const currentZoom = settings.zoom.level;

  // Snap positions with magnetic effect
  const SNAP_LEVELS = [50, 75, 100, 125, 150, 175, 200];
  const SNAP_THRESHOLD = 3; // Distance in percentage to trigger snap

  const snapToLevel = (value: number): number => {
    for (const level of SNAP_LEVELS) {
      if (Math.abs(value - level) <= SNAP_THRESHOLD) {
        return level;
      }
    }
    return value;
  };

  // Convert zoom level to position on the slider (in pixels from top)
  const zoomToPosition = (level: number): number => {
    return 10 + ((200 - level) / 150) * (180 - 20);
  };

  // Convert position on slider to zoom level
  const positionToZoom = (position: number): number => {
    const percentage = Math.max(0, Math.min(1, (position - 10) / (180 - 20)));
    return 200 - percentage * 150;
  };

  return (
    <div
      className="fixed top-4 left-4 z-[1000] pointer-events-none"
      style={{
        width: '40px',
        height: '200px',
      }}
    >
      {/* Vertical slider container */}
      <div
        className="relative w-full h-full pointer-events-auto"
        style={{
          opacity: 0.35,
          background: 'rgba(71, 85, 105, 0.8)',
          borderRadius: '6px',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(147, 51, 234, 0.4)',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          transition: 'opacity 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = '0.85';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = '0.35';
        }}
      >
        {/* Vertical track */}
        <div
          className="absolute left-1/2 transform -translate-x-1/2"
          style={{
            top: '10px',
            bottom: '10px',
            width: '4px',
            background: 'rgba(148, 163, 184, 0.3)',
            borderRadius: '2px',
          }}
        />

        {/* Tick marks for zoom levels */}
        {SNAP_LEVELS.map((level) => {
          const isMajorLevel = level === 50 || level === 100 || level === 200;
          // Position tick marks so they align with the center of the thumb (16px tall = 8px radius)
          // When thumb center is at a tick, the top edge of thumb is 8px above the tick
          const thumbCenterOffset = 8; // Half of thumb height
          const position = 10 + ((200 - level) / 150) * (180 - 20) + thumbCenterOffset;

          return (
            <div
              key={level}
              className="absolute pointer-events-none"
              style={{
                left: '50%',
                transform: 'translateX(-50%)',
                top: `${position}px`,
                width: isMajorLevel ? '12px' : '8px',
                height: isMajorLevel ? '2px' : '1px',
                background: isMajorLevel
                  ? 'rgba(192, 132, 252, 0.6)'
                  : 'rgba(148, 163, 184, 0.4)',
                borderRadius: '1px',
              }}
            />
          );
        })}

        {/* Draggable thumb */}
        <div
          className="absolute left-1/2 transform -translate-x-1/2 cursor-pointer hover:scale-110 transition-transform"
          style={{
            width: '16px',
            height: '16px',
            background: 'rgba(147, 51, 234, 0.8)',
            borderRadius: '50%',
            border: '2px solid rgba(192, 132, 252, 0.9)',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
            // Calculate position based on zoom level (50-200%)
            top: `${10 + ((200 - currentZoom) / 150) * (180 - 20)}px`,
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            const container = e.currentTarget.parentElement;
            if (!container) return;

            const rect = container.getBoundingClientRect();
            const thumb = e.currentTarget;
            const thumbRect = thumb.getBoundingClientRect();

            // Calculate offset from thumb center to mouse position
            const thumbCenter = thumbRect.top + thumbRect.height / 2;
            const mouseOffset = e.clientY - thumbCenter;

            const handleMouseMove = (moveEvent: MouseEvent) => {
              const containerRect = container.getBoundingClientRect();

              // Calculate thumb center position based on mouse position
              const thumbCenterY = moveEvent.clientY - mouseOffset;
              const relativeY = thumbCenterY - containerRect.top;

              // Convert thumb center position to zoom level
              let newLevel = positionToZoom(relativeY);

              // Apply magnetic snapping to tick marks
              newLevel = snapToLevel(newLevel);

              // Round to nearest integer for cleaner values
              newLevel = Math.round(newLevel);

              updateZoomSettings({ level: newLevel });
            };

            const handleMouseUp = () => {
              document.removeEventListener('mousemove', handleMouseMove);
              document.removeEventListener('mouseup', handleMouseUp);
            };

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
          }}
          title={`Zoom: ${currentZoom}%`}
        />
      </div>
    </div>
  );
};

export default VerticalZoomSlider;