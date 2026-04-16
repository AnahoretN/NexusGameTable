/**
 * Optimized Sub-Components for MainMenuContent
 * Breaks down the large MainMenuContent into manageable, memoized pieces
 */

import React, { memo, useCallback, useMemo } from 'react';
import { TableObject, ItemType } from '../types';
import { CreditCard, CircleDot, Square, Layers, Dices, Asterisk, Component, Box } from 'lucide-react';

// Type icon component - memoized
export const TypeIcon = memo(({ obj }: { obj: TableObject }) => {
  const icon = useMemo(() => {
    switch (obj.type) {
      case ItemType.TOKEN:
        return <CircleDot size={10} />;
      case ItemType.TOKEN_TYPE:
        return <Square size={10} />;
      case ItemType.CARD:
        return <CreditCard size={10} />;
      case ItemType.DECK:
        return <Layers size={10} />;
      case ItemType.DICE_OBJECT:
        return <Dices size={10} />;
      case ItemType.COUNTER:
        return <Asterisk size={10} />;
      case ItemType.PANEL_OBJECT:
        return <Component size={10} />;
      case ItemType.WINDOW_OBJECT:
        return <Box size={10} />;
      default:
        return <Component size={10} />;
    }
  }, [obj.type]);

  return icon;
});

TypeIcon.displayName = 'TypeIcon';

// Object list item component - memoized
export const ObjectListItem = memo(({
  obj,
  isSelected,
  onClick,
  onDoubleClick
}: {
  obj: TableObject;
  isSelected: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
}) => {
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onClick();
  }, [onClick]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDoubleClick();
  }, [onDoubleClick]);

  const className = useMemo(() =>
    `flex items-center gap-2 p-2 cursor-pointer hover:bg-gray-100 rounded ${isSelected ? 'bg-blue-100' : ''}`,
    [isSelected]
  );

  return (
    <div
      className={className}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      <TypeIcon obj={obj} />
      <span className="text-sm">{obj.name}</span>
    </div>
  );
});

ObjectListItem.displayName = 'ObjectListItem';

// Filter button component - memoized
export const FilterButton = memo(({
  active,
  count,
  onClick,
  children
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  children: React.ReactNode;
}) => {
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onClick();
  }, [onClick]);

  return (
    <button
      className={`px-2 py-1 text-xs rounded ${
        active ? 'bg-blue-500 text-white' : 'bg-gray-200'
      }`}
      onClick={handleClick}
    >
      {children} ({count})
    </button>
  );
});

FilterButton.displayName = 'FilterButton';

// Search input component - memoized
export const SearchInput = memo(({
  value,
  onChange,
  placeholder
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) => {
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  }, [onChange]);

  return (
    <input
      type="text"
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  );
});

SearchInput.displayName = 'SearchInput';

// Stats display component - memoized
export const StatsDisplay = memo(({
  objects
}: {
  objects: Record<string, TableObject>;
}) => {
  const stats = useMemo(() => {
    const objectValues = Object.values(objects);
    return {
      total: objectValues.length,
      cards: objectValues.filter(obj => obj.type === ItemType.CARD).length,
      tokens: objectValues.filter(obj => obj.type === ItemType.TOKEN).length,
      decks: objectValues.filter(obj => obj.type === ItemType.DECK).length,
      dice: objectValues.filter(obj => obj.type === ItemType.DICE_OBJECT).length,
    };
  }, [objects]);

  return (
    <div className="flex gap-4 text-xs text-gray-600">
      <span>Total: {stats.total}</span>
      <span>Cards: {stats.cards}</span>
      <span>Tokens: {stats.tokens}</span>
      <span>Decks: {stats.decks}</span>
      <span>Dice: {stats.dice}</span>
    </div>
  );
});

StatsDisplay.displayName = 'StatsDisplay';

// Loading spinner component - memoized
export const LoadingSpinner = memo(({ message }: { message?: string }) => (
  <div className="flex items-center justify-center p-8">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-gray-600">{message || 'Loading...'}</p>
    </div>
  </div>
));

LoadingSpinner.displayName = 'LoadingSpinner';

// Empty state component - memoized
export const EmptyState = memo(({ message }: { message?: string }) => (
  <div className="flex items-center justify-center p-8">
    <div className="text-center text-gray-500">
      <p className="text-sm">{message || 'No items found'}</p>
    </div>
  </div>
));

EmptyState.displayName = 'EmptyState';