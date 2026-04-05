import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useGame } from '../store/GameContext';
import { PanelObject, PoolPanelData, PanelTab, AppLanguage, ItemType } from '../types';
import { Plus, Trash2, Lock, X } from 'lucide-react';
import { PoolTabletop } from './PoolTabletop';
import { findAvailableTerritory } from '../utils/territoryManager';
import { PoolTabSettingsModal } from './PoolTabSettingsModal';
import { getCursorSlotObjects } from '../utils/poolPlacement';

interface PoolPanelProps {
  panel: PanelObject;
  language?: AppLanguage;
}

export const PoolPanel: React.FC<PoolPanelProps> = React.memo(({
  panel,
  language = 'en'
}) => {
  const { state, dispatch } = useGame();

  // Get pool data from panel - use latest from state to ensure reactivity
  const panelObject = state.objects[panel.id] as PanelObject | undefined;
  const poolData = panelObject?.poolData || panel.poolData;

  // Initialize pool data if not exists
  useEffect(() => {
    if (!poolData) {
      // Get existing pool territories to find available space
      const existingPools = Object.values(state.objects)
        .filter(obj => obj.type === ItemType.PANEL && (obj as PanelObject).poolData)
        .flatMap(obj => {
          const poolPanel = obj as PanelObject;
          const poolData = poolPanel.poolData!;
          // Each tab has its own territory now
          return poolData.tabs.map(tab => ({
            id: tab.id,
            x: tab.offsetX || 0,
            y: tab.offsetY || 0,
            width: 1000, // Fixed pool size
            height: 1000
          }));
        });

      // Find available territory outside playable area (5000×5000)
      const territory = findAvailableTerritory(existingPools);

      if (!territory) {
        console.warn('No available territory for pool panel');
        return;
      }

      const defaultPoolData: PoolPanelData = {
        tabs: [
          {
            id: 'tab-default',
            name: 'Pool 1',
            visibleToPlayerIds: [],
            manageableByPlayerIds: [],
            editableByPlayerIds: [],
            zoom: 1.02,
            offsetX: territory.x,
            offsetY: territory.y,
            territoryId: `territory-${panel.id}-tab-default-${Date.now()}`
          }
        ],
        activeTabId: 'tab-default'
      };

      dispatch({
        type: 'UPDATE_OBJECT',
        payload: {
          id: panel.id,
          poolData: defaultPoolData
        }
      });
    } else {
      // Migrate old data where offsetX/offsetY were at panel level
      // Check if first tab is missing offsetX/offsetY
      const firstTab = poolData.tabs[0];
      if (firstTab && (firstTab.offsetX === undefined || firstTab.offsetY === undefined)) {
        // Check if we have old panel-level coordinates
        if (poolData.offsetX !== undefined && poolData.offsetY !== undefined) {
          // Migrate to tab-level coordinates
          const migratedTabs = poolData.tabs.map((tab, index) => {
            if (tab.offsetX === undefined || tab.offsetY === undefined) {
              // For existing tabs, use the old panel coordinates
              // For new tabs, they'll get their own territory when created
              return {
                ...tab,
                offsetX: poolData.offsetX!,
                offsetY: poolData.offsetY!,
                territoryId: poolData.territoryId || `territory-${panel.id}-tab-${tab.id}`
              };
            }
            return tab;
          });

          dispatch({
            type: 'UPDATE_OBJECT',
            payload: {
              id: panel.id,
              poolData: {
                ...poolData,
                tabs: migratedTabs
              }
            }
          });
        }
      }
    }
  }, [poolData, panel.id, dispatch, state.objects]);

  // Get current player info
  const currentPlayer = state.players.find(p => p.id === state.activePlayerId);
  const isGM = currentPlayer?.isGM ?? false;

  // Check if cursor slot has cards (for panel hover highlight)
  const cursorSlotHasCards = useMemo(() => {
    return getCursorSlotObjects(state.objects).length > 0;
  }, [state.objects]);

  // Panel hover state for highlight
  const [isPanelHovered, setIsPanelHovered] = useState(false);

  // Show highlight when hovering and cursor slot has cards
  const showPanelHighlight = isPanelHovered && cursorSlotHasCards;

  // Active tab
  const activeTab = useMemo(() => {
    if (!poolData) return null;
    return poolData.tabs.find((t: PanelTab) => t.id === poolData.activeTabId) || null;
  }, [poolData]);

  // Tab settings modal state
  const [settingsModal, setSettingsModal] = useState<{
    tabId: string;
    tab: PanelTab;
  } | null>(null);
  const [tempSettingsTab, setTempSettingsTab] = useState<PanelTab | null>(null);

  // Handler: Open tab settings
  const handleOpenTabSettings = useCallback((tabId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isGM) return;

    const tab = poolData?.tabs.find(t => t.id === tabId);
    if (tab) {
      setSettingsModal({ tabId, tab });
    }
  }, [poolData?.tabs, isGM]);

  // Handler: Save tab settings
  const handleSaveTabSettings = useCallback((updatedTab: PanelTab) => {
    if (!poolData) return;

    console.log('[PoolPanel] Saving tab settings:', {
      tabId: updatedTab.id,
      tabName: updatedTab.name,
      visibleToPlayerIds: updatedTab.visibleToPlayerIds,
      manageableByPlayerIds: updatedTab.manageableByPlayerIds,
      editableByPlayerIds: updatedTab.editableByPlayerIds
    });

    const updatedTabs = poolData.tabs.map(tab => {
      if (tab.id === settingsModal?.tabId) {
        return updatedTab;
      }
      return tab;
    });

    console.log('[PoolPanel] Updated tabs:', updatedTabs);

    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: panel.id,
        poolData: {
          ...poolData,
          tabs: updatedTabs
        }
      }
    });

    // Close the settings modal after saving
    setSettingsModal(null);
  }, [poolData, settingsModal?.tabId, panel.id, dispatch]);

  // Check permissions for active tab
  const canViewTab = useMemo(() => {
    if (!activeTab || !poolData) return false;
    if (isGM) return true;

    // Check if player is in visible list
    if (activeTab.visibleToPlayerIds.includes(state.activePlayerId)) return true;
    if (activeTab.visibleToPlayerIds.includes('all_players')) return true;

    return false;
  }, [activeTab, isGM, state.activePlayerId, poolData]);

  const canManageTab = useMemo(() => {
    if (!activeTab || !poolData) return false;
    if (isGM) return true;

    if (activeTab.manageableByPlayerIds.includes(state.activePlayerId)) return true;
    if (activeTab.manageableByPlayerIds.includes('all_players')) return true;

    return false;
  }, [activeTab, isGM, state.activePlayerId, poolData]);

  const canEditTab = useMemo(() => {
    if (!activeTab || !poolData) return false;
    if (isGM) return true;

    if (activeTab.editableByPlayerIds.includes(state.activePlayerId)) return true;
    if (activeTab.editableByPlayerIds.includes('all_players')) return true;

    return false;
  }, [activeTab, isGM, state.activePlayerId, poolData]);

  // Handler: Select tab
  const handleSelectTab = useCallback((tabId: string) => {
    if (!poolData) return;

    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: panel.id,
        poolData: {
          ...poolData,
          activeTabId: tabId
        }
      }
    });
  }, [poolData, panel.id, dispatch]);

  // Handler: Add new tab (GM only)
  const handleAddTab = useCallback(() => {
    if (!poolData || !isGM) return;

    // Get existing pool territories to find available space
    const existingPools = Object.values(state.objects)
      .filter(obj => obj.type === ItemType.PANEL && (obj as PanelObject).poolData)
      .flatMap(obj => {
        const poolPanel = obj as PanelObject;
        const poolData = poolPanel.poolData!;
        // Each tab has its own territory now
        return poolData.tabs.map(tab => ({
          id: tab.id,
          x: tab.offsetX || 0,
          y: tab.offsetY || 0,
          width: 1000, // Fixed pool size
          height: 1000
        }));
      });

    // Find available territory outside playable area (5000×5000)
    const territory = findAvailableTerritory(existingPools);

    if (!territory) {
      console.warn('No available territory for new pool tab');
      return;
    }

    const newTab: PanelTab = {
      id: `tab-${Date.now()}`,
      name: `Pool ${poolData.tabs.length + 1}`,
      visibleToPlayerIds: [],
      manageableByPlayerIds: [],
      editableByPlayerIds: [],
      zoom: 1.02,
      offsetX: territory.x,
      offsetY: territory.y,
      territoryId: `territory-${panel.id}-tab-${Date.now()}`
    };

    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: panel.id,
        poolData: {
          ...poolData,
          tabs: [...poolData.tabs, newTab],
          activeTabId: newTab.id
        }
      }
    });
  }, [poolData, isGM, panel.id, dispatch, state.objects]);

  // Handler: Remove tab (GM only)
  const handleRemoveTab = useCallback((tabId: string) => {
    if (!poolData || !isGM) return;

    if (poolData.tabs.length <= 1) return; // Don't allow removing the last tab

    const newTabs = poolData.tabs.filter((t: PanelTab) => t.id !== tabId);
    const newActiveId = poolData.activeTabId === tabId
      ? newTabs[0].id
      : poolData.activeTabId;

    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: panel.id,
        poolData: {
          ...poolData,
          tabs: newTabs,
          activeTabId: newActiveId
        }
      }
    });
  }, [poolData, isGM, panel.id, dispatch]);

  // Handler: Drop objects from cursor slot to pool
  const handleDropFromCursorSlot = useCallback((x: number, y: number) => {
    // This is now handled by PoolTabletop directly
    // Objects are just placed in the pool zone coordinates
  }, []);

  if (!poolData) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-800">
        <p className="text-slate-400 text-sm">Loading pool...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-800 w-full">
      {/* Tab Bar */}
      <div className="flex flex-wrap gap-0.5 px-2 pt-1 pb-0.5 border-b border-slate-700">
        {poolData.tabs.map((tab: PanelTab) => {
          const isActive = tab.id === poolData.activeTabId;

          return (
            <button
              key={tab.id}
              onClick={() => handleSelectTab(tab.id)}
              onContextMenu={(e) => handleOpenTabSettings(tab.id, e)}
              className={`px-3 py-1.5 text-xs font-medium rounded-t transition-colors relative flex items-center gap-1 ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              <span className="flex items-center gap-1">
                {tab.name}
              </span>
              {isGM && poolData.tabs.length > 1 && (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveTab(tab.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation();
                      e.preventDefault();
                      handleRemoveTab(tab.id);
                    }
                  }}
                  className="ml-1 text-slate-400 hover:text-red-400 transition-colors cursor-pointer"
                  title="Remove tab"
                >
                  <Trash2 size={10} />
                </div>
              )}
            </button>
          );
        })}

        {/* Add Tab Button (GM only) */}
        {isGM && (
          <button
            onClick={handleAddTab}
            className="px-2 py-1 text-xs font-medium rounded-t bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
            title="Add new tab"
          >
            <Plus size={14} />
          </button>
        )}
      </div>

      {/* Pool Content */}
      {canViewTab && activeTab ? (
        <div
          className="flex-1 relative"
          style={{ backgroundColor: '#304458' }}
          data-pool-content={panel.id}
          onMouseEnter={(e) => {
            // Check if hovering over the panel itself, not over scrollbar
            const target = e.target as HTMLElement;
            const isScrollbar = target.classList.contains('overflow-auto') ||
                               target.tagName === 'HTML' ||
                               target.tagName === 'BODY';

            if (!isScrollbar && cursorSlotHasCards) {
              setIsPanelHovered(true);
            }
          }}
          onMouseLeave={(e) => {
            // Only clear highlight if leaving the panel entirely
            const target = e.target as HTMLElement;
            const relatedTarget = e.relatedTarget as HTMLElement;

            // Check if actually leaving the panel (not just moving to scrollbar)
            const currentPanel = (e.currentTarget as HTMLElement);
            const isLeavingPanel = !currentPanel.contains(relatedTarget);

            if (isLeavingPanel) {
              setIsPanelHovered(false);
            }
          }}
        >
          {/* Purple highlight overlay when hovering with cards */}
          {showPanelHighlight && (
            <div className="absolute inset-0 pointer-events-none border-4 border-purple-500 border-opacity-75 z-50" />
          )}

          <div className="absolute inset-0 overflow-auto">
            <PoolTabletop
              poolZone={{
                offsetX: activeTab.offsetX,
                offsetY: activeTab.offsetY,
                width: 1000,
                height: 1000,
                panelId: panel.id,
                tabId: activeTab.id
              }}
              zoom={activeTab?.zoom || 1.02}
            />
          </div>
        </div>
      ) : (
        /* Access Denied */
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-slate-400">
            <Lock size={32} className="mx-auto mb-2" />
            <p>You don't have permission to view this tab</p>
          </div>
        </div>
      )}

      {/* Tab Settings Modal */}
      {settingsModal && (
        <div className="absolute inset-0 bg-slate-800 z-10 flex flex-col">
          {/* Settings Header - Fixed at top */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 flex-shrink-0">
            <h2 className="text-lg font-semibold text-white">Tab Settings</h2>
            <button
              onClick={() => setSettingsModal(null)}
              className="p-1 text-slate-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Settings Content - Takes available space */}
          <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
            <PoolTabSettingsModal
              tab={settingsModal.tab}
              players={state.players}
              activePlayerId={state.activePlayerId}
              isGM={isGM}
              onSave={handleSaveTabSettings}
              onTabChange={setTempSettingsTab}
            />
          </div>

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
                  // Save the current settings before closing
                  if (tempSettingsTab) {
                    handleSaveTabSettings(tempSettingsTab);
                  }
                  setSettingsModal(null);
                  setTempSettingsTab(null);
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
});
