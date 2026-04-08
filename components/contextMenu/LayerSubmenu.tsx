/**
 * Layer Submenu Component
 * Handles layer manipulation actions (bring to front, send to back, etc.)
 */

import React from 'react';
import { ContextAction } from '../../types';
import { ChevronsUp, ChevronsDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Locale } from '../../utils/translations';

export interface LayerSubmenuProps {
  canPerformAction: (action: ContextAction) => boolean;
  onAction: (action: ContextAction) => void;
  language?: Locale;
}

export const LayerSubmenu: React.FC<LayerSubmenuProps> = ({
  canPerformAction,
  onAction
}) => {
  const t = (key: string) => key; // Simplified - would use actual translate function

  return (
    <>
      {canPerformAction('bringToFront') && (
        <button
          onClick={() => onAction('bringToFront')}
          className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
        >
          <ChevronsUp size={14} />
          <span>{t('Bring to Front')}</span>
        </button>
      )}
      {canPerformAction('sendToBack') && (
        <button
          onClick={() => onAction('sendToBack')}
          className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
        >
          <ChevronsDown size={14} />
          <span>{t('Send to Back')}</span>
        </button>
      )}
      {canPerformAction('layerUp') && (
        <button
          onClick={() => onAction('layerUp')}
          className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
        >
          <ArrowUp size={14} />
          <span>{t('Layer Up')}</span>
        </button>
      )}
      {canPerformAction('layerDown') && (
        <button
          onClick={() => onAction('layerDown')}
          className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
        >
          <ArrowDown size={14} />
          <span>{t('Layer Down')}</span>
        </button>
      )}
    </>
  );
};

export const LAYER_ACTIONS: ContextAction[] = [
  'bringToFront',
  'sendToBack',
  'layerUp',
  'layerDown'
];
