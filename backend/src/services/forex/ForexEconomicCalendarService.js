/**
 * Forex Economic Calendar Service
 * 
 * Central coordinator service for Forex macroeconomic calendar processing.
 * Phase 7.2 Official USD Source Integration (BLS & BEA).
 * 
 * Provider-independent architecture:
 * - Event Normalization (ForexEventNormalizer)
 * - Event Validation (ForexEventValidator)
 * - Source Adapter Interface (ForexSourceAdapter)
 * - Official Provider Adapters (BLSSourceAdapter, BEASourceAdapter)
 * - Safety Switches & Dry-Run Discovery Pipeline
 */

import { forexEventNormalizer, SUPPORTED_USD_EVENTS } from './ForexEventNormalizer.js';
import { forexEventValidator } from './ForexEventValidator.js';
import { mockForexSourceAdapter, ForexSourceAdapter } from './ForexSourceAdapter.js';
import { blsSourceAdapter } from './providers/BLSSourceAdapter.js';
import { beaSourceAdapter } from './providers/BEASourceAdapter.js';
import { federalReserveSourceAdapter } from './providers/FederalReserveSourceAdapter.js';

export class ForexEconomicCalendarService {
  constructor(providers = [blsSourceAdapter, beaSourceAdapter, federalReserveSourceAdapter]) {
    this.providers = providers;
    this.normalizer = forexEventNormalizer;
    this.validator = forexEventValidator;
  }

  /**
   * Read current Forex safety flags from environment
   */
  getForexSafetyFlags() {
    const rawCanary = process.env.FOREX_CALENDAR_CANARY_CURRENCIES || '';
    const canaryCurrencies = rawCanary.trim().length > 0
      ? rawCanary.split(',').map(c => c.trim().toUpperCase()).filter(c => c.length > 0)
      : [];

    return {
      forexCalendarEnabled: process.env.FOREX_CALENDAR_ENABLED === 'true',
      forexSchedulerEnabled: process.env.FOREX_CALENDAR_SCHEDULER_ENABLED === 'true',
      forexLiveIngestionEnabled: process.env.FOREX_CALENDAR_LIVE_INGESTION_ENABLED === 'true',
      rawCanaryCurrencies: rawCanary,
      canaryCurrencies
    };
  }

  /**
   * Check if Forex Calendar scheduler is enabled
   */
  isForexCalendarEnabled(override = undefined) {
    if (override !== undefined) return Boolean(override);
    return process.env.FOREX_CALENDAR_ENABLED === 'true';
  }

  /**
   * Check if Forex Live Ingestion is enabled
   */
  isForexLiveIngestionEnabled(override = undefined) {
    if (override !== undefined) return Boolean(override);
    return process.env.FOREX_CALENDAR_LIVE_INGESTION_ENABLED === 'true';
  }

  /**
   * Check whether a currency is approved by FOREX_CALENDAR_CANARY_CURRENCIES
   */
  isCurrencyAllowed(currency, overrideCanary = undefined) {
    if (!currency || typeof currency !== 'string') return false;

    const raw = overrideCanary !== undefined
      ? overrideCanary
      : (process.env.FOREX_CALENDAR_CANARY_CURRENCIES || '');

    const trimmed = raw.trim();
    if (trimmed === '') return false; // Empty canary -> all currencies blocked from live ingestion
    if (trimmed.toLowerCase() === 'all') return true;

    const tokens = trimmed.split(',').map(t => t.trim().toUpperCase());
    return tokens.includes(currency.toUpperCase().trim());
  }

  /**
   * Get supported USD canonical events list
   */
  getSupportedUsdEvents() {
    return [...SUPPORTED_USD_EVENTS];
  }

  /**
   * Get official provider adapters
   */
  getOfficialProviders() {
    return [...this.providers];
  }

  /**
   * Aggregate provider health statuses across all official sources
   */
  async getProviderHealthStatuses() {
    const healthMap = {};
    for (const provider of this.providers) {
      const name = provider.getProviderName();
      try {
        healthMap[name] = await provider.getProviderHealth();
      } catch (err) {
        healthMap[name] = {
          provider: name,
          status: 'unhealthy',
          error: err.message
        };
      }
    }
    return healthMap;
  }

  /**
   * Validate a raw or structured Forex event
   */
  validateForexEvent(rawEvent) {
    return this.validator.validateForexEvent(rawEvent);
  }

  /**
   * Normalize an incoming event name or object
   */
  normalizeForexEvent(rawEvent) {
    return this.normalizer.normalizeForexEvent(rawEvent);
  }

  /**
   * Get comprehensive status of the Forex calendar subsystem
   */
  async getForexCalendarStatus(options = {}) {
    const flags = this.getForexSafetyFlags();
    const providerHealth = await this.getProviderHealthStatuses();

    return {
      service: 'ForexEconomicCalendarService',
      phase: '7.2 (Official USD Source Integration)',
      supportedCurrencies: ['USD'],
      supportedUsdEvents: this.getSupportedUsdEvents(),
      safetyFlags: flags,
      providers: providerHealth,
      rolloutMode: !flags.forexCalendarEnabled
        ? 'disabled'
        : !flags.forexLiveIngestionEnabled
        ? 'discovery_only'
        : flags.canaryCurrencies.length === 0
        ? 'safe_blocked'
        : flags.rawCanaryCurrencies.trim().toLowerCase() === 'all'
        ? 'full'
        : 'canary',
      checkedAt: new Date().toISOString()
    };
  }

  /**
   * Run official source discovery in safe dry-run mode (Zero database writes)
   */
  async runDryRunDiscovery(options = {}) {
    const { forexOfficialSourceDiscoveryService } = await import('./ForexOfficialSourceDiscoveryService.js');
    const discoveryResult = await forexOfficialSourceDiscoveryService.discoverOfficialEvents(options);

    return {
      success: discoveryResult.success,
      dryRun: true,
      mode: 'discovery_only',
      databaseMutation: false,
      discovered: discoveryResult.summary.totalDiscovered,
      valid: discoveryResult.summary.totalValidated,
      rejected: discoveryResult.summary.totalRejected,
      events: discoveryResult.events,
      providers: discoveryResult.providers,
      diagnostics: discoveryResult.diagnostics,
      checkedAt: new Date().toISOString()
    };
  }

  /**
   * Process and validate an incoming Forex event payload safely
   */
  processIncomingForexEvent(rawEvent, options = {}) {
    const validation = this.validateForexEvent(rawEvent);

    if (!validation.valid) {
      return {
        success: false,
        status: 'validation_failed',
        errors: validation.errors,
        rawEvent
      };
    }

    const normalized = validation.normalizedEvent;
    const flags = this.getForexSafetyFlags();

    const liveIngestionAllowed =
      (options.overrideLiveIngestion !== undefined ? options.overrideLiveIngestion : flags.forexLiveIngestionEnabled) &&
      this.isCurrencyAllowed(normalized.currency, options.overrideCanary);

    if (!liveIngestionAllowed) {
      return {
        success: true,
        status: 'dry_run_only',
        reason: 'FOREX_LIVE_INGESTION_DISABLED',
        message: `Forex live database ingestion is disabled for ${normalized.currency}. Event was normalized and validated without database write.`,
        event: normalized
      };
    }

    return {
      success: true,
      status: 'ready_for_ingestion',
      event: normalized
    };
  }
}

export const forexEconomicCalendarService = new ForexEconomicCalendarService();
