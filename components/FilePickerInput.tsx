import React, { useRef, useState } from 'react';
import { logger } from '../utils/logger';
import { saveSingleImageToIDB, generateImageId, createImageRef, addToManagedCache, setFileNameForImageRef } from '../utils/imageCache';

interface FilePickerInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  accept?: string; // MIME types to accept, e.g., "image/*"
  label?: string;
  maxSize?: number; // Max file size in bytes (default: 3MB)
}

/**
 * Validate URL to prevent URI malformed errors
 * Returns true if URL is valid, false otherwise
 */
const isValidUrl = (url: string): boolean => {
  if (!url || url.trim() === '') return true; // Empty URL is valid (user can clear the field)

  // img_ref:// URLs are valid (our internal image reference format)
  if (url.startsWith('img_ref://')) {
    return true;
  }

  // Check for Windows absolute paths (e.g., C:\Users\...)
  if (/^[A-Za-z]:\\/.test(url)) {
    return true; // Windows absolute paths are valid (local file)
  }

  // Check for Windows absolute paths with forward slashes (e.g., C:/Users/...)
  if (/^[A-Za-z]:\//.test(url)) {
    return true; // Windows absolute paths are valid (local file)
  }

  // Check for Unix absolute paths (e.g., /home/user/...)
  // But not protocol-relative URLs (//example.com)
  if (url.startsWith('/') && url.length > 1 && url[1] !== '/') {
    return true; // Unix absolute paths are valid (local file)
  }

  try {
    // Try to create a URL object
    // This will throw for malformed URLs
    new URL(url);
    return true;
  } catch (error) {
    // If URL constructor fails, it might be a relative path or data URI
    // Check for common valid patterns
    if (url.startsWith('./') || url.startsWith('../')) {
      return true; // Relative paths are valid
    }
    if (url.startsWith('data:')) {
      return true; // Data URIs are valid
    }
    if (url.startsWith('blob:')) {
      return true; // Blob URLs are valid
    }
    if (url.startsWith('file://')) {
      return true; // file:// URLs are valid
    }

    // Check for basic URL pattern (protocol://domain)
    const urlPattern = /^https?:\/\/.+/i;
    return urlPattern.test(url);
  }
};

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
  maxSize = 3 * 1024 * 1024, // Default: 3MB
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sizeWarning, setSizeWarning] = useState<string>('');

  const handleUrlChange = (newValue: string) => {
    // Validate URL - if invalid, treat as empty string
    if (isValidUrl(newValue)) {
      onChange(newValue);
    } else {
      // Invalid URL - treat as empty string
      onChange('');
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const maxMB = (maxSize / 1024 / 1024).toFixed(0);

      // Check file size
      if (file.size > maxSize) {
        const sizeMB = (file.size / 1024 / 1024).toFixed(2);
        setSizeWarning(`⚠️ File size: ${sizeMB}MB exceeds ${maxMB}MB limit.`);
        // Reset input
        e.target.value = '';
        return;
      }

      // Show warning for files > 1MB (but allow them)
      if (file.size > 1024 * 1024) {
        const sizeMB = (file.size / 1024 / 1024).toFixed(2);
        setSizeWarning(`⚠️ Large file: ${sizeMB}MB. Recommended: <${maxMB}MB`);
      } else {
        setSizeWarning('');
      }

      setIsLoading(true);
      try {
        // Convert to base64 for P2P sharing
        const base64Url = await fileToBase64(file);

        // Save to IndexedDB immediately for persistence across page reloads
        // Use img_ref:// format for consistent handling
        const imageId = generateImageId();
        const imgRefUrl = createImageRef(imageId);

        await saveSingleImageToIDB(imageId, base64Url);

        // Also add to managed cache for immediate use
        addToManagedCache(imageId, base64Url);

        // Store filename metadata in a separate map for later restoration
        setFileNameForImageRef(imgRefUrl, file.name);

        // Return img_ref:// URL instead of base64
        onChange(imgRefUrl);
      } catch (error) {
        logger.error('Failed to convert file to base64:', error);
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

  // Format value for display (hide img_ref:// prefix)
  const displayValue = value.startsWith('img_ref://') ? '(Uploaded image)' : value;
  const isImgRef = value.startsWith('img_ref://');

  const inputElement = (
    <div className="relative flex items-center">
      <input
        value={displayValue}
        onChange={e => handleUrlChange(e.target.value)}
        className={`bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm pr-10 ${className}`}
        placeholder={placeholder}
        disabled={isLoading || isImgRef}
        title={isImgRef ? 'Image is stored locally. Upload a new image to replace.' : ''}
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
        {sizeWarning && (
          <div className="text-xs text-purple-400 font-semibold mb-2" style={{
            color: '#a78bfa',
            fontWeight: 'bold'
          }}>
            {sizeWarning}
          </div>
        )}
        {inputElement}
      </div>
    );
  }

  return (
    <div>
      {sizeWarning && (
        <div className="text-xs text-purple-400 font-semibold mb-2" style={{
          color: '#a78bfa',
          fontWeight: 'bold'
        }}>
          {sizeWarning}
        </div>
      )}
      {inputElement}
    </div>
  );
};
