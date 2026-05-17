import React, { useState, useRef } from 'react';

export interface LocalFileInfo {
  path: string;
  filename: string;
  objectIds: string[];
  fields: string[];
}

interface LocalFileRestoreDialogProps {
  localFiles: LocalFileInfo[];
  onConfirm: (fileMap: Map<string, File>) => void;
  onCancel: () => void;
}

/**
 * Dialog for restoring local files when loading a saved session
 */
export const LocalFileRestoreDialog: React.FC<LocalFileRestoreDialogProps> = ({
  localFiles,
  onConfirm,
  onCancel
}) => {
  const [fileMap, setFileMap] = useState<Map<string, File>>(new Map());
  const [pendingFiles, setPendingFiles] = useState<Map<string, File>>(new Map());
  const fileInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const [inputElements] = useState(() => new Map<string, HTMLInputElement>());

  // Group files by extension for better UX
  const filesByExtension = localFiles.reduce((acc, file) => {
    const ext = file.filename.split('.').pop()?.toLowerCase() || 'unknown';
    if (!acc[ext]) acc[ext] = [];
    acc[ext].push(file);
    return acc;
  }, {} as Record<string, LocalFileInfo[]>);

  const handleFileSelect = (filename: string, file: File | null) => {
    const newPendingFiles = new Map(pendingFiles);
    if (file) {
      newPendingFiles.set(filename, file);
    } else {
      newPendingFiles.delete(filename);
    }
    setPendingFiles(newPendingFiles);
  };

  const handleSelectClick = (filename: string) => {
    const input = inputElements.get(filename);
    if (input) {
      input.click();
    }
  };

  const handleConfirm = () => {
    // Merge pending files into file map
    const mergedMap = new Map(fileMap);
    pendingFiles.forEach((file, filename) => {
      mergedMap.set(filename, file);
    });
    setFileMap(mergedMap);
    onConfirm(mergedMap);
  };

  const handleSkip = () => {
    // Proceed without restoring files
    onConfirm(new Map());
  };

  const allFilesSelected = localFiles.every(file =>
    fileMap.has(file.filename) || pendingFiles.has(file.filename)
  );

  const selectedCount = new Set([...fileMap.keys(), ...pendingFiles.keys()]).size;
  const totalCount = localFiles.length;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[10000]">
      <div className="bg-slate-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-700">
          <h2 className="text-xl font-bold text-white">
            Restore Local Images
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            This saved session contains {totalCount} local image{totalCount !== 1 ? 's' : ''} that {totalCount !== 1 ? 'were' : 'was'} not found in cache.
          </p>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1">
          <div className="mb-4 p-3 bg-slate-900 rounded border border-slate-700">
            <p className="text-sm text-gray-300">
              Please select the original image files to restore them. You can also skip this step and load the session without these images.
            </p>
            <p className="text-xs text-gray-500 mt-2">
              Selected: {selectedCount} / {totalCount}
            </p>
          </div>

          {/* File list grouped by extension */}
          {Object.entries(filesByExtension).map(([ext, files]) => (
            <div key={ext} className="mb-4">
              <h3 className="text-sm font-semibold text-gray-400 mb-2 uppercase">
                {ext.toUpperCase()} files ({files.length})
              </h3>
              <div className="space-y-2">
                {files.map((file) => {
                  const isSelected = fileMap.has(file.filename) || pendingFiles.has(file.filename);

                  return (
                    <div
                      key={file.filename}
                      className={`p-3 rounded border transition-colors ${
                        isSelected
                          ? 'bg-green-900/20 border-green-700'
                          : 'bg-slate-900 border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-white font-medium truncate">
                              {file.filename}
                            </span>
                            {isSelected && (
                              <span className="text-xs text-green-400">✓</span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {file.objectIds.length} object{file.objectIds.length !== 1 ? 's' : ''}
                          </div>
                        </div>
                        <input
                          ref={(el) => {
                            if (el) inputElements.set(file.filename, el);
                          }}
                          type="file"
                          accept={`image/${ext === 'jpg' ? 'jpeg' : ext},image/*`}
                          className="hidden"
                          onChange={(e) => {
                            const selectedFile = e.target.files?.[0] || null;
                            handleFileSelect(file.filename, selectedFile);
                          }}
                        />
                        <button
                          onClick={() => handleSelectClick(file.filename)}
                          className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                            isSelected
                              ? 'bg-green-700 text-white hover:bg-green-600'
                              : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                          }`}
                        >
                          {isSelected ? 'Change' : 'Select'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700 flex justify-between">
          <button
            onClick={handleSkip}
            className="px-4 py-2 rounded text-gray-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            Skip (load without images)
          </button>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded bg-slate-700 text-gray-300 hover:bg-slate-600 transition-colors"
            >
              Cancel Load
            </button>
            <button
              onClick={handleConfirm}
              disabled={!allFilesSelected && selectedCount === 0}
              className={`px-4 py-2 rounded font-medium transition-colors ${
                allFilesSelected || selectedCount > 0
                  ? 'bg-blue-600 text-white hover:bg-blue-500'
                  : 'bg-slate-700 text-gray-500 cursor-not-allowed'
              }`}
            >
              {allFilesSelected ? 'Restore All' : `Restore (${selectedCount})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
