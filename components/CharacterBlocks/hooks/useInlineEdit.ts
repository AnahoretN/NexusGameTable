import { useState, useCallback, useEffect, useRef } from 'react';

export interface UseInlineEditOptions<T> {
  value: T;
  onSave: (newValue: T) => void;
  editable?: boolean;
  debounceMs?: number;
  onEnterSave?: boolean;
  onEscapeCancel?: boolean;
  isNumberColumn?: boolean;
}

export function useInlineEdit<T extends string | number>({
  value,
  onSave,
  editable = true,
  debounceMs = 0,
  onEnterSave = true,
  onEscapeCancel = true,
  isNumberColumn = false
}: UseInlineEditOptions<T>) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState<T>(value);
  const [userInteracted, setUserInteracted] = useState(false);
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

    // For number columns, convert string to number before saving
    let valueToSave = editValue;
    if (isNumberColumn && typeof editValue === 'string') {
      if (editValue === '' || editValue === '-') {
        // Empty field means keep original value (don't save)
        setIsEditing(false);
        setUserInteracted(false);
        return;
      }
      const parsed = parseFloat(editValue);
      valueToSave = (Number.isNaN(parsed) ? 0 : parsed) as T;
    }

    // For number columns, always convert undefined/empty to 0 for comparison
    const originalValue = (isNumberColumn && (value === '' || value === undefined)) ? 0 as T : value;

    if (valueToSave !== originalValue) {
      onSave(valueToSave);
    } else if (userInteracted && isNumberColumn && (value === '' || value === undefined) && valueToSave === 0) {
      // Special case: convert undefined/empty to 0 when user interacted
      onSave(0 as T);
    }
    setIsEditing(false);
    setUserInteracted(false);
  }, [editValue, value, onSave, isNumberColumn, userInteracted]);

  const cancelEdit = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    setIsEditing(false);
    setEditValue(value);
    setUserInteracted(false);
  }, [value]);

  const startEdit = useCallback(() => {
    if (!editable) return;
    setIsEditing(true);
    setEditValue(value);
    setUserInteracted(false);
  }, [editable, value]);

  const handleChange = useCallback((newValue: T | string) => {
    setEditValue(newValue as T);
    // Mark that user has interacted with the input
    setUserInteracted(true);

    if (debounceMs > 0) {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        if (isNumberColumn && typeof newValue === 'string') {
          // Convert string to number for debounced save
          const parsed = parseFloat(newValue);
          const numValue = (Number.isNaN(parsed) ? 0 : parsed) as T;
          if (numValue !== value) {
            onSave(numValue);
          }
        } else if (newValue !== value) {
          onSave(newValue as T);
        }
      }, debounceMs);
    }
  }, [debounceMs, value, onSave, isNumberColumn]);

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
    setEditValue: (val: string) => {
      // For number columns, keep as string during editing (will convert on save)
      // For text columns, use as-is
      handleChange(val as T);
    },
    startEdit,
    saveEdit,
    cancelEdit,
    handleKeyDown,
    handleBlur,
    handleChange
  };
}
