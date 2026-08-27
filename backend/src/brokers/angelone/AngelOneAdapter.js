/**
 * Angel One (SmartAPI) Broker Adapter
 * Real implementation with authentication, read operations, and order placement
 * 
 * Official Docs: https://smartapi.angelbroking.com/docs
 * Base URL: https://apiconnect.angelbroking.com
 */

import axios from 'axios';
import * as OTPAuth from 'otpauth';
import { BaseBrokerAdapter } from '../BaseBrokerAdapter.js';
import { Account, Position, Order, Funds, Holding, Quote, Trade } from '../../models/index.js';
import { AngelOneWebSocket } from './AngelOneWebSocket.js';

export class AngelOneAdapter extends BaseBrokerAdapter {
  constructor(config = {}) {
    super({
      brokerId: 'angelone',
      brokerName: 'Angel One',
      ...config,
    });
    
    // Load credentials from environment or config
    this.apiKey = config.apiKey || process.env.ANGELONE_API_KEY;
    this.clientId = config.clientId || process.env.ANGELONE_CLIENT_ID;
    this.mpin = config.mpin || process.env.ANGELONE_MPIN;
    this.totpSecret = config.totpSecret || process.env.ANGELONE_TOTP_SECRET;
    
    // Angel One API configuration
    this.baseUrl = 'https://apiconnect.angelbroking.com';
    
    // Session tokens (stored securely server-side)
    this.jwtToken = null;
    this.refreshToken = null;
    this.feedToken = null;
    
    // WebSocket instance
    this.webSocket = null;
    
    // HTTP client configuration
    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: parseInt(process.env.API_TIMEOUT) || 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-UserType': 'USER',
        'X-SourceID': 'WEB',
        'X-ClientLocalIP': '127.0.0.1',
        'X-ClientPublicIP': '127.0.0.1',
        'X-MACAddress': '00:00:00:00:00:00',
      },
    });
  }

  /**
   * Get broker capabilities
   * Enforces RiskLoop read-only architecture (analytics & journal only)
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
   * Validate environment variables
   */
  _validateConfig() {
    const errors = [];
    
    if (!this.apiKey) errors.push('ANGELONE_API_KEY is required');
    if (!this.clientId) errors.push('ANGELONE_CLIENT_ID is required');
    if (!this.mpin) errors.push('ANGELONE_MPIN is required');
    if (!this.totpSecret) errors.push('ANGELONE_TOTP_SECRET is required');
    
    if (errors.length > 0) {
      throw new Error(`Angel One configuration error: ${errors.join(', ')}`);
    }
  }

  /**
   * Generate TOTP code from secret
   */
  _generateTOTP() {
    try {
      const totp = new OTPAuth.TOTP({
        secret: OTPAuth.Secret.fromBase32(this.totpSecret),
        digits: 6,
        period: 30,
      });
      
      return totp.generate();
    } catch (error) {
      this._error('TOTP generation failed');
      throw new Error('Invalid TOTP secret');
    }
  }

  /**
   * Connect and authenticate with Angel One SmartAPI
   * POST /rest/auth/angelbroking/user/v1/loginByPassword
   */
  async connect(credentials = {}) {
    try {
      this._log('Connecting to Angel One SmartAPI...');
      
      // Validate configuration
      this._validateConfig();
      
      // Generate TOTP
      const totp = this._generateTOTP();
      
      // Prepare login payload
      const loginPayload = {
        clientcode: credentials.clientId || this.clientId,
        password: credentials.mpin || this.mpin,
        totp: totp,
      };
      
      // Call login API
      const response = await this.httpClient.post(
        '/rest/auth/angelbroking/user/v1/loginByPassword',
        loginPayload,
        {
          headers: {
            'X-PrivateKey': this.apiKey,
          },
        }
      );
      
      // Check response status
      if (!response.data || !response.data.status) {
        throw new Error(response.data?.message || 'Login failed');
      }
      
      // Store tokens securely (server-side only)
      const data = response.data.data;
      this.jwtToken = data.jwtToken;
      this.refreshToken = data.refreshToken;
      this.feedToken = data.feedToken;
      this.isConnected = true;
      
      // Initialize WebSocket instance (but don't connect yet)
      this.webSocket = new AngelOneWebSocket({
        authToken: this.jwtToken,
        apiKey: this.apiKey,
        clientCode: this.clientId,
        feedToken: this.feedToken,
      });
      
      this._log('Successfully connected to Angel One');
      
      return this.isConnected;
    } catch (error) {
      this.isConnected = false;
      
      // Safe error handling - never expose credentials
      if (error.response?.data) {
        const errorMsg = error.response.data.message || 'Authentication failed';
        this._error('Connection failed: ' + errorMsg);
        throw new Error(errorMsg);
      } else {
        this._error('Connection failed: Network error');
        throw new Error('Unable to connect to Angel One');
      }
    }
  }

  /**
   * Disconnect and clear session
   * POST /rest/secure/angelbroking/user/v1/logout
   */
  async disconnect() {
    try {
      if (!this.isConnected || !this.jwtToken) {
        this.isConnected = false;
        return;
      }
      
      this._log('Disconnecting from Angel One...');
      
      // Call logout API
      await this.httpClient.post(
        '/rest/secure/angelbroking/user/v1/logout',
        { clientcode: this.clientId },
        {
          headers: {
            'Authorization': `Bearer ${this.jwtToken}`,
            'X-PrivateKey': this.apiKey,
          },
        }
      );
      
      this._log('Successfully disconnected');
    } catch (error) {
      this._error('Logout error (continuing cleanup)');
    } finally {
      // Clear tokens regardless of API call success
      this.jwtToken = null;
      this.refreshToken = null;
      this.feedToken = null;
      this.isConnected = false;
      
      // Disconnect WebSocket if connected
      if (this.webSocket && this.webSocket.isConnected) {
        await this.webSocket.disconnect();
        this.webSocket = null;
      }
    }
  }

  /**
   * Get WebSocket instance
   * Creates and returns the WebSocket adapter for real-time feeds
   */
  getWebSocket() {
    if (!this.isConnected) {
      throw new Error('Not connected to Angel One. Please authenticate first.');
    }
    
    if (!this.webSocket) {
      this.webSocket = new AngelOneWebSocket({
        authToken: this.jwtToken,
        apiKey: this.apiKey,
        clientCode: this.clientId,
        feedToken: this.feedToken,
      });
    }
    
    return this.webSocket;
  }

  /**
   * Make authenticated API call
   */
  async _authenticatedRequest(method, endpoint, data = null) {
    if (!this.isConnected || !this.jwtToken) {
      throw new Error('Not connected to Angel One. Please authenticate first.');
    }
    
    try {
      const config = {
        method,
        url: endpoint,
        headers: {
          'Authorization': `Bearer ${this.jwtToken}`,
          'X-PrivateKey': this.apiKey,
        },
      };
      
      if (data) {
        config.data = data;
      }
      
      const response = await this.httpClient.request(config);
      
      if (!response.data || response.data.status === false) {
        throw new Error(response.data?.message || 'API request failed');
      }
      
      return response.data.data;
    } catch (error) {
      // Safe error handling
      if (error.response?.data) {
        const errorMsg = error.response.data.message || 'API request failed';
        throw new Error(errorMsg);
      } else {
        throw new Error('Network error');
      }
    }
  }

  /**
   * Get user profile
   * GET /rest/secure/angelbroking/user/v1/getProfile
   */
  async getProfile() {
    try {
      this._log('Fetching profile from Angel One...');
      
      const data = await this._authenticatedRequest(
        'GET',
        '/rest/secure/angelbroking/user/v1/getProfile'
      );
      
      return this._normalizeProfile(data);
    } catch (error) {
      this._error('Failed to fetch profile: ' + error.message);
      throw error;
    }
  }

  /**
   * Get funds/margin (RMS Limits)
   * GET /rest/secure/angelbroking/user/v1/getRMS
   */
  async getFunds() {
    try {
      this._log('Fetching funds from Angel One...');
      
      const data = await this._authenticatedRequest(
        'GET',
        '/rest/secure/angelbroking/user/v1/getRMS'
      );
      
      return this._normalizeFunds(data);
    } catch (error) {
      this._error('Failed to fetch funds: ' + error.message);
      throw error;
    }
  }

  /**
   * Get positions
   * GET /rest/secure/angelbroking/order/v1/getPosition
   */
  async getPositions() {
    try {
      this._log('Fetching positions from Angel One...');
      
      const data = await this._authenticatedRequest(
        'GET',
        '/rest/secure/angelbroking/order/v1/getPosition'
      );
      
      // Angel One returns an array of positions
      if (!data || !Array.isArray(data)) {
        return [];
      }
      
      return data.map(pos => this._normalizePosition(pos));
    } catch (error) {
      this._error('Failed to fetch positions: ' + error.message);
      throw error;
    }
  }

  /**
   * Get order book
   * GET /rest/secure/angelbroking/order/v1/getOrderBook
   */
  async getOrders() {
    try {
      this._log('Fetching orders from Angel One...');
      
      const data = await this._authenticatedRequest(
        'GET',
        '/rest/secure/angelbroking/order/v1/getOrderBook'
      );
      
      if (!data || !Array.isArray(data)) {
        return [];
      }
      
      return data.map(order => this._normalizeOrder(order));
    } catch (error) {
      this._error('Failed to fetch orders: ' + error.message);
      throw error;
    }
  }

  /**
   * Get holdings
   * GET /rest/secure/angelbroking/portfolio/v1/getHolding
   */
  async getHoldings() {
    try {
      this._log('Fetching holdings from Angel One...');
      
      const data = await this._authenticatedRequest(
        'GET',
        '/rest/secure/angelbroking/portfolio/v1/getHolding'
      );
      
      // Angel One returns holdings array
      const holdings = data?.holdings || [];
      
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
   * GET /rest/secure/angelbroking/order/v1/getTradeBook
   */
  async getTradeHistory() {
    try {
      this._log('Fetching trade history from Angel One...');
      
      const data = await this._authenticatedRequest(
        'GET',
        '/rest/secure/angelbroking/order/v1/getTradeBook'
      );
      
      if (!data || !Array.isArray(data)) {
        return [];
      }
      
      return data.map(trade => this._normalizeTrade(trade));
    } catch (error) {
      this._error('Failed to fetch trade history: ' + error.message);
      throw error;
    }
  }

  /**
   * Get market quotes
   * POST /rest/secure/angelbroking/market/v1/quote/
   */
  async getQuotes(symbols) {
    try {
      this._log('Fetching quotes from Angel One...', { symbolCount: symbols.length });
      
      // Angel One expects format: { mode: 'LTP/OHLC/FULL', exchangeTokens: {...} }
      // For simplicity, we'll fetch LTP for all symbols on NSE
      const payload = {
        mode: 'FULL',
        exchangeTokens: {
          NSE: symbols.map(s => s.toUpperCase()),
        },
      };
      
      const data = await this._authenticatedRequest(
        'POST',
        '/rest/secure/angelbroking/market/v1/quote/',
        payload
      );
      
      if (!data || !data.fetched) {
        return [];
      }
      
      return data.fetched.map(quote => this._normalizeQuote(quote));
    } catch (error) {
      this._error('Failed to fetch quotes: ' + error.message);
      throw error;
    }
  }

  // ============================================================
  // NORMALIZATION METHODS
  // Transform Angel One responses to RiskLoop models
  // ============================================================

  /**
   * Normalize Angel One profile to Account model
   */
  _normalizeProfile(angelData) {
    return new Account({
      brokerId: 'angelone',
      brokerName: 'Angel One',
      userId: angelData.clientcode || '',
      clientId: angelData.clientcode || '',
      name: angelData.name || '',
      email: angelData.email || '',
      mobile: angelData.mobileno || '',
      pan: this._maskPAN(angelData.pan),
      exchanges: angelData.exchanges || [],
      segments: this._mapSegments(angelData.products),
      products: angelData.products || [],
      accountStatus: 'ACTIVE',
      metadata: {
        broker: angelData.broker || '',
        lastlogintime: angelData.lastlogintime || '',
      },
    });
  }

  /**
   * Normalize Angel One RMS data to Funds model
   */
  _normalizeFunds(angelData) {
    const netAvailable = parseFloat(angelData.net) || 0;
    const marginUsed = parseFloat(angelData.marginused) || 0;
    
    return new Funds({
      segment: 'EQUITY',
      availableMargin: netAvailable,
      usedMargin: marginUsed,
      totalMargin: netAvailable + marginUsed,
      openingBalance: parseFloat(angelData.availablecash) || 0,
      netBalance: netAvailable,
      realizedPnl: 0, // Not provided by RMS API
      unrealizedPnl: 0, // Not provided by RMS API
      marginUsed: marginUsed,
      collateral: parseFloat(angelData.collateral) || 0,
      exposureMargin: parseFloat(angelData.exposuremargin) || 0,
      spanMargin: parseFloat(angelData.spanmargin) || 0,
      deliveryMargin: parseFloat(angelData.deliverymargin) || 0,
      metadata: {
        adhocMargin: angelData.adhocmargin,
        notionalCash: angelData.notionalcash,
        category: angelData.category,
      },
    });
  }

  /**
   * Normalize Angel One position to Position model
   */
  _normalizePosition(angelData) {
    const quantity = parseInt(angelData.netqty) || 0;
    const buyPrice = parseFloat(angelData.buyavgprice) || 0;
    const sellPrice = parseFloat(angelData.sellavgprice) || 0;
    const lastPrice = parseFloat(angelData.ltp) || 0;
    const pnl = parseFloat(angelData.pnl) || 0;
    const realizedPnl = parseFloat(angelData.realised) || 0;
    const unrealizedPnl = parseFloat(angelData.unrealised) || 0;
    
    return new Position({
      symbol: angelData.tradingsymbol || '',
      tradingSymbol: angelData.symboltoken || '',
      exchange: angelData.exchange || '',
      segment: this._mapProductType(angelData.producttype),
      product: angelData.producttype || '',
      instrumentType: angelData.instrumenttype || '',
      quantity: quantity,
      buyQuantity: parseInt(angelData.buyqty) || 0,
      sellQuantity: parseInt(angelData.sellqty) || 0,
      buyPrice: buyPrice,
      sellPrice: sellPrice,
      lastPrice: lastPrice,
      closePrice: parseFloat(angelData.close) || 0,
      pnl: pnl,
      realizedPnl: realizedPnl,
      unrealizedPnl: unrealizedPnl,
      pnlPercent: buyPrice > 0 ? ((pnl / (buyPrice * Math.abs(quantity))) * 100) : 0,
      lotSize: parseInt(angelData.lotsize) || 1,
      metadata: {
        symboltoken: angelData.symboltoken,
        expirydate: angelData.expirydate,
        strikeprice: angelData.strikeprice,
        optiontype: angelData.optiontype,
      },
    });
  }

  /**
   * Normalize Angel One order to Order model
   */
  _normalizeOrder(angelData) {
    return new Order({
      orderId: angelData.orderid || '',
      orderTag: angelData.ordertag || '',
      symbol: angelData.tradingsymbol || '',
      tradingSymbol: angelData.symboltoken || '',
      exchange: angelData.exchange || '',
      segment: this._mapProductType(angelData.producttype),
      product: angelData.producttype || '',
      instrumentType: angelData.instrumenttype || '',
      orderType: angelData.ordertype || '',
      transactionType: angelData.transactiontype || '',
      quantity: parseInt(angelData.quantity) || 0,
      filledQuantity: parseInt(angelData.filledshares) || 0,
      pendingQuantity: parseInt(angelData.unfilledshares) || 0,
      cancelledQuantity: parseInt(angelData.cancelsize) || 0,
      price: parseFloat(angelData.price) || 0,
      triggerPrice: parseFloat(angelData.triggerprice) || 0,
      averagePrice: parseFloat(angelData.averageprice) || 0,
      status: angelData.status || '',
      statusMessage: angelData.text || '',
      validity: angelData.duration || 'DAY',
      variety: angelData.variety || 'REGULAR',
      orderTimestamp: angelData.updatetime || '',
      updateTimestamp: angelData.updatetime || '',
      metadata: {
        symboltoken: angelData.symboltoken,
        ordertag: angelData.ordertag,
        variety: angelData.variety,
        squareoff: angelData.squareoff,
        stoploss: angelData.stoploss,
        trailingstoploss: angelData.trailingstoploss,
      },
    });
  }

  /**
   * Normalize Angel One holding to Holding model
   */
  _normalizeHolding(angelData) {
    const quantity = parseInt(angelData.quantity) || 0;
    const avgPrice = parseFloat(angelData.averageprice) || 0;
    const ltp = parseFloat(angelData.ltp) || 0;
    const pnl = parseFloat(angelData.profitandloss) || 0;
    
    return new Holding({
      symbol: angelData.tradingsymbol || '',
      tradingSymbol: angelData.symboltoken || '',
      isin: angelData.isin || '',
      exchange: angelData.exchange || '',
      quantity: quantity,
      t1Quantity: parseInt(angelData.t1quantity) || 0,
      authorizedQuantity: parseInt(angelData.authorisedquantity) || 0,
      collateralQuantity: parseInt(angelData.collateralquantity) || 0,
      averagePrice: avgPrice,
      lastPrice: ltp,
      closePrice: parseFloat(angelData.close) || 0,
      pnl: pnl,
      dayPnl: 0, // Calculate if needed
      pnlPercent: avgPrice > 0 ? ((pnl / (avgPrice * quantity)) * 100) : 0,
      investedValue: avgPrice * quantity,
      currentValue: ltp * quantity,
      metadata: {
        symboltoken: angelData.symboltoken,
        product: angelData.product,
        haircut: angelData.haircut,
      },
    });
  }

  /**
   * Normalize Angel One trade to Trade model
   */
  _normalizeTrade(angelData) {
    return new Trade({
      tradeId: angelData.tradeid || '',
      orderId: angelData.orderid || '',
      symbol: angelData.tradingsymbol || '',
      tradingSymbol: angelData.symboltoken || '',
      exchange: angelData.exchange || '',
      segment: this._mapProductType(angelData.producttype),
      product: angelData.producttype || '',
      instrumentType: angelData.instrumenttype || '',
      transactionType: angelData.transactiontype || '',
      quantity: parseInt(angelData.fillshares) || 0,
      price: parseFloat(angelData.fillprice) || 0,
      tradeValue: (parseInt(angelData.fillshares) || 0) * (parseFloat(angelData.fillprice) || 0),
      tradeDate: angelData.filltime ? angelData.filltime.split(' ')[0] : '',
      tradeTime: angelData.filltime ? angelData.filltime.split(' ')[1] : '',
      timestamp: angelData.filltime || '',
      metadata: {
        symboltoken: angelData.symboltoken,
        orderid: angelData.orderid,
      },
    });
  }

  /**
   * Normalize Angel One quote to Quote model
   */
  _normalizeQuote(angelData) {
    const ltp = parseFloat(angelData.ltp) || 0;
    const close = parseFloat(angelData.close) || 0;
    const change = ltp - close;
    const changePercent = close > 0 ? ((change / close) * 100) : 0;
    
    return new Quote({
      symbol: angelData.tradingsymbol || '',
      tradingSymbol: angelData.symboltoken || '',
      exchange: angelData.exchange || '',
      ltp: ltp,
      open: parseFloat(angelData.open) || 0,
      high: parseFloat(angelData.high) || 0,
      low: parseFloat(angelData.low) || 0,
      close: close,
      change: change,
      changePercent: changePercent,
      volume: parseInt(angelData.volume) || 0,
      upperCircuit: parseFloat(angelData.upperCircuit) || 0,
      lowerCircuit: parseFloat(angelData.lowerCircuit) || 0,
      lotSize: parseInt(angelData.lotsize) || 1,
      metadata: {
        symboltoken: angelData.symboltoken,
        openbuyqty: angelData.openbuyqty,
        opensellqty: angelData.opensellqty,
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
   * Map Angel One product types to segments
   */
  _mapProductType(productType) {
    const mapping = {
      'DELIVERY': 'EQUITY',
      'CARRYFORWARD': 'DERIVATIVE',
      'INTRADAY': 'EQUITY',
      'MARGIN': 'DERIVATIVE',
      'BO': 'EQUITY',
      'CO': 'EQUITY',
    };
    
    return mapping[productType] || 'EQUITY';
  }

  /**
   * Map Angel One products to segments
   */
  _mapSegments(products) {
    const segments = new Set();
    
    if (!Array.isArray(products)) return [];
    
    products.forEach(product => {
      if (product.includes('EQ')) segments.add('EQUITY');
      if (product.includes('FO') || product.includes('FUT') || product.includes('OPT')) {
        segments.add('DERIVATIVE');
      }
      if (product.includes('COM') || product.includes('MCX')) {
        segments.add('COMMODITY');
      }
    });
    
    return Array.from(segments);
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
    const sensitiveFields = ['token', 'jwt', 'refresh', 'feed', 'password', 'mpin', 'totp', 'secret', 'key'];
    
    Object.keys(sanitized).forEach(key => {
      if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
        sanitized[key] = '***REDACTED***';
      }
    });
    
    return sanitized;
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
  async cancelOrder(orderId, variety = 'NORMAL') {
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
    const validProducts = ['INTRADAY', 'DELIVERY', 'CARRYFORWARD', 'MARGIN', 'BO', 'CO'];
    if (order.product && !validProducts.includes(order.product)) {
      errors.push(`product must be one of: ${validProducts.join(', ')}`);
    }
    
    // Validate order type
    const validOrderTypes = ['MARKET', 'LIMIT', 'STOPLOSS_LIMIT', 'STOPLOSS_MARKET'];
    if (order.orderType && !validOrderTypes.includes(order.orderType)) {
      errors.push(`orderType must be one of: ${validOrderTypes.join(', ')}`);
    }
    
    if (errors.length > 0) {
      throw new Error(`Order validation failed: ${errors.join(', ')}`);
    }
  }

  /**
   * Normalize order response
   */
  _normalizeOrderResponse(angelData, originalRequest) {
    return new Order({
      orderId: angelData.orderid || '',
      orderTag: '',
      symbol: originalRequest.symbol,
      tradingSymbol: originalRequest.symbolToken || '',
      exchange: originalRequest.exchange || 'NSE',
      segment: this._mapProductType(originalRequest.product),
      product: originalRequest.product || 'INTRADAY',
      instrumentType: originalRequest.instrumentType || '',
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
      validity: originalRequest.duration || 'DAY',
      variety: originalRequest.variety || 'NORMAL',
      orderTimestamp: new Date().toISOString(),
      updateTimestamp: new Date().toISOString(),
      metadata: {
        angelOrderId: angelData.orderid,
        originalRequest: originalRequest,
      },
    });
  }
}
