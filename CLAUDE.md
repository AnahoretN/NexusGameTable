# Project Context

## Project Structure

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
├── session/            # Universal P2P session layer:
│   ├── protocol.ts     #   THE wire-protocol dispatcher (all message types)
│   ├── sessionUx.ts    #   Loading steps + pack negotiation (shared)
│   ├── transport.ts    #   Transport interface contract
│   ├── useGameSession.ts # The one session hook GameContext consumes
│   └── index.ts
├── usePeerConnection.ts    # PeerJS transport
├── useTrysteroConnection.ts # Trystero (BitTorrent) transport
└── useIrohConnection.ts    # Iroh transport (PeerJS-backed)

utils/
├── objectActionHandlers.ts  # Card/deck actions
├── poolPlacement.ts         # Pool panel positioning
├── zIndexAllocator.ts       # Dynamic z-index allocation
└── webrtcOptimization.ts    # WebRTC performance tuning
```

## Notes

- The `refactor/tabletop-component-breakdown` work is merged; the live tabletop entry is `components/Tabletop/TabletopRefactored.tsx`.
- A graphify knowledge graph used to live in `graphify-out/` but was removed (v0.3.x) as unused — don't look for it, don't reference it.
