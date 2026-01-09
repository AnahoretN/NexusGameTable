
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { GameProvider } from './store/GameContext';
import { Tabletop } from './components/Tabletop';
import { Sidebar } from './components/Sidebar';
import { SearchDeckDragPreview } from './components/SearchDeckModal';
import { GripVertical } from 'lucide-react';

const SIDEBAR_DEFAULT_WIDTH = 286;
const SIDEBAR_MIN_WIDTH = 250;
const SIDEBAR_MAX_WIDTH = 600;

const GameLayout = () => {
    const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
    const [isResizing, setIsResizing] = useState(false);
    const resizeHandleRef = useRef<HTMLDivElement>(null);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);
    }, []);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing) return;

            const newWidth = window.innerWidth - e.clientX;
            setSidebarWidth(Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, newWidth)));
        };

        const handleMouseUp = () => {
            setIsResizing(false);
        };

        if (isResizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);

            return () => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [isResizing]);

    return (
        <div className="flex w-full h-screen overflow-hidden">
            {/* Main Game Area */}
            <div className="flex-1 relative">
                <Tabletop />
            </div>

            {/* Global drag preview for search deck modal */}
            <SearchDeckDragPreview />

            {/* Resize Handle */}
            <div
                ref={resizeHandleRef}
                onMouseDown={handleMouseDown}
                className={`cursor-col-resize bg-slate-700 hover:bg-purple-500 transition-colors relative z-40 flex items-center justify-center select-none
                    ${isResizing ? 'w-2' : 'w-1'}`}
                style={{ minWidth: isResizing ? '8px' : '4px' }}
            >
                <GripVertical size={14} className="text-slate-500 opacity-50 hover:opacity-100" />
            </div>

            {/* Sidebar */}
            <Sidebar width={sidebarWidth} />
        </div>
    );
}

const App: React.FC = () => {
  return (
    <GameProvider>
      <GameLayout />
    </GameProvider>
  );
};

export default App;
