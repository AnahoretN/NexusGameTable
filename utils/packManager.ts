import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { GameState } from '../store/GameContext';
import type { TableObject } from '../types';
import { logger } from './logger';
import {
  validatePackFile,
  validateManifest,
  validateImage,
  validateGameState,
  sanitizePackData,
  validatePack,
  getPackSecurityWarning
} from './packSecurity';

const PACK_VERSION = 1;
const MANIFEST_FILENAME = 'manifest.json';
const SAVE_FILENAME = 'save.json';
const IMAGES_FOLDER = 'images/';

/**
 * Pack manifest with metadata
 */
export interface PackManifest {
  version: number;
  name: string;
  description?: string;
  timestamp: number;
  created: string;
  images: {
    count: number;
    totalSize: number;
  };
  save: {
    objectsCount: number;
    playersCount: number;
  };
}

/**
 * Image data stored in pack
 */
interface PackImage {
  id: string;
  filename: string;
  data: string; // base64
}

/**
 * Extract all images from objects (data URLs, blob URLs, and restore from metadata)
 */
async function extractImagesFromObjects(objects: Record<string, TableObject>): Promise<PackImage[]> {
  const images: PackImage[] = [];
  const seenImages = new Set<string>();
  let imageIndex = 0;

  // Store original blob URLs for conversion
  const blobUrlsToConvert = new Map<string, string>(); // metadata -> blob URL

  // First pass: collect all blob URLs from metadata if available
  const collectBlobUrls = async (obj: any) => {
    const checkField = async (url: string) => {
      if (url === 'B' || (typeof url === 'string' && url.startsWith('{"t":"b"'))) {
        // This is blob metadata - we need to get actual blob URL
        // Try to restore from the actual blob URLs in memory
        logger.log(`[PACK] Found blob metadata, will try to convert from original`);
      }
    };

    if (obj.content) await collectBlobUrls(obj.content);
    if (obj.alternativeBack?.url) await collectBlobUrls(obj.alternativeBack.url);
    if (obj.spriteConfig?.spriteUrl) await collectBlobUrls(obj.spriteConfig.spriteUrl);
    if (obj.spriteConfig?.cardBackUrl) await collectBlobUrls(obj.spriteConfig.cardBackUrl);
    if (obj.frontFaceUrl) await collectBlobUrls(obj.frontFaceUrl);
    if (obj.backFaceUrl) await collectBlobUrls(obj.backFaceUrl);
  };

  const processObject = async (obj: any) => {
    // Helper to process image fields (including blob URLs and metadata)
    const processImageField = async (url: string, prefix: string) => {
      if (!url || url === 'B' || url === 'D') {
        logger.warn(`[PACK] Skipping ${url} metadata (${prefix}) - image not available for pack`);
        return;
      }

      // Skip pack references
      if (url.startsWith('pack://')) return;

      let dataUrl = url;

      // Convert blob URLs to base64
      if (url.startsWith('blob:')) {
        try {
          dataUrl = await convertBlobToBase64ForPack(url);
          logger.log(`[PACK] Converted blob URL to base64 for pack`);
        } catch (error) {
          logger.error(`[PACK] Failed to convert blob URL:`, error);
          return; // Skip this image if conversion fails
        }
      }

      // Only process data URLs (original or converted)
      if (!dataUrl.startsWith('data:image/')) {
        logger.debug(`[PACK] Skipping non-image URL: ${dataUrl.substring(0, 50)}...`);
        return;
      }

      // Skip duplicates
      if (seenImages.has(dataUrl)) return;
      seenImages.add(dataUrl);

      // Extract file extension from mime type
      const mimeMatch = dataUrl.match(/data:image\/(\w+);/);
      const extension = mimeMatch ? mimeMatch[1] : 'png';
      const filename = `${prefix}${imageIndex}.${extension}`;

      images.push({
        id: `img_${imageIndex}`,
        filename,
        data: dataUrl
      });

      imageIndex++;
    };

    // Process content field
    if (obj.content) {
      await processImageField(obj.content, 'image');
    }

    // Process alternativeBack.url
    if (obj.alternativeBack?.url) {
      await processImageField(obj.alternativeBack.url, 'altback');
    }

    // Process spriteConfig
    if (obj.spriteConfig?.spriteUrl) {
      await processImageField(obj.spriteConfig.spriteUrl, 'sprite');
    }
    if (obj.spriteConfig?.cardBackUrl) {
      await processImageField(obj.spriteConfig.cardBackUrl, 'cardback');
    }

    // Process frontFaceUrl and backFaceUrl
    if (obj.frontFaceUrl) {
      await processImageField(obj.frontFaceUrl, 'front');
    }
    if (obj.backFaceUrl) {
      await processImageField(obj.backFaceUrl, 'back');
    }
  };

  // Process all objects
  for (const obj of Object.values(objects)) {
    await processObject(obj);
  }

  if (images.length === 0) {
    logger.warn('[PACK] No extractable images found - objects may only contain metadata "B"/"D"');
    logger.warn('[PACK] Pack will be created without embedded images');
  }

  return images;
}

/**
 * Convert blob URL to base64 data URL for pack
 */
async function convertBlobToBase64ForPack(blobUrl: string): Promise<string> {
  try {
    const response = await fetch(blobUrl);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    throw new Error(`Failed to convert blob URL: ${error}`);
  }
}

/**
 * Convert Uint8Array to base64 string
 */
function arrayBufferToBase64(buffer: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary);
}

/**
 * Replace base64 URLs with image references in objects
 */
function replaceImagesWithReferences(objects: Record<string, TableObject>, images: PackImage[]): Record<string, TableObject> {
  // Create mapping of original data URLs to image IDs
  const urlToImageMap = new Map<string, string>();
  images.forEach(img => {
    urlToImageMap.set(img.data, `pack://${IMAGES_FOLDER}${img.filename}`);
  });

  const processObject = (obj: any): any => {
    const processed = { ...obj };

    // Helper to process image fields (handle both data URLs and blob URLs)
    const processImageField = (url: string): string => {
      if (!url) return url;
      if (url.startsWith('data:image/')) {
        return urlToImageMap.get(url) || url;
      }
      // Note: blob URLs should already be converted to base64 by extractImagesFromObjects
      // If we encounter blob URLs here, they won't be in the map (intentional - skip them)
      return url;
    };

    // Process content field
    if (processed.content) {
      processed.content = processImageField(processed.content);
    }

    // Process alternativeBack.url
    if (processed.alternativeBack?.url) {
      processed.alternativeBack.url = processImageField(processed.alternativeBack.url);
    }

    // Process spriteConfig
    if (processed.spriteConfig) {
      if (processed.spriteConfig.spriteUrl) {
        processed.spriteConfig.spriteUrl = processImageField(processed.spriteConfig.spriteUrl);
      }
      if (processed.spriteConfig.cardBackUrl) {
        processed.spriteConfig.cardBackUrl = processImageField(processed.spriteConfig.cardBackUrl);
      }
    }

    // Process frontFaceUrl and backFaceUrl
    if (processed.frontFaceUrl) {
      processed.frontFaceUrl = processImageField(processed.frontFaceUrl);
    }
    if (processed.backFaceUrl) {
      processed.backFaceUrl = processImageField(processed.backFaceUrl);
    }

    return processed;
  };

  const processedObjects: Record<string, TableObject> = {};
  Object.entries(objects).forEach(([id, obj]) => {
    processedObjects[id] = processObject(obj);
  });

  return processedObjects;
}

/**
 * Restore image references to base64 URLs in objects
 */
function restoreImageReferences(
  objects: Record<string, TableObject>,
  images: PackImage[],
  progressCallback?: (step: string, status: 'loading' | 'success' | 'warning' | 'error') => void
): Record<string, TableObject> {
  // Create mapping of image references to base64 data
  const refToImageMap = new Map<string, string>();
  images.forEach(img => {
    const packRef = `pack://${IMAGES_FOLDER}${img.filename}`;
    refToImageMap.set(packRef, img.data);
  });

  if (refToImageMap.size === 0 && progressCallback) {
    progressCallback('No images to restore!', 'warning');
  }

  const processObject = (obj: any): any => {
    const processed = { ...obj };

    // Helper to process image fields
    const processImageField = (url: string): string => {
      if (!url) return url;

      if (url.startsWith('pack://')) {
        const base64 = refToImageMap.get(url);
        if (base64) {
          return base64;
        } else {
          if (progressCallback) {
            progressCallback(`No mapping found for pack reference: ${url}`, 'error');
          }
          return url; // Return original if not found
        }
      }

      return url;
    };

    // Process content field
    if (processed.content) {
      processed.content = processImageField(processed.content);
    }

    // Process alternativeBack.url
    if (processed.alternativeBack?.url) {
      processed.alternativeBack.url = processImageField(processed.alternativeBack.url);
    }

    // Process spriteConfig
    if (processed.spriteConfig) {
      if (processed.spriteConfig.spriteUrl) {
        processed.spriteConfig.spriteUrl = processImageField(processed.spriteConfig.spriteUrl);
      }
      if (processed.spriteConfig.cardBackUrl) {
        processed.spriteConfig.cardBackUrl = processImageField(processed.spriteConfig.cardBackUrl);
      }
    }

    // Process frontFaceUrl and backFaceUrl
    if (processed.frontFaceUrl) {
      processed.frontFaceUrl = processImageField(processed.frontFaceUrl);
    }
    if (processed.backFaceUrl) {
      processed.backFaceUrl = processImageField(processed.backFaceUrl);
    }

    return processed;
  };

  const processedObjects: Record<string, TableObject> = {};
  Object.entries(objects).forEach(([id, obj]) => {
    processedObjects[id] = processObject(obj);
  });

  return processedObjects;
}

/**
 * Create a pack from game state
 */
export async function createPack(
  state: GameState,
  name: string,
  description?: string
): Promise<void> {
  try {
    logger.log('[PACK] Creating pack:', name);

    // Simple size check: count objects instead of trying to serialize huge state
    const objectCount = Object.keys(state.objects).length;
    if (objectCount > 1000) {
      logger.warn(`[PACK] Large pack with ${objectCount} objects - this may take a while`);
    }

    // Create ZIP archive
    const zip = new JSZip();

    // Extract images from objects (convert blob URLs to base64)
    const images = await extractImagesFromObjects(state.objects);
    logger.log(`[PACK] Extracted ${images.length} images`);

    if (images.length === 0) {
      logger.warn('[PACK] No images found in pack');
    }

    // Replace image URLs with pack references
    const processedObjects = replaceImagesWithReferences(state.objects, images);

    // Debug: verify replacement worked (use safe sampling for large states)
    const sampleKeys = Object.keys(processedObjects).slice(0, 5);
    let base64Count = 0;
    let packRefCount = 0;

    sampleKeys.forEach(key => {
      const objJson = JSON.stringify(processedObjects[key]);
      base64Count += (objJson.match(/data:image\//g) || []).length;
      packRefCount += (objJson.match(/pack:\/\//g) || []).length;
    });

    logger.log(`[PACK] Sample check: ${base64Count} base64 URLs, ${packRefCount} pack:// references in first 5 objects`);

    // Calculate total size of images
    let totalImageSize = 0;
    images.forEach(img => {
      // Remove data:image/png;base64, prefix to get raw data
      const base64Data = img.data.split(',')[1];
      totalImageSize += base64Data.length;
    });

    // Create manifest
    const manifest: PackManifest = {
      version: PACK_VERSION,
      name,
      description,
      timestamp: Date.now(),
      created: new Date().toISOString(),
      images: {
        count: images.length,
        totalSize: totalImageSize
      },
      save: {
        objectsCount: Object.keys(state.objects).length,
        playersCount: state.players.length
      }
    };

    // Add manifest to ZIP (without pretty printing to save space)
    zip.file(MANIFEST_FILENAME, JSON.stringify(manifest));

    // Add images to ZIP with error handling
    const imagesFolder = zip.folder(IMAGES_FOLDER);
    if (imagesFolder && images.length > 0) {
      let imagesProcessed = 0;
      let imagesSkipped = 0;

      for (const img of images) {
        try {
          // Check individual image size before processing
          const imgSize = Math.ceil(img.data.length * 0.75); // base64 is ~33% larger
          if (imgSize > 3 * 1024 * 1024) { // 3MB limit per image
            logger.warn(`[PACK] Skipping large image: ${img.filename} (${Math.round(imgSize / 1024 / 1024)}MB)`);
            imagesSkipped++;
            continue;
          }

          // Convert base64 to binary
          const base64Data = img.data.split(',')[1];

          // Check base64 string length (max safe string length in JS)
          if (base64Data.length > 500 * 1024 * 1024) { // 500MB base64 string limit
            logger.warn(`[PACK] Skipping image with too large base64 data: ${img.filename}`);
            imagesSkipped++;
            continue;
          }

          // Extract MIME type from base64 data URL
          const mimeMatch = img.data.match(/data:image\/(\w+);/);
          const mimeType = mimeMatch ? `image/${mimeMatch[1]}` : 'image/jpeg';

          const binaryData = atob(base64Data);
          const bytes = new Uint8Array(binaryData.length);
          for (let i = 0; i < binaryData.length; i++) {
            bytes[i] = binaryData.charCodeAt(i);
          }

          // Add to ZIP with proper MIME type
          imagesFolder.file(img.filename, bytes, { binary: true, mimeType: mimeType });
          imagesProcessed++;
        } catch (error) {
          logger.error(`[PACK] Failed to process image ${img.filename}:`, error);
          imagesSkipped++;
        }
      }

      logger.log(`[PACK] Processed ${imagesProcessed} images, skipped ${imagesSkipped}`);

      if (imagesSkipped > 0) {
        logger.warn(`[PACK] Some images were skipped due to size or processing errors`);
      }
    }

    // Add save file to ZIP (with processed objects) - avoid copying entire state
    const saveData = {
      version: state.version || 6,
      timestamp: Date.now(),
      viewport: {
        width: typeof window !== 'undefined' ? window.innerWidth : 1920,
        height: typeof window !== 'undefined' ? window.innerHeight : 1080
      },
      state: {
        // Only copy needed fields from state
        objects: processedObjects,
        players: state.players || [],
        diceRolls: state.diceRolls || [],
        viewTransform: state.viewTransform,
        drawings: state.drawings || [],
        playerPermissions: state.playerPermissions || [],
        language: state.language,
        sessionId: state.sessionId,
        hyperscaleLayers: state.hyperscaleLayers,
        selectedHyperscaleLayerIds: state.selectedHyperscaleLayerIds
      }
    };

    // Use compression and handle large JSON safely
    try {
      const saveJson = JSON.stringify(saveData);
      const saveBlob = new Blob([saveJson], { type: 'application/json' });

      if (saveBlob.size > 450 * 1024 * 1024) { // 450MB limit for save file
        throw new Error(`Save data too large: ${Math.round(saveBlob.size / 1024 / 1024)}MB. Try removing some objects or images.`);
      }

      zip.file(SAVE_FILENAME, saveBlob);
    } catch (error) {
      logger.error('[PACK] Failed to serialize save data:', error);
      throw new Error(`Failed to create save file: ${(error as Error).message}`);
    }

    // Generate ZIP file with compression
    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    // Download the pack
    const filename = `${name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${Date.now()}.nexuspack`;
    saveAs(zipBlob, filename);

    logger.log(`[PACK] Pack created successfully: ${filename}`);
  } catch (error) {
    logger.error('[PACK] Failed to create pack:', error);
    throw error;
  }
}

/**
 * Load a pack and restore game state (with security validation)
 * @param file Pack file to load
 * @param progressCallback Optional callback for progress updates (step, status)
 */
export async function loadPack(
  file: File,
  progressCallback?: (step: string, status: 'loading' | 'success' | 'warning' | 'error') => void
): Promise<Partial<GameState>> {
  try {
    const logStep = (step: string, status: 'loading' | 'success' | 'warning' | 'error' = 'loading') => {
      if (progressCallback) {
        progressCallback(step, status);
      } else {
        // Fallback to logger if no callback
        if (status === 'error') {
          logger.error(`[PACK] ${step}`);
        } else if (status === 'warning') {
          logger.warn(`[PACK] ${step}`);
        } else {
          logger.log(`[PACK] ${step}`);
        }
      }
    };

    // SECURITY: Validate pack file first
    const fileValidation = await validatePackFile(file);
    if (!fileValidation.valid) {
      throw new Error(`Security check failed: ${fileValidation.error}`);
    }

    logStep(`Loading pack: ${file.name}`);

    // Read ZIP file
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    // Read and validate manifest
    const manifestFile = zip.file(MANIFEST_FILENAME);
    if (!manifestFile) {
      throw new Error('Invalid pack: missing manifest.json');
    }

    const manifestContent = await manifestFile.async('string');
    const manifest: PackManifest = JSON.parse(manifestContent);

    // SECURITY: Validate manifest
    const manifestValidation = validateManifest(manifest);
    if (!manifestValidation.valid) {
      throw new Error(`Manifest validation failed: ${manifestValidation.error}`);
    }

    logStep(`Validating pack manifest...`, 'success');

    // Validate version
    if (manifest.version !== PACK_VERSION) {
      logStep(`Version mismatch: expected ${PACK_VERSION}, got ${manifest.version}`, 'warning');
    }

    // Read save file
    const saveFile = zip.file(SAVE_FILENAME);
    if (!saveFile) {
      throw new Error('Invalid pack: missing save.json');
    }

    const saveContent = await saveFile.async('string');
    const saveFileData = JSON.parse(saveContent);

    // Extract state from save file structure
    let saveData: Partial<GameState> = saveFileData.state || saveFileData;

    // SECURITY: Sanitize pack data to remove dangerous content
    saveData = sanitizePackData(saveData);

    // SECURITY: Validate game state structure
    const stateValidation = validateGameState(saveData);
    if (!stateValidation.valid) {
      throw new Error(`Game state validation failed: ${stateValidation.error}`);
    }

    // Load images from ZIP
    const images: PackImage[] = [];

    // Iterate through all files in the ZIP and find images
    const allFiles = Object.keys(zip.files);
    const imageFiles = allFiles.filter(filename =>
      filename.startsWith(IMAGES_FOLDER) &&
      !filename.endsWith('/') &&
      !filename.startsWith('__MACOSX') // Skip macOS metadata files
    );

    logStep(`Loading ${imageFiles.length} images...`);
    for (const filePath of imageFiles) {
      // Extract just the filename without the images/ prefix
      const filename = filePath.substring(IMAGES_FOLDER.length);

      const imgFile = zip.file(filePath);
      if (!imgFile) continue;

      try {
        // Get binary data from ZIP
        const binaryData = await imgFile.async('uint8array');

        // Determine MIME type from file extension
        const extMatch = filename.match(/\.(\w+)$/);
        const ext = extMatch ? extMatch[1].toLowerCase() : 'png';
        const mimeType = `image/${ext}`;

        // Convert binary data to base64 with proper MIME type
        const base64 = `data:${mimeType};base64,${arrayBufferToBase64(binaryData)}`;

        // SECURITY: Validate image before adding to pack
        const imgValidation = await validateImage(filename, base64);
        if (!imgValidation.valid) {
          logStep(`Skipping invalid image ${filename}: ${imgValidation.error}`, 'warning');
          continue;
        }

        images.push({
          id: `img_${images.length}`,
          filename,
          data: base64
        });

        logStep(`Loaded image: ${filename} (${mimeType})`, 'success');
      } catch (error) {
        logStep(`Failed to load image: ${filename}`, 'error');
      }
    }

    // SECURITY: Final comprehensive validation
    logStep('Performing comprehensive security validation...');
    const finalValidation = await validatePack(file, manifest, images, saveData);
    if (!finalValidation.valid) {
      throw new Error(`Security validation failed:\n${finalValidation.errors.join('\n')}`);
    }

    // Log any security warnings
    if (finalValidation.warnings.length > 0) {
      finalValidation.warnings.forEach(warning => {
        logStep(warning, 'warning');
      });
    }

    logStep(`Loaded ${images.length} images`, 'success');

    // Restore image references to base64
    if (saveData.objects) {
      logStep(`Restoring image references...`);

      // Check if there are any pack:// references before restoration
      const objectsJson = JSON.stringify(saveData.objects);
      const packRefs = objectsJson.match(/pack:\/\/images\/[^\s"]+/g);
      if (packRefs) {
        logStep(`Found ${packRefs.length} pack:// references to restore`);
      }

      saveData.objects = restoreImageReferences(saveData.objects, images, logStep);

      // Verify no pack:// references remain
      const restoredJson = JSON.stringify(saveData.objects);
      const remainingRefs = restoredJson.match(/pack:\/\/images\/[^\s"]+/g);
      if (remainingRefs) {
        logStep(`WARNING: ${remainingRefs.length} pack:// references still remain after restoration!`, 'error');
      } else {
        logStep('All pack:// references successfully restored to base64', 'success');
      }
    }

    logStep('Pack loaded successfully!', 'success');
    return saveData;
  } catch (error) {
    if (progressCallback) {
      progressCallback(`Failed to load pack: ${(error as Error).message}`, 'error');
    }
    throw error;
  }
}

/**
 * Get pack info without loading the entire pack
 */
export async function getPackInfo(file: File): Promise<PackManifest> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    const manifestFile = zip.file(MANIFEST_FILENAME);
    if (!manifestFile) {
      throw new Error('Invalid pack: missing manifest.json');
    }

    const manifestContent = await manifestFile.async('string');
    return JSON.parse(manifestContent);
  } catch (error) {
    logger.error('[PACK] Failed to read pack info:', error);
    throw error;
  }
}
