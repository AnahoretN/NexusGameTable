import React, { useState, forwardRef, useImperativeHandle } from 'react';
import { CharacterTab } from '../types';
import { FilePickerInput } from './FilePickerInput';
import { useLanguage } from '../store/contexts';
import { t } from '../utils/translations';

export interface AvatarSettingsModalRef {
  getValues: () => CharacterTab;
}

interface AvatarSettingsModalProps {
  character: CharacterTab;
}

export const AvatarSettingsModal = forwardRef<AvatarSettingsModalRef, AvatarSettingsModalProps>(({
  character
}, ref) => {
  const language = useLanguage();
  const [avatarUrl, setAvatarUrl] = useState(character.avatarUrl || '');
  const [avatarBorderColor, setAvatarBorderColor] = useState(character.avatarBorderColor || '#ffffff');
  const [avatarBorderWidth, setAvatarBorderWidth] = useState(character.avatarBorderWidth ?? 2);

  useImperativeHandle(ref, () => ({
    getValues: () => ({
      ...character,
      avatarUrl: avatarUrl || undefined,
      avatarBorderColor: avatarBorderColor,
      avatarBorderWidth: avatarBorderWidth
    })
  }));

  return (
    <div className="space-y-4">
      {/* Preview */}
      <div className="flex items-center justify-center p-2 bg-slate-900 rounded-lg border border-slate-700">
        <div
          className="w-30 h-30 rounded-full overflow-hidden flex items-center justify-center bg-slate-700"
          style={{
            width: '7.5rem',
            height: '7.5rem',
            borderColor: avatarBorderColor,
            borderWidth: `${avatarBorderWidth}px`,
            borderStyle: 'solid'
          }}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt="Preview"
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-slate-400 text-xs">No image</span>
          )}
        </div>
      </div>

      {/* Avatar Image URL */}
      <FilePickerInput
        value={avatarUrl}
        onChange={setAvatarUrl}
        label={t('Image URL', language)}
        placeholder="https://..."
        accept="image/*"
        className="w-full"
      />

      {/* Border Color */}
      <div>
        <label className="block text-xs font-bold text-gray-400 mb-1">
          {t('Border Color', language)}
        </label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={avatarBorderColor}
            onChange={e => setAvatarBorderColor(e.target.value)}
            className="w-16 h-10 bg-slate-900 border border-slate-700 rounded cursor-pointer"
          />
          <input
            type="text"
            value={avatarBorderColor}
            onChange={e => setAvatarBorderColor(e.target.value)}
            className="flex-1 bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
            placeholder="#ffffff"
          />
        </div>
      </div>

      {/* Border Width */}
      <div>
        <label className="block text-xs font-bold text-gray-400 mb-1 flex items-center justify-between">
          <span>{t('Border Width', language)}</span>
          <span className="text-white">{avatarBorderWidth}px</span>
        </label>
        <div className="flex items-center">
          <input
            type="range"
            min="0"
            max="20"
            step="1"
            value={avatarBorderWidth}
            onChange={e => setAvatarBorderWidth(Number(e.target.value))}
            className="flex-1 accent-purple-500"
          />
        </div>
      </div>
    </div>
  );
});
