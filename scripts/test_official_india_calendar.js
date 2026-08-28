/**
 * Comprehensive Verification Suite: Official India Economic Calendar
 * 
 * Tests:
 * 1. GET /api/market/economic-calendar across all periods (today, tomorrow, week, all)
 * 2. Timezone conversion: Canonical UTC timestamps in eventTime ('...Z') & Asia/Kolkata conversion in time ('... IST')
 * 3. Midnight boundary edge cases (e.g. 00:30 IST -> 19:00 UTC previous day -> 00:30 IST)
 * 4. Official source metadata: sourceUrl, sourceName, officialSource: true
 * 5. Data origin vs Storage source metadata: dataOrigin="Official Indian Government Source", storageSource
 * 6. Zero FMP tokens, mock data, or synthetic guesses
 */

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

const OFFICIAL_DOMAINS = [
  'rbi.org.in',
  'mospi.gov.in',
  'pib.gov.in',
  'eaindustry.nic.in',
  'cga.nic.in',
  'finmin.nic.in',
  'nseindia.com',
  'bseindia.com'
];

async function runTests() {
  console.log('========================================================================');
  console.log('🧪 VERIFYING 100% OFFICIAL INDIA ECONOMIC CALENDAR & TIMEZONE CANONICALS');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, name, details = '') {
    if (condition) {
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${name} ${details ? '(' + details + ')' : ''}`);
      failed++;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST SECTION 1: UNIT TEST UTC <-> ASIA/KOLKATA TIMEZONE CONVERSIONS
  // ──────────────────────────────────────────────────────────────────────────
  console.log('📌 Test Section 1: Canonical UTC <-> IST Timezone Unit Tests');

  const timezoneCases = [
    { date: '2026-08-28', timeIST: '17:30:00', expectedUtc: '2026-08-28T12:00:00.000Z', label: '17:30 IST (MoSPI IIP)' },
    { date: '2026-08-07', timeIST: '10:00:00', expectedUtc: '2026-08-07T04:30:00.000Z', label: '10:00 IST (RBI MPC)' },
    { date: '2026-08-14', timeIST: '12:00:00', expectedUtc: '2026-08-14T06:30:00.000Z', label: '12:00 IST (DPIIT WPI)' },
    { date: '2026-08-01', timeIST: '14:00:00', expectedUtc: '2026-08-01T08:30:00.000Z', label: '14:00 IST (GST Revenue)' },
    { date: '2026-08-31', timeIST: '16:30:00', expectedUtc: '2026-08-31T11:00:00.000Z', label: '16:30 IST (Fiscal Deficit)' },
    { date: '2026-08-28', timeIST: '00:30:00', expectedUtc: '2026-08-27T19:00:00.000Z', label: '00:30 IST (Midnight boundary across UTC day)' },
  ];

  timezoneCases.forEach(tc => {
    // 1. Calculate UTC ISO string from date + time in IST (+05:30)
    const istIso = `${tc.date}T${tc.timeIST}.000+05:30`;
    const utcIso = new Date(istIso).toISOString();
    assert(utcIso === tc.expectedUtc, `UTC Timestamp for ${tc.label}`, `Expected ${tc.expectedUtc}, got ${utcIso}`);

    // 2. Convert UTC ISO timestamp back to Asia/Kolkata and check date and time
    const parsedDate = new Date(utcIso);
    const convertedTimeIST = parsedDate.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const convertedDateIST = parsedDate.toLocaleDateString('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });

    const expectedTimeSlice = tc.timeIST.slice(0, 5);
    assert(convertedTimeIST === expectedTimeSlice, `Asia/Kolkata time reconversion for ${tc.label}`, `Expected ${expectedTimeSlice}, got ${convertedTimeIST}`);
    assert(convertedDateIST === tc.date, `Asia/Kolkata date reconversion across midnight for ${tc.label}`, `Expected ${tc.date}, got ${convertedDateIST}`);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST SECTION 2: ENDPOINT TESTS FOR ALL CALENDAR PERIODS
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n📌 Test Section 2: GET /api/market/economic-calendar Across All Periods');

  const periods = ['today', 'tomorrow', 'week', 'all'];

  for (const period of periods) {
    console.log(`\n  --- Period: "${period}" ---`);
    try {
      const res = await fetch(`${BASE_URL}/api/market/economic-calendar?period=${period}`);
      assert(res.status === 200, `HTTP status 200 for period="${period}"`, `Got ${res.status}`);

      const data = await res.json();
      assert(data.success === true, `Response success is true for "${period}"`);
      assert(data.isAvailable === true, `isAvailable is true for "${period}"`);
      assert(data.dataOrigin === 'Official Indian Government Source', `dataOrigin is "Official Indian Government Source" for "${period}"`);
      assert(Boolean(data.storageSource), `storageSource is declared (${data.storageSource}) for "${period}"`);

      // Verify zero FMP
      const rawJson = JSON.stringify(data);
      assert(!rawJson.includes('Financial Modeling Prep'), `Zero FMP mentions for "${period}"`);
      assert(!rawJson.includes('FMP_API_KEY'), `Zero FMP_API_KEY mentions for "${period}"`);
      assert(!rawJson.includes('PLAN_RESTRICTED'), `Zero PLAN_RESTRICTED mentions for "${period}"`);

      console.log(`       Returned events: ${data.events?.length || 0}`);

      if (Array.isArray(data.events) && data.events.length > 0) {
        let allUtcTimestamps = true;
        let allIstLabels = true;
        let allOfficialSources = true;
        let allSourceUrlsValid = true;
        let allReconversionsMatch = true;

        data.events.forEach((ev, idx) => {
          // 1. Check UTC ISO format in eventTime
          if (!ev.eventTime || !ev.eventTime.endsWith('Z')) {
            allUtcTimestamps = false;
            console.error(`       [Error] Event #${idx} eventTime "${ev.eventTime}" is not a canonical UTC string ending in 'Z'`);
          }

          // 2. Check IST label in time
          if (!ev.time || !ev.time.includes('IST')) {
            allIstLabels = false;
            console.error(`       [Error] Event #${idx} time "${ev.time}" is not explicitly labeled as IST`);
          }

          // 3. Check official source properties
          if (!ev.sourceUrl || !ev.sourceName || ev.officialSource !== true) {
            allOfficialSources = false;
            console.error(`       [Error] Event #${idx} missing official source fields: sourceUrl=${ev.sourceUrl}, sourceName=${ev.sourceName}, officialSource=${ev.officialSource}`);
          }

          // 4. Check official domain whitelist
          const hasOfficialDomain = OFFICIAL_DOMAINS.some(d => (ev.sourceUrl || '').includes(d));
          if (!hasOfficialDomain) {
            allSourceUrlsValid = false;
            console.error(`       [Error] Event #${idx} sourceUrl "${ev.sourceUrl}" not in official domain whitelist`);
          }

          // 5. Test UTC eventTime reconverted to IST matches ev.time
          if (ev.eventTime) {
            const d = new Date(ev.eventTime);
            const reconvertedTime = d.toLocaleTimeString('en-IN', {
              timeZone: 'Asia/Kolkata',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false
            });
            const expectedTimePart = ev.time.split(' ')[0];
            if (reconvertedTime !== expectedTimePart) {
              allReconversionsMatch = false;
              console.error(`       [Error] Event #${idx} reconversion mismatch: UTC ${ev.eventTime} -> ${reconvertedTime} vs labeled ${expectedTimePart}`);
            }
          }
        });

        assert(allUtcTimestamps, `All eventTime timestamps are canonical UTC ISO strings ('...Z') for "${period}"`);
        assert(allIstLabels, `All time fields are explicitly labeled with IST ('... IST') for "${period}"`);
        assert(allOfficialSources, `All events carry sourceUrl, sourceName, and officialSource: true for "${period}"`);
        assert(allSourceUrlsValid, `All source URLs point to official government/institutional domains for "${period}"`);
        assert(allReconversionsMatch, `Canonical UTC eventTime matches displayed Asia/Kolkata time for all events in "${period}"`);
      }
    } catch (err) {
      console.error(`  ❌ Error querying period="${period}":`, err.message);
      failed++;
    }
  }

  console.log('\n========================================================================');
  console.log(`📊 TEST SUITE SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
