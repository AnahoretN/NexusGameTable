import React, { useRef } from 'react';

interface FilePickerInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  accept?: string; // MIME types to accept, e.g., "image/*"
  label?: string;
}

/**
 * FilePickerInput - universal image input component
 * Accepts both URLs and local file paths (via file picker)
 * Creates blob URLs for local files
 */
export const FilePickerInput: React.FC<FilePickerInputProps> = ({
  value,
  onChange,
  placeholder = 'https://...',
  className = '',
  accept = 'image/*',
  label,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Create blob URL for the local file
      const blobUrl = URL.createObjectURL(file);
      onChange(blobUrl);
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  // Three dots icon (SVG)
  const threeDotsIcon = (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="3" cy="8" r="1.5" fill="currentColor"/>
      <circle cx="8" cy="8" r="1.5" fill="currentColor"/>
      <circle cx="13" cy="8" r="1.5" fill="currentColor"/>
    </svg>
  );

  const inputElement = (
    <div className="relative flex items-center">
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm pr-10 ${className}`}
        placeholder={placeholder}
      />
      <button
        type="button"
        onClick={handleButtonClick}
        className="absolute right-2 w-7 h-7 flex items-center justify-center hover:bg-slate-700 rounded transition-colors"
        title="Select local file"
      >
        <span className="text-gray-400">
          {threeDotsIcon}
        </span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );

  if (label) {
    return (
      <div>
        <label className="block text-xs font-bold text-gray-400 mb-1">{label}</label>
        {inputElement}
      </div>
    );
  }

  return inputElement;
};
