import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useGame } from '../store/GameContext';
import { PanelObject, TableauPanelData, PanelTab, AppLanguage } from '../types';
import { Plus, Trash2, Lock } from 'lucide-react';

interface TableauPanelProps {
  panel: PanelObject;
  language?: AppLanguage;
}

export const TableauPanel: React.FC<TableauPanelProps> = ({
  panel,
  language = 'en'
}) => {
  const { state, dispatch } = useGame();
  const containerRef = useRef<HTMLDivElement>(null);

  // Get tableau data from panel - use latest from state to ensure reactivity
  const panelObject = state.objects[panel.id] as PanelObject | undefined;
  const tableauData = panelObject?.tableauData || panel.tableauData;

  // Initialize tableau data if not exists
  useEffect(() => {
    if (!tableauData) {
      const defaultTableauData: TableauPanelData = {
        tabs: [
          {
            id: 'tab-default',
            name: 'Tableau 1',
            visibleToPlayerIds: ['all_players'],
            manageableByPlayerIds: ['gm'],
            editableByPlayerIds: ['gm']
          }
        ],
        activeTabId: 'tab-default',
        tabObjects: {
          'tab-default': []
        }
      };

      dispatch({
        type: 'UPDATE_OBJECT',
        payload: {
          id: panel.id,
          tableauData: defaultTableauData
        }
      });
    }
  }, [tableauData, panel.id, dispatch]);

  // Get current player info
  const currentPlayer = state.players.find(p => p.id === state.activePlayerId);
  const isGM = currentPlayer?.isGM ?? false;

  // Active tab
  const activeTab = useMemo(() => {
    if (!tableauData) return null;
    return tableauData.tabs.find((t: PanelTab) => t.id === tableauData.activeTabId) || null;
  }, [tableauData]);

  // Check permissions for active tab
  const canViewTab = useMemo(() => {
    if (!activeTab || !tableauData) return false;
    if (isGM) return true;

    // Check if player is in visible list
    if (activeTab.visibleToPlayerIds.includes(state.activePlayerId)) return true;
    if (activeTab.visibleToPlayerIds.includes('all_players')) return true;
    if (activeTab.visibleToPlayerIds.includes('gm') && isGM) return true;

    return false;
  }, [activeTab, isGM, state.activePlayerId, tableauData]);

  const canManageTab = useMemo(() => {
    if (!activeTab || !tableauData) return false;
    if (isGM) return true;

    if (activeTab.manageableByPlayerIds.includes(state.activePlayerId)) return true;
    if (activeTab.manageableByPlayerIds.includes('all_players')) return true;
    if (activeTab.manageableByPlayerIds.includes('gm') && isGM) return true;

    return false;
  }, [activeTab, isGM, state.activePlayerId, tableauData]);

  const canEditTab = useMemo(() => {
    if (!activeTab || !tableauData) return false;
    if (isGM) return true;

    if (activeTab.editableByPlayerIds.includes(state.activePlayerId)) return true;
    if (activeTab.editableByPlayerIds.includes('all_players')) return true;
    if (activeTab.editableByPlayerIds.includes('gm') && isGM) return true;

    return false;
  }, [activeTab, isGM, state.activePlayerId, tableauData]);

  // Handler: Select tab
  const handleSelectTab = useCallback((tabId: string) => {
    if (!tableauData) return;

    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: panel.id,
        tableauData: {
          ...tableauData,
          activeTabId: tabId
        }
      }
    });
  }, [tableauData, panel.id, dispatch]);

  // Handler: Add new tab (GM only)
  const handleAddTab = useCallback(() => {
    if (!tableauData || !isGM) return;

    const newTab: PanelTab = {
      id: `tab-${Date.now()}`,
      name: `Tableau ${tableauData.tabs.length + 1}`,
      visibleToPlayerIds: ['all_players'],
      manageableByPlayerIds: ['gm'],
      editableByPlayerIds: ['gm']
    };

    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: panel.id,
        tableauData: {
          ...tableauData,
          tabs: [...tableauData.tabs, newTab],
          tabObjects: {
            ...tableauData.tabObjects,
            [newTab.id]: []
          },
          activeTabId: newTab.id
        }
      }
    });
  }, [tableauData, isGM, panel.id, dispatch]);

  // Handler: Remove tab (GM only)
  const handleRemoveTab = useCallback((tabId: string) => {
    if (!tableauData || !isGM) return;

    if (tableauData.tabs.length <= 1) return; // Don't allow removing the last tab

    const newTabs = tableauData.tabs.filter(t => t.id !== tabId);
    const newTabObjects = { ...tableauData.tabObjects };
    delete newTabObjects[tabId];

    const newActiveId = tableauData.activeTabId === tabId
      ? newTabs[0].id
      : tableauData.activeTabId;

    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: panel.id,
        tableauData: {
          ...tableauData,
          tabs: newTabs,
          tabObjects: newTabObjects,
          activeTabId: newActiveId
        }
      }
    });
  }, [tableauData, isGM, panel.id, dispatch]);

  if (!tableauData) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-800">
        <p className="text-slate-400 text-sm">Loading tableau...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-800 w-full">
      {/* Tab Bar */}
      <div className="flex flex-wrap gap-0.5 px-2 pt-1 pb-0.5 border-b border-slate-700">
        {tableauData.tabs.map((tab: PanelTab) => {
          const isActive = tab.id === tableauData.activeTabId;

          return (
            <button
              key={tab.id}
              onClick={() => handleSelectTab(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-t transition-colors relative flex items-center gap-1 ${
                isActive
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              <span className="flex items-center gap-1">
                {tab.name}
              </span>
              {isGM && tableauData.tabs.length > 1 && (
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

      {/* Tableau Content */}
      {canViewTab && activeTab ? (
        <div className="flex-1 relative overflow-hidden bg-slate-900">
          {/* Tableau space - same as main game table */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-slate-400">
              <p className="text-lg font-semibold mb-2">{activeTab.name}</p>
              <p className="text-sm">Tableau Space (same as main table)</p>
              <p className="text-xs mt-2 text-slate-500">Objects can be dragged here from the main table</p>
            </div>
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
    </div>
  );
};
