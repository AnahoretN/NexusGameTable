import React, { useState, useCallback } from 'react';
import { CharacterTab, Player } from '../types';
import { User, Users, X as XIcon } from 'lucide-react';

interface CharacterSettingsModalProps {
  character: CharacterTab;
  players: Player[];
  activePlayerId: string;
  isGM: boolean;
  canEditCharacter: boolean;
  onSave: (updatedCharacter: CharacterTab) => void;
}

type AccessType = 'visible' | 'manageable' | 'editable';

export const CharacterSettingsModal: React.FC<CharacterSettingsModalProps> = ({
  character,
  players,
  activePlayerId,
  isGM,
  canEditCharacter,
  onSave
}) => {
  const [tempCharacter, setTempCharacter] = useState<CharacterTab>(character);

  const handleAddAccess = useCallback((type: AccessType, playerId: string) => {
    setTempCharacter(prev => {
      let targetArray: string[];

      if (type === 'visible') {
        targetArray = prev.visibleToPlayerIds || [];
      } else if (type === 'manageable') {
        targetArray = prev.manageableByPlayerIds || [];
      } else {
        targetArray = prev.editableByPlayerIds || [];
      }

      if (targetArray.includes(playerId)) return prev;

      const updatedCharacter = { ...prev };

      if (type === 'visible') {
        updatedCharacter.visibleToPlayerIds = [...targetArray, playerId];
      } else if (type === 'manageable') {
        updatedCharacter.manageableByPlayerIds = [...targetArray, playerId];
      } else {
        updatedCharacter.editableByPlayerIds = [...targetArray, playerId];
      }

      return updatedCharacter;
    });
  }, []);

  const handleRemoveAccess = useCallback((type: AccessType, playerId: string) => {
    setTempCharacter(prev => {
      let targetArray: string[];

      if (type === 'visible') {
        targetArray = prev.visibleToPlayerIds || [];
      } else if (type === 'manageable') {
        targetArray = prev.manageableByPlayerIds || [];
      } else {
        targetArray = prev.editableByPlayerIds || [];
      }

      const updatedCharacter = { ...prev };

      if (type === 'visible') {
        updatedCharacter.visibleToPlayerIds = targetArray.filter(id => id !== playerId);
      } else if (type === 'manageable') {
        updatedCharacter.manageableByPlayerIds = targetArray.filter(id => id !== playerId);
      } else {
        updatedCharacter.editableByPlayerIds = targetArray.filter(id => id !== playerId);
      }

      return updatedCharacter;
    });
  }, []);

  // Get player info
  const getPlayerInfo = useCallback((playerId: string) => {
    if (playerId === 'all_players') {
      return { name: 'All Players', icon: Users };
    }
    if (playerId === 'gm') {
      return { name: 'GM', icon: Shield };
    }
    const player = players.find(p => p.id === playerId);
    return {
      name: player?.name || 'Player',
      icon: User
    };
  }, [players]);

  return (
    <>
      {/* Character Name */}
      <div className="p-4 border-b border-slate-700">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Character Name
            </label>
            <input
              type="text"
              value={tempCharacter.characterName}
              onChange={(e) => setTempCharacter(prev => ({ ...prev, characterName: e.target.value }))}
              className="w-full bg-slate-700 text-white px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Who can see */}
          <div className="p-4 border-b border-slate-700">
            <h3 className="text-sm font-medium text-slate-300 mb-3">Who Can View</h3>
            <div className="space-y-2">
              {tempCharacter.visibleToPlayerIds?.map(playerId => {
                const playerInfo = getPlayerInfo(playerId);
                const Icon = playerInfo.icon;
                return (
                  <div
                    key={playerId}
                    className="flex items-center justify-between bg-purple-900 bg-opacity-40 px-3 py-2 rounded border border-purple-700"
                  >
                    <div className="flex items-center gap-2">
                      <Icon size={16} className="text-purple-400" />
                      <span className="text-sm text-white">{playerInfo.name}</span>
                    </div>
                    <button
                      onClick={() => handleRemoveAccess('visible', playerId)}
                      className="p-1 text-slate-400 hover:text-red-400 transition-colors"
                    >
                      <XIcon size={16} />
                    </button>
                  </div>
                );
              })}

              {/* Add specific player */}
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    handleAddAccess('visible', e.target.value);
                    e.target.value = '';
                  }
                }}
                className="w-full bg-slate-700 text-white px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 mt-2"
              >
                <option value="">Add player...</option>
                {players.filter(p => !tempCharacter.visibleToPlayerIds?.includes(p.id)).map(player => (
                  <option key={player.id} value={player.id}>{player.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Who can manage */}
          <div className="p-4 border-b border-slate-700">
            <h3 className="text-sm font-medium text-slate-300 mb-2">Who Can Manage</h3>
            <p className="text-xs text-slate-500 mb-3">
              Can change values, text, move sliders, but cannot add/remove blocks, columns, or rows
            </p>
            <div className="space-y-2">
              {tempCharacter.manageableByPlayerIds?.map(playerId => {
                const playerInfo = getPlayerInfo(playerId);
                const Icon = playerInfo.icon;
                return (
                  <div
                    key={playerId}
                    className="flex items-center justify-between bg-blue-900 bg-opacity-40 px-3 py-2 rounded border border-blue-700"
                  >
                    <div className="flex items-center gap-2">
                      <Icon size={16} className="text-blue-400" />
                      <span className="text-sm text-white">{playerInfo.name}</span>
                    </div>
                    <button
                      onClick={() => handleRemoveAccess('manageable', playerId)}
                      className="p-1 text-slate-400 hover:text-red-400 transition-colors"
                    >
                      <XIcon size={16} />
                    </button>
                  </div>
                );
              })}

              {/* Add specific player */}
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    handleAddAccess('manageable', e.target.value);
                    e.target.value = '';
                  }
                }}
                className="w-full bg-slate-700 text-white px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 mt-2"
              >
                <option value="">Add player...</option>
                {players.filter(p => !tempCharacter.manageableByPlayerIds?.includes(p.id)).map(player => (
                  <option key={player.id} value={player.id}>{player.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Who can edit */}
          <div className="p-4">
            <h3 className="text-sm font-medium text-slate-300 mb-2">Who Can Edit</h3>
            <p className="text-xs text-slate-500 mb-3">
              Full access: can add/remove blocks, columns, rows, and modify everything
            </p>
            <div className="space-y-2">
              {tempCharacter.editableByPlayerIds?.map(playerId => {
                const playerInfo = getPlayerInfo(playerId);
                const Icon = playerInfo.icon;
                return (
                  <div
                    key={playerId}
                    className="flex items-center justify-between bg-green-900 bg-opacity-40 px-3 py-2 rounded border border-green-700"
                  >
                    <div className="flex items-center gap-2">
                      <Icon size={16} className="text-green-400" />
                      <span className="text-sm text-white">{playerInfo.name}</span>
                    </div>
                    <button
                      onClick={() => handleRemoveAccess('editable', playerId)}
                      className="p-1 text-slate-400 hover:text-red-400 transition-colors"
                    >
                      <XIcon size={16} />
                    </button>
                  </div>
                );
              })}

              {/* Add specific player */}
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    handleAddAccess('editable', e.target.value);
                    e.target.value = '';
                  }
                }}
                className="w-full bg-slate-700 text-white px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 mt-2"
              >
                <option value="">Add player...</option>
                {players.filter(p => !tempCharacter.editableByPlayerIds?.includes(p.id)).map(player => (
                  <option key={player.id} value={player.id}>{player.name}</option>
                ))}
              </select>
            </div>
          </div>
    </>
  );
};
