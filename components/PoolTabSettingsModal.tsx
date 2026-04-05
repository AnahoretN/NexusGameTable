import React, { useState, useCallback, useEffect } from 'react';
import { PanelTab, Player } from '../types';
import { User, Users, X as XIcon } from 'lucide-react';

interface PoolTabSettingsModalProps {
  tab: PanelTab;
  players: Player[];
  activePlayerId: string;
  isGM: boolean;
  onSave: (updatedTab: PanelTab) => void;
  onTabChange?: (updatedTab: PanelTab) => void;
}

type AccessType = 'visible' | 'manageable' | 'editable';

export const PoolTabSettingsModal: React.FC<PoolTabSettingsModalProps> = ({
  tab,
  players,
  activePlayerId,
  isGM,
  onSave,
  onTabChange
}) => {
  const [tempTab, setTempTab] = useState<PanelTab>(tab);

  // Sync tempTab with tab prop when it changes - use key fields to detect changes
  useEffect(() => {
    setTempTab(tab);
  }, [tab.id, tab.name, tab.visibleToPlayerIds, tab.manageableByPlayerIds, tab.editableByPlayerIds]);

  // Notify parent when tempTab changes (for external save button)
  useEffect(() => {
    if (onTabChange && tempTab.id === tab.id) {
      onTabChange(tempTab);
    }
  }, [tempTab, onTabChange, tab.id]);

  const handleAddAccess = useCallback((type: AccessType, playerId: string) => {
    setTempTab(prev => {
      let targetArray: string[];

      if (type === 'visible') {
        targetArray = prev.visibleToPlayerIds || [];
      } else if (type === 'manageable') {
        targetArray = prev.manageableByPlayerIds || [];
      } else {
        targetArray = prev.editableByPlayerIds || [];
      }

      if (targetArray.includes(playerId)) return prev;

      const updatedTab = { ...prev };

      if (type === 'visible') {
        updatedTab.visibleToPlayerIds = [...targetArray, playerId];
      } else if (type === 'manageable') {
        updatedTab.manageableByPlayerIds = [...targetArray, playerId];
      } else {
        updatedTab.editableByPlayerIds = [...targetArray, playerId];
      }

      return updatedTab;
    });
  }, []);

  const handleRemoveAccess = useCallback((type: AccessType, playerId: string) => {
    setTempTab(prev => {
      let targetArray: string[];

      if (type === 'visible') {
        targetArray = prev.visibleToPlayerIds || [];
      } else if (type === 'manageable') {
        targetArray = prev.manageableByPlayerIds || [];
      } else {
        targetArray = prev.editableByPlayerIds || [];
      }

      const updatedTab = { ...prev };

      if (type === 'visible') {
        updatedTab.visibleToPlayerIds = targetArray.filter(id => id !== playerId);
      } else if (type === 'manageable') {
        updatedTab.manageableByPlayerIds = targetArray.filter(id => id !== playerId);
      } else {
        updatedTab.editableByPlayerIds = targetArray.filter(id => id !== playerId);
      }

      return updatedTab;
    });
  }, []);

  // Get player info
  const getPlayerInfo = useCallback((playerId: string) => {
    if (playerId === 'all_players') {
      return { name: 'All Players', icon: Users };
    }
    const player = players.find(p => p.id === playerId);
    return {
      name: player?.name || 'Player',
      icon: User
    };
  }, [players]);

  return (
    <>
      {/* Tab Name */}
      <div className="p-4 border-b border-slate-700">
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Tab Name
        </label>
        <input
          type="text"
          value={tempTab.name}
          onChange={(e) => setTempTab(prev => ({ ...prev, name: e.target.value }))}
          className="w-full bg-slate-700 text-white px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Zoom Level */}
      <div className="p-4 border-b border-slate-700">
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Zoom Level: {Math.round(((tempTab.zoom || 1.02) / 1.02) * 100)}%
        </label>
        <input
          type="range"
          min="0.5"
          max="2"
          step="0.1"
          value={tempTab.zoom || 1.02}
          onChange={(e) => setTempTab(prev => ({ ...prev, zoom: parseFloat(e.target.value) }))}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-slate-500 mt-1">
          <span>{Math.round((0.5 / 1.02) * 100)}%</span>
          <span>100%</span>
          <span>{Math.round((2.0 / 1.02) * 100)}%</span>
        </div>
      </div>

      {/* Who can see */}
      <div className="p-4 border-b border-slate-700">
        <h3 className="text-sm font-medium text-slate-300 mb-3">Who Can View</h3>
        <div className="space-y-2">
          {tempTab.visibleToPlayerIds?.map(playerId => {
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
            {!tempTab.visibleToPlayerIds?.includes('all_players') && (
              <option value="all_players">All Players</option>
            )}
            {players
              .filter(p => !p.isGM && !tempTab.visibleToPlayerIds?.includes(p.id))
              .map(player => (
                <option key={player.id} value={player.id}>{player.name}</option>
              ))}
          </select>
        </div>
      </div>

      {/* Who can manage */}
      <div className="p-4 border-b border-slate-700">
        <h3 className="text-sm font-medium text-slate-300 mb-2">Who Can Manage</h3>
        <p className="text-xs text-slate-500 mb-3">
          Can move and manipulate objects in the pool
        </p>
        <div className="space-y-2">
          {tempTab.manageableByPlayerIds?.map(playerId => {
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
            {!tempTab.manageableByPlayerIds?.includes('all_players') && (
              <option value="all_players">All Players</option>
            )}
            {players
              .filter(p => !p.isGM && !tempTab.manageableByPlayerIds?.includes(p.id))
              .map(player => (
                <option key={player.id} value={player.id}>{player.name}</option>
              ))}
          </select>
        </div>
      </div>

      {/* Who can edit */}
      <div className="p-4">
        <h3 className="text-sm font-medium text-slate-300 mb-2">Who Can Edit</h3>
        <p className="text-xs text-slate-500 mb-3">
          Full access: can add/remove objects and modify everything
        </p>
        <div className="space-y-2">
          {tempTab.editableByPlayerIds?.map(playerId => {
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
            {!tempTab.editableByPlayerIds?.includes('all_players') && (
              <option value="all_players">All Players</option>
            )}
            {players
              .filter(p => !p.isGM && !tempTab.editableByPlayerIds?.includes(p.id))
              .map(player => (
                <option key={player.id} value={player.id}>{player.name}</option>
              ))}
          </select>
        </div>
      </div>
    </>
  );
};
