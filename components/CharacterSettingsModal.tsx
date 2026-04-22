import React, { useState, useCallback, useEffect } from 'react';
import { CharacterTab, Player } from '../types';
import {
  PermissionEditor,
  PermissionType,
  createPermissions
} from './PermissionEditor';

interface CharacterSettingsModalProps {
  character: CharacterTab;
  players: Player[];
  onSave: (updatedCharacter: CharacterTab) => void;
  onCharacterChange?: (updatedCharacter: CharacterTab) => void;
}

export const CharacterSettingsModal: React.FC<CharacterSettingsModalProps> = ({
  character,
  players,
  onSave: _onSave,
  onCharacterChange
}) => {
  const [tempCharacter, setTempCharacter] = useState<CharacterTab>(character);

  // Sync tempCharacter with character prop when it changes
  useEffect(() => {
    setTempCharacter(character);
  }, [character.id, character.characterName, character.visibleToPlayerIds, character.manageableByPlayerIds, character.editableByPlayerIds]);

  // Notify parent when tempCharacter changes (for external save button)
  useEffect(() => {
    if (onCharacterChange && tempCharacter.id === character.id) {
      onCharacterChange(tempCharacter);
    }
  }, [tempCharacter, onCharacterChange, character.id]);

  const handleAddPermission = useCallback((type: PermissionType, playerId: string) => {
    setTempCharacter(prev => {
      const targetArray = type === 'visible'
        ? prev.visibleToPlayerIds || []
        : type === 'manageable'
          ? prev.manageableByPlayerIds || []
          : prev.editableByPlayerIds || [];

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

  const handleRemovePermission = useCallback((type: PermissionType, playerId: string) => {
    setTempCharacter(prev => {
      const updatedCharacter = { ...prev };

      if (type === 'visible') {
        updatedCharacter.visibleToPlayerIds = (prev.visibleToPlayerIds || []).filter(id => id !== playerId);
      } else if (type === 'manageable') {
        updatedCharacter.manageableByPlayerIds = (prev.manageableByPlayerIds || []).filter(id => id !== playerId);
      } else {
        updatedCharacter.editableByPlayerIds = (prev.editableByPlayerIds || []).filter(id => id !== playerId);
      }

      return updatedCharacter;
    });
  }, []);

  const permissions = createPermissions(
    tempCharacter.visibleToPlayerIds,
    tempCharacter.manageableByPlayerIds,
    tempCharacter.editableByPlayerIds,
    'character'
  );

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

      <PermissionEditor
        permissions={permissions}
        players={players}
        onAddPermission={handleAddPermission}
        onRemovePermission={handleRemovePermission}
      />
    </>
  );
};
