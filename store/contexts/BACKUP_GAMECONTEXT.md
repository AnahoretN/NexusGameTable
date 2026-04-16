# GameContext Backup - Before Refactoring

**Date:** 2026-04-16  
**Time:** 21:06  
**Purpose:** Backup of GameContext state before modular context refactoring  
**Status:** ✅ Backup Created

---

## 📊 Current State Analysis

### GameContext.tsx Statistics
- **File Size:** 244,007 bytes (~238 KB)
- **Lines of Code:** ~6,500+ lines (estimated)
- **Complexity:** Very High
- **Responsibility:** Manages ALL application state

### Current GameState Structure
```typescript
export interface GameState {
  // Objects (will be migrated to objectStore.ts)
  objects: Record<string, TableObject>;

  // Players (will be migrated to PlayerContext)
  players: Player[];
  activePlayerId: string;
  playerPermissions: PlayerPermissions;

  // View Transform (will be migrated to ViewTransformContext)
  viewTransform: ViewTransform;

  // UI Settings (will be migrated to UIContext)
  language: AppLanguage;
  playerPanelSettings: PlayerPanelSettings;
  hyperscaleLayers: HyperscaleLayer[];
  selectedHyperscaleLayerIds: string[];

  // Remaining in GameContext
  diceRolls: DiceRoll[];
  drawings: DrawingData;
  undo: UndoState;
  sessionId?: string;
  version?: number;
  connectionsLocked: boolean;
  diceGroups: DiceGroup[];
  lastModifiedBy?: string;
  _lastPanelSettingsUpdate?: number;
  _pendingPanelSettings?: PlayerPanelSettings;
}
```

---

## 🎯 Migration Plan

### Phase 1: PlayerContext (Week 2)
**Migrate from GameContext:**
- `players: Player[]`
- `activePlayerId: string`
- `playerPermissions: PlayerPermissions`

**Impact:** ~15% of GameContext state

### Phase 2: ViewTransformContext (Week 3)
**Migrate from GameContext:**
- `viewTransform: ViewTransform`

**Impact:** ~10% of GameContext state

### Phase 3: UIContext (Week 4)
**Migrate from GameContext:**
- `language: AppLanguage`
- `playerPanelSettings: PlayerPanelSettings`
- `hyperscaleLayers: HyperscaleLayer[]`
- `selectedHyperscaleLayerIds: string[]`

**Impact:** ~20% of GameContext state

### Phase 4: GameContext Cleanup (Week 5)
**Remaining in GameContext:**
- `objects: Record<string, TableObject>` → Use objectStore.ts
- `diceRolls: DiceRoll[]`
- `drawings: DrawingData`
- `undo: UndoState`
- `sessionId?: string`
- `version?: number`
- `connectionsLocked: boolean`
- `diceGroups: DiceGroup[]`
- `lastModifiedBy?: string`
- Internal fields

**Expected Size Reduction:** ~50-60% (244KB → ~100KB)

---

## 📦 Components Using GameContext

### High Priority (Direct usage of state to be migrated)
- `PlayerNameModal.tsx` - Uses `players`, `activePlayerId`
- `Settings.tsx` - Uses `language`, `playerPermissions`
- `Tabletop.tsx` - Uses `viewTransform`, `hyperscaleLayers`
- `HandPanel.tsx` - Uses `playerPanelSettings`
- `TokensPanel.tsx` - Uses `playerPanelSettings`
- `NexusBoard.tsx` - Uses `viewTransform`

### Medium Priority (Indirect usage)
- Components using `useGame()` hook
- Components with GameContext consumer
- Components with dispatch functions

### Low Priority (No migration needed)
- Components using only `objects` → Use `objectStore.ts`
- Components using only `diceRolls`, `drawings` → Stay in GameContext

---

## 🔄 Migration Strategy

### Step 1: Create New Contexts
1. ✅ Create `store/contexts/` directory structure
2. ✅ Create `contextTypes.ts` with shared types
3. ✅ Create `index.ts` for centralized exports
4. ✅ Create test utilities and backup

### Step 2: Implement Contexts (One by One)
1. Create PlayerContext.tsx
2. Create ViewTransformContext.tsx
3. Create UIContext.tsx

### Step 3: Integrate Providers
```typescript
// App.tsx - Final Structure
<UIProvider>
  <ViewTransformProvider>
    <PlayerProvider>
      <GameProvider> {/* Minimized GameContext */}
        <MainApplication />
      </GameProvider>
    </PlayerProvider>
  </ViewTransformProvider>
</UIProvider>
```

### Step 4: Migrate Components
- Replace `useGame()` with specific hooks
- Test each component individually
- Ensure backward compatibility

### Step 5: Cleanup GameContext
- Remove migrated state from GameState
- Remove migrated actions from reducer
- Keep only essential state
- Update types

---

## ⚠️ Risk Assessment

### High Risk Areas
- **WebRTC Synchronization:** State sync between peers
- **Save/Load Functionality:** State serialization/deserialization
- **Undo/Redo System:** History management
- **Panel Settings:** Persistence and synchronization

### Mitigation Strategies
1. **Backward Compatibility:** Create adapters for old components
2. **Gradual Migration:** Migrate one context at a time
3. **Comprehensive Testing:** Test each phase thoroughly
4. **Rollback Plan:** Keep backup of working version
5. **Feature Flags:** Add flags to enable/disable new contexts

---

## 📈 Success Metrics

### Performance Metrics
- **Render Count:** Measure before/after
- **Render Time:** Measure before/after
- **Memory Usage:** Monitor for leaks
- **Bundle Size:** Check impact on bundle

### Functional Metrics
- **All Features Working:** No regressions
- **WebRTC Sync:** Multiplayer works correctly
- **Save/Load:** Persistence works correctly
- **Undo/Redo:** History management works

### Code Quality Metrics
- **File Size:** GameContext reduced by 50%+
- **Lines of Code:** Reduced complexity
- **Type Safety:** Full TypeScript coverage
- **Test Coverage:** Unit tests for contexts

---

## 🚀 Rollback Plan

If migration fails:
1. Revert to backup: `git checkout [backup-commit]`
2. Restore GameContext.tsx from backup
3. Remove new context files
4. Update components back to use `useGame()`
5. Test and verify everything works

**Backup Command:**
```bash
# Create backup branch
git checkout -b backup/before-context-refactoring

# Create backup commit
git add .
git commit -m "backup: GameContext before modular context refactoring"
git push origin backup/before-context-refactoring
```

**Restore Command:**
```bash
# If needed, restore from backup
git checkout backup/before-context-refactoring
git checkout main -- .
```

---

## 📝 Testing Checklist

### Pre-Migration Testing
- [ ] All current features work correctly
- [ ] WebRTC synchronization works
- [ ] Save/Load functionality works
- [ ] No console errors or warnings
- [ ] Performance baseline measured

### Post-Migration Testing (Per Context)
- [ ] PlayerContext: All player features work
- [ ] ViewTransformContext: All view features work
- [ ] UIContext: All UI features work
- [ ] Integration: All contexts work together

### Final Testing
- [ ] All features work as before
- [ ] Performance improved or maintained
- [ ] No regressions detected
- [ ] Code is cleaner and more maintainable

---

## 🎯 Next Steps

1. ✅ **Backup Complete** - This file documents the backup
2. **Create PlayerContext** - Start with the simplest context
3. **Test PlayerContext** - Ensure it works correctly
4. **Migrate Components** - Move components to use PlayerContext
5. **Repeat** - Do the same for ViewTransformContext and UIContext
6. **Cleanup** - Remove migrated code from GameContext
7. **Final Testing** - Comprehensive testing of all functionality

---

**Backup Status:** ✅ Complete  
**Ready for Migration:** Yes  
**Risk Level:** Medium (with mitigation strategies)  
**Estimated Timeline:** 13-20 days

*Last Updated: 2026-04-16 21:06*
