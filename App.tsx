import React, { useEffect, Suspense, lazy } from 'react';
import { GameProvider } from './store/GameContext';
import { PlayerProvider } from './store/contexts/PlayerContext';
import { ViewTransformProvider, useViewTransform } from './store/contexts/ViewTransformContext';
import { UIProvider } from './store/contexts/UIContext';
import { LocalSettingsProvider, useLocalSettings } from './hooks/useLocalSettings';
import { ToolSettingsProvider } from './contexts/ToolSettingsContext';
import { memoryManager, perfMonitor } from './utils';

// Lazy load components for better initial load performance
const Tabletop = lazy(() => import('./components/Tabletop/TabletopRefactored').then(m => ({ default: m.default })));
const MainMenuContent = lazy(() => import('./components/MainMenuContent').then(m => ({ default: m.MainMenuContentMemoized })));

// Theme applier component
const ThemeApplier: React.FC = () => {
  const { settings } = useLocalSettings();

  useEffect(() => {
    // Apply theme to body element
    document.body.setAttribute('data-theme', settings.interfaceStyle);
  }, [settings.interfaceStyle]);

  return null;
};

// Browser zoom blocker - prevents browser zoom on Ctrl+scroll and Ctrl++/-
const BrowserZoomBlocker: React.FC = () => {
  const { setZoom } = useViewTransform();
  const { settings: localSettings, updateSetting } = useLocalSettings();

  useEffect(() => {
    // Block wheel-based zoom (Ctrl+scroll)
    const wheelHandler = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        // Check if target is inside a scrollable panel (but NOT the main tabletop!)
        const target = e.target as HTMLElement;
        const scrollableParent = target.closest('[data-scrollable], .overflow-y-auto, [data-hand-panel], [data-tokens-panel], [data-tools-panel]');

        // Additional check: if we found an element with overflow-auto, make sure it's NOT the tabletop
        const overflowAutoParent = target.closest('.overflow-auto');
        const isTabletop = overflowAutoParent?.getAttribute('data-tabletop') === 'true';

        // Only allow default behavior if we're in a scrollable panel AND it's NOT the tabletop
        if (scrollableParent && !isTabletop) {
          return;
        }

        // Prevent browser zoom
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        // Handle internal zoom
        const zoomSensitivity = 0.001;
        const delta = -e.deltaY * zoomSensitivity;
        const currentZoom = localSettings.zoom ?? 100;
        const newZoom = Math.max(25, Math.min(400, currentZoom + delta * 100));
        const roundedZoom = Math.round(newZoom / 5) * 5;

        if (roundedZoom !== currentZoom) {
          updateSetting('zoom', roundedZoom);
          if (setZoom) {
            setZoom(roundedZoom / 100);
          }
        }
      }
    };

    // Block keyboard-based zoom (Ctrl++/-/0)
    const keyHandler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '-' || e.key === '0' || e.key === '=')) {
        e.preventDefault();
        e.stopPropagation();

        const currentZoom = localSettings.zoom ?? 100;
        let newZoom = currentZoom;

        if (e.key === '+' || e.key === '=') {
          newZoom = Math.min(400, currentZoom + 10);
        } else if (e.key === '-') {
          newZoom = Math.max(25, currentZoom - 10);
        } else if (e.key === '0') {
          newZoom = 100;
        }

        if (newZoom !== currentZoom) {
          updateSetting('zoom', newZoom);
          if (setZoom) {
            setZoom(newZoom / 100);
          }
        }
      }
    };

    // Add handlers with capture phase and passive: false
    (document as any).addEventListener('wheel', wheelHandler, { capture: true, passive: false });
    document.addEventListener('keydown', keyHandler, { capture: true });

    return () => {
      (document as any).removeEventListener('wheel', wheelHandler, { capture: true, passive: false });
      document.removeEventListener('keydown', keyHandler, { capture: true });
    };
  }, [localSettings.zoom, updateSetting, setZoom]);

  return null;
};

// Performance monitoring component
const PerformanceMonitor: React.FC = () => {
  useEffect(() => {
    // Start memory manager
    memoryManager.start();

    // Optional: Set up periodic performance logging (disabled)
    const perfLogInterval = setInterval(() => {
      // Performance logging disabled
    }, 300000); // Every 5 minutes


    return () => {
      memoryManager.stop();
      clearInterval(perfLogInterval);
    };
  }, []);

  return null; // This component doesn't render anything
};

const App: React.FC = () => {
  return (
    <LocalSettingsProvider>
      <ViewTransformProvider>
        <ToolSettingsProvider>
          <UIProvider>
            <GameProvider>
              <PlayerProvider>
                <ThemeApplier />
                <PerformanceMonitor />
                <BrowserZoomBlocker />
                <div className="w-full h-screen overflow-hidden">
                  <Suspense fallback={
                    <div className="w-full h-screen flex items-center justify-center bg-slate-900">
                      <div className="text-white text-lg">Loading...</div>
                    </div>
                  }>
                    <Tabletop />
                  </Suspense>
                </div>
              </PlayerProvider>
            </GameProvider>
          </UIProvider>
        </ToolSettingsProvider>
      </ViewTransformProvider>
    </LocalSettingsProvider>
  );
};

export default App;
