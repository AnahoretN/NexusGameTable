import React, { useCallback, useState } from 'react';
import { CharacterBlock, TableBlockData, TableColumn, TableRow } from '../../types';
import { useTableEditing } from './hooks/useTableEditing';
import { TableCell } from './components/TableCell';
import { TableContextMenu, ContextMenuState } from './components/TableContextMenu';

interface TableBlockProps {
  block: CharacterBlock;
  editable: boolean;
  onChange: (data: TableBlockData) => void;
}

export const TableBlock: React.FC<TableBlockProps> = ({ block, editable, onChange }) => {
  const data = block.data as TableBlockData;
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const { editingCell, setEditingCell, handleCellChange, handleColumnTitleChange } = useTableEditing({
    data,
    onChange
  });

  const handleAddRow = useCallback((afterRowId?: string) => {
    if (!editable || !data.addRowAllowed) return;

    const newRow: TableRow = {
      id: `row-${Date.now()}`,
      cells: {}
    };

    data.columns.forEach(col => {
      newRow.cells[col.id] = col.type === 'number' ? 0 : '';
    });

    if (afterRowId) {
      const rowIndex = data.rows.findIndex(r => r.id === afterRowId);
      if (rowIndex !== -1) {
        const newRows = [...data.rows];
        newRows.splice(rowIndex + 1, 0, newRow);
        onChange({ ...data, rows: newRows });
        return;
      }
    }

    onChange({ ...data, rows: [...data.rows, newRow] });
  }, [data, editable, onChange]);

  const handleDeleteRow = useCallback((rowId: string) => {
    if (!editable) return;

    onChange({
      ...data,
      rows: data.rows.filter(row => row.id !== rowId)
    });
  }, [data, editable, onChange]);

  const handleAddColumn = useCallback((afterColumnId?: string) => {
    if (!editable || !data.addColumnAllowed) return;

    const newColumn: TableColumn = {
      id: `col-${Date.now()}`,
      title: 'New Column',
      width: 100,
      type: 'text'
    };

    if (afterColumnId) {
      const columnIndex = data.columns.findIndex(c => c.id === afterColumnId);
      if (columnIndex !== -1) {
        const newColumns = [...data.columns];
        newColumns.splice(columnIndex + 1, 0, newColumn);
        onChange({ ...data, columns: newColumns });
        return;
      }
    }

    onChange({
      ...data,
      columns: [...data.columns, newColumn]
    });
  }, [data, editable, onChange]);

  const handleAddNumberColumn = useCallback((afterColumnId?: string) => {
    if (!editable || !data.addColumnAllowed) return;

    const newColumn: TableColumn = {
      id: `col-${Date.now()}`,
      title: 'Numbers',
      width: 80,
      type: 'number'
    };

    if (afterColumnId) {
      const columnIndex = data.columns.findIndex(c => c.id === afterColumnId);
      if (columnIndex !== -1) {
        const newColumns = [...data.columns];
        newColumns.splice(columnIndex + 1, 0, newColumn);
        onChange({ ...data, columns: newColumns });
        return;
      }
    }

    onChange({
      ...data,
      columns: [...data.columns, newColumn]
    });
  }, [data, editable, onChange]);

  const handleDeleteColumn = useCallback((columnId: string) => {
    if (!editable) return;

    onChange({
      ...data,
      columns: data.columns.filter(col => col.id !== columnId),
      rows: data.rows.map(row => ({
        ...row,
        cells: Object.fromEntries(
          Object.entries(row.cells).filter(([key]) => key !== columnId)
        )
      }))
    });
  }, [data, editable, onChange]);

  const handleDeleteLastColumn = useCallback(() => {
    if (!editable || data.columns.length === 0) return;

    const lastColumn = data.columns[data.columns.length - 1];
    handleDeleteColumn(lastColumn.id);
  }, [data, editable, handleDeleteColumn]);

  return (
    <div className="w-full">
      <div
        className="overflow-x-auto"
        onContextMenu={(e) => {
          if (!editable) return;
          e.preventDefault();
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          setContextMenu({
            x: rect.left,
            y: rect.top + 10
          });
        }}
      >
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {data.columns.map(column => (
                <th
                  key={column.id}
                  className="border border-slate-500 px-2 py-1 text-left text-sm font-medium text-slate-200 bg-slate-700"
                  style={{ width: column.width }}
                  onContextMenu={(e) => {
                    if (!editable) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    setContextMenu({
                      x: rect.left,
                      y: rect.bottom + 5,
                      targetId: column.id,
                      targetType: 'column'
                    });
                  }}
                >
                  {editable && editingCell?.columnId === column.id && !editingCell?.rowId ? (
                    <input
                      type="text"
                      value={column.title}
                      onChange={(e) => handleColumnTitleChange(column.id, e.target.value)}
                      onBlur={() => setEditingCell(null)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setEditingCell(null);
                        }
                      }}
                      className="bg-slate-600 text-white px-1.5 py-0.5 rounded w-full text-sm"
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span
                      className={`cursor-pointer ${editable ? 'hover:text-white' : ''}`}
                      onClick={() => {
                        if (editable) {
                          setEditingCell({ columnId: column.id, rowId: '' });
                        }
                      }}
                    >
                      {column.title}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr
                key={row.id}
                onContextMenu={(e) => {
                  if (!editable) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  setContextMenu({
                    x: rect.left,
                    y: rect.bottom + 5,
                    targetId: row.id,
                    targetType: 'row'
                  });
                }}
              >
                {data.columns.map(column => {
                  const isEditing = editingCell?.rowId === row.id && editingCell?.columnId === column.id;

                  return (
                    <td
                      key={column.id}
                      className="border border-slate-500 px-2 py-1 text-sm text-slate-200 bg-slate-600"
                      onContextMenu={(e) => {
                        if (!editable) return;
                        e.preventDefault();
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        setContextMenu({
                          x: rect.left,
                          y: rect.bottom + 5,
                          targetId: column.id,
                          rowId: row.id,
                          targetType: 'cell'
                        });
                      }}
                    >
                      <TableCell
                        columnId={column.id}
                        column={column}
                        value={row.cells[column.id]}
                        isEditing={isEditing}
                        editable={editable}
                        onEdit={() => editable && setEditingCell({ rowId: row.id, columnId: column.id })}
                        onChange={(value) => handleCellChange(row.id, column.id, value)}
                        onBlur={() => setEditingCell(null)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.rows.length === 0 && (
        <div className="text-center text-slate-500 py-3 text-sm">
          No rows yet. {editable && 'Right-click for options.'}
        </div>
      )}

      <TableContextMenu
        contextMenu={contextMenu}
        data={data}
        onClose={() => setContextMenu(null)}
        onAddRow={handleAddRow}
        onDeleteRow={handleDeleteRow}
        onAddColumn={handleAddColumn}
        onAddNumberColumn={handleAddNumberColumn}
        onDeleteColumn={handleDeleteColumn}
        onDeleteLastColumn={handleDeleteLastColumn}
        onEditColumnName={(columnId) => setEditingCell({ columnId, rowId: '' })}
      />
    </div>
  );
};
