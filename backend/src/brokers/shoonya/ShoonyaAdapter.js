/**
 * Shoonya (Finvasia Noren API) Broker Adapter
 * Read-only implementation for authentication, profile, funds, positions, holdings, orders, and executed trades.
 * 
 * Official Docs: https://shoonya.finvasia.com/
 * Base URL: https://api.shoonya.com/NorenWSTP
 */

import axios from 'axios';
import crypto from 'crypto';
import * as OTPAuth from 'otpauth';
import { BaseBrokerAdapter } from '../BaseBrokerAdapter.js';
import { Account, Position, Order, Funds, Holding, Quote, Trade } from '../../models/index.js';

export class ShoonyaAdapter extends BaseBrokerAdapter {
  constructor(config = {}) {
    super({
      brokerId: 'shoonya',
      brokerName: 'Shoonya',
      ...config,
    });

    // Load credentials from environment or config
    this.userId = config.userId || process.env.SHOONYA_USER_ID;
    this.password = config.password || process.env.SHOONYA_PASSWORD;
    this.apiKey = config.apiKey || process.env.SHOONYA_API_KEY;
    this.vendorCode = config.vendorCode || process.env.SHOONYA_VENDOR_CODE;
    this.imei = config.imei || process.env.SHOONYA_IMEI || 'riskloop_client_1';
    this.totpSecret = config.totpSecret || process.env.SHOONYA_TOTP_SECRET;

    // Shoonya Noren API Base URL
    this.baseUrl = 'https://api.shoonya.com/NorenWSTP';

    // Session state
    this.userToken = null;
    this.actId = null;
    this.accountDetails = null;

    // HTTP client
    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: parseInt(process.env.API_TIMEOUT) || 30000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
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
    if (!this.userId) errors.push('SHOONYA_USER_ID is required');
    if (!this.password) errors.push('SHOONYA_PASSWORD is required');
    if (!this.apiKey) errors.push('SHOONYA_API_KEY is required');
    if (!this.vendorCode) errors.push('SHOONYA_VENDOR_CODE is required');

    if (errors.length > 0) {
      throw new Error(`Shoonya configuration error: ${errors.join(', ')}`);
    }
  }

  /**
   * Generate SHA-256 hash
   */
  _sha256(text) {
    return crypto.createHash('sha256').update(text).digest('hex');
  }

  /**
   * Generate 2FA TOTP code from secret
   */
  _generateTOTP() {
    if (!this.totpSecret) return '';
    try {
      const totp = new OTPAuth.TOTP({
        secret: OTPAuth.Secret.fromBase32(this.totpSecret),
        digits: 6,
        period: 30,
      });
      return totp.generate();
    } catch (err) {
      this._error('TOTP generation failed: ' + err.message);
      return '';
    }
  }

  /**
   * Authenticate and establish session with Shoonya (QuickAuth)
   */
  async connect(credentials = {}) {
    try {
      this._log('Connecting to Shoonya Noren API...');

      if (credentials.userId) this.userId = credentials.userId;
      if (credentials.password) this.password = credentials.password;
      if (credentials.apiKey) this.apiKey = credentials.apiKey;
      if (credentials.vendorCode) this.vendorCode = credentials.vendorCode;
      if (credentials.imei) this.imei = credentials.imei;
      if (credentials.totpSecret) this.totpSecret = credentials.totpSecret;

      this._validateConfig();

      const pwdHash = this._sha256(this.password);
      const appKeyHash = this._sha256(`${this.userId}|${this.apiKey}`);
      const factor2 = credentials.factor2 || credentials.totp || this._generateTOTP();

      const authPayload = {
        apkversion: 'js:1.0.0',
        uid: this.userId,
        pwd: pwdHash,
        factor2: factor2,
        vc: this.vendorCode,
        appkey: appKeyHash,
        imei: this.imei,
        source: 'API',
      };

      const body = `jData=${encodeURIComponent(JSON.stringify(authPayload))}`;
      const response = await this.httpClient.post('/QuickAuth', body);

      const data = response.data;
      if (!data || data.stat !== 'Ok' || !data.susertoken) {
        const errorMsg = data?.emsg || 'Authentication failed';
        throw new Error(errorMsg);
      }

      this.userToken = data.susertoken;
      this.actId = data.actid || this.userId;
      this.accountDetails = data;
      this.isConnected = true;

      this._log('Successfully authenticated with Shoonya', { actId: this.actId });
      return this.isConnected;
    } catch (error) {
      this.isConnected = false;
      this.userToken = null;
      const errorMsg = error.response?.data?.emsg || error.message || 'Unable to connect to Shoonya';
      this._error('Shoonya connection failed: ' + errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * Disconnect and clear session
   */
  async disconnect() {
    try {
      if (this.isConnected && this.userToken) {
        this._log('Logging out from Shoonya...');
        const body = `jData=${encodeURIComponent(JSON.stringify({ uid: this.userId }))}&jKey=${this.userToken}`;
        await this.httpClient.post('/Logout', body).catch(() => {});
      }
    } finally {
      this.userToken = null;
      this.actId = null;
      this.isConnected = false;
      this._log('Successfully disconnected from Shoonya');
    }
  }

  /**
   * Make authenticated request to Shoonya Noren API
   */
  async _authenticatedRequest(endpoint, payload = {}) {
    if (!this.isConnected || !this.userToken) {
      throw new Error('Not connected to Shoonya. Please authenticate first.');
    }

    try {
      const fullPayload = {
        uid: this.userId,
        actid: this.actId || this.userId,
        ...payload,
      };

      const body = `jData=${encodeURIComponent(JSON.stringify(fullPayload))}&jKey=${this.userToken}`;
      const response = await this.httpClient.post(`/${endpoint}`, body);

      const data = response.data;
      if (data && data.stat === 'Not_Ok') {
        throw new Error(data.emsg || `Shoonya API request failed for ${endpoint}`);
      }

      return data;
    } catch (error) {
      const errorMsg = error.response?.data?.emsg || error.message;
      this._error(`Shoonya API error on ${endpoint}: ${errorMsg}`);
      throw new Error(errorMsg);
    }
  }

  // ============================================================
  // READ-ONLY DATA FETCHING METHODS
  // ============================================================

  /**
   * Get user profile details
   * POST /UserDetails
   */
  async getProfile() {
    try {
      this._log('Fetching profile from Shoonya...');
      const data = await this._authenticatedRequest('UserDetails');
      return this._normalizeProfile(data);
    } catch (error) {
      this._error('Failed to fetch Shoonya profile: ' + error.message);
      throw error;
    }
  }

  /**
   * Get funds & margin limits
   * POST /Limits
   */
  async getFunds() {
    try {
      this._log('Fetching funds and margin from Shoonya...');
      const data = await this._authenticatedRequest('Limits', {
        actid: this.actId,
      });
      return this._normalizeFunds(data);
    } catch (error) {
      this._error('Failed to fetch Shoonya funds: ' + error.message);
      throw error;
    }
  }

  /**
   * Get open positions
   * POST /PositionBook
   */
  async getPositions() {
    try {
      this._log('Fetching positions from Shoonya...');
      const data = await this._authenticatedRequest('PositionBook', {
        actid: this.actId,
      });

      if (!data || !Array.isArray(data)) {
        return [];
      }

      return data.map(pos => this._normalizePosition(pos));
    } catch (error) {
      this._error('Failed to fetch Shoonya positions: ' + error.message);
      throw error;
    }
  }

  /**
   * Get order book (for reconciliation)
   * POST /OrderBook
   */
  async getOrders() {
    try {
      this._log('Fetching order book from Shoonya...');
      const data = await this._authenticatedRequest('OrderBook', {
        actid: this.actId,
      });

      if (!data || !Array.isArray(data)) {
        return [];
      }

      return data.map(order => this._normalizeOrder(order));
    } catch (error) {
      this._error('Failed to fetch Shoonya orders: ' + error.message);
      throw error;
    }
  }

  /**
   * Get holdings
   * POST /Holdings
   */
  async getHoldings() {
    try {
      this._log('Fetching holdings from Shoonya...');
      const data = await this._authenticatedRequest('Holdings', {
        actid: this.actId,
      });

      if (!data || !Array.isArray(data)) {
        return [];
      }

      return data.map(holding => this._normalizeHolding(holding));
    } catch (error) {
      this._error('Failed to fetch Shoonya holdings: ' + error.message);
      throw error;
    }
  }

  /**
   * Get executed trade fills
   * POST /TradeBook
   */
  async getTradeHistory() {
    try {
      this._log('Fetching trade history from Shoonya...');
      const data = await this._authenticatedRequest('TradeBook', {
        actid: this.actId,
      });

      if (!data || !Array.isArray(data)) {
        return [];
      }

      return data.map(trade => this._normalizeTrade(trade));
    } catch (error) {
      this._error('Failed to fetch Shoonya trade history: ' + error.message);
      throw error;
    }
  }

  /**
   * Get market quote
   * POST /GetQuotes
   */
  async getQuotes(symbols) {
    try {
      this._log('Fetching quotes from Shoonya...', { count: symbols.length });
      const quotes = [];

      for (const symbol of symbols) {
        try {
          const parts = symbol.split(':');
          const exch = parts.length > 1 ? parts[0] : 'NSE';
          const token = parts.length > 1 ? parts[1] : symbol;

          const data = await this._authenticatedRequest('GetQuotes', {
            exch,
            token,
          });

          if (data && data.stat === 'Ok') {
            quotes.push(this._normalizeQuote(data));
          }
        } catch (err) {
          // ignore single quote failure
        }
      }

      return quotes;
    } catch (error) {
      this._error('Failed to fetch Shoonya quotes: ' + error.message);
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
  // Transform Shoonya Noren responses to RiskLoop models
  // ============================================================

  /**
   * Normalize Shoonya UserDetails to Account model
   */
  _normalizeProfile(data = {}) {
    return new Account({
      brokerId: 'shoonya',
      brokerName: 'Shoonya',
      userId: data.actid || this.userId,
      clientId: data.actid || this.userId,
      name: data.uname || data.actid || '',
      email: data.email || '',
      mobile: data.m_num || '',
      pan: this._maskPAN(data.pan),
      exchanges: (data.exarr || ['NSE', 'BSE', 'MCX']),
      segments: (data.exarr || ['EQUITY', 'DERIVATIVE', 'COMMODITY']),
      products: ['CNC', 'MIS', 'NRML'],
      accountStatus: 'ACTIVE',
      metadata: {
        brkname: data.brkname || 'FINVASIA',
        branch: data.branch,
      },
    });
  }

  /**
   * Normalize Shoonya Limits to Funds model
   */
  _normalizeFunds(data = {}) {
    const cash = parseFloat(data.cash) || 0;
    const payin = parseFloat(data.payin) || 0;
    const marginused = parseFloat(data.marginused) || 0;
    const realizedPnl = parseFloat(data.rpnl) || 0;
    const unrealizedPnl = parseFloat(data.urmtom) || 0;
    const availableMargin = parseFloat(data.cabor) || (cash + payin - marginused) || 0;
    const totalMargin = availableMargin + marginused;

    return new Funds({
      segment: 'EQUITY',
      availableMargin: availableMargin,
      usedMargin: marginused,
      totalMargin: totalMargin,
      openingBalance: cash,
      netBalance: availableMargin,
      realizedPnl: realizedPnl,
      unrealizedPnl: unrealizedPnl,
      marginUsed: marginused,
      collateral: parseFloat(data.collateral) || 0,
      exposureMargin: 0,
      spanMargin: parseFloat(data.span) || 0,
      deliveryMargin: 0,
      metadata: {
        premium: data.premium,
        cnc_used: data.cnc_used,
      },
    });
  }

  /**
   * Normalize Shoonya Position to Position model
   */
  _normalizePosition(data = {}) {
    const netQty = parseInt(data.netqty) || 0;
    const buyQty = parseInt(data.daybuyqty) || parseInt(data.totbuyqty) || 0;
    const sellQty = parseInt(data.daysellqty) || parseInt(data.totsellqty) || 0;
    const buyAvg = parseFloat(data.daybuyavgprc) || parseFloat(data.totbuyavgprc) || 0;
    const sellAvg = parseFloat(data.daysellavgprc) || parseFloat(data.totsellavgprc) || 0;
    const ltp = parseFloat(data.lp) || 0;
    const realizedPnl = parseFloat(data.rpnl) || 0;
    const unrealizedPnl = parseFloat(data.urmtom) || 0;
    const totalPnl = parseFloat(data.totpnl) || (realizedPnl + unrealizedPnl);

    return new Position({
      symbol: data.tsym || '',
      tradingSymbol: data.token || '',
      exchange: data.exch || '',
      segment: this._mapProductType(data.prd),
      product: data.prd || '',
      instrumentType: data.instname || '',
      quantity: netQty,
      buyQuantity: buyQty,
      sellQuantity: sellQty,
      buyPrice: buyAvg,
      sellPrice: sellAvg,
      lastPrice: ltp,
      closePrice: parseFloat(data.c) || 0,
      pnl: totalPnl,
      realizedPnl: realizedPnl,
      unrealizedPnl: unrealizedPnl,
      pnlPercent: buyAvg > 0 ? ((totalPnl / (buyAvg * Math.abs(netQty || 1))) * 100) : 0,
      lotSize: parseInt(data.ls) || 1,
      multiplier: parseFloat(data.mult) || 1,
      metadata: {
        token: data.token,
        s_prdt_ali: data.s_prdt_ali,
      },
    });
  }

  /**
   * Normalize Shoonya Holding to Holding model
   */
  _normalizeHolding(data = {}) {
    const quantity = parseInt(data.holdqty) || 0;
    const avgCost = parseFloat(data.upldprc) || 0;
    const ltp = parseFloat(data.ltp) || parseFloat(data.c) || 0;
    const pnl = parseFloat(data.pnl) || ((ltp - avgCost) * quantity);

    return new Holding({
      symbol: data.tsym || data.exch_tsym || '',
      tradingSymbol: data.token || '',
      isin: data.isin || '',
      exchange: data.exch || 'NSE',
      quantity: quantity,
      t1Quantity: parseInt(data.btstqty) || 0,
      authorizedQuantity: parseInt(data.dpqty) || quantity,
      collateralQuantity: parseInt(data.colqty) || 0,
      averagePrice: avgCost,
      lastPrice: ltp,
      closePrice: parseFloat(data.c) || 0,
      pnl: pnl,
      dayPnl: 0,
      pnlPercent: avgCost > 0 ? ((pnl / (avgCost * quantity)) * 100) : 0,
      investedValue: avgCost * quantity,
      currentValue: ltp * quantity,
      metadata: {
        token: data.token,
      },
    });
  }

  /**
   * Normalize Shoonya Order to Order model
   */
  _normalizeOrder(data = {}) {
    const qty = parseInt(data.qty) || 0;
    const filledQty = parseInt(data.fillshares) || 0;

    return new Order({
      orderId: data.norenordno || data.ordno || '',
      orderTag: data.remarks || '',
      symbol: data.tsym || '',
      tradingSymbol: data.token || '',
      exchange: data.exch || '',
      segment: this._mapProductType(data.prd),
      product: data.prd || '',
      instrumentType: data.instname || '',
      orderType: data.prctyp || 'LIMIT',
      transactionType: data.trantype === 'B' ? 'BUY' : 'SELL',
      quantity: qty,
      filledQuantity: filledQty,
      pendingQuantity: qty - filledQty,
      cancelledQuantity: parseInt(data.rejshares) || 0,
      price: parseFloat(data.prc) || 0,
      triggerPrice: parseFloat(data.trgprc) || 0,
      averagePrice: parseFloat(data.avgprc) || 0,
      status: this._mapOrderStatus(data.status),
      statusMessage: data.rejreason || '',
      validity: data.ret || 'DAY',
      variety: 'REGULAR',
      orderTimestamp: data.norentm || data.ordenttm || '',
      updateTimestamp: data.norentm || data.ordenttm || '',
      lotSize: parseInt(data.ls) || 1,
      metadata: {
        norenordno: data.norenordno,
        reporttype: data.reporttype,
      },
    });
  }

  /**
   * Normalize Shoonya Trade to Trade model (broker-confirmed fill)
   */
  _normalizeTrade(data = {}) {
    const qty = parseInt(data.flqty) || parseInt(data.qty) || 0;
    const price = parseFloat(data.flprc) || parseFloat(data.avgprc) || 0;

    return new Trade({
      tradeId: data.flid || data.norenordno || '',
      orderId: data.norenordno || data.ordno || '',
      symbol: data.tsym || '',
      tradingSymbol: data.token || '',
      exchange: data.exch || '',
      segment: this._mapProductType(data.prd),
      product: data.prd || '',
      instrumentType: '',
      transactionType: data.trantype === 'B' ? 'BUY' : 'SELL',
      quantity: qty,
      price: price,
      tradeValue: qty * price,
      tradeDate: (data.norentm || '').split(' ')[0] || (data.norentm || '').split('T')[0] || '',
      tradeTime: (data.norentm || '').split(' ')[1] || (data.norentm || '').split('T')[1] || '',
      timestamp: data.norentm || data.fltm || '',
      metadata: {
        norenordno: data.norenordno,
        flid: data.flid,
      },
    });
  }

  /**
   * Normalize Shoonya Quote to Quote model
   */
  _normalizeQuote(data = {}) {
    const ltp = parseFloat(data.lp) || 0;
    const close = parseFloat(data.c) || 0;
    const change = ltp - close;
    const changePercent = close > 0 ? ((change / close) * 100) : 0;

    return new Quote({
      symbol: data.tsym || '',
      tradingSymbol: data.token || '',
      exchange: data.exch || '',
      ltp: ltp,
      open: parseFloat(data.o) || 0,
      high: parseFloat(data.h) || 0,
      low: parseFloat(data.l) || 0,
      close: close,
      change: change,
      changePercent: changePercent,
      volume: parseInt(data.v) || 0,
      upperCircuit: parseFloat(data.uc) || 0,
      lowerCircuit: parseFloat(data.lc) || 0,
      lotSize: parseInt(data.ls) || 1,
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
      'C': 'EQUITY',     // CNC
      'M': 'EQUITY',     // MIS
      'H': 'DERIVATIVE', // NRML
      'CNC': 'EQUITY',
      'MIS': 'EQUITY',
      'NRML': 'DERIVATIVE',
    };
    return mapping[prd] || 'EQUITY';
  }

  _mapOrderStatus(status) {
    const s = (status || '').toUpperCase();
    if (s === 'COMPLETE' || s === 'FILLED' || s === 'TRADED') return 'COMPLETE';
    if (s === 'REJECTED') return 'REJECTED';
    if (s === 'CANCELED' || s === 'CANCELLED') return 'CANCELLED';
    if (s === 'OPEN' || s === 'PENDING') return 'PENDING';
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
    const sensitive = ['pwd', 'password', 'token', 'jKey', 'appkey', 'factor2', 'totp', 'secret', 'key'];
    Object.keys(sanitized).forEach(key => {
      if (sensitive.some(s => key.toLowerCase().includes(s))) {
        sanitized[key] = '***REDACTED***';
      }
    });
    return sanitized;
  }
}
