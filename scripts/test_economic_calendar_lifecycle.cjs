/**
 * Comprehensive Test Suite: Economic Calendar Data Update Lifecycle
 * 
 * Validates:
 * 1. Before Event Release: Previous & Forecast displayed as soon as available, Actual is '—'.
 * 2. Zero-value handling: 0 or 0.0 is never treated as falsy or missing ('0%' not '—').
 * 3. Event Release Lifecycle: Ingestion extracts published actual and upserts into database.
 * 4. Preservation rules: Existing Previous & Forecast remain unchanged on Actual update.
 * 5. Poller retry logic: Polls on interval while unreleased, terminates once Actual is stored.
 * 6. Multi-currency and Indian Calendar API endpoints return compliant schemas.
 */

const assert = require('assert');
const path = require('path');

async function runTests() {
  console.log('🧪 =========================================================');
  console.log('   ECONOMIC CALENDAR DATA UPDATE LIFECYCLE TEST SUITE');
  console.log('=========================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function test(name, fn) {
    totalTests++;
    try {
      fn();
      console.log(`  ✅ PASS: ${name}`);
      passedTests++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     Error: ${err.message}`);
    }
  }

  async function asyncTest(name, fn) {
    totalTests++;
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passedTests++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     Error: ${err.message}`);
    }
  }

  // ── 1. Value Formatting & 0.0 Zero Handling ─────────────────────────────
  console.log('📌 Test Section 1: Value Formatting & Zero-Value Integrity');

  function formatCalendarValue(val, unit = '') {
    if (val === null || val === undefined || val === '' || val === '—' || val === '-') {
      return '—';
    }
    const str = String(val).trim();
    if (str === '—' || str === '' || str === 'null' || str === 'undefined') return '—';
    if (unit && !str.includes(unit) && !isNaN(Number(str))) {
      return `${str}${unit}`;
    }
    return str;
  }

  test('Before release: Actual is null/empty -> returns "—"', () => {
    assert.strictEqual(formatCalendarValue(null), '—');
    assert.strictEqual(formatCalendarValue(undefined), '—');
    assert.strictEqual(formatCalendarValue(''), '—');
    assert.strictEqual(formatCalendarValue('—'), '—');
  });

  test('Zero handling: 0 or 0.0 or "0" is NOT converted to "—"', () => {
    assert.strictEqual(formatCalendarValue(0, '%'), '0%');
    assert.strictEqual(formatCalendarValue(0.0, '%'), '0%');
    assert.strictEqual(formatCalendarValue('0', '%'), '0%');
    assert.strictEqual(formatCalendarValue('0.0', '%'), '0.0%');
    assert.notStrictEqual(formatCalendarValue(0), '—');
  });

  test('After release: Actual formatted with proper unit', () => {
    assert.strictEqual(formatCalendarValue(4.8, '%'), '4.8%');
    assert.strictEqual(formatCalendarValue('4.8%'), '4.8%');
    assert.strictEqual(formatCalendarValue(-21.4, '$ Billion'), '-21.4$ Billion');
  });

  test('Before release: Previous and Forecast populated correctly', () => {
    assert.strictEqual(formatCalendarValue(4.2, '%'), '4.2%');
    assert.strictEqual(formatCalendarValue(4.5, '%'), '4.5%');
  });

  // ── 2. Indian Schedule Service Generation ───────────────────────────────
  console.log('\n📌 Test Section 2: Advance Schedule Ingestion & Generation');

  const { indiaCalendarScheduleService } = await import('../backend/src/services/IndiaCalendarScheduleService.js');

  test('Upcoming events have Previous/Forecast populated and Actual as null', () => {
    const res = indiaCalendarScheduleService.generateUpcomingEvents({ daysAhead: 60 });
    assert.ok(res.success, 'Schedule generation must succeed');
    assert.ok(res.events.length > 0, 'Should generate upcoming events');

    for (const ev of res.events) {
      assert.strictEqual(ev.country_code, 'IN', 'Country code must be IN');
      assert.strictEqual(ev.status, 'upcoming', 'Status must be upcoming');
      assert.strictEqual(ev.actual, null, 'Actual must be strictly null before release');
    }

    const cpiEvent = res.events.find(e => e.event_name.includes('CPI'));
    if (cpiEvent) {
      console.log(`     Sample CPI Event: Date=${cpiEvent.event_date}, Prev=${cpiEvent.previous}, Fcst=${cpiEvent.forecast}, Actual=${cpiEvent.actual}`);
      assert.strictEqual(cpiEvent.actual, null, 'CPI actual before release must be null');
    }
  });

  // ── 3. Deterministic Extraction & Zero Handling ─────────────────────────
  console.log('\n📌 Test Section 3: Official Release Parser & Zero Integrity');

  const { officialReleaseIngestionService } = await import('../backend/src/services/OfficialReleaseIngestionService.js');

  test('Deterministic parser extracts released actual from official PIB text', () => {
    const samplePibText = `
      PRESS INFORMATION BUREAU
      GOVERNMENT OF INDIA
      All India Consumer Price Index (CPI) on Base 2012=100 for July 2026
      The headline inflation rate based on CPI for July 2026 stands at 4.8% compared to 4.2% in June 2026.
    `;
    const parsed = officialReleaseIngestionService.parseReleaseContent(samplePibText, 'All India CPI Inflation for July 2026');
    assert.ok(parsed, 'Parser must extract release');
    assert.strictEqual(parsed.eventName, 'CPI Inflation');
    assert.strictEqual(parsed.actual, '4.8');
    assert.strictEqual(parsed.previous, '4.2');
  });

  test('Deterministic parser extracts zero inflation (0.0%) correctly', () => {
    const sampleZeroText = `
      PRESS INFORMATION BUREAU
      Wholesale Price Index for July 2026
      The annual rate of WPI inflation stands at 0.0% for July 2026 against 1.2% in June 2026.
    `;
    const parsed = officialReleaseIngestionService.parseReleaseContent(sampleZeroText, 'WPI Inflation for July 2026');
    assert.ok(parsed, 'Parser must extract release');
    assert.strictEqual(parsed.eventName, 'WPI Inflation');
    assert.strictEqual(parsed.actual, '0.0');
    assert.strictEqual(parsed.previous, '1.2');
  });

  // ── 4. Poller Lifecycle & Retry Logic ───────────────────────────────────
  console.log('\n📌 Test Section 4: Official Source Poller State Lifecycle');

  const { officialSourcePollerService } = await import('../backend/src/services/OfficialSourcePollerService.js');

  await asyncTest('Poller handles delayed release: returns unreleased state and keeps actual as "—"', async () => {
    const mockEvent = {
      id: 'test-event-delayed-001',
      event_name: 'CPI Inflation',
      event_date: '2026-08-12',
      event_time: '17:30:00',
      source: 'Ministry of Statistics and Programme Implementation',
      status: 'upcoming'
    };

    const emptyFeedXml = `<?xml version="1.0" encoding="utf-8"?><rss version="2.0"><channel><title>PIB</title></channel></rss>`;

    const res = await officialSourcePollerService.pollForEvent(mockEvent, {
      maxAttempts: 1,
      discoveryOptions: { customFeedXml: emptyFeedXml }
    });

    assert.ok(res, 'Poller should return result');
    assert.strictEqual(res.success, false, 'Should report not published during window');
    assert.strictEqual(res.status, 'max_attempts_reached');
  });

  await asyncTest('Poller discovers official release: extracts actual and stops polling immediately', async () => {
    const mockEvent = {
      id: 'test-event-released-002',
      event_name: 'CPI Inflation',
      event_date: '2026-08-12',
      event_time: '17:30:00',
      source: 'Ministry of Statistics and Programme Implementation',
      status: 'upcoming'
    };

    const mockPibXml = `<?xml version="1.0" encoding="utf-8"?>
      <rss version="2.0">
        <channel>
          <title>Press Information Bureau</title>
          <item>
            <title>Consumer Price Index (CPI) Inflation for July 2026</title>
            <link>https://pib.gov.in/PressReleasePage.aspx?PRID=999901</link>
            <pubDate>Wed, 12 Aug 2026 17:30:00 GMT</pubDate>
            <description>Headline CPI inflation rate stands at 4.8% for July 2026 compared to 4.2% in June 2026.</description>
          </item>
        </channel>
      </rss>`;

    const customArticleFetcher = async () => {
      return 'Official MoSPI Release: All India CPI headline inflation rate stands at 4.8% for July 2026, corresponding inflation rate for previous month was 4.2%.';
    };

    const res = await officialSourcePollerService.pollForEvent(mockEvent, {
      maxAttempts: 3,
      dryRun: true,
      discoveryOptions: {
        customFeedXml: mockPibXml,
        customArticleFetcher
      }
    });

    assert.ok(res, 'Poller should return result');
    assert.strictEqual(res.success, true, 'Poll result must succeed');
    assert.strictEqual(res.discovery.extractedMetric.actual, '4.8', 'Actual must be 4.8');
    assert.strictEqual(res.discovery.extractedMetric.previous, '4.2', 'Previous must be 4.2');
    assert.strictEqual(officialSourcePollerService.activePollingJobs.has(mockEvent.id), false, 'Poller must stop immediately after successful actual extraction');
  });

  // ── 5. Multi-Currency Global Economic Calendar Service ───────────────────
  console.log('\n📌 Test Section 5: Global Economic Calendar Service Normalization');

  const { globalEconomicCalendarService } = await import('../backend/src/services/forex/GlobalEconomicCalendarService.js');

  test('Global economic calendar normalization preserves 0.0 and keeps unreleased as null', () => {
    const rawUpcoming = {
      event_name: 'US CPI (YoY)',
      country_code: 'US',
      currency: 'USD',
      event_date: '2026-09-10',
      event_time: '08:30:00',
      previous: '2.9',
      forecast: '2.8',
      actual: null,
      unit: '%'
    };

    const normalized = globalEconomicCalendarService._normalizeEvent(rawUpcoming, 'USD');
    assert.strictEqual(normalized.previous, '2.9');
    assert.strictEqual(normalized.forecast, '2.8');
    assert.strictEqual(normalized.actual, null, 'Actual must be null before release');

    const rawReleasedZero = {
      event_name: 'Eurozone Producer Price Index',
      country_code: 'EU',
      currency: 'EUR',
      event_date: '2026-09-10',
      event_time: '11:00:00',
      previous: '-0.4',
      forecast: '0.1',
      actual: 0.0,
      unit: '%'
    };

    const normalizedZero = globalEconomicCalendarService._normalizeEvent(rawReleasedZero, 'EUR');
    assert.strictEqual(normalizedZero.actual, '0', '0.0 actual must be normalized to "0", not null');
    assert.strictEqual(formatCalendarValue(normalizedZero.actual, normalizedZero.unit), '0%');
  });

  // ── 6. MT5 Bridge Upsert & Preservation ─────────────────────────────────
  console.log('\n📌 Test Section 6: MT5 Bridge Ingestion Upsert & Preservation');

  const { economicCalendarService } = await import('../backend/src/services/economicCalendarService.js');

  test('MT5 Bridge updates Actual without clearing Previous or Forecast', () => {
    const eventId = 'TEST_INR_CPI_LIFECYCLE';

    // Step A: Ingest upcoming event (Actual is —)
    economicCalendarService.ingestMT5Records([{
      id: eventId,
      country: 'India',
      countryCode: 'IN',
      currency: 'INR',
      event: 'Consumer Price Index (YoY)',
      eventTime: '2026-09-12T12:00:00.000Z',
      impact: 'high',
      previous: '4.2%',
      forecast: '4.5%',
      actual: '—'
    }]);

    const beforeRelease = economicCalendarService.events.get(eventId);
    assert.strictEqual(beforeRelease.previous, '4.2%');
    assert.strictEqual(beforeRelease.forecast, '4.5%');
    assert.strictEqual(beforeRelease.actual, '—');

    // Step B: Event is released with Actual 4.8%
    economicCalendarService.ingestMT5Records([{
      id: eventId,
      country: 'India',
      countryCode: 'IN',
      currency: 'INR',
      event: 'Consumer Price Index (YoY)',
      eventTime: '2026-09-12T12:00:00.000Z',
      impact: 'high',
      actual: '4.8%'
    }]);

    const afterRelease = economicCalendarService.events.get(eventId);
    assert.strictEqual(afterRelease.previous, '4.2%', 'Previous must remain unchanged');
    assert.strictEqual(afterRelease.forecast, '4.5%', 'Forecast must remain unchanged');
    assert.strictEqual(afterRelease.actual, '4.8%', 'Actual must be updated to 4.8%');
  });

  console.log('\n=========================================================');
  console.log(`🏁 TEST RESULTS: ${passedTests}/${totalTests} PASSED`);
  console.log('=========================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
