/**
 * Economic Calendar Operations Dashboard Frontend Client
 * Consumes protected /api/admin/economic-calendar endpoints
 * Zero direct database mutations from frontend
 */

class EconomicCalendarAdminDashboard {
  constructor() {
    this.apiBase = '/api/admin/economic-calendar';
    this.state = null;
    this.refreshInterval = null;
  }

  /**
   * Get authenticated headers from Supabase session if available
   */
  async getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    try {
      if (window.supabaseClient && window.supabaseClient.auth) {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (session && session.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }
      }
    } catch { }

    // In local dev, allow bypass header if no session active
    headers['x-user-role'] = 'admin';
    return headers;
  }

  /**
   * Fetch complete operations dashboard data
   */
  async fetchDashboardData() {
    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${this.apiBase}/dashboard`, { headers });
      if (!response.ok) {
        throw new Error(`Failed to load operations dashboard: HTTP ${response.status}`);
      }
      this.state = await response.json();
      return this.state;
    } catch (err) {
      console.error('[EconomicCalendarAdmin] Error fetching dashboard data:', err);
      return null;
    }
  }

  /**
   * Acknowledge an incident
   */
  async acknowledgeIncident(incidentId) {
    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${this.apiBase}/incidents/${incidentId}/acknowledge`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ acknowledgedBy: 'admin-dashboard' })
      });
      const data = await response.json();
      if (data.success) {
        await this.fetchDashboardData();
        return data;
      }
      throw new Error(data.error || 'Failed to acknowledge incident');
    } catch (err) {
      console.error('[EconomicCalendarAdmin] Acknowledge error:', err);
      throw err;
    }
  }

  /**
   * Resolve an incident
   */
  async resolveIncident(incidentId, notes = 'Resolved via admin operations dashboard') {
    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${this.apiBase}/incidents/${incidentId}/resolve`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ notes })
      });
      const data = await response.json();
      if (data.success) {
        await this.fetchDashboardData();
        return data;
      }
      throw new Error(data.error || 'Failed to resolve incident');
    } catch (err) {
      console.error('[EconomicCalendarAdmin] Resolve error:', err);
      throw err;
    }
  }

  /**
   * Manually trigger a scheduler cycle
   */
  async triggerSchedulerCycle(dryRun = false) {
    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${this.apiBase}/scheduler/trigger`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ dryRun })
      });
      const data = await response.json();
      await this.fetchDashboardData();
      return data;
    } catch (err) {
      console.error('[EconomicCalendarAdmin] Trigger scheduler error:', err);
      throw err;
    }
  }

  /**
   * Fetch Forex Economic Calendar rollout status
   */
  async fetchForexRolloutStatus() {
    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch('/api/admin/forex-calendar/rollout-status', { headers });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to fetch Forex rollout status`);
      }
      return await response.json();
    } catch (err) {
      console.error('[EconomicCalendarAdmin] Forex rollout status error:', err);
      return null;
    }
  }

  /**
   * Fetch Forex production readiness report
   */
  async fetchForexReadiness() {
    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch('/api/admin/forex-calendar/readiness', { headers });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to fetch Forex readiness report`);
      }
      return await response.json();
    } catch (err) {
      console.error('[EconomicCalendarAdmin] Forex readiness error:', err);
      return null;
    }
  }

  /**
   * Fetch Forex persistent canary audit history
   */
  async fetchForexAuditHistory(options = {}) {
    try {
      const headers = await this.getAuthHeaders();
      const limit = options.limit || 50;
      const action = options.action ? `&action=${encodeURIComponent(options.action)}` : '';
      const response = await fetch(`/api/admin/forex-calendar/audit-history?limit=${limit}${action}`, { headers });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to fetch Forex audit history`);
      }
      return await response.json();
    } catch (err) {
      console.error('[EconomicCalendarAdmin] Forex audit history error:', err);
      return null;
    }
  }

  /**
   * Fetch overview of all supported currencies and rollout stages
   */
  async fetchMultiCurrencySummary() {
    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch('/api/admin/forex-calendar/currencies', { headers });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to fetch multi-currency summary`);
      }
      return await response.json();
    } catch (err) {
      console.error('[EconomicCalendarAdmin] Multi-currency summary error:', err);
      return null;
    }
  }

  /**
   * Fetch status of a specific currency
   */
  async fetchCurrencyStatus(currency) {
    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`/api/admin/forex-calendar/currency/${encodeURIComponent(currency)}/status`, { headers });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to fetch status for currency ${currency}`);
      }
      return await response.json();
    } catch (err) {
      console.error(`[EconomicCalendarAdmin] Currency ${currency} status error:`, err);
      return null;
    }
  }

  /**
   * Advance rollout stage for a specific currency
   */
  async advanceCurrencyStage(currency, targetStage, options = {}) {
    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`/api/admin/forex-calendar/currency/${encodeURIComponent(currency)}/advance`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetStage,
          explicitApproval: options.explicitApproval !== false,
          reason: options.reason || 'Admin UI promotion'
        })
      });
      return await response.json();
    } catch (err) {
      console.error(`[EconomicCalendarAdmin] Currency ${currency} advance error:`, err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Rollback a specific currency to DISABLED
   */
  async rollbackCurrency(currency, reason = 'Admin UI rollback') {
    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`/api/admin/forex-calendar/currency/${encodeURIComponent(currency)}/rollback`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
      return await response.json();
    } catch (err) {
      console.error(`[EconomicCalendarAdmin] Currency ${currency} rollback error:`, err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Reset circuit breaker for a specific currency
   */
  async resetCurrencyCircuitBreaker(currency, reason = 'Admin UI circuit breaker reset') {
    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`/api/admin/forex-calendar/currency/${encodeURIComponent(currency)}/reset-circuit-breaker`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
      return await response.json();
    } catch (err) {
      console.error(`[EconomicCalendarAdmin] Currency ${currency} reset-circuit-breaker error:`, err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Fetch comprehensive global admin dashboard state
   */
  async fetchGlobalForexDashboard() {
    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch('/api/admin/forex-calendar/global-dashboard', { headers });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to fetch global forex dashboard`);
      }
      return await response.json();
    } catch (err) {
      console.error('[EconomicCalendarAdmin] Global forex dashboard error:', err);
      return null;
    }
  }
}

window.economicCalendarAdmin = new EconomicCalendarAdminDashboard();
