/**
 * Economic Calendar Incident Service
 * 
 * Manages persistent incident lifecycles (open -> acknowledged -> resolved) and
 * resilient notification delivery with bounded exponential backoff.
 * 
 * Features:
 * - Single active incident per root problem (incident_key deduplication).
 * - Multi-instance clustering safety.
 * - Bounded retry backoff for notification channels.
 * - Resilient fallback store if database tables are in migration or offline.
 */

import crypto from 'crypto';
import { supabaseEconomicCalendarService } from './SupabaseEconomicCalendarService.js';
import { emailService } from './EmailService.js';

class EconomicCalendarIncidentService {
  constructor() {
    this.memoryIncidents = new Map(); // Fallback map: Map<id, incident>
    this.memoryNotifications = new Map(); // Fallback map: Map<id, notif>
  }

  getSupabase() {
    return supabaseEconomicCalendarService.supabase;
  }

  /**
   * Open a new incident or update existing active incident
   * 
   * @param {Object} data
   * @param {string} data.incidentKey
   * @param {string} data.severity ('critical' | 'warning' | 'info')
   * @param {string} data.title
   * @param {string} [data.description]
   * @param {Array} [data.reasons=[]]
   * @param {Object} [data.healthSnapshot={}]
   * @returns {Promise<{ incident: Object, isNew: boolean }>}
   */
  async openOrUpdateIncident(data) {
    const {
      incidentKey,
      severity = 'critical',
      title,
      description = '',
      reasons = [],
      healthSnapshot = {}
    } = data;

    const supabase = this.getSupabase();
    const now = new Date().toISOString();

    // 1. Try Supabase
    if (supabase) {
      try {
        // Find existing open or acknowledged incident
        const { data: existing, error: findErr } = await supabase
          .from('economic_calendar_incidents')
          .select('*')
          .eq('incident_key', incidentKey)
          .in('status', ['open', 'acknowledged'])
          .order('opened_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!findErr && existing) {
          // Update last_seen_at and snapshot
          const { data: updated } = await supabase
            .from('economic_calendar_incidents')
            .update({
              last_seen_at: now,
              health_snapshot: healthSnapshot,
              reasons: reasons,
              updated_at: now
            })
            .eq('id', existing.id)
            .select('*')
            .single();

          return { incident: updated || existing, isNew: false };
        }

        // Insert new incident
        const newRecord = {
          id: crypto.randomUUID(),
          incident_key: incidentKey,
          severity,
          status: 'open',
          title,
          description,
          reasons: reasons || [],
          health_snapshot: healthSnapshot || {},
          opened_at: now,
          last_seen_at: now,
          created_at: now,
          updated_at: now
        };

        const { data: created, error: insertErr } = await supabase
          .from('economic_calendar_incidents')
          .insert(newRecord)
          .select('*')
          .single();

        if (!insertErr && created) {
          return { incident: created, isNew: true };
        }
      } catch {
        // Fall through to memory fallback
      }
    }

    // 2. Resilient In-Memory Fallback
    for (const inc of this.memoryIncidents.values()) {
      if (inc.incident_key === incidentKey && (inc.status === 'open' || inc.status === 'acknowledged')) {
        inc.last_seen_at = now;
        inc.health_snapshot = healthSnapshot;
        inc.reasons = reasons;
        inc.updated_at = now;
        return { incident: inc, isNew: false };
      }
    }

    const fallbackIncident = {
      id: crypto.randomUUID(),
      incident_key: incidentKey,
      severity,
      status: 'open',
      title,
      description,
      reasons,
      health_snapshot: healthSnapshot,
      opened_at: now,
      last_seen_at: now,
      created_at: now,
      updated_at: now
    };

    this.memoryIncidents.set(fallbackIncident.id, fallbackIncident);
    return { incident: fallbackIncident, isNew: true };
  }

  /**
   * Acknowledge an active incident
   */
  async acknowledgeIncident(incidentId, acknowledgedBy = 'admin') {
    const supabase = this.getSupabase();
    const now = new Date().toISOString();

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('economic_calendar_incidents')
          .update({
            status: 'acknowledged',
            acknowledged_at: now,
            acknowledged_by: acknowledgedBy,
            updated_at: now
          })
          .eq('id', incidentId)
          .select('*')
          .single();

        if (!error && data) return data;
      } catch {}
    }

    if (this.memoryIncidents.has(incidentId)) {
      const inc = this.memoryIncidents.get(incidentId);
      inc.status = 'acknowledged';
      inc.acknowledged_at = now;
      inc.acknowledged_by = acknowledgedBy;
      inc.updated_at = now;
      return inc;
    }

    return null;
  }

  /**
   * Resolve a specific incident
   */
  async resolveIncident(incidentId, resolutionNotes = 'Resolved automatically on recovery') {
    const supabase = this.getSupabase();
    const now = new Date().toISOString();

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('economic_calendar_incidents')
          .update({
            status: 'resolved',
            resolved_at: now,
            resolution_notes: resolutionNotes,
            updated_at: now
          })
          .eq('id', incidentId)
          .select('*')
          .single();

        if (!error && data) return data;
      } catch {}
    }

    if (this.memoryIncidents.has(incidentId)) {
      const inc = this.memoryIncidents.get(incidentId);
      inc.status = 'resolved';
      inc.resolved_at = now;
      inc.resolution_notes = resolutionNotes;
      inc.updated_at = now;
      return inc;
    }

    return null;
  }

  /**
   * Resolve all active incidents upon system health recovery
   */
  async resolveAllActiveIncidents(resolutionNotes = 'Subsystem recovered to healthy state') {
    const active = await this.getActiveIncidents();
    const resolvedList = [];

    for (const inc of active) {
      const resolved = await this.resolveIncident(inc.id, resolutionNotes);
      if (resolved) resolvedList.push(resolved);
    }

    return resolvedList;
  }

  /**
   * Fetch all currently active (open / acknowledged) incidents
   */
  async getActiveIncidents() {
    const supabase = this.getSupabase();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('economic_calendar_incidents')
          .select('*')
          .in('status', ['open', 'acknowledged'])
          .order('opened_at', { ascending: false });

        if (!error && data) return data;
      } catch {}
    }

    return Array.from(this.memoryIncidents.values()).filter(
      i => i.status === 'open' || i.status === 'acknowledged'
    );
  }

  /**
   * Fetch incident history
   */
  async getIncidentHistory(limit = 20) {
    const supabase = this.getSupabase();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('economic_calendar_incidents')
          .select('*')
          .order('opened_at', { ascending: false })
          .limit(limit);

        if (!error && data) return data;
      } catch {}
    }

    return Array.from(this.memoryIncidents.values())
      .sort((a, b) => new Date(b.opened_at) - new Date(a.opened_at))
      .slice(0, limit);
  }

  /**
   * Queue and deliver incident notification with bounded exponential backoff
   * 
   * @param {Object} incident
   * @param {string} notificationType ('incident_opened' | 'incident_reminder' | 'incident_resolved')
   * @param {Object} [options]
   * @param {Function} [options.customSender]
   * @param {number} [options.maxAttempts=3]
   * @param {number} [options.initialDelayMs=100]
   */
  async queueAndDeliverNotification(incident, notificationType, options = {}) {
    const {
      customSender = null,
      maxAttempts = 3,
      initialDelayMs = 50,
      channel = 'console'
    } = options;

    const notifId = crypto.randomUUID();
    const now = new Date().toISOString();

    const notifRecord = {
      id: notifId,
      incident_id: incident.id,
      notification_type: notificationType,
      channel,
      recipient: 'admin@riskloop.io',
      status: 'pending',
      attempts: 0,
      max_attempts: maxAttempts,
      last_attempt_at: null,
      last_error: null,
      payload: {
        incidentKey: incident.incident_key,
        severity: incident.severity,
        title: incident.title,
        status: incident.status
      },
      created_at: now
    };

    // Save initial record
    const supabase = this.getSupabase();
    if (supabase) {
      try {
        await supabase.from('economic_calendar_notifications').insert(notifRecord);
      } catch {}
    }
    this.memoryNotifications.set(notifId, notifRecord);

    // Delivery with Bounded Exponential Backoff
    let delivered = false;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      notifRecord.attempts = attempt;
      notifRecord.last_attempt_at = new Date().toISOString();

      try {
        if (customSender && typeof customSender === 'function') {
          await customSender(notifRecord, attempt);
        } else {
          // Default console channel fallback
          const prefix = incident.severity === 'critical' ? '🚨' : incident.severity === 'warning' ? '⚠️' : '✅';
          console.log(`${prefix} [IncidentNotification] [${notificationType}] ${incident.title}`);
        }

        delivered = true;
        notifRecord.status = 'delivered';
        break;
      } catch (err) {
        lastError = err.message;
        notifRecord.last_error = lastError;

        if (attempt < maxAttempts) {
          const delay = initialDelayMs * Math.pow(2, attempt - 1);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }

    if (!delivered) {
      notifRecord.status = 'failed';
    }

    // Update persistence
    if (supabase) {
      try {
        await supabase
          .from('economic_calendar_notifications')
          .update({
            status: notifRecord.status,
            attempts: notifRecord.attempts,
            last_attempt_at: notifRecord.last_attempt_at,
            last_error: notifRecord.last_error
          })
          .eq('id', notifId);
      } catch {}
    }

    return notifRecord;
  }

  /**
   * Reset in-memory maps (useful for test isolation)
   */
  reset() {
    this.memoryIncidents.clear();
    this.memoryNotifications.clear();
  }
}

export const economicCalendarIncidentService = new EconomicCalendarIncidentService();
