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

### Graph Statistics (last run: 2026-04-29 — regenerate with `/graphify` after major refactors)

- **498 nodes** (functions, components, concepts)
- **643 edges** (relationships, calls, imports)
- **55 communities** (logical groupings)
- **85% EXTRACTED** · **15% INFERRED** · **0% AMBIGUOUS**

Note: these numbers predate the Sep 2026 dead-code cleanup (42 unreachable files removed); the graph has not been rebuilt since.

### Key Communities (Updated)

- **Object Actions Handlers** — `executeClickAction()`, `handleFlip()`, etc.
- **Object Settings & Translations** — UI configuration
- **Player Context & Hooks** — `usePlayers()`, `useActivePlayer()`
- **Game Context & State** — `useGame()`, game state
- **WebRTC & Networking** — Authoritative host sync, peer connections
- **Tabletop Core** — Main game board rendering
- **Drawing & Canvas** — Drawing tools
- **Performance Monitoring** — FPS tracking, memory

### God Nodes (Most Connected)

1. `dispatch()` — 48 edges (central action dispatcher)
2. `executeClickAction()` — 34 edges (click handler router)
3. `MemoryManager` — 16 edges (memory optimization)
4. `useUI()` — 11 edges (UI context)
5. `DifferentialSyncManager` — 8 edges (State sync)

### Project Structure

```
App.tsx → components/Tabletop/TabletopRefactored.tsx  # entry chain

components/
├── Tabletop/           # Core game board (modular; TabletopRefactored.tsx is the entry)
├── CharacterBlocks/    # Character sheet widgets
├── ContextMenu.tsx     # Right-click menu
└── ObjectSettingsModal.tsx  # Object configuration (all settings tabs)

store/
├── contexts/           # React Context providers (Player, ViewTransform, UI)
├── GameContext.tsx     # Main game state + dispatch
├── reducers/           # Modular reducers (appReducers.ts)
├── objectStore.ts      # Zustand store for objects
└── p2p/                # Networking helpers (actionBatcher, idleWorkScheduler)

utils/
├── objectActionHandlers.ts  # Card/deck actions
├── poolPlacement.ts         # Pool panel positioning
├── zIndexAllocator.ts       # Dynamic z-index allocation
└── webrtcOptimization.ts    # WebRTC performance tuning
```

## Current Branch: main

The `refactor/tabletop-component-breakdown` work (breaking the monolithic Tabletop.tsx into smaller modules) is merged; the live tabletop is `components/Tabletop/TabletopRefactored.tsx`.
