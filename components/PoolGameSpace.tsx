import React from 'react';
import { PoolTabletop } from './PoolTabletop';

interface PoolGameSpaceProps {
  panelId: string;
  offsetX: number; // Zone X offset in game space (vu)
  offsetY: number; // Zone Y offset in game space (vu)
  width: 1000; // Fixed zone width (vu)
  height: 1000; // Fixed zone height (vu)
}

export const PoolGameSpace: React.FC<PoolGameSpaceProps> = ({
  panelId,
  offsetX,
  offsetY,
  width,
  height
}) => {
  return (
    <div
      className="absolute inset-0 overflow-auto bg-slate-900"
      onMouseDown={(e) => {
        console.log('PoolGameSpace onMouseDown:', {
          panelId,
          shiftKey: e.shiftKey,
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
          button: e.button,
          target: e.target
        });
      }}
    >
      <PoolTabletop
        poolZone={{
          offsetX,
          offsetY,
          width: 1000, // Fixed 1000 VU
          height: 1000, // Fixed 1000 VU
          panelId
        }}
      />
    </div>
  );
};
