/**
 * Orders Routes
 * GET  /api/orders          – merged DB + live broker orders
 * POST /api/orders          – place order, persist immediately
 * PUT  /api/orders/:orderId – modify order
 * DEL  /api/orders/:orderId – cancel order
 *
 * TRADE RULE: placing an order is NOT a trade.
 * Only broker-confirmed executions (handled by TradeExecutionService) become trades.
 */

import express from 'express';
import { brokerService }      from '../services/BrokerService.js';
import { persistenceService } from '../services/PersistenceService.js';

const router = express.Router();

// ── Middleware ────────────────────────────────────────────────────────────────

const requireBrokerConnection = (req, res, next) => {
  const brokerId = req.query.brokerId || req.body?.brokerId;

  if (!brokerId) {
    return res.status(400).json({ success: false, error: 'brokerId is required' });
  }

  const sessionId = req.sessionID || 'default-session';

  if (!brokerService.isConnected(sessionId, brokerId)) {
    return res.status(401).json({ success: false, error: 'Not connected to broker' });
  }

  req.brokerId  = brokerId;
  req.sessionId = sessionId;
  next();
};

// ── GET /api/orders ───────────────────────────────────────────────────────────

router.get('/', requireBrokerConnection, async (req, res) => {
  try {
    const { brokerId, sessionId } = req;
    const adapter = brokerService.getAdapter(sessionId, brokerId);

    let liveOrders = [];
    try {
      const fetched = await adapter.getOrders();
      liveOrders    = fetched.map(o => (typeof o.toJSON === 'function' ? o.toJSON() : o));

      // Persist the fresh snapshot so history survives restart
      persistenceService.saveOrders(brokerId, liveOrders);
    } catch (liveErr) {
      console.warn(`[orders] Live fetch failed for ${brokerId}, falling back to DB:`, liveErr.message);
    }

    // Merge: live data wins; DB fills in historical records not in live list
    const dbOrders = persistenceService.getOrders(brokerId);
    const merged   = persistenceService.mergeWithLive('orderId', liveOrders, dbOrders);

    res.json({ success: true, data: merged });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── READ-ONLY ARCHITECTURE ENFORCEMENT ────────────────────────────────────────
// RiskLoop is a read-only analytics and journal platform.
// Placing, modifying, or cancelling orders on behalf of users is strictly disabled.

router.post('/', (req, res) => {
  res.status(403).json({
    success: false,
    error: 'RiskLoop is a read-only analytics and journal platform. Placing orders is strictly disabled.',
  });
});

router.put('/:orderId', (req, res) => {
  res.status(403).json({
    success: false,
    error: 'RiskLoop is a read-only analytics and journal platform. Modifying orders is strictly disabled.',
  });
});

router.delete('/:orderId', (req, res) => {
  res.status(403).json({
    success: false,
    error: 'RiskLoop is a read-only analytics and journal platform. Cancelling orders is strictly disabled.',
  });
});

export default router;
