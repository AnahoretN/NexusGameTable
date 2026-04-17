/**
 * TokensPanelOptimized v2.0 - Migrated to new context architecture
 *
 * @version 2.0.0
 * @since 2026-04-17
 *
 * ИЗМЕНЕНИЯ с v1.0:
 * ✅ Полностью убрана зависимость от useGame()
 * ✅ Использует ObjectStore для игровых объектов
 * ✅ Использует PlayerContext v2.0 для player данных
 * ✅ Оптимизированные hooks для предотвращения ререндеров
 * ✅ Сохранена вся функциональность оригинала
 */

import { t as translate, Locale } from '../utils/translations';
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useObjectsData, useObjectActions } from '../store/objectStore';
import { usePlayerPermissions, useIsGM } from '../store/contexts';
import { ItemType, TokenType, TokenShape, AppLanguage } from '../types';
import { SvgTokenShape } from './SvgTokenShape';
import { ChevronDown, Settings } from 'lucide-react';
import { VirtualizedTokensPanel, SimpleTokensPanel, useVirtualizedTokensPanel } from './VirtualizedTokensPanel';

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
  // ✅ НОВЫЕ КОНТЕКСТЫ
  const objects = useObjectsData();
  const { updateObject } = useObjectActions();

  const playerPermissions = usePlayerPermissions();
  const isGM = useIsGM();
  const containerRef = useRef<HTMLDivElement>(null);

  // Token archetypes expanded state
  const [archetypesExpanded, setArchetypesExpanded] = useState(true);

  // 🔥 OPTIMIZED: Memoize token archetypes
  const archetypes = useMemo(() => {
    return Object.values(objects).filter((obj): obj is TokenType => obj.type === ItemType.TOKEN_TYPE);
  }, [objects]);

  // 🔥 OPTIMIZED: Memoize all tokens for efficient copy counting
  const allTokens = useMemo(() => {
    return Object.values(objects).filter(obj => obj.type === ItemType.TOKEN);
  }, [objects]);

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

  // Track drag state to distinguish click from drag
  const dragStartTimeRef = useRef<number>(0);
  const dragStartPositionRef = useRef<{ x: number; y: number } | null>(null);

  // Handle archetype click - add to cursor slot
  const handleArchetypeClick = useCallback((archetype: TokenType, clientX: number, clientY: number) => {
    // Dispatch event to Tabletop to handle adding token to cursor slot
    window.dispatchEvent(new CustomEvent('add-token-to-cursor-slot', {
      detail: { archetypeId: archetype.id, clientX, clientY }
    }));
  }, []);

  // Track if we're currently dragging a token type to place it
  const isDraggingTokenRef = useRef<boolean>(false);
  const dragArchetypeIdRef = useRef<string | null>(null);
  const dragArchetypeCardRef = useRef<HTMLElement | null>(null);

  // Set up capture phase listener for mousedown to set flag BEFORE Tabletop's handleGlobalClick
  useEffect(() => {
    const handleMouseDownCapture = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Find if we're clicking on a token archetype card
      const archetypeCard = target.closest('[data-archetype-card]') as HTMLElement;
      // Check if clicking on settings button - don't add token in that case
      const settingsButton = target.closest('[data-archetype-settings]') as HTMLElement;
      if (archetypeCard && !settingsButton) {
        archetypeCard.dataset.isAddingToken = 'true';
        dragStartTimeRef.current = Date.now();
        dragStartPositionRef.current = { x: e.clientX, y: e.clientY };
        // Store reference to the card that was clicked
        dragArchetypeCardRef.current = archetypeCard;
      }
    };

    const handleMouseMoveCapture = (e: MouseEvent) => {
      // Check if we're dragging (moved more than 3px)
      if (dragStartTimeRef.current > 0 && dragStartPositionRef.current && !isDraggingTokenRef.current) {
        const dragDistance = Math.sqrt(
          Math.pow(e.clientX - dragStartPositionRef.current.x, 2) +
          Math.pow(e.clientY - dragStartPositionRef.current.y, 2)
        );
        // If moved more than 3px, consider it a drag and add token to cursor slot
        if (dragDistance > 3) {
          // Use the stored card reference instead of looking it up again
          const archetypeCard = dragArchetypeCardRef.current;
          if (archetypeCard) {
            const archetypeId = archetypeCard.dataset.archetypeId;
            if (archetypeId) {
              // 🔥 OPTIMIZED: Use memoized archetype map instead of objects lookup
              const archetype = archetypeMap.get(archetypeId);
              if (archetype && archetype.type === ItemType.TOKEN_TYPE) {
                isDraggingTokenRef.current = true;
                dragArchetypeIdRef.current = archetypeId;
                // Add token to cursor slot immediately
                handleArchetypeClick(archetype, e.clientX, e.clientY);
              }
            }
          }
        }
      }
    };

    const handleMouseUpCapture = (e: MouseEvent) => {
      // Check if we were dragging a token
      if (isDraggingTokenRef.current) {
        // Drop the token at current position
        isDraggingTokenRef.current = false;
        const archetypeId = dragArchetypeIdRef.current;
        dragArchetypeIdRef.current = null;
        // Dispatch event to drop cursor slot at this position
        window.dispatchEvent(new CustomEvent('drop-cursor-slot-at-position', {
          detail: { clientX: e.clientX, clientY: e.clientY }
        }));
        // Clear any adding token flags
        const card = dragArchetypeCardRef.current;
        if (card) {
          delete card.dataset.isAddingToken;
        }
        dragStartTimeRef.current = 0;
        dragStartPositionRef.current = null;
        dragArchetypeCardRef.current = null;
        return;
      }

      // Normal click handling (not a drag)
      const archetypeCard = dragArchetypeCardRef.current;

      if (archetypeCard && archetypeCard.dataset.isAddingToken) {
        const dragDuration = Date.now() - dragStartTimeRef.current;
        const dragDistance = dragStartPositionRef.current
          ? Math.sqrt(
              Math.pow(e.clientX - dragStartPositionRef.current.x, 2) +
              Math.pow(e.clientY - dragStartPositionRef.current.y, 2)
            )
          : 0;

        // Clear the adding token flag
        delete archetypeCard.dataset.isAddingToken;

        // If it was a quick click with minimal movement, treat as click (add to slot without dropping)
        if (dragDuration < 200 && dragDistance < 3) {
          const archetypeId = archetypeCard.dataset.archetypeId;
          if (archetypeId) {
            // 🔥 OPTIMIZED: Use memoized archetype map instead of objects lookup
            const archetype = archetypeMap.get(archetypeId);
            if (archetype && archetype.type === ItemType.TOKEN_TYPE) {
              handleArchetypeClick(archetype, e.clientX, e.clientY);
            }
          }
        }
      }

      // Reset drag tracking
      dragStartTimeRef.current = 0;
      dragStartPositionRef.current = null;
      dragArchetypeCardRef.current = null;
    };

    // Use capture phase to ensure this runs before Tabletop's handleGlobalClick
    document.addEventListener('mousedown', handleMouseDownCapture, { capture: true });
    document.addEventListener('mousemove', handleMouseMoveCapture, { capture: true });
    document.addEventListener('mouseup', handleMouseUpCapture, { capture: true });

    return () => {
      document.removeEventListener('mousedown', handleMouseDownCapture, { capture: true } as any);
      document.removeEventListener('mousemove', handleMouseMoveCapture, { capture: true } as any);
      document.removeEventListener('mouseup', handleMouseUpCapture, { capture: true } as any);
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
        className="h-full flex items-center justify-center bg-slate-800 border border-slate-600 rounded-lg"
        style={{ width: '40px' }}
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
      className="h-full flex flex-col bg-slate-800 rounded-lg"
      style={{ width }}
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

      <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
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