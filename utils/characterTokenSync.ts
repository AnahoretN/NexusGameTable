import { TableObject, ItemType, TokenSlider, PanelObject, CharacterTab, Token } from '../types';

/**
 * Find all tokens that belong to a specific character
 */
export function findTokensForCharacter(state: any, characterId: string, panelId: string): Token[] {
  const tokens: Token[] = [];
  for (const obj of Object.values(state.objects) as TableObject[]) {
    if (obj.type === ItemType.TOKEN && (obj as Token).characterId === characterId && (obj as Token).panelId === panelId) {
      tokens.push(obj as Token);
    }
  }
  return tokens;
}

/**
 * Find the panel and character for a specific token
 */
export function findCharacterForToken(state: any, token: Token): { panel: PanelObject; character: CharacterTab } | null {
  if (!token.characterId || !token.panelId) return null;

  const panel = state.objects[token.panelId] as PanelObject;
  if (!panel || panel.type !== ItemType.PANEL) return null;

  const characterData = panel.characterData;
  if (!characterData) return null;

  const character = characterData.characters.find((c: CharacterTab) => c.id === token.characterId);
  if (!character) return null;

  return { panel, character };
}

/**
 * Find the first SliderBlock in a character's subTabs
 * Returns { block, subTab, subTabId } or null
 */
export function findSliderBlock(character: CharacterTab): { block: any; subTab: any; subTabId: string } | null {
  if (!character.subTabs) return null;
  for (const subTab of character.subTabs) {
    const sliderBlock = subTab.blocks.find((b: any) => b.type === 'SLIDER' && b.visible);
    if (sliderBlock && sliderBlock.data?.sliders) {
      return { block: sliderBlock, subTab, subTabId: subTab.id };
    }
  }
  return null;
}

/**
 * Sync sliders from character panel to tokens
 * Called when sliders change in the panel
 */
export function syncSlidersToTokens(
  state: any,
  panel: PanelObject,
  character: CharacterTab,
  newObjects: Record<string, TableObject>
): Record<string, TableObject> {
  const sliderBlockInfo = findSliderBlock(character);
  if (!sliderBlockInfo) {
    return newObjects;
  }

  const { block: sliderBlock } = sliderBlockInfo;
  const sliders = sliderBlock.data.sliders;

  // Find all tokens for this character
  const tokens = findTokensForCharacter(state, character.id, panel.id);

  // Update each token's counters
  for (const token of tokens) {
    // Map sliders to token counters, using existing counter ID if available
    const counters: TokenSlider[] = sliders.map((slider: any) => {
      const existingCounter = token.counters?.find(c => c.name === slider.label);
      return {
        id: existingCounter?.id || `counter-${Date.now()}-${slider.id}`,
        name: slider.label,
        value: slider.value, // Use NEW slider value from panel
        maxValue: slider.maxValue,
        minValue: slider.minValue ?? 0,
        color: slider.color || '#ef4444',
        icon: undefined,
        showValue: true,
        showBar: true
      };
    });

    newObjects[token.id] = { ...token, counters };
  }

  return newObjects;
}

/**
 * Sync counters from token to character panel
 * Called when counters change on a token
 */
export function syncCountersToCharacter(
  state: any,
  token: Token,
  newObjects: Record<string, TableObject>
): Record<string, TableObject> {
  const result = findCharacterForToken(state, token);
  if (!result) {
    return newObjects;
  }

  const { panel, character } = result;
  const sliderBlockInfo = findSliderBlock(character);
  if (!sliderBlockInfo) {
    return newObjects;
  }

  const { block: sliderBlock, subTabId } = sliderBlockInfo;

  // Create new sliders array with updated values from token counters
  const updatedSliders = sliderBlock.data.sliders.map((slider: any) => {
    const counter = (token.counters || []).find(c => c.name === slider.label);
    if (counter) {
      return {
        ...slider,
        value: counter.value,
        maxValue: counter.maxValue,
        minValue: counter.minValue,
        color: counter.color || slider.color
      };
    }
    return slider;
  });

  // Update the panel with new slider values
  const updatedCharacters = panel.characterData!.characters.map((c: CharacterTab) => {
    if (c.id === character.id) {
      return {
        ...character,
        subTabs: character.subTabs?.map(subTab =>
          subTab.id === subTabId
            ? {
                ...subTab,
                blocks: subTab.blocks.map((block: any) =>
                  block.id === sliderBlock.id
                    ? { ...block, data: { ...sliderBlock.data, sliders: updatedSliders } }
                    : block
                )
              }
            : subTab
        )
      };
    }
    return c;
  });

  newObjects[panel.id] = { ...panel, characterData: { ...panel.characterData!, characters: updatedCharacters } };

  return newObjects;
}

/**
 * Sync character name from panel to tokens
 */
export function syncCharacterNameToTokens(
  state: any,
  panel: PanelObject,
  character: CharacterTab,
  newObjects: Record<string, TableObject>
): Record<string, TableObject> {
  const tokens = findTokensForCharacter(state, character.id, panel.id);

  for (const token of tokens) {
    if (token.name !== character.characterName) {
      newObjects[token.id] = { ...token, name: character.characterName };
    }
  }

  return newObjects;
}

/**
 * Sync character name from token to panel
 */
export function syncTokenNameToCharacter(
  state: any,
  token: Token,
  newObjects: Record<string, TableObject>
): Record<string, TableObject> {
  const result = findCharacterForToken(state, token);
  if (!result) return newObjects;

  const { panel, character } = result;

  // Only sync if name actually changed
  if (character.characterName === token.name) return newObjects;

  const updatedCharacters = panel.characterData!.characters.map((c: CharacterTab) => {
    if (c.id === character.id) {
      return { ...character, characterName: token.name };
    }
    return c;
  });

  newObjects[panel.id] = { ...panel, characterData: { ...panel.characterData!, characters: updatedCharacters } };

  return newObjects;
}

/**
 * Sync character avatar from panel to tokens
 */
export function syncCharacterAvatarToTokens(
  state: any,
  panel: PanelObject,
  character: CharacterTab,
  newObjects: Record<string, TableObject>
): Record<string, TableObject> {
  const tokens = findTokensForCharacter(state, character.id, panel.id);

  for (const token of tokens) {
    // Sync if avatar exists and is different from token content
    // This handles both img_ref:// format and direct URLs
    if (character.avatarUrl && token.content !== character.avatarUrl) {
      newObjects[token.id] = { ...token, content: character.avatarUrl };
    }
    // If avatar was removed, clear token content
    if (!character.avatarUrl && token.content) {
      newObjects[token.id] = { ...token, content: undefined };
    }
  }

  return newObjects;
}

/**
 * Sync token image to character avatar
 */
export function syncTokenImageToCharacter(
  state: any,
  token: Token,
  newObjects: Record<string, TableObject>
): Record<string, TableObject> {
  const result = findCharacterForToken(state, token);
  if (!result) return newObjects;

  const { panel, character } = result;

  // Only sync if content actually changed and it's not the default
  if (character.avatarUrl === token.content) return newObjects;

  const updatedCharacters = panel.characterData!.characters.map((c: CharacterTab) => {
    if (c.id === character.id) {
      return { ...character, avatarUrl: token.content };
    }
    return c;
  });

  newObjects[panel.id] = { ...panel, characterData: { ...panel.characterData!, characters: updatedCharacters } };

  return newObjects;
}

/**
 * Sync character border settings from panel to tokens
 */
export function syncCharacterBorderToTokens(
  state: any,
  panel: PanelObject,
  character: CharacterTab,
  newObjects: Record<string, TableObject>
): Record<string, TableObject> {
  const tokens = findTokensForCharacter(state, character.id, panel.id);

  // Use character border settings or defaults
  const targetBorderColor = character.avatarBorderColor || '#a855f7';
  const targetBorderWidth = character.avatarBorderWidth ?? 5;

  for (const token of tokens) {
    const needsUpdate =
      token.borderColor !== targetBorderColor ||
      token.borderWidth !== targetBorderWidth;

    if (needsUpdate) {
      newObjects[token.id] = {
        ...token,
        borderColor: targetBorderColor,
        borderWidth: targetBorderWidth
      };
    }
  }

  return newObjects;
}

/**
 * Sync token border settings to character avatar
 */
export function syncTokenBorderToCharacter(
  state: any,
  token: Token,
  newObjects: Record<string, TableObject>
): Record<string, TableObject> {
  const result = findCharacterForToken(state, token);
  if (!result) return newObjects;

  const { panel, character } = result;

  // Use character border settings or defaults for comparison
  const currentBorderColor = character.avatarBorderColor || '#a855f7';
  const currentBorderWidth = character.avatarBorderWidth ?? 5;

  // Only sync if values actually changed (avoid infinite loop)
  if (currentBorderColor === token.borderColor && currentBorderWidth === token.borderWidth) {
    return newObjects;
  }

  const updatedCharacters = panel.characterData!.characters.map((c: CharacterTab) => {
    if (c.id === character.id) {
      return {
        ...character,
        avatarBorderColor: token.borderColor,
        avatarBorderWidth: token.borderWidth
      };
    }
    return c;
  });

  newObjects[panel.id] = { ...panel, characterData: { ...panel.characterData!, characters: updatedCharacters } };

  return newObjects;
}
