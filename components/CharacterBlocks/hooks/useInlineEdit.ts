import { useState, useCallback, useEffect, useRef } from 'react';

export interface UseInlineEditOptions<T> {
  value: T;
  onSave: (newValue: T) => void;
  editable?: boolean;
  debounceMs?: number;
  onEnterSave?: boolean;
  onEscapeCancel?: boolean;
}

export function useInlineEdit<T extends string | number>({
  value,
  onSave,
  editable = true,
  debounceMs = 0,
  onEnterSave = true,
  onEscapeCancel = true
}: UseInlineEditOptions<T>) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState<T>(value);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Update edit value when external value changes (not during editing)
  useEffect(() => {
    if (!isEditing) {
      setEditValue(value);
    }
  }, [value, isEditing]);

  const saveEdit = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    if (editValue !== value) {
      onSave(editValue);
    }
    setIsEditing(false);
  }, [editValue, value, onSave]);

  const cancelEdit = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    setIsEditing(false);
    setEditValue(value);
  }, [value]);

  const startEdit = useCallback(() => {
    if (!editable) return;
    setIsEditing(true);
    setEditValue(value);
  }, [editable, value]);

  const handleChange = useCallback((newValue: T) => {
    setEditValue(newValue);

    if (debounceMs > 0) {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        if (newValue !== value) {
          onSave(newValue);
        }
      }, debounceMs);
    }
  }, [debounceMs, value, onSave]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (onEnterSave && e.key === 'Enter') {
      e.preventDefault();
      saveEdit();
    } else if (onEscapeCancel && e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  }, [onEnterSave, onEscapeCancel, saveEdit, cancelEdit]);

  const handleBlur = useCallback(() => {
    if (debounceMs === 0) {
      saveEdit();
    } else {
      setIsEditing(false);
    }
  }, [debounceMs, saveEdit]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    isEditing,
    editValue: String(editValue),
    setEditValue: (val: string) => handleChange(typeof value === 'number' ? (parseFloat(val) || 0) as T : val as T),
    startEdit,
    saveEdit,
    cancelEdit,
    handleKeyDown,
    handleBlur,
    handleChange
  };
}
