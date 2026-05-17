import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CharacterBlock, QuickAccessBlockData, QuickAccessItem } from '../../types';
import { Plus, Image as ImageIcon } from 'lucide-react';
import { SimpleContextMenu } from '../SimpleContextMenu';

interface QuickAccessBlockProps {
  block: CharacterBlock;
  editable: boolean;
  onChange: (data: QuickAccessBlockData) => void;
}

export const QuickAccessBlock: React.FC<QuickAccessBlockProps> = ({ block, editable, onChange }) => {
  const data = block.data as QuickAccessBlockData;
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; itemId: string } | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [hoveredItem, setHoveredItem] = useState<{ id: string; name: string; x: number; y: number } | null>(null);
  const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoveredItemRef = useRef<{ id: string; name: string; x: number; y: number } | null>(null);

  // Clear tooltip timeout on unmount
  useEffect(() => {
    return () => {
      if (tooltipTimeoutRef.current) {
        clearTimeout(tooltipTimeoutRef.current);
      }
    };
  }, []);

  const handleImageMouseEnter = useCallback((e: React.MouseEvent<HTMLDivElement>, item: QuickAccessItem) => {
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
    }

    // Store position immediately
    const rect = e.currentTarget.getBoundingClientRect();
    hoveredItemRef.current = {
      id: item.id,
      name: item.name,
      x: rect.left + rect.width / 2,
      y: rect.top
    };

    console.log('Tooltip will show for:', item.name, 'at', hoveredItemRef.current.x, hoveredItemRef.current.y);

    tooltipTimeoutRef.current = setTimeout(() => {
      console.log('Tooltip timeout fired for:', hoveredItemRef.current?.name);
      if (hoveredItemRef.current) {
        setHoveredItem(hoveredItemRef.current);
      }
    }, 500);
  }, []);

  const handleImageMouseLeave = useCallback(() => {
    console.log('Mouse left, hiding tooltip');
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
      tooltipTimeoutRef.current = null;
    }
    hoveredItemRef.current = null;
    setHoveredItem(null);
  }, []);

  const handleAddItem = useCallback(() => {
    if (!editable) return;

    if (data.maxItems && data.items.length >= data.maxItems) {
      return; // Max items reached
    }

    const newItem: QuickAccessItem = {
      id: `item-${Date.now()}`,
      name: 'New Item',
      quantity: 1
    };

    onChange({
      ...data,
      items: [...data.items, newItem]
    });
  }, [data, editable, onChange]);

  const handleRemoveItem = useCallback((itemId: string) => {
    if (!editable) return;

    onChange({
      ...data,
      items: data.items.filter(item => item.id !== itemId)
    });
  }, [data, editable, onChange]);

  const handleItemChange = useCallback((itemId: string, field: keyof QuickAccessItem, value: any) => {
    const newItems = data.items.map(item => {
      if (item.id === itemId) {
        return { ...item, [field]: value };
      }
      return item;
    });

    onChange({ ...data, items: newItems });
  }, [data, onChange]);

  const handleQuantityChange = useCallback((itemId: string, delta: number) => {
    if (!editable) return;

    const newItems = data.items.map(item => {
      if (item.id === itemId) {
        const newQuantity = Math.max(0, item.quantity + delta);
        return { ...item, quantity: newQuantity };
      }
      return item;
    });

    onChange({ ...data, items: newItems });
  }, [data, editable, onChange]);

  return (
    <div className="w-full">
      {/* Quick Access Grid */}
      <div
        className="grid gap-1.5"
        style={{
          gridTemplateColumns: `repeat(${data.gridColumns}, minmax(0, 1fr))`
        }}
      >
        {data.items.map(item => (
          <div
            key={item.id}
            className="bg-slate-600 rounded p-1.5 border-2 border-transparent hover:border-slate-500 transition-colors"
            onContextMenu={(e) => {
              if (!editable) return;
              e.preventDefault();
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              setContextMenu({
                x: rect.left,
                y: rect.bottom + 5,
                itemId: item.id
              });
            }}
          >
            {/* Item image or placeholder */}
            <div
              className="aspect-square bg-slate-700 rounded mb-2 flex items-center justify-center cursor-help"
              onMouseEnter={(e) => handleImageMouseEnter(e, item)}
              onMouseLeave={handleImageMouseLeave}
            >
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="w-full h-full object-cover rounded"
                />
              ) : (
                <ImageIcon size={24} className="text-slate-500" />
              )}
            </div>

            {/* Item name */}
            {editable && editingItemId === item.id ? (
              <input
                type="text"
                value={item.name}
                onChange={(e) => handleItemChange(item.id, 'name', e.target.value)}
                onBlur={() => setEditingItemId(null)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setEditingItemId(null);
                  }
                }}
                className="w-full bg-slate-500 text-white text-xs px-1 py-0.5 rounded mb-1"
                onClick={(e) => e.stopPropagation()}
                autoFocus
              />
            ) : (
              <div
                className="text-xs text-white font-medium truncate mb-1"
                onDoubleClick={() => editable && setEditingItemId(item.id)}
                title={editable ? "Double-click to edit item name" : item.name}
              >
                {item.name}
              </div>
            )}

            {/* Quantity controls */}
            <div className="flex items-center justify-center gap-1.5">
              {editable && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleQuantityChange(item.id, -1);
                  }}
                  className="p-0.5 bg-slate-500 text-white rounded hover:bg-slate-400"
                >
                  <Plus size={12} />
                </button>
              )}
              <span className="text-xs text-slate-300">x{item.quantity}</span>
              {editable && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleQuantityChange(item.id, 1);
                  }}
                  className="p-0.5 bg-slate-500 text-white rounded hover:bg-slate-400"
                >
                  <Plus size={12} />
                </button>
              )}
            </div>
          </div>
        ))}

        {/* Empty slots placeholder */}
        {!data.maxItems && data.items.length === 0 && (
          <div className="col-span-full text-center py-8 text-slate-500">
            No items yet. {editable && 'Click "Add Item" to get started.'}
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <SimpleContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            {
              name: 'Edit Name',
              action: () => {
                setEditingItemId(contextMenu.itemId);
                setContextMenu(null);
              }
            },
            {
              name: 'Set to 1',
              action: () => {
                handleItemChange(contextMenu.itemId, 'quantity', 1);
                setContextMenu(null);
              }
            },
            {
              name: 'Set to 5',
              action: () => {
                handleItemChange(contextMenu.itemId, 'quantity', 5);
                setContextMenu(null);
              }
            },
            {
              name: 'Set to 10',
              action: () => {
                handleItemChange(contextMenu.itemId, 'quantity', 10);
                setContextMenu(null);
              }
            },
            {
              name: 'Delete Item',
              action: () => {
                handleRemoveItem(contextMenu.itemId);
                setContextMenu(null);
              }
            }
          ]}
        />
      )}

      {/* Tooltip */}
      {hoveredItem && createPortal(
        <div
          className="fixed z-[1000000] px-3 py-1.5 bg-slate-900 text-white text-xs rounded shadow-lg pointer-events-none border border-slate-700 whitespace-nowrap"
          style={{
            left: `${hoveredItem.x}px`,
            top: `${hoveredItem.y}px`,
            transform: 'translate(-50%, -100%) translateY(-8px)'
          }}
        >
          {hoveredItem.name}
        </div>,
        document.body
      )}
    </div>
  );
};
