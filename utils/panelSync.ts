import { ItemType, PanelObject } from '../types';

/**
 * Filter out local panel properties before syncing
 *
 * IMPORTANT: This function is used when sending state to NEW guests connecting.
 * Guests should receive the HOST's panel positions and sizes as initial values.
 *
 * After connection, guests can modify their local panel settings without
 * affecting the host or other guests (enforced by GameContext.tsx checks).
 */
export function filterLocalPanelProperties(objects: Record<string, any>): Record<string, any> {
  const filteredObjects: Record<string, any> = {};

  Object.entries(objects).forEach(([id, obj]) => {
    // For panels, send COMPLETE panel data to guests
    // This ensures guests see panels exactly as the host has them positioned
    if (obj.type === ItemType.PANEL) {
      const panel = obj as PanelObject;

      // Send ALL panel properties including position and size
      // Guests will use these as initial values when they connect
      const filteredPanel: any = {
        id: panel.id,
        type: panel.type,
        panelType: panel.panelType,
        title: panel.title,
        visible: panel.visible !== false,
        dualPosition: panel.dualPosition,
        // Include position and size - guests should see host's layout
        x: panel.x,
        y: panel.y,
        width: panel.width,
        height: panel.height,
        minimized: panel.minimized || false,
        isPinnedToViewport: panel.isPinnedToViewport || false,
        rotation: panel.rotation || 0,
        zIndex: panel.zIndex || 1000,
      };

      // Add optional properties if they exist
      if (panel.deckId) filteredPanel.deckId = panel.deckId;
      if (panel.playerId) filteredPanel.playerId = panel.playerId;
      if (panel.pinnedScreenPosition) filteredPanel.pinnedScreenPosition = panel.pinnedScreenPosition;
      if (panel.expandedState) filteredPanel.expandedState = panel.expandedState;
      if (panel.collapsedState) filteredPanel.collapsedState = panel.collapsedState;
      if (panel.expandedPinnedPosition) filteredPanel.expandedPinnedPosition = panel.expandedPinnedPosition;
      if (panel.collapsedPinnedPosition) filteredPanel.collapsedPinnedPosition = panel.collapsedPinnedPosition;

      // Add content data (should be synced)
      if (panel.poolData) filteredPanel.poolData = panel.poolData;
      if (panel.tableauData) filteredPanel.tableauData = panel.tableauData;
      if (panel.characterData) filteredPanel.characterData = panel.characterData;

      filteredObjects[id] = filteredPanel;
    } else {
      // For non-panel objects, keep as is
      filteredObjects[id] = obj;
    }
  });

  return filteredObjects;
}
