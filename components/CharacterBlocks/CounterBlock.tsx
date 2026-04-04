import React, { useState, useCallback } from 'react';
import { CharacterBlock } from '../../types';

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
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [editInput, setEditInput] = useState('');

  const handleValueChange = useCallback((counterId: string, newValue: number) => {
    if (!editable) return;

    const updatedCounters = data.counters.map(counter =>
      counter.id === counterId
        ? { ...counter, value: Math.max(0, newValue) }
        : counter
    );

    onChange({ ...data, counters: updatedCounters });
  }, [data, editable, onChange]);

  const handleStartEditCounterName = useCallback((counterId: string, currentName: string) => {
    if (!editable) return;
    setIsEditing(counterId);
    setEditInput(currentName);
  }, [editable]);

  const handleSaveCounterName = useCallback(() => {
    if (!isEditing) return;

    const newName = editInput.trim() || 'Counter';
    const updatedCounters = data.counters.map(counter =>
      counter.id === isEditing
        ? { ...counter, name: newName }
        : counter
    );

    onChange({ ...data, counters: updatedCounters });
    setIsEditing(null);
    setEditInput('');
  }, [isEditing, editInput, data, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveCounterName();
    } else if (e.key === 'Escape') {
      setIsEditing(null);
      setEditInput('');
    }
  }, [handleSaveCounterName]);

  return (
    <div className="w-full">
      {/* Counters Grid */}
      <div className="grid grid-cols-3 gap-1.5">
        {data.counters.map((counter) => (
          <div
            key={counter.id}
            className="bg-slate-600 rounded-lg p-1.5 flex flex-col items-center justify-center relative"
          >
            {/* Counter Name */}
            {isEditing === counter.id ? (
              <input
                type="text"
                value={editInput}
                onChange={(e) => setEditInput(e.target.value)}
                onBlur={handleSaveCounterName}
                onKeyDown={handleKeyDown}
                className="text-xs font-medium bg-slate-500 text-white px-1 py-0.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 w-full mb-1 text-center"
                autoFocus
              />
            ) : (
              <div
                className={`text-xs font-medium text-slate-300 mb-1 text-center ${editable ? 'cursor-pointer hover:text-white' : ''}`}
                onDoubleClick={() => editable && handleStartEditCounterName(counter.id, counter.name)}
                title={editable ? "Double-click to rename" : counter.name}
              >
                {counter.name}
              </div>
            )}

            {/* Counter Value */}
            <div className="flex items-center justify-center bg-slate-700 rounded w-full py-1">
              {editable ? (
                <input
                  type="number"
                  value={counter.value}
                  onChange={(e) => handleValueChange(counter.id, parseInt(e.target.value) || 0)}
                  className="w-full bg-transparent text-white text-base font-semibold text-center focus:outline-none px-2"
                  min={0}
                />
              ) : (
                <span className="text-white text-base font-semibold text-center block w-full px-2">{counter.value}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};