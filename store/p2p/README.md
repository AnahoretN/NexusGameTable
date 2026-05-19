# P2P System Documentation

## Overview

The Nexus Game Table uses a simplified WebRTC-based P2P system for multiplayer game synchronization. The system uses PeerJS for signaling and direct WebRTC connections for data transfer between host and guests.

## Key Features

1. **Direct PeerJS Connection**: Uses PeerJS cloud servers for signaling
2. **Fallback Connection**: Supports multiple connection methods (PeerJS Cloud, community servers, Trystero torrent trackers)
3. **Simplified Asset Sync**: Guests load asset packs locally instead of P2P transfer
4. **Action-Based State Sync**: Game state synchronized via action messages
5. **Progressive Loading**: Visual feedback during connection process

## Architecture

```
store/
├── usePeerConnection.ts    # Main P2P hook (host + guest logic)
└── p2p/
    ├── index.ts            # Utility exports (ActionBatcher, etc.)
    ├── actionBatcher.ts    # Action batching for optimization
    └── idleWorkScheduler.ts # Idle work scheduling
```

## Current System (as of 0.2.5)

### Connection Flow

#### Guest Joins Game

```
1. Guest opens URL with ?hostId=<host_peer_id>
2. Modal appears asking for player name
3. Guest connects to signaling server (PeerJS)
4. P2P connection established with host
5. Handshake: Guest sends HELO message
6. Host sends PACKS_NEEDED (list of required asset packs)
7. Host sends SYNC_STATE (full game state)
8. If packs needed: Guest loads packs locally via modal
9. Guest sends PACK_LOADED confirmations
10. Game ready!
```

#### Message Types

| Type | Direction | Description |
|------|-----------|-------------|
| `HELO` | Guest → Host | Guest introduction with player info |
| `PACKS_NEEDED` | Host → Guest | List of required asset packs |
| `PACK_LOADED` | Guest → Host | Confirmation that pack was loaded |
| `SYNC_STATE` | Host → Guest | Full game state snapshot |
| `ACTION` | Guest → Host | Game action from guest |
| `POSITION_UPDATE` | Both | Batched position updates |
| `PLAYER_PANEL_SETTINGS` | Host → Guest | Individual panel settings |

### Asset Sync System (Simplified)

**Old System (Removed):**
- Images transferred via WebRTC binary chunks
- Complex progress tracking
- Slow for large games

**New System:**
1. Host tracks which packs are used in `state.usedPacks`
2. On guest join, host sends `PACKS_NEEDED` with pack list
3. Guest loads packs locally from disk
4. Guest verifies pack hash matches expected
5. Guest sends `PACK_LOADED` confirmation
6. Images render from guest's local IndexedDB

### Loading Steps

Guest sees 5 loading steps:

1. **Connect** - Connecting to signaling server
2. **P2P** - Establishing WebRTC connection
3. **Handshake** - Exchanging initial messages
4. **Packs** - Loading asset packs (if needed)
5. **State** - Synchronizing game state

## Usage

### Host Side

```typescript
import { usePeerConnection } from './usePeerConnection';

function GameComponent() {
  const dispatch = useGameDispatch();
  const stateRef = useRef(state);

  const {
    peerId,
    isHost,
    connectionStatus,
    initializeHost,
    connectionsRef,
  } = usePeerConnection(dispatch, stateRef);

  // Initialize host when user clicks Invite
  const handleInvite = () => {
    initializeHost();
    // Share peerId with players
  };

  return (
    <div>
      <button onClick={handleInvite}>Invite Players</button>
      <p>Share this ID: {peerId}</p>
      <p>Connected: {connectionsRef.current.length} players</p>
    </div>
  );
}
```

### Guest Side

```typescript
function JoinGame() {
  const dispatch = useGameDispatch();
  const stateRef = useRef(state);

  const {
    isHost,
    connectionStatus,
    waitingForPlayerName,
    setPlayerName,
    requiredPacks,
    isPackModalOpen,
    onPackLoaded,
  } = usePeerConnection(dispatch, stateRef);

  return (
    <div>
      {waitingForPlayerName && (
        <PlayerNameModal
          onSubmit={setPlayerName}
        />
      )}
      {isPackModalOpen && (
        <PackDownloadModal
          isOpen={isPackModalOpen}
          requiredPacks={requiredPacks}
          onPackLoaded={onPackLoaded}
          onCancel={() => {}}
          dispatch={dispatch}
        />
      )}
    </div>
  );
}
```

## Connection Fallback System

The system tries multiple connection methods in order:

1. **PeerJS Cloud Servers** (parallel attempt)
   - `0.peerjs.com`, `1.peerjs.com`, `2.peerjs.com`
   - 8-second timeout per server

2. **Community Servers** (if configured)
   - User-configured servers from settings
   - Same parallel approach

3. **Trystero Torrent Trackers** (if enabled)
   - Decentralized signaling via BitTorrent trackers
   - 20-second timeout

## State Management

### usedPacks

Tracks which asset packs are required for the current game:

```typescript
interface PackInfo {
  name: string;       // Pack filename
  hash: string;       // SHA-256 for verification
  size: number;       // File size in bytes
  imageCount: number; // Number of images
  required: boolean;  // Always true currently
}

interface GameState {
  // ... other fields ...
  usedPacks: Record<string, PackInfo>;
}
```

### Registering Packs

When host loads a pack, it's registered via action:

```typescript
dispatch({
  type: 'REGISTER_PACK',
  payload: {
    packName: 'my-assets',
    packHash: 'abc123...',
    packSize: 12345678,
    imageCount: 500
  }
});
```

## Removed Systems

The following have been removed in simplification:

- `store/p2p/hooks/` - Old hook-based system
- `store/p2p/connection/` - Connection manager
- `store/p2p/images/` - Image manifest/transfer
- `store/p2p/state/` - State sync manager
- `store/p2p/protocol/` - Message protocol definitions
- `store/p2p/assetTransfer.ts` - WebRTC binary transfer
- `utils/workers/assetTransfer.worker.ts` - Transfer worker

## Debugging

### Console Commands

```javascript
// Check P2P status
nexusP2PDebug.getDiagnostics();

// Test connection to host
nexusP2PDebug.testConnection('host-id-here');

// Compression stats
nexusP2PDebug.getCompressionStats();
```

### Log Messages

Look for these prefixes in console:
- `[P2P Init]` - Initialization
- `[P2P Guest]` - Guest-side events
- `[P2P Host]` - Host-side events
- `[Connect]` - Connection attempts
- `[P2P Network]` - Message handling

## Troubleshooting

### Guest can't connect

1. Check firewall allows WebRTC (UDP ports)
2. Try different network (avoid symmetric NAT)
3. Enable Trystero fallback in settings
4. Check browser console for errors

### Pack modal doesn't appear

1. Check if host has `usedPacks` in state
2. Look for `[P2P Host] 📦 Sending PACKS_NEEDED` message
3. Look for `[P2P Network] 📦 Received PACKS_NEEDED` message
4. Verify pack was registered with `REGISTER_PACK` action

### Images don't load for guest

1. Verify guest loaded correct pack (hash match)
2. Check IndexedDB has the images
3. Look for `PACK_LOADED` confirmation in console
