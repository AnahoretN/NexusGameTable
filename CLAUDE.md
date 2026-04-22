# Project Context

## Knowledge Graph Integration

This project has a **graphify knowledge graph** that maps the codebase architecture, component relationships, and documentation.

When answering questions about:
- Architecture and system design
- Component relationships and dependencies
- Code organization and structure
- How different parts of the system connect

**Always consult the graph first:**

```bash
# Before answering architecture questions, read:
graphify-out/GRAPH_REPORT.md

# For graph queries, use:
graphify query "your question" --graph graphify-out/graph.json
```

The graph contains:
- 1613 nodes (functions, components, concepts)
- 3230 edges (relationships, calls, imports)
- 136 communities (logical groupings)

### Key Communities

- **Build Artifacts** - bundled JavaScript ( Communities 0-1, 5)
- **Performance & Monitoring** - FPS tracking, memory management (Community 2)
- **Storage & Image Cache** - IndexedDB, image management (Community 3)
- **UI Components** - settings, tools, modals (Community 4)
- **React Context Providers** - GameContext, UIContext, etc. (Community 6)
- **WebRTC Networking** - peer connection, data channels (Community 7)
- **Grid & Snapping System** - hex/square grid calculations (Community 10)

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
