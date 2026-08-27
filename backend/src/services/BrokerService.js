/**
 * Broker Service
 * Central service for managing broker adapters
 * Provides broker registry, adapter factory, and session management
 */

import {
  AngelOneAdapter,
  FyersAdapter,
  DhanAdapter,
  UpstoxAdapter,
  ShoonyaAdapter,
  AliceBlueAdapter,
  KotakNeoAdapter,
  SamcoAdapter,
  MT5Adapter,
} from '../brokers/index.js';

class BrokerService {
  constructor() {
    // Registry of available brokers
    this.brokers = {
      angelone: {
        id: 'angelone',
        name: 'Angel One',
        type: 'indian',
        adapter: AngelOneAdapter,
        logo: '/logos/angleone.png',
        enabled: true,
      },
      fyers: {
        id: 'fyers',
        name: 'FYERS',
        type: 'indian',
        adapter: FyersAdapter,
        logo: '/logos/fyers.png',
        enabled: true,
      },
      dhan: {
        id: 'dhan',
        name: 'Dhan',
        type: 'indian',
        adapter: DhanAdapter,
        logo: '/logos/dhan.png',
        enabled: true,
      },
      upstox: {
        id: 'upstox',
        name: 'Upstox',
        type: 'indian',
        adapter: UpstoxAdapter,
        logo: '/logos/upstocks.png',
        enabled: true,
      },
      shoonya: {
        id: 'shoonya',
        name: 'Shoonya',
        type: 'indian',
        adapter: ShoonyaAdapter,
        logo: '/logos/shoonya.png',
        enabled: true,
      },
      aliceblue: {
        id: 'aliceblue',
        name: 'Alice Blue',
        type: 'indian',
        adapter: AliceBlueAdapter,
        logo: '/logos/aliceblue.png',
        enabled: true,
      },
      kotakneo: {
        id: 'kotakneo',
        name: 'Kotak Neo',
        type: 'indian',
        adapter: KotakNeoAdapter,
        logo: '/logos/kotak neo.png',
        enabled: true,
      },
      samco: {
        id: 'samco',
        name: 'SAMCO',
        type: 'indian',
        adapter: SamcoAdapter,
        logo: '/logos/samco.png',
        enabled: true,
      },
      mt5: {
        id: 'mt5',
        name: 'MetaTrader 5',
        type: 'forex',
        adapter: MT5Adapter,
        logo: '/logos/MetaTrader_5.png',
        enabled: true,
      },
      icmarkets: {
        id: 'icmarkets',
        name: 'IC Markets',
        type: 'forex',
        adapter: MT5Adapter,
        logo: '/logos/ic markets.png',
        enabled: true,
        isMT5: true,
      },
      pepperstone: {
        id: 'pepperstone',
        name: 'Pepperstone',
        type: 'forex',
        adapter: MT5Adapter,
        logo: '/logos/pepperstone.png',
        enabled: true,
        isMT5: true,
      },
      fpmarkets: {
        id: 'fpmarkets',
        name: 'FP Markets',
        type: 'forex',
        adapter: MT5Adapter,
        logo: '/logos/fp markets.png',
        enabled: true,
        isMT5: true,
      },
      xm: {
        id: 'xm',
        name: 'XM',
        type: 'forex',
        adapter: MT5Adapter,
        logo: '/logos/XM-logo.jpg',
        enabled: true,
        isMT5: true,
      },
      fxtm: {
        id: 'fxtm',
        name: 'FXTM',
        type: 'forex',
        adapter: MT5Adapter,
        logo: '/logos/fxtm-logo-r-dark.png',
        enabled: true,
        isMT5: true,
      },
      vantage: {
        id: 'vantage',
        name: 'Vantage',
        type: 'forex',
        adapter: MT5Adapter,
        logo: '/logos/vantage.png',
        enabled: true,
        isMT5: true,
      },
      exness: {
        id: 'exness',
        name: 'Exness',
        type: 'forex',
        adapter: MT5Adapter,
        logo: '/logos/exness.jpg',
        enabled: true,
        isMT5: true,
      },
      fusionmarkets: {
        id: 'fusionmarkets',
        name: 'Fusion Markets',
        type: 'forex',
        adapter: MT5Adapter,
        logo: '/logos/fusion market.png',
        enabled: true,
        isMT5: true,
      },
    };

    // Active adapter instances (keyed by session ID or user ID)
    this.activeAdapters = new Map();
  }

  /**
   * Get list of all available brokers
   */
  getAvailableBrokers() {
    return Object.values(this.brokers).map(broker => ({
      id: broker.id,
      name: broker.name,
      type: broker.type,
      logo: broker.logo,
      enabled: broker.enabled,
    }));
  }

  /**
   * Get brokers by type (indian/forex)
   */
  getBrokersByType(type) {
    return Object.values(this.brokers)
      .filter(broker => broker.type === type)
      .map(broker => ({
        id: broker.id,
        name: broker.name,
        type: broker.type,
        logo: broker.logo,
        enabled: broker.enabled,
      }));
  }

  /**
   * Normalize broker ID
   */
  _normalizeBrokerId(id) {
    if (!id) return id;
    const clean = id.replace(/[-_\s]/g, '').toLowerCase();
    const aliasMap = {
      'angelone': 'angelone',
      'angel': 'angelone',
      'fyers': 'fyers',
      'dhan': 'dhan',
      'upstox': 'upstox',
      'shoonya': 'shoonya',
      'aliceblue': 'aliceblue',
      'kotakneo': 'kotakneo',
      'samco': 'samco',
      'mt5': 'mt5',
      'metatrader5': 'mt5',
      'icmarkets': 'icmarkets',
      'pepperstone': 'pepperstone',
      'fpmarkets': 'fpmarkets',
      'xm': 'xm',
      'fxtm': 'fxtm',
      'vantage': 'vantage',
      'exness': 'exness',
      'fusionmarkets': 'fusionmarkets',
    };
    return aliasMap[clean] || clean;
  }

  /**
   * Create a broker adapter instance
   * @param {string} brokerId - Broker identifier
   * @param {Object} config - Optional configuration
   * @returns {BaseBrokerAdapter}
   */
  createAdapter(brokerId, config = {}) {
    const normId = this._normalizeBrokerId(brokerId);
    const broker = this.brokers[normId] || this.brokers[brokerId];
    
    if (!broker) {
      throw new Error(`Unknown broker: ${brokerId}`);
    }

    if (!broker.enabled) {
      throw new Error(`Broker ${broker.name} is currently disabled`);
    }

    const AdapterClass = broker.adapter;
    return new AdapterClass({
      brokerId: normId,
      brokerName: broker.name,
      ...config,
    });
  }

  /**
   * Get or create adapter for session
   * @param {string} sessionId - User session ID
   * @param {string} brokerId - Broker identifier
   * @param {Object} config - Optional configuration
   */
  getAdapter(sessionId, brokerId, config = {}) {
    const normId = this._normalizeBrokerId(brokerId);
    const key = `${sessionId}:${normId}`;
    
    if (!this.activeAdapters.has(key)) {
      const adapter = this.createAdapter(normId, config);
      this.activeAdapters.set(key, adapter);
    }
    
    return this.activeAdapters.get(key);
  }

  /**
   * Remove adapter from active sessions
   */
  removeAdapter(sessionId, brokerId) {
    const key = `${sessionId}:${brokerId}`;
    
    if (this.activeAdapters.has(key)) {
      const adapter = this.activeAdapters.get(key);
      adapter.disconnect();
      this.activeAdapters.delete(key);
    }
  }

  /**
   * Check if broker is connected for session
   */
  isConnected(sessionId, brokerId) {
    const key = `${sessionId}:${brokerId}`;
    const adapter = this.activeAdapters.get(key);
    return adapter ? adapter.isConnected : false;
  }

  /**
   * Get broker capabilities
   */
  getBrokerCapabilities(brokerId) {
    const adapter = this.createAdapter(brokerId);
    return adapter.getCapabilities();
  }
}

// Export singleton instance
export const brokerService = new BrokerService();
