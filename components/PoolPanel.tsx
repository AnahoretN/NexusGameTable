import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useGame } from '../store/GameContext';
import { PanelObject, PoolPanelData, PanelTab, AppLanguage } from '../types';
import { Plus, Trash2, Lock } from 'lucide-react';
import { PoolGameSpace } from './PoolGameSpace';

interface PoolPanelProps {
  panel: PanelObject;
  language?: AppLanguage;
}

export const PoolPanel: React.FC<PoolPanelProps> = ({
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
      const defaultPoolData: PoolPanelData = {
        tabs: [
          {
            id: 'tab-default',
            name: 'Pool 1',
            visibleToPlayerIds: ['all_players'],
            manageableByPlayerIds: ['gm'],
            editableByPlayerIds: ['gm']
          }
        ],
        activeTabId: 'tab-default',
        offsetX: 0,
        offsetY: 0,
        tabObjects: {
          'tab-default': []
        }
      };

      dispatch({
        type: 'UPDATE_OBJECT',
        payload: {
          id: panel.id,
          poolData: defaultPoolData
        }
      });
    }
  }, [poolData, panel.id, dispatch]);

  // Get current player info
  const currentPlayer = state.players.find(p => p.id === state.activePlayerId);
  const isGM = currentPlayer?.isGM ?? false;

  // Active tab
  const activeTab = useMemo(() => {
    if (!poolData) return null;
    return poolData.tabs.find((t: PanelTab) => t.id === poolData.activeTabId) || null;
  }, [poolData]);

  // Check permissions for active tab
  const canViewTab = useMemo(() => {
    if (!activeTab || !poolData) return false;
    if (isGM) return true;

    // Check if player is in visible list
    if (activeTab.visibleToPlayerIds.includes(state.activePlayerId)) return true;
    if (activeTab.visibleToPlayerIds.includes('all_players')) return true;
    if (activeTab.visibleToPlayerIds.includes('gm') && isGM) return true;

    return false;
  }, [activeTab, isGM, state.activePlayerId, poolData]);

  const canManageTab = useMemo(() => {
    if (!activeTab || !poolData) return false;
    if (isGM) return true;

    if (activeTab.manageableByPlayerIds.includes(state.activePlayerId)) return true;
    if (activeTab.manageableByPlayerIds.includes('all_players')) return true;
    if (activeTab.manageableByPlayerIds.includes('gm') && isGM) return true;

    return false;
  }, [activeTab, isGM, state.activePlayerId, poolData]);

  const canEditTab = useMemo(() => {
    if (!activeTab || !poolData) return false;
    if (isGM) return true;

    if (activeTab.editableByPlayerIds.includes(state.activePlayerId)) return true;
    if (activeTab.editableByPlayerIds.includes('all_players')) return true;
    if (activeTab.editableByPlayerIds.includes('gm') && isGM) return true;

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

    const newTab: PanelTab = {
      id: `tab-${Date.now()}`,
      name: `Pool ${poolData.tabs.length + 1}`,
      visibleToPlayerIds: ['all_players'],
      manageableByPlayerIds: ['gm'],
      editableByPlayerIds: ['gm']
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
  }, [poolData, isGM, panel.id, dispatch]);

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
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveTab(tab.id);
                  }}
                  className="ml-1 text-slate-400 hover:text-red-400 transition-colors"
                  title="Remove tab"
                >
                  <Trash2 size={10} />
                </button>
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
          className="flex-1 relative bg-slate-800"
          onMouseDown={(e) => {
            console.log('PoolPanel content div onMouseDown:', {
              shiftKey: e.shiftKey,
              ctrlKey: e.ctrlKey,
              metaKey: e.metaKey,
              button: e.button,
              target: e.target
            });
          }}
        >
          <PoolGameSpace
            panelId={panel.id}
            offsetX={poolData.offsetX}
            offsetY={poolData.offsetY}
            width={1000}
            height={1000}
          />
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
    </div>
  );
};
