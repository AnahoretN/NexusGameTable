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
import { vuToPixels } from '../utils/vuSystem';

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

// Dice sizes in virtual units (vu)
// 1 vu = 0.1% of screen height, so 1000 vu = 100% of screen height
const DICE_SIZE_VU = 65; // Base size for dice preview (≈70px on 1080p screen)
const DICE_CONTAINER_VU = 68; // Container size (≈73px on 1080p screen)
const DICE_PADDING_VU = 3; // Padding around dice (reduced by 25%)
const DICE_BADGE_SIZE_VU = 25; // Badge size for count (≈27px on 1080p screen)
const DICE_SECTION_SPACING_VU = 3; // Spacing between sections (≈3.2px on 1080p screen)
const DICE_MENU_MAX_HEIGHT_VU = 235; // Maximum height for dice menu (≈27px on 1080p screen)

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

  // Get pixelsPerVU for converting vu to pixels
  const pixelsPerVU = state.viewTransform?.pixelsPerVU || 1;

  // Calculate dice sizes in pixels from vu
  const diceSizePx = useMemo(() => vuToPixels(DICE_SIZE_VU, pixelsPerVU), [pixelsPerVU]);
  const diceContainerSizePx = useMemo(() => vuToPixels(DICE_CONTAINER_VU, pixelsPerVU), [pixelsPerVU]);
  const dicePaddingPx = useMemo(() => vuToPixels(DICE_PADDING_VU, pixelsPerVU), [pixelsPerVU]);
  const diceBadgeSizePx = useMemo(() => vuToPixels(DICE_BADGE_SIZE_VU, pixelsPerVU), [pixelsPerVU]);
  const sectionSpacingPx = useMemo(() => vuToPixels(DICE_SECTION_SPACING_VU, pixelsPerVU), [pixelsPerVU]);
  const diceMenuMaxHeightPx = useMemo(() => vuToPixels(DICE_MENU_MAX_HEIGHT_VU, pixelsPerVU), [pixelsPerVU]);

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

  // Helper function to roll a single dice with explosive logic
  const rollSingleDice = useCallback((
    preset: DicePreset,
    diceId: string
  ): RolledDice => {
    // First roll
    const firstRoll = Math.floor(Math.random() * preset.sides) + 1;
    let finalValue = firstRoll;
    let explosiveRoll: number | undefined = undefined;

    // Handle explosive dice: if max value is rolled, roll again and add
    if (preset.isExplosive && firstRoll === preset.sides) {
      // Generate second roll value
      explosiveRoll = Math.floor(Math.random() * preset.sides) + 1;
      finalValue = preset.sides + explosiveRoll;
    }

    // Get dice shape based on number of sides (local helper)
    const getDiceShape = (sides: number): TokenShape => {
      if (sides < 5) return TokenShape.TRIANGLE;
      if (sides <= 12) return TokenShape.SQUARE;
      return TokenShape.HEX;
    };

    return {
      id: diceId,
      name: preset.name,
      sides: preset.sides,
      value: finalValue,
      explosiveRoll: explosiveRoll,
      x: 0, // Not used in table layout
      y: 0, // Not used in table layout
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
  }, []);

  // Handler: Roll dice
  const handleRoll = useCallback(() => {
    // Always read fresh diceData from state to avoid stale closure
    const panelObject = state.objects[panel.id] as PanelObject | undefined;
    const currentDiceData = panelObject?.diceData || panel.diceData;

    if (!currentDiceData) return;

    // Calculate total number of dice to roll
    const totalCount = currentDiceData.presets.reduce((sum, preset) => sum + preset.count, 0);
    if (totalCount === 0) return;

    // Create new rolled dice (no positioning needed - flex layout handles it)
    const newRolledDice: RolledDice[] = [];

    currentDiceData.presets.forEach(preset => {
      for (let i = 0; i < preset.count; i++) {
        const diceId = generateUUID();
        const rolledDice = rollSingleDice(preset, diceId);
        newRolledDice.push(rolledDice);
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
  }, [state, panel.id, panel.diceData, dispatch, rollSingleDice]);

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
      <div className="flex-shrink-0 border-b border-slate-700 overflow-y-auto overflow-x-hidden scrollbar-thin" style={{ maxHeight: `${diceMenuMaxHeightPx}px`, minHeight: 0 }}>
        <div className="p-2"
          onContextMenu={(e) => {
            // Prevent default context menu for entire dice area
            e.preventDefault();
          }}
        >
          <div className="flex flex-wrap h-full items-start" style={{ gap: '5.6px' }}>
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
                {/* Container sized in vu (converted to pixels) */}
                <div
                  className={`relative transition-all hover:scale-105 flex items-center justify-center rounded-lg ${
                    preset.count > 0
                      ? 'ring-2 ring-purple-400'
                      : ''
                  }`}
                  style={{
                    width: `${diceContainerSizePx}px`,
                    height: `${diceContainerSizePx}px`,
                    padding: `${vuToPixels(1, pixelsPerVU)}px`
                  }}
                >
                  <button
                    onClick={(e) => handleIncrementCount(preset.id, e)}
                    className="w-full h-full flex items-center justify-center"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
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
                      size={diceSizePx}
                      showValue={true}
                      showSides={false}
                    />
                  </button>

                  {/* Count badge (top-right) */}
                  {preset.count > 0 && (
                    <span
                      className="absolute -top-1 -right-1 bg-purple-600 text-white font-bold rounded-full flex items-center justify-center border-2 border-slate-800"
                      style={{
                        width: `${diceBadgeSizePx}px`,
                        height: `${diceBadgeSizePx}px`,
                        fontSize: `${diceBadgeSizePx * 0.45}px`
                      }}
                    >
                      {preset.count}
                    </span>
                  )}

                  {/* Explosive badge (bottom-left) */}
                  {preset.isExplosive && (
                    <span
                      className="absolute -bottom-1 -left-1 font-bold rounded-full flex items-center justify-center border-2 border-slate-800"
                      style={{
                        width: `${diceBadgeSizePx}px`,
                        height: `${diceBadgeSizePx}px`,
                        fontSize: `${diceBadgeSizePx * 0.45}px`,
                        backgroundColor: preset.explosiveColor || '#ffff00',
                        opacity: 0.9,
                      }}
                    >
                      💥
                    </span>
                  )}
                </div>
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
            {translate('Properties', language as Locale)}
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
      <div className="px-2 flex gap-2" style={{ paddingTop: `${sectionSpacingPx}px`, paddingBottom: `${sectionSpacingPx}px` }}>
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
          className="flex-1 px-3 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 disabled:text-gray-600 text-white rounded-lg transition-colors flex items-center justify-center gap-2 font-bold"
        >
          <Zap size={16} />
          {translate('Roll', language as Locale)}
        </button>
      </div>

      {/* Roll Field - takes remaining space */}
      <div className="flex-1 relative overflow-y-auto overflow-x-hidden bg-slate-900/50 rounded-lg ml-1 mb-1 scrollbar-thin">
        {rolledDice.length > 0 ? (
          <div className="flex flex-wrap items-start justify-start pt-2 pl-2 pb-2" style={{ gap: `${dicePaddingPx}px` }}>
            {rolledDice.map((dice) => (
              <div
                key={dice.id}
                className="flex-shrink-0"
              >
                <DiceRenderer
                  dice={dice}
                  size={diceSizePx}
                  showValue={true}
                  showSides={false}
                />
              </div>
            ))}
          </div>
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
