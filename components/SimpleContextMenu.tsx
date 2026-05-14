import React, { useEffect, useRef, useState, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import { LucideIcon } from 'lucide-react';

interface MenuItem {
  name: string;
  icon?: React.ReactNode;
  action: () => void;
}

interface SimpleContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  items: MenuItem[];
}

// Memoized menu item component
const SimpleMenuItem = memo<{
  item: MenuItem;
  index: number;
  onClose: () => void;
}>(({ item, index, onClose }) => {
  const handleClick = useCallback(() => {
    item.action();
    onClose();
  }, [item, onClose]);

  return (
    <button
      key={index}
      onClick={handleClick}
      className="w-full px-4 py-2 text-left text-sm text-slate-200 hover:bg-slate-700 flex items-center gap-3 transition-colors"
    >
      {item.icon && <span className="text-slate-400">{item.icon}</span>}
      <span>{item.name}</span>
    </button>
  );
});

SimpleMenuItem.displayName = 'SimpleMenuItem';

export const SimpleContextMenu = memo(({ x, y, onClose, items }: SimpleContextMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });

  // Adjust position after menu is rendered
  useEffect(() => {
    if (!menuRef.current) return;

    const rect = menuRef.current.getBoundingClientRect();
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    let adjustedX = x;
    let adjustedY = y;

    // Check if menu goes off the right edge
    if (x + rect.width > screenWidth) {
      adjustedX = screenWidth - rect.width - 10;
    }

    // Check if menu goes off the left edge
    if (x < 10) {
      adjustedX = 10;
    }

    // Check if menu goes off the bottom edge
    if (y + rect.height > screenHeight) {
      adjustedY = screenHeight - rect.height - 10;
    }

    // Check if menu goes off the top edge
    if (y < 10) {
      adjustedY = 10;
    }

    setPosition({ x: adjustedX, y: adjustedY });
  }, [x, y]);

  // Close menu on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={menuRef}
      className="fixed bg-slate-800 border border-slate-600 rounded-lg shadow-xl py-1 z-[99999] min-w-[200px]"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      {items.map((item, index) => (
        <SimpleMenuItem
          key={index}
          item={item}
          index={index}
          onClose={onClose}
        />
      ))}
    </div>,
    document.body
  );
});

SimpleContextMenu.displayName = 'SimpleContextMenu';