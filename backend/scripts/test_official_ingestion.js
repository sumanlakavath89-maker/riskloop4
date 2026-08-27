/**
 * Verification Test Script for Phase 3: OfficialReleaseIngestionService
 * Tests deterministic extraction for: CPI, IIP, WPI, GDP, RBI Repo Rate
 * and verifies database updates in Supabase.
 */

import { officialReleaseIngestionService } from '../src/services/OfficialReleaseIngestionService.js';
import { supabaseEconomicCalendarService } from '../src/services/SupabaseEconomicCalendarService.js';

async function runTests() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 RiskLoop Phase 3 Ingestion & Actuals Extraction Tests');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Test 1: CPI Inflation
  console.log('📌 Test 1: CPI Inflation Official Release (MoSPI)');
  const cpiPayload = {
    title: 'All India Consumer Price Index (CPI) on Base 2012=100 for the month of August 2026',
    content: 'The National Statistical Office (NSO), Ministry of Statistics and Programme Implementation (MoSPI) releases the CPI for August 2026. The headline inflation rate based on CPI stands at 3.65% for August 2026 as compared to 3.54% in July 2026.',
    url: 'https://pib.gov.in/PressReleasePage.aspx?PRID=2050123',
    source: 'MoSPI / PIB',
    releaseDate: '2026-09-14'
  };
  const cpiRes = await officialReleaseIngestionService.ingestSingleRelease(cpiPayload);
  console.log('CPI Result:', JSON.stringify(cpiRes, null, 2));

  // Test 2: IIP
  console.log('\n📌 Test 2: Index of Industrial Production (IIP) Release (MoSPI)');
  const iipPayload = {
    title: 'Quick Estimates of Index of Industrial Production (IIP) for the Month of July 2026 (Base 2011-12=100)',
    content: 'The Quick Estimates of Index of Industrial Production (IIP) with base 2011-12 for the month of July 2026 stood at 148.5. The growth of IIP grew by 4.8% compared to corresponding growth in the previous month was 4.2%.',
    url: 'https://pib.gov.in/PressReleasePage.aspx?PRID=2050124',
    source: 'MoSPI / PIB',
    releaseDate: '2026-09-14'
  };
  const iipRes = await officialReleaseIngestionService.ingestSingleRelease(iipPayload);
  console.log('IIP Result:', JSON.stringify(iipRes, null, 2));

  // Test 3: WPI Inflation
  console.log('\n📌 Test 3: Wholesale Price Index (WPI) Release (DPIIT)');
  const wpiPayload = {
    title: 'Index Numbers of Wholesale Price in India for the Month of August, 2026 (Base Year: 2011-12=100)',
    content: 'The official Wholesale Price Index for All Commodities (Base: 2011-12=100) for the month of August, 2026 is released. The annual rate of inflation based on all India WPI stands at 2.15% for the month of August, 2026 against 2.04% in July, 2026.',
    url: 'https://eaindustry.nic.in/press_release_aug_2026.pdf',
    source: 'DPIIT / Ministry of Commerce',
    releaseDate: '2026-09-14'
  };
  const wpiRes = await officialReleaseIngestionService.ingestSingleRelease(wpiPayload);
  console.log('WPI Result:', JSON.stringify(wpiRes, null, 2));

  // Test 4: GDP Growth
  console.log('\n📌 Test 4: Gross Domestic Product (GDP) Q1 FY27 Release (MoSPI)');
  const gdpPayload = {
    title: 'Estimates of Gross Domestic Product for the First Quarter (April-June) of 2026-27',
    content: 'Real GDP or GDP at Constant (2011-12) Prices in Q1 2026-27 is estimated at ₹43.64 lakh crore. The Real GDP is estimated to grow by 6.8% in Q1 2026-27 as compared to growth in previous quarter.',
    url: 'https://mospi.gov.in/press-release/gdp-q1-2026-27',
    source: 'MoSPI / NSO',
    releaseDate: '2026-08-31'
  };
  const gdpRes = await officialReleaseIngestionService.ingestSingleRelease(gdpPayload);
  console.log('GDP Result:', JSON.stringify(gdpRes, null, 2));

  // Test 5: RBI Monetary Policy / Repo Rate
  console.log('\n📌 Test 5: RBI Monetary Policy Committee Resolution (RBI)');
  const rbiPayload = {
    title: 'Monetary Policy Statement, 2026-27: Resolution of the Monetary Policy Committee (MPC) October 6-8, 2026',
    content: 'On the basis of an assessment of the current and evolving macroeconomic situation, the Monetary Policy Committee (MPC) at its meeting today (October 8, 2026) decided to keep the policy repo rate under the liquidity adjustment facility (LAF) unchanged at 6.50%.',
    url: 'https://rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=58912',
    source: 'Reserve Bank of India',
    releaseDate: '2026-10-08'
  };
  const rbiRes = await officialReleaseIngestionService.ingestSingleRelease(rbiPayload);
  console.log('RBI Result:', JSON.stringify(rbiRes, null, 2));

  // Final verification of updated rows in Supabase
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 Verifying Updated Records from Supabase:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const updatedEvents = await supabaseEconomicCalendarService.getEvents({ countryCode: 'IN' });
  const releasedEvents = updatedEvents.filter(e => e.status === 'released');
  console.log(`Total Events in Supabase: ${updatedEvents.length}`);
  console.log(`Released (Updated with Actuals) Events: ${releasedEvents.length}\n`);

  for (const ev of releasedEvents) {
    console.log(`✅ [${ev.status.toUpperCase()}] ${ev.event_name} (${ev.event_date}): Actual = ${ev.actual}${ev.unit || ''}, Prev = ${ev.previous || '—'}, Source = ${ev.source}, URL = ${ev.source_url}`);
  }
}

runTests().catch(console.error);
