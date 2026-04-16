import React, { useEffect, Suspense } from 'react';
import { GameProvider } from './store/GameContext';
import { PlayerProvider } from './store/contexts/PlayerContext';
import { ViewTransformProvider } from './store/contexts/ViewTransformContext';
import { UIProvider } from './store/contexts/UIContext';
import { LocalSettingsProvider } from './hooks/useLocalSettings';
import { Tabletop } from './components/Tabletop';
import { memoryManager, perfMonitor } from './utils';

// Performance monitoring component
const PerformanceMonitor: React.FC = () => {
  useEffect(() => {
    // Start memory manager
    memoryManager.start();

    // Optional: Set up periodic performance logging
    const perfLogInterval = setInterval(() => {
      if (process.env.NODE_ENV === 'development') {
        perfMonitor.printReport();
        memoryManager.printMemoryStats();
      }
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
      <UIProvider>
        <ViewTransformProvider>
          <GameProvider>
            <PlayerProvider>
              <PerformanceMonitor />
              <div className="w-full h-screen overflow-hidden">
                <Tabletop />
              </div>
            </PlayerProvider>
          </GameProvider>
        </ViewTransformProvider>
      </UIProvider>
    </LocalSettingsProvider>
  );
};

export default App;
