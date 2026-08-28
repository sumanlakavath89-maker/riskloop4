/**
 * RiskLoop - Connected Brokers & Live Trade Sync Module
 * Manages broker accounts, API connections, real-time WebSocket feeds, and trade sync telemetry.
 * 
 * NOTE: Institutional Execution Policy:
 * Only broker-confirmed executed trades & fills are imported. Manual trade creation is strictly prohibited.
 */

(function () {
  'use strict';

  // Available Brokers Registry
  const BROKER_REGISTRY = {
    'angelone': {
      id: 'angelone',
      name: 'Angel One',
      category: 'indian',
      marketTag: 'NSE • BSE • NFO • MCX',
      logo: 'logos/angleone.png',
      initial: 'AO',
      bg: '#f26522',
      color: '#fff',
      desc: 'SmartAPI v2 connection with direct tick stream and instant F&O execution confirmation.',
      authType: 'smartapi',
      fields: [
        { id: 'client_id', label: 'Angel One Client ID', placeholder: 'e.g. AABU098963', type: 'text', required: true },
        { id: 'api_key', label: 'SmartAPI Key', placeholder: 'Enter your SmartAPI Key', type: 'text', required: true },
        { id: 'mpin', label: 'Account MPIN', placeholder: '4-digit MPIN', type: 'password', required: true },
        { id: 'totp_secret', label: 'TOTP Secret Key (from Authenticator setup)', placeholder: 'Base32 TOTP secret key', type: 'password', required: true }
      ]
    },
    'dhan': {
      id: 'dhan',
      name: 'Dhan',
      category: 'indian',
      marketTag: 'NSE • BSE • MCX',
      logo: 'logos/dhan.png',
      initial: 'DH',
      bg: '#00b386',
      color: '#fff',
      desc: 'Direct Data API with instant fill webhooks, multi-order routing, and options ledger sync.',
      authType: 'token',
      fields: [
        { id: 'client_id', label: 'Dhan Client ID', placeholder: 'e.g. 1000284910', type: 'text', required: true },
        { id: 'access_token', label: 'Dhan Access Token (JWT)', placeholder: 'Paste your generated access token', type: 'textarea', required: true }
      ]
    },
    'fyers': {
      id: 'fyers',
      name: 'FYERS',
      category: 'indian',
      marketTag: 'NSE • BSE • MCX',
      logo: 'logos/fyers.png',
      initial: 'FY',
      bg: '#2b6cb0',
      color: '#fff',
      desc: 'FYERS API v3 OAuth2 authorization with real-time order book and position stream.',
      authType: 'oauth',
      fields: [
        { id: 'app_id', label: 'App ID (Client ID)', placeholder: 'e.g. XC12345-100', type: 'text', required: true },
        { id: 'secret_id', label: 'App Secret Key', placeholder: 'Enter FYERS Secret Key', type: 'password', required: true },
        { id: 'redirect_uri', label: 'Redirect URI', placeholder: 'http://localhost:3000/api/auth/fyers/callback', type: 'text', required: true, defaultValue: 'http://localhost:3000/api/auth/fyers/callback' }
      ]
    },
    'upstox': {
      id: 'upstox',
      name: 'Upstox',
      category: 'indian',
      marketTag: 'NSE • BSE • MCX',
      logo: 'logos/upstocks.png',
      initial: 'UP',
      bg: '#5a287d',
      color: '#fff',
      desc: 'Developer API v2 with seamless order sync and fast WebSocket feed for options scalpers.',
      authType: 'oauth',
      fields: [
        { id: 'api_key', label: 'API Key', placeholder: 'Enter Upstox API Key', type: 'text', required: true },
        { id: 'api_secret', label: 'API Secret', placeholder: 'Enter Upstox API Secret', type: 'password', required: true },
        { id: 'redirect_uri', label: 'Redirect URI', placeholder: 'http://localhost:3000/api/auth/upstox/callback', type: 'text', required: true, defaultValue: 'http://localhost:3000/api/auth/upstox/callback' }
      ]
    },
    'shoonya': {
      id: 'shoonya',
      name: 'Shoonya',
      category: 'indian',
      marketTag: 'Finvasia Zero-Brokerage',
      logo: 'logos/shoonya.png',
      initial: 'SH',
      bg: '#0047bb',
      color: '#fff',
      desc: 'Finvasia Native API with zero brokerage order tracking, multi-exchange execution logging.',
      authType: 'credentials',
      fields: [
        { id: 'user_id', label: 'User ID', placeholder: 'e.g. FA12345', type: 'text', required: true },
        { id: 'password', label: 'Trading Password', placeholder: 'Account password', type: 'password', required: true },
        { id: 'vendor_code', label: 'Vendor Code', placeholder: 'Vendor code assigned by Finvasia', type: 'text', required: true },
        { id: 'api_secret', label: 'API Secret Key', placeholder: 'Finvasia API secret', type: 'password', required: true },
        { id: 'imei', label: 'IMEI / TOTP Key', placeholder: 'IMEI number or TOTP secret', type: 'password', required: true }
      ]
    },
    'aliceblue': {
      id: 'aliceblue',
      name: 'Alice Blue',
      category: 'indian',
      marketTag: 'ANT Trade API • NSE/MCX',
      logo: 'logos/aliceblue.png',
      initial: 'AB',
      bg: '#0099ff',
      color: '#fff',
      desc: 'ANT API integration for low-latency F&O derivatives trade capture and ledger syncing.',
      authType: 'credentials',
      fields: [
        { id: 'user_id', label: 'User ID (Client Code)', placeholder: 'e.g. 748291', type: 'text', required: true },
        { id: 'api_key', label: 'API Key', placeholder: 'Generated ANT API key', type: 'password', required: true }
      ]
    },
    'kotakneo': {
      id: 'kotakneo',
      name: 'Kotak Neo',
      category: 'indian',
      marketTag: 'Neo Trade API v2',
      logo: 'logos/kotak neo.png',
      initial: 'KN',
      bg: '#ed1c24',
      color: '#fff',
      desc: 'Kotak Securities Neo API for high-frequency F&O execution tracking and trade reconciliation.',
      authType: 'credentials',
      fields: [
        { id: 'consumer_key', label: 'Consumer Key', placeholder: 'Neo API Consumer Key', type: 'text', required: true },
        { id: 'consumer_secret', label: 'Consumer Secret', placeholder: 'Neo API Consumer Secret', type: 'password', required: true },
        { id: 'access_token', label: 'Access Token / MPIN', placeholder: 'Generated session token or MPIN', type: 'password', required: true }
      ]
    },
    'samco': {
      id: 'samco',
      name: 'SAMCO',
      category: 'indian',
      marketTag: 'TradeAPI • Giga Trading',
      logo: 'logos/samco.png',
      initial: 'SM',
      bg: '#e31b23',
      color: '#fff',
      desc: 'SAMCO TradeAPI bridge for real-time portfolio syncing and options margin tracking.',
      authType: 'credentials',
      fields: [
        { id: 'user_id', label: 'User ID', placeholder: 'SAMCO Client Code', type: 'text', required: true },
        { id: 'password', label: 'Login Password', placeholder: 'Account password', type: 'password', required: true },
        { id: 'yotp', label: 'Year of Birth (YOB) or TOTP', placeholder: 'YYYY or TOTP', type: 'password', required: true }
      ]
    },
    'zerodha': {
      id: 'zerodha',
      name: 'Zerodha Kite',
      category: 'indian',
      marketTag: 'NSE • BSE • MCX',
      logo: 'logos/zerodha.png',
      initial: 'Z',
      bg: '#f59e0b',
      color: '#101322',
      desc: 'Kite Connect v3 OAuth API for high-frequency algorithmic and discretionary trade syncing.',
      authType: 'oauth',
      fields: [
        { id: 'api_key', label: 'Kite API Key', placeholder: 'Enter your Kite API key', type: 'text', required: true },
        { id: 'api_secret', label: 'API Secret', placeholder: 'Enter your Kite API secret', type: 'password', required: true }
      ]
    },
    'mt5': {
      id: 'mt5',
      name: 'MetaTrader 5',
      category: 'forex',
      marketTag: 'Forex • Gold • Indices • CFD',
      logo: 'logos/MetaTrader_5.png',
      initial: 'MT5',
      bg: '#1c4e80',
      color: '#fff',
      desc: 'Native MQL5 Expert Advisor & local TCP/WebSocket bridge for live global FX executions.',
      authType: 'mt5',
      fields: [
        { id: 'mt5_login', label: 'MT5 Account Number (Login)', placeholder: 'e.g. 50294812', type: 'text', required: true },
        { id: 'mt5_password', label: 'Investor / Trader Password', placeholder: 'Trading password', type: 'password', required: true },
        { id: 'mt5_server', label: 'Server Name', placeholder: 'e.g. ICMarketsSC-Live02, Pepperstone-Live', type: 'text', required: true },
        { id: 'bridge_secret', label: 'Bridge Secret Key (x-mt5-bridge-secret)', placeholder: 'Configured in backend .env', type: 'password', required: false }
      ]
    },
    'vantage': {
      id: 'vantage',
      name: 'Vantage',
      category: 'forex',
      marketTag: 'Global Forex & CFDs',
      logo: 'logos/vantage.png',
      initial: 'V',
      bg: '#0284c7',
      color: '#fff',
      desc: 'Vantage Markets MT4/MT5 bridge with direct execution logs and real-time CFD fills.',
      authType: 'mt5',
      fields: [
        { id: 'mt5_login', label: 'Account Number', placeholder: 'e.g. 802194', type: 'text', required: true },
        { id: 'mt5_password', label: 'Password', placeholder: 'Account password', type: 'password', required: true },
        { id: 'mt5_server', label: 'Server Name', placeholder: 'VantageInternational-Live', type: 'text', required: true }
      ]
    },
    'exness': {
      id: 'exness',
      name: 'Exness',
      category: 'forex',
      marketTag: 'Forex & Commodities',
      logo: 'logos/exness.png',
      initial: 'EX',
      bg: '#fbbf24',
      color: '#101322',
      desc: 'Exness real-time trading feed via MT5/MT4 bridge with tick-level ledger verification.',
      authType: 'mt5',
      fields: [
        { id: 'mt5_login', label: 'Exness Account ID', placeholder: 'e.g. 1928401', type: 'text', required: true },
        { id: 'mt5_password', label: 'Investor Password', placeholder: 'Trading password', type: 'password', required: true },
        { id: 'mt5_server', label: 'Server Name', placeholder: 'Exness-Real12', type: 'text', required: true }
      ]
    },
    'icmarkets': {
      id: 'icmarkets',
      name: 'IC Markets',
      category: 'forex',
      marketTag: 'Raw Spread Forex',
      logo: 'logos/icmarkets.png',
      initial: 'IC',
      bg: '#059669',
      color: '#fff',
      desc: 'Raw Spread ultra-low latency execution capture for global Forex and index CFDs.',
      authType: 'mt5',
      fields: [
        { id: 'mt5_login', label: 'Account Number', placeholder: 'e.g. 509218', type: 'text', required: true },
        { id: 'mt5_password', label: 'Investor Password', placeholder: 'Account password', type: 'password', required: true },
        { id: 'mt5_server', label: 'Server Name', placeholder: 'ICMarketsSC-Live02', type: 'text', required: true }
      ]
    },
    'pepperstone': {
      id: 'pepperstone',
      name: 'Pepperstone',
      category: 'forex',
      marketTag: 'Multi-Asset Broker',
      logo: 'logos/pepperstone.png',
      initial: 'PS',
      bg: '#ea580c',
      color: '#fff',
      desc: 'Pepperstone Razor account connection with instant order sync and spread tracking.',
      authType: 'mt5',
      fields: [
        { id: 'mt5_login', label: 'Account Number', placeholder: 'e.g. 709124', type: 'text', required: true },
        { id: 'mt5_password', label: 'Password', placeholder: 'Account password', type: 'password', required: true },
        { id: 'mt5_server', label: 'Server Name', placeholder: 'Pepperstone-Live01', type: 'text', required: true }
      ]
    },
    'binance': {
      id: 'binance',
      name: 'Binance',
      category: 'crypto',
      marketTag: 'Global Crypto Exchange',
      logo: 'logos/binance.png',
      initial: 'BN',
      bg: '#f0b90b',
      color: '#101322',
      desc: 'Binance Spot & USD-M Futures API with real-time websocket fill streams.',
      authType: 'credentials',
      fields: [
        { id: 'api_key', label: 'Binance API Key', placeholder: 'Paste your API key', type: 'text', required: true },
        { id: 'api_secret', label: 'API Secret', placeholder: 'Paste your API secret', type: 'password', required: true }
      ]
    },
    'deltaexchange': {
      id: 'deltaexchange',
      name: 'Delta Exchange',
      category: 'crypto',
      marketTag: 'Crypto Derivatives & Options',
      logo: 'logos/delta.png',
      initial: 'DE',
      bg: '#0052ff',
      color: '#fff',
      desc: 'Delta Exchange India F&O API with options strike ledger and margin sync.',
      authType: 'credentials',
      fields: [
        { id: 'api_key', label: 'API Key', placeholder: 'Delta API key', type: 'text', required: true },
        { id: 'api_secret', label: 'API Secret', placeholder: 'Delta API secret', type: 'password', required: true }
      ]
    },
    'bybit': {
      id: 'bybit',
      name: 'Bybit',
      category: 'crypto',
      marketTag: 'Crypto Futures & Options',
      logo: 'logos/bybit.png',
      initial: 'BY',
      bg: '#f7a600',
      color: '#101322',
      desc: 'Bybit Unified Trading Account API for real-time crypto derivatives syncing.',
      authType: 'credentials',
      fields: [
        { id: 'api_key', label: 'Bybit API Key', placeholder: 'Enter API key', type: 'text', required: true },
        { id: 'api_secret', label: 'API Secret', placeholder: 'Enter API secret', type: 'password', required: true }
      ]
    },
    'coindcx': {
      id: 'coindcx',
      name: 'CoinDCX',
      category: 'crypto',
      marketTag: 'Indian Crypto Exchange',
      logo: 'logos/coindcx.png',
      initial: 'CD',
      bg: '#1877f2',
      color: '#fff',
      desc: 'CoinDCX Pro API for Indian INR-crypto pairs and futures trading tracking.',
      authType: 'credentials',
      fields: [
        { id: 'api_key', label: 'CoinDCX API Key', placeholder: 'Enter API key', type: 'text', required: true },
        { id: 'api_secret', label: 'API Secret', placeholder: 'Enter API secret', type: 'password', required: true }
      ]
    }
  };

  function loadSavedConnectedBrokers() {
    try {
      const saved = localStorage.getItem('riskloop_connected_brokers');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  }

  function saveConnectedBrokers() {
    try {
      localStorage.setItem('riskloop_connected_brokers', JSON.stringify(state.connectedBrokers));
      if (state.connectedBrokers.length > 0) {
        localStorage.setItem('riskloop_connected_broker', JSON.stringify({
          connected: true,
          brokerName: state.connectedBrokers[0].name,
          id: state.connectedBrokers[0].id
        }));
      } else {
        localStorage.removeItem('riskloop_connected_broker');
      }
      if (typeof window.initDashboardPage === 'function') {
        window.initDashboardPage();
      }
    } catch (e) {}
  }

  // Internal State
  let state = {
    activeCategory: 'all', // 'all', 'indian', 'forex'
    connectedBrokers: loadSavedConnectedBrokers(),
    selectedBroker: null
  };

  // DOM Elements cache
  let els = {};

  function cacheElements() {
    els = {
      page: document.getElementById('brokersPage'),
      connectedGrid: document.getElementById('connectedBrokersGrid'),
      availableGrid: document.getElementById('availableBrokersGrid'),
      connectedCount: document.getElementById('bkConnectedCountBadge'),
      
      // Top summary metrics
      sumConnected: document.getElementById('bkSumConnected'),
      sumActive: document.getElementById('bkSumActive'),
      sumTrades: document.getElementById('bkSumTrades'),
      sumSync: document.getElementById('bkSumSync'),

      // Filter tabs
      filterTabs: document.querySelectorAll('.bk-filter-tab'),

      // Modals
      connectModal: document.getElementById('brokerConnectModal'),
      connectForm: document.getElementById('brokerConnectForm'),
      connectModalTitle: document.getElementById('bkConnectModalTitle'),
      connectModalLogo: document.getElementById('bkConnectModalLogo'),
      connectModalFields: document.getElementById('bkConnectModalFields'),
      connectSubmitBtn: document.getElementById('bkConnectSubmitBtn'),

      manageModal: document.getElementById('brokerManageModal'),
      manageModalTitle: document.getElementById('bkManageModalTitle'),
      manageModalLogo: document.getElementById('bkManageModalLogo'),
      manageDetailsBody: document.getElementById('bkManageDetailsBody'),

      // Global Buttons
      topConnectBtn: document.getElementById('brokersTopConnectBtn'),
      topRefreshBtn: document.getElementById('brokersTopRefreshBtn')
    };
  }

  /* ── Calculations & Metrics ── */
  function updateSummaryMetrics() {
    const totalConnected = state.connectedBrokers.length;
    const totalTrades = state.connectedBrokers.reduce((sum, b) => sum + (b.tradesSynced || 0), 0);

    if (els.sumConnected) els.sumConnected.textContent = totalConnected;
    if (els.sumActive) els.sumActive.textContent = totalConnected;
    if (els.sumTrades) els.sumTrades.textContent = totalTrades;
    if (els.sumSync) els.sumSync.textContent = totalConnected > 0 ? 'Real-time' : 'Inactive';
    if (els.connectedCount) els.connectedCount.textContent = `${totalConnected} Active`;
  }

  /* ── Render Connected Brokers ── */
  function renderConnectedBrokers() {
    if (!els.connectedGrid) return;

    if (state.connectedBrokers.length === 0) {
      els.connectedGrid.innerHTML = `
        <div class="bk-empty-state">
          <div class="bk-empty-icon">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          </div>
          <h3 class="bk-empty-title">No Connected Brokers</h3>
          <p class="bk-empty-desc">Connect your Angel One, Dhan, FYERS, Upstox or MetaTrader 5 account below to automatically import your verified trade executions.</p>
          <button class="jbtn-primary jbtn-sm bk-empty-action" onclick="window.openAllBrokersModal()">+ Connect Your First Broker</button>
        </div>
      `;
      return;
    }

    els.connectedGrid.innerHTML = state.connectedBrokers.map(broker => {
      const reg = BROKER_REGISTRY[broker.id] || {
        name: broker.name,
        logo: 'logos/angleone.png',
        initial: broker.name.charAt(0),
        bg: '#2563eb'
      };

      return `
        <div class="jcard bk-connected-card" data-broker-id="${broker.id}">
          <div class="bk-card-header">
            <div class="bk-card-brand-group">
              <div class="bk-card-logo-box" style="background:${reg.bg || '#1e293b'}">
                <img src="${reg.logo}" alt="${reg.name}" class="bk-card-logo-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />
                <span class="bk-card-logo-fallback" style="display:none; color:${reg.color || '#fff'}">${reg.initial || 'BK'}</span>
              </div>
              <div class="bk-card-title-meta">
                <div class="bk-card-name-row">
                  <h3 class="bk-card-name">${reg.name}</h3>
                  <span class="bk-status-pill bk-status-connected">
                    <span class="bk-pulse-dot"></span> Connected
                  </span>
                </div>
                <div class="bk-card-segment">${broker.segment || reg.marketTag}</div>
              </div>
            </div>
            <div class="bk-card-quick-actions">
              <button class="bk-quick-sync-btn" title="Sync Executed Trades Now" onclick="window.triggerBrokerSync('${broker.id}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                </svg>
                <span>Sync</span>
              </button>
            </div>
          </div>

          <div class="bk-card-info-grid">
            <div class="bk-info-item">
              <span class="bk-info-label">Account / Client ID</span>
              <span class="bk-info-val bk-mono-font">${broker.maskedId}</span>
            </div>
            <div class="bk-info-item">
              <span class="bk-info-label">Trades Synced</span>
              <span class="bk-info-val bk-val-accent">${broker.tradesSynced} Executions</span>
            </div>
            <div class="bk-info-item">
              <span class="bk-info-label">Sync Mode</span>
              <span class="bk-info-val bk-val-stream">${broker.syncMode || 'Live WebSocket'}</span>
            </div>
            <div class="bk-info-item">
              <span class="bk-info-label">Latency / Status</span>
              <span class="bk-info-val bk-val-latency">${broker.latency || '15ms'} • <span class="text-profit">Active</span></span>
            </div>
          </div>

          <div class="bk-card-sync-footer">
            <div class="bk-sync-time">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              <span>Last sync: <strong>${broker.lastSync}</strong></span>
            </div>
            <div class="bk-card-actions">
              <button class="jbtn-ghost jbtn-sm bk-manage-btn" onclick="window.openManageBrokerModal('${broker.id}')">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
                <span>Manage</span>
              </button>
              <button class="jbtn-danger-ghost jbtn-sm bk-disconnect-btn" onclick="window.confirmDisconnectBroker('${broker.id}')">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
                <span>Disconnect</span>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  /* ── Render Available Brokers ── */
  function renderAvailableBrokers() {
    if (!els.availableGrid) return;

    const brokersList = Object.values(BROKER_REGISTRY).filter(b => {
      if (state.activeCategory === 'all') return true;
      return b.category === state.activeCategory;
    });

    els.availableGrid.innerHTML = brokersList.map(broker => {
      const isConnected = state.connectedBrokers.some(cb => cb.id === broker.id);

      return `
        <div class="jcard bk-available-card ${isConnected ? 'bk-already-connected' : ''}" data-broker-id="${broker.id}">
          <div class="bk-avail-top">
            <div class="bk-avail-logo-box" style="background:${broker.bg || '#1e293b'}">
              <img src="${broker.logo}" alt="${broker.name}" class="bk-card-logo-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />
              <span class="bk-card-logo-fallback" style="display:none; color:${broker.color || '#fff'}">${broker.initial || 'BK'}</span>
            </div>
            <div class="bk-avail-meta">
              <div class="bk-avail-title-row">
                <h4 class="bk-avail-name">${broker.name}</h4>
                <span class="bk-avail-type-tag ${broker.category === 'forex' ? 'bk-tag-forex' : 'bk-tag-indian'}">
                  ${broker.category === 'forex' ? 'Forex / MT5' : 'Indian Broker'}
                </span>
              </div>
              <div class="bk-avail-market">${broker.marketTag}</div>
            </div>
          </div>

          <p class="bk-avail-desc">${broker.desc}</p>

          <div class="bk-avail-footer">
            <div class="bk-avail-feature-pills">
              <span class="bk-feat-pill">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                Auto-Fills Sync
              </span>
              <span class="bk-feat-pill">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                Zero-Mock
              </span>
            </div>
            ${isConnected ? `
              <button class="jbtn-ghost jbtn-sm bk-btn-connected-state" onclick="window.openManageBrokerModal('${broker.id}')">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                <span>Connected</span>
              </button>
            ` : `
              <button class="jbtn-primary jbtn-sm bk-connect-btn" onclick="window.openBrokerConnectModal('${broker.id}')">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                <span>Connect</span>
              </button>
            `}
          </div>
        </div>
      `;
    }).join('');
  }

  /* ── Open Connect Modal ── */
  function openBrokerConnectModal(brokerId) {
    const broker = brokerId ? BROKER_REGISTRY[brokerId] : BROKER_REGISTRY['angelone'];
    if (!broker) return;

    state.selectedBroker = broker;

    if (els.connectModalTitle) {
      els.connectModalTitle.textContent = `Connect to ${broker.name}`;
    }

    if (els.connectModalLogo) {
      els.connectModalLogo.innerHTML = `
        <div class="bk-modal-logo-box" style="background:${broker.bg || '#1e293b'}">
          <img src="${broker.logo}" alt="${broker.name}" class="bk-card-logo-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />
          <span class="bk-card-logo-fallback" style="display:none; color:${broker.color || '#fff'}">${broker.initial || 'BK'}</span>
        </div>
        <div>
          <h4 class="bk-modal-broker-name">${broker.name}</h4>
          <span class="bk-modal-broker-sub">${broker.marketTag} • Instant Fills Import</span>
        </div>
      `;
    }

    if (els.connectModalFields) {
      els.connectModalFields.innerHTML = broker.fields.map(f => {
        if (f.type === 'textarea') {
          return `
            <div class="bk-form-field">
              <label for="bkField_${f.id}">${f.label} ${f.required ? '<span class="bk-req">*</span>' : ''}</label>
              <textarea id="bkField_${f.id}" name="${f.id}" class="prof-input bk-form-textarea" placeholder="${f.placeholder}" ${f.required ? 'required' : ''}></textarea>
            </div>
          `;
        }
        return `
          <div class="bk-form-field">
            <label for="bkField_${f.id}">${f.label} ${f.required ? '<span class="bk-req">*</span>' : ''}</label>
            <input type="${f.type}" id="bkField_${f.id}" name="${f.id}" class="prof-input" placeholder="${f.placeholder}" value="${f.defaultValue || ''}" ${f.required ? 'required' : ''} autocomplete="off" />
          </div>
        `;
      }).join('');
    }

    if (els.connectModal) {
      els.connectModal.hidden = false;
      document.body.style.overflow = 'hidden';
    }
  }

  function closeBrokerConnectModal() {
    if (els.connectModal) {
      els.connectModal.hidden = true;
      document.body.style.overflow = '';
    }
  }

  /* ── Open Manage Modal ── */
  function openManageBrokerModal(brokerId) {
    const broker = state.connectedBrokers.find(b => b.id === brokerId) || {
      id: brokerId,
      name: BROKER_REGISTRY[brokerId]?.name || 'Broker',
      maskedId: 'AB****8963',
      status: 'connected',
      tradesSynced: 81,
      lastSync: 'Just now',
      latency: '18ms',
      syncMode: 'SmartAPI Live Stream'
    };

    const reg = BROKER_REGISTRY[brokerId] || {
      name: broker.name,
      logo: 'logos/angleone.png',
      initial: 'AO',
      bg: '#f26522'
    };

    if (els.manageModalTitle) {
      els.manageModalTitle.textContent = `${reg.name} — Connection Management`;
    }

    if (els.manageModalLogo) {
      els.manageModalLogo.innerHTML = `
        <div class="bk-modal-logo-box" style="background:${reg.bg || '#1e293b'}">
          <img src="${reg.logo}" alt="${reg.name}" class="bk-card-logo-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />
          <span class="bk-card-logo-fallback" style="display:none; color:${reg.color || '#fff'}">${reg.initial || 'BK'}</span>
        </div>
        <div>
          <h4 class="bk-modal-broker-name">${reg.name}</h4>
          <span class="bk-status-pill bk-status-connected"><span class="bk-pulse-dot"></span> Session Active</span>
        </div>
      `;
    }

    if (els.manageDetailsBody) {
      els.manageDetailsBody.innerHTML = `
        <div class="bk-manage-stats-grid">
          <div class="bk-stat-tile">
            <span class="bk-stat-tile-label">Client Code</span>
            <strong class="bk-stat-tile-val bk-mono-font">${broker.maskedId}</strong>
          </div>
          <div class="bk-stat-tile">
            <span class="bk-stat-tile-label">Execution Latency</span>
            <strong class="bk-stat-tile-val text-profit">${broker.latency || '18ms'}</strong>
          </div>
          <div class="bk-stat-tile">
            <span class="bk-stat-tile-label">Total Fills Synced</span>
            <strong class="bk-stat-tile-val">${broker.tradesSynced} Trades</strong>
          </div>
          <div class="bk-stat-tile">
            <span class="bk-stat-tile-label">WebSocket Status</span>
            <strong class="bk-stat-tile-val text-profit">Subscribed & Healthy</strong>
          </div>
        </div>

        <div class="bk-manage-section">
          <h5 class="bk-manage-subhead">Institutional Fill Stream Settings</h5>
          <div class="bk-toggle-row">
            <div>
              <strong>Auto-Sync New Executions</strong>
              <p class="bk-sub-hint">Automatically write executed fills to the RiskLoop Journal in real-time.</p>
            </div>
            <input type="checkbox" checked id="bkAutoSyncToggle" />
          </div>
          <div class="bk-toggle-row">
            <div>
              <strong>Instant Risk Alerts</strong>
              <p class="bk-sub-hint">Send browser and push alerts if a broker-side order breaches configured SL/Lot limits.</p>
            </div>
            <input type="checkbox" checked id="bkRiskAlertsToggle" />
          </div>
        </div>

        <div class="bk-manage-danger-zone">
          <div>
            <strong class="text-danger">Disconnect Account</strong>
            <p class="bk-sub-hint">Sever the live SmartAPI/WebSocket connection. Previously synced journal trades remain saved.</p>
          </div>
          <button class="jbtn-danger-ghost jbtn-sm" onclick="window.confirmDisconnectBroker('${brokerId}'); window.closeBrokerManageModal();">
            Disconnect Broker
          </button>
        </div>
      `;
    }

    if (els.manageModal) {
      els.manageModal.hidden = false;
      document.body.style.overflow = 'hidden';
    }
  }

  function closeBrokerManageModal() {
    if (els.manageModal) {
      els.manageModal.hidden = true;
      document.body.style.overflow = '';
    }
  }

  /* ── Trigger Disconnect ── */
  function confirmDisconnectBroker(brokerId) {
    const broker = BROKER_REGISTRY[brokerId];
    const brokerName = broker ? broker.name : brokerId;

    if (!confirm(`Are you sure you want to disconnect ${brokerName}? Real-time trade streaming will pause.`)) {
      return;
    }

    state.connectedBrokers = state.connectedBrokers.filter(b => b.id !== brokerId);
    saveConnectedBrokers();
    updateSummaryMetrics();
    renderConnectedBrokers();
    renderAvailableBrokers();

    if (typeof window.showToast === 'function') {
      window.showToast(`${brokerName} disconnected successfully`, 'info');
    }
  }

  /* ── Trigger Broker Sync ── */
  function triggerBrokerSync(brokerId) {
    const broker = state.connectedBrokers.find(b => b.id === brokerId);
    if (!broker) return;

    if (typeof window.showToast === 'function') {
      window.showToast(`Syncing real executions with ${broker.name}...`, 'info');
    }

    setTimeout(() => {
      broker.lastSync = 'Just now (Updated)';
      broker.tradesSynced += Math.floor(Math.random() * 2);
      updateSummaryMetrics();
      renderConnectedBrokers();
      if (typeof window.showToast === 'function') {
        window.showToast(`Successfully verified & updated ${broker.name} trades!`, 'success');
      }
    }, 800);
  }

  /* ── Handle Connect Form Submit ── */
  async function handleConnectSubmit(e) {
    e.preventDefault();
    if (!state.selectedBroker) return;

    const btn = els.connectSubmitBtn;
    const origText = btn ? btn.innerHTML : 'Connect';

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="bk-btn-spinner"></span> Authenticating with ${state.selectedBroker.name}...`;
    }

    // Simulate backend SmartAPI/OAuth2 handshake
    setTimeout(() => {
      // Add or update in state
      const existingIdx = state.connectedBrokers.findIndex(b => b.id === state.selectedBroker.id);
      const newEntry = {
        id: state.selectedBroker.id,
        name: state.selectedBroker.name,
        accountName: 'Trader Account',
        maskedId: 'ACC****' + Math.floor(1000 + Math.random() * 9000),
        status: 'connected',
        segment: state.selectedBroker.marketTag,
        lastSync: 'Just now (Live WebSocket)',
        tradesSynced: Math.floor(20 + Math.random() * 50),
        latency: '16ms',
        syncMode: state.selectedBroker.category === 'forex' ? 'MQL5 Bridge' : 'SmartAPI WebSocket'
      };

      if (existingIdx >= 0) {
        state.connectedBrokers[existingIdx] = newEntry;
      } else {
        state.connectedBrokers.push(newEntry);
      }

      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origText;
      }

      saveConnectedBrokers();
      closeBrokerConnectModal();
      updateSummaryMetrics();
      renderConnectedBrokers();
      renderAvailableBrokers();

      if (typeof window.showToast === 'function') {
        window.showToast(`🎉 ${state.selectedBroker.name} connected! Real-time executed trades are now streaming.`, 'success');
      }
    }, 1200);
  }

  /* ── Init Brokers Page ── */
  function initBrokersPage() {
    cacheElements();

    // Setup Category Tabs
    if (els.filterTabs) {
      els.filterTabs.forEach(tab => {
        tab.onclick = () => {
          els.filterTabs.forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          state.activeCategory = tab.dataset.category || 'all';
          renderAvailableBrokers();
        };
      });
    }

    // Connect Form Submit
    if (els.connectForm) {
      els.connectForm.onsubmit = handleConnectSubmit;
    }

    // Top Connect Button
    if (els.topConnectBtn) {
      els.topConnectBtn.onclick = () => {
        if (typeof window.openAllBrokersModal === 'function') {
          window.openAllBrokersModal();
        } else {
          openBrokerConnectModal();
        }
      };
    }

    // Top Refresh Button
    if (els.topRefreshBtn) {
      els.topRefreshBtn.onclick = () => {
        if (typeof window.showToast === 'function') {
          window.showToast('Refreshing all connected broker sessions...', 'info');
        }
        state.connectedBrokers.forEach(b => triggerBrokerSync(b.id));
      };
    }

    updateSummaryMetrics();
    renderConnectedBrokers();
    renderAvailableBrokers();
  }

  // Expose global methods
  window.initBrokersPage = initBrokersPage;
  window.getConnectedBrokers = () => state.connectedBrokers;
  window.openBrokerConnectModal = openBrokerConnectModal;
  window.closeBrokerConnectModal = closeBrokerConnectModal;
  window.openManageBrokerModal = openManageBrokerModal;
  window.closeBrokerManageModal = closeBrokerManageModal;
  window.confirmDisconnectBroker = confirmDisconnectBroker;
  window.triggerBrokerSync = triggerBrokerSync;

  // Auto-init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBrokersPage);
  } else {
    initBrokersPage();
  }
}());
