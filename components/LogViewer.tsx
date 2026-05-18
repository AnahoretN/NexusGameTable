import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, Search, Filter, RotateCcw, RotateCw, Clock, User, ChevronDown } from 'lucide-react';
import { useGame } from '../store/GameContext';
import { useActivePlayerId, usePlayerList, useIsGM, useLanguage } from '../store/contexts';
import { AuditLogEntry, AuditActionType, ItemType, AppLanguage } from '../types';
import { t as translate, Locale } from '../utils/translations';
import { filterAuditLog } from '../store/auditLogger';

interface LogViewerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Filters {
  actionTypes: AuditActionType[];
  playerIds: string[];
  startTime: number | null;
  endTime: number | null;
}

const ACTION_TYPE_LABELS: Record<AuditActionType, string> = {
  [AuditActionType.OBJECT_CREATED]: 'Created',
  [AuditActionType.OBJECT_DELETED]: 'Deleted',
  [AuditActionType.OBJECT_MOVED]: 'Moved',
  [AuditActionType.OBJECT_UPDATED]: 'Updated',
  [AuditActionType.OBJECT_RESIZED]: 'Resized',
  [AuditActionType.OBJECT_ROTATED]: 'Rotated',
  [AuditActionType.OBJECT_LOCKED]: 'Lock Toggled',
  [AuditActionType.OBJECT_HIDDEN]: 'Visibility Toggled',
  [AuditActionType.OBJECT_LAYER_CHANGED]: 'Layer',
  [AuditActionType.CARD_DRAWN]: 'Card Drawn',
  [AuditActionType.CARD_PLAYED]: 'Card Played',
  [AuditActionType.CARD_FLIPPED]: 'Card Flipped',
  [AuditActionType.DECK_SHUFFLED]: 'Deck Shuffled',
  [AuditActionType.STROKE_ADDED]: 'Drawing',
  [AuditActionType.PLAYER_JOINED]: 'Player Joined',
  [AuditActionType.PLAYER_LEFT]: 'Player Left',
  [AuditActionType.SETTINGS_CHANGED]: 'Settings Changed',
};

const FilterPanel: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  availableActionTypes: AuditActionType[];
  availablePlayers: Array<{ id: string; name: string }>;
  language: AppLanguage;
}> = ({ isOpen, onClose, filters, onFiltersChange, availableActionTypes, availablePlayers, language }) => {
  if (!isOpen) return null;

  const toggleActionType = (type: AuditActionType) => {
    const newTypes = filters.actionTypes.includes(type)
      ? filters.actionTypes.filter(t => t !== type)
      : [...filters.actionTypes, type];
    onFiltersChange({ ...filters, actionTypes: newTypes });
  };

  const togglePlayerId = (id: string) => {
    const newIds = filters.playerIds.includes(id)
      ? filters.playerIds.filter(pid => pid !== id)
      : [...filters.playerIds, id];
    onFiltersChange({ ...filters, playerIds: newIds });
  };

  const clearAll = () => {
    onFiltersChange({ actionTypes: [], playerIds: [], startTime: null, endTime: null });
  };

  return createPortal(
    <div className="fixed inset-0 z-[10003] flex items-center justify-center bg-black/50" onContextMenu={(e) => e.preventDefault()}>
      <div className="bg-slate-900 border border-slate-600 rounded-lg shadow-2xl w-[400px] max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <h3 className="text-lg font-bold text-white">{translate('Filters', language as Locale)}</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Action Types */}
          <div>
            <h4 className="text-sm font-semibold text-gray-300 mb-2">{translate('Action Types', language as Locale)}</h4>
            <div className="flex flex-wrap gap-2">
              {availableActionTypes.map(type => (
                <button
                  key={type}
                  onClick={() => toggleActionType(type)}
                  className={`text-xs px-2 py-1 rounded transition-colors ${
                    filters.actionTypes.includes(type)
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                  }`}
                >
                  {ACTION_TYPE_LABELS[type] || type}
                </button>
              ))}
            </div>
          </div>

          {/* Players */}
          <div>
            <h4 className="text-sm font-semibold text-gray-300 mb-2">{translate('Players', language as Locale)}</h4>
            <div className="flex flex-wrap gap-2">
              {availablePlayers.map(player => (
                <button
                  key={player.id}
                  onClick={() => togglePlayerId(player.id)}
                  className={`text-xs px-2 py-1 rounded transition-colors ${
                    filters.playerIds.includes(player.id)
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                  }`}
                >
                  {player.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-slate-700 flex justify-between">
          <button
            onClick={clearAll}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors"
          >
            {translate('Clear All', language as Locale)}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors"
          >
            {translate('Apply', language as Locale)}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export const LogViewer: React.FC<LogViewerProps> = ({ isOpen, onClose }) => {
  const { state, dispatch } = useGame();
  const activePlayerId = useActivePlayerId();
  const players = usePlayerList();
  const isGM = useIsGM();
  const language = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<Filters>({ actionTypes: [], playerIds: [], startTime: null, endTime: null });
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [showAdvancedControls, setShowAdvancedControls] = useState(false);

  // R key press detection for GM to show advanced controls
  const rPressTimesRef = useRef<number[]>([]);

  useEffect(() => {
    if (!isOpen || !isGM) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') {
        const now = Date.now();
        // Remove presses older than 2 seconds
        rPressTimesRef.current = rPressTimesRef.current.filter(t => now - t < 2000);
        // Add current press
        rPressTimesRef.current.push(now);
        // Check if we have 3 presses within 2 seconds
        if (rPressTimesRef.current.length >= 3) {
          setShowAdvancedControls(true);
          rPressTimesRef.current = []; // Reset after triggering
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isGM]);

  // Reset advanced controls when log viewer closes
  useEffect(() => {
    if (!isOpen) {
      setShowAdvancedControls(false);
      rPressTimesRef.current = [];
    }
  }, [isOpen]);

  // Get audit log entries safely (handle case where auditLog is undefined from old saves)
  const auditLogEntries = state.auditLog?.entries || [];

  // Filter entries
  const filteredEntries = useMemo(() => {
    return filterAuditLog(auditLogEntries, {
      actionTypes: filters.actionTypes.length > 0 ? filters.actionTypes : undefined,
      playerIds: filters.playerIds.length > 0 ? filters.playerIds : undefined,
      searchQuery: searchQuery || undefined,
    });
  }, [auditLogEntries, filters, searchQuery]);

  // Get unique action types and players for filters
  const uniqueActionTypes = useMemo(() => {
    const types = new Set<AuditActionType>();
    auditLogEntries.forEach(entry => types.add(entry.actionType));
    return Array.from(types);
  }, [auditLogEntries]);

  const uniquePlayerIds = useMemo(() => {
    const playerMap = new Map<string, string>();
    auditLogEntries.forEach(entry => {
      if (!playerMap.has(entry.playerId)) {
        playerMap.set(entry.playerId, entry.playerName);
      }
    });
    return Array.from(playerMap.entries()).map(([id, name]) => ({ id, name }));
  }, [auditLogEntries]);

  // Export functions
  const handleExportText = useCallback(() => {
    const text = filteredEntries.map(entry => {
      const date = new Date(entry.timestamp).toLocaleString();
      const player = entry.playerName + (entry.isGM ? ' (GM)' : '');
      return `[${date}] ${player}: ${entry.details.description || entry.actionType}`;
    }).join('\n');

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `session-log-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredEntries]);

  const handleExportJSON = useCallback(() => {
    const json = JSON.stringify(filteredEntries, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `session-log-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredEntries]);

  // Undo/Redo using existing undo system
  const handleUndo = useCallback(() => {
    if (!isGM) return;
    dispatch({ type: 'UNDO_GENERAL' } as any);
  }, [dispatch, isGM]);

  const handleRedo = useCallback(() => {
    // Redo would require implementing forward redo in the undo system
    // For now, this is a placeholder
  }, [language]);

  // Restore to point - undo all actions after this point
  const handleRestoreToPoint = useCallback((entryId: string) => {
    if (!isGM) return;
    const index = auditLogEntries.findIndex(e => e.id === entryId);
    if (index === -1) return;

    const currentIndex = auditLogEntries.length - 1;
    const undoCount = currentIndex - index;

    if (undoCount <= 0) return;

    if (confirm(`${translate('Restore session to this point?', language as Locale)}\n${translate('This will undo', language as Locale)} ${undoCount} ${translate('actions.', language as Locale)}`)) {
      // Undo multiple times to reach the target point
      for (let i = 0; i < undoCount; i++) {
        dispatch({ type: 'UNDO_GENERAL' } as any);
      }
    }
  }, [dispatch, isGM, auditLogEntries, language]);

  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const hasActiveFilters = filters.actionTypes.length > 0 || filters.playerIds.length > 0 || searchQuery;

  return createPortal(
    <div className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/50" onContextMenu={(e) => e.preventDefault()}>
      <FilterPanel
        isOpen={showFilterPanel}
        onClose={() => setShowFilterPanel(false)}
        filters={filters}
        onFiltersChange={setFilters}
        availableActionTypes={uniqueActionTypes}
        availablePlayers={uniquePlayerIds}
        language={language}
      />

      <div
        ref={containerRef}
        className="bg-slate-900 border border-slate-600 rounded-lg shadow-2xl w-[90vw] h-[80vh] flex flex-col"
        data-scrollable="true"
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Clock size={20} />
            {translate('Session Log', language as Locale)}
            <span className="text-sm font-normal text-gray-400">
              ({filteredEntries.length} {translate('entries', language as Locale)})
            </span>
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-700 bg-slate-800">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder={translate('Search actions...', language as Locale)}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500"
            />
          </div>
          <button
            onClick={() => setShowFilterPanel(true)}
            className={`p-2 rounded-lg transition-colors ${
              hasActiveFilters ? 'bg-purple-600 text-white' : 'bg-slate-700 text-gray-400 hover:text-white hover:bg-slate-600'
            }`}
            title={translate('Filters', language as Locale)}
          >
            <Filter size={16} />
          </button>
          <div className="w-px h-6 bg-slate-600" />
          <button
            onClick={handleExportText}
            className="p-2 bg-slate-700 hover:bg-slate-600 text-gray-400 hover:text-white rounded-lg transition-colors"
            title={translate('Export as Text', language as Locale)}
          >
            <Download size={16} />
          </button>
          <button
            onClick={handleExportJSON}
            className="p-2 bg-slate-700 hover:bg-slate-600 text-gray-400 hover:text-white rounded-lg transition-colors"
            title={translate('Export as JSON', language as Locale)}
          >
            <Download size={16} />
          </button>
          {isGM && showAdvancedControls && (
            <>
              <div className="w-px h-6 bg-slate-600" />
              <button
                onClick={handleUndo}
                className="p-2 bg-slate-700 hover:bg-slate-600 text-gray-400 hover:text-white rounded-lg transition-colors"
                title={translate('Undo', language as Locale)}
              >
                <RotateCcw size={16} />
              </button>
              <button
                onClick={handleRedo}
                className="p-2 bg-slate-700 hover:bg-slate-600 text-gray-400 hover:text-white rounded-lg transition-colors"
                title={translate('Redo', language as Locale)}
              >
                <RotateCw size={16} />
              </button>
            </>
          )}
        </div>

        {/* Filter tags */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-700 flex-wrap">
            {filters.actionTypes.map(type => (
              <span
                key={type}
                className="text-xs px-2 py-1 bg-purple-900 text-purple-200 rounded flex items-center gap-1"
              >
                {ACTION_TYPE_LABELS[type] || type}
                <button onClick={() => setFilters({ ...filters, actionTypes: filters.actionTypes.filter(t => t !== type) })}>
                  <X size={12} />
                </button>
              </span>
            ))}
            {filters.playerIds.map(pid => {
              const player = uniquePlayerIds.find(p => p.id === pid);
              return (
                <span
                  key={pid}
                  className="text-xs px-2 py-1 bg-blue-900 text-blue-200 rounded flex items-center gap-1"
                >
                  <User size={12} />
                  {player?.name || pid}
                  <button onClick={() => setFilters({ ...filters, playerIds: filters.playerIds.filter(id => id !== pid) })}>
                    <X size={12} />
                  </button>
                </span>
              );
            })}
            {searchQuery && (
              <span className="text-xs px-2 py-1 bg-green-900 text-green-200 rounded flex items-center gap-1">
                "{searchQuery}"
                <button onClick={() => setSearchQuery('')}>
                  <X size={12} />
                </button>
              </span>
            )}
            <button
              onClick={() => {
                setFilters({ actionTypes: [], playerIds: [], startTime: null, endTime: null });
                setSearchQuery('');
              }}
              className="text-xs text-gray-400 hover:text-white underline"
            >
              {translate('Clear all', language as Locale)}
            </button>
          </div>
        )}

        {/* Entry list */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {filteredEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-2">
              <Clock size={48} className="opacity-50" />
              <p>{translate('No entries found', language as Locale)}</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-700">
              {filteredEntries.map((entry, idx) => {
                const date = new Date(entry.timestamp);
                const isSelected = selectedEntryId === entry.id;

                return (
                  <div
                    key={entry.id}
                    className={`p-3 cursor-pointer hover:bg-slate-800 transition-colors ${
                      isSelected ? 'bg-purple-900/20 border-l-4 border-l-purple-500' : ''
                    }`}
                    onClick={() => setSelectedEntryId(entry.id)}
                  >
                    <div className="flex items-start gap-3">
                      <Clock size={16} className="text-gray-500 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`text-xs px-2 py-0.5 rounded flex items-center gap-1 ${
                            entry.isGM ? 'bg-purple-900 text-purple-200' : 'bg-slate-700 text-gray-300'
                          }`}>
                            <User size={12} />
                            {entry.playerName}
                          </span>
                          <span className="text-xs text-gray-500">
                            {date.toLocaleTimeString()}
                          </span>
                          {entry.tags && entry.tags.length > 0 ? (
                            // Multiple tags
                            <div className="flex gap-1 flex-wrap">
                              <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-gray-400">
                                {ACTION_TYPE_LABELS[entry.actionType] || entry.actionType}
                              </span>
                              {entry.tags.map(tag => (
                                <span key={tag} className="text-xs px-2 py-0.5 rounded bg-purple-900 text-purple-300">
                                  {ACTION_TYPE_LABELS[tag] || tag}
                                </span>
                              ))}
                            </div>
                          ) : (
                            // Single tag
                            <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-gray-400">
                              {ACTION_TYPE_LABELS[entry.actionType] || entry.actionType}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-300 break-words">
                          {entry.details.description || entry.actionType}
                        </p>
                        {entry.details.objectName && (
                          <p className="text-xs text-gray-500 mt-1">
                            {entry.details.objectType}: {entry.details.objectName}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer with restore button */}
        {isGM && showAdvancedControls && selectedEntryId && (
          <div className="px-4 py-3 border-t border-slate-700 bg-slate-800">
            <button
              onClick={() => handleRestoreToPoint(selectedEntryId)}
              className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <RotateCcw size={16} />
              {translate('Restore to this point', language as Locale)}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default LogViewer;
