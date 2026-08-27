/**
 * Economic Calendar Rollout Service
 * 
 * Read-only status service for monitoring the production rollout mode
 * and indicator-level live ingestion permissions for RiskLoop Economic Calendar.
 */

import { officialReleaseIngestionService, SUPPORTED_CANARY_INDICATORS } from './OfficialReleaseIngestionService.js';

export const ROLLOUT_MODES = {
  DISABLED: 'disabled',
  DISCOVERY_ONLY: 'discovery_only',
  SAFE_BLOCKED: 'safe_blocked',
  CANARY: 'canary',
  FULL: 'full'
};

class EconomicCalendarRolloutService {
  /**
   * Evaluate and return the current production rollout state
   * 
   * @param {Object} [options]
   * @param {boolean} [options.overrideSchedulerEnabled]
   * @param {boolean} [options.overrideLiveIngestion]
   * @param {string} [options.overrideCanary]
   * @returns {Object}
   */
  getRolloutStatus(options = {}) {
    const schedulerEnabled = options.overrideSchedulerEnabled !== undefined
      ? options.overrideSchedulerEnabled
      : (process.env.ECONOMIC_CALENDAR_SCHEDULER_ENABLED === 'true');

    const liveIngestionEnabled = options.overrideLiveIngestion !== undefined
      ? options.overrideLiveIngestion
      : (process.env.ECONOMIC_CALENDAR_LIVE_INGESTION_ENABLED === 'true');

    const rawCanary = options.overrideCanary !== undefined
      ? options.overrideCanary
      : (process.env.ECONOMIC_CALENDAR_CANARY_INDICATORS || '');

    const trimmedCanary = typeof rawCanary === 'string' ? rawCanary.trim() : '';

    let canaryIndicators = [];
    if (trimmedCanary.length > 0) {
      canaryIndicators = trimmedCanary
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);
    }

    // Determine rollout mode
    let rolloutMode = ROLLOUT_MODES.DISABLED;
    if (!schedulerEnabled) {
      rolloutMode = ROLLOUT_MODES.DISABLED;
    } else if (!liveIngestionEnabled) {
      rolloutMode = ROLLOUT_MODES.DISCOVERY_ONLY;
    } else if (trimmedCanary === '') {
      rolloutMode = ROLLOUT_MODES.SAFE_BLOCKED;
    } else if (trimmedCanary.toLowerCase() === 'all') {
      rolloutMode = ROLLOUT_MODES.FULL;
    } else {
      rolloutMode = ROLLOUT_MODES.CANARY;
    }

    // Calculate individual indicator permissions
    const indicatorPermissions = {};
    for (const indicator of SUPPORTED_CANARY_INDICATORS) {
      const isCanaryAllowed = officialReleaseIngestionService.isIndicatorCanaryAllowed(indicator, trimmedCanary);
      const liveAllowed = schedulerEnabled && liveIngestionEnabled && isCanaryAllowed;

      indicatorPermissions[indicator] = {
        discoveryAllowed: true, // Discovery and metric extraction are always permitted
        liveIngestionAllowed: liveAllowed
      };
    }

    return {
      schedulerEnabled,
      liveIngestionEnabled,
      canaryIndicators,
      supportedIndicators: [...SUPPORTED_CANARY_INDICATORS],
      indicatorPermissions,
      rolloutMode,
      checkedAt: new Date().toISOString()
    };
  }
}

export const economicCalendarRolloutService = new EconomicCalendarRolloutService();
