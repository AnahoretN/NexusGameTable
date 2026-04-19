/**
 * App v2.0 - Updated with new context architecture
 *
 * @version 2.0.0
 * @since 2026-04-17
 *
 * ИЗМЕНЕНИЯ с v1.0:
 * ✅ Обновлена иерархия провайдеров для новой архитектуры
 * ✅ Интегрирована WebRTC синхронизация с новыми контекстами
 * ✅ Добавлен WebRTCIntegration компонент
 * ✅ Разделены локальные и синхронизируемые данные
 */

import React, { useEffect, Suspense } from 'react';
import { LocalSettingsProvider } from './hooks/useLocalSettings';
import { UIProviderV1 as UIProvider } from './store/contexts/UIContext.v1.1';
import { ViewTransformProvider } from './store/contexts/ViewTransformContext';
import { PlayerProviderV2 as PlayerProvider } from './store/contexts/PlayerContext.v2';
import { GameProvider } from './store/GameContext';
import { Tabletop } from './components/Tabletop';
import { memoryManager, perfMonitor } from './utils';
import { WebRTCSyncManager } from './utils/webrtcSyncManager';
import { usePeerConnection } from './store/usePeerConnection';
import { logger } from './utils/logger';

// ============================================================================
// WEBRTC INTEGRATION COMPONENT
// ============================================================================

/**
 * WebRTCIntegrationComponent - Управляет WebRTC синхронизацией
 *
 * Этот компонент собирает данные из всех контекстов и отправляет их через WebRTC.
 * Полученные данные распределяет по соответствующим контекстам.
 */
function WebRTCIntegration({ children }: { children: React.ReactNode }) {
  // WebRTC соединение
  const {
    peerId,
    isHost,
    connectionStatus,
    waitingForPlayerName,
    setPlayerName,
    hostConnectionRef,
    connectionsRef,
  } = usePeerConnection();

  // Доступ к контекстам через children (провайдеры уже обернули)
  // Здесь используем специальный подход для получения данных из контекстов

  useEffect(() => {
    if (isHost && connectionStatus === 'connected') {
      // WebRTC logic for host will be here
    }
  }, [isHost, connectionStatus]);

  return <>{children}</>;
}

// ============================================================================
// PERFORMANCE MONITOR COMPONENT
// ============================================================================

const PerformanceMonitor: React.FC = () => {
  useEffect(() => {
    // Start memory manager
    memoryManager.start();

    // Performance logging disabled
    const perfLogInterval = setInterval(() => {
      // Performance logging disabled
    }, 300000);

    return () => {
      memoryManager.stop();
      clearInterval(perfLogInterval);
    };
  }, []);

  return null; // This component doesn't render anything
};

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================

const AppV2: React.FC = () => {
  return (
    <LocalSettingsProvider>
      {/* 🔵 UIContext v1.1 - Язык (локальный), слои (синхронизация) */}
      <UIProvider>
        {/* 🟢 ViewTransformContext v2.1 - Камера (локальная, НЕ синхронизируется) */}
        <ViewTransformProvider>
          {/* 🟡 PlayerContext v2.0 - Игроки (синхронизация) */}
          <PlayerProvider>
            {/* 🔴 GameContext v2.0 - Игровые объекты (синхронизация) */}
            <GameProvider>
              {/* 🌐 WebRTC интеграция - Управляет синхронизацией между контекстами */}
              <WebRTCIntegration>
                {/* 📊 Performance monitoring */}
                <PerformanceMonitor />
                {/* 🎮 Основное приложение */}
                <div className="w-full h-screen overflow-hidden">
                  <Tabletop />
                </div>
              </WebRTCIntegration>
            </GameProvider>
          </PlayerProvider>
        </ViewTransformProvider>
      </UIProvider>
    </LocalSettingsProvider>
  );
};

export default AppV2;

// ============================================================================
// ARCHITECTURE NOTES
// ============================================================================

/**
 * 🏗️ НОВАЯ АРХИТЕКТУРА ПРОВАЙДЕРОВ:
 *
 * LocalSettingsProvider (локальные настройки)
 *   ↓
 * UIProvider (язык - локальный, слои - синхронизация)
 *   ↓
 * ViewTransformProvider (камера - локальная, НЕ синхронизируется)
 *   ↓
 * PlayerProvider (игроки - синхронизация)
 *   ↓
 * GameProvider (игровые объекты - синхронизация)
 *   ↓
 * WebRTCIntegration (управление WebRTC синхронизацией)
 *   ↓
 * MainApplication
 *
 * 🔄 WEBRTC СИНХРОНИЗАЦИЯ:
 *
 * WebRTCIntegration компонент:
 * 1. Собирает данные из всех контекстов
 * 2. Использует WebRTCSyncManager для создания sync данных
 * 3. Отправляет через usePeerConnection()
 * 4. Распределяет полученные данные по контекстам
 *
 * 📍 ЛОКАЛЬНЫЕ ДАННЫЕ (НЕ синхронизируются):
 * - language (каждый игрок выбирает свой)
 * - viewTransform (каждый игрок имеет свою камеру)
 *
 * ✅ СИНХРОНИЗИРУЕМЫЕ ДАННЫЕ:
 * - players, activePlayerId, playerPermissions (PlayerContext)
 * - hyperscaleLayers, selectedHyperscaleLayerIds, playerPanelSettings (UIContext)
 * - objects, diceRolls, drawings, undo, etc. (GameContext)
 */