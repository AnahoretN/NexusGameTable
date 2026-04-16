import React, { useEffect, Suspense } from 'react';
import { GameProvider } from './store/GameContext';
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
      <GameProvider>
        <PerformanceMonitor />
        <div className="w-full h-screen overflow-hidden">
          <Tabletop />
        </div>
      </GameProvider>
    </LocalSettingsProvider>
  );
};

export default App;
