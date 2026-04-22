import { useCallback, useState } from 'react';
import { TableBlockData } from '../../../types';

interface EditingCell {
  rowId: string;
  columnId: string;
}

interface UseTableEditingProps {
  data: TableBlockData;
  onChange: (data: TableBlockData) => void;
}

export function useTableEditing({ data, onChange }: UseTableEditingProps) {
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);

  const handleCellChange = useCallback((rowId: string, columnId: string, value: string | number) => {
    const newRows = data.rows.map(row => {
      if (row.id === rowId) {
        return {
          ...row,
          cells: {
            ...row.cells,
            [columnId]: value
          }
        };
      }
      return row;
    });

    onChange({ ...data, rows: newRows });
  }, [data, onChange]);

  const handleColumnTitleChange = useCallback((columnId: string, newTitle: string) => {
    const newColumns = data.columns.map(col => {
      if (col.id === columnId) {
        return { ...col, title: newTitle };
      }
      return col;
    });

    onChange({ ...data, columns: newColumns });
  }, [data, onChange]);

  return {
    editingCell,
    setEditingCell,
    handleCellChange,
    handleColumnTitleChange
  };
}
