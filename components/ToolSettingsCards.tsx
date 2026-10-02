import React, { useId } from 'react';
import { useToolSettings } from '../contexts/ToolSettingsContext';
import { useLanguage } from '../store/contexts/UIContext';
import { t, Locale } from '../utils/translations';

/**
 * ToolSettingsCards
 *
 * The tool settings cards for the Tools tab (marker, eraser, ruler, zoom, text,
 * cursor+grid). Shared by the main menu Tools tab AND the draggable Tools panel
 * so both always show identical, up-to-date settings.
 *
 * The card for the currently selected tool is rendered (grid card with cursor).
 */
export const ToolSettingsCards: React.FC = () => {
  const { settings, updateCursorSettings, updateMarkerSettings, updateEraserSettings, updateRulerSettings, updateZoomSettings, updateTextSettings, updateGridSettings } = useToolSettings();
  const language = useLanguage();
  const uid = useId().replace(/:/g, '');
  const id = (name: string) => `${name}-${uid}`;
  const translate = (s: string) => t(s, language as Locale);

  return (
    <>
      {/* Cursor Settings (shown when cursor is selected) */}
      {settings.selectedTool === 'none' && (
        <div className="bg-slate-800 rounded-lg space-y-3 p-3">
          {/* Show cursor button in top-left panel checkbox */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={id('show-cursor-button')}
              checked={settings.cursor.showButton}
              onChange={(e) => updateCursorSettings({ showButton: e.target.checked })}
              className="w-4 h-4 bg-slate-700 border border-slate-600 rounded cursor-pointer accent-purple-500"
            />
            <label htmlFor={id('show-cursor-button')} className="text-[10px] text-gray-400 cursor-pointer">
              {translate('Show cursor button')}
            </label>
          </div>
        </div>
      )}

      {/* Marker Settings (shown when marker is selected) */}
      {settings.selectedTool === 'marker' && (
        <div className="bg-slate-800 rounded-lg space-y-2 p-3">
          {/* Color picker */}
          <div>
            <input
              type="color"
              value={settings.marker.color}
              onChange={(e) => updateMarkerSettings({ color: e.target.value })}
              className="w-full h-10 bg-slate-900 border border-slate-700 rounded cursor-pointer"
            />
          </div>

          {/* Thickness slider */}
          <div>
            <label className="block text-[10px] text-gray-400 mb-0.5">
              {translate('Size')}: {settings.marker.thickness}px
            </label>
            <input
              type="range"
              min="1"
              max="100"
              value={settings.marker.thickness}
              onChange={(e) => updateMarkerSettings({ thickness: Number(e.target.value) })}
              className="w-full bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500 slider-input"
            />
            <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
              <span>1px</span>
              <span>50px</span>
              <span>100px</span>
            </div>
          </div>

          {/* Opacity slider */}
          <div>
            <label className="block text-[10px] text-gray-400 mb-0.5">
              {translate('Opacity')}: {settings.marker.opacity}%
            </label>
            <input
              type="range"
              min="1"
              max="100"
              value={settings.marker.opacity}
              onChange={(e) => updateMarkerSettings({ opacity: Number(e.target.value) })}
              className="w-full bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500 slider-input"
            />
            <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
              <span>1%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>

          {/* Show marker button in top-left panel checkbox */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={id('show-marker-button')}
              checked={settings.marker.showButton}
              onChange={(e) => updateMarkerSettings({ showButton: e.target.checked })}
              className="w-4 h-4 bg-slate-700 border border-slate-600 rounded cursor-pointer accent-purple-500"
            />
            <label htmlFor={id('show-marker-button')} className="text-[10px] text-gray-400 cursor-pointer">
              {translate('Show marker button')}
            </label>
          </div>
        </div>
      )}

      {/* Eraser Settings (shown when eraser is selected) */}
      {settings.selectedTool === 'eraser' && (
        <div className="bg-slate-800 rounded-lg space-y-3 p-3">
          {/* Thickness slider */}
          <div>
            <label className="block text-[10px] text-gray-400 mb-0.5">
              {translate('Size')}: {settings.eraser.thickness}px
            </label>
            <input
              type="range"
              min="15"
              max="100"
              value={settings.eraser.thickness}
              onChange={(e) => updateEraserSettings({ thickness: Number(e.target.value) })}
              className="w-full bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500 slider-input"
            />
            <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
              <span>15px</span>
              <span>50px</span>
              <span>100px</span>
            </div>
          </div>

          {/* Show eraser button in top-left panel checkbox */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={id('show-eraser-button')}
              checked={settings.eraser.showButton}
              onChange={(e) => updateEraserSettings({ showButton: e.target.checked })}
              className="w-4 h-4 bg-slate-700 border border-slate-600 rounded cursor-pointer accent-purple-500"
            />
            <label htmlFor={id('show-eraser-button')} className="text-[10px] text-gray-400 cursor-pointer">
              {translate('Show eraser button')}
            </label>
          </div>
        </div>
      )}

      {/* Ruler Settings (shown when ruler tool is selected) */}
      {settings.selectedTool === 'ruler' && (
        <div className="bg-slate-800 rounded-lg space-y-3 p-3">
          {/* Step slider */}
          <div>
            <label className="block text-[10px] text-gray-400 mb-0.5">
              {translate('Step')}: {settings.ruler.step} VU
            </label>
            <input
              type="range"
              min="0"
              max="500"
              step="1"
              value={settings.ruler.step}
              onChange={(e) => updateRulerSettings({ step: Number(e.target.value) })}
              className="w-full bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500 slider-input"
            />
            <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
              <span>0</span>
              <span>250</span>
              <span>500</span>
            </div>
          </div>

          {/* Show ruler button in top-left panel checkbox */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={id('show-ruler-button')}
              checked={settings.ruler.showButton}
              onChange={(e) => updateRulerSettings({ showButton: e.target.checked })}
              className="w-4 h-4 bg-slate-700 border border-slate-600 rounded cursor-pointer accent-purple-500"
            />
            <label htmlFor={id('show-ruler-button')} className="text-[10px] text-gray-400 cursor-pointer">
              {translate('Show ruler button')}
            </label>
          </div>
        </div>
      )}

      {/* Zoom Settings (shown when zoom tool is selected) */}
      {settings.selectedTool === 'zoom' && (
        <div className="bg-slate-800 rounded-lg space-y-3 p-3">
          {/* Zoom slider */}
          <div>
            <label className="block text-[10px] text-gray-400 mb-0.5">
              {translate('Zoom')}: {settings.zoom.level}%
            </label>
            <input
              type="range"
              min="50"
              max="200"
              step="5"
              value={settings.zoom.level}
              onChange={(e) => updateZoomSettings({ level: Number(e.target.value) })}
              className="w-full bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500 slider-input"
            />
            <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
              <span>50%</span>
              <span>125%</span>
              <span>200%</span>
            </div>
          </div>

          {/* Show vertical zoom slider checkbox */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={id('show-vertical-zoom-slider')}
              checked={settings.zoom.showVerticalSlider}
              onChange={(e) => updateZoomSettings({ showVerticalSlider: e.target.checked })}
              className="w-4 h-4 bg-slate-700 border border-slate-600 rounded cursor-pointer accent-purple-500"
            />
            <label htmlFor={id('show-vertical-zoom-slider')} className="text-[10px] text-gray-400 cursor-pointer">
              {translate('Show vertical zoom slider')}
            </label>
          </div>
        </div>
      )}

      {/* Text Settings (shown when text tool is selected) */}
      {settings.selectedTool === 'text' && (
        <div className="bg-slate-800 rounded-lg space-y-2 p-3">
          {/* Default font size slider + text color square */}
          <div>
            <label className="block text-[10px] text-gray-400 mb-0.5">
              {translate('Default font size')}: {settings.text.defaultFontSizeVU} VU
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={settings.text.fontColor}
                onChange={(e) => updateTextSettings({ fontColor: e.target.value })}
                className="w-7 h-7 rounded cursor-pointer border-0 p-0 bg-slate-900 flex-shrink-0"
                title={translate('Text Color')}
              />
              <input
                type="range"
                min="10"
                max="200"
                step="1"
                value={settings.text.defaultFontSizeVU}
                onChange={(e) => updateTextSettings({ defaultFontSizeVU: Number(e.target.value) })}
                className="flex-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500 slider-input"
              />
            </div>
            <div className="flex justify-between text-[9px] text-gray-600 mt-0.5 pl-9">
              <span>10</span>
              <span>100</span>
              <span>200</span>
            </div>
          </div>

          {/* Default border width slider + border color square */}
          <div>
            <label className="block text-[10px] text-gray-400 mb-0.5">
              {translate('Border Width')}: {settings.text.borderWidth} VU
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={settings.text.borderColor}
                onChange={(e) => updateTextSettings({ borderColor: e.target.value })}
                className="w-7 h-7 rounded cursor-pointer border-0 p-0 bg-slate-900 flex-shrink-0"
                title={translate('Border Color')}
              />
              <input
                type="range"
                min="0"
                max="10"
                step="0.5"
                value={settings.text.borderWidth}
                onChange={(e) => updateTextSettings({ borderWidth: Number(e.target.value) })}
                className="flex-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500 slider-input"
              />
            </div>
            <div className="flex justify-between text-[9px] text-gray-600 mt-0.5 pl-9">
              <span>0</span>
              <span>5</span>
              <span>10</span>
            </div>
          </div>

          {/* Show text button in top-left panel checkbox */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={id('show-text-button')}
              checked={settings.text.showButton}
              onChange={(e) => updateTextSettings({ showButton: e.target.checked })}
              className="w-4 h-4 bg-slate-700 border border-slate-600 rounded cursor-pointer accent-purple-500"
            />
            <label htmlFor={id('show-text-button')} className="text-[10px] text-gray-400 cursor-pointer">
              {translate('Show text button')}
            </label>
          </div>
        </div>
      )}

      {/* Grid Settings (only when the cursor tool is selected, local per-player) */}
      {settings.selectedTool === 'none' && (
        <div className="bg-slate-800 rounded-lg space-y-3 p-3">
          {/* Enable grid checkbox */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={id('grid-enabled')}
              checked={settings.grid.enabled}
              onChange={(e) => updateGridSettings({ enabled: e.target.checked })}
              className="w-4 h-4 bg-slate-700 border border-slate-600 rounded cursor-pointer accent-purple-500"
            />
            <label htmlFor={id('grid-enabled')} className="text-[10px] text-gray-400 cursor-pointer">
              {translate('Enable grid')}
            </label>
          </div>

          {/* Cell size slider */}
          <div>
            <label className="block text-[10px] text-gray-400 mb-0.5">
              {translate('Cell size')}: {settings.grid.cellSizeVU} VU
            </label>
            <input
              type="range"
              min="5"
              max="100"
              step="1"
              value={settings.grid.cellSizeVU}
              onChange={(e) => updateGridSettings({ cellSizeVU: Number(e.target.value) })}
              className="w-full bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500 slider-input"
            />
            <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
              <span>5</span>
              <span>50</span>
              <span>100</span>
            </div>
          </div>

          {/* Show grid button in top-left panel checkbox */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={id('show-grid-button')}
              checked={settings.grid.showButton}
              onChange={(e) => updateGridSettings({ showButton: e.target.checked })}
              className="w-4 h-4 bg-slate-700 border border-slate-600 rounded cursor-pointer accent-purple-500"
            />
            <label htmlFor={id('show-grid-button')} className="text-[10px] text-gray-400 cursor-pointer">
              {translate('Show grid button')}
            </label>
          </div>
        </div>
      )}
    </>
  );
};

export default ToolSettingsCards;
