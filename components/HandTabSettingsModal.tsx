import React, { useState, useCallback, useEffect } from 'react';
import { Player } from '../types';
import { User, Users, X as XIcon } from 'lucide-react';

interface HandTabSettingsModalProps {
  player: Player;
  players: Player[];
  activePlayerId: string;
  isGM: boolean;
  onSave: (updatedPlayer: Player) => void;
  onScaleChange?: (newScale: number) => void;
  onPlayerChange?: (updatedPlayer: Player) => void;
}

type AccessType = 'visible' | 'manageable';

export const HandTabSettingsModal: React.FC<HandTabSettingsModalProps> = ({
  player,
  players,
  activePlayerId: _activePlayerId,
  isGM: _isGM,
  onSave: _onSave,
  onScaleChange,
  onPlayerChange
}) => {
  const [tempPlayer, setTempPlayer] = useState<Player>({
    ...player,
    handVisibleToPlayerIds: player.handVisibleToPlayerIds || [],
    handManageableByPlayerIds: player.handManageableByPlayerIds || []
  });
  const [cardScale, setCardScale] = useState(1);

  // Load card scale from localStorage for this player
  useEffect(() => {
    try {
      const key = `hand-card-scale-${player.id}`;
      const savedScale = localStorage.getItem(key);
      if (savedScale) {
        setCardScale(parseFloat(savedScale));
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [player.id]);

  // Sync tempPlayer with player prop when it changes
  useEffect(() => {
    setTempPlayer({
      ...player,
      handVisibleToPlayerIds: player.handVisibleToPlayerIds || [],
      handManageableByPlayerIds: player.handManageableByPlayerIds || []
    });
  }, [player.id, player.name, player.handVisibleToPlayerIds, player.handManageableByPlayerIds]);

  // Notify parent when tempPlayer changes (for external save button)
  useEffect(() => {
    if (onPlayerChange && tempPlayer.id === player.id) {
      onPlayerChange(tempPlayer);
    }
  }, [tempPlayer, onPlayerChange, player.id]);

  const handleAddAccess = useCallback((type: AccessType, playerId: string) => {
    setTempPlayer(prev => {
      const visibleArray = prev.handVisibleToPlayerIds || [];
      const manageableArray = prev.handManageableByPlayerIds || [];

      const targetArray = type === 'visible' ? visibleArray : manageableArray;

      if (targetArray.includes(playerId)) return prev;

      const updatedPlayer = { ...prev };

      if (type === 'visible') {
        updatedPlayer.handVisibleToPlayerIds = [...targetArray, playerId];
      } else {
        updatedPlayer.handManageableByPlayerIds = [...targetArray, playerId];
      }

      return updatedPlayer;
    });
  }, []);

  const handleRemoveAccess = useCallback((type: AccessType, playerId: string) => {
    setTempPlayer(prev => {
      const visibleArray = prev.handVisibleToPlayerIds || [];
      const manageableArray = prev.handManageableByPlayerIds || [];

      const updatedPlayer = { ...prev };

      if (type === 'visible') {
        updatedPlayer.handVisibleToPlayerIds = visibleArray.filter(id => id !== playerId);
      } else {
        updatedPlayer.handManageableByPlayerIds = manageableArray.filter(id => id !== playerId);
      }

      return updatedPlayer;
    });
  }, []);

  // Get player info
  const getPlayerInfo = useCallback((playerId: string) => {
    if (playerId === 'all_players') {
      return { name: 'All Players', icon: Users };
    }
    const foundPlayer = players.find(p => p.id === playerId);
    return {
      name: foundPlayer?.name || 'Player',
      icon: User
    };
  }, [players]);

  return (
    <div onClick={(e) => e.stopPropagation()}>
      {/* Player Name */}
      <div className="p-4 border-b border-slate-700">
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Player Name
        </label>
        <input
          type="text"
          value={tempPlayer.name}
          onChange={(e) => setTempPlayer(prev => ({ ...prev, name: e.target.value }))}
          onMouseDown={(e) => e.stopPropagation()}
          className="w-full bg-slate-700 text-white px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Card Scale */}
      <div className="p-4 border-b border-slate-700">
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Card Scale: {Math.round(cardScale * 100)}%
        </label>
        <input
          type="range"
          min="0.5"
          max="2"
          step="0.01"
          value={cardScale}
          onChange={(e) => {
            const newScale = parseFloat(e.target.value);
            setCardScale(newScale);
            if (onScaleChange) {
              onScaleChange(newScale);
            }
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className="w-full cursor-pointer"
        />
        <div className="flex justify-between text-xs text-slate-500 mt-1">
          <span>50%</span>
          <span>100%</span>
          <span>200%</span>
        </div>
      </div>

      {/* Who can see this hand */}
      <div className="p-4 border-b border-slate-700">
        <h3 className="text-sm font-medium text-slate-300 mb-3">Who Can View This Hand</h3>
        <div className="space-y-2">
          {tempPlayer.handVisibleToPlayerIds && tempPlayer.handVisibleToPlayerIds.length > 0 ? (
            tempPlayer.handVisibleToPlayerIds.map(playerId => {
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
                    onMouseDown={(e) => e.stopPropagation()}
                    className="p-1 text-slate-400 hover:text-red-400 transition-colors"
                  >
                    <XIcon size={16} />
                  </button>
                </div>
              );
            })
          ) : (
            <p className="text-xs text-slate-500 italic">No players with view access yet</p>
          )}

          {/* Add specific player */}
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) {
                handleAddAccess('visible', e.target.value);
                e.target.value = '';
              }
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full bg-slate-700 text-white px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 mt-2 cursor-pointer relative z-[1001]"
          >
            <option value="">Add player...</option>
            {(!tempPlayer.handVisibleToPlayerIds || !tempPlayer.handVisibleToPlayerIds.includes('all_players')) && (
              <option value="all_players">All Players</option>
            )}
            {players
              .filter(p => !p.isGM && !tempPlayer.handVisibleToPlayerIds?.includes(p.id))
              .map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
          </select>
        </div>
      </div>

      {/* Who can manage this hand */}
      <div className="p-4">
        <h3 className="text-sm font-medium text-slate-300 mb-2">Who Can Manage This Hand</h3>
        <p className="text-xs text-slate-500 mb-3">
          Can reorder and manipulate cards in this hand
        </p>
        <div className="space-y-2">
          {tempPlayer.handManageableByPlayerIds && tempPlayer.handManageableByPlayerIds.length > 0 ? (
            tempPlayer.handManageableByPlayerIds.map(playerId => {
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
                    onMouseDown={(e) => e.stopPropagation()}
                    className="p-1 text-slate-400 hover:text-red-400 transition-colors"
                  >
                    <XIcon size={16} />
                  </button>
                </div>
              );
            })
          ) : (
            <p className="text-xs text-slate-500 italic">No players with manage access yet</p>
          )}

          {/* Add specific player */}
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) {
                handleAddAccess('manageable', e.target.value);
                e.target.value = '';
              }
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full bg-slate-700 text-white px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 mt-2 cursor-pointer relative z-[1001]"
          >
            <option value="">Add player...</option>
            {(!tempPlayer.handManageableByPlayerIds || !tempPlayer.handManageableByPlayerIds.includes('all_players')) && (
              <option value="all_players">All Players</option>
            )}
            {players
              .filter(p => !p.isGM && !tempPlayer.handManageableByPlayerIds?.includes(p.id))
              .map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
          </select>
        </div>
      </div>
    </div>
  );
};