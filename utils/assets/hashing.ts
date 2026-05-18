/**
 * Content-Addressable Storage - Hashing Module
 *
 * Provides cryptographic SHA-256 hashing for asset deduplication.
 * Uses Web Crypto API for performant, secure hashing.
 */

// ============================================================================
// CONSTANTS
// ============================================================================

export const HASH_PREFIX = 'sha256:';
export const HASH_ALGORITHM = 'SHA-256';

// ============================================================================
// TYPES
// ============================================================================

export interface HashResult {
  hash: string;           // Full hash with prefix (e.g., "sha256:a1b2c3...")
  value: string;          // Hash value without prefix
  algorithm: string;      // Algorithm used (always "SHA-256")
}

export type HashInput = Blob | ArrayBuffer | Uint8Array | string;

// ============================================================================
// HASHING FUNCTIONS
// ============================================================================

/**
 * Convert various input types to ArrayBuffer for hashing
 */
async function inputToArrayBuffer(input: HashInput): Promise<ArrayBuffer> {
  if (input instanceof ArrayBuffer) {
    return input;
  }

  if (input instanceof Uint8Array) {
    return input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
  }

  if (input instanceof Blob) {
    return await input.arrayBuffer();
  }

  // String input - encode as UTF-8
  const encoder = new TextEncoder();
  return encoder.encode(input).buffer;
}

/**
 * Convert ArrayBuffer to hex string
 */
function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Compute SHA-256 hash of input data
 *
 * @param input - Data to hash (Blob, ArrayBuffer, Uint8Array, or string)
 * @returns HashResult with full hash and metadata
 */
export async function computeSHA256(input: HashInput): Promise<HashResult> {
  const buffer = await inputToArrayBuffer(input);

  // Use Web Crypto API for secure hashing
  const hashBuffer = await crypto.subtle.digest(HASH_ALGORITHM, buffer);
  const hashValue = bufferToHex(hashBuffer);

  return {
    hash: `${HASH_PREFIX}${hashValue}`,
    value: hashValue,
    algorithm: HASH_ALGORITHM
  };
}

/**
 * Compute SHA-256 hash and return only the hash string with prefix
 *
 * Convenience function for most use cases.
 *
 * @param input - Data to hash
 * @returns Hash string with prefix (e.g., "sha256:a1b2c3...")
 */
export async function hashAsset(input: HashInput): Promise<string> {
  const result = await computeSHA256(input);
  return result.hash;
}

/**
 * Check if a string is a valid SHA-256 hash (with or without prefix)
 */
export function isValidHash(hash: string): boolean {
  const withoutPrefix = hash.replace(HASH_PREFIX, '');
  return /^[a-f0-9]{64}$/.test(withoutPrefix);
}

/**
 * Extract hash value without prefix
 */
export function getHashValue(hash: string): string {
  return hash.replace(HASH_PREFIX, '');
}

/**
 * Add hash prefix if not present
 */
export function normalizeHash(hash: string): string {
  if (hash.startsWith(HASH_PREFIX)) {
    return hash;
  }
  return `${HASH_PREFIX}${hash}`;
}

/**
 * Compare two hashes (works with or without prefix)
 */
export function hashesEqual(hash1: string, hash2: string): boolean {
  return normalizeHash(hash1) === normalizeHash(hash2);
}

// ============================================================================
// BATCH HASHING
// ============================================================================

/**
 * Compute hashes for multiple inputs in parallel
 *
 * @param inputs - Array of data to hash
 * @returns Map of index to hash result
 */
export async function hashBatch(inputs: HashInput[]): Promise<Map<number, HashResult>> {
  const results = new Map<number, HashResult>();

  await Promise.all(
    inputs.map(async (input, index) => {
      const result = await computeSHA256(input);
      results.set(index, result);
    })
  );

  return results;
}

/**
 * Compute hashes for named entries (useful for file manifests)
 *
 * @param entries - Map of name to data
 * @returns Map of name to hash result
 */
export async function hashNamedEntries(
  entries: Map<string, HashInput>
): Promise<Map<string, HashResult>> {
  const results = new Map<string, HashResult>();

  await Promise.all(
    Array.from(entries.entries()).map(async ([name, input]) => {
      const result = await computeSHA256(input);
      results.set(name, result);
    })
  );

  return results;
}

// ============================================================================
// FILE READER HELPERS
// ============================================================================

/**
 * Hash a File object (convenience wrapper for Blob)
 */
export async function hashFile(file: File): Promise<HashResult> {
  return computeSHA256(file);
}

/**
 * Hash data URL (base64 encoded image)
 *
 * Extracts the base64 data and hashes the decoded bytes.
 */
export async function hashDataURL(dataURL: string): Promise<HashResult> {
  // Parse data URL
  const match = dataURL.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid data URL format');
  }

  // Decode base64
  const base64Data = match[2];
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);

  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return computeSHA256(bytes);
}

/**
 * Hash multiple data URLs in parallel
 */
export async function hashDataURLs(dataURLs: string[]): Promise<Map<number, HashResult>> {
  const results = new Map<number, HashResult>();

  await Promise.all(
    dataURLs.map(async (dataURL, index) => {
      try {
        const result = await hashDataURL(dataURL);
        results.set(index, result);
      } catch (error) {
        console.error(`Failed to hash data URL at index ${index}:`, error);
      }
    })
  );

  return results;
}

// ============================================================================
// HASH VERIFICATION
// ============================================================================

/**
 * Verify that data matches expected hash
 *
 * @param input - Data to verify
 * @param expectedHash - Expected hash value
 * @returns true if hash matches
 */
export async function verifyHash(input: HashInput, expectedHash: string): Promise<boolean> {
  const result = await computeSHA256(input);
  return hashesEqual(result.hash, expectedHash);
}

/**
 * Verify Blob against hash and return size info
 */
export async function verifyAsset(
  blob: Blob,
  expectedHash: string
): Promise<{ valid: boolean; size: number; actualHash: string }> {
  const result = await computeSHA256(blob);
  return {
    valid: hashesEqual(result.hash, expectedHash),
    size: blob.size,
    actualHash: result.hash
  };
}
