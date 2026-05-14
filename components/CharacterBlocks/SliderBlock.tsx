import React, { useState, useCallback } from 'react';
import { CharacterBlock, SliderBlockData, SliderItem } from '../../types';
import { SimpleContextMenu } from '../SimpleContextMenu';
import { useInlineEdit } from './hooks';

interface SliderBlockProps {
  block: CharacterBlock;
  editable: boolean;
  canEditStructure?: boolean;
  onChange: (data: SliderBlockData) => void;
}

export const SliderBlock: React.FC<SliderBlockProps> = ({ block, editable, onChange }) => {
  const data = block.data as SliderBlockData;
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sliderId: string } | null>(null);

  const isOldFormat = !data.sliders || !Array.isArray(data.sliders);
  const oldData = block.data as any;

  const sliders: SliderItem[] = isOldFormat ? [{
    id: 'slider-1',
    label: oldData.label || 'Slider',
    value: oldData.value || 0,
    maxValue: oldData.maxValue || 10,
    minValue: oldData.minValue || 0,
    color: oldData.color || '#a78bfa',
    showValue: oldData.showValue !== false,
    showPercentage: oldData.showPercentage || false
  }] : data.sliders.map(s => ({
    ...s,
    // Migrate green color to purple
    color: s.color === '#22c55e' || s.color === '#10b981' ? '#a78bfa' : s.color
  }));

  const handleAddSlider = useCallback(() => {
    const newSlider: SliderItem = {
      id: `slider-${Date.now()}`,
      label: 'New Slider',
      value: 5,
      maxValue: 10,
      minValue: 0,
      color: '#a78bfa',
      showValue: true,
      showPercentage: false
    };

    onChange({ sliders: [...sliders, newSlider] });
    setContextMenu(null);
  }, [sliders, onChange]);

  const handleRemoveSlider = useCallback((sliderId: string) => {
    if (sliders.length <= 1) return;
    onChange({ sliders: sliders.filter(s => s.id !== sliderId) });
    setContextMenu(null);
  }, [sliders, onChange]);

  const handleSliderChange = useCallback((sliderId: string, newValue: number) => {
    const updatedSliders = sliders.map(slider =>
      slider.id === sliderId ? { ...slider, value: newValue } : slider
    );
    onChange({ sliders: updatedSliders });
  }, [sliders, onChange]);

  return (
    <div className="w-full space-y-2">
      {sliders.map((slider) => (
        <SliderItemComponent
          key={slider.id}
          slider={slider}
          editable={editable}
          sliders={sliders}
          onSliderChange={handleSliderChange}
          onLabelChange={(newLabel) => {
            onChange({ sliders: sliders.map(s => s.id === slider.id ? { ...s, label: newLabel } : s) });
          }}
          onValueChange={(field, value) => {
            onChange({ sliders: sliders.map(s => {
              if (s.id !== slider.id) return s;
              if (field === 'value') return { ...s, value: Math.max(s.minValue, Math.min(value, s.maxValue)) };
              if (field === 'maxValue') {
                const newMax = Math.max(value, s.minValue + 1);
                return { ...s, maxValue: newMax, value: Math.min(s.value, newMax) };
              }
              return s;
            })});
          }}
          onContextMenu={(pos) => setContextMenu({ ...pos, sliderId: slider.id })}
          onAddSlider={handleAddSlider}
          onRemoveSlider={() => handleRemoveSlider(slider.id)}
          showContextMenu={contextMenu?.sliderId === slider.id ? contextMenu : null}
          closeContextMenu={() => setContextMenu(null)}
        />
      ))}
    </div>
  );
};

interface SliderItemComponentProps {
  slider: SliderItem;
  editable: boolean;
  sliders: SliderItem[];
  onSliderChange: (sliderId: string, newValue: number) => void;
  onLabelChange: (newLabel: string) => void;
  onValueChange: (field: 'value' | 'maxValue', value: number) => void;
  onContextMenu: (pos: { x: number; y: number }) => void;
  onAddSlider: () => void;
  onRemoveSlider: () => void;
  showContextMenu: { x: number; y: number; sliderId: string } | null;
  closeContextMenu: () => void;
}

const SliderItemComponent: React.FC<SliderItemComponentProps> = ({
  slider,
  editable,
  sliders,
  onSliderChange,
  onLabelChange,
  onValueChange,
  onContextMenu,
  onAddSlider,
  onRemoveSlider,
  showContextMenu,
  closeContextMenu
}) => {
  const percentage = ((slider.value - slider.minValue) / (slider.maxValue - slider.minValue)) * 100;

  const labelEdit = useInlineEdit({
    value: slider.label,
    onSave: onLabelChange,
    editable
  });

  const valueEdit = useInlineEdit({
    value: slider.value,
    onSave: (val) => onValueChange('value', val),
    editable
  });

  const maxEdit = useInlineEdit({
    value: slider.maxValue,
    onSave: (val) => onValueChange('maxValue', val),
    editable
  });

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <div className="flex-shrink-0">
          {labelEdit.isEditing ? (
            <input
              type="text"
              value={labelEdit.editValue}
              onChange={(e) => labelEdit.setEditValue(e.target.value)}
              onBlur={labelEdit.saveEdit}
              onKeyDown={labelEdit.handleKeyDown}
              className="text-sm font-medium bg-slate-600 text-white px-1.5 py-0.5 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          ) : (
            <span
              className={`text-sm font-medium ${editable ? 'text-slate-200 cursor-pointer hover:text-white' : 'text-slate-200'}`}
              onDoubleClick={labelEdit.startEdit}
              onContextMenu={(e) => {
                if (!editable) return;
                e.preventDefault();
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                onContextMenu({ x: rect.left, y: rect.bottom + 5 });
              }}
              title={editable ? "Double-click to rename, right-click for menu" : slider.label}
            >
              {slider.label}
            </span>
          )}
        </div>

        <div className="flex-1 relative">
          <input
            type="range"
            min={slider.minValue}
            max={slider.maxValue}
            value={slider.value}
            onChange={(e) => onSliderChange(slider.id, parseInt(e.target.value))}
            disabled={!editable}
            className="w-full h-2 rounded-lg appearance-none cursor-pointer slider-input"
            style={{
              '--slider-fill-color': slider.color,
              '--slider-empty-color': '#4a5568',
              '--slider-fill-percent': `${percentage}%`,
              background: `linear-gradient(to right, ${slider.color} ${percentage}%, #4a5568 ${percentage}%)`,
            } as React.CSSProperties}
          />
        </div>

        <div className="flex-shrink-0">
          {valueEdit.isEditing ? (
            <input
              type="number"
              value={valueEdit.editValue}
              onChange={(e) => valueEdit.setEditValue(e.target.value)}
              onBlur={valueEdit.saveEdit}
              onKeyDown={valueEdit.handleKeyDown}
              className="text-sm text-slate-300 font-medium min-w-[60px] w-[40px] text-right bg-slate-600 px-1 py-0.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
          ) : maxEdit.isEditing ? (
            <input
              type="number"
              value={maxEdit.editValue}
              onChange={(e) => maxEdit.setEditValue(e.target.value)}
              onBlur={maxEdit.saveEdit}
              onKeyDown={maxEdit.handleKeyDown}
              className="text-sm text-slate-300 font-medium min-w-[60px] w-[40px] text-right bg-slate-600 px-1 py-0.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
          ) : (
            <span className="text-sm text-slate-300 font-medium min-w-[60px] text-right">
              <span
                className={`cursor-pointer hover:text-white transition-colors ${editable ? 'underline decoration-dotted' : ''}`}
                onClick={valueEdit.startEdit}
                title={editable ? "Click to edit current value" : String(slider.value)}
              >
                {slider.value}
              </span>
              <span className="text-slate-400 mx-1">/</span>
              <span
                className={`cursor-pointer hover:text-white transition-colors ${editable ? 'underline decoration-dotted' : ''}`}
                onClick={maxEdit.startEdit}
                title={editable ? "Click to edit max value" : String(slider.maxValue)}
              >
                {slider.maxValue}
              </span>
            </span>
          )}
        </div>
      </div>

      {showContextMenu && (
        <SimpleContextMenu
          x={showContextMenu.x}
          y={showContextMenu.y}
          onClose={closeContextMenu}
          items={[
            { name: 'Add Slider', action: onAddSlider },
            ...(sliders.length > 1 ? [{ name: 'Remove Slider', action: onRemoveSlider }] : [])
          ]}
        />
      )}
    </div>
  );
};
