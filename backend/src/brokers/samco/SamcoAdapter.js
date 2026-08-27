/**
 * SAMCO (StockNote API) Broker Adapter
 * Read-only implementation for authentication, profile, funds, positions, holdings, orders, and executed trades.
 * 
 * Official Docs: https://developers.stocknote.com/
 * Base URL: https://api.stocknote.com
 */

import axios from 'axios';
import { BaseBrokerAdapter } from '../BaseBrokerAdapter.js';
import { Account, Position, Order, Funds, Holding, Quote, Trade } from '../../models/index.js';

export class SamcoAdapter extends BaseBrokerAdapter {
  constructor(config = {}) {
    super({
      brokerId: 'samco',
      brokerName: 'SAMCO',
      ...config,
    });

    // Credentials
    this.userId = config.userId || process.env.SAMCO_USER_ID;
    this.password = config.password || process.env.SAMCO_PASSWORD;
    this.yob = config.yob || config.yotp || process.env.SAMCO_YOB;

    // API configuration
    this.baseUrl = 'https://api.stocknote.com';
    this.sessionToken = null;
    this.userDetails = null;

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
    if (!this.userId) errors.push('SAMCO_USER_ID is required');
    if (!this.password) errors.push('SAMCO_PASSWORD is required');
    if (!this.yob) errors.push('SAMCO_YOB (Year of Birth) is required');

    if (errors.length > 0) {
      throw new Error(`SAMCO configuration error: ${errors.join(', ')}`);
    }
  }

  /**
   * Authenticate with SAMCO StockNote API
   */
  async connect(credentials = {}) {
    try {
      this._log('Connecting to SAMCO StockNote API...');

      if (credentials.userId) this.userId = credentials.userId;
      if (credentials.password) this.password = credentials.password;
      if (credentials.yob || credentials.yotp) this.yob = credentials.yob || credentials.yotp;

      this._validateConfig();

      const response = await this.httpClient.post('/login', {
        userId: this.userId,
        password: this.password,
        yob: this.yob,
      });

      const data = response.data;
      if (!data || (data.status && data.status.toLowerCase() === 'failure') || !data.sessionToken) {
        throw new Error(data?.statusMessage || data?.message || 'SAMCO authentication failed');
      }

      this.sessionToken = data.sessionToken;
      this.userDetails = data;
      this.isConnected = true;

      this._log('Successfully connected to SAMCO');
      return this.isConnected;
    } catch (error) {
      this.isConnected = false;
      this.sessionToken = null;
      const errorMsg = error.response?.data?.statusMessage || error.response?.data?.message || error.message || 'SAMCO connection failed';
      this._error('Connection failed: ' + errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * Disconnect session
   */
  async disconnect() {
    try {
      if (this.isConnected && this.sessionToken) {
        this._log('Logging out from SAMCO...');
        await this._authenticatedRequest('POST', '/logout').catch(() => {});
      }
    } finally {
      this.sessionToken = null;
      this.userDetails = null;
      this.isConnected = false;
      this._log('Successfully disconnected from SAMCO');
    }
  }

  /**
   * Make authenticated request to SAMCO API
   */
  async _authenticatedRequest(method, endpoint, data = null) {
    if (!this.isConnected || !this.sessionToken) {
      throw new Error('Not connected to SAMCO. Please authenticate first.');
    }

    try {
      const config = {
        method,
        url: endpoint,
        headers: {
          'x-session-token': this.sessionToken,
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

      if (resData && resData.status && resData.status.toLowerCase() === 'failure') {
        throw new Error(resData.statusMessage || `SAMCO API request failed on ${endpoint}`);
      }

      return resData;
    } catch (error) {
      const errorMsg = error.response?.data?.statusMessage || error.response?.data?.message || error.message;
      this._error(`SAMCO API error on ${endpoint}: ${errorMsg}`);
      throw new Error(errorMsg);
    }
  }

  // ============================================================
  // READ-ONLY DATA FETCHING METHODS
  // ============================================================

  /**
   * Get user profile details
   * GET /profile/userDetails
   */
  async getProfile() {
    try {
      this._log('Fetching profile from SAMCO...');
      const data = await this._authenticatedRequest('GET', '/profile/userDetails');
      return this._normalizeProfile(data);
    } catch (error) {
      this._error('Failed to fetch SAMCO profile: ' + error.message);
      throw error;
    }
  }

  /**
   * Get funds & margin limits
   * GET /limit/getLimits
   */
  async getFunds() {
    try {
      this._log('Fetching funds from SAMCO...');
      const data = await this._authenticatedRequest('GET', '/limit/getLimits');
      return this._normalizeFunds(data);
    } catch (error) {
      this._error('Failed to fetch SAMCO funds: ' + error.message);
      throw error;
    }
  }

  /**
   * Get open positions
   * GET /position/getPositions?positionType=NET
   */
  async getPositions() {
    try {
      this._log('Fetching positions from SAMCO...');
      const data = await this._authenticatedRequest('GET', '/position/getPositions', {
        positionType: 'NET',
      });

      const list = data?.positionDetails || (Array.isArray(data) ? data : []);
      return list.map(pos => this._normalizePosition(pos));
    } catch (error) {
      this._error('Failed to fetch SAMCO positions: ' + error.message);
      throw error;
    }
  }

  /**
   * Get order book (for reconciliation)
   * GET /order/orderBook
   */
  async getOrders() {
    try {
      this._log('Fetching order book from SAMCO...');
      const data = await this._authenticatedRequest('GET', '/order/orderBook');

      const list = data?.orderBookDetails || (Array.isArray(data) ? data : []);
      return list.map(order => this._normalizeOrder(order));
    } catch (error) {
      this._error('Failed to fetch SAMCO orders: ' + error.message);
      throw error;
    }
  }

  /**
   * Get holdings
   * GET /holding/getHoldings
   */
  async getHoldings() {
    try {
      this._log('Fetching holdings from SAMCO...');
      const data = await this._authenticatedRequest('GET', '/holding/getHoldings');

      const list = data?.holdingDetails || (Array.isArray(data) ? data : []);
      return list.map(holding => this._normalizeHolding(holding));
    } catch (error) {
      this._error('Failed to fetch SAMCO holdings: ' + error.message);
      throw error;
    }
  }

  /**
   * Get executed trade history
   * GET /trade/tradeBook
   */
  async getTradeHistory() {
    try {
      this._log('Fetching trade history from SAMCO...');
      const data = await this._authenticatedRequest('GET', '/trade/tradeBook');

      const list = data?.tradeBookDetails || (Array.isArray(data) ? data : []);
      return list.map(trade => this._normalizeTrade(trade));
    } catch (error) {
      this._error('Failed to fetch SAMCO trade history: ' + error.message);
      throw error;
    }
  }

  /**
   * Get market quotes
   * GET /quote/getQuote
   */
  async getQuotes(symbols) {
    try {
      this._log('Fetching quotes from SAMCO...', { count: symbols.length });
      const quotes = [];

      for (const sym of symbols) {
        try {
          const parts = sym.split(':');
          const exchange = parts.length > 1 ? parts[0] : 'NSE';
          const symbolName = parts.length > 1 ? parts[1] : sym;

          const data = await this._authenticatedRequest('GET', '/quote/getQuote', {
            symbolName,
            exchange,
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
      this._error('Failed to fetch SAMCO quotes: ' + error.message);
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
   * Normalize SAMCO profile to Account model
   */
  _normalizeProfile(data = {}) {
    const profile = data.accountDetails || data.data || data;

    return new Account({
      brokerId: 'samco',
      brokerName: 'SAMCO',
      userId: profile.accountCode || profile.userId || this.userId,
      clientId: profile.accountCode || profile.userId || this.userId,
      name: profile.accountName || profile.userName || '',
      email: profile.email || '',
      mobile: profile.mobileNumber || profile.mobile || '',
      pan: this._maskPAN(profile.pan),
      exchanges: profile.exchanges || ['NSE', 'BSE', 'MCX', 'NFO', 'CDS'],
      segments: ['EQUITY', 'DERIVATIVE', 'COMMODITY', 'CURRENCY'],
      products: ['CNC', 'MIS', 'NRML', 'CO', 'BO'],
      accountStatus: 'ACTIVE',
      metadata: {
        branchCode: profile.branchCode,
        accountStatus: profile.accountStatus,
      },
    });
  }

  /**
   * Normalize SAMCO limits to Funds model
   */
  _normalizeFunds(data = {}) {
    const limits = data.equityLimitDetails || data.commodityLimitDetails || data;

    const available = parseFloat(limits.netAvailableMargin) || parseFloat(limits.cashBalance) || 0;
    const used = parseFloat(limits.marginUsed) || parseFloat(limits.grossMarginUsed) || 0;
    const realizedPnl = parseFloat(limits.realizedPnL) || parseFloat(limits.realizedGainAndLoss) || 0;
    const unrealizedPnl = parseFloat(limits.unrealizedPnL) || parseFloat(limits.unrealizedGainAndLoss) || 0;
    const collateral = parseFloat(limits.collateralMargin) || 0;

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
        payIn: parseFloat(limits.payIn) || 0,
        payOut: parseFloat(limits.payOut) || 0,
      },
    });
  }

  /**
   * Normalize SAMCO position to Position model
   */
  _normalizePosition(data = {}) {
    const netQty = parseInt(data.netQuantity) || parseInt(data.quantity) || 0;
    const buyQty = parseInt(data.buyQuantity) || 0;
    const sellQty = parseInt(data.sellQuantity) || 0;
    const buyAvg = parseFloat(data.averageBuyPrice) || parseFloat(data.averagePrice) || 0;
    const sellAvg = parseFloat(data.averageSellPrice) || 0;
    const ltp = parseFloat(data.lastTradedPrice) || parseFloat(data.ltp) || 0;
    const realizedPnl = parseFloat(data.realizedGainAndLoss) || parseFloat(data.realizedPnL) || 0;
    const unrealizedPnl = parseFloat(data.unrealizedGainAndLoss) || parseFloat(data.unrealizedPnL) || 0;
    const totalPnl = parseFloat(data.totalGainAndLoss) || (realizedPnl + unrealizedPnl);

    return new Position({
      symbol: data.tradingSymbol || data.symbolName || '',
      tradingSymbol: data.symbolToken || data.token || '',
      exchange: data.exchange || '',
      segment: this._mapProductType(data.productCode || data.product),
      product: data.productCode || data.product || '',
      instrumentType: data.instrumentType || '',
      quantity: netQty,
      buyQuantity: buyQty,
      sellQuantity: sellQty,
      buyPrice: buyAvg,
      sellPrice: sellAvg,
      lastPrice: ltp,
      closePrice: parseFloat(data.previousClosePrice) || 0,
      pnl: totalPnl,
      realizedPnl: realizedPnl,
      unrealizedPnl: unrealizedPnl,
      pnlPercent: buyAvg > 0 ? ((totalPnl / (buyAvg * Math.abs(netQty || 1))) * 100) : 0,
      lotSize: parseInt(data.lotSize) || 1,
      multiplier: parseFloat(data.multiplier) || 1,
      metadata: {
        symbolToken: data.symbolToken,
      },
    });
  }

  /**
   * Normalize SAMCO holding to Holding model
   */
  _normalizeHolding(data = {}) {
    const qty = parseInt(data.holdingQuantity) || parseInt(data.totalQuantity) || 0;
    const avgPrice = parseFloat(data.averagePrice) || parseFloat(data.costPrice) || 0;
    const ltp = parseFloat(data.lastTradedPrice) || parseFloat(data.ltp) || 0;
    const pnl = parseFloat(data.totalGainAndLoss) || ((ltp - avgPrice) * qty);

    return new Holding({
      symbol: data.tradingSymbol || data.symbolName || '',
      tradingSymbol: data.symbolToken || data.token || '',
      isin: data.isin || '',
      exchange: data.exchange || 'NSE',
      quantity: qty,
      t1Quantity: parseInt(data.t1Quantity) || 0,
      authorizedQuantity: parseInt(data.holdingsWithDP) || qty,
      collateralQuantity: parseInt(data.collateralQuantity) || 0,
      averagePrice: avgPrice,
      lastPrice: ltp,
      closePrice: parseFloat(data.previousClosePrice) || 0,
      pnl: pnl,
      dayPnl: 0,
      pnlPercent: avgPrice > 0 ? ((pnl / (avgPrice * qty)) * 100) : 0,
      investedValue: avgPrice * qty,
      currentValue: ltp * qty,
      metadata: {
        symbolToken: data.symbolToken,
      },
    });
  }

  /**
   * Normalize SAMCO order to Order model
   */
  _normalizeOrder(data = {}) {
    const qty = parseInt(data.orderQuantity) || parseInt(data.quantity) || 0;
    const filledQty = parseInt(data.filledQuantity) || 0;

    return new Order({
      orderId: data.orderNumber || data.orderNo || '',
      orderTag: data.remarks || '',
      symbol: data.tradingSymbol || data.symbolName || '',
      tradingSymbol: data.symbolToken || '',
      exchange: data.exchange || '',
      segment: this._mapProductType(data.productCode || data.product),
      product: data.productCode || data.product || '',
      instrumentType: data.instrumentType || '',
      orderType: data.orderType || 'LIMIT',
      transactionType: (data.transactionType === 'BUY' || data.transactionType === 'B') ? 'BUY' : 'SELL',
      quantity: qty,
      filledQuantity: filledQty,
      pendingQuantity: qty - filledQty,
      cancelledQuantity: parseInt(data.cancelledQuantity) || 0,
      price: parseFloat(data.orderPrice) || parseFloat(data.price) || 0,
      triggerPrice: parseFloat(data.triggerPrice) || 0,
      averagePrice: parseFloat(data.averagePrice) || 0,
      status: this._mapOrderStatus(data.orderStatus || data.status),
      statusMessage: data.rejectionReason || '',
      validity: data.orderValidity || 'DAY',
      variety: 'REGULAR',
      orderTimestamp: data.orderTime || data.orderDateTime || '',
      updateTimestamp: data.orderTime || '',
      lotSize: parseInt(data.lotSize) || 1,
      metadata: {
        orderNumber: data.orderNumber,
      },
    });
  }

  /**
   * Normalize SAMCO trade to Trade model
   */
  _normalizeTrade(data = {}) {
    const qty = parseInt(data.tradedQuantity) || parseInt(data.quantity) || 0;
    const price = parseFloat(data.tradedPrice) || parseFloat(data.price) || 0;
    const time = data.tradeTime || data.tradeDateTime || '';

    return new Trade({
      tradeId: data.tradeNumber || data.fillNumber || data.orderNumber || '',
      orderId: data.orderNumber || '',
      symbol: data.tradingSymbol || data.symbolName || '',
      tradingSymbol: data.symbolToken || '',
      exchange: data.exchange || '',
      segment: this._mapProductType(data.productCode || data.product),
      product: data.productCode || data.product || '',
      instrumentType: '',
      transactionType: (data.transactionType === 'BUY' || data.transactionType === 'B') ? 'BUY' : 'SELL',
      quantity: qty,
      price: price,
      tradeValue: qty * price,
      tradeDate: time.split(' ')[0] || time.split('T')[0] || '',
      tradeTime: time.split(' ')[1] || time.split('T')[1] || '',
      timestamp: time,
      metadata: {
        orderNumber: data.orderNumber,
        tradeNumber: data.tradeNumber,
      },
    });
  }

  /**
   * Normalize SAMCO quote to Quote model
   */
  _normalizeQuote(data = {}) {
    const ltp = parseFloat(data.lastTradedPrice) || parseFloat(data.ltp) || 0;
    const close = parseFloat(data.previousClosePrice) || parseFloat(data.close) || 0;
    const change = ltp - close;
    const changePercent = close > 0 ? ((change / close) * 100) : 0;

    return new Quote({
      symbol: data.tradingSymbol || data.symbolName || '',
      tradingSymbol: data.symbolToken || '',
      exchange: data.exchange || 'NSE',
      ltp: ltp,
      open: parseFloat(data.openPrice) || 0,
      high: parseFloat(data.highPrice) || 0,
      low: parseFloat(data.lowPrice) || 0,
      close: close,
      change: change,
      changePercent: changePercent,
      volume: parseInt(data.totalTradedVolume) || 0,
      upperCircuit: parseFloat(data.upperCircuitLimit) || 0,
      lowerCircuit: parseFloat(data.lowerCircuitLimit) || 0,
      lotSize: parseInt(data.lotSize) || 1,
      metadata: {
        symbolToken: data.symbolToken,
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
    if (s === 'EXECUTED' || s === 'COMPLETED' || s === 'TRADED' || s === 'COMPLETE') return 'COMPLETE';
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
    const sensitive = ['token', 'password', 'sessiontoken', 'yob', 'yotp'];
    Object.keys(sanitized).forEach(k => {
      if (sensitive.some(s => k.toLowerCase().includes(s))) {
        sanitized[k] = '***REDACTED***';
      }
    });
    return sanitized;
  }
}
