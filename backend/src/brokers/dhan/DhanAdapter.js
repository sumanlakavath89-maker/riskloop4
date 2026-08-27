/**
 * Dhan Broker Adapter
 * Real implementation with authentication, read operations, and order placement
 * 
 * Official Docs: https://dhanhq.co/docs/v2/
 * Base URL: https://api.dhan.co/v2
 */

import axios from 'axios';
import { BaseBrokerAdapter } from '../BaseBrokerAdapter.js';
import { Account, Position, Order, Funds, Holding, Quote, Trade } from '../../models/index.js';
import { DhanWebSocket } from './DhanWebSocket.js';

export class DhanAdapter extends BaseBrokerAdapter {
  constructor(config = {}) {
    super({
      brokerId: 'dhan',
      brokerName: 'Dhan',
      ...config,
    });
    
    // Load credentials from environment or config
    this.clientId = config.clientId || process.env.DHAN_CLIENT_ID;
    this.accessToken = config.accessToken || process.env.DHAN_ACCESS_TOKEN;
    
    // Dhan API configuration
    this.baseUrl = 'https://api.dhan.co/v2';
    
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
    
    if (!this.clientId) errors.push('DHAN_CLIENT_ID is required');
    if (!this.accessToken) errors.push('DHAN_ACCESS_TOKEN is required');
    
    if (errors.length > 0) {
      throw new Error(`Dhan configuration error: ${errors.join(', ')}`);
    }
  }

  /**
   * Connect and authenticate with Dhan
   * For Dhan, access token is obtained externally (from web.dhan.co or TOTP API)
   * This method validates the token by fetching profile
   */
  async connect(credentials = {}) {
    try {
      this._log('Connecting to Dhan API...');
      
      // Use provided credentials or fall back to env vars
      if (credentials.clientId) this.clientId = credentials.clientId;
      if (credentials.accessToken) this.accessToken = credentials.accessToken;
      
      // Validate configuration
      this._validateConfig();
      
      // Test connection by fetching profile
      const profile = await this.getProfile();
      
      if (!profile || !profile.userId) {
        throw new Error('Invalid access token or client ID');
      }
      
      this.isConnected = true;
      
      // Initialize WebSocket instance (but don't connect yet)
      this.webSocket = new DhanWebSocket({
        accessToken: this.accessToken,
        clientId: this.clientId,
        brokerId: this.brokerId,
      });
      
      this._log('Successfully connected to Dhan');
      
      return this.isConnected;
    } catch (error) {
      this.isConnected = false;
      
      // Safe error handling - never expose credentials
      if (error.response?.data) {
        const errorMsg = error.response.data.message || error.response.data.remarks || 'Authentication failed';
        this._error('Connection failed: ' + errorMsg);
        throw new Error(errorMsg);
      } else {
        this._error('Connection failed: ' + error.message);
        throw new Error('Unable to connect to Dhan: ' + error.message);
      }
    }
  }

  /**
   * Disconnect and clear session
   */
  async disconnect() {
    try {
      this._log('Disconnecting from Dhan...');
      
      // Dhan doesn't have explicit logout API
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
      throw new Error('Not connected to Dhan. Please authenticate first.');
    }
    
    if (!this.webSocket) {
      this.webSocket = new DhanWebSocket({
        accessToken: this.accessToken,
        clientId: this.clientId,
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
      throw new Error('Not connected to Dhan. Please authenticate first.');
    }
    
    try {
      const config = {
        method,
        url: endpoint,
        headers: {
          'access-token': this.accessToken,
          'dhanClientId': this.clientId,
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
      
      // Dhan API returns data directly or in 'data' field
      return response.data;
    } catch (error) {
      // Safe error handling
      if (error.response?.data) {
        const errorMsg = error.response.data.message || error.response.data.remarks || 'API request failed';
        throw new Error(errorMsg);
      } else {
        throw new Error('Network error: ' + error.message);
      }
    }
  }

  /**
   * Get user profile
   * GET /v2/profile
   */
  async getProfile() {
    try {
      this._log('Fetching profile from Dhan...');
      
      const data = await this._authenticatedRequest('GET', '/profile');
      
      return this._normalizeProfile(data);
    } catch (error) {
      this._error('Failed to fetch profile: ' + error.message);
      throw error;
    }
  }

  /**
   * Get funds/margin
   * GET /v2/fundlimit
   */
  async getFunds() {
    try {
      this._log('Fetching funds from Dhan...');
      
      const data = await this._authenticatedRequest('GET', '/fundlimit');
      
      return this._normalizeFunds(data);
    } catch (error) {
      this._error('Failed to fetch funds: ' + error.message);
      throw error;
    }
  }

  /**
   * Get positions
   * GET /v2/positions
   */
  async getPositions() {
    try {
      this._log('Fetching positions from Dhan...');
      
      const data = await this._authenticatedRequest('GET', '/positions');
      
      // Dhan returns array directly
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
   * GET /v2/orders
   */
  async getOrders() {
    try {
      this._log('Fetching orders from Dhan...');
      
      const data = await this._authenticatedRequest('GET', '/orders');
      
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
   * GET /v2/holdings
   */
  async getHoldings() {
    try {
      this._log('Fetching holdings from Dhan...');
      
      const data = await this._authenticatedRequest('GET', '/holdings');
      
      if (!data || !Array.isArray(data)) {
        return [];
      }
      
      return data.map(holding => this._normalizeHolding(holding));
    } catch (error) {
      this._error('Failed to fetch holdings: ' + error.message);
      throw error;
    }
  }

  /**
   * Get trade history
   * GET /v2/tradebook
   */
  async getTradeHistory() {
    try {
      this._log('Fetching trade history from Dhan...');
      
      const data = await this._authenticatedRequest('GET', '/tradebook');
      
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
   * POST /v2/marketfeed/quote
   */
  async getQuotes(symbols) {
    try {
      this._log('Fetching quotes from Dhan...', { symbolCount: symbols.length });
      
      // Dhan expects security IDs (numeric)
      // For now, we'll need to map symbols to security IDs
      // This is a limitation - symbols must be in Dhan format
      const data = await this._authenticatedRequest(
        'POST',
        '/marketfeed/quote',
        { symbols: symbols }
      );
      
      if (!data || !data.data) {
        return [];
      }
      
      return data.data.map(quote => this._normalizeQuote(quote));
    } catch (error) {
      this._error('Failed to fetch quotes: ' + error.message);
      throw error;
    }
  }

  // ============================================================
  // NORMALIZATION METHODS
  // Transform Dhan responses to RiskLoop models
  // ============================================================

  /**
   * Normalize Dhan profile to Account model
   */
  _normalizeProfile(dhanData) {
    return new Account({
      brokerId: 'dhan',
      brokerName: 'Dhan',
      userId: dhanData.dhanClientId || this.clientId,
      clientId: dhanData.dhanClientId || this.clientId,
      name: '', // Not provided in profile API
      email: '',
      mobile: '',
      pan: '',
      exchanges: this._parseSegments(dhanData.activeSegment),
      segments: this._parseSegments(dhanData.activeSegment),
      products: [],
      accountStatus: 'ACTIVE',
      metadata: {
        tokenValidity: dhanData.tokenValidity,
        ddpi: dhanData.ddpi,
        mtf: dhanData.mtf,
        dataPlan: dhanData.dataPlan,
        dataValidity: dhanData.dataValidity,
      },
    });
  }

  /**
   * Normalize Dhan funds to Funds model
   */
  _normalizeFunds(dhanData) {
    return new Funds({
      segment: 'EQUITY',
      availableMargin: parseFloat(dhanData.availabelBalance) || parseFloat(dhanData.availableBalance) || 0,
      usedMargin: parseFloat(dhanData.utilizedAmount) || 0,
      totalMargin: parseFloat(dhanData.totalBalance) || 0,
      openingBalance: parseFloat(dhanData.sodLimit) || 0,
      netBalance: parseFloat(dhanData.availabelBalance) || parseFloat(dhanData.availableBalance) || 0,
      realizedPnl: parseFloat(dhanData.realizedPL) || 0,
      unrealizedPnl: parseFloat(dhanData.unrealizedPL) || 0,
      marginUsed: parseFloat(dhanData.utilizedAmount) || 0,
      collateral: parseFloat(dhanData.collateralAmount) || 0,
      exposureMargin: parseFloat(dhanData.exposureMargin) || 0,
      spanMargin: 0,
      deliveryMargin: parseFloat(dhanData.deliveryMargin) || 0,
      metadata: {
        blockedPayinAmount: dhanData.blockedPayinAmount,
        blockedPayoutAmount: dhanData.blockedPayoutAmount,
      },
    });
  }

  /**
   * Normalize Dhan position to Position model
   */
  _normalizePosition(dhanData) {
    const quantity = parseInt(dhanData.netQty) || 0;
    const buyAvg = parseFloat(dhanData.buyAvg) || 0;
    const sellAvg = parseFloat(dhanData.sellAvg) || 0;
    const ltp = parseFloat(dhanData.ltp) || 0;
    const realizedProfit = parseFloat(dhanData.realizedProfit) || 0;
    const unrealizedProfit = parseFloat(dhanData.unrealizedProfit) || 0;
    const totalProfit = realizedProfit + unrealizedProfit;
    
    return new Position({
      symbol: dhanData.tradingSymbol || '',
      tradingSymbol: dhanData.securityId || '',
      exchange: this._mapExchangeSegment(dhanData.exchangeSegment),
      segment: this._mapProductType(dhanData.productType),
      product: dhanData.productType || '',
      instrumentType: dhanData.instrumentType || '',
      quantity: quantity,
      buyQuantity: parseInt(dhanData.buyQty) || 0,
      sellQuantity: parseInt(dhanData.sellQty) || 0,
      buyPrice: buyAvg,
      sellPrice: sellAvg,
      lastPrice: ltp,
      closePrice: parseFloat(dhanData.closePrice) || 0,
      pnl: totalProfit,
      realizedPnl: realizedProfit,
      unrealizedPnl: unrealizedProfit,
      pnlPercent: buyAvg > 0 ? ((totalProfit / (buyAvg * Math.abs(quantity))) * 100) : 0,
      lotSize: parseInt(dhanData.multiplier) || 1,
      metadata: {
        securityId: dhanData.securityId,
        positionType: dhanData.positionType,
        exchangeSegment: dhanData.exchangeSegment,
      },
    });
  }

  /**
   * Normalize Dhan order to Order model
   */
  _normalizeOrder(dhanData) {
    return new Order({
      orderId: dhanData.orderId || dhanData.dhanOrderId || '',
      orderTag: dhanData.tag || '',
      symbol: dhanData.tradingSymbol || '',
      tradingSymbol: dhanData.securityId || '',
      exchange: this._mapExchangeSegment(dhanData.exchangeSegment),
      segment: this._mapProductType(dhanData.productType),
      product: dhanData.productType || '',
      instrumentType: '',
      orderType: this._mapOrderType(dhanData.orderType),
      transactionType: this._mapTransactionType(dhanData.transactionType),
      quantity: parseInt(dhanData.quantity) || 0,
      filledQuantity: parseInt(dhanData.filledQty) || 0,
      pendingQuantity: (parseInt(dhanData.quantity) || 0) - (parseInt(dhanData.filledQty) || 0),
      cancelledQuantity: 0,
      price: parseFloat(dhanData.price) || 0,
      triggerPrice: parseFloat(dhanData.triggerPrice) || 0,
      averagePrice: parseFloat(dhanData.tradedPrice) || 0,
      status: this._mapOrderStatus(dhanData.orderStatus),
      statusMessage: dhanData.remarks || '',
      validity: dhanData.validity || 'DAY',
      variety: dhanData.orderType || 'REGULAR',
      orderTimestamp: dhanData.createTime || '',
      updateTimestamp: dhanData.updateTime || '',
      metadata: {
        dhanOrderId: dhanData.dhanOrderId || dhanData.orderId,
        exchangeOrderId: dhanData.exchangeOrderId,
        boLegOrderId: dhanData.boLegOrderId,
        algoId: dhanData.algoId,
      },
    });
  }

  /**
   * Normalize Dhan holding to Holding model
   */
  _normalizeHolding(dhanData) {
    const quantity = parseInt(dhanData.totalQty) || 0;
    const avgCost = parseFloat(dhanData.avgCostPrice) || 0;
    const ltp = parseFloat(dhanData.ltp) || 0;
    const unrealizedPnl = (ltp - avgCost) * quantity;
    
    return new Holding({
      symbol: dhanData.tradingSymbol || '',
      tradingSymbol: dhanData.securityId || '',
      isin: dhanData.isin || '',
      exchange: this._mapExchangeSegment(dhanData.exchangeSegment),
      quantity: quantity,
      t1Quantity: parseInt(dhanData.t1Qty) || 0,
      authorizedQuantity: parseInt(dhanData.dpQty) || 0,
      collateralQuantity: parseInt(dhanData.collateralQty) || 0,
      averagePrice: avgCost,
      lastPrice: ltp,
      closePrice: 0,
      pnl: unrealizedPnl,
      dayPnl: 0,
      pnlPercent: avgCost > 0 ? ((unrealizedPnl / (avgCost * quantity)) * 100) : 0,
      investedValue: avgCost * quantity,
      currentValue: ltp * quantity,
      metadata: {
        securityId: dhanData.securityId,
        exchangeSegment: dhanData.exchangeSegment,
      },
    });
  }

  /**
   * Normalize Dhan trade to Trade model
   */
  _normalizeTrade(dhanData) {
    const quantity = parseInt(dhanData.tradedQty) || 0;
    const price = parseFloat(dhanData.tradedPrice) || 0;
    
    return new Trade({
      tradeId: dhanData.exchangeTradeId || dhanData.dhanOrderId || '',
      orderId: dhanData.orderId || dhanData.dhanOrderId || '',
      symbol: dhanData.tradingSymbol || '',
      tradingSymbol: dhanData.securityId || '',
      exchange: this._mapExchangeSegment(dhanData.exchangeSegment),
      segment: this._mapProductType(dhanData.productType),
      product: dhanData.productType || '',
      instrumentType: '',
      transactionType: this._mapTransactionType(dhanData.transactionType),
      quantity: quantity,
      price: price,
      tradeValue: quantity * price,
      tradeDate: dhanData.createTime ? dhanData.createTime.split(' ')[0] : '',
      tradeTime: dhanData.createTime ? dhanData.createTime.split(' ')[1] : '',
      timestamp: dhanData.createTime || '',
      metadata: {
        dhanOrderId: dhanData.dhanOrderId || dhanData.orderId,
        exchangeOrderId: dhanData.exchangeOrderId,
        exchangeTradeId: dhanData.exchangeTradeId,
      },
    });
  }

  /**
   * Normalize Dhan quote to Quote model
   */
  _normalizeQuote(dhanData) {
    const ltp = parseFloat(dhanData.LTP) || 0;
    const close = parseFloat(dhanData.prevClose) || parseFloat(dhanData.close) || 0;
    const change = ltp - close;
    const changePercent = close > 0 ? ((change / close) * 100) : 0;
    
    return new Quote({
      symbol: dhanData.tradingSymbol || '',
      tradingSymbol: dhanData.securityId || '',
      exchange: this._mapExchangeSegment(dhanData.exchangeSegment),
      ltp: ltp,
      open: parseFloat(dhanData.open) || 0,
      high: parseFloat(dhanData.high) || 0,
      low: parseFloat(dhanData.low) || 0,
      close: close,
      change: change,
      changePercent: changePercent,
      volume: parseInt(dhanData.volume) || 0,
      upperCircuit: parseFloat(dhanData.UC) || 0,
      lowerCircuit: parseFloat(dhanData.LC) || 0,
      lotSize: parseInt(dhanData.lotSize) || 1,
      metadata: {
        securityId: dhanData.securityId,
        OI: dhanData.OI,
        prevOI: dhanData.prevOI,
      },
    });
  }

  // ============================================================
  // UTILITY METHODS
  // ============================================================

  /**
   * Parse segments from comma-separated string
   */
  _parseSegments(segmentString) {
    if (!segmentString) return [];
    return segmentString.split(',').map(s => s.trim());
  }

  /**
   * Map Dhan exchange segment to RiskLoop format
   */
  _mapExchangeSegment(exchangeSegment) {
    const mapping = {
      'NSE_EQ': 'NSE',
      'NSE_FNO': 'NSE',
      'NSE_CURRENCY': 'NSE',
      'BSE_EQ': 'BSE',
      'BSE_FNO': 'BSE',
      'BSE_CURRENCY': 'BSE',
      'MCX_COMM': 'MCX',
    };
    
    return mapping[exchangeSegment] || exchangeSegment || '';
  }

  /**
   * Map Dhan product type to segments
   */
  _mapProductType(productType) {
    const mapping = {
      'CNC': 'EQUITY',
      'INTRADAY': 'EQUITY',
      'MARGIN': 'DERIVATIVE',
      'MTF': 'EQUITY',
      'CO': 'EQUITY',
      'BO': 'EQUITY',
    };
    
    return mapping[productType] || 'EQUITY';
  }

  /**
   * Map Dhan order type to RiskLoop order type
   */
  _mapOrderType(dhanOrderType) {
    const mapping = {
      'LIMIT': 'LIMIT',
      'MARKET': 'MARKET',
      'STOP_LOSS': 'STOP_LIMIT',
      'STOP_LOSS_MARKET': 'STOP_MARKET',
    };
    
    return mapping[dhanOrderType] || dhanOrderType || 'MARKET';
  }

  /**
   * Map Dhan transaction type to RiskLoop transaction type
   */
  _mapTransactionType(dhanTransactionType) {
    const mapping = {
      'BUY': 'BUY',
      'SELL': 'SELL',
    };
    
    return mapping[dhanTransactionType] || dhanTransactionType || '';
  }

  /**
   * Map Dhan order status to RiskLoop status
   */
  _mapOrderStatus(dhanStatus) {
    const mapping = {
      'PENDING': 'PENDING',
      'TRANSIT': 'PENDING',
      'TRADED': 'EXECUTED',
      'PARTIALLY_TRADED': 'PARTIALLY_FILLED',
      'REJECTED': 'REJECTED',
      'CANCELLED': 'CANCELLED',
      'EXPIRED': 'EXPIRED',
    };
    
    return mapping[dhanStatus] || dhanStatus || 'UNKNOWN';
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
    const sensitiveFields = ['token', 'access', 'password', 'pin', 'totp', 'secret', 'key'];
    
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
    
    if (!order.symbol && !order.securityId) errors.push('symbol or securityId is required');
    if (!order.side || !['BUY', 'SELL'].includes(order.side)) errors.push('side must be BUY or SELL');
    if (!order.quantity || order.quantity <= 0) errors.push('quantity must be positive');
    if (order.orderType === 'LIMIT' && (!order.price || order.price <= 0)) errors.push('price is required for LIMIT orders');
    
    // Validate product type
    const validProducts = ['INTRADAY', 'CNC', 'MARGIN', 'MTF', 'CO', 'BO'];
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
   * Reverse map RiskLoop order type to Dhan order type
   */
  _reverseMapOrderType(orderType) {
    const mapping = {
      'MARKET': 'MARKET',
      'LIMIT': 'LIMIT',
      'STOP_MARKET': 'STOP_LOSS_MARKET',
      'STOP_LIMIT': 'STOP_LOSS',
    };
    
    return mapping[orderType] || 'MARKET';
  }

  /**
   * Normalize order response
   */
  _normalizeOrderResponse(dhanResponse, originalRequest) {
    const orderId = dhanResponse.orderId || dhanResponse.dhanOrderId || '';
    
    return new Order({
      orderId: orderId,
      orderTag: originalRequest.orderTag || '',
      symbol: originalRequest.symbol || '',
      tradingSymbol: originalRequest.securityId || originalRequest.symbolToken || '',
      exchange: this._mapExchangeSegment(originalRequest.exchangeSegment || 'NSE_EQ'),
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
        dhanOrderId: orderId,
        originalRequest: originalRequest,
      },
    });
  }
}
