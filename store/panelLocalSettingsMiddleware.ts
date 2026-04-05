import { Action } from './gameActions';
import { ItemType } from '../types';
import { updateLocalPanelSettings } from '../utils/localSettings';

/**
 * Middleware to intercept panel updates and redirect them to local settings
 * This ensures that panel position, size, and minimized state are stored locally per player
 * instead of being synced across all players
 */
export function createPanelLocalSettingsMiddleware(dispatch: React.Dispatch<Action>) {
  return (action: Action): Action => {
    // Check if this is an UPDATE_OBJECT action for a panel
    if (action.type === 'UPDATE_OBJECT' && action.payload.id) {
      // Check if we're updating a panel object
      const obj = action.payload;
      if (obj.type === ItemType.PANEL) {
        // Check if the update includes local properties
        const localProperties = [
          'x', 'y', 'width', 'height', 'minimized',
          'isPinnedToViewport', 'pinnedScreenPosition',
          'expandedState', 'collapsedState',
          'expandedPinnedPosition', 'collapsedPinnedPosition'
        ];

        const hasLocalProperties = localProperties.some(prop => prop in action.payload);

        if (hasLocalProperties) {
          // Extract local properties
          const localUpdates: any = {};
          localProperties.forEach(prop => {
            if (prop in action.payload) {
              localUpdates[prop] = action.payload[prop];
            }
          });

          // Save to local settings
          updateLocalPanelSettings(action.payload.id, localUpdates);

          // Remove local properties from the action before forwarding
          const filteredPayload = { ...action.payload };
          localProperties.forEach(prop => {
            delete filteredPayload[prop];
          });

          // If there are no non-local properties left, don't forward the action
          const hasNonLocalProperties = Object.keys(filteredPayload).some(key =>
            !localProperties.includes(key) && key !== 'id'
          );

          if (!hasNonLocalProperties) {
            // Action was entirely about local properties, don't forward
            return action;
          }

          // Forward action with only non-local properties
          return {
            type: action.type,
            payload: filteredPayload
          };
        }
      }
    }

    // Forward all other actions as-is
    return action;
  };
}
