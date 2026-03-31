import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useGame } from '../store/GameContext';
import { PanelObject, CharacterTab, CharacterBlock, CharacterBlockType, AppLanguage } from '../types';
import { Plus, Trash2, Lock, Type as TypeIcon, Image as ImageIcon, List, Sliders, ChevronUp, ChevronDown, Save, Upload, X } from 'lucide-react';
import { t as translate, Locale } from '../utils/translations';
import { TextBlock, SliderBlock, TableBlock, InventoryBlock, AvatarBlock, CounterBlock } from './CharacterBlocks';
import { SimpleContextMenu } from './SimpleContextMenu';
import { CharacterSettingsModal } from './CharacterSettingsModal';

interface CharacterPanelProps {
  width?: number;
  isCollapsed?: boolean;
  panel: PanelObject;
  language?: AppLanguage;
}

export const CharacterPanel: React.FC<CharacterPanelProps> = ({
  width = 400,
  isCollapsed = false,
  panel,
  language = 'en'
}) => {
  const { state, dispatch } = useGame();

  // Get character data from panel - use latest from state to ensure reactivity
  const characterData = state.objects[panel.id]?.characterData || panel.characterData;
  const [activeCharacterId, setActiveCharacterId] = useState<string>(
    characterData?.activeCharacterId || ''
  );
  const [activeColumnId, setActiveColumnId] = useState<string>('column-1');

  // Get active character - use characterData from state for reactivity
  const activeCharacter = useMemo(() => {
    if (!characterData) return null;
    return characterData.characters.find(c => c.id === activeCharacterId) || null;
  }, [characterData, activeCharacterId]);

  // Migration: Ensure all blocks have columnId and characters have columns field
  useEffect(() => {
    if (!characterData) return;

    let needsUpdate = false;
    const updatedCharacters = characterData.characters.map((char: CharacterTab) => {
      // Ensure columns field exists
      if (!char.columns || char.columns < 1) {
        needsUpdate = true;
        return { ...char, columns: 1 };
      }

      // Ensure manageableByPlayerIds field exists
      if (!char.manageableByPlayerIds) {
        needsUpdate = true;
        return { ...char, manageableByPlayerIds: [] };
      }

      // Ensure all blocks have columnId
      const hasBlocksWithoutColumnId = char.blocks.some((block: CharacterBlock) => !block.columnId);
      if (hasBlocksWithoutColumnId) {
        needsUpdate = true;
        return {
          ...char,
          blocks: char.blocks.map((block: CharacterBlock) => ({
            ...block,
            columnId: block.columnId || 'column-1'
          }))
        };
      }

      return char;
    });

    if (needsUpdate) {
      dispatch({
        type: 'UPDATE_OBJECT',
        payload: {
          id: panel.id,
          characterData: {
            ...characterData,
            characters: updatedCharacters
          }
        }
      });
    }
  }, [characterData, panel.id, dispatch]);

  // Get current player info
  const currentPlayer = state.players.find(p => p.id === state.activePlayerId);
  const isGM = currentPlayer?.isGM ?? false;

  // Check permissions for active character
  const canManageCharacter = useMemo(() => {
    if (!activeCharacter) return false;
    if (isGM) return true;

    // Check if player is owner
    if (activeCharacter.playerId === state.activePlayerId) return true;

    // Check if player is in manageable list
    if (activeCharacter.manageableByPlayerIds?.includes(state.activePlayerId)) return true;

    // Check if "all_players" is in manageable list
    if (activeCharacter.manageableByPlayerIds?.includes('all_players')) return true;

    // Check if "gm" is in manageable list and current player is GM
    if (activeCharacter.manageableByPlayerIds?.includes('gm') && isGM) return true;

    return false;
  }, [activeCharacter, isGM, state.activePlayerId]);

  const canEditCharacter = useMemo(() => {
    if (!activeCharacter) return false;
    if (isGM) return true;

    // Check if player is owner
    if (activeCharacter.playerId === state.activePlayerId) return true;

    // Check if player is in editable list
    if (activeCharacter.editableByPlayerIds.includes(state.activePlayerId)) return true;

    // Check if "all_players" is in editable list
    if (activeCharacter.editableByPlayerIds.includes('all_players')) return true;

    // Check if "gm" is in editable list and current player is GM
    if (activeCharacter.editableByPlayerIds.includes('gm') && isGM) return true;

    return false;
  }, [activeCharacter, isGM, state.activePlayerId]);

  const canViewCharacter = useMemo(() => {
    if (!activeCharacter) return false;
    if (isGM) return true;

    // Check if player is owner
    if (activeCharacter.playerId === state.activePlayerId) return true;

    // Check if player is in visible list
    if (activeCharacter.visibleToPlayerIds.includes(state.activePlayerId)) return true;

    // Check if "all_players" is in visible list
    if (activeCharacter.visibleToPlayerIds.includes('all_players')) return true;

    // Check if "gm" is in visible list and current player is GM
    if (activeCharacter.visibleToPlayerIds.includes('gm') && isGM) return true;

    return false;
  }, [activeCharacter, isGM, state.activePlayerId]);

  // Context menu state for adding blocks
  const [blockContextMenu, setBlockContextMenu] = useState<{ x: number; y: number } | null>(null);

  // Character name editing state
  const [editingCharacterName, setEditingCharacterName] = useState(false);
  const [characterNameInput, setCharacterNameInput] = useState('');

  // Block title editing state
  const [editingBlockTitle, setEditingBlockTitle] = useState<string | null>(null);
  const [blockTitleInput, setBlockTitleInput] = useState('');

  // Handler for opening block context menu
  const handleOpenBlockMenu = useCallback((e: React.MouseEvent, columnId?: string) => {
    e.preventDefault();
    e.stopPropagation();

    // Update active column when opening menu from a specific column
    if (columnId) {
      setActiveColumnId(columnId);
    }

    const rect = e.currentTarget.getBoundingClientRect();
    // Use viewport coordinates instead of screen coordinates
    setBlockContextMenu({
      x: rect.left,
      y: rect.bottom + 5 // Small offset below the button
    });
  }, []);

  // Handler for editing character name
  const handleStartEditCharacterName = useCallback(() => {
    if (!activeCharacter) return;
    if (!isGM && activeCharacter.playerId !== state.activePlayerId) return;
    setCharacterNameInput(activeCharacter.characterName);
    setEditingCharacterName(true);
  }, [activeCharacter, isGM, state.activePlayerId]);

  const handleSaveCharacterName = useCallback(() => {
    if (!characterData) return;

    const newName = characterNameInput.trim() || 'Unnamed Character';
    const updatedCharacters = characterData.characters.map(char => {
      if (char.id === activeCharacter.id) {
        return { ...char, characterName: newName };
      }
      return char;
    });

    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: panel.id,
        characterData: {
          ...characterData,
          characters: updatedCharacters
        }
      }
    });

    setEditingCharacterName(false);
  }, [characterData, activeCharacter, characterNameInput, panel.id, dispatch]);

  const handleCancelEditCharacterName = useCallback(() => {
    setEditingCharacterName(false);
    setCharacterNameInput('');
  }, []);

  // Handler for editing block title
  const handleStartEditBlockTitle = useCallback((blockId: string, currentTitle: string) => {
    if (!canEditCharacter) return;
    setBlockTitleInput(currentTitle);
    setEditingBlockTitle(blockId);
  }, [canEditCharacter]);

  const handleSaveBlockTitle = useCallback((blockId: string) => {
    if (!characterData || !activeCharacter) return;

    const newTitle = blockTitleInput.trim() || 'Untitled Block';
    const updatedCharacters = characterData.characters.map(char => {
      if (char.id === activeCharacter.id) {
        return {
          ...char,
          blocks: char.blocks.map(block =>
            block.id === blockId ? { ...block, title: newTitle } : block
          )
        };
      }
      return char;
    });

    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: panel.id,
        characterData: {
          ...characterData,
          characters: updatedCharacters
        }
      }
    });

    setEditingBlockTitle(null);
    setBlockTitleInput('');
  }, [characterData, activeCharacter, blockTitleInput, panel.id, dispatch]);

  const handleCancelEditBlockTitle = useCallback(() => {
    setEditingBlockTitle(null);
    setBlockTitleInput('');
  }, []);

  // Handler: Add new character
  const handleAddCharacter = useCallback(() => {
    if (!characterData || !isGM) return;

    const newCharacter: CharacterTab = {
      id: `char-${Date.now()}`,
      characterName: 'New Character',
      playerId: undefined, // GM can create unassigned characters
      blocks: [],
      columns: 1, // Default to 1 column
      visibleToPlayerIds: [],
      manageableByPlayerIds: [],
      editableByPlayerIds: [],
      avatarUrl: undefined
    };

    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: panel.id,
        characterData: {
          ...characterData,
          characters: [...characterData.characters, newCharacter],
          activeCharacterId: newCharacter.id
        }
      }
    });

    setActiveCharacterId(newCharacter.id);
  }, [characterData, isGM, panel.id, dispatch]);

  // Handler: Remove character
  const handleRemoveCharacter = useCallback((characterId: string) => {
    if (!characterData || !isGM) return;

    const newCharacters = characterData.characters.filter(c => c.id !== characterId);
    const newActiveId = newCharacters.length > 0
      ? (characterData.activeCharacterId === characterId ? newCharacters[0].id : characterData.activeCharacterId)
      : '';

    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: panel.id,
        characterData: {
          ...characterData,
          characters: newCharacters,
          activeCharacterId: newActiveId
        }
      }
    });

    if (characterData.activeCharacterId === characterId) {
      setActiveCharacterId(newActiveId);
    }
  }, [characterData, isGM, panel.id, dispatch]);

  // Handler: Select character tab
  const handleSelectCharacter = useCallback((characterId: string) => {
    setActiveCharacterId(characterId);

    if (characterData) {
      dispatch({
        type: 'UPDATE_OBJECT',
        payload: {
          id: panel.id,
          characterData: {
            ...characterData,
            activeCharacterId: characterId
          }
        }
      });
    }
  }, [characterData, panel.id, dispatch]);

  // Character settings modal state
  const [settingsModal, setSettingsModal] = useState<{
    characterId: string;
    character: CharacterTab;
  } | null>(null);

  // Handler: Open character settings
  const handleOpenCharacterSettings = useCallback((characterId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isGM) return;

    const character = characterData?.characters.find(c => c.id === characterId);
    if (character) {
      setSettingsModal({ characterId, character });
    }
  }, [characterData?.characters, isGM]);

  // Handler: Save character settings
  const handleSaveCharacterSettings = useCallback((updatedCharacter: CharacterTab) => {
    if (!characterData) return;

    const updatedCharacters = characterData.characters.map(char => {
      if (char.id === settingsModal?.characterId) {
        return updatedCharacter;
      }
      return char;
    });

    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: panel.id,
        characterData: {
          ...characterData,
          characters: updatedCharacters
        }
      }
    });
  }, [characterData, settingsModal?.characterId, panel.id, dispatch]);

  // Handler: Export character to JSON
  const handleExportCharacter = useCallback(() => {
    if (!settingsModal) return;

    const characterData = {
      characterName: settingsModal.character.characterName,
      blocks: settingsModal.character.blocks,
      columns: settingsModal.character.columns,
      avatarUrl: settingsModal.character.avatarUrl
    };

    const dataStr = JSON.stringify(characterData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${settingsModal.character.characterName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [settingsModal]);

  // Handler: Import character from JSON
  const handleImportCharacter = useCallback((file: File) => {
    if (!settingsModal || !characterData) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedData = JSON.parse(e.target?.result as string);

        const updatedCharacters = characterData.characters.map(char => {
          if (char.id === settingsModal.characterId) {
            return {
              ...char,
              characterName: importedData.characterName || char.characterName,
              blocks: importedData.blocks || char.blocks,
              columns: importedData.columns || char.columns,
              avatarUrl: importedData.avatarUrl || char.avatarUrl
            };
          }
          return char;
        });

        dispatch({
          type: 'UPDATE_OBJECT',
          payload: {
            id: panel.id,
            characterData: {
              ...characterData,
              characters: updatedCharacters
            }
          }
        });

        setSettingsModal(null);
      } catch (error) {
        console.error('Failed to import character:', error);
        alert('Ошибка при загрузке файла. Проверьте формат JSON.');
      }
    };

    reader.readAsText(file);
  }, [settingsModal, characterData, panel.id, dispatch]);

  // Handler: Add block to character
  const handleAddBlock = useCallback((blockType: CharacterBlockType, targetColumnId?: string) => {
    if (!characterData || !activeCharacter || !canEditCharacter) return;

    // Update active column if target column is specified
    if (targetColumnId) {
      setActiveColumnId(targetColumnId);
    }

    let blockData: any;

    switch (blockType) {
      case CharacterBlockType.TEXT:
        blockData = {
          content: '',
          editable: true,
          maxLength: undefined
        };
        break;
      case CharacterBlockType.SLIDER:
        blockData = {
          sliders: [
            {
              id: `slider-${Date.now()}`,
              label: 'Health',
              value: 10,
              maxValue: 10,
              minValue: 0,
              color: '#22c55e',
              showValue: true,
              showPercentage: false
            }
          ]
        };
        break;
      case CharacterBlockType.TABLE:
        blockData = {
          columns: [
            { id: 'col-1', title: 'Name', width: 100, type: 'text' },
            { id: 'col-2', title: 'Value', width: 80, type: 'number' }
          ],
          rows: [],
          editable: true,
          addRowAllowed: true,
          addColumnAllowed: true
        };
        break;
      case CharacterBlockType.INVENTORY:
        blockData = {
          gridColumns: 4,
          items: [],
          maxItems: undefined
        };
        break;
      case CharacterBlockType.AVATAR:
        blockData = {
          imageUrl: '',
          name: activeCharacter?.characterName || 'Character',
          showName: true
        };
        break;
      case CharacterBlockType.COUNTER:
        blockData = {
          counters: [
            { id: `counter-${Date.now()}-1`, name: 'Counter 1', value: 0 },
            { id: `counter-${Date.now()}-2`, name: 'Counter 2', value: 0 },
            { id: `counter-${Date.now()}-3`, name: 'Counter 3', value: 0 }
          ]
        };
        break;
    }

    // Get blocks in the active column to determine order
    const columnBlocks = activeCharacter.blocks.filter(b => b.columnId === activeColumnId);
    const newBlock: CharacterBlock = {
      id: `block-${Date.now()}`,
      type: blockType,
      title: `${blockType.charAt(0).toUpperCase() + blockType.slice(1).toLowerCase()} Block`,
      visible: true,
      order: columnBlocks.length,
      columnId: activeColumnId,
      data: blockData
    };

    const updatedCharacters = characterData.characters.map(char => {
      if (char.id === activeCharacter.id) {
        return {
          ...char,
          blocks: [...char.blocks, newBlock]
        };
      }
      return char;
    });

    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: panel.id,
        characterData: {
          ...characterData,
          characters: updatedCharacters
        }
      }
    });
  }, [characterData, activeCharacter, canEditCharacter, panel.id, dispatch, activeColumnId]);

  // Handler: Add new column
  const handleAddColumn = useCallback(() => {
    if (!characterData || !activeCharacter || !canEditCharacter) return;

    const currentColumns = activeCharacter.columns || 1;
    const newColumnId = `column-${currentColumns + 1}`;

    const updatedCharacters = characterData.characters.map(char => {
      if (char.id === activeCharacter.id) {
        return {
          ...char,
          columns: currentColumns + 1
        };
      }
      return char;
    });

    // Set the new column as active
    setActiveColumnId(newColumnId);

    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: panel.id,
        characterData: {
          ...characterData,
          characters: updatedCharacters
        }
      }
    });
  }, [characterData, activeCharacter, canEditCharacter, panel.id, dispatch]);

  // Handler: Remove column
  const handleRemoveColumn = useCallback((columnIdToRemove: string) => {
    if (!characterData || !activeCharacter || !canEditCharacter) return;

    const currentColumns = activeCharacter.columns || 1;
    if (currentColumns <= 1) return; // Don't allow removing the last column

    // Get column number from ID
    const columnNumber = parseInt(columnIdToRemove.split('-')[1]);
    const newColumnCount = currentColumns - 1;

    // Shift blocks: remove blocks from deleted column and shift columns after it
    const updatedCharacters = characterData.characters.map(char => {
      if (char.id === activeCharacter.id) {
        const updatedBlocks = char.blocks
          .filter(block => block.columnId !== columnIdToRemove)
          .map(block => {
            // If block is in a column after the deleted one, shift column ID
            const blockColumnNumber = parseInt(block.columnId.split('-')[1]);
            if (blockColumnNumber > columnNumber) {
              return { ...block, columnId: `column-${blockColumnNumber - 1}` };
            }
            return block;
          });

        return {
          ...char,
          columns: newColumnCount,
          blocks: updatedBlocks
        };
      }
      return char;
    });

    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: panel.id,
        characterData: {
          ...characterData,
          characters: updatedCharacters
        }
      }
    });
  }, [characterData, activeCharacter, canEditCharacter, panel.id, dispatch]);

  // Handler: Update block data
  const handleUpdateBlock = useCallback((blockId: string, newData: any) => {
    if (!characterData || !activeCharacter) return;

    const updatedCharacters = characterData.characters.map(char => {
      if (char.id === activeCharacter.id) {
        return {
          ...char,
          blocks: char.blocks.map(block =>
            block.id === blockId ? { ...block, data: newData } : block
          )
        };
      }
      return char;
    });

    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: panel.id,
        characterData: {
          ...characterData,
          characters: updatedCharacters
        }
      }
    });
  }, [characterData, activeCharacter, panel.id, dispatch]);

  // Handler: Remove block
  const handleRemoveBlock = useCallback((blockId: string) => {
    if (!characterData || !activeCharacter || !canEditCharacter) return;

    const updatedCharacters = characterData.characters.map(char => {
      if (char.id === activeCharacter.id) {
        return {
          ...char,
          blocks: char.blocks.filter(block => block.id !== blockId)
        };
      }
      return char;
    });

    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: panel.id,
        characterData: {
          ...characterData,
          characters: updatedCharacters
        }
      }
    });
  }, [characterData, activeCharacter, canEditCharacter, panel.id, dispatch]);

  // Move block handlers
  const handleMoveBlockUp = useCallback((blockId: string) => {
    if (!characterData || !activeCharacter || !canEditCharacter) return;

    const blocks = [...activeCharacter.blocks];
    const currentIndex = blocks.findIndex(b => b.id === blockId);

    if (currentIndex <= 0) return; // Already at the top

    // Swap with previous block
    [blocks[currentIndex], blocks[currentIndex - 1]] = [blocks[currentIndex - 1], blocks[currentIndex]];

    // Update order property
    const reorderedBlocks = blocks.map((block, index) => ({
      ...block,
      order: index
    }));

    const updatedCharacters = characterData.characters.map(char => {
      if (char.id === activeCharacter.id) {
        return {
          ...char,
          blocks: reorderedBlocks
        };
      }
      return char;
    });

    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: panel.id,
        characterData: {
          ...characterData,
          characters: updatedCharacters
        }
      }
    });
  }, [characterData, activeCharacter, canEditCharacter, panel.id, dispatch]);

  const handleMoveBlockDown = useCallback((blockId: string) => {
    if (!characterData || !activeCharacter || !canEditCharacter) return;

    const blocks = [...activeCharacter.blocks];
    const currentIndex = blocks.findIndex(b => b.id === blockId);

    if (currentIndex === -1 || currentIndex >= blocks.length - 1) return; // Already at the bottom

    // Swap with next block
    [blocks[currentIndex], blocks[currentIndex + 1]] = [blocks[currentIndex + 1], blocks[currentIndex]];

    // Update order property
    const reorderedBlocks = blocks.map((block, index) => ({
      ...block,
      order: index
    }));

    const updatedCharacters = characterData.characters.map(char => {
      if (char.id === activeCharacter.id) {
        return {
          ...char,
          blocks: reorderedBlocks
        };
      }
      return char;
    });

    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: panel.id,
        characterData: {
          ...characterData,
          characters: updatedCharacters
        }
      }
    });
  }, [characterData, activeCharacter, canEditCharacter, panel.id, dispatch]);

  if (!characterData) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-800 p-4">
        <p className="text-slate-400 text-sm">No character data available</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-800 w-full">
      {/* Character Tab Bar */}
      {!isCollapsed && (
        <div className="flex flex-wrap gap-0.5 px-2 pt-1 pb-0.5 border-b border-slate-700">
          {characterData.characters.map(character => {
            const isActive = character.id === activeCharacterId;
            const isOwnCharacter = character.playerId === state.activePlayerId;

            return (
              <button
                key={character.id}
                onClick={() => handleSelectCharacter(character.id)}
                onContextMenu={(e) => handleOpenCharacterSettings(character.id, e)}
                className={`px-3 py-1.5 text-xs font-medium rounded-t transition-colors relative flex items-center gap-1 ${
                  isActive
                    ? isOwnCharacter
                      ? 'bg-blue-600 text-white'
                      : 'bg-orange-600 text-white'
                    : isOwnCharacter
                      ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                <span className="flex items-center gap-1">
                  {character.characterName}
                </span>
              </button>
            );
          })}

          {/* Add Character Button (GM only) */}
          {isGM && (
            <button
              onClick={handleAddCharacter}
              className="px-2 py-1 text-xs font-medium rounded-t bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
              title="Add new character"
            >
              <Plus size={14} />
            </button>
          )}
        </div>
      )}

      {/* Character Content */}
      {!isCollapsed && activeCharacter && canViewCharacter && (
        <div className="flex-1 flex flex-col p-1.5 min-h-0 w-full">
          {/* Character Header */}
          <div className="mb-2 flex-shrink-0">
            <div className="flex items-center justify-between">
              {editingCharacterName ? (
                <input
                  type="text"
                  value={characterNameInput}
                  onChange={(e) => setCharacterNameInput(e.target.value)}
                  onBlur={handleSaveCharacterName}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSaveCharacterName();
                    } else if (e.key === 'Escape') {
                      handleCancelEditCharacterName();
                    }
                  }}
                  className="text-lg font-semibold bg-slate-700 text-white px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1"
                  autoFocus
                />
              ) : (
                <h3
                  className="text-lg font-semibold text-white cursor-pointer hover:text-slate-300 transition-colors"
                  onDoubleClick={handleStartEditCharacterName}
                  title="Double-click to rename"
                >
                  {activeCharacter.characterName}
                </h3>
              )}
              {isGM && (
                <button
                  onClick={() => handleRemoveCharacter(activeCharacter.id)}
                  className="p-1 text-slate-400 hover:text-red-400 transition-colors ml-2"
                  title="Remove character"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Blocks Container - Multi-column layout */}
          <div className="flex-1 overflow-y-auto pr-1 min-h-0 w-full">
            <div className="flex gap-1.5 h-full">
              {Array.from({ length: activeCharacter.columns || 1 }, (_, columnIndex) => {
                const columnId = `column-${columnIndex + 1}`;
                const columnBlocks = activeCharacter.blocks
                  .filter(block => block.visible && block.columnId === columnId)
                  .sort((a, b) => a.order - b.order);

                return (
                  <div
                    key={columnId}
                    className="flex-1 flex flex-col space-y-1.5 min-w-0"
                    style={{ width: `${100 / (activeCharacter.columns || 1)}%` }}
                  >
                    {columnBlocks.map(block => {
                      const blockIndex = columnBlocks.findIndex(b => b.id === block.id);
                      const isFirst = blockIndex === 0;
                      const isLast = blockIndex === columnBlocks.length - 1;

                      return (
                        <div
                          key={block.id}
                          className={`w-full bg-slate-700 rounded border border-slate-600 box-border ${
                            block.type === CharacterBlockType.AVATAR ? 'h-[200px] min-h-[200px] p-0 relative overflow-hidden' : 'p-1.5'
                          }`}
                          style={{ boxSizing: 'border-box' }}
                        >
                  {/* Block header - hide for AvatarBlock */}
                  {block.type !== CharacterBlockType.AVATAR ? (
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 flex-1">
                        {editingBlockTitle === block.id ? (
                          <input
                            type="text"
                            value={blockTitleInput}
                            onChange={(e) => setBlockTitleInput(e.target.value)}
                            onBlur={() => handleSaveBlockTitle(block.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleSaveBlockTitle(block.id);
                              } else if (e.key === 'Escape') {
                                handleCancelEditBlockTitle();
                              }
                            }}
                            className="text-sm font-medium bg-slate-600 text-white px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1 mr-2"
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <h4
                            className={`text-sm font-medium ${canEditCharacter ? 'text-slate-200 cursor-pointer hover:text-white' : 'text-slate-200'}`}
                            onDoubleClick={() => handleStartEditBlockTitle(block.id, block.title)}
                            title={canEditCharacter ? "Double-click to rename" : block.title}
                          >
                            {block.title}
                          </h4>
                        )}
                      </div>
                      <div className="flex items-center gap-0.5">
                        {canEditCharacter && (
                          <>
                            <button
                              onClick={() => handleMoveBlockUp(block.id)}
                              className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Move up"
                              disabled={isFirst}
                            >
                              <ChevronUp size={14} />
                            </button>
                            <button
                              onClick={() => handleMoveBlockDown(block.id)}
                              className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Move down"
                              disabled={isLast}
                            >
                              <ChevronDown size={14} />
                            </button>
                            <button
                              onClick={() => handleRemoveBlock(block.id)}
                              className="p-1 text-slate-400 hover:text-red-400"
                              title="Remove block"
                            >
                              <Trash2 size={12} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* AvatarBlock: show move and remove buttons - positioned absolutely */
                    canEditCharacter && (
                      <div className="absolute top-2 right-2 z-10 flex gap-0.5">
                        <button
                          onClick={() => handleMoveBlockUp(block.id)}
                          className="p-1 text-slate-400 hover:text-slate-200 bg-slate-800 bg-opacity-75 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move up"
                          disabled={isFirst}
                        >
                          <ChevronUp size={12} />
                        </button>
                        <button
                          onClick={() => handleMoveBlockDown(block.id)}
                          className="p-1 text-slate-400 hover:text-slate-200 bg-slate-800 bg-opacity-75 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move down"
                          disabled={isLast}
                        >
                          <ChevronDown size={12} />
                        </button>
                        <button
                          onClick={() => handleRemoveBlock(block.id)}
                          className="p-1 text-slate-400 hover:text-red-400 bg-slate-800 bg-opacity-75 rounded"
                          title="Remove avatar"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )
                  )}

                  {/* Block content */}
                  {(() => {
                    switch (block.type) {
                      case CharacterBlockType.TEXT:
                        return (
                          <TextBlock
                            block={block}
                            editable={canManageCharacter}
                            onChange={(newData) => handleUpdateBlock(block.id, newData)}
                          />
                        );
                      case CharacterBlockType.SLIDER:
                        return (
                          <SliderBlock
                            block={block}
                            editable={canManageCharacter}
                            canEditStructure={canEditCharacter}
                            onChange={(newData) => handleUpdateBlock(block.id, newData)}
                          />
                        );
                      case CharacterBlockType.TABLE:
                        return (
                          <TableBlock
                            block={block}
                            editable={canManageCharacter}
                            canEditStructure={canEditCharacter}
                            onChange={(newData) => handleUpdateBlock(block.id, newData)}
                          />
                        );
                      case CharacterBlockType.INVENTORY:
                        return (
                          <InventoryBlock
                            block={block}
                            editable={canManageCharacter}
                            canEditStructure={canEditCharacter}
                            onChange={(newData) => handleUpdateBlock(block.id, newData)}
                          />
                        );
                      case CharacterBlockType.AVATAR:
                        return (
                          <AvatarBlock
                            block={block}
                            editable={canEditCharacter}
                            onChange={(newData) => handleUpdateBlock(block.id, newData)}
                          />
                        );
                      case CharacterBlockType.COUNTER:
                        return (
                          <CounterBlock
                            block={block}
                            editable={canManageCharacter}
                            canEditStructure={canEditCharacter}
                            onChange={(newData) => handleUpdateBlock(block.id, newData)}
                          />
                        );
                      default:
                        return (
                          <div className="text-slate-400 text-sm">
                            Unknown block type: {block.type}
                          </div>
                        );
                    }
                  })()}
                </div>
                );
              })}

              {/* Add Block Buttons - position depends on whether column has blocks */}
              {canEditCharacter && (
                <div className={`flex gap-1.5 ${columnBlocks.length === 0 ? 'mb-auto' : 'mt-auto'}`}>
                  {/* Remove Column Button (20%) - only for columns 2+ */}
                  {columnIndex > 0 && (
                    <button
                      onClick={() => handleRemoveColumn(columnId)}
                      className="h-20 bg-red-600 bg-opacity-30 hover:bg-opacity-40 border-2 border-dashed border-red-500 rounded-lg flex items-center justify-center transition-all"
                      style={{ width: '20%' }}
                      title="Remove column"
                    >
                      <span className="text-red-400 text-lg">✕</span>
                    </button>
                  )}

                  {/* Add Block Button (60%) */}
                  <button
                    onClick={(e) => handleOpenBlockMenu(e, columnId)}
                    className="flex-1 h-20 bg-purple-600 bg-opacity-30 hover:bg-opacity-40 border-2 border-dashed border-purple-500 rounded-lg flex items-center justify-center transition-all"
                    style={{ width: '60%' }}
                    title={canEditCharacter ? "Add block" : "You don't have permission to edit this character"}
                    disabled={!canEditCharacter}
                  >
                    <Plus size={32} className={canEditCharacter ? "text-purple-400" : "text-purple-400/50"} />
                  </button>

                  {/* Add Column Button (20%) */}
                  <button
                    onClick={handleAddColumn}
                    className="h-20 bg-blue-600 bg-opacity-30 hover:bg-opacity-40 border-2 border-dashed border-blue-500 rounded-lg flex items-center justify-center transition-all"
                    style={{ width: '20%' }}
                    title={canEditCharacter ? "Add new column" : "You don't have permission to edit this character"}
                    disabled={!canEditCharacter}
                  >
                    <span className={canEditCharacter ? "text-blue-400 text-2xl" : "text-blue-400/50 text-2xl"}>→</span>
                  </button>
                </div>
              )}
            </div>
              );
            })}
            </div>
          </div>

          {/* Block Type Context Menu */}
          {blockContextMenu && canEditCharacter && (
            <SimpleContextMenu
              x={blockContextMenu.x}
              y={blockContextMenu.y}
              onClose={() => setBlockContextMenu(null)}
              items={[
                {
                  name: 'Text Block',
                  icon: <TypeIcon size={16} />,
                  action: () => {
                    handleAddBlock(CharacterBlockType.TEXT);
                  }
                },
                {
                  name: 'Slider Block',
                  icon: <Sliders size={16} />,
                  action: () => {
                    handleAddBlock(CharacterBlockType.SLIDER);
                  }
                },
                {
                  name: 'Table Block',
                  icon: <List size={16} />,
                  action: () => {
                    handleAddBlock(CharacterBlockType.TABLE);
                  }
                },
                {
                  name: 'Inventory Block',
                  icon: <ImageIcon size={16} />,
                  action: () => {
                    handleAddBlock(CharacterBlockType.INVENTORY);
                  }
                },
                {
                  name: 'Avatar Block',
                  icon: <ImageIcon size={16} />,
                  action: () => {
                    handleAddBlock(CharacterBlockType.AVATAR);
                  }
                },
                {
                  name: 'Counter Block',
                  icon: <Sliders size={16} />,
                  action: () => {
                    handleAddBlock(CharacterBlockType.COUNTER);
                  }
                }
              ]}
            />
          )}
        </div>
      )}

      {/* Empty State */}
      {!isCollapsed && !activeCharacter && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-slate-400">
            {isGM ? (
              <div>
                <p className="mb-2">No characters yet</p>
                <button
                  onClick={handleAddCharacter}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm"
                >
                  Add First Character
                </button>
              </div>
            ) : (
              <p>Waiting for GM to add characters...</p>
            )}
          </div>
        </div>
      )}

      {/* Access Denied */}
      {!isCollapsed && activeCharacter && !canViewCharacter && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-slate-400">
            <Lock size={32} className="mx-auto mb-2" />
            <p>You don't have permission to view this character</p>
          </div>
        </div>
      )}

      {/* Character Settings Modal */}
      {settingsModal && (
        <div className="absolute inset-0 bg-slate-800 z-10 flex flex-col">
          {/* Character Settings Header - Fixed at top */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 flex-shrink-0">
            <h2 className="text-lg font-semibold text-white">Character Settings</h2>
            <button
              onClick={() => setSettingsModal(null)}
              className="p-1 text-slate-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Settings Content - Takes available space */}
          <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
            <CharacterSettingsModal
              character={settingsModal.character}
              players={state.players}
              activePlayerId={state.activePlayerId}
              isGM={isGM}
              canEditCharacter={canEditCharacter}
              onSave={handleSaveCharacterSettings}
            />
          </div>

          {/* Save/Load Character Buttons - Fixed at bottom */}
          {(isGM || canEditCharacter) && (
            <div className="px-4 pb-2 flex-shrink-0">
              <div className="flex gap-2">
                <button
                  onClick={handleExportCharacter}
                  className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded transition-colors text-sm"
                >
                  <Save size={14} />
                  Save Character
                </button>
                <label className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded transition-colors text-sm cursor-pointer">
                  <Upload size={14} />
                  Load Character
                  <input
                    type="file"
                    accept=".json"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handleImportCharacter(file);
                      }
                    }}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          )}

          {/* Cancel/Save Buttons - Fixed at bottom */}
          <div className="px-4 pb-3 flex-shrink-0">
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setSettingsModal(null)}
                className="px-4 py-2 bg-slate-700 text-white rounded hover:bg-slate-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  // Save is handled by CharacterSettingsModal internally
                  setSettingsModal(null);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};