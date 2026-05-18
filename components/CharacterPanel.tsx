import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useGame } from '../store/GameContext';
import { useActivePlayerId, useIsGM, usePlayerList, useSettingsModalState, useIsSettingsModalOpen, useLanguage } from '../store/contexts';
import { PanelObject, CharacterTab, CharacterBlock, CharacterBlockType, ItemType } from '../types';
import { t } from '../utils/translations';
import { Plus, Trash2, Lock, Type as TypeIcon, Image as ImageIcon, List, Sliders, ChevronUp, ChevronDown, Save, Upload, User, Sparkles, Settings } from 'lucide-react';
import { TextBlock, SliderBlock, TableBlock, QuickAccessBlock, CounterBlock } from './CharacterBlocks';
import { SliderIconModal } from './CharacterBlocks/SliderBlock';
import { SliderItem, SliderIconShape } from '../types';
import { AvatarSettingsModal, AvatarSettingsModalRef } from './AvatarSettingsModal';
import { SimpleContextMenu } from './SimpleContextMenu';
import { CharacterSettingsModal } from './CharacterSettingsModal';
import { logger } from '../utils/logger';
import { isHashRef, isImageRef } from '../utils/imageCompat';
import { getAssetURL } from '../utils/assets';

interface CharacterPanelProps {
  isCollapsed?: boolean;
  panel: PanelObject;
}

export const CharacterPanel: React.FC<CharacterPanelProps> = ({
  isCollapsed = false,
  panel
}) => {
  const { state, dispatch } = useGame();
  const activePlayerId = useActivePlayerId();
  const isGM = useIsGM();
  const players = usePlayerList();
  const language = useLanguage();
  const [isSettingsModalOpen, openSettingsModal, closeSettingsModal] = useSettingsModalState();

  // Get character data from panel - use latest from state to ensure reactivity
  const characterData = (state.objects[panel.id] as PanelObject)?.characterData || panel.characterData;
  const [activeCharacterId, setActiveCharacterId] = useState<string>(
    characterData?.activeCharacterId || ''
  );
  const [activeColumnId, setActiveColumnId] = useState<string>('column-1');
  const [activeSubTabId, setActiveSubTabId] = useState<string>('subtab-1');
  const [pendingRemoveCharacterId, setPendingRemoveCharacterId] = useState<string | null>(null);

  // Cache for resolved avatar URLs (convert img_ref:// to data URLs)
  const [avatarUrlCache, setAvatarUrlCache] = useState<Record<string, string>>({});

  // Get active character - use characterData from state for reactivity
  const activeCharacter = useMemo(() => {
    if (!characterData) return null;
    return characterData.characters.find((c: CharacterTab) => c.id === activeCharacterId) || null;
  }, [characterData, activeCharacterId]);

  // Get active sub-tab
  const activeSubTab = useMemo(() => {
    if (!activeCharacter?.subTabs) return null;
    // Use character's activeSubTabId if available, otherwise use local state
    const tabId = activeCharacter.activeSubTabId || activeSubTabId;
    return activeCharacter.subTabs.find((st: any) => st.id === tabId) || activeCharacter.subTabs[0] || null;
  }, [activeCharacter, activeSubTabId]);

  // Update local activeSubTabId when character changes
  useEffect(() => {
    if (activeCharacter?.activeSubTabId) {
      setActiveSubTabId(activeCharacter.activeSubTabId);
    }
  }, [activeCharacter?.activeSubTabId]);

  // Load avatar images from IndexedDB (convert img_ref:// to data URLs)
  useEffect(() => {
    if (!characterData?.characters) return;

    const loadAvatars = async () => {
      const newCache: Record<string, string> = {};
      const charactersWithAvatars = characterData.characters.filter(c => c.avatarUrl);

      for (const character of charactersWithAvatars) {
        if (!character.avatarUrl) continue;

        try {
          if (isHashRef(character.avatarUrl)) {
            // New CAS system: sha256:hash
            const url = await getAssetURL(character.avatarUrl);
            newCache[character.id] = url;
          } else if (isImageRef(character.avatarUrl)) {
            // Old img_ref:// system - not supported
            console.warn('[CharacterPanel] img_ref:// URLs are no longer supported for avatars');
          } else {
            // Regular URL (data:image/, http://, etc.)
            newCache[character.id] = character.avatarUrl;
          }
        } catch (error) {
          // Silently fail - avatar will be missing
        }
      }

      setAvatarUrlCache(newCache);
    };

    loadAvatars();
  }, [characterData?.characters]);

  // Migration: Ensure all blocks have columnId, characters have columns field, and sub-tabs exist
  useEffect(() => {
    if (!characterData) return;

    let needsUpdate = false;
    const updatedCharacters = characterData.characters.map((char: CharacterTab) => {
      // Migrate legacy blocks/columns to sub-tabs format
      if (!char.subTabs || char.subTabs.length === 0) {
        needsUpdate = true;
        const legacyBlocks = char.blocks || [];
        const legacyColumns = char.columns || 1;

        return {
          ...char,
          subTabs: [
            {
              id: 'subtab-1',
              name: 'Main',
              blocks: legacyBlocks,
              columns: legacyColumns
            },
            {
              id: 'subtab-2',
              name: 'Skills',
              blocks: [],
              columns: 1
            },
            {
              id: 'subtab-3',
              name: 'Inventory',
              blocks: [],
              columns: 1
            }
          ],
          activeSubTabId: 'subtab-1',
          blocks: undefined,
          columns: undefined
        };
      }

      // Ensure manageableByPlayerIds field exists
      if (!char.manageableByPlayerIds) {
        needsUpdate = true;
        return { ...char, manageableByPlayerIds: [] };
      }

      // Ensure all blocks in all sub-tabs have columnId
      if (char.subTabs) {
        const subTabsWithColumnIds = char.subTabs.map((subTab: any) => {
          const hasBlocksWithoutColumnId = subTab.blocks.some((block: CharacterBlock) => !block.columnId);
          if (hasBlocksWithoutColumnId) {
            needsUpdate = true;
            return {
              ...subTab,
              blocks: subTab.blocks.map((block: CharacterBlock) => ({
                ...block,
                columnId: block.columnId || 'column-1'
              }))
            };
          }
          return subTab;
        });

        if (needsUpdate) {
          return { ...char, subTabs: subTabsWithColumnIds };
        }
      }

      return char;
    });

    if (needsUpdate) {
      dispatch({
        type: 'UPDATE_OBJECT',
        payload: {
          id: panel.id,
          updates: {
            characterData: {
              ...characterData,
              characters: updatedCharacters
            }
          }
        }
      });
    }
  }, [characterData, panel.id, dispatch]);

  // Get current player info
  // Note: isGM is now from useIsGM() hook above

  // Check permissions for active character
  const canManageCharacter = useMemo(() => {
    if (!activeCharacter) return false;
    if (isGM) return true;

    // Check if player is owner
    if (activeCharacter.playerId === activePlayerId) return true;

    // Check if player is in manageable list
    if (activeCharacter.manageableByPlayerIds?.includes(activePlayerId)) return true;

    // Check if "all_players" is in manageable list
    if (activeCharacter.manageableByPlayerIds?.includes('all_players')) return true;

    return false;
  }, [activeCharacter, isGM, activePlayerId]);

  const canEditCharacter = useMemo(() => {
    if (!activeCharacter) return false;
    if (isGM) return true;

    // Check if player is owner
    if (activeCharacter.playerId === activePlayerId) return true;

    // Check if player is in editable list
    if (activeCharacter.editableByPlayerIds.includes(activePlayerId)) return true;

    // Check if "all_players" is in editable list
    if (activeCharacter.editableByPlayerIds.includes('all_players')) return true;

    return false;
  }, [activeCharacter, isGM, activePlayerId]);

  const canViewCharacter = useMemo(() => {
    if (!activeCharacter) return false;
    if (isGM) return true;

    // Check if player is owner
    if (activeCharacter.playerId === activePlayerId) return true;

    // Check if player is in visible list
    if (activeCharacter.visibleToPlayerIds.includes(activePlayerId)) return true;

    // Check if "all_players" is in visible list
    if (activeCharacter.visibleToPlayerIds.includes('all_players')) return true;

    return false;
  }, [activeCharacter, isGM, activePlayerId]);

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
    if (!isGM && activeCharacter.playerId !== activePlayerId) return;
    setCharacterNameInput(activeCharacter.characterName);
    setEditingCharacterName(true);
  }, [activeCharacter, isGM, activePlayerId]);

  const handleSaveCharacterName = useCallback(() => {
    if (!characterData || !activeCharacter) return;

    const newName = characterNameInput.trim() || 'Unnamed Character';
    const updatedCharacters = characterData.characters.map((char: CharacterTab) => {
      if (char.id === activeCharacter.id) {
        return { ...char, characterName: newName };
      }
      return char;
    });

    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: panel.id,
        updates: {
          characterData: {
            ...characterData,
            characters: updatedCharacters
          }
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
    if (!characterData || !activeCharacter || !activeSubTab) return;

    const newTitle = blockTitleInput.trim() || 'Untitled Block';
    const updatedCharacters = characterData.characters.map((char: CharacterTab) => {
      if (char.id === activeCharacter.id) {
        return {
          ...char,
          subTabs: char.subTabs?.map(subTab =>
            subTab.id === activeSubTab.id
              ? {
                  ...subTab,
                  blocks: subTab.blocks.map((block: any) =>
                    block.id === blockId ? { ...block, title: newTitle } : block
                  )
                }
              : subTab
          )
        };
      }
      return char;
    });

    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: panel.id,
        updates: {
          characterData: {
            ...characterData,
            characters: updatedCharacters
          }
        }
      }
    });

    setEditingBlockTitle(null);
    setBlockTitleInput('');
  }, [characterData, activeCharacter, activeSubTab, blockTitleInput, panel.id, dispatch]);

  const handleCancelEditBlockTitle = useCallback(() => {
    setEditingBlockTitle(null);
    setBlockTitleInput('');
  }, []);

  // Handler: Add new character
  const handleAddCharacter = useCallback(() => {
    if (!isGM) {
      logger.warn('[CharacterPanel] Cannot add character: not a GM');
      return;
    }

    const newCharacter: CharacterTab = {
      id: `char-${Date.now()}`,
      characterName: 'New Character',
      playerId: undefined,
      subTabs: [
        {
          id: 'subtab-1',
          name: 'Main',
          blocks: [],
          columns: 1
        },
        {
          id: 'subtab-2',
          name: 'Skills',
          blocks: [],
          columns: 1
        },
        {
          id: 'subtab-3',
          name: 'Inventory',
          blocks: [],
          columns: 1
        }
      ],
      activeSubTabId: 'subtab-1',
      visibleToPlayerIds: [],
      manageableByPlayerIds: [],
      editableByPlayerIds: [],
      avatarUrl: undefined
    };

    // Use existing characterData or create new one
    const updatedCharacters = characterData?.characters || [];
    const baseData = characterData || {
      presets: [],
      isUniversal: false
    };

    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: panel.id,
        updates: {
          characterData: {
            ...baseData,
            characters: [...updatedCharacters, newCharacter],
            activeCharacterId: newCharacter.id
          }
        }
      }
    });

    setActiveCharacterId(newCharacter.id);
    setActiveSubTabId('subtab-1');
  }, [characterData, isGM, panel.id, dispatch]);

  // Handler: Remove character
  const handleRemoveCharacter = useCallback((characterId: string) => {
    if (!characterData || !isGM) return;
    setPendingRemoveCharacterId(characterId);
  }, [characterData, isGM]);

  // Handler: Confirm remove character
  const handleConfirmRemoveCharacter = useCallback(() => {
    if (!pendingRemoveCharacterId || !characterData) return;

    const newCharacters = characterData.characters.filter(c => c.id !== pendingRemoveCharacterId);
    const newActiveId = newCharacters.length > 0
      ? (characterData.activeCharacterId === pendingRemoveCharacterId ? newCharacters[0].id : characterData.activeCharacterId)
      : '';

    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: panel.id,
        updates: {
          characterData: {
            ...characterData,
            characters: newCharacters,
            activeCharacterId: newActiveId
          }
        }
      }
    });

    if (characterData.activeCharacterId === pendingRemoveCharacterId) {
      setActiveCharacterId(newActiveId);
    }

    setPendingRemoveCharacterId(null);
  }, [pendingRemoveCharacterId, characterData, panel.id, dispatch]);

  // Handler: Cancel remove character
  const handleCancelRemoveCharacter = useCallback(() => {
    setPendingRemoveCharacterId(null);
  }, []);

  // Helper: Get first Slider Block from character (for token counters)
  const getFirstSliderBlock = useCallback((character: CharacterTab) => {
    if (!character.subTabs) return null;
    for (const subTab of character.subTabs) {
      const sliderBlock = subTab.blocks.find(b => b.type === CharacterBlockType.SLIDER && b.visible);
      if (sliderBlock) return sliderBlock;
    }
    return null;
  }, []);

  // Handler: Create character token
  const handleCreateCharacterToken = useCallback(async (character: CharacterTab, e?: React.MouseEvent) => {
    // Use avatar URL as-is (img_ref:// format for sync to work)
    const tokenContent = character.avatarUrl || '';

    // Get sliders from first Slider Block for counters
    const sliderBlock = getFirstSliderBlock(character);
    const sliders = (sliderBlock?.data as any)?.sliders || [];

    // Convert sliders to token counters
    const counters = sliders.map((slider: any) => ({
      id: `counter-${Date.now()}-${slider.id}`,
      name: slider.label,
      value: slider.value,
      maxValue: slider.maxValue,
      minValue: slider.minValue ?? 0,
      color: slider.color || '#ef4444',
      icon: undefined,
      showValue: true,
      showBar: true
    }));

    // Create token object
    const newTokenId = `token-${Date.now()}`;
    const newToken = {
      id: newTokenId,
      type: ItemType.TOKEN,
      name: character.characterName,
      x: 0,
      y: 0,
      width: 80,
      height: 80,
      rotation: 0,
      content: tokenContent,
      shape: 'CIRCLE' as const,
      color: '#e74c3c',
      borderColor: character.avatarBorderColor || '#a855f7',
      borderWidth: character.avatarBorderWidth ?? 5,
      opacity: 100,
      borderOpacity: 100,
      locked: false,
      isOnTable: false,
      inCursorSlot: true,
      showName: true,
      showNameOnToken: !tokenContent, // Show name on token only if no image
      fontColor: '#ffffff',
      zIndex: 3000,
      hyperscaleLayerId: 'tokens',
      // Link to character
      characterId: character.id,
      panelId: panel.id,
      // Add counters from sliders
      counters,
      // Set counter display to show above token by default
      counterDisplay: {
        position: 'above' as const,
        showForPlayers: true
      }
    };

    // Add token to state
    dispatch({ type: 'ADD_OBJECT', payload: newToken });

    // Get current mouse position from event or fall back to current cursor position
    const mousePos = e ? { x: e.clientX, y: e.clientY } : null;

    // Dispatch event to add token to cursor slot
    window.dispatchEvent(new CustomEvent('add-character-token-to-cursor-slot', {
      detail: {
        token: newToken,
        mousePosition: mousePos
      }
    }));
  }, [getFirstSliderBlock, panel.id, dispatch]);

  // Handler: Select character tab
  const handleSelectCharacter = useCallback((characterId: string) => {
    setActiveCharacterId(characterId);

    if (characterData) {
      dispatch({
        type: 'UPDATE_OBJECT',
        payload: {
          id: panel.id,
          updates: {
            characterData: {
              ...characterData,
              activeCharacterId: characterId
            }
          }
        }
      });
    }
  }, [characterData, panel.id, dispatch]);

  // Handler: Select sub-tab
  const handleSelectSubTab = useCallback((subTabId: string) => {
    setActiveSubTabId(subTabId);

    if (characterData && activeCharacter) {
      const updatedCharacters = characterData.characters.map((char: CharacterTab) => {
        if (char.id === activeCharacter.id) {
          return {
            ...char,
            activeSubTabId: subTabId
          };
        }
        return char;
      });

      dispatch({
        type: 'UPDATE_OBJECT',
        payload: {
          id: panel.id,
          updates: {
            characterData: {
              ...characterData,
              characters: updatedCharacters
            }
          }
        }
      });
    }
  }, [characterData, activeCharacter, panel.id, dispatch]);

  // Character settings modal state
  const [settingsModal, setSettingsModal] = useState<{
    characterId: string;
    character: CharacterTab;
  } | null>(null);
  const [tempSettingsCharacter, setTempSettingsCharacter] = useState<CharacterTab | null>(null);

  // Avatar settings modal state
  const [avatarSettingsModal, setAvatarSettingsModal] = useState<CharacterTab | null>(null);
  const avatarSettingsModalRef = useRef<AvatarSettingsModalRef>(null);

  // Slider icon modal state
  const [sliderIconModal, setSliderIconModal] = useState<{
    slider: SliderItem;
    blockId: string;
  } | null>(null);

  // Sync settings modal state with UI context
  useEffect(() => {
    if (settingsModal || avatarSettingsModal || sliderIconModal) {
      openSettingsModal();
    } else {
      closeSettingsModal();
    }
  }, [settingsModal, avatarSettingsModal, sliderIconModal, openSettingsModal, closeSettingsModal]);

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

    const updatedCharacters = characterData.characters.map((char: CharacterTab) => {
      if (char.id === settingsModal?.characterId) {
        return updatedCharacter;
      }
      return char;
    });

    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: panel.id,
        updates: {
          characterData: {
            ...characterData,
            characters: updatedCharacters
          }
        }
      }
    });

    // Close the settings modal after saving
    closeSettingsModal();
    setSettingsModal(null);
  }, [characterData, settingsModal?.characterId, panel.id, dispatch, closeSettingsModal]);

  // Handler: Save avatar settings
  const handleSaveAvatarSettings = useCallback(() => {
    if (!characterData || !avatarSettingsModalRef.current) return;

    const updates = avatarSettingsModalRef.current.getValues();

    const updatedCharacters = characterData.characters.map((char: CharacterTab) => {
      if (char.id === updates.id) {
        // Merge updates with existing character data to avoid losing other fields
        return { ...char, ...updates };
      }
      return char;
    });

    // Update the character data in the panel object
    const updatedCharacterData = {
      ...characterData,
      characters: updatedCharacters
    };

    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: panel.id,
        updates: {
          characterData: updatedCharacterData
        }
      }
    });

    // Close the avatar settings modal after saving
    closeSettingsModal();
    setAvatarSettingsModal(null);
  }, [characterData, panel.id, dispatch, closeSettingsModal]);

  // Handler: Save slider icon settings
  const handleSaveSliderIcon = useCallback((shape: SliderIconShape, color: string) => {
    if (!sliderIconModal || !characterData || !activeCharacter || !activeSubTab) return;

    const { slider, blockId } = sliderIconModal;

    const updatedCharacters = characterData.characters.map((char: CharacterTab) => {
      if (char.id === activeCharacter.id) {
        return {
          ...char,
          subTabs: char.subTabs?.map(subTab =>
            subTab.id === activeSubTab.id
              ? {
                  ...subTab,
                  blocks: subTab.blocks.map((block: any) =>
                    block.id === blockId
                      ? {
                          ...block,
                          data: {
                            ...block.data,
                            sliders: block.data.sliders.map((s: SliderItem) =>
                              s.id === slider.id
                                ? { ...s, iconShape: shape, color }
                                : s
                            )
                          }
                        }
                      : block
                  )
                }
              : subTab
          )
        };
      }
      return char;
    });

    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: panel.id,
        updates: {
          characterData: {
            ...characterData,
            characters: updatedCharacters
          }
        }
      }
    });

    setSliderIconModal(null);
  }, [sliderIconModal, characterData, activeCharacter, activeSubTab, panel.id, dispatch]);

  // Handler: Export character to JSON
  const handleExportCharacter = useCallback(() => {
    if (!settingsModal) return;

    const characterData = {
      characterName: settingsModal.character.characterName,
      subTabs: settingsModal.character.subTabs,
      activeSubTabId: settingsModal.character.activeSubTabId,
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

        const updatedCharacters = characterData.characters.map((char: CharacterTab) => {
          if (char.id === settingsModal.characterId) {
            return {
              ...char,
              characterName: importedData.characterName || char.characterName,
              subTabs: importedData.subTabs || char.subTabs,
              activeSubTabId: importedData.activeSubTabId || char.activeSubTabId,
              avatarUrl: importedData.avatarUrl || char.avatarUrl
            };
          }
          return char;
        });

        dispatch({
          type: 'UPDATE_OBJECT',
          payload: {
            id: panel.id,
            updates: {
              characterData: {
                ...characterData,
                characters: updatedCharacters
              }
            }
          }
        });

        setSettingsModal(null);
      } catch (error) {
        logger.error('Failed to import character:', error);
        alert('Ошибка при загрузке файла. Проверьте формат JSON.');
      }
    };

    reader.readAsText(file);
  }, [settingsModal, characterData, panel.id, dispatch]);

  // Handler: Add block to character
  const handleAddBlock = useCallback((blockType: CharacterBlockType, targetColumnId?: string) => {
    if (!characterData || !activeCharacter || !activeSubTab || !canEditCharacter) return;

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
        const now = Date.now();
        blockData = {
          sliders: [
            {
              id: `slider-${now}`,
              label: 'Health',
              value: 50,
              maxValue: 50,
              minValue: 0,
              color: '#ef4444',
              showValue: true,
              showPercentage: false,
              iconShape: 'heart' as const
            },
            {
              id: `slider-${now + 1}`,
              label: 'Mana',
              value: 50,
              maxValue: 50,
              minValue: 0,
              color: '#3b82f6',
              showValue: true,
              showPercentage: false,
              iconShape: 'star' as const
            },
            {
              id: `slider-${now + 2}`,
              label: 'Stamina',
              value: 50,
              maxValue: 50,
              minValue: 0,
              color: '#22c55e',
              showValue: true,
              showPercentage: false,
              iconShape: 'cross' as const
            }
          ]
        };
        break;
      case CharacterBlockType.TABLE:
        const tableNow = Date.now();
        blockData = {
          columns: [
            { id: 'col-1', title: 'Name', width: 100, type: 'text' },
            { id: 'col-2', title: 'Value', width: 80, type: 'number' }
          ],
          rows: [
            { id: `row-${tableNow}`, cells: { 'col-1': 'Skill A', 'col-2': 5 } },
            { id: `row-${tableNow + 1}`, cells: { 'col-1': 'Skill B', 'col-2': 6 } },
            { id: `row-${tableNow + 2}`, cells: { 'col-1': 'Skill C', 'col-2': 7 } }
          ],
          editable: true,
          addRowAllowed: true,
          addColumnAllowed: true
        };
        break;
      case CharacterBlockType.QUICK_ACCESS:
        const qaNow = Date.now();
        blockData = {
          gridColumns: 4,
          items: [
            {
              id: `item-${qaNow}`,
              name: t('Health Potion', language),
              quantity: 5,
              imageUrl: 'https://res.cloudinary.com/dxxh6meej/image/upload/v1778955185/Potion_of_Life_nwzknk.png'
            },
            {
              id: `item-${qaNow + 1}`,
              name: t('Mana Potion', language),
              quantity: 5,
              imageUrl: 'https://res.cloudinary.com/dxxh6meej/image/upload/v1778955186/Potion_of_Mana_whciey.png'
            },
            {
              id: `item-${qaNow + 2}`,
              name: t('Stamina Potion', language),
              quantity: 5,
              imageUrl: 'https://res.cloudinary.com/dxxh6meej/image/upload/v1778955186/Potion_of_Stamina_grcuh1.png'
            },
            {
              id: `item-${qaNow + 3}`,
              name: t('Resurrection Scroll', language),
              quantity: 1,
              imageUrl: 'https://res.cloudinary.com/dxxh6meej/image/upload/v1778955200/Scroll_of_Resurrection_rk0kp9.png'
            }
          ],
          maxItems: undefined
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
    const columnBlocks = activeSubTab.blocks.filter(b => b.columnId === activeColumnId);
    const newBlock: CharacterBlock = {
      id: `block-${Date.now()}`,
      type: blockType,
      title: blockType === CharacterBlockType.QUICK_ACCESS
        ? 'Quick Access Block'
        : `${blockType.charAt(0).toUpperCase() + blockType.slice(1).toLowerCase()} Block`,
      visible: true,
      order: columnBlocks.length,
      columnId: activeColumnId,
      data: blockData
    };

    const updatedCharacters = characterData.characters.map((char: CharacterTab) => {
      if (char.id === activeCharacter.id) {
        return {
          ...char,
          subTabs: char.subTabs?.map(subTab =>
            subTab.id === activeSubTab.id
              ? { ...subTab, blocks: [...subTab.blocks, newBlock] }
              : subTab
          )
        };
      }
      return char;
    });

    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: panel.id,
        updates: {
          characterData: {
            ...characterData,
            characters: updatedCharacters
          }
        }
      }
    });
  }, [characterData, activeCharacter, activeSubTab, canEditCharacter, panel.id, dispatch, activeColumnId]);

  // Handler: Add new column
  const handleAddColumn = useCallback(() => {
    if (!characterData || !activeCharacter || !activeSubTab || !canEditCharacter) return;

    const currentColumns = activeSubTab.columns || 1;
    const newColumnId = `column-${currentColumns + 1}`;

    const updatedCharacters = characterData.characters.map((char: CharacterTab) => {
      if (char.id === activeCharacter.id) {
        return {
          ...char,
          subTabs: char.subTabs?.map(subTab =>
            subTab.id === activeSubTab.id
              ? { ...subTab, columns: currentColumns + 1 }
              : subTab
          )
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
        updates: {
          characterData: {
            ...characterData,
            characters: updatedCharacters
          }
        }
      }
    });
  }, [characterData, activeCharacter, activeSubTab, canEditCharacter, panel.id, dispatch]);

  // Handler: Remove column
  const handleRemoveColumn = useCallback((columnIdToRemove: string) => {
    if (!characterData || !activeCharacter || !activeSubTab || !canEditCharacter) return;

    const currentColumns = activeSubTab.columns || 1;
    if (currentColumns <= 1) return; // Don't allow removing the last column

    // Get column number from ID
    const columnNumber = parseInt(columnIdToRemove.split('-')[1]);
    const newColumnCount = currentColumns - 1;

    // Shift blocks: remove blocks from deleted column and shift columns after it
    const updatedCharacters = characterData.characters.map((char: CharacterTab) => {
      if (char.id === activeCharacter.id) {
        return {
          ...char,
          subTabs: char.subTabs?.map(subTab => {
            if (subTab.id === activeSubTab.id) {
              const updatedBlocks = subTab.blocks
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
                ...subTab,
                columns: newColumnCount,
                blocks: updatedBlocks
              };
            }
            return subTab;
          })
        };
      }
      return char;
    });

    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: panel.id,
        updates: {
          characterData: {
            ...characterData,
            characters: updatedCharacters
          }
        }
      }
    });
  }, [characterData, activeCharacter, activeSubTab, canEditCharacter, panel.id, dispatch]);

  // Handler: Update block data
  const handleUpdateBlock = useCallback((blockId: string, newData: any) => {
    if (!characterData || !activeCharacter || !activeSubTab) return;

    const updatedCharacters = characterData.characters.map((char: CharacterTab) => {
      if (char.id === activeCharacter.id) {
        return {
          ...char,
          subTabs: char.subTabs?.map(subTab =>
            subTab.id === activeSubTab.id
              ? {
                  ...subTab,
                  blocks: subTab.blocks.map((block: any) =>
                    block.id === blockId ? { ...block, data: newData } : block
                  )
                }
              : subTab
          )
        };
      }
      return char;
    });

    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: panel.id,
        updates: {
          characterData: {
            ...characterData,
            characters: updatedCharacters
          }
        }
      }
    });
  }, [characterData, activeCharacter, activeSubTab, panel.id, dispatch]);

  // Handler: Remove block
  const handleRemoveBlock = useCallback((blockId: string) => {
    if (!characterData || !activeCharacter || !activeSubTab || !canEditCharacter) return;

    const updatedCharacters = characterData.characters.map((char: CharacterTab) => {
      if (char.id === activeCharacter.id) {
        return {
          ...char,
          subTabs: char.subTabs?.map(subTab =>
            subTab.id === activeSubTab.id
              ? { ...subTab, blocks: subTab.blocks.filter(block => block.id !== blockId) }
              : subTab
          )
        };
      }
      return char;
    });

    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: panel.id,
        updates: {
          characterData: {
            ...characterData,
            characters: updatedCharacters
          }
        }
      }
    });
  }, [characterData, activeCharacter, activeSubTab, canEditCharacter, panel.id, dispatch]);

  // Move block handlers
  const handleMoveBlockUp = useCallback((blockId: string) => {
    if (!characterData || !activeCharacter || !activeSubTab || !canEditCharacter) return;

    const blocks = [...activeSubTab.blocks];
    const currentIndex = blocks.findIndex(b => b.id === blockId);

    if (currentIndex <= 0) return; // Already at the top

    // Swap with previous block
    [blocks[currentIndex], blocks[currentIndex - 1]] = [blocks[currentIndex - 1], blocks[currentIndex]];

    // Update order property
    const reorderedBlocks = blocks.map((block, index) => ({
      ...block,
      order: index
    }));

    const updatedCharacters = characterData.characters.map((char: CharacterTab) => {
      if (char.id === activeCharacter.id) {
        return {
          ...char,
          subTabs: char.subTabs?.map(subTab =>
            subTab.id === activeSubTab.id
              ? { ...subTab, blocks: reorderedBlocks }
              : subTab
          )
        };
      }
      return char;
    });

    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: panel.id,
        updates: {
          characterData: {
            ...characterData,
            characters: updatedCharacters
          }
        }
      }
    });
  }, [characterData, activeCharacter, activeSubTab, canEditCharacter, panel.id, dispatch]);

  const handleMoveBlockDown = useCallback((blockId: string) => {
    if (!characterData || !activeCharacter || !activeSubTab || !canEditCharacter) return;

    const blocks = [...activeSubTab.blocks];
    const currentIndex = blocks.findIndex(b => b.id === blockId);

    if (currentIndex === -1 || currentIndex >= blocks.length - 1) return; // Already at the bottom

    // Swap with next block
    [blocks[currentIndex], blocks[currentIndex + 1]] = [blocks[currentIndex + 1], blocks[currentIndex]];

    // Update order property
    const reorderedBlocks = blocks.map((block, index) => ({
      ...block,
      order: index
    }));

    const updatedCharacters = characterData.characters.map((char: CharacterTab) => {
      if (char.id === activeCharacter.id) {
        return {
          ...char,
          subTabs: char.subTabs?.map(subTab =>
            subTab.id === activeSubTab.id
              ? { ...subTab, blocks: reorderedBlocks }
              : subTab
          )
        };
      }
      return char;
    });

    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: panel.id,
        updates: {
          characterData: {
            ...characterData,
            characters: updatedCharacters
          }
        }
      }
    });
  }, [characterData, activeCharacter, activeSubTab, canEditCharacter, panel.id, dispatch]);

  if (!characterData) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-slate-800 p-4">
        <p className="text-slate-400 text-sm">Character panel not initialized</p>
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
            const isOwnCharacter = character.playerId === activePlayerId;

            return (
              <button
                key={character.id}
                onClick={() => handleSelectCharacter(character.id)}
                onContextMenu={(e) => handleOpenCharacterSettings(character.id, e)}
                className={`px-3 py-1.5 text-xs font-medium rounded-t transition-colors relative flex items-center gap-1 ${
                  isActive
                    ? 'bg-purple-600 text-white'
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
          <div className="mb-3 flex-shrink-0">
            <div className="flex items-start gap-3">
              {/* Avatar */}
              <div className="relative group flex-shrink-0">
                <div
                  className="w-20 h-20 rounded-full overflow-hidden flex items-center justify-center bg-slate-700"
                  style={{
                    borderColor: activeCharacter.avatarBorderColor || '#a855f7',
                    borderWidth: `${(activeCharacter.avatarBorderWidth ?? 5) * (state.viewTransform?.pixelsPerVU || 1)}px`,
                    borderStyle: 'solid'
                  }}
                >
                  {activeCharacter.avatarUrl && avatarUrlCache[activeCharacter.id] ? (
                    <img
                      src={avatarUrlCache[activeCharacter.id]}
                      alt={activeCharacter.characterName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User size={40} className="text-slate-400" />
                  )}
                </div>

                {/* Avatar settings button overlay */}
                {(isGM || activeCharacter.playerId === activePlayerId) && (
                  <div className="absolute inset-0 bg-black bg-opacity-50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setAvatarSettingsModal(activeCharacter)}
                      className="bg-white text-black rounded-full p-1.5 hover:bg-slate-200"
                      title={t('Avatar settings', language)}
                    >
                      <Settings size={14} />
                    </button>
                  </div>
                )}
              </div>

              {/* Character Name and Sub-tabs */}
              <div className="flex-1 min-w-0">
                {/* Character Name */}
                <div className="flex items-center justify-between mb-2 gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
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
                        className="text-lg font-semibold leading-[1.2] bg-slate-700 text-white px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 w-full min-w-0"
                        autoFocus
                      />
                    ) : (
                      <h3
                        className="text-lg font-semibold leading-[1.2] text-white cursor-pointer hover:text-slate-300 transition-colors truncate"
                        onDoubleClick={handleStartEditCharacterName}
                        title="Double-click to rename"
                      >
                        {activeCharacter.characterName}
                      </h3>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Character Token Button */}
                    <button
                      onClick={(e) => handleCreateCharacterToken(activeCharacter, e)}
                      className="w-5 h-5 rounded-full bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center transition-colors"
                      title={t('Create Character Token', language)}
                      style={{ width: '21px', height: '21px' }}
                    >
                      <Sparkles size={10} />
                    </button>
                    {/* Delete Character Button */}
                    {isGM && (
                      <button
                        onClick={() => handleRemoveCharacter(activeCharacter.id)}
                        className="p-1 text-slate-400 hover:text-red-400 transition-colors"
                        title="Remove character"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Sub-tabs */}
                {activeCharacter.subTabs && activeCharacter.subTabs.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {activeCharacter.subTabs.map((subTab: any) => {
                      const isActive = subTab.id === (activeCharacter.activeSubTabId || activeSubTabId);
                      return (
                        <button
                          key={subTab.id}
                          onClick={() => handleSelectSubTab(subTab.id)}
                          className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                            isActive
                              ? 'bg-purple-600 text-white'
                              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                          }`}
                        >
                          {subTab.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Blocks Container - Multi-column layout */}
          {activeSubTab && (
            <div
              className="flex-1 overflow-y-auto pr-1 min-h-0 w-full scrollbar-thin"
              data-scrollable="true"
            >
              <div className="flex gap-1.5 h-full">
                {Array.from({ length: activeSubTab.columns || 1 }, (_, columnIndex) => {
                  const columnId = `column-${columnIndex + 1}`;
                  const columnBlocks = activeSubTab.blocks
                    .filter(block => block.visible && block.columnId === columnId)
                    .sort((a, b) => a.order - b.order);

                  return (
                    <div
                      key={columnId}
                      className="flex-1 flex flex-col space-y-1.5 min-w-0"
                      style={{ width: `${100 / (activeSubTab.columns || 1)}%` }}
                    >
                      {columnBlocks.map(block => {
                      const blockIndex = columnBlocks.findIndex(b => b.id === block.id);
                      const isFirst = blockIndex === 0;
                      const isLast = blockIndex === columnBlocks.length - 1;

                      return (
                        <div
                          key={block.id}
                          className="w-full bg-slate-700 rounded box-border p-1.5"
                          style={{ boxSizing: 'border-box' }}
                        >
                          {/* Block header */}
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
                                  {/* Add Item button for Quick Access blocks */}
                                  {block.type === CharacterBlockType.QUICK_ACCESS && (
                                    <button
                                      onClick={() => {
                                        const qaBlock = block as any;
                                        const qaData = qaBlock.data;
                                        if (qaData.maxItems && qaData.items.length >= qaData.maxItems) return;
                                        const newItem = {
                                          id: `item-${Date.now()}`,
                                          name: 'New Item',
                                          quantity: 1
                                        };
                                        handleUpdateBlock(block.id, {
                                          ...qaData,
                                          items: [...qaData.items, newItem]
                                        });
                                      }}
                                      className="p-1 text-slate-400 hover:text-green-400 disabled:opacity-30 disabled:cursor-not-allowed"
                                      title="Add item"
                                      disabled={block.type === CharacterBlockType.QUICK_ACCESS && (block.data as any).maxItems && (block.data as any).items.length >= (block.data as any).maxItems}
                                    >
                                      <Plus size={14} />
                                    </button>
                                  )}
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
                            onIconClick={(slider) => setSliderIconModal({ slider, blockId: block.id })}
                          />
                        );
                      case CharacterBlockType.TABLE:
                        return (
                          <TableBlock
                            block={block}
                            editable={canManageCharacter}
                            onChange={(newData) => handleUpdateBlock(block.id, newData)}
                          />
                        );
                      case CharacterBlockType.QUICK_ACCESS:
                        return (
                          <QuickAccessBlock
                            block={block}
                            editable={canManageCharacter}
                            onChange={(newData) => handleUpdateBlock(block.id, newData)}
                          />
                        );
                      case CharacterBlockType.COUNTER:
                        return (
                          <CounterBlock
                            block={block}
                            editable={canManageCharacter}
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
  )}

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
                  name: 'Quick Access',
                  icon: <ImageIcon size={16} />,
                  action: () => {
                    handleAddBlock(CharacterBlockType.QUICK_ACCESS);
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

      {/* Access Denied */}
      {!isCollapsed && activeCharacter && !canViewCharacter && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-slate-400">
            <Lock size={32} className="mx-auto mb-2" />
            <p>You don't have permission to view this character</p>
          </div>
        </div>
      )}

      {/* Avatar Settings Modal */}
      {avatarSettingsModal && createPortal(
        <div className="fixed inset-0 z-[100008] flex items-center justify-center bg-black/40" onClick={() => { closeSettingsModal(); setAvatarSettingsModal(null); }}>
          <div className="bg-slate-800 rounded-lg shadow-xl w-[400px] border border-slate-600 max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex justify-center items-center py-2 px-4 border-b border-slate-700">
              <h3 className="text-base font-bold text-white">
                {t('Avatar Settings', language)}: {avatarSettingsModal.characterName}
              </h3>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
              <AvatarSettingsModal
                ref={avatarSettingsModalRef}
                character={avatarSettingsModal}
                pixelsPerVU={state.viewTransform?.pixelsPerVU || 1}
              />
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 p-4 border-t border-slate-700">
              <button
                onClick={() => { closeSettingsModal(); setAvatarSettingsModal(null); }}
                className="px-4 py-2 text-sm text-gray-300 hover:bg-slate-700 rounded transition-colors"
              >
                {t('Cancel', language)}
              </button>
              <button
                onClick={handleSaveAvatarSettings}
                className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-500 text-white rounded transition-colors"
              >
                {t('Save', language)}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Slider Icon Modal */}
      {sliderIconModal && createPortal(
        <div className="fixed inset-0 z-[100008] flex items-center justify-center bg-black/40" onClick={() => setSliderIconModal(null)}>
          <div className="bg-slate-800 rounded-lg shadow-xl w-[360px] border border-slate-600" onClick={(e) => e.stopPropagation()}>
            <SliderIconModal
              slider={sliderIconModal.slider}
              onClose={() => setSliderIconModal(null)}
              onSave={handleSaveSliderIcon}
            />
          </div>
        </div>,
        document.body
      )}

      {/* Character Settings Modal */}
      {settingsModal && createPortal(
        <div className="fixed inset-0 z-[100006] flex items-center justify-center bg-black/40" onClick={() => { closeSettingsModal(); setSettingsModal(null); }}>
          <div className="bg-slate-800 rounded-lg shadow-xl w-[575px] border border-slate-600 max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex justify-center items-center py-2 px-4">
              <h3 className="text-base font-bold text-white">Properties: {settingsModal.character.characterName}</h3>
            </div>

            {/* Tabs */}
            <div className="flex">
              <button className="flex-1 py-3 px-3 flex items-center justify-center gap-2 text-sm font-medium transition-colors bg-slate-700 text-white border-b-2 border-purple-500">
                General
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
              <div className="space-y-4">
                <CharacterSettingsModal
                  character={settingsModal.character}
                  players={players}
                  onSave={handleSaveCharacterSettings}
                  onCharacterChange={setTempSettingsCharacter}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex flex-col gap-2 p-4">
              {/* Save/Load Character Buttons */}
              {(isGM || canEditCharacter) && (
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
              )}

              {/* Cancel/Save Buttons */}
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    closeSettingsModal();
                    setSettingsModal(null);
                    setTempSettingsCharacter(null);
                  }}
                  className="px-4 py-2 text-sm text-gray-300 hover:bg-slate-700 rounded"
                >
                  Cancel
                </button>
                {settingsModal && (
                  <button
                    onClick={() => {
                      // Save character settings when in settings modal
                      if (tempSettingsCharacter) {
                        handleSaveCharacterSettings(tempSettingsCharacter);
                      }
                      closeSettingsModal();
                      setSettingsModal(null);
                      setTempSettingsCharacter(null);
                    }}
                    className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-500 text-white rounded flex items-center gap-2"
                  >
                    Save Changes
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Remove Character Confirmation Modal */}
      {pendingRemoveCharacterId && createPortal(
        <div className="fixed inset-0 z-[100007] flex items-center justify-center bg-black/40" onClick={handleCancelRemoveCharacter}>
          <div className="bg-slate-800 rounded-lg shadow-xl w-[400px] border border-slate-600" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex justify-center items-center py-3 px-4 border-b border-slate-600">
              <h3 className="text-base font-bold text-white">Confirm Deletion</h3>
            </div>

            {/* Content */}
            <div className="p-4">
              <p className="text-slate-300 text-sm">
                Are you sure you want to delete this character? This action cannot be undone.
              </p>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 p-4 pt-0">
              <button
                onClick={handleCancelRemoveCharacter}
                className="px-4 py-2 text-sm text-gray-300 hover:bg-slate-700 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRemoveCharacter}
                className="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 text-white rounded transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

// Memoize CharacterPanel to prevent unnecessary re-renders
export default React.memo(CharacterPanel, (prevProps, nextProps) => {
  // Re-render only if panel or collapse state changes
  if (prevProps.panel.id !== nextProps.panel.id) return false;
  if (prevProps.isCollapsed !== nextProps.isCollapsed) return false;

  // Compare character data if panel is the same
  const prevCharacterData = (prevProps.panel as any).characterData;
  const nextCharacterData = (nextProps.panel as any).characterData;

  // If character data references are the same, skip re-render
  if (prevCharacterData === nextCharacterData) return true;

  // Quick check: compare active character ID
  if (prevCharacterData?.activeCharacterId !== nextCharacterData?.activeCharacterId) return false;

  // Check if characters array length changed
  if (prevCharacterData?.characters?.length !== nextCharacterData?.characters?.length) return false;

  // All checks passed - skip re-render
  return true;
});