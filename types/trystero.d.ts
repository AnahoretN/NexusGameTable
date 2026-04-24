/**
 * Type declarations for Trystero
 *
 * Basic type definitions for the trystero library
 * Source: https://github.com/dmotz/trystero
 */

export interface TrysteroConfig {
  appId: string;
  trackers?: string[];
  serverUrl?: string;
  roomId?: string;
}

export interface TPeerRoom {
  send: (data: any) => void;
  onData: (callback: (data: any, peerId: string) => void) => () => void;
  onPeerJoin: (callback: (peerId: string) => void) => () => void;
  onPeerLeave: (callback: (peerId: string) => void) => () => void;
  leave: () => void;
  getPeers: () => string[];
}

export interface TrysteroNamespace {
  joinRoom: (config: TrysteroConfig, roomId?: string) => TPeerRoom;
}

export function joinRoom(config: TrysteroConfig, roomId?: string): TPeerRoom;

export default TrysteroNamespace;
