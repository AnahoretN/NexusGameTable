import React, { useCallback, useRef } from 'react';
import { CharacterBlock, AvatarBlockData } from '../../types';
import { Upload, User } from 'lucide-react';

interface AvatarBlockProps {
  block: CharacterBlock;
  editable: boolean;
  onChange: (data: AvatarBlockData) => void;
}

export const AvatarBlock: React.FC<AvatarBlockProps> = ({ block, editable, onChange }) => {
  const data = block.data as AvatarBlockData;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!editable || !e.target.files || !e.target.files[0]) return;

    const file = e.target.files[0];

    // Check file size (limit to 2MB)
    if (file.size > 2 * 1024 * 1024) {
      alert('Image size must be less than 2MB');
      return;
    }

    // Create a preview URL
    const reader = new FileReader();
    reader.onload = (event) => {
      const imageUrl = event.target?.result as string;
      onChange({ ...data, imageUrl });
    };
    reader.readAsDataURL(file);

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [data, editable, onChange]);

  const handleRemoveImage = useCallback(() => {
    if (!editable) return;
    onChange({ ...data, imageUrl: '' });
  }, [data, editable, onChange]);

  return (
    <div className="w-full h-full relative flex items-center justify-center">
      {/* Avatar container - fixed size circle, absolutely centered */}
      <div className="relative group w-[193px] h-[193px] flex-shrink-0">
        {data.imageUrl ? (
          <div className="w-full h-full rounded-full overflow-hidden border-2 border-slate-500 flex items-center justify-center">
            <img
              src={data.imageUrl}
              alt={data.name}
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div className="w-full h-full rounded-full bg-slate-600 border-2 border-slate-500 flex items-center justify-center">
            <User size={80} className="text-slate-400" />
          </div>
        )}

        {/* Upload/remove overlay */}
        {editable && (
          <div className="absolute inset-0 bg-black bg-opacity-50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
            <div className="flex flex-col gap-2">
              <label className="cursor-pointer bg-white text-black px-3 py-1.5 rounded text-sm flex items-center gap-2 hover:bg-slate-200">
                <Upload size={14} />
                Upload
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </label>
              {data.imageUrl && (
                <button
                  onClick={handleRemoveImage}
                  className="bg-red-500 text-white px-3 py-1.5 rounded text-sm hover:bg-red-600"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};