import { PanelObject, ItemType } from '../types';
import { findAvailableTerritory } from './territoryManager';
import { PLAYABLE_AREA_SIZE } from '../constants';

/**
 * Migration utilities for pool panels
 * Used to fix pool panels that were created in playable area
 */

export interface PoolPanelMigrationResult {
  migrated: number;
  failed: number;
  errors: string[];
}

/**
 * Check if a pool panel is in playable area (needs migration)
 */
export function poolNeedsMigration(panel: PanelObject): boolean {
  if (!panel.poolData || !panel.poolData.tabs || panel.poolData.tabs.length === 0) return false;

  // Check first tab's coordinates
  const firstTab = panel.poolData.tabs[0];
  const { offsetX = 0, offsetY = 0 } = firstTab;

  // Pool is in playable area if both coordinates are < 5000
  return offsetX < PLAYABLE_AREA_SIZE && offsetY < PLAYABLE_AREA_SIZE;
}

/**
 * Migrate a single pool panel to non-playable territory
 */
export function migratePoolPanel(
  panel: PanelObject,
  allObjects: Record<string, any>
): { success: boolean; newX?: number; newY?: number; error?: string } {
  if (!panel.poolData) {
    return { success: false, error: 'No pool data' };
  }

  // Get existing pool territories (excluding this panel)
  const existingPools = Object.values(allObjects)
    .filter(obj => obj.type === ItemType.PANEL && obj.id !== panel.id && (obj as PanelObject).poolData)
    .flatMap(obj => {
      const poolPanel = obj as PanelObject;
      const poolData = poolPanel.poolData!;
      // Each tab has its own territory now
      return poolData.tabs.map(tab => ({
        id: tab.id,
        x: tab.offsetX ?? 0,
        y: tab.offsetY ?? 0,
        width: 1000,
        height: 1000
      }));
    });

  // Find new territory
  const territory = findAvailableTerritory(existingPools);

  if (!territory) {
    return { success: false, error: 'No available territory' };
  }

  return {
    success: true,
    newX: territory.x,
    newY: territory.y
  };
}

/**
 * Migrate all pool panels that are in playable area
 */
export function migrateAllPoolPanels(
  objects: Record<string, any>
): PoolPanelMigrationResult {
  const poolPanels = Object.values(objects).filter(
    obj => obj.type === ItemType.PANEL && (obj as PanelObject).poolData
  ) as PanelObject[];

  const needsMigration = poolPanels.filter(poolNeedsMigration);

  const result: PoolPanelMigrationResult = {
    migrated: 0,
    failed: 0,
    errors: []
  };

  needsMigration.forEach(panel => {
    const migration = migratePoolPanel(panel, objects);

    if (migration.success) {
      // Update the panel tabs with new coordinates
      if (panel.poolData && panel.poolData.tabs && panel.poolData.tabs.length > 0) {
        // Update all tabs to use the new territory coordinates
        panel.poolData.tabs.forEach(tab => {
          tab.offsetX = migration.newX!;
          tab.offsetY = migration.newY!;
          tab.territoryId = `territory-${panel.id}-${tab.id}-${Date.now()}`;
        });
        result.migrated++;
      }
    } else {
      result.failed++;
      result.errors.push(`${panel.name || panel.id}: ${migration.error}`);
    }
  });

  return result;
}

/**
 * Get migration info for console display
 */
export function getMigrationInfo(objects: Record<string, any>): {
  totalPools: number;
  needsMigration: number;
  alreadyCorrect: number;
  details: Array<{ name: string; x: number; y: number; needsMigration: boolean }>;
} {
  const poolPanels = Object.values(objects).filter(
    obj => obj.type === ItemType.PANEL && (obj as PanelObject).poolData
  ) as PanelObject[];

  const details = poolPanels.map(panel => {
    // Get coordinates from first tab
    const firstTab = panel.poolData?.tabs?.[0];
    const x = firstTab?.offsetX ?? 0;
    const y = firstTab?.offsetY ?? 0;

    return {
      name: panel.name || panel.id,
      x,
      y,
      needsMigration: poolNeedsMigration(panel)
    };
  });

  return {
    totalPools: poolPanels.length,
    needsMigration: details.filter(d => d.needsMigration).length,
    alreadyCorrect: details.filter(d => !d.needsMigration).length,
    details
  };
}

/**
 * Run migration and log results
 */
export function runPoolMigrationIfNeeded(objects: Record<string, any>): void {
  const info = getMigrationInfo(objects);

  if (info.needsMigration === 0) {
    return;
  }

  const result = migrateAllPoolPanels(objects);
}