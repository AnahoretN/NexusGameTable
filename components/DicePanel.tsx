/**
 * DicePanel - Panel for quick dice rolling
 *
 * Features:
 * - Configurable dice presets (d6, d10, d20, etc.)
 * - Click to increment count for each dice
 * - Right-click for context menu (reset, add dice, settings, remove)
 * - Reset and Roll buttons
 * - Roll field shows thrown dice with random values
 * - Uses ObjectSettingsModal for dice configuration
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useGame } from '../store/GameContext';
import { PanelObject, DicePanelData, DicePreset, AppLanguage, ItemType, DiceObject, TokenShape, RolledDice } from '../types';
import { Plus, RotateCcw, Zap, Trash2, Settings } from 'lucide-react';
import { t as translate, Locale } from '../utils/translations';
import { createDice } from '../utils/objectFactories';
import { generateUUID } from '../utils/uuid';
import { DiceRenderer, DiceRenderData } from './DiceRenderer';
import { ObjectSettingsModal } from './ObjectSettingsModal';

interface DicePanelProps {
  panel: PanelObject;
  language?: AppLanguage;
}

// Default dice presets
const DEFAULT_PRESETS: DicePreset[] = [
  { id: 'd6', name: 'd6', sides: 6, count: 0, color: '#3b82f6' },
  { id: 'd10', name: 'd10', sides: 10, count: 0, color: '#10b981' },
  { id: 'd20', name: 'd20', sides: 20, count: 0, color: '#8b5cf6' },
];

// Convert DicePreset to temporary DiceObject for settings modal
function presetToDiceObject(preset: DicePreset): DiceObject {
  // Get dice shape based on number of sides (local helper)
  const getDiceShape = (sides: number): TokenShape => {
    if (sides < 5) return TokenShape.TRIANGLE;
    if (sides <= 12) return TokenShape.SQUARE;
    return TokenShape.HEX;
  };

  const dice = createDice({
    id: `temp-${preset.id}`,
    name: preset.name,
    sides: preset.sides,
    x: 0,
    y: 0,
    color: preset.color,
    shape: preset.shape || getDiceShape(preset.sides),
    valueOverrides: preset.valueOverrides,
    isExplosive: preset.isExplosive,
    explosiveColor: preset.explosiveColor,
    explosiveTextColor: preset.explosiveTextColor,
    explosiveGlow: preset.explosiveGlow,
    diceGroupId: preset.diceGroupId,
    borderColor: preset.borderColor,
    borderWidth: preset.borderWidth,
    borderOpacity: preset.borderOpacity,
    opacity: preset.opacity,
  });

  // Override default currentValue with 1 for preview
  dice.currentValue = 1;

  return dice;
}

// Convert DiceObject back to DicePreset
function diceObjectToPreset(dice: DiceObject, originalPreset: DicePreset): DicePreset {
  return {
    id: originalPreset.id,
    name: dice.name,
    sides: dice.sides,
    count: originalPreset.count,
    color: dice.color,
    shape: dice.shape,
    valueOverrides: dice.valueOverrides,
    isExplosive: dice.isExplosive,
    explosiveColor: dice.explosiveColor,
    explosiveTextColor: dice.explosiveTextColor,
    explosiveGlow: dice.explosiveGlow,
    diceGroupId: dice.diceGroupId,
    borderColor: dice.borderColor,
    borderWidth: dice.borderWidth,
    borderOpacity: dice.borderOpacity,
    opacity: dice.opacity,
  };
}

export const DicePanel: React.FC<DicePanelProps> = ({
  panel,
  language = 'en'
}) => {
  const { state, dispatch } = useGame();
  const panelRef = useRef<HTMLDivElement>(null);

  // Get dice data from panel
  const panelObject = state.objects[panel.id] as PanelObject | undefined;
  const diceData = panelObject?.diceData || panel.diceData;

  // State for context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; preset: DicePreset } | null>(null);

  // State for settings modal - store the preset being edited
  const [settingsPreset, setSettingsPreset] = useState<DicePreset | null>(null);

  // Memoize temporary dice object for settings modal to avoid recreation on every render
  const settingsDiceObject = useMemo(() => {
    return settingsPreset ? presetToDiceObject(settingsPreset) : null;
  }, [settingsPreset]);

  // Initialize dice data if not exists
  useEffect(() => {
    if (!diceData) {
      const defaultDiceData: DicePanelData = {
        presets: DEFAULT_PRESETS,
        rolledDice: [],
      };

      dispatch({
        type: 'UPDATE_OBJECT',
        _localOnly: true,
        payload: {
          id: panel.id,
          diceData: defaultDiceData
        }
      });
    }
  }, [diceData, panel.id, dispatch]);

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

  // Handler: Increment dice count
  const handleIncrementCount = useCallback((presetId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Always read fresh diceData from state to avoid stale closure
    const panelObject = state.objects[panel.id] as PanelObject | undefined;
    const currentDiceData = panelObject?.diceData || panel.diceData;

    if (!currentDiceData) return;

    const updatedPresets = currentDiceData.presets.map(preset => {
      if (preset.id === presetId) {
        return { ...preset, count: preset.count + 1 };
      }
      return preset;
    });

    dispatch({
      type: 'UPDATE_OBJECT',
      _localOnly: true,
      payload: {
        id: panel.id,
        diceData: {
          ...currentDiceData,
          presets: updatedPresets
        }
      }
    });
  }, [state, panel.id, panel.diceData, dispatch]);

  // Handler: Reset all counts
  const handleReset = useCallback(() => {
    // Always read fresh diceData from state to avoid stale closure
    const panelObject = state.objects[panel.id] as PanelObject | undefined;
    const currentDiceData = panelObject?.diceData || panel.diceData;

    if (!currentDiceData) return;

    const updatedPresets = currentDiceData.presets.map(preset => ({
      ...preset,
      count: 0
    }));

    dispatch({
      type: 'UPDATE_OBJECT',
      _localOnly: true,
      payload: {
        id: panel.id,
        diceData: {
          ...currentDiceData,
          presets: updatedPresets
        }
      }
    });
  }, [state, panel.id, panel.diceData, dispatch]);

  // Handler: Roll dice
  const handleRoll = useCallback(() => {
    // Always read fresh diceData from state to avoid stale closure
    const panelObject = state.objects[panel.id] as PanelObject | undefined;
    const currentDiceData = panelObject?.diceData || panel.diceData;

    if (!currentDiceData) return;

    // Calculate total number of dice to roll
    const totalCount = currentDiceData.presets.reduce((sum, preset) => sum + preset.count, 0);
    if (totalCount === 0) return;

    // Create new rolled dice with better positioning
    const newRolledDice: RolledDice[] = [];
    const positions: { x: number; y: number }[] = [];

    // Grid-based positioning to avoid overlap
    // Calculate grid size based on number of dice
    const gridCols = Math.ceil(Math.sqrt(totalCount * 1.5)); // Wider grid for better fit
    const gridRows = Math.ceil(totalCount / gridCols);

    // Generate positions in a grid pattern with some randomness
    let diceIndex = 0;
    currentDiceData.presets.forEach(preset => {
      for (let i = 0; i < preset.count; i++) {
        const diceId = generateUUID();

        // Calculate grid position with randomness
        const gridRow = Math.floor(diceIndex / gridCols);
        const gridCol = diceIndex % gridCols;

        // Base position in percentage (0-100)
        const baseX = ((gridCol + 0.5) / gridCols) * 100;
        const baseY = ((gridRow + 0.5) / gridRows) * 100;

        // Add randomness (within grid cell)
        const randomness = 30 / gridCols; // Less randomness for more dice
        const randomX = baseX + (Math.random() - 0.5) * randomness;
        const randomY = baseY + (Math.random() - 0.5) * randomness;

        // Clamp to 0-100 range with margin
        const x = Math.max(10, Math.min(90, randomX));
        const y = Math.max(10, Math.min(90, randomY));

        // Check for overlaps with existing positions and adjust if needed
        let adjustedX = x;
        let adjustedY = y;
        let attempts = 0;
        const minDistance = 15; // Minimum distance between dice centers (%)

        while (attempts < 10) {
          let overlaps = false;
          for (const pos of positions) {
            const dx = adjustedX - pos.x;
            const dy = adjustedY - pos.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < minDistance) {
              overlaps = true;
              break;
            }
          }
          if (!overlaps) break;
          // Try a new random position
          adjustedX = 10 + Math.random() * 80;
          adjustedY = 10 + Math.random() * 80;
          attempts++;
        }

        positions.push({ x: adjustedX, y: adjustedY });

        // Roll the dice (set random value)
        const rollValue = Math.floor(Math.random() * preset.sides) + 1;

        // Get dice shape based on number of sides (local helper)
        const getDiceShape = (sides: number): TokenShape => {
          if (sides < 5) return TokenShape.TRIANGLE;
          if (sides <= 12) return TokenShape.SQUARE;
          return TokenShape.HEX;
        };

        const rolledDice: RolledDice = {
          id: diceId,
          name: preset.name,
          sides: preset.sides,
          value: rollValue,
          x: adjustedX,
          y: adjustedY,
          color: preset.color || '#3b82f6',
          shape: preset.shape || getDiceShape(preset.sides),
          valueOverrides: preset.valueOverrides,
          isExplosive: preset.isExplosive,
          explosiveColor: preset.explosiveColor,
          explosiveTextColor: preset.explosiveTextColor,
          explosiveGlow: preset.explosiveGlow,
          diceGroupId: preset.diceGroupId,
          borderColor: preset.borderColor,
          borderWidth: preset.borderWidth,
          borderOpacity: preset.borderOpacity,
          opacity: preset.opacity,
        };

        newRolledDice.push(rolledDice);
        diceIndex++;
      }
    });

    // Update panel data
    dispatch({
      type: 'UPDATE_OBJECT',
      _localOnly: true,
      payload: {
        id: panel.id,
        diceData: {
          ...currentDiceData,
          rolledDice: newRolledDice
        }
      }
    });
  }, [state, panel.id, panel.diceData, dispatch]);

  // Handler: Add new dice preset
  const handleAddPreset = useCallback(() => {
    // Always read fresh diceData from state to avoid stale closure
    const panelObject = state.objects[panel.id] as PanelObject | undefined;
    const currentDiceData = panelObject?.diceData || panel.diceData;

    if (!currentDiceData) return;

    // Pick a random color for new preset
    const colors = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899'];
    const randomColor = colors[currentDiceData.presets.length % colors.length];

    const newPreset: DicePreset = {
      id: `custom-${Date.now()}`,
      name: `d${currentDiceData.presets.length + 1}`,
      sides: 6,
      count: 0,
      color: randomColor,
    };

    dispatch({
      type: 'UPDATE_OBJECT',
      _localOnly: true,
      payload: {
        id: panel.id,
        diceData: {
          ...currentDiceData,
          presets: [...currentDiceData.presets, newPreset]
        }
      }
    });
  }, [state, panel.id, panel.diceData, dispatch]);

  // Handler: Remove dice preset
  const handleRemovePreset = useCallback((presetId: string) => {
    // Always read fresh diceData from state to avoid stale closure
    const panelObject = state.objects[panel.id] as PanelObject | undefined;
    const currentDiceData = panelObject?.diceData || panel.diceData;

    if (!currentDiceData) return;

    const updatedPresets = currentDiceData.presets.filter(p => p.id !== presetId);

    dispatch({
      type: 'UPDATE_OBJECT',
      _localOnly: true,
      payload: {
        id: panel.id,
        diceData: {
          ...currentDiceData,
          presets: updatedPresets
        }
      }
    });

    setContextMenu(null);
  }, [state, panel.id, panel.diceData, dispatch]);

  // Handler: Reset single dice count
  const handleResetSingle = useCallback((presetId: string) => {
    // Always read fresh diceData from state to avoid stale closure
    const panelObject = state.objects[panel.id] as PanelObject | undefined;
    const currentDiceData = panelObject?.diceData || panel.diceData;

    if (!currentDiceData) return;

    const updatedPresets = currentDiceData.presets.map(preset => {
      if (preset.id === presetId) {
        return { ...preset, count: 0 };
      }
      return preset;
    });

    dispatch({
      type: 'UPDATE_OBJECT',
      _localOnly: true,
      payload: {
        id: panel.id,
        diceData: {
          ...currentDiceData,
          presets: updatedPresets
        }
      }
    });

    setContextMenu(null);
  }, [state, panel.id, panel.diceData, dispatch]);

  // Handler: Add dice preset after current one (to the right)
  const handleAddPresetAfter = useCallback((afterPresetId: string) => {
    // Always read fresh diceData from state to avoid stale closure
    const panelObject = state.objects[panel.id] as PanelObject | undefined;
    const currentDiceData = panelObject?.diceData || panel.diceData;

    if (!currentDiceData) return;

    // Find the index of the preset after which to insert
    const afterIndex = currentDiceData.presets.findIndex(p => p.id === afterPresetId);
    if (afterIndex === -1) return;

    // Pick a random color for new preset
    const colors = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899'];
    const randomColor = colors[afterIndex % colors.length];

    const newPreset: DicePreset = {
      id: `custom-${Date.now()}`,
      name: `d${currentDiceData.presets.length + 1}`,
      sides: 6,
      count: 0,
      color: randomColor,
    };

    // Insert new preset after the current one
    const updatedPresets = [...currentDiceData.presets];
    updatedPresets.splice(afterIndex + 1, 0, newPreset);

    dispatch({
      type: 'UPDATE_OBJECT',
      _localOnly: true,
      payload: {
        id: panel.id,
        diceData: {
          ...currentDiceData,
          presets: updatedPresets
        }
      }
    });

    setContextMenu(null);
  }, [state, panel.id, panel.diceData, dispatch]);

  // Handler: Open full settings for preset
  const handleOpenSettings = useCallback((preset: DicePreset) => {
    setContextMenu(null);
    setSettingsPreset(preset);
  }, []);

  // Handler: Save dice settings from ObjectSettingsModal
  const handleSaveSettings = useCallback((updatedDice: DiceObject) => {
    // Always read fresh diceData from state to avoid stale closure
    const panelObject = state.objects[panel.id] as PanelObject | undefined;
    const currentDiceData = panelObject?.diceData || panel.diceData;

    if (!currentDiceData || !settingsPreset) return;

    // Convert DiceObject back to DicePreset
    const updatedPreset = diceObjectToPreset(updatedDice, settingsPreset);

    const updatedPresets = currentDiceData.presets.map(p => {
      if (p.id === updatedPreset.id) {
        return updatedPreset;
      }
      return p;
    });

    dispatch({
      type: 'UPDATE_OBJECT',
      _localOnly: true,
      payload: {
        id: panel.id,
        diceData: {
          ...currentDiceData,
          presets: updatedPresets
        }
      }
    });

    setSettingsPreset(null);
  }, [state, panel.id, panel.diceData, settingsPreset, dispatch]);

  // Get currently rolled dice
  const rolledDice = useMemo(() => {
    return diceData?.rolledDice || [];
  }, [diceData?.rolledDice]);

  // Calculate total selected dice
  const totalSelected = useMemo(() => {
    if (!diceData) return 0;
    return diceData.presets.reduce((sum, preset) => sum + preset.count, 0);
  }, [diceData]);

  if (!diceData) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-800">
        <p className="text-slate-400 text-sm">{translate('Loading...', language as Locale)}</p>
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      className="h-full flex flex-col bg-slate-800 w-full"
      data-dice-panel={panel.id}
    >
      {/* Dice Presets Container - Fixed height at top */}
      <div className="flex-shrink-0 border-b border-slate-700">
        <div
          className="overflow-x-auto overflow-y-hidden scrollbar-thin p-2"
          style={{ maxHeight: '140px' }}
          onContextMenu={(e) => {
            // Prevent default context menu for entire dice area
            e.preventDefault();
          }}
        >
          <div className="flex h-full items-center" style={{ gap: '5.6px' }}>
            {diceData.presets.map((preset) => (
              <div
                key={preset.id}
                className="flex flex-col items-center gap-1 flex-shrink-0"
                onContextMenu={(e) => {
                  console.log('Context menu triggered on dice container', preset.name);
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenu({ x: e.clientX, y: e.clientY, preset });
                }}
              >
                {/* Dice button - click to increment */}
                <button
                  onClick={(e) => handleIncrementCount(preset.id, e)}
                  className={`relative transition-all hover:scale-105 ${
                    preset.count > 0
                      ? 'ring-2 ring-blue-500 rounded-lg'
                      : ''
                  }`}
                  style={{ padding: '4px' }}
                >
                  <DiceRenderer
                    dice={{
                      id: preset.id,
                      name: preset.name,
                      sides: preset.sides,
                      value: preset.sides, // Show sides number in preview
                      color: preset.color || '#3b82f6',
                      shape: preset.shape,
                      valueOverrides: preset.valueOverrides,
                      isExplosive: preset.isExplosive,
                      explosiveColor: preset.explosiveColor,
                      explosiveTextColor: preset.explosiveTextColor,
                      explosiveGlow: preset.explosiveGlow,
                      borderColor: preset.borderColor,
                      borderWidth: preset.borderWidth,
                      borderOpacity: preset.borderOpacity,
                      opacity: preset.opacity,
                    }}
                    size={50}
                    showValue={true}
                    showSides={false}
                  />

                  {/* Count badge */}
                  {preset.count > 0 && (
                    <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-slate-800">
                      {preset.count}
                    </span>
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Context Menu - rendered with Portal */}
      {contextMenu && createPortal(
        <div
          className="fixed z-[100009] bg-slate-800 border border-slate-600 rounded-lg shadow-xl py-1 min-w-[150px] pointer-events-auto"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => handleResetSingle(contextMenu.preset.id)}
            className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-slate-700 flex items-center gap-2"
          >
            <RotateCcw size={16} />
            {translate('Reset', language as Locale)}
          </button>
          <button
            onClick={() => handleAddPresetAfter(contextMenu.preset.id)}
            className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-slate-700 flex items-center gap-2"
          >
            <Plus size={16} />
            {translate('Add Dice', language as Locale)}
          </button>
          <div className="border-t border-slate-600 my-1" />
          <button
            onClick={() => handleOpenSettings(contextMenu.preset)}
            className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-slate-700 flex items-center gap-2"
          >
            <Settings size={16} />
            {translate('Settings', language as Locale)}
          </button>
          <button
            onClick={() => handleRemovePreset(contextMenu.preset.id)}
            className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-slate-700 flex items-center gap-2"
          >
            <Trash2 size={16} />
            {translate('Remove', language as Locale)}
          </button>
        </div>,
        document.body
      )}

      {/* Action Buttons */}
      <div className="px-2 pb-2 flex gap-2">
        {/* Reset Button */}
        <button
          onClick={handleReset}
          disabled={totalSelected === 0}
          className="flex-1 px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-gray-600 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <RotateCcw size={16} />
          {translate('Reset', language as Locale)}
        </button>

        {/* Roll Button */}
        <button
          onClick={handleRoll}
          disabled={totalSelected === 0}
          className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-gray-600 text-white rounded-lg transition-colors flex items-center justify-center gap-2 font-bold"
        >
          <Zap size={16} />
          {translate('Roll', language as Locale)}
        </button>
      </div>

      {/* Roll Field - takes remaining space */}
      <div className="flex-1 relative overflow-hidden bg-slate-900/50 rounded-lg mx-2 mb-2">
        {rolledDice.length > 0 ? (
          <>
            {rolledDice.map((dice) => (
              <div
                key={dice.id}
                className="absolute transform -translate-x-1/2 -translate-y-1/2"
                style={{
                  left: `${dice.x}%`,
                  top: `${dice.y}%`,
                }}
              >
                <DiceRenderer
                  dice={dice}
                  size={50}
                  showValue={true}
                  showSides={false}
                />
              </div>
            ))}
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm">
            {translate('Select dice and press Roll', language as Locale) || 'Select dice and press Roll'}
          </div>
        )}
      </div>

      {/* Full Object Settings Modal */}
      {settingsDiceObject && createPortal(
        <ObjectSettingsModal
          object={settingsDiceObject}
          onSave={handleSaveSettings}
          onClose={() => setSettingsPreset(null)}
          allObjects={state.objects}
          language={language}
          diceGroups={state.diceGroups || []}
          dispatch={dispatch}
          zIndex="z-[100010]"
          hideGroupsTab={true}
          hideActionsTab={true}
        />,
        document.body
      )}
    </div>
  );
};

export default DicePanel;
