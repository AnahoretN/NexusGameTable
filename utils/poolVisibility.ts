import { TableObject } from '../types';
import { CursorSlotObject } from './poolPlacement';

export interface PoolZone {
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  panelId: string;
  tabId: string; // Each tab has its own separate game space
}

/**
 * Check if cursor is over the visible pool panel window
 */
export function isCursorOverVisiblePoolPanel(
  clientX: number,
  clientY: number,
  poolPanelId: string
): boolean {
  // Get the visible content area (data-pool-content) - this is the VISIBLE window
  const visibleContentArea = document.querySelector(`[data-pool-content="${poolPanelId}"]`) as HTMLElement;
  if (!visibleContentArea) {
    return false;
  }

  const visibleRect = visibleContentArea.getBoundingClientRect();

  // Check if cursor position is over the visible pool panel area
  return clientX >= visibleRect.left && clientX <= visibleRect.right &&
         clientY >= visibleRect.top && clientY <= visibleRect.bottom;
}

/**
 * Check if objects will be completely visible in the pool panel window
 * Accounts for stacking offset - checks the last (bottom-right most) object
 */
export function areObjectsFullyVisible(
  clientX: number,
  clientY: number,
  objects: TableObject[],
  poolPanelId: string,
  pixelsPerVU: number
): boolean {
  if (objects.length === 0) return true;

  // Get the visible content area (data-pool-content) - this is the VISIBLE window
  const visibleContentArea = document.querySelector(`[data-pool-content="${poolPanelId}"]`) as HTMLElement;
  if (!visibleContentArea) {
    return false;
  }

  const visibleRect = visibleContentArea.getBoundingClientRect();

  // Check the last object (with maximum stacking offset)
  const lastObj = objects[objects.length - 1];
  if (lastObj) {
    // Calculate stacking offset for the last object
    const objWidth = (lastObj.width || 50) * pixelsPerVU;
    const objHeight = (lastObj.height || 50) * pixelsPerVU;
    const stackingOffset = Math.min(objWidth, objHeight) * 0.05; // 5% stacking offset
    const maxOffset = stackingOffset * (objects.length - 1);

    // Calculate position of the last object (with maximum offset) in screen coords
    const objLeft = clientX - objWidth / 2 + maxOffset;
    const objRight = clientX + objWidth / 2 + maxOffset;
    const objTop = clientY - objHeight / 2 + maxOffset;
    const objBottom = clientY + objHeight / 2 + maxOffset;

    // Check if last object is completely within visible content area
    return objLeft >= visibleRect.left && objRight <= visibleRect.right &&
           objTop >= visibleRect.top && objBottom <= visibleRect.bottom;
  }

  return true;
}

/**
 * Check if a single object will be completely visible in the pool panel window
 */
export function isObjectFullyVisible(
  clientX: number,
  clientY: number,
  obj: TableObject,
  poolPanelId: string,
  pixelsPerVU: number
): boolean {
  // Get the visible content area (data-pool-content) - this is the VISIBLE window
  const visibleContentArea = document.querySelector(`[data-pool-content="${poolPanelId}"]`) as HTMLElement;
  if (!visibleContentArea) {
    return false;
  }

  const visibleRect = visibleContentArea.getBoundingClientRect();

  // Calculate object bounds in screen coordinates
  const objWidth = (obj.width || 100) * pixelsPerVU;
  const objHeight = (obj.height || 100) * pixelsPerVU;

  const objLeft = clientX - objWidth / 2;
  const objRight = clientX + objWidth / 2;
  const objTop = clientY - objHeight / 2;
  const objBottom = clientY + objHeight / 2;

  // Check if object is completely within visible content area
  return objLeft >= visibleRect.left && objRight <= visibleRect.right &&
         objTop >= visibleRect.top && objBottom <= visibleRect.bottom;
}

/**
 * Combined check for cursor slot drops
 * Returns true if both cursor is over visible area AND objects will be fully visible
 */
export function canDropObjectsToPool(
  clientX: number,
  clientY: number,
  objects: TableObject[],
  poolPanelId: string,
  pixelsPerVU: number
): boolean {
  return isCursorOverVisiblePoolPanel(clientX, clientY, poolPanelId) &&
         areObjectsFullyVisible(clientX, clientY, objects, poolPanelId, pixelsPerVU);
}

/**
 * Combined check for single object drops
 * Returns true if both cursor is over visible area AND object will be fully visible
 */
export function canDropObjectToPool(
  clientX: number,
  clientY: number,
  obj: TableObject,
  poolPanelId: string,
  pixelsPerVU: number
): boolean {
  return isCursorOverVisiblePoolPanel(clientX, clientY, poolPanelId) &&
         isObjectFullyVisible(clientX, clientY, obj, poolPanelId, pixelsPerVU);
}
