/**
 * Instruments API Route
 * Serves master CSV instrument data as JSON with full search/filter support
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CSV_PATH = path.resolve(__dirname, '../../data/instruments.csv');

/**
 * Parse CSV text into array of instrument objects
 */
function parseCSV(content) {
  const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const instruments = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim());
    if (cols.length < headers.length) continue;

    const item = {};
    headers.forEach((header, idx) => {
      item[header] = cols[idx] || '';
    });

    if (item.symbol) {
      instruments.push({
        symbol: item.symbol,
        name: item.name || item.symbol,
        asset_type: item.asset_type || 'stock',
        exchange: item.exchange || 'NSE',
        currency: item.currency || 'INR',
      });
    }
  }

  return instruments;
}

/**
 * Cached in-memory instrument list with file timestamp validation
 */
let cachedInstruments = null;
let lastMtime = 0;

async function getInstruments() {
  try {
    const stats = await fs.promises.stat(CSV_PATH);
    if (!cachedInstruments || stats.mtimeMs > lastMtime) {
      const content = await fs.promises.readFile(CSV_PATH, 'utf8');
      cachedInstruments = parseCSV(content);
      lastMtime = stats.mtimeMs;
      console.log(`[Instruments] Loaded ${cachedInstruments.length} master instruments from ${CSV_PATH}`);
    }
    return cachedInstruments;
  } catch (err) {
    console.error('[Instruments] Error reading instruments.csv:', err);
    return cachedInstruments || [];
  }
}

/**
 * GET /api/instruments
 * Filter options:
 *   ?search=       — substring search across symbol and name
 *   ?symbol=       — exact or partial symbol filter
 *   ?name=         — partial name filter
 *   ?asset_type=   — filter by asset_type (e.g. stock, index, forex, crypto, metal, commodity)
 *   ?exchange=     — filter by exchange (e.g. NSE, BSE, OTC, CEX)
 *   ?currency=     — filter by currency (e.g. INR, USD, EUR)
 *   ?limit=        — maximum number of records to return
 */
router.get('/', async (req, res) => {
  try {
    const instruments = await getInstruments();
    const {
      search,
      symbol,
      name,
      asset_type,
      assetType,
      exchange,
      currency,
      limit,
    } = req.query;

    const requestedAssetType = (asset_type || assetType || '').toLowerCase().trim();
    const searchQuery = (search || '').toLowerCase().trim();
    const symbolQuery = (symbol || '').toUpperCase().trim();
    const nameQuery = (name || '').toLowerCase().trim();
    const exchangeQuery = (exchange || '').toUpperCase().trim();
    const currencyQuery = (currency || '').toUpperCase().trim();

    let filtered = instruments.filter(item => {
      // Asset Type filter (supports commas e.g. 'stock,index' or 'fo')
      if (requestedAssetType) {
        if (requestedAssetType === 'fo') {
          if (item.asset_type !== 'stock' && item.asset_type !== 'index') return false;
        } else {
          const types = requestedAssetType.split(',').map(t => t.trim());
          if (!types.includes(item.asset_type.toLowerCase())) return false;
        }
      }

      // Exchange filter
      if (exchangeQuery && item.exchange.toUpperCase() !== exchangeQuery) {
        return false;
      }

      // Currency filter
      if (currencyQuery && item.currency.toUpperCase() !== currencyQuery) {
        return false;
      }

      // Exact / partial symbol query
      if (symbolQuery && !item.symbol.toUpperCase().includes(symbolQuery)) {
        return false;
      }

      // Partial name query
      if (nameQuery && !item.name.toLowerCase().includes(nameQuery)) {
        return false;
      }

      // General search query across symbol and name
      if (searchQuery) {
        const matchesSymbol = item.symbol.toLowerCase().includes(searchQuery);
        const matchesName = item.name.toLowerCase().includes(searchQuery);
        if (!matchesSymbol && !matchesName) return false;
      }

      return true;
    });

    if (limit && !isNaN(Number(limit))) {
      filtered = filtered.slice(0, Number(limit));
    }

    return res.json({
      success: true,
      count: filtered.length,
      total: instruments.length,
      data: filtered,
    });
  } catch (err) {
    console.error('[Instruments] GET /api/instruments handler error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve instruments',
      message: err.message,
    });
  }
});

export default router;
