/**
 * Centralized Rate Limiting Middleware
 * Protects RiskLoop backend APIs against brute force, denial of service,
 * expensive OCR/AI abuse, and automated spam.
 */

import rateLimit from 'express-rate-limit';

/**
 * Standard JSON error response handler for rate-limited requests.
 * Ensures consistent and safe error schemas without leaking internal state.
 */
function createRateLimitHandler(errorMessage) {
  return (req, res /*, next, options */) => {
    res.status(429).json({
      success: false,
      error: errorMessage || 'Too many requests. Please try again later.'
    });
  };
}

/**
 * 1. Global API Rate Limiter
 * Applied across all /api/* routes.
 * Default: 500 requests per 15 minutes per IP (overrideable via env).
 */
export const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 mins
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 500,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Too many requests. Please try again later.')
});

/**
 * 2. Sensitive Authentication / Broker Connection Limiter
 * Applied to broker connection endpoints (/api/auth/connect, login routes)
 * Default: 10 requests per 15 minutes per IP.
 */
export const authLimiter = rateLimit({
  windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 mins
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS, 10) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Too many authentication attempts. Please try again later.')
});

/**
 * 3. AI Screenshot OCR & Vision Analysis Limiter
 * Applied to /api/journal/analyze-screenshot and heavy AI OCR pipelines.
 * Default: 10 requests per 1 minute per IP.
 */
export const screenshotAiLimiter = rateLimit({
  windowMs: parseInt(process.env.AI_SCREENSHOT_RATE_LIMIT_WINDOW_MS, 10) || 60 * 1000, // 1 min
  max: parseInt(process.env.AI_SCREENSHOT_RATE_LIMIT_MAX_REQUESTS, 10) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Too many screenshot analysis requests. Please try again in a moment.')
});

/**
 * 4. Image Upload Limiter
 * Applied to Cloudinary image uploads (/api/journal/trades/:tradeId/images, /api/profile/avatar).
 * Default: 30 upload requests per 15 minutes per IP.
 */
export const imageUploadLimiter = rateLimit({
  windowMs: parseInt(process.env.UPLOAD_RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 mins
  max: parseInt(process.env.UPLOAD_RATE_LIMIT_MAX_REQUESTS, 10) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Too many upload requests. Please try again later.')
});

/**
 * 5. Support Ticket Spam Limiter
 * Applied to ticket creation endpoints (/api/support/tickets, /api/support/ticket).
 * Default: 10 ticket creations per hour per IP.
 */
export const supportTicketLimiter = rateLimit({
  windowMs: parseInt(process.env.SUPPORT_TICKET_RATE_LIMIT_WINDOW_MS, 10) || 60 * 60 * 1000, // 1 hr
  max: parseInt(process.env.SUPPORT_TICKET_RATE_LIMIT_MAX_REQUESTS, 10) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Too many support tickets created. Please try again later.')
});

/**
 * 6. AI Assistant Query Limiter
 * Applied to AI support assistant questions (/api/support/ai/ask).
 * Default: 30 requests per 1 minute per IP.
 */
export const aiSupportLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Too many AI requests. Please slow down and try again in a moment.')
});
