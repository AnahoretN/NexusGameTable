import React from 'react';
import { Layers, Lock, Unlock, RefreshCw, Trash2, Copy, RotateCw, ChevronsUpDown, EyeOff } from 'lucide-react';
import { ContextAction } from '../types';

interface ObjectActionButtonsProps {
  obj: any;
  dispatch: (action: any) => void;
  currentTool: string;
}

/**
 * Action button configuration factory
 */
const createButtonConfigs = (obj: any, dispatch: any) => ({
  flip: {
    key: 'flip',
    action: () => dispatch({ type: 'FLIP_CARD', payload: { cardId: obj.id } }),
    className: 'bg-purple-600 hover:bg-purple-500',
    title: 'Flip',
    icon: <EyeOff size={14} />
  },
  rotate: {
    key: 'rotate',
    action: () => dispatch({ type: 'ROTATE_OBJECT', payload: { id: obj.id } }),
    className: 'bg-green-600 hover:bg-green-500',
    title: 'Rotate',
    icon: <RefreshCw size={14} />
  },
  rotateClockwise: {
    key: 'rotateClockwise',
    action: () => dispatch({ type: 'ROTATE_OBJECT', payload: { id: obj.id } }),
    className: 'bg-green-600 hover:bg-green-500',
    title: 'Rotate CW',
    icon: <RefreshCw size={14} />
  },
  rotateCounterClockwise: {
    key: 'rotateCounterClockwise',
    action: () => dispatch({ type: 'ROTATE_OBJECT', payload: { id: obj.id } }),
    className: 'bg-green-600 hover:bg-green-500',
    title: 'Rotate CCW',
    icon: <RotateCw size={14} />
  },
  delete: {
    key: 'delete',
    action: () => dispatch({ type: 'DELETE_OBJECT', payload: { id: obj.id } }),
    className: 'bg-red-600 hover:bg-red-500',
    title: 'Delete',
    icon: <Trash2 size={14} />
  },
  clone: {
    key: 'clone',
    action: () => dispatch({ type: 'CLONE_OBJECT', payload: { id: obj.id } }),
    className: 'bg-cyan-600 hover:bg-cyan-500',
    title: 'Clone',
    icon: <Copy size={14} />
  },
  lock: {
    key: 'lock',
    action: () => dispatch({ type: 'TOGGLE_LOCK', payload: { id: obj.id } }),
    className: 'bg-yellow-600 hover:bg-yellow-500',
    title: obj.locked ? 'Unlock' : 'Lock',
    icon: obj.locked ? <Unlock size={14} /> : <Lock size={14} />
  },
  layer: {
    key: 'layer',
    action: () => dispatch({ type: 'MOVE_LAYER_UP', payload: { id: obj.id } }),
    className: 'bg-indigo-600 hover:bg-indigo-500',
    title: 'Layer Up',
    icon: <Layers size={14} />
  },
  layerUp: {
    key: 'layerUp',
    action: () => dispatch({ type: 'MOVE_LAYER_UP', payload: { id: obj.id } }),
    className: 'bg-blue-600 hover:bg-blue-500',
    title: 'Layer Up',
    icon: <ChevronsUpDown size={14} />
  },
  layerDown: {
    key: 'layerDown',
    action: () => dispatch({ type: 'MOVE_LAYER_DOWN', payload: { id: obj.id } }),
    className: 'bg-blue-600 hover:bg-blue-500',
    title: 'Layer Down',
    icon: <ChevronsUpDown size={14} />
  },
});

/**
 * ObjectActionButtons - renders action buttons for game objects
 * Used by cards, tokens, dice, counters, etc.
 */
export const ObjectActionButtons: React.FC<ObjectActionButtonsProps> = ({ obj, dispatch, currentTool }) => {
  const actionButtons = obj.actionButtons || [];
  const buttonConfigs = createButtonConfigs(obj, dispatch);

  const buttons = actionButtons
    .map((action: ContextAction) => buttonConfigs[action as keyof typeof buttonConfigs])
    .filter(Boolean)
    .slice(0, 4);

  if (buttons.length === 0) return null;

  return (
    <div className={`absolute -bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 opacity-0 transition-opacity z-20 pointer-events-none ${currentTool === 'none' || currentTool === 'zoom' ? 'group-hover:opacity-100' : ''}`}>
      {buttons.map((btn: any) => (
        <button
          key={btn.key}
          onClick={(e) => { e.stopPropagation(); btn.action(); }}
          className={`pointer-events-auto p-2 rounded-lg text-white shadow ${btn.className}`}
          title={btn.title}
        >
          {btn.icon}
        </button>
      ))}
    </div>
  );
};
