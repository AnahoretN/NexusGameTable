# Graph Report - .  (2026-04-29)

## Corpus Check
- 85 files · ~292,495 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 498 nodes · 643 edges · 55 communities detected
- Extraction: 85% EXTRACTED · 15% INFERRED · 0% AMBIGUOUS · INFERRED: 97 edges (avg confidence: 0.8)
- Token cost: 42,903 input · 1,374 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Object Actions Handlers|Object Actions Handlers]]
- [[_COMMUNITY_Object Settings & Translations|Object Settings & Translations]]
- [[_COMMUNITY_Player Context & Hooks|Player Context & Hooks]]
- [[_COMMUNITY_Game Context & State|Game Context & State]]
- [[_COMMUNITY_UI Components (Panels)|UI Components (Panels)]]
- [[_COMMUNITY_Grid & Geometry Utils|Grid & Geometry Utils]]
- [[_COMMUNITY_Viewport & Coordinates|Viewport & Coordinates]]
- [[_COMMUNITY_Card Components|Card Components]]
- [[_COMMUNITY_Deck Components|Deck Components]]
- [[_COMMUNITY_Tabletop Core|Tabletop Core]]
- [[_COMMUNITY_WebRTC & Networking|WebRTC & Networking]]
- [[_COMMUNITY_Drawing & Canvas|Drawing & Canvas]]
- [[_COMMUNITY_Pool Panels|Pool Panels]]
- [[_COMMUNITY_Context Menus|Context Menus]]
- [[_COMMUNITY_Character Blocks|Character Blocks]]
- [[_COMMUNITY_Utils (Storage, Cache)|Utils (Storage, Cache)]]
- [[_COMMUNITY_Performance Monitoring|Performance Monitoring]]
- [[_COMMUNITY_Permission System|Permission System]]
- [[_COMMUNITY_Shape Utils|Shape Utils]]
- [[_COMMUNITY_Drag & Drop Handlers|Drag & Drop Handlers]]
- [[_COMMUNITY_Dice & Counters|Dice & Counters]]
- [[_COMMUNITY_Hand Panel|Hand Panel]]
- [[_COMMUNITY_Tools Panel|Tools Panel]]
- [[_COMMUNITY_Modals & Windows|Modals & Windows]]
- [[_COMMUNITY_Translations|Translations]]
- [[_COMMUNITY_Reducers (App, UI)|Reducers (App, UI)]]
- [[_COMMUNITY_Reducers (Cards, Objects)|Reducers (Cards, Objects)]]
- [[_COMMUNITY_Constants & Config|Constants & Config]]
- [[_COMMUNITY_Test Utilities|Test Utilities]]
- [[_COMMUNITY_Virtualized Lists|Virtualized Lists]]
- [[_COMMUNITY_Lazy Loading|Lazy Loading]]
- [[_COMMUNITY_Context Adapters|Context Adapters]]
- [[_COMMUNITY_Auto Save|Auto Save]]
- [[_COMMUNITY_Memory Management|Memory Management]]
- [[_COMMUNITY_Compression|Compression]]
- [[_COMMUNITY_Data Sync|Data Sync]]
- [[_COMMUNITY_Settings Middleware|Settings Middleware]]
- [[_COMMUNITY_Panel Settings|Panel Settings]]
- [[_COMMUNITY_Tooltip System|Tooltip System]]
- [[_COMMUNITY_Layer Management|Layer Management]]
- [[_COMMUNITY_Pool Migration|Pool Migration]]
- [[_COMMUNITY_Pool Visibility|Pool Visibility]]
- [[_COMMUNITY_Pool Placement|Pool Placement]]
- [[_COMMUNITY_View Transform|View Transform]]
- [[_COMMUNITY_Local Settings|Local Settings]]
- [[_COMMUNITY_Feature Flags|Feature Flags]]
- [[_COMMUNITY_Security|Security]]
- [[_COMMUNITY_Documentation|Documentation]]
- [[_COMMUNITY_Build Artifacts|Build Artifacts]]
- [[_COMMUNITY_Type Definitions|Type Definitions]]
- [[_COMMUNITY_Entry Points|Entry Points]]
- [[_COMMUNITY_Character Settings|Character Settings]]
- [[_COMMUNITY_Player Modals|Player Modals]]
- [[_COMMUNITY_Search & Top Deck|Search & Top Deck]]
- [[_COMMUNITY_Resize Handles|Resize Handles]]

## God Nodes (most connected - your core abstractions)
1. `dispatch()` - 48 edges
2. `executeClickAction()` - 34 edges
3. `MemoryManager` - 16 edges
4. `useUI()` - 11 edges
5. `WebRTCSyncManager` - 11 edges
6. `UIObjectRendererOptimized()` - 10 edges
7. `translate()` - 10 edges
8. `useGame()` - 8 edges
9. `useViewTransform()` - 8 edges
10. `DifferentialSyncManager` - 8 edges

## Surprising Connections (you probably didn't know these)
- `handleCursorSlotDrop()` --calls--> `dispatch()`  [INFERRED]
  components\HandPanelOptimized.tsx → components\MainMenuContent.tsx
- `handleCreateGroup()` --calls--> `dispatch()`  [INFERRED]
  components\ObjectSettingsModal.tsx → components\MainMenuContent.tsx
- `handleUpdateGroup()` --calls--> `dispatch()`  [INFERRED]
  components\ObjectSettingsModal.tsx → components\MainMenuContent.tsx
- `handleDeleteGroup()` --calls--> `dispatch()`  [INFERRED]
  components\ObjectSettingsModal.tsx → components\MainMenuContent.tsx
- `handleDropDice()` --calls--> `dispatch()`  [INFERRED]
  components\ObjectSettingsModal.tsx → components\MainMenuContent.tsx

## Hyperedges (group relationships)
- **Version 0.2.0 Major Features** — changelog_tabletop_refactoring, changelog_smart_zindex, changelog_fallback_signaling, changelog_dice_alternatives, changelog_ruler_step [EXTRACTED 1.00]
- **Core Documentation Suite** — claude_md_project_structure, dev_guide_architecture, doc_architecture, readme_architecture [INFERRED 0.85]
- **Tabletop Refactoring Outputs** — tabletop_components, tabletop_hooks, tabletop_performance [EXTRACTED 1.00]

## Communities

### Community 0 - "Object Actions Handlers"
Cohesion: 0.12
Nodes (40): dispatch(), executeClickAction(), getRotationStepForObject(), handleBringToFront(), handleClone(), handleDelete(), handleDraw(), handleFlip() (+32 more)

### Community 1 - "Object Settings & Translations"
Cohesion: 0.07
Nodes (25): clearBoardCellCache(), handleCreatePack(), getAvailableActions(), getButtonApplicableTypes(), getDeckActions(), getDeckContextMenuActions(), getMoveToActions(), handleCreateGroup() (+17 more)

### Community 2 - "Player Context & Hooks"
Cohesion: 0.09
Nodes (26): useGame(), PlayerProvider(), useActivePlayer(), useActivePlayerId(), useIsGM(), usePlayerList(), usePlayerPermissions(), usePlayers() (+18 more)

### Community 3 - "Game Context & State"
Cohesion: 0.1
Nodes (24): addObjectToCellMagnet(), addObjectToGridCellMagnet(), calculateFlatHexHeight(), calculateFlexibleHexGrid(), calculateGridCellCenter(), calculateGridCellMagnetPositions(), calculateGridDimensions(), calculateHexHeight() (+16 more)

### Community 4 - "UI Components (Panels)"
Cohesion: 0.07
Nodes (11): clearCardDimensionsCache(), GameProvider(), gameReducer(), dropCursorSlot(), useTabletopEventHandlers(), useAutoSave(), usePeerConnection(), DifferentialSyncManager (+3 more)

### Community 5 - "Grid & Geometry Utils"
Cohesion: 0.07
Nodes (31): Alternative Dice Values Feature, WebRTC Fallback Signaling System, Ruler Step Settings Feature, Smart Z-Index Allocation System, Tabletop Component Refactoring, Version 0.2.0 Major Refactoring Release, Application Architecture, Context Architecture v0.2.0 (+23 more)

### Community 6 - "Viewport & Coordinates"
Cohesion: 0.08
Nodes (8): addPackLoadingStep(), convertBlobsInObjects(), handleCreateItem(), handleCreatePanel(), handleCursorPositionUpdate(), handleOpenHandPanelSettings(), handlePackFileChange(), handleSaveGame()

### Community 7 - "Card Components"
Cohesion: 0.14
Nodes (3): compressConsecutiveMoves(), MemoryManager, optimizeUndoHistory()

### Community 8 - "Deck Components"
Cohesion: 0.11
Nodes (5): createOptimizedPeerJSConfig(), DebouncedFunction, getOptimizedIceServers(), ThrottledFunction, WebRTCStatsMonitor

### Community 9 - "Tabletop Core"
Cohesion: 0.19
Nodes (13): ToolSettingsProvider(), useDrawingTool(), useEraserSettings(), useMarkerSettings(), useRulerSettings(), useToolSettings(), useCoordinateUtils(), useOffset() (+5 more)

### Community 10 - "WebRTC & Networking"
Cohesion: 0.13
Nodes (0): 

### Community 11 - "Drawing & Canvas"
Cohesion: 0.23
Nodes (1): WebRTCSyncManager

### Community 12 - "Pool Panels"
Cohesion: 0.24
Nodes (4): findDrawingAtPosition(), findOverlappingDrawings(), getStrokeBounds(), getStrokesBounds()

### Community 13 - "Context Menus"
Cohesion: 0.22
Nodes (3): calculateSafeMenuPosition(), handleCursorSlotDrop(), handleResize()

### Community 14 - "Character Blocks"
Cohesion: 0.2
Nodes (0): 

### Community 15 - "Utils (Storage, Cache)"
Cohesion: 0.2
Nodes (0): 

### Community 16 - "Performance Monitoring"
Cohesion: 0.22
Nodes (0): 

### Community 17 - "Permission System"
Cohesion: 0.22
Nodes (0): 

### Community 18 - "Shape Utils"
Cohesion: 0.33
Nodes (5): doRectsIntersect(), getRotatedRectBounds(), getRotatedRectCorners(), getRotationDirection(), normalizeAngle()

### Community 19 - "Drag & Drop Handlers"
Cohesion: 0.25
Nodes (2): dropObjectsToPool(), sortObjectsByLayerIndex()

### Community 20 - "Dice & Counters"
Cohesion: 0.25
Nodes (0): 

### Community 21 - "Hand Panel"
Cohesion: 0.29
Nodes (0): 

### Community 22 - "Tools Panel"
Cohesion: 0.33
Nodes (0): 

### Community 23 - "Modals & Windows"
Cohesion: 0.47
Nodes (3): getMigrationInfo(), migrateAllPoolPanels(), runPoolMigrationIfNeeded()

### Community 24 - "Translations"
Cohesion: 0.33
Nodes (0): 

### Community 25 - "Reducers (App, UI)"
Cohesion: 0.5
Nodes (0): 

### Community 26 - "Reducers (Cards, Objects)"
Cohesion: 0.5
Nodes (0): 

### Community 27 - "Constants & Config"
Cohesion: 0.5
Nodes (0): 

### Community 28 - "Test Utilities"
Cohesion: 0.5
Nodes (0): 

### Community 29 - "Virtualized Lists"
Cohesion: 0.5
Nodes (0): 

### Community 30 - "Lazy Loading"
Cohesion: 0.5
Nodes (0): 

### Community 31 - "Context Adapters"
Cohesion: 0.67
Nodes (0): 

### Community 32 - "Auto Save"
Cohesion: 0.67
Nodes (0): 

### Community 33 - "Memory Management"
Cohesion: 0.67
Nodes (3): Security Policy, Security Architecture, Vulnerability Reporting

### Community 34 - "Compression"
Cohesion: 1.0
Nodes (0): 

### Community 35 - "Data Sync"
Cohesion: 1.0
Nodes (0): 

### Community 36 - "Settings Middleware"
Cohesion: 1.0
Nodes (0): 

### Community 37 - "Panel Settings"
Cohesion: 1.0
Nodes (0): 

### Community 38 - "Tooltip System"
Cohesion: 1.0
Nodes (0): 

### Community 39 - "Layer Management"
Cohesion: 1.0
Nodes (2): Project Structure Documentation, Architecture v0.2.0

### Community 40 - "Pool Migration"
Cohesion: 1.0
Nodes (2): Graphify Knowledge Graph Integration, Knowledge Graph System

### Community 41 - "Pool Visibility"
Cohesion: 1.0
Nodes (0): 

### Community 42 - "Pool Placement"
Cohesion: 1.0
Nodes (0): 

### Community 43 - "View Transform"
Cohesion: 1.0
Nodes (0): 

### Community 44 - "Local Settings"
Cohesion: 1.0
Nodes (0): 

### Community 45 - "Feature Flags"
Cohesion: 1.0
Nodes (0): 

### Community 46 - "Security"
Cohesion: 1.0
Nodes (0): 

### Community 47 - "Documentation"
Cohesion: 1.0
Nodes (0): 

### Community 48 - "Build Artifacts"
Cohesion: 1.0
Nodes (0): 

### Community 49 - "Type Definitions"
Cohesion: 1.0
Nodes (0): 

### Community 50 - "Entry Points"
Cohesion: 1.0
Nodes (0): 

### Community 51 - "Character Settings"
Cohesion: 1.0
Nodes (0): 

### Community 52 - "Player Modals"
Cohesion: 1.0
Nodes (0): 

### Community 53 - "Search & Top Deck"
Cohesion: 1.0
Nodes (0): 

### Community 54 - "Resize Handles"
Cohesion: 1.0
Nodes (1): Refactoring Results

## Knowledge Gaps
- **16 isolated node(s):** `Graphify Knowledge Graph Integration`, `Project Structure Documentation`, `Knowledge Graph System`, `Zustand ObjectStore`, `Architecture v0.2.0` (+11 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Compression`** (2 nodes): `getCardButtonConfigs()`, `Card.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Data Sync`** (2 nodes): `handleSaveCharacterName()`, `CharacterPanel.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Settings Middleware`** (2 nodes): `DeckActions.tsx`, `t()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Panel Settings`** (2 nodes): `ObjectManagement.tsx`, `t()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Tooltip System`** (2 nodes): `executeActionButtonUniversal()`, `actionButtonsHandler.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Layer Management`** (2 nodes): `Project Structure Documentation`, `Architecture v0.2.0`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Pool Migration`** (2 nodes): `Graphify Knowledge Graph Integration`, `Knowledge Graph System`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Pool Visibility`** (1 nodes): `constants.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Pool Placement`** (1 nodes): `index.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `View Transform`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Local Settings`** (1 nodes): `PoolPanel.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Feature Flags`** (1 nodes): `TabletopComponent.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Security`** (1 nodes): `AvatarBlock.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Documentation`** (1 nodes): `CounterBlock.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Build Artifacts`** (1 nodes): `InventoryBlock.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Type Definitions`** (1 nodes): `TableBlock.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Entry Points`** (1 nodes): `TabletopBackground.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Character Settings`** (1 nodes): `TabletopRefactored.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Player Modals`** (1 nodes): `gameState.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Search & Top Deck`** (1 nodes): `logger.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Resize Handles`** (1 nodes): `Refactoring Results`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dispatch()` connect `Object Actions Handlers` to `Object Settings & Translations`, `Player Context & Hooks`, `Game Context & State`, `UI Components (Panels)`, `Viewport & Coordinates`, `Context Menus`, `Drag & Drop Handlers`?**
  _High betweenness centrality (0.206) - this node is a cross-community bridge._
- **Why does `handleClose()` connect `Player Context & Hooks` to `Object Actions Handlers`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **Are the 42 inferred relationships involving `dispatch()` (e.g. with `handleCursorSlotDrop()` and `handleCreateGroup()`) actually correct?**
  _`dispatch()` has 42 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Graphify Knowledge Graph Integration`, `Project Structure Documentation`, `Knowledge Graph System` to the rest of the system?**
  _16 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Object Actions Handlers` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._
- **Should `Object Settings & Translations` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._
- **Should `Player Context & Hooks` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._