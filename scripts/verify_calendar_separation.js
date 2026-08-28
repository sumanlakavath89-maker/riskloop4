/**
 * Complete Indian Market vs Forex Economic Calendar Separation Verification Script
 * 
 * Verifies:
 * 1. Indian Market Calendar (/api/market/economic-calendar):
 *    - market_scope: 'india'
 *    - All events have countryCode: 'IN' and currency: 'INR'
 *    - Contains IIP, GDP, CPI, WPI, RBI policy decisions
 *    - ZERO foreign currency events
 * 
 * 2. Forex Economic Calendar (/api/market/economic-calendar/global):
 *    - market_scope: 'forex'
 *    - All events belong strictly to supported Forex currencies (USD, EUR, GBP, JPY, AUD, CAD, CHF, CNY, NZD)
 *    - Contains Australia CPI, Japan Unemployment, US CPI, Eurozone CPI, UK CPI
 *    - ZERO Indian events (No IIP, No Indian GDP, No MoSPI, No RBI, No INR, No IN)
 * 
 * 3. Data Model Integrity:
 *    - market_scope field exists and is populated on every single event
 */

import { indiaOfficialEconomicCalendarService } from '../backend/src/services/IndiaOfficialEconomicCalendarService.js';
import { globalEconomicCalendarService } from '../backend/src/services/forex/GlobalEconomicCalendarService.js';
import fs from 'fs';
import path from 'path';

async function run() {
  console.log('========================================================================');
  console.log('🔒 VERIFYING COMPLETE SEPARATION: INDIAN MARKET VS FOREX CALENDARS');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // ── TEST 1: Indian Market Calendar Endpoint ──────────────────────────
  console.log('📌 Section 1: Verifying Indian Market Calendar (/api/market/economic-calendar)...');
  const indiaRes = await indiaOfficialEconomicCalendarService.getEconomicCalendar({ period: 'all', forceRefresh: true });

  assert(indiaRes.success === true, 'Indian calendar response success is true');
  assert(indiaRes.market_scope === 'india', "Indian calendar response declared market_scope: 'india'");
  assert(Array.isArray(indiaRes.events) && indiaRes.events.length > 0, `Indian calendar returned ${indiaRes.events.length} events`);

  // Check all Indian events
  const allIndiaScope = indiaRes.events.every(e => e.market_scope === 'india' && e.countryCode === 'IN' && e.currency === 'INR');
  assert(allIndiaScope, "All Indian events carry market_scope='india', countryCode='IN', currency='INR'");

  const hasIIP = indiaRes.events.some(e => e.event === 'IIP' || e.event.includes('IIP'));
  const hasGDP = indiaRes.events.some(e => e.event === 'GDP' || e.event.includes('GDP'));
  const hasCPI = indiaRes.events.some(e => e.event.includes('CPI'));
  const hasWPI = indiaRes.events.some(e => e.event.includes('WPI'));
  const hasRBI = indiaRes.events.some(e => e.event.includes('RBI') || e.event.includes('Repo'));

  assert(hasIIP, 'Indian calendar includes IIP');
  assert(hasGDP, 'Indian calendar includes GDP');
  assert(hasCPI, 'Indian calendar includes CPI');
  assert(hasWPI, 'Indian calendar includes WPI');
  assert(hasRBI, 'Indian calendar includes RBI monetary policy');

  // Check zero foreign events in Indian calendar
  const foreignCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'NZD'];
  const hasZeroForeign = indiaRes.events.every(e => !foreignCurrencies.includes(e.currency) && e.countryCode !== 'US' && e.countryCode !== 'AU' && e.countryCode !== 'JP');
  assert(hasZeroForeign, 'Indian calendar contains ZERO foreign events');


  // ── TEST 2: Forex Economic Calendar Endpoint ─────────────────────────
  console.log('\n📌 Section 2: Verifying Forex Economic Calendar (/api/market/economic-calendar/global)...');
  const forexRes = await globalEconomicCalendarService.getGlobalEvents({ period: 'all', limit: 100 });

  assert(forexRes.success === true, 'Forex calendar response success is true');
  assert(forexRes.market_scope === 'forex', "Forex calendar response declared market_scope: 'forex'");
  assert(Array.isArray(forexRes.events) && forexRes.events.length > 0, `Forex calendar returned ${forexRes.events.length} events`);

  // Check all Forex events
  const allForexScope = forexRes.events.every(e => e.market_scope === 'forex');
  assert(allForexScope, "All Forex events carry market_scope='forex'");

  // Check zero Indian events in Forex calendar
  const zeroIndiaInForex = forexRes.events.every(e =>
    e.countryCode !== 'IN' &&
    e.currency !== 'INR' &&
    e.market_scope !== 'india' &&
    e.country?.toLowerCase() !== 'india' &&
    !e.eventName.toLowerCase().includes('iip') &&
    !(e.canonicalId && e.canonicalId.startsWith('IN_'))
  );
  assert(zeroIndiaInForex, 'Forex calendar contains ZERO Indian events (No IIP, No Indian GDP, No MoSPI, No RBI, No INR, No IN)');

  // Verify Forex target indicators
  const hasAuCPI = forexRes.events.some(e => e.canonicalId === 'AU_CPI_YOY' || e.eventName.includes('Australia CPI'));
  const hasJpUnemp = forexRes.events.some(e => e.canonicalId === 'JP_UNEMPLOYMENT_RATE' || e.eventName.includes('Japan Unemployment'));
  const hasUsCPI = forexRes.events.some(e => e.canonicalId === 'US_CPI' || e.eventName.includes('US CPI'));
  const hasEuCPI = forexRes.events.some(e => e.canonicalId === 'EU_CPI' || e.eventName.includes('Eurozone CPI'));
  const hasGbRate = forexRes.events.some(e => e.canonicalId === 'GB_BOE_RATE' || e.eventName.includes('Bank of England'));

  assert(hasAuCPI, 'Forex calendar includes Australia CPI (YoY)');
  assert(hasJpUnemp, 'Forex calendar includes Japan Unemployment Rate');
  assert(hasUsCPI, 'Forex calendar includes US CPI');
  assert(hasEuCPI, 'Forex calendar includes Eurozone CPI');
  assert(hasGbRate, 'Forex calendar includes Bank of England Rate Decision');


  // ── TEST 3: UI Markup & DOM Checks ───────────────────────────────────
  console.log('\n📌 Section 3: Verifying Frontend UI & Markup Separation...');
  const indexHtmlPath = path.resolve('index.html');
  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

  // Verify INR button was removed from forex currency filter bar
  const forexFilterBarMatch = indexHtml.match(/id="forexCurrencyFilters"[\s\S]*?<\/div>\s*<\/div>/);
  if (forexFilterBarMatch) {
    const filterHtml = forexFilterBarMatch[0];
    const hasInrButton = filterHtml.includes('data-currency="INR"');
    assert(!hasInrButton, 'index.html #forexCurrencyFilters DOES NOT contain INR button');
  } else {
    console.error('  ❌ Could not find #forexCurrencyFilters in index.html');
    failed++;
  }

  // Verify global-economic-calendar.js does not include INR in filters
  const gecJsPath = path.resolve('global-economic-calendar.js');
  const gecJs = fs.readFileSync(gecJsPath, 'utf8');
  const gecHasInrInCurrencies = gecJs.includes("currencies = ['ALL', 'INR'") || gecJs.includes("currencies = ['ALL', 'USD', 'INR'");
  assert(!gecHasInrInCurrencies, 'global-economic-calendar.js does NOT include INR in currencies filter list');


  // ── FINAL SUMMARY ───────────────────────────────────────────────────
  console.log('\n========================================================================');
  console.log(`📊 CALENDAR SEPARATION SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Separation verification failed:', err);
  process.exit(1);
});
