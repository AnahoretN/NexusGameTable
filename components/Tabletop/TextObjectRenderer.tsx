import React, { useState, useEffect, useRef, memo } from 'react';
import { ChevronUp, ChevronDown, Move, Check } from 'lucide-react';
import { TextObject } from '../../types';

interface TextObjectRendererProps {
  obj: TextObject;
  v2p: (vu: number) => number;
  currentTool: string;
  dispatch: React.Dispatch<any>;
  onMouseDown?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
  className?: string;
}

const MIN_FONT_SIZE_VU = 5;
const MAX_FONT_SIZE_VU = 500;
const FONT_SIZE_STEP_VU = 2;

/**
 * TextObjectRenderer
 *
 * Renders a transparent text label (ItemType.TEXT) created with the text tool.
 * - Non-editing: plain auto-sized text, transparent background.
 * - Editing (entered via the window event 'text-object-edit' {detail:{id}}):
 *   a borderless contentEditable with up/down font-size buttons to the LEFT.
 *
 * Editing state is intentionally LOCAL component state (never stored on the
 * object) so it is never synced over the network.
 */
const TextObjectRenderer: React.FC<TextObjectRendererProps> = ({
  obj,
  v2p,
  currentTool,
  dispatch,
  onMouseDown,
  onContextMenu,
  style,
  className,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  // Latest object content, so commit-on-blur reads fresh value even if props
  // changed while editing (e.g. another player resized the font).
  const contentRef = useRef(obj.content);
  const objRef = useRef(obj);
  objRef.current = obj;
  contentRef.current = obj.content;

  // Commit the edited text: UPDATE_OBJECT (or DELETE when left empty).
  const commitEditing = () => {
    const editor = editorRef.current;
    const current = objRef.current;
    if (!editor) return;
    // innerText preserves visual line breaks; normalize   back to spaces
    const text = editor.innerText.replace(/ /g, ' ').replace(/\n$/, '');
    if (text === current.content) return;
    if (text.trim() === '') {
      // Empty text after editing -> remove the object instead of keeping a ghost
      dispatch({ type: 'DELETE_OBJECT', payload: { id: current.id } });
    } else {
      dispatch({ type: 'UPDATE_OBJECT', payload: { id: current.id, updates: { content: text } } });
    }
  };

  // Enter edit mode on demand (text tool click / creation)
  useEffect(() => {
    const handleEditRequest = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.id !== obj.id) return;
      setIsEditing(true);
    };
    const handleEditEnd = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.id !== obj.id) return;
      setIsEditing(false);
    };
    window.addEventListener('text-object-edit', handleEditRequest);
    window.addEventListener('text-object-edit-end', handleEditEnd);
    return () => {
      window.removeEventListener('text-object-edit', handleEditRequest);
      window.removeEventListener('text-object-edit-end', handleEditEnd);
    };
  }, [obj.id]);

  // While editing: fill the editor, focus it and place the caret at the end
  useEffect(() => {
    if (!isEditing) return;
    const editor = editorRef.current;
    if (!editor) return;
    editor.innerText = obj.content;
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false); // caret at end
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  const changeFontSize = (delta: number) => {
    const current = objRef.current;
    const next = Math.min(MAX_FONT_SIZE_VU, Math.max(MIN_FONT_SIZE_VU, Math.round((current.fontSize + delta) * 10) / 10));
    if (next === current.fontSize) return;
    dispatch({ type: 'UPDATE_OBJECT', payload: { id: current.id, updates: { fontSize: next } } });
  };

  // Finish editing: commit text and leave edit mode (used by handle & check button)
  const finishEditing = () => {
    if (!isEditing) return;
    commitEditing();
    setIsEditing(false);
  };

  // Move handle: pick the text into the cursor slot via the SAME pipeline the
  // cursor drag-and-drop uses (ghost follows -> mouseup drops via dropCursorSlot
  // with magnetism/clamping). No custom drag logic, no throttling needed.
  const handleMoveStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Clicking/grabbing the handle while editing commits and exits edit mode first
    finishEditing();
    window.dispatchEvent(new CustomEvent('handle-pick-to-cursor-slot', {
      detail: {
        objectId: objRef.current.id,
        clientX: e.clientX,
        clientY: e.clientY,
      },
    }));
  };

  const textCursor = currentTool === 'text' ? 'cursor-text' : 'cursor-default';
  // Expanded click/drag hit area when the text tool is active: padding grows the
  // box, negative margin keeps the text at the same visual position
  const hitPad = currentTool === 'text' ? v2p(4) : 0;
  // Text border (stroke): width in VU, rendered zoom-scaled via text-stroke
  const borderW = obj.borderWidth ?? 0;
  const textStrokeStyle: React.CSSProperties =
    borderW > 0
      ? { WebkitTextStroke: `${v2p(borderW)}px ${obj.borderColor || '#000000'}`, paintOrder: 'stroke' as any }
      : {};
  // Subtle dashed outline while the text tool is active so invisible text
  // objects remain discoverable/clickable
  const toolHintStyle: React.CSSProperties =
    currentTool === 'text' && !isEditing
      ? { outline: '1px dashed rgba(148, 163, 184, 0.45)', outlineOffset: '2px', borderRadius: '2px' }
      : {};

  return (
    <div
      data-object-id={obj.id}
      data-object-type="TEXT"
      className={`absolute ${textCursor} ${className || ''}`}
      style={{
        ...style,
        // Auto-size to content regardless of the placeholder width/height -
        // otherwise the hint outline hugs the tiny placeholder box, not the text
        width: 'max-content',
        height: 'auto',
        minWidth: v2p(20),
        minHeight: v2p(10),
        maxWidth: v2p(600),
        // Expanded hit area with the text tool (padding + negative margin cancel out)
        padding: hitPad,
        margin: -hitPad,
        pointerEvents: 'auto',
        ...toolHintStyle,
      }}
      onMouseDown={(e) => {
        if (isEditing) {
          // Clicks inside the editor belong to the editor, not the tabletop
          e.stopPropagation();
          return;
        }
        if ((e.target as HTMLElement).closest('button')) return;
        onMouseDown?.(e);
      }}
      onContextMenu={(e) => {
        if (isEditing) {
          e.stopPropagation();
          return;
        }
        onContextMenu?.(e);
      }}
    >
      {isEditing ? (
        <>
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            className="cursor-text"
            style={{
              fontSize: `${v2p(obj.fontSize)}px`,
              lineHeight: 1.2,
              color: obj.fontColor || '#ffffff',
              fontWeight: obj.bold ? 700 : 400,
              fontStyle: obj.italic ? 'italic' : 'normal',
              whiteSpace: 'pre-wrap',
              outline: '1px dashed rgba(192, 132, 252, 0.7)',
              outlineOffset: '2px',
              borderRadius: '2px',
              userSelect: 'text',
              minWidth: v2p(20),
              minHeight: v2p(10),
              textShadow: '0 1px 2px rgba(0, 0, 0, 0.7)',
              ...textStrokeStyle,
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onBlur={() => {
              commitEditing();
              setIsEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                commitEditing();
                setIsEditing(false);
              }
              // Enter inserts a newline (default contentEditable behavior) - do not commit
              e.stopPropagation();
            }}
          />
          {/* Font-size up/down buttons, to the LEFT of the text */}
          <div
            className="absolute flex flex-col gap-0.5"
            style={{ right: '100%', marginRight: '6px', top: 0 }}
            onMouseDown={(e) => {
              // preventDefault keeps focus in the contentEditable (no blur/commit)
              e.preventDefault();
              e.stopPropagation();
            }}
            onContextMenu={(e) => {
              // Right-click on the size buttons opens this object's context menu
              e.preventDefault();
              e.stopPropagation();
              onContextMenu?.(e);
            }}
          >
            <button
              className="flex items-center justify-center w-6 h-6 rounded-md text-slate-200 hover:text-white shadow"
              style={{
                background: 'rgba(71, 85, 105, 0.9)',
                border: '1px solid rgba(147, 51, 234, 0.4)',
              }}
              title="Increase font size"
              onClick={(e) => {
                e.stopPropagation();
                changeFontSize(+FONT_SIZE_STEP_VU);
              }}
            >
              <ChevronUp size={14} />
            </button>
            <button
              className="flex items-center justify-center w-6 h-6 rounded-md text-slate-200 hover:text-white shadow"
              style={{
                background: 'rgba(71, 85, 105, 0.9)',
                border: '1px solid rgba(147, 51, 234, 0.4)',
              }}
              title="Decrease font size"
              onClick={(e) => {
                e.stopPropagation();
                changeFontSize(-FONT_SIZE_STEP_VU);
              }}
            >
              <ChevronDown size={14} />
            </button>
          </div>
        </>
      ) : (
        <div
          style={{
            fontSize: `${v2p(obj.fontSize)}px`,
            lineHeight: 1.2,
            color: obj.fontColor || '#ffffff',
            fontWeight: obj.bold ? 700 : 400,
            fontStyle: obj.italic ? 'italic' : 'normal',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.7)',
            ...textStrokeStyle,
          }}
        >
          {obj.content}
        </div>
      )}
      {/* Move handle: drag to reposition the text (text tool only).
          Grabbing it while editing commits and exits edit mode first. */}
      {currentTool === 'text' && (
      <div
        data-text-move-handle="true"
        className="absolute cursor-move flex items-center justify-center text-slate-200"
        style={{
          left: '100%',
          marginLeft: '6px',
          top: 0,
          width: '20px',
          height: '20px',
          borderRadius: '6px',
          background: 'rgba(71, 85, 105, 0.9)',
          border: '1px solid rgba(147, 51, 234, 0.4)',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
        }}
        title="Move text"
        onMouseDown={handleMoveStart}
        onContextMenu={(e) => {
          // Right-click on the handle opens this object's context menu
          e.preventDefault();
          e.stopPropagation();
          onContextMenu?.(e);
        }}
      >
        <Move size={12} />
      </div>
      )}
      {/* Check button: visible only while editing - click finishes editing */}
      {isEditing && (
        <div
          className="absolute cursor-pointer flex items-center justify-center text-green-300 hover:text-green-200"
          style={{
            left: '100%',
            marginLeft: '6px',
            top: '26px',
            width: '20px',
            height: '20px',
            borderRadius: '6px',
            background: 'rgba(71, 85, 105, 0.9)',
            border: '1px solid rgba(74, 222, 128, 0.5)',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
          }}
          title="Finish editing"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            finishEditing();
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onContextMenu?.(e);
          }}
        >
          <Check size={12} />
        </div>
      )}
    </div>
  );
};

const TextObjectRendererMemo = memo(TextObjectRenderer, (prev, next) => {
  return (
    prev.obj === next.obj &&
    prev.v2p === next.v2p &&
    prev.currentTool === next.currentTool &&
    prev.dispatch === next.dispatch &&
    prev.style === next.style &&
    prev.className === next.className &&
    prev.onMouseDown === next.onMouseDown &&
    prev.onContextMenu === next.onContextMenu
  );
});

TextObjectRendererMemo.displayName = 'TextObjectRendererMemo';

export { TextObjectRendererMemo };
export default TextObjectRenderer;
