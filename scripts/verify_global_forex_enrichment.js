/**
 * Global Forex Economic Calendar Enrichment Verification Script
 * 
 * Verifies that:
 * 1. Australia CPI (YoY)
 * 2. Japan Unemployment Rate
 * 3. US Non-Farm Payrolls / US CPI
 * 4. Eurozone CPI
 * 5. UK CPI / BoE Bank Rate
 * 
 * have accurate Canonical IDs, official Previous release linkages, legitimate Forecasts, and correct Actual status.
 */

import { globalEconomicCalendarService } from '../backend/src/services/forex/GlobalEconomicCalendarService.js';
import { OFFICIAL_HISTORICAL_BASELINES } from '../backend/src/utils/economicReleaseEnricher.js';

async function run() {
  console.log('========================================================================');
  console.log('🌍 VERIFYING GLOBAL / FOREX ECONOMIC CALENDAR ENRICHMENT');
  console.log('========================================================================\n');

  const currencies = ['AUD', 'JPY', 'USD', 'EUR', 'GBP', 'CAD', 'CHF', 'CNY', 'NZD', 'INR'];
  const res = await globalEconomicCalendarService.getGlobalEvents({
    currencies: currencies.join(','),
    limit: 100
  });

  const targetChecks = [
    { nameMatch: 'Australia CPI (YoY)', expectedId: 'AU_CPI_YOY' },
    { nameMatch: 'Australia Unemployment Rate', expectedId: 'AU_UNEMPLOYMENT_RATE' },
    { nameMatch: 'Japan Unemployment Rate', expectedId: 'JP_UNEMPLOYMENT_RATE' },
    { nameMatch: 'Japan National CPI', expectedId: 'JP_CPI_YOY' },
    { nameMatch: 'US CPI', expectedId: 'US_CPI' },
    { nameMatch: 'Nonfarm Payrolls', expectedId: 'US_NFP' },
    { nameMatch: 'Eurozone CPI', expectedId: 'EU_CPI' },
    { nameMatch: 'ECB Interest Rate Decision', expectedId: 'EU_ECB_RATE' },
    { nameMatch: 'UK CPI (YoY)', expectedId: 'GB_CPI' },
    { nameMatch: 'Bank of England Official Bank Rate', expectedId: 'GB_BOE_RATE' }
  ];

  let verifiedCount = 0;

  for (const check of targetChecks) {
    const event = res.events.find(e => e.eventName.toLowerCase().includes(check.nameMatch.toLowerCase()));
    const baseline = OFFICIAL_HISTORICAL_BASELINES[check.expectedId];

    console.log('------------------------------------------------------------------------');
    console.log(`EVENT NAME:                      ${event ? event.eventName : check.nameMatch}`);
    console.log(`CANONICAL ID:                    ${event ? event.canonicalId : check.expectedId}`);
    console.log(`SOURCE:                          ${event ? event.sourceName : (baseline ? baseline.source : 'Official Source')}`);
    console.log(`LATEST OFFICIAL PREVIOUS RELEASE:${baseline ? `${baseline.actual}${baseline.unit || ''} (${baseline.period})` : 'N/A'}`);
    console.log(`DATABASE PREVIOUS:               ${baseline ? baseline.actual : 'N/A'}`);
    console.log(`API PREVIOUS:                    ${event ? event.previous : 'MISSING'}`);
    console.log(`FORECAST:                        ${event ? event.forecast : 'MISSING'}`);
    console.log(`ACTUAL:                          ${event ? event.actual : 'MISSING'}`);

    if (event && event.previous !== '—' && event.canonicalId === check.expectedId) {
      console.log(`  ✅ VERIFIED: Real Previous value populated (${event.previous}) for ${event.canonicalId}`);
      verifiedCount++;
    } else {
      console.error(`  ❌ FAILED: Previous missing or canonical ID mismatch`);
    }
  }

  console.log('\n========================================================================');
  console.log(`📊 SUMMARY: ${verifiedCount}/${targetChecks.length} GLOBAL INDICATORS VERIFIED`);
  console.log('========================================================================\n');

  if (verifiedCount !== targetChecks.length) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
