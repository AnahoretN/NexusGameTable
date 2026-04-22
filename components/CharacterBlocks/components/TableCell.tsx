import React from 'react';
import { TableColumn } from '../../../types';
import { useInlineEdit } from '../hooks';

interface TableCellProps {
  columnId: string;
  column: TableColumn;
  value: string | number | undefined;
  isEditing: boolean;
  editable: boolean;
  onEdit: () => void;
  onChange: (value: string | number) => void;
  onBlur: () => void;
}

export const TableCell: React.FC<TableCellProps> = ({
  column,
  value,
  isEditing,
  editable,
  onEdit,
  onChange,
  onBlur
}) => {
  const edit = useInlineEdit({
    value: (value ?? (column.type === 'number' ? 0 : '')) as string | number,
    onSave: onChange,
    editable: editable && isEditing,
    onEnterSave: true,
    onEscapeCancel: false
  });

  if (editable && isEditing) {
    return column.type === 'number' ? (
      <input
        type="number"
        value={edit.editValue}
        onChange={(e) => edit.setEditValue(e.target.value)}
        onBlur={onBlur}
        onKeyDown={edit.handleKeyDown}
        className="bg-slate-500 text-white px-1.5 py-0.5 rounded w-full text-sm"
        autoFocus
        onClick={(e) => e.stopPropagation()}
      />
    ) : (
      <input
        type="text"
        value={edit.editValue}
        onChange={(e) => edit.setEditValue(e.target.value)}
        onBlur={onBlur}
        onKeyDown={edit.handleKeyDown}
        className="bg-slate-500 text-white px-1.5 py-0.5 rounded w-full text-sm"
        autoFocus
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <span
      className={`block cursor-pointer ${editable ? 'hover:bg-slate-500' : ''}`}
      onClick={onEdit}
    >
      {value !== undefined && value !== '' ? String(value) : (
        <span className="text-slate-500 italic">-</span>
      )}
    </span>
  );
};
