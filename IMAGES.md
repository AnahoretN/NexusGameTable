# 🖼️ Image System Guide

## Overview

The image system consists of two complementary mechanisms:

1. **Image Path System** - Compact metadata storage for game saves
2. **Image Persistence** - IndexedDB storage for user-uploaded images

Together, they prevent `QuotaExceededError` and allow large numbers of images to persist across page reloads.

---

## 📦 Image Path System

### Compact Metadata Format

Replaces verbose image data with minimal metadata to save localStorage space.

#### Format Comparison

**Old Format** (100+ bytes per image):
```json
{"type":"blob","path":"blob:http://...","originalUrl":"blob:http://..."}
```

**New Format** (7-50 bytes per image):
```json
{"t":"b","o":"blob:http://..."}
```

#### Image Types

| Type Code | Description | Storage |
|-----------|-------------|---------|
| `t:"b"` | Blob URL | Temporary, 50 bytes |
| `t:"d"` | Data URL/base64 | Deleted, 7 bytes |
| `t:"u"` | External URL | Full URL saved |
| `t:"p"` | Pack URL | Pack reference saved |

### Storage Savings

For 150 cards:
- **Old way**: 150 × 100KB = 15MB+ → `QuotaExceededError` ❌
- **New way**: 150 × 50 bytes = 7.5KB → Easy fit ✅

### Limitations

⚠️ **Blob URLs** - May not restore (temporary)  
⚠️ **Data URLs** - Not restored (images will be empty)  
⚠️ **Browser restart** - Blob URLs disappear  

### Recommendations

1. **Large card sets** → Use external URLs or pack system
2. **Temporary games** → Can upload images (will disappear after restart)
3. **Permanent games** → Use packs or external URLs

---

## 💾 Image Persistence System

### Architecture

Three storage layers work together:

```
┌─────────────────┐
│  In-Memory      │ ← Actual base64 data during gameplay
│  (Runtime)      │
└────────┬────────┘
         │
         ↓ save/load
┌─────────────────┐
│  IndexedDB      │ ← Persistent image storage
│  (Persistent)   │   Survives reloads, gigabytes capacity
└────────┬────────┘
         │
         ↓ references
┌─────────────────┐
│  localStorage   │ ← Only img_ref://ID pointers
│  (Metadata)     │   Minimal usage, fast loading
└─────────────────┘
```

### Data Flow

#### Saving (Auto-save every 500ms)

```
User uploads image
    ↓
FilePickerInput → base64
    ↓
Object: { content: "data:image/png;base64,..." }
    ↓
Auto-save triggered
    ↓
extractImagesFromState()
    ├─ Generate ID: "img_1234567890_abc123"
    ├─ Replace base64 with: "img_ref://img_1234567890_abc123"
    └─ Build cache: { "img_1234567890_abc123": "data:..." }
    ↓
saveImageCacheToIDB(cache)
    └─ Store in IndexedDB (persistent)
    ↓
Save to localStorage (with img_ref:// references)
```

#### Loading (Page Reload)

```
Page loads
    ↓
Load from localStorage
    ↓
Check for image references (img_ref://)
    ↓
loadImageCacheFromIDB()
    └─ Retrieve cache from IndexedDB
    ↓
restoreImagesFromCache(savedState, cache)
    └─ Replace img_ref://ID with base64 data
    ↓
Add objects to game state (with restored images)
    ↓
Game continues with full image data
```

### API

#### IndexedDB Operations

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
// Returns: { count: 150, totalSize: 52428800 }
```

#### P2P Image Cache

```typescript
// Extract images, replace with refs
const { state, imageCache } = extractImagesFromState(state);

// Restore images from cache
const restoredState = restoreImagesFromCache(state, imageCache);

// Get only new images (not in existing cache)
const newImages = getNewImages(currentCache, existingCache);
```

### Limitations

| Limit | Value |
|-------|-------|
| **IndexedDB quota** | 50-80% of disk space |
| **Single image** | 50MB per image |
| **Base64 string** | 500MB (JS limitation) |
| **Browser support** | All modern browsers |

### Automatic Cleanup

Old images are automatically deleted after 30 days:

```typescript
// Run cleanup manually
await cleanOldImagesFromIDB(30); // 30 days
```

---

## 🔍 Debugging

### Console Logs

Look for these messages:

```
[ImageCache] Saved 5 images to IndexedDB
[ImageCache] Loaded 5 images from IndexedDB
[LOAD] Successfully restored images from IndexedDB
```

### DevTools Inspection

**Check IndexedDB:**
1. Open DevTools → Application → IndexedDB
2. Find `NexusGameTable_Images` database
3. Browse `cachedImages` store

**Check localStorage:**
1. Open DevTools → Application → Local Storage
2. Look for `img_ref://` strings in saved state

---

## 🐛 Troubleshooting

### Images not restoring after reload

**Check:**
1. ✅ IndexedDB has data (DevTools → Application → IndexedDB)
2. ✅ Console shows no errors
3. ✅ `extractImagesFromState` called during save
4. ✅ `loadImageCacheFromIDB` called during load

### Missing images after loading pack

**Note:** Pack images are handled separately:
- Managed by `packManager.ts`
- Stored in `.nexuspack` file
- Don't use IndexedDB

### localStorage full

**Not a problem!**
- IndexedDB is separate from localStorage
- Image data doesn't affect localStorage quota
- Only small `img_ref://` strings in localStorage

### Blob URLs not working

**Expected behavior:**
- Blob URLs are temporary by design
- They may not work after page reload
- Use external URLs or packs for permanent images

---

## 📚 Technical Details

### Files

- `utils/imagePathStorage.ts` - Path metadata system
- `utils/imageCache.ts` - IndexedDB operations
- `utils/gameStorage.ts` - Save/load orchestration

### Storage Version

- **Current version**: 7
- **Migration**: Automatic backward compatibility
- **Compression**: Maximum JSON metadata compression

### Performance

- **Save time**: ~100ms for 150 images
- **Load time**: ~200ms for 150 images
- **Storage overhead**: ~7.5KB for 150 refs (vs 15MB+ for full data)

---

## 🎯 Best Practices

### For Large Games

1. **Use Packs** - For 100+ cards
   - Persistent storage in `.nexuspack` files
   - No localStorage limits
   - Easy sharing

2. **External URLs** - For hosted images
   - No storage limits
   - Works across sessions
   - Requires internet connection

3. **IndexedDB** - For user uploads
   - Survives page reloads
   - Automatic cleanup
   - Up to gigabytes capacity

### For Small Games

1. **Direct uploads** - For < 50 images
   - Simple workflow
   - Survives reloads via IndexedDB
   - No setup required

2. **Blob URLs** - For temporary testing
   - Fast uploads
   - Won't persist (expected)
   - Good for prototyping

---

## 📚 Related Documentation

- [PACKS.md](../PACKS.md) - Pack system for large card sets
- [LARGE_IMAGES.md](../LARGE_IMAGES.md) - Handling large image files
- [CHANGELOG.md](../CHANGELOG.md) - Version history

---

## 🎉 Summary

The image system provides:

✅ **Compact saves** - 7.5KB vs 15MB+ for 150 images  
✅ **Persistent storage** - IndexedDB survives reloads  
✅ **Automatic cleanup** - Old images deleted after 30 days  
✅ **Backward compatible** - Old saves migrate automatically  
✅ **Performance** - Fast save/load operations  

Perfect for games with lots of custom content! 🚀
