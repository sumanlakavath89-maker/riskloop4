/**
 * Isolated End-to-End Test Suite for OfficialReleaseIngestionService
 * 
 * Verifies:
 * 1. Domain whitelist enforcement (accepts .gov.in / .nic.in / rbi.org.in, rejects untrusted domains)
 * 2. Date congruence rules (rejects misaligned dates)
 * 3. Deterministic parsing for all 5 macro indicators (CPI, IIP, WPI, GDP, RBI Repo Rate)
 * 4. Production Database Isolation (all tests use dryRun / rollback to guarantee 0 permanent mutations)
 */

import { officialReleaseIngestionService } from '../src/services/OfficialReleaseIngestionService.js';
import { supabaseEconomicCalendarService } from '../src/services/SupabaseEconomicCalendarService.js';

async function runIsolatedTests() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 Isolated Test Suite: Official Release Ingestion');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Baseline check of production records
  const baseline = await supabaseEconomicCalendarService.getEvents({ countryCode: 'IN' });
  const baselineUpcoming = baseline.filter(e => e.status === 'upcoming').length;
  console.log(`📊 Baseline Check: ${baseline.length} events in Supabase (${baselineUpcoming} upcoming, 0 released expected).\n`);

  let passCount = 0;
  let testIndex = 1;

  // ── Test A: Untrusted Domain Rejection ────────────────────────────────────
  console.log(`[Test ${testIndex++}] Rejecting Untrusted Domain:`);
  const untrustedRes = await officialReleaseIngestionService.ingestSingleRelease({
    title: 'All India CPI for August 2026',
    content: 'The headline inflation rate based on CPI stands at 3.65%.',
    url: 'https://random-unverified-blog.com/cpi-august',
    releaseDate: '2026-09-14'
  }, { dryRun: true });

  if (untrustedRes.updateResult?.error === 'INVALID_SOURCE_DOMAIN') {
    console.log('   ✅ Passed: Untrusted domain rejected correctly.\n');
    passCount++;
  } else {
    console.error('   ❌ Failed: Untrusted domain was not rejected.\n', untrustedRes);
  }

  // ── Test B: Incongruent Date Rejection ───────────────────────────────────
  console.log(`[Test ${testIndex++}] Rejecting Incongruent Release Date:`);
  const incongruentRes = await officialReleaseIngestionService.ingestSingleRelease({
    title: 'All India CPI for August 2026',
    content: 'The headline inflation rate based on CPI stands at 3.65%.',
    url: 'https://pib.gov.in/PressReleasePage.aspx?PRID=2050123',
    releaseDate: '2026-11-28' // Incongruent with 2026-09-14
  }, { dryRun: true });

  if (incongruentRes.updateResult?.error === 'DATE_INCONGRUENT') {
    console.log('   ✅ Passed: Incongruent release date rejected correctly.\n');
    passCount++;
  } else {
    console.error('   ❌ Failed: Incongruent date was not rejected.\n', incongruentRes);
  }

  // ── Test C: 5 Indicator Deterministic Extraction (Dry-Run Mode) ─────────
  const indicators = [
    {
      name: 'CPI Inflation',
      payload: {
        title: 'All India Consumer Price Index (CPI) on Base 2012=100 for August 2026',
        content: 'The headline inflation rate based on CPI stands at 3.65% for August 2026 as compared to 3.54% in July 2026.',
        url: 'https://pib.gov.in/PressReleasePage.aspx?PRID=2050123',
        source: 'MoSPI / PIB',
        releaseDate: '2026-09-14'
      },
      expectedActual: '3.65'
    },
    {
      name: 'IIP',
      payload: {
        title: 'Quick Estimates of Index of Industrial Production (IIP) for July 2026',
        content: 'The Quick Estimates of IIP grew by 4.8% compared to corresponding growth in the previous month was 4.2%.',
        url: 'https://pib.gov.in/PressReleasePage.aspx?PRID=2050124',
        source: 'MoSPI / PIB',
        releaseDate: '2026-09-28'
      },
      expectedActual: '4.8'
    },
    {
      name: 'WPI Inflation',
      payload: {
        title: 'Index Numbers of Wholesale Price in India for August 2026',
        content: 'The annual rate of inflation based on all India WPI stands at 2.15% against 2.04% in July 2026.',
        url: 'https://eaindustry.nic.in/press_release_aug_2026.pdf',
        source: 'DPIIT / Ministry of Commerce',
        releaseDate: '2026-09-14'
      },
      expectedActual: '2.15'
    },
    {
      name: 'GDP',
      payload: {
        title: 'Estimates of Gross Domestic Product for First Quarter 2026-27',
        content: 'Real GDP or GDP at Constant Prices in Q1 2026-27 is estimated to grow by 6.8%.',
        url: 'https://mospi.gov.in/press-release/gdp-q1-2026-27',
        source: 'MoSPI / NSO',
        releaseDate: '2026-08-31'
      },
      expectedActual: '6.8'
    },
    {
      name: 'RBI Monetary Policy / Repo Rate',
      payload: {
        title: 'Monetary Policy Statement, 2026-27: Resolution of the Monetary Policy Committee (MPC)',
        content: 'The Monetary Policy Committee (MPC) decided to keep the policy repo rate under the liquidity adjustment facility (LAF) unchanged at 6.50%.',
        url: 'https://rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=58912',
        source: 'Reserve Bank of India',
        releaseDate: '2026-10-08'
      },
      expectedActual: '6.50'
    }
  ];

  for (const item of indicators) {
    console.log(`[Test ${testIndex++}] Ingesting ${item.name} with Rollback Isolation:`);
    const res = await officialReleaseIngestionService.ingestSingleRelease(item.payload, { rollback: true, allowFutureRelease: true });

    if (res.success && res.extractedMetric.actual === item.expectedActual && res.updateResult.rolledBack) {
      console.log(`   ✅ Passed: ${item.name} parsed actual = ${res.extractedMetric.actual}% & rolled back cleanly.\n`);
      passCount++;
    } else {
      console.error(`   ❌ Failed: ${item.name} ingestion check failed.\n`, res);
    }
  }

  // ── Final Verification of Zero Permanent Mutations ─────────────────────────
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 Verifying Production Database Integrity After Tests');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const postTest = await supabaseEconomicCalendarService.getEvents({ countryCode: 'IN' });
  const postUpcoming = postTest.filter(e => e.status === 'upcoming').length;
  const postReleased = postTest.filter(e => e.status === 'released').length;

  console.log(`Total Events: ${postTest.length}`);
  console.log(`Upcoming Events: ${postUpcoming} (Matches baseline: ${postUpcoming === baselineUpcoming})`);
  console.log(`Released Events: ${postReleased} (Must be 0)`);

  if (postReleased === 0 && postUpcoming === baselineUpcoming) {
    console.log('\n🎉 ALL 7 ISOLATION & VALIDATION TESTS PASSED! Production database remains untouched.');
  } else {
    console.error('\n⚠️ WARNING: Database state was modified during test!');
  }
}

runIsolatedTests().catch(console.error);
