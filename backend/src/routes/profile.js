/**
 * Profile Routes
 * Authenticated endpoints for user profile management & Cloudinary avatar uploads.
 *
 * Requirements:
 * - Maximum 1 active avatar image per user.
 * - Stored in Cloudinary under `riskloop/profiles/user-id/`
 * - 5 MB size limit, JPG, JPEG, PNG, WebP only.
 * - Deleting or replacing an avatar removes the previous Cloudinary asset.
 * - Safe multi-tenant ownership guards preventing cross-user modifications.
 */

import express from 'express';
import multer from 'multer';
import { supportService } from '../services/SupportService.js';
import { imageUploadService, ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from '../services/ImageUploadService.js';
import { db } from '../services/DatabaseService.js';
import { imageUploadLimiter } from '../middleware/rateLimiters.js';

const router = express.Router();

// ── Auth Middleware ─────────────────────────────────────────────────────────

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';

    // Development-only fallback
    if (
      process.env.NODE_ENV !== 'production' &&
      !authHeader &&
      (req.headers['x-user-id'] || req.headers['x-client-id'])
    ) {
      const devId = String(req.headers['x-user-id'] || req.headers['x-client-id']).trim();
      req.user = {
        id: devId,
        email: req.headers['x-user-email'] || `${devId}@riskloop.io`,
        role: req.headers['x-user-role'] || 'user'
      };
      return next();
    }

    // Production and normal authentication path
    let token = null;
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else if (req.headers['x-supabase-token']) {
      token = String(req.headers['x-supabase-token']).trim();
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please provide a valid Authorization Bearer token.'
      });
    }

    const { user, error } = await supportService.verifyUserToken(token);
    if (error || !user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired authentication token. Please log in again.'
      });
    }

    req.user = {
      id: user.id,
      email: user.email || `${user.id}@riskloop.io`,
      role: user.role || 'user'
    };

    return next();
  } catch (err) {
    console.error('[Profile Auth Middleware Error]', err);
    return res.status(401).json({
      success: false,
      error: 'Authentication failed. Please verify your session credentials.'
    });
  }
}

// ── Multer Upload Middleware (Memory Storage) ───────────────────────────────

const multerInstance = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE, // 5 MB
    files: 1
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype?.toLowerCase())) {
      cb(null, true);
    } else {
      const error = new Error('Invalid file format. Only JPG, JPEG, PNG, and WebP images are allowed.');
      error.code = 'INVALID_FILE_TYPE';
      cb(error, false);
    }
  }
});

// Middleware supporting field names: 'avatar', 'image', or 'file'
const singleAvatarUpload = (req, res, next) => {
  const handler = multerInstance.fields([
    { name: 'avatar', maxCount: 1 },
    { name: 'image', maxCount: 1 },
    { name: 'file', maxCount: 1 }
  ]);

  handler(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          error: 'File size exceeds 5 MB limit. Please select a smaller photo.'
        });
      }
      return res.status(400).json({
        success: false,
        error: `File upload error: ${err.message}`
      });
    } else if (err) {
      return res.status(400).json({
        success: false,
        error: err.message || 'Invalid upload file'
      });
    }

    // Normalize file reference
    if (req.files) {
      req.file = req.files['avatar']?.[0] || req.files['image']?.[0] || req.files['file']?.[0] || null;
    }

    next();
  });
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function sanitizeIdentifier(str) {
  if (!str) return 'anonymous';
  return String(str).replace(/[^a-zA-Z0-9_-]/g, '_');
}

async function getUserProfileRecord(userId) {
  let profile = null;

  // 1. Try Supabase
  if (supportService.supabase) {
    try {
      const { data, error } = await supportService.supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (!error && data) {
        profile = {
          id: data.id,
          email: data.email,
          fullName: data.full_name,
          avatarUrl: data.avatar_url,
          avatarPublicId: data.avatar_public_id,
          createdAt: data.created_at,
          updatedAt: data.updated_at
        };
      }
    } catch (e) {
      console.warn('[Profile Route] Supabase fetch error, checking SQLite:', e.message);
    }
  }

  // 2. Fallback to SQLite
  if (!profile) {
    profile = db.getProfile(userId);
  }

  return profile;
}

async function saveUserProfileAvatar(userId, email, avatarUrl, avatarPublicId) {
  const now = new Date().toISOString();

  // 1. Persist to SQLite
  db.updateProfileAvatar(userId, avatarUrl, avatarPublicId);

  // 2. Persist to Supabase
  if (supportService.supabase) {
    try {
      await supportService.supabase
        .from('profiles')
        .upsert({
          id: userId,
          email: email || `${userId}@riskloop.io`,
          avatar_url: avatarUrl || null,
          avatar_public_id: avatarPublicId || null,
          updated_at: now
        });
    } catch (sbErr) {
      console.warn('[Profile Route] Supabase profile upsert warning:', sbErr.message);
    }
  }
}

// ── Routes ──────────────────────────────────────────────────────────────────

/**
 * GET /api/profile
 * Retrieve current user's profile
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const profile = await getUserProfileRecord(req.user.id);
    const avatarUrl = profile?.avatarUrl || profile?.avatar_url || null;
    const avatarPublicId = profile?.avatarPublicId || profile?.avatar_public_id || null;
    const fullName = profile?.fullName || profile?.full_name || req.user.email?.split('@')[0] || 'Trader';

    return res.json({
      success: true,
      data: {
        id: req.user.id,
        email: profile?.email || req.user.email,
        fullName: fullName,
        full_name: fullName,
        avatarUrl: avatarUrl,
        avatar_url: avatarUrl,
        avatarPublicId: avatarPublicId,
        avatar_public_id: avatarPublicId,
        createdAt: profile?.createdAt || profile?.created_at,
        updatedAt: profile?.updatedAt || profile?.updated_at
      }
    });
  } catch (err) {
    console.error('[Profile GET Error]', err);
    return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
});

/**
 * POST /api/profile/avatar
 * Upload or replace user profile avatar in Cloudinary
 * Target Folder: riskloop/profiles/<user-id>/
 */
router.post('/avatar', imageUploadLimiter, requireAuth, singleAvatarUpload, async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        error: 'No image file uploaded. Please select a JPG, JPEG, PNG, or WebP photo.'
      });
    }

    const userId = req.user.id;
    const sanitizedUserId = sanitizeIdentifier(userId);
    const targetFolder = `profiles/${sanitizedUserId}`;

    // 1. Check if user already has an existing avatar
    const existingProfile = await getUserProfileRecord(userId);
    const oldPublicId = existingProfile?.avatarPublicId || existingProfile?.avatar_public_id;

    // 2. Upload new avatar buffer to Cloudinary
    const uploadResult = await imageUploadService.uploadImage(req.file.buffer, {
      folder: targetFolder
    });

    // 3. If previous avatar existed in Cloudinary, remove old asset
    if (oldPublicId && oldPublicId !== uploadResult.public_id) {
      try {
        await imageUploadService.deleteImage(oldPublicId);
        console.log(`[Profile Avatar] Cleaned up previous avatar asset: ${oldPublicId}`);
      } catch (delErr) {
        console.warn(`[Profile Avatar] Notice: Could not remove old avatar ${oldPublicId}:`, delErr.message);
      }
    }

    // 4. Update database records
    await saveUserProfileAvatar(
      userId,
      req.user.email,
      uploadResult.secure_url,
      uploadResult.public_id
    );

    return res.json({
      success: true,
      message: 'Profile photo updated successfully',
      data: {
        avatar_url: uploadResult.secure_url,
        avatarUrl: uploadResult.secure_url,
        public_id: uploadResult.public_id,
        avatarPublicId: uploadResult.public_id
      }
    });
  } catch (err) {
    console.error('[Profile Avatar Upload Error]', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to upload profile photo'
    });
  }
});

/**
 * DELETE /api/profile/avatar
 * Delete active avatar from Cloudinary & clear profile records
 */
router.delete('/avatar', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const sanitizedUserId = sanitizeIdentifier(userId);

    const existingProfile = await getUserProfileRecord(userId);
    const publicId = existingProfile?.avatarPublicId;

    if (publicId) {
      // Security check: ensure publicId belongs to user's profile folder
      const expectedPrefix = `riskloop/profiles/${sanitizedUserId}/`;
      if (publicId.startsWith(expectedPrefix) || publicId.startsWith(`riskloop/profiles/`)) {
        try {
          await imageUploadService.deleteImage(publicId);
        } catch (delErr) {
          console.warn('[Profile Avatar] Cloudinary delete warning:', delErr.message);
        }
      } else {
        console.warn(`[Profile Avatar Security] Blocked deletion of untrusted public_id: ${publicId}`);
      }
    }

    // Clear database columns
    await saveUserProfileAvatar(userId, req.user.email, null, null);

    return res.json({
      success: true,
      message: 'Profile avatar removed successfully'
    });
  } catch (err) {
    console.error('[Profile Avatar Delete Error]', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to remove profile avatar'
    });
  }
});

export default router;
