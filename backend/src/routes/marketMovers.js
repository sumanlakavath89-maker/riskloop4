/**
 * Market Movers API Routes
 * Serves real-time Top Gainers and Top Losers sourced from Angel One SmartAPI backend.
 */

import express from 'express';
import { angelOneMarketService } from '../services/AngelOneMarketService.js';

const router = express.Router();

/**
 * GET /api/market/movers
 * GET /api/market/top-movers
 * 
 * Query parameters:
 *   ?type=gainers | losers (optional: if provided, returns array directly)
 */
router.get('/', async (req, res) => {
  try {
    const { type } = req.query;
    const moversData = await angelOneMarketService.getTopMovers();

    if (type === 'gainers' || type === 'losers') {
      return res.json({
        success: true,
        source: moversData.source,
        timestamp: moversData.timestamp,
        cached: Boolean(moversData.cached),
        data: moversData.data?.[type] || [],
      });
    }

    return res.json(moversData);
  } catch (err) {
    console.error('[MarketMoversRoute] Error handling request:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve market movers',
      message: err.message,
    });
  }
});
/**
 * GET /api/market/fo-instruments
 * GET /api/market/fo/instruments
 * Returns master list of F&O instruments with dynamic lot sizes from Angel One
 */
router.get('/fo-instruments', async (req, res) => {
  try {
    const foData = await angelOneMarketService.getFOInstruments();
    return res.json(foData);
  } catch (err) {
    console.error('[MarketMoversRoute] Error fetching F&O instruments:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve F&O instruments',
      message: err.message,
    });
  }
});

router.get('/instruments', async (req, res) => {
  try {
    const foData = await angelOneMarketService.getFOInstruments();
    return res.json(foData);
  } catch (err) {
    console.error('[MarketMoversRoute] Error fetching instruments:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve instruments',
      message: err.message,
    });
  }
});

/**
 * GET /api/market/fo-contract
 * GET /api/market/fo/contract
 * Returns dynamic lot size and specification for a specific F&O underlying
 * Query parameters:
 *   ?symbol=NIFTY | BANKNIFTY | RELIANCE ...
 *   ?contractType=options | futures
 */
router.get('/fo-contract', async (req, res) => {
  try {
    const { symbol, contractType } = req.query;
    const contractSpecs = await angelOneMarketService.getFOContract(symbol, contractType);
    return res.json(contractSpecs);
  } catch (err) {
    console.error('[MarketMoversRoute] Error fetching F&O contract specs:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve F&O contract specs',
      message: err.message,
    });
  }
});

router.get('/contract', async (req, res) => {
  try {
    const { symbol, contractType } = req.query;
    const contractSpecs = await angelOneMarketService.getFOContract(symbol, contractType);
    return res.json(contractSpecs);
  } catch (err) {
    console.error('[MarketMoversRoute] Error fetching contract specs:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve contract specs',
      message: err.message,
    });
  }
});

export default router;
