/**
 * Economic Calendar Alert Service
 * 
 * Monitors the EconomicCalendarHealthService, manages persistent incident lifecycles
 * via EconomicCalendarIncidentService, prevents duplicate alert spam across clustered
 * Node.js instances, and delivers notifications with bounded exponential backoff retries.
 */

import { economicCalendarHealthService } from './EconomicCalendarHealthService.js';
import { economicCalendarIncidentService } from './EconomicCalendarIncidentService.js';

export const ALERT_TYPES = {
  INCIDENT_UNHEALTHY: 'INCIDENT_UNHEALTHY',
  INCIDENT_DEGRADED: 'INCIDENT_DEGRADED',
  RECOVERY: 'RECOVERY',
  DISABLED: 'DISABLED'
};

class EconomicCalendarAlertService {
  constructor() {
    this.lastState = 'unknown';
    this.lastAlertTime = null;
    this.lastAlertSeverity = null;
    this.alertHistory = []; // Bounded in-memory history cache
    this.maxHistorySize = 50;
  }

  /**
   * Get configured cooldown duration in minutes
   */
  getCooldownMinutes() {
    return parseFloat(process.env.ECONOMIC_CALENDAR_ALERT_COOLDOWN_MINUTES) || 60;
  }

  /**
   * Check health, manage persistent incidents, and trigger notifications
   * 
   * @param {Object} [options]
   * @param {Object} [options.healthOptions] Override options passed to EconomicCalendarHealthService
   * @param {Function} [options.customSink] Optional custom notification sink for testing
   * @param {boolean} [options.bypassCooldown=false]
   */
  async checkHealthAndAlert(options = {}) {
    const {
      healthOptions = {},
      customSink = null,
      bypassCooldown = false
    } = options;

    const health = await economicCalendarHealthService.getHealthStatus(healthOptions);
    const currentState = health.status;
    const previousState = this.lastState;
    const now = new Date();
    const nowIso = now.toISOString();

    let alertToTrigger = null;
    let shouldAlert = false;
    let incidentRecord = null;

    const primaryReason = health.reasons.length > 0 ? health.reasons[0] : 'GENERAL_HEALTH_ISSUE';
    const incidentKey = primaryReason.split(':')[0].trim();

    // 1. Evaluate State Transitions & Active Incidents
    const isDegradedOrUnhealthy = currentState === 'unhealthy' || currentState === 'degraded';
    const wasDegradedOrUnhealthy = previousState === 'unhealthy' || previousState === 'degraded';

    if (currentState === 'unhealthy') {
      const { incident, isNew } = await economicCalendarIncidentService.openOrUpdateIncident({
        incidentKey,
        severity: 'critical',
        title: '🚨 Economic Calendar Subsystem UNHEALTHY',
        description: `Subsystem transitioned to unhealthy. Reasons: ${health.reasons.join(', ')}`,
        reasons: health.reasons,
        healthSnapshot: health
      });
      incidentRecord = incident;

      if (isNew || previousState !== 'unhealthy') {
        shouldAlert = true;
        alertToTrigger = {
          type: ALERT_TYPES.INCIDENT_UNHEALTHY,
          notificationType: 'incident_opened',
          severity: 'critical',
          title: '🚨 Economic Calendar Subsystem UNHEALTHY',
          message: `Economic calendar subsystem transitioned to "unhealthy". Reasons: ${health.reasons.join(', ')}`
        };
      } else {
        // Persistent unhealthy: check cooldown
        const cooldownMs = this.getCooldownMinutes() * 60 * 1000;
        const timeSinceLastAlert = this.lastAlertTime ? (now.getTime() - new Date(this.lastAlertTime).getTime()) : Infinity;

        if (bypassCooldown || timeSinceLastAlert >= cooldownMs) {
          shouldAlert = true;
          alertToTrigger = {
            type: ALERT_TYPES.INCIDENT_UNHEALTHY,
            notificationType: 'incident_reminder',
            severity: 'critical',
            title: '🔔 [Reminder] Economic Calendar is still UNHEALTHY',
            message: `Persistent issue: ${health.reasons.join(', ')}`
          };
        }
      }
    } else if (currentState === 'degraded') {
      const { incident, isNew } = await economicCalendarIncidentService.openOrUpdateIncident({
        incidentKey,
        severity: 'warning',
        title: '⚠️ Economic Calendar Subsystem DEGRADED',
        description: `Subsystem transitioned to degraded. Reasons: ${health.reasons.join(', ')}`,
        reasons: health.reasons,
        healthSnapshot: health
      });
      incidentRecord = incident;

      if (isNew || previousState !== 'degraded') {
        shouldAlert = true;
        alertToTrigger = {
          type: ALERT_TYPES.INCIDENT_DEGRADED,
          notificationType: 'incident_opened',
          severity: 'warning',
          title: '⚠️ Economic Calendar Subsystem DEGRADED',
          message: `Economic calendar subsystem transitioned to "degraded". Reasons: ${health.reasons.join(', ')}`
        };
      } else {
        // Persistent degraded: check cooldown
        const cooldownMs = this.getCooldownMinutes() * 60 * 1000;
        const timeSinceLastAlert = this.lastAlertTime ? (now.getTime() - new Date(this.lastAlertTime).getTime()) : Infinity;

        if (bypassCooldown || timeSinceLastAlert >= cooldownMs) {
          shouldAlert = true;
          alertToTrigger = {
            type: ALERT_TYPES.INCIDENT_DEGRADED,
            notificationType: 'incident_reminder',
            severity: 'warning',
            title: '🔔 [Reminder] Economic Calendar is still DEGRADED',
            message: `Persistent issue: ${health.reasons.join(', ')}`
          };
        }
      }
    } else if (currentState === 'healthy' && wasDegradedOrUnhealthy) {
      // Resolve all open incidents
      const resolvedList = await economicCalendarIncidentService.resolveAllActiveIncidents('Subsystem health returned to nominal');

      if (resolvedList.length > 0) {
        incidentRecord = resolvedList[0];
        shouldAlert = true;
        alertToTrigger = {
          type: ALERT_TYPES.RECOVERY,
          notificationType: 'incident_resolved',
          severity: 'info',
          title: '✅ Economic Calendar Subsystem RECOVERED',
          message: `Economic calendar subsystem has recovered from "${previousState}" to "healthy".`
        };
      }
    }

    // 2. Dispatch Notification and Log History
    let alertRecord = null;
    let deliveryRecord = null;

    if (shouldAlert && alertToTrigger) {
      alertRecord = {
        id: `alert-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        incidentId: incidentRecord?.id || null,
        timestamp: nowIso,
        type: alertToTrigger.type,
        severity: alertToTrigger.severity,
        title: alertToTrigger.title,
        message: alertToTrigger.message,
        previousState,
        currentState,
        reasons: health.reasons,
        healthSnapshot: health
      };

      this.lastAlertTime = nowIso;
      this.lastAlertSeverity = alertToTrigger.severity;
      this.recordAlert(alertRecord);

      // Queue persistent delivery with bounded exponential backoff
      if (incidentRecord) {
        deliveryRecord = await economicCalendarIncidentService.queueAndDeliverNotification(
          incidentRecord,
          alertToTrigger.notificationType,
          {
            customSender: customSink,
            maxAttempts: 3,
            initialDelayMs: 50
          }
        );
      } else if (customSink) {
        await customSink(alertRecord);
      }
    }

    this.lastState = currentState;

    return {
      success: true,
      alertTriggered: shouldAlert,
      alert: alertRecord,
      incident: incidentRecord,
      delivery: deliveryRecord,
      currentHealth: health,
      previousState,
      currentState
    };
  }

  triggerCustomAlert(alertPayload) {
    const alertRecord = {
      id: `alert-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      type: alertPayload.type || 'CUSTOM_ALERT',
      severity: alertPayload.severity || 'warning',
      title: alertPayload.title || 'Economic Calendar Alert',
      message: alertPayload.message || '',
      reasons: alertPayload.reasons || [],
      timestamp: new Date().toISOString()
    };

    this.recordAlert(alertRecord);
    return alertRecord;
  }

  recordAlert(alert) {
    this.alertHistory.unshift(alert);
    if (this.alertHistory.length > this.maxHistorySize) {
      this.alertHistory.pop();
    }
  }

  getAlertHistory(limit = 20) {
    return this.alertHistory.slice(0, limit);
  }

  reset() {
    this.lastState = 'unknown';
    this.lastAlertTime = null;
    this.lastAlertSeverity = null;
    this.alertHistory = [];
    economicCalendarIncidentService.reset();
  }
}

export const economicCalendarAlertService = new EconomicCalendarAlertService();
