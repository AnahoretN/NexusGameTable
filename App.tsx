import React from 'react';
import { GameProvider } from './store/GameContext';
import { Tabletop } from './components/Tabletop';

const App: React.FC = () => {
  return (
    <GameProvider>
      <div className="w-full h-screen overflow-hidden">
        <Tabletop />
      </div>
    </GameProvider>
  );
};

export default App;
