import React, { useState, useCallback } from 'react';
import { CharacterBlock, TableBlockData, TableColumn, TableRow } from '../../types';
import { SimpleContextMenu } from '../SimpleContextMenu';

interface TableBlockProps {
  block: CharacterBlock;
  editable: boolean;
  onChange: (data: TableBlockData) => void;
}

export const TableBlock: React.FC<TableBlockProps> = ({ block, editable, onChange }) => {
  const data = block.data as TableBlockData;
  const [editingCell, setEditingCell] = useState<{ rowId: string; columnId: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; targetId?: string; targetType?: 'row' | 'column' | 'table' | 'cell'; rowId?: string } | null>(null);

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

  const handleAddRow = useCallback((afterRowId?: string) => {
    if (!editable || !data.addRowAllowed) return;

    const newRow: TableRow = {
      id: `row-${Date.now()}`,
      cells: {}
    };

    // Initialize cells for each column
    data.columns.forEach(col => {
      newRow.cells[col.id] = col.type === 'number' ? 0 : '';
    });

    if (afterRowId) {
      // Insert after the specified row
      const rowIndex = data.rows.findIndex(r => r.id === afterRowId);
      if (rowIndex !== -1) {
        const newRows = [...data.rows];
        newRows.splice(rowIndex + 1, 0, newRow);
        onChange({ ...data, rows: newRows });
        return;
      }
    }

    // Default: add to end
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
      // Insert after the specified column
      const columnIndex = data.columns.findIndex(c => c.id === afterColumnId);
      if (columnIndex !== -1) {
        const newColumns = [...data.columns];
        newColumns.splice(columnIndex + 1, 0, newColumn);
        onChange({ ...data, columns: newColumns });
        return;
      }
    }

    // Default: add to end
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
      // Insert after the specified column
      const columnIndex = data.columns.findIndex(c => c.id === afterColumnId);
      if (columnIndex !== -1) {
        const newColumns = [...data.columns];
        newColumns.splice(columnIndex + 1, 0, newColumn);
        onChange({ ...data, columns: newColumns });
        return;
      }
    }

    // Default: add to end
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

  const handleColumnTitleChange = useCallback((columnId: string, newTitle: string) => {
    const newColumns = data.columns.map(col => {
      if (col.id === columnId) {
        return { ...col, title: newTitle };
      }
      return col;
    });

    onChange({ ...data, columns: newColumns });
  }, [data, onChange]);

  return (
    <div className="w-full">
      {/* Table */}
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
            {data.rows.map((row, rowIndex) => (
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
                  const cellValue = row.cells[column.id];
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
                      {editable && isEditing ? (
                        column.type === 'number' ? (
                          <input
                            type="number"
                            value={String(cellValue || 0)}
                            onChange={(e) => handleCellChange(row.id, column.id, parseFloat(e.target.value) || 0)}
                            onBlur={() => setEditingCell(null)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                setEditingCell(null);
                              }
                            }}
                            className="bg-slate-500 text-white px-1.5 py-0.5 rounded w-full text-sm"
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <input
                            type="text"
                            value={String(cellValue || '')}
                            onChange={(e) => handleCellChange(row.id, column.id, e.target.value)}
                            onBlur={() => setEditingCell(null)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                setEditingCell(null);
                              }
                            }}
                            className="bg-slate-500 text-white px-1.5 py-0.5 rounded w-full text-sm"
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />
                        )
                      ) : (
                        <span
                          className={`block cursor-pointer ${editable ? 'hover:bg-slate-500' : ''}`}
                          onClick={() => {
                            if (editable) {
                              setEditingCell({ rowId: row.id, columnId: column.id });
                            }
                          }}
                        >
                          {cellValue !== undefined && cellValue !== '' ? String(cellValue) : (
                            <span className="text-slate-500 italic">-</span>
                          )}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Empty state */}
      {data.rows.length === 0 && (
        <div className="text-center text-slate-500 py-3 text-sm">
          No rows yet. {editable && 'Right-click for options.'}
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <SimpleContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={
            !contextMenu.targetId
              ? [
                  // Table-level options
                  ...(data.addRowAllowed
                    ? [
                        {
                          name: 'Add Row',
                          action: () => {
                            handleAddRow();
                            setContextMenu(null);
                          }
                        }
                      ]
                    : []),
                  ...(data.addColumnAllowed
                    ? [
                        {
                          name: 'Add Column',
                          action: () => {
                            handleAddColumn();
                            setContextMenu(null);
                          }
                        },
                        {
                          name: 'Add Number Column',
                          action: () => {
                            handleAddNumberColumn();
                            setContextMenu(null);
                          }
                        }
                      ]
                    : []),
                  ...(data.columns.length > 0
                    ? [
                        {
                          name: 'Delete Last Column',
                          action: () => {
                            handleDeleteLastColumn();
                            setContextMenu(null);
                          }
                        }
                      ]
                    : [])
                ]
              : contextMenu.targetType === 'column'
                ? [
                    // Column-level options
                    {
                      name: 'Edit Column Name',
                      action: () => {
                        setEditingCell({ columnId: contextMenu.targetId!, rowId: '' });
                        setContextMenu(null);
                      }
                    },
                    {
                      name: 'Delete Column',
                      action: () => {
                        handleDeleteColumn(contextMenu.targetId!);
                        setContextMenu(null);
                      }
                    },
                    ...(data.addRowAllowed
                      ? [
                          {
                            name: 'Add Row',
                            action: () => {
                              handleAddRow(contextMenu.targetId);
                              setContextMenu(null);
                            }
                          }
                        ]
                      : []),
                    ...(data.addColumnAllowed
                      ? [
                          {
                            name: 'Add Column',
                            action: () => {
                              handleAddColumn(contextMenu.targetId);
                              setContextMenu(null);
                            }
                          },
                          {
                            name: 'Add Number Column',
                            action: () => {
                              handleAddNumberColumn(contextMenu.targetId);
                              setContextMenu(null);
                            }
                          }
                        ]
                      : [])
                  ]
                : contextMenu.targetType === 'cell'
                  ? [
                      // Cell-level options (can delete both row and column)
                      {
                        name: 'Delete Column',
                        action: () => {
                          handleDeleteColumn(contextMenu.targetId!);
                          setContextMenu(null);
                        }
                      },
                      {
                        name: 'Delete Row',
                        action: () => {
                          handleDeleteRow(contextMenu.rowId!);
                          setContextMenu(null);
                        }
                      },
                      ...(data.addRowAllowed
                        ? [
                            {
                              name: 'Add Row',
                              action: () => {
                                handleAddRow(contextMenu.rowId);
                                setContextMenu(null);
                              }
                            }
                          ]
                        : []),
                      ...(data.addColumnAllowed
                        ? [
                            {
                              name: 'Add Column',
                              action: () => {
                                handleAddColumn(contextMenu.targetId);
                                setContextMenu(null);
                              }
                            },
                            {
                              name: 'Add Number Column',
                              action: () => {
                                handleAddNumberColumn(contextMenu.targetId);
                                setContextMenu(null);
                              }
                            }
                          ]
                        : [])
                    ]
                  : [
                      // Row-level options
                      {
                        name: 'Delete Row',
                        action: () => {
                          handleDeleteRow(contextMenu.targetId!);
                          setContextMenu(null);
                        }
                      },
                    ...(data.addRowAllowed
                      ? [
                          {
                            name: 'Add Row',
                            action: () => {
                              handleAddRow(contextMenu.targetId);
                              setContextMenu(null);
                            }
                          }
                        ]
                      : []),
                    ...(data.addColumnAllowed
                      ? [
                          {
                            name: 'Add Column',
                            action: () => {
                              handleAddColumn(contextMenu.targetId);
                              setContextMenu(null);
                            }
                          },
                          {
                            name: 'Add Number Column',
                            action: () => {
                              handleAddNumberColumn(contextMenu.targetId);
                              setContextMenu(null);
                            }
                          }
                        ]
                      : [])
                  ]
          }
        />
      )}
    </div>
  );
};