import React, { useState, useRef } from 'react';
import { MousePointer2, Pen, Eraser, Ruler, Type, Grid3x3, Hexagon, Target } from 'lucide-react';
import { useToolSettings, DrawingTool } from '../../contexts/ToolSettingsContext';
import { useLanguage } from '../../store/contexts/UIContext';
import { useGame } from '../../store/GameContext';
import { t, Locale } from '../../utils/translations';
import { ItemType, TokenShape } from '../../types';
import { ToolPanelFlyout, ToolPanelFlyoutItem } from './ToolPanelFlyout';

/**
 * Shared visual style for the panel sections (quick tool buttons / zoom slider).
 * Semi-transparent glass look that fades in on hover.
 */
const PANEL_SECTION_STYLE: React.CSSProperties = {
  opacity: 0.35,
  background: 'rgba(71, 85, 105, 0.8)',
  borderRadius: '6px',
  backdropFilter: 'blur(8px)',
  border: '1px solid rgba(147, 51, 234, 0.4)',
  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
  transition: 'opacity 0.2s ease',
};

const handleSectionHover = {
  onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.opacity = '0.85';
  },
  onMouseLeave: (e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.opacity = '0.35';
  },
};

interface QuickToolButtonConfig {
  id: DrawingTool;
  icon: React.ReactNode;
  labelKey: string;
  visible: boolean;
}

/**
 * TopLeftToolPanel Component
 *
 * Toggleable panel in the top-left corner of the game board. Contains
 * quick-select buttons for the drawing tools (cursor, marker, eraser, ruler,
 * text), a grid toggle, token/effect flyout launchers and the vertical zoom
 * slider. Each control can be shown/hidden from the Tools tab of the main menu.
 *
 * @component
 * @returns {JSX.Element | null} Rendered panel or null if fully disabled
 */
export const TopLeftToolPanel: React.FC = () => {
  const { settings, setSelectedTool, updateGridSettings } = useToolSettings();
  const language = useLanguage();
  const { state } = useGame();

  // Flyout state ('tokens' | 'effects' | null) + hover close timer
  const [openFlyout, setOpenFlyout] = useState<'tokens' | 'effects' | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const scheduleFlyoutClose = () => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setOpenFlyout(null);
      setAnchorRect(null);
    }, 200);
  };

  const openFlyoutFor = (kind: 'tokens' | 'effects', rect: DOMRect) => {
    clearCloseTimer();
    setAnchorRect(rect);
    setOpenFlyout(kind);
  };

  const quickTools: QuickToolButtonConfig[] = [
    { id: 'none', icon: <MousePointer2 size={18} />, labelKey: 'Cursor', visible: settings.cursor.showButton },
    { id: 'marker', icon: <Pen size={18} />, labelKey: 'Marker', visible: settings.marker.showButton },
    { id: 'eraser', icon: <Eraser size={18} />, labelKey: 'Eraser', visible: settings.eraser.showButton },
    { id: 'ruler', icon: <Ruler size={18} />, labelKey: 'Ruler', visible: settings.ruler.showButton },
    { id: 'text', icon: <Type size={18} />, labelKey: 'Text', visible: settings.text.showButton },
  ];

  // Session token types / effect templates for the flyouts
  const tokenTypes = Object.values(state.objects).filter(
    (obj): obj is any => obj.type === ItemType.TOKEN_TYPE
  );
  const effectTemplates = Object.values(state.objects).filter(
    (obj): obj is any =>
      obj.type === ItemType.EFFECT_TEMPLATE &&
      (obj as any).inCursorSlot !== true &&
      obj.isOnTable !== false
  );

  const tokensFlyoutItems: ToolPanelFlyoutItem[] = tokenTypes.map((arch) => ({
    id: arch.id,
    name: arch.name,
    kind: 'token' as const,
    shape: arch.shape || TokenShape.CIRCLE,
    color: arch.color || '#3498db',
    content: arch.content || '',
    borderWidth: arch.borderWidth,
    borderColor: arch.borderColor,
    opacity: arch.opacity,
    width: arch.width,
    height: arch.height,
  }));
  const effectsFlyoutItems: ToolPanelFlyoutItem[] = effectTemplates.map((tpl) => ({
    id: tpl.id,
    name: tpl.name,
    kind: 'effect' as const,
    content: tpl.content || '',
  }));

  const showTokensLauncher = tokensFlyoutItems.length > 0;
  const showEffectsLauncher = effectsFlyoutItems.length > 0;

  const activateFlyoutItem = (item: ToolPanelFlyoutItem, clientX: number, clientY: number) => {
    clearCloseTimer();
    // Keep the flyout open so several tokens/effects can be gathered by clicking
    // repeatedly (same UX as the persistent token panels). It closes on mouse leave.
    if (item.kind === 'token') {
      // Picked into the cursor slot; follows the cursor, next click drops it
      window.dispatchEvent(new CustomEvent('add-token-to-cursor-slot', {
        detail: { archetypeId: item.id, clientX, clientY },
      }));
    } else {
      window.dispatchEvent(new CustomEvent('add-effect-to-cursor-slot', {
        detail: { templateId: item.id, clientX, clientY },
      }));
    }
  };

  const visibleQuickTools = quickTools.filter((tool) => tool.visible);
  const showZoomSlider = settings.zoom.showVerticalSlider;
  const showGridToggle = settings.grid.showButton;

  // Hide the whole panel when every control is disabled
  if (
    visibleQuickTools.length === 0 &&
    !showZoomSlider &&
    !showGridToggle &&
    !showTokensLauncher &&
    !showEffectsLauncher
  ) {
    return null;
  }

  const toolButtonClass = (isActive: boolean) =>
    `flex items-center justify-center w-8 h-8 rounded-md transition-colors ${
      isActive
        ? 'bg-purple-600/80 border border-purple-400/90 text-white'
        : 'bg-transparent border border-transparent text-slate-200 hover:bg-slate-600/60 hover:text-white'
    }`;

  return (
    <div
      data-floating-ui="true"
      className="fixed top-4 left-4 z-[1000] pointer-events-none flex flex-col gap-2"
      style={{ width: '40px' }}
    >
      {/* Quick tool buttons */}
      {visibleQuickTools.length > 0 && (
        <div
          className="relative w-full pointer-events-auto flex flex-col items-center gap-1 p-1"
          style={PANEL_SECTION_STYLE}
          {...handleSectionHover}
        >
          {visibleQuickTools.map((tool) => {
            const isActive = settings.selectedTool === tool.id;
            return (
              <button
                key={tool.id}
                onClick={() => setSelectedTool(tool.id)}
                className={toolButtonClass(isActive)}
                title={t(tool.labelKey, language as Locale)}
              >
                {tool.icon}
              </button>
            );
          })}
        </div>
      )}

      {/* Grid toggle (local per-player setting, not a blocking tool) */}
      {showGridToggle && (
        <div
          className="relative w-full pointer-events-auto flex flex-col items-center gap-1 p-1"
          style={PANEL_SECTION_STYLE}
          {...handleSectionHover}
        >
          <button
            onClick={() => updateGridSettings({ enabled: !settings.grid.enabled })}
            className={toolButtonClass(settings.grid.enabled)}
            title={t('Grid', language as Locale)}
          >
            <Grid3x3 size={18} />
          </button>
        </div>
      )}

      {/* Tokens / Effects flyout launchers */}
      {(showTokensLauncher || showEffectsLauncher) && (
        <div
          className="relative w-full pointer-events-auto flex flex-col items-center gap-1 p-1"
          style={PANEL_SECTION_STYLE}
          {...handleSectionHover}
        >
          {showTokensLauncher && (
            <button
              className={toolButtonClass(openFlyout === 'tokens')}
              title={t('Tokens', language as Locale)}
              onMouseEnter={(e) => openFlyoutFor('tokens', (e.currentTarget as HTMLElement).getBoundingClientRect())}
              onMouseLeave={scheduleFlyoutClose}
              onClick={(e) => openFlyoutFor('tokens', (e.currentTarget as HTMLElement).getBoundingClientRect())}
            >
              <Hexagon size={18} />
            </button>
          )}
          {showEffectsLauncher && (
            <button
              className={toolButtonClass(openFlyout === 'effects')}
              title={t('Effects', language as Locale)}
              onMouseEnter={(e) => openFlyoutFor('effects', (e.currentTarget as HTMLElement).getBoundingClientRect())}
              onMouseLeave={scheduleFlyoutClose}
              onClick={(e) => openFlyoutFor('effects', (e.currentTarget as HTMLElement).getBoundingClientRect())}
            >
              <Target size={18} />
            </button>
          )}
        </div>
      )}

      {/* Vertical zoom slider */}
      {showZoomSlider && <ZoomSliderSection />}

      {/* Flyout portal (tokens / effects) */}
      {openFlyout && anchorRect && (
        <ToolPanelFlyout
          anchorRect={anchorRect}
          items={openFlyout === 'tokens' ? tokensFlyoutItems : effectsFlyoutItems}
          title={openFlyout === 'tokens' ? t('Tokens', language as Locale) : t('Effects', language as Locale)}
          onItemActivate={activateFlyoutItem}
          onMouseEnter={clearCloseTimer}
          onMouseLeave={scheduleFlyoutClose}
        />
      )}
    </div>
  );
};

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

/**
 * Vertical zoom slider section (same behavior as the original
 * VerticalZoomSlider component).
 */
const ZoomSliderSection: React.FC = () => {
  const { settings, updateZoomSettings } = useToolSettings();
  const language = useLanguage();

  const currentZoom = settings.zoom.level;

  return (
    <div
      className="relative w-full pointer-events-auto"
      style={{
        ...PANEL_SECTION_STYLE,
        height: '200px',
      }}
      {...handleSectionHover}
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
          top: `${zoomToPosition(currentZoom)}px`,
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          const container = e.currentTarget.parentElement;
          if (!container) return;

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

            // Convert thumb center to zoom level
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
        title={`${t('Zoom', language as Locale)}: ${currentZoom}%`}
      />
    </div>
  );
};

export default TopLeftToolPanel;
