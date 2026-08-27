/**
 * Alice Blue (ANT API v2) Broker Adapter
 * Read-only implementation for authentication, profile, funds, positions, holdings, orders, and executed trades.
 * 
 * Official Docs: https://v2api.aliceblueonline.com/
 * Base URL: https://ant.aliceblueonline.com/rest/AliceBlueAPIService/api
 */

import axios from 'axios';
import crypto from 'crypto';
import { BaseBrokerAdapter } from '../BaseBrokerAdapter.js';
import { Account, Position, Order, Funds, Holding, Quote, Trade } from '../../models/index.js';

export class AliceBlueAdapter extends BaseBrokerAdapter {
  constructor(config = {}) {
    super({
      brokerId: 'aliceblue',
      brokerName: 'Alice Blue',
      ...config,
    });

    // Credentials
    this.userId = config.userId || process.env.ALICEBLUE_USER_ID;
    this.apiKey = config.apiKey || process.env.ALICEBLUE_API_KEY;

    // API endpoints
    this.baseUrl = 'https://ant.aliceblueonline.com/rest/AliceBlueAPIService/api';

    // Session state
    this.sessionID = null;
    this.encKey = null;

    // HTTP client
    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: parseInt(process.env.API_TIMEOUT) || 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Get broker capabilities - strictly read-only
   */
  getCapabilities() {
    return {
      profile: true,
      funds: true,
      positions: true,
      orders: true,       // Order history for reconciliation only
      holdings: true,
      quotes: true,
      tradeHistory: true, // Broker-confirmed executions only
      placeOrder: false,  // RiskLoop NEVER places orders
      modifyOrder: false, // RiskLoop NEVER modifies orders
      cancelOrder: false, // RiskLoop NEVER cancels orders
    };
  }

  /**
   * Validate configuration
   */
  _validateConfig() {
    const errors = [];
    if (!this.userId) errors.push('ALICEBLUE_USER_ID is required');
    if (!this.apiKey) errors.push('ALICEBLUE_API_KEY is required');

    if (errors.length > 0) {
      throw new Error(`Alice Blue configuration error: ${errors.join(', ')}`);
    }
  }

  /**
   * Generate SHA-256 hash
   */
  _sha256(text) {
    return crypto.createHash('sha256').update(text).digest('hex');
  }

  /**
   * Authenticate with Alice Blue ANT API (Encryption Key -> User SID)
   */
  async connect(credentials = {}) {
    try {
      this._log('Connecting to Alice Blue ANT API...');

      if (credentials.userId) this.userId = credentials.userId;
      if (credentials.apiKey) this.apiKey = credentials.apiKey;

      this._validateConfig();

      // Step 1: Get Encryption Key
      const encResponse = await this.httpClient.post('/customer/getEncryptionKey', {
        userId: this.userId,
      });

      const encData = encResponse.data;
      const encKey = encData?.encKey || encData?.data?.encKey || encData;
      if (!encKey || typeof encKey !== 'string') {
        throw new Error(encData?.emsg || 'Failed to obtain encryption key from Alice Blue');
      }
      this.encKey = encKey;

      // Step 2: Compute SHA-256 (userId + apiKey + encKey)
      const rawData = `${this.userId}${this.apiKey}${this.encKey}`;
      const userData = this._sha256(rawData);

      // Step 3: Get User SID (Session ID)
      const sidResponse = await this.httpClient.post('/customer/getUserSID', {
        userId: this.userId,
        userData: userData,
      });

      const sidData = sidResponse.data;
      const sessionID = sidData?.sessionID || sidData?.data?.sessionID || sidData?.session_id;
      if (!sessionID) {
        throw new Error(sidData?.emsg || sidData?.message || 'Failed to obtain session ID from Alice Blue');
      }

      this.sessionID = sessionID;
      this.isConnected = true;

      this._log('Successfully connected to Alice Blue');
      return this.isConnected;
    } catch (error) {
      this.isConnected = false;
      this.sessionID = null;
      const errorMsg = error.response?.data?.emsg || error.response?.data?.message || error.message || 'Alice Blue authentication failed';
      this._error('Connection failed: ' + errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * Disconnect session
   */
  async disconnect() {
    try {
      if (this.isConnected && this.sessionID) {
        this._log('Logging out from Alice Blue...');
        await this._authenticatedRequest('POST', '/customer/logout').catch(() => {});
      }
    } finally {
      this.sessionID = null;
      this.encKey = null;
      this.isConnected = false;
      this._log('Successfully disconnected from Alice Blue');
    }
  }

  /**
   * Make authenticated request
   */
  async _authenticatedRequest(method, endpoint, data = null) {
    if (!this.isConnected || !this.sessionID) {
      throw new Error('Not connected to Alice Blue. Please authenticate first.');
    }

    try {
      const config = {
        method,
        url: endpoint,
        headers: {
          'Authorization': `Bearer ${this.userId} ${this.sessionID}`,
        },
      };

      if (data) {
        if (method === 'GET') {
          config.params = data;
        } else {
          config.data = data;
        }
      }

      const response = await this.httpClient.request(config);
      const resData = response.data;

      if (resData && (resData.stat === 'Not_Ok' || resData.status === 'error')) {
        throw new Error(resData.emsg || resData.message || `Alice Blue API request failed on ${endpoint}`);
      }

      return resData;
    } catch (error) {
      const errorMsg = error.response?.data?.emsg || error.response?.data?.message || error.message;
      this._error(`Alice Blue API error on ${endpoint}: ${errorMsg}`);
      throw new Error(errorMsg);
    }
  }

  // ============================================================
  // READ-ONLY DATA FETCHING METHODS
  // ============================================================

  /**
   * Get user profile details
   * GET /customer/accountDetails
   */
  async getProfile() {
    try {
      this._log('Fetching profile from Alice Blue...');
      const data = await this._authenticatedRequest('GET', '/customer/accountDetails');
      return this._normalizeProfile(data);
    } catch (error) {
      this._error('Failed to fetch profile: ' + error.message);
      throw error;
    }
  }

  /**
   * Get funds and margin limits
   * GET /limits/getRmsLimits
   */
  async getFunds() {
    try {
      this._log('Fetching funds from Alice Blue...');
      const data = await this._authenticatedRequest('GET', '/limits/getRmsLimits');
      return this._normalizeFunds(data);
    } catch (error) {
      this._error('Failed to fetch funds: ' + error.message);
      throw error;
    }
  }

  /**
   * Get open positions
   * GET /positionAndHoldings/positionBook
   */
  async getPositions() {
    try {
      this._log('Fetching positions from Alice Blue...');
      const data = await this._authenticatedRequest('GET', '/positionAndHoldings/positionBook', {
        ret: 'NET',
      });

      const list = Array.isArray(data) ? data : (data?.data || []);
      return list.map(pos => this._normalizePosition(pos));
    } catch (error) {
      this._error('Failed to fetch positions: ' + error.message);
      throw error;
    }
  }

  /**
   * Get order book (for reconciliation)
   * GET /placeOrder/fetchOrderBook
   */
  async getOrders() {
    try {
      this._log('Fetching order book from Alice Blue...');
      const data = await this._authenticatedRequest('GET', '/placeOrder/fetchOrderBook');

      const list = Array.isArray(data) ? data : (data?.data || []);
      return list.map(order => this._normalizeOrder(order));
    } catch (error) {
      this._error('Failed to fetch orders: ' + error.message);
      throw error;
    }
  }

  /**
   * Get holdings
   * GET /positionAndHoldings/holdings
   */
  async getHoldings() {
    try {
      this._log('Fetching holdings from Alice Blue...');
      const data = await this._authenticatedRequest('GET', '/positionAndHoldings/holdings');

      const list = Array.isArray(data) ? data : (data?.data || []);
      return list.map(holding => this._normalizeHolding(holding));
    } catch (error) {
      this._error('Failed to fetch holdings: ' + error.message);
      throw error;
    }
  }

  /**
   * Get executed trade history
   * GET /placeOrder/fetchTradeBook
   */
  async getTradeHistory() {
    try {
      this._log('Fetching trade history from Alice Blue...');
      const data = await this._authenticatedRequest('GET', '/placeOrder/fetchTradeBook');

      const list = Array.isArray(data) ? data : (data?.data || []);
      return list.map(trade => this._normalizeTrade(trade));
    } catch (error) {
      this._error('Failed to fetch trade history: ' + error.message);
      throw error;
    }
  }

  /**
   * Get quotes
   * POST /marketData/getMarketQuote
   */
  async getQuotes(symbols) {
    try {
      this._log('Fetching quotes from Alice Blue...', { count: symbols.length });
      const quotes = [];

      for (const sym of symbols) {
        try {
          const parts = sym.split(':');
          const exch = parts.length > 1 ? parts[0] : 'NSE';
          const symbol = parts.length > 1 ? parts[1] : sym;

          const data = await this._authenticatedRequest('POST', '/marketData/getMarketQuote', {
            exch,
            symbol,
          });

          if (data) {
            quotes.push(this._normalizeQuote(data));
          }
        } catch (err) {
          // ignore single quote error
        }
      }

      return quotes;
    } catch (error) {
      this._error('Failed to fetch quotes: ' + error.message);
      throw error;
    }
  }

  // ============================================================
  // READ-ONLY ARCHITECTURE ENFORCEMENT
  // RiskLoop NEVER places, modifies, or cancels orders.
  // ============================================================

  async placeOrder(orderRequest) {
    throw new Error('RiskLoop is a read-only analytics and journal platform. Placing orders is strictly disabled.');
  }

  async modifyOrder(orderId, modifications) {
    throw new Error('RiskLoop is a read-only analytics and journal platform. Modifying orders is strictly disabled.');
  }

  async cancelOrder(orderId) {
    throw new Error('RiskLoop is a read-only analytics and journal platform. Cancelling orders is strictly disabled.');
  }

  // ============================================================
  // NORMALIZATION METHODS
  // ============================================================

  /**
   * Normalize Alice Blue accountDetails to Account model
   */
  _normalizeProfile(data = {}) {
    const profile = Array.isArray(data) ? (data[0] || {}) : (data.data || data);

    return new Account({
      brokerId: 'aliceblue',
      brokerName: 'Alice Blue',
      userId: profile.accountId || profile.userId || this.userId,
      clientId: profile.accountId || profile.userId || this.userId,
      name: profile.accountName || profile.userName || '',
      email: profile.email || '',
      mobile: profile.cellAddr || profile.mobile || '',
      pan: this._maskPAN(profile.pan),
      exchanges: profile.exchange || ['NSE', 'BSE', 'MCX', 'NFO', 'CDS'],
      segments: ['EQUITY', 'DERIVATIVE', 'COMMODITY', 'CURRENCY'],
      products: ['CNC', 'MIS', 'NRML', 'CO', 'BO'],
      accountStatus: 'ACTIVE',
      metadata: {
        branchId: profile.branchId,
        brokerName: profile.brokerName || 'ALICE_BLUE',
      },
    });
  }

  /**
   * Normalize Alice Blue getRmsLimits to Funds model
   */
  _normalizeFunds(data = {}) {
    const limits = Array.isArray(data) ? (data[0] || {}) : (data.data || data);

    const net = parseFloat(limits.net) || parseFloat(limits.cash) || 0;
    const marginUsed = parseFloat(limits.marginused) || parseFloat(limits.usedmargin) || 0;
    const realizedPnl = parseFloat(limits.realisedPNL) || parseFloat(limits.rpnl) || 0;
    const unrealizedPnl = parseFloat(limits.unrealisedPNL) || parseFloat(limits.urmtom) || 0;
    const collateral = parseFloat(limits.collateralmargin) || 0;
    const available = parseFloat(limits.credits) || parseFloat(limits.net) || (net - marginUsed);

    return new Funds({
      segment: 'EQUITY',
      availableMargin: available,
      usedMargin: marginUsed,
      totalMargin: available + marginUsed,
      openingBalance: net,
      netBalance: available,
      realizedPnl: realizedPnl,
      unrealizedPnl: unrealizedPnl,
      marginUsed: marginUsed,
      collateral: collateral,
      exposureMargin: parseFloat(limits.exposuremargin) || 0,
      spanMargin: parseFloat(limits.spanmargin) || 0,
      deliveryMargin: 0,
      metadata: {
        payin: parseFloat(limits.payin) || 0,
        payout: parseFloat(limits.payout) || 0,
      },
    });
  }

  /**
   * Normalize Alice Blue position to Position model
   */
  _normalizePosition(data = {}) {
    const netQty = parseInt(data.Netqty) || parseInt(data.netqty) || parseInt(data.Quantity) || 0;
    const buyQty = parseInt(data.Buyqty) || parseInt(data.buyqty) || 0;
    const sellQty = parseInt(data.Sellqty) || parseInt(data.sellqty) || 0;
    const buyAvg = parseFloat(data.Buyavgprc) || parseFloat(data.buyavgprice) || 0;
    const sellAvg = parseFloat(data.Sellavgprc) || parseFloat(data.sellavgprice) || 0;
    const ltp = parseFloat(data.LTP) || parseFloat(data.ltp) || 0;
    const realizedPnl = parseFloat(data.Realisedprofit) || parseFloat(data.rpnl) || 0;
    const unrealizedPnl = parseFloat(data.Unrealisedprofit) || parseFloat(data.urmtom) || 0;
    const totalPnl = parseFloat(data.Mtm) || parseFloat(data.pnl) || (realizedPnl + unrealizedPnl);

    return new Position({
      symbol: data.Tsym || data.TradingSymbol || data.tsym || '',
      tradingSymbol: data.Token || data.token || '',
      exchange: data.Exchange || data.exch || '',
      segment: this._mapProductType(data.Pcode || data.product),
      product: data.Pcode || data.product || '',
      instrumentType: data.Instname || data.instrument_type || '',
      quantity: netQty,
      buyQuantity: buyQty,
      sellQuantity: sellQty,
      buyPrice: buyAvg,
      sellPrice: sellAvg,
      lastPrice: ltp,
      closePrice: parseFloat(data.Close) || 0,
      pnl: totalPnl,
      realizedPnl: realizedPnl,
      unrealizedPnl: unrealizedPnl,
      pnlPercent: buyAvg > 0 ? ((totalPnl / (buyAvg * Math.abs(netQty || 1))) * 100) : 0,
      lotSize: parseInt(data.Lotsize) || 1,
      multiplier: parseFloat(data.GeneralMultiplier) || 1,
      metadata: {
        token: data.Token,
        pcode: data.Pcode,
      },
    });
  }

  /**
   * Normalize Alice Blue holding to Holding model
   */
  _normalizeHolding(data = {}) {
    const qty = parseInt(data.holdqty) || parseInt(data.Holdqty) || parseInt(data.quantity) || 0;
    const avgPrice = parseFloat(data.Price) || parseFloat(data.price) || parseFloat(data.upldprc) || 0;
    const ltp = parseFloat(data.LTP) || parseFloat(data.ltp) || 0;
    const pnl = parseFloat(data.Pnl) || parseFloat(data.pnl) || ((ltp - avgPrice) * qty);

    return new Holding({
      symbol: data.Tsym || data.TradingSymbol || data.tsym || '',
      tradingSymbol: data.Token || data.token || '',
      isin: data.isin || '',
      exchange: data.Exchange || data.exch || 'NSE',
      quantity: qty,
      t1Quantity: parseInt(data.Btstqty) || 0,
      authorizedQuantity: parseInt(data.dpqty) || qty,
      collateralQuantity: parseInt(data.Colqty) || 0,
      averagePrice: avgPrice,
      lastPrice: ltp,
      closePrice: parseFloat(data.Close) || 0,
      pnl: pnl,
      dayPnl: 0,
      pnlPercent: avgPrice > 0 ? ((pnl / (avgPrice * qty)) * 100) : 0,
      investedValue: avgPrice * qty,
      currentValue: ltp * qty,
      metadata: {
        token: data.Token,
      },
    });
  }

  /**
   * Normalize Alice Blue order to Order model
   */
  _normalizeOrder(data = {}) {
    const qty = parseInt(data.Qty) || parseInt(data.quantity) || 0;
    const filledQty = parseInt(data.Filledshares) || parseInt(data.filledQuantity) || 0;

    return new Order({
      orderId: data.Nstordno || data.nestOrderNumber || data.orderNo || '',
      orderTag: data.Remarks || '',
      symbol: data.Trsym || data.TradingSymbol || data.tsym || '',
      tradingSymbol: data.Token || data.token || '',
      exchange: data.Exchange || data.exch || '',
      segment: this._mapProductType(data.Pcode || data.product),
      product: data.Pcode || data.product || '',
      instrumentType: data.Instname || '',
      orderType: data.PrcType || data.orderType || 'LIMIT',
      transactionType: (data.Trantype === 'B' || data.transactionType === 'BUY') ? 'BUY' : 'SELL',
      quantity: qty,
      filledQuantity: filledQty,
      pendingQuantity: qty - filledQty,
      cancelledQuantity: parseInt(data.Cancelshares) || 0,
      price: parseFloat(data.Prc) || parseFloat(data.price) || 0,
      triggerPrice: parseFloat(data.Trgprc) || 0,
      averagePrice: parseFloat(data.Avgprc) || parseFloat(data.averagePrice) || 0,
      status: this._mapOrderStatus(data.Status || data.orderStatus),
      statusMessage: data.RejReason || '',
      validity: data.Validity || 'DAY',
      variety: 'REGULAR',
      orderTimestamp: data.OrderedTime || data.orderTimestamp || '',
      updateTimestamp: data.ExchangeTimestamp || data.updateTimestamp || '',
      lotSize: parseInt(data.Lotsize) || 1,
      metadata: {
        nstordno: data.Nstordno,
      },
    });
  }

  /**
   * Normalize Alice Blue trade to Trade model
   */
  _normalizeTrade(data = {}) {
    const qty = parseInt(data.Qty) || parseInt(data.tradedQuantity) || 0;
    const price = parseFloat(data.Price) || parseFloat(data.tradedPrice) || 0;
    const time = data.TradeTime || data.tradeTime || data.ExchangeTimestamp || '';

    return new Trade({
      tradeId: data.FillId || data.fillNumber || data.Nstordno || '',
      orderId: data.Nstordno || data.nestOrderNumber || '',
      symbol: data.Trsym || data.TradingSymbol || data.tsym || '',
      tradingSymbol: data.Token || data.token || '',
      exchange: data.Exchange || data.exch || '',
      segment: this._mapProductType(data.Pcode || data.product),
      product: data.Pcode || data.product || '',
      instrumentType: '',
      transactionType: (data.Trantype === 'B' || data.transactionType === 'BUY') ? 'BUY' : 'SELL',
      quantity: qty,
      price: price,
      tradeValue: qty * price,
      tradeDate: time.split(' ')[0] || time.split('T')[0] || '',
      tradeTime: time.split(' ')[1] || time.split('T')[1] || '',
      timestamp: time,
      metadata: {
        nstordno: data.Nstordno,
        fillId: data.FillId,
      },
    });
  }

  /**
   * Normalize Alice Blue quote to Quote model
   */
  _normalizeQuote(data = {}) {
    const ltp = parseFloat(data.LTP) || parseFloat(data.ltp) || 0;
    const close = parseFloat(data.Close) || parseFloat(data.close) || 0;
    const change = ltp - close;
    const changePercent = close > 0 ? ((change / close) * 100) : 0;

    return new Quote({
      symbol: data.Tsym || data.TradingSymbol || '',
      tradingSymbol: data.Token || data.token || '',
      exchange: data.Exchange || data.exch || '',
      ltp: ltp,
      open: parseFloat(data.Open) || 0,
      high: parseFloat(data.High) || 0,
      low: parseFloat(data.Low) || 0,
      close: close,
      change: change,
      changePercent: changePercent,
      volume: parseInt(data.Volume) || 0,
      upperCircuit: parseFloat(data.UpperCircuit) || 0,
      lowerCircuit: parseFloat(data.LowerCircuit) || 0,
      lotSize: parseInt(data.Lotsize) || 1,
      metadata: {
        token: data.Token,
      },
    });
  }

  // ============================================================
  // UTILITY METHODS
  // ============================================================

  _mapProductType(pcode) {
    const mapping = {
      'CNC': 'EQUITY',
      'MIS': 'EQUITY',
      'NRML': 'DERIVATIVE',
      'CO': 'EQUITY',
      'BO': 'EQUITY',
    };
    return mapping[pcode] || 'EQUITY';
  }

  _mapOrderStatus(status) {
    const s = (status || '').toUpperCase();
    if (s === 'COMPLETE' || s === 'EXECUTED' || s === 'TRADED' || s === 'FILLED') return 'COMPLETE';
    if (s === 'REJECTED') return 'REJECTED';
    if (s === 'CANCELLED' || s === 'CANCELED') return 'CANCELLED';
    if (s === 'OPEN' || s === 'PENDING' || s === 'TRIGGER_PENDING') return 'PENDING';
    return s || 'UNKNOWN';
  }

  _maskPAN(pan) {
    if (!pan || pan.length < 4) return pan || '';
    return pan.substring(0, 4) + '****' + pan.substring(pan.length - 2);
  }

  _log(message, data = null) {
    console.log(`[${this.brokerName}] ${message}`, data ? this._sanitizeLogData(data) : '');
  }

  _sanitizeLogData(data) {
    if (typeof data !== 'object') return data;
    const sanitized = { ...data };
    const sensitive = ['key', 'token', 'sessionid', 'enckey', 'userdata', 'apikey'];
    Object.keys(sanitized).forEach(k => {
      if (sensitive.some(s => k.toLowerCase().includes(s))) {
        sanitized[k] = '***REDACTED***';
      }
    });
    return sanitized;
  }
}
