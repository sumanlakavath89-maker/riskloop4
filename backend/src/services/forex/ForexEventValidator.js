/**
 * Forex Event Validator
 * 
 * Validates Forex macroeconomic events for required fields, USD currency,
 * canonical event names, dates, times, and impact levels.
 * Phase 7.1 USD Foundation.
 */

import { forexEventNormalizer, SUPPORTED_USD_EVENTS } from './ForexEventNormalizer.js';

export const ALLOWED_CURRENCIES = ['USD']; // Phase 7.1 Scope: USD only
export const ALLOWED_IMPACTS = ['high', 'medium', 'low'];
export const ALLOWED_STATUSES = ['upcoming', 'released', 'delayed'];

export class ForexEventValidator {
  /**
   * Validate a single Forex economic event record
   * 
   * @param {Object} event Raw or normalized Forex event object
   * @returns {{ valid: boolean, errors: string[], normalizedEvent: Object|null }}
   */
  validateForexEvent(event) {
    const errors = [];

    if (!event || typeof event !== 'object') {
      return {
        valid: false,
        errors: ['Event payload must be a non-null object'],
        normalizedEvent: null
      };
    }

    // Step 1: Normalize event name & structure
    const normalized = forexEventNormalizer.normalizeForexEvent(event);
    if (!normalized) {
      const rawName = event.event_name || event.name || event.title || '(unnamed)';
      return {
        valid: false,
        errors: [`Event "${rawName}" is not a supported USD canonical macroeconomic event`],
        normalizedEvent: null
      };
    }

    // Step 2: Currency Validation
    if (!normalized.currency) {
      errors.push('Currency is required');
    } else if (!ALLOWED_CURRENCIES.includes(normalized.currency.toUpperCase())) {
      errors.push(`Currency "${normalized.currency}" is not supported in Phase 7.1 (Supported: ${ALLOWED_CURRENCIES.join(', ')})`);
    }

    // Step 3: Canonical Event Name Validation
    if (!SUPPORTED_USD_EVENTS.includes(normalized.canonical_event_name)) {
      errors.push(`Canonical event name "${normalized.canonical_event_name}" is not supported`);
    }

    // Step 4: Required Fields
    if (!normalized.country || normalized.country.trim() === '') {
      errors.push('Country is required');
    }
    if (!normalized.event_name || normalized.event_name.trim() === '') {
      errors.push('Event name is required');
    }

    // Step 5: Date Validation (YYYY-MM-DD)
    if (!normalized.event_date) {
      errors.push('Event date is required (YYYY-MM-DD)');
    } else {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(normalized.event_date)) {
        errors.push(`Invalid date format "${normalized.event_date}". Expected YYYY-MM-DD`);
      } else {
        const [year, month, day] = normalized.event_date.split('-').map(Number);
        const parsedDate = new Date(`${normalized.event_date}T00:00:00Z`);
        const isValidDate =
          !isNaN(parsedDate.getTime()) &&
          parsedDate.getUTCFullYear() === year &&
          parsedDate.getUTCMonth() + 1 === month &&
          parsedDate.getUTCDate() === day;

        if (!isValidDate || month < 1 || month > 12 || day < 1 || day > 31) {
          errors.push(`Date "${normalized.event_date}" is not a valid calendar date`);
        }
      }
    }

    // Step 6: Time Validation (HH:MM or HH:MM:SS in 24-hour format)
    if (!normalized.event_time) {
      errors.push('Event time is required (HH:MM or HH:MM:SS)');
    } else {
      const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/;
      if (!timeRegex.test(normalized.event_time)) {
        errors.push(`Invalid time format "${normalized.event_time}". Expected 24-hour format HH:MM or HH:MM:SS`);
      }
    }

    // Step 7: Impact Validation
    if (!ALLOWED_IMPACTS.includes(normalized.impact)) {
      errors.push(`Invalid impact level "${normalized.impact}". Allowed: ${ALLOWED_IMPACTS.join(', ')}`);
    }

    // Step 8: Status Validation
    if (!ALLOWED_STATUSES.includes(normalized.status)) {
      errors.push(`Invalid status "${normalized.status}". Allowed: ${ALLOWED_STATUSES.join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      normalizedEvent: errors.length === 0 ? normalized : null
    };
  }
}

export const forexEventValidator = new ForexEventValidator();
