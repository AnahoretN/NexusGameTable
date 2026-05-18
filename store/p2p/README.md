# P2P System Documentation

## Overview

The new P2P system provides a clean, simplified architecture for multiplayer game synchronization. It fixes the critical race condition where guests received state before images, and introduces incremental sync to reduce bandwidth usage.

## Key Features

1. **Progressive Image Loading**: Images are sent once per connection, loaded by priority
2. **Action-Based Sync**: Instead of full state, only actions are transmitted
3. **Reliable/Unreliable Messaging**: Critical actions get ACK, position updates are fire-and-forget
4. **Simplified Connection**: Single connection path, no complex fallback logic

## Architecture

```
store/p2p/
├── index.ts                      # Main exports
├── types.ts                      # Type definitions
├── protocol/
│   └── messages.ts               # Message protocol
├── connection/
│   └── manager.ts                # Connection management
├── images/
│   ├── manifest.ts               # Image manifest builder
│   ├── loader.ts                 # Progressive image loader
│   └── transfer.ts               # Image transfer manager
├── state/
│   ├── actions.ts                # Action recorder
│   └── sync.ts                   # State sync manager
└── hooks/
    ├── useP2PConnection.ts       # Main React hook
    ├── useP2PImages.ts           # Image hook
    └── index.ts                  # Hooks export
```

## Usage

### Host Side

```typescript
import { useP2PConnection } from '@/store/p2p';

function GameComponent() {
  const dispatch = useGameDispatch();
  const {
    state: connectionState,
    peerId,
    initializeHost,
    disconnect,
    sendAction,
  } = useP2PConnection(dispatch);

  // Initialize host
  const handleHostInit = async () => {
    try {
      const id = await initializeHost();
      console.log('Host ID:', id);
      // Share this ID with players
    } catch (error) {
      console.error('Failed to initialize host:', error);
    }
  };

  return (
    <div>
      <button onClick={handleHostInit}>Start Hosting</button>
      <p>Peer ID: {peerId}</p>
      <p>Status: {connectionState}</p>
    </div>
  );
}
```

### Guest Side

```typescript
import { useP2PConnection, useP2PImages } from '@/store/p2p';

function JoinGame({ hostId }: { hostId: string }) {
  const dispatch = useGameDispatch();
  const {
    state: connectionState,
    connectToHost,
    disconnect,
    imageProgress,
  } = useP2PConnection(dispatch);

  const handleJoin = async () => {
    const success = await connectToHost(hostId);
    if (!success) {
      alert('Failed to connect to host');
    }
  };

  return (
    <div>
      <button onClick={handleJoin}>Join Game</button>
      <p>Status: {connectionState}</p>
      {imageProgress.total > 0 && (
        <p>Images: {imageProgress.loaded}/{imageProgress.total} ({imageProgress.percent.toFixed(1)}%)</p>
      )}
    </div>
  );
}
```

## Integration with GameContext

To integrate with the existing GameContext:

1. Replace `usePeerConnection` with `useP2PConnection`
2. Initialize state sync manager with current game state
3. Send actions through the new system instead of directly via PeerJS

```typescript
// In GameContext.tsx
import { useP2PConnection, HostStateSyncManager } from '@/store/p2p';

const hostStateSyncRef = useRef<HostStateSyncManager | null>(null);

// Initialize when hosting
useEffect(() => {
  if (isHost && connectionState === 'CONNECTED') {
    hostStateSyncRef.current = new HostStateSyncManager();
    hostStateSyncRef.current.initialize(state);
  }
}, [isHost, connectionState]);

// Send actions
useEffect(() => {
  if (!isHost || !hostStateSyncRef.current) return;

  // Record and broadcast action
  hostStateSyncRef.current.recordAndBroadcast(lastAction, currentPlayerId);
}, [lastAction]);
```

## Message Flow

### Initial Connection (Guest Joins)

```
Guest                          Host
  |                              |
  |------ HANDSHAKE ------------->|
  |<----- HANDSHAKE_ACK ---------|
  |                              |
  |<----- IMAGE_MANIFEST --------|
  |                              |
  |------ IMAGE_REQUEST -------->|
  |<----- IMAGE_CHUNK (1/n) -----|
  |<----- IMAGE_CHUNK (2/n) -----|
  |...                            |
  |<----- IMAGE_CHUNK (n/n) -----|
  |                              |
  |<----- STATE_SNAPSHOT --------|
```

### During Game

```
Host performs action:
1. Apply locally
2. Record in action history
3. Broadcast to guests

Guest receives action:
1. Apply to local state
2. Send ACK (if reliable)
```

## Testing

To test the P2P system:

1. Start hosting in one browser window
2. Copy the Peer ID
3. Join as guest in another window with `?hostId=<ID>` in URL
4. Verify images load progressively
5. Verify actions sync correctly

## Migration from Old System

The old system files have been removed:

- ~~`store/usePeerConnection.ts`~~ (replaced by `useP2PConnection`)
- ~~`utils/webrtcSyncManager.ts`~~ (replaced by authoritative sync)
- ~~`utils/webrtcOptimization.ts`~~ (integrated into new system)

Note: This is a **full replacement** - all players must update to the new version to play together.
