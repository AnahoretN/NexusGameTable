import React, { useRef, useState } from 'react';

interface FilePickerInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  accept?: string; // MIME types to accept, e.g., "image/*"
  label?: string;
}

/**
 * Convert a file to base64 data URL for P2P sharing
 */
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

/**
 * FilePickerInput - universal image input component
 * Accepts both URLs and local file paths (via file picker)
 * Converts local files to base64 for P2P sharing
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
  const [isLoading, setIsLoading] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsLoading(true);
      try {
        // Convert to base64 for P2P sharing
        const base64Url = await fileToBase64(file);
        onChange(base64Url);
      } catch (error) {
        console.error('Failed to convert file to base64:', error);
      } finally {
        setIsLoading(false);
      }
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
        disabled={isLoading}
      />
      <button
        type="button"
        onClick={handleButtonClick}
        disabled={isLoading}
        className="absolute right-2 w-7 h-7 flex items-center justify-center hover:bg-slate-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title={isLoading ? "Converting..." : "Select local file"}
      >
        {isLoading ? (
          <svg className="animate-spin" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
            <path d="M8 2 A6 6 0 0 1 14 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        ) : (
          <span className="text-gray-400">
            {threeDotsIcon}
          </span>
        )}
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
