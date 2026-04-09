# Action Settings Independence

## Overview

Action settings for different object types are **INDEPENDENT** from each other. Changes to settings for one object type MUST NOT affect settings for other object types.

## Object Type Categories

### 1. **General Actions** (`getAvailableActions()`)
- Available for: ALL object types (tokens, cards, decks, dice, counters, boards, etc.)
- Actions: clone, delete, lock, layer, rotate, rotateClockwise, rotateCounterClockwise, swingClockwise, swingCounterClockwise
- Used in: Action Buttons, Double Click Action
- **NOT used in:** Context Menu Actions (rotation/swing actions are excluded from Context Menu, they depend on 'rotate' section)

### 2. **Deck Actions** (`getDeckActions()`)
- Available for: DECK objects ONLY
- Actions: hide, topDeck, returnAll, shuffleDeck, searchDeck, piles, draw, playTopCard, millTopCard, toBottom, showTop
- Used in: Context Menu Actions for decks, Double Click Action for decks
- **NEVER** appear in: Token settings, card settings, board settings, etc.

### 3. **Move To Actions** (`getMoveToActions()`)
- Available for: Cards (from deck settings)
- Actions: moveTo, moveToHand, moveToTopDeck, moveToBottomDeck, moveToDiscard
- Used in: Context Menu Actions for Cards, Action Buttons for Cards

## Key Rules

1. **NEVER add deck-specific actions to `getAvailableActions()`** - they will appear in token settings
2. **NEVER add general actions to `getDeckActions()`** - they will be duplicated
3. **ALWAYS filter actions based on object type** before displaying in UI
4. **Rotation and swing actions are NOT in Context Menu Actions** - they depend on 'rotate' section and are only available in Action Buttons and Double Click Action
5. **Each object type has its own independent settings:**
   - Tokens: general actions only (no rotation/swing in Context Menu)
   - Decks: general actions + deck actions (no rotation/swing in Context Menu)
   - Cards: inherited from deck settings (moveTo actions, card-specific actions)
   - Boards: general actions (rotate, layer only)
   - Dice/Counters: general actions

## Implementation Examples

### ✅ CORRECT: Adding deck-specific action
```typescript
// Add to getDeckActions() ONLY
function getDeckActions(language: AppLanguage = 'en'): { id: ContextAction; label: string }[] {
  return [
    { id: 'draw', label: translate('Draw', language as Locale) },
    // ... other deck actions
  ];
}
```

### ❌ WRONG: Adding deck-specific action to general actions
```typescript
// DON'T DO THIS - will appear in token settings!
function getAvailableActions(language: AppLanguage = 'en'): { id: ContextAction; label: string }[] {
  return [
    { id: 'draw', label: translate('Draw', language as Locale) }, // ❌ WRONG
    // ... other actions
  ];
}
```

### ✅ CORRECT: Using actions in UI
```typescript
// For decks: include both general and deck actions
{[...AVAILABLE_ACTIONS, ...(isDeck ? DECK_ACTIONS : [])].filter(action => {
  // ... filter based on object type
})}

// For tokens: only general actions
{AVAILABLE_ACTIONS.filter(action => {
  // ... filter based on object type
})}
```

## Testing Checklist

When adding new actions, verify:
- [ ] Action appears in correct object type settings only
- [ ] Action does NOT appear in unrelated object type settings
- [ ] Action is properly filtered in Context Menu Actions
- [ ] Action is properly filtered in Action Buttons
- [ ] Action is properly filtered in Double Click Action
- [ ] Build succeeds without errors
- [ ] No TypeScript errors

## Common Mistakes to Avoid

1. **Adding deck actions to `AVAILABLE_ACTIONS`** - causes them to appear in token settings
2. **Forgetting to check object type** - causes actions to appear in wrong settings
3. **Not updating all relevant filters** - causes inconsistent behavior
4. **Hardcoding action IDs instead of using action lists** - makes maintenance difficult

## Related Files

- `components/ObjectSettings/constants.ts` - Action lists and helpers
- `components/ObjectSettingsModal.tsx` - Main settings UI
- `types.ts` - ContextAction type definition
