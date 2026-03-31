import React, { useState, useCallback } from 'react';
import { CharacterBlock, SliderBlockData, SliderItem } from '../../types';
import { SimpleContextMenu } from '../SimpleContextMenu';

interface SliderBlockProps {
  block: CharacterBlock;
  editable: boolean;
  canEditStructure?: boolean;
  onChange: (data: SliderBlockData) => void;
}

export const SliderBlock: React.FC<SliderBlockProps> = ({ block, editable, onChange }) => {
  const data = block.data as SliderBlockData;
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sliderId: string } | null>(null);
  const [editingSliderId, setEditingSliderId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<'label' | 'value' | 'maxValue' | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelInput, setLabelInput] = useState('');

  // Check if we have old format data and convert
  const isOldFormat = !data.sliders || !Array.isArray(data.sliders);
  const oldData = block.data as any;

  // Get sliders (old format as array with one item for compatibility)
  const sliders: SliderItem[] = isOldFormat ? [{
    id: 'slider-1',
    label: oldData.label || 'Slider',
    value: oldData.value || 0,
    maxValue: oldData.maxValue || 10,
    minValue: oldData.minValue || 0,
    color: oldData.color || '#22c55e',
    showValue: oldData.showValue !== false,
    showPercentage: oldData.showPercentage || false
  }] : data.sliders;

  const handleAddSlider = useCallback(() => {
    const newSlider: SliderItem = {
      id: `slider-${Date.now()}`,
      label: 'New Slider',
      value: 5,
      maxValue: 10,
      minValue: 0,
      color: '#22c55e',
      showValue: true,
      showPercentage: false
    };

    onChange({ sliders: [...sliders, newSlider] });
    setContextMenu(null);
  }, [sliders, onChange]);

  const handleRemoveSlider = useCallback((sliderId: string) => {
    if (sliders.length <= 1) return; // Don't allow removing the last slider

    onChange({ sliders: sliders.filter(s => s.id !== sliderId) });
    setContextMenu(null);
  }, [sliders, onChange]);

  const handleSliderChange = useCallback((sliderId: string, newValue: number) => {
    const updatedSliders = sliders.map(slider =>
      slider.id === sliderId ? { ...slider, value: newValue } : slider
    );
    onChange({ sliders: updatedSliders });
  }, [sliders, onChange]);

  const handleStartEditLabel = useCallback((sliderId: string) => {
    if (!editable) return;
    const slider = sliders.find(s => s.id === sliderId);
    if (!slider) return;

    setLabelInput(slider.label);
    setEditingLabel(true);
    setEditingSliderId(sliderId);
  }, [editable, sliders]);

  const handleSaveLabel = useCallback(() => {
    if (!editingSliderId) return;

    const newLabel = labelInput.trim() || 'Slider';
    const updatedSliders = sliders.map(slider =>
      slider.id === editingSliderId ? { ...slider, label: newLabel } : slider
    );

    onChange({ sliders: updatedSliders });
    setEditingLabel(false);
    setEditingSliderId(null);
    setLabelInput('');
  }, [editingSliderId, labelInput, sliders, onChange]);

  const handleStartEditValue = useCallback((sliderId: string, field: 'value' | 'maxValue') => {
    if (!editable) return;
    const slider = sliders.find(s => s.id === sliderId);
    if (!slider) return;

    setEditingField(field);
    setEditValue(field === 'value' ? String(slider.value) : String(slider.maxValue));
    setEditingSliderId(sliderId);
  }, [editable, sliders]);

  const handleSaveValue = useCallback(() => {
    if (!editingSliderId || !editingField) return;

    const numValue = parseInt(editValue);
    if (isNaN(numValue)) {
      setEditingField(null);
      setEditingSliderId(null);
      return;
    }

    const updatedSliders = sliders.map(slider => {
      if (slider.id !== editingSliderId) return slider;

      if (editingField === 'value') {
        const newValue = Math.max(slider.minValue, Math.min(numValue, slider.maxValue));
        return { ...slider, value: newValue };
      } else if (editingField === 'maxValue') {
        const newMax = Math.max(numValue, slider.minValue + 1);
        const adjustedValue = Math.min(slider.value, newMax);
        return { ...slider, maxValue: newMax, value: adjustedValue };
      }
      return slider;
    });

    onChange({ sliders: updatedSliders });
    setEditingField(null);
    setEditingSliderId(null);
    setEditValue('');
  }, [editingSliderId, editingField, editValue, sliders, onChange]);

  const handleCancelValue = useCallback(() => {
    setEditingField(null);
    setEditingSliderId(null);
    setEditValue('');
  }, []);

  const handleValueKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveValue();
    } else if (e.key === 'Escape') {
      handleCancelValue();
    }
  }, [handleSaveValue, handleCancelValue]);

  const handleLabelKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveLabel();
    } else if (e.key === 'Escape') {
      setEditingLabel(false);
      setEditingSliderId(null);
      setLabelInput('');
    }
  }, [handleSaveLabel]);

  return (
    <div className="w-full space-y-2">
      {sliders.map((slider) => {
        const percentage = ((slider.value - slider.minValue) / (slider.maxValue - slider.minValue)) * 100;

        return (
          <div key={slider.id} className="relative">
            {/* Label, Slider, and Value in one row */}
            <div className="flex items-center gap-2">
              <div className="flex-shrink-0">
                {editingLabel && editingSliderId === slider.id ? (
                  <input
                    type="text"
                    value={labelInput}
                    onChange={(e) => setLabelInput(e.target.value)}
                    onBlur={handleSaveLabel}
                    onKeyDown={handleLabelKeyDown}
                    className="text-sm font-medium bg-slate-600 text-white px-1.5 py-0.5 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                ) : (
                  <span
                    className={`text-sm font-medium ${editable ? 'text-slate-200 cursor-pointer hover:text-white' : 'text-slate-200'}`}
                    onDoubleClick={() => editable && handleStartEditLabel(slider.id)}
                    onContextMenu={(e) => {
                      if (!editable) return;
                      e.preventDefault();
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      setContextMenu({
                        x: rect.left,
                        y: rect.bottom + 5,
                        sliderId: slider.id
                      });
                    }}
                    title={editable ? "Double-click to rename, right-click for menu" : slider.label}
                  >
                    {slider.label}
                  </span>
                )}
              </div>

              {/* Slider */}
              <div className="flex-1 relative">
                <input
                  type="range"
                  min={slider.minValue}
                  max={slider.maxValue}
                  value={slider.value}
                  onChange={(e) => handleSliderChange(slider.id, parseInt(e.target.value))}
                  disabled={!editable}
                  className="w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer slider-input"
                  style={{
                    background: `linear-gradient(to right, ${slider.color} ${percentage}%, #4a5568 ${percentage}%)`,
                  }}
                />
              </div>

              {/* Value display - current/max */}
              <div className="flex-shrink-0">
                {editingField && editingSliderId === slider.id ? (
                  <input
                    type="number"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={handleSaveValue}
                    onKeyDown={handleValueKeyDown}
                    className="text-sm text-slate-300 font-medium min-w-[60px] w-[40px] text-right bg-slate-600 px-1 py-0.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    autoFocus
                  />
                ) : (
                  <span className="text-sm text-slate-300 font-medium min-w-[60px] text-right">
                    <span
                      className={`cursor-pointer hover:text-white transition-colors ${editable ? 'underline decoration-dotted' : ''}`}
                      onClick={() => handleStartEditValue(slider.id, 'value')}
                      title={editable ? "Click to edit current value" : String(slider.value)}
                    >
                      {slider.value}
                    </span>
                    <span className="text-slate-400 mx-1">/</span>
                    <span
                      className={`cursor-pointer hover:text-white transition-colors ${editable ? 'underline decoration-dotted' : ''}`}
                      onClick={() => handleStartEditValue(slider.id, 'maxValue')}
                      title={editable ? "Click to edit max value" : String(slider.maxValue)}
                    >
                      {slider.maxValue}
                    </span>
                  </span>
                )}
              </div>
            </div>

            {/* Context Menu */}
            {contextMenu && contextMenu.sliderId === slider.id && (
              <SimpleContextMenu
                x={contextMenu.x}
                y={contextMenu.y}
                onClose={() => setContextMenu(null)}
                items={[
                  {
                    name: 'Add Slider',
                    action: handleAddSlider
                  },
                  ...(sliders.length > 1 ? [{
                    name: 'Remove Slider',
                    action: () => handleRemoveSlider(slider.id)
                  }] : [])
                ]}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};