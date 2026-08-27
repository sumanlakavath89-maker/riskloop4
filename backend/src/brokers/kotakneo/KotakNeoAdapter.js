/**
 * Kotak Neo (Trade API) Broker Adapter
 * Read-only implementation for authentication, profile, funds, positions, holdings, orders, and executed trades.
 * 
 * Official Docs: https://napi.kotaksecurities.com/devportal
 * Base URL: https://gw-napi.kotaksecurities.com
 */

import axios from 'axios';
import { BaseBrokerAdapter } from '../BaseBrokerAdapter.js';
import { Account, Position, Order, Funds, Holding, Quote, Trade } from '../../models/index.js';

export class KotakNeoAdapter extends BaseBrokerAdapter {
  constructor(config = {}) {
    super({
      brokerId: 'kotakneo',
      brokerName: 'Kotak Neo',
      ...config,
    });

    // Credentials
    this.consumerKey = config.consumerKey || process.env.KOTAKNEO_CONSUMER_KEY;
    this.consumerSecret = config.consumerSecret || process.env.KOTAKNEO_CONSUMER_SECRET;
    this.mobileNumber = config.mobileNumber || process.env.KOTAKNEO_MOBILE_NUMBER;
    this.password = config.password || process.env.KOTAKNEO_PASSWORD;
    this.sessionToken = config.sessionToken || process.env.KOTAKNEO_SESSION_TOKEN;

    // API Gateway configuration
    this.baseUrl = 'https://gw-napi.kotaksecurities.com';
    this.gatewayToken = null;
    this.userProfile = null;

    // HTTP client
    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: parseInt(process.env.API_TIMEOUT) || 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
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
    if (!this.consumerKey) errors.push('KOTAKNEO_CONSUMER_KEY is required');
    if (!this.consumerSecret) errors.push('KOTAKNEO_CONSUMER_SECRET is required');

    if (errors.length > 0) {
      throw new Error(`Kotak Neo configuration error: ${errors.join(', ')}`);
    }
  }

  /**
   * Connect and authenticate with Kotak Neo API Gateway
   */
  async connect(credentials = {}) {
    try {
      this._log('Connecting to Kotak Neo API Gateway...');

      if (credentials.consumerKey) this.consumerKey = credentials.consumerKey;
      if (credentials.consumerSecret) this.consumerSecret = credentials.consumerSecret;
      if (credentials.mobileNumber) this.mobileNumber = credentials.mobileNumber;
      if (credentials.password) this.password = credentials.password;
      if (credentials.sessionToken) this.sessionToken = credentials.sessionToken;

      this._validateConfig();

      // Step 1: Obtain Gateway OAuth Token using Basic Auth (consumerKey:consumerSecret)
      const basicAuth = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
      const tokenResponse = await axios.post(
        `${this.baseUrl}/token`,
        'grant_type=client_credentials',
        {
          headers: {
            'Authorization': `Basic ${basicAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const tokenData = tokenResponse.data;
      if (!tokenData || !tokenData.access_token) {
        throw new Error('Failed to obtain Kotak Neo gateway access token');
      }
      this.gatewayToken = tokenData.access_token;

      // Step 2: Validate User Session if credentials/sessionToken provided
      if (this.sessionToken) {
        this.isConnected = true;
      } else if (this.mobileNumber && this.password) {
        const loginResponse = await this.httpClient.post('/login/1.0/login/v2/validate', {
          mobileNumber: this.mobileNumber,
          password: this.password,
        }, {
          headers: {
            'Authorization': `Bearer ${this.gatewayToken}`,
          },
        });

        const loginData = loginResponse.data?.data || loginResponse.data;
        this.sessionToken = loginData?.token || loginData?.sid || loginData?.sessionToken;
        this.userProfile = loginData;
        this.isConnected = true;
      } else {
        // Connected at Gateway level; ready for direct session usage
        this.isConnected = true;
      }

      this._log('Successfully connected to Kotak Neo');
      return this.isConnected;
    } catch (error) {
      this.isConnected = false;
      this.gatewayToken = null;
      const errorMsg = error.response?.data?.message || error.response?.data?.error_description || error.message || 'Kotak Neo connection failed';
      this._error('Connection failed: ' + errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * Disconnect session
   */
  async disconnect() {
    try {
      if (this.isConnected && this.gatewayToken) {
        this._log('Disconnecting from Kotak Neo...');
      }
    } finally {
      this.gatewayToken = null;
      this.sessionToken = null;
      this.userProfile = null;
      this.isConnected = false;
      this._log('Successfully disconnected from Kotak Neo');
    }
  }

  /**
   * Make authenticated request to Kotak Neo API
   */
  async _authenticatedRequest(method, endpoint, data = null) {
    if (!this.isConnected || !this.gatewayToken) {
      throw new Error('Not connected to Kotak Neo. Please authenticate first.');
    }

    try {
      const headers = {
        'Authorization': `Bearer ${this.gatewayToken}`,
        'neo-fin-key': 'neotradeapi',
      };

      if (this.sessionToken) {
        headers['Auth'] = this.sessionToken;
        headers['Sid'] = this.sessionToken;
      }

      const config = {
        method,
        url: endpoint,
        headers,
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

      if (resData && (resData.stat === 'Not_Ok' || resData.status === 'error' || resData.error)) {
        throw new Error(resData.message || resData.error || `Kotak Neo API request failed on ${endpoint}`);
      }

      return resData;
    } catch (error) {
      const errorMsg = error.response?.data?.message || error.response?.data?.error || error.message;
      this._error(`Kotak Neo API error on ${endpoint}: ${errorMsg}`);
      throw new Error(errorMsg);
    }
  }

  // ============================================================
  // READ-ONLY DATA FETCHING METHODS
  // ============================================================

  /**
   * Get user profile details
   * GET /user/profile/1.0/profile
   */
  async getProfile() {
    try {
      this._log('Fetching profile from Kotak Neo...');
      const data = await this._authenticatedRequest('GET', '/user/profile/1.0/profile');
      return this._normalizeProfile(data);
    } catch (error) {
      this._error('Failed to fetch Kotak Neo profile: ' + error.message);
      throw error;
    }
  }

  /**
   * Get funds and margin limits
   * GET /user/limits/1.0/limits
   */
  async getFunds() {
    try {
      this._log('Fetching funds from Kotak Neo...');
      const data = await this._authenticatedRequest('GET', '/user/limits/1.0/limits');
      return this._normalizeFunds(data);
    } catch (error) {
      this._error('Failed to fetch Kotak Neo funds: ' + error.message);
      throw error;
    }
  }

  /**
   * Get open positions
   * GET /portfolio/positions/1.0/positions
   */
  async getPositions() {
    try {
      this._log('Fetching positions from Kotak Neo...');
      const data = await this._authenticatedRequest('GET', '/portfolio/positions/1.0/positions');

      const list = Array.isArray(data) ? data : (data?.data || data?.positions || []);
      return list.map(pos => this._normalizePosition(pos));
    } catch (error) {
      this._error('Failed to fetch Kotak Neo positions: ' + error.message);
      throw error;
    }
  }

  /**
   * Get order book (for reconciliation)
   * GET /orders/1.0/order/book
   */
  async getOrders() {
    try {
      this._log('Fetching order book from Kotak Neo...');
      const data = await this._authenticatedRequest('GET', '/orders/1.0/order/book');

      const list = Array.isArray(data) ? data : (data?.data || data?.orders || []);
      return list.map(order => this._normalizeOrder(order));
    } catch (error) {
      this._error('Failed to fetch Kotak Neo orders: ' + error.message);
      throw error;
    }
  }

  /**
   * Get holdings
   * GET /portfolio/holdings/1.0/holdings
   */
  async getHoldings() {
    try {
      this._log('Fetching holdings from Kotak Neo...');
      const data = await this._authenticatedRequest('GET', '/portfolio/holdings/1.0/holdings');

      const list = Array.isArray(data) ? data : (data?.data || data?.holdings || []);
      return list.map(holding => this._normalizeHolding(holding));
    } catch (error) {
      this._error('Failed to fetch Kotak Neo holdings: ' + error.message);
      throw error;
    }
  }

  /**
   * Get executed trade fills
   * GET /orders/1.0/trade/book
   */
  async getTradeHistory() {
    try {
      this._log('Fetching trade history from Kotak Neo...');
      const data = await this._authenticatedRequest('GET', '/orders/1.0/trade/book');

      const list = Array.isArray(data) ? data : (data?.data || data?.trades || []);
      return list.map(trade => this._normalizeTrade(trade));
    } catch (error) {
      this._error('Failed to fetch Kotak Neo trade history: ' + error.message);
      throw error;
    }
  }

  /**
   * Get market quotes
   * GET /market/quotes/1.0/quotes
   */
  async getQuotes(symbols) {
    try {
      this._log('Fetching quotes from Kotak Neo...', { count: symbols.length });
      const data = await this._authenticatedRequest('GET', '/market/quotes/1.0/quotes', {
        instruments: symbols.join(','),
      });

      const list = Array.isArray(data) ? data : (data?.data || []);
      return list.map(q => this._normalizeQuote(q));
    } catch (error) {
      this._error('Failed to fetch Kotak Neo quotes: ' + error.message);
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
   * Normalize Kotak Neo profile to Account model
   */
  _normalizeProfile(data = {}) {
    const profile = data.data || data;

    return new Account({
      brokerId: 'kotakneo',
      brokerName: 'Kotak Neo',
      userId: profile.clientCode || profile.userId || profile.clientId || this.mobileNumber || '',
      clientId: profile.clientCode || profile.userId || profile.clientId || '',
      name: profile.clientName || profile.userName || '',
      email: profile.emailId || profile.email || '',
      mobile: profile.mobileNumber || profile.mobile || '',
      pan: this._maskPAN(profile.pan),
      exchanges: profile.exchanges || ['NSE', 'BSE', 'MCX', 'NFO', 'BFO'],
      segments: ['EQUITY', 'DERIVATIVE', 'COMMODITY', 'CURRENCY'],
      products: ['CNC', 'MIS', 'NRML', 'CO', 'BO'],
      accountStatus: 'ACTIVE',
      metadata: {
        branch: profile.branch,
        userType: profile.userType,
      },
    });
  }

  /**
   * Normalize Kotak Neo limits to Funds model
   */
  _normalizeFunds(data = {}) {
    const limits = data.data || data;

    const available = parseFloat(limits.availableMargin) || parseFloat(limits.net) || parseFloat(limits.cash) || 0;
    const used = parseFloat(limits.usedMargin) || parseFloat(limits.marginUsed) || 0;
    const realizedPnl = parseFloat(limits.realizedPnL) || parseFloat(limits.realisedProfit) || parseFloat(limits.rpnl) || 0;
    const unrealizedPnl = parseFloat(limits.unrealizedPnL) || parseFloat(limits.unrealisedProfit) || parseFloat(limits.urmtom) || 0;
    const collateral = parseFloat(limits.collateral) || parseFloat(limits.collateralMargin) || 0;

    return new Funds({
      segment: 'EQUITY',
      availableMargin: available,
      usedMargin: used,
      totalMargin: available + used,
      openingBalance: parseFloat(limits.openingBalance) || available,
      netBalance: available,
      realizedPnl: realizedPnl,
      unrealizedPnl: unrealizedPnl,
      marginUsed: used,
      collateral: collateral,
      exposureMargin: parseFloat(limits.exposureMargin) || 0,
      spanMargin: parseFloat(limits.spanMargin) || 0,
      deliveryMargin: 0,
      metadata: {
        payin: parseFloat(limits.payin) || 0,
        payout: parseFloat(limits.payout) || 0,
      },
    });
  }

  /**
   * Normalize Kotak Neo position to Position model
   */
  _normalizePosition(data = {}) {
    const netQty = parseInt(data.netQty) || parseInt(data.flQty) || parseInt(data.quantity) || 0;
    const buyQty = parseInt(data.buyQty) || parseInt(data.bQty) || 0;
    const sellQty = parseInt(data.sellQty) || parseInt(data.sQty) || 0;
    const buyAvg = parseFloat(data.buyAvg) || parseFloat(data.buyPrice) || 0;
    const sellAvg = parseFloat(data.sellAvg) || parseFloat(data.sellPrice) || 0;
    const ltp = parseFloat(data.ltp) || parseFloat(data.lastPrice) || 0;
    const realizedPnl = parseFloat(data.rpnl) || parseFloat(data.realizedPnL) || 0;
    const unrealizedPnl = parseFloat(data.urmtom) || parseFloat(data.unrealizedPnL) || 0;
    const totalPnl = parseFloat(data.totPnl) || parseFloat(data.pnl) || (realizedPnl + unrealizedPnl);

    return new Position({
      symbol: data.tradingSymbol || data.trdSym || data.symbol || '',
      tradingSymbol: data.tok || data.token || data.instrumentToken || '',
      exchange: data.exchangeSegment || data.exch || data.exchange || '',
      segment: this._mapProductType(data.product || data.prd),
      product: data.product || data.prd || '',
      instrumentType: data.instType || data.instrumentType || '',
      quantity: netQty,
      buyQuantity: buyQty,
      sellQuantity: sellQty,
      buyPrice: buyAvg,
      sellPrice: sellAvg,
      lastPrice: ltp,
      closePrice: parseFloat(data.closePrice) || 0,
      pnl: totalPnl,
      realizedPnl: realizedPnl,
      unrealizedPnl: unrealizedPnl,
      pnlPercent: buyAvg > 0 ? ((totalPnl / (buyAvg * Math.abs(netQty || 1))) * 100) : 0,
      lotSize: parseInt(data.lotSize) || 1,
      multiplier: parseFloat(data.multiplier) || 1,
      metadata: {
        token: data.tok || data.token,
      },
    });
  }

  /**
   * Normalize Kotak Neo holding to Holding model
   */
  _normalizeHolding(data = {}) {
    const qty = parseInt(data.holdQty) || parseInt(data.quantity) || parseInt(data.totalQty) || 0;
    const avgPrice = parseFloat(data.avgPrice) || parseFloat(data.price) || parseFloat(data.costPrice) || 0;
    const ltp = parseFloat(data.ltp) || parseFloat(data.lastPrice) || 0;
    const pnl = parseFloat(data.pnl) || ((ltp - avgPrice) * qty);

    return new Holding({
      symbol: data.tradingSymbol || data.symbol || data.trdSym || '',
      tradingSymbol: data.token || data.tok || '',
      isin: data.isin || '',
      exchange: data.exchange || data.exch || 'NSE',
      quantity: qty,
      t1Quantity: parseInt(data.t1Qty) || 0,
      authorizedQuantity: parseInt(data.dpQty) || qty,
      collateralQuantity: parseInt(data.colQty) || 0,
      averagePrice: avgPrice,
      lastPrice: ltp,
      closePrice: parseFloat(data.closePrice) || 0,
      pnl: pnl,
      dayPnl: 0,
      pnlPercent: avgPrice > 0 ? ((pnl / (avgPrice * qty)) * 100) : 0,
      investedValue: avgPrice * qty,
      currentValue: ltp * qty,
      metadata: {
        token: data.token,
      },
    });
  }

  /**
   * Normalize Kotak Neo order to Order model
   */
  _normalizeOrder(data = {}) {
    const qty = parseInt(data.qty) || parseInt(data.quantity) || 0;
    const filledQty = parseInt(data.fldQty) || parseInt(data.filledQty) || 0;

    return new Order({
      orderId: data.nOrdNo || data.orderId || data.orderNo || '',
      orderTag: data.tag || data.remarks || '',
      symbol: data.tradingSymbol || data.trdSym || data.symbol || '',
      tradingSymbol: data.tok || data.token || '',
      exchange: data.exchangeSegment || data.exch || '',
      segment: this._mapProductType(data.product || data.prd),
      product: data.product || data.prd || '',
      instrumentType: data.instType || '',
      orderType: data.ordType || data.orderType || 'LIMIT',
      transactionType: (data.trnsTp === 'B' || data.transactionType === 'BUY') ? 'BUY' : 'SELL',
      quantity: qty,
      filledQuantity: filledQty,
      pendingQuantity: qty - filledQty,
      cancelledQuantity: parseInt(data.cnclQty) || 0,
      price: parseFloat(data.prc) || parseFloat(data.price) || 0,
      triggerPrice: parseFloat(data.trgPrc) || 0,
      averagePrice: parseFloat(data.avgPrc) || parseFloat(data.averagePrice) || 0,
      status: this._mapOrderStatus(data.ordSt || data.status),
      statusMessage: data.rejRsn || '',
      validity: data.vldt || 'DAY',
      variety: 'REGULAR',
      orderTimestamp: data.ordDtTm || data.orderTimestamp || '',
      updateTimestamp: data.updDtTm || data.updateTimestamp || '',
      lotSize: parseInt(data.lotSize) || 1,
      metadata: {
        nOrdNo: data.nOrdNo,
      },
    });
  }

  /**
   * Normalize Kotak Neo trade to Trade model
   */
  _normalizeTrade(data = {}) {
    const qty = parseInt(data.trdQty) || parseInt(data.quantity) || 0;
    const price = parseFloat(data.trdPrc) || parseFloat(data.price) || 0;
    const time = data.trdDtTm || data.tradeTime || data.orderTimestamp || '';

    return new Trade({
      tradeId: data.flId || data.fillId || data.nOrdNo || '',
      orderId: data.nOrdNo || data.orderId || '',
      symbol: data.tradingSymbol || data.trdSym || data.symbol || '',
      tradingSymbol: data.tok || data.token || '',
      exchange: data.exchangeSegment || data.exch || '',
      segment: this._mapProductType(data.product || data.prd),
      product: data.product || data.prd || '',
      instrumentType: '',
      transactionType: (data.trnsTp === 'B' || data.transactionType === 'BUY') ? 'BUY' : 'SELL',
      quantity: qty,
      price: price,
      tradeValue: qty * price,
      tradeDate: time.split(' ')[0] || time.split('T')[0] || '',
      tradeTime: time.split(' ')[1] || time.split('T')[1] || '',
      timestamp: time,
      metadata: {
        nOrdNo: data.nOrdNo,
        flId: data.flId,
      },
    });
  }

  /**
   * Normalize Kotak Neo quote to Quote model
   */
  _normalizeQuote(data = {}) {
    const ltp = parseFloat(data.ltp) || parseFloat(data.lastPrice) || 0;
    const close = parseFloat(data.close) || parseFloat(data.closePrice) || 0;
    const change = ltp - close;
    const changePercent = close > 0 ? ((change / close) * 100) : 0;

    return new Quote({
      symbol: data.tradingSymbol || data.symbol || '',
      tradingSymbol: data.token || '',
      exchange: data.exchange || 'NSE',
      ltp: ltp,
      open: parseFloat(data.open) || 0,
      high: parseFloat(data.high) || 0,
      low: parseFloat(data.low) || 0,
      close: close,
      change: change,
      changePercent: changePercent,
      volume: parseInt(data.volume) || 0,
      upperCircuit: parseFloat(data.upperCircuit) || 0,
      lowerCircuit: parseFloat(data.lowerCircuit) || 0,
      lotSize: parseInt(data.lotSize) || 1,
      metadata: {
        token: data.token,
      },
    });
  }

  // ============================================================
  // UTILITY METHODS
  // ============================================================

  _mapProductType(prd) {
    const mapping = {
      'CNC': 'EQUITY',
      'MIS': 'EQUITY',
      'NRML': 'DERIVATIVE',
      'CO': 'EQUITY',
      'BO': 'EQUITY',
    };
    return mapping[prd] || 'EQUITY';
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
    const sensitive = ['key', 'token', 'secret', 'password', 'consumersecret', 'sessiontoken'];
    Object.keys(sanitized).forEach(k => {
      if (sensitive.some(s => k.toLowerCase().includes(s))) {
        sanitized[k] = '***REDACTED***';
      }
    });
    return sanitized;
  }
}
