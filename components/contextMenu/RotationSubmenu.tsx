/**
 * Rotation Submenu Component
 * Handles rotation and swing actions
 */

import React from 'react';
import { ContextAction } from '../../types';
import { RotateCw, RotateCcw, Undo } from 'lucide-react';
import { Locale } from '../../utils/translations';

export interface RotationSubmenuProps {
  canPerformAction: (action: ContextAction) => boolean;
  onAction: (action: ContextAction) => void;
  language?: Locale;
}

export const RotationSubmenu: React.FC<RotationSubmenuProps> = ({
  canPerformAction,
  onAction
}) => {
  const t = (key: string) => key; // Simplified

  return (
    <>
      {canPerformAction('rotate') && (
        <button
          onClick={() => onAction('rotate')}
          className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
        >
          <RotateCw size={14} />
          <span>{t('Rotate')}</span>
        </button>
      )}
      {canPerformAction('rotateClockwise') && (
        <button
          onClick={() => onAction('rotateClockwise')}
          className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
        >
          <RotateCw size={14} />
          <span>{t('Clockwise')}</span>
        </button>
      )}
      {canPerformAction('rotateCounterClockwise') && (
        <button
          onClick={() => onAction('rotateCounterClockwise')}
          className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
        >
          <RotateCcw size={14} />
          <span>{t('Counter-Clockwise')}</span>
        </button>
      )}
      {canPerformAction('resetRotation') && (
        <button
          onClick={() => onAction('resetRotation')}
          className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
        >
          <Undo size={14} />
          <span>{t('Reset Rotation')}</span>
        </button>
      )}
    </>
  );
};

export const ROTATION_ACTIONS: ContextAction[] = [
  'rotate',
  'rotateClockwise',
  'rotateCounterClockwise',
  'resetRotation'
];
