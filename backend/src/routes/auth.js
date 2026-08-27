/**
 * Authentication Routes
 * POST /api/auth/connect    – connect to broker + sync historical data into DB
 * POST /api/auth/disconnect – disconnect
 * GET  /api/auth/status/:id – connection status
 */

import express from 'express';
import { brokerService }         from '../services/BrokerService.js';
import { persistenceService }    from '../services/PersistenceService.js';
import { tradeExecutionService } from '../services/TradeExecutionService.js';
import { authLimiter }           from '../middleware/rateLimiters.js';

const router = express.Router();

// ── POST /api/auth/connect ────────────────────────────────────────────────────

router.post('/connect', authLimiter, async (req, res) => {
  try {
    const { brokerId, credentials } = req.body;

    if (!brokerId) {
      return res.status(400).json({ success: false, error: 'brokerId is required' });
    }

    const sessionId = req.sessionID || 'default-session';
    const adapter   = brokerService.getAdapter(sessionId, brokerId);

    // Authenticate with broker
    const connected = await adapter.connect(credentials || {});

    if (!connected) {
      return res.status(401).json({
        success: false,
        error:   'Connection failed',
        message: 'Unable to authenticate with broker',
      });
    }

    // ── Historical data sync ──────────────────────────────────────────────
    // Run in background so the connect response is fast.
    // Errors here are logged but do not fail the connect response.
    setImmediate(() => _syncHistoricalData(brokerId, sessionId, adapter));

    res.json({
      success: true,
      message: `Connected to ${adapter.brokerName}. Historical data sync started.`,
      data: {
        brokerId:   adapter.brokerId,
        brokerName: adapter.brokerName,
        connected:  true,
      },
    });
  } catch (err) {
    console.error('[auth/connect] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/auth/disconnect ─────────────────────────────────────────────────

router.post('/disconnect', async (req, res) => {
  try {
    const { brokerId } = req.body;

    if (!brokerId) {
      return res.status(400).json({ success: false, error: 'brokerId is required' });
    }

    const sessionId = req.sessionID || 'default-session';
    brokerService.removeAdapter(sessionId, brokerId);

    res.json({ success: true, message: 'Disconnected successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/auth/status/:brokerId ────────────────────────────────────────────

router.get('/status/:brokerId', (req, res) => {
  try {
    const { brokerId } = req.params;
    const sessionId    = req.sessionID || 'default-session';
    const connected    = brokerService.isConnected(sessionId, brokerId);

    res.json({ success: true, data: { brokerId, connected } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── FYERS OAuth Routes ────────────────────────────────────────────────────────

/**
 * GET /api/auth/fyers/login-url
 * Returns the authorization URL to initiate FYERS OAuth2 flow
 */
router.get('/fyers/login-url', (req, res) => {
  try {
    const sessionId = req.sessionID || 'default-session';
    const adapter = brokerService.getAdapter(sessionId, 'fyers');
    const state = req.query.state || `riskloop_fyers_${Date.now()}`;
    const url = adapter.getLoginUrl(state);

    res.json({
      success: true,
      data: {
        brokerId: 'fyers',
        loginUrl: url,
        state,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/auth/fyers/callback
 * Handles the OAuth2 redirect from FYERS
 */
router.get('/fyers/callback', async (req, res) => {
  try {
    const authCode = req.query.auth_code || req.query.code;
    const error = req.query.error || req.query.error_description;

    if (error) {
      return res.status(400).send(`
        <html>
          <body style="font-family:sans-serif;background:#0d1117;color:#f85149;padding:40px;text-align:center;">
            <h2>FYERS Connection Failed</h2>
            <p>${error}</p>
            <a href="/#journal" style="color:#58a6ff;">Back to RiskLoop</a>
          </body>
        </html>
      `);
    }

    if (!authCode) {
      return res.status(400).send(`
        <html>
          <body style="font-family:sans-serif;background:#0d1117;color:#f85149;padding:40px;text-align:center;">
            <h2>Missing Auth Code</h2>
            <p>No authorization code received from FYERS.</p>
            <a href="/#journal" style="color:#58a6ff;">Back to RiskLoop</a>
          </body>
        </html>
      `);
    }

    const sessionId = req.sessionID || 'default-session';
    const adapter = brokerService.getAdapter(sessionId, 'fyers');

    const connected = await adapter.connect({ authCode });

    if (!connected) {
      throw new Error('Failed to validate FYERS auth code');
    }

    // Historical data sync in background
    setImmediate(() => _syncHistoricalData('fyers', sessionId, adapter));

    // Redirect to RiskLoop Journal with success query
    res.redirect('/#journal?broker_connected=fyers');
  } catch (err) {
    console.error('[auth/fyers/callback] Error:', err.message);
    res.status(500).send(`
      <html>
        <body style="font-family:sans-serif;background:#0d1117;color:#f85149;padding:40px;text-align:center;">
          <h2>FYERS Authentication Error</h2>
          <p>${err.message}</p>
          <a href="/#journal" style="color:#58a6ff;">Back to RiskLoop</a>
        </body>
      </html>
    `);
  }
});

/**
 * POST /api/auth/fyers/callback
 * Handles JSON auth_code exchange (for headless/modal integration)
 */
router.post('/fyers/callback', async (req, res) => {
  try {
    const authCode = req.body.authCode || req.body.auth_code || req.body.code;

    if (!authCode) {
      return res.status(400).json({ success: false, error: 'authCode is required' });
    }

    const sessionId = req.sessionID || 'default-session';
    const adapter = brokerService.getAdapter(sessionId, 'fyers');

    const connected = await adapter.connect({ authCode });

    if (!connected) {
      return res.status(401).json({ success: false, error: 'Unable to authenticate with FYERS' });
    }

    setImmediate(() => _syncHistoricalData('fyers', sessionId, adapter));

    res.json({
      success: true,
      message: 'Connected to FYERS. Historical data sync started.',
      data: {
        brokerId: 'fyers',
        brokerName: 'FYERS',
        connected: true,
      },
    });
  } catch (err) {
    console.error('[auth/fyers/callback] POST Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Dhan Authentication Routes ────────────────────────────────────────────────

/**
 * POST /api/auth/dhan/token
 * Connects to Dhan using Client ID and Access Token (from web.dhan.co -> DhanHQ APIs)
 */
router.post('/dhan/token', async (req, res) => {
  try {
    const { clientId, accessToken } = req.body;
    const sessionId = req.sessionID || 'default-session';
    const adapter = brokerService.getAdapter(sessionId, 'dhan');

    const connected = await adapter.connect({ clientId, accessToken });

    if (!connected) {
      return res.status(401).json({ success: false, error: 'Unable to authenticate with Dhan' });
    }

    setImmediate(() => _syncHistoricalData('dhan', sessionId, adapter));

    res.json({
      success: true,
      message: 'Connected to Dhan. Historical data sync started.',
      data: {
        brokerId: 'dhan',
        brokerName: 'Dhan',
        connected: true,
      },
    });
  } catch (err) {
    console.error('[auth/dhan/token] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Upstox OAuth Routes ───────────────────────────────────────────────────────

/**
 * GET /api/auth/upstox/login-url
 * Returns the authorization URL to initiate Upstox OAuth2 flow
 */
router.get('/upstox/login-url', (req, res) => {
  try {
    const sessionId = req.sessionID || 'default-session';
    const adapter = brokerService.getAdapter(sessionId, 'upstox');
    const state = req.query.state || `riskloop_upstox_${Date.now()}`;
    const url = adapter.getLoginUrl(state);

    res.json({
      success: true,
      data: {
        brokerId: 'upstox',
        loginUrl: url,
        state,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/auth/upstox/callback
 * Handles the OAuth2 redirect from Upstox
 */
router.get('/upstox/callback', async (req, res) => {
  try {
    const authCode = req.query.code || req.query.auth_code;
    const error = req.query.error || req.query.error_description;

    if (error) {
      return res.status(400).send(`
        <html>
          <body style="font-family:sans-serif;background:#0d1117;color:#f85149;padding:40px;text-align:center;">
            <h2>Upstox Connection Failed</h2>
            <p>${error}</p>
            <a href="/#journal" style="color:#58a6ff;">Back to RiskLoop</a>
          </body>
        </html>
      `);
    }

    if (!authCode) {
      return res.status(400).send(`
        <html>
          <body style="font-family:sans-serif;background:#0d1117;color:#f85149;padding:40px;text-align:center;">
            <h2>Missing Auth Code</h2>
            <p>No authorization code received from Upstox.</p>
            <a href="/#journal" style="color:#58a6ff;">Back to RiskLoop</a>
          </body>
        </html>
      `);
    }

    const sessionId = req.sessionID || 'default-session';
    const adapter = brokerService.getAdapter(sessionId, 'upstox');

    const connected = await adapter.connect({ authCode });

    if (!connected) {
      throw new Error('Failed to validate Upstox auth code');
    }

    setImmediate(() => _syncHistoricalData('upstox', sessionId, adapter));

    res.redirect('/#journal?broker_connected=upstox');
  } catch (err) {
    console.error('[auth/upstox/callback] Error:', err.message);
    res.status(500).send(`
      <html>
        <body style="font-family:sans-serif;background:#0d1117;color:#f85149;padding:40px;text-align:center;">
          <h2>Upstox Authentication Error</h2>
          <p>${err.message}</p>
          <a href="/#journal" style="color:#58a6ff;">Back to RiskLoop</a>
        </body>
      </html>
    `);
  }
});

/**
 * POST /api/auth/upstox/callback
 * Handles JSON auth_code exchange (for programmatic/modal integration)
 */
router.post('/upstox/callback', async (req, res) => {
  try {
    const authCode = req.body.authCode || req.body.auth_code || req.body.code;

    if (!authCode) {
      return res.status(400).json({ success: false, error: 'authCode is required' });
    }

    const sessionId = req.sessionID || 'default-session';
    const adapter = brokerService.getAdapter(sessionId, 'upstox');

    const connected = await adapter.connect({ authCode });

    if (!connected) {
      return res.status(401).json({ success: false, error: 'Unable to authenticate with Upstox' });
    }

    setImmediate(() => _syncHistoricalData('upstox', sessionId, adapter));

    res.json({
      success: true,
      message: 'Connected to Upstox. Historical data sync started.',
      data: {
        brokerId: 'upstox',
        brokerName: 'Upstox',
        connected: true,
      },
    });
  } catch (err) {
    console.error('[auth/upstox/callback] POST Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Shoonya Authentication Routes ─────────────────────────────────────────────

/**
 * POST /api/auth/shoonya/login
 * Connects to Shoonya Finvasia using credentials / TOTP
 */
router.post('/shoonya/login', async (req, res) => {
  try {
    const { userId, password, apiKey, vendorCode, imei, totpSecret, factor2 } = req.body;
    const sessionId = req.sessionID || 'default-session';
    const adapter = brokerService.getAdapter(sessionId, 'shoonya');

    const connected = await adapter.connect({
      userId,
      password,
      apiKey,
      vendorCode,
      imei,
      totpSecret,
      factor2,
    });

    if (!connected) {
      return res.status(401).json({ success: false, error: 'Unable to authenticate with Shoonya' });
    }

    setImmediate(() => _syncHistoricalData('shoonya', sessionId, adapter));

    res.json({
      success: true,
      message: 'Connected to Shoonya. Historical data sync started.',
      data: {
        brokerId: 'shoonya',
        brokerName: 'Shoonya',
        connected: true,
      },
    });
  } catch (err) {
    console.error('[auth/shoonya/login] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Alice Blue Authentication Routes ──────────────────────────────────────────

/**
 * POST /api/auth/aliceblue/login
 * Connects to Alice Blue ANT API using User ID & API Key
 */
router.post('/aliceblue/login', async (req, res) => {
  try {
    const { userId, apiKey } = req.body;
    const sessionId = req.sessionID || 'default-session';
    const adapter = brokerService.getAdapter(sessionId, 'aliceblue');

    const connected = await adapter.connect({ userId, apiKey });

    if (!connected) {
      return res.status(401).json({ success: false, error: 'Unable to authenticate with Alice Blue' });
    }

    setImmediate(() => _syncHistoricalData('aliceblue', sessionId, adapter));

    res.json({
      success: true,
      message: 'Connected to Alice Blue. Historical data sync started.',
      data: {
        brokerId: 'aliceblue',
        brokerName: 'Alice Blue',
        connected: true,
      },
    });
  } catch (err) {
    console.error('[auth/aliceblue/login] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Kotak Neo Authentication Routes ───────────────────────────────────────────

/**
 * POST /api/auth/kotakneo/login
 * Connects to Kotak Neo Trade API using Consumer Key/Secret, Mobile/Password or Session Token
 */
router.post('/kotakneo/login', async (req, res) => {
  try {
    const { consumerKey, consumerSecret, mobileNumber, password, sessionToken } = req.body;
    const sessionId = req.sessionID || 'default-session';
    const adapter = brokerService.getAdapter(sessionId, 'kotakneo');

    const connected = await adapter.connect({
      consumerKey,
      consumerSecret,
      mobileNumber,
      password,
      sessionToken,
    });

    if (!connected) {
      return res.status(401).json({ success: false, error: 'Unable to authenticate with Kotak Neo' });
    }

    setImmediate(() => _syncHistoricalData('kotakneo', sessionId, adapter));

    res.json({
      success: true,
      message: 'Connected to Kotak Neo. Historical data sync started.',
      data: {
        brokerId: 'kotakneo',
        brokerName: 'Kotak Neo',
        connected: true,
      },
    });
  } catch (err) {
    console.error('[auth/kotakneo/login] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── SAMCO Authentication Routes ───────────────────────────────────────────────

/**
 * POST /api/auth/samco/login
 * Connects to SAMCO StockNote API using User ID, Password, and YOB (Year of Birth)
 */
router.post('/samco/login', async (req, res) => {
  try {
    const { userId, password, yob, yotp } = req.body;
    const sessionId = req.sessionID || 'default-session';
    const adapter = brokerService.getAdapter(sessionId, 'samco');

    const connected = await adapter.connect({
      userId,
      password,
      yob: yob || yotp,
    });

    if (!connected) {
      return res.status(401).json({ success: false, error: 'Unable to authenticate with SAMCO' });
    }

    setImmediate(() => _syncHistoricalData('samco', sessionId, adapter));

    res.json({
      success: true,
      message: 'Connected to SAMCO. Historical data sync started.',
      data: {
        brokerId: 'samco',
        brokerName: 'SAMCO',
        connected: true,
      },
    });
  } catch (err) {
    console.error('[auth/samco/login] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── MetaTrader 5 (MT5) Authentication Routes ──────────────────────────────────

/**
 * POST /api/auth/mt5/login
 * Connects to MetaTrader 5 account using Login, Password, Server, and optional Gateway URL
 */
router.post('/mt5/login', async (req, res) => {
  try {
    const { login, userId, password, server, gatewayUrl, apiToken } = req.body;
    const sessionId = req.sessionID || 'default-session';
    const adapter = brokerService.getAdapter(sessionId, 'mt5');

    const connected = await adapter.connect({
      login: login || userId,
      password,
      server,
      gatewayUrl,
      apiToken,
    });

    if (!connected) {
      return res.status(401).json({ success: false, error: 'Unable to connect to MT5 account' });
    }

    setImmediate(() => _syncHistoricalData('mt5', sessionId, adapter));

    res.json({
      success: true,
      message: 'Connected to MetaTrader 5. Historical data sync started.',
      data: {
        brokerId: 'mt5',
        brokerName: 'MetaTrader 5',
        connected: true,
      },
    });
  } catch (err) {
    console.error('[auth/mt5/login] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/auth/sync ───────────────────────────────────────────────────────
// Manual re-sync endpoint — useful after WebSocket reconnect or on demand.

router.post('/sync', async (req, res) => {
  try {
    const { brokerId } = req.body;

    if (!brokerId) {
      return res.status(400).json({ success: false, error: 'brokerId is required' });
    }

    const sessionId = req.sessionID || 'default-session';

    if (!brokerService.isConnected(sessionId, brokerId)) {
      return res.status(401).json({ success: false, error: 'Not connected to broker' });
    }

    const adapter = brokerService.getAdapter(sessionId, brokerId);
    const result  = await _syncHistoricalData(brokerId, sessionId, adapter);

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Internal sync helper ──────────────────────────────────────────────────────

async function _syncHistoricalData(brokerId, sessionId, adapter) {
  const result = {
    brokerId,
    orders:    0,
    trades:    0,
    positions: 0,
    holdings:  0,
    errors:    [],
  };

  console.log(`[auth] Starting historical sync for ${brokerId}…`);

  // Orders
  try {
    const orders = await adapter.getOrders();
    const plain  = orders.map(o => (typeof o.toJSON === 'function' ? o.toJSON() : o));
    persistenceService.saveOrders(brokerId, plain);
    result.orders = plain.length;
  } catch (err) {
    result.errors.push(`orders: ${err.message}`);
    console.warn(`[auth/sync] Orders failed for ${brokerId}:`, err.message);
  }

  // Trades — sync through TradeExecutionService so dedup is applied
  try {
    const trades  = await adapter.getTradeHistory();
    const plain   = trades.map(t => (typeof t.toJSON === 'function' ? t.toJSON() : t));
    const synced  = await tradeExecutionService.synchronizeRestTrades(brokerId, plain);
    result.trades = synced.inserted;
  } catch (err) {
    result.errors.push(`trades: ${err.message}`);
    console.warn(`[auth/sync] Trades failed for ${brokerId}:`, err.message);
  }

  // Positions
  try {
    const positions = await adapter.getPositions();
    const plain     = positions.map(p => (typeof p.toJSON === 'function' ? p.toJSON() : p));
    persistenceService.savePositions(brokerId, plain);
    result.positions = plain.length;
  } catch (err) {
    result.errors.push(`positions: ${err.message}`);
    console.warn(`[auth/sync] Positions failed for ${brokerId}:`, err.message);
  }

  // Holdings
  try {
    const holdings = await adapter.getHoldings();
    const plain    = holdings.map(h => (typeof h.toJSON === 'function' ? h.toJSON() : h));
    persistenceService.saveHoldings(brokerId, plain);
    result.holdings = plain.length;
  } catch (err) {
    result.errors.push(`holdings: ${err.message}`);
    console.warn(`[auth/sync] Holdings failed for ${brokerId}:`, err.message);
  }

  console.log(
    `[auth] Sync complete for ${brokerId}: ` +
    `${result.orders} orders, ${result.trades} trades, ` +
    `${result.positions} positions, ${result.holdings} holdings` +
    (result.errors.length ? ` | errors: ${result.errors.join('; ')}` : '')
  );

  return result;
}

export default router;
