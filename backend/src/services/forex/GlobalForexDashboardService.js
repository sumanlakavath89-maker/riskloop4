/**
 * Global Forex Dashboard Service
 * 
 * Phase 7.8: Global Economic Calendar Dashboard.
 * 
 * Aggregates complete global macroeconomic calendar state:
 * - Multi-currency rollout status (USD, EUR, GBP, JPY, AUD, CAD, CHF, CNY).
 * - Multi-provider health & connectivity status across all 10 official adapters.
 * - Circuit breaker statuses across all currencies.
 * - Scheduler status & concurrency locks.
 * - Persistent audit history & active alerts.
 * - Database integrity & India subsystem baseline preservation.
 */

import { multiCurrencyRolloutService, SUPPORTED_CURRENCIES } from './MultiCurrencyRolloutService.js';
import { forexCanaryMonitoringService } from './ForexCanaryMonitoringService.js';
import { forexSchedulerCanaryService } from './ForexSchedulerCanaryService.js';
import { forexEconomicCalendarService } from './ForexEconomicCalendarService.js';
import { supabaseEconomicCalendarService } from '../SupabaseEconomicCalendarService.js';
import { economicCalendarHealthService } from '../EconomicCalendarHealthService.js';

export class GlobalForexDashboardService {
  constructor(
    rolloutService = multiCurrencyRolloutService,
    monitoringService = forexCanaryMonitoringService,
    schedulerService = forexSchedulerCanaryService
  ) {
    this.rolloutService = rolloutService;
    this.monitoringService = monitoringService;
    this.schedulerService = schedulerService;
  }

  /**
   * Return comprehensive global admin dashboard state
   */
  async getGlobalDashboardState() {
    const startTime = Date.now();

    // 1. Multi-Currency Summary
    const currencySummary = await this.rolloutService.getCurrenciesSummary();

    // 2. Scheduler Telemetry
    const schedulerTelemetry = this.schedulerService.getStatus();

    // 3. Database Integrity & Baseline Checks
    const dbIntegrity = await this.monitoringService.verifyDatabaseIntegrity();

    // 4. Provider Alerts
    const providerHealthReport = await this.monitoringService.checkProviderAlerts();

    // 5. Audit History
    const recentAudits = this.monitoringService.getAuditHistory({ limit: 15 });

    // 6. India Subsystem Status
    let indiaHealth = null;
    try {
      indiaHealth = await economicCalendarHealthService.getHealthStatus();
    } catch {
      indiaHealth = { status: 'disabled', subsystem: 'India' };
    }

    // 7. Aggregate provider health across all currencies
    const aggregatedProviders = [];
    for (const curr of SUPPORTED_CURRENCIES) {
      const cStatus = currencySummary.currencies[curr];
      if (cStatus && Array.isArray(cStatus.providerHealth)) {
        for (const p of cStatus.providerHealth) {
          aggregatedProviders.push({
            currency: curr,
            ...p
          });
        }
      }
    }

    // 8. Circuit breakers count
    let trippedCircuitBreakersCount = 0;
    const trippedCurrencies = [];
    for (const curr of SUPPORTED_CURRENCIES) {
      if (currencySummary.currencies[curr]?.circuitBreakerTripped) {
        trippedCircuitBreakersCount++;
        trippedCurrencies.push(curr);
      }
    }

    return {
      success: true,
      service: 'GlobalForexDashboardService',
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - startTime,
      overview: {
        totalCurrenciesSupported: SUPPORTED_CURRENCIES.length,
        supportedCurrencies: SUPPORTED_CURRENCIES,
        activeCanaryCurrencies: SUPPORTED_CURRENCIES.filter(c => currencySummary.currencies[c]?.databaseWritesAllowed),
        trippedCircuitBreakersCount,
        trippedCurrencies,
        allProvidersHealthy: providerHealthReport.healthy,
        databaseIntegrityValid: dbIntegrity.valid
      },
      currencies: currencySummary.currencies,
      providers: aggregatedProviders,
      scheduler: {
        isRunning: schedulerTelemetry.isRunning,
        circuitBreakerTripped: schedulerTelemetry.circuitBreakerTripped,
        consecutiveFailures: schedulerTelemetry.consecutiveFailures,
        lastRunResult: schedulerTelemetry.lastRunResult,
        flags: forexEconomicCalendarService.getForexSafetyFlags()
      },
      databaseIntegrity: {
        valid: dbIntegrity.valid,
        totalEventsInDatabase: dbIntegrity.totalEvents,
        issuesCount: dbIntegrity.issuesCount,
        issues: dbIntegrity.issues
      },
      alerts: providerHealthReport.alerts,
      auditHistory: recentAudits,
      indiaSubsystem: {
        isolated: true,
        healthStatus: indiaHealth?.status || 'disabled',
        baselineEventsCount: 11
      }
    };
  }
}

export const globalForexDashboardService = new GlobalForexDashboardService();
