import { ItemType, PanelObject } from '../types';

/**
 * Filter out local panel properties before syncing
 * This ensures that each player's local panel settings (position, size, minimized state)
 * are not synced to other players
 */
export function filterLocalPanelProperties(objects: Record<string, any>): Record<string, any> {
  const filteredObjects: Record<string, any> = {};

  Object.entries(objects).forEach(([id, obj]) => {
    // For panels, we need to preserve the panel existence but filter local properties
    if (obj.type === ItemType.PANEL) {
      const panel = obj as PanelObject;

      // Create a filtered version of the panel without local properties
      // Local properties that should NOT be synced:
      // - x, y (position is local per player)
      // - width, height (size is local per player)
      // - minimized (collapsed state is local per player)
      // - isPinnedToViewport (pinning is local per player)
      // - pinnedScreenPosition (pinned position is local per player)
      // - expandedState (expanded state is local per player)
      // - collapsedState (collapsed state is local per player)
      // - expandedPinnedPosition (pinned position is local per player)
      // - collapsedPinnedPosition (pinned position is local per player)

      // Keep only the properties that should be synced:
      // - id, type, panelType, title
      // - deckId, playerId (for identifying which panel this is)
      // - poolData, tableauData, characterData (content data)
      // - dualPosition (this is a setting, not a local state)
      // - visible (visibility is controlled by host)

      const filteredPanel: any = {
        id: panel.id,
        type: panel.type,
        panelType: panel.panelType,
        title: panel.title,
        visible: panel.visible !== false, // Sync visibility (controlled by host)
        dualPosition: panel.dualPosition, // Sync dual position setting
      };

      // Add optional identifiers
      if (panel.deckId) filteredPanel.deckId = panel.deckId;
      if (panel.playerId) filteredPanel.playerId = panel.playerId;

      // Add content data (should be synced)
      if (panel.poolData) filteredPanel.poolData = panel.poolData;
      if (panel.tableauData) filteredPanel.tableauData = panel.tableauData;
      if (panel.characterData) filteredPanel.characterData = panel.characterData;

      // Add default values for local properties (will be overridden by local settings)
      filteredPanel.x = 100;
      filteredPanel.y = 100;
      filteredPanel.width = 400;
      filteredPanel.height = 300;
      filteredPanel.minimized = false;
      filteredPanel.isPinnedToViewport = true;
      filteredPanel.rotation = 0;
      filteredPanel.zIndex = 1000;

      filteredObjects[id] = filteredPanel;
    } else {
      // For non-panel objects, keep as is
      filteredObjects[id] = obj;
    }
  });

  return filteredObjects;
}
