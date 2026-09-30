<div align="center">
  <h1>Nexus Game Table</h1>
  <p>Virtual game table for board games with P2P multiplayer</p>
  <img width="1200" height="686" alt="Nexus Game Table" src="https://res.cloudinary.com/dxxh6meej/image/upload/v1772083073/NEXSUS_cfte8v.webp" />
</div>

---

## 📋 Table of Contents

- [About](#about)
- [Features](#features)
- [Quick Start](#quick-start)
- [How to Play](#how-to-play)
- [For Developers](#for-developers)
- [Architecture](#architecture)
- [WebRTC Multiplayer](#webrtc-multiplayer)

---

## About

**Nexus Game Table** is a free virtual game table for board games with online multiplayer support. The application runs directly in the browser and uses P2P connections — no dedicated server required.

**Current version:** 0.3.1
**Status:** ✅ Production Ready

### Knowledge Graph

The project contains an integrated **graphify knowledge graph** for understanding the architecture:

```bash
# Graph report (statistics reflect the last graphify run):
graphify-out/GRAPH_REPORT.md

# For querying the graph:
graphify query "your question" --graph graphify-out/graph.json
```

---

## Features

| Feature | Description |
|-------------|----------|
| **Cards and Decks** | Create decks, shuffle, deal cards, various shapes and sizes |
| **Dice** | d4, d6, d8, d10, d12, d20 with roll logging, alternative values |
| **Tokens** | Custom tokens with shapes (circle, square, hexagon), state system |
| **Counters** | Digital counters for points/resources |
| **Boards** | Game boards with square/hexagonal grid, Nexus boards |
| **Drawing** | Marker, eraser, ruler, compass for drawing on the table |
| **Spinners** | Random selection from options |
| **Chat** | In-game communication between players |
| **Auto-save** | Automatic saving of game state |
| **P2P multiplayer** | Direct connections between players without server |

---

## Quick Start

### Requirements

- Node.js 18+ and npm

### Installation

```bash
# Clone the repository
git clone https://github.com/AnahoretN/NexusGameTable.git
cd NexusGameTable

# Install dependencies
npm install

# Run the application
npm run dev
```

The application will open at: **http://localhost:5177**

### Production Build

```bash
npm run build
npm run preview
```

---

## How to Play

### Creating a Game

1. Open the application — a local game is created automatically
2. Click the **Share** button in the right menu to get a link
3. Share the link with friends

### Joining a Game

1. Follow a link like: `https://example.com?hostId=...`
2. Enter your name
3. Click **Join**

### Basic Controls

| Action | Controls |
|----------|------------|
| Move object | Mouse drag |
| Pick up object | Shift + click |
| Drop object | Shift + click on target |
| Context menu | Right click |
| Zoom | Ctrl + mouse wheel (Ctrl +/−/0 to zoom/reset) |
| Pan | Ctrl + Drag |
| Normal cursor mode | Alt (hold) |
| Undo | Via the log viewer / context menu |

## For Developers

### Tech Stack

```
React 18.x + TypeScript
├── Vite (build)
├── PeerJS + Trystero + Iroh (P2P multiplayer with fallback)
├── Zustand (state management)
├── Lucide React (icons)
└── Tailwind CSS (styles)
```

### Project Structure

```
NexusGameTable/
├── components/
│   ├── Tabletop/              # Main game table (modular)
│   │   ├── TabletopRefactored.tsx   # Entry component
│   │   ├── TabletopBackground.tsx    # Background rendering
│   │   ├── TabletopEventHandlers.tsx # Event handling
│   │   ├── GameObjectsRenderer.tsx   # Table object rendering
│   │   ├── CardRenderer.tsx          # Card rendering
│   │   ├── TokenRenderer.tsx         # Token rendering
│   │   └── ...
│   ├── CharacterBlocks/       # Character blocks
│   ├── ContextMenu.tsx        # Context menu
│   ├── ObjectSettingsModal.tsx # Object settings (all tabs)
│   ├── HandPanelOptimized.tsx # Hand panel
│   ├── ToolsPanel.tsx         # Tools panel
│   ├── PoolPanel.tsx          # Pool panel (uses PoolTabletopOptimized)
│   └── UIObjectRendererOptimized.tsx # UI object rendering
├── store/
│   ├── contexts/              # React Context providers
│   │   ├── PlayerContext.tsx         # Player management
│   │   ├── ViewTransformContext.tsx  # Camera and zoom
│   │   └── UIContext.tsx             # Language, layers
│   ├── GameContext.tsx        # Game state (objects, dispatch)
│   ├── reducers/
│   │   └── appReducers.ts     # Modular reducers
│   ├── objectStore.ts         # Zustand store for objects
│   ├── gameActions.ts         # Action definitions
│   ├── gameState.ts           # State types
│   ├── p2p/                   # Networking helpers (batching, scheduling)
│   ├── usePeerConnection.ts   # WebRTC with fallback signaling
│   ├── useTrysteroConnection.ts / useIrohConnection.ts
│   ├── useManualConnection.ts # Manual signaling
│   └── useAutoSave.ts         # Auto-save
├── utils/
│   ├── contextMenuActions.ts  # Context menu handlers
│   ├── objectActionHandlers.ts # Object action handlers
│   ├── objectFactories.ts     # Object factories
│   ├── geometryUtils.ts       # Geometric calculations
│   ├── coordinateUtils.ts     # Coordinate transformations
│   ├── zIndexAllocator.ts     # Z-index allocation
│   ├── logger.ts              # Logging system
│   ├── memoryManager.ts       # Memory management
│   ├── performanceMonitor.ts # Performance monitoring
│   ├── webrtcOptimization.ts  # WebRTC optimization
│   └── assets/                # Asset management (cache, packs, IndexedDB)
├── hooks/
│   ├── useDragHandlers.ts     # Drag & Drop
│   ├── useGridSnapping.ts     # Grid snapping
│   ├── useLocalSettings.tsx   # Local (unsynced) settings
│   └── useObjectPinning.ts    # Object pinning
├── locales/                   # Translations (en is built-in default)
│   ├── ru.json
│   ├── be.json
│   ├── sr.json
│   └── uk.json
├── types.ts                   # TypeScript types
├── constants.ts               # Constants
└── graphify-out/              # Knowledge graph
    ├── GRAPH_REPORT.md        # Graph report
    ├── graph.json             # Graph data
    └── graph.html             # Visualization
```

### Key Communities (from graph)

| Community | Description |
|------------|----------|
| **Object Actions Handlers** | Object action handlers (`executeClickAction()`, `handleFlip()`) |
| **Object Settings & Translations** | Object settings and translations |
| **Player Context & Hooks** | Player management (`usePlayers()`, `useActivePlayer()`) |
| **Game Context & State** | Game state (`useGame()`) |
| **WebRTC & Networking** | P2P connections and synchronization |
| **Tabletop Core** | Main game table |
| **Drawing & Canvas** | Drawing tools |
| **Performance Monitoring** | FPS and optimization |

### God Nodes (most connected nodes, per last graphify run — regenerate the graph after major refactors)

1. `dispatch()` — central dispatcher
2. `executeClickAction()` — click handler
3. `MemoryManager` — memory optimization
4. `useUI()` — UI context
5. `DifferentialSyncManager` — state sync

---

## Architecture

### Context Architecture

Provider hierarchy:

```typescript
<LocalSettingsProvider>   // Local (unsynced) settings
  <ViewTransformProvider>  // Camera and zoom (local)
    <ToolSettingsProvider> // Active tool, marker/eraser settings
      <UIProvider>          // Language, layers
        <GameProvider>      // Game objects (synced)
          <PlayerProvider>  // Players (synced)
            <App />
```

### Zustand ObjectStore

Optimized object access:

```typescript
import { useObjectsData, useObjectActions } from './store/objectStore';

const objects = useObjectsData();           // Read-only, stable
const { updateObject, deleteObject } = useObjectActions(); // Actions, stable
```

### Action System

Main action types:

```typescript
// Objects
ADD_OBJECT
UPDATE_OBJECT
DELETE_OBJECT
CLONE_OBJECT
MOVE_OBJECT
ROTATE_OBJECT
TOGGLE_LOCK

// Cards
DRAW_CARD
PLAY_CARD
FLIP_CARD
RETURN_TO_DECK
SHUFFLE_DECK

// UI
CREATE_PANEL
CREATE_WINDOW
CLOSE_UI_OBJECT

// Layers
MOVE_OBJECT_TO_HYPERSCALE_LAYER
ADD_HYPERSCALE_LAYER
UPDATE_HYPERSCALE_LAYER

// Undo
UNDO_MARKER
UNDO_GENERAL
```

### Game Objects

#### Object Types

```typescript
enum ItemType {
  TOKEN = 'TOKEN',
  TOKEN_TYPE = 'TOKEN_TYPE',  // Token archetype
  CARD = 'CARD',
  DECK = 'DECK',
  DICE_OBJECT = 'DICE_OBJECT',
  COUNTER = 'COUNTER',
  BOARD = 'BOARD',
  NEXUS_BOARD = 'NEXUS_BOARD',  // Connected hexagonal cells
  NEXUS_CELL = 'NEXUS_CELL',    // Single Nexus board cell
  BATTLEFIELD_CELL = 'BATTLEFIELD_CELL',
  RANDOMIZER = 'RANDOMIZER',
  PANEL = 'PANEL',
  WINDOW = 'WINDOW',
  DRAWING = 'DRAWING',
  EFFECT_TEMPLATE = 'EFFECT_TEMPLATE',
}
```

#### Card Shapes

| Shape | Size |
|-------|--------|
| POKER | 120×168 |
| BRIDGE | 108×144 |
| MINI_US | 74×106 |
| SQUARE | 168×168 |
| HEX | Variable |

#### Card Locations

```
TABLE   → On table
DECK    → In deck
HAND    → In hand
PILE    → In discard
CURSOR_SLOT → In cursor
```

### Hyperscale Layers

Layer system above regular z-index:

```typescript
interface HyperscaleLayer {
  id: string;
  name: string;
  minZIndex: number;
  maxZIndex: number;
  color: string;
  playerCanSelect: boolean;
  playerCanView: boolean;
  individualObjects: boolean;  // Local positions for each player
  zoomEnabled: boolean;
  order: number;
}
```

Preset layers:
- **Boards** (1-1000) — game boards
- **Cards** (1001-3000) — cards
- **Tokens** (3001-6000) — tokens
- **Drawings** (6001-7000) — drawings
- **Interface** (9001-10000) — interface

### Token State System

Tokens can have alternative states:

```typescript
interface TokenState {
  id: string;
  name: string;  // "Wounded", "Poisoned", etc.
  content?: string;
  color?: string;
  shape?: TokenShape;
  // ... other visual properties
}
```

### Token Slider System

Tokens can have numeric sliders (HP, MP, etc.):

```typescript
interface TokenSlider {
  id: string;
  name: string;
  value: number;
  maxValue: number;
  minValue?: number;
  color?: string;
  icon?: string;
}
```

---

## WebRTC Multiplayer

### Fallback Signaling System

Automatic switching between signaling methods:

#### 1. PeerJS Cloud Servers (primary)

```
0.peerjs.com
1.peerjs.com
2.peerjs.com
```

#### 2. Community Servers (self-hosted)

Added to `COMMUNITY_SERVERS` in `usePeerConnection.ts`

#### 3. Trystero Torrent Trackers (fallback)

```
wss://tracker.btorrent.xyz
wss://tracker.openwebtorrent.com
wss://tracker.fastcast.nz
wss://tracker.files.fm:443/announce
```

### Adding a Community Server

```typescript
// In store/usePeerConnection.ts

const COMMUNITY_SERVERS = [
  {
    host: 'your-server.com',
    port: 443,
    secure: true,
    path: '/peerjs',
    name: 'My Server'
  },
];
```

### Deploying Your Own PeerJS Server

**Quick start (Heroku/Railway/Render):**

```bash
# 1. Create a folder for the server
mkdir nexus-signaling && cd nexus-signaling

# 2. Initialize the project
npm init -y
npm install peer

# 3. Create server.js
cat > server.js << 'EOF'
const { PeerServer } = require('peer');

const peerServer = PeerServer({
  port: process.env.PORT || 443,
  path: '/peerjs',
});

peerServer.on('connection', (client) => {
  console.log(`Client connected: ${client.getId()}`);
});

console.log('PeerJS server running');
EOF

# 4. Deploy
heroku create your-signaling-server
git push heroku main
```

### Host/Guest Model

| Role | Description |
|-----|----------|
| Host | Creates room, broadcasts state |
| Guest | Connects, receives state |

### Diagnostics

```javascript
// In browser console
nexusP2PDebug.getDiagnostics();
```

---

## Creating a New Object

### 1. Add type in types.ts

```typescript
export enum ItemType {
  TOKEN = 'token',
  CARD = 'card',
  MY_NEW_TYPE = 'my_new_type'
}

export interface MyNewType extends GameItem {
  type: ItemType.MY_NEW_TYPE
  customProperty: string
}
```

### 2. Add reducer

```typescript
// store/GameContext.tsx (main reducer) or store/reducers/appReducers.ts
case 'CUSTOM_ACTION': {
  const obj = state.objects[action.payload.objectId];
  if (!obj || obj.type !== ItemType.MY_NEW_TYPE) return state;
  return {
    ...state,
    objects: {
      ...state.objects,
      [action.payload.objectId]: { ...obj, customProperty: action.payload.value }
    }
  }
}
```

### 3. Create rendering component

```typescript
// components/MyNewTypeRenderer.tsx
export const MyNewTypeRenderer: React.FC<{ obj: MyNewType }> = ({ obj }) => {
  return (
    <div style={{ position: 'absolute', left: obj.x, top: obj.y }}>
      {/* Rendering */}
    </div>
  )
}
```

---

## Adding Action to Context Menu

### 1. Define action

```typescript
export type ContextAction =
  | 'flip' | 'clone' | 'delete'
  | 'my_custom_action'
```

### 2. Handle in utils/contextMenuActions.ts

```typescript
case 'my_custom_action':
  dispatch({ type: 'CUSTOM_ACTION', payload: { id: object.id } })
  break
```

---

## Performance Optimization

### React.memo

```typescript
export const MyComponent = React.memo<MyComponentProps>(
  ({ prop1, prop2 }) => {
    // Rendering
  },
  (prevProps, nextProps) => {
    return prevProps.prop1 === nextProps.prop1
  }
)
```

### useCallback/useMemo

```typescript
const handleClick = useCallback((id: string) => {
  dispatch({ type: 'SOME_ACTION', payload: { id } })
}, [dispatch])

const sortedObjects = useMemo(() => {
  return Object.values(objects).sort((a, b) => a.zIndex - b.zIndex)
}, [objects])
```

### Logging System

```typescript
import { logger } from './utils/logger';

logger.log('Message', data);
logger.error('Error', error);
logger.warn('Warning');
logger.debug('Debug information');
```

---

## Constants

### Object Sizes (`constants.ts`)

```typescript
CARD_WIDTH = 120    // vu
TOKEN_SIZE = 80     // vu
DEFAULT_DICE_SIZE = 60 // vu
```

### Z-index

Z-index values are not fixed constants — they are allocated dynamically per object by `utils/zIndexAllocator.ts` (with defragmentation and hyperslice support).

---

## Translations

### Adding a New Key

```json
// locales/en.json
{
  "my_new_key": "My new text"
}

// locales/ru.json
{
  "my_new_key": "Мой новый текст"
}
```

### Supported Languages

- `en` - English
- `ru` - Russian
- `be` - Belarusian
- `sr` - Serbian
- `uk` - Ukrainian

---

## Code Conventions

### Naming

- PascalCase for components: `MyComponent`
- camelCase for hooks: `useMyHook`
- UPPER_CASE for constants: `MY_CONSTANT`

### Component Structure

```typescript
// 1. Imports
import React from 'react'

// 2. Types/interfaces
interface MyComponentProps {
  prop1: string
}

// 3. Component
export const MyComponent: React.FC<MyComponentProps> = ({ prop1 }) => {
  // 3.1 Hooks
  const [state, setState] = useState(null)

  // 3.2 Handlers
  const handleClick = useCallback(() => { ... }, [])

  // 3.3 Effects
  useEffect(() => { ... }, [])

  // 3.4 Render
  return <div>...</div>
}
```

---

## Working with CHANGELOG.md

### ⚠️ Important Rules

**STRICTLY FORBIDDEN**:
- ❌ Adding new versions without explicit request
- ❌ Changing the current version number

**ALLOWED**:
- ✅ Updating current version content
- ✅ Adding descriptions of new features
- ✅ Fixing typos

---

## Useful Utilities

### GeometryUtils

```typescript
import { getDistance, getAngle, isPointInRect } from './utils/geometryUtils'

const dist = getDistance(x1, y1, x2, y2)
const angle = getAngle(x1, y1, x2, y2)
const inside = isPointInRect(pointX, pointY, rectX, rectY, rectW, rectH)
```

### ShapeUtils

```typescript
import { getCardShapeStyles, getTokenShapeStyles } from './utils/shapeUtils'

const styles = getCardShapeStyles(CardShape.HEX, CardOrientation.VERTICAL)
```

---

## Working with Multiplayer

### Local Actions

```typescript
dispatch({
  type: 'UPDATE_VIEW_TRANSFORM',
  payload: { zoom: 1.5 },
  _localOnly: true  // Do not send over network
})
```

### Filtering During Broadcast

```typescript
const stateForBroadcast = {
  ...state,
  objects: Object.entries(state.objects)
    .filter(([id, obj]) =>
      !(obj.type === ItemType.WINDOW && obj.ownerId)
    )
};
```

---

## Documentation

### Main Documentation

- 📖 [README.md](./README.md) — this file
- 🔒 [SECURITY.md](./SECURITY.md) — security policy
- 📋 [CHANGELOG.md](./CHANGELOG.md) — version history
- 🚀 [QUICK_START.md](./QUICK_START.md) — quick start guide (Russian)
- 📗 [store/p2p/README.md](./store/p2p/README.md) — networking layer

### Removed Documents (merged into this README)

- ~~DEVELOPER_GUIDE.md~~ — included in "For Developers" section (deleted)
- ~~DOCUMENTATION.md~~ — included in "Features" and "How to Play" sections (deleted)
- ~~FALLBACK_SIGNALING.md~~ — included in "WebRTC Multiplayer" section

---

## License

MIT License

---

<div align="center">
  <p>Made with ❤️ for board game lovers</p>
  <a href="https://github.com/AnahoretN/NexusGameTable/issues">Report Issue</a> •
  <a href="https://github.com/AnahoretN/NexusGameTable/discussions">Discussions</a>
</div>
