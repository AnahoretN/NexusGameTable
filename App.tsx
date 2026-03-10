import React from 'react';
import { GameProvider } from './store/GameContext';
import { LocalSettingsProvider } from './hooks/useLocalSettings';
import { Tabletop } from './components/Tabletop';

const App: React.FC = () => {
  return (
    <LocalSettingsProvider>
      <GameProvider>
        <div className="w-full h-screen overflow-hidden">
          <Tabletop />
        </div>
      </GameProvider>
    </LocalSettingsProvider>
  );
};

export default App;
