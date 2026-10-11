/**
 * LayersSyncBridge - keeps UIContext.hyperscaleLayers in sync with GameContext
 *
 * GameContext is the source of truth for hyperscale layers: layer edits are
 * dispatched there (LayersPanel, HyperscaleLayerSettingsWindow) and synced P2P
 * via SYNC_STATE. UIProvider sits ABOVE GameProvider (App.tsx), so UIContext
 * cannot consume GameContext directly — without this bridge its copy stays
 * frozen at the hardcoded defaults and every useHyperscaleLayers() consumer
 * (zoom, LayersPanel, ContextMenu) sees stale settings.
 *
 * Must be rendered INSIDE GameProvider. Selection (selectedHyperscaleLayerIds)
 * is deliberately NOT bridged: it is per-user local state.
 */

import React, { useEffect } from 'react';
import { useGame } from '../GameContext';
import { useUI } from './UIContext';

export const LayersSyncBridge: React.FC = () => {
  const { state } = useGame();
  const { setHyperscaleLayers } = useUI();

  const layers = state.hyperscaleLayers;

  useEffect(() => {
    setHyperscaleLayers(layers ?? []);
  }, [layers, setHyperscaleLayers]);

  return null;
};
