/**
 * Scheduler Lock Service
 * 
 * Provides Supabase-backed distributed locking to ensure only a single Node.js
 * instance or server process can execute scheduler cycles simultaneously across
 * a horizontally scaled / clustered environment.
 */

import os from 'os';
import crypto from 'crypto';
import { supabaseEconomicCalendarService } from './SupabaseEconomicCalendarService.js';

class SchedulerLockService {
  constructor() {
    this.instanceId = `${os.hostname()}-${process.pid}-${crypto.randomUUID()}`;
    console.log(`🔒 [SchedulerLockService] Instance ID registered: ${this.instanceId}`);
  }

  /**
   * Acquire a distributed lock for the given lock name
   * 
   * @param {string} [lockName='economic_calendar_scheduler']
   * @param {string} [lockedBy=this.instanceId]
   * @param {number} [ttlSeconds=300]
   * @returns {Promise<{ success: boolean, lockName: string, lockedBy: string, error?: string }>}
   */
  async acquireLock(lockName = 'economic_calendar_scheduler', lockedBy = this.instanceId, ttlSeconds = 300) {
    const supabase = supabaseEconomicCalendarService.supabase;
    if (!supabase) {
      console.warn('⚠️ [SchedulerLockService] Supabase not connected; distributed lock bypassed in local dev.');
      return { success: true, lockName, lockedBy, bypassed: true };
    }

    try {
      // 1. Try acquire via RPC function
      const { data, error } = await supabase.rpc('acquire_scheduler_lock', {
        p_lock_name: lockName,
        p_locked_by: lockedBy,
        p_ttl_seconds: ttlSeconds
      });

      if (!error && typeof data === 'boolean') {
        return {
          success: data === true,
          lockName,
          lockedBy
        };
      }

      // Fallback: Direct table operations if RPC is unavailable
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();

      const { data: existingLock } = await supabase
        .from('scheduler_locks')
        .select('*')
        .eq('lock_name', lockName)
        .maybeSingle();

      if (!existingLock) {
        const { error: insertErr } = await supabase.from('scheduler_locks').insert({
          lock_name: lockName,
          locked_by: lockedBy,
          locked_at: now.toISOString(),
          expires_at: expiresAt
        });
        return { success: !insertErr, lockName, lockedBy };
      }

      const isExpired = new Date(existingLock.expires_at) <= now;
      const isSameOwner = existingLock.locked_by === lockedBy;

      if (isExpired || isSameOwner) {
        const { error: updateErr } = await supabase
          .from('scheduler_locks')
          .update({
            locked_by: lockedBy,
            locked_at: now.toISOString(),
            expires_at: expiresAt
          })
          .eq('lock_name', lockName);

        return { success: !updateErr, lockName, lockedBy };
      }

      // Locked by another active unexpired instance
      return {
        success: false,
        lockName,
        lockedBy,
        existingOwner: existingLock.locked_by,
        expiresAt: existingLock.expires_at
      };
    } catch (err) {
      console.error(`❌ [SchedulerLockService] Failed to acquire lock "${lockName}":`, err.message);
      return { success: false, lockName, lockedBy, error: err.message };
    }
  }

  /**
   * Release a previously acquired distributed lock
   * 
   * @param {string} [lockName='economic_calendar_scheduler']
   * @param {string} [lockedBy=this.instanceId]
   * @returns {Promise<{ success: boolean, lockName: string, lockedBy: string }>}
   */
  async releaseLock(lockName = 'economic_calendar_scheduler', lockedBy = this.instanceId) {
    const supabase = supabaseEconomicCalendarService.supabase;
    if (!supabase) {
      return { success: true, lockName, lockedBy };
    }

    try {
      // Only delete if the current instance is the actual lock owner
      const { error } = await supabase
        .from('scheduler_locks')
        .delete()
        .eq('lock_name', lockName)
        .eq('locked_by', lockedBy);

      if (error) {
        console.warn(`⚠️ [SchedulerLockService] Release lock warning for "${lockName}": ${error.message}`);
        return { success: false, lockName, lockedBy, error: error.message };
      }

      return { success: true, lockName, lockedBy };
    } catch (err) {
      console.error(`❌ [SchedulerLockService] Error releasing lock "${lockName}":`, err.message);
      return { success: false, lockName, lockedBy, error: err.message };
    }
  }

  /**
   * Check status of a distributed lock
   * 
   * @param {string} [lockName='economic_calendar_scheduler']
   */
  async getLockStatus(lockName = 'economic_calendar_scheduler') {
    const supabase = supabaseEconomicCalendarService.supabase;
    if (!supabase) {
      return { isLocked: false, isExpired: true, lock: null };
    }

    try {
      const { data, error } = await supabase
        .from('scheduler_locks')
        .select('*')
        .eq('lock_name', lockName)
        .maybeSingle();

      if (error || !data) {
        return { isLocked: false, isExpired: true, lock: null };
      }

      const isExpired = new Date(data.expires_at) <= new Date();
      return {
        isLocked: !isExpired,
        isExpired,
        lock: data
      };
    } catch (err) {
      return { isLocked: false, isExpired: true, error: err.message, lock: null };
    }
  }
}

export const schedulerLockService = new SchedulerLockService();
