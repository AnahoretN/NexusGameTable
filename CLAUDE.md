# Project Context

## Knowledge Graph Integration

This project has a **graphify knowledge graph** that maps the codebase architecture, component relationships, and documentation.

### ⚠️ IMPORTANT: Always Use the Graph First

**When working on ANY task that requires understanding the project architecture:**

1. **Read the graph report first** — `graphify-out/GRAPH_REPORT.md`
2. **Check community structure** — understand how components are grouped
3. **Use graph queries** — for specific questions about connections

**When to consult the graph:**
- 🏗️ Understanding architecture before making changes
- 🔍 Finding where functionality is implemented
- 🔗 Understanding component dependencies
- 📦 Identifying impact of changes
- 🐛 Tracing bugs across components
- ✅ Adding new features (find related code)
- 🔄 Refactoring (understand ripple effects)

```bash
# Before answering architecture questions, read:
graphify-out/GRAPH_REPORT.md

# For graph queries, use:
graphify query "your question" --graph graphify-out/graph.json

# For interactive visualization, open:
graphify-out/graph.html
```

### Graph Statistics (Updated: 2026-04-29)

- **498 nodes** (functions, components, concepts)
- **643 edges** (relationships, calls, imports)
- **55 communities** (logical groupings)
- **85% EXTRACTED** · **15% INFERRED** · **0% AMBIGUOUS**

### Key Communities (Updated)

- **Object Actions Handlers** — `executeClickAction()`, `handleFlip()`, etc.
- **Object Settings & Translations** — UI configuration
- **Player Context & Hooks** — `usePlayers()`, `useActivePlayer()`
- **Game Context & State** — `useGame()`, game state
- **WebRTC & Networking** — `WebRTCSyncManager`, peer connections
- **Tabletop Core** — Main game board rendering
- **Drawing & Canvas** — Drawing tools
- **Performance Monitoring** — FPS tracking, memory

### God Nodes (Most Connected)

1. `dispatch()` — 48 edges (central action dispatcher)
2. `executeClickAction()` — 34 edges (click handler router)
3. `MemoryManager` — 16 edges (memory optimization)
4. `useUI()` — 11 edges (UI context)
5. `WebRTCSyncManager` — 11 edges (P2P sync)

### Project Structure

```
components/
├── Tabletop/           # Core game board (refactored)
├── CharacterBlocks/    # Character sheet widgets
├── contextMenu/        # Right-click menus
└── ObjectSettings/     # Object configuration

store/
├── contexts/           # React Context providers
├── reducers/           # Redux reducers
└── slices/             # Redux Toolkit slices

utils/
├── objectActionHandlers.ts  # Card/deck actions
├── poolPlacement.ts         # Pool panel positioning
└── webrtcSyncManager.ts     # Multiplayer sync
```

## Current Branch: refactor/tabletop-component-breakdown

Recent refactoring work focused on breaking down the monolithic Tabletop component into smaller, focused modules.
