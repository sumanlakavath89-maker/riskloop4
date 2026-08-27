/**
 * RiskLoop General Settings Module
 * Handles application behavior settings:
 * 1. Appearance (Theme, UI Density, Visual Effects)
 * 2. Notifications (Browser, Risk Alerts, Trades, Journal, Broker, Updates)
 * 3. Localization (Language, Timezone, Date Format, Number Format, Currency)
 * 4. Market Display (Default Market, Timeframe, Session Banner, Tick Flash)
 * 5. Dashboard Preferences (Landing View, Widget Toggles, Density)
 * 6. Privacy & Community (Leaderboard Visibility, Anonymity, Data Sharing)
 * 7. Data Management (Export Profile JSON, Export Trades CSV/JSON, Account Archive)
 */

(function (window) {
  'use strict';

  // ── Default State ──────────────────────────────────────────────────────
  const defaultSettings = {
    // 1. Appearance
    theme: 'dark',
    uiDensity: 'comfortable',
    enableAnimations: true,
    highContrastCharts: false,
    
    // 2. Notifications
    browserNotifications: false,
    riskAlerts: true,
    tradeAlerts: true,
    journalReminders: true,
    brokerAlerts: true,
    productUpdates: false,

    // 3. Localization
    language: 'en-US',
    timezone: 'Asia/Kolkata',
    dateFormat: 'DD/MM/YYYY',
    numberFormat: 'indian',
    currencyDisplay: 'INR (₹)',

    // 4. Market Display
    defaultMarket: 'NSE/BSE (India)',
    defaultTimeframe: '15m',
    showTradingSessionBanner: true,
    enableTickFlash: true,

    // 5. Dashboard
    defaultLandingPage: 'dashboard',
    widgetPnlChart: true,
    widgetAllocation: true,
    widgetRiskMeter: true,
    widgetRecentTrades: true,
    widgetQuickSizer: true,
    dashboardCardLayout: 'expanded',

    // 6. Privacy
    leaderboardVisibility: true,
    anonymousProfile: false,
    anonymousAlias: 'AlphaTrader_77',
    communitySharing: true,
    dataSharingAnalytics: true
  };

  const generalSettingsState = {
    loading: false,
    user: null,
    settings: { ...defaultSettings }
  };

  // ── DOM References Cache ───────────────────────────────────────────────
  function getElements() {
    return {
      page: document.getElementById('settingsPage'),
      saveBtn: document.getElementById('gsTopSaveBtn'),
      resetBtn: document.getElementById('gsTopResetBtn'),
      
      // 1. Appearance
      themeSelect: document.getElementById('gsThemeSelect'),
      densitySelect: document.getElementById('gsDensitySelect'),
      enableAnimationsToggle: document.getElementById('gsEnableAnimationsToggle'),
      highContrastToggle: document.getElementById('gsHighContrastToggle'),

      // 2. Notifications
      browserNotifToggle: document.getElementById('gsBrowserNotifToggle'),
      riskAlertsToggle: document.getElementById('gsRiskAlertsToggle'),
      tradeAlertsToggle: document.getElementById('gsTradeAlertsToggle'),
      journalRemindersToggle: document.getElementById('gsJournalRemindersToggle'),
      brokerAlertsToggle: document.getElementById('gsBrokerAlertsToggle'),
      productUpdatesToggle: document.getElementById('gsProductUpdatesToggle'),

      // 3. Localization
      languageSelect: document.getElementById('gsLanguageSelect'),
      timezoneSelect: document.getElementById('gsTimezoneSelect'),
      dateFormatSelect: document.getElementById('gsDateFormatSelect'),
      numberFormatSelect: document.getElementById('gsNumberFormatSelect'),
      currencySelect: document.getElementById('gsCurrencySelect'),

      // 4. Market Display
      defaultMarketSelect: document.getElementById('gsDefaultMarketSelect'),
      defaultTimeframeSelect: document.getElementById('gsDefaultTimeframeSelect'),
      sessionBannerToggle: document.getElementById('gsSessionBannerToggle'),
      tickFlashToggle: document.getElementById('gsTickFlashToggle'),

      // 5. Dashboard
      defaultLandingSelect: document.getElementById('gsDefaultLandingSelect'),
      widgetPnlChartToggle: document.getElementById('gsWidgetPnlChartToggle'),
      widgetAllocationToggle: document.getElementById('gsWidgetAllocationToggle'),
      widgetRiskMeterToggle: document.getElementById('gsWidgetRiskMeterToggle'),
      widgetRecentTradesToggle: document.getElementById('gsWidgetRecentTradesToggle'),
      widgetQuickSizerToggle: document.getElementById('gsWidgetQuickSizerToggle'),
      dashboardCardLayoutSelect: document.getElementById('gsDashboardCardLayoutSelect'),

      // 6. Privacy
      leaderboardVisibilityToggle: document.getElementById('gsLeaderboardVisibilityToggle'),
      anonymousProfileToggle: document.getElementById('gsAnonymousProfileToggle'),
      anonymousAliasInput: document.getElementById('gsAnonymousAliasInput'),
      communitySharingToggle: document.getElementById('gsCommunitySharingToggle'),
      dataSharingAnalyticsToggle: document.getElementById('gsDataSharingAnalyticsToggle'),

      // 7. Data Exports
      exportProfileBtn: document.getElementById('gsExportProfileBtn'),
      exportJournalJsonBtn: document.getElementById('gsExportJournalJsonBtn'),
      exportJournalCsvBtn: document.getElementById('gsExportJournalCsvBtn'),
      exportAccountArchiveBtn: document.getElementById('gsExportAccountArchiveBtn')
    };
  }

  // ── Load Settings ──────────────────────────────────────────────────────
  async function loadGeneralSettings() {
    generalSettingsState.loading = true;

    try {
      // 1. Get user
      let currentUser = null;
      if (window.RiskLoopAuth && typeof window.RiskLoopAuth.getUser === 'function') {
        currentUser = window.RiskLoopAuth.getUser();
      }
      if (!currentUser) {
        try {
          const raw = localStorage.getItem('riskloop_current_user');
          if (raw) currentUser = JSON.parse(raw);
        } catch (e) {}
      }
      generalSettingsState.user = currentUser;

      // 2. Load from localStorage cache
      try {
        const savedCache = localStorage.getItem('riskloop_general_settings');
        if (savedCache) {
          const parsed = JSON.parse(savedCache);
          generalSettingsState.settings = { ...defaultSettings, ...parsed };
        }
      } catch (e) {}

      // 3. Load from Supabase user_settings if live
      if (window.supabaseClient && currentUser && currentUser.id) {
        try {
          const { data: row, error } = await window.supabaseClient
            .from('user_settings')
            .select('*')
            .eq('user_id', currentUser.id)
            .maybeSingle();

          if (row && !error) {
            if (row.timezone) generalSettingsState.settings.timezone = row.timezone;
            if (row.account_currency) generalSettingsState.settings.currencyDisplay = row.account_currency;
            if (row.app_preferences && typeof row.app_preferences === 'object') {
              generalSettingsState.settings = { ...generalSettingsState.settings, ...row.app_preferences };
            }
          }
        } catch (sbErr) {
          console.warn('[GeneralSettings] Supabase fetch error:', sbErr);
        }
      }

      // Check browser notification permission status
      if ('Notification' in window) {
        generalSettingsState.settings.browserNotifications = (Notification.permission === 'granted');
      }

    } catch (err) {
      console.error('[GeneralSettings] Error loading settings:', err);
    } finally {
      generalSettingsState.loading = false;
      renderSettingsUI();
      applySettingsLive();
    }
  }

  // ── Render Settings to UI ──────────────────────────────────────────────
  function renderSettingsUI() {
    const els = getElements();
    const s = generalSettingsState.settings;

    // 1. Appearance
    if (els.themeSelect) els.themeSelect.value = s.theme || 'dark';
    if (els.densitySelect) els.densitySelect.value = s.uiDensity || 'comfortable';
    if (els.enableAnimationsToggle) els.enableAnimationsToggle.checked = !!s.enableAnimations;
    if (els.highContrastToggle) els.highContrastToggle.checked = !!s.highContrastCharts;

    // 2. Notifications
    if (els.browserNotifToggle) els.browserNotifToggle.checked = !!s.browserNotifications;
    if (els.riskAlertsToggle) els.riskAlertsToggle.checked = !!s.riskAlerts;
    if (els.tradeAlertsToggle) els.tradeAlertsToggle.checked = !!s.tradeAlerts;
    if (els.journalRemindersToggle) els.journalRemindersToggle.checked = !!s.journalReminders;
    if (els.brokerAlertsToggle) els.brokerAlertsToggle.checked = !!s.brokerAlerts;
    if (els.productUpdatesToggle) els.productUpdatesToggle.checked = !!s.productUpdates;

    // 3. Localization
    if (els.languageSelect) els.languageSelect.value = s.language || 'en-US';
    if (els.timezoneSelect) els.timezoneSelect.value = s.timezone || 'Asia/Kolkata';
    if (els.dateFormatSelect) els.dateFormatSelect.value = s.dateFormat || 'DD/MM/YYYY';
    if (els.numberFormatSelect) els.numberFormatSelect.value = s.numberFormat || 'indian';
    if (els.currencySelect) els.currencySelect.value = s.currencyDisplay || 'INR (₹)';

    // 4. Market Display
    if (els.defaultMarketSelect) els.defaultMarketSelect.value = s.defaultMarket || 'NSE/BSE (India)';
    if (els.defaultTimeframeSelect) els.defaultTimeframeSelect.value = s.defaultTimeframe || '15m';
    if (els.sessionBannerToggle) els.sessionBannerToggle.checked = !!s.showTradingSessionBanner;
    if (els.tickFlashToggle) els.tickFlashToggle.checked = !!s.enableTickFlash;

    // 5. Dashboard
    if (els.defaultLandingSelect) els.defaultLandingSelect.value = s.defaultLandingPage || 'dashboard';
    if (els.widgetPnlChartToggle) els.widgetPnlChartToggle.checked = !!s.widgetPnlChart;
    if (els.widgetAllocationToggle) els.widgetAllocationToggle.checked = !!s.widgetAllocation;
    if (els.widgetRiskMeterToggle) els.widgetRiskMeterToggle.checked = !!s.widgetRiskMeter;
    if (els.widgetRecentTradesToggle) els.widgetRecentTradesToggle.checked = !!s.widgetRecentTrades;
    if (els.widgetQuickSizerToggle) els.widgetQuickSizerToggle.checked = !!s.widgetQuickSizer;
    if (els.dashboardCardLayoutSelect) els.dashboardCardLayoutSelect.value = s.dashboardCardLayout || 'expanded';

    // 6. Privacy
    if (els.leaderboardVisibilityToggle) els.leaderboardVisibilityToggle.checked = !!s.leaderboardVisibility;
    if (els.anonymousProfileToggle) els.anonymousProfileToggle.checked = !!s.anonymousProfile;
    if (els.anonymousAliasInput) els.anonymousAliasInput.value = s.anonymousAlias || 'AlphaTrader_77';
    if (els.communitySharingToggle) els.communitySharingToggle.checked = !!s.communitySharing;
    if (els.dataSharingAnalyticsToggle) els.dataSharingAnalyticsToggle.checked = !!s.dataSharingAnalytics;
  }

  // ── Apply Settings Live to App ─────────────────────────────────────────
  function applySettingsLive() {
    const s = generalSettingsState.settings;

    // 1. Theme application
    if (s.theme === 'system') {
      const isSystemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', isSystemDark ? 'dark' : 'light');
    } else {
      document.documentElement.setAttribute('data-theme', s.theme || 'dark');
    }

    // 2. UI Density application
    if (s.uiDensity === 'compact') {
      document.body.classList.add('compact-density');
    } else {
      document.body.classList.remove('compact-density');
    }

    // 3. Animations
    if (s.enableAnimations === false) {
      document.body.classList.add('reduce-animations');
    } else {
      document.body.classList.remove('reduce-animations');
    }
  }

  // ── Save Settings ──────────────────────────────────────────────────────
  async function saveGeneralSettings() {
    const els = getElements();
    const s = generalSettingsState.settings;

    // Collect values from UI
    if (els.themeSelect) s.theme = els.themeSelect.value;
    if (els.densitySelect) s.uiDensity = els.densitySelect.value;
    if (els.enableAnimationsToggle) s.enableAnimations = els.enableAnimationsToggle.checked;
    if (els.highContrastToggle) s.highContrastCharts = els.highContrastToggle.checked;

    if (els.browserNotifToggle) s.browserNotifications = els.browserNotifToggle.checked;
    if (els.riskAlertsToggle) s.riskAlerts = els.riskAlertsToggle.checked;
    if (els.tradeAlertsToggle) s.tradeAlerts = els.tradeAlertsToggle.checked;
    if (els.journalRemindersToggle) s.journalReminders = els.journalRemindersToggle.checked;
    if (els.brokerAlertsToggle) s.brokerAlerts = els.brokerAlertsToggle.checked;
    if (els.productUpdatesToggle) s.productUpdates = els.productUpdatesToggle.checked;

    if (els.languageSelect) s.language = els.languageSelect.value;
    if (els.timezoneSelect) s.timezone = els.timezoneSelect.value;
    if (els.dateFormatSelect) s.dateFormat = els.dateFormatSelect.value;
    if (els.numberFormatSelect) s.numberFormat = els.numberFormatSelect.value;
    if (els.currencySelect) s.currencyDisplay = els.currencySelect.value;

    if (els.defaultMarketSelect) s.defaultMarket = els.defaultMarketSelect.value;
    if (els.defaultTimeframeSelect) s.defaultTimeframe = els.defaultTimeframeSelect.value;
    if (els.sessionBannerToggle) s.showTradingSessionBanner = els.sessionBannerToggle.checked;
    if (els.tickFlashToggle) s.enableTickFlash = els.tickFlashToggle.checked;

    if (els.defaultLandingSelect) s.defaultLandingPage = els.defaultLandingSelect.value;
    if (els.widgetPnlChartToggle) s.widgetPnlChart = els.widgetPnlChartToggle.checked;
    if (els.widgetAllocationToggle) s.widgetAllocation = els.widgetAllocationToggle.checked;
    if (els.widgetRiskMeterToggle) s.widgetRiskMeter = els.widgetRiskMeterToggle.checked;
    if (els.widgetRecentTradesToggle) s.widgetRecentTrades = els.widgetRecentTradesToggle.checked;
    if (els.widgetQuickSizerToggle) s.widgetQuickSizer = els.widgetQuickSizerToggle.checked;
    if (els.dashboardCardLayoutSelect) s.dashboardCardLayout = els.dashboardCardLayoutSelect.value;

    if (els.leaderboardVisibilityToggle) s.leaderboardVisibility = els.leaderboardVisibilityToggle.checked;
    if (els.anonymousProfileToggle) s.anonymousProfile = els.anonymousProfileToggle.checked;
    if (els.anonymousAliasInput) s.anonymousAlias = els.anonymousAliasInput.value.trim() || 'AlphaTrader_77';
    if (els.communitySharingToggle) s.communitySharing = els.communitySharingToggle.checked;
    if (els.dataSharingAnalyticsToggle) s.dataSharingAnalytics = els.dataSharingAnalyticsToggle.checked;

    // Handle browser notification permission if requested
    if (s.browserNotifications && 'Notification' in window && Notification.permission === 'default') {
      try {
        const perm = await Notification.requestPermission();
        s.browserNotifications = (perm === 'granted');
        if (els.browserNotifToggle) els.browserNotifToggle.checked = s.browserNotifications;
      } catch (e) {}
    }

    // Disable button during save
    if (els.saveBtn) {
      els.saveBtn.disabled = true;
      els.saveBtn.innerHTML = `
        <svg class="prof-spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/></svg>
        <span>Saving...</span>
      `;
    }

    try {
      // 1. Save to localStorage
      localStorage.setItem('riskloop_general_settings', JSON.stringify(s));

      // 2. Save to Supabase if live
      const user = generalSettingsState.user;
      if (window.supabaseClient && user && user.id) {
        await window.supabaseClient
          .from('user_settings')
          .upsert({
            user_id: user.id,
            timezone: s.timezone,
            account_currency: s.currencyDisplay,
            app_preferences: s,
            updated_at: new Date().toISOString()
          });
      }

      applySettingsLive();
      showToast('Settings saved successfully!', false);

    } catch (err) {
      console.error('[GeneralSettings] Error saving settings:', err);
      showToast('Error saving settings: ' + (err.message || 'Please try again'), true);
    } finally {
      if (els.saveBtn) {
        els.saveBtn.disabled = false;
        els.saveBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          <span>Save Changes</span>
        `;
      }
    }
  }

  // ── Reset to Defaults ──────────────────────────────────────────────────
  function resetGeneralSettings() {
    if (!confirm('Are you sure you want to reset all general settings to their default values?')) {
      return;
    }
    generalSettingsState.settings = { ...defaultSettings };
    renderSettingsUI();
    applySettingsLive();
    localStorage.setItem('riskloop_general_settings', JSON.stringify(defaultSettings));
    showToast('Settings reset to defaults', false);
  }

  // ── Safe Data Exports (No Passwords or Secrets) ─────────────────────────
  function exportUserData(type) {
    const user = generalSettingsState.user || {};
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // Strip sensitive fields
    const safeProfile = {
      fullName: user.fullName || 'Trader',
      email: user.email || 'trader@riskloop.io',
      phone: user.phone || '',
      country: user.country || 'India',
      timezone: generalSettingsState.settings.timezone,
      currency: generalSettingsState.settings.currencyDisplay,
      exportedAt: new Date().toISOString()
    };

    if (type === 'profile') {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(safeProfile, null, 2));
      downloadFile(dataStr, `riskloop_profile_${timestamp}.json`);
      showToast('Personal profile data exported successfully.', false);
      return;
    }

    // Get journal trades
    let trades = [];
    try {
      const rawJournal = localStorage.getItem('riskloop_journal_trades');
      if (rawJournal) trades = JSON.parse(rawJournal);
    } catch (e) {}

    const sanitizedTrades = trades.map(t => ({
      date: t.date || t.trade_date || '',
      symbol: t.symbol || '',
      type: t.type || t.action || 'BUY',
      quantity: t.quantity || t.qty || 0,
      entryPrice: t.entryPrice || t.entry || 0,
      exitPrice: t.exitPrice || t.exit || 0,
      pnl: t.pnl || t.realized_pnl || 0,
      pnlPercent: t.pnlPercent || t.roi || 0,
      status: t.status || (t.pnl >= 0 ? 'WIN' : 'LOSS'),
      notes: t.notes || t.setup || ''
    }));

    if (type === 'journal-json') {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(sanitizedTrades, null, 2));
      downloadFile(dataStr, `riskloop_journal_trades_${timestamp}.json`);
      showToast(`Exported ${sanitizedTrades.length} journal trades (JSON).`, false);
      return;
    }

    if (type === 'journal-csv') {
      if (sanitizedTrades.length === 0) {
        showToast('No journal trades available to export.', true);
        return;
      }
      const headers = ['Date', 'Symbol', 'Type', 'Quantity', 'Entry Price', 'Exit Price', 'P&L', 'P&L %', 'Status', 'Notes'];
      const rows = sanitizedTrades.map(t => [
        t.date,
        t.symbol,
        t.type,
        t.quantity,
        t.entryPrice,
        t.exitPrice,
        t.pnl,
        t.pnlPercent,
        t.status,
        `"${(t.notes || '').replace(/"/g, '""')}"`
      ]);
      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const dataStr = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent);
      downloadFile(dataStr, `riskloop_journal_trades_${timestamp}.csv`);
      showToast(`Exported ${sanitizedTrades.length} journal trades (CSV).`, false);
      return;
    }

    if (type === 'archive') {
      const fullArchive = {
        app: 'RiskLoop Trading Terminal',
        archiveVersion: '2.0.0',
        exportedAt: new Date().toISOString(),
        profile: safeProfile,
        applicationSettings: generalSettingsState.settings,
        journalTrades: sanitizedTrades,
        connectedBrokersSummary: ['Angel One (Active)', 'Zerodha (Active)']
      };
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(fullArchive, null, 2));
      downloadFile(dataStr, `riskloop_account_archive_${timestamp}.json`);
      showToast('Complete account data archive downloaded safely.', false);
    }
  }

  function downloadFile(dataUri, fileName) {
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataUri);
    downloadAnchor.setAttribute('download', fileName);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  function showToast(message, isError = false) {
    if (typeof window.showAuthToast === 'function') {
      window.showAuthToast(message, isError);
      return;
    }
    const toast = document.createElement('div');
    toast.className = `prof-toast ${isError ? 'prof-toast-error' : 'prof-toast-success'}`;
    toast.innerHTML = `<span>${message}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('prof-toast-show'), 10);
    setTimeout(() => {
      toast.classList.remove('prof-toast-show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ── Initialize Event Listeners ─────────────────────────────────────────
  function initGeneralSettingsPage() {
    const els = getElements();

    if (els.saveBtn) {
      els.saveBtn.onclick = () => saveGeneralSettings();
    }

    if (els.resetBtn) {
      els.resetBtn.onclick = () => resetGeneralSettings();
    }

    // Live preview listeners
    if (els.themeSelect) {
      els.themeSelect.onchange = () => {
        generalSettingsState.settings.theme = els.themeSelect.value;
        applySettingsLive();
      };
    }

    if (els.densitySelect) {
      els.densitySelect.onchange = () => {
        generalSettingsState.settings.uiDensity = els.densitySelect.value;
        applySettingsLive();
      };
    }

    if (els.enableAnimationsToggle) {
      els.enableAnimationsToggle.onchange = () => {
        generalSettingsState.settings.enableAnimations = els.enableAnimationsToggle.checked;
        applySettingsLive();
      };
    }

    // Data export triggers
    if (els.exportProfileBtn) {
      els.exportProfileBtn.onclick = () => exportUserData('profile');
    }
    if (els.exportJournalJsonBtn) {
      els.exportJournalJsonBtn.onclick = () => exportUserData('journal-json');
    }
    if (els.exportJournalCsvBtn) {
      els.exportJournalCsvBtn.onclick = () => exportUserData('journal-csv');
    }
    if (els.exportAccountArchiveBtn) {
      els.exportAccountArchiveBtn.onclick = () => exportUserData('archive');
    }

    loadGeneralSettings();
  }

  // Expose global methods
  window.initGeneralSettingsPage = initGeneralSettingsPage;
  window.loadGeneralSettings = loadGeneralSettings;
  window.saveGeneralSettings = saveGeneralSettings;
  window.exportUserData = exportUserData;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (window.location.hash === '#settings') {
        initGeneralSettingsPage();
      }
    });
  }

}(window));
