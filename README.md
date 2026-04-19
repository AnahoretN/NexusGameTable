<div align="center">
  <h1>Nexus Game Table</h1>
  <p>Virtual tabletop for board games with multiplayer support</p>
  <img width="1200" height="686" alt="Nexus Game Table" src="https://res.cloudinary.com/dxxh6meej/image/upload/v1772083073/NEXSUS_cfte8v.webp" />
</div>

## 🎉 Latest Update: Version 0.1.9

**⚠️ Performance Optimization Status:** Partial infrastructure implementation with critical gaps

- **Infrastructure**: 70% of optimization systems created (virtualization, code-splitting, memory management)
- **Adoption**: 30% actually used in code
- **Status**: See [PERFORMANCE_STATUS.md](./PERFORMANCE_STATUS.md) for detailed analysis
- **Priority**: Tabletop.tsx refactoring (8,289 lines), Card component memoization, virtualization integration

## About

**Nexus Game Table** is a free virtual tabletop that allows you to play board games online with friends. The app runs directly in your browser and uses P2P connections for multiplayer — no dedicated server required.

**Current Version:** 0.1.9 (2026-04-17)
**Status:** ✅ Production Ready - All major components migrated to new architecture

### Features

| 🎴 Cards & Decks | Create decks, shuffle, draw cards, various shapes and sizes |
|-----------------|-------------------------------------------------------------|
| 🎲 Dice | d4, d6, d8, d10, d12, d20 with roll logging |
| 🪙 Tokens | Custom tokens with different shapes and colors |
| 🔢 Counters | For scores, resources, and other numeric values |
| 🎨 Drawing | Marker, eraser, ruler, compass for drawing on the table |
| 📋 Boards | Game boards with square or hex grid |
| 🎰 Spinners | Random selection from options |
| 💬 Chat | In-game messaging between players |
| 💾 Auto-save | Game state saves automatically |

## Quick Start

### Requirements

- Node.js 18+ and npm

### Installation

```bash
# Clone the repository
git clone https://github.com/your-repo/nexus-game-table.git
cd nexus-game-table

# Install dependencies
npm install

# Run the app
npm run dev
```

The app will open at: **http://localhost:5177**

### Production Build

```bash
npm run build
npm run preview
```

## How to Play

### Hosting a Game

1. Open the app — a local game is created automatically
2. Click the **Share** button in the right menu to get a link
3. Share the link with friends

### Joining a Game

1. Follow a link like: `https://example.com?hostId=...`
2. Enter your name
3. Click **Join**

### Basic Controls

| Action | Control |
|--------|---------|
| Move object | Drag with mouse |
| Pick up object | Shift + click |
| Drop object | Shift + click on target |
| Context menu | Right click |
| Zoom | Mouse wheel |
| Pan | Space + Drag or middle mouse button |
| Undo | Ctrl + Z |

### Drawing Tools

| Key | Tool |
|-----|------|
| M | Marker |
| E | Eraser |
| R | Ruler |
| C | Compass |
| N | None |

## 🏗️ Architecture & Performance

### Performance Status

⚠️ **Current State:** Partial optimization implementation with critical gaps

**Implemented Infrastructure:**
- ✅ Virtualization system (VirtualizedTokensPanel, VirtualizedHandList, VirtualizedObjectList)
- ✅ Code splitting infrastructure (LazyComponents.tsx with 18 lazy components)
- ✅ WebRTC optimization (throttling, differential sync)
- ✅ Memory management (MemoryManager, image cache limits)
- ✅ Zustand store with optimized selectors
- ✅ New context system (PlayerContext v2, ViewTransformContext v2, UIContext v1)

**Actual Usage:**
- ⚠️ 30% adoption rate - most optimizations created but not actively used
- ❌ Tabletop.tsx remains monolithic (8,289 lines)
- ❌ Critical components lack memoization (Card, CharacterPanel, etc.)
- ❌ Virtualization not integrated in main components

**See [PERFORMANCE_STATUS.md](./PERFORMANCE_STATUS.md) for complete analysis**

### Available Contexts

**📦 Modular Context System (Partially Adopted):**
- **`PlayerContext`** - Player management, active player, permissions
  - `usePlayers()` - Get all players
  - `useActivePlayer()` - Get current active player  
  - `useIsGM()` - Check if current user is GM

**`ViewTransformContext`** - Camera and view transformations
- `useViewTransform()` - Get view transform state
- `useZoom()` - Get/set zoom level
- `useOffset()` - Get/set camera offset

**`UIContext`** - Language, layers, panel settings
- `useLanguage()` - Get/set application language
- `useHyperscaleLayers()` - Get layer configuration
- `useSelectedLayers()` - Get currently selected layers

**Usage Example:**
```typescript
import { usePlayers, useLanguage, useViewTransform } from './store/contexts';

function MyComponent() {
  const players = usePlayers();
  const language = useLanguage();
  const { zoom } = useViewTransform();
  
  return <div>{/* ... */}</div>;
}
```

### Zustand Store (Partially Adopted)

**Available Selectors:**
- `useObjectById(id)` - Get specific object
- `useCards()`, `useTokens()`, `useDecks()` - Get objects by type
- `useVisibleObjects()` - Get visible objects only
- `useObjectsOnTable()` - Get table objects

**Adoption:** 10/100+ components migrated

## Project Structure

```
NexusGameTable/
├── components/          # React components
│   ├── Tabletop.tsx    # Main game table (8,289 lines - needs refactoring)
│   ├── MainMenuContent.tsx   # Main menu
│   ├── HandPanelOptimized.tsx   # Player hand panel
│   ├── ToolsPanel.tsx  # Tools panel
│   ├── Virtualized*.tsx # Virtualization components (created, underutilized)
│   └── ...
├── store/              # State management
│   ├── GameContext.tsx # Main context (still monolithic)
│   ├── contexts/       # Modular contexts (partially adopted)
│   │   ├── PlayerContext.tsx    # Player management v2
│   │   ├── ViewTransformContext.tsx # Camera & zoom
│   │   └── UIContext.tsx        # Language, layers
│   ├── objectStore.ts   # Zustand store (10% adoption)
│   └── usePeerConnection.ts # P2P connection
├── utils/              # Utilities
│   ├── webrtcOptimization.ts # WebRTC optimization ✅
│   ├── memoryManager.ts     # Memory management ✅
│   ├── performanceMonitor.ts # Performance monitoring
│   └── ...
├── hooks/              # Custom React hooks
├── types.ts            # TypeScript types
├── constants.ts        # Constants
├── PERFORMANCE_STATUS.md  # 📊 Complete performance analysis
└── translations.ts     # Translations (EN/RU)
```

## 🎯 Performance Optimization Status

**Current Status:** ⚠️ Infrastructure created, but critical gaps remain

### What's Implemented (Infrastructure)
- ✅ **Virtualization System** — VirtualizedTokensPanel, VirtualizedHandList, VirtualizedObjectList created
- ✅ **Code Splitting** — LazyComponents.tsx with 18 lazy components
- ✅ **WebRTC Optimization** — Throttling, differential sync implemented
- ✅ **Memory Management** — MemoryManager, image cache limits active
- ✅ **Zustand Store** — Optimized selectors available
- ✅ **New Contexts** — PlayerContext v2, ViewTransformContext v2, UIContext v1

### What's Missing (Adoption)
- ❌ **Tabletop.tsx** — Still monolithic (8,289 lines)
- ❌ **Card Component** — No memoization (critical)
- ❌ **Virtualization** — Not integrated in main components
- ❌ **Lazy Loading** — Not activated in App.tsx
- ❌ **Context Migration** — Only 20% components migrated

### Actual Performance Impact
- ⚠️ **30%** adoption rate means most benefits not realized
- 🎯 **80-90% potential improvement** if gaps addressed
- 📊 See [PERFORMANCE_STATUS.md](./PERFORMANCE_STATUS.md) for complete analysis

### Developer Resources

- 📊 [Performance Status](./PERFORMANCE_STATUS.md) — Complete analysis of optimizations and gaps
- 🔧 [Developer Guide](./DEVELOPER_GUIDE.md) — Contributing to the project
- 📖 [Full Documentation](./DOCUMENTATION.md) — Complete description of all mechanics

## Tech Stack

- **React 18** — UI framework
- **TypeScript** — Type safety
- **Vite** — Build tool
- **PeerJS** — WebRTC multiplayer
- **Lucide React** — Icons

## Documentation

### 📚 User Guides
- 📖 [Full Documentation](./DOCUMENTATION.md) — complete description of all mechanics
- 🚀 [Quick Start](./QUICK_START.md) — short guide for players
- 📋 [Changelog](./CHANGELOG.md) — version history and new features

### 📖 Features & Systems
- 🎴 [Pool Panels](./docs/POOL_PANELS.md) — separate game spaces per tab
- 🖼️ [Image System](./docs/IMAGES.md) — image persistence and storage
- 📦 [Packs](./docs/PACKS.md) — card packs for large decks
- 🗺️ [Game Space Architecture](./docs/GAME_SPACE_ARCHITECTURE.md) — world layout and coordinates

### 👨‍💻 Developer Resources
- 🔧 [Developer Guide](./DEVELOPER_GUIDE.md) — contributing to the project
- 🔄 [Refactoring Guide](./docs/REFACTORING_GUIDE.md) — code organization patterns
- 🖱️ [Drag & Drop](./docs/DRAG_DROP_POOL_PANELS.md) — drag-drop system technical details

### 🏗️ Architecture & Performance
- 📊 [Performance Status](./PERFORMANCE_STATUS.md) — complete optimization analysis and gaps
- 🔧 [Developer Guide](./DEVELOPER_GUIDE.md) — contributing to the project
- 📖 [Full Documentation](./DOCUMENTATION.md) — complete feature documentation

## Multiplayer

The app uses **Peer.js** for P2P connections directly between players:

- **Host** — creates a room, stores game state, broadcasts changes
- **Guest** — connects to host, receives state, sends actions

No dedicated server required.

## Languages

- 🇬🇧 English
- 🇷🇺 Русский

Switch language: **Settings** → **Language**

## Roadmap

- [ ] Audio support for players
- [ ] More game object templates
- [ ] Import/export game state to file
- [ ] Visual deck builder
- [ ] 3D object support
- [ ] Game recording and playback

## License

MIT License — see [LICENSE](./LICENSE) file

## Credits

- [PeerJS](https://peerjs.com/) — P2P library for WebRTC
- [Lucide](https://lucide.dev/) — Icon library
- [Vite](https://vitejs.dev/) — Frontend build tool

---

<div align="center">
  <p>Made with ❤️ for board game lovers</p>
  <a href="https://github.com/your-repo/nexus-game-table/issues">Report Issue</a> •
  <a href="https://github.com/your-repo/nexus-game-table/discussions">Discussions</a>
</div>
о