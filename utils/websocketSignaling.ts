/**
 * Simple WebSocket Signaling Server for WebRTC
 * Fallback when PeerJS signaling doesn't work
 *
 * This uses a free public WebSocket echo server for signaling.
 * In production, you'd use your own WebSocket server.
 */

import { logger } from './logger';

// Free public WebSocket servers suitable for signaling
const FALLBACK_SIGNALING_SERVERS = [
  'wss://echo.websocket.org',  // WebSocket echo server
  'wss://socketsbay.com/wss/v2/1/demo/',  // Another echo server
];

interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'ping';
  senderId: string;
  targetId: string;
  data: any;
}

export class WebSocketSignaling {
  private ws: WebSocket | null = null;
  private roomId: string;
  private peerId: string;
  private messageHandlers: Map<string, (data: any) => void> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(roomId: string, peerId: string) {
    this.roomId = roomId;
    this.peerId = peerId;
  }

  async connect(): Promise<void> {
    for (const serverUrl of FALLBACK_SIGNALING_SERVERS) {
      try {
        logger.log(`[WS Signaling] Connecting to ${serverUrl}...`);
        this.ws = new WebSocket(serverUrl);

        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);

          this.ws!.onopen = () => {
            clearTimeout(timeout);
            logger.log(`[WS Signaling] Connected to ${serverUrl}`);
            this.setupMessageHandler();
            resolve(undefined);
          };

          this.ws!.onerror = (err) => {
            clearTimeout(timeout);
            reject(err);
          };
        });

        return; // Success
      } catch (e) {
        logger.error(`[WS Signaling] Failed to connect to ${serverUrl}:`, e);
        continue; // Try next server
      }
    }

    throw new Error('All signaling servers failed');
  }

  private setupMessageHandler() {
    if (!this.ws) return;

    this.ws.onmessage = (event) => {
      try {
        const message: SignalingMessage = JSON.parse(event.data);

        // Only process messages for this peer or room
        if (message.targetId === this.peerId || message.targetId === this.roomId) {
          const handler = this.messageHandlers.get(message.type);
          if (handler) {
            handler(message.data);
          }
        }
      } catch (e) {
        // Ignore non-JSON messages (echo servers may send them)
      }
    };

    this.ws.onclose = () => {
      logger.log('[WS Signaling] Connection closed, reconnecting in 5s...');
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => this.connect(), 5000);
    };
  }

  send(type: string, targetId: string, data: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.error('[WS Signaling] Cannot send, not connected');
      return;
    }

    const message: SignalingMessage = {
      type: type as any,
      senderId: this.peerId,
      targetId: targetId,
      data,
    };

    this.ws.send(JSON.stringify(message));
  }

  on(type: string, handler: (data: any) => void): void {
    this.messageHandlers.set(type, handler);
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

/**
 * Create a simple WebRTC data connection using WebSocket signaling
 * This bypasses PeerJS entirely and uses pure WebRTC
 */
export async function createDirectDataConnection(
  roomId: string,
  isInitiator: boolean
): Promise<RTCDataChannel | null> {
  const peerId = crypto.randomUUID();

  // Create RTCPeerConnection with our ICE servers
  const config = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
    ],
  };

  const pc = new RTCPeerConnection(config);

  // Create data channel (initiator only)
  let dataChannel: RTCDataChannel | null = null;

  if (isInitiator) {
    dataChannel = pc.createDataChannel('game', {
      ordered: false, // Faster delivery
    });

    await new Promise<void>((resolve) => {
      dataChannel!.onopen = () => {
        logger.log('[Direct P2P] Data channel opened!');
        resolve();
      };
    });
  } else {
    await new Promise<void>((resolve) => {
      pc.ondatachannel = (event) => {
        dataChannel = event.channel;
        dataChannel.onopen = () => {
          logger.log('[Direct P2P] Data channel opened!');
          resolve();
        };
      };
    });
  }

  // TODO: Implement signaling exchange via WebSocket
  // This is a simplified version - full implementation would need:
  // 1. WebSocket signaling server
  // 2. SDP offer/answer exchange
  // 3. ICE candidate exchange

  return dataChannel;
}
