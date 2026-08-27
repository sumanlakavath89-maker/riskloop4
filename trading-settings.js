/**
 * RiskLoop Trading Settings Module
 * Manages institutional risk management parameters, execution rules,
 * market preferences, and Capital Shield guardrail synchronization.
 */

(function (window) {
  'use strict';

  // ── Institutional Default Settings ────────────────────────────────────
  const DEFAULT_SETTINGS = {
    // Risk Management
    defaultRiskPct: 1.0,
    maxDailyLossPct: 3.0,
    maxOpenRiskPct: 5.0,
    minRrRatio: 2.0,
    maxPositionSize: 250000,
    maxTradesPerDay: 6,
    // Trading Rules
    maxConsecutiveLosses: 3,
    stopAfterDailyLoss: true,
    stopAfterConsecutiveLosses: true,
    allowOutsideSessions: false,
    allowWeekendTrading: false,
    requireStopLoss: true,
    requireMinRr: true,
    // Preferred Trading
    preferredInstruments: ['Index Options (Nifty / BankNifty)', 'Equity Cash', 'Forex Majors'],
    preferredSessions: ['Indian Session (NSE/BSE)', 'London Forex Session'],
    tradingStyle: 'Momentum Day Trader',
    accountCurrency: 'INR (₹)',
    // Capital Shield
    capitalShieldActive: true,
    capitalShieldWarningPct: 2.0,
    tradingLockStatus: 'unlocked' // 'unlocked' | 'cooldown' | 'locked'
  };

  const AVAILABLE_INSTRUMENTS = [
    'Index Options (Nifty / BankNifty)',
    'Equity Cash',
    'Equity F&O Futures',
    'Forex Majors (EUR/USD, GBP/USD)',
    'Commodities (MCX Gold, Silver, Crude)',
    'Crypto Assets'
  ];

  const AVAILABLE_SESSIONS = [
    'Indian Session (NSE/BSE)',
    'London Forex Session',
    'New York Forex Session',
    'Sydney / Tokyo Session'
  ];

  // In-memory active settings state
  let currentSettings = { ...DEFAULT_SETTINGS };

  // ── DOM References ─────────────────────────────────────────────────────
  function getElements() {
    return {
      page: document.getElementById('tradingSettingsPage'),
      // Capital Shield Card
      shieldStatusBadge: document.getElementById('tsShieldStatusBadge'),
      shieldToggle: document.getElementById('tsShieldToggle'),
      shieldDailyLossVal: document.getElementById('tsShieldDailyLossVal'),
      shieldWarningVal: document.getElementById('tsShieldWarningVal'),
      shieldMaxRiskVal: document.getElementById('tsShieldMaxRiskVal'),
      shieldLockVal: document.getElementById('tsShieldLockVal'),
      // Risk Management Inputs
      riskPerTradeInput: document.getElementById('tsRiskPerTradeInput'),
      riskPerTradeVal: document.getElementById('tsRiskPerTradeVal'),
      maxDailyLossInput: document.getElementById('tsMaxDailyLossInput'),
      maxDailyLossVal: document.getElementById('tsMaxDailyLossVal'),
      maxOpenRiskInput: document.getElementById('tsMaxOpenRiskInput'),
      maxOpenRiskVal: document.getElementById('tsMaxOpenRiskVal'),
      minRrInput: document.getElementById('tsMinRrInput'),
      maxPosSizeInput: document.getElementById('tsMaxPosSizeInput'),
      maxTradesDayInput: document.getElementById('tsMaxTradesDayInput'),
      // Trading Rules Toggles
      consecutiveLossesInput: document.getElementById('tsConsecutiveLossesInput'),
      stopDailyLossToggle: document.getElementById('tsStopDailyLossToggle'),
      stopConsecLossToggle: document.getElementById('tsStopConsecLossToggle'),
      outsideSessionsToggle: document.getElementById('tsOutsideSessionsToggle'),
      weekendTradingToggle: document.getElementById('tsWeekendTradingToggle'),
      requireSlToggle: document.getElementById('tsRequireSlToggle'),
      requireMinRrToggle: document.getElementById('tsRequireMinRrToggle'),
      // Market Preferences
      instrumentsContainer: document.getElementById('tsInstrumentsContainer'),
      sessionsContainer: document.getElementById('tsSessionsContainer'),
      tradingStyleSelect: document.getElementById('tsTradingStyleSelect'),
      currencySelect: document.getElementById('tsCurrencySelect'),
      // Buttons & Feedback
      saveBtn: document.getElementById('tsSaveBtn'),
      topSaveBtn: document.getElementById('tsTopSaveBtn'),
      resetBtn: document.getElementById('tsResetBtn'),
      topResetBtn: document.getElementById('tsTopResetBtn'),
      validationAlert: document.getElementById('tsValidationAlert'),
      validationList: document.getElementById('tsValidationList')
    };
  }

  // ── Load Settings from Supabase & Local Cache ──────────────────────────
  async function loadTradingSettings() {
    try {
      // 1. Try local storage cache
      const cached = localStorage.getItem('riskloop_trading_settings');
      if (cached) {
        currentSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(cached) };
      }

      // 2. Fetch from Supabase if authenticated
      if (window.supabaseClient) {
        let user = null;
        if (window.RiskLoopAuth && typeof window.RiskLoopAuth.getUser === 'function') {
          user = window.RiskLoopAuth.getUser();
        }

        if (user && user.id) {
          const { data, error } = await window.supabaseClient
            .from('user_settings')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();

          if (data && !error) {
            currentSettings = {
              ...currentSettings,
              defaultRiskPct: Number(data.default_risk_pct) || currentSettings.defaultRiskPct,
              maxDailyLossPct: Number(data.max_daily_loss_pct) || currentSettings.maxDailyLossPct,
              maxOpenRiskPct: Number(data.max_open_risk_pct) || currentSettings.maxOpenRiskPct,
              minRrRatio: Number(data.min_rr_ratio) || currentSettings.minRrRatio,
              maxPositionSize: Number(data.max_position_size) || currentSettings.maxPositionSize,
              maxTradesPerDay: Number(data.max_trades_per_day) || currentSettings.maxTradesPerDay,
              maxConsecutiveLosses: Number(data.max_consecutive_losses) || currentSettings.maxConsecutiveLosses,
              stopAfterDailyLoss: data.stop_after_daily_loss !== undefined ? !!data.stop_after_daily_loss : currentSettings.stopAfterDailyLoss,
              stopAfterConsecutiveLosses: data.stop_after_consecutive_losses !== undefined ? !!data.stop_after_consecutive_losses : currentSettings.stopAfterConsecutiveLosses,
              allowOutsideSessions: data.allow_outside_sessions !== undefined ? !!data.allow_outside_sessions : currentSettings.allowOutsideSessions,
              allowWeekendTrading: data.allow_weekend_trading !== undefined ? !!data.allow_weekend_trading : currentSettings.allowWeekendTrading,
              requireStopLoss: data.require_stop_loss !== undefined ? !!data.require_stop_loss : currentSettings.requireStopLoss,
              requireMinRr: data.require_min_rr !== undefined ? !!data.require_min_rr : currentSettings.requireMinRr,
              preferredInstruments: Array.isArray(data.preferred_instruments) ? data.preferred_instruments : currentSettings.preferredInstruments,
              preferredSessions: Array.isArray(data.preferred_sessions) ? data.preferred_sessions : currentSettings.preferredSessions,
              tradingStyle: data.trading_style || currentSettings.tradingStyle,
              accountCurrency: data.account_currency || currentSettings.accountCurrency,
              capitalShieldActive: data.capital_shield_active !== undefined ? !!data.capital_shield_active : currentSettings.capitalShieldActive,
              capitalShieldWarningPct: Number(data.capital_shield_warning_pct) || currentSettings.capitalShieldWarningPct,
              tradingLockStatus: data.trading_lock_status || currentSettings.tradingLockStatus
            };
          }
        }
      }
    } catch (err) {
      console.warn('[TradingSettings] Load error, using current cache:', err);
    } finally {
      renderTradingSettings();
      syncGlobalSettings();
    }
  }

  // ── Render Settings to DOM ─────────────────────────────────────────────
  function renderTradingSettings() {
    const els = getElements();
    const s = currentSettings;

    // 1. Capital Shield Hero Card
    if (els.shieldToggle) els.shieldToggle.checked = s.capitalShieldActive;
    if (els.shieldStatusBadge) {
      if (s.capitalShieldActive) {
        els.shieldStatusBadge.className = 'ts-shield-badge ts-badge-active';
        els.shieldStatusBadge.innerHTML = `<span class="pulse-dot"></span><span>Active Protection</span>`;
      } else {
        els.shieldStatusBadge.className = 'ts-shield-badge ts-badge-disabled';
        els.shieldStatusBadge.innerHTML = `<span class="pulse-dot-off"></span><span>Disabled</span>`;
      }
    }

    if (els.shieldDailyLossVal) els.shieldDailyLossVal.textContent = `${s.maxDailyLossPct}% Max Loss`;
    if (els.shieldWarningVal) els.shieldWarningVal.textContent = `${s.capitalShieldWarningPct}% Warning`;
    if (els.shieldMaxRiskVal) els.shieldMaxRiskVal.textContent = `${s.defaultRiskPct}% Per Trade`;
    if (els.shieldLockVal) {
      if (s.tradingLockStatus === 'locked') {
        els.shieldLockVal.innerHTML = `<span class="text-danger">Locked (Daily Limit Hit)</span>`;
      } else if (s.tradingLockStatus === 'cooldown') {
        els.shieldLockVal.innerHTML = `<span class="text-warning">Cooldown Active</span>`;
      } else {
        els.shieldLockVal.innerHTML = `<span class="text-profit">Unlocked · Safe</span>`;
      }
    }

    // 2. Risk Management Inputs
    if (els.riskPerTradeInput) els.riskPerTradeInput.value = s.defaultRiskPct;
    if (els.riskPerTradeVal) els.riskPerTradeVal.textContent = `${s.defaultRiskPct}%`;

    if (els.maxDailyLossInput) els.maxDailyLossInput.value = s.maxDailyLossPct;
    if (els.maxDailyLossVal) els.maxDailyLossVal.textContent = `${s.maxDailyLossPct}%`;

    if (els.maxOpenRiskInput) els.maxOpenRiskInput.value = s.maxOpenRiskPct;
    if (els.maxOpenRiskVal) els.maxOpenRiskVal.textContent = `${s.maxOpenRiskPct}%`;

    if (els.minRrInput) els.minRrInput.value = s.minRrRatio;
    if (els.maxPosSizeInput) els.maxPosSizeInput.value = s.maxPositionSize;
    if (els.maxTradesDayInput) els.maxTradesDayInput.value = s.maxTradesPerDay;

    // 3. Trading Rules Toggles
    if (els.consecutiveLossesInput) els.consecutiveLossesInput.value = s.maxConsecutiveLosses;
    if (els.stopDailyLossToggle) els.stopDailyLossToggle.checked = s.stopAfterDailyLoss;
    if (els.stopConsecLossToggle) els.stopConsecLossToggle.checked = s.stopAfterConsecutiveLosses;
    if (els.outsideSessionsToggle) els.outsideSessionsToggle.checked = s.allowOutsideSessions;
    if (els.weekendTradingToggle) els.weekendTradingToggle.checked = s.allowWeekendTrading;
    if (els.requireSlToggle) els.requireSlToggle.checked = s.requireStopLoss;
    if (els.requireMinRrToggle) els.requireMinRrToggle.checked = s.requireMinRr;

    // 4. Market Preferences
    if (els.tradingStyleSelect) els.tradingStyleSelect.value = s.tradingStyle;
    if (els.currencySelect) els.currencySelect.value = s.accountCurrency;

    // Instruments Tags
    renderCheckboxes(els.instrumentsContainer, AVAILABLE_INSTRUMENTS, s.preferredInstruments, 'tsInstrument');

    // Sessions Tags
    renderCheckboxes(els.sessionsContainer, AVAILABLE_SESSIONS, s.preferredSessions, 'tsSession');
  }

  function renderCheckboxes(container, available, selectedList, name) {
    if (!container) return;
    const selectedSet = new Set(selectedList || []);
    container.innerHTML = available.map(item => {
      const isChecked = selectedSet.has(item);
      return `
        <label class="ts-choice-tag ${isChecked ? 'ts-choice-active' : ''}">
          <input type="checkbox" name="${name}" value="${escapeHtml(item)}" ${isChecked ? 'checked' : ''} onchange="this.parentElement.classList.toggle('ts-choice-active', this.checked);" />
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          <span>${escapeHtml(item)}</span>
        </label>
      `;
    }).join('');
  }

  // ── Validation ─────────────────────────────────────────────────────────
  function validateSettings(formData) {
    const errors = [];

    if (formData.defaultRiskPct <= 0 || formData.defaultRiskPct > 10) {
      errors.push('Default Risk per trade must be between 0.1% and 10%.');
    }

    if (formData.maxDailyLossPct <= 0 || formData.maxDailyLossPct > 25) {
      errors.push('Max Daily Loss must be between 0.5% and 25%.');
    }

    if (formData.defaultRiskPct >= formData.maxDailyLossPct) {
      errors.push('Default Risk per trade cannot exceed or equal the Max Daily Loss limit.');
    }

    if (formData.maxOpenRiskPct < formData.defaultRiskPct) {
      errors.push('Max Open Risk cannot be lower than Default Risk per trade.');
    }

    if (formData.minRrRatio < 1.0 || formData.minRrRatio > 10.0) {
      errors.push('Minimum Risk:Reward ratio must be at least 1:1.0.');
    }

    if (formData.maxTradesPerDay < 1 || formData.maxTradesPerDay > 50) {
      errors.push('Maximum trades per day must be between 1 and 50.');
    }

    if (formData.maxConsecutiveLosses < 1 || formData.maxConsecutiveLosses > 10) {
      errors.push('Maximum consecutive losses must be between 1 and 10.');
    }

    return errors;
  }

  // ── Save Settings ──────────────────────────────────────────────────────
  async function saveTradingSettings() {
    const els = getElements();

    // Collect values from form
    const riskVal = parseFloat(els.riskPerTradeInput?.value || currentSettings.defaultRiskPct);
    const dailyLossVal = parseFloat(els.maxDailyLossInput?.value || currentSettings.maxDailyLossPct);
    const openRiskVal = parseFloat(els.maxOpenRiskInput?.value || currentSettings.maxOpenRiskPct);
    const minRrVal = parseFloat(els.minRrInput?.value || currentSettings.minRrRatio);
    const posSizeVal = parseFloat(els.maxPosSizeInput?.value || currentSettings.maxPositionSize);
    const tradesVal = parseInt(els.maxTradesDayInput?.value || currentSettings.maxTradesPerDay, 10);
    const consecLossVal = parseInt(els.consecutiveLossesInput?.value || currentSettings.maxConsecutiveLosses, 10);

    const selectedInstruments = [];
    document.querySelectorAll('input[name="tsInstrument"]:checked').forEach(cb => {
      selectedInstruments.push(cb.value);
    });

    const selectedSessions = [];
    document.querySelectorAll('input[name="tsSession"]:checked').forEach(cb => {
      selectedSessions.push(cb.value);
    });

    const updated = {
      defaultRiskPct: Number(riskVal.toFixed(2)),
      maxDailyLossPct: Number(dailyLossVal.toFixed(2)),
      maxOpenRiskPct: Number(openRiskVal.toFixed(2)),
      minRrRatio: Number(minRrVal.toFixed(2)),
      maxPositionSize: posSizeVal,
      maxTradesPerDay: tradesVal,
      maxConsecutiveLosses: consecLossVal,
      stopAfterDailyLoss: !!els.stopDailyLossToggle?.checked,
      stopAfterConsecutiveLosses: !!els.stopConsecLossToggle?.checked,
      allowOutsideSessions: !!els.outsideSessionsToggle?.checked,
      allowWeekendTrading: !!els.weekendTradingToggle?.checked,
      requireStopLoss: !!els.requireSlToggle?.checked,
      requireMinRr: !!els.requireMinRrToggle?.checked,
      preferredInstruments: selectedInstruments.length > 0 ? selectedInstruments : currentSettings.preferredInstruments,
      preferredSessions: selectedSessions.length > 0 ? selectedSessions : currentSettings.preferredSessions,
      tradingStyle: els.tradingStyleSelect?.value || currentSettings.tradingStyle,
      accountCurrency: els.currencySelect?.value || currentSettings.accountCurrency,
      capitalShieldActive: !!els.shieldToggle?.checked,
      capitalShieldWarningPct: Number((dailyLossVal * 0.67).toFixed(1)),
      tradingLockStatus: currentSettings.tradingLockStatus
    };

    // Validate
    const errors = validateSettings(updated);
    if (errors.length > 0) {
      showValidationErrors(errors);
      return;
    }
    hideValidationErrors();

    // Disable buttons while saving
    setButtonLoading(els.saveBtn, true);
    setButtonLoading(els.topSaveBtn, true);

    try {
      // 1. Update in-memory and local storage
      currentSettings = updated;
      localStorage.setItem('riskloop_trading_settings', JSON.stringify(currentSettings));

      // 2. Persist to Supabase if client active
      if (window.supabaseClient) {
        let user = null;
        if (window.RiskLoopAuth && typeof window.RiskLoopAuth.getUser === 'function') {
          user = window.RiskLoopAuth.getUser();
        }

        if (user && user.id) {
          await window.supabaseClient
            .from('user_settings')
            .upsert({
              user_id: user.id,
              default_risk_pct: updated.defaultRiskPct,
              max_daily_loss_pct: updated.maxDailyLossPct,
              max_open_risk_pct: updated.maxOpenRiskPct,
              min_rr_ratio: updated.minRrRatio,
              max_position_size: updated.maxPositionSize,
              max_trades_per_day: updated.maxTradesPerDay,
              max_consecutive_losses: updated.maxConsecutiveLosses,
              stop_after_daily_loss: updated.stopAfterDailyLoss,
              stop_after_consecutive_losses: updated.stopAfterConsecutiveLosses,
              allow_outside_sessions: updated.allowOutsideSessions,
              allow_weekend_trading: updated.allowWeekendTrading,
              require_stop_loss: updated.requireStopLoss,
              require_min_rr: updated.requireMinRr,
              preferred_instruments: updated.preferredInstruments,
              preferred_sessions: updated.preferredSessions,
              trading_style: updated.tradingStyle,
              account_currency: updated.accountCurrency,
              capital_shield_active: updated.capitalShieldActive,
              capital_shield_warning_pct: updated.capitalShieldWarningPct,
              updated_at: new Date().toISOString()
            });
        }
      }

      // Sync across RiskLoop
      syncGlobalSettings();
      renderTradingSettings();

      showToast('Trading settings & risk guardrails saved successfully!', false);
    } catch (err) {
      console.error('[TradingSettings] Save error:', err);
      showToast('Error saving settings: ' + (err.message || 'Please try again'), true);
    } finally {
      setButtonLoading(els.saveBtn, false);
      setButtonLoading(els.topSaveBtn, false);
    }
  }

  // ── Reset to Defaults ──────────────────────────────────────────────────
  function resetToDefaults() {
    if (!confirm('Are you sure you want to reset all trading parameters and rules to institutional defaults?')) {
      return;
    }
    currentSettings = { ...DEFAULT_SETTINGS };
    localStorage.setItem('riskloop_trading_settings', JSON.stringify(currentSettings));
    renderTradingSettings();
    syncGlobalSettings();
    hideValidationErrors();
    showToast('Trading settings reset to institutional defaults.', false);
  }

  // ── Synchronize with App Ecosystem ─────────────────────────────────────
  function syncGlobalSettings() {
    // 1. Expose on window
    window.RiskLoopTradingSettings = currentSettings;

    // 2. Update sidebar Capital Shield badge
    const shieldSub = document.querySelector('.sidebar-shield-sub');
    const shieldHeader = document.querySelector('.sidebar-shield-header span:last-child');
    const shieldDot = document.querySelector('.sidebar-shield-header .live-pulse-dot');

    if (shieldSub) {
      shieldSub.textContent = `${currentSettings.defaultRiskPct}% Max Risk Enforced`;
    }
    if (shieldHeader) {
      shieldHeader.textContent = currentSettings.capitalShieldActive ? 'Capital Shield Active' : 'Capital Shield Off';
    }
    if (shieldDot) {
      shieldDot.style.background = currentSettings.capitalShieldActive ? 'var(--profit)' : 'var(--text-muted)';
    }

    // 3. Update Calculator default risk % input if on DOM
    const calcRiskInput = document.getElementById('riskPercentage');
    if (calcRiskInput && !calcRiskInput.dataset.userModified) {
      calcRiskInput.value = currentSettings.defaultRiskPct;
    }
  }

  function setButtonLoading(btn, isLoading) {
    if (!btn) return;
    btn.disabled = isLoading;
    if (isLoading) {
      btn.innerHTML = `
        <svg class="prof-spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/></svg>
        <span>Saving...</span>
      `;
    } else {
      btn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        <span>Save Changes</span>
      `;
    }
  }

  function showValidationErrors(errors) {
    const els = getElements();
    if (!els.validationAlert || !els.validationList) return;
    els.validationList.innerHTML = errors.map(e => `<li>${escapeHtml(e)}</li>`).join('');
    els.validationAlert.hidden = false;
    els.validationAlert.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function hideValidationErrors() {
    const els = getElements();
    if (els.validationAlert) els.validationAlert.hidden = true;
  }

  function showToast(message, isError = false) {
    if (typeof window.showAuthToast === 'function') {
      window.showAuthToast(message, isError);
      return;
    }

    const toast = document.createElement('div');
    toast.className = `prof-toast ${isError ? 'prof-toast-error' : 'prof-toast-success'}`;
    toast.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        ${isError ? '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>' : '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'}
      </svg>
      <span>${escapeHtml(message)}</span>
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('prof-toast-show'), 10);
    setTimeout(() => {
      toast.classList.remove('prof-toast-show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Initialize Event Listeners ─────────────────────────────────────────
  function initTradingSettingsPage() {
    const els = getElements();

    // Range slider live value updates
    if (els.riskPerTradeInput && els.riskPerTradeVal) {
      els.riskPerTradeInput.oninput = (e) => {
        els.riskPerTradeVal.textContent = `${parseFloat(e.target.value).toFixed(1)}%`;
      };
    }
    if (els.maxDailyLossInput && els.maxDailyLossVal) {
      els.maxDailyLossInput.oninput = (e) => {
        els.maxDailyLossVal.textContent = `${parseFloat(e.target.value).toFixed(1)}%`;
      };
    }
    if (els.maxOpenRiskInput && els.maxOpenRiskVal) {
      els.maxOpenRiskInput.oninput = (e) => {
        els.maxOpenRiskVal.textContent = `${parseFloat(e.target.value).toFixed(1)}%`;
      };
    }

    // Shield quick toggle
    if (els.shieldToggle) {
      els.shieldToggle.onchange = (e) => {
        currentSettings.capitalShieldActive = e.target.checked;
        if (els.shieldStatusBadge) {
          if (e.target.checked) {
            els.shieldStatusBadge.className = 'ts-shield-badge ts-badge-active';
            els.shieldStatusBadge.innerHTML = `<span class="pulse-dot"></span><span>Active Protection</span>`;
          } else {
            els.shieldStatusBadge.className = 'ts-shield-badge ts-badge-disabled';
            els.shieldStatusBadge.innerHTML = `<span class="pulse-dot-off"></span><span>Disabled</span>`;
          }
        }
      };
    }

    // Save buttons
    if (els.saveBtn) els.saveBtn.onclick = saveTradingSettings;
    if (els.topSaveBtn) els.topSaveBtn.onclick = saveTradingSettings;

    // Reset buttons
    if (els.resetBtn) els.resetBtn.onclick = resetToDefaults;
    if (els.topResetBtn) els.topResetBtn.onclick = resetToDefaults;

    loadTradingSettings();
  }

  // Expose global methods
  window.initTradingSettingsPage = initTradingSettingsPage;
  window.getTradingSettings = () => ({ ...currentSettings });
  window.saveTradingSettings = saveTradingSettings;
  window.resetTradingSettings = resetToDefaults;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (window.location.hash === '#trading-settings') {
        initTradingSettingsPage();
      } else {
        loadTradingSettings();
      }
    });
  } else {
    loadTradingSettings();
  }

}(window));
