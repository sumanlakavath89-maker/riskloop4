/**
 * Economic Calendar Canary Activation Service
 * 
 * In-memory controlled workflow for preparing, validating, activating, monitoring,
 * and deactivating runtime indicator canary rollouts.
 * 
 * Never permanently writes to .env files; manages runtime memory activation state.
 */

import { officialReleaseIngestionService, SUPPORTED_CANARY_INDICATORS } from './OfficialReleaseIngestionService.js';
import { economicCalendarRolloutGuardService } from './EconomicCalendarRolloutGuardService.js';
import { economicCalendarRolloutService } from './EconomicCalendarRolloutService.js';

class EconomicCalendarCanaryActivationService {
  constructor() {
    this.activationState = {
      active: false,
      indicator: null,
      activatedAt: null,
      activatedBy: null,
      mode: 'canary',
      databaseWritesAllowed: false
    };
  }

  /**
   * Check whether runtime canary is active for a specific indicator
   */
  isCanaryActiveForIndicator(indicator) {
    if (!this.activationState.active) {
      return false;
    }

    if (!indicator) return false;
    const canonical = officialReleaseIngestionService.getCanonicalIndicatorName(indicator);
    const activeCanonical = officialReleaseIngestionService.getCanonicalIndicatorName(this.activationState.indicator);

    return !!canonical && canonical === activeCanonical;
  }

  /**
   * Check if any runtime canary activation is active
   */
  isAnyCanaryActive() {
    return this.activationState.active === true;
  }

  /**
   * Step 1: Prepare Canary Activation
   */
  prepareCanaryActivation(indicator) {
    if (!indicator || typeof indicator !== 'string') {
      return {
        success: false,
        error: 'INVALID_INDICATOR',
        message: 'Indicator name is required for canary preparation'
      };
    }

    const canonical = officialReleaseIngestionService.getCanonicalIndicatorName(indicator);
    if (!canonical || !SUPPORTED_CANARY_INDICATORS.includes(canonical)) {
      return {
        success: false,
        error: 'UNSUPPORTED_INDICATOR',
        message: `Indicator "${indicator}" is not a supported canonical macro indicator. Supported: ${SUPPORTED_CANARY_INDICATORS.join(', ')}`
      };
    }

    const currentRollout = economicCalendarRolloutService.getRolloutStatus();
    const preActivationChecks = economicCalendarRolloutGuardService.getPreActivationChecks();

    return {
      success: true,
      indicator: canonical,
      supportedIndicators: [...SUPPORTED_CANARY_INDICATORS],
      currentRolloutConfig: {
        schedulerEnabled: currentRollout.schedulerEnabled,
        liveIngestionEnabled: currentRollout.liveIngestionEnabled,
        canaryIndicators: currentRollout.canaryIndicators,
        rolloutMode: currentRollout.rolloutMode
      },
      preActivationRequirements: preActivationChecks,
      preparedAt: new Date().toISOString()
    };
  }

  /**
   * Step 2: Validate Canary Activation Readiness
   */
  async validateCanaryActivation(indicator, options = {}) {
    const prep = this.prepareCanaryActivation(indicator);
    if (!prep.success) {
      return {
        success: false,
        ready: false,
        error: prep.error,
        message: prep.message,
        failures: [{ id: 'indicator_support', name: 'Supported Indicator', reason: prep.message }]
      };
    }

    const canonical = prep.indicator;
    const readiness = await economicCalendarRolloutGuardService.validateRolloutReadiness({
      ...options,
      indicator: canonical
    });

    return {
      success: true,
      indicator: canonical,
      ready: readiness.ready,
      checks: readiness.checks,
      failures: readiness.failures,
      warnings: readiness.warnings,
      checkedAt: readiness.checkedAt
    };
  }

  /**
   * Step 3: Activate Canary (Runtime in-memory only)
   */
  async activateCanary(indicator, options = {}) {
    const user = options.user || 'admin';
    const validation = await this.validateCanaryActivation(indicator, options);

    if (!validation.ready) {
      return {
        success: false,
        error: 'ACTIVATION_READINESS_FAILED',
        message: 'Cannot activate canary: pre-activation validation failed.',
        indicator: validation.indicator || indicator,
        failures: validation.failures,
        warnings: validation.warnings
      };
    }

    const canonical = validation.indicator;

    this.activationState = {
      active: true,
      indicator: canonical,
      activatedAt: new Date().toISOString(),
      activatedBy: user,
      mode: 'canary',
      databaseWritesAllowed: true
    };

    console.log(`🚀 [CanaryActivation] Runtime Canary ACTIVATED for "${canonical}" by ${user}. Live database writes for this indicator are enabled.`);

    return {
      success: true,
      message: `Runtime canary successfully activated for "${canonical}".`,
      activation: { ...this.activationState },
      warnings: validation.warnings
    };
  }

  /**
   * Step 4: Monitor & Retrieve Status
   */
  getCanaryActivationStatus() {
    const rollout = economicCalendarRolloutService.getRolloutStatus();
    const rollback = economicCalendarRolloutGuardService.getRollbackStatus();

    // Database writes are only truly allowed if master live ingestion is on and emergency rollback is off
    const effectiveWritesAllowed =
      this.activationState.active &&
      rollout.liveIngestionEnabled &&
      !rollback.active;

    return {
      active: this.activationState.active,
      indicator: this.activationState.indicator,
      activatedAt: this.activationState.activatedAt,
      activatedBy: this.activationState.activatedBy,
      mode: this.activationState.mode,
      databaseWritesAllowed: effectiveWritesAllowed,
      emergencyRollbackActive: rollback.active,
      liveIngestionMasterEnabled: rollout.liveIngestionEnabled,
      currentRolloutMode: rollout.rolloutMode,
      checkedAt: new Date().toISOString()
    };
  }

  /**
   * Step 5: Deactivate Canary
   */
  deactivateCanary(reason = 'manual deactivation', options = {}) {
    const previous = { ...this.activationState };
    const user = options.user || 'admin';

    this.activationState = {
      active: false,
      indicator: null,
      activatedAt: null,
      activatedBy: null,
      mode: 'canary',
      databaseWritesAllowed: false
    };

    console.log(`⏹️ [CanaryActivation] Runtime Canary DEACTIVATED: "${reason}" by ${user}. Live database writes blocked.`);

    return {
      success: true,
      status: 'CANARY_DEACTIVATED',
      message: `Runtime canary deactivated successfully: ${reason}`,
      deactivatedAt: new Date().toISOString(),
      previous
    };
  }

  /**
   * Reset runtime state for testing
   */
  reset() {
    this.activationState = {
      active: false,
      indicator: null,
      activatedAt: null,
      activatedBy: null,
      mode: 'canary',
      databaseWritesAllowed: false
    };
  }
}

export const economicCalendarCanaryActivationService = new EconomicCalendarCanaryActivationService();
