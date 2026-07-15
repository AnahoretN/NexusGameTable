import React, { useState } from 'react';
import { DiceObject, DiceValueOverride } from '../types';
import { Locale, t as translate } from '../utils/translations';
import { Image as ImageIcon, X, Upload, Link as LinkIcon, Smile, Trash2 } from 'lucide-react';
import { DICE_VALUE_ICONS, getAllDiceIcons } from './DiceValueIcons';
import { FilePickerInput } from './FilePickerInput';

interface DiceValuesSettingsProps {
  dice: DiceObject;
  onChange: (updates: Partial<DiceObject>) => void;
  language?: Locale;
}

interface ValueEditState {
  [key: number]: DiceValueOverride | null;
}

export const DiceValuesSettings: React.FC<DiceValuesSettingsProps> = ({ dice, onChange, language = 'en' }) => {
  const sides = dice.sides || 6;

  const [editingValue, setEditingValue] = useState<number | null>(null);
  const [iconSearch, setIconSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Get override for a specific value - always read from latest dice.valueOverrides
  const getOverride = (value: number): DiceValueOverride | null => {
    const valueOverrides = dice.valueOverrides || {};
    return valueOverrides[value] || null;
  };

  // Set override for a specific value
  const setOverride = (value: number, override: DiceValueOverride | null) => {
    // Always read from latest dice.valueOverrides to avoid stale closure
    const currentOverrides = dice.valueOverrides || {};
    const newOverrides = { ...currentOverrides };
    if (override) {
      newOverrides[value] = override;
    } else {
      delete newOverrides[value];
    }
    onChange({ valueOverrides: Object.keys(newOverrides).length > 0 ? newOverrides : undefined });
  };

  // Set image URL override
  const setImageOverride = (value: number, imageUrl: string) => {
    if (imageUrl.trim()) {
      setOverride(value, { type: 'image', value: imageUrl.trim() });
    } else {
      setOverride(value, null);
    }
  };

  // Set icon/emoji override
  const setIconOverride = (value: number, icon: string) => {
    setOverride(value, { type: 'emoji', value: icon });
    setEditingValue(null);
  };

  // Clear override for a value
  const clearOverride = (value: number) => {
    setOverride(value, null);
  };

  // Filter icons by search
  const filteredIcons = iconSearch
    ? getAllDiceIcons().filter(icon => icon.includes(iconSearch))
    : (activeCategory
        ? DICE_VALUE_ICONS.find(c => c.name === activeCategory)?.icons || []
        : []);

  // Render value cell
  const renderValueCell = (value: number) => {
    const override = getOverride(value);

    return (
      <div
        key={value}
        className="bg-slate-800 rounded-lg p-3 space-y-2"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-gray-300">
            {translate('Value', language)} {value}
          </span>
          {override && (
            <button
              onClick={() => clearOverride(value)}
              className="p-1 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded"
              title={translate('Clear', language)}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>

        {/* Preview of current override */}
        {override ? (
          <div className="bg-slate-900 rounded p-2 flex items-center justify-center min-h-[60px]">
            {override.type === 'image' ? (
              <img
                src={override.value}
                alt={`Value ${value}`}
                className="max-w-full max-h-[50px] object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <span className="text-3xl">{override.value}</span>
            )}
          </div>
        ) : (
          <div className="bg-slate-900 rounded p-2 flex items-center justify-center min-h-[60px] text-gray-500 text-sm">
            {translate('Default', language)}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-1">
          {/* Image URL input with file picker */}
          <div className="flex-[1]">
            <FilePickerInput
              value={override?.type === 'image' ? override.value : ''}
              onChange={(url) => setImageOverride(value, url)}
              placeholder={translate('Image URL', language)}
              className="w-full text-xs py-1"
            />
          </div>

          {/* Icon picker button */}
          <button
            onClick={() => {
              setEditingValue(editingValue === value ? null : value);
              setIconSearch('');
              setActiveCategory(null);
            }}
            className={`p-2 rounded transition-colors flex-shrink-0 ${
              editingValue === value
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
            }`}
            title={translate('Choose Icon', language)}
          >
            <Smile size={16} />
          </button>
        </div>
      </div>
    );
  };

  // Render icon picker
  const renderIconPicker = () => {
    if (editingValue === null) return null;

    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100010]">
        <div className="bg-slate-800 rounded-lg p-4 max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white">
              {translate('Choose Icon for Value', language)} {editingValue}
            </h3>
            <button
              onClick={() => setEditingValue(null)}
              className="p-1 text-gray-400 hover:text-white hover:bg-slate-700 rounded"
            >
              <X size={20} />
            </button>
          </div>

          {/* Search input */}
          <input
            type="text"
            placeholder={translate('Search icons...', language)}
            value={iconSearch}
            onChange={(e) => setIconSearch(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white mb-3 focus:border-blue-500 focus:outline-none"
          />

          {/* Categories (when not searching) */}
          {!iconSearch && (
            <div
              className="flex flex-wrap gap-2 mb-3 max-h-[100px] overflow-y-auto scrollbar-thin"
              data-scrollable="true"
            >
              {DICE_VALUE_ICONS.map((category) => (
                <button
                  key={category.name}
                  onClick={() => setActiveCategory(activeCategory === category.name ? null : category.name)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    activeCategory === category.name
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                  }`}
                >
                  {category.name}
                </button>
              ))}
            </div>
          )}

          {/* Icons grid */}
          <div
            className="flex-1 overflow-y-auto scrollbar-thin"
            data-scrollable="true"
          >
            <div className="grid grid-cols-8 gap-2">
              {(iconSearch ? filteredIcons : (activeCategory
                  ? DICE_VALUE_ICONS.find(c => c.name === activeCategory)?.icons || []
                  : getAllDiceIcons().slice(0, 200)
              )).map((icon, index) => (
                <button
                  key={`${icon}-${index}`}
                  onClick={() => setIconOverride(editingValue, icon)}
                  className="p-2 bg-slate-900 rounded hover:bg-slate-700 transition-colors text-2xl flex items-center justify-center aspect-square"
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          {/* Custom image URL option */}
          <div className="mt-4 pt-4 border-t border-slate-700">
            <label className="text-sm text-gray-400 mb-2 block">
              {translate('Or enter image URL:', language)}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="https://..."
                className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const target = e.target as HTMLInputElement;
                    if (target.value.trim()) {
                      setImageOverride(editingValue, target.value);
                      setEditingValue(null);
                    }
                  }
                }}
              />
              <button
                onClick={() => {
                  const input = document.querySelector('input[placeholder="https://..."]') as HTMLInputElement;
                  if (input?.value.trim()) {
                    setImageOverride(editingValue, input.value);
                    setEditingValue(null);
                  }
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-medium"
              >
                {translate('Apply', language)}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-300">
          {translate('Dice Values', language)} ({sides})
        </h3>
        <button
          onClick={() => onChange({ valueOverrides: undefined })}
          className="text-xs text-red-400 hover:text-red-300"
        >
          {translate('Reset All', language)}
        </button>
      </div>

      {/* Values grid - 3 columns */}
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: sides }, (_, i) => i + 1).map(renderValueCell)}
      </div>

      {/* Icon picker modal */}
      {renderIconPicker()}
    </div>
  );
};
