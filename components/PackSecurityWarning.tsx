import React from 'react';
import { AlertTriangle, Shield, X } from 'lucide-react';

interface PackSecurityWarningProps {
  warnings: string[];
  onConfirm: () => void;
  onCancel: () => void;
  language?: 'en' | 'ru' | 'be' | 'uk' | 'sr';
}

export const PackSecurityWarning: React.FC<PackSecurityWarningProps> = ({
  warnings,
  onConfirm,
  onCancel,
  language = 'en'
}) => {
  const t = {
    en: {
      title: 'Security Warning',
      message: 'This pack may contain potentially unsafe content:',
      loadAnyway: 'Load Anyway',
      cancel: 'Cancel',
      trustedSource: 'Only load packs from trusted sources.',
      securityCheck: 'Security Check'
    },
    ru: {
      title: 'Предупреждение безопасности',
      message: 'Этот пак может содержать потенциально небезопасное содержимое:',
      loadAnyway: 'Всё равно загрузить',
      cancel: 'Отмена',
      trustedSource: 'Загружайте паки только из доверенных источников.',
      securityCheck: 'Проверка безопасности'
    },
    be: {
      title: 'Папярэджанне бяспекі',
      message: 'Гэты пак можа ўтрымліваць патэнцыйна небяспечнае змесціва:',
      loadAnyway: 'Усё роўна загрузіць',
      cancel: 'Адмена',
      trustedSource: 'Загружайце паки толькі з давераных крыніц.',
      securityCheck: 'Праверка бяспекі'
    },
    uk: {
      title: 'Попередження безпеки',
      message: 'Цей пак може містити потенційно небезпечний вміст:',
      loadAnyway: 'Все одно завантажити',
      cancel: 'Скасувати',
      trustedSource: 'Завантажуйте паки лише з довірених джерел.',
      securityCheck: 'Перевірка безпеки'
    },
    sr: {
      title: 'Upozorenje o bezbednosti',
      message: 'Ovaj pak može sadržati potencijalno nesiguran sadržaj:',
      loadAnyway: 'Ipak učitaj',
      cancel: 'Otkaži',
      trustedSource: 'Učitavajte pakove samo sa poverljivih izvora.',
      securityCheck: 'Provera bezbednosti'
    }
  }[language];

  if (warnings.length === 0) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[10002]">
      <div className="bg-slate-800 rounded-lg shadow-xl w-[500px] max-h-[80vh] overflow-hidden flex flex-col border border-yellow-600">
        {/* Header */}
        <div className="flex justify-between items-center py-3 px-4 border-b border-slate-700 bg-yellow-900/20">
          <div className="flex items-center gap-2">
            <Shield className="text-yellow-500" size={20} />
            <h3 className="text-lg font-bold text-white">{t.title}</h3>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 flex-1 overflow-y-auto">
          <p className="text-sm text-gray-300">{t.message}</p>

          <ul className="space-y-2">
            {warnings.map((warning, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-yellow-300">
                <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                <span>{warning}</span>
              </li>
            ))}
          </ul>

          <div className="p-3 bg-yellow-900/30 border border-yellow-700 rounded">
            <p className="text-xs text-yellow-200 flex items-center gap-2">
              <AlertTriangle size={14} />
              {t.trustedSource}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 py-3 px-4 border-t border-slate-700 bg-slate-900/50">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded font-medium transition-colors"
          >
            {t.cancel}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded font-medium transition-colors flex items-center gap-2"
          >
            <Shield size={16} />
            {t.loadAnyway}
          </button>
        </div>
      </div>
    </div>
  );
};
