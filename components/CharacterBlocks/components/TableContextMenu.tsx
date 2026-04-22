import React from 'react';
import { SimpleContextMenu } from '../../SimpleContextMenu';
import { TableBlockData } from '../../../types';

export interface ContextMenuState {
  x: number;
  y: number;
  targetId?: string;
  targetType?: 'row' | 'column' | 'table' | 'cell';
  rowId?: string;
}

interface TableContextMenuProps {
  contextMenu: ContextMenuState | null;
  data: TableBlockData;
  onClose: () => void;
  onAddRow: (afterRowId?: string) => void;
  onDeleteRow: (rowId: string) => void;
  onAddColumn: (afterColumnId?: string) => void;
  onAddNumberColumn: (afterColumnId?: string) => void;
  onDeleteColumn: (columnId: string) => void;
  onDeleteLastColumn: () => void;
  onEditColumnName: (columnId: string) => void;
}

export const TableContextMenu: React.FC<TableContextMenuProps> = ({
  contextMenu,
  data,
  onClose,
  onAddRow,
  onDeleteRow,
  onAddColumn,
  onAddNumberColumn,
  onDeleteColumn,
  onDeleteLastColumn,
  onEditColumnName
}) => {
  if (!contextMenu) return null;

  const getItems = () => {
    const { targetId, targetType, rowId } = contextMenu;

    if (!targetId) {
      return [
        ...(data.addRowAllowed ? [{ name: 'Add Row', action: () => { onAddRow(); onClose(); } }] : []),
        ...(data.addColumnAllowed ? [
          { name: 'Add Column', action: () => { onAddColumn(); onClose(); } },
          { name: 'Add Number Column', action: () => { onAddNumberColumn(); onClose(); } }
        ] : []),
        ...(data.columns.length > 0 ? [{ name: 'Delete Last Column', action: () => { onDeleteLastColumn(); onClose(); } }] : [])
      ];
    }

    if (targetType === 'column') {
      return [
        { name: 'Edit Column Name', action: () => { onEditColumnName(targetId); onClose(); } },
        { name: 'Delete Column', action: () => { onDeleteColumn(targetId); onClose(); } },
        ...(data.addRowAllowed ? [{ name: 'Add Row', action: () => { onAddRow(targetId); onClose(); } }] : []),
        ...(data.addColumnAllowed ? [
          { name: 'Add Column', action: () => { onAddColumn(targetId); onClose(); } },
          { name: 'Add Number Column', action: () => { onAddNumberColumn(targetId); onClose(); } }
        ] : [])
      ];
    }

    if (targetType === 'cell') {
      return [
        { name: 'Delete Column', action: () => { onDeleteColumn(targetId); onClose(); } },
        { name: 'Delete Row', action: () => { onDeleteRow(rowId!); onClose(); } },
        ...(data.addRowAllowed ? [{ name: 'Add Row', action: () => { onAddRow(rowId); onClose(); } }] : []),
        ...(data.addColumnAllowed ? [
          { name: 'Add Column', action: () => { onAddColumn(targetId); onClose(); } },
          { name: 'Add Number Column', action: () => { onAddNumberColumn(targetId); onClose(); } }
        ] : [])
      ];
    }

    // Row-level options
    return [
      { name: 'Delete Row', action: () => { onDeleteRow(targetId); onClose(); } },
      ...(data.addRowAllowed ? [{ name: 'Add Row', action: () => { onAddRow(targetId); onClose(); } }] : []),
      ...(data.addColumnAllowed ? [
        { name: 'Add Column', action: () => { onAddColumn(targetId); onClose(); } },
        { name: 'Add Number Column', action: () => { onAddNumberColumn(targetId); onClose(); } }
      ] : [])
    ];
  };

  return (
    <SimpleContextMenu
      x={contextMenu.x}
      y={contextMenu.y}
      onClose={onClose}
      items={getItems()}
    />
  );
};
