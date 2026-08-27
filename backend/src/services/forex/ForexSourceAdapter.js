/**
 * Forex Source Adapter Interface & Mock Adapter
 * 
 * Provider-independent adapter interface for Forex economic calendar sources.
 * Phase 7.1 USD Foundation (No real paid API connected).
 */

export class ForexSourceAdapter {
  constructor(providerName = 'generic_forex_provider') {
    this.providerName = providerName;
  }

  getProviderName() {
    return this.providerName;
  }

  /**
   * Fetch upcoming Forex calendar events
   * Abstract interface method to be implemented by future concrete adapters
   */
  async fetchUpcomingEvents(options = {}) {
    throw new Error(`fetchUpcomingEvents() must be implemented by adapter ${this.providerName}`);
  }

  /**
   * Fetch a specific official release
   * Abstract interface method to be implemented by future concrete adapters
   */
  async fetchRelease(eventId, options = {}) {
    throw new Error(`fetchRelease() must be implemented by adapter ${this.providerName}`);
  }

  /**
   * Check provider connectivity / health
   */
  async healthCheck() {
    return {
      provider: this.providerName,
      status: 'idle',
      connected: false,
      message: 'Base adapter interface initialized (No external API connected in Phase 7.1)'
    };
  }
}

/**
 * Mock / Dry-Run Forex Source Adapter for safe offline architecture validation
 */
export class MockForexSourceAdapter extends ForexSourceAdapter {
  constructor() {
    super('mock_usd_forex_adapter');
  }

  async healthCheck() {
    return {
      provider: this.providerName,
      status: 'healthy',
      connected: true,
      mode: 'mock_dry_run'
    };
  }

  async fetchUpcomingEvents(options = {}) {
    const defaultEvents = [
      {
        country: 'United States',
        currency: 'USD',
        event_name: 'US Nonfarm Payrolls',
        canonical_event_name: 'Non-Farm Payrolls',
        event_date: '2026-09-04',
        event_time: '08:30',
        timezone: 'America/New_York',
        previous: '73000',
        forecast: '75000',
        actual: null,
        impact: 'high',
        status: 'upcoming',
        source: 'mock_usd_forex_adapter'
      },
      {
        country: 'United States',
        currency: 'USD',
        event_name: 'US CPI (MoM)',
        canonical_event_name: 'CPI',
        event_date: '2026-09-11',
        event_time: '08:30',
        timezone: 'America/New_York',
        previous: '0.2',
        forecast: '0.2',
        actual: null,
        impact: 'high',
        status: 'upcoming',
        source: 'mock_usd_forex_adapter'
      }
    ];

    return {
      success: true,
      provider: this.providerName,
      count: defaultEvents.length,
      events: defaultEvents
    };
  }

  async fetchRelease(eventId, options = {}) {
    return {
      success: true,
      provider: this.providerName,
      eventId,
      status: 'simulated_only'
    };
  }
}

export const mockForexSourceAdapter = new MockForexSourceAdapter();
