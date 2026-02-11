import React from 'react';
import { createPortal } from 'react-dom';
import { PanelObject, PanelType, AppLanguage } from '../types';
import { useGame } from '../store/GameContext';
import { Settings, Maximize2, Check } from 'lucide-react';
import { useHandCardScale } from '../hooks/useHandCardScale';

type PanelSettingsTab = 'general';

interface PanelSettingsModalProps {
  panel: PanelObject;
  onClose: () => void;
  language?: AppLanguage;
}

/**
 * Modal for editing panel settings (position, size, rotation, etc.)
 * Used in both UIObjectRenderer and MainMenuContent
 */
export const PanelSettingsModal: React.FC<PanelSettingsModalProps> = ({ panel, onClose, language = 'en' }) => {
  const { dispatch } = useGame();
  const t = (key: { en: string; ru: string }): string => key[language] || key.en;

  const [activeTab, setActiveTab] = React.useState<PanelSettingsTab>('general');
  const [title, setTitle] = React.useState(panel.title);
  const [x, setX] = React.useState(panel.x);
  const [y, setY] = React.useState(panel.y);
  const [width, setWidth] = React.useState(panel.width);
  const [height, setHeight] = React.useState(panel.height);
  const [rotation, setRotation] = React.useState(panel.rotation);
  const [dualPosition, setDualPosition] = React.useState(panel.dualPosition || false);
  const [zIndex, setZIndex] = React.useState(panel.zIndex || 1000);

  // Hand card scale for HAND panels
  const isHandPanel = panel.panelType === PanelType.HAND;
  const { scale: handCardScale, setHandCardScale } = useHandCardScale();

  const handleSave = () => {
    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: panel.id,
        title,
        x,
        y,
        width,
        height,
        rotation,
        dualPosition,
        zIndex
      }
    });

    // Save hand card scale to localStorage for HAND panels
    if (isHandPanel) {
      localStorage.setItem('hand-card-scale', String(handCardScale));
      window.dispatchEvent(new CustomEvent('hand-card-scale-changed', {
        detail: { scale: handCardScale }
      }));
    }

    onClose();
  };

  const modalContent = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70">
      <div className="bg-slate-800 rounded-lg shadow-xl w-[575px] border border-slate-600 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex justify-center items-center py-2 px-4 border-b border-slate-700">
          <h3 className="text-base font-bold text-white">{t({ en: `Settings: ${panel.title}`, ru: `Настройки: ${panel.title}` })}</h3>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-700">
          <button
            onClick={() => setActiveTab('general')}
            className={`flex-1 py-3 px-3 flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
              activeTab === 'general'
                ? 'bg-slate-700 text-white border-b-2 border-purple-500'
                : 'text-gray-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <Settings size={16} /> {t({ en: 'General', ru: 'Основное' })}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* Name */}
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1">{t({ en: 'Name', ru: 'Название' })}</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
            />
          </div>

          {/* Position */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">{t({ en: 'X Position', ru: 'Позиция X' })}</label>
              <input
                type="number"
                value={Math.round(x)}
                onChange={e => setX(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">{t({ en: 'Y Position', ru: 'Позиция Y' })}</label>
              <input
                type="number"
                value={Math.round(y)}
                onChange={e => setY(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
              />
            </div>
          </div>

          {/* Size */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">{t({ en: 'Width', ru: 'Ширина' })}</label>
              <input
                type="number"
                value={width}
                onChange={e => setWidth(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">{t({ en: 'Height', ru: 'Высота' })}</label>
              <input
                type="number"
                value={height}
                onChange={e => setHeight(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
              />
            </div>
          </div>

          {/* Rotation */}
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1">{t({ en: 'Rotation (degrees)', ru: 'Вращение (градусы)' })}</label>
            <input
              type="number"
              value={rotation}
              onChange={e => setRotation(Number(e.target.value))}
              className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
            />
          </div>

          {/* Z-Index and Card Scale in one row for HAND panels */}
          {isHandPanel ? (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">{t({ en: 'Card Scale (%)', ru: 'Масштаб карт (%)' })}</label>
                <input
                  type="number"
                  value={Math.round(handCardScale * 100)}
                  onChange={e => {
                    const val = Number(e.target.value);
                    if (!isNaN(val) && val >= 50 && val <= 200) {
                      setHandCardScale(val / 100);
                    }
                  }}
                  min={50}
                  max={200}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Z-Index</label>
                <input
                  type="number"
                  value={zIndex}
                  onChange={e => setZIndex(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">{t({ en: 'Z-Index (layer order)', ru: 'Z-Index (порядок слоёв)' })}</label>
              <input
                type="number"
                value={zIndex}
                onChange={e => setZIndex(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
              />
            </div>
          )}

          {/* Dual Position Toggle */}
          <div className="flex items-center justify-between bg-slate-900 rounded px-3 py-2 border border-slate-700">
            <label className="text-xs text-gray-300 flex items-center gap-2">
              <Maximize2 size={12} />
              {t({ en: 'Dual Position Mode', ru: 'Двойная позиция' })}
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
          <p className="text-[10px] text-gray-500 -mt-2">
            {t({ en: 'When enabled, panel remembers separate positions for collapsed and expanded states', ru: 'Когда включено, панель запоминает отдельные позиции для свёрнутого и развёрнутого состояния' })}
          </p>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-300 hover:bg-slate-700 rounded"
          >
            {t({ en: 'Cancel', ru: 'Отмена' })}
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-500 text-white rounded flex items-center gap-2"
          >
            <Check size={16} /> {t({ en: 'Save Changes', ru: 'Сохранить изменения' })}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
