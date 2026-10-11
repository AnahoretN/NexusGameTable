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

## Testing

- Vitest 3 (not 5 — Vitest 5 requires Vite 6+, project is on Vite 5) + Testing Library + jsdom, configured in the `test` block of `vite.config.ts`. Run: `npm test` (once) / `npm run test:watch`.
- Test files live in `__tests__` dirs next to the code; `tsconfig.json` excludes `**/__tests__` from typecheck.
- Gotchas learned the hard way:
  - `vi.mock` paths resolve **relative to the test file**, not the mocked module — from a `__tests__` dir one level deeper, that's one extra `../` than the same import inside the component.
  - `store/contexts` are thin bridges over `GameContext` (only PlayerContext) or self-contained reducers. To test the bridge, mock `useGame` with a mini-reducer (see `store/contexts/__tests__/ContextIntegration.test.tsx`).
  - Do NOT mount the full `TabletopRefactored` child tree in jsdom — it OOMs (infinite resize/layout effects). Smoke tests mock the `./index` barrel instead.
- P2P scenarios are not unit-testable (WebRTC); they live in manual Puppeteer scripts (see `E:\tmp\trystero-repro.mjs` and the `__nexus`/`__trysteroDebug` window hooks).
- `store/session/protocol.ts` (wire protocol) has unit tests in `store/session/__tests__/protocol.test.ts` covering the historical bug classes: PACKS_NEEDED repeat-guard, SYNC_STATE buffering/partial passthrough, cursor-slot pickup rebuild, POSITION_UPDATE cursor-freeze, HELO rejoin/lock.
- `utils/webrtcOptimization.test.ts` covers `DifferentialSyncManager.getPartialState` (payload mapping, tombstones, diff-based additions/removals, cursor-slot flag-only sync). Gotcha: `getPartialState` diffs against the `resetKnownIds` baseline — an empty baseline makes every object an uncapped "addition".
- `store/reducers/appReducers.ts` contains ONLY `addPackToGameReducer` (the one GameContext wires) — the other exported reducers were dead code and were removed (2026-10-11). Same cleanup pass fixed a pack-import bug: dice-group/drawing-layer ID collisions used to be checked against objects only, silently duplicating group/layer IDs.
- Game logic branches are tested via the exported `gameReducer` (`store/__tests__/gameReducer.test.ts`: DRAW_CARD, PLAY_TOP_CARD + drop, SHUFFLE_DECK, FLIP_CARD, ADD_CARD_TO_PILE), plus `directP2PSync`, grid snapping (`gridUtils`) and coordinate round-trips. 2026-10-11 bugfixes found by these tests: ADD_CARD_TO_PILE early-returned after removing a card from a foreign deck, silently dropping the card instead of adding it to the target pile; the whole of `utils/coordinateUtils.ts` except viewportToWorld/worldToViewport had zero call sites and was removed.
