/**
 * MetaTrader 5 (MT5) Read-Only Broker Adapter
 * Connector for MT5 Forex/CFD trading accounts.
 * Ingests account info, balance/equity, open positions, order book, and executed deals into RiskLoop.
 * 
 * Supports: MetaApi Cloud REST API, Local MT5 REST Gateway / Python ZeroMQ Bridge.
 */

import axios from 'axios';
import { BaseBrokerAdapter } from '../BaseBrokerAdapter.js';
import { Account, Position, Order, Funds, Holding, Quote, Trade } from '../../models/index.js';

export class MT5Adapter extends BaseBrokerAdapter {
  constructor(config = {}) {
    super({
      brokerId: 'mt5',
      brokerName: 'MetaTrader 5',
      ...config,
    });

    // MT5 Credentials
    this.login = config.login || process.env.MT5_LOGIN;
    this.password = config.password || process.env.MT5_PASSWORD;
    this.server = config.server || process.env.MT5_SERVER;
    this.gatewayUrl = config.gatewayUrl || process.env.MT5_GATEWAY_URL || 'http://localhost:8080/api/mt5';
    this.apiToken = config.apiToken || process.env.MT5_API_TOKEN;

    // Account metadata
    this.accountInfo = null;

    // HTTP client
    this.httpClient = axios.create({
      baseURL: this.gatewayUrl,
      timeout: parseInt(process.env.API_TIMEOUT) || 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(this.apiToken ? { 'Authorization': `Bearer ${this.apiToken}` } : {}),
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
      orders: true,       // Pending orders for reconciliation
      holdings: false,     // Forex/CFDs do not have depository holdings
      quotes: true,
      tradeHistory: true, // Broker-confirmed executed deals
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
    if (!this.login) errors.push('MT5_LOGIN (Account Number) is required');
    if (!this.password) errors.push('MT5_PASSWORD is required');
    if (!this.server) errors.push('MT5_SERVER is required');

    if (errors.length > 0) {
      throw new Error(`MT5 configuration error: ${errors.join(', ')}`);
    }
  }

  /**
   * Connect to MT5 Account
   */
  async connect(credentials = {}) {
    try {
      this._log('Connecting to MetaTrader 5 account...');

      if (credentials.login || credentials.userId) this.login = credentials.login || credentials.userId;
      if (credentials.password) this.password = credentials.password;
      if (credentials.server) this.server = credentials.server;
      if (credentials.gatewayUrl) this.gatewayUrl = credentials.gatewayUrl;
      if (credentials.apiToken) this.apiToken = credentials.apiToken;

      this._validateConfig();

      // If gateway is reachable, authenticate session via gateway
      if (this.gatewayUrl && this.gatewayUrl.startsWith('http')) {
        try {
          const response = await this.httpClient.post('/auth/connect', {
            login: this.login,
            password: this.password,
            server: this.server,
          });

          if (response.data && response.data.account) {
            this.accountInfo = response.data.account;
          }
        } catch (gatewayErr) {
          // If standalone/direct mode, log info and proceed with connection state
          this._log('MT5 gateway ping note: ' + gatewayErr.message + '. Initialized with server credentials.');
        }
      }

      this.isConnected = true;
      this._log(`Connected to MT5 Server ${this.server} for Login ${this.login}`);
      return this.isConnected;
    } catch (error) {
      this.isConnected = false;
      const errorMsg = error.response?.data?.message || error.message || 'MT5 connection failed';
      this._error('Connection failed: ' + errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * Disconnect session
   */
  async disconnect() {
    try {
      if (this.isConnected) {
        this._log('Disconnecting from MT5...');
        if (this.gatewayUrl) {
          await this.httpClient.post('/auth/disconnect', { login: this.login }).catch(() => {});
        }
      }
    } finally {
      this.accountInfo = null;
      this.isConnected = false;
      this._log('Successfully disconnected from MT5');
    }
  }

  /**
   * Make authenticated request to MT5 REST bridge
   */
  async _authenticatedRequest(method, endpoint, data = null) {
    if (!this.isConnected) {
      throw new Error('Not connected to MT5. Please authenticate first.');
    }

    try {
      const config = {
        method,
        url: endpoint,
        headers: {
          ...(this.apiToken ? { 'Authorization': `Bearer ${this.apiToken}` } : {}),
          'x-mt5-login': String(this.login),
          'x-mt5-server': String(this.server),
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
      return response.data;
    } catch (error) {
      const errorMsg = error.response?.data?.message || error.message;
      this._error(`MT5 API error on ${endpoint}: ${errorMsg}`);
      throw new Error(errorMsg);
    }
  }

  // ============================================================
  // READ-ONLY DATA FETCHING METHODS
  // ============================================================

  /**
   * Get MT5 Account info
   */
  async getProfile() {
    try {
      this._log('Fetching account info from MT5...');
      let data = {};
      try {
        data = await this._authenticatedRequest('GET', '/account');
      } catch {
        data = this.accountInfo || {
          login: this.login,
          server: this.server,
          name: `MT5 User (${this.login})`,
          currency: 'USD',
          leverage: 100,
        };
      }
      return this._normalizeProfile(data);
    } catch (error) {
      this._error('Failed to fetch MT5 profile: ' + error.message);
      throw error;
    }
  }

  /**
   * Get MT5 Account Balance, Equity, and Margins
   */
  async getFunds() {
    try {
      this._log('Fetching balance and margins from MT5...');
      const data = await this._authenticatedRequest('GET', '/account/funds');
      return this._normalizeFunds(data);
    } catch (error) {
      this._error('Failed to fetch MT5 funds: ' + error.message);
      throw error;
    }
  }

  /**
   * Get MT5 open positions
   */
  async getPositions() {
    try {
      this._log('Fetching open positions from MT5...');
      const data = await this._authenticatedRequest('GET', '/positions');

      const list = Array.isArray(data) ? data : (data?.positions || data?.data || []);
      return list.map(pos => this._normalizePosition(pos));
    } catch (error) {
      this._error('Failed to fetch MT5 positions: ' + error.message);
      throw error;
    }
  }

  /**
   * Get MT5 pending orders (order book)
   */
  async getOrders() {
    try {
      this._log('Fetching pending orders from MT5...');
      const data = await this._authenticatedRequest('GET', '/orders');

      const list = Array.isArray(data) ? data : (data?.orders || data?.data || []);
      return list.map(order => this._normalizeOrder(order));
    } catch (error) {
      this._error('Failed to fetch MT5 orders: ' + error.message);
      throw error;
    }
  }

  /**
   * Holdings: Not applicable for Forex / CFD margin trading
   */
  async getHoldings() {
    return [];
  }

  /**
   * Get MT5 executed deals / history
   */
  async getTradeHistory() {
    try {
      this._log('Fetching executed deals from MT5...');
      const data = await this._authenticatedRequest('GET', '/deals');

      const list = Array.isArray(data) ? data : (data?.deals || data?.trades || data?.data || []);
      return list.map(deal => this._normalizeTrade(deal));
    } catch (error) {
      this._error('Failed to fetch MT5 trade history: ' + error.message);
      throw error;
    }
  }

  /**
   * Get MT5 symbol quotes
   */
  async getQuotes(symbols) {
    try {
      this._log('Fetching quotes from MT5...', { count: symbols.length });
      const data = await this._authenticatedRequest('GET', '/quotes', {
        symbols: symbols.join(','),
      });

      const list = Array.isArray(data) ? data : (data?.quotes || data?.data || []);
      return list.map(q => this._normalizeQuote(q));
    } catch (error) {
      this._error('Failed to fetch MT5 quotes: ' + error.message);
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
   * Normalize MT5 Account Info to Account model
   */
  _normalizeProfile(data = {}) {
    const acc = data.account || data.data || data;

    return new Account({
      brokerId: 'mt5',
      brokerName: 'MetaTrader 5',
      userId: String(acc.login || this.login || ''),
      clientId: String(acc.login || this.login || ''),
      name: acc.name || acc.clientName || `MT5 Account ${this.login}`,
      email: acc.email || '',
      mobile: acc.phone || '',
      pan: '',
      exchanges: ['FOREX', 'CFD', 'METALS', 'CRYPTO'],
      segments: ['FOREX', 'COMMODITY', 'CRYPTO', 'INDICES'],
      products: ['STANDARD', 'RAW', 'ECN'],
      accountStatus: 'ACTIVE',
      metadata: {
        server: acc.server || this.server,
        currency: acc.currency || 'USD',
        leverage: acc.leverage || 100,
        tradeMode: acc.tradeMode || 'REAL',
      },
    });
  }

  /**
   * Normalize MT5 Balance & Margin to Funds model
   */
  _normalizeFunds(data = {}) {
    const funds = data.funds || data.data || data;

    const balance = parseFloat(funds.balance) || 0;
    const equity = parseFloat(funds.equity) || balance;
    const margin = parseFloat(funds.margin) || 0;
    const freeMargin = parseFloat(funds.freeMargin) || parseFloat(funds.marginFree) || (equity - margin);
    const unrealizedPnl = parseFloat(funds.profit) || parseFloat(funds.floatingPnL) || (equity - balance);
    const realizedPnl = parseFloat(funds.realizedPnL) || parseFloat(funds.closedProfit) || 0;

    return new Funds({
      segment: 'FOREX',
      availableMargin: freeMargin,
      usedMargin: margin,
      totalMargin: equity,
      openingBalance: balance,
      netBalance: freeMargin,
      realizedPnl: realizedPnl,
      unrealizedPnl: unrealizedPnl,
      marginUsed: margin,
      collateral: 0,
      exposureMargin: 0,
      spanMargin: margin,
      deliveryMargin: 0,
      metadata: {
        currency: funds.currency || 'USD',
        equity: equity,
        marginLevel: parseFloat(funds.marginLevel) || (margin > 0 ? (equity / margin) * 100 : 0),
      },
    });
  }

  /**
   * Normalize MT5 Open Position to Position model
   */
  _normalizePosition(data = {}) {
    const ticket = String(data.ticket || data.id || data.positionId || '');
    const volume = parseFloat(data.volume) || parseFloat(data.lots) || 0;
    const priceOpen = parseFloat(data.priceOpen) || parseFloat(data.openPrice) || 0;
    const priceCurrent = parseFloat(data.priceCurrent) || parseFloat(data.currentPrice) || parseFloat(data.price) || 0;
    const profit = parseFloat(data.profit) || parseFloat(data.unrealizedProfit) || 0;
    const swap = parseFloat(data.swap) || 0;
    const commission = parseFloat(data.commission) || 0;
    const totalPnl = profit + swap + commission;

    const isBuy = data.type === 'POSITION_TYPE_BUY' || data.type === 'BUY' || data.type === 0;

    return new Position({
      positionId: ticket,
      symbol: data.symbol || '',
      tradingSymbol: data.symbol || '',
      exchange: 'FOREX',
      segment: 'FOREX',
      product: 'CFD',
      instrumentType: 'FOREX',
      quantity: volume,
      buyQuantity: isBuy ? volume : 0,
      sellQuantity: isBuy ? 0 : volume,
      buyPrice: isBuy ? priceOpen : 0,
      sellPrice: isBuy ? 0 : priceOpen,
      lastPrice: priceCurrent,
      closePrice: priceOpen,
      pnl: totalPnl,
      realizedPnl: 0,
      unrealizedPnl: totalPnl,
      pnlPercent: priceOpen > 0 ? (((priceCurrent - priceOpen) / priceOpen) * 100 * (isBuy ? 1 : -1)) : 0,
      lotSize: 1,
      multiplier: 100000,
      metadata: {
        ticket: ticket,
        magic: data.magic || 0,
        comment: data.comment || '',
        sl: data.sl || data.stopLoss || 0,
        tp: data.tp || data.takeProfit || 0,
        swap: swap,
        commission: commission,
        time: data.time || data.timeCreate || '',
      },
    });
  }

  /**
   * Normalize MT5 Pending Order to Order model
   */
  _normalizeOrder(data = {}) {
    const ticket = String(data.ticket || data.orderId || data.id || '');
    const volume = parseFloat(data.volumeInitial) || parseFloat(data.volume) || 0;
    const volumeCurrent = parseFloat(data.volumeCurrent) || 0;
    const filledQty = volume - volumeCurrent;
    const price = parseFloat(data.priceOpen) || parseFloat(data.price) || 0;

    let transactionType = 'BUY';
    const typeStr = String(data.type || '').toUpperCase();
    if (typeStr.includes('SELL') || typeStr === '1') transactionType = 'SELL';

    return new Order({
      orderId: ticket,
      orderTag: data.comment || '',
      symbol: data.symbol || '',
      tradingSymbol: data.symbol || '',
      exchange: 'FOREX',
      segment: 'FOREX',
      product: 'CFD',
      instrumentType: 'FOREX',
      orderType: typeStr || 'LIMIT',
      transactionType: transactionType,
      quantity: volume,
      filledQuantity: filledQty,
      pendingQuantity: volumeCurrent,
      cancelledQuantity: 0,
      price: price,
      triggerPrice: parseFloat(data.priceTrigger) || parseFloat(data.triggerPrice) || 0,
      averagePrice: price,
      status: this._mapOrderStatus(data.state || data.status),
      statusMessage: data.comment || '',
      validity: data.typeTime || 'GTC',
      variety: 'REGULAR',
      orderTimestamp: data.timeSetup || data.time || '',
      updateTimestamp: data.timeDone || data.timeSetup || '',
      lotSize: 1,
      metadata: {
        ticket: ticket,
        magic: data.magic,
        sl: data.sl || 0,
        tp: data.tp || 0,
      },
    });
  }

  /**
   * Normalize MT5 Executed Deal / History to Trade model
   * Only broker-confirmed executions become RiskLoop trades!
   */
  _normalizeTrade(data = {}) {
    const ticket = String(data.ticket || data.dealId || data.id || '');
    const orderId = String(data.order || data.orderId || ticket);
    const volume = parseFloat(data.volume) || parseFloat(data.lots) || 0;
    const price = parseFloat(data.price) || 0;
    const profit = parseFloat(data.profit) || 0;
    const commission = parseFloat(data.commission) || 0;
    const swap = parseFloat(data.swap) || 0;
    const time = data.time || data.timeCreate || '';

    let transactionType = 'BUY';
    const typeStr = String(data.type || '').toUpperCase();
    if (typeStr.includes('SELL') || typeStr === 'DEAL_TYPE_SELL' || typeStr === '1') {
      transactionType = 'SELL';
    }

    return new Trade({
      tradeId: ticket,
      orderId: orderId,
      symbol: data.symbol || '',
      tradingSymbol: data.symbol || '',
      exchange: 'FOREX',
      segment: 'FOREX',
      product: 'CFD',
      instrumentType: 'FOREX',
      transactionType: transactionType,
      quantity: volume,
      price: price,
      tradeValue: volume * price,
      tradeDate: time.split(' ')[0] || time.split('T')[0] || '',
      tradeTime: time.split(' ')[1] || time.split('T')[1] || '',
      timestamp: time,
      metadata: {
        dealTicket: ticket,
        orderTicket: orderId,
        profit: profit,
        commission: commission,
        swap: swap,
        magic: data.magic,
        comment: data.comment,
      },
    });
  }

  /**
   * Normalize MT5 Quote to Quote model
   */
  _normalizeQuote(data = {}) {
    const bid = parseFloat(data.bid) || 0;
    const ask = parseFloat(data.ask) || 0;
    const ltp = bid || ask;

    return new Quote({
      symbol: data.symbol || '',
      tradingSymbol: data.symbol || '',
      exchange: 'FOREX',
      ltp: ltp,
      open: parseFloat(data.open) || ltp,
      high: parseFloat(data.high) || ltp,
      low: parseFloat(data.low) || ltp,
      close: parseFloat(data.close) || ltp,
      change: parseFloat(data.change) || 0,
      changePercent: parseFloat(data.changePercent) || 0,
      volume: parseInt(data.volume) || 0,
      upperCircuit: 0,
      lowerCircuit: 0,
      lotSize: 1,
      metadata: {
        bid: bid,
        ask: ask,
        spread: data.spread || (ask > 0 && bid > 0 ? (ask - bid) : 0),
        time: data.time || '',
      },
    });
  }

  // ============================================================
  // UTILITY METHODS
  // ============================================================

  _mapOrderStatus(status) {
    const s = String(status || '').toUpperCase();
    if (s === 'ORDER_STATE_FILLED' || s === 'FILLED' || s === 'COMPLETED' || s === 'COMPLETE') return 'COMPLETE';
    if (s === 'ORDER_STATE_CANCELED' || s === 'CANCELED' || s === 'CANCELLED') return 'CANCELLED';
    if (s === 'ORDER_STATE_REJECTED' || s === 'REJECTED') return 'REJECTED';
    if (s === 'ORDER_STATE_PLACED' || s === 'PLACED' || s === 'OPEN' || s === 'PENDING') return 'PENDING';
    return s || 'PENDING';
  }

  _log(message, data = null) {
    console.log(`[${this.brokerName}] ${message}`, data ? this._sanitizeLogData(data) : '');
  }

  _sanitizeLogData(data) {
    if (typeof data !== 'object') return data;
    const sanitized = { ...data };
    const sensitive = ['password', 'token', 'apitoken', 'secret'];
    Object.keys(sanitized).forEach(k => {
      if (sensitive.some(s => k.toLowerCase().includes(s))) {
        sanitized[k] = '***REDACTED***';
      }
    });
    return sanitized;
  }
}
