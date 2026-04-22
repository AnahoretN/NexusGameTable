import React, { useState, useCallback, useEffect } from 'react';
import { PanelTab, Player, AppLanguage } from '../types';
import {
  PermissionEditor,
  PermissionType,
  createPermissions
} from './PermissionEditor';

interface PoolTabSettingsModalProps {
  tab: PanelTab;
  players: Player[];
  activePlayerId: string;
  isGM: boolean;
  onSave: (updatedTab: PanelTab) => void;
  onTabChange?: (updatedTab: PanelTab) => void;
  language?: AppLanguage;
}

export const PoolTabSettingsModal: React.FC<PoolTabSettingsModalProps> = ({
  tab,
  players,
  activePlayerId,
  isGM,
  onSave,
  onTabChange,
  language = 'en'
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

  const handleAddPermission = useCallback((type: PermissionType, playerId: string) => {
    setTempTab(prev => {
      const targetArray = type === 'visible'
        ? prev.visibleToPlayerIds || []
        : type === 'manageable'
          ? prev.manageableByPlayerIds || []
          : prev.editableByPlayerIds || [];

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

  const handleRemovePermission = useCallback((type: PermissionType, playerId: string) => {
    setTempTab(prev => {
      const updatedTab = { ...prev };

      if (type === 'visible') {
        updatedTab.visibleToPlayerIds = (prev.visibleToPlayerIds || []).filter(id => id !== playerId);
      } else if (type === 'manageable') {
        updatedTab.manageableByPlayerIds = (prev.manageableByPlayerIds || []).filter(id => id !== playerId);
      } else {
        updatedTab.editableByPlayerIds = (prev.editableByPlayerIds || []).filter(id => id !== playerId);
      }

      return updatedTab;
    });
  }, []);

  const permissions = createPermissions(
    tempTab.visibleToPlayerIds,
    tempTab.manageableByPlayerIds,
    tempTab.editableByPlayerIds,
    'pool',
    language
  );

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

      <PermissionEditor
        permissions={permissions}
        players={players}
        onAddPermission={handleAddPermission}
        onRemovePermission={handleRemovePermission}
        language={language}
      />
    </>
  );
};
