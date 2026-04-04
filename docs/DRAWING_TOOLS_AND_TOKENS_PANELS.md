# Drawing Tools and Tokens Panels

## Overview

Two new modular panels have been added to Nexus Game Table:

1. **Drawing Tools Panel** (`PanelType.DRAWING_TOOLS`) - Panel for drawing tools
2. **Tokens Panel** (`PanelType.TOKENS`) - Panel for quick access to tokens

## Features

### Drawing Tools Panel

- **Tools Available**: Cursor, Marker, Eraser, Ruler, Compass
- **Marker Settings**: Color picker and thickness slider
- **Collapsible**: Can be collapsed to a slim vertical bar
- **Movable**: Can be moved via Shift+drag
- **Pinnable**: Can be pinned to viewport
- **Sync**: Syncs tool state across all components via custom events

### Tokens Panel

- **Token Archetypes**: Displays all token archetypes from the game
- **Drag & Drop**: Click or drag tokens to add them to cursor slot
- **Settings Access**: Settings button for each token archetype
- **Collapsible**: Can be collapsed to a slim vertical bar
- **Movable**: Can be moved via Shift+drag
- **Pinnable**: Can be pinned to viewport

## Usage

### Creating Panels

1. Open the Main Menu (right side)
2. Go to the "Panels" tab
3. Click on "Drawing Tools Panel" or "Tokens Panel"
4. The panel will appear on the game board

### Panel Controls

- **Move**: Hold Shift and drag the panel
- **Collapse/Expand**: Click the collapse button in panel header
- **Pin/Unpin**: Use the pin button to pin/unpin to viewport
- **Close**: Use the X button to close the panel

### Drawing Tools Panel

1. Select a tool from the tool grid
2. When Marker is selected, adjust color and thickness
3. Tools sync automatically with other components

### Tokens Panel

1. Click on a token to add it to cursor slot
2. Drag token to position and place on tabletop
3. Click settings icon to configure token archetype

## Technical Details

### Components

- **DrawingToolsPanel**: `components/DrawingToolsPanel.tsx`
- **TokensPanel**: `components/TokensPanel.tsx`

### Types

Added to `PanelType` enum in `types.ts`:
```typescript
DRAWING_TOOLS = 'DRAWING_TOOLS',
TOKENS = 'TOKENS',
```

### Event System

Both panels use custom events for state synchronization:

**Drawing Tools:**
- `drawing-tool-changed`: Fired when tool changes
- `drawing-tool-sync`: Sync tool state
- `drawing-tool-request`: Request current tool state
- `marker-settings-changed`: Fired when marker settings change
- `marker-settings-sync`: Sync marker settings
- `marker-settings-request`: Request current marker settings

**Tokens:**
- `add-token-to-cursor-slot`: Add token to cursor slot
- `drop-cursor-slot-at-position`: Drop token at position

### Translations

Added translations for all supported languages:
- English (en)
- Russian (ru)
- Belarusian (be)
- Ukrainian (uk)
- Serbian (sr)

## Integration

The panels are fully integrated with:
- UIObjectRenderer for rendering
- MainMenuContent for creation
- GameContext for state management
- Translation system for localization

## Future Enhancements

Possible improvements:
- Add custom tool presets
- Token categories/filtering
- Quick tool switching via keyboard shortcuts
- Token search functionality
