/**
 * Timezone Utility for RiskLoop Global Economic Calendar
 * Phase 7.8: Unified Timezone Conversion & Formatting
 */

export const TimezoneUtil = {
  /**
   * Detect user's local timezone
   */
  getUserTimezone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
    } catch {
      return 'Asia/Kolkata';
    }
  },

  /**
   * Common global timezones for user selection
   */
  getCommonTimezones() {
    return [
      { id: 'Asia/Kolkata', label: 'IST (India - UTC+05:30)' },
      { id: 'UTC', label: 'UTC (Coordinated Universal Time)' },
      { id: 'America/New_York', label: 'EST/EDT (New York - UTC-05:00)' },
      { id: 'Europe/London', label: 'GMT/BST (London - UTC+00:00)' },
      { id: 'Europe/Brussels', label: 'CET/CEST (Brussels/Frankfurt - UTC+01:00)' },
      { id: 'Asia/Tokyo', label: 'JST (Tokyo - UTC+09:00)' },
      { id: 'Australia/Sydney', label: 'AEST/AEDT (Sydney - UTC+10:00)' },
      { id: 'Asia/Shanghai', label: 'CST (Shanghai - UTC+08:00)' },
      { id: 'America/Toronto', label: 'EST/EDT (Toronto - UTC-05:00)' },
      { id: 'Europe/Zurich', label: 'CET/CEST (Zurich - UTC+01:00)' }
    ];
  },

  /**
   * Format ISO or date/time string to target timezone
   */
  formatDateTime(dateStr, timeStr, sourceTz = 'UTC', targetTz = 'Asia/Kolkata') {
    try {
      const safeTime = (timeStr && timeStr !== '—') ? timeStr : '12:00';
      const cleanTime = safeTime.length === 5 ? `${safeTime}:00` : safeTime;
      const isoStr = `${dateStr}T${cleanTime}`;
      const d = new Date(isoStr);

      const dateFormatter = new Intl.DateTimeFormat('en-IN', {
        timeZone: targetTz,
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });

      const timeFormatter = new Intl.DateTimeFormat('en-IN', {
        timeZone: targetTz,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });

      return {
        formattedDate: dateFormatter.format(d),
        formattedTime: timeFormatter.format(d),
        timezone: targetTz
      };
    } catch {
      return {
        formattedDate: dateStr || '—',
        formattedTime: timeStr || '—',
        timezone: targetTz
      };
    }
  },

  /**
   * Calculate human readable countdown (e.g. "In 2h 15m", "Tomorrow", "Released")
   */
  formatCountdown(dateStr, timeStr) {
    try {
      if (!dateStr) return '—';
      const safeTime = (timeStr && timeStr !== '—') ? timeStr : '12:00';
      const target = new Date(`${dateStr}T${safeTime.length === 5 ? safeTime + ':00' : safeTime}`).getTime();
      const now = Date.now();
      const diffMs = target - now;

      if (diffMs <= 0) {
        return 'Released / Due';
      }

      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHours = Math.floor(diffMin / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffDays > 0) {
        return `In ${diffDays}d ${diffHours % 24}h`;
      }
      if (diffHours > 0) {
        return `In ${diffHours}h ${diffMin % 60}m`;
      }
      return `In ${diffMin}m`;
    } catch {
      return 'Upcoming';
    }
  }
};

if (typeof window !== 'undefined') {
  window.TimezoneUtil = TimezoneUtil;
}
