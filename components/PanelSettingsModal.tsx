import { t as translate, Locale } from '../utils/translations';
import React from 'react';
import { createPortal } from 'react-dom';
import { PanelObject, PanelType, AppLanguage } from '../types';
import { useGame } from '../store/GameContext';
import { useActivePlayerId } from '../store/contexts';
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
  const { dispatch, isHost, state } = useGame();
  const activePlayerId = useActivePlayerId();
  const pixelsPerVU = state.viewTransform?.pixelsPerVU || 1;

  const [activeTab, setActiveTab] = React.useState<PanelSettingsTab>('general');
  const [title, setTitle] = React.useState(panel.title);
  const [x, setX] = React.useState(panel.x);
  const [y, setY] = React.useState(panel.y);
  const [width, setWidth] = React.useState(panel.width);
  const [height, setHeight] = React.useState(panel.height);
  const [dualPosition, setDualPosition] = React.useState(panel.dualPosition || false);
  const [zIndex, setZIndex] = React.useState(panel.zIndex || 1000);

  // Constraints in VU
  const WORLD_SIZE = 10000; // Game world size in VU
  const MIN_PANEL_SIZE = 200; // Minimum panel size in pixels (converted to VU)

  // Convert VU to pixels for display
  const vuToPx = (vu: number) => vu * pixelsPerVU;
  // Convert pixels to VU for storage
  const pxToVu = (px: number) => px / pixelsPerVU;

  // Get bounds in VU
  const getMaxWidthVU = React.useCallback(() => pxToVu(window.innerWidth - 40), [pixelsPerVU]);
  const getMaxHeightVU = React.useCallback(() => pxToVu(window.innerHeight - 80), [pixelsPerVU]);

  const clampPosition = React.useCallback((posX: number, posY: number, panelWidth: number, panelHeight: number) => {
    const maxWVU = getMaxWidthVU();
    const maxHVU = getMaxHeightVU();
    const minSizeVU = pxToVu(MIN_PANEL_SIZE);

    // Clamp width and height
    const clampedWidth = Math.max(minSizeVU, Math.min(panelWidth, maxWVU));
    const clampedHeight = Math.max(minSizeVU, Math.min(panelHeight, maxHVU));

    // Clamp position to keep panel within world bounds
    const maxX = WORLD_SIZE - clampedWidth;
    const maxY = WORLD_SIZE - clampedHeight;

    return {
      x: Math.max(0, Math.min(maxX, posX)),
      y: Math.max(0, Math.min(maxY, posY)),
      width: clampedWidth,
      height: clampedHeight
    };
  }, [getMaxWidthVU, getMaxHeightVU, pixelsPerVU]);

  // Sync values with current panel state
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
    const currentPlayerId = activePlayerId;

    // Clamp values to world bounds
    const clamped = clampPosition(x, y, width, height);

    // Update individual panel settings for this player (stored on host)
    if (isHost) {
      dispatch({
        type: 'UPDATE_PLAYER_PANEL_SETTINGS',
        payload: {
          playerId: currentPlayerId,
          panelId: panel.id,
          settings: {
            x: Math.round(clamped.x),
            y: Math.round(clamped.y),
            width: Math.round(clamped.width),
            height: Math.round(clamped.height),
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
      dispatch({
        type: 'UPDATE_PLAYER_PANEL_SETTINGS',
        payload: {
          playerId: currentPlayerId,
          panelId: panel.id,
          settings: {
            x: Math.round(clamped.x),
            y: Math.round(clamped.y),
            width: Math.round(clamped.width),
            height: Math.round(clamped.height),
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

    // Also update the panel object itself
    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: panel.id,
        updates: {
          title,
          x: Math.round(clamped.x),
          y: Math.round(clamped.y),
          width: Math.round(clamped.width),
          height: Math.round(clamped.height),
          dualPosition,
          zIndex
        }
      },
      _localOnly: true
    });

    onClose();
  };

  const modalContent = (
    <div className="fixed inset-0 z-[100005] flex items-center justify-center bg-black/40">
      <div className="bg-slate-800 rounded-lg shadow-xl w-[575px] border border-slate-600 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex justify-center items-center py-2 px-4">
          <h3 className="text-base font-bold text-white">{translate('Properties:', language as Locale)} {panel.title}</h3>
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
        <div
          className="flex-1 overflow-y-auto scrollbar-thin p-4"
          data-scrollable="true"
        >
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
