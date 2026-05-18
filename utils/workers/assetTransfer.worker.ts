/**
 * Asset Transfer Web Worker
 *
 * Handles P2P asset transfer in a background thread to prevent UI freezing.
 * Has direct access to IndexedDB for reading assets.
 *
 * Host side: Reads assets from IndexedDB, chunks them, sends via provided channel
 * Guest side: Receives chunks, assembles them, saves to IndexedDB
 */

// ============================================================================
// TYPES
// ============================================================================

interface WorkerMessage {
  type: string;
  id: string;
  data?: any;
}

interface AssetData {
  hash: string;
  size: number;
  mimeType: string;
}

interface ChunkData {
  hash: string;
  chunkIndex: number;
  totalChunks: number;
  data: ArrayBuffer;
}

interface TransferRequest {
  id: string;
  hashes: string[];
  channelId: string;
  chunkSize?: number;
}

interface ReceiveRequest {
  id: string;
  expectedChunks: number;
  channelId: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DB_NAME = 'NexusGameTable_Assets';
const DB_VERSION = 1;
const STORE_ASSETS = 'assets';
const DEFAULT_CHUNK_SIZE = 32 * 1024; // 32KB chunks
const MAX_CHUNK_SIZE = 64 * 1024; // 64KB max
const MIN_CHUNK_SIZE = 16 * 1024; // 16KB min

// ============================================================================
// INDEXEDDB (Worker-side)
// ============================================================================

let db: IDBDatabase | null = null;

async function initDB(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      if (!database.objectStoreNames.contains(STORE_ASSETS)) {
        const store = database.createObjectStore(STORE_ASSETS, { keyPath: 'hash' });
        store.createIndex('lastAccess', 'lastAccess', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
  });
}

async function getAssetBlob(hash: string): Promise<Blob | null> {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_ASSETS], 'readonly');
    const store = transaction.objectStore(STORE_ASSETS);
    const request = store.get(hash);

    request.onsuccess = () => {
      const entry = request.result;
      resolve(entry?.blob || null);
    };
    request.onerror = () => reject(request.error);
  });
}

async function saveAssetBlob(
  hash: string,
  blob: Blob,
  mimeType: string,
  source: string = 'transfer'
): Promise<void> {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_ASSETS], 'readwrite');
    const store = transaction.objectStore(STORE_ASSETS);

    const entry = {
      hash,
      blob,
      mimeType,
      size: blob.size,
      createdAt: Date.now(),
      lastAccess: Date.now(),
      source
    };

    const request = store.put(entry);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// ============================================================================
// CHUNKING
// ============================================================================

/**
 * Split blob into chunks of specified size
 */
function chunkBlob(blob: Blob, chunkSize: number): ArrayBuffer[] {
  const chunks: ArrayBuffer[] = [];
  const totalSize = blob.size;

  for (let offset = 0; offset < totalSize; offset += chunkSize) {
    const end = Math.min(offset + chunkSize, totalSize);
    chunks.push(blob.slice(offset, end));
  }

  return chunks;
}

// ============================================================================
// HOST SIDE: ASSET SENDER
// ============================================================================

interface ActiveTransfer {
  id: string;
  hashes: string[];
  chunksSent: Map<string, number>;
  totalChunks: Map<string, number>;
  sendChannel: (data: ChunkData) => void;
  chunkSize: number;
}

const activeTransfers = new Map<string, ActiveTransfer>();

async function startTransfer(request: TransferRequest, sendChannel: (data: ChunkData) => void): Promise<void> {
  const { id, hashes, chunkSize = DEFAULT_CHUNK_SIZE } = request;

  // Validate chunk size
  const actualChunkSize = Math.max(MIN_CHUNK_SIZE, Math.min(MAX_CHUNK_SIZE, chunkSize));

  const transfer: ActiveTransfer = {
    id,
    hashes,
    chunksSent: new Map(),
    totalChunks: new Map(),
    sendChannel,
    chunkSize: actualChunkSize
  };

  activeTransfers.set(id, transfer);

  // Send manifest first
  const manifest = await buildManifest(hashes);
  postMessage({
    type: 'manifest',
    id,
    data: manifest
  });

  // Start streaming assets
  streamAssets(transfer);
}

async function buildManifest(hashes: string[]): Promise<AssetData[]> {
  const manifest: AssetData[] = [];

  for (const hash of hashes) {
    const blob = await getAssetBlob(hash);
    if (blob) {
      manifest.push({
        hash,
        size: blob.size,
        mimeType: blob.type
      });
    }
  }

  return manifest;
}

async function streamAssets(transfer: ActiveTransfer): Promise<void> {
  const { hashes, chunkSize, sendChannel } = transfer;

  for (const hash of hashes) {
    try {
      const blob = await getAssetBlob(hash);
      if (!blob) {
        postMessage({
          type: 'error',
          id: transfer.id,
          data: { hash, error: 'Asset not found in database' }
        });
        continue;
      }

      // Chunk the blob
      const chunks = chunkBlob(blob, chunkSize);
      transfer.totalChunks.set(hash, chunks.length);

      // Send each chunk
      for (let i = 0; i < chunks.length; i++) {
        const chunkData: ChunkData = {
          hash,
          chunkIndex: i,
          totalChunks: chunks.length,
          data: chunks[i]
        };

        sendChannel(chunkData);
        transfer.chunksSent.set(hash, i + 1);

        // Report progress
        if (i % 10 === 0 || i === chunks.length - 1) {
          postMessage({
            type: 'progress',
            id: transfer.id,
            data: {
              hash,
              chunkIndex: i,
              totalChunks: chunks.length,
              bytesTransferred: (i + 1) * chunkSize,
              totalBytes: blob.size
            }
          });
        }

        // Small delay to prevent overwhelming the channel
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      // Asset complete
      postMessage({
        type: 'assetComplete',
        id: transfer.id,
        data: { hash }
      });

    } catch (error) {
      postMessage({
        type: 'error',
        id: transfer.id,
        data: { hash, error: (error as Error).message }
      });
    }
  }

  // All assets sent
  postMessage({
    type: 'transferComplete',
    id: transfer.id,
    data: {
      totalAssets: hashes.length,
      successfulAssets: Array.from(transfer.totalChunks.keys()).length
    }
  });

  activeTransfers.delete(transfer.id);
}

function cancelTransfer(id: string): void {
  const transfer = activeTransfers.get(id);
  if (transfer) {
    activeTransfers.delete(id);
    postMessage({
      type: 'cancelled',
      id
    });
  }
}

// ============================================================================
// GUEST SIDE: ASSET RECEIVER
// ============================================================================

interface ActiveReception {
  id: string;
  assetBuffers: Map<string, ArrayBuffer[]>;
  expectedChunks: Map<string, number>;
  receiveChannel: (data: ArrayBuffer) => void;
}

const activeReceptions = new Map<string, ActiveReception>();

function startReception(request: ReceiveRequest): void {
  const { id, expectedChunks } = request;

  const reception: ActiveReception = {
    id,
    assetBuffers: new Map(),
    expectedChunks: new Map(),
    receiveChannel: () => {} // Will be set by main thread
  };

  activeReceptions.set(id, reception);

  postMessage({
    type: 'receptionReady',
    id
  });
}

function handleChunk(data: ChunkData, receptionId: string): void {
  const reception = activeReceptions.get(receptionId);
  if (!reception) return;

  const { hash, chunkIndex, totalChunks, data: chunkData } = data;

  // Initialize buffer for this asset if needed
  if (!reception.assetBuffers.has(hash)) {
    reception.assetBuffers.set(hash, []);
    reception.expectedChunks.set(hash, totalChunks);
  }

  // Store chunk
  const buffers = reception.assetBuffers.get(hash)!;
  buffers[chunkIndex] = chunkData;

  // Check if asset is complete
  if (buffers.filter(Boolean).length === totalChunks) {
    // Assemble complete blob
    const mimeType = detectMimeType(hash);
    const blob = new Blob(buffers, { type: mimeType });

    // Save to IndexedDB
    saveAssetBlob(hash, blob, mimeType, 'transfer')
      .then(() => {
        postMessage({
          type: 'assetReceived',
          id: receptionId,
          data: {
            hash,
            size: blob.size,
            mimeType
          }
        });

        // Clean up buffers
        reception.assetBuffers.delete(hash);
        reception.expectedChunks.delete(hash);
      })
      .catch((error) => {
        postMessage({
          type: 'error',
          id: receptionId,
          data: { hash, error: error.message }
        });
      });
  }
}

function detectMimeType(hash: string): string {
  // Try to detect from hash or use default
  // In real implementation, this would come from manifest
  return 'image/png';
}

function cancelReception(id: string): void {
  const reception = activeReceptions.get(id);
  if (reception) {
    activeReceptions.delete(id);
    postMessage({
      type: 'receptionCancelled',
      id
    });
  }
}

// ============================================================================
// MESSAGE HANDLER
// ============================================================================

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { type, id, data } = event.data;

  try {
    switch (type) {
      case 'startTransfer':
        await startTransfer(
          data as TransferRequest,
          (chunkData) => {
            postMessage({
              type: 'chunk',
              id,
              data: chunkData
            });
          }
        );
        break;

      case 'cancelTransfer':
        cancelTransfer(id);
        break;

      case 'startReception':
        startReception(data as ReceiveRequest);
        break;

      case 'cancelReception':
        cancelReception(id);
        break;

      case 'chunk':
        handleChunk(data as ChunkData, id);
        break;

      case 'ping':
        postMessage({ type: 'pong', id });
        break;

      default:
        postMessage({
          type: 'error',
          id,
          data: { error: `Unknown message type: ${type}` }
        });
    }
  } catch (error) {
    postMessage({
      type: 'error',
      id,
      data: { error: (error as Error).message }
    });
  }
};

// ============================================================================
// CLEANUP
// ============================================================================

self.onclose = () => {
  if (db) {
    db.close();
  }
};
