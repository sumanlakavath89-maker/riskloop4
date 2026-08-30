/**
 * RiskLoop Broker API Client
 * Frontend module for communicating with the RiskLoop backend broker integration API
 * 
 * SECURITY: Never expose broker credentials, API keys, or tokens in this file.
 * All authentication happens server-side via the backend API.
 */

const BACKEND_URL = (typeof window !== 'undefined' && window.API_BASE_URL) || 'http://localhost:3000';

/**
 * Broker API client for frontend-backend communication
 */
class BrokerAPI {
  constructor() {
    this.connectedBrokers = new Map(); // Map of brokerId -> broker data
    this.listeners = new Map(); // Event listeners for connection state changes
  }

  /**
   * Fetch wrapper with error handling
   */
  async fetch(endpoint, options = {}) {
    try {
      const response = await fetch(`${BACKEND_URL}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || `HTTP ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error(`API Error [${endpoint}]:`, error);
      throw error;
    }
  }

  /**
   * Check backend health
   */
  async checkHealth() {
    try {
      const data = await this.fetch('/health');
      return data.success === true;
    } catch (error) {
      console.error('Backend health check failed:', error);
      return false;
    }
  }

  /**
   * Get list of available brokers from backend
   */
  async getBrokers() {
    try {
      const data = await this.fetch('/api/brokers');
      return data.data || [];
    } catch (error) {
      console.error('Failed to fetch brokers:', error);
      return [];
    }
  }

  /**
   * Get broker connection status
   */
  async getConnectionStatus(brokerId) {
    try {
      const data = await this.fetch(`/api/auth/status/${brokerId}`);
      return data.data?.connected || false;
    } catch (error) {
      console.error(`Failed to check ${brokerId} status:`, error);
      return false;
    }
  }

  /**
   * Connect to a broker (Angel One specific)
   * Credentials are handled server-side via environment variables
   */
  async connect(brokerId) {
    try {
      // For Angel One, credentials are configured server-side
      // The frontend only needs to trigger the connection
      const data = await this.fetch('/api/auth/connect', {
        method: 'POST',
        body: JSON.stringify({
          brokerId,
          credentials: {}, // Empty - server uses .env credentials
        }),
      });

      if (data.success) {
        this.connectedBrokers.set(brokerId, data.data);
        this.notifyListeners('connected', brokerId, data.data);
        
        // Automatically connect WebSocket for real-time updates
        await this._connectWebSocket(brokerId);
        
        return { success: true, data: data.data };
      }

      return { success: false, error: data.error };
    } catch (error) {
      const errorMessage = this.parseError(error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Connect WebSocket for real-time updates
   */
  async _connectWebSocket(brokerId) {
    try {
      if (window.webSocketClient) {
        await window.webSocketClient.connect(brokerId);
        
        // Subscribe to order feed for trade execution updates
        await window.webSocketClient.subscribeOrderFeed(brokerId);
        
        // Listen for execution updates (actual trades)
        window.webSocketClient.onExecution((tradeData) => {
          console.log('[BrokerAPI] Trade execution received:', tradeData);
          this.notifyListeners('tradeExecution', brokerId, tradeData);
        });

        // Listen for connection state changes
        window.webSocketClient.onConnectionStateChange((broker, state, data) => {
          console.log(`[BrokerAPI] WebSocket ${state} for ${broker}`);
          this.notifyListeners('websocketState', broker, { state, data });
        });
      }
    } catch (error) {
      console.error('[BrokerAPI] WebSocket connection error:', error);
      // Don't fail the main connection if WebSocket fails
    }
  }

  /**
   * Disconnect from a broker
   */
  async disconnect(brokerId) {
    try {
      // Disconnect WebSocket first
      if (window.webSocketClient && window.webSocketClient.isConnected(brokerId)) {
        await window.webSocketClient.disconnect(brokerId);
      }

      const data = await this.fetch('/api/auth/disconnect', {
        method: 'POST',
        body: JSON.stringify({ brokerId }),
      });

      if (data.success) {
        this.connectedBrokers.delete(brokerId);
        this.notifyListeners('disconnected', brokerId);
        return { success: true };
      }

      return { success: false, error: data.error };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get account profile
   */
  async getProfile(brokerId) {
    try {
      const data = await this.fetch(`/api/account/profile?brokerId=${brokerId}`);
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: this.parseError(error) };
    }
  }

  /**
   * Get available funds
   */
  async getFunds(brokerId) {
    try {
      const data = await this.fetch(`/api/account/funds?brokerId=${brokerId}`);
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: this.parseError(error) };
    }
  }

  /**
   * Get current positions
   */
  async getPositions(brokerId) {
    try {
      const data = await this.fetch(`/api/positions?brokerId=${brokerId}`);
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: this.parseError(error) };
    }
  }

  /**
   * Get orders
   */
  async getOrders(brokerId) {
    try {
      const data = await this.fetch(`/api/orders?brokerId=${brokerId}`);
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: this.parseError(error) };
    }
  }

  /**
   * Get holdings
   */
  async getHoldings(brokerId) {
    try {
      const data = await this.fetch(`/api/holdings?brokerId=${brokerId}`);
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: this.parseError(error) };
    }
  }

  /**
   * Get trades
   */
  async getTrades(brokerId) {
    try {
      const data = await this.fetch(`/api/trades?brokerId=${brokerId}`);
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: this.parseError(error) };
    }
  }

  /**
   * Get quotes
   */
  async getQuotes(brokerId, symbols) {
    try {
      const data = await this.fetch(`/api/quotes?brokerId=${brokerId}`, {
        method: 'POST',
        body: JSON.stringify({ symbols }),
      });
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: this.parseError(error) };
    }
  }

  // ============================================================
  // ORDER PLACEMENT METHODS
  // ============================================================

  /**
   * Place order
   * CRITICAL: This creates an ORDER, NOT a Trade.
   * Only broker-confirmed execution creates a Trade.
   */
  async placeOrder(brokerId, orderRequest) {
    try {
      console.log('[BrokerAPI] Placing order:', { brokerId, orderRequest });
      
      // Validate required fields
      if (!orderRequest.symbol || !orderRequest.side || !orderRequest.quantity) {
        throw new Error('Missing required fields: symbol, side, quantity');
      }

      const data = await this.fetch(`/api/orders?brokerId=${brokerId}`, {
        method: 'POST',
        body: JSON.stringify(orderRequest),
      });

      if (data.success) {
        console.log('[BrokerAPI] Order placed:', data.data);
        
        // Notify listeners of new order (NOT a trade)
        this.notifyListeners('orderPlaced', brokerId, data.data);
        
        return { success: true, data: data.data };
      }

      return { success: false, error: data.error };
    } catch (error) {
      console.error('[BrokerAPI] Order placement failed:', error);
      return { success: false, error: this.parseError(error) };
    }
  }

  /**
   * Modify existing order
   */
  async modifyOrder(brokerId, orderId, modifications) {
    try {
      console.log('[BrokerAPI] Modifying order:', { brokerId, orderId, modifications });
      
      const data = await this.fetch(`/api/orders/${orderId}?brokerId=${brokerId}`, {
        method: 'PUT',
        body: JSON.stringify(modifications),
      });

      if (data.success) {
        console.log('[BrokerAPI] Order modified:', data.data);
        
        // Notify listeners of order modification
        this.notifyListeners('orderModified', brokerId, data.data);
        
        return { success: true, data: data.data };
      }

      return { success: false, error: data.error };
    } catch (error) {
      console.error('[BrokerAPI] Order modification failed:', error);
      return { success: false, error: this.parseError(error) };
    }
  }

  /**
   * Cancel existing order
   */
  async cancelOrder(brokerId, orderId, variety = 'NORMAL') {
    try {
      console.log('[BrokerAPI] Cancelling order:', { brokerId, orderId });
      
      const data = await this.fetch(`/api/orders/${orderId}?brokerId=${brokerId}&variety=${variety}`, {
        method: 'DELETE',
      });

      if (data.success) {
        console.log('[BrokerAPI] Order cancelled:', data.data);
        
        // Notify listeners of order cancellation
        this.notifyListeners('orderCancelled', brokerId, data.data);
        
        return { success: true, data: data.data };
      }

      return { success: false, error: data.error };
    } catch (error) {
      console.error('[BrokerAPI] Order cancellation failed:', error);
      return { success: false, error: this.parseError(error) };
    }
  }

  /**
   * Get order book with real-time updates via WebSocket
   * This method fetches current orders and sets up WebSocket for live updates
   */
  async getOrdersWithUpdates(brokerId) {
    try {
      // Get current orders
      const ordersResult = await this.getOrders(brokerId);
      
      if (!ordersResult.success) {
        return ordersResult;
      }

      // Setup WebSocket listeners for order updates if not already done
      if (window.webSocketClient && !this._orderUpdateListenersSetup) {
        this._setupOrderUpdateListeners();
        this._orderUpdateListenersSetup = true;
      }

      return ordersResult;
    } catch (error) {
      return { success: false, error: this.parseError(error) };
    }
  }

  /**
   * Setup WebSocket listeners for real-time order updates
   */
  _setupOrderUpdateListeners() {
    if (!window.webSocketClient) return;

    // Order status updates (PENDING, EXECUTED, CANCELLED, etc.)
    window.webSocketClient.onOrderUpdate((orderData) => {
      console.log('[BrokerAPI] Order update received:', orderData);
      this.notifyListeners('orderUpdate', orderData.brokerId, orderData);
    });

    // Trade executions (only when broker confirms execution)
    window.webSocketClient.onTradeExecution((tradeData) => {
      console.log('[BrokerAPI] Trade execution confirmed by broker:', tradeData);
      this.notifyListeners('tradeExecution', tradeData.brokerId, tradeData);
    });

    // Position updates (resulting from trade executions)
    window.webSocketClient.onPositionUpdate((positionData) => {
      console.log('[BrokerAPI] Position update:', positionData);
      this.notifyListeners('positionUpdate', positionData.brokerId, positionData);
    });
  }

  /**
   * Parse error messages to user-friendly format
   */
  parseError(error) {
    const message = error.message || String(error);

    // Map backend errors to user-friendly messages
    if (message.includes('ECONNREFUSED') || message.includes('Failed to fetch')) {
      return 'Backend server is not running. Please start the backend with "npm run dev" in the backend folder.';
    }

    if (message.includes('Not connected')) {
      return 'Not connected to broker. Please connect first.';
    }

    if (message.includes('Authentication failed') || message.includes('Invalid credentials')) {
      return 'Authentication failed. Please check your credentials in the backend .env file.';
    }

    if (message.includes('timeout')) {
      return 'Request timed out. Please try again.';
    }

    if (message.includes('Network')) {
      return 'Network error. Please check your internet connection.';
    }

    // Order-specific errors
    if (message.includes('Order validation failed')) {
      return `Order validation error: ${message}`;
    }

    if (message.includes('Insufficient funds') || message.includes('insufficient margin')) {
      return 'Insufficient funds or margin to place this order.';
    }

    if (message.includes('Invalid symbol') || message.includes('symbol not found')) {
      return 'Invalid or unrecognized trading symbol.';
    }

    if (message.includes('Market closed') || message.includes('trading not allowed')) {
      return 'Market is closed or trading is not allowed for this symbol.';
    }

    if (message.includes('Order not found') || message.includes('invalid order id')) {
      return 'Order not found or invalid order ID.';
    }

    if (message.includes('Cannot modify') || message.includes('modification not allowed')) {
      return 'Order cannot be modified in its current state.';
    }

    if (message.includes('Cannot cancel') || message.includes('cancellation not allowed')) {
      return 'Order cannot be cancelled in its current state.';
    }

    // Return original message if no mapping found
    return message;
  }

  /**
   * Check if a broker is connected
   */
  isConnected(brokerId) {
    return this.connectedBrokers.has(brokerId);
  }

  /**
   * Get connected broker data
   */
  getConnectedBroker(brokerId) {
    return this.connectedBrokers.get(brokerId);
  }

  /**
   * Get all connected brokers
   */
  getAllConnectedBrokers() {
    return Array.from(this.connectedBrokers.values());
  }

  /**
   * Add event listener for connection state changes
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  /**
   * Remove event listener
   */
  off(event, callback) {
    if (!this.listeners.has(event)) return;
    const callbacks = this.listeners.get(event);
    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
    }
  }

  /**
   * Notify listeners of connection state changes
   */
  notifyListeners(event, brokerId, data = null) {
    if (!this.listeners.has(event)) return;
    this.listeners.get(event).forEach(callback => {
      try {
        callback(brokerId, data);
      } catch (error) {
        console.error('Listener error:', error);
      }
    });
  }
}

// Export singleton instance
window.brokerAPI = new BrokerAPI();
