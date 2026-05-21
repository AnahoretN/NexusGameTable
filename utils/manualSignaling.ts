/**
 * Manual Signaling - Exchange SDP via copy/paste
 * Bypasses signaling server by using invite codes
 *
 * User flow:
 * 1. Host generates offer code → sends to guest via messenger
 * 2. Guest generates answer code → sends back to host
 * 3. Connection established!
 */

import { logger } from './logger';

export interface SignalingSession {
  id: string;
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  iceCandidates: RTCIceCandidateInit[];
}

export class ManualSignaling {
  private pc: RTCPeerConnection;
  private dataChannel: RTCDataChannel | null = null;
  private onMessageCallback: ((data: any) => void) | null = null;
  private onOpenCallback: (() => void) | null = null;

  constructor(isInitiator: boolean) {
    this.pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
        {
          urls: 'turn:openrelay.metered.ca:80',
          username: 'openrelayproject',
          credential: 'openrelayproject',
        },
      ],
    });

    this.setupIceCandidates();

    if (isInitiator) {
      this.setupDataChannel();
    } else {
      this.waitForDataChannel();
    }
  }

  private setupDataChannel() {
    this.dataChannel = this.pc.createDataChannel('game', {
      ordered: false,
    });

    this.dataChannel.onopen = () => {
      logger.log('[Manual Signaling] Data channel opened!');
      if (this.onOpenCallback) this.onOpenCallback();
    };

    this.dataChannel.onmessage = (event) => {
      if (this.onMessageCallback) {
        try {
          this.onMessageCallback(JSON.parse(event.data));
        } catch {
          this.onMessageCallback(event.data);
        }
      }
    };
  }

  private waitForDataChannel() {
    this.pc.ondatachannel = (event) => {
      this.dataChannel = event.channel;
      this.dataChannel.onopen = () => {
        logger.log('[Manual Signaling] Data channel opened!');
        if (this.onOpenCallback) this.onOpenCallback();
      };

      this.dataChannel.onmessage = (event) => {
        if (this.onMessageCallback) {
          try {
            this.onMessageCallback(JSON.parse(event.data));
          } catch {
            this.onMessageCallback(event.data);
          }
        }
      };
    };
  }

  private setupIceCandidates() {
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        // In manual signaling, we collect all candidates
        // They'll be sent along with the offer/answer
        logger.log('[Manual Signaling] ICE candidate gathered');
      }
    };
  }

  /**
   * HOST: Generate offer code to send to guest
   */
  async generateOffer(): Promise<string> {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    // Wait for ICE gathering to complete
    await new Promise<void>((resolve) => {
      if (this.pc.iceGatheringState === 'complete') {
        resolve();
      } else {
        this.pc.onicegatheringstatechange = () => {
          if (this.pc.iceGatheringState === 'complete') {
            resolve();
          }
        };
      }
    });

    // Encode offer as base64 for easy copy/paste
    const sessionData = {
      type: 'offer',
      sdp: this.pc.localDescription?.sdp,
    };

    return btoa(JSON.stringify(sessionData));
  }

  /**
   * GUEST: Accept offer code and generate answer
   */
  async acceptOffer(offerCode: string): Promise<string> {
    try {
      const sessionData = JSON.parse(atob(offerCode));

      if (sessionData.type !== 'offer') {
        throw new Error('Invalid offer code');
      }

      const offer: RTCSessionDescriptionInit = {
        type: 'offer',
        sdp: sessionData.sdp,
      };

      await this.pc.setRemoteDescription(offer);

      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);

      // Wait for ICE gathering
      await new Promise<void>((resolve) => {
        if (this.pc.iceGatheringState === 'complete') {
          resolve();
        } else {
          this.pc.onicegatheringstatechange = () => {
            if (this.pc.iceGatheringState === 'complete') {
              resolve();
            }
          };
        }
      });

      // Encode answer
      const answerData = {
        type: 'answer',
        sdp: this.pc.localDescription?.sdp,
      };

      return btoa(JSON.stringify(answerData));
    } catch (e) {
      logger.error('[Manual Signaling] Failed to accept offer:', e);
      throw e;
    }
  }

  /**
   * HOST: Accept answer code from guest
   */
  async acceptAnswer(answerCode: string): Promise<void> {
    try {
      const answerData = JSON.parse(atob(answerCode));

      if (answerData.type !== 'answer') {
        throw new Error('Invalid answer code');
      }

      const answer: RTCSessionDescriptionInit = {
        type: 'answer',
        sdp: answerData.sdp,
      };

      await this.pc.setRemoteDescription(answer);
      logger.log('[Manual Signaling] Connection complete!');
    } catch (e) {
      logger.error('[Manual Signaling] Failed to accept answer:', e);
      throw e;
    }
  }

  onMessage(callback: (data: any) => void): void {
    this.onMessageCallback = callback;
  }

  onOpen(callback: () => void): void {
    this.onOpenCallback = callback;
  }

  send(data: any): void {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(data));
    }
  }

  close(): void {
    if (this.dataChannel) {
      this.dataChannel.close();
    }
    this.pc.close();
  }

  isConnected(): boolean {
    return this.dataChannel?.readyState === 'open';
  }
}
