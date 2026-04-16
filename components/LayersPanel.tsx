import React, { useState } from 'react';
import { useGame } from '../store/GameContext';
import { useIsGM, useHyperscaleLayers, useLayerSelection } from '../store/contexts';
import { HyperscaleLayer } from '../types';
import { Plus, Trash2, Settings } from 'lucide-react';
import { Locale, t as translate } from '../utils/translations';

interface LayersPanelProps {
  language: string | Locale;
}

export const LayersPanel: React.FC<LayersPanelProps> = ({ language }) => {
  const { state, dispatch } = useGame();
  const isGM = useIsGM();
  const hyperscaleLayers = useHyperscaleLayers();
  const [selectedHyperscaleLayerIds, setLayerSelection] = useLayerSelection();

  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [newLayerName, setNewLayerName] = useState('');
  const [newLayerMin, setNewLayerMin] = useState(1);
  const [newLayerMax, setNewLayerMax] = useState(1000);

  // Sort layers by reverse order (higher maxZIndex = higher in list)
  const sortedLayers = [...hyperscaleLayers].sort((a, b) => b.maxZIndex - a.maxZIndex);

  // Check if a layer is selected
  const isLayerSelected = (layerId: string) => selectedHyperscaleLayerIds.includes(layerId);

  // Toggle layer selection
  const toggleLayer = (layerId: string) => {
    const isSelected = isLayerSelected(layerId);
    const layer = hyperscaleLayers.find(l => l.id === layerId);
    if (isSelected) {
      // Don't allow deselecting all layers
      if (selectedHyperscaleLayerIds.length > 1) {
        const newSelection = selectedHyperscaleLayerIds.filter(id => id !== layerId);
        setLayerSelection(newSelection);
      }
    } else {
      const newSelection = [...selectedHyperscaleLayerIds, layerId];
      setLayerSelection(newSelection);
    }
  };

  // Check if layer can be selected by current user
  const canSelectLayer = (layer: HyperscaleLayer) => {
    if (isGM) return true;
    return layer.playerCanSelect;
  };

  // Check if layer is visible in context menu
  const isLayerVisibleInContextMenu = (layer: HyperscaleLayer) => {
    if (isGM) return true;
    return layer.playerCanView;
  };

  // Add new hyperscale layer
  const addNewLayer = () => {
    if (!newLayerName.trim()) return;

    // Find the highest maxZIndex and lowest minZIndex to determine position
    const maxMaxZ = Math.max(...sortedLayers.map(l => l.maxZIndex));

    // Default to placing above highest layer
    const newLayerMin = maxMaxZ + 1;
    const newLayerMax = maxMaxZ + 1000;

    // Clamp to valid range
    const clampedMinZ = Math.max(1, Math.min(10000, newLayerMin));
    const clampedMaxZ = Math.max(1, Math.min(10000, newLayerMax));

    if (clampedMinZ >= clampedMaxZ) {
      alert('Invalid range: minimum must be less than maximum');
      return;
    }

    // Check for overlap with existing layers
    const hasOverlap = sortedLayers.some(l =>
      (clampedMinZ >= l.minZIndex && clampedMinZ <= l.maxZIndex) ||
      (clampedMaxZ >= l.minZIndex && clampedMaxZ <= l.maxZIndex) ||
      (clampedMinZ <= l.minZIndex && clampedMaxZ >= l.maxZIndex)
    );

    if (hasOverlap) {
      alert('Layer range cannot overlap with existing layers');
      return;
    }

    // Find the appropriate order (after the layer that's below this one)
    const order = sortedLayers.length;

    // Generate a color for the new layer
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
    const color = colors[sortedLayers.length % colors.length];

    dispatch({
      type: 'ADD_HYPERSCALE_LAYER',
      payload: {
        name: newLayerName,
        minZIndex: clampedMinZ,
        maxZIndex: clampedMaxZ,
        color,
        playerCanSelect: true,
        playerCanView: true,
        individualPosition: false,
        individualObjects: false,
        zoomEnabled: true,
        order
      }
    });

    setNewLayerName('');
    setNewLayerMin(maxMaxZ + 1);
    setNewLayerMax(maxMaxZ + 1000);
    setEditingLayerId(null);
  };

  // Delete layer
  const deleteLayer = (layerId: string) => {
    // Check if there are objects on this layer
    const hasObjects = Object.values(state.objects).some(
      obj => obj.hyperscaleLayerId === layerId
    );

    if (hasObjects) {
      alert(translate('Cannot delete layer with objects', language as Locale));
      return;
    }

    if (confirm(translate('Delete this layer?', language as Locale))) {
      dispatch({ type: 'DELETE_HYPERSCALE_LAYER', payload: { layerId } });
    }
  };

  // Open settings modal for layer
  const openLayerSettings = (layerId: string) => {
    // Open a window for layer settings
    dispatch({
      type: 'CREATE_WINDOW',
      payload: {
        windowType: 'HYPERSCALE_LAYER_SETTINGS' as any,
        title: translate('Layer Settings', language as Locale) + ': ' + hyperscaleLayers.find(l => l.id === layerId)?.name,
        targetLayerId: layerId
      }
    });
  };

  return (
    <div className="flex flex-col h-full p-3 min-h-0">
      {/* Header with title and add button */}
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <h4 className="text-xs font-bold text-gray-400 uppercase flex-1">
          {translate('Layers', language as Locale)}
        </h4>
        {isGM && (
          <button
            onClick={() => setEditingLayerId('new')}
            className="p-1 hover:bg-slate-700 rounded text-gray-400 hover:text-white transition-colors"
            title={translate('Add Layer', language as Locale)}
          >
            <Plus size={14} />
          </button>
        )}
      </div>

      {/* New layer form */}
      {editingLayerId === 'new' && (
        <div className="p-2 bg-slate-800 rounded mb-2 space-y-2 flex-shrink-0">
          <input
            type="text"
            placeholder={translate('Layer Name', language as Locale)}
            value={newLayerName}
            onChange={(e) => setNewLayerName(e.target.value)}
            className="w-full bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600 focus:border-purple-500 focus:outline-none"
          />
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-[9px] text-gray-500 mb-1">Min Z</label>
              <input
                type="number"
                min="1"
                max="10000"
                value={newLayerMin}
                onChange={(e) => setNewLayerMin(Number(e.target.value))}
                className="w-full bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600 focus:border-purple-500 focus:outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="block text-[9px] text-gray-500 mb-1">Max Z</label>
              <input
                type="number"
                min="1"
                max="10000"
                value={newLayerMax}
                onChange={(e) => setNewLayerMax(Number(e.target.value))}
                className="w-full bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600 focus:border-purple-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={addNewLayer}
              className="flex-1 py-1 px-2 bg-purple-600 hover:bg-purple-500 text-white text-xs rounded transition-colors"
            >
              {translate('Add', language as Locale)}
            </button>
            <button
              onClick={() => setEditingLayerId(null)}
              className="flex-1 py-1 px-2 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded transition-colors"
            >
              {translate('Cancel', language as Locale)}
            </button>
          </div>
        </div>
      )}

      {/* Layer list */}
      <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
        {sortedLayers.map((layer) => {
          const isSelected = isLayerSelected(layer.id);
          const canSelect = canSelectLayer(layer);

          return (
            <div
              key={layer.id}
              className="relative"
            >
              {/* Layer row - clickable for selection */}
              <div
                onClick={() => canSelect && toggleLayer(layer.id)}
                className={`flex items-center gap-2 p-2 rounded transition-colors cursor-pointer ${
                  isSelected ? 'bg-slate-700' : canSelect ? 'bg-slate-800 hover:bg-slate-750' : 'bg-slate-900 opacity-50'
                }`}
              >
                {/* Selection checkbox */}
                {canSelect && (
                  <div className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                    isSelected ? 'bg-purple-500 border-purple-500' : 'border-slate-600'
                  }`}>
                    {isSelected && <div className="w-2 h-2 bg-white rounded-sm" />}
                  </div>
                )}

                {/* Layer color indicator */}
                <div
                  className="flex-shrink-0 w-3 h-3 rounded"
                  style={{ backgroundColor: layer.color }}
                />

                {/* Layer name */}
                <span className="flex-1 text-xs text-gray-300 truncate">
                  {layer.name}
                </span>

                {/* Z-range indicator */}
                <span className="text-[9px] text-gray-500">
                  {layer.minZIndex}-{layer.maxZIndex}
                </span>

                {/* Actions - stopPropagation to prevent triggering selection */}
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  {isGM && (
                    <>
                      <button
                        onClick={() => openLayerSettings(layer.id)}
                        className="p-1 hover:bg-slate-600 rounded text-gray-500 hover:text-white transition-colors"
                        title={translate('Settings', language as Locale)}
                      >
                        <Settings size={12} />
                      </button>
                      <button
                        onClick={() => deleteLayer(layer.id)}
                        className="p-1 hover:bg-slate-600 rounded text-gray-500 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
