/**
 * Automated Verification: Live Forex Economic Calendar Endpoint
 * Tests GET /api/market/economic-calendar/global across periods and all major currencies.
 */

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

const OFFICIAL_SOVEREIGN_DOMAINS = [
  'bls.gov',
  'bea.gov',
  'federalreserve.gov',
  'ecb.europa.eu',
  'bankofengland.co.uk',
  'boj.or.jp',
  'rba.gov.au',
  'bankofcanada.ca',
  'snb.ch',
  'pbc.gov.cn',
  'rbnz.govt.nz',
  'mospi.gov.in',
  'rbi.org.in',
  'eaindustry.nic.in',
  'cga.nic.in',
  'pib.gov.in',
  'bis.org'
];

async function runForexTests() {
  console.log('========================================================================');
  console.log('🧪 VERIFYING LIVE FOREX ECONOMIC CALENDAR SOVEREIGN BACKEND ENDPOINT');
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

  // 1. Test All Periods
  const periods = ['today', 'tomorrow', 'week', 'all'];

  for (const period of periods) {
    console.log(`\n📌 Testing period="${period}"`);
    try {
      const res = await fetch(`${BASE_URL}/api/market/economic-calendar/global?period=${period}`);
      assert(res.status === 200, `HTTP status 200 for period="${period}"`, `Got ${res.status}`);

      const data = await res.json();
      assert(data.success === true, `Response success is true for period="${period}"`);
      assert(data.dataOrigin === 'Official Sovereign Government & Central Bank Sources', `dataOrigin matches sovereign sources for period="${period}"`);

      // Verify zero third-party mentions
      const raw = JSON.stringify(data);
      assert(!raw.includes('Trading Economics'), `Zero Trading Economics mentions for period="${period}"`);
      assert(!raw.includes('Forex Factory'), `Zero Forex Factory mentions for period="${period}"`);
      assert(!raw.includes('Investing.com'), `Zero Investing.com mentions for period="${period}"`);
      assert(!raw.includes('Financial Modeling Prep'), `Zero FMP mentions for period="${period}"`);

      console.log(`     Total events: ${data.events?.length || 0}`);

      if (Array.isArray(data.events) && data.events.length > 0) {
        let hasAllFields = true;
        let hasOfficialSources = true;

        data.events.forEach((ev, idx) => {
          if (!ev.eventName || !ev.currency || !ev.impact || !ev.source || !ev.sourceUrl || ev.officialSource !== true) {
            hasAllFields = false;
            console.error(`     [Error] Event #${idx} missing fields:`, ev);
          }

          const hasValidDomain = OFFICIAL_SOVEREIGN_DOMAINS.some(d => (ev.sourceUrl || '').includes(d));
          if (!hasValidDomain) {
            hasOfficialSources = false;
            console.error(`     [Warning] Event #${idx} domain not in whitelist: ${ev.sourceUrl}`);
          }
        });

        assert(hasAllFields, `All events have required schema fields (source, sourceName, sourceUrl, officialSource: true) for period="${period}"`);
        assert(hasOfficialSources, `All events carry verified official sovereign source URLs for period="${period}"`);
      }
    } catch (err) {
      console.error(`  ❌ Error on period="${period}":`, err.message);
      failed++;
    }
  }

  // 2. Test Currency Filters
  const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'NZD', 'INR'];

  console.log('\n📌 Testing Individual Currency Filtering');
  for (const curr of currencies) {
    try {
      const res = await fetch(`${BASE_URL}/api/market/economic-calendar/global?currencies=${curr}&limit=10`);
      assert(res.status === 200, `HTTP status 200 for currency=${curr}`);

      const data = await res.json();
      assert(data.success === true, `Response success for currency=${curr}`);

      if (Array.isArray(data.events) && data.events.length > 0) {
        const allMatchCurr = data.events.every(e => e.currency === curr);
        assert(allMatchCurr, `All returned events have currency="${curr}" (${data.events.length} events)`);
      }
    } catch (err) {
      console.error(`  ❌ Error for currency="${curr}":`, err.message);
      failed++;
    }
  }

  console.log('\n========================================================================');
  console.log(`📊 TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('========================================================================');

  if (failed > 0) process.exit(1);
}

runForexTests();
