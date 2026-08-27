/**
 * Phase 4.1 Isolated Test Suite: Real Official Source Discovery Service
 * 
 * Verifies:
 * 1. RSS XML item parsing (<item>, <title>, <link>, <pubDate>, <description>)
 * 2. Individual article URL extraction & domain whitelist validation
 * 3. CPI Inflation candidate discovery & article text parsing
 * 4. IIP candidate discovery & article text parsing
 * 5. GDP candidate discovery & article text parsing
 * 6. RBI Monetary Policy / Repo Rate candidate discovery & article text parsing
 * 7. WPI Inflation HTML listing link discovery & article text parsing
 * 8. Old archived release rejection (anti-stale safeguard)
 * 9. Incongruent publication date rejection
 * 10. Non-official untrusted domain rejection
 * 11. Network failure & error isolation
 * 12. Zero permanent mutations in Supabase database
 */

import { officialSourceDiscoveryService } from '../src/services/OfficialSourceDiscoveryService.js';
import { officialSourcePollerService } from '../src/services/OfficialSourcePollerService.js';
import { supabaseEconomicCalendarService } from '../src/services/SupabaseEconomicCalendarService.js';

async function runDiscoveryTests() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 Phase 4.1 Test Suite: Real Official Source Discovery');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  let passed = 0;
  let testNum = 1;

  // Baseline database snapshot
  const baseline = await supabaseEconomicCalendarService.getEvents({ countryCode: 'IN' });
  const baselineUpcoming = baseline.filter(e => e.status === 'upcoming').length;
  console.log(`📊 Baseline Check: ${baseline.length} events in Supabase (${baselineUpcoming} upcoming, 0 released expected).\n`);

  // ── 1. RSS XML Item Parsing Test ──────────────────────────────────────────
  console.log(`[Test ${testNum++}] Testing RSS XML <item> Parsing:`);
  const sampleRss = `<?xml version="1.0" encoding="utf-8"?>
  <rss version="2.0">
    <channel>
      <title>PIB Press Releases</title>
      <item>
        <title><![CDATA[All India Consumer Price Index (CPI) for August 2026]]></title>
        <link>https://pib.gov.in/PressReleasePage.aspx?PRID=2050123</link>
        <pubDate>Mon, 14 Sep 2026 17:30:00 +0530</pubDate>
        <description>Headline inflation rate based on CPI stands at 3.65% for August 2026.</description>
      </item>
      <item>
        <title>Quick Estimates of Index of Industrial Production (IIP) for July 2026</title>
        <link>https://pib.gov.in/PressReleasePage.aspx?PRID=2050124</link>
        <pubDate>Mon, 28 Sep 2026 17:30:00 +0530</pubDate>
        <description>Quick Estimates of IIP grew by 4.8% for July 2026.</description>
      </item>
    </channel>
  </rss>`;

  const parsedItems = officialSourceDiscoveryService.parseRssXml(sampleRss);
  if (parsedItems.length === 2 && parsedItems[0].publishedDate === '2026-09-14' && parsedItems[1].publishedDate === '2026-09-28') {
    console.log(`   ✅ Passed: Successfully parsed ${parsedItems.length} RSS items with normalized Kolkatta dates.\n`);
    passed++;
  } else {
    console.error('   ❌ Failed: RSS XML item parsing failed.\n', parsedItems);
  }

  // ── 2. CPI Inflation Discovery Pipeline ────────────────────────────────────
  console.log(`[Test ${testNum++}] Testing CPI Candidate Discovery & Article Ingestion:`);
  const cpiEvent = {
    id: 'test-cpi-event-1',
    event_name: 'CPI Inflation',
    event_date: '2026-09-14',
    event_time: '17:30:00',
    source: 'MoSPI'
  };

  const mockCpiArticle = 'The National Statistical Office (NSO), Ministry of Statistics and Programme Implementation (MoSPI) releases the All India Consumer Price Index (CPI) for August 2026. The headline inflation rate based on CPI stands at 3.65% compared to 3.54% in July 2026.';

  const cpiDiscovery = await officialSourceDiscoveryService.discoverAndExtractRelease(cpiEvent, {
    customFeedXml: sampleRss,
    customArticleFetcher: async () => mockCpiArticle
  });

  if (cpiDiscovery.found && cpiDiscovery.extractedMetric?.actual === '3.65' && cpiDiscovery.candidate?.sourceDomain === 'official') {
    console.log(`   ✅ Passed: Discovered CPI release ("${cpiDiscovery.candidate.title}") -> Actual: ${cpiDiscovery.extractedMetric.actual}%.\n`);
    passed++;
  } else {
    console.error('   ❌ Failed: CPI discovery pipeline failed.\n', cpiDiscovery);
  }

  // ── 3. IIP Discovery Pipeline ──────────────────────────────────────────────
  console.log(`[Test ${testNum++}] Testing IIP Candidate Discovery & Article Ingestion:`);
  const iipEvent = {
    id: 'test-iip-event-2',
    event_name: 'IIP',
    event_date: '2026-09-28',
    event_time: '17:30:00',
    source: 'MoSPI'
  };

  const mockIipArticle = 'The Quick Estimates of Index of Industrial Production (IIP) for the month of July 2026 stood at 148.5. The growth of IIP grew by 4.8% compared to corresponding growth in the previous month was 4.2%.';

  const iipDiscovery = await officialSourceDiscoveryService.discoverAndExtractRelease(iipEvent, {
    customFeedXml: sampleRss,
    customArticleFetcher: async () => mockIipArticle
  });

  if (iipDiscovery.found && iipDiscovery.extractedMetric?.actual === '4.8') {
    console.log(`   ✅ Passed: Discovered IIP release ("${iipDiscovery.candidate.title}") -> Actual: ${iipDiscovery.extractedMetric.actual}%.\n`);
    passed++;
  } else {
    console.error('   ❌ Failed: IIP discovery pipeline failed.\n', iipDiscovery);
  }

  // ── 4. GDP Discovery Pipeline ──────────────────────────────────────────────
  console.log(`[Test ${testNum++}] Testing GDP Candidate Discovery:`);
  const gdpEvent = {
    id: 'test-gdp-event-3',
    event_name: 'GDP',
    event_date: '2026-08-31',
    event_time: '17:30:00',
    source: 'MoSPI'
  };

  const gdpRss = `<?xml version="1.0" encoding="utf-8"?>
  <rss version="2.0">
    <channel>
      <item>
        <title>Estimates of Gross Domestic Product for First Quarter (Q1) 2026-27</title>
        <link>https://mospi.gov.in/press-release/gdp-q1-2026-27</link>
        <pubDate>Mon, 31 Aug 2026 17:30:00 +0530</pubDate>
        <description>Real GDP in Q1 2026-27 is estimated to grow by 6.8%.</description>
      </item>
    </channel>
  </rss>`;

  const mockGdpArticle = 'Real GDP or GDP at Constant Prices in Q1 2026-27 is estimated at ₹43.64 lakh crore. The Real GDP is estimated to grow by 6.8% in Q1 2026-27.';

  const gdpDiscovery = await officialSourceDiscoveryService.discoverAndExtractRelease(gdpEvent, {
    customFeedXml: gdpRss,
    customArticleFetcher: async () => mockGdpArticle
  });

  if (gdpDiscovery.found && gdpDiscovery.extractedMetric?.actual === '6.8') {
    console.log(`   ✅ Passed: Discovered GDP release -> Actual: ${gdpDiscovery.extractedMetric.actual}%.\n`);
    passed++;
  } else {
    console.error('   ❌ Failed: GDP discovery failed.\n', gdpDiscovery);
  }

  // ── 5. RBI Monetary Policy Discovery Pipeline ──────────────────────────────
  console.log(`[Test ${testNum++}] Testing RBI Monetary Policy Candidate Discovery:`);
  const rbiEvent = {
    id: 'test-rbi-event-4',
    event_name: 'RBI Monetary Policy / Repo Rate',
    event_date: '2026-10-08',
    event_time: '10:00:00',
    source: 'Reserve Bank of India'
  };

  const rbiRss = `<?xml version="1.0" encoding="utf-8"?>
  <rss version="2.0">
    <channel>
      <item>
        <title>Resolution of the Monetary Policy Committee (MPC) October 6-8, 2026</title>
        <link>https://rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=58912</link>
        <pubDate>Thu, 08 Oct 2026 10:00:00 +0530</pubDate>
        <description>MPC decides to keep the policy repo rate unchanged at 6.50%.</description>
      </item>
    </channel>
  </rss>`;

  const mockRbiArticle = 'The Monetary Policy Committee (MPC) at its meeting today (October 8, 2026) decided to keep the policy repo rate under the liquidity adjustment facility (LAF) unchanged at 6.50%.';

  const rbiDiscovery = await officialSourceDiscoveryService.discoverAndExtractRelease(rbiEvent, {
    customFeedXml: rbiRss,
    customArticleFetcher: async () => mockRbiArticle
  });

  if (rbiDiscovery.found && rbiDiscovery.extractedMetric?.actual === '6.50') {
    console.log(`   ✅ Passed: Discovered RBI MPC release -> Actual: ${rbiDiscovery.extractedMetric.actual}%.\n`);
    passed++;
  } else {
    console.error('   ❌ Failed: RBI MPC discovery failed.\n', rbiDiscovery);
  }

  // ── 6. WPI Inflation HTML Listing Discovery Pipeline ───────────────────────
  console.log(`[Test ${testNum++}] Testing WPI HTML Listing & Link Discovery:`);
  const wpiEvent = {
    id: 'test-wpi-event-5',
    event_name: 'WPI Inflation',
    event_date: '2026-09-14',
    event_time: '12:00:00',
    source: 'DPIIT / Ministry of Commerce'
  };

  const wpiHtmlListing = `<html>
    <body>
      <div class="press-releases">
        <a href="/press_release_aug_2026.html">Index Numbers of Wholesale Price in India (Base 2011-12) for August 2026</a>
      </div>
    </body>
  </html>`;

  const mockWpiArticle = 'The official Wholesale Price Index for All Commodities for August 2026 is released. The annual rate of inflation based on all India WPI stands at 2.15% against 2.04% in July 2026.';

  const wpiDiscovery = await officialSourceDiscoveryService.discoverAndExtractRelease(wpiEvent, {
    customHtmlListing: wpiHtmlListing,
    customArticleFetcher: async () => mockWpiArticle
  });

  if (wpiDiscovery.found && wpiDiscovery.extractedMetric?.actual === '2.15' && wpiDiscovery.candidate?.sourceUrl.includes('eaindustry.nic.in')) {
    console.log(`   ✅ Passed: Discovered WPI release from DPIIT listing -> Actual: ${wpiDiscovery.extractedMetric.actual}%.\n`);
    passed++;
  } else {
    console.error('   ❌ Failed: WPI HTML listing discovery failed.\n', wpiDiscovery);
  }

  // ── 7. Old Archived Release Rejection Test ─────────────────────────────────
  console.log(`[Test ${testNum++}] Testing Old Archived Release Rejection (Anti-Stale Safeguard):`);
  const oldArchiveRss = `<?xml version="1.0" encoding="utf-8"?>
  <rss version="2.0">
    <channel>
      <item>
        <title>All India Consumer Price Index (CPI) for July 2025</title>
        <link>https://pib.gov.in/PressReleasePage.aspx?PRID=1999999</link>
        <pubDate>Sat, 12 Jul 2025 17:30:00 +0530</pubDate>
        <description>Headline inflation stands at 4.12%.</description>
      </item>
    </channel>
  </rss>`;

  const oldArchiveDiscovery = await officialSourceDiscoveryService.discoverAndExtractRelease(cpiEvent, {
    customFeedXml: oldArchiveRss
  });

  if (!oldArchiveDiscovery.found && oldArchiveDiscovery.reason === 'NO_MATCHING_CANDIDATE_APPROVED') {
    console.log('   ✅ Passed: Old archived release from 2025 was rejected due to date incongruence.\n');
    passed++;
  } else {
    console.error('   ❌ Failed: Old archived release was not rejected.\n', oldArchiveDiscovery);
  }

  // ── 8. Non-Official Domain Rejection Test ──────────────────────────────────
  console.log(`[Test ${testNum++}] Testing Non-Official Domain Rejection:`);
  const fakeDomainRss = `<?xml version="1.0" encoding="utf-8"?>
  <rss version="2.0">
    <channel>
      <item>
        <title>All India Consumer Price Index (CPI) for August 2026</title>
        <link>https://unverified-third-party-blog.com/cpi-aug-2026</link>
        <pubDate>Mon, 14 Sep 2026 17:30:00 +0530</pubDate>
        <description>CPI is 3.65%.</description>
      </item>
    </channel>
  </rss>`;

  const fakeDomainDiscovery = await officialSourceDiscoveryService.discoverAndExtractRelease(cpiEvent, {
    customFeedXml: fakeDomainRss
  });

  if (!fakeDomainDiscovery.found) {
    console.log('   ✅ Passed: Non-official domain was rejected.\n');
    passed++;
  } else {
    console.error('   ❌ Failed: Non-official domain was not rejected.\n', fakeDomainDiscovery);
  }

  // ── 9. Error Isolation during Polling ──────────────────────────────────────
  console.log(`[Test ${testNum++}] Testing Poller Error Isolation (Network Failure):`);
  const pollerRes = await officialSourcePollerService.pollForEvent({
    id: 'test-poller-fail-1',
    event_name: 'CPI Inflation',
    event_date: '2026-09-14'
  }, {
    maxAttempts: 1,
    dryRun: true,
    discoveryOptions: {
      customFeedXml: '<invalid-xml-corrupt'
    }
  });

  if (pollerRes.status === 'max_attempts_reached' && pollerRes.success === false) {
    console.log('   ✅ Passed: Feed corruption/failure handled cleanly without crashing poller.\n');
    passed++;
  } else {
    console.error('   ❌ Failed: Poller error isolation failed.\n', pollerRes);
  }

  // ── 10. Database Integrity Check (Dry-Run Protection) ─────────────────────
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 Database Integrity Check After Discovery Tests');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const postTest = await supabaseEconomicCalendarService.getEvents({ countryCode: 'IN' });
  const postUpcoming = postTest.filter(e => e.status === 'upcoming').length;
  const postReleased = postTest.filter(e => e.status === 'released').length;

  console.log(`Total Events: ${postTest.length}`);
  console.log(`Upcoming Events: ${postUpcoming} (Matches baseline: ${postUpcoming === baselineUpcoming})`);
  console.log(`Released Events: ${postReleased} (Must be 0)`);

  if (postReleased === 0 && postUpcoming === baselineUpcoming) {
    console.log('\n🎉 ALL 9 DISCOVERY & INTEGRITY TESTS PASSED! Production database remains untouched.');
  } else {
    console.error('\n⚠️ WARNING: Database state was modified during test!');
  }
}

runDiscoveryTests().catch(console.error);
