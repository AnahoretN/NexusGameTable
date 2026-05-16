import React, { useState, useCallback } from 'react';
import { CharacterBlock, SliderBlockData, SliderItem, SliderIconShape } from '../../types';
import { SimpleContextMenu } from '../SimpleContextMenu';
import { useInlineEdit } from './hooks';

// Icon shape components
const SliderIcon: React.FC<{
  shape: SliderIconShape;
  color: string;
  size?: number;
}> = ({ shape, color, size = 20 }) => {
  const baseProps = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: color
  };

  switch (shape) {
    case 'circle':
      return (
        <svg {...baseProps}>
          <circle cx="12" cy="12" r="10" />
        </svg>
      );
    case 'square':
      return (
        <svg {...baseProps}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
        </svg>
      );
    case 'triangle':
      return (
        <svg {...baseProps}>
          <polygon points="12,2 22,22 2,22" />
        </svg>
      );
    case 'cross':
      return (
        <svg {...baseProps}>
          <polygon points="10,2 14,2 14,10 22,10 22,14 14,14 14,22 10,22 10,14 2,14 2,10 10,10" />
        </svg>
      );
    case 'heart':
      return (
        <svg {...baseProps}>
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      );
    case 'star':
      return (
        <svg {...baseProps}>
          <polygon points="12,2 15,9 22,9 17,14 19,22 12,17 5,22 7,14 2,9 9,9" />
        </svg>
      );
    default:
      return (
        <svg {...baseProps}>
          <circle cx="12" cy="12" r="10" />
        </svg>
      );
  }
};

// Exported modal component for use in CharacterPanel
export const SliderIconModal: React.FC<{
  slider: SliderItem;
  onClose: () => void;
  onSave: (shape: SliderIconShape, color: string) => void;
}> = ({ slider, onClose, onSave }) => {
  const [shape, setShape] = useState<SliderIconShape>(slider.iconShape || 'circle');
  const [color, setColor] = useState(slider.color);

  const shapes: { key: SliderIconShape; label: string }[] = [
    { key: 'circle', label: 'Circle' },
    { key: 'square', label: 'Square' },
    { key: 'triangle', label: 'Triangle' },
    { key: 'cross', label: 'Cross' },
    { key: 'heart', label: 'Heart' },
    { key: 'star', label: 'Star' }
  ];

  return (
    <>
      <div className="flex justify-between items-center py-3 px-4 border-b border-slate-700">
        <h3 className="text-base font-bold text-white">Slider Icon</h3>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Shape Selection */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Shape</label>
          <div className="grid grid-cols-6 gap-2">
            {shapes.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setShape(key)}
                className={`aspect-square rounded-lg flex items-center justify-center transition-all ${
                  shape === key
                    ? 'bg-purple-600 ring-2 ring-purple-400'
                    : 'bg-slate-700 hover:bg-slate-600'
                }`}
                title={label}
              >
                <SliderIcon shape={key} color={color} size={24} />
              </button>
            ))}
          </div>
        </div>

        {/* Color */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Color</label>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-full h-10 rounded cursor-pointer border-0 p-0 bg-slate-900"
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-2 p-4 pt-0">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm text-gray-300 hover:bg-slate-700 rounded transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => onSave(shape, color)}
          className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-500 text-white rounded transition-colors"
        >
          Save
        </button>
      </div>
    </>
  );
};

interface SliderBlockProps {
  block: CharacterBlock;
  editable: boolean;
  canEditStructure?: boolean;
  onChange: (data: SliderBlockData) => void;
  onIconClick?: (slider: SliderItem) => void;
}

export const SliderBlock: React.FC<SliderBlockProps> = ({ block, editable, onChange, onIconClick }) => {
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
    showPercentage: oldData.showPercentage || false,
    iconShape: 'circle' as const
  }] : data.sliders.map(s => ({
    ...s,
    iconShape: s.iconShape || 'circle' as const
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
      showPercentage: false,
      iconShape: 'circle'
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

  const handleIconClick = useCallback((sliderId: string) => {
    if (onIconClick) {
      const slider = sliders.find(s => s.id === sliderId);
      if (slider) {
        onIconClick(slider);
      }
    }
  }, [sliders, onIconClick]);

  return (
    <div className="w-full space-y-[0.5vh]">
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
          onIconClick={() => handleIconClick(slider.id)}
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
  onIconClick: () => void;
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
  closeContextMenu,
  onIconClick
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
        {/* Icon button */}
        <button
          onClick={onIconClick}
          className={`flex-shrink-0 transition-transform hover:scale-110 ${editable ? 'cursor-pointer' : 'cursor-default'}`}
          disabled={!editable}
          title={editable ? "Click to customize icon" : slider.label}
        >
          <SliderIcon
            shape={slider.iconShape || 'circle'}
            color={slider.color}
            size={16}
          />
        </button>

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
            className="w-full h-2 rounded-lg appearance-none cursor-pointer slider-input character-slider"
            style={{
              '--slider-track-fill': slider.color,
              '--slider-fill-percent': `${percentage}%`,
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
