/**
 * ClickTooltip component
 * Simple tooltip component for displaying card information on click
 */

import React from 'react';
import { Card } from '../../types';
import { isLocalFsReference } from '../../utils/imageCompat';

interface ClickTooltipProps {
  card: Card;
  x: number;
  y: number;
}

export const ClickTooltip: React.FC<ClickTooltipProps> = ({ card, x, y }) => {
  if (!card) return null;

  return (
    <div
      className="fixed z-[10000] pointer-events-none"
      style={{
        left: x + 20,
        top: y + 20,
        maxWidth: '300px',
      }}
    >
      <div className="bg-white rounded-lg shadow-xl border border-gray-300 p-4">
        {card.faceUp && card.content && !isLocalFsReference(card.content) && (
          <img
            src={card.content}
            alt={card.name || 'Card'}
            className="w-full h-auto rounded"
            style={{ maxWidth: '200px' }}
          />
        )}
        <div className="mt-2 text-sm text-gray-800">
          {card.name || 'Unknown Card'}
        </div>
        {card.description && (
          <div className="mt-1 text-xs text-gray-600">
            {card.description}
          </div>
        )}
      </div>
    </div>
  );
};
