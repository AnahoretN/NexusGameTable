import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { User, Check } from 'lucide-react';

interface PlayerNameModalProps {
  isOpen: boolean;
  onSubmit: (name: string) => void;
  defaultName?: string;
  title?: string;
}

export const PlayerNameModal: React.FC<PlayerNameModalProps> = ({
  isOpen,
  onSubmit,
  defaultName = 'Player',
  title = 'Join Game'
}) => {
  const [name, setName] = useState(defaultName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName(defaultName);
      // Focus input and select text after modal is rendered
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isOpen, defaultName]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (trimmedName) {
      onSubmit(trimmedName);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-purple-500/50 rounded-xl shadow-2xl p-6 w-[400px] relative overflow-hidden">
        {/* Background glow effect */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-purple-500 to-transparent opacity-50" />

        <div className="flex flex-col gap-4 relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
              <User className="text-purple-500" size={20} />
            </div>
            <h3 className="text-xl font-bold text-white">{title}</h3>
          </div>

          <p className="text-slate-300 text-sm">
            Enter your name to join the game session:
          </p>

          <form onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white text-lg focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
              maxLength={20}
            />
          </form>

          <button
            onClick={handleSubmit}
            disabled={!name.trim()}
            className="w-full px-4 py-3 rounded-lg bg-purple-600 text-white font-bold hover:bg-purple-500 transition-all shadow-lg shadow-purple-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
          >
            <Check size={18} />
            Join Game
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
