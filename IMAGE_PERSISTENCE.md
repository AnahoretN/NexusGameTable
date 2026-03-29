# Image Persistence System

## Overview
The image persistence system allows user-uploaded images to survive page reloads by storing them in IndexedDB instead of localStorage.

## Architecture

### Storage Layers

1. **In-Memory** (runtime)
   - Objects contain actual base64 data URLs
   - Used during gameplay

2. **IndexedDB** (persistent)
   - Stores images with ID references
   - Survives page reloads
   - Can store gigabytes of data
   - Location: `NexusGameTable_Images` database

3. **localStorage** (metadata)
   - Stores only image references (img_ref://ID or "B"/"D")
   - Minimal storage usage
   - Fast loading

## Data Flow

### Saving (Auto-save every 500ms)

```
User uploads image
  ↓
FilePickerInput converts to base64
  ↓
Object stores: { content: "data:image/png;base64,..." }
  ↓
Auto-save triggered
  ↓
extractImagesFromState()
  ├─ Generates unique ID: "img_1234567890_abc123"
  ├─ Replaces base64 with: "img_ref://img_1234567890_abc123"
  └─ Builds cache: { "img_1234567890_abc123": "data:image/png;base64,..." }
  ↓
saveImageCacheToIDB(cache)
  └─ Stores in IndexedDB (persistent)
  ↓
convertImagesToPathMetadata()
  └─ Keeps img_ref:// unchanged
  ↓
Save to localStorage (with img_ref:// references)
```

### Loading (Page Reload)

```
Page loads
  ↓
Load from localStorage
  ↓
Check for image references (B, D, img_ref://)
  ↓
loadImageCacheFromIDB()
  └─ Retrieves cache from IndexedDB
  ↓
restoreImagesFromCache(savedState, cache)
  └─ Replaces img_ref://ID with base64 data
  ↓
Add objects to game state (with restored images)
  ↓
Game continues with full image data
```

## Key Functions

### IndexedDB Operations (utils/imageCache.ts)

```typescript
// Save image cache to IndexedDB
await saveImageCacheToIDB(imageCache);

// Load image cache from IndexedDB
const imageCache = await loadImageCacheFromIDB();

// Get specific image
const base64 = await getImageFromIDB(imageId);

// Clear all cached images
await clearImageCacheIDB();

// Clean old images (older than N days)
const deleted = await cleanOldImagesFromIDB(30);

// Get cache statistics
const info = await getIDBCacheInfo();
// { count: 150, totalSize: 52428800 }
```

### P2P Image Cache (utils/imageCache.ts)

```typescript
// Extract images from state, replace with refs
const { state, imageCache } = extractImagesFromState(state);

// Restore images from cache
const restoredState = restoreImagesFromCache(state, imageCache);

// Get only new images (not in existing cache)
const newImages = getNewImages(currentCache, existingCache);
```

## Limitations

- **IndexedDB quota**: Typically 50-80% of available disk space
- **Single image limit**: 50MB per image (configurable)
- **Base64 size limit**: 500MB string length (JavaScript limitation)
- **Browser support**: All modern browsers support IndexedDB

## Cleanup

Old images are automatically cleaned after 30 days:

```typescript
// Run cleanup manually
await cleanOldImagesFromIDB(30); // 30 days
```

## Debugging

Check browser console for:
```
[ImageCache] Saved 5 images to IndexedDB
[ImageCache] Loaded 5 images from IndexedDB
[LOAD] Successfully restored images from IndexedDB
```

Check IndexedDB in DevTools:
1. Open DevTools → Application → IndexedDB
2. Find `NexusGameTable_Images` database
3. Browse `cachedImages` store

## Troubleshooting

**Images not restoring after reload:**
1. Check IndexedDB has data (DevTools → Application → IndexedDB)
2. Check console for errors
3. Verify `extractImagesFromState` is called during save
4. Verify `loadImageCacheFromIDB` is called during load

**Missing images after loading pack:**
- Pack images are handled separately by packManager.ts
- Pack images don't use IndexedDB (stored in .nexuspack file)

**localStorage full:**
- IndexedDB is separate from localStorage
- Image data doesn't affect localStorage quota
- Only small img_ref:// strings stored in localStorage
