import { t as translate, Locale } from '../utils/translations';
import React from 'react';
import { createPortal } from 'react-dom';
import { UserX } from 'lucide-react';
import { useLanguage } from '../store/contexts';

interface RemovedPlayerModalProps {
  /** Called when the player acknowledges the removal (OK). */
  onOk: () => void;
}

/**
 * 🔧 KICK: full-screen blocking modal shown to a guest the host removed from
 * the session. Blocks all input until OK — after that the client stays offline
 * with its local copy of the game (re-joining via the invite link is allowed).
 */
export const RemovedPlayerModal: React.FC<RemovedPlayerModalProps> = ({ onOk }) => {
  const language = useLanguage();

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-200"
      style={{ zIndex: 2147483000, pointerEvents: 'auto' }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="bg-slate-900 border border-red-500/50 rounded-xl shadow-2xl p-6 w-[420px] relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent opacity-50" />

        <div className="flex flex-col gap-4 relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
              <UserX className="text-red-500" size={20} />
            </div>
            <h3 className="text-xl font-bold text-white">
              {translate('You have been removed from the game session', language as Locale)}
            </h3>
          </div>

          <button
            onClick={onOk}
            className="w-full px-4 py-3 rounded-lg bg-red-600 text-white font-bold hover:bg-red-500 transition-all shadow-lg shadow-red-900/20 flex items-center justify-center gap-2 mt-2"
          >
            {translate('OK', language as Locale)}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
