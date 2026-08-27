/**
 * Multi-Currency Rollout Service
 * 
 * Phase 7.7: Multi-Currency Production Expansion for the RiskLoop Economic Calendar.
 * 
 * Manages independent rollout status, safety gates, circuit breakers, and telemetry
 * for each major currency (USD, EUR, GBP, JPY), maintaining full isolation from
 * the Indian Economic Calendar subsystem and preserving existing USD configurations.
 * 
 * Supported Stages per Currency:
 * - DISABLED (Default for all new currencies)
 * - DRY_RUN (Official discovery only, 0 DB mutations)
 * - MANUAL_CANARY (Small-batch manual writes, limit <= 5, auto-rollback)
 * - SCHEDULED_CANARY (Low-frequency scheduled writes, limit <= 5, concurrency lock)
 * - LIMITED_PRODUCTION (Expanded batch limit <= 15)
 * - FULL_PRODUCTION (Full production synchronization, requires explicit admin authorization)
 */

import { blsSourceAdapter } from './providers/BLSSourceAdapter.js';
import { beaSourceAdapter } from './providers/BEASourceAdapter.js';
import { federalReserveSourceAdapter } from './providers/FederalReserveSourceAdapter.js';
import { ecbSourceAdapter } from './providers/ECBSourceAdapter.js';
import { boeSourceAdapter } from './providers/BoESourceAdapter.js';
import { bojSourceAdapter } from './providers/BoJSourceAdapter.js';
import { rbaSourceAdapter } from './providers/RBASourceAdapter.js';
import { bocSourceAdapter } from './providers/BoCSourceAdapter.js';
import { snbSourceAdapter } from './providers/SNBSourceAdapter.js';
import { pbocSourceAdapter } from './providers/PBoCSourceAdapter.js';
import { forexCanarySafetyService } from './ForexCanarySafetyService.js';
import { forexCanaryMonitoringService } from './ForexCanaryMonitoringService.js';
import { supabaseEconomicCalendarService } from '../SupabaseEconomicCalendarService.js';

export const MULTI_CURRENCY_STAGES = {
  DISABLED: 'DISABLED',
  DRY_RUN: 'DRY_RUN',
  MANUAL_CANARY: 'MANUAL_CANARY',
  SCHEDULED_CANARY: 'SCHEDULED_CANARY',
  LIMITED_PRODUCTION: 'LIMITED_PRODUCTION',
  FULL_PRODUCTION: 'FULL_PRODUCTION'
};

const STAGE_ORDER = [
  MULTI_CURRENCY_STAGES.DISABLED,
  MULTI_CURRENCY_STAGES.DRY_RUN,
  MULTI_CURRENCY_STAGES.MANUAL_CANARY,
  MULTI_CURRENCY_STAGES.SCHEDULED_CANARY,
  MULTI_CURRENCY_STAGES.LIMITED_PRODUCTION,
  MULTI_CURRENCY_STAGES.FULL_PRODUCTION
];

export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY'];

const CURRENCY_METADATA = {
  USD: {
    name: 'US Dollar',
    country: 'United States',
    countryCode: 'US',
    flag: '🇺🇸',
    timezone: 'America/New_York',
    providers: ['BLS', 'BEA', 'Federal Reserve']
  },
  EUR: {
    name: 'Euro',
    country: 'Euro Area',
    countryCode: 'EU',
    flag: '🇪🇺',
    timezone: 'Europe/Brussels',
    providers: ['ECB/Eurostat']
  },
  GBP: {
    name: 'British Pound',
    country: 'United Kingdom',
    countryCode: 'GB',
    flag: '🇬🇧',
    timezone: 'Europe/London',
    providers: ['BoE/ONS']
  },
  JPY: {
    name: 'Japanese Yen',
    country: 'Japan',
    countryCode: 'JP',
    flag: '🇯🇵',
    timezone: 'Asia/Tokyo',
    providers: ['BoJ/SBJ']
  },
  AUD: {
    name: 'Australian Dollar',
    country: 'Australia',
    countryCode: 'AU',
    flag: '🇦🇺',
    timezone: 'Australia/Sydney',
    providers: ['RBA/ABS']
  },
  CAD: {
    name: 'Canadian Dollar',
    country: 'Canada',
    countryCode: 'CA',
    flag: '🇨🇦',
    timezone: 'America/Toronto',
    providers: ['BoC/StatCan']
  },
  CHF: {
    name: 'Swiss Franc',
    country: 'Switzerland',
    countryCode: 'CH',
    flag: '🇨🇭',
    timezone: 'Europe/Zurich',
    providers: ['SNB/FSO']
  },
  CNY: {
    name: 'Chinese Yuan',
    country: 'China',
    countryCode: 'CN',
    flag: '🇨🇳',
    timezone: 'Asia/Shanghai',
    providers: ['PBoC/NBS']
  }
};

export class MultiCurrencyRolloutService {
  constructor() {
    this.adapters = {
      USD: [blsSourceAdapter, beaSourceAdapter, federalReserveSourceAdapter],
      EUR: [ecbSourceAdapter],
      GBP: [boeSourceAdapter],
      JPY: [bojSourceAdapter],
      AUD: [rbaSourceAdapter],
      CAD: [bocSourceAdapter],
      CHF: [snbSourceAdapter],
      CNY: [pbocSourceAdapter]
    };

    // Initialize per-currency state map
    this.currencyState = {};
    for (const c of SUPPORTED_CURRENCIES) {
      this.currencyState[c] = {
        currency: c,
        metadata: CURRENCY_METADATA[c],
        stage: MULTI_CURRENCY_STAGES.DISABLED,
        circuitBreakerTripped: false,
        consecutiveFailures: 0,
        successfulCycles: 0,
        failedCycles: 0,
        rollbacksCount: 0,
        lastSuccessfulSync: null,
        lastFailureReason: null,
        history: [{
          id: `hist-${c}-${Date.now()}`,
          stage: MULTI_CURRENCY_STAGES.DISABLED,
          fromStage: null,
          timestamp: new Date().toISOString(),
          reason: 'Initial system default state'
        }]
      };
    }
  }

  /**
   * Return batch size limit for a stage
   */
  getBatchLimitForStage(stage) {
    switch (stage) {
      case MULTI_CURRENCY_STAGES.DISABLED:
      case MULTI_CURRENCY_STAGES.DRY_RUN:
        return 0;
      case MULTI_CURRENCY_STAGES.MANUAL_CANARY:
      case MULTI_CURRENCY_STAGES.SCHEDULED_CANARY:
        return 5;
      case MULTI_CURRENCY_STAGES.LIMITED_PRODUCTION:
        return 15;
      case MULTI_CURRENCY_STAGES.FULL_PRODUCTION:
        return 50;
      default:
        return 0;
    }
  }

  /**
   * Return summary of all supported currencies
   */
  async getCurrenciesSummary() {
    const list = {};
    for (const c of SUPPORTED_CURRENCIES) {
      list[c] = await this.getCurrencyStatus(c);
    }
    return {
      service: 'MultiCurrencyRolloutService',
      currenciesCount: SUPPORTED_CURRENCIES.length,
      supportedCurrencies: SUPPORTED_CURRENCIES,
      currencies: list,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Return detailed status of a specific currency
   */
  async getCurrencyStatus(currency) {
    const curr = (currency || '').toUpperCase();
    const state = this.currencyState[curr];
    if (!state) {
      return { error: 'UNSUPPORTED_CURRENCY', message: `Currency "${currency}" is not supported.` };
    }

    const adapters = this.adapters[curr] || [];
    const providerHealth = [];
    for (const adapter of adapters) {
      try {
        const health = await adapter.healthCheck();
        providerHealth.push(health);
      } catch (err) {
        providerHealth.push({ provider: adapter.getProviderName(), status: 'unhealthy', error: err.message });
      }
    }

    return {
      currency: curr,
      name: state.metadata.name,
      country: state.metadata.country,
      countryCode: state.metadata.countryCode,
      flag: state.metadata.flag,
      timezone: state.metadata.timezone,
      currentStage: state.stage,
      stageIndex: STAGE_ORDER.indexOf(state.stage),
      batchLimit: this.getBatchLimitForStage(state.stage),
      databaseWritesAllowed: state.stage !== MULTI_CURRENCY_STAGES.DISABLED && state.stage !== MULTI_CURRENCY_STAGES.DRY_RUN,
      circuitBreakerTripped: state.circuitBreakerTripped,
      consecutiveFailures: state.consecutiveFailures,
      successfulCycles: state.successfulCycles,
      failedCycles: state.failedCycles,
      rollbacksCount: state.rollbacksCount,
      lastSuccessfulSync: state.lastSuccessfulSync,
      lastFailureReason: state.lastFailureReason,
      providerHealth,
      providers: state.metadata.providers
    };
  }

  /**
   * Return persistent transition history for a specific currency
   */
  getCurrencyHistory(currency, limit = 50) {
    const curr = (currency || '').toUpperCase();
    const state = this.currencyState[curr];
    if (!state) {
      return [];
    }
    return state.history.slice(0, limit);
  }

  /**
   * Advance or transition the rollout stage for a specific currency
   */
  async advanceCurrencyStage(currency, targetStage, options = {}) {
    const curr = (currency || '').toUpperCase();
    const state = this.currencyState[curr];
    if (!state) {
      return { success: false, error: 'UNSUPPORTED_CURRENCY', message: `Currency "${currency}" is not supported.` };
    }

    const { explicitApproval = false, reason = 'Administrative stage transition' } = options;

    if (!explicitApproval) {
      return {
        success: false,
        error: 'EXPLICIT_APPROVAL_REQUIRED',
        message: `Advancing stage for ${curr} requires explicit administrative approval (explicitApproval: true).`
      };
    }

    const targetIdx = STAGE_ORDER.indexOf(targetStage);
    const currentIdx = STAGE_ORDER.indexOf(state.stage);

    if (targetIdx === -1) {
      return { success: false, error: 'INVALID_STAGE', message: `Unknown target stage: "${targetStage}".` };
    }

    // Prevent non-sequential stage skips when advancing
    if (targetIdx > currentIdx + 1) {
      return {
        success: false,
        error: 'STAGE_SKIP_DISALLOWED',
        message: `Cannot skip stages for ${curr}. Current: ${state.stage}, Target: ${targetStage}. Progress sequentially.`
      };
    }

    // Circuit breaker check
    if (state.circuitBreakerTripped) {
      return {
        success: false,
        error: 'CIRCUIT_BREAKER_TRIPPED',
        message: `Circuit breaker is TRIPPED for ${curr}. Reset circuit breaker before advancing.`
      };
    }

    // Database integrity gate
    if (targetIdx > 0) {
      const dbIntegrity = await forexCanaryMonitoringService.verifyDatabaseIntegrity();
      if (!dbIntegrity.valid) {
        return {
          success: false,
          error: 'DATABASE_INTEGRITY_FAIL',
          message: `Database integrity check failed: ${dbIntegrity.issuesCount} anomalies detected.`
        };
      }
    }

    const previousStage = state.stage;
    state.stage = targetStage;

    const historyEntry = {
      id: `hist-${curr}-${Date.now()}`,
      stage: targetStage,
      fromStage: previousStage,
      timestamp: new Date().toISOString(),
      reason,
      batchLimit: this.getBatchLimitForStage(targetStage)
    };
    state.history.unshift(historyEntry);

    forexCanaryMonitoringService.recordAudit({
      action: 'MULTI_CURRENCY_STAGE_ADVANCE',
      currency: curr,
      ...historyEntry
    });

    return {
      success: true,
      currency: curr,
      previousStage,
      currentStage: state.stage,
      batchLimit: this.getBatchLimitForStage(state.stage),
      message: `Currency ${curr} successfully advanced to ${targetStage}`
    };
  }

  /**
   * Rollback or demote a specific currency to DISABLED (or lower stage)
   */
  async rollbackCurrency(currency, reason = 'Administrative currency rollback') {
    const curr = (currency || '').toUpperCase();
    const state = this.currencyState[curr];
    if (!state) {
      return { success: false, error: 'UNSUPPORTED_CURRENCY', message: `Currency "${currency}" is not supported.` };
    }

    const previousStage = state.stage;
    state.stage = MULTI_CURRENCY_STAGES.DISABLED;
    state.rollbacksCount++;

    const historyEntry = {
      id: `hist-${curr}-${Date.now()}`,
      stage: MULTI_CURRENCY_STAGES.DISABLED,
      fromStage: previousStage,
      timestamp: new Date().toISOString(),
      reason: `ROLLBACK: ${reason}`,
      rolledBack: true
    };
    state.history.unshift(historyEntry);

    forexCanaryMonitoringService.recordAudit({
      action: 'MULTI_CURRENCY_ROLLBACK',
      currency: curr,
      ...historyEntry
    });

    console.warn(`⚠️ [MultiCurrencyRollout] Rollback executed for ${curr}: ${reason}. Stage set to DISABLED.`);

    return {
      success: true,
      currency: curr,
      previousStage,
      currentStage: state.stage,
      message: `Currency ${curr} successfully rolled back to DISABLED`
    };
  }

  /**
   * Reset circuit breaker for a specific currency
   */
  resetCurrencyCircuitBreaker(currency, reason = 'Administrative circuit breaker reset') {
    const curr = (currency || '').toUpperCase();
    const state = this.currencyState[curr];
    if (!state) {
      return { success: false, error: 'UNSUPPORTED_CURRENCY' };
    }

    state.circuitBreakerTripped = false;
    state.consecutiveFailures = 0;

    forexCanaryMonitoringService.recordAudit({
      action: 'MULTI_CURRENCY_CIRCUIT_BREAKER_RESET',
      currency: curr,
      timestamp: new Date().toISOString(),
      reason
    });

    return {
      success: true,
      currency: curr,
      circuitBreakerTripped: false,
      message: `Circuit breaker reset successfully for ${curr}`
    };
  }

  /**
   * Record a failure for a specific currency and trip its circuit breaker if threshold reached
   */
  recordCurrencyFailure(currency, reason = 'Sync failure') {
    const curr = (currency || '').toUpperCase();
    const state = this.currencyState[curr];
    if (!state) return;

    state.failedCycles++;
    state.consecutiveFailures++;
    state.lastFailureReason = reason;

    if (state.consecutiveFailures >= 3) {
      state.circuitBreakerTripped = true;
      console.error(`🚨 [MultiCurrencyRollout] Circuit breaker TRIPPED for currency ${curr} after ${state.consecutiveFailures} consecutive failures!`);
    }
  }

  /**
   * Record a successful sync for a specific currency
   */
  recordCurrencySuccess(currency) {
    const curr = (currency || '').toUpperCase();
    const state = this.currencyState[curr];
    if (!state) return;

    state.successfulCycles++;
    state.consecutiveFailures = 0;
    state.lastSuccessfulSync = new Date().toISOString();
  }

  /**
   * Discover events for a specific currency
   */
  async discoverCurrencyEvents(currency, options = {}) {
    const curr = (currency || '').toUpperCase();
    const adapters = this.adapters[curr] || [];
    const allEvents = [];

    for (const adapter of adapters) {
      try {
        const result = await adapter.fetchUpcomingEvents(options);
        if (result && Array.isArray(result.events)) {
          allEvents.push(...result.events);
        }
      } catch (err) {
        console.error(`Error discovering events from adapter ${adapter.getProviderName()} for ${curr}:`, err.message);
      }
    }

    return {
      success: true,
      currency: curr,
      count: allEvents.length,
      events: allEvents
    };
  }
}

export const multiCurrencyRolloutService = new MultiCurrencyRolloutService();
