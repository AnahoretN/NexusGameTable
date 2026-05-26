/**
 * TokensPanelOptimized v2.1 - Fixed token type display
 *
 * @version 2.1.0
 * @since 2026-04-25
 *
 * ИЗМЕНЕНИЯ с v2.0:
 * ✅ Fixed: TOKEN_TYPE objects now display correctly in separate Tokens Panel
 * ✅ Uses GameContext state.objects instead of objectStore (objectStore is not synced with TOKEN_TYPE)
 * ✅ Uses PlayerContext v2.0 for player data
 * ✅ Optimized hooks for preventing re-renders
 */

import { t as translate, Locale } from '../utils/translations';
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useObjectActions } from '../store/objectStore';
import { usePlayerPermissions, useIsGM } from '../store/contexts';
import { ItemType, TokenType, TokenShape, AppLanguage } from '../types';
import { SvgTokenShape } from './SvgTokenShape';
import { ChevronDown, Settings } from 'lucide-react';
import { VirtualizedTokensPanel, SimpleTokensPanel, useVirtualizedTokensPanel } from './VirtualizedTokensPanel';
import { useGame } from '../store/GameContext';

interface TokensPanelProps {
  width?: number;
  isCollapsed?: boolean;
  language?: AppLanguage;
}

export const TokensPanelOptimized: React.FC<TokensPanelProps> = ({
  width = 280,
  isCollapsed = false,
  language = 'en'
}) => {
  // ✅ Use GameContext for objects (objectStore is not synced with TOKEN_TYPE objects)
  const { state } = useGame();
  const { updateObject } = useObjectActions();

  const playerPermissions = usePlayerPermissions();
  const isGM = useIsGM();
  const containerRef = useRef<HTMLDivElement>(null);

  // Token archetypes expanded state
  const [archetypesExpanded, setArchetypesExpanded] = useState(true);

  // 🔥 OPTIMIZED: Memoize token archetypes from GameContext state.objects
  const archetypes = useMemo(() => {
    return Object.values(state.objects).filter((obj): obj is TokenType => obj.type === ItemType.TOKEN_TYPE);
  }, [state.objects]);

  // 🔥 OPTIMIZED: Memoize all tokens for efficient copy counting
  const allTokens = useMemo(() => {
    return Object.values(state.objects).filter(obj => obj.type === ItemType.TOKEN);
  }, [state.objects]);

  // 🔥 OPTIMIZED: Create Map for efficient archetype lookup
  const archetypeMap = useMemo(() => {
    return new Map(archetypes.map(arch => [arch.id, arch]));
  }, [archetypes]);

  // 🔥 OPTIMIZED: Memoize token copy counts for each archetype
  const tokenCopyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    allTokens.forEach(obj => {
      const token = obj as any;
      if (token.archetypeId) {
        counts.set(token.archetypeId, (counts.get(token.archetypeId) || 0) + 1);
      }
    });
    return counts;
  }, [allTokens]);

  // 🔥 OPTIMIZED: Efficient copy count lookup
  const getTokenCopyCount = useCallback((archetypeId: string) => {
    return tokenCopyCounts.get(archetypeId) || 0;
  }, [tokenCopyCounts]);

  // Get max copies limit for archetype
  const getMaxCopies = (archetype: TokenType) => {
    return (archetype as any).maxCopies ?? 0;
  };

  // Handle archetype click - add to cursor slot
  const handleArchetypeClick = useCallback((archetype: TokenType, clientX: number, clientY: number) => {
    // Dispatch event to Tabletop to handle adding token to cursor slot
    window.dispatchEvent(new CustomEvent('add-token-to-cursor-slot', {
      detail: { archetypeId: archetype.id, clientX, clientY }
    }));
  }, []);

  // Set up capture phase listener for mousedown to handle archetype clicks
  useEffect(() => {
    const handleMouseDownCapture = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Find if we're clicking on a token archetype card
      const archetypeCard = target.closest('[data-archetype-card]') as HTMLElement;
      // Check if clicking on settings button - don't add token in that case
      const settingsButton = target.closest('[data-archetype-settings]') as HTMLElement;

      if (archetypeCard && !settingsButton) {
        const archetypeId = archetypeCard.dataset.archetypeId;
        if (archetypeId) {
          const archetype = archetypeMap.get(archetypeId);
          if (archetype && archetype.type === ItemType.TOKEN_TYPE) {
            // Simply add token to slot on click - no drag-and-drop logic
            handleArchetypeClick(archetype, e.clientX, e.clientY);
          }
        }
      }
    };

    // Use capture phase to ensure this runs before Tabletop's handleGlobalClick
    document.addEventListener('mousedown', handleMouseDownCapture, { capture: true });

    return () => {
      document.removeEventListener('mousedown', handleMouseDownCapture, { capture: true } as any);
    };
  }, [archetypeMap, handleArchetypeClick]);

  // Handle archetype settings
  const handleArchetypeSettings = useCallback((archetype: TokenType) => {
    // Check permissions - GM always has access, non-GM needs configureObjects permission
    const canConfigure = isGM || playerPermissions.configureObjects;
    if (!canConfigure) return; // Silently do nothing if no permission

    // Dispatch event to open settings window
    window.dispatchEvent(new CustomEvent('open-object-settings', {
      detail: { objectId: archetype.id }
    }));
  }, [isGM, playerPermissions.configureObjects]);

  if (isCollapsed) {
    return (
      <div
        ref={containerRef}
        data-tokens-panel
        className="h-full flex items-center justify-center bg-slate-800 border border-slate-600"
        style={{ width: '40px', borderRadius: '5px' }}
      >
        <div className="text-xs text-slate-400 text-center px-1" style={{ writingMode: 'vertical-rl' }}>
          {translate('Tokens', language as Locale)}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-tokens-panel
      className="h-full flex flex-col bg-slate-800"
      style={{ width, borderRadius: '5px' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
        <h3 className="text-sm font-bold text-white">{translate('Tokens', language as Locale)}</h3>
        <button
          onClick={() => setArchetypesExpanded(!archetypesExpanded)}
          className="p-1 text-gray-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
        >
          {archetypesExpanded ? <ChevronDown size={14} className="rotate-180" /> : <ChevronDown size={14} />}
        </button>
      </div>

      <div
        className="flex-1 overflow-y-auto scrollbar-thin p-3"
        data-scrollable="true"
      >
        {archetypesExpanded && (
          <VirtualizedTokensContent
            archetypes={archetypes}
            width={width}
            language={language}
            getTokenCopyCount={getTokenCopyCount}
            getMaxCopies={getMaxCopies}
            onArchetypeSettings={handleArchetypeSettings}
          />
        )}
      </div>
    </div>
  );
};

// Internal component to handle virtualization decision
interface VirtualizedTokensContentProps {
  archetypes: TokenType[];
  width: number;
  language: AppLanguage;
  getTokenCopyCount: (archetypeId: string) => number;
  getMaxCopies: (archetype: TokenType) => number;
  onArchetypeSettings: (archetype: TokenType) => void;
}

const VirtualizedTokensContent: React.FC<VirtualizedTokensContentProps> = ({
  archetypes,
  width,
  language,
  getTokenCopyCount,
  getMaxCopies,
  onArchetypeSettings
}) => {
  const { shouldVirtualize } = useVirtualizedTokensPanel(archetypes.length);

  if (shouldVirtualize) {
    return <VirtualizedTokensPanel archetypes={archetypes} width={width} language={language} getTokenCopyCount={getTokenCopyCount} getMaxCopies={getMaxCopies} onArchetypeSettings={onArchetypeSettings} />;
  }

  return <SimpleTokensPanel archetypes={archetypes} width={width} language={language} getTokenCopyCount={getTokenCopyCount} getMaxCopies={getMaxCopies} onArchetypeSettings={onArchetypeSettings} />;
};

// Memoize TokensPanelOptimizedV2
export const TokensPanelOptimizedMemo = React.memo(TokensPanelOptimized, (prevProps, nextProps) => {
  return prevProps.width === nextProps.width &&
         prevProps.isCollapsed === nextProps.isCollapsed &&
         prevProps.language === nextProps.language;
});

export default TokensPanelOptimized;