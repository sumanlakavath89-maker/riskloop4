/**
 * FYERS Broker Adapter
 * Real implementation with OAuth2 authentication, read operations, and order placement
 * 
 * Official Docs: https://myapi.fyers.in/docsv3
 * Base URL: https://api-t1.fyers.in
 */

import axios from 'axios';
import crypto from 'crypto';
import { BaseBrokerAdapter } from '../BaseBrokerAdapter.js';
import { Account, Position, Order, Funds, Holding, Quote, Trade } from '../../models/index.js';
import { FyersWebSocket } from './FyersWebSocket.js';

export class FyersAdapter extends BaseBrokerAdapter {
  constructor(config = {}) {
    super({
      brokerId: 'fyers',
      brokerName: 'FYERS',
      ...config,
    });
    
    // Load credentials from environment or config
    this.appId = config.appId || process.env.FYERS_APP_ID;
    this.secretId = config.secretId || process.env.FYERS_SECRET_ID;
    this.redirectUri = config.redirectUri || process.env.FYERS_REDIRECT_URI || 'http://localhost:3000/auth/callback';
    
    // FYERS API configuration
    this.baseUrl = 'https://api-t1.fyers.in';
    this.authUrl = 'https://api-t1.fyers.in/api/v3';
    
    // Session tokens (stored securely server-side)
    this.accessToken = null;
    
    // WebSocket instance
    this.webSocket = null;
    
    // HTTP client configuration
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
   * Validate environment variables
   */
  _validateConfig() {
    const errors = [];
    
    if (!this.appId) errors.push('FYERS_APP_ID is required');
    if (!this.secretId) errors.push('FYERS_SECRET_ID is required');
    
    if (errors.length > 0) {
      throw new Error(`FYERS configuration error: ${errors.join(', ')}`);
    }
  }

  /**
   * Generate app hash for authentication
   * SHA-256(app_id + app_secret)
   */
  _generateAppHash() {
    const hash = crypto
      .createHash('sha256')
      .update(this.appId + this.secretId)
      .digest('hex');
    return hash;
  }

  /**
   * Get FYERS OAuth2 Authorization URL
   */
  getLoginUrl(state = 'riskloop_fyers_auth') {
    if (!this.appId) {
      throw new Error('FYERS_APP_ID is required to generate authorization URL');
    }
    const redirect = encodeURIComponent(this.redirectUri);
    return `https://api-t1.fyers.in/api/v3/generate-authcode?client_id=${this.appId}&redirect_uri=${redirect}&response_type=code&state=${encodeURIComponent(state)}`;
  }

  /**
   * Connect and authenticate with FYERS OAuth2
   * Expects credentials.authCode from OAuth2 flow
   */
  async connect(credentials = {}) {
    try {
      this._log('Connecting to FYERS API...');
      
      // Validate configuration
      this._validateConfig();
      
      // Check if auth_code is provided
      if (!credentials.authCode) {
        throw new Error('auth_code is required. Complete OAuth2 flow first.');
      }
      
      // Generate app hash
      const appIdHash = this._generateAppHash();
      
      // Prepare token generation payload
      const tokenPayload = {
        grant_type: 'authorization_code',
        appIdHash: appIdHash,
        code: credentials.authCode,
      };
      
      // Call FYERS token generation API
      const response = await axios.post(
        `${this.authUrl}/validate-authcode`,
        tokenPayload,
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
      
      // Check response status
      if (!response.data || response.data.s !== 'ok') {
        throw new Error(response.data?.message || 'Token generation failed');
      }
      
      // Store access token securely (server-side only)
      this.accessToken = response.data.access_token;
      this.isConnected = true;
      
      // Initialize WebSocket instance (but don't connect yet)
      this.webSocket = new FyersWebSocket({
        accessToken: this.accessToken,
        brokerId: this.brokerId,
      });
      
      this._log('Successfully connected to FYERS');
      
      return this.isConnected;
    } catch (error) {
      this.isConnected = false;
      
      // Safe error handling - never expose credentials
      if (error.response?.data) {
        const errorMsg = error.response.data.message || 'Authentication failed';
        this._error('Connection failed: ' + errorMsg);
        throw new Error(errorMsg);
      } else {
        this._error('Connection failed: ' + error.message);
        throw new Error('Unable to connect to FYERS: ' + error.message);
      }
    }
  }

  /**
   * Disconnect and clear session
   */
  async disconnect() {
    try {
      this._log('Disconnecting from FYERS...');
      
      // FYERS doesn't have explicit logout API
      // Clear tokens and disconnect WebSocket
      this.accessToken = null;
      this.isConnected = false;
      
      // Disconnect WebSocket if connected
      if (this.webSocket && this.webSocket.isConnected) {
        await this.webSocket.disconnect();
        this.webSocket = null;
      }
      
      this._log('Successfully disconnected');
    } catch (error) {
      this._error('Disconnect error (continuing cleanup)');
      this.accessToken = null;
      this.isConnected = false;
    }
  }

  /**
   * Get WebSocket instance
   * Creates and returns the WebSocket adapter for real-time feeds
   */
  getWebSocket() {
    if (!this.isConnected) {
      throw new Error('Not connected to FYERS. Please authenticate first.');
    }
    
    if (!this.webSocket) {
      this.webSocket = new FyersWebSocket({
        accessToken: this.accessToken,
        brokerId: this.brokerId,
      });
    }
    
    return this.webSocket;
  }

  /**
   * Make authenticated API call
   */
  async _authenticatedRequest(method, endpoint, data = null) {
    if (!this.isConnected || !this.accessToken) {
      throw new Error('Not connected to FYERS. Please authenticate first.');
    }
    
    try {
      const config = {
        method,
        url: endpoint,
        headers: {
          'Authorization': `${this.appId}:${this.accessToken}`,
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
      
      if (!response.data || response.data.s !== 'ok') {
        throw new Error(response.data?.message || 'API request failed');
      }
      
      return response.data;
    } catch (error) {
      // Safe error handling
      if (error.response?.data) {
        const errorMsg = error.response.data.message || 'API request failed';
        throw new Error(errorMsg);
      } else {
        throw new Error('Network error: ' + error.message);
      }
    }
  }

  /**
   * Get user profile
   * GET /api/v3/profile
   */
  async getProfile() {
    try {
      this._log('Fetching profile from FYERS...');
      
      const response = await this._authenticatedRequest(
        'GET',
        '/api/v3/profile'
      );
      
      return this._normalizeProfile(response);
    } catch (error) {
      this._error('Failed to fetch profile: ' + error.message);
      throw error;
    }
  }

  /**
   * Get funds/margin
   * GET /api/v3/funds
   */
  async getFunds() {
    try {
      this._log('Fetching funds from FYERS...');
      
      const response = await this._authenticatedRequest(
        'GET',
        '/api/v3/funds'
      );
      
      return this._normalizeFunds(response);
    } catch (error) {
      this._error('Failed to fetch funds: ' + error.message);
      throw error;
    }
  }

  /**
   * Get positions
   * GET /api/v3/positions
   */
  async getPositions() {
    try {
      this._log('Fetching positions from FYERS...');
      
      const response = await this._authenticatedRequest(
        'GET',
        '/api/v3/positions'
      );
      
      // FYERS returns {netPositions: [], overall: {}}
      const positions = response.netPositions || [];
      
      if (!Array.isArray(positions)) {
        return [];
      }
      
      return positions.map(pos => this._normalizePosition(pos));
    } catch (error) {
      this._error('Failed to fetch positions: ' + error.message);
      throw error;
    }
  }

  /**
   * Get order book
   * GET /api/v3/orders
   */
  async getOrders() {
    try {
      this._log('Fetching orders from FYERS...');
      
      const response = await this._authenticatedRequest(
        'GET',
        '/api/v3/orders'
      );
      
      const orders = response.orderBook || [];
      
      if (!Array.isArray(orders)) {
        return [];
      }
      
      return orders.map(order => this._normalizeOrder(order));
    } catch (error) {
      this._error('Failed to fetch orders: ' + error.message);
      throw error;
    }
  }

  /**
   * Get holdings
   * GET /api/v3/holdings
   */
  async getHoldings() {
    try {
      this._log('Fetching holdings from FYERS...');
      
      const response = await this._authenticatedRequest(
        'GET',
        '/api/v3/holdings'
      );
      
      const holdings = response.holdings || [];
      
      if (!Array.isArray(holdings)) {
        return [];
      }
      
      return holdings.map(holding => this._normalizeHolding(holding));
    } catch (error) {
      this._error('Failed to fetch holdings: ' + error.message);
      throw error;
    }
  }

  /**
   * Get trade history
   * GET /api/v3/tradebook
   */
  async getTradeHistory() {
    try {
      this._log('Fetching trade history from FYERS...');
      
      const response = await this._authenticatedRequest(
        'GET',
        '/api/v3/tradebook'
      );
      
      const trades = response.tradeBook || [];
      
      if (!Array.isArray(trades)) {
        return [];
      }
      
      return trades.map(trade => this._normalizeTrade(trade));
    } catch (error) {
      this._error('Failed to fetch trade history: ' + error.message);
      throw error;
    }
  }

  /**
   * Get market quotes
   * GET /api/v3/quotes
   */
  async getQuotes(symbols) {
    try {
      this._log('Fetching quotes from FYERS...', { symbolCount: symbols.length });
      
      // FYERS expects comma-separated symbols
      const symbolString = symbols.join(',');
      
      const response = await this._authenticatedRequest(
        'GET',
        '/api/v3/quotes',
        { symbols: symbolString }
      );
      
      const quotes = response.d || [];
      
      if (!Array.isArray(quotes)) {
        return [];
      }
      
      return quotes.map(quote => this._normalizeQuote(quote));
    } catch (error) {
      this._error('Failed to fetch quotes: ' + error.message);
      throw error;
    }
  }

  // ============================================================
  // NORMALIZATION METHODS
  // Transform FYERS responses to RiskLoop models
  // ============================================================

  /**
   * Normalize FYERS profile to Account model
   */
  _normalizeProfile(fyersData) {
    const data = fyersData.data || {};
    
    return new Account({
      brokerId: 'fyers',
      brokerName: 'FYERS',
      userId: data.fy_id || '',
      clientId: data.fy_id || '',
      name: data.name || '',
      email: data.email_id || '',
      mobile: data.mobile_number || '',
      pan: this._maskPAN(data.PAN),
      exchanges: data.exchange || [],
      segments: [],
      products: [],
      accountStatus: 'ACTIVE',
      metadata: {
        display_name: data.display_name,
        pin_set: data.pin_set,
        totpSetup: data.totpSetup,
      },
    });
  }

  /**
   * Normalize FYERS funds to Funds model
   */
  _normalizeFunds(fyersData) {
    const data = fyersData.fund_limit || {};
    
    return new Funds({
      segment: 'EQUITY',
      availableMargin: parseFloat(data.availableMargin) || 0,
      usedMargin: parseFloat(data.used_margin) || 0,
      totalMargin: parseFloat(data.total_balance) || 0,
      openingBalance: parseFloat(data.start_of_day) || 0,
      netBalance: parseFloat(data.net_balance) || 0,
      realizedPnl: parseFloat(data.realized_profit_loss) || 0,
      unrealizedPnl: parseFloat(data.unrealized_profit_loss) || 0,
      marginUsed: parseFloat(data.used_margin) || 0,
      collateral: parseFloat(data.collateral) || 0,
      exposureMargin: 0,
      spanMargin: 0,
      deliveryMargin: 0,
      metadata: {
        equity_balance: data.equity_balance,
        commodity_balance: data.commodity_balance,
      },
    });
  }

  /**
   * Normalize FYERS position to Position model
   */
  _normalizePosition(fyersData) {
    const quantity = parseInt(fyersData.netQty) || 0;
    const buyAvg = parseFloat(fyersData.buyAvg) || 0;
    const sellAvg = parseFloat(fyersData.sellAvg) || 0;
    const ltp = parseFloat(fyersData.ltp) || 0;
    const pl = parseFloat(fyersData.pl) || 0;
    const realizedProfit = parseFloat(fyersData.realized_profit) || 0;
    const unrealizedProfit = parseFloat(fyersData.unrealized_profit) || 0;
    
    return new Position({
      symbol: fyersData.symbol || '',
      tradingSymbol: fyersData.symbol || '',
      exchange: this._extractExchange(fyersData.symbol),
      segment: this._mapProductType(fyersData.productType),
      product: fyersData.productType || '',
      instrumentType: fyersData.segment || '',
      quantity: quantity,
      buyQuantity: parseInt(fyersData.buyQty) || 0,
      sellQuantity: parseInt(fyersData.sellQty) || 0,
      buyPrice: buyAvg,
      sellPrice: sellAvg,
      lastPrice: ltp,
      closePrice: 0,
      pnl: pl,
      realizedPnl: realizedProfit,
      unrealizedPnl: unrealizedProfit,
      pnlPercent: buyAvg > 0 ? ((pl / (buyAvg * Math.abs(quantity))) * 100) : 0,
      lotSize: parseInt(fyersData.qty) || 1,
      metadata: {
        id: fyersData.id,
        crossCurrency: fyersData.crossCurrency,
        side: fyersData.side,
      },
    });
  }

  /**
   * Normalize FYERS order to Order model
   */
  _normalizeOrder(fyersData) {
    return new Order({
      orderId: fyersData.id || '',
      orderTag: fyersData.orderTag || '',
      symbol: fyersData.symbol || '',
      tradingSymbol: fyersData.symbol || '',
      exchange: this._extractExchange(fyersData.symbol),
      segment: this._mapProductType(fyersData.productType),
      product: fyersData.productType || '',
      instrumentType: fyersData.segment || '',
      orderType: fyersData.type || '',
      transactionType: fyersData.side === 1 ? 'BUY' : 'SELL',
      quantity: parseInt(fyersData.qty) || 0,
      filledQuantity: parseInt(fyersData.filledQty) || 0,
      pendingQuantity: parseInt(fyersData.remainingQuantity) || 0,
      cancelledQuantity: 0,
      price: parseFloat(fyersData.limitPrice) || 0,
      triggerPrice: parseFloat(fyersData.stopPrice) || 0,
      averagePrice: parseFloat(fyersData.tradedPrice) || 0,
      status: this._mapOrderStatus(fyersData.status),
      statusMessage: fyersData.message || '',
      validity: fyersData.validity || 'DAY',
      variety: 'REGULAR',
      orderTimestamp: fyersData.orderDateTime || '',
      updateTimestamp: fyersData.orderDateTime || '',
      metadata: {
        fyersOrderId: fyersData.id,
        orderNumStatus: fyersData.orderNumStatus,
        offlineOrder: fyersData.offlineOrder,
        discloseQty: fyersData.discloseQty,
      },
    });
  }

  /**
   * Normalize FYERS holding to Holding model
   */
  _normalizeHolding(fyersData) {
    const quantity = parseInt(fyersData.quantity) || 0;
    const costPrice = parseFloat(fyersData.costPrice) || 0;
    const ltp = parseFloat(fyersData.ltp) || 0;
    const pl = parseFloat(fyersData.pl) || 0;
    
    return new Holding({
      symbol: fyersData.symbol || '',
      tradingSymbol: fyersData.symbol || '',
      isin: fyersData.isin || '',
      exchange: this._extractExchange(fyersData.symbol),
      quantity: quantity,
      t1Quantity: parseInt(fyersData.remainingQuantity) || 0,
      authorizedQuantity: quantity,
      collateralQuantity: parseInt(fyersData.collateral_qty) || 0,
      averagePrice: costPrice,
      lastPrice: ltp,
      closePrice: 0,
      pnl: pl,
      dayPnl: 0,
      pnlPercent: costPrice > 0 ? ((pl / (costPrice * quantity)) * 100) : 0,
      investedValue: costPrice * quantity,
      currentValue: ltp * quantity,
      metadata: {
        id: fyersData.id,
        holdingsType: fyersData.holdingsType,
      },
    });
  }

  /**
   * Normalize FYERS trade to Trade model
   */
  _normalizeTrade(fyersData) {
    const quantity = parseInt(fyersData.tradedQty) || 0;
    const price = parseFloat(fyersData.tradePrice) || 0;
    
    return new Trade({
      tradeId: fyersData.tradeNumber || '',
      orderId: fyersData.orderNumber || fyersData.id || '',
      symbol: fyersData.symbol || '',
      tradingSymbol: fyersData.symbol || '',
      exchange: this._extractExchange(fyersData.symbol),
      segment: this._mapProductType(fyersData.productType),
      product: fyersData.productType || '',
      instrumentType: fyersData.segment || '',
      transactionType: fyersData.side === 1 ? 'BUY' : 'SELL',
      quantity: quantity,
      price: price,
      tradeValue: quantity * price,
      tradeDate: fyersData.orderDateTime ? fyersData.orderDateTime.split(' ')[0] : '',
      tradeTime: fyersData.orderDateTime ? fyersData.orderDateTime.split(' ')[1] : '',
      timestamp: fyersData.orderDateTime || '',
      metadata: {
        fyersTradeId: fyersData.tradeNumber,
        fyersOrderId: fyersData.orderNumber || fyersData.id,
        clientId: fyersData.clientId,
      },
    });
  }

  /**
   * Normalize FYERS quote to Quote model
   */
  _normalizeQuote(fyersData) {
    const ltp = parseFloat(fyersData.v.lp) || 0;
    const close = parseFloat(fyersData.v.prev_close_price) || 0;
    const change = ltp - close;
    const changePercent = close > 0 ? ((change / close) * 100) : 0;
    
    return new Quote({
      symbol: fyersData.n || '',
      tradingSymbol: fyersData.n || '',
      exchange: this._extractExchange(fyersData.n),
      ltp: ltp,
      open: parseFloat(fyersData.v.open_price) || 0,
      high: parseFloat(fyersData.v.high_price) || 0,
      low: parseFloat(fyersData.v.low_price) || 0,
      close: close,
      change: change,
      changePercent: changePercent,
      volume: parseInt(fyersData.v.volume) || 0,
      upperCircuit: parseFloat(fyersData.v.upper_ckt) || 0,
      lowerCircuit: parseFloat(fyersData.v.lower_ckt) || 0,
      lotSize: 1,
      metadata: {
        symbol: fyersData.n,
        ch: fyersData.v.ch,
        chp: fyersData.v.chp,
      },
    });
  }

  // ============================================================
  // UTILITY METHODS
  // ============================================================

  /**
   * Mask PAN for security
   */
  _maskPAN(pan) {
    if (!pan || pan.length < 4) return pan;
    return pan.substring(0, 4) + '****' + pan.substring(pan.length - 2);
  }

  /**
   * Extract exchange from FYERS symbol format (NSE:SBIN-EQ)
   */
  _extractExchange(symbol) {
    if (!symbol) return '';
    const parts = symbol.split(':');
    return parts[0] || '';
  }

  /**
   * Map FYERS product types to segments
   */
  _mapProductType(productType) {
    const mapping = {
      'CNC': 'EQUITY',
      'INTRADAY': 'EQUITY',
      'MARGIN': 'DERIVATIVE',
      'CO': 'EQUITY',
      'BO': 'EQUITY',
    };
    
    return mapping[productType] || 'EQUITY';
  }

  /**
   * Map FYERS order status to RiskLoop status (FYERS v3 API)
   * 1 = Cancelled, 2 = Traded/Filled (COMPLETE), 4 = Transit, 5 = Rejected, 6 = Pending, 7 = Expired
   */
  _mapOrderStatus(fyersStatus) {
    const mapping = {
      1: 'CANCELLED',
      2: 'COMPLETE',
      4: 'TRANSIT',
      5: 'REJECTED',
      6: 'PENDING',
      7: 'EXPIRED',
    };
    
    return mapping[fyersStatus] || (typeof fyersStatus === 'string' ? fyersStatus.toUpperCase() : 'UNKNOWN');
  }

  /**
   * Override logging to never expose tokens
   */
  _log(message, data = null) {
    // Safe logging - filter out sensitive data
    const safeData = data ? this._sanitizeLogData(data) : null;
    console.log(`[${this.brokerName}] ${message}`, safeData || '');
  }

  /**
   * Sanitize log data to remove sensitive information
   */
  _sanitizeLogData(data) {
    if (typeof data !== 'object') return data;
    
    const sanitized = { ...data };
    const sensitiveFields = ['token', 'access', 'secret', 'password', 'auth', 'key', 'hash'];
    
    Object.keys(sanitized).forEach(key => {
      if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
        sanitized[key] = '***REDACTED***';
      }
    });
    
    return sanitized;
  }


  // ============================================================
  // ORDER PLACEMENT METHODS
  // ============================================================

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

  // ============================================================
  // READ-ONLY ARCHITECTURE ENFORCEMENT
  // RiskLoop NEVER places, modifies, or cancels orders.
  // ============================================================

  /**
   * Place order (Disabled)
   */
  async placeOrder(orderRequest) {
    throw new Error('RiskLoop is a read-only analytics and journal platform. Placing orders is strictly disabled.');
  }

  /**
   * Modify order (Disabled)
   */
  async modifyOrder(orderId, modifications) {
    throw new Error('RiskLoop is a read-only analytics and journal platform. Modifying orders is strictly disabled.');
  }

  /**
   * Cancel order (Disabled)
   */
  async cancelOrder(orderId) {
    throw new Error('RiskLoop is a read-only analytics and journal platform. Cancelling orders is strictly disabled.');
  }

  /**
   * Validate order request
   */
  _validateOrderRequest(order) {
    const errors = [];
    
    if (!order.symbol) errors.push('symbol is required');
    if (!order.side || !['BUY', 'SELL'].includes(order.side)) errors.push('side must be BUY or SELL');
    if (!order.quantity || order.quantity <= 0) errors.push('quantity must be positive');
    if (order.orderType === 'LIMIT' && (!order.price || order.price <= 0)) errors.push('price is required for LIMIT orders');
    
    // Validate product type
    const validProducts = ['INTRADAY', 'CNC', 'MARGIN', 'CO', 'BO'];
    if (order.product && !validProducts.includes(order.product)) {
      errors.push(`product must be one of: ${validProducts.join(', ')}`);
    }
    
    // Validate order type
    const validOrderTypes = ['MARKET', 'LIMIT', 'STOP_MARKET', 'STOP_LIMIT'];
    if (order.orderType && !validOrderTypes.includes(order.orderType)) {
      errors.push(`orderType must be one of: ${validOrderTypes.join(', ')}`);
    }
    
    if (errors.length > 0) {
      throw new Error(`Order validation failed: ${errors.join(', ')}`);
    }
  }

  /**
   * Map RiskLoop order type to FYERS order type
   */
  _mapOrderType(orderType) {
    const mapping = {
      'MARKET': 2,
      'LIMIT': 1,
      'STOP_MARKET': 4,
      'STOP_LIMIT': 3,
    };
    
    return mapping[orderType] || 2; // Default to MARKET
  }

  /**
   * Normalize order response
   */
  _normalizeOrderResponse(fyersResponse, originalRequest) {
    const orderId = fyersResponse.id || '';
    
    return new Order({
      orderId: orderId,
      orderTag: originalRequest.orderTag || '',
      symbol: originalRequest.symbol,
      tradingSymbol: originalRequest.symbol,
      exchange: this._extractExchange(originalRequest.symbol),
      segment: this._mapProductType(originalRequest.product),
      product: originalRequest.product || 'INTRADAY',
      instrumentType: '',
      orderType: originalRequest.orderType || 'MARKET',
      transactionType: originalRequest.side,
      quantity: parseInt(originalRequest.quantity) || 0,
      filledQuantity: 0, // Will be updated via WebSocket
      pendingQuantity: parseInt(originalRequest.quantity) || 0,
      cancelledQuantity: 0,
      price: parseFloat(originalRequest.price) || 0,
      triggerPrice: parseFloat(originalRequest.triggerPrice) || 0,
      averagePrice: 0, // Will be updated on execution
      status: 'PENDING', // Initial status
      statusMessage: 'Order placed successfully',
      validity: originalRequest.validity || 'DAY',
      variety: 'REGULAR',
      orderTimestamp: new Date().toISOString(),
      updateTimestamp: new Date().toISOString(),
      metadata: {
        fyersOrderId: orderId,
        originalRequest: originalRequest,
      },
    });
  }
}
