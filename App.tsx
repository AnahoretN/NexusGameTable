import React, { useEffect, Suspense, lazy } from 'react';
import { GameProvider } from './store/GameContext';
import { PlayerProvider } from './store/contexts/PlayerContext';
import { ViewTransformProvider } from './store/contexts/ViewTransformContext';
import { UIProvider } from './store/contexts/UIContext';
import { LocalSettingsProvider } from './hooks/useLocalSettings';
import { ToolSettingsProvider } from './contexts/ToolSettingsContext';
import { memoryManager, perfMonitor } from './utils';

// Lazy load components for better initial load performance
const Tabletop = lazy(() => import('./components/Tabletop').then(m => ({ default: m.Tabletop })));
const MainMenuContent = lazy(() => import('./components/MainMenuContent').then(m => ({ default: m.MainMenuContentMemoized })));

// Performance monitoring component
const PerformanceMonitor: React.FC = () => {
  useEffect(() => {
    // Start memory manager
    memoryManager.start();

    // Optional: Set up periodic performance logging (disabled)
    const perfLogInterval = setInterval(() => {
      // Performance logging disabled
    }, 300000); // Every 5 minutes


    return () => {
      memoryManager.stop();
      clearInterval(perfLogInterval);
    };
  }, []);

  return null; // This component doesn't render anything
};

const App: React.FC = () => {
  return (
    <LocalSettingsProvider>
      <ViewTransformProvider>
        <ToolSettingsProvider>
          <UIProvider>
            <GameProvider>
              <PlayerProvider>
                <PerformanceMonitor />
                <div className="w-full h-screen overflow-hidden">
                  <Suspense fallback={
                    <div className="w-full h-screen flex items-center justify-center bg-slate-900">
                      <div className="text-white text-lg">Loading...</div>
                    </div>
                  }>
                    <Tabletop />
                  </Suspense>
                </div>
              </PlayerProvider>
            </GameProvider>
          </UIProvider>
        </ToolSettingsProvider>
      </ViewTransformProvider>
    </LocalSettingsProvider>
  );
};

export default App;
