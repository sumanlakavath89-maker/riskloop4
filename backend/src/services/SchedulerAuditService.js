/**
 * Scheduler Audit Service
 * 
 * Manages persistent audit logging for scheduler cycles in Supabase public.scheduler_runs.
 * Tracks instance ID, execution status, runtime duration, counts, errors, and metadata.
 */

import { supabaseEconomicCalendarService } from './SupabaseEconomicCalendarService.js';

class SchedulerAuditService {
  constructor() {
    this.supabase = supabaseEconomicCalendarService.supabase;
  }

  /**
   * Helper: Get current Supabase client instance
   */
  getClient() {
    return supabaseEconomicCalendarService.supabase;
  }

  /**
   * Start an audit log entry for a new scheduler run
   * 
   * @param {Object} params
   * @param {string} [params.schedulerName='economic_calendar_scheduler']
   * @param {string} [params.instanceId]
   * @param {Object} [params.metadata={}]
   * @returns {Promise<Object|null>} The inserted run record or null
   */
  async startRun(params = {}) {
    const supabase = this.getClient();
    if (!supabase) {
      console.warn('⚠️ [SchedulerAuditService] Supabase not connected; skipping audit log start.');
      return null;
    }

    const {
      schedulerName = 'economic_calendar_scheduler',
      instanceId = null,
      metadata = {}
    } = params;

    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('scheduler_runs')
        .insert({
          scheduler_name: schedulerName,
          instance_id: instanceId,
          started_at: now,
          status: 'running',
          events_checked: 0,
          events_released: 0,
          errors: [],
          metadata: metadata || {}
        })
        .select('*')
        .single();

      if (error) {
        console.warn(`⚠️ [SchedulerAuditService] Failed to insert startRun: ${error.message}`);
        return null;
      }

      return data;
    } catch (err) {
      console.warn(`⚠️ [SchedulerAuditService] Error in startRun: ${err.message}`);
      return null;
    }
  }

  /**
   * Complete an existing audit log entry successfully
   * 
   * @param {string} runId
   * @param {Object} [params={}]
   * @param {number} [params.eventsChecked=0]
   * @param {number} [params.eventsReleased=0]
   * @param {Object} [params.metadata={}]
   * @returns {Promise<Object|null>}
   */
  async completeRun(runId, params = {}) {
    if (!runId) return null;
    const supabase = this.getClient();
    if (!supabase) return null;

    const {
      eventsChecked = 0,
      eventsReleased = 0,
      metadata = {}
    } = params;

    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('scheduler_runs')
        .update({
          status: 'completed',
          completed_at: now,
          events_checked: eventsChecked,
          events_released: eventsReleased,
          metadata: metadata || {}
        })
        .eq('id', runId)
        .select('*')
        .single();

      if (error) {
        console.warn(`⚠️ [SchedulerAuditService] Failed to update completeRun for ${runId}: ${error.message}`);
        return null;
      }

      return data;
    } catch (err) {
      console.warn(`⚠️ [SchedulerAuditService] Error in completeRun: ${err.message}`);
      return null;
    }
  }

  /**
   * Mark an audit log entry as failed with structured error details
   * 
   * @param {string} runId
   * @param {Error|string|Object} error
   * @param {Object} [params={}]
   * @returns {Promise<Object|null>}
   */
  async failRun(runId, error, params = {}) {
    if (!runId) return null;
    const supabase = this.getClient();
    if (!supabase) return null;

    const {
      eventsChecked = 0,
      eventsReleased = 0,
      metadata = {}
    } = params;

    try {
      const errorObj = {
        message: error?.message || (typeof error === 'string' ? error : JSON.stringify(error)),
        code: error?.code || 'SCHEDULER_ERROR',
        timestamp: new Date().toISOString(),
        stack: error?.stack ? error.stack.split('\n').slice(0, 3).join(' ') : undefined
      };

      const now = new Date().toISOString();
      const { data, updateError } = await supabase
        .from('scheduler_runs')
        .update({
          status: 'failed',
          completed_at: now,
          events_checked: eventsChecked,
          events_released: eventsReleased,
          errors: [errorObj],
          metadata: metadata || {}
        })
        .eq('id', runId)
        .select('*')
        .single();

      if (updateError) {
        console.warn(`⚠️ [SchedulerAuditService] Failed to update failRun for ${runId}: ${updateError.message}`);
        return null;
      }

      return data;
    } catch (err) {
      console.warn(`⚠️ [SchedulerAuditService] Error in failRun: ${err.message}`);
      return null;
    }
  }

  /**
   * Fetch recent scheduler run history
   * 
   * @param {number} [limit=20]
   * @param {string} [schedulerName='economic_calendar_scheduler']
   */
  async getRecentRuns(limit = 20, schedulerName = 'economic_calendar_scheduler') {
    const supabase = this.getClient();
    if (!supabase) return [];

    try {
      let query = supabase
        .from('scheduler_runs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(limit);

      if (schedulerName) {
        query = query.eq('scheduler_name', schedulerName);
      }

      const { data, error } = await query;
      if (error) {
        console.warn(`⚠️ [SchedulerAuditService] Error fetching recent runs: ${error.message}`);
        return [];
      }

      return data || [];
    } catch (err) {
      console.warn(`⚠️ [SchedulerAuditService] Exception fetching recent runs: ${err.message}`);
      return [];
    }
  }

  /**
   * Fetch the most recent successful scheduler run
   * 
   * @param {string} [schedulerName='economic_calendar_scheduler']
   */
  async getLatestSuccessfulRun(schedulerName = 'economic_calendar_scheduler') {
    const supabase = this.getClient();
    if (!supabase) return null;

    try {
      const { data, error } = await supabase
        .from('scheduler_runs')
        .select('*')
        .eq('scheduler_name', schedulerName)
        .eq('status', 'completed')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        return null;
      }

      return data;
    } catch (err) {
      return null;
    }
  }
}

export const schedulerAuditService = new SchedulerAuditService();
