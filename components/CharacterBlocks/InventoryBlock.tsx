import React, { useState, useCallback } from 'react';
import { CharacterBlock, InventoryBlockData, InventoryItem } from '../../types';
import { Plus, Image as ImageIcon } from 'lucide-react';
import { SimpleContextMenu } from '../SimpleContextMenu';

interface InventoryBlockProps {
  block: CharacterBlock;
  editable: boolean;
  onChange: (data: InventoryBlockData) => void;
}

export const InventoryBlock: React.FC<InventoryBlockProps> = ({ block, editable, onChange }) => {
  const data = block.data as InventoryBlockData;
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; itemId: string } | null>(null);

  const handleAddItem = useCallback(() => {
    if (!editable) return;

    if (data.maxItems && data.items.length >= data.maxItems) {
      return; // Max items reached
    }

    const newItem: InventoryItem = {
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

  const handleItemChange = useCallback((itemId: string, field: keyof InventoryItem, value: any) => {
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
      {/* Controls */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-slate-400">
          {data.items.length} {data.maxItems ? `/ ${data.maxItems}` : ''} items
        </span>
        {editable && (
          <button
            onClick={handleAddItem}
            className="px-1.5 py-0.5 bg-slate-600 text-white text-xs rounded hover:bg-slate-500 transition-colors flex items-center gap-1"
            disabled={!!data.maxItems && data.items.length >= data.maxItems}
          >
            <Plus size={12} />
            Add Item
          </button>
        )}
      </div>

      {/* Inventory Grid */}
      <div
        className="grid gap-1.5"
        style={{
          gridTemplateColumns: `repeat(${data.gridColumns}, minmax(0, 1fr))`
        }}
      >
        {data.items.map(item => (
          <div
            key={item.id}
            className={`bg-slate-600 rounded p-1.5 border-2 transition-colors ${
              selectedItemId === item.id
                ? 'border-blue-500'
                : 'border-transparent hover:border-slate-500'
            }`}
            onClick={() => setSelectedItemId(item.id)}
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
            <div className="aspect-square bg-slate-700 rounded mb-2 flex items-center justify-center">
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
            {editable && selectedItemId === item.id ? (
              <input
                type="text"
                value={item.name}
                onChange={(e) => handleItemChange(item.id, 'name', e.target.value)}
                className="w-full bg-slate-500 text-white text-xs px-1 py-0.5 rounded mb-1"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <div
                className="text-xs text-white font-medium truncate mb-1"
                onClick={() => editable && setSelectedItemId(item.id)}
                title={editable ? "Click to edit item name" : item.name}
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
                setSelectedItemId(contextMenu.itemId);
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
    </div>
  );
};