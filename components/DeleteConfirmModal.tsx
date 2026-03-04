import { t as translate, Locale } from '../utils/translations';
import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';
import { AppLanguage } from '../types';

interface DeleteConfirmModalProps {
  objectName: string;
  onConfirm: () => void;
  onCancel: () => void;
  language?: AppLanguage;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({ objectName, onConfirm, onCancel, language = 'en' }) => {

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-red-500/50 rounded-xl shadow-2xl p-6 w-[400px] relative overflow-hidden">
        {/* Background glow effect */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent opacity-50" />

        <div className="flex flex-col items-center text-center gap-4 relative z-10">
          <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-2">
            <AlertTriangle className="text-red-500" size={24} />
          </div>

          <h3 className="text-xl font-bold text-white">{translate('Delete', language as Locale)}</h3>

          <p className="text-slate-300 text-sm leading-relaxed">
            {translate(`Are you sure you want to delete "${objectName}"?`, language as Locale)}
            <br/>
            <span className="text-red-400 text-xs mt-1 block">{translate('This action cannot be undone.', language as Locale)}</span>
          </p>

          <div className="flex gap-3 w-full mt-4">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 text-slate-300 font-medium hover:bg-slate-700 hover:text-white transition-colors border border-slate-700"
            >
              {translate('Cancel', language as Locale)}
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 text-white font-bold hover:bg-red-500 transition-all shadow-lg shadow-red-900/20"
            >
              {translate('Delete', language as Locale)}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
