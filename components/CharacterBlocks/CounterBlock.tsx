import React, { useCallback } from 'react';
import { CharacterBlock } from '../../types';
import { useInlineEdit } from './hooks';

interface CounterItem {
  id: string;
  name: string;
  value: number;
}

interface CounterBlockData {
  counters: CounterItem[];
}

interface CounterBlockProps {
  block: CharacterBlock;
  editable: boolean;
  onChange: (data: CounterBlockData) => void;
}

export const CounterBlock: React.FC<CounterBlockProps> = ({ block, editable, onChange }) => {
  const data = block.data as CounterBlockData;

  const handleValueChange = useCallback((counterId: string, newValue: number) => {
    if (!editable) return;

    const updatedCounters = data.counters.map(counter =>
      counter.id === counterId
        ? { ...counter, value: Math.max(0, newValue) }
        : counter
    );

    onChange({ ...data, counters: updatedCounters });
  }, [data, editable, onChange]);

  const handleNameChange = useCallback((counterId: string, newName: string) => {
    const updatedCounters = data.counters.map(counter =>
      counter.id === counterId ? { ...counter, name: newName.trim() || 'Counter' } : counter
    );
    onChange({ ...data, counters: updatedCounters });
  }, [data, onChange]);

  return (
    <div className="w-full">
      <div className="grid grid-cols-3 gap-1.5">
        {data.counters.map((counter) => (
          <CounterItem
            key={counter.id}
            counter={counter}
            editable={editable}
            onValueChange={(val) => handleValueChange(counter.id, val)}
            onNameChange={(name) => handleNameChange(counter.id, name)}
          />
        ))}
      </div>
    </div>
  );
};

interface CounterItemProps {
  counter: CounterItem;
  editable: boolean;
  onValueChange: (value: number) => void;
  onNameChange: (name: string) => void;
}

const CounterItem: React.FC<CounterItemProps> = ({ counter, editable, onValueChange, onNameChange }) => {
  const nameEdit = useInlineEdit({
    value: counter.name,
    onSave: onNameChange,
    editable
  });

  return (
    <div className="bg-slate-600 rounded-lg p-1.5 flex flex-col items-center justify-center relative">
      <div className="text-xs font-medium text-slate-300 mb-1 text-center">
        {nameEdit.isEditing ? (
          <input
            type="text"
            value={nameEdit.editValue}
            onChange={(e) => nameEdit.setEditValue(e.target.value)}
            onBlur={nameEdit.saveEdit}
            onKeyDown={nameEdit.handleKeyDown}
            className="w-full bg-slate-500 text-white px-1 py-0.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-center"
            autoFocus
          />
        ) : (
          <span
            className={`${editable ? 'cursor-pointer hover:text-white' : ''}`}
            onDoubleClick={nameEdit.startEdit}
            title={editable ? "Double-click to rename" : counter.name}
          >
            {counter.name}
          </span>
        )}
      </div>

      <div className="flex items-center justify-center bg-slate-700 rounded w-full py-1">
        {editable ? (
          <input
            type="number"
            value={counter.value}
            onChange={(e) => onValueChange(parseInt(e.target.value) || 0)}
            className="w-full bg-transparent text-white text-base font-semibold text-center focus:outline-none px-2"
            min={0}
          />
        ) : (
          <span className="text-white text-base font-semibold text-center block w-full px-2">
            {counter.value}
          </span>
        )}
      </div>
    </div>
  );
};
