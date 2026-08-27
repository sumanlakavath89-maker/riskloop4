/**
 * Official Release Ingestion Service
 * 
 * Deterministic (Zero-AI) official government release ingestion and actuals extractor for:
 *   - CPI Inflation (MoSPI)
 *   - IIP (MoSPI)
 *   - WPI Inflation (Office of Economic Adviser / DPIIT)
 *   - GDP Quarterly Growth (MoSPI / NSO)
 *   - RBI Monetary Policy / Repo Rate (Reserve Bank of India)
 * 
 * Enforces strict validation:
 *   1. Source URL must be from an allowed official government domain (.gov.in, .nic.in, rbi.org.in).
 *   2. Release date/time must align with the scheduled macroeconomic event release cycle.
 *   3. Tests run in isolated dry-run or transactional rollback modes to protect production records.
 */

import axios from 'axios';
import { supabaseEconomicCalendarService } from './SupabaseEconomicCalendarService.js';
import { economicCalendarRolloutGuardService } from './EconomicCalendarRolloutGuardService.js';
import { economicCalendarCanaryActivationService } from './EconomicCalendarCanaryActivationService.js';
import { economicCalendarCanarySafetyService } from './EconomicCalendarCanarySafetyService.js';

export const ALLOWED_OFFICIAL_DOMAINS = [
  'pib.gov.in',
  'mospi.gov.in',
  'rbi.org.in',
  'eaindustry.nic.in'
];

export const OFFICIAL_SOURCE_FEEDS = {
  PIB_ALL: 'https://pib.gov.in/RssMain.aspx?ModId=6',
  RBI_PRESS: 'https://www.rbi.org.in/rss.aspx',
  DPIIT_WPI: 'https://eaindustry.nic.in',
  MOSPI: 'https://www.mospi.gov.in'
};

export const SUPPORTED_CANARY_INDICATORS = [
  'CPI Inflation',
  'IIP',
  'WPI Inflation',
  'GDP',
  'RBI Repo Rate'
];

class OfficialReleaseIngestionService {
  constructor() {
    this.httpClient = axios.create({
      timeout: 10000,
      headers: {
        'User-Agent': 'RiskLoop-Economic-Calendar-Ingestion/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml,application/json'
      }
    });
  }

  /**
   * Validate whether a source URL belongs to an authorized Indian government or central bank domain
   */
  validateOfficialSourceUrl(url) {
    if (!url || typeof url !== 'string') {
      return { valid: false, reason: 'Source URL is required' };
    }

    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname.toLowerCase();

      const isAllowed =
        ALLOWED_OFFICIAL_DOMAINS.some(d => hostname === d || hostname.endsWith(`.${d}`)) ||
        hostname.endsWith('.gov.in') ||
        hostname.endsWith('.nic.in');

      if (!isAllowed) {
        return {
          valid: false,
          reason: `Domain "${hostname}" is not in the whitelist of approved official government domains.`
        };
      }

      return { valid: true, hostname };
    } catch (e) {
      return { valid: false, reason: `Invalid URL format: ${e.message}` };
    }
  }

  /**
   * Determine canonical indicator name from an event title
   */
  getCanonicalIndicatorName(indicatorName) {
    if (!indicatorName || typeof indicatorName !== 'string') return null;

    if (/CPI|Consumer Price Index/i.test(indicatorName)) return 'CPI Inflation';
    if (/\bIIP\b|Index of Industrial Production/i.test(indicatorName)) return 'IIP';
    if (/\bWPI\b|Wholesale Price/i.test(indicatorName)) return 'WPI Inflation';
    if (/\bGDP\b|Gross Domestic Product/i.test(indicatorName)) return 'GDP';
    if (/\bRBI\b|\bRepo Rate\b|\bMonetary Policy\b/i.test(indicatorName)) return 'RBI Repo Rate';

    return null;
  }

  /**
   * Check whether an indicator is approved by ECONOMIC_CALENDAR_CANARY_INDICATORS
   */
  isIndicatorCanaryAllowed(indicatorName, overrideList = undefined) {
    const canonical = this.getCanonicalIndicatorName(indicatorName);
    if (!canonical) {
      return false; // Unknown or unsupported indicator is always blocked
    }

    const rawCanary = overrideList !== undefined
      ? overrideList
      : (process.env.ECONOMIC_CALENDAR_CANARY_INDICATORS || '');

    if (!rawCanary || typeof rawCanary !== 'string' || rawCanary.trim() === '') {
      return false; // Empty canary list -> all indicators blocked from live mutation
    }

    const trimmed = rawCanary.trim();
    if (trimmed.toLowerCase() === 'all') {
      return true; // 'all' allows all 5 supported indicators
    }

    const allowedTokens = trimmed
      .split(',')
      .map(t => t.trim().toLowerCase())
      .filter(t => t.length > 0);

    return allowedTokens.some(token => {
      if (token === canonical.toLowerCase()) return true;
      if (canonical === 'CPI Inflation' && (token === 'cpi' || token === 'cpi inflation')) return true;
      if (canonical === 'IIP' && (token === 'iip')) return true;
      if (canonical === 'WPI Inflation' && (token === 'wpi' || token === 'wpi inflation')) return true;
      if (canonical === 'GDP' && (token === 'gdp')) return true;
      if (canonical === 'RBI Repo Rate' && (token === 'rbi repo rate' || token === 'rbi' || token === 'repo rate' || token === 'rbi interest rate decision')) return true;
      return false;
    });
  }

  /**
   * Deterministic Regex & Rule Parsers for Indian Macro Indicators
   */
  parseReleaseContent(text, title = '') {
    const combined = `${title}\n${text}`;

    // ── 1. CPI Inflation Parser ───────────────────────────────────────────────
    if (
      /Consumer Price Index|CPI|retail inflation|All India CPI/i.test(title) ||
      (/headline inflation|CPI \(Combined\)/i.test(text) && /inflation/i.test(title))
    ) {
      let actual = null;
      let previous = null;

      const actualMatch =
        combined.match(/(?:inflation rate based on CPI|CPI-based inflation|headline inflation|inflation rate \(Year[ -]on[ -]Year\))\s*(?:is|was|stands at|recorded at|at)?\s*[:\s]*([0-9]+(?:\.[0-9]+)?)\s*%/i) ||
        combined.match(/(?:All India Consumer Price Index|CPI).*?(?:stands at|recorded at|is|was)\s*([0-9]+(?:\.[0-9]+)?)\s*%/i) ||
        combined.match(/(?:CPI|retail)\s*inflation\s*(?:for\s*[A-Za-z]+)?\s*(?:is|at|was|stands at)\s*([0-9]+(?:\.[0-9]+)?)\s*%/i);

      if (actualMatch) {
        actual = actualMatch[1];
      }

      const prevMatch =
        combined.match(/(?:corresponding inflation rate for|previous month was|stood at)\s*([0-9]+(?:\.[0-9]+)?)\s*%/i);
      if (prevMatch) {
        previous = prevMatch[1];
      }

      if (actual) {
        return {
          eventName: 'CPI Inflation',
          actual,
          previous,
          unit: '%',
          impact: 'high',
          matchedRule: 'CPI_REGEX_DETERMINISTIC'
        };
      }
    }

    // ── 2. IIP (Index of Industrial Production) Parser ────────────────────────
    if (/Index of Industrial Production|IIP|industrial output/i.test(title) || /Quick Estimates of IIP/i.test(text)) {
      let actual = null;
      let previous = null;

      // Pattern: "IIP grew by 4.8%" or "Quick Estimates of IIP ... 4.8%" (stop before crossing into previous month)
      const actualMatch =
        combined.match(/(?:growth of IIP|IIP grew by|IIP growth rate|Index of Industrial Production)[^.]*?(?:is|was|stood at|grew by|recorded growth of)\s*([0-9.-]+(?:\.[0-9]+)?)\s*%/i) ||
        combined.match(/(?:Quick Estimates of (?:Index of Industrial Production|IIP))[^.]*?([0-9.-]+(?:\.[0-9]+)?)\s*%/i) ||
        combined.match(/IIP[^.]*?(?:grew by|stood at|recorded at)\s*([0-9.-]+(?:\.[0-9]+)?)\s*%/i);

      if (actualMatch) {
        actual = actualMatch[1];
      }

      const prevMatch = combined.match(/(?:growth in the previous month was|stood at|previous month was)\s*([0-9.-]+(?:\.[0-9]+)?)\s*%/i);
      if (prevMatch && prevMatch[1] !== actual) {
        previous = prevMatch[1];
      }

      if (actual) {
        return {
          eventName: 'IIP',
          actual,
          previous,
          unit: '%',
          impact: 'medium',
          matchedRule: 'IIP_REGEX_DETERMINISTIC'
        };
      }
    }

    // ── 3. WPI Inflation Parser ───────────────────────────────────────────────
    if (/Wholesale Price|WPI|wholesale inflation/i.test(combined)) {
      let actual = null;
      let previous = null;

      const actualMatch =
        combined.match(/(?:rate of inflation based on (?:all India )?WPI|annual rate of (?:WPI )?inflation|WPI inflation|inflation based on WPI).*?(?:is|was|stands at|recorded at|at)?\s*([0-9.-]+(?:\.[0-9]+)?)\s*%/i) ||
        combined.match(/(?:Wholesale Price Index|WPI).*?(?:stands at|recorded at|is|was|at)\s*([0-9.-]+(?:\.[0-9]+)?)\s*%/i) ||
        combined.match(/WPI\s*inflation.*?\b([0-9.-]+(?:\.[0-9]+)?)\s*%/i);

      if (actualMatch) {
        actual = actualMatch[1];
      }

      const prevMatch = combined.match(/(?:against|compared to|rate for the previous month was|stood at)\s*([0-9.-]+(?:\.[0-9]+)?)\s*%/i);
      if (prevMatch) {
        previous = prevMatch[1];
      }

      if (actual) {
        return {
          eventName: 'WPI Inflation',
          actual,
          previous,
          unit: '%',
          impact: 'medium',
          matchedRule: 'WPI_REGEX_DETERMINISTIC'
        };
      }
    }

    // ── 4. GDP Quarterly Growth Parser ────────────────────────────────────────
    if (/Gross Domestic Product|GDP|Quarterly Estimates of GDP|National Accounts/i.test(title)) {
      let actual = null;

      const actualMatch =
        combined.match(/(?:Real GDP|GDP at Constant.*Prices|GDP growth).*?(?:estimated to grow by|growth of|is estimated at|stood at|grew by)\s*([0-9]+(?:\.[0-9]+)?)\s*%/i) ||
        combined.match(/GDP.*?Q[1-4].*?([0-9]+(?:\.[0-9]+)?)\s*%/i);

      if (actualMatch) {
        actual = actualMatch[1];
      }

      if (actual) {
        return {
          eventName: 'GDP',
          actual,
          previous: null,
          unit: '%',
          impact: 'high',
          matchedRule: 'GDP_REGEX_DETERMINISTIC'
        };
      }
    }

    // ── 5. RBI Monetary Policy / Repo Rate Parser ─────────────────────────────
    if (/Monetary Policy Committee|MPC Resolution|Policy Repo Rate|Governor's Statement/i.test(title) || /Monetary Policy Statement/i.test(text)) {
      let actual = null;

      const actualMatch =
        combined.match(/(?:policy repo rate under the liquidity adjustment facility \(LAF\)|policy repo rate).*?(?:unchanged at|remains at|kept at|stands at|increased by \d+ bps to|reduced by \d+ bps to)\s*([0-9]+(?:\.[0-9]+)?)\s*%/i) ||
        combined.match(/(?:keep|maintain) the policy repo rate (?:unchanged )?at\s*([0-9]+(?:\.[0-9]+)?)\s*%/i) ||
        combined.match(/repo rate.*?\b([0-9]+(?:\.[0-9]+)?)\s*%/i);

      if (actualMatch) {
        actual = actualMatch[1];
      }

      if (actual) {
        return {
          eventName: 'RBI Monetary Policy / Repo Rate',
          actual,
          previous: null,
          unit: '%',
          impact: 'high',
          matchedRule: 'RBI_MPC_REGEX_DETERMINISTIC'
        };
      }
    }

    return null;
  }

  /**
   * Match parsed release with existing upcoming Supabase record and update it
   * Supports dryRun and rollback options for safe test execution.
   */
  async matchAndUpdateSupabaseEvent(release, options = {}) {
    if (!supabaseEconomicCalendarService.supabase) {
      throw new Error('Supabase is not configured');
    }

    const { eventName, actual, previous, unit, sourceUrl, source, releaseDate } = release;
    const { dryRun = false, rollback = false, allowFutureRelease = false } = options;

    // 1. Strict Validation: Allowed Official Government Domain
    const urlValidation = this.validateOfficialSourceUrl(sourceUrl);
    if (!urlValidation.valid) {
      return {
        matched: false,
        error: 'INVALID_SOURCE_DOMAIN',
        message: `Release rejected: ${urlValidation.reason}`,
        sourceUrl
      };
    }

    // 2. Find target record in Supabase for this indicator
    const { data: matchedRows, error: findErr } = await supabaseEconomicCalendarService.supabase
      .from('economic_events')
      .select('*')
      .eq('country_code', 'IN')
      .ilike('event_name', `%${eventName}%`)
      .order('event_date', { ascending: true });

    if (findErr) throw findErr;

    if (!matchedRows || matchedRows.length === 0) {
      return {
        matched: false,
        error: 'EVENT_NOT_FOUND',
        message: `No existing scheduled record found for ${eventName}`
      };
    }

    // Pick closest matching row (prioritizing exact date or closest upcoming)
    let targetRow = null;
    if (releaseDate) {
      targetRow = matchedRows.find(r => r.event_date === releaseDate);
      if (!targetRow) {
        // Find closest date
        const targetTime = new Date(releaseDate).getTime();
        targetRow = matchedRows.reduce((closest, curr) => {
          const currDiff = Math.abs(new Date(curr.event_date).getTime() - targetTime);
          const closestDiff = Math.abs(new Date(closest.event_date).getTime() - targetTime);
          return currDiff < closestDiff ? curr : closest;
        }, matchedRows[0]);
      }
    } else {
      targetRow = matchedRows.find(r => r.status === 'upcoming') || matchedRows[0];
    }

    // 3. Strict Validation: Release Date & Timing Appropriateness
    if (releaseDate) {
      const scheduledDate = new Date(targetRow.event_date);
      const provDate = new Date(releaseDate);
      const dayDiff = Math.abs((scheduledDate - provDate) / (1000 * 60 * 60 * 24));

      // Release date cannot deviate by more than 3 days from scheduled calendar date
      if (dayDiff > 3) {
        return {
          matched: false,
          error: 'DATE_INCONGRUENT',
          message: `Release date ${releaseDate} does not match scheduled event date ${targetRow.event_date} (deviation ${dayDiff} days exceeds 3-day working threshold).`
        };
      }
    }

    // Check if event is in the future relative to current time (unless simulated)
    const scheduledDateTime = new Date(`${targetRow.event_date}T${targetRow.event_time || '17:30:00'}+05:30`);
    const now = new Date();
    if (scheduledDateTime > now && !allowFutureRelease && !dryRun && !rollback) {
      return {
        matched: false,
        error: 'PREMATURE_RELEASE_ATTEMPT',
        message: `Cannot mark scheduled future event (${targetRow.event_date}) as released before scheduled time.`
      };
    }

    const updatePayload = {
      actual: String(actual),
      status: 'released',
      source_url: sourceUrl || targetRow.source_url,
      source: source || targetRow.source,
      updated_at: new Date().toISOString()
    };

    if (previous !== null && previous !== undefined && previous !== '') {
      updatePayload.previous = String(previous);
    }
    if (unit) {
      updatePayload.unit = unit;
    }

    // In Dry-Run mode: simulate return without writing
    if (dryRun) {
      return {
        matched: true,
        dryRun: true,
        simulatedRecord: { ...targetRow, ...updatePayload },
        previousState: {
          id: targetRow.id,
          event_name: targetRow.event_name,
          event_date: targetRow.event_date,
          status: targetRow.status,
          actual: targetRow.actual
        }
      };
    }

    // Priority 1 Safety Guard: In-Memory Emergency Rollback Override
    if (economicCalendarRolloutGuardService.isEmergencyRollbackActive() && !rollback) {
      console.warn(`🚨 [OfficialReleaseIngestion] Emergency Rollback is ACTIVE! Live database writes to public.economic_events are BLOCKED for ${targetRow.event_name} (${targetRow.event_date}).`);
      return {
        success: true,
        matched: true,
        status: 'blocked',
        reason: 'EMERGENCY_ROLLBACK_ACTIVE',
        indicator: targetRow.event_name,
        message: 'Live database ingestion is blocked because Emergency Rollback is active.',
        simulatedRecord: { ...targetRow, ...updatePayload },
        previousState: {
          id: targetRow.id,
          event_name: targetRow.event_name,
          event_date: targetRow.event_date,
          status: targetRow.status,
          actual: targetRow.actual
        }
      };
    }

    // Priority 2 Safety Switch: Master Live Ingestion Switch (ECONOMIC_CALENDAR_LIVE_INGESTION_ENABLED)
    const liveIngestionEnabled = options.overrideLiveIngestion !== undefined
      ? options.overrideLiveIngestion
      : process.env.ECONOMIC_CALENDAR_LIVE_INGESTION_ENABLED === 'true';

    if (!liveIngestionEnabled && !rollback) {
      console.log(`🔒 [OfficialReleaseIngestion] Live ingestion is disabled (ECONOMIC_CALENDAR_LIVE_INGESTION_ENABLED=false). Skipping mutation to public.economic_events for ${targetRow.event_name} (${targetRow.event_date}).`);
      return {
        success: true,
        matched: true,
        status: 'dry_run_only',
        reason: 'LIVE_INGESTION_DISABLED',
        message: 'Live database ingestion is disabled (ECONOMIC_CALENDAR_LIVE_INGESTION_ENABLED=false). Event was not modified in Supabase.',
        simulatedRecord: { ...targetRow, ...updatePayload },
        previousState: {
          id: targetRow.id,
          event_name: targetRow.event_name,
          event_date: targetRow.event_date,
          status: targetRow.status,
          actual: targetRow.actual
        }
      };
    }

    // Priority 3 & 4 Safety Guard: Runtime In-Memory Canary Activation Check
    const requireRuntimeCanary = options.enforceRuntimeCanary !== undefined
      ? options.enforceRuntimeCanary
      : (economicCalendarCanaryActivationService.isAnyCanaryActive() || options.overrideRuntimeCanaryActive !== undefined);

    if (requireRuntimeCanary && !rollback) {
      const isRuntimeActive = options.overrideRuntimeCanaryActive !== undefined
        ? options.overrideRuntimeCanaryActive
        : economicCalendarCanaryActivationService.isAnyCanaryActive();

      if (!isRuntimeActive) {
        return {
          success: true,
          matched: true,
          status: 'canary_blocked',
          reason: 'RUNTIME_CANARY_NOT_ACTIVATED',
          indicator: targetRow.event_name,
          message: 'Live database ingestion blocked: Runtime canary activation is not active.',
          simulatedRecord: { ...targetRow, ...updatePayload },
          previousState: {
            id: targetRow.id,
            event_name: targetRow.event_name,
            event_date: targetRow.event_date,
            status: targetRow.status,
            actual: targetRow.actual
          }
        };
      }

      const isIndicatorApprovedInRuntime = options.overrideRuntimeIndicatorApproved !== undefined
        ? options.overrideRuntimeIndicatorApproved
        : economicCalendarCanaryActivationService.isCanaryActiveForIndicator(targetRow.event_name);

      if (!isIndicatorApprovedInRuntime) {
        return {
          success: true,
          matched: true,
          status: 'canary_blocked',
          reason: 'INDICATOR_NOT_RUNTIME_APPROVED',
          indicator: targetRow.event_name,
          message: `Live database ingestion blocked: Indicator "${targetRow.event_name}" is not approved in active runtime canary.`,
          simulatedRecord: { ...targetRow, ...updatePayload },
          previousState: {
            id: targetRow.id,
            event_name: targetRow.event_name,
            event_date: targetRow.event_date,
            status: targetRow.status,
            actual: targetRow.actual
          }
        };
      }
    }

    // Priority 5 Safety Switch: Configured Canary Whitelist (ECONOMIC_CALENDAR_CANARY_INDICATORS)
    const isCanaryApproved = this.isIndicatorCanaryAllowed(
      targetRow.event_name,
      options.overrideCanaryIndicators
    );

    if (!isCanaryApproved && !rollback) {
      console.log(`🔒 [OfficialReleaseIngestion] Canary control blocked live ingestion for "${targetRow.event_name}". Configured canary: "${process.env.ECONOMIC_CALENDAR_CANARY_INDICATORS || '(none)'}".`);
      return {
        success: true,
        matched: true,
        status: 'canary_blocked',
        reason: 'INDICATOR_NOT_ALLOWED_FOR_LIVE_INGESTION',
        indicator: targetRow.event_name,
        message: `Live ingestion for "${targetRow.event_name}" is blocked by canary control (ECONOMIC_CALENDAR_CANARY_INDICATORS="${process.env.ECONOMIC_CALENDAR_CANARY_INDICATORS || ''}").`,
        simulatedRecord: { ...targetRow, ...updatePayload },
        previousState: {
          id: targetRow.id,
          event_name: targetRow.event_name,
          event_date: targetRow.event_date,
          status: targetRow.status,
          actual: targetRow.actual
        }
      };
    }

    // Capture complete exact snapshot of target row state before write
    const capturedState = economicCalendarCanarySafetyService.captureEventState(targetRow);

    // Pre-Write Validation & Duplicate Release Protection
    const preWriteValidation = economicCalendarCanarySafetyService.validatePreWrite(targetRow, release, options);
    if (!preWriteValidation.valid) {
      return {
        matched: false,
        error: preWriteValidation.error,
        message: preWriteValidation.message
      };
    }

    // Execute update in Supabase
    const { data: updatedRows, error: updateErr } = await supabaseEconomicCalendarService.supabase
      .from('economic_events')
      .update(updatePayload)
      .eq('id', targetRow.id)
      .select();

    if (updateErr) throw updateErr;

    // Post-Write Verification
    if (!options.skipPostVerify) {
      const postVerify = await economicCalendarCanarySafetyService.verifyPostWrite(targetRow.id, updatePayload);
      if (!postVerify.verified) {
        // Automatic per-event rollback on post-write verification failure
        await economicCalendarCanarySafetyService.rollbackEvent(targetRow.id, capturedState);
        await economicCalendarCanarySafetyService.recordSafetyFailure(
          postVerify.message,
          postVerify.error,
          targetRow,
          capturedState
        );

        return {
          matched: true,
          success: false,
          status: 'safety_rollback',
          error: postVerify.error,
          message: postVerify.message,
          rolledBack: true,
          previousState: capturedState
        };
      }

      economicCalendarCanarySafetyService.recordSafetySuccess({
        eventId: targetRow.id,
        eventName: targetRow.event_name
      });
    }

    const result = {
      matched: true,
      success: true,
      updatedRecord: updatedRows?.[0] || { id: targetRow.id, ...updatePayload },
      previousState: capturedState
    };

    // If test rollback requested: immediately restore previous state
    if (rollback) {
      await economicCalendarCanarySafetyService.rollbackEvent(targetRow.id, capturedState);
      result.rolledBack = true;
    }

    return result;
  }

  /**
   * Ingest a single release payload
   */
  async ingestSingleRelease(payload, options = {}) {
    const { title = '', content = '', url = '', source = 'Official Government Release', releaseDate } = payload;

    const parsed = this.parseReleaseContent(content, title);
    if (!parsed) {
      return {
        success: false,
        parsed: false,
        message: 'Could not extract recognized macroeconomic metric from release text',
        title
      };
    }

    const updateResult = await this.matchAndUpdateSupabaseEvent(
      {
        eventName: parsed.eventName,
        actual: parsed.actual,
        previous: parsed.previous,
        unit: parsed.unit,
        sourceUrl: url,
        source,
        releaseDate
      },
      options
    );

    return {
      success: updateResult.matched === true,
      parsed: true,
      extractedMetric: parsed,
      updateResult
    };
  }
}

export const officialReleaseIngestionService = new OfficialReleaseIngestionService();
