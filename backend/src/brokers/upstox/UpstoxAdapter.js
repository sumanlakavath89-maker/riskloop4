/**
 * Upstox Broker Adapter
 * Real implementation with OAuth2 authentication, read operations, and order placement
 * 
 * Official Docs: https://upstox.com/developer/api-documentation
 * Base URL: https://api.upstox.com/v2
 */

import axios from 'axios';
import { BaseBrokerAdapter } from '../BaseBrokerAdapter.js';
import { Account, Position, Order, Funds, Holding, Quote, Trade } from '../../models/index.js';
import { UpstoxWebSocket } from './UpstoxWebSocket.js';

export class UpstoxAdapter extends BaseBrokerAdapter {
  constructor(config = {}) {
    super({
      brokerId: 'upstox',
      brokerName: 'Upstox',
      ...config,
    });
    
    // Load credentials from environment or config
    this.apiKey = config.apiKey || process.env.UPSTOX_API_KEY;
    this.apiSecret = config.apiSecret || process.env.UPSTOX_API_SECRET;
    this.redirectUri = config.redirectUri || process.env.UPSTOX_REDIRECT_URI || 'http://localhost:3000/auth/callback';
    
    // Upstox API configuration
    this.baseUrl = 'https://api.upstox.com/v2';
    this.authUrl = 'https://api.upstox.com/v2/login/authorization';
    
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
    
    if (!this.apiKey) errors.push('UPSTOX_API_KEY is required');
    if (!this.apiSecret) errors.push('UPSTOX_API_SECRET is required');
    
    if (errors.length > 0) {
      throw new Error(`Upstox configuration error: ${errors.join(', ')}`);
    }
  }

  /**
   * Get Upstox OAuth2 Authorization URL
   */
  getLoginUrl(state = 'riskloop_upstox_auth') {
    if (!this.apiKey) {
      throw new Error('UPSTOX_API_KEY is required to generate authorization URL');
    }
    const redirect = encodeURIComponent(this.redirectUri);
    return `https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=${this.apiKey}&redirect_uri=${redirect}&state=${encodeURIComponent(state)}`;
  }

  /**
   * Connect and authenticate with Upstox OAuth2
   * Expects credentials.authCode from OAuth2 flow
   */
  async connect(credentials = {}) {
    try {
      this._log('Connecting to Upstox API...');
      
      // Validate configuration
      this._validateConfig();
      
      // Check if auth_code is provided
      if (!credentials.authCode) {
        throw new Error('auth_code is required. Complete OAuth2 flow first.');
      }
      
      // Exchange authorization code for access token
      const tokenResponse = await axios.post(
        `${this.authUrl}/token`,
        new URLSearchParams({
          code: credentials.authCode,
          client_id: this.apiKey,
          client_secret: this.apiSecret,
          redirect_uri: this.redirectUri,
          grant_type: 'authorization_code',
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
          },
        }
      );
      
      // Check response status
      if (!tokenResponse.data || !tokenResponse.data.access_token) {
        throw new Error('Token generation failed');
      }
      
      // Store access token securely (server-side only)
      this.accessToken = tokenResponse.data.access_token;
      this.isConnected = true;
      
      // Initialize WebSocket instance (but don't connect yet)
      this.webSocket = new UpstoxWebSocket({
        accessToken: this.accessToken,
        brokerId: this.brokerId,
      });
      
      this._log('Successfully connected to Upstox');
      
      return this.isConnected;
    } catch (error) {
      this.isConnected = false;
      
      // Safe error handling - never expose credentials
      if (error.response?.data) {
        const errorMsg = error.response.data.error_description || error.response.data.message || 'Authentication failed';
        this._error('Connection failed: ' + errorMsg);
        throw new Error(errorMsg);
      } else {
        this._error('Connection failed: ' + error.message);
        throw new Error('Unable to connect to Upstox: ' + error.message);
      }
    }
  }

  /**
   * Disconnect and clear session
   */
  async disconnect() {
    try {
      this._log('Disconnecting from Upstox...');
      
      // Upstox doesn't have explicit logout API
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
      throw new Error('Not connected to Upstox. Please authenticate first.');
    }
    
    if (!this.webSocket) {
      this.webSocket = new UpstoxWebSocket({
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
      throw new Error('Not connected to Upstox. Please authenticate first.');
    }
    
    try {
      const config = {
        method,
        url: endpoint,
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
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
      
      // Upstox returns data directly or in 'data' field
      return response.data;
    } catch (error) {
      // Safe error handling
      if (error.response?.data) {
        const errorMsg = error.response.data.message || error.response.data.error || 'API request failed';
        throw new Error(errorMsg);
      } else {
        throw new Error('Network error: ' + error.message);
      }
    }
  }

  /**
   * Get user profile
   * GET /user/profile
   */
  async getProfile() {
    try {
      this._log('Fetching profile from Upstox...');
      
      const data = await this._authenticatedRequest('GET', '/user/profile');
      
      return this._normalizeProfile(data);
    } catch (error) {
      this._error('Failed to fetch profile: ' + error.message);
      throw error;
    }
  }

  /**
   * Get funds/margin
   * GET /user/get-funds-and-margin
   */
  async getFunds() {
    try {
      this._log('Fetching funds from Upstox...');
      
      const data = await this._authenticatedRequest('GET', '/user/get-funds-and-margin');
      
      return this._normalizeFunds(data);
    } catch (error) {
      this._error('Failed to fetch funds: ' + error.message);
      throw error;
    }
  }

  /**
   * Get positions
   * GET /portfolio/short-term-holdings
   */
  async getPositions() {
    try {
      this._log('Fetching positions from Upstox...');
      
      const data = await this._authenticatedRequest('GET', '/portfolio/short-term-holdings');
      
      // Upstox returns {status: "success", data: [...]}
      if (!data || !data.data || !Array.isArray(data.data)) {
        return [];
      }
      
      return data.data.map(pos => this._normalizePosition(pos));
    } catch (error) {
      this._error('Failed to fetch positions: ' + error.message);
      throw error;
    }
  }

  /**
   * Get order book
   * GET /order/retrieve-all
   */
  async getOrders() {
    try {
      this._log('Fetching orders from Upstox...');
      
      const data = await this._authenticatedRequest('GET', '/order/retrieve-all');
      
      if (!data || !data.data || !Array.isArray(data.data)) {
        return [];
      }
      
      return data.data.map(order => this._normalizeOrder(order));
    } catch (error) {
      this._error('Failed to fetch orders: ' + error.message);
      throw error;
    }
  }

  /**
   * Get holdings
   * GET /portfolio/long-term-holdings
   */
  async getHoldings() {
    try {
      this._log('Fetching holdings from Upstox...');
      
      const data = await this._authenticatedRequest('GET', '/portfolio/long-term-holdings');
      
      if (!data || !data.data || !Array.isArray(data.data)) {
        return [];
      }
      
      return data.data.map(holding => this._normalizeHolding(holding));
    } catch (error) {
      this._error('Failed to fetch holdings: ' + error.message);
      throw error;
    }
  }

  /**
   * Get trade history
   * GET /charges/historical-trades
   */
  async getTradeHistory() {
    try {
      this._log('Fetching trade history from Upstox...');
      
      // Get today's date range
      const today = new Date().toISOString().split('T')[0];
      
      const data = await this._authenticatedRequest('GET', '/charges/historical-trades', {
        from_date: today,
        to_date: today,
        page_number: 1,
        page_size: 1000,
      });
      
      if (!data || !data.data || !Array.isArray(data.data)) {
        return [];
      }
      
      return data.data.map(trade => this._normalizeTrade(trade));
    } catch (error) {
      this._error('Failed to fetch trade history: ' + error.message);
      throw error;
    }
  }

  /**
   * Get market quotes
   * GET /market-quote/quotes
   */
  async getQuotes(symbols) {
    try {
      this._log('Fetching quotes from Upstox...', { symbolCount: symbols.length });
      
      // Upstox expects comma-separated instrument keys
      const symbolString = symbols.join(',');
      
      const data = await this._authenticatedRequest('GET', '/market-quote/quotes', {
        instrument_key: symbolString,
      });
      
      if (!data || !data.data) {
        return [];
      }
      
      // Convert object to array
      const quotes = Object.entries(data.data).map(([key, value]) => ({
        instrument_key: key,
        ...value,
      }));
      
      return quotes.map(quote => this._normalizeQuote(quote));
    } catch (error) {
      this._error('Failed to fetch quotes: ' + error.message);
      throw error;
    }
  }

  // ============================================================
  // NORMALIZATION METHODS
  // Transform Upstox responses to RiskLoop models
  // ============================================================

  /**
   * Normalize Upstox profile to Account model
   */
  _normalizeProfile(upstoxData) {
    const data = upstoxData.data || {};
    
    return new Account({
      brokerId: 'upstox',
      brokerName: 'Upstox',
      userId: data.user_id || data.client_id || '',
      clientId: data.client_id || data.user_id || '',
      name: data.user_name || '',
      email: data.email || '',
      mobile: data.mobile || '',
      pan: this._maskPAN(data.pan),
      exchanges: data.exchanges || [],
      segments: this._parseSegments(data),
      products: data.products || [],
      accountStatus: 'ACTIVE',
      metadata: {
        user_type: data.user_type,
        is_active: data.is_active,
      },
    });
  }

  /**
   * Normalize Upstox funds to Funds model
   */
  _normalizeFunds(upstoxData) {
    const data = upstoxData.data || {};
    const equity = data.equity || {};
    const available = parseFloat(equity.available_margin) || 0;
    const used = parseFloat(equity.used_margin) || 0;
    
    return new Funds({
      segment: 'EQUITY',
      availableMargin: available,
      usedMargin: used,
      totalMargin: available + used,
      openingBalance: parseFloat(equity.opening_balance) || 0,
      netBalance: available,
      realizedPnl: parseFloat(equity.realised_profit) || 0,
      unrealizedPnl: parseFloat(equity.unrealised_profit) || 0,
      marginUsed: used,
      collateral: parseFloat(equity.collateral) || 0,
      exposureMargin: 0,
      spanMargin: parseFloat(equity.span_margin) || 0,
      deliveryMargin: 0,
      metadata: {
        payin: equity.payin,
        payout: equity.payout,
        commodity: data.commodity,
      },
    });
  }

  /**
   * Normalize Upstox position to Position model
   */
  _normalizePosition(upstoxData) {
    const quantity = parseInt(upstoxData.quantity) || 0;
    const buyPrice = parseFloat(upstoxData.average_price) || parseFloat(upstoxData.buy_price) || 0;
    const ltp = parseFloat(upstoxData.last_price) || 0;
    const pnl = parseFloat(upstoxData.pnl) || parseFloat(upstoxData.unrealised) || 0;
    const realizedPnl = parseFloat(upstoxData.realised) || 0;
    const unrealizedPnl = parseFloat(upstoxData.unrealised) || 0;
    
    return new Position({
      symbol: upstoxData.trading_symbol || upstoxData.tradingsymbol || '',
      tradingSymbol: upstoxData.instrument_token || '',
      exchange: upstoxData.exchange || '',
      segment: this._mapProductType(upstoxData.product),
      product: upstoxData.product || '',
      instrumentType: upstoxData.instrument_type || '',
      quantity: quantity,
      buyQuantity: parseInt(upstoxData.buy_quantity) || Math.abs(quantity),
      sellQuantity: parseInt(upstoxData.sell_quantity) || 0,
      buyPrice: buyPrice,
      sellPrice: parseFloat(upstoxData.sell_price) || 0,
      lastPrice: ltp,
      closePrice: parseFloat(upstoxData.close_price) || 0,
      pnl: pnl,
      realizedPnl: realizedPnl,
      unrealizedPnl: unrealizedPnl,
      pnlPercent: buyPrice > 0 ? ((pnl / (buyPrice * Math.abs(quantity))) * 100) : 0,
      lotSize: parseInt(upstoxData.multiplier) || 1,
      metadata: {
        instrument_token: upstoxData.instrument_token,
        day_change: upstoxData.day_change,
        day_change_percentage: upstoxData.day_change_percentage,
      },
    });
  }

  /**
   * Normalize Upstox order to Order model
   */
  _normalizeOrder(upstoxData) {
    return new Order({
      orderId: upstoxData.order_id || '',
      orderTag: upstoxData.tag || upstoxData.order_ref_id || '',
      symbol: upstoxData.trading_symbol || upstoxData.tradingsymbol || '',
      tradingSymbol: upstoxData.instrument_token || '',
      exchange: upstoxData.exchange || '',
      segment: this._mapProductType(upstoxData.product),
      product: upstoxData.product || '',
      instrumentType: upstoxData.instrument_type || '',
      orderType: upstoxData.order_type || '',
      transactionType: upstoxData.transaction_type || '',
      quantity: parseInt(upstoxData.quantity) || 0,
      filledQuantity: parseInt(upstoxData.filled_quantity) || 0,
      pendingQuantity: (parseInt(upstoxData.quantity) || 0) - (parseInt(upstoxData.filled_quantity) || 0),
      cancelledQuantity: parseInt(upstoxData.cancelled_quantity) || 0,
      price: parseFloat(upstoxData.price) || 0,
      triggerPrice: parseFloat(upstoxData.trigger_price) || 0,
      averagePrice: parseFloat(upstoxData.average_price) || 0,
      status: this._mapOrderStatus(upstoxData.status),
      statusMessage: upstoxData.status_message || '',
      validity: upstoxData.validity || 'DAY',
      variety: upstoxData.variety || 'REGULAR',
      orderTimestamp: upstoxData.order_timestamp || '',
      updateTimestamp: upstoxData.exchange_timestamp || upstoxData.order_timestamp || '',
      metadata: {
        order_id: upstoxData.order_id,
        exchange_order_id: upstoxData.exchange_order_id,
        parent_order_id: upstoxData.parent_order_id,
        disclosed_quantity: upstoxData.disclosed_quantity,
        is_amo: upstoxData.is_amo,
      },
    });
  }

  /**
   * Normalize Upstox holding to Holding model
   */
  _normalizeHolding(upstoxData) {
    const quantity = parseInt(upstoxData.quantity) || 0;
    const avgCost = parseFloat(upstoxData.average_price) || 0;
    const ltp = parseFloat(upstoxData.last_price) || 0;
    const pnl = parseFloat(upstoxData.pnl) || (ltp - avgCost) * quantity;
    
    return new Holding({
      symbol: upstoxData.trading_symbol || upstoxData.tradingsymbol || '',
      tradingSymbol: upstoxData.instrument_token || '',
      isin: upstoxData.isin || '',
      exchange: upstoxData.exchange || '',
      quantity: quantity,
      t1Quantity: parseInt(upstoxData.t1_quantity) || 0,
      authorizedQuantity: quantity,
      collateralQuantity: parseInt(upstoxData.collateral_quantity) || 0,
      averagePrice: avgCost,
      lastPrice: ltp,
      closePrice: parseFloat(upstoxData.close_price) || 0,
      pnl: pnl,
      dayPnl: parseFloat(upstoxData.day_change) || 0,
      pnlPercent: avgCost > 0 ? ((pnl / (avgCost * quantity)) * 100) : 0,
      investedValue: avgCost * quantity,
      currentValue: ltp * quantity,
      metadata: {
        instrument_token: upstoxData.instrument_token,
        cnc_used_quantity: upstoxData.cnc_used_quantity,
        collateral_type: upstoxData.collateral_type,
      },
    });
  }

  /**
   * Normalize Upstox trade to Trade model
   */
  _normalizeTrade(upstoxData) {
    const quantity = parseInt(upstoxData.quantity) || 0;
    const price = parseFloat(upstoxData.trade_price) || parseFloat(upstoxData.price) || 0;
    
    return new Trade({
      tradeId: upstoxData.trade_id || upstoxData.order_id || '',
      orderId: upstoxData.order_id || '',
      symbol: upstoxData.trading_symbol || upstoxData.tradingsymbol || '',
      tradingSymbol: upstoxData.instrument_token || '',
      exchange: upstoxData.exchange || '',
      segment: this._mapProductType(upstoxData.product),
      product: upstoxData.product || '',
      instrumentType: upstoxData.instrument_type || '',
      transactionType: upstoxData.transaction_type || '',
      quantity: quantity,
      price: price,
      tradeValue: quantity * price,
      tradeDate: (upstoxData.trade_date || upstoxData.trade_timestamp || '').split(' ')[0] || (upstoxData.trade_date || upstoxData.trade_timestamp || '').split('T')[0] || '',
      tradeTime: (upstoxData.trade_date || upstoxData.trade_timestamp || '').split(' ')[1] || (upstoxData.trade_date || upstoxData.trade_timestamp || '').split('T')[1] || '',
      timestamp: upstoxData.trade_date || upstoxData.trade_timestamp || upstoxData.order_timestamp || '',
      metadata: {
        trade_id: upstoxData.trade_id,
        order_id: upstoxData.order_id,
        exchange_order_id: upstoxData.exchange_order_id,
      },
    });
  }

  /**
   * Normalize Upstox quote to Quote model
   */
  _normalizeQuote(upstoxData) {
    const ohlc = upstoxData.ohlc || {};
    const ltp = parseFloat(upstoxData.last_price) || parseFloat(ohlc.close) || 0;
    const close = parseFloat(ohlc.close) || 0;
    const change = ltp - close;
    const changePercent = close > 0 ? ((change / close) * 100) : 0;
    
    return new Quote({
      symbol: upstoxData.trading_symbol || upstoxData.instrument_key || '',
      tradingSymbol: upstoxData.instrument_token || upstoxData.instrument_key || '',
      exchange: upstoxData.exchange || '',
      ltp: ltp,
      open: parseFloat(ohlc.open) || 0,
      high: parseFloat(ohlc.high) || 0,
      low: parseFloat(ohlc.low) || 0,
      close: close,
      change: change,
      changePercent: changePercent,
      volume: parseInt(upstoxData.volume) || 0,
      upperCircuit: parseFloat(upstoxData.upper_circuit_limit) || 0,
      lowerCircuit: parseFloat(upstoxData.lower_circuit_limit) || 0,
      lotSize: parseInt(upstoxData.lot_size) || 1,
      metadata: {
        instrument_key: upstoxData.instrument_key,
        oi: upstoxData.oi,
        oi_day_high: upstoxData.oi_day_high,
        oi_day_low: upstoxData.oi_day_low,
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
   * Parse segments from profile data
   */
  _parseSegments(profileData) {
    const segments = new Set();
    
    if (profileData.exchanges) {
      if (profileData.exchanges.includes('NSE')) segments.add('EQUITY');
      if (profileData.exchanges.includes('NFO')) segments.add('DERIVATIVE');
      if (profileData.exchanges.includes('MCX')) segments.add('COMMODITY');
      if (profileData.exchanges.includes('CDS')) segments.add('CURRENCY');
    }
    
    return Array.from(segments);
  }

  /**
   * Map Upstox product type to segments
   */
  _mapProductType(productType) {
    const mapping = {
      'D': 'EQUITY',     // Delivery/CNC
      'I': 'EQUITY',     // Intraday
      'CO': 'EQUITY',    // Cover Order
      'OCO': 'EQUITY',   // One Cancels Other
      'MTF': 'EQUITY',   // Margin Trading Facility
    };
    
    return mapping[productType] || 'EQUITY';
  }

  /**
   * Map Upstox order status to RiskLoop status
   */
  _mapOrderStatus(upstoxStatus) {
    const mapping = {
      'open': 'PENDING',
      'pending': 'PENDING',
      'put order req received': 'PENDING',
      'validation pending': 'PENDING',
      'open pending': 'PENDING',
      'trigger pending': 'PENDING',
      'complete': 'EXECUTED',
      'traded': 'EXECUTED',
      'partially filled': 'PARTIALLY_FILLED',
      'rejected': 'REJECTED',
      'cancelled': 'CANCELLED',
      'after market order req received': 'PENDING',
    };
    
    return mapping[upstoxStatus?.toLowerCase()] || upstoxStatus || 'UNKNOWN';
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
    const sensitiveFields = ['token', 'access', 'secret', 'password', 'auth', 'key', 'code'];
    
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

  // ============================================================
  // ORDER VALIDATION & MAPPING
  // ============================================================

  /**
   * Validate order request
   */
  _validateOrderRequest(orderRequest) {
    const errors = [];
    
    if (!orderRequest.instrumentToken && !orderRequest.symbol) {
      errors.push('instrument_token or symbol is required');
    }
    
    if (!orderRequest.quantity || orderRequest.quantity <= 0) {
      errors.push('quantity must be greater than 0');
    }
    
    if (!orderRequest.product) {
      errors.push('product is required (D=Delivery, I=Intraday, MTF=Margin)');
    }
    
    if (!orderRequest.transactionType) {
      errors.push('transaction_type is required (BUY or SELL)');
    }
    
    if (!orderRequest.orderType) {
      errors.push('order_type is required (MARKET, LIMIT, SL, SL-M)');
    }
    
    if (orderRequest.orderType === 'LIMIT' && !orderRequest.price) {
      errors.push('price is required for LIMIT orders');
    }
    
    if (['SL', 'SL-M'].includes(orderRequest.orderType) && !orderRequest.triggerPrice) {
      errors.push('trigger_price is required for stop loss orders');
    }
    
    if (errors.length > 0) {
      throw new Error(`Order validation failed: ${errors.join(', ')}`);
    }
  }

  /**
   * Map RiskLoop order request to Upstox format
   */
  _mapOrderToUpstox(orderRequest) {
    return {
      instrument_token: orderRequest.instrumentToken || orderRequest.symbol,
      quantity: orderRequest.quantity,
      product: orderRequest.product,
      validity: orderRequest.validity || 'DAY',
      price: orderRequest.price || 0,
      tag: orderRequest.tag || '',
      order_type: orderRequest.orderType,
      transaction_type: orderRequest.transactionType,
      disclosed_quantity: orderRequest.disclosedQuantity || 0,
      trigger_price: orderRequest.triggerPrice || 0,
      is_amo: orderRequest.isAMO || false,
      market_protection: orderRequest.marketProtection !== undefined ? orderRequest.marketProtection : -1,
    };
  }
}
