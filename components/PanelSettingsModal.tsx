import { t as translate, Locale } from '../utils/translations';
import React from 'react';
import { createPortal } from 'react-dom';
import { PanelObject, PanelType, AppLanguage } from '../types';
import { useGame } from '../store/GameContext';
import { Settings, Maximize2, Check } from 'lucide-react';

type PanelSettingsTab = 'general';

interface PanelSettingsModalProps {
  panel: PanelObject;
  onClose: () => void;
  language?: AppLanguage;
}

/**
 * Modal for editing panel settings (position, size, rotation, etc.)
 * Used in both UIObjectRenderer and MainMenuContent
 *
 * Each player has their own individual panel settings that are stored on the host.
 * When a player opens this modal, they see and modify their own settings only.
 */
export const PanelSettingsModal: React.FC<PanelSettingsModalProps> = ({ panel, onClose, language = 'en' }) => {
  const { dispatch, state, isHost } = useGame();

  const [activeTab, setActiveTab] = React.useState<PanelSettingsTab>('general');
  const [title, setTitle] = React.useState(panel.title);
  const [x, setX] = React.useState(panel.x);
  const [y, setY] = React.useState(panel.y);
  const [width, setWidth] = React.useState(panel.width);
  const [height, setHeight] = React.useState(panel.height);
  const [dualPosition, setDualPosition] = React.useState(panel.dualPosition || false);
  const [zIndex, setZIndex] = React.useState(panel.zIndex || 1000);

  // Sync values with current panel state (in case panel was resized while modal is open)
  React.useEffect(() => {
    setTitle(panel.title);
    setX(panel.x);
    setY(panel.y);
    setWidth(panel.width);
    setHeight(panel.height);
    setDualPosition(panel.dualPosition || false);
    setZIndex(panel.zIndex || 1000);
  }, [panel.title, panel.x, panel.y, panel.width, panel.height, panel.dualPosition, panel.zIndex]);

  const handleSave = () => {
    const currentPlayerId = state.activePlayerId;

    // Update individual panel settings for this player (stored on host)
    if (isHost) {
      // Host updates directly
      dispatch({
        type: 'UPDATE_PLAYER_PANEL_SETTINGS',
        payload: {
          playerId: currentPlayerId,
          panelId: panel.id,
          settings: {
            x: Math.round(x),
            y: Math.round(y),
            width: Math.round(width),
            height: Math.round(height),
            minimized: panel.minimized || false,
            isPinnedToViewport: panel.isPinnedToViewport || false,
            pinnedScreenPosition: panel.pinnedScreenPosition,
            expandedState: panel.expandedState,
            collapsedState: panel.collapsedState,
            expandedPinnedPosition: panel.expandedPinnedPosition,
            collapsedPinnedPosition: panel.collapsedPinnedPosition,
          }
        }
      });
    } else {
      // Guest sends request to host to update their settings
      // This will be synced via the peer connection
      dispatch({
        type: 'UPDATE_PLAYER_PANEL_SETTINGS',
        payload: {
          playerId: currentPlayerId,
          panelId: panel.id,
          settings: {
            x: Math.round(x),
            y: Math.round(y),
            width: Math.round(width),
            height: Math.round(height),
            minimized: panel.minimized || false,
            isPinnedToViewport: panel.isPinnedToViewport || false,
            pinnedScreenPosition: panel.pinnedScreenPosition,
            expandedState: panel.expandedState,
            collapsedState: panel.collapsedState,
            expandedPinnedPosition: panel.expandedPinnedPosition,
            collapsedPinnedPosition: panel.collapsedPinnedPosition,
          }
        }
      });
    }

    // Also update local panel for immediate visual feedback
    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: panel.id,
        title,
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(width),
        height: Math.round(height),
        dualPosition,
        zIndex
      },
      _localOnly: true // Don't sync this to other players
    });

    onClose();
  };

  const modalContent = (
    <div className="fixed inset-0 z-[100005] flex items-center justify-center bg-black/40">
      <div className="bg-slate-800 rounded-lg shadow-xl w-[575px] border border-slate-600 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex justify-center items-center py-2 px-4">
          <h3 className="text-base font-bold text-white">{translate('Settings', language as Locale)}: {panel.title}</h3>
        </div>

        {/* Tabs */}
        <div className="flex">
          <button
            onClick={() => setActiveTab('general')}
            className={`flex-1 py-3 px-3 flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
              activeTab === 'general'
                ? 'bg-slate-700 text-white border-b-2 border-purple-500'
                : 'text-gray-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <Settings size={16} /> {translate('General', language as Locale)}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
          <div className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Name', language as Locale)}</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
              />
            </div>

            {/* Position */}
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1">{translate('X Position', language as Locale)}</label>
                  <input
                    type="number"
                    value={Math.round(x)}
                    onChange={e => setX(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Y Position', language as Locale)}</label>
                  <input
                    type="number"
                    value={Math.round(y)}
                    onChange={e => setY(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                  />
                </div>
              </div>
            </div>

          {/* Size */}
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Width', language as Locale)}</label>
                <input
                  type="number"
                  value={width}
                  onChange={e => setWidth(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Height', language as Locale)}</label>
                <input
                  type="number"
                  value={height}
                  onChange={e => setHeight(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                />
              </div>
            </div>
          </div>

          {/* Z-Index */}
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">{translate('Z-Index (layer order)', language as Locale)}</label>
              <input
                type="number"
                value={zIndex}
                onChange={e => setZIndex(Number(e.target.value))}
                min={1}
                max={10000}
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
              />
            </div>
          </div>

          {/* Dual Position Toggle */}
          <div className="space-y-2">
            <div className="flex items-center justify-between bg-slate-900 rounded px-3 py-2 border border-slate-700">
              <label className="text-xs text-gray-300 flex items-center gap-2">
                <Maximize2 size={12} />
                {translate('Dual Position Mode', language as Locale)}
              </label>
              <button
                onClick={() => setDualPosition(!dualPosition)}
                className={`w-10 h-5 rounded-full transition-colors ${
                  dualPosition ? 'bg-green-600' : 'bg-slate-700'
                }`}
              >
                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                  dualPosition ? 'translate-x-5' : 'translate-x-0.5'
                }`} />
              </button>
            </div>
            <p className="text-[10px] text-gray-500">
              {translate('When enabled, panel remembers separate positions for collapsed and expanded states', language as Locale)}
            </p>
          </div>
          </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-300 hover:bg-slate-700 rounded"
          >
            {translate('Cancel', language as Locale)}
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-500 text-white rounded flex items-center gap-2"
          >
            <Check size={16} /> {translate('Save Changes', language as Locale)}
          </button>
        </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
