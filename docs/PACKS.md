# Pack System Documentation

## Overview

The Pack system allows you to save and share complete game states along with all custom images in a single `.nexuspack` file (ZIP archive).

## Features

- **Single File Export**: All game data and images combined in one ZIP archive
- **Automatic Image Extraction**: Extracts all base64 images from objects
- **Compression**: Images are stored in their original binary format for smaller file size
- **Metadata**: Packs include name, description, timestamp, and content statistics
- **Cross-Platform**: Works on all platforms supported by Nexus Game Table

## Technical Details

### Pack Structure

A `.nexuspack` file is a ZIP archive containing:

```
nexus_pack_timestamp.nexuspack
├── manifest.json          # Pack metadata
├── save.json             # Game state (with image references)
└── images/               # Extracted images
    ├── image0.png
    ├── image1.jpg
    └── ...
```

### manifest.json

```json
{
  "version": 1,
  "name": "My Adventure Pack",
  "description": "A custom adventure with custom tokens",
  "timestamp": 1711459200000,
  "created": "2026-03-26T12:00:00.000Z",
  "images": {
    "count": 15,
    "totalSize": 5242880
  },
  "save": {
    "objectsCount": 42,
    "playersCount": 4
  }
}
```

### Image Processing

1. **Extraction**: All base64 images are extracted from objects
2. **Deduplication**: Duplicate images are stored only once
3. **Referencing**: Original base64 URLs are replaced with `pack://images/filename.ext` references
4. **Restoration**: When loading, references are converted back to base64

## API

### Creating a Pack

```typescript
import { createPack } from './utils/packManager';

await createPack(
  gameState,
  "My Adventure Pack",
  "A custom adventure with custom tokens"
);
```

### Loading a Pack

```typescript
import { loadPack } from './utils/packManager';

const fileInput = document.querySelector('input[type="file"]');
const file = fileInput.files[0];

const packData = await loadPack(file);
// Returns Partial<GameState> with restored images
```

### Getting Pack Info

```typescript
import { getPackInfo } from './utils/packManager';

const info = await getPackInfo(file);
// Returns PackManifest with metadata without loading full pack
```

## Supported Image Fields

The pack system extracts images from these object fields:

- `content` - Main image/content URL
- `alternativeBack.url` - Alternative card back
- `spriteConfig.spriteUrl` - Sprite sheet URL
- `spriteConfig.cardBackUrl` - Card back sprite URL
- `frontFaceUrl` - Custom card front
- `backFaceUrl` - Custom card back

## Usage

### Saving as Pack

1. Click the purple "Save as Pack" button in the main menu
2. Enter a pack name (required)
3. Optionally add a description
4. Click "Create Pack"
5. The pack will be downloaded automatically

### Loading a Pack

1. Click the purple "Load Pack" button in the main menu
2. Select a `.nexuspack` file
3. The game state will be restored with all images

## Implementation Details

- **File Format**: ZIP archive with `.nexuspack` extension
- **Libraries**: JSZip for ZIP creation/loading, file-saver for downloads
- **Max Size**: Limited by browser memory and storage
- **Version**: Current pack format version is 1

## Error Handling

The system handles various error scenarios:

- Invalid pack file structure
- Missing manifest or save files
- Corrupted image data
- Version mismatches (with warnings)

## Future Enhancements

Potential improvements for future versions:

- Thumbnail generation for preview
- Incremental pack updates
- Pack encryption
- Cloud storage integration
- Pack marketplace/sharing
