import { memo } from 'react';
import type { TableObject } from '../../types';

interface RemoteObjectsRendererProps {
  remoteCursorSlotObjects: TableObject[];
  remoteDraggingObjects: TableObject[];
  v2p: (vu: number) => number;
  state: any;
  pixelsPerVU: number;
}

export const RemoteObjectsRenderer = memo<RemoteObjectsRendererProps>(() => {

  // 🔧 The legacy shadow-object rendering is removed: held objects now stay at
  // their origin on receiving clients (locked + dimmed via the GameProvider
  // style overlay), and live co-drag movement flows through the normal
  // object rendering.
  return null;
}, (prevProps, nextProps) => {
  // Custom comparison for RemoteObjectsRenderer
  return (
    prevProps.remoteCursorSlotObjects === nextProps.remoteCursorSlotObjects &&
    prevProps.remoteDraggingObjects === nextProps.remoteDraggingObjects &&
    prevProps.v2p === nextProps.v2p &&
    prevProps.state === nextProps.state
  );
});

RemoteObjectsRenderer.displayName = 'RemoteObjectsRenderer';

// Export memoized component with custom comparison
export const RemoteObjectsRendererMemo = memo(RemoteObjectsRenderer, (prevProps, nextProps) => {
  return (
    prevProps.remoteCursorSlotObjects === nextProps.remoteCursorSlotObjects &&
    prevProps.remoteDraggingObjects === nextProps.remoteDraggingObjects &&
    prevProps.v2p === nextProps.v2p &&
    prevProps.state === nextProps.state
  );
});

RemoteObjectsRendererMemo.displayName = 'RemoteObjectsRendererMemo';