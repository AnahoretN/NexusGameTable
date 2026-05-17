import React, { useState, forwardRef, useImperativeHandle, useEffect } from 'react';
import { CharacterTab } from '../types';
import { FilePickerInput } from './FilePickerInput';
import { useLanguage } from '../store/contexts';
import { t } from '../utils/translations';
import { isImageRef, getImageIdFromRef } from '../utils/imageCache';
import { logger } from '../utils/logger';

export interface AvatarSettingsModalRef {
  getValues: () => CharacterTab;
}

interface AvatarSettingsModalProps {
  character: CharacterTab;
  pixelsPerVU: number;
}

export const AvatarSettingsModal = forwardRef<AvatarSettingsModalRef, AvatarSettingsModalProps>(({
  character,
  pixelsPerVU
}, ref) => {
  const language = useLanguage();
  const [avatarUrl, setAvatarUrl] = useState(character.avatarUrl || '');
  const [avatarBorderColor, setAvatarBorderColor] = useState(character.avatarBorderColor || '#a855f7');
  const [avatarBorderWidth, setAvatarBorderWidth] = useState(character.avatarBorderWidth ?? 5);

  // State for resolved avatar URL (convert img_ref:// to data URL for display)
  const [resolvedAvatarUrl, setResolvedAvatarUrl] = useState<string>('');

  // Load avatar from IndexedDB if it's an img_ref:// URL
  useEffect(() => {
    const loadAvatar = async () => {
      if (!avatarUrl) {
        setResolvedAvatarUrl('');
        return;
      }

      // If it's an image reference, load from IDB
      if (isImageRef(avatarUrl)) {
        const imageId = getImageIdFromRef(avatarUrl);
        try {
          const dataUrl = await new Promise<string | null>((resolve) => {
            const request = indexedDB.open('NexusGameTable_Images', 1);
            request.onerror = () => resolve(null);
            request.onsuccess = () => {
              const db = request.result;
              const transaction = db.transaction(['cachedImages'], 'readonly');
              const store = transaction.objectStore('cachedImages');
              const getReq = store.get(imageId);
              getReq.onerror = () => resolve(null);
              getReq.onsuccess = () => {
                const entry = getReq.result;
                resolve(entry ? entry.data : null);
              };
            };
          });

          setResolvedAvatarUrl(dataUrl || '');
        } catch (error) {
          logger.error('[AvatarSettingsModal] Failed to load avatar from IDB:', error);
          setResolvedAvatarUrl('');
        }
      } else {
        // Not an image reference, use as-is
        setResolvedAvatarUrl(avatarUrl);
      }
    };

    loadAvatar();
  }, [avatarUrl]);

  useImperativeHandle(ref, () => ({
    getValues: () => ({
      id: character.id,
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
            borderWidth: `${avatarBorderWidth * pixelsPerVU}px`, // VU to pixels
            borderStyle: 'solid'
          }}
        >
          {resolvedAvatarUrl ? (
            <img
              src={resolvedAvatarUrl}
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
          <span className="text-white">{avatarBorderWidth} vu</span>
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
