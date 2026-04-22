import React, { useCallback } from 'react';
import { CharacterBlock, TextBlockData } from '../../types';
import { useInlineEdit } from './hooks';

interface TextBlockProps {
  block: CharacterBlock;
  editable: boolean;
  onChange: (data: TextBlockData) => void;
}

export const TextBlock: React.FC<TextBlockProps> = ({ block, editable, onChange }) => {
  const data = block.data as TextBlockData;

  const handleSave = useCallback((newContent: string) => {
    onChange({ ...data, content: newContent });
  }, [data, onChange]);

  const contentEdit = useInlineEdit({
    value: data.content,
    onSave: handleSave,
    editable,
    debounceMs: 500,
    onEnterSave: false,
    onEscapeCancel: false
  });

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    if (data.maxLength && newContent.length > data.maxLength) {
      return;
    }
    contentEdit.setEditValue(newContent);
  }, [data.maxLength, contentEdit]);

  return (
    <div className="w-full">
      {contentEdit.isEditing && editable ? (
        <textarea
          value={contentEdit.editValue}
          onChange={handleChange}
          onBlur={contentEdit.handleBlur}
          className="w-full min-h-[100px] p-1.5 bg-slate-600 text-white rounded resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
          placeholder="Enter text here..."
          autoFocus
        />
      ) : (
        <div
          onClick={contentEdit.startEdit}
          className={`min-h-[100px] p-1.5 rounded whitespace-pre-wrap break-words text-xs ${
            editable
              ? 'bg-slate-600 text-white cursor-text hover:bg-slate-500'
              : 'bg-transparent text-slate-200'
          }`}
          title={editable ? "Click to edit" : undefined}
        >
          {contentEdit.editValue || (
            <span className="text-slate-500 italic">
              {editable ? 'Click to add text...' : 'No content'}
            </span>
          )}
        </div>
      )}

      {data.maxLength && (
        <div className="text-xs text-slate-400 mt-1">
          {contentEdit.editValue.length} / {data.maxLength}
        </div>
      )}
    </div>
  );
};
