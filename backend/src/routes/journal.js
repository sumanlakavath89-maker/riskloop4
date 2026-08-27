/**
 * Journal & Chart Analysis Routes
 * Provides AI Vision and OCR extraction for trading chart screenshots
 */

import express from 'express';
import axios from 'axios';
import multer from 'multer';
import { aiLearningService } from '../services/AiLearningService.js';
import { imageUploadService, ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from '../services/ImageUploadService.js';
import { db } from '../services/DatabaseService.js';
import { screenshotAiLimiter, imageUploadLimiter } from '../middleware/rateLimiters.js';

const router = express.Router();

// Supported financial tickers for fallback detection
const COMMON_TICKERS = [
  'NIFTY 50', 'NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX',
  'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'SBIN', 'TATAMOTORS',
  'BHARTIARTL', 'ITC', 'LT', 'KOTAKBANK', 'AXISBANK', 'MARUTI', 'BAJFINANCE',
  'ASIANPAINT', 'SUNPHARMA', 'TITAN', 'TATACONSUM', 'NTPC', 'POWERGRID',
  'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD',
  'XAUUSD', 'GOLD', 'SILVER', 'CRUDEOIL', 'NATGAS',
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BTCUSD', 'ETHUSD'
];

/**
 * POST /api/journal/analyze-screenshot
 * Body: { imageBase64: string, mimeType?: string, apiKey?: string }
 */
router.post('/analyze-screenshot', screenshotAiLimiter, async (req, res) => {
  try {
    const { imageBase64, mimeType = 'image/png', apiKey } = req.body;

    if (!imageBase64) {
      return res.status(400).json({
        success: false,
        error: 'Missing imageBase64 data in request body'
      });
    }

    // Clean base64 string
    const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    const effectiveKey = apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (effectiveKey) {
      try {
        const prompt = `You are a professional trading chart analyst. Analyze this TradingView or broker screenshot carefully.
Extract the trade parameters. Return ONLY a single valid JSON object without markdown or commentary with these exact fields:
{
  "symbol": "instrument name (e.g. NIFTY, BANKNIFTY, RELIANCE, EURUSD, BTCUSDT)",
  "setup": "specific trade setup or pattern (e.g. Liquidity Sweep, ORB, FVG, Breakout, Order Block)",
  "direction": "BUY or SELL",
  "entry": numeric_price_only,
  "stop_loss": numeric_price_only,
  "take_profit": numeric_price_only,
  "risk_ratio": numeric_or_ratio_string,
  "outcome": "Win or Loss or BE",
  "notes": "concise 2-sentence institutional trade summary with rationale",
  "mistakes": "potential flaw or lesson if loss, else empty string",
  "psychology_tags": ["Disciplined", "Rule-based"],
  "quality": "GOOD or POOR",
  "confidence": {
    "symbol": 95,
    "entry": 90,
    "stop_loss": 90,
    "take_profit": 85,
    "setup": 85,
    "outcome": 80
  }
}`;

        const geminiResp = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${effectiveKey}`,
          {
            contents: [{
              parts: [
                { text: prompt },
                { inline_data: { mime_type: mimeType, data: cleanBase64 } }
              ]
            }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 600 }
          },
          { timeout: 12000 }
        );

        const rawText = geminiResp.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const jsonStr = rawText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
        const parsed = JSON.parse(jsonStr);

        return res.json({
          success: true,
          source: 'gemini_vision',
          data: parsed
        });
      } catch (geminiErr) {
        console.warn('[Journal AI Vision] Gemini API error, falling back to smart local extraction:', geminiErr.message);
      }
    }

    // If no API key configured on server or in request, indicate to client to run local OCR
    return res.json({
      success: false,
      reason: 'NO_API_KEY',
      message: 'Server Gemini API key not configured. Using high-precision browser OCR vision engine.'
    });

  } catch (error) {
    console.error('[Journal Route Error]', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error while analyzing screenshot'
    });
  }
});

// Import support service for token verification
import { supportService } from '../services/SupportService.js';

// Admin email whitelist
const ADMIN_EMAILS = [
  'admin@riskloop.io',
  'support@riskloop.io',
  'suman@riskloop.io'
];

if (process.env.ADMIN_EMAILS) {
  ADMIN_EMAILS.push(...process.env.ADMIN_EMAILS.split(',').map(e => e.trim().toLowerCase()));
}

/**
 * Check if the authenticated user has verified Admin privileges
 */
function isUserAdmin(user, req) {
  if (!user) return false;

  // Master Admin API Key header check (strictly configured from environment)
  const adminApiKey = req.headers['x-admin-key'] || req.headers['x-admin-token'];
  const configuredAdminKey = process.env.ADMIN_API_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (adminApiKey && configuredAdminKey && adminApiKey === configuredAdminKey) {
    return true;
  }

  // Check verified admin role or email whitelist
  const role = user.role || user.user_metadata?.role || user.app_metadata?.role;
  if (role === 'admin' || role === 'superadmin' || role === 'support_agent') return true;

  const email = (user.email || '').toLowerCase().trim();
  return email ? ADMIN_EMAILS.includes(email) : false;
}

/**
 * Middleware: Verify user authentication session
 */
async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
    let token = null;
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else if (req.headers['x-supabase-token']) {
      token = String(req.headers['x-supabase-token']).trim();
    }

    if (token) {
      const { user, error } = await supportService.verifyUserToken(token);
      if (!error && user) {
        req.user = {
          id: user.id,
          email: user.email || `${user.id}@riskloop.io`,
          role: isUserAdmin(user, req) ? 'admin' : 'user'
        };
        return next();
      }
    }

    // Development-only fallback when token is missing or in local mock mode
    if (
      process.env.NODE_ENV !== 'production' &&
      (req.headers['x-user-id'] || req.headers['x-client-id'])
    ) {
      const devId = String(req.headers['x-user-id'] || req.headers['x-client-id']).trim();
      if (devId && devId !== 'undefined' && devId !== 'null') {
        const authUser = {
          id: devId,
          email: req.headers['x-user-email'] || `${devId}@riskloop.io`,
          role: req.headers['x-user-role'] || 'user'
        };
        req.user = {
          id: authUser.id,
          email: authUser.email,
          role: isUserAdmin(authUser, req) ? 'admin' : 'user'
        };
        return next();
      }
    }

    return res.status(401).json({
      success: false,
      error: 'Authentication required. Please log in with a valid session.'
    });

  } catch (err) {
    console.error('[Journal Auth Middleware Error]', err);
    return res.status(401).json({
      success: false,
      error: 'Authentication failed. Please verify your session credentials.'
    });
  }
}

/**
 * Middleware: Verify Admin authorization
 */
async function requireAdminAuth(req, res, next) {
  requireAuth(req, res, () => {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Access denied. System Administrator privileges are required to export training datasets.'
      });
    }
    next();
  });
}

/**
 * POST /api/journal/ai-learning/sample
 * Securely ingest an AI prediction vs user-corrected trade data sample (Authenticated)
 */
router.post('/ai-learning/sample', requireAuth, async (req, res) => {
  try {
    const payload = req.body;
    if (!payload) {
      return res.status(400).json({
        success: false,
        error: 'Missing request body'
      });
    }

    // Attach authenticated user ID to enforce multi-tenant ownership
    const samplePayload = {
      ...payload,
      userId: req.user.id
    };

    const result = await aiLearningService.recordSample(samplePayload);
    return res.json({
      success: true,
      data: result
    });
  } catch (err) {
    const isValidationError = err.message && err.message.includes('Validation failed');
    if (isValidationError) {
      return res.status(400).json({
        success: false,
        error: err.message
      });
    }
    console.error('[AI Learning Ingest Error]', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to record AI training sample'
    });
  }
});

/**
 * GET /api/journal/ai-learning/stats
 * Retrieve aggregated accuracy rates and dataset metrics (Authenticated & Scoped)
 */
router.get('/ai-learning/stats', requireAuth, (req, res) => {
  try {
    // Admin sees global stats; normal users see their own verified dataset accuracy
    const targetUserId = req.user.role === 'admin' ? null : req.user.id;
    const analytics = aiLearningService.getAnalytics(targetUserId);

    return res.json({
      success: true,
      data: {
        ...analytics,
        userScope: req.user.role === 'admin' ? 'GLOBAL_ADMIN' : 'USER_PRIVATE'
      }
    });
  } catch (err) {
    console.error('[AI Learning Stats Error]', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch AI accuracy statistics'
    });
  }
});

/**
 * GET /api/journal/ai-learning/samples
 * Export training samples (Admin: Global Dataset | User: Private Samples Only)
 */
router.get('/ai-learning/samples', requireAuth, (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = parseInt(req.query.offset) || 0;
    const market = req.query.market || null;
    const trainingReady = req.query.training_ready !== undefined 
      ? (req.query.training_ready === 'true' || req.query.training_ready === '1')
      : null;
    const status = req.query.status || null;

    // Strict privacy: Standard users are locked to their own user_id
    const targetUserId = req.user.role === 'admin' ? null : req.user.id;

    const samples = aiLearningService.getSamples({
      userId: targetUserId,
      limit,
      offset,
      market,
      trainingReady,
      status
    });

    return res.json({
      success: true,
      data: {
        samples,
        limit,
        offset,
        filters: {
          trainingReady,
          status,
          market
        },
        accessLevel: req.user.role === 'admin' ? 'GLOBAL_EXPORT' : 'PRIVATE_USER'
      }
    });
  } catch (err) {
    console.error('[AI Learning Samples Error]', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to retrieve AI training samples'
    });
  }
});

/**
 * GET /api/journal/admin/ai-dataset/analytics
 * Comprehensive analytics for Admin AI Dataset Management Dashboard (Admin Only)
 */
router.get('/admin/ai-dataset/analytics', requireAdminAuth, (req, res) => {
  try {
    const market = req.query.market || null;
    const source = req.query.source || null;

    const analytics = aiLearningService.getAdminAnalytics({ market, source });
    return res.json({
      success: true,
      data: analytics
    });
  } catch (err) {
    console.error('[Admin AI Dataset Analytics Error]', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch admin AI dataset analytics'
    });
  }
});

/**
 * GET /api/journal/admin/ai-dataset/export
 * Securely stream and export high-quality training-ready dataset (Admin Only)
 */
router.get('/admin/ai-dataset/export', requireAdminAuth, (req, res) => {
  try {
    const market = req.query.market || null;
    const source = req.query.source || null;
    const trainingReady = req.query.training_ready !== undefined
      ? (req.query.training_ready === 'true' || req.query.training_ready === '1')
      : true;
    const format = (req.query.format || 'json').toLowerCase();

    const exportResult = aiLearningService.exportTrainingDataset({
      market,
      source,
      trainingReady,
      limit: parseInt(req.query.limit) || 5000
    }, format);

    res.setHeader('Content-Type', exportResult.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
    return res.send(exportResult.data);
  } catch (err) {
    console.error('[Admin AI Dataset Export Error]', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to export AI training dataset'
    });
  }
});

// ── Admin AI Dataset Versions (Immutable Snapshots) ─────────────────────────

/**
 * POST /api/journal/admin/ai-dataset/versions
 * Freeze current training-ready dataset into an immutable version snapshot
 */
router.post('/admin/ai-dataset/versions', requireAdminAuth, (req, res) => {
  try {
    const { versionTag, name, description } = req.body || {};
    const createdBy = req.user?.id || 'admin';

    const version = aiLearningService.freezeDatasetVersion({
      versionTag,
      name,
      description,
      createdBy
    });

    return res.status(201).json({
      success: true,
      message: `Dataset snapshot ${version.versionTag} frozen successfully.`,
      data: version
    });
  } catch (err) {
    console.error('[Admin Dataset Version Freeze Error]', err);
    return res.status(400).json({
      success: false,
      error: err.message || 'Failed to freeze dataset version'
    });
  }
});

/**
 * GET /api/journal/admin/ai-dataset/versions
 * List all immutable dataset versions
 */
router.get('/admin/ai-dataset/versions', requireAdminAuth, (req, res) => {
  try {
    const versions = aiLearningService.getDatasetVersions();
    return res.json({
      success: true,
      data: {
        total: versions.length,
        versions
      }
    });
  } catch (err) {
    console.error('[Admin Get Dataset Versions Error]', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to retrieve dataset versions'
    });
  }
});

/**
 * GET /api/journal/admin/ai-dataset/versions/:id
 * Get single dataset version with full metrics and sample manifest
 */
router.get('/admin/ai-dataset/versions/:id', requireAdminAuth, (req, res) => {
  try {
    const version = aiLearningService.getDatasetVersion(req.params.id);
    if (!version) {
      return res.status(404).json({
        success: false,
        error: `Dataset version "${req.params.id}" not found.`
      });
    }
    return res.json({
      success: true,
      data: version
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to retrieve dataset version'
    });
  }
});

// ── Admin AI Model Experiment Tracker ───────────────────────────────────────

/**
 * POST /api/journal/admin/ai-experiments
 * Record a new model experiment run linked to a dataset version
 */
router.post('/admin/ai-experiments', requireAdminAuth, (req, res) => {
  try {
    const exp = aiLearningService.recordExperimentRun(req.body || {});
    return res.status(201).json({
      success: true,
      message: 'Model experiment recorded successfully.',
      data: exp
    });
  } catch (err) {
    console.error('[Admin Record Experiment Error]', err);
    return res.status(400).json({
      success: false,
      error: err.message || 'Failed to record model experiment'
    });
  }
});

/**
 * GET /api/journal/admin/ai-experiments
 * List all model experiments
 */
router.get('/admin/ai-experiments', requireAdminAuth, (req, res) => {
  try {
    const experiments = aiLearningService.getExperiments();
    return res.json({
      success: true,
      data: {
        total: experiments.length,
        experiments
      }
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to retrieve experiments'
    });
  }
});

/**
 * GET /api/journal/admin/ai-experiments/compare
 * Compare an experiment against baseline
 */
router.get('/admin/ai-experiments/compare', requireAdminAuth, (req, res) => {
  try {
    const { expId, baselineId } = req.query;
    if (!expId) {
      return res.status(400).json({ success: false, error: 'Query param expId is required.' });
    }
    const comparison = aiLearningService.compareExperimentWithBaseline(expId, baselineId || null);
    return res.json({
      success: true,
      data: comparison
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: err.message || 'Comparison failed'
    });
  }
});

/**
 * POST /api/journal/admin/ai-experiments/:id/promote-candidate
 * Validate and promote experiment to Candidate status
 */
router.post('/admin/ai-experiments/:id/promote-candidate', requireAdminAuth, (req, res) => {
  try {
    const updated = aiLearningService.promoteExperimentCandidate(req.params.id);
    return res.json({
      success: true,
      message: `Experiment "${updated.name}" successfully promoted to Candidate status.`,
      data: updated
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: err.message || 'Failed to promote experiment to candidate'
    });
  }
});

/**
 * POST /api/journal/admin/ai-experiments/:id/set-baseline
 * Set experiment as active production baseline
 */
router.post('/admin/ai-experiments/:id/set-baseline', requireAdminAuth, (req, res) => {
  try {
    const updated = aiLearningService.setExperimentBaseline(req.params.id);
    return res.json({
      success: true,
      message: `Experiment "${updated.name}" is now the active production baseline.`,
      data: updated
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: err.message || 'Failed to set experiment baseline'
    });
  }
});

// ── Admin AI Model Safety & Staged Rollout Gate ─────────────────────────────

/**
 * GET /api/journal/admin/ai-rollout/safety-check/:modelId
 * Run 5-point pre-deployment safety gatekeeper evaluation
 */
router.get('/admin/ai-rollout/safety-check/:modelId', requireAdminAuth, (req, res) => {
  try {
    const report = aiLearningService.evaluateModelSafetyGate(req.params.modelId);
    return res.json({
      success: true,
      data: report
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: err.message || 'Safety gate evaluation failed'
    });
  }
});

/**
 * POST /api/journal/admin/ai-rollout/start-canary
 * Initiate staged canary rollout with initial traffic percentage
 */
router.post('/admin/ai-rollout/start-canary', requireAdminAuth, (req, res) => {
  try {
    const { modelId, trafficPercentage } = req.body || {};
    if (!modelId) {
      return res.status(400).json({ success: false, error: 'modelId is required.' });
    }
    const rollout = aiLearningService.startCanaryRollout(modelId, trafficPercentage || 10);
    return res.status(201).json({
      success: true,
      message: `Canary rollout started for model "${rollout.modelName}" at ${rollout.trafficPercentage}% traffic.`,
      data: rollout
    });
  } catch (err) {
    console.error('[Start Canary Error]', err);
    return res.status(400).json({
      success: false,
      error: err.message || 'Failed to start canary rollout'
    });
  }
});

/**
 * POST /api/journal/admin/ai-rollout/adjust-traffic
 * Increase or decrease canary traffic percentage
 */
router.post('/admin/ai-rollout/adjust-traffic', requireAdminAuth, (req, res) => {
  try {
    const { rolloutId, trafficPercentage } = req.body || {};
    if (!rolloutId || trafficPercentage === undefined) {
      return res.status(400).json({ success: false, error: 'rolloutId and trafficPercentage are required.' });
    }
    const updated = aiLearningService.adjustRolloutTraffic(rolloutId, trafficPercentage);
    return res.json({
      success: true,
      message: `Rollout traffic adjusted to ${updated.trafficPercentage}%.`,
      data: updated
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: err.message || 'Failed to adjust rollout traffic'
    });
  }
});

/**
 * POST /api/journal/admin/ai-rollout/promote-full
 * Promote canary to 100% full production baseline
 */
router.post('/admin/ai-rollout/promote-full', requireAdminAuth, (req, res) => {
  try {
    const { rolloutId } = req.body || {};
    if (!rolloutId) {
      return res.status(400).json({ success: false, error: 'rolloutId is required.' });
    }
    const updated = aiLearningService.promoteCanaryToFullProduction(rolloutId);
    return res.json({
      success: true,
      message: `Model "${updated.modelName}" promoted to 100% full production baseline.`,
      data: updated
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: err.message || 'Failed to promote canary to production'
    });
  }
});

/**
 * POST /api/journal/admin/ai-rollout/rollback
 * Emergency or manual rollback of active canary
 */
router.post('/admin/ai-rollout/rollback', requireAdminAuth, (req, res) => {
  try {
    const { rolloutId, reason } = req.body || {};
    if (!rolloutId) {
      return res.status(400).json({ success: false, error: 'rolloutId is required.' });
    }
    const updated = aiLearningService.triggerManualRollback(rolloutId, reason);
    return res.json({
      success: true,
      message: 'Rollout safely reverted to 100% baseline production.',
      data: updated
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: err.message || 'Rollback failed'
    });
  }
});

/**
 * GET /api/journal/admin/ai-rollout/active
 * Get active canary rollout and telemetry
 */
router.get('/admin/ai-rollout/active', requireAdminAuth, (req, res) => {
  try {
    const rollout = db.getActiveRollout();
    const telemetry = rollout ? db.getProductionTelemetry(rollout.id) : null;
    return res.json({
      success: true,
      data: {
        activeRollout: rollout,
        telemetry
      }
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to get active rollout'
    });
  }
});

/**
 * POST /api/journal/admin/ai-rollout/telemetry-event
 * Record production telemetry event and check auto-rollback
 */
// =============================================================================
// JOURNAL TRADE IMAGES (CLOUDINARY INTEGRATION)
// Requirements:
// - Maximum 3 images per journal trade entry.
// - Maximum 5 MB per image (JPG, JPEG, PNG, WebP).
// - Stored in Cloudinary under: riskloop/journals/<user-id>/<trade-id>/
// - Multi-tenant security: verifies trade ownership and isolates deletion paths.
// =============================================================================

const journalUploadMulter = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE, // 5 MB per file
    files: 3 // Max 3 files per request
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

const journalImagesUpload = (req, res, next) => {
  const handler = journalUploadMulter.fields([
    { name: 'images', maxCount: 3 },
    { name: 'image', maxCount: 3 },
    { name: 'screenshots', maxCount: 3 },
    { name: 'files', maxCount: 3 }
  ]);

  handler(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          error: 'File size exceeds 5 MB limit. Please select a smaller screenshot.'
        });
      }
      if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({
          success: false,
          error: 'Maximum 3 images allowed per journal trade entry.'
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

    const allFiles = [];
    if (req.files) {
      ['images', 'image', 'screenshots', 'files'].forEach(field => {
        if (Array.isArray(req.files[field])) {
          allFiles.push(...req.files[field]);
        }
      });
    }
    req.uploadedFiles = allFiles;
    next();
  });
};

function sanitizeJournalId(str) {
  if (!str) return 'anonymous';
  return String(str).replace(/[^a-zA-Z0-9_-]/g, '_');
}

async function getAndVerifyTradeOwnership(tradeId, userId) {
  if (!tradeId) {
    throw new Error('tradeId parameter is required');
  }

  let trade = null;

  // 1. Try Supabase
  if (supportService.supabase) {
    try {
      const { data, error } = await supportService.supabase
        .from('journal_trades')
        .select('*')
        .eq('id', tradeId)
        .maybeSingle();

      if (!error && data) {
        let sbImages = Array.isArray(data.images) ? data.images : (typeof data.images === 'string' ? JSON.parse(data.images || '[]') : []);
        if (sbImages.length === 0) {
          const cached = db.getJournalTrade(tradeId);
          if (cached && cached.images && cached.images.length > 0) {
            sbImages = cached.images;
          }
        }
        trade = {
          id: data.id,
          userId: data.user_id,
          images: sbImages,
          tradeDate: data.trade_date,
          symbol: data.symbol
        };
      }
    } catch (e) {
      console.warn('[Journal Image Route] Supabase trade query warning:', e.message);
    }
  }

  // 2. Fallback to SQLite
  if (!trade) {
    trade = db.getJournalTrade(tradeId);
  }

  // If trade does not exist yet (e.g. client drafting trade before saving), initialize stub record
  if (!trade) {
    return {
      id: tradeId,
      userId: userId,
      images: [],
      isNew: true
    };
  }

  // Multi-tenant Ownership Verification
  if (trade.userId && String(trade.userId) !== String(userId)) {
    const error = new Error('Access denied: You do not have permission to modify this trade journal entry.');
    error.statusCode = 403;
    throw error;
  }

  return trade;
}

async function saveTradeImagesRecord(tradeId, userId, images) {
  // 1. Persist to SQLite
  const existing = db.getJournalTrade(tradeId);
  if (existing) {
    db.updateJournalTradeImages(tradeId, images);
  } else {
    db.saveJournalTrade({
      id: tradeId,
      userId: userId,
      images: images
    });
  }

  // 2. Persist to Supabase
  if (supportService.supabase) {
    try {
      await supportService.supabase
        .from('journal_trades')
        .update({
          images: images
        })
        .eq('id', tradeId)
        .eq('user_id', userId);
    } catch (sbErr) {
      console.warn('[Journal Image Route] Supabase trade images update warning:', sbErr.message);
    }
  }
}

function formatTradeForClient(row, cachedImages = []) {
  if (!row) return null;
  let images = cachedImages;
  if (!images || images.length === 0) {
    if (row.images) {
      try {
        images = typeof row.images === 'string' ? JSON.parse(row.images) : row.images;
      } catch (_) {
        images = [];
      }
    }
  }
  if (!Array.isArray(images)) images = [];

  const tradeDate = row.trade_date || row.tradeDate || (row.created_at ? row.created_at.split('T')[0] : new Date().toISOString().split('T')[0]);
  const pnl = Number(row.pnl || 0);

  return {
    id: row.id,
    userId: row.user_id || row.userId,
    user_id: row.user_id || row.userId,
    trade_date: tradeDate,
    tradeDate: tradeDate,
    date: tradeDate,
    symbol: row.symbol || 'NIFTY',
    market: (row.instrument_type || row.market || 'indian').toLowerCase(),
    instrument_type: row.instrument_type || 'EQUITY',
    instrumentType: row.instrument_type || 'EQUITY',
    type: row.instrument_type || 'EQUITY',
    side: row.side || 'BUY',
    quantity: Number(row.quantity || 1),
    qty: Number(row.quantity || 1),
    entry_price: Number(row.entry_price || 0),
    entry: Number(row.entry_price || 0),
    exit_price: row.exit_price !== null && row.exit_price !== undefined ? Number(row.exit_price) : null,
    exit: row.exit_price !== null && row.exit_price !== undefined ? Number(row.exit_price) : null,
    stop_loss: row.stop_loss !== null && row.stop_loss !== undefined ? Number(row.stop_loss) : null,
    sl: row.stop_loss !== null && row.stop_loss !== undefined ? Number(row.stop_loss) : null,
    target_price: row.target_price !== null && row.target_price !== undefined ? Number(row.target_price) : null,
    tp: row.target_price !== null && row.target_price !== undefined ? Number(row.target_price) : null,
    broker: row.broker || 'Manual',
    pnl: pnl,
    pnl_percentage: Number(row.pnl_percentage || 0),
    pnlPercentage: Number(row.pnl_percentage || 0),
    strategy_tag: row.strategy_tag || '',
    strategyTag: row.strategy_tag || '',
    setup: row.strategy_tag || '',
    outcome: pnl > 0 ? 'Win' : (pnl < 0 ? 'Loss' : 'BE'),
    rr: row.pnl_percentage ? `1:${row.pnl_percentage}` : '1:2.0',
    psychology_rating: row.psychology_rating || 3,
    psychologyRating: row.psychology_rating || 3,
    notes: row.notes || '',
    note: row.notes || '',
    images: images,
    created_at: row.created_at || new Date().toISOString(),
    createdAt: row.created_at || new Date().toISOString()
  };
}

/**
 * GET /api/journal/trades
 * Retrieve all journal trades for the authenticated user
 */
router.get('/trades', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    let trades = [];

    // 1. Fetch from Supabase
    if (supportService.supabase) {
      try {
        const { data, error } = await supportService.supabase
          .from('journal_trades')
          .select('*')
          .eq('user_id', userId)
          .order('trade_date', { ascending: false })
          .order('created_at', { ascending: false });

        if (error) {
          console.warn('[Journal GET Trades] Supabase query warning:', error.message);
        } else if (data) {
          trades = data;
        }
      } catch (sbErr) {
        console.warn('[Journal GET Trades] Supabase error:', sbErr.message);
      }
    }

    // 2. Merge with SQLite for local/offline fallback & image cache
    const sqliteTrades = db.getAllJournalTrades(userId);
    const sqliteMap = new Map();
    sqliteTrades.forEach(t => sqliteMap.set(t.id, t));

    if (trades.length === 0 && sqliteTrades.length > 0) {
      trades = sqliteTrades;
    }

    const formattedTrades = trades.map(t => {
      const cached = sqliteMap.get(t.id);
      const images = (cached && cached.images && cached.images.length > 0) ? cached.images : (t.images || []);
      return formatTradeForClient(t, images);
    });

    return res.json({
      success: true,
      count: formattedTrades.length,
      trades: formattedTrades
    });
  } catch (err) {
    console.error('[Journal GET Trades Error]', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch journal trades'
    });
  }
});

/**
 * POST /api/journal/trades
 * Create a new journal trade in Supabase (Primary Source of Truth)
 */
router.post('/trades', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const body = req.body || {};

    const tradeDate = String(body.trade_date || body.tradeDate || body.date || new Date().toISOString().split('T')[0]);
    const rawSymbol = typeof body.symbol === 'string' ? body.symbol : (body.symbol ? String(body.symbol) : 'NIFTY');
    const symbol = rawSymbol.toUpperCase().trim();
    const rawSide = typeof body.side === 'string' ? body.side : (body.side ? String(body.side) : 'BUY');
    const side = ['BUY', 'SELL'].includes(rawSide.toUpperCase().trim()) ? rawSide.toUpperCase().trim() : 'BUY';
    const quantity = parseFloat(body.quantity || body.qty) || 1;
    const entryPrice = parseFloat(body.entry_price || body.entryPrice || body.entry) || 0;
    const exitPrice = body.exit_price !== undefined ? parseFloat(body.exit_price) : (body.exit !== undefined ? parseFloat(body.exit) : null);
    const stopLoss = body.stop_loss !== undefined ? parseFloat(body.stop_loss) : (body.sl !== undefined ? parseFloat(body.sl) : null);
    const targetPrice = body.target_price !== undefined ? parseFloat(body.target_price) : (body.tp !== undefined ? parseFloat(body.tp) : null);
    const pnl = parseFloat(body.pnl) || 0;
    const pnlPercentage = parseFloat(body.pnl_percentage || body.pnlPercentage) || 0;
    const strategyTag = typeof body.strategy_tag === 'string' ? body.strategy_tag : (typeof body.strategyTag === 'string' ? body.strategyTag : '');
    const notes = typeof body.notes === 'string' ? body.notes : (typeof body.note === 'string' ? body.note : '');
    const instrumentType = typeof body.instrument_type === 'string' ? body.instrument_type : (typeof body.type === 'string' ? body.type : 'EQUITY');
    const broker = typeof body.broker === 'string' ? body.broker : 'Manual';
    const psychologyRating = parseInt(body.psychology_rating || body.psychologyRating, 10) || (pnl >= 0 ? 4 : 2);

    const supabasePayload = {
      user_id: userId,
      trade_date: tradeDate,
      symbol: symbol,
      instrument_type: instrumentType,
      side: side,
      quantity: quantity,
      entry_price: entryPrice,
      exit_price: exitPrice,
      stop_loss: stopLoss,
      target_price: targetPrice,
      broker: broker,
      pnl: pnl,
      pnl_percentage: pnlPercentage,
      strategy_tag: strategyTag,
      psychology_rating: psychologyRating,
      notes: notes
    };

    let createdTrade = null;

    // 1. Primary Insert: Supabase
    if (supportService.supabase) {
      const { data, error } = await supportService.supabase
        .from('journal_trades')
        .insert(supabasePayload)
        .select()
        .single();

      if (error) {
        console.error('[Journal Trade Create Supabase Error]', error);
        return res.status(400).json({
          success: false,
          error: `Supabase trade insert failed: ${error.message}`
        });
      }
      createdTrade = data;
    }

    // 2. Fallback if Supabase not configured
    if (!createdTrade) {
      const localId = `tr-${Date.now()}`;
      createdTrade = {
        id: localId,
        ...supabasePayload,
        created_at: new Date().toISOString()
      };
    }

    // 3. Cache in SQLite
    try {
      db.saveJournalTrade({
        id: createdTrade.id,
        userId: userId,
        tradeDate: tradeDate,
        symbol: symbol,
        instrumentType: instrumentType,
        side: side,
        quantity: quantity,
        entryPrice: entryPrice,
        exitPrice: exitPrice,
        stopLoss: stopLoss,
        targetPrice: targetPrice,
        broker: broker,
        pnl: pnl,
        pnlPercentage: pnlPercentage,
        strategyTag: strategyTag,
        psychologyRating: psychologyRating,
        notes: notes,
        images: Array.isArray(body.images) ? body.images : []
      });
    } catch (sqlErr) {
      console.warn('[Journal Trade SQLite Cache Notice]', sqlErr.message);
    }

    const formatted = formatTradeForClient(createdTrade, Array.isArray(body.images) ? body.images : []);

    return res.status(201).json({
      success: true,
      message: 'Journal trade saved successfully to database',
      trade: formatted
    });

  } catch (err) {
    console.error('[Journal Trade Create Error]', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to create journal trade'
    });
  }
});

/**
 * PUT /api/journal/trades/:tradeId
 * Update an existing journal trade in Supabase (Primary Source of Truth)
 */
router.put('/trades/:tradeId', requireAuth, async (req, res) => {
  try {
    const { tradeId } = req.params;
    const userId = req.user.id;
    const body = req.body || {};

    const updatePayload = {};
    if (body.symbol) updatePayload.symbol = String(body.symbol).toUpperCase().trim();
    if (body.trade_date || body.tradeDate || body.date) updatePayload.trade_date = body.trade_date || body.tradeDate || body.date;
    if (body.instrument_type || body.instrumentType || body.type) updatePayload.instrument_type = body.instrument_type || body.instrumentType || body.type;
    if (body.side) updatePayload.side = String(body.side).toUpperCase().trim();
    if (body.quantity !== undefined || body.qty !== undefined) updatePayload.quantity = parseFloat(body.quantity || body.qty);
    if (body.entry_price !== undefined || body.entryPrice !== undefined || body.entry !== undefined) updatePayload.entry_price = parseFloat(body.entry_price || body.entryPrice || body.entry);
    if (body.exit_price !== undefined || body.exit !== undefined) updatePayload.exit_price = parseFloat(body.exit_price !== undefined ? body.exit_price : body.exit);
    if (body.stop_loss !== undefined || body.sl !== undefined) updatePayload.stop_loss = parseFloat(body.stop_loss !== undefined ? body.stop_loss : body.sl);
    if (body.target_price !== undefined || body.tp !== undefined) updatePayload.target_price = parseFloat(body.target_price !== undefined ? body.target_price : body.tp);
    if (body.pnl !== undefined) updatePayload.pnl = parseFloat(body.pnl);
    if (body.pnl_percentage !== undefined || body.pnlPercentage !== undefined) updatePayload.pnl_percentage = parseFloat(body.pnl_percentage || body.pnlPercentage);
    if (body.strategy_tag !== undefined || body.strategyTag !== undefined || body.setup !== undefined) updatePayload.strategy_tag = body.strategy_tag || body.strategyTag || body.setup;
    if (body.notes !== undefined || body.note !== undefined) updatePayload.notes = body.notes || body.note;
    if (body.psychology_rating !== undefined || body.psychologyRating !== undefined) updatePayload.psychology_rating = parseInt(body.psychology_rating || body.psychologyRating, 10);

    let updatedTrade = null;

    // 1. Update in Supabase
    if (supportService.supabase) {
      const { data, error } = await supportService.supabase
        .from('journal_trades')
        .update(updatePayload)
        .eq('id', tradeId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        console.error('[Journal Trade Update Supabase Error]', error);
        return res.status(400).json({
          success: false,
          error: `Supabase trade update failed: ${error.message}`
        });
      }
      updatedTrade = data;
    }

    // 2. Fallback / Update in SQLite
    const existingSqlite = db.getJournalTrade(tradeId);
    const existingImages = (Array.isArray(body.images) && body.images.length > 0) ? body.images : (existingSqlite?.images || []);
    if (!updatedTrade && existingSqlite) {
      updatedTrade = { ...existingSqlite, ...updatePayload };
    }

    try {
      db.saveJournalTrade({
        id: tradeId,
        userId: userId,
        ...(existingSqlite || {}),
        ...updatePayload,
        images: existingImages
      });
    } catch (_) {}

    const formatted = formatTradeForClient(updatedTrade || { id: tradeId, ...updatePayload }, existingImages);

    return res.json({
      success: true,
      message: 'Journal trade updated successfully',
      trade: formatted
    });

  } catch (err) {
    console.error('[Journal Trade Update Error]', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to update journal trade'
    });
  }
});

/**
 * GET /api/journal/trades/:tradeId/images
 * Retrieve attached screenshots for a specific trade (Authenticated)
 */
router.get('/trades/:tradeId/images', requireAuth, async (req, res) => {
  try {
    const { tradeId } = req.params;
    const trade = await getAndVerifyTradeOwnership(tradeId, req.user.id);

    return res.json({
      success: true,
      trade_id: tradeId,
      images: trade.images || []
    });
  } catch (err) {
    const status = err.statusCode || (err.message.includes('Access denied') ? 403 : 500);
    return res.status(status).json({
      success: false,
      error: err.message || 'Failed to retrieve trade images'
    });
  }
});

/**
 * POST /api/journal/trades/:tradeId/images
 * Upload 1 to 3 screenshots for a specific journal trade (Authenticated)
 * Target Folder: riskloop/journals/<user-id>/<trade-id>/
 */
router.post('/trades/:tradeId/images', imageUploadLimiter, requireAuth, journalImagesUpload, async (req, res) => {
  try {
    const { tradeId } = req.params;
    const files = req.uploadedFiles || [];

    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No image files provided. Please select 1 to 3 JPG, JPEG, PNG, or WebP chart screenshots.'
      });
    }

    // 1. Verify Trade Ownership
    const trade = await getAndVerifyTradeOwnership(tradeId, req.user.id);
    const existingImages = Array.isArray(trade.images) ? trade.images : [];

    // 2. Enforce maximum 3 images per trade limit
    if (existingImages.length + files.length > 3) {
      const allowedCount = Math.max(0, 3 - existingImages.length);
      return res.status(400).json({
        success: false,
        error: `Maximum 3 images allowed per trade. Trade currently has ${existingImages.length} image(s); you can upload at most ${allowedCount} more.`
      });
    }

    // 3. Upload images to Cloudinary in parallel
    const sanitizedUserId = sanitizeJournalId(req.user.id);
    const sanitizedTradeId = sanitizeJournalId(tradeId);
    const targetFolder = `journals/${sanitizedUserId}/${sanitizedTradeId}`;

    const uploadPromises = files.map(file => {
      return imageUploadService.uploadImage(file.buffer, {
        folder: targetFolder
      });
    });

    const uploadResults = await Promise.all(uploadPromises);

    // 4. Append new images metadata
    const now = new Date().toISOString();
    const newImageEntries = uploadResults.map(resObj => ({
      secure_url: resObj.secure_url,
      public_id: resObj.public_id,
      created_at: now
    }));

    const updatedImages = [...existingImages, ...newImageEntries];

    // 5. Persist to Database
    await saveTradeImagesRecord(tradeId, req.user.id, updatedImages);

    return res.json({
      success: true,
      message: `Successfully uploaded ${newImageEntries.length} image(s)`,
      trade_id: tradeId,
      added_images: newImageEntries,
      images: updatedImages,
      total_count: updatedImages.length
    });
  } catch (err) {
    console.error('[Journal Trade Image Upload Error]', err);
    const status = err.statusCode || (err.message.includes('Access denied') ? 403 : 500);
    return res.status(status).json({
      success: false,
      error: err.message || 'Failed to upload journal trade screenshots'
    });
  }
});

/**
 * DELETE /api/journal/trades/:tradeId/images
 * Delete a specific screenshot by public_id from a journal trade (Authenticated)
 */
router.delete('/trades/:tradeId/images', requireAuth, async (req, res) => {
  try {
    const { tradeId } = req.params;
    const publicId = req.body?.public_id || req.query?.public_id;

    if (!publicId) {
      return res.status(400).json({
        success: false,
        error: 'public_id is required in request body or query parameters'
      });
    }

    // 1. Verify Trade Ownership
    const trade = await getAndVerifyTradeOwnership(tradeId, req.user.id);
    const existingImages = Array.isArray(trade.images) ? trade.images : [];

    // 2. Verify Multi-Tenant Folder Path Safety
    const sanitizedUserId = sanitizeJournalId(req.user.id);
    const expectedUserPrefix1 = `riskloop/journals/${sanitizedUserId}/`;
    const expectedUserPrefix2 = `riskloop/journals/${req.user.id}/`;
    if (!publicId.startsWith(expectedUserPrefix1) && !publicId.startsWith(expectedUserPrefix2)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied: You cannot delete images belonging to another user.'
      });
    }

    // 3. Delete from Cloudinary
    try {
      await imageUploadService.deleteImage(publicId);
    } catch (delErr) {
      console.warn(`[Journal Image Delete Warning] Could not destroy Cloudinary asset ${publicId}:`, delErr.message);
    }

    // 4. Remove image entry from trade record
    const updatedImages = existingImages.filter(img => img.public_id !== publicId && img.secure_url !== publicId);

    // 5. Persist updated image list
    await saveTradeImagesRecord(tradeId, req.user.id, updatedImages);

    return res.json({
      success: true,
      message: 'Journal image removed successfully',
      trade_id: tradeId,
      images: updatedImages,
      total_count: updatedImages.length
    });
  } catch (err) {
    console.error('[Journal Trade Image Delete Error]', err);
    const status = err.statusCode || (err.message.includes('Access denied') ? 403 : 500);
    return res.status(status).json({
      success: false,
      error: err.message || 'Failed to remove journal screenshot'
    });
  }
});

/**
 * DELETE /api/journal/trades/:tradeId
 * Permanently delete a journal trade and all its attached Cloudinary screenshots (Authenticated)
 */
router.delete('/trades/:tradeId', requireAuth, async (req, res) => {
  try {
    const { tradeId } = req.params;
    const userId = req.user.id;

    // 1. Fetch trade & verify ownership
    const trade = await getAndVerifyTradeOwnership(tradeId, userId);
    if (trade.isNew) {
      return res.status(404).json({
        success: false,
        error: 'Trade journal entry not found'
      });
    }

    // 2. Multi-tenant ownership check
    if (trade.userId && String(trade.userId) !== String(userId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied: You do not have permission to delete this trade.'
      });
    }

    const images = Array.isArray(trade.images) ? trade.images : [];

    // 3. Clean up Cloudinary images first (Parallel & Safe)
    let cleanupResult = { deletedCount: 0 };
    if (images.length > 0) {
      cleanupResult = await imageUploadService.deleteJournalTradeImages({
        userId,
        tradeId,
        images
      });
    }

    // 4. Delete from SQLite
    db.deleteJournalTrade(tradeId, userId);

    // 5. Delete from Supabase if connected
    if (supportService.supabase) {
      try {
        await supportService.supabase
          .from('journal_trades')
          .delete()
          .eq('id', tradeId)
          .eq('user_id', userId);
      } catch (sbErr) {
        console.warn('[Journal Trade Delete] Supabase deletion notice:', sbErr.message);
      }
    }

    return res.json({
      success: true,
      message: 'Trade and associated screenshots deleted successfully',
      trade_id: tradeId,
      deleted_images_count: cleanupResult.deletedCount
    });

  } catch (err) {
    console.error('[Journal Trade Delete Error]', err);
    const status = err.statusCode || (err.message.includes('Access denied') || err.message.includes('Security validation') ? 403 : 500);
    return res.status(status).json({
      success: false,
      error: err.message || 'Failed to delete trade journal entry'
    });
  }
});

/**
 * DELETE /api/journal/trades
 * Bulk delete all journal trades and all associated Cloudinary images for the user (Authenticated)
 */
router.delete('/trades', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Fetch all user trades from SQLite and Supabase
    let trades = db.getAllJournalTrades(userId);

    if (supportService.supabase) {
      try {
        const { data } = await supportService.supabase
          .from('journal_trades')
          .select('*')
          .eq('user_id', userId);
        if (data && data.length > 0) {
          const tradeMap = new Map();
          trades.forEach(t => tradeMap.set(t.id, t));
          data.forEach(d => {
            tradeMap.set(d.id, {
              id: d.id,
              userId: d.user_id,
              images: Array.isArray(d.images) ? d.images : (typeof d.images === 'string' ? JSON.parse(d.images || '[]') : [])
            });
          });
          trades = Array.from(tradeMap.values());
        }
      } catch (_) {}
    }

    let totalDeletedImages = 0;

    // 2. Clean up Cloudinary images across all user trades
    for (const trade of trades) {
      const images = Array.isArray(trade.images) ? trade.images : [];
      if (images.length > 0) {
        try {
          const res = await imageUploadService.deleteJournalTradeImages({
            userId,
            tradeId: trade.id,
            images
          });
          totalDeletedImages += res.deletedCount;
        } catch (delErr) {
          console.warn(`[Bulk Trade Delete Warning] Error cleaning images for trade ${trade.id}:`, delErr.message);
        }
      }
    }

    // 3. Delete from databases
    const deletedCount = db.deleteUserJournalTrades(userId);

    if (supportService.supabase) {
      try {
        await supportService.supabase
          .from('journal_trades')
          .delete()
          .eq('user_id', userId);
      } catch (_) {}
    }

    return res.json({
      success: true,
      message: 'All journal trades and screenshots deleted successfully',
      deleted_trades_count: Math.max(deletedCount, trades.length),
      deleted_images_count: totalDeletedImages
    });

  } catch (err) {
    console.error('[Bulk Journal Delete Error]', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to bulk delete journal trades'
    });
  }
});

export default router;
