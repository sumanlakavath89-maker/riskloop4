/**
 * ImageUploadService
 * Reusable Cloudinary image upload and management service for RiskLoop.
 *
 * Capabilities:
 * - In-memory stream uploading via streamifier & multer.memoryStorage
 * - Strict MIME type verification (JPG, JPEG, PNG, WebP)
 * - 5 MB file size enforcement
 * - Secure isolation under the 'riskloop/' Cloudinary folder
 * - Safe response sanitization returning only secure_url & public_id
 * - Robust error handling preventing credential exposure
 */

import multer from 'multer';
import streamifier from 'streamifier';
import cloudinary from '../config/cloudinary.js';

// Allowed MIME types
export const ALLOWED_MIME_TYPES = Object.freeze([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp'
]);

// Maximum file size: 5 MB in bytes
export const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Base folder for all RiskLoop assets in Cloudinary
export const DEFAULT_FOLDER = 'riskloop';

/**
 * Reusable Multer memory storage configuration with strict type & size validation
 */
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype?.toLowerCase())) {
    cb(null, true);
  } else {
    const error = new Error('Invalid file format. Only JPG, JPEG, PNG, and WebP images are allowed.');
    error.code = 'INVALID_FILE_TYPE';
    cb(error, false);
  }
};

/** Single image upload middleware (5MB limit) */
export const uploadSingleImage = (fieldName = 'image') => multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1
  },
  fileFilter
}).single(fieldName);

/** Multiple images upload middleware (5MB limit each) */
export const uploadMultipleImages = (fieldName = 'images', maxCount = 5) => multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: maxCount
  },
  fileFilter
}).array(fieldName, maxCount);

class ImageUploadService {
  /**
   * Upload an image buffer or readable stream directly to Cloudinary
   *
   * @param {Buffer|ReadableStream} buffer - In-memory file buffer from Multer
   * @param {Object} [options={}] - Optional upload parameters (e.g. subfolder, tags)
   * @returns {Promise<{ secure_url: string, public_id: string }>}
   */
  async uploadImage(buffer, options = {}) {
    if (!buffer) {
      throw new Error('No image buffer provided for upload.');
    }

    // Determine target folder path ensuring riskloop/ namespace
    let targetFolder = DEFAULT_FOLDER;
    if (options.folder) {
      const sanitizedSubfolder = options.folder.replace(/^riskloop\/?/, '').trim();
      targetFolder = sanitizedSubfolder ? `${DEFAULT_FOLDER}/${sanitizedSubfolder}` : DEFAULT_FOLDER;
    }

    const uploadOptions = {
      folder: targetFolder,
      resource_type: 'image',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      ...options,
      folder: targetFolder // Ensure folder prefix is strictly preserved
    };

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        uploadOptions,
        (error, result) => {
          if (error) {
            // Mask any sensitive backend parameters from the error message
            const safeMessage = error.message || 'Image upload to Cloudinary failed.';
            console.error('[ImageUploadService] Upload error:', safeMessage);
            return reject(new Error(safeMessage));
          }

          if (!result || !result.secure_url || !result.public_id) {
            return reject(new Error('Cloudinary returned an invalid or incomplete upload response.'));
          }

          // Return only secure image URL and public_id
          resolve({
            secure_url: result.secure_url,
            public_id: result.public_id
          });
        }
      );

      try {
        if (Buffer.isBuffer(buffer)) {
          streamifier.createReadStream(buffer).pipe(uploadStream);
        } else if (typeof buffer.pipe === 'function') {
          buffer.pipe(uploadStream);
        } else {
          reject(new Error('Invalid file format: expected Buffer or ReadableStream.'));
        }
      } catch (streamErr) {
        reject(new Error(`Failed to stream image to Cloudinary: ${streamErr.message}`));
      }
    });
  }

  /**
   * Delete an image from Cloudinary by its public_id
   *
   * @param {string} publicId - The public_id of the Cloudinary asset
   * @returns {Promise<{ success: boolean, result: string }>}
   */
  async deleteImage(publicId) {
    if (!publicId) {
      throw new Error('No public_id provided for image deletion.');
    }

    try {
      const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: 'image',
        invalidate: true
      });
      return {
        success: result.result === 'ok' || result.result === 'not found',
        result: result.result
      };
    } catch (error) {
      const safeMessage = error.message || 'Failed to delete image from Cloudinary.';
      console.error('[ImageUploadService] Delete error:', safeMessage);
      throw new Error(safeMessage);
    }
  }

  /**
   * Delete multiple Cloudinary assets safely in parallel using Promise.allSettled
   *
   * @param {string[]} publicIds - Array of Cloudinary public IDs to delete
   * @returns {Promise<{ success: boolean, deletedCount: number, results: Array<{ publicId: string, status: string, result?: string, error?: string }> }>}
   */
  async deleteImagesBatch(publicIds = []) {
    if (!Array.isArray(publicIds) || publicIds.length === 0) {
      return { success: true, deletedCount: 0, results: [] };
    }

    const uniqueIds = Array.from(new Set(publicIds.filter(Boolean)));
    const settledResults = await Promise.allSettled(
      uniqueIds.map(async (publicId) => {
        const res = await cloudinary.uploader.destroy(publicId, {
          resource_type: 'image',
          invalidate: true
        });
        return { publicId, result: res?.result || 'ok' };
      })
    );

    const detailed = [];
    const failed = [];

    settledResults.forEach((settled, idx) => {
      const publicId = uniqueIds[idx];
      if (settled.status === 'fulfilled') {
        const resValue = settled.value?.result;
        // 'ok' or 'not found' are both considered safely cleaned up
        const isClean = resValue === 'ok' || resValue === 'not found';
        detailed.push({
          publicId,
          status: isClean ? 'deleted' : 'failed',
          result: resValue
        });
        if (!isClean) {
          failed.push({ publicId, error: `Cloudinary returned ${resValue}` });
        }
      } else {
        const errMsg = settled.reason?.message || 'Unknown Cloudinary error';
        detailed.push({
          publicId,
          status: 'failed',
          error: errMsg
        });
        failed.push({ publicId, error: errMsg });
      }
    });

    if (failed.length > 0) {
      const failedIds = failed.map(f => f.publicId).join(', ');
      console.error(`[ImageUploadService] Batch deletion encountered failures on assets: ${failedIds}`);
      const err = new Error(`Failed to delete one or more Cloudinary assets (${failed.length} failed).`);
      err.failedAssets = failed;
      err.details = detailed;
      throw err;
    }

    return {
      success: true,
      deletedCount: detailed.length,
      results: detailed
    };
  }

  /**
   * Safe multi-tenant Cloudinary cleanup for a journal trade's screenshots
   * Validates folder ownership, extracts public IDs, and executes parallel cleanup
   *
   * @param {Object} params
   * @param {string} params.userId - Authenticated user ID
   * @param {string} params.tradeId - Trade identifier
   * @param {Array<Object|string>} params.images - Array of image objects or public ID strings
   * @returns {Promise<{ success: boolean, deletedCount: number, publicIds: string[] }>}
   */
  async deleteJournalTradeImages({ userId, tradeId, images = [] }) {
    if (!userId) {
      throw new Error('userId is required for journal trade image deletion.');
    }
    if (!tradeId) {
      throw new Error('tradeId is required for journal trade image deletion.');
    }

    const imageList = Array.isArray(images) ? images : [];
    if (imageList.length === 0) {
      return { success: true, deletedCount: 0, publicIds: [] };
    }

    const sanitizedUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const sanitizedTradeId = String(tradeId).replace(/[^a-zA-Z0-9_-]/g, '_');

    // Expected valid folder prefixes for this user and trade
    const expectedPrefix1 = `riskloop/journals/${sanitizedUserId}/${sanitizedTradeId}/`;
    const expectedPrefix2 = `riskloop/journals/${userId}/${tradeId}/`;
    const userFolderPrefix1 = `riskloop/journals/${sanitizedUserId}/`;
    const userFolderPrefix2 = `riskloop/journals/${userId}/`;

    const publicIdsToDelete = [];

    for (const item of imageList) {
      const publicId = typeof item === 'string' ? item : item?.public_id;
      if (!publicId || typeof publicId !== 'string') continue;

      // Strict multi-tenant validation: ensure public_id belongs to this user
      const isOwnedByUser = publicId.startsWith(expectedPrefix1) ||
                            publicId.startsWith(expectedPrefix2) ||
                            publicId.startsWith(userFolderPrefix1) ||
                            publicId.startsWith(userFolderPrefix2);

      if (!isOwnedByUser) {
        const secErr = new Error(`Security validation failed: Asset ${publicId} does not belong to user ${userId}.`);
        secErr.statusCode = 403;
        throw secErr;
      }

      publicIdsToDelete.push(publicId);
    }

    if (publicIdsToDelete.length === 0) {
      return { success: true, deletedCount: 0, publicIds: [] };
    }

    const batchResult = await this.deleteImagesBatch(publicIdsToDelete);

    return {
      success: true,
      deletedCount: batchResult.deletedCount,
      publicIds: publicIdsToDelete,
      details: batchResult.results
    };
  }

  /**
   * Validate image file properties before streaming
   *
   * @param {Object} file - Express/Multer file object
   * @returns {{ valid: boolean, error?: string }}
   */
  validateFile(file) {
    if (!file) {
      return { valid: false, error: 'No file provided.' };
    }

    const mime = file.mimetype?.toLowerCase();
    if (!ALLOWED_MIME_TYPES.includes(mime)) {
      return {
        valid: false,
        error: 'Invalid file format. Only JPG, JPEG, PNG, and WebP images are allowed.'
      };
    }

    if (file.size && file.size > MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `File size exceeds 5 MB limit (${(file.size / (1024 * 1024)).toFixed(2)} MB).`
      };
    }

    return { valid: true };
  }
}

export const imageUploadService = new ImageUploadService();
export default imageUploadService;
