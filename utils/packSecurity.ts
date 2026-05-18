/**
 * Security utilities for pack system
 * Protects against malicious packs, XSS, and other attacks
 */

import type { PackManifest } from './packManager';
import { logger } from './logger';

// Security limits
const MAX_PACK_SIZE = 500 * 1024 * 1024; // 500MB max pack size
const MAX_IMAGE_SIZE = 3 * 1024 * 1024;   // 3MB max single image
const MAX_IMAGE_COUNT = 1000;              // Maximum number of images
const MAX_IMAGE_DIMENSION = 16384;        // 16K pixels max dimension
const MAX_OBJECT_COUNT = 10000;           // Maximum objects in pack

// Allowed MIME types for images
const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/bmp'
];

/**
 * Validate pack file before processing
 */
export async function validatePackFile(file: File): Promise<{ valid: boolean; error?: string }> {
  // Check file size
  if (file.size > MAX_PACK_SIZE) {
    return {
      valid: false,
      error: `Pack file too large: ${formatFileSize(file.size)} (max: ${formatFileSize(MAX_PACK_SIZE)})`
    };
  }

  // Check file extension
  if (!file.name.endsWith('.nexuspack')) {
    return {
      valid: false,
      error: 'Invalid file extension. Only .nexuspack files are allowed.'
    };
  }

  // Check file size > 0
  if (file.size === 0) {
    return {
      valid: false,
      error: 'Pack file is empty.'
    };
  }

  return { valid: true };
}

/**
 * Validate pack manifest
 */
export function validateManifest(manifest: any): { valid: boolean; error?: string } {
  // Check required fields
  if (!manifest.version || typeof manifest.version !== 'number') {
    return { valid: false, error: 'Invalid manifest: missing or invalid version' };
  }

  if (!manifest.name || typeof manifest.name !== 'string') {
    return { valid: false, error: 'Invalid manifest: missing or invalid name' };
  }

  // Check version compatibility
  if (manifest.version > 1) { // Assuming current version is 1
    return {
      valid: false,
      error: `Pack version ${manifest.version} is not supported. Maximum supported version is 1.`
    };
  }

  // Validate image count
  if (manifest.images?.count > MAX_IMAGE_COUNT) {
    return {
      valid: false,
      error: `Too many images in pack: ${manifest.images.count} (max: ${MAX_IMAGE_COUNT})`
    };
  }

  // Validate object count
  if (manifest.save?.objectsCount > MAX_OBJECT_COUNT) {
    return {
      valid: false,
      error: `Too many objects in pack: ${manifest.save.objectsCount} (max: ${MAX_OBJECT_COUNT})`
    };
  }

  return { valid: true };
}

/**
 * Validate and sanitize image data
 */
export async function validateImage(filename: string, base64Data: string): Promise<{ valid: boolean; error?: string }> {
  // Check filename for path traversal attacks
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return { valid: false, error: 'Invalid filename: path traversal detected' };
  }

  // Extract MIME type from base64 data
  const mimeMatch = base64Data.match(/^data:([^;]+);base64,/);
  if (!mimeMatch) {
    return { valid: false, error: 'Invalid image data format' };
  }

  const mimeType = mimeMatch[1];

  // Check if MIME type is allowed
  if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) {
    return {
      valid: false,
      error: `Unsupported image type: ${mimeType}. Allowed types: ${ALLOWED_IMAGE_TYPES.join(', ')}`
    };
  }

  // Extract and validate base64 data
  const base64String = base64Data.split(',')[1];
  if (!base64String || base64String.length === 0) {
    return { valid: false, error: 'Empty image data' };
  }

  // Check image size (estimate from base64 length)
  const estimatedSize = Math.ceil(base64String.length * 0.75); // base64 is ~33% larger
  if (estimatedSize > MAX_IMAGE_SIZE) {
    return {
      valid: false,
      error: `Image too large: ${formatFileSize(estimatedSize)} (max: ${formatFileSize(MAX_IMAGE_SIZE)})`
    };
  }

  // Additional validation: try to decode base64 to ensure it's valid
  try {
    atob(base64String);
  } catch (e) {
    return { valid: false, error: 'Invalid base64 encoding' };
  }

  return { valid: true };
}

/**
 * Validate and sanitize game state from pack
 */
export function validateGameState(state: any): { valid: boolean; error?: string } {
  // Check if state is an object
  if (!state || typeof state !== 'object') {
    return { valid: false, error: 'Invalid game state: not an object' };
  }

  // Validate objects
  if (!state.objects || typeof state.objects !== 'object') {
    return { valid: false, error: 'Invalid game state: missing or invalid objects' };
  }

  // Check object count
  const objectCount = Object.keys(state.objects).length;
  if (objectCount > MAX_OBJECT_COUNT) {
    return {
      valid: false,
      error: `Too many objects: ${objectCount} (max: ${MAX_OBJECT_COUNT})`
    };
  }

  // Validate players
  if (!state.players || !Array.isArray(state.players)) {
    return { valid: false, error: 'Invalid game state: missing or invalid players' };
  }

  if (state.players.length > 100) { // Reasonable limit
    return { valid: false, error: 'Too many players in pack' };
  }

  // Validate each object has safe properties
  for (const [id, obj] of Object.entries(state.objects)) {
    const validation = validateObject(obj);
    if (!validation.valid) {
      return {
        valid: false,
        error: `Invalid object ${id}: ${validation.error}`
      };
    }
  }

  return { valid: true };
}

/**
 * Validate individual object for dangerous content
 */
function validateObject(obj: any): { valid: boolean; error?: string } {
  if (!obj || typeof obj !== 'object') {
    return { valid: false, error: 'Object is not an object' };
  }

  // Check for dangerous function properties (code injection)
  for (const key in obj) {
    const value = (obj as any)[key];
    if (typeof value === 'function') {
      return { valid: false, error: `Object contains function property: ${key}` };
    }
  }

  // Validate image URLs are either data URLs, pack:// URLs, img_ref:// URLs, or sha256: hashes
  const validateUrl = (url: string, fieldName: string): { valid: boolean; error?: string } => {
    if (!url || typeof url !== 'string') return { valid: true };
    // Allow data:image, pack://images/, http, img_ref://, and sha256: URLs
    if (!url.startsWith('data:image/') &&
        !url.startsWith('pack://images/') &&
        !url.startsWith('http') &&
        !url.startsWith('img_ref://') &&
        !url.startsWith('sha256:')) {
      return {
        valid: false,
        error: `Invalid URL in ${fieldName}: ${url.substring(0, 50)}...`
      };
    }
    return { valid: true };
  };

  // Direct fields
  const urlFields = ['content', 'frontFaceUrl', 'backFaceUrl', 'spriteUrl', 'cardBackSpriteUrl'];
  for (const field of urlFields) {
    const url = (obj as any)[field];
    const validation = validateUrl(url, field);
    if (!validation.valid) return validation;
  }

  // Nested: alternativeBack.url
  if (obj.alternativeBack?.url) {
    const validation = validateUrl(obj.alternativeBack.url, 'alternativeBack.url');
    if (!validation.valid) return validation;
  }

  // Nested: spriteConfig.spriteUrl, spriteConfig.cardBackUrl
  if (obj.spriteConfig) {
    if (obj.spriteConfig.spriteUrl) {
      const validation = validateUrl(obj.spriteConfig.spriteUrl, 'spriteConfig.spriteUrl');
      if (!validation.valid) return validation;
    }
    if (obj.spriteConfig.cardBackUrl) {
      const validation = validateUrl(obj.spriteConfig.cardBackUrl, 'spriteConfig.cardBackUrl');
      if (!validation.valid) return validation;
    }
  }

  // Nested: characterData[].characters[].avatarUrl
  if (obj.characterData?.characters && Array.isArray(obj.characterData.characters)) {
    for (let i = 0; i < obj.characterData.characters.length; i++) {
      const character = obj.characterData.characters[i];
      if (character?.avatarUrl) {
        const validation = validateUrl(character.avatarUrl, `characterData.characters[${i}].avatarUrl`);
        if (!validation.valid) return validation;
      }
    }
  }

  // Check for prototype pollution
  if (obj.__proto__ !== Object.prototype) {
    return { valid: false, error: 'Prototype pollution detected' };
  }

  return { valid: true };
}

/**
 * Sanitize pack data by removing potentially dangerous content
 */
export function sanitizePackData(data: any): any {
  if (!data || typeof data !== 'object') {
    return data;
  }

  // Deep clone to avoid modifying original
  const sanitized = JSON.parse(JSON.stringify(data));

  // Remove dangerous properties if any
  if (sanitized.objects) {
    for (const obj of Object.values(sanitized.objects)) {
      // Remove any function properties
      if (obj && typeof obj === 'object') {
        for (const key in obj) {
          if (typeof (obj as any)[key] === 'function') {
            delete (obj as any)[key];
          }
        }
      }
    }
  }

  return sanitized;
}

/**
 * Create a security warning for user
 */
export function getPackSecurityWarning(manifest: PackManifest): string[] {
  const warnings: string[] = [];

  // Warn about large packs
  if (manifest.images.totalSize > 10 * 1024 * 1024) {
    warnings.push(`Pack is large (${formatFileSize(manifest.images.totalSize)}). This may take time to load.`);
  }

  // Warn about many images
  if (manifest.images.count > 50) {
    warnings.push(`Pack contains many images (${manifest.images.count}).`);
  }

  // Warn about custom content
  if (manifest.images.count > 0) {
    warnings.push('This pack contains custom images. Only load packs from trusted sources.');
  }

  return warnings;
}

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Comprehensive pack validation
 */
export async function validatePack(file: File, manifest: any, images: Array<{ filename: string; data: string }>, gameState: any): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate file
  const fileValidation = await validatePackFile(file);
  if (!fileValidation.valid) {
    errors.push(fileValidation.error || 'Invalid pack file');
    return { valid: false, errors, warnings };
  }

  // Validate manifest
  const manifestValidation = validateManifest(manifest);
  if (!manifestValidation.valid) {
    errors.push(manifestValidation.error || 'Invalid manifest');
    return { valid: false, errors, warnings };
  }

  // Validate all images
  for (const img of images) {
    const imgValidation = await validateImage(img.filename, img.data);
    if (!imgValidation.valid) {
      errors.push(`Image ${img.filename}: ${imgValidation.error}`);
    }
  }

  // Validate game state
  const stateValidation = validateGameState(gameState);
  if (!stateValidation.valid) {
    errors.push(stateValidation.error || 'Invalid game state');
  }

  // Collect warnings
  const securityWarnings = getPackSecurityWarning(manifest);
  warnings.push(...securityWarnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Sanitize HTML content (if needed for any HTML rendering)
 */
export function sanitizeHtml(html: string): string {
  // Remove script tags and event handlers
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}
