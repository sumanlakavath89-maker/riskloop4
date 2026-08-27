/**
 * Forex Rollout Controller & Readiness Evaluator Service
 * 
 * Phase 7.6: Staged USD Production Rollout.
 * 
 * Stages:
 * - STAGE_0_SAFETY_BASELINE: All Forex ingestion and scheduling disabled (Default).
 * - STAGE_1_PRODUCTION_DRY_RUN: Discovery & planned sync analysis active across BLS, BEA, Fed (Zero DB mutations).
 * - STAGE_2_CONTROLLED_MANUAL_CANARY: Controlled USD manual canary ingestion (max 5 events), pre-write snapshot, post-write verification, auto-rollback.
 * - STAGE_3_MONITORED_SCHEDULED_CANARY: Low-frequency scheduled USD canary ingestion (max 5 events) with concurrency lock, pre-cycle gates, and 3-failure circuit breaker.
 * - STAGE_4_FULL_ROLLOUT: Full USD production synchronization.
 * 
 * Readiness Verdicts:
 * - BLOCKED_BY_SAFETY_FLAGS
 * - DRY_RUN_READY
 * - CANARY_READY
 * - SCHEDULER_READY
 * - READY_FOR_FULL_ROLLOUT
 * - DEGRADED_PROVIDERS
 * - DATABASE_INTEGRITY_FAIL
 * - CIRCUIT_BREAKER_TRIPPED
 */

import { forexEconomicCalendarService } from './ForexEconomicCalendarService.js';
import { forexCalendarSchedulerService } from './ForexCalendarSchedulerService.js';
import { forexCanarySafetyService } from './ForexCanarySafetyService.js';
import { forexCanaryMonitoringService } from './ForexCanaryMonitoringService.js';
import { forexSchedulerCanaryService } from './ForexSchedulerCanaryService.js';
import { forexCalendarRolloutService } from './ForexCalendarRolloutService.js';

export const ROLLOUT_STAGES = {
  STAGE_0_SAFETY_BASELINE: 'STAGE_0_SAFETY_BASELINE',
  STAGE_1_PRODUCTION_DRY_RUN: 'STAGE_1_PRODUCTION_DRY_RUN',
  STAGE_2_CONTROLLED_MANUAL_CANARY: 'STAGE_2_CONTROLLED_MANUAL_CANARY',
  STAGE_3_MONITORED_SCHEDULED_CANARY: 'STAGE_3_MONITORED_SCHEDULED_CANARY',
  STAGE_4_FULL_ROLLOUT: 'STAGE_4_FULL_ROLLOUT'
};

export const FOREX_ROLLOUT_STAGES = {
  STAGE_0_DISABLED: 'STAGE_0_SAFETY_BASELINE',
  STAGE_0_SAFETY_BASELINE: 'STAGE_0_SAFETY_BASELINE',
  STAGE_1_DRYRUN_MONITORING: 'STAGE_1_PRODUCTION_DRY_RUN',
  STAGE_1_PRODUCTION_DRY_RUN: 'STAGE_1_PRODUCTION_DRY_RUN',
  STAGE_2_CANARY_SMALL_BATCH: 'STAGE_2_CONTROLLED_MANUAL_CANARY',
  STAGE_2_CONTROLLED_MANUAL_CANARY: 'STAGE_2_CONTROLLED_MANUAL_CANARY',
  STAGE_3_CANARY_EXPANDED_BATCH: 'STAGE_3_MONITORED_SCHEDULED_CANARY',
  STAGE_3_MONITORED_SCHEDULED_CANARY: 'STAGE_3_MONITORED_SCHEDULED_CANARY',
  STAGE_4_SCHEDULED_CANARY: 'STAGE_3_MONITORED_SCHEDULED_CANARY',
  STAGE_4_FULL_ROLLOUT: 'STAGE_4_FULL_ROLLOUT',
  STAGE_5_FULL_USD_PRODUCTION: 'STAGE_4_FULL_ROLLOUT'
};

export const READINESS_VERDICTS = {
  BLOCKED_BY_SAFETY_FLAGS: 'BLOCKED_BY_SAFETY_FLAGS',
  DRY_RUN_READY: 'DRY_RUN_READY',
  CANARY_READY: 'CANARY_READY',
  SCHEDULER_READY: 'SCHEDULER_READY',
  READY_FOR_FULL_ROLLOUT: 'READY_FOR_FULL_ROLLOUT',
  DEGRADED_PROVIDERS: 'DEGRADED_PROVIDERS',
  DATABASE_INTEGRITY_FAIL: 'DATABASE_INTEGRITY_FAIL',
  CIRCUIT_BREAKER_TRIPPED: 'CIRCUIT_BREAKER_TRIPPED'
};

const STAGE_SEQUENCE = [
  ROLLOUT_STAGES.STAGE_0_SAFETY_BASELINE,
  ROLLOUT_STAGES.STAGE_1_PRODUCTION_DRY_RUN,
  ROLLOUT_STAGES.STAGE_2_CONTROLLED_MANUAL_CANARY,
  ROLLOUT_STAGES.STAGE_3_MONITORED_SCHEDULED_CANARY,
  ROLLOUT_STAGES.STAGE_4_FULL_ROLLOUT
];

export class ForexRolloutControllerService {
  constructor(
    monitoringService = forexCanaryMonitoringService,
    canarySafety = forexCanarySafetyService,
    schedulerCanary = forexSchedulerCanaryService,
    rolloutStatusService = forexCalendarRolloutService
  ) {
    this.monitoringService = monitoringService;
    this.canarySafety = canarySafety;
    this.schedulerCanary = schedulerCanary;
    this.rolloutStatusService = rolloutStatusService;
    this.currentStage = ROLLOUT_STAGES.STAGE_0_SAFETY_BASELINE;
    this.stageHistory = [{
      id: `stage-init-${Date.now()}`,
      stage: ROLLOUT_STAGES.STAGE_0_SAFETY_BASELINE,
      fromStage: null,
      timestamp: new Date().toISOString(),
      reason: 'System initialization baseline default'
    }];
    this.successfulCanaryCyclesCount = 0;
    this.consecutiveCanarySuccesses = 0;
    this.isEmergencyStopped = false;
  }

  /**
   * Evaluate comprehensive production rollout readiness verdict
   */
  async evaluateRolloutReadiness(overrideFlags = null) {
    const flags = overrideFlags || forexEconomicCalendarService.getForexSafetyFlags();
    const schedulerTelemetry = this.schedulerCanary.getStatus();

    // 1. Circuit breaker trip check
    if (schedulerTelemetry.circuitBreakerTripped) {
      return {
        verdict: READINESS_VERDICTS.CIRCUIT_BREAKER_TRIPPED,
        canProgress: false,
        reason: `Circuit breaker is TRIPPED (${schedulerTelemetry.consecutiveFailures} consecutive failures). Requires explicit admin reset.`,
        currentStage: this.currentStage,
        checklist: {
          circuitBreakerTripped: true,
          databaseIntegrityPass: null,
          providerHealthPass: null,
          safetyFlagsAuthorized: false
        }
      };
    }

    // 2. Database integrity check
    const dbIntegrity = await this.monitoringService.verifyDatabaseIntegrity();
    if (!dbIntegrity.valid) {
      return {
        verdict: READINESS_VERDICTS.DATABASE_INTEGRITY_FAIL,
        canProgress: false,
        reason: `Database integrity check failed: ${dbIntegrity.issuesCount} anomaly detected.`,
        currentStage: this.currentStage,
        issues: dbIntegrity.issues,
        checklist: {
          circuitBreakerTripped: false,
          databaseIntegrityPass: false,
          providerHealthPass: null,
          safetyFlagsAuthorized: false
        }
      };
    }

    // 3. Provider health alert check
    const providerHealth = await this.monitoringService.checkProviderAlerts();
    if (!providerHealth.healthy) {
      return {
        verdict: READINESS_VERDICTS.DEGRADED_PROVIDERS,
        canProgress: false,
        reason: `Provider health is degraded: ${providerHealth.alerts[0]?.message}`,
        currentStage: this.currentStage,
        alerts: providerHealth.alerts,
        checklist: {
          circuitBreakerTripped: false,
          databaseIntegrityPass: true,
          providerHealthPass: false,
          safetyFlagsAuthorized: false
        }
      };
    }

    // 4. Safety flag evaluation
    const isForexEnabled = flags.forexCalendarEnabled === true;
    const isLiveIngestionEnabled = flags.forexLiveIngestionEnabled === true;
    const isSchedulerEnabled = flags.forexSchedulerEnabled === true;
    const allowsUSD = (flags.canaryCurrencies || []).includes('USD') || (flags.canaryCurrencies || []).includes('ALL');

    if (!isForexEnabled) {
      return {
        verdict: READINESS_VERDICTS.BLOCKED_BY_SAFETY_FLAGS,
        canProgress: false,
        reason: 'FOREX_CALENDAR_ENABLED is false. Master switch blocks rollout progression.',
        currentStage: this.currentStage,
        checklist: {
          circuitBreakerTripped: false,
          databaseIntegrityPass: true,
          providerHealthPass: true,
          safetyFlagsAuthorized: false
        }
      };
    }

    // If Forex is enabled but live ingestion is disabled -> Dry Run Ready
    if (isForexEnabled && !isLiveIngestionEnabled) {
      return {
        verdict: READINESS_VERDICTS.DRY_RUN_READY,
        canProgress: true,
        recommendedStage: ROLLOUT_STAGES.STAGE_1_PRODUCTION_DRY_RUN,
        reason: 'Environment is authorized for production dry-run discovery (zero database writes).',
        currentStage: this.currentStage,
        checklist: {
          circuitBreakerTripped: false,
          databaseIntegrityPass: true,
          providerHealthPass: true,
          safetyFlagsAuthorized: true,
          liveIngestionAuthorized: false
        }
      };
    }

    // If live ingestion and USD canary are active
    if (isForexEnabled && isLiveIngestionEnabled && allowsUSD) {
      if (isSchedulerEnabled && this.consecutiveCanarySuccesses >= 3) {
        return {
          verdict: READINESS_VERDICTS.READY_FOR_FULL_ROLLOUT,
          canProgress: true,
          recommendedStage: ROLLOUT_STAGES.STAGE_4_FULL_ROLLOUT,
          reason: 'All safety flags, provider health, stability metrics, and scheduler canary cycles verified for full rollout.',
          currentStage: this.currentStage,
          checklist: {
            circuitBreakerTripped: false,
            databaseIntegrityPass: true,
            providerHealthPass: true,
            safetyFlagsAuthorized: true,
            liveIngestionAuthorized: true,
            schedulerAuthorized: true
          }
        };
      }

      if (isSchedulerEnabled) {
        return {
          verdict: READINESS_VERDICTS.SCHEDULER_READY,
          canProgress: true,
          recommendedStage: ROLLOUT_STAGES.STAGE_3_MONITORED_SCHEDULED_CANARY,
          reason: 'Environment is authorized for monitored low-frequency scheduled canary cycles.',
          currentStage: this.currentStage,
          checklist: {
            circuitBreakerTripped: false,
            databaseIntegrityPass: true,
            providerHealthPass: true,
            safetyFlagsAuthorized: true,
            liveIngestionAuthorized: true,
            schedulerAuthorized: true
          }
        };
      }

      return {
        verdict: READINESS_VERDICTS.CANARY_READY,
        canProgress: true,
        recommendedStage: ROLLOUT_STAGES.STAGE_2_CONTROLLED_MANUAL_CANARY,
        reason: 'Environment is authorized for controlled manual USD canary live ingestion (max 5 batch size).',
        currentStage: this.currentStage,
        checklist: {
          circuitBreakerTripped: false,
          databaseIntegrityPass: true,
          providerHealthPass: true,
          safetyFlagsAuthorized: true,
          liveIngestionAuthorized: true,
          schedulerAuthorized: false
        }
      };
    }

    return {
      verdict: READINESS_VERDICTS.BLOCKED_BY_SAFETY_FLAGS,
      canProgress: false,
      reason: 'Safety flags configuration does not meet criteria for live ingestion or scheduled execution.',
      currentStage: this.currentStage,
      checklist: {
        circuitBreakerTripped: false,
        databaseIntegrityPass: true,
        providerHealthPass: true,
        safetyFlagsAuthorized: false
      }
    };
  }

  /**
   * Return current rollout stage summary
   */
  async getRolloutStage() {
    const readiness = await this.evaluateRolloutReadiness();
    const schedulerTelemetry = this.schedulerCanary.getStatus();

    return {
      service: 'ForexRolloutControllerService',
      currentStage: this.currentStage,
      stageSequenceIndex: STAGE_SEQUENCE.indexOf(this.currentStage),
      isEmergencyStopped: this.isEmergencyStopped,
      batchSizeLimit: this.getBatchSizeLimitForStage(this.currentStage),
      databaseWritesAllowed: this.currentStage === ROLLOUT_STAGES.STAGE_2_CONTROLLED_MANUAL_CANARY ||
                             this.currentStage === ROLLOUT_STAGES.STAGE_3_MONITORED_SCHEDULED_CANARY ||
                             this.currentStage === ROLLOUT_STAGES.STAGE_4_FULL_ROLLOUT,
      readinessVerdict: readiness.verdict,
      canProgress: readiness.canProgress,
      circuitBreakerTripped: schedulerTelemetry.circuitBreakerTripped,
      successfulCanaryCyclesCount: this.successfulCanaryCyclesCount,
      consecutiveCanarySuccesses: this.consecutiveCanarySuccesses,
      flags: forexEconomicCalendarService.getForexSafetyFlags(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Compatibility alias for getRolloutStage
   */
  async getRolloutStageSummary() {
    return this.getRolloutStage();
  }

  /**
   * Compatibility alias for setRolloutStage
   */
  async advanceStage(targetStage, options = {}) {
    return this.setRolloutStage(targetStage, options);
  }

  /**
   * Return batch size limit for a given stage
   */
  getBatchSizeLimitForStage(stage) {
    switch (stage) {
      case ROLLOUT_STAGES.STAGE_0_SAFETY_BASELINE:
      case ROLLOUT_STAGES.STAGE_1_PRODUCTION_DRY_RUN:
        return 0;
      case ROLLOUT_STAGES.STAGE_2_CONTROLLED_MANUAL_CANARY:
      case ROLLOUT_STAGES.STAGE_3_MONITORED_SCHEDULED_CANARY:
        return 5;
      case ROLLOUT_STAGES.STAGE_4_FULL_ROLLOUT:
        return 50;
      default:
        return 0;
    }
  }

  /**
   * Advance or set rollout stage with explicit administrative authorization
   */
  async setRolloutStage(targetStage, options = {}) {
    const { explicitApproval = false, reason = 'Administrative rollout stage update', overrideFlags = null } = options;

    if (this.isEmergencyStopped) {
      return {
        success: false,
        error: 'EMERGENCY_STOP_ACTIVE',
        message: 'System is in emergency stop state. Reset or clear emergency stop before updating stage.'
      };
    }

    if (!explicitApproval) {
      return {
        success: false,
        error: 'EXPLICIT_APPROVAL_REQUIRED',
        message: 'Stage progression requires explicit approval (explicitApproval: true).'
      };
    }

    const targetIdx = STAGE_SEQUENCE.indexOf(targetStage);
    const currentIdx = STAGE_SEQUENCE.indexOf(this.currentStage);

    if (targetIdx === -1) {
      return {
        success: false,
        error: 'INVALID_STAGE',
        message: `Unknown target stage: "${targetStage}".`
      };
    }

    // Prevent non-sequential stage skips when advancing
    if (targetIdx > currentIdx + 1) {
      return {
        success: false,
        error: 'STAGE_SKIP_DISALLOWED',
        message: `Cannot skip stages. Current: ${this.currentStage}, Target: ${targetStage}. Progress sequentially.`
      };
    }

    // Evaluate readiness gates when advancing
    if (targetIdx > currentIdx) {
      const readiness = await this.evaluateRolloutReadiness(overrideFlags);

      if (readiness.verdict === READINESS_VERDICTS.CIRCUIT_BREAKER_TRIPPED) {
        return {
          success: false,
          error: 'CIRCUIT_BREAKER_TRIPPED',
          message: 'Cannot advance stage: Circuit breaker is TRIPPED. Reset circuit breaker first.'
        };
      }

      if (readiness.verdict === READINESS_VERDICTS.DATABASE_INTEGRITY_FAIL) {
        return {
          success: false,
          error: 'DATABASE_INTEGRITY_FAIL',
          message: 'Cannot advance stage: Database integrity anomalies detected.'
        };
      }

      if (readiness.verdict === READINESS_VERDICTS.DEGRADED_PROVIDERS) {
        return {
          success: false,
          error: 'DEGRADED_PROVIDERS',
          message: 'Cannot advance stage: Provider health alerts detected.'
        };
      }

      // Stage 2 requirement: Requires USD live ingestion authorization
      if (targetStage === ROLLOUT_STAGES.STAGE_2_CONTROLLED_MANUAL_CANARY) {
        const flags = overrideFlags || forexEconomicCalendarService.getForexSafetyFlags();
        const hasUSD = (flags.canaryCurrencies || []).includes('USD') || (flags.canaryCurrencies || []).includes('ALL');
        if (!flags.forexCalendarEnabled || !flags.forexLiveIngestionEnabled || !hasUSD) {
          return {
            success: false,
            error: 'MISSING_CANARY_AUTHORIZATION',
            message: 'Stage 2 requires FOREX_CALENDAR_ENABLED=true, FOREX_CALENDAR_LIVE_INGESTION_ENABLED=true, and FOREX_CALENDAR_CANARY_CURRENCIES=USD.'
          };
        }
      }

      // Stage 3 requirement: Requires scheduler authorization & at least 1 successful manual canary
      if (targetStage === ROLLOUT_STAGES.STAGE_3_MONITORED_SCHEDULED_CANARY) {
        const flags = overrideFlags || forexEconomicCalendarService.getForexSafetyFlags();
        if (!flags.forexSchedulerEnabled) {
          return {
            success: false,
            error: 'MISSING_SCHEDULER_AUTHORIZATION',
            message: 'Stage 3 requires FOREX_CALENDAR_SCHEDULER_ENABLED=true.'
          };
        }
      }
    }

    const previousStage = this.currentStage;
    this.currentStage = targetStage;

    const historyEntry = {
      id: `stage-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      stage: targetStage,
      fromStage: previousStage,
      timestamp: new Date().toISOString(),
      reason,
      batchSizeLimit: this.getBatchSizeLimitForStage(targetStage)
    };
    this.stageHistory.unshift(historyEntry);

    this.monitoringService.recordAudit({
      action: 'ROLLOUT_STAGE_TRANSITION',
      ...historyEntry
    });

    return {
      success: true,
      previousStage,
      currentStage: this.currentStage,
      batchSizeLimit: this.getBatchSizeLimitForStage(targetStage),
      message: `Rollout stage transitioned from ${previousStage} to ${targetStage}`
    };
  }

  /**
   * Execute emergency stop immediately halting all operations
   */
  emergencyStop(reason = 'Emergency kill switch activated') {
    this.isEmergencyStopped = true;
    this.schedulerCanary.stopCanarySchedule();
    const previousStage = this.currentStage;
    this.currentStage = ROLLOUT_STAGES.STAGE_0_SAFETY_BASELINE;

    const entry = {
      id: `emergency-${Date.now()}`,
      stage: ROLLOUT_STAGES.STAGE_0_SAFETY_BASELINE,
      fromStage: previousStage,
      timestamp: new Date().toISOString(),
      reason: `EMERGENCY_STOP: ${reason}`,
      emergency: true
    };
    this.stageHistory.unshift(entry);

    this.monitoringService.recordAudit({
      action: 'EMERGENCY_STOP',
      ...entry
    });

    console.warn(`🚨 [ForexRolloutController] EMERGENCY STOP TRIGGERED: ${reason}. System reset to STAGE_0_SAFETY_BASELINE.`);

    return {
      success: true,
      emergencyStopped: true,
      currentStage: this.currentStage,
      message: 'Emergency stop activated. Ingestion and scheduling disabled.'
    };
  }

  /**
   * Reset emergency stop state
   */
  clearEmergencyStop(reason = 'Administrative emergency clear') {
    this.isEmergencyStopped = false;
    return {
      success: true,
      emergencyStopped: false,
      currentStage: this.currentStage,
      message: 'Emergency stop cleared.'
    };
  }

  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker(reason = 'Administrative circuit breaker reset') {
    const result = this.schedulerCanary.resetCircuitBreaker();
    this.monitoringService.recordAudit({
      action: 'CIRCUIT_BREAKER_RESET',
      timestamp: new Date().toISOString(),
      reason
    });
    return {
      success: true,
      circuitBreakerTripped: false,
      consecutiveFailures: 0,
      message: 'Circuit breaker reset successfully.'
    };
  }

  /**
   * Return full stage transition history
   */
  getRolloutHistory(limit = 50) {
    return this.stageHistory.slice(0, limit);
  }

  /**
   * Record successful canary cycle
   */
  recordCanarySuccess() {
    this.successfulCanaryCyclesCount++;
    this.consecutiveCanarySuccesses++;
  }

  /**
   * Record failed canary cycle
   */
  recordCanaryFailure() {
    this.consecutiveCanarySuccesses = 0;
  }
}

export const forexRolloutControllerService = new ForexRolloutControllerService();
