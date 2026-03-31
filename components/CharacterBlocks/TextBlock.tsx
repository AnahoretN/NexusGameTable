import React, { useState, useCallback, useEffect } from 'react';
import { CharacterBlock, TextBlockData } from '../../types';

interface TextBlockProps {
  block: CharacterBlock;
  editable: boolean;
  onChange: (data: TextBlockData) => void;
}

export const TextBlock: React.FC<TextBlockProps> = ({ block, editable, onChange }) => {
  const data = block.data as TextBlockData;
  const [content, setContent] = useState(data.content);
  const [isEditing, setIsEditing] = useState(false);

  // Update local state when block data changes
  useEffect(() => {
    setContent(data.content);
  }, [data.content]);

  // Debounced save to avoid excessive updates
  useEffect(() => {
    const timer = setTimeout(() => {
      if (content !== data.content) {
        onChange({ ...data, content });
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [content, data, onChange]);

  const handleClick = useCallback(() => {
    if (editable) {
      setIsEditing(true);
    }
  }, [editable]);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    // Immediate save on blur
    if (content !== data.content) {
      onChange({ ...data, content });
    }
  }, [content, data, onChange]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    if (data.maxLength && newContent.length > data.maxLength) {
      return; // Enforce max length
    }
    setContent(newContent);
  }, [data.maxLength]);

  return (
    <div className="w-full">
      {isEditing && editable ? (
        <textarea
          value={content}
          onChange={handleChange}
          onBlur={handleBlur}
          className="w-full min-h-[100px] p-1.5 bg-slate-600 text-white rounded resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
          placeholder="Enter text here..."
          autoFocus
        />
      ) : (
        <div
          onClick={() => editable && handleClick()}
          className={`min-h-[100px] p-1.5 rounded whitespace-pre-wrap break-words text-xs ${
            editable
              ? 'bg-slate-600 text-white cursor-text hover:bg-slate-500'
              : 'bg-transparent text-slate-200'
          }`}
          title={editable ? "Click to edit" : undefined}
        >
          {content || (
            <span className="text-slate-500 italic">
              {editable ? 'Click to add text...' : 'No content'}
            </span>
          )}
        </div>
      )}

      {/* Character count if maxLength is set */}
      {data.maxLength && (
        <div className="text-xs text-slate-400 mt-1">
          {content.length} / {data.maxLength}
        </div>
      )}
    </div>
  );
};