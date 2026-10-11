
/**
 * Reducer for ADD_PACK_TO_GAME: adds pack objects to the current game state
 * without replacing existing objects, generating new IDs for conflicting
 * objects and updating internal references.
 *
 * (The other reducers that used to live here were dead code — GameContext
 * implements its own inline reducers — and were removed.)
 */

export function addPackToGameReducer(state: any, action: any): any {
  if (action.type !== 'ADD_PACK_TO_GAME') return state;

  const packData = action.payload;
  const existingObjects = state.objects || {};
  const packObjects = packData.objects || {};

  // Track ID mappings for conflicts (old ID -> new ID)
  const idMappings = new Map<string, string>();

  // Every ID already claimed in the CURRENT game — objects, dice groups and
  // drawing layers. One registry for all domains: a pack object/group/layer
  // colliding with any existing ID gets a unique one. Pack-internal duplicates
  // resolve naturally — the first claimant keeps the original, later ones are
  // renamed (generateUniqueId adds every resolved ID to the registry).
  const takenIds = new Set<string>([
    ...Object.keys(existingObjects),
    ...(state.diceGroups || []).map((g: any) => g.id),
    ...((state.drawings?.layers || []) as any[]).map(l => l.id),
  ]);

  // Helper to generate a unique ID
  const generateUniqueId = (originalId: string): string => {
    if (!takenIds.has(originalId)) {
      takenIds.add(originalId);
      return originalId; // No conflict, use original ID
    }
    // Generate new ID with suffix
    let counter = 1;
    let newId: string;
    do {
      newId = `${originalId}_pack${counter}`;
      counter++;
    } while (takenIds.has(newId));
    takenIds.add(newId);
    return newId;
  };

  // Helper to update object IDs and references recursively
  const updateObjectReferences = (obj: any, idMap: Map<string, string>): any => {
    if (typeof obj !== 'object' || obj === null) return obj;

    // Handle arrays
    if (Array.isArray(obj)) {
      return obj.map(item => updateObjectReferences(item, idMap));
    }

    const updated: any = { ...obj };

    // Fields that may contain object IDs that need remapping
    const idFields = [
      'id', 'deckId', 'archetypeId', 'nexusBoardId',
      'panelId', 'windowId', 'targetObjectId'
    ];

    // Array fields containing IDs
    const arrayIdFields = [
      'cardIds', 'baseCardIds', 'players', 'cells',
      'selectedHyperscaleLayerIds', 'hyperscaleLayers'
    ];

    // Update single ID fields
    for (const field of idFields) {
      if (updated[field] && idMap.has(updated[field])) {
        updated[field] = idMap.get(updated[field]);
      }
    }

    // Update array ID fields
    for (const field of arrayIdFields) {
      if (updated[field] && Array.isArray(updated[field])) {
        updated[field] = updated[field].map((id: string) =>
          idMap.has(id) ? idMap.get(id)! : id
        );
      }
    }

    // Update nested objects recursively
    for (const key of Object.keys(updated)) {
      if (typeof updated[key] === 'object' && updated[key] !== null) {
        // Skip arrays (already handled)
        if (!Array.isArray(updated[key])) {
          updated[key] = updateObjectReferences(updated[key], idMap);
        }
      }
    }

    return updated;
  };

  // First pass: determine which objects need new IDs
  for (const [id, _obj] of Object.entries(packObjects)) {
    if (existingObjects[id]) {
      const newId = generateUniqueId(id);
      idMappings.set(id, newId);
    }
  }

  // Second pass: create updated objects with new IDs and updated references
  const mergedObjects: Record<string, any> = { ...existingObjects };

  for (const [id, obj] of Object.entries(packObjects)) {
    const finalId = idMappings.get(id) || id;
    const updatedObj = updateObjectReferences(obj, idMappings);
    updatedObj.id = finalId;
    mergedObjects[finalId] = updatedObj;
  }

  // Merge dice groups from pack (IDs deduplicated against the shared registry)
  const existingDiceGroups = state.diceGroups || [];
  const packDiceGroups = packData.diceGroups || [];
  const mergedDiceGroups = [...existingDiceGroups];
  const diceGroupIdMap = new Map<string, string>();

  for (const group of packDiceGroups) {
    const uniqueId = generateUniqueId(group.id);
    diceGroupIdMap.set(group.id, uniqueId);
    mergedDiceGroups.push({ ...group, id: uniqueId });
  }

  // Update dice group references in objects
  for (const [id, obj] of Object.entries(mergedObjects)) {
    if (obj.diceGroupId && diceGroupIdMap.has(obj.diceGroupId)) {
      mergedObjects[id] = { ...obj, diceGroupId: diceGroupIdMap.get(obj.diceGroupId) };
    }
  }

  // Merge drawings from pack (drawings is DrawingData with layers array)
  const existingDrawings = state.drawings || { layers: [] };
  const packDrawings = packData.drawings || { layers: [] };
  const existingLayers = existingDrawings.layers || [];
  const packLayers = packDrawings.layers || [];
  const mergedLayers = [...existingLayers];

  for (const layer of packLayers) {
    const uniqueId = generateUniqueId(layer.id);
    mergedLayers.push({ ...layer, id: uniqueId });
  }

  return {
    ...state,
    objects: mergedObjects,
    diceGroups: mergedDiceGroups,
    drawings: {
      ...existingDrawings,
      layers: mergedLayers
    },
    // Keep existing session settings, don't replace with pack's
    sessionId: state.sessionId,
    players: state.players,
    activePlayerId: state.activePlayerId,
    viewTransform: state.viewTransform,
    // Merge hyperscale layers
    hyperscaleLayers: mergeHyperscaleLayers(state.hyperscaleLayers || [], packData.hyperscaleLayers || []),
    selectedHyperscaleLayerIds: state.selectedHyperscaleLayerIds || [],
  };
}

/**
 * Helper to merge hyperscale layers, avoiding ID conflicts
 */
function mergeHyperscaleLayers(existing: any[], packLayers: any[]): any[] {
  const result = [...existing];
  const existingIds = new Set(existing.map(l => l.id));

  for (const layer of packLayers) {
    if (!existingIds.has(layer.id)) {
      result.push(layer);
    }
  }

  return result;
}
