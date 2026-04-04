/**
 * Object Management Component
 * Handles object manipulation actions (delete, clone, lock, etc.)
 */

import React from 'react';
import { ContextAction, TableObject } from '../../types';
import { Lock, Unlock, Copy, Trash2, Pin, Eye, EyeOff, Settings } from 'lucide-react';
import { Locale } from '../../utils/translations';

export interface ObjectManagementProps {
  object: TableObject;
  canPerformAction: (action: ContextAction) => boolean;
  onAction: (action: ContextAction) => void;
  language?: Locale;
}

export const ObjectManagement: React.FC<ObjectManagementProps> = ({
  object,
  canPerformAction,
  onAction,
  language = 'en'
}) => {
  const t = (key: string) => key; // Simplified

  return (
    <>
      {/* Configure */}
      {canPerformAction('configure') && (
        <button
          onClick={() => onAction('configure')}
          className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
        >
          <Settings size={14} />
          <span>{t('Configure')}</span>
        </button>
      )}

      {/* Lock/Unlock */}
      {canPerformAction('lock') && (
        <button
          onClick={() => onAction('lock')}
          className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
        >
          {object.locked ? <Unlock size={14} /> : <Lock size={14} />}
          <span>{object.locked ? t('Unlock') : t('Lock')}</span>
        </button>
      )}

      {/* Pin/Unpin */}
      {canPerformAction('pin') && (
        <button
          onClick={() => onAction('pin')}
          className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
        >
          <Pin size={14} />
          <span>{(object as any).pinnedToViewport ? t('Unpin') : t('Pin')}</span>
        </button>
      )}

      {/* Show/Hide */}
      {canPerformAction('show') && canPerformAction('hide') && (
        <button
          onClick={() => onAction((object as any).isPinnedToViewport ? 'show' : 'hide')}
          className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
        >
          {(object as any).isPinnedToViewport ? <EyeOff size={14} /> : <Eye size={14} />}
          <span>{(object as any).isPinnedToViewport ? t('Show') : t('Hide')}</span>
        </button>
      )}

      {/* Clone */}
      {canPerformAction('clone') && (
        <button
          onClick={() => onAction('clone')}
          className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
        >
          <Copy size={14} />
          <span>{t('Clone')}</span>
        </button>
      )}

      {/* Delete */}
      {canPerformAction('delete') && (
        <button
          onClick={() => onAction('delete')}
          className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-red-600 hover:bg-opacity-80 transition-colors text-red-200"
        >
          <Trash2 size={14} />
          <span>{t('Delete')}</span>
        </button>
      )}
    </>
  );
};

export const OBJECT_MANAGEMENT_ACTIONS: ContextAction[] = [
  'configure',
  'lock',
  'pin',
  'show',
  'hide',
  'clone',
  'delete'
];

/**
 * Check if object has any management actions available
 */
export function hasManagementActions(
  object: TableObject,
  canPerformAction: (action: ContextAction) => boolean
): boolean {
  return OBJECT_MANAGEMENT_ACTIONS.some(action => canPerformAction(action));
}
