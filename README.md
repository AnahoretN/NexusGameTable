<div align="center">
  <h1>Nexus Game Table</h1>
  <p>Virtual tabletop for board games with multiplayer support</p>
  <img width="1200" height="686" alt="Nexus Game Table" src="https://res.cloudinary.com/dxxh6meej/image/upload/v1772083073/NEXSUS_cfte8v.webp" />
</div>

## About

**Nexus Game Table** is a free virtual tabletop that allows you to play board games online with friends. The app runs directly in your browser and uses P2P connections for multiplayer — no dedicated server required.

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

## Project Structure

```
NexusGameTable/
├── components/          # React components
│   ├── Tabletop.tsx    # Main game table
│   ├── MainMenuContent.tsx   # Main menu
│   ├── HandPanel.tsx   # Player hand panel
│   ├── ToolsPanel.tsx  # Tools panel
│   └── ...
├── store/              # State management
│   ├── GameContext.tsx # Main context
│   ├── gameState.ts    # State types
│   ├── gameActions.ts  # Action types
│   └── usePeerConnection.ts # P2P connection
├── utils/              # Utilities
├── hooks/              # Custom React hooks
├── types.ts            # TypeScript types
├── constants.ts        # Constants
└── translations.ts     # Translations (EN/RU)
```

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