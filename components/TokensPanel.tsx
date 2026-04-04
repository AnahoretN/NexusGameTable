import { t as translate, Locale } from '../utils/translations';
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useGame } from '../store/GameContext';
import { ItemType, TokenType, TokenShape, AppLanguage } from '../types';
import { SvgTokenShape } from './SvgTokenShape';
import { ChevronDown, Settings } from 'lucide-react';

interface TokensPanelProps {
  width?: number;
  isCollapsed?: boolean;
  language?: AppLanguage;
}

export const TokensPanel: React.FC<TokensPanelProps> = ({
  width = 280,
  isCollapsed = false,
  language = 'en'
}) => {
  const { state, dispatch, isHost } = useGame();
  const containerRef = useRef<HTMLDivElement>(null);

  // Token archetypes expanded state
  const [archetypesExpanded, setArchetypesExpanded] = useState(true);

  // Get all token archetypes
  const archetypes = Object.values(state.objects)
    .filter((obj): obj is TokenType => obj.type === ItemType.TOKEN_TYPE);

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
              const archetype = state.objects[archetypeId] as TokenType;
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
            const archetype = state.objects[archetypeId] as TokenType;
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
  }, [state.objects, handleArchetypeClick]);

  // Handle archetype settings
  const handleArchetypeSettings = useCallback((archetype: TokenType) => {
    // Check permissions - GM always has access, non-GM needs configureObjects permission
    const canConfigure = isHost || state.playerPermissions.configureObjects;
    if (!canConfigure) return; // Silently do nothing if no permission

    dispatch({
      type: 'CREATE_WINDOW',
      payload: {
        windowType: 'OBJECT_SETTINGS' as any,
        title: 'Settings: ' + archetype.name,
        targetObjectId: archetype.id
      }
    });
  }, [dispatch, isHost, state.playerPermissions.configureObjects]);

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
          <div className="grid grid-cols-3 gap-2">
            {archetypes.length === 0 ? (
              <div className="col-span-3 text-center py-4 text-gray-500 text-xs">
                {translate('No token archetypes.', language as Locale)}<br />
                {translate('Add them from the main menu.', language as Locale)}
              </div>
            ) : (
              archetypes.map((archetype) => {
                // Calculate aspect ratio based on defaultSize or fall back to 1:1
                const aspectRatio = archetype.defaultSize
                  ? archetype.defaultSize.width / archetype.defaultSize.height
                  : 1;

                // Calculate size to fit within the card while maintaining aspect ratio
                const baseSize = 70; // Base percentage
                const tokenWidth = aspectRatio >= 1 ? baseSize : baseSize * aspectRatio;
                const tokenHeight = aspectRatio <= 1 ? baseSize : baseSize / aspectRatio;

                return (
                <div
                  key={archetype.id}
                  data-archetype-card
                  data-archetype-id={archetype.id}
                  className="relative group aspect-square bg-slate-700 rounded-lg border-2 border-slate-600 hover:border-purple-500 cursor-pointer transition-colors"
                  title={`${archetype.name}\n${translate('Click to add to cursor slot', language as Locale)}`}
                >
                  {/* Preview of the token using SvgTokenShape */}
                  <div className="w-full h-full flex items-center justify-center overflow-hidden rounded">
                    <SvgTokenShape
                      shape={archetype.shape || TokenShape.SQUARE}
                      width={tokenWidth}
                      height={tokenHeight}
                      color={archetype.color || '#ffffff'}
                      content={archetype.content}
                      borderColor={(archetype as any).borderColor || '#ffffff'}
                      borderWidth={(archetype as any).borderWidth ?? 2}
                      opacity={archetype.opacity ?? 100}
                      borderOpacity={archetype.borderOpacity ?? 100}
                      className="drop-shadow-md"
                      style={{ width: `${tokenWidth}%`, height: `${tokenHeight}%` }}
                    />
                  </div>

                  {/* Settings button */}
                  <button
                    data-archetype-settings
                    onClick={(e) => {
                      e.stopPropagation();
                      handleArchetypeSettings(archetype);
                    }}
                    className="absolute top-0.5 right-0.5 p-1 bg-slate-800 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Settings size={10} className="text-gray-400" />
                  </button>

                  {/* Name label */}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] truncate px-1 py-0.5 rounded-b">
                    {archetype.name}
                  </div>
                </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
};
