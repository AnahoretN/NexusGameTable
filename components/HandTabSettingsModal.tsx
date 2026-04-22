import React, { useState, useCallback, useEffect } from 'react';
import { Player, AppLanguage } from '../types';
import {
  PermissionEditor,
  PermissionType,
  createPermissions
} from './PermissionEditor';

interface HandTabSettingsModalProps {
  player: Player;
  players: Player[];
  activePlayerId: string;
  isGM: boolean;
  onSave: (updatedPlayer: Player) => void;
  onScaleChange?: (newScale: number) => void;
  onPlayerChange?: (updatedPlayer: Player) => void;
  language?: AppLanguage;
}

export const HandTabSettingsModal: React.FC<HandTabSettingsModalProps> = ({
  player,
  players,
  activePlayerId: _activePlayerId,
  isGM: _isGM,
  onSave: _onSave,
  onScaleChange,
  onPlayerChange,
  language = 'en'
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

  const handleAddPermission = useCallback((type: PermissionType, playerId: string) => {
    setTempPlayer(prev => {
      const targetArray = type === 'visible'
        ? prev.handVisibleToPlayerIds || []
        : prev.handManageableByPlayerIds || [];

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

  const handleRemovePermission = useCallback((type: PermissionType, playerId: string) => {
    setTempPlayer(prev => {
      const updatedPlayer = { ...prev };

      if (type === 'visible') {
        updatedPlayer.handVisibleToPlayerIds = (prev.handVisibleToPlayerIds || []).filter(id => id !== playerId);
      } else {
        updatedPlayer.handManageableByPlayerIds = (prev.handManageableByPlayerIds || []).filter(id => id !== playerId);
      }

      return updatedPlayer;
    });
  }, []);

  const permissions = createPermissions(
    tempPlayer.handVisibleToPlayerIds,
    tempPlayer.handManageableByPlayerIds,
    undefined, // No editable for hands
    'hand',
    language
  );

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

      <PermissionEditor
        permissions={permissions}
        players={players}
        onAddPermission={handleAddPermission}
        onRemovePermission={handleRemovePermission}
        language={language}
        showEmptyState={true}
        stopPropagation={true}
      />
    </div>
  );
};