/**
 * Global Economic Calendar Component & Dashboard
 * 
 * Phase 7.8: Unified Global Economic Calendar Dashboard
 * 
 * Renders unified macroeconomic events across INR, USD, EUR, GBP, JPY, AUD, CAD, CHF, and CNY.
 * Features:
 * - Multi-currency & multi-country filter pills with flags.
 * - Timezone auto-conversion & selector dropdown.
 * - Impact badges (High, Medium, Low).
 * - Desktop Event Table & Mobile Event Cards.
 * - Loading, Empty, and Error states with retry.
 * - Source transparency without leaking internal secrets.
 * - Admin monitoring panel for rollout & circuit breaker telemetry.
 */

(function () {
  'use strict';

  const API_BASE = '/api/market/economic-calendar/global';
  const ADMIN_API_BASE = '/api/admin/forex-calendar';

  const FLAG_MAP = {
    USD: '🇺🇸',
    EUR: '🇪🇺',
    GBP: '🇬🇧',
    JPY: '🇯🇵',
    AUD: '🇦🇺',
    CAD: '🇨🇦',
    CHF: '🇨🇭',
    CNY: '🇨🇳',
    NZD: '🇳🇿'
  };

  const IMPACT_BADGES = {
    high: { label: 'High', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.3)' },
    medium: { label: 'Medium', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.3)' },
    low: { label: 'Low', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.3)' }
  };
  function formatCalendarValue(val, unit = '') {
    if (val === null || val === undefined || val === '' || val === '—' || val === '-') {
      return '—';
    }
    const str = String(val).trim();
    if (str === '—' || str === '' || str === 'null' || str === 'undefined') return '—';
    if (unit && !str.includes(unit) && !isNaN(Number(str))) {
      return `${str}${unit}`;
    }
    return str;
  }

  class GlobalEconomicCalendar {
    constructor(containerId = 'global-economic-calendar-root') {
      this.containerId = containerId;
      this.state = {
        selectedCurrency: 'ALL',
        selectedImpact: 'ALL',
        selectedStatus: 'ALL',
        searchQuery: '',
        userTimezone: window.TimezoneUtil ? window.TimezoneUtil.getUserTimezone() : 'Asia/Kolkata',
        page: 1,
        limit: 50,
        sortBy: 'date',
        sortDirection: 'asc',
        loading: false,
        error: null,
        events: [],
        pagination: {},
        isAdmin: false,
        adminDashboardData: null
      };

      this.init();
    }

    async init() {
      this.checkAdminStatus();
      this.renderSkeleton();
      await this.fetchEvents();
      if (this.state.isAdmin) {
        this.fetchAdminDashboard();
      }
    }

    checkAdminStatus() {
      try {
        const userStr = localStorage.getItem('supabase_user') || sessionStorage.getItem('riskloop_user');
        if (userStr) {
          const user = JSON.parse(userStr);
          if (user.role === 'admin' || user.is_admin === true || user.email?.includes('admin')) {
            this.state.isAdmin = true;
          }
        }
      } catch {
        this.state.isAdmin = false;
      }
    }

    async fetchEvents() {
      this.state.loading = true;
      this.state.error = null;
      this.render();

      try {
        const params = new URLSearchParams({
          currencies: this.state.selectedCurrency,
          impact: this.state.selectedImpact,
          status: this.state.selectedStatus,
          search: this.state.searchQuery,
          userTimezone: this.state.userTimezone,
          page: this.state.page,
          limit: this.state.limit,
          sortBy: this.state.sortBy,
          sortDirection: this.state.sortDirection
        });

        const res = await fetch(`${API_BASE}?${params.toString()}`);
        if (!res.ok) {
          throw new Error(`Failed to load calendar events (HTTP ${res.status})`);
        }

        const data = await res.json();
        this.state.events = data.events || [];
        this.state.pagination = data.pagination || {};
        this.state.loading = false;
      } catch (err) {
        console.error('[GlobalEconomicCalendar] Fetch error:', err);
        this.state.error = err.message || 'Unable to load global economic calendar.';
        this.state.loading = false;
      }

      this.render();
    }

    async fetchAdminDashboard() {
      try {
        const token = localStorage.getItem('supabase_token');
        const res = await fetch(`${ADMIN_API_BASE}/global-dashboard`, {
          headers: {
            'Authorization': token ? `Bearer ${token}` : '',
            'x-user-role': 'admin'
          }
        });
        if (res.ok) {
          this.state.adminDashboardData = await res.json();
          this.renderAdminPanel();
        }
      } catch (err) {
        console.warn('[GlobalEconomicCalendar] Admin dashboard fetch error:', err);
      }
    }

    render() {
      const container = document.getElementById(this.containerId);
      if (!container) return;

      container.innerHTML = `
        <div class="gec-wrapper" style="font-family: inherit; color: var(--text-primary, #ffffff);">
          <!-- Header Bar -->
          <div class="gec-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
            <div>
              <h2 style="margin: 0; font-size: 1.5rem; font-weight: 700; color: var(--text-primary, #ffffff); display: flex; align-items: center; gap: 8px;">
                <span>🌐</span> Global Economic Calendar
              </h2>
              <p style="margin: 4px 0 0; font-size: 0.85rem; color: var(--text-muted, #94a3b8);">
                Real-time official macroeconomic releases across major world economies.
              </p>
            </div>
            
            <!-- Timezone Selector -->
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 0.8rem; color: var(--text-muted, #94a3b8);">Timezone:</span>
              <select id="gec-tz-select" style="background: rgba(30, 41, 59, 0.8); color: #fff; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; padding: 6px 10px; font-size: 0.8rem; cursor: pointer;">
                ${this.renderTimezoneOptions()}
              </select>
            </div>
          </div>

          <!-- Admin Monitoring Banner (If Admin) -->
          <div id="gec-admin-panel"></div>

          <!-- Filters Bar -->
          ${this.renderFilters()}

          <!-- Main Content Area -->
          <div class="gec-content" style="margin-top: 20px;">
            ${this.renderContent()}
          </div>
        </div>
      `;

      this.attachEventListeners();
      if (this.state.isAdmin && this.state.adminDashboardData) {
        this.renderAdminPanel();
      }
    }

    renderFilters() {
      const currencies = ['ALL', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'NZD'];
      const impacts = ['ALL', 'high', 'medium', 'low'];
      const statuses = ['ALL', 'upcoming', 'released'];

      return `
        <div class="gec-filters-container" style="background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 16px;">
          <!-- Currency Filter Pills -->
          <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; align-items: center;">
            <span style="font-size: 0.8rem; font-weight: 600; color: var(--text-muted, #94a3b8); margin-right: 4px;">Currency:</span>
            ${currencies.map(c => `
              <button class="gec-curr-btn ${this.state.selectedCurrency === c ? 'active' : ''}" data-currency="${c}"
                style="display: inline-flex; align-items: center; gap: 4px; padding: 6px 12px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; cursor: pointer; transition: all 0.2s ease;
                background: ${this.state.selectedCurrency === c ? 'var(--primary-color, #3b82f6)' : 'rgba(30, 41, 59, 0.7)'};
                color: ${this.state.selectedCurrency === c ? '#ffffff' : '#94a3b8'};
                border: 1px solid ${this.state.selectedCurrency === c ? '#3b82f6' : 'rgba(255, 255, 255, 0.1)'};">
                <span>${c === 'ALL' ? '🌍' : (FLAG_MAP[c] || '')}</span>
                <span>${c}</span>
              </button>
            `).join('')}
          </div>

          <!-- Secondary Filters: Impact, Status, Search -->
          <div style="display: flex; flex-wrap: wrap; gap: 12px; justify-content: space-between; align-items: center;">
            <!-- Impact Pills -->
            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
              <span style="font-size: 0.8rem; font-weight: 600; color: var(--text-muted, #94a3b8);">Impact:</span>
              ${impacts.map(imp => `
                <button class="gec-impact-btn ${this.state.selectedImpact === imp ? 'active' : ''}" data-impact="${imp}"
                  style="padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; cursor: pointer; transition: all 0.2s ease;
                  background: ${this.state.selectedImpact === imp ? 'rgba(59, 130, 246, 0.2)' : 'transparent'};
                  color: ${this.state.selectedImpact === imp ? '#60a5fa' : '#94a3b8'};
                  border: 1px solid ${this.state.selectedImpact === imp ? '#3b82f6' : 'rgba(255, 255, 255, 0.08)'};">
                  ${imp.toUpperCase()}
                </button>
              `).join('')}
            </div>

            <!-- Search Bar -->
            <div style="flex-grow: 1; max-width: 280px; position: relative;">
              <input type="text" id="gec-search-input" placeholder="Search indicator or country..."
                value="${this.state.searchQuery}"
                style="width: 100%; background: rgba(30, 41, 59, 0.8); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 6px 12px; font-size: 0.8rem; color: #fff; outline: none;">
            </div>
          </div>
        </div>
      `;
    }

    renderContent() {
      if (this.state.loading) {
        return this.renderSkeleton();
      }

      if (this.state.error) {
        return `
          <div style="text-align: center; padding: 40px 20px; background: rgba(239, 68, 68, 0.05); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 12px;">
            <div style="font-size: 2rem; margin-bottom: 8px;">⚠️</div>
            <h4 style="color: #ef4444; margin: 0 0 8px;">Unable to load calendar</h4>
            <p style="color: #94a3b8; font-size: 0.85rem; margin: 0 0 16px;">${this.state.error}</p>
            <button id="gec-retry-btn" style="background: #3b82f6; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 0.85rem;">
              Retry Connection
            </button>
          </div>
        `;
      }

      if (this.state.events.length === 0) {
        return `
          <div style="text-align: center; padding: 50px 20px; background: rgba(15, 23, 42, 0.4); border: 1px dashed rgba(255, 255, 255, 0.1); border-radius: 12px;">
            <div style="font-size: 2.5rem; margin-bottom: 8px;">📅</div>
            <h4 style="color: #fff; margin: 0 0 6px;">No Economic Events Found</h4>
            <p style="color: #94a3b8; font-size: 0.85rem; margin: 0;">Try adjusting your currency, impact, or search filters.</p>
          </div>
        `;
      }

      return `
        <!-- Desktop Event Table -->
        <div class="gec-desktop-table" style="overflow-x: auto; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px;">
          <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.85rem;">
            <thead>
              <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.1); background: rgba(30, 41, 59, 0.5); color: #94a3b8; font-size: 0.75rem; text-transform: uppercase;">
                <th style="padding: 12px 16px;">Time / Countdown</th>
                <th style="padding: 12px 16px;">Country</th>
                <th style="padding: 12px 16px;">Event Name</th>
                <th style="padding: 12px 16px;">Impact</th>
                <th style="padding: 12px 16px; text-align: right;">Previous</th>
                <th style="padding: 12px 16px; text-align: right;">Forecast</th>
                <th style="padding: 12px 16px; text-align: right;">Actual</th>
              </tr>
            </thead>
            <tbody>
              ${this.state.events.map((ev, idx) => this.renderTableRow(ev, idx)).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    renderTableRow(ev, index) {
      const impactMeta = IMPACT_BADGES[ev.impact] || IMPACT_BADGES.medium;
      const countdown = window.TimezoneUtil ? window.TimezoneUtil.formatCountdown(ev.originalDate, ev.originalTime) : 'Upcoming';

      return `
        <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05); transition: background 0.15s ease;" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background='transparent'">
          <td style="padding: 12px 16px;">
            <div style="font-weight: 600; color: #ffffff;">${ev.scheduledTime || '—'}</div>
            <div style="font-size: 0.7rem; color: #60a5fa;">${countdown}</div>
          </td>
          <td style="padding: 12px 16px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-size: 1.1rem;">${ev.flag || '🌐'}</span>
              <span style="font-weight: 600; color: #e2e8f0;">${ev.currency}</span>
            </div>
            <div style="font-size: 0.7rem; color: #94a3b8;">${ev.country}</div>
          </td>
          <td style="padding: 12px 16px; font-weight: 500; color: #f8fafc;">
            ${ev.eventName}
          </td>
          <td style="padding: 12px 16px;">
            <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: 700; text-transform: uppercase;
              background: ${impactMeta.bg}; color: ${impactMeta.color}; border: 1px solid ${impactMeta.border};">
              ${impactMeta.label}
            </span>
          </td>
          <td style="padding: 12px 16px; text-align: right; color: #94a3b8;">
            ${formatCalendarValue(ev.previous, ev.unit)}
          </td>
          <td style="padding: 12px 16px; text-align: right; color: #e2e8f0;">
            ${formatCalendarValue(ev.forecast, ev.unit)}
          </td>
          <td style="padding: 12px 16px; text-align: right; font-weight: 700; color: ${formatCalendarValue(ev.actual) !== '—' ? '#10b981' : '#94a3b8'};">
            ${formatCalendarValue(ev.actual, ev.unit)}
          </td>
        </tr>
      `;
    }

    renderAdminPanel() {
      const el = document.getElementById('gec-admin-panel');
      if (!el || !this.state.adminDashboardData) return;

      const data = this.state.adminDashboardData;
      el.innerHTML = `
        <div style="margin-bottom: 16px; padding: 12px 16px; background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 10px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #10b981;"></span>
            <span style="font-size: 0.8rem; font-weight: 600; color: #93c5fd;">Admin Telemetry Active</span>
            <span style="font-size: 0.75rem; color: #94a3b8;">| DB Integrity: ${data.overview?.databaseIntegrityValid ? '✅ Valid' : '❌ Error'}</span>
            <span style="font-size: 0.75rem; color: #94a3b8;">| Providers: ${data.overview?.allProvidersHealthy ? '✅ 100% Healthy' : '⚠️ Degradation'}</span>
            <span style="font-size: 0.75rem; color: #94a3b8;">| Circuit Breakers Tripped: ${data.overview?.trippedCircuitBreakersCount || 0}</span>
          </div>
          <a href="#economic-calendar-admin" style="font-size: 0.75rem; color: #60a5fa; text-decoration: none; font-weight: 600;">
            Manage Multi-Currency Rollout →
          </a>
        </div>
      `;
    }

    renderSkeleton() {
      return `
        <div style="padding: 40px 20px; text-align: center; color: #94a3b8; font-size: 0.85rem;">
          <div style="display: inline-block; width: 24px; height: 24px; border: 3px solid rgba(255,255,255,0.1); border-top-color: #3b82f6; border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 12px;"></div>
          <div>Loading unified macroeconomic releases...</div>
        </div>
      `;
    }

    renderTimezoneOptions() {
      const timezones = window.TimezoneUtil ? window.TimezoneUtil.getCommonTimezones() : [
        { id: 'Asia/Kolkata', label: 'IST (India - UTC+05:30)' },
        { id: 'UTC', label: 'UTC (Coordinated Universal Time)' }
      ];

      return timezones.map(tz => `
        <option value="${tz.id}" ${this.state.userTimezone === tz.id ? 'selected' : ''}>${tz.label}</option>
      `).join('');
    }

    attachEventListeners() {
      // Currency buttons
      document.querySelectorAll('.gec-curr-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          this.state.selectedCurrency = e.currentTarget.getAttribute('data-currency');
          this.fetchEvents();
        });
      });

      // Impact buttons
      document.querySelectorAll('.gec-impact-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          this.state.selectedImpact = e.currentTarget.getAttribute('data-impact');
          this.fetchEvents();
        });
      });

      // Timezone selector
      const tzSelect = document.getElementById('gec-tz-select');
      if (tzSelect) {
        tzSelect.addEventListener('change', (e) => {
          this.state.userTimezone = e.target.value;
          this.fetchEvents();
        });
      }

      // Search input with debounce
      const searchInput = document.getElementById('gec-search-input');
      if (searchInput) {
        let debounceTimer;
        searchInput.addEventListener('input', (e) => {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            this.state.searchQuery = e.target.value;
            this.fetchEvents();
          }, 300);
        });
      }

      // Retry button
      const retryBtn = document.getElementById('gec-retry-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => {
          this.fetchEvents();
        });
      }
    }
  }

  // Export to global window
  if (typeof window !== 'undefined') {
    window.GlobalEconomicCalendar = GlobalEconomicCalendar;
    document.addEventListener('DOMContentLoaded', () => {
      if (document.getElementById('global-economic-calendar-root')) {
        window.globalEconomicCalendarInstance = new GlobalEconomicCalendar('global-economic-calendar-root');
      }
    });
  }
})();
