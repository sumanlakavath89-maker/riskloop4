/**
 * Economic Calendar Canary Safety Service
 * 
 * Provides:
 * 1. Pre-write validation & duplicate release protection
 * 2. Exact previous state snapshot capture
 * 3. Immediate post-write verification against Supabase
 * 4. Automatic per-event rollback on verification failure
 * 5. Consecutive failure circuit breaker (trips Emergency Rollback & Critical Incident)
 */

import { supabaseEconomicCalendarService } from './SupabaseEconomicCalendarService.js';
import { economicCalendarRolloutGuardService } from './EconomicCalendarRolloutGuardService.js';
import { economicCalendarCanaryActivationService } from './EconomicCalendarCanaryActivationService.js';
import { economicCalendarIncidentService } from './EconomicCalendarIncidentService.js';
import { economicCalendarAlertService } from './EconomicCalendarAlertService.js';

export const CANARY_SAFETY_CONFIG = {
  CONSECUTIVE_FAILURE_THRESHOLD: 3, // Auto-trip threshold
  POST_WRITE_TIMEOUT_MS: 3000
};

class EconomicCalendarCanarySafetyService {
  constructor() {
    this.consecutiveFailures = 0;
    this.totalSuccesses = 0;
    this.totalRollbacks = 0;
    this.lastFailure = null;
    this.lastSuccess = null;
    this.failureThreshold = CANARY_SAFETY_CONFIG.CONSECUTIVE_FAILURE_THRESHOLD;
  }

  /**
   * Capture complete snapshot of an economic event before mutation
   */
  captureEventState(targetRow) {
    if (!targetRow || !targetRow.id) {
      throw new Error('Invalid event record passed to captureEventState');
    }

    return {
      id: targetRow.id,
      event_name: targetRow.event_name,
      event_date: targetRow.event_date,
      event_time: targetRow.event_time,
      country_code: targetRow.country_code,
      status: targetRow.status,
      actual: targetRow.actual,
      previous: targetRow.previous,
      forecast: targetRow.forecast,
      unit: targetRow.unit,
      impact: targetRow.impact,
      source: targetRow.source,
      source_url: targetRow.source_url,
      updated_at: targetRow.updated_at,
      capturedAt: new Date().toISOString()
    };
  }

  /**
   * Pre-write validation & duplicate release protection
   */
  validatePreWrite(targetRow, release, options = {}) {
    const { allowReRelease = false } = options;

    if (!targetRow) {
      return {
        valid: false,
        error: 'EVENT_NOT_FOUND',
        message: 'Cannot perform pre-write validation: target event does not exist.'
      };
    }

    // Duplicate release protection: if event is already released
    if (targetRow.status === 'released' && !allowReRelease) {
      // Check if actual is already set to the same value
      if (String(targetRow.actual).trim() === String(release.actual).trim()) {
        return {
          valid: false,
          error: 'DUPLICATE_RELEASE_IDENTICAL',
          message: `Event "${targetRow.event_name}" (${targetRow.event_date}) is already marked as released with actual value ${targetRow.actual}. Skipping redundant re-write.`
        };
      }

      return {
        valid: false,
        error: 'EVENT_ALREADY_RELEASED',
        message: `Event "${targetRow.event_name}" (${targetRow.event_date}) already has status 'released' (actual: ${targetRow.actual}).`
      };
    }

    return { valid: true };
  }

  /**
   * Post-write verification: immediately query Supabase and verify update integrity
   */
  async verifyPostWrite(targetRowId, expectedPayload) {
    if (!supabaseEconomicCalendarService.supabase) {
      throw new Error('Supabase client is not available');
    }

    const { data: records, error } = await supabaseEconomicCalendarService.supabase
      .from('economic_events')
      .select('*')
      .eq('id', targetRowId)
      .limit(1);

    if (error || !records || records.length === 0) {
      return {
        verified: false,
        error: 'POST_WRITE_RECORD_NOT_FOUND',
        message: `Post-write verification failed: Record ID ${targetRowId} could not be retrieved from Supabase (${error?.message || 'Empty response'}).`
      };
    }

    const updated = records[0];

    // Check 1: Status must be 'released'
    if (updated.status !== 'released') {
      return {
        verified: false,
        error: 'POST_WRITE_STATUS_MISMATCH',
        message: `Post-write verification failed: Expected status 'released', found '${updated.status}'.`,
        actualRecord: updated
      };
    }

    // Check 2: Actual value must match expected
    if (String(updated.actual).trim() !== String(expectedPayload.actual).trim()) {
      return {
        verified: false,
        error: 'POST_WRITE_ACTUAL_MISMATCH',
        message: `Post-write verification failed: Expected actual '${expectedPayload.actual}', found '${updated.actual}'.`,
        actualRecord: updated
      };
    }

    // Check 3: Source URL must be present if provided
    if (expectedPayload.source_url && updated.source_url !== expectedPayload.source_url) {
      return {
        verified: false,
        error: 'POST_WRITE_SOURCE_MISMATCH',
        message: `Post-write verification failed: Expected source_url '${expectedPayload.source_url}', found '${updated.source_url}'.`,
        actualRecord: updated
      };
    }

    return {
      verified: true,
      verifiedRecord: updated
    };
  }

  /**
   * Automatic per-event rollback: restore exact captured state
   */
  async rollbackEvent(targetRowId, capturedState) {
    if (!supabaseEconomicCalendarService.supabase) {
      throw new Error('Supabase client is not available');
    }

    console.warn(`⏪ [CanarySafety] Rolling back event ${capturedState.event_name} (${targetRowId}) to status "${capturedState.status}".`);

    const restorePayload = {
      status: capturedState.status,
      actual: capturedState.actual !== undefined ? capturedState.actual : null,
      previous: capturedState.previous !== undefined ? capturedState.previous : null,
      source_url: capturedState.source_url || null,
      source: capturedState.source || null,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabaseEconomicCalendarService.supabase
      .from('economic_events')
      .update(restorePayload)
      .eq('id', targetRowId)
      .select();

    if (error) {
      console.error(`🚨 [CanarySafety] CRITICAL: Automatic rollback query failed for event ${targetRowId}:`, error);
      throw new Error(`Automatic rollback failed: ${error.message}`);
    }

    this.totalRollbacks++;
    return {
      rolledBack: true,
      restoredState: data?.[0] || restorePayload
    };
  }

  /**
   * Record a successful canary post-write verification
   */
  recordSafetySuccess(details = {}) {
    this.consecutiveFailures = 0; // Reset consecutive failures on success
    this.totalSuccesses++;
    this.lastSuccess = {
      timestamp: new Date().toISOString(),
      ...details
    };
  }

  /**
   * Record a canary post-write failure and evaluate circuit breaker
   */
  async recordSafetyFailure(reason, errorDetails, targetRow, capturedState) {
    this.consecutiveFailures++;
    this.lastFailure = {
      timestamp: new Date().toISOString(),
      reason,
      errorDetails,
      eventName: targetRow?.event_name,
      eventId: targetRow?.id,
      consecutiveCount: this.consecutiveFailures
    };

    console.error(`❌ [CanarySafety] Post-write verification failure (${this.consecutiveFailures}/${this.failureThreshold}): ${reason}`);

    // Evaluate Circuit Breaker: If consecutive failures exceed threshold
    if (this.consecutiveFailures >= this.failureThreshold) {
      await this.tripSafetyCircuitBreaker(reason, targetRow);
    }
  }

  /**
   * Trip Circuit Breaker: Trigger Emergency Rollback, Deactivate Canary, and Open Critical Incident
   */
  async tripSafetyCircuitBreaker(reason, targetRow) {
    const breakerReason = `Canary Safety Circuit Breaker Tripped: ${this.consecutiveFailures} consecutive post-write failures. Last failure: ${reason}`;
    console.error(`🚨 [CanarySafety] CIRCUIT BREAKER TRIPPED! ${breakerReason}`);

    // 1. Activate Emergency Rollback
    economicCalendarRolloutGuardService.triggerEmergencyRollback(breakerReason, {
      user: 'canary-safety-circuit-breaker'
    });

    // 2. Deactivate Runtime Canary
    economicCalendarCanaryActivationService.deactivateCanary(breakerReason, {
      user: 'canary-safety-circuit-breaker'
    });

    // 3. Open Persistent Critical Incident
    try {
      await economicCalendarIncidentService.openOrUpdateIncident({
        incidentKey: 'CANARY_POST_WRITE_SAFETY_FAILURE',
        severity: 'critical',
        title: 'Canary Post-Write Safety Verification Circuit Breaker Tripped',
        description: breakerReason,
        reasons: [
          `Consecutive failure threshold of ${this.failureThreshold} was reached.`,
          `Last failed event: ${targetRow?.event_name || 'unknown'} (ID: ${targetRow?.id || 'unknown'})`,
          `Error detail: ${reason}`
        ]
      });
    } catch (e) {
      console.error('[CanarySafety] Failed to record critical incident:', e.message);
    }

    // 4. Trigger Alert
    try {
      economicCalendarAlertService.triggerCustomAlert({
        severity: 'critical',
        title: '🚨 Canary Safety Circuit Breaker Tripped',
        message: breakerReason,
        reasons: [breakerReason]
      });
    } catch (e) {
      console.error('[CanarySafety] Failed to trigger alert:', e.message);
    }
  }

  /**
   * Get canary safety service status
   */
  getSafetyStatus() {
    return {
      consecutiveFailures: this.consecutiveFailures,
      failureThreshold: this.failureThreshold,
      circuitBreakerTripped: this.consecutiveFailures >= this.failureThreshold,
      totalSuccesses: this.totalSuccesses,
      totalRollbacks: this.totalRollbacks,
      lastSuccess: this.lastSuccess,
      lastFailure: this.lastFailure,
      checkedAt: new Date().toISOString()
    };
  }

  /**
   * Reset counters for testing
   */
  reset() {
    this.consecutiveFailures = 0;
    this.totalSuccesses = 0;
    this.totalRollbacks = 0;
    this.lastFailure = null;
    this.lastSuccess = null;
    this.failureThreshold = CANARY_SAFETY_CONFIG.CONSECUTIVE_FAILURE_THRESHOLD;
  }
}

export const economicCalendarCanarySafetyService = new EconomicCalendarCanarySafetyService();
