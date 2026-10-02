import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { TokenShape } from '../../types';
import { SvgTokenShape } from '../SvgTokenShape';

export interface ToolPanelFlyoutItem {
  id: string;
  name: string;
  kind: 'token' | 'effect';
  // Token preview
  shape?: TokenShape;
  color?: string;
  content?: string;
  borderWidth?: number;
  borderColor?: number | string;
  opacity?: number;
  // Effect preview (image url/hash in content)
  width?: number;
  height?: number;
}

interface ToolPanelFlyoutProps {
  anchorRect: DOMRect;
  items: ToolPanelFlyoutItem[];
  title: string;
  onItemActivate: (item: ToolPanelFlyoutItem, clientX: number, clientY: number) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

/**
 * ToolPanelFlyout
 *
 * Hover flyout for the top-left mini toolbar: lists token types or effect
 * templates of the session. Rendered in a portal (fixed, right of the anchor
 * button). Click an item to pick it into the cursor slot; it then follows the
 * cursor and the next click drops it (the app's native drag model).
 *
 * The root carries data-tokens-panel so the tabletop's mousedown/mouseup
 * handlers treat it as a panel and never drop/steal the cursor slot.
 */
export const ToolPanelFlyout: React.FC<ToolPanelFlyoutProps> = ({
  anchorRect,
  items,
  title,
  onItemActivate,
  onMouseEnter,
  onMouseLeave,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on Escape; hide when the anchor scrolls out of view is not needed
  // (the panel is fixed). Click-outside is intentionally NOT handled: the
  // flyout closes on mouse leave instead.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Let the panel close via its own mouseleave logic
        onMouseLeave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onMouseLeave]);

  const top = Math.min(anchorRect.top, Math.max(8, window.innerHeight - 320));
  const left = anchorRect.right + 6;

  return createPortal(
    <div
      ref={rootRef}
      data-tokens-panel="true"
      data-tool-flyout="true"
      className="fixed z-[1001] pointer-events-auto rounded-lg p-2"
      style={{
        left,
        top,
        maxWidth: '320px',
        maxHeight: '60vh',
        background: 'rgba(71, 85, 105, 0.95)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(147, 51, 234, 0.4)',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
        opacity: 0.95,
        overflowY: 'auto',
        userSelect: 'none',
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="text-[10px] font-bold text-gray-400 uppercase mb-1.5 px-0.5">{title}</div>
      <div className="grid grid-cols-3 gap-1.5">
        {items.map((item) => (
          <button
            key={item.id}
            data-flyout-item={item.id}
            className="flex flex-col items-center justify-start gap-1 p-1.5 rounded-md bg-slate-800/70 border border-slate-600/60 hover:border-purple-400/80 hover:bg-slate-700/70 transition-colors"
            title={item.name}
            onClick={(e) => onItemActivate(item, e.clientX, e.clientY)}
          >
            <div className="w-10 h-10 flex items-center justify-center pointer-events-none">
              {item.kind === 'token' ? (() => {
                // Preserve the archetype's aspect ratio inside the 40px tile
                const w = item.width && item.width > 0 ? item.width : 40;
                const h = item.height && item.height > 0 ? item.height : 40;
                const scale = Math.min(40 / w, 40 / h);
                return (
                  <SvgTokenShape
                    shape={item.shape || TokenShape.CIRCLE}
                    width={w * scale}
                    height={h * scale}
                    color={item.color || '#3498db'}
                    content={item.content || ''}
                    borderWidth={item.borderWidth ?? 2}
                    borderColor={(item.borderColor as string) || '#ffffff'}
                    opacity={item.opacity ?? 100}
                  />
                );
              })() : item.content ? (
                <img
                  src={item.content}
                  alt={item.name}
                  className="max-w-full max-h-full object-contain"
                  draggable={false}
                />
              ) : (
                <div
                  className="w-8 h-8 rounded"
                  style={{ background: 'rgba(239, 68, 68, 0.35)', border: '1px solid rgba(239, 68, 68, 0.6)' }}
                />
              )}
            </div>
            <span className="text-[9px] text-gray-300 leading-tight text-center line-clamp-2 break-words max-w-full">
              {item.name}
            </span>
          </button>
        ))}
      </div>
    </div>,
    document.body
  );
};

export default ToolPanelFlyout;
