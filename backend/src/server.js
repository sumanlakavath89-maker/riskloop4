import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables explicitly from backend/.env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import {
  authRoutes,
  brokersRoutes,
  accountRoutes,
  profileRoutes,
  positionsRoutes,
  ordersRoutes,
  holdingsRoutes,
  quotesRoutes,
  tradesRoutes,
  devRoutes,
  websocketRoutes,
  commentsRoutes,
  newsRoutes,
  economicCalendarRoutes,
  supabaseEconomicCalendarRoutes,
  marketEconomicCalendarRoutes,
  adminEconomicCalendarRoutes,
  adminForexCalendarRoutes,
  journalRoutes,
  supportRoutes,
  adminSupportRoutes,
  aiSupportRoutes,
  notificationsRoutes,
  instrumentsRoutes,
  leaderboardRoutes,
  marketMoversRoutes,
} from './routes/index.js';
import { db } from './services/DatabaseService.js';
import { tradeExecutionService } from './services/TradeExecutionService.js';
import { webSocketService } from './services/WebSocketService.js';
import { calendarSchedulerService } from './services/CalendarSchedulerService.js';
import { economicCalendarHealthService } from './services/EconomicCalendarHealthService.js';

const frontendDir = path.resolve(__dirname, '../../');

// ── Database initialisation ───────────────────────────────────────────────────
// Must happen before any route handler runs so the tables exist.
db.initialize();

// Reload persisted trades into memory so duplicate-prevention works after restart
tradeExecutionService.loadFromDatabase();

// ── WebSocket event integration ───────────────────────────────────────────────
// Wire WebSocket executionUpdate events to TradeExecutionService
// This ensures broker-confirmed executions are automatically persisted as trades
webSocketService.on('executionUpdate', async (data) => {
  const { sessionId, brokerId, execution } = data;

  try {
    await tradeExecutionService.processExecution(brokerId, execution);
    console.log(`[WebSocket] Trade execution processed: ${execution.tradeId} (${brokerId})`);
  } catch (error) {
    console.error(`[WebSocket] Failed to process execution from ${brokerId}:`, error.message);
  }
});

// Log WebSocket connection events
webSocketService.on('connected', (data) => {
  console.log(`[WebSocket] ${data.brokerId} connected for session ${data.sessionId}`);
});

webSocketService.on('disconnected', (data) => {
  console.log(`[WebSocket] ${data.brokerId} disconnected for session ${data.sessionId}`);
});

webSocketService.on('error', (data) => {
  console.error(`[WebSocket] Error from ${data.brokerId}:`, data.error);
});

import { globalLimiter } from './middleware/rateLimiters.js';

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// REVERSE PROXY CONFIGURATION
// ============================================================
if (process.env.TRUST_PROXY !== undefined) {
  const tp = process.env.TRUST_PROXY.trim().toLowerCase();
  if (tp === 'true') {
    app.set('trust proxy', true);
  } else if (tp === 'false') {
    app.set('trust proxy', false);
  } else if (!isNaN(Number(tp))) {
    app.set('trust proxy', Number(tp));
  } else {
    app.set('trust proxy', process.env.TRUST_PROXY);
  }
} else if (process.env.NODE_ENV === 'production') {
  // Standard production default for reverse proxy deployments (Render, Cloudflare, Nginx, AWS ALB)
  app.set('trust proxy', 1);
}

// ============================================================
// MIDDLEWARE
// ============================================================

// Disable Express server fingerprinting
app.disable('x-powered-by');

// Reject dangerous HTTP methods (XST / TRACE / TRACK prevention)
app.use((req, res, next) => {
  if (['TRACE', 'TRACK'].includes(req.method.toUpperCase())) {
    return res.status(405).json({
      success: false,
      error: `HTTP method ${req.method} is not allowed.`
    });
  }
  next();
});

// Security headers (Helmet with HSTS, X-Frame-Options, No-Sniff, Referrer-Policy)
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  xContentTypeOptions: true,
  xFrameOptions: { action: 'sameorigin' },
  hsts: { maxAge: 15552000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hidePoweredBy: true
}));

// Additional browser security & feature restriction headers
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// CORS configuration (Strict Origin Whitelist & Disallowed Wildcards with Credentials)
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
  : ['http://localhost:3000', 'http://localhost:5500', 'http://127.0.0.1:5500', 'http://localhost:8080', 'http://127.0.0.1:8080'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

// Global API Rate limiting (500 req / 15 min default)
app.use('/api/', globalLimiter);

// 1. Route-specific body parsing: AI Screenshot Vision OCR (Allows base64 chart images up to 10MB)
app.use('/api/journal/analyze-screenshot', express.json({ limit: '10mb' }));

// 2. Global body parsing for all other standard REST endpoints (1MB strict limit)
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ============================================================
// ROUTES
// ============================================================

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'RiskLoop Backend API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// Economic Calendar Subsystem Health Check
app.get('/api/health/economic-calendar', async (req, res) => {
  try {
    const health = await economicCalendarHealthService.getHealthStatus();
    return res.status(200).json(health);
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: 'unhealthy',
      checkedAt: new Date().toISOString(),
      error: 'Failed to evaluate economic calendar health'
    });
  }
});

// Favicon & DevTools endpoints (prevent 404s in console)
app.get('/favicon.ico', (req, res) => res.status(204).end());
app.get('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => res.json({}));

// Public Supabase configuration endpoint for client initialization
app.get('/api/config/supabase', (req, res) => {
  res.json({
    success: true,
    supabaseUrl: process.env.SUPABASE_URL || null,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || null,
    isConfigured: !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY)
  });
});

// API version 1 routes
app.use('/api/auth', authRoutes);
app.use('/api/brokers', brokersRoutes);
app.use('/api/account', accountRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/positions', positionsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/holdings', holdingsRoutes);
app.use('/api/quotes', quotesRoutes);
app.use('/api/trades', tradesRoutes);
app.use('/api/websocket', websocketRoutes);
app.use('/api/market/news', newsRoutes);
app.use('/api/market/movers', marketMoversRoutes);
app.use('/api/market/top-movers', marketMoversRoutes);
app.use('/api/market/fo-instruments', marketMoversRoutes);
app.use('/api/market/fo-contract', marketMoversRoutes);
app.use('/api/market/fo', marketMoversRoutes);
app.use('/api/market/economic-calendar', marketEconomicCalendarRoutes);
app.use('/api/market', commentsRoutes);
app.use('/api/economic-calendar', economicCalendarRoutes);
app.use('/api/test-economic-calendar', supabaseEconomicCalendarRoutes);
app.use('/api/journal', journalRoutes);
app.use('/api/support/ai', aiSupportRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/admin/support', adminSupportRoutes);
app.use('/api/admin/economic-calendar', adminEconomicCalendarRoutes);
app.use('/api/admin/forex-calendar', adminForexCalendarRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/instruments', instrumentsRoutes);
app.use('/api/leaderboard', leaderboardRoutes);

// Development routes (disabled in production)
app.use('/api/dev', devRoutes);

// Static frontend file serving
app.use(express.static(frontendDir));

// Authentication callback endpoint (mobile and desktop verification)
app.get(['/auth/callback', '/auth/callback.html'], (req, res) => {
  res.sendFile(path.join(frontendDir, 'auth', 'callback.html'));
});

// Fallback to index.html for root path and auth entry points
app.get(['/', '/reset-password', '/login', '/register'], (req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
  });
});

// Fallback 404 handler
app.use((req, res) => {
  res.status(404).sendFile(path.join(frontendDir, 'index.html'));
});

// Centralized Error Handler
app.use((err, req, res, next) => {
  // Handle payload too large error from express body-parsers (HTTP 413)
  if (err.type === 'entity.too.large' || err.status === 413 || err.statusCode === 413) {
    return res.status(413).json({
      success: false,
      error: 'Payload too large. Maximum allowed size exceeded.'
    });
  }

  // Handle Multer errors (file size / unexpected files)
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      error: 'File size exceeds allowed limit. Please select a smaller file.'
    });
  }

  if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      success: false,
      error: 'Too many files uploaded. Please reduce the number of files.'
    });
  }

  // Handle CORS errors safely
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      error: 'Not allowed by CORS policy'
    });
  }

  console.error('[Server Error]', err);

  return res.status(err.status || err.statusCode || 500).json({
    success: false,
    error: (process.env.NODE_ENV === 'production' && (!err.status || err.status >= 500))
      ? 'Internal server error'
      : (err.message || 'Internal server error')
  });
});

// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, () => {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  🛡️  RiskLoop Backend API');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log(`  🚀 Server running on port ${PORT}`);
  console.log(`  🏥 Health check: http://localhost:${PORT}/health`);
  console.log(`  🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`  💾 Database: SQLite (node:sqlite) — data persists across restarts`);
  console.log('');
  console.log('  📍 API Endpoints:');
  console.log(`     • POST   /api/auth/connect`);
  console.log(`     • POST   /api/auth/disconnect`);
  console.log(`     • POST   /api/auth/sync`);
  console.log(`     • GET    /api/auth/status/:brokerId`);
  console.log(`     • GET    /api/brokers`);
  console.log(`     • GET    /api/account/profile?brokerId=<id>`);
  console.log(`     • GET    /api/account/funds?brokerId=<id>`);
  console.log(`     • GET    /api/positions?brokerId=<id>`);
  console.log(`     • GET    /api/orders?brokerId=<id>`);
  console.log(`     • POST   /api/orders?brokerId=<id>`);
  console.log(`     • PUT    /api/orders/:id?brokerId=<id>`);
  console.log(`     • DELETE /api/orders/:id?brokerId=<id>`);
  console.log(`     • GET    /api/holdings?brokerId=<id>`);
  console.log(`     • POST   /api/quotes?brokerId=<id>`);
  console.log(`     • GET    /api/trades?brokerId=<id>`);
  console.log(`     • GET    /api/market/comments?sort=<recent|liked>&page=<n>&limit=<n>`);
  console.log(`     • POST   /api/market/comments`);
  console.log(`     • PUT    /api/market/comments/:id`);
  console.log(`     • DELETE /api/market/comments/:id`);
  console.log(`     • POST   /api/market/comments/:id/like`);
  console.log(`     • POST   /api/market/comments/:id/dislike`);
  console.log(`     • POST   /api/market/comments/:id/reply`);
  console.log(`     • POST   /api/market/comments/:id/report`);
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  // Initialize Economic Calendar Scheduler (Disabled in background unless ECONOMIC_CALENDAR_SCHEDULER_ENABLED=true)
  calendarSchedulerService.init().catch(err => {
    console.warn('[server] CalendarSchedulerService init warning:', err.message);
  });
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
function shutdown(signal) {
  console.log(`\n[server] ${signal} received — closing database and exiting.`);
  calendarSchedulerService.stop();
  db.close();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export default app;
