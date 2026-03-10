import { t as translate, Locale } from '../utils/translations';
import React from 'react';
import { createPortal } from 'react-dom';
import { HyperscaleLayer, AppLanguage } from '../types';
import { useGame } from '../store/GameContext';
import { X, Check, Palette, Trash2 } from 'lucide-react';

interface HyperscaleLayerSettingsWindowProps {
  layer: HyperscaleLayer;
  onClose: () => void;
  language?: AppLanguage;
}

/**
 * Modal for editing hyperscale layer settings
 * Allows GM to configure layer name, z-index range, color, and player permissions
 */
export const HyperscaleLayerSettingsWindow: React.FC<HyperscaleLayerSettingsWindowProps> = ({
  layer,
  onClose,
  language = 'en'
}) => {
  const { state, dispatch } = useGame();

  // Check if there are objects on this layer
  const hasObjects = Object.values(state.objects).some(
    obj => obj.hyperscaleLayerId === layer.id
  );

  const [name, setName] = React.useState(layer.name);
  const [minZIndex, setMinZIndex] = React.useState(layer.minZIndex);
  const [maxZIndex, setMaxZIndex] = React.useState(layer.maxZIndex);
  const [color, setColor] = React.useState(layer.color);
  const [playerCanSelect, setPlayerCanSelect] = React.useState(layer.playerCanSelect);
  const [playerCanView, setPlayerCanView] = React.useState(layer.playerCanView);
  const [individualPosition, setIndividualPosition] = React.useState(layer.individualPosition ?? false);
  const [individualObjects, setIndividualObjects] = React.useState(layer.individualObjects ?? false);
  const [zoomEnabled, setZoomEnabled] = React.useState(layer.zoomEnabled ?? true);
  const [error, setError] = React.useState<string | null>(null);

  const validateRange = (min: number, max: number): string | null => {
    if (min < 1 || max < 1) {
      return translate('Min Z', language as Locale) + ' must be at least 1';
    }
    if (min > 10000 || max > 10000) {
      return translate('Max Z', language as Locale) + ' cannot exceed 10000';
    }
    if (min >= max) {
      return translate('Min Z', language as Locale) + ' must be less than ' + translate('Max Z', language as Locale);
    }

    // Check for overlap with other layers
    const hasOverlap = state.hyperscaleLayers.some(l => {
      if (l.id === layer.id) return false; // Skip self
      return (
        (min >= l.minZIndex && min <= l.maxZIndex) ||
        (max >= l.minZIndex && max <= l.maxZIndex) ||
        (min <= l.minZIndex && max >= l.maxZIndex)
      );
    });

    if (hasOverlap) {
      return 'Layer range cannot overlap with existing layers';
    }

    return null;
  };

  const handleSave = () => {
    // Validate
    const validationError = validateRange(minZIndex, maxZIndex);
    if (validationError) {
      setError(validationError);
      return;
    }

    dispatch({
      type: 'UPDATE_HYPERSCALE_LAYER',
      payload: {
        layerId: layer.id,
        updates: {
          name,
          minZIndex,
          maxZIndex,
          color,
          playerCanSelect,
          playerCanView,
          individualPosition,
          individualObjects,
          zoomEnabled
        }
      }
    });

    onClose();
  };

  const handleDelete = () => {
    if (hasObjects) {
      alert(translate('Cannot delete layer with objects', language as Locale));
      return;
    }

    if (confirm(translate('Delete this layer?', language as Locale))) {
      dispatch({ type: 'DELETE_HYPERSCALE_LAYER', payload: { layerId: layer.id } });
      onClose();
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70">
      <div className="bg-slate-800 rounded-lg shadow-xl w-[450px] border border-slate-700 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center py-3 px-4 border-b border-slate-700">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Palette size={18} className="text-purple-400" />
            {translate('Layer Settings', language as Locale)}: {layer.name}
          </h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-700 rounded text-gray-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Error message */}
          {error && (
            <div className="p-2 bg-red-900/50 border border-red-700 rounded text-red-200 text-xs">
              {error}
            </div>
          )}

          {/* Layer Name with Color Picker */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-400 mb-1">
                {translate('Layer Name', language as Locale)}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-700 text-white text-sm px-3 py-2 rounded border border-slate-600 focus:border-purple-500 focus:outline-none"
              />
            </div>
            <div className="flex-shrink-0">
              <label className="block text-xs font-medium text-gray-400 mb-1">
                {translate('Color', language as Locale)}
              </label>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-10 h-10 bg-slate-900 border border-slate-700 rounded cursor-pointer"
                title={translate('Color', language as Locale)}
              />
            </div>
          </div>

          {/* Z-Index Range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">
                {translate('Min Z', language as Locale)}
              </label>
              <input
                type="number"
                min="1"
                max="10000"
                value={minZIndex}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setMinZIndex(val);
                  setError(validateRange(val, maxZIndex));
                }}
                className="w-full bg-slate-700 text-white text-sm px-3 py-2 rounded border border-slate-600 focus:border-purple-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">
                {translate('Max Z', language as Locale)}
              </label>
              <input
                type="number"
                min="1"
                max="10000"
                value={maxZIndex}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setMaxZIndex(val);
                  setError(validateRange(minZIndex, val));
                }}
                className="w-full bg-slate-700 text-white text-sm px-3 py-2 rounded border border-slate-600 focus:border-purple-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Layer Settings */}
          <div className="pt-2 border-t border-slate-700">
            <h4 className="text-xs font-bold text-gray-300 mb-3">{translate('Layer Settings', language as Locale)}</h4>
            <div className="grid grid-cols-2 gap-2">
              {/* Player Can Select */}
              <label className="flex items-center justify-between bg-slate-900 rounded px-3 py-2 cursor-pointer">
                <span className="text-xs text-gray-300">{translate('Players can select this layer', language as Locale)}</span>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setPlayerCanSelect(!playerCanSelect);
                  }}
                  className={`w-10 h-5 rounded-full transition-colors ${
                    playerCanSelect ? 'bg-green-600' : 'bg-slate-700'
                  }`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                    playerCanSelect ? 'translate-x-5' : 'translate-x-0.5'
                  }`} />
                </button>
              </label>

              {/* Player Can View */}
              <label className="flex items-center justify-between bg-slate-900 rounded px-3 py-2 cursor-pointer">
                <span
                  className="text-xs text-gray-300 leading-tight"
                  dangerouslySetInnerHTML={{ __html: translate('Players can see in context menu', language as Locale) }}
                />
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setPlayerCanView(!playerCanView);
                  }}
                  className={`w-10 h-5 rounded-full transition-colors ${
                    playerCanView ? 'bg-green-600' : 'bg-slate-700'
                  }`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                    playerCanView ? 'translate-x-5' : 'translate-x-0.5'
                  }`} />
                </button>
              </label>

              {/* Individual Position */}
              <label className="flex items-center justify-between bg-slate-900 rounded px-3 py-2 cursor-pointer">
                <span className="text-xs text-gray-300">{translate('Individual Position', language as Locale)}</span>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIndividualPosition(!individualPosition);
                  }}
                  className={`w-10 h-5 rounded-full transition-colors ${
                    individualPosition ? 'bg-green-600' : 'bg-slate-700'
                  }`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                    individualPosition ? 'translate-x-5' : 'translate-x-0.5'
                  }`} />
                </button>
              </label>

              {/* Individual Objects */}
              <label className="flex items-center justify-between bg-slate-900 rounded px-3 py-2 cursor-pointer">
                <span className="text-xs text-gray-300">{translate('Individual Objects', language as Locale)}</span>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIndividualObjects(!individualObjects);
                  }}
                  className={`w-10 h-5 rounded-full transition-colors ${
                    individualObjects ? 'bg-green-600' : 'bg-slate-700'
                  }`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                    individualObjects ? 'translate-x-5' : 'translate-x-0.5'
                  }`} />
                </button>
              </label>

              {/* Zoom Enabled */}
              <label className="flex items-center justify-between bg-slate-900 rounded px-3 py-2 cursor-pointer col-span-2">
                <span className="text-xs text-gray-300">{translate('Affected by zoom', language as Locale) ?? 'Affected by zoom'}</span>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setZoomEnabled(!zoomEnabled);
                  }}
                  className={`w-10 h-5 rounded-full transition-colors ${
                    zoomEnabled ? 'bg-green-600' : 'bg-slate-700'
                  }`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                    zoomEnabled ? 'translate-x-5' : 'translate-x-0.5'
                  }`} />
                </button>
              </label>
            </div>

            {/* Info text for individual settings */}
            {(individualPosition || individualObjects) && (
              <div className="mt-3 p-2 bg-slate-700/50 border border-slate-600 rounded text-xs text-gray-400">
                {individualObjects
                  ? translate('Objects in this layer are individual for each player.', language as Locale)
                  : translate('Object positions in this layer are individual for each player.', language as Locale)
                }
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-2 p-4 border-t border-slate-700">
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded transition-colors"
            >
              {translate('Cancel', language as Locale)}
            </button>
            <button
              onClick={handleSave}
              disabled={!!error}
              className={`flex-1 py-2 text-white text-sm font-medium rounded transition-colors flex items-center justify-center gap-2 ${
                error
                  ? 'bg-slate-700 cursor-not-allowed opacity-50'
                  : 'bg-purple-600 hover:bg-purple-500'
              }`}
            >
              <Check size={16} />
              {translate('Save Changes', language as Locale)}
            </button>
          </div>
          <button
            onClick={handleDelete}
            disabled={hasObjects}
            className={`w-full py-2 text-white text-sm font-medium rounded transition-colors flex items-center justify-center gap-2 ${
              hasObjects
                ? 'bg-slate-800 cursor-not-allowed opacity-50'
                : 'bg-red-600 hover:bg-red-500'
            }`}
            title={hasObjects ? translate('Cannot delete layer with objects', language as Locale) : undefined}
          >
            <Trash2 size={16} />
            {translate('Delete Layer', language as Locale)}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
