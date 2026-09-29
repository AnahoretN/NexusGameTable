/**
 * Transport layer contract.
 *
 * A transport's ONLY job is to bring players into the same session and move
 * bytes: it knows nothing about the game protocol (HELO/SYNC_STATE/...) —
 * that lives in protocol.ts, and the session glue lives in useGameSession.ts.
 *
 * Duck-typed connection surface consumed by GameContext's sync core:
 *   connectionsRef entries: { peerId?, peer?, send(data, targetPeers?), open: boolean }
 *   hostConnectionRef:      { send(data) } | null
 */

export type PeerConnLike = {
  peer?: string;
  peerId?: string;
  send: (data: any, targetPeers?: any) => void;
  open: boolean;
};

export type ConnectionMethod = 'peerjs' | 'iroh' | 'trystero' | 'manual';

export interface Transport {
  readonly method: ConnectionMethod;

  /** Identifier used in invite URLs: hostId (peerjs), roomId (trystero), ticket (iroh). */
  getInviteIdentifier(): string | null;

  /** Host mode: create the room / peer and start accepting guests. */
  initializeHost(): Promise<void>;

  /** Guest mode: join via the invite identifier. */
  connectAsGuest(inviteId: string, playerName: string): Promise<void>;

  /** Incoming wire messages (already delivered as parsed objects). */
  onData(cb: (data: any, fromPeerId: string, conn: PeerConnLike) => void): () => void;

  /** A guest joined (host side) / the host is reachable (guest side). */
  onPeerJoin(cb: (peerId: string, conn: PeerConnLike) => void): () => void;

  onPeerLeave(cb: (peerId: string) => void): () => void;

  /** Guest → host send. */
  sendToHost(msg: any): void;

  /** Host → specific guest. */
  sendToPeer(msg: any, peerId: string): void;

  /** Host → all guests. */
  broadcastToGuests(msg: any): void;

  /** Duck-typed guest connections for GameContext's broadcast loop. */
  getGuestConnections(): PeerConnLike[];

  /** Idempotent teardown (beforeunload / method switch only — NOT on unmount). */
  close(): void;
}
