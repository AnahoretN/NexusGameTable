/**
 * P2P Asset Transfer Manager
 *
 * Manages asset transfer between host and guests using WebRTC.
 * Integrates with Web Worker for non-blocking transfers.
 */

import {
  AssetMessageType,
  AssetMessageFactory,
  type AssetMessage,
  type AssetManifestPayload,
  type AssetRequestPayload,
  type AssetChunkPayload,
  type AssetAckPayload,
  type AssetProgressPayload,
  type AssetCompletePayload,
  calculateChunkSize,
  calculateAssetPriority
} from './protocol/assetMessages';

import {
  assetDB,
  findMissingHashes,
  type AssetManifest,
  type AssetEntry
} from '../../utils/assets';

// ============================================================================
// TYPES
// ============================================================================

export interface TransferProgress {
  totalAssets: number;
  transferredAssets: number;
  totalBytes: number;
  transferredBytes: number;
  percentage: number;
  currentAsset?: string;
  bytesPerSecond?: number;
  estimatedSecondsRemaining?: number;
}

export type ProgressCallback = (progress: TransferProgress) => void;
export type CompleteCallback = (result: TransferResult) => void;
export type ErrorCallback = (error: TransferError) => void;

export interface TransferResult {
  success: boolean;
  sessionId: string;
  totalAssets: number;
  successfulAssets: number;
  failedAssets: string[];
  totalBytes: number;
  duration: number;
}

export interface TransferError {
  code: string;
  message: string;
  hash?: string;
  details?: any;
}

// DataChannel-like interface for WebRTC
export interface DataChannel {
  send(data: string | ArrayBuffer): void;
  onmessage?: (event: MessageEvent) => void;
  onopen?: () => void;
  onclose?: () => void;
  onerror?: (error: any) => void;
  readyState: 'connecting' | 'open' | 'closing' | 'closed';
}

// ============================================================================
// HOST SIDE: ASSET SENDER
// ============================================================================

export interface HostTransferConfig {
  sessionId: string;
  dataChannel: DataChannel;
  onProgress?: ProgressCallback;
  onComplete?: CompleteCallback;
  onError?: ErrorCallback;
  chunkSize?: number;
}

interface HostTransferState {
  sessionId: string;
  dataChannel: DataChannel;
  pendingRequests: Map<string, string[]>; // guestId -> hashes they need
  activeTransfers: Map<string, Set<string>>; // guestId -> currently transferring hashes
  transferStartTime: Map<string, number>; // guestId -> start time
  bytesTransferred: Map<string, number>; // guestId -> bytes sent
  totalBytesToSend: Map<string, number>; // guestId -> total bytes to send
}

class AssetTransferHost {
  private transfers = new Map<string, HostTransferState>();

  /**
   * Start a new transfer session for a guest
   */
  async startTransfer(config: HostTransferConfig): Promise<void> {
    const { sessionId, dataChannel } = config;

    // Check if already exists
    if (this.transfers.has(sessionId)) {
      throw new Error(`Transfer session ${sessionId} already exists`);
    }

    // Create state
    const state: HostTransferState = {
      sessionId,
      dataChannel,
      pendingRequests: new Map(),
      activeTransfers: new Map(),
      transferStartTime: new Map(),
      bytesTransferred: new Map(),
      totalBytesToSend: new Map()
    };

    this.transfers.set(sessionId, state);

    // Setup message handler
    dataChannel.onmessage = (event) => {
      this.handleMessage(sessionId, event.data, config);
    };

    // Send manifest to guest
    await this.sendManifest(sessionId);
  }

  /**
   * Send manifest of all assets to guest
   */
  private async sendManifest(sessionId: string): Promise<void> {
    const state = this.transfers.get(sessionId);
    if (!state) return;

    // Get all assets from database
    const manifest = await assetDB.getManifest();

    // Create manifest entries with priority
    const entries = manifest.assets.map(asset => ({
      hash: asset.hash,
      size: asset.size,
      mimeType: asset.mimeType,
      priority: calculateAssetPriority(asset.hash, asset.size, asset.mimeType)
    }));

    // Send manifest message
    const message = AssetMessageFactory.createManifest(sessionId, entries);
    this.sendMessage(state.dataChannel, message);
  }

  /**
   * Handle incoming message from guest
   */
  private async handleMessage(
    sessionId: string,
    data: string,
    config: HostTransferConfig
  ): Promise<void> {
    const state = this.transfers.get(sessionId);
    if (!state) return;

    let message: AssetMessage;

    try {
      message = JSON.parse(data);
    } catch {
      // Might be binary data, ignore
      return;
    }

    switch (message.type) {
      case AssetMessageType.REQUEST:
        await this.handleAssetRequest(sessionId, message.payload, config);
        break;

      case AssetMessageType.ACK:
        this.handleAck(sessionId, message.payload, config);
        break;

      case AssetMessageType.CANCEL:
        this.handleCancel(sessionId, message.payload);
        break;

      case AssetMessageType.ERROR:
        this.handleError(sessionId, message.payload, config);
        break;
    }
  }

  /**
   * Handle asset request from guest
   */
  private async handleAssetRequest(
    sessionId: string,
    payload: AssetRequestPayload,
    config: HostTransferConfig
  ): Promise<void> {
    const state = this.transfers.get(sessionId);
    if (!state) return;

    const { hashes } = payload;

    // Store pending request
    state.pendingRequests.set(sessionId, hashes);
    state.activeTransfers.set(sessionId, new Set());
    state.transferStartTime.set(sessionId, Date.now());
    state.bytesTransferred.set(sessionId, 0);

    // Calculate total bytes
    let totalBytes = 0;
    for (const hash of hashes) {
      const asset = await assetDB.getAsset(hash);
      if (asset) totalBytes += asset.size;
    }
    state.totalBytesToSend.set(sessionId, totalBytes);

    // Start streaming assets
    this.streamAssets(sessionId, hashes, config);
  }

  /**
   * Stream assets to guest
   */
  private async streamAssets(
    sessionId: string,
    hashes: string[],
    config: HostTransferConfig
  ): Promise<void> {
    const state = this.transfers.get(sessionId);
    if (!state) return;

    const { chunkSize } = config;

    for (const hash of hashes) {
      // Check if transfer was cancelled
      if (!state.transfers.has(sessionId)) return;

      try {
        const asset = await assetDB.getAsset(hash);
        if (!asset) {
          this.sendError(sessionId, {
            code: 'ASSET_NOT_FOUND',
            message: `Asset ${hash} not found`,
            hash
          }, config);
          continue;
        }

        // Add to active transfers
        state.activeTransfers.get(sessionId)!.add(hash);

        // Stream chunks
        await this.streamAssetChunks(sessionId, asset, chunkSize, config);

        // Remove from active
        state.activeTransfers.get(sessionId)!.delete(hash);

      } catch (error) {
        this.sendError(sessionId, {
          code: 'STREAM_ERROR',
          message: (error as Error).message,
          hash
        }, config);
      }
    }

    // Send complete message
    this.sendComplete(sessionId, config);
  }

  /**
   * Stream chunks for a single asset
   */
  private async streamAssetChunks(
    sessionId: string,
    asset: AssetEntry,
    chunkSize: number | undefined,
    config: HostTransferConfig
  ): Promise<void> {
    const state = this.transfers.get(sessionId);
    if (!state) return;

    const { hash, blob } = asset;
    const actualChunkSize = chunkSize || calculateChunkSize(blob.size);
    const totalChunks = Math.ceil(blob.size / actualChunkSize);

    for (let i = 0; i < totalChunks; i++) {
      // Check if transfer was cancelled
      if (!state.transfers.has(sessionId)) return;

      const start = i * actualChunkSize;
      const end = Math.min(start + actualChunkSize, blob.size);
      const chunk = blob.slice(start, end);

      // Convert to ArrayBuffer
      const arrayBuffer = await chunk.arrayBuffer();

      // Create chunk message
      const chunkMessage = AssetMessageFactory.createChunk(
        hash,
        i,
        totalChunks,
        arrayBuffer
      );

      // Send chunk
      this.sendMessage(state.dataChannel, chunkMessage);

      // Update progress
      const bytesTransferred = state.bytesTransferred.get(sessionId)! + end - start;
      state.bytesTransferred.set(sessionId, bytesTransferred);

      if (config.onProgress) {
        const totalBytes = state.totalBytesToSend.get(sessionId)!;
        const transferredAssets = Array.from(state.activeTransfers.values())
          .reduce((sum, set) => sum + set.size, 0);

        config.onProgress({
          totalAssets: state.pendingRequests.get(sessionId)!.length,
          transferredAssets,
          totalBytes,
          transferredBytes: bytesTransferred,
          percentage: Math.round((bytesTransferred / totalBytes) * 100),
          currentAsset: hash
        });
      }

      // Small delay to prevent overwhelming channel
      if (i < totalChunks - 1) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
  }

  /**
   * Handle ACK from guest
   */
  private handleAck(
    sessionId: string,
    payload: AssetAckPayload,
    config: HostTransferConfig
  ): void {
    // Could be used for flow control or retransmission
    // For now, we just log it
    console.debug(`[AssetTransfer] ACK for ${payload.hash}, chunk ${payload.chunkIndex}`);
  }

  /**
   * Handle cancel from guest
   */
  private handleCancel(sessionId: string, payload: any): void {
    this.stopTransfer(sessionId);
  }

  /**
   * Handle error from guest
   */
  private handleError(
    sessionId: string,
    payload: any,
    config: HostTransferConfig
  ): void {
    if (config.onError) {
      config.onError({
        code: payload.code,
        message: payload.message,
        hash: payload.hash
      });
    }
  }

  /**
   * Send complete message
   */
  private sendComplete(sessionId: string, config: HostTransferConfig): void {
    const state = this.transfers.get(sessionId);
    if (!state) return;

    const startTime = state.transferStartTime.get(sessionId)!;
    const duration = Date.now() - startTime;
    const totalBytes = state.totalBytesToSend.get(sessionId)!;
    const hashes = state.pendingRequests.get(sessionId)!;

    const message = AssetMessageFactory.createComplete(
      sessionId,
      hashes.length,
      hashes.length,
      [],
      totalBytes,
      duration
    );

    this.sendMessage(state.dataChannel, message);

    if (config.onComplete) {
      config.onComplete({
        success: true,
        sessionId,
        totalAssets: hashes.length,
        successfulAssets: hashes.length,
        failedAssets: [],
        totalBytes,
        duration
      });
    }
  }

  /**
   * Send error message
   */
  private sendError(
    sessionId: string,
    error: TransferError,
    config: HostTransferConfig
  ): void {
    const state = this.transfers.get(sessionId);
    if (!state) return;

    const message = AssetMessageFactory.createError(
      error.code as any,
      error.message,
      error.hash,
      error.details
    );

    this.sendMessage(state.dataChannel, message);

    if (config.onError) {
      config.onError(error);
    }
  }

  /**
   * Stop transfer session
   */
  stopTransfer(sessionId: string): void {
    const state = this.transfers.get(sessionId);
    if (state) {
      this.transfers.delete(sessionId);
    }
  }

  /**
   * Send message through data channel
   */
  private sendMessage(channel: DataChannel, message: AssetMessage): void {
    if (channel.readyState === 'open') {
      // For binary messages (chunks), send as ArrayBuffer
      if (message.type === AssetMessageType.CHUNK) {
        const payload = message.payload as AssetChunkPayload;
        channel.send(payload.data);
      } else {
        channel.send(JSON.stringify(message));
      }
    }
  }
}

// ============================================================================
// GUEST SIDE: ASSET RECEIVER
// ============================================================================

export interface GuestTransferConfig {
  sessionId: string;
  dataChannel: DataChannel;
  onProgress?: ProgressCallback;
  onComplete?: CompleteCallback;
  onError?: ErrorCallback;
}

interface GuestTransferState {
  sessionId: string;
  dataChannel: DataChannel;
  assetBuffers: Map<string, ArrayBuffer[]>;
  expectedChunks: Map<string, number>;
  receivedAssets: Set<string>;
  totalAssets: number;
  totalBytes: number;
  startTime: number;
}

class AssetTransferGuest {
  private transfers = new Map<string, GuestTransferState>();

  /**
   * Start receiving assets from host
   */
  async startReceiving(config: GuestTransferConfig): Promise<void> {
    const { sessionId, dataChannel } = config;

    if (this.transfers.has(sessionId)) {
      throw new Error(`Transfer session ${sessionId} already exists`);
    }

    const state: GuestTransferState = {
      sessionId,
      dataChannel,
      assetBuffers: new Map(),
      expectedChunks: new Map(),
      receivedAssets: new Set(),
      totalAssets: 0,
      totalBytes: 0,
      startTime: Date.now()
    };

    this.transfers.set(sessionId, state);

    // Setup message handler
    dataChannel.onmessage = (event) => {
      this.handleMessage(sessionId, event.data, config);
    };
  }

  /**
   * Handle incoming message from host
   */
  private async handleMessage(
    sessionId: string,
    data: string | ArrayBuffer,
    config: GuestTransferConfig
  ): Promise<void> {
    const state = this.transfers.get(sessionId);
    if (!state) return;

    // Handle binary data (chunk)
    if (data instanceof ArrayBuffer) {
      // Chunks are handled via a different mechanism
      // For now, we'll handle them in the text message handler
      return;
    }

    let message: AssetMessage;

    try {
      message = JSON.parse(data as string);
    } catch {
      return;
    }

    switch (message.type) {
      case AssetMessageType.MANIFEST:
        await this.handleManifest(sessionId, message.payload, config);
        break;

      case AssetMessageType.CHUNK:
        await this.handleChunk(sessionId, message.payload, config);
        break;

      case AssetMessageType.PROGRESS:
        this.handleProgress(sessionId, message.payload, config);
        break;

      case AssetMessageType.COMPLETE:
        this.handleComplete(sessionId, message.payload, config);
        break;

      case AssetMessageType.ERROR:
        this.handleError(sessionId, message.payload, config);
        break;
    }
  }

  /**
   * Handle manifest from host
   */
  private async handleManifest(
    sessionId: string,
    payload: AssetManifestPayload,
    config: GuestTransferConfig
  ): Promise<void> {
    const state = this.transfers.get(sessionId);
    if (!state) return;

    state.totalAssets = payload.totalCount;
    state.totalBytes = payload.totalSize;

    // Find which assets we're missing
    const hashes = payload.assets.map(a => a.hash);
    const missingHashes = await findMissingHashes(hashes);

    // Request missing assets
    if (missingHashes.length > 0) {
      const message = AssetMessageFactory.createRequest(
        sessionId,
        missingHashes
      );
      this.sendMessage(state.dataChannel, message);
    } else {
      // We have all assets, complete immediately
      if (config.onComplete) {
        config.onComplete({
          success: true,
          sessionId,
          totalAssets: state.totalAssets,
          successfulAssets: state.totalAssets,
          failedAssets: [],
          totalBytes: state.totalBytes,
          duration: Date.now() - state.startTime
        });
      }
    }
  }

  /**
   * Handle chunk from host
   */
  private async handleChunk(
    sessionId: string,
    payload: AssetChunkPayload,
    config: GuestTransferConfig
  ): Promise<void> {
    const state = this.transfers.get(sessionId);
    if (!state) return;

    const { hash, chunkIndex, totalChunks, data } = payload;

    // Initialize buffer for this asset
    if (!state.assetBuffers.has(hash)) {
      state.assetBuffers.set(hash, []);
      state.expectedChunks.set(hash, totalChunks);
    }

    // Store chunk
    const buffers = state.assetBuffers.get(hash)!;
    buffers[chunkIndex] = data;

    // Send ACK
    const ackMessage = AssetMessageFactory.createAck(hash, chunkIndex, true);
    this.sendMessage(state.dataChannel, ackMessage);

    // Check if asset is complete
    const receivedChunks = buffers.filter(b => b !== undefined).length;
    if (receivedChunks === totalChunks) {
      // Assemble complete asset
      const completeBlob = new Blob(buffers, { type: 'image/png' });

      // Save to IndexedDB
      await assetDB.putAsset(
        { hash, value: hash.replace('sha256:', ''), algorithm: 'SHA-256' },
        completeBlob,
        'image/png',
        'transfer'
      );

      // Mark as received
      state.receivedAssets.add(hash);

      // Clean up buffers
      state.assetBuffers.delete(hash);
      state.expectedChunks.delete(hash);

      // Report progress
      if (config.onProgress) {
        config.onProgress({
          totalAssets: state.totalAssets,
          transferredAssets: state.receivedAssets.size,
          totalBytes: state.totalBytes,
          transferredBytes: 0, // Would need to track this
          percentage: Math.round((state.receivedAssets.size / state.totalAssets) * 100),
          currentAsset: hash
        });
      }
    }
  }

  /**
   * Handle progress update from host
   */
  private handleProgress(
    sessionId: string,
    payload: AssetProgressPayload,
    config: GuestTransferConfig
  ): void {
    if (config.onProgress) {
      const state = this.transfers.get(sessionId);
      if (!state) return;

      config.onProgress({
        totalAssets: state.totalAssets,
        transferredAssets: state.receivedAssets.size,
        totalBytes: state.totalBytes,
        transferredBytes: payload.bytesTransferred,
        percentage: payload.percentage,
        currentAsset: payload.hash,
        bytesPerSecond: payload.bytesPerSecond,
        estimatedSecondsRemaining: payload.estimatedSecondsRemaining
      });
    }
  }

  /**
   * Handle complete message from host
   */
  private handleComplete(
    sessionId: string,
    payload: AssetCompletePayload,
    config: GuestTransferConfig
  ): void {
    const state = this.transfers.get(sessionId);
    if (!state) return;

    if (config.onComplete) {
      config.onComplete({
        success: true,
        sessionId,
        totalAssets: payload.totalAssets,
        successfulAssets: payload.successfulAssets,
        failedAssets: payload.failedAssets,
        totalBytes: payload.totalBytes,
        duration: payload.duration
      });
    }

    // Clean up
    this.transfers.delete(sessionId);
  }

  /**
   * Handle error from host
   */
  private handleError(
    sessionId: string,
    payload: any,
    config: GuestTransferConfig
  ): void {
    if (config.onError) {
      config.onError({
        code: payload.code,
        message: payload.message,
        hash: payload.hash
      });
    }
  }

  /**
   * Stop receiving
   */
  stopReceiving(sessionId: string): void {
    const state = this.transfers.get(sessionId);
    if (state) {
      this.transfers.delete(sessionId);
    }
  }

  /**
   * Send message through data channel
   */
  private sendMessage(channel: DataChannel, message: AssetMessage): void {
    if (channel.readyState === 'open') {
      channel.send(JSON.stringify(message));
    }
  }
}

// ============================================================================
// SINGLETON EXPORTS
// ============================================================================

export const assetTransferHost = new AssetTransferHost();
export const assetTransferGuest = new AssetTransferGuest();
