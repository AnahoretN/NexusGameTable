/**
 * VirtualizedTokensPanel - Optimized tokens panel with virtualization
 *
 * Performance benefits:
 * - Renders only visible token archetypes
 * - Smooth scrolling even with 100+ token types
 * - Reduces memory usage significantly
 * - Maintains 60fps performance
 */

import React, { useRef, useMemo, memo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { TokenType, TokenShape, AppLanguage } from '../types';
import { SvgTokenShape } from './SvgTokenShape';
import { Settings } from 'lucide-react';
import { t as translate, Locale } from '../utils/translations';

interface VirtualizedTokensPanelProps {
  archetypes: TokenType[];
  width: number;
  language: AppLanguage;
  getTokenCopyCount: (archetypeId: string) => number;
  getMaxCopies: (archetype: TokenType) => number;
  onArchetypeSettings: (archetype: TokenType) => void;
  className?: string;
  // Grid configuration
  tokenSize?: number; // Base size in percentage
  columns?: number; // Number of columns in grid
  gap?: number; // Gap between items
}

// Memoized individual token archetype card
const TokenArchetypeCard = memo<{
  archetype: TokenType;
  tokenSize: number;
  copyCount: number;
  maxCopies: number;
  onSettings: (e: React.MouseEvent) => void;
  language: AppLanguage;
}>(({ archetype, tokenSize, copyCount, maxCopies, onSettings, language }) => {
  // Calculate aspect ratio based on defaultSize or fall back to 1:1
  const aspectRatio = archetype.defaultSize
    ? archetype.defaultSize.width / archetype.defaultSize.height
    : 1;

  // Calculate size to fit within the card while maintaining aspect ratio
  const tokenWidth = aspectRatio >= 1 ? tokenSize : tokenSize * aspectRatio;
  const tokenHeight = aspectRatio <= 1 ? tokenSize : tokenSize / aspectRatio;

  return (
    <div
      data-archetype-card
      data-archetype-id={archetype.id}
      className="relative group aspect-square bg-slate-700 rounded-lg border-2 border-slate-600 hover:border-purple-500 cursor-pointer transition-colors"
      title={`${archetype.name} (${maxCopies > 0 ? `${copyCount}/${maxCopies}` : copyCount})\n${translate('Click to add to cursor slot', language as Locale)}`}
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
        onClick={onSettings}
        className="absolute top-0.5 right-0.5 p-1 bg-slate-800 rounded opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Settings size={10} className="text-gray-400" />
      </button>

      {/* Name label with copy count */}
      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] truncate px-1 py-0.5 rounded-b">
        {maxCopies > 0 ? `${archetype.name} (${copyCount}/${maxCopies})` : `${archetype.name} (${copyCount})`}
      </div>
    </div>
  );
});

TokenArchetypeCard.displayName = 'TokenArchetypeCard';

export const VirtualizedTokensPanel: React.FC<VirtualizedTokensPanelProps> = ({
  archetypes,
  width,
  language,
  getTokenCopyCount,
  getMaxCopies,
  onArchetypeSettings,
  className = '',
  tokenSize = 70,
  columns = 3,
  gap = 8,
}) => {
  const parentRef = useRef<HTMLDivElement>(null);

  // Calculate dimensions
  const itemWidth = (width - (gap * (columns - 1)) - 24) / columns; // 24px for padding
  const itemHeight = itemWidth; // Square items
  const rowGap = gap;

  // Calculate total rows
  const totalRows = Math.ceil(archetypes.length / columns);
  const totalHeight = totalRows * itemHeight + (totalRows - 1) * rowGap + 24; // 24px for padding

  // Create virtualizer for vertical scrolling
  const virtualizer = useVirtualizer({
    count: totalRows,
    getScrollElement: () => parentRef.current,
    estimateSize: () => itemHeight + rowGap,
    overscan: 2, // Pre-render 2 rows before/after viewport
  });

  // If no archetypes, show empty state
  if (archetypes.length === 0) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <div className="text-center py-4 text-gray-500 text-xs">
          {translate('No token archetypes.', language as Locale)}<br />
          {translate('Add them from the main menu.', language as Locale)}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className={className}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'auto',
        position: 'relative',
      }}
      data-scrollable="true"
    >
      <div
        style={{
          height: `${totalHeight}px`,
          width: '100%',
          position: 'relative',
          padding: '12px',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const startIndex = virtualRow.index * columns;
          const endIndex = Math.min(startIndex + columns, archetypes.length);
          const rowArchetypes = archetypes.slice(startIndex, endIndex);

          return (
            <div
              key={virtualRow.index}
              data-index={virtualRow.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
                display: 'grid',
                gridTemplateColumns: `repeat(${columns}, 1fr)`,
                gap: `${gap}px`,
                padding: '0 12px',
              }}
            >
              {rowArchetypes.map((archetype) => {
                const copyCount = getTokenCopyCount(archetype.id);
                const maxCopies = getMaxCopies(archetype);

                return (
                  <TokenArchetypeCard
                    key={archetype.id}
                    archetype={archetype}
                    tokenSize={tokenSize}
                    copyCount={copyCount}
                    maxCopies={maxCopies}
                    language={language}
                    onSettings={(e) => {
                      e.stopPropagation();
                      onArchetypeSettings(archetype);
                    }}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * Non-virtualized version for small token sets (better performance for < 15 archetypes)
 */
interface SimpleTokensPanelProps {
  archetypes: TokenType[];
  width: number;
  language: AppLanguage;
  getTokenCopyCount: (archetypeId: string) => number;
  getMaxCopies: (archetype: TokenType) => number;
  onArchetypeSettings: (archetype: TokenType) => void;
  className?: string;
  tokenSize?: number;
  columns?: number;
  gap?: number;
}

export const SimpleTokensPanel: React.FC<SimpleTokensPanelProps> = ({
  archetypes,
  language,
  getTokenCopyCount,
  getMaxCopies,
  onArchetypeSettings,
  className = '',
  tokenSize = 70,
  columns = 3,
  gap = 8,
}) => {
  if (archetypes.length === 0) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <div className="text-center py-4 text-gray-500 text-xs">
          {translate('No token archetypes.', language as Locale)}<br />
          {translate('Add them from the main menu.', language as Locale)}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${className} grid grid-cols-${columns} gap-${gap / 4} p-3`}
      style={{
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: `${gap}px`,
      }}
      data-scrollable="true"
    >
      {archetypes.map((archetype) => {
        const copyCount = getTokenCopyCount(archetype.id);
        const maxCopies = getMaxCopies(archetype);

        return (
          <TokenArchetypeCard
            key={archetype.id}
            archetype={archetype}
            tokenSize={tokenSize}
            copyCount={copyCount}
            maxCopies={maxCopies}
            language={language}
            onSettings={(e) => {
              e.stopPropagation();
              onArchetypeSettings(archetype);
            }}
          />
        );
      })}
    </div>
  );
};

/**
 * Hook to determine if tokens panel should be virtualized
 */
export function useVirtualizedTokensPanel(archetypeCount?: number) {
  const shouldVirtualize = (archetypeCount ?? 0) > 15; // Virtualize if more than 15 archetypes

  return {
    shouldVirtualize,
    archetypeCount: archetypeCount ?? 0,
    recommendedColumns: 3,
    gap: 8,
  };
};
