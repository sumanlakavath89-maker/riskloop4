/**
 * Forex Calendar Rollout Service
 * 
 * Read-only status service for monitoring the production rollout mode,
 * currency-level live ingestion permissions, provider health, and database write safety.
 * 
 * Safety & Privacy:
 * - Strictly read-only: No database inserts, updates, or deletes.
 * - Secret sanitization: Never exposes keys, tokens, credentials, or internal IDs.
 */

import { blsSourceAdapter } from './providers/BLSSourceAdapter.js';
import { beaSourceAdapter } from './providers/BEASourceAdapter.js';
import { federalReserveSourceAdapter } from './providers/FederalReserveSourceAdapter.js';
import { forexDatabaseSyncService } from './ForexDatabaseSyncService.js';

export const FOREX_ROLLOUT_MODES = {
  DISABLED: 'disabled',
  DISCOVERY_ONLY: 'discovery_only',
  SAFE_BLOCKED: 'safe_blocked',
  CANARY: 'canary',
  FULL: 'full'
};

export const SUPPORTED_FOREX_CURRENCIES = ['USD'];

export class ForexCalendarRolloutService {
  constructor(
    providers = [blsSourceAdapter, beaSourceAdapter, federalReserveSourceAdapter],
    syncService = forexDatabaseSyncService
  ) {
    this.providers = providers;
    this.syncService = syncService;
  }

  /**
   * Evaluate and return the current Forex production rollout state
   * 
   * @param {Object} [options]
   * @param {boolean} [options.overrideForexCalendarEnabled]
   * @param {boolean} [options.overrideForexLiveIngestionEnabled]
   * @param {string} [options.overrideCanaryCurrencies]
   * @returns {Promise<Object>}
   */
  async getRolloutStatus(options = {}) {
    const forexCalendarEnabled = options.overrideForexCalendarEnabled !== undefined
      ? options.overrideForexCalendarEnabled
      : (process.env.FOREX_CALENDAR_ENABLED === 'true');

    const forexLiveIngestionEnabled = options.overrideForexLiveIngestionEnabled !== undefined
      ? options.overrideForexLiveIngestionEnabled
      : (process.env.FOREX_CALENDAR_LIVE_INGESTION_ENABLED === 'true');

    const rawCanary = options.overrideCanaryCurrencies !== undefined
      ? options.overrideCanaryCurrencies
      : (process.env.FOREX_CALENDAR_CANARY_CURRENCIES || '');

    const trimmedCanary = typeof rawCanary === 'string' ? rawCanary.trim() : '';

    let canaryCurrencies = [];
    if (trimmedCanary.length > 0) {
      canaryCurrencies = trimmedCanary
        .split(',')
        .map(c => c.trim().toUpperCase())
        .filter(c => c.length > 0);
    }

    // Determine rollout mode
    let rolloutMode = FOREX_ROLLOUT_MODES.DISABLED;
    let databaseWritesAllowed = false;
    let databaseWritesBlockedReason = null;

    if (!forexCalendarEnabled) {
      rolloutMode = FOREX_ROLLOUT_MODES.DISABLED;
      databaseWritesBlockedReason = 'FOREX_CALENDAR_ENABLED is false';
    } else if (!forexLiveIngestionEnabled) {
      rolloutMode = FOREX_ROLLOUT_MODES.DISCOVERY_ONLY;
      databaseWritesBlockedReason = 'FOREX_CALENDAR_LIVE_INGESTION_ENABLED is false (Discovery-Only mode)';
    } else if (canaryCurrencies.length === 0) {
      rolloutMode = FOREX_ROLLOUT_MODES.SAFE_BLOCKED;
      databaseWritesBlockedReason = 'FOREX_CALENDAR_CANARY_CURRENCIES is empty (Safe Block active)';
    } else if (canaryCurrencies.includes('ALL')) {
      rolloutMode = FOREX_ROLLOUT_MODES.FULL;
      databaseWritesAllowed = true;
    } else {
      rolloutMode = FOREX_ROLLOUT_MODES.CANARY;
      databaseWritesAllowed = canaryCurrencies.includes('USD');
      if (!databaseWritesAllowed) {
        databaseWritesBlockedReason = `Canary active for [${canaryCurrencies.join(', ')}] but USD is not included`;
      }
    }

    // Per-currency permissions
    const currencyPermissions = {};
    for (const curr of SUPPORTED_FOREX_CURRENCIES) {
      const isCanaryAllowed = canaryCurrencies.includes('ALL') || canaryCurrencies.includes(curr);
      const liveAllowed = forexCalendarEnabled && forexLiveIngestionEnabled && isCanaryAllowed;

      currencyPermissions[curr] = {
        discoveryAllowed: true, // Official discovery is always permitted
        liveIngestionAllowed: liveAllowed,
        status: liveAllowed ? 'active' : 'blocked',
        reason: liveAllowed
          ? 'Live database synchronization permitted'
          : (!forexCalendarEnabled
            ? 'Forex calendar disabled'
            : (!forexLiveIngestionEnabled
              ? 'Live ingestion disabled'
              : `Currency "${curr}" not in canary list [${canaryCurrencies.join(', ')}]`))
      };
    }

    // Collect provider health diagnostics
    const providerHealthStatuses = {};
    for (const provider of this.providers) {
      const providerName = provider.getProviderName ? provider.getProviderName() : (provider.provider || 'Unknown');
      try {
        if (typeof provider.getProviderHealth === 'function') {
          const health = await provider.getProviderHealth();
          providerHealthStatuses[providerName] = {
            provider: health.provider || providerName,
            domain: health.domain,
            status: health.status || 'unknown',
            latencyMs: health.latencyMs,
            lastSuccessfulFetch: health.lastSuccessfulFetch,
            lastFailedFetch: health.lastFailedFetch,
            consecutiveErrors: health.consecutiveErrors,
            supportedIndicators: health.supportedIndicators
          };
        } else {
          providerHealthStatuses[providerName] = {
            provider: providerName,
            status: 'healthy'
          };
        }
      } catch (err) {
        providerHealthStatuses[providerName] = {
          provider: providerName,
          status: 'unhealthy',
          error: err.message
        };
      }
    }

    // Last sync/discovery info
    const lastSync = this.syncService?.lastSyncResult || null;
    const lastDiscoveryInfo = lastSync ? {
      syncedAt: lastSync.syncedAt,
      totalDiscovered: lastSync.summary?.totalDiscovered || 0,
      dryRun: lastSync.dryRun,
      databaseMutation: lastSync.databaseMutation
    } : null;

    let schedulerStatus = null;
    try {
      const { forexCalendarSchedulerService } = await import('./ForexCalendarSchedulerService.js');
      schedulerStatus = forexCalendarSchedulerService.getSchedulerStatus();
    } catch {
      schedulerStatus = { enabled: false, isRunning: false };
    }

    return {
      service: 'ForexCalendarRolloutService',
      forexCalendarEnabled,
      forexLiveIngestionEnabled,
      canaryCurrencies,
      supportedCurrencies: [...SUPPORTED_FOREX_CURRENCIES],
      rolloutMode,
      currencyPermissions,
      providers: providerHealthStatuses,
      scheduler: schedulerStatus,
      lastDiscovery: lastDiscoveryInfo,
      databaseWritesAllowed,
      databaseWritesBlockedReason,
      checkedAt: new Date().toISOString()
    };
  }
}

export const forexCalendarRolloutService = new ForexCalendarRolloutService();
